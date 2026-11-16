import * as THREE from 'three';
import { state } from '../core/state';
import { V3, reduceMotion } from '../core/util';
import { DPR, camera, controls, focus, renderer, scene, sky, stage, starU } from '../render/stage';
import { cutU } from '../render/mesher';
import { autoCamUpdate, camClipBegin, camClipEnd, cineUpdate, focusGoal, freeMove, freeT, hasLineOfSight, type CamSubject } from '../camera/camera';

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

// the orbit leans in towards whoever is doing something, as long as it can see them
const orbitFocus = { who: null as CamSubject | null, losLost: 0, zoom: 0 };
const orbitAim = new THREE.Vector3(), orbitCenter = new THREE.Vector3();
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

export function stepWorld(dt: number) { CFG.step(dt); }
const _before = new THREE.Vector3();
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
  const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now); state.T += dt;
  starU.uTime.value = state.T; if (CFG.clocks) for (const c of CFG.clocks) c.value = state.T;
  stepWorld(dt);
  CFG.visuals?.(dt);

  // camera: follow the chosen subject, carrying the camera with it
  if (state.camMode === 'cine' && !state.gesture) cineUpdate(dt);
  else if (state.camMode === 'orbit' && !state.gesture) {   // a slow lap, far enough back that the whole island is always in frame
    const o = orbitFocus;
    if (o.who) {
      orbitAim.set(o.who.pos.x, o.who.rootY + 8, o.who.pos.y);
      if (!CFG.orbit.active(o.who)) o.who = null;
      else if (hasLineOfSight(camera.position, orbitAim, false)) o.losLost = 0;
      else {
        o.losLost += dt;
        if (o.losLost > 1.5) o.who = null;
      }
    }
    if (!o.who) {
      o.losLost = 0;
      o.who = pickOrbitFocus();
    }
    const zoomWant = o.who ? 1 : 0;
    o.zoom += (zoomWant - o.zoom) * (1 - Math.exp(-(zoomWant ? 3.4 : 2.0) * dt));
    const d = ORBIT.d * (1 - 0.68 * o.zoom),
      el = ORBIT.el + (0.36 - ORBIT.el) * o.zoom,
      k = 1 - Math.exp(-1.3 * dt),
      orbitRate = 0.035 * (1 - 0.42 * o.zoom);
    state.orbitA += dt * orbitRate;
    const tx = Math.cos(state.orbitA) * d * Math.cos(el), tz = Math.sin(state.orbitA) * d * Math.cos(el);
    controls.maxDistance = Math.max(1150, d * 1.08);
    camera.position.x += (tx - camera.position.x) * k; camera.position.z += (tz - camera.position.z) * k; camera.position.y += (d * Math.sin(el) - camera.position.y) * k;
    orbitCenter.set(0, 0, 0);
    if (o.who) orbitAim.set(o.who.pos.x, o.who.rootY + 7, o.who.pos.y);
    controls.target.lerp(o.who ? orbitCenter.lerp(orbitAim, o.zoom) : orbitCenter, k);
    focus.copy(controls.target); controls.autoRotate = false;
    state.fogPush += (ORBIT.d - state.fogPush) * k;
  }
  else if (!state.freezeCam) {
    const following = typeof state.camMode === 'number';
    controls.enablePan = !following;
    if (!state.gesture) {
      const before = _before.copy(focus);
      focus.lerp(focusGoal(), 1 - Math.exp(-(following ? 4 : 1.3) * dt));
      camera.position.add(V3.copy(focus).sub(before));
      controls.target.copy(focus);
      if (state.followZoom) {   // ease in to a friendly distance when a follow starts
        const off = V3.copy(camera.position).sub(focus), dist = off.length(), want = 80;
        if (Math.abs(dist - want) < 3) state.followZoom = false; else camera.position.copy(focus).add(off.multiplyScalar((dist + (want - dist) * (1 - Math.exp(-1.6 * dt))) / dist));
      }
    }
    if (!reduceMotion && !controls.autoRotate && now - state.lastInteract > 20000) controls.autoRotate = true;
  }
  if (state.camMode !== 'orbit') { state.fogPush *= Math.exp(-1.5 * dt); controls.maxDistance = Math.max(1150, Math.min(controls.maxDistance, camera.position.distanceTo(controls.target))); }
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
  renderer.render(scene, camera);
  camClipEnd();
  requestAnimationFrame(frame);
}
/** Bind the loop to the content, size the view and start rendering. */
export function startLoop(c: LoopConfig) {
  CFG = c;
  addEventListener('resize', resize); resize();
  requestAnimationFrame(frame);
}
