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

function firstSentence(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const m = t.match(/^(.+?[.!?])\s/);
  return (m ? m[1] : t).trim();
}

function parsePolishDateToISO(dmy) {
  const m = dmy.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (!m) return null;
  const dd = String(m[1]).padStart(2, '0');
  const mm = String(m[2]).padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function extractDeadline(text) {
  const t = text || '';
  const patterns = [
    /(?:do\s+dnia|do|w\s+terminie\s+do|zgłoszenia\s+do)\s*(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})/i,
    /(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})\s*(?:r\.|roku)?\s*(?:włącznie)?\s*(?:do\s+godz\.|do\s+\d{1,2}:\d{2})?/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const iso = parsePolishDateToISO(m[1]);
      if (iso) return iso;
    }
  }
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