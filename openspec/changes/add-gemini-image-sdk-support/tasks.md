## 1. Gemini provider runtime

- [x] 1.1 Add the `@google/genai` dependency and register a `gemini` provider type/alias in the provider registry
- [x] 1.2 Implement `src/core/providers/gemini.ts` with config normalization for `apiKey`, `model`, and optional `baseUrl`, plus an injectable Gemini client factory for tests
- [x] 1.3 Map `GenerateRequest` prompt and reference images to Gemini SDK image requests and convert returned image parts into `data:image/...;base64,...` results
- [x] 1.4 Add provider unit tests for official default endpoint mode, custom BaseURL mode, reference-image requests, custom model pass-through, and missing-image failures

## 2. CLI Gemini setup

- [x] 2.1 Add Gemini to `bin/clawmate.cjs` provider definitions with the four preset models and custom model input
- [x] 2.2 Extend the Gemini CLI flow to let users choose between the official default Gemini API address and a custom BaseURL, and write the corresponding provider config
- [x] 2.3 Ensure shared and agent-scoped setup flows can set `defaultProvider` to the Gemini provider entry without regressing existing provider selection behavior
- [x] 2.4 Add CLI tests covering Gemini visibility, preset-model persistence, custom-model persistence, official default endpoint mode, and custom BaseURL mode

## 3. Docs and verification

- [x] 3.1 Update `README.md` and sample config docs with native Gemini provider examples for official default and custom BaseURL setups
- [x] 3.2 Document the supported Gemini presets and note that custom BaseURL must be compatible with Google GenAI SDK request semantics
- [x] 3.3 Run `npm run clawmate:test` and `npm run clawmate:plugin:check` after implementation to verify the new Gemini support
