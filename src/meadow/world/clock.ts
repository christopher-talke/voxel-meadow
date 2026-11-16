import * as THREE from 'three';
import { smooth } from '../../engine/core/util';
import { scene } from '../../engine/render/stage';
import { block } from '../../engine/terrain/grid';
import { B } from '../../engine/core/scale';
import { groundTop } from './mesh';
import { UNIT } from '../../engine/render/mesher';
import { WX, env, simDate } from '../../engine/sky/sky';

// ================= the park clock, so the meadow's time is part of the world =================
export const CLOCK = { x: -44, z: -60 } as { x: number; z: number; g: THREE.Group; head: THREE.Group };
const clockHands: { h: THREE.Group; m: THREE.Group; s: number }[] = [];
let clockFaceMat;
{
  const g = new THREE.Group(), gy = Math.max(0, groundTop(CLOCK.x, CLOCK.z));
  const iron = new THREE.MeshLambertMaterial({ color: 0x2c4536 }), brass = new THREE.MeshLambertMaterial({ color: 0xb8954a, emissive: 0x2a1e08 });
  const bx = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(UNIT, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
  bx(5, 1.6, 5, iron, 0, 0.8, 0); bx(3.4, 1.4, 3.4, iron, 0, 2.3, 0); bx(1.5, 26, 1.5, iron, 0, 15, 0); bx(2.4, 1, 2.4, brass, 0, 27.6, 0);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  x.fillStyle = '#f6efdc'; x.beginPath(); x.arc(128, 128, 124, 0, 6.283); x.fill();
  x.strokeStyle = '#2c4536'; x.lineWidth = 8; x.stroke();
  x.fillStyle = '#2c2a26';
  for (let i = 0; i < 60; i++) { const a = i / 60 * 6.283, big = i % 5 === 0, r0 = big ? 98 : 106; x.save(); x.translate(128, 128); x.rotate(a); x.fillRect(-(big ? 3.5 : 1.5), -116, big ? 7 : 3, 116 - r0); x.restore(); }
  x.font = '700 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  [[12, 0], [3, 1], [6, 2], [9, 3]].forEach(([n, q]) => { const a = q * Math.PI / 2; x.fillText(String(n), 128 + Math.sin(a) * 76, 128 - Math.cos(a) * 76); });
  const tex = new THREE.CanvasTexture(c);
  clockFaceMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffe7b0, emissiveMap: tex, emissiveIntensity: 0 });
  const head = new THREE.Group(); head.position.y = 34; g.add(head);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 2.4, 28), iron); rim.rotation.x = Math.PI / 2; rim.castShadow = true; head.add(rim);
  const handM = new THREE.MeshLambertMaterial({ color: 0x1d1c1a });
  for (const s of [1, -1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(5.6, 28), clockFaceMat); face.position.z = 1.25 * s; if (s < 0) face.rotation.y = Math.PI; head.add(face);
    const mk = (len, w) => { const p = new THREE.Group(); p.position.z = 1.45 * s; const m = new THREE.Mesh(UNIT, handM); m.scale.set(w, len, 0.25); m.position.y = len / 2 - 0.6; p.add(m); head.add(p); return p; };
    clockHands.push({ h: mk(3.2, 0.62), m: mk(4.7, 0.42), s });
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 4), iron); cap.position.y = 7.6; cap.rotation.y = Math.PI / 4; head.add(cap);
  const fin = new THREE.Mesh(UNIT, brass); fin.scale.set(0.8, 1.6, 0.8); fin.position.y = 9.6; head.add(fin);
  g.position.set(CLOCK.x, gy, CLOCK.z); g.rotation.y = Math.atan2(-CLOCK.x, -CLOCK.z);
  scene.add(g); CLOCK.g = g; CLOCK.head = head;
  block(CLOCK.x / B, CLOCK.z / B, 1.2);
}

export function clockUpdate() {
  const d = simDate(), m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
  for (const c of clockHands) { c.h.rotation.z = -h / 12 * 6.283 * c.s; c.m.rotation.z = -m / 60 * 6.283 * c.s; }
  clockFaceMat.emissiveIntensity = 0.85 * (1 - smooth(-6, 4, env.el)) + 0.25 * WX.cover;
}
export function timeText() { const d = simDate(); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'), ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + m + ' ' + ap; }
