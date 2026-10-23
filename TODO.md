# Current queue

This is the canonical project queue. README describes operation; this file owns
accepted work, verification and the next session's handoff.

## Accepted batch — 2026-10-23

The owner selected all three recommendations from the project status review:

1. **Completed locally:** clean up Pepper listings and unknown deadlines. Accept when fixture tests
   reject support threads, coupon swaps and stale undated entries while retaining
   genuine contests; unknown deadlines must not appear as known-active contests.
2. **Completed locally:** improve entry instructions and organizer/rules links. Accept when retained
   Konkursiada cards show actual entry steps and a fresh scrape demonstrates
   improved link coverage on matching records.
3. **Completed locally:** refresh project status and establish this canonical queue. Accept when the
   README records verified recovery and the handoff distinguishes completed work,
   pending verification and any further accepted scope.

## Local verification — 2026-10-23

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
- Post-push CI and Pages deployment for this change are **pending**, not awaited.

Known source limitations: four recent Wygrajta records still have no extractable
deadline; two active Ofree records have no extractable organizer/rules links; one
Stachuriada rules PDF is dead. These are observations, not additional accepted work.

## Next session

- After this batch is pushed, check its exact commit once at
  [Actions](https://github.com/110kc3/polish-sweepstakes/actions?query=branch%3Amain).
  Match the full SHA from the commit titled `Improve contest quality and entry details`;
  inspect tests, scrape/check, build and deployment. Queued/running means pending.
  Do not poll or dispatch another workflow merely to wait for verification.
- No additional feature work is accepted. A future improvement requires selection.

## Operational context

- Branch: `main`. Baseline reviewed: `5965a8aaa922464813115586f329c04c6510e0c0`.
- Recovery is verified: eight successful scheduled runs through October 22, including
  [run 39761128784](https://github.com/110kc3/polish-sweepstakes/actions/runs/39761128784).
  Weekly snapshots committed October 12 and 20; October 22 correctly skipped a write.
- Runtime: Node 24 LTS; `npm ci`, `npm test`, `npm run scrape`, `npm run check`,
  `npm run build`. The checker is optional in CI; source reachability does not prove
  a contest is open or eligible for free entry.
- Preserve the stable version-2 JSON shape, Warsaw deadline boundaries, source outage
  tolerance, and manual personal entry. No automated contest submissions are queued.
- No owner action currently blocks the selected batch.
