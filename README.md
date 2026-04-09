# Follow USTC

An AI-powered digest that tracks USTC official information, academic notices, selected academy news, technology news, and research-paper highlights, then turns them into a structured, high-signal briefing.

## What You Get

A daily or weekly digest with:

- USTC official news and notices
- Academic affairs and teaching-office announcements
- Selected academy news merged into the official section
- Selected technology news from public feeds
- Research paper highlights from public paper feeds
- Links to all original sources
- English, Chinese, or bilingual output

## Reading Experience

The digest is designed for fast scanning rather than long-form reading. A typical issue includes:

- A **Must-read / Important reminders** block for deadlines, required actions, and high-priority campus changes
- Separate sections for **USTC official** (including selected academy news), **academic affairs / notices**, **tech news**, and **research / AI frontier**
- A compact per-item format: title, one-line takeaway, a few concrete bullets, and the original link
- Short paragraphs and phone-friendly spacing

This makes Follow USTC closer to a complete campus + research briefing, not just a flat list of summaries.

## Quick Start

1. Install the skill in your agent
2. Say "set up follow USTC"
3. The agent guides you through setup conversationally

No source API keys are required. Public content is fetched centrally.

## Architecture

- `config/default-sources.json` defines the tracked sources, including academy sites merged into `official`
- `scripts/generate-feed.js` fetches source content and writes feeds
- `scripts/prepare-digest.js` bundles feeds + prompts + config for the LLM and filters academy news using `officialFilters.includeAcademies`
- `scripts/deliver.js` delivers the digest to stdout, Telegram, or email
- `prompts/` controls summary style and final digest structure

## Default Source Categories

- USTC official news and notices
- USTC academic affairs / teaching office updates
- Selected academy news inside the official section
- Public technology news feeds
- Public research paper feeds

## Academy Selection

Academy selection is configuration-driven rather than UI-driven. Add a whitelist to `~/.follow-ustc/config.json`:

```json
{
  "officialFilters": {
    "includeAcademies": ["math", "physics"]
  }
}
```

Examples:

- `[]` means hide all academy news
- `["math"]` means only show School of Mathematical Sciences news
- `["math", "physics"]` means show multiple academies

Non-academy official sources remain visible regardless of the academy whitelist.

## Installation

### Claude Code
```bash
cd ~/.claude/skills/follow-USTC/scripts && npm install
```

## Requirements

- An AI agent (Claude Code or similar)
- Internet connection

## How It Works

1. A central feed is updated on a schedule from public sources
2. Your agent fetches the feed and your local config
3. The LLM remixes the raw items into a structured digest with priority ordering
4. The digest is shown in chat or delivered via your chosen channel

## License

MIT
