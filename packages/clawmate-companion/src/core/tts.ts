import { ClawMateError } from "./errors";
import { generateAliyunCloneTts } from "./tts/aliyun-clone";
import { generateAliyunTts } from "./tts/aliyun";
import type { ClawMateConfig, GenerateTtsResult } from "./types";

export interface GenerateTtsOptions {
  text: string;
  config: ClawMateConfig;
  fetchImpl?: typeof fetch;
}

export async function generateTts(options: GenerateTtsOptions): Promise<GenerateTtsResult> {
  const { text, config, fetchImpl } = options;
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {
      ok: false,
      message: "语音内容不能为空。",
      error: "TTS_EMPTY_TEXT",
    };
  }

  if (!config.tts.enabled) {
    return {
      ok: false,
      message: "语音功能未启用，我先打字陪你。",
      error: "TTS_NOT_ENABLED",
    };
  }

  const apiKey =
    config.tts.provider === "aliyun-clone" ? config.tts.clone.apiKey.trim() : config.tts.official.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      message: config.tts.degradeMessage,
      error: "TTS_API_KEY_MISSING",
    };
  }

  try {
    const result =
      config.tts.provider === "aliyun-clone"
        ? await generateCloneTts(trimmedText, config, fetchImpl)
        : await generateOfficialTts(trimmedText, config, fetchImpl);

    return {
      ok: true,
      audioUrl: result.audioUrl,
      requestId: result.requestId,
      model: result.model,
      voice: result.voice,
    };
  } catch (error) {
    const typedError =
      error instanceof ClawMateError
        ? error
        : new ClawMateError(error instanceof Error ? error.message : String(error), {
            code: "TTS_UNKNOWN_ERROR",
          });

    return {
      ok: false,
      message: config.tts.degradeMessage,
      error: typedError.message,
      requestId: typedError.requestId,
    };
  }
  
  async function generateOfficialTts(text: string, config: ClawMateConfig, fetchImpl?: typeof fetch) {
    return generateAliyunTts({
      text,
      model: config.tts.official.model,
      voice: config.tts.official.voice,
      languageType: config.tts.official.languageType,
      apiKey: config.tts.official.apiKey,
      baseUrl: config.tts.official.baseUrl,
      fetchImpl,
    });
  }
  
  async function generateCloneTts(text: string, config: ClawMateConfig, fetchImpl?: typeof fetch) {
    if (!config.tts.clone.modelId.trim()) {
      throw new ClawMateError("请先完成复刻音色模型创建并配置 modelId", {
        code: "TTS_CLONE_MODEL_ID_MISSING",
      });
    }
  
    return generateAliyunCloneTts({
      text,
      apiKey: config.tts.clone.apiKey,
      baseUrl: config.tts.clone.baseUrl,
      model: config.tts.clone.synthesisModel,
      modelId: config.tts.clone.modelId,
      speaker: config.tts.clone.speaker,
      fetchImpl,
    });
  }
}
