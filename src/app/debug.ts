import { state } from '../core/state';
import { camera, controls, focus } from '../render/stage';
import { B, BEDS, G, colAt, cols, idxOf } from '../world/layout';
import { TREES } from '../world/decor';
import { WX, env, moonDisc, setTod } from '../sim/sky';
import { cats, dogs } from '../entities/registry';
import { SFX, SND } from '../audio/sound';
import { timeText } from '../world/clock';
import { WHISTLE } from '../world/whistle';
import { findPath } from '../nav/path';
import { FISH, POSES, S, fishStand, hideSpot, pickFish } from '../entities/behaviours';
import { CLOTHS } from '../entities/cloth';
import { SB } from '../entities/ball';
import { SHOTS, autoCamUpdate, cine, cineStart, cineUpdate, focusGoal, freeT, setCamMode } from '../camera/camera';
import { ballGame, callThem, down, drag, goTo, napTime, pickThing, playtime, pointerRay } from '../ui/interact';
import { ORBIT, adaptState, fitOrbit, stepWorld } from './loop';
import { renderer } from '../render/stage';
import { ents } from '../entities/registry';
import { PADS, PAD_CHAIN, fallMesh, mistPts } from '../world/pond';
import { FROGS } from '../entities/frogs';
import { SPILL } from '../world/layout';
import { isSmoothToonRenderer, setSmoothToonRenderer, toggleSmoothToonRenderer } from '../render/renderFlags';

window.MEADOW = { renderer, adapt: adaptState, fallMesh, mistPts, PADS, PAD_CHAIN, FROGS, SPILL, lilyHop(i = 3, fall = false) { const c = ents[i]; c.forceSlip = !!fall; c.interrupt(c.B('lilyhop'), 'lilyhop'); }, ORBIT, WHISTLE, fitOrbit, SND, SFX, moonDisc, WX, setTod, timeText, get simMs() { return state.simMs; }, set simMs(v) { state.simMs = v; }, get timeMode() { return state.timeMode; }, set timeMode(v) { state.timeMode = v; }, env, cineStart, SHOTS, cineStep: dt => cineUpdate(dt), cine, get camMode() { return state.camMode; }, setCamMode, FISH, cats, fishStand, pickFish, hideSpot, TREES, goTo, findPath, G, idxOf, cols, get smoothToon() { return isSmoothToonRenderer(); }, set smoothToon(v) { setSmoothToonRenderer(!!v); }, toggleSmoothToon: toggleSmoothToonRenderer, cell: (x, z) => { const i = Math.round(x / B), j = Math.round(z / B), c = colAt(i, j); return c ? [c.type, c.top, G.walk[idxOf(i, j)], !!c.forest] : null; }, dbg: () => ({ cam: state.camMode, drag: drag && { moved: drag.moved, done: drag.done, k: drag.k }, down: !!down, ctl: controls.enabled, anim: CLOTHS.map(c => !!c.anim) }), pick: (x, y) => { pointerRay({ clientX: x, clientY: y }); const t = pickThing(); return t ? t.kind : null; }, dogs, SB, ballGame, CLOTHS, BEDS, POSES, S, camera, controls, callThem, playtime, napTime, focus,
  setCam(m) { state.camMode = m; }, get cam() { return state.camMode; }, autoStep: autoCamUpdate, get cp() { return camera.position.toArray(); }, freeT,
  advance(sec) { for (let i = 0; i < sec * 60; i++) { state.T += 1 / 60; stepWorld(1 / 60); } focus.copy(focusGoal()); controls.target.copy(focus); } };

// ---- regression hooks: a hash of everything world generation produces, a behaviour trace, and render cost ----
import { decor, boxes } from '../world/decor';
import { CLIMB } from "../world/layout";
import { LOOK } from "../world/decor";
import { FISH as FISH_ } from '../entities/behaviours';
function fnv(): { add(v: number | string): void; hex(): string } {
  let h = 0x811c9dc5;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  return { add(v) { mix(typeof v === 'number' ? (Math.round(v * 1000) / 1000).toString() : v); mix('|'); }, hex: () => (h >>> 0).toString(16).padStart(8, '0') };
}
Object.assign(window.MEADOW, {
  LOOK,
  /** Place the camera for a still: freezes the follow logic so the view stays put. */
  view(cx: number, cy: number, cz: number, tx: number, ty: number, tz: number) { window.MEADOW.freezeCam = true; state.camMode = "free"; controls.autoRotate = false; camera.position.set(cx, cy, cz); controls.target.set(tx, ty, tz); focus.copy(controls.target); freeT.copy(focus); controls.update(); },
  /** Per-system hashes of generated world state. A pure refactor must leave every one unchanged. */
  fingerprint() {
    const out: Record<string, string> = {};
    const part = (name: string, fill: (f: ReturnType<typeof fnv>) => void) => { const f = fnv(); fill(f); out[name] = f.hex(); };
    part('cols', f => { for (const c of cols) if (c) { f.add(c.i); f.add(c.j); f.add(c.type); f.add(c.top); f.add(c.base); f.add(c.bot); f.add(c.wl ?? 'n'); f.add(+c.bridge + 2 * +c.jetty + 4 * +c.forest + 8 * +c.edge); } });
    part('grid', f => { for (let k = 0; k < G.walk.length; k++) { f.add(G.walk[k]); f.add(G.lvl[k]); f.add(G.gy[k]); f.add(G.cost[k]); } });
    part('decor', f => { for (const [k, v] of decor) { f.add(k); f.add(v); } });
    part('boxes', f => { for (const b of boxes) for (const v of b) f.add(v); });
    part('trees', f => { for (const t of TREES) for (const v of t) f.add(v); for (const c of CLIMB) { f.add(c.i); f.add(c.j); f.add(c.h); } });
    part('pond', f => { for (const p of PADS) { f.add(p.x); f.add(p.z); f.add(p.r); } for (const fr of FROGS) { f.add(fr.x); f.add(fr.z); } for (const fi of FISH_) { f.add(fi.hx); f.add(fi.hz); } });
    part('animals', f => { for (const e of ents) { f.add(e.name); f.add(e.pos.x); f.add(e.pos.y); f.add(e.h); f.add(e.energy); f.add(e.behaviour || ''); } });
    return out;
  },
  /** Step the sim `sec` seconds at 60 Hz and log each animal's behaviour changes with time and grid cell. */
  trace(sec: number) {
    const log: any[] = [], last = ents.map(() => '');
    for (let i = 0; i < sec * 60; i++) {
      state.T += 1 / 60; stepWorld(1 / 60);
      ents.forEach((e, k) => { const b = (e.behaviour || '-') + '/' + (e.step && e.step.text || ''); if (b !== last[k]) { last[k] = b; log.push([Math.round(state.T * 60), e.name, b, Math.round(e.pos.x / B), Math.round(e.pos.y / B)]); } });
    }
    return log;
  },
  /** Render cost of the last frame and the adaptive-resolution frame time. */
  perf() { const r = renderer.info.render; return { calls: r.calls, tris: r.triangles, points: r.points, lines: r.lines, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, frameMs: Math.round(adaptState.ema * 10) / 10, dpr: adaptState.dpr }; },
});
