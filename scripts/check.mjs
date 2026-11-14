import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { todayInWarsaw } from './extract.mjs';
import { collectTagLabels, collectTagCounts } from './tags.mjs';

const DATA_PATH = process.argv[2] || 'data/lotteries.json';

const USER_AGENT = 'polish-sweepstakes/0.1 (+https://github.com/110kc3/polish-sweepstakes)';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;

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
        try {
          const requested = new URL(url);
          const landed = new URL(res.url);
          if (requested.pathname !== '/' && landed.pathname === '/') {
            if (method === 'HEAD') continue;
            return false;
          }
        } catch { /* keep the 200 verdict if URL parsing fails */ }
        return true;
      }
      if (res.status === 404 || res.status === 410) {
        if (method === 'HEAD') continue;
        return false;
      }
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return null;
    } catch (e) {
      const code = e?.cause?.code || e?.code || '';
      if (code === 'ENOTFOUND') return false;
      if (method === 'HEAD') continue;
      return null;
    }
  }
  return null;
}

function recomputeStatus(item) {
  if (!item.deadline) return 'unknown';
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

export async function main(dataPath = DATA_PATH) {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const items = Array.isArray(data.items) ? data.items : [];
  const checkedAt = new Date().toISOString();

  let statusChanged = 0;
  for (const it of items) {
    const status = recomputeStatus(it);
    if (status !== it.status) statusChanged++;
    it.status = status;
  }

  const toCheck = items.filter((it) => it.status !== 'ended');
  console.log(`Checking ${toCheck.length} non-ended items (${items.length} total)...`);

  await mapWithConcurrency(toCheck, CONCURRENCY, async (it) => {
    const sourceOk = await checkUrl(it.url);
    const rules = it.links?.regulamin;
    const organizer = it.links?.organizer;
    const regulaminOk = rules ? await checkUrl(rules) : null;
    let organizerPageOk = null;
    if (organizer && (!rules || regulaminOk === false)) {
      organizerPageOk = organizer === rules ? regulaminOk : await checkUrl(organizer);
    }
    const organizerOk = rules ? regulaminOk : organizerPageOk;
    it.verification = { checkedAt, sourceOk, organizerOk, regulaminOk, organizerPageOk };
  });

  const dead = toCheck.filter((it) => it.verification?.sourceOk === false);
  let promoted = 0;
  for (const it of dead) {
    for (const alt of it.alsoOn || []) {
      if (await checkUrl(alt.url) !== true) continue;
      console.log(`Promoting alternative source for ${it.id}: ${alt.id} ${alt.url}`);
      const previous = { source: it.source, url: it.url, id: it.id };
      it.alsoOn = [previous, ...(it.alsoOn || [])].filter((o) => o.id !== alt.id);
      Object.assign(it, { id: alt.id, sourceId: alt.id.slice(alt.source.length + 1), source: alt.source, url: alt.url });
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
    organizerFallbackAlive: toCheck.filter((i) => i.verification?.regulaminOk === false && i.verification?.organizerPageOk === true).length,
    inconclusive: toCheck.filter((i) => i.verification?.sourceOk === null).length,
    statusChanged,
  };

  data.items = kept;
  data.checkedAt = checkedAt;
  if (data.tagLabels || data.tagCounts) {
    data.tagLabels = collectTagLabels(kept);
    data.tagCounts = collectTagCounts(kept);
  }
  if (!kept.length) throw new Error('Verification removed every item; keeping the unverified dataset.');
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Check summary:', JSON.stringify(summary));
  console.log(`Wrote ${dataPath} with ${kept.length} items`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => {
  console.error('Fatal error in check:', e);
  process.exit(1);
});
