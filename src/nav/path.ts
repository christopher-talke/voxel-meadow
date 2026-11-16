import { V2, headingTo, rand, rr } from '../core/util';
import { B, G, N, R, cellIdx, colAt, cols, idxOf, inGrid, isWaterCol } from '../world/layout';

// ================= pathfinding =================

export const canStep = (a, b) => Math.abs(G.lvl[a] - G.lvl[b]) <= 1;
const walkXZ = (x, z) => { const c = cellIdx(x, z); return c >= 0 && G.walk[c] === 1; };
export const cellPt = c => V2((Math.floor(c / N) - R) * B, (c % N - R) * B);
export function nearestWalk(x, z, land = false, maxR = 14) {
  const i0 = Math.round(x / B), j0 = Math.round(z / B);
  const ok = (i, j) => { if (!inGrid(i, j)) return false; const k = idxOf(i, j); if (!G.walk[k]) return false; if (land) { const c = cols[k]!; if (c.type === 'shallow' || c.jetty || c.bridge) return false; } return true; };
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !ok(i, j)) continue;
      const d = Math.hypot(i * B - x, j * B - z); if (d < bd) { bd = d; best = idxOf(i, j); }
    }
    if (best >= 0) return best;
  }
  return -1;
}
const gS = new Float32Array(N * N), par = new Int32Array(N * N), seen = new Uint32Array(N * N), closed = new Uint32Array(N * N);
let stampN = 0, hI = new Int32Array(1 << 16), hF = new Float32Array(1 << 16), hn = 0;
function hswap(a, b) { const ti = hI[a]; hI[a] = hI[b]; hI[b] = ti; const tf = hF[a]; hF[a] = hF[b]; hF[b] = tf; }
function hpush(i, f) {
  if (hn >= hI.length) { const a = new Int32Array(hI.length * 2); a.set(hI); hI = a; const b = new Float32Array(hF.length * 2); b.set(hF); hF = b; }
  let k = hn++; hI[k] = i; hF[k] = f;
  while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= hF[k]) break; hswap(p, k); k = p; }
}
function hpop() {
  const top = hI[0]; hn--;
  if (hn > 0) {
    hI[0] = hI[hn]; hF[0] = hF[hn]; let k = 0;
    for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && hF[l] < hF[m]) m = l; if (r < hn && hF[r] < hF[m]) m = r; if (m === k) break; hswap(m, k); k = m; }
  }
  return top;
}
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function los(a, b) {
  const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz), n = Math.ceil(L / 2);
  let prev = cellIdx(a.x, a.y);
  for (let k = 1; k <= n; k++) {
    const x = a.x + dx * k / n, z = a.y + dz * k / n, c = cellIdx(x, z);
    if (c < 0 || !G.walk[c]) return false;
    if (c !== prev) { if (prev >= 0 && (!canStep(prev, c) || (G.cost[c] > 2 && G.cost[prev] <= 2))) return false; prev = c; }
    const px = -dz / L * 4, pz = dx / L * 4;
    if (!walkXZ(x + px, z + pz) || !walkXZ(x - px, z - pz)) return false;
  }
  return true;
}
export const moved0 = (x, z, d) => Math.hypot(d.pos.x - x, d.pos.y - z) > 0.2;
export function findPath(sx, sz, tx, tz) {
  const s = nearestWalk(sx, sz), t = nearestWalk(tx, tz);
  if (s < 0 || t < 0) return null;
  const tWalk = cellIdx(tx, tz) === t;
  if (s === t) return [tWalk ? V2(tx, tz) : cellPt(t)];
  stampN++; hn = 0; gS[s] = 0; seen[s] = stampN; par[s] = -1;
  const ti = Math.floor(t / N), tj = t % N;
  const heur = c => { const dx = Math.abs(Math.floor(c / N) - ti), dy = Math.abs(c % N - tj); return 0.55 * (dx + dy - 0.586 * Math.min(dx, dy)); };
  hpush(s, heur(s));
  let found = false, exp = 0;
  while (hn > 0) {
    const c = hpop();
    if (closed[c] === stampN) continue;
    closed[c] = stampN;
    if (c === t) { found = true; break; }
    if (++exp > 30000) break;
    const ci = Math.floor(c / N), cj = c % N;
    for (const [di, dj, w] of DIRS8) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = ni * N + nj;
      if (!G.walk[n] || closed[n] === stampN || !canStep(c, n)) continue;
      if (di && dj && (!G.walk[ci * N + nj] || !G.walk[ni * N + cj])) continue;
      const ng = gS[c] + w * (G.cost[n] + G.cost[c]) * 0.5;
      if (seen[n] !== stampN || ng < gS[n]) { seen[n] = stampN; gS[n] = ng; par[n] = c; hpush(n, ng + heur(n)); }
    }
  }
  if (!found) return null;
  const cells: number[] = []; for (let c = t; c !== -1; c = par[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map(cellPt);
  if (tWalk) pts[pts.length - 1] = V2(tx, tz);
  pts[0] = V2(sx, sz);
  const out: THREE.Vector2[] = []; let k = 0;
  while (k < pts.length - 1) {
    let best = k + 1;
    for (let m = Math.min(pts.length - 1, k + 40); m > k + 1; m--) if (los(pts[k], pts[m])) { best = m; break; }
    out.push(pts[best]); k = best;
  }
  return out;
}
// nearest land cell next to water, searched outward over walkable cells
export function bankNear(x, z, avoid?) {
  const s = nearestWalk(x, z, true); if (s < 0) return null;
  const q = [s], vis = new Set([s]);
  while (q.length && vis.size < 6000) {
    const c = q.shift()!, ci = Math.floor(c / N) - R, cj = c % N - R, col = cols[c]!;
    if (col.type !== 'shallow' && !col.jetty && !col.bridge) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = colAt(ci + di, cj + dj);
        if (n && isWaterCol(n) && !n.bridge && !n.jetty && (!avoid || Math.hypot(ci * B - avoid.x, cj * B - avoid.y) > 18)) return { p: V2(ci * B - di * 3, cj * B - dj * 3), h: headingTo(di, dj) };
      }
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj; if (!inGrid(ni, nj)) continue;
      const n = idxOf(ni, nj); if (!vis.has(n) && G.walk[n] && canStep(c, n)) { vis.add(n); q.push(n); }
    }
  }
  return null;
}
export function randLand(cx, cz, minD, maxD) {
  for (let n = 0; n < 90; n++) {
    const a = rand() * 6.283, d = rr(minD, maxD), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, c = cellIdx(x, z);
    if (c < 0 || !G.walk[c]) continue;
    const col = cols[c]!;
    if (col.type === 'shallow' || col.jetty || col.bridge) continue;
    if (!walkXZ(x + 6, z) || !walkXZ(x - 6, z) || !walkXZ(x, z + 6) || !walkXZ(x, z - 6)) continue;
    return V2(x, z);
  }
  const c = nearestWalk(cx, cz, true); return c >= 0 ? cellPt(c) : V2(0, 20);
}
export const SHALLOWS: any[] = [];
for (const c of cols) if (c && c.type === 'shallow' && !c.jetty) { let near = false; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const n = colAt(c.i + a, c.j + b); if (n && n.type === 'sand') near = true; } if (near) SHALLOWS.push(c); }
