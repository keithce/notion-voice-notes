/**
 * Audio file probing using ffprobe
 */

import type { AudioMetadata } from "../types.ts";
import { FFmpegNotFoundError, FFmpegError } from "../utils/errors.ts";
import { verbose } from "../utils/logger.ts";

/**
 * Check if FFmpeg/FFprobe is installed
 */
export async function checkFFmpeg(): Promise<void> {
  try {
    const proc = Bun.spawn(["ffprobe", "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      throw new FFmpegNotFoundError();
    }
    verbose("FFmpeg/FFprobe found");
  } catch (error) {
    if (error instanceof FFmpegNotFoundError) {
      throw error;
    }
    throw new FFmpegNotFoundError();
  }
}

/**
 * Get audio file metadata using ffprobe
 */
export async function probeAudio(filePath: string): Promise<AudioMetadata> {
  verbose(`Probing audio file: ${filePath}`);

  const file = Bun.file(filePath);
  const fileSize = file.size;

  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new FFmpegError(`Failed to probe audio file: ${stderr}`);
  }

  const data = JSON.parse(stdout);
  const format = data.format;
  const audioStream = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "audio"
  );

  if (!audioStream) {
    throw new FFmpegError("No audio stream found in file");
  }

  const metadata: AudioMetadata = {
    duration: parseFloat(format.duration) || 0,
    format: format.format_name || "unknown",
    bitrate: parseInt(format.bit_rate) || 0,
    channels: audioStream.channels || 1,
    sampleRate: parseInt(audioStream.sample_rate) || 44100,
    fileSize,
  };

  verbose(`Audio metadata: ${JSON.stringify(metadata)}`);
  return metadata;
}
