/**
 * Logger utility - writes to stderr for CLI compatibility
 */

let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function isVerbose(): boolean {
  return verboseMode;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function log(message: string): void {
  console.error(`[${timestamp()}] ${message}`);
}

export function verbose(message: string): void {
  if (verboseMode) {
    console.error(`[${timestamp()}] [VERBOSE] ${message}`);
  }
}

export function error(message: string): void {
  console.error(`[${timestamp()}] [ERROR] ${message}`);
}

export function warn(message: string): void {
  console.error(`[${timestamp()}] [WARN] ${message}`);
}

export function info(message: string): void {
  console.error(`[${timestamp()}] [INFO] ${message}`);
}

export function debug(message: string): void {
  if (verboseMode) {
    console.error(`[${timestamp()}] [DEBUG] ${message}`);
  }
}

export function progress(step: string, current: number, total: number): void {
  console.error(`[${timestamp()}] [${current}/${total}] ${step}`);
}
