/** Exercise the installed SDKs' wire formats without calling external services. */
import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeWithGroq } from "../src/transcription/groq.ts";
import { transcribeWithOpenAI } from "../src/transcription/openai.ts";
import { summarizeWithClaude } from "../src/summarization/claude.ts";
import { createVoiceNotePage } from "../src/notion/index.ts";
import { NotionAPIError } from "../src/utils/errors.ts";

const directory = await mkdtemp(join(tmpdir(), "voice-sdk-"));
const audioPath = join(directory, "recording.wav");
await Bun.write(audioPath, new Uint8Array([82, 73, 70, 70]));
const chunks = [{ path: audioPath, index: 0, start: 0, end: 12 }];
const summary = {
  title: "Meeting notes",
  summary: "We agreed on a release.",
  main_points: ["Update dependencies"],
  action_items: ["Deploy the image"],
};
const transcription = { text: "Release tomorrow.", duration: 12, provider: "groq" as const };
const databaseId = "01234567-89ab-cdef-0123-456789abcdef";
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;

function interceptFetch(handler: (request: Request) => Promise<Response>) {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    ((input: string | Request | URL, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      // Upload helpers probe fetch's Response implementation with a data URL.
      return request.url.startsWith("data:") ? Promise.resolve(new Response("")) : handler(request);
    }) as typeof fetch,
  );
}

afterEach(() => fetchSpy?.mockRestore());
afterAll(() => rm(directory, { recursive: true, force: true }));

for (const { provider, transcribe, host, model } of [
  { provider: "groq", transcribe: transcribeWithGroq, host: "api.groq.com", model: "whisper-large-v3-turbo" },
  { provider: "openai", transcribe: transcribeWithOpenAI, host: "api.openai.com", model: "whisper-1" },
]) {
  test(`${provider} uploads audio as multipart and accepts a text transcription`, async () => {
    let calls = 0;
    interceptFetch(async (request) => {
      calls++;
      expect(new URL(request.url).hostname).toBe(host);
      expect(new URL(request.url).pathname).toEndWith("/audio/transcriptions");
      expect(request.method).toBe("POST");
      const form = await request.formData();
      expect(form.get("model")).toBe(model);
      expect(form.get("response_format")).toBe("text");
      const file = form.get("file") as File;
      expect(file.name).toBe("recording.wav");
      expect(await file.arrayBuffer()).toEqual(await Bun.file(audioPath).arrayBuffer());
      return new Response("Release tomorrow.", { headers: { "content-type": "text/plain" } });
    });
    expect(await transcribe("test-api-key", chunks)).toEqual({ text: transcription.text, duration: 12 });
    expect(calls).toBe(1);
  });
}

test("Anthropic sends the transcript and parses the summary message", async () => {
  let calls = 0;
  interceptFetch(async (request) => {
    calls++;
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    const body = await request.json() as { messages: { content: string }[]; max_tokens: number; model: string };
    expect(body.messages[0]!.content).toContain(transcription.text);
    expect(body.max_tokens).toBeGreaterThan(0);
    return Response.json({
      id: "msg_test", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: JSON.stringify(summary) }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 30 },
    });
  });
  expect(await summarizeWithClaude("test-api-key", transcription.text)).toEqual(summary);
  expect(calls).toBe(1);
});

test("Notion SDK and helper create the configured database page with its content", async () => {
  let calls = 0;
  interceptFetch(async (request) => {
    calls++;
    expect(request.url).toBe("https://api.notion.com/v1/pages");
    expect(request.method).toBe("POST");
    const body = await request.json() as { parent: { database_id: string }; properties: { Name: { title: { text: { content: string } }[] }; Type: { select: { name: string } } }; children: unknown[] };
    expect(body.parent.database_id).toBe(databaseId);
    expect(body.properties.Name.title[0]!.text.content).toBe(summary.title);
    expect(body.properties.Type.select.name).toBe("Voice Note");
    expect(JSON.stringify(body.children)).toContain(transcription.text);
    expect(JSON.stringify(body.children)).toContain(summary.action_items[0]!);
    return Response.json({ object: "page", id: databaseId, url: "https://notion.so/test-page" });
  });
  expect(await createVoiceNotePage("test-api-key", databaseId, summary, transcription))
    .toEqual({ pageId: databaseId, url: "https://notion.so/test-page" });
  expect(calls).toBe(1);
});

test("Notion responses without a page ID remain an application error", async () => {
  interceptFetch(async () => Response.json({ object: "page" }));
  await expect(createVoiceNotePage("test-api-key", databaseId, summary, transcription))
    .rejects.toBeInstanceOf(NotionAPIError);
});
