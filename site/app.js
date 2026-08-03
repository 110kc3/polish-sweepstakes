const els = {
  list: document.getElementById('list'),
  updatedAt: document.getElementById('updatedAt'),
  source: document.getElementById('source'),
  tag: document.getElementById('tag'),
  activeOnly: document.getElementById('activeOnly'),
  q: document.getElementById('q'),
};

// Tag legend from data/lotteries.json: slug -> label, and the kind order used
// for chips. Falls back to the slug so a new tag still renders.
let tagLabels = {};
let tagKinds = ['nagroda', 'mechanika', 'temat', 'marka', 'odbiorca', 'zasieg'];

function tagLabel(slug) {
  return tagLabels[slug] || slug;
}

function itemTagSlugs(it) {
  const tags = it.tags || {};
  return tagKinds.flatMap((kind) => tags[kind] || []);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// The contests are Polish, so day counts are measured against the date in
// Warsaw rather than the viewer's own timezone or UTC.
function todayInWarsaw() {
  // 'sv-SE' formats as YYYY-MM-DD, which compares lexicographically.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const end = Date.parse(isoDate + 'T00:00:00Z');
  const today = Date.parse(todayInWarsaw() + 'T00:00:00Z');
  if (Number.isNaN(end) || Number.isNaN(today)) return null;
  return Math.round((end - today) / MS_PER_DAY);
}

function deadlineBadge(deadline) {
  if (!deadline) return `<span class="badge deadline">Brak daty</span>`;
  const d = daysUntil(deadline);
  if (d !== null && d < 0) {
    return `<span class="badge deadline soon">Do: ${escapeHtml(deadline)} (zakończony)</span>`;
  }
  const cls = d !== null && d <= 3 ? 'soon' : 'ok';
  const suffix = d === null ? '' : d === 0 ? ' (dziś)' : ` (${d} ${d === 1 ? 'dzień' : 'dni'})`;
  return `<span class="badge deadline ${cls}">Do: ${escapeHtml(deadline)}${escapeHtml(suffix)}</span>`;
}

function contestLink(it) {
  const target = it.links?.regulamin || it.links?.organizer;
  if (!target) return '';
  const label = it.links?.regulamin ? 'Regulamin' : 'Strona konkursu';
  return `<a class="btn" href="${escapeHtml(target)}" target="_blank" rel="noopener nofollow">${label}</a>`;
}

function organizerWarning(it) {
  if (it.verification?.organizerOk !== false) return '';
  return `<p class="muted warn">⚠ Nasza weryfikacja: strona konkursu może już nie działać.</p>`;
}

// Chips are buttons so a tag can be clicked to filter by it; #list uses one
// delegated listener, which also picks up the build-time pre-rendered markup.
function tagChips(it) {
  const tags = it.tags || {};
  const chips = tagKinds.flatMap((kind) => (tags[kind] || []).map((slug) => (
    `<button type="button" class="tag tag--${escapeHtml(kind)}" data-tag="${escapeHtml(slug)}" title="Filtruj: ${escapeHtml(tagLabel(slug))}">${escapeHtml(tagLabel(slug))}</button>`
  )));
  if (!chips.length) return '';
  return `<div class="tags">${chips.join('')}</div>`;
}

function alsoOnNote(it) {
  if (!it.alsoOn?.length) return '';
  const links = it.alsoOn
    .map((o) => `<a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.source)}</a>`)
    .join(', ');
  return `<p class="muted also">Także w: ${links}</p>`;
}

function render(items) {
  els.list.innerHTML = items.map((it) => {
    return `
      <article class="card">
        <h2>${escapeHtml(it.title)}</h2>
        <div class="badges">
          <span class="badge">Źródło: ${escapeHtml(it.source)}</span>
          ${deadlineBadge(it.deadline)}
          <span class="badge">Status: ${escapeHtml(it.status || 'unknown')}</span>
        </div>
        ${tagChips(it)}

        <div class="row">
          <div class="k">Nagroda</div>
          <div class="v">${escapeHtml(it.prize?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="row">
          <div class="k">Jak wziąć udział</div>
          <div class="v">${escapeHtml(it.entry?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="actions">
          <a class="btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">Zobacz szczegóły</a>
          ${contestLink(it)}
        </div>
        ${organizerWarning(it)}
        ${alsoOnNote(it)}
      </article>
    `;
  }).join('');
}

function applyFilters(all) {
  const source = els.source.value;
  const tag = els.tag ? els.tag.value : 'all';
  const activeOnly = els.activeOnly.checked;
  const q = (els.q.value || '').trim().toLowerCase();

  const today = todayInWarsaw();
  return all.filter((it) => {
    if (source !== 'all' && it.source !== source) return false;
    if (tag !== 'all' && !itemTagSlugs(it).includes(tag)) return false;

    if (activeOnly) {
      // Deadline day counts as active for all of it (Warsaw date).
      if (it.deadline && it.deadline < today) return false;
      // If deadline missing: keep (unknown)
    }

    if (q) {
      const tagText = itemTagSlugs(it).map((slug) => `${slug} ${tagLabel(slug)}`).join(' ');
      const hay = `${it.title} ${it.prize?.summary || ''} ${it.entry?.summary || ''} ${tagText}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

async function load() {
  const res = await fetch('./data/lotteries.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Nie udało się pobrać data/lotteries.json');
  const data = await res.json();

  els.updatedAt.textContent = data.generatedAt ? new Date(data.generatedAt).toLocaleString('pl-PL') : '-';

  const all = Array.isArray(data.items) ? data.items : [];

  tagLabels = data.tagLabels || {};
  if (Array.isArray(data.tagKinds) && data.tagKinds.length) tagKinds = data.tagKinds;

  // Populate the source filter from the data so new sources show up automatically.
  for (const src of [...new Set(all.map((it) => it.source))].sort()) {
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src;
    els.source.appendChild(opt);
  }

  // Tag filter, grouped by kind and ordered by how many contests use each tag,
  // so the useful tags sit at the top of every group. Counted over the items the
  // default view shows (ended ones hidden) rather than the whole dataset, so the
  // number next to a tag matches what selecting it yields. data.tagCounts stays
  // dataset-wide for consumers of the JSON.
  if (els.tag) {
    const today = todayInWarsaw();
    const counts = {};
    for (const it of all) {
      if (it.deadline && it.deadline < today) continue;
      for (const slug of itemTagSlugs(it)) counts[slug] = (counts[slug] || 0) + 1;
    }
    const kindLabels = data.tagKindLabels || {};
    const byKind = new Map(tagKinds.map((k) => [k, new Set()]));
    for (const it of all) {
      for (const kind of tagKinds) {
        for (const slug of it.tags?.[kind] || []) byKind.get(kind).add(slug);
      }
    }
    for (const kind of tagKinds) {
      const slugs = [...byKind.get(kind)]
        .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || tagLabel(a).localeCompare(tagLabel(b), 'pl'));
      if (!slugs.length) continue;
      const group = document.createElement('optgroup');
      group.label = kindLabels[kind] || kind;
      for (const slug of slugs) {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = counts[slug] ? `${tagLabel(slug)} (${counts[slug]})` : tagLabel(slug);
        group.appendChild(opt);
      }
      els.tag.appendChild(group);
    }
  }

  function rerender() {
    const filtered = applyFilters(all);
    // Sort by deadline (nulls last)
    filtered.sort((a, b) => {
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });
    render(filtered);
  }

  els.source.addEventListener('change', rerender);
  if (els.tag) els.tag.addEventListener('change', rerender);
  els.activeOnly.addEventListener('change', rerender);
  els.q.addEventListener('input', rerender);

  // Clicking a chip on a card filters by that tag (click it again to clear).
  els.list.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-tag]');
    if (!chip || !els.tag) return;
    const slug = chip.getAttribute('data-tag');
    els.tag.value = els.tag.value === slug ? 'all' : slug;
    rerender();
    els.tag.scrollIntoView({ block: 'nearest' });
  });

  rerender();
}

load().catch((e) => {
  // Keep pre-rendered (build-time) listings if present; only show the error
  // when there is nothing to fall back to.
  if (!els.list.children.length) {
    els.list.innerHTML = `<div class="card"><h2>Błąd</h2><p class="muted">${escapeHtml(e.message)}</p></div>`;
  }
});
