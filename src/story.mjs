// Village stage (the first days, while everyone still fits in a few houses).
// Every comment matters here: people who subscribed move in (with Leo while
// his house has room, or into their own house if they ask), greetings are
// shown, and building wishes are counted. The most wanted thing the budget
// can pay for gets built; the most wanted thing it can't becomes the goal.
import { ROLES, HOUSING } from './roles.mjs';
import { cleanText, cleanHandle, isBlocked } from './comments.mjs';
import { TOWNHALL, lotX, lotZ, nthLot, hash, islandPts, riverPath } from './sim.mjs';

const R = 290;
const HOUSE = HOUSING.find(h => h.type === 'house'), BLOCK = HOUSING.find(h => h.type === 'block');

// what people can wish for in the village stage (key -> how it is built)
const WISHES = {
  apartment: { kw: /apartment|\bflats?\b|wohnung|wohnblock/i, icon: '🏢', name: 'apartment block', cost: BLOCK.cost, build: { type: 'block', cap: BLOCK.cap } },
  school: { kw: /school|schule/i, role: 'school' },
  police: { kw: /poli[cz]e|polizei|\bcops?\b/i, role: 'police' },
  hospital: { kw: /hospital|krankenhaus|\bdoctors?\b|\barzt/i, role: 'hospital' },
  farm: { kw: /\bfarm|bauernhof/i, role: 'farm' },
  fire: { kw: /fire\s?(station|fighter|dep)|feuerwehr/i, role: 'fire' },
  pool: { kw: /\bpool\b|swimming|schwimmbad/i, icon: '🏊', name: 'pool', cost: 25000 },
  dock: { kw: /\bdocks?\b|\bpier\b|jetty|\bboats?\b/i, icon: '⚓', name: 'dock', cost: 15000 },
  van: { kw: /\bvan\b|\bcar\b|\bbus\b/i, icon: '🚐', name: 'van', cost: 8000 },
  robots: { kw: /robot/i, icon: '🤖', name: 'robots', cost: 50000 },
  mall: { kw: /\bmall\b|shopping (center|centre)|einkaufszentrum/i, icon: '🛍️', name: 'shopping mall', cost: 150000 },
  military: { kw: /military|army|soldier/i, icon: '🪖', name: 'military base', cost: 250000 },
  bank: { kw: /\bbanks?\b/i, role: 'bank' },
  pump: { kw: /water ?pump|\bpump\b/i, icon: '🚰', name: 'water pump', cost: 5000, build: { type: 'pump', utility: true } },
  fountain: { kw: /fountain/i, icon: '⛲', name: 'water fountains', cost: 12000 },
  factory: { kw: /factory|fabrik/i, icon: '🏭', name: 'factory', cost: 80000 },
  restaurant: { kw: /restaurant|restuarant|restaurent/i, icon: '🍽️', name: 'restaurant', cost: 30000 },
  amazon: { kw: /amazon/i, icon: '📦', name: 'Amazon center', cost: 90000 },
  airport: { kw: /airport|flughafen/i, icon: '✈️', name: 'airport', cost: 500000 },
  football: { kw: /football (field|pitch)|soccer (field|pitch)|stadium/i, icon: '⚽', name: 'football field', cost: 40000 },
  power: { kw: /electricity|power ?plant|strom/i, icon: '⚡', name: 'power plant', cost: 60000 },
  detector: { kw: /metal detector/i, icon: '🧲', name: 'metal detector', cost: 2000 },
  market: { kw: /\bmarket\b|supermarket|grocery/i, icon: '🛒', name: 'market', cost: 30000 },
  mine: { kw: /gold ?mine|\bmine\b.{0,15}gold/i, icon: '⛏️', name: 'gold mine', cost: 70000 },
};
for (const [k, r] of Object.entries(ROLES)) if (r.kind === 'shop' && !WISHES[k]) WISHES[k] = { kw: new RegExp(r.kw, 'i'), role: k };

const MOVE = /add me|at me in|move in|moving in|in your house|in the room|live (with|here)|my name is|call me|i sub|subscribed|i am subscribe|go on the island|let me (live|stay)|give me an? |(can|could|may) i (please )?(have|get|live)\b.{0,30}\b(house|home|bungalo\w*|villa|mansion|bunker|apartment|flat|room|plane|robot|mountain)|big house|would (want|like|lika)|i'?m subscrib|\bfor me\b|\bcan i join\b|i want an? .{0,15}\b(house|home)\b|i need an? .{0,12}\b(shack|hut|house|home)\b|^.{0,18}\b(house|home)\b.{0,6}$/i;
// what kind of home someone asks for
const HOME = [['pool', /swimming pool|pool ?house|with a pool/i], ['forest', /\bforest\b|\bwoods\b|wooden house/i], ['shack', /\bshack\b|\bhut\b/i], ['mountain', /mountain/i], ['tower', /bigger than|tallest|skyscraper|\bshard\b|really big house|huge house/i], ['green', /green ?house/i], ['farmhouse', /farm ?(home|house)/i], ['bunker', /bunker/i], ['robothouse', /robot/i], ['mansion', /mansion/i], ['villa', /villa|big house/i], ['bungalow', /bungal/i], ['carhouse', /\bm5\b|\bbmw\b|\bf90\b|car ?house/i], ['plane', /(air)?plane|\bjet\b/i], ['house', /\b(i|me|my)\b.{0,30}\b(house|home)\b|^an? [\p{L}]+ (house|home)\b/iu]];
const NOT_MINE = /everybody|everyone|all of us|for all/i;
const JOIN = /live (in|at) (the|his|her) (\w+ )?(house|home|plane|bunker|mansion)\s+with/i;
const JOIN_WHO = /(?:live|move in|stay) with ([\p{L}]{3,15})\b/iu;
const IAM = /\bi'?m an? ([\p{L}]{3,12})\b/iu;
// "make me the principal", "can I be the president", "when im principal"
const JOB = /(?:make me|can i|could i|may i|i want to|i wanna|when i'?m|let me|i'?ll|i will)\s+(?:please\s+)?(?:be\s+|b\s+)?(?:the\s+|a\s+|an\s+)?(?:(military|vice|super|big|best)\s+)?(principal|headmaster|teacher|police ?chief|sheriff|police|cop|doctor|nurse|president|mayor|government|king|queen|leader|boss|banker|farmer|firefighter|fire chief|judge)/i;
const LEADER = /president|mayor|government|king|queen|leader|boss/i;
const JOB_ROLE = { principal: 'school', headmaster: 'school', teacher: 'school', 'police chief': 'police', policechief: 'police', sheriff: 'police', police: 'police', cop: 'police', doctor: 'hospital', nurse: 'hospital', banker: 'bank', farmer: 'farm', firefighter: 'fire', 'fire chief': 'fire', judge: 'court' };
const NICK = /name me ([\p{L} ]{3,30}?)[.!]*$/iu;
const PLANE = /(air)?plane|\bjet\b/i, BIG = /big house|mansion|villa/i, DOLLAR = /dollar|\$|\busd\b/i;
const FAMILY = /\b(my )?(sister|brother|son|daughter|kids?|child|children|cousin)\b/i;
const WITH_LEO = /(add|at) me in (the|your) (room|house)|in your house|in the room|with (you|leo)/i;
const OWN = /separate house|own house|my own (house|home)|own home/i;
const GREET = /^(hi|hai|hey|hello|hallo|yo)\b|welcome|^[\p{Extended_Pictographic}\s‍️]+$/iu;
const NAME = /(?:my name is|call me|i'?m called)\s+(?!the\b)([\p{L}]{2,15})/iu;
const CUSTOM = /^(?:build|get|make|add|open)?\s*(?:an?|the|some)\s+([\p{L} ]{3,24}?)[.!]*$|^(?:build|get|make|open)\s+(?:an?|the)\s+([\p{L} ]{3,24}?)[.!]*$/iu;

const cap = s => s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const pretty = h => {
  let x = h.replace(/^@/, '').replace(/[-_.].*$/, '').replace(/\d+$/, '');
  const camel = x.match(/^[a-z]+(?=[A-Z])|^[A-Z][a-z]+(?=[A-Z])/);
  if (camel) x = camel[0];
  return cap(x.toLowerCase());
};
const poss = n => /s$/i.test(n) ? n + "'" : n + "'s";
const lc = w => w.key.startsWith('custom:') ? w.name : w.name.toLowerCase();
const COLORS = [
  { hood: '#e2523a', hat: '#2f6fd6', pants: '#3a3f4d', skin: '#f1c6a0', hair: '#3b2a1e' },
  { hood: '#8a6fb8', hat: '#ffd24a', pants: '#2e4a6b', skin: '#d9a878', hair: '#1d1712' },
  { hood: '#46a36a', hat: '#e85a8c', pants: '#4a3a2c', skin: '#a8744d', hair: '#120c08' },
  { hood: '#3d9bd6', hat: '#f08a24', pants: '#2f3542', skin: '#f4d6b8', hair: '#b5672e' },
  { hood: '#ef7fb0', hat: '#46a36a', pants: '#34405a', skin: '#7a4f33', hair: '#120c08' },
  { hood: '#f08a24', hat: '#8a6fb8', pants: '#3e5a8a', skin: '#f0c7a0', hair: '#e2c178' },
];

/** Read the comments: who moves in, who says hi, what people want built. */
export function readComments(comments, subscribed, blocklist = []) {
  const subs = subscribed ? new Set(subscribed.map(h => cleanHandle(h).toLowerCase())) : null;
  const movers = [], greets = [], wishes = {}, order = [], jobs = [], replies = [], family = [], promises = [], all = [], lonely = [], upgrades = [], titles = [], memorial = [], namedShops = [], jobAsks = [], saveAsk = [], devices = [];
  for (const raw of comments) {
    const c = { author: cleanHandle(raw.author), text: cleanText(raw.text, 200).replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/[’‘`´]/g, "'"), likes: raw.likes ?? 0, name: raw.name };
    if (!c.text || isBlocked(c, blocklist)) continue;
    const isSub = subs ? subs.has(c.author.toLowerCase()) : true;
    if (MOVE.test(c.text) && isSub) {
      const name = c.name ?? (c.text.match(NAME)?.[1] ? cap(c.text.match(NAME)[1].toLowerCase()) : null);
      const old = movers.find(m => m.author === c.author);
      const join = c.text.match(JOIN);
      const joinWho = !join && !WITH_LEO.test(c.text) ? c.text.match(JOIN_WHO)?.[1]?.toLowerCase() ?? null : null;
      const kind = join || joinWho || WITH_LEO.test(c.text) || NOT_MINE.test(c.text) ? null : HOME.find(([, re]) => re.test(c.text))?.[0] ?? null;
      const special = kind && kind !== 'house' ? kind : null;
      const own = OWN.test(c.text) || !!kind;
      const extra = { joinWhat: join ? (join[3] ?? '').trim().toLowerCase() || join[4].toLowerCase() : null, joinWho, iam: c.text.match(IAM)?.[1]?.toLowerCase() ?? null };
      if (old) { old.withLeo ||= WITH_LEO.test(c.text); old.own ||= own; old.special ??= special; old.name ??= name; old.joinWhat ??= extra.joinWhat; old.joinWho ??= extra.joinWho; old.iam ??= extra.iam; }
      else movers.push({ ...c, name, withLeo: WITH_LEO.test(c.text), own, special, ...extra });
    }
    const j = c.text.match(JOB);
    if (j) {
      const word = j[2].toLowerCase().replace(/\s+/g, ' '), adj = j[1]?.toLowerCase();
      const role = LEADER.test(word) ? 'leader' : JOB_ROLE[word] ?? JOB_ROLE[word.replace(' ', '')];
      if (role && !jobs.some(x => x.author === c.author && x.role === role))
        jobs.push({ ...c, role, word: adj ? `${adj} ${word}` : word, nick: c.text.match(NICK)?.[1] ? cap(c.text.match(NICK)[1].toLowerCase()) : null });
    }
    if (DOLLAR.test(c.text)) replies.push({ ...c, kind: 'dollar' });
    if (/\bi (will|'?ll)\b|if i (become|am|'?m)\b/i.test(c.text) && !j) promises.push(c);
    if (/revolution|overthrow/i.test(c.text)) replies.push({ ...c, kind: 'king' });
    if (/before gta ?(6|vi|six)\b/i.test(c.text)) replies.push({ ...c, kind: 'gta' });
    if (/\bdonat/i.test(c.text)) replies.push({ ...c, kind: 'donate', amount: c.text.match(/(\d+\s?k|\d[\d,.]*)\s?(euro|€|\$|dollar)/i)?.[1] });
    if (/tornado|hurricane|earthquake|meteor/i.test(c.text)) replies.push({ ...c, kind: 'storm', what: c.text.match(/tornado|hurricane|earthquake|meteor/i)[0].toLowerCase() });
    if (/what('?s| is) the difference between/i.test(c.text)) replies.push({ ...c, kind: 'joke' });
    if (/got mentioned|first time .{0,25}(mentioned|in a vid)/i.test(c.text)) replies.push({ ...c, kind: 'mentioned' });
    if (/stop building|saving for (a|the) school|save (money )?for (a|the) school/i.test(c.text)) saveAsk.push(c);
    const tv = c.text.match(/([\p{L}\d_.]{3,20}) is my (?:[\p{L}]+'?s? )?account.{0,30}live with me/iu);
    if (tv) devices.push({ ...c, who: tv[1], thing: c.text.match(/my ([\p{L}]+)'?s? account/iu)?.[1]?.toLowerCase() });
    // jobs people ask for (the job board)
    const gig = c.text.match(/\bbe an? (famous |pro |great )?(rapper|singer|chef|cook|dj|youtuber|streamer|artist|painter|dancer|actor|builder)\b/i);
    if (gig) jobAsks.push({ ...c, job: `${(gig[1] ?? '').trim() ? gig[1].trim() + ' ' : ''}${gig[2].toLowerCase()}`, icon: '🎤' });
    if (/workshop/i.test(c.text)) jobAsks.push({ ...c, job: 'runs the workshop', icon: '🛠️' });
    if (/\bwe want jobs\b|\bgive us jobs\b/i.test(c.text)) replies.push({ ...c, kind: 'jobs' });
    if (/candidate for (president|mayor)/i.test(c.text) && !jobs.some(x => x.author === c.author && x.role === 'leader')) jobs.push({ ...c, role: 'leader', word: c.text.match(/candidate for (president|mayor)/i)[1].toLowerCase(), nick: null });
    const tt = c.text.match(/\bbe the ([\p{L} ]{3,20}?) of (?:the )?town\b/iu) ?? c.text.match(/\bcall me (?:the )?((?!the\b)[\p{L} ]{3,20}?)[.!]*$/iu);
    if (tt && !/^[\p{L}]+$/u.test(tt[1]) || tt && /\bman\b|maker|king|queen|boss/i.test(tt[1])) titles.push({ ...c, title: tt[1].toLowerCase().trim(), town: /of (?:the )?town/i.test(c.text) });
    if (/statue of (you|leo)/i.test(c.text)) upgrades.push({ ...c, extras: ['statue'] });
    else if (/(gta ?(6|vi|six)|\bvi\b).{0,20}statue|statue.{0,30}\bvi\b/i.test(c.text)) upgrades.push({ ...c, extras: ['vi'] });
    if (/grand ?(parents|ma|pa|mother|father)|passed away|\bdied\b/i.test(c.text) && /hono(u)?r|remember|memory/i.test(c.text)) memorial.push(c);
    const named = c.text.match(/\b(?:shop|store|restaurant|place|caf[eé]|mall|diner) (?:called|named) ([\p{L}\d]{3,20}(?: [\p{L}\d]{2,15}){0,2})/iu);
    if (named) { const k = 'custom:' + named[1].toLowerCase(), e = wishes[k] ??= { key: k, votes: 0, by: [], label: named[1], icon: /burger/i.test(c.text) ? '🍔' : /mall|food/i.test(c.text) ? '🛍️' : /restaurant|diner/i.test(c.text) ? '🍽️' : '🏪' };
      if (!e.by.includes(c.author)) { e.votes++; e.by.push(c.author); } if (!order.includes(k)) order.push(k); namedShops.push({ ...c, shop: named[1] });
      jobAsks.push({ ...c, job: /\bwork at\b/i.test(c.text) ? `works at ${named[1]}` : `owner of ${named[1]}`, icon: e.icon }); }
    else {
      const sh = c.text.match(/\b(?:make|start|open|run|have) an? ([\p{L}]{2,12}) (shop|store|restaurant|diner|bakery|caf[eé])\b/iu);
      if (sh) jobAsks.push({ ...c, job: `owner of the ${sh[1].toLowerCase()} ${sh[2].toLowerCase()}`, icon: '🧸' });
    }
    if (/move in with me|i'?m lonely|i am lonely|someone (can|could) move in/i.test(c.text)) lonely.push(c);
    const up = c.text.match(/around my (\w+)|my (garden|yard)\b/i);
    if (up) upgrades.push({ ...c, extras: [/fence/i.test(c.text) && 'fence', /basket|court/i.test(c.text) && 'court'].filter(Boolean) });
    all.push(c);
    if (FAMILY.test(c.text)) family.push({ ...c, who: c.text.match(FAMILY)[2].toLowerCase() });
    if (GREET.test(c.text) && c.text.length < 40) greets.push(c);
    let found = false;
    const hits = /\b(?:shop|store|restaurant|place|caf[eé]|mall|diner) (?:called|named)\b/i.test(c.text) ? [] : Object.entries(WISHES).map(([k, w]) => [k, c.text.search(w.kw)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
    for (const [k] of hits) {
      found = true;
      const e = wishes[k] ??= { key: k, votes: 0, by: [] };
      if (!e.by.includes(c.author)) { e.votes++; e.by.push(c.author); }
      if (!order.includes(k)) order.push(k);
    }
    const m = !found && c.text.length < 40 && !/\b(house|home)\b/i.test(c.text) && c.text.match(CUSTOM);
    if (m) {
      const label = cap((m[1] ?? m[2]).trim().toLowerCase());
      const k = 'custom:' + label.toLowerCase();
      const e = wishes[k] ??= { key: k, votes: 0, by: [], label };
      if (!e.by.includes(c.author)) { e.votes++; e.by.push(c.author); }
      if (!order.includes(k)) order.push(k);
    }
  }
  const ranked = Object.values(wishes).sort((a, b) => b.votes - a.votes || order.indexOf(a.key) - order.indexOf(b.key));
  // the same short comment posted again and again
  const spamCount = {};
  for (const c of all) { const k = c.author + '|' + c.text.toLowerCase(); spamCount[k] = (spamCount[k] ?? 0) + 1; }
  const spam = Object.entries(spamCount).filter(([, n]) => n >= 4).map(([k, n]) => ({ author: k.split('|')[0], text: all.find(c => c.author + '|' + c.text.toLowerCase() === k).text, n }))[0] ?? null;
  // one person writing a big share of all comments
  const byAuthor = {};
  for (const c of all) byAuthor[c.author] = (byAuthor[c.author] ?? 0) + 1;
  const [topA, topN] = Object.entries(byAuthor).sort((a, b) => b[1] - a[1])[0] ?? [];
  const flood = topN >= 20 && topN >= all.length * 0.3 ? { author: topA, n: topN, contest: all.some(c => c.author === topA && /spam contest/i.test(c.text)),
    title: all.filter(c => c.author === topA).map(c => c.text.match(/\bi am ((?:the |a )?[\w ]{0,20}spammer)/i)?.[1]).filter(Boolean).sort((a, b) => b.length - a.length)[0] } : null;
  return { movers, greets, ranked, jobs, replies, family, order, promises, spam, all, lonely, upgrades, flood, titles, memorial, namedShops, jobAsks, saveAsk, devices };
}

function wishInfo(w) {
  if (w.key.startsWith('custom:')) return { icon: w.icon ?? '🏪', name: w.label, cost: 28000, build: { type: 'shop', shop: true } };
  const d = WISHES[w.key];
  if (d.role) { const r = ROLES[d.role]; return { icon: r.icon, name: r.name.en, cost: r.cost, role: d.role, build: { type: r.kind } }; }
  return { icon: d.icon, name: d.name, cost: d.cost, build: d.build };
}

export function storyDay(prev, input, cfg) {
  const s = structuredClone(prev);
  s.day += 1;
  s.wishes ??= {};
  const who = cfg.mayorName, town = cfg.cityName;
  const eco = { perSubscriber: 1000, perLike: 1, perComment: 2, ...cfg.economy };
  const fmt = n => Math.round(n).toLocaleString('en-US'), money = n => '€' + fmt(n);
  const H = TOWNHALL, door = { x: H.x + 0.5, z: H.z + 5.3 };
  // public subscribers from YouTube Studio: [{ handle, name }]. Most subscriptions are private,
  // so commenters who say they subscribed are believed unless input.onlySubscribers is set.
  const pub = (input.publicSubscribers ?? []).map(p => ({ handle: cleanHandle(p.handle ?? p), name: p.name ?? null }));
  const pubName = new Map(pub.map(p => [p.handle.toLowerCase(), p.name]));
  const { movers, greets, ranked: today, jobs, replies, family, order: wishOrder, promises, spam, all, lonely, upgrades, flood, titles, memorial, namedShops, jobAsks, saveAsk, devices } = readComments((input.comments ?? []).map(c => ({ ...c, author: input.aliases?.[c.author] ?? c.author })), input.onlySubscribers ? pub.map(p => p.handle) : null, cfg.blocklist);
  // wishes add up over the days: yesterday's votes still count
  const merged = new Map();
  for (const [k, e] of Object.entries(s.wishes)) merged.set(k, { key: k, votes: e.votes, by: [...e.by], label: e.label, icon: e.icon, first: e.first ?? 0 });
  today.forEach((w, i) => {
    const e = merged.get(w.key) ?? { key: w.key, votes: 0, by: [], label: w.label, icon: w.icon, first: 1000 + wishOrder.indexOf(w.key) };
    for (const h of w.by) if (!e.by.includes(h)) { e.by.push(h); e.votes++; }
    merged.set(w.key, e);
  });
  const ranked = [...merged.values()].sort((a, b) => b.votes - a.votes || a.first - b.first);
  for (const m of movers) { m.said = !!m.name; m.name ??= pubName.get(m.author.toLowerCase()) ?? null; }
  const nameOf = m => m.name ?? pubName.get(m.author.toLowerCase()) ?? pretty(m.author);

  // ---- money ----
  const before = s.residents, after = Math.max(1, (input.subscribers ?? 0) + 1);   // + Leo himself
  const vid = input.video ?? {}, seen = s.videos[vid.id] ?? { likes: 0, comments: 0 };
  const likes = Math.max(0, (vid.likes ?? 0) - seen.likes), nComments = Math.max(0, (vid.commentCount ?? input.comments?.length ?? 0) - seen.comments);
  if (vid.id) s.videos[vid.id] = { likes: vid.likes ?? 0, comments: vid.commentCount ?? 0 };
  const gained = Math.max(0, after - before);
  const rows = [
    { icon: '👤', label: `${fmt(gained)} new subscriber${gained === 1 ? '' : 's'}`, amount: '+' + money(gained * eco.perSubscriber) },
    ...(vid.likes == null ? [] : [{ icon: '❤️', label: `${fmt(likes)} like${likes === 1 ? '' : 's'}`, amount: '+' + money(likes * eco.perLike) }]),
    { icon: '💬', label: `${fmt(nComments)} comment${nComments === 1 ? '' : 's'}`, amount: '+' + money(nComments * eco.perComment) },
  ];
  const income = gained * eco.perSubscriber + likes * eco.perLike + nComments * eco.perComment;

  // ---- timeline ----
  const shots = [], tags = [], people = [], newTiles = [], tracks = { cash: [[0, s.cash]], residents: [[0, before]], housing: [[0, s.housing]] };
  let now = 0;
  const shot = (o, caps, hold = 0) => {
    const t0 = now; let t = t0 + 0.1;
    const captions = caps.filter(Boolean).map(c => { const [lines, d, say] = c; const x = { lines, t0: t, t1: t + d, ...(say ? { say } : {}) }; t += d; return x; });
    now = t + hold; const sh = { t0, t1: now, ...o, captions }; shots.push(sh); return sh;
  };
  const move = (k, at, to, d = 0.9) => { const tr = tracks[k]; tr.push([at, tr.at(-1)[1]], [at + d, to]); };
  const place = (rec, at, zone = 'com') => {
    const { i, j } = nthLot(zone, s.next[zone]++);
    const b = { id: s.seq++, i, j, x: lotX(i), z: lotZ(j), day: s.day, seed: hash(s.seq + ':' + i) % 1000, ...rec, _at: at };
    s.buildings.push(b);
    // extend the cobblestone road along the new lot
    const x0 = Math.min(...s.tiles.filter(t => t.z === 12).map(t => t.x - t.w / 2)), x1 = Math.max(...s.tiles.filter(t => t.z === 12).map(t => t.x + t.w / 2));
    for (let x = x1; x < b.x + 7.5; x += 15) { const t = { k: 'c' + Math.round(x), x: x + 7.5, z: 12, w: 15, d: 6, cobble: true }; s.tiles.push(t); newTiles.push({ ...t, at: at - 0.3 }); }
    for (let x = x0; x > b.x - 7.5; x -= 15) { const t = { k: 'c' + Math.round(x), x: x - 7.5, z: 12, w: 15, d: 6, cobble: true }; s.tiles.push(t); newTiles.push({ ...t, at: at - 0.3 }); }
    return b;
  };
  // residents from earlier days; a newcomer never stands inside one of them
  const oldPeople = (prev.people ?? []).map(p => ({ ...p }));
  const taken = (x, z, skip) => [...oldPeople, ...people].some(o => o !== skip && Math.hypot(o.x - x, o.z - z) < 1.4);
  const person = (m, x, z, at, ry = 0, title = 'Resident') => {
    const name = nameOf(m);
    const p = { id: m.author, name, handle: m.author, x, z, ry, at, colors: COLORS[hash(m.author) % COLORS.length] };
    // someone who moves to a new home leaves the old spot
    for (let k = oldPeople.length - 1; k >= 0; k--) if (oldPeople[k].id === m.author) oldPeople.splice(k, 1);
    // whoever already stands here steps back, row by row, until there is a free spot
    for (const o of oldPeople.filter(o => Math.hypot(o.x - x, o.z - z) < 1.4)) {
      search: for (const row of [1, 2, 3, 4, 5]) for (const dx of [1.15, -1.15, 3.45, -3.45, 0, 2.3, -2.3, 5.75, -5.75]) {
        const nz = z - 1.8 * row;
        if (!taken(o.x + dx, nz, o) && Math.hypot(o.x + dx - x, nz - z) >= 1.4) { o.x += dx; o.z = nz; break search; }
      }
    }
    people.push(p);
    s.citizens[m.author] = { role: 'resident', title, name, day: s.day };
    return p;
  };
  const names = list => list.length === 1 ? `*${list[0]}*` : list.slice(0, -1).map(n => `*${n}*`).join(', ') + ` and *${list.at(-1)}*`;

  // 1. intro
  const overview = { x: 0, z: R * 0.06, dist: R * 3.7, pitch: 62, yaw: 0 };
  shot({ type: 'intro', cam: overview, cam2: { ...overview, dist: R * 3.45 }, ring: { x: 5, z: 6, r: 62 } }, [[[`Day *${s.day}* in`, `*${town}!*`], 2.2]]);

  // a new challenger for yesterday's comment spammer
  if (flood) s.lastFlood = { author: flood.author, title: flood.title };
  const champ = prev.lastFlood, byA = {};
  for (const c of all) if (/spam/i.test(c.text)) (byA[c.author] ??= []).push(c);
  const rivalA = champ && !flood ? Object.keys(byA).find(a => a !== champ.author && byA[a].length >= 3) : null;
  const rival = rivalA ? { author: rivalA, name: all.find(c => c.author === rivalA && c.name)?.name ?? s.citizens[rivalA]?.name ?? pretty(rivalA), items: byA[rivalA] } : null;
  const champName = champ ? s.citizens[champ.author]?.name ?? pretty(champ.author) : null;

  // 2. greetings
  const firstDay = (prev.people ?? []).length === 0;
  const loud = [...jobs, ...movers.filter(m => m.special), ...replies].filter((c, i, a) => a.findIndex(x => x.author === c.author) === i);
  const newChamp = flood && prev.lastFlood && prev.lastFlood.author !== flood.author;
  const spamItems = newChamp ? all.filter(c => c.author === flood.author && /spam|challenge/i.test(c.text)).filter((c, i, a) => a.findIndex(x => x.text.toLowerCase() === c.text.toLowerCase()) === i).slice(0, 4)
    : flood ? all.filter(c => c.author === flood.author && /spammer|spam contest|metal detector|lonely/i.test(c.text)).filter((c, i, a) => a.findIndex(x => (x.text.match(/spammer|contest|detector|lonely/i)?.[0] ?? x.text).toLowerCase() === (c.text.match(/spammer|contest|detector|lonely/i)?.[0] ?? c.text).toLowerCase()) === i).slice(0, 4)
    : spam ? Array.from({ length: 3 }, () => ({ author: spam.author, text: spam.text }))
    : rival ? rival.items.filter((c, i, a) => a.findIndex(x => x.text.toLowerCase() === c.text.toLowerCase()) === i).slice(0, 3) : [];
  const g = (firstDay ? greets : [...spamItems, ...loud, ...greets]).slice(0, 4);
  shot({ type: 'greet', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: -8 }, cam2: { x: door.x, y: 1.7, z: door.z, dist: 9.5, pitch: 6, yaw: 4 },
    actor: { ...door, ry: 0, anim: 'wave' },
    panel: g.length ? { kind: 'greet', items: g.map(c => ({ author: c.author, text: cleanText(c.text, 64), hue: hash(c.author) % 360 })) } : null },
  firstDay ? [[[`Yesterday, ${who} was`, '*all alone…*'], 2.0], [['…and then *you*', 'showed up!'], 2.0]]
    : flood ? [[[`*${fmt(nComments)}* comments yesterday…`], 2.0],
        [[`…and *${flood.n}* of them`, `are from *${s.citizens[flood.author]?.name ?? all.find(c => c.author === flood.author && c.name)?.name ?? pretty(flood.author)}!*`], 2.4],
        flood.title ? [['He calls himself', `*"${flood.title}"!*`], 2.4] : null,
        prev.lastFlood && prev.lastFlood.author !== flood.author ? [[`*${s.citizens[flood.author]?.name ?? pretty(flood.author)}* takes the spam crown`, `from *${s.citizens[prev.lastFlood.author]?.name ?? pretty(prev.lastFlood.author)}!*`], 2.6] : null,
        flood.contest ? [['He wants a comment', 'spam *contest…*'], 2.0] : null,
        flood.contest ? [['…but he already *won!*'], 1.6] : null,
        [['Still, that\'s', `*${money(flood.n * eco.perComment)}* for the town!`], 2.2]]
    : spam ? [[[`*${fmt(nComments)}* comments yesterday…`], 2.0],
        [[`…and *${spam.n}* of them are from *${s.citizens[spam.author]?.name ?? all.find(c => c.author === spam.author && c.name)?.name ?? pretty(spam.author)}*,`, `who just typed *"${spam.text}"!*`], 2.8],
        [['Still, that\'s', `*${money(spam.n * eco.perComment)}* for the town!`], 2.2]]
    : rival ? [[[`*${fmt(nComments)}* comments yesterday…`], 2.0], [[`…and *${rival.name}* wants`, `${poss(champName)} *spam crown!*`], 2.6]]
    : [[[`*${fmt(nComments)}* comments yesterday…`], 2.0], [['…and you have', '*big plans!*'], 2.0]]);

  // 3. new residents
  const fol = shot({ type: 'followers', cam: { x: 18, z: 2, dist: 75, pitch: 36, yaw: -12 }, cam2: { x: 14, z: 4, dist: 68, pitch: 38, yaw: -6 },
    panel: { kind: 'followers', title: 'RESIDENTS', y: 'YESTERDAY', t: 'TODAY', from: before, to: after, c0: 2.1, c1: 3.1 } },
  [[[`Yesterday: *${fmt(before)}* resident${before === 1 ? '' : 's'}.`], 2.0], [[`Today, we are *${fmt(after)}!*`], 2.2]]);
  move('residents', fol.t0 + 2.1, after, 1.0);
  s.residents = after;

  // 4. income
  const inc = shot({ type: 'income', cam: { x: 6, z: 8, dist: 62, pitch: 46, yaw: 10 }, cam2: { x: 2, z: 8, dist: 58, pitch: 46, yaw: 14 }, panel: { kind: 'income', rows } },
    [[['That brings', `*${money(income)}* into the budget!`], 3.0]]);
  s.cash += income; move('cash', inc.t0 + 1.4, s.cash, 1.3);
  // a savings jar for the big goal: once someone asks for it, half of every day's income goes in
  if (saveAsk.length && !s.saveFor && prev.goal) {
    s.saveFor = prev.goal.key;
    const sa = saveAsk[0], sn = s.citizens[sa.author]?.name ?? sa.name ?? pretty(sa.author), gname = (WISHES[prev.goal.key]?.role ? ROLES[WISHES[prev.goal.key].role].name.en : WISHES[prev.goal.key]?.name ?? 'goal').toLowerCase();
    shot({ type: 'save', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: -8 }, actor: { ...door, ry: 0, anim: 'look' },
      panel: { kind: 'greet', items: [{ author: sa.author, text: cleanText(sa.text, 70), hue: hash(sa.author) % 360 }] } },
    [[[`*${sn}* says: stop building houses,`, `save for the *${gname}!*`], 2.8], [['Okay! From now on, *half*', `of all money goes into the *${gname} fund!*`], 3.2]], 0.3);
  }
  if (s.saveFor) s.fund = (s.fund ?? 0) + Math.floor(income / 2);

  // 5. roommates: people who asked to live with Leo first, then other named movers
  // room left in Leo's own house (4 beds: Leo + 3)
  const free = Math.max(0, 3 - Object.values(s.citizens).filter(c => c.title === 'Roommate').length);
  const order = [...movers.filter(m => m.withLeo && !m.own), ...movers.filter(m => !m.withLeo && !m.own && m.said), ...movers.filter(m => !m.withLeo && !m.own && !m.said)];
  const mates = order.slice(0, free);
  let at;
  if (mates.length) {
    const sh = shot({ type: 'roommates', cam: { x: door.x - 0.9, y: 3.6, z: door.z + 1, dist: 30, pitch: 13, yaw: 8 }, cam2: { x: door.x - 0.9, y: 3.6, z: door.z + 1, dist: 28, pitch: 12, yaw: 2 },
      actor: { ...door, ry: 0, anim: 'cheer' },
      panel: { kind: 'room', title: `${who}'s house`, filled: 1, total: 4, at: 0.3, mates: [] } },
    [[[names(mates.map(nameOf)), `move in with ${who}!`], 3.2], [[mates.length >= free ? `His house is *full!*` : `There's still room for *${free - mates.length}!*`], 1.8]]);
    const spots = [[-1.7, 0.6], [1.7, 0.6], [-3.4, 1.3]];
    mates.forEach((m, k) => {
      at = sh.t0 + 0.9 + k * 0.6;
      const p = person(m, door.x + spots[k][0], door.z + spots[k][1], at, -spots[k][0] * 0.06, 'Roommate');
      sh.panel.mates.push({ name: p.name, hue: hash(m.author) % 360, at: at - sh.t0 });
      tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name, sub: m.author !== '@' + p.name ? m.author : null, t0: at + 0.2, t1: sh.t1 });
    });
  }

  // 6. own houses: a full scene each when there are only a few, a quick montage when many ask
  const HOMES = {
    plane: { type: 'planehouse', cost: 12000, icon: '✈️', label: n => `${n}'s plane house`, ask: ['a *plane* as a house…'], done: 'Cleared for landing!', big: true },
    bunker: { type: 'bunker', cost: 10000, icon: '☢️', label: n => `${n}'s bunker`, ask: ['a *nuclear bunker…*'], done: 'Built to last!', big: true },
    robothouse: { type: 'robothouse', cost: 12000, icon: '🤖', label: n => `${n}'s robot house`, ask: ['a *robot* as a house…'], done: 'Beep boop, welcome home!', big: true },
    mansion: { type: 'mansion', cost: 12000, icon: '🏛️', label: n => `${n}'s mansion`, ask: ['a *mansion…*'], quick: 'a *mansion!*' },
    villa: { type: 'villa', cost: 9000, icon: '🏡', label: (n, m) => /big house/i.test(m.text) ? `${n}'s big house` : `${n}'s villa`, ask: m => /big house/i.test(m.text) ? ['a *big house…*'] : ['a *villa…*'], quick: 'a *villa!*' },
    bungalow: { type: 'bungalow', cost: 4000, icon: '🏠', label: n => `${n}'s bungalow`, ask: ['a *bungalow…*'], quick: 'a *bungalow!*' },
    carhouse: { type: 'carhouse', cost: 6000, icon: '🏎️', label: n => `${n}'s M5 house`, ask: ['a house with an *M5…*'], quick: 'a house *with an M5!*' },
    pool: { type: 'house', cost: 6000, icon: '🏊', label: n => `${n}'s pool house`, ask: ['a house with a', '*swimming pool…*'], quick: 'a house *with a pool!*', rec: { pool: true } },
    forest: { type: 'cabin', cost: 5000, icon: '🌲', label: n => `${n}'s forest cabin`, ask: ['a *wooden house*', 'in the forest…'], done: 'Deep in the woods!', big: true, spot: { x: 70, z: -70 } },
    shack: { type: 'cabin', cost: 3000, icon: '🛖', label: n => `${n}'s little shack`, ask: ['a *little shack…*'], quick: 'a *little shack!*' },
    mountain: { type: 'cabin', cost: 8000, icon: '⛰️', label: n => `${n}'s mountain cabin`, verb: 'wanted', ask: ['to live on the *mountain…*'], done: 'A cabin by the spring!', big: true, spot: { x: -84, z: -100 } },
    tower: { type: 'mega', cost: 25000, icon: '🏙️', label: n => `${n}'s tower`, ask: m => /shard/i.test(m.text) ? ['a house bigger', 'than *the Shard…*'] : ['a *huge* house…'], done: 'The tallest home on the island!', big: true },
    green: { type: 'house', cost: HOUSE.cost, icon: '💚', label: n => `${n}'s green house`, ask: ['a *green house…*'], quick: 'a *green house!*', rec: { wall: '#8fd27a', roof: '#3f8f4e' } },
    farmhouse: { type: 'house', cost: 4000, icon: '🚜', label: n => `${n}'s farm home`, ask: ['a *farm home…*'], quick: 'a *farm home!*', rec: { farm: true } },
    house: { type: 'house', cost: HOUSE.cost, icon: '🏠', label: n => `${n}'s house`, ask: m => /separate/i.test(m.text) ? ['a *separate house…*'] : ['a *house…*'], quick: 'a *house!*' },
  };
  // whoever waited since yesterday comes first
  const waiting = (s.homeQueue ?? []).filter(q => !s.citizens[q.author] || s.citizens[q.author].title !== 'Home owner');
  for (const q of waiting) if (!movers.some(m => m.author === q.author)) movers.push({ ...q });
  const ownAll = [...waiting.map(q => movers.find(m => m.author === q.author)).filter(m => m && !m.joinWho), ...movers.filter(m => m.own && !m.joinWho && !mates.includes(m) && !waiting.some(q => q.author === m.author))]
    .filter(m => m && !(s.citizens[m.author]?.title === 'Home owner'));
  const montage = ownAll.length > 2;
  const own = [];
  // homes may use today's income and half of the savings; small things for everyone are paid first
  const reserve = today.filter(w => WISHES[w.key]?.build?.utility).reduce((a, w) => a + WISHES[w.key].cost, 0);
  let homeBudget = montage ? Math.max(0, (s.saveFor ? income - Math.floor(income / 2) : income) + Math.floor((s.cash - income - (prev.fund ?? 0)) * 0.5) - reserve) : s.cash - (s.fund ?? 0);
  const plan = [], later = [];
  const isWaiting = m => waiting.some(q => q.author === m.author), fresh = ownAll.filter(m => !isWaiting(m));
  let cashLeft = s.cash - (s.fund ?? 0);
  // people from the waiting list always go first
  for (const m of montage ? [...ownAll.filter(isWaiting), ...fresh.filter(m => HOMES[m.special ?? 'house'].big), ...fresh.filter(m => !HOMES[m.special ?? 'house'].big)] : ownAll.slice(0, 2)) {
    const h = HOMES[m.special ?? 'house'], promised = s.day >= 5 && isWaiting(m);
    if (h.cost <= (promised ? cashLeft : Math.min(homeBudget, cashLeft)) && plan.length < 8) { plan.push(m); homeBudget -= h.cost; cashLeft -= h.cost; } else later.push(m);
  }
  s.homeQueue = later.map(m => ({ author: m.author, text: m.text, name: m.name, special: m.special, own: true }));
  const ordered = montage ? [...plan.filter(m => !HOMES[m.special ?? 'house'].big), ...plan.filter(m => HOMES[m.special ?? 'house'].big)] : plan;
  for (const m of ordered) {
    const name = nameOf(m), h = HOMES[m.special ?? 'house'];
    const label = h.label(name, m), ask = typeof h.ask === 'function' ? h.ask(m) : h.ask;
    const t0 = now;
    const quick = montage && !h.big;
    const rec = { type: h.type, cap: HOUSE.cap, owner: m.author, sign: { icon: h.icon, name: label, handle: m.author }, ...(h.rec ?? {}) };
    let b;
    if (h.spot) { b = { id: s.seq++, x: h.spot.x, z: h.spot.z, ry: 0.5, day: s.day, seed: hash(m.author) % 1000, ...rec, _at: t0 + 1.2 }; s.buildings.push(b); }
    else b = place(rec, t0 + (quick ? 0.5 : 1.2));
    const wide = h.type === 'mega' ? 3.2 : h.type === 'robothouse' ? 1.75 : h.type === 'planehouse' ? 1.35 : h.type === 'mansion' ? 1.25 : 1;
    const camY = h.type === 'mega' ? 22 : h.type === 'robothouse' ? 7.5 : 3.6 * wide;
    const sh = shot({ type: 'build', cam: { x: b.x + 1.8, y: camY, z: b.z + 4, dist: 36 * wide, pitch: 16, yaw: -12 }, cam2: { x: b.x + 1.8, y: camY, z: b.z + 4, dist: 33 * wide, pitch: 15, yaw: -5 },
      panel: { kind: 'price', amount: '−' + money(h.cost), label, at: quick ? 0.55 : 1.25 } },
      quick ? [[[`*${name}* gets`, h.quick], 2.0]] : [[[`*${name}* ${h.verb ?? 'asked for'}`, ...ask], 2.2], [[h.done ?? 'Here it is!'], 1.6]], quick ? 0.2 : 0.3);
    const p = person(m, b.x + 4.0, b.z + (h.type === 'planehouse' ? 8.6 : h.type === 'mansion' ? 9.6 : 7.2), t0 + (quick ? 0.9 : 1.9), -0.25, 'Home owner');
    tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name, sub: m.author !== '@' + p.name ? m.author : null, t0: t0 + (quick ? 1.0 : 2.1), t1: sh.t1 });
    s.cash -= h.cost; s.housing += HOUSE.cap;
    move('cash', t0 + (quick ? 0.55 : 1.25), s.cash, 0.6); move('housing', t0 + (quick ? 0.5 : 1.2), s.housing, 0.5);
    own.push(m);
  }

  if (montage && later.length) {
    const nm = later.map(nameOf).filter(n => n.length <= 12);
    shot({ type: 'queue', cam: { x: 8, z: 0, dist: 120, pitch: 46, yaw: -6 }, cam2: { x: 8, z: 0, dist: 112, pitch: 46, yaw: 0 },
      panel: { kind: 'hires', icon: '🏗️', title: 'YOUR HOME COMES NEXT', rows: later.slice(0, 4).map(m => ({ handle: nameOf(m), title: HOMES[m.special ?? 'house'].label('', m).replace(/^'s /, ''), hue: hash(m.author) % 360 })), more: Math.max(0, later.length - 4), note: 'Built first next time!' } },
    [[nm.length ? [names(nm.slice(0, 3)) + ':', 'your homes come *next!*'] : [`*${later.length}* more homes`, 'come *next time!*'], 2.6]], 0.3);
  }

  // 6a. upgrades for homes people already have ("a fence around my bungalow")
  for (const u of upgrades.filter(u => u.extras.length)) {
    const home = [...s.buildings].reverse().find(b => b.owner === u.author && b.i != null);
    if (!home) continue;
    const t0 = now, name = s.citizens[u.author]?.name ?? nameOf(u), cost = 1500 * u.extras.filter(e => e !== 'statue').length;
    s.buildings.push({ id: s.seq++, type: 'yard', x: home.x, z: home.z, day: s.day, extras: u.extras, _at: t0 + 1.2 });
    const what = u.extras.map(e => ({ fence: 'a *fence*', court: 'a *basketball court*', statue: `a *statue of ${who}*`, vi: 'a giant *"VI"* behind the house' })[e]);
    const statue = u.extras.includes('statue');
    const sh = shot({ type: 'build', cam: statue ? { x: home.x, y: 15, z: home.z, dist: 30, pitch: 14, yaw: -12 } : { x: home.x - 1, y: 0, z: home.z + 3, dist: 66, pitch: 46, yaw: -10 },
      cam2: statue ? { x: home.x, y: 15, z: home.z, dist: 27, pitch: 13, yaw: -4 } : { x: home.x - 1, y: 0, z: home.z + 3, dist: 60, pitch: 44, yaw: -2 },
      panel: cost ? { kind: 'price', amount: '−' + money(cost), label: `${name}'s garden`, at: 1.25 } : null },
    [[[`*${name}* wanted`, what.join(' and ') + (statue && home.type === 'robothouse' ? ' on the *robot head…*' : '…')], 2.6], [[cost ? 'Done!' : `Done, and paid with ${poss(name)} *comment money!*`], cost ? 1.4 : 2.4]], 0.3);
    s.cash -= cost; move('cash', t0 + 1.25, s.cash, 0.5);
    void sh;
  }

  // 6b. moving in with someone who already has a special home ("can I live in the plane house with him")
  const JOIN_TYPE = { plane: 'planehouse', bunker: 'bunker', mansion: 'mansion', robot: 'robothouse', house: 'house' };
  const canJoin = m => !s.citizens[m.author] || (m.joinWho && s.citizens[m.author].title !== 'Home owner' && !String(s.citizens[m.author].title).startsWith('Roommate'));
  for (const m of movers.filter(m => (m.joinWhat || m.joinWho) && canJoin(m))) {
    const host = m.joinWho ? [...s.buildings].reverse().find(b => b.owner && b.owner !== m.author && [s.citizens[b.owner]?.name, pretty(b.owner)].some(n => n && n.toLowerCase() === m.joinWho))
      : [...s.buildings].reverse().find(b => b.owner && b.type === (JOIN_TYPE[m.joinWhat] ?? m.joinWhat));
    if (!host) continue;
    const hostName = s.citizens[host.owner]?.name ?? pretty(host.owner), name = nameOf(m);
    const sh = shot({ type: 'join', cam: { x: host.x + 2, y: 3, z: host.z + 6, dist: 34, pitch: 14, yaw: 10 }, cam2: { x: host.x + 2, y: 3, z: host.z + 6, dist: 31, pitch: 13, yaw: 4 },
      panel: { kind: 'greet', items: [{ author: m.author, text: cleanText(m.text, 64), hue: hash(m.author) % 360 }] } },
    [[[`*${name}* moves in`, `with *${hostName}!*`], 2.4], m.iam ? [[`By the way, ${name}`, `is a *${m.iam}!*`], 2.2] : null,
     prev.roommateWanted === host.owner ? [[`*${hostName}* is not`, '*lonely* anymore!'], 2.2] : null], 0.3);
    const p = person(m, host.x + 6.2, host.z + 8.4, sh.t0 + 0.8, -0.3, 'Roommate of ' + hostName);
    tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name, sub: m.iam ? `the ${m.iam}` : null, t0: sh.t0 + 1.0, t1: sh.t1 });
    own.push(m);
  }

  // 6c. "X is my TV's account, can it live with me" – the device moves in with its owner
  for (const d of devices.slice(0, 1)) {
    const host = [...s.buildings].reverse().find(b => b.owner === d.author);
    if (!host) continue;
    const hn = s.citizens[d.author]?.name ?? d.name ?? pretty(d.author), dh = cleanHandle(d.who);
    const thing = !d.thing || d.thing.length <= 2 ? (d.thing ?? 'tv').toUpperCase() : d.thing;

    const sh = shot({ type: 'join', cam: { x: host.x + 2, y: 3, z: host.z + 6, dist: 34, pitch: 14, yaw: 10 }, cam2: { x: host.x + 2, y: 3, z: host.z + 6, dist: 31, pitch: 13, yaw: 4 },
      panel: { kind: 'greet', items: [{ author: d.author, text: cleanText(d.text, 70), hue: hash(d.author) % 360 }] } },
    [[[`Wait… *${d.who}* is`, `${poss(hn)} *${thing}?!*`], 2.4], [[`Then it moves in`, `with *${hn}* too!`], 2.2]], 0.3);
    const p = person({ author: dh, name: d.who }, host.x + 3.6, host.z + 8.8, sh.t0 + 1.0, -0.2, `${poss(hn)} ${thing}`);
    tags.push({ x: p.x, y: 3.0, z: p.z, text: d.who, sub: `the ${thing}`, t0: sh.t0 + 1.2, t1: sh.t1 });
    own.push({ author: dh });
  }

  // 7. housing for everyone without a bed, then the most wanted building if we can pay for it
  const built = [];
  const want = ranked.map(w => ({ ...w, ...wishInfo(w) }));
  const rest = [...movers.filter(m => !mates.includes(m) && !own.includes(m) && !s.citizens[m.author]),
    ...pub.filter(p => !movers.some(m => m.author.toLowerCase() === p.handle.toLowerCase()) && !s.citizens[p.handle]).map(p => ({ author: p.handle, name: p.name }))];
  let newcomers = Math.max(rest.length, gained - mates.length - own.length);
  const buildWish = w => {
    const t0 = now, credit = w.by[0];
    const rec = w.build.type === 'block' ? { type: 'block', cap: w.build.cap }
      : w.build.type === 'shop' ? { type: 'shop', role: 'custom', name: w.name, owner: credit, style: { color: ['#d6584a', '#3f8fd0', '#46a36a', '#c9589f', '#e09a2e'][hash(w.name) % 5] }, sign: { icon: w.icon, name: w.name, handle: credit } }
      : { type: w.build.type, role: w.role, name: w.name, style: { color: ROLES[w.role].color, feature: ROLES[w.role].feature ?? null }, sign: { icon: w.icon, name: w.name, handle: credit ? 'idea: ' + credit : town } };
    const b = place(rec, t0 + 1.4);
    const tall = w.build.type === 'block';
    const sh = shot({ type: 'build', cam: { x: b.x, y: tall ? 5 : 3, z: b.z + 2, dist: tall ? 52 : 40, pitch: 22, yaw: 16 }, cam2: { x: b.x, y: tall ? 5 : 3, z: b.z + 2, dist: tall ? 46 : 36, pitch: 20, yaw: 8 },
      panel: { kind: 'price', amount: '−' + money(w.cost), label: cap(w.name), at: 1.45 } },
    [[!credit ? ['So we build', `a${/^[aeiou]/i.test(w.name) ? 'n' : ''} *${lc(w)}!*`] : [w.votes > 1 ? `*${w.votes}* of you wanted` : `*${pretty(credit)}* wanted`, `a${/^[aeiou]/i.test(w.name) ? 'n' : ''} *${lc(w)}…*`], 2.4],
     [[tall ? `Room for *${fmt(w.build.cap)}* more!` : 'Here it is!'], 1.8]], 0.3);
    if (credit) tags.push({ x: b.x, y: tall ? 7.5 : 6, z: b.z + 6, text: 'Idea: ' + credit, t0: t0 + 2.0, t1: sh.t1 });
    s.cash -= w.cost; move('cash', t0 + 1.45, s.cash, 0.7);
    if (w.build.cap) { s.housing += w.build.cap; move('housing', t0 + 1.4, s.housing, 0.6); }
    built.push(w.key);
    return b;
  };
  const moveIn = b => {
    if (!rest.length && newcomers <= 0) return;
    const shown = [...rest].sort((a, b) => (nameOf(a).length <= 11 ? 0 : 1) - (nameOf(b).length <= 11 ? 0 : 1)).slice(0, 3);
    const welcome = pub.filter(p => p.name && !s.citizens[p.handle] && !(input.comments ?? []).some(c => cleanHandle(c.author).toLowerCase() === p.handle.toLowerCase()))
      .map(p => p.name.split(' ')[0]).filter(n => n.length <= 11).slice(0, 5);
    const short = shown.map(nameOf).filter(n => n.length <= 11).slice(0, 2), more = newcomers - short.length;
    const sh2 = shot({ type: 'movein', cam: { x: b.x, y: 2.4, z: b.z + 7, dist: 22, pitch: 13, yaw: -8 }, cam2: { x: b.x, y: 2.4, z: b.z + 7, dist: 20, pitch: 12, yaw: -2 } },
      [[[short.length ? names(more > 0 ? [...short, `${more} more`] : short) : `*${newcomers}* of you`, b.day === s.day ? 'move in!' : `move into the *${b.type === 'block' ? 'apartment block' : 'house'}!*`], 2.6],
       welcome.filter(n => !short.includes(n)).length ? [['Welcome ' + names(welcome.filter(n => !short.includes(n))) + '!'], 2.6] : null], 0.3);
    shown.forEach((m, k) => {
      const p = person(m, b.x - 2.3 + k * 2.3, b.z + 7.4 + (k % 2) * 0.5, sh2.t0 + 0.4 + k * 0.35, 0);
      tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name.length <= 11 ? p.name : m.author, t0: sh2.t0 + 0.6 + k * 0.35, t1: sh2.t1 });
    });
    for (const m of rest.filter(m => !shown.includes(m))) s.citizens[m.author] = { role: 'resident', title: 'Resident', name: nameOf(m), day: s.day };
  };
  let homeless = Math.max(0, s.residents - s.housing);
  if (homeless > 0) {
    shot({ type: 'tents', cam: { x: -32, z: 30, dist: 60, pitch: 40, yaw: 10 }, tentsAt: { x: -32, z: 30 } },
      [[[`But *${fmt(homeless)}* of you`, 'still sleep in *tents!*'], 2.4]]);
    newcomers = Math.max(rest.length, homeless);
    const apt = want.find(w => w.key === 'apartment') ?? { key: 'apartment', votes: 0, by: [], ...wishInfo({ key: 'apartment' }) };
    if (apt.cost <= s.cash) moveIn(buildWish(apt));
  } else if (newcomers > 0) {
    const home = [...s.buildings].reverse().find(b => b.type === 'block') ?? s.buildings.find(b => b.type === 'cottage');
    moveIn(home);
  }
  // the most wanted building: built when we can pay for it, otherwise we save up for it
  const top = want.find(w => !built.includes(w.key) && !(w.role && s.buildings.some(b => b.role === w.role)));
  if (top?.build && top.cost <= s.cash) buildWish(top);
  // small things for everyone (a water pump…) are built right away when we can pay for them
  for (const w of want.filter(w => w.build?.utility && !built.includes(w.key) && w.cost <= s.cash && !s.buildings.some(b => b.type === w.build.type))) {
    const t0 = now, credit = w.by[0], cname = s.citizens[credit]?.name ?? pretty(credit);
    const spot = { x: -88.5, z: 46 };   // on the east bank of the stream, away from the village sign
    s.buildings.push({ id: s.seq++, type: w.build.type, x: spot.x, z: spot.z, ry: -0.4, day: s.day, sign: { icon: w.icon, name: cap(w.name), handle: 'idea: ' + credit }, _at: t0 + 1.3 });
    const sh = shot({ type: 'build', cam: { x: spot.x, y: 2, z: spot.z + 2, dist: 26, pitch: 18, yaw: -14 }, cam2: { x: spot.x, y: 2, z: spot.z + 2, dist: 23, pitch: 16, yaw: -6 },
      actor: w.key === 'pump' ? { x: spot.x + 3.2, z: spot.z + 3.4, ry: -0.6, anim: 'cheer', bucket: true } : undefined,
      panel: { kind: 'price', amount: '−' + money(w.cost), label: cap(w.name), at: 1.35 } },
    [[[`*${cname}* wished for`, `a *${lc(w)}…*`], 2.2], [[w.key === 'pump' ? `No more buckets for *${who}!*` : 'Here it is!'], 1.9]], 0.3);
    tags.push({ x: spot.x, y: 4.5, z: spot.z + 2, text: 'Idea: ' + credit, t0: t0 + 1.9, t1: sh.t1 });
    s.cash -= w.cost; move('cash', t0 + 1.35, s.cash, 0.6);
    built.push(w.key);
  }

  // 8. jobs: whoever asks first gets the job once the building exists
  s.candidates ??= {};
  for (const jb of jobs.filter(x => x.role !== 'leader')) {
    const list = s.candidates[jb.role] ??= [];
    if (!list.some(c => c.author === jb.author)) list.push({ author: jb.author, name: nameOf(jb), nick: jb.nick, day: s.day });
  }
  const jobRoles = [...new Set(jobs.filter(x => x.role !== 'leader').map(x => x.role))];
  for (const role of jobRoles) {
    const r = ROLES[role], list = s.candidates[role], bld = s.buildings.find(b => b.role === role);
    const title = r.chief.en.toLowerCase();
    if (bld && !Object.values(s.citizens).some(c => c.role === role && c.chief)) {
      const c = list[0];
      s.citizens[c.author] = { ...(s.citizens[c.author] ?? {}), role, title: r.chief.en, chief: true, name: c.nick ?? c.name, day: s.day };
      const sh = shot({ type: 'job', cam: { x: bld.x, y: 3, z: bld.z + 4, dist: 40, pitch: 16, yaw: 10 } },
        [[[`*${c.name}* asked first…`], 2.0], [[`…and is our first *${title}!*`], 2.2]], 0.3);
      const p = person({ author: c.author, name: c.name }, bld.x + 3, bld.z + 8, sh.t0 + 1.2, -0.2, r.chief.en);
      tags.push({ x: p.x, y: 3.0, z: p.z, text: c.name, sub: r.chief.en, t0: sh.t0 + 1.4, t1: sh.t1 });
    } else {
      const wishB = want.find(w => w.role === role);
      const nick = list.find(c => c.nick);
      shot({ type: 'job', cam: { x: 8, z: 4, dist: 95, pitch: 40, yaw: 10 }, cam2: { x: 8, z: 4, dist: 88, pitch: 40, yaw: 4 },
        panel: { kind: 'hires', icon: r.icon, title: `WANTS TO BE ${r.chief.en.toUpperCase()}`, rows: list.slice(0, 4).map((c, k) => ({ handle: c.nick ?? c.name, title: k ? 'next in line' : 'asked first', hue: hash(c.author) % 360 })),
          more: Math.max(0, list.length - 4), note: `First the ${r.name.en.toLowerCase()} needs ${money(r.cost)}!` } },
      [[list.length > 1 ? [names(list.slice(0, 2).map(c => c.name)), `both want to be *${title}!*`] : [`*${list[0].name}* wants to be`, `our *${title}!*`], 2.6],
       nick ? [[`${nick.name} even has a title:`, `*${nick.nick}!*`], 2.2] : null,
       [[`Whoever asked first`, `gets the job!`], 2.2]], 0.3);
      void wishB;
    }
  }

  // 8a. job board: the jobs people asked for, plus the principal job waiting for the school
  s.jobBoard ??= {};
  for (const j of jobAsks) if (!s.jobBoard[j.author] || /owner|works/.test(j.job)) s.jobBoard[j.author] = { job: j.job, icon: j.icon, name: s.citizens[j.author]?.name ?? j.name ?? pretty(j.author), day: s.day };
  const boardNew = jobAsks.filter((x, i, a) => a.findIndex(y => y.author === x.author) === i);
  let boardShown = false;
  if (boardNew.length >= 3) {
    const prin = s.candidates?.school?.[0];
    const rows = [...(prin ? [{ handle: prin.nick ?? prin.name, title: 'principal (school)', hue: hash(prin.author) % 360 }] : []),
      ...boardNew.map(j => ({ handle: s.jobBoard[j.author].name, title: s.jobBoard[j.author].job, hue: hash(j.author) % 360 }))].slice(0, 6);
    shot({ type: 'jobs', cam: { x: 8, z: 4, dist: 95, pitch: 40, yaw: 10 }, cam2: { x: 8, z: 4, dist: 88, pitch: 40, yaw: 4 },
      panel: { kind: 'hires', icon: '💼', title: `${town.toUpperCase()} IS HIRING!`, rows, more: Math.max(0, boardNew.length + (prin ? 1 : 0) - 6), note: 'Comment the job you want!' } },
    [[[`${town} is *hiring!*`], 1.8], [['Here are the first', '*jobs* you asked for!'], 2.4],
     [[`*${boardNew[0] && s.jobBoard[boardNew[0].author].name}* wants to be ${/^(owner|works|runs)/.test(s.jobBoard[boardNew[0].author].job) ? '' : 'a '}*${s.jobBoard[boardNew[0].author].job.replace(/^owner of /, 'the owner of ')}…*`], 2.6],
     [['The shops open as soon', 'as we have the *money!*'], 2.4]], 0.3);
    boardShown = true;
  }

  // 8b. campaign promises from people who are waiting for a job
  const promisers = Object.entries(s.candidates).flatMap(([role, list]) => list.map(c => ({ ...c, role })));
  const pr = promises.filter(c => promisers.some(x => x.author === c.author));
  if (pr.length) {
    const c = promisers.find(x => x.author === pr[0].author), who2 = c.nick ?? c.name;
    const clause = t => { const m = t.match(/\bi (?:will|'?ll) (?:also )?(.+?)(?:\s+(?:which|that|when|if)\b.*)?$/i); return m ? m[1].replace(/[.!🎉]+$/u, '').trim() : null; };
    const lines = pr.filter(x => x.author === c.author).map(x => clause(x.text)).filter(Boolean).slice(0, 2);
    shot({ type: 'promise', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: -8 }, actor: { ...door, ry: 0, anim: 'look' },
      panel: { kind: 'greet', items: pr.filter(x => x.author === c.author).slice(0, 2).map(x => ({ author: x.author, text: cleanText(x.text, 70), hue: hash(x.author) % 360 })) } },
    [[[`*${who2}* makes promises!`], 2.0], ...lines.map((l, k) => [[k ? `…and *${l}!*` : `${cap(l.split(' ')[0])} *${l.split(' ').slice(1).join(' ')}!*`], 2.4])], 0.3);
  }

  // 9. an election when people want to lead the town
  const leaders = jobs.filter(x => x.role === 'leader');
  // votes: a comment that names a candidate counts once per person
  let newVotes = 0;
  if (s.election) {
    s.election.voters ??= {};
    for (const c of all) {
      if (s.election.candidates.some(k => k.author === c.author) || s.election.voters[c.author]) continue;
      const pickC = s.election.candidates.find(k => [k.name, pretty(k.author), k.author.slice(1)].some(n => n && n.length > 2 && c.text.toLowerCase().includes(n.toLowerCase())));
      if (pickC) { s.election.voters[c.author] = pickC.author; s.election.votes[pickC.author] = (s.election.votes[pickC.author] ?? 0) + 1; newVotes++; }
    }
  }
  if (prev.election && (leaders.length || newVotes)) {
    const fresh = leaders.filter(l => !s.election.candidates.some(c => c.author === l.author));
    for (const l of fresh) s.election.candidates.push({ author: l.author, name: nameOf(l), word: l.word });
    const cands = s.election.candidates, votes = s.election.votes, total = Object.values(votes).reduce((a, b) => a + b, 0);
    shot({ type: 'election', cam: { x: door.x, y: 3, z: door.z, dist: 30, pitch: 14, yaw: -10 }, cam2: { x: door.x, y: 3, z: door.z, dist: 27, pitch: 13, yaw: -4 },
      actor: { ...door, ry: 0, anim: 'look' },
      panel: { kind: 'hires', icon: '🗳️', title: 'ELECTION: WHO LEADS LEOVILLE?', rows: cands.slice(0, 7).map(c => ({ handle: c.name, title: `${votes[c.author] ?? 0} vote${(votes[c.author] ?? 0) === 1 ? '' : 's'} · ${c.word}`, hue: hash(c.author) % 360 })), note: 'Reply with a name to vote!' } },
    [fresh.length ? [[names(fresh.map(nameOf)), `${fresh.length > 1 ? 'want' : 'wants'} to be *${fresh.length > 1 ? 'president' : fresh[0].word}* too!`], 2.6] : null,
     [[`The election has`, `*${cands.length}* candidates now!`], 2.2],
     ...(() => {
       if (!total) return [[['No votes yet:', 'reply with a *name* to vote!'], 2.6]];
       const ranked = [...cands].sort((a, b) => (votes[b.author] ?? 0) - (votes[a.author] ?? 0)), v0 = votes[ranked[0].author] ?? 0;
       const tied = ranked.filter(c => (votes[c.author] ?? 0) === v0);
       return [[tied.length > 1 ? [names(tied.map(c => c.name)), `have *${v0} vote${v0 === 1 ? '' : 's'}* each!`] : [`*${ranked[0].name}* leads`, `with *${v0} vote${v0 === 1 ? '' : 's'}!*`], 2.6],
         [['Reply with a *name*', 'to vote!'], 2.0]];
     })()], 0.3);
  } else if (leaders.length) {
    s.election ??= { office: 'mayor', candidates: [], votes: {} };
    for (const l of leaders) if (!s.election.candidates.some(c => c.author === l.author)) s.election.candidates.push({ author: l.author, name: nameOf(l), word: l.word });
    const cands = s.election.candidates;
    shot({ type: 'election', cam: { x: door.x, y: 3, z: door.z, dist: 30, pitch: 14, yaw: -10 }, cam2: { x: door.x, y: 3, z: door.z, dist: 27, pitch: 13, yaw: -4 },
      actor: { ...door, ry: 0, anim: 'look' },
      panel: { kind: 'hires', icon: '🗳️', title: 'ELECTION: WHO LEADS LEOVILLE?', rows: cands.slice(0, 4).map(c => ({ handle: pretty(c.author), title: `wants to be ${c.word}`, hue: hash(c.author) % 360 })), note: 'Vote in the comments!' } },
    [[cands.length > 1 ? [`*${pretty(cands[0].author)}* wants to be *${cands[0].word}…*`] : [`*${pretty(cands[0].author)}* wants to be`, `*${cands[0].word}!*`], 2.4],
     cands.length > 1 ? [[`…and *${pretty(cands[1].author)}* wants to be`, `*the ${cands[1].word}!*`], 2.4] : null,
     [['So we hold an', '*election!*'], 2.0]], 0.3);
  }

  // 10. answers to single comments
  // people asking for a home they already have
  for (const m of movers.filter(m => m.special && s.buildings.some(b => b.owner === m.author && b.type === ({ bunker: 'bunker', robothouse: 'robothouse', mansion: 'mansion', plane: 'planehouse', villa: 'villa' })[m.special] && b.day < s.day)))
    if (!replies.some(r => r.kind === 'already')) replies.push({ ...m, kind: 'already' });
  for (const r of replies.filter((x, i, a) => a.findIndex(y => y.kind === x.kind) === i).slice(0, prev.day >= 5 ? 5 : 2)) {
    const rn = r.name ?? s.citizens[r.author]?.name ?? pretty(r.author);
    shot({ type: 'reply', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: 8 }, actor: { ...door, ry: 0, anim: 'look' },
      panel: { kind: 'greet', items: [{ author: r.author, text: cleanText(r.text, 64), hue: hash(r.author) % 360 }] } },
    r.kind === 'king' ? [[[`A revolution, *${rn}?*`], 1.8], [[`Leoville has no king…`, '*yet!*'], 2.2]]
      : r.kind === 'donate' ? [[[`${r.amount ? `*€${r.amount.replace(/\s/g, '')}*` : 'A donation'}, *${rn}?*`, '*Nice try!*'], 2.0], [['Only subs, likes and comments', 'pay into the *budget!*'], 2.6]]
      : r.kind === 'storm' ? [[[`A *${r.what}*, ${rn}?!`], 1.8], [[`${who} says: *not in`, `${town}!*`], 2.0]]
      : r.kind === 'joke' ? [[[`Joke of the day`, `by *${rn}:*`], 1.8], [[`"${cleanText(r.text, 60).replace(/\?*$/, '?')}"`], 2.6], [['…we are still waiting', 'for the *punchline!*'], 2.2]]
      : r.kind === 'mentioned' ? [[[`*${rn}*: first time`, 'in a video?'], 2.0], [[`Welcome to *${town}* TV!`], 2.0]]
      : r.kind === 'already' ? [[[`*${rn}*, you already`, `*have* a ${({ bunker: 'bunker', robothouse: 'robot house', mansion: 'mansion', plane: 'plane house', villa: 'villa' })[r.special]}!`], 2.4]]
      : r.kind === 'gta' ? [[['Made before *GTA 6?*'], 1.8], [[`Yes! *${town}* came first!`], 2.2]]
      : r.kind === 'jobs' ? [[[`"We want jobs!"`, `says *${rn}…*`], 2.0], namedShops[0] ? [[`*${namedShops[0].name ?? s.citizens[namedShops[0].author]?.name ?? pretty(namedShops[0].author)}* has an idea:`, `a shop called *${namedShops[0].shop}!*`], 2.6] : [['The first jobs come', 'with the *school!*'], 2.2]]
      : [[[/d ?bucks/i.test(r.text) ? `"D bucks", *${rn}?*` : `Dollars, *${rn}?*`], 1.6], [['Sorry, Leoville pays', 'in *euros!*'], 2.2]], 0.3);
  }
  // 10a. new titles people asked for
  const tl = titles.filter((x, i, a) => a.findIndex(y => y.author === x.author) === i).slice(0, 2);
  if (tl.length) {
    const tn = t => s.citizens[t.author]?.name ?? t.name ?? pretty(t.author);
    tl.forEach(t => { if (s.citizens[t.author]) s.citizens[t.author].nick = t.title; });
    shot({ type: 'titles', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: -6 }, actor: { ...door, ry: 0, anim: 'cheer' },
      panel: { kind: 'greet', items: tl.map(t => ({ author: t.author, text: cleanText(t.text, 64), hue: hash(t.author) % 360 })) } },
    tl.map((t, k) => [k ? [`And *${tn(t)}* is`, `*"the ${t.title}"!*`] : t.town ? [`*${tn(t)}* is now the town's`, `official *${t.title}!*`] : [`*${tn(t)}* is now`, `*"the ${t.title}"!*`], 2.6]), 0.3);
  }
  // 10a2. a quiet place to remember someone
  for (const mm of memorial.slice(0, 1)) {
    const mn = s.citizens[mm.author]?.name ?? mm.name ?? pretty(mm.author), spot = { x: H.x - 13, z: H.z + 6.2 };
    s.buildings.push({ id: s.seq++, type: 'memorial', x: spot.x, z: spot.z, day: s.day, sign: { icon: '🌷', name: 'In loving memory', handle: `${poss(mn)} grandparents` }, _at: now + 1.0 });
    shot({ type: 'memorial', cam: { x: spot.x, y: 1.0, z: spot.z + 0.5, dist: 15, pitch: 16, yaw: -10 }, cam2: { x: spot.x, y: 1.0, z: spot.z + 0.5, dist: 13.5, pitch: 15, yaw: -2 } },
    [[[`*${poss(mn)}* grandparents`, 'passed away…'], 2.4], [['So we placed a bench', 'and flowers in their *memory.*'], 3.0]], 0.6);
  }

  // 10b. a home owner who feels lonely asks for a roommate
  for (const l of lonely.filter((x, i, a) => a.findIndex(y => y.author === x.author) === i).slice(0, 1)) {
    const home = [...s.buildings].reverse().find(b => b.owner === l.author);
    if (!home) continue;
    const ln = s.citizens[l.author]?.name ?? nameOf(l), kind = home.type === 'robothouse' ? 'robot house' : home.type === 'planehouse' ? 'plane house' : home.type === 'bunker' ? 'bunker' : 'house';
    shot({ type: 'lonely', cam: { x: home.x + 1.8, y: home.type === 'robothouse' ? 7.5 : 3.5, z: home.z + 4, dist: home.type === 'robothouse' ? 60 : 38, pitch: 14, yaw: 12 },
      cam2: { x: home.x + 1.8, y: home.type === 'robothouse' ? 7.5 : 3.5, z: home.z + 4, dist: home.type === 'robothouse' ? 55 : 35, pitch: 13, yaw: 4 },
      panel: { kind: 'greet', items: [{ author: l.author, text: cleanText(l.text, 64), hue: hash(l.author) % 360 }] } },
    [[[`*${ln}* is lonely`, `in the *${kind}…*`], 2.2], [['Who wants to', `move in with *${ln}?*`], 2.4]], 0.3);
    s.roommateWanted = l.author;
  }

  for (const k of built) merged.delete(k);
  s.wishes = Object.fromEntries([...merged.entries()].map(([k, e]) => [k, { votes: e.votes, by: e.by, label: e.label ?? want.find(w => w.key === k)?.name, ...(e.icon ? { icon: e.icon } : {}), first: e.first }]));
  const open = want.filter(w => !built.includes(w.key) && !(w.role && s.buildings.some(b => b.role === w.role)));
  if (open.length) {
    const top = open.slice(0, 6);
    shot({ type: 'votes', cam: { x: 8, z: 0, dist: 150, pitch: 52, yaw: -8 }, cam2: { x: 8, z: 0, dist: 138, pitch: 54, yaw: -2 },
      panel: { kind: 'votes', title: 'YOUR WISHES', rows: top.map(w => ({ icon: w.icon, name: cap(w.name), votes: w.votes })) } },
    [[['And what do you', 'want *next?*'], 2.0],
     [top[1] && top[1].votes === top[0].votes ? [`*${cap(lc(top[0]))}* and *${lc(top[1])}*`, 'are *tied!*'] : [`The *${lc(top[0])}* is in the lead!`], 2.4]]);
    const goal = open.find(w => w.cost > s.cash && w.build) ?? open[0];
    const fam = family.find(f => WISHES[goal.key]?.kw.test(f.text));
    shot({ type: 'goal', cam: { x: 0, z: 10, dist: 260, pitch: 58, yaw: 0 }, cam2: { x: 0, z: 10, dist: 240, pitch: 58, yaw: 0 },
      panel: { kind: 'goal', title: s.saveFor === goal.key ? `${goal.name.toUpperCase()} FUND` : `NEXT: ${goal.name.toUpperCase()}`, cur: s.saveFor === goal.key ? s.fund : s.cash, target: goal.cost, money: true, unit: '' } },
    [[[`The ${lc(goal)} costs`, `*${money(goal.cost)}.*`], 2.4],
     s.saveFor === goal.key ? [[`The ${lc(goal)} fund`, `already has *${money(s.fund)}!*`], 2.2] : null,
     fam ? [[`*${nameOf(fam)}*'s ${fam.who}`, 'is waiting for it!'], 2.2] : null,
     montage && !s.saveFor && prev.goal?.key === goal.key && s.cash < prev.cash ? [['Today we spent a lot', 'on *your homes…*'], 2.2] : null,
     [['Keep subscribing,', 'and we can *build it!*'], 2.4]]);
    s.goal = { key: goal.key, cost: goal.cost };
  }

  // 11. outro: Leo and his roommates wave
  const role = s.goal?.key && WISHES[s.goal.key]?.role ? ROLES[WISHES[s.goal.key].role].chief.en.toLowerCase() : null;
  const ask = boardShown ? ['Which *job*', 'do you want?'] : leaders.length ? ['Who should lead', `*${town}?*`] : role && !(s.candidates?.[WISHES[s.goal.key].role]?.length) ? ['Who wants to be', `the first *${role}?*`] : ['What should we', '*build next?*'];
  shot({ type: 'outro', cam: { x: door.x - 0.9, y: 2.2, z: door.z + 0.8, dist: 25, pitch: 10, yaw: 6 }, cam2: { x: door.x - 0.9, y: 2.2, z: door.z + 0.8, dist: 23, pitch: 9, yaw: 0 },
    actor: { ...door, ry: 0, anim: 'wave' } },
  [[ask, 2.4], [[leaders.length && !boardShown ? 'Vote in the' : 'Tell me in the', '*comments!*'], 2.4]], 0.6);

  // unnamed newcomers: everyone without a bed waits in the tent camp for now
  const ep = {
    version: 1, day: s.day, city: town, lang: 'en', locale: 'en-US', mayor: who,
    hud: { cash: 'BUDGET', residents: 'RESIDENTS', day: 'DAY', housing: 'HOMES', full: 'full', tents: 'sleeping in tents', free: 'free' },
    duration: +now.toFixed(2), shots, tracks, tags, cars: false,
    people: [...oldPeople.map(p => ({ ...p, at: null })), ...people],
    buildings: s.buildings.map(({ _at, ...b }) => ({ ...b, at: _at ?? null })),
    tiles: prev.tiles.map(t => ({ ...t, at: null })).concat(newTiles),
    island: { R, pts: islandPts(R) }, river: riverPath(R), tentField: { x: -32, z: 30 }, townhall: H,
    clear: [{ x: -32, z: 30, r: 26 }, { x: 15, z: 6, r: 80 }, { x: -88.5, z: 46, r: 13 }, ...s.buildings.filter(b => b.type === 'cabin' && b.i == null && b.day >= 6).map(b => ({ x: b.x, z: b.z, r: 13 }))],
    // the forest steps back as the town grows
    cityBox: { x0: Math.min(-88, ...s.buildings.filter(b => b.i != null).map(b => b.x - 18)), x1: Math.max(75, ...s.buildings.filter(b => b.i != null).map(b => b.x + 18)), z0: -16, z1: 24 },
    residentsHome: Object.values(s.citizens).filter(c => c.day <= s.day).length,
    summary: { before, after, gained, income, cash: s.cash, housing: s.housing, built: s.buildings.filter(b => b.day === s.day).length, queue: 0,
      roommates: mates.map(m => m.author), ownHouses: own.map(m => m.author), wishes: want.map(w => `${w.name} ${w.votes}`), jobs: jobs.map(j => `${j.author}:${j.role}`), election: s.election?.candidates.map(c => c.author) },
  };
  for (const b of s.buildings) delete b._at;
  s.people = [...oldPeople, ...people.map(({ at, ...p }) => p)];
  return { state: s, episode: ep };
}
