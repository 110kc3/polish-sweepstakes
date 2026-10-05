import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    res.end(`<rss><channel><item><title>Konkurs fotograficzny z nagrodami</title><link>${base}/contest-123456</link><description>Wygraj książkę bez zakupu.</description></item></channel></rss>`);
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
    ],
  }));
  const result = spawnSync(process.execPath, [buildScript], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = await fs.readFile(path.join(dir, 'dist', 'index.html'), 'utf8');
  assert.ok(!html.includes('Expired fixture'));
  assert.ok(html.includes('Today fixture'));
  const data = JSON.parse(await fs.readFile(path.join(dir, 'dist', 'data', 'lotteries.json'), 'utf8'));
  assert.deepEqual(data.items.map(i => i.status), ['ended', 'active']);
});
