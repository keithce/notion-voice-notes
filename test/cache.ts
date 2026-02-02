/**
 * Cache management for test harness
 * Stores intermediate results to disk for resume capability
 */

import { join } from "path";

const CACHE_DIR = ".test-cache";

export type CacheStep = "audio" | "transcription" | "summarization" | "notion";

export interface CacheEntry<T = unknown> {
  timestamp: string;
  input: unknown;
  output: T;
  duration_ms: number;
}

/**
 * Get the cache file path for a step
 */
export function getCachePath(step: CacheStep): string {
  return join(process.cwd(), CACHE_DIR, `${step}.json`);
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  const dir = join(process.cwd(), CACHE_DIR);
  await Bun.write(join(dir, ".gitkeep"), "");
}

/**
 * Read cache entry for a step
 */
export async function readCache<T>(step: CacheStep): Promise<CacheEntry<T> | null> {
  const path = getCachePath(step);
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as CacheEntry<T>;
  } catch {
    return null;
  }
}

/**
 * Write cache entry for a step
 */
export async function writeCache<T>(
  step: CacheStep,
  input: unknown,
  output: T,
  duration_ms: number
): Promise<void> {
  await ensureCacheDir();

  const entry: CacheEntry<T> = {
    timestamp: new Date().toISOString(),
    input,
    output,
    duration_ms,
  };

  const path = getCachePath(step);
  await Bun.write(path, JSON.stringify(entry, null, 2));
}

/**
 * Clear cache for a specific step or all steps
 */
export async function clearCache(step?: CacheStep): Promise<string[]> {
  const steps: CacheStep[] = step
    ? [step]
    : ["audio", "transcription", "summarization", "notion"];

  const cleared: string[] = [];

  for (const s of steps) {
    const path = getCachePath(s);
    const file = Bun.file(path);

    if (await file.exists()) {
      await Bun.write(path, ""); // Clear content
      const { unlink } = await import("fs/promises");
      await unlink(path);
      cleared.push(s);
    }
  }

  return cleared;
}

/**
 * List all cache entries with their metadata
 */
export async function listCache(): Promise<
  Array<{ step: CacheStep; entry: CacheEntry | null; path: string }>
> {
  const steps: CacheStep[] = ["audio", "transcription", "summarization", "notion"];
  const results: Array<{ step: CacheStep; entry: CacheEntry | null; path: string }> = [];

  for (const step of steps) {
    const path = getCachePath(step);
    const entry = await readCache(step);
    results.push({ step, entry, path });
  }

  return results;
}

/**
 * Get cache entry for display (truncates large outputs)
 */
export async function getCacheForDisplay(step: CacheStep): Promise<{
  entry: CacheEntry | null;
  path: string;
  displayOutput: unknown;
}> {
  const path = getCachePath(step);
  const entry = await readCache(step);

  if (!entry) {
    return { entry: null, path, displayOutput: null };
  }

  // Truncate large text fields for display
  let displayOutput = entry.output;

  if (typeof displayOutput === "object" && displayOutput !== null) {
    const obj = displayOutput as Record<string, unknown>;

    // Truncate text fields
    if (typeof obj.text === "string" && obj.text.length > 500) {
      displayOutput = {
        ...obj,
        text: obj.text.substring(0, 500) + `... (${obj.text.length} chars total)`,
      };
    }
  }

  return { entry, path, displayOutput };
}
