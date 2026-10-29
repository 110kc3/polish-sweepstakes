import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { main as scrape } from './scrape.mjs';
import { main as check } from './check.mjs';
import { todayInWarsaw } from './extract.mjs';

const buildScript = fileURLToPath(new URL('./build.mjs', import.meta.url));

async function fixture(t, handler) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { dir, base: `http://127.0.0.1:${server.address().port}` };
}

function item(base, route, overrides = {}) {
  return {
    id: 'pepper:123456', source: 'pepper', sourceId: '123456',
    title: 'Konkurs fotograficzny z nagrodami', url: base + route,
    deadline: null, status: 'unknown', tags: {}, links: {},
    entry: {}, prize: {}, ...overrides,
  };
}

test('a total source outage rejects the scrape and preserves the previous dataset', async t => {
  const { dir, base } = await fixture(t, (_, res) => res.writeHead(503).end());
  const dataPath = path.join(dir, 'lotteries.json');
  const original = '{"items":[{"id":"previous"}]}\n';
  await fs.writeFile(dataPath, original);
  await assert.rejects(scrape({ dataPath, sources: [{ source: 'test', type: 'rss', feedUrl: base }] }), /no usable items/);
  assert.equal(await fs.readFile(dataPath, 'utf8'), original);
});

test('an empty or malformed feed cannot replace the previous dataset', async t => {
  const { dir, base } = await fixture(t, (_, res) => res.end('<html>maintenance</html>'));
  const dataPath = path.join(dir, 'lotteries.json');
  await fs.writeFile(dataPath, '{}');
  await assert.rejects(scrape({ dataPath, sources: [{ source: 'test', type: 'rss', feedUrl: base }] }), /no usable items/);
  assert.equal(await fs.readFile(dataPath, 'utf8'), '{}');
});

test('one broken source still publishes a healthy source and records the outage', async t => {
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/bad') return res.writeHead(503).end();
    res.end(`<rss><channel><item><title>Konkurs fotograficzny z nagrodami</title><link>${base}/contest-123456</link><description>Wygraj książkę bez zakupu.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
  });
  const dataPath = path.join(dir, 'lotteries.json');
  await scrape({ dataPath, sources: [
    { source: 'bad', type: 'rss', feedUrl: base + '/bad' },
    { source: 'pepper', type: 'rss', feedUrl: base, idPattern: /-(\d+)$/ },
  ] });
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.items.length, 1);
  assert.equal(data.sourceHealth[0].status, 'error');
  assert.deepEqual(data.sourceHealth[1], { source: 'pepper', status: 'ok', items: 1 });
});

test('verification confirms HEAD soft-404s and promotes an alternative with consistent identity', async t => {
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/head-only' && req.method === 'HEAD') return res.writeHead(302, { Location: '/' }).end();
    if (req.url === '/gone') return res.writeHead(404).end();
    if (req.url === '/soft') return res.writeHead(302, { Location: '/' }).end();
    res.end('Contest page');
  });
  const dataPath = path.join(dir, 'lotteries.json');
  await fs.writeFile(dataPath, JSON.stringify({ items: [
    item(base, '/head-only'),
    item(base, '/gone', { id: 'pepper:2', sourceId: '2', alsoOn: [{ source: 'ofree', id: 'ofree:987', url: base + '/live' }] }),
    item(base, '/soft', { id: 'pepper:3' }),
  ] }));
  await check(dataPath);
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].verification.sourceOk, true);
  assert.equal(data.items[1].id, 'ofree:987');
  assert.equal(data.items[1].sourceId, '987');
  assert.equal(data.items[1].verification.promotedFrom, 'pepper:2');
});

test('a refused connection is inconclusive and does not delete a contest', async t => {
  const { dir } = await fixture(t, (_, res) => res.end());
  const closed = http.createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${closed.address().port}`;
  await new Promise(resolve => closed.close(resolve));
  const dataPath = path.join(dir, 'lotteries.json');
  await fs.writeFile(dataPath, JSON.stringify({ items: [item(base, '/contest')] }));
  await check(dataPath);
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].verification.sourceOk, null);
});

test('build rejects missing, malformed and empty data before replacing a good build', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-build-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'dist'));
  await fs.mkdir(path.join(dir, 'data'));
  const sentinel = path.join(dir, 'dist', 'index.html');
  await fs.writeFile(sentinel, 'previous good build');
  for (const content of [null, '{bad json', '{"items":[],"generatedAt":"2026-10-05T00:00:00Z"}']) {
    if (content !== null) await fs.writeFile(path.join(dir, 'data', 'lotteries.json'), content);
    const result = spawnSync(process.execPath, [buildScript], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'previous good build');
  }
});

test('build recomputes stale statuses for HTML and JSON even if checking was skipped', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-build-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'data'));
  await fs.cp(fileURLToPath(new URL('../site', import.meta.url)), path.join(dir, 'site'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data', 'lotteries.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), items: [
      item('https://example.com', '/expired', { title: 'Expired fixture', deadline: '2000-01-01', status: 'active' }),
      item('https://example.com', '/today', { title: 'Today fixture', deadline: todayInWarsaw(), status: 'ended' }),
      item('https://example.com', '/unknown', { title: 'Unknown fixture', deadline: null, status: 'active' }),
    ],
  }));
  const result = spawnSync(process.execPath, [buildScript], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = await fs.readFile(path.join(dir, 'dist', 'index.html'), 'utf8');
  assert.ok(!html.includes('Expired fixture'));
  assert.ok(html.includes('Today fixture'));
  assert.ok(!html.includes('Unknown fixture'));
  const data = JSON.parse(await fs.readFile(path.join(dir, 'dist', 'data', 'lotteries.json'), 'utf8'));
  assert.deepEqual(data.items.map(i => i.status), ['ended', 'active', 'unknown']);
});

test('the browser active filter requires a known deadline and keeps today', async () => {
  const controls = Object.fromEntries(['list', 'updatedAt', 'source', 'tag', 'activeOnly', 'q'].map(id => [id, { value: '', checked: true }]));
  controls.source.value = controls.tag.value = 'all';
  const context = vm.createContext({ document: { getElementById: id => controls[id] } });
  const script = await fs.readFile(fileURLToPath(new URL('../site/app.js', import.meta.url)), 'utf8');
  vm.runInContext(script.slice(0, script.lastIndexOf('load().catch')), context);
  const records = [item('', '/today', { deadline: todayInWarsaw() }), item('', '/unknown'), item('', '/ended', { deadline: '2000-01-01' })];
  assert.deepEqual(Array.from(context.applyFilters(records), i => i.url), ['/today']);
  controls.activeOnly.checked = false;
  assert.equal(context.applyFilters(records).length, 3);
});

test('RSS articles recover organizer links and cache extraction without repeating page requests', async t => {
  let articleRequests = 0;
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/feed') return res.end(`<rss><channel><item><title>Konkurs fotograficzny</title><link>${base}/article</link><description>Wygraj aparat.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    articleRequests++;
    res.end('<nav><a href="https://unrelated.example">Reklama</a></nav><div class="desc_content">'
      + '<p>Pracę należy przesłać przez formularz.</p><p>Termin: do 31.12.2999</p>'
      + '<p><a href="https://organizer.example/enter">Strona konkursu</a></p>'
      + '<p>Regulamin: <a href="https://organizer.example/rules.pdf">tutaj</a></p></div>');
  });
  const dataPath = path.join(dir, 'lotteries.json');
  const sources = [{ source: 'aktualnekonkursy', type: 'rss', feedUrl: base + '/feed', detailSelector: '.desc_content' }];
  await scrape({ dataPath, sources });
  const first = JSON.parse(await fs.readFile(dataPath, 'utf8')).items[0];
  assert.deepEqual(first.links, { organizer: 'https://organizer.example/enter', regulamin: 'https://organizer.example/rules.pdf' });
  assert.match(first.entry.summary, /Pracę należy przesłać/);
  assert.equal(first.deadline, '2999-12-31');
  assert.ok(first.extraction.detailFetchedAt);
  await scrape({ dataPath, sources });
  const second = JSON.parse(await fs.readFile(dataPath, 'utf8')).items[0];
  assert.equal(articleRequests, 1);
  assert.deepEqual(second.links, first.links);
  assert.equal(second.entry.summary, first.entry.summary);
  assert.deepEqual(second.tags, first.tags);
  const stale = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  stale.items[0].extraction.detailFetchedAt = '2000-01-01T00:00:00Z';
  await fs.writeFile(dataPath, JSON.stringify(stale));
  await scrape({ dataPath, sources });
  assert.equal(articleRequests, 2, 'expired details are refreshed');
});

test('a failed RSS detail page preserves the feed listing and retries next run', async t => {
  let articleRequests = 0;
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/feed') return res.end(`<rss><channel><item><title>Konkurs fotograficzny</title><link>${base}/article</link><description>Wygraj aparat do 31.12.2999.</description></item></channel></rss>`);
    articleRequests++;
    res.end('<html>Maintenance, no contest body</html>');
  });
  const dataPath = path.join(dir, 'lotteries.json');
  const sources = [{ source: 'aktualnekonkursy', type: 'rss', feedUrl: base + '/feed', detailSelector: '.desc_content' }];
  await scrape({ dataPath, sources });
  assert.equal(JSON.parse(await fs.readFile(dataPath, 'utf8')).items.length, 1);
  await scrape({ dataPath, sources });
  assert.equal(articleRequests, 2);
});

test('Konkursiada extracts actual entry steps, invalidates old caches and excludes order-required contests', async t => {
  let articleRequests = 0;
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url.startsWith('/posts')) return res.setHeader('Content-Type', 'application/json').end(JSON.stringify([
      { id: 1, title: { rendered: 'Konkurs filmowy z nagrodami' }, link: base + '/free', modified: '2026-10-01', class_list: ['warunki-film'] },
      { id: 2, title: { rendered: 'Konkurs wymagający zamówienia' }, link: base + '/paid', modified: '2026-10-01', class_list: [] },
    ]));
    articleRequests++;
    res.end('<p class="dates">01.10.2026 – 31.12.2999</p><article class="konkurs-post"><div class="content">'
      + '<h2>Jak wziąć udział w konkursie?</h2>'
      + (req.url === '/paid' ? '<p>Wpisz numer zamówienia w formularzu.</p>' : '<p>1. Nagraj krótki film.</p><p>2. Opublikuj go na Instagramie.</p>')
      + '<h2>Nagrody w konkursie</h2><p>Wygraj aparat!</p></div>'
      + '<a href="https://organizer.example/enter">Strona konkursu</a></article>');
  });
  const dataPath = path.join(dir, 'lotteries.json');
  const sources = [{ source: 'konkursiada', type: 'wp-cpt', baseUrl: base, wpPostsEndpoint: '/posts' }];
  await scrape({ dataPath, sources });
  const first = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].entry.summary, 'Nagraj krótki film. Opublikuj go na Instagramie.');
  assert.equal(first.items[0].links.organizer, 'https://organizer.example/enter');
  first.items[0].extraction.detailVersion--;
  first.items[0].entry.summary = 'Jak wziąć udział w konkursie?';
  await fs.writeFile(dataPath, JSON.stringify(first));
  await scrape({ dataPath, sources });
  assert.equal(articleRequests, 4);
  assert.equal(JSON.parse(await fs.readFile(dataPath, 'utf8')).items[0].entry.summary, 'Nagraj krótki film. Opublikuj go na Instagramie.');
});

test('Pepper fixture drops support threads, swaps and stale unknowns while keeping genuine contests', async t => {
  const { dir, base } = await fixture(t, (_, res) => {
    const rows = [
      ['Jak odebrać voucher od Peppera?', 'Dyskusja o konkursie i nagrodach.', new Date().toUTCString()],
      ['Oddam kupon 10% do sklepu', 'Wygraj zniżkę.', new Date().toUTCString()],
      ['Konkurs fotograficzny z nagrodami', 'Wygraj aparat. Napisz komentarz.', 'Mon, 01 Jan 2024 00:00:00 GMT'],
      ['Konkurs filmowy z nagrodami', 'Wygraj aparat. Nagraj film do 31.12.2999.', 'Mon, 01 Jan 2024 00:00:00 GMT'],
      ['Wygraj książkę!', 'Napisz komentarz.', new Date().toUTCString()],
    ];
    res.end('<rss><channel>' + rows.map(([title, description, date], n) => `<item><title>${title}</title><link>${base}/contest-${123450 + n}</link><description>${description}</description><pubDate>${date}</pubDate></item>`).join('') + '</channel></rss>');
  });
  const dataPath = path.join(dir, 'lotteries.json');
  await scrape({ dataPath, sources: [{ source: 'pepper', type: 'rss', feedUrl: base, idPattern: /-(\d+)$/ }] });
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.deepEqual(data.items.map(i => i.title), ['Konkurs filmowy z nagrodami', 'Wygraj książkę!']);
});

test('KonkursyBlisko fixture extracts content:encoded details and resolves kb_join redirect', async t => {
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/feed') {
      return res.end(`<rss><channel><item>
        <title>Snuffy Jako Film</title>
        <link>${base}/konkurs/snuffy/</link>
        <guid>${base}/?post_type=kb_konkurs&amp;p=242</guid>
        <description>Snuffy Jako Film</description>
        <content:encoded><![CDATA[<p>Wygraj nagrody. Konkurs trwa do dnia 31 grudnia 2999.</p>]]></content:encoded>
      </item></channel></rss>`);
    }
    if (req.url === '/konkurs/snuffy/') {
      return res.end(`<article class="kb-single-details">
        <h1>Snuffy Jako Film</h1>
        <p class="kb-organizer">Organizator Test Sp. z o.o.</p>
        <a href="${base}/?kb_join=242" class="kb-join-button">Weź udział!</a>
      </article>`);
    }
    if (req.url === '/?kb_join=242') {
      res.writeHead(302, { Location: 'https://instagram.com/p/test-contest' });
      return res.end();
    }
    res.writeHead(404).end();
  });
  const dataPath = path.join(dir, 'lotteries.json');
  await scrape({
    dataPath,
    sources: [{
      source: 'konkursyblisko',
      type: 'rss',
      feedUrl: base + '/feed',
      detailSelector: '.kb-single-details',
      idPattern: /[?&]p=(\d+)/,
    }],
  });
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, 'konkursyblisko:242');
  assert.equal(data.items[0].deadline, '2999-12-31');
  assert.equal(data.items[0].status, 'active');
  assert.equal(data.items[0].links.organizer, 'https://instagram.com/p/test-contest');
});

test('e-Konkursy fixture filters purchase-required items and enriches free entries with rules and deadline', async t => {
  const { dir, base } = await fixture(t, (req, res) => {
    if (req.url === '/feed') {
      return res.end(`<rss><channel>
        <item>
          <title>Konkurs z zakupem i paragonem</title>
          <link>${base}/konkurs/paid</link>
          <description>Kup 2 napoje i zachowaj paragon.</description>
        </item>
        <item>
          <title>Konkurs kreatywny bez zakupu</title>
          <link>${base}/konkurs/free</link>
          <description>Wymyśl wiersz. Nagrodą jest aparat fotograficzny.</description>
        </item>
      </channel></rss>`);
    }
    if (req.url === '/konkurs/free') {
      return res.end(`<div class="post-item">
        <a href="${base}/cdn-cgi/l/email-protection#123">Email</a>
        <p>Opublikowano 29.10.2026. Konkurs trwa do 2999-12-31.</p>
        <p>Napisz wiersz w komentarzu.</p>
        <a href="https://organizer.example/contest" class="btn btn-success">Przejdź do strony z konkursem</a>
        <a href="https://organizer.example/regulamin.pdf" class="btn btn-info">Zobacz regulamin</a>
      </div>`);
    }
    res.writeHead(404).end();
  });
  const dataPath = path.join(dir, 'lotteries.json');
  await scrape({
    dataPath,
    sources: [{
      source: 'ekonkursy',
      type: 'rss',
      feedUrl: base + '/feed',
      detailSelector: '.post-item',
      idPattern: /\/konkurs\/([a-z0-9-]+)/,
    }],
  });
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, 'ekonkursy:free');
  assert.equal(data.items[0].deadline, '2999-12-31');
  assert.equal(data.items[0].status, 'active');
  assert.equal(data.items[0].links.organizer, 'https://organizer.example/contest');
  assert.equal(data.items[0].links.regulamin, 'https://organizer.example/regulamin.pdf');
});
