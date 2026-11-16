import * as THREE from 'three';
import { seeded } from '../engine/core/util';
import { scene } from '../engine/render/stage';

// ================= decision mocks: what lies beyond the island =================
// Debug only, built on first use and never shown unless a test asks. Two coherent answers, cheap enough to look at side by side:
//   'sea': the island sits in an endless sea at its own water level, with headlands fading into haze and a small boat
//   'sky': the island commits to floating, over layered cloud with other small islands drifting at a distance
// Nothing here touches the simulation or the shared random stream.

const R = seeded(5151);
let sea: THREE.Group | null = null, sky: THREE.Group | null = null;

function voxelMound(cx: number, cz: number, r: number, h: number, y0: number, top: number, side: number, step = 14, down = false) {
  const pts: number[][] = [];
  for (let x = -r; x <= r; x += step) for (let z = -r; z <= r; z += step) {
    const d = Math.hypot(x, z) / r; if (d > 1) continue;
    const k = h * (1 - d * d) * (0.75 + 0.25 * Math.sin(x * 0.02 + cz) * Math.cos(z * 0.025 + cx));
    if (k < 4) continue;
    pts.push([cx + x, y0 + (down ? -k / 2 : k / 2), cz + z, k]);
  }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(step, 1, step), new THREE.MeshLambertMaterial(), pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.scale.set(1, p[3], 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.setHex(down ? (p[3] > h * 0.85 ? top : side) : p[3] < 10 ? side : top).offsetHSL(0, 0, R.rr(-0.03, 0.03))); });
  return m;
}

function buildSea() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d7f9e }));
  water.position.y = -5; g.add(water);
  // headlands and a couple of small islands, far enough out that the fog softens them into the horizon
  for (const [a, d, r, h] of [[0.4, 1700, 320, 120], [1.3, 2300, 420, 170], [2.6, 1500, 200, 70], [3.7, 2600, 520, 210], [4.9, 1900, 260, 90], [5.6, 1300, 120, 40]]) {
    g.add(voxelMound(Math.cos(a) * d, Math.sin(a) * d, r, h, -5, 0x6f9c5a, 0xd9c79a));
  }
  // a small sailing boat, well clear of the island
  const boat = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x8a5a3a }), sail = new THREE.MeshLambertMaterial({ color: 0xf4efe2, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 6, 12), wood); hull.position.y = 1; boat.add(hull);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2), wood); mast.position.y = 22; boat.add(mast);
  const sl = new THREE.Shape(); sl.moveTo(0, 0); sl.lineTo(0, 36); sl.lineTo(-22, 0); sl.lineTo(0, 0);
  const s = new THREE.Mesh(new THREE.ShapeGeometry(sl), sail); s.position.set(-1, 4, 0); boat.add(s);
  boat.position.set(640, -5, 380); boat.rotation.y = 0.6; g.add(boat);
  return g;
}

function cloudTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d')!;
  for (let i = 0; i < 520; i++) {
    const px = R.rr(0, 512), py = R.rr(0, 512), r = R.rr(14, 54), gr = x.createRadialGradient(px, py, 0, px, py, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

function floatingIsle(cx: number, cy: number, cz: number, r: number) {
  const g = new THREE.Group(), st = Math.max(8, Math.round(r / 9));
  g.add(voxelMound(cx, cz, r, r * 0.25, cy, 0x6fa055, 0x8a7a5a, st));
  g.add(voxelMound(cx, cz, r * 0.95, r * 1.3, cy, 0x8a7a5a, 0x6c5b4b, st, true));
  return g;
}

function buildSky() {
  const g = new THREE.Group(), tex = cloudTex();
  // two loose cloud decks below the island, the lower one dimmer, so the drop reads as deep rather than empty
  for (const [y, op, col] of [[-320, 0.85, 0xffffff], [-560, 0.6, 0xdfe6ef]] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false }));
    m.position.y = y; g.add(m);
  }
  for (const [a, d, y, r] of [[0.5, 1500, 60, 90], [1.6, 2200, 180, 150], [2.7, 1300, -60, 50], [3.9, 2500, 40, 200], [5.1, 1800, 240, 70]]) g.add(floatingIsle(Math.cos(a) * d, y, Math.sin(a) * d, r));
  return g;
}

/** Show one of the beyond-the-island mocks, or none. Built lazily so the normal page pays nothing. */
export function mockBeyond(kind: 'sea' | 'sky' | null) {
  if (kind === 'sea' && !sea) { sea = buildSea(); scene.add(sea); }
  if (kind === 'sky' && !sky) { sky = buildSky(); scene.add(sky); }
  if (sea) sea.visible = kind === 'sea';
  if (sky) sky.visible = kind === 'sky';
}
