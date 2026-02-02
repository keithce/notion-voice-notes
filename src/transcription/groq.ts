/**
 * Groq Whisper transcription provider
 */

import Groq, { toFile } from "groq-sdk";
import type { AudioChunk } from "../types.ts";
import { TranscriptionAPIError } from "../utils/errors.ts";
import { retry, isTransientError } from "../utils/retry.ts";
import { verbose, progress } from "../utils/logger.ts";

export interface GroqTranscriptionResult {
  text: string;
  duration: number;
}

/**
 * Transcribe a single audio chunk using Groq Whisper
 */
async function transcribeChunk(
  client: Groq,
  chunk: AudioChunk
): Promise<string> {
  const bunFile = Bun.file(chunk.path);
  const arrayBuffer = await bunFile.arrayBuffer();
  const fileName = chunk.path.split("/").pop() || "audio.mp3";

  // Convert to Groq-compatible file format
  const file = await toFile(arrayBuffer, fileName);

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "text",
  });

  // When response_format is "text", the API returns the text directly
  return transcription as unknown as string;
}

/**
 * Transcribe audio using Groq Whisper
 */
export async function transcribeWithGroq(
  apiKey: string,
  chunks: AudioChunk[]
): Promise<GroqTranscriptionResult> {
  verbose(`Transcribing ${chunks.length} chunk(s) with Groq Whisper`);

  const client = new Groq({ apiKey });
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
        "Groq",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  const text = transcripts.join(" ");
  const duration = chunks.reduce((sum, c) => sum + (c.end - c.start), 0);

  verbose(`Transcription complete: ${text.length} characters`);

  return { text, duration };
}
