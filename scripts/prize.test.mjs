import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPrizeValue } from './extract.mjs';

test('extractPrizeValue extracts simple Polish currency amounts', () => {
  assert.equal(extractPrizeValue('Wygraj 500 zł na zakupy.'), 500);
  assert.equal(extractPrizeValue('Karta podarunkowa o wartości 1000 PLN.'), 1000);
  assert.equal(extractPrizeValue('Nagroda: 250 zł w gotówce.'), 250);
  assert.equal(extractPrizeValue('Pula nagród: 5000 złotych.'), 5000);
});

test('extractPrizeValue parses space-separated thousands', () => {
  assert.equal(extractPrizeValue('Bon wycieczkowy o wartości 60 000 zł do Tokio.'), 60000);
  assert.equal(extractPrizeValue('Główna nagroda wynosi 15 000 PLN.'), 15000);
  assert.equal(extractPrizeValue('Nagroda 100 000 zł!'), 100000);
});

test('extractPrizeValue parses dot-separated thousands', () => {
  assert.equal(extractPrizeValue('Pula nagród wynosi 15.000 zł.'), 15000);
  assert.equal(extractPrizeValue('Wygraj nawet 25.000 PLN w konkursie.'), 25000);
});

test('extractPrizeValue handles decimals and selects maximum prize amount', () => {
  assert.equal(extractPrizeValue('Czeki o wartości 100 i 200 zł.'), 200);
  assert.equal(extractPrizeValue('I nagroda: 10 000 zł, II nagroda: 5 000 zł, III nagroda: 1 000 zł.'), 10000);
  assert.equal(extractPrizeValue('Voucher o wartości 1 500,00 zł do sklepu.'), 1500);
});

test('extractPrizeValue checks title when combined with summary', () => {
  assert.equal(extractPrizeValue('Sprawdź nagrody w źródle.', 'Wygraj 10 000 zł w konkursie fotograficznym'), 10000);
});

test('extractPrizeValue rejects false positives and non-currency text', () => {
  assert.equal(extractPrizeValue('Wygraj złoty medal oraz puchar.'), null);
  assert.equal(extractPrizeValue('Książka i zestaw gadżetów.'), null);
  assert.equal(extractPrizeValue('Sprawdź nagrody w źródle.'), null);
  assert.equal(extractPrizeValue(''), null);
  assert.equal(extractPrizeValue(null), null);
});
