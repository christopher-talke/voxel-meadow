import { clamp, lineDist, noise, smooth } from '../engine/core/util';
import { B } from '../engine/core/scale';
import { type Col, G, R, cellIdx, colAt, cols, idxOf, initGrid } from '../engine/terrain/grid';

// ================= the island layout (block units; scale lives in engine/core/scale.ts) =================
export const LAKE = { i: 45, j: 40, r: 22 };
// the lake spills out through a short channel on its far side and pours off the island edge
const SPILL_U = (() => { const l = Math.hypot(LAKE.i, LAKE.j); return { x: LAKE.i / l, z: LAKE.j / l }; })();
const SPILL_HW = 1.6;   // half width of the channel, in blocks
const spillT = (i, j) => (i - LAKE.i) * SPILL_U.x + (j - LAKE.j) * SPILL_U.z;
const spillPerp = (i, j) => Math.abs((i - LAKE.i) * SPILL_U.z - (j - LAKE.j) * SPILL_U.x);
export const HILL = { i: 6, j: -56 };
export const WOODS = { i: -55, j: 10, r: 26 };
export const FIELD = { i: 58, j: -18, r: 20 };
export const CREEK = [[-20, -72], [-12, -56], [0, -43], [12, -31], [24, -15], [32, 3], [40, 19], [44, 24]];
export const PATHS = [
  [[6, -4], [6, -24], [5, -40], [6, -52]],
  [[3, 4], [12, 16], [18, 30], [20, 40]],
  [[-3, 7], [-18, 9], [-31, 9]],
  [[8, -1], [22, -8], [40, -14]],
];
export const JETTY = { i0: 21, i1: 37, j0: 38, j1: 42 };
export const BL = { x: -26, z: -20, rot: 0.3, w: 48, d: 36 };
export const blanketToWorld = (lx, lz) => ({ x: BL.x + lx * Math.cos(BL.rot) + lz * Math.sin(BL.rot), z: BL.z - lx * Math.sin(BL.rot) + lz * Math.cos(BL.rot) });
function blanketLocal(x, z) { const dx = x - BL.x, dz = z - BL.z, c = Math.cos(BL.rot), s = Math.sin(BL.rot); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
// the dogs' beds: ovals with a soft rim and a cushion, each with its own blanket
export const BEDS = [
  { x: -72, z: 0, rot: 0.25, a: 15, b: 11, rim: 0x5e7896, cush: 0x8aa3bf, owner: 0 },
  { x: -78, z: -30, rot: 0.45, a: 15, b: 11, rim: 0xc98fa0, cush: 0xecc9d1, owner: 1 },
  { x: -73, z: 30, rot: 0.2, a: 15, b: 11, rim: 0x9a8a4a, cush: 0xd9c98a, owner: 2 },   // spare bed for another dog
];
// an open timber shelter (posts and roof only) in an L around the picnic blanket
export const SH = { x0: -99, x1: -55, z0: -47, z1: 49, hBack: 36, hFront: 27 };   // one straight open shelter holding all three beds
export const roofTop = x => (x < SH.x1 + 8 ? SH.hBack + (SH.hFront - SH.hBack) * ((Math.min(x, SH.x1) - SH.x0) / (SH.x1 - SH.x0)) : SH.hFront - 1.6) + 2.9;
export const POLE = { x: -77, z: -54.5, h: 33.5 };   // a timber pole against the roof edge that the cats use to get up
export const CLIMB: any[] = [];                              // oaks the cats can climb: grip point and a branch stub to sit on
export const DECK = 1.2;                                                          // plank deck, one level under every bed
export const onShelter = (x, z, m = 0) => x > SH.x0 - m && x < SH.x1 + m && z > SH.z0 - m && z < SH.z1 + m;
export const deckH = (x, z) => onShelter(x, z, 0) ? DECK : 0;
export const SHELTER_POSTS: number[][] = [];
{
  const n = Math.ceil((SH.z1 - SH.z0 - 4) / 24), step = (SH.z1 - SH.z0 - 4) / n;
  for (let k = 0; k <= n; k++) { const z = SH.z0 + 2 + k * step; SHELTER_POSTS.push([SH.x0 + 1.5, z]); SHELTER_POSTS.push([SH.x1 - 2, z]); }
}
function bedLocal(bd, x, z) { const dx = x - bd.x, dz = z - bd.z, c = Math.cos(bd.rot), s = Math.sin(bd.rot); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
export function bedTop(x, z) {   // height above the deck
  for (const bd of BEDS) { const l = bedLocal(bd, x, z), r = Math.hypot(l.x / bd.a, l.z / bd.b); if (r < 1) return r < 0.78 ? 3 : 6; }
  return 0;
}
export const onBed = (x, z, m = 0) => BEDS.some(bd => { const l = bedLocal(bd, x, z); return Math.hypot(l.x / (bd.a + m), l.z / (bd.b + m)) < 1; });
export function onBlanket(x, z, m = 0) { const l = blanketLocal(x, z); return Math.abs(l.x) < BL.w / 2 + m && Math.abs(l.z) < BL.d / 2 + m; }

const edgeR = a => R - 6 + 4 * noise(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 + 7, 3) + 2 * noise(Math.cos(a) * 4 + 2, Math.sin(a) * 4 + 2, 4);
function Hf(i, j) {
  const d = Math.hypot(i, j), north = clamp(-j / (d + 1e-3), 0, 1);
  let h = noise(i * 0.05, j * 0.05, 1) * 1.7 + noise(i * 0.11, j * 0.11, 2) * 0.6 - 0.5;
  h += smooth(48, 88, d) * (0.35 + north * 1.25) * (4 + 3 * noise(i * 0.04, j * 0.04, 3));
  h += 14 * Math.exp(-((i - HILL.i) ** 2 + (j - HILL.j) ** 2) / (2 * 16 * 16));
  for (const bd of BEDS) if (Math.hypot(i * B - bd.x, j * B - bd.z) < 36) return 0;
  if (onShelter(i * B, j * B, 8)) return 0;
  return h * smooth(14, 32, d);
}

initGrid(90);   // the island: 181 x 181 blocks, about 23 m across
for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
  const d = Math.hypot(i, j), re = edgeR(Math.atan2(j, i));
  if (d > re) continue;
  const base = Math.max(0, Math.floor(Hf(i, j)));
  const c: Col = { i, j, top: base, base, bot: 0, type: 'grass', wl: null, bridge: false, jetty: false, forest: false, edge: d > re - 5 };
  const ld = Math.hypot(i - LAKE.i, j - LAKE.j), lr = LAKE.r + 3 * (noise(i * 0.12, j * 0.12, 7) - 0.5);
  if (ld < lr) {
    const toHome = ld > 0 ? clamp((-(i - LAKE.i) * 0.75 - (j - LAKE.j) * 0.35) / ld, 0, 1) : 0;
    if (ld > lr - (2.5 + 5 * toHome)) { c.top = -1; c.type = 'shallow'; } else { c.top = -3; c.type = 'deep'; }
    c.wl = -1;
  } else if (ld < lr + 5) { c.top = 0; c.base = 0; c.type = 'sand'; }
  if ((c.type === 'grass' || c.type === 'sand') && spillT(i, j) > LAKE.r - 4 && spillPerp(i, j) < SPILL_HW) { c.top = -1; c.base = Math.min(c.base, 0); c.type = 'creek'; c.spill = true; c.wl = -1; }
  if ((c.type === 'grass' || c.type === 'sand') && lineDist(i, j, CREEK) < 1.7) { c.top = c.base - 1; c.type = 'creek'; c.wl = c.top * B + 2.6; }
  let onPath = false; for (const p of PATHS) if (lineDist(i, j, p) < 1.5) onPath = true;
  if (onPath) { if (c.type === 'grass') c.type = 'path'; else if (c.type === 'creek') c.bridge = true; }
  if (i >= JETTY.i0 && i <= JETTY.i1 && j >= JETTY.j0 && j <= JETTY.j1 && (c.type === 'sand' || c.type === 'shallow' || c.type === 'deep')) c.jetty = true;
  if (Math.hypot(i - WOODS.i, j - WOODS.j) < WOODS.r + 4 * (noise(i * 0.1, j * 0.1, 9) - 0.5) && c.type === 'grass') c.forest = true;
  c.bot = -(3 + Math.floor((1 - Math.pow(d / re, 1.4)) * 32 + noise(i * 0.08, j * 0.08, 8) * 6));
  c.wade = c.type === 'shallow'; c.swim = c.type === 'deep';
  cols[idxOf(i, j)] = c;
}
/** Where the lake pours off the island: lip point on the water (world units), outward direction, channel width. */
export const SPILL = (() => {
  let tMax = 0;
  for (const c of cols) if (c && c.spill && spillPerp(c.i, c.j) < 0.9) tMax = Math.max(tMax, spillT(c.i, c.j));
  const t = tMax + 0.5;
  return { x: (LAKE.i + SPILL_U.x * t) * B, z: (LAKE.j + SPILL_U.z * t) * B, nx: SPILL_U.x, nz: SPILL_U.z, w: SPILL_HW * 2 * B, y: -1 };
})();

// walk grid
for (const c of cols) {
  if (!c) continue;
  const k = idxOf(c.i, c.j);
  let w = 0, lvl = c.top, gy = c.top * B, cost = 1;
  if (c.type === 'grass' || c.type === 'path' || c.type === 'sand') { w = 1; cost = c.type === 'path' ? 0.55 : c.forest ? 1.15 : 1; }
  if (c.type === 'shallow') { w = 1; cost = 2.6; }
  if (c.bridge) { w = 1; lvl = c.base; gy = c.base * B + 1.6; cost = 0.55; }
  if (c.jetty) { w = 1; lvl = 1; gy = 4.2; cost = 0.8; }
  if (c.edge) w = 0;
  G.walk[k] = w; G.lvl[k] = lvl; G.gy[k] = gy; G.cost[k] = cost;
}


export const WATER_Y = -1;

export const NOSE = 11.4;

// beach entry points: shallow water cells with sand close by, where the dogs wade in and the fish gather
export const SHALLOWS: any[] = [];
for (const c of cols) if (c && c.type === 'shallow' && !c.jetty) { let near = false; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const n = colAt(c.i + a, c.j + b); if (n && n.type === 'sand') near = true; } if (near) SHALLOWS.push(c); }
