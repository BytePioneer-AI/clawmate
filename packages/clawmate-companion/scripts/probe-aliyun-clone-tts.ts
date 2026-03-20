import process from "node:process";
import {
  createAliyunCloneVoiceModel,
  generateAliyunCloneTts,
  pollAliyunCloneVoiceModel,
} from "../src/core/tts/aliyun-clone";

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(" ").trim() || "你好呀，这是复刻音色测试。";
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/api/v1").replace(/\/+$/, "");
  const targetModel = process.env.CLAWMATE_TTS_CLONE_TARGET_MODEL?.trim() || "cosyvoice-v1";
  const synthesisModel = process.env.CLAWMATE_TTS_CLONE_SYNTHESIS_MODEL?.trim() || "cosyvoice-clone-v1";
  const promptAudioUrl = process.env.CLAWMATE_TTS_CLONE_PROMPT_AUDIO_URL?.trim() || "";
  const speaker = process.env.CLAWMATE_TTS_CLONE_SPEAKER?.trim() || "";
  const statusUrl = (process.env.CLAWMATE_TTS_CLONE_STATUS_URL?.trim() || baseUrl).replace(/\/+$/, "");
  let modelId = process.env.CLAWMATE_TTS_CLONE_MODEL_ID?.trim() || "";

  if (!apiKey) {
    console.error("Missing DASHSCOPE_API_KEY");
    process.exitCode = 1;
    return;
  }

  if (!modelId) {
    if (!promptAudioUrl) {
      console.error("Missing CLAWMATE_TTS_CLONE_PROMPT_AUDIO_URL");
      process.exitCode = 1;
      return;
    }

    const created = await createAliyunCloneVoiceModel({
      apiKey,
      baseUrl,
      targetModel,
      speaker,
      promptAudioUrl,
    });

    console.log(JSON.stringify({ stage: "create", ...created }, null, 2));

    modelId = created.modelId ?? "";
    if (!modelId && created.taskId) {
      const polled = await pollAliyunCloneVoiceModel({
        apiKey,
        statusUrl,
        taskId: created.taskId,
      });
      console.log(JSON.stringify({ stage: "poll", ...polled }, null, 2));
      modelId = polled.modelId ?? "";
    }
  }

  if (!modelId) {
    console.error("Unable to resolve clone modelId");
    process.exitCode = 1;
    return;
  }

  const result = await generateAliyunCloneTts({
    text,
    apiKey,
    baseUrl,
    model: synthesisModel,
    modelId,
    speaker,
  });

  console.log(JSON.stringify({ stage: "synthesis", modelId, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
