import * as THREE from 'three';
import { clamp, headingTo, reduceMotion, seeded } from '../core/util';
import { scene } from '../render/stage';
import { emit } from './stimuli';

// ================= ambient agents: small creatures that make a world feel busy =================
// Birds, insects, a rabbit: cheap, instanced, mostly ignoring the animals (and ignored by them), with a tiny shared
// state machine per movement style. One draw call per kind. Each kind has its own random stream, so ambient life never
// changes what the animals do unless the content chooses to let animals notice the stimuli they post.

export type Style = 'flier' | 'hover' | 'flutter' | 'runner';
/** One box of an agent's body, in its local frame (x forward, y up). `flap` makes it a wing (+1 left, -1 right). */
export interface Part { size: [number, number, number]; at: [number, number, number]; col: number; flap?: 1 | -1; tail?: boolean }
export interface AgentKind {
  name: string; style: Style; count: number; parts: Part[];
  /** Where it likes to be: a point it should head for next. `perch` asks for a landing spot rather than an air spot. */
  spot(r: () => number, perch: boolean, from: THREE.Vector3): THREE.Vector3;
  /** Ground height. */
  ground(x: number, z: number): number;
  /** Things that make it flee (animal positions). */
  threats(): { x: number; y: number }[];
  /** 0 to 1: how active this kind is now (insects by day and in fine weather, birds by daylight). Inactive agents rest or hide. */
  activity(): number;
  /** Where to hide when bolting (runners). */
  cover?(from: THREE.Vector3): THREE.Vector3;
  speed?: number; flushR?: number; scale?: number; seed?: number;
}
interface Agent { p: THREE.Vector3; v: THREE.Vector3; tgt: THREE.Vector3; h: number; state: string; t: number; ph: number; hop: number; peck: number; vis: number }
interface Live { k: AgentKind; mesh: THREE.InstancedMesh; a: Agent[]; R: { rand: () => number; rr: (a: number, b: number) => number } }
const kinds: Live[] = [];
const o = new THREE.Object3D(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), _d = new THREE.Vector3();
/** Upper bound on how many of each kind are shown (the content can lower it on slow hardware). */
export const AMBIENT = { share: reduceMotion ? 0.5 : 1 };

export function addAgents(k: AgentKind) {
  const R = seeded(k.seed ?? 77), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), k.count * k.parts.length);
  const c = new THREE.Color();
  for (let i = 0; i < k.count; i++) k.parts.forEach((pt, j) => mesh.setColorAt(i * k.parts.length + j, c.setHex(pt.col)));
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; scene.add(mesh);
  const a: Agent[] = [];
  for (let i = 0; i < k.count; i++) {
    const p = k.spot(R.rand, k.style === 'runner', new THREE.Vector3()).clone();
    a.push({ p, v: new THREE.Vector3(), tgt: p.clone(), h: R.rr(0, 6.28), state: k.style === 'flier' || k.style === 'runner' ? 'perch' : 'move', t: R.rr(1, 6), ph: R.rr(0, 6.28), hop: 0, peck: 0, vis: 1 });
  }
  const L = { k, mesh, a, R }; kinds.push(L);
  return L;
}

const near = (k: AgentKind, p: THREE.Vector3, r: number) => k.threats().some(t => Math.hypot(t.x - p.x, t.y - p.z) < r);
function steer(ag: Agent, sp: number, turn: number, dt: number) {
  _d.copy(ag.tgt).sub(ag.p); const L = _d.length();
  if (L > 1e-3) _d.multiplyScalar(Math.min(sp, L * 3) / L);
  ag.v.lerp(_d, 1 - Math.exp(-turn * dt)); ag.p.addScaledVector(ag.v, dt);
  if (ag.v.x * ag.v.x + ag.v.z * ag.v.z > 0.01) ag.h = headingTo(ag.v.x, ag.v.z);
  return L;
}
function step(L: Live, ag: Agent, dt: number, live: number) {
  const k = L.k, R = L.R, sp = k.speed ?? 30, g = k.ground(ag.p.x, ag.p.z);
  ag.t -= dt; ag.ph += dt;
  switch (k.style) {
    case 'flier': {   // fly to a spot, land, hop and peck about, flush when something big comes close
      if (ag.state === 'fly' || ag.state === 'flush') {
        const fast = ag.state === 'flush' ? 1.8 : 1, d = steer(ag, sp * fast, 2.2, dt);
        if (d < 1.2) { ag.state = 'perch'; ag.v.set(0, 0, 0); ag.p.y = k.ground(ag.p.x, ag.p.z) > ag.tgt.y - 2 ? Math.max(ag.tgt.y, k.ground(ag.p.x, ag.p.z)) : ag.tgt.y; ag.t = R.rr(6, 20); emit(k.name, ag.p.x, ag.p.y, ag.p.z, 1, ag); }
      } else {
        if (near(k, ag.p, k.flushR ?? 18) && !reduceMotion) { ag.state = 'flush'; ag.tgt.copy(k.spot(R.rand, true, ag.p)); emit(k.name, ag.p.x, ag.p.y, ag.p.z, 1.3, ag); break; }
        ag.hop = Math.max(0, ag.hop - dt / 0.3); ag.peck = Math.max(0, ag.peck - dt / 0.4);
        if (live > 0.3 && R.rand() < dt * 0.8) {
          if (R.rand() < 0.5) { ag.peck = 1; }
          else if (ag.p.y - g < 1.5) { const a = R.rr(0, 6.28), d = R.rr(1.5, 4); ag.h = a; ag.p.x += Math.cos(a) * d; ag.p.z -= Math.sin(a) * d; ag.p.y = k.ground(ag.p.x, ag.p.z); ag.hop = 1; }
        }
        if (ag.t <= 0 && live > 0.2) { ag.state = 'fly'; ag.tgt.copy(k.spot(R.rand, true, ag.p)); }
      }
      break;
    }
    case 'hover': {   // hang in the air near a spot, then dart to the next
      const d = steer(ag, sp, 6, dt);
      ag.p.y += Math.sin(ag.ph * 9) * 0.6 * dt;
      if (d < 1 && ag.t <= 0) { ag.tgt.copy(k.spot(R.rand, false, ag.p)); ag.t = R.rr(0.6, 3); }
      break;
    }
    case 'flutter': {   // butterflies: a wandering, bobbing line, now and then settling on a flower with wings slowly opening and closing
      if (ag.state === 'rest') { ag.v.set(0, 0, 0); if (ag.t <= 0) { ag.state = 'move'; ag.tgt.copy(k.spot(R.rand, false, ag.p)); ag.t = R.rr(4, 9); } break; }
      _d.copy(ag.tgt).sub(ag.p);
      const want = Math.atan2(-_d.z, _d.x) + Math.sin(ag.ph * 1.3) * 0.9 + Math.sin(ag.ph * 3.1) * 0.4;
      ag.h += clamp(((want - ag.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -3 * dt, 3 * dt);
      ag.v.set(Math.cos(ag.h) * sp, Math.sin(ag.ph * 5) * 3 + clamp(_d.y, -3, 3), -Math.sin(ag.h) * sp);
      ag.p.addScaledVector(ag.v, dt);
      if (ag.p.y < g + 1.5) ag.p.y = g + 1.5;
      if (_d.length() < 3 || ag.t <= 0) {
        if (R.rand() < 0.4) { ag.state = 'rest'; ag.tgt.copy(k.spot(R.rand, true, ag.p)); ag.p.copy(ag.tgt); ag.t = R.rr(2, 6); }
        else { ag.tgt.copy(k.spot(R.rand, false, ag.p)); ag.t = R.rr(4, 9); }
      }
      break;
    }
    case 'runner': {   // graze and hop about; bolt for cover when something comes close, wait, then come back out
      if (ag.state === 'hide') { ag.vis = Math.max(0, ag.vis - dt * 3); if (ag.t <= 0 && !near(k, ag.p, 60)) { ag.state = 'perch'; ag.t = R.rr(5, 12); } break; }
      ag.vis = Math.min(1, ag.vis + dt * 2);
      if (ag.state === 'bolt') { const d = steer(ag, sp * 2.2, 8, dt); ag.p.y = k.ground(ag.p.x, ag.p.z); ag.hop = (ag.ph * 6) % 1; if (d < 2) { ag.state = 'hide'; ag.t = R.rr(10, 22); } break; }
      if (near(k, ag.p, k.flushR ?? 45) && k.cover) { ag.state = 'bolt'; ag.tgt.copy(k.cover(ag.p)); emit(k.name, ag.p.x, ag.p.y, ag.p.z, 1.4, ag); break; }
      if (ag.state === 'move') { const d = steer(ag, sp * 0.6, 6, dt); ag.p.y = k.ground(ag.p.x, ag.p.z); ag.hop = (ag.ph * 3) % 1; if (d < 1.5) { ag.state = 'perch'; ag.v.set(0, 0, 0); ag.t = R.rr(3, 10); ag.hop = 0; } }
      else { ag.peck = 0.5 + 0.5 * Math.sin(ag.ph * 0.7); if (ag.t <= 0 && live > 0.2) { ag.state = 'move'; ag.tgt.copy(k.spot(R.rand, true, ag.p)); } }
      break;
    }
  }
}
/** Advance every kind and write the instance matrices. */
export function updateAgents(dt: number) {
  for (const L of kinds) {
    const k = L.k, live = k.activity(), n = Math.round(k.count * AMBIENT.share * (k.style === 'hover' || k.style === 'flutter' ? clamp(live * 1.4, 0, 1) : 1)), P = k.parts.length, s = k.scale ?? 1;
    L.mesh.count = n * P;
    for (let i = 0; i < n; i++) {
      const ag = L.a[i]; step(L, ag, dt, live);
      const flying = ag.state === 'fly' || ag.state === 'flush' || ag.state === 'move' && k.style !== 'runner';
      const flap = flying ? Math.sin(ag.ph * (k.style === 'flutter' ? 14 : k.style === 'hover' ? 60 : 22)) : k.style === 'flutter' ? 0.6 + 0.5 * Math.sin(ag.ph * 1.5) : 0;
      const lift = k.style === 'runner' || k.style === 'flier' ? Math.sin(Math.PI * ag.hop) * (k.style === 'runner' ? 2.2 : 0.8) : 0;
      const pitch = (k.style === 'flier' ? -0.6 : -0.25) * ag.peck;
      for (let j = 0; j < P; j++) {
        const pt = k.parts[j];
        o.position.set(pt.at[0] * s, pt.at[1] * s, pt.at[2] * s); o.scale.set(pt.size[0] * s, pt.size[1] * s, pt.size[2] * s);
        o.rotation.set(0, 0, 0);
        if (pt.flap) {   // wings hinge at the body's side: raise by the flap angle about the long axis
          // fliers tuck their wings in when perched; hoverers only flutter; everything else beats in full
          const tucked = k.style === 'flier' && !flying, ang = tucked ? 0.05 : k.style === 'hover' ? 0.1 + 0.25 * flap : 0.3 + 0.9 * flap;
          const hz = pt.size[2] * s / 2 * (tucked ? 0.35 : 1), hinge = pt.at[2] * s - pt.flap * pt.size[2] * s / 2;
          o.rotation.set(-pt.flap * ang, 0, 0); o.position.set(pt.at[0] * s, pt.at[1] * s + hz * Math.sin(ang), hinge + pt.flap * hz * Math.cos(ang));
          if (tucked) o.scale.z *= 0.35;
        }
        if (k.style === 'runner') o.scale.multiplyScalar(ag.vis);
        o.updateMatrix();
        e.set(0, ag.h, pitch, 'YXZ'); q.setFromEuler(e);
        m4.compose(_d.set(ag.p.x, ag.p.y + lift, ag.p.z), q, one).multiply(o.matrix);
        L.mesh.setMatrixAt(i * P + j, m4);
      }
    }
    L.mesh.instanceMatrix.needsUpdate = true;
  }
}
/** Positions of every visible agent of a kind (tests and debugging). */
export const agentsOf = (name: string) => kinds.find(L => L.k.name === name)?.a.map(a => ({ x: a.p.x, y: a.p.y, z: a.p.z, state: a.state })) ?? [];
