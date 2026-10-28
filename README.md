# polish-sweepstakes

GitHub Pages site that **reports** current sweepstakes/lotteries in Poland that **do not require purchase**, including those that offer an **alternative free entry method**.

Live: https://110kc3.github.io/polish-sweepstakes/

Project status and accepted work: [`TODO.md`](TODO.md) is the canonical queue. All accepted implementation tasks and closeout verifications are complete; CI and Pages deployments verified through 2026-10-28.

- Sources (6):
  - `fajnekonkursy.pl` — WP REST, category `bez-zakupu`
  - `ofree.pl` — WP REST, category `darmowe-konkursy`
  - `wygrajta.pl` — WP REST, creative/online-entry categories from the last 24 months; `konsumenckie`, `promocyjne` and retailer categories excluded
  - `konkursiada.pl` — WP REST custom post type `konkursy`; finished entries and those requiring a receipt, purchase, order number, contract or promotional packaging are excluded. Deadlines come from `p.dates`; entry steps come from the article's entry section rather than its heading
  - `aktualnekonkursy.pl` — Joomla RSS; category `konkursy-konsumenckie` excluded. Current articles are fetched to recover organizer/rules links and entry instructions omitted by the feed. Purchase/order requirements and stated positive entry fees are filtered from feed and article text
  - `pepper.pl` — Konkursy group RSS; requires a contest/prize announcement, excludes support threads and coupon/renifer swaps, purchase requirements and stated positive entry fees. Yearless numeric date ranges in titles use the publication year, including winter rollover
- Purchase-required content checks also apply to the standard WordPress feeds, even when a source places an article in its free-entry category. Receipt/purchase requirements cannot be accepted solely because an article asks about or negates entry “bez zakupu”; genuine free/alternative-entry descriptions remain eligible
- Article details for Konkursiada and AktualneKonkursy are cached in the checked-in dataset for up to seven days. A changed `modified` date (where supplied) or extraction version forces a refresh; a failed detail fetch preserves the feed listing and is retried next run
- Organizer extraction resolves relative links and accepts PDF rules explicitly identified by their label, URL or nearby text. Navigation outside the contest article is excluded from article enrichment
- Tags: every entry gets a `tags` object grouped by kind (`nagroda`, `mechanika`, `temat`, `marka`, `odbiorca`, `zasieg`), built from each source's native taxonomy plus keyword rules. The controlled vocabulary lives in [`scripts/tags.mjs`](scripts/tags.mjs); a scrape run logs the most frequent unmapped source slugs so it is easy to extend. The site renders them as colour-coded chips and offers a grouped tag filter
- The same contest listed on several sources is merged into one card (exact normalised-title match), unioning the tags and recording the others in `alsoOn`
- Pipeline (daily via GitHub Actions, 05:17 UTC; 06:17 Warsaw in winter / 07:17 in summer, subject to GitHub scheduling delays): `npm run scrape` → `npm run check` → `npm run build` → `npm run test:browser` → deploy `dist/` to Pages
- `check` is our own verification pass: recomputes statuses from deadlines, verifies that source articles and organizer/contest pages are still reachable (incl. soft-404 detection), drops dead items, and records a per-item `verification` block. If a merged item's primary article is gone but a source in its `alsoOn` list is still live, that alternative is promoted instead of dropping the contest. Accepts an optional data path (`node scripts/check.mjs some/fixture.json`) so the pass can be run against a fixture
- If the rules link is definitively dead, the checker probes the organizer page separately. Cards use that alternate only when it is verified reachable and retain a rules-specific warning; if no alternate is confirmed, the source-article button remains available
- Active/ended boundaries are computed against the current date in **Europe/Warsaw**, in the scraper, the checker and the browser — a UTC date would move same-day deadlines by up to two hours
- The default **Tylko aktywne (znany termin)** view requires a known, current deadline, including in the pre-rendered HTML and JSON-LD. Recent entries with unknown deadlines remain in JSON and can be viewed by unchecking the filter. Undated entries expire after three months, or 30 days for Pepper; undated Pepper records also require a valid publication date
- Tests: `npm test` (node's built-in runner) covers extraction, tagging, merging and pipeline failure cases using local HTTP fixtures. `npm run test:browser` runs Chromium smoke checks. Pull requests test and build the checked-in dataset without scraping or deploying; browser checks are required after the build and before Pages upload/deployment
- Output: static site (listings pre-rendered, schema.org JSON-LD), `feed.xml` (RSS 2.0), `data/lotteries.json`, `data/schema.json`, `data/lotteries.csv`, and `data/active.md`
- Features: calendar export (.ics & Google Calendar), localStorage bookmarks & submission tracking, flexible sorting (deadline, date, prize value, title), deep-linkable URLs, PWA manifest, and alternative free entry callouts
- For AI agents: start at [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt) or [`llms-full.txt`](https://110kc3.github.io/polish-sweepstakes/llms-full.txt)
- Local dev: install Node.js 24 LTS with npm, then run `npm ci`, `npm test`, and `npm run scrape && npm run check && npm run dev` (serves `site/` + `data/` at http://localhost:8080). `npm run build` produces the deployable site in `dist/`
- Browser setup: after `npm ci`, run `npx playwright install --with-deps chromium`, `npm run build`, and `npm run test:browser`. Playwright is pinned as a development dependency; CI installs the matching Chromium and Linux dependencies

## Reliability and workflow recovery

Public repositories' schedules are [disabled after 60 days without repository activity](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow). After a successful scheduled/manual deployment, the workflow commits a refreshed dataset to `main` when the checked-in snapshot is at least seven days old. This preserves real data and the article extraction cache while maintaining repository activity. Only the snapshot job has repository write permission; its `GITHUB_TOKEN` push does not trigger another workflow. A snapshot skips its write if a newer `main` commit already exists and never force-pushes.

Pages must use **GitHub Actions** as its publishing source, rather than deploying the repository root. If the schedule is disabled, restore and refresh it with:

```sh
gh workflow list --all
gh workflow enable deploy.yml
gh workflow run deploy.yml --ref main
```

Scraper requests have a 15-second timeout. A broken source is recorded in the additive `sourceHealth` metadata and the Actions summary; other sources can still publish. Empty scrapes fail before replacing the previous dataset. The checker remains optional, confirms HEAD soft-404s using GET, and treats refused connections as inconclusive. Builds reject missing/invalid/empty datasets and recompute statuses against today's Warsaw date even if checking failed. Failed builds leave the previously deployed Pages site available. Inspect the workflow summary and logs when data is stale or a source is missing.

Recovery, 2026-10-05: inactivity-disabled workflow re-enabled; Pages publishing source corrected to GitHub Actions. The local recovery pass fetched all six feeds and passed 44 tests, dependency audit, actionlint and browser checks on Node 24.

Recovery verified, 2026-10-23: the latest eight scheduled runs succeeded through the [October 22 run](https://github.com/110kc3/polish-sweepstakes/actions/runs/39761128784), including tests, checking, build and Pages deployment at commit `5965a8a`. Weekly dataset commits were created on October 12 and 20; the October 22 snapshot correctly skipped a premature write. The subsequent quality improvements at `addfad3` also passed tests, scraping, checking, building and [Pages deployment](https://github.com/110kc3/polish-sweepstakes/actions/runs/39917645182). The follow-up at `be8215b` passed its [push run](https://github.com/110kc3/polish-sweepstakes/actions/runs/39929020491) and [subsequent scheduled run](https://github.com/110kc3/polish-sweepstakes/actions/runs/39936370361), including the required browser gate and Pages deployment. The scheduled snapshot correctly skipped an early write.

Quality pass, 2026-10-23: all 54 tests and Chromium desktop/mobile/fallback checks passed on Node 24. A fresh six-source scrape produced 168 known-active listings; 166 have organizer/rules links, with 66 gaps filled on matching records from the October 22 dataset. All four retained Konkursiada listings now show entry steps. Four unknown deadlines remain available outside the default active view. The live checker confirmed all 172 non-ended source articles; one dead rules PDF retains the existing warning. Full evidence and source limitations are in [`TODO.md`](TODO.md).

Follow-up, 2026-10-23: all 60 tests and 10 reproducible browser checks passed against fixtures and the refreshed build. Applying purchase checks to WordPress content removed the two active Ofree receipt promotions and four older paid promotions. The local verification snapshot had 166 known-active listings, all with organizer/rules URLs; the Stachuriada card used its verified organizer page while warning about the dead rules PDF. All six sources and 170 non-ended source articles passed that live check. Browser smoke is now a required PR/deployment gate. All accepted work and feature-commit verification are complete.

Closeout verified, 2026-10-28: the documentation closeout at commit `4cad13c` passed its [push run](https://github.com/110kc3/polish-sweepstakes/actions/runs/39968012124), followed by five consecutive successful daily scheduled runs through the [October 28 run](https://github.com/110kc3/polish-sweepstakes/actions/runs/40679196498). The subsequent quality update at `6de907b` (adding console/music tag taxonomy and refreshing verified data) also passed tests, scraping, checking, building, browser smoke, and Pages deployment in [push run 40773452554](https://github.com/110kc3/polish-sweepstakes/actions/runs/40773452554). Documentation sync at `cf2ae77` passed [run 40773928301](https://github.com/110kc3/polish-sweepstakes/actions/runs/40773928301).

Feature update (Phases 1 & 2), 2026-10-28: all 67 tests and 15 reproducible Chromium browser smoke checks passed. Added RSS 2.0 feed (`dist/feed.xml`), calendar export (.ics and Google Calendar), localStorage personal contest tracking (saved & entered), flexible sorting (deadline, published date, prize value, title), deep-linking URL synchronization, Alternative Method of Entry (AMoE) visual badging, numeric prize value extraction (`prize.value` in PLN across 57% of contests), formal JSON Schema contract (`data/schema.json`), flat CSV export (`data/lotteries.csv`), PWA manifest (`manifest.webmanifest`), and compact AI agent digest (`dist/data/active.md`). Verified deployment at commit `b33e16e` in [push run 40783866469](https://github.com/110kc3/polish-sweepstakes/actions/runs/40783866469).

## Consuming the data

The dataset is a documented, stable contract — see [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt). A companion CLI, `sweepstakes-assistant`, uses it to rank contests by prize/effort/urgency, export deadlines to a calendar and track what you entered. It deliberately stops short of submitting entries: on current data only ~8% of live contests could be entered by a script at all, and contest rules generally require personal entry.

## Disclaimer
This site is informational only and is not affiliated with the organizers. Always verify details and the rules ("regulamin") on the source page.
