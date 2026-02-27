import fs from "node:fs/promises";
import path from "node:path";
import { ClawMateError } from "./errors";
import { loadCharacterAssets } from "./characters";
import type { CreateCharacterInput, CreateCharacterResult } from "./types";

const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;

function validateCharacterId(id: string): void {
  if (!CHARACTER_ID_PATTERN.test(id)) {
    throw new ClawMateError(
      `角色 ID 格式无效: "${id}"。要求：2-30 位，仅小写字母、数字和连字符，首尾必须是字母或数字。`,
      { code: "INVALID_CHARACTER_ID" },
    );
  }
}

export interface CreateCharacterOptions {
  input: CreateCharacterInput;
  userCharacterRoot: string;
  /** Built-in character root, needed to resolve "existing" reference images */
  characterRoot?: string;
  cwd?: string;
}

function validateCreateInput(input: CreateCharacterInput): void {
  validateCharacterId(input.characterId);

  if (input.meta.id !== input.characterId) {
    throw new ClawMateError(
      `meta.id ("${input.meta.id}") 与 characterId ("${input.characterId}") 不一致`,
      { code: "CHARACTER_ID_MISMATCH" },
    );
  }

  if (!input.meta.name || typeof input.meta.name !== "string") {
    throw new ClawMateError("meta.name 不能为空", { code: "CHARACTER_NAME_REQUIRED" });
  }

  if (!input.characterPrompt || typeof input.characterPrompt !== "string") {
    throw new ClawMateError("characterPrompt 不能为空", { code: "CHARACTER_PROMPT_REQUIRED" });
  }

  const ref = input.referenceImage;
  if (!ref) {
    return;
  }
  if (typeof ref !== "object") {
    throw new ClawMateError("referenceImage 格式无效", { code: "INVALID_REFERENCE_SOURCE" });
  }
  if (ref.source === "existing") {
    if (!ref.characterId || typeof ref.characterId !== "string") {
      throw new ClawMateError("referenceImage.characterId 不能为空", { code: "REFERENCE_IMAGE_CHARACTER_ID_REQUIRED" });
    }
  } else if (ref.source === "local") {
    if (!ref.path || typeof ref.path !== "string") {
      throw new ClawMateError("referenceImage.path 不能为空", { code: "REFERENCE_IMAGE_PATH_REQUIRED" });
    }
  } else if (ref.source === "none") {
    return;
  } else {
    throw new ClawMateError('referenceImage.source 必须是 "existing"、"local" 或 "none"', { code: "INVALID_REFERENCE_SOURCE" });
  }
}

async function resolveReferenceSourcePath(
  input: CreateCharacterInput,
  characterRoot: string | undefined,
  userCharacterRoot: string,
  cwd: string | undefined,
): Promise<string> {
  const ref = input.referenceImage;
  if (!ref || ref.source === "none") {
    return "";
  }
  if (ref.source === "existing") {
    const assets = await loadCharacterAssets({
      characterId: ref.characterId,
      characterRoot,
      userCharacterRoot,
      cwd,
    });
    return assets.referencePath;
  }

  // source === "local"
  const localPath = ref.path;
  try {
    await fs.access(localPath);
  } catch {
    throw new ClawMateError(`参考图文件不存在: ${localPath}`, {
      code: "REFERENCE_IMAGE_NOT_FOUND",
      details: { path: localPath },
    });
  }
  return localPath;
}

function normalizeReferenceFileName(sourcePath: string): string {
  const ext = path.extname(sourcePath).toLowerCase();
  const safeExt = ext ? ext : ".png";
  return `reference-01${safeExt}`;
}

export async function createCharacter(options: CreateCharacterOptions): Promise<CreateCharacterResult> {
  const { input, userCharacterRoot, characterRoot, cwd } = options;

  validateCreateInput(input);

  const targetDir = path.join(userCharacterRoot, input.characterId);

  // Check if already exists
  try {
    await fs.access(targetDir);
    throw new ClawMateError(`角色目录已存在: ${targetDir}`, {
      code: "CHARACTER_ALREADY_EXISTS",
      details: { characterId: input.characterId, targetDir },
    });
  } catch (error) {
    if (error instanceof ClawMateError) throw error;
    // ENOENT is expected — directory doesn't exist yet
  }

  const sourcePath = await resolveReferenceSourcePath(input, characterRoot, userCharacterRoot, cwd);

  await fs.mkdir(targetDir, { recursive: true });

  const metaPath = path.join(targetDir, "meta.json");
  const promptPath = path.join(targetDir, "character-prompt.md");

  const metaJson = JSON.stringify(input.meta, null, 2) + "\n";
  await fs.writeFile(metaPath, metaJson, "utf8");
  await fs.writeFile(promptPath, input.characterPrompt.trim() + "\n", "utf8");
  const files = ["meta.json", "character-prompt.md"];

  if (sourcePath) {
    const imageDir = path.join(targetDir, "images");
    await fs.mkdir(imageDir, { recursive: true });
    const refFileName = normalizeReferenceFileName(sourcePath);
    const refPath = path.join(imageDir, refFileName);
    await fs.copyFile(sourcePath, refPath);
    files.push(`images/${refFileName}`);
  }

  return {
    ok: true,
    characterId: input.characterId,
    characterDir: targetDir,
    files,
  };
}
