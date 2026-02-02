FROM n8nio/n8n:latest

USER root

# Install ffmpeg
RUN apk add --no-cache ffmpeg

# Install voice-to-notion binary
RUN curl -L https://github.com/keithce/notion-voice-notes/releases/latest/download/voice-to-notion-linux -o /usr/local/bin/voice-to-notion \
    && chmod +x /usr/local/bin/voice-to-notion

USER node
