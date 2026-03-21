const test = require("node:test");
const assert = require("node:assert/strict");

const { __testing } = require("../bin/cli.cjs");

test.afterEach(() => {
  __testing.setLang("zh");
});

test("normalizeAgents keeps unique ids and sorts default agent first", () => {
  const result = __testing.normalizeAgents([
    { id: "work", workspace: "C:\\work" },
    { id: "main", workspace: "C:\\main", isDefault: true },
    { id: "work", workspace: "C:\\duplicate" },
  ]);

  assert.deepEqual(result, [
    { id: "main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
    { id: "work", workspace: "C:\\work", routes: [], bindings: undefined, isDefault: false },
  ]);
});

test("hasConfiguredScopes counts shared defaults and agent enable/disable states", () => {
  assert.equal(__testing.hasConfiguredScopes({}), false);
  assert.equal(__testing.hasConfiguredScopes({
    selectedCharacter: "brooke-anime",
  }), true);
  assert.equal(__testing.hasConfiguredScopes({
    tts: {
      enabled: true,
      provider: "aliyun-official",
      official: {
        voice: "Chelsie",
      },
    },
  }), true);
  assert.equal(__testing.hasConfiguredScopes({
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  }), true);
  assert.equal(__testing.hasConfiguredScopes({
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }), true);
  assert.equal(__testing.hasConfiguredScopes({
    agents: {
      "ding-main": {
        enabled: false,
      },
    },
  }), true);
});

test("hasConfiguredAgentScopes ignores shared defaults and only counts agent entries", () => {
  assert.equal(__testing.hasConfiguredAgentScopes({}), false);
  assert.equal(__testing.hasConfiguredAgentScopes({
    selectedCharacter: "brooke-anime",
  }), false);
  assert.equal(__testing.hasConfiguredAgentScopes({
    tts: {
      enabled: true,
      provider: "aliyun-official",
      official: {
        voice: "Chelsie",
      },
    },
  }), false);
  assert.equal(__testing.hasConfiguredAgentScopes({
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  }), true);
});

test("buildConfigTargetMenu marks configured agent overrides", () => {
  const agents = [
    { id: "ding-main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
  ];

  const menu = __testing.buildConfigTargetMenu(agents, {
    selectedCharacter: "brooke",
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, true);

  assert.match(menu.items[1], /已配置|configured/);
  assert.match(menu.items[2], /\[(已配置|configured)\]/);
  assert.match(menu.items[2], /\[(已启用|enabled)\]/);
  assert.equal(menu.values[2]?.agentId, "ding-main");
});

test("buildConfigTargetMenu shows disabled status for stopped agents", () => {
  const agents = [
    { id: "ding-main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
  ];

  const menu = __testing.buildConfigTargetMenu(agents, {
    agents: {
      "ding-main": {
        enabled: false,
      },
    },
  }, true);

  assert.match(menu.items[2], /\[(已配置|configured)\]/);
  assert.match(menu.items[2], /\[(已停用|stopped)\]/);
});

test("buildConfigTargetMenu hides shared target when multiple agents exist", () => {
  const agents = [
    { id: "ding-main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
    { id: "ding-work", workspace: "C:\\work", routes: [], bindings: undefined, isDefault: false },
  ];

  const menu = __testing.buildConfigTargetMenu(agents, {
    selectedCharacter: "brooke",
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  }, true);

  assert.equal(menu.values[0]?.type, "finish");
  assert.equal(menu.values[1]?.type, "agent");
  assert.equal(menu.values[2]?.type, "agent");
  assert.equal(menu.values.some((item) => item.type === "shared"), false);
});

test("getConfigTargetInitialIndex prefers finish when it is available", () => {
  const agents = [
    { id: "main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
    { id: "ding-main", workspace: "C:\\ding-main", routes: [], bindings: undefined, isDefault: false },
  ];

  const withFinish = __testing.buildConfigTargetMenu(agents, {
    agents: {
      main: {
        enabled: true,
      },
    },
  }, true);
  const withoutFinish = __testing.buildConfigTargetMenu(agents, {}, false);

  assert.equal(__testing.getConfigTargetInitialIndex(withFinish), 0);
  assert.equal(__testing.getConfigTargetInitialIndex(withoutFinish), 0);
});

test("buildConfigTargetDetails only shows the selected agent details", () => {
  const agents = [
    {
      id: "ding-main",
      workspace: "C:\\main",
      routes: ["default (no explicit rules)"],
      bindings: 1,
      isDefault: true,
    },
    {
      id: "ding-work",
      workspace: "C:\\work",
      routes: [],
      bindings: 1,
      isDefault: false,
    },
  ];

  const details = __testing.buildConfigTargetDetails(agents, { type: "agent", agentId: "ding-work" });
  assert.equal(details.some((line) => /ding-work/.test(line)), true);
  assert.equal(details.some((line) => /ding-main/.test(line)), false);
  assert.equal(details.some((line) => /工作区|Workspace/.test(line)), true);
});

test("resolveScopeSettings marks shared fields as unconfigured on fresh install", () => {
  const result = __testing.resolveScopeSettings({}, { type: "agent", agentId: "ding-main" });

  assert.deepEqual(result.shared.configured, {
    selectedCharacter: false,
    defaultProvider: false,
    proactiveSelfie: false,
    tts: false,
  });
  assert.equal(result.currentCharacterId, "brooke");
  assert.equal(result.currentProviderKey, "mock");
  assert.deepEqual(result.currentProactiveSelfie, { enabled: false, probability: 0.1 });
  assert.deepEqual(result.currentTts, {
    enabled: false,
    provider: "aliyun-official",
    outputFormat: "wav",
    degradeMessage: "语音暂时发送失败，我先打字陪你。",
    official: {
      model: "qwen3-tts-flash",
      voice: "Chelsie",
      languageType: "Chinese",
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    },
    clone: {
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      targetModel: "cosyvoice-v1",
      modelId: "",
      synthesisModel: "cosyvoice-v1",
      speaker: "",
      promptAudioUrl: "",
      promptText: "",
      statusUrl: "https://dashscope.aliyuncs.com/api/v1",
    },
  });
});

test("resolveScopeSettings marks shared fields as configured when explicit shared config exists", () => {
  const result = __testing.resolveScopeSettings({
    selectedCharacter: "brooke-anime",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: true, probability: 0.2 },
    tts: { enabled: true, voice: "Maia", languageType: "English" },
  }, { type: "agent", agentId: "ding-main" });

  assert.deepEqual(result.shared.configured, {
    selectedCharacter: true,
    defaultProvider: true,
    proactiveSelfie: true,
    tts: true,
  });
});

test("CLI provider prompts switch with English locale", () => {
  __testing.setLang("en");
  const providers = __testing.getProviders();

  assert.equal(providers.aliyun.fields[0].prompt, "Enter the DashScope API key");
  assert.equal(providers.modelscope.label, "ModelScope (fully free, slower)");
});

test("Gemini CLI config omits baseUrl when using the official default endpoint", () => {
  const providers = __testing.getProviders();

  assert.deepEqual(
    providers.gemini.buildConfig({
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-image-preview",
      endpointMode: "official",
      baseUrl: "https://generativelanguage.googleapis.com",
    }),
    {
      type: "gemini",
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-image-preview",
    },
  );
});

test("Gemini CLI config preserves custom model and custom BaseURL", () => {
  const providers = __testing.getProviders();

  assert.deepEqual(
    providers.gemini.buildConfig({
      apiKey: "gemini-key",
      model: "my-company/gemini-image-proxy",
      endpointMode: "custom",
      baseUrl: "https://proxy.example.com/gemini",
    }),
    {
      type: "gemini",
      apiKey: "gemini-key",
      model: "my-company/gemini-image-proxy",
      baseUrl: "https://proxy.example.com/gemini",
    },
  );
});

test("CLI TTS default degrade message switches with English locale", () => {
  __testing.setLang("en");

  assert.equal(
    __testing.normalizeTtsConfig({}).degradeMessage,
    "Voice delivery failed for now, so I will keep you company with text first.",
  );
  assert.equal(__testing.t("character_custom_tag"), "[custom]");
});

test("buildPluginConfig applies shared defaults without changing agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    tts: { enabled: true, provider: "aliyun-official", official: { voice: "Chelsie", languageType: "Chinese", apiKey: "shared-tts-key" } },
    providers: {
      "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    },
    agents: {
      main: {
        selectedCharacter: "brooke-anime",
        defaultProvider: "aliyun",
        proactiveSelfie: { enabled: true, probability: 0.3 },
        tts: { enabled: false },
        note: "keep-me",
      },
    },
  }, {
    scope: { type: "shared" },
    characterSelection: { mode: "set", value: "brooke-anime" },
    proactiveSelection: { mode: "set", value: { enabled: true, probability: 0.2 } },
    ttsSelection: { mode: "set", value: {
      enabled: true,
      provider: "aliyun-official",
      outputFormat: "wav",
      degradeMessage: "语音暂时发送失败，我先打字陪你。",
      official: {
        model: "qwen3-tts-flash",
        voice: "Maia",
        languageType: "English",
        apiKey: "work-tts-key",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      },
      clone: {
        apiKey: "",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        targetModel: "cosyvoice-v1",
        modelId: "",
        synthesisModel: "cosyvoice-clone-v1",
        speaker: "",
        promptAudioUrl: "",
        promptText: "",
        statusUrl: "https://dashscope.aliyuncs.com/api/v1",
      },
    } },
    providerSelection: { mode: "set", providerKey: "aliyun" },
    providerConfigs: {
      aliyun: { type: "aliyun", model: "wan2.6-image" },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.equal(result.selectedCharacter, "brooke-anime");
  assert.equal(result.defaultProvider, "aliyun");
  assert.deepEqual(result.proactiveSelfie, { enabled: true, probability: 0.2 });
  assert.deepEqual(result.tts, {
    enabled: true,
    provider: "aliyun-official",
    outputFormat: "wav",
    degradeMessage: "语音暂时发送失败，我先打字陪你。",
    official: {
      model: "qwen3-tts-flash",
      voice: "Maia",
      languageType: "English",
      apiKey: "work-tts-key",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    },
    clone: {
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      targetModel: "cosyvoice-v1",
      modelId: "",
      synthesisModel: "cosyvoice-clone-v1",
      speaker: "",
      promptAudioUrl: "",
      promptText: "",
      statusUrl: "https://dashscope.aliyuncs.com/api/v1",
    },
  });
  assert.deepEqual(result.providers, {
    "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    aliyun: { type: "aliyun", model: "wan2.6-image" },
  });
  assert.deepEqual(result.agents, {
    main: {
      selectedCharacter: "brooke-anime",
      defaultProvider: "aliyun",
      proactiveSelfie: { enabled: true, probability: 0.3 },
      tts: { enabled: false },
      note: "keep-me",
    },
  });
  assert.equal(result.userCharacterRoot, "C:\\Users\\tester\\.openclaw\\clawmeta");
});

test("buildPluginConfig can clear shared defaults without removing provider definitions or agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: true, probability: 0.2 },
    tts: { enabled: true, voice: "Chelsie" },
    providers: {
      "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    },
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, {
    scope: { type: "shared" },
    characterSelection: { mode: "clear" },
    proactiveSelection: { mode: "clear" },
    ttsSelection: { mode: "clear" },
    providerSelection: { mode: "clear" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.equal("selectedCharacter" in result, false);
  assert.equal("defaultProvider" in result, false);
  assert.equal("proactiveSelfie" in result, false);
  assert.equal("tts" in result, false);
  assert.deepEqual(result.providers, {
    "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
  });
  assert.deepEqual(result.agents, {
    "ding-main": {
      selectedCharacter: "brooke-anime",
    },
  });
});

test("buildPluginConfig updates only the selected agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    tts: { enabled: true, provider: "aliyun-official", official: { voice: "Chelsie", languageType: "Chinese", apiKey: "shared-tts-key" } },
    agents: {
      main: {
        selectedCharacter: "legacy-main",
        note: "keep-main",
      },
      "ding-work": {
        selectedCharacter: "legacy-work",
        defaultProvider: "aliyun",
        proactiveSelfie: { enabled: true, probability: 0.3 },
        tts: { enabled: false },
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-work" },
    characterSelection: { mode: "set", value: "brooke-anime" },
    proactiveSelection: { mode: "set", value: { enabled: true, probability: 0.2 } },
    ttsSelection: { mode: "set", value: {
      enabled: true,
      provider: "aliyun-official",
      outputFormat: "wav",
      degradeMessage: "语音暂时发送失败，我先打字陪你。",
      official: {
        model: "qwen3-tts-flash",
        voice: "Neil",
        languageType: "English",
        apiKey: "work-tts-key",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      },
      clone: {
        apiKey: "",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        targetModel: "cosyvoice-v1",
        modelId: "",
        synthesisModel: "cosyvoice-clone-v1",
        speaker: "",
        promptAudioUrl: "",
        promptText: "",
        statusUrl: "https://dashscope.aliyuncs.com/api/v1",
      },
    } },
    providerSelection: { mode: "set", providerKey: "fal" },
    providerConfigs: {
      fal: { type: "fal", model: "fal-ai/flux/dev/image-to-image" },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    main: {
      selectedCharacter: "legacy-main",
      note: "keep-main",
    },
    "ding-work": {
      enabled: true,
      selectedCharacter: "brooke-anime",
      defaultProvider: "fal",
      proactiveSelfie: { enabled: true, probability: 0.2 },
      tts: {
        enabled: true,
        provider: "aliyun-official",
        outputFormat: "wav",
        degradeMessage: "语音暂时发送失败，我先打字陪你。",
        official: {
          model: "qwen3-tts-flash",
          voice: "Neil",
          languageType: "English",
          apiKey: "work-tts-key",
          baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        },
        clone: {
          apiKey: "",
          baseUrl: "https://dashscope.aliyuncs.com/api/v1",
          targetModel: "cosyvoice-v1",
          modelId: "",
          synthesisModel: "cosyvoice-clone-v1",
          speaker: "",
          promptAudioUrl: "",
          promptText: "",
          statusUrl: "https://dashscope.aliyuncs.com/api/v1",
        },
      },
    },
  });
  assert.deepEqual(result.providers, {
    fal: { type: "fal", model: "fal-ai/flux/dev/image-to-image" },
  });
});

test("buildPluginConfig writes explicit agent overrides even when they match shared values", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
  }, {
    scope: { type: "agent", agentId: "ding-main" },
    characterSelection: { mode: "set", value: "brooke" },
    proactiveSelection: { mode: "set", value: { enabled: false, probability: 0.1 } },
    providerSelection: { mode: "set", providerKey: "openai-compatible" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    "ding-main": {
      enabled: true,
      selectedCharacter: "brooke",
      defaultProvider: "openai-compatible",
      proactiveSelfie: { enabled: false, probability: 0.1 },
    },
  });
});

test("buildPluginConfig applies a shared Gemini provider selection", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    providers: {
      mock: { type: "mock", pendingPolls: 0 },
    },
  }, {
    scope: { type: "shared" },
    providerSelection: { mode: "set", providerKey: "gemini" },
    providerConfigs: {
      gemini: {
        type: "gemini",
        apiKey: "gemini-key",
        model: "gemini-3.1-flash-image-preview",
      },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.equal(result.defaultProvider, "gemini");
  assert.deepEqual(result.providers, {
    mock: { type: "mock", pendingPolls: 0 },
    gemini: {
      type: "gemini",
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-image-preview",
    },
  });
});

test("buildPluginConfig applies an agent-scoped Gemini provider selection", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "mock",
    providers: {
      mock: { type: "mock", pendingPolls: 0 },
    },
    agents: {
      "ding-work": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-work" },
    providerSelection: { mode: "set", providerKey: "gemini" },
    providerConfigs: {
      gemini: {
        type: "gemini",
        apiKey: "gemini-key",
        model: "gemini-2.5-flash-image",
      },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.providers, {
    mock: { type: "mock", pendingPolls: 0 },
    gemini: {
      type: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.5-flash-image",
    },
  });
  assert.deepEqual(result.agents, {
    "ding-work": {
      enabled: true,
      selectedCharacter: "brooke-anime",
      defaultProvider: "gemini",
    },
  });
});

test("buildPluginConfig can clear a selected agent override back to shared settings", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "gemini",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    agents: {
      "ding-main": {
        enabled: true,
        selectedCharacter: "brooke-anime",
        defaultProvider: "gemini",
        proactiveSelfie: { enabled: false, probability: 0.1 },
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-main" },
    characterSelection: { mode: "inherit" },
    proactiveSelection: { mode: "inherit" },
    providerSelection: { mode: "inherit" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    "ding-main": {
      enabled: true,
    },
  });
});

test("buildPluginConfig keeps an agent explicitly enabled even when it inherits all shared settings", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "mock",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-main" },
    activationSelection: { mode: "enable" },
    characterSelection: { mode: "inherit" },
    proactiveSelection: { mode: "inherit" },
    providerSelection: { mode: "inherit" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    "ding-main": {
      enabled: true,
    },
  });
});

test("buildPluginConfig can explicitly disable an agent and keep prior overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "mock",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    agents: {
      "ding-main": {
        enabled: true,
        selectedCharacter: "brooke-anime",
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-main" },
    activationSelection: { mode: "disable" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    "ding-main": {
      enabled: false,
      selectedCharacter: "brooke-anime",
    },
  });
});

test("createAliyunCloneVoiceModel and pollAliyunCloneVoiceModel are exposed for CLI workflow", async () => {
  let createCalled = false;
  let pollCalled = false;

  const createResult = await __testing.createAliyunCloneVoiceModel({
    apiKey: "test-key",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    targetModel: "cosyvoice-v3.5-plus",
    speaker: "mghus",
    promptAudioUrl: "https://example.com/audio.wav",
    fetchImpl: async (url, init) => {
      createCalled = true;
      assert.equal(url, "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: "cosyvoice-v3.5-plus",
          prefix: "mghus",
          url: "https://example.com/audio.wav",
        },
      });
      return new Response(JSON.stringify({
        output: {
          voice_id: "voice-123",
          status: "PENDING",
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-dashscope-request-id": "req-create-1",
        },
      });
    },
  });

  assert.equal(createCalled, true);
  assert.equal(createResult.taskId, null);
  assert.equal(createResult.modelId, "voice-123");

  const pollResult = await __testing.pollAliyunCloneVoiceModel({
    apiKey: "test-key",
    statusUrl: "https://dashscope.aliyuncs.com/api/v1",
    taskId: "task-1",
    maxAttempts: 1,
    pollIntervalMs: 0,
    fetchImpl: async (url, init) => {
      pollCalled = true;
      assert.equal(url, "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "voice-enrollment",
        input: {
          action: "query_voice",
          voice_id: "task-1",
        },
      });
      return new Response(JSON.stringify({
        output: {
          status: "OK",
          voice_id: "voice-123",
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-dashscope-request-id": "req-poll-1",
        },
      });
    },
  });

  assert.equal(pollCalled, true);
  assert.equal(pollResult.modelId, "voice-123");
  assert.equal(pollResult.status, "OK");
});
