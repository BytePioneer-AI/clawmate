const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

function toOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildCloneCustomizationUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/services/audio/tts/customization`;
}

function normalizeClonePrefix(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 9);
  return normalized || "clawmate";
}

async function parseJsonBody(response) {
  const requestId =
    response.headers.get("x-dashscope-request-id") ??
    response.headers.get("x-request-id") ??
    null;

  let rawText = "";
  let body = null;
  try {
    rawText = await response.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    const err = new Error("TTS provider 响应解析失败");
    err.code = "TTS_RESPONSE_PARSE_ERROR";
    err.requestId = requestId;
    err.details = {
      cause: error instanceof Error ? error.message : String(error),
      responseText: rawText,
    };
    throw err;
  }

  if (!response.ok) {
    const err = new Error(toOptionalString(body?.message) ?? `TTS provider 请求失败: HTTP ${response.status}`);
    err.code = toOptionalString(body?.code) ?? "TTS_PROVIDER_HTTP_ERROR";
    err.requestId = requestId;
    err.details = body;
    throw err;
  }

  return { requestId, body, rawText };
}

async function createAliyunCloneVoiceModel(options) {
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

async function pollAliyunCloneVoiceModel(options) {
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
      const err = new Error("复刻语音模型创建失败");
      err.code = "TTS_CLONE_MODEL_CREATE_FAILED";
      err.requestId = requestId;
      err.details = body;
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const err = new Error("等待复刻语音模型完成超时");
  err.code = "TTS_CLONE_MODEL_TIMEOUT";
  err.details = {
    taskId: options.taskId,
    maxAttempts,
    pollIntervalMs,
  };
  throw err;
}

module.exports = {
  createAliyunCloneVoiceModel,
  pollAliyunCloneVoiceModel,
};
