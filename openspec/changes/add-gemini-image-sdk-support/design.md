## Context

`clawmate-companion` 现有图片链路基于统一的 `ProviderAdapter.generate()` 接口工作，`generateSelfie()` 会把 prompt、参考图 data URL、角色元信息交给 provider，再由 provider 返回一个可持久化的图片引用。当前已接入的 provider 大多基于 HTTP 接口或 OpenAI-compatible 语义，尚未覆盖 Gemini 官方图片生成接口。

这个变更同时跨越三层：

- provider registry 与 provider adapter 实现
- OpenClaw plugin config schema
- `clawmate:setup` CLI 的交互式配置引导

此外，本次变更会引入新的外部依赖 `@google/genai`，因此需要在设计阶段先明确配置语义、SDK 适配边界和测试策略。

## Goals / Non-Goals

**Goals:**

- 为图片生成链路增加原生 `gemini` provider，使用 Google GenAI SDK 调用 Gemini 图片模型。
- 同一套 Gemini provider 配置同时支持两种模式：
  - 不写 `baseUrl` 时走 SDK 官方默认 Gemini API 地址
  - 写入 `baseUrl` 时走用户自定义地址
- 在 CLI 配置引导中加入 Gemini，并提供 4 个预设模型与自定义模型输入。
- 保持现有 provider、fallback、多 Agent 覆写和图片持久化链路不被破坏。
- 为 Gemini provider 与 CLI 引导补充可回归的自动化测试。

**Non-Goals:**

- 不在本次变更中引入 Vertex AI 的 `project/location/service account` 配置流。
- 不在 CLI 第一版中暴露 Gemini 全量高级图片参数，例如 `aspectRatio`、`imageSize`。
- 不把 Gemini 接入重写为 OpenAI-compatible 兼容层，也不替换现有 provider。
- 不改变当前 CLI “新建服务时 provider key 直接使用 provider type” 的整体模式。

## Decisions

### 1. 增加独立 `gemini` provider，而不是复用 `openai-compatible`

Gemini 官方图片生成使用 Google GenAI SDK 的 `generateContent` 语义，请求结构、图片输入方式和返回结构都与现有 OpenAI-compatible provider 不同。继续复用 `openai-compatible` 会让实现建立在网关兼容假设上，无法稳定支持官方默认地址与 SDK 特有能力。

因此本次设计采用独立实现：

- 在 `src/core/providers/registry.ts` 中新增 `gemini` 类型与 alias
- 新增 `src/core/providers/gemini.ts`
- 使用 `@google/genai` 创建客户端并调用 `models.generateContent`

备选方案：

- 方案 A：继续走 OpenAI-compatible + `/images/edits`
  - 放弃原因：只能覆盖兼容代理，不能覆盖官方 SDK 入口，也容易把 Gemini 模型名错误推断成 OpenAI-compatible。
- 方案 B：手写 REST `fetch`
  - 放弃原因：项目已经接受 SDK 依赖，直接使用官方 SDK 更利于后续跟进 Gemini 图片接口变化。

### 2. `baseUrl` 保持可选字段，缺省即官方默认地址

Gemini 配置沿用项目已有 provider 风格：

```json
{
  "type": "gemini",
  "apiKey": "YOUR_GEMINI_API_KEY",
  "model": "gemini-3.1-flash-image-preview",
  "baseUrl": "https://your-proxy.example.com"
}
```

字段语义：

- `apiKey`: 必填
- `model`: 必填，允许任意非空字符串
- `baseUrl`: 选填

运行时规则：

- `baseUrl` 缺失或为空字符串时，不向 SDK 传 `httpOptions.baseUrl`，直接使用官方默认地址
- `baseUrl` 有值时，去掉末尾 `/` 后传入 SDK 的 `httpOptions.baseUrl`

拒绝增加 `useOfficialEndpoint` 之类布尔字段。原因是 `baseUrl` 本身已经足够表达两种模式，额外布尔位只会让配置组合变复杂。

### 3. Gemini 请求映射直接复用现有 `GenerateRequest`

`generateSelfie()` 已经统一提供：

- `prompt`
- `referenceImageDataUrls`

Gemini provider 只负责把这些内容映射到 SDK 请求：

- 无参考图：只发送文本 part
- 有参考图：先发送一个或多个图片 `inlineData` part，再发送文本 part
- 输出模态固定请求图片，避免走成纯文本回复

这样可以维持现有 pipeline 和 tool 语义不变，不需要为 Gemini 单独引入新的上游请求对象。

备选方案是让 pipeline 专门区分“文生图”和“图编辑”两条调用路径，但这会把 provider 差异扩散到核心链路，收益不够。

### 4. Gemini 响应统一转成 data URL

现有插件后处理已经支持以下图片引用：

- 远程 URL
- `data:image/...;base64,...`
- 原始 base64

Gemini SDK 的典型图片返回是内联二进制图片 part。为保持 provider 契约简单，本次设计要求 Gemini provider：

- 优先提取第一张图片 part
- 根据返回 mime type 组装为 `data:<mime>;base64,<data>`
- 把 data URL 放到 `ProviderGenerateResult.imageUrl`

如果响应里没有图片 part，则抛出 `ProviderError`，并尽量把文本 part 或候选响应摘要带入错误 details，便于诊断模型/配额/安全策略问题。

不在 provider 内部直接落盘图片。图片持久化仍由现有插件逻辑统一负责。

### 5. CLI 为 Gemini 增加“模型选择 + 地址模式选择”双阶段引导

CLI 里的 `getProviders()` 继续作为 provider 配置元数据中心。Gemini 项在交互上新增两类选择：

- 模型选择
  - `gemini-3-pro-image-preview`
  - `gemini-3.1-flash-image-preview`
  - `gemini-2.5-flash-image`
  - `gemini-2.5-flash-image-preview`
  - 自定义模型
- 地址模式选择
  - 官方默认 API 地址
  - 自定义 BaseURL

落盘策略：

- 选官方默认地址：写入 `{ type: "gemini", apiKey, model }`
- 选自定义 BaseURL：写入 `{ type: "gemini", apiKey, model, baseUrl }`

不在 CLI 中预填一个官方 Gemini URL 字符串。这样可以避免用户误以为这个 URL 需要手工维护，也避免将 SDK 默认行为复制成静态常量。

### 6. Provider 类型推断保持保守，Gemini 主要依赖显式 `type`

当前 registry 支持根据 provider 名称、endpoint 和 baseUrl 做自动推断。Gemini 模型名可能也会出现在 OpenAI-compatible 代理里，因此不能仅凭 `model` 以 `gemini-` 开头就推断为 Gemini SDK provider。

设计上采用：

- CLI 生成的 Gemini 配置始终写 `type: "gemini"`
- registry 增加 `gemini` alias
- 自动推断最多只在显式 Google Gemini 官方 baseUrl 明确出现时作为辅助，不依赖模型名前缀做主判断

### 7. 测试使用可注入客户端工厂，避免真实网络依赖

Gemini provider 单测需要验证请求映射和响应解析，但不能依赖真实 Google API。因此 provider 实现应预留最小注入面，例如：

- 内部 `createGeminiClient()` 工厂
- 或在 `createGeminiProvider()` 中接收可选 client factory

测试覆盖重点：

- 默认地址模式不传 `baseUrl`
- 自定义 BaseURL 被正确透传
- 参考图被转成图片 part
- 响应图片 part 被转成 data URL
- 无图片响应时抛出结构化错误

CLI 测试则覆盖：

- Gemini provider 可见
- 4 个预设模型可见
- 自定义模型输入可写入配置
- 官方默认地址模式不写 `baseUrl`
- 自定义地址模式会写 `baseUrl`

## Risks / Trade-offs

- [SDK 依赖增加体积与安装复杂度] → 只在 provider 层引入 `@google/genai`，不扩散到 CLI 逻辑，并通过现有 `npm install` 流程验证安装结果。
- [代理 BaseURL 不完全兼容官方 SDK 预期] → 文档中明确“自定义 BaseURL 需要兼容 Google GenAI SDK 请求路径与鉴权方式”，同时保留官方默认地址作为推荐路径。
- [Preview 模型响应结构可能继续变化] → 响应解析采用“优先读图片 part，读不到则收集文本诊断并失败”的保守策略，降低 silent success 风险。
- [用户误把 Gemini 模型名配置到 OpenAI-compatible provider] → 通过 CLI 提供独立 Gemini 入口，并在 README 示例里区分“Gemini 原生 SDK”与“OpenAI-compatible 代理”两种配置方式。

## Migration Plan

这是增量能力，不需要迁移已有配置。

上线步骤：

1. 增加 `@google/genai` 依赖与 Gemini provider 实现。
2. 扩展 registry、schema、README 和示例配置。
3. 扩展 CLI 配置引导与测试。
4. 用户如需启用 Gemini，只需新增 `providers.gemini` 并把 `defaultProvider` 或 agent override 指向 `gemini`。

回滚策略：

- 移除或停用 `providers.gemini`
- 把 `defaultProvider` 切回原有 provider
- 其余 provider 与配置结构不受影响

## Open Questions

- 是否要在后续变更中把 `aspectRatio`、`imageSize` 这类 Gemini 图片参数开放进 provider config，而不是先保持最小可用接入？
- 是否需要为 Gemini provider 额外支持自定义 headers/timeout，以适配某些企业代理环境？
