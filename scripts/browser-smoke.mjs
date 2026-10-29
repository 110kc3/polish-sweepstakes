// Reproducible Chromium gate: exercise production rendering on deterministic
// fixtures, then smoke-check the actual dist/ that CI is about to publish.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserFixture } from './browser-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const fixtureData = browserFixture(today);
const beforeWarsawMidnight = new Date(`${today}T12:00:00Z`);
beforeWarsawMidnight.setUTCDate(beforeWarsawMidnight.getUTCDate() - 1);
const warsawBoundaryInstant = new Date(`${beforeWarsawMidnight.toISOString().slice(0, 10)}T23:30:00Z`);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sweepstakes-browser-'));
let browser;
let server;
const failures = [];
let checks = 0;

function activeItems(data) {
  return data.items.filter(item => item.deadline && item.deadline >= today);
}

async function serve(roots) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.md': 'text/markdown', '.csv': 'text/csv', '.webmanifest': 'application/manifest+json' };
  const instance = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const prefix = Object.keys(roots).find(key => url.pathname.startsWith(`/${key}/`));
      if (!prefix) return res.writeHead(404).end();
      const dir = roots[prefix];
      const relative = decodeURIComponent(url.pathname.slice(prefix.length + 2)) || 'index.html';
      const file = path.resolve(dir, relative);
      if (!file.startsWith(dir + path.sep)) return res.writeHead(404).end();
      const content = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return instance;
}

async function context(options = {}, freeze = true) {
  const result = await browser.newContext({ timezoneId: 'America/Los_Angeles', ...options });
  const page = await result.newPage();
  page.on('pageerror', error => failures.push(error.message));
  // UTC and the browser's local calendar are yesterday at this instant, while
  // Warsaw has crossed midnight. Keeping today and excluding yesterday proves
  // deadline filtering uses the contest's calendar rather than either fallback.
  if (freeze) await page.clock.setFixedTime(warsawBoundaryInstant);
  return { context: result, page };
}

async function cardTitles(page) {
  return page.locator('article.card > h2').allTextContents();
}

function fixtureCard(page, title) {
  return page.locator('article.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

async function checkRulesFallback(page) {
  const fallback = fixtureCard(page, 'Regulamin zastępczy Rzeka');
  assert.equal(await fallback.locator('.actions a').count(), 2);
  assert.equal(await fallback.getByRole('link', { name: 'Strona konkursu', exact: true }).getAttribute('href'), 'https://organizer.example/enter/fallback');
  assert.equal(await fallback.getByRole('link', { name: 'Regulamin', exact: true }).count(), 0);
  assert.match(await fallback.locator('.warn').textContent(), /regulamin konkursu nie jest dostępny/i);
  const unverified = fixtureCard(page, 'Regulamin bez potwierdzonego zamiennika');
  assert.equal(await unverified.locator('.actions a').count(), 1, 'an unverified organizer must not be advertised as a working fallback');
  assert.equal(await unverified.getByRole('link', { name: 'Zobacz szczegóły' }).getAttribute('href'), 'https://source.example/contests/rules-unverified');
  assert.match(await unverified.locator('.warn').textContent(), /regulamin konkursu nie jest dostępny/i);
  checks++;
}

try {
  await fs.mkdir(path.join(temp, 'data'));
  await fs.cp(path.join(root, 'site'), path.join(temp, 'site'), { recursive: true });
  await fs.writeFile(path.join(temp, 'data', 'lotteries.json'), JSON.stringify(fixtureData));
  const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: temp, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout || 'Fixture build failed');
  const actualData = JSON.parse(await fs.readFile(path.join(root, 'dist', 'data', 'lotteries.json'), 'utf8'));
  assert.ok(Array.isArray(actualData.items) && actualData.items.length, 'Run npm run build before npm run test:browser');
  server = await serve({ fixture: path.join(temp, 'dist'), built: path.join(root, 'dist') });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const { page } = await context({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/fixture/`, { waitUntil: 'networkidle' });
  // Source options are only present after the data load and hydration completes.
  await page.locator('#source option[value="konkursiada"]').waitFor({ state: 'attached' });
  const expected = activeItems(fixtureData).map(item => item.title).sort();
  assert.deepEqual((await cardTitles(page)).sort(), expected);
  assert.match(await fixtureCard(page, 'Konkurs fotograficzny Atlas').locator('.deadline').textContent(), /dziś/);
  assert.equal(await page.locator('article.card').filter({ hasText: 'Status: unknown' }).count(), 0);
  assert.equal(await page.locator('article.card').filter({ hasText: 'Archiwalny konkurs Portret' }).count(), 0);
  checks++;
  const entry = fixtureCard(page, 'Konkurs filmowy Latarnia').locator('.row').filter({ has: page.locator('.k', { hasText: 'Jak wziąć udział' }) }).locator('.v');
  assert.equal(await entry.textContent(), fixtureData.items[1].entry.summary);
  assert.ok(!String(await entry.textContent()).startsWith('Jak wziąć udział'));
  checks++;
  await page.selectOption('#source', 'konkursiada');
  assert.equal(await page.locator('article.card').count(), expected.length - 1);
  await page.fill('#q', 'Atlas');
  assert.deepEqual(await cardTitles(page), ['Konkurs fotograficzny Atlas']);
  await page.locator('article.card [data-tag="zdjecie"]').click();
  assert.equal(await page.locator('#tag').inputValue(), 'zdjecie');
  assert.deepEqual(await cardTitles(page), ['Konkurs fotograficzny Atlas']);
  await page.fill('#q', '');
  await page.selectOption('#source', 'all');
  await page.selectOption('#tag', 'film');
  assert.deepEqual(await cardTitles(page), ['Konkurs filmowy Latarnia']);
  await page.selectOption('#tag', 'all');
  // Bookmarking and personal tracker checks
  const firstSave = page.locator('article.card [data-save]').first();
  const firstTitle = (await cardTitles(page))[0];
  await firstSave.click();
  await page.selectOption('#userView', 'saved');
  assert.deepEqual(await cardTitles(page), [firstTitle]);
  await page.selectOption('#userView', 'all');
  assert.deepEqual((await cardTitles(page)).sort(), expected);
  checks++;

  // Tracker JSON export test
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportTracker')
  ]);
  assert.match(download.suggestedFilename(), /^polish-sweepstakes-tracker-\d{4}-\d{2}-\d{2}\.json$/);

  // Tracker JSON import test
  const importPayload = JSON.stringify({
    version: 1,
    saved: [fixtureData.items[1].id],
    entered: [fixtureData.items[0].id]
  });
  await page.setInputFiles('#trackerFileInput', {
    name: 'test-tracker.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload, 'utf8')
  });
  await page.locator('#trackerStatus').filter({ hasText: /Wczytano/ }).waitFor({ timeout: 5000 });
  assert.match(await page.locator('#trackerStatus').textContent(), /Wczytano/);
  await page.selectOption('#userView', 'entered');
  assert.deepEqual(await cardTitles(page), [fixtureData.items[0].title]);
  await page.selectOption('#userView', 'all');
  checks++;

  // Calendar export action
  const calLink = page.locator('article.card .btn--cal').first();
  assert.ok(await calLink.isVisible());
  assert.match(await calLink.getAttribute('href'), /calendar\.google\.com\/calendar\/render/);
  checks++;

  // Sorting
  await page.selectOption('#sort', 'title-asc');
  assert.deepEqual(await cardTitles(page), [...expected].sort((a, b) => a.localeCompare(b, 'pl')));
  await page.selectOption('#sort', 'deadline-asc');
  checks++;

  // URL search parameter synchronization
  await page.fill('#q', 'Atlas');
  await page.waitForURL(url => url.searchParams.get('q') === 'Atlas');
  assert.ok(page.url().includes('q=Atlas'));
  await page.fill('#q', '');
  await page.waitForURL(url => !url.searchParams.has('q'));
  checks++;
  await page.uncheck('#activeOnly');
  assert.equal(await page.locator('article.card').count(), fixtureData.items.length);
  assert.equal(await page.locator('article.card').filter({ hasText: 'Status: unknown' }).count(), 1);
  await page.selectOption('#source', 'pepper');
  assert.deepEqual(await cardTitles(page), ['Archiwalny konkurs Portret']);
  await page.check('#activeOnly');
  assert.equal(await page.locator('article.card').count(), 0);
  await page.selectOption('#source', 'all');
  checks++;

  // Filter select dropdown styling: ensure dark background on select and options
  const selectBg = await page.locator('#source').evaluate(el => window.getComputedStyle(el).backgroundColor);
  assert.equal(selectBg, 'rgb(18, 26, 51)', 'Filter select must have dark card background');
  const optionBg = await page.locator('#source option').first().evaluate(el => window.getComputedStyle(el).backgroundColor);
  assert.notEqual(optionBg, 'rgba(0, 0, 0, 0)', 'Filter option background must not be transparent');
  assert.notEqual(optionBg, 'rgb(255, 255, 255)', 'Filter option background must not be white');
  checks++;

  await checkRulesFallback(page);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page overflows horizontally');
  assert.ok(await page.locator('#activeOnly').isVisible());
  checks++;
  const { page: noJs } = await context({ javaScriptEnabled: false });
  await noJs.goto(`${base}/fixture/`);
  assert.deepEqual((await cardTitles(noJs)).sort(), expected);
  const jsonld = JSON.parse((await noJs.locator('script[type="application/ld+json"]').allTextContents())[1]);
  assert.equal(jsonld.numberOfItems, expected.length);
  assert.deepEqual(jsonld.itemListElement.map(item => item.item.name).sort(), expected);
  await checkRulesFallback(noJs);
  checks++;
  const { page: failedFetch } = await context();
  await failedFetch.route('**/data/lotteries.json', route => route.abort());
  await failedFetch.goto(`${base}/fixture/`, { waitUntil: 'networkidle' });
  assert.deepEqual((await cardTitles(failedFetch)).sort(), expected);
  await checkRulesFallback(failedFetch);
  checks++;
  const { page: built } = await context({}, false);
  await built.goto(`${base}/built/`, { waitUntil: 'networkidle' });
  assert.equal(await built.locator('article.card').count(), activeItems(actualData).length);
  assert.equal(await built.locator('article.card').filter({ hasText: 'Status: unknown' }).count(), 0);
  const builtJsonld = JSON.parse((await built.locator('script[type="application/ld+json"]').allTextContents())[1]);
  assert.equal(builtJsonld.numberOfItems, activeItems(actualData).length);
  assert.deepEqual(builtJsonld.itemListElement.map(item => item.item.name).sort(), activeItems(actualData).map(item => item.title).sort());
  await built.uncheck('#activeOnly');
  assert.equal(await built.locator('article.card').count(), actualData.items.length);
  checks++;

  // Feed, active digest, and schema verification in built site
  const feedRes = await fetch(`${base}/built/feed.xml`);
  assert.equal(feedRes.status, 200);
  const feedText = await feedRes.text();
  assert.ok(feedText.includes('<rss version="2.0"'));
  assert.ok(feedText.includes('<channel>'));

  const activeMdRes = await fetch(`${base}/built/data/active.md`);
  assert.equal(activeMdRes.status, 200);
  const activeMdText = await activeMdRes.text();
  assert.ok(activeMdText.includes('# Aktywne konkursy'));

  const schemaRes = await fetch(`${base}/built/data/schema.json`);
  assert.equal(schemaRes.status, 200);

  const csvRes = await fetch(`${base}/built/data/lotteries.csv`);
  assert.equal(csvRes.status, 200);
  const csvText = await csvRes.text();
  assert.ok(csvText.startsWith('id,title,deadline'));

  const manifestRes = await fetch(`${base}/built/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200);
  const manifestJson = await manifestRes.json();
  assert.equal(manifestJson.name, 'Konkursy i loterie bez zakupu');
  checks++;

  // Social platform direct badges check on built site
  const socialBadgeCount = await built.locator('.badge--social').count();
  assert.ok(socialBadgeCount > 0, 'Expected social badges on built site');
  const instagramBadges = await built.locator('.badge--instagram').count();
  assert.ok(instagramBadges > 0, 'Expected at least one Instagram badge');
  const facebookBadges = await built.locator('.badge--facebook').count();
  assert.ok(facebookBadges > 0, 'Expected at least one Facebook badge');
  checks++;
  assert.deepEqual(failures, [], 'Browser page errors');
  console.log(`Browser smoke passed: ${checks} checks; fixtures plus ${activeItems(actualData).length} active built listings.`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
