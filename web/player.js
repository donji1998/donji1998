// Plays an episode script. Everything on screen is a pure function of the
// time t, so the same code drives the live preview and frame-exact video export.
import * as THREE from 'three';
import { Parts, MAT, rng, buildingMesh, characterFigure } from './world.js';

const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const W = 540, H = 960;
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeIO = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ep = await (await fetch(q.get('ep') ?? '/demo/episodes/day-2.json')).json();
await Promise.all(['700 20px "Baloo 2"', '800 20px "Baloo 2"'].map(f => document.fonts.load(f, 'Aä€@')));
document.body.classList.toggle('capture', CAPTURE);

const CROWD = ep.crowd !== false;
const fmt = n => Math.round(n).toLocaleString(ep.locale);
const money = n => ep.lang === 'de' ? fmt(n) + ' €' : '€' + fmt(n);
const track = (name, t) => {
  const tr = ep.tracks[name]; let v = tr[0][1];
  for (let i = 1; i < tr.length; i++) {
    const [t1, v1] = tr[i], [t0, v0] = tr[i - 1];
    if (t >= t1) { v = v1; continue; }
    if (t > t0 && t1 > t0) v = lerp(v0, v1, easeIO((t - t0) / (t1 - t0)));
    break;
  }
  return v;
};

// ---------- stage ----------
const stage = $('#stage');
function fit() {
  const s = CAPTURE ? 1 : Math.min(innerWidth / W, (innerHeight - 44) / H);
  stage.style.transform = `translate(-50%, ${CAPTURE ? '-50%' : 'calc(-50% - 22px)'}) scale(${s})`;
  return s;
}
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(CAPTURE ? devicePixelRatio : Math.min(2, devicePixelRatio * Math.max(1, fit())));
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
addEventListener('resize', fit); fit();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4fb3cf');
const camera = new THREE.PerspectiveCamera(30, W / H, 2, 9000);
scene.add(new THREE.HemisphereLight('#fff7e6', '#7fa06a', 1.55));
const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ---------- terrain ----------
const R = ep.island.R;
const V3 = new THREE.Vector3();
{
  const shape = new THREE.Shape(ep.island.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const flat = (col, scale, y) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: col }));
    m.scale.set(scale, 1, scale); m.position.y = y; m.receiveShadow = true; scene.add(m); return m;
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fa2c6' }));
  sea.position.y = -1.2; scene.add(sea);
  flat('#63c3d6', 1.13, -1.0); flat('#8bd8dc', 1.075, -0.8); flat('#f1dfae', 1.035, -0.4); flat('#86c25a', 1, 0);

  // mountain range in the far corner
  const p = new Parts(), r = rng(7), mx = -R * 0.52, mz = -R * 0.5;
  for (let k = 0; k < 7; k++) {
    const rad = R * (k ? 0.07 + r() * 0.07 : 0.2), h = rad * (1.25 + r() * 0.4);
    const x = mx + (k ? (r() - 0.5) * R * 0.42 : 0), z = mz + (k ? (r() - 0.5) * R * 0.34 : 0);
    p.add(new THREE.ConeGeometry(rad, h, 7), k % 2 ? '#8d94a0' : '#9aa1ab', x, h / 2 - 0.5, z, r() * 3);
    p.add(new THREE.ConeGeometry(rad * 0.36, h * 0.36, 7), '#f4f7fa', x, h * 0.82 - 0.5 + 0.2, z, r() * 3);
  }
  scene.add(p.mesh());

  // the stream from the mountain spring to the sea
  const river = ep.river ?? [];
  const rpts = river.length ? new THREE.CatmullRomCurve3(river.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(160) : [];
  const riverDist = (x, z) => { let d = 1e9; for (let k = 0; k < rpts.length; k += 2) d = Math.min(d, Math.hypot(x - rpts[k].x, z - rpts[k].z)); return d; };
  const ribbon = (width, y, color) => {
    const pos = [], idx = [];
    rpts.forEach((pt, k) => {
      const a = rpts[Math.max(0, k - 1)], b = rpts[Math.min(rpts.length - 1, k + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, w = width(k / (rpts.length - 1)) / 2;
      pos.push(pt.x - tz / l * w, y, pt.z + tx / l * w, pt.x + tz / l * w, y, pt.z - tx / l * w);
      if (k) { const o = (k - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
  };
  if (rpts.length) {
    ribbon(u => 8.5 + 6 * u, 0.06, '#a6c98a');
    ribbon(u => 6 + 5 * u, 0.08, '#9ed6e6');
    ribbon(u => 4.4 + 4 * u, 0.1, '#5cb3d8');
    ribbon(u => 1.2 + 1.4 * u, 0.11, '#8fd0ea');
    const sp = rpts[0], pond = new Parts().cyl(7.4, 7.8, 0.1, '#b9c2c9', 0, 0, 0, 16).cyl(6, 6, 0.14, '#5cb3d8', 0, 0, 0, 16).cyl(3.4, 3.4, 0.16, '#8fd0ea', 0, 0, 0, 16);
    for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2; pond.ball(0.7 + (k % 3) * 0.25, '#9aa1ab', Math.cos(a) * 7.4, -0.3, Math.sin(a) * 7.4); }
    const pm = pond.mesh(); pm.position.set(sp.x, 0, sp.z); scene.add(pm);
  }
  const onTile = (x, z, pad) => ep.tiles.some(t => Math.abs(x - t.x) < t.w / 2 + pad && Math.abs(z - t.z) < t.d / 2 + pad);
  const onLot = (x, z, pad) => ep.buildings.some(b => b.type !== 'sign' && Math.abs(x - b.x) < (b.type === 'cottage' ? 11 : 8) + pad && Math.abs(z - b.z) < (b.type === 'cottage' ? 10 : 8) + pad)
    || ep.buildings.some(b => b.type === 'sign' && Math.hypot(x - b.x, z - b.z) < 3 + pad);

  // grass tufts and flowers around the village, so close-ups are not one flat green
  {
    const NT = 7000, tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.55, 3).translate(0, 0.27, 0), new THREE.MeshLambertMaterial(), NT);
    const NF = 900, flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0.22, 0), new THREE.MeshLambertMaterial(), NF);
    const tm = new THREE.Matrix4(), tc = new THREE.Color(), rr = rng(11);
    const spot = () => { for (;;) { const x = -125 + rr() * 210, z = -55 + rr() * 110; if (!onTile(x, z, 0.6) && !onLot(x, z, 0) && riverDist(x, z) > 4.5) return [x, z]; } };
    for (let k = 0; k < NT; k++) { const [x, z] = spot(), sc = 0.7 + rr() * 0.8; tuft.setMatrixAt(k, tm.makeRotationY(rr() * 6).scale(V3.set(sc, sc, sc)).setPosition(x, 0, z)); tuft.setColorAt(k, tc.setHSL(0.27 + rr() * 0.04, 0.5, 0.36 + rr() * 0.1)); }
    const FC = ['#ffffff', '#fff3b0', '#ffd24a', '#ff9fc0', '#c9b6ff'];
    for (let k = 0; k < NF; k++) { const [x, z] = spot(); flower.setMatrixAt(k, tm.makeTranslation(x, 0, z)); flower.setColorAt(k, tc.set(FC[k % 5])); }
    scene.add(tuft, flower);
  }

  // forest
  const blocked = (x, z) => riverDist(x, z) < 9 || (x > ep.cityBox.x0 && x < ep.cityBox.x1 && z > ep.cityBox.z0 && z < ep.cityBox.z1)
    || ep.clear.some(c => Math.hypot(x - c.x, z - c.z) < c.r) || Math.hypot(x - mx, z - mz) < R * 0.2;
  const n = Math.round(R * R / 24), spots = [];
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.9, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const inner = d < R * 0.45 && r() < 0.75; // sparser meadow around the town
    if (!blocked(x, z) && !inner) spots.push([x, z, 0.7 + r() * 0.9, r()]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 5).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: '#7a5a3c' }), spots.length);
  const round = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4, 0), new THREE.MeshLambertMaterial(), spots.length);
  const pine = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 5.6, 7).translate(0, 4.6, 0), new THREE.MeshLambertMaterial(), spots.length);
  const m = new THREE.Matrix4(), col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  spots.forEach(([x, z, s, v], i) => {
    m.makeScale(s, s, s).setPosition(x, 0, z);
    trunk.setMatrixAt(i, m);
    const isPine = v < 0.3;
    round.setMatrixAt(i, isPine ? zero : m); pine.setMatrixAt(i, isPine ? m : zero);
    round.setColorAt(i, col.setHSL(0.27 + v * 0.07, 0.5, 0.36 + v * 0.1));
    pine.setColorAt(i, col.setHSL(0.36, 0.42, 0.26 + v * 0.2));
  });
  for (const t of [trunk, round, pine]) { t.castShadow = true; scene.add(t); }

  // small bushes scattered over the meadow, so it reads as a landscape from above
  const NB = 2600, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), NB);
  let nb = 0;
  for (let k = 0; k < NB * 3 && nb < NB; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.92, x = Math.cos(a) * d, z = Math.sin(a) * d, sc = 0.6 + r() * 0.9;
    if (blocked(x, z) || Math.hypot(x - ep.townhall.x, z - ep.townhall.z) < 40) continue;
    bush.setMatrixAt(nb, m.makeScale(sc * 1.3, sc, sc * 1.3).setPosition(x, 0, z)); bush.setColorAt(nb++, col.setHSL(0.28 + r() * 0.05, 0.45, 0.3 + r() * 0.1));
  }
  bush.count = nb; scene.add(bush);
}

// ---------- streets ----------
const tiles = ep.tiles.filter(t => !t.cobble), cobbles = ep.tiles.filter(t => t.cobble);
const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const road = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 1).translate(0, 0.08, 0), new THREE.MeshLambertMaterial({ color: '#4d5361' }), Math.max(1, tiles.length));
if (!tiles.length) road.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
// cobblestones: one texture drawn for a 15 x 6 segment
const cobbleTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 750; cv.height = 300; const c = cv.getContext('2d'), r = rng(3);
  c.fillStyle = '#8f8a80'; c.fillRect(0, 0, 750, 300);
  for (let y = 0, row = 0; y < 300; y += 30, row++) for (let x = -(row % 2) * 22; x < 750; x += 44) {
    const v = 168 + r() * 30 | 0; c.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
    c.beginPath(); c.roundRect(x + 3, y + 3, 38 + r() * 4, 24, 7); c.fill();
  }
  c.fillStyle = '#7d786e'; c.fillRect(0, 0, 750, 10); c.fillRect(0, 290, 750, 10);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
})();
const cobble = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1).translate(0, 0.06, 0), new THREE.MeshLambertMaterial({ map: cobbleTex }), Math.max(1, cobbles.length));
cobble.receiveShadow = true; scene.add(cobble);
function setCobble(i, k) {
  const t = cobbles[i], w = t.w * k, x = t.grow === -1 ? t.x + t.w / 2 - w / 2 : t.x;
  cobble.setMatrixAt(i, M4.compose(V.set(x, 0, t.z), Q.identity(), k > 0 ? S.set(w, 1, t.d) : S.set(0, 0, 0)));
}
cobbles.forEach((t, i) => setCobble(i, t.at == null ? 1 : 0));
if (!cobbles.length) cobble.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
const liveCobbles = cobbles.map((t, i) => i).filter(i => cobbles[i].at != null);
const walk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.26, 1).translate(0, 0.13, 0), new THREE.MeshLambertMaterial({ color: '#cfcabd' }), tiles.length * 2);
const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1).translate(0, 0.18, 0), new THREE.MeshBasicMaterial({ color: '#f4f1e6' }), tiles.length * 2);
road.receiveShadow = walk.receiveShadow = true;
scene.add(road, walk, dash);
function setTile(i, k) {
  const t = tiles[i];
  road.setMatrixAt(i, M4.compose(V.set(t.x, 0, t.z), Q.identity(), S.set(t.w * k, 1, t.d * k)));
  for (let s = 0; s < 2; s++) {
    const on = t.lane && k > 0;
    walk.setMatrixAt(i * 2 + s, M4.compose(V.set(t.x, 0, t.z + (s ? 4.6 : -4.6)), Q.identity(), on ? S.set(t.w * k, 1, 1.4) : S.set(0, 0, 0)));
    dash.setMatrixAt(i * 2 + s, M4.compose(V.set(t.x + (s ? 3.75 : -3.75), 0, t.z), Q.identity(), on ? S.set(3.2 * k, 1, 0.32) : S.set(0, 0, 0)));
  }
}
tiles.forEach((t, i) => setTile(i, t.at == null ? 1 : 0));
const liveTiles = tiles.map((t, i) => i).filter(i => tiles[i].at != null);

// ---------- buildings ----------
const live = [];
for (const b of ep.buildings) {
  const g = buildingMesh(b); scene.add(g);
  if (b.at != null) { live.push({ g, at: b.at }); g.visible = false; }
}
const hero = characterFigure(); scene.add(hero);
// residents who have a name: roommates, home owners
const folk = (ep.people ?? []).map((p, k) => {
  const f = characterFigure(p.colors); f.position.set(p.x, 0, p.z); f.rotation.y = p.ry ?? 0; f.visible = p.at == null; scene.add(f);
  return { p, f, ph: k * 0.37 };
});
const HERO_HOME = { x: ep.townhall.x + 0.5, z: ep.townhall.z + 5.3, ry: 0.15, anim: 'idle' };

// ---------- people, cars, tents ----------
const streets = {};
for (const b of ep.buildings) if (b.i != null && b.at == null) { const s = streets[b.j] ??= { z: b.j * 24 + 12, x0: b.x, x1: b.x }; s.x0 = Math.min(s.x0, b.x); s.x1 = Math.max(s.x1, b.x); }
(streets[0] ??= { z: 12, x0: 22, x1: 38 });
// village: people stroll along the whole cobblestone road
{ const cob = ep.tiles.filter(t => t.cobble && t.z === 12); if (cob.length && ep.cars === false) { streets[0].x0 = Math.min(...cob.map(t => t.x - t.w / 2)) + 8; streets[0].x1 = Math.max(...cob.map(t => t.x + t.w / 2)) - 8; } }
const streetList = Object.values(streets).map(s => ({ ...s, x0: Math.min(s.x0, 15) - 7, x1: Math.max(s.x1, 45) + 7 }));
const MAXW = 420, pr = rng(ep.day * 31 + 5);
const SKIN = ['#f0c7a0', '#d9a878', '#a8744d', '#7a4f33', '#f4d6b8'];
const walkers = Array.from({ length: MAXW }, (_, i) => {
  const st = i < 30 ? streetList.find(s => s.z === 12) ?? streetList[0] : streetList[pr() * streetList.length | 0];
  const sd = pr() < 0.5 ? -1 : 1;
  // keep the pavement in front of Leo's door clear, so he is never hidden in the crowd
  return { st, side: st.z === 12 ? 1 : sd, off: pr() * 0.8, ph: pr() * 1000, sp: 2.2 + pr() * 2.2, h: 0.85 + pr() * 0.3, hue: pr(), skin: SKIN[pr() * 5 | 0] };
});
const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 1.25, 6).translate(0, 0.9, 0), new THREE.MeshLambertMaterial(), MAXW);
const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1).translate(0, 1.85, 0), new THREE.MeshLambertMaterial(), MAXW);
const tmpC = new THREE.Color();
walkers.forEach((w, i) => { bodies.setColorAt(i, tmpC.setHSL(w.hue, 0.6, 0.52)); heads.setColorAt(i, tmpC.set(w.skin)); });
bodies.castShadow = true; scene.add(bodies, heads);

const NCAR = Math.min(26, streetList.length * 4);
const hasTaxi = ep.buildings.some(b => b.role === 'cardealer' && b.at == null);
const cars = Array.from({ length: NCAR }, (_, i) => ({ st: streetList[i % streetList.length], dir: i % 2 ? 1 : -1, ph: pr() * 1000, sp: 9 + pr() * 6 }));
const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.9, 1.7).translate(0, 0.8, 0), new THREE.MeshLambertMaterial(), NCAR);
const carTop = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.75, 1.5).translate(-0.1, 1.6, 0), new THREE.MeshLambertMaterial({ color: '#2a3040' }), NCAR);
const CARCOL = ['#e2523a', '#3d6fd6', '#f6f3ea', '#46a36a', '#31384a', '#f08a24'];
cars.forEach((c, i) => carBody.setColorAt(i, tmpC.set(hasTaxi && i % 3 === 0 ? '#f2c230' : CARCOL[i % 6])));
carBody.castShadow = true; scene.add(carBody, carTop);

const MAXT = 140;
let peakHomeless = 1;
for (let t = 0; t <= ep.duration; t += 0.1) peakHomeless = Math.max(peakHomeless, track('residents', t) - track('housing', t));
const perTent = Math.max(1, peakHomeless / MAXT);
const tents = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 2.5, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0), new THREE.MeshLambertMaterial(), MAXT);
const tentPos = Array.from({ length: MAXT }, (_, i) => {
  const cx = i % 14, cz = Math.floor(i / 14);
  return [ep.tentField.x + (cx - 6.5) * 6 + (pr() - 0.5) * 2, ep.tentField.z + (cz - 4.5) * 6 + (pr() - 0.5) * 2, pr() * 0.6];
}).sort((a, b) => Math.hypot(a[0] - ep.tentField.x, a[1] - ep.tentField.z) - Math.hypot(b[0] - ep.tentField.x, b[1] - ep.tentField.z));
const TENTCOL = ['#f08a24', '#3d9bd6', '#e2523a', '#8a6fb8', '#46a36a', '#f2c230', '#d9cfb8'];
tentPos.forEach((p, i) => tents.setColorAt(i, tmpC.set(TENTCOL[i % 7])));
tents.castShadow = true; scene.add(tents);
const campers = walkers.slice(0, 60).map(() => [ep.tentField.x + (pr() - 0.5) * 70, ep.tentField.z + (pr() - 0.5) * 50]);

// ---------- HUD + panels ----------
$('#l-cash').textContent = ep.hud.cash; $('#l-res').textContent = ep.hud.residents; $('#l-day').textContent = ep.hud.day;
$('#l-home').textContent = ep.hud.housing; $('#v-day').textContent = ep.day;

const show = (el, k, mode = 'block') => {
  if (k <= 0) { el.style.display = 'none'; return; }
  el.style.display = mode; el.style.opacity = clamp(k * 3); el.style.scale = easeBack(clamp(k)) * 0.3 + 0.7;
};
const pop = (lt, at, dur = 0.3) => (lt - at) / dur;
const avatar = (handle, hue) => `<div class="avatar" style="background:hsl(${hue} 62% 52%)">${esc(handle.replace('@', '')[0]?.toUpperCase() ?? '?')}</div>`;
const mk = (cls, html) => { const d = document.createElement('div'); d.className = 'panel ' + cls; d.innerHTML = html; $('#panels').append(d); return d; };

const PANELS = {
  followers(p) {
    const el = mk('followers', `<h4>👤 ${esc(p.title)}</h4><div class="cols"><div><small>${esc(p.y)}</small><b>${fmt(p.from)}</b></div><div class="arrow">→</div><div><small>${esc(p.t)}</small><b class="to">?</b></div></div>`);
    const to = el.querySelector('.to');
    return lt => { show(el, pop(lt, 0.25)); to.textContent = lt < p.c0 ? '?' : fmt(lerp(p.from, p.to, easeOut(clamp((lt - p.c0) / (p.c1 - p.c0))))); to.style.scale = lt >= p.c1 ? 1 + 0.25 * Math.max(0, 1 - (lt - p.c1) * 4) : 1; };
  },
  income(p) {
    const el = mk('income', p.rows.map(r => `<div class="r"><span>${r.icon}</span><span>${esc(r.label)}</span><b>${esc(r.amount)}</b></div>`).join(''));
    const rows = [...el.querySelectorAll('.r')];
    return lt => { show(el, pop(lt, 0.2)); rows.forEach((r, k) => { r.style.opacity = clamp(pop(lt, 0.45 + k * 0.4, 0.2)); }); };
  },
  price(p) {
    const el = mk('price', `<b>${esc(p.amount)}</b><span>${esc(p.label)}</span>`);
    return lt => show(el, pop(lt, p.at));
  },
  comment(p) {
    const el = mk('comment', `${avatar(p.author, p.hue)}<div><div class="who">${esc(p.author)}</div><div class="txt">${esc(p.text)}</div><div class="likes">♥ ${fmt(p.likes)}</div></div>`);
    const pr = mk('price', `<b>${esc(p.price)}</b><span>${esc(p.label)}</span>`); pr.style.top = '372px';
    return lt => { show(el, lt > p.at + 1.15 ? 0 : pop(lt, 0.3), 'grid'); show(pr, lt > p.at + 1.25 ? 0 : pop(lt, p.at)); };
  },
  hires(p) {
    const el = mk('hires', `<h4>${p.icon} ${esc(p.title)}</h4>` + p.rows.map(r => `<div class="r">${avatar(r.handle, r.hue)}<span>${esc(r.handle)}</span><i>${esc(r.title)}</i></div>`).join('')
      + (p.more ? `<div class="r"><span>+${p.more}</span></div>` : '') + (p.note ? `<div class="note">${esc(p.note)}</div>` : ''));
    const rows = [...el.querySelectorAll('.r, .note')];
    return lt => { show(el, pop(lt, 0.3)); rows.forEach((r, k) => { r.style.opacity = clamp(pop(lt, 0.7 + k * 0.35, 0.2)); }); };
  },
  goal(p) {
    const el = mk('goal', `<h4>🎯 ${esc(p.title)}</h4><div class="bar"><i></i></div><div class="num"></div>`
      + ((p.options ?? []).length > 1 ? `<div class="votes">${p.options.map(o => `<div>${o.icon} ${esc(o.name)}<b>${fmt(o.votes)}</b></div>`).join('')}</div>` : ''));
    const bar = el.querySelector('i'), num = el.querySelector('.num');
    return lt => { show(el, pop(lt, 0.4)); const k = easeOut(clamp((lt - 0.8) / 1.2)); bar.style.width = clamp(p.cur / p.target) * 100 * k + '%'; num.textContent = p.money ? `${money(p.cur * k)} / ${money(p.target)}` : `${fmt(p.cur * k)} / ${fmt(p.target)} ${p.unit}`; };
  },
  room(p) {
    const mates = p.mates ?? [];
    const slot = (k) => k < p.filled
      ? `<div class="slot on"><div class="avatar" style="background:#f2b632">${esc(ep.mayor[0] ?? '?')}</div><span>${esc(ep.mayor)}</span></div>`
      : `<div class="slot"><div class="avatar empty">+</div>` + (mates[k - p.filled] ? `<div class="avatar mate" style="background:hsl(${mates[k - p.filled].hue} 62% 52%)">${esc(mates[k - p.filled].name[0] ?? '?')}</div>` : '')
        + `<span>${mates[k - p.filled] ? esc(mates[k - p.filled].name) : '&nbsp;'}</span></div>`;
    const el = mk('room', `<h4>🏠 ${esc(p.title)}</h4><div class="slots">` + Array.from({ length: p.total }, (_, k) => slot(k)).join('') + `</div>` + (p.note ? `<div class="note">${esc(p.note)}</div>` : ''));
    const kids = [...el.querySelectorAll('.slot, .note')], mateEls = [...el.querySelectorAll('.avatar.mate')], names = [...el.querySelectorAll('.slot span')];
    return lt => {
      show(el, pop(lt, p.at));
      kids.forEach((c, k) => { const v = pop(lt, p.at + 0.25 + k * 0.2, 0.25); c.style.opacity = clamp(v * 3); c.style.scale = v <= 0 ? 0.5 : easeBack(clamp(v)) * 0.5 + 0.5; });
      mateEls.forEach((a, k) => { const v = pop(lt, mates[k].at, 0.3); a.style.opacity = clamp(v * 3); a.style.scale = v <= 0 ? 0.3 : easeBack(clamp(v)); names[p.filled + k].style.opacity = clamp(v * 3); });
    };
  },
  greet(p) {
    const el = mk('greet', p.items.map(c => `<div class="b">${avatar(c.author, c.hue)}<div><small>${esc(c.author)}</small>${esc(c.text)}</div></div>`).join(''));
    const kids = [...el.children];
    return lt => { el.style.display = 'block'; kids.forEach((c, k) => { const v = pop(lt, 0.4 + k * 0.45, 0.25); c.style.opacity = clamp(v * 3); c.style.scale = v <= 0 ? 0.6 : easeBack(clamp(v)) * 0.4 + 0.6; }); };
  },
  votes(p) {
    const max = Math.max(...p.rows.map(r => r.votes));
    const el = mk('votes', `<h4>💬 ${esc(p.title)}</h4>` + p.rows.map(r => `<div class="r"><span class="i">${r.icon}</span><span class="l">${esc(r.name)}</span><span class="bar"><i style="width:${r.votes / max * 100}%"></i></span><b>${r.votes}</b></div>`).join(''));
    const rows = [...el.querySelectorAll('.r')], bars = [...el.querySelectorAll('.bar i')];
    return lt => { show(el, pop(lt, 0.3)); rows.forEach((r, k) => { const v = pop(lt, 0.6 + k * 0.22, 0.25); r.style.opacity = clamp(v * 3); bars[k].style.scale = `${easeOut(clamp(v / 2))} 1`; }); };
  },
  rules(p) {
    const el = mk('rules', p.rows.map(r => `<div class="r"><span class="i">${r.icon}</span><span class="l">${esc(r.label)}${r.mid ? `<small>${esc(r.mid)}</small>` : ''}</span><b>${esc(r.amount)}</b></div>`).join(''));
    const rows = [...el.querySelectorAll('.r')];
    return lt => { show(el, pop(lt, p.at[0])); rows.forEach((r, k) => { const v = pop(lt, p.at[k], 0.25); r.style.opacity = clamp(v * 3); r.style.translate = v <= 0 ? '-30px 0' : `${-30 * (1 - easeOut(clamp(v)))}px 0`; }); };
  },
  cta(p) {
    const el = mk('cta', p.lines.map(l => `<div class="b">${esc(l)}</div>`).join('') + (p.note ? `<div class="note">${esc(p.note)}</div>` : ''));
    const kids = [...el.children];
    return lt => { el.style.display = 'block'; kids.forEach((c, k) => { const v = pop(lt, 1.0 + k * 0.45, 0.25); c.style.opacity = clamp(v * 3); c.style.scale = v <= 0 ? 0.7 : easeBack(clamp(v)) * 0.3 + 0.7; }); };
  },
};
const panelFns = ep.shots.map(s => s.panel ? PANELS[s.panel.kind](s.panel) : null);
const tagEls = ep.tags.map(t => { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<b>${esc(t.text)}</b>${t.sub ? `<br><span>${esc(t.sub)}</span>` : ''}`; $('#tags').append(d); return d; });
const ringEl = document.createElement('div'); ringEl.className = 'ring'; $('#tags').append(ringEl);
const capEl = $('#caption');
let capKey = null;

// ---------- camera ----------
const camPose = (sh, k, dir) => {
  const c = sh.cam;
  if (sh.cam2) {
    const d = sh.cam2, e = easeIO(k);
    return { x: lerp(c.x, d.x, e), y: lerp(c.y ?? 0, d.y ?? 0, e), z: lerp(c.z, d.z, e), dist: Math.exp(lerp(Math.log(c.dist), Math.log(d.dist), e)), pitch: lerp(c.pitch, d.pitch, e), yaw: lerp(c.yaw, d.yaw, e) };
  }
  return { x: c.x, y: c.y ?? 0, z: c.z, dist: c.dist * (1 - 0.07 * k), pitch: c.pitch, yaw: c.yaw + dir * 5 * k };
};
function cameraAt(t) {
  const i = Math.max(0, ep.shots.findIndex(s => t < s.t1)), s = ep.shots[i] ?? ep.shots.at(-1);
  let a = camPose(s, clamp((t - s.t0) / (s.t1 - s.t0)), i % 2 ? 1 : -1);
  const blend = Math.min(1.1, (s.t1 - s.t0) * 0.45);
  if (i > 0 && t - s.t0 < blend) {
    const b = camPose(ep.shots[i - 1], 1, (i - 1) % 2 ? 1 : -1), k = easeIO((t - s.t0) / blend);
    a = { x: lerp(b.x, a.x, k), y: lerp(b.y, a.y, k), z: lerp(b.z, a.z, k), dist: Math.exp(lerp(Math.log(b.dist), Math.log(a.dist), k)), pitch: lerp(b.pitch, a.pitch, k), yaw: lerp(b.yaw, a.yaw, k) };
  }
  const p = a.pitch * Math.PI / 180, y = a.yaw * Math.PI / 180;
  camera.position.set(a.x + a.dist * Math.sin(y) * Math.cos(p), a.y + a.dist * Math.sin(p), a.z + a.dist * Math.cos(y) * Math.cos(p));
  camera.lookAt(a.x, a.y, a.z);
  camera.near = Math.max(0.15, a.dist * 0.03); camera.far = a.dist * 6 + 3000; camera.updateProjectionMatrix();
  // keep the shadow map tight around whatever the shot is looking at
  const e = clamp(a.dist * 0.75, 10, 520);
  sun.target.position.set(a.x, 0, a.z); sun.position.set(a.x - e * 0.55, e * 1.25, a.z + e * 0.7);
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: e * 4 }); sun.shadow.camera.updateProjectionMatrix();
  return { i, s, a };
}
const toScreen = (x, y, z) => { V.set(x, y, z).project(camera); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H, V.z < 1]; };

// ---------- one frame ----------
function renderAt(t) {
  t = clamp(t, 0, ep.duration - 1e-4);
  const { i, s, a } = cameraAt(t), lt = t - s.t0;

  for (const b of live) {
    const k = (t - b.at) / 0.6;
    b.g.visible = k > 0;
    if (k > 0) { const kk = clamp(k); b.g.scale.set(easeOut(clamp(kk * 1.7)), Math.max(0.02, easeBack(kk)), easeOut(clamp(kk * 1.7))); }
  }
  for (const idx of liveTiles) setTile(idx, easeOut(clamp((t - tiles[idx].at) / 0.35)));
  for (const idx of liveCobbles) setCobble(idx, clamp((t - cobbles[idx].at) / 0.2));
  if (liveCobbles.length) cobble.instanceMatrix.needsUpdate = true;
  if (liveTiles.length) road.instanceMatrix.needsUpdate = walk.instanceMatrix.needsUpdate = dash.instanceMatrix.needsUpdate = true;

  const residents = track('residents', t), housing = track('housing', t), cash = track('cash', t);
  const homeless = Math.max(0, Math.round(residents) - Math.round(housing));

  const nWalk = !CROWD ? 0 : ep.cars === false ? Math.max(0, Math.round(residents) - 1 - folk.filter(o => o.p.at == null || t >= o.p.at).length) : Math.min(MAXW, Math.round(5 * Math.sqrt(residents))), nCamp = homeless > 0 ? Math.min(60, Math.ceil(homeless / perTent)) : 0;
  walkers.forEach((w, k) => {
    let x, z, sc = k < nWalk ? 1 : 0;
    if (k >= nWalk - nCamp && k < nWalk && campers[nWalk - 1 - k]) { // some of the crowd hangs around the camp
      const c = campers[nWalk - 1 - k]; x = c[0] + Math.sin(t * 0.7 + w.ph) * 3; z = c[1] + Math.cos(t * 0.6 + w.ph) * 3;
    } else {
      const len = w.st.x1 - w.st.x0, u = (w.ph * 7 + t * w.sp) % (2 * len);
      x = w.st.x0 + (u < len ? u : 2 * len - u); z = w.st.z + w.side * (4.3 + w.off);
    }
    const hop = Math.abs(Math.sin(t * 7 + w.ph)) * 0.16;
    M4.compose(V.set(x, 0.2 + hop, z), Q.identity(), S.set(sc, sc * w.h, sc));
    bodies.setMatrixAt(k, M4); heads.setMatrixAt(k, M4);
  });
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;

  cars.forEach((c, k) => {
    const len = c.st.x1 - c.st.x0 - 4, u = (c.ph * 9 + t * c.sp) % len;
    const x = c.dir > 0 ? c.st.x0 + 2 + u : c.st.x1 - 2 - u, edge = CROWD && ep.cars !== false ? clamp(Math.min(u, len - u) / 3) : 0;
    M4.compose(V.set(x, 0.1, c.st.z + c.dir * 1.9), Q.setFromAxisAngle(V.clone().set(0, 1, 0), c.dir > 0 ? 0 : Math.PI), S.setScalar(edge));
    carBody.setMatrixAt(k, M4); carTop.setMatrixAt(k, M4);
  });
  carBody.instanceMatrix.needsUpdate = carTop.instanceMatrix.needsUpdate = true;

  const nTents = homeless > 0 ? Math.min(MAXT, Math.ceil(homeless / perTent)) : 0;
  tentPos.forEach((p, k) => tents.setMatrixAt(k, M4.compose(V.set(p[0], 0, p[1]), Q.setFromAxisAngle(V.clone().set(0, 1, 0), p[2]), S.setScalar(k < nTents ? 1 : 0))));
  tents.instanceMatrix.needsUpdate = true;

  const act = s.actor ?? HERO_HOME, ak = clamp(lt / (s.t1 - s.t0));
  hero.position.set(act.to ? lerp(act.x, act.to.x, ak) : act.x, 0, act.to ? lerp(act.z, act.to.z, ak) : act.z);
  hero.rotation.y = act.ry ?? 0;
  hero.pose(t, act.anim, act);
  for (const { p, f, ph } of folk) {
    const k = p.at == null ? 1 : (t - p.at) / 0.35;
    f.visible = k > 0; if (k <= 0) continue;
    f.scale.setScalar(easeBack(clamp(k)));
    const fresh = p.at != null && t - p.at < 1.8;
    f.pose(t + ph, s.type === 'outro' ? 'wave' : fresh ? 'cheer' : 'idle', {});
  }

  renderer.render(scene, camera);

  // HUD
  $('#v-cash').textContent = money(cash);
  $('.pill.cash').classList.toggle('flash', cash < track('cash', t - 0.08) - 0.5);
  $('#v-res').textContent = fmt(residents);
  $('#v-home').textContent = `${fmt(Math.min(residents, housing))} / ${fmt(housing)}`;
  $('#homes').classList.toggle('warn', homeless > 0);
  const hk = ep.homesFrom == null ? 1 : clamp((t - ep.homesFrom) / 0.3);
  $('#homes').style.display = hk > 0 ? 'flex' : 'none'; $('#homes').style.scale = 0.7 + 0.3 * easeBack(hk);
  const pk = s.hudPulse === 'cash' ? Math.sin(Math.PI * clamp((lt - 0.4) / 1.6)) : 0;
  $('.pill.cash').style.scale = 1 + 0.16 * pk; $('.pill.cash').classList.toggle('glow', pk > 0.05);
  $('#v-tents').textContent = homeless > 0 ? `⛺ ${fmt(homeless)} ${ep.hud.tents}` : housing - residents >= 1 ? `${fmt(housing - residents)} ${ep.hud.free}` : ep.hud.full;

  panelFns.forEach((fn, k) => { if (!fn) return; if (k === i) fn(lt); else fn(-1); });
  ep.tags.forEach((g, k) => {
    const el = tagEls[k], on = t >= g.t0 && t < g.t1;
    if (!on) { el.style.display = 'none'; return; }
    const [x, y] = toScreen(g.x, g.y, g.z);
    el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.scale = easeBack(clamp((t - g.t0) / 0.3)) * 0.4 + 0.6;
  });
  if (s.ring && lt > 0.9) {
    const [x, y] = toScreen(s.ring.x, 0, s.ring.z), [x2] = toScreen(s.ring.x + s.ring.r, 0, s.ring.z);
    const rp = Math.max(46, Math.abs(x2 - x)) * (1.6 - 0.6 * easeOut(clamp((lt - 0.9) / 0.5))) * (1 + 0.04 * Math.sin(t * 8));
    Object.assign(ringEl.style, { display: 'block', left: x + 'px', top: y + 'px', width: rp * 2 + 'px', height: rp * 2 * Math.sin(a.pitch * Math.PI / 180) + 'px', opacity: clamp((lt - 0.9) * 4) });
  } else ringEl.style.display = 'none';

  // captions appear word by word, like a narrator speaking them
  const cap = s.captions.find(c => t >= c.t0 && t < c.t1);
  const key = cap ? cap.t0 : null;
  if (key !== capKey) {
    capKey = key;
    capEl.innerHTML = cap ? cap.lines.map(l => '<div>' + [...l.matchAll(/\*([^*]+)\*|([^*]+)/g)].flatMap(m => (m[1] ?? m[2]).split(/\s+/).filter(Boolean)
      .map(w => m[1] != null ? `<em class="w">${esc(w)}</em>` : `<span class="w">${esc(w)}</span>`)).join(' ') + '</div>').join('') : '';
    const longest = cap ? Math.max(...cap.lines.map(l => l.replace(/\*/g, '').length)) : 0;
    capEl.style.fontSize = (longest > 27 ? 27 : longest > 22 ? 32 : longest > 18 ? 37 : 42) + 'px';
  }
  if (cap) {
    // with a narrator, each word appears when it is spoken (estimated from its length)
    const words = [...capEl.querySelectorAll('.w')], lens = words.map(w => w.textContent.length + 1), total = lens.reduce((x, y) => x + y, 0);
    const span = cap.speech ? cap.speech * 0.92 : Math.min(0.3 * words.length, (cap.t1 - cap.t0) * 0.55);
    let acc = 0; const at = lens.map(l => { const v = acc / total * span; acc += l; return v; });
    words.forEach((w, k) => { const v = clamp((t - cap.t0 - at[k]) / 0.12); w.style.opacity = clamp(v * 2); w.style.scale = v <= 0 ? 0.5 : 0.5 + 0.5 * easeBack(v); });
  }
}

window.renderAt = renderAt;
window.DURATION = ep.duration;
renderAt(0);
window.READY = true;

// ---------- live preview ----------
if (!CAPTURE) {
  let t = 0, playing = true, last = performance.now();
  const seek = $('#seek'), clock = $('#clock'), btn = $('#play');
  btn.onclick = () => { playing = !playing; btn.textContent = playing ? '⏸' : '▶'; };
  seek.oninput = () => { t = seek.value * ep.duration; };
  addEventListener('keydown', e => { if (e.code === 'Space') btn.onclick(); });
  (function loop(nowMs) {
    const dt = (nowMs - last) / 1000; last = nowMs;
    if (playing) { t += Math.min(dt, 0.1); if (t >= ep.duration) t = 0; seek.value = t / ep.duration; }
    renderAt(t); clock.textContent = `${t.toFixed(1)} / ${ep.duration}s`;
    requestAnimationFrame(loop);
  })(last);
}
