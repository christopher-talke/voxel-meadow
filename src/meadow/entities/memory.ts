import { state } from '../../engine/core/state';
import { store } from '../../engine/core/util';
import type { Director, Episode } from '../../engine/director/director';
import { ents } from './registry';

// ================= memory: what each animal did lately, and how it went =================
// Every behaviour becomes an episode: its name, when it ended, how long it ran, whether it ran to the end or was cut off,
// who was close by when it began and where. The memory director reads them back as gentle nudges:
//   - something done just now is less likely again for a while (the loop feeling comes from repeats)
//   - something done a lot lately is a little less likely
//   - something that ran its course and lasted is slightly more likely; something cut short, slightly less
//   - after good time spent near another animal, being sociable is a touch more likely
// Nudges are capped, so memory shades an animal's habits without overriding its character.

export const MEM = { size: 24, recency: 0.45, recencyS: 240, crowded: 0.25, crowdedMul: 0.75, good: 1.12, cut: 0.8, social: 1.1, lo: 0.4, hi: 1.5 };
const SOCIAL = ['visit', 'hello'];

/** Open an episode when a behaviour starts. */
export function openEpisode(d: any, key: string) {
  const near = ents.filter(e => e !== d && Math.hypot(e.pos.x - d.pos.x, e.pos.y - d.pos.y) < 40).sort((a, b) => Math.hypot(a.pos.x - d.pos.x, a.pos.y - d.pos.y) - Math.hypot(b.pos.x - d.pos.x, b.pos.y - d.pos.y))[0];
  d.ep = { key, t0: state.T, with: near ? near.name : undefined, at: [Math.round(d.pos.x), Math.round(d.pos.y)] };
}
/** Close the open episode, if any, as finished or cut short. */
export function closeEpisode(d: any, outcome: 'done' | 'interrupted') {
  const ep = d.ep; if (!ep) return;
  d.ep = null;
  const e: Episode = { key: ep.key, t: state.T, dur: state.T - ep.t0, outcome, with: ep.with, at: ep.at };
  d.episodes.push(e); if (d.episodes.length > MEM.size) d.episodes.shift();
}

/** Multipliers from an animal's recent episodes. */
export function memoryMul(recent: readonly Episode[], t: number): Record<string, number> {
  const mul: Record<string, number> = {}, count: Record<string, number> = {}, last: Record<string, Episode> = {};
  const m = (k: string, f: number) => { mul[k] = (mul[k] ?? 1) * f; };
  for (const e of recent) {
    m(e.key, 1 - MEM.recency * Math.exp(-Math.max(0, t - e.t) / MEM.recencyS));
    count[e.key] = (count[e.key] || 0) + 1; last[e.key] = e;
  }
  for (const k in count) if (count[k] / Math.max(1, recent.length) > MEM.crowded) m(k, MEM.crowdedMul);
  for (const k in last) { const e = last[k]; if (e.outcome === 'done' && e.dur >= 20) m(k, MEM.good); else if (e.outcome === 'interrupted' && e.dur < 8) m(k, MEM.cut); }
  if (recent.some(e => e.with && e.outcome === 'done' && t - e.t < 600)) for (const k of SOCIAL) m(k, MEM.social);
  for (const k in mul) mul[k] = Math.min(MEM.hi, Math.max(MEM.lo, mul[k]));
  return mul;
}
export const memoryDirector: Director = { direct: s => ({ mul: memoryMul(s.recent, s.t) }) };

// episodes outlive a reload: kept by animal, with their age so recency carries on where it left off
export function saveMemory() {
  const o: Record<string, any[]> = {};
  for (const d of ents as any[]) o[d.name] = d.episodes.map(e => ({ ...e, t: e.t - state.T }));
  store.set('meadow-memory', o);
}
export function loadMemory() {
  const o = store.get('meadow-memory');
  if (!o || typeof o !== 'object') return;
  for (const d of ents as any[]) if (Array.isArray(o[d.name])) d.episodes = o[d.name].slice(-MEM.size).map(e => ({ ...e, t: state.T + e.t }));
}
