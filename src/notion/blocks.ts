/**
 * Notion block builders using notion-helper
 */

import { createNotionBuilder, block } from "notion-helper";
import type { SummarizationResult, TranscriptionResult } from "../types.ts";

/**
 * Build page content blocks for a voice note
 */
export function buildVoiceNoteBlocks(
  summary: SummarizationResult,
  transcription: TranscriptionResult,
  databaseId: string
) {
  // notion-helper uses a fluent interface without strict types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notionBuilder = createNotionBuilder as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blockHelper = block as any;

  let builder = notionBuilder({
    limitChildren: false,
  })
    .parentDatabase(databaseId)
    .icon("🤖")
    .title("Name", summary.title)
    .select("Type", "Voice Note")
    // Summary section
    .heading2("Summary")
    .paragraph(summary.summary);

  // Main points section
  if (summary.main_points.length > 0) {
    builder = builder.heading2("Key Points");
    for (const point of summary.main_points) {
      builder = builder.bulletedListItem(point);
    }
  }

  // Action items section
  if (summary.action_items.length > 0) {
    builder = builder.heading2("Action Items");
    for (const item of summary.action_items) {
      builder = builder.toDo(item, false);
    }
  }

  // Transcript section with content inside toggle
  builder = builder
    .heading2("Full Transcript")
    .toggle({
      rich_text: "Click to expand transcript",
      children: [blockHelper.paragraph.createBlock(transcription.text)],
    });

  // Metadata section
  const durationMinutes = Math.round(transcription.duration / 60);
  const metadata = `Duration: ${durationMinutes} minutes | Provider: ${transcription.provider}`;
  builder = builder.divider().paragraph(metadata);

  return builder.build();
}

/**
 * Build a simple page for dry-run preview
 */
export function buildPreviewContent(
  summary: SummarizationResult,
  transcription: TranscriptionResult
): string {
  const lines: string[] = [];

  lines.push(`# ${summary.title}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(summary.summary);
  lines.push("");

  if (summary.main_points.length > 0) {
    lines.push("## Key Points");
    for (const point of summary.main_points) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  if (summary.action_items.length > 0) {
    lines.push("## Action Items");
    for (const item of summary.action_items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  lines.push("## Full Transcript");
  lines.push(transcription.text);
  lines.push("");

  const durationMinutes = Math.round(transcription.duration / 60);
  lines.push("---");
  lines.push(
    `Duration: ${durationMinutes} minutes | Provider: ${transcription.provider}`
  );

  return lines.join("\n");
}
