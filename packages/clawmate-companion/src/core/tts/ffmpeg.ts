import path from "node:path";
import { spawn } from "node:child_process";

export interface TranscodeAudioOptions {
  inputPath: string;
  outputFormat: "wav" | "ogg" | "opus";
}

export interface TranscodeAudioResult {
  outputPath: string;
  transcoded: boolean;
}

function buildOutputPath(inputPath: string, outputFormat: "wav" | "ogg" | "opus"): string {
  const parsed = path.parse(inputPath);
  if (outputFormat === "wav") {
    return inputPath;
  }
  const ext = outputFormat === "opus" ? ".opus" : ".ogg";
  return path.join(parsed.dir, `${parsed.name}${ext}`);
}

export async function transcodeAudioWithFfmpeg(options: TranscodeAudioOptions): Promise<TranscodeAudioResult> {
  if (options.outputFormat === "wav") {
    return {
      outputPath: options.inputPath,
      transcoded: false,
    };
  }

  const outputPath = buildOutputPath(options.inputPath, options.outputFormat);
  const args = [
    "-y",
    "-i",
    options.inputPath,
    "-c:a",
    "libopus",
    "-b:a",
    "48k",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });

  return {
    outputPath,
    transcoded: true,
  };
}
