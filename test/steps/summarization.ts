/**
 * Summarization step runner
 * Wraps summarizeWithClaude() from src/summarization/claude.ts
 */

import { summarizeWithClaude } from "../../src/summarization/claude.ts";
import type { SummarizationResult } from "../../src/types.ts";
import { readCache, writeCache, getCachePath } from "../cache.ts";
import { loadTranscriptionFromCache } from "./transcription.ts";
import * as reporter from "../reporters/verbose.ts";

export interface SummarizationStepInput {
  text?: string;
}

export interface SummarizationStepResult {
  success: boolean;
  data?: SummarizationResult;
  error?: string;
  duration_ms: number;
  cached: boolean;
}

/**
 * Run summarization step
 */
export async function runSummarizationStep(
  input: SummarizationStepInput,
  options: { useCache?: boolean; fromCache?: boolean } = {}
): Promise<SummarizationStepResult> {
  const startTime = Date.now();

  reporter.printStepHeader(3, "Summarization");

  // If --from-cache, load text from transcription cache
  let text = input.text;
  if (options.fromCache || !text) {
    reporter.printProgress("Loading transcription from cache");
    const transcriptionResult = await loadTranscriptionFromCache();

    if (!transcriptionResult) {
      const duration_ms = Date.now() - startTime;
      reporter.printError(new Error("No transcription cache found. Run transcription step first."));
      reporter.printResult(false, duration_ms, false);

      return {
        success: false,
        error: "No transcription cache found. Run transcription step first.",
        duration_ms,
        cached: false,
      };
    }

    text = transcriptionResult.text;
    reporter.printProgress(`Loaded transcription (${text.length} chars) from cache`, true);
  }

  reporter.printInput("Summarization", {
    "Text Length": `${text.length} characters`,
    "Preview": text.length > 100 ? text.substring(0, 100) + "..." : text,
  });

  // Check for cached summarization result
  if (options.useCache !== false && !options.fromCache) {
    const cached = await readCache<SummarizationResult>("summarization");
    if (cached) {
      reporter.printProgress("Using cached summarization result", true);
      reporter.printOutput(formatSummarizationOutput(cached.output));
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
    // Get API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    reporter.printProgress("API key loaded", true);

    // Summarize
    reporter.printProgress("Sending to Claude for summarization");
    const result = await summarizeWithClaude(apiKey, text);
    reporter.printProgress(`Generated summary: "${result.title}"`, true);

    const duration_ms = Date.now() - startTime;

    reporter.printOutput(formatSummarizationOutput(result));
    reporter.printResult(true, duration_ms, false, getCachePath("summarization"));

    // Save to cache
    await writeCache("summarization", { textLength: text.length }, result, duration_ms);

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
 * Load summarization result from cache
 */
export async function loadSummarizationFromCache(): Promise<SummarizationResult | null> {
  const cached = await readCache<SummarizationResult>("summarization");
  return cached?.output ?? null;
}

/**
 * Format summarization output for display
 */
function formatSummarizationOutput(result: SummarizationResult): Record<string, unknown> {
  return {
    Title: result.title,
    Summary: result.summary,
    "Main Points": result.main_points,
    "Action Items": result.action_items.length > 0 ? result.action_items : "(none)",
  };
}
