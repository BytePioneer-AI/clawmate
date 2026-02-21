import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import { asRecord, asStringRecord, toFiniteNumber, toOptionalString, hasOwn, isLikelyBase64, asImageDataUrl } from "./shared";

interface OpenAICompatibleProviderConfig extends ProviderConfig {
  name: string;
  baseUrl?: string;
  base_url?: string;
  apiKey?: string;
  api_key?: string;
  model?: string;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  extra_body?: Record<string, unknown>;
  timeoutMs?: number;
  timeout_ms?: number;
}

interface NormalizedConfig {
  name: string;
  apiKey: string;
  baseURL: string | null;
  model: string;
  headers: Record<string, string>;
  extraBody: Record<string, unknown>;
  timeoutMs: number;
}

function normalizeConfig(config: OpenAICompatibleProviderConfig): NormalizedConfig {
  const name = config.name;
  const apiKey = toOptionalString(config.apiKey ?? config.api_key ?? process.env.OPENAI_API_KEY)?.trim();
  const baseURL = toOptionalString(config.baseUrl ?? config.base_url ?? process.env.OPENAI_BASE_URL)?.trim() ?? null;
  const timeoutMs = toFiniteNumber(config.timeoutMs ?? config.timeout_ms);
  const model = toOptionalString(config.model)?.trim() ?? "gpt-image-1.5";

  if (!apiKey) {
    throw new ProviderError(`provider ${name} 缺少 apiKey（或环境变量 OPENAI_API_KEY）`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  return {
    name,
    apiKey,
    baseURL,
    model,
    headers: asStringRecord(config.headers),
    extraBody: {
      ...asRecord(config.extra_body),
      ...asRecord(config.extraBody),
    },
    timeoutMs: timeoutMs !== null && timeoutMs > 0 ? timeoutMs : 180000,
  };
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function normalizeBase64(text: string): string {
  return text.replace(/\s+/g, "").replace(/^[("'\s]+|[)"'\s]+$/g, "");
}

function trimPotentialUrl(text: string): string {
  return text.replace(/[),.;!?]+$/, "");
}

function pickImageFromString(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  if (isDataImageUrl(text) || /^https?:\/\//i.test(text)) {
    return trimPotentialUrl(text);
  }

  const wrappedDataUrl = text.match(/\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/i);
  if (wrappedDataUrl) {
    return wrappedDataUrl[1];
  }

  const wrappedUrl = text.match(/\((https?:\/\/[^\s)]+)\)/i);
  if (wrappedUrl) {
    return trimPotentialUrl(wrappedUrl[1]);
  }

  const directDataUrl = text.match(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/i);
  if (directDataUrl) {
    return directDataUrl[1];
  }

  const embeddedUrl = text.match(/https?:\/\/\S+/i);
  if (embeddedUrl) {
    return trimPotentialUrl(embeddedUrl[0]);
  }

  const rawBase64 = text.match(/([A-Za-z0-9+/]{100,}={0,2})/);
  if (rawBase64) {
    const normalized = normalizeBase64(rawBase64[1]);
    if (isLikelyBase64(normalized)) {
      return asImageDataUrl(normalized);
    }
  }

  return null;
}

function extractImageUrl(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) {
    return null;
  }

  if (typeof value === "string") {
    return pickImageFromString(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractImageUrl(item, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractImageUrl(record.b64_json, depth + 1) ??
      extractImageUrl(record.url, depth + 1) ??
      extractImageUrl(record.image_url, depth + 1) ??
      extractImageUrl(record.text, depth + 1) ??
      extractImageUrl(record.content, depth + 1);
    if (direct) {
      return direct;
    }

    for (const key of ["message", "choices", "output", "data", "result", "delta"]) {
      const nested = extractImageUrl(record[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function collectImageUrls(value: unknown, result: Set<string>, depth = 0): void {
  if (depth > 8 || value == null) {
    return;
  }

  if (typeof value === "string") {
    const candidate = pickImageFromString(value);
    if (candidate) {
      result.add(candidate);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageUrls(item, result, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["b64_json", "url", "image_url", "text", "content", "message", "choices", "output", "data", "result", "delta"]) {
      collectImageUrls(record[key], result, depth + 1);
    }
  }
}

function resolveReferenceImages(body: Record<string, unknown>, payload: GenerateRequest): string[] {
  const byPriority: unknown[] = [];
  byPriority.push(body.image_url);
  byPriority.push(body.input_image);
  byPriority.push(body.image);
  byPriority.push(body.images);
  const resolved = new Set<string>();
  for (const candidate of byPriority) {
    collectImageUrls(candidate, resolved);
  }
  if (resolved.size > 0) {
    return Array.from(resolved);
  }
  if (Array.isArray(payload.referenceImageDataUrls) && payload.referenceImageDataUrls.length > 0) {
    return payload.referenceImageDataUrls;
  }
  return [payload.referenceImageDataUrl];
}

function buildChatBody(
  config: NormalizedConfig,
  payload: GenerateRequest,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const body: Record<string, unknown> = {
    ...config.extraBody,
  };

  const prompt = toOptionalString(body.prompt)?.trim() ?? payload.prompt.trim();
  if (!prompt) {
    throw new ProviderError(`provider ${config.name} prompt 不能为空`, {
      code: "PROVIDER_REQUEST_INVALID",
    });
  }

  if (!hasOwn(body, "model")) {
    body.model = config.model;
  }
  if (!hasOwn(body, "stream")) {
    body.stream = false;
  } else {
    body.stream = false;
  }

  if (!hasOwn(body, "messages")) {
    const referenceImages = resolveReferenceImages(body, payload);
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const referenceImage of referenceImages) {
      content.push({ type: "image_url", image_url: { url: referenceImage } });
    }
    body.messages = [
      {
        role: "user",
        content,
      },
    ];
  }

  delete body.prompt;
  delete body.image;
  delete body.images;
  delete body.image_url;
  delete body.input_image;
  delete body.mask;

  return body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
}

function mapSDKError(error: unknown, providerName: string): never {
  if (error instanceof APIConnectionTimeoutError) {
    throw new ProviderError(`${providerName} 请求超时`, {
      code: "PROVIDER_TIMEOUT",
      transient: true,
    });
  }

  if (error instanceof APIConnectionError) {
    throw new ProviderError(`${providerName} 网络请求失败: ${error.message}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: true,
      details: {
        cause: error.cause instanceof Error ? error.cause.message : null,
      },
    });
  }

  if (error instanceof APIError) {
    throw new ProviderError(`${providerName} HTTP 请求失败: ${error.status ?? "unknown"} ${error.message}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: error.status === 429 || (typeof error.status === "number" && error.status >= 500),
      requestId: error.requestID ?? null,
      details: {
        status: error.status ?? null,
        error: error.error ?? null,
      },
    });
  }

  throw new ProviderError(`${providerName} 请求失败: ${error instanceof Error ? error.message : String(error)}`, {
    code: "PROVIDER_HTTP_FAILED",
    transient: true,
  });
}

export function createOpenAICompatibleProvider(
  rawConfig: OpenAICompatibleProviderConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): ProviderAdapter {
  if (typeof fetchImpl !== "function") {
    throw new ProviderError(`provider ${rawConfig.name} 缺少 fetch 实现`, {
      code: "PROVIDER_FETCH_MISSING",
    });
  }

  const config = normalizeConfig(rawConfig);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL ?? undefined,
    timeout: config.timeoutMs,
    maxRetries: 0,
    defaultHeaders: config.headers,
    fetch: fetchImpl,
  });

  return {
    name: config.name,

    async generate(payload: GenerateRequest) {
      try {
        const body = buildChatBody(config, payload);
        const { data, request_id } = await client.chat.completions.create(body).withResponse();
        const imageUrl = extractImageUrl(data);

        if (!imageUrl) {
          throw new ProviderError(`provider ${config.name} 响应中未找到图片 URL`, {
            code: "PROVIDER_PARSE_ERROR",
            requestId: request_id,
            details: { response: data },
          });
        }

        return {
          imageUrl,
          requestId: request_id,
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }
        mapSDKError(error, config.name);
      }
    },
  };
}
