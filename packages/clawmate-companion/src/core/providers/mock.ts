import { ProviderError } from "../errors";
import type { GenerateRequest, ProviderAdapter } from "../types";

export interface MockProviderOptions {
  name?: string;
  pendingPolls?: number;
  failSubmitTimes?: number;
  failPollTimes?: number;
  transient?: boolean;
  echoReferenceDataUrl?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockProvider(options: MockProviderOptions = {}): ProviderAdapter {
  const name = options.name ?? "mock";
  const pendingPolls = Number.isInteger(options.pendingPolls) ? Math.max(0, options.pendingPolls) : 1;
  const failSubmitTimes = Number.isInteger(options.failSubmitTimes) ? Math.max(0, options.failSubmitTimes) : 0;
  const failPollTimes = Number.isInteger(options.failPollTimes) ? Math.max(0, options.failPollTimes) : 0;
  const transient = options.transient !== false;
  const echoReferenceDataUrl = options.echoReferenceDataUrl !== false;

  let submitFailLeft = failSubmitTimes;
  let pollFailLeft = failPollTimes;

  return {
    name,
    async generate(payload: GenerateRequest) {
      if (submitFailLeft > 0) {
        submitFailLeft -= 1;
        throw new ProviderError(`${name} submit 模拟失败`, {
          code: "MOCK_SUBMIT_FAILED",
          transient,
        });
      }

      if (pollFailLeft > 0) {
        pollFailLeft -= 1;
        throw new ProviderError(`${name} poll 模拟失败`, {
          code: "MOCK_POLL_FAILED",
          transient,
        });
      }

      for (let i = 0; i < pendingPolls; i += 1) {
        await sleep(10);
      }

      const referenceImage =
        payload.referenceImageDataUrls.find((value) => typeof value === "string" && value.trim()) ||
        payload.referencePath?.trim() ||
        payload.referencePaths.find((value) => typeof value === "string" && value.trim()) ||
        "";
      const imageUrl = echoReferenceDataUrl && referenceImage
        ? referenceImage
        : `mock://${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/image.png`;
      const requestId = `${name}-req-${Math.random().toString(36).slice(2, 10)}`;

      return { imageUrl, requestId };
    },
  };
}
