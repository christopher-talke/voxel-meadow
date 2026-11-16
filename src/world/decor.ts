import { hash, jit, lineDist, noise, rand, rr } from '../core/util';
import { B, BEDS, CLIMB, CREEK, FIELD, G, HILL, JETTY, LAKE, PATHS, POLE, SHELTER_POSTS, WOODS, blanketToWorld, block, blockRect, colAt, cols, idxOf, inGrid, isWaterCol, onBed, onBlanket, onShelter } from './layout';

// ================= decor voxels (block grid) and small boxes =================
export const DK = (i, k, j) => ((i + 600) * 2048 + (k + 600)) * 2048 + (j + 600);
export const decor = new Map();
export type BoxSpec = [number, number, number, number, number, number, number, number];
export const boxes: BoxSpec[] = [];
const box = (x, y, z, sx, sy, sz, col, ry = 0) => boxes.push([x, y, z, sx, sy, sz, col, ry]);
const leafCol = pal => (i, y, j) => jit(pal[Math.min(pal.length - 1, Math.floor(noise(i * 0.45, j * 0.45 + y * 0.3, 14) * pal.length))], 0.05);
function blob(cx, cy, cz, rx, ry, rz, colFn) {
  for (let i = Math.floor(cx - rx - 1); i <= Math.ceil(cx + rx + 1); i++)
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let j = Math.floor(cz - rz - 1); j <= Math.ceil(cz + rz + 1); j++) {
        const q = ((i - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((j - cz) / rz) ** 2;
        if (q <= 1 - 0.18 * hash(i, y * 31 + j, 13)) decor.set(DK(i, y, j), colFn(i, y, j));
      }
}
const vox = (i, k, j, col) => decor.set(DK(i, k, j), col);
const baseAt = (i, j) => { const c = colAt(i, j); return c ? c.top : 0; };
export const TREES: any[] = [];
function oak(i, j, s = 1) {
  const b = baseAt(i, j), h = Math.round(19 * s), p = leafCol([0x4f8f3f, 0x5e9e45, 0x6aab4f, 0x7ab857]);
  for (let k = b + 1; k <= b + h; k++) for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) vox(i + a, k, j + c, jit(0x7a5636, 0.05));
  for (const [a, c] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) vox(i + a, b + 1, j + c, jit(0x6e4c30, 0.05));
  blob(i + 0.5, b + h + 4, j + 0.5, 8.4 * s, 6.2 * s, 8.4 * s, p);
  blob(i + 0.5 + 5.5 * s, b + h + 2, j - 1, 5.6 * s, 4.4 * s, 5.6 * s, p);
  blob(i + 0.5 - 5.5 * s, b + h + 2.4, j + 3, 5.8 * s, 4.6 * s, 5.8 * s, p);
  blob(i + 1, b + h + 8 * s, j + 1, 5.4 * s, 4 * s, 5.4 * s, p);
  for (const [a, k, c] of [[2, h - 3, 0], [3, h - 2, -1], [-1, h - 2, 1], [-2, h - 1, 2]]) vox(i + a, b + k, j + c, jit(0x6e4c30, 0.05));
  block(i + 0.5, j + 0.5, 2.6); TREES.push([i, j, 6 * s]);
  // two limbs reaching east from the trunk, below the canopy, that the cats can walk out along
  const br: any[] = [];
  if (h >= 13) for (const [dk, L] of [[9, 6], [6, 5]]) {
    const k = b + h - dk; if (k <= b + 3) continue;
    for (let a = 2; a < 2 + L; a++) vox(i + a, k + (a >= 2 + L - 2 ? 1 : 0), j + 1, jit(0x6e4c30, 0.05));
    vox(i + 3, k - 1, j + 1, jit(0x6e4c30, 0.05));
    vox(i + 2 + Math.floor(L / 2), k + 1, j + 2, jit(0x6e4c30, 0.05));
    blob(i + 4.2 + L, k + 1.2, j + 1, 1.9, 1.4, 1.9, p);
    br.push({ k, L });
  }
  CLIMB.push({ i, j, b, h, br });
}
export const CHERRY: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
function cherry(i, j) {
  const b = baseAt(i, j), p = leafCol([0xeea0b9, 0xf4b6c8, 0xf7c6d4, 0xfbd6e1]);
  for (let k = b + 1; k <= b + 11; k++) for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) vox(i + a, k, j + c, jit(0x6b4a3a, 0.05));
  for (let k = b + 12; k <= b + 15; k++) for (let a = 1; a < 3; a++) for (let c = 0; c < 2; c++) vox(i + a, k, j + c, jit(0x6b4a3a, 0.05));
  blob(i + 1.5, b + 19, j + 0.5, 7.2, 5, 7.2, p);
  blob(i + 6.5, b + 17, j + 1.5, 4.6, 3.6, 4.6, p);
  blob(i - 3.4, b + 17.4, j - 0.5, 4.6, 3.6, 4.6, p);
  block(i + 0.5, j + 0.5, 2.4); TREES.push([i, j, 5]);
  Object.assign(CHERRY, { x: (i + 1.5) * B, y: (b + 16) * B, z: (j + 0.5) * B });
}
function birch(i, j, h) {
  const b = baseAt(i, j), p = leafCol([0x8cc05a, 0x9ccc65, 0xafd877]);
  for (let k = b + 1; k <= b + h; k++) vox(i, k, j, rand() < 0.22 ? jit(0x3d3a36, 0.08) : jit(0xeeeae0, 0.03));
  blob(i, b + h - 1, j, 4.2, 6, 4.2, p);
  block(i, j, 1.6); TREES.push([i, j, 3]);
}
function pine(i, j, h) {
  const b = baseAt(i, j), p = leafCol([0x3d7444, 0x46804b, 0x528c55]);
  for (let k = b + 1; k <= b + h; k++) vox(i, k, j, jit(0x5d4130, 0.06));
  for (let l = 0; l < 5; l++) {
    const y0 = b + 4 + l * 3.2, r = 5.4 - l * 1.0;
    for (let y = Math.floor(y0); y < y0 + 3.2; y++) { const rr2 = r - (y - y0) * 0.55; for (let a = -6; a <= 6; a++) for (let c = -6; c <= 6; c++) if (a * a + c * c <= rr2 * rr2) vox(i + a, y, j + c, p(i + a, y, j + c)); }
  }
  vox(i, b + h + 1, j, jit(0x46804b, 0.05));
  block(i, j, 1.6); TREES.push([i, j, 4]);
}
function bush(i, j, flowers) {
  const b = baseAt(i, j), p = leafCol([0x4d8a3c, 0x5b9a45, 0x67a64d]);
  blob(i, b + 1.6, j, 2.6, 2, 2.6, (a, y, c) => (flowers && hash(a, y * 7 + c, 21) < 0.16) ? flowers : p(a, y, c));
  block(i, j, 3.2); TREES.push([i, j, 2.6]);
}
function rock(i, j, s = 1) {
  const b = baseAt(i, j);
  blob(i, b + 0.6, j, 1.9 * s, 1.1 * s, 1.6 * s, (a, y, c) => jit(hash(a, c, 30) < 0.25 ? 0x7e8a6e : 0x9a9ea5, 0.06));
  block(i, j, 2.3 * s); TREES.push([i, j, 2]);
}
const placeOK = (i, j, minSep, needType = ['grass']) => {
  const c = colAt(i, j);
  if (!c || c.edge || c.bridge || c.jetty || !needType.includes(c.type)) return false;
  if (onBlanket(i * B, j * B, 24)) return false;
  for (const p of PATHS) if (lineDist(i, j, p) < 3) return false;
  for (const t of TREES) if (Math.hypot(t[0] - i, t[1] - j) < minSep) return false;
  if (lineDist(i, j, CREEK) < 3.2) return false;
  return true;
};

oak(-20, -20);
cherry(17, -15);
for (let n = 0, placed = 0; n < 500 && placed < 24; n++) {
  const a = rr(0, 6.283), d = Math.sqrt(rand()) * WOODS.r, i = Math.round(WOODS.i + Math.cos(a) * d), j = Math.round(WOODS.j + Math.sin(a) * d);
  if (!placeOK(i, j, 9)) continue;
  const q = rand();
  if (q < 0.42) oak(i, j, rr(0.7, 0.9)); else if (q < 0.72) birch(i, j, Math.round(rr(14, 19))); else pine(i, j, Math.round(rr(17, 21)));
  placed++;
}
for (let n = 0, placed = 0; n < 400 && placed < 14; n++) {
  const a = rr(Math.PI * 1.08, Math.PI * 1.92), d = rr(52, 80), i = Math.round(Math.cos(a) * d), j = Math.round(Math.sin(a) * d);
  if (!placeOK(i, j, 8) || Math.hypot(i - HILL.i, j - HILL.j) < 9) continue;
  pine(i, j, Math.round(rr(16, 21))); placed++;
}
for (const [i, j, h] of [[-28, -4, 17], [-26, 14, 15], [27, -2, 16], [-6, 28, 16], [70, 8, 16], [62, -40, 15]]) if (placeOK(i, j, 5)) birch(i, j, h);
for (const [i, j, f] of [[27, 9, 0xf7f3e8], [4, -27, 0xf4a6c0], [-12, 26, 0xffd75e], [-36, -14, 0xb9a2e6], [30, 22, 0], [-44, 34, 0], [70, 20, 0xfdfbf2], [24, 60, 0], [-20, 50, 0xffd75e]]) if (placeOK(i, j, 5, ['grass', 'sand'])) bush(i, j, f);
for (const [i, j, s] of [[20, 22, 1], [-14, -28, 1.2], [9, 31, 0.8], [-6, -44, 1.1], [14, -48, 0.9], [62, 30, 1], [-30, -40, 1.3], [36, 58, 0.9], [74, -30, 1]]) if (placeOK(i, j, 4, ['grass', 'sand'])) rock(i, j, s);

// hilltop lookout and bench
export const LOOK = (() => {
  let best: any = null;
  for (let i = HILL.i - 4; i <= HILL.i + 4; i++) for (let j = HILL.j - 4; j <= HILL.j + 4; j++) { const c = colAt(i, j); if (c && G.walk[idxOf(i, j)] && (!best || c.top > best.top)) best = c; }
  return best;
})();
{
  const y = LOOK.top * B, bx = LOOK.i * B, bz = (LOOK.j - 3) * B;
  for (const s of [-1, 1]) for (const dz of [-5, 5]) box(bx + s * 22, y + 6.5, bz + dz, 2.2, 13, 2.2, 0x6b4a32);
  for (const dz of [-4.5, -1.5, 1.5, 4.5]) box(bx, y + 13.7, bz + dz, 52, 1.4, 2.6, jit(0x9a6e45, 0.04));
  for (const s of [-1, 1]) box(bx + s * 22, y + 20, bz - 6, 2.2, 14, 2.2, 0x6b4a32);
  for (const dy of [19, 24]) box(bx, y + dy, bz - 6.4, 52, 3, 1.2, jit(0x8d6340, 0.04));
  for (const [px, pz] of SHELTER_POSTS) blockRect(px - 2, px + 2, pz - 2, pz + 2);
  blockRect(POLE.x - 2.5, POLE.x + 2.5, POLE.z - 2.5, POLE.z + 2.5);   // posts are solid
  { const sp = BEDS[2]; for (let i = Math.floor((sp.x - 24) / B); i <= Math.ceil((sp.x + 24) / B); i++) for (let j = Math.floor((sp.z - 20) / B); j <= Math.ceil((sp.z + 20) / B); j++) if (inGrid(i, j) && onBed(i * B, j * B, 5)) G.cost[idxOf(i, j)] += 12; }   // dogs walk around the spare bed
  for (let i = LOOK.i - 7; i <= LOOK.i + 7; i++) for (let j = LOOK.j - 5; j <= LOOK.j - 2; j++) G.walk[idxOf(i, j)] = 0;
}

// picnic blanket (own mesh so it can be tapped) and ball
export const BALL = blanketToWorld(31, 3);
export const BALL_R = 3.5;
export const ballBoxes: number[][] = [];
{
  const phi = (1 + Math.sqrt(5)) / 2, cen: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) cen.push([0, a, b], [a, b, 0], [b, 0, a]);
  cen.forEach(c => { const l = Math.hypot(...c); c[0] /= l; c[1] /= l; c[2] /= l; });
  const v = 0.55, n = Math.ceil(BALL_R / v);
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) {
    const d = Math.hypot(x, y, z) * v;
    if (d > BALL_R || d < BALL_R - 1.1) continue;
    const nx = x * v / d, ny = y * v / d, nz = z * v / d;
    let best = -1; for (const c of cen) best = Math.max(best, nx * c[0] + ny * c[1] + nz * c[2]);
    ballBoxes.push([x * v, y * v, z * v, v, v, v, best > 0.93 ? 0x26262a : jit(0xf6f4ee, 0.02)]);
  }
}

// bridges
for (const c of cols) {
  if (!c || !c.bridge) continue;
  const x = c.i * B, z = c.j * B, y = c.base * B + 1.6;
  box(x, y - 0.45, z, B, 0.9, B, jit((c.i + c.j) % 2 ? 0xa57a4f : 0x936a43, 0.04));
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = colAt(c.i + di, c.j + dj);
    if (n && n.type === 'creek' && !n.bridge) {
      if ((c.i + c.j) % 2 === 0) box(x + di * (B / 2 - 0.6), y + 7, z + dj * (B / 2 - 0.6), 1.2, 14, 1.2, 0x6b4a32);
      box(x + di * (B / 2 - 0.6), y + 13.6, z + dj * (B / 2 - 0.6), di ? 1.1 : B, 1.2, dj ? 1.1 : B, 0x8d6340);
    }
  }
}
// jetty
for (let i = JETTY.i0; i <= JETTY.i1; i++) for (let j = JETTY.j0; j <= JETTY.j1; j++) {
  const c = colAt(i, j); if (!c || !c.jetty) continue;
  box(i * B, 3.7, j * B, B - 0.3, 1, B, jit(i % 2 ? 0xa57a4f : 0x936a43, 0.05));
  if ((j === JETTY.j0 || j === JETTY.j1) && i % 3 === 0) box(i * B, -3, j * B + (j === JETTY.j0 ? -1.6 : 1.6), 1.6, 20, 1.6, 0x5f4330);
}
box(JETTY.i1 * B + 1.2, 8, JETTY.j0 * B, 2.4, 9, 2.4, 0x5f4330);
box(JETTY.i1 * B + 1.2, 8, JETTY.j1 * B, 2.4, 9, 2.4, 0x5f4330);

// the old scattered lily pads now live in world/pond.ts; this loop still draws the same random numbers so the rest of the layout stays put
for (let n = 0; n < 12; n++) {
  const a = rr(0, 6.283), d = rr(2, 13), i = Math.round(LAKE.i + Math.cos(a) * d), j = Math.round(LAKE.j + Math.sin(a) * d), c = colAt(i, j);
  if (!c || c.type !== 'deep' || c.jetty) continue;
  rr(-1, 1); rr(-1, 1); jit(0x6fae4f, 0.05); rand();
}
// reeds
for (const c of cols) {
  if (!c || !(c.type === 'sand' || c.type === 'grass') || c.bridge || c.jetty || G.walk[idxOf(c.i, c.j)] === 0) continue;
  let wet = false; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = colAt(c.i + di, c.j + dj); if (n && isWaterCol(n) && !n.bridge && !n.jetty) wet = true; }
  if (!wet || hash(c.i, c.j, 40) > 0.22) continue;
  for (let k = 0; k < 3; k++) { const h = rr(5, 9); box(c.i * B + rr(-1.5, 1.5), c.top * B + h / 2, c.j * B + rr(-1.5, 1.5), 0.6, h, 0.6, jit(rand() < 0.7 ? 0x6f9a4a : 0x9b8a5a, 0.06)); }
}

// flowers, tufts, ferns, mushrooms
const FLOWER = [0xfdfbf2, 0xffd75e, 0xf59bb8, 0xb9a2e6, 0x8ec9f0];
function clearLand(x, z) {
  const i = Math.round(x / B), j = Math.round(z / B), c = colAt(i, j);
  if (!c || c.type !== 'grass' || c.edge || !G.walk[idxOf(i, j)] || onBlanket(x, z, 3) || onBed(x, z, 4) || onShelter(x, z, 6)) return null;
  return c;
}
function flower(x, z, c, col) { const y = c.top * B, h = rr(2.4, 3.6); box(x, y + h / 2, z, 0.5, h, 0.5, jit(0x4f8d3d, 0.06)); box(x, y + h + 0.4, z, 1.2, 0.8, 1.2, jit(col, 0.04)); }
for (let n = 0, placed = 0; n < 9000 && placed < 380; n++) {
  const a = rand() * 6.283, d = Math.sqrt(rand()) * 330, x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (noise(x * 0.02, z * 0.02, 11) < 0.55) continue;
  const c = clearLand(x, z); if (!c || c.forest) continue;
  flower(x, z, c, FLOWER[Math.floor(noise(x * 0.01 + 3, z * 0.01, 12) * FLOWER.length * 0.999)]); placed++;
}
for (let n = 0, placed = 0; n < 4000 && placed < 950; n++) {
  const a = rand() * 6.283, d = Math.sqrt(rand()) * (FIELD.r + 2) * B, x = FIELD.i * B + Math.cos(a) * d, z = FIELD.j * B + Math.sin(a) * d;
  const c = clearLand(x, z); if (!c) continue;
  const q = rand(); flower(x, z, c, q < 0.3 ? 0xf59bb8 : q < 0.55 ? 0xffd75e : q < 0.75 ? 0xfdfbf2 : q < 0.9 ? 0xb9a2e6 : 0xf08a6c); placed++;
}
for (let n = 0, placed = 0; n < 9000 && placed < 950; n++) {
  const a = rand() * 6.283, d = Math.sqrt(rand()) * 340, x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (noise(x * 0.04, z * 0.04, 15) < 0.45) continue;
  const c = clearLand(x, z); if (!c) continue;
  const y = c.top * B;
  for (let k = 0; k < 3; k++) { const h = rr(1.4, 3.2); box(x + rr(-1.2, 1.2), y + h / 2, z + rr(-1.2, 1.2), 0.7, h, 0.7, jit(c.forest ? 0x4f8a3e : rand() < 0.5 ? 0x5c9a44 : 0x6caa4e, 0.06)); }
  placed++;
}
for (let n = 0, placed = 0; n < 3000 && placed < 230; n++) {
  const a = rand() * 6.283, d = Math.sqrt(rand()) * WOODS.r * B, x = WOODS.i * B + Math.cos(a) * d, z = WOODS.j * B + Math.sin(a) * d;
  const c = clearLand(x, z); if (!c || !c.forest) continue;
  const y = c.top * B;
  if (rand() < 0.2) { box(x, y + 1.2, z, 1, 2.4, 1, 0xf2ece0); box(x, y + 2.8, z, 3, 1.2, 3, jit(rand() < 0.6 ? 0xd2493f : 0xc99a5c, 0.05)); }
  else { box(x, y + 2, z, 4.5, 4, 0.8, jit(0x3f7a3c, 0.06)); box(x, y + 1.8, z, 0.8, 3.6, 4.5, jit(0x4a8a44, 0.06)); }
  placed++;
}
