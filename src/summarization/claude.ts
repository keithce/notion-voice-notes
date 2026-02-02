/**
 * Claude summarization provider
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SummarizationResult } from "../types.ts";
import {
  SummarizationAPIError,
  InvalidSummarizationResponseError,
} from "../utils/errors.ts";
import { retry, isTransientError } from "../utils/retry.ts";
import { verbose } from "../utils/logger.ts";

const SYSTEM_PROMPT = `You are an expert at analyzing voice note transcriptions and extracting key information.

Your task is to analyze the provided transcription and return a structured JSON response with:
1. A concise, descriptive title (5-10 words)
2. A brief summary (2-3 sentences)
3. Main points or key topics discussed (3-7 bullet points)
4. Any action items or follow-ups mentioned

Respond ONLY with valid JSON in this exact format:
{
  "title": "string",
  "summary": "string",
  "main_points": ["string", "string", ...],
  "action_items": ["string", "string", ...]
}

Guidelines:
- The title should capture the main topic or purpose of the voice note
- The summary should be informative but concise
- Main points should be specific and actionable where applicable
- Action items should include any tasks, deadlines, or follow-ups mentioned
- If no action items are mentioned, return an empty array
- Keep all text clear and professional`;

const USER_PROMPT = `Please analyze this voice note transcription and provide a structured summary:

<transcription>
{{TRANSCRIPTION}}
</transcription>

Remember to respond with valid JSON only.`;

/**
 * Summarize a transcription using Claude
 */
export async function summarizeWithClaude(
  apiKey: string,
  transcription: string
): Promise<SummarizationResult> {
  verbose(`Summarizing transcription (${transcription.length} characters)`);

  const client = new Anthropic({ apiKey });

  try {
    const response = await retry(
      async () => {
        return await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: USER_PROMPT.replace("{{TRANSCRIPTION}}", transcription),
            },
          ],
        });
      },
      {
        maxAttempts: 3,
        retryableErrors: isTransientError,
      }
    );

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new InvalidSummarizationResponseError("No text response from Claude");
    }

    const text = textBlock.text.trim();
    verbose(`Claude response: ${text.substring(0, 200)}...`);

    // Parse JSON response
    let result: SummarizationResult;
    try {
      // Handle potential markdown code blocks
      let jsonText = text;
      if (text.startsWith("```")) {
        jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      result = JSON.parse(jsonText);
    } catch {
      throw new InvalidSummarizationResponseError(
        `Failed to parse JSON response: ${text.substring(0, 100)}`
      );
    }

    // Validate response structure
    if (
      typeof result.title !== "string" ||
      typeof result.summary !== "string" ||
      !Array.isArray(result.main_points) ||
      !Array.isArray(result.action_items)
    ) {
      throw new InvalidSummarizationResponseError(
        "Response missing required fields"
      );
    }

    verbose(`Summary generated: "${result.title}"`);

    return result;
  } catch (error) {
    if (error instanceof InvalidSummarizationResponseError) {
      throw error;
    }
    throw new SummarizationAPIError(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
