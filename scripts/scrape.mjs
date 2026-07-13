import { parse } from 'node-html-parser';
import fs from 'node:fs/promises';

const USER_AGENT = 'polish-sweepstakes/0.1 (+https://github.com/110kc3/polish-sweepstakes)';

const SOURCES = [
  {
    source: 'fajnekonkursy',
    baseUrl: 'https://fajnekonkursy.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/posts',
    categories: [88],
  },
  {
    source: 'ofree',
    baseUrl: 'https://ofree.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/posts',
    categories: [3],
  },
];

function stripText(html) {
  const root = parse(html || '');
  return root.text.trim().replace(/\s+/g, ' ');
}

const PL_MONTHS = {
  stycznia: '01', lutego: '02', marca: '03', kwietnia: '04',
  maja: '05', czerwca: '06', lipca: '07', sierpnia: '08',
  września: '09', października: '10', listopada: '11', grudnia: '12',
};

const NUMERIC_DATE = String.raw`\d{1,2}[.\-]\d{1,2}[.\-]\d{4}`;
const TEXT_DATE = String.raw`\d{1,2}\s+(?:${Object.keys(PL_MONTHS).join('|')})\s+\d{4}`;

function parsePolishDateToISO(dmy) {
  // accepts DD.MM.YYYY, DD-MM-YYYY or "DD <miesiąca> YYYY"
  const num = dmy.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  const txt = num ? null : dmy.match(/^(\d{1,2})\s+(\p{L}+)\s+(\d{4})$/u);
  if (!num && !txt) return null;
  const dd = Number(num ? num[1] : txt[1]);
  const mm = num ? Number(num[2]) : Number(PL_MONTHS[txt[2].toLowerCase()] ?? NaN);
  const yyyy = num ? num[3] : txt[3];
  if (!(dd >= 1 && dd <= 31) || !(mm >= 1 && mm <= 12)) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  // Reject impossible dates like 30.02 (Date would roll them over).
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function extractDeadline(text) {
  const t = text || '';

  // Prefer a date explicitly marked as a deadline ("do dnia ...", "zgłoszenia do ...").
  const explicit = t.match(new RegExp(
    String.raw`(?:do\s+dnia|do|w\s+terminie\s+do|zgłoszenia\s+do)\s*(${NUMERIC_DATE}|${TEXT_DATE})`, 'iu'
  ));
  if (explicit?.[1]) {
    const iso = parsePolishDateToISO(explicit[1]);
    if (iso) return iso;
  }

  // Fallback: posts often list the start date first and the end date later,
  // so take the latest date mentioned rather than the first.
  const all = [...t.matchAll(new RegExp(`${NUMERIC_DATE}|${TEXT_DATE}`, 'giu'))]
    .map(m => parsePolishDateToISO(m[0]))
    .filter(Boolean);
  if (all.length) return all.sort().at(-1);

  return null;
}

function extractPrizeSummary(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Sprawdź nagrody w źródle.';

  const prizeLine = t.match(/(Wygraj[^.!?]{0,140}[.!?])/i)?.[1];
  if (prizeLine) return prizeLine.trim();

  const money = t.match(/(nagrod[^.!?]{0,160}\b\d+[\s\u00A0]*zł[^.!?]{0,40}[.!?])/i)?.[1];
  if (money) return money.trim();

  const generic = t.match(/(nagrod[^.!?]{0,160}[.!?])/i)?.[1];
  if (generic) return generic.trim();

  return 'Sprawdź nagrody w źródle.';
}

function extractEntrySummary(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Sprawdź zasady udziału w źródle.';

  const m = t.match(/(Jak\s+wziąć\s+udział[^.!?]{0,200}[.!?])/i)?.[1];
  if (m) return m.trim();

  const generic = t.match(/(Aby\s+wziąć\s+udział[^.!?]{0,200}[.!?])/i)?.[1];
  if (generic) return generic.trim();

  return 'Sprawdź zasady udziału w źródle.';
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPostsForCategory(sourceCfg, categoryId, maxPages = 5) {
  // Keep MVP bounded to avoid heavy scraping. Increase later if needed.
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(sourceCfg.baseUrl + sourceCfg.wpPostsEndpoint);
    url.searchParams.set('categories', String(categoryId));
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,date,modified,link,title,excerpt,content');

    let batch = [];
    try {
      console.log(`Fetching: ${url.toString()}`);
      batch = await fetchJson(url.toString());
      console.log(`Fetched ${batch.length} posts from page ${page} for category ${categoryId}`);
    } catch (e) {
      console.error(`Error fetching page ${page} for category ${categoryId}:`, e);
      // Stop on page-out-of-range or transient errors to be gentle.
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);

    await new Promise(r => setTimeout(r, 500));
  }
  return items;
}

function normalizePost(source, post) {
  const excerptText = stripText(post?.excerpt?.rendered || '');
  const contentText = stripText(post?.content?.rendered || '');

  const combined = `${excerptText} ${contentText}`.trim();

  const deadline = extractDeadline(combined);
  const prizeSummary = extractPrizeSummary(combined);
  const entrySummary = extractEntrySummary(combined);

  return {
    id: `${source.source}:${post.id}`,
    source: source.source,
    sourceId: post.id,
    title: stripText(post?.title?.rendered || ''),
    url: post.link,
    publishedAt: post.date,
    modifiedAt: post.modified,
    deadline,
    status: deadline ? (new Date(deadline) >= new Date(new Date().toISOString().slice(0, 10)) ? 'active' : 'ended') : 'unknown',
    entry: {
      summary: entrySummary || 'Sprawdź zasady udziału w źródle.',
      noPurchase: 'altFreeEntry',
      noPurchaseNotes: 'Źródło znajduje się w kategorii bez zakupu / darmowe (może obejmować alternatywną metodę bezpłatną).',
    },
    prize: {
      summary: prizeSummary || 'Sprawdź nagrody w źródle.',
      value: null,
      currency: 'PLN',
    },
    extraction: {
      deadlineFound: Boolean(deadline),
    },
    lastSeenAt: new Date().toISOString(),
  };
}

async function main() {
  const now = new Date().toISOString();
  const all = [];

  for (const source of SOURCES) {
    for (const cat of source.categories) {
      const posts = await fetchAllPostsForCategory(source, cat);
      for (const p of posts) all.push(normalizePost(source, p));
    }
  }

  // Deduplicate by id
  const byId = new Map(all.map(i => [i.id, i]));
  const items = Array.from(byId.values())
    .sort((a, b) => {
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });

  const out = {
    version: 1,
    generatedAt: now,
    items,
  };

  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/lotteries.json', JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log(`Wrote data/lotteries.json with ${items.length} items`);
}

main().catch((e) => {
  console.error('Fatal error in scrape:', e);
  process.exit(1);
});
