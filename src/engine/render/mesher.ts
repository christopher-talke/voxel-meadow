import * as THREE from 'three';
import { B } from '../core/scale';
import { type Col, colAt } from '../terrain/grid';

// ================= voxel meshing: face-culled quads, chunked for culling, plus instanced boxes =================
export interface Mesher { p: number[]; n: number[]; c: number[]; i: number[]; v: number }
export const makeMesher = (): Mesher => ({ p: [], n: [], c: [], i: [], v: 0 });
const _cc = new THREE.Color();
/** One quad from corner a along edges u and v, wound to face normal n, in a flat colour. */
export function quad(M: Mesher, ax, ay, az, ux, uy, uz, vx, vy, vz, nx, ny, nz, col) {
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nx + cy * ny + cz * nz < 0) { let t = ux; ux = vx; vx = t; t = uy; uy = vy; vy = t; t = uz; uz = vz; vz = t; }
  M.p.push(ax, ay, az, ax + ux, ay + uy, az + uz, ax + ux + vx, ay + uy + vy, az + uz + vz, ax + vx, ay + vy, az + vz);
  for (let k = 0; k < 4; k++) M.n.push(nx, ny, nz);
  _cc.setHex(col); for (let k = 0; k < 4; k++) M.c.push(_cc.r, _cc.g, _cc.b);
  M.i.push(M.v, M.v + 1, M.v + 2, M.v, M.v + 2, M.v + 3); M.v += 4;
}
export function finish(M: Mesher, mat: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.c, 3));
  g.setIndex(M.v > 65535 ? new THREE.Uint32BufferAttribute(M.i, 1) : new THREE.Uint16BufferAttribute(M.i, 1));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
/** A static mesh: never moves, so its matrices are computed once rather than every frame. */
export const freeze = <T extends THREE.Object3D>(o: T): T => { o.updateMatrix(); o.updateMatrixWorld(true); o.matrixAutoUpdate = false; return o; };

/** Square chunks of meshers, so the camera and the sun's shadow camera can skip what they cannot see. */
export function chunks(size = 32 * B) {
  const map = new Map<number, Mesher>();
  return {
    at(x: number, z: number) { const k = (Math.floor(x / size) + 64) * 128 + Math.floor(z / size) + 64; let m = map.get(k); if (!m) { m = makeMesher(); map.set(k, m); } return m; },
    /** Build one culled, shadowed mesh per non-empty chunk and add each to `parent`. */
    build(mat: THREE.Material, parent: THREE.Object3D, out?: THREE.Mesh[]) {
      for (const M of map.values()) { if (!M.v) continue; const m = finish(M, mat); m.frustumCulled = true; m.geometry.computeBoundingSphere(); m.receiveShadow = m.castShadow = true; parent.add(freeze(m)); if (out) out.push(m); }
    },
  };
}

const H = B / 2;
export interface ColumnColours { top(c: Col): number; bottom(c: Col): number; side(c: Col, depth: number): number }
/**
 * Mesh terrain columns: top, underside and exposed sides of every column, plus water surfaces and the little
 * falls where one water level steps down to the next. Colour callbacks run in a fixed order per column.
 */
export function meshColumns(list: (Col | null)[], colours: ColumnColours, terr: ReturnType<typeof chunks>, water: Mesher) {
  for (const c of list) {
    if (!c) continue;
    const x = c.i * B, z = c.j * B, TERR = terr.at(x, z);
    quad(TERR, x - H, c.top * B, z - H, B, 0, 0, 0, 0, B, 0, 1, 0, colours.top(c));
    quad(TERR, x - H, c.bot * B, z - H, B, 0, 0, 0, 0, B, 0, -1, 0, colours.bottom(c));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = colAt(c.i + di, c.j + dj);
      for (let k = c.bot + 1; k <= c.top; k++) {
        if (n && k <= n.top && k > n.bot) continue;
        const fx = x + di * H, fz = z + dj * H;
        if (di) quad(TERR, fx, (k - 1) * B, z - H, 0, B, 0, 0, 0, B, di, 0, 0, colours.side(c, c.top - k));
        else quad(TERR, x - H, (k - 1) * B, fz, B, 0, 0, 0, B, 0, 0, 0, dj, colours.side(c, c.top - k));
      }
    }
    if (c.wl !== null) {
      quad(water, x - H, c.wl, z - H, B, 0, 0, 0, 0, B, 0, 1, 0, 0xffffff);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = colAt(c.i + di, c.j + dj);
        if (n && n.wl !== null && n.wl < c.wl - 0.5) {
          const h = c.wl - n.wl;
          if (di) quad(water, x + di * H, n.wl, z - H, 0, h, 0, 0, 0, B, di, 0, 0, 0xeaf6ff);
          else quad(water, x - H, n.wl, z + dj * H, B, 0, 0, 0, h, 0, 0, 0, dj, 0xeaf6ff);
        }
      }
    }
  }
}

/** Pack a block-grid voxel coordinate into one map key. */
export const DK = (i, k, j) => ((i + 600) * 2048 + (k + 600)) * 2048 + (j + 600);
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const terrainSolid = (i, k, j) => { const c = colAt(i, j); return !!c && k <= c.top && k > c.bot; };
/** Mesh a sparse set of block voxels (key from DK, value a colour), culling faces against each other and the terrain. */
export function meshVoxels(set: Map<number, number>, out: ReturnType<typeof chunks>) {
  for (const [key, col] of set) {
    const j = key % 2048 - 600, k = Math.floor(key / 2048) % 2048 - 600, i = Math.floor(key / (2048 * 2048)) - 600;
    for (const [di, dk, dj] of D6) {
      if (set.has(DK(i + di, k + dk, j + dj)) || terrainSolid(i + di, k + dk, j + dj)) continue;
      const x = i * B, y = (k - 0.5) * B, z = j * B, M = out.at(x, z);
      if (di) quad(M, x + di * H, y - H, z - H, 0, B, 0, 0, 0, B, di, 0, 0, col);
      else if (dk) quad(M, x - H, y + dk * H, z - H, B, 0, 0, 0, 0, B, 0, dk, 0, col);
      else quad(M, x - H, y - H, z + dj * H, B, 0, 0, 0, B, 0, 0, 0, dj, col);
    }
  }
}

export const UNIT = new THREE.BoxGeometry(1, 1, 1);
/** Boxes as one instanced mesh. Each entry: x, y, z, sx, sy, sz, colour, y rotation. */
export function buildBoxes(list: number[][], mat: THREE.Material, cast = true) {
  const m = new THREE.InstancedMesh(UNIT, mat, list.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((b, i) => {
    o.position.set(b[0], b[1], b[2]); o.rotation.set(0, b[7] || 0, 0); o.scale.set(b[3], b[4], b[5]); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); c.setHex(b[6]); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
  return m;
}

// see-through cutaway: anything in a capsule between the camera and its focus dissolves in a dither, so the subject stays visible
export const cutU = { uFocus: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uRoof: { value: 0 }, uCutOn: { value: 1 } };
export function applyCutaway(mat: THREE.Material) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, cutU);
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWP;\nuniform vec3 uFocus;\nuniform vec3 uCam;\nuniform float uCutOn;\n' + sh.fragmentShader.replace('void main() {', `void main() {
    vec3 ab = uCam - uFocus; float t = clamp(dot(vWP - uFocus, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(vWP - (uFocus + ab * t)); float r = mix(14.0, 34.0, t);
    if (uCutOn > 0.5 && t > 0.03 && vWP.y > uFocus.y - 2.0 && d < r) {
      float n = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
      if (n < smoothstep(r, r * 0.5, d)) discard;
    }`);
  };
  return mat;
}
