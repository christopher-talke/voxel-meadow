import * as THREE from 'three';
import { Animal, crowd } from '../../engine/animal/animal';
import { state } from '../../engine/core/state';
import { V2, V3, clamp, damp, headingTo, lerp, rand, rr, smooth, wrapA } from '../../engine/core/util';
import { camera, focus, scene } from '../../engine/render/stage';
import { BEDS, BL, CLIMB, NOSE, POLE, WATER_Y, bedTop, blanketToWorld, deckH, roofTop } from '../world/layout';
import { G, cellIdx, cols, gyAt } from '../../engine/terrain/grid';
import { B, K } from '../../engine/core/scale';
import { BALL_R } from '../world/decor';
import { UNIT } from '../../engine/render/mesher';
import { WX, todKey, underRoof } from '../../engine/sky/sky';
import { cats, dogs } from './registry';
import { SFX, SND, sndActivity } from '../audio/sound';
import { dropTex, heartTex, puff, zTex } from '../../engine/fx/sprites';
import { type WetUniforms, dampMark, wetFur, wetRand } from '../../engine/fx/wet';
import { canStep, cellPt, findPath, moved0, nearestWalk, randLand } from '../../engine/nav/path';
import type { Step } from './behaviours';
import { FISH, mkFish, PKEYS, PLACES, POSES, S, SPEED, dogMat, dogMeshes, fishStand, hideSpot, isNight, padExit, pickFish, pileSlot, slipChance } from './behaviours';
import { PAD_CHAIN, PAD_END, PAD_START } from '../world/pond';
import { type Cloth, CLOTHS, bedBlanket, bedMade, clothHeight } from './cloth';
import { SB, ballLand, ballPt, dribbleTarget, grabWithMouth, lineTarget, releaseGrab, steerTo, validCell } from './ball';

/** Behaviours that ambient urges (a shake, the weather, a spook) should not cut into. */
const BUSY = new Set(['hello', 'adventure', 'chase', 'zoomies', 'burst', 'spook', 'ball', 'contest', 'lilyhop']);
// per-frame scratch, hoisted so the update loop doesn't allocate
const IDLE_POSE = new Set(['stand', 'sniff', 'sit']), SNUG = new Set(['lie', 'sleep']), NO_WATCH = new Set(['watchtail', 'leave', 'ball']), SHELTERING = new Set(['shelter', 'bedtime']);
export class Dog extends Animal {
  declare ambushCd: number;
  declare dryT: any;
  declare fishM: THREE.Group;
  declare fishT: any;
  declare forceChase: any;
  declare hasFish: boolean;
  declare kickDir: any;
  declare lastPlace: any;
  declare leaveCd: any;
  declare mark: any;
  declare mood: any;
  declare moodT: any;
  declare napSpot: any;
  declare other: Dog;
  declare climbOut: any;
  declare roofBack: any;
  declare climbX: number;
  declare climbZ: number;
  declare shelterCd: any;
  declare sleepStyle: any;
  declare snugT: any;
  declare spookCd: number;
  declare spotInfo: any;
  declare talkT: any;
  declare thiefCd: any;
  declare trickCd: number;
  declare watchCd: any;
  declare watchTarget: any;
  constructor(idx: number, data: any, o: any) {
    super(idx, data, Object.assign({ poses: POSES }, o));
    if (this.p.cat) { this.fishM = mkFish(); this.fishM.scale.setScalar(2.1); this.fishM.position.set(9, -4, 0); this.fishM.visible = false; this.headJ.add(this.fishM); }
  }
  setQueue(steps: Step[], key: string | null) { this.spotInfo = null; super.setQueue(steps, key); }
  interruptPrelude(): Step[] {
    const pre: any[] = [];
    if (this.elevT > 0) pre.push(S.down());
    if (this.lily && !this.swimming) {   // mid-crossing: finish the hop in the air, then bound back to the nearer bank
      const to = this.step && this.step.hopTo, at = to ? (to.idx !== undefined ? to.idx : -1) : this.padIdx;
      if (to) pre.push(S.hop(to));
      if (to && to.idx === undefined) { /* already heading for land */ } else pre.push(...padExit(at));
      pre.push(S.call(d => { d.lily = false; d.onPad = null; d.padIdx = -1; d.ovY = null; }));
    }
    if (this.swimming) pre.push(S.swimOut());
    this.kickDir = null; this.backV = 0; this.spotInfo = null; releaseGrab(this);
    if (this.poseName === 'sleep' || this.poseName === 'roll') pre.push(S.hold('lie', 1.0, { text: this.poseName === 'sleep' ? 'Waking up' : undefined, look: 'forward' }));
    if (['sleep', 'lie', 'sit', 'drink', 'roll'].includes(this.poseName)) pre.push(S.hold('stand', 0.5, { look: 'forward' }));
    return pre;
  }
  free(): boolean { return !BUSY.has(this.behaviour as string); }
  pat() {
    puff(heartTex, this.headWorld(V3).add(new THREE.Vector3(0, 3, 0)), 4.6, 1.6, 5, 2);
    if (this.elevT > 0) return;
    if (this.poseName === 'sleep') { this.wagBoost = Math.max(this.wagBoost, 0.25); return; }
    if (this.p.tidy && !this.trickCd && this.free() && this.behaviour !== 'tricks' && !['sleep'].includes(this.poseName)) { this.trickCd = 14; this.interrupt(this.tricks(), 'tricks'); return; }
    if (this.p.gentle) {
      this.wagBoost = 0.55; this.lookOverride = { fn: () => camera.position, t: 5 };
      this.labelOverride = { text: 'Leaning in for a pat', t: 4 };
      if (this.free() && this.v < 3 * K && (this.poseName === 'stand' || this.poseName === 'sniff')) { this.step = null; this.goal = null; this.queue.unshift(S.hold('sit', 3, { look: 'camera', fixed: true }), S.hold('stand', 0.8)); }
    } else {
      this.wagBoost = 1.1; this.hop = 1; this.happyT = 2;
      this.lookOverride = { fn: () => camera.position, t: 4 };
      this.labelOverride = { text: 'Loving the pats', t: 2.6 };
    }
  }
  startle(by?: Dog) {
    if (by) {
      if (this.poseName === 'sleep' || this.behaviour === 'spook' || this.swimming || this.spookCd > 25) return;
      this.spookCd = 40; this.hop = 1; this.labelOverride = { text: 'Startled by ' + by.name + '!', t: 2.5 }; this.interrupt(this.B('spook'), 'spook'); return;
    }
    if (this.spookCd || !this.free() || this.behaviour === 'spook' || this.poseName === 'sleep') return;
    this.spookCd = 45; this.interrupt(this.B('spook'), 'spook');
  }
  greetedBy(d) { if (this.poseName === 'sleep') return; this.wagBoost = Math.max(this.wagBoost, 0.6); this.lookOverride = { fn: () => d.headWorld(new THREE.Vector3()), t: 3.5 }; }
  bigSplash() { if (SND.on) SFX.splash(this, true); for (let k = 0; k < 26; k++) puff(dropTex, new THREE.Vector3(this.pos.x + rr(-5, 5), WATER_Y + 1, this.pos.y + rr(-5, 5)), rr(0.8, 1.4), 0.9, rr(7, 14), 0, rr(-9, 9), rr(-9, 9), 20); }

  adventure(key: string, p?: any, invite?: boolean): Step[] {
    const P = PLACES[key], o = this.other, at = P.at(p || this.pos);
    this.arrived = false;
    const steps = [S.go(at, 'trot', { text: 'Off to ' + P.name, arrive: 8, onStart: d => {
      if (invite !== false && o.poseName !== 'sleep' && (invite || (o.free() && rand() < 0.85))) o.interrupt(o.follow(d, key, p), 'adventure');
    } }), S.call(d => { d.arrived = true; })].concat(P.act(this, 0, p));
    return steps;
  }
  follow(leader: Dog, key: string, p?: any): Step[] {
    const P = PLACES[key];
    const st: Step = { text: 'Off to ' + P.name + ' with ' + leader.name, start(d) { d.gait = 'trot'; d.poseName = 'stand'; d.look = 'forward'; this.t = 0; },
      update(d, dt) {
        this.t += dt;
        if (!d.goal) d.goal = { pt: () => { const f = leader.fwd; return V2(leader.pos.x - f.x * 8 - f.y * 9, leader.pos.y - f.y * 8 + f.x * 9); }, arrive: 3, ignoreOther: true, path: null, k: 0, repath: 0, fail: 0 };
        d.gait = Math.hypot(leader.pos.x - d.pos.x, leader.pos.y - d.pos.y) > 30 ? 'run' : 'trot';
        const done = leader.behaviour !== 'adventure' || leader.arrived || this.t > 90;
        if (done) d.goal = null;
        return done;
      } };
    return [st].concat(P.act(this, 1, p));
  }
  tidyTarget() {
    let best: Cloth | null = null, bm = 0.3;
    for (const c of CLOTHS) {
      const m = c.mess(); if (m <= bm) continue;
      const ct = c.centroid(); if (dogs.some(o => o !== this && o.spotInfo && ['lie', 'sleep'].includes(o.poseName) && Math.hypot(o.pos.x - ct.x, o.pos.y - ct.y) < 14)) continue;
      best = c; bm = m;
    }
    return best;
  }
  tricks() {
    const cam = () => headingTo(camera.position.x - this.pos.x, camera.position.z - this.pos.y), lk = { look: 'camera', fixed: true };
    return [S.face(cam), S.hold('sit', 0.9, Object.assign({ text: 'Oh, hello you!', onStart: d => { d.wagBoost = 1; d.happyT = 1.5; } }, lk)),
      S.hold('handL', 1.5, Object.assign({ text: 'Left handshake' }, lk)), S.hold('sit', 0.5, lk),
      S.hold('handR', 1.5, Object.assign({ text: 'Right handshake' }, lk)), S.hold('sit', 0.5, lk),
      S.hold('lie', 0.8, Object.assign({ text: 'Showing off' }, lk)), S.hold('roll', 2.6, { text: 'Rolling right over', look: 'none', fixed: true }),
      S.hold('lie', 0.9, { text: 'And back again', look: 'camera', fixed: true }), S.hold('stand', 0.7, lk),
      S.hold('sit', 2.5, Object.assign({ text: 'Very pleased with that', onStart: d => { d.wagBoost = 0.9; } }, lk)), S.hold('stand', 0.6)];
  }
  pick() {
    const badWx = WX.rain > 0.35 || WX.storm > 0.4;
    if (isNight() && !badWx && this.p.cat && rand() < 0.3) { const ck = rand() < 0.5 ? 'climb' : 'perch'; this.setQueue(this.B(ck), ck); return; }
    if (isNight()) { this.setQueue(this.B('bedtime'), 'bedtime'); return; }
    if (badWx) { this.setQueue(this.B('shelter'), 'shelter'); return; }
    const night = todKey === 'night', o = this.other, W = this.p.w;
    const w = {
      wander: W.wander, sniff: W.sniff, sit: W.sit, sunbathe: W.sunbathe * (night ? 0.7 : 1), drink: 0.4 + this.thirst * 3,
      zoomies: this.energy > 0.5 && !night ? W.zoomies : 0.05,
      visit: o.v < 15 * K && o.free() ? W.visit : 0,
      adventure: night ? 0.3 : W.adventure,
      hello: !night && camera.position.distanceTo(this.root.position) < 260 ? W.hello : 0,
      ball: this.energy > 0.4 && !night ? W.ball : 0, tummy: W.tummy, rub: W.rub,
      climb: W.climb || 0, perch: W.perch || 0,
      fish: W.fish && !night && FISH.length ? W.fish : 0,
      lilyhop: W.lily && !night && PAD_CHAIN.length > 2 && WX.rain < 0.2 && !(o.lily || o.behaviour === 'lilyhop') ? W.lily : 0,
      ambush: W.ambush && !this.ambushCd && !night && dogs.some(d => d.poseName !== 'sleep') ? W.ambush : 0,
      tidy: this.tidyTarget() ? this.p.tidy * (1 + 8 * this.tidyTarget()!.mess()) : 0,
      grump: this.p.moody && this.mood ? W.grump : 0,
      steal: this.p.eager && bedMade(this.idx) ? 0.6 : 0,
      nap: W.nap * ((this.energy < 0.35 ? 6 : 0.35) + (night ? 3 : 0) + (o.behaviour === 'nap' ? 3 : 0)),
    };
    if (this.lastB && w[this.lastB] !== undefined) w[this.lastB] *= this.lastB === 'wander' ? 0.6 : 0.15;
    let sum = 0; for (const k in w) sum += w[k];
    let r = rand() * sum, key = 'wander';
    for (const k in w) { r -= w[k]; if (r <= 0) { key = k; break; } }
    if (key === 'adventure') { const ks = ['jetty', 'beach', 'lookout', 'woods', 'field'].filter(k => k !== this.lastPlace); const pk = ks[Math.floor(rand() * ks.length)]; this.lastPlace = o.lastPlace = pk; this.setQueue(this.adventure(pk), 'adventure'); return; }
    if (key === 'drink') { this.setQueue(PLACES.drink.act(this, 0, this.pos), 'drink'); return; }
    if (key === 'hello') { this.setQueue(this.B('hello', true), 'hello'); return; }
    this.setQueue(this.B(key), key);
  }
  B(key: string, unprompted?: boolean): Step[] {
    if (this.p.cat && key === 'nap') key = 'catnap';
    const o = this.other, night = todKey === 'night', L = this.p.labels;
    switch (key) {
      case 'wander': {
        const nearO = this.p.nervous && rand() < 0.45 && Math.hypot(o.pos.x - this.pos.x, o.pos.y - this.pos.y) > 30;
        const p = nearO ? randLand(o.pos.x, o.pos.y, 10, 24) : randLand(this.pos.x, this.pos.y, 25, 70);
        return [S.go(p, 'walk', { text: nearO ? 'Trotting back to ' + o.name : L.wander, look: 'around' }), S.hold('stand', rr(1.5, 4))];
      }
      case 'sniff': return [S.go(randLand(this.pos.x, this.pos.y, 15, 45), 'sniffwalk', { text: L.sniff }), S.hold('sniff', rr(2.5, 5), { look: 'sweep' }), S.hold('stand', 1)];
      case 'sit': return [S.hold('stand', 0.3, { text: L.sit }), S.hold('sit', rr(6, 11)), S.hold('stand', 0.6)];
      case 'sunbathe': return [S.go(randLand(this.pos.x, this.pos.y, 20, 60), 'walk', { text: night ? 'Finding a comfy spot' : 'Finding a sunny spot' }), S.spin(1), S.hold('lie', rr(9, 16), { text: night ? 'Resting' : L.sun }), S.hold('stand', 0.7)];
      case 'spook': {
        const toO = o.poseName === 'sleep'
          ? [S.go(() => { const f = o.fwd; return V2(o.pos.x - f.y * 9, o.pos.y + f.x * 9); }, 'trot', { text: 'Hurrying back to ' + o.name, arrive: 3, ignoreOther: true }), S.face(() => o.h), S.hold('lie', 1.5, { text: 'Curling up next to ' + o.name, look: 'none' }), S.hold('sleep', rr(14, 22), { text: 'Curling up next to ' + o.name, look: 'none' }), S.hold('lie', 1.5), S.hold('stand', 0.5)]
          : [S.go(() => { const f = o.fwd; return V2(o.pos.x - f.y * 10 - f.x * 4, o.pos.y + f.x * 10 - f.y * 4); }, 'trot', { text: 'Hurrying back to ' + o.name, arrive: 3, ignoreOther: true }),
             S.face(d => { const hp = o.headWorld(V3); return headingTo(hp.x - d.pos.x, hp.z - d.pos.y); }),
             S.hold('stand', rr(3, 5), { text: 'Sticking close to ' + o.name, look: 'point', lookFn: () => o.headWorld(new THREE.Vector3()), onStart: d => { d.wagBoost = 0.5; o.greetedBy(d); } })];
        return [S.hold('cower', rr(0.9, 1.5), { text: 'Startled', look: 'jumpy' })].concat(toO);
      }
      case 'tummy': {
        const ahead = d => { const f = d.fwd; return V2(d.pos.x + f.x * rr(12, 18), d.pos.y + f.y * rr(12, 18)); };
        return [S.go(randLand(this.pos.x, this.pos.y, 10, 35), 'walk', { text: 'Itchy tummy!' }), S.hold('lie', 1, { text: 'Itchy tummy!', look: 'forward' }),
          { text: 'Scratching an itchy tummy', start(d) { this.p = ahead(d); d.goal = { pt: this.p, arrive: 1.5, path: null, k: 0, repath: 0, fail: 0, ignoreOther: true, direct: true }; d.gait = 'crawl'; d.poseName = 'crawl'; d.look = 'forward'; this.t = 0; }, update(d, dt) { this.t += dt; if (!d.goal || this.t > 6) { d.goal = null; return true; } return false; } },
          S.hold('lie', 1.2, { text: 'Scratching an itchy tummy', look: 'forward', fixed: true }),
          { text: 'Scratching an itchy tummy', start(d) { const f = d.fwd; d.goal = { pt: V2(d.pos.x + f.x * 10, d.pos.y + f.y * 10), arrive: 1.5, path: null, k: 0, repath: 0, fail: 0, ignoreOther: true, direct: true }; d.gait = 'crawl'; d.poseName = 'crawl'; d.look = 'forward'; this.t = 0; }, update(d, dt) { this.t += dt; if (!d.goal || this.t > 5) { d.goal = null; return true; } return false; } },
          S.hold('lie', 1.5, { text: 'Much better', fixed: true }), S.hold('stand', 0.6), S.hold('shake', 0.9, { text: 'Much better' }), S.hold('stand', 0.6)];
      }
      case 'rub': {
        const bed = Math.hypot(this.pos.x - BL.x, this.pos.y - BL.z) < 110 && rand() < 0.65, ownBed = bed && rand() < 0.5;
        const w = bed ? (ownBed ? { x: BEDS[this.idx].x, z: BEDS[this.idx].z } : blanketToWorld(rr(-14, 14), rr(-10, 10))) : null;
        const spot = bed ? V2(w!.x, w!.z) : randLand(this.pos.x, this.pos.y, 8, 30);
        const txt = bed ? (ownBed ? 'Rubbing his face into his bed' : 'Rubbing his face on the blanket') : 'Rubbing his face in the grass';
        return [S.go(spot, 'walk', { text: bed ? 'Heading for the blanket' : txt, arrive: 3 }), S.hold('facerub', rr(2.5, 4), { text: txt, look: 'none', fixed: true }),
          S.hold('stand', 0.4), S.spin(0.5), S.hold('facerub', rr(1.8, 3), { text: txt, look: 'none', fixed: true }), S.hold('lie', rr(3, 5), { text: 'Very pleased with himself' }), S.hold('stand', 0.6)];
      }
      case 'ball': {
        const m = this;
        const dr: Step = { text: 'Dribbling the ball', dribble: true, start(d) { d.poseName = 'dribble'; d.gait = 'run'; d.look = 'point'; d.lookFn = ballPt; this.t = 0; this.tt = 0; this.dur = rr(22, 32); this.tgt = dribbleTarget(SB.pos); this.mode = 'behind'; this.aim = V2(d.pos.x, d.pos.y); this.nextCut = rr(4, 7); },
          update(d, dt) {
            this.t += dt; this.tt += dt;
            if (this.t > this.dur) { d.goal = null; d.kickDir = null; return true; }
            const b = SB.pos;
            if (Math.hypot(this.tgt.x - b.x, this.tgt.y - b.y) < 30 || this.tt > 12) { this.tgt = (this.ang !== undefined && lineTarget(b, this.ang, 0.9)) || dribbleTarget(b); this.tt = 0; this.nextCut = rr(4, 7); }
            if (this.tt > this.nextCut && SB.vel.length() > 15) {
              const a = Math.atan2(SB.vel.y, SB.vel.x) + (rand() < 0.5 ? 1 : -1) * rr(0.9, 1.7);
              for (let k = 0; k < 6; k++) { const L = rr(80, 130), q = V2(b.x + Math.cos(a) * L, b.y + Math.sin(a) * L); if (ballLand(q.x, q.y) && validCell(q.x, q.y)) { this.tgt = q; this.cutT = 1.2; d.labelOverride = { text: 'Cutting back', t: 1 }; break; } }
              this.tt = 0; this.nextCut = rr(4, 7);
            }
            // approach: get behind the ball on the line he wants; carry: run with it, nose just behind, touching it on
            const bs = SB.vel.length(), fx = b.x + SB.vel.x * 0.15, fz = b.y + SB.vel.y * 0.15;
            // his line bends round gradually, faster when cutting, so he turns with the ball instead of losing it
            const want = Math.atan2(this.tgt.y - fz, this.tgt.x - fx);
            if (this.ang === undefined) this.ang = want;
            this.ang += clamp(wrapA(want - this.ang), -(this.cutT > 0 ? 3.2 : 1.5) * dt, (this.cutT > 0 ? 3.2 : 1.5) * dt);
            this.cutT = Math.max(0, (this.cutT || 0) - dt);
            let ux = Math.cos(this.ang), uz = Math.sin(this.ang);
            d.kickDir = V2(ux, uz);
            const fw = d.fwd, align = fw.x * ux + fw.y * uz;
            const nX = d.pos.x + fw.x * NOSE, nZ = d.pos.y + fw.y * NOSE;
            const gapAlong = (fx - nX) * ux + (fz - nZ) * uz, gapLat = Math.abs((fx - nX) * -uz + (fz - nZ) * ux);
            const bX = fx - ux * (NOSE + BALL_R + 1.5), bZ = fz - uz * (NOSE + BALL_R + 1.5), distB = Math.hypot(d.pos.x - bX, d.pos.y - bZ);
            const dist0 = Math.hypot(d.pos.x - b.x, d.pos.y - b.y), vmax = SPEED.dribble;
            if (this.mode === 'carry') { if (align < 0.35 || gapLat > 14 || gapAlong < -5 || gapAlong > 45) this.mode = 'approach'; }
            else if ((distB < 8 && align > 0.75) || (gapAlong > -2 && gapAlong < 22 && gapLat < 6 && align > 0.6)) this.mode = 'carry';
            let tx, tz, vset;
            if (this.mode === 'carry') {
              const lt = (fx - nX) * -uz + (fz - nZ) * ux; tx = fx + ux * 14 - uz * lt * 0.6; tz = fz + uz * 14 + ux * lt * 0.6;
              const bAlong = SB.vel.x * ux + SB.vel.y * uz;
              vset = clamp(bAlong + (gapAlong - 2) * 5 + 8, 12, vmax);
            } else {
              const rel = (d.pos.x - fx) * ux + (d.pos.y - fz) * uz;
              if (rel > -NOSE * 0.5) {
                // overran it or it squirted sideways: turn and take it on the way he's facing
                const a = Math.atan2(fz - d.pos.y, fx - d.pos.x), q = lineTarget(V2(fx, fz), a, 0.7);
                if (q) { this.tgt = q; this.ang = a; this.tt = 0; ux = Math.cos(a); uz = Math.sin(a); d.kickDir = V2(ux, uz); if (dist0 < 30) d.labelOverride = { text: 'Turning with the ball', t: 1 }; }
              }
              this.mode = 'approach';
              const bX2 = fx - ux * (NOSE + BALL_R + 1.5), bZ2 = fz - uz * (NOSE + BALL_R + 1.5), dB2 = Math.hypot(d.pos.x - bX2, d.pos.y - bZ2);
              const k = dB2 < 12 ? 10 : 0; tx = bX2 + ux * k; tz = bZ2 + uz * k;
              vset = clamp(distB * 3.4 + 14, 14, vmax);
            }
            this.slowT = SB.vel.length() < 4 && this.mode === 'carry' ? (this.slowT || 0) + dt : 0;
            if (d.stall > 0.5 || this.slowT > 1.5) { const a = Math.atan2(fz - d.pos.y, fx - d.pos.x) + (rand() - 0.5) * 1.2, q = lineTarget(V2(fx, fz), a, 0.8); if (q) { this.tgt = q; this.ang = Math.atan2(q.y - fz, q.x - fx); } d.stall = 0; this.slowT = 0; }
            const r = 1 - Math.exp(-10 * dt); this.aim.x += (tx - this.aim.x) * r; this.aim.y += (tz - this.aim.y) * r;
            d.poseName = dist0 < 30 ? 'dribble' : 'stand';
            d.gait = dist0 < 34 ? 'dribble' : 'run';
            steerTo(d, this.aim.x, this.aim.y, dist0 < 45);
            if (d.goal) d.goal.vset = dist0 < 45 ? vset : undefined;
            return false;
          } };
        return [S.go(() => V2(SB.pos.x - 14, SB.pos.y), 'trot', { text: 'Off to get the ball', arrive: 10, onStart: d => {
            const o = d.other;
            if (o.poseName !== 'sleep' && o.free() && (d.forceChase || rand() < 0.8)) o.interrupt(o.contest(d), 'contest');
            d.forceChase = false;
          } }), dr, S.hold('stand', 2.2, { text: 'Catching a breath', pant: true, onStart: d => { d.energy -= 0.15; d.kickDir = null; } })];
      }
      case 'burst': {
        const steps = [S.hold('bow', 0.6, { text: 'Sudden burst of energy!', look: 'forward', onStart: d => {
          if (o.poseName !== 'sleep' && o.free() && (d.forceChase || rand() < 0.6)) o.interrupt(o.chase(d), 'chase');
          d.forceChase = false;
        } })];
        let from = this.pos.clone();
        for (let k = 0, n = 2 + Math.floor(rand() * 2); k < n; k++) { const p = randLand(from.x, from.y, 30, 60); steps.push(S.go(p, 'run', { ignoreOther: true, arrive: 5 })); from = p; }
        steps.push(S.hold('lie', rr(9, 14), { text: 'Flopped down', onStart: d => { d.energy -= 0.2; } }), S.hold('stand', 0.8));
        return steps;
      }
      case 'nap': {
        const together = o.behaviour === 'nap' && o.napSpot === 'picnic' ? rand() < 0.8 : rand() < 0.35;
        this.napSpot = together ? 'picnic' : 'bed';
        const bd = BEDS[this.idx], l = [[0, 6.5], [3, -7], [-6, 1]][this.idx] || [0, 0], w = blanketToWorld(l[0], l[1]);
        const spot = together ? V2(w.x, w.z) : V2(bd.x, bd.z), faceH = together ? BL.rot : bd.rot;
        const far = Math.hypot(this.pos.x - spot.x, this.pos.y - spot.y) > 120, his = this.p.pro;
        const made = bedMade(this.idx);
        const settle = together ? [S.hold('lie', 2.2, { text: 'Getting comfy', look: 'forward', onStart: d => { d.spotInfo = { x: spot.x, z: spot.y, h: faceH, picnic: true }; } })]
          : this.p.gentle ? [S.hold('dig', 0.9, { text: made ? 'Fluffing ' + his + ' bed' : 'Nosing at ' + his + ' rumpled blanket', look: 'none', fixed: true }), S.hold('lie', 2.2, { text: made ? 'Settling into ' + his + ' blanket' : 'Making do with a messy bed', look: 'forward', onStart: d => { d.spotInfo = { x: spot.x, z: spot.y, h: faceH, picnic: false }; } })]
          : [S.hold('dig', rr(1.6, 2.6), { text: 'Digging his bed into shape', look: 'none', fixed: true }), S.spin(0.8), S.hold('dig', rr(0.8, 1.4), { text: 'Digging his bed into shape', look: 'none', fixed: true }), S.hold('lie', 2.2, { text: made ? 'Curling up on his blanket' : 'Flopped on his messy bed', look: 'forward', onStart: d => { d.spotInfo = { x: spot.x, z: spot.y, h: faceH, picnic: false }; } })];
        return [S.go(spot, far ? 'trot' : 'walk', { text: far ? 'Heading home for a nap' : together ? 'Heading to the blanket' : 'Heading to ' + his + ' bed', arrive: 1.6, ignoreOther: true }), S.spin(1.2), S.face(() => faceH)].concat(settle, [
          S.hold('sleep', night ? rr(40, 60) : rr(22, 34), { text: 'Fast asleep', look: 'none' }),
          S.hold('lie', 2.0, { text: 'Waking up' }), S.hold('stand', 0.7),
          S.hold('bow', 1.4, { text: 'Big stretch', look: 'forward' }), S.hold('shake', 1.0, { text: 'Shaking it off' }), S.hold('stand', 0.8)]);
      }
      case 'takespot': {
        const o2 = (this.mark && this.mark.spotInfo) ? this.mark : o, info = o2.spotInfo || { x: o2.pos.x, z: o2.pos.y, h: headingTo(o2.fwd.x, o2.fwd.y) };
        const spot = V2(info.x, info.z), h = info.h;
        const side = V2(info.x - Math.cos(h) * 0 + Math.sin(h) * 17, info.z + Math.cos(h) * 17);
        return [S.go(() => V2(o2.pos.x + o2.fwd.y * 17, o2.pos.y - o2.fwd.x * 17), 'trot', { text: 'Spotted ' + o2.name + ' in a comfy spot', arrive: 2.5, ignoreOther: true }),
          S.face(d => { const hp = o2.headWorld(V3); return headingTo(hp.x - d.pos.x, hp.z - d.pos.y); }),
          S.hold('sniff', 1.0, { text: 'Eyeing up ' + o2.name + "'s spot", look: 'none', fixed: true, onStart: d => { d.wagBoost = 0.7; } }),
          S.call(d => { o2.interrupt([S.hold('stand', 0.5, { text: 'Oh, okay then', look: 'forward', fixed: true }),
            S.go(() => V2(info.x - Math.sin(info.h + 1.2) * 34, info.z - Math.cos(info.h + 1.2) * 34), 'walk', { text: 'Bumped out of ' + o2.p.pro + ' spot', arrive: 4, ignoreOther: true }),
            S.hold('stand', 1.4, { text: 'Bumped out of ' + o2.p.pro + ' spot', look: 'point', lookFn: () => d.headWorld(new THREE.Vector3()) }),
            S.hold('sit', rr(4, 7), { text: 'Watching ' + d.name + ' in ' + o2.p.pro + ' spot', look: 'point', lookFn: () => d.headWorld(new THREE.Vector3()) }), S.hold('stand', 0.6)], 'displaced'); }),
          S.go(spot, 'trot', { text: 'Taking ' + o2.name + "'s spot", arrive: 1.6, ignoreOther: true }), S.spin(1.2), S.face(() => h),
          S.hold('lie', rr(10, 16), { text: 'Very pleased with herself', look: 'forward', onStart: d => { d.wagBoost = 0.8; d.napSpot = info.picnic ? 'picnic' : 'bed'; } }), S.hold('stand', 0.6)];
      }
      case 'climb': {
        const cand = CLIMB.filter(c => nearestWalk((c.i + 1.5) * B + 9.8, (c.j + 0.5) * B, true, 4) >= 0);
        if (!cand.length) return this.B('sit');
        const c = cand.sort((a, b) => Math.hypot((a.i + 1.5) * B - this.pos.x, a.j * B - this.pos.y) - Math.hypot((b.i + 1.5) * B - this.pos.x, b.j * B - this.pos.y))[Math.floor(rand() * Math.min(3, cand.length))];
        const gx = (c.i + 1.5) * B + 2.8, gz = c.br && c.br.length ? c.j * B - 0.8 : (c.j + 0.5) * B, base = cellIdx(gx, gz) >= 0 ? G.gy[cellIdx(gx, gz)] : 0;
        const brn = c.br && c.br.length ? c.br[Math.floor(rand() * c.br.length)] : null;
        const yTop = brn ? (brn.k + 1) * B : (c.b + c.h - 2) * B, top = yTop - base;
        const ap = cellPt(nearestWalk(gx + 7, gz, true, 4)); if (ap.x !== ap.x) return this.B('sit');
        const night = todKey === 'night';
        const up = [S.go(V2(ap.x, ap.y), 'walk', { text: 'Eyeing up the oak', arrive: 2, ignoreOther: true }), S.face(() => headingTo(-1, 0)), S.hold('sit', 1.2, { text: 'Eyeing up the oak', look: 'forward' }),
          S.climb(gx, gz, top, { text: 'Up the oak' }), S.call(d => { d.sleepStyle = rand() < 0.5 ? 'catCurl' : 'catLoaf'; })];
        const sleepUp = rand() < 0.4 || night, jz = (c.j + 1) * B;
        if (brn) { const sx = (c.i + 2 + Math.floor(brn.L * 0.45)) * B; up.push(S.branchGo(gx, jz, yTop, { text: 'Stepping onto a branch' }), S.branchGo(sx, jz, yTop, { text: 'Padding out along the branch' })); }
        up.push(S.hold(sleepUp ? 'sleep' : 'sit', sleepUp ? rr(25, 45) : rr(10, 16), { text: sleepUp ? 'Asleep on a branch' : 'Surveying the meadow from the branch', look: 'sweep', fixed: true }));
        if (brn) up.push(S.branchGo(gx, jz, yTop, { text: 'Back along the branch' }), S.branchGo(gx, gz, yTop));
        up.push(S.down(), S.hold('stand', 0.6), S.hold('bow', 1.4, { text: 'Big stretch', look: 'forward' }), S.hold('stand', 0.5));
        return up;
      }
      case 'perch': {
        const base = V2(POLE.x + rr(-1, 1), POLE.z - 6), px = rr(-94, -62), pz = rr(-36, 36);
        const up = [S.go(base, 'walk', { text: 'Heading for the cat pole', arrive: 2, ignoreOther: true }), S.face(() => headingTo(0, 1)), S.hold('sit', 1.0, { text: 'Sizing up the roof', look: 'forward' }),
          S.call(d => { d.climbX = POLE.x; d.climbZ = POLE.z - 2.2; d.roofBack = V2(POLE.x, POLE.z + 1); d.sleepStyle = rand() < 0.5 ? 'catCurl' : 'catLoaf'; }),
          S.climb(POLE.x, POLE.z - 2.6, roofTop(POLE.x) - gyAt(POLE.x, POLE.z) - 0.5, { text: 'Climbing the pole' }),
          S.roofGo(POLE.x, POLE.z + 1.5, { text: 'Over onto the roof' }), S.roofGo(px, pz, { text: 'Padding across the roof' })];
        const sleepUp = rand() < 0.65 || todKey === 'night';
        up.push(S.hold(sleepUp ? 'sleep' : 'lie', sleepUp ? rr(30, 50) : rr(14, 22), { text: sleepUp ? 'Napping on the roof' : 'Loafing on the roof', look: 'sweep', fixed: true }));
        up.push(S.hold('stand', 0.6), S.down(), S.hold('stand', 0.5), S.hold('bow', 1.4, { text: 'Big stretch', look: 'forward' }), S.hold('stand', 0.5));
        return up;
      }
      case 'bedtime': {
        const sl = pileSlot(this), cat = this.p.cat;
        return [S.call(d => { d.sleepStyle = 'catCurl'; }), S.go(sl.pt, 'walk', { text: cat ? 'Padding over to the pile' : 'Heading to bed with the others', arrive: 1.6, ignoreOther: true }), S.spin(cat ? 0.7 : 1.2), S.face(() => sl.h),
          S.hold('lie', 2.2, { text: cat ? 'Curling up against the dogs' : 'Snuggling in with the others', look: 'forward', onStart: d => { d.spotInfo = null; } }),
          S.hold('sleep', 900, { text: 'Asleep with everyone', look: 'none', until: () => !isNight() }),
          S.hold('lie', 2.0, { text: 'Waking up' }), S.hold('stand', 0.7), S.hold('bow', 1.4, { text: 'Big morning stretch', look: 'forward' }), S.hold('stand', 0.6)];
      }
      case 'shelter': {   // everyone huddles together under the shelter until it eases
        const sl = pileSlot(this), cat = this.p.cat, far = Math.hypot(sl.pt.x - this.pos.x, sl.pt.y - this.pos.y) > 30;
        return [S.go(sl.pt, far ? (cat ? 'run' : 'trot') : 'walk', { text: far ? (cat ? 'Bolting for cover' : 'Running for the shelter') : 'Joining the others', arrive: 1.8, ignoreOther: true }), S.face(() => sl.h), S.hold('stand', 0.4),
          S.hold(cat || rand() < 0.6 ? 'lie' : 'sit', rr(50, 110), { text: 'Sheltering together', look: 'sweep', until: () => WX.rain < 0.2 && WX.storm < 0.3 }), S.hold('stand', 0.6)];
      }
      case 'fish': {
        const f = pickFish(this), stand = f && fishStand(f); if (!f || !stand) return this.B('sit');
        const q = [S.go(stand, 'walk', { text: 'Spotted a fish', arrive: 3, ignoreOther: true }), S.face(d => headingTo(f.x - d.pos.x, f.z - d.pos.y)),
          S.hold('stalk', rr(2.5, 5), { text: 'Eyeing off a fish', look: 'point', lookFn: () => V3.set(f.x, WATER_Y - 2, f.z), fixed: true })];
        for (let k = 0; k < 3; k++) q.push(S.call(d => { if (d.hasFish) { d.queue.length = 0; d.queue.push(...d.B('fishcarry')); } }), S.face(d => headingTo(f.x - d.pos.x, f.z - d.pos.y)), S.swat(f), S.hold('stalk', rr(1.2, 2.6), { text: 'Still eyeing it off', look: 'point', lookFn: () => V3.set(f.x, WATER_Y - 2, f.z), fixed: true }));
        q.push(S.call(d => { d.queue.length = 0; d.queue.push(...(d.hasFish ? d.B('fishcarry') : [S.hold('sit', 0.4, { text: 'It got away' }), S.hold('shake', 0.7, { text: 'Shaking a wet paw', fixed: true }), S.hold('stand', 0.6)])); }));
        return q;
      }
      case 'fishcarry': {
        const away = randLand(this.pos.x, this.pos.y, 25, 55);
        return [S.hold('stand', 0.7, { text: 'Proud of that', look: 'forward', fixed: true }), S.go(away, 'trot', { text: 'Carrying the fish', arrive: 5 }), S.hold('sit', rr(3, 5), { text: 'Admiring the catch', look: 'sweep' }), S.hold('lie', 2.5, { text: 'Munching the fish', look: 'none' }), S.call(d => { d.hasFish = false; }), S.hold('stand', 0.6)];
      }
      case 'ambush': {
        const awake = dogs.filter(d => d.poseName !== 'sleep' && !d.swimming); if (!awake.length) return this.B('sit');
        const still = d => (['sit', 'lie', 'sniff', 'drink'].includes(d.poseName) ? 0 : 60) + Math.hypot(d.pos.x - this.pos.x, d.pos.y - this.pos.y) * 0.5;
        awake.sort((a, b) => still(a) - still(b));
        const dog = awake[Math.floor(rand() * Math.min(2, awake.length))], spot = hideSpot(dog, this); if (!spot) return this.B('sit');
        this.ambushCd = rr(35, 70);
        const dist = () => Math.hypot(dog.pos.x - this.pos.x, dog.pos.y - this.pos.y);
        return [S.go(spot, 'trot', { text: 'Slinking off', arrive: 5, ignoreOther: true }), S.face(d => headingTo(dog.pos.x - d.pos.x, dog.pos.y - d.pos.y)),
          S.hold('stalk', rr(14, 26), { text: 'Hiding and waiting', look: 'point', lookFn: () => dog.headWorld(new THREE.Vector3()), fixed: true, until: d => dist() < 42 && dog.poseName !== 'sleep' && !dog.swimming }),
          S.call(d => { if (dist() > 62) { d.queue.length = 0; d.queue.push(S.hold('stand', 0.4), S.hold('sit', 2, { text: 'Lost interest' })); } }),
          S.pounce(dog), S.go(randLand(this.pos.x, this.pos.y, 30, 60), 'run', { text: 'Zooming off', arrive: 6, ignoreOther: true }), S.hold('sit', rr(3, 5), { text: 'Looking innocent', look: 'sweep' }), S.hold('stand', 0.5)];
      }
      case 'lilyhop': {   // cats: bound across the lily pads from the jetty to the far bank (or back), and maybe fall in
        if (PAD_CHAIN.length < 3) return this.B('sit');
        const fromJetty = Math.hypot(PAD_START.x - this.pos.x, PAD_START.y - this.pos.y) < Math.hypot(PAD_END.x - this.pos.x, PAD_END.y - this.pos.y);
        const start = fromJetty ? PAD_START : PAD_END, end = fromJetty ? PAD_END : PAD_START, order = fromJetty ? PAD_CHAIN.slice() : PAD_CHAIN.slice().reverse();
        const at = (p: any) => () => V3.set(p.x, WATER_Y, p.z !== undefined ? p.z : p.y);
        const q: Step[] = [S.go(V2(start.x, start.y), 'walk', { text: 'Heading for the lily pads', arrive: 2, ignoreOther: true }), S.face(() => headingTo(order[0].x - this.pos.x, order[0].z - this.pos.y)),
          S.call(d => { d.padHops = 0; }),
          S.hold('sit', rr(1.6, 2.8), { text: 'Sizing up the lily pads', look: 'point', lookFn: at(order[0]), fixed: true }),
          S.hold('stalk', 0.9, { text: 'Wiggling, getting ready', look: 'point', lookFn: at(order[0]), fixed: true })];
        const mid = Math.floor(order.length / 2);
        order.forEach((p, k) => {
          const next = order[k + 1] || end;
          q.push(S.hop(p, { text: k === 0 ? 'Hop!' : k === mid ? 'Halfway there' : k === order.length - 1 ? 'Nearly there' : 'Hopping the lily pads', slip: slipChance(p) }));
          q.push(S.onPad(k === mid ? 'sit' : 'stand', k === mid ? rr(1.2, 2) : rr(0.35, 0.9), { look: 'point', lookFn: at(next) }));
        });
        q.push(S.hop(V2(end.x, end.y), { text: 'One last leap' }), S.hold('stand', 0.7, { text: 'Made it!', fixed: true, onStart: d => { d.labelOverride = { text: 'Made it!', t: 2 }; } }),
          S.hold('bow', 1.4, { text: 'Very pleased with that', look: 'forward' }), S.hold('stand', 0.5));
        return q;
      }
      case 'catnap': {
        const night = todKey === 'night', pk = rand();
        const spot = pk < 0.35 ? (() => { const l = rand() < 0.5 ? [-17, -11] : [17, 10], w = blanketToWorld(l[0] + rr(-3, 3), l[1] + rr(-3, 3)); return V2(w.x, w.z); })()
          : pk < 0.7 ? V2(rr(-92, -86), [-14, 14, 44, -44][Math.floor(rand() * 4)]) : randLand(this.pos.x, this.pos.y, 25, 70);
        return [S.call(d => { d.sleepStyle = rand() < 0.55 ? 'catCurl' : 'catLoaf'; }), S.go(spot, 'walk', { text: 'Looking for a good spot', arrive: 2, ignoreOther: true }), S.spin(0.7),
          S.hold('lie', 2.0, { text: 'Kneading, then settling', look: 'forward' }),
          S.hold('sleep', night ? rr(40, 60) : rr(20, 36), { text: 'Fast asleep', look: 'none' }),
          S.hold('lie', 1.8, { text: 'Waking up' }), S.hold('stand', 0.7), S.hold('bow', 1.4, { text: 'Big stretch', look: 'forward' }), S.hold('stand', 0.6)];
      }
      case 'watchtail': {
        const c = this.watchTarget || cats[1], ang = rand() * 6.28;
        return [S.go(() => V2(c.pos.x + Math.cos(ang) * 17, c.pos.y + Math.sin(ang) * 17), 'walk', { text: 'Has noticed ' + c.name + "'s tail", arrive: 3, ignoreOther: true }),
          S.face(d => headingTo(c.pos.x - d.pos.x, c.pos.y - d.pos.y)),
          S.hold(this.p.eager ? 'crouch' in POSES ? 'crouch' : 'sit' : 'sit', rr(8, 14), { text: 'Mesmerised by ' + c.name + "'s tail", look: 'point', lookFn: () => c.tailTip(new THREE.Vector3()), fixed: true,
            onStart: d => { d.wagBoost = 0.1; }, onUpdate: (d, dt, t) => { d.extraTilt = 0.22 * Math.sin(t * 1.6 + 1); d.fx.twitch = Math.max(d.fx.twitch, 0.15 * Math.sin(t * 2.2) ** 2); },
            until: d => !c.swishing || c.elev > 1 || c.poseName === 'sleep' || Math.hypot(c.pos.x - d.pos.x, c.pos.y - d.pos.y) > 40 }),
          S.call(d => { d.extraTilt = 0; }), S.hold('stand', 0.8, { text: 'Tail show over', look: 'forward' })];
      }
      case 'tidy': {   // Bobby sorts out everyone's blankets
        const cl = this.tidyTarget() || CLOTHS[1], grump = this.mood, ct = cl.centroid();
        const txt = grump ? 'Muttering about the state of this blanket' : 'Spotted a messy blanket';
        return [S.go(() => { const n = cl.nearest(this.pos.x, this.pos.y), f = this.fwd; return V2(cl.p[n.k * 3] - f.x * NOSE, cl.p[n.k * 3 + 2] - f.y * NOSE); }, 'walk', { text: txt, arrive: 2, ignoreOther: true }),
          S.hold('sniff', 0.9, { text: grump ? 'Tutting at the blanket' : 'Eyeing up the blanket', look: 'none', fixed: true }),
          S.hold('tug', 0.5, { text: 'Taking hold of the corner', look: 'none', fixed: true, onStart: d => grabWithMouth(d, cl) }),
          S.hold('tug', rr(2.2, 3.2), { text: grump ? 'Dragging it straight, grumbling' : 'Dragging the blanket straight', look: 'none', fixed: true, onStart: d => { d.backV = 8; }, onUpdate: d => { d.backV = Math.sin(state.T * 2.5) > 0.5 ? 3 : 8; } }),
          S.call(d => { d.backV = 0; releaseGrab(d); cl.shakeOut(); }),
          S.hold('shake', 1.0, { text: 'Giving it a shake' }),
          S.hold('stand', 1.2, { text: grump ? 'Hmph. That will do' : 'All tidy now', look: 'forward', onStart: d => { d.wagBoost = grump ? 0.2 : 0.7; } }), S.hold('stand', 0.4)];
      }
      case 'grump': {
        const t = dogs.filter(d => d !== this).sort((a, b) => Math.hypot(a.pos.x - this.pos.x, a.pos.y - this.pos.y) - Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y))[0];
        return [S.go(() => V2(t.pos.x + t.fwd.y * 20, t.pos.y - t.fwd.x * 20), 'walk', { text: 'Marching over to ' + t.name, arrive: 3, ignoreOther: true }),
          S.face(d => headingTo(t.pos.x - d.pos.x, t.pos.y - d.pos.y)),
          S.hold('stand', 2.4, { text: 'Grumbling at ' + t.name, look: 'point', lookFn: () => t.headWorld(new THREE.Vector3()), fixed: true, onStart: d => { d.wagBoost = 0; t.greetedBy(d); } }),
          S.go(randLand(this.pos.x, this.pos.y, 40, 80), 'walk', { text: 'Stomping off' }),
          S.hold('sit', rr(5, 8), { text: 'Having a sulk', look: 'around' }), S.hold('lie', rr(6, 10), { text: 'Still sulking' }), S.hold('stand', 0.6)];
      }
      case 'leave': {
        const b = SB.pos; let q: THREE.Vector2 | null = null, bd = -1;
        for (let k = 0; k < 8; k++) { const c = randLand(this.pos.x, this.pos.y, 70, 110), d2 = Math.hypot(c.x - b.x, c.y - b.y); if (d2 > bd) { bd = d2; q = c; } }
        return [S.hold('stand', 0.9, { text: 'Not in the mood for the ball', look: 'point', lookFn: ballPt, fixed: true, onStart: d => { d.wagBoost = 0; } }),
          S.go(q, 'walk', { text: 'Leaving them to it', arrive: 6 }), S.hold('sit', rr(5, 9), { text: 'Grumpy, keeping well clear' }), S.hold('stand', 0.6)];
      }
      case 'steal': {   // Murphy grabs a corner of his blanket and drags it off the bed
        const cl = bedBlanket(this.idx), bd = BEDS[this.idx], a = rand() * 6.283;
        const app = V2(bd.x + Math.cos(a) * 20, bd.z + Math.sin(a) * 20);
        return [S.go(app, 'trot', { text: 'Eyeing up his blanket', arrive: 3 }), S.face(d => headingTo(bd.x - d.pos.x, bd.z - d.pos.y)),
          S.go(() => { const n = cl.nearest(this.pos.x, this.pos.y), f = this.fwd; return V2(cl.p[n.k * 3] - f.x * NOSE, cl.p[n.k * 3 + 2] - f.y * NOSE); }, 'walk', { text: 'Eyeing up his blanket', arrive: 2 }),
          S.hold('tug', 0.6, { text: 'Grabbing his blanket', look: 'none', fixed: true, onStart: d => grabWithMouth(d, cl) }),
          S.hold('tug', rr(2.5, 4), { text: 'Dragging his blanket off the bed', look: 'none', fixed: true, onStart: d => { d.backV = 11; }, onUpdate: d => { if (Math.sin(state.T * 2) > 0.6) d.backV = 4; else d.backV = 11; } }),
          S.hold('tug', rr(0.8, 1.4), { text: 'Giving it a good shake', look: 'none', fixed: true, onStart: d => { d.backV = 0; d.happyT = 1.2; } }),
          S.call(d => { d.backV = 0; releaseGrab(d); }), S.hold('stand', 0.8, { text: 'Very proud of himself', onStart: d => { d.wagBoost = 0.9; } }), S.hold('lie', rr(4, 7), { text: 'Very proud of himself' }), S.hold('stand', 0.6)];
      }
      case 'zoomies': {
        if (this.p.bursty) return this.B('burst');
        const steps = [S.hold('bow', 1.3, { text: 'Zoomies!', look: 'forward', onStart: d => {
          if (o.poseName !== 'sleep' && o.behaviour !== 'hello' && (d.forceChase || rand() < 0.75)) o.interrupt(o.chase(d), 'chase');
          d.forceChase = false;
        } })];
        let from = this.pos.clone();
        for (let k = 0; k < 6; k++) { const p = randLand(from.x, from.y, 40, 90); steps.push(S.go(p, 'run', { ignoreOther: true, arrive: 6 })); from = p; }
        steps.push(S.hold('stand', 2.2, { text: 'Catching a breath', pant: true, onStart: d => { d.energy -= 0.15; } }));
        return steps;
      }
      case 'visit': {
        if (o.poseName === 'sleep') {
          return [S.go(() => { const f = o.fwd; return V2(o.pos.x + f.x * 18, o.pos.y + f.y * 18); }, 'walk', { text: 'Checking on ' + o.name, arrive: 3, ignoreOther: true }),
            S.face(d => { const hp = o.headWorld(V3); return headingTo(hp.x - d.pos.x, hp.z - d.pos.y); }),
            S.hold('sniff', 2.2, { text: 'Checking on ' + o.name, look: 'none' })].concat(this.B('nap'));
        }
        const side = rand() < 0.5 ? 1 : -1;
        const out = [S.go(() => { const f = o.fwd; return V2(o.pos.x + f.x * 19 - f.y * 4 * side, o.pos.y + f.y * 19 + f.x * 4 * side); }, this.p.eager ? 'trot' : 'walk', { text: (this.p.eager ? 'Bounding over to ' : 'Wandering over to ') + o.name, arrive: 3, ignoreOther: true, timeout: 14 }),
          S.face(d => { const hp = o.headWorld(V3); return headingTo(hp.x - d.pos.x, hp.z - d.pos.y); }),
          S.hold('sniff', 3, { text: this.p.eager ? 'Nose boops with ' + o.name : 'A gentle hello to ' + o.name, look: 'none', onStart: d => { o.greetedBy(this); if (d.p.eager) d.wagBoost = 0.9; } })];
        if (this.p.eager && rand() < 0.4) out.push(S.hold('bow', 1.2, { text: 'Trying to get ' + o.name + ' to play', look: 'point', lookFn: () => o.headWorld(new THREE.Vector3()) }));
        out.push(S.hold('stand', 0.8));
        return out;
      }
      case 'hello': {
        const pts = helloPoints();
        const eager = this.p.eager;
        const steps = [S.go(pts[this.idx], eager ? 'run' : 'trot', { text: unprompted ? 'Coming over to see you' : eager ? 'Racing over to say hello' : 'Coming to say hello', arrive: 3, ignoreOther: true }),
          S.face(d => headingTo(camera.position.x - d.pos.x, camera.position.z - d.pos.y))];
        if (this.p.tidy) steps.push(...this.tricks());
        else if (eager) steps.push(S.hold('sit', rr(2, 3.5), { text: 'Saying hello', look: 'camera', fixed: true, onStart: d => { d.wagBoost = 1.1; } }), S.hold('stand', rr(3, 5), { text: 'Too excited to sit still', look: 'camera', fixed: true, onStart: d => { d.happyT = 2.5; d.wagBoost = 1; } }));
        else steps.push(S.hold('sit', rr(8, 11), { text: 'Saying hello', look: 'camera', fixed: true, onStart: d => { d.wagBoost = 0.5; } }));
        steps.push(S.hold('stand', 0.6));
        return steps;
      }
    }
    return [S.hold('stand', 1)];
  }
  contest(m: Dog): Step[] {
    const ct: Step = { text: 'Trying to steal the ball', start(d) { d.gait = 'trot'; d.poseName = 'stand'; d.look = 'point'; d.lookFn = ballPt; this.t = 0; },
      update(d, dt) {
        this.t += dt;
        if (m.behaviour !== 'ball' || this.t > 45 || (this.t > 3 && !(m.step && (m.step.dribble || m.step.text === 'Off to get the ball')))) { d.goal = null; return true; }
        const b = V2(SB.pos.x + SB.vel.x * 0.5, SB.pos.y + SB.vel.y * 0.5), dist = Math.hypot(d.pos.x - b.x, d.pos.y - b.y);
        let px = b.x - m.pos.x, pz = b.y - m.pos.y; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
        const rx = d.pos.x - b.x, rz = d.pos.y - b.y, along = rx * px + rz * pz;
        let tx, tz;
        if (along > -NOSE * 0.6) { const side = (rx * -pz + rz * px) >= 0 ? 1 : -1; tx = b.x - px * (NOSE + BALL_R + 5) - pz * side * (BALL_R + 7); tz = b.y - pz * (NOSE + BALL_R + 5) + px * side * (BALL_R + 7); }
        else { tx = b.x - px * NOSE; tz = b.y - pz * NOSE; }
        d.gait = dist < 45 && Math.sin(this.t * 1.1) > -0.4 ? 'dribble' : dist < 90 ? 'run' : 'trot';
        d.poseName = dist < 26 ? 'dribble' : 'stand';
        d.kickDir = V2(px, pz);
        steerTo(d, tx, tz, dist < 45);
        if (m.step && m.step.dribble && SB.last === d && state.T - SB.touchT[m.idx] > 0.6 && Math.hypot(m.pos.x - SB.pos.x, m.pos.y - SB.pos.y) > 10 && (SB.streak[d.idx] >= 2 || SB.vel.length() > 6)) {
          m.labelOverride = { text: 'Lost the ball to ' + d.name, t: 2.5 };
          SB.streak[d.idx] = 0;
          d.interrupt([S.hold('bow', 0.5, { text: 'Stole the ball! Zoomies!', look: 'forward' })].concat(d.B('burst').slice(1)), 'burst');
        }
        return false;
      } };
    return [S.hold('stand', 0.5, { text: 'Watching ' + m.name + ' with the ball', look: 'point', lookFn: ballPt }), ct, S.hold('lie', rr(5, 8), { text: 'Flopped down', onStart: d => { d.kickDir = null; } })];
  }
  chase(leader: Dog): Step[] {
    const st: Step = { text: 'Chasing ' + leader.name, start(d) { d.gait = 'run'; d.poseName = 'stand'; d.look = 'forward'; this.t = 0; },
      update(d, dt) {
        this.t += dt;
        if (!d.goal) d.goal = { pt: () => { const f = leader.fwd; return V2(leader.pos.x - f.x * 14, leader.pos.y - f.y * 14); }, arrive: 3, ignoreOther: true, path: null, k: 0, repath: 0, fail: 0 };
        const done = !['zoomies', 'burst'].includes(leader.behaviour as string) || (leader.step && /Catching a breath|Flopped/.test(leader.step.text || '')) || this.t > (d.p.bursty ? this.lim || (this.lim = rr(4, 7)) : 30);
        if (done) d.goal = null;
        return done;
      } };
    return [S.hold('bow', this.p.bursty ? 0.6 : 1.0, { text: 'Zoomies!', look: 'forward' }), st,
      this.p.bursty ? S.hold('lie', rr(8, 12), { text: 'Flopped down' }) : S.hold('stand', 2.0, { text: 'Catching a breath', pant: true })];
  }

  poseFor(name: string) { return this.p.cat && name === 'sleep' ? (this.sleepStyle || 'catCurl') : super.poseFor(name); }
  standHeight(x: number, z: number, gy: number) { return gy + deckH(x, z) + bedTop(x, z) + clothHeight(x, z); }
  onActivity(text: string) { sndActivity(this, text); }
  think(dt: number) {
    // Murphy startles now and then, and runs back to Mali
    this.spookCd = Math.max(0, (this.spookCd || 0) - dt);
    if (this.p.nervous && !this.spookCd && this.free() && this.behaviour !== 'spook' && IDLE_POSE.has(this.poseName) && rand() < dt * (todKey === 'night' ? 0.03 : 0.012)) this.startle();
    this.thirst = clamp(this.thirst + dt * 0.004, 0, 1);
    this.trickCd = Math.max(0, (this.trickCd || 0) - dt);
    if (this.fishM) { this.fishT = Math.max(0, (this.fishT || 0) - dt); if (!this.fishT) this.hasFish = false; this.fishM.visible = !!this.hasFish; }
    this.ambushCd = Math.max(0, (this.ambushCd || 0) - dt);
    this.watchCd = Math.max(0, (this.watchCd === undefined ? rr(5, 20) : this.watchCd) - dt);
    if (this.p.curious && !this.p.cat && WX.rain < 0.3 && !isNight() && !this.watchCd && this.free() && this.poseName !== 'sleep' && !this.elevT && !NO_WATCH.has(this.behaviour as string)) {
      const c = cats.find(c => c !== this && c.swishing && c.elev < 1 && Math.hypot(c.pos.x - this.pos.x, c.pos.y - this.pos.y) < 95);
      if (c && rand() < dt * 0.35 * this.p.curious) { this.watchCd = rr(40, 80); this.watchTarget = c; this.interrupt(this.B('watchtail'), 'watchtail'); }
    }
    if (this.p.moody) {
      this.moodT = (this.moodT === undefined ? rr(40, 90) : this.moodT) - dt;
      if (this.moodT <= 0) { this.mood = this.mood ? 0 : 1; this.moodT = this.mood ? rr(35, 70) : rr(70, 150); }
      this.leaveCd = Math.max(0, (this.leaveCd || 0) - dt);
      const m = dogs[0];
      if (!this.leaveCd && m !== this && m.behaviour === 'ball' && this.free() && this.behaviour !== 'leave' && this.poseName !== 'sleep' && Math.hypot(SB.pos.x - this.pos.x, SB.pos.y - this.pos.y) < 75) {
        this.leaveCd = 40; this.mood = 1; this.moodT = rr(30, 50); this.interrupt(this.B('leave'), 'leave');
      }
    }
    // Mali cannot resist a spot that Murphy is lying in
    if (this.p.spotThief) {
      this.thiefCd = Math.max(0, (this.thiefCd || 0) - dt);
      let mark: Dog | null = null;
      for (const o of dogs) {
        if (o === this) continue;
        const snug = o.spotInfo && SNUG.has(o.poseName) && o.v < 2 * K;
        o.snugT = snug ? (o.snugT || 0) + dt : 0;
        if (snug && o.snugT > 1.2 && !mark) mark = o;
      }
      if (mark && (isNight() || WX.rain > 0.2 || ['bedtime', 'shelter'].includes(mark.behaviour as string))) mark = null;
      if (mark && !this.thiefCd && this.free() && this.behaviour !== 'takespot' && !(this.behaviour === 'nap' && this.poseName === 'sleep')) {
        this.thiefCd = 70; this.mark = mark; this.interrupt(this.B('takespot'), 'takespot');
      }
    }

  }
  afterWet(dt: number, inW: boolean, inRain: boolean) {
    this.shelterCd = Math.max(0, (this.shelterCd || 0) - dt);
    if ((WX.rain > 0.35 || WX.storm > 0.4) && !this.shelterCd && this.free() && !this.swimming && !SHELTERING.has(this.behaviour as string) && rand() < dt * 0.6) { this.shelterCd = 25; this.interrupt(this.B('shelter'), 'shelter'); }
    this.dryT = !inW && !inRain && !this.swimming && this.wet > 0.35 ? (this.dryT || 0) + dt : 0;
    if (this.dryT > 1.4 && !this.shakeCd && this.free() && this.poseName !== 'shake') { this.shakeCd = 12; this.interrupt([S.hold('shake', 1.1, { text: 'Shaking off the water', onStart: d2 => d2.splash() }), S.hold('stand', 0.7)], 'shakeoff'); }
  }
}

function helloPoints() {
  const dx = camera.position.x - focus.x, dz = camera.position.z - focus.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len, cx = focus.x + ux * 26, cz = focus.z + uz * 26, px = -uz, pz = ux;
  const snap = (x, z) => { const c = nearestWalk(x, z, true); return c >= 0 ? (cellIdx(x, z) === c ? V2(x, z) : cellPt(c)) : V2(x, z); };
  return [snap(cx + px * 8, cz + pz * 8), snap(cx - px * 8, cz - pz * 8), snap(cx + ux * 12, cz + uz * 12)];
}
