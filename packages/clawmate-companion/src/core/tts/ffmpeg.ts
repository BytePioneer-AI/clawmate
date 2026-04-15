import path from "node:path";

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
  if (path.extname(options.inputPath).toLowerCase() === path.extname(outputPath).toLowerCase()) {
    return {
      outputPath: options.inputPath,
      transcoded: false,
    };
  }

  return {
    outputPath: options.inputPath,
    transcoded: false,
  };
}
