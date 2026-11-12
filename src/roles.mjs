// Everything a commenter can become. First person to ask for a civic
// institution founds it and gets the top job; later askers are hired as staff
// until the slots are full. Shops always get their own building.
//
// kw: regex source, matched case-insensitively against the comment text.

const shop = (icon, color, cost, en, de, kw) => ({
  kind: 'shop', icon, color, cost, name: { en, de }, kw,
  chief: { en: 'Owner', de: 'Inhaber' },
});
const civic = (icon, color, cost, feature, name, chief, staff, kw, slots = 5) => ({
  kind: 'civic', icon, color, cost, feature, name, chief, staff, kw, slots,
});

export const ROLES = {
  police: civic('🚓', '#3d6fd6', 90000, 'siren',
    { en: 'Police Station', de: 'Polizeiwache' },
    { en: 'Police Chief', de: 'Polizeichef' }, { en: 'Officer', de: 'Polizist' },
    'poli[cz]e|polizei|polizist|\\bcops?\\b|sheriff|kommissar'),
  fire: civic('🚒', '#d9483b', 90000, 'garage',
    { en: 'Fire Station', de: 'Feuerwache' },
    { en: 'Fire Chief', de: 'Feuerwehrchef' }, { en: 'Firefighter', de: 'Feuerwehrmann' },
    'fire\\s?(fighter|man|woman|chief|station|dep)|feuerwehr'),
  hospital: civic('🏥', '#f2f4f7', 150000, 'cross',
    { en: 'Hospital', de: 'Krankenhaus' },
    { en: 'Head Doctor', de: 'Chefarzt' }, { en: 'Nurse', de: 'Pflegekraft' },
    'doctor|\\bdoc\\b|nurse|hospital|surgeon|medic|\\barzt|ärztin|krankenhaus|praxis|krankenschwester|pfleger', 6),
  school: civic('🏫', '#c8643c', 120000, 'clock',
    { en: 'School', de: 'Schule' },
    { en: 'Principal', de: 'Schulleiter' }, { en: 'Teacher', de: 'Lehrer' },
    'teacher|principal|school|lehrer|schule|schulleiter|direktor', 6),
  bank: civic('🏦', '#e8dcc0', 100000, 'columns',
    { en: 'Bank', de: 'Bank' },
    { en: 'Bank Director', de: 'Bankdirektor' }, { en: 'Banker', de: 'Bankberater' },
    '\\bbank(er|ier)?\\b|bankdirektor'),
  court: civic('⚖️', '#d8d2c4', 110000, 'columns',
    { en: 'Courthouse', de: 'Gericht' },
    { en: 'Judge', de: 'Richter' }, { en: 'Lawyer', de: 'Anwalt' },
    'judge|lawyer|attorney|court|richter|anwalt|anwältin|gericht'),
  library: civic('📚', '#8a6fb8', 70000, 'columns',
    { en: 'Library', de: 'Bibliothek' },
    { en: 'Head Librarian', de: 'Bibliotheksleitung' }, { en: 'Librarian', de: 'Bibliothekar' },
    'librar|bibliothek|bücherei'),
  cardealer: civic('🚕', '#2b2f3a', 120000, 'cars',
    { en: 'Garage & Taxi', de: 'Werkstatt & Taxi' },
    { en: 'Garage Boss', de: 'Werkstattchef' }, { en: 'Mechanic', de: 'Mechaniker' },
    'mechani[ck]|garage|car\\s?(dealer|shop)|taxi|autohaus|werkstatt|kfz'),
  shelter: civic('🐾', '#4f9a7b', 80000, 'kennel',
    { en: 'Animal Shelter', de: 'Tierheim' },
    { en: 'Shelter Manager', de: 'Tierheimleitung' }, { en: 'Animal Carer', de: 'Tierpfleger' },
    'animal|\\bvet\\b|veterinar|shelter|tierheim|tierarzt|tierärztin|tierpfleger'),
  farm: civic('🚜', '#b5442e', 60000, 'fields',
    { en: 'Farm', de: 'Bauernhof' },
    { en: 'Farmer', de: 'Landwirt' }, { en: 'Farmhand', de: 'Erntehelfer' },
    '\\bfarm|bauer|bäuerin|landwirt|\\bhof\\b'),
  studio: civic('🎙️', '#6c4bd8', 70000, 'antenna',
    { en: 'Radio Station', de: 'Radiosender' },
    { en: 'Station Manager', de: 'Senderchef' }, { en: 'Host', de: 'Moderator' },
    'radio|\\bdj\\b|podcast|moderator|streamer|\\btv\\b|fernseh'),
  cinema: civic('🎬', '#a32d4f', 90000, 'marquee',
    { en: 'Cinema', de: 'Kino' },
    { en: 'Cinema Manager', de: 'Kinochef' }, { en: 'Usher', de: 'Kartenabreißer' },
    'cinema|movie|\\bkino'),

  kebab: shop('🥙', '#e2523a', 25000, 'Kebab Shop', 'Dönerladen', 'kebab|kebap|döner|doner'),
  bakery: shop('🥨', '#d99a3c', 22000, 'Bakery', 'Bäckerei', 'baker|bäcker|backstube'),
  cafe: shop('☕', '#8b5a3c', 22000, 'Café', 'Café', 'caf[eé]|coffee|kaffee|barista'),
  pizza: shop('🍕', '#3f9d57', 25000, 'Pizzeria', 'Pizzeria', 'pizz'),
  icecream: shop('🍦', '#ef7fb0', 18000, 'Ice Cream Parlor', 'Eisdiele', 'ice\\s?cream|gelato|eisdiele|eisladen'),
  burger: shop('🍔', '#f08a24', 25000, 'Burger Joint', 'Burgerladen', 'burger'),
  flowers: shop('💐', '#e0559b', 18000, 'Flower Shop', 'Blumenladen', 'flower|florist|blumen'),
  barber: shop('💈', '#3a86c8', 18000, 'Barber Shop', 'Friseur', 'barber|hairdress|hair\\s?salon|friseur|frisör'),
  books: shop('📖', '#7a5cc4', 18000, 'Bookstore', 'Buchladen', 'book\\s?(store|shop)|buchladen|buchhandlung'),
  phones: shop('📱', '#2c9fb8', 30000, 'Phone Shop', 'Handyshop', 'phone\\s?(store|shop)|handy'),
  fashion: shop('👗', '#c44fc0', 30000, 'Boutique', 'Boutique', 'fashion|boutique|clothing|clothes|mode(laden|geschäft)|kleidung'),
  gym: shop('🏋️', '#59606e', 40000, 'Gym', 'Fitnessstudio', '\\bgym\\b|fitness|personal\\s?trainer'),
  market: shop('🛒', '#2f8f4e', 45000, 'Supermarket', 'Supermarkt', 'supermarket|grocery|supermarkt|kiosk|späti'),
  gaming: shop('🎮', '#4a57d6', 30000, 'Game Store', 'Gaming-Laden', 'gaming|game\\s?(store|shop)|arcade|spielhalle'),
};

export const HOUSING = [
  { type: 'arco', cap: 40000, cost: 10000000 },
  { type: 'mega', cap: 4000, cost: 1200000 },
  { type: 'tower', cap: 600, cost: 200000 },
  { type: 'block', cap: 120, cost: 45000 },
  { type: 'house', cap: 6, cost: 3000 },
];
export const HOUSING_NAMES = {
  en: { arco: ['arcology', 'arcologies'], mega: ['skyscraper', 'skyscrapers'], tower: ['high-rise', 'high-rises'], block: ['apartment block', 'apartment blocks'], house: ['house', 'houses'] },
  de: { arco: ['Mega-Komplex', 'Mega-Komplexe'], mega: ['Wolkenkratzer', 'Wolkenkratzer'], tower: ['Hochhaus', 'Hochhäuser'], block: ['Wohnblock', 'Wohnblöcke'], house: ['Haus', 'Häuser'] },
};

// Milestones the audience votes on. The winner is built when the target is hit.
export const LANDMARKS = {
  stadium: { icon: '🏟️', name: { en: 'stadium', de: 'Stadion' }, kw: 'stadium|stadion|football|soccer|fußball' },
  funfair: { icon: '🎡', name: { en: 'funfair', de: 'Freizeitpark' }, kw: 'funfair|theme\\s?park|ferris|freizeitpark|riesenrad|kirmes' },
  harbor: { icon: '⚓', name: { en: 'harbor', de: 'Hafen' }, kw: 'harbou?r|\\bport\\b|hafen' },
  airport: { icon: '✈️', name: { en: 'airport', de: 'Flughafen' }, kw: 'airport|flughafen' },
};
export const GOALS = [
  { target: 1000, options: ['stadium', 'funfair'] },
  { target: 10000, options: ['harbor', 'airport'] },
  { target: 100000, options: ['stadium', 'funfair'] },
  { target: 1000000, options: ['harbor', 'airport'] },
];
