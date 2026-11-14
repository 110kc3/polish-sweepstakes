
export function buildWeeklyDigest(items, generatedAt) {
  const updated = generatedAt ? new Date(generatedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const expiring = [...items]
    .filter((it) => it.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 5);

  const highValue = [...items]
    .filter((it) => it.prize?.value && it.prize.value > 0)
    .sort((a, b) => b.prize.value - a.prize.value)
    .slice(0, 5);

  const creativeKeywords = ['zdjęcie', 'fotograf', 'film', 'wiersz', 'opowiadanie', 'hasło', 'kreatyw', 'praca', 'rysunek', 'opis'];
  const creative = [...items]
    .filter((it) => {
      const tags = (it.tags?.kategoria || []).concat(it.tags?.forma || []);
      const isCreativeTag = tags.some((t) => ['fotografia', 'literacki', 'artystyczny', 'kreatywny', 'filmowy', 'zadanie'].includes(t));
      const text = ((it.entry?.summary || '') + ' ' + (it.title || '')).toLowerCase();
      const isCreativeText = creativeKeywords.some((kw) => text.includes(kw));
      return isCreativeTag || isCreativeText;
    })
    .slice(0, 3);

  const formatItem = (it, i) => {
    const val = it.prize?.value ? ` (~${it.prize.value.toLocaleString('pl-PL')} PLN)` : '';
    const rules = it.links?.regulamin ? ` • [Regulamin](${it.links.regulamin})` : '';
    const org = it.links?.organizer ? ` • [Organizator](${it.links.organizer})` : '';
    return `${i + 1}. **[${it.title}](${it.url})**
   - 📅 **Termin:** ${it.deadline || 'Brak'} | 🏆 **Nagroda:** ${it.prize?.summary || 'Brak'}${val}
   - 📝 **Zadanie:** ${it.entry?.summary || 'Sprawdź źródło'}
   - 🔗 Źródło: \`${it.source}\`${rules}${org}`;
  };

  return `# Tygodniowy Przegląd Konkursów Bez Zakupu (Polska)
Data publikacji: ${updated}
Oficjalne źródło i wyszukiwarka: https://110kc3.github.io/polish-sweepstakes/

Zestawienie najciekawszych polskich konkursów i loterii z całkowicie **darmowym udziałem** (bez paragonów, kodów promocyjnych czy opłat wstępnych).

---

## ⏳ Ostatnia szansa — kończące się w najbliższych dniach

${expiring.length ? expiring.map(formatItem).join('\n\n') : '_Brak zbliżających się terminów._'}

---

## 💰 Najwyższa pula nagród — najwyższe wygrane

${highValue.length ? highValue.map(formatItem).join('\n\n') : '_Brak wycenionych nagród w bieżącym zestawieniu._'}

---

## 🎨 Konkursy kreatywne — wykaż się talentem

${creative.length ? creative.map(formatItem).join('\n\n') : '_Brak konkursów kreatywnych w bieżącym zestawieniu._'}

---
*Wygenerowano automatycznie przez [polish-sweepstakes](https://github.com/110kc3/polish-sweepstakes). Wszystkie konkursy weryfikowane pod kątem braku wymogu zakupu.*
`;
}
