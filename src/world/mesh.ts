import * as THREE from 'three';
import { clamp, jit, mixHex, noise, rand, rr } from '../core/util';
import { DPR, scene } from '../render/stage';
import { B, BEDS, DECK, FIELD, POLE, SH, SHELTER_POSTS, colAt, colXZ, cols, isWaterCol } from './layout';
import { BALL, BALL_R, CHERRY, DK, ballBoxes, boxes, decor } from './decor';

// ================= meshing =================
const quadsP: number[] = [], quadsN: number[] = [], quadsC: number[] = [], quadsI: number[] = [];
function makeMesher() { return { p: [], n: [], c: [], i: [], v: 0 }; }
const WAT = makeMesher();
const TERR_MESHES: THREE.Mesh[] = [];
// terrain and decor are split into square chunks so the camera and the sun's shadow camera can skip what they can't see
const CHUNK = 32 * B, TERR_CH = new Map<number, any>(), DEC_CH = new Map<number, any>();
const chunkAt = (map: Map<number, any>, x: number, z: number) => { const k = (Math.floor(x / CHUNK) + 64) * 128 + Math.floor(z / CHUNK) + 64; let m = map.get(k); if (!m) { m = makeMesher(); map.set(k, m); } return m; };
const _cc = new THREE.Color();
function quad(M, ax, ay, az, ux, uy, uz, vx, vy, vz, nx, ny, nz, col) {
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nx + cy * ny + cz * nz < 0) { let t = ux; ux = vx; vx = t; t = uy; uy = vy; vy = t; t = uz; uz = vz; vz = t; }
  M.p.push(ax, ay, az, ax + ux, ay + uy, az + uz, ax + ux + vx, ay + uy + vy, az + uz + vz, ax + vx, ay + vy, az + vz);
  for (let k = 0; k < 4; k++) M.n.push(nx, ny, nz);
  _cc.setHex(col); for (let k = 0; k < 4; k++) M.c.push(_cc.r, _cc.g, _cc.b);
  M.i.push(M.v, M.v + 1, M.v + 2, M.v, M.v + 2, M.v + 3); M.v += 4;
}
function finish(M, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.c, 3));
  g.setIndex(M.v > 65535 ? new THREE.Uint32BufferAttribute(M.i, 1) : new THREE.Uint16BufferAttribute(M.i, 1));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
const H = B / 2;
function topColour(c) {
  const x = c.i * B, z = c.j * B;
  if (c.type === 'shallow') return jit(0xd8c491, 0.04);
  if (c.type === 'deep') return jit(0x7d8a76, 0.05);
  if (c.type === 'creek') return jit(rand() < 0.5 ? 0x9a8f78 : 0x8a8270, 0.05);
  if (c.type === 'sand') return jit(0xe9d8a8, 0.04);
  if (c.type === 'path') return jit(rand() < 0.5 ? 0xc9a87a : 0xbf9e70, 0.04);
  let col = mixHex(0x78b05c, 0x9cc46c, noise(x * 0.03, z * 0.03, 9));
  if (c.top > 2) col = mixHex(col, 0x6a9f55, clamp((c.top - 2) / 6, 0, 0.5));
  if (c.forest) col = mixHex(col, 0x5c9449, 0.45);
  return jit(col, 0.045);
}
const sideColour = (c, depth) => depth === 0 ? (c.type === 'sand' ? jit(0xdcc995, 0.04) : c.type === 'path' ? jit(0xb08f62, 0.04) : isWaterCol(c) ? jit(0x8a7a60, 0.05) : jit(0x6aa451, 0.05))
  : depth <= 2 ? jit(rand() < 0.5 ? 0x8b5e3c : 0x7c5236, 0.05) : rand() < 0.07 ? jit(0x6f8f55, 0.06) : jit(depth > 12 ? 0x767a82 : 0x8b8f96, 0.05);
for (const c of cols) {
  if (!c) continue;
  const x = c.i * B, z = c.j * B, TERR = chunkAt(TERR_CH, x, z);
  quad(TERR, x - H, c.top * B, z - H, B, 0, 0, 0, 0, B, 0, 1, 0, topColour(c));
  quad(TERR, x - H, c.bot * B, z - H, B, 0, 0, 0, 0, B, 0, -1, 0, jit(0x6c7077, 0.05));
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = colAt(c.i + di, c.j + dj);
    for (let k = c.bot + 1; k <= c.top; k++) {
      if (n && k <= n.top && k > n.bot) continue;
      const fx = x + di * H, fz = z + dj * H;
      if (di) quad(TERR, fx, (k - 1) * B, z - H, 0, B, 0, 0, 0, B, di, 0, 0, sideColour(c, c.top - k));
      else quad(TERR, x - H, (k - 1) * B, fz, B, 0, 0, 0, B, 0, 0, 0, dj, sideColour(c, c.top - k));
    }
  }
  if (c.wl !== null) {
    quad(WAT, x - H, c.wl, z - H, B, 0, 0, 0, 0, B, 0, 1, 0, 0xffffff);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = colAt(c.i + di, c.j + dj);
      if (n && n.wl !== null && n.wl < c.wl - 0.5) {
        const h = c.wl - n.wl;
        if (di) quad(WAT, x + di * H, n.wl, z - H, 0, h, 0, 0, 0, B, di, 0, 0, 0xeaf6ff);
        else quad(WAT, x - H, n.wl, z + dj * H, B, 0, 0, 0, h, 0, 0, 0, dj, 0xeaf6ff);
      }
    }
  }
}
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const terrainSolid = (i, k, j) => { const c = colAt(i, j); return !!c && k <= c.top && k > c.bot; };
for (const [key, col] of decor) {
  const j = key % 2048 - 600, k = Math.floor(key / 2048) % 2048 - 600, i = Math.floor(key / (2048 * 2048)) - 600;
  for (const [di, dk, dj] of D6) {
    if (decor.has(DK(i + di, k + dk, j + dj)) || terrainSolid(i + di, k + dk, j + dj)) continue;
    const x = i * B, y = (k - 0.5) * B, z = j * B, DEC = chunkAt(DEC_CH, x, z);
    if (di) quad(DEC, x + di * H, y - H, z - H, 0, B, 0, 0, 0, B, di, 0, 0, col);
    else if (dk) quad(DEC, x - H, y + dk * H, z - H, B, 0, 0, 0, 0, B, 0, dk, 0, col);
    else quad(DEC, x - H, y - H, z + dj * H, B, 0, 0, 0, B, 0, 0, 0, dj, col);
  }
}
export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
/** A static mesh: never moves, so its matrices are computed once rather than every frame. */
export const freeze = <T extends THREE.Object3D>(o: T): T => { o.updateMatrix(); o.updateMatrixWorld(true); o.matrixAutoUpdate = false; return o; };
const chunked = (map: Map<number, any>, mat: THREE.Material, out?: THREE.Mesh[]) => { for (const M of map.values()) { if (!M.v) continue; const m = finish(M, mat); m.frustumCulled = true; m.geometry.computeBoundingSphere(); m.receiveShadow = m.castShadow = true; scene.add(freeze(m)); if (out) out.push(m); } };
chunked(TERR_CH, vcMat, TERR_MESHES);
export const cutU = { uFocus: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uRoof: { value: 0 }, uCutOn: { value: 1 } };
const decorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
decorMat.onBeforeCompile = sh => {
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
chunked(DEC_CH, decorMat);
export const waterMat = new THREE.MeshLambertMaterial({ color: 0x5fb3d9, vertexColors: true, transparent: true, opacity: 0.74, side: THREE.DoubleSide });
const waterMesh = finish(WAT, waterMat); waterMesh.receiveShadow = true; scene.add(freeze(waterMesh));

export const UNIT = new THREE.BoxGeometry(1, 1, 1);
function buildBoxes(list, mat, cast = true) {
  const m = new THREE.InstancedMesh(UNIT, mat, list.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((b, i) => {
    o.position.set(b[0], b[1], b[2]); o.rotation.set(0, b[7] || 0, 0); o.scale.set(b[3], b[4], b[5]); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); c.setHex(b[6]); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const boxMat = new THREE.MeshLambertMaterial();
scene.add(freeze(buildBoxes(boxes, boxMat)));
const bedBoxes: number[][] = [];
for (const bd of BEDS) {
  for (let lx = -bd.a; lx <= bd.a; lx += 1.6) for (let lz = -bd.b; lz <= bd.b; lz += 1.6) {
    const r = Math.hypot(lx / bd.a, lz / bd.b); if (r >= 1) continue;
    const c = Math.cos(bd.rot), sn = Math.sin(bd.rot), x = bd.x + lx * c + lz * sn, z = bd.z - lx * sn + lz * c, h = r < 0.78 ? 3 : 6;
    bedBoxes.push([x, DECK + h / 2, z, 1.7, h, 1.7, jit(r < 0.78 ? bd.cush : bd.rim, 0.035), bd.rot]);
  }
}
export const bedMesh = buildBoxes(bedBoxes, boxMat); scene.add(freeze(bedMesh));
const shBoxes: number[][] = [], sb = (x, y, z, sx, sy, sz, c) => shBoxes.push([x, y, z, sx, sy, sz, jit(c, 0.04), 0]);
{
  const W = SH.x1 - SH.x0, hAt = x => x < SH.x1 + 8 ? SH.hBack + (SH.hFront - SH.hBack) * ((Math.min(x, SH.x1) - SH.x0) / W) : SH.hFront - 1.6;
  const WOOD = 0x9a7048, DARK = 0x6f4b2f, ROOF = 0x8d5a3b, ROOF2 = 0x9a6542, TRIM = 0x5f3f27;
  { const len = SH.z1 - SH.z0; let k = 0; for (let x = SH.x0; x < SH.x1; x += 4, k++) { const w = Math.min(4, SH.x1 - x); sb(x + w / 2, DECK / 2, (SH.z0 + SH.z1) / 2, w - 0.15, DECK, len, 0xc7a574 + ((k % 2) * 0x050403)); } }   // one unbroken deck
  for (const [px, pz] of SHELTER_POSTS) { const h = hAt(px), back = px < SH.x0 + 6; sb(px, h / 2, pz, 3.2, h, 3.2, back ? DARK : WOOD); }
  // roof panels (no overlaps): main arm, the corner, and the long arm
  const panel = (xa, xb, za, zb, hf, edgeS, edgeN) => {
    const rows = Math.max(2, Math.round((xb - xa) / 5)), rw = (xb - xa) / rows, zm = (za + zb) / 2;
    for (let r = 0; r < rows; r++) {
      const x = xa + r * rw + rw / 2, y = hf(x) + 1.6;
      sb(x, y, zm, rw + 0.2, 2.6, zb - za, r % 2 ? ROOF : ROOF2);
      if (edgeS) sb(x, y - 1.6, za + 0.7, rw, 1.4, 1.4, TRIM);
      if (edgeN) sb(x, y - 1.6, zb - 0.7, rw, 1.4, 1.4, TRIM);
    }
  };
  sb(POLE.x, POLE.h / 2, POLE.z, 3.2, POLE.h, 3.2, WOOD);
  for (let y = 5; y < POLE.h - 2; y += 6) sb(POLE.x, y, POLE.z, 3.7, 1.4, 3.7, 0xd9c28f);
  panel(SH.x0 - 4, SH.x1 + 8, SH.z0 - 5, SH.z1 + 5, hAt, true, true);
  sb(SH.x1 + 6, hAt(SH.x1) + 1, (SH.z0 + SH.z1) / 2, 1.6, 4, SH.z1 - SH.z0 + 10, TRIM);   // front lip
}
const shMat = new THREE.MeshLambertMaterial();
shMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, cutU);
  sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 wp4 = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  wp4 = instanceMatrix * wp4;\n  #endif\n  vWP = (modelMatrix * wp4).xyz;');
  sh.fragmentShader = 'varying vec3 vWP;\nuniform vec3 uFocus;\nuniform vec3 uCam;\nuniform float uRoof;\nuniform float uCutOn;\n' + sh.fragmentShader.replace('void main() {', `void main() {
    vec3 ab = uCam - uFocus; float t = clamp(dot(vWP - uFocus, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(vWP - (uFocus + ab * t)); float r = mix(26.0, 54.0, t);
    float n = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
    if (uCutOn > 0.5 && t > 0.03 && vWP.y > uFocus.y + 8.0 && d < r) {
      if (n < smoothstep(r, r * 0.45, d)) discard;
    }
    // looking at someone under the shelter from above: the roof thins to a faint lattice
    if (uRoof > 0.0 && vWP.y > 25.0 && n < uRoof * 0.86) discard;`);
};
const shelterMesh = buildBoxes(shBoxes, shMat); scene.add(freeze(shelterMesh));
// a lantern under the shelter roof that glows warm after dark
export const lantern = new THREE.PointLight(0xffc27a, 0, 95, 1.6);
lantern.position.set(-73, 17, 0); scene.add(lantern);
export const lanternMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, emissive: 0xffc27a, emissiveIntensity: 0 });
{ const g = new THREE.Group(); const glass = new THREE.Mesh(UNIT, lanternMat); glass.scale.set(2.6, 3.4, 2.6); g.add(glass);
  const cap = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: 0x2a2420 })); cap.scale.set(3.2, 0.7, 3.2); cap.position.y = 2; g.add(cap);
  const cord = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: 0x2a2420 })); cord.scale.set(0.3, 6, 0.3); cord.position.y = 5.3; g.add(cord);
  g.position.set(-73, 22, 0); scene.add(g); g.traverse(o => freeze(o)); }
export const ballMesh = buildBoxes(ballBoxes, boxMat); ballMesh.position.set(BALL.x, BALL_R, BALL.z); scene.add(ballMesh);

// clouds
export const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x58616e});
export const clouds: THREE.Group[] = [];
for (let i = 0; i < 14; i++) {
  const parts = [[0, 0, 0, rr(36, 52), rr(10, 14), rr(24, 32), 0xffffff]];
  for (let k = 0; k < 7 + Math.floor(rand() * 7); k++) parts.push([rr(-32, 32), rr(-2, 7), rr(-15, 15), rr(14, 26), rr(7, 12), rr(12, 22), 0xffffff]);
  const m = buildBoxes(parts, cloudMat, true); m.receiveShadow = false;
  const g = new THREE.Group(); g.add(m);
  g.position.set(rr(-1200, 1200), rr(330, 460), rr(-900, 900));
  g.userData.v = rr(5, 10);
  scene.add(g); clouds.push(g);
}

// butterflies
export const butterflies: any[] = [];
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group();
  const wmat = new THREE.MeshLambertMaterial({ color: [0xffd166, 0xf5a3c7, 0x9fd3ff, 0xfdfbf2, 0xc7a6ff][i % 5], side: THREE.DoubleSide });
  const body = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: 0x3a3330 })); body.scale.set(1.2, 0.3, 0.3); g.add(body);
  const gl = new THREE.PlaneGeometry(1.3, 1.1); gl.rotateX(-Math.PI / 2); gl.translate(0, 0, 0.65);
  const gr = gl.clone(); gr.translate(0, 0, -1.3);
  const wl = new THREE.Mesh(gl, wmat), wr = new THREE.Mesh(gr, wmat); g.add(wl, wr);
  const home = i < 6 ? new THREE.Vector3(FIELD.i * B, 0, FIELD.j * B) : new THREE.Vector3(0, 0, 0);
  const p = home.clone().add(new THREE.Vector3(rr(-60, 60), rr(8, 22), rr(-60, 60)));
  g.position.copy(p); scene.add(g);
  butterflies.push({ g, wl, wr, home, vel: new THREE.Vector3(), tgt: p.clone(), ph: rr(0, 6), t: 0 });
}
// petals
const PET_N = 46;
export const petalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0xf6b9cb, side: THREE.DoubleSide }), PET_N);
petalMesh.frustumCulled = false; scene.add(petalMesh);
export const petals: any[] = [];
export function spawnPetal(p: any, initial: boolean) {
  p.x = CHERRY.x + rr(-24, 24); p.z = CHERRY.z + rr(-24, 24); p.y = initial ? rr(2, CHERRY.y + 10) : CHERRY.y + rr(-6, 10);
  p.vy = rr(3.5, 6.5); p.sw = rr(0.6, 1.4); p.ph = rr(0, 6); p.rx = rr(0, 6); p.rz = rr(0, 6); p.spin = rr(1, 3);
}
for (let i = 0; i < PET_N; i++) { const p = {}; spawnPetal(p, true); petals.push(p); }
export const groundTop = (x, z) => { const c = colXZ(x, z); return c ? (c.wl !== null ? c.wl : c.top * B) : -50; };
// fireflies
export const fireU = { uTime: { value: 0 }, uOp: { value: 0 }, uDpr: { value: DPR } };
{
  const n = 170, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = rr(0, 6.283), d = Math.sqrt(rand()) * 300, x = Math.cos(a) * d, z = Math.sin(a) * d; pos[i * 3] = x; pos[i * 3 + 1] = Math.max(0, groundTop(x, z)) + rr(4, 34); pos[i * 3 + 2] = z; seed[i] = rand(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uDpr; varying float vA; void main(){ vec3 p = position; p.x += sin(uTime * 0.35 + aSeed * 20.0) * 9.0; p.y += sin(uTime * 0.5 + aSeed * 13.0) * 4.0; p.z += cos(uTime * 0.3 + aSeed * 17.0) * 9.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uDpr * (9.0 + aSeed * 6.0) * (260.0 / -mv.z); vA = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 1.5) + aSeed * 30.0), 3.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOp; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(1.0, 0.88, 0.45, a * a * vA * uOp); }',
  }));
  pts.frustumCulled = false; scene.add(pts);
}
