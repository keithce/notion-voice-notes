# notion-voice-notes

> CLI tool to transcribe audio files and create Notion pages with AI summaries

Transform voice memos into organized Notion pages with automatic transcription, AI-powered summarization, key points extraction, and action item identification.

## Features

- **Fast Transcription** via Groq (free, fast) or OpenAI Whisper
- **AI Summarization** with Claude (titles, summaries, key points, action items)
- **Automatic Notion Pages** with structured content blocks
- **Large File Support** with automatic chunking for files over 25MB
- **JSON Output** for automation pipelines (n8n, Pipedream, etc.)
- **Standalone Binary** - no runtime dependencies needed

## Installation

### Download Binary (Recommended)

Download the pre-built binary for your platform from [GitHub Releases](https://github.com/keithce/notion-voice-notes/releases):

```bash
# macOS
curl -L https://github.com/keithce/notion-voice-notes/releases/latest/download/voice-to-notion -o voice-to-notion
chmod +x voice-to-notion

# Linux
curl -L https://github.com/keithce/notion-voice-notes/releases/latest/download/voice-to-notion-linux -o voice-to-notion
chmod +x voice-to-notion

# Windows
# Download voice-to-notion-windows.exe from the releases page
```

### Using Bun (Development)

```bash
git clone https://github.com/keithce/notion-voice-notes.git
cd notion-voice-notes
bun install
bun run start -- ./recording.mp3
```

## Configuration

Create a `.env` file or set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude summarization |
| `NOTION_API_KEY` | Yes | Notion integration token |
| `NOTION_DATABASE_ID` | Yes | Target Notion database ID |
| `GROQ_API_KEY` | If using Groq | Groq API key (default provider) |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key for Whisper |
| `TRANSCRIPTION_PROVIDER` | No | Default provider: `groq` or `openai` |

### Notion Setup

1. Create a [Notion integration](https://www.notion.so/my-integrations)
2. Share your target database with the integration
3. Copy the database ID from the database URL

## Usage

```bash
# Basic usage (uses Groq by default)
voice-to-notion ./recording.mp3

# Use OpenAI Whisper instead
voice-to-notion ./recording.mp3 -t openai

# Custom title
voice-to-notion ./recording.mp3 --title "Meeting Notes - Feb 2"

# Dry run (process without creating Notion page)
voice-to-notion ./recording.mp3 --dry-run -v

# JSON output for automation
voice-to-notion ./recording.mp3 --json
```

### Options

```
-t, --transcription     Transcription provider: "groq" | "openai" (default: groq)
--title                 Custom title for Notion page (default: AI-generated)
--database-id           Override Notion database ID
--dry-run               Process but don't create Notion page
-v, --verbose           Enable verbose logging to stderr
--json                  Output result as JSON to stdout
-h, --help              Show help message
--version               Show version number
```

## n8n / Automation Integration

Use `--json` flag to get structured output for parsing in automation tools:

```json
{
  "success": true,
  "audioFile": "./recording.mp3",
  "transcription": {
    "text": "Full transcription...",
    "duration": 125.5,
    "provider": "groq"
  },
  "summary": {
    "title": "AI-Generated Title",
    "summary": "Brief summary...",
    "mainPoints": ["Point 1", "Point 2"],
    "actionItems": ["Action 1", "Action 2"],
    "transcript": "Full text..."
  },
  "notion": {
    "pageId": "abc123",
    "url": "https://notion.so/..."
  }
}
```

## Docker Usage

```dockerfile
FROM oven/bun:latest

# Download the binary
RUN curl -L https://github.com/keithce/notion-voice-notes/releases/latest/download/voice-to-notion-linux -o /usr/local/bin/voice-to-notion \
    && chmod +x /usr/local/bin/voice-to-notion

# Your automation setup...
```

## Building from Source

```bash
# Build for current platform
bun run build

# Build for all platforms
bun run build:all

# Outputs to dist/
#   voice-to-notion         (macOS)
#   voice-to-notion-linux   (Linux)
#   voice-to-notion-windows.exe (Windows)
```

## Credits

This project was inspired by [Tom Frankly's](https://github.com/TomFrankly) excellent work:

- **Original Implementation:** [pipedream-notion-voice-notes](https://github.com/TomFrankly/pipedream-notion-voice-notes)
- **Tutorial:** [How to Transcribe Audio to Text with ChatGPT and Notion](https://thomasjfrank.com/how-to-transcribe-audio-to-text-with-chatgpt-and-notion/)

**Why this CLI exists:** The Pipedream implementation stopped working, and recreating the workflow entirely in n8n proved difficult due to the complexity of handling audio chunking, multiple API calls, and Notion formatting. This CLI provides a standalone binary that handles all the processing internally and can be called from any automation tool.

## License

MIT
