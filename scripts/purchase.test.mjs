import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { requiresPurchase } from './extract.mjs';
import { main as scrape } from './scrape.mjs';

test('purchase requirements are not overridden by negated or question-shaped free claims', () => {
  for (const text of [
    'Czy można bez zakupu? Nie, zachowaj paragon.',
    'Czy udział jest możliwy bez zakupu? Nie. Kup produkt i zgłoś paragon.',
    'To nie jest konkurs bez zakupu. Kup 2 napoje i zachowaj paragon.',
    'Nie można wziąć udziału bez zakupu. Konieczny jest paragon.',
    'Brak możliwości zgłoszenia bez zakupu. Wpisz numer zamówienia.',
    'Udział bez zakupu jest niemożliwy. Wymagany jest zakup produktu.',
    'Udział bez zakupu nie jest możliwy. Wymagany jest paragon.',
    'Udział bez zakupu nie jest dopuszczalny. Wyślij paragon.',
    'Bez zakupu nie weźmiesz udziału. Zachowaj paragon.',
    'Musisz kupić napoje i zachować paragon.',
    'Wpisowe wynosi 0,50 zł, konkurs bez zakupu.',
  ]) assert.equal(requiresPurchase(text), true, text);
});

test('affirmative free entry and genuine alternatives survive purchase text filtering', () => {
  for (const text of [
    'Konkurs bez zakupu — wystarczy komentarz.',
    'Udział nie wymaga zakupu ani paragonu. Napisz wiersz.',
    'Zakup nie jest wymagany. Możesz wysłać zdjęcie bez paragonu.',
    'Nie trzeba nic kupować. Wystarczy komentarz.',
    'Nie potrzebujesz paragonu. Napisz wiersz i wyślij zgłoszenie.',
    'Paragon nie jest wymagany. Napisz swoją odpowiedź.',
    'Kup produkt i wyślij paragon. Alternatywnie zgłoś się bez zakupu przez formularz.',
    'Zachowaj dowód zakupu albo skorzystaj z alternatywnej metody bez konieczności zakupu.',
    'Czy trzeba kupować? Nie, udział nie wymaga zakupu ani paragonu.',
    'Wpisowe 0 zł. Napisz odpowiedź i wygraj.',
  ]) assert.equal(requiresPurchase(text), false, text);
});

function wpPost(id, title, content, overrides = {}) {
  return {
    id, date: '2026-10-01T00:00:00', modified: '2026-10-01T00:00:00',
    title: { rendered: title }, excerpt: { rendered: '' }, content: { rendered: content },
    categories: [3], tags: [], ...overrides,
  };
}

async function wpFixture(t, posts) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-purchase-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    if (/\/(?:categories|tags)$/.test(url.pathname)) return res.end('[]');
    if (url.pathname.endsWith('/posts')) {
      const origin = `http://127.0.0.1:${server.address().port}`;
      return res.end(JSON.stringify(posts.map(p => ({ ...p, link: `${origin}/article/${p.id}` }))));
    }
    res.writeHead(404).end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { dir, base: `http://127.0.0.1:${server.address().port}` };
}

test('all WordPress feeds reject both Ofree purchase regressions and retain free-entry contests', async t => {
  // Shapes observed in Ofree 10216 (bought drinks/receipt) and 10238 (10zl food/receipt),
  // despite their placement in the source's free-entry category.
  const { dir, base } = await wpFixture(t, [
    wpPost(10216, 'Ceramika za kody spod nakrętek', '<p>Musisz kupić napoje i zachować paragon.</p><p>Do dnia 30.10.2999.</p>'),
    wpPost(10238, 'Loteria Gourmet', '<p>Kup karmę za co najmniej 10 zł i wyślij zgłoszenie z paragonem.</p><p>Do dnia 30.11.2999.</p>'),
    wpPost(9001, 'Konkurs fotograficzny bez zakupu', '<p>Wystarczy przesłać własne zdjęcie do dnia 31.12.2999.</p>'),
    wpPost(9002, 'Alternatywna metoda udziału', '<p>Kup produkt i zgłoś paragon. Alternatywnie zgłoś wiersz bez zakupu.</p><p>Do dnia 31.12.2999.</p>'),
    wpPost(9003, 'Czy można bez zakupu?', '<p>Nie, wymagany jest zakup produktu i zachowanie paragonu.</p><p>Do dnia 31.12.2999.</p>'),
    // The source must still exclude purchase categories even when its API ignores the query.
    wpPost(9004, 'Inna kategoria', '<p>Napisz wiersz do dnia 31.12.2999.</p>', { categories: [89] }),
  ]);
  const dataPath = path.join(dir, 'lotteries.json');
  const names = ['fajnekonkursy', 'ofree', 'wygrajta'];
  await scrape({
    dataPath,
    sources: names.map(source => ({
      source, type: 'wp', baseUrl: base, wpPostsEndpoint: '/posts',
      categories: [3], excludeCategories: [89], maxPages: 1,
    })),
  });
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.version, 2);
  // Cross-source title merging leaves two contests, each present on all three feeds.
  assert.deepEqual(data.items.map(i => i.sourceId).sort(), [9001, 9002]);
  assert.ok(data.items.every(i => i.alsoOn.length === 2));
  assert.deepEqual(data.sourceHealth.map(i => ({ source: i.source, status: i.status, items: i.items })),
    names.map(source => ({ source, status: 'ok', items: 2 })));
});

test('filtering every WordPress item never replaces the previous dataset with empty data', async t => {
  const { dir, base } = await wpFixture(t, [
    wpPost(10238, 'Loteria Gourmet', '<p>Kup karmę za 10 zł i wyślij paragon do dnia 31.12.2999.</p>'),
  ]);
  const dataPath = path.join(dir, 'lotteries.json');
  const original = '{"items":[{"id":"previous"}]}\n';
  await fs.writeFile(dataPath, original);
  await assert.rejects(scrape({ dataPath, sources: [{ source: 'ofree', type: 'wp', baseUrl: base, wpPostsEndpoint: '/posts', maxPages: 1 }] }), /no usable items/);
  assert.equal(await fs.readFile(dataPath, 'utf8'), original);
});
