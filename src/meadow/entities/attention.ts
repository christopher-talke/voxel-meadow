import * as THREE from 'three';
import { state } from '../../engine/core/state';
import { seeded } from '../../engine/core/util';
import { K } from '../../engine/core/scale';
import { WX } from '../../engine/sky/sky';
import { recentStimuli, type Stimulus } from '../../engine/ambient/stimuli';
import { S } from './behaviours';
import { SB } from './ball';
import { ents } from './registry';

// ================= attention: noticing things mid-behaviour =================
// Each animal looks about twice a second (staggered, so they never all turn at once) and may react in one of three ways:
//   glance: the head turns to it for a moment; nothing else changes
//   pause: it stops what it is doing for a beat to look, then carries on where it left off
//   switch: it drops what it was doing for something better (only things already in its character)
// Reactions use their own random stream, so noticing never reshuffles anyone else's choices.
const R = seeded(6061);
export const ATTN = { period: 0.5, passR: 26, passV: 30 * K, ballR: 70, ballV: 25, birdR: 45, glanceCd: [4, 9], ballSwitch: 0.15, stalk: 0.2 };
const cd = new Map<any, number>(), lastTick = new Map<any, number>();
let wasRaining = false;
const stim: Stimulus[] = [], _p = new THREE.Vector3();
export function resetAttention() { cd.clear(); lastTick.clear(); wasRaining = false; }

const asleep = d => d.poseName === 'sleep';
const easy = d => !asleep(d) && !d.swimming && !d.lily && d.elevT < 0.5;
/** Steps that can be paused and picked up again: a walk, a sniff about, standing or sitting. */
function pausable(d) {
  const s = d.step; if (!s) return false;
  if (d.goal) return d.gait === 'walk' || d.gait === 'sniffwalk';
  return ['stand', 'sniff', 'sit'].includes(d.poseName) && !s.dribble;
}
function glance(d, fn: () => THREE.Vector3, t = 1.4) {
  d.lookOverride = { fn, t };
  cd.set(d, state.T + ATTN.glanceCd[0] + R.rand() * (ATTN.glanceCd[1] - ATTN.glanceCd[0]));
}
/** Stop for a beat to watch something, then resume the step it was on. */
function pause(d, pose: string, dur: number, fn: () => THREE.Vector3, text?: string) {
  const cur = d.step; d.step = null; d.goal = null;
  d.queue.unshift(S.hold(pose, dur, { text, look: 'point', lookFn: fn, fixed: true }), ...(cur ? [cur] : []));
  cd.set(d, state.T + 8 + R.rand() * 6);
}

export function attentionTick(dt: number) {
  const raining = WX.rain > 0.12, rainStart = raining && !wasRaining; wasRaining = raining;
  recentStimuli(2, stim);
  ents.forEach((d: any, i) => {
    // the first drops: everyone awake looks up, and anyone pottering stops for a moment
    if (rainStart && easy(d)) {
      const up = () => _p.set(d.pos.x, d.rootY + 60, d.pos.y + 10);
      if (pausable(d) && d.free()) pause(d, 'stand', 1.2 + R.rand(), up, 'Feeling the first drops'); else glance(d, up, 1.5);
      return;
    }
    const due = (lastTick.get(d) ?? (i * 0.1)) + ATTN.period;
    if (state.T < due) return;
    lastTick.set(d, state.T);
    if (!easy(d) || state.T < (cd.get(d) ?? 0) || d.lookOverride) return;
    // the ball going past: everyone watches; an eager dog with a taste for it may join in
    const bs = SB.vel.length();
    if (bs > ATTN.ballV && Math.hypot(SB.pos.x - d.pos.x, SB.pos.y - d.pos.y) < ATTN.ballR && d.behaviour !== 'ball' && d.behaviour !== 'contest') {
      const ball = () => _p.set(SB.pos.x, SB.y, SB.pos.y);
      if (d.p.eager && d.p.w.ball > 0 && d.free() && d.energy > 0.4 && R.rand() < ATTN.ballSwitch) { d.interrupt(d.B('ball'), 'ball'); cd.set(d, state.T + 30); }
      else glance(d, ball, 1.6);
      return;
    }
    // a bird or a rabbit nearby: a look, or for a cat a long, still stare
    for (const s of stim) {
      if (Math.hypot(s.x - d.pos.x, s.z - d.pos.y) > ATTN.birdR * s.strength) continue;
      const at = () => _p.set(s.x, s.y, s.z);
      if (d.p.cat && pausable(d) && d.free() && R.rand() < ATTN.stalk) pause(d, 'stalk', 2 + R.rand() * 2, at, 'Watching a ' + s.kind);
      else glance(d, at, 1.2);
      return;
    }
    // someone trotting past
    for (const o of ents as any[]) {
      if (o === d || o.v < ATTN.passV || Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) > ATTN.passR) continue;
      glance(d, () => o.headWorld(_p), 1.2);
      return;
    }
  });
}
