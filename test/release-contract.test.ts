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

test("the production image accepts the resolved n8n stable digest", () => {
  expect(dockerfile).toContain("ARG N8N_BASE_IMAGE=n8nio/n8n:stable\n");
  expect(dockerfile).toContain("FROM ${N8N_BASE_IMAGE}\n");
  expect(
    workflow.match(/N8N_BASE_IMAGE=\$\{\{ needs.metadata.outputs.base_ref \}\}/g),
  ).toHaveLength(2);
  expect(workflow).toContain('n8n "$BASE_REF" --version');
  expect(dockerfile).not.toContain("FROM n8nio/n8n:latest");
  expect(dockerfile).toMatch(/ARG FFMPEG_VERSION=\d+\.\d+\.\d+/);
  expect(dockerfile).toMatch(/ARG FFMPEG_SHA256=[a-f0-9]{64}/);
  expect(dockerfile).not.toContain("ffmpeg-release-amd64-static.tar.xz");
  expect(dockerfile).toContain("sha256sum -c -");
});

test("every release input builds the current custom image", () => {
  for (const required of [
    "pull_request:",
    "push:",
    "schedule:",
    "workflow_dispatch:",
    "'src/**'",
    "'package.json'",
    "'bun.lock'",
    "'docker/**'",
  ]) {
    expect(workflow).toContain(required);
  }
});

test("scheduled runs publish only when the upstream base changes", () => {
  expect(workflow).toContain("cron: '17 * * * *'");
  expect(workflow).toContain("run: bash docker/resolve-n8n-base.sh");
  expect(workflow).toContain("if: steps.base.outputs.should_build == 'true'");
  const publishJob = workflow.split("\n  publish:\n", 2)[1];
  expect(publishJob).toContain("needs.metadata.outputs.should_build == 'true'");
});

test("latest is promoted only after the running image passes smoke tests", () => {
  const publishJob = workflow.split("\n  publish:\n", 2)[1];
  expect(publishJob).toBeDefined();

  const smoke = publishJob!.indexOf("name: Smoke-test the built image");
  const push = publishJob!.indexOf("name: Push the verified immutable image");
  const promote = publishJob!.indexOf(
    "name: Promote the verified image to latest",
  );

  expect(smoke).toBeGreaterThan(-1);
  expect(push).toBeGreaterThan(smoke);
  expect(promote).toBeGreaterThan(push);
  expect(publishJob).toContain("--prefer-index=false");
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
  expect(dockerfile).toContain("ARG VOICE_RELEASE_PATH\n");
  expect(dockerfile).not.toContain("VOICE_RELEASE_PATH=latest/download");
  expect(dockerfile).toContain("sha256sum -c");
});
