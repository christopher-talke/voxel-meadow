import * as THREE from 'three';
import { state } from '../core/state';
import { scene } from '../render/stage';
import { B, block } from './layout';
import { UNIT, groundTop } from './mesh';
import { WX } from '../sim/sky';

// ================= the whistle post: a brass whistle on a cord that you tap to call everyone =================
/** The whistle post: its position, tappable meshes, the swinging cord group and the tap-kick that makes it swing and glow. */
export const WHISTLE = { x: 32, z: 6, meshes: [], kick: 0 } as unknown as {
  x: number; z: number; kick: number;
  meshes: THREE.Mesh[];
  brass: THREE.MeshLambertMaterial;
  g: THREE.Group;
  sw: THREE.Group;
};
{
  const g = new THREE.Group(), gy = Math.max(0, groundTop(WHISTLE.x, WHISTLE.z));
  const wood = new THREE.MeshLambertMaterial({ color: 0xa87a4c }), woodD = new THREE.MeshLambertMaterial({ color: 0x8a6038 });
  WHISTLE.brass = new THREE.MeshLambertMaterial({ color: 0xf0c04a, emissive: 0x7a5410, emissiveIntensity: 0.5 });
  const cord = new THREE.MeshLambertMaterial({ color: 0xa83a3a });
  const bx = (par, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(UNIT, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; par.add(b); return b; };
  bx(g, 1.9, 15, 1.9, wood, 0, 7.5, 0); bx(g, 3.4, 1.4, 3.4, woodD, 0, 0.7, 0); bx(g, 1.4, 1.2, 1.4, woodD, 0, 15.5, 0);
  bx(g, 6.5, 1.1, 1.1, wood, 3.2, 13.6, 0); bx(g, 1.1, 2.2, 1.1, wood, 6.2, 12.8, 0);   // a hook arm
  const sw = new THREE.Group(); sw.position.set(5.4, 13.0, 0); g.add(sw);   // the swinging whistle
  bx(sw, 0.25, 4.2, 0.25, cord, 0, -2.1, 0);
  const wh = new THREE.Group(); wh.position.y = -5.4; sw.add(wh);
  WHISTLE.meshes.push(bx(wh, 1.5, 1.5, 3.4, WHISTLE.brass, 0, 0, 0), bx(wh, 1.0, 0.8, 1.6, WHISTLE.brass, 0, -0.3, 2.3), bx(wh, 0.9, 0.5, 0.9, woodD, 0, 0.9, -0.2));
  g.position.set(WHISTLE.x, gy, WHISTLE.z); g.rotation.y = -0.5; g.scale.setScalar(1.6); scene.add(g);
  WHISTLE.g = g; WHISTLE.sw = sw;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && !WHISTLE.meshes.includes(o as THREE.Mesh)) WHISTLE.meshes.push(o as THREE.Mesh); });
  block(WHISTLE.x / B, WHISTLE.z / B, 1.7);
}
export function whistleUpdate(dt) {
  WHISTLE.kick = Math.max(0, WHISTLE.kick - dt * 0.7);
  const wind = 0.04 + 0.14 * WX.wind + 0.1 * WX.storm, a = Math.sin(state.T * 1.6) * wind + Math.sin(state.T * 5.2) * 0.9 * WHISTLE.kick * WHISTLE.kick;
  WHISTLE.sw.rotation.z = a; WHISTLE.sw.rotation.x = Math.sin(state.T * 1.1 + 1) * wind * 0.6;
  WHISTLE.brass.emissiveIntensity = 0.5 + 0.15 * Math.sin(state.T * 1.3) + WHISTLE.kick * 0.8;
}
