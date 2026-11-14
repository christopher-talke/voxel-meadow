import * as THREE from 'three';
import { $, V3, clamp, rand, rr, smooth, store } from '../core/util';
import { camera, focus } from '../render/stage';
import { B, LAKE } from '../world/layout';
import { WX, env, underRoof } from '../sim/sky';
import { ents } from '../entities/registry';
import { showHint } from '../ui/hint';
import { hooks } from '../core/hooks';

// ================= sound: synthesised ambience and placeholder animal voices (no files needed) =================
/** The synth's shared state. The audio graph is built lazily on the first unmute (sndInit), so ctx and the buses are unset until then. */
interface SoundState {
  on: boolean;
  ctx: AudioContext | null;
  t: number;
  timers: Record<string, number>;
  loops: Record<string, any>;
  master: GainNode;
  amb: GainNode;
  sfx: GainNode;
  white: AudioBuffer;
  brown: AudioBuffer;
}
export const SND = { on: false, ctx: null, t: 0, timers: {}, loops: {} } as unknown as SoundState;
function sndInit() {
  if (SND.ctx) return SND.ctx;
  const C = new (window.AudioContext || (window as any).webkitAudioContext)() as AudioContext; SND.ctx = C;
  const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(C.destination);
  SND.master = C.createGain(); SND.master.gain.value = 0; SND.master.connect(comp);
  SND.amb = C.createGain(); SND.amb.gain.value = 0.9; SND.amb.connect(SND.master);
  SND.sfx = C.createGain(); SND.sfx.gain.value = 1.4; SND.sfx.connect(SND.master);
  const mkNoise = brown => { const n = C.sampleRate * 3, b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; };
  SND.white = mkNoise(false); SND.brown = mkNoise(true);
  const loop = (buf, filters, g0) => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); let n = s; for (const f of filters) { n.connect(f); n = f; } const g = C.createGain(); g.gain.value = g0; n.connect(g); g.connect(SND.amb); s.start(); return { s, g, f: filters }; };
  const bq = (type, f, q = 0.7) => { const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  SND.loops.wind = loop(SND.brown, [bq('bandpass', 420, 0.6)], 0);
  SND.loops.rain = loop(SND.white, [bq('highpass', 900), bq('lowpass', 7000)], 0);
  SND.loops.roofRain = loop(SND.white, [bq('bandpass', 2400, 1.4)], 0);
  SND.loops.water = loop(SND.brown, [bq('lowpass', 520)], 0);
  SND.loops.leaves = loop(SND.white, [bq('bandpass', 5200, 0.9)], 0);
  return C;
}
const sndNow = () => SND.ctx!.currentTime;
// a node chain ending in a panner placed in the world (or straight to a bus when pos is null)
function sndOut(pos: THREE.Vector3 | null, gain: number, bus?: AudioNode) {
  const C = SND.ctx!, g = C.createGain(); g.gain.value = gain;
  if (pos) { const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 45; p.rolloffFactor = 1.3; p.maxDistance = 2000;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p); p.connect(bus || SND.sfx); }
  else g.connect(bus || SND.sfx);
  return g;
}
function env3(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak = 0.5, a = 0.008): OscillatorNode {
  const C = SND.ctx!, o = C.createOscillator(), g = C.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(g); g.connect(out); env3(g, t, a, peak, dur); o.start(t); o.stop(t + a + dur + 0.05); return o;
}
function noiseHit(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number, brown?: boolean) {
  const C = SND.ctx!, s = C.createBufferSource(); s.buffer = brown ? SND.brown : SND.white; const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  const g = C.createGain(); s.connect(b); b.connect(g); g.connect(out); env3(g, t, 0.01, peak, dur); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1); return b;
}
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
  const C = SND.ctx, L = C.listener, cp = camera.position, t = C.currentTime;
  const fw = V3.set(0, 0, -1).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = fw.x; L.forwardY.value = fw.y; L.forwardZ.value = fw.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(fw.x, fw.y, fw.z, 0, 1, 0); }
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
  // birds by day, crickets and frogs at night, kookaburras at the edges of the day
  const day = SND_DAY(), night = (1 - smooth(-8, 0, env.el)) * (1 - WX.rain);
  const tick = (k, gap, fn) => { SND.timers[k] = (SND.timers[k] === undefined ? rr(1, gap) : SND.timers[k]) - dt; if (SND.timers[k] <= 0) { SND.timers[k] = rr(gap * 0.5, gap * 1.5); fn(); } };
  if (day > 0.2) { tick('twit', 5 / day, () => birdCall('twit')); tick('magpie', 22 / day, () => birdCall('magpie')); }
  if (env.el > -6 && env.el < 10 && WX.rain < 0.3) tick('kooka', 90, () => birdCall('kooka'));
  if (night > 0.3) {
    tick('cricket', 0.9, () => { const a = rand() * 6.283, p = new THREE.Vector3(cp.x + Math.cos(a) * 60, 4, cp.z + Math.sin(a) * 60), out = sndOut(p, 0.09 * night, SND.amb), t0 = sndNow(); for (let k = 0; k < 3; k++) tone(out, 'sine', 4300, 4300, t0 + k * 0.07, 0.035, 0.4, 0.004); });
    if (dl < 160) tick('frog', 4, () => { const p = new THREE.Vector3(LAKE.i * B + rr(-60, 60), 0, LAKE.j * B + rr(-60, 60)), out = sndOut(p, 0.25 * night, SND.amb), t0 = sndNow(); for (let k = 0; k < 2; k++) tone(out, 'square', 190, 150, t0 + k * 0.16, 0.08, 0.25); });
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
  if (on) { try { sndInit(); SND.ctx!.resume(); SND.master.gain.setTargetAtTime(0.85, SND.ctx!.currentTime, 0.4); } catch (e) { SND.on = false; } }
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
