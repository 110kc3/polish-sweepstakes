// Small local dataset for browser regression checks. Dates are relative to the
// Warsaw day so a checked-in snapshot cannot silently age these cases away.
export function browserFixture(today) {
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const item = (id, title, overrides = {}) => ({
    id: `fixture:${id}`, sourceId: id, source: 'konkursiada', title,
    url: `https://source.example/contests/${id}`, publishedAt: `${today}T00:00:00Z`,
    deadline: today, status: 'active', tags: { mechanika: ['zdjecie'] },
    links: { organizer: `https://organizer.example/enter/${id}`, regulamin: null },
    entry: { summary: 'Zrób zdjęcie swojej okolicy i prześlij je przez formularz konkursowy.' },
    prize: { summary: 'Wygraj aparat fotograficzny.', currency: 'PLN' },
    ...overrides,
  });
  return {
    version: 2, generatedAt: `${today}T00:00:00Z`,
    tagKinds: ['mechanika'], tagKindLabels: { mechanika: 'Jak wziąć udział' },
    tagLabels: { zdjecie: 'Zdjęcie', film: 'Film', odpowiedz: 'Odpowiedź', newsletter: 'Newsletter' },
    items: [
      item('today', 'Konkurs fotograficzny Atlas', { status: 'ended' }),
      item('future', 'Konkurs filmowy Latarnia', {
        source: 'aktualnekonkursy', deadline: '2999-12-31', tags: { mechanika: ['film'] },
        entry: { summary: 'Nagraj krótki film o swojej pasji i opublikuj go na Instagramie.' },
      }),
      item('unknown', 'Konkurs bez terminu Kompas', {
        source: 'ofree', deadline: null, tags: { mechanika: ['newsletter'] },
      }),
      item('ended', 'Archiwalny konkurs Portret', {
        source: 'pepper', deadline: yesterday.toISOString().slice(0, 10),
      }),
      item('rules-fallback', 'Regulamin zastępczy Rzeka', {
        deadline: '2999-12-31', tags: { mechanika: ['odpowiedz'] },
        links: { organizer: 'https://organizer.example/enter/fallback', regulamin: 'https://organizer.example/dead-rules.pdf' },
        verification: { sourceOk: true, organizerOk: false, regulaminOk: false, organizerPageOk: true },
      }),
      item('rules-unverified', 'Regulamin bez potwierdzonego zamiennika', {
        deadline: '2999-12-31', tags: { mechanika: ['odpowiedz'] },
        links: { organizer: 'https://organizer.example/unverified', regulamin: 'https://organizer.example/missing-rules.pdf' },
        verification: { sourceOk: true, organizerOk: false, regulaminOk: false, organizerPageOk: null },
      }),
    ],
  };
}
