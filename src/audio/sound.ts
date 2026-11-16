import * as THREE from 'three';
import { $, V3, clamp, rand, rr, smooth, store } from '../engine/core/util';
import { camera, focus } from '../engine/render/stage';
import { LAKE, SPILL } from '../world/layout';
import { B } from '../engine/core/scale';
import { WX, env, underRoof } from '../engine/sky/sky';
import { ents } from '../entities/registry';
import { showHint } from '../ui/hint';
import { hooks } from '../engine/core/hooks';
import { SND, initSynth, noiseHit, sndNow, sndOut, tone, updateListener } from '../engine/audio/synth';
export { SND };

// ================= sound: synthesised ambience and placeholder animal voices (no files needed) =================
// the meadow's looping ambience: weather, the lake, the falls and the leaves
const meadowLoops = (loop, bq) => {
  SND.loops.wind = loop(SND.brown, [bq('bandpass', 420, 0.6)], 0);
  SND.loops.rain = loop(SND.white, [bq('highpass', 900), bq('lowpass', 7000)], 0);
  SND.loops.roofRain = loop(SND.white, [bq('bandpass', 2400, 1.4)], 0);
  SND.loops.water = loop(SND.brown, [bq('lowpass', 520)], 0);
  SND.loops.falls = loop(SND.brown, [bq('lowpass', 900), bq('highpass', 120)], 0);
  SND.loops.leaves = loop(SND.white, [bq('bandpass', 5200, 0.9)], 0);
};
const entPos = d => new THREE.Vector3(d.pos.x, d.rootY + 8, d.pos.y);
const VOICE = { Murphy: 1.15, Mali: 1.3, Bobby: 0.82, Billy: 1.1, Ashy: 0.92 };
export const SFX = {
  bark(d, n = 1) { const out = sndOut(entPos(d), 0.55), v = VOICE[d.name] || 1, t = sndNow();
    for (let k = 0; k < n; k++) { const tk = t + k * rr(0.2, 0.3); tone(out, 'square', 330 * v, 180 * v, tk, 0.11, 0.18); tone(out, 'sawtooth', 520 * v, 260 * v, tk, 0.09, 0.12); noiseHit(out, tk, 0.08, 'bandpass', 1300 * v, 1.2, 0.35); } },
  yelp(d) { const out = sndOut(entPos(d), 0.45), v = VOICE[d.name] || 1, t = sndNow(); tone(out, 'triangle', 700 * v, 1300 * v, t, 0.16, 0.4); tone(out, 'sine', 1300 * v, 900 * v, t + 0.16, 0.22, 0.25); },
  whine(d) { const out = sndOut(entPos(d), 0.3), v = VOICE[d.name] || 1, t = sndNow(); const o = tone(out, 'sine', 900 * v, 1150 * v, t, 0.7, 0.25, 0.08); o.detune.setValueAtTime(0, t); },
  grumble(d) { const out = sndOut(entPos(d), 0.5), t = sndNow(), C = SND.ctx!; const o = C.createOscillator(), lp = C.createBiquadFilter(), g = C.createGain(), lfo = C.createOscillator(), lg = C.createGain();
    o.type = 'sawtooth'; o.frequency.value = 95; lp.type = 'lowpass'; lp.frequency.value = 420; lfo.frequency.value = 23; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 1.1); o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2); },
  snore(d) { const out = sndOut(entPos(d), 0.18), t = sndNow(); noiseHit(out, t, 1.1, 'lowpass', 260, 2, 0.5, true); },
  lap(d) { const out = sndOut(entPos(d), 0.25), t = sndNow(); for (let k = 0; k < 6; k++) noiseHit(out, t + k * 0.17, 0.05, 'bandpass', 1800, 3, 0.4); },
  shake(d) { const out = sndOut(entPos(d), 0.4), t = sndNow(); noiseHit(out, t, 0.9, 'bandpass', 3000, 0.8, 0.45); for (let k = 0; k < 8; k++) noiseHit(out, t + k * 0.1, 0.06, 'highpass', 4000, 0.7, 0.3); },
  /** A frog's croak from a point in the world (two quick, throaty pulses). */
  croak(p: THREE.Vector3, vol = 0.25) { const out = sndOut(p, vol, SND.amb), t0 = sndNow(), f = rr(170, 215); for (let k = 0; k < 2; k++) tone(out, 'square', f, f * 0.78, t0 + k * 0.16, 0.08, 0.25); },
  splash(d, big?) { const out = sndOut(entPos(d), big ? 0.8 : 0.4), t = sndNow(); noiseHit(out, t, big ? 0.9 : 0.4, 'lowpass', 1400, 0.8, 0.7, false); noiseHit(out, t + 0.05, big ? 1.2 : 0.5, 'highpass', 2500, 0.6, 0.35); },
  paddle(d) { const out = sndOut(entPos(d), 0.18), t = sndNow(); noiseHit(out, t, 0.18, 'bandpass', 900, 1.5, 0.4, true); },
  meow(d, happy?) { const out = sndOut(entPos(d), 0.42), v = VOICE[d.name] || 1, t = sndNow(), C = SND.ctx!;
    const o = C.createOscillator(), bp = C.createBiquadFilter(), g = C.createGain(); o.type = 'sawtooth'; bp.type = 'bandpass'; bp.Q.value = 4;
    const f0 = 520 * v, len = happy ? 0.35 : rr(0.45, 0.7);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (happy ? 1.5 : 1.35), t + len * 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.9, t + len);
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1800, t + len * 0.45); bp.frequency.linearRampToValueAtTime(700, t + len);
    o.connect(bp); bp.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05); g.gain.setValueAtTime(0.6, t + len * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + len); o.start(t); o.stop(t + len + 0.05); },
  chirp(d) { const out = sndOut(entPos(d), 0.3), t = sndNow(); tone(out, 'triangle', 1400, 2100, t, 0.07, 0.4); tone(out, 'triangle', 1500, 2300, t + 0.1, 0.07, 0.35); },
  purr(d) { const out = sndOut(entPos(d), 0.2), t = sndNow(); for (let k = 0; k < 2; k++) { const b = noiseHit(out, t + k * 1.4, 1.2, 'lowpass', 180, 1, 0.5, true); } },
  hiss(d) { const out = sndOut(entPos(d), 0.3), t = sndNow(); noiseHit(out, t, 0.5, 'highpass', 3500, 0.7, 0.4); },
  whistle() { const out = sndOut(null, 0.3), t = sndNow(); tone(out, 'sine', 1800, 2600, t, 0.22, 0.6, 0.02); tone(out, 'sine', 2600, 1700, t + 0.32, 0.4, 0.6, 0.02); },
  thunder(dist) { const out = sndOut(null, 0.9, SND.amb), t = sndNow() + dist; const b = noiseHit(out, t, rr(3, 5), 'lowpass', 160, 0.8, 0.9, true); b.frequency.setValueAtTime(420, t); b.frequency.exponentialRampToValueAtTime(90, t + 3); noiseHit(out, t, 0.6, 'lowpass', 900, 0.6, 0.4, true); },
};
hooks.thunder = d => { if (SND.on) SFX.thunder(d); };
// birds: Australian-ish placeholders. Magpie warble, little twitterers, and a kookaburra at dawn and dusk.
function birdCall(kind) {
  const a = rand() * 6.283, r = rr(80, 260), p = new THREE.Vector3(camera.position.x + Math.cos(a) * r, Math.max(10, camera.position.y * 0.3) + rr(10, 40), camera.position.z + Math.sin(a) * r);
  const out = sndOut(p, 0.5, SND.amb), t = sndNow();
  if (kind === 'magpie') { let tt = t; for (let k = 0; k < rr(5, 9); k++) { const f = rr(700, 1700), d = rr(0.08, 0.22); const o = tone(out, 'sine', f, f * rr(0.85, 1.25), tt, d, 0.28, 0.02); const lfo = SND.ctx!.createOscillator(), lg = SND.ctx!.createGain(); lfo.frequency.value = rr(18, 30); lg.gain.value = f * 0.03; lfo.connect(lg); lg.connect(o.frequency); lfo.start(tt); lfo.stop(tt + d + 0.1); tt += d + rr(0.02, 0.09); } }
  else if (kind === 'kooka') { let tt = t; for (let k = 0; k < 14; k++) { const f = 500 + k * 25 + (k % 2) * 250; tone(out, 'sawtooth', f, f * 0.8, tt, 0.09, 0.12, 0.01); tt += 0.12 + (k > 8 ? 0.04 : 0); } }
  else { let tt = t; const base = rr(3000, 5200); for (let k = 0; k < rr(3, 8); k++) { tone(out, 'sine', base * rr(0.9, 1.1), base * rr(0.7, 1.3), tt, rr(0.04, 0.09), 0.18, 0.005); tt += rr(0.06, 0.14); } }
}
export function sndActivity(d, text) {
  if (!SND.on) return;
  const dist = camera.position.distanceTo(entPos(d)); if (dist > 700) return;
  const cat = d.p.cat;
  if (/^Startled|Spooked|jumpy|^Yelp/i.test(text)) cat ? SFX.hiss(d) : SFX.yelp(d);
  else if (/Shaking off|Shaking a wet/i.test(text)) SFX.shake(d);
  else if (/Got one/i.test(text) && cat) SFX.meow(d, true);
  else if (/Pouncing/i.test(text) && cat) SFX.chirp(d);
  else if (/Zoom|Hello|tricks|handshake|Running to|Chasing|Dribbling|Racing/i.test(text) && !cat && rand() < 0.5) SFX.bark(d, 1 + Math.floor(rand() * 3));
  else if (/Grumbl|Muttering|Tutting|grumbling|Stomping|Sulking/i.test(text) && !cat) SFX.grumble(d);
  else if (/drink|Lapping/i.test(text)) SFX.lap(d);
  else if (/Working up the courage/i.test(text)) SFX.whine(d);
  else if (cat && /Spotted a fish|Eyeing off|It got away|Lost interest|Big stretch/i.test(text) && rand() < 0.5) SFX.meow(d);
}
const SND_DAY = () => smooth(-6, 4, env.el) * (1 - Math.min(1, WX.rain * 1.6));
export function sndUpdate(dt) {
  if (!SND.on || !SND.ctx) return;
  const C = SND.ctx, cp = camera.position, t = C.currentTime;
  updateListener();
  SND.t += dt;
  // beds of sound
  const set = (lp, v, rate = 1.5) => lp.g.gain.setTargetAtTime(v, t, rate);
  const gusts = 0.6 + 0.4 * Math.sin(SND.t * 0.31) * Math.sin(SND.t * 0.13 + 1);
  set(SND.loops.wind, (0.04 + 0.32 * WX.wind * gusts) * (1 + WX.storm * 0.4));
  SND.loops.wind.f[0].frequency.setTargetAtTime(300 + 380 * WX.wind * gusts, t, 1.5);
  set(SND.loops.leaves, 0.012 + 0.05 * WX.wind * gusts);
  const roof = underRoof(focus.x, focus.z) && camera.position.distanceTo(focus) < 120;
  set(SND.loops.rain, 0.36 * WX.rain * (roof ? 0.5 : 1));
  set(SND.loops.roofRain, roof ? 0.22 * WX.rain : 0);
  const dl = Math.hypot(cp.x - LAKE.i * B, cp.z - LAKE.j * B) - LAKE.r * B;
  set(SND.loops.water, 0.13 * clamp(1 - dl / 200, 0, 1) * (0.7 + 0.3 * Math.sin(SND.t * 0.9)), 0.5);
  set(SND.loops.falls, 0.3 * clamp(1 - Math.hypot(cp.x - SPILL.x, cp.y - SPILL.y, cp.z - SPILL.z) / 380, 0, 1) ** 1.5, 0.6);
  // birds by day, crickets and frogs at night, kookaburras at the edges of the day
  const day = SND_DAY(), night = (1 - smooth(-8, 0, env.el)) * (1 - WX.rain);
  const tick = (k, gap, fn) => { SND.timers[k] = (SND.timers[k] === undefined ? rr(1, gap) : SND.timers[k]) - dt; if (SND.timers[k] <= 0) { SND.timers[k] = rr(gap * 0.5, gap * 1.5); fn(); } };
  if (day > 0.2) { tick('twit', 5 / day, () => birdCall('twit')); tick('magpie', 22 / day, () => birdCall('magpie')); }
  if (env.el > -6 && env.el < 10 && WX.rain < 0.3) tick('kooka', 90, () => birdCall('kooka'));
  if (night > 0.3) {
    tick('cricket', 0.9, () => { const a = rand() * 6.283, p = new THREE.Vector3(cp.x + Math.cos(a) * 60, 4, cp.z + Math.sin(a) * 60), out = sndOut(p, 0.09 * night, SND.amb), t0 = sndNow(); for (let k = 0; k < 3; k++) tone(out, 'sine', 4300, 4300, t0 + k * 0.07, 0.035, 0.4, 0.004); });
  }
  // the animals mutter now and then on their own
  for (const d of ents) {
    const k = 'idle' + d.name, near = camera.position.distanceTo(entPos(d)) < 220;
    if (!near) continue;
    if (d.poseName === 'sleep') tick(k, d.p.cat ? 7 : 9, () => d.p.cat ? SFX.purr(d) : SFX.snore(d));
    else if (d.swimming) tick(k, 0.7, () => SFX.paddle(d));
    else tick(k, d.p.cat ? 70 : 55, () => d.p.cat ? SFX.meow(d) : (d.name === 'Bobby' && d.mood ? SFX.grumble(d) : SFX.bark(d, 1 + Math.floor(rand() * 2))));
  }
}
export const tgSound = $<HTMLInputElement>('tg-sound');
function setSound(on: boolean, quiet?: boolean) {
  SND.on = on; store.set('meadow-sound', on ? '1' : '0'); tgSound.checked = on;
  if (on) { try { initSynth(meadowLoops); SND.ctx!.resume(); SND.master.gain.setTargetAtTime(0.85, SND.ctx!.currentTime, 0.4); } catch (e) { SND.on = false; } }
  else if (SND.ctx) SND.master.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.2);
  if (!quiet) showHint(on ? 'Sound on.' : 'Sound off.', 1600);
}
tgSound.addEventListener('change', () => setSound(tgSound.checked));
const sndPref = store.get('meadow-sound') === '1';
setSound(false, true);
if (sndPref) { const go = () => { setSound(true, true); removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); }; addEventListener('pointerdown', go, true); addEventListener('keydown', go, true); store.set('meadow-sound', '1'); }

let audio: AudioContext | null = null;
export function whistle() {
  if (SND.on && SND.ctx) return;   // the sound system plays the meadow whistle itself
  try {
    audio = audio || new (window.AudioContext || (window as any).webkitAudioContext)();
    const t0 = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.connect(g); g.connect(audio.destination);
    o.frequency.setValueAtTime(1500, t0); o.frequency.exponentialRampToValueAtTime(2300, t0 + 0.16);
    o.frequency.setValueAtTime(1700, t0 + 0.24); o.frequency.exponentialRampToValueAtTime(2500, t0 + 0.46);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.27); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.start(t0); o.stop(t0 + 0.52);
  } catch (e) { /* no audio */ }
}
