# ClawMate

English | [中文](../README.md)

> Add a warm character companion to OpenClaw.

She knows what time it is and what you're doing. Ask her where she is, and she'll tell you; don't ask, and she might spontaneously send you a selfie.

---

## Features

- **Time Awareness** — Morning, class, lunch break, evening, late night - scenes and outfits automatically switch with time
- **Contextual Image Generation** — Generate selfies based on conversation content and current state (supports photorealistic and anime styles), not template-based
- **Proactive Selfies** — Configurable trigger frequency, randomly sends selfies during casual chats to show care
- **Multiple Characters** — Each character has independent persona, time states, and reference images, switchable via configuration
- **Custom Characters** — Create custom characters through conversation, LLM guides generation of complete character definitions and saves to disk
- **Multiple Image Services** — Supports Alibaba Cloud Bailian, Volcengine ARK, ModelScope, fal.ai, OpenAI-compatible endpoints

## Use Cases

- **Personal Companion** — Daily companionship, emotional interaction, life assistant
- **Virtual Tutor** — Learning guidance, knowledge Q&A, progress tracking
- **Smart Customer Service** — Enterprise service, brand image, customer engagement
- **Professional Advisor** — Health management, psychological counseling, career guidance

## Roadmap

- [ ] Second character
- [ ] Voice features
- [ ] Video features

---

## Showcase

### Chat Interface

<div align="center">
  <a href="images/demo/demo.png">
    <img src="images/demo/demo1.png" width="45%" alt="Specified Scene" />
  </a>
  <a href="images/demo/demo2.png">
    <img src="images/demo/demo2.png" width="45%" alt="Unspecified Scene" />
  </a>
  <br/>
  <sub>Left: Specified Scene | Right: Unspecified Scene</sub>
</div>

### Generation Results

More example images in [Full Gallery](images/demo/README.md)

<div align="center">
  <img src="images/demo/1.jpg" width="45%" alt="Example 1" />
  <img src="images/demo/6.jpg" width="45%" alt="Example 2" />
  <br/>
  <img src="images/demo/8.jpg" width="45%" alt="Example 3" />
  <img src="images/demo/9.jpg" width="45%" alt="Example 4" />
  <br/>
  <sub>Auto-generated results under different time states and scenes</sub>
</div>

---

## Quick Start

Ensure [OpenClaw](https://github.com/openclaw/openclaw) is installed.

### Install / Update

Use the same command:

```bash
npx github:BytePioneer-AI/clawmate
```

The interactive installation wizard will guide you through character selection, proactive selfie configuration, and image service setup.

After installation, say to your Agent:

```
Send me a selfie
What are you doing?
Take a photo in pink pajamas in the bedroom at night
```

Create custom characters:
```
Help me create a new character, she is a [describe occupation/personality/background] anime/photorealistic character
```

## Local Development

```bash
git clone https://github.com/BytePioneer-AI/clawmate.git
cd clawmate
npm install
node packages/clawmate-companion/bin/cli.cjs
```

Verify installation:

```bash
npx tsc --noEmit
npm run clawmate:plugin:check
```

---

## Image Service Configuration

Configure under `plugins.entries.clawmate-companion.config` in `~/.openclaw/openclaw.json`:

**ModelScope (Recommended: Qwen-Image-Edit)**

```json
{
  "defaultProvider": "modelscope",
  "providers": {
    "modelscope": {
      "type": "modelscope",
      "baseUrl": "https://api-inference.modelscope.cn/v1",
      "apiKey": "YOUR_MODELSCOPE_TOKEN",
      "model": "Qwen/Qwen-Image-Edit-2511",
      "pollIntervalMs": 1000,
      "pollTimeoutMs": 300000
    }
  }
}
```

Notes:
- ModelScope image generation/edit runs in async mode. The `modelscope` provider automatically submits and polls task results.
- Keep reference images under 5MB (ModelScope API limit).
- Keeping the reference image long side at or below 1664 helps reduce task failures.

**OpenAI-Compatible Endpoint**

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "name": "openai",
      "apiKey": "YOUR_OPENAI_API_KEY",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-image-1.5"
    }
  }
}
```

Supports any service compatible with OpenAI `/v1/images/edits` endpoint. Use `baseUrl` to specify custom endpoints.

**Alibaba Cloud Bailian**

```json
{
  "defaultProvider": "aliyun",
  "providers": {
    "aliyun": {
      "apiKey": "YOUR_DASHSCOPE_API_KEY",
      "model": "wan2.6-image"
    }
  }
}
```

**Volcengine ARK**
```json
{
  "defaultProvider": "volcengine",
  "providers": {
    "volcengine": {
      "apiKey": "YOUR_ARK_API_KEY",
      "model": "doubao-seedream-4-5-251128"
    }
  }
}
```

**fal.ai**
```json
{
  "defaultProvider": "fal",
  "providers": {
    "fal": {
      "apiKey": "YOUR_FAL_KEY",
      "model": "fal-ai/flux/dev/image-to-image"
    }
  }
}
```

---

## Proactive Selfies

```json
{
  "proactiveSelfie": {
    "enabled": true,
    "probability": 0.1
  }
}
```

`probability` is the trigger probability per message, recommended range `0.1`–`0.3`.

---

## Multiple Characters

### Built-in Characters

Create a new character directory under `assets/characters/`, containing:

```
{character-id}/
├── meta.json           # id, name, style (photorealistic/anime), timeStates
├── character-prompt.md # Character persona (English)
├── README.md           # Character profile (Chinese)
├── images/             # Reference images folder
│   └── reference.png
└── *.png               # Other reference images (optional)
```

Then switch in configuration:

```json
{
  "selectedCharacter": "your-character-id"
}
```

### Custom Characters (Create via Conversation)

Simply say to the Agent:

```
Help me create a new character, she is a college student who loves painting
```

The Agent will call `clawmate_prepare_character` to get character definition templates and examples, guide you to fill in details, then call `clawmate_create_character` to write the character to `~/.openclaw/clawmeta/`.

Custom character directories are separate from built-in characters, with user directories taking priority during loading. You can also customize the storage path via `userCharacterRoot` configuration.

---

## Project Structure

```
ClawMate/
└── packages/clawmate-companion/
    ├── src/core/          # Core logic (pipeline, router, providers)
    ├── skills/            # Skill definitions and character assets
    │   └── clawmate-companion/
    │       ├── SKILL.md
    │       └── assets/characters/
    │           └── brooke/
    └── bin/cli.cjs        # Installation wizard
```

---

## License

MIT
