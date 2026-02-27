import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { generateSelfie } from "./core/pipeline";
import { prepareSelfie } from "./core/prepare";
import { loadCharacterAssets, listCharacters } from "./core/characters";
import { createCharacter } from "./core/character-creator";
import { createLogger } from "./core/logger";
import { normalizeConfig, defaultUserCharacterRoot } from "./core/config";
import type { ClawMateConfig, CreateCharacterInput, GenerateSelfieFailure, GenerateSelfieResult, SelfieMode } from "./core/types";

interface PluginConfigInput {
  selectedCharacter?: string;
  characterRoot?: string;
  userCharacterRoot?: string;
  defaultProvider?: string;
  fallback?: unknown;
  retry?: unknown;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  degradeMessage?: string;
  providers?: Record<string, unknown>;
  proactiveSelfie?: { enabled?: boolean; probability?: number };
}

interface PrepareParams {
  mode: SelfieMode;
  scene?: string;
  action?: string;
  emotion?: string;
  details?: string;
}

interface ToolParams {
  prompt?: string;
  mode?: SelfieMode;
}

interface OpenClawPluginApiLike {
  resolvePath: (input: string) => string;
  pluginConfig?: Record<string, unknown>;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
  on: (hookName: string, handler: (event: unknown, ctx: unknown) => Promise<unknown> | unknown) => void;
  registerTool: (tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (toolCallId: string, params: ToolParams) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }) => void;
}

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;
const HTTP_URL_PATTERN = /^https?:\/\//i;
const RAW_BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const URL_FILE_EXT_PATTERN = /^\.[a-zA-Z0-9]{1,8}$/;
const MIME_IMAGE_PATTERN = /^image\/[a-zA-Z0-9.+-]+$/i;
const SOUL_SECTION_BEGIN = "<!-- CLAWMATE-COMPANION:PERSONA:BEGIN -->";
const SOUL_SECTION_END = "<!-- CLAWMATE-COMPANION:PERSONA:END -->";

function fileExtByMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") {
    return "jpg";
  }
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/gif") {
    return "gif";
  }
  return "img";
}

function detectImageMimeFromBase64(base64: string): string {
  if (base64.startsWith("/9j/")) {
    return "image/jpeg";
  }
  if (base64.startsWith("iVBORw0KGgo")) {
    return "image/png";
  }
  if (base64.startsWith("R0lGOD")) {
    return "image/gif";
  }
  if (base64.startsWith("UklGR")) {
    return "image/webp";
  }
  return "image/png";
}

function normalizeRawBase64(text: string): string {
  return text.replace(/\s+/g, "").replace(/^[("'\s]+|[)"'\s]+$/g, "");
}

function isLikelyRawBase64(text: string): boolean {
  const normalized = normalizeRawBase64(text);
  return normalized.length >= 64 && normalized.length % 4 === 0 && RAW_BASE64_PATTERN.test(normalized);
}

function sanitizeExt(ext: string): string {
  if (!URL_FILE_EXT_PATTERN.test(ext)) {
    return ".img";
  }
  return ext.toLowerCase();
}

function resolveGeneratedImageDir(now = new Date()): string {
  const openClawHome = process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
  const day = now.toISOString().slice(0, 10);
  return path.join(openClawHome, "media", "clawmate-generated", day);
}

function resolveSoulMdPath(): string {
  const openClawHome = process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
  return path.join(openClawHome, "workspace", "SOUL.md");
}

function buildSoulPersonaSection(characterId: string, personaText: string): string {
  return [
    SOUL_SECTION_BEGIN,
    `## ClawMate Companion Persona (${characterId})`,
    "",
    personaText.trim(),
    SOUL_SECTION_END,
  ].join("\n");
}

function previewText(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...(truncated)`;
}

function extractCharacterIdFromSoul(soulContent: string): string | null {
  const beginIdx = soulContent.indexOf(SOUL_SECTION_BEGIN);
  if (beginIdx === -1) return null;
  const afterBegin = soulContent.slice(beginIdx + SOUL_SECTION_BEGIN.length);
  const match = afterBegin.match(/^[\r\n]+## ClawMate Companion Persona \(([^)]+)\)/);
  return match ? match[1] : null;
}

async function ensurePersonaInjectedToSoul(
  characterId: string,
  personaText: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const trimmedPersona = personaText.trim();
  if (!trimmedPersona) {
    return;
  }

  const soulPath = resolveSoulMdPath();
  await fs.mkdir(path.dirname(soulPath), { recursive: true });

  let currentSoul = "";
  try {
    currentSoul = await fs.readFile(soulPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
    currentSoul = "";
  }

  const existingCharacterId = extractCharacterIdFromSoul(currentSoul);

  if (existingCharacterId === characterId) {
    return;
  }

  const section = buildSoulPersonaSection(characterId, trimmedPersona);

  if (existingCharacterId !== null) {
    // 角色已切换，替换旧角色段
    const beginIdx = currentSoul.indexOf(SOUL_SECTION_BEGIN);
    const endIdx = currentSoul.indexOf(SOUL_SECTION_END);
    if (beginIdx !== -1 && endIdx !== -1) {
      const before = currentSoul.slice(0, beginIdx).trimEnd();
      const after = currentSoul.slice(endIdx + SOUL_SECTION_END.length).trimStart();
      const parts = [before, section, after].filter(Boolean);
      await fs.writeFile(soulPath, parts.join("\n\n") + "\n", "utf8");
      logger.info("已替换 SOUL.md 中的角色提示词", { soulPath, from: existingCharacterId, to: characterId });
      return;
    }
  }

  // 无已有段落，追加
  const base = currentSoul.trimEnd();
  const nextSoul = base ? `${base}\n\n${section}\n` : `${section}\n`;
  await fs.writeFile(soulPath, nextSoul, "utf8");
  logger.info("已将角色提示词注入 SOUL.md", { soulPath, characterId });
}

function shortRequestToken(requestId: string | null): string {
  if (!requestId) {
    return Math.random().toString(36).slice(2, 10);
  }
  return crypto.createHash("sha1").update(requestId, "utf8").digest("hex").slice(0, 12);
}

function buildLocalImagePath(requestId: string | null, extWithDot: string): string {
  const tempDir = resolveGeneratedImageDir();
  const safeExt = sanitizeExt(extWithDot);
  const token = shortRequestToken(requestId);
  const ts = Date.now().toString(36);
  const fileName = `clawmate-${ts}-${token}${safeExt}`;
  return path.join(tempDir, fileName);
}

function resolveExistingLocalPath(imageRef: string): string | null {
  const trimmed = imageRef.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("file://")) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  return null;
}

async function persistDataUrlImage(imageUrl: string, requestId: string | null): Promise<string> {
  const matched = imageUrl.match(DATA_URL_PATTERN);
  if (!matched) {
    throw new Error("not a data URL image");
  }

  const [, mimeType, base64Data] = matched;
  const ext = fileExtByMime(mimeType);
  const filePath = buildLocalImagePath(requestId, `.${ext}`);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

async function persistRawBase64Image(imageBase64: string, requestId: string | null): Promise<string> {
  const normalized = normalizeRawBase64(imageBase64);
  if (!isLikelyRawBase64(normalized)) {
    throw new Error("not a raw base64 image");
  }
  const mimeType = detectImageMimeFromBase64(normalized);
  const ext = fileExtByMime(mimeType);
  const filePath = buildLocalImagePath(requestId, `.${ext}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(normalized, "base64"));
  return filePath;
}

async function persistRemoteImage(imageUrl: string, requestId: string | null): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`download image failed: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.trim().toLowerCase() ?? "";
  let ext = "";
  if (MIME_IMAGE_PATTERN.test(contentType)) {
    ext = `.${fileExtByMime(contentType)}`;
  } else {
    const pathname = new URL(imageUrl).pathname;
    ext = path.extname(pathname) || ".img";
  }
  const filePath = buildLocalImagePath(requestId, ext || ".img");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, data);
  return filePath;
}

async function persistImageToLocal(imageRef: string, requestId: string | null): Promise<string> {
  const trimmed = imageRef.trim();
  if (!trimmed) {
    throw new Error("empty image reference");
  }

  const localPath = resolveExistingLocalPath(trimmed);
  if (localPath) {
    await fs.access(localPath);
    return localPath;
  }

  if (DATA_URL_PATTERN.test(trimmed)) {
    return persistDataUrlImage(trimmed, requestId);
  }

  if (HTTP_URL_PATTERN.test(trimmed)) {
    return persistRemoteImage(trimmed, requestId);
  }

  if (isLikelyRawBase64(trimmed)) {
    return persistRawBase64Image(trimmed, requestId);
  }

  throw new Error("unsupported image reference format");
}

function resolvePluginRoot(api: OpenClawPluginApiLike): string {
  // OpenClaw resolvePath is user-path based, not plugin-root based.
  // Resolve from current module location to avoid runtime path drift.
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "..");
}

function isPathInside(parentDir: string, targetPath: string): boolean {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function resolveRuntimeConfig(api: OpenClawPluginApiLike): ClawMateConfig {
  const pluginConfig = toRecord(api.pluginConfig) as PluginConfigInput;
  const pluginRoot = resolvePluginRoot(api);
  const defaultUserRoot = defaultUserCharacterRoot();
  const defaults: PluginConfigInput = {
    selectedCharacter: "brooke",
    characterRoot: path.join(pluginRoot, "skills", "clawmate-companion", "assets", "characters"),
    userCharacterRoot: defaultUserRoot,
    defaultProvider: "mock",
    fallback: { enabled: false, order: [] },
    retry: { maxAttempts: 2, backoffMs: 500 },
    pollIntervalMs: 1200,
    pollTimeoutMs: 180000,
    degradeMessage: "图片暂时生成失败，我先陪你聊会儿。",
    providers: {
      mock: {
        type: "mock",
        pendingPolls: 1
      }
    },
    proactiveSelfie: { enabled: false, probability: 0.1 },
  };

  const merged = {
    ...defaults,
    ...pluginConfig,
  };
  const normalized = normalizeConfig(merged);

  if (pluginConfig.characterRoot) {
    normalized.characterRoot = path.isAbsolute(pluginConfig.characterRoot)
      ? pluginConfig.characterRoot
      : path.join(pluginRoot, pluginConfig.characterRoot);
  }

  if (pluginConfig.userCharacterRoot) {
    normalized.userCharacterRoot = path.isAbsolute(pluginConfig.userCharacterRoot)
      ? pluginConfig.userCharacterRoot
      : path.join(pluginRoot, pluginConfig.userCharacterRoot);
  }

  // Never store custom characters under plugin install directory.
  // Plugin directory may be replaced during update.
  if (isPathInside(pluginRoot, normalized.userCharacterRoot)) {
    normalized.userCharacterRoot = defaultUserRoot;
  }

  return normalized;
}

async function formatResult(result: GenerateSelfieResult, logger: ReturnType<typeof createLogger>): Promise<string> {
  if (result.ok) {
    const imageUrl = await persistImageToLocal(result.imageUrl, result.requestId);

    return JSON.stringify({
      ok: true,
      imageUrl,
      imageMarkdown: `![clawmate-selfie](${imageUrl})`,
      mediaLine: `MEDIA: ${imageUrl}`,
      provider: result.provider,
      requestId: result.requestId,
      characterId: result.characterId,
      timeState: result.timeState,
      mode: result.mode,
    });
  }

  const failure = result as GenerateSelfieFailure;
  return JSON.stringify({
    ok: false,
    degraded: true,
    provider: failure.provider,
    requestId: failure.requestId,
    message: failure.message,
    error: failure.error,
  });
}

export default function registerClawMateCompanion(api: OpenClawPluginApiLike): void {
  const pluginRoot = resolvePluginRoot(api);
  const logger = createLogger("clawmate-plugin", { useStderr: true });
  let prepareCalled = false;
  let characterPrepareCalled = false;

  // 注册阶段仅同步注册 Hook/Tool，不执行异步初始化。
  api.on("before_agent_start", async () => {
    prepareCalled = false;
    characterPrepareCalled = false;
    try {
      const config = resolveRuntimeConfig(api);
      const character = await loadCharacterAssets({
        characterId: config.selectedCharacter,
        characterRoot: config.characterRoot,
        userCharacterRoot: config.userCharacterRoot,
        cwd: pluginRoot,
        allowMissingReference: true,
      });
      const personaText = character.characterPrompt;

      // 静态人格一次性落盘到 SOUL.md（已注入则自动跳过）
      await ensurePersonaInjectedToSoul(config.selectedCharacter, personaText, logger);

      // Level 2: 随机触发主动发图
      if (config.proactiveSelfie.enabled && Math.random() < config.proactiveSelfie.probability) {
        logger.info("proactiveSelfie 触发", { probability: config.proactiveSelfie.probability });
        return {
          prependContext: "结合当前对话内容和用户的状态，在回应用户之后，使用 clawmate-companion-selfie skill 生成一张自拍表示关心。",
        };
      }
    } catch (error) {
      logger.warn("before_agent_start 注入失败", {
        message: error instanceof Error ? error.message : String(error),
        pluginRoot,
      });
    }
  });

  api.registerTool({
    name: "clawmate_prepare_selfie",
    description: "提取用户意图，返回角色时间状态、拍摄模式指南和提示词模板，供模型生成高质量提示词",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: ["mirror", "direct"], description: "拍摄模式（必填）" },
        scene: { type: "string", description: "用户指定场景（可选）" },
        action: { type: "string", description: "用户指定动作（可选）" },
        emotion: { type: "string", description: "用户指定情绪（可选）" },
        details: { type: "string", description: "其他细节（可选）" },
      },
    },
    async execute(_toolCallId: string, params: PrepareParams) {
      const config = resolveRuntimeConfig(api);
      const resolvedMode: SelfieMode = params.mode === "mirror" ? "mirror" : "direct";
      logger.info("Tool1 输入", {
        tool: "clawmate_prepare_selfie",
        params,
        resolvedMode,
      });
      try {
        const result = await prepareSelfie({ mode: resolvedMode, config, cwd: pluginRoot });
        prepareCalled = true;
        logger.info("Tool1 输出", {
          tool: "clawmate_prepare_selfie",
          result,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        logger.error("Tool1 输出（失败）", {
          tool: "clawmate_prepare_selfie",
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          }],
        };
      }
    },
  });

  api.registerTool({
    name: "clawmate_generate_selfie",
    description: "接收模型生成的完整英文提示词，调用图像生成服务生成 ClawMate 自拍图并返回结构化结果",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["prompt", "mode"],
      properties: {
        prompt: { type: "string", description: "模型生成的完整英文提示词（必填）" },
        mode: { type: "string", enum: ["mirror", "direct"], description: "拍摄模式（必填）" },
      },
    },
    async execute(_toolCallId: string, params: ToolParams) {
      if (!prepareCalled) {
        logger.warn("generate_selfie 被跳过 prepare 直接调用，拒绝执行");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "必须先调用 clawmate_prepare_selfie 获取参考包，再调用本工具。请先调用 clawmate_prepare_selfie。",
            }),
          }],
        };
      }
      const config = resolveRuntimeConfig(api);
      const resolvedMode: SelfieMode = params.mode === "mirror" ? "mirror" : "direct";
      let result: GenerateSelfieResult;
      try {
        result = await generateSelfie({
          config,
          cwd: pluginRoot,
          prompt: params.prompt,
          mode: resolvedMode,
          eventSource: "plugin_tool",
          logger,
        });
      } catch (error) {
        result = {
          ok: false,
          degraded: true,
          provider: null,
          requestId: null,
          message: config.degradeMessage,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      let text: string;
      try {
        text = await formatResult(result, logger);
      } catch (error) {
        const remoteImageUrl =
          result.ok && HTTP_URL_PATTERN.test(result.imageUrl.trim()) ? result.imageUrl.trim() : null;
        logger.error("图片本地化失败", {
          provider: result.ok ? result.provider : null,
          requestId: result.ok ? result.requestId ?? null : null,
          imageUrl: remoteImageUrl,
          message: error instanceof Error ? error.message : String(error),
        });
        text = JSON.stringify({
          ok: false,
          degraded: true,
          provider: result.ok ? result.provider : null,
          requestId: result.ok ? result.requestId ?? null : null,
          message: config.degradeMessage,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    },
  });

  api.registerTool({
    name: "clawmate_prepare_character",
    description:
      "准备创建自定义角色：返回角色定义 schema、已有角色样例（meta + characterPrompt）、可用角色列表、referenceImage 选项说明。【重要】调用本工具后，模型必须根据用户描述生成完整角色草稿（包括 characterId、meta、characterPrompt 全文、referenceImage），将草稿完整展示给用户审阅，等待用户明确确认或修改后，才能调用 clawmate_create_character 写盘。禁止在用户确认前直接调用 clawmate_create_character。referenceImage 允许不上传。",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["description"],
      properties: {
        description: { type: "string", description: "用户对想要创建的角色的自然语言描述" },
      },
    },
    async execute(_toolCallId: string, rawParams: ToolParams) {
      const params = rawParams as unknown as { description?: string };
      const config = resolveRuntimeConfig(api);
      try {
        // Pick example character based on style hint in user description
        const desc = (params.description ?? "").toLowerCase();
        const isAnime = /anime|动漫|二次元|插画|漫画/.test(desc);
        const exampleCharacterId = isAnime ? "brooke-anime" : "brooke";

        const exampleCharacter = await loadCharacterAssets({
          characterId: exampleCharacterId,
          characterRoot: config.characterRoot,
          userCharacterRoot: config.userCharacterRoot,
          cwd: pluginRoot,
          allowMissingReference: true,
        });

        const characters = await listCharacters({
          characterRoot: config.characterRoot,
          userCharacterRoot: config.userCharacterRoot,
          cwd: pluginRoot,
        });

        const result = {
          schema: {
            characterId: "2-30 chars, lowercase alphanumeric and hyphens, must start/end with alphanumeric",
            meta: {
              id: "must match characterId",
              name: "角色中文名（必填）",
              englishName: "角色英文名（可选）",
              style: '画风风格（可选）："photorealistic"（写实，默认）或 "anime"（动漫）',
              descriptionZh: "角色中文简介（可选）",
              descriptionEn: "角色英文简介（可选）",
              timeStates: "时间状态定义（建议提供）：可使用 morning / afternoon / evening / night 模板；若用户明确拒绝可省略",
            },
            characterPrompt: "角色人格提示词（必填，markdown 格式，描述角色性格、说话风格、背景故事等）",
            referenceImage: '可选：{ source: "existing", characterId: "..." } 或 { source: "local", path: "/absolute/path/to/image.png" } 或 { source: "none" }',
          },
          timeStatesTemplate: {
            morning: {
              range: "06:00-11:00",
              scene: "campus cafe or classroom",
              outfit: "casual daytime outfit",
              lighting: "soft natural daylight",
            },
            afternoon: {
              range: "11:00-17:00",
              scene: "library, studio, or outdoor campus area",
              outfit: "light casual outfit suitable for study/work",
              lighting: "bright neutral daylight",
            },
            evening: {
              range: "17:00-22:00",
              scene: "dorm room, art corner, or bookstore",
              outfit: "relaxed indoor outfit",
              lighting: "warm indoor lighting",
            },
            night: {
              range: "22:00-06:00",
              scene: "quiet desk by window or cozy bedroom corner",
              outfit: "comfortable homewear",
              lighting: "dim warm lamp or soft ambient light",
            },
          },
          example: {
            meta: exampleCharacter.meta,
            characterPrompt: exampleCharacter.characterPrompt,
          },
          availableCharacters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            builtIn: c.builtIn,
          })),
          referenceImageOptions: [
            '从已有角色复制: { "source": "existing", "characterId": "<已有角色id>" }',
            '使用本地图片: { "source": "local", "path": "/absolute/path/to/reference.png" }',
            '不上传参考图: { "source": "none" }',
          ],
          rules: [
            "characterId 必须全局唯一",
            "meta.id 必须与 characterId 一致",
            'meta.style 可选，值为 "photorealistic"（写实）或 "anime"（动漫），不填默认 photorealistic',
            "characterPrompt 用 markdown 编写，描述角色完整人格",
            "第一步草稿必须包含 timeStates；如果用户未提供具体时段信息，基于用户描述自动生成合理的 morning/afternoon/evening/night",
            "referenceImage 可选；不上传时建议优先使用动漫风格（anime）",
            '禁止将 referenceImage 默认填为 {"source":"none"}；只有用户明确表示"不上传参考图"时才能使用',
            "严格按两步执行：第一步先确认 meta + characterPrompt + timeStates；第二步再单独确认 referenceImage",
            '若用户已明确指定风格（如"动漫风格"），直接写入 meta.style，不要重复询问同一信息',
          ],
          noReferenceImageGuidance: {
            allowed: true,
            recommendation: "可以不上传参考图；不上传时建议优先使用动漫风格（anime）。",
          },
          userDescription: params.description ?? "",
          nextStep: `严格按两步执行。

【第一步】根据用户描述和 example 样例，直接生成首版完整草稿，使用以下固定格式展示给用户：

角色基础信息（meta）：
\`\`\`json
(包含 id, name, englishName, style, descriptionZh, descriptionEn, timeStates 全部字段)
\`\`\`

角色提示词（characterPrompt）：
\`\`\`markdown
(完整的角色人格提示词，参考 example.characterPrompt 的结构和详细程度)
\`\`\`

先让用户确认或修改以上内容，不要先问 referenceImage。

【第二步】在第一步确认后，再单独询问 referenceImage 来源（existing/local/none）。referenceImage 绝不能默认使用 {source:none}，除非用户明确说不上传参考图。若用户已明确说动漫风格或写实风格，直接采用，不要重复确认。用户确认最终草稿后，才能调用 clawmate_create_character。`,
        };


        characterPrepareCalled = true;
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          }],
        };
      }
    },
  });

  api.registerTool({
    name: "clawmate_create_character",
    description:
      "创建自定义角色：接收完整角色定义（characterId, meta, characterPrompt, referenceImage 可选），校验后写入用户角色目录。必须先调用 clawmate_prepare_character 获取 schema 和样例。",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["characterId", "meta", "characterPrompt"],
      properties: {
        characterId: { type: "string", description: "角色唯一标识（必填）" },
        meta: {
          type: "object",
          description: "角色元数据（必填）",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            englishName: { type: "string" },
            style: { type: "string", enum: ["photorealistic", "anime"], description: '画风风格，默认 photorealistic' },
            descriptionZh: { type: "string" },
            descriptionEn: { type: "string" },
            timeStates: { type: "object" },
          },
          required: ["id", "name"],
        },
        characterPrompt: { type: "string", description: "角色人格提示词 markdown（必填）" },
        referenceImage: {
          type: "object",
          description: '参考图来源（可选）',
          properties: {
            source: { type: "string", enum: ["existing", "local", "none"] },
            characterId: { type: "string" },
            path: { type: "string" },
          },
          required: ["source"],
        },
      },
    },
    async execute(_toolCallId: string, rawParams: ToolParams) {
      if (!characterPrepareCalled) {
        logger.warn("create_character 被跳过 prepare_character 直接调用，拒绝执行");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "必须先调用 clawmate_prepare_character 获取 schema 和样例，再调用本工具。请先调用 clawmate_prepare_character。",
            }),
          }],
        };
      }
      const params = rawParams as unknown as CreateCharacterInput;
      const config = resolveRuntimeConfig(api);
      try {
        const result = await createCharacter({
          input: params,
          userCharacterRoot: config.userCharacterRoot,
          characterRoot: config.characterRoot,
          cwd: pluginRoot,
        });

        characterPrepareCalled = false;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...result,
              hint: `角色 "${params.characterId}" 创建成功！可以通过修改配置 selectedCharacter 为 "${params.characterId}" 来切换到新角色。`,
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          }],
        };
      }
    },
  });
}
