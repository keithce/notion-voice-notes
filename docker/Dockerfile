FROM n8nio/n8n:stable@sha256:cfe2704ff858395503d42548206c2c99ea351a205e941063a9d9b77b0f404478

USER root

ARG VOICE_RELEASE_PATH=latest/download

# Install ffmpeg (static build)
RUN cd /tmp && \
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Install voice-to-notion binary
RUN wget -O /usr/local/bin/voice-to-notion "https://github.com/keithce/notion-voice-notes/releases/${VOICE_RELEASE_PATH}/voice-to-notion-linux" \
    && chmod +x /usr/local/bin/voice-to-notion

USER node
