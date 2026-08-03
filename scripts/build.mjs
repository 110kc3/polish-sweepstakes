import fs from 'node:fs/promises';
import path from 'node:path';
import { TAG_KINDS } from './tags.mjs';

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

// Mirrors render() in site/app.js so the no-JS markup matches what the
// client re-renders after hydration.
function card(it) {
  const deadlineBadge = it.deadline
    ? `<span class="badge deadline">Do: ${esc(it.deadline)}</span>`
    : `<span class="badge deadline">Brak daty</span>`;
  return `
      <article class="card">
        <h2>${esc(it.title)}</h2>
        <div class="badges">
          <span class="badge">Źródło: ${esc(it.source)}</span>
          ${deadlineBadge}
          <span class="badge">Status: ${esc(it.status || 'unknown')}</span>
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
  const target = it.links?.regulamin || it.links?.organizer;
  if (!target) return '';
  const label = it.links?.regulamin ? 'Regulamin' : 'Strona konkursu';
  return `\n          <a class="btn" href="${esc(target)}" target="_blank" rel="noopener nofollow">${label}</a>`;
}

function organizerWarning(it) {
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

async function main() {
  await fs.rm('dist', { recursive: true, force: true });
  await copyDir('site', 'dist');
  await fs.mkdir('dist/data', { recursive: true });

  let data = null;
  try {
    data = JSON.parse(await fs.readFile('data/lotteries.json', 'utf8'));
    await fs.copyFile('data/lotteries.json', 'dist/data/lotteries.json');
  } catch {
    console.warn('data/lotteries.json not found; run "npm run scrape" first. Building without pre-rendered listings.');
  }

  if (data) {
    tagLabels = data.tagLabels || {};
    if (Array.isArray(data.tagKinds) && data.tagKinds.length) tagKinds = data.tagKinds;

    // Pre-render the default view (non-ended items, soonest deadline first)
    // so content is present without JS and for crawlers/agents.
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((it) => it.status !== 'ended')
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
  }

  console.log('Built dist/ from site/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
