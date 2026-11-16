import * as THREE from 'three';
import { state } from '../engine/core/state';
import { V2, clamp, lerp, rand, store } from '../engine/core/util';
import { scene } from '../engine/render/stage';
import { BEDS, BL, NOSE } from '../world/layout';
import { GRAV, K } from '../engine/core/scale';
import { dogs, ents } from './registry';
import { groundAtXZ } from './behaviours';

// ================= cloth: the picnic blanket and the two bed blankets =================
function clothTex(kind: string) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  if (kind === 'picnic') {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const k = (i % 2) + (j % 2); g.fillStyle = k === 0 ? '#f4efe3' : k === 1 ? '#a9cbe8' : '#7fb0dc'; g.fillRect(i * 8, j * 8, 8, 8); }
  } else if (kind === 'murphy') {
    g.fillStyle = '#6f8fb3'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#9db5d0';
    for (const [x, y] of [[12, 14], [40, 10], [24, 36], [50, 42], [10, 52]]) { g.fillRect(x, y, 5, 4); g.fillRect(x - 3, y - 4, 2, 2); g.fillRect(x, y - 6, 2, 2); g.fillRect(x + 3, y - 6, 2, 2); g.fillRect(x + 6, y - 4, 2, 2); }
    g.fillStyle = '#56738f'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
  } else if (kind === 'third') {
    g.fillStyle = '#b9c78a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#8fa860';
    for (const [x, y] of [[10, 12], [38, 8], [24, 30], [50, 36], [12, 50], [40, 54]]) { g.fillRect(x, y, 8, 3); g.fillRect(x + 2, y - 3, 3, 9); }
    g.fillStyle = '#6f8a45'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
  } else {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4c6d2' : '#e7a2b6'; g.fillRect(i * 8, j * 8, 8, 8); }
    g.fillStyle = '#c4637f'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t;
}
const clothGround = (x, z) => groundAtXZ(x, z) + 0.3;
export class Cloth {
  /** Frames the cloth has been perfectly still; once settled with nobody near, it stops simulating until disturbed. */
  rest = 0; cx = 0; cz = 0; rad = 0;
  C: number[];
  N: number;
  anim: any;
  bed: number | undefined;
  d: number;
  dx: number;
  dz: number;
  geo: THREE.PlaneGeometry;
  grabs: Map<number, any>;
  h: Float32Array;
  mesh: THREE.Mesh;
  name: string;
  nx: number;
  nz: number;
  onTidy: any;
  p: Float32Array;
  q: Float32Array;
  rot: number;
  tex: string;
  w: number;
  x: number;
  z: number;
  constructor(o) {
    Object.assign(this, o);
    const nx = this.nx, nz = this.nz, N = nx * nz;
    this.N = N; this.p = new Float32Array(N * 3); this.q = new Float32Array(N * 3); this.h = new Float32Array(N * 3);
    this.grabs = new Map(); this.anim = null;
    this.dx = this.w / (nx - 1); this.dz = this.d / (nz - 1);
    this.computeHome();
    const C: number[] = [];
    const add = (a, b, k) => { const h = this.h; C.push(a, b, Math.hypot(h[a * 3] - h[b * 3], h[a * 3 + 1] - h[b * 3 + 1], h[a * 3 + 2] - h[b * 3 + 2]), k); };
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const k = iz * nx + ix;
      if (ix + 1 < nx) add(k, k + 1, 0); if (iz + 1 < nz) add(k, k + nx, 0);
      if (ix + 1 < nx && iz + 1 < nz) { add(k, k + nx + 1, 1); add(k + 1, k + nx, 1); }
      if (ix + 2 < nx) add(k, k + 2, 2); if (iz + 2 < nz) add(k, k + 2 * nx, 2);
    }
    this.C = C;
    this.p.set(this.h); this.q.set(this.h);
    const geo = new THREE.PlaneGeometry(this.w, this.d, nx - 1, nz - 1);
    this.geo = geo;
    const mat = new THREE.MeshLambertMaterial({ map: clothTex(this.tex), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.userData.cloth = this;
    scene.add(this.mesh); this.sync();
  }
  homeLocal(k) { const ix = k % this.nx, iz = Math.floor(k / this.nx); return [-this.w / 2 + ix * this.dx, -this.d / 2 + iz * this.dz]; }
  computeHome() {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    for (let k = 0; k < this.N; k++) { const [lx, lz] = this.homeLocal(k), x = this.x + lx * c + lz * s, z = this.z - lx * s + lz * c; this.h[k * 3] = x; this.h[k * 3 + 1] = clothGround(x, z); this.h[k * 3 + 2] = z; }
  }
  nearest(x, z) { let best = 0, bd = 1e9; for (let k = 0; k < this.N; k++) { const d = (this.p[k * 3] - x) ** 2 + (this.p[k * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = k; } } return { k: best, d: Math.sqrt(bd) }; }
  centroid() { let x = 0, z = 0; for (let k = 0; k < this.N; k++) { x += this.p[k * 3]; z += this.p[k * 3 + 2]; } return V2(x / this.N, z / this.N); }
  mess() {
    let m = 0; for (let k = 0; k < this.N; k++) { const i = k * 3; m += Math.hypot(this.p[i] - this.h[i], this.p[i + 2] - this.h[i + 2]) + Math.abs(this.p[i + 1] - this.h[i + 1]) * 1.5; }
    return clamp(m / this.N / (Math.min(this.w, this.d) * 0.22), 0, 1);
  }
  shakeOut() { this.anim = { t: 0, from: Float32Array.from(this.p) }; this.grabs.clear(); }
  /** Is any animal close enough to touch this cloth? */
  animalNear() { for (const e of ents) { const dx = e.pos.x - this.cx, dz = e.pos.y - this.cz; if (dx * dx + dz * dz < (this.rad + 26) ** 2) return true; } return false; }
  step(dt) {
    const p = this.p, q = this.q, N = this.N;
    if (!this.anim && !this.grabs.size && this.rest >= 30 && !this.animalNear()) return;
    this.stepSim(dt);
    let mv = 0; for (let i = 0; i < N * 3; i++) { const d = Math.abs(p[i] - q[i]); if (d > mv) mv = d; }
    if (this.anim || this.grabs.size || mv > 2e-3) this.rest = 0;
    else if (++this.rest === 30) { const c = this.centroid(); this.cx = c.x; this.cz = c.y; let r = 0; for (let k = 0; k < N; k++) r = Math.max(r, Math.hypot(p[k * 3] - c.x, p[k * 3 + 2] - c.y)); this.rad = r; }
  }
  stepSim(dt) {
    const p = this.p, q = this.q, N = this.N;
    if (this.anim) {
      const a = this.anim; a.t += dt / 1.1; const e = a.t < 1 ? 1 - Math.pow(1 - a.t, 3) : 1;
      for (let k = 0; k < N; k++) {
        const i = k * 3, u = (k % this.nx) / (this.nx - 1), wave = Math.sin(Math.PI * Math.min(1, a.t)) * (4 + 4 * Math.sin(u * Math.PI * 2 - a.t * 9));
        p[i] = lerp(a.from[i], this.h[i], e); p[i + 2] = lerp(a.from[i + 2], this.h[i + 2], e); p[i + 1] = lerp(a.from[i + 1], this.h[i + 1], e) + Math.max(0, wave);
      }
      q.set(p);
      if (a.t >= 1) { this.anim = null; p.set(this.h); q.set(this.h); if (this.onTidy) this.onTidy(); }
      return;
    }
    for (let k = 0; k < N; k++) {
      const i = k * 3, cap = v => clamp(v, -3, 3), vx = cap((p[i] - q[i]) * 0.97), vy = cap((p[i + 1] - q[i + 1]) * 0.97), vz = cap((p[i + 2] - q[i + 2]) * 0.97);
      q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
      p[i] += vx; p[i + 1] += vy - GRAV * dt * dt; p[i + 2] += vz;
    }
    clothDogs(this, dt);
    for (const [k, fn] of this.grabs) { const t = fn(); p[k * 3] = t.x; p[k * 3 + 1] = t.y; p[k * 3 + 2] = t.z; }
    const C = this.C;
    for (let it = 0; it < 10; it++) {
      for (let c = 0; c < C.length; c += 4) {
        const a = C[c] * 3, b = C[c + 1] * 3, rest = C[c + 2], kind = C[c + 3];
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], dist = Math.hypot(dx, dy, dz) || 1e-6;
        let f;
        if (dist > rest) f = (dist - rest) / dist * (kind === 2 ? 0.25 : 0.5);
        else if (kind === 0) {
          f = (dist - rest) / dist * 0.45;
          const lift = (rest - dist) * 0.12;     // squashed cloth rucks up into folds
          p[a + 1] += lift; p[b + 1] += lift; q[a + 1] += lift; q[b + 1] += lift;
        } else continue;
        const wa = this.grabs.has(C[c]) ? 0 : 1, wb = this.grabs.has(C[c + 1]) ? 0 : 1, ws = wa + wb || 1;
        p[a] += dx * f * 2 * wa / ws; p[a + 1] += dy * f * 2 * wa / ws; p[a + 2] += dz * f * 2 * wa / ws;
        p[b] -= dx * f * 2 * wb / ws; p[b + 1] -= dy * f * 2 * wb / ws; p[b + 2] -= dz * f * 2 * wb / ws;
      }
    }
    for (let k = 0; k < N; k++) {
      const i = k * 3, g = clothGround(p[i], p[i + 2]);
      if (p[i + 1] > g + 9) { p[i + 1] = g + 9; q[i + 1] = p[i + 1]; }
      if (p[i + 1] < g) { p[i + 1] = g; q[i] += (p[i] - q[i]) * 0.55; q[i + 2] += (p[i + 2] - q[i + 2]) * 0.55; q[i + 1] = p[i + 1]; }
    }
  }
  sync() {
    if (this.rest > 31) return;   // asleep: nothing has moved since the last upload
    const pos = this.geo.attributes.position;
    for (let k = 0; k < this.N; k++) pos.setXYZ(k, this.p[k * 3], this.p[k * 3 + 1] + 0.15, this.p[k * 3 + 2]);
    pos.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}
// dogs scuff, drag, dig and press the cloth
const LYING = new Set(['lie', 'sleep', 'roll', 'crawl']);
function clothDogs(cl, dt) {
  const p = cl.p, q = cl.q;
  for (const d of ents) {
    const f = d.fwd, mvx = d.mv ? d.mv.x : 0, mvz = d.mv ? d.mv.y : 0, moving = mvx * mvx + mvz * mvz > 1e-4;
    const lying = LYING.has(d.poseName);
    const fx = d.fx;
    const grip = d.poseName === 'crawl' ? 0.75 : d.v > 40 * K ? 0.55 : 0.18;
    const nose = V2(d.pos.x + f.x * NOSE, d.pos.y + f.y * NOSE), paws = V2(d.pos.x + f.x * 9, d.pos.y + f.y * 9);
    for (let k = 0; k < cl.N; k++) {
      const i = k * 3, rx = p[i] - d.pos.x, rz = p[i + 2] - d.pos.y;
      if (rx * rx + rz * rz > 400) continue;
      const along = rx * f.x + rz * f.y, lat = rx * -f.y + rz * f.x;
      const g = clothGround(p[i], p[i + 2]);
      if (Math.abs(along) < 10 && Math.abs(lat) < 4.5 && p[i + 1] < g + 3) {
        if (moving) { p[i] += mvx * grip; p[i + 2] += mvz * grip; q[i] += mvx * grip; q[i + 2] += mvz * grip; }
        if (lying) p[i + 1] = Math.min(p[i + 1], g + 0.1);
      }
      if (fx.dig > 0.4) {   // front paws rake the cloth back under him and into a heap
        const px = p[i] - paws.x, pz = p[i + 2] - paws.y;
        if (px * px + pz * pz < 42) { const s = fx.dig * (d.p.gentle ? 0.3 : 1); p[i] -= f.x * 16 * s * dt; p[i + 2] -= f.y * 16 * s * dt; p[i + 1] += 3 * s * dt * (0.5 + rand()); }
      }
      if (fx.rub > 0.4) {   // face rubs shove it sideways
        const px = p[i] - nose.x, pz = p[i + 2] - nose.y;
        if (px * px + pz * pz < 30) { const sw = Math.sin(state.T * 5) * 12 * dt; p[i] += -f.y * sw + f.x * 3 * dt; p[i + 2] += f.x * sw + f.y * 3 * dt; p[i + 1] += 1.5 * dt; }
      }
    }
  }
}
export const CLOTHS = [
  new Cloth({ name: 'picnic', tex: 'picnic', x: BL.x, z: BL.z, rot: BL.rot, w: BL.w, d: BL.d, nx: 13, nz: 10 }),
  new Cloth({ name: 'murphy', tex: 'murphy', x: BEDS[0].x, z: BEDS[0].z, rot: BEDS[0].rot, w: 17, d: 12.5, nx: 8, nz: 6, bed: 0 }),
  new Cloth({ name: 'mali', tex: 'mali', x: BEDS[1].x, z: BEDS[1].z, rot: BEDS[1].rot, w: 17, d: 12.5, nx: 8, nz: 6, bed: 1 }),
  new Cloth({ name: 'third', tex: 'third', x: BEDS[2].x, z: BEDS[2].z, rot: BEDS[2].rot, w: 17, d: 12.5, nx: 8, nz: 6, bed: 2 }),
];
export const clothMeshes = CLOTHS.map(c => c.mesh);
export const bedBlanket = i => CLOTHS[1 + i];
export const bedMade = i => { const c = bedBlanket(i); return c.mess() < 0.3; };
export function clothHeight(x, z) { let h = 0; for (const c of CLOTHS) { const n = c.nearest(x, z); if (n.d < 3.2) h = Math.max(h, c.p[n.k * 3 + 1] - groundAtXZ(x, z) + 0.2); } return h; }
{ // a mess stays a mess between visits
  const saved = store.get('meadow-cloth-v1');
  if (saved) for (const c of CLOTHS) { const a = saved[c.name]; if (a && a.length === c.N * 3) { c.p.set(a); c.q.set(a); c.sync(); } }
}
export function saveCloth() { const o = {}; for (const c of CLOTHS) o[c.name] = Array.from(c.p, v => Math.round(v * 100) / 100); store.set('meadow-cloth-v1', o); }
