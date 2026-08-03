// Pure text/HTML extraction helpers shared by the scraper and the checker.
// Kept free of network and filesystem access so scripts/test.mjs can exercise
// them directly against the shapes the real sources produce.
import { parse } from 'node-html-parser';
import { tagLabel } from './tags.mjs';

export function stripText(html) {
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

export function isUsableLink(href) {
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
export function extractLinks(html) {
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

export const NUMERIC_DATE = String.raw`\d{1,2}[.\-]\d{1,2}[.\-]\d{4}`;
const TEXT_DATE = String.raw`\d{1,2}\s+(?:${Object.keys(PL_MONTHS).join('|')})\s+\d{4}`;

export function parsePolishDateToISO(dmy) {
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

export function extractDeadline(text) {
  const t = text || '';

  // Prefer a date explicitly marked as a deadline ("do dnia ...", "zgłoszenia do ...").
  // The \b matters: without it, the "do" inside another word would qualify.
  const explicit = t.match(new RegExp(
    String.raw`(?:\bdo\s+dnia|\bw\s+terminie\s+do|\bzgłoszenia\s+do|\bdo)\s*(${NUMERIC_DATE}|${TEXT_DATE})`, 'iu'
  ));
  if (explicit?.[1]) {
    const iso = parsePolishDateToISO(explicit[1]);
    if (iso) return iso;
  }

  // Fallback: posts often list the start date first and the end date later,
  // so take the latest date mentioned rather than the first.
  const all = allDates(t);
  if (all.length) return all.at(-1);

  return null;
}

/** Every parseable date in the text, ascending. */
export function allDates(text) {
  return [...(text || '').matchAll(new RegExp(`${NUMERIC_DATE}|${TEXT_DATE}`, 'giu'))]
    .map((m) => parsePolishDateToISO(m[0]))
    .filter(Boolean)
    .sort();
}

export const PRIZE_PLACEHOLDER = 'Sprawdź nagrody w źródle.';

// Headings that start the next part of an article. A prize or entry snippet must
// stop here, otherwise it runs on into the rules section.
const SECTION_BOUNDARY = /\s(?:Zasady\s+konkursu|Jak\s+wziąć\s+udział|Aby\s+wziąć\s+udział|Do\s+dnia\b|Regulamin\b|Nagrody\s+w\s+konkursie|Konkurs\s+trwa\b|Termin\b)/i;

/**
 * Trims a snippet to something readable: cut at the next section heading, then
 * to a word boundary under the length cap. The source text often has no
 * sentence-ending punctuation at all (bulleted prize lists), so this must not
 * depend on finding a full stop — the previous version relied on the trailing
 * ".push({});" of an inline ad script to end the sentence for it.
 */
export function clip(snippet, limit = 200) {
  let t = String(snippet || '').trim();
  const boundary = t.search(SECTION_BOUNDARY);
  if (boundary > 20) t = t.slice(0, boundary).trim();
  if (t.length > limit) {
    const cut = t.lastIndexOf(' ', limit);
    t = `${t.slice(0, cut > 40 ? cut : limit).trim()}…`;
  }
  return t.replace(/[\s•·–-]+$/, '').trim();
}

export function extractPrizeSummary(text) {
  const t = cleanArticleText(text);
  if (!t) return PRIZE_PLACEHOLDER;

  const prize = t.match(/(Wygraj[^.!?]{0,200}[.!?]?)/i)?.[1]
    || t.match(/(Nagrod\w*[^.!?]{0,200}\b\d[\d\s,.]*\s*zł[^.!?]{0,40}[.!?]?)/i)?.[1]
    || t.match(/(nagrod[^.!?]{0,200}[.!?]?)/i)?.[1];

  const clipped = prize ? clip(prize) : '';
  return clipped.length > 8 ? clipped : PRIZE_PLACEHOLDER;
}

export const ENTRY_PLACEHOLDER = 'Sprawdź zasady udziału w źródle.';

// Site furniture that would otherwise be mistaken for content: fajnekonkursy
// renders a live countdown ("Konkurs kończy się za: 0 0 0 0 Dni 0 0 Godz …")
// ahead of the article body.
const NOISE = [
  /Konkurs\s+kończy\s+się\s+za:(?:\s*\d+)*(?:\s*(?:Dni|Godz|Min|Sek)(?:\s*\d+)*)+/gi,
  /\(adsbygoogle[^)]*\)[^;]*;?/gi,
];

export function cleanArticleText(text) {
  let t = (text || '').replace(/\s+/g, ' ');
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// Bullet markers the sources use for the individual entry steps.
const BULLETS = /[🔹🔸▪️•·–]\s*/g;

function tidySteps(chunk, limit = 260) {
  const steps = chunk
    .split(BULLETS)
    .map((s) => s.replace(/^[\s:;,.-]+|[\s;,]+$/g, '').trim())
    .filter((s) => s.length > 2);
  if (!steps.length) return null;
  let out = '';
  for (const step of steps) {
    const next = out ? `${out}; ${clip(step, 160)}` : clip(step, 160);
    if (next.length > limit) break;
    out = next;
  }
  out = out || clip(steps[0], limit);
  return out.endsWith('.') ? out : `${out}.`;
}

/**
 * How to enter, in the source's own words. Tries, in order of reliability:
 *   1. an explicit "Jak/Aby wziąć udział …" sentence,
 *   2. the task list the aggregators render ("… wykonaj poniższe zadania: 🔹…"),
 *   3. the first sentence built around an entry verb ("wystarczy", "napisz", …),
 *   4. a summary synthesised from the entry-mechanic tags,
 * and only then gives up. Before this, 204 of 212 live cards showed nothing but
 * the placeholder even though the article described the steps.
 */
export function extractEntrySummary(text, mechanics = []) {
  const t = cleanArticleText(text);

  if (t) {
    const explicit = t.match(/((?:Jak|Aby)\s+(?:wziąć\s+udział|dołączyć)[^.!?]{0,220}[.!?])/i)?.[1];
    if (explicit) return explicit.trim();

    // "Do dnia 16.08.2026 wykonaj poniższe zadania: 🔹wymyśl … 🔹opublikuj …"
    const taskList = t.match(
      /(?:wykonaj|spełnij)\s+(?:poniższ\w+\s+)?(?:zadani\w+|krok\w+|warunk\w+)[^:.!?]{0,60}[::]([\s\S]{0,420})/i
    )?.[1];
    if (taskList) {
      const steps = tidySteps(taskList);
      if (steps) return steps;
    }

    const verb = t.match(
      /((?:Wystarczy|Napisz|Wymyśl|Opublikuj|Dodaj|Prześlij|Wyślij|Zgłoś|Wypełnij|Zarejestruj|Polub|Zaobserwuj|Skomentuj|Odpowiedz|Nagraj|Narysuj)[^.!?]{0,220}[.!?]?)/i
    )?.[1];
    if (verb) {
      const clipped = clip(verb, 240);
      if (clipped.length > 12) return clipped;
    }
  }

  if (mechanics.length) return synthesiseEntrySummary(mechanics);
  return ENTRY_PLACEHOLDER;
}

// Last resort: the tags tell us what entering requires even when no sentence in
// the article is quotable. Better than telling the reader nothing at all.
export function synthesiseEntrySummary(mechanics) {
  const labels = mechanics.map((slug) => tagLabel(slug, 'mechanika').toLowerCase());
  if (!labels.length) return ENTRY_PLACEHOLDER;
  return `Wymagane: ${labels.join(', ')} — szczegóły i pełne zasady w źródle.`;
}

// Minimal RSS 2.0 item parser (regex-based; enough for title/link/description/
// pubDate/guid/category with optional CDATA). Avoids adding an XML dependency.
export function parseRssItems(xml) {
  const unwrap = (v) => v.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, (_, inner) => inner).trim();
  return [...(xml || '').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map((m) => {
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
export function requiresPurchase(text) {
  const t = (text || '').toLowerCase();
  if (/bez\s+zakupu/.test(t)) return false;
  return /paragon|dowód zakupu|dowod zakupu|kup\s+(?:produkt|dowoln|min|za|\d)|za\s+zakup|przy\s+zakupie|zeskanuj\s+paragon|skanuj\s+i\s+wygrywaj|wieczko\s+opakowania|etykiet[ęe]\s+promocyjn/.test(t);
}

// Every listed contest is Polish, so "today" has to be today in Warsaw. Using
// the UTC date would move the active/ended boundary by up to two hours, which
// is exactly the window in which same-day deadlines matter.
export function todayInWarsaw() {
  // 'sv-SE' formats as YYYY-MM-DD, which compares lexicographically.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

export function statusFor(deadline) {
  if (!deadline) return 'unknown';
  return deadline >= todayInWarsaw() ? 'active' : 'ended';
}

export function monthsAgoISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 19);
}

// An entry with no stated deadline that was published long ago is over in all
// but name: nothing on the page says when it ends, and it is far too old to
// still be running. Keeping those would bury the current contests.
export const STALE_UNDATED_MONTHS = 9;

export function isStaleUndated(item) {
  if (item.deadline || !item.publishedAt) return false;
  return item.publishedAt.slice(0, 19) < monthsAgoISO(STALE_UNDATED_MONTHS);
}

/**
 * Numeric id at the end of an item URL. Each feed has its own shape, so the
 * pattern is per-source: matching any trailing number would turn a slug ending
 * in a year ("...-konkurs-2026") into id "2026" and collide across items.
 */
export function sourceIdFrom(item, idPattern) {
  const link = item.link || '';
  if (idPattern) {
    const hit = link.match(idPattern)?.[1];
    if (hit) return hit;
  }
  return item.guid || link;
}

export function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Titles shorter than this are too collision-prone to merge on ("konkurs").
export const MIN_MERGE_KEY_LENGTH = 12;

const PLACEHOLDER_SUMMARY = /^Sprawdź (?:nagrody|zasady udziału) w źródle\.$/;

export function bestSummary(a, b) {
  const aOk = a && !PLACEHOLDER_SUMMARY.test(a);
  const bOk = b && !PLACEHOLDER_SUMMARY.test(b);
  if (aOk && bOk) return a.length >= b.length ? a : b;
  return aOk ? a : (bOk ? b : (a || b));
}
