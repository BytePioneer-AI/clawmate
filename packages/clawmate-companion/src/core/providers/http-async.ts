import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter } from "../types";
import { getByPath, toFiniteNumber, toOptionalString } from "./shared";

interface SubmitConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  taskIdPath?: string;
  requestIdPath?: string;
}

interface PollConfig {
  urlTemplate?: string;
  method?: string;
  headers?: Record<string, string>;
  statusPath?: string;
  requestIdPath?: string;
  imageUrlPath?: string;
  errorPath?: string;
}

export interface HttpAsyncProviderOptions {
  name?: string;
  submit?: SubmitConfig;
  poll?: PollConfig;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

function toRequiredString(value: unknown): string {
  const text = toOptionalString(value);
  return text ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ProviderError(`HTTP 请求失败: ${response.status} ${url}`, {
      code: "PROVIDER_HTTP_FAILED",
      transient: response.status >= 500 || response.status === 429,
      details: {
        url,
        status: response.status,
        body,
      },
    });
  }

  return body;
}

export function createHttpAsyncProvider(options: HttpAsyncProviderOptions = {}): ProviderAdapter {
  const name = options.name ?? "http-async";
  const submit = options.submit ?? {};
  const poll = options.poll ?? {};
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new ProviderError(`provider ${name} 缺少 fetch 实现`, {
      code: "PROVIDER_FETCH_MISSING",
    });
  }

  if (!submit.url || !poll.urlTemplate) {
    throw new ProviderError(`provider ${name} 配置不完整（submit.url / poll.urlTemplate）`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  const configPollIntervalMs = toFiniteNumber(options.pollIntervalMs);
  const configPollTimeoutMs = toFiniteNumber(options.pollTimeoutMs);

  return {
    name,
    async generate(payload: GenerateRequest, runtimeOptions?: { pollIntervalMs?: number; pollTimeoutMs?: number }) {
      const referenceImageBase64List =
        Array.isArray(payload.referenceImageBase64List) && payload.referenceImageBase64List.length > 0
          ? payload.referenceImageBase64List
          : [payload.referenceImageBase64];
      const body: Record<string, unknown> = {
        prompt: payload.prompt,
        reference_image_base64: referenceImageBase64List[0] ?? payload.referenceImageBase64,
        meta: payload.meta ?? {},
      };
      if (referenceImageBase64List.length > 1) {
        body.reference_images_base64 = referenceImageBase64List;
      }

      const submitResponse = await fetchJson(
        submit.url as string,
        {
          method: submit.method ?? "POST",
          headers: {
            "content-type": "application/json",
            ...(submit.headers ?? {}),
          },
          body: JSON.stringify(body),
        },
        fetchImpl,
      );

      const taskId = toRequiredString(getByPath(submitResponse, submit.taskIdPath ?? "task_id"));
      const submitRequestId = toOptionalString(getByPath(submitResponse, submit.requestIdPath ?? "request_id"));
      if (!taskId) {
        throw new ProviderError(`provider ${name} submit 响应缺少 task_id`, {
          code: "PROVIDER_SUBMIT_PARSE_ERROR",
          details: { response: submitResponse },
        });
      }

      const pollIntervalMs =
        toFiniteNumber(runtimeOptions?.pollIntervalMs) ??
        configPollIntervalMs ??
        1200;
      const pollTimeoutMs =
        toFiniteNumber(runtimeOptions?.pollTimeoutMs) ??
        configPollTimeoutMs ??
        180000;

      const startedAt = Date.now();
      let requestId: string | null = submitRequestId;
      while (Date.now() - startedAt < pollTimeoutMs) {
        const pollUrl = (poll.urlTemplate as string).replace("{taskId}", encodeURIComponent(taskId));
        const pollResponse = await fetchJson(
          pollUrl,
          {
            method: poll.method ?? "GET",
            headers: {
              ...(poll.headers ?? {}),
            },
          },
          fetchImpl,
        );

        const status = toRequiredString(getByPath(pollResponse, poll.statusPath ?? "status"));
        requestId = toOptionalString(getByPath(pollResponse, poll.requestIdPath ?? "request_id")) ?? requestId;
        const imageUrl =
          toOptionalString(getByPath(pollResponse, poll.imageUrlPath ?? "image_url")) ??
          toOptionalString(getByPath(pollResponse, "data.image_urls.0"));

        if (!status) {
          throw new ProviderError(`provider ${name} poll 响应缺少 status`, {
            code: "PROVIDER_POLL_PARSE_ERROR",
            details: { response: pollResponse },
            requestId,
          });
        }

        const normalized = status.toLowerCase();
        if (["done", "succeeded", "success", "completed"].includes(normalized)) {
          if (!imageUrl) {
            throw new ProviderError(`provider ${name} 返回成功但缺少 imageUrl`, {
              code: "PROVIDER_IMAGE_URL_MISSING",
              requestId,
              details: { response: pollResponse },
            });
          }
          return { imageUrl, requestId };
        }

        if (!["pending", "running", "in_queue", "generating"].includes(normalized)) {
          throw new ProviderError(
            toOptionalString(getByPath(pollResponse, poll.errorPath ?? "message")) ??
              `provider ${name} 返回失败状态: ${status}`,
            {
              code: "PROVIDER_TASK_FAILED",
              transient: false,
              requestId,
              details: { response: pollResponse },
            },
          );
        }

        await sleep(pollIntervalMs);
      }

      throw new ProviderError(`provider ${name} 轮询超时`, {
        code: "PROVIDER_TIMEOUT",
        transient: true,
        requestId: submitRequestId,
      });
    },
  };
}
