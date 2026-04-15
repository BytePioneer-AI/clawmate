# ClawMate 依赖的宿主能力清单（用于移植到其它 Agent）

本文档列出 ClawMate 对宿主 Agent/运行时的**能力要求**，便于未来接入其它
agent 框架时快速对照与实现。范围：`packages/clawmate-companion/` 的宿主绑定层。

注意：

- 本文档描述的是**语义能力**，不要求宿主必须字面提供 OpenClaw 同名 API。
- `SOUL.md`、`prependContext`、`sendVoiceMessage` 等都可以由其它宿主的等价机制实现。
- 跨平台实现设计见 [multi-platform-agent-design.md](./multi-platform-agent-design.md)。

事实来源：`packages/clawmate-companion/src/plugin.ts` 与 `openclaw.plugin.json`。

---

## 1) 生命周期 Hook

宿主需要提供等价的生命周期回调（或事件），以便初始化与清理。

- `before_agent_start`（或“会话开始/首轮前”）：
  - 读取插件配置与 `agentId` 覆写。
  - 加载角色资源并**注入 SOUL.md**（见第 3 节）。
  - 返回 `prependContext` 用于轻量提示词注入（例如 TTS/自拍时机）。
  - 参考：`packages/clawmate-companion/src/plugin.ts:1001`。
- `session_end`（或“会话结束”）：
  - 清理会话级工具状态（prepare -> generate 顺序状态）。
  - 参考：`packages/clawmate-companion/src/plugin.ts:1051`。
- `before_reset`（或“会话重置”）：
  - 清理会话级工具状态。
  - 参考：`packages/clawmate-companion/src/plugin.ts:1055`。

若宿主的 hook 名称不同，映射到等价事件即可（例如 `on_session_start` /
`on_session_end` / `on_session_reset`）。

---

## 2) 运行时上下文字段

ClawMate 在 hook 与 tool ctx 中使用以下字段：

- `agentId`：
  - 用于按 agent 选择配置覆盖。
  - 参考：`packages/clawmate-companion/src/plugin.ts:693`。
- `sessionId`：
  - 用于会话级工具状态隔离（prepare -> generate）。
  - 参考：`packages/clawmate-companion/src/plugin.ts:832`。
- `workspaceDir`：
  - 用于定位 `SOUL.md` 写入路径。
  - 参考：`packages/clawmate-companion/src/plugin.ts:285`。
- `messageChannel`、`agentAccountId`、`requesterSenderId`、`senderIsOwner`：
  - 用于可选的语音直接发送能力。
  - 参考：`packages/clawmate-companion/src/plugin.ts:948`。

如果宿主没有完全对应字段，提供等价值即可；可选字段缺失会自动降级。

---

## 3) 人格注入（SOUL.md 或等价载体）

ClawMate 需要将角色 persona 注入宿主的系统上下文。OpenClaw 当前通过写入
`SOUL.md` 实现；其它宿主也可以通过等价载体实现，例如 `AGENTS.md`、
系统 prompt 预注入、`pre_llm_call` 拼接上下文等。

要求：
- 能把 persona 注入到当前 agent 的稳定上下文中；若宿主采用文件方案，优先支持
  `workspaceDir/SOUL.md`，或提供可配置的 fallback 路径。
- 注入应幂等：已注入则跳过。
- 禁用/切换时只清理 ClawMate 标记块，不影响其它内容。

参考实现：
- 注入：`packages/clawmate-companion/src/plugin.ts:319`
- 清理：`packages/clawmate-companion/src/plugin.ts:373`

---

## 4) 工具注册与执行

宿主需支持：
- 以 name/description/JSON schema 注册工具（异步 handler）。
- 支持“动态工具列表”：ClawMate 会在 agent 未启用时返回空工具集。
- 执行时提供 tool ctx（至少含 `agentId`、`sessionId`）。

工具列表：
- `clawmate_prepare_selfie`
- `clawmate_generate_selfie`
- `clawmate_generate_tts`
- `clawmate_prepare_character`
- `clawmate_create_character`

参考：
- 注册入口：`packages/clawmate-companion/src/plugin.ts:1059`
- 工具定义：`packages/clawmate-companion/src/plugin.ts:1070` 之后

---

## 5) 工具顺序状态（Prepare -> Generate）

ClawMate 强制两组工具的调用顺序：

- `clawmate_prepare_selfie` -> `clawmate_generate_selfie`
- `clawmate_prepare_character` -> `clawmate_create_character`

宿主应支持：
- **按 agent + session 隔离的状态存储**。
- 在 `session_end` / `reset` 时清理状态。

参考：
- 会话状态 key：`packages/clawmate-companion/src/plugin.ts:832`
- 清理入口：`packages/clawmate-companion/src/plugin.ts:1051`

---

## 6) 媒体输出与发送

工具返回 **本地文件路径**（图片 / 音频）。
宿主需要支持把本地文件作为附件发送，或至少能把路径回显给用户。

必需：
- 本地文件落盘能力（图片/音频）。
- 能输出或发送本地文件路径。

可选增强：
- 直接语音发送能力：
  - `sendVoiceMessage` 或 `sendAudioMessage`。
  - 若不支持则自动降级，返回 `audioPath` 交由宿主处理。
  - 参考：`packages/clawmate-companion/src/plugin.ts:941`。

默认落盘路径：
- 图片：`~/.openclaw/media/clawmate-generated/YYYY-MM-DD/`
- 音频：`~/.openclaw/media/clawmate-voice/YYYY-MM-DD/`
  参考：`packages/clawmate-companion/src/plugin.ts:273` 与 `:279`

若宿主不是 OpenClaw，可通过环境变量或配置重定向基础目录。

---

## 7) 插件配置输入

ClawMate 期望宿主提供结构化配置（全局 + agent 覆写）：

- 全局：
  - `selectedCharacter`、`characterRoot`、`userCharacterRoot`
  - provider 配置（`defaultProvider`、`fallback`、`retry`）
  - 自拍配置（`proactiveSelfie`、轮询/超时等）
  - TTS 配置（`tts`）
- agent 级覆写：
  - `agents.<agentId>`，包含 `enabled` 和任何覆盖字段

参考：
- schema：`packages/clawmate-companion/openclaw.plugin.json`
- 合并逻辑：`packages/clawmate-companion/src/plugin.ts:659`

宿主需在运行时向插件提供此配置（OpenClaw 为 `pluginConfig`）。

---

## 8) Skills 载入（可选）

ClawMate 内含技能目录 `skills/clawmate-companion/`。

如果宿主支持技能系统：
- 应加载此目录下的 skill 定义；
- 让模型可在对话中触发这些 skill。

参考：`packages/clawmate-companion/openclaw.plugin.json:6`

---

## 9) 依赖与网络访问

ClawMate 依赖外部服务：
- 图像生成：providers 适配层
  `packages/clawmate-companion/src/core/providers/registry.ts`
- TTS：阿里云 DashScope
  `packages/clawmate-companion/src/core/tts.ts`

宿主需提供：
- 出网 HTTP 能力。
- 可选：`ffmpeg` 以进行音频转码（缺失时可降级）。

---

## 10) 最小可用能力清单

若宿主具备以下能力即可完成移植：

1. 会话生命周期 hook（start/end/reset）并提供 runtime ctx。
2. 工具注册（JSON schema + async handler）。
3. 会话级工具状态隔离。
4. 文件系统读写（persona + 媒体）。
5. 本地文件媒体发送或路径回显。
6. 插件配置注入（含 per-agent 覆写）。

其余均可降级或通过宿主特性补齐。
