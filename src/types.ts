/**
 * Type definitions for voice-to-notion CLI
 */

export type TranscriptionProvider = "groq" | "openai";

export interface CLIOptions {
  audioFile: string;
  transcription: TranscriptionProvider;
  title?: string;
  databaseId?: string;
  dryRun: boolean;
  verbose: boolean;
  json: boolean;
}

export interface Config {
  anthropicApiKey: string;
  notionApiKey: string;
  notionDatabaseId: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  defaultTranscriptionProvider: TranscriptionProvider;
}

export interface AudioMetadata {
  duration: number; // seconds
  format: string;
  bitrate: number;
  channels: number;
  sampleRate: number;
  fileSize: number; // bytes
}

export interface AudioChunk {
  path: string;
  index: number;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  provider: TranscriptionProvider;
}

export interface SummarizationResult {
  title: string;
  summary: string;
  main_points: string[];
  action_items: string[];
}

export interface NotionPageResult {
  pageId: string;
  url: string;
}

export interface CLIResult {
  success: boolean;
  audioFile: string;
  transcription?: {
    text: string;
    duration: number;
    provider: TranscriptionProvider;
  };
  summary?: SummarizationResult;
  notion?: NotionPageResult;
  error?: string;
}
