# ClawMate 多 Agent 平台适配设计

本文档设计一个“**只要宿主满足 [agent-capabilities.md](./agent-capabilities.md) 中定义的能力，就能接入
ClawMate**”的实现方案。目标不是继续把 ClawMate 做成某一个平台的插件，而是把它拆成：

- 一套宿主无关的 ClawMate 运行时
- 多个宿主适配器（OpenClaw / Hermes / 未来其它 Agent 平台）

---

## 1. 设计结论

当前 `packages/clawmate-companion/src/plugin.ts` 实际上混合了 5 类职责：

1. 宿主平台绑定（OpenClaw hook / tool API）
2. 运行时配置解析（全局 + agent 覆写）
3. 人格注入（`SOUL.md`）
4. 工具流程控制（prepare -> generate）
5. 媒体落盘与发送

而真正与“生成自拍 / 生成语音 / 创建角色”相关的核心逻辑，已经大量沉淀在
`src/core/` 下，例如：

- `src/core/pipeline.ts`
- `src/core/prepare.ts`
- `src/core/tts.ts`
- `src/core/character-creator.ts`
- `src/core/characters.ts`

所以正确方向不是继续在 `plugin.ts` 上叠分支，而是把 OpenClaw 绑定层再往外拆一层，
形成“**Core Runtime + Host Adapter**”结构。

---

## 2. 总体架构

推荐落地为 4 层：

### 2.1 ClawMate Core

纯业务层，负责：

- 角色资源加载
- 自拍准备与生成
- TTS 生成
- 角色创建
- 配置归一化
- token 签发与校验

这一层不直接感知 OpenClaw、Hermes、Discord、Telegram 等平台。

### 2.2 ClawMate Runtime

宿主无关的编排层，负责：

- 根据运行时 scope 解析最终配置
- 决定如何注入 persona
- 决定工具如何暴露
- 统一组织媒体产物
- 统一处理 prepare / create 这类工作流约束

它向外只暴露“标准化生命周期”和“标准化工具定义”。

### 2.3 Host Adapter

每个宿主平台只实现一层很薄的适配器，负责：

- 把宿主 hook 映射到 Runtime 生命周期
- 把 Runtime 工具定义映射成宿主工具
- 把宿主上下文转换成标准 `RuntimeScope`
- 把 Runtime 产出的媒体结果转换成宿主可发送的附件 / media tag / 路径

### 2.4 Distribution Layer

不同宿主通常有不同安装方式，因此分发层要独立：

- OpenClaw：`openclaw.plugin.json` + Node 插件包
- Hermes：Python 插件 + 调用 `clawmate` 运行时
- 未来平台：按各自插件机制包装

这层只负责“安装与注册”，不承载业务逻辑。

---

## 3. 关键设计原则

### 3.1 宿主只提供能力，不承担业务

宿主适配器不应该自己实现：

- 角色选择逻辑
- provider 路由
- 媒体持久化规则
- 自拍 / 角色创建的流程约束

这些都应该统一回到 ClawMate Runtime 中，否则不同平台会越接越散。

### 3.2 把 `SOUL.md` 从“文件名”提升为“人格载体能力”

`SOUL.md` 是 OpenClaw 的落地形式，不应成为 ClawMate 的硬编码前提。

在多平台设计里，真正需要的是：

- 宿主能在会话开始前，把一段稳定 persona 注入给模型
- 这段注入是幂等、可替换、可清理的

因此应抽象成 `PersonaCarrier`：

- `workspace-soul`：写入 `workspaceDir/SOUL.md`
- `home-soul`：写入宿主 home 下固定人格文件
- `prompt-prepend`：通过 hook 在 LLM 调用前拼接系统上下文
- `host-native`：宿主原生支持 per-agent system prompt

### 3.3 工具工作流不要依赖宿主特有的内存语义

当前 OpenClaw 版本使用：

- `prepareCalled` 闭包变量
- `Map<agentId:sessionId, state>`

这在 OpenClaw 可用，但对其它宿主不一定稳定，尤其是：

- Python 插件
- 多进程 worker
- 无 run 级闭包语义的平台

因此新的跨平台版本应该把工作流门票显式化。

### 3.4 配置要区分“ClawMate Profile”和“宿主绑定”

当前 `agents.<agentId>` 只适合单一宿主。支持多平台后，推荐把配置拆成：

- `profiles`：ClawMate 自身的人设 / provider / TTS / 自拍策略
- `bindings`：某个平台上的某个 agent 绑定到哪个 profile

这样才能避免把 OpenClaw 的 `agentId` 直接写死成全局主键。

---

## 4. 标准运行时模型

Runtime 对外统一使用如下概念：

```ts
type PersonaStrategy = "workspace-soul" | "home-soul" | "prompt-prepend" | "host-native";
type MediaDeliveryMode = "native-send" | "media-tag" | "path-only";

interface RuntimeScope {
  platform: string;          // openclaw / hermes / ...
  hostInstanceId: string;    // 同一平台的不同实例，可选
  agentId: string;
  sessionId?: string;
  runId?: string;
  workspaceDir?: string;
  channelId?: string;
  requesterId?: string;
  senderIsOwner?: boolean;
}

interface HostCapabilities {
  lifecycle: {
    beforeAgentStart: boolean;
    sessionEnd: boolean;
    beforeReset: boolean;
    preLlmCall?: boolean;
  };
  tools: {
    jsonSchema: boolean;
    dynamicRegistration: boolean;
  };
  persona: {
    strategy: PersonaStrategy;
  };
  media: {
    mode: MediaDeliveryMode;
    directVoiceSend?: boolean;
  };
  storage: {
    readWriteFile: boolean;
  };
}

interface ContextContribution {
  prependContext?: string;
  personaText?: string;
}

interface MediaArtifact {
  kind: "image" | "audio";
  path: string;
  mimeType: string;
  asVoice?: boolean;
}
```

宿主适配器只负责把自己的原生上下文映射成 `RuntimeScope`。

---

## 5. 新的配置模型

推荐引入统一的 ClawMate Home，例如：

```text
~/.clawmate/
  config.json
  characters/
  media/
  cache/
  secrets/
```

配置结构从“单一平台 pluginConfig”升级为：

```json
{
  "defaults": {
    "defaultProvider": "volcengine",
    "selectedCharacter": "brooke",
    "proactiveSelfie": { "enabled": false, "probability": 0.1 }
  },
  "profiles": {
    "brooke-cn": {
      "selectedCharacter": "brooke",
      "defaultProvider": "volcengine"
    },
    "brooke-anime": {
      "selectedCharacter": "brooke-anime",
      "defaultProvider": "aliyun"
    }
  },
  "bindings": [
    {
      "platform": "openclaw",
      "agentId": "ding-main",
      "profile": "brooke-cn",
      "enabled": true
    },
    {
      "platform": "hermes",
      "agentId": "wechat-brooke",
      "profile": "brooke-anime",
      "enabled": true
    }
  ]
}
```

### 配置解析顺序

运行时最终配置建议按以下顺序合并：

1. ClawMate 内置默认值
2. `defaults`
3. `profiles[profileName]`
4. 当前 binding 的局部覆写
5. 宿主适配器传入的临时 override

### 为什么不继续只用 `agents.<agentId>`

因为多平台以后，至少会遇到这些问题：

- OpenClaw 和 Hermes 可能都存在 `agentId = main`
- 同一个角色策略可能要复用到多个平台
- 同一个平台可能有多个实例

所以 `profile` 和 `binding` 必须拆开。

---

## 6. 工具协议设计

工具名可以保持兼容，但参数协议需要升级。

### 6.1 自拍流程

当前：

- `clawmate_prepare_selfie`
- `clawmate_generate_selfie`

推荐升级为：

- `clawmate_prepare_selfie` 返回 `prepareToken`
- `clawmate_generate_selfie` 必须接收 `prepareToken`

返回示例：

```json
{
  "ok": true,
  "prepareToken": "cm_prep_xxx",
  "mode": "mirror",
  "promptGuide": "...",
  "timeState": "evening"
}
```

调用示例：

```json
{
  "prepareToken": "cm_prep_xxx",
  "prompt": "full english prompt...",
  "mode": "mirror"
}
```

### 6.2 角色创建流程

同理：

- `clawmate_prepare_character` 返回 `draftToken`
- `clawmate_create_character` 必须接收 `draftToken`

这让“已经 prepare 过”不再依赖宿主进程内的布尔变量。

### 6.3 token 设计

token 建议由 Runtime 统一签发，内容至少包含：

- `purpose`: `selfie_prepare` / `character_prepare`
- `platform`
- `agentId`
- `sessionId`
- `issuedAt`
- `expiresAt`
- `nonce`

使用 HMAC 签名即可，不需要引入复杂外部状态。

### 6.4 为什么这一步非常重要

这是多平台支持里最关键的改造之一，因为它把“工作流约束”从宿主内存语义中解耦了。

这样即使宿主：

- 没有 run 级闭包
- 会重启 worker
- 是 Python / Go / Rust 插件

也仍然能稳定运行同一套工具协议。

---

## 7. Persona 注入设计

Runtime 不直接写死 `SOUL.md`，而是输出一份标准 persona 载荷：

```ts
interface PersonaPayload {
  characterId: string;
  text: string;
  beginMarker: string;
  endMarker: string;
}
```

再由适配器根据宿主能力选择策略：

### 7.1 `workspace-soul`

适用于 OpenClaw 这类有 per-agent workspace 的宿主：

- 路径：`<workspaceDir>/SOUL.md`
- 维持当前 begin/end marker 替换逻辑

### 7.2 `home-soul`

适用于只有单一 home 的宿主：

- 路径由宿主配置决定
- 适合单 agent 或 profile 级宿主

### 7.3 `prompt-prepend`

适用于 Hermes 这类更适合在 `pre_llm_call` 注入上下文的宿主：

- 不要求写文件
- 每次 LLM 调用前把 persona 片段注入系统上下文
- 仍然保留 marker，便于替换和调试

### 7.4 `host-native`

如果未来某个宿主支持原生 per-agent system prompt 更新，可直接落这个策略。

---

## 8. 媒体输出设计

Core Runtime 统一只输出 `MediaArtifact[]`，不直接决定“怎么发”。

```ts
interface ToolExecutionResult {
  textPayload: string;
  media?: MediaArtifact[];
}
```

宿主根据能力选择：

### 8.1 `native-send`

例如 OpenClaw：

- 可直接 `sendVoiceMessage`
- 或 `sendAudioMessage`
- 图片可直接作为宿主附件

### 8.2 `media-tag`

例如 Hermes：

- 工具返回 `MEDIA:` 标签
- gateway 自动提取附件发送

### 8.3 `path-only`

最低保底策略：

- 工具只返回本地路径
- 宿主自己决定是否发送

### 媒体落盘目录

建议从 `~/.openclaw/media/...` 迁移为统一的：

```text
~/.clawmate/media/images/YYYY-MM-DD/
~/.clawmate/media/audio/YYYY-MM-DD/
```

这样可以脱离具体宿主。

---

## 9. 跨语言宿主的实现方式

这是设计里必须提前处理的问题。

当前 ClawMate 核心是 TypeScript / Node，而 Hermes 插件生态是 Python。为了支持
不同语言宿主，建议 Runtime 提供两种运行模式：

### 9.1 Embedded Mode

适合 Node 宿主，例如 OpenClaw。

- 适配器直接 import Runtime
- 无额外进程
- 延迟最低

### 9.2 Bridge Mode

适合 Python / Go / Rust 宿主，例如 Hermes。

- 宿主插件通过 `clawmate` CLI 或本地 daemon 调用 Runtime
- 通信方式建议使用 `stdio JSON-RPC`
- 宿主只需要做一层轻量 client

推荐提供如下协议方法：

- `session/start`
- `session/end`
- `session/reset`
- `tool/list`
- `tool/call`
- `persona/render`

这样 Hermes 插件无需重写任何自拍 / TTS / 角色创建逻辑，只需转发。

---

## 10. 推荐目录结构

如果继续使用 monorepo，推荐演进到：

```text
packages/
  clawmate-core/
    src/core/
    src/runtime/
    src/protocol/
  clawmate-openclaw/
    src/index.ts
    openclaw.plugin.json
  clawmate-hermes/
    plugin/
      plugin.yaml
      __init__.py
```

### 职责边界

- `clawmate-core`
  - 所有业务逻辑
  - 运行时编排
  - 配置、token、媒体、persona 抽象
- `clawmate-openclaw`
  - OpenClaw hook 和 tool 绑定
- `clawmate-hermes`
  - Hermes plugin 注册
  - `pre_llm_call` / `on_session_*` 映射
  - 调用 `clawmate-core` 的 bridge client

---

## 11. OpenClaw 与 Hermes 的具体映射

### 11.1 OpenClaw Adapter

映射关系基本可以直接复用当前实现：

- `before_agent_start` -> `session/start`
- `session_end` -> `session/end`
- `before_reset` -> `session/reset`
- `registerTool(factory)` -> `tool/list + tool/call`
- `workspaceDir` -> `PersonaCarrier(workspace-soul)`
- `sendVoiceMessage` / `sendAudioMessage` -> `native-send`

它可以作为第一批适配器，也是回归兼容基线。

### 11.2 Hermes Adapter

Hermes 更适合以下映射：

- `on_session_start` -> `session/start`
- `on_session_end` -> `session/end`
- `on_session_reset` -> `session/reset`
- `pre_llm_call` -> `prompt-prepend persona`
- `register_tool` -> `tool/list + tool/call`
- `MEDIA:` tag -> `media-tag`

Hermes 不一定有 per-agent workspace，因此 persona 不应强依赖 `SOUL.md`，而应默认使用
`prompt-prepend`。

---

## 12. 兼容性策略

### 12.1 对现有 OpenClaw 用户

第一阶段保持以下兼容：

- 工具名不变
- 原有配置继续可读
- `agents.<agentId>` 仍支持
- `SOUL.md` 注入行为保持不变

### 12.2 新能力逐步引入

建议按“兼容新增”方式推进：

1. `prepareToken` / `draftToken` 先作为新字段加入返回值
2. `generate_*` / `create_*` 先把 token 设为可选
3. OpenClaw 适配器保留旧行为
4. Hermes 等新宿主直接走 token 模式
5. 等多平台稳定后，再考虑把 token 升为必填

这样迁移不会一次性打断现有用户。

---

## 13. 实施顺序

建议分 6 步落地：

### 第 1 步：把 Runtime 从 `src/plugin.ts` 中抽离

抽出：

- `ConfigResolver`
- `PersonaManager`
- `MediaStore`
- `FlowTokenService`
- `ClawMateRuntime`

### 第 2 步：把 OpenClaw 变成第一个适配器

让当前 `plugin.ts` 只保留：

- 上下文映射
- hook 注册
- tool 注册
- voice send 调用

### 第 3 步：引入 token 化工作流

优先改造：

- `prepare_selfie` / `generate_selfie`
- `prepare_character` / `create_character`

### 第 4 步：引入统一 ClawMate Home

把共享配置、媒体、缓存从 `~/.openclaw` 解耦到 `~/.clawmate`。

### 第 5 步：实现 Bridge Mode

增加：

- `clawmate rpc`
- `clawmate daemon`

至少先有一个稳定的 `stdio JSON-RPC` 入口。

### 第 6 步：实现 Hermes Adapter

Hermes 插件只做：

- tool 暴露
- hook 转发
- `pre_llm_call` 注入 persona
- `MEDIA:` 标签包装

---

## 14. 这个设计为什么能满足 `agent-capabilities.md`

因为它把 `agent-capabilities.md` 里列出的能力全部上升成了宿主无关的语义接口：

1. 生命周期 hook -> Runtime 生命周期
2. 运行时上下文 -> `RuntimeScope`
3. SOUL/persona -> `PersonaCarrier`
4. 工具注册 -> 标准工具定义
5. 工具顺序状态 -> token 化工作流
6. 媒体输出 -> `MediaArtifact`
7. 配置注入 -> `defaults + profiles + bindings`
8. Skills -> 可选宿主增强
9. 网络访问 -> Core 统一处理

也就是说，未来接入一个新平台时，我们只需要问一件事：

**这个宿主能不能实现这些语义能力？**

如果能，就写一个适配器；不需要再复制一份 ClawMate 业务逻辑。

---

## 15. 最终建议

如果目标是“长期支持多个 agent 平台”，我建议把 ClawMate 定位成：

**一个独立的角色化媒体能力引擎，而不是 OpenClaw 专用插件。**

最重要的两步不是先写 Hermes 插件，而是先做：

1. Runtime / Adapter 分层
2. token 化工作流协议

这两步一旦完成，OpenClaw、Hermes、甚至未来其它宿主都会顺很多。
