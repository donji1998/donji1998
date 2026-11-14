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
  farm: { kw: /\bfarm|bauernhof|food/i, role: 'farm' },
  fire: { kw: /fire\s?(station|fighter|dep)|feuerwehr/i, role: 'fire' },
  pool: { kw: /\bpool\b|swimming|schwimmbad/i, icon: '🏊', name: 'pool', cost: 25000 },
  dock: { kw: /\bdocks?\b|\bpier\b|jetty|\bboats?\b/i, icon: '⚓', name: 'dock', cost: 15000 },
  van: { kw: /\bvan\b|\bcar\b|\bbus\b/i, icon: '🚐', name: 'van', cost: 8000 },
  robots: { kw: /robot/i, icon: '🤖', name: 'robots', cost: 50000 },
};
for (const [k, r] of Object.entries(ROLES)) if (r.kind === 'shop' && !WISHES[k]) WISHES[k] = { kw: new RegExp(r.kw, 'i'), role: k };

const MOVE = /add me|at me in|move in|moving in|in your house|in the room|live (with|here)|my name is|call me|i sub|subscribed|i am subscribe|go on the island|let me (live|stay)/i;
const WITH_LEO = /(add|at) me in (the|your) (room|house)|in your house|in the room|with (you|leo)/i;
const OWN = /separate house|own house|my own (house|home)|own home/i;
const GREET = /^(hi|hai|hey|hello|hallo|yo)\b|welcome|^[\p{Extended_Pictographic}\s‍️]+$/iu;
const NAME = /(?:my name is|call me|i'?m called)\s+([\p{L}]{2,15})/iu;
const CUSTOM = /^(?:build|get|make|add|open)?\s*(?:an?|the|some)\s+([\p{L} ]{3,24}?)[.!]*$|^(?:build|get|make|open)\s+(?:an?|the)\s+([\p{L} ]{3,24}?)[.!]*$/iu;

const cap = s => s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const pretty = h => {
  let x = h.replace(/^@/, '').replace(/[-_.].*$/, '').replace(/\d+$/, '');
  const camel = x.match(/^[a-z]+(?=[A-Z])|^[A-Z][a-z]+(?=[A-Z])/);
  if (camel) x = camel[0];
  return cap(x.toLowerCase());
};
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
  const movers = [], greets = [], wishes = {}, order = [];
  for (const raw of comments) {
    const c = { author: cleanHandle(raw.author), text: cleanText(raw.text, 200), likes: raw.likes ?? 0, name: raw.name };
    if (!c.text || isBlocked(c, blocklist)) continue;
    const isSub = subs ? subs.has(c.author.toLowerCase()) : true;
    if (MOVE.test(c.text) && isSub) {
      const name = c.name ?? (c.text.match(NAME)?.[1] ? cap(c.text.match(NAME)[1].toLowerCase()) : null);
      const old = movers.find(m => m.author === c.author);
      if (old) { old.withLeo ||= WITH_LEO.test(c.text); old.own ||= OWN.test(c.text); old.name ??= name; }
      else movers.push({ ...c, name, withLeo: WITH_LEO.test(c.text), own: OWN.test(c.text) });
    }
    if (GREET.test(c.text) && c.text.length < 40) greets.push(c);
    let found = false;
    const hits = Object.entries(WISHES).map(([k, w]) => [k, c.text.search(w.kw)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
    for (const [k] of hits) {
      found = true;
      const e = wishes[k] ??= { key: k, votes: 0, by: [] };
      if (!e.by.includes(c.author)) { e.votes++; e.by.push(c.author); }
      if (!order.includes(k)) order.push(k);
    }
    const m = !found && c.text.length < 40 && c.text.match(CUSTOM);
    if (m) {
      const label = cap((m[1] ?? m[2]).trim().toLowerCase());
      const k = 'custom:' + label.toLowerCase();
      const e = wishes[k] ??= { key: k, votes: 0, by: [], label };
      if (!e.by.includes(c.author)) { e.votes++; e.by.push(c.author); }
      if (!order.includes(k)) order.push(k);
    }
  }
  const ranked = Object.values(wishes).sort((a, b) => b.votes - a.votes || order.indexOf(a.key) - order.indexOf(b.key));
  return { movers, greets, ranked };
}

function wishInfo(w) {
  if (w.key.startsWith('custom:')) return { icon: '🏪', name: w.label, cost: 28000, build: { type: 'shop', shop: true } };
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
  const { movers, greets, ranked } = readComments(input.comments ?? [], input.subscribed, cfg.blocklist);

  // ---- money ----
  const before = s.residents, after = Math.max(1, (input.subscribers ?? 0) + 1);   // + Leo himself
  const vid = input.video ?? {}, seen = s.videos[vid.id] ?? { likes: 0, comments: 0 };
  const likes = Math.max(0, (vid.likes ?? 0) - seen.likes), nComments = Math.max(0, (vid.commentCount ?? input.comments?.length ?? 0) - seen.comments);
  if (vid.id) s.videos[vid.id] = { likes: vid.likes ?? 0, comments: vid.commentCount ?? 0 };
  const gained = Math.max(0, after - before);
  const rows = [
    { icon: '👤', label: `${fmt(gained)} new subscriber${gained === 1 ? '' : 's'}`, amount: '+' + money(gained * eco.perSubscriber) },
    { icon: '❤️', label: `${fmt(likes)} like${likes === 1 ? '' : 's'}`, amount: '+' + money(likes * eco.perLike) },
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
  const person = (m, x, z, at, ry = 0, title = 'Resident') => {
    const name = m.name ?? pretty(m.author);
    const p = { id: m.author, name, handle: m.author, x, z, ry, at, colors: COLORS[hash(m.author) % COLORS.length] };
    people.push(p);
    s.citizens[m.author] = { role: 'resident', title, name, day: s.day };
    return p;
  };
  const names = list => list.length === 1 ? `*${list[0]}*` : list.slice(0, -1).map(n => `*${n}*`).join(', ') + ` and *${list.at(-1)}*`;

  // 1. intro
  const overview = { x: 0, z: R * 0.06, dist: R * 3.7, pitch: 62, yaw: 0 };
  shot({ type: 'intro', cam: overview, cam2: { ...overview, dist: R * 3.45 }, ring: { x: 5, z: 6, r: 62 } }, [[[`Day *${s.day}* in`, `*${town}!*`], 2.2]]);

  // 2. greetings
  const g = greets.slice(0, 4);
  shot({ type: 'greet', cam: { x: door.x, y: 1.7, z: door.z, dist: 11, pitch: 7, yaw: -8 }, cam2: { x: door.x, y: 1.7, z: door.z, dist: 9.5, pitch: 6, yaw: 4 },
    actor: { ...door, ry: 0, anim: 'wave' },
    panel: g.length ? { kind: 'greet', items: g.map(c => ({ author: c.author, text: c.text, hue: hash(c.author) % 360 })) } : null },
  [[[`Yesterday, ${who} was`, '*all alone…*'], 2.0], [['…and then *you*', 'showed up!'], 2.0]]);

  // 3. new residents
  const fol = shot({ type: 'followers', cam: { x: 18, z: 2, dist: 75, pitch: 36, yaw: -12 }, cam2: { x: 14, z: 4, dist: 68, pitch: 38, yaw: -6 },
    panel: { kind: 'followers', title: 'RESIDENTS', y: 'YESTERDAY', t: 'TODAY', from: before, to: after, c0: 2.1, c1: 3.1 } },
  [[[`Yesterday: *${fmt(before)}* resident${before === 1 ? '' : 's'}.`], 2.0], [[`Today? *${fmt(after)}!*`], 2.0]]);
  move('residents', fol.t0 + 2.1, after, 1.0);
  s.residents = after;

  // 4. income
  const inc = shot({ type: 'income', cam: { x: 6, z: 8, dist: 62, pitch: 46, yaw: 10 }, cam2: { x: 2, z: 8, dist: 58, pitch: 46, yaw: 14 }, panel: { kind: 'income', rows } },
    [[['That brings', `*${money(income)}* into the budget!`], 3.0]]);
  s.cash += income; move('cash', inc.t0 + 1.4, s.cash, 1.3);

  // 5. roommates: people who asked to live with Leo first, then other named movers
  const free = Math.max(0, s.housing - before);
  const order = [...movers.filter(m => m.withLeo), ...movers.filter(m => !m.withLeo && !m.own && m.name), ...movers.filter(m => !m.withLeo && !m.own && !m.name)];
  const mates = order.slice(0, free);
  let at;
  if (mates.length) {
    const sh = shot({ type: 'roommates', cam: { x: door.x - 0.9, y: 3.6, z: door.z + 1, dist: 30, pitch: 13, yaw: 8 }, cam2: { x: door.x - 0.9, y: 3.6, z: door.z + 1, dist: 28, pitch: 12, yaw: 2 },
      actor: { ...door, ry: 0, anim: 'cheer' },
      panel: { kind: 'room', title: `${who}'s house`, filled: 1, total: 4, at: 0.3, mates: [] } },
    [[[names(mates.map(m => m.name ?? pretty(m.author))), `move in with ${who}!`], 3.2], [[mates.length >= free ? `His house is *full!*` : `There's still room for *${free - mates.length}!*`], 1.8]]);
    const spots = [[-1.7, 0.6], [1.7, 0.6], [-3.4, 1.3]];
    mates.forEach((m, k) => {
      at = sh.t0 + 0.9 + k * 0.6;
      const p = person(m, door.x + spots[k][0], door.z + spots[k][1], at, -spots[k][0] * 0.06, 'Roommate');
      sh.panel.mates.push({ name: p.name, hue: hash(m.author) % 360, at: at - sh.t0 });
      tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name, sub: m.author !== '@' + p.name ? m.author : null, t0: at + 0.2, t1: sh.t1 });
    });
  }

  // 6. own houses
  const own = movers.filter(m => m.own && !mates.includes(m)).slice(0, 2);
  for (const m of own) {
    if (s.cash < HOUSE.cost) break;
    const name = m.name ?? pretty(m.author);
    const t0 = now;
    const b = place({ type: 'house', cap: HOUSE.cap, owner: m.author, sign: { icon: '🏠', name: `${name}'s house`, handle: m.author } }, t0 + 1.2);
    const sh = shot({ type: 'build', cam: { x: b.x + 1.8, y: 3.6, z: b.z + 4, dist: 36, pitch: 16, yaw: -12 }, cam2: { x: b.x + 1.8, y: 3.6, z: b.z + 4, dist: 33, pitch: 15, yaw: -5 },
      panel: { kind: 'price', amount: '−' + money(HOUSE.cost), label: `${name}'s house`, at: 1.25 } },
    [[[`*${name}* asked for`, 'a *separate house…*'], 2.2], [['Here it is!'], 1.6]], 0.3);
    const p = person(m, b.x + 4.0, b.z + 7.2, t0 + 1.9, -0.25, 'Home owner');
    tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name, sub: m.author, t0: t0 + 2.1, t1: sh.t1 });
    s.cash -= HOUSE.cost; s.housing += HOUSE.cap;
    move('cash', t0 + 1.25, s.cash, 0.7); move('housing', t0 + 1.2, s.housing, 0.6);
  }

  // 7. wishes: build the most wanted thing we can afford, then show the vote and the goal
  const built = [];
  let homeless = Math.max(0, s.residents - s.housing);
  const want = ranked.map(w => ({ ...w, ...wishInfo(w) }));
  const buildable = want.filter(w => w.build && !(w.role && s.buildings.some(b => b.role === w.role)));
  const pick = homeless > 0 ? buildable.find(w => w.key === 'apartment' && w.cost <= s.cash) ?? buildable.find(w => w.cost <= s.cash) : buildable.find(w => w.cost <= s.cash);
  if (homeless > 0) {
    shot({ type: 'tents', cam: { x: -32, z: 30, dist: 60, pitch: 40, yaw: 10 }, tentsAt: { x: -32, z: 30 } },
      [[[`But *${fmt(homeless)}* of you`, 'still sleep in *tents!*'], 2.4]]);
  }
  for (const w of [pick].filter(Boolean)) {
    const t0 = now, credit = w.by[0];
    const rec = w.build.type === 'block' ? { type: 'block', cap: w.build.cap }
      : w.build.type === 'shop' ? { type: 'shop', role: 'custom', name: w.name, owner: credit, style: { color: ['#d6584a', '#3f8fd0', '#46a36a', '#c9589f', '#e09a2e'][hash(w.name) % 5] }, sign: { icon: w.icon, name: w.name, handle: credit } }
      : { type: w.build.type, role: w.role, name: w.name, style: { color: ROLES[w.role].color, feature: ROLES[w.role].feature ?? null }, sign: { icon: w.icon, name: w.name, handle: 'idea: ' + credit } };
    const b = place(rec, t0 + 1.4);
    const tall = w.build.type === 'block';
    const sh = shot({ type: 'build', cam: { x: b.x, y: tall ? 5 : 3, z: b.z + 2, dist: tall ? 52 : 40, pitch: 22, yaw: 16 }, cam2: { x: b.x, y: tall ? 5 : 3, z: b.z + 2, dist: tall ? 46 : 36, pitch: 20, yaw: 8 },
      panel: { kind: 'price', amount: '−' + money(w.cost), label: cap(w.name), at: 1.45 } },
    [[[w.votes > 1 ? `*${w.votes}* of you wanted` : `*${pretty(credit)}* wanted`, `a${/^[aeiou]/i.test(w.name) ? 'n' : ''} *${lc(w)}…*`], 2.4],
     [[tall ? `Room for *${fmt(w.build.cap)}* more!` : 'Here it is!'], 1.8]], 0.3);
    if (w.build.cap) {
      // everyone who asked to move in and has no bed yet moves in here
      const rest = movers.filter(m => !mates.includes(m) && !own.includes(m));
      if (rest.length) {
        const shown = rest.slice(0, 4), t1 = now;
        const nm = shown.map(m => m.name ?? pretty(m.author)), short = nm.filter(n => n.length <= 11).slice(0, 2);
        const more = rest.length - short.length;
        const sh2 = shot({ type: 'movein', cam: { x: b.x, y: 1.6, z: b.z + 6.5, dist: 20, pitch: 12, yaw: -10 }, cam2: { x: b.x, y: 1.6, z: b.z + 6.5, dist: 18, pitch: 11, yaw: -2 } },
          [[[short.length ? names(more ? [...short, `${more} more`] : short) : `*${rest.length}* of you`, 'move in!'], 2.6]], 0.3);
        shown.forEach((m, k) => {
          const p = person(m, b.x - 4.2 + k * 2.8, b.z + 7.4 + (k % 2) * 0.6, sh2.t0 + 0.4 + k * 0.35, 0);
          tags.push({ x: p.x, y: 3.0, z: p.z, text: p.name.length <= 11 ? p.name : m.author, t0: sh2.t0 + 0.6 + k * 0.35, t1: sh2.t1 });
        });
        for (const m of rest.slice(4)) s.citizens[m.author] = { role: 'resident', title: 'Resident', name: m.name ?? pretty(m.author), day: s.day };
      }
    }
    tags.push({ x: b.x, y: tall ? 7.5 : 6, z: b.z + 6, text: 'Idea: ' + credit, t0: t0 + 2.0, t1: sh.t1 });
    s.cash -= w.cost; move('cash', t0 + 1.45, s.cash, 0.7);
    if (w.build.cap) { s.housing += w.build.cap; move('housing', t0 + 1.4, s.housing, 0.6); }
    built.push(w.key);
  }
  for (const w of want) { const e = s.wishes[w.key] ??= { votes: 0, by: [], label: w.name }; e.votes += w.votes; e.by.push(...w.by.filter(h => !e.by.includes(h))); }
  for (const k of built) delete s.wishes[k];

  const open = want.filter(w => !built.includes(w.key));
  if (open.length) {
    const top = open.slice(0, 6);
    shot({ type: 'votes', cam: { x: 8, z: 0, dist: 150, pitch: 52, yaw: -8 }, cam2: { x: 8, z: 0, dist: 138, pitch: 54, yaw: -2 },
      panel: { kind: 'votes', title: 'YOUR WISHES', rows: top.map(w => ({ icon: w.icon, name: cap(w.name), votes: w.votes })) } },
    [[['And what do you', 'want *next?*'], 2.0],
     [top[1] && top[1].votes === top[0].votes ? [`*${cap(lc(top[0]))}* and *${lc(top[1])}*`, 'are *tied!*'] : [`*${cap(lc(top[0]))}* is in the lead!`], 2.4]]);
    const goal = open.find(w => w.cost > s.cash && w.build) ?? open[0];
    shot({ type: 'goal', cam: { x: 0, z: 10, dist: 260, pitch: 58, yaw: 0 }, cam2: { x: 0, z: 10, dist: 240, pitch: 58, yaw: 0 },
      panel: { kind: 'goal', title: `NEXT: ${goal.name.toUpperCase()}`, cur: s.cash, target: goal.cost, money: true, unit: '' } },
    [[[`The ${lc(goal)} costs`, `*${money(goal.cost)}.*`], 2.4], [['Keep subscribing,', 'and we can *build it!*'], 2.4]]);
    s.goal = { key: goal.key, cost: goal.cost };
  }

  // 8. outro: Leo and his roommates wave
  const role = s.goal?.key && WISHES[s.goal.key]?.role ? ROLES[WISHES[s.goal.key].role].chief.en.toLowerCase() : null;
  shot({ type: 'outro', cam: { x: door.x - 0.9, y: 2.2, z: door.z + 0.8, dist: 25, pitch: 10, yaw: 6 }, cam2: { x: door.x - 0.9, y: 2.2, z: door.z + 0.8, dist: 23, pitch: 9, yaw: 0 },
    actor: { ...door, ry: 0, anim: 'wave' } },
  [[role ? ['Who wants to be', `the first *${role}?*`] : ['What should we', '*build next?*'], 2.4], [['Tell me in the', '*comments!*'], 2.4]], 0.6);

  // unnamed newcomers: everyone without a bed waits in the tent camp for now
  const ep = {
    version: 1, day: s.day, city: town, lang: 'en', locale: 'en-US', mayor: who,
    hud: { cash: 'BUDGET', residents: 'RESIDENTS', day: 'DAY', housing: 'HOMES', full: 'full', tents: 'sleeping in tents', free: 'free' },
    duration: +now.toFixed(2), shots, tracks, tags, cars: false,
    people: [...(prev.people ?? []).map(p => ({ ...p, at: null })), ...people],
    buildings: s.buildings.map(({ _at, ...b }) => ({ ...b, at: _at ?? null })),
    tiles: prev.tiles.map(t => ({ ...t, at: null })).concat(newTiles),
    island: { R, pts: islandPts(R) }, river: riverPath(R), tentField: { x: -32, z: 30 }, townhall: H,
    clear: [{ x: -32, z: 30, r: 26 }, { x: 15, z: 6, r: 80 }],
    cityBox: { x0: -88, x1: 75, z0: -16, z1: 24 },
    residentsHome: Object.values(s.citizens).filter(c => c.day <= s.day).length,
    summary: { before, after, gained, income, cash: s.cash, housing: s.housing, built: s.buildings.filter(b => b.day === s.day).length, queue: 0,
      roommates: mates.map(m => m.author), ownHouses: own.map(m => m.author), wishes: want.map(w => `${w.name} ${w.votes}`) },
  };
  for (const b of s.buildings) delete b._at;
  s.people = [...(prev.people ?? []), ...people.map(({ at, ...p }) => p)];
  return { state: s, episode: ep };
}
