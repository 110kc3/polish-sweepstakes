import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('sw.js exists and defines service worker lifecycle', () => {
  const swPath = path.join(root, 'site', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'site/sw.js should exist');

  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.match(swContent, /CACHE_NAME\s*=/, 'defines CACHE_NAME');
  assert.match(swContent, /addEventListener\('install'/, 'handles install event');
  assert.match(swContent, /addEventListener\('activate'/, 'handles activate event');
  assert.match(swContent, /addEventListener\('fetch'/, 'handles fetch event');
  assert.match(swContent, /data\/lotteries\.json/, 'handles stale-while-revalidate for dataset');
});
