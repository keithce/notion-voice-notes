/**
 * Transcription step runner
 * Wraps transcribe() from src/transcription/index.ts
 */

import { transcribe } from "../../src/transcription/index.ts";
import { loadConfig } from "../../src/config.ts";
import type { AudioChunk, TranscriptionProvider, TranscriptionResult } from "../../src/types.ts";
import { readCache, writeCache, getCachePath, type CacheEntry } from "../cache.ts";
import { loadAudioFromCache } from "./audio.ts";
import * as reporter from "../reporters/verbose.ts";

export interface TranscriptionStepInput {
  chunks?: AudioChunk[];
  provider?: TranscriptionProvider;
}

export interface TranscriptionStepResult {
  success: boolean;
  data?: TranscriptionResult;
  error?: string;
  duration_ms: number;
  cached: boolean;
}

/**
 * Run transcription step
 */
export async function runTranscriptionStep(
  input: TranscriptionStepInput,
  options: { useCache?: boolean; fromCache?: boolean } = {}
): Promise<TranscriptionStepResult> {
  const startTime = Date.now();

  reporter.printStepHeader(2, "Transcription");

  // If --from-cache, load chunks from audio cache
  let chunks = input.chunks;
  if (options.fromCache || !chunks) {
    reporter.printProgress("Loading audio chunks from cache");
    const audioResult = await loadAudioFromCache();

    if (!audioResult) {
      const duration_ms = Date.now() - startTime;
      reporter.printError(new Error("No audio cache found. Run audio step first."));
      reporter.printResult(false, duration_ms, false);

      return {
        success: false,
        error: "No audio cache found. Run audio step first.",
        duration_ms,
        cached: false,
      };
    }

    chunks = audioResult.chunks;
    reporter.printProgress(`Loaded ${chunks.length} chunk(s) from cache`, true);
  }

  reporter.printInput("Transcription", {
    Chunks: chunks.length,
    Provider: input.provider || "auto-detect",
  });

  // Check for cached transcription result
  if (options.useCache !== false && !options.fromCache) {
    const cached = await readCache<TranscriptionResult>("transcription");
    if (cached) {
      reporter.printProgress("Using cached transcription result", true);
      reporter.printOutput(formatTranscriptionOutput(cached.output));
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
    // Load config
    reporter.printProgress("Loading configuration");
    const config = loadConfig(input.provider);
    reporter.printProgress(`Using provider: ${config.defaultTranscriptionProvider}`, true);

    // Transcribe
    reporter.printProgress("Transcribing audio");

    const result = await transcribe(config, chunks, input.provider);

    reporter.printProgress(
      `Transcribed ${result.text.length} characters`,
      true
    );

    const duration_ms = Date.now() - startTime;

    reporter.printOutput(formatTranscriptionOutput(result));
    reporter.printResult(true, duration_ms, false, getCachePath("transcription"));

    // Save to cache
    await writeCache("transcription", { chunks, provider: config.defaultTranscriptionProvider }, result, duration_ms);

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
 * Load transcription result from cache
 */
export async function loadTranscriptionFromCache(): Promise<TranscriptionResult | null> {
  const cached = await readCache<TranscriptionResult>("transcription");
  return cached?.output ?? null;
}

/**
 * Format transcription output for display
 */
function formatTranscriptionOutput(result: TranscriptionResult): Record<string, unknown> {
  const preview =
    result.text.length > 200
      ? result.text.substring(0, 200) + "..."
      : result.text;

  return {
    Provider: result.provider,
    Duration: `${result.duration.toFixed(1)}s`,
    "Text Length": `${result.text.length} characters`,
    "Preview": preview,
  };
}
