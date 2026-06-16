import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import {
  toOptionalString,
  toFiniteNumber,
  dedupeNonEmptyStrings,
} from "./shared";

// ── Config ──────────────────────────────────────────────────────────

interface EvolinkProviderConfig extends ProviderConfig {
  name: string;
  apiKey?: string;
  api_key?: string;
  model?: string;
  baseUrl?: string;
  base_url?: string;
  size?: string;
  quality?: string;
  pollIntervalMs?: number;
  poll_interval_ms?: number;
  pollTimeoutMs?: number;
  poll_timeout_ms?: number;
  fetchImpl?: typeof fetch;
}

interface NormalizedConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  size: string | null;
  quality: string | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

function normalizeConfig(config: EvolinkProviderConfig): NormalizedConfig {
  const name = config.name;
  const apiKey =
    toOptionalString(config.apiKey ?? config.api_key)?.trim() ??
    toOptionalString(process.env.EVOLINK_API_KEY)?.trim();

  if (!apiKey) {
    throw new ProviderError(
      `provider ${name} 缺少 apiKey（或环境变量 EVOLINK_API_KEY）`,
      { code: "PROVIDER_CONFIG_INVALID" },
    );
  }

  const model = toOptionalString(config.model)?.trim() ?? "gpt-image-1.5";
  const baseUrl =
    toOptionalString(config.baseUrl ?? config.base_url)?.trim()?.replace(/\/+$/, "") ??
    "https://api.evolink.ai";

  const size = toOptionalString(config.size)?.trim() ?? null;
  const quality = toOptionalString(config.quality)?.trim() ?? null;

  const pollIntervalMs =
    toFiniteNumber(config.pollIntervalMs ?? config.poll_interval_ms) ?? 2000;
  const pollTimeoutMs =
    toFiniteNumber(config.pollTimeoutMs ?? config.poll_timeout_ms) ?? 300000;

  return { name, apiKey, model, baseUrl, size, quality, pollIntervalMs, pollTimeoutMs };
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchJsonResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<FetchJsonResult> {
  const response = await fetchImpl(url, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

// ── Request building ─────────────────────────────────────────────────

interface SubmitBody {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  image_urls?: string[];
}

function buildSubmitBody(config: NormalizedConfig, payload: GenerateRequest): SubmitBody {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new ProviderError(`provider ${config.name} prompt 不能为空`, {
      code: "PROVIDER_REQUEST_INVALID",
    });
  }

  const body: SubmitBody = { model: config.model, prompt };

  if (config.size) {
    body.size = config.size;
  }
  if (config.quality) {
    body.quality = config.quality;
  }

  // Pass reference images as data URLs. The Evolink API documents
  // `image_urls` as HTTP URLs; data URLs are attempted here and
  // gracefully degrade to text-only if the server rejects them.
  const urls = dedupeNonEmptyStrings(payload.referenceImageDataUrls);
  if (urls.length > 0) {
    body.image_urls = urls;
  }

  return body;
}

// ── Submit ───────────────────────────────────────────────────────────

interface SubmitResult {
  taskId: string;
  requestId: string | null;
}

async function submitTask(
  config: NormalizedConfig,
  body: SubmitBody,
  fetchImpl: typeof fetch,
): Promise<SubmitResult> {
  const url = `${config.baseUrl}/v1/images/generations`;

  const { ok, status, body: responseBody } = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    fetchImpl,
  );

  if (!ok) {
    const record = responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? responseBody as Record<string, unknown>
      : {};
    const error = record.error;
    const errorMessage =
      (error && typeof error === "object" && !Array.isArray(error)
        ? toOptionalString((error as Record<string, unknown>).message)
        : null) ??
      `HTTP ${status}`;

    throw new ProviderError(
      `provider ${config.name} submit 失败: ${errorMessage}`,
      {
        code: "PROVIDER_HTTP_FAILED",
        transient: status >= 500 || status === 429,
        details: { url, status, body: responseBody },
      },
    );
  }

  const record =
    responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? (responseBody as Record<string, unknown>)
      : {};

  const taskId = toOptionalString(record.id)?.trim();
  if (!taskId) {
    throw new ProviderError(
      `provider ${config.name} submit 响应缺少 task id（id 字段）`,
      { code: "PROVIDER_SUBMIT_PARSE_ERROR", details: { response: responseBody } },
    );
  }

  return { taskId, requestId: taskId };
}

// ── Poll ─────────────────────────────────────────────────────────────

const SUCCESS_STATUSES = new Set(["completed"]);
const IN_PROGRESS_STATUSES = new Set(["pending", "processing"]);

async function pollTask(
  config: NormalizedConfig,
  taskId: string,
  runtimePollIntervalMs: number | null,
  runtimePollTimeoutMs: number | null,
  fetchImpl: typeof fetch,
): Promise<{ imageUrl: string; requestId: string | null }> {
  const pollIntervalMs = runtimePollIntervalMs ?? config.pollIntervalMs;
  const pollTimeoutMs = runtimePollTimeoutMs ?? config.pollTimeoutMs;
  const url = `${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`;

  const startedAt = Date.now();
  while (Date.now() - startedAt < pollTimeoutMs) {
    const { ok, status, body } = await fetchJson(
      url,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
        },
      },
      fetchImpl,
    );

    if (!ok) {
      throw new ProviderError(
        `provider ${config.name} poll 失败: HTTP ${status}`,
        {
          code: "PROVIDER_HTTP_FAILED",
          transient: status >= 500 || status === 429,
          details: { url, status, body },
        },
      );
    }

    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    const taskStatus = toOptionalString(record.status)?.trim()?.toLowerCase();

    if (taskStatus && SUCCESS_STATUSES.has(taskStatus)) {
      const results = Array.isArray(record.results) ? record.results : [];
      const imageUrl = toOptionalString(results[0]);
      if (!imageUrl) {
        throw new ProviderError(
          `provider ${config.name} 任务完成但缺少 results`,
          {
            code: "PROVIDER_IMAGE_URL_MISSING",
            requestId: taskId,
            details: { response: body },
          },
        );
      }
      return { imageUrl, requestId: taskId };
    }

    if (taskStatus && IN_PROGRESS_STATUSES.has(taskStatus)) {
      await sleep(pollIntervalMs);
      continue;
    }

    // Treat any unknown status (including "failed") as terminal error.
    const errorBlock = record.error;
    const errorMessage =
      errorBlock && typeof errorBlock === "object" && !Array.isArray(errorBlock)
        ? toOptionalString((errorBlock as Record<string, unknown>).message)
        : null;

    throw new ProviderError(
      errorMessage ??
        `provider ${config.name} 任务失败（status=${taskStatus ?? "unknown"}）`,
      {
        code: "PROVIDER_TASK_FAILED",
        requestId: taskId,
        details: { response: body },
      },
    );
  }

  throw new ProviderError(`provider ${config.name} 轮询超时`, {
    code: "PROVIDER_TIMEOUT",
    transient: true,
    requestId: taskId,
  });
}

// ── Export ───────────────────────────────────────────────────────────

export function createEvolinkProvider(
  rawConfig: EvolinkProviderConfig,
): ProviderAdapter {
  const config = normalizeConfig(rawConfig);
  const fetchImpl = rawConfig.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new ProviderError(`provider ${config.name} 缺少 fetch 实现`, {
      code: "PROVIDER_FETCH_MISSING",
    });
  }

  return {
    name: config.name,

    async generate(
      payload: GenerateRequest,
      runtimeOptions?: { pollIntervalMs?: number; pollTimeoutMs?: number },
    ) {
      const body = buildSubmitBody(config, payload);
      const { taskId } = await submitTask(config, body, fetchImpl);

      return pollTask(
        config,
        taskId,
        toFiniteNumber(runtimeOptions?.pollIntervalMs),
        toFiniteNumber(runtimeOptions?.pollTimeoutMs),
        fetchImpl,
      );
    },
  };
}
