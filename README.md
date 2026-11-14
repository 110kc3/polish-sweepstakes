# Polish Sweepstakes & Contests (Bez Zakupu)

Daily automated aggregator tracking active sweepstakes, creative contests, and lotteries across Poland that **do not require product purchases** or receipts.

Live Website: https://110kc3.github.io/polish-sweepstakes/

## Highlights

- **Purchase-Free Filter:** Aggregates and verifies entries across 8 major Polish contest portals, enforcing strict no-purchase / alternative-free-entry rules
- **Automated Verification:** Pipeline recomputes expiration against Warsaw calendar days, detects soft-404s, and verifies official organizer rules
- **Multi-Format Exports:** Publishes static pre-rendered HTML, Schema.org JSON-LD, RSS 2.0 (`feed.xml`), CSV datasets, and Markdown digests
- **PWA & Calendar Sync:** Client-side bookmarking, Google Calendar / `.ics` reminder exports, and local backup import/export

## Quick Start

```bash
npm install
npm test
npm run dev
```

Build static output into `dist/`:

```bash
npm run build
```

## Documentation

- [Accepted Worklist](TODO.md)
- [Strategic Roadmap](ROADMAP.md)
- [LLM Discovery Manifest](site/llms.txt)
