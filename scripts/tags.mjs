// Canonical tag vocabulary, shared by the scraper (which assigns tags) and the
// site (which groups, labels and filters them). Tags come from two places:
//   1. source-native taxonomies — WP categories/tags, konkursiada's class_list,
//      the category slug in aktualnekonkursy URLs, pepper's RSS <category>,
//   2. keyword rules over the article text, for sources with no taxonomy
//      (pepper) and to fill gaps everywhere else.
// Unknown native slugs are dropped rather than passed through, so the
// vocabulary stays a closed set the UI can group, label and offer as filters.
// The one exception is `marka` (brands), which is open-ended by nature.

export const TAG_KINDS = ['nagroda', 'mechanika', 'temat', 'marka', 'odbiorca', 'zasieg'];

export const TAG_KIND_LABELS = {
  nagroda: 'Nagroda',
  mechanika: 'Jak wziąć udział',
  temat: 'Temat',
  marka: 'Marka',
  odbiorca: 'Odbiorca',
  zasieg: 'Zasięg',
};

const VOCAB = {};
function def(kind, entries) {
  for (const [slug, label] of Object.entries(entries)) VOCAB[slug] = { kind, label };
}

def('nagroda', {
  pieniadze: 'Pieniądze',
  'karta-podarunkowa': 'Karta podarunkowa / bon',
  voucher: 'Voucher',
  cashback: 'Cashback',
  elektronika: 'Elektronika',
  laptop: 'Laptop',
  smartfon: 'Smartfon',
  tablet: 'Tablet',
  konsola: 'Konsola / gaming',
  'sprzet-audio': 'Sprzęt audio',
  'sprzet-fotograficzny': 'Sprzęt fotograficzny',
  smartwatch: 'Smartwatch',
  agd: 'AGD',
  rtv: 'RTV',
  'dom-i-akcesoria': 'Dom i akcesoria',
  kosmetyki: 'Kosmetyki',
  'produkty-spozywcze': 'Produkty spożywcze',
  napoje: 'Napoje',
  slodycze: 'Słodycze',
  suplementy: 'Suplementy',
  ksiazka: 'Książka',
  bilety: 'Bilety',
  wycieczka: 'Wycieczka',
  samochod: 'Samochód',
  rower: 'Rower',
  hulajnoga: 'Hulajnoga',
  'sprzet-sportowy': 'Sprzęt sportowy',
  odziez: 'Odzież',
  obuwie: 'Obuwie',
  zegarek: 'Zegarek',
  bizuteria: 'Biżuteria',
  zabawki: 'Zabawki',
  gadzety: 'Gadżety',
  gry: 'Gry',
  subskrypcja: 'Subskrypcja / streaming',
  paliwo: 'Paliwo',
  mieszkanie: 'Mieszkanie',
  szkolenie: 'Kurs / szkolenie',
  'nagrody-rzeczowe': 'Nagrody rzeczowe',
});

def('mechanika', {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  sms: 'SMS',
  quiz: 'Quiz',
  komentarz: 'Komentarz',
  odpowiedz: 'Odpowiedź na pytanie',
  'tekst-kreatywny': 'Tekst kreatywny',
  zdjecie: 'Zdjęcie',
  film: 'Film',
  rysunek: 'Rysunek / praca plastyczna',
  przepis: 'Przepis',
  prezentacja: 'Prezentacja',
  glosowanie: 'Głosowanie',
  gra: 'Gra',
  formularz: 'Formularz zgłoszeniowy',
  zgloszenie: 'Zgłoszenie pracy',
  rejestracja: 'Rejestracja',
  aplikacja: 'Aplikacja mobilna',
  newsletter: 'Newsletter',
  kod: 'Kod',
  losowanie: 'Losowanie',
  obserwowanie: 'Obserwowanie profilu',
  polubienie: 'Polubienie',
  udostepnienie: 'Udostępnienie',
});

def('temat', {
  fotograficzne: 'Fotograficzne',
  literackie: 'Literackie',
  plastyczne: 'Plastyczne',
  graficzne: 'Graficzne',
  filmowe: 'Filmowe',
  muzyczne: 'Muzyczne',
  artystyczne: 'Artystyczne',
  kreatywne: 'Kreatywne',
  kulinarne: 'Kulinarne',
  loteria: 'Loteria',
  latwe: 'Łatwe',
  radiowe: 'Radiowe',
  podcast: 'Podcast',
  internetowe: 'Internetowe',
  sportowe: 'Sportowe',
  motoryzacja: 'Motoryzacja',
  technologia: 'Technologia',
  moda: 'Moda',
  'zdrowie-i-uroda': 'Zdrowie i uroda',
  medyczne: 'Medyczne',
  'chemia-i-higiena': 'Chemia i higiena',
  dom: 'Dom i wnętrza',
  ogrod: 'Ogród',
  budowlane: 'Budowlane',
  edukacja: 'Edukacja',
  finanse: 'Finanse',
  praca: 'Praca',
  handel: 'Handel',
  turystyka: 'Turystyka',
  rozrywka: 'Rozrywka',
  kultura: 'Kultura i sztuka',
  spoleczne: 'Społeczne',
  swiateczne: 'Świąteczne',
  walentynkowe: 'Walentynkowe',
  wielkanocne: 'Wielkanocne',
  'dzien-kobiet': 'Dzień Kobiet',
});

def('odbiorca', {
  'dla-dzieci': 'Dla dzieci',
  'dla-mlodziezy': 'Dla młodzieży',
  'dla-firm': 'Dla firm',
  'dla-studentow': 'Dla studentów',
});

def('zasieg', {
  ogolnopolskie: 'Ogólnopolskie',
  lokalne: 'Lokalne',
});

// Native slug -> canonical slug. Only exceptions need an entry: a native slug
// that already exists in VOCAB maps to itself.
const NATIVE_MAP = {
  // --- prize wording (konkursiada `nagrody-*`, fajnekonkursy tags) ---
  bon: 'karta-podarunkowa',
  bony: 'karta-podarunkowa',
  talony: 'karta-podarunkowa',
  karnety: 'karta-podarunkowa',
  'karty-podarunkowe': 'karta-podarunkowa',
  vouchery: 'voucher',
  laptopy: 'laptop',
  smartfony: 'smartfon',
  iphone: 'smartfon',
  ipad: 'tablet',
  tablety: 'tablet',
  'doladowania-telefonu-t-mobile': 'karta-podarunkowa',
  'sprzet-elektroniczny': 'elektronika',
  'artykuly-cyfrowe': 'elektronika',
  kamera: 'sprzet-fotograficzny',
  kamery: 'sprzet-fotograficzny',
  'sprzet-video': 'sprzet-fotograficzny',
  'galaxy-ring': 'smartwatch',
  zegarki: 'zegarek',
  'sprzet-gamingowy': 'konsola',
  'drobne-agd': 'agd',
  'robot-kuchenny': 'agd',
  'mikser-planetarny': 'agd',
  blender: 'agd',
  piekarnik: 'agd',
  thermomix: 'agd',
  saturator: 'agd',
  masazery: 'agd',
  cisnieniomierz: 'medyczne',
  'badania-organizmu': 'medyczne',
  'konsultacja-z-dietetykiem': 'szkolenie',
  kurs: 'szkolenie',
  meble: 'dom-i-akcesoria',
  'zastawa-stolowa': 'dom-i-akcesoria',
  'przybory-kuchenne': 'dom-i-akcesoria',
  'forma-do-pieczenia': 'dom-i-akcesoria',
  'kubki-termiczne': 'dom-i-akcesoria',
  bidony: 'dom-i-akcesoria',
  'butelki-filtrujace': 'dom-i-akcesoria',
  narzedzia: 'dom-i-akcesoria',
  'akcesoria-ogrodowe': 'ogrod',
  'artykuly-malarskie': 'dom-i-akcesoria',
  akcesoria: 'gadzety',
  'akcesoria-samochodowe': 'motoryzacja',
  walizki: 'dom-i-akcesoria',
  'plecak-tornister': 'dom-i-akcesoria',
  maskotki: 'zabawki',
  'art-spozywcze': 'produkty-spozywcze',
  'artykuly-spozywcze': 'produkty-spozywcze',
  'produkty-firmowe': 'nagrody-rzeczowe',
  inne: null,
  'suplementy-diety': 'suplementy',
  'kosmetyki-do-wlosow': 'kosmetyki',
  'zestaw-kosmetykow': 'kosmetyki',
  'mata-do-jogi': 'sprzet-sportowy',
  'tasmy-oporowe': 'sprzet-sportowy',
  skuter: 'motoryzacja',
  oboz: 'wycieczka',
  wycieczki: 'wycieczka',
  'lot-odrzutowcem': 'wycieczka',
  'dostep-do-serwisu-streamingowego': 'subskrypcja',
  'udzial-w-kampanii-reklamowej': 'nagrody-rzeczowe',
  'udzial-w-wydarzeniu-kulinarnym': 'kulinarne',
  ubezpieczenie: 'finanse',
  pieniadze: 'pieniadze',
  wycieczka: 'wycieczka',

  // --- entry conditions (konkursiada `warunki-*`) ---
  'formularz-zgloszeniowy': 'formularz',
  'tekst-kreatywny': 'tekst-kreatywny',
  'zdjecie-film': 'zdjecie',
  'posiadanie-aplikacji': 'aplikacja',
  'oddanie-glosu': 'glosowanie',
  'polubienie-postu-konkursowego': 'polubienie',
  'polubienie-profilu': 'polubienie',
  'zaobserwowanie-profilu': 'obserwowanie',
  'udostepnienie-profilu': 'udostepnienie',
  rywalizacja: null,

  // --- contest type (konkursiada `typy-*`) ---
  konkurs: null,
  glosowanie: 'glosowanie',

  // --- industries (konkursiada `branze-*`) ---
  'artykuly-chigieniczne': 'chemia-i-higiena',
  'chemia-techniczna': 'chemia-i-higiena',
  sprzatanie: 'chemia-i-higiena',
  'artykuly-budowlane': 'budowlane',
  'branza-metalowa': 'budowlane',
  'artykuly-ogrodowe': 'ogrod',
  'branza-beauty': 'zdrowie-i-uroda',
  uroda: 'zdrowie-i-uroda',
  'branza-farmaceutyczna': 'medyczne',
  'branza-medyczna': 'medyczne',
  'branza-logistycznokurierska': null,
  'branza-muzyczna': 'muzyczne',
  'branza-technologiczna': 'technologia',
  telekomunikacja: 'technologia',
  'branza-wnetrzarska': 'dom',
  'edukacja-i-rozwoj': 'edukacja',
  'kultura-i-sztuka': 'kultura',
  'handel-detaliczny': 'handel',
  sklepy: 'handel',
  'organizacja-spoleczna': 'spoleczne',
  ubezpieczenia: 'finanse',

  // --- wygrajta post tags (its own free-form vocabulary) ---
  konkursy: null,
  nagrody: null,
  wygraj: null,
  promocja: null,
  wygraj1000: 'pieniadze',
  wygraj2000: 'pieniadze',
  wygraj5000: 'pieniadze',
  wygraj10000: 'pieniadze',
  fotograficzny: 'fotograficzne',
  filmowy: 'filmowe',
  poetycki: 'literackie',
  plakat: 'graficzne',
  design: 'graficzne',
  fashion: 'moda',
  festiwal: 'kultura',
  gaming: 'gry',
  flaga: null,
  e: null,
  'bony-rabatowe-2': 'karta-podarunkowa',
  'uslugi-i-subskrypcje': 'subskrypcja',
  'konkursy-dla-dzieci-i-mlodziezy': 'dla-dzieci',
  audiobooki: 'ksiazka',
  ebooki: 'ksiazka',
  android: 'technologia',
  kuchnia: 'dom',
  'materialy-budowlane': 'budowlane',
  'rodzina-i-dzieci': 'dla-dzieci',

  // --- fajnekonkursy / wygrajta / ofree categories and tags ---
  'bez-zakupu': null,
  'z-zakupem': null,
  archiwum: null,
  polecane: null,
  polecamy: null,
  podcasty: 'podcast',
  promocje: null,
  promocyjne: null,
  konsumenckie: null,
  'aktualne-konkursy': null,
  'z-nagrodami': null,
  'darmowe-konkursy': null,
  darmowe: null,
  'za-darmo': null,
  loterie: 'loteria',
  pieniezne: 'pieniadze',
  'na-facebooku': 'facebook',
  'na-instagramie': 'instagram',
  'sms-aktualne-konkursy': 'sms',
  ksiazkowe: 'literackie',
  'dla-mlodziezy': 'dla-mlodziezy',
  swiateczny: 'swiateczne',
  walentynkowy: 'walentynkowe',
  wielkanocny: 'wielkanocne',
  'na-dzien-kobiet': 'dzien-kobiet',
  gadzety: 'gadzety',
  ksiazka: 'ksiazka',
  odziez: 'odziez',
  probki: 'nagrody-rzeczowe',
  filmy: 'filmowe',
  seriale: 'filmowe',
  vod: 'subskrypcja',
  'darmowy-dostep': 'subskrypcja',
  'testowanie-produktow': 'nagrody-rzeczowe',
  'darmowe-probki': 'nagrody-rzeczowe',
  gratisy: 'nagrody-rzeczowe',
  remont: 'budowlane',
  'wymiana-walut': 'finanse',
  'testuj-perfumy': 'nagrody-rzeczowe',
  'testuj-produkty': 'nagrody-rzeczowe',
  'zostan-testerem': 'nagrody-rzeczowe',
  'karty-lojalnosciowe': null,
  'programy-lojalnosciowe': null,
  'karty-klienta': null,
  'klub-zakupowy': null,
  'kupony-rabatowe': null,
  znizki: null,
  rabaty: null,
  zakupy: null,
  newsy: null,
  poradniki: null,
  'sklepy-online': 'handel',
  'platnosci-internetowe': 'finanse',
  nieruchomosci: 'mieszkanie',
  'produkty-spozywcze': 'produkty-spozywcze',

  // --- aktualnekonkursy URL categories ---
  'konkursy-literackie': 'literackie',
  'konkursy-fotograficzne': 'fotograficzne',
  'konkursy-plastyczne': 'plastyczne',
  'konkursy-filmowe': 'filmowe',
  'konkursy-muzyczne': 'muzyczne',
  'konkursy-graficzne': 'graficzne',
  'konkursy-dla-dzieci': 'dla-dzieci',
  'konkursy-konsumenckie': null,
  'inne-konkursy': null,

  // --- pepper RSS <category> (display names, slugified) ---
  'zdrowie-i-uroda': 'zdrowie-i-uroda',
  'dom-i-mieszkanie': 'dom',
  'dom-i-ogrod': 'dom',
  'moda-i-akcesoria': 'moda',
  'jedzenie-i-napoje': 'produkty-spozywcze',
  'dla-dziecka': 'dla-dzieci',
  'dla-dzieci-i-rodzicow': 'dla-dzieci',
  podroze: 'turystyka',
  'podroze-i-wakacje': 'turystyka',
  'kultura-i-rozrywka': 'kultura',
  'sport-i-turystyka': 'sportowe',
  'uslugi-i-abonamenty': 'subskrypcja',
  'gry-i-konsole': 'gry',
  'komputery-i-tablety': 'elektronika',
  'telefony-i-smartfony': 'smartfon',
  'gaming-i-vr': 'gry',
  'foto-i-video': 'sprzet-fotograficzny',
  'agd-i-elektronika': 'agd',
};

// konkursiada exposes brands as `firmy-*`; these two sources use plain slugs,
// so brands have to be listed to tell them apart from topic categories.
const BRAND_SLUGS = new Set([
  'biedronka', 'zabka', 'zabka-i-freshmarket', 'rossmann', 'lidl', 'kaufland', 'carrefour',
  'auchan', 'intermarche', 'dino', 'netto', 'stokrotka', 'groszek', 'hebe', 'sephora',
  'empik', 'komfort', 'castorama', 'komputronik', 'zegarownia', 'orlen', 'moya',
  'coca-cola', 'pepsi-cola', 'fanta', 'sprite', 'kinley', 'nestea', 'monster', 'tiger',
  'capri-sun', 'hortex', 'zywiec-zdroj', 'kropla-beskidu', 'woseba', 'lavazza', 'segafredo',
  'inka', 'sodastream', 'milka', 'wedel', 'kinder', 'kinder-bueno', 'belvita', 'oreo',
  'nutella', 'haribo', 'mamba', 'merci', 'toffifee', 'knopers', 'goralki', 'grzeski',
  'delicje', 'familijne', 'lubisie', 'nimm2', 'kitkat', 'lion', 'storck', 'roshen',
  'werthers-original', 'grycan', 'koral', 'ice-fresh', 'dan-cake', 'petitki', 'san',
  'eti', 'bakoma', 'hochland', 'almette', 'laciate', 'mlekovita', 'mlekpol', 'lowicz',
  'rolmlecz', 'serenada', 'violife', 'hipp', 'lubella', 'pudliszki', 'berlinki', 'animex',
  'olewnik', 'balcerzak', 'smakowita', 'wypasione', 'diamant', 'monini', 'kucharek',
  'appetita', 'blue-dragon', 'doritos', 'intersnack', 'optima-cardio', 'estrovita',
  'vitamizu', 'recotin', 'suplementy-diety', 'nestle', 'mondelez', 'henkel', 'loreal-polska',
  'garnier', 'maybelline', 'nivea', 'ziaja', 'tolpa', 'weleda', 'cleanic', 'regina',
  'schauma', 'gliss', 'syoss', 'taft', 'palette', 'fa', 'bic', 'duck', 'domestos', 'cif',
  'somat', 'jan-niezbedny', 'marxam', 'hartmann', 'aquaphor', 'wd-40', 'weber', 'porta',
  'ariete', 'epson', 'gopro', 'olympus', 'apple', 'samsung', 'lenovo', 'acer', 'realme',
  'freshn-rebel', 'im2be', 'imad', 'aha', 'dare', 'fantasia', 'fuze', 'energy-blast',
  'naviexpert', 't-mobile', 'blik', 'visa', 'kruk', 'bankier-pl', 'player-pl', 'cinema-city',
  'polskie-radio', 'politechnika-morska', 'adidas', 'panetti',
  'allegro', 'inpost', 'legimi', 'gowork', 'cinkciarz-pl', 'apple-store', 'google-play',
  'paypo', 'testclub',
]);

// Brand slugs whose display name isn't recoverable by title-casing.
const BRAND_LABELS = {
  zabka: 'Żabka',
  'zabka-i-freshmarket': 'Żabka i Freshmarket',
  laciate: 'Łaciate',
  lowicz: 'Łowicz',
  grzeski: 'Grześki',
  goralki: 'Góralki',
  'jan-niezbedny': 'Jan Niezbędny',
  tolpa: 'Tołpa',
  'zywiec-zdroj': 'Żywiec Zdrój',
  'kropla-beskidu': 'Kropla Beskidu',
  'loreal-polska': "L'Oréal Polska",
  'werthers-original': "Werther's Original",
  'freshn-rebel': "Fresh 'n Rebel",
  intermarche: 'Intermarché',
  'coca-cola': 'Coca-Cola',
  'pepsi-cola': 'Pepsi-Cola',
  't-mobile': 'T-Mobile',
  'wd-40': 'WD-40',
  'bankier-pl': 'Bankier.pl',
  'player-pl': 'Player.pl',
  nimm2: 'nimm2',
  'kinder-bueno': 'Kinder Bueno',
  'cinema-city': 'Cinema City',
  'polskie-radio': 'Polskie Radio',
  'politechnika-morska': 'Politechnika Morska',
  'dan-cake': 'Dan Cake',
  'blue-dragon': 'Blue Dragon',
  'optima-cardio': 'Optima Cardio',
  'suplementy-diety': 'Suplementy diety',
  'energy-blast': 'Energy Blast',
  'ice-fresh': 'Ice Fresh',
  'im2be': 'im2be',
  'cinkciarz-pl': 'Cinkciarz.pl',
  'apple-store': 'App Store',
  'google-play': 'Google Play',
  gowork: 'GoWork',
  inpost: 'InPost',
};

// Keyword rules over the article text. They fill in for sources without a
// taxonomy (pepper) and add mechanics the taxonomies miss. Deliberately
// narrow: a false tag is worse than a missing one, because tags are filters.
const TEXT_RULES = [
  ['instagram', /instagram/i],
  ['facebook', /facebook|\bfb\b|fanpage/i],
  ['tiktok', /tik\s?tok/i],
  ['youtube', /youtube/i],
  ['sms', /\bsms(?:-?a|-?em|y)?\b/i],
  ['quiz', /\bquiz/i],
  ['komentarz', /w\s+komentarz|komentarz\w*\s+pod|(?:napisz|dodaj|zostaw)\s+komentarz/i],
  ['nagrody-rzeczowe', /nagrod\w*\s+rzeczow/i],
  ['odpowiedz', /odpowiedz(?:i|ieć)?\s+na\s+pytanie|odpowiedź\s+na\s+pytanie/i],
  ['tekst-kreatywny', /(?:kreatywn\w+\s+(?:tekst|hasł|odpowie)|hasł\w+\s+konkursow|dokończ\s+zdanie)/i],
  ['zdjecie', /(?:prześlij|wyślij|dodaj|opublikuj)\s+(?:swoje\s+)?zdjęci|zdjęci\w+\s+konkursow|fotografi\w+\s+konkursow/i],
  ['film', /(?:nagraj|prześlij|wyślij)\s+(?:krótki\s+)?(?:film|wideo)|filmik/i],
  ['rysunek', /prac[ęy]\s+plastyczn|narysuj|rysunek\s+konkursow/i],
  ['przepis', /(?:prześlij|wyślij|autorski)\s+przepis|przepis\s+kulinarn/i],
  ['glosowanie', /zagłosuj|oddaj\s+głos|głosowani/i],
  ['newsletter', /newsletter/i],
  ['aplikacja', /aplikacj\w+\s+(?:mobiln|konkursow)|pobierz\s+aplikacj|w\s+aplikacji/i],
  ['rejestracja', /zarejestruj|rejestracj|utwórz\s+konto|założ(?:enie)?\s+kont/i],
  ['formularz', /formularz(?:u|em)?\s+(?:zgłoszeniow|konkursow)|wypełnij\s+formularz/i],
  ['losowanie', /losowani|wylosow/i],
  ['obserwowanie', /zaobserwuj|obserwuj\w*\s+profil|polub\s+(?:nasz\s+)?profil/i],
  // "I miejsce – 4 000 zł" / "II nagroda – 1 000 zł": a prize list of amounts.
  // Deliberately tied to the place/prize wording, so "voucher o wartości
  // 30 000 zł" doesn't read as a cash prize.
  ['pieniadze', /pieniężn|gotówk|\bkwot[aęy]\b|nagrod[aęy]\s+finansow|(?:miejsce|nagroda)\s*[–—-]\s*\d[\d\s.,]*\s*(?:zł|pln)/i],
  ['karta-podarunkowa', /kart[aęy]\s+podarunkow|\bbon(?:y|ów|u|em)?\b|talon/i],
  ['voucher', /voucher/i],
  ['kosmetyki', /kosmetyk/i],
  ['bilety', /\bbilet/i],
  ['wycieczka', /wycieczk|\bwyjazd|wakacj|weekend\s+w/i],
  ['ksiazka', /książk/i],
  ['zabawki', /zabawk|klock[iów]/i],
  ['samochod', /samoch[óo]d|\bauto\b/i],
  ['laptop', /laptop|notebook/i],
  ['smartfon', /smartfon|telefon\s+komórkow|\biphone\b/i],
  ['konsola', /konsol[aęi]|playstation|\bxbox\b|nintendo/i],
  ['rower', /\brower/i],
  ['sprzet-sportowy', /sprzęt\s+sportow|hantl|bieżni/i],
  ['agd', /\bagd\b|ekspres\s+do\s+kaw|odkurzacz|robot\s+kuchenn|blender|airfryer/i],
  ['subskrypcja', /subskrypcj|netflix|spotify|\bvod\b|abonament/i],
  ['loteria', /loteri/i],
  ['dla-dzieci', /dla\s+dzieci|przedszkol|dziec(?:i|kom)\s+w\s+wieku/i],
  ['ogolnopolskie', /ogólnopolsk/i],
];

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TAXONOMY_PREFIXES = ['nagrody-', 'branze-', 'typy-', 'warunki-', 'firmy-', 'statusy-'];

// Resolves one native slug to { slug, kind }. Returns DROPPED for slugs we
// deliberately ignore (site plumbing, statuses, "inne", purchase markers) and
// null for slugs we simply don't know yet — only the latter are worth logging.
const DROPPED = Symbol('dropped');

function resolveNative(raw) {
  let slug = slugify(raw);
  if (!slug) return DROPPED;

  if (slug.startsWith('firmy-')) {
    const brand = slug.slice('firmy-'.length);
    return brand ? { slug: brand, kind: 'marka' } : DROPPED;
  }
  if (slug.startsWith('statusy-')) return DROPPED;
  for (const prefix of TAXONOMY_PREFIXES) {
    if (slug.startsWith(prefix)) {
      slug = slug.slice(prefix.length);
      break;
    }
  }

  if (Object.hasOwn(NATIVE_MAP, slug)) {
    const mapped = NATIVE_MAP[slug];
    if (!mapped) return DROPPED;
    slug = mapped;
  }
  if (VOCAB[slug]) return { slug, kind: VOCAB[slug].kind };
  if (BRAND_SLUGS.has(slug)) return { slug, kind: 'marka' };
  return null;
}

// Native slugs that had no mapping, tallied so the vocabulary is easy to grow:
// the scraper logs the frequent ones at the end of a run.
export const unmappedNativeSlugs = new Map();

function noteUnmapped(raw) {
  const slug = slugify(raw);
  if (!slug) return;
  unmappedNativeSlugs.set(slug, (unmappedNativeSlugs.get(slug) || 0) + 1);
}

/**
 * Builds the per-item tag object, grouped by kind:
 *   { nagroda: [...], mechanika: [...], temat: [...], marka: [...], ... }
 * Kinds with no tags are omitted; keys follow TAG_KINDS order.
 */
export function buildTags({ nativeSlugs = [], text = '', extra = [] } = {}) {
  const found = new Map(); // slug -> kind

  for (const raw of nativeSlugs) {
    if (!raw) continue;
    const hit = resolveNative(raw);
    if (hit === DROPPED) continue;
    if (hit) found.set(hit.slug, hit.kind);
    else noteUnmapped(raw);
  }

  if (text) {
    for (const [slug, re] of TEXT_RULES) {
      if (re.test(text) && VOCAB[slug]) found.set(slug, VOCAB[slug].kind);
    }
  }

  for (const slug of extra) {
    if (VOCAB[slug]) found.set(slug, VOCAB[slug].kind);
    else if (slug && BRAND_SLUGS.has(slug)) found.set(slug, 'marka');
  }

  const byKind = {};
  for (const [slug, kind] of found) (byKind[kind] ||= []).push(slug);
  return Object.fromEntries(
    TAG_KINDS.filter((k) => byKind[k]?.length).map((k) => [k, byKind[k].sort()])
  );
}

/** Unions two grouped tag objects (used when merging cross-source duplicates). */
export function mergeTags(...groups) {
  const byKind = {};
  for (const group of groups) {
    for (const [kind, slugs] of Object.entries(group || {})) {
      if (!Array.isArray(slugs)) continue;
      (byKind[kind] ||= new Set());
      for (const slug of slugs) byKind[kind].add(slug);
    }
  }
  return Object.fromEntries(
    TAG_KINDS.filter((k) => byKind[k]?.size).map((k) => [k, [...byKind[k]].sort()])
  );
}

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => (w.length <= 3 && !/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function tagLabel(slug, kind) {
  if (VOCAB[slug]) return VOCAB[slug].label;
  if (kind === 'marka') return BRAND_LABELS[slug] || titleCase(slug);
  return slug;
}

/**
 * Display labels for every tag actually used in `items`, so the site and any
 * agent reading the JSON can render chips without knowing this module.
 */
export function collectTagLabels(items) {
  const labels = {};
  for (const it of items) {
    for (const [kind, slugs] of Object.entries(it.tags || {})) {
      for (const slug of slugs || []) labels[slug] = tagLabel(slug, kind);
    }
  }
  return Object.fromEntries(Object.keys(labels).sort().map((k) => [k, labels[k]]));
}

/** Tag usage counts, emitted so the UI can order the filter list by frequency. */
export function collectTagCounts(items) {
  const counts = {};
  for (const it of items) {
    for (const slugs of Object.values(it.tags || {})) {
      for (const slug of slugs || []) counts[slug] = (counts[slug] || 0) + 1;
    }
  }
  return counts;
}
