import { parse } from 'node-html-parser';
import { tagLabel } from './tags.mjs';

export function stripText(html) {
  const root = parse(html || '');
  for (const node of root.querySelectorAll('script,style,noscript')) node.remove();
  for (const node of root.querySelectorAll('p,div,h1,h2,h3,h4,li,br')) {
    node.insertAdjacentHTML('beforebegin', ' ');
    node.insertAdjacentHTML('afterend', ' ');
  }
  return root.text.trim().replace(/\s+/g, ' ');
}

const LINK_BLOCKLIST = /sharer|\/intent\/|\/share\?|wa\.me|mailto:|\/cdn-cgi\/|\.(?:jpg|jpeg|png|gif|webp|svg|pdf)(?:[?#]|$)/i;

const BLOCKED_HOSTS = /(?:^|\.)(?:fajnekonkursy\.pl|ofree\.pl|pepper\.pl|wygrajta\.pl|konkursiada\.pl|aktualnekonkursy\.pl|konkursyblisko\.pl|e-konkursy\.info|ekonkursy\.info|gstatic\.com|googleapis\.com|googletagmanager\.com|doubleclick\.net)$/i;

export function isUsableLink(href) {
  if (!/^https?:\/\//i.test(href) || LINK_BLOCKLIST.test(href)) return false;
  try {
    const u = new URL(href);
    if (u.searchParams.has('kb_join')) return true;
    return !BLOCKED_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

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
      const candidate = a.rules ? a.href.replace(/\.pdf(?=[?#]|$)/i, '') : a.href;
      return isUsableLink(candidate);
    });

  const regulamin = anchors.find((a) => a.rules);
  const organizer = anchors.find((a) => !a.rules && /strona konkursu|przejdź do strony|weź udział|formularz|zgłoś/i.test(a.text))
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

export const NUMERIC_DATE = String.raw`\d{4}-\d{2}-\d{2}|\d{1,2}[.\-]\d{1,2}[.\-]\d{4}`;
const TEXT_DATE = String.raw`\d{1,2}\s+(?:${Object.keys(PL_MONTHS).join('|')})\s+\d{4}`;

export function parsePolishDateToISO(dmy) {
  const isoMatch = dmy.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const iso = `${yyyy}-${mm}-${dd}`;
    if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
    return iso;
  }
  const num = dmy.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  const txt = num ? null : dmy.match(/^(\d{1,2})\s+(\p{L}+)\s+(\d{4})$/u);
  if (!num && !txt) return null;
  const dd = Number(num ? num[1] : txt[1]);
  const mm = num ? Number(num[2]) : Number(PL_MONTHS[txt[2].toLowerCase()] ?? NaN);
  const yyyy = num ? num[3] : txt[3];
  if (!(dd >= 1 && dd <= 31) || !(mm >= 1 && mm <= 12)) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export function extractDeadline(text, referenceDate = null) {
  const t = text || '';

  const explicit = t.match(new RegExp(
    String.raw`(?:\bdo\s+dnia|\bw\s+terminie\s+do|\bzgłoszenia\s+do|\bdo)\s*(${NUMERIC_DATE}|${TEXT_DATE})`, 'iu'
  ));
  if (explicit?.[1]) {
    const iso = parsePolishDateToISO(explicit[1]);
    if (iso) return iso;
  }

  const published = referenceDate ? new Date(referenceDate) : null;
  if (published && Number.isFinite(published.getTime())) {
    const range = t.match(/\b(\d{1,2})\.\s*(\d{1,2})\.?\s*[-–—]\s*(\d{1,2})\.\s*(\d{1,2})\.(?!\s*\d)/);
    if (range) {
      const year = published.getUTCFullYear() + (Number(range[4]) < Number(range[2]) ? 1 : 0);
      const iso = parsePolishDateToISO(`${range[3]}.${range[4]}.${year}`);
      if (iso) return iso;
    }
  }

  const all = allDates(t);
  if (all.length) return all.at(-1);

  return null;
}

export function allDates(text) {
  return [...(text || '').matchAll(new RegExp(`${NUMERIC_DATE}|${TEXT_DATE}`, 'giu'))]
    .map((m) => parsePolishDateToISO(m[0]))
    .filter(Boolean)
    .sort();
}

export const PRIZE_PLACEHOLDER = 'Sprawdź nagrody w źródle.';

const SECTION_BOUNDARY = /\s(?:Zasady\s+konkursu|Jak\s+wziąć\s+udział|Aby\s+wziąć\s+udział|Do\s+dnia\b|Regulamin\b|Nagrody\s+w\s+konkursie|Konkurs\s+trwa\b|Termin\b)/i;

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

export function extractPrizeValue(prizeText, title = '') {
  const combined = `${title} ${prizeText || ''}`.replace(/\u00a0/g, ' ');
  const matches = [...combined.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+)\s*(?:zł(?:otych|ote|oty)?|pln)(?!\p{L})/giu)];
  if (!matches.length) return null;

  const values = [];
  for (const m of matches) {
    const rawNum = m[1].replace(/[.\s]/g, '').replace(/,\d{2}$/, '');
    const num = parseInt(rawNum, 10);
    if (Number.isFinite(num) && num > 0 && num <= 10_000_000) {
      values.push(num);
    }
  }

  return values.length ? Math.max(...values) : null;
}

export const ENTRY_PLACEHOLDER = 'Sprawdź zasady udziału w źródle.';

const NOISE = [
  /Konkurs\s+kończy\s+się\s+za:(?:\s*\d+)*(?:\s*(?:Dni|Godz|Min|Sek)(?:\s*\d+)*)+/gi,
  /\(adsbygoogle[^)]*\)[^;]*;?/gi,
];

export function cleanArticleText(text) {
  let t = (text || '').replace(/\s+/g, ' ');
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

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

export function extractEntrySummary(text, mechanics = []) {
  const t = cleanArticleText(text);

  if (t) {
    const withoutHeading = t.replace(/Jak\s+(?:wziąć\s+udział|dołączyć)[^.!?]{0,100}\?/gi, '');
    const explicit = withoutHeading.match(/(Aby\s+(?:wziąć\s+udział|dołączyć)[^.!?]{0,220}[.!?])/i)?.[1];
    if (explicit) return explicit.trim();

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

export function isPepperContest(title, description = '') {
  const name = stripText(title);
  const key = titleKey(name);
  if (/^(?:jak pepper\b|jak (?:dlugo|odebrac|otrzymac|dziala)\b|jakie\b|o co chodzi\b|oddam\b|rozdam\b|kody spod\b|renki\b)|wymiana\s+(?:renifer|kod|kupon)|hot drop|kupony?\s+.*dla pierwszych/.test(key)) return false;
  const text = `${name} ${stripText(description)}`;
  return /\bkonkurs\w*|\bloteri\w*|\bwygraj\b/iu.test(text)
    && /\bwygraj\b|\bnagrod\w*|\bdo wygrania\b/iu.test(text);
}

export function synthesiseEntrySummary(mechanics) {
  const labels = mechanics.map((slug) => tagLabel(slug, 'mechanika').toLowerCase());
  if (!labels.length) return ENTRY_PLACEHOLDER;
  return `Wymagane: ${labels.join(', ')} — szczegóły i pełne zasady w źródle.`;
}

export function parseRssItems(xml) {
  const unwrap = (v) => v.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, (_, inner) => inner).trim();
  return [...(xml || '').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const tag = (name) => {
      const mm = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
      return mm ? unwrap(mm[1].trim()) : '';
    };
    const desc = tag('content:encoded') || tag('content\\:encoded') || tag('description');
    return {
      title: tag('title'),
      link: tag('link'),
      description: desc,
      pubDate: tag('pubDate'),
      guid: tag('guid'),
      categories: [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/g)]
        .map((c) => unwrap(c[1].trim()))
        .filter(Boolean),
    };
  });
}

export function requiresPurchase(text) {
  const t = String(text || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
  const fees = t.matchAll(/(?:wpisowe|oplata\s+(?:startowa|za udzial))\s*(?::|wynosi|w wysokosci)?\s*(\d+(?:[.,]\d+)?)\s*(?:zl|pln|eur|€)/gu);
  if ([...fees].some((m) => Number(m[1].replace(',', '.')) > 0)) return true;

  const freeClaim = /\bbez\s+(?:koniecznosci\s+)?(?:dokonywania\s+)?zakupu\b|\bnie\s+wymaga(?:my)?\s+zakupu\b|\bzakup\s+nie\s+jest\s+wymagany\b|\bnie\s+(?:trzeba|musisz)\s+(?:nic\s+)?kupowac\b/;
  const deniedFreeClaim = /\b(?:nie\s+(?:jest|sa|moze|mozna|ma|da sie|bedzie|przewidujemy|oferujemy)|brak|niemozliw\w*|niedostepn\w*)\b[^.!?]{0,100}\bbez\s+(?:koniecznosci\s+)?zakupu\b|\bnie\s+bez\s+zakupu\b|\bbez\s+(?:koniecznosci\s+)?zakupu\b[^.!?]{0,70}\b(?:niemozliw\w*|niedostepn\w*|nie\s+(?:mozna|da sie|wezmiesz|istnieje|jest\s+(?:mozliw\w*|dostepn\w*|dopuszczaln\w*)))\b/;
  const statements = t.match(/[^.!?]+[.!?]?/g) || [];
  if (statements.some((s) => freeClaim.test(s) && !s.trimEnd().endsWith('?')
    && !/\bczy\b[^.!?]{0,100}\bbez\s+(?:koniecznosci\s+)?zakupu\b/.test(s)
    && !deniedFreeClaim.test(s))) return false;

  const requirements = t
    .replace(/\b(?:bez|nie potrzebujesz|nie wymagamy|nie wymaga|nie jest wymagany|nie trzeba(?: miec| zachowywac| zachowac)?|nie musisz(?: miec| zachowywac| zachowac)?)\s+(?:(?:zadnego|zadnych|okazywania|przedstawiania|przesylania|zachowania|skanowania|dolaczania)\s+)*(?:paragon\w*|dowod\w*\s+zakupu|numer\w*\s+zamowieni\w*)/g, '')
    .replace(/\b(?:paragon\w*|dowod\w*\s+zakupu)\s+nie\s+(?:jest|sa)\s+wymagan\w*/g, '');
  return /paragon|dowod zakupu|numer\w*\s+zamowieni\w*|podpisz\s+umowe\s+(?:z operatorem|abonamentowa)|kup\s+(?:produkt|dowoln|min|za|\d)|(?:musisz|nalezy|trzeba)\s+(?:kupic|dokonac zakupu)|(?:warunk\w*|wymag\w*|konieczn\w*)[^.!?]{0,30}\bzakup|za\s+zakup|przy\s+zakupie|zeskanuj\s+paragon|skanuj\s+i\s+wygrywaj|wieczko\s+opakowania|etykiet[ae]\s+promocyjn/.test(requirements);
}

export function todayInWarsaw() {
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

export function sourceIdFrom(item, idPattern) {
  const link = (item.link || '').replaceAll('&amp;', '&');
  const guid = (item.guid || '').replaceAll('&amp;', '&');
  if (idPattern) {
    const hit = link.match(idPattern)?.[1] || guid.match(idPattern)?.[1];
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

export const MIN_MERGE_KEY_LENGTH = 12;

const PLACEHOLDER_SUMMARY = /^Sprawdź (?:nagrody|zasady udziału) w źródle\.$/;

export function bestSummary(a, b) {
  const aOk = a && !PLACEHOLDER_SUMMARY.test(a);
  const bOk = b && !PLACEHOLDER_SUMMARY.test(b);
  if (aOk && bOk) return a.length >= b.length ? a : b;
  return aOk ? a : (bOk ? b : (a || b));
}

export function detectSocialPlatforms(item) {
  if (!item) return [];
  const platforms = [];
  const urls = [item.links?.organizer, item.links?.regulamin].filter(Boolean).join(' ');
  const tags = [
    ...(item.tags?.mechanika || []),
    ...(item.tags?.temat || []),
    ...(item.tags?.marka || [])
  ];

  if (/instagram\.com|instagr\.am/i.test(urls) || tags.includes('instagram')) {
    platforms.push({ key: 'instagram', label: '📷 Instagram', className: 'badge--instagram' });
  }
  if (/facebook\.com|fb\.com|fb\.watch/i.test(urls) || tags.includes('facebook')) {
    platforms.push({ key: 'facebook', label: '📘 Facebook', className: 'badge--facebook' });
  }
  if (/tiktok\.com/i.test(urls) || tags.includes('tiktok')) {
    platforms.push({ key: 'tiktok', label: '🎵 TikTok', className: 'badge--tiktok' });
  }
  if (/youtube\.com|youtu\.be/i.test(urls) || tags.includes('youtube')) {
    platforms.push({ key: 'youtube', label: '▶ YouTube', className: 'badge--youtube' });
  }
  return platforms;
}
