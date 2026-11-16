import * as THREE from 'three';
import { V3 } from '../core/util';
import { B } from '../core/scale';
import { camera, renderer } from '../render/stage';
import { type Col, colXZ } from '../terrain/grid';

// ================= pointer and touch: a camera ray, taps, ground picks and the nearest thing on screen =================
export const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
/** Aim the shared ray from the camera through a pointer event's position. */
export function pointerRay(e: { clientX: number; clientY: number }) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
/** A press and release close enough in space and time to count as a tap. Touch gets more slack than a mouse. */
export const isTap = (down: { x: number; y: number; t: number } | null, e: PointerEvent) => {
  const touch = e.pointerType === 'touch';
  return !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < (touch ? 16 : 8) && performance.now() - down.t < (touch ? 650 : 500);
};
/** March the ray across the terrain grid and return where it first meets the surface. `surface` gives a column's walking height. */
export function pickGround(surface: (c: Col) => number = c => c.wl !== null ? c.wl : c.top * B) {
  const o = ray.ray.origin, d = ray.ray.direction;
  for (let t = 0; t < 4000; t += 2) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const c = colXZ(x, z);
    if (c && y <= surface(c)) return new THREE.Vector3(x, y, z);
    if (y < -300) break;
  }
  return null;
}
/** The subject whose on-screen position is nearest a pointer, within `px` pixels. */
export function nearestOnScreen<T extends { root: THREE.Object3D }>(list: T[], e: { clientX: number; clientY: number }, px: number, lift = 6): T | null {
  const r = renderer.domElement.getBoundingClientRect(); let best: T | null = null, bd = px;
  for (const d of list) {
    const p = V3.set(d.root.position.x, d.root.position.y + lift, d.root.position.z).project(camera);
    if (p.z > 1) continue;
    const dd = Math.hypot((p.x * 0.5 + 0.5) * r.width + r.left - e.clientX, (-p.y * 0.5 + 0.5) * r.height + r.top - e.clientY);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
