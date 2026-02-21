#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface ParsedArgs {
  [key: string]: string;
}

interface ProviderLikeConfig {
  baseUrl?: string;
  base_url?: string;
  apiKey?: string;
  api_key?: string;
  endpoint?: string;
  model?: string;
  headers?: Record<string, string>;
  extra_body?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
}

interface ProbeConfig {
  baseUrl: string;
  apiKey: string | null;
  endpoint: string;
  model: string;
  headers: Record<string, string>;
  extraBody: Record<string, unknown>;
  prompt: string;
  imagePath: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    parsed[key] = value;
    if (value !== "true") {
      i += 1;
    }
  }
  return parsed;
}

function printHelp(): void {
  const helpText = `
Usage:
  node --import tsx probe-openai-edits.ts [options]

Options:
  --openclaw-config <path>   OpenClaw config path (default: ~/.openclaw/openclaw.json)
  --provider <name>          Provider key under providers (default: openai)
  --base-url <url>           Override baseUrl
  --api-key <key>            Override apiKey
  --endpoint <path|url>      Override endpoint (default: /images/edits)
  --model <name>             Override model
  --prompt <text>            Prompt (default: "Draw a futuristic city")
  --image <path>             Reference image path (required unless extra_body already specifies image)
  --timeout-ms <ms>          Request timeout ms (default: 60000)
  --show-body <true|false>   Print response body fully (default: false)
  --help                     Show this help

Examples:
  node --import tsx probe-openai-edits.ts --provider openai --image ./reference.png
  node --import tsx probe-openai-edits.ts --base-url http://127.0.0.1:8045/v1 --api-key sk-xxx --model gemini-3-pro-image --image ./reference.png
`.trim();
  process.stdout.write(`${helpText}\n`);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asStringRecord(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  const result: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.length > 0) {
      result[key] = v;
    }
  }
  return result;
}

function resolveHomePath(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function getByPath(source: unknown, dottedPath: string): unknown {
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

function isLikelyBase64(text: string): boolean {
  return text.length >= 4 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function detectImageMime(base64: string): string {
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

function asImageDataUrl(base64: string): string {
  return `data:${detectImageMime(base64)};base64,${base64}`;
}

function normalizeRawBase64(text: string): string {
  return text.replace(/\s+/g, "").replace(/^[("'\s]+|[)"'\s]+$/g, "");
}

function findBase64InText(text: string): string | null {
  const markdownWrapped = text.match(/\(([A-Za-z0-9+/]{16,}={0,2})\)/);
  if (markdownWrapped) {
    const normalized = normalizeRawBase64(markdownWrapped[1]);
    if (isLikelyBase64(normalized)) {
      return normalized;
    }
  }

  const rawMatch = text.match(/([A-Za-z0-9+/]{100,}={0,2})/);
  if (rawMatch) {
    const normalized = normalizeRawBase64(rawMatch[1]);
    if (isLikelyBase64(normalized)) {
      return normalized;
    }
  }

  return null;
}

function extractImageUrl(value: unknown, hintPath = "", depth = 0): string | null {
  if (depth > 6 || value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if ((/b64|base64/i.test(hintPath) || trimmed.length >= 128) && isLikelyBase64(trimmed)) {
      return asImageDataUrl(trimmed);
    }
    const embeddedBase64 = findBase64InText(trimmed);
    if (embeddedBase64) {
      return asImageDataUrl(embeddedBase64);
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractImageUrl(item, hintPath, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractImageUrl(record.url, "url", depth + 1) ??
      extractImageUrl(record.image_url, "image_url", depth + 1) ??
      extractImageUrl(record.b64_json, "b64_json", depth + 1) ??
      extractImageUrl(record.image_base64, "image_base64", depth + 1) ??
      extractImageUrl(record.text, "text", depth + 1) ??
      extractImageUrl(record.value, "value", depth + 1);
    if (direct) {
      return direct;
    }
    for (const nestedKey of ["content", "message", "output", "data", "images", "choices", "result"]) {
      const candidate = extractImageUrl(record[nestedKey], nestedKey, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function buildUrl(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function appendMultipartField(form: FormData, key: string, value: unknown): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    form.append(key, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
    return;
  }
  form.append(key, JSON.stringify(value));
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

async function loadProviderFromOpenclawConfig(filePath: string, providerName: string): Promise<ProviderLikeConfig> {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const provider = getByPath(
    parsed,
    `plugins.entries.clawmate-companion.config.providers.${providerName}`,
  ) as ProviderLikeConfig | undefined;
  if (!provider || typeof provider !== "object") {
    throw new Error(`未在 ${filePath} 找到 provider: ${providerName}`);
  }
  return provider;
}

async function buildProbeConfig(args: ParsedArgs): Promise<ProbeConfig> {
  const openclawConfigPath = resolveHomePath(args["openclaw-config"] ?? "~/.openclaw/openclaw.json");
  const providerName = args.provider ?? "openai";
  const fileProvider = await loadProviderFromOpenclawConfig(openclawConfigPath, providerName);

  const baseUrl = toOptionalString(args["base-url"] ?? fileProvider.baseUrl ?? fileProvider.base_url)?.trim();
  const apiKey = toOptionalString(args["api-key"] ?? fileProvider.apiKey ?? fileProvider.api_key)?.trim() ?? null;
  const endpoint = toOptionalString(args.endpoint ?? fileProvider.endpoint)?.trim() ?? "/images/edits";
  const model = toOptionalString(args.model ?? fileProvider.model)?.trim();
  const prompt = args.prompt ?? "Draw a futuristic city";
  const imagePath = args.image ? path.resolve(args.image) : "";
  const headers = {
    ...asStringRecord(fileProvider.headers),
  };
  const extraBody = {
    ...asRecord(fileProvider.extra_body),
    ...asRecord(fileProvider.extraBody),
  };

  if (!baseUrl) {
    throw new Error("缺少 baseUrl（可通过 --base-url 或 openclaw.json provider.baseUrl 提供）");
  }
  if (!model) {
    throw new Error("缺少 model（可通过 --model 或 openclaw.json provider.model 提供）");
  }
  if (!endpoint.toLowerCase().includes("/images/edits")) {
    throw new Error(`当前脚本仅测试 /images/edits，收到 endpoint=${endpoint}`);
  }

  return {
    baseUrl,
    apiKey,
    endpoint,
    model,
    headers,
    extraBody,
    prompt,
    imagePath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    printHelp();
    return;
  }

  const timeoutMs = Number(args["timeout-ms"] ?? "60000");
  const showBody = args["show-body"] === "true";
  const config = await buildProbeConfig(args);
  const url = buildUrl(config.baseUrl, config.endpoint);

  const body = new FormData();
  body.set("model", config.model);
  body.set("prompt", config.prompt);
  for (const [key, value] of Object.entries(config.extraBody)) {
    appendMultipartField(body, key, value);
  }

  const imagesSpecified =
    hasOwn(config.extraBody, "images") ||
    hasOwn(config.extraBody, "image") ||
    hasOwn(config.extraBody, "image_url") ||
    hasOwn(config.extraBody, "input_image");

  if (!imagesSpecified) {
    if (!config.imagePath) {
      throw new Error("未检测到 extra_body 中的图片字段，请使用 --image 提供参考图");
    }
    const fileData = await fs.readFile(config.imagePath);
    const ext = path.extname(config.imagePath).toLowerCase();
    const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    const blob = new Blob([fileData], { type: mimeType });
    body.set("image", blob, path.basename(config.imagePath));
  }

  const headers = new Headers(config.headers);
  if (config.apiKey) {
    headers.set("authorization", `Bearer ${config.apiKey}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
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

  const requestId =
    toOptionalString(getByPath(parsed, "request_id")) ??
    toOptionalString(getByPath(parsed, "requestId")) ??
    toOptionalString(getByPath(parsed, "id")) ??
    response.headers.get("x-request-id");
  const imageUrl =
    extractImageUrl(getByPath(parsed, "data.0.url"), "data.0.url") ??
    extractImageUrl(getByPath(parsed, "output.0.url"), "output.0.url") ??
    extractImageUrl(getByPath(parsed, "data.0.b64_json"), "data.0.b64_json") ??
    extractImageUrl(getByPath(parsed, "output.0.b64_json"), "output.0.b64_json") ??
    extractImageUrl(parsed);

  const result = {
    ok: response.ok && Boolean(imageUrl),
    status: response.status,
    url,
    requestId,
    hasImage: Boolean(imageUrl),
    imagePreview: imageUrl ? `${imageUrl.slice(0, 80)}${imageUrl.length > 80 ? "..." : ""}` : null,
    responseHeaders: {
      contentType: response.headers.get("content-type"),
      mappedModel: response.headers.get("x-mapped-model"),
      requestIdHeader: response.headers.get("x-request-id"),
    },
    rawBodyType: typeof parsed,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (showBody) {
    process.stdout.write(`${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}\n`);
  }

  if (!response.ok) {
    process.exitCode = 2;
    return;
  }
  if (!imageUrl) {
    process.exitCode = 3;
  }
}

main().catch((error: unknown) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
