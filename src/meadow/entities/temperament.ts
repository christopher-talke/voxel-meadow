import { clamp, seeded } from '../../engine/core/util';
import type { Director } from '../../engine/director/director';

// ================= temperament: each animal's mood for the day =================
// Every simulated day each animal wakes with a temperament: a kind of day, plus small daily leanings, that shade how much
// it rests, plays, seeks company and roams. It is seeded from the animal's name and the date, so a day stays the same
// day across reloads, and it drifts gently through the hours instead of rerolling with every choice.
//
// Character never changes. A temperament only scales weights the animal already has: Mali still never chases the
// ball, Bobby still grumbles and tidies (those weights are left alone), Murphy is still Murphy on a sleepy day.

export type DayKind = 'ordinary' | 'sleepy' | 'bright' | 'clingy' | 'quiet';
/** Which behaviours each group covers. Anything not listed (drink, tidy, grump, steal, tummy, rub) is never touched. */
export const GROUPS = {
  rest: ['nap', 'sit', 'sunbathe'],
  active: ['zoomies', 'ball', 'adventure', 'climb', 'perch', 'fish', 'lilyhop', 'ambush'],
  social: ['visit', 'hello'],
  roam: ['wander', 'sniff'],
} as const;
type Group = keyof typeof GROUPS;
/** What each kind of day does to each group. */
export const KIND_MUL: Record<DayKind, Record<Group, number>> = {
  ordinary: { rest: 1, active: 1, social: 1, roam: 1 },
  sleepy: { rest: 1.9, active: 0.45, social: 0.8, roam: 0.7 },
  bright: { rest: 0.6, active: 1.8, social: 1.2, roam: 1.15 },
  clingy: { rest: 1, active: 0.9, social: 1.9, roam: 0.8 },
  quiet: { rest: 1.4, active: 0.6, social: 0.6, roam: 1 },
};
/** How likely each kind of day is, per animal. Murphy has his tired-boy days; Mali her quiet ones; Bobby takes it easy. */
export const KIND_ODDS: Record<string, Partial<Record<DayKind, number>>> = {
  Murphy: { ordinary: 0.45, sleepy: 0.2, bright: 0.25, clingy: 0.1 },
  Mali: { ordinary: 0.5, quiet: 0.25, sleepy: 0.1, bright: 0.1, clingy: 0.05 },
  Bobby: { ordinary: 0.55, sleepy: 0.25, quiet: 0.15, bright: 0.05 },
  Billy: { ordinary: 0.5, sleepy: 0.3, bright: 0.15, quiet: 0.05 },
  Ashy: { ordinary: 0.5, sleepy: 0.3, bright: 0.15, quiet: 0.05 },
};
export const TEMPER = { jitter: 0.15, drift: 0.12, lo: 0.35, hi: 2.5 };

export interface Temperament { day: string; kind: DayKind; base: Record<Group, number>; ph: Record<Group, number> }
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dayOf = (ms: number) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const cache = new Map<string, Temperament>();
/** The temperament an animal woke with on the simulated day containing `simMs`. */
export function temperament(name: string, simMs: number): Temperament {
  const day = dayOf(simMs), key = name + '|' + day;
  let t = cache.get(key);
  if (t) return t;
  const R = seeded(strHash(key)), odds = KIND_ODDS[name] || { ordinary: 1 };
  let r = R.rand(), kind: DayKind = 'ordinary';
  for (const k in odds) { r -= odds[k]; if (r <= 0) { kind = k as DayKind; break; } }
  const base = {} as Record<Group, number>, ph = {} as Record<Group, number>;
  for (const g of Object.keys(GROUPS) as Group[]) {
    const n = (R.rand() + R.rand() - 1) * 1.7;   // roughly normal, sd about 0.7
    base[g] = KIND_MUL[kind][g] * Math.exp(TEMPER.jitter * n);
    ph[g] = R.rr(0, 6.283);
  }
  t = { day, kind, base, ph };
  cache.set(key, t);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return t;
}
/** Group multipliers at a moment: the day's leanings, a slow drift, an afternoon slump and a morning spark. */
export function temperMul(name: string, simMs: number): Record<string, number> {
  const t = temperament(name, simMs), d = new Date(simMs), h = d.getHours() + d.getMinutes() / 60, out: Record<string, number> = {};
  for (const g of Object.keys(GROUPS) as Group[]) {
    let m = t.base[g] * (1 + TEMPER.drift * Math.sin(6.283 * h / 9 + t.ph[g]));
    if (g === 'rest') m *= 1 + 0.25 * Math.exp(-(((h - 14.5) / 1.8) ** 2));
    if (g === 'active') m *= 1 + 0.15 * Math.exp(-(((h - 8) / 1.5) ** 2));
    m = clamp(m, TEMPER.lo, TEMPER.hi);
    for (const k of GROUPS[g]) out[k] = m;
  }
  return out;
}
export const temperamentDirector: Director = { direct: s => ({ mul: temperMul(s.name, s.simMs) }) };
