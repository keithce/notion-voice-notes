/**
 * Audio file chunking using ffmpeg
 */

import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import type { AudioChunk, AudioMetadata } from "../types.ts";
import { FFmpegError } from "../utils/errors.ts";
import { verbose, progress } from "../utils/logger.ts";

// Maximum file size by provider (Whisper APIs only limited by file size, not duration)
// Default limits match free tier; override with GROQ_MAX_FILE_SIZE_MB for developer plan
const MAX_FILE_SIZE_OPENAI = 25 * 1024 * 1024;   // 25MB (OpenAI limit)
const MAX_FILE_SIZE_GROQ_DEFAULT = 25 * 1024 * 1024;   // 25MB (Groq free tier)

/**
 * Get max file size based on transcription provider
 * Groq limit can be overridden via GROQ_MAX_FILE_SIZE_MB env var (developer plan allows 100MB)
 */
function getMaxFileSize(): number {
  const provider = process.env.TRANSCRIPTION_PROVIDER;

  if (provider === 'groq') {
    const customLimitMB = process.env.GROQ_MAX_FILE_SIZE_MB;
    if (customLimitMB) {
      const limitMB = parseInt(customLimitMB, 10);
      if (!isNaN(limitMB) && limitMB > 0) {
        return limitMB * 1024 * 1024;
      }
    }
    return MAX_FILE_SIZE_GROQ_DEFAULT;
  }

  return MAX_FILE_SIZE_OPENAI;
}

/**
 * Determine if a file needs to be chunked based on file size
 */
export function needsChunking(metadata: AudioMetadata): boolean {
  return metadata.fileSize > getMaxFileSize();
}

/**
 * Calculate chunk count based on file size
 */
export function calculateChunkCount(metadata: AudioMetadata): number {
  return Math.max(Math.ceil(metadata.fileSize / getMaxFileSize()), 1);
}

/**
 * Split audio file into chunks
 */
export async function chunkAudio(
  filePath: string,
  metadata: AudioMetadata
): Promise<AudioChunk[]> {
  const chunkCount = calculateChunkCount(metadata);

  if (chunkCount === 1) {
    verbose("File does not need chunking");
    return [
      {
        path: filePath,
        index: 0,
        start: 0,
        end: metadata.duration,
      },
    ];
  }

  verbose(`Splitting audio into ${chunkCount} chunks`);

  const chunkDuration = metadata.duration / chunkCount;
  const tempDir = join(tmpdir(), `voice-to-notion-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  const baseName = basename(filePath, ".mp3")
    .replace(/\.[^/.]+$/, ""); // Remove extension
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkDuration;
    const end = Math.min((i + 1) * chunkDuration, metadata.duration);
    const chunkPath = join(tempDir, `${baseName}_chunk_${i}.mp3`);

    progress(`Splitting chunk ${i + 1}/${chunkCount}`, i + 1, chunkCount);

    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        filePath,
        "-ss",
        start.toString(),
        "-t",
        (end - start).toString(),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "1",
        chunkPath,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new FFmpegError(`Failed to create chunk ${i}: ${stderr}`);
    }

    chunks.push({
      path: chunkPath,
      index: i,
      start,
      end,
    });
  }

  verbose(`Created ${chunks.length} chunks in ${tempDir}`);
  return chunks;
}

/**
 * Clean up temporary chunk files
 */
export async function cleanupChunks(chunks: AudioChunk[]): Promise<void> {
  for (const chunk of chunks) {
    // Don't delete the original file
    if (chunk.index === 0 && chunks.length === 1) {
      continue;
    }

    try {
      const file = Bun.file(chunk.path);
      if (await file.exists()) {
        await Bun.$`rm ${chunk.path}`.quiet();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
