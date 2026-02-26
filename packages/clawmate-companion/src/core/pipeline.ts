import path from "node:path";
import { loadConfig } from "./config";
import { loadCharacterAssets, readReferenceImagesBase64 } from "./characters";
import { resolveTimeState } from "./time-state";
import { createProviderRegistry } from "./providers/registry";
import { buildProviderOrder } from "./router";
import { ClawMateError, ProviderError } from "./errors";
import { createLogger } from "./logger";
import type {
  ClawMateConfig,
  GenerateRequest,
  GenerateSelfieResult,
  Logger,
  ProviderRegistry,
  SelfieMode,
} from "./types";

interface ErrorLike {
  message?: string;
  code?: string;
  transient?: boolean;
  requestId?: string | null;
  details?: unknown;
}

export interface GenerateSelfieOptions {
  logger?: Logger;
  now?: Date;
  config?: ClawMateConfig;
  configPath?: string;
  cwd?: string;
  characterId?: string;
  provider?: string;
  prompt?: string;
  mode?: SelfieMode;
  eventSource?: string;
  adapters?: ProviderRegistry;
  fetchImpl?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveProviderPollOptions(
  config: ClawMateConfig,
  providerName: string,
): { pollIntervalMs: number; pollTimeoutMs: number } {
  const providerConfig = config.providers?.[providerName];
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) {
    return {
      pollIntervalMs: config.pollIntervalMs,
      pollTimeoutMs: config.pollTimeoutMs,
    };
  }

  const record = providerConfig as Record<string, unknown>;
  const providerPollIntervalMs = toFiniteNumber(record.pollIntervalMs ?? record.poll_interval_ms);
  const providerPollTimeoutMs = toFiniteNumber(record.pollTimeoutMs ?? record.poll_timeout_ms);

  return {
    pollIntervalMs: providerPollIntervalMs !== null && providerPollIntervalMs > 0 ? providerPollIntervalMs : config.pollIntervalMs,
    pollTimeoutMs: providerPollTimeoutMs !== null && providerPollTimeoutMs > 0 ? providerPollTimeoutMs : config.pollTimeoutMs,
  };
}

function imageMimeType(referencePath: string): string {
  const ext = path.extname(referencePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

function asErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== "object") {
    return {};
  }
  return error as ErrorLike;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function errorRequestId(error: unknown): string | null {
  const requestId = asErrorLike(error).requestId;
  return typeof requestId === "string" ? requestId : null;
}

function errorDetails(error: unknown): unknown {
  const details = asErrorLike(error).details;
  return details ?? null;
}

export async function generateSelfie(options: GenerateSelfieOptions = {}): Promise<GenerateSelfieResult> {
  const logger = options.logger ?? createLogger();
  const now = options.now ?? new Date();

  const loaded = options.config
    ? { configPath: options.configPath ?? "inline", config: options.config }
    : await loadConfig({
        configPath: options.configPath,
        cwd: options.cwd,
      });

  const config = loaded.config;
  const characterId = options.characterId ?? config.selectedCharacter;

  const character = await loadCharacterAssets({
    characterId,
    characterRoot: config.characterRoot,
    userCharacterRoot: config.userCharacterRoot,
    cwd: options.cwd ?? process.cwd(),
    allowMissingReference: true,
  });

  const referencePaths = (character.referencePaths ?? []).filter((referencePath) => typeof referencePath === "string" && referencePath.trim().length > 0);
  const referenceImageBase64List = referencePaths.length > 0 ? await readReferenceImagesBase64(referencePaths) : [];
  const referenceImageDataUrls = referenceImageBase64List.map((base64, index) => {
    const mimeType = imageMimeType(referencePaths[index] ?? referencePaths[0] ?? "");
    return `data:${mimeType};base64,${base64}`;
  });
  const referenceImageBase64 = referenceImageBase64List[0] ?? "";
  const referenceImageDataUrl = referenceImageDataUrls[0] ?? "";

  if (referencePaths.length === 0) {
    logger.warn("角色缺少参考图，降级为纯提示词生图", {
      characterId,
    });
  }

  const timeState = resolveTimeState(character.meta.timeStates, now);
  const resolvedMode: SelfieMode = options.mode ?? "direct";
  const prompt = options.prompt ?? "";

  const registry = options.adapters ?? createProviderRegistry(config.providers, options.fetchImpl);
  const availableProviders = Object.entries(registry)
    .filter(([, provider]) => provider.available !== false)
    .map(([name]) => name);

  const providerOrder = buildProviderOrder({
    explicitProvider: options.provider,
    config,
    availableProviders,
  });

  const request: GenerateRequest = {
    characterId,
    prompt,
    mode: resolvedMode,
    referencePath: referencePaths[0] ?? character.referencePath ?? "",
    referencePaths,
    referenceImageBase64,
    referenceImageBase64List,
    referenceImageDataUrl,
    referenceImageDataUrls,
    timeState: timeState.key,
    meta: {
      state: timeState.key,
      roleName: typeof character.meta.name === "string" && character.meta.name ? character.meta.name : characterId,
      eventSource: options.eventSource ?? "skill",
    },
  };

  let lastError: unknown = null;
  for (const providerName of providerOrder) {
    const provider = registry[providerName];
    if (!provider) {
      lastError = new ClawMateError(`provider 不存在: ${providerName}`, {
        code: "PROVIDER_NOT_FOUND",
      });
      continue;
    }
    const pollOptions = resolveProviderPollOptions(config, providerName);

    let attemptError: unknown = null;
    for (let attempt = 1; attempt <= config.retry.maxAttempts; attempt += 1) {
      try {
        logger.info("调用 provider 接口（完整提示词）", {
          provider: provider.name,
          attempt,
          maxAttempts: config.retry.maxAttempts,
          mode: request.mode ?? null,
          timeState: request.timeState,
          prompt: request.prompt,
        });

        const generateResult = await provider.generate(request, pollOptions);
        const requestId = generateResult.requestId ?? null;
        const imageUrl = generateResult.imageUrl ?? null;
        if (!imageUrl) {
          throw new ProviderError(generateResult.message ?? `provider ${provider.name} 返回成功但缺少 imageUrl`, {
            code: "PROVIDER_IMAGE_URL_MISSING",
            requestId,
          });
        }

        logger.info("生图成功", {
          provider: providerName,
          requestId: requestId ?? null,
        });

        return {
          ok: true,
          provider: providerName,
          requestId: requestId ?? null,
          imageUrl,
          prompt,
          mode: resolvedMode,
          characterId,
          timeState: timeState.key,
        };
      } catch (error) {
        attemptError = error;
        const info = asErrorLike(error);
        const canRetry = Boolean(info.transient) && attempt < config.retry.maxAttempts;
        logger.warn("provider 尝试失败", {
          provider: provider.name,
          attempt,
          canRetry,
          code: info.code,
          requestId: info.requestId ?? null,
          details: info.details ?? null,
        });

        if (!canRetry) {
          break;
        }

        await sleep(config.retry.backoffMs * attempt);
      }
    }

    lastError = attemptError ?? new ProviderError("未知 provider 错误", { code: "PROVIDER_UNKNOWN" });
    const info = asErrorLike(lastError);
    logger.error("provider 生成失败", {
      provider: providerName,
      code: info.code ?? "UNKNOWN",
      transient: Boolean(info.transient),
      requestId: info.requestId ?? null,
      message: info.message ?? errorMessage(lastError),
      details: errorDetails(lastError),
    });

    const isLast = providerName === providerOrder[providerOrder.length - 1];
    if (isLast || !config.fallback.enabled) {
      break;
    }
  }

  return {
    ok: false,
    degraded: true,
    provider: providerOrder[providerOrder.length - 1] ?? null,
    requestId: errorRequestId(lastError),
    message: config.degradeMessage,
    error: lastError ? errorMessage(lastError) : "unknown",
  };
}
