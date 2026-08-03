import { parse } from 'node-html-parser';
import fs from 'node:fs/promises';
import {
  MIN_MERGE_KEY_LENGTH,
  NUMERIC_DATE,
  STALE_UNDATED_MONTHS,
  bestSummary,
  extractDeadline,
  extractEntrySummary,
  extractLinks,
  extractPrizeSummary,
  isStaleUndated,
  monthsAgoISO,
  parsePolishDateToISO,
  parseRssItems,
  requiresPurchase,
  sourceIdFrom,
  statusFor,
  stripText,
  titleKey,
} from './extract.mjs';
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
    // Item URLs carry their category: /ad/<kategoria>,<id>/<slug>,<adId>
    urlCategoryPattern: /\/ad\/([^,/]+),\d+/,
    idPattern: /,(\d+)\/?$/,
    excludeUrlCategories: ['konkursy-konsumenckie'],
    noPurchaseNotes: 'Konkursy twórcze i otwarte (kategoria konsumencka odfiltrowana) — potwierdź w regulaminie.',
  },
  {
    source: 'pepper',
    type: 'rss',
    feedUrl: 'https://www.pepper.pl/rss/grupa/konkursy',
    // Thread URLs end with "-<threadId>". Thread ids are six digits or more;
    // requiring that keeps a slug ending in a year ("...-adwentowy-2025") from
    // being read as an id and colliding with every other item ending in 2025.
    idPattern: /-(\d{6,})\/?$/,
    // Community-posted contests; overwhelmingly free entry, but not editorially
    // guaranteed like the category-based sources.
    noPurchaseNotes: 'Wpis społeczności Pepper (grupa Konkursy) — zwykle udział darmowy, zawsze sprawdź zasady w źródle.',
  },
];

// Preference order when the same contest shows up on several sites: the
// editorially curated no-purchase categories win over the looser ones.
const SOURCE_PRIORITY = new Map(SOURCES.map((s, i) => [s.source, i]));

// Bump when fetchCptDetail changes what it extracts, or when a tags.mjs change
// should reach entries the source hasn't touched: cached details from older runs
// are then re-fetched instead of carrying a stale extraction forward.
const DETAIL_VERSION = 2;

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

// WP exposes category/tag names only as numeric ids on posts, so resolve the
// taxonomies once per source and reuse the id -> slug maps for every post.
// Paginated: two of these sources have close to 200 tags, and a term missing
// from the map silently costs that post a tag.
async function fetchWpTermMaps(sourceCfg) {
  const maps = { categories: new Map(), tags: new Map() };
  const MAX_TERM_PAGES = 5;

  for (const taxonomy of ['categories', 'tags']) {
    for (let page = 1; page <= MAX_TERM_PAGES; page++) {
      let terms = [];
      try {
        const url = new URL(`${sourceCfg.baseUrl}/wp-json/wp/v2/${taxonomy}`);
        url.searchParams.set('per_page', '100');
        url.searchParams.set('page', String(page));
        url.searchParams.set('_fields', 'id,slug');
        terms = await fetchJson(url.toString());
      } catch (e) {
        // Tags are a bonus; losing them costs tags, not items.
        if (page === 1) console.error(`Could not resolve ${taxonomy} for ${sourceCfg.source}:`, e.message);
        break;
      }
      if (!Array.isArray(terms) || terms.length === 0) break;
      for (const t of terms) maps[taxonomy].set(t.id, t.slug);
      if (terms.length < 100) break;
      await sleep(300);
    }
    console.log(`Resolved ${maps[taxonomy].size} ${taxonomy} for ${sourceCfg.source}`);
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

function normalizeRssItem(source, item) {
  const combined = stripText(item.description || '');
  const links = extractLinks(item.description || '');
  const deadline = extractDeadline(combined);
  const published = item.pubDate ? new Date(item.pubDate) : null;
  const sourceId = sourceIdFrom(item, source.idPattern);

  // Native taxonomy: pepper ships an RSS <category>, aktualnekonkursy encodes
  // the contest category in the URL.
  const nativeSlugs = item.categories.map(slugify);
  const urlCategory = source.urlCategoryPattern ? item.link.match(source.urlCategoryPattern)?.[1] : null;
  if (urlCategory) nativeSlugs.push(urlCategory);

  const tags = buildTags({ nativeSlugs, text: `${item.title} ${combined}` });

  return {
    id: `${source.source}:${sourceId}`,
    source: source.source,
    sourceId,
    title: stripText(item.title),
    url: item.link,
    publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
    modifiedAt: null,
    links,
    deadline,
    status: statusFor(deadline),
    tags,
    entry: {
      summary: extractEntrySummary(combined, tags.mechanika),
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

  const nativeSlugs = [
    ...(post.categories || []).map((id) => termMaps?.categories.get(id)),
    ...(post.tags || []).map((id) => termMaps?.tags.get(id)),
  ].filter(Boolean);

  const tags = buildTags({ nativeSlugs, text: combined });
  const entrySummary = extractEntrySummary(combined, tags.mechanika);

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
    tags,
    entry: {
      summary: entrySummary,
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
  const ended = items.filter((it) => (it.class_list || []).includes(sourceCfg.endedSlug)).length;
  const kept = items.filter((it) => {
    const classes = it.class_list || [];
    if (sourceCfg.endedSlug && classes.includes(sourceCfg.endedSlug)) return false;
    return !classes.some((c) => purchase.has(c));
  });
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
  // class_list mixes the site's taxonomies with WordPress plumbing
  // (post-2074, type-konkursy, hentry, …); only the taxonomy terms are tags.
  const nativeTags = buildTags({ nativeSlugs: (item.class_list || []).filter(isTaxonomyClass) });
  const tags = detail?.tags
    ? mergeTags(detail.tags, nativeTags)
    : buildTags({ nativeSlugs: (item.class_list || []).filter(isTaxonomyClass), text });

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
    // On a cache hit the article text is gone, so the tags derived from it last
    // time are merged back in rather than silently lost.
    tags,
    entry: {
      summary: detail?.entrySummary || extractEntrySummary(text, tags.mechanika),
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

/**
 * The same contest is routinely listed on several of these sites. Merge on an
 * exact normalised-title match only (no fuzzy matching): keep the
 * highest-priority source as the card, union the tags, and take whichever
 * source actually managed to extract a deadline, links and summaries.
 */
export function mergeDuplicates(items, log = console.log) {
  const groups = new Map();
  const singles = [];

  for (const it of items) {
    const key = titleKey(it.title);
    if (key.length < MIN_MERGE_KEY_LENGTH) { singles.push(it); continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const merged = [];
  let mergedCount = 0;
  let mergedTitles = 0;

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
    mergedTitles++;
    merged.push(out);
  }

  log(`Merged ${mergedCount} duplicate listings into ${mergedTitles} contests (${groups.size + singles.length} distinct titles)`);
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

// Importable for tests; only the CLI invocation runs the scrape.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scrape.mjs')) {
  main().catch((e) => {
    console.error('Fatal error in scrape:', e);
    process.exit(1);
  });
}
