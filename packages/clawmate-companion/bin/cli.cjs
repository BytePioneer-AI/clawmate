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
const HOME = os.homedir();
const OPENCLAW_DIR = path.join(HOME, ".openclaw");
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, "openclaw.json");
const OPENCLAW_PLUGINS_DIR = path.join(OPENCLAW_DIR, "plugins");
const PLUGIN_PACKAGE_ROOT = path.resolve(__dirname, "..");
const PLUGIN_ID = "clawmate-companion";

// ── i18n ────────────────────────────────────────────────────────────────────
let lang = "zh";

const T = {
  zh: {
    banner_desc: "为你的 OpenClaw Agent 添加角色化自拍生成能力。",
    arrow_hint: "↑↓ 选择，Enter 确认",
    step_lang: "选择语言 / Select Language",
    step_env: "检查环境...",
    step_character: "选择角色...",
    step_proactive: "配置主动发图...",
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
    summary_config: "配置文件:",
    summary_repo: "项目仓库:",
    summary_star: "⭐ 如果这个项目对你有帮助，请给我们一个 Star！⭐",
    summary_try: "试试对你的 Agent 说:",
    summary_ex1: "发张自拍看看",
    summary_ex2: "晚上在卧室穿着粉色睡衣拍一张",
    summary_ex3: "你现在在干嘛？发张照片",
    summary_manage: "插件管理:",
    summary_create_char: "创建自定义角色:",
    summary_create_ex: "帮我创建一个新角色，她是一个[描述职业/性格/背景]",
    fail: "安装失败:",
    skip: "跳过，稍后再配置",
    skipped: "已跳过",
    character_create_hint: "没有想要的角色？安装完成后，对 Agent 说「帮我创建一个新角色，她是一个[描述角色职业/性格/背景]」即可通过对话自建。",
    // providers
    p_aliyun: "阿里云百炼",
    p_volcengine: "火山引擎 ARK",
    p_fal: "fal.ai",
    p_openai: "OpenAI 兼容接口",
    p_mock: "Mock (仅测试，不需要 API Key)",
    f_select_model: "选择模型",
    f_custom_model: "输入自定义模型名称: ",
    f_custom_endpoint: "输入自定义模型 Endpoint ID: ",
    f_model_name: "模型名称",
    f_fal_hint: "从 https://fal.ai/dashboard/keys 获取",
    f_baseurl_hint: "例: https://api.openai.com/v1",
  },
  en: {
    banner_desc: "Add character selfie generation to your OpenClaw Agent.",
    arrow_hint: "Up/Down to select, Enter to confirm",
    step_lang: "选择语言 / Select Language",
    step_env: "Checking environment...",
    step_character: "Select character...",
    step_proactive: "Configure proactive selfie...",
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
    summary_config: "Config file:",
    summary_repo: "Repository:",
    summary_star: "⭐ If this project helps you, please give us a Star! ⭐",
    summary_try: "Try saying to your Agent:",
    summary_ex1: "Send me a selfie",
    summary_ex2: "Take a photo in pink pajamas in the bedroom at night",
    summary_ex3: "What are you doing? Send a pic",
    summary_manage: "Plugin management:",
    summary_create_char: "Create a custom character:",
    summary_create_ex: "Help me create a new character, she is a [describe occupation/personality/background]",
    fail: "Installation failed:",
    skip: "Skip, configure later",
    skipped: "Skipped",
    character_create_hint: "Don't see the character you want? After installation, tell your Agent \"help me create a new character, she is a [describe occupation/personality/background]\" to build one through conversation.",
    // providers
    p_aliyun: "Alibaba Cloud Bailian",
    p_volcengine: "Volcengine ARK",
    p_fal: "fal.ai",
    p_openai: "OpenAI Compatible",
    p_mock: "Mock (testing only, no API Key needed)",
    f_select_model: "Select model",
    f_custom_model: "Enter custom model name: ",
    f_custom_endpoint: "Enter custom model Endpoint ID: ",
    f_model_name: "Model name",
    f_fal_hint: "Get from https://fal.ai/dashboard/keys",
    f_baseurl_hint: "e.g. https://api.openai.com/v1",
  },
};

function t(key) { return T[lang][key] || T.zh[key] || key; }

// ── Provider definitions (dynamic for i18n) ─────────────────────────────────
function getProviders() {
  return {
    aliyun: {
      label: t("p_aliyun"),
      fields: [
        { key: "apiKey", prompt: "DashScope API Key", secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "wan2.6-image", label: "wan2.6-image (万相 2.6)" },
            { value: "qwen-image-edit-max", label: "qwen-image-edit-max (Qwen 图像编辑)" },
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
        { key: "apiKey", prompt: "ARK API Key", secret: true, required: true },
        {
          key: "model",
          prompt: t("f_select_model"),
          choices: [
            { value: "doubao-seedream-4-5-251128", label: "doubao-seedream-4-5-251128 (SeedDream 4.5)" },
            { value: "doubao-seedream-4-0-250828", label: "doubao-seedream-4-0-250828 (SeedDream 4.0)" },
          ],
          allowCustom: true,
          customPrompt: t("f_custom_endpoint"),
        },
      ],
      buildConfig(answers) {
        return { type: "volcengine", apiKey: answers.apiKey, model: answers.model };
      },
    },
    fal: {
      label: t("p_fal"),
      fields: [
        { key: "apiKey", prompt: "FAL_KEY", secret: true, required: true, hint: t("f_fal_hint") },
        { key: "model", prompt: t("f_model_name"), default: "fal-ai/flux/dev/image-to-image" },
      ],
      buildConfig(answers) {
        return { type: "fal", apiKey: answers.apiKey, model: answers.model };
      },
    },
    "openai-compatible": {
      label: t("p_openai"),
      fields: [
        { key: "apiKey", prompt: "API Key", secret: true, required: true },
        { key: "baseUrl", prompt: "Base URL", required: true, hint: t("f_baseurl_hint") },
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
function arrowSelect(items, { title = "", initialIndex = 0 } = {}) {
  return new Promise((resolve) => {
    let cursor = Math.max(0, Math.min(initialIndex, items.length - 1));
    const { stdin, stdout } = process;

    function render() {
      // Move up to clear previous render (except first time)
      stdout.write(`\x1b[${items.length}A`);
      for (let i = 0; i < items.length; i++) {
        const prefix = i === cursor ? c("cyan", " ❯ ") : "   ";
        const label = i === cursor ? c("bright", items[i]) : c("dim", items[i]);
        stdout.write(`\x1b[2K${prefix}${label}\n`);
      }
    }

    function firstRender() {
      if (title) stdout.write(`${title}\n`);
      for (let i = 0; i < items.length; i++) {
        const prefix = i === cursor ? c("cyan", " ❯ ") : "   ";
        const label = i === cursor ? c("bright", items[i]) : c("dim", items[i]);
        stdout.write(`${prefix}${label}\n`);
      }
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
        render();
      }
      // Down arrow: \x1b[B
      else if (key === "\x1b[B" || key === "j") {
        cursor = (cursor + 1) % items.length;
        render();
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

    firstRender();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKey);
  });
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
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

function readExistingPluginConfig() {
  const config = readJsonFile(OPENCLAW_CONFIG);
  return config?.plugins?.entries?.[PLUGIN_ID]?.config || null;
}

function currentTag() {
  return c("green", lang === "en" ? " [current]" : " [当前]");
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "${url}"` : `xdg-open "${url}"`;
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
  logStep("1/6", t("step_env"));

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

  // Check if plugin already linked
  try {
    const result = execSync("openclaw plugins list 2>/dev/null", { encoding: "utf8" });
    if (result.includes(PLUGIN_ID)) {
      logWarn(t("already_installed"));
      return "already_installed";
    }
  } catch {
    // plugins list command may not exist, continue
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
  const openClawHome = process.env.OPENCLAW_HOME?.trim() || path.join(HOME, ".openclaw");
  const userRoot = path.join(openClawHome, "clawmeta");

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

async function chooseCharacter() {
  logStep("2/6", t("step_character"));
  logInfo(t("character_create_hint"));

  const existing = readExistingPluginConfig();
  const currentCharId = existing?.selectedCharacter;

  const characters = loadCharacters();
  if (characters.length === 0) {
    logWarn("No characters found, using default.");
    return "brooke";
  }

  const items = characters.map((ch) => {
    const name = lang === "en"
      ? `${ch.englishName || ch.name}`
      : `${ch.name}${ch.englishName ? ` (${ch.englishName})` : ""}`;
    const desc = lang === "en" ? ch.descriptionEn : ch.descriptionZh;
    const tag = ch._builtIn ? "" : c("yellow", " [自定义]");
    const cur = ch.id === currentCharId ? currentTag() : "";
    return desc ? `${name}${tag}${cur}  ${c("dim", `— ${desc}`)}` : `${name}${tag}${cur}`;
  });

  const initialIndex = currentCharId ? Math.max(0, characters.findIndex((ch) => ch.id === currentCharId)) : 0;
  const skipLabel = c("dim", `↩  ${t("skip")}`);
  const allItems = [...items, skipLabel];
  const index = await arrowSelect(allItems, { title: `  ${c("dim", t("arrow_hint"))}`, initialIndex });
  if (index === characters.length) {
    logInfo(t("skipped"));
    return null;
  }
  const selected = characters[index];
  logSuccess(`${t("selected")} ${selected.name}${selected.englishName ? ` (${selected.englishName})` : ""}`);
  return selected.id;
}

// ── Step 3: Choose provider ─────────────────────────────────────────────────
async function chooseProvider() {
  logStep("4/6", t("step_provider"));

  const existing = readExistingPluginConfig();
  const currentProvider = existing?.defaultProvider;

  const providers = getProviders();
  const providerKeys = Object.keys(providers);
  const items = providerKeys.map((key) =>
    `${providers[key].label}${key === currentProvider ? currentTag() : ""}`
  );
  items.push(c("dim", `↩  ${t("skip")}`));

  const initialIndex = currentProvider ? Math.max(0, providerKeys.indexOf(currentProvider)) : 0;
  const index = await arrowSelect(items, { title: `  ${c("dim", t("arrow_hint"))}`, initialIndex });

  if (index === providerKeys.length) {
    logInfo(t("skipped"));
    return null;
  }

  const selectedKey = providerKeys[index];
  logSuccess(`${t("selected")} ${providers[selectedKey].label}`);
  return selectedKey;
}

// ── Step 2.5: Configure proactive selfie ────────────────────────────────────
async function configureProactiveSelfie() {
  logStep("3/6", t("step_proactive"));
  logInfo(t("proactive_enable"));

  const existing = readExistingPluginConfig();
  const currentEnabled = existing?.proactiveSelfie?.enabled ?? false;
  const currentProb = existing?.proactiveSelfie?.probability ?? 0.1;

  const freqValues = [0.1, 0.2, 0.3];
  const enableItems = [
    `${t("proactive_no")}${!currentEnabled ? currentTag() : ""}`,
    `${t("proactive_yes")}${currentEnabled ? currentTag() : ""}`,
    c("dim", `↩  ${t("skip")}`),
  ];
  const enableIndex = await arrowSelect(enableItems, {
    title: `  ${c("dim", t("arrow_hint"))}`,
    initialIndex: currentEnabled ? 1 : 0,
  });

  if (enableIndex === 2) {
    logInfo(t("skipped"));
    return null;
  }

  if (enableIndex === 0) {
    logSuccess(`${t("selected")} ${t("proactive_no")}`);
    return { enabled: false, probability: 0.1 };
  }

  const currentFreqIndex = freqValues.indexOf(currentProb);
  const freqItems = [t("proactive_low"), t("proactive_mid"), t("proactive_high")].map((label, i) =>
    `${label}${i === currentFreqIndex ? currentTag() : ""}`
  );

  const freqIndex = await arrowSelect(freqItems, {
    title: `  ${t("proactive_freq")}\n  ${c("dim", t("arrow_hint"))}`,
    initialIndex: currentFreqIndex >= 0 ? currentFreqIndex : 0,
  });

  const probability = freqValues[freqIndex];
  logSuccess(`${t("proactive_done")} (${probability})`);
  return { enabled: true, probability };
}


async function collectProviderConfig(providerKey) {
  const existing = readExistingPluginConfig();
  const existingProviderConfig = existing?.providers?.[providerKey] || {};

  const providers = getProviders();
  const provider = providers[providerKey];
  const answers = {};

  if (provider.fields.length === 0) {
    logInfo(t("mock_skip"));
    return provider.buildConfig(answers);
  }

  for (const field of provider.fields) {
    const existingValue = existingProviderConfig[field.key];

    // Open browser for fal.ai
    if (providerKey === "fal" && field.key === "apiKey") {
      const openIt = await ask(t("fal_open"));
      if (openIt.toLowerCase() !== "n") {
        openBrowser("https://fal.ai/dashboard/keys");
      }
      log("");
    }

    // Choice-based field
    if (field.choices) {
      const items = field.choices.map((ch) =>
        `${ch.label}${ch.value === existingValue ? currentTag() : ""}`
      );
      if (field.allowCustom) {
        items.push(t("custom_input"));
      }

      log(`\n  ${field.prompt}:`);
      const currentChoiceIndex = existingValue ? field.choices.findIndex((ch) => ch.value === existingValue) : -1;
      const choiceIndex = await arrowSelect(items, {
        title: `  ${c("dim", t("arrow_hint"))}`,
        initialIndex: currentChoiceIndex >= 0 ? currentChoiceIndex : 0,
      });

      if (field.allowCustom && choiceIndex === field.choices.length) {
        const custom = await ask(`  ${field.customPrompt || t("custom_input")}`);
        if (!custom) {
          logError(t("model_empty"));
          return null;
        }
        answers[field.key] = custom;
      } else {
        answers[field.key] = field.choices[choiceIndex].value;
      }
      logSuccess(`${t("selected")} ${answers[field.key]}`);
      continue;
    }

    // Simple text field — show existing value as default
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

    if (field.required && !answers[field.key]) {
      logError(`${field.prompt} ${t("field_required")}`);
      return null;
    }
  }

  const config = provider.buildConfig(answers);
  logSuccess(t("config_done"));
  return config;
}

// ── Step 4: Install plugin ──────────────────────────────────────────────────
async function installPlugin(providerKey, providerConfig, characterId, proactiveSelfie) {
  logStep("5/6", t("step_install"));

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

  const pluginEntry = { enabled: true, config: {} };

  if (characterId !== null) pluginEntry.config.selectedCharacter = characterId;
  if (providerKey !== null) {
    pluginEntry.config.defaultProvider = providerKey;
    pluginEntry.config.providers = { [providerKey]: providerConfig };
  }
  if (proactiveSelfie !== null) pluginEntry.config.proactiveSelfie = proactiveSelfie;

  // Always write fallback/retry defaults if not already present
  if (!config?.plugins?.entries?.[PLUGIN_ID]?.config?.fallback) {
    pluginEntry.config.fallback = { enabled: false, order: [] };
  }
  if (!config?.plugins?.entries?.[PLUGIN_ID]?.config?.retry) {
    pluginEntry.config.retry = { maxAttempts: 2, backoffMs: 1000 };
  }

  const pluginConfig = { plugins: { entries: { [PLUGIN_ID]: pluginEntry } } };
  config = deepMerge(config, pluginConfig);
  writeJsonFile(OPENCLAW_CONFIG, config);
  logSuccess(`${t("config_written")} ${OPENCLAW_CONFIG}`);

  return pluginPath;
}

// ── Step 5: Summary ─────────────────────────────────────────────────────────
function printSummary(providerKey, pluginPath) {
  logStep("6/6", t("step_done"));

  const providers = getProviders();
  const providerLabel = providerKey ? (providers[providerKey]?.label || providerKey) : c("dim", t("skipped"));

  console.log(`
${c("green", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
${c("bright", `  ${t("summary_ready")}`)}
${c("green", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}

${c("cyan", t("summary_path"))}
  ${pluginPath}

${c("cyan", t("summary_provider"))}
  ${providerLabel}

${c("cyan", t("summary_config"))}
  ${OPENCLAW_CONFIG}

${c("cyan", t("summary_repo"))}
  https://github.com/BytePioneer-AI/clawmeta

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

    // Step 2: character selection
    const characterId = await chooseCharacter();

    // Step 3: proactive selfie
    const proactiveSelfie = await configureProactiveSelfie();

    // Step 4: provider selection
    const providerKey = await chooseProvider();

    // Step 5: provider config (skip if provider was skipped)
    let providerConfig = null;
    if (providerKey !== null) {
      providerConfig = await collectProviderConfig(providerKey);
      if (!providerConfig) {
        process.exit(1);
      }
    }

    // Step 6: install
    const pluginPath = await installPlugin(providerKey, providerConfig, characterId, proactiveSelfie);

    printSummary(providerKey, pluginPath);
  } catch (error) {
    logError(`${t("fail")} ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
