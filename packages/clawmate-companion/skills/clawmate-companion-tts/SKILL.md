---
name: clawmate-companion-tts
description: Send contextualized short voice messages for ClawMate when the current moment is better expressed by voice
---

# ClawMate Companion TTS

Use this skill when the current reply is better delivered as a short voice note instead of visible text.

## When to Use

Prefer this skill in the following cases:

- **Must send voice**
  - User explicitly asks: `send me a voice message` / `read it to me` / `say it to me`
  - Bedtime companionship, soothing, storytelling, love notes
  - User is clearly seeking comfort: upset, lonely, anxious, overwhelmed, about to cry

- **Good fit for voice**
  - Good morning / good night / after-work check-in
  - Holiday wishes
  - Encouragement
  - Celebration
  - Missing the user / playful affection / intimate interaction

## When Not to Use

Do not use this skill for:

- Tool-like Q&A
- Knowledge explanations
- Long lists
- Code
- Setup instructions
- Long replies that do not sound natural as spoken voice
- Situations where the user just signaled they cannot listen right now

## Workflow

1. Decide whether this reply should use voice.
2. If not, reply normally in text and do not call the tool.
3. If yes, write a short spoken version and call:

```ts
clawmate_generate_tts({
  text: "<short spoken text>"
})
```

## Spoken Text Rules

- `text` is for speech synthesis, not for user display
- Keep it short, natural, intimate, and voice-note-like
- Usually 1-3 sentences
- Prefer spoken wording over written wording
- Do not use Markdown
- Do not use bullet lists
- Do not include code
- Do not turn a long explanation into spoken audio

## Handling Tool Results

### On success

1. Do not send the same content as visible text
2. If `delivery.delivered` is `true`, the plugin has already sent the voice message directly, so do not send it again
3. If `delivery.delivered` is not `true`, the tool returns a local audio path in `audioPath`
4. You must immediately use that path to send the voice message to the user
5. If `nextAction = use_audio_path_to_send_voice` is present, follow it literally and do not just repeat the path

### On failure

1. Use the returned `message` to continue naturally in text
2. Do not fabricate audio paths or delivery syntax

## Prohibited Actions

- Do not call TTS for code or long-form explanation
- Do not send duplicate visible text when voice is sent
- Do not invent local file paths
- Do not turn every reply into voice
