// Day 0: the episode that introduces the founder, the island and the rules.
// Same episode format as a normal day, so the same player renders it.
import { initialState, TOWNHALL, VILLAGE_SIGN, islandPts, riverPath, villageRoad } from './sim.mjs';

const TEXT = {
  en: {
    locale: 'en-US',
    money: n => '€' + n.toLocaleString('en-US'),
    hud: { cash: 'BUDGET', residents: 'RESIDENTS', day: 'DAY', housing: 'HOMES', full: 'full', tents: 'sleeping in tents', free: 'free' },
    lines: (who, town, cash, room, eco) => ({
      hello: [`This is *${who}.*`],
      neighbor: ['Maybe your', '*neighbor* soon!'],
      everyone: ['Because *everyone*', 'who subscribes'],
      island: ['moves here,', 'to the *island!*'],
      yesterday: [`${who} moved in`, '*yesterday*'],
      alone: ['and still lives', '*all alone.*'],
      house: ['He built himself', 'a *small house*'],
      road: ['and a *road.*'],
      welcome: ['Welcome to', `*${town}!*`],
      water: ['He gets his water'],
      stream: ['from the *stream*', 'down the *mountain.*'],
      budget: ['The budget still has', `*${cash}.*`],
      room: [`And ${who}'s house has`, `room for *${room} roommates!*`],
      perSub: ['Every new resident', `brings *${eco.sub}!*`],
      perLike: [`Every like *${eco.like},*`],
      perComment: [`every comment *${eco.comment}.*`],
      city: [`Together we'll turn *${town}*`, 'into a *city!*'],
      first: [`What should ${who}`, '*build first?*'],
      tell: ['Tell me in the', '*comments!*'],
    }),
    priceHouse: 'Small house', priceRoad: 'Village road',
    roomTitle: who => `${who}'s house`, roomFree: n => `${n} spots free`,
    rules: eco => [
      { icon: '👤', label: '1 new subscriber', mid: '= 1 resident', amount: '+' + eco.sub },
      { icon: '❤️', label: '1 like', amount: '+' + eco.like },
      { icon: '💬', label: '1 comment', amount: '+' + eco.comment },
    ],
    cta: ['"A bakery!"', '"A police station!"', '"A school!"'],
  },
  de: {
    locale: 'de-DE',
    money: n => n.toLocaleString('de-DE') + ' €',
    hud: { cash: 'KASSE', residents: 'EINWOHNER', day: 'TAG', housing: 'WOHNPLÄTZE', full: 'voll', tents: 'schlafen im Zelt', free: 'frei' },
    lines: (who, town, cash, room, eco) => ({
      hello: [`Das ist *${who}.*`],
      neighbor: ['Vielleicht bald', 'dein *Nachbar!*'],
      everyone: ['Denn *jeder*,', 'der folgt,'],
      island: ['zieht hier', 'auf die *Insel!*'],
      yesterday: [`${who} ist *gestern*`, 'hergezogen'],
      alone: ['und wohnt noch', '*ganz allein.*'],
      house: ['Er hat sich ein', '*kleines Haus*'],
      road: ['und eine *Straße* gebaut.'],
      welcome: ['Willkommen in', `*${town}!*`],
      water: ['Sein Wasser holt er'],
      stream: ['aus dem *Bach*', 'vom *Berg.*'],
      budget: ['In der Kasse sind noch', `*${cash}.*`],
      room: [`Und bei ${who} ist Platz`, `für *${room} Mitbewohner!*`],
      perSub: ['Jeder neue Bewohner', `bringt *${eco.sub}!*`],
      perLike: [`Jedes Like *${eco.like},*`],
      perComment: [`jeder Kommentar *${eco.comment}.*`],
      city: [`Damit machen wir aus *${town}*`, 'eine *Stadt!*'],
      first: [`Was soll ${who}`, 'als *Erstes bauen?*'],
      tell: ['Schreib es in die', '*Kommentare!*'],
    }),
    priceHouse: 'Kleines Haus', priceRoad: 'Dorfstraße',
    roomTitle: who => `Haus von ${who}`, roomFree: n => `${n} Plätze frei`,
    rules: eco => [
      { icon: '👤', label: '1 neuer Abonnent', mid: '= 1 Einwohner', amount: '+' + eco.sub },
      { icon: '❤️', label: '1 Like', amount: '+' + eco.like },
      { icon: '💬', label: '1 Kommentar', amount: '+' + eco.comment },
    ],
    cta: ['„Eine Bäckerei!"', '„Eine Polizeiwache!"', '„Eine Schule!"'],
  },
};

export function introEpisode(cfg) {
  const lang = TEXT[cfg.lang] ? cfg.lang : 'en', T = TEXT[lang];
  const who = cfg.mayorName, town = cfg.cityName;
  const eco = { perSubscriber: 1000, perLike: 1, perComment: 2, ...cfg.economy };
  const state = initialState(cfg);
  const HOUSE_COST = 15000, ROAD_COST = 2000;
  const startCash = state.cash + HOUSE_COST + ROAD_COST;
  const ecoTxt = { sub: T.money(eco.perSubscriber), like: T.money(eco.perLike), comment: T.money(eco.perComment) };
  const X = T.lines(who, town, T.money(state.cash), state.housing - state.residents, ecoTxt);

  const R = 290, H = TOWNHALL, river = riverPath(R);
  const overview = { x: 0, z: R * 0.06, dist: R * 3.7, pitch: 62, yaw: 0 };
  const ring = { x: H.x - 20, z: H.z + 4, r: 70 };
  const front = { x: H.x, z: H.z + 7.4 };             // in front of the door
  const bank = { x: -90.6, z: 25 };                    // east bank of the stream

  const shots = [];
  let now = 0;
  // caps: [lines, seconds]; the shot lasts as long as its captions plus `hold`
  const shot = (o, caps, hold = 0) => {
    const t0 = now;
    let t = t0 + 0.1;
    const captions = caps.map(([lines, d]) => { const c = { lines, t0: t, t1: t + d }; t += d; return c; });
    now = t + hold;
    const sh = { t0, t1: now, ...o, captions };
    shots.push(sh); return sh;
  };

  const tracks = { cash: [[0, startCash]], residents: [[0, 1]], housing: [[0, 4]] };
  const buildings = [], tiles = [];

  // 1-2  close-up: the founder waves
  shot({ type: 'hello', cam: { x: front.x, y: 1.85, z: front.z, dist: 7.6, pitch: 4, yaw: -8 },
    cam2: { x: front.x, y: 1.75, z: front.z, dist: 9, pitch: 6, yaw: 6 },
    actor: { ...front, ry: 0, anim: 'wave', suitcase: true } },
  [[X.hello, 1.6], [X.neighbor, 1.9]]);
  // 3  pull back: him and his suitcase on an empty meadow
  shot({ type: 'everyone', cam: { x: front.x, y: 1, z: front.z, dist: 26, pitch: 22, yaw: 12 },
    actor: { ...front, ry: 0.2, anim: 'idle', suitcase: true } },
  [[X.everyone, 1.9]]);
  // 4  the whole island
  shot({ type: 'island', cam: { ...overview }, cam2: { ...overview, dist: R * 3.5 }, ring,
    actor: { ...front, ry: 0.2, anim: 'idle', suitcase: true } },
  [[X.island, 2.3]]);
  // 5  zoom towards the spot
  shot({ type: 'yesterday', cam: { ...overview, dist: R * 3.3 }, cam2: { x: H.x, z: H.z, dist: 230, pitch: 55, yaw: 0 },
    actor: { ...front, ry: 0.2, anim: 'idle', suitcase: true } },
  [[X.yesterday, 2.0]]);
  // 6  tiny on a big meadow, looking around
  shot({ type: 'alone', cam: { x: front.x, y: 0.8, z: front.z, dist: 20, pitch: 38, yaw: -10 }, cam2: { x: front.x, y: 0.8, z: front.z, dist: 16, pitch: 34, yaw: -24 },
    actor: { ...front, ry: 0.2, anim: 'look', suitcase: true } },
  [[X.alone, 2.1]]);
  // 7  the house pops up
  const sh7 = shot({ type: 'house', cam: { x: H.x + 1, y: 3.4, z: H.z + 3, dist: 48, pitch: 24, yaw: -20 }, cam2: { x: H.x + 1, y: 3.4, z: H.z + 3, dist: 42, pitch: 22, yaw: -10 },
    actor: { x: H.x + 6.5, z: H.z + 8.5, ry: -0.3, anim: 'cheer', suitcase: true },
    panel: { kind: 'price', amount: '−' + T.money(HOUSE_COST), label: T.priceHouse, at: 0.75 } },
  [[X.house, 2.4]]);
  buildings.push({ id: 0, type: 'cottage', x: H.x, z: H.z, at: sh7.t0 + 0.55 });
  tracks.cash.push([sh7.t0 + 0.75, startCash], [sh7.t0 + 1.5, startCash - HOUSE_COST]);
  // 8  the road rolls out towards the west
  const sh8 = shot({ type: 'road', cam: { x: 10, y: 0, z: 12, dist: 120, pitch: 34, yaw: -28 }, cam2: { x: -30, y: 0, z: 12, dist: 125, pitch: 34, yaw: -34 },
    actor: { x: H.x + 1.5, z: 12, to: { x: H.x - 12, z: 12 }, ry: -Math.PI / 2, anim: 'walk', suitcase: false },
    panel: { kind: 'price', amount: '−' + T.money(ROAD_COST), label: T.priceRoad, at: 0.5 } },
  [[X.road, 2.2]]);
  villageRoad().forEach((t, k) => tiles.push({ ...t, at: t.k === 'c8' ? sh8.t0 + 0.05 : sh8.t0 + 0.1 + k * 0.17 }));
  tracks.cash.push([sh8.t0 + 0.5, startCash - HOUSE_COST], [sh8.t0 + 1.3, state.cash]);
  // 9  the village sign
  const sh9 = shot({ type: 'welcome', cam: { x: VILLAGE_SIGN.x, y: 3.4, z: VILLAGE_SIGN.z, dist: 26, pitch: 9, yaw: -40 }, cam2: { x: VILLAGE_SIGN.x, y: 3.4, z: VILLAGE_SIGN.z, dist: 22, pitch: 7, yaw: -28 } },
  [[X.welcome, 2.4]]);
  buildings.push({ id: 1, type: 'sign', text: town, ...VILLAGE_SIGN, at: sh9.t0 + 0.35 });
  // 10-11  fetching water, then up the stream to the mountain spring
  shot({ type: 'water', cam: { x: bank.x - 4.5, y: 1.4, z: bank.z, dist: 26, pitch: 20, yaw: -12 },
    cam2: { x: river[0][0], y: 0, z: river[0][1] + 20, dist: 170, pitch: 30, yaw: 8 },
    actor: { ...bank, ry: -1.0, anim: 'idle', bucket: true } },
  [[X.water, 1.6], [X.stream, 2.5]]);
  // 12  the budget
  shot({ type: 'budget', cam: { x: -20, y: 0, z: 0, dist: 170, pitch: 42, yaw: -14 }, cam2: { x: 0, y: 0, z: 4, dist: 150, pitch: 44, yaw: -4 }, hudPulse: 'cash',
    actor: { x: -60, z: 12, to: { x: -20, z: 12 }, ry: Math.PI / 2, anim: 'walk', bucket: true } },
  [[X.budget, 2.7]]);
  // 13  room for three
  const sh13 = shot({ type: 'room', cam: { x: H.x, y: 2.8, z: H.z + 3, dist: 25, pitch: 15, yaw: 10 }, cam2: { x: H.x, y: 2.8, z: H.z + 3, dist: 22.5, pitch: 14, yaw: 2 },
    actor: { x: H.x + 1.6, z: H.z + 7.2, ry: -0.2, anim: 'idle', bucket: true },
    panel: { kind: 'room', title: T.roomTitle(who), filled: 1, total: 4, note: T.roomFree(3), at: 0.5 } },
  [[X.room, 3.0]]);
  // 14-16  the rules
  shot({ type: 'rules', cam: { x: H.x, y: 0, z: 10, dist: 62, pitch: 56, yaw: -8 }, cam2: { x: H.x - 26, y: 0, z: 11, dist: 58, pitch: 54, yaw: -14 },
    actor: { x: H.x - 2, z: 12.2, to: { x: H.x - 22, z: 12.2 }, ry: -Math.PI / 2, anim: 'walk' },
    panel: { kind: 'rules', rows: T.rules(ecoTxt), at: [0.15, 2.55, 3.95] } },
  [[X.perSub, 2.4], [X.perLike, 1.4], [X.perComment, 1.6]]);
  // 17  back out to the island
  shot({ type: 'city', cam: { x: H.x - 20, y: 0, z: 0, dist: 300, pitch: 55, yaw: 0 }, cam2: { ...overview, dist: R * 3.4 }, ring },
  [[X.city, 2.8]]);
  // 18-19  the question
  shot({ type: 'cta', cam: { ...overview, dist: R * 3.4 }, cam2: { ...overview, dist: R * 3.25 }, ring,
    panel: { kind: 'cta', lines: T.cta } },
  [[X.first, 2.3], [X.tell, 2.6]], 0.7);

  const ep = {
    version: 1, day: 0, city: town, lang, locale: T.locale, hud: T.hud, mayor: who,
    duration: +now.toFixed(2), shots, tracks, tags: [],
    homesFrom: sh13.t0 + 0.4, crowd: false,
    buildings: buildings.map(b => ({ ...state.buildings.find(s => s.id === b.id), ...b })),
    tiles,
    island: { R, pts: islandPts(R) }, river, tentField: { x: 205, z: -6 }, townhall: H,
    clear: [{ x: H.x - 25, z: 6, r: 75 }],
    cityBox: { x0: -88, x1: 60, z0: -16, z1: 24 },
    summary: { before: 0, after: 1, gained: 1, income: 0, cash: state.cash, housing: state.housing, built: 2, queue: 0 },
  };
  return { state, episode: ep };
}
