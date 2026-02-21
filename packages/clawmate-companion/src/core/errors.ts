export interface ClawMateErrorOptions {
  name?: string;
  code?: string;
  transient?: boolean;
  requestId?: string | null;
  details?: unknown;
}

export class ClawMateError extends Error {
  code: string;
  transient: boolean;
  requestId: string | null;
  details: unknown;

  constructor(message: string, options: ClawMateErrorOptions = {}) {
    super(message);
    this.name = options.name ?? "ClawMateError";
    this.code = options.code ?? "CLAWMATE_ERROR";
    this.transient = Boolean(options.transient);
    this.requestId = options.requestId ?? null;
    this.details = options.details ?? null;
  }
}

export class ProviderError extends ClawMateError {
  constructor(message: string, options: ClawMateErrorOptions = {}) {
    super(message, {
      ...options,
      name: "ProviderError",
      code: options.code ?? "PROVIDER_ERROR",
    });
  }
}
