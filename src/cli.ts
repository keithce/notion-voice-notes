#!/usr/bin/env bun
/**
 * Voice Notes to Notion CLI
 *
 * Takes a local audio file, transcribes it, summarizes with Claude,
 * and creates a Notion page with the results.
 */

import { parseArgs } from "util";
import type { CLIOptions, CLIResult, TranscriptionProvider } from "./types.ts";
import { loadConfig } from "./config.ts";
import { processAudio, cleanupChunks } from "./audio/index.ts";
import { transcribe } from "./transcription/index.ts";
import { summarizeWithClaude } from "./summarization/claude.ts";
import { createVoiceNotePage, buildPreviewContent } from "./notion/index.ts";
import { CLIError, FileNotFoundError, InvalidArgumentError } from "./utils/errors.ts";
import { setVerbose, log, error, info, verbose } from "./utils/logger.ts";

const VERSION = "1.0.0";

const HELP = `
voice-to-notion v${VERSION}

Transcribe audio files and create Notion pages with summaries.

Usage:
  voice-to-notion <audio-file> [options]

Arguments:
  <audio-file>            Path to audio file (mp3, wav, m4a, etc.)

Options:
  -t, --transcription     Transcription provider: "groq" | "openai" (default: from env or "groq")
  --title                 Custom title for Notion page (default: AI-generated)
  --database-id           Override Notion database ID (default: from env)
  --dry-run               Process but don't create Notion page
  -v, --verbose           Enable verbose logging to stderr
  --json                  Output result as JSON to stdout (for n8n parsing)
  -h, --help              Show this help message
  --version               Show version number

Environment Variables:
  ANTHROPIC_API_KEY       Required - Anthropic API key for Claude
  NOTION_API_KEY          Required - Notion integration token
  NOTION_DATABASE_ID      Required - Default Notion database ID
  GROQ_API_KEY            Required if using Groq (default provider)
  OPENAI_API_KEY          Required if using OpenAI
  TRANSCRIPTION_PROVIDER  Optional - Default transcription provider

Examples:
  # Basic usage with Groq
  voice-to-notion ./recording.mp3

  # Use OpenAI Whisper
  voice-to-notion ./recording.mp3 -t openai

  # Dry run with verbose output
  voice-to-notion ./recording.mp3 --dry-run -v

  # JSON output for n8n
  voice-to-notion ./recording.mp3 --json
`.trim();

function parseCliArgs(): CLIOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      transcription: { type: "string", short: "t" },
      title: { type: "string" },
      "database-id": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (positionals.length === 0) {
    console.error("Error: Audio file path is required\n");
    console.log(HELP);
    process.exit(1);
  }

  const audioFile = positionals[0]!;

  // Validate transcription provider
  const transcription = values.transcription as TranscriptionProvider | undefined;
  if (transcription && !["groq", "openai"].includes(transcription)) {
    throw new InvalidArgumentError(
      `Invalid transcription provider: ${transcription}. Must be "groq" or "openai".`
    );
  }

  return {
    audioFile,
    transcription: transcription || "groq",
    title: values.title,
    databaseId: values["database-id"],
    dryRun: values["dry-run"] ?? false,
    verbose: values.verbose ?? false,
    json: values.json ?? false,
  };
}

async function main(): Promise<void> {
  let result: CLIResult | null = null;

  try {
    // Parse CLI arguments
    const options = parseCliArgs();
    setVerbose(options.verbose);

    verbose(`CLI options: ${JSON.stringify(options)}`);

    // Load and validate config
    const config = loadConfig(options.transcription);
    const databaseId = options.databaseId || config.notionDatabaseId;

    // Verify audio file exists
    const audioFile = Bun.file(options.audioFile);
    if (!(await audioFile.exists())) {
      throw new FileNotFoundError(options.audioFile);
    }

    // Resolve to absolute path
    const audioPath = await Bun.file(options.audioFile).name!;

    info(`Processing: ${audioPath}`);

    // Process audio (probe and optionally chunk)
    log("Analyzing audio file...");
    const { metadata, chunks } = await processAudio(options.audioFile);
    verbose(`Audio duration: ${metadata.duration}s, chunks: ${chunks.length}`);

    // Transcribe
    log("Transcribing audio...");
    const transcription = await transcribe(
      config,
      chunks,
      options.transcription
    );
    verbose(`Transcription: ${transcription.text.length} characters`);

    // Clean up chunks if we created any
    if (chunks.length > 1) {
      await cleanupChunks(chunks);
    }

    // Summarize
    log("Generating summary with Claude...");
    const summary = await summarizeWithClaude(
      config.anthropicApiKey,
      transcription.text
    );

    // Override title if provided
    if (options.title) {
      summary.title = options.title;
    }

    // Create result object
    result = {
      success: true,
      audioFile: options.audioFile,
      transcription: {
        text: transcription.text,
        duration: transcription.duration,
        provider: transcription.provider,
      },
      summary,
    };

    // Create Notion page or dry run
    if (options.dryRun) {
      log("Dry run mode - not creating Notion page");
      if (!options.json) {
        const preview = buildPreviewContent(summary, transcription);
        console.log("\n--- Preview ---\n");
        console.log(preview);
        console.log("\n--- End Preview ---\n");
      }
    } else {
      log("Creating Notion page...");
      const notionResult = await createVoiceNotePage(
        config.notionApiKey,
        databaseId,
        summary,
        transcription
      );
      result.notion = notionResult;
      info(`Page created: ${notionResult.url}`);
    }

    // Output result
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!options.dryRun) {
      log("Done!");
      console.log(`\nNotion page: ${result.notion?.url}`);
    }

    process.exit(0);
  } catch (err) {
    const errorResult: CLIResult = {
      success: false,
      audioFile: result?.audioFile || "unknown",
      error: err instanceof Error ? err.message : String(err),
    };

    if (err instanceof CLIError) {
      error(`${err.category}: ${err.message}`);

      if (parseCliArgs().json) {
        console.log(JSON.stringify(errorResult, null, 2));
      }

      process.exit(err.exitCode);
    }

    error(err instanceof Error ? err.message : String(err));

    if (parseCliArgs().json) {
      console.log(JSON.stringify(errorResult, null, 2));
    }

    process.exit(1);
  }
}

// Run
main();
