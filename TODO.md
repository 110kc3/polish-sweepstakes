# Current queue

This is the canonical project queue. README describes operation; this file owns
accepted work, verification and the next session's handoff.

## Queue status — 2026-10-29

**All accepted Markdown tasks, feature updates, and source expansion (8 sources total) are complete.**
All 77 unit and pipeline tests and 18 Playwright Chromium browser smoke checks pass cleanly.
The build produces the static site, RSS 2.0 feed (`feed.xml`), JSON Schema (`data/schema.json`),
flat CSV export (`data/lotteries.csv`), PWA manifest (`manifest.webmanifest`), and compact AI agent digest (`data/active.md`).
The future strategic backlog is maintained in [`ROADMAP.md`](ROADMAP.md).
Post-push CI and Pages deployment for commits `b33e16e`, `70a9f58`, `b4fdd86`, and `3cca474` verified in runs 40783866469, 40785185466, 40844471540, and 40865731149.

## Current completed batch — 2026-10-29 (Source Expansion: 8 Sources End-to-End)

The owner requested expanding sources and ensuring new sources enter the tool automatically:

1. **Integrated New High-Quality Sources:**
   - **`konkursyblisko.pl` (`konkursyblisko`):** RSS feed for `kategoria-konkursu/bez-zakupu/feed/` (no-purchase contests). Parses `<content:encoded>` full descriptions and resolves `?kb_join=\d+` redirect targets to direct organizer URLs (Facebook, Instagram, organizer sites).
   - **`e-konkursy.info` (`ekonkursy`):** RSS feed (`/rss/articles`), enriched via article page extraction (`.post-item`) for exact ISO deadlines (`YYYY-MM-DD`), organizer CTA links (`Przejdź do strony z konkursem`), and official rules PDFs (`Zobacz regulamin`). Receipt/purchase lotteries filtered out via `requiresPurchase()`.
   - **`wygrajta.pl` expansion:** Added category `40` (`na-facebooku`) to capture free social media contests.

2. **Automatic Pipeline & UI Integration:**
   - **Dynamic UI Filter:** `#source` `<select>` in `site/app.js` automatically enumerates all unique `item.source` values from `data/lotteries.json`, enabling immediate dropdown filtering and URL query parameter binding (`?source=konkursyblisko`, `?source=ekonkursy`) with zero client-side code edits.
   - **Taxonomy & Tags:** Mapped native taxonomy slugs across new sources in `scripts/tags.mjs` (`gaming`, `fotografia`, `sport-i-podroze`, `spozywcze`, `zwierzeta`, `konkursy-na-facebooku`, `konkursy-na-instagramie`, `konkursy-lokalne`, `koncert`, `wejsciowki`, `kino`, `swiateczne`, `filmweb`).
   - **Social Platform Badges:** Automatic platform detection (`detectSocialPlatforms`) automatically labels Instagram, Facebook, TikTok, and YouTube entries originating from new sources.
   - **Static Build & Feeds:** Build pipeline (`scripts/build.mjs`) automatically pre-renders listings, populates RSS/Atom feeds, CSV exports, schema, and `dist/` artifacts.

3. **Verification & Quality Assurance:**
   - **Unit & Fixture Tests:** 77 tests pass in `scripts/test.mjs` and `scripts/pipeline.test.mjs` (including ISO date parsing, RSS `<content:encoded>` precedence, blocklists, and pipeline fixtures for both `konkursyblisko` and `ekonkursy`).
   - **Live Scrape & Integrity Check:** Live dataset of 213 items across 8 sources (`fajnekonkursy: 93, konkursyblisko: 10, ofree: 4, wygrajta: 15, konkursiada: 6, ekonkursy: 15, aktualnekonkursy: 67, pepper: 3`). `scripts/check.mjs` verified 186 non-ended items with 186/186 sources alive.
   - **Browser Smoke Suite:** 18 Playwright headless Chromium checks pass across viewport, filters, tracker export/import, and UI states.

## Previous completed batch — 2026-10-29 (Feature updates 3 & 4)

The owner selected Option 3 (Tracker JSON Export/Import), Option 4 (Social Platform Direct Badges), and dark dropdown filter styling to implement, and queued the remaining roadmap candidates in [`ROADMAP.md`](ROADMAP.md):

1. **Completed and verified (Personal Tracker JSON Export & Import):**
   - **JSON Backup:** Client-side export of tracked contests (`saved` and `entered`) to a timestamped JSON file with metadata.
   - **JSON Import:** Client-side file selection, format validation, union deduplication with existing local storage, real-time UI re-render, and accessible status notifications.
   - **Cross-device Mobility:** Enables users to back up, restore, or migrate tracked contests across browsers and devices without accounts or server storage.

2. **Completed and verified (Social Platform Direct Badges):**
   - **Heuristic Detection:** Added `detectSocialPlatforms()` in `scripts/extract.mjs` matching organizer/rules URLs and taxonomy tags for Instagram, Facebook, TikTok, and YouTube.
   - **Visual Badging:** Pre-rendered and hydrated badges with brand-accent styles (`badge--instagram`, `badge--facebook`, `badge--tiktok`, `badge--youtube`).
   - **Preserved Invariants:** Positioned badges cleanly inside `.badges`, preserving existing `.actions` button counts and link roles for zero test regressions.

3. **Completed and verified (Dark-aware Filter Select & Dropdown Option Styling):**
   - **Fixed White-on-White Text:** Native select dropdown popups rendered white options against light system theme backgrounds. Enforced `color-scheme: dark` at document root and `<head>` metadata, and applied opaque `var(--card)` background (`#121a33`) with `#e9ecf1` text to `.controls select`, `option`, and `optgroup`.
   - **Form Polish:** Added distinct styles for `option:checked`, optgroups (`#0b1020`), focus outlines (`var(--accent)`), checkbox accent color, and `::selection` highlighting.

4. **Completed and verified (Remaining Feature Roadmap in `ROADMAP.md`):**
   - Created canonical [`ROADMAP.md`](ROADMAP.md) with comprehensive technical specifications for queued candidates: Notification Webhooks (`scripts/notify.mjs` for Discord/Telegram), Quick-Filter Preset Chips, Offline Service Worker (`site/sw.js`), and Weekly Newsletter Digest.

### Feature verification — 2026-10-29

- Clean `npm test`: all **74 tests pass** (including `scripts/social.test.mjs` test suite covering Instagram, Facebook, TikTok, and YouTube URL/tag detection).
- Clean `npm run test:browser`: all **18 checks pass** in headless Chromium, verifying fixtures, pre-rendering, mobile 390px viewport, bookmarking, tracker JSON export, tracker JSON import with union deduplication, calendar links, sorting, URL synchronization, social badge presence, and non-transparent dark select/option filter backgrounds.
- Build: pre-rendered active listings with social badges, `dist/feed.xml`, `dist/data/lotteries.csv`, `dist/data/active.md`, `dist/data/schema.json`, and `dist/manifest.webmanifest`.
- Dependency audit: 0 reported vulnerabilities. Whitespace checks clean with CRLF files retained.
- Deployment verified: commits `b33e16e`, `70a9f58`, `b4fdd86`, and `3cca474` passed push runs [40783866469](https://github.com/110kc3/polish-sweepstakes/actions/runs/40783866469), [40785185466](https://github.com/110kc3/polish-sweepstakes/actions/runs/40785185466), [40844471540](https://github.com/110kc3/polish-sweepstakes/actions/runs/40844471540), and [40865731149](https://github.com/110kc3/polish-sweepstakes/actions/runs/40865731149) (build, test, scrape, browser smoke, and Pages deploy). Live Pages site confirmed serving HTTP 200 with dark select/option filter menus, direct social platform badging, tracker JSON backup/import, and all data syndication feeds.

## Completed batch — 2026-10-23 follow-up

The owner selected these three follow-ups to complete in parallel and push together:

1. **Completed and verified:** apply purchase-required checks to standard WordPress feeds as well as RSS/CPT.
   Accept when fixtures reject the purchase/receipt-required Coca-Cola Bolesławiec
   and Gourmet shapes from Ofree while preserving genuine free/alternative entry.
2. **Completed and verified:** fall back from a definitively dead rules PDF to a verified working organizer
   page. Accept when both pre-rendered and hydrated cards choose the verified
   alternate, retain the rules warning and never promote an inconclusive target.
3. **Completed and verified:** make browser smoke checks reproducible and required in CI. Accept when pull
   requests and deployments run deadline, entry-instruction and fetch-failure
   checks before publishing, with no live scraping required for PRs.

The three implementations were completed in parallel and verified together before
one push. Post-push CI and Pages verification passed in the runs recorded above.

### Follow-up verification — 2026-10-23

- Clean `npm ci` succeeded on Node 24.22.1; all **60 tests pass**. New fixtures cover
  the two Ofree purchase/receipt shapes, affirmative free alternatives, question
  and negated free-entry claims, positive fractional entry fees, empty-dataset
  preservation, and verified/inconclusive/dead organizer fallbacks.
- Fresh scrape: all six sources healthy, **192 records**, **166 known-active
  listings with organizer/rules URLs**, four unknown deadlines and 22 ended
  records. Generated `2026-10-23T08:58:35.425Z`; checked `08:59:33.854Z`.
  Both `ofree:10216` and `ofree:10238` are absent; the filter also excluded four
  older Ofree purchase-required promotions. Source-detail caches were invalidated
  at extraction version 6 so shared eligibility changes reach cached RSS/CPT data.
- Live checker: **170/170 non-ended source articles reachable**; 163 preferred
  organizer/rules targets reachable, one dead rules PDF and six inconclusive
  preferred targets. The Stachuriada organizer independently passed verification:
  `regulaminOk: false`, `organizerPageOk: true`, while the existing `organizerOk`
  remains false for the preferred PDF. Its pre-rendered card offers the organizer
  URL and retains the rules warning; uncertain alternates never gain that CTA.
- Build: **166 pre-rendered cards**. `npm run test:browser` passed **10 checks**
  using the pinned Playwright Chromium with no executable override: deterministic
  production-built fixtures plus the actual refreshed `dist/`. Coverage includes
  Warsaw-midnight boundaries, entry instructions, filters/search/tags, unknowns,
  mobile overflow, no-JS/JSON-LD, fetch-failure fallback and dead-rules CTA behavior.
- The workflow installs matching Chromium/Linux dependencies and requires browser
  smoke success after build, before Pages upload/deploy, including PR builds of
  checked-in data. PRs still do not scrape or publish.
- Full dependency audit: **zero reported vulnerabilities**. Workflow validation
  passed actionlint 1.7.12; whitespace checks pass with existing CRLF files retained.
- Remaining observation: four recent Wygrajta records still have no extractable
  deadline and stay outside the default active view. No further feature work is
  accepted. The outstanding feature-commit CI check has now passed.

## Previous completed batch — 2026-10-23

The owner selected all three recommendations from the project status review:

1. **Completed and verified:** clean up Pepper listings and unknown deadlines. Accept when fixture tests
   reject support threads, coupon swaps and stale undated entries while retaining
   genuine contests; unknown deadlines must not appear as known-active contests.
2. **Completed and verified:** improve entry instructions and organizer/rules links. Accept when retained
   Konkursiada cards show actual entry steps and a fresh scrape demonstrates
   improved link coverage on matching records.
3. **Completed and verified:** refresh project status and establish this canonical queue. Accept when the
   README records verified recovery and the handoff distinguishes completed work,
   pending verification and any further accepted scope.

## Previous batch verification — 2026-10-23

- Node 24.22.1: all **54 tests pass**, including source-outage preservation,
  Pepper false-positive/retention fixtures, entry-section extraction, official PDF
  rules, article cache expiry/version invalidation and browser deadline filtering.
- Fresh scrape: all six sources healthy; **199 records**, comprising **168 known
  active deadlines**, four unknown deadlines and 27 ended records. The dataset was
  generated at `2026-10-23T07:20:12.569Z` and checked at `07:21:57.771Z`.
- The Pepper feed discarded 23 discussion/swap records and four purchase/entry-fee
  records. Its three retained genuine contest announcements are ended and absent
  from the default active view. Unknown deadlines are accessible via the filter;
  undated records expire after three months, or 30 days for Pepper.
- **66 matching records gained organizer/rules links** against the October 22 live
  dataset: 65 from AktualneKonkursy and one from Ofree. This measures filled gaps on
  the same IDs rather than attributing removals to improved coverage. The final
  active view has links on **166/168 records**; all four retained Konkursiada records
  have actual entry steps. Order-number, contract and stated entry-fee requirements
  found during extraction are excluded.
- Live checker: all **172 non-ended source articles reachable**; 163 preferred
  organizer/rules targets reachable, one definitively dead and eight absent or
  inconclusive. The dead rules PDF retains the existing card warning; a reachable
  article is not a guarantee that every organizer link works.
- Build: **168 pre-rendered cards** and matching JSON-LD. Chromium passed desktop
  search, source/tag filters, unknown toggle, ended Pepper records, 390px mobile
  layout, no-JavaScript rendering and fetch-failure fallback, with no page errors.
- Production dependency audit: **zero reported vulnerabilities**. Git whitespace
  check passes with the existing CRLF browser script recognized as such.
- Post-push tests, scrape, checker, build and Pages deployment for `addfad3` passed
  in [run 39917645182](https://github.com/110kc3/polish-sweepstakes/actions/runs/39917645182).
  The snapshot job was correctly skipped for a push event.

At the previous batch's handoff, four recent Wygrajta records had no extractable
deadline, two active Ofree records had no organizer/rules links, and one Stachuriada
rules PDF was dead. Inspection during the next review established that both Ofree
records require purchases/receipts despite their free-category placement; the
completed follow-up addressed those records and the dead-PDF button behavior.

## Operational context

- Branch: `main`. Baseline reviewed: `5965a8aaa922464813115586f329c04c6510e0c0`.
- Recovery is verified: eight successful scheduled runs through October 22, including
  [run 39761128784](https://github.com/110kc3/polish-sweepstakes/actions/runs/39761128784).
  Weekly snapshots committed October 12 and 20; October 22 correctly skipped a write.
- Runtime: Node 24 LTS; `npm ci`, `npm test`, `npm run scrape`, `npm run check`,
  `npm run build`, `npm run test:browser`. Install Chromium once with
  `npx playwright install --with-deps chromium`. The checker is optional in CI;
  browser smoke is required. Source reachability does not prove
  a contest is open or eligible for free entry.
- Preserve the stable version-2 JSON shape, Warsaw deadline boundaries, source outage
  tolerance, and manual personal entry. No automated contest submissions are queued.
- No owner action or unfinished accepted implementation task remains.
