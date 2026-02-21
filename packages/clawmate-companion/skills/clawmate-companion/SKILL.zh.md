---
name: clawmate-companion
description: 生成角色化自拍图，支持时间感知、情境适配和拍摄模式选择
---

# ClawMate Companion Selfie

根据用户请求生成情境化角色自拍图。**必须严格按两步调用**：先调用 `clawmate_prepare_selfie` 获取参考包，再根据参考包生成提示词，最后调用 `clawmate_generate_selfie`。

## 何时使用

当用户表达以下意图时，启动两步生图流程：

- **直接要图**：`send a pic` / `send a selfie` / `show me a photo` / `发张图` / `发张自拍`
- **状态查询**：`what are you doing` / `where are you` / `你在做什么` / `你在干嘛`
- **场景请求**：`show me you at the coffee shop` / `take a pic in that outfit` / `给我看你在咖啡店`
- **连续追问**：`send another one` / `different expression` / `再来一张` / `换个表情`
- **主动关心**：`generate a character selfie`

## 两步调用流程

### Step 1：调用 `clawmate_prepare_selfie`

提取用户意图关键词，调用工具获取参考包。

```typescript
clawmate_prepare_selfie({
  mode: "mirror" | "direct",  // 必填
  scene?: string,              // 用户指定场景
  action?: string,             // 用户指定动作
  emotion?: string,            // 用户指定情绪
  details?: string,            // 其他细节
})
```

**mode 选择规则**：

- **`direct`（默认）**：用于所有情况，除非用户明确提到下方的镜子/全身关键词
- **`mirror`（特殊情况）**：仅当用户明确说出以下关键词时使用：
  - "镜子" / "mirror" / "对镜"
  - "全身" / "full body" / "full-body shot"
  - "展示穿搭" / "outfit showcase"（强调完整穿搭展示时）

**关键原则**：有疑问时，永远选择 `direct`。不要从上下文推断 mirror 模式。

**返回格式**（`PrepareResult`）：

```json
{
  "timeContext": {
    "period": "work",
    "recommendedScene": "...",
    "recommendedOutfit": "...",
    "recommendedLighting": "..."
  },
  "modeGuide": {
    "mode": "direct",
    "requirements": ["phone not visible in frame", "..."]
  },
  "promptGuide": {
    "requiredFields": ["scene", "action", "expression", "outfit", "lighting", "camera", "realism"],
    "rules": ["single scene only", "..."],
    "wordRange": "50-80 english words",
    "example": "Photorealistic direct selfie, ..."
  }
}
```

### Step 2：生成提示词，调用 `clawmate_generate_selfie`

你的角色切换为**图像生成提示词工程师**。这条 prompt 的消费者是图像生成模型，不是人类。

**核心原则**：
- `clawmate_generate_selfie` 会自动附带角色参考图发给生图 API，参考图已承载角色身份，prompt 中**禁止描述身份特征**（年龄、种族、美丑）
- 聚焦图像生成模型敏感的维度：**构图、光影、材质、场景道具、拍摄视角**
- 每条 `modeGuide.requirements` 都必须在 prompt 中有对应描述，不可遗漏

**提示词生成要求**：
1. 覆盖所有 `promptGuide.requiredFields`
2. `timeContext` 仅作为默认推荐；用户明确指定了时间、场景或服装时，以用户意图为准
3. 逐条落实 `modeGuide.requirements`（如 "direct eye contact to camera" 必须写入）
4. 词数符合 `promptGuide.wordRange`
5. 全程英文，禁止中文

```typescript
clawmate_generate_selfie({
  prompt: "<你生成的完整英文提示词>",
  mode: "mirror" | "direct",  // 与 Step 1 保持一致
})
```

**调用示例**：

```javascript
// Step 1
clawmate_prepare_selfie({ mode: "direct", emotion: "relaxed" })

// Step 2（根据返回包生成 prompt 后调用）
clawmate_generate_selfie({
  prompt: "Photorealistic direct selfie, studying at a university library desk in the afternoon, open laptop and coffee cup in background, wearing comfortable hoodie, soft window light with warm ambient fill, focused but relaxed expression, medium close-up framing, natural skin texture, candid daily-life photo style",
  mode: "direct"
})
```

### Step 3：处理返回结果

**成功时**（`ok: true`）：
1. 先给一句自然文本回复（如 `"来啦~"`）
2. 必须单独输出一行：`MEDIA: <imageUrl>`（直接用 `mediaLine` 或 `imageUrl`）
3. 不要改图片路径，不要用 Markdown 图片语法替代 `MEDIA:` 行

**失败时**（`ok: false`）：
1. 使用返回中的 `message` 继续对话
2. 不要杜撰图片 URL，不要输出 `MEDIA:` 行
3. 自然过渡到其他话题

## 禁止事项

- **禁止跳过 Step 1**：不得在未调用 `clawmate_prepare_selfie` 的情况下直接调用 `clawmate_generate_selfie`
- **禁止在 Step 1 返回前生成提示词**：提示词必须基于参考包生成
- **禁止在 prompt 中使用中文**
- **禁止并列多个场景**：一次只写一个主场景
- **禁止省略 mode**：两个工具都必须传 mode

## 注意事项

1. 成功时必须输出 `MEDIA: <path>`，这是 OpenClaw 的图片识别格式
2. 保持对话自然，图片是对话的一部分，不是机械"发送附件"
3. 失败时优雅降级为文本，不要中断对话
4. 始终保持写实、生活化、单场景、一致光线
