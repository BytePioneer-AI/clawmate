import type { TimeStateDefinition } from "./types";

export interface ResolvedTimeState {
  key: string;
  state: TimeStateDefinition;
}

function toMinute(value: string): number {
  const [h, m] = value.split(":").map((part) => Number(part));
  return h * 60 + m;
}

function inRange(minute: number, range: string): boolean {
  const [startText, endText] = range.split("-");
  const start = toMinute(startText);
  const end = toMinute(endText);

  if (start === end) {
    return true;
  }

  if (start < end) {
    return minute >= start && minute < end;
  }

  return minute >= start || minute < end;
}

export function resolveTimeState(
  timeStates: Record<string, TimeStateDefinition> | undefined,
  now = new Date(),
): ResolvedTimeState {
  const minute = now.getHours() * 60 + now.getMinutes();

  if (!timeStates || typeof timeStates !== "object") {
    return {
      key: "default",
      state: {},
    };
  }

  for (const [key, state] of Object.entries(timeStates)) {
    if (!state || typeof state !== "object" || typeof state.range !== "string") {
      continue;
    }

    if (inRange(minute, state.range)) {
      return { key, state };
    }
  }

  const firstEntry = Object.entries(timeStates)[0];
  if (!firstEntry) {
    return {
      key: "default",
      state: {},
    };
  }

  return {
    key: firstEntry[0],
    state: firstEntry[1],
  };
}
