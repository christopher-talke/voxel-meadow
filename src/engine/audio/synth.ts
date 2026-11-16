import * as THREE from 'three';
import { V3 } from '../core/util';
import { camera } from '../render/stage';

// ================= WebAudio synth primitives: no sample files, everything is made from oscillators and noise =================
/** The synth's shared state. The audio graph is built lazily on the first unmute (sndInit), so ctx and the buses are unset until then. */
export interface SoundState {
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
/** Build the audio graph on first use (it needs a user gesture): master, ambience and effects buses, noise beds,
 * then `setup` adds the content's looping ambience. Safe to call again. */
export function initSynth(setup?: (loop: (buf: AudioBuffer, filters: BiquadFilterNode[], g0: number) => any, bq: (type: BiquadFilterType, f: number, q?: number) => BiquadFilterNode) => void) {
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
  setup?.(loop, bq);
  return C;
}
export const sndNow = () => SND.ctx!.currentTime;
// a node chain ending in a panner placed in the world (or straight to a bus when pos is null)
export function sndOut(pos: THREE.Vector3 | null, gain: number, bus?: AudioNode) {
  const C = SND.ctx!, g = C.createGain(); g.gain.value = gain;
  if (pos) { const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 45; p.rolloffFactor = 1.3; p.maxDistance = 2000;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p); p.connect(bus || SND.sfx); }
  else g.connect(bus || SND.sfx);
  return g;
}
export function env3(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
export function tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak = 0.5, a = 0.008): OscillatorNode {
  const C = SND.ctx!, o = C.createOscillator(), g = C.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(g); g.connect(out); env3(g, t, a, peak, dur); o.start(t); o.stop(t + a + dur + 0.05); return o;
}
export function noiseHit(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number, brown?: boolean) {
  const C = SND.ctx!, s = C.createBufferSource(); s.buffer = brown ? SND.brown : SND.white; const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  const g = C.createGain(); s.connect(b); b.connect(g); g.connect(out); env3(g, t, 0.01, peak, dur); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1); return b;
}
/** Keep the listener on the camera. Call once a frame while sound is on. */
export function updateListener() {
  const L = SND.ctx!.listener, cp = camera.position;
  const fw = V3.set(0, 0, -1).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = fw.x; L.forwardY.value = fw.y; L.forwardZ.value = fw.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(fw.x, fw.y, fw.z, 0, 1, 0); }
}
