#!/usr/bin/env node

/**
 * ClawMate Companion - One-Click Installer for OpenClaw
 *
 * npx @clawmate/clawmate-companion
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");
const os = require("os");

function resolveOpenClawHome() {
  const envHome = process.env.OPENCLAW_HOME?.trim();
  if (envHome) {
    return envHome;
  }

  const home = os.homedir();
  const candidates = [path.join(home, ".openclaw")];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (appData) {
      candidates.push(path.join(appData, ".openclaw"));
      candidates.push(path.join(appData, "openclaw"));
      candidates.push(path.join(appData, "OpenClaw"));
    }
    if (localAppData) {
      candidates.push(path.join(localAppData, ".openclaw"));
      candidates.push(path.join(localAppData, "openclaw"));
      candidates.push(path.join(localAppData, "OpenClaw"));
    }
  }

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "openclaw.json"))) {
      return dir;
    }
  }

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return path.join(home, ".openclaw");
}

// ── Colors ──────────────────────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// ── Paths ───────────────────────────────────────────────────────────────────
const OPENCLAW_HOME = resolveOpenClawHome();
const OPENCLAW_DIR = OPENCLAW_HOME;
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, "openclaw.json");
const OPENCLAW_PLUGINS_DIR = path.join(OPENCLAW_DIR, "plugins");
const PLUGIN_PACKAGE_ROOT = path.resolve(__dirname, "..");
const PLUGIN_ID = "clawmate-companion";
const TTS_DEFAULT_MODEL = "qwen3-tts-flash";
const TTS_DEFAULT_VOICE = "Chelsie";
const TTS_DEFAULT_LANGUAGE = "Chinese";
const TTS_DEFAULT_API_KEY = "";
const TTS_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const TTS_API_KEY_HELP_URL = "https://help.aliyun.com/zh/model-studio/get-api-key";
const TTS_VOICE_TEST_URL = "https://bailian.console.aliyun.com/cn-beijing/?spm=5176.29597918.J__Xz0dtrgG-8e2H7vxPlPy.9.28c5133cimqlqE&tab=doc#/doc/?type=model&url=2879134";
const TTS_CLONE_DOC_URL = "https://help.aliyun.com/zh/model-studio/cosyvoice-clone-design-api";
const TTS_CLONE_EXPERIENCE_URL = "https://bailian.console.aliyun.com/cn-beijing?spm=5176.29619931.J_PvCec88exbQTi-U433Fxg.5.9f2110d7c0UDIv&tab=model#/efm/model_experience_center/voice?currentTab=voiceTts&primary=cloning&secondary=clone";
const OSS_CONSOLE_URL = "https://oss.console.aliyun.com/overview";

const TTS_VOICE_PRESETS = [
  { value: "Chelsie", zh: "Chelsie — 二次元虚拟女友（女性）", en: "Chelsie — anime virtual girlfriend (female)" },
  { value: "Maia", zh: "Maia — 知性与温柔的碰撞（女性）", en: "Maia — poised and gentle (female)" },
  { value: "Vivian", zh: "Vivian — 拽拽的、可爱的小暴躁（女性）", en: "Vivian — tsundere and cute (female)" },
  { value: "Bella", zh: "Bella — 喝酒不打醉拳的小萝莉（女性）", en: "Bella — playful little girl voice (female)" },
  { value: "Moon", zh: "Moon — 率性帅气的月白（男性）", en: "Moon — confident and cool (male)" },
  { value: "Kai", zh: "Kai — 耳朵的一场SPA（男性）", en: "Kai — ultra-smooth and soothing (male)" },
  { value: "Neil", zh: "Neil — 最专业的新闻主持人（男性）", en: "Neil — professional news anchor (male)" },
];

const TTS_LANGUAGE_OPTIONS = [
  "Chinese",
  "English",
  "German",
  "Italian",
  "Portuguese",
  "Spanish",
  "Japanese",
  "Korean",
  "French",
  "Russian",
];

// ── i18n ────────────────────────────────────────────────────────────────────
let lang = "zh";

const T = {
  zh: {
    banner_desc: "为你的 OpenClaw Agent 添加角色化自拍生成能力。",
    arrow_hint: "↑↓ 选择，Enter 确认",
    step_lang: "选择语言 / Select Language",
    step_env: "检查环境...",
    step_agents: "检测 Agent...",
    step_target: "选择配置目标...",
    step_agent_status: "设置 Agent 开关...",
    step_character: "选择角色...",
    step_proactive: "配置主动发图...",
    step_tts: "配置语音合成...",
    proactive_enable: "主动发图：若溪会在日常聊天中随机发自拍表示关心",
    proactive_yes: "开启",
    proactive_no: "关闭（仅用户主动触发）",
    proactive_freq: "选择触发频率",
    proactive_low: "低频  — 约每 10 条消息触发一次",
    proactive_mid: "中频  — 约每 5 条消息触发一次",
    proactive_high: "高频  — 约每 3 条消息触发一次",
    proactive_done: "主动发图配置完成",
    step_provider: "选择图像生成服务...",
    step_config: "配置服务参数...",
    step_multi_agent: "配置多 Agent 覆写...",
    step_install: "安装插件...",
    step_done: "安装完成!",
    no_openclaw: "未找到 openclaw CLI",
    install_openclaw: "请先安装: npm install -g openclaw",
    openclaw_ok: "openclaw CLI 已安装",
    dir_missing: "~/.openclaw 目录不存在，正在创建...",
    dir_ok: "OpenClaw 目录就绪",
    already_installed: "ClawMate Companion 插件已安装",
    reinstall: "重新安装/更新配置? (y/N): ",
    no_change: "未做任何更改。",
    selected: "已选择:",
    mock_skip: "Mock 模式无需配置",
    fal_open: "在浏览器中打开 fal.ai 获取 Key? (Y/n): ",
    custom_input: "自定义输入...",
    model_empty: "模型名称不能为空",
    field_required: "是必填项",
    config_done: "服务配置完成",
    plugin_path: "插件路径:",
    deps_install: "安装插件依赖",
    deps_ready: "插件依赖已就绪",
    deps_fail: "插件依赖安装失败:",
    link_ok: "插件链接成功",
    link_fail: "openclaw plugins install 命令失败，尝试手动配置...",
    config_written: "配置已写入:",
    summary_ready: "ClawMate Companion 已就绪!",
    summary_path: "插件路径:",
    summary_provider: "图像服务:",
    summary_target: "配置目标:",
    summary_config: "配置文件:",
    summary_repo: "项目仓库:",
    summary_star: "⭐ 如果这个项目对你有帮助，请给我们一个 Star！⭐",
    summary_try: "试试对你的 Agent 说:",
    summary_ex1: "发张自拍看看",
    summary_ex2: "晚上在卧室穿着粉色睡衣拍一张",
    summary_ex3: "你现在在干嘛？发张照片",
    summary_manage: "插件管理:",
    summary_create_char: "创建自定义角色:",
    summary_create_ex: "帮我创建一个[动漫/写实]风格的新角色，她是一个[描述职业/性格/背景]的女生",
    summary_multi_agent: "多 Agent:",
    fail: "安装失败:",
    skip: "跳过，稍后再配置",
    skipped: "已跳过",
    character_create_hint: "没有想要的角色？安装完成后，对 Agent 说「帮我创建一个新角色，她是一个[描述角色职业/性格/背景]」即可通过对话自建。",
    agents_found: "发现 {count} 个 Agent",
    agent_default_tag: "默认",
    agent_routes: "路由",
    agent_workspace: "工作区",
    multi_agent_intro: "检测到多个 Agent，可为每个 Agent 设置独立角色和图像服务。",
    choose_target: "选择要配置的 Agent 或共享默认配置",
    choose_agent_only: "选择要配置的 Agent",
    target_shared: "配置共享默认值",
    target_agent_details: "当前 Agent",
    target_agent_prefix: "单独配置 Agent",
    selected_target: "配置目标",
    target_done: "完成配置并安装",
    target_configured_tag: "已配置",
    target_enabled_tag: "已启用",
    target_disabled_tag: "已停用",
    target_shared_desc: "这里只设置共享默认值；只有单独确认过的 Agent 才会启用 ClawMate",
    agent_enable: "启用 ClawMate",
    agent_disable: "停止 ClawMate",
    agent_enabled_done: "该 Agent 已启用 ClawMate",
    agent_disabled_done: "该 Agent 已停止 ClawMate",
    clear_shared_character: "清除共享角色（回退到内置默认）",
    clear_shared_provider: "清除共享图像服务（回退到 Mock）",
    clear_shared_proactive: "清除共享主动发图设置",
    clear_shared_tts: "清除共享语音设置",
    multi_agent_shared: "配置共享默认值",
    multi_agent_character: "每个 Agent 单独选择角色",
    multi_agent_character_provider: "每个 Agent 单独选择角色和图像服务",
    use_global_character: "继承全局角色",
    use_global_provider: "继承全局图像服务",
    use_global_proactive: "继承共享主动发图",
    use_global_tts: "继承共享语音",
    choose_agent_character: "为 Agent 选择角色",
    choose_agent_provider: "为 Agent 选择图像服务",
    choose_agent_proactive: "为 Agent 配置主动发图",
    choose_agent_tts: "为 Agent 配置语音合成",
    multi_agent_shared_done: "将清除 Agent 级覆写，全部继承全局配置",
    multi_agent_configured: "多 Agent 配置已生成",
    configured_services: "已配置图像服务",
    choose_existing_service: "选择已有图像服务",
    create_new_service: "新建图像服务...",
    reuse_service: "复用已有图像服务",
    service_type: "服务类型",
    service_model: "模型",
    service_none: "暂无已配置图像服务",
    // providers
    p_aliyun: "阿里云百炼（有免费额度）",
    p_volcengine: "火山引擎 ARK（有免费额度）",
    p_modelscope: "ModelScope（完全免费，但速度较慢）",
    p_fal: "fal.ai",
    p_gemini: "Gemini 官方 SDK",
    p_openai: "OpenAI 兼容接口",
    p_mock: "Mock (仅测试，不需要 API Key)",
    mscope_model_zimage: "Tongyi-MAI/Z-Image（不依赖参考图）",
    mscope_model_edit: "Qwen/Qwen-Image-Edit-2511（依赖参考图，生成时间较长）",
    aliyun_model_wan26: "wan2.6-image（万相 2.6）",
    aliyun_model_qwen_edit: "qwen-image-edit-max（Qwen 图像编辑）",
    volcengine_model_seedream45: "doubao-seedream-4-5-251128（SeedDream 4.5）",
    volcengine_model_seedream40: "doubao-seedream-4-0-250828（SeedDream 4.0）",
    gemini_model_pro_preview: "gemini-3-pro-image-preview（高质量预览版）",
    gemini_model_flash31_preview: "gemini-3.1-flash-image-preview（推荐）",
    gemini_model_flash25: "gemini-2.5-flash-image（稳定版）",
    gemini_model_flash25_preview: "gemini-2.5-flash-image-preview（预览版）",
    provider_recommend: "建议优先使用谷歌 Banana",
    f_select_model: "选择模型",
    f_custom_model: "输入自定义模型名称: ",
    f_custom_endpoint: "输入自定义模型 Endpoint ID: ",
    f_model_name: "模型名称",
    f_dashscope_api_key: "输入 DashScope API Key",
    f_ark_api_key: "输入 ARK API Key",
    f_modelscope_token: "输入 ModelScope Token",
    f_fal_key: "输入 FAL_KEY",
    f_gemini_api_key: "输入 Gemini API Key",
    f_api_key: "输入 API Key",
    f_base_url: "输入 Base URL",
    f_fal_hint: "从 https://fal.ai/dashboard/keys 获取",
    f_baseurl_hint: "例: https://api.openai.com/v1",
    f_gemini_baseurl_hint: "例: https://generativelanguage.googleapis.com",
    f_gemini_endpoint_mode: "选择 Gemini API 地址",
    gemini_endpoint_default: "官方默认地址",
    gemini_endpoint_custom: "自定义 BaseURL",
    tts_enable: "语音合成：在适合的时刻发送短语音",
    tts_yes: "开启",
    tts_no: "关闭（仅文字回复）",
    tts_done: "语音合成配置完成",
    tts_select_provider: "选择语音模式",
    tts_provider_official: "官方音色",
    tts_provider_clone: "复刻音色",
    tts_select_voice: "选择默认音色",
    tts_custom_voice: "输入自定义音色名称: ",
    tts_select_language: "选择默认语种",
    tts_api_key: "输入 TTS API Key",
    tts_output_format: "选择输出格式",
    tts_clone_target_model: "输入复刻目标模型",
    tts_clone_target_model_hint: "常用可填 cosyvoice-v3.5-plus（推荐）或 cosyvoice-v2，直接回车使用推荐值；如官方后续新增型号也可自定义输入",
    tts_clone_model_id: "输入已存在的复刻模型 ID（可留空，安装时后续创建）",
    tts_clone_model_id_hint: "如果你已经在阿里云控制台创建过复刻音色，就把 modelId 填在这里；留空表示后续通过脚本或平台流程创建",
    tts_clone_synthesis_model: "输入合成模型名称",
    tts_clone_synthesis_model_hint: "这是之后发起语音合成时用的模型名，不是角色昵称；大多数场景保持默认 cosyvoice-clone-v1 即可",
    tts_clone_speaker: "输入说话人名称（可选）",
    tts_clone_speaker_hint: "说话人名称是你给这份复刻声音起的内部标识，便于区分多个复刻音色；可直接填角色名，例如 mghus",
    tts_clone_prompt_audio_url: "输入示例音频 URL",
    tts_clone_prompt_audio_url_hint: "这里填参考音频的公网直链 URL。最稳妥的做法是上传到阿里云 OSS、设置公开读、复制永久公开 URL；也可先在百炼体验中心测试",
    tts_clone_prompt_text: "输入示例音频对应文本",
    tts_clone_prompt_text_hint: "这里填示例音频里实际说了什么，必须尽量和音频逐字一致，否则复刻质量会明显下降",
    tts_clone_status_url: "输入任务查询 Base URL（留空则复用 Base URL）",
    tts_clone_status_url_hint: "通常直接留空即可，表示沿用默认 DashScope Base URL；只有走代理网关或自定义中转地址时才需要修改",
    tts_voice_hint: "还有更多可选音色，可以在这个地址在线测试:",
    tts_api_key_hint: "获取 Key 的链接:",
    tts_clone_doc_hint: "复刻音色文档:",
    tts_clone_experience_hint: "百炼在线体验入口:",
    tts_clone_oss_hint: "阿里云 OSS 控制台（可上传音频并生成公网 URL）:",
    tts_recommended: "推荐",
    tts_default_degrade_message: "语音暂时发送失败，我先打字陪你。",
    character_custom_tag: "[自定义]",
    summary_tts: "语音合成:",
  },
  en: {
    banner_desc: "Add character selfie generation to your OpenClaw Agent.",
    arrow_hint: "Up/Down to select, Enter to confirm",
    step_lang: "选择语言 / Select Language",
    step_env: "Checking environment...",
    step_agents: "Detecting agents...",
    step_target: "Choose config target...",
    step_agent_status: "Set agent status...",
    step_character: "Select character...",
    step_proactive: "Configure proactive selfie...",
    step_tts: "Configure TTS...",
    proactive_enable: "Proactive selfie: character will randomly send selfies during chat",
    proactive_yes: "Enable",
    proactive_no: "Disable (user-triggered only)",
    proactive_freq: "Select trigger frequency",
    proactive_low: "Low    — ~1 in 10 messages",
    proactive_mid: "Medium — ~1 in 5 messages",
    proactive_high: "High   — ~1 in 3 messages",
    proactive_done: "Proactive selfie configured",
    step_provider: "Select image generation service...",
    step_config: "Configure service parameters...",
    step_multi_agent: "Configure multi-agent overrides...",
    step_install: "Installing plugin...",
    step_done: "Installation complete!",
    no_openclaw: "openclaw CLI not found",
    install_openclaw: "Install first: npm install -g openclaw",
    openclaw_ok: "openclaw CLI installed",
    dir_missing: "~/.openclaw directory not found, creating...",
    dir_ok: "OpenClaw directory ready",
    already_installed: "ClawMate Companion plugin already installed",
    reinstall: "Reinstall / update config? (y/N): ",
    no_change: "No changes made.",
    selected: "Selected:",
    mock_skip: "Mock mode, no config needed",
    fal_open: "Open fal.ai in browser to get key? (Y/n): ",
    custom_input: "Custom input...",
    model_empty: "Model name cannot be empty",
    field_required: "is required",
    config_done: "Service configured",
    plugin_path: "Plugin path:",
    deps_install: "Installing plugin dependencies",
    deps_ready: "Plugin dependencies ready",
    deps_fail: "Failed to install plugin dependencies:",
    link_ok: "Plugin linked successfully",
    link_fail: "openclaw plugins install failed, trying manual config...",
    config_written: "Config written to:",
    summary_ready: "ClawMate Companion is ready!",
    summary_path: "Plugin path:",
    summary_provider: "Image service:",
    summary_target: "Config target:",
    summary_config: "Config file:",
    summary_repo: "Repository:",
    summary_star: "⭐ If this project helps you, please give us a Star! ⭐",
    summary_try: "Try saying to your Agent:",
    summary_ex1: "Send me a selfie",
    summary_ex2: "Take a photo in pink pajamas in the bedroom at night",
    summary_ex3: "What are you doing? Send a pic",
    summary_manage: "Plugin management:",
    summary_create_char: "Create a custom character:",
    summary_create_ex: "Help me create a new [anime/photorealistic] character, she is a girl with [describe occupation/personality/background]",
    summary_multi_agent: "Multi-agent:",
    fail: "Installation failed:",
    skip: "Skip, configure later",
    skipped: "Skipped",
    character_create_hint: "Don't see the character you want? After installation, tell your Agent \"help me create a new character, she is a [describe occupation/personality/background]\" to build one through conversation.",
    agents_found: "Found {count} agents",
    agent_default_tag: "default",
    agent_routes: "Routes",
    agent_workspace: "Workspace",
    multi_agent_intro: "Multiple agents detected. You can assign a separate character and provider to each one.",
    choose_target: "Choose an agent or the shared default configuration",
    choose_agent_only: "Choose an agent to configure",
    target_shared: "Configure shared defaults",
    target_agent_details: "Current Agent",
    target_agent_prefix: "Configure agent",
    selected_target: "Config target",
    target_done: "Finish and install",
    target_configured_tag: "configured",
    target_enabled_tag: "enabled",
    target_disabled_tag: "stopped",
    target_shared_desc: "Shared defaults only define fallback values; ClawMate activates only for agents you confirm individually",
    agent_enable: "Enable ClawMate",
    agent_disable: "Stop ClawMate",
    agent_enabled_done: "ClawMate enabled for this agent",
    agent_disabled_done: "ClawMate stopped for this agent",
    clear_shared_character: "Clear shared character (use built-in default)",
    clear_shared_provider: "Clear shared image service (fall back to Mock)",
    clear_shared_proactive: "Clear shared proactive selfie setting",
    clear_shared_tts: "Clear shared TTS settings",
    multi_agent_shared: "Configure shared defaults",
    multi_agent_character: "Choose a separate character for each agent",
    multi_agent_character_provider: "Choose a separate character and provider for each agent",
    use_global_character: "Inherit global character",
    use_global_provider: "Inherit global provider",
    use_global_proactive: "Inherit shared proactive selfie",
    use_global_tts: "Inherit shared TTS",
    choose_agent_character: "Choose character for agent",
    choose_agent_provider: "Choose provider for agent",
    choose_agent_proactive: "Configure proactive selfie for agent",
    choose_agent_tts: "Configure TTS for agent",
    multi_agent_shared_done: "Agent-scoped overrides will be cleared and all agents will inherit the global config",
    multi_agent_configured: "Multi-agent overrides prepared",
    configured_services: "Configured image services",
    choose_existing_service: "Choose an existing image service",
    create_new_service: "Create new image service...",
    reuse_service: "Reuse an existing image service",
    service_type: "Service type",
    service_model: "Model",
    service_none: "No image services configured yet",
    // providers
    p_aliyun: "Alibaba Cloud Bailian (free quota available)",
    p_volcengine: "Volcengine ARK (free quota available)",
    p_modelscope: "ModelScope (fully free, slower)",
    p_fal: "fal.ai",
    p_gemini: "Gemini Official SDK",
    p_openai: "OpenAI Compatible",
    p_mock: "Mock (testing only, no API Key needed)",
    mscope_model_zimage: "Tongyi-MAI/Z-Image (no reference image required)",
    mscope_model_edit: "Qwen/Qwen-Image-Edit-2511 (requires reference image, longer generation)",
    aliyun_model_wan26: "wan2.6-image (Wanxiang 2.6)",
    aliyun_model_qwen_edit: "qwen-image-edit-max (Qwen image editing)",
    volcengine_model_seedream45: "doubao-seedream-4-5-251128 (SeedDream 4.5)",
    volcengine_model_seedream40: "doubao-seedream-4-0-250828 (SeedDream 4.0)",
    gemini_model_pro_preview: "gemini-3-pro-image-preview (high-quality preview)",
    gemini_model_flash31_preview: "gemini-3.1-flash-image-preview (recommended)",
    gemini_model_flash25: "gemini-2.5-flash-image (stable)",
    gemini_model_flash25_preview: "gemini-2.5-flash-image-preview (preview)",
    provider_recommend: "Recommendation: prefer Google Banana",
    f_select_model: "Select model",
    f_custom_model: "Enter custom model name: ",
    f_custom_endpoint: "Enter custom model Endpoint ID: ",
    f_model_name: "Model name",
    f_dashscope_api_key: "Enter the DashScope API key",
    f_ark_api_key: "Enter the ARK API key",
    f_modelscope_token: "Enter the ModelScope token",
    f_fal_key: "Enter FAL_KEY",
    f_gemini_api_key: "Enter the Gemini API key",
    f_api_key: "Enter the API key",
    f_base_url: "Enter the Base URL",
    f_fal_hint: "Get from https://fal.ai/dashboard/keys",
    f_baseurl_hint: "e.g. https://api.openai.com/v1",
    f_gemini_baseurl_hint: "e.g. https://generativelanguage.googleapis.com",
    f_gemini_endpoint_mode: "Choose the Gemini API address",
    gemini_endpoint_default: "Official default address",
    gemini_endpoint_custom: "Custom BaseURL",
    tts_enable: "TTS: send short voice notes when voice feels better than text",
    tts_yes: "Enable",
    tts_no: "Disable (text only)",
    tts_done: "TTS configured",
    tts_select_provider: "Choose TTS mode",
    tts_provider_official: "Official voice",
    tts_provider_clone: "Cloned voice",
    tts_select_voice: "Choose the default voice",
    tts_custom_voice: "Enter a custom voice name: ",
    tts_select_language: "Choose the default language",
    tts_api_key: "Enter the TTS API key",
    tts_output_format: "Choose output format",
    tts_clone_target_model: "Enter clone target model",
    tts_clone_target_model_hint: "Common values include cosyvoice-v3.5-plus (recommended) or cosyvoice-v2. Press Enter to use the recommended default, or type a custom model if Aliyun adds a newer one",
    tts_clone_model_id: "Enter an existing clone model ID (optional)",
    tts_clone_model_id_hint: "If you already created a cloned voice in Aliyun, paste its modelId here. Leave blank if you want to create it later",
    tts_clone_synthesis_model: "Enter synthesis model name",
    tts_clone_synthesis_model_hint: "This is the model name used later for TTS synthesis, not your character nickname. In most cases keep the default cosyvoice-clone-v1",
    tts_clone_speaker: "Enter speaker name (optional)",
    tts_clone_speaker_hint: "This is an internal label for the cloned voice, useful when you manage multiple cloned voices. A character name such as mghus is fine",
    tts_clone_prompt_audio_url: "Enter prompt audio URL",
    tts_clone_prompt_audio_url_hint: "Provide a public direct URL to the reference audio. The most reliable approach is to upload the clip to Aliyun OSS, make it public-read, and paste the permanent public URL",
    tts_clone_prompt_text: "Enter prompt transcript",
    tts_clone_prompt_text_hint: "Type the exact spoken content in the reference audio. The closer it matches the audio, the better the cloned voice quality",
    tts_clone_status_url: "Enter status query Base URL (optional)",
    tts_clone_status_url_hint: "Usually leave this blank to reuse the default DashScope Base URL. Only change it when you use a proxy or custom gateway",
    tts_voice_hint: "More voices are available for online preview here:",
    tts_api_key_hint: "Get the API key:",
    tts_clone_doc_hint: "Voice clone docs:",
    tts_clone_experience_hint: "Bailian online experience:",
    tts_clone_oss_hint: "Aliyun OSS console (for uploading audio and generating public URLs):",
    tts_clone_status_url: "Enter status query Base URL (optional)",
    tts_voice_hint: "More voices are available for online preview here:",
    tts_api_key_hint: "Get the API key:",
    tts_clone_doc_hint: "Voice clone docs:",
    tts_recommended: "Recommended",
    tts_default_degrade_message: "Voice delivery failed for now, so I will keep you company with text first.",
    character_custom_tag: "[custom]",
    summary_tts: "TTS:",
  },
};

function t(key) { return T[lang][key] || T.zh[key] || key; }
function getDefaultTtsDegradeMessage() { return t("tts_default_degrade_message"); }

function getTtsVoiceOptions() {
  return TTS_VOICE_PRESETS.map((item) => ({
    value: item.value,
    label: `${lang === "en" ? item.en : item.zh}${item.value === TTS_DEFAULT_VOICE ? (lang === "en" ? ` (${t("tts_recommended")})` : `（${t("tts_recommended")}）`) : ""}`,
  }));
}

// ── Provider definitions (dynamic for i18n) ─────────────────────────────────
function getProviders() {
  return {
    aliyun: {
      label: t("p_aliyun"),
      fields: [
        { key: "apiKey", prompt: t("f_dashscope_api_key"), secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "wan2.6-image", label: t("aliyun_model_wan26") },
            { value: "qwen-image-edit-max", label: t("aliyun_model_qwen_edit") },
          ],
          allowCustom: true,
          customPrompt: t("f_custom_model"),
        },
      ],
      buildConfig(answers) {
        return { type: "aliyun", apiKey: answers.apiKey, model: answers.model };
      },
    },
    volcengine: {
      label: t("p_volcengine"),
      fields: [
        { key: "apiKey", prompt: t("f_ark_api_key"), secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "doubao-seedream-4-5-251128", label: t("volcengine_model_seedream45") },
            { value: "doubao-seedream-4-0-250828", label: t("volcengine_model_seedream40") },
          ],
          allowCustom: true,
          customPrompt: t("f_custom_endpoint"),
        },
      ],
      buildConfig(answers) {
        return { type: "volcengine", apiKey: answers.apiKey, model: answers.model };
      },
    },
    modelscope: {
      label: t("p_modelscope"),
      fields: [
        { key: "apiKey", prompt: t("f_modelscope_token"), secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "Tongyi-MAI/Z-Image", label: t("mscope_model_zimage") },
            { value: "Qwen/Qwen-Image-Edit-2511", label: t("mscope_model_edit") },
          ],
          allowCustom: true,
          customPrompt: t("f_custom_model"),
        },
      ],
      buildConfig(answers) {
        return {
          type: "modelscope",
          apiKey: answers.apiKey,
          baseUrl: "https://api-inference.modelscope.cn/v1",
          model: answers.model,
          pollIntervalMs: 1000,
          pollTimeoutMs: 300000,
        };
      },
    },
    fal: {
      label: t("p_fal"),
      fields: [
        { key: "apiKey", prompt: t("f_fal_key"), secret: true, required: true, hint: t("f_fal_hint") },
        { key: "model", prompt: t("f_model_name"), default: "fal-ai/flux/dev/image-to-image" },
      ],
      buildConfig(answers) {
        return { type: "fal", apiKey: answers.apiKey, model: answers.model };
      },
    },
    gemini: {
      label: t("p_gemini"),
      fields: [
        { key: "apiKey", prompt: t("f_gemini_api_key"), secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "gemini-3-pro-image-preview", label: t("gemini_model_pro_preview") },
            { value: "gemini-3.1-flash-image-preview", label: t("gemini_model_flash31_preview") },
            { value: "gemini-2.5-flash-image", label: t("gemini_model_flash25") },
            { value: "gemini-2.5-flash-image-preview", label: t("gemini_model_flash25_preview") },
          ],
          allowCustom: true,
          customPrompt: t("f_custom_model"),
        },
        {
          key: "endpointMode",
          prompt: t("f_gemini_endpoint_mode"),
          choices: [
            { value: "official", label: t("gemini_endpoint_default") },
            { value: "custom", label: t("gemini_endpoint_custom") },
          ],
          resolveExistingValue(existingProviderConfig) {
            return existingProviderConfig.baseUrl ? "custom" : "official";
          },
        },
        {
          key: "baseUrl",
          prompt: t("f_base_url"),
          hint: t("f_gemini_baseurl_hint"),
          when(answers) {
            return answers.endpointMode === "custom";
          },
          required(answers) {
            return answers.endpointMode === "custom";
          },
        },
      ],
      buildConfig(answers) {
        return answers.endpointMode === "custom"
          ? { type: "gemini", apiKey: answers.apiKey, model: answers.model, baseUrl: answers.baseUrl }
          : { type: "gemini", apiKey: answers.apiKey, model: answers.model };
      },
    },
    "openai-compatible": {
      label: t("p_openai"),
      fields: [
        { key: "apiKey", prompt: t("f_api_key"), secret: true, required: true },
        { key: "baseUrl", prompt: t("f_base_url"), required: true, hint: t("f_baseurl_hint") },
        { key: "model", prompt: t("f_model_name"), required: true },
      ],
      buildConfig(answers) {
        return { type: "openai-compatible", apiKey: answers.apiKey, baseUrl: answers.baseUrl, model: answers.model, endpoint: "/images/edits" };
      },
    },
    mock: {
      label: t("p_mock"),
      fields: [],
      buildConfig() { return { type: "mock", pendingPolls: 0 }; },
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(msg) { console.log(msg); }
function logStep(step, msg) { console.log(`\n${c("cyan", `[${step}]`)} ${msg}`); }
function logSuccess(msg) { console.log(`${c("green", "✓")} ${msg}`); }
function logError(msg) { console.log(`${c("red", "✗")} ${msg}`); }
function logInfo(msg) { console.log(`${c("blue", "→")} ${msg}`); }
function logWarn(msg) { console.log(`${c("yellow", "!")} ${msg}`); }

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Arrow-key interactive select menu.
 * Returns the index of the selected item.
 */
function arrowSelect(items, { title = "", initialIndex = 0, detailsRenderer = null } = {}) {
  return new Promise((resolve) => {
    let cursor = Math.max(0, Math.min(initialIndex, items.length - 1));
    const { stdin, stdout } = process;
    let renderedLineCount = 0;

    function renderFrame() {
      const lines = [];
      if (title) {
        lines.push(title);
      }
      for (let i = 0; i < items.length; i++) {
        const prefix = i === cursor ? c("cyan", " ❯ ") : "   ";
        const label = i === cursor ? c("bright", items[i]) : c("dim", items[i]);
        lines.push(`${prefix}${label}`);
      }

      if (typeof detailsRenderer === "function") {
        const detailLines = detailsRenderer(cursor);
        if (Array.isArray(detailLines) && detailLines.length > 0) {
          lines.push(...detailLines.map((line) => String(line)));
        }
      }

      if (renderedLineCount > 0) {
        stdout.write(`\x1b[${renderedLineCount}A`);
      }

      const linesToRender = Math.max(renderedLineCount, lines.length);
      for (let i = 0; i < linesToRender; i++) {
        stdout.write(`\x1b[2K${lines[i] ?? ""}\n`);
      }
      renderedLineCount = linesToRender;
    }

    function cleanup() {
      stdin.setRawMode(false);
      stdin.removeListener("data", onKey);
      stdin.pause();
    }

    function onKey(data) {
      const key = data.toString();
      // Up arrow: \x1b[A
      if (key === "\x1b[A" || key === "k") {
        cursor = (cursor - 1 + items.length) % items.length;
        renderFrame();
      }
      // Down arrow: \x1b[B
      else if (key === "\x1b[B" || key === "j") {
        cursor = (cursor + 1) % items.length;
        renderFrame();
      }
      // Enter
      else if (key === "\r" || key === "\n") {
        cleanup();
        resolve(cursor);
      }
      // Ctrl+C
      else if (key === "\x03") {
        cleanup();
        process.exit(0);
      }
    }

    renderFrame();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKey);
  });
}

function commandExists(cmd) {
  try {
    const checkCmd = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(checkCmd, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value) {
  return isPlainObject(value) ? value : {};
}

function readExistingPluginConfig() {
  const config = readJsonFile(OPENCLAW_CONFIG);
  return config?.plugins?.entries?.[PLUGIN_ID]?.config || null;
}

function hasExistingPluginEntry() {
  const config = readJsonFile(OPENCLAW_CONFIG);
  return isPlainObject(config?.plugins?.entries?.[PLUGIN_ID]);
}

function runJsonCommand(command, timeout = 15000) {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    }).trim();
    if (!output) {
      return null;
    }
    return parseJson(output);
  } catch {
    return null;
  }
}

function normalizeAgents(rawAgents) {
  if (!Array.isArray(rawAgents)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const raw of rawAgents) {
    const id = typeof raw === "string"
      ? raw.trim()
      : typeof raw?.id === "string"
        ? raw.id.trim()
        : "";
    if (!id || seen.has(id)) {
      continue;
    }

    const workspace = typeof raw?.workspace === "string" && raw.workspace.trim()
      ? raw.workspace.trim()
      : undefined;
    const routes = Array.isArray(raw?.routes)
      ? raw.routes.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const bindings = typeof raw?.bindings === "number" ? raw.bindings : undefined;
    const isDefault = Boolean(raw?.isDefault);

    result.push({ id, workspace, routes, bindings, isDefault });
    seen.add(id);
  }

  return result.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.id.localeCompare(b.id);
  });
}

function discoverAgentsFromCli() {
  return normalizeAgents(runJsonCommand("openclaw agents list --json"));
}

function discoverAgentsFromDirectory() {
  const agentsDir = path.join(OPENCLAW_HOME, "agents");
  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  const config = readJsonFile(OPENCLAW_CONFIG) || {};
  const defaultWorkspace = config?.agents?.defaults?.workspace;
  const rawAgents = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      workspace:
        entry.name === "main" && typeof defaultWorkspace === "string" && defaultWorkspace.trim()
          ? defaultWorkspace.trim()
          : undefined,
      isDefault: entry.name === "main",
      routes: entry.name === "main" ? ["default (no explicit rules)"] : [],
    }));

  return normalizeAgents(rawAgents);
}

function discoverAgentsFromConfig() {
  const config = readJsonFile(OPENCLAW_CONFIG) || {};
  const list = config?.agents?.list;
  const normalizedList = normalizeAgents(Array.isArray(list) ? list : []);
  if (normalizedList.length > 0) {
    return normalizedList;
  }

  const defaultWorkspace =
    typeof config?.agents?.defaults?.workspace === "string" && config.agents.defaults.workspace.trim()
      ? config.agents.defaults.workspace.trim()
      : path.join(OPENCLAW_HOME, "workspace");

  return normalizeAgents([{ id: "main", workspace: defaultWorkspace, isDefault: true }]);
}

function discoverAgents() {
  const candidates = [
    discoverAgentsFromCli(),
    discoverAgentsFromDirectory(),
    discoverAgentsFromConfig(),
  ];

  for (const agents of candidates) {
    if (agents.length > 0) {
      return agents;
    }
  }

  return [{ id: "main", workspace: path.join(OPENCLAW_HOME, "workspace"), isDefault: true, routes: [] }];
}

function currentTag() {
  return c("green", lang === "en" ? " [current]" : " [当前]");
}

function replacePlaceholders(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

function formatCharacterName(character) {
  return lang === "en"
    ? `${character.englishName || character.name}`
    : `${character.name}${character.englishName ? ` (${character.englishName})` : ""}`;
}

function getCharacterLabel(characterId, characters = loadCharacters()) {
  if (!characterId) {
    return "brooke";
  }
  const matched = characters.find((character) => character.id === characterId);
  return matched ? formatCharacterName(matched) : characterId;
}

function getProviderLabel(providerKey) {
  if (!providerKey) {
    return "mock";
  }
  return getProviders()[providerKey]?.label || providerKey;
}

function resolveEffectiveValue(selectedValue, existingValue, fallbackValue) {
  if (selectedValue !== null && selectedValue !== undefined) {
    return selectedValue;
  }
  if (existingValue !== undefined && existingValue !== null && existingValue !== "") {
    return existingValue;
  }
  return fallbackValue;
}

function formatAgentSummary(agent) {
  const detailParts = [];
  if (agent.isDefault) {
    detailParts.push(t("agent_default_tag"));
  }
  if (typeof agent.bindings === "number") {
    detailParts.push(lang === "en" ? `${agent.bindings} bindings` : `${agent.bindings} 条绑定`);
  }

  const lines = [];
  const header = detailParts.length > 0 ? `${agent.id} ${c("dim", `[${detailParts.join(", ")}]`)}` : agent.id;
  lines.push(header);

  if (Array.isArray(agent.routes) && agent.routes.length > 0) {
    lines.push(`  ${c("dim", `${t("agent_routes")}: ${agent.routes.join("; ")}`)}`);
  }
  if (agent.workspace) {
    lines.push(`  ${c("dim", `${t("agent_workspace")}: ${agent.workspace}`)}`);
  }

  return lines;
}

function normalizeProactiveSelfieConfig(value) {
  return {
    enabled: Boolean(value?.enabled),
    probability:
      typeof value?.probability === "number" && Number.isFinite(value.probability)
        ? value.probability
        : 0.1,
  };
}

function normalizeTtsConfig(value) {
  const official = toRecord(value?.official);
  const clone = toRecord(value?.clone);
  return {
    enabled: Boolean(value?.enabled),
    provider:
      value?.provider === "aliyun-clone" || value?.provider === "aliyun-official"
        ? value.provider
        : "aliyun-official",
    outputFormat:
      value?.outputFormat === "ogg" || value?.outputFormat === "opus"
        ? value.outputFormat
        : "wav",
    degradeMessage:
      typeof value?.degradeMessage === "string" && value.degradeMessage.trim()
        ? value.degradeMessage.trim()
        : getDefaultTtsDegradeMessage(),
    official: {
      model: typeof official.model === "string" && official.model.trim() ? official.model.trim() : (typeof value?.model === "string" && value.model.trim() ? value.model.trim() : TTS_DEFAULT_MODEL),
      voice: typeof official.voice === "string" && official.voice.trim() ? official.voice.trim() : (typeof value?.voice === "string" && value.voice.trim() ? value.voice.trim() : TTS_DEFAULT_VOICE),
      languageType: typeof official.languageType === "string" && official.languageType.trim() ? official.languageType.trim() : (typeof value?.languageType === "string" && value.languageType.trim() ? value.languageType.trim() : TTS_DEFAULT_LANGUAGE),
      apiKey: typeof official.apiKey === "string" && official.apiKey.trim() ? official.apiKey.trim() : (typeof value?.apiKey === "string" && value.apiKey.trim() ? value.apiKey.trim() : TTS_DEFAULT_API_KEY),
      baseUrl: typeof official.baseUrl === "string" && official.baseUrl.trim() ? official.baseUrl.trim() : (typeof value?.baseUrl === "string" && value.baseUrl.trim() ? value.baseUrl.trim() : TTS_DEFAULT_BASE_URL),
    },
    clone: {
      apiKey: typeof clone.apiKey === "string" && clone.apiKey.trim() ? clone.apiKey.trim() : (typeof value?.apiKey === "string" && value.apiKey.trim() ? value.apiKey.trim() : TTS_DEFAULT_API_KEY),
      baseUrl: typeof clone.baseUrl === "string" && clone.baseUrl.trim() ? clone.baseUrl.trim() : (typeof value?.baseUrl === "string" && value.baseUrl.trim() ? value.baseUrl.trim() : TTS_DEFAULT_BASE_URL),
      targetModel: typeof clone.targetModel === "string" && clone.targetModel.trim() ? clone.targetModel.trim() : "cosyvoice-v1",
      modelId: typeof clone.modelId === "string" ? clone.modelId.trim() : "",
      synthesisModel: typeof clone.synthesisModel === "string" && clone.synthesisModel.trim() ? clone.synthesisModel.trim() : "cosyvoice-clone-v1",
      speaker: typeof clone.speaker === "string" ? clone.speaker.trim() : "",
      promptAudioUrl: typeof clone.promptAudioUrl === "string" ? clone.promptAudioUrl.trim() : "",
      promptText: typeof clone.promptText === "string" ? clone.promptText.trim() : "",
      statusUrl: typeof clone.statusUrl === "string" && clone.statusUrl.trim() ? clone.statusUrl.trim() : TTS_DEFAULT_BASE_URL,
    },
  };
}

function formatProactiveSelfieLabel(value) {
  const config = normalizeProactiveSelfieConfig(value);
  if (!config.enabled) {
    return t("proactive_no");
  }

  if (config.probability <= 0.1) {
    return `${t("proactive_yes")} (${t("proactive_low")})`;
  }
  if (config.probability <= 0.2) {
    return `${t("proactive_yes")} (${t("proactive_mid")})`;
  }
  return `${t("proactive_yes")} (${t("proactive_high")})`;
}

function formatTtsLabel(value) {
  const config = normalizeTtsConfig(value);
  if (!config.enabled) {
    return t("tts_no");
  }
  if (config.provider === "aliyun-clone") {
    return `${t("tts_yes")} (${t("tts_provider_clone")} / ${config.outputFormat} / ${config.clone.modelId || "pending"})`;
  }
  return `${t("tts_yes")} (${config.official.voice} / ${config.official.languageType})`;
}

function getConfiguredProviderEntries(pluginConfig) {
  const providers = toRecord(pluginConfig?.providers);
  return Object.entries(providers)
    .filter(([, value]) => isPlainObject(value))
    .map(([key, value]) => ({
      key,
      type: typeof value.type === "string" && value.type.trim() ? value.type.trim() : key,
      model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : "",
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function formatConfiguredProviderLabel(entry) {
  const providerLabel = getProviders()[entry.type]?.label || entry.type || entry.key;
  const parts = [`${entry.key}`, c("dim", `— ${providerLabel}`)];
  if (entry.model) {
    parts.push(c("dim", `(${t("service_model")}: ${entry.model})`));
  }
  return parts.join(" ");
}

function getScopeTargetLabel(scope) {
  return scope?.type === "agent" ? `${t("target_agent_prefix")}: ${scope.agentId}` : t("target_shared");
}

function hasSharedScopeConfig(pluginConfig) {
  const existing = toRecord(pluginConfig);
  return (
    (typeof existing.selectedCharacter === "string" && existing.selectedCharacter.trim()) ||
    (typeof existing.defaultProvider === "string" && existing.defaultProvider.trim()) ||
    existing.proactiveSelfie !== undefined ||
    existing.tts !== undefined
  );
}

function hasManagedAgentOverrides(agentConfig) {
  const config = toRecord(agentConfig);
  return (
    Object.prototype.hasOwnProperty.call(config, "enabled") ||
    Object.prototype.hasOwnProperty.call(config, "selectedCharacter") ||
    Object.prototype.hasOwnProperty.call(config, "characterRoot") ||
    Object.prototype.hasOwnProperty.call(config, "userCharacterRoot") ||
    Object.prototype.hasOwnProperty.call(config, "defaultProvider") ||
    Object.prototype.hasOwnProperty.call(config, "fallback") ||
    Object.prototype.hasOwnProperty.call(config, "retry") ||
    Object.prototype.hasOwnProperty.call(config, "pollIntervalMs") ||
    Object.prototype.hasOwnProperty.call(config, "pollTimeoutMs") ||
    Object.prototype.hasOwnProperty.call(config, "degradeMessage") ||
    Object.prototype.hasOwnProperty.call(config, "providers") ||
    Object.prototype.hasOwnProperty.call(config, "proactiveSelfie") ||
    Object.prototype.hasOwnProperty.call(config, "tts")
  );
}

function isManagedAgentEnabled(agentConfig) {
  const config = toRecord(agentConfig);
  if (!hasManagedAgentOverrides(config)) {
    return false;
  }
  return config.enabled !== false;
}

function hasConfiguredScopes(pluginConfig) {
  if (hasSharedScopeConfig(pluginConfig)) {
    return true;
  }
  return Object.values(toRecord(toRecord(pluginConfig).agents)).some((agentConfig) => hasManagedAgentOverrides(agentConfig));
}

function hasConfiguredAgentScopes(pluginConfig) {
  return Object.values(toRecord(toRecord(pluginConfig).agents)).some((agentConfig) => hasManagedAgentOverrides(agentConfig));
}

function buildConfigTargetMenu(agents, pluginConfig, allowFinish = false) {
  const existing = toRecord(pluginConfig);
  const includeSharedTarget = !Array.isArray(agents) || agents.length <= 1;
  const sharedConfigured = hasSharedScopeConfig(existing);

  const items = [];
  const values = [];

  if (allowFinish) {
    items.push(c("green", t("target_done")));
    values.push({ type: "finish" });
  }

  if (includeSharedTarget) {
    const sharedLabel = sharedConfigured
      ? `${t("target_shared")} ${c("dim", `[${t("target_configured_tag")}]`)}`
      : t("target_shared");
    items.push(sharedLabel);
    values.push({ type: "shared" });
  }

  for (const agent of agents) {
    const agentConfig = toRecord(toRecord(existing.agents)[agent.id]);
    const hasOverride = hasManagedAgentOverrides(agentConfig);
    const configuredTag = hasOverride
      ? ` ${c("dim", `[${t("target_configured_tag")}]`)} ${c("dim", `[${isManagedAgentEnabled(agentConfig) ? t("target_enabled_tag") : t("target_disabled_tag")}]`)}`
      : "";
    items.push(`${t("target_agent_prefix")}: ${agent.id}${configuredTag}`);
    values.push({ type: "agent", agentId: agent.id });
  }

  return { items, values };
}

function getConfigTargetInitialIndex(menu) {
  const values = Array.isArray(menu?.values) ? menu.values : [];
  const finishIndex = values.findIndex((item) => item?.type === "finish");
  return finishIndex >= 0 ? finishIndex : 0;
}

function buildConfigTargetDetails(agents, selection) {
  if (!selection || selection.type !== "agent") {
    return [];
  }

  const agent = Array.isArray(agents) ? agents.find((item) => item.id === selection.agentId) : null;
  if (!agent) {
    return [];
  }

  const [header, ...rest] = formatAgentSummary(agent);
  return [
    "",
    `  ${c("cyan", `${t("target_agent_details")}:`)}`,
    `  ${header}`,
    ...rest,
  ];
}

function getSharedScopeDefaults(pluginConfig) {
  const existing = toRecord(pluginConfig);
  return {
    selectedCharacter:
      typeof existing.selectedCharacter === "string" && existing.selectedCharacter.trim()
        ? existing.selectedCharacter.trim()
        : "brooke",
    defaultProvider:
      typeof existing.defaultProvider === "string" && existing.defaultProvider.trim()
        ? existing.defaultProvider.trim()
        : "mock",
    proactiveSelfie: normalizeProactiveSelfieConfig(existing.proactiveSelfie),
    tts: normalizeTtsConfig(existing.tts),
    configured: {
      selectedCharacter:
        typeof existing.selectedCharacter === "string" && existing.selectedCharacter.trim().length > 0,
      defaultProvider:
        typeof existing.defaultProvider === "string" && existing.defaultProvider.trim().length > 0,
      proactiveSelfie: existing.proactiveSelfie !== undefined,
      tts: existing.tts !== undefined,
    },
  };
}

function resolveScopeSettings(pluginConfig, scope) {
  const existing = toRecord(pluginConfig);
  const shared = getSharedScopeDefaults(existing);

  if (!scope || scope.type !== "agent") {
    return {
      targetLabel: getScopeTargetLabel(scope),
      currentCharacterId: shared.selectedCharacter,
      currentProviderKey: shared.defaultProvider,
      currentProactiveSelfie: shared.proactiveSelfie,
      currentTts: shared.tts,
      shared,
      overrides: {},
    };
  }

  const agentConfig = toRecord(toRecord(existing.agents)[scope.agentId]);
  return {
    targetLabel: getScopeTargetLabel(scope),
    currentCharacterId:
      typeof agentConfig.selectedCharacter === "string" && agentConfig.selectedCharacter.trim()
        ? agentConfig.selectedCharacter.trim()
        : shared.selectedCharacter,
    currentProviderKey:
      typeof agentConfig.defaultProvider === "string" && agentConfig.defaultProvider.trim()
        ? agentConfig.defaultProvider.trim()
        : shared.defaultProvider,
    currentProactiveSelfie:
      agentConfig.proactiveSelfie !== undefined
        ? normalizeProactiveSelfieConfig(agentConfig.proactiveSelfie)
        : shared.proactiveSelfie,
    currentTts:
      agentConfig.tts !== undefined
        ? normalizeTtsConfig(agentConfig.tts)
        : shared.tts,
    shared,
    agentConfigured: hasManagedAgentOverrides(agentConfig),
    agentEnabled: isManagedAgentEnabled(agentConfig),
    overrides: agentConfig,
  };
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin"
    ? `open "${url}"`
    : platform === "win32"
      ? `cmd /c start "" "${url}"`
      : `xdg-open "${url}"`;
  try { execSync(cmd, { stdio: "ignore" }); return true; }
  catch { return false; }
}

// Copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Detect if running from a temporary npx directory (not a persistent local clone)
function isNpxTempDir() {
  const root = PLUGIN_PACKAGE_ROOT;
  // npx downloads to _npx/ inside npm cache or a temp dir
  if (root.includes("_npx") || root.includes("npx-")) return true;
  // Also check if inside os.tmpdir()
  const tmp = os.tmpdir();
  if (root.startsWith(tmp)) return true;
  return false;
}

// Resolve the actual plugin root: if npx temp, copy to persistent location first
function resolvePluginInstallPath() {
  if (!isNpxTempDir()) {
    return PLUGIN_PACKAGE_ROOT;
  }
  // Copy plugin package to ~/.openclaw/plugins/clawmate-companion/
  const dest = path.join(OPENCLAW_PLUGINS_DIR, PLUGIN_ID);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyDir(PLUGIN_PACKAGE_ROOT, dest);
  return dest;
}

function ensurePluginDependencies(pluginPath) {
  const packageJsonPath = path.join(pluginPath, "package.json");
  const packageJson = readJsonFile(packageJsonPath);
  const dependencies = Object.keys(packageJson?.dependencies || {});

  if (dependencies.length === 0) {
    return;
  }

  const nodeModulesDir = path.join(pluginPath, "node_modules");
  const missingDeps = dependencies.filter((dep) => !fs.existsSync(path.join(nodeModulesDir, dep)));
  if (missingDeps.length === 0) {
    logSuccess(t("deps_ready"));
    return;
  }

  logInfo(t("deps_install"));
  try {
    execSync("npm install --no-audit --no-fund --omit=dev", {
      cwd: pluginPath,
      stdio: "inherit",
    });
    logSuccess(t("deps_ready"));
  } catch {
    throw new Error(`${t("deps_fail")} ${missingDeps.join(", ")}`);
  }
}

// ── Banner ──────────────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
${c("magenta", "┌──────────────────────────────────────────────────┐")}
${c("magenta", "│")}  ${c("bright", "ClawMate Companion")} - OpenClaw Plugin Installer  ${c("magenta", "│")}
${c("magenta", "└──────────────────────────────────────────────────┘")}

${t("banner_desc")}
`);
}

// ── Step 1: Prerequisites ───────────────────────────────────────────────────
async function checkPrerequisites() {
  logStep("1/8", t("step_env"));

  if (!commandExists("openclaw")) {
    logError(t("no_openclaw"));
    logInfo(t("install_openclaw"));
    return false;
  }
  logSuccess(t("openclaw_ok"));

  if (!fs.existsSync(OPENCLAW_DIR)) {
    logWarn(t("dir_missing"));
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
  }
  logSuccess(t("dir_ok"));

  // Fast local check: avoid the slower `openclaw plugins list` startup cost.
  if (hasExistingPluginEntry()) {
    logWarn(t("already_installed"));
    return "already_installed";
  }

  return true;
}

// ── Step 2: Choose character ─────────────────────────────────────────────────
function loadCharactersFromDir(dir, builtIn) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const metaPath = path.join(dir, d.name, "meta.json");
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          return { ...meta, _builtIn: builtIn };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadCharacters() {
  const builtInRoot = path.join(PLUGIN_PACKAGE_ROOT, "skills", "clawmate-companion", "assets", "characters");
  const userRoot = path.join(OPENCLAW_HOME, "clawmeta");

  const seenIds = new Set();
  const result = [];

  // User characters first (higher priority)
  for (const ch of loadCharactersFromDir(userRoot, false)) {
    if (!seenIds.has(ch.id)) {
      seenIds.add(ch.id);
      result.push(ch);
    }
  }

  // Built-in characters
  for (const ch of loadCharactersFromDir(builtInRoot, true)) {
    if (!seenIds.has(ch.id)) {
      seenIds.add(ch.id);
      result.push(ch);
    }
  }

  return result;
}

async function chooseConfigTarget(agents, pluginConfig, options = {}) {
  if (!Array.isArray(agents) || agents.length <= 1) {
    return { type: "shared" };
  }

  logStep("2/8", t("step_target"));
  logInfo(t("choose_agent_only"));

  const menu = buildConfigTargetMenu(agents, pluginConfig, options.allowFinish);
  const selectedIndex = await arrowSelect(menu.items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex: getConfigTargetInitialIndex(menu),
    detailsRenderer: (index) => buildConfigTargetDetails(agents, menu.values[index]),
  });

  const selected = menu.values[selectedIndex] || { type: "finish" };
  if (selected.type === "shared") {
    logSuccess(`${t("selected_target")} ${t("target_shared")}`);
    return selected;
  }
  if (selected.type === "agent") {
    logSuccess(`${t("selected_target")} ${selected.agentId}`);
    return selected;
  }

  logSuccess(t("target_done"));
  return selected;
}

async function chooseAgentActivation(scope, settings) {
  if (scope?.type !== "agent") {
    return null;
  }

  if (!settings.agentConfigured) {
    return { mode: "enable" };
  }

  logStep("2.5/8", t("step_agent_status"));

  const items = [
    `${t("agent_enable")}${settings.agentEnabled ? currentTag() : ""}`,
    `${t("agent_disable")}${!settings.agentEnabled ? currentTag() : ""}`,
  ];
  const values = [{ mode: "enable" }, { mode: "disable" }];

  const selectedIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex: settings.agentEnabled ? 0 : 1,
  });

  const selection = values[selectedIndex] || { mode: "enable" };
  if (selection.mode === "disable") {
    logSuccess(t("agent_disabled_done"));
  } else {
    logSuccess(t("agent_enabled_done"));
  }
  return selection;
}

async function chooseCharacterSelection(scope, settings) {
  logStep("3/8", t("step_character"));
  logInfo(t("character_create_hint"));

  const characters = loadCharacters();
  if (characters.length === 0) {
    logWarn("No characters found, using default.");
    return { mode: "set", value: "brooke" };
  }

  const allowInherit = scope?.type === "agent" && settings.shared.configured.selectedCharacter;
  const items = [];
  const values = [];

  if (allowInherit) {
    items.push(`${t("use_global_character")}: ${getCharacterLabel(settings.shared.selectedCharacter, characters)}${
      !settings.overrides.selectedCharacter ? currentTag() : ""
    }`);
    values.push({ mode: "inherit" });
  }

  if (scope?.type === "shared" && settings.shared.configured.selectedCharacter) {
    items.push(t("clear_shared_character"));
    values.push({ mode: "clear" });
  }

  for (const character of characters) {
    const tag = character._builtIn ? "" : c("yellow", ` ${t("character_custom_tag")}`);
    const isCurrent =
      settings.currentCharacterId === character.id &&
      (
        scope?.type !== "agent" ||
        settings.overrides.selectedCharacter === character.id ||
        (!allowInherit && !settings.overrides.selectedCharacter)
      );
    const desc = lang === "en" ? character.descriptionEn : character.descriptionZh;
    const name = formatCharacterName(character);
    items.push(desc ? `${name}${tag}${isCurrent ? currentTag() : ""}  ${c("dim", `— ${desc}`)}` : `${name}${tag}${isCurrent ? currentTag() : ""}`);
    values.push({ mode: "set", value: character.id });
  }

  items.push(c("dim", `↩  ${t("skip")}`));
  values.push({ mode: "skip" });

  const initialIndex = Math.max(0, values.findIndex((item) => {
    if (item.mode === "inherit") {
      return !settings.overrides.selectedCharacter;
    }
    return item.mode === "set" && item.value === settings.currentCharacterId;
  }));

  const selectedIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex,
  });

  const selection = values[selectedIndex] || { mode: "skip" };
  if (selection.mode === "set") {
    logSuccess(`${t("selected")} ${getCharacterLabel(selection.value, characters)}`);
  } else if (selection.mode === "inherit") {
    logSuccess(`${t("selected")} ${t("use_global_character")}`);
  } else if (selection.mode === "clear") {
    logSuccess(`${t("selected")} ${t("clear_shared_character")}`);
  } else {
    logInfo(t("skipped"));
  }
  return selection;
}

async function configureProactiveSelfieSelection(scope, settings) {
  logStep("4/8", t("step_proactive"));
  logInfo(t("proactive_enable"));

  const allowInherit = scope?.type === "agent" && settings.shared.configured.proactiveSelfie;
  const current = normalizeProactiveSelfieConfig(settings.currentProactiveSelfie);
  const shared = normalizeProactiveSelfieConfig(settings.shared.proactiveSelfie);
  const values = [];
  const items = [];

  if (allowInherit) {
    items.push(`${t("use_global_proactive")}: ${formatProactiveSelfieLabel(shared)}${
      settings.overrides.proactiveSelfie === undefined ? currentTag() : ""
    }`);
    values.push({ mode: "inherit" });
  }

  if (scope?.type === "shared" && settings.shared.configured.proactiveSelfie) {
    items.push(t("clear_shared_proactive"));
    values.push({ mode: "clear" });
  }

  items.push(`${t("proactive_no")}${!current.enabled && (!allowInherit || settings.overrides.proactiveSelfie !== undefined) ? currentTag() : ""}`);
  values.push({ mode: "set", value: { enabled: false, probability: 0.1 } });

  items.push(`${t("proactive_yes")}${current.enabled ? currentTag() : ""}`);
  values.push({ mode: "enable" });

  items.push(c("dim", `↩  ${t("skip")}`));
  values.push({ mode: "skip" });

  const initialIndex = Math.max(0, values.findIndex((item) => {
    if (item.mode === "inherit") {
      return settings.overrides.proactiveSelfie === undefined;
    }
    if (item.mode === "set") {
      return !current.enabled;
    }
    if (item.mode === "enable") {
      return current.enabled;
    }
    return false;
  }));

  const enableIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex,
  });

  const selection = values[enableIndex] || { mode: "skip" };
  if (selection.mode === "skip" || selection.mode === "inherit" || selection.mode === "set" || selection.mode === "clear") {
    if (selection.mode === "inherit") {
      logSuccess(`${t("selected")} ${t("use_global_proactive")}`);
    } else if (selection.mode === "clear") {
      logSuccess(`${t("selected")} ${t("clear_shared_proactive")}`);
    } else if (selection.mode === "set") {
      logSuccess(`${t("selected")} ${t("proactive_no")}`);
    } else {
      logInfo(t("skipped"));
    }
    return selection;
  }

  const freqValues = [0.1, 0.2, 0.3];
  const currentFreqIndex = freqValues.indexOf(current.probability);
  const freqItems = [t("proactive_low"), t("proactive_mid"), t("proactive_high")].map((label, i) =>
    `${label}${current.enabled && i === currentFreqIndex ? currentTag() : ""}`
  );
  const freqIndex = await arrowSelect(freqItems, {
    title: `  ${t("proactive_freq")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: current.enabled && currentFreqIndex >= 0 ? currentFreqIndex : 0,
  });

  const result = { mode: "set", value: { enabled: true, probability: freqValues[freqIndex] } };
  logSuccess(`${t("proactive_done")} (${result.value.probability})`);
  return result;
}

async function configureTtsSelection(scope, settings) {
  logStep("5/8", t("step_tts"));
  logInfo(t("tts_enable"));

  const allowInherit = scope?.type === "agent" && settings.shared.configured.tts;
  const current = normalizeTtsConfig(settings.currentTts);
  const shared = normalizeTtsConfig(settings.shared.tts);
  const values = [];
  const items = [];

  if (allowInherit) {
    items.push(`${t("use_global_tts")}: ${formatTtsLabel(shared)}${settings.overrides.tts === undefined ? currentTag() : ""}`);
    values.push({ mode: "inherit" });
  }

  if (scope?.type === "shared" && settings.shared.configured.tts) {
    items.push(t("clear_shared_tts"));
    values.push({ mode: "clear" });
  }

  items.push(`${t("tts_no")}${!current.enabled && (!allowInherit || settings.overrides.tts !== undefined) ? currentTag() : ""}`);
  values.push({ mode: "set", value: { enabled: false } });

  items.push(`${t("tts_yes")}${current.enabled ? currentTag() : ""}`);
  values.push({ mode: "enable" });

  items.push(c("dim", `↩  ${t("skip")}`));
  values.push({ mode: "skip" });

  const initialIndex = Math.max(0, values.findIndex((item) => {
    if (item.mode === "inherit") return settings.overrides.tts === undefined;
    if (item.mode === "set") return !current.enabled;
    if (item.mode === "enable") return current.enabled;
    return false;
  }));

  const selectionIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex,
  });

  const selection = values[selectionIndex] || { mode: "skip" };
  if (selection.mode === "skip" || selection.mode === "inherit" || selection.mode === "set" || selection.mode === "clear") {
    if (selection.mode === "inherit") {
      logSuccess(`${t("selected")} ${t("use_global_tts")}`);
    } else if (selection.mode === "clear") {
      logSuccess(`${t("selected")} ${t("clear_shared_tts")}`);
    } else if (selection.mode === "set") {
      logSuccess(`${t("selected")} ${t("tts_no")}`);
    } else {
      logInfo(t("skipped"));
    }
    return selection;
  }

  const providerItems = [
    `${t("tts_provider_official")}${current.provider === "aliyun-official" ? currentTag() : ""}`,
    `${t("tts_provider_clone")}${current.provider === "aliyun-clone" ? currentTag() : ""}`,
  ];
  const providerIndex = await arrowSelect(providerItems, {
    title: `  ${t("tts_select_provider")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: current.provider === "aliyun-clone" ? 1 : 0,
  });
  const provider = providerIndex === 1 ? "aliyun-clone" : "aliyun-official";

  const outputOptions = ["wav", "ogg", "opus"];
  const outputItems = outputOptions.map((item) => `${item}${item === current.outputFormat ? currentTag() : ""}`);
  const outputIndex = await arrowSelect(outputItems, {
    title: `  ${t("tts_output_format")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: Math.max(0, outputOptions.indexOf(current.outputFormat)),
  });
  const outputFormat = outputOptions[outputIndex];

  logInfo(`${t("tts_api_key_hint")} ${TTS_API_KEY_HELP_URL}`);
  const currentApiKey = provider === "aliyun-clone" ? current.clone.apiKey : current.official.apiKey;
  const currentApiKeyTag = currentApiKey ? ` ${c("green", "[****]")}` : "";
  const apiKeyInput = await ask(`  ${t("tts_api_key")}${currentApiKeyTag}: `);
  const apiKey = apiKeyInput || currentApiKey;
  if (!apiKey) {
    logError(`${t("tts_api_key")} ${t("field_required")}`);
    return null;
  }

  if (provider === "aliyun-clone") {
    logInfo(`${t("tts_clone_doc_hint")} ${TTS_CLONE_DOC_URL}`);
    const targetModel = (await ask(`  ${t("tts_clone_target_model")}: `)) || current.clone.targetModel || "cosyvoice-v1";
    const modelId = (await ask(`  ${t("tts_clone_model_id")}: `)) || current.clone.modelId || "";
    const synthesisModel = (await ask(`  ${t("tts_clone_synthesis_model")}: `)) || current.clone.synthesisModel || "cosyvoice-clone-v1";
    const speaker = (await ask(`  ${t("tts_clone_speaker")}: `)) || current.clone.speaker || "";
    const promptAudioUrl = (await ask(`  ${t("tts_clone_prompt_audio_url")}: `)) || current.clone.promptAudioUrl || "";
    const promptText = (await ask(`  ${t("tts_clone_prompt_text")}: `)) || current.clone.promptText || "";
    const statusUrl = (await ask(`  ${t("tts_clone_status_url")}: `)) || current.clone.statusUrl || TTS_DEFAULT_BASE_URL;

    const result = {
      mode: "set",
      value: {
        enabled: true,
        provider,
        outputFormat,
        degradeMessage: getDefaultTtsDegradeMessage(),
        official: current.official,
        clone: {
          apiKey,
          baseUrl: current.clone.baseUrl || TTS_DEFAULT_BASE_URL,
          targetModel,
          modelId,
          synthesisModel,
          speaker,
          promptAudioUrl,
          promptText,
          statusUrl,
        },
      },
    };
    logSuccess(`${t("tts_done")} (${t("tts_provider_clone")} / ${outputFormat})`);
    return result;
  }

  const voiceOptions = getTtsVoiceOptions();
  const voiceItems = voiceOptions.map((item) => `${item.label}${item.value === current.official.voice ? currentTag() : ""}`);
  voiceItems.push(t("custom_input"));
  const currentVoiceIndex = voiceOptions.findIndex((item) => item.value === current.official.voice);
  const selectedVoiceIndex = await arrowSelect(voiceItems, {
    title: `  ${t("tts_select_voice")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: currentVoiceIndex >= 0 ? currentVoiceIndex : 0,
    detailsRenderer: () => [
      `  ${c("yellow", t("tts_voice_hint"))}`,
      `  ${c("cyan", c("bright", TTS_VOICE_TEST_URL))}`,
    ],
  });

  let voice = current.official.voice;
  if (selectedVoiceIndex === voiceOptions.length) {
    const customVoice = await ask(`  ${t("tts_custom_voice")}`);
    if (!customVoice) {
      logError(`${t("tts_select_voice")} ${t("field_required")}`);
      return null;
    }
    voice = customVoice;
  } else {
    voice = voiceOptions[selectedVoiceIndex].value;
  }

  const languageItems = TTS_LANGUAGE_OPTIONS.map((item) => `${item}${item === current.official.languageType ? currentTag() : ""}`);
  const currentLanguageIndex = Math.max(0, TTS_LANGUAGE_OPTIONS.indexOf(current.official.languageType));
  const languageIndex = await arrowSelect(languageItems, {
    title: `  ${t("tts_select_language")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: currentLanguageIndex,
  });
  const languageType = TTS_LANGUAGE_OPTIONS[languageIndex];

  const result = {
    mode: "set",
    value: {
      enabled: true,
      provider,
      outputFormat,
      degradeMessage: getDefaultTtsDegradeMessage(),
      official: {
        model: TTS_DEFAULT_MODEL,
        voice,
        languageType,
        apiKey,
        baseUrl: current.official.baseUrl || TTS_DEFAULT_BASE_URL,
      },
      clone: current.clone,
    },
  };
  logSuccess(`${t("tts_done")} (${voice} / ${languageType} / ${outputFormat})`);
  return result;
}

async function chooseProviderType(currentType) {
  const providers = getProviders();
  const providerKeys = Object.keys(providers);
  const items = providerKeys.map((key) => `${providers[key].label}${key === currentType ? currentTag() : ""}`);
  items.push(c("dim", `↩  ${t("skip")}`));

  const initialIndex = currentType ? Math.max(0, providerKeys.indexOf(currentType)) : 0;
  const selectedIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex,
  });

  if (selectedIndex === providerKeys.length) {
    logInfo(t("skipped"));
    return null;
  }

  const providerType = providerKeys[selectedIndex];
  logSuccess(`${t("selected")} ${providers[providerType].label}`);
  return providerType;
}

async function collectProviderConfig(providerKey, existingProviderConfig = {}) {
  const providers = getProviders();
  const provider = providers[providerKey];
  const answers = {};

  if (provider.fields.length === 0) {
    logInfo(t("mock_skip"));
    return provider.buildConfig(answers);
  }

  for (const field of provider.fields) {
    if (typeof field.when === "function" && !field.when(answers, existingProviderConfig)) {
      continue;
    }

    const existingValue = typeof field.resolveExistingValue === "function"
      ? field.resolveExistingValue(existingProviderConfig, answers)
      : existingProviderConfig[field.key];
    const fieldRequired = typeof field.required === "function"
      ? field.required(answers, existingProviderConfig)
      : field.required;

    if (providerKey === "fal" && field.key === "apiKey") {
      const openIt = await ask(t("fal_open"));
      if (openIt.toLowerCase() !== "n") {
        openBrowser("https://fal.ai/dashboard/keys");
      }
      log("");
    }

    if (field.choices) {
      const items = field.choices.map((choice) => `${choice.label}${choice.value === existingValue ? currentTag() : ""}`);
      if (field.allowCustom) {
        items.push(t("custom_input"));
      }

      log(`\n  ${field.prompt}:`);
      const currentChoiceIndex = existingValue ? field.choices.findIndex((choice) => choice.value === existingValue) : -1;
      const choiceIndex = await arrowSelect(items, {
        title: `  ${c("dim", t("arrow_hint"))}`,
        initialIndex: currentChoiceIndex >= 0 ? currentChoiceIndex : (field.allowCustom && existingValue ? field.choices.length : 0),
      });

      if (field.allowCustom && choiceIndex === field.choices.length) {
        const custom = await ask(`  ${field.customPrompt || t("custom_input")}`);
        if (!custom) {
          logError(t("model_empty"));
          return null;
        }
        answers[field.key] = custom;
        logSuccess(`${t("selected")} ${answers[field.key]}`);
      } else {
        answers[field.key] = field.choices[choiceIndex].value;
        logSuccess(`${t("selected")} ${field.choices[choiceIndex].label}`);
      }
      continue;
    }

    const effectiveDefault = existingValue || field.default || "";
    let prompt = `${field.prompt}`;
    if (field.hint) {
      prompt += ` ${c("dim", `(${field.hint})`)}`;
    }
    if (effectiveDefault) {
      const masked = field.secret ? "****" : effectiveDefault;
      prompt += ` ${c("green", `[${masked}]`)}`;
    }
    prompt += ": ";

    const value = await ask(prompt);
    answers[field.key] = value || effectiveDefault;

    if (fieldRequired && !answers[field.key]) {
      logError(`${field.prompt} ${t("field_required")}`);
      return null;
    }
  }

  const config = provider.buildConfig(answers);
  logSuccess(t("config_done"));
  return config;
}

async function chooseProviderSelection(scope, pluginConfig, settings) {
  logStep("6/8", t("step_provider"));
  logInfo(t("provider_recommend"));

  const configuredProviders = getConfiguredProviderEntries(pluginConfig);
  const allowInherit = scope?.type === "agent" && settings.shared.configured.defaultProvider;
  const items = [];
  const values = [];

  if (allowInherit) {
    items.push(`${t("use_global_provider")}: ${getProviderLabel(settings.shared.defaultProvider)}${
      !settings.overrides.defaultProvider ? currentTag() : ""
    }`);
    values.push({ mode: "inherit" });
  }

  if (scope?.type === "shared" && settings.shared.configured.defaultProvider) {
    items.push(t("clear_shared_provider"));
    values.push({ mode: "clear" });
  }

  for (const entry of configuredProviders) {
    const isCurrent =
      settings.currentProviderKey === entry.key &&
      (
        scope?.type !== "agent" ||
        settings.overrides.defaultProvider === entry.key ||
        (!allowInherit && !settings.overrides.defaultProvider)
      );
    items.push(`${formatConfiguredProviderLabel(entry)}${isCurrent ? currentTag() : ""}`);
    values.push({ mode: "set", providerKey: entry.key });
  }

  items.push(t("create_new_service"));
  values.push({ mode: "create" });

  items.push(c("dim", `↩  ${t("skip")}`));
  values.push({ mode: "skip" });

  const initialIndex = Math.max(0, values.findIndex((item) => {
    if (item.mode === "inherit") {
      return !settings.overrides.defaultProvider;
    }
    return item.mode === "set" && item.providerKey === settings.currentProviderKey;
  }));

  const selectedIndex = await arrowSelect(items, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex,
  });
  const selection = values[selectedIndex] || { mode: "skip" };

  if (selection.mode === "skip" || selection.mode === "inherit" || selection.mode === "set" || selection.mode === "clear") {
    if (selection.mode === "inherit") {
      logSuccess(`${t("selected")} ${t("use_global_provider")}`);
    } else if (selection.mode === "clear") {
      logSuccess(`${t("selected")} ${t("clear_shared_provider")}`);
    } else if (selection.mode === "set") {
      logSuccess(`${t("selected")} ${selection.providerKey}`);
    } else {
      logInfo(t("skipped"));
    }
    return { selection, providerConfigs: {} };
  }

  log(`\n  ${t("service_type")}:`);
  const providerType = await chooseProviderType(settings.currentProviderKey);
  if (!providerType) {
    return { selection: { mode: "skip" }, providerConfigs: {} };
  }

  const existingProviders = toRecord(pluginConfig?.providers);
  const providerConfig = await collectProviderConfig(providerType, toRecord(existingProviders[providerType]));
  if (!providerConfig) {
    return null;
  }

  return {
    selection: { mode: "set", providerKey: providerType },
    providerConfigs: { [providerType]: providerConfig },
  };
}

function clearManagedAgentFields(agentConfig) {
  const next = { ...toRecord(agentConfig) };
  delete next.selectedCharacter;
  delete next.defaultProvider;
  delete next.proactiveSelfie;
  delete next.tts;
  return next;
}

function buildPluginConfig(existingConfig, options) {
  const existing = toRecord(existingConfig);
  const nextConfig = { ...existing };

  nextConfig.userCharacterRoot = options.defaultUserCharacterRoot;
  if (!nextConfig.fallback) {
    nextConfig.fallback = { enabled: false, order: [] };
  }
  if (!nextConfig.retry) {
    nextConfig.retry = { maxAttempts: 2, backoffMs: 1000 };
  }

  const mergedProviders = {
    ...toRecord(existing.providers),
    ...toRecord(options.providerConfigs),
  };
  if (Object.keys(mergedProviders).length > 0) {
    nextConfig.providers = mergedProviders;
  }

  if (options.scope?.type === "shared") {
    if (options.characterSelection?.mode === "set") {
      nextConfig.selectedCharacter = options.characterSelection.value;
    } else if (options.characterSelection?.mode === "clear") {
      delete nextConfig.selectedCharacter;
    }
    if (options.providerSelection?.mode === "set") {
      nextConfig.defaultProvider = options.providerSelection.providerKey;
    } else if (options.providerSelection?.mode === "clear") {
      delete nextConfig.defaultProvider;
    }
    if (options.proactiveSelection?.mode === "set") {
      nextConfig.proactiveSelfie = options.proactiveSelection.value;
    } else if (options.proactiveSelection?.mode === "clear") {
      delete nextConfig.proactiveSelfie;
    }
    if (options.ttsSelection?.mode === "set") {
      nextConfig.tts = options.ttsSelection.value;
    } else if (options.ttsSelection?.mode === "clear") {
      delete nextConfig.tts;
    }

    return nextConfig;
  }

  if (options.scope?.type === "agent") {
    const nextAgents = { ...toRecord(existing.agents) };
    const currentOverride = { ...toRecord(nextAgents[options.scope.agentId]) };
    currentOverride.enabled = options.activationSelection?.mode === "disable" ? false : true;

    if (options.characterSelection?.mode === "inherit") {
      delete currentOverride.selectedCharacter;
    } else if (options.characterSelection?.mode === "set") {
      currentOverride.selectedCharacter = options.characterSelection.value;
    }

    if (options.providerSelection?.mode === "inherit") {
      delete currentOverride.defaultProvider;
    } else if (options.providerSelection?.mode === "set") {
      currentOverride.defaultProvider = options.providerSelection.providerKey;
    }

    if (options.proactiveSelection?.mode === "inherit") {
      delete currentOverride.proactiveSelfie;
    } else if (options.proactiveSelection?.mode === "set") {
      currentOverride.proactiveSelfie = options.proactiveSelection.value;
    }

    if (options.ttsSelection?.mode === "inherit") {
      delete currentOverride.tts;
    } else if (options.ttsSelection?.mode === "set") {
      currentOverride.tts = options.ttsSelection.value;
    }

    if (Object.keys(currentOverride).length > 0) {
      nextAgents[options.scope.agentId] = currentOverride;
    } else {
      delete nextAgents[options.scope.agentId];
    }

    if (Object.keys(nextAgents).length > 0) {
      nextConfig.agents = nextAgents;
    } else {
      delete nextConfig.agents;
    }
  }

  return nextConfig;
}

// ── Step 4: Install plugin ──────────────────────────────────────────────────
async function installPlugin(pluginConfig) {
  logStep("7/8", t("step_install"));
  fs.mkdirSync(pluginConfig.userCharacterRoot, { recursive: true });

  // If running from npx temp dir, copy plugin to persistent location
  const pluginPath = resolvePluginInstallPath();
  const isRemote = pluginPath !== PLUGIN_PACKAGE_ROOT;

  if (isRemote) {
    logInfo(`${t("plugin_path")} ${pluginPath} (copied)`);
    ensurePluginDependencies(pluginPath);
  } else {
    logInfo(`${t("plugin_path")} ${pluginPath}`);
  }

  try {
    execSync(`openclaw plugins install --link "${pluginPath}"`, {
      stdio: "inherit",
    });
    logSuccess(t("link_ok"));
  } catch {
    logWarn(t("link_fail"));
  }

  // Update openclaw.json with provider config — only write non-skipped fields
  let config = readJsonFile(OPENCLAW_CONFIG) || {};

  config.plugins = toRecord(config.plugins);
  config.plugins.entries = toRecord(config.plugins.entries);
  const existingEntry = toRecord(config.plugins.entries[PLUGIN_ID]);
  config.plugins.entries[PLUGIN_ID] = {
    ...existingEntry,
    enabled: true,
    config: pluginConfig,
  };

  writeJsonFile(OPENCLAW_CONFIG, config);
  logSuccess(`${t("config_written")} ${OPENCLAW_CONFIG}`);

  return pluginPath;
}

// ── Step 5: Summary ─────────────────────────────────────────────────────────
function printSummary(pluginConfig, pluginPath, scope) {
  logStep("8/8", t("step_done"));

  const settings = resolveScopeSettings(pluginConfig, scope);
  const providerLabel = getProviderLabel(settings.currentProviderKey);
  const ttsLabel = formatTtsLabel(settings.currentTts);
  const targetLabel = getScopeTargetLabel(scope);

  console.log(`
${c("green", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
${c("bright", `  ${t("summary_ready")}`)}
${c("green", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}

${c("cyan", t("summary_path"))}
  ${pluginPath}

${c("cyan", t("summary_provider"))}
  ${providerLabel}

${c("cyan", t("summary_tts"))}
  ${ttsLabel}

${c("cyan", t("summary_target"))}
  ${targetLabel}

${c("cyan", t("summary_config"))}
  ${OPENCLAW_CONFIG}

${c("cyan", t("summary_repo"))}
  https://github.com/BytePioneer-AI/clawmate

${c("yellow", t("summary_star"))}

${c("yellow", t("summary_try"))}
  "${t("summary_ex1")}"
  "${t("summary_ex2")}"
  "${t("summary_ex3")}"

${c("yellow", t("summary_create_char"))}
  "${t("summary_create_ex")}"

`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  try {
    printBanner();

    // Step 0: Language selection (before banner re-render)
    log(`  ${c("dim", t("step_lang"))}`);
    const langIndex = await arrowSelect(["中文", "English"]);
    lang = langIndex === 1 ? "en" : "zh";

    // Step 1
    const prereq = await checkPrerequisites();
    if (prereq === false) {
      process.exit(1);
    }
    if (prereq === "already_installed") {
      const reinstall = await ask(`\n${t("reinstall")}`);
      if (reinstall.toLowerCase() !== "y") {
        log(`\n${t("no_change")}`);
        process.exit(0);
      }
    }

    logStep("1.5/8", t("step_agents"));
    const discoveredAgents = discoverAgents();
    logSuccess(replacePlaceholders(t("agents_found"), { count: discoveredAgents.length }));

    const existingConfig = readExistingPluginConfig() || {};
    let workingConfig = existingConfig;
    let lastConfiguredScope = Array.isArray(discoveredAgents) && discoveredAgents.length <= 1
      ? { type: "shared" }
      : null;

    while (true) {
      const allowFinish =
        !Array.isArray(discoveredAgents) ||
        discoveredAgents.length <= 1 ||
        hasConfiguredAgentScopes(workingConfig);
      const scope = await chooseConfigTarget(discoveredAgents, workingConfig, {
        allowFinish,
      });
      if (scope.type === "finish") {
        break;
      }

      const settings = resolveScopeSettings(workingConfig, scope);
      const activationSelection = await chooseAgentActivation(scope, settings);
      if (activationSelection?.mode === "disable") {
        workingConfig = buildPluginConfig(workingConfig, {
          scope,
          activationSelection,
          providerConfigs: {},
          defaultUserCharacterRoot: path.join(OPENCLAW_HOME, "clawmeta"),
        });
        lastConfiguredScope = scope;
        continue;
      }

      const characterSelection = await chooseCharacterSelection(scope, settings);
      const proactiveSelection = await configureProactiveSelfieSelection(scope, settings);
      const ttsSelection = await configureTtsSelection(scope, settings);
      if (!ttsSelection) {
        process.exit(1);
      }
      const providerResult = await chooseProviderSelection(scope, workingConfig, settings);
      if (!providerResult) {
        process.exit(1);
      }

      workingConfig = buildPluginConfig(workingConfig, {
        scope,
        activationSelection,
        characterSelection,
        proactiveSelection,
        ttsSelection,
        providerSelection: providerResult.selection,
        providerConfigs: providerResult.providerConfigs,
        defaultUserCharacterRoot: path.join(OPENCLAW_HOME, "clawmeta"),
      });
      lastConfiguredScope = scope;

      if (!Array.isArray(discoveredAgents) || discoveredAgents.length <= 1) {
        break;
      }
    }

    const finalPluginConfig = workingConfig;
    const pluginPath = await installPlugin(finalPluginConfig);

    printSummary(finalPluginConfig, pluginPath, lastConfiguredScope ?? { type: "shared" });
  } catch (error) {
    logError(`${t("fail")} ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  __testing: {
    buildPluginConfig,
    buildConfigTargetMenu,
    getConfigTargetInitialIndex,
    buildConfigTargetDetails,
    getProviders,
    hasConfiguredAgentScopes,
    hasConfiguredScopes,
    normalizeTtsConfig,
    normalizeAgents,
    resolveScopeSettings,
    setLang(nextLang) {
      lang = nextLang;
    },
    t,
  },
};
