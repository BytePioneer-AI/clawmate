#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

interface ParsedArgs {
  [key: string]: string;
}

interface ProbeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  endpoint: string;
  prompt: string;
  negativePrompt: string | null;
  size: string | null;
  imagePath: string | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  showBody: boolean;
  savePath: string | null;
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
  const help = `
Usage:
  node --import tsx probe-modelscope-async.ts [options]

Options:
  --base-url <url>          Base URL (default: https://api-inference.modelscope.cn/v1)
  --api-key <key>           Required ModelScope token
  --model <id>              Model ID (default: Qwen/Qwen-Image-Edit-2511)
  --endpoint <path|url>     Submit endpoint (default: /images/generations)
  --prompt <text>           Prompt (default: "A golden cat")
  --negative-prompt <text>  Optional negative prompt
  --size <WxH>              Optional size, e.g. 1024x1024
  --image <path>            Optional local image path; sent as image_url(data URL)
  --poll-interval-ms <ms>   Poll interval (default: 1000)
  --poll-timeout-ms <ms>    Poll timeout (default: 180000)
  --save <path>             Optional path to save the output image
  --show-body <true|false>  Print full submit/final poll body (default: true)
  --help                    Show help

Example:
  node --import tsx probe-modelscope-async.ts --api-key ms-xxx --prompt "A golden cat" --image ./reference.png --save ./result.jpg
`.trim();
  process.stdout.write(`${help}\n`);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function buildUrl(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function detectMimeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  return "image/png";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyBase64(text: string): boolean {
  return text.length >= 16 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function asImageDataUrl(base64: string): string {
  return `data:${detectImageMime(base64)};base64,${base64}`;
}

function parseDataUrl(dataUrl: string): { mime: string; data: Buffer } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }
  return {
    mime: match[1] || "application/octet-stream",
    data: Buffer.from(match[2], "base64"),
  };
}

function extractImageUrl(value: unknown, depth = 0): string | null {
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
      const found = extractImageUrl(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractImageUrl(record.output_images, depth + 1) ??
      extractImageUrl(record.url, depth + 1) ??
      extractImageUrl(record.image_url, depth + 1) ??
      extractImageUrl(record.b64_json, depth + 1) ??
      extractImageUrl(record.image_base64, depth + 1);
    if (direct) {
      return direct;
    }
    for (const key of ["data", "output", "images", "result", "choices", "message", "content"]) {
      const found = extractImageUrl(record[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}

async function imagePathToDataUrl(imagePath: string): Promise<string> {
  const abs = path.resolve(imagePath);
  const file = await fs.readFile(abs);
  const mime = detectMimeByExt(abs);
  return `data:${mime};base64,${Buffer.from(file).toString("base64")}`;
}

async function saveImage(imageUrl: string, savePath: string, apiKey: string): Promise<string> {
  const absPath = path.resolve(savePath);

  if (/^data:image\//i.test(imageUrl)) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) {
      throw new Error("Invalid data URL image");
    }
    await fs.writeFile(absPath, parsed.data);
    return absPath;
  }

  const resp = await fetch(imageUrl, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Failed to download image: ${resp.status}`);
  }
  const data = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(absPath, data);
  return absPath;
}

async function buildConfig(args: ParsedArgs): Promise<ProbeConfig> {
  const baseUrl = toOptionalString(args["base-url"]) ?? "https://api-inference.modelscope.cn/v1";
  const apiKey = toOptionalString(args["api-key"]);
  const model = toOptionalString(args.model) ?? "Qwen/Qwen-Image-Edit-2511";
  const endpoint = toOptionalString(args.endpoint) ?? "/images/generations";
  const prompt = toOptionalString(args.prompt) ?? "A golden cat";
  const negativePrompt = toOptionalString(args["negative-prompt"]);
  const size = toOptionalString(args.size);
  const imagePath = toOptionalString(args.image);
  const savePath = toOptionalString(args.save);
  const pollIntervalMs = Number(toOptionalString(args["poll-interval-ms"]) ?? "1000");
  const pollTimeoutMs = Number(toOptionalString(args["poll-timeout-ms"]) ?? "180000");
  const showBody = (toOptionalString(args["show-body"]) ?? "true").toLowerCase() !== "false";

  if (!apiKey) {
    throw new Error("Missing --api-key");
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(`Invalid --poll-interval-ms: ${args["poll-interval-ms"] ?? ""}`);
  }
  if (!Number.isFinite(pollTimeoutMs) || pollTimeoutMs <= 0) {
    throw new Error(`Invalid --poll-timeout-ms: ${args["poll-timeout-ms"] ?? ""}`);
  }

  return {
    baseUrl,
    apiKey,
    model,
    endpoint,
    prompt,
    negativePrompt,
    size,
    imagePath,
    pollIntervalMs,
    pollTimeoutMs,
    showBody,
    savePath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    printHelp();
    return;
  }

  const config = await buildConfig(args);
  const submitUrl = buildUrl(config.baseUrl, config.endpoint);
  const body: Record<string, unknown> = {
    model: config.model,
    prompt: config.prompt,
  };

  if (config.negativePrompt) {
    body.negative_prompt = config.negativePrompt;
  }
  if (config.size) {
    body.size = config.size;
  }
  if (config.imagePath) {
    body.image_url = [await imagePathToDataUrl(config.imagePath)];
  }

  const submitResp = await fetch(submitUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "x-modelscope-async-mode": "true",
    },
    body: JSON.stringify(body),
  });
  const submitBody = await readJsonOrText(submitResp);
  const taskId =
    submitBody && typeof submitBody === "object" ? toOptionalString((submitBody as Record<string, unknown>).task_id) : null;

  if (!submitResp.ok || !taskId) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          step: "submit",
          status: submitResp.status,
          requestId: submitResp.headers.get("x-request-id"),
          taskId,
        },
        null,
        2,
      )}\n`,
    );
    if (config.showBody) {
      process.stdout.write(`${typeof submitBody === "string" ? submitBody : JSON.stringify(submitBody, null, 2)}\n`);
    }
    process.exitCode = 2;
    return;
  }

  const pollUrl = buildUrl(config.baseUrl, `/tasks/${taskId}`);
  const startedAt = Date.now();
  let pollCount = 0;
  let lastStatus: string | null = null;
  let finalBody: unknown = null;
  let finalRequestId: string | null = null;
  let imageUrl: string | null = null;

  while (Date.now() - startedAt < config.pollTimeoutMs) {
    pollCount += 1;
    const pollResp = await fetch(pollUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "x-modelscope-task-type": "image_generation",
      },
    });
    const pollBody = await readJsonOrText(pollResp);
    finalBody = pollBody;
    finalRequestId = pollResp.headers.get("x-request-id");

    if (!pollResp.ok) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: false,
            step: "poll",
            status: pollResp.status,
            requestId: finalRequestId,
            pollCount,
          },
          null,
          2,
        )}\n`,
      );
      if (config.showBody) {
        process.stdout.write(`${typeof pollBody === "string" ? pollBody : JSON.stringify(pollBody, null, 2)}\n`);
      }
      process.exitCode = 3;
      return;
    }

    const statusRaw =
      pollBody && typeof pollBody === "object"
        ? toOptionalString((pollBody as Record<string, unknown>).task_status) ??
          toOptionalString((pollBody as Record<string, unknown>).status)
        : null;
    const status = statusRaw ? statusRaw.toUpperCase() : "UNKNOWN";
    lastStatus = status;

    if (status === "SUCCEED" || status === "SUCCESS" || status === "COMPLETED") {
      imageUrl = extractImageUrl(pollBody);
      break;
    }
    if (status === "FAILED" || status === "FAIL" || status === "CANCELED") {
      break;
    }

    await sleep(config.pollIntervalMs);
  }

  let savedPath: string | null = null;
  if (imageUrl && config.savePath) {
    savedPath = await saveImage(imageUrl, config.savePath, config.apiKey);
  }

  const ok = Boolean(imageUrl);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        step: "poll",
        submitUrl,
        pollUrl,
        taskId,
        lastStatus,
        pollCount,
        requestId: finalRequestId ?? submitResp.headers.get("x-request-id"),
        hasImage: ok,
        imagePreview: imageUrl ? `${imageUrl.slice(0, 120)}${imageUrl.length > 120 ? "..." : ""}` : null,
        savedPath,
      },
      null,
      2,
    )}\n`,
  );
  if (config.showBody) {
    process.stdout.write(`${typeof finalBody === "string" ? finalBody : JSON.stringify(finalBody, null, 2)}\n`);
  }

  if (!ok) {
    process.exitCode = lastStatus && (lastStatus === "FAILED" || lastStatus === "FAIL" || lastStatus === "CANCELED") ? 4 : 5;
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
