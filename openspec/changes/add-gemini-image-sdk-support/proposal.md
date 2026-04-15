## Why

当前 `clawmate-companion` 的图片 provider 主要围绕 OpenAI-compatible、阿里云、火山、ModelScope 和 fal 设计，还没有原生支持 Gemini 官方图片生成接口。想接入 Gemini 的用户只能依赖兼容网关，无法稳定使用 Google 官方 SDK 的图片请求语义、官方模型列表以及图像编辑输入格式。

同时，现有 `clawmate:setup` CLI 配置引导里没有 Gemini 选项，用户即使手工补配置，也缺少对默认官方 API 地址与自定义 BaseURL 的明确引导。这使 Gemini 接入成本高，也容易写出与未来实现不一致的配置。

## What Changes

- 新增原生 `gemini` 图片 provider，使用 Google GenAI SDK 发起 Gemini 图片生成与图片编辑请求，而不是复用 OpenAI-compatible 请求路径。
- 扩展 provider 配置结构，支持 Gemini 使用官方默认 API 地址，也支持用户显式配置自定义 BaseURL。
- 为 Gemini 提供内置模型候选：
  - `gemini-3-pro-image-preview`
  - `gemini-3.1-flash-image-preview`
  - `gemini-2.5-flash-image`
  - `gemini-2.5-flash-image-preview`
- 允许用户在 CLI 和配置文件中输入自定义 Gemini 模型名。
- 在 `clawmate:setup` 的服务选择与配置流程中加入 Gemini，引导用户选择“官方默认地址”或“自定义 BaseURL”。
- 补充配置 schema、README/示例配置、provider 测试和 CLI 测试，覆盖 Gemini 的默认地址、自定义 BaseURL 和模型选择行为。

## Capabilities

### New Capabilities

- `gemini-image-provider`: 为自拍生成链路增加基于 Google GenAI SDK 的 Gemini 图片生成与图片编辑能力，并支持默认地址与自定义 BaseURL。
- `gemini-cli-setup`: 为安装 CLI 增加 Gemini 选项，支持预设模型、自定义模型和 BaseURL 模式选择。

### Modified Capabilities

- None.

## Impact

- 新增依赖：`@google/genai`
- 受影响代码：
  - `packages/clawmate-companion/src/core/providers/*`
  - `packages/clawmate-companion/src/core/types.ts`
  - `packages/clawmate-companion/openclaw.plugin.json`
  - `bin/clawmate.cjs`
  - `packages/clawmate-companion/src/cli.test.cjs`
  - `packages/clawmate-companion/src/core/providers/*.test.ts`
  - `README.md` 与示例配置
- 受影响行为：
  - provider 类型自动推断与注册
  - 图片生成/编辑请求适配
  - CLI 配置引导与默认配置写入
