import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import {
  asRecord,
  asStringRecord,
  toOptionalString,
  toFiniteNumber,
  toStringArray,
  buildRequestUrl,
  hasOwn,
  isLikelyBase64,
  asImageDataUrl,
  collectImageCandidates,
  dedupeNonEmptyStrings,
  firstStringByPaths,
  resolveImageUrl,
} from "./shared";

interface VolcengineArkProviderConfig extends ProviderConfig {
  name: string;
  baseUrl?: string;
  base_url?: string;
  endpoint?: string;
  apiKey?: string;
  api_key?: string;
  model?: string;
  size?: string;
  responseFormat?: string;
  response_format?: string;
  watermark?: boolean;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  extra_body?: Record<string, unknown>;
  responseUrlPaths?: string[];
  response_url_paths?: string[];
  requestIdPaths?: string[];
  request_id_paths?: string[];
  timeoutMs?: number;
  timeout_ms?: number;
}

interface NormalizedConfig {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  size: string | null;
  responseFormat: string;
  watermark: boolean;
  headers: Record<string, string>;
  extraBody: Record<string, unknown>;
  responseUrlPaths: string[];
  requestIdPaths: string[];
  timeoutMs: number;
}

interface HttpResult {
  body: unknown;
  requestIdFromHeader: string | null;
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function extractImage(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) {
    return null;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) {
      return text;
    }
    if (isLikelyBase64(text)) {
      return asImageDataUrl(text);
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractImage(item, depth + 1);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractImage(record.url, depth + 1) ??
      extractImage(record.image_url, depth + 1) ??
      extractImage(record.b64_json, depth + 1);
    if (direct) {
      return direct;
    }

    for (const key of ["data", "output", "images", "result"]) {
      const resolved = extractImage(record[key], depth + 1);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function defaultResponseUrlPaths(): string[] {
  return ["data.0.url", "data.0.b64_json"];
}

function defaultRequestIdPaths(): string[] {
  return ["request_id", "requestId", "id"];
}

function resolveReferenceImages(body: Record<string, unknown>, payload: GenerateRequest): string[] {
  const resolved = new Set<string>();
  for (const candidate of [body.image, body.images, body.input_image, body.image_url]) {
    collectImageCandidates(candidate, resolved);
  }
  if (resolved.size > 0) {
    return Array.from(resolved);
  }
  const fallback = dedupeNonEmptyStrings(
    Array.isArray(payload.referenceImageDataUrls) && payload.referenceImageDataUrls.length > 0
      ? payload.referenceImageDataUrls
      : [payload.referenceImageDataUrl],
  );
  return fallback;
}

function normalizeConfig(config: VolcengineArkProviderConfig): NormalizedConfig {
  const name = config.name;
  const baseUrl = toOptionalString(config.baseUrl ?? config.base_url)?.trim() ?? "https://ark.cn-beijing.volces.com";
  const endpoint = toOptionalString(config.endpoint)?.trim() ?? "/api/v3/images/generations";
  const apiKey = toOptionalString(config.apiKey ?? config.api_key)?.trim();
  const model = toOptionalString(config.model)?.trim();
  const timeoutMs = toFiniteNumber(config.timeoutMs ?? config.timeout_ms);
  const responseUrlPaths = toStringArray(config.responseUrlPaths ?? config.response_url_paths);
  const requestIdPaths = toStringArray(config.requestIdPaths ?? config.request_id_paths);

  if (!apiKey) {
    throw new ProviderError(`provider ${name} 缺少 apiKey`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  if (!model) {
    throw new ProviderError(`provider ${name} 缺少 model`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  return {
    name,
    url: buildRequestUrl(baseUrl, endpoint),
    apiKey,
    model,
    size: toOptionalString(config.size)?.trim() ?? null,
    responseFormat: toOptionalString(config.responseFormat ?? config.response_format)?.trim() ?? "url",
    watermark: toBoolean(config.watermark) ?? false,
    headers: asStringRecord(config.headers),
    extraBody: {
      ...asRecord(config.extra_body),
      ...asRecord(config.extraBody),
    },
    responseUrlPaths: responseUrlPaths.length > 0 ? responseUrlPaths : defaultResponseUrlPaths(),
    requestIdPaths: requestIdPaths.length > 0 ? requestIdPaths : defaultRequestIdPaths(),
    timeoutMs: timeoutMs !== null && timeoutMs > 0 ? timeoutMs : 180000,
  };
}

function buildRequestBody(config: NormalizedConfig, payload: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...config.extraBody,
    model: config.model,
    prompt: payload.prompt,
  };

  const referenceImages = resolveReferenceImages(body, payload);
  if (!hasOwn(body, "image") && referenceImages.length > 0) {
    const limited = referenceImages.slice(0, 14);
    body.image = limited.length <= 1 ? limited[0] : limited;
  }
  delete body.images;
  if (config.size && !hasOwn(body, "size")) {
    body.size = config.size;
  }
  if (!hasOwn(body, "response_format")) {
    body.response_format = config.responseFormat;
  }
  if (!hasOwn(body, "watermark")) {
    body.watermark = config.watermark;
  }

  return body;
}

async function postJsonWithTimeout(options: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<HttpResult> {
  const { url, headers, body, timeoutMs, fetchImpl } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`volcengine-ark 请求超时: ${timeoutMs}ms`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        details: { url, timeoutMs },
      });
    }

    throw new ProviderError(`volcengine-ark 请求失败: ${error instanceof Error ? error.message : String(error)}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: true,
      details: { url },
    });
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (response.ok && contentType.startsWith("image/")) {
    const binary = Buffer.from(await response.arrayBuffer()).toString("base64");
    return {
      body: {
        data: [
          {
            b64_json: binary,
          },
        ],
      },
      requestIdFromHeader: response.headers.get("x-request-id"),
    };
  }

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    throw new ProviderError(`volcengine-ark HTTP 请求失败: ${response.status}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: response.status >= 500 || response.status === 429,
      requestId: response.headers.get("x-request-id"),
      details: {
        status: response.status,
        url,
        body: parsed,
      },
    });
  }

  const errorLike = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).error : null;
  if (errorLike && typeof errorLike === "object") {
    const errorRecord = errorLike as Record<string, unknown>;
    throw new ProviderError(
      `volcengine-ark 业务错误: ${toOptionalString(errorRecord.message) ?? "unknown"}`,
      {
        code: "PROVIDER_HTTP_FAILED",
        transient: false,
        requestId: response.headers.get("x-request-id"),
        details: {
          url,
          body: parsed,
        },
      },
    );
  }

  return {
    body: parsed,
    requestIdFromHeader: response.headers.get("x-request-id"),
  };
}

export function createVolcengineArkProvider(
  rawConfig: VolcengineArkProviderConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): ProviderAdapter {
  if (typeof fetchImpl !== "function") {
    throw new ProviderError(`provider ${rawConfig.name} 缺少 fetch 实现`, {
      code: "PROVIDER_FETCH_MISSING",
    });
  }

  const config = normalizeConfig(rawConfig);

  return {
    name: config.name,

    async generate(payload: GenerateRequest) {
      const body = buildRequestBody(config, payload);
      const response = await postJsonWithTimeout({
        url: config.url,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
        body,
        timeoutMs: config.timeoutMs,
        fetchImpl,
      });

      const requestId =
        firstStringByPaths(response.body, config.requestIdPaths) ?? toOptionalString(response.requestIdFromHeader);
      const imageUrl = resolveImageUrl(response.body, config.responseUrlPaths, (value) => extractImage(value));

      if (!imageUrl) {
        throw new ProviderError(`provider ${config.name} 响应中未找到图片 URL`, {
          code: "PROVIDER_PARSE_ERROR",
          requestId,
          details: {
            response: response.body,
            responseUrlPaths: config.responseUrlPaths,
          },
        });
      }

      return { imageUrl, requestId };
    },
  };
}
