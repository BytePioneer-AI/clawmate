import { ClawMateError } from "./errors";
import type { ClawMateConfig } from "./types";

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export interface BuildProviderOrderOptions {
  explicitProvider?: string;
  config: Pick<ClawMateConfig, "defaultProvider" | "fallback">;
  availableProviders: string[];
}

export function buildProviderOrder(options: BuildProviderOrderOptions): string[] {
  const { explicitProvider, config, availableProviders } = options;

  if (!Array.isArray(availableProviders) || availableProviders.length === 0) {
    throw new ClawMateError("未找到可用 provider", {
      code: "NO_PROVIDER_AVAILABLE",
    });
  }

  const available = new Set(availableProviders);

  if (explicitProvider) {
    if (!available.has(explicitProvider)) {
      throw new ClawMateError(`显式指定的 provider 不可用: ${explicitProvider}`, {
        code: "EXPLICIT_PROVIDER_UNAVAILABLE",
      });
    }

    const order = [explicitProvider];
    if (config.fallback?.enabled) {
      for (const fallbackName of config.fallback.order ?? []) {
        if (available.has(fallbackName) && fallbackName !== explicitProvider) {
          order.push(fallbackName);
        }
      }
    }

    return unique(order);
  }

  const defaultProvider = config.defaultProvider;
  if (!defaultProvider) {
    throw new ClawMateError("未配置默认 provider", {
      code: "DEFAULT_PROVIDER_MISSING",
    });
  }

  if (!available.has(defaultProvider)) {
    throw new ClawMateError(`默认 provider 不可用: ${defaultProvider}`, {
      code: "DEFAULT_PROVIDER_UNAVAILABLE",
    });
  }

  const order = [defaultProvider];

  if (config.fallback?.enabled) {
    const fallbackOrder =
      config.fallback.order.length > 0
        ? config.fallback.order
        : availableProviders.filter((name) => name !== defaultProvider);

    for (const fallbackName of fallbackOrder) {
      if (available.has(fallbackName) && fallbackName !== defaultProvider) {
        order.push(fallbackName);
      }
    }
  }

  return unique(order);
}
