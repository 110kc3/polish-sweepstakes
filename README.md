# Polish Sweepstakes & Contests (Bez Zakupu)

Daily automated aggregator tracking active sweepstakes, creative contests, and lotteries across Poland that **do not require product purchases** or receipts.

Live Website: https://110kc3.github.io/polish-sweepstakes/

## Highlights

- **Purchase-Free Filter:** Aggregates and verifies entries across 8 major Polish contest portals, enforcing strict no-purchase / alternative-free-entry rules
- **Automated Verification:** Pipeline recomputes expiration against Warsaw calendar days, detects soft-404s, and verifies official organizer rules
- **Multi-Format Exports:** Publishes static pre-rendered HTML, Schema.org JSON-LD, RSS 2.0 (`feed.xml`), CSV datasets, and Markdown digests
- **PWA & Calendar Sync:** Client-side bookmarking, Google Calendar / `.ics` reminder exports, and local backup import/export

## Quick Start

Requires Node.js 24 LTS with npm.

```bash
npm ci
npm test
npm run dev   # serves site/ + data/ at http://localhost:8080
```

Browser smoke checks (Playwright is pinned as a dev dependency):

```bash
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

Build static output into `dist/`:

```bash
npm run build
```

## Documentation

- [Accepted Worklist](TODO.md)
- [Strategic Roadmap](ROADMAP.md)
- [LLM Discovery Manifest](site/llms.txt)

## Workflow recovery

GitHub disables scheduled workflows in public repositories after 60 days without activity; the deploy workflow commits a refreshed dataset weekly to prevent that. Pages must use **GitHub Actions** as its publishing source. If the schedule is disabled:

```sh
gh workflow enable deploy.yml
gh workflow run deploy.yml --ref main
```

## Disclaimer

This site is informational only and is not affiliated with the organizers. Always verify details and the rules ("regulamin") on the source page.
