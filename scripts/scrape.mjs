import { parse } from 'node-html-parser';
import fs from 'node:fs/promises';
import {
  buildTags,
  mergeTags,
  collectTagLabels,
  collectTagCounts,
  slugify,
  TAG_KINDS,
  TAG_KIND_LABELS,
  unmappedNativeSlugs,
} from './tags.mjs';

const USER_AGENT = 'polish-sweepstakes/0.1 (+https://github.com/110kc3/polish-sweepstakes)';

const SOURCES = [
  {
    source: 'fajnekonkursy',
    type: 'wp',
    baseUrl: 'https://fajnekonkursy.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/posts',
    // 88 = bez-zakupu. Every contest on this site is tagged either 88 or 89
    // (z-zakupem), so 88 alone covers all no-purchase content.
    categories: [88],
    excludeCategories: [89],
    maxPages: 5,
    noPurchaseNotes: 'Źródło znajduje się w kategorii bez zakupu / darmowe (może obejmować alternatywną metodę bezpłatną).',
  },
  {
    source: 'ofree',
    type: 'wp',
    baseUrl: 'https://ofree.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/posts',
    categories: [3], // darmowe-konkursy
    excludeCategories: [],
    maxPages: 5,
    noPurchaseNotes: 'Źródło znajduje się w kategorii bez zakupu / darmowe (może obejmować alternatywną metodę bezpłatną).',
  },
  {
    source: 'wygrajta',
    type: 'wp',
    baseUrl: 'https://wygrajta.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/posts',
    // Creative / online-entry contest categories: artystyczne, literackie,
    // fotograficzne, plastyczne, graficzne, filmowe, książkowe, internetowe,
    // muzyczne, radiowe, dla dzieci, dla młodzieży.
    categories: [32, 26, 34, 27, 35, 33, 38, 36, 39, 28, 71, 70],
    // "konsumenckie"/"promocyjne" and the retailer/brand categories are
    // receipt-based promotions — exactly what this site must not list.
    excludeCategories: [37, 25, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 98, 99],
    // This source is mostly an archive (hundreds of posts from 2023 with no
    // stated deadline), so only the recent window is worth fetching.
    sinceMonths: 24,
    maxPages: 7,
    noPurchaseNotes: 'Kategorie twórcze/internetowe tego źródła (bez kategorii konsumenckich i promocji sklepowych) — potwierdź w regulaminie.',
  },
  {
    source: 'konkursiada',
    type: 'wp-cpt',
    baseUrl: 'https://konkursiada.pl',
    wpPostsEndpoint: '/wp-json/wp/v2/konkursy',
    maxPages: 4,
    // The site tags each contest with its entry conditions; these ones mean
    // "buy something first", so they fail the no-purchase premise outright.
    purchaseSlugs: [
      'warunki-paragon', 'warunki-zakup', 'warunki-transakcja', 'warunki-zdrapka',
      'warunki-etykieta-promocyjna', 'warunki-opakowanie-produktu-promocyjnego',
      'warunki-wieczko-opakowania', 'warunki-pieczatki',
    ],
    endedSlug: 'statusy-zakonczone',
    noPurchaseNotes: 'Konkursiada opisuje warunki udziału; pozycje wymagające paragonu, zakupu lub opakowania są odfiltrowane.',
  },
  {
    source: 'aktualnekonkursy',
    type: 'rss',
    feedUrl: 'https://aktualnekonkursy.pl/?format=feed&type=rss',
    // Item URLs carry their category: /ad/<kategoria>,<id>/<slug>,<id>
    urlCategoryPattern: /\/ad\/([^,/]+),\d+/,
    excludeUrlCategories: ['konkursy-konsumenckie'],
    noPurchaseNotes: 'Konkursy twórcze i otwarte (kategoria konsumencka odfiltrowana) — potwierdź w regulaminie.',
  },
  {
    source: 'pepper',
    type: 'rss',
    feedUrl: 'https://www.pepper.pl/rss/grupa/konkursy',
    // Community-posted contests; overwhelmingly free entry, but not editorially
    // guaranteed like the category-based sources.
    noPurchaseNotes: 'Wpis społeczności Pepper (grupa Konkursy) — zwykle udział darmowy, zawsze sprawdź zasady w źródle.',
  },
];

// Preference order when the same contest shows up on several sites: the
// editorially curated no-purchase categories win over the looser ones.
const SOURCE_PRIORITY = new Map(SOURCES.map((s, i) => [s.source, i]));

function stripText(html) {
  const root = parse(html || '');
  // .text would otherwise include inline <script>/<style> bodies, which then
  // show up in the prize/entry summaries ("(adsbygoogle = window...").
  for (const node of root.querySelectorAll('script,style,noscript')) node.remove();
  return root.text.trim().replace(/\s+/g, ' ');
}

// Links we never treat as the contest venue: share intents and media files.
const LINK_BLOCKLIST = /sharer|\/intent\/|\/share\?|wa\.me|mailto:|\.(?:jpg|jpeg|png|gif|webp|svg|pdf)(?:[?#]|$)/i;

// The aggregators themselves, plus asset hosts. Matched against the hostname
// only: these domains also turn up inside query strings (organizer links carry
// `?utm_source=konkursiada.pl`), and blocking on those would discard the very
// link we are looking for.
const BLOCKED_HOSTS = /(?:^|\.)(?:fajnekonkursy\.pl|ofree\.pl|pepper\.pl|wygrajta\.pl|konkursiada\.pl|aktualnekonkursy\.pl|gstatic\.com|googleapis\.com|googletagmanager\.com|doubleclick\.net)$/i;

function isUsableLink(href) {
  if (!/^https?:\/\//i.test(href) || LINK_BLOCKLIST.test(href)) return false;
  try {
    return !BLOCKED_HOSTS.test(new URL(href).hostname);
  } catch {
    return false;
  }
}

// Extract the organizer/entry link and (if present) a direct regulamin link
// from article HTML. These feed our own checker so we can verify contests
// at the source instead of trusting the aggregator alone.
function extractLinks(html) {
  const root = parse(html || '');
  const anchors = root.querySelectorAll('a')
    .map((a) => ({ href: a.getAttribute('href') || '', text: a.text.trim() }))
    .filter((a) => isUsableLink(a.href));

  const regulamin = anchors.find((a) => /regulamin/i.test(a.text) || /regulamin/i.test(a.href));
  const organizer = anchors.find((a) => a !== regulamin);

  return {
    organizer: organizer?.href || null,
    regulamin: regulamin?.href || null,
  };
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

async function fetchText(url, accept = 'application/rss+xml, application/xml, text/xml') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': accept,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.text();
}

const fetchHtml = (url) => fetchText(url, 'text/html,application/xhtml+xml');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function monthsAgoISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 19);
}

// An entry with no stated deadline that was published long ago is over in all
// but name: nothing on the page says when it ends, and it is far too old to
// still be running. Keeping those would bury the current contests.
const STALE_UNDATED_MONTHS = 9;

function isStaleUndated(item) {
  if (item.deadline || !item.publishedAt) return false;
  return item.publishedAt.slice(0, 19) < monthsAgoISO(STALE_UNDATED_MONTHS);
}

// WP exposes category/tag names only as numeric ids on posts, so resolve the
// taxonomies once per source and reuse the id -> slug maps for every post.
async function fetchWpTermMaps(sourceCfg) {
  const maps = { categories: new Map(), tags: new Map() };
  for (const taxonomy of ['categories', 'tags']) {
    try {
      const url = new URL(`${sourceCfg.baseUrl}/wp-json/wp/v2/${taxonomy}`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('_fields', 'id,slug');
      const terms = await fetchJson(url.toString());
      if (Array.isArray(terms)) for (const t of terms) maps[taxonomy].set(t.id, t.slug);
      console.log(`Resolved ${maps[taxonomy].size} ${taxonomy} for ${sourceCfg.source}`);
    } catch (e) {
      // Tags are a bonus; losing them costs tags, not items.
      console.error(`Could not resolve ${taxonomy} for ${sourceCfg.source}:`, e.message);
    }
    await sleep(300);
  }
  return maps;
}

// One paginated sweep per source: WP accepts a comma-separated `categories`
// (OR semantics) plus a server-side `categories_exclude`, so a source with a
// dozen categories still costs one pass instead of one pass per category.
async function fetchWpPosts(sourceCfg) {
  const items = [];
  const maxPages = sourceCfg.maxPages ?? 5;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(sourceCfg.baseUrl + sourceCfg.wpPostsEndpoint);
    if (sourceCfg.categories?.length) url.searchParams.set('categories', sourceCfg.categories.join(','));
    if (sourceCfg.excludeCategories?.length) {
      url.searchParams.set('categories_exclude', sourceCfg.excludeCategories.join(','));
    }
    if (sourceCfg.sinceMonths) url.searchParams.set('after', monthsAgoISO(sourceCfg.sinceMonths));
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,date,modified,link,title,excerpt,content,categories,tags');

    let batch = [];
    try {
      console.log(`Fetching: ${url.toString()}`);
      batch = await fetchJson(url.toString());
      console.log(`Fetched ${batch.length} posts from page ${page} for ${sourceCfg.source}`);
    } catch (e) {
      console.error(`Error fetching page ${page} for ${sourceCfg.source}:`, e.message);
      // Stop on page-out-of-range or transient errors to be gentle.
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 50) break;

    await sleep(500);
  }

  // Belt and braces: `categories_exclude` is server-side, this catches a source
  // that ignores the parameter.
  const exclude = sourceCfg.excludeCategories || [];
  return items.filter((p) => !(p.categories || []).some((c) => exclude.includes(c)));
}

// Minimal RSS 2.0 item parser (regex-based; enough for title/link/description/
// pubDate/guid/category with optional CDATA). Avoids adding an XML dependency.
function parseRssItems(xml) {
  const unwrap = (v) => v.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, (_, inner) => inner).trim();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const tag = (name) => {
      const mm = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
      return mm ? unwrap(mm[1].trim()) : '';
    };
    return {
      title: tag('title'),
      link: tag('link'),
      description: tag('description'),
      pubDate: tag('pubDate'),
      guid: tag('guid'),
      // Feeds may carry several <category> elements; all of them become tags.
      categories: [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/g)]
        .map((c) => unwrap(c[1].trim()))
        .filter(Boolean),
    };
  });
}

// Community and general-purpose feeds are not curated for the no-purchase
// premise, so drop items that clearly require buying something (receipt
// lotteries etc.). Conservative on purpose: only unambiguous phrases, and an
// explicit "bez zakupu" wins.
function requiresPurchase(text) {
  const t = (text || '').toLowerCase();
  if (/bez\s+zakupu/.test(t)) return false;
  return /paragon|dowód zakupu|dowod zakupu|kup\s+(?:produkt|dowoln|min|za|\d)|za\s+zakup|przy\s+zakupie|zeskanuj\s+paragon|skanuj\s+i\s+wygrywaj|wieczko\s+opakowania|etykiet[ęe]\s+promocyjn/.test(t);
}

async function fetchRssItems(sourceCfg) {
  console.log(`Fetching: ${sourceCfg.feedUrl}`);
  const xml = await fetchText(sourceCfg.feedUrl);
  let items = parseRssItems(xml).filter((it) => it.link && it.title);
  const total = items.length;

  const excluded = sourceCfg.excludeUrlCategories || [];
  if (excluded.length && sourceCfg.urlCategoryPattern) {
    items = items.filter((it) => {
      const cat = it.link.match(sourceCfg.urlCategoryPattern)?.[1];
      return !(cat && excluded.includes(cat));
    });
  }
  const afterCategory = items.length;

  const kept = items.filter((it) => !requiresPurchase(`${it.title} ${stripText(it.description || '')}`));
  console.log(
    `Fetched ${total} items from feed for ${sourceCfg.source} (kept ${kept.length}, ` +
    `dropped ${total - afterCategory} by category, ${afterCategory - kept.length} purchase-required)`
  );
  return kept;
}

function statusFor(deadline) {
  if (!deadline) return 'unknown';
  return new Date(deadline) >= new Date(new Date().toISOString().slice(0, 10)) ? 'active' : 'ended';
}

function normalizeRssItem(source, item) {
  const combined = stripText(item.description || '');
  const links = extractLinks(item.description || '');
  const deadline = extractDeadline(combined);
  const published = item.pubDate ? new Date(item.pubDate) : null;

  // Pepper thread URLs end with "-<threadId>", aktualnekonkursy ad URLs with
  // ",<adId>"; a leading match would grab years/prices from the slug
  // ("kalendarz-adwentowy-2025-1172087") and collide across items. Fall back
  // to guid/link.
  const sourceId = item.link.match(/[-,](\d+)\/?$/)?.[1] || item.guid || item.link;

  // Native taxonomy: pepper ships an RSS <category>, aktualnekonkursy encodes
  // the contest category in the URL.
  const nativeSlugs = item.categories.map(slugify);
  const urlCategory = source.urlCategoryPattern ? item.link.match(source.urlCategoryPattern)?.[1] : null;
  if (urlCategory) nativeSlugs.push(urlCategory);

  return {
    id: `${source.source}:${sourceId}`,
    source: source.source,
    sourceId,
    title: stripText(item.title),
    url: item.link,
    publishedAt: published && !Number.isNaN(published) ? published.toISOString() : null,
    modifiedAt: null,
    links,
    deadline,
    status: statusFor(deadline),
    tags: buildTags({ nativeSlugs, text: `${item.title} ${combined}` }),
    entry: {
      summary: extractEntrySummary(combined),
      noPurchase: 'altFreeEntry',
      noPurchaseNotes: source.noPurchaseNotes,
    },
    prize: {
      summary: extractPrizeSummary(combined),
      value: null,
      currency: 'PLN',
    },
    extraction: {
      deadlineFound: Boolean(deadline),
    },
    lastSeenAt: new Date().toISOString(),
  };
}

function normalizePost(source, post, termMaps) {
  const excerptText = stripText(post?.excerpt?.rendered || '');
  const contentText = stripText(post?.content?.rendered || '');
  const links = extractLinks(post?.content?.rendered || '');

  const combined = `${excerptText} ${contentText}`.trim();

  const deadline = extractDeadline(combined);
  const prizeSummary = extractPrizeSummary(combined);
  const entrySummary = extractEntrySummary(combined);

  const nativeSlugs = [
    ...(post.categories || []).map((id) => termMaps?.categories.get(id)),
    ...(post.tags || []).map((id) => termMaps?.tags.get(id)),
  ].filter(Boolean);

  return {
    id: `${source.source}:${post.id}`,
    source: source.source,
    sourceId: post.id,
    title: stripText(post?.title?.rendered || ''),
    url: post.link,
    publishedAt: post.date,
    modifiedAt: post.modified,
    links,
    deadline,
    status: statusFor(deadline),
    tags: buildTags({ nativeSlugs, text: combined }),
    entry: {
      summary: entrySummary || 'Sprawdź zasady udziału w źródle.',
      noPurchase: 'altFreeEntry',
      noPurchaseNotes: source.noPurchaseNotes,
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

// konkursiada keeps contests in a custom post type. The REST payload carries
// the site's whole taxonomy in `class_list` (prizes, industry, entry
// conditions, brand, status) but an empty `content`, so the article page has to
// be fetched for the deadline and the organizer link.
async function fetchCptItems(sourceCfg) {
  const items = [];
  const maxPages = sourceCfg.maxPages ?? 4;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(sourceCfg.baseUrl + sourceCfg.wpPostsEndpoint);
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,date,modified,link,title,excerpt,class_list');

    let batch = [];
    try {
      console.log(`Fetching: ${url.toString()}`);
      batch = await fetchJson(url.toString());
      console.log(`Fetched ${batch.length} entries from page ${page} for ${sourceCfg.source}`);
    } catch (e) {
      console.error(`Error fetching page ${page} for ${sourceCfg.source}:`, e.message);
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 50) break;

    await sleep(500);
  }

  const purchase = new Set(sourceCfg.purchaseSlugs || []);
  const kept = items.filter((it) => {
    const classes = it.class_list || [];
    if (sourceCfg.endedSlug && classes.includes(sourceCfg.endedSlug)) return false;
    return !classes.some((c) => purchase.has(c));
  });
  const ended = items.filter((it) => (it.class_list || []).includes(sourceCfg.endedSlug)).length;
  console.log(
    `${sourceCfg.source}: ${items.length} entries, kept ${kept.length} ` +
    `(dropped ${ended} finished, ${items.length - ended - kept.length} purchase-required)`
  );
  return kept;
}

const TAXONOMY_CLASS = /^(?:nagrody|branze|typy|warunki|firmy|statusy)-/;
const isTaxonomyClass = (cls) => TAXONOMY_CLASS.test(cls);

// The article page states the run as "<start> – <end>" in <p class="dates">.
function extractDatesFromArticle(root) {
  const el = root.querySelector('p.dates');
  if (!el) return null;
  const dates = [...el.text.matchAll(new RegExp(NUMERIC_DATE, 'g'))]
    .map((m) => parsePolishDateToISO(m[0]))
    .filter(Boolean)
    .sort();
  return dates.at(-1) || null;
}

async function fetchCptDetail(url) {
  const html = await fetchHtml(url);
  const root = parse(html);
  const deadline = extractDatesFromArticle(root);
  const article = root.querySelector('article.konkurs-post');
  const articleHtml = article?.innerHTML || '';
  return {
    deadline: deadline || extractDeadline(stripText(articleHtml)),
    links: extractLinks(articleHtml),
    text: stripText(articleHtml),
  };
}

function normalizeCptItem(source, item, detail) {
  const excerptText = stripText(item?.excerpt?.rendered || '');
  const text = `${excerptText} ${detail?.text || ''}`.trim();
  const deadline = detail?.deadline || extractDeadline(text);

  return {
    id: `${source.source}:${item.id}`,
    source: source.source,
    sourceId: item.id,
    title: stripText(item?.title?.rendered || ''),
    url: item.link,
    publishedAt: item.date,
    modifiedAt: item.modified,
    links: detail?.links || { organizer: null, regulamin: null },
    deadline,
    status: statusFor(deadline),
    // class_list mixes the site's taxonomies with WordPress plumbing
    // (post-2074, type-konkursy, hentry, …); only the taxonomy terms are tags.
    tags: detail?.tags
      ? mergeTags(detail.tags, buildTags({ nativeSlugs: (item.class_list || []).filter(isTaxonomyClass) }))
      : buildTags({ nativeSlugs: (item.class_list || []).filter(isTaxonomyClass), text }),
    entry: {
      // On a cache hit there is no article text to re-extract from, so the
      // previous run's summaries carry over.
      summary: detail?.entrySummary || extractEntrySummary(text),
      noPurchase: 'altFreeEntry',
      noPurchaseNotes: source.noPurchaseNotes,
    },
    prize: {
      summary: detail?.prizeSummary || extractPrizeSummary(text) || excerptText,
      value: null,
      currency: 'PLN',
    },
    extraction: {
      deadlineFound: Boolean(deadline),
      detailFetched: Boolean(detail),
      ...(detail ? { detailVersion: DETAIL_VERSION } : {}),
    },
    lastSeenAt: new Date().toISOString(),
  };
}

// Bump when fetchCptDetail changes what it extracts, or when a tags.mjs change
// should reach entries the source hasn't touched: cached details from older runs
// are then re-fetched instead of carrying a stale extraction forward.
const DETAIL_VERSION = 2;

// Reuse the previous run's detail extraction when the source hasn't touched the
// entry, so a daily run costs a handful of article fetches instead of all of them.
async function loadDetailCache() {
  const cache = new Map();
  try {
    const prev = JSON.parse(await fs.readFile('data/lotteries.json', 'utf8'));
    for (const it of prev.items || []) {
      if (!it.extraction?.detailFetched) continue;
      if (it.extraction.detailVersion !== DETAIL_VERSION) continue;
      cache.set(`${it.id}|${it.modifiedAt || ''}`, {
        deadline: it.deadline,
        links: it.links,
        text: '',
        entrySummary: it.entry?.summary,
        prizeSummary: it.prize?.summary,
        // The article text isn't stored, so keep the tags derived from it too —
        // otherwise a cached entry would lose its text-derived tags.
        tags: it.tags,
      });
    }
  } catch {
    // First run, or no previous dataset: nothing to reuse.
  }
  return cache;
}

const PLACEHOLDER_SUMMARY = /^Sprawdź (?:nagrody|zasady udziału) w źródle\.$/;

function bestSummary(a, b) {
  const aOk = a && !PLACEHOLDER_SUMMARY.test(a);
  const bOk = b && !PLACEHOLDER_SUMMARY.test(b);
  if (aOk && bOk) return a.length >= b.length ? a : b;
  return aOk ? a : (bOk ? b : (a || b));
}

function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The same contest is routinely listed on several of these sites. Merge on an
// exact normalised-title match only (no fuzzy matching): keep the
// highest-priority source as the card, union the tags, and take whichever
// source actually managed to extract a deadline, links and summaries.
function mergeDuplicates(items) {
  const groups = new Map();
  const singles = [];

  for (const it of items) {
    const key = titleKey(it.title);
    // Short keys are too collision-prone to merge on ("konkurs", "loteria").
    if (key.length < 12) { singles.push(it); continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const merged = [];
  let mergedCount = 0;

  for (const group of groups.values()) {
    if (group.length === 1) { merged.push(group[0]); continue; }

    group.sort((a, b) => (SOURCE_PRIORITY.get(a.source) ?? 99) - (SOURCE_PRIORITY.get(b.source) ?? 99));
    const [primary, ...rest] = group;
    const out = { ...primary, links: { ...primary.links }, entry: { ...primary.entry }, prize: { ...primary.prize } };

    out.tags = mergeTags(...group.map((i) => i.tags));
    for (const other of rest) {
      out.deadline ||= other.deadline;
      out.links.organizer ||= other.links?.organizer || null;
      out.links.regulamin ||= other.links?.regulamin || null;
      out.entry.summary = bestSummary(out.entry.summary, other.entry?.summary);
      out.prize.summary = bestSummary(out.prize.summary, other.prize?.summary);
    }
    out.status = statusFor(out.deadline);
    out.extraction = { ...out.extraction, deadlineFound: Boolean(out.deadline), mergedFrom: group.length };
    out.alsoOn = rest.map((o) => ({ source: o.source, url: o.url, id: o.id }));

    mergedCount += rest.length;
    merged.push(out);
  }

  console.log(`Merged ${mergedCount} cross-source duplicates into ${groups.size} titles`);
  return [...merged, ...singles];
}

async function main() {
  const now = new Date().toISOString();
  const detailCache = await loadDetailCache();
  const all = [];

  for (const source of SOURCES) {
    try {
      if (source.type === 'rss') {
        const items = await fetchRssItems(source);
        for (const it of items) all.push(normalizeRssItem(source, it));
      } else if (source.type === 'wp-cpt') {
        const entries = await fetchCptItems(source);
        let fetched = 0;
        let reused = 0;
        for (const entry of entries) {
          const cacheKey = `${source.source}:${entry.id}|${entry.modified || ''}`;
          let detail = detailCache.get(cacheKey);
          if (detail) {
            reused++;
          } else {
            try {
              detail = await fetchCptDetail(entry.link);
              fetched++;
              await sleep(400);
            } catch (e) {
              console.error(`Could not fetch detail for ${entry.link}:`, e.message);
              detail = null;
            }
          }
          all.push(normalizeCptItem(source, entry, detail));
        }
        console.log(`${source.source}: fetched ${fetched} article pages, reused ${reused} from previous run`);
      } else {
        const termMaps = await fetchWpTermMaps(source);
        const posts = await fetchWpPosts(source);
        for (const p of posts) all.push(normalizePost(source, p, termMaps));
      }
    } catch (e) {
      // One broken source shouldn't take down the whole scrape.
      console.error(`Error scraping source ${source.source}:`, e);
    }
  }

  const stale = all.filter(isStaleUndated);
  if (stale.length) {
    const perSource = {};
    for (const it of stale) perSource[it.source] = (perSource[it.source] || 0) + 1;
    console.log(`Dropping ${stale.length} undated entries older than ${STALE_UNDATED_MONTHS} months`, perSource);
  }
  const fresh = all.filter((it) => !isStaleUndated(it));

  // Deduplicate by id, then merge the same contest across sources.
  const byId = new Map(fresh.map(i => [i.id, i]));
  const items = mergeDuplicates(Array.from(byId.values()))
    .sort((a, b) => {
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });

  const out = {
    version: 2,
    generatedAt: now,
    // Tag legend, so the site and any agent reading this file can render and
    // filter tags without knowing scripts/tags.mjs.
    tagKinds: TAG_KINDS,
    tagKindLabels: TAG_KIND_LABELS,
    tagLabels: collectTagLabels(items),
    tagCounts: collectTagCounts(items),
    items,
  };

  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/lotteries.json', JSON.stringify(out, null, 2) + '\n', 'utf8');

  const perSource = {};
  for (const it of items) perSource[it.source] = (perSource[it.source] || 0) + 1;
  const tagged = items.filter((it) => Object.keys(it.tags || {}).length).length;
  const tagTotal = items.reduce((n, it) => n + Object.values(it.tags || {}).flat().length, 0);

  console.log(`Wrote data/lotteries.json with ${items.length} items`, perSource);
  console.log(
    `Tags: ${Object.keys(out.tagLabels).length} distinct, ${tagTotal} assignments, ` +
    `${tagged}/${items.length} items tagged (avg ${(tagTotal / (items.length || 1)).toFixed(1)})`
  );

  const unmapped = [...unmappedNativeSlugs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (unmapped.length) {
    console.log('Top unmapped native slugs (candidates for scripts/tags.mjs):',
      unmapped.map(([s, n]) => `${s}(${n})`).join(', '));
  }
}

main().catch((e) => {
  console.error('Fatal error in scrape:', e);
  process.exit(1);
});
