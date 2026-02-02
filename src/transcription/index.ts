/**
 * Transcription provider selection and orchestration
 */

import type { AudioChunk, TranscriptionProvider, TranscriptionResult, Config } from "../types.ts";
import { transcribeWithGroq } from "./groq.ts";
import { transcribeWithOpenAI } from "./openai.ts";
import { MissingProviderKeyError } from "../utils/errors.ts";
import { verbose } from "../utils/logger.ts";

export { transcribeWithGroq } from "./groq.ts";
export { transcribeWithOpenAI } from "./openai.ts";

/**
 * Transcribe audio chunks using the specified provider
 */
export async function transcribe(
  config: Config,
  chunks: AudioChunk[],
  provider?: TranscriptionProvider
): Promise<TranscriptionResult> {
  const selectedProvider = provider || config.defaultTranscriptionProvider;
  verbose(`Using transcription provider: ${selectedProvider}`);

  let result: { text: string; duration: number };

  switch (selectedProvider) {
    case "groq": {
      if (!config.groqApiKey) {
        throw new MissingProviderKeyError("groq");
      }
      result = await transcribeWithGroq(config.groqApiKey, chunks);
      break;
    }
    case "openai": {
      if (!config.openaiApiKey) {
        throw new MissingProviderKeyError("openai");
      }
      result = await transcribeWithOpenAI(config.openaiApiKey, chunks);
      break;
    }
    default:
      throw new Error(`Unknown transcription provider: ${selectedProvider}`);
  }

  return {
    text: result.text,
    duration: result.duration,
    provider: selectedProvider,
  };
}
