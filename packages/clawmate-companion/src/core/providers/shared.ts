import { ProviderError } from "../errors";

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asStringRecord(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "string" && raw) {
      result[key] = raw;
    }
  }
  return result;
}

export function toOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

export function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function getByPath(source: unknown, dottedPath?: string): unknown {
  if (!dottedPath) {
    return undefined;
  }

  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) {
      return undefined;
    }

    if (/^\d+$/.test(key)) {
      if (!Array.isArray(acc)) {
        return undefined;
      }
      return acc[Number(key)];
    }

    if (typeof acc !== "object") {
      return undefined;
    }

    return (acc as Record<string, unknown>)[key];
  }, source);
}

export function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isLikelyBase64(text: string): boolean {
  return text.length >= 4 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function normalizeRawBase64(text: string): string {
  return text.replace(/\s+/g, "").replace(/^[("'\s]+|[)"'\s]+$/g, "");
}

function trimPotentialUrl(text: string): string {
  return text.replace(/[),.;!?]+$/, "");
}

function pickImageCandidateFromString(value: string): string | null {
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

  const rawBase64 = text.match(/([A-Za-z0-9+/]{64,}={0,2})/);
  if (rawBase64) {
    const normalized = normalizeRawBase64(rawBase64[1]);
    if (isLikelyBase64(normalized)) {
      return asImageDataUrl(normalized);
    }
  }

  return null;
}

export function collectImageCandidates(value: unknown, result: Set<string>, depth = 0): void {
  if (depth > 8 || value == null) {
    return;
  }

  if (typeof value === "string") {
    const candidate = pickImageCandidateFromString(value);
    if (candidate) {
      result.add(candidate);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageCandidates(item, result, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "b64_json",
      "url",
      "image_url",
      "input_image",
      "image",
      "images",
      "text",
      "content",
      "message",
      "choices",
      "output",
      "data",
      "result",
      "delta",
    ]) {
      collectImageCandidates(record[key], result, depth + 1);
    }
  }
}

export function dedupeNonEmptyStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function detectImageMime(base64: string): string {
  if (base64.startsWith("/9j/")) {
    return "image/jpeg";
  }
  if (base64.startsWith("iVBORw0KGgo")) {
    return "image/png";
  }
  if (base64.startsWith("R0lGOD")) {
    return "image/gif";
  }
  if (base64.startsWith("UklGR")) {
    return "image/webp";
  }
  return "image/png";
}

export function asImageDataUrl(base64: string): string {
  return `data:${detectImageMime(base64)};base64,${base64}`;
}

export function buildRequestUrl(baseUrl: string | null, endpoint: string, providerLabel?: string): string {
  if (isAbsoluteUrl(endpoint)) {
    return endpoint;
  }

  if (!baseUrl) {
    const label = providerLabel ?? "provider";
    throw new ProviderError(`${label} 缺少 baseUrl（endpoint 非绝对地址时必填）`, {
      code: "PROVIDER_CONFIG_INVALID",
    });
  }

  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

export function firstStringByPaths(source: unknown, paths: string[]): string | null {
  for (const dottedPath of paths) {
    const text = toOptionalString(getByPath(source, dottedPath))?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

export function resolveImageUrl(
  source: unknown,
  paths: string[],
  extractFn: (value: unknown, hintPath?: string) => string | null,
): string | null {
  for (const dottedPath of paths) {
    const value = getByPath(source, dottedPath);
    const imageUrl = extractFn(value, dottedPath);
    if (imageUrl) {
      return imageUrl;
    }
  }
  return extractFn(source);
}

export function randomTaskId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
