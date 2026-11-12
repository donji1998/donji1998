// The city simulation. Pure function: (yesterday's state, today's YouTube
// numbers) -> (today's state, an episode script the 3D player can render).
import { ROLES, HOUSING, HOUSING_NAMES, LANDMARKS, GOALS } from './roles.mjs';
import { classify, votesIn, cleanText, cleanHandle, isBlocked } from './comments.mjs';

// ---------- layout ----------
// Lots sit in east-west rows that all face south (towards the camera), with a
// street in front of every row and a cross street after every 4 lots.
// Housing fills rows to the north, shops and institutions rows to the south,
// so the skyline rises behind the high street instead of hiding it.
const LOT_W = 15, GROUP = 4, GAP = 9, ROW = 24, COLS = 12;
export const lotX = i => i * LOT_W + Math.floor(i / GROUP) * GAP + LOT_W / 2;
export const lotZ = j => j * ROW;
const colOrder = n => (n % 2 ? 2 + (n - 1) / 2 : 1 - n / 2); // 1,2,0,3,-1,4,...
const TOWNHALL = { x: 30, z: 0 };
const RESERVED = new Set(['1,0', '2,0']); // town hall plot

function nthLot(zone, n) {
  for (let k = 0, seen = -1; ; k++) {
    // homes fill each row west to east, so a day's new blocks stand together in one shot
    const i = zone === 'res' ? (k % COLS) - 4 : colOrder(k % COLS), row = Math.floor(k / COLS);
    const j = zone === 'res' ? -1 - row : row;
    if (RESERVED.has(i + ',' + j)) continue;
    if (++seen === n) return { i, j };
  }
}

function roadTiles(i, j) {
  const t = [{ k: `h${i},${j}`, x: lotX(i), z: lotZ(j) + 12, w: LOT_W, d: 8, lane: true }];
  const g = Math.floor(i / GROUP), m = ((i % GROUP) + GROUP) % GROUP;
  const gap = gg => ({ k: `v${gg},${j}`, x: gg * 69 + 64.5, z: lotZ(j) + 4, w: GAP, d: ROW });
  if (m === GROUP - 1) t.push(gap(g));
  if (m === 0) t.push(gap(g - 1));
  return t;
}

const islandRadius = (R, a) => R * (1 + 0.07 * Math.sin(3 * a + 1) + 0.045 * Math.sin(5 * a + 2));

// ---------- text ----------
const L = {
  en: {
    locale: 'en-US',
    money: n => '€' + n.toLocaleString('en-US'),
    big: n => n >= 1e6 ? `€${(n / 1e6).toFixed(1)} million` : '€' + n.toLocaleString('en-US'),
    hud: { cash: 'BUDGET', residents: 'RESIDENTS', day: 'DAY', housing: 'HOMES', full: 'full', tents: 'sleeping in tents', free: 'free' },
    intro: (d, city) => [`Day *${d}* in`, `*${city}!*`],
    introSub: 'What did your comments build today?',
    yesterday: n => `Yesterday: *${n}* residents.`,
    today: n => `And today? *${n}!*`,
    lost: n => `*${n}* people moved away…`,
    same: 'Nobody new moved in today.',
    subs: 'SUBSCRIBERS', y: 'YESTERDAY', t: 'TODAY',
    rowSubs: n => `${n} new subs`, rowLikes: n => `${n} likes`, rowComments: n => `${n} comments`,
    income: m => [`That puts *${m}*`, 'into the city budget!'],
    tents: n => [`But *${n}* of them`, 'sleep in *tents!*'],
    build: list => ['So we build', ...list],
    stillTents: n => `*${n}* still need a home.`,
    homesFor: n => `Homes for ${n}`,
    and: 'and', more: n => `+ *${n}* more!`,
    asks: h => `*${h}* asks:`,
    opened: (h, name) => [`Done! *${name}*`, `by *${h}* is open!`],
    founded: (h, name, title) => [`${name} built!`, `*${h}* is our *${title}!*`],
    hiresTitle: name => `New at the ${name}`,
    hires: (n, name) => [`*${n}* new ${n === 1 ? 'hire' : 'hires'}`, `at the *${name}!*`],
    wanted: n => `${n} more ${n === 1 ? 'helper' : 'helpers'} wanted!`,
    waiting: n => `${n} on the waiting list`,
    goalTitle: (a, b) => `${a} or ${b}`,
    goal: (n, a, b) => [`At *${n}* residents you get a`, a === b ? `*${a}!*` : `*${a}* or *${b}?*`],
    goalVote: 'You vote in the comments!',
    goalOf: 'residents',
    landmark: name => ['Milestone reached!', `You voted: the *${name}!*`],
    outro: city => ['Want a job in', `*${city}?*`],
    outro2: ['Tell me in the', '*comments!*'],
    mayorSays: 'Subscribe = move in!',
    cta: ['"Can I be the police chief?"', '"I want to open a bakery!"', '"Make me a teacher"', '"I vote for the harbor!"'],
  },
  de: {
    locale: 'de-DE',
    money: n => n.toLocaleString('de-DE') + ' €',
    big: n => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Millionen €` : n.toLocaleString('de-DE') + ' €',
    hud: { cash: 'KASSE', residents: 'EINWOHNER', day: 'TAG', housing: 'WOHNPLÄTZE', full: 'voll', tents: 'schlafen im Zelt', free: 'frei' },
    intro: (d, city) => [`Tag *${d}* in`, `*${city}!*`],
    introSub: 'Was haben eure Kommentare heute gebaut?',
    yesterday: n => `Gestern: *${n}* Einwohner.`,
    today: n => `Und heute? *${n}!*`,
    lost: n => `*${n}* sind weggezogen…`,
    same: 'Heute ist niemand neu eingezogen.',
    subs: 'ABONNENTEN', y: 'GESTERN', t: 'HEUTE',
    rowSubs: n => `${n} neue Abos`, rowLikes: n => `${n} Likes`, rowComments: n => `${n} Kommentare`,
    income: m => [`Das bringt *${m}*`, 'in die Stadtkasse!'],
    tents: n => [`Aber *${n}* von ihnen`, 'schlafen im *Zelt!*'],
    build: list => ['Also bauen wir', ...list],
    stillTents: n => `*${n}* suchen noch ein Zuhause.`,
    homesFor: n => `Wohnraum für ${n}`,
    and: 'und', more: n => `+ *${n}* weitere!`,
    asks: h => `*${h}* fragt:`,
    opened: (h, name) => [`Erledigt! *${name}*`, `von *${h}* ist eröffnet!`],
    founded: (h, name, title) => [`${name} gebaut!`, `*${h}* ist *${title}!*`],
    hiresTitle: name => `Neu im Team: ${name}`,
    hires: (n, name) => [`*${n}* neue Leute`, `für: *${name}!*`],
    wanted: n => `Noch ${n} Helfer gesucht!`,
    waiting: n => `${n} auf der Warteliste`,
    goalTitle: (a, b) => `${a} oder ${b}`,
    goal: (n, a, b) => [`Bei *${n}* Einwohnern gibt es`, a === b ? `*${a}!*` : `*${a}* oder *${b}?*`],
    goalVote: 'Ihr entscheidet in den Kommentaren!',
    goalOf: 'Einwohner',
    landmark: name => ['Ziel erreicht!', `Ihr habt gewählt: *${name}!*`],
    outro: city => ['Du willst einen Job in', `*${city}?*`],
    outro2: ['Schreib es in die', '*Kommentare!*'],
    mayorSays: 'Abo = Einzug!',
    cta: ['„Kann ich Polizeichef werden?"', '„Ich will eine Bäckerei eröffnen!"', '„Mach mich zum Lehrer"', '„Ich bin für den Hafen!"'],
  },
};

// ---------- state ----------
export function initialState(cfg) {
  return {
    day: 0, cash: cfg.startCash ?? 15000, residents: 0, housing: 0,
    next: { res: 0, com: 0 }, seq: 1,
    buildings: [{ id: 0, type: 'townhall', x: TOWNHALL.x, z: TOWNHALL.z, day: 0 }],
    citizens: {}, queue: [], votes: {}, goalsDone: 0, videos: {},
  };
}

const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function runDay(prev, input, cfg) {
  const lang = L[cfg.lang] ? cfg.lang : 'en', T = L[lang];
  const fmt = n => n.toLocaleString(T.locale);
  const eco = { perSubscriber: 1000, perLike: 1, perComment: 2, ...cfg.economy };
  const s = structuredClone(prev);
  s.day += 1;

  // ----- timeline helpers -----
  const shots = [], tracks = { cash: [[0, s.cash]], residents: [[0, s.residents]], housing: [[0, s.housing]] };
  const tags = [], newTiles = [];
  let now = 0;
  const shot = (dur, o) => {
    const sh = { t0: now, t1: now + dur, ...o };
    const caps = (o.captions ?? []).filter(Boolean);
    const lead = 0.15, per = (dur - lead) / Math.max(1, caps.length);
    sh.captions = caps.map((c, k) => ({ lines: [].concat(c), t0: now + lead + k * per, t1: now + lead + (k + 1) * per }));
    shots.push(sh); now += dur; return sh;
  };
  const move = (name, at, to, dur = 0.9) => {
    const tr = tracks[name], last = tr[tr.length - 1][1];
    tr.push([at, last], [at + dur, to]);
  };
  const knownTiles = new Set();
  for (const b of s.buildings) if (b.i != null) for (const t of roadTiles(b.i, b.j)) knownTiles.add(t.k);
  const baseTiles = [];
  for (const b of s.buildings) if (b.i != null) for (const t of roadTiles(b.i, b.j)) if (!baseTiles.some(x => x.k === t.k)) baseTiles.push(t);
  // the town hall plot always has its street
  for (const i of [1, 2]) for (const t of roadTiles(i, 0)) if (!knownTiles.has(t.k)) { knownTiles.add(t.k); baseTiles.push(t); }

  const place = (zone, rec, at) => {
    const { i, j } = nthLot(zone, s.next[zone]++);
    const b = { id: s.seq++, i, j, x: lotX(i), z: lotZ(j), day: s.day, seed: hash(s.seq + ':' + i + ':' + j) % 1000, ...rec };
    s.buildings.push(b);
    b._at = at;
    for (const t of roadTiles(i, j)) if (!knownTiles.has(t.k)) { knownTiles.add(t.k); newTiles.push({ ...t, at: at - 0.25 }); }
    return b;
  };

  // ----- 1. numbers -----
  const before = s.residents;
  const after = Math.max(0, Math.round(input.subscribers ?? before));
  const gained = after - before;
  const vid = input.video ?? {};
  const seen = s.videos[vid.id] ?? { likes: 0, comments: 0 };
  const likes = Math.max(0, (vid.likes ?? 0) - seen.likes);
  const commentCount = Math.max(0, (vid.commentCount ?? (input.comments?.length ?? 0)) - seen.comments);
  if (vid.id) s.videos[vid.id] = { likes: vid.likes ?? 0, comments: vid.commentCount ?? 0 };
  const rows = [
    { icon: '👤', label: T.rowSubs(fmt(Math.max(0, gained))), amount: Math.max(0, gained) * eco.perSubscriber },
    { icon: '❤️', label: T.rowLikes(fmt(likes)), amount: likes * eco.perLike },
    { icon: '💬', label: T.rowComments(fmt(commentCount)), amount: commentCount * eco.perComment },
  ];
  const income = rows.reduce((a, r) => a + r.amount, 0);

  // extents so far (for the opening shots)
  const ext = () => {
    const xs = s.buildings.filter(b => b.i != null).map(b => b.x).concat(TOWNHALL.x - 30, TOWNHALL.x + 30);
    const zs = s.buildings.filter(b => b.i != null).map(b => b.z).concat(-24, 24);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  };

  // ----- shot: intro (camera filled in at the end, once the island size is known) -----
  const intro = shot(3.4, { type: 'intro', captions: [T.intro(s.day, cfg.cityName)], ring: true });

  // ----- shot: subscribers -----
  const street = { x: TOWNHALL.x, z: 12 };
  const fol = shot(4.6, {
    type: 'followers', cam: { x: street.x, z: street.z - 20, dist: 165, pitch: 40, yaw: -14 },
    captions: [T.yesterday(fmt(before)), gained > 0 ? T.today(fmt(after)) : gained < 0 ? T.lost(fmt(-gained)) : T.same],
    panel: { kind: 'followers', title: T.subs, y: T.y, t: T.t, from: before, to: after, c0: 2.1, c1: 3.3 },
  });
  move('residents', fol.t0 + 2.1, after, 1.2);
  s.residents = after;

  // ----- shot: income -----
  if (income > 0) {
    const inc = shot(4.4, {
      type: 'income', cam: { x: street.x + 14, z: street.z - 2, dist: 135, pitch: 46, yaw: 12 },
      captions: [T.income(T.big(income))],
      panel: { kind: 'income', rows: rows.map(r => ({ ...r, amount: '+' + T.money(r.amount) })) },
    });
    s.cash += income;
    move('cash', inc.t0 + 1.5, s.cash, 1.4);
  }

  // ----- housing -----
  let homeless = Math.max(0, s.residents - s.housing);
  const tentField = { x: 205, z: -6 };
  if (homeless > 0) {
    shot(2.8, {
      type: 'tents', cam: { x: tentField.x, z: tentField.z + 4, dist: 190, pitch: 44, yaw: 10 },
      captions: [T.tents(fmt(homeless))],
    });
    let budget = Math.floor(s.cash * 0.7);
    const plan = [];
    while (homeless > 0 && plan.length < (cfg.maxHousingPerDay ?? 12)) {
      const ok = HOUSING.filter(h => h.cost <= budget);
      if (!ok.length) break;
      const h = ok.find(h => h.cap <= homeless * 1.25) ?? ok[ok.length - 1];
      plan.push(h); budget -= h.cost; homeless -= h.cap;
    }
    if (plan.length) {
      const t0 = now, built = [];
      plan.forEach((h, k) => built.push(place('res', { type: h.type, cap: h.cap }, t0 + 1.0 + k * (2.4 / plan.length))));
      const cost = plan.reduce((a, h) => a + h.cost, 0), cap = plan.reduce((a, h) => a + h.cap, 0);
      const counts = {};
      for (const h of plan) counts[h.type] = (counts[h.type] ?? 0) + 1;
      const parts = HOUSING.filter(h => counts[h.type]).map(h => `*${counts[h.type]} ${HOUSING_NAMES[lang][h.type][counts[h.type] > 1 ? 1 : 0]}*`);
      const rest = plan.length - HOUSING.filter(h => counts[h.type]).slice(0, 2).reduce((a, h) => a + counts[h.type], 0);
      const list = parts.length === 1 ? [parts[0] + '!'] : [parts[0], `${T.and} ${parts[1]}${rest ? '' : '!'}`].concat(rest ? [T.more(rest)] : []);
      const bx = built.map(b => b.x), bz = built.map(b => b.z);
      const cx = (Math.min(...bx) + Math.max(...bx)) / 2, cz = (Math.min(...bz) + Math.max(...bz)) / 2;
      const span = Math.max(...bx) - Math.min(...bx) + (Math.max(...bz) - Math.min(...bz)) * 0.6;
      const tall = plan.some(h => h.type === 'mega' || h.type === 'arco') ? 90 : plan.some(h => h.type === 'tower') ? 40 : 0;
      homeless = Math.max(0, homeless);
      shot(5.2, {
        type: 'housing', cam: { x: cx, z: cz + 4, y: tall * 0.3, dist: Math.min(520, 150 + span * 1.9 + tall * 1.6), pitch: 36, yaw: span > 60 ? -30 : -16 },
        captions: [T.build(list), homeless > 0 ? T.stillTents(fmt(homeless)) : null],
        panel: { kind: 'price', amount: '−' + T.money(cost), label: T.homesFor(fmt(cap)), at: 1.2 },
      });
      s.cash -= cost; s.housing += cap;
      move('cash', t0 + 1.0, s.cash, 2.4);
      move('housing', t0 + 1.0, s.housing, 2.4);
    }
  }

  // ----- comments -----
  const comments = (input.comments ?? [])
    .map(c => ({ author: cleanHandle(c.author), text: cleanText(c.text), likes: c.likes ?? 0 }))
    .filter(c => c.text && !isBlocked(c, cfg.blocklist));
  const goal = GOALS[s.goalsDone];
  if (goal) {
    const v = s.votes[s.goalsDone] ??= Object.fromEntries(goal.options.map(o => [o, 0]));
    for (const c of comments) for (const o of votesIn(c.text, goal.options)) v[o] += 1;
  }
  const requests = [...s.queue];
  for (const c of [...comments].sort((a, b) => b.likes - a.likes)) {
    const r = classify(c.text);
    if (r && !requests.some(q => q.author === c.author)) requests.push({ ...c, ...r });
  }
  s.queue = [];
  const hires = {}; let builds = 0;
  const maxBuilds = cfg.maxCommentBuildsPerDay ?? 4;
  for (const rq of requests) {
    if (s.citizens[rq.author]) continue; // one job per person
    const role = rq.role === 'custom'
      ? { kind: 'shop', icon: '🏪', color: ['#d6584a', '#3f8fd0', '#46a36a', '#c9589f', '#e09a2e'][hash(rq.label) % 5], cost: 28000, name: { [lang]: rq.label }, chief: ROLES.kebab.chief }
      : ROLES[rq.role];
    const existing = role.kind === 'civic' && s.buildings.find(b => b.role === rq.role);
    if (existing) {
      const staff = Object.values(s.citizens).filter(c => c.buildingId === existing.id && !c.chief).length;
      if (staff < role.slots) {
        s.citizens[rq.author] = { role: rq.role, title: role.staff[lang], buildingId: existing.id, day: s.day };
        (hires[existing.id] ??= []).push(rq.author);
      }
      continue;
    }
    if (builds >= maxBuilds || role.cost > s.cash) {
      if (s.queue.length < 40) s.queue.push({ author: rq.author, text: rq.text, likes: rq.likes, role: rq.role, label: rq.label });
      continue;
    }
    builds++;
    const t0 = now, name = role.name[lang] ?? role.name.en, title = role.chief[lang];
    const b = place('com', {
      type: role.kind, role: rq.role, name, owner: rq.author,
      style: { color: role.color, feature: role.feature ?? null },
      sign: { icon: role.icon, name, handle: rq.author },
    }, t0 + 2.3);
    s.citizens[rq.author] = { role: rq.role, title, buildingId: b.id, chief: true, day: s.day };
    const civic = role.kind === 'civic';
    shot(5.0, {
      type: 'comment', cam: { x: b.x, z: b.z - 9, dist: civic ? 118 : 100, pitch: 36, yaw: builds % 2 ? 16 : -16 },
      captions: [T.asks(rq.author), civic ? T.founded(rq.author, name, title) : T.opened(rq.author, name)],
      panel: { kind: 'comment', author: rq.author, text: rq.text, likes: rq.likes, hue: hash(rq.author) % 360,
        price: '−' + T.money(role.cost), label: name, at: 2.3 },
    });
    tags.push({ x: b.x, y: civic ? 14 : 10, z: b.z, text: rq.author, sub: title, t0: t0 + 3.6, t1: now });
    s.cash -= role.cost;
    move('cash', t0 + 2.3, s.cash, 0.8);
  }

  // ----- hires -----
  const hired = Object.entries(hires).sort((a, b) => b[1].length - a[1].length)[0];
  if (hired) {
    const b = s.buildings.find(x => x.id === +hired[0]), role = ROLES[b.role];
    const staff = Object.values(s.citizens).filter(c => c.buildingId === b.id && !c.chief).length;
    const open = role.slots - staff;
    shot(4.0, {
      type: 'hires', cam: { x: b.x, z: b.z - 16, dist: 118, pitch: 38, yaw: -12 },
      captions: [T.hires(hired[1].length, b.name)],
      panel: { kind: 'hires', icon: role.icon, title: T.hiresTitle(b.name),
        rows: hired[1].slice(0, 4).map(h => ({ handle: h, title: role.staff[lang], hue: hash(h) % 360 })),
        more: Math.max(0, hired[1].length - 4), note: open > 0 ? T.wanted(open) : null },
    });
  }

  // ----- island + landmark sites -----
  const e = ext();
  const R = Math.max(290, Math.max(Math.abs(e.z0), Math.abs(e.z1)) + 235);
  const coastS = islandRadius(R, Math.PI / 2);
  const sites = {
    stadium: { x: -150, z: -30 }, funfair: { x: -150, z: 80 },
    airport: { x: 150, z: 125 }, harbor: { x: 40, z: coastS - 6 },
  };

  // ----- milestone -----
  if (goal && s.residents >= goal.target) {
    const v = s.votes[s.goalsDone];
    const pool = goal.options.filter(o => !s.buildings.some(b => b.type === o));
    const win = pool.sort((a, b) => v[b] - v[a])[0];
    if (win) {
      const site = sites[win];
      s.buildings.push({ id: s.seq++, type: win, x: site.x, z: site.z, day: s.day, _at: now + 1.4 });
      shot(5.0, {
        type: 'landmark', cam: { x: site.x, z: site.z, dist: win === 'airport' ? 330 : 250, pitch: 40, yaw: 18 },
        captions: [T.landmark(LANDMARKS[win].name[lang])],
      });
    }
    s.goalsDone += 1;
  }

  // ----- next goal -----
  const next = GOALS[s.goalsDone];
  const cityCenter = { x: TOWNHALL.x, z: (e.z0 + e.z1) / 2 };
  const overview = { x: 0, z: R * 0.06, dist: R * 3.7, pitch: 62, yaw: 0 };
  intro.cam = { ...overview };
  intro.ring = { x: cityCenter.x, z: cityCenter.z, r: Math.max(70, (e.z1 - e.z0) / 2 + 50) };
  if (next) {
    const opts = next.options.filter(o => !s.buildings.some(b => b.type === o));
    const v = s.votes[s.goalsDone] ??= Object.fromEntries(next.options.map(o => [o, 0]));
    if (opts.length) {
      const nm = opts.map(o => LANDMARKS[o].name[lang]);
      shot(5.0, {
        type: 'goal', cam: { x: cityCenter.x, z: cityCenter.z - 30, dist: R * 2.2, pitch: 56, yaw: -8 },
        captions: opts.length > 1 ? [T.goal(fmt(next.target), nm[0], nm[1]), T.goalVote] : [T.goal(fmt(next.target), nm[0], nm[0])],
        panel: { kind: 'goal', title: opts.length > 1 ? T.goalTitle(nm[0], nm[1]) : nm[0], cur: s.residents, target: next.target, unit: T.goalOf,
          options: opts.map(o => ({ icon: LANDMARKS[o].icon, name: LANDMARKS[o].name[lang], votes: v[o] })) },
      });
    }
  }

  // ----- outro -----
  const out = shot(4.6, {
    type: 'outro', cam: { x: TOWNHALL.x, z: TOWNHALL.z + 5, y: 5.6, dist: 66, pitch: 20, yaw: 10 },
    captions: [T.outro(cfg.cityName), T.outro2],
    panel: { kind: 'cta', lines: T.cta.slice(0, 3) },
  });
  tags.push({ x: TOWNHALL.x, y: 8.3, z: TOWNHALL.z + 6.9, text: cfg.mayorName, sub: s.queue.length ? T.waiting(s.queue.length) : T.mayorSays, t0: out.t0 + 0.5, t1: out.t1, mayor: true });

  // ----- assemble -----
  const island = { R, pts: [] };
  for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2, r = islandRadius(R, a); island.pts.push([+(Math.cos(a) * r).toFixed(1), +(Math.sin(a) * r).toFixed(1)]); }
  const streets = {};
  for (const b of s.buildings) if (b.i != null) { const r = streets[b.j] ??= { j: b.j, z: lotZ(b.j) + 12, x0: b.x, x1: b.x }; r.x0 = Math.min(r.x0, b.x - 7); r.x1 = Math.max(r.x1, b.x + 7); }
  (streets[0] ??= { j: 0, z: 12, x0: 15, x1: 45 });
  const maxHomeless = Math.max(1, ...tracks.residents.map(([t, r]) => r)) ;
  const episode = {
    version: 1, day: s.day, city: cfg.cityName, lang, locale: T.locale, hud: T.hud, mayor: cfg.mayorName,
    duration: +now.toFixed(2), shots, tracks, tags,
    buildings: s.buildings.map(({ _at, ...b }) => ({ ...b, at: _at ?? null })),
    tiles: baseTiles.map(t => ({ ...t, at: null })).concat(newTiles),
    streets: Object.values(streets), island, tentField, townhall: TOWNHALL,
    clear: [{ x: tentField.x, z: tentField.z, r: 60 }, ...Object.values(sites).map(p => ({ ...p, r: 75 }))],
    cityBox: { x0: lotX(-4) - 30, x1: lotX(7) + 30, z0: e.z0 - 40, z1: e.z1 + 45 },
    peakResidents: maxHomeless,
    summary: { before, after, gained, income, cash: s.cash, housing: s.housing, built: s.buildings.filter(b => b.day === s.day).length, queue: s.queue.length },
  };
  for (const b of s.buildings) delete b._at;
  return { state: s, episode };
}

/** Plain-text voice-over script + SRT, straight from the captions. */
export function scripts(episode) {
  const strip = s => s.replace(/\*/g, '');
  const ts = t => { const ms = Math.round(t * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const caps = episode.shots.flatMap(s => s.captions);
  return {
    txt: caps.map(c => strip(c.lines.join(' '))).join('\n') + '\n',
    srt: caps.map((c, k) => `${k + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${strip(c.lines.join('\n'))}\n`).join('\n'),
  };
}
