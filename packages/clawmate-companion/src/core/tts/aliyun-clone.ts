import crypto from "node:crypto";
import { ClawMateError } from "../errors";
import { createLogger } from "../logger";

export interface CreateAliyunCloneVoiceModelOptions {
  apiKey: string;
  baseUrl: string;
  targetModel: string;
  speaker?: string;
  promptAudioUrl: string;
  promptText?: string;
  fetchImpl?: typeof fetch;
}

export interface CreateAliyunCloneVoiceModelResult {
  requestId: string | null;
  modelId: string | null;
  taskId: string | null;
  status: string | null;
  raw: unknown;
}

export interface PollAliyunCloneVoiceModelOptions {
  apiKey: string;
  statusUrl: string;
  taskId: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
}

export interface GenerateAliyunCloneTtsOptions {
  text: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  modelId: string;
  speaker?: string;
  fetchImpl?: typeof fetch;
}

export interface GenerateAliyunCloneTtsResult {
  audioUrl: string;
  requestId: string | null;
  model: string;
  voice: string;
}

interface CloneApiBody {
  output?: {
    audio?: {
      url?: unknown;
    };
    voice_id?: unknown;
    model_id?: unknown;
    task_id?: unknown;
    status?: unknown;
  };
  data?: {
    id?: unknown;
    task_id?: unknown;
    status?: unknown;
    model_id?: unknown;
  };
  code?: unknown;
  message?: unknown;
}

interface CloneWsEventEnvelope {
  header?: {
    event?: unknown;
    task_id?: unknown;
  };
}

const logger = createLogger("clawmate-tts");

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildGenerationUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/services/aigc/multimodal-generation/generation`;
}

function buildCloneCustomizationUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/services/audio/tts/customization`;
}

function buildWebsocketUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.startsWith("https://")) {
    return normalized.replace("https://", "wss://").replace(/\/api\/v1$/, "/api-ws/v1/inference");
  }
  if (normalized.startsWith("http://")) {
    return normalized.replace("http://", "ws://").replace(/\/api\/v1$/, "/api-ws/v1/inference");
  }
  return normalized;
}

function normalizeClonePrefix(value: string | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 9);
  return normalized || "clawmate";
}

async function parseJsonBody(response: Response): Promise<{ requestId: string | null; body: CloneApiBody | null; rawText: string }> {
  const requestId =
    response.headers.get("x-dashscope-request-id") ??
    response.headers.get("x-request-id") ??
    null;

  let rawText = "";
  let body: CloneApiBody | null = null;
  try {
    rawText = await response.text();
    body = rawText ? (JSON.parse(rawText) as CloneApiBody) : null;
  } catch (error) {
    throw new ClawMateError("TTS provider 响应解析失败", {
      code: "TTS_RESPONSE_PARSE_ERROR",
      transient: true,
      requestId,
      details: {
        cause: error instanceof Error ? error.message : String(error),
        responseText: rawText,
      },
    });
  }

  if (!response.ok) {
    throw new ClawMateError(toOptionalString(body?.message) ?? `TTS provider 请求失败: HTTP ${response.status}`, {
      code: toOptionalString(body?.code) ?? "TTS_PROVIDER_HTTP_ERROR",
      transient: response.status >= 500,
      requestId,
      details: body,
    });
  }

  return { requestId, body, rawText };
}

export async function createAliyunCloneVoiceModel(
  options: CreateAliyunCloneVoiceModelOptions,
): Promise<CreateAliyunCloneVoiceModelResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildCloneCustomizationUrl(options.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voice-enrollment",
      input: {
        action: "create_voice",
        target_model: options.targetModel,
        prefix: normalizeClonePrefix(options.speaker),
        url: options.promptAudioUrl,
      },
    }),
  });

  const { requestId, body } = await parseJsonBody(response);
  return {
    requestId,
    modelId:
      toOptionalString(body?.output?.voice_id) ??
      toOptionalString(body?.output?.model_id) ??
      toOptionalString(body?.data?.model_id) ??
      toOptionalString(body?.data?.id),
    taskId: toOptionalString(body?.output?.task_id) ?? toOptionalString(body?.data?.task_id),
    status: toOptionalString(body?.output?.status) ?? toOptionalString(body?.data?.status),
    raw: body,
  };
}

export async function pollAliyunCloneVoiceModel(
  options: PollAliyunCloneVoiceModelOptions,
): Promise<CreateAliyunCloneVoiceModelResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 60;
  const pollIntervalMs = options.pollIntervalMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(buildCloneCustomizationUrl(options.statusUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "voice-enrollment",
        input: {
          action: "query_voice",
          voice_id: options.taskId,
        },
      }),
    });

    const { requestId, body } = await parseJsonBody(response);
    const status = toOptionalString(body?.output?.status) ?? toOptionalString(body?.data?.status);
    const modelId =
      toOptionalString(body?.output?.voice_id) ??
      toOptionalString(body?.output?.model_id) ??
      toOptionalString(body?.data?.model_id) ??
      toOptionalString(body?.data?.id);

    if (status === "OK" || status === "SUCCEEDED" || status === "SUCCESS" || modelId) {
      return {
        requestId,
        modelId,
        taskId: options.taskId,
        status,
        raw: body,
      };
    }

    if (status === "FAILED" || status === "UNDEPLOYED") {
      throw new ClawMateError("复刻语音模型创建失败", {
        code: "TTS_CLONE_MODEL_CREATE_FAILED",
        requestId,
        details: body,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new ClawMateError("等待复刻语音模型完成超时", {
    code: "TTS_CLONE_MODEL_TIMEOUT",
    transient: true,
    details: {
      taskId: options.taskId,
      maxAttempts,
      pollIntervalMs,
    },
  });
}

async function resolveWebSocketConstructor(): Promise<typeof WebSocket> {
  try {
    const wsModule = await import("ws");
    const ctor = wsModule.WebSocket ?? wsModule.default;
    if (ctor) {
      return ctor as typeof WebSocket;
    }
  } catch {
    // fall through to global WebSocket check
  }

  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }

  throw new ClawMateError("当前环境缺少 WebSocket 支持，请安装 ws 依赖", {
    code: "TTS_WEBSOCKET_UNAVAILABLE",
  });
}

function encodeAudioAsDataUrl(chunks: Uint8Array[]): string {
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
}

export async function generateAliyunCloneTts(
  options: GenerateAliyunCloneTtsOptions,
): Promise<GenerateAliyunCloneTtsResult> {
  const WebSocketCtor = await resolveWebSocketConstructor();
  const websocketUrl = buildWebsocketUrl(options.baseUrl);
  const taskId = crypto.randomUUID().replace(/-/g, "");
  const audioChunks: Uint8Array[] = [];

  return await new Promise<GenerateAliyunCloneTtsResult>((resolve, reject) => {
    let settled = false;
    let started = false;
    let requestId: string | null = null;
    const socket = new (WebSocketCtor as unknown as {
      new (url: string, protocols?: string | string[], options?: { headers?: Record<string, string> }): WebSocket;
    })(websocketUrl, undefined, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    });

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      handler();
      try {
        socket.close();
      } catch {
        // ignore close errors
      }
    };

    const sendJson = (payload: Record<string, unknown>) => {
      socket.send(JSON.stringify(payload));
    };

    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      sendJson({
        header: {
          action: "run-task",
          task_id: taskId,
          streaming: "duplex",
        },
        payload: {
          model: options.model,
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          input: {},
          parameters: {
            voice: options.modelId,
            volume: 50,
            text_type: "PlainText",
            sample_rate: 22050,
            rate: 1,
            format: "mp3",
            pitch: 1,
            seed: 0,
            type: 0,
            enable_ssml: true,
          },
        },
      });
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        let envelope: CloneWsEventEnvelope | null = null;
        try {
          envelope = JSON.parse(event.data) as CloneWsEventEnvelope;
        } catch {
          logger.error("复刻语音 WebSocket 文本事件解析失败", {
            responseText: event.data,
            taskId,
          });
          finish(() =>
            reject(
              new ClawMateError("TTS provider 响应解析失败", {
                code: "TTS_RESPONSE_PARSE_ERROR",
                details: { responseText: event.data },
              }),
            ),
          );
          return;
        }

        const eventName = toOptionalString(envelope?.header?.event);
        requestId = toOptionalString(envelope?.header?.task_id) ?? requestId;

        logger.info("复刻语音 WebSocket 事件", {
          event: eventName,
          requestId,
          envelope,
        });

        if (eventName === "task-started") {
          started = true;
          sendJson({
            header: {
              action: "continue-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: {
              model: options.model,
              task_group: "audio",
              task: "tts",
              function: "SpeechSynthesizer",
              input: {
                text: options.text,
              },
            },
          });
          sendJson({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: {
              input: {},
            },
          });
          return;
        }

        if (eventName === "task-finished") {
          if (!audioChunks.length) {
            finish(() =>
              reject(
                new ClawMateError("TTS provider 响应中缺少 audio url", {
                  code: "TTS_AUDIO_URL_MISSING",
                  requestId,
                }),
              ),
            );
            return;
          }

          finish(() =>
            resolve({
              audioUrl: encodeAudioAsDataUrl(audioChunks),
              requestId,
              model: options.model,
              voice: options.speaker?.trim() || options.modelId,
            }),
          );
          return;
        }

        if (eventName === "task-failed") {
          logger.error("复刻语音 WebSocket 任务失败", {
            requestId,
            envelope,
            model: options.model,
            modelId: options.modelId,
            speaker: options.speaker,
          });
          finish(() =>
            reject(
              new ClawMateError("复刻语音合成失败", {
                code: "TTS_PROVIDER_HTTP_ERROR",
                requestId,
                details: envelope,
              }),
            ),
          );
        }
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        audioChunks.push(new Uint8Array(event.data));
        return;
      }

      logger.error("复刻语音 WebSocket 返回了不支持的音频数据格式", {
        requestId,
        dataType: typeof event.data,
      });
      finish(() =>
        reject(
          new ClawMateError("TTS provider 返回了不支持的音频数据格式", {
            code: "TTS_AUDIO_DATA_INVALID",
            requestId,
            details: { dataType: typeof event.data },
          }),
        ),
      );
    };

    socket.onerror = (event) => {
      logger.error("复刻语音 WebSocket 连接失败", {
        requestId,
        taskId,
        event,
        model: options.model,
        modelId: options.modelId,
        started,
      });
      finish(() =>
        reject(
          new ClawMateError(started ? "复刻语音合成连接失败" : "复刻语音合成启动失败", {
            code: "TTS_WEBSOCKET_ERROR",
            requestId,
          }),
        ),
      );
    };

    socket.onclose = (event) => {
      if (settled) {
        return;
      }
      logger.error("复刻语音 WebSocket 连接已关闭", {
        requestId,
        taskId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        started,
      });
      finish(() =>
        reject(
          new ClawMateError("复刻语音合成连接已关闭", {
            code: "TTS_WEBSOCKET_CLOSED",
            requestId,
            details: {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
              started,
            },
          }),
        ),
      );
    };
  });
}
