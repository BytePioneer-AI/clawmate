import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ClawMateError } from "./errors";
import type {
  ClawMateConfig,
  FallbackPolicy,
  ProviderConfig,
  ProvidersConfig,
  RetryPolicy,
  ProactiveSelfieConfig,
  TtsConfig,
} from "./types";

const DEFAULT_CHARACTER_ROOT = path.join("skills", "clawmate-companion", "assets", "characters");

export function defaultUserCharacterRoot(): string {
  const openClawHome = process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
  return path.join(openClawHome, "clawmeta");
}

export const DEFAULT_CONFIG_PATH = path.join("config", "clawmate.config.json");

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
}

export interface LoadedConfig {
  configPath: string;
  config: ClawMateConfig;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFallback(fallback: unknown): FallbackPolicy {
  const source = asObject(fallback);
  const orderSource = source.order;
  return {
    enabled: Boolean(source.enabled),
    order: Array.isArray(orderSource)
      ? orderSource
          .filter((item): item is string => typeof item === "string")
          .filter(Boolean)
      : [],
  };
}

function normalizeRetry(retry: unknown): RetryPolicy {
  const source = asObject(retry);
  const maxAttempts = toFiniteNumber(source.maxAttempts);
  const backoffMs = toFiniteNumber(source.backoffMs);
  return {
    maxAttempts: maxAttempts !== null && Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 2,
    backoffMs: backoffMs !== null && backoffMs > 0 ? backoffMs : 500,
  };
}

function normalizeProviders(value: unknown): ProvidersConfig {
  const source = asObject(value);
  const normalized: ProvidersConfig = {};

  for (const [name, rawConfig] of Object.entries(source)) {
    if (rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)) {
      normalized[name] = rawConfig as ProviderConfig;
    }
  }

  return normalized;
}

function normalizeProactiveSelfie(value: unknown): ProactiveSelfieConfig {
  const source = asObject(value);
  const probability = toFiniteNumber(source.probability);
  return {
    enabled: Boolean(source.enabled),
    probability: probability !== null && probability >= 0 && probability <= 1 ? probability : 0.1,
  };
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/+$/, "") : fallback;
}

function normalizeTts(value: unknown): TtsConfig {
  const source = asObject(value);
  const official = asObject(source.official);
  const clone = asObject(source.clone);
  const legacyBaseUrl = normalizeBaseUrl(source.baseUrl, "https://dashscope.aliyuncs.com/api/v1");
  const provider =
    source.provider === "aliyun-clone" || source.provider === "aliyun-official"
      ? source.provider
      : "aliyun-official";
  const outputFormat = source.outputFormat === "ogg" || source.outputFormat === "opus" ? source.outputFormat : "wav";

  return {
    enabled: Boolean(source.enabled),
    provider,
    outputFormat,
    degradeMessage:
      typeof source.degradeMessage === "string" && source.degradeMessage.trim()
        ? source.degradeMessage.trim()
        : "语音暂时发送失败，我先打字陪你。",
    official: {
      model:
        typeof official.model === "string" && official.model.trim()
          ? official.model.trim()
          : typeof source.model === "string" && source.model.trim()
            ? source.model.trim()
            : "qwen3-tts-flash",
      voice:
        typeof official.voice === "string" && official.voice.trim()
          ? official.voice.trim()
          : typeof source.voice === "string" && source.voice.trim()
            ? source.voice.trim()
            : "Chelsie",
      languageType:
        typeof official.languageType === "string" && official.languageType.trim()
          ? official.languageType.trim()
          : typeof source.languageType === "string" && source.languageType.trim()
            ? source.languageType.trim()
            : "Chinese",
      apiKey:
        typeof official.apiKey === "string" && official.apiKey.trim()
          ? official.apiKey.trim()
          : normalizeText(source.apiKey),
      baseUrl: normalizeBaseUrl(official.baseUrl, legacyBaseUrl),
    },
    clone: {
      apiKey:
        typeof clone.apiKey === "string" && clone.apiKey.trim()
          ? clone.apiKey.trim()
          : normalizeText(source.apiKey),
      baseUrl: normalizeBaseUrl(clone.baseUrl, legacyBaseUrl),
      targetModel:
        typeof clone.targetModel === "string" && clone.targetModel.trim() ? clone.targetModel.trim() : "cosyvoice-v1",
      modelId: normalizeText(clone.modelId),
      synthesisModel:
        typeof clone.synthesisModel === "string" && clone.synthesisModel.trim()
          ? clone.synthesisModel.trim()
          : typeof clone.targetModel === "string" && clone.targetModel.trim()
            ? clone.targetModel.trim()
            : "cosyvoice-v1",
      speaker: normalizeText(clone.speaker),
      promptAudioUrl: normalizeText(clone.promptAudioUrl),
      promptText: normalizeText(clone.promptText),
      statusUrl: normalizeBaseUrl(clone.statusUrl, legacyBaseUrl),
    },
  };
}

export function normalizeConfig(raw: unknown): ClawMateConfig {
  const source = asObject(raw);
  const providers = normalizeProviders(source.providers);
  const pollIntervalMs = toFiniteNumber(source.pollIntervalMs);
  const pollTimeoutMs = toFiniteNumber(source.pollTimeoutMs);

  return {
    selectedCharacter:
      typeof source.selectedCharacter === "string" && source.selectedCharacter
        ? source.selectedCharacter
        : "brooke",
    characterRoot:
      typeof source.characterRoot === "string" && source.characterRoot ? source.characterRoot : DEFAULT_CHARACTER_ROOT,
    defaultProvider:
      typeof source.defaultProvider === "string" && source.defaultProvider
        ? source.defaultProvider
        : Object.keys(providers)[0] ?? "mock",
    fallback: normalizeFallback(source.fallback),
    retry: normalizeRetry(source.retry),
    pollIntervalMs: pollIntervalMs !== null && pollIntervalMs > 0 ? pollIntervalMs : 1200,
    pollTimeoutMs: pollTimeoutMs !== null && pollTimeoutMs > 0 ? pollTimeoutMs : 180000,
    degradeMessage:
      typeof source.degradeMessage === "string" && source.degradeMessage
        ? source.degradeMessage
        : "图片暂时生成失败，我先陪你聊会儿。",
    providers,
    proactiveSelfie: normalizeProactiveSelfie(source.proactiveSelfie),
    tts: normalizeTts(source.tts),
    userCharacterRoot:
      typeof source.userCharacterRoot === "string" && source.userCharacterRoot
        ? source.userCharacterRoot
        : defaultUserCharacterRoot(),
  };
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? process.env.CLAWMATE_CONFIG ?? path.join(cwd, DEFAULT_CONFIG_PATH);

  let rawText: string;
  try {
    rawText = await fs.readFile(configPath, "utf8");
  } catch (error) {
    throw new ClawMateError(`无法读取配置文件: ${configPath}`, {
      code: "CONFIG_NOT_FOUND",
      details: {
        configPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new ClawMateError(`配置文件 JSON 无法解析: ${configPath}`, {
      code: "CONFIG_PARSE_ERROR",
      details: {
        configPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return {
    configPath,
    config: normalizeConfig(parsed),
  };
}
