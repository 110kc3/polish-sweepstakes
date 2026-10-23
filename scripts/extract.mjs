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
  // HTML textContent joins adjacent paragraphs/headings without a separator.
  // Keep entry steps and section headings from becoming one word.
  for (const node of root.querySelectorAll('p,div,h1,h2,h3,h4,li,br')) {
    node.insertAdjacentHTML('beforebegin', ' ');
    node.insertAdjacentHTML('afterend', ' ');
  }
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
export function extractLinks(html, baseUrl) {
  const root = parse(html || '');
  const anchors = root.querySelectorAll('a')
    .map((a) => {
      const raw = a.getAttribute('href') || '';
      let href = raw;
      try { if (baseUrl && raw && !raw.startsWith('#')) href = new URL(raw, baseUrl).href; } catch { /* rejected below */ }
      const text = a.text.trim();
      const context = a.closest('p')?.text || '';
      const rules = /regulamin|zasady konkursu/i.test(`${text} ${raw}`)
        || (/^(?:tutaj|pobierz|link)$/i.test(text) && /regulamin/i.test(context));
      return { href, text, rules };
    })
    .filter((a) => {
      // Official rules are frequently PDFs; other media still cannot be a venue.
      const candidate = a.rules ? a.href.replace(/\.pdf(?=[?#]|$)/i, '') : a.href;
      return isUsableLink(candidate);
    });

  const regulamin = anchors.find((a) => a.rules);
  const organizer = anchors.find((a) => !a.rules && /strona konkursu|weź udział|formularz|zgłoś/i.test(a.text))
    || anchors.find((a) => !a.rules);

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

export function extractDeadline(text, referenceDate = null) {
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

  // Community posts often put a yearless run in the title. Anchor it to the
  // publication date, never today's year (which would revive old contests).
  const published = referenceDate ? new Date(referenceDate) : null;
  if (published && Number.isFinite(published.getTime())) {
    const range = t.match(/\b(\d{1,2})\.\s*(\d{1,2})\.?\s*[-–—]\s*(\d{1,2})\.\s*(\d{1,2})\.(?!\s*\d)/);
    if (range) {
      const year = published.getUTCFullYear() + (Number(range[4]) < Number(range[2]) ? 1 : 0);
      const iso = parsePolishDateToISO(`${range[3]}.${range[4]}.${year}`);
      if (iso) return iso;
    }
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
    // A question heading describes no action; read the following instructions.
    const withoutHeading = t.replace(/Jak\s+(?:wziąć\s+udział|dołączyć)[^.!?]{0,100}\?/gi, '');
    const explicit = withoutHeading.match(/(Aby\s+(?:wziąć\s+udział|dołączyć)[^.!?]{0,220}[.!?])/i)?.[1];
    if (explicit) return explicit.trim();

    // "Do dnia 16.08.2026 wykonaj poniższe zadania: 🔹wymyśl … 🔹opublikuj …"
    const taskList = t.match(
      /(?:wykonaj|spełnij)\s+(?:poniższ\w+\s+)?(?:zadani\w+|krok\w+|warunk\w+)[^:.!?]{0,60}[::]([\s\S]{0,420})/i
    )?.[1];
    if (taskList) {
      const steps = tidySteps(taskList);
      if (steps) return steps;
    }

    const verb = withoutHeading.match(
      /((?:Wystarczy|Napisz|Wymyśl|Opublikuj|Dodaj|Prześlij|Wyślij|Zgłoś|Wypełnij|Zarejestruj|Polub|Zaobserwuj|Skomentuj|Odpowiedz|Nagraj|Narysuj|Zrób|Wejdź)[^.!?]{0,220}[.!?]?)/i
    )?.[1];
    if (verb) {
      const clipped = clip(verb, 240);
      if (clipped.length > 12) return clipped;
    }
    const instruction = withoutHeading.match(/((?:Prac[ęey]|Zdjęcia|Fotografie|Zgłoszenia|Filmy)[^.!?]{0,80}(?:należy|trzeba)[^.!?]{0,160}[.!?]?)/i)?.[1];
    if (instruction) return clip(instruction, 240);
  }

  if (mechanics.length) return synthesiseEntrySummary(mechanics);
  return ENTRY_PLACEHOLDER;
}

// Read the actual entry section before introductory marketing copy. Paragraph
// and list boundaries are preserved so numbered steps can be summarized.
export function extractEntrySection(html, mechanics = []) {
  const root = parse(html || '');
  const heading = root.querySelectorAll('h2,h3,h4').find((h) => /jak\s+(?:wziąć\s+udział|dołączyć)/i.test(h.text));
  if (heading) {
    const steps = [];
    for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
      if (/^H[1-6]$/.test(node.tagName)) break;
      const text = stripText(node.outerHTML).replace(/^\d+[.)]\s*/, '');
      if (text) steps.push(text);
    }
    if (steps.length) return clip(steps.join(' '), 360);
  }
  return extractEntrySummary(stripText(html), mechanics);
}

// Pepper's group contains support threads, coupon swaps and other discussions.
// Require a contest announcement rather than trusting group membership.
export function isPepperContest(title, description = '') {
  const name = stripText(title);
  const key = titleKey(name);
  if (/^(?:jak pepper\b|jak (?:dlugo|odebrac|otrzymac|dziala)\b|jakie\b|o co chodzi\b|oddam\b|rozdam\b|kody spod\b|renki\b)|wymiana\s+(?:renifer|kod|kupon)|hot drop|kupony?\s+.*dla pierwszych/.test(key)) return false;
  const text = `${name} ${stripText(description)}`;
  return /\bkonkurs\w*|\bloteri\w*|\bwygraj\b/iu.test(text)
    && /\bwygraj\b|\bnagrod\w*|\bdo wygrania\b/iu.test(text);
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
  // No purchase is still not free entry when a positive entry fee is stated.
  if (/(?:wpisowe|opłata\s+(?:startowa|za udział))\s*(?::|wynosi|w wysokości)?\s*[1-9]\d*(?:[.,]\d+)?\s*(?:zł|pln|eur|€)/u.test(t)) return true;
  if (/bez\s+zakupu/.test(t)) return false;
  return /paragon|dowód zakupu|dowod zakupu|numer\w*\s+zamówieni\w*|podpisz\s+umowę\s+(?:z operatorem|abonamentową)|kup\s+(?:produkt|dowoln|min|za|\d)|za\s+zakup|przy\s+zakupie|zeskanuj\s+paragon|skanuj\s+i\s+wygrywaj|wieczko\s+opakowania|etykiet[ęe]\s+promocyjn/.test(t);
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
export const STALE_UNDATED_MONTHS = 3;
export const PEPPER_UNDATED_DAYS = 30;

export function isStaleUndated(item, now = new Date()) {
  if (item.deadline) return false;
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published)) return item.source === 'pepper';
  const cutoff = new Date(now);
  if (item.source === 'pepper') cutoff.setUTCDate(cutoff.getUTCDate() - PEPPER_UNDATED_DAYS);
  else cutoff.setUTCMonth(cutoff.getUTCMonth() - STALE_UNDATED_MONTHS);
  return published < cutoff.getTime();
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
