import * as THREE from 'three';
import { V2, V3, clamp, damp, headingTo, lerp, rand, rr, smooth, wrapA } from '../core/util';
import { camera, scene } from '../render/stage';
import { G, cellIdx, cols, gyAt } from '../terrain/grid';
import { K } from '../core/scale';
import { UNIT } from '../render/mesher';
import { WX, underRoof } from '../sky/sky';
import { dropTex, puff, zTex } from '../fx/sprites';
import { type WetUniforms, dampMark, wetFur, wetRand } from '../fx/wet';
import { canStep, cellPt, findPath, moved0, nearestWalk } from '../nav/path';

// ================= a voxel animal: rig, locomotion, gait, gaze, pose blending and the step queue =================
// The content subclasses Animal and supplies what makes an animal itself: pick() chooses the next behaviour,
// think() runs its standing urges each frame, and a few small hooks shape interrupts, wetness and poses.

/** Joint parameters every pose sets: body lift, pitch and roll, head, neck, tail, the four legs and the wag. */
export const PKEYS = ['lift', 'pitch', 'roll', 'hp', 'hr', 'hyb', 'nkx', 'nky', 'tr', 'tc', 'fl', 'fr', 'bl', 'br', 'wag', 'wagSpd'];
/** The neutral pose; a content pose table lists only what differs from it. */
export const BASE_POSE = { lift: 0, pitch: 0, roll: 0, hp: 0, hr: 0, hyb: 0, nkx: 0, nky: 0, tr: 0, tc: 0, fl: 0, fr: 0, bl: 0, br: 0, wag: 0.22, wagSpd: 6, rate: 5 };
/** Gait speeds in world units per second, before each animal's own multipliers. */
export const SPEED = { dribble: 215 * K, crawl: 9 * K, walk: 30 * K, sniffwalk: 13 * K, trot: 50 * K, run: 105 * K, wade: 16 * K };
export const animalMat = new THREE.MeshLambertMaterial();
export const dogMeshes: THREE.InstancedMesh[] = [];
export const animalMeshes: THREE.InstancedMesh[] = [];
/** Animals that others steer around while walking. */
export const crowd: Animal[] = [];

export type StepOpts = Record<string, any>;
/** One beat of a behaviour: it starts on a dog, then updates each frame until it returns true. Steps keep their own scratch fields (t, tgt, stage ...). */
export interface Step<A = any> {
  text?: string;
  start(d: A): void;
  update(d: A, dt: number): boolean | void;
  [scratch: string]: any;
}

/** The generic steps every animal can run. Content adds its own beside these. */
export const steps = {
  go: (pt, gait, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.goal = { pt, arrive: o.arrive || 4, ignoreOther: !!o.ignoreOther, path: null, k: 0, repath: 0, fail: 0 }; d.gait = gait; d.poseName = gait === 'sniffwalk' ? 'sniff' : gait === 'crawl' ? 'crawl' : 'stand'; d.look = o.look || 'forward'; this.t = 0; if (o.onStart) o.onStart(d); },
    update(d, dt) { this.t += dt; if (!d.goal || this.t > (o.timeout || 45)) { d.goal = null; return true; } return false; } }),
  hold: (pose, dur, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = pose; d.look = o.look || 'around'; d.lookFn = o.lookFn || null; d.pant = !!o.pant; this.t = 0; this.dur = (['shake', 'bow', 'cower'].includes(pose) || o.fixed) ? dur : dur * (d.p.idle || 1); if (o.onStart) o.onStart(d); },
    update(d, dt) { this.t += dt; if (o.onUpdate) o.onUpdate(d, dt, this.t); return this.t >= this.dur || (o.until && o.until(d, this.t)); } }),
  face: (hFn, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.faceH = hFn(d); d.poseName = 'stand'; d.look = 'forward'; this.t = 0; }, update(d, dt) { this.t += dt; return d.faceH === null || this.t > 4; } }),
  spin: (turns): Step => ({ start(d) { d.spinLeft = turns * Math.PI * 2; d.spinDir = rand() < 0.5 ? 1 : -1; d.poseName = 'stand'; d.look = 'forward'; }, update(d) { return d.spinLeft <= 0; } }),
  // cats: paw at a fish, maybe hook one
  climb: (x, z, top, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = 'climbA'; d.look = 'forward'; this.t = 0; this.from = V2(d.pos.x, d.pos.y); d.climbOut = V2(d.pos.x, d.pos.y); d.elevT = top; d.onRoof = false; d.faceH = null; d.h = headingTo(x - d.pos.x, z - d.pos.y); },
    update(d, dt) { this.t += dt; const k = smooth(0, 0.9, this.t); d.pos.set(lerp(this.from.x, x, k), lerp(this.from.y, z, k)); d.poseName = Math.floor(this.t * 3.2) % 2 ? 'climbA' : 'climbB'; return d.elev >= top - 0.6 && this.t > 0.9; } }),
  branchGo: (x, z, yTop, o: StepOpts = {}): Step => ({ text: o.text, start(d) { d.poseName = 'stand'; d.look = 'forward'; },
    update(d, dt) {
      const dx = x - d.pos.x, dz = z - d.pos.y, dist = Math.hypot(dx, dz);
      d.elevT = yTop - gyAt(d.pos.x, d.pos.y);
      if (dist < 0.8) { d.fakeV = 0; return true; }
      d.h = headingTo(dx, dz); d.poseName = 'stand'; d.fakeV = 11 * K; const st = Math.min(dist, 11 * dt); d.pos.x += dx / dist * st; d.pos.y += dz / dist * st; return false;
    } }),
  call: (fn): Step => ({ start(d) { fn(d); }, update() { return true; } }),
  // cats: one bound onto a lily pad, or off the last one onto dry land. A pad may wobble and tip them in.
};

const SETTLED = new Set(['sit', 'lie', 'stand']), SIT_LIE = new Set(['sit', 'lie']), LEGS = ['fl', 'fr', 'bl', 'br'];
// per-frame scratch, hoisted so the update loop doesn't allocate
const TROT = [0, 0, 0, 0], GALLOP = [0, 0, 0, 0], SWING = [0, 0, 0, 0];
const S = steps;
export class Animal {
  /** Lily-pad state for cats: the pad underfoot, its index on the hopping line, and whether a crossing is under way. */
  onPad: any = null; padIdx = -1; padHops = 0; lily = false; forceSlip = false;
  activity: string;
  angV: any;
  arrived: boolean;
  backV: number;
  behaviour: string | null;
  blockN: any;
  blockT: any;
  bodyJ: THREE.Group;
  crawlT: any;
  cur: Record<string, number>;
  earJ: Record<"el" | "er", THREE.Group>;
  earLift: number;
  earSwing: number;
  elev: number;
  elevT: number;
  energy: number;
  extraTilt: any;
  faceH: number | null;
  fakeV: number;
  fidgetE: number;
  fidgetLeg: any;
  fidgetT: any;
  fx: Record<string, number>;
  gait: string;
  goal: any;
  h: number;
  happyT: number;
  headBase: THREE.Vector3;
  headJ: THREE.Group;
  hop: number;
  idx: number;
  labelOverride: any;
  lastB: any;
  lean: any;
  legJ: Record<"fl" | "fr" | "bl" | "br", THREE.Group>;
  look: string;
  lookFn: any;
  lookOverride: any;
  lookPitch: number;
  lookT: number;
  lookYaw: number;
  mat: THREE.MeshLambertMaterial;
  wetU: WetUniforms;
  mv: any;
  name: string;
  onRoof: any;
  ovY: number | null;
  phase: number;
  pant: boolean;
  p: any;
  pos: THREE.Vector2;
  poseName: string;
  queue: any[];
  root: THREE.Group;
  rootY: any;
  seed: number;
  shakeCd: any;
  slope: number;
  spinDir: number;
  spinLeft: number;
  stall: any;
  step: any;
  stepW: number;
  swPh: any;
  swimming: boolean;
  swishAmt: any;
  swishing: any;
  tailJ: THREE.Group;
  thirst: number;
  tilt: number;
  turnRate: any;
  v: number;
  wagBoost: number;
  wagPh: number;
  wet: number;
  wetV: number;
  zT: number;
  poses: Record<string, any>;
  climbOut: any;
  markT = 0;
  constructor(idx: number, data: any, o: any) {
    this.idx = idx; this.p = o.persona; this.name = o.name; this.poses = o.poses;
    this.root = new THREE.Group(); this.root.scale.setScalar(K); if (this.p.size) this.root.scale.set(K * this.p.size[0], K * this.p.size[1], K * this.p.size[2]); scene.add(this.root);
    const pv = data.pivots, bp = pv.body; this.mat = animalMat.clone(); this.wetU = wetFur(this.mat, 33 * K * (this.p.size ? this.p.size[1] : 1));
    this.bodyJ = new THREE.Group(); this.bodyJ.position.set(0, bp[1], 0); this.bodyJ.rotation.order = 'ZXY';
    this.root.add(this.bodyJ);
    const mk = (g, piv) => {
      const arr = data.groups[g], n = arr.length / 4, m = new THREE.InstancedMesh(UNIT, this.mat, n), ob = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < n; i++) { ob.position.set(arr[i * 4] - piv[0], arr[i * 4 + 1] - piv[1], arr[i * 4 + 2] - piv[2]); ob.updateMatrix(); m.setMatrixAt(i, ob.matrix); c.set(data.pal[arr[i * 4 + 3]]); m.setColorAt(i, c); }
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.userData.dog = this; animalMeshes.push(m);
      return m;
    };
    this.bodyJ.add(mk('body', bp));
    const joint = (g: string, order?: string) => { const p = pv[g], j = new THREE.Group(); j.position.set(p[0] - bp[0], p[1] - bp[1], p[2] - bp[2]); if (order) j.rotation.order = order; j.add(mk(g, p)); this.bodyJ.add(j); return j; };
    this.headJ = joint('head', 'YZX'); this.headBase = this.headJ.position.clone(); this.tailJ = joint('tail', 'XYZ');
    this.legJ = { fl: joint('fl'), fr: joint('fr'), bl: joint('bl'), br: joint('br') };
    const earJ = g => { const p = pv[g], hp = pv.head, j = new THREE.Group(); j.position.set(p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]); j.add(mk(g, p)); this.headJ.add(j); return j; };
    this.earJ = { el: earJ('el'), er: earJ('er') };
    this.earLift = 0; this.earSwing = 0;
    this.elev = 0; this.elevT = 0; this.fakeV = 0; this.pos = V2(o.x, o.z); this.h = o.h; this.v = 0; this.rootY = 0.5 * K; this.slope = 0;
    this.cur = Object.assign({}, this.poses.stand, { hy: 0, lookPitch: 0, tilt: 0 }); this.poseName = 'stand';
    this.phase = rr(0, 6); this.wagPh = rr(0, 6); this.stepW = 0; this.seed = rr(0, 100);
    this.look = 'around'; this.lookT = 0; this.lookYaw = 0; this.lookPitch = 0; this.tilt = 0; this.lookFn = null; this.lookOverride = null;
    this.goal = null; this.gait = 'walk'; this.faceH = null; this.spinLeft = 0; this.spinDir = 1;
    this.queue = []; this.step = null; this.activity = ''; this.behaviour = null; this.lastB = null; this.labelOverride = null; this.arrived = false;
    this.energy = rr(0.65, 1); this.thirst = rr(0, 0.4);
    this.wagBoost = 0; this.hop = 0; this.fx = { shake: 0, lap: 0, twitch: 0, bounce: 0, pant: 0, wiggle: 0, crawl: 0, rub: 0, happy: 0, dig: 0, tug: 0 }; this.pant = false; this.zT = 0; this.wet = 0; this.wetV = 0; this.ovY = null; this.swimming = false;
  }
  private _fwd = new THREE.Vector2();
  /** Unit facing on the ground plane. Shared per animal and rewritten on each read, so copy it if you need to keep it. */
  get fwd() { return this._fwd.set(Math.cos(this.h), -Math.sin(this.h)); }
  headWorld(out = new THREE.Vector3()) { return this.headJ.localToWorld(out.set(7, 7, 0)); }
  label() { return this.labelOverride ? this.labelOverride.text : this.activity; }
  tailTip(out = new THREE.Vector3()) { return this.tailJ.localToWorld(out.set(this.p.swish > 1 ? -6 : -1.5, 12, 0)); }
  setQueue(steps: Step[], key: string | null) { this.queue = steps; this.behaviour = key; this.lastB = key; }
  /** Drop whatever it was doing and run `steps` instead, after the prelude that gets it there safely (down from a perch, awake, out of the water). */
  interrupt(steps: Step[], key: string | null) {
    const pre = this.interruptPrelude();
    this.goal = null; this.faceH = null; this.spinLeft = 0; this.step = null;
    this.setQueue(pre.concat(steps), key);
  }
  splash() { const h = this.root.position; for (let k = 0; k < 14; k++) puff(dropTex, new THREE.Vector3(h.x + rr(-4, 4), h.y + rr(5, 10), h.z + rr(-4, 4)), 0.8, 0.8, rr(3, 7), 0, rr(-7, 7), rr(-7, 7), 15); }

  // ---- hooks for the content ----
  /** Choose the next behaviour when the queue runs dry. Must queue at least one step. */
  pick() { this.setQueue([S.hold('stand', 1)], null); }
  /** Standing urges, checked every frame before locomotion. */
  think(dt: number) {}
  /** Steps to run before an interrupting behaviour. */
  interruptPrelude(): Step[] { return []; }
  /** After wetness is updated: in water, in the rain. */
  afterWet(dt: number, inWater: boolean, inRain: boolean) {}
  /** A step with a new label has started. */
  onActivity(text: string) {}
  /** Which pose in the table a pose name means for this animal (a lying pose, a sleeping style). */
  poseFor(name: string): string { return name === 'lie' ? this.p.lie : name; }
  /** Height the animal stands at over ground height `gy` (decks, beds, blankets add to it). */
  standHeight(x: number, z: number, gy: number) { return gy; }

  update(dt: number, t: number) {
    if (this.step && this.step.update(this, dt)) this.step = null;
    if (!this.step) {
      if (!this.queue.length) { this.behaviour = null; this.pick(); }
      const s = this.queue.shift();
      this.step = s;
      if (s.text) { if (s.text !== this.activity) this.onActivity(s.text); this.activity = s.text; }
      s.start(this);
    }
    if (this.labelOverride && (this.labelOverride.t -= dt) <= 0) this.labelOverride = null;
    const sleeping = this.poseName === 'sleep';
    this.energy = clamp(this.energy + dt * (sleeping ? 0.03 : -(0.004 + (this.v > 60 * K ? 0.02 : 0)) * this.p.drain), 0, 1);
    this.think(dt);

    // locomotion along a path
    let tv = 0, turning = false;
    const g0 = this.goal;
    if (g0) {
      const dyn = typeof g0.pt === 'function', tgt = dyn ? g0.pt() : g0.pt;
      let wp: THREE.Vector2 | null = null, endD = 0;
      if (g0.direct) {
        endD = Math.hypot(tgt.x - this.pos.x, tgt.y - this.pos.y);
        if (endD < g0.arrive && g0.vset === undefined) { if (!g0.ball) this.goal = null; } else wp = tgt;
      } else {
        g0.repath -= dt;
        if (!g0.path || (dyn && g0.repath <= 0)) {
          g0.path = findPath(this.pos.x, this.pos.y, tgt.x, tgt.y); g0.k = 0; g0.repath = 0.7;
          if (!g0.path) { if (++g0.fail > 2 && !g0.ball) this.goal = null; }
        }
        if (this.goal && g0.path) {
          const last = g0.path.length - 1, end = g0.path[last];
          endD = Math.hypot(end.x - this.pos.x, end.y - this.pos.y);
          if (endD < g0.arrive) { if (!g0.ball) this.goal = null; }
          else { while (g0.k < last && Math.hypot(g0.path[g0.k].x - this.pos.x, g0.path[g0.k].y - this.pos.y) < 5) g0.k++; wp = g0.path[g0.k]; }
        }
      }
      if (wp) {
        const dx = wp.x - this.pos.x, dz = wp.y - this.pos.y, dist = Math.hypot(dx, dz) || 1;
        let sx = dx / dist, sz = dz / dist;
        if (!g0.ignoreOther) for (const o of crowd) { if (o === this) continue; const ox = this.pos.x - o.pos.x, oz = this.pos.y - o.pos.y, od = Math.hypot(ox, oz) || 1; if (od < 20) { const w = (20 - od) / 20 * 0.9; sx += ox / od * w; sz += oz / od * w; } }
        const diff = wrapA(headingTo(sx, sz) - this.h), maxTurn = (this.gait === 'dribble' ? 4.8 : this.gait === 'run' ? (g0.ball ? 4.5 : 4.2) : 2.8) * this.p.turn * dt;
        const maxW = maxTurn / dt, wantW = clamp(diff * (g0.ball ? 5 : 4), -maxW, maxW);
        this.angV = damp(this.angV || 0, wantW, g0.ball ? 9 : 7, dt);
        this.h = wrapA(this.h + this.angV * dt); this.turnRate = this.angV;
        let spd = SPEED[this.gait] * (this.p.speed[this.gait] || 1);
        const here = cellIdx(this.pos.x, this.pos.y);
        if (here >= 0 && cols[here] && cols[here]!.wade && this.gait !== 'wade') spd = Math.min(spd, 24 * K);
        tv = g0.vset !== undefined ? Math.min(g0.vset, spd) * clamp(1 - Math.abs(diff) / 3.2, 0.3, 1)
          : spd * clamp(endD / (g0.ball ? 6 : 15), g0.ball ? 0.25 : 0.4, 1) * clamp(1 - Math.abs(diff) / (this.gait === 'dribble' ? 3.6 : 2.2), 0.2, 1);
      }
    } else if (this.faceH !== null) {
      const diff = wrapA(this.faceH - this.h), st = 2.4 * this.p.turn * dt;
      if (Math.abs(diff) < 0.06) this.faceH = null; else { this.h = wrapA(this.h + clamp(diff, -st, st)); turning = true; }
    } else if (this.spinLeft > 0) { const dh = 2.8 * this.p.turn * dt; this.h = wrapA(this.h + this.spinDir * dh); this.spinLeft -= dh; turning = true; }
    if (!this.goal) this.angV = damp(this.angV || 0, 0, 8, dt);
    this.v = damp(this.v, tv, tv > this.v ? (this.gait === 'dribble' ? 4 : 3) : (this.gait === 'dribble' ? 2.5 : 5), dt);
    this.lean = damp(this.lean || 0, this.goal ? clamp((this.turnRate || 0) * this.v / (60 * K) * 0.08, -0.3, 0.3) : 0, 4, dt);
    const f = this.fwd, nx = this.pos.x + f.x * this.v * dt, nz = this.pos.y + f.y * this.v * dt;
    const cHere = cellIdx(this.pos.x, this.pos.y);
    const okTo = (x, z) => { const c = cellIdx(x, z); return c >= 0 && G.walk[c] && (cHere < 0 || !G.walk[cHere] || canStep(cHere, c)); };
    const ox0 = this.pos.x, oz0 = this.pos.y;
    if (this.backV) {   // walking backwards, e.g. dragging a blanket
      const bx = this.pos.x - f.x * this.backV * dt, bz = this.pos.y - f.y * this.backV * dt;
      if (okTo(bx, bz)) this.pos.set(bx, bz);
    } else if (okTo(nx, nz)) this.pos.set(nx, nz);
    else if (okTo(nx, this.pos.y)) this.pos.x = nx;
    else if (okTo(this.pos.x, nz)) this.pos.y = nz;
    else {
      this.v *= 0.5; this.blockT = (this.blockT || 0) + dt;
      if (this.goal) {
        this.goal.repath = 0;
        if (this.blockT > 0.35 && !this.goal.direct) { this.goal.path = null; this.goal.ignoreOther = true; this.blockT = 0.2; this.blockN = (this.blockN || 0) + 1; }
        if (this.blockN > 4 && cHere >= 0) { const sc = nearestWalk(this.pos.x, this.pos.y, true, 3); if (sc >= 0) { const q = cellPt(sc); this.pos.set(q.x, q.y); } this.blockN = 0; }
      }
    }
    if (moved0(ox0, oz0, this)) { this.blockT = 0; this.blockN = 0; }
    const moved = Math.hypot(this.pos.x - ox0, this.pos.y - oz0);
    this.crawlT = this.goal && !this.goal.ball && this.v < 3 && !this.backV ? (this.crawlT || 0) + dt : 0;
    if (this.crawlT > 3 && this.goal) { this.goal.ignoreOther = true; this.goal.path = null; this.crawlT = 0; }
    if (!this.mv) this.mv = V2(0, 0); this.mv.set(this.pos.x - ox0, this.pos.y - oz0);
    this.stall = this.v > 8 && moved < this.v * dt * 0.35 ? (this.stall || 0) + dt : 0;
    if (this.stall > 0.3) this.v *= Math.exp(-6 * dt);

    // ground, wading, slope
    const cNow = cellIdx(this.pos.x, this.pos.y), colNow = cNow >= 0 ? cols[cNow] : null;
    const gy = cNow >= 0 ? G.gy[cNow] : 0;
    this.elev += clamp(this.elevT - this.elev, -16 * dt, 16 * dt);
    this.rootY = damp(this.rootY, this.elev > 0.5 ? gy + this.elev + 0.5 * K : this.standHeight(this.pos.x, this.pos.y, gy) + 0.5 * K, 8, dt);
    if (this.ovY !== null) this.rootY = this.ovY;
    {   // wet fur: darkens, drips, dries slowly, and gets shaken off once out of the water
      const inW = !!(colNow && (colNow.wade || colNow.swim) && !colNow.jetty) && !this.lily;
      if (!inW && this.poseName !== 'shake') this.wet = Math.max(0, this.wet - dt / 45);
      this.wetV = damp(this.wetV, this.wet > 0.02 ? Math.min(1, this.wet * 1.4) : 0, 2.5, dt);
      this.wetU.uWet.value = this.wetV; this.wetU.uRootY.value = this.rootY;
      // a dripping animal standing on dry ground leaves damp marks
      if (this.wetV > 0.35 && !this.swimming && !inW && this.elev < 0.5 && this.ovY === null && (this.markT -= dt * this.wetV) <= 0) { this.markT = 0.8 + wetRand() * 0.9; dampMark(this.pos.x, this.rootY - 0.5 * K, this.pos.y, this.wetV); }
      if (this.wetV > 0.3 && !this.swimming && rand() < dt * 3 * this.wetV) puff(dropTex, new THREE.Vector3(this.pos.x + rr(-2, 2), this.rootY + 3, this.pos.y + rr(-2, 2)), 0.45, 0.6, -2, 0, 0, 0, 14);
      this.shakeCd = Math.max(0, (this.shakeCd || 0) - dt);
      const inRain = WX.rain > 0.2 && !underRoof(this.pos.x, this.pos.y) && !(this.onRoof);
      if (inRain && !this.swimming) this.wet = Math.min(1, this.wet + dt * WX.rain / 10);
      this.afterWet(dt, inW, inRain);
    }
    if (colNow && (colNow.wade || colNow.swim) && !colNow.jetty && !this.lily) this.wet = 1;
    const gAt = (x, z) => { const c = cellIdx(x, z); return c >= 0 ? G.gy[c] : gy; };
    this.slope = damp(this.slope, clamp(Math.atan2(gAt(this.pos.x + f.x * 8, this.pos.y + f.y * 8) - gAt(this.pos.x - f.x * 8, this.pos.y - f.y * 8), 16), -0.35, 0.35), 4, dt);

    // gait
    this.stepW = damp(this.stepW, turning || this.backV ? 1 : 0, 6, dt);
    const vn = (this.fakeV || this.v) / K, gw = this.poseName === 'crawl' ? 0 : Math.max(clamp(vn / 26, 0, 1), this.stepW * 0.55), runF = smooth(45, 95, vn);
    const stride = lerp(22, 46, runF) * this.p.stride;
    this.phase += (vn / (this.poseName === 'crawl' ? 9 : stride) + this.stepW * 1.4) * dt * Math.PI * 2;
    const ph = this.phase;

    // look
    const lying = this.poseName === 'lie';
    const P = this.poses[this.poseFor(this.poseName)];
    this.lookT -= dt;
    let lookYaw = 0, lookPitch = 0, tilt = 0;
    const lookAtPoint = p => { const dx = p.x - this.pos.x, dz = p.z - this.pos.y; lookYaw = clamp(wrapA(headingTo(dx, dz) - this.h), -1.0, 1.0); lookPitch = clamp(Math.atan2(p.y - this.rootY - 15, Math.hypot(dx, dz)) * 0.5, -0.2, 0.35); };
    if (this.lookOverride) { lookAtPoint(this.lookOverride.fn()); tilt = Math.sin(t * 1.3) > 0.3 ? 0.3 : 0; if ((this.lookOverride.t -= dt) <= 0) this.lookOverride = null; }
    else if (this.look === 'around') {
      if (this.lookT <= 0) { this.lookT = rr(this.p.look[0], this.p.look[1]); this.lookYaw = rand() < 0.3 ? 0 : rr(-0.85, 0.85); this.lookPitch = rr(-0.12, 0.18); this.tilt = rand() < this.p.tilt ? (rand() < 0.5 ? 0.32 : -0.32) : 0; }
      const m = this.v > 5 * K ? 0.4 : 1; lookYaw = this.lookYaw * m; lookPitch = this.lookPitch * m; tilt = this.tilt * m;
    } else if (this.look === 'sweep') lookYaw = 0.4 * Math.sin(t * 0.9 * (this.p.gentle ? 0.6 : 1.4) + this.seed);
    else if (this.look === 'jumpy') { if (this.lookT <= 0) { this.lookT = rr(0.2, 0.45); this.lookYaw = rr(-1, 1); this.lookPitch = rr(-0.05, 0.25); } lookYaw = this.lookYaw; lookPitch = this.lookPitch; }
    else if (this.look === 'camera') { lookAtPoint(camera.position); const sv = Math.sin(t * 0.8 + this.seed); tilt = sv > 0.35 ? 0.34 : sv < -0.6 ? -0.25 : 0; }
    else if (this.look === 'point' && this.lookFn) lookAtPoint(this.lookFn());

    // pose blend
    const c = this.cur;
    const pr = P.rate * this.p.poseRate;
    for (const k of PKEYS) c[k] = damp(c[k], k === 'wag' ? P.wag * this.p.wag : k === 'wagSpd' ? P.wagSpd * this.p.wagSpd : k === 'tr' && this.poseName !== 'cower' ? P.tr + this.p.tail : P[k], pr, dt);
    const lr = this.look === 'jumpy' ? 12 : this.p.lookRate;
    c.hy = damp(c.hy, lookYaw, lr, dt); c.lookPitch = damp(c.lookPitch, lookPitch, 4, dt); c.tilt = damp(c.tilt, tilt, 5, dt);
    const fx = this.fx;
    if (lying && !this.lookOverride && this.look !== 'camera') { lookYaw *= 0.3; lookPitch *= 0.3; tilt *= 0.3; }
    const on = { dig: this.poseName === 'dig', tug: this.poseName === 'tug', crawl: this.poseName === 'crawl' && this.v > 0.5 * K, rub: this.poseName === 'facerub', shake: this.poseName === 'shake', lap: this.poseName === 'drink', twitch: this.poseName === 'sniff', bounce: this.poseName === 'bow', pant: this.pant, wiggle: this.poseName === 'roll' };
    for (const k in on) this.fx[k] = damp(this.fx[k], on[k] ? 1 : 0, 8, dt);
    this.wagBoost = damp(this.wagBoost, 0, 0.7, dt);
    this.hop = Math.max(0, this.hop - dt / 0.45);
    this.happyT = Math.max(0, (this.happyT || 0) - dt);
    fx.happy = damp(fx.happy || 0, this.happyT > 0 ? 1 : 0, 6, dt);
    // Murphy fidgets: a quick paw lift or weight shift while standing about
    if (this.p.fidget && this.poseName === 'stand' && this.v < 2 * K && !this.goal) {
      this.fidgetT = (this.fidgetT === undefined ? rr(1, 3) : this.fidgetT) - dt;
      if (this.fidgetT <= 0) { this.fidgetT = rr(1.2, 3.2); this.fidgetLeg = Math.floor(rand() * 4); this.fidgetE = 1; }
    }
    this.fidgetE = Math.max(0, (this.fidgetE || 0) - dt / 0.45);
    if (this.poseName === 'shake') this.wet = 0;

    const sph = Math.sin(ph), trot = TROT, gallop = GALLOP, swing = SWING;
    trot[0] = sph; trot[1] = -sph; trot[2] = -sph; trot[3] = sph;
    gallop[0] = sph; gallop[1] = Math.sin(ph + 0.6); gallop[2] = Math.sin(ph + Math.PI + 0.3); gallop[3] = Math.sin(ph + Math.PI + 0.9);
    const amp = lerp(0.42 + 0.12 * smooth(20, 55, vn), 0.72, runF) * gw;
    for (let i = 0; i < 4; i++) swing[i] = lerp(trot[i], gallop[i], runF) * amp + fx.wiggle * 0.45 * Math.sin(t * 8 + i * 1.7) + (i === this.fidgetLeg ? (i < 2 ? 0.6 : 0.35) * Math.sin(Math.PI * (1 - this.fidgetE)) : 0) + fx.happy * 0.12 * Math.sin(t * 13 + i * 2) + (i < 2 ? fx.crawl * 0.22 * Math.sin(ph + i * Math.PI) + fx.dig * 0.75 * Math.sin(t * 15 + i * Math.PI) : 0);
    const breath = sleeping ? 0.4 * Math.sin(t * 1.5 + this.seed) : 0.16 * Math.sin(t * 2.4 + this.seed);
    const lift = c.lift + breath + gw * this.p.bounce * ((1 - runF) * 0.9 * Math.abs(Math.sin(ph)) + runF * 2.4 * Math.sin(ph - 0.6))
      + fx.bounce * 0.9 * Math.abs(Math.sin(t * 7)) + fx.rub * 0.6 * Math.sin(t * 10) + fx.pant * 0.35 * Math.sin(t * 15) + (this.hop > 0 ? 4 * Math.sin(Math.PI * (1 - this.hop)) : 0);
    const pitch = c.pitch + runF * gw * 0.12 * Math.sin(ph + 0.9) + this.slope * (1 - Math.abs(c.roll) / 3);
    const roll = c.roll - this.lean + fx.shake * 0.34 * Math.sin(t * 27) + fx.wiggle * 0.3 * Math.sin(t * 3.2) + fx.happy * 0.09 * Math.sin(t * 13) + fx.crawl * 0.12 * Math.sin(ph) + fx.rub * 0.16 * Math.sin(t * 5);

    this.root.position.set(this.pos.x, this.rootY, this.pos.y);
    if (!isFinite(this.h)) this.h = 0; if (!isFinite(this.pos.x) || !isFinite(this.pos.y)) this.pos.set(-20, 10); this.root.rotation.y = this.h;
    this.bodyJ.position.y = 19 + lift;
    this.bodyJ.rotation.z = pitch; this.bodyJ.rotation.x = roll;
    this.headJ.position.set(this.headBase.x + c.nkx, this.headBase.y + c.nky, this.headBase.z);
    this.headJ.rotation.y = c.hy + c.hyb + fx.tug * 0.35 * Math.sin(t * 9) + fx.rub * 0.35 * Math.sin(t * 5 + 1) + fx.crawl * 0.12 * Math.sin(ph + 1);
    this.headJ.rotation.z = c.hp + c.lookPitch + gw * 0.05 * Math.sin(2 * ph) - runF * 0.15 + fx.lap * 0.07 * Math.sin(t * 13) + fx.twitch * 0.035 * Math.sin(t * 31);
    this.headJ.rotation.x = c.hr + c.tilt + (this.extraTilt || 0) - fx.shake * 0.45 * Math.sin(t * 27 + 0.6) + fx.rub * 0.7 * Math.sin(t * 5);
    const wagAmp = c.wag + this.wagBoost + fx.shake * 0.3 + fx.happy * 0.3;
    this.wagPh += (c.wagSpd + this.wagBoost * 10 + runF * 6) * dt;
    this.tailJ.rotation.z = c.tr - gw * 0.15 - runF * 0.1;
    this.tailJ.rotation.y = c.tc + wagAmp * Math.sin(this.wagPh);
    if (this.p.swish) {   // lazy sideways swish; stronger when awake and settled, with the odd flick
      const settled = SETTLED.has(this.poseName) && gw < 0.15 && this.elevT < 0.5 || SIT_LIE.has(this.poseName);
      const want = settled ? this.p.swish * (0.55 + 0.45 * Math.sin(t * 0.37 + this.seed)) : this.poseName === 'sleep' ? 0 : this.p.swish * 0.25;
      this.swishAmt = damp(this.swishAmt || 0, want, 1.2, dt);
      this.swPh = (this.swPh || 0) + dt * (1.7 + this.swishAmt * 1.6 + 2.2 * Math.max(0, Math.sin(t * 0.9 + this.seed * 2) - 0.8) * 5);
      const sw = this.swishAmt * (Math.sin(this.swPh) + 0.45 * Math.sin(this.swPh * 2.3 + 1)), tilt = Math.min(1, Math.abs(Math.sin(c.tr - gw * 0.15)));
      this.tailJ.rotation.x = sw * (1 - tilt) * 0.9;
      this.tailJ.rotation.y += sw * tilt * 0.9 - wagAmp * Math.sin(this.wagPh) * 0.6;
      this.swishing = this.swishAmt > 0.5 && this.poseName !== 'sleep';
    }
    for (let i = 0; i < 4; i++) { const k = LEGS[i]; this.legJ[k].rotation.z = c[k] - c.pitch + swing[i]; }

    // floppy ears: hang with gravity, bounce with the gait, blow back when running, lift when paying attention
    const headPitchW = pitch + this.headJ.rotation.z, upright = 1 - Math.min(1, Math.abs(roll) / 1.2);
    const perk = (this.look === 'camera' || this.lookOverride) ? 1 : 0;
    const liftT = runF * 0.55 + perk * (this.p.eager ? 0.36 : 0.18) + fx.shake * 0.75 * Math.sin(t * 27 + 1) + gw * (1 - runF) * 0.18 * Math.sin(2 * ph + 1.3)
      + (this.hop > 0 ? 0.5 * Math.sin(Math.PI * (1 - this.hop)) : 0) + fx.wiggle * 0.3 * Math.sin(t * 5);
    const cow = this.poseName === 'cower' ? 1 : 0;
    const swingT = -runF * 0.7 - headPitchW * 0.75 * upright + perk * 0.12 + fx.shake * 0.3 * Math.sin(t * 27) - cow * 0.4;
    this.earLift = damp(this.earLift, liftT * (this.poseName === 'cower' ? 0.2 : 1) - (this.poseName === 'cower' ? 0.22 : 0) + fx.happy * 0.2 * Math.sin(t * 13), 10, dt); this.earSwing = damp(this.earSwing, swingT, 8, dt);
    this.earJ.el.rotation.set(-this.earLift, 0, this.earSwing);
    this.earJ.er.rotation.set(this.earLift, 0, this.earSwing);
    this.root.updateMatrixWorld(true);

    if (sleeping && c.roll > 1.1) { this.zT -= dt; if (this.zT <= 0) { this.zT = 1.7; puff(zTex, this.headWorld(V3).add(new THREE.Vector3(0, 2, 0)), 3.2, 3.2, 3, 1.5); } }
    if (this.wet && fx.shake > 0.5 && rand() < 0.5) this.splash();
  }
}
