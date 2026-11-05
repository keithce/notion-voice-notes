import { expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseDigest = `sha256:${"a".repeat(64)}`;
const oldDigest = `sha256:${"b".repeat(64)}`;
const resolver = new URL("../docker/resolve-n8n-base.sh", import.meta.url).pathname;

/** Run the resolver with isolated registry responses and collect its outputs. */
async function resolveBase(
  event: string,
  publishedDigest: string,
  registryFailure = false,
) {
  const directory = mkdtempSync(join(tmpdir(), "n8n-base-"));
  try {
    const docker = join(directory, "docker");
    const output = join(directory, "output");
    const calls = join(directory, "calls");
    await Bun.write(output, "");
    await Bun.write(
      docker,
      `#!/usr/bin/env bash
set -euo pipefail
echo "$4" >> "$CALLS"
if [[ "$REGISTRY_FAILURE" == true ]]; then exit 1; fi
if [[ "$4" == n8nio/n8n:stable ]]; then
  echo "$BASE_DIGEST"
else
  echo "$PUBLISHED_DIGEST"
fi
`,
    );
    chmodSync(docker, 0o755);
    const result = Bun.spawnSync(["bash", resolver], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_EVENT_NAME: event,
        GITHUB_OUTPUT: output,
        IMAGE_NAME: "ghcr.io/keithce/notion-voice-notes",
        BASE_DIGEST: baseDigest,
        PUBLISHED_DIGEST: publishedDigest,
        REGISTRY_FAILURE: String(registryFailure),
        CALLS: calls,
      },
    });
    return {
      exitCode: result.exitCode,
      output: await Bun.file(output).text(),
      calls: (await Bun.file(calls).text()).trim().split("\n"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("an unchanged upstream digest skips a scheduled rebuild", async () => {
  const result = await resolveBase("schedule", baseDigest);
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("should_build=false\n");
  expect(result.calls).toEqual([
    "n8nio/n8n:stable",
    "ghcr.io/keithce/notion-voice-notes:latest",
  ]);
});

test("a changed upstream digest rebuilds with that exact immutable base", async () => {
  const result = await resolveBase("schedule", oldDigest);
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("should_build=true\n");
  expect(result.output).toContain(`base_ref=n8nio/n8n:stable@${baseDigest}\n`);
  expect(result.output).toContain(`base_digest=${baseDigest}\n`);
});

test("source changes, pull requests, and manual runs still build an unchanged base", async () => {
  for (const event of ["push", "pull_request", "workflow_dispatch"]) {
    const result = await resolveBase(event, baseDigest);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("should_build=true\n");
    expect(result.calls).toEqual(["n8nio/n8n:stable"]);
  }
});

test("registry failures fail the run instead of looking like an unchanged base", async () => {
  const result = await resolveBase("schedule", baseDigest, true);
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toBe("");
});
