FROM n8nio/n8n:latest

USER root

# Install ffmpeg (static build)
RUN cd /tmp && \
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Install voice-to-notion binary
RUN curl -L https://github.com/keithce/notion-voice-notes/releases/latest/download/voice-to-notion-linux -o /usr/local/bin/voice-to-notion \
    && chmod +x /usr/local/bin/voice-to-notion

USER node
