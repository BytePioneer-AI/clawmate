# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawMate is an OpenClaw visual companion plugin that generates personalized character selfies based on context, emotion, and time states. It uses a single-plugin architecture with embedded Skills and character assets.

## Development Commands

### Setup and Installation
```bash
# One-click install (interactive, no clone needed)
npx github:BytePioneer-AI/clawmeta

# Local install (after clone)
npm install
npm run clawmate:setup
```

### Testing and Development
```bash
# Check manifest ID consistency
npm run clawmate:plugin:check

# Probe OpenAI-compatible endpoints
npm run clawmate:probe:openai
```

## Architecture

### Single Plugin Package Design

The entire plugin is contained in `packages/clawmate-companion/` as a single installable unit:

- **Entry point**: `index.ts` → `src/plugin.ts` (exports `registerClawMateCompanion`)
- **Plugin manifest**: `openclaw.plugin.json` (defines id, configSchema, skills)
- **Package manifest**: `package.json` with `openclaw.extensions` field
- **Embedded Skill**: `skills/clawmate-companion/` (not a separate package)

### Core Module Responsibilities

Located in `src/core/`:

- **pipeline.ts**: Orchestrates the entire selfie generation flow (character loading → prompt building → provider routing → retry/fallback)
- **router.ts**: Selects provider based on explicit request or defaultProvider config; handles fallback chain
- **providers/**: Unified adapter pattern for multiple image generation services
  - `registry.ts`: Provider factory and registration
  - `volcengine-ark.ts`: Volcengine ARK API
  - `dashscope-aliyun.ts`: Alibaba Cloud Bailian (DashScope)
  - `fal.ts`: fal.ai provider
  - `openai-compatible.ts`: OpenAI `/images/edits` endpoint
  - `http-async.ts`: Generic async submit/poll pattern
  - `mock.ts`: Testing provider
- **prepare.ts**: Builds reference package for Tool 1 (character info, time state, style rules, prompt templates)
- **characters.ts**: Loads character assets (meta.json, character-prompt.md, reference images) from filesystem
- **time-state.ts**: Resolves current time window (morning/work/evening/night) and returns scene/outfit/lighting recommendations
- **config.ts**: Normalizes and validates plugin configuration

### Selfie Generation Flow (Two-Step Tool Chain)

生图采用两步 Tool 链设计，利用 OpenClaw Agent Loop 让模型分两次推理完成意图理解和提示词生成：

```
用户消息 → Agent 推理(提取关键词) → Tool 1: prepare → 返回参考包
         → Agent 推理(生成提示词) → Tool 2: generate → 生图 → 返回结果
```

**设计原因**：单 Tool 方案要求模型同时做意图理解和提示词工程，导致提示词质量不稳定。拆成两步后，Tool 1 返回角色信息/时间状态/风格模板/参考样例，模型在第二次推理时专注于提示词生成，质量显著提升。

**关键约束**：OpenClaw 插件 API 没有 LLM 调用能力，插件不能自己调模型。两步方案完全借用 OpenClaw Agent 自身的模型，不需要额外模型配置。

详细设计文档：`doc/design-two-step-prompt.md`

### Plugin Lifecycle

1. **Registration** (`src/plugin.ts`):
   - Synchronously registers `before_agent_start` hook and two tools (`clawmate_prepare_selfie`, `clawmate_generate_selfie`)
   - No async initialization during registration phase

2. **before_agent_start Hook**:
   - **Phase 1 (one-time)**: Injects static character persona into `~/.openclaw/workspace/SOUL.md` (skips if already present)
   - **Phase 2 (per-session)**: Dynamically injects current time state context into session via `prependContext`
   - Time state includes: current time window, recommended scenes, outfit, lighting, and usage guidelines

3. **Tool 1: `clawmate_prepare_selfie`** (意图提取 → 返回参考包):
   - Required: `mode` (enum: "mirror" | "direct")
   - Optional: `scene`, `action`, `emotion`, `details`
   - Returns: 角色外貌、时间状态、拍摄模式指南、风格规则、提示词模板和参考样例
   - 纯代码执行（读本地文件），无外部调用

4. **Tool 2: `clawmate_generate_selfie`** (提示词 → 生图):
   - Required: `prompt` (模型生成的完整英文提示词), `mode`
   - 直接使用传入的 prompt 调用 provider 生图，不再内部构建提示词
   - Returns structured JSON with `imageUrl` (local file path), `imageMarkdown`, `mediaLine`, provider info

### Provider Routing Strategy

**No fixed primary/backup order** - routing is configuration-driven:

1. If tool call specifies provider explicitly → use that provider
2. Otherwise → use `defaultProvider` from config
3. If `fallback.enabled: true` → try providers in `fallback.order` on failure
4. All failures → return degraded response with `degradeMessage`

### Image Handling

**Critical constraint**: Reference images are local files only, never public URLs.

- Character reference images stored in `skills/clawmate-companion/assets/characters/{characterId}/`
- Generated images persisted to `~/.openclaw/media/clawmate-generated/{YYYY-MM-DD}/`
- All image formats supported: file paths, file:// URLs, data URLs, raw base64, HTTP URLs (downloaded)
- Provider responses (URL/data URL/base64) are always persisted locally before returning to OpenClaw

### Time State System

Character behavior adapts to time of day:

- **Time windows**: morning (6-9), work (9-18), evening (18-22), night (22-6)
- Each window defines: scene options, outfit, lighting
- Defined in character's `meta.json` under `timeStates`
- LLM receives time state context and selects appropriate scene unless user specifies one explicitly

## Key Constraints

1. **SOUL.md injection is one-time**: Plugin checks for marker comments before injecting, never overwrites
2. **Two-step tool chain**: Tool 1 (prepare) 返回参考包，Tool 2 (generate) 接收模型生成的完整提示词生图。SKILL.md 指导模型严格按两步调用，禁止跳过 Tool 1
3. **Plugin cannot call LLM**: OpenClaw 插件 API 没有模型调用能力，两步方案借用 Agent 自身模型，不需要插件配置 API key
4. **Async/non-blocking**: Image generation doesn't block conversation flow (configurable)
5. **Local-first images**: No dependency on public URLs; all images use local filesystem
6. **Provider-agnostic**: Model/LLM doesn't know about provider details; routing handled by plugin config

## Configuration

Default config location: `packages/clawmate-companion/config/clawmate.config.json`

Runtime config merged from:
1. Plugin defaults (in `src/plugin.ts` `resolveRuntimeConfig`)
2. User config at `plugins.entries.clawmate-companion.config` in OpenClaw config

Key config fields:
- `selectedCharacter`: Character ID (default: "gentle-neighbor")
- `characterRoot`: Path to characters directory
- `defaultProvider`: Provider to use when not explicitly specified
- `providers`: Object mapping provider names to their configs
- `fallback.enabled` / `fallback.order`: Fallback chain configuration
- `retry.maxAttempts` / `retry.backoffMs`: Retry behavior
- `degradeMessage`: Text returned when all providers fail

## Testing

Run `npm run clawmate:plugin:check` to verify manifest consistency.

## Module System

- **Root**: CommonJS (`package.json` has `"type": "commonjs"`)
- **Plugin package**: ESM (`packages/clawmate-companion/package.json` has `"type": "module"`)
- **Installer CLI**: `bin/cli.cjs` uses `.cjs` extension to run as CommonJS despite plugin package being ESM
- TypeScript compiled with target ES2022, moduleResolution Node
- Use `tsx` for running TypeScript files directly: `node --import tsx script.ts`

## Important Paths

- Plugin root: `packages/clawmate-companion/`
- Installer CLI: `packages/clawmate-companion/bin/cli.cjs`
- Core logic: `packages/clawmate-companion/src/core/`
- Character assets: `packages/clawmate-companion/skills/clawmate-companion/assets/characters/`
- Scripts: `packages/clawmate-companion/skills/clawmate-companion/scripts/`
- OpenClaw home: `~/.openclaw/` (or `$OPENCLAW_HOME`)
- Plugin install target (npx): `~/.openclaw/plugins/clawmate-companion/`
- Generated images: `~/.openclaw/media/clawmate-generated/{date}/`
- SOUL.md: `~/.openclaw/workspace/SOUL.md`
