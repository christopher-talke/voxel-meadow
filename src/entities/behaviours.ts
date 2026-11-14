import type { Dog } from './dog';
import * as THREE from 'three';
import { V2, V3, clamp, headingTo, lerp, rand, rr, smooth, wrapA } from '../core/util';
import { scene } from '../render/stage';
import { B, FIELD, G, JETTY, K, WATER_Y, WOODS, bedTop, cellIdx, colAt, colXZ, deckH, gyAt, idxOf, roofTop } from '../world/layout';
import { LOOK, TREES } from '../world/decor';
import { todKey } from '../sim/sky';
import { dropTex, puff } from '../fx/sprites';
import { SHALLOWS, bankNear, cellPt, nearestWalk, randLand } from '../nav/path';

// ================= dogs =================
const BASE = { lift: 0, pitch: 0, roll: 0, hp: 0, hr: 0, hyb: 0, nkx: 0, nky: 0, tr: 0, tc: 0, fl: 0, fr: 0, bl: 0, br: 0, wag: 0.22, wagSpd: 6, rate: 5 };
export const POSES = {
  stand: {},
  // Murphy lies curled, head resting over his front legs; Mali lies flat with her head down between her paws
  lieCurl: { lift: -10.2, roll: 0.3, hp: -0.15, hyb: 0.55, nkx: 1, nky: -6.5, tr: 0.3, tc: -1.25, fl: 1.45, fr: 1.3, bl: 1.35, br: 1.5, wag: 0.08, wagSpd: 3, rate: 3 },
  lieFlat: { lift: -10.8, hp: -0.06, nkx: 2.5, nky: -10.5, tr: 0.35, fl: 1.5, fr: 1.5, bl: 1.45, br: 1.45, wag: 0.06, wagSpd: 2, rate: 3 },
  crawl: { lift: -10.8, pitch: -0.04, hp: -0.12, nkx: 1, nky: -4, tr: 0.05, fl: 1.4, fr: 1.4, bl: -1.3, br: -1.3, wag: 0.35, wagSpd: 9, rate: 5 },
  dig: { lift: -4, pitch: -0.38, hp: -0.55, nky: -2, tr: -0.5, fl: 0.7, fr: 0.7, wag: 0.5, wagSpd: 11, rate: 7 },
  tug: { lift: -3, pitch: 0.05, hp: -0.35, nky: -2, tr: -0.45, fl: 0.25, fr: 0.25, bl: -0.15, br: -0.15, wag: 0.55, wagSpd: 12, rate: 6 },
  facerub: { lift: -7.5, pitch: -0.38, hp: -0.55, nky: -3, tr: -0.5, fl: 1.25, fr: 1.25, wag: 0.6, wagSpd: 12, rate: 5 },
  dribble: { lift: -1.2, pitch: -0.06, hp: -0.5, tr: -0.35, wag: 0.5, wagSpd: 14, rate: 7 },
  sniff: { lift: -1.2, pitch: -0.1, hp: -0.75, tr: -0.25, wag: 0.3, wagSpd: 9 },
  sit:   { lift: -6.4, pitch: 0.8, hp: -0.6, tr: -0.75, bl: 1.55, br: 1.55, wag: 0.28, wagSpd: 5, rate: 4 },
  lie:   { lift: -10.5, hp: -0.12, tr: 0.3, fl: 1.45, fr: 1.45, bl: 1.45, br: 1.45, wag: 0.12, wagSpd: 4, rate: 3 },
  sleep: { lift: -13.6, roll: 1.36, hp: -0.35, tr: 0.9, fl: 0.6, fr: 0.35, bl: -0.15, br: 0.2, wag: 0, wagSpd: 2, rate: 1.6 },
  roll:  { lift: -12.8, roll: 2.95, hp: -1.0, tr: 0.2, fl: 0.5, fr: 0.2, bl: -0.3, br: -0.05, wag: 0.5, wagSpd: 10, rate: 3.5 },
  handL: { lift: -6.4, pitch: 0.8, hp: -0.4, tr: -0.75, fl: -1.15, bl: 1.55, br: 1.55, wag: 0.5, wagSpd: 9, rate: 5 },
  handR: { lift: -6.4, pitch: 0.8, hp: -0.4, tr: -0.75, fr: -1.15, bl: 1.55, br: 1.55, wag: 0.5, wagSpd: 9, rate: 5 },
  catCurl: { lift: -10.9, roll: 0.08, hp: -0.55, hyb: 1.15, nkx: -1.5, nky: -6.8, tr: 1.95, tc: -1.8, fl: -1.4, fr: -1.4, bl: 1.5, br: 1.5, wag: 0, wagSpd: 2, rate: 1.6 },
  catLoaf: { lift: -10.8, hp: -0.2, nkx: 0, nky: -6.5, tr: 1.25, tc: -0.7, fl: -1.3, fr: -1.3, bl: 1.45, br: 1.45, wag: 0.04, wagSpd: 2, rate: 3 },
  leap: { lift: -1, pitch: -0.3, hp: 0.1, tr: 0.3, fl: -0.9, fr: -0.9, bl: 0.95, br: 0.95, wag: 0.3, wagSpd: 8, rate: 10 },
  stalk: { lift: -9.8, pitch: -0.1, hp: -0.3, nky: -3.2, tr: -0.1, tc: 0.4, fl: 1.25, fr: 1.25, bl: 1.2, br: 1.2, wag: 0.1, wagSpd: 6, rate: 4 },
  swat: { lift: -9, pitch: -0.28, hp: -0.7, nky: -2, tr: 0.2, fl: 0.8, fr: -1.35, bl: 1.2, br: 1.2, wag: 0.3, wagSpd: 8, rate: 16 },
  swim: { lift: -5.6, pitch: 0.12, hp: -0.15, nky: 1.5, tr: 0.25, wag: 0.1, wagSpd: 4, rate: 6 },
  climbA: { lift: -1, pitch: 1.4, hp: -0.5, tr: 0.2, fl: -1.25, fr: -0.45, bl: 0.9, br: 0.15, wag: 0.2, wagSpd: 3, rate: 9 },
  climbB: { lift: -1, pitch: 1.4, hp: -0.5, tr: 0.2, fl: -0.45, fr: -1.25, bl: 0.15, br: 0.9, wag: 0.2, wagSpd: 3, rate: 9 },
  bow:   { lift: -4.8, pitch: -0.45, hp: 0.65, tr: -0.6, fl: 1.11, fr: 1.11, wag: 0.55, wagSpd: 16, rate: 7 },
  drink: { lift: -3, pitch: -0.25, hp: -0.85, fl: 0.3, fr: 0.3, wag: 0.15, wagSpd: 5, rate: 4 },
  shake: { rate: 8, wag: 0.4, wagSpd: 14 },
  cower: { lift: -3, pitch: -0.12, hp: -0.12, tr: 0.85, wag: 0.04, wagSpd: 3, fl: 0.15, fr: 0.15, rate: 10 },
};
for (const k in POSES) POSES[k] = Object.assign({}, BASE, POSES[k]);
export const PKEYS = ['lift', 'pitch', 'roll', 'hp', 'hr', 'hyb', 'nkx', 'nky', 'tr', 'tc', 'fl', 'fr', 'bl', 'br', 'wag', 'wagSpd'];
// who they were: Murphy energetic, sweet and nervous; Mali gentle, slow, with energy in bursts
export const PERSONA: Record<string, any> = {
  murphy: { swimP: 0.55, speed: { walk: 1.2, sniffwalk: 1.25, trot: 1.15, run: 1.05, wade: 0.75 }, stride: 0.8, bounce: 1.5, turn: 1.3, poseRate: 1.35,
    look: [0.6, 1.8], lookRate: 7, tilt: 0.22, wag: 1.35, wagSpd: 1.4, tail: 0.1, idle: 0.6, drain: 0.7, nervous: 1, fidget: true, eager: true, lie: 'lieCurl', pro: 'his', curious: 1,
    w: { wander: 3.2, sniff: 3.5, sit: 0.8, sunbathe: 0.5, zoomies: 1.4, visit: 2, adventure: 1.6, hello: 0.5, nap: 0.7, ball: 2.2, tummy: 0.9, rub: 0.8 },
    labels: { wander: 'Trotting about', sniff: 'Nose to the ground', sit: 'Sitting (for now)', sun: 'Lying in the sun' } },
  mali: { swimP: 0.4, speed: { walk: 0.72, sniffwalk: 0.8, trot: 0.85, run: 1.25, wade: 1, dribble: 0.9 }, stride: 1.25, bounce: 0.55, turn: 0.7, poseRate: 0.6,
    look: [3, 7], lookRate: 2.2, tilt: 0.1, wag: 1.1, wagSpd: 0.55, tail: -0.05, idle: 1.5, drain: 1.1, bursty: true, gentle: true, spotThief: true, lie: 'lieFlat', pro: 'her', curious: 0.6,
    w: { wander: 2, sniff: 2.6, sit: 2.2, sunbathe: 2.6, zoomies: 0.9, visit: 1, adventure: 1.5, hello: 0, nap: 1.3, ball: 0, tummy: 0, rub: 0 },
    labels: { wander: 'Pottering about', sniff: 'Taking her time sniffing', sit: 'Sitting quietly', sun: 'Soaking up the sun' } },
  // Bobby: senior, calm and unhurried. Placeholder temperament, to be refined.
  bobby: { swimP: 0.12, size: [0.92, 0.75, 1.08], speed: { walk: 0.62, sniffwalk: 0.75, trot: 0.75, run: 1, wade: 0.9, dribble: 0.8 }, stride: 1.3, bounce: 0.4, turn: 0.6, poseRate: 0.55,
    look: [3.5, 8], lookRate: 1.8, tilt: 0.08, wag: 0.9, wagSpd: 0.5, tail: -0.1, idle: 1.8, drain: 1.3, gentle: true, calm: true, lie: 'lieFlat', pro: 'his', tidy: 2.2, moody: true, curious: 0.25,
    w: { wander: 1.8, sniff: 3, sit: 2.4, sunbathe: 3, zoomies: 0, visit: 0.7, adventure: 0.4, hello: 0.5, nap: 2.4, ball: 0, tummy: 0, rub: 0, grump: 1.6 },
    labels: { wander: 'Pottering about', sniff: 'Having a good sniff', sit: 'Sitting quietly', sun: 'Soaking up the sun' } },
};
const CATP = Object.assign({}, PERSONA.bobby, {
  cat: true, size: [0.68, 0.54, 0.68], tidy: 0, moody: false, lie: 'catLoaf', pro: 'their', stride: 1.8, bounce: 0.3, poseRate: 0.7, wag: 0.25, wagSpd: 0.8, tail: 0, gentle: true, idle: 1.3, drain: 1.0,
  speed: { walk: 0.9, sniffwalk: 0.9, trot: 0.85, run: 1, wade: 0.8, dribble: 1 },
  w: { wander: 1.6, sniff: 2, sit: 3, sunbathe: 3.5, zoomies: 0, visit: 0.4, adventure: 0, hello: 0, nap: 3, ball: 0, tummy: 0, rub: 0, grump: 0, climb: 1.6, perch: 1.6, fish: 1.3, ambush: 2.2 },
  labels: { wander: 'Prowling about', sniff: 'Investigating something', sit: 'Sitting like a statue', sun: 'Sunning themselves' } });
PERSONA.cat1 = Object.assign({}, CATP, { swish: 0.55 }); PERSONA.cat2 = Object.assign({}, CATP, { swish: 1.15, labels: { wander: 'Strolling about', sniff: 'Investigating something', sit: 'Sitting like a statue', sun: 'Sunning themselves' } });
export const SPEED = { dribble: 215 * K, crawl: 9 * K, walk: 30 * K, sniffwalk: 13 * K, trot: 50 * K, run: 105 * K, wade: 16 * K };
export const dogMat = new THREE.MeshLambertMaterial();
export const dogMeshes: THREE.InstancedMesh[] = [];



const waterOK = (x, z) => { const c = colXZ(x, z); return c && (c.type === 'deep' || c.type === 'shallow') && !c.jetty; };
function swimPoint(d) {
  for (let n = 0; n < 30; n++) { const a = rand() * 6.283, r = rr(14, 42), x = d.pos.x + Math.cos(a) * r, z = d.pos.y + Math.sin(a) * r; const c = colXZ(x, z); if (c && c.type === 'deep' && waterOK(x, z)) return V2(x, z); }
  return V2(d.pos.x + 20, d.pos.y);
}
function paddle(d, dt, tgt, sp) {
  const want = headingTo(tgt.x - d.pos.x, tgt.y - d.pos.y);
  let best: any = null;
  for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const a = want + off, nx = d.pos.x + Math.cos(a) * sp * dt * 3, nz = d.pos.y - Math.sin(a) * sp * dt * 3;
    if (waterOK(nx, nz)) { best = a; break; }
  }
  if (best === null) best = want + 2.5;
  d.h = wrapA(d.h + clamp(wrapA(best - d.h), -2.2 * dt, 2.2 * dt));
  const f = d.fwd, nx = d.pos.x + f.x * sp * dt, nz = d.pos.y + f.y * sp * dt;
  if (waterOK(nx, nz)) d.pos.set(nx, nz);
  d.fakeV = sp * 0.8 * K; d.v = 0; d.poseName = 'swim';
  d.ovY = WATER_Y - 5.6 + Math.sin(d.phase * 0.9 + performance.now() * 0.0022) * 0.5;
  if (rand() < dt * 1.5) puff(dropTex, V3.set(d.pos.x + rr(-3, 3), WATER_Y + 1, d.pos.y + rr(-3, 3)).clone(), 0.7, 0.7, rr(2, 4), 0, rr(-3, 3), rr(-3, 3), 12);
}

// fish in the lake: little orange shapes drifting about the shallows; cats stalk them from the shore
export const FISH: any[] = [];
export let mkFish: () => any = () => new THREE.Group();
{
  const bodyM = new THREE.MeshLambertMaterial({ color: 0xff8f3a }), tailM = new THREE.MeshLambertMaterial({ color: 0xf4c26b });
  const mkFish0 = () => { const g: any = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.7, 1.5), bodyM), t = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.9, 0.4), tailM); t.position.x = -2.7; g.add(b); g.tail = t; g.add(t); return g; };
  mkFish = mkFish0;
  const spots = SHALLOWS.filter(c => fishStand({ x: c.i * B, z: c.j * B }));
  for (let n = 0; n < 12 && spots.length; n++) {
    const c = spots[Math.floor(rand() * spots.length)], m = mkFish(); m.scale.setScalar(1);
    const f = { m, x: c.i * B + rr(-6, 6), z: c.j * B + rr(-6, 6), hx: c.i * B, hz: c.j * B, h: rand() * 6.28, sp: rr(2, 4), scare: 0, caught: false, respawn: 0, tt: rr(1, 4), ph: rr(0, 6) };
    m.position.set(f.x, WATER_Y - 2.6, f.z); scene.add(m); FISH.push(f);
  }
}
export function updateFish(dt, t) {
  for (const f of FISH) {
    if (f.caught) { f.respawn -= dt; if (f.respawn <= 0) { f.caught = false; f.m.visible = true; f.x = f.hx; f.z = f.hz; } continue; }
    f.scare = Math.max(0, f.scare - dt); f.tt -= dt;
    if (f.tt <= 0) { f.h += rr(-1.4, 1.4); f.tt = rr(1.2, 4); }
    const sp = f.scare > 0 ? 20 : f.sp, nx = f.x + Math.cos(f.h) * sp * dt, nz = f.z - Math.sin(f.h) * sp * dt;
    if (waterOK(nx, nz) && Math.hypot(nx - f.hx, nz - f.hz) < 30) { f.x = nx; f.z = nz; } else { f.h += 1.9; f.tt = 0.5; }
    f.m.position.set(f.x, WATER_Y - 2.6 + Math.sin(t * 1.3 + f.ph) * 0.3, f.z); f.m.rotation.y = f.h; f.m.tail.rotation.y = Math.sin(t * (f.scare > 0 ? 24 : 9) + f.ph) * 0.5;
  }
}
// a dry, walkable standing spot beside the water near a fish
export function fishStand(f) {
  let best: any = null, bd = 1e9;
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
    const i = Math.round(f.x / B) + a, j = Math.round(f.z / B) + b, c = colAt(i, j);
    if (!c || (c.type !== 'sand' && c.type !== 'grass') || c.jetty || c.bridge || !G.walk[idxOf(i, j)]) continue;
    const d = Math.hypot(i * B - f.x, j * B - f.z); if (d < bd && d > 5) { bd = d; best = V2(i * B, j * B); }
  }
  return bd < 22 ? best : null;
}
export function pickFish(d) {
  const ok = FISH.filter(f => !f.caught && f.scare <= 0); let best: any = null, bd = 1e9;
  for (const f of ok) { const q = Math.hypot(f.x - d.pos.x, f.z - d.pos.y) + rand() * 60; if (q < bd && fishStand(f)) { bd = q; best = f; } }
  return best;
}
// a spot behind a tree, rock or bush as seen from a dog
export function hideSpot(dog, cat) {
  const cands: any[] = [];
  for (const t of TREES) {
    const ox = t[0] * B, oz = t[1] * B, dx = ox - dog.pos.x, dz = oz - dog.pos.y, dd = Math.hypot(dx, dz);
    if (dd < 22 || dd > 140) continue;
    const rb = 1.2 + 0.28 * t[2], k = (rb + 1) * B / dd, hx = ox + dx * k, hz = oz + dz * k, c = nearestWalk(hx, hz, true, 2);
    if (c < 0) continue; const q = cellPt(c);
    if (Math.hypot(q.x - hx, q.y - hz) > 8) continue;
    cands.push({ p: q, w: 1 / (1 + dd / 35) / (1 + Math.hypot(q.x - cat.pos.x, q.y - cat.pos.y) / 120) });
  }
  if (!cands.length) return null;
  let sum = 0; for (const c of cands) sum += c.w; let r = rand() * sum;
  for (const c of cands) { r -= c.w; if (r <= 0) return c.p; } return cands[0].p;
}

// where everyone sleeps (and shelters) together: a pile around Murphy's bed under the shelter roof
const PILE = { x: -73, z: 0 };
const PILE_SLOTS = { Murphy: [-60, 0], Mali: [-79, 11], Bobby: [-79, -11], Billy: [-63, 21], Ashy: [-63, -21] };
export function pileSlot(d) {
  const s = PILE_SLOTS[d.name] || [PILE.x + rr(-10, 10), PILE.z + rr(-10, 10)], c = nearestWalk(s[0], s[1], true, 3);
  const q = c >= 0 ? cellPt(c) : V2(s[0], s[1]); if (Math.hypot(q.x - s[0], q.y - s[1]) < 6) q.set(s[0], s[1]);
  return { pt: q, h: headingTo(PILE.x - q.x, PILE.z - q.y) + rr(-0.6, 0.6) + (d.p.cat ? 0 : Math.PI / 2) };
}
export const isNight = () => todKey === 'night';
export type StepOpts = Record<string, any>;
/** One beat of a behaviour: it starts on a dog, then updates each frame until it returns true. Steps keep their own scratch fields (t, tgt, stage ...). */
export interface Step {
  text?: string;
  start(d: Dog): void;
  update(d: Dog, dt: number): boolean | void;
  [scratch: string]: any;
}

export const S = {
  go: (pt, gait, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.goal = { pt, arrive: o.arrive || 4, ignoreOther: !!o.ignoreOther, path: null, k: 0, repath: 0, fail: 0 }; d.gait = gait; d.poseName = gait === 'sniffwalk' ? 'sniff' : gait === 'crawl' ? 'crawl' : 'stand'; d.look = o.look || 'forward'; this.t = 0; if (o.onStart) o.onStart(d); },
    update(d, dt) { this.t += dt; if (!d.goal || this.t > (o.timeout || 45)) { d.goal = null; return true; } return false; } }),
  hold: (pose, dur, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = pose; d.look = o.look || 'around'; d.lookFn = o.lookFn || null; d.pant = !!o.pant; this.t = 0; this.dur = (['shake', 'bow', 'cower'].includes(pose) || o.fixed) ? dur : dur * (d.p.idle || 1); if (o.onStart) o.onStart(d); },
    update(d, dt) { this.t += dt; if (o.onUpdate) o.onUpdate(d, dt, this.t); return this.t >= this.dur || (o.until && o.until(d, this.t)); } }),
  face: (hFn, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.faceH = hFn(d); d.poseName = 'stand'; d.look = 'forward'; this.t = 0; }, update(d, dt) { this.t += dt; return d.faceH === null || this.t > 4; } }),
  spin: (turns): Step => ({ start(d) { d.spinLeft = turns * Math.PI * 2; d.spinDir = rand() < 0.5 ? 1 : -1; d.poseName = 'stand'; d.look = 'forward'; }, update(d) { return d.spinLeft <= 0; } }),
  // cats: paw at a fish, maybe hook one
  swat: (f, o: StepOpts = {}): Step => ({ text: o.text || 'Going for the fish', start(d) { this.t = 0; this.did = false; d.poseName = 'swat'; d.look = 'point'; d.lookFn = () => V3.set(f.x, WATER_Y - 2, f.z); d.hop = 0.5; d.faceH = null; },
    update(d, dt) {
      this.t += dt;
      if (!this.did && this.t > 0.22) {
        this.did = true; for (let k = 0; k < 10; k++) puff(dropTex, new THREE.Vector3(f.x + rr(-2, 2), WATER_Y + 1, f.z + rr(-2, 2)), rr(0.5, 1), 0.7, rr(5, 10), 0, rr(-5, 5), rr(-5, 5), 18);
        if (!f.caught && Math.hypot(f.x - d.pos.x, f.z - d.pos.y) < 30 && rand() < (o.p || 0.34)) { f.caught = true; f.respawn = 30; f.m.visible = false; d.hasFish = true; d.fishT = 25; d.labelOverride = { text: 'Got one!', t: 2.5 }; d.wagBoost = 1; }
        else f.scare = 3;
      }
      return this.t > 0.7;
    } }),
  pounce: (dog): Step => ({ text: 'Pouncing!', start(d) { this.t = 0; this.hit = false; d.goal = { pt: () => V2(dog.pos.x, dog.pos.y), arrive: 10, ignoreOther: true, path: null, k: 0, repath: 0, fail: 0, direct: true }; d.gait = 'run'; d.poseName = 'stand'; d.look = 'forward'; d.hop = 1; },
    update(d, dt) {
      this.t += dt; const q = Math.hypot(dog.pos.x - d.pos.x, dog.pos.y - d.pos.y);
      if (!this.hit && (q < 17 || this.t > 2.2)) { this.hit = true; if (q < 30) dog.startle(d); }
      if (this.hit || !d.goal) { d.goal = null; return true; } return false;
    } }),
  // dogs: jump off the deck, paddle about, and get out again
  leap: (o): Step => ({ text: o.text || 'Jumping in!', start(d) { this.t = 0; this.from = V2(d.pos.x, d.pos.y); this.y0 = d.rootY; d.goal = null; d.poseName = 'leap'; d.look = 'forward'; d.gait = 'run'; d.faceH = null; },
    update(d, dt) {
      this.t += dt; const k = clamp(this.t / 0.95, 0, 1), f = d.fwd;
      d.pos.set(this.from.x + f.x * 30 * k, this.from.y + f.y * 30 * k); d.fakeV = 20 * K; d.ovY = lerp(this.y0, WATER_Y - 5.6, k * k) + Math.sin(k * Math.PI) * 7;
      if (k >= 1) { d.swimming = true; d.wet = 1; d.poseName = 'swim'; d.bigSplash(); return true; } return false;
    } }),
  swim: (dur, o: StepOpts = {}): Step => ({ text: o.text || 'Having a swim', start(d) { this.t = 0; this.tgt = null; this.tt = 0; d.poseName = 'swim'; d.look = 'forward'; },
    update(d, dt) { this.t += dt; this.tt -= dt; if (this.tt <= 0 || !this.tgt) { this.tgt = swimPoint(d); this.tt = rr(3, 6); } paddle(d, dt, this.tgt, 11); return this.t > dur; } }),
  swimOut: (): Step => ({ text: 'Heading back to shore', start(d) { this.t = 0; const c = nearestShallow(d.pos); this.tgt = V2(c.i * B, c.j * B); d.poseName = 'swim'; },
    update(d, dt) {
      this.t += dt; paddle(d, dt, this.tgt, 11);
      const c = colXZ(d.pos.x, d.pos.y);
      if ((c && c.type === 'shallow' && !c.jetty) || this.t > 40) { d.swimming = false; d.ovY = null; d.fakeV = 0; d.poseName = 'stand'; d.v = 0; d.gait = 'wade'; const q = nearestWalk(d.pos.x, d.pos.y, true, 8); if (q >= 0) { const w = cellPt(q); d.pos.set(w.x, w.y); } return true; }
      return false;
    } }),
  // cats: climb a vertical (x,z = the grip point, top = height above ground), shimmy up and down
  climb: (x, z, top, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = 'climbA'; d.look = 'forward'; this.t = 0; this.from = V2(d.pos.x, d.pos.y); d.climbOut = V2(d.pos.x, d.pos.y); d.elevT = top; d.onRoof = false; d.faceH = null; d.h = headingTo(x - d.pos.x, z - d.pos.y); },
    update(d, dt) { this.t += dt; const k = smooth(0, 0.9, this.t); d.pos.set(lerp(this.from.x, x, k), lerp(this.from.y, z, k)); d.poseName = Math.floor(this.t * 3.2) % 2 ? 'climbA' : 'climbB'; return d.elev >= top - 0.6 && this.t > 0.9; } }),
  down: (): Step => ({ start(d) { this.t = 0; this.stage = d.onRoof && d.roofBack ? 0 : 1; this.from = V2(d.pos.x, d.pos.y); d.poseName = 'stand'; },
    update(d, dt) {
      this.t += dt;
      if (this.stage === 0) {   // walk back across the roof to the pole
        const b = d.roofBack, dx = b.x - d.pos.x, dz = b.y - d.pos.y, dist = Math.hypot(dx, dz);
        if (dist < 1.5) { this.stage = 1; this.t = 0; this.from = V2(d.pos.x, d.pos.y); d.fakeV = 0; d.poseName = 'climbA'; d.onRoof = false; d.h = headingTo(d.climbX - d.pos.x, d.climbZ - d.pos.y) + Math.PI; return false; }
        d.h = headingTo(dx, dz); d.fakeV = 14 * K; d.poseName = 'stand'; d.pos.x += dx / dist * 14 * dt; d.pos.y += dz / dist * 14 * dt; d.elevT = roofTop(d.pos.x) - gyAt(d.pos.x, d.pos.y); return false;
      }
      d.elevT = 0; d.poseName = Math.floor(this.t * 3.2) % 2 ? 'climbA' : 'climbB';
      if (d.climbOut) { const k = smooth(0.3, 1.6, this.t); d.pos.set(lerp(this.from.x, d.climbOut.x, k), lerp(this.from.y, d.climbOut.y, k)); }
      if (d.elev < 0.8) { d.poseName = 'stand'; d.look = 'forward'; return true; } return false;
    } }),
  roofGo: (x, z, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = 'stand'; d.look = 'forward'; d.onRoof = true; },
    update(d, dt) {
      const dx = x - d.pos.x, dz = z - d.pos.y, dist = Math.hypot(dx, dz);
      if (dist < 1.2) { d.fakeV = 0; return true; }
      d.h = headingTo(dx, dz); d.poseName = 'stand'; d.fakeV = 14 * K; d.pos.x += dx / dist * 14 * dt; d.pos.y += dz / dist * 14 * dt; d.elevT = roofTop(d.pos.x) - gyAt(d.pos.x, d.pos.y); return false;
    } }),
  branchGo: (x, z, yTop, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = 'stand'; d.look = 'forward'; },
    update(d, dt) {
      const dx = x - d.pos.x, dz = z - d.pos.y, dist = Math.hypot(dx, dz);
      d.elevT = yTop - gyAt(d.pos.x, d.pos.y);
      if (dist < 0.8) { d.fakeV = 0; return true; }
      d.h = headingTo(dx, dz); d.poseName = 'stand'; d.fakeV = 11 * K; const st = Math.min(dist, 11 * dt); d.pos.x += dx / dist * st; d.pos.y += dz / dist * st; return false;
    } }),
  call: (fn): Step => ({ start(d) { fn(d); }, update() { return true; } }),
};

// places the dogs can go together; act(dog, side, point) returns steps
const JET_END = V2((JETTY.i1 - 1) * B, (JETTY.j0 + JETTY.j1) / 2 * B);
const LOOK_PT = V2(LOOK.i * B, LOOK.j * B + 4);
export const PLACES = {
  jetty: { name: 'the jetty', at: () => V2(JETTY.i0 * B - 6, (JETTY.j0 + JETTY.j1) / 2 * B),
    act: (d, s) => {
      const walkOut = [S.go(V2(JET_END.x - 2 - s * 2, JET_END.y + (s ? -4 : 4)), 'walk', { arrive: 3, ignoreOther: true, text: 'Walking down the jetty' }), S.face(() => 0)];
      if (rand() < (d.p.swimP || 0)) {
        const dry = randLand(JET_END.x - 60, JET_END.y, 14, 30);
        return walkOut.concat(d.p.nervous ? [S.hold('cower', 0.9, { text: 'Working up the courage', look: 'jumpy' }), S.hold('sit', 1.2, { text: 'Working up the courage' })] : [S.hold('stand', 0.8, { text: 'Eyeing off the water', look: 'forward' })],
          [S.go(V2(JET_END.x - 26, JET_END.y), 'walk', { arrive: 3, ignoreOther: true }), S.go(V2(JET_END.x - 6, JET_END.y), 'run', { arrive: 3, ignoreOther: true, text: 'Running up' }),
          S.leap({}), S.swim(rr(9, 16)), S.swimOut(), S.go(dry, 'walk', { text: 'Back on the sand', arrive: 6 }), S.hold('shake', 1.1, { text: 'Shaking off the water', onStart: d2 => d2.splash() }), S.hold('stand', 0.8)]);
      }
      return walkOut.concat([S.hold('sit', rr(9, 13), { text: 'Watching the water' }), S.hold('lie', rr(6, 9), { text: 'Watching the water' }), S.hold('stand', 0.6)]);
    } },
  beach: { name: 'the beach', at: p => { const c = nearestShallow(p); return V2(c.i * B - 10, c.j * B - 6); },
    act: (d, s, p) => {
      const c = nearestShallow(p || d.pos), near = SHALLOWS.filter(n => { const q = Math.hypot(n.i - c.i, n.j - c.j); return q > 3 && q < 11; }), pts = [c].concat([0, 1].map(() => near.length ? near[Math.floor(rand() * near.length)] : c));
      const dry = randLand(c.i * B, c.j * B, 14, 30);
      const unsure = d.p.nervous ? [S.go(randLand(c.i * B, c.j * B, 8, 14), 'walk', { text: 'Not sure about the water', arrive: 4 }), S.face(() => headingTo(c.i * B - dry.x, c.j * B - dry.y)), S.hold('cower', 0.8, { text: 'Not sure about the water', look: 'jumpy' }), S.hold('sniff', 2.2, { text: 'Not sure about the water', fixed: true })] : [];
      return unsure.concat([S.go(V2(pts[0].i * B + s * 5, pts[0].j * B), 'wade', { text: d.p.nervous ? 'Bravely paddling' : 'Paddling', arrive: 6 }), S.hold('stand', 1.6, { text: 'Paddling' }),
        S.go(V2(pts[1].i * B, pts[1].j * B + s * 5), 'wade', { arrive: 6 }), S.hold('sniff', rr(1.5, 2.5), { look: 'sweep' }), S.go(V2(pts[2].i * B, pts[2].j * B), 'wade', { arrive: 6 }), S.hold('stand', rr(1, 2)),
        S.go(dry, 'walk', { text: 'Back on the sand', arrive: 6 }), S.hold('shake', 1.1, { text: 'Shaking off the water', onStart: d2 => d2.splash() }), S.hold('stand', 0.8)]);
    } },
  lookout: { name: 'the lookout', at: () => V2(LOOK_PT.x, LOOK_PT.y + 30),
    act: (d, s) => [S.go(V2(LOOK_PT.x + (s ? 6 : -6), LOOK_PT.y + 2), 'walk', { arrive: 4, ignoreOther: true, text: 'Climbing to the lookout' }), S.face(d2 => headingTo(-d2.pos.x, -d2.pos.y)),
      S.hold('sit', rr(7, 10), { text: 'Taking in the view' }), S.hold('lie', rr(6, 9), { text: 'Taking in the view' }), S.hold('stand', 0.6)] },
  woods: { name: 'the woods', at: () => V2((WOODS.i + 12) * B, WOODS.j * B),
    act: (d, s, p) => { const c = p || V2(WOODS.i * B, WOODS.j * B), out: Step[] = []; for (let k = 0; k < 3; k++) { out.push(S.go(randLand(c.x, c.y, 15, 60), 'sniffwalk', { text: 'Exploring the woods' }), S.hold('sniff', rr(2, 3.5), { look: 'sweep' })); } out.push(S.hold('stand', 1)); return out; } },
  field: { name: 'the flower field', at: () => V2((FIELD.i - 10) * B, FIELD.j * B),
    act: (d, s, p) => [S.go(randLand((p || V2(FIELD.i * B, FIELD.j * B)).x, (p || V2(FIELD.i * B, FIELD.j * B)).y, 10 + s * 20, 40 + s * 20), 'walk', { text: 'In the flower field' }),
      S.hold('lie', 0.9, { look: 'forward' }), S.hold('roll', rr(3.5, 5), { text: 'Rolling in the flowers', look: 'none' }), S.hold('lie', 0.9), S.hold('stand', 0.5), S.hold('shake', 0.9, { text: 'Shaking off the petals' }), S.hold('stand', 0.8)] },
  drink: { name: 'the water', at: p => p,
    act: (d, s, p) => { const b = bankNear(p.x, p.y, s ? d.other.pos : null) || bankNear(p.x, p.y); if (!b) return [S.hold('stand', 1)]; return [S.go(b.p, 'walk', { arrive: 4, text: 'Off for a drink' }), S.face(() => b.h), S.hold('drink', rr(4, 7), { text: 'Having a drink', look: 'none', onStart: d2 => { d2.thirst = 0; } }), S.hold('stand', 1)]; } },
  spot: { name: 'over there', at: p => p,
    act: (d, s, p) => { const q = randLand(p.x, p.y, 4 + s * 14, 14 + s * 14); return [S.go(q, 'walk', { arrive: 5, text: 'Having a look around' }), rand() < 0.5 ? S.hold('sniff', rr(2.5, 4), { look: 'sweep' }) : S.hold('sit', rr(4, 7)), S.hold('stand', 1)]; } },
};
function nearestShallow(p) { let best = SHALLOWS[0], bd = 1e9; for (const c of SHALLOWS) { const d = Math.hypot(c.i * B - p.x, c.j * B - p.y); if (d < bd) { bd = d; best = c; } } return best; }

export const groundAtXZ = (x, z) => { const c = cellIdx(x, z); return c >= 0 ? G.gy[c] + deckH(x, z) + bedTop(x, z) : -999; };
