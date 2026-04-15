import { toOptionalString } from "./shared";

interface ConfigWithApiKey {
  apiKey?: string;
  api_key?: string;
}

interface ConfigWithBaseUrl {
  baseUrl?: string;
  base_url?: string;
}

export function resolveDashScopeApiKey(config: ConfigWithApiKey): string | null {
  return toOptionalString(config.apiKey ?? config.api_key ?? process.env.DASHSCOPE_API_KEY)?.trim() ?? null;
}

export function resolveFalApiKey(config: ConfigWithApiKey): string | null {
  return toOptionalString(config.apiKey ?? config.api_key ?? process.env.FAL_KEY)?.trim() ?? null;
}

export function resolveOpenAiApiKey(config: ConfigWithApiKey): string | null {
  return toOptionalString(config.apiKey ?? config.api_key ?? process.env.OPENAI_API_KEY)?.trim() ?? null;
}

export function resolveOpenAiBaseUrl(config: ConfigWithBaseUrl): string | null {
  return toOptionalString(config.baseUrl ?? config.base_url ?? process.env.OPENAI_BASE_URL)?.trim() ?? null;
}
