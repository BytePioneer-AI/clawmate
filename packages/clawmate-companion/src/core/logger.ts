import type { Logger } from "./types";

type LogLevel = "info" | "warn" | "error";

export interface LoggerOptions {
  useStderr?: boolean;
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createLogger(prefix = "clawmate", options: LoggerOptions = {}): Logger {
  const useStderr = Boolean(options.useStderr);

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const line = `[${prefix}] ${level.toUpperCase()} ${message}`;
    const out = useStderr ? console.error : console.log;

    if (meta && Object.keys(meta).length > 0) {
      const withMeta = `${line} ${toJson(meta)}`;
      if (level === "error") {
        console.error(withMeta);
        return;
      }
      out(withMeta);
      return;
    }

    if (level === "error") {
      console.error(line);
      return;
    }

    out(line);
  }

  return {
    info(message, meta = {}) {
      log("info", message, meta);
    },
    warn(message, meta = {}) {
      log("warn", message, meta);
    },
    error(message, meta = {}) {
      log("error", message, meta);
    },
  };
}
