/**
 * Audio processing step runner
 * Wraps processAudio() from src/audio/index.ts
 */

import { processAudio, checkFFmpeg, probeAudio } from "../../src/audio/index.ts";
import type { AudioProcessingResult } from "../../src/audio/index.ts";
import { readCache, writeCache, getCachePath, type CacheEntry } from "../cache.ts";
import * as reporter from "../reporters/verbose.ts";

export interface AudioStepInput {
  filePath: string;
}

export interface AudioStepResult {
  success: boolean;
  data?: AudioProcessingResult;
  error?: string;
  duration_ms: number;
  cached: boolean;
}

/**
 * Run audio processing step
 */
export async function runAudioStep(
  input: AudioStepInput,
  options: { useCache?: boolean } = {}
): Promise<AudioStepResult> {
  const startTime = Date.now();

  reporter.printStepHeader(1, "Audio Processing");
  reporter.printInput("File", { file: input.filePath });

  // Check cache if enabled
  if (options.useCache !== false) {
    const cached = await readCache<AudioProcessingResult>("audio");
    if (cached && (cached.input as AudioStepInput)?.filePath === input.filePath) {
      reporter.printProgress("Using cached result", true);
      reporter.printOutput(formatAudioOutput(cached.output));
      reporter.printResult(true, cached.duration_ms, true);

      return {
        success: true,
        data: cached.output,
        duration_ms: cached.duration_ms,
        cached: true,
      };
    }
  }

  console.log("Processing...");

  try {
    // Check FFmpeg
    reporter.printProgress("Checking FFmpeg availability");
    await checkFFmpeg();
    reporter.printProgress("FFmpeg check passed", true);

    // Verify file exists
    const file = Bun.file(input.filePath);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${input.filePath}`);
    }
    reporter.printProgress("File exists", true);

    // Probe audio file
    reporter.printProgress("Probing audio file");
    const metadata = await probeAudio(input.filePath);
    reporter.printProgress("Probed audio metadata", true);

    // Full processing (includes chunking if needed)
    const result = await processAudio(input.filePath);
    reporter.printProgress(
      result.chunks.length > 1
        ? `Split into ${result.chunks.length} chunks`
        : "No chunking required",
      true
    );

    const duration_ms = Date.now() - startTime;

    // Format output for display
    reporter.printOutput(formatAudioOutput(result));
    reporter.printResult(true, duration_ms, false, getCachePath("audio"));

    // Save to cache
    await writeCache("audio", input, result, duration_ms);

    return {
      success: true,
      data: result,
      duration_ms,
      cached: false,
    };
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    reporter.printError(errorObj);
    reporter.printResult(false, duration_ms, false);

    return {
      success: false,
      error: errorObj.message,
      duration_ms,
      cached: false,
    };
  }
}

/**
 * Load audio result from cache
 */
export async function loadAudioFromCache(): Promise<AudioProcessingResult | null> {
  const cached = await readCache<AudioProcessingResult>("audio");
  return cached?.output ?? null;
}

/**
 * Format audio output for display
 */
function formatAudioOutput(result: AudioProcessingResult): Record<string, unknown> {
  const { metadata, chunks } = result;

  return {
    Duration: `${metadata.duration.toFixed(1)}s`,
    Format: metadata.format,
    "File Size": formatBytes(metadata.fileSize),
    Bitrate: `${Math.round(metadata.bitrate / 1000)} kbps`,
    Channels: metadata.channels,
    "Sample Rate": `${metadata.sampleRate} Hz`,
    "Chunks Required": chunks.length > 1 ? `Yes (${chunks.length} chunks)` : "No (single file)",
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
