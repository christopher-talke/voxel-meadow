import * as THREE from 'three';
import { clamp, reduceMotion, seeded } from '../../engine/core/util';
import { camera, scene } from '../../engine/render/stage';
import { addCloudDeck, updateCloudDecks } from '../../engine/render/cloudDeck';
import { WX, env } from '../../engine/sky/sky';

// ================= beyond the island: it floats, deliberately =================
// Two loose decks of cloud below, the lake's fall dropping away into them, and a few small islands drifting far off.
// All of it uses its own random stream, so the meadow itself is exactly as it was.
const R = seeded(5151);

addCloudDeck({ y: -330, cell: 380, opacity: 0.92, speed: 5, cover: 0.62, seed: 1.7 });
addCloudDeck({ y: -620, cell: 620, opacity: 0.75, speed: 3, cover: 0.8, seed: 4.2, radius: 9000 });

/** A rough voxel mound, standing up from y0 or (down) hanging below it. */
function mound(r: number, h: number, y0: number, top: number, side: number, step: number, down = false) {
  const pts: number[][] = [], seed = R.rr(0, 100);
  for (let x = -r; x <= r; x += step) for (let z = -r; z <= r; z += step) {
    const d = Math.hypot(x, z) / r; if (d > 1) continue;
    const k = h * (down ? Math.pow(1 - d, 1.4) : 1 - d * d) * (0.72 + 0.28 * Math.sin(x * 0.031 + seed) * Math.cos(z * 0.027 - seed));
    if (k < step * 0.3) continue;
    pts.push([x, y0 + (down ? -k / 2 : k / 2), z, k]);
  }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(step, 1, step), new THREE.MeshLambertMaterial(), pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach((p, i) => {
    o.position.set(p[0], p[1], p[2]); o.scale.set(1, p[3], 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, c.setHex(down ? (p[3] > h * 0.8 ? 0x7a6a58 : side) : p[3] < step ? side : top).offsetHSL(0, 0, R.rr(-0.035, 0.035)));
  });
  m.receiveShadow = false; m.castShadow = false;
  return m;
}
function isle(r: number) {
  const g = new THREE.Group(), st = Math.max(8, Math.round(r / 9));
  g.add(mound(r, r * 0.22, 0, 0x6fa055, 0x8a7a5a, st));
  g.add(mound(r * 0.96, r * 1.35, 0, 0x8a7a5a, 0x6c5b4b, st, true));
  // a few blocky trees, so the islands read as places rather than rocks
  const leaf = new THREE.MeshLambertMaterial({ color: 0x4f8f3f }), wood = new THREE.MeshLambertMaterial({ color: 0x6e4c30 });
  for (let k = 0, n = Math.max(1, Math.round(r / 45)); k < n; k++) {
    const a = R.rr(0, 6.283), d = R.rr(0, r * 0.55), s = R.rr(0.7, 1.2) * Math.min(1, r / 90);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(5 * s, 26 * s, 5 * s), wood), crown = new THREE.Mesh(new THREE.BoxGeometry(26 * s, 20 * s, 26 * s), leaf);
    trunk.position.set(Math.cos(a) * d, r * 0.2 + 13 * s, Math.sin(a) * d); crown.position.set(trunk.position.x, trunk.position.y + 20 * s, trunk.position.z);
    g.add(trunk, crown);
  }
  return g;
}
// far islands on a slow carousel round the meadow: [bearing, distance, height, radius]
const ring = new THREE.Group(); scene.add(ring);
const ISLES: { g: THREE.Group; y: number; ph: number }[] = [];
for (const [a, d, y, r] of [[0.5, 1500, 60, 90], [1.6, 2300, 200, 150], [2.7, 1350, -40, 55], [3.9, 2600, 30, 200], [5.1, 1850, 240, 75], [4.5, 3100, 120, 120]]) {
  const g = isle(r); g.position.set(Math.cos(a) * d, y, Math.sin(a) * d); g.rotation.y = R.rr(0, 6.28);
  ring.add(g); ISLES.push({ g, y, ph: R.rr(0, 6.28) });
}

const lit = new THREE.Color(), shade = new THREE.Color(), tmp = new THREE.Color();
let t = 0;
/** Drift the far islands and the cloud decks, and light the decks to match the sky. */
export function updateBeyond(dt: number) {
  if (!reduceMotion) {
    t += dt;
    ring.rotation.y = t * (6.283 / 5400);   // one slow lap every ninety minutes
    for (const s of ISLES) s.g.position.y = s.y + Math.sin(t * 0.05 + s.ph) * 6;
  }
  // tops lit by the sun and sky, dimmed under overcast; hollows take the colour of the haze below the horizon
  const k = clamp(0.35 + env.sunI * 0.75 + env.hI * 0.3, 0, 1.12) * (1 - 0.3 * WX.cover);
  lit.copy(env.hs).lerp(tmp.copy(env.sun), 0.35).multiplyScalar(k).lerp(tmp.setRGB(0.92, 0.95, 1), env.flash * 0.6);
  shade.copy(lit).multiplyScalar(0.74).lerp(env.bot, 0.3);
  updateCloudDecks(reduceMotion ? 0 : t, lit, shade, camera.position.x, camera.position.z);
}
