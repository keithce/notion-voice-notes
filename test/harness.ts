#!/usr/bin/env bun
/**
 * Test harness CLI for voice-to-notion pipeline
 *
 * Commands:
 *   audio <file>              Run audio processing
 *   transcription [options]   Run transcription (--from-cache or --audio)
 *   summarization [options]   Run summarization (--from-cache or --text)
 *   notion [options]          Run Notion creation (--from-cache, --dry-run)
 *   pipeline <file> [opts]    Run full pipeline
 *   cache list|show|clear     Manage cache
 */

import { runAudioStep } from "./steps/audio.ts";
import { runTranscriptionStep } from "./steps/transcription.ts";
import { runSummarizationStep } from "./steps/summarization.ts";
import { runNotionStep } from "./steps/notion.ts";
import { listCache, clearCache, getCacheForDisplay, type CacheStep } from "./cache.ts";
import * as reporter from "./reporters/verbose.ts";

const HELP = `
Voice-to-Notion Test Harness

Usage:
  bun run test:harness <command> [options]

Commands:
  audio <file>           Run audio processing step
  transcription          Run transcription step
    --from-cache         Use cached audio result
    --audio <file>       Process audio file first
    --provider <name>    Use specific provider (groq|openai)

  summarization          Run summarization step
    --from-cache         Use cached transcription result
    --text <text>        Summarize specific text

  notion                 Run Notion page creation step
    --from-cache         Use cached summary and transcription
    --dry-run            Show preview instead of creating page

  pipeline <file>        Run full pipeline
    --no-cache           Don't use cached intermediate results
    --dry-run            Preview Notion page without creating

  cache                  Manage cache
    list                 Show all cached steps
    show <step>          Show details for a specific step
    clear [step]         Clear cache (all or specific step)

Examples:
  bun run test:harness audio ./sample.mp3
  bun run test:harness transcription --from-cache
  bun run test:harness summarization --from-cache
  bun run test:harness notion --from-cache --dry-run
  bun run test:harness pipeline ./sample.mp3 --dry-run
  bun run test:harness cache list
  bun run test:harness cache clear audio
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "audio":
      await handleAudioCommand(args.slice(1));
      break;

    case "transcription":
      await handleTranscriptionCommand(args.slice(1));
      break;

    case "summarization":
      await handleSummarizationCommand(args.slice(1));
      break;

    case "notion":
      await handleNotionCommand(args.slice(1));
      break;

    case "pipeline":
      await handlePipelineCommand(args.slice(1));
      break;

    case "cache":
      await handleCacheCommand(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

/**
 * Handle audio command
 */
async function handleAudioCommand(args: string[]) {
  const filePath = args[0];

  if (!filePath) {
    console.error("Error: Audio file path required");
    console.log("Usage: bun run test:harness audio <file>");
    process.exit(1);
  }

  const result = await runAudioStep({ filePath });
  process.exit(result.success ? 0 : 1);
}

/**
 * Handle transcription command
 */
async function handleTranscriptionCommand(args: string[]) {
  const fromCache = args.includes("--from-cache");
  const audioIndex = args.indexOf("--audio");
  const providerIndex = args.indexOf("--provider");

  let audioFile: string | undefined;
  if (audioIndex !== -1 && args[audioIndex + 1]) {
    audioFile = args[audioIndex + 1];
  }

  let provider: "groq" | "openai" | undefined;
  if (providerIndex !== -1 && args[providerIndex + 1]) {
    const p = args[providerIndex + 1];
    if (p === "groq" || p === "openai") {
      provider = p;
    }
  }

  // If audio file provided, run audio step first
  if (audioFile) {
    const audioResult = await runAudioStep({ filePath: audioFile });
    if (!audioResult.success) {
      process.exit(1);
    }
  }

  const result = await runTranscriptionStep({ provider }, { fromCache });
  process.exit(result.success ? 0 : 1);
}

/**
 * Handle summarization command
 */
async function handleSummarizationCommand(args: string[]) {
  const fromCache = args.includes("--from-cache");
  const textIndex = args.indexOf("--text");

  let text: string | undefined;
  if (textIndex !== -1 && args[textIndex + 1]) {
    text = args[textIndex + 1];
  }

  const result = await runSummarizationStep({ text }, { fromCache });
  process.exit(result.success ? 0 : 1);
}

/**
 * Handle notion command
 */
async function handleNotionCommand(args: string[]) {
  const fromCache = args.includes("--from-cache");
  const dryRun = args.includes("--dry-run");

  const result = await runNotionStep({}, { fromCache, dryRun });
  process.exit(result.success ? 0 : 1);
}

/**
 * Handle pipeline command
 */
async function handlePipelineCommand(args: string[]) {
  const filePath = args[0];
  const noCache = args.includes("--no-cache");
  const dryRun = args.includes("--dry-run");

  if (!filePath) {
    console.error("Error: Audio file path required");
    console.log("Usage: bun run test:harness pipeline <file> [--no-cache] [--dry-run]");
    process.exit(1);
  }

  console.log();
  console.log("═".repeat(64));
  console.log(" VOICE-TO-NOTION PIPELINE");
  console.log("═".repeat(64));
  console.log();
  console.log(`Input: ${filePath}`);
  console.log(`Cache: ${noCache ? "disabled" : "enabled"}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "live"}`);

  const results: Array<{
    step: string;
    success: boolean;
    duration_ms: number;
    cached: boolean;
    error?: string;
  }> = [];

  // Step 1: Audio
  const audioResult = await runAudioStep(
    { filePath },
    { useCache: !noCache }
  );
  results.push({
    step: "Audio",
    success: audioResult.success,
    duration_ms: audioResult.duration_ms,
    cached: audioResult.cached,
    error: audioResult.error,
  });

  if (!audioResult.success) {
    reporter.printPipelineSummary(results);
    process.exit(1);
  }

  // Step 2: Transcription
  const transcriptionResult = await runTranscriptionStep(
    { chunks: audioResult.data?.chunks },
    { useCache: !noCache }
  );
  results.push({
    step: "Transcription",
    success: transcriptionResult.success,
    duration_ms: transcriptionResult.duration_ms,
    cached: transcriptionResult.cached,
    error: transcriptionResult.error,
  });

  if (!transcriptionResult.success) {
    reporter.printPipelineSummary(results);
    process.exit(1);
  }

  // Step 3: Summarization
  const summarizationResult = await runSummarizationStep(
    { text: transcriptionResult.data?.text },
    { useCache: !noCache }
  );
  results.push({
    step: "Summarization",
    success: summarizationResult.success,
    duration_ms: summarizationResult.duration_ms,
    cached: summarizationResult.cached,
    error: summarizationResult.error,
  });

  if (!summarizationResult.success) {
    reporter.printPipelineSummary(results);
    process.exit(1);
  }

  // Step 4: Notion
  const notionResult = await runNotionStep(
    {
      summary: summarizationResult.data,
      transcription: transcriptionResult.data,
    },
    { useCache: !noCache, dryRun }
  );
  results.push({
    step: "Notion",
    success: notionResult.success,
    duration_ms: notionResult.duration_ms,
    cached: notionResult.cached,
    error: notionResult.error,
  });

  reporter.printPipelineSummary(results);

  const allSuccess = results.every((r) => r.success);
  process.exit(allSuccess ? 0 : 1);
}

/**
 * Handle cache command
 */
async function handleCacheCommand(args: string[]) {
  const subcommand = args[0];

  switch (subcommand) {
    case "list": {
      const entries = await listCache();
      reporter.printCacheList(
        entries.map((e) => ({
          step: e.step,
          timestamp: e.entry?.timestamp ?? null,
          duration_ms: e.entry?.duration_ms ?? null,
          path: e.path,
        }))
      );
      break;
    }

    case "show": {
      const step = args[1] as CacheStep;
      if (!step || !["audio", "transcription", "summarization", "notion"].includes(step)) {
        console.error("Error: Valid step name required (audio|transcription|summarization|notion)");
        process.exit(1);
      }

      const { entry, path, displayOutput } = await getCacheForDisplay(step);
      reporter.printCacheEntry(
        step,
        entry
          ? {
              timestamp: entry.timestamp,
              input: entry.input,
              output: displayOutput,
              duration_ms: entry.duration_ms,
            }
          : null,
        path
      );
      break;
    }

    case "clear": {
      const step = args[1] as CacheStep | undefined;
      if (step && !["audio", "transcription", "summarization", "notion"].includes(step)) {
        console.error("Error: Invalid step name. Use: audio|transcription|summarization|notion");
        process.exit(1);
      }

      const cleared = await clearCache(step);
      if (cleared.length > 0) {
        console.log(`Cleared cache: ${cleared.join(", ")}`);
      } else {
        console.log("No cache entries to clear");
      }
      break;
    }

    default:
      console.error("Error: Cache subcommand required (list|show|clear)");
      console.log("Usage:");
      console.log("  bun run test:harness cache list");
      console.log("  bun run test:harness cache show <step>");
      console.log("  bun run test:harness cache clear [step]");
      process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
