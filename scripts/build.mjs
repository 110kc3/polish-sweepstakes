import fs from 'node:fs/promises';
import path from 'node:path';
import { TAG_KINDS } from './tags.mjs';
import { statusFor } from './extract.mjs';

const BASE = 'https://110kc3.github.io/polish-sweepstakes';

// Tag legend from the dataset, so the pre-rendered chips read the same labels
// the client-side render uses.
let tagLabels = {};
let tagKinds = TAG_KINDS;

const tagLabel = (slug) => tagLabels[slug] || slug;

function itemTagSlugs(it) {
  const tags = it.tags || {};
  return tagKinds.flatMap((kind) => tags[kind] || []);
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// JSON-LD payloads: escape '<' so scraped text can't break out of the
// <script> block with a literal </script>.
function jsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

function googleCalendarUrl(it) {
  if (!it.deadline) return '';
  const dStart = it.deadline.replace(/-/g, '');
  const endObj = new Date(it.deadline + 'T00:00:00Z');
  endObj.setUTCDate(endObj.getUTCDate() + 1);
  const dEnd = endObj.toISOString().slice(0, 10).replace(/-/g, '');
  const text = encodeURIComponent(`Konkurs: ${it.title}`);
  const details = encodeURIComponent(`Nagroda: ${it.prize?.summary || ''}\nJak wziąć udział: ${it.entry?.summary || ''}\nŹródło: ${it.url}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dStart}/${dEnd}&details=${details}`;
}

// Mirrors render() in site/app.js so the no-JS markup matches what the
// client re-renders after hydration.
function card(it) {
  const deadlineBadge = it.deadline
    ? `<span class="badge deadline">Do: ${esc(it.deadline)}</span>`
    : `<span class="badge deadline">Brak daty</span>`;
  const amoeBadge = it.entry?.noPurchase === 'altFreeEntry'
    ? `\n          <span class="badge badge--amoe" title="${esc(it.entry?.noPurchaseNotes || 'Darmowa metoda alternatywna')}">✨ Metoda alternatywna</span>`
    : '';
  const prizeBadge = it.prize?.value
    ? `\n          <span class="badge badge--prize">💰 do ${it.prize.value.toLocaleString('pl-PL')} zł</span>`
    : '';
  const cal = it.deadline
    ? `\n          <a class="btn-tool btn--cal" href="${esc(googleCalendarUrl(it))}" target="_blank" rel="noopener" data-deadline="${esc(it.deadline)}" data-title="${esc(it.title)}" data-url="${esc(it.url)}" title="Dodaj termin do kalendarza Google (Shift+klik aby pobrać .ics)">📅 Kalendarz</a>`
    : '';

  return `
      <article class="card" id="${esc(it.id)}">
        <h2>${esc(it.title)}</h2>
        <div class="badges">
          <span class="badge">Źródło: ${esc(it.source)}</span>
          ${deadlineBadge}
          <span class="badge">Status: ${esc(it.status || 'unknown')}</span>${amoeBadge}${prizeBadge}
        </div>${tagChips(it)}

        <div class="row">
          <div class="k">Nagroda</div>
          <div class="v">${esc(it.prize?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="row">
          <div class="k">Jak wziąć udział</div>
          <div class="v">${esc(it.entry?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="actions">
          <a class="btn" href="${esc(it.url)}" target="_blank" rel="noopener">Zobacz szczegóły</a>${contestLink(it)}
        </div>
        <div class="tools">${cal}
          <button type="button" class="btn-tool btn--copy" data-copy-id="${esc(it.id)}" title="Skopiuj bezpośredni link">🔗 Link</button>
          <button type="button" class="btn-tool btn--save" data-save="${esc(it.id)}" title="Zapisz w moich konkursach">☆ Zapisz</button>
          <button type="button" class="btn-tool btn--entered" data-entered="${esc(it.id)}" title="Oznacz, że wziąłeś udział">☑ Wezmę udział</button>
        </div>${organizerWarning(it)}${alsoOnNote(it)}
      </article>`;
}

// Same markup as tagChips() in site/app.js: buttons, so the delegated click
// handler works on the pre-rendered cards too (before any re-render).
function tagChips(it) {
  const tags = it.tags || {};
  const chips = tagKinds.flatMap((kind) => (tags[kind] || []).map((slug) => (
    `<button type="button" class="tag tag--${esc(kind)}" data-tag="${esc(slug)}" title="Filtruj: ${esc(tagLabel(slug))}">${esc(tagLabel(slug))}</button>`
  )));
  if (!chips.length) return '';
  return `\n        <div class="tags">${chips.join('')}</div>`;
}

function alsoOnNote(it) {
  if (!it.alsoOn?.length) return '';
  const links = it.alsoOn
    .map((o) => `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.source)}</a>`)
    .join(', ');
  return `\n        <p class="muted also">Także w: ${links}</p>`;
}

function contestLink(it) {
  const rules = it.links?.regulamin;
  const rulesDead = (it.verification?.regulaminOk ?? it.verification?.organizerOk) === false;
  // Preserve unknown preferred links, but never replace known-dead rules with
  // an organizer that has not independently passed verification.
  const target = rules
    ? (rulesDead ? (it.verification?.organizerPageOk === true ? it.links?.organizer : null) : rules)
    : ((it.verification?.organizerPageOk ?? it.verification?.organizerOk) === false ? null : it.links?.organizer);
  if (!target) return '';
  const label = target === rules ? 'Regulamin' : 'Strona konkursu';
  return `\n          <a class="btn" href="${esc(target)}" target="_blank" rel="noopener nofollow">${label}</a>`;
}

function organizerWarning(it) {
  if (it.links?.regulamin && (it.verification?.regulaminOk ?? it.verification?.organizerOk) === false) {
    return `\n        <p class="muted warn">⚠ Nasza weryfikacja: regulamin konkursu nie jest dostępny. Sprawdź zasady na stronie organizatora lub w źródle.</p>`;
  }
  if (it.verification?.organizerOk !== false) return '';
  return `\n        <p class="muted warn">⚠ Nasza weryfikacja: strona konkursu może już nie działać.</p>`;
}

function buildJsonLd(items, generatedAt) {
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Konkursy i loterie w Polsce bez zakupu',
    url: `${BASE}/`,
    inLanguage: 'pl',
    description: 'Aktualne konkursy i loterie w Polsce bez wymogu zakupu (lub z darmową metodą udziału).',
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Aktualne konkursy i loterie bez zakupu w Polsce',
    ...(generatedAt ? { dateModified: generatedAt } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: it.title,
        url: it.url,
        description: [it.prize?.summary, it.entry?.summary].filter(Boolean).join(' '),
        ...(itemTagSlugs(it).length ? { keywords: itemTagSlugs(it).map(tagLabel).join(', ') } : {}),
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url: it.url },
        ...(it.publishedAt ? { startDate: it.publishedAt.slice(0, 10) } : {}),
        ...(it.deadline ? { endDate: it.deadline } : {}),
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: it.prize?.currency || 'PLN',
          url: it.url,
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };
  return `<script type="application/ld+json">\n${jsonLd(website)}\n</script>\n  <script type="application/ld+json">\n${jsonLd(itemList)}\n</script>`;
}

function buildRssFeed(items, generatedAt) {
  const escXml = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  const pubDate = generatedAt ? new Date(generatedAt).toUTCString() : new Date().toUTCString();

  const feedItems = items.map((it) => {
    const itemPubDate = it.publishedAt ? new Date(it.publishedAt).toUTCString() : pubDate;
    const tags = itemTagSlugs(it).map((slug) => `<category>${escXml(tagLabel(slug))}</category>`).join('\n      ');
    const prizeValText = it.prize?.value ? ` (szacunkowa wartość: ${it.prize.value} PLN)` : '';
    const desc = `Termin: ${it.deadline || 'Brak daty'}\nNagroda: ${it.prize?.summary || 'Sprawdź w źródle.'}${prizeValText}\nJak wziąć udział: ${it.entry?.summary || 'Sprawdź w źródle.'}\nŹródło: ${it.source}`;

    return `    <item>
      <title><![CDATA[${it.title}]]></title>
      <link>${escXml(it.url)}</link>
      <guid isPermaLink="false">${escXml(it.id)}</guid>
      <pubDate>${itemPubDate}</pubDate>
      <description><![CDATA[${desc}]]></description>
      ${tags}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Konkursy i loterie bez zakupu (PL)</title>
    <link>${BASE}/</link>
    <description>Aktualne konkursy i loterie w Polsce bez wymogu zakupu (lub z darmową metodą alternatywną). Aktualizowane codziennie.</description>
    <language>pl</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
${feedItems}
  </channel>
</rss>
`;
}

function buildActiveMarkdown(items, generatedAt) {
  const updated = generatedAt ? new Date(generatedAt).toISOString() : new Date().toISOString();
  const rows = items.map((it, idx) => {
    const prizeVal = it.prize?.value ? ` (~${it.prize.value.toLocaleString('pl-PL')} PLN)` : '';
    const tags = itemTagSlugs(it).map(tagLabel).join(', ');
    const rules = it.links?.regulamin ? ` | [Regulamin](${it.links.regulamin})` : '';
    const org = it.links?.organizer ? ` | [Organizator](${it.links.organizer})` : '';
    return `### ${idx + 1}. [${it.title}](${it.url})
- **Termin:** ${it.deadline || 'Brak'}
- **Nagroda:** ${it.prize?.summary || 'Brak opisu'}${prizeVal}
- **Jak wziąć udział:** ${it.entry?.summary || 'Sprawdź źródło'}
- **Źródło:** ${it.source}${tags ? ` | **Tagi:** ${tags}` : ''}${rules}${org}
`;
  }).join('\n');

  return `# Aktywne konkursy i loterie w Polsce bez zakupu
Ostatnia aktualizacja: ${updated}
Liczba aktywnych konkursów z potwierdzonym terminem: ${items.length}

${rows}
`;
}

async function main() {
  // Validate before deleting the previous build or publishing an empty shell.
  const data = JSON.parse(await fs.readFile('data/lotteries.json', 'utf8'));
  if (!Array.isArray(data.items) || !data.items.length || !Number.isFinite(Date.parse(data.generatedAt))) {
    throw new Error('Invalid or empty dataset; run "npm run scrape" first.');
  }
  for (const it of data.items) it.status = statusFor(it.deadline);
  await fs.rm('dist', { recursive: true, force: true });
  await copyDir('site', 'dist');
  await fs.mkdir('dist/data', { recursive: true });

  await fs.writeFile('dist/data/lotteries.json', JSON.stringify(data, null, 2) + '\n', 'utf8');

  if (data) {
    tagLabels = data.tagLabels || {};
    if (Array.isArray(data.tagKinds) && data.tagKinds.length) tagKinds = data.tagKinds;

    // Pre-render the default view (known active deadlines, soonest first)
    // so content is present without JS and for crawlers/agents.
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((it) => it.status === 'active')
      .sort((a, b) => (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31'));

    // Replacer functions: with a plain string, replace() would interpret
    // $-patterns ($&, $') occurring in scraped text and corrupt the output.
    let html = await fs.readFile('dist/index.html', 'utf8');
    const listingsHtml = items.map(card).join('\n');
    const jsonLdHtml = buildJsonLd(items, data.generatedAt);
    html = html.replace('<!-- LISTINGS -->', () => listingsHtml);
    html = html.replace('<!-- JSONLD -->', () => jsonLdHtml);
    if (data.generatedAt) {
      const updated = esc(new Date(data.generatedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }));
      html = html.replace('<span id="updatedAt">-</span>', () => `<span id="updatedAt">${updated}</span>`);
    }
    await fs.writeFile('dist/index.html', html, 'utf8');
    console.log(`Pre-rendered ${items.length} listings into dist/index.html`);

    // The listing changes every day, so tell crawlers when it last did.
    if (data.generatedAt) {
      const sitemap = await fs.readFile('dist/sitemap.xml', 'utf8');
      const lastmod = `<lastmod>${esc(data.generatedAt.slice(0, 10))}</lastmod>`;
      await fs.writeFile('dist/sitemap.xml', sitemap.replace('<!-- LASTMOD -->', () => lastmod), 'utf8');
    }

    // Copy data/schema.json to dist/data/schema.json
    try {
      await fs.copyFile('data/schema.json', 'dist/data/schema.json');
    } catch {}

    // Generate RSS 2.0 feed
    const rssXml = buildRssFeed(items, data.generatedAt);
    await fs.writeFile('dist/feed.xml', rssXml, 'utf8');

    // Generate active markdown digest
    const activeMd = buildActiveMarkdown(items, data.generatedAt);
    await fs.writeFile('dist/data/active.md', activeMd, 'utf8');
  }

  console.log('Built dist/ from site/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
