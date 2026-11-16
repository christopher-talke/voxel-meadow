import { rand } from '../core/util';

// ================= the director: an optional voice in what an animal does next =================
// An animal's own weighted table always decides. A director only leans on it: it sees a summary of the moment and may
// scale some weights and suggest an intent. A behaviour the animal's table gives no weight stays impossible, so a
// director can never make an animal act out of character. The default director says nothing.
//
// A director must answer synchronously from what it already knows. One that consults something slow (a server, a model)
// refreshes its own cached answer on its own timer and returns null until it has one; the local table carries on regardless.

/** One remembered episode: what an animal did, how it ended, who with and where. */
export interface Episode { key: string; t: number; dur: number; outcome: 'done' | 'interrupted'; with?: string; at?: [number, number] }
/** What a director gets to see when an animal chooses. */
export interface DirectorSummary {
  name: string;
  /** The behaviour weights the animal's own table produced, after its usual damping. */
  weights: Readonly<Record<string, number>>;
  energy: number;
  /** Seconds of simulated time, simulated wall-clock ms, and the time of day ('day', 'golden', 'night'). */
  t: number; simMs: number; tod: string;
  weather: { kind: string; rain: number; wind: number };
  recent: readonly Episode[];
  [extra: string]: any;
}
/** A director's answer: multipliers for named behaviours, and optionally one it would like to happen now. */
export interface Direction { mul?: Record<string, number>; intent?: string }
export interface Director { direct(s: DirectorSummary): Direction | null }

/** The default: no opinion, so the animal's own table decides alone. */
export const localDirector: Director = { direct: () => null };
let current: Director = localDirector;
export const setDirector = (d: Director | null) => { current = d || localDirector; };
export const getDirector = () => current;

/** Chain directors: each sees the weights the previous ones produced, multipliers compound, the last intent wins. */
export function chain(...ds: Director[]): Director {
  return {
    direct(s) {
      let w = { ...s.weights }, mul: Record<string, number> = {}, intent: string | undefined, any = false;
      for (const d of ds) {
        const r = d.direct({ ...s, weights: w });
        if (!r) continue;
        any = true;
        if (r.mul) for (const k in r.mul) { mul[k] = (mul[k] ?? 1) * r.mul[k]; if (w[k] !== undefined) w[k] *= r.mul[k]; }
        if (r.intent) intent = r.intent;
      }
      return any ? { mul, intent } : null;
    },
  };
}

/** Apply a direction to a weight table in place. Multipliers are clamped so no single voice dominates. */
export function applyDirection(w: Record<string, number>, d: Direction | null, lo = 0.2, hi = 4) {
  if (!d || !d.mul) return w;
  for (const k in d.mul) if (w[k] !== undefined) w[k] *= Math.min(hi, Math.max(lo, d.mul[k]));
  return w;
}

/** Choose a key in proportion to its weight. One draw from the shared stream. */
export function weightedPick(w: Record<string, number>, fallback: string): string {
  let sum = 0; for (const k in w) sum += w[k];
  let r = rand() * sum, key = fallback;
  for (const k in w) { r -= w[k]; if (r <= 0) { key = k; break; } }
  return key;
}
