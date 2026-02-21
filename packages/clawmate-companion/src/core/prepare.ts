import { loadCharacterAssets } from "./characters";
import { resolveTimeState } from "./time-state";
import type { ClawMateConfig, SelfieMode } from "./types";

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

const PROMPT_RULES = [
  "single scene only, no scene mixing",
  "lighting must be physically plausible for the scene and time",
  "keep human realism: natural skin texture, realistic anatomy, believable proportions",
  "candid daily-life photo style, not fashion editorial",
  "include 1-2 concrete background props to support scene context",
  "do not describe character identity (age, ethnicity, beauty) — the reference image handles identity",
];

const REQUIRED_FIELDS = ["scene", "action", "expression", "outfit", "lighting", "camera", "realism"];

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

const MODE_EXAMPLES: Record<SelfieMode, string> = {
  direct:
    "Photorealistic direct selfie, [scene matching current time and context], [1-2 background props supporting the scene], wearing [outfit appropriate for the situation], [lighting physically plausible for the scene], natural relaxed expression, medium close-up framing, natural skin texture, candid daily-life photo style, no studio glamour look",
  mirror:
    "Photorealistic mirror selfie, standing in front of [mirror location matching scene], wearing [outfit appropriate for the situation], phone clearly visible in hand, posture natural and relaxed, [background environment visible], [lighting physically plausible for the scene], mirror logic physically correct, authentic candid snapshot style",
};

export async function prepareSelfie(options: PrepareSelfieOptions): Promise<PrepareResult> {
  const { mode, config, cwd, now = new Date() } = options;

  const character = await loadCharacterAssets({
    characterId: config.selectedCharacter,
    characterRoot: config.characterRoot,
    userCharacterRoot: config.userCharacterRoot,
    cwd,
  });

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
      requiredFields: REQUIRED_FIELDS,
      rules: PROMPT_RULES,
      wordRange: "50-80 english words",
      example: MODE_EXAMPLES[mode],
    },
  };
}
