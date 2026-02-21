import { ProviderError } from "../errors";
import { createMockProvider } from "./mock";
import { createHttpAsyncProvider } from "./http-async";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import { createVolcengineArkProvider } from "./volcengine-ark";
import { createDashScopeAliyunProvider } from "./dashscope-aliyun";
import { createFalProvider } from "./fal";
import type { ProviderAdapter, ProviderConfig, ProviderRegistry, ProvidersConfig } from "../types";

interface NamedProviderConfig extends ProviderConfig {
  name: string;
}

const PROVIDER_TYPE_ALIASES: Record<string, string> = {
  mock: "mock",
  volcengine: "volcengine",
  "volcengine-ark": "volcengine",
  ark: "volcengine",
  "openai-compatible": "openai-compatible",
  aliyun: "aliyun",
  fal: "fal",
  "http-async": "http-async",
};

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferProviderType(config: NamedProviderConfig, hasAsyncSubmitPollConfig: boolean): string {
  const explicitType = normalizeText(config.type)?.toLowerCase();
  if (explicitType) {
    return explicitType;
  }

  const aliasByName = PROVIDER_TYPE_ALIASES[config.name.toLowerCase()];
  if (aliasByName) {
    return aliasByName;
  }

  const source = config as Record<string, unknown>;

  const apiKey = normalizeText(source.apiKey) ?? normalizeText(source.api_key);
  const model = normalizeText(source.model);
  const normalizedModel = model?.toLowerCase() ?? "";
  const endpoint = normalizeText(source.endpoint)?.toLowerCase() ?? "";
  const baseUrl = normalizeText(source.baseUrl) ?? normalizeText(source.base_url) ?? "";
  const normalizedBaseUrl = baseUrl.toLowerCase();
  if (apiKey && model) {
    if (
      /^wan[\w.-]*image$/.test(normalizedModel) ||
      normalizedModel.startsWith("qwen-image-edit") ||
      endpoint.includes("/services/aigc/multimodal-generation/generation") ||
      endpoint.includes("/services/aigc/image-generation/generation") ||
      normalizedBaseUrl.includes("dashscope.aliyuncs.com") ||
      normalizedBaseUrl.includes("dashscope-intl.aliyuncs.com") ||
      normalizedBaseUrl.includes("dashscope-us.aliyuncs.com")
    ) {
      return "aliyun";
    }
    if (endpoint.includes("/images/edits")) {
      return "openai-compatible";
    }
    if (endpoint.includes("/images/generations")) {
      return "volcengine";
    }
    if (normalizedBaseUrl.includes("fal.run")) {
      return "fal";
    }
  }

  if (hasAsyncSubmitPollConfig) {
    return "http-async";
  }

  throw new ProviderError(`provider ${config.name} 缺少 type 且无法自动推断`, {
    code: "PROVIDER_CONFIG_INVALID",
    details: { name: config.name },
  });
}

function createProvider(config: NamedProviderConfig, fetchImpl?: typeof fetch): ProviderAdapter {
  const hasAsyncSubmitPollConfig =
    Boolean((config as Record<string, unknown>).submit) || Boolean((config as Record<string, unknown>).poll);
  const type = inferProviderType(config, hasAsyncSubmitPollConfig);
  let provider: ProviderAdapter;

  if (type === "mock") {
    provider = createMockProvider(config);
  } else if (["volcengine", "ark", "volcengine-ark"].includes(type)) {
    provider = createVolcengineArkProvider(config, fetchImpl);
  } else if (type === "aliyun") {
    provider = createDashScopeAliyunProvider(config, fetchImpl);
  } else if (type === "openai-compatible") {
    provider = createOpenAICompatibleProvider(config, fetchImpl);
  } else if (type === "fal") {
    provider = createFalProvider(config, fetchImpl);
  } else if (type === "http-async") {
    provider = createHttpAsyncProvider({
      ...config,
      fetchImpl,
    });
  } else {
    throw new ProviderError(`不支持的 provider 类型: ${type}`, {
      code: "PROVIDER_TYPE_UNSUPPORTED",
      details: { type, name: config.name },
    });
  }

  provider.available = true;
  return provider;
}

function createUnavailableProvider(
  name: string,
  errorMessage: string,
  code = "PROVIDER_CONFIG_INVALID",
): ProviderAdapter {
  return {
    name,
    available: false,
    unavailableReason: errorMessage,
    async generate() {
      throw new ProviderError(errorMessage, {
        code,
      });
    },
  };
}

export function createProviderRegistry(
  providersConfig: ProvidersConfig = {},
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): ProviderRegistry {
  const entries = Object.entries(providersConfig ?? {});
  const registry: ProviderRegistry = {};

  if (entries.length === 0) {
    registry.mock = createMockProvider({ name: "mock" });
    return registry;
  }

  for (const [name, rawConfig] of entries) {
    try {
      registry[name] = createProvider(
        {
          name,
          ...(rawConfig ?? {}),
        },
        fetchImpl,
      );
    } catch (error) {
      if (error instanceof ProviderError && error.code === "PROVIDER_CONFIG_INVALID") {
        registry[name] = createUnavailableProvider(name, error.message, error.code);
        continue;
      }
      throw error;
    }
  }

  return registry;
}
