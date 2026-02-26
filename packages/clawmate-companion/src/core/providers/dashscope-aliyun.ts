import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import {
  asRecord,
  asStringRecord,
  toOptionalString,
  toFiniteNumber,
  toStringArray,
  buildRequestUrl,
  collectImageCandidates,
  dedupeNonEmptyStrings,
  firstStringByPaths,
  resolveImageUrl,
} from "./shared";

interface DashScopeAliyunProviderConfig extends ProviderConfig {
  name: string;
  baseUrl?: string;
  base_url?: string;
  endpoint?: string;
  apiKey?: string;
  api_key?: string;
  /**
   * 可选模型（当前适配）：
   * - wan2.6-image
   * - qwen-image-edit-max
   */
  model?: string;
  n?: number;
  size?: string;
  negativePrompt?: string;
  negative_prompt?: string;
  promptExtend?: boolean;
  prompt_extend?: boolean;
  watermark?: boolean;
  seed?: number;
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
  n: number;
  size: string | null;
  negativePrompt: string | null;
  promptExtend: boolean | null;
  watermark: boolean;
  seed: number | null;
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

function isWanImageModel(model: string): boolean {
  return /^wan[\w.-]*image$/i.test(model);
}

function isQwenImageEditModel(model: string): boolean {
  return /^qwen-image-edit/i.test(model);
}

function isQwenImageEditBaseModel(model: string): boolean {
  return /^qwen-image-edit$/i.test(model);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function defaultResponseUrlPaths(): string[] {
  return [
    "output.choices.0.message.content.0.image",
    "output.choices.0.message.content",
    "output.choices.0.message",
    "output.choices",
    "output",
  ];
}

function defaultRequestIdPaths(): string[] {
  return ["request_id", "requestId", "id"];
}

function normalizeSeed(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < 0 || parsed > 2147483647) {
    return null;
  }
  return parsed;
}

function normalizeConfig(config: DashScopeAliyunProviderConfig): NormalizedConfig {
  const name = config.name;
  const baseUrl = toOptionalString(config.baseUrl ?? config.base_url)?.trim() ?? "https://dashscope.aliyuncs.com/api/v1";
  const endpoint = toOptionalString(config.endpoint)?.trim() ?? "/services/aigc/multimodal-generation/generation";
  const apiKey =
    toOptionalString(config.apiKey ?? config.api_key)?.trim() ?? toOptionalString(process.env.DASHSCOPE_API_KEY)?.trim();
  const model = toOptionalString(config.model)?.trim();
  const timeoutMs = toFiniteNumber(config.timeoutMs ?? config.timeout_ms);
  const n = toFiniteNumber(config.n);
  const responseUrlPaths = toStringArray(config.responseUrlPaths ?? config.response_url_paths);
  const requestIdPaths = toStringArray(config.requestIdPaths ?? config.request_id_paths);

  if (!apiKey) {
    throw new ProviderError(`provider ${name} 缺少 apiKey（或环境变量 DASHSCOPE_API_KEY）`, {
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
    url: buildRequestUrl(baseUrl, endpoint, "aliyun"),
    apiKey,
    model,
    n: n !== null && n > 0 ? Math.floor(n) : 1,
    size: toOptionalString(config.size)?.trim() ?? null,
    negativePrompt: toOptionalString(config.negativePrompt ?? config.negative_prompt)?.trim() ?? null,
    promptExtend: toBoolean(config.promptExtend ?? config.prompt_extend),
    watermark: toBoolean(config.watermark) ?? false,
    seed: normalizeSeed(config.seed),
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
    const direct = extractImage(record.image, depth + 1) ?? extractImage(record.url, depth + 1);
    if (direct) {
      return direct;
    }
    for (const key of ["content", "message", "choices", "output", "data", "result"]) {
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
  for (const candidate of [body.image, body.images, body.input_image, body.image_url, body.input]) {
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

  const model = config.model;
  const wanModel = isWanImageModel(model);
  const qwenImageEditModel = isQwenImageEditModel(model);
  const qwenImageEditBaseModel = isQwenImageEditBaseModel(model);

  const n = wanModel ? clampInt(config.n, 1, 4) : qwenImageEditBaseModel ? 1 : qwenImageEditModel ? clampInt(config.n, 1, 6) : config.n;

  const supportsSize = wanModel || (qwenImageEditModel && !qwenImageEditBaseModel);
  const supportsPromptExtend = wanModel || (qwenImageEditModel && !qwenImageEditBaseModel);

  const parameters: Record<string, unknown> = {
    n,
    watermark: config.watermark,
  };

  if (wanModel) {
    parameters.enable_interleave = false;
  }
  if (config.negativePrompt) {
    parameters.negative_prompt = config.negativePrompt;
  }
  if (config.seed !== null) {
    parameters.seed = config.seed;
  }
  if (supportsSize && config.size) {
    parameters.size = config.size;
  }
  if (supportsPromptExtend) {
    parameters.prompt_extend = config.promptExtend ?? true;
  }

  const extraBody = asRecord(config.extraBody);
  const referenceImages = resolveReferenceImages(extraBody, payload);
  const extraParameters = asRecord(extraBody.parameters);
  const mergedParameters = {
    ...extraParameters,
    ...parameters,
  };
  const content: Array<Record<string, string>> = referenceImages.map((image) => ({ image }));
  content.push({ text: prompt });

  const body: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(extraBody).filter(([key]) => !["model", "input", "parameters"].includes(key))),
    model,
    input: {
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: mergedParameters,
  };

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
      throw new ProviderError(`aliyun 请求超时: ${timeoutMs}ms`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        details: { url, timeoutMs },
      });
    }

    throw new ProviderError(`aliyun 请求失败: ${error instanceof Error ? error.message : String(error)}`, {
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

  if (!response.ok) {
    throw new ProviderError(`aliyun HTTP 请求失败: ${response.status}`, {
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

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const errorCode = toOptionalString(record.code);
    const errorMessage = toOptionalString(record.message);
    if (errorCode) {
      throw new ProviderError(`aliyun 业务错误: ${errorMessage ?? errorCode}`, {
        code: "PROVIDER_HTTP_FAILED",
        transient: false,
        requestId: toOptionalString(record.request_id) ?? response.headers.get("x-request-id"),
        details: {
          status: response.status,
          url,
          body: parsed,
        },
      });
    }
  }

  return {
    body: parsed,
    requestIdFromHeader: response.headers.get("x-request-id"),
  };
}

export function createDashScopeAliyunProvider(
  rawConfig: DashScopeAliyunProviderConfig,
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
