// Our own verification pass over data/lotteries.json — so the site doesn't
// rely purely on what the aggregators claim. It:
//   1. recomputes active/ended status from deadlines at check time (statuses
//      would otherwise go stale if a scrape run fails),
//   2. verifies that each non-ended item's source article and organizer/entry
//      page are actually reachable,
//   3. drops items whose source article is definitively gone (404/410/DNS),
//   4. records a per-item `verification` block for the site and for agents.
// Conservative on purpose: 403/429/5xx/timeouts are inconclusive (bot
// blocking, hiccups), only unambiguous signals count as "dead".
import fs from 'node:fs/promises';
import { todayInWarsaw } from './extract.mjs';
import { collectTagLabels, collectTagCounts } from './tags.mjs';

// Overridable so the verification pass can be exercised against a fixture.
const DATA_PATH = process.argv[2] || 'data/lotteries.json';

const USER_AGENT = 'polish-sweepstakes/0.1 (+https://github.com/110kc3/polish-sweepstakes)';
const TIMEOUT_MS = 10_000;
// Six sources mean a few hundred non-ended items per run, each costing up to
// two requests; 5 at a time made the step the slowest part of the pipeline.
const CONCURRENCY = 8;

// true = alive, false = definitively dead, null = inconclusive
async function checkUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      res.body?.cancel?.().catch(() => {});
      if (res.ok) {
        // Soft-404: some sites (fajnekonkursy) redirect removed pages to the
        // homepage with a 200. Deep path in, bare root out = page is gone.
        try {
          const requested = new URL(url);
          const landed = new URL(res.url);
          if (requested.pathname !== '/' && landed.pathname === '/') return false;
        } catch { /* keep the 200 verdict if URL parsing fails */ }
        return true;
      }
      if (res.status === 404 || res.status === 410) {
        // Some servers 404 on HEAD but serve GET; confirm before declaring dead.
        if (method === 'HEAD') continue;
        return false;
      }
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return null; // 403/429/5xx and friends: inconclusive
    } catch (e) {
      const code = e?.cause?.code || e?.code || '';
      if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') return false;
      if (method === 'HEAD') continue; // timeouts etc.: try GET once
      return null;
    }
  }
  return null;
}

function recomputeStatus(item) {
  if (!item.deadline) return 'unknown';
  // Warsaw, not UTC: the contests are Polish, and a UTC date would flip
  // same-day deadlines up to two hours early.
  return item.deadline >= todayInWarsaw() ? 'active' : 'ended';
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const data = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const items = Array.isArray(data.items) ? data.items : [];
  const checkedAt = new Date().toISOString();

  let statusChanged = 0;
  for (const it of items) {
    const status = recomputeStatus(it);
    if (status !== it.status) statusChanged++;
    it.status = status;
  }

  // Only spend network time on items the site actually shows.
  const toCheck = items.filter((it) => it.status !== 'ended');
  console.log(`Checking ${toCheck.length} non-ended items (${items.length} total)...`);

  await mapWithConcurrency(toCheck, CONCURRENCY, async (it) => {
    const sourceOk = await checkUrl(it.url);
    const target = it.links?.regulamin || it.links?.organizer;
    const organizerOk = target ? await checkUrl(target) : null;
    it.verification = { checkedAt, sourceOk, organizerOk };
  });

  // A merged item's card points at one source, but the same contest is listed
  // elsewhere. If the primary article is gone, promote a live alternative
  // instead of dropping a contest that is still published.
  const dead = toCheck.filter((it) => it.verification?.sourceOk === false);
  let promoted = 0;
  for (const it of dead) {
    for (const alt of it.alsoOn || []) {
      if (await checkUrl(alt.url) !== true) continue;
      console.log(`Promoting alternative source for ${it.id}: ${alt.id} ${alt.url}`);
      const previous = { source: it.source, url: it.url, id: it.id };
      it.alsoOn = [previous, ...(it.alsoOn || [])].filter((o) => o.id !== alt.id);
      Object.assign(it, { id: alt.id, source: alt.source, url: alt.url });
      it.verification = { ...it.verification, sourceOk: true, promotedFrom: previous.id };
      promoted++;
      break;
    }
  }

  const stillDead = toCheck.filter((it) => it.verification?.sourceOk === false);
  for (const it of stillDead) console.log(`Dropping (source article gone): ${it.id} ${it.url}`);
  const kept = items.filter((it) => it.verification?.sourceOk !== false);

  const summary = {
    checked: toCheck.length,
    sourceAlive: toCheck.filter((i) => i.verification?.sourceOk === true).length,
    sourceDeadPromoted: promoted,
    sourceDeadDropped: stillDead.length,
    organizerAlive: toCheck.filter((i) => i.verification?.organizerOk === true).length,
    organizerDead: toCheck.filter((i) => i.verification?.organizerOk === false).length,
    inconclusive: toCheck.filter((i) => i.verification?.sourceOk === null).length,
    statusChanged,
  };

  data.items = kept;
  data.checkedAt = checkedAt;
  // Dropping items changes which tags are still in use, so the legend has to be
  // rebuilt or it would advertise tags and counts the dataset no longer backs.
  if (data.tagLabels || data.tagCounts) {
    data.tagLabels = collectTagLabels(kept);
    data.tagCounts = collectTagCounts(kept);
  }
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Check summary:', JSON.stringify(summary));
  console.log(`Wrote ${DATA_PATH} with ${kept.length} items`);
}

main().catch((e) => {
  console.error('Fatal error in check:', e);
  process.exit(1);
});
