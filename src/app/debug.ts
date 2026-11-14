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
import { ORBIT, fitOrbit, stepWorld } from './loop';

window.MEADOW = { ORBIT, WHISTLE, fitOrbit, SND, SFX, moonDisc, WX, setTod, timeText, get simMs() { return state.simMs; }, set simMs(v) { state.simMs = v; }, get timeMode() { return state.timeMode; }, set timeMode(v) { state.timeMode = v; }, env, cineStart, SHOTS, cineStep: dt => cineUpdate(dt), cine, get camMode() { return state.camMode; }, setCamMode, FISH, cats, fishStand, pickFish, hideSpot, TREES, goTo, findPath, G, idxOf, cols, cell: (x, z) => { const i = Math.round(x / B), j = Math.round(z / B), c = colAt(i, j); return c ? [c.type, c.top, G.walk[idxOf(i, j)], !!c.forest] : null; }, dbg: () => ({ cam: state.camMode, drag: drag && { moved: drag.moved, done: drag.done, k: drag.k }, down: !!down, ctl: controls.enabled, anim: CLOTHS.map(c => !!c.anim) }), pick: (x, y) => { pointerRay({ clientX: x, clientY: y }); const t = pickThing(); return t ? t.kind : null; }, dogs, SB, ballGame, CLOTHS, BEDS, POSES, S, camera, controls, callThem, playtime, napTime, focus,
  setCam(m) { state.camMode = m; }, get cam() { return state.camMode; }, autoStep: autoCamUpdate, get cp() { return camera.position.toArray(); }, freeT,
  advance(sec) { for (let i = 0; i < sec * 60; i++) { state.T += 1 / 60; stepWorld(1 / 60); } focus.copy(focusGoal()); controls.target.copy(focus); } };
