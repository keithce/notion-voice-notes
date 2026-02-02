/**
 * OpenAI Whisper transcription provider
 */

import OpenAI, { toFile } from "openai";
import type { AudioChunk } from "../types.ts";
import { TranscriptionAPIError } from "../utils/errors.ts";
import { retry, isTransientError } from "../utils/retry.ts";
import { verbose, progress } from "../utils/logger.ts";

export interface OpenAITranscriptionResult {
  text: string;
  duration: number;
}

/**
 * Transcribe a single audio chunk using OpenAI Whisper
 */
async function transcribeChunk(
  client: OpenAI,
  chunk: AudioChunk
): Promise<string> {
  const bunFile = Bun.file(chunk.path);
  const arrayBuffer = await bunFile.arrayBuffer();
  const fileName = chunk.path.split("/").pop() || "audio.mp3";

  // Convert to OpenAI-compatible file format
  const file = await toFile(arrayBuffer, fileName);

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
  });

  // When response_format is "text", the API returns the text directly
  return transcription as unknown as string;
}

/**
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeWithOpenAI(
  apiKey: string,
  chunks: AudioChunk[]
): Promise<OpenAITranscriptionResult> {
  verbose(`Transcribing ${chunks.length} chunk(s) with OpenAI Whisper`);

  const client = new OpenAI({ apiKey });
  const transcripts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    progress(`Transcribing chunk ${i + 1}/${chunks.length}`, i + 1, chunks.length);

    try {
      const text = await retry(
        () => transcribeChunk(client, chunk),
        {
          maxAttempts: 3,
          retryableErrors: isTransientError,
        }
      );
      transcripts.push(text);
    } catch (error) {
      throw new TranscriptionAPIError(
        "OpenAI",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  const text = transcripts.join(" ");
  const duration = chunks.reduce((sum, c) => sum + (c.end - c.start), 0);

  verbose(`Transcription complete: ${text.length} characters`);

  return { text, duration };
}
