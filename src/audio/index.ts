/**
 * Audio processing orchestrator
 */

export { checkFFmpeg, probeAudio } from "./probe.ts";
export { needsChunking, chunkAudio, cleanupChunks } from "./chunk.ts";

import type { AudioMetadata, AudioChunk } from "../types.ts";
import { checkFFmpeg, probeAudio } from "./probe.ts";
import { needsChunking, chunkAudio } from "./chunk.ts";
import { verbose } from "../utils/logger.ts";
import { FileNotFoundError } from "../utils/errors.ts";

export interface AudioProcessingResult {
  metadata: AudioMetadata;
  chunks: AudioChunk[];
}

/**
 * Process audio file: validate, probe, and optionally chunk
 */
export async function processAudio(
  filePath: string
): Promise<AudioProcessingResult> {
  // Check FFmpeg is available
  await checkFFmpeg();

  // Verify file exists
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new FileNotFoundError(filePath);
  }

  // Get audio metadata
  const metadata = await probeAudio(filePath);
  verbose(`Audio duration: ${metadata.duration}s, size: ${metadata.fileSize} bytes`);

  // Chunk if necessary
  let chunks: AudioChunk[];
  if (needsChunking(metadata)) {
    verbose("Audio file requires chunking");
    chunks = await chunkAudio(filePath, metadata);
  } else {
    chunks = [
      {
        path: filePath,
        index: 0,
        start: 0,
        end: metadata.duration,
      },
    ];
  }

  return { metadata, chunks };
}
