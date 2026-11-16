import * as THREE from 'three';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rand = mulberry32(20261110);
export const rr = (a, b) => a + (b - a) * rand();
/** A separate repeatable stream, so new features don't shift the shared sequence (and with it the meadow's layout). */
export function seeded(seed: number) { const r = mulberry32(seed); return { rand: r, rr: (a: number, b: number) => a + (b - a) * r() }; }
export function hash(i, j, s) { let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
export function noise(x, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
export const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const headingTo = (dx, dz) => Math.atan2(-dz, dx);
export const V2 = (x, z) => new THREE.Vector2(x, z);
export function jit(hex, amt = 0.06) {
  const f = 1 + (rand() - 0.5) * 2 * amt;
  const r = clamp(Math.round(((hex >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((hex >> 8) & 255) * f), 0, 255), b = clamp(Math.round((hex & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}
export function mixHex(a, b, t) {
  const A = [(a >> 16) & 255, (a >> 8) & 255, a & 255], Bc = [(b >> 16) & 255, (b >> 8) & 255, b & 255];
  return (Math.round(lerp(A[0], Bc[0], t)) << 16) | (Math.round(lerp(A[1], Bc[1], t)) << 8) | Math.round(lerp(A[2], Bc[2], t));
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function lineDist(px, pz, pts) { let m = 1e9; for (let k = 0; k < pts.length - 1; k++) m = Math.min(m, segDist(px, pz, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])); return m; }
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

export const V3 = new THREE.Vector3();

/** Looks up an element that index.html is known to contain. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing #' + id);
  return el as T;
}
