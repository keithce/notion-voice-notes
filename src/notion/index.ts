/**
 * Notion page creation using notion-helper
 */

import { Client } from "@notionhq/client";
import { createPage } from "notion-helper";
import type {
  NotionPageResult,
  SummarizationResult,
  TranscriptionResult,
} from "../types.ts";
import { buildVoiceNoteBlocks } from "./blocks.ts";
import { NotionAPIError, NotionDatabaseNotFoundError } from "../utils/errors.ts";
import { retry, isTransientError } from "../utils/retry.ts";
import { verbose } from "../utils/logger.ts";

export { buildVoiceNoteBlocks, buildPreviewContent } from "./blocks.ts";

/**
 * Create a Notion page with voice note content
 */
export async function createVoiceNotePage(
  notionApiKey: string,
  databaseId: string,
  summary: SummarizationResult,
  transcription: TranscriptionResult
): Promise<NotionPageResult> {
  verbose(`Creating Notion page: "${summary.title}"`);

  const client = new Client({ auth: notionApiKey });

  // Build page content
  const page = buildVoiceNoteBlocks(summary, transcription, databaseId);

  try {
    const response = await retry(
      async () => {
        return await createPage({
          data: page.content,
          client,
        });
      },
      {
        maxAttempts: 3,
        retryableErrors: (error) => {
          // Check for database not found error
          if (
            error.message.includes("Could not find database") ||
            error.message.includes("object_not_found")
          ) {
            return false; // Don't retry this
          }
          return isTransientError(error);
        },
      }
    );

    // Extract page ID and URL from response
    // notion-helper returns { apiResponse: { id, url, ... } } or an array
    const apiResponse = (response as any).apiResponse;
    const firstResponse = apiResponse || (Array.isArray(response) ? response[0] : response);

    if (!firstResponse?.id) {
      throw new NotionAPIError(new Error("No page ID in response"));
    }

    const pageId = firstResponse.id;
    const url = firstResponse.url || `https://notion.so/${pageId.replace(/-/g, "")}`;

    verbose(`Page created: ${url}`);

    return { pageId, url };
  } catch (error) {
    if (error instanceof NotionAPIError || error instanceof NotionDatabaseNotFoundError) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("Could not find database") ||
      errorMessage.includes("object_not_found")
    ) {
      throw new NotionDatabaseNotFoundError(databaseId);
    }

    throw new NotionAPIError(
      error instanceof Error ? error : new Error(errorMessage)
    );
  }
}
