import * as THREE from 'three';
import { B, R, colAt } from './layout';
import { applyBlobbyToonMaterial } from '../render/blobbyToonMaterial';

const SIZE = R * 2 + 1;
const idx = (i: number, j: number) => (i + R) * SIZE + (j + R);

function isLand(i: number, j: number) {
  const c = colAt(i, j);
  return !!c && c.wl === null && !c.edge;
}

function baseHeight(i: number, j: number) {
  const c = colAt(i, j);
  if (!c) return null;
  return c.top * B;
}

function baseColor(i: number, j: number, out: THREE.Color) {
  const c = colAt(i, j);
  if (!c) return out.setHex(0x8fb28a);
  if (c.type === 'path') return out.setHex(0xc6ab87);
  if (c.type === 'sand') return out.setHex(0xe8d9ad);
  if (c.forest) return out.setHex(0x7ea56b);
  return out.setHex(0x93be7a);
}

function smoothHeights(src: Float32Array, valid: Uint8Array, passes = 2) {
  let a = src.slice();
  let b = src.slice();
  const wt = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let p = 0; p < passes; p++) {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const k = idx(i, j);
      if (!valid[k]) continue;
      let sum = 0, wsum = 0, w = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const q = idx(i + di, j + dj);
        if (!valid[q]) { w++; continue; }
        const ww = wt[w++];
        sum += a[q] * ww;
        wsum += ww;
      }
      b[k] = wsum > 0 ? sum / wsum : a[k];
    }
    const t = a; a = b; b = t;
  }
  return a;
}

export function buildSmoothTerrainMesh() {
  const valid = new Uint8Array(SIZE * SIZE);
  const base = new Float32Array(SIZE * SIZE);
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const h = baseHeight(i, j), k = idx(i, j);
    if (h === null) continue;
    valid[k] = 1;
    base[k] = h;
  }
  const h = smoothHeights(base, valid, 2);
  const c = new THREE.Color();

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const ind: number[] = [];
  const vix = new Int32Array(SIZE * SIZE).fill(-1);

  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const k = idx(i, j);
    if (!isLand(i, j)) continue;
    const x = i * B, z = j * B, y = h[k];
    const hx1 = h[idx(Math.min(R, i + 1), j)], hx0 = h[idx(Math.max(-R, i - 1), j)];
    const hz1 = h[idx(i, Math.min(R, j + 1))], hz0 = h[idx(i, Math.max(-R, j - 1))];
    const dx = (hx1 - hx0) / (2 * B), dz = (hz1 - hz0) / (2 * B);
    const n = new THREE.Vector3(-dx, 1, -dz).normalize();
    vix[k] = pos.length / 3;
    pos.push(x, y, z);
    nor.push(n.x, n.y, n.z);
    baseColor(i, j, c);
    col.push(c.r, c.g, c.b);
  }

  for (let i = -R; i < R; i++) for (let j = -R; j < R; j++) {
    const a = vix[idx(i, j)], b = vix[idx(i + 1, j)], c0 = vix[idx(i, j + 1)], d = vix[idx(i + 1, j + 1)];
    if (a < 0 || b < 0 || c0 < 0 || d < 0) continue;
    ind.push(a, b, c0, b, d, c0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  applyBlobbyToonMaterial(mat, { top: 0xf0e3d7, bottom: 0xc5b09c, gloss: 0.03, rim: 0.02, ambient: 0.46 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
