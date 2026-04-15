import { GoogleGenAI } from "@google/genai";
import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter, ProviderConfig } from "../types";
import { dedupeNonEmptyStrings, toOptionalString } from "./shared";

interface GeminiProviderConfig extends ProviderConfig {
  name: string;
  apiKey?: string;
  api_key?: string;
  model?: string;
  baseUrl?: string;
  base_url?: string;
}

interface NormalizedConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string | null;
}

interface GeminiGenerateContentRequest {
  model: string;
  contents: Array<{
    role: "user";
    parts: Array<Record<string, unknown>>;
  }>;
  config: {
    responseModalities: string[];
  };
}

interface GeminiClient {
  models: {
    generateContent(params: GeminiGenerateContentRequest): Promise<unknown>;
  };
}

export type GeminiClientFactory = (config: NormalizedConfig) => GeminiClient;

interface ParsedDataImage {
  mimeType: string;
  data: string;
}

function normalizeConfig(config: GeminiProviderConfig): NormalizedConfig {
  const name = config.name;
  const apiKey = toOptionalString(config.apiKey ?? config.api_key)?.trim();
  const model = toOptionalString(config.model)?.trim();
  const baseUrl = toOptionalString(config.baseUrl ?? config.base_url)?.trim() ?? null;

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
    apiKey,
    model,
    baseUrl: baseUrl ? baseUrl.replace(/\/+$/, "") : null,
  };
}

function parseDataImageUrl(value: string): ParsedDataImage | null {
  const match = value.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

function buildReferenceParts(payload: GenerateRequest): Array<Record<string, unknown>> {
  const referenceImages = dedupeNonEmptyStrings(payload.referenceImageDataUrls);

  return referenceImages.map((imageUrl, index) => {
    const parsed = parseDataImageUrl(imageUrl);
    if (!parsed) {
      throw new ProviderError(`provider gemini 收到无效参考图 data URL（index=${index}）`, {
        code: "PROVIDER_REQUEST_INVALID",
      });
    }

    return {
      inlineData: {
        mimeType: parsed.mimeType,
        data: parsed.data,
      },
    };
  });
}

function buildRequest(config: NormalizedConfig, payload: GenerateRequest): GeminiGenerateContentRequest {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new ProviderError(`provider ${config.name} prompt 不能为空`, {
      code: "PROVIDER_REQUEST_INVALID",
    });
  }

  const parts = [...buildReferenceParts(payload), { text: prompt }];

  return {
    model: config.model,
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
    },
  };
}

function createGeminiClient(config: NormalizedConfig): GeminiClient {
  return new GoogleGenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl
      ? {
          httpOptions: {
            baseUrl: config.baseUrl,
          },
        }
      : {}),
  }) as GeminiClient;
}

function extractImagePart(value: unknown, depth = 0): ParsedDataImage | null {
  if (depth > 8 || value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractImagePart(item, depth + 1);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const inlineDataSource = record.inlineData ?? record.inline_data;
  if (inlineDataSource && typeof inlineDataSource === "object" && !Array.isArray(inlineDataSource)) {
    const inlineData = inlineDataSource as Record<string, unknown>;
    const mimeType = toOptionalString(inlineData.mimeType ?? inlineData.mime_type)?.trim();
    const data = toOptionalString(inlineData.data)?.trim();
    if (mimeType && data && /^image\//i.test(mimeType)) {
      return { mimeType, data };
    }
  }

  for (const key of ["candidates", "content", "parts", "response", "result", "data", "output"]) {
    const resolved = extractImagePart(record[key], depth + 1);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function collectTextParts(value: unknown, result: Set<string>, depth = 0): void {
  if (depth > 8 || value == null) {
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      result.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, result, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim()) {
    result.add(record.text.trim());
  }

  for (const key of ["candidates", "content", "parts", "response", "result", "data", "output", "message", "error"]) {
    collectTextParts(record[key], result, depth + 1);
  }
}

function extractRequestId(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractRequestId(item, depth + 1);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["responseId", "response_id", "requestId", "request_id", "id"]) {
    const text = toOptionalString(record[key])?.trim();
    if (text) {
      return text;
    }
  }

  for (const key of ["candidates", "response", "result", "data"]) {
    const resolved = extractRequestId(record[key], depth + 1);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function errorStatus(error: unknown): number | string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const status = (error as Record<string, unknown>).status;
  if (typeof status === "number" || typeof status === "string") {
    return status;
  }
  return null;
}

export function createGeminiProvider(
  rawConfig: GeminiProviderConfig,
  clientFactory: GeminiClientFactory = createGeminiClient,
): ProviderAdapter {
  const config = normalizeConfig(rawConfig);

  return {
    name: config.name,
    async generate(payload: GenerateRequest) {
      const client = clientFactory(config);
      const request = buildRequest(config, payload);

      try {
        const response = await client.models.generateContent(request);
        const requestId = extractRequestId(response);
        const image = extractImagePart(response);
        if (!image) {
          const texts = new Set<string>();
          collectTextParts(response, texts);
          throw new ProviderError(`provider ${config.name} 响应中未找到图片数据`, {
            code: "PROVIDER_IMAGE_URL_MISSING",
            requestId,
            details: {
              textPreview: Array.from(texts).slice(0, 3),
            },
          });
        }

        return {
          requestId,
          imageUrl: `data:${image.mimeType};base64,${image.data}`,
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }

        throw new ProviderError(`provider ${config.name} 请求失败: ${errorMessage(error)}`, {
          code: "PROVIDER_REQUEST_FAILED",
          transient: true,
          details: {
            status: errorStatus(error),
          },
        });
      }
    },
  };
}
