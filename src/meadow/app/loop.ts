import * as THREE from 'three';
import { state } from '../../engine/core/state';
import { V3, headingTo, rand, rr, smooth } from '../../engine/core/util';
import { camera, controls, focus } from '../../engine/render/stage';
import { K } from '../../engine/core/scale';
import { cutU } from '../../engine/render/mesher';
import { env, updateEnv } from '../../engine/sky/sky';
import { updateFx } from '../../engine/fx/sprites';
import { updateWetMarks } from '../../engine/fx/wet';
import { ORBIT, adaptState, fitOrbit, startLoop, stepWorld } from '../../engine/app/loop';
import { SH } from '../world/layout';
import { butterflies, clouds, fireU, groundTop, lantern, lanternMat, petalMesh, petals, spawnPetal } from '../world/mesh';
import type { Dog } from '../entities/dog';
import { cats, dogs, ents } from '../entities/registry';
import { sndUpdate } from '../audio/sound';
import { clockUpdate } from '../world/clock';
import { whistleUpdate } from '../world/whistle';
import { updateFish } from '../entities/behaviours';
import { CLOTHS } from '../entities/cloth';
import { updateBall } from '../entities/ball';
import { updateFrogs } from '../entities/frogs';
import { mistU, updatePond } from '../world/pond';
import { clothCheck, ringMesh } from '../ui/interact';
import { updateTags } from '../ui/menu';
import { updateBeyond } from '../world/beyond';

export { ORBIT, adaptState, fitOrbit, stepWorld };

// ================= the meadow's frame: what it simulates, draws and listens to, in the engine's fixed order =================
/** One simulation step. The order matters: it fixes the order of random draws, and so what everyone does next. */
function step(dt: number) {
  dogs.forEach(d => d.update(dt, state.T));
  cats.forEach(d => d.update(dt, state.T));
  updateBall(dt);
  for (const c of CLOTHS) c.step(dt);
  clothCheck(dt);
  updateFx(dt); updateWetMarks(dt); updateFish(dt, state.T); updatePond(dt, state.T); updateFrogs(dt, state.T);
  updateEnv(dt, focus);
  clockUpdate();
}

const petO = new THREE.Object3D();
function visuals(dt: number) {
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
}

function late(dt: number) {
  whistleUpdate(dt);
  sndUpdate(dt);
  // the shelter roof dissolves when the camera looks down into it with the cutaway on
  const f = controls.target, inS = f.x > SH.x0 - 8 && f.x < SH.x1 + 8 && f.z > SH.z0 - 8 && f.z < SH.z1 + 8 && camera.position.y > 30 && state.seeThrough;
  cutU.uRoof.value += ((inS ? 1 : 0) - cutU.uRoof.value) * (1 - Math.exp(-4 * dt));
  const nf = 1 - smooth(-8, 2, env.el); lantern.intensity = 2.6 * nf; lanternMat.emissiveIntensity = 0.15 + 1.1 * nf;
}

function beforeRender(dt: number) {
  updateBeyond(dt);
  if (dt) updateTags(dt);
  for (const c of CLOTHS) c.sync();
}

// the island orbit leans in on whoever is up to something, never on a nap or a quiet sit
const ORBIT_REST = new Set(['nap', 'catnap', 'sit', 'sunbathe', 'wander', 'sniff', 'drink', 'bedtime', 'shelter']);
function isActionState(e: Dog) {
  const b = e.behaviour;
  if (!b || ORBIT_REST.has(b)) return false;
  if (e.poseName === 'sleep' || e.poseName === 'lie') return false;
  if ((e.poseName === 'stand' || e.poseName === 'sniff') && e.v < 7 * K) return false;
  return true;
}
const orbitScore = (e: Dog) => (e.swimming ? 1.3 : 0) + (e.free() ? 0 : 1.2) + Math.min(1.4, e.v / (20 * K));

startLoop({
  step, visuals, late, beforeRender,
  orbit: { subjects: ents, active: e => isActionState(e as Dog), score: e => orbitScore(e as Dog) },
  fit: { r: 372, bottom: -48, rTop: 340, top: 46 },   // the island's rim, its underside and the treetops
  onDpr: v => { fireU.uDpr.value = v; mistU.uDpr.value = v; },
  clocks: [fireU.uTime],
});
