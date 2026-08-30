FROM n8nio/n8n:stable@sha256:cfe2704ff858395503d42548206c2c99ea351a205e941063a9d9b77b0f404478

USER root

ARG VOICE_RELEASE_PATH=latest/download
ARG FFMPEG_SHA256=abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67

# Install ffmpeg (static build)
RUN cd /tmp && \
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    echo "${FFMPEG_SHA256}  ffmpeg-release-amd64-static.tar.xz" | sha256sum -c - && \
    tar xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Install the release binary only when it matches the separately published
# checksum manifest from the same immutable GitHub release.
RUN cd /tmp && \
    wget "https://github.com/keithce/notion-voice-notes/releases/${VOICE_RELEASE_PATH}/voice-to-notion-linux" && \
    wget "https://github.com/keithce/notion-voice-notes/releases/${VOICE_RELEASE_PATH}/SHA256SUMS" && \
    grep ' voice-to-notion-linux$' SHA256SUMS > voice-to-notion-linux.sha256 && \
    sha256sum -c voice-to-notion-linux.sha256 && \
    install -m 0755 voice-to-notion-linux /usr/local/bin/voice-to-notion && \
    rm -f voice-to-notion-linux voice-to-notion-linux.sha256 SHA256SUMS

USER node
