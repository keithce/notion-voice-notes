/**
 * Retry utility with exponential backoff
 */

import { verbose, warn } from "./logger.ts";

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      verbose(`Attempt ${attempt}/${opts.maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) {
        break;
      }

      if (!opts.retryableErrors(lastError)) {
        verbose(`Error not retryable: ${lastError.message}`);
        break;
      }

      warn(
        `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError!;
}

/**
 * Check if an error is likely rate-limiting related
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests")
  );
}

/**
 * Check if an error is a transient network error
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    isRateLimitError(error) ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("503") ||
    message.includes("502")
  );
}
