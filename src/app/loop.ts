import * as THREE from 'three';
import { state } from '../core/state';
import { V3, headingTo, rand, reduceMotion, rr, smooth } from '../core/util';
import { DPR, camera, controls, focus, renderer, scene, sky, stage, starU } from '../render/stage';
import { K, SH } from '../world/layout';
import { butterflies, clouds, cutU, fireU, groundTop, lantern, lanternMat, petalMesh, petals, spawnPetal } from '../world/mesh';
import { env, updateEnv } from '../sim/sky';
import type { Dog } from '../entities/dog';
import { cats, dogs, ents } from '../entities/registry';
import { sndUpdate } from '../audio/sound';
import { clockUpdate } from '../world/clock';
import { whistleUpdate } from '../world/whistle';
import { updateFx } from '../fx/sprites';
import { updateFish } from '../entities/behaviours';
import { CLOTHS } from '../entities/cloth';
import { updateBall } from '../entities/ball';
import { updateFrogs } from '../entities/frogs';
import { mistU, updatePond } from '../world/pond';
import { autoCamUpdate, camClipBegin, camClipEnd, cineUpdate, focusGoal, freeMove, freeT, hasLineOfSight } from '../camera/camera';
import { clothCheck, ringMesh } from '../ui/interact';
import { updateTags } from '../ui/menu';

// the island orbit distance: the smallest pull-back that keeps the whole island on screen for this window shape
export const ORBIT = { d: 1100, el: 0.62 };
const fitCam = new THREE.PerspectiveCamera(38, 1, 1, 7000), fitP = new THREE.Vector3();
export function fitOrbit() {
  fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.updateProjectionMatrix();
  const el = camera.aspect < 1 ? 0.6 : 0.4, pts: number[][] = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283; pts.push([Math.cos(a) * 372, 0, Math.sin(a) * 372], [Math.cos(a) * 372, -48, Math.sin(a) * 372], [Math.cos(a) * 340, 46, Math.sin(a) * 340]); }
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
addEventListener('resize', resize); resize();

// adaptive resolution: when frames stay slow, render fewer pixels (never below 1x); when there's headroom again, step back up
const ADAPT = { ema: 16, slow: 0, fast: 0, dpr: DPR };
function setDpr(v) {
  ADAPT.dpr = v; renderer.setPixelRatio(v); starU.uDpr.value = v; fireU.uDpr.value = v; mistU.uDpr.value = v; resize();
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

const ORBIT_REST = new Set(['nap', 'catnap', 'sit', 'sunbathe', 'wander', 'sniff', 'drink', 'bedtime', 'shelter']);
const orbitFocus = { who: null as Dog | null, losLost: 0, zoom: 0 };
const orbitAim = new THREE.Vector3();
const orbitCenter = new THREE.Vector3();
function isActionState(e: Dog) {
  const b = e.behaviour;
  if (!b || ORBIT_REST.has(b)) return false;
  if (e.poseName === 'sleep' || e.poseName === 'lie') return false;
  if ((e.poseName === 'stand' || e.poseName === 'sniff') && e.v < 7 * K) return false;
  return true;
}
function orbitScore(e: Dog) {
  return (e.swimming ? 1.3 : 0) + (e.free() ? 0 : 1.2) + Math.min(1.4, e.v / (20 * K));
}
function pickOrbitFocus() {
  let best: Dog | null = null, bv = 0;
  for (const e of ents) {
    if (!isActionState(e)) continue;
    orbitAim.set(e.pos.x, e.rootY + 8, e.pos.y);
    if (!hasLineOfSight(camera.position, orbitAim, false)) continue;
    const v = orbitScore(e);
    if (v > bv) {
      bv = v;
      best = e;
    }
  }
  return best;
}

// ================= loop =================
const petO = new THREE.Object3D(), _before = new THREE.Vector3();
let last = performance.now();
export function stepWorld(dt) {
  dogs.forEach(d => d.update(dt, state.T));
  cats.forEach(d => d.update(dt, state.T));
  updateBall(dt);
  for (const c of CLOTHS) c.step(dt);
  clothCheck(dt);
  updateFx(dt); updateFish(dt, state.T); updatePond(dt, state.T); updateFrogs(dt, state.T);
  updateEnv(dt, focus);
  clockUpdate();
}
function frame(now) {
  adaptRes(now - last);
  const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now); state.T += dt;
  starU.uTime.value = state.T; fireU.uTime.value = state.T;
  stepWorld(dt);
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 1250) c.position.x = -1250; }
  for (const b of butterflies) {
    b.t -= dt;
    if (b.t <= 0 || b.g.position.distanceTo(b.tgt) < 4) { const a = rr(0, 6.283), d = Math.sqrt(rand()) * 80, x = b.home.x + Math.cos(a) * d, z = b.home.z + Math.sin(a) * d; b.tgt.set(x, Math.max(0, groundTop(x, z)) + rr(4, 16), z); b.t = rr(3, 7); }
    V3.copy(b.tgt).sub(b.g.position).normalize().multiplyScalar(9);
    b.vel.lerp(V3, 1 - Math.exp(-1.2 * dt));
    b.g.position.addScaledVector(b.vel, dt); b.g.position.y += Math.sin(state.T * 6 + b.ph) * 1.4 * dt;
    b.g.rotation.y = headingTo(b.vel.x, b.vel.z);
    b.ph += dt * 17; const flap = 0.15 + Math.abs(Math.sin(b.ph));
    b.wl.rotation.x = -flap; b.wr.rotation.x = flap;
    b.g.scale.setScalar(Math.max(0.001, env.bugs)); b.g.visible = env.bugs > 0.02;
    if (env.bugs > 0.5 && b.g.position.distanceTo(V3.set(dogs[0].pos.x, dogs[0].rootY + 12, dogs[0].pos.y)) < 7) dogs[0].startle();
  }
  petals.forEach((p, i) => {
    p.y -= p.vy * dt; p.x += Math.sin(state.T * p.sw + p.ph) * 4 * dt + 2.5 * dt; p.z += Math.cos(state.T * p.sw * 0.8 + p.ph) * 3 * dt;
    p.rx += p.spin * dt; p.rz += p.spin * 0.7 * dt;
    if (p.y < groundTop(p.x, p.z) + 0.6) spawnPetal(p, false);
    petO.position.set(p.x, p.y, p.z); petO.rotation.set(p.rx, 0, p.rz); petO.updateMatrix(); petalMesh.setMatrixAt(i, petO.matrix);
  });
  petalMesh.instanceMatrix.needsUpdate = true;
  if (state.ringT > 0) { state.ringT = Math.max(0, state.ringT - dt / 1.2); ringMesh.material.opacity = 0.8 * state.ringT; ringMesh.scale.setScalar(1 + (1 - state.ringT) * 1.6); }

  // camera: follow the chosen subject, carrying the camera with it
  if (state.camMode === 'cine' && !state.gesture) cineUpdate(dt);
  else if (state.camMode === 'orbit' && !state.gesture) {   // a slow lap, far enough back that the whole island is always in frame
    const o = orbitFocus;
    if (o.who) {
      orbitAim.set(o.who.pos.x, o.who.rootY + 8, o.who.pos.y);
      if (!isActionState(o.who)) o.who = null;
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
  else if (!(window.MEADOW && window.MEADOW.freezeCam)) {
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
  whistleUpdate(dt);
  if (state.camMode !== 'orbit') { state.fogPush *= Math.exp(-1.5 * dt); controls.maxDistance = Math.max(1150, Math.min(controls.maxDistance, camera.position.distanceTo(controls.target))); }
  freeMove(dt); autoCamUpdate(dt);
  controls.update();
  camClipBegin(dt);
  sndUpdate(dt);
  cutU.uFocus.value.copy(controls.target); cutU.uCam.value.copy(camera.position);
  { const f = controls.target, inS = f.x > SH.x0 - 8 && f.x < SH.x1 + 8 && f.z > SH.z0 - 8 && f.z < SH.z1 + 8 && camera.position.y > 30 && state.seeThrough;
    cutU.uCutOn.value = state.seeThrough ? 1 : 0;
    cutU.uRoof.value += ((inS ? 1 : 0) - cutU.uRoof.value) * (1 - Math.exp(-4 * dt)); }
  { const nf = 1 - smooth(-8, 2, env.el); lantern.intensity = 2.6 * nf; lanternMat.emissiveIntensity = 0.15 + 1.1 * nf; }
  if (state.camMode === 'free') { freeT.copy(controls.target); focus.copy(controls.target); }
  else if (!state.gesture && controls.target.distanceTo(focus) > 0.01) { focus.copy(controls.target); }
  sky.position.copy(camera.position);
  updateTags(dt);
  for (const c of CLOTHS) c.sync();
  renderer.render(scene, camera);
  camClipEnd();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
