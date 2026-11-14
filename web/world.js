// Procedural low-poly models. Every building is one merged, vertex-coloured
// mesh (plus an optional sign), so even a big city stays cheap to draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const C = new THREE.Color();

export function rng(seed) {
  let a = (seed >>> 0) + 0x9e3779b9;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function finish(g, col) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  C.set(col);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Collects coloured primitives; y is always the bottom of the primitive. */
export class Parts {
  constructor() { this.g = []; }
  add(g, col, x, y, z, ry = 0) { if (ry) g.rotateY(ry); g.translate(x, y, z); this.g.push(finish(g, col)); return this; }
  box(w, h, d, col, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return this.add(g, col, x, y, z, ry); }
  cyl(r1, r2, h, col, x = 0, y = 0, z = 0, seg = 10) { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(0, h / 2, 0); return this.add(g, col, x, y, z); }
  ball(r, col, x = 0, y = 0, z = 0) { return this.add(new THREE.IcosahedronGeometry(r, 1), col, x, y + r, z); }
  /** Gable roof: ridge runs along x. */
  gable(w, h, d, col, x = 0, y = 0, z = 0, ry = 0) {
    const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    return this.add(g, col, x, y, z, ry);
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.g), MAT);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

const GLASS = '#7fb6d9', GLASS_D = '#3f6f96', DARK = '#2a3040', WHITE = '#f6f3ea', CONCRETE = '#c9c6bd';
const shade = (col, k) => '#' + C.set(col).multiplyScalar(k).getHexString();

// ---------- signs ----------
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
export function signMesh(sign, w = 8, h = 2) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#171c33'; roundRect(c, 0, 0, 512, 128, 22); c.fill();
  c.strokeStyle = '#ffc93c'; c.lineWidth = 6; roundRect(c, 5, 5, 502, 118, 18); c.stroke();
  c.textBaseline = 'middle';
  c.font = '64px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  c.fillText(sign.icon ?? '', 22, 68);
  const fit = (txt, px, weight, maxW) => { do { c.font = `${weight} ${px}px "Baloo 2", sans-serif`; px -= 2; } while (c.measureText(txt).width > maxW && px > 14); };
  c.fillStyle = '#fff8e7'; fit(sign.name, 50, 800, 380); c.fillText(sign.name, 112, sign.handle ? 46 : 66);
  if (sign.handle) { c.fillStyle = '#ffc93c'; fit(sign.handle, 34, 700, 380); c.fillText(sign.handle, 112, 92); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

// ---------- housing ----------
const HOUSE_WALL = ['#f4e3c1', '#f7efe2', '#e9d3b4', '#dfe9ef', '#f3d9cf'];
const HOUSE_ROOF = ['#c2553f', '#8f4a3a', '#5d7d9a', '#7a8b52', '#a8623a'];
function house(p, r) {
  const wall = HOUSE_WALL[r() * 5 | 0], roof = HOUSE_ROOF[r() * 5 | 0];
  p.box(8, 3.6, 6.5, wall, 0, 0, 0).gable(8.8, 3, 7.4, roof, 0, 3.6, 0);
  p.box(1.3, 2.3, 0.2, shade(roof, 0.7), 0, 0, 3.3).box(1.5, 1.3, 0.2, GLASS, -2.5, 1.4, 3.3).box(1.5, 1.3, 0.2, GLASS, 2.5, 1.4, 3.3);
  p.box(0.9, 2.2, 0.9, shade(wall, 0.8), 2.4, 4.2, -1);
  p.box(10, 0.15, 3, '#d8cdb4', 0, 0, 5); // front yard
  p.ball(0.9, '#4f9a4c', -4.6, 0, 4.6).ball(0.7, '#5fae58', 4.6, 0, 5.2);
}
function slab(p, w, d, floors, body, x = 0, z = 0, fh = 2.3) {
  p.box(w, floors * fh + 1.2, d, body, x, 0, z);
  for (let f = 0; f < floors; f++) p.box(w + 0.12, 1.0, d + 0.12, f % 2 ? GLASS : GLASS_D, x, 1.5 + f * fh, z);
  for (const sx of [-1, 1]) p.box(0.5, floors * fh + 1.2, d + 0.2, body, x + sx * (w / 2 - 0.25), 0, z);
  p.box(0.6, floors * fh + 1.2, d + 0.2, body, x, 0, z);
  const top = floors * fh + 1.2;
  p.box(w + 0.5, 0.45, d + 0.5, shade(body, 0.85), x, top, z);
  p.box(2, 1.1, 2, shade(body, 0.75), x + w / 4, top + 0.45, z - d / 5).box(1.2, 0.7, 1.6, '#8b93a1', x - w / 4, top + 0.45, z + d / 6);
  p.box(2.2, 2.2, 0.2, DARK, x, 0, z + d / 2 + 0.05);
  return top;
}
const BODY = ['#e7e2d6', '#d9d4c8', '#e6d9c6', '#d5dce2'];
function block(p, r) { slab(p, 12, 10, 5, BODY[r() * 4 | 0]); p.box(13, 0.12, 3, '#cfc9bb', 0, 0, 6.4); }
function tower(p, r) { slab(p, 10, 10, 12 + (r() * 5 | 0), BODY[r() * 4 | 0]); p.box(13, 0.12, 3, '#cfc9bb', 0, 0, 6.4); }
function mega(p, r, scale = 1) {
  const col = ['#4d7fb5', '#3f8f9c', '#5a6fb8'][r() * 3 | 0], n = Math.round(22 * scale), fh = 2.4;
  let w = 12, y = 0;
  for (let tier = 0; tier < 3; tier++) {
    const f = Math.round(n * [0.5, 0.3, 0.2][tier]);
    p.box(w, f * fh, w, col, 0, y, 0);
    for (let k = 0; k < f; k++) p.box(w + 0.1, 0.35, w + 0.1, '#dfeaf2', 0, y + k * fh + 2, 0);
    for (const s of [-1, 1]) p.box(0.5, f * fh, w + 0.2, '#e9eef2', s * (w / 2 - 0.2), y, 0);
    y += f * fh; w -= 2.4;
  }
  p.box(w + 1, 0.6, w + 1, '#e9eef2', 0, y, 0).cyl(0.18, 0.3, 9 * scale, '#e9eef2', 0, y + 0.6, 0, 6).ball(0.5, '#ff5a4d', 0, y + 0.6 + 9 * scale, 0);
  p.box(13.5, 0.14, 13.5, '#cfc9bb', 0, 0, 0);
}

// ---------- commerce ----------
function shop(p, b) {
  const col = b.style.color;
  p.box(11, 5.6, 8, '#f3ecdd', 0, 0, 0).box(11.5, 0.5, 8.5, shade(col, 0.8), 0, 5.6, 0);
  p.box(11, 1.9, 0.3, col, 0, 3.7, 4.0);                     // fascia behind the sign
  p.box(6.4, 2.3, 0.2, GLASS, -1.6, 0.6, 4.05).box(1.7, 2.7, 0.2, shade(col, 0.6), 3.6, 0, 4.05);
  for (let k = 0; k < 8; k++) p.box(11 / 8, 0.28, 2.3, k % 2 ? WHITE : col, -5.5 + (k + 0.5) * 11 / 8, 3.25, 5.2);
  p.box(1.6, 1.0, 1.6, '#8b93a1', -3, 6.1, -1.5);
  p.box(13, 0.12, 3.2, '#d6d0c2', 0, 0, 6);
  p.box(1.2, 0.7, 0.9, '#7a5a3c', -4.2, 0.12, 6.4).ball(0.6, '#58a856', -4.2, 0.7, 6.4);
}
const FEATURES = {
  siren(p, col) { p.box(1.6, 0.6, 0.8, '#3d6fd6', -0.9, 8, 0).box(1.6, 0.6, 0.8, '#e84a3b', 0.9, 8, 0); for (const x of [-4.2, 4.2]) p.box(2.2, 1.1, 4, '#f6f3ea', x, 0.4, 7.6).box(2.2, 0.5, 1.6, '#3d6fd6', x, 1.5, 7.6); },
  garage(p, col) { for (const x of [-3.6, 0, 3.6]) p.box(3, 3.4, 0.25, '#f3ecdd', x, 0, 4.6); p.box(2.6, 12, 2.6, shade(col, 0.9), 5.2, 0, -2.5).box(3.1, 0.5, 3.1, WHITE, 5.2, 12, -2.5); p.box(3, 1.6, 5, '#e23d2f', -3.6, 0.4, 7.4).box(3, 1.2, 1.6, WHITE, -3.6, 2, 8.9); },
  cross(p) { p.box(4.6, 0.3, 1.4, '#e23d2f', 0, 7.55, 0).box(1.4, 0.3, 4.6, '#e23d2f', 0, 7.56, 0); p.box(4, 3.2, 3, WHITE, 0, 0, 5.4).box(4.6, 0.4, 3.6, '#e23d2f', 0, 3.2, 5.4); p.box(4.4, 1.4, 2.2, WHITE, 4.6, 0.4, 7.6).box(4.5, 0.4, 2.3, '#e23d2f', 4.6, 1.1, 7.6); },
  clock(p, col) { p.gable(5, 2.4, 9.4, shade(col, 0.7), 0, 7.5, 0, Math.PI / 2); p.box(1.7, 1.7, 0.3, WHITE, 0, 7.7, 4.6); p.box(13, 0.12, 4, '#c9b79a', 0, 0, 6.6); for (const x of [-4.6, 4.6]) p.cyl(0.25, 0.25, 2.2, '#7a5a3c', x, 0, 7).ball(1.2, '#5aa856', x, 1.8, 7); },
  columns(p, col) { for (const x of [-4.2, -1.4, 1.4, 4.2]) p.cyl(0.5, 0.55, 6.4, WHITE, x, 0.5, 5.2, 10); p.box(11.6, 0.5, 2.4, WHITE, 0, 0, 5.2).gable(11.6, 2.2, 2.6, WHITE, 0, 6.9, 5.2).box(11.6, 0.5, 2.6, WHITE, 0, 6.5, 5.2); },
  cars(p) { p.box(11.4, 3.2, 0.2, GLASS, 0, 0.4, 4.6); const cols = ['#f2c230', '#f2c230', '#e9eef2', '#31384a']; for (let k = 0; k < 4; k++) p.box(1.9, 0.9, 3.6, cols[k], -4.5 + k * 3, 0.35, 8).box(1.7, 0.7, 1.8, DARK, -4.5 + k * 3, 1.25, 7.8); p.box(13.5, 0.1, 5.6, '#565c69', 0, 0.02, 7.9); },
  kennel(p) { for (const x of [-4.6, -1.5, 1.6, 4.7]) p.box(2, 1.3, 2, '#f3ecdd', x, 0, 7.8).gable(2.3, 1, 2.4, '#c2553f', x, 1.3, 7.8); for (const x of [-6.4, 6.4]) p.box(0.2, 1.1, 5, '#a9825a', x, 0, 7.4); p.box(13, 1.1, 0.2, '#a9825a', 0, 0, 9.9); for (const [x, c] of [[-3, '#c79a5e'], [0.2, '#3a3028'], [3.2, '#e8dcc4']]) p.box(1, 0.6, 0.45, c, x, 0.3, 9).box(0.45, 0.45, 0.45, c, x + 0.6, 0.75, 9); },
  fields(p) { p.gable(12.4, 3.4, 9.6, '#7c2d20', 0, 7.5, 0); for (let k = 0; k < 4; k++) p.box(2.6, 0.35, 4.6, k % 2 ? '#7b9a3a' : '#c9a23c', -4.8 + k * 3.2, 0, 8); p.cyl(1.5, 1.5, 9, '#d8d2c4', 5.6, 0, -2.6).ball(1.5, '#b5442e', 5.6, 8, -2.6); },
  antenna(p) { p.cyl(0.15, 0.4, 11, '#e9eef2', 3, 7.5, 0, 6).ball(0.45, '#ff5a4d', 3, 18.4, 0); for (const y of [11, 14, 17]) p.box(2.4, 0.15, 0.15, '#e9eef2', 3, y, 0); p.cyl(1.6, 0.3, 0.9, WHITE, -3, 7.5, 0, 12); },
  marquee(p, col) { p.box(9, 0.6, 3, WHITE, 0, 3.4, 5.6); for (let k = 0; k < 7; k++) p.ball(0.28, '#ffd24a', -3.9 + k * 1.3, 2.9, 7); p.box(1.6, 5, 0.6, '#ffd24a', -5.2, 4, 4.8); },
};
function civic(p, b) {
  const col = b.style.color, f = b.style.feature;
  p.box(13, 7.5, 9, col, 0, 0, 0).box(13.5, 0.5, 9.5, shade(col, 0.75), 0, 7.5, 0);
  if (f !== 'garage' && f !== 'cars' && f !== 'columns') {
    for (const x of [-4.6, 4.6]) p.box(2.4, 1.6, 0.2, GLASS, x, 1.2, 4.55);
    p.box(2.2, 2.9, 0.2, DARK, 0, 0, 4.55);
  }
  if (f !== 'columns') for (const x of [-4.6, -1.5, 1.6, 4.7]) p.box(2, 1.2, 0.2, GLASS, x, 2 + 2.6, 4.55);
  FEATURES[f]?.(p, col);
  p.cyl(0.08, 0.08, 4, WHITE, -5.8, 8, -3.5, 5).box(1.8, 1.1, 0.08, '#ffc93c', -4.85, 10.8, -3.5);
}
function townhall(p) {
  const wall = '#f1e6cc', roof = '#2f6f8f';
  p.box(22, 8, 10, wall, 0, 0, 0).gable(23, 3.4, 11, roof, 0, 8, 0);
  p.box(5.5, 15, 5.5, wall, 0, 0, 1.5).box(6.2, 0.5, 6.2, WHITE, 0, 15, 1.5);
  p.add(new THREE.ConeGeometry(4.2, 5, 4).rotateY(Math.PI / 4).translate(0, 2.5, 0), roof, 0, 15.5, 1.5);
  p.add(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 20).rotateX(Math.PI / 2), WHITE, 0, 12.2, 4.3);
  p.box(0.18, 1.2, 0.1, DARK, 0, 12.2, 4.5).box(0.9, 0.18, 0.1, DARK, 0.4, 12.15, 4.5);
  for (const x of [-9, -6.3, 6.3, 9]) p.cyl(0.45, 0.5, 7, WHITE, x, 0.5, 5.6).box(1.9, 2.2, 0.2, GLASS_D, x < 0 ? x + 1.35 : x - 1.35, 3.6, 5.05);
  p.box(22, 0.5, 2, WHITE, 0, 7.5, 5.6).box(22, 0.5, 2, '#d9cfb8', 0, 0, 5.6).box(3, 3.6, 0.3, '#7a4a2e', 0, 0.5, 4.4);
  p.cyl(0.08, 0.08, 4, WHITE, 0, 20.5, 1.5, 5).box(2.2, 1.3, 0.08, '#ffc93c', 1.15, 23, 1.5);
  p.box(30, 0.12, 16, '#dcd3bf', 0, 0, -1.3);               // plaza
  for (const x of [-13, 13]) p.cyl(1.3, 1.5, 0.6, '#b8b2a4', x, 0.12, 4.6, 12).ball(1, '#58a856', x, 0.6, 4.6);
}

// ---------- landmarks ----------
function stadium(p) {
  p.box(46, 0.3, 30, '#4f9d4a', 0, 0, 0);
  for (let k = -3; k <= 3; k++) p.box(3.2, 0.32, 30, k % 2 ? '#58aa52' : '#4f9d4a', k * 6.4, 0, 0);
  p.box(0.4, 0.34, 30, WHITE, 0, 0, 0).box(46, 0.34, 0.4, WHITE, 0, 0, 15).box(46, 0.34, 0.4, WHITE, 0, 0, -15);
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * Math.PI * 2, x = Math.cos(a) * 34, z = Math.sin(a) * 25;
    const g = new THREE.BoxGeometry(9, 9 + 3 * Math.abs(Math.sin(a)), 7); g.translate(0, 4.5, 0);
    p.add(g, k % 2 ? '#e9eef2' : '#3d6fd6', x, 0, z, -a + Math.PI / 2);
  }
  for (const [x, z] of [[-34, -25], [34, -25], [-34, 25], [34, 25]]) p.cyl(0.5, 0.7, 22, '#c9c6bd', x * 1.08, 0, z * 1.12, 6).box(4, 2, 1, '#fff6c9', x * 1.08, 22, z * 1.12);
}
function funfair(p) {
  p.cyl(30, 30, 0.2, '#d9c9a3', 0, 0, 0, 28);
  const hub = 22;
  for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(1, 25, 1).rotateZ(s * 0.32), '#e9eef2', s * 4, 10, -6).add(new THREE.BoxGeometry(1, 25, 1).rotateZ(s * 0.32), '#e9eef2', s * 4, 10, -3); }
  p.add(new THREE.TorusGeometry(17, 0.5, 6, 32), '#ff5a7a', 0, hub, -4.5).add(new THREE.TorusGeometry(12, 0.3, 6, 28), '#ffd24a', 0, hub, -4.5);
  const cols = ['#ffd24a', '#3d6fd6', '#46a36a', '#ff5a7a', '#8a6fb8', '#f08a24'];
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    p.add(new THREE.BoxGeometry(34, 0.25, 0.25).rotateZ(a), '#e9eef2', 0, hub, -4.5);
    p.box(2.6, 2.4, 2.6, cols[k % 6], Math.cos(a) * 17, hub + Math.sin(a) * 17 - 2.6, -4.5);
  }
  p.cyl(8, 8, 1, '#ff5a7a', -15, 0.2, 12, 14).add(new THREE.ConeGeometry(9, 5, 14), '#ffd24a', -15, 8, 12);
  for (let k = 0; k < 8; k++) p.cyl(0.15, 0.15, 4.5, WHITE, -15 + Math.cos(k * 0.785) * 6.5, 1.2, 12 + Math.sin(k * 0.785) * 6.5, 5);
  for (const [x, z, c] of [[12, 14, '#3d6fd6'], [19, 6, '#46a36a'], [6, 20, '#f08a24']]) {
    p.box(5, 3, 4, WHITE, x, 0.2, z);
    p.add(new THREE.ConeGeometry(4.4, 3, 4).rotateY(Math.PI / 4), c, x, 4.7, z);
  }
}
function harbor(p) {
  p.box(70, 1.2, 14, '#b9b3a6', 0, 0, -8);
  for (const x of [-22, 0, 22]) { p.box(6, 1, 34, '#a9825a', x, 0.2, 14); for (const z of [2, 14, 26]) p.cyl(0.5, 0.5, 2.4, '#6e5236', x - 3, -0.4, z, 6).cyl(0.5, 0.5, 2.4, '#6e5236', x + 3, -0.4, z, 6); }
  const cols = ['#e2523a', '#3d6fd6', '#46a36a', '#f2c230', '#e9eef2'];
  for (let k = 0; k < 14; k++) p.box(5.6, 2.4, 2.4, cols[k % 5], -30 + (k % 7) * 6.2, 1.2 + Math.floor(k / 7) * 2.4, -10);
  p.box(1.4, 16, 1.4, '#f08a24', 26, 1.2, -6).box(18, 1.2, 1.4, '#f08a24', 20, 16, -6).box(2.4, 2.4, 2.4, '#31384a', 26, 17.2, -6);
  p.box(9, 3.2, 26, '#2d3a55', 11, -0.6, 16).box(9, 1, 26, '#e23d2f', 11, -1, 16).box(7, 4.6, 7, WHITE, 11, 2.6, 7).box(5, 2, 4, GLASS_D, 11, 7.2, 7);
  for (let k = 0; k < 4; k++) p.box(5.6, 2.2, 2.4, cols[(k + 1) % 5], 11, 2.6, 14 + k * 3.4);
  p.box(2.4, 1.2, 6, WHITE, -11, 0, 12).box(0.15, 6, 0.15, '#7a5a3c', -11, 1.2, 12).add(new THREE.ConeGeometry(2.4, 5, 3).rotateY(0.5), WHITE, -11, 4.6, 12.6);
  p.cyl(1.6, 2.2, 13, WHITE, -32, 1.2, -6, 10).cyl(1.7, 1.7, 1.6, '#e23d2f', -32, 7, -6, 10).cyl(1.3, 1.3, 2, '#ffe9a6', -32, 14.2, -6, 10).add(new THREE.ConeGeometry(1.9, 2, 10), '#e23d2f', -32, 17.2, -6);
}
function airport(p) {
  p.box(110, 0.25, 12, '#4a4f5c', 0, 0, 16);
  for (let k = -6; k <= 6; k++) p.box(5, 0.27, 0.6, WHITE, k * 8, 0, 16);
  p.box(12, 0.25, 22, '#565c69', 10, 0, 0).box(60, 0.25, 16, '#6a7080', 0, 0, -8);
  p.box(44, 6, 10, '#e9eef2', 0, 0, -18).box(44.2, 3, 10.2, GLASS, 0, 1.4, -18).box(46, 0.6, 12, '#3d6fd6', 0, 6, -18);
  p.cyl(1.6, 2.2, 18, '#d9d4c8', 30, 0, -18, 10).cyl(3.4, 2.4, 2.6, GLASS_D, 30, 18, -18, 10).cyl(3.6, 3.6, 0.4, WHITE, 30, 20.6, -18, 10);
  const plane = (x, z, ry, col) => {
    const add = (g, c, dx, y, dz) => { g.rotateY(ry); const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); p.add(g, c, x + v.x, y, z + v.z); };
    add(new THREE.CapsuleGeometry(1.5, 12, 4, 10).rotateZ(Math.PI / 2), WHITE, 0, 3, 0);
    add(new THREE.BoxGeometry(3.4, 0.3, 17), col, 0.5, 2.7, 0);
    add(new THREE.BoxGeometry(2, 0.25, 6.5), col, -6.6, 3.4, 0);
    add(new THREE.BoxGeometry(2.6, 3.4, 0.3), col, -6.6, 5, 0);
  };
  plane(-18, -6, Math.PI / 2, '#e2523a'); plane(2, -6, Math.PI / 2, '#3d6fd6'); plane(-30, 16, 0, '#46a36a');
}

const BUILD = {
  house: (p, b, r) => house(p, r), block: (p, b, r) => block(p, r), tower: (p, b, r) => tower(p, r),
  mega: (p, b, r) => mega(p, r, 1), arco: (p, b, r) => mega(p, r, 1.9),
  shop: (p, b) => shop(p, b), civic: (p, b) => civic(p, b), townhall: p => townhall(p), cottage: p => cottage(p), sign: () => {},
  stadium: p => stadium(p), funfair: p => funfair(p), harbor: p => harbor(p), airport: p => airport(p),
};

export function buildingMesh(b) {
  const p = new Parts();
  (BUILD[b.type] ?? BUILD.house)(p, b, rng(b.seed ?? b.id));
  const g = new THREE.Group();
  const back = { civic: -3.2, shop: -1.5, house: -1, block: -1.5, tower: -1.5 }[b.type] ?? 0;
  if (p.g.length) { const body = p.mesh(); body.position.z = back; g.add(body); } // sit back from the pavement
  if (b.type === 'sign') g.add(villageSign(b.text));
  else if (b.sign) {
    const s = b.type === 'shop' ? signMesh(b.sign, 9.6, 1.75) : signMesh(b.sign, 9.6, 1.9);
    if (b.type === 'shop') s.position.set(0, 4.65, 4.2);
    else if (b.type === 'house') { s.scale.setScalar(0.5); s.position.set(0, 2.75, 3.45); }
    else if (b.style?.feature === 'columns') s.position.set(0, 4.3, 6.5);
    else s.position.set(0, 6.35, 4.62);
    s.position.z += back;
    g.add(s);
  }
  g.position.set(b.x, 0, b.z);
  if (b.ry) g.rotation.y = b.ry;
  return g;
}


// ---------- the founder's cottage ----------
function cottage(p) {
  const W = 9, D = 7, H = 3.9, wall = '#f6ecd6', beam = '#6b4a33', roof = '#c9553c', shutter = '#3f7d6e';
  p.cyl(9.5, 9.8, 0.08, '#e6d6ad', 0, 0, 1.2, 18);                        // sandy plot
  p.box(W + 0.4, 0.55, D + 0.4, '#a9a39a', 0, 0, 0);                      // stone base
  p.box(W, H - 0.55, D, wall, 0, 0.55, 0);
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) p.box(0.32, H - 0.55, 0.32, beam, x, 0.55, z);
  for (const z of [-D / 2 - 0.02, D / 2 + 0.02]) p.box(W + 0.1, 0.26, 0.12, beam, 0, 2.2, z).box(W + 0.1, 0.26, 0.12, beam, 0, H - 0.2, z);
  for (const x of [-W / 2 - 0.02, W / 2 + 0.02]) p.box(0.12, 0.26, D + 0.1, beam, x, 2.2, 0);
  // roof with tile rows
  const rh = 3.5, half = D / 2 + 0.7, ang = Math.atan2(rh, half), len = Math.hypot(rh, half);
  p.gable(W + 1.2, rh, D + 1.4, roof, 0, H, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const f = (k + 0.5) / 6, g = new THREE.BoxGeometry(W + 1.3, 0.1, len / 6 * 0.55);
    g.rotateX(s * ang);
    p.add(g, k % 2 ? '#b8452f' : '#d9654a', 0, H + rh * f + 0.05 * Math.cos(ang), s * half * (1 - f) + s * 0.05 * Math.sin(ang));
  }
  p.box(W + 1.3, 0.25, 0.35, '#9e3a28', 0, H + rh - 0.12, 0);              // ridge
  p.box(1, 2.6, 1, '#9b5a45', 2.6, H + 1.2, -1.4).box(1.2, 0.2, 1.2, '#5b5650', 2.6, H + 3.8, -1.4);
  // front: door, windows, shutters, flower boxes
  const fz = D / 2 + 0.06;
  p.box(1.5, 2.45, 0.14, '#7a4a2e', 0, 0.55, fz).box(0.5, 0.5, 0.16, '#bfe3f2', 0, 2.2, fz).box(0.14, 0.14, 0.2, '#e8c35a', 0.5, 1.6, fz + 0.05);
  p.box(1.8, 0.6, 0.15, '#f3efe6', 0, 0, fz + 0.75).box(2.4, 0.3, 1.5, '#a9a39a', 0, 0, fz + 0.75);
  p.add(new THREE.BoxGeometry(2.2, 0.12, 1.1).rotateX(0.35), '#c9553c', 0, 3.25, fz + 0.45);
  for (const x of [-2.75, 2.75]) {
    p.box(1.7, 1.45, 0.12, '#f3efe6', x, 1.25, fz).box(1.4, 1.2, 0.14, '#9fd0ea', x, 1.37, fz);
    p.box(0.08, 1.2, 0.18, '#f3efe6', x, 1.37, fz).box(1.4, 0.08, 0.18, '#f3efe6', x, 1.93, fz);
    for (const sx of [-1, 1]) p.box(0.55, 1.45, 0.1, shutter, x + sx * 1.15, 1.25, fz + 0.04);
    p.box(1.8, 0.35, 0.45, '#8a5a3a', x, 1.0, fz + 0.25);
    for (let k = 0; k < 4; k++) p.ball(0.17, ['#e8485a', '#ffd24a', '#ff8fb1', '#e8485a'][k], x - 0.6 + k * 0.4, 1.3, fz + 0.27);
    p.box(1.1, 0.95, 0.12, '#f3efe6', x, 2.65, fz).box(0.85, 0.75, 0.14, '#9fd0ea', x, 2.75, fz);
  }
  // side windows
  for (const sx of [-1, 1]) p.box(0.14, 1.2, 1.3, '#9fd0ea', sx * (W / 2 + 0.03), 1.4, 0).box(0.1, 1.45, 0.5, shutter, sx * (W / 2 + 0.06), 1.25, 0.95).box(0.1, 1.45, 0.5, shutter, sx * (W / 2 + 0.06), 1.25, -0.95);
  // garden bits
  p.ball(0.8, '#5aa856', -5.6, 0, 3.2).ball(0.6, '#6dbb5f', -6.2, 0, 2.2).ball(0.7, '#5aa856', 5.8, 0, 3);
  p.box(1.2, 0.8, 0.8, '#8a5a3a', 6.3, 0, -2).box(1, 0.1, 0.6, '#6dbb5f', 6.3, 0.8, -2);
}

/** The yellow "Welcome to …" board at the edge of town. */
export function villageSign(text) {
  const g = new THREE.Group(), p = new Parts();
  for (const x of [-2.3, 2.3]) p.box(0.25, 3.2, 0.25, '#6b6f78', x, 0, 0);
  p.box(5.6, 2.1, 0.22, '#1d2233', 0, 1.9, 0).box(5.2, 1.7, 0.26, '#f5c518', 0, 2.1, 0);
  g.add(p.mesh());
  const cv = document.createElement('canvas'); cv.width = 520; cv.height = 170;
  const c = cv.getContext('2d');
  c.fillStyle = '#f5c518'; c.fillRect(0, 0, 520, 170);
  c.strokeStyle = '#1d2233'; c.lineWidth = 8; c.strokeRect(14, 14, 492, 142);
  c.fillStyle = '#1d2233'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let px = 96; do { c.font = `800 ${px}px "Baloo 2", sans-serif`; px -= 4; } while (c.measureText(text).width > 450);
  c.fillText(text, 260, 92);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.7), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(0, 2.95, side * 0.14); if (side < 0) m.rotation.y = Math.PI; g.add(m);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

/**
 * The founder: a chunky low-poly character with jointed arms and legs.
 * pose(t, anim) animates him: 'idle', 'wave', 'walk', 'look'.
 */
export function characterFigure(o = {}) {
  const SKIN = o.skin ?? '#f1c6a0', HOOD = o.hood ?? '#f2b632', PANTS = o.pants ?? '#3e5a8a', SHOE = '#5a3a26', HAT = o.hat ?? '#2f9c95', HAIR = o.hair ?? '#6b4a33';
  const ACC = '#' + new THREE.Color(HOOD).multiplyScalar(0.85).getHexString(), HATB = '#' + new THREE.Color(HAT).multiplyScalar(0.8).getHexString();
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mesh = p => { const m = p.mesh(); return m; };
  const torso = new Parts()
    .cyl(0.36, 0.44, 0.85, HOOD, 0, 0.95, 0, 12)
    .add(new THREE.TorusGeometry(0.3, 0.09, 6, 14).rotateX(Math.PI / 2), ACC, 0, 1.78, -0.02)
    .box(0.42, 0.22, 0.06, ACC, 0, 1.15, 0.38)
    .cyl(0.13, 0.15, 0.16, SKIN, 0, 1.78, 0, 8);
  body.add(mesh(torso));
  const head = new THREE.Group(); head.position.set(0, 1.92, 0); body.add(head);
  const hp = new Parts().ball(0.36, SKIN, 0, -0.02, 0)
    .add(new THREE.SphereGeometry(0.39, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), HAT, 0, 0.47, -0.03)
    .cyl(0.4, 0.4, 0.12, HATB, 0, 0.45, -0.03, 14).ball(0.1, '#f3efe6', 0, 0.84, -0.03)
    .ball(0.2, HAIR, 0, 0.36, -0.2)
    .ball(0.048, '#1d2233', -0.12, 0.3, 0.31).ball(0.048, '#1d2233', 0.12, 0.3, 0.31)
    .ball(0.016, '#ffffff', -0.105, 0.36, 0.355).ball(0.016, '#ffffff', 0.135, 0.36, 0.355)
    .box(0.12, 0.028, 0.03, '#5a3a26', -0.12, 0.42, 0.33).box(0.12, 0.028, 0.03, '#5a3a26', 0.12, 0.42, 0.33)
    .ball(0.042, '#e6a988', 0, 0.2, 0.35).add(new THREE.TorusGeometry(0.07, 0.016, 4, 10, Math.PI).rotateZ(Math.PI), '#a8584a', 0, 0.12, 0.34)
    .ball(0.045, '#f3b3a3', -0.2, 0.17, 0.29).ball(0.045, '#f3b3a3', 0.2, 0.17, 0.29)
    .ball(0.09, HAIR, -0.33, 0.24, -0.05).ball(0.09, HAIR, 0.33, 0.24, -0.05);
  head.add(mesh(hp));
  g.legs = [-1, 1].map(s => {
    const j = new THREE.Group(); j.position.set(s * 0.17, 0.95, 0); body.add(j);
    j.add(mesh(new Parts().cyl(0.15, 0.13, 0.82, PANTS, 0, -0.85, 0, 8).box(0.3, 0.2, 0.46, SHOE, 0, -0.95, 0.07)));
    return j;
  });
  g.arms = [-1, 1].map(s => {
    const j = new THREE.Group(); j.position.set(s * 0.47, 1.66, 0); body.add(j);
    j.add(mesh(new Parts().cyl(0.11, 0.13, 0.72, HOOD, 0, -0.74, 0, 8).ball(0.12, SKIN, 0, -0.88, 0)));
    return j;
  });
  // props
  g.suitcase = mesh(new Parts().box(0.8, 0.6, 0.3, '#8a4b2a', 0, 0, 0).box(0.82, 0.08, 0.32, '#5a2f1a', 0, 0.3, 0)
    .box(0.3, 0.12, 0.06, '#3a2418', 0, 0.62, 0).box(0.1, 0.62, 0.32, '#5a2f1a', -0.22, 0, 0).box(0.1, 0.62, 0.32, '#5a2f1a', 0.22, 0, 0));
  g.bucket = mesh(new Parts().cyl(0.2, 0.16, 0.38, '#7c95ad', 0, -0.4, 0, 10).cyl(0.17, 0.17, 0.02, '#6cc3e0', 0, -0.06, 0, 10)
    .add(new THREE.TorusGeometry(0.19, 0.02, 4, 12, Math.PI), '#5b6f82', 0, -0.03, 0));
  g.arms[0].add(g.bucket); g.bucket.position.set(0, -0.95, 0);
  g.add(g.suitcase); g.suitcase.position.set(0.95, 0, 0.35); g.suitcase.rotation.y = -0.3;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

  g.pose = (t, anim = 'idle', props = {}) => {
    g.suitcase.visible = !!props.suitcase; g.bucket.visible = !!props.bucket;
    const [L, Rr] = g.arms, [LL, RL] = g.legs;
    body.position.y = 0; body.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    LL.rotation.x = RL.rotation.x = 0;
    const breathe = Math.sin(t * 2.4) * 0.02;
    body.scale.set(1, 1 + breathe, 1);
    L.rotation.set(0, 0, -0.1 + (props.bucket ? -0.12 : 0)); Rr.rotation.set(0, 0, 0.1);
    if (anim === 'wave') {
      Rr.rotation.z = 2.55 + 0.32 * Math.sin(t * 9); Rr.rotation.x = -0.2;
      head.rotation.z = 0.08 * Math.sin(t * 4.5); body.rotation.z = -0.04;
      body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.04;
    } else if (anim === 'walk') {
      const w = Math.sin(t * 8.5);
      LL.rotation.x = w * 0.55; RL.rotation.x = -w * 0.55;
      L.rotation.x = props.bucket ? 0 : -w * 0.5; Rr.rotation.x = w * 0.5;
      body.position.y = Math.abs(Math.cos(t * 8.5)) * 0.08;
    } else if (anim === 'look') {
      head.rotation.y = Math.sin(t * 1.6) * 0.75; body.rotation.y = Math.sin(t * 1.6 - 0.6) * 0.15;
    } else if (anim === 'cheer') {
      L.rotation.z = -2.6 - 0.2 * Math.sin(t * 10); Rr.rotation.z = 2.6 + 0.2 * Math.sin(t * 10);
      body.position.y = Math.abs(Math.sin(t * 5)) * 0.25;
    }
  };
  return g;
}
