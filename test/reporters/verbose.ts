/**
 * Verbose console reporter for test harness
 * Provides formatted output for step execution
 */

const SEPARATOR = "═".repeat(64);
const THIN_SEPARATOR = "─".repeat(64);

/**
 * Print a step header
 */
export function printStepHeader(stepNum: number, name: string): void {
  console.log();
  console.log(SEPARATOR);
  console.log(` STEP ${stepNum}: ${name}`);
  console.log(SEPARATOR);
  console.log();
}

/**
 * Print input parameters
 */
export function printInput(label: string, data: unknown): void {
  console.log("Input:");
  if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      const displayValue = formatValue(value);
      console.log(`  ${key}: ${displayValue}`);
    }
  } else {
    console.log(`  ${label}: ${formatValue(data)}`);
  }
  console.log();
}

/**
 * Print progress indicator
 */
export function printProgress(message: string, success?: boolean): void {
  const indicator = success === undefined ? "..." : success ? "✓" : "✗";
  console.log(`  ${indicator} ${message}`);
}

/**
 * Print output data
 */
export function printOutput(data: unknown): void {
  console.log();
  console.log("Output:");

  if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      const displayValue = formatValue(value, 100);
      console.log(`  ${key}: ${displayValue}`);
    }
  } else {
    console.log(`  ${formatValue(data)}`);
  }
}

/**
 * Print step result
 */
export function printResult(
  success: boolean,
  duration_ms: number,
  cached: boolean,
  cachePath?: string
): void {
  console.log();
  const status = success ? "SUCCESS" : "FAILED";
  const cacheInfo = cached ? " (from cache)" : "";
  console.log(`Result: ${status}${cacheInfo} (${duration_ms}ms)`);

  if (!cached && cachePath) {
    console.log(`Cached to: ${cachePath}`);
  }
}

/**
 * Print error details
 */
export function printError(error: Error): void {
  console.log();
  console.log("Error:");
  console.log(`  ${error.name}: ${error.message}`);

  if (error.stack) {
    const stackLines = error.stack.split("\n").slice(1, 4);
    for (const line of stackLines) {
      console.log(`  ${line.trim()}`);
    }
  }
}

/**
 * Print pipeline summary
 */
export function printPipelineSummary(
  results: Array<{
    step: string;
    success: boolean;
    duration_ms: number;
    cached: boolean;
    error?: string;
  }>
): void {
  console.log();
  console.log(SEPARATOR);
  console.log(" PIPELINE SUMMARY");
  console.log(SEPARATOR);
  console.log();

  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);
  const successCount = results.filter((r) => r.success).length;

  for (const result of results) {
    const status = result.success ? "✓" : "✗";
    const cacheInfo = result.cached ? " (cached)" : "";
    console.log(
      `  ${status} ${result.step.padEnd(15)} ${result.duration_ms}ms${cacheInfo}`
    );

    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }

  console.log();
  console.log(THIN_SEPARATOR);
  console.log(`  Total: ${successCount}/${results.length} steps passed in ${totalDuration}ms`);
  console.log();
}

/**
 * Print cache list
 */
export function printCacheList(
  entries: Array<{
    step: string;
    timestamp: string | null;
    duration_ms: number | null;
    path: string;
  }>
): void {
  console.log();
  console.log("Cache Status:");
  console.log(THIN_SEPARATOR);

  for (const entry of entries) {
    if (entry.timestamp) {
      const date = new Date(entry.timestamp);
      const timeAgo = getTimeAgo(date);
      console.log(`  ${entry.step.padEnd(15)} ${timeAgo.padEnd(20)} (${entry.duration_ms}ms)`);
    } else {
      console.log(`  ${entry.step.padEnd(15)} (not cached)`);
    }
  }

  console.log();
}

/**
 * Print cache entry details
 */
export function printCacheEntry(
  step: string,
  entry: {
    timestamp: string;
    input: unknown;
    output: unknown;
    duration_ms: number;
  } | null,
  path: string
): void {
  console.log();
  console.log(`Cache: ${step}`);
  console.log(`Path: ${path}`);
  console.log(THIN_SEPARATOR);

  if (!entry) {
    console.log("  (not cached)");
    console.log();
    return;
  }

  console.log(`  Timestamp: ${entry.timestamp}`);
  console.log(`  Duration: ${entry.duration_ms}ms`);
  console.log();

  console.log("  Input:");
  printNestedObject(entry.input, 4);

  console.log();
  console.log("  Output:");
  printNestedObject(entry.output, 4);

  console.log();
}

/**
 * Print dry-run preview
 */
export function printDryRunPreview(content: string): void {
  console.log();
  console.log("DRY RUN PREVIEW:");
  console.log(THIN_SEPARATOR);
  console.log(content);
  console.log(THIN_SEPARATOR);
}

/**
 * Format a value for display
 */
function formatValue(value: unknown, maxLength = 80): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "string") {
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength)}..." (${value.length} chars)`;
    }
    return `"${value}"`;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3) {
      return `[${value.map((v) => formatValue(v, 30)).join(", ")}]`;
    }
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return `{${keys.join(", ")}}`;
  }

  return String(value);
}

/**
 * Print nested object with indentation
 */
function printNestedObject(obj: unknown, indent: number): void {
  const pad = " ".repeat(indent);

  if (typeof obj !== "object" || obj === null) {
    console.log(`${pad}${formatValue(obj)}`);
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      console.log(`${pad}${key}:`);
      printNestedObject(value, indent + 2);
    } else {
      console.log(`${pad}${key}: ${formatValue(value, 60)}`);
    }
  }
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
