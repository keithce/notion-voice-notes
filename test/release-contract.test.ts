import { expect, test } from "bun:test";

const dockerfile = await Bun.file(
  new URL("../docker/Dockerfile", import.meta.url),
).text();
const workflow = await Bun.file(
  new URL("../.github/workflows/docker-publish.yml", import.meta.url),
).text();
const voiceReleaseWorkflow = await Bun.file(
  new URL("../.github/workflows/release.yml", import.meta.url),
).text();

test("the production image follows n8n stable by immutable digest", () => {
  expect(dockerfile).toMatch(
    /^FROM n8nio\/n8n:stable@sha256:[a-f0-9]{64}$/m,
  );
  expect(dockerfile).not.toContain("FROM n8nio/n8n:latest");
  expect(dockerfile).toMatch(/ARG FFMPEG_SHA256=[a-f0-9]{64}/);
  expect(dockerfile).toContain("sha256sum -c -");
});

test("every release input builds the current custom image", () => {
  for (const required of [
    "pull_request:",
    "release:",
    "workflow_dispatch:",
    "'src/**'",
    "'package.json'",
    "'bun.lock'",
    "'docker/**'",
  ]) {
    expect(workflow).toContain(required);
  }
});

test("latest is promoted only after the running image passes smoke tests", () => {
  const smoke = workflow.indexOf("name: Smoke-test the built image");
  const push = workflow.indexOf("name: Push the verified immutable image");
  const promote = workflow.indexOf("name: Promote the verified image to latest");

  expect(smoke).toBeGreaterThan(-1);
  expect(push).toBeGreaterThan(smoke);
  expect(promote).toBeGreaterThan(push);
  expect(workflow).toContain("voice-to-notion --version");
  expect(workflow).toContain("ffmpeg -version");
  expect(workflow).toContain("/healthz");
  expect(workflow).toMatch(
    /aquasec\/trivy:0\.74\.0@sha256:[a-f0-9]{64}/,
  );
});

test("pull request code never receives a package-write token", () => {
  const pullRequestJob = workflow
    .split("  validate_image:\n", 2)[1]
    ?.split("\n  publish:\n", 1)[0];
  expect(workflow).toContain("name: Validate pull-request image");
  expect(workflow).toContain("name: Publish verified image");
  expect(workflow).toContain("persist-credentials: false");
  expect(workflow).toMatch(
    /publish:\n[\s\S]*?permissions:\n\s+contents: read\n\s+packages: write/,
  );
  expect(pullRequestJob).toBeDefined();
  expect(pullRequestJob).not.toContain("packages: write");
});

test("only main can publish and all production runs serialize", () => {
  expect(workflow).toContain("n8n-image-production");
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("github.event_name != 'pull_request'");
  expect(workflow).toContain("github.run_attempt");
  expect(workflow).toContain("-attempt-${RUN_ATTEMPT}");
});

test("voice releases dispatch the image build after checksummed assets exist", () => {
  expect(voiceReleaseWorkflow).toContain("SHA256SUMS");
  expect(voiceReleaseWorkflow).toContain("workflow run docker-publish.yml");
  expect(voiceReleaseWorkflow).toContain("voice_release=");
  expect(workflow).toContain("inputs.voice_release");
  expect(workflow).not.toContain("release:\n    types: [published]");
  expect(dockerfile).toContain("sha256sum -c");
});
