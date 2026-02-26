import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import {
  asImageDataUrl,
  asRecord,
  asStringRecord,
  buildRequestUrl,
  collectImageCandidates,
  dedupeNonEmptyStrings,
  firstStringByPaths,
  getByPath,
  hasOwn,
  isLikelyBase64,
  resolveImageUrl,
  toFiniteNumber,
  toOptionalString,
  toStringArray,
} from "./shared";

interface ModelScopeProviderConfig extends ProviderConfig {
  name: string;
  baseUrl?: string;
  base_url?: string;
  endpoint?: string;
  pollEndpoint?: string;
  poll_endpoint?: string;
  apiKey?: string;
  api_key?: string;
  model?: string;
  taskType?: string;
  task_type?: string;
  negativePrompt?: string;
  negative_prompt?: string;
  size?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  loras?: string | Record<string, number>;
  headers?: Record<string, string>;
  pollHeaders?: Record<string, string>;
  poll_headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  extra_body?: Record<string, unknown>;
  statusPath?: string;
  status_path?: string;
  taskIdPath?: string;
  task_id_path?: string;
  requestIdPaths?: string[];
  request_id_paths?: string[];
  responseUrlPaths?: string[];
  response_url_paths?: string[];
  timeoutMs?: number;
  timeout_ms?: number;
  pollIntervalMs?: number;
  poll_interval_ms?: number;
  pollTimeoutMs?: number;
  poll_timeout_ms?: number;
}

interface NormalizedConfig {
  name: string;
  baseUrl: string;
  submitUrl: string;
  pollEndpointTemplate: string;
  apiKey: string;
  model: string;
  taskType: string;
  headers: Record<string, string>;
  pollHeaders: Record<string, string>;
  extraBody: Record<string, unknown>;
  negativePrompt: string | null;
  size: string | null;
  seed: number | null;
  steps: number | null;
  guidance: number | null;
  loras: string | Record<string, number> | null;
  taskIdPath: string;
  statusPath: string;
  requestIdPaths: string[];
  responseUrlPaths: string[];
  timeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

interface HttpResult {
  body: unknown;
  requestIdFromHeader: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return false;
    }
  }
  return true;
}

function defaultRequestIdPaths(): string[] {
  return ["request_id", "requestId", "id"];
}

function defaultResponseUrlPaths(): string[] {
  return ["output_images.0", "output_images", "data.0.url", "data.0.b64_json", "output.0.url", "output.0.b64_json"];
}

function normalizeConfig(config: ModelScopeProviderConfig): NormalizedConfig {
  const name = config.name;
  const baseUrl = toOptionalString(config.baseUrl ?? config.base_url)?.trim() ?? "https://api-inference.modelscope.cn/v1";
  const endpoint = toOptionalString(config.endpoint)?.trim() ?? "/images/generations";
  const pollEndpointTemplate = toOptionalString(config.pollEndpoint ?? config.poll_endpoint)?.trim() ?? "/tasks/{taskId}";
  const apiKey = toOptionalString(config.apiKey ?? config.api_key)?.trim();
  const model = toOptionalString(config.model)?.trim();
  const taskType = toOptionalString(config.taskType ?? config.task_type)?.trim() ?? "image_generation";
  const timeoutMs = toFiniteNumber(config.timeoutMs ?? config.timeout_ms);
  const pollIntervalMs = toFiniteNumber(config.pollIntervalMs ?? config.poll_interval_ms);
  const pollTimeoutMs = toFiniteNumber(config.pollTimeoutMs ?? config.poll_timeout_ms);
  const requestIdPaths = toStringArray(config.requestIdPaths ?? config.request_id_paths);
  const responseUrlPaths = toStringArray(config.responseUrlPaths ?? config.response_url_paths);
  const lorasRaw = config.loras;

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

  let loras: string | Record<string, number> | null = null;
  if (typeof lorasRaw === "string" && lorasRaw.trim()) {
    loras = lorasRaw.trim();
  } else if (isPlainObject(lorasRaw)) {
    loras = lorasRaw;
  }

  return {
    name,
    baseUrl,
    submitUrl: buildRequestUrl(baseUrl, endpoint, "modelscope"),
    pollEndpointTemplate,
    apiKey,
    model,
    taskType,
    headers: asStringRecord(config.headers),
    pollHeaders: {
      ...asStringRecord(config.headers),
      ...asStringRecord(config.poll_headers),
      ...asStringRecord(config.pollHeaders),
    },
    extraBody: {
      ...asRecord(config.extra_body),
      ...asRecord(config.extraBody),
    },
    negativePrompt: toOptionalString(config.negativePrompt ?? config.negative_prompt)?.trim() ?? null,
    size: toOptionalString(config.size)?.trim() ?? null,
    seed: toFiniteNumber(config.seed),
    steps: toFiniteNumber(config.steps),
    guidance: toFiniteNumber(config.guidance),
    loras,
    taskIdPath: toOptionalString(config.taskIdPath ?? config.task_id_path)?.trim() ?? "task_id",
    statusPath: toOptionalString(config.statusPath ?? config.status_path)?.trim() ?? "task_status",
    requestIdPaths: requestIdPaths.length > 0 ? requestIdPaths : defaultRequestIdPaths(),
    responseUrlPaths: responseUrlPaths.length > 0 ? responseUrlPaths : defaultResponseUrlPaths(),
    timeoutMs: timeoutMs !== null && timeoutMs > 0 ? timeoutMs : 120000,
    pollIntervalMs: pollIntervalMs !== null && pollIntervalMs > 0 ? pollIntervalMs : 1000,
    pollTimeoutMs: pollTimeoutMs !== null && pollTimeoutMs > 0 ? pollTimeoutMs : 300000,
  };
}

function resolveReferenceImages(body: Record<string, unknown>, payload: GenerateRequest): string[] {
  const resolved = new Set<string>();
  for (const candidate of [body.image_url, body.input_image, body.image, body.images]) {
    collectImageCandidates(candidate, resolved);
  }
  if (resolved.size > 0) {
    return Array.from(resolved);
  }
  return dedupeNonEmptyStrings(
    Array.isArray(payload.referenceImageDataUrls) && payload.referenceImageDataUrls.length > 0
      ? payload.referenceImageDataUrls
      : [payload.referenceImageDataUrl],
  );
}

function buildSubmitBody(config: NormalizedConfig, payload: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...config.extraBody,
  };
  if (!hasOwn(body, "model")) {
    body.model = config.model;
  }
  if (!hasOwn(body, "prompt")) {
    body.prompt = payload.prompt.trim();
  }
  const prompt = toOptionalString(body.prompt)?.trim();
  if (!prompt) {
    throw new ProviderError(`provider ${config.name} prompt 不能为空`, {
      code: "PROVIDER_REQUEST_INVALID",
    });
  }
  body.prompt = prompt;

  if (config.negativePrompt && !hasOwn(body, "negative_prompt")) {
    body.negative_prompt = config.negativePrompt;
  }
  if (config.size && !hasOwn(body, "size")) {
    body.size = config.size;
  }
  if (config.seed !== null && !hasOwn(body, "seed")) {
    body.seed = config.seed;
  }
  if (config.steps !== null && !hasOwn(body, "steps")) {
    body.steps = config.steps;
  }
  if (config.guidance !== null && !hasOwn(body, "guidance")) {
    body.guidance = config.guidance;
  }
  if (config.loras && !hasOwn(body, "loras")) {
    body.loras = config.loras;
  }

  if (!hasOwn(body, "image_url")) {
    const refs = resolveReferenceImages(body, payload);
    if (refs.length > 0) {
      body.image_url = refs;
    }
  }
  return body;
}

function extractImage(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) {
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
      const found = extractImage(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractImage(record.output_images, depth + 1) ??
      extractImage(record.url, depth + 1) ??
      extractImage(record.image_url, depth + 1) ??
      extractImage(record.b64_json, depth + 1) ??
      extractImage(record.image_base64, depth + 1);
    if (direct) {
      return direct;
    }
    for (const key of ["data", "output", "images", "result", "choices", "message", "content"]) {
      const found = extractImage(record[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function fetchJsonWithTimeout(options: {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  providerName: string;
}): Promise<HttpResult> {
  const { url, method, headers, body, timeoutMs, fetchImpl, providerName } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`${providerName} 请求超时: ${timeoutMs}ms`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        details: { url, timeoutMs },
      });
    }
    throw new ProviderError(`${providerName} 请求失败: ${error instanceof Error ? error.message : String(error)}`, {
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
    throw new ProviderError(`${providerName} HTTP 请求失败: ${response.status}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: response.status === 429 || response.status >= 500,
      requestId: response.headers.get("x-request-id"),
      details: {
        status: response.status,
        error: parsed,
      },
    });
  }

  return {
    body: parsed,
    requestIdFromHeader: response.headers.get("x-request-id"),
  };
}

function toPollUrl(baseUrl: string, template: string, taskId: string): string {
  const endpoint = template.replace("{taskId}", encodeURIComponent(taskId));
  return buildRequestUrl(baseUrl, endpoint, "modelscope-poll");
}

function isPendingStatus(status: string): boolean {
  return ["PENDING", "PROCESSING", "RUNNING", "QUEUED", "CREATED", "IN_PROGRESS"].includes(status);
}

function isSuccessStatus(status: string): boolean {
  return ["SUCCEED", "SUCCESS", "COMPLETED", "DONE"].includes(status);
}

function isFailedStatus(status: string): boolean {
  return ["FAILED", "FAIL", "CANCELED", "CANCELLED"].includes(status);
}

export function createModelScopeProvider(
  rawConfig: ModelScopeProviderConfig,
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

    async generate(payload: GenerateRequest, runtimeOptions?: { pollIntervalMs?: number; pollTimeoutMs?: number }) {
      const submitBody = buildSubmitBody(config, payload);
      const submitResponse = await fetchJsonWithTimeout({
        url: config.submitUrl,
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          "x-modelscope-async-mode": "true",
          ...config.headers,
        },
        body: submitBody,
        timeoutMs: config.timeoutMs,
        fetchImpl,
        providerName: config.name,
      });

      const taskId = toOptionalString(getByPath(submitResponse.body, config.taskIdPath))?.trim();
      const submitRequestId =
        firstStringByPaths(submitResponse.body, config.requestIdPaths) ?? toOptionalString(submitResponse.requestIdFromHeader);
      if (!taskId) {
        throw new ProviderError(`provider ${config.name} submit 响应缺少 task_id`, {
          code: "PROVIDER_SUBMIT_PARSE_ERROR",
          requestId: submitRequestId,
          details: { response: submitResponse.body, taskIdPath: config.taskIdPath },
        });
      }

      const pollIntervalMs = toFiniteNumber(runtimeOptions?.pollIntervalMs) ?? config.pollIntervalMs;
      const pollTimeoutMs = toFiniteNumber(runtimeOptions?.pollTimeoutMs) ?? config.pollTimeoutMs;
      const pollUrl = toPollUrl(config.baseUrl, config.pollEndpointTemplate, taskId);

      const startedAt = Date.now();
      let requestId: string | null = submitRequestId;
      while (Date.now() - startedAt < pollTimeoutMs) {
        const pollResponse = await fetchJsonWithTimeout({
          url: pollUrl,
          method: "GET",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "x-modelscope-task-type": config.taskType,
            ...config.pollHeaders,
          },
          timeoutMs: config.timeoutMs,
          fetchImpl,
          providerName: config.name,
        });

        requestId =
          firstStringByPaths(pollResponse.body, config.requestIdPaths) ??
          toOptionalString(pollResponse.requestIdFromHeader) ??
          requestId;
        const status = toOptionalString(getByPath(pollResponse.body, config.statusPath))?.trim().toUpperCase();
        if (!status) {
          throw new ProviderError(`provider ${config.name} poll 响应缺少 status`, {
            code: "PROVIDER_POLL_PARSE_ERROR",
            requestId,
            details: { response: pollResponse.body, statusPath: config.statusPath },
          });
        }

        if (isSuccessStatus(status)) {
          const imageUrl =
            resolveImageUrl(pollResponse.body, config.responseUrlPaths, (value) => extractImage(value)) ?? extractImage(pollResponse.body);
          if (!imageUrl) {
            throw new ProviderError(`provider ${config.name} 响应中未找到图片 URL`, {
              code: "PROVIDER_PARSE_ERROR",
              requestId,
              details: { response: pollResponse.body, responseUrlPaths: config.responseUrlPaths },
            });
          }
          return {
            imageUrl,
            requestId,
          };
        }

        if (isFailedStatus(status)) {
          const errorMessage =
            firstStringByPaths(pollResponse.body, ["errors.message", "error.message", "message"]) ??
            `provider ${config.name} 任务失败: ${status}`;
          throw new ProviderError(errorMessage, {
            code: "PROVIDER_TASK_FAILED",
            transient: false,
            requestId,
            details: { response: pollResponse.body, status },
          });
        }

        if (!isPendingStatus(status)) {
          throw new ProviderError(`provider ${config.name} 未识别状态: ${status}`, {
            code: "PROVIDER_POLL_PARSE_ERROR",
            transient: false,
            requestId,
            details: { response: pollResponse.body, status },
          });
        }

        await sleep(pollIntervalMs);
      }

      throw new ProviderError(`provider ${config.name} 轮询超时`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        requestId: submitRequestId,
        details: { pollTimeoutMs },
      });
    },
  };
}
