export interface TimeStateDefinition {
  range?: string;
  scene?: string;
  outfit?: string;
  lighting?: string;
  [key: string]: unknown;
}

export type SelfieMode = "mirror" | "direct";

export type CharacterStyle = "photorealistic" | "anime";

export interface CharacterMeta {
  id?: string;
  name?: string;
  style?: CharacterStyle;
  timeStates?: Record<string, TimeStateDefinition>;
  [key: string]: unknown;
}

export interface CharacterAssets {
  id: string;
  characterDir: string;
  referencePath: string;
  referencePaths: string[];
  characterPrompt: string;
  meta: CharacterMeta;
}

export interface FallbackPolicy {
  enabled: boolean;
  order: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface ProviderConfig {
  type?: string;
  [key: string]: unknown;
}

export type ProvidersConfig = Record<string, ProviderConfig>;

export interface ProactiveSelfieConfig {
  enabled: boolean;
  probability: number; // 0-1, per-message trigger probability
}

export interface ClawMateConfig {
  selectedCharacter: string;
  characterRoot: string;
  userCharacterRoot: string;
  defaultProvider: string;
  fallback: FallbackPolicy;
  retry: RetryPolicy;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  degradeMessage: string;
  providers: ProvidersConfig;
  proactiveSelfie: ProactiveSelfieConfig;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface GenerateRequest {
  characterId: string;
  prompt: string;
  mode?: SelfieMode;
  referencePath: string;
  referencePaths: string[];
  referenceImageBase64: string;
  referenceImageBase64List: string[];
  referenceImageDataUrl: string;
  referenceImageDataUrls: string[];
  timeState: string;
  meta: {
    state: string;
    roleName: string;
    eventSource: string;
  };
}

export interface ProviderGenerateResult {
  imageUrl?: string | null;
  requestId?: string | null;
  message?: string;
}

export interface ProviderAdapter {
  name: string;
  available?: boolean;
  unavailableReason?: string;
  generate(payload: GenerateRequest, options?: { pollIntervalMs?: number; pollTimeoutMs?: number }): Promise<ProviderGenerateResult>;
}

export type ProviderRegistry = Record<string, ProviderAdapter>;

export interface GenerateSelfieSuccess {
  ok: true;
  provider: string;
  requestId: string | null;
  imageUrl: string;
  prompt: string;
  mode?: SelfieMode;
  characterId: string;
  timeState: string;
}

export interface GenerateSelfieFailure {
  ok: false;
  degraded: true;
  provider: string | null;
  requestId: string | null;
  message: string;
  error: string;
}

export type GenerateSelfieResult = GenerateSelfieSuccess | GenerateSelfieFailure;

export interface CreateCharacterMeta {
  id: string;
  name: string;
  englishName?: string;
  style?: CharacterStyle;
  descriptionZh?: string;
  descriptionEn?: string;
  timeStates?: Record<string, TimeStateDefinition>;
}

export type ReferenceImageSource =
  | { source: "existing"; characterId: string }
  | { source: "local"; path: string };

export interface CreateCharacterInput {
  characterId: string;
  meta: CreateCharacterMeta;
  characterPrompt: string;
  referenceImage: ReferenceImageSource;
}

export interface CreateCharacterResult {
  ok: true;
  characterId: string;
  characterDir: string;
  files: string[];
}

export interface CharacterListEntry {
  id: string;
  name: string;
  englishName?: string;
  descriptionZh?: string;
  descriptionEn?: string;
  builtIn: boolean;
  characterDir: string;
}
