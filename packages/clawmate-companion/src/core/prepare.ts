import { loadCharacterAssets } from "./characters";
import { resolveTimeState } from "./time-state";
import type { CharacterStyle, ClawMateConfig, SelfieMode } from "./types";

export interface PrepareResult {
  timeContext: {
    period: string;
    recommendedScene: string;
    recommendedOutfit: string;
    recommendedLighting: string;
  };
  modeGuide: {
    mode: SelfieMode;
    requirements: string[];
  };
  promptGuide: {
    style: CharacterStyle;
    requiredFields: string[];
    rules: string[];
    wordRange: string;
    example: string;
  };
}

export interface PrepareSelfieOptions {
  mode: SelfieMode;
  config: ClawMateConfig;
  cwd?: string;
  now?: Date;
}

const SHARED_RULES = [
  "single scene only, no scene mixing",
  "lighting must be physically plausible for the scene and time",
  "include 1-2 concrete background props to support scene context",
  "do not describe character identity (age, ethnicity, beauty) — the reference image handles identity",
];

const STYLE_RULES: Record<CharacterStyle, string[]> = {
  photorealistic: [
    ...SHARED_RULES,
    "keep human realism: natural skin texture, realistic anatomy, believable proportions",
    "candid daily-life photo style, not fashion editorial",
  ],
  anime: [
    ...SHARED_RULES,
    "maintain anime/manga art style consistent with the reference image",
    "avoid photorealistic textures — keep consistent 2D illustrated look",
  ],
};

const STYLE_REQUIRED_FIELDS: Record<CharacterStyle, string[]> = {
  photorealistic: ["scene", "action", "expression", "outfit", "lighting", "camera", "realism"],
  anime: ["scene", "action", "expression", "outfit", "lighting", "camera", "art_style"],
};

const MODE_REQUIREMENTS: Record<SelfieMode, string[]> = {
  direct: [
    "phone not visible in frame",
    "direct eye contact to camera",
    "medium close-up framing",
    "face fully visible",
  ],
  mirror: [
    "phone clearly visible in hand",
    "correct mirror logic, natural left-right reflection",
    "full or half body framing",
    "background environment visible",
  ],
};

const STYLE_MODE_EXAMPLES: Record<CharacterStyle, Record<SelfieMode, string>> = {
  photorealistic: {
    direct:
      "Photorealistic direct selfie, [scene matching current time and context], [1-2 background props supporting the scene], wearing [outfit appropriate for the situation], [lighting physically plausible for the scene], natural relaxed expression, medium close-up framing, natural skin texture, candid daily-life photo style, no studio glamour look",
    mirror:
      "Photorealistic mirror selfie, standing in front of [mirror location matching scene], wearing [outfit appropriate for the situation], phone clearly visible in hand, posture natural and relaxed, [background environment visible], [lighting physically plausible for the scene], mirror logic physically correct, authentic candid snapshot style",
  },
  anime: {
    direct:
      "Anime-style direct selfie, [scene matching current time and context], [1-2 background props supporting the scene], wearing [outfit appropriate for the situation], [lighting matching scene atmosphere], expressive face, medium close-up framing, consistent 2D anime look matching reference image style",
    mirror:
      "Anime-style mirror selfie, standing in front of [mirror location matching scene], wearing [outfit appropriate for the situation], phone clearly visible in hand, relaxed natural pose, [background environment visible], [lighting matching scene atmosphere], correct mirror reflection, consistent 2D anime look matching reference image style",
  },
};

export async function prepareSelfie(options: PrepareSelfieOptions): Promise<PrepareResult> {
  const { mode, config, cwd, now = new Date() } = options;

  const character = await loadCharacterAssets({
    characterId: config.selectedCharacter,
    characterRoot: config.characterRoot,
    userCharacterRoot: config.userCharacterRoot,
    cwd,
    allowMissingReference: true,
  });

  const style: CharacterStyle = character.meta.style ?? "photorealistic";
  const timeState = resolveTimeState(character.meta.timeStates, now);

  return {
    timeContext: {
      period: timeState.key,
      recommendedScene: timeState.state.scene ?? "",
      recommendedOutfit: timeState.state.outfit ?? "",
      recommendedLighting: timeState.state.lighting ?? "",
    },
    modeGuide: {
      mode,
      requirements: MODE_REQUIREMENTS[mode],
    },
    promptGuide: {
      style,
      requiredFields: STYLE_REQUIRED_FIELDS[style],
      rules: STYLE_RULES[style],
      wordRange: "50-80 english words",
      example: STYLE_MODE_EXAMPLES[style][mode],
    },
  };
}
