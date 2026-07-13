# polish-sweepstakes

GitHub Pages site that **reports** current sweepstakes/lotteries in Poland that **do not require purchase**, including those that offer an **alternative free entry method**.

Live: https://110kc3.github.io/polish-sweepstakes/

- Sources: fajnekonkursy.pl (category `bez-zakupu`), ofree.pl (category `darmowe-konkursy`), pepper.pl (Konkursy group RSS, purchase-required items filtered out)
- Pipeline (daily via GitHub Actions, ~06:00 Europe/Warsaw): `npm run scrape` → `npm run check` → `npm run build` → deploy `dist/` to Pages
- `check` is our own verification pass: recomputes statuses from deadlines, verifies that source articles and organizer/contest pages are still reachable (incl. soft-404 detection), drops dead items, and records a per-item `verification` block
- Output: static site (listings pre-rendered, schema.org JSON-LD) + `data/lotteries.json`
- For AI agents: start at [`llms.txt`](https://110kc3.github.io/polish-sweepstakes/llms.txt)
- Local dev: `npm run scrape && npm run dev` (serves `site/` + `data/` at http://localhost:8080)

## Disclaimer
This site is informational only and is not affiliated with the organizers. Always verify details and the rules ("regulamin") on the source page.
