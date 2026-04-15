import os from "node:os";
import path from "node:path";

function resolveOpenClawHome(): string {
  return process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
}

export function resolveGeneratedImageDir(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return path.join(resolveOpenClawHome(), "media", "clawmate-generated", day);
}

export function resolveGeneratedAudioDir(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return path.join(resolveOpenClawHome(), "media", "clawmate-voice", day);
}

export function resolveSoulMdPath(workspaceDir?: string): string {
  if (typeof workspaceDir === "string" && workspaceDir.trim()) {
    return path.join(workspaceDir, "SOUL.md");
  }
  return path.join(resolveOpenClawHome(), "workspace", "SOUL.md");
}
