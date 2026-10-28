import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('schema.json accurately validates data/lotteries.json structure', async () => {
  const schemaPath = path.join(root, 'data', 'schema.json');
  const dataPath = path.join(root, 'data', 'lotteries.json');

  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));

  assert.equal(schema.title, 'PolishSweepstakesDataset');
  assert.equal(data.version, 2);
  assert.ok(Array.isArray(data.items) && data.items.length > 0);
  assert.ok(Array.isArray(data.tagKinds) && data.tagKinds.length > 0);
  assert.ok(typeof data.tagKindLabels === 'object');
  assert.ok(typeof data.tagLabels === 'object');
  assert.ok(typeof data.tagCounts === 'object');

  for (const item of data.items) {
    assert.ok(typeof item.id === 'string' && item.id.length > 0);
    assert.ok(typeof item.source === 'string' && item.source.length > 0);
    assert.ok(typeof item.title === 'string' && item.title.length > 0);
    assert.ok(typeof item.url === 'string' && item.url.startsWith('http'));
    assert.ok(['active', 'ended', 'unknown'].includes(item.status));
    assert.ok(item.links && typeof item.links === 'object');
    assert.ok(item.entry && typeof item.entry.summary === 'string');
    assert.ok(item.prize && typeof item.prize.summary === 'string');
    assert.equal(item.prize.currency, 'PLN');
    if (item.prize.value !== null && item.prize.value !== undefined) {
      assert.ok(Number.isInteger(item.prize.value) && item.prize.value > 0);
    }
  }
});
