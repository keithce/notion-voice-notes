/**
 * Environment configuration loading and validation
 */

import type { Config, TranscriptionProvider } from "./types.ts";
import { MissingEnvVarError, MissingProviderKeyError } from "./utils/errors.ts";

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new MissingEnvVarError(name);
  }
  return value;
}

export function loadConfig(
  requestedProvider?: TranscriptionProvider
): Config {
  const anthropicApiKey = requireEnv("ANTHROPIC_API_KEY");
  const notionApiKey = requireEnv("NOTION_API_KEY");
  const notionDatabaseId = requireEnv("NOTION_DATABASE_ID");

  const groqApiKey = getEnv("GROQ_API_KEY");
  const openaiApiKey = getEnv("OPENAI_API_KEY");

  // Determine default provider from env or fallback to groq
  const envProvider = getEnv("TRANSCRIPTION_PROVIDER") as
    | TranscriptionProvider
    | undefined;
  let defaultTranscriptionProvider: TranscriptionProvider =
    requestedProvider || envProvider || "groq";

  // Validate that we have a key for the requested/default provider
  if (defaultTranscriptionProvider === "groq" && !groqApiKey) {
    // If groq is requested but no key, try openai
    if (openaiApiKey) {
      defaultTranscriptionProvider = "openai";
    } else {
      throw new MissingProviderKeyError("groq");
    }
  }

  if (defaultTranscriptionProvider === "openai" && !openaiApiKey) {
    // If openai is requested but no key, try groq
    if (groqApiKey) {
      defaultTranscriptionProvider = "groq";
    } else {
      throw new MissingProviderKeyError("openai");
    }
  }

  return {
    anthropicApiKey,
    notionApiKey,
    notionDatabaseId,
    groqApiKey,
    openaiApiKey,
    defaultTranscriptionProvider,
  };
}

export function validateTranscriptionProvider(
  config: Config,
  provider: TranscriptionProvider
): void {
  if (provider === "groq" && !config.groqApiKey) {
    throw new MissingProviderKeyError("groq");
  }
  if (provider === "openai" && !config.openaiApiKey) {
    throw new MissingProviderKeyError("openai");
  }
}
