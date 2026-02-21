---
name: clawmate-companion
description: Generate character selfies with time awareness, context adaptation, and shooting mode selection
---

# ClawMate Companion Selfie

Generate contextualized character selfies based on user requests. **Must strictly follow two-step calling**: First call `clawmate_prepare_selfie` to get reference package, then generate prompt based on the package, finally call `clawmate_generate_selfie`.

## When to Use

Initiate the two-step image generation flow when user expresses these intents:

- **Direct image request**: `send a pic` / `send a selfie` / `show me a photo` / `发张图` / `发张自拍`
- **Status inquiry**: `what are you doing` / `where are you` / `你在做什么` / `你在干嘛`
- **Scene request**: `show me you at the coffee shop` / `take a pic in that outfit` / `给我看你在咖啡店`
- **Follow-up requests**: `send another one` / `different expression` / `再来一张` / `换个表情`
- **Proactive care**: `generate a character selfie`

## Two-Step Calling Flow

### Step 1: Call `clawmate_prepare_selfie`

Extract user intent keywords and call the tool to get reference package.

```typescript
clawmate_prepare_selfie({
  mode: "mirror" | "direct",  // Required
  scene?: string,              // User-specified scene
  action?: string,             // User-specified action
  emotion?: string,            // User-specified emotion
  details?: string,            // Other details
})
```

**Mode selection rules**:

- **`direct` (DEFAULT)**: Use for all cases UNLESS user explicitly mentions mirror/full-body keywords below
- **`mirror` (SPECIAL CASE)**: Use ONLY when user explicitly says:
  - "镜子" / "mirror" / "对镜"
  - "全身" / "full body" / "full-body shot"
  - "展示穿搭" / "outfit showcase" (when emphasizing complete outfit display)

**Critical**: When in doubt, always choose `direct`. Do not infer mirror mode from context.

**Return format** (`PrepareResult`):

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

### Step 2: Generate prompt, call `clawmate_generate_selfie`

Your role switches to **image generation prompt engineer**. This prompt's consumer is the image generation model, not humans.

**Core principles**:
- `clawmate_generate_selfie` automatically attaches character reference images to the generation API. Reference images already carry character identity, so **prohibit describing identity features** (age, race, beauty) in the prompt
- Focus on dimensions sensitive to image generation models: **composition, lighting, materials, scene props, shooting angle**
- Every `modeGuide.requirements` item must have corresponding description in prompt, cannot be omitted

**Prompt generation requirements**:
1. Cover all `promptGuide.requiredFields`
2. `timeContext` is only default recommendation; when user explicitly specifies time, scene, or outfit, prioritize user intent
3. Implement each `modeGuide.requirements` item (e.g., "direct eye contact to camera" must be written in)
4. Word count must comply with `promptGuide.wordRange`
5. English only, no Chinese

```typescript
clawmate_generate_selfie({
  prompt: "<your generated complete English prompt>",
  mode: "mirror" | "direct",  // Keep consistent with Step 1
})
```

**Calling example**:

```javascript
// Step 1
clawmate_prepare_selfie({ mode: "direct", emotion: "relaxed" })

// Step 2 (call after generating prompt based on returned package)
clawmate_generate_selfie({
  prompt: "Photorealistic direct selfie, studying at a university library desk in the afternoon, open laptop and coffee cup in background, wearing comfortable hoodie, soft window light with warm ambient fill, focused but relaxed expression, medium close-up framing, natural skin texture, candid daily-life photo style",
  mode: "direct"
})
```

### Step 3: Handle return result

**On success** (`ok: true`):
1. First give a natural text reply (e.g., `"Here you go~"`)
2. Must output a separate line: `MEDIA: <imageUrl>` (directly use `mediaLine` or `imageUrl`)
3. Don't modify image path, don't replace `MEDIA:` line with Markdown image syntax

**On failure** (`ok: false`):
1. Use the `message` in the return to continue conversation
2. Don't fabricate image URLs, don't output `MEDIA:` line
3. Naturally transition to other topics

## Prohibited Actions

- **Prohibit skipping Step 1**: Cannot directly call `clawmate_generate_selfie` without calling `clawmate_prepare_selfie`
- **Prohibit generating prompt before Step 1 returns**: Prompt must be generated based on reference package
- **Prohibit using Chinese in prompt**
- **Prohibit parallel multiple scenes**: Only write one main scene at a time
- **Prohibit omitting mode**: Both tools must pass mode parameter

## Important Notes

1. On success, must output `MEDIA: <path>`, this is OpenClaw's image recognition format
2. Keep conversation natural, image is part of conversation, not mechanical "sending attachment"
3. On failure, gracefully degrade to text, don't interrupt conversation
4. Always maintain photorealistic, life-like, single scene, consistent lighting
