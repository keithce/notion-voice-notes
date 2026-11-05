#!/usr/bin/env bash
set -euo pipefail

# Resolve stable once so version checks and the build use the same exact image.
base_digest=$(docker buildx imagetools inspect n8nio/n8n:stable \
  --format '{{.Manifest.Digest}}')
[[ "$base_digest" =~ ^sha256:[a-f0-9]{64}$ ]]

should_build=true
if [[ "${GITHUB_EVENT_NAME:-}" == schedule ]]; then
  published_digest=$(docker buildx imagetools inspect "${IMAGE_NAME:?}:latest" \
    --format '{{index .Image.Config.Labels "io.rproj.n8n.base.digest"}}')
  if [[ "$base_digest" == "$published_digest" ]]; then
    should_build=false
  fi
fi

{
  echo "base_digest=$base_digest"
  echo "base_ref=n8nio/n8n:stable@$base_digest"
  echo "should_build=$should_build"
} >> "${GITHUB_OUTPUT:?}"
