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
- Pipeline (daily via GitHub Actions, ~06:00 Europe/Warsaw): `npm run scrape` → `npm run check` → `npm run build` → deploy `dist/` to Pages
- `check` is our own verification pass: recomputes statuses from deadlines, verifies that source articles and organizer/contest pages are still reachable (incl. soft-404 detection), drops dead items, and records a per-item `verification` block. If a merged item's primary article is gone but a source in its `alsoOn` list is still live, that alternative is promoted instead of dropping the contest. Accepts an optional data path (`node scripts/check.mjs some/fixture.json`) so the pass can be run against a fixture
- Active/ended boundaries are computed against the current date in **Europe/Warsaw**, in the scraper, the checker and the browser — a UTC date would move same-day deadlines by up to two hours
- Tests: `npm test` (node's built-in runner, no dependencies) covers the pure extraction, tagging and merge logic in [`scripts/extract.mjs`](scripts/extract.mjs), [`scripts/tags.mjs`](scripts/tags.mjs) and `mergeDuplicates`
- Output: static site (listings pre-rendered, schema.org JSON-LD) + `data/lotteries.json`
- For AI agents: start at [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt)
- Local dev: `npm run scrape && npm run dev` (serves `site/` + `data/` at http://localhost:8080)

## Consuming the data

The dataset is a documented, stable contract — see [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt). A companion CLI, `sweepstakes-assistant`, uses it to rank contests by prize/effort/urgency, export deadlines to a calendar and track what you entered. It deliberately stops short of submitting entries: on current data only ~8% of live contests could be entered by a script at all, and contest rules generally require personal entry.

## Disclaimer
This site is informational only and is not affiliated with the organizers. Always verify details and the rules ("regulamin") on the source page.
