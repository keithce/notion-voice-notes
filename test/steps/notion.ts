/**
 * Notion step runner
 * Wraps createVoiceNotePage() from src/notion/index.ts
 */

import { createVoiceNotePage, buildPreviewContent } from "../../src/notion/index.ts";
import type { SummarizationResult, TranscriptionResult, NotionPageResult } from "../../src/types.ts";
import { readCache, writeCache, getCachePath } from "../cache.ts";
import { loadSummarizationFromCache } from "./summarization.ts";
import { loadTranscriptionFromCache } from "./transcription.ts";
import * as reporter from "../reporters/verbose.ts";

export interface NotionStepInput {
  summary?: SummarizationResult;
  transcription?: TranscriptionResult;
  databaseId?: string;
}

export interface NotionStepResult {
  success: boolean;
  data?: NotionPageResult;
  preview?: string;
  error?: string;
  duration_ms: number;
  cached: boolean;
  dryRun: boolean;
}

/**
 * Run Notion step
 */
export async function runNotionStep(
  input: NotionStepInput,
  options: { useCache?: boolean; fromCache?: boolean; dryRun?: boolean } = {}
): Promise<NotionStepResult> {
  const startTime = Date.now();

  reporter.printStepHeader(4, "Notion Page Creation");

  // Load summary and transcription from cache if needed
  let summary = input.summary;
  let transcription = input.transcription;

  if (options.fromCache || !summary) {
    reporter.printProgress("Loading summarization from cache");
    const cachedSummary = await loadSummarizationFromCache();

    if (!cachedSummary) {
      const duration_ms = Date.now() - startTime;
      reporter.printError(new Error("No summarization cache found. Run summarization step first."));
      reporter.printResult(false, duration_ms, false);

      return {
        success: false,
        error: "No summarization cache found. Run summarization step first.",
        duration_ms,
        cached: false,
        dryRun: options.dryRun ?? false,
      };
    }

    summary = cachedSummary;
    reporter.printProgress("Loaded summary from cache", true);
  }

  if (options.fromCache || !transcription) {
    reporter.printProgress("Loading transcription from cache");
    const cachedTranscription = await loadTranscriptionFromCache();

    if (!cachedTranscription) {
      const duration_ms = Date.now() - startTime;
      reporter.printError(new Error("No transcription cache found. Run transcription step first."));
      reporter.printResult(false, duration_ms, false);

      return {
        success: false,
        error: "No transcription cache found. Run transcription step first.",
        duration_ms,
        cached: false,
        dryRun: options.dryRun ?? false,
      };
    }

    transcription = cachedTranscription;
    reporter.printProgress("Loaded transcription from cache", true);
  }

  reporter.printInput("Notion", {
    Title: summary.title,
    "Main Points": summary.main_points.length,
    "Action Items": summary.action_items.length,
    "Transcript Length": `${transcription.text.length} chars`,
  });

  // Handle dry run mode
  if (options.dryRun) {
    const duration_ms = Date.now() - startTime;
    const preview = buildPreviewContent(summary, transcription);

    reporter.printProgress("Dry run mode - generating preview", true);
    reporter.printDryRunPreview(preview);
    reporter.printResult(true, duration_ms, false);

    return {
      success: true,
      preview,
      duration_ms,
      cached: false,
      dryRun: true,
    };
  }

  // Check for cached Notion result
  if (options.useCache !== false && !options.fromCache) {
    const cached = await readCache<NotionPageResult>("notion");
    if (cached) {
      reporter.printProgress("Using cached Notion result", true);
      reporter.printOutput(formatNotionOutput(cached.output));
      reporter.printResult(true, cached.duration_ms, true);

      return {
        success: true,
        data: cached.output,
        duration_ms: cached.duration_ms,
        cached: true,
        dryRun: false,
      };
    }
  }

  console.log("Processing...");

  try {
    // Get required config
    const notionApiKey = process.env.NOTION_API_KEY;
    if (!notionApiKey) {
      throw new Error("NOTION_API_KEY environment variable is required");
    }

    const databaseId = input.databaseId || process.env.NOTION_DATABASE_ID;
    if (!databaseId) {
      throw new Error("NOTION_DATABASE_ID environment variable is required");
    }

    reporter.printProgress("Configuration loaded", true);

    // Create page
    reporter.printProgress("Creating Notion page");
    const result = await createVoiceNotePage(
      notionApiKey,
      databaseId,
      summary,
      transcription
    );
    reporter.printProgress(`Page created: ${result.url}`, true);

    const duration_ms = Date.now() - startTime;

    reporter.printOutput(formatNotionOutput(result));
    reporter.printResult(true, duration_ms, false, getCachePath("notion"));

    // Save to cache
    await writeCache(
      "notion",
      { title: summary.title, databaseId },
      result,
      duration_ms
    );

    return {
      success: true,
      data: result,
      duration_ms,
      cached: false,
      dryRun: false,
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
      dryRun: false,
    };
  }
}

/**
 * Load Notion result from cache
 */
export async function loadNotionFromCache(): Promise<NotionPageResult | null> {
  const cached = await readCache<NotionPageResult>("notion");
  return cached?.output ?? null;
}

/**
 * Format Notion output for display
 */
function formatNotionOutput(result: NotionPageResult): Record<string, unknown> {
  return {
    "Page ID": result.pageId,
    URL: result.url,
  };
}
