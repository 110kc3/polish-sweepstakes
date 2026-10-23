import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { main as check } from './check.mjs';

const buildScript = fileURLToPath(new URL('./build.mjs', import.meta.url));
const sitePath = fileURLToPath(new URL('../site', import.meta.url));

function item(id, base, links, verification) {
  return {
    id: `fixture:${id}`, source: 'fixture', sourceId: id,
    title: `Contest ${id}`, url: `${base}/source-${id}`,
    deadline: '2999-12-31', status: 'active', tags: {},
    entry: { summary: 'Wyślij zdjęcie przez formularz.' },
    prize: { summary: 'Wygraj aparat.' }, links, verification,
  };
}

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-fallback-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('checker verifies organizers after dead rules and preserves preferred-target status', async t => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.url === '/gone.pdf' || req.url === '/dead-entry') return res.writeHead(404).end();
    if (req.url === '/maybe' || req.url === '/blocked.pdf') return res.writeHead(503).end();
    if (req.url === '/soft.pdf' || (req.url === '/head-soft.pdf' && req.method === 'HEAD')) {
      return res.writeHead(302, { Location: '/' }).end();
    }
    res.end('Contest page');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = await tempDir(t);
  const dataPath = path.join(dir, 'lotteries.json');
  const cases = [
    ['fallback', '/gone.pdf', '/entry', false, true],
    ['inconclusive-alternate', '/gone.pdf', '/maybe', false, null],
    ['dead-alternate', '/gone.pdf', '/dead-entry', false, false],
    ['healthy-rules', '/healthy.pdf', '/unused', true, null],
    ['head-soft-rules', '/head-soft.pdf', '/unused', true, null],
    ['soft-rules', '/soft.pdf', '/entry', false, true],
    ['dead-organizer', null, '/dead-entry', null, false],
    ['healthy-organizer', null, '/entry', null, true],
    ['inconclusive-rules', '/blocked.pdf', '/unused', null, null],
    ['missing-alternate', '/gone.pdf', null, false, null],
  ];
  await fs.writeFile(dataPath, JSON.stringify({ version: 2, items: cases.map(([id, rules, organizer]) => item(id, base, {
    regulamin: rules ? base + rules : null,
    organizer: organizer ? base + organizer : null,
  })) }));
  await check(dataPath);
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  assert.equal(data.version, 2);
  assert.equal(data.items.length, cases.length, 'dead rules never delete a reachable source article');
  for (const [id, rules, , rulesOk, organizerPageOk] of cases) {
    const verification = data.items.find(i => i.sourceId === id).verification;
    assert.equal(verification.sourceOk, true, id);
    assert.equal(verification.regulaminOk, rulesOk, id);
    assert.equal(verification.organizerPageOk, organizerPageOk, id);
    assert.equal(verification.organizerOk, rules ? rulesOk : organizerPageOk, id);
  }
  assert.ok(requests.includes('GET /gone.pdf'), 'HEAD 404 is confirmed with GET');
  assert.ok(requests.includes('GET /head-soft.pdf'), 'HEAD-only soft 404 is confirmed with GET');
  assert.ok(requests.includes('GET /soft.pdf'), 'real soft 404 is confirmed with GET');
  assert.ok(!requests.some(r => r.endsWith(' /unused')), 'healthy/inconclusive rules retain preference without extra organizer requests');
});

test('pre-rendered and client cards choose the same verified fallback and retain rules warnings', async t => {
  const base = 'https://fixture.example';
  const links = { regulamin: `${base}/rules.pdf`, organizer: `${base}/entry` };
  const records = [
    item('fallback', base, links, { organizerOk: false, regulaminOk: false, organizerPageOk: true }),
    item('inconclusive-alternate', base, links, { organizerOk: false, regulaminOk: false, organizerPageOk: null }),
    item('dead-alternate', base, links, { organizerOk: false, regulaminOk: false, organizerPageOk: false }),
    item('missing-alternate', base, { regulamin: links.regulamin }, { organizerOk: false, regulaminOk: false, organizerPageOk: null }),
    item('healthy-rules', base, links, { organizerOk: true, regulaminOk: true, organizerPageOk: null }),
    item('unknown-rules', base, links, { organizerOk: null, regulaminOk: null, organizerPageOk: null }),
    item('legacy-dead-rules', base, links, { organizerOk: false }),
    item('legacy-unverified', base, links),
    item('dead-organizer', base, { organizer: links.organizer }, { organizerOk: false, regulaminOk: null, organizerPageOk: false }),
    item('legacy-dead-organizer', base, { organizer: links.organizer }, { organizerOk: false }),
    item('unknown-organizer', base, { organizer: links.organizer }, { organizerOk: null, regulaminOk: null, organizerPageOk: null }),
  ];
  const expectedTargets = [links.organizer, null, null, null, links.regulamin, links.regulamin, null, links.regulamin, null, null, links.organizer];
  const dir = await tempDir(t);
  await fs.mkdir(path.join(dir, 'data'));
  await fs.cp(sitePath, path.join(dir, 'site'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data', 'lotteries.json'), JSON.stringify({ generatedAt: new Date().toISOString(), items: records }));
  const result = spawnSync(process.execPath, [buildScript], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = parse(await fs.readFile(path.join(dir, 'dist', 'index.html'), 'utf8'));
  const cards = html.querySelectorAll('article.card');
  assert.equal(cards.length, records.length);
  const app = await fs.readFile(path.join(sitePath, 'app.js'), 'utf8');
  const context = vm.createContext({ document: { getElementById: () => ({}) } });
  vm.runInContext(app.slice(0, app.lastIndexOf('load().catch')), context);
  for (let n = 0; n < records.length; n++) {
    const record = records[n];
    const card = cards.find(c => c.querySelector('h2').text === record.title);
    const secondary = card.querySelector('a[rel="noopener nofollow"]');
    const clientLink = parse(context.contestLink(record)).querySelector('a');
    assert.equal(secondary?.getAttribute('href') || null, expectedTargets[n], record.id);
    assert.equal(clientLink?.getAttribute('href') || null, expectedTargets[n], record.id);
    assert.equal(card.querySelector('.actions a').getAttribute('href'), record.url, 'source article CTA stays available');
    if (record.links.regulamin && record.verification?.organizerOk === false) {
      assert.match(card.querySelector('.warn').text, /regulamin konkursu nie jest dostępny/, record.id);
      assert.match(context.organizerWarning(record), /regulamin konkursu nie jest dostępny/, record.id);
    }
  }
  assert.equal(cards.find(c => c.querySelector('h2').text === 'Contest fallback').querySelector('a[rel="noopener nofollow"]').text, 'Strona konkursu');
  assert.equal(cards.find(c => c.querySelector('h2').text === 'Contest healthy-rules').querySelector('a[rel="noopener nofollow"]').text, 'Regulamin');
});
