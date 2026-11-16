import { state } from '../core/state';

// ================= stimuli: small things happening in the world that an animal might notice =================
// Anything can post one (a bird landing, a rabbit bolting); attention code reads the recent ones. A short ring, no allocation churn.
export interface Stimulus { kind: string; x: number; y: number; z: number; t: number; strength: number; src?: any }
const N = 48, ring: Stimulus[] = Array.from({ length: N }, () => ({ kind: '', x: 0, y: 0, z: 0, t: -1e9, strength: 0 }));
let head = 0;
export function emit(kind: string, x: number, y: number, z: number, strength = 1, src?: any) {
  const s = ring[head]; head = (head + 1) % N;
  s.kind = kind; s.x = x; s.y = y; s.z = z; s.t = state.T; s.strength = strength; s.src = src;
}
/** Stimuli no older than `maxAge` seconds, newest first. */
export function recentStimuli(maxAge: number, out: Stimulus[] = []) {
  out.length = 0;
  for (let k = 1; k <= N; k++) { const s = ring[(head - k + N) % N]; if (state.T - s.t <= maxAge) out.push(s); }
  return out;
}
