import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('site/app.js implements matchesPreset and addDaysToWarsawDate', () => {
  const code = fs.readFileSync('site/app.js', 'utf8');
  assert.ok(code.includes('function addDaysToWarsawDate'), 'Must define addDaysToWarsawDate');
  assert.ok(code.includes('function matchesPreset'), 'Must define matchesPreset');
  assert.ok(code.includes('updatePresetChipsUI'), 'Must define updatePresetChipsUI');
  assert.ok(code.includes('presetChips'), 'Must register presetChips element');
});

test('preset matching logic works as specified', () => {
  function addDaysToWarsawDate(todayStr, days) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function matchesPreset(it, preset, today) {
    if (!preset || preset === 'all') return true;
    if (preset === '72h') {
      const limit = addDaysToWarsawDate(today, 3);
      return Boolean(it.deadline && it.deadline >= today && it.deadline <= limit);
    }
    if (preset === 'high-value') {
      return (it.prize?.value || 0) >= 5000;
    }
    if (preset === 'new') {
      const limit = addDaysToWarsawDate(today, -7);
      return Boolean(it.publishedAt && it.publishedAt.slice(0, 10) >= limit);
    }
    if (preset === 'vouchers') {
      const slugs = (it.tags?.nagroda || []);
      return slugs.includes('voucher') || slugs.includes('karta-podarunkowa') || slugs.includes('bony');
    }
    return true;
  }

  const today = '2026-11-04';

  // 72h preset
  assert.equal(matchesPreset({ deadline: '2026-11-05' }, '72h', today), true);
  assert.equal(matchesPreset({ deadline: '2026-11-07' }, '72h', today), true);
  assert.equal(matchesPreset({ deadline: '2026-11-08' }, '72h', today), false);
  assert.equal(matchesPreset({ deadline: '2026-11-03' }, '72h', today), false);

  // high-value preset
  assert.equal(matchesPreset({ prize: { value: 5000 } }, 'high-value', today), true);
  assert.equal(matchesPreset({ prize: { value: 12000 } }, 'high-value', today), true);
  assert.equal(matchesPreset({ prize: { value: 4999 } }, 'high-value', today), false);
  assert.equal(matchesPreset({ prize: null }, 'high-value', today), false);

  // new preset
  assert.equal(matchesPreset({ publishedAt: '2026-11-02T10:00:00Z' }, 'new', today), true);
  assert.equal(matchesPreset({ publishedAt: '2026-10-25T10:00:00Z' }, 'new', today), false);

  // vouchers preset
  assert.equal(matchesPreset({ tags: { nagroda: ['voucher'] } }, 'vouchers', today), true);
  assert.equal(matchesPreset({ tags: { nagroda: ['karta-podarunkowa'] } }, 'vouchers', today), true);
  assert.equal(matchesPreset({ tags: { nagroda: ['gotowka'] } }, 'vouchers', today), false);
});

test('site/index.html includes presetChips container and chips', () => {
  const html = fs.readFileSync('site/index.html', 'utf8');
  assert.ok(html.includes('id="presetChips"'), 'index.html must contain presetChips container');
  assert.ok(html.includes('data-preset="72h"'), 'index.html must contain 72h preset button');
  assert.ok(html.includes('data-preset="high-value"'), 'index.html must contain high-value preset button');
  assert.ok(html.includes('data-preset="new"'), 'index.html must contain new preset button');
  assert.ok(html.includes('data-preset="vouchers"'), 'index.html must contain vouchers preset button');
});
