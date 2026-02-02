/**
 * Error classes with exit codes for n8n integration
 *
 * Exit code ranges:
 * 0       - Success
 * 1-9     - Input errors (invalid args, file not found)
 * 10-19   - Config errors (missing env vars)
 * 20-29   - Transcription errors (API errors)
 * 30-39   - Summarization errors (API errors)
 * 40-49   - Notion errors (API errors)
 * 50-59   - Processing errors (FFmpeg errors)
 */

export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public category: string
  ) {
    super(message);
    this.name = "CLIError";
  }
}

// Input errors (1-9)
export class InputError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode, "input");
    this.name = "InputError";
  }
}

export class FileNotFoundError extends InputError {
  constructor(path: string) {
    super(`File not found: ${path}`, 2);
    this.name = "FileNotFoundError";
  }
}

export class InvalidArgumentError extends InputError {
  constructor(message: string) {
    super(message, 3);
    this.name = "InvalidArgumentError";
  }
}

// Config errors (10-19)
export class ConfigError extends CLIError {
  constructor(message: string, exitCode: number = 10) {
    super(message, exitCode, "config");
    this.name = "ConfigError";
  }
}

export class MissingEnvVarError extends ConfigError {
  constructor(varName: string) {
    super(`Missing required environment variable: ${varName}`, 11);
    this.name = "MissingEnvVarError";
  }
}

export class MissingProviderKeyError extends ConfigError {
  constructor(provider: string) {
    super(
      `No API key found for ${provider}. Set ${provider.toUpperCase()}_API_KEY environment variable.`,
      12
    );
    this.name = "MissingProviderKeyError";
  }
}

// Transcription errors (20-29)
export class TranscriptionError extends CLIError {
  constructor(message: string, exitCode: number = 20) {
    super(message, exitCode, "transcription");
    this.name = "TranscriptionError";
  }
}

export class TranscriptionAPIError extends TranscriptionError {
  constructor(provider: string, originalError: Error) {
    super(`${provider} transcription failed: ${originalError.message}`, 21);
    this.name = "TranscriptionAPIError";
  }
}

export class TranscriptionFileTooLargeError extends TranscriptionError {
  constructor(fileSize: number, maxSize: number) {
    super(
      `Audio file too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`,
      22
    );
    this.name = "TranscriptionFileTooLargeError";
  }
}

// Summarization errors (30-39)
export class SummarizationError extends CLIError {
  constructor(message: string, exitCode: number = 30) {
    super(message, exitCode, "summarization");
    this.name = "SummarizationError";
  }
}

export class SummarizationAPIError extends SummarizationError {
  constructor(originalError: Error) {
    super(`Claude summarization failed: ${originalError.message}`, 31);
    this.name = "SummarizationAPIError";
  }
}

export class InvalidSummarizationResponseError extends SummarizationError {
  constructor(message: string) {
    super(`Invalid summarization response: ${message}`, 32);
    this.name = "InvalidSummarizationResponseError";
  }
}

// Notion errors (40-49)
export class NotionError extends CLIError {
  constructor(message: string, exitCode: number = 40) {
    super(message, exitCode, "notion");
    this.name = "NotionError";
  }
}

export class NotionAPIError extends NotionError {
  constructor(originalError: Error) {
    super(`Notion API error: ${originalError.message}`, 41);
    this.name = "NotionAPIError";
  }
}

export class NotionDatabaseNotFoundError extends NotionError {
  constructor(databaseId: string) {
    super(`Notion database not found: ${databaseId}`, 42);
    this.name = "NotionDatabaseNotFoundError";
  }
}

// Processing errors (50-59)
export class ProcessingError extends CLIError {
  constructor(message: string, exitCode: number = 50) {
    super(message, exitCode, "processing");
    this.name = "ProcessingError";
  }
}

export class FFmpegNotFoundError extends ProcessingError {
  constructor() {
    super(
      "FFmpeg not found. Please install FFmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
      51
    );
    this.name = "FFmpegNotFoundError";
  }
}

export class FFmpegError extends ProcessingError {
  constructor(message: string) {
    super(`FFmpeg error: ${message}`, 52);
    this.name = "FFmpegError";
  }
}
