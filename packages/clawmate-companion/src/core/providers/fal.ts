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
  collectImageCandidates,
  dedupeNonEmptyStrings,
  firstStringByPaths,
  resolveImageUrl,
} from "./shared";

interface FalProviderConfig extends ProviderConfig {
  name: string;
  baseUrl?: string;
  base_url?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  api_key?: string;
  authScheme?: string;
  auth_scheme?: string;
  imageField?: string;
  image_field?: string;
  promptField?: string;
  prompt_field?: string;
  numImages?: number;
  num_images?: number;
  aspectRatio?: string;
  aspect_ratio?: string;
  outputFormat?: string;
  output_format?: string;
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
  authScheme: string;
  imageField: string;
  promptField: string;
  numImages: number | null;
  aspectRatio: string | null;
  outputFormat: string | null;
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

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeEndpoint(raw: FalProviderConfig): string {
  const explicitEndpoint = toOptionalString(raw.endpoint)?.trim();
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const model = toOptionalString(raw.model)?.trim();
  if (model) {
    if (/^https?:\/\//i.test(model)) {
      return model;
    }
    return model.startsWith("/") ? model : `/${model}`;
  }

  return "/xai/grok-imagine-image/edit";
}

function defaultResponseUrlPaths(): string[] {
  return ["images.0.url", "data.images.0.url", "output.images.0.url", "image.url"];
}

function defaultRequestIdPaths(): string[] {
  return ["request_id", "requestId", "id"];
}

function normalizeConfig(config: FalProviderConfig): NormalizedConfig {
  const name = config.name;
  const baseUrl = toOptionalString(config.baseUrl ?? config.base_url)?.trim() ?? "https://fal.run";
  const endpoint = normalizeEndpoint(config);
  const apiKey = toOptionalString(config.apiKey ?? config.api_key ?? process.env.FAL_KEY)?.trim();
  const timeoutMs = toFiniteNumber(config.timeoutMs ?? config.timeout_ms);
  const numImages = toFiniteNumber(config.numImages ?? config.num_images);
  const responseUrlPaths = toStringArray(config.responseUrlPaths ?? config.response_url_paths);
  const requestIdPaths = toStringArray(config.requestIdPaths ?? config.request_id_paths);

  if (!apiKey) {
    throw new ProviderError(`provider ${name} 缺少 apiKey（或环境变量 FAL_KEY）`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  return {
    name,
    url: buildRequestUrl(baseUrl, endpoint, "fal"),
    apiKey,
    authScheme: toOptionalString(config.authScheme ?? config.auth_scheme)?.trim() ?? "Key",
    imageField: toOptionalString(config.imageField ?? config.image_field)?.trim() ?? "image_url",
    promptField: toOptionalString(config.promptField ?? config.prompt_field)?.trim() ?? "prompt",
    numImages: numImages !== null ? clampInt(numImages, 1, 8) : 1,
    aspectRatio: toOptionalString(config.aspectRatio ?? config.aspect_ratio)?.trim() ?? null,
    outputFormat: toOptionalString(config.outputFormat ?? config.output_format)?.trim() ?? null,
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

function extractImage(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) {
    return null;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) {
      return text;
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
    const direct = extractImage(record.url, depth + 1) ?? extractImage(record.image, depth + 1);
    if (direct) {
      return direct;
    }
    for (const key of ["images", "data", "output", "result"]) {
      const resolved = extractImage(record[key], depth + 1);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function resolveReferenceImages(body: Record<string, unknown>, payload: GenerateRequest): string[] {
  const resolved = new Set<string>();
  for (const candidate of [body.image_url, body.input_image, body.image, body.images]) {
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

function buildRequestBody(config: NormalizedConfig, payload: GenerateRequest): Record<string, unknown> {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new ProviderError(`provider ${config.name} prompt 不能为空`, {
      code: "PROVIDER_REQUEST_INVALID",
    });
  }

  const body: Record<string, unknown> = {
    ...config.extraBody,
  };

  if (!hasOwn(body, config.promptField)) {
    body[config.promptField] = prompt;
  }
  const referenceImages = resolveReferenceImages(body, payload);
  if (!hasOwn(body, config.imageField) && referenceImages.length > 0) {
    body[config.imageField] = referenceImages.length === 1 ? referenceImages[0] : referenceImages;
  }
  if (!hasOwn(body, "num_images") && config.numImages !== null) {
    body.num_images = config.numImages;
  }
  if (!hasOwn(body, "aspect_ratio") && config.aspectRatio) {
    body.aspect_ratio = config.aspectRatio;
  }
  if (!hasOwn(body, "output_format") && config.outputFormat) {
    body.output_format = config.outputFormat;
  }

  return body;
}

function normalizeErrorMessage(parsed: unknown): string | null {
  if (!parsed) {
    return null;
  }

  if (typeof parsed === "string") {
    return parsed;
  }

  if (typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const direct =
    toOptionalString(record.error) ??
    toOptionalString(record.message) ??
    toOptionalString(record.detail) ??
    toOptionalString(record.reason);
  if (direct) {
    return direct;
  }

  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    return (
      toOptionalString(nested.message) ??
      toOptionalString(nested.detail) ??
      toOptionalString(nested.reason) ??
      null
    );
  }

  return null;
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
      throw new ProviderError(`fal 请求超时: ${timeoutMs}ms`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        details: { url, timeoutMs },
      });
    }

    throw new ProviderError(`fal 请求失败: ${error instanceof Error ? error.message : String(error)}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: true,
      details: { url },
    });
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = rawText;
  }

  const requestIdFromHeader = response.headers.get("x-fal-request-id") ?? response.headers.get("x-request-id");

  if (!response.ok) {
    throw new ProviderError(`fal HTTP 请求失败: ${response.status}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: response.status >= 500 || response.status === 429,
      requestId: requestIdFromHeader,
      details: {
        status: response.status,
        url,
        body: parsed,
      },
    });
  }

  const message = normalizeErrorMessage(parsed);
  if (message && typeof parsed === "object" && parsed && "images" in (parsed as Record<string, unknown>) === false) {
    // fal 结果里可能带 revised_prompt 等字段，这里只在明显业务报错时抛错
    const record = parsed as Record<string, unknown>;
    if ("error" in record || "detail" in record) {
      throw new ProviderError(`fal 业务错误: ${message}`, {
        code: "PROVIDER_HTTP_FAILED",
        transient: false,
        requestId: requestIdFromHeader,
        details: {
          url,
          body: parsed,
        },
      });
    }
  }

  return {
    body: parsed,
    requestIdFromHeader,
  };
}

export function createFalProvider(
  rawConfig: FalProviderConfig,
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
          authorization: `${config.authScheme} ${config.apiKey}`,
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
