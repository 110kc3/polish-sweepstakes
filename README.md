# polish-sweepstakes

GitHub Pages site that **reports** current sweepstakes/lotteries in Poland that **do not require purchase**, including those that offer an **alternative free entry method**.

Live: https://110kc3.github.io/polish-sweepstakes/

- Sources (6):
  - `fajnekonkursy.pl` — WP REST, category `bez-zakupu`
  - `ofree.pl` — WP REST, category `darmowe-konkursy`
  - `wygrajta.pl` — WP REST, creative/online-entry categories from the last 24 months; `konsumenckie`, `promocyjne` and retailer categories excluded
  - `konkursiada.pl` — WP REST custom post type `konkursy`; finished entries and those whose own conditions require a receipt/purchase/packaging are excluded. Deadlines come from the article page (`p.dates`), cached between runs by the entry's `modified` date
  - `aktualnekonkursy.pl` — Joomla RSS; category `konkursy-konsumenckie` excluded
  - `pepper.pl` — Konkursy group RSS, purchase-required items filtered out
- Tags: every entry gets a `tags` object grouped by kind (`nagroda`, `mechanika`, `temat`, `marka`, `odbiorca`, `zasieg`), built from each source's native taxonomy plus keyword rules. The controlled vocabulary lives in [`scripts/tags.mjs`](scripts/tags.mjs); a scrape run logs the most frequent unmapped source slugs so it is easy to extend. The site renders them as colour-coded chips and offers a grouped tag filter
- The same contest listed on several sources is merged into one card (exact normalised-title match), unioning the tags and recording the others in `alsoOn`
- Pipeline (daily via GitHub Actions, 05:17 UTC; 06:17 Warsaw in winter / 07:17 in summer, subject to GitHub scheduling delays): `npm run scrape` → `npm run check` → `npm run build` → deploy `dist/` to Pages
- `check` is our own verification pass: recomputes statuses from deadlines, verifies that source articles and organizer/contest pages are still reachable (incl. soft-404 detection), drops dead items, and records a per-item `verification` block. If a merged item's primary article is gone but a source in its `alsoOn` list is still live, that alternative is promoted instead of dropping the contest. Accepts an optional data path (`node scripts/check.mjs some/fixture.json`) so the pass can be run against a fixture
- Active/ended boundaries are computed against the current date in **Europe/Warsaw**, in the scraper, the checker and the browser — a UTC date would move same-day deadlines by up to two hours
- Tests: `npm test` (node's built-in runner) covers extraction, tagging, merging and pipeline failure cases using local HTTP fixtures. Pull requests run tests and build the checked-in dataset without scraping or deploying
- Output: static site (listings pre-rendered, schema.org JSON-LD) + `data/lotteries.json`
- For AI agents: start at [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt)
- Local dev: install Node.js 24 LTS with npm, then run `npm ci`, `npm test`, and `npm run scrape && npm run check && npm run dev` (serves `site/` + `data/` at http://localhost:8080). `npm run build` produces the deployable site in `dist/`

## Reliability and workflow recovery

Public repositories' schedules are [disabled after 60 days without repository activity](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow). After a successful scheduled/manual deployment, the workflow commits a refreshed dataset to `main` when the checked-in snapshot is at least seven days old. This preserves real data and the article extraction cache while maintaining repository activity. Only the snapshot job has repository write permission; its `GITHUB_TOKEN` push does not trigger another workflow. A snapshot skips its write if a newer `main` commit already exists and never force-pushes.

Pages must use **GitHub Actions** as its publishing source, rather than deploying the repository root. If the schedule is disabled, restore and refresh it with:

```sh
gh workflow list --all
gh workflow enable deploy.yml
gh workflow run deploy.yml --ref main
```

Scraper requests have a 15-second timeout. A broken source is recorded in the additive `sourceHealth` metadata and the Actions summary; other sources can still publish. Empty scrapes fail before replacing the previous dataset. The checker remains optional, confirms HEAD soft-404s using GET, and treats refused connections as inconclusive. Builds reject missing/invalid/empty datasets and recompute statuses against today's Warsaw date even if checking failed. Failed builds leave the previously deployed Pages site available. Inspect the workflow summary and logs when data is stale or a source is missing.

Health check, 2026-10-05: inactivity-disabled workflow re-enabled; Pages publishing source corrected to GitHub Actions. The last observed deployment succeeded ([October 3](https://github.com/110kc3/polish-sweepstakes/actions/runs/37115400294)). A fresh local run fetched all six feeds, wrote 215 contests, verified all 187 non-ended source pages, and built 187 pre-rendered cards. All 44 tests, dependency audit (zero reported vulnerabilities), actionlint, browser filters/search/mobile/fallback checks, and isolated snapshot commit/skip checks passed on Node 24. Verification of the next pushed commit is **pending** at [Actions](https://github.com/110kc3/polish-sweepstakes/actions/workflows/deploy.yml); the next session should check it once, including deployment and weekly snapshot behavior. No separate project queue exists in this repository.

## Consuming the data

The dataset is a documented, stable contract — see [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt). A companion CLI, `sweepstakes-assistant`, uses it to rank contests by prize/effort/urgency, export deadlines to a calendar and track what you entered. It deliberately stops short of submitting entries: on current data only ~8% of live contests could be entered by a script at all, and contest rules generally require personal entry.

## Disclaimer
This site is informational only and is not affiliated with the organizers. Always verify details and the rules ("regulamin") on the source page.
