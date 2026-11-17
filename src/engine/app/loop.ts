import * as THREE from 'three';
import { state } from '../core/state';
import { V3, clamp, reduceMotion, spring, springV } from '../core/util';
import { DPR, camera, controls, focus, renderer, scene, sky, stage, starU } from '../render/stage';
import { cutU } from '../render/mesher';
import { autoCamUpdate, camClipBegin, camClipEnd, cineUpdate, focusTarget, freeMove, freeT, hasLineOfSight, type CamSubject } from '../camera/camera';

// ================= the frame loop: resize, orbit fit, adaptive resolution, and the fixed order of a frame =================
// The content fills a LoopConfig with hooks; the engine calls them at fixed points, so a frame always runs in the same order:
//   step (simulation) -> visuals -> camera -> late (sound, lights) -> beforeRender -> render

/** Points that must stay on screen for the island orbit: a ring at the rim, one below and one above. */
export interface FitBounds { r: number; bottom: number; rTop: number; top: number }
export interface LoopConfig {
  /** Advance the simulation by dt seconds. MEADOW.advance and the trace call this without rendering. */
  step(dt: number): void;
  /** Per-frame visuals that run before the camera moves (drifting clouds, insects, petals). */
  visuals?(dt: number): void;
  /** After the camera has moved and been clipped: sound, light levels, cutaways. */
  late?(dt: number): void;
  /** Just before render, including while the sim is paused for a still (cloth sync, name tags). */
  beforeRender?(dt: number): void;
  /** Animals the orbit camera can lean in towards, whether one is doing something worth it, and how much. */
  orbit: { subjects: CamSubject[]; active(e: CamSubject): boolean; score(e: CamSubject): number };
  fit: FitBounds;
  /** Pixel ratio changed (for point-sprite shaders that size by it). */
  onDpr?(dpr: number): void;
  /** Shader time uniforms to advance each frame. */
  clocks?: { value: number }[];
}
let CFG: LoopConfig;

// the island orbit distance: the smallest pull-back that keeps the whole island on screen for this window shape
export const ORBIT = { d: 1100, el: 0.62 };
const fitCam = new THREE.PerspectiveCamera(38, 1, 1, 7000), fitP = new THREE.Vector3();
export function fitOrbit() {
  fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.updateProjectionMatrix();
  const el = camera.aspect < 1 ? 0.6 : 0.4, pts: number[][] = [], F = CFG.fit;
  for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283; pts.push([Math.cos(a) * F.r, 0, Math.sin(a) * F.r], [Math.cos(a) * F.r, F.bottom, Math.sin(a) * F.r], [Math.cos(a) * F.rTop, F.top, Math.sin(a) * F.rTop]); }
  const fits = d => {
    fitCam.position.set(Math.cos(el) * d, Math.sin(el) * d, 0); fitCam.lookAt(0, 0, 0); fitCam.updateMatrixWorld(true);
    return pts.every(p => { fitP.set(p[0], p[1], p[2]).project(fitCam); return fitP.z < 1 && Math.abs(fitP.x) < 0.9 && Math.abs(fitP.y) < 0.86; });
  };
  let lo = 300, hi = 4200; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  ORBIT.d = hi; ORBIT.el = el;
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 50 : 38; camera.updateProjectionMatrix(); fitOrbit();
}

// adaptive resolution: when frames stay slow, render fewer pixels (never below 1x); when there's headroom again, step back up
const ADAPT = { ema: 16, slow: 0, fast: 0, dpr: DPR };
function setDpr(v) {
  ADAPT.dpr = v; renderer.setPixelRatio(v); starU.uDpr.value = v; CFG.onDpr?.(v); resize();
}
function adaptRes(ms) {
  if (document.hidden || ms > 250) return;   // a stall (tab switch, GC) is not a trend
  ADAPT.ema += (ms - ADAPT.ema) * 0.05;
  ADAPT.slow = ADAPT.ema > 24 ? ADAPT.slow + ms : 0;
  ADAPT.fast = ADAPT.ema < 13 ? ADAPT.fast + ms : 0;
  if (ADAPT.slow > 2000 && ADAPT.dpr > 1) { setDpr(Math.max(1, ADAPT.dpr - 0.25)); ADAPT.slow = 0; ADAPT.ema = 18; }
  else if (ADAPT.fast > 6000 && ADAPT.dpr < DPR) { setDpr(Math.min(DPR, ADAPT.dpr + 0.25)); ADAPT.fast = 0; }
}
export const adaptState = ADAPT;

// the orbit leans in on whoever is doing something, as long as it can see them: a wide lap, then an unhurried
// lean-in, a linger, an ease back out and another wide lap. It never hops from one animal straight to another.
/** Orbit pacing in seconds. Lags are spring lags: a move settles in about three of them. */
export const ORBIT_TUNE = {
  /** Wide lap before the next lean-in may start. */ rest: 20,
  /** Shortest time close in, even if the subject settles. */ hold: 15,
  /** Longest time close in, however busy the subject stays. */ maxHold: 60,
  /** How long the subject may rest (between lily-pad hops, say) before the camera lets go. */ grace: 4,
  /** How long the subject may be out of sight before the camera lets go. */ losGrace: 3,
  zoomLag: 2.6, zoomOutLag: 3, aimLag: 0.6, camLag: 0.6,
  /** Lean-in distance as a share of the fit distance taken off, and the lean-in elevation. */ lean: 0.68, leanEl: 0.36,
  /** Lap speed in radians per second, slowed while leaning in. */ rate: 0.035,
};
type OrbitPhase = 'wide' | 'in' | 'hold' | 'out';
/** The orbit's state, read by tests: its phase, subject, seconds in phase, and the eased lean-in (0 wide, 1 close). */
export const orbitDirector = { phase: 'wide' as OrbitPhase, who: null as CamSubject | null, t: 0, rested: 0, losLost: 0, zoom: { x: 0, v: 0 } };
const orbitAim = new THREE.Vector3(), aim = new THREE.Vector3(), aimV = new THREE.Vector3(), aimGoal = new THREE.Vector3(),
  camGoal = new THREE.Vector3(), camV = new THREE.Vector3(), tgtV = new THREE.Vector3();
let wasOrbit = false, orbitShown = false;
function pickOrbitFocus() {
  let best: CamSubject | null = null, bv = 0;
  for (const e of CFG.orbit.subjects) {
    if (!CFG.orbit.active(e)) continue;
    orbitAim.set(e.pos.x, e.rootY + 8, e.pos.y);
    if (!hasLineOfSight(camera.position, orbitAim, false)) continue;
    const v = CFG.orbit.score(e);
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}
function orbitStep(dt: number) {
  const o = orbitDirector, T = ORBIT_TUNE;
  if (!wasOrbit) {   // a fresh start: a wide lap first, and no speed carried over from last time
    camV.set(0, 0, 0); tgtV.set(0, 0, 0); o.phase = 'wide'; o.who = null; o.t = o.rested = 0; o.zoom.x = o.zoom.v = 0;
  }
  o.t += dt;
  if (o.phase === 'wide') {
    o.rested += dt;
    const who = !reduceMotion && o.rested > T.rest ? pickOrbitFocus() : null;
    if (who) { o.phase = 'in'; o.who = who; o.t = 0; o.losLost = 0; o.rested = 0; aim.set(who.pos.x, who.rootY + 7, who.pos.y); aimV.set(0, 0, 0); }
  } else if (o.phase === 'in' || o.phase === 'hold') {
    const w = o.who!;
    springV(aim, aimV, aimGoal.set(w.pos.x, w.rootY + 7, w.pos.y), T.aimLag, dt);
    orbitAim.set(w.pos.x, w.rootY + 8, w.pos.y);
    o.losLost = hasLineOfSight(camera.position, orbitAim, false) ? 0 : o.losLost + dt;
    o.rested = CFG.orbit.active(w) ? 0 : o.rested + dt;
    if (o.phase === 'in' && o.zoom.x > 0.95) { o.phase = 'hold'; o.t = 0; }
    if (o.losLost > T.losGrace || (o.phase === 'hold' && (o.t > T.maxHold || (o.t > T.hold && o.rested > T.grace)))) { o.phase = 'out'; o.t = 0; }
  } else if (o.zoom.x < 0.02) { o.phase = 'wide'; o.who = null; o.t = 0; o.rested = 0; }   // 'out' eases back with the aim held where it was
  const leaning = o.phase === 'in' || o.phase === 'hold', z = clamp(spring(o.zoom, leaning ? 1 : 0, leaning ? T.zoomLag : T.zoomOutLag, dt), 0, 1);
  // the lap turns about a pivot that slides from the island's centre to the subject, so a lean-in never sweeps past them
  const d = ORBIT.d * (1 - T.lean * z), el = ORBIT.el + (T.leanEl - ORBIT.el) * z;
  state.orbitA += dt * T.rate * (1 - 0.42 * z) * (reduceMotion ? 0.5 : 1);
  const px = aim.x * z, py = aim.y * z, pz = aim.z * z;
  camGoal.set(px + Math.cos(state.orbitA) * d * Math.cos(el), py + d * Math.sin(el), pz + Math.sin(state.orbitA) * d * Math.cos(el));
  aimGoal.set(px, py, pz);
  if (!orbitShown) { orbitShown = true; camera.position.copy(camGoal); controls.target.copy(aimGoal); }   // the first orbit of a visit (the wallpaper opening) starts on the lap, no fly-out
  springV(camera.position, camV, camGoal, T.camLag, dt);
  springV(controls.target, tgtV, aimGoal, T.camLag, dt);
  controls.maxDistance = Math.max(1150, ORBIT.d * 1.08);
  focus.copy(controls.target); controls.autoRotate = false;
  state.fogPush += (ORBIT.d - state.fogPush) * (1 - Math.exp(-1.3 * dt));
}

export function stepWorld(dt: number) { CFG.step(dt); }
const _before = new THREE.Vector3(), followDist = { on: false, x: 0, v: 0 };
let last = performance.now();
function frame(now) {
  adaptRes(now - last);
  // test hook: an init script can hold the sim at its start state so traces and stills run from a known point
  if ((window as any).__SIM_PAUSE) {
    last = now; controls.update(); sky.position.copy(camera.position);   // no camera collision: a still shows exactly the view it asked for
    cutU.uFocus.value.copy(controls.target); cutU.uCam.value.copy(camera.position);
    CFG.beforeRender?.(0);
    renderer.render(scene, camera); requestAnimationFrame(frame); return;
  }
  const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
  tick(dt, now);
  renderer.render(scene, camera);
  camClipEnd();
  requestAnimationFrame(frame);
}
/** Everything in a frame but the render: sim, camera (left clipped for the render), late hooks. */
function tick(dt: number, now: number) {
  state.T += dt;
  starU.uTime.value = state.T; if (CFG.clocks) for (const c of CFG.clocks) c.value = state.T;
  stepWorld(dt);
  CFG.visuals?.(dt);

  // camera: follow the chosen subject, carrying the camera with it
  const orbiting = state.camMode === 'orbit' && !state.gesture;
  if (state.camMode === 'cine' && !state.gesture) cineUpdate(dt);
  else if (state.camMode === 'orbit' && !state.gesture) {   // a slow lap, far enough back that the whole island is always in frame
    orbitStep(dt);
  }
  else if (!state.freezeCam) {
    const following = typeof state.camMode === 'number';
    controls.enablePan = !following;
    if (!state.gesture) {
      const before = _before.copy(focus);
      focus.lerp(focusTarget(dt), 1 - Math.exp(-(following ? 4 : 1.3) * dt));
      camera.position.add(V3.copy(focus).sub(before));
      controls.target.copy(focus);
      if (state.followZoom) {   // ease in to a friendly distance when a follow starts
        const off = V3.copy(camera.position).sub(focus), dist = off.length(), want = 80;
        if (!followDist.on) { followDist.on = true; followDist.x = dist; followDist.v = 0; }
        spring(followDist, want, 0.8, dt);
        if (Math.abs(followDist.x - want) < 1 && Math.abs(followDist.v) < 2) state.followZoom = false;
        if (dist > 1e-3) camera.position.copy(focus).add(off.multiplyScalar(followDist.x / dist));
      }
    }
    if (!state.followZoom) followDist.on = false;
    if (!reduceMotion && !controls.autoRotate && now - state.lastInteract > 20000) controls.autoRotate = true;
  }
  if (state.camMode !== 'orbit') { state.fogPush *= Math.exp(-1.5 * dt); controls.maxDistance = Math.max(1150, Math.min(controls.maxDistance, camera.position.distanceTo(controls.target))); }
  wasOrbit = orbiting;
  // idle auto-rotate drifts up to speed over a few seconds rather than starting at full speed
  controls.autoRotateSpeed = controls.autoRotate ? Math.min(0.25, controls.autoRotateSpeed + dt * 0.25 / 4) : 0;
  freeMove(dt); autoCamUpdate(dt);
  controls.update();
  camClipBegin(dt);
  cutU.uFocus.value.copy(controls.target); cutU.uCam.value.copy(camera.position);
  cutU.uCutOn.value = state.seeThrough ? 1 : 0;
  CFG.late?.(dt);
  if (state.camMode === 'free') { freeT.copy(controls.target); focus.copy(controls.target); }
  else if (!state.gesture && controls.target.distanceTo(focus) > 0.01) { focus.copy(controls.target); }
  sky.position.copy(camera.position);
  CFG.beforeRender?.(dt);
}
/** Test hook: run whole frames without rendering, calling sample() with the view each one would have shown. */
export function runFrames(n: number, dt: number, sample?: () => void) {
  for (let i = 0; i < n; i++) { tick(dt, performance.now()); sample?.(); camClipEnd(); }
}
/** Bind the loop to the content, size the view and start rendering. */
export function startLoop(c: LoopConfig) {
  CFG = c;
  addEventListener('resize', resize); resize();
  requestAnimationFrame(frame);
}
