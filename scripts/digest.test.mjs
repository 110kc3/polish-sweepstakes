import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyDigest } from './digest.mjs';

test('buildWeeklyDigest generates markdown sections with correct ranking and formatting', () => {
  const sampleItems = [
    {
      id: 'item-1',
      title: 'Konkurs Fotograficzny Lato',
      url: 'https://example.com/foto',
      deadline: '2026-11-10',
      source: 'test-source',
      prize: { summary: 'Aparat fotograficzny', value: 3500 },
      entry: { summary: 'Wyślij zdjęcie wakacyjne' },
      tags: { kategoria: ['fotografia'] },
      links: { regulamin: 'https://example.com/rules.pdf', organizer: 'https://example.com/org' }
    },
    {
      id: 'item-2',
      title: 'Wielka Loteria Gotówkowa',
      url: 'https://example.com/cash',
      deadline: '2026-11-20',
      source: 'test-source',
      prize: { summary: '10 000 zł gotówką', value: 10000 },
      entry: { summary: 'Wypełnij bezpłatny formularz' },
      tags: { kategoria: ['pieniadze'] },
      links: { regulamin: 'https://example.com/cash-rules.pdf' }
    },
    {
      id: 'item-3',
      title: 'Szybki Konkurs Kończący się Jutro',
      url: 'https://example.com/quick',
      deadline: '2026-11-05',
      source: 'test-source',
      prize: { summary: 'Zestaw kosmetyków', value: 200 },
      entry: { summary: 'Odpowiedz na pytanie' },
      tags: { kategoria: ['uroda'] }
    }
  ];

  const digest = buildWeeklyDigest(sampleItems, '2026-11-04T12:00:00.000Z');

  assert.match(digest, /# Tygodniowy Przegląd Konkursów Bez Zakupu \(Polska\)/);
  assert.match(digest, /Data publikacji: 2026-11-04/);
  assert.match(digest, /## ⏳ Ostatnia szansa — kończące się w najbliższych dniach/);
  assert.match(digest, /## 💰 Najwyższa pula nagród — najwyższe wygrane/);
  assert.match(digest, /## 🎨 Konkursy kreatywne — wykaż się talentem/);

  // Expiring check: item-3 (deadline 2026-11-05) should appear first in expiring section
  const expiringIndex = digest.indexOf('## ⏳ Ostatnia szansa');
  const highValueIndex = digest.indexOf('## 💰 Najwyższa pula');
  const expiringSection = digest.slice(expiringIndex, highValueIndex);
  assert.ok(expiringSection.includes('Szybki Konkurs Kończący się Jutro'));

  // High-value check: item-2 (10 000 zł) should appear in high-value section
  const creativeIndex = digest.indexOf('## 🎨 Konkursy kreatywne');
  const highValueSection = digest.slice(highValueIndex, creativeIndex);
  assert.ok(highValueSection.includes('Wielka Loteria Gotówkowa'));
  assert.match(highValueSection, /10[\s\u00a0]000\s*PLN/);

  // Creative check: item-1 (fotografia) should appear in creative section
  const creativeSection = digest.slice(creativeIndex);
  assert.ok(creativeSection.includes('Konkurs Fotograficzny Lato'));
  assert.ok(creativeSection.includes('[Regulamin](https://example.com/rules.pdf)'));
  assert.ok(creativeSection.includes('[Organizator](https://example.com/org)'));
});

test('buildWeeklyDigest handles empty list gracefully', () => {
  const digest = buildWeeklyDigest([], '2026-11-04T12:00:00.000Z');
  assert.match(digest, /_Brak zbliżających się terminów\._/);
  assert.match(digest, /_Brak wycenionych nagród w bieżącym zestawieniu\._/);
  assert.match(digest, /_Brak konkursów kreatywnych w bieżącym zestawieniu\._/);
});
