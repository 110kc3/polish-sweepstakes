const els = {
  list: document.getElementById('list'),
  updatedAt: document.getElementById('updatedAt'),
  source: document.getElementById('source'),
  tag: document.getElementById('tag'),
  sort: document.getElementById('sort'),
  userView: document.getElementById('userView'),
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
  if (!deadline) return '<span class="badge deadline">Brak daty</span>';
  const d = daysUntil(deadline);
  if (d !== null && d < 0) {
    return `<span class="badge deadline soon">Do: ${escapeHtml(deadline)} (zakończony)</span>`;
  }
  const cls = d !== null && d <= 3 ? 'soon' : 'ok';
  const suffix = d === null ? '' : d === 0 ? ' (dziś)' : ` (${d} ${d === 1 ? 'dzień' : 'dni'})`;
  return `<span class="badge deadline ${cls}">Do: ${escapeHtml(deadline)}${escapeHtml(suffix)}</span>`;
}

function contestLink(it) {
  const rules = it.links?.regulamin;
  const rulesDead = (it.verification?.regulaminOk ?? it.verification?.organizerOk) === false;
  const target = rules
    ? (rulesDead ? (it.verification?.organizerPageOk === true ? it.links?.organizer : null) : rules)
    : ((it.verification?.organizerPageOk ?? it.verification?.organizerOk) === false ? null : it.links?.organizer);
  if (!target) return '';
  const label = target === rules ? 'Regulamin' : 'Strona konkursu';
  return `<a class="btn" href="${escapeHtml(target)}" target="_blank" rel="noopener nofollow">${label}</a>`;
}

function organizerWarning(it) {
  if (it.links?.regulamin && (it.verification?.regulaminOk ?? it.verification?.organizerOk) === false) {
    return '<p class="muted warn">⚠ Nasza weryfikacja: regulamin konkursu nie jest dostępny. Sprawdź zasady na stronie organizatora lub w źródle.</p>';
  }
  if (it.verification?.organizerOk !== false) return '';
  return '<p class="muted warn">⚠ Nasza weryfikacja: strona konkursu może już nie działać.</p>';
}

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

function amoeBadge(it) {
  if (it.entry?.noPurchase !== 'altFreeEntry') return '';
  return `<span class="badge badge--amoe" title="${escapeHtml(it.entry?.noPurchaseNotes || 'Darmowa metoda alternatywna')}">✨ Metoda alternatywna</span>`;
}

function prizeBadge(it) {
  if (!it.prize?.value) return '';
  return `<span class="badge badge--prize">💰 do ${it.prize.value.toLocaleString('pl-PL')} zł</span>`;
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

const TRACKER_KEY = 'polish_sweepstakes_tracker_v1';
function loadTracker() {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { saved: [], entered: [] };
}
function saveTracker(t) {
  try {
    localStorage.setItem(TRACKER_KEY, JSON.stringify(t));
  } catch {}
}
const tracker = loadTracker();
function isSaved(id) { return tracker.saved.includes(id); }
function isEntered(id) { return tracker.entered.includes(id); }

function downloadIcs(title, deadline, url, summary) {
  const dStart = deadline.replace(/-/g, '');
  const endObj = new Date(deadline + 'T00:00:00Z');
  endObj.setUTCDate(endObj.getUTCDate() + 1);
  const dEnd = endObj.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//polish-sweepstakes//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${dStart}-${Math.random().toString(36).slice(2)}@polish-sweepstakes`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dStart}`,
    `DTEND;VALUE=DATE:${dEnd}`,
    `SUMMARY:Konkurs: ${title.replace(/,/g, '\\,')}`,
    `DESCRIPTION:${(summary || '').replace(/\n/g, '\\n').replace(/,/g, '\\,')}\\nLink: ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Przypomnienie o terminie konkursu',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `konkurs-${deadline}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function cardTools(it) {
  const cal = it.deadline
    ? `<a class="btn-tool btn--cal" href="${escapeHtml(googleCalendarUrl(it))}" target="_blank" rel="noopener" data-deadline="${escapeHtml(it.deadline)}" data-title="${escapeHtml(it.title)}" data-url="${escapeHtml(it.url)}" title="Dodaj termin do kalendarza Google (Shift+klik aby pobrać .ics)">📅 Kalendarz</a>`
    : '';
  const savedClass = isSaved(it.id) ? 'is-active' : '';
  const savedText = isSaved(it.id) ? '⭐ Zapisane' : '☆ Zapisz';
  const enteredClass = isEntered(it.id) ? 'is-entered' : '';
  const enteredText = isEntered(it.id) ? '✅ Zgłoszony' : '☑ Wezmę udział';

  return `
    <div class="tools">
      ${cal}
      <button type="button" class="btn-tool btn--copy" data-copy-id="${escapeHtml(it.id)}" title="Skopiuj bezpośredni link">🔗 Link</button>
      <button type="button" class="btn-tool btn--save ${savedClass}" data-save="${escapeHtml(it.id)}" title="Zapisz w moich konkursach">${savedText}</button>
      <button type="button" class="btn-tool btn--entered ${enteredClass}" data-entered="${escapeHtml(it.id)}" title="Oznacz, że wziąłeś udział">${enteredText}</button>
    </div>
  `;
}

function render(items) {
  els.list.innerHTML = items.map((it) => {
    return `
      <article class="card" id="${escapeHtml(it.id)}">
        <h2>${escapeHtml(it.title)}</h2>
        <div class="badges">
          <span class="badge">Źródło: ${escapeHtml(it.source)}</span>
          ${deadlineBadge(it.deadline)}
          <span class="badge">Status: ${escapeHtml(it.status || 'unknown')}</span>
          ${amoeBadge(it)}
          ${prizeBadge(it)}
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
        ${cardTools(it)}
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
  const view = els.userView ? els.userView.value : 'all';
  const q = (els.q.value || '').trim().toLowerCase();

  const today = todayInWarsaw();
  return all.filter((it) => {
    if (source !== 'all' && it.source !== source) return false;
    if (tag !== 'all' && !itemTagSlugs(it).includes(tag)) return false;

    if (view === 'saved' && !isSaved(it.id)) return false;
    if (view === 'entered' && !isEntered(it.id)) return false;

    if (activeOnly) {
      if (!it.deadline || it.deadline < today) return false;
    }

    if (q) {
      const tagText = itemTagSlugs(it).map((slug) => `${slug} ${tagLabel(slug)}`).join(' ');
      const prizeValueText = it.prize?.value ? `${it.prize.value} zł` : '';
      const hay = `${it.title} ${it.prize?.summary || ''} ${prizeValueText} ${it.entry?.summary || ''} ${tagText}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function syncUrl() {
  const params = new URLSearchParams();
  if (els.source.value !== 'all') params.set('source', els.source.value);
  if (els.tag && els.tag.value !== 'all') params.set('tag', els.tag.value);
  if (!els.activeOnly.checked) params.set('active', '0');
  if (els.sort && els.sort.value !== 'deadline-asc') params.set('sort', els.sort.value);
  if (els.userView && els.userView.value !== 'all') params.set('view', els.userView.value);
  if (els.q.value.trim()) params.set('q', els.q.value.trim());

  const search = params.toString();
  const newUrl = search ? `?${search}` : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

async function load() {
  const res = await fetch('./data/lotteries.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Nie udało się pobrać data/lotteries.json');
  const data = await res.json();

  els.updatedAt.textContent = data.generatedAt ? new Date(data.generatedAt).toLocaleString('pl-PL') : '-';

  const all = Array.isArray(data.items) ? data.items : [];

  tagLabels = data.tagLabels || {};
  if (Array.isArray(data.tagKinds) && data.tagKinds.length) tagKinds = data.tagKinds;

  for (const src of [...new Set(all.map((it) => it.source))].sort()) {
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src;
    els.source.appendChild(opt);
  }

  if (els.tag) {
    const today = todayInWarsaw();
    const counts = {};
    for (const it of all) {
      if (!it.deadline || it.deadline < today) continue;
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

  // Restore URL parameters if present
  const params = new URLSearchParams(window.location.search);
  if (params.has('source') && [...els.source.options].some((o) => o.value === params.get('source'))) {
    els.source.value = params.get('source');
  }
  if (params.has('tag') && els.tag && [...els.tag.options].some((o) => o.value === params.get('tag'))) {
    els.tag.value = params.get('tag');
  }
  if (params.has('sort') && els.sort && [...els.sort.options].some((o) => o.value === params.get('sort'))) {
    els.sort.value = params.get('sort');
  }
  if (params.has('view') && els.userView && [...els.userView.options].some((o) => o.value === params.get('view'))) {
    els.userView.value = params.get('view');
  }
  if (params.has('active') && params.get('active') === '0') {
    els.activeOnly.checked = false;
  }
  if (params.has('q')) {
    els.q.value = params.get('q');
  }

  function rerender() {
    const filtered = applyFilters(all);
    const sortMode = els.sort ? els.sort.value : 'deadline-asc';

    filtered.sort((a, b) => {
      if (sortMode === 'published-desc') {
        const pa = a.publishedAt || '';
        const pb = b.publishedAt || '';
        return pb.localeCompare(pa);
      }
      if (sortMode === 'prize-desc') {
        const va = a.prize?.value || 0;
        const vb = b.prize?.value || 0;
        if (vb !== va) return vb - va;
        const da = a.deadline || '9999-12-31';
        const db = b.deadline || '9999-12-31';
        return da.localeCompare(db);
      }
      if (sortMode === 'deadline-desc') {
        const da = a.deadline || '';
        const db = b.deadline || '';
        return db.localeCompare(da);
      }
      if (sortMode === 'title-asc') {
        return a.title.localeCompare(b.title, 'pl');
      }
      // Default: deadline-asc (nulls last)
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });

    render(filtered);
    syncUrl();

    if (els.userView) {
      els.userView.options[1].textContent = `⭐ Zapisane (${tracker.saved.length})`;
      els.userView.options[2].textContent = `✅ Wzięte (${tracker.entered.length})`;
    }
  }

  els.source.addEventListener('change', rerender);
  if (els.tag) els.tag.addEventListener('change', rerender);
  if (els.sort) els.sort.addEventListener('change', rerender);
  if (els.userView) els.userView.addEventListener('change', rerender);
  els.activeOnly.addEventListener('change', rerender);
  els.q.addEventListener('input', rerender);

  els.list.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-tag]');
    if (chip && els.tag) {
      const slug = chip.getAttribute('data-tag');
      els.tag.value = els.tag.value === slug ? 'all' : slug;
      rerender();
      els.tag.scrollIntoView({ block: 'nearest' });
      return;
    }

    const saveBtn = ev.target.closest('[data-save]');
    if (saveBtn) {
      const id = saveBtn.getAttribute('data-save');
      const idx = tracker.saved.indexOf(id);
      if (idx >= 0) tracker.saved.splice(idx, 1);
      else tracker.saved.push(id);
      saveTracker(tracker);
      rerender();
      return;
    }

    const enteredBtn = ev.target.closest('[data-entered]');
    if (enteredBtn) {
      const id = enteredBtn.getAttribute('data-entered');
      const idx = tracker.entered.indexOf(id);
      if (idx >= 0) tracker.entered.splice(idx, 1);
      else tracker.entered.push(id);
      saveTracker(tracker);
      rerender();
      return;
    }

    const copyBtn = ev.target.closest('[data-copy-id]');
    if (copyBtn) {
      const id = copyBtn.getAttribute('data-copy-id');
      const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(id)}`;
      navigator.clipboard?.writeText(url).then(() => {
        const oldText = copyBtn.textContent;
        copyBtn.textContent = '✔ Skopiowano!';
        setTimeout(() => { copyBtn.textContent = oldText; }, 2000);
      }).catch(() => {});
      return;
    }

    const calLink = ev.target.closest('.btn--cal');
    if (calLink && (ev.shiftKey || ev.altKey)) {
      ev.preventDefault();
      downloadIcs(
        calLink.getAttribute('data-title') || '',
        calLink.getAttribute('data-deadline') || '',
        calLink.getAttribute('data-url') || '',
        'Konkurs z listy polish-sweepstakes'
      );
    }
  });

  rerender();

  // If a target card ID is passed in ?id=... or #...
  const targetId = params.get('id') || window.location.hash.slice(1);
  if (targetId) {
    const targetItem = all.find((it) => it.id === targetId);
    if (targetItem && (!targetItem.deadline || targetItem.deadline < todayInWarsaw())) {
      els.activeOnly.checked = false;
      rerender();
    }
    setTimeout(() => {
      const cardEl = document.getElementById(targetId);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cardEl.classList.add('card--highlight');
      }
    }, 120);
  }
}

load().catch((e) => {
  if (!els.list.children.length) {
    els.list.innerHTML = `<div class="card"><h2>Błąd</h2><p class="muted">${escapeHtml(e.message)}</p></div>`;
  }
});
