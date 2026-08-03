// Unit tests for the pure extraction and tagging logic.
// Run with: npm test   (node's built-in test runner, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTRY_PLACEHOLDER,
  allDates,
  bestSummary,
  cleanArticleText,
  extractDeadline,
  extractEntrySummary,
  extractLinks,
  extractPrizeSummary,
  isStaleUndated,
  isUsableLink,
  monthsAgoISO,
  parsePolishDateToISO,
  parseRssItems,
  requiresPurchase,
  sourceIdFrom,
  statusFor,
  stripText,
  titleKey,
  todayInWarsaw,
} from './extract.mjs';
import { buildTags, collectTagCounts, collectTagLabels, mergeTags, slugify } from './tags.mjs';
import { mergeDuplicates } from './scrape.mjs';

test('stripText drops script and style bodies', () => {
  const html = '<p>Wygraj nagrody</p><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><style>.a{color:red}</style>';
  assert.equal(stripText(html), 'Wygraj nagrody');
});

test('stripText collapses whitespace and handles empty input', () => {
  assert.equal(stripText('<p>a\n\n  b</p>'), 'a b');
  assert.equal(stripText(''), '');
  assert.equal(stripText(null), '');
});

test('isUsableLink rejects share intents, media and the aggregators themselves', () => {
  assert.equal(isUsableLink('https://example.com/konkurs'), true);
  assert.equal(isUsableLink('https://facebook.com/sharer/sharer.php?u=x'), false);
  assert.equal(isUsableLink('https://example.com/plakat.jpg'), false);
  assert.equal(isUsableLink('https://example.com/icons.svg#external-link'), false);
  assert.equal(isUsableLink('https://fajnekonkursy.pl/na-facebooku/x/'), false);
  assert.equal(isUsableLink('https://www.pepper.pl/dyskusji/x-123456'), false);
  assert.equal(isUsableLink('/relative/path'), false);
  assert.equal(isUsableLink('not a url'), false);
});

test('isUsableLink matches blocked domains on the hostname, not the query string', () => {
  // Regression: organizer links carry ?utm_source=konkursiada.pl and a substring
  // match discarded every one of them.
  assert.equal(isUsableLink('https://www.acer-chromebook-315.pl/?utm_source=konkursiada.pl&utm_medium=wpis'), true);
  assert.equal(isUsableLink('https://konkursiada.pl/nagrody/laptopy/'), false);
  // Subdomains of a blocked host stay blocked; lookalikes do not.
  assert.equal(isUsableLink('https://www.ofree.pl/x'), false);
  assert.equal(isUsableLink('https://ofree.pl.example.com/x'), true);
});

test('extractLinks prefers a regulamin link and picks an organizer separately', () => {
  const html = `
    <a href="https://example.com/konkurs">Strona konkursu</a>
    <a href="https://example.com/rules.pdf">Regulamin</a>
    <a href="https://example.com/regulamin">Zasady</a>`;
  const links = extractLinks(html);
  // The .pdf is blocked, so the regulamin comes from the URL-matched anchor.
  assert.equal(links.regulamin, 'https://example.com/regulamin');
  assert.equal(links.organizer, 'https://example.com/konkurs');
});

test('extractLinks returns nulls when there is nothing usable', () => {
  assert.deepEqual(extractLinks('<p>brak linków</p>'), { organizer: null, regulamin: null });
  assert.deepEqual(extractLinks(''), { organizer: null, regulamin: null });
});

test('parsePolishDateToISO handles numeric and Polish month names', () => {
  assert.equal(parsePolishDateToISO('25.08.2026'), '2026-08-25');
  assert.equal(parsePolishDateToISO('1-9-2026'), '2026-09-01');
  assert.equal(parsePolishDateToISO('11 sierpnia 2026'), '2026-08-11');
  assert.equal(parsePolishDateToISO('7 listopada 2026'), '2026-11-07');
});

test('parsePolishDateToISO rejects impossible and malformed dates', () => {
  assert.equal(parsePolishDateToISO('30.02.2026'), null);
  assert.equal(parsePolishDateToISO('32.01.2026'), null);
  assert.equal(parsePolishDateToISO('01.13.2026'), null);
  assert.equal(parsePolishDateToISO('11 sierpień 2026'), null); // wrong inflection
  assert.equal(parsePolishDateToISO('nonsense'), null);
});

test('extractDeadline prefers an explicitly marked deadline over a later date', () => {
  assert.equal(
    extractDeadline('Konkurs trwa od 01.07.2026, zgłoszenia do 11.08.2026, wyniki 30.09.2026'),
    '2026-08-11'
  );
  assert.equal(extractDeadline('Termin zgłaszania prac upływa do dnia 7 listopada 2026 r.'), '2026-11-07');
});

test('extractDeadline falls back to the latest date when nothing is marked', () => {
  assert.equal(extractDeadline('Trwa 13.07.2026 – 25.08.2026'), '2026-08-25');
  assert.equal(extractDeadline('brak dat'), null);
  assert.equal(extractDeadline(''), null);
});

test('extractDeadline needs a real word boundary before "do"', () => {
  // "do" inside another word must not qualify a date as the deadline; here the
  // marked date is the earlier one and must still win.
  assert.equal(extractDeadline('Zgłoszenia do 10.08.2026. Gala odbędzie się 20.12.2026'), '2026-08-10');
});

test('allDates returns every parseable date, ascending', () => {
  assert.deepEqual(
    allDates('01.01.2011, 31.12.2010 oraz 26 września 2026'),
    ['2010-12-31', '2011-01-01', '2026-09-26']
  );
});

test('extractPrizeSummary and extractEntrySummary fall back to a placeholder', () => {
  assert.equal(extractPrizeSummary('Wygraj laptopa Acer!'), 'Wygraj laptopa Acer!');
  assert.match(extractPrizeSummary('Nagrody: 5000 zł do podziału.'), /^Nagrod/);
  assert.equal(extractPrizeSummary(''), 'Sprawdź nagrody w źródle.');
  assert.match(extractEntrySummary('Jak wziąć udział w konkursie?'), /^Jak wziąć udział/);
  assert.equal(extractEntrySummary(''), ENTRY_PLACEHOLDER);
});

test('cleanArticleText strips the live countdown furniture', () => {
  const raw = 'Konkurs kończy się za: 0 0 0 0 Dni 0 0 Godz 0 0 Min 0 0 Sek Wygraj nagrody';
  assert.equal(cleanArticleText(raw), 'Wygraj nagrody');
  assert.equal(extractPrizeSummary(raw), 'Wygraj nagrody');
});

test('extractEntrySummary reads the bulleted task list the sources render', () => {
  const text = 'Konkurs kończy się za: 0 0 Dni 0 0 Sek Wygraj nagrody 🎁 • 1 x kolekcja zapachów '
    + 'Zasady konkursu Drogerie Natura na Facebooku „Harmoniq” Do dnia 16.08.2026 wykonaj poniższe zadania: '
    + '🔹wymyśl oryginalną odpowiedź na pytanie konkursowe 🔹swoje zgłoszenie opublikuj w komentarzu pod postem';
  const summary = extractEntrySummary(text);
  assert.match(summary, /^wymyśl oryginalną odpowiedź/);
  assert.match(summary, /; swoje zgłoszenie opublikuj/);
  assert.ok(!summary.includes('🔹'), 'bullet markers are stripped');
  assert.ok(!summary.includes('kończy się za'), 'countdown noise is gone');
});

test('extractEntrySummary falls back to an entry-verb sentence', () => {
  assert.match(
    extractEntrySummary('Zasady konkursu. Wystarczy polubić profil i napisać komentarz pod postem konkursowym.'),
    /^Wystarczy polubić profil/
  );
});

test('extractEntrySummary synthesises from mechanics when the text says nothing', () => {
  assert.equal(
    extractEntrySummary('Nagrody rzeczowe dla laureatów.', ['facebook', 'komentarz']),
    'Wymagane: facebook, komentarz — szczegóły i pełne zasady w źródle.'
  );
  // With neither text nor mechanics there is genuinely nothing to say.
  assert.equal(extractEntrySummary('Nagrody rzeczowe dla laureatów.', []), ENTRY_PLACEHOLDER);
});

test('extractEntrySummary prefers an explicit sentence over the task list', () => {
  const text = 'Jak wziąć udział w konkursie? Kliknij i wypełnij formularz. Następnie wykonaj poniższe zadania: 🔹coś';
  assert.match(extractEntrySummary(text), /^Jak wziąć udział w konkursie\?$/);
});

test('parseRssItems reads fields, unwraps CDATA and collects categories', () => {
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Konkurs „Bueno” Żabka]]></title>
      <link>https://www.pepper.pl/dyskusji/sephora-game-on-1326550</link>
      <description><![CDATA[<p>Wygraj bon</p>]]></description>
      <pubDate>Sun, 02 Aug 2026 13:42:39 +0200</pubDate>
      <guid>https://www.pepper.pl/dyskusji/sephora-game-on-1326550</guid>
      <category><![CDATA[Zdrowie i uroda]]></category>
      <category>Moda</category>
    </item>
    <item><title>Drugi</title><link>https://example.com/b,42</link></item>
  </channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Konkurs „Bueno” Żabka');
  assert.equal(items[0].description, '<p>Wygraj bon</p>');
  assert.deepEqual(items[0].categories, ['Zdrowie i uroda', 'Moda']);
  assert.equal(items[1].categories.length, 0);
  assert.deepEqual(parseRssItems(''), []);
});

test('requiresPurchase catches receipt promos but yields to an explicit "bez zakupu"', () => {
  assert.equal(requiresPurchase('Zeskanuj paragon i wygraj'), true);
  assert.equal(requiresPurchase('Kup 2 lody i wygraj wakacje'), true);
  assert.equal(requiresPurchase('Nagroda przy zakupie produktu'), true);
  assert.equal(requiresPurchase('Konkurs bez zakupu — wystarczy komentarz'), false);
  assert.equal(requiresPurchase('Napisz wiersz i wyślij zgłoszenie'), false);
  assert.equal(requiresPurchase(''), false);
});

test('sourceIdFrom uses the per-source pattern and never mistakes a year for an id', () => {
  const pepper = /-(\d{6,})\/?$/;
  const ak = /,(\d+)\/?$/;
  assert.equal(sourceIdFrom({ link: 'https://www.pepper.pl/dyskusji/kalendarz-adwentowy-2025-1172087' }, pepper), '1172087');
  assert.equal(sourceIdFrom({ link: 'https://aktualnekonkursy.pl/ad/konkursy-literackie,3/x,24356' }, ak), '24356');
  // Regression: a slug ending in a year must not become the id (that collided
  // across every item published in the same year).
  const yearOnly = { link: 'https://www.pepper.pl/dyskusji/konkurs-swiateczny-2025', guid: 'guid-1' };
  assert.equal(sourceIdFrom(yearOnly, pepper), 'guid-1');
  assert.equal(sourceIdFrom({ link: 'https://example.com/no-id' }, pepper), 'https://example.com/no-id');
});

test('statusFor uses the Warsaw date, and today still counts as active', () => {
  const today = todayInWarsaw();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(statusFor(today), 'active');
  assert.equal(statusFor('2999-01-01'), 'active');
  assert.equal(statusFor('2000-01-01'), 'ended');
  assert.equal(statusFor(null), 'unknown');
});

test('isStaleUndated only drops undated entries past the window', () => {
  assert.equal(isStaleUndated({ deadline: null, publishedAt: '2020-01-01T00:00:00' }), true);
  assert.equal(isStaleUndated({ deadline: null, publishedAt: monthsAgoISO(1) }), false);
  // A stated deadline always wins, however old the post is.
  assert.equal(isStaleUndated({ deadline: '2026-12-01', publishedAt: '2020-01-01T00:00:00' }), false);
  assert.equal(isStaleUndated({ deadline: null, publishedAt: null }), false);
});

test('titleKey normalises case, Polish diacritics and punctuation', () => {
  assert.equal(titleKey('Konkurs „Wymarzona KUCHNIA” — Ariete!'), 'konkurs wymarzona kuchnia ariete');
  assert.equal(titleKey('Łódź: zgłoś się'), 'lodz zglos sie');
  assert.equal(
    titleKey('XXX Międzynarodowe Biennale Fotografii „Zabytki”'),
    titleKey('xxx miedzynarodowe biennale fotografii zabytki')
  );
  assert.equal(titleKey(null), '');
});

test('bestSummary prefers real text over the placeholder', () => {
  const placeholder = 'Sprawdź nagrody w źródle.';
  assert.equal(bestSummary(placeholder, 'Wygraj laptop'), 'Wygraj laptop');
  assert.equal(bestSummary('Wygraj laptop', placeholder), 'Wygraj laptop');
  assert.equal(bestSummary('krótkie', 'dłuższe zdanie o nagrodzie'), 'dłuższe zdanie o nagrodzie');
  assert.equal(bestSummary(placeholder, placeholder), placeholder);
});

// --- tags -------------------------------------------------------------------

test('slugify produces ASCII slugs from Polish display names', () => {
  assert.equal(slugify('Zdrowie i uroda'), 'zdrowie-i-uroda');
  assert.equal(slugify('Żabka'), 'zabka');
  assert.equal(slugify('Dom i mieszkanie'), 'dom-i-mieszkanie');
  assert.equal(slugify(''), '');
});

test('buildTags maps konkursiada class_list terms into kinds', () => {
  const tags = buildTags({
    nativeSlugs: ['nagrody-laptopy', 'branze-branza-technologiczna', 'typy-konkurs', 'warunki-komentarz', 'firmy-acer', 'statusy-nowosc'],
  });
  assert.deepEqual(tags, {
    nagroda: ['laptop'],
    mechanika: ['komentarz'],
    temat: ['technologia'],
    marka: ['acer'],
  });
});

test('buildTags derives tags from article text when there is no taxonomy', () => {
  const tags = buildTags({ text: 'Dodaj komentarz pod postem na Instagramie i wygraj kartę podarunkową.' });
  assert.ok(tags.mechanika.includes('instagram'));
  assert.ok(tags.mechanika.includes('komentarz'));
  assert.ok(tags.nagroda.includes('karta-podarunkowa'));
});

test('buildTags does not read a cash prize into every złoty amount', () => {
  // "voucher o wartości 30 000 zł" is a voucher, not a cash prize.
  const voucher = buildTags({ text: 'Nagrody: 1 x voucher wakacje.pl o wartości 30 000 zł' });
  assert.ok(!(voucher.nagroda || []).includes('pieniadze'));
  // A prize list of amounts is.
  const cash = buildTags({ text: 'Nagrody: • I miejsce – 4 000 zł • II miejsce – 2 500 zł' });
  assert.ok(cash.nagroda.includes('pieniadze'));
});

test('buildTags omits empty kinds and keeps kind order', () => {
  const tags = buildTags({ nativeSlugs: ['ogolnopolskie', 'nagrody-pieniadze'] });
  assert.deepEqual(Object.keys(tags), ['nagroda', 'zasieg']);
});

test('buildTags ignores unknown slugs rather than inventing tags', () => {
  assert.deepEqual(buildTags({ nativeSlugs: ['zupelnie-nieznany-slug'] }), {});
  assert.deepEqual(buildTags({}), {});
});

test('mergeTags unions kinds and de-duplicates', () => {
  assert.deepEqual(
    mergeTags({ nagroda: ['laptop'], temat: ['loteria'] }, { nagroda: ['pieniadze', 'laptop'] }),
    { nagroda: ['laptop', 'pieniadze'], temat: ['loteria'] }
  );
  assert.deepEqual(mergeTags(undefined, null, {}), {});
});

test('tag legend covers every slug in use, including brands', () => {
  const items = [{ tags: { marka: ['zabka', 'acer'], nagroda: ['agd'] } }, { tags: { nagroda: ['agd'] } }];
  assert.deepEqual(collectTagLabels(items), { acer: 'Acer', agd: 'AGD', zabka: 'Żabka' });
  assert.deepEqual(collectTagCounts(items), { zabka: 1, acer: 1, agd: 2 });
});

// --- cross-source merging ---------------------------------------------------

const silent = () => {};

function item(overrides) {
  return {
    id: `${overrides.source}:1`,
    title: 'XXX Międzynarodowe Biennale Fotografii Zabytki',
    url: `https://${overrides.source}.pl/x`,
    deadline: null,
    status: 'unknown',
    tags: {},
    links: { organizer: null, regulamin: null },
    entry: { summary: 'Sprawdź zasady udziału w źródle.' },
    prize: { summary: 'Sprawdź nagrody w źródle.' },
    extraction: {},
    ...overrides,
  };
}

test('mergeDuplicates keeps the higher-priority source and fills gaps from the rest', () => {
  const merged = mergeDuplicates([
    item({ source: 'aktualnekonkursy', deadline: '2026-11-15', prize: { summary: 'Nagrody rzeczowe.' } }),
    item({ source: 'fajnekonkursy', tags: { temat: ['fotograficzne'] }, links: { organizer: 'https://example.com/a', regulamin: null } }),
  ], silent);

  assert.equal(merged.length, 1);
  const [out] = merged;
  assert.equal(out.source, 'fajnekonkursy', 'fajnekonkursy outranks aktualnekonkursy');
  assert.equal(out.deadline, '2026-11-15', 'deadline taken from whichever source had one');
  assert.equal(out.status, statusFor('2026-11-15'), 'status recomputed from the merged deadline');
  assert.equal(out.prize.summary, 'Nagrody rzeczowe.', 'placeholder summary replaced');
  assert.equal(out.links.organizer, 'https://example.com/a');
  assert.deepEqual(out.tags, { temat: ['fotograficzne'] });
  assert.equal(out.extraction.mergedFrom, 2);
  assert.deepEqual(out.alsoOn, [{ source: 'aktualnekonkursy', url: 'https://aktualnekonkursy.pl/x', id: 'aktualnekonkursy:1' }]);
});

test('mergeDuplicates unions tags across sources', () => {
  const [out] = mergeDuplicates([
    item({ source: 'pepper', tags: { nagroda: ['pieniadze'] } }),
    item({ source: 'wygrajta', tags: { nagroda: ['ksiazka'], temat: ['literackie'] } }),
  ], silent);
  assert.deepEqual(out.tags, { nagroda: ['ksiazka', 'pieniadze'], temat: ['literackie'] });
});

test('mergeDuplicates leaves distinct contests alone', () => {
  const merged = mergeDuplicates([
    item({ source: 'pepper', title: 'Konkurs fotograficzny Podlasie w obiektywie' }),
    item({ source: 'wygrajta', title: 'Konkurs literacki imienia Kraszewskiego' }),
  ], silent);
  assert.equal(merged.length, 2);
  assert.ok(merged.every((i) => !i.alsoOn));
});

test('mergeDuplicates will not merge on a title too short to be distinctive', () => {
  const merged = mergeDuplicates([
    item({ source: 'pepper', title: 'Konkurs' }),
    item({ source: 'wygrajta', title: 'Konkurs' }),
  ], silent);
  assert.equal(merged.length, 2);
});
