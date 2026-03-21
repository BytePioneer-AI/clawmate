# ClawMate

[English](./doc/README.en.md) | 中文

> 为 OpenClaw 添加一个有温度的角色伴侣。

她知道现在几点，知道你在做什么。你问她在哪，她就告诉你；你不问，她也可能随手发来一张自拍。

---

## 功能

- **时间感知** — 根据早晨、上课、午休、傍晚、深夜等时段自动切换场景与穿搭
- **情境生图** — 根据当前对话和状态生成角色自拍，支持写实与动漫风格
- **主动发图** — 支持配置触发频率，在日常聊天中随机发送自拍表达关心
- **语音交互** — 支持角色语音合成，在合适场景发送语音回复
- **多角色切换** — 每个角色拥有独立人设、时间状态与参考图，可一键切换
- **多 Agent 支持** — 多 Agent 场景下支持按 Agent 单独配置
- **自定义角色** — 通过对话创建新角色，由 LLM 引导生成完整角色定义并写入本地
- **多图像服务** — 支持阿里云百炼、火山引擎 ARK、fal.ai 和 OpenAI 兼容接口

## 应用场景

- **个人伴侣** — 日常陪伴、情感交流、生活助手
- **虚拟导师** — 学习辅导、知识答疑、进度跟踪
- **智能客服** — 企业服务、品牌形象、客户互动
- **专业顾问** — 健康管理、心理咨询、职业指导

## 开发计划

- ✅️ **更多角色** — 添加不同性格和背景的内置角色
- ✅️ **多 Agent 支持** — 多 Agent 场景下支持按 Agent 单独配置
- ✅️ **语音交互** — 角色语音合成，支持语音对话
- [ ] **视频生成** — 短视频片段和动态表情
- [ ] **社区角色** — 角色分享和下载平台

---

## 效果展示

### 对话界面

<div align="center">
  <a href="doc/images/demo/demo.png">
    <img src="doc/images/demo/demo1.png" width="45%" alt="指定场景" />
  </a>
  <a href="doc/images/demo/demo2.png">
    <img src="doc/images/demo/demo2.png" width="45%" alt="不指定场景" />
  </a>
  <br/>
  <sub>左：指定场景 | 右：不指定场景</sub>
</div>

### 生成效果

更多样例图片见 [完整图片展示](doc/images/demo/README.md)

<div align="center">
  <img src="doc/images/demo/1.jpg" width="45%" alt="场景示例1" />
  <img src="doc/images/demo/6.jpg" width="45%" alt="场景示例2" />
  <br/>
  <img src="doc/images/demo/8.jpg" width="45%" alt="场景示例3" />
  <img src="doc/images/demo/9.jpg" width="45%" alt="场景示例4" />
  <br/>
  <sub>不同时间状态和场景下的自动生成效果</sub>
</div>

<img width="1583" height="877" alt="image" src="https://github.com/user-attachments/assets/48d58c79-8de3-45c9-920c-1ba348678855" />

<img width="1594" height="880" alt="image" src="https://github.com/user-attachments/assets/fd103615-f9ba-4197-ac73-c3bd2a0c63fd" />


**社群优秀样例哈哈，真的很不错**
>主动发图、主动关环，给你的 OpenClaw 注入一个有温度的灵魂

<img width="1570" height="790" alt="d0862aec4a9e3c973a16795a153767af" src="https://github.com/user-attachments/assets/f3510187-05fa-4c14-afe4-f06a0b00d022" />

---

## 快速开始

确保已安装 [OpenClaw](https://github.com/openclaw/openclaw)。

### 安装 / 更新

首次安装与后续更新使用同一命令：

```bash
npx @clawmate/clawmate
```

交互式安装向导会引导你完成角色选择、主动发图配置、语音配置和图像服务配置；多 Agent 场景下也支持只配置某个 Agent。

### 复刻音色安装说明（阿里云 CosyVoice Clone）

如果你在安装向导中选择 [`复刻音色`](packages/clawmate-companion/bin/cli.cjs:264)，建议先理解下面几个字段。

- [`复刻目标模型`](packages/clawmate-companion/bin/cli.cjs:270)
  - 推荐默认值：`cosyvoice-v3.5-plus`
  - 常见可选值：`cosyvoice-v3.5-plus`、`cosyvoice-v2`
  - 这是“拿什么底座去做声音复刻”，通常直接使用推荐值即可。

- [`已存在的复刻模型 ID`](packages/clawmate-companion/bin/cli.cjs:272)
  - 如果你已经在阿里云控制台创建过复刻音色，就把已有 `modelId` 填进来。
  - 如果留空，表示你准备后续通过脚本或平台流程生成。

- [`合成模型名称`](packages/clawmate-companion/bin/cli.cjs:274)
  - 这是后续“真正发起语音合成”时要调用的模型名，不是角色名。
  - 一般保持默认 `cosyvoice-clone-v1` 即可。

- [`说话人名称`](packages/clawmate-companion/bin/cli.cjs:276)
  - 这是你给这份复刻声音起的内部标识，方便区分多个音色。
  - 例如可以填角色名、昵称或项目代号，如 `mghus`。

- [`示例音频 URL`](packages/clawmate-companion/bin/cli.cjs:278)
  - 这里要填“参考音频的公网直链 URL”。
  - 最稳妥的做法是把音频上传到阿里云 OSS，并获取永久公开链接。
  - 你也可以先去阿里云百炼体验中心测试复刻流程：
    - `https://bailian.console.aliyun.com/cn-beijing?spm=5176.29619931.J_PvCec88exbQTi-U433Fxg.5.9f2110d7c0UDIv&tab=model#/efm/model_experience_center/voice?currentTab=voiceTts&primary=cloning&secondary=clone`

- [`示例音频对应文本`](packages/clawmate-companion/bin/cli.cjs:280)
  - 这里填参考音频里“实际说了什么”。
  - 必须尽量与音频逐字一致，否则复刻质量会明显变差。

- [`任务查询 Base URL`](packages/clawmate-companion/bin/cli.cjs:282)
  - 一般直接留空即可。
  - 只有你使用了代理网关、自建中转层或者特殊 Base URL 时才需要改。

### 如何获取示例音频的公网 URL

推荐用阿里云 OSS：

1. 打开 OSS 控制台：
   - `https://oss.console.aliyun.com/overview`
2. 创建 Bucket
3. 上传你的参考音频文件
4. 把对象设置为“公共读”或使用带长期有效期的分享方式
5. 复制该音频对象的公网访问 URL
6. 把这个 URL 填到 [`示例音频 URL`](packages/clawmate-companion/bin/cli.cjs:278)

建议参考音频满足：
- 时长适中，尽量 10~30 秒
- 人声清晰、背景噪音少
- 只包含一个说话人
- 文本内容完整可转写

### 推荐测试顺序

1. 先在阿里云百炼体验中心试一遍复刻音色流程
2. 准备好 OSS 公网音频链接
3. 再运行 [`npm run clawmate:setup`](package.json:34)
4. 在安装器里选择 [`复刻音色`](packages/clawmate-companion/bin/cli.cjs:264)
5. 如果需要离线验证，可使用探测脚本 [`npm run clawmate:probe:tts:clone`](package.json:34)

安装完成后，对你的 Agent 说：

```
发张自拍看看
你现在在干嘛？
晚上在卧室穿着粉色睡衣拍一张
```

创建自定义角色:
```
帮我创建一个[动漫/写实]风格的新角色，她是一个[描述职业/性格/背景]的女生

# 例：
帮我创建一个动漫风格的新角色，她是一个喜欢画画的大学生
帮我创建一个写实风格的新角色，她是一个热爱咖啡的独立书店店长
```

## 本地开发

```bash
git clone https://github.com/BytePioneer-AI/clawmate.git
cd clawmate
npm install
npm run clawmate:setup
```
多 Agent 配置示例：

```json
{
  "selectedCharacter": "brooke-anime",
  "defaultProvider": "volcengine",
  "agents": {
    "ding-main": {
      "selectedCharacter": "brooke-anime",
      "defaultProvider": "volcengine"
    },
    "ding-work": {
      "selectedCharacter": "brooke",
      "defaultProvider": "aliyun"
    }
  }
}
```

插件会按当前 Agent 的 `workspace` 分别写入各自的 `SOUL.md`，不会再共用同一份人格文件。


---

## 图像服务配置

在 `~/.openclaw/openclaw.json` 的 `plugins.entries.clawmate-companion.config` 下配置：

### 服务特点与选型建议
> - 写实风格建议使用 Nano Banana。  
> - 除 Nano Banana 外，其他模型更建议搭配动漫角色。

| 服务 | 费用特性 |
| --- | --- |
| Gemini 官方 SDK | 取决于 Gemini API 或代理服务额度 |
| ModelScope | 完全免费 |
| 阿里云百炼 | 有免费额度（以官方控制台为准） |
| 火山引擎 ARK | 有免费额度（以官方控制台为准） |
| OpenAI 兼容接口 | 取决于接入服务商 |
| fal.ai | 取决于平台计费策略 |




**Gemini 官方 SDK（官方默认地址）**
```json
{
  "defaultProvider": "gemini",
  "providers": {
    "gemini": {
      "type": "gemini",
      "apiKey": "YOUR_GEMINI_API_KEY",
      "model": "gemini-3.1-flash-image-preview"
    }
  }
}
```

**Gemini 官方 SDK（自定义 BaseURL）**
```json
{
  "defaultProvider": "gemini",
  "providers": {
    "gemini": {
      "type": "gemini",
      "apiKey": "YOUR_GEMINI_API_KEY",
      "baseUrl": "https://your-proxy.example.com",
      "model": "gemini-3.1-flash-image-preview"
    }
  }
}
```

Gemini provider 走 Google GenAI SDK 原生图片请求，不复用 OpenAI-compatible 适配层。

- `baseUrl` 为空或不写时，使用 Gemini SDK 官方默认 API 地址
- `baseUrl` 有值时，改走你提供的自定义地址
- 自定义 `baseUrl` 需要兼容 Google GenAI SDK 的请求路径和鉴权语义
- 有参考图时会把参考图作为 inline image part 一起发给 Gemini

CLI 当前内置以下 Gemini 预设模型，也支持手动输入自定义模型名：

- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`
- `gemini-2.5-flash-image`
- `gemini-2.5-flash-image-preview`

**OpenAI 兼容接口**
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

支持兼容 OpenAI 的图片模型服务，可通过 `baseUrl` 指定自定义端点。
有输入图片时优先尝试 `/v1/images/edits`，失败后回退到 `/v1/chat/completions`；没有输入图片时直接调用 `/v1/chat/completions`。

**阿里云百炼**

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

**火山引擎 ARK**（[API申请文档](doc/API申请文档.md)）
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

## 主动发图

```json
{
  "proactiveSelfie": {
    "enabled": true,
    "probability": 0.1
  }
}
```

`probability` 为每条消息的触发概率，推荐范围 `0.1`–`0.3`。

---
## 多角色

### 内置角色

在 `assets/characters/` 下新建角色目录，包含：

```
{character-id}/
├── meta.json           # id、name、style（photorealistic/anime）、timeStates
├── character-prompt.md # 角色人设（英文）
├── README.md           # 角色档案（中文）
├── images/             # 参考图文件夹
│   └── reference.png
└── *.png               # 其他参考图（可选）
```

然后在配置中切换：

```json
{
  "selectedCharacter": "your-character-id"
}
```

### 自定义角色（对话创建）

直接对 Agent 说：

```
帮我创建一个新角色，她是一个喜欢画画的大学生
```

Agent 会调用 `clawmate_prepare_character` 获取角色定义模板和样例，引导你补充细节，然后调用 `clawmate_create_character` 将角色写入 `~/.openclaw/clawmeta/`。

自定义角色目录与内置角色分离，加载时用户目录优先。也可以通过配置 `userCharacterRoot` 自定义存储路径。

---

## 项目结构

```
ClawMate/
└── packages/clawmate-companion/
    ├── src/core/          # 核心逻辑（pipeline、router、providers）
    ├── skills/            # Skill 定义与角色素材
    │   └── clawmate-companion/
    │       ├── SKILL.md
    │       └── assets/characters/
    │           └── brooke/
    └── bin/cli.cjs        # 安装向导
```


## 语音生成链路


执行链路如下：

`Agent 判断 -> Tool 合成 -> 插件落盘 -> 返回本地路径`

1. `before_agent_start` 会注入角色 `SOUL.md`；启用 TTS 时，还会追加一条轻量提示，让 Agent 在合适的时候使用 `clawmate-companion-tts` skill。
2. Agent 结合角色 prompt 和 TTS skill 判断当前回复是否适合发语音；如果适合，会生成一段适合口播的短文本，并调用 `clawmate_generate_tts`。
3. `clawmate_generate_tts` 会调用阿里云千问 TTS 的 DashScope 原生接口进行合成，当前默认模型为 `qwen3-tts-flash`，默认音色为 `Chelsie`。
4. 插件收到远端音频地址后，会将音频下载到本地 `~/.openclaw/media/clawmate-voice/YYYY-MM-DD/`。
5. Tool 最终返回本地 `audioPath`；具体如何把这段音频发到不同渠道，由上层运行时决定。成功时不应重复发送同内容文字，失败时则降级为普通文字回复。



---

## License

MIT
