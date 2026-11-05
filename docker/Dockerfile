ARG N8N_BASE_IMAGE=n8nio/n8n:stable

FROM mwader/static-ffmpeg:9.0.2-1@sha256:f5d100184884eb3e82b0eb14bb5ebf98da99826ac824989720297fb9ef21c822 AS ffmpeg

# Download and verify outside the hardened runtime, which has no install/tar.
FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS voice
ARG VOICE_RELEASE_PATH
WORKDIR /tmp
RUN wget "https://github.com/keithce/notion-voice-notes/releases/${VOICE_RELEASE_PATH}/voice-to-notion-linux" && \
    wget "https://github.com/keithce/notion-voice-notes/releases/${VOICE_RELEASE_PATH}/SHA256SUMS" && \
    grep ' voice-to-notion-linux$' SHA256SUMS > voice-to-notion-linux.sha256 && \
    sha256sum -c voice-to-notion-linux.sha256

FROM ${N8N_BASE_IMAGE}

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
COPY --from=voice --chmod=0755 /tmp/voice-to-notion-linux /usr/local/bin/voice-to-notion

USER node
