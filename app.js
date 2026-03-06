const els = {
  list: document.getElementById('list'),
  updatedAt: document.getElementById('updatedAt'),
  source: document.getElementById('source'),
  activeOnly: document.getElementById('activeOnly'),
  q: document.getElementById('q'),
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const now = new Date();
  const end = new Date(isoDate + 'T23:59:59Z');
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function deadlineBadge(deadline) {
  if (!deadline) return `<span class="badge deadline">Brak daty</span>`;
  const d = daysUntil(deadline);
  const cls = d !== null && d <= 3 ? 'soon' : 'ok';
  const suffix = d !== null ? ` (${d} dni)` : '';
  return `<span class="badge deadline ${cls}">Do: ${escapeHtml(deadline)}${escapeHtml(suffix)}</span>`;
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

        <div class="row">
          <div class="k">Nagroda</div>
          <div class="v">${escapeHtml(it.prize?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="row">
          <div class="k">Jak wziąć udział</div>
          <div class="v">${escapeHtml(it.entry?.summary || 'Sprawdź w źródle.')}</div>
        </div>

        <div class="actions">
          <a class="btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">Zobacz szczegóły / regulamin</a>
        </div>
      </article>
    `;
  }).join('');
}

function applyFilters(all) {
  const source = els.source.value;
  const activeOnly = els.activeOnly.checked;
  const q = (els.q.value || '').trim().toLowerCase();

  const now = new Date();
  return all.filter((it) => {
    if (source !== 'all' && it.source !== source) return false;

    if (activeOnly) {
      if (it.deadline) {
        const end = new Date(it.deadline + 'T23:59:59Z');
        if (end < now) return false;
      }
      // If deadline missing: keep (unknown)
    }

    if (q) {
      const hay = `${it.title} ${it.prize?.summary || ''} ${it.entry?.summary || ''}`.toLowerCase();
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
  els.activeOnly.addEventListener('change', rerender);
  els.q.addEventListener('input', rerender);

  rerender();
}

load().catch((e) => {
  els.list.innerHTML = `<div class="card"><h2>Błąd</h2><p class="muted">${escapeHtml(e.message)}</p></div>`;
});
