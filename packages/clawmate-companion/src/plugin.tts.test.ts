import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import registerClawMateCompanion, { __testing } from "./plugin";

type HookHandler = (event: unknown, ctx: Record<string, unknown>) => Promise<unknown> | unknown;
type ToolFactory = (ctx: Record<string, unknown>) => Array<{
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}>;

function createMockApi(
  pluginConfig: Record<string, unknown> = {},
  extraApi: Record<string, unknown> = {},
) {
  const hooks = new Map<string, HookHandler[]>();
  let toolFactory: ToolFactory | null = null;

  const api = {
    resolvePath(input: string) {
      return input;
    },
    pluginConfig,
    on(hookName: string, handler: HookHandler) {
      const list = hooks.get(hookName) ?? [];
      list.push(handler);
      hooks.set(hookName, list);
    },
    registerTool(tool: unknown) {
      if (typeof tool === "function") {
        toolFactory = tool as ToolFactory;
        return;
      }
      throw new Error("expected tool factory");
    },
    ...extraApi,
  };

  registerClawMateCompanion(api as never);

  return {
    api,
    getHook(name: string) {
      const list = hooks.get(name) ?? [];
      assert.ok(list.length > 0, `missing hook: ${name}`);
      return list[0]!;
    },
    getToolFactory() {
      assert.ok(toolFactory, "missing tool factory");
      return toolFactory;
    },
  };
}

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("resolveRuntimeConfig applies direct tts apiKey overrides", () => {
  const api = {
    resolvePath(input: string) {
      return input;
    },
    pluginConfig: {
      tts: {
        enabled: true,
        provider: "aliyun-official",
        official: {
          model: "qwen3-tts-flash",
          voice: "Chelsie",
          apiKey: "shared-tts-key",
        },
      },
      agents: {
        "ding-work": {
          tts: {
            official: {
              voice: "Cherry",
              apiKey: "work-tts-key",
            },
          },
        },
      },
    },
  };

  const defaultConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-main" });
  assert.equal(defaultConfig.tts.enabled, true);
  assert.equal(defaultConfig.tts.provider, "aliyun-official");
  assert.equal(defaultConfig.tts.official.voice, "Chelsie");
  assert.equal(defaultConfig.tts.official.apiKey, "shared-tts-key");

  const workConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-work" });
  assert.equal(workConfig.tts.enabled, true);
  assert.equal(workConfig.tts.official.model, "qwen3-tts-flash");
  assert.equal(workConfig.tts.official.voice, "Cherry");
  assert.equal(workConfig.tts.official.apiKey, "work-tts-key");
});

test("before_agent_start adds TTS prependContext when TTS is enabled", async () => {
  const workspaceDir = await makeTempDir("clawmate-tts-workspace-");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    tts: {
      enabled: true,
    },
  });

  const hook = plugin.getHook("before_agent_start");
  const result = await hook({}, {
    agentId: "ding-main",
    workspaceDir,
    sessionId: "session-1",
  });

  assert.ok(result && typeof result === "object");
  assert.match(String((result as { prependContext?: string }).prependContext ?? ""), /clawmate-companion-tts skill/);
});

test("clawmate_generate_tts returns structured failure when disabled", async () => {
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    tts: {
      enabled: false,
    },
  });
  const toolFactory = plugin.getToolFactory();
  const tools = toolFactory({ agentId: "ding-main", sessionId: "tts-disabled" });
  const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
  assert.ok(ttsTool);

  const result = await ttsTool.execute("tool-tts-disabled", { text: "你好呀" });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(payload.message, /语音功能未启用/);
  assert.match(payload.error, /TTS_NOT_ENABLED/);
});

test("clawmate_generate_tts returns structured failure when apiKey is missing", async () => {
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    tts: {
      enabled: true,
    },
  });
  const toolFactory = plugin.getToolFactory();
  const tools = toolFactory({ agentId: "ding-main", sessionId: "tts-missing-key" });
  const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
  assert.ok(ttsTool);

  const result = await ttsTool.execute("tool-tts-missing-key", { text: "我想抱抱你。" });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(payload.message, /语音暂时发送失败/);
  assert.match(payload.error, /TTS_API_KEY_MISSING/);
});

test("clawmate_generate_tts returns local audio path on success", async () => {
  const workspaceDir = await makeTempDir("clawmate-tts-success-");
  const previousOpenClawHome = process.env.OPENCLAW_HOME;
  const originalFetch = globalThis.fetch;

  process.env.OPENCLAW_HOME = workspaceDir;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/services/aigc/multimodal-generation/generation")) {
      return new Response(
        JSON.stringify({
          output: {
            audio: {
              url: "https://example.com/generated-audio.wav",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-dashscope-request-id": "req-tts-1",
          },
        },
      );
    }

    if (url === "https://example.com/generated-audio.wav") {
      return new Response(Buffer.from("RIFFTEST"), {
        status: 200,
        headers: {
          "content-type": "audio/wav",
        },
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    const plugin = createMockApi({
      selectedCharacter: "brooke",
      tts: {
        enabled: true,
        provider: "aliyun-official",
        official: {
          apiKey: "test-key",
        },
      },
    });

    const hook = plugin.getHook("before_agent_start");
    await hook({}, {
      agentId: "ding-main",
      workspaceDir,
      sessionId: "session-tts-success",
    });

    const toolFactory = plugin.getToolFactory();
    const tools = toolFactory({ agentId: "ding-main", sessionId: "tts-success" });
    const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
    assert.ok(ttsTool);

    const result = await ttsTool.execute("tool-tts-success", { text: "晚安呀，今天辛苦啦。早点休息，我陪着你。" });
    const payload = JSON.parse(result.content[0]?.text ?? "{}");

    assert.equal(payload.ok, true);
    assert.equal(payload.requestId, "req-tts-1");
    assert.equal(payload.voice, "Chelsie");
    assert.ok(path.isAbsolute(payload.audioPath));
    assert.deepEqual(payload.delivery, {
      attempted: false,
      delivered: false,
      method: null,
      reason: "RUNTIME_CAPABILITY_MISSING",
    });
    assert.equal(payload.nextAction, "use_audio_path_to_send_voice");

    await fs.access(payload.audioPath);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOpenClawHome === undefined) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previousOpenClawHome;
    }
  }
});

test("clawmate_generate_tts marks delivery success when runtime sendVoiceMessage is available", async () => {
  const workspaceDir = await makeTempDir("clawmate-tts-delivery-");
  const previousOpenClawHome = process.env.OPENCLAW_HOME;
  const originalFetch = globalThis.fetch;
  const sentPayloads: Array<Record<string, unknown>> = [];

  process.env.OPENCLAW_HOME = workspaceDir;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/services/aigc/multimodal-generation/generation")) {
      return new Response(
        JSON.stringify({
          output: {
            audio: {
              url: "https://example.com/generated-audio.wav",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-dashscope-request-id": "req-tts-2",
          },
        },
      );
    }

    if (url === "https://example.com/generated-audio.wav") {
      return new Response(Buffer.from("RIFFTEST"), {
        status: 200,
        headers: {
          "content-type": "audio/wav",
        },
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    const plugin = createMockApi(
      {
        selectedCharacter: "brooke",
        tts: {
          enabled: true,
          provider: "aliyun-official",
          official: {
            apiKey: "test-key",
          },
        },
      },
      {
        async sendVoiceMessage(payload: Record<string, unknown>) {
          sentPayloads.push(payload);
        },
      },
    );

    const toolFactory = plugin.getToolFactory();
    const tools = toolFactory({
      agentId: "ding-main",
      sessionId: "tts-delivery",
      messageChannel: "telegram",
      requesterSenderId: "user-1",
    });
    const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
    assert.ok(ttsTool);

    const result = await ttsTool.execute("tool-tts-delivery", { text: "给你一个晚安抱抱。" });
    const payload = JSON.parse(result.content[0]?.text ?? "{}");

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.delivery, {
      attempted: true,
      delivered: true,
      method: "sendVoiceMessage",
    });
    assert.equal(payload.nextAction, undefined);
    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0]?.channelId, "telegram");
    assert.equal(sentPayloads[0]?.requesterSenderId, "user-1");
    assert.equal(sentPayloads[0]?.text, "给你一个晚安抱抱。");
    assert.ok(typeof sentPayloads[0]?.audioPath === "string");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOpenClawHome === undefined) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previousOpenClawHome;
    }
  }
});
