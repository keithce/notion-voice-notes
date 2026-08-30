import { expect, test } from "bun:test";

const dockerfile = await Bun.file(
  new URL("../docker/Dockerfile", import.meta.url),
).text();
const workflow = await Bun.file(
  new URL("../.github/workflows/docker-publish.yml", import.meta.url),
).text();

test("the production image follows n8n stable by immutable digest", () => {
  expect(dockerfile).toMatch(
    /^FROM n8nio\/n8n:stable@sha256:[a-f0-9]{64}$/m,
  );
  expect(dockerfile).not.toContain("FROM n8nio/n8n:latest");
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
  const promote = workflow.indexOf("name: Promote the verified image to latest");

  expect(smoke).toBeGreaterThan(-1);
  expect(promote).toBeGreaterThan(smoke);
  expect(workflow).toContain("voice-to-notion --version");
  expect(workflow).toContain("ffmpeg -version");
  expect(workflow).toContain("/healthz");
  expect(workflow).toMatch(
    /aquasec\/trivy:0\.74\.0@sha256:[a-f0-9]{64}/,
  );
});
