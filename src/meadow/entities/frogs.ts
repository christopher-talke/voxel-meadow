import * as THREE from 'three';
import { clamp, headingTo, lerp, seeded, smooth, wrapA } from '../../engine/core/util';
import { scene } from '../../engine/render/stage';
import { LAKE, WATER_Y } from '../world/layout';
import { G, colAt, colXZ, cols, idxOf, isWaterCol } from '../../engine/terrain/grid';
import { B } from '../../engine/core/scale';
import { UNIT } from '../../engine/render/mesher';
import { PADS, padY, type Pad } from '../world/pond';
import { env } from '../../engine/sky/sky';
import { ents } from './registry';
import { SFX, SND } from '../audio/sound';
import { dropTex, puff } from '../../engine/fx/sprites';

// ================= frogs: they sit on the lily pads and the banks, croak at dusk and plop away from cats =================
const { rand, rr } = seeded(5150);
const water = (x, z) => { const c = colXZ(x, z); return !!c && (c.type === 'deep' || c.type === 'shallow') && !c.jetty; };
// sandy and grassy cells right on the water's edge around the pond
const BANK: THREE.Vector2[] = [];
for (const c of cols) {
  if (!c || !(c.type === 'sand' || c.type === 'grass') || c.jetty || c.edge || !G.walk[idxOf(c.i, c.j)] || Math.hypot(c.i - LAKE.i, c.j - LAKE.j) > LAKE.r + 8) continue;
  let wet = false; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = colAt(c.i + di, c.j + dj); if (n && isWaterCol(n) && !n.jetty && !n.spill) wet = true; }
  if (wet) BANK.push(new THREE.Vector2(c.i * B, c.j * B));
}

// one voxel frog: [x, y, z, sx, sy, sz, colour key]; x points forward
const PARTS: [number, number, number, number, number, number, string][] = [
  [0, 0.95, 0, 2.6, 1.3, 2.3, 'skin'], [0.25, 0.4, 0, 2.1, 0.6, 1.9, 'belly'], [1.45, 1.35, 0, 1.3, 1.0, 2.0, 'skin'],
  [1.6, 2.05, 0.7, 0.65, 0.65, 0.65, 'eye'], [1.6, 2.05, -0.7, 0.65, 0.65, 0.65, 'eye'],
  [-0.9, 0.45, 1.3, 1.7, 0.7, 0.8, 'leg'], [-0.9, 0.45, -1.3, 1.7, 0.7, 0.8, 'leg'],
  [1.05, 0.25, 0.9, 0.5, 0.5, 0.45, 'leg'], [1.05, 0.25, -0.9, 0.5, 0.5, 0.45, 'leg'],
  [1.85, 0.85, 0, 0.5, 0.55, 1.2, 'throat'],
];
const SKINS = [[0x5e9a3c, 0x4d8431], [0x7aa944, 0x5f8f34], [0x4f7f3a, 0x41692f]];
const N = 7, SCALE = 0.85;
export interface Frog { x: number; z: number; y: number; h: number; state: 'sit' | 'hop' | 'swim'; pad: Pad | null; t: number; hop: any; tgt: any; ph: number; croak: number; croakT: number; blink: number; }
export const FROGS: Frog[] = [];
const mesh = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial(), N * PARTS.length);
mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
{
  const c = new THREE.Color(), free = PADS.slice().sort(() => rand() - 0.5);
  for (let f = 0; f < N; f++) {
    const sk = SKINS[f % SKINS.length];
    const COL = { skin: sk[0], leg: sk[1], belly: 0xd9d48a, eye: 0x2b2a1e, throat: 0xe6dc9a };
    PARTS.forEach((p, k) => { c.setHex(COL[p[6]]).multiplyScalar(1 + rr(-0.04, 0.04)); mesh.setColorAt(f * PARTS.length + k, c); });
    const pad = free[f] || null, b = BANK[Math.floor(rand() * BANK.length)];
    const fr: Frog = { x: pad ? pad.x : b.x, z: pad ? pad.z : b.y, y: 0, h: rr(-3, 3), state: 'sit', pad, t: rr(3, 12), hop: null, tgt: null, ph: rr(0, 6), croak: 0, croakT: rr(4, 30), blink: 0 };
    if (pad) pad.frog = fr;
    FROGS.push(fr);
  }
}
const freePad = (fr: Frog, near = 60) => {
  const ok = PADS.filter(p => !p.frog && !p.claim && p.load < 0.2 && Math.hypot(p.x - fr.x, p.z - fr.z) < near && !ents.some(e => e.onPad === p));
  return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
};
function leave(fr: Frog) { if (fr.pad) { if (fr.pad.frog === fr) fr.pad.frog = null; fr.pad.load = 0; } fr.pad = null; }
function hopTo(fr: Frog, x: number, z: number, y: number, pad: Pad | null, into = false) {
  leave(fr);
  fr.hop = { x0: fr.x, z0: fr.z, y0: fr.y, x, z, y, pad, into, t: 0, dur: clamp(0.25 + Math.hypot(x - fr.x, z - fr.z) / 40, 0.3, 0.6) };
  if (pad) pad.frog = fr;
  fr.h = headingTo(x - fr.x, z - fr.z); fr.state = 'hop';
}
// plop into the water away from whatever spooked it
function flee(fr: Frog, fromX: number, fromZ: number) {
  const a0 = headingTo(fr.x - fromX, fr.z - fromZ);
  for (let n = 0; n < 10; n++) {
    const a = a0 + rr(-0.8, 0.8), d = rr(7, 13), x = fr.x + Math.cos(a) * d, z = fr.z - Math.sin(a) * d;
    if (water(x, z)) { hopTo(fr, x, z, WATER_Y - 1.9, null, true); return; }
  }
  hopTo(fr, fr.x + rr(-3, 3), fr.z + rr(-3, 3), WATER_Y - 1.9, null, true);
}
const groundY = (fr: Frog) => fr.pad ? padY(fr.pad) : water(fr.x, fr.z) ? WATER_Y - 1.9 : (() => { const c = colXZ(fr.x, fr.z); return c ? G.gy[idxOf(c.i, c.j)] : 0; })();
FROGS.forEach(fr => { fr.y = groundY(fr); });

const _o = new THREE.Object3D(), _fm = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
export function updateFrogs(dt: number, t: number) {
  const dusk = 1 - smooth(-2, 14, env.el);   // chattier from late afternoon into the night
  for (let f = 0; f < N; f++) {
    const fr = FROGS[f];
    fr.blink = Math.max(0, fr.blink - dt); if (rand() < dt * 0.25) fr.blink = 0.15;
    fr.croak = Math.max(0, fr.croak - dt);
    // anything big coming close sends a sitting frog into the water; so does a cat about to land on its pad
    if (fr.state === 'sit') {
      for (const e of ents) {
        const d = Math.hypot(e.pos.x - fr.x, e.pos.y - fr.z);
        if (d < 14 && e.v + (e.fakeV || 0) > 0.5 || d < 7 || (fr.pad && fr.pad.claim === e)) { flee(fr, e.pos.x, e.pos.y); if (SND.on) SFX.croak(_v.set(fr.x, 1, fr.z), 0.12); break; }
      }
    }
    if (fr.state === 'sit') {
      fr.t -= dt; fr.croakT -= dt * (0.25 + dusk * 1.5);
      if (fr.croakT <= 0) { fr.croakT = rr(6, 22); fr.croak = 0.55; if (SND.on && SND.ctx) SFX.croak(_v.set(fr.x, fr.y + 1, fr.z), 0.1 + 0.18 * dusk); }
      if (fr.pad) fr.pad.load = Math.max(fr.pad.load, 0.12);
      fr.y = groundY(fr);
      if (fr.t <= 0) {
        fr.t = rr(5, 16); const r = rand();
        if (r < 0.45) { const p = freePad(fr, 32); if (p) hopTo(fr, p.x + rr(-1, 1), p.z + rr(-1, 1), padY(p), p); }
        else if (r < 0.6 && BANK.length) { const b = BANK.filter(q => Math.hypot(q.x - fr.x, q.y - fr.z) < 26); if (b.length) { const q = b[Math.floor(rand() * b.length)]; const c = colXZ(q.x, q.y)!; hopTo(fr, q.x, q.y, G.gy[idxOf(c.i, c.j)], null); } }
        else if (r < 0.75) flee(fr, fr.x + rr(-1, 1), fr.z + rr(-1, 1));
        else fr.h += rr(-1.2, 1.2);
      }
    } else if (fr.state === 'hop') {
      const hp = fr.hop; hp.t += dt; const k = clamp(hp.t / hp.dur, 0, 1);
      const yEnd = hp.pad ? padY(hp.pad) : hp.y;
      fr.x = lerp(hp.x0, hp.x, k); fr.z = lerp(hp.z0, hp.z, k); fr.y = lerp(hp.y0, yEnd, k) + Math.sin(k * Math.PI) * (2 + Math.hypot(hp.x - hp.x0, hp.z - hp.z0) * 0.25);
      if (k >= 1) {
        fr.hop = null; fr.pad = hp.pad;
        if (hp.into) { fr.state = 'swim'; fr.tgt = null; fr.t = rr(4, 10); puff(dropTex, _v.set(fr.x, WATER_Y + 0.6, fr.z), 0.9, 0.6, rr(3, 6), 0, 0, 0, 14); }
        else { fr.state = 'sit'; if (fr.pad) fr.pad.tilt += 0.05; }
      }
    } else {   // swimming: only the eyes show; drift to a free pad or the bank and climb out
      fr.t -= dt;
      if (!fr.tgt && fr.t <= 0) { const p = freePad(fr, 70); fr.tgt = p ? { pad: p, x: p.x, z: p.z } : BANK.length ? (() => { const q = BANK[Math.floor(rand() * BANK.length)]; return { pad: null, x: q.x, z: q.y }; })() : null; }
      if (fr.tgt) {
        const dx = fr.tgt.x - fr.x, dz = fr.tgt.z - fr.z, d = Math.hypot(dx, dz);
        fr.h = wrapA(fr.h + clamp(wrapA(headingTo(dx, dz) - fr.h), -2 * dt, 2 * dt));
        const sp = 6 * dt, nx = fr.x + Math.cos(fr.h) * sp, nz = fr.z - Math.sin(fr.h) * sp;
        if (water(nx, nz)) { fr.x = nx; fr.z = nz; } else fr.h += 1.5 * dt;
        const p = fr.tgt.pad as Pad | null;
        if (p && (p.frog || p.claim || ents.some(e => e.onPad === p))) fr.tgt = null;
        else if (d < (p ? p.r + 2 : 6)) {
          if (p) hopTo(fr, p.x + rr(-1, 1), p.z + rr(-1, 1), padY(p), p);
          else { const c = colXZ(fr.tgt.x, fr.tgt.z); hopTo(fr, fr.tgt.x, fr.tgt.z, c ? G.gy[idxOf(c.i, c.j)] : 0, null); }
        }
      }
      if (fr.state === 'swim') fr.y = WATER_Y - 1.9 + Math.sin(t * 2 + fr.ph) * 0.1;
    }
    // pose the parts: back legs stretch out in a hop, the throat swells on a croak, eyes blink
    const airborne = fr.state === 'hop' ? Math.sin(Math.PI * clamp(fr.hop.t / fr.hop.dur, 0, 1)) : 0;
    const throat = fr.state === 'sit' ? 1 + 0.12 * Math.sin(t * 5 + fr.ph) + (fr.croak > 0 ? 0.9 * Math.sin(Math.PI * (fr.croak / 0.55)) : 0) : 1;
    _q.setFromAxisAngle(_up, fr.h); _fm.compose(_p.set(fr.x, fr.y, fr.z), _q, _s.setScalar(SCALE));
    for (let k = 0; k < PARTS.length; k++) {
      const P = PARTS[k];
      let px = P[0], py = P[1], sx = P[3], sy = P[4], sz = P[5];
      if (k === 5 || k === 6) { px -= airborne * 1.4; sx *= 1 + airborne * 0.9; py += airborne * 0.2; }
      if (k === 3 || k === 4) sy *= fr.blink > 0 ? 0.2 : 1;
      if (k === 9) { sz *= throat; sy *= throat; px += (throat - 1) * 0.25; }
      _o.position.set(px, py, P[2]); _o.rotation.set(0, 0, k === 0 ? airborne * 0.35 : 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
      _pm.multiplyMatrices(_fm, _o.matrix); mesh.setMatrixAt(f * PARTS.length + k, _pm);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}
