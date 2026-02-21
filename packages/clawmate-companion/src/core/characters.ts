import fs from "node:fs/promises";
import path from "node:path";
import { ClawMateError } from "./errors";
import type { CharacterAssets, CharacterMeta, CharacterListEntry } from "./types";

const REQUIRED_FILES = ["meta.json", "character-prompt.md"] as const;
const REFERENCE_IMAGE_DIR = "images";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const LEGACY_REFERENCE_NAMES = ["reference.png", "reference.jpg", "reference.jpeg", "reference.webp", "reference.gif"];

export interface LoadCharacterAssetsOptions {
  characterId?: string;
  characterRoot?: string;
  userCharacterRoot?: string;
  cwd?: string;
}

function toMeta(value: unknown): CharacterMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CharacterMeta;
}

export function resolveCharacterRoot(characterRoot: string, cwd = process.cwd()): string {
  if (path.isAbsolute(characterRoot)) {
    return characterRoot;
  }

  return path.join(cwd, characterRoot);
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new ClawMateError(`角色资产缺失: ${label}`, {
      code: "CHARACTER_ASSET_MISSING",
      details: { filePath, label },
    });
  }
}

async function dirHasMeta(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, "meta.json"));
    return true;
  } catch {
    return false;
  }
}

function isSupportedImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function resolveReferenceImagePaths(characterDir: string, characterId: string): Promise<string[]> {
  const imageDir = path.join(characterDir, REFERENCE_IMAGE_DIR);
  try {
    const entries = await fs.readdir(imageDir, { withFileTypes: true });
    const imagePaths = entries
      .filter((entry) => entry.isFile() && isSupportedImageFile(entry.name))
      .map((entry) => path.join(imageDir, entry.name))
      .sort((a, b) => a.localeCompare(b));
    if (imagePaths.length > 0) {
      return imagePaths;
    }
  } catch {
    // fall through to legacy fallback
  }

  const legacyPaths = LEGACY_REFERENCE_NAMES.map((name) => path.join(characterDir, name));
  const existingLegacyPaths: string[] = [];
  for (const filePath of legacyPaths) {
    try {
      await fs.access(filePath);
      existingLegacyPaths.push(filePath);
    } catch {
      // continue checking next candidate
    }
  }
  if (existingLegacyPaths.length > 0) {
    return existingLegacyPaths;
  }

  throw new ClawMateError(`角色参考图缺失: ${characterId}`, {
    code: "CHARACTER_ASSET_MISSING",
    details: {
      characterId,
      imageDir,
      expected: `请在角色目录下创建 ${REFERENCE_IMAGE_DIR}/ 并放入至少 1 张图片`,
    },
  });
}

export async function loadCharacterAssets(options: LoadCharacterAssetsOptions = {}): Promise<CharacterAssets> {
  const characterId = options.characterId;
  const characterRoot = options.characterRoot ?? path.join("skills", "clawmate-companion", "assets", "characters");
  const cwd = options.cwd ?? process.cwd();

  if (!characterId) {
    throw new ClawMateError("未提供角色 id", {
      code: "CHARACTER_ID_REQUIRED",
    });
  }

  const builtInDir = path.join(resolveCharacterRoot(characterRoot, cwd), characterId);
  const candidates: string[] = [];
  if (options.userCharacterRoot) {
    candidates.push(path.join(options.userCharacterRoot, characterId));
  }
  candidates.push(builtInDir);

  let characterDir: string | null = null;
  for (const candidate of candidates) {
    if (await dirHasMeta(candidate)) {
      characterDir = candidate;
      break;
    }
  }

  if (!characterDir) {
    throw new ClawMateError(`角色不存在: ${characterId}`, {
      code: "CHARACTER_NOT_FOUND",
      details: { characterId, searched: candidates },
    });
  }

  for (const required of REQUIRED_FILES) {
    await assertFileExists(path.join(characterDir, required), required);
  }

  const [rawMeta, characterPrompt] = await Promise.all([
    fs.readFile(path.join(characterDir, "meta.json"), "utf8"),
    fs.readFile(path.join(characterDir, "character-prompt.md"), "utf8"),
  ]);

  let meta: CharacterMeta;
  try {
    meta = toMeta(JSON.parse(rawMeta));
  } catch (error) {
    throw new ClawMateError(`角色 meta.json 解析失败: ${characterId}`, {
      code: "CHARACTER_META_PARSE_ERROR",
      details: {
        characterId,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  const referencePaths = await resolveReferenceImagePaths(characterDir, characterId);

  return {
    id: characterId,
    characterDir,
    referencePath: referencePaths[0],
    referencePaths,
    characterPrompt: characterPrompt.trim(),
    meta,
  };
}

export async function readReferenceImageBase64(referencePath: string): Promise<string> {
  const data = await fs.readFile(referencePath);
  return data.toString("base64");
}

export async function readReferenceImagesBase64(referencePaths: string[]): Promise<string[]> {
  if (!Array.isArray(referencePaths) || referencePaths.length === 0) {
    throw new ClawMateError("参考图列表不能为空", {
      code: "CHARACTER_ASSET_MISSING",
    });
  }
  const imageBuffers = await Promise.all(referencePaths.map((referencePath) => fs.readFile(referencePath)));
  return imageBuffers.map((data) => data.toString("base64"));
}

export interface ListCharactersOptions {
  characterRoot: string;
  userCharacterRoot?: string;
  cwd?: string;
}

async function scanCharacterDir(dir: string, builtIn: boolean): Promise<CharacterListEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const results: CharacterListEntry[] = [];
  for (const entry of entries) {
    const charDir = path.join(dir, entry);
    const metaPath = path.join(charDir, "meta.json");
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = toMeta(JSON.parse(raw));
      results.push({
        id: entry,
        name: typeof meta.name === "string" ? meta.name : entry,
        englishName: typeof meta.englishName === "string" ? meta.englishName : undefined,
        descriptionZh: typeof meta.descriptionZh === "string" ? meta.descriptionZh : undefined,
        descriptionEn: typeof meta.descriptionEn === "string" ? meta.descriptionEn : undefined,
        builtIn,
        characterDir: charDir,
      });
    } catch {
      // skip directories without valid meta.json
    }
  }
  return results;
}

export async function listCharacters(options: ListCharactersOptions): Promise<CharacterListEntry[]> {
  const cwd = options.cwd ?? process.cwd();
  const builtInRoot = resolveCharacterRoot(options.characterRoot, cwd);

  const seenIds = new Set<string>();
  const result: CharacterListEntry[] = [];

  // User characters first (higher priority)
  if (options.userCharacterRoot) {
    const userEntries = await scanCharacterDir(options.userCharacterRoot, false);
    for (const entry of userEntries) {
      seenIds.add(entry.id);
      result.push(entry);
    }
  }

  // Built-in characters (skip duplicates)
  const builtInEntries = await scanCharacterDir(builtInRoot, true);
  for (const entry of builtInEntries) {
    if (!seenIds.has(entry.id)) {
      result.push(entry);
    }
  }

  return result;
}
