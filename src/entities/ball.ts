import type { Dog } from './dog';
import * as THREE from 'three';
import { state } from '../core/state';
import { V2, clamp, rand, rr } from '../core/util';
import { G, GRAV, cellIdx, cols } from '../world/layout';
import { BALL, BALL_R } from '../world/decor';
import { ballMesh } from '../world/mesh';
import { dogs } from './registry';
import { randLand } from '../nav/path';
import { groundAtXZ } from './behaviours';

// ================= the ball =================
export const SB: { pos: THREE.Vector2; vel: THREE.Vector2; y: number; vy: number; air: number; spin: number; q: THREE.Quaternion; last: Dog | null; touchT: number[]; streak: number[]; cd: number[] } = { pos: V2(BALL.x, BALL.z), vel: V2(0, 0), y: BALL_R, vy: 0, air: 0, spin: 0, q: new THREE.Quaternion(), last: null, touchT: [-99, -99], streak: [0, 0], cd: [0, 0] };

export const ballLand = (x, z) => { const c = cellIdx(x, z); if (c < 0 || !G.walk[c]) return false; const col = cols[c]!; return (col.type === 'grass' || col.type === 'path' || col.type === 'sand') && !col.jetty && !col.bridge; };
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _nose = new THREE.Vector3();
// ball physics: momentum, gravity and bounces, rolling resistance by surface, solid trees, rocks and dogs

const ROLL = { grass: 0.95, path: 0.45, sand: 2.4 };
function ballKick(d, dirx, dirz, speed, lift, fine) {
  const b = SB, a = Math.atan2(dirz, dirx) + (rand() - 0.5) * (fine ? 0.1 : 0.26), s = speed * (fine ? rr(0.93, 1.07) : rr(0.85, 1.15));
  const ux = Math.cos(a), uz = Math.sin(a), along = b.vel.x * ux + b.vel.y * uz, px = b.vel.x - along * ux, pz = b.vel.y - along * uz;
  const ns = Math.max(s, along * 0.9);       // a touch redirects the ball; it doesn't stack speed on speed
  b.vel.set(ux * ns + px * 0.25, uz * ns + pz * 0.25);
  if (b.air < 0.05) b.vy = Math.max(b.vy, s * (lift || 0) * rr(0.4, 1));
  b.spin = (rand() - 0.5) * (fine ? 0.35 : 1.2);   // a little side spin makes the ball curl
  b.cd[d.idx] = 0.18; b.touchT[d.idx] = state.T;
  if (b.last === d) b.streak[d.idx]++; else { b.streak[d.idx] = 1; b.streak[1 - d.idx] = 0; }
  b.last = d;
}
export function updateBall(dt) {
  const b = SB;
  const steps = Math.max(1, Math.ceil(b.vel.length() * dt / 1.5));
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const gNow = groundAtXZ(b.pos.x, b.pos.y);
    const onGround = b.y - BALL_R <= gNow + 0.05 && b.vy <= 0.5;
    // rolling resistance on the ground, a touch of drag in the air, and curl from spin
    const c = cellIdx(b.pos.x, b.pos.y), type = c >= 0 && cols[c] ? cols[c].type : 'grass';
    b.vel.multiplyScalar(Math.exp(-(onGround ? (ROLL[type] || 0.95) : 0.08) * h));
    if (b.spin) { const sp = b.vel.length(); if (sp > 2) { const a = b.spin * h * sp / 60; const cs = Math.cos(a), sn = Math.sin(a); b.vel.set(b.vel.x * cs - b.vel.y * sn, b.vel.x * sn + b.vel.y * cs); } b.spin *= Math.exp(-1.5 * h); }
    if (onGround && b.vel.length() < 0.4) b.vel.set(0, 0);
    // horizontal move with walls: a step up the ball can't climb, a tree or rock, water or the edge
    const nx = b.pos.x + b.vel.x * h, nz = b.pos.y + b.vel.y * h;
    const blocked = (x, z) => { if (!ballLand(x, z)) return true; const g = groundAtXZ(x, z); return g > b.y - BALL_R + 1.2; };
    if (!blocked(nx, nz)) b.pos.set(nx, nz);
    else {
      const bx = blocked(nx, b.pos.y), bz = blocked(b.pos.x, nz);
      if (bx) b.vel.x *= -0.45; if (bz) b.vel.y *= -0.45; if (!bx && !bz) { b.vel.multiplyScalar(-0.45); }
      const a = (rand() - 0.5) * 0.3, cs = Math.cos(a), sn = Math.sin(a); b.vel.set(b.vel.x * cs - b.vel.y * sn, b.vel.x * sn + b.vel.y * cs);
      if (!bx && !blocked(nx, b.pos.y)) b.pos.x = nx; if (!bz && !blocked(b.pos.x, nz)) b.pos.y = nz;
    }
    // vertical: gravity, bounce, roll off steps
    const g = groundAtXZ(b.pos.x, b.pos.y);
    b.vy -= GRAV * h; b.y += b.vy * h;
    if (b.y - BALL_R < g) {
      b.y = g + BALL_R;
      if (b.vy < -18) { b.vy = -b.vy * 0.48; b.vel.multiplyScalar(0.92); } else b.vy = 0;
    }
  }
  b.air = Math.max(0, b.y - BALL_R - groundAtXZ(b.pos.x, b.pos.y));
  for (const d of dogs) {
    b.cd[d.idx] = Math.max(0, b.cd[d.idx] - dt);
    if (d.poseName === 'sleep') continue;
    // the body is solid: the ball bounces off it and picks up some of the dog's speed
    const f = d.fwd, ax = d.pos.x - f.x * 8, az = d.pos.y - f.y * 8, bx = d.pos.x + f.x * 2.5, bz = d.pos.y + f.y * 2.5;
    const lx = bx - ax, lz = bz - az, tt = clamp(((b.pos.x - ax) * lx + (b.pos.y - az) * lz) / (lx * lx + lz * lz), 0, 1);
    const cx = ax + lx * tt, cz = az + lz * tt, ox = b.pos.x - cx, oz = b.pos.y - cz, od = Math.hypot(ox, oz) || 1, m = BALL_R + 2.6;
    if (od < m && b.air < 8) {
      const nx2 = ox / od, nz2 = oz / od, px = cx + nx2 * m, pz = cz + nz2 * m;
      if (ballLand(px, pz)) b.pos.set(px, pz);
      const rvx = b.vel.x - f.x * d.v, rvz = b.vel.y - f.y * d.v, vn = rvx * nx2 + rvz * nz2;
      if (vn < 0) { b.vel.x -= 1.2 * vn * nx2; b.vel.y -= 1.2 * vn * nz2; }
    }
    // nose and front paws: a touch
    d.headJ.localToWorld(_nose.set(13, 4.5, 0));
    const hx = b.pos.x - _nose.x, hz = b.pos.y - _nose.z, hd = Math.hypot(hx, hz);
    if (hd < BALL_R + 1.4 && _nose.y < b.y + BALL_R + 2 && !b.cd[d.idx]) {
      let dx = hx / (hd || 1), dz = hz / (hd || 1);
      const want = d.kickDir;               // the dog's intended line, if it has one
      if (want) { const wv = d.gait === 'dribble' && d.p.eager ? 0.85 : 0.65; dx = dx * (1 - wv) + want.x * wv; dz = dz * (1 - wv) + want.y * wv; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      const spd = d.gait === 'dribble' ? d.v * 1.05 + 9 : Math.max(d.v * 1.05, d.p.eager ? 14 : 9);
      ballKick(d, dx, dz, spd, spd > 80 ? 0.2 : 0.06, d.gait === 'dribble' && d.p.eager);
    }
  }
  const sp = b.vel.length();
  if (sp > 0.01) { _ax.set(b.vel.y, 0, -b.vel.x).normalize(); b.q.premultiply(_q.setFromAxisAngle(_ax, sp * dt / BALL_R)); }
  ballMesh.position.set(b.pos.x, b.y, b.pos.y); ballMesh.quaternion.copy(b.q);
}
export const ballPt = () => new THREE.Vector3(SB.pos.x, SB.y, SB.pos.y);
export function steerTo(d, x, z, direct) {
  if (!d.goal || !d.goal.ball) { const g: any = { ball: true, tp: V2(x, z), arrive: 0.6, ignoreOther: true, path: null, k: 0, repath: 0, fail: 0, direct }; g.pt = () => g.tp; d.goal = g; }
  else { d.goal.tp.set(x, z); d.goal.direct = direct; }
}
export const validCell = (x, z) => { const c = cellIdx(x, z); if (c < 0 || !G.walk[c]) return false; const d = Math.hypot(x, z); return d < 300; };
export function lineTarget(from, ang, spread) {
  for (let k = 0; k < 14; k++) {
    const a = ang + (rand() - 0.5) * 2 * spread * (1 + k * 0.15), L = rr(90, 150), x = from.x + Math.cos(a) * L, z = from.y + Math.sin(a) * L;
    let ok = true; for (let t = 0.2; t <= 1; t += 0.2) if (!ballLand(from.x + Math.cos(a) * L * t, from.y + Math.sin(a) * L * t)) { ok = false; break; }
    if (ok && validCell(x, z)) return V2(x, z);
  }
  return null;
}
export function dribbleTarget(from) { return randLand(from.x, from.y, 90, 160); }

export function grabWithMouth(d, cl) {
  const n = d.headJ.localToWorld(new THREE.Vector3(13, 3, 0)), near = cl.nearest(n.x, n.z);
  const k = near.k, v = new THREE.Vector3();
  cl.grabs.set(k, () => d.headJ.localToWorld(v.set(13, 3, 0)));
  d.mouth = { cl, k };
}
export function releaseGrab(d) { if (d.mouth) { d.mouth.cl.grabs.delete(d.mouth.k); d.mouth = null; } }
