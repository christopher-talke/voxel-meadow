import * as THREE from 'three';
import { V2, clamp, noise, reduceMotion, seeded, smooth } from '../core/util';
import { DPR, camera, hemi, scene, sun } from '../render/stage';
import { B, G, JETTY, LAKE, SPILL, WATER_Y, colAt, colXZ, idxOf } from './layout';
import { UNIT, waterMat } from './mesh';
import { dropTex, puff } from '../fx/sprites';

// ================= the pond: a waterfall off the island edge, and lily pads =================
const { rand, rr } = seeded(7310);
const jit = (hex: number, amt: number) => { const f = 1 + (rand() - 0.5) * 2 * amt; return new THREE.Color(hex).multiplyScalar(f).getHex(); };

// ---- waterfall: a thick, lumpy column of water that tips over the lip and drops into the haze ----
// Everything follows one ballistic path keyed by "age" (seconds since the water left the lip), so the texture,
// the lumps and the tumbling chunks all travel downhill together at a real falling speed and never run backwards.
const FALL_D = 680, FALL_G = 120, FALL_VX = 14, AGE_MAX = Math.sqrt(2 * FALL_D / FALL_G), AGE_MIN = -0.45;
const PX = -SPILL.nz, PZ = SPILL.nx;   // across the fall
/** Centre of the fall at a given age: on the water before the lip (age < 0), then a ballistic arc. */
function fallAt(age: number, out: THREE.Vector3) {
  const run = 1 + FALL_VX * age, drop = age > 0 ? 0.5 * FALL_G * age * age : 0;
  return out.set(SPILL.x + SPILL.nx * run, SPILL.y + 0.3 - drop, SPILL.z + SPILL.nz * run);
}
const fallHW = (age: number) => SPILL.w * 0.5 * (0.92 + 0.5 * clamp(age / AGE_MAX, 0, 1));    // spreads as it falls
const fallTH = (age: number) => age < 0 ? 0.7 + 0.5 * (1 + age / -AGE_MIN) : 1.2 + 6 * Math.sqrt(age / AGE_MAX);   // and thickens
export let fallMesh: THREE.Mesh, mistPts: THREE.Points;
export const fallU = { uTime: { value: 0 }, uCol: { value: new THREE.Color(0x5fb3d9) }, uWhite: { value: new THREE.Color(1, 1, 1) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSpeed: { value: reduceMotion ? 0.25 : 1 } };
const GLSL_NOISE = `float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;
{
  const ROWS = 72, RING = 18, pos: number[] = [], nrm: number[] = [], age: number[] = [], ang: number[] = [], idx: number[] = [];
  const C = new THREE.Vector3(), Ca = new THREE.Vector3(), Cb = new THREE.Vector3(), T = new THREE.Vector3(), P = new THREE.Vector3(PX, 0, PZ), Nn = new THREE.Vector3(), q = new THREE.Vector3();
  for (let r = 0; r <= ROWS; r++) {
    const a = AGE_MIN + (AGE_MAX - AGE_MIN) * Math.pow(r / ROWS, 1.35);   // rows bunch up near the lip where the shape changes fastest
    fallAt(a, C); fallAt(a - 0.01, Ca); fallAt(a + 0.01, Cb); T.subVectors(Cb, Ca).normalize();
    Nn.crossVectors(P, T).normalize();   // up on the water, outward once falling
    const hw = fallHW(a), th = fallTH(a);
    for (let j = 0; j <= RING; j++) {
      const th0 = j / RING * Math.PI * 2, c = Math.cos(th0), sn = Math.sin(th0);
      // a lumpy, uneven cross-section: fixed bulges that vary along the length so the outline is ragged
      const rough = a < 0 ? 0.08 : 0.32 * Math.min(1, a * 1.5);
      const k = 1 + rough * (noise(j % RING * 0.9 + 3, r * 0.35, 21) - 0.5) * 2;
      q.copy(C).addScaledVector(P, c * hw * k).addScaledVector(Nn, sn * th * k);
      pos.push(q.x, q.y, q.z);
      const n = q.set(0, 0, 0).addScaledVector(P, c / hw).addScaledVector(Nn, sn / th).normalize();
      nrm.push(n.x, n.y, n.z); age.push(a); ang.push(j / RING);
      if (r < ROWS && j < RING) { const v = r * (RING + 1) + j, w = v + RING + 1; idx.push(v, w, v + 1, v + 1, w, w + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aAge', new THREE.Float32BufferAttribute(age, 1));
  g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), fallU), transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute float aAge; attribute float aAng; uniform float uTime; uniform float uSpeed; varying float vAge; varying float vAng; varying vec3 vN;
      ${GLSL_NOISE}
      #include <fog_pars_vertex>
      void main(){
        vAge = aAge; vAng = aAng; vN = normal;
        // lumps of water roll down the column: the pattern is a function of (age - time), so it only ever moves downhill
        float flow = aAge - uTime * uSpeed;
        float lump = vn(vec2(aAng * 7.0, flow * 3.2)) * 0.65 + vn(vec2(aAng * 15.0, flow * 7.0)) * 0.35 - 0.5;
        float amt = aAge < 0.0 ? 0.25 : 0.8 + 3.2 * clamp(aAge / ${AGE_MAX.toFixed(3)}, 0.0, 1.0);
        vec3 p = position + normal * lump * amt;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uSpeed; uniform vec3 uCol; uniform vec3 uWhite; uniform vec3 uSun; varying float vAge; varying float vAng; varying vec3 vN;
      ${GLSL_NOISE}
      #include <fog_pars_fragment>
      void main(){
        float flow = vAge - uTime * uSpeed;
        float s = vn(vec2(vAng * 26.0, flow * 4.0)) * 0.55 + vn(vec2(vAng * 61.0, flow * 11.0)) * 0.3 + vn(vec2(vAng * 9.0, flow * 1.6)) * 0.15;
        float aer = vAge < 0.0 ? 0.25 : 0.45 + 0.5 * clamp(vAge / 1.1, 0.0, 1.0);   // more broken and white the further it falls
        float white = smoothstep(0.62 - aer * 0.4, 0.9 - aer * 0.3, s);
        float lip = smoothstep(-0.25, 0.0, vAge) * (1.0 - smoothstep(0.0, 0.35, vAge));   // churn where it tips over
        float lit = 0.62 + 0.38 * max(dot(normalize(vN), uSun), 0.0);
        vec3 c = mix(uCol, uWhite, clamp(white * 0.85 + lip * 0.7, 0.0, 1.0)) * lit;
        float fade = 1.0 - smoothstep(${(AGE_MAX * 0.6).toFixed(3)}, ${AGE_MAX.toFixed(3)}, vAge);
        gl_FragColor = vec4(c, (0.78 + 0.2 * white) * fade);
        #include <fog_fragment>
      }`,
  });
  fallMesh = new THREE.Mesh(g, mat); fallMesh.renderOrder = 1; fallMesh.frustumCulled = false; fallMesh.matrixAutoUpdate = false; scene.add(fallMesh);
}
// chunks of white water tumbling down through and around the column, voxel-style, for a broken, rough edge
const CHUNKS = 340;
const chunkMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
const chunkMesh = new THREE.InstancedMesh(UNIT, chunkMat, CHUNKS);
chunkMesh.frustumCulled = false; chunkMesh.renderOrder = 2; scene.add(chunkMesh);
const chunks: any[] = [];
{
  const c = new THREE.Color(), cols = [0xffffff, 0xf2f8ff, 0xe1effa, 0xc6e3f3, 0x9fd0ea];
  for (let i = 0; i < CHUNKS; i++) {
    const ch = { age: rr(0, AGE_MAX), vx: rr(-3, 3), vy: rr(-1, 5), side: rr(-1.1, 1.1), out: rr(-1, 1), size: rr(1.2, 3.4), ax: rr(0, 6), ay: rr(0, 6), spin: rr(1.5, 5) };
    chunks.push(ch); chunkMesh.setColorAt(i, c.setHex(cols[Math.floor(rand() * cols.length)]));
  }
}
const _cp = new THREE.Vector3(), _co = new THREE.Object3D();
function updateChunks(dt: number) {
  const sp = fallU.uSpeed.value;
  for (let i = 0; i < CHUNKS; i++) {
    const ch = chunks[i];
    ch.age += dt * sp;
    if (ch.age > AGE_MAX) { ch.age -= AGE_MAX; ch.vy = rr(-1, 5); ch.vx = rr(-3, 3); ch.side = rr(-1.1, 1.1); ch.out = rr(-1, 1); }
    const a = ch.age, k = a / AGE_MAX;
    fallAt(a, _cp);
    // its own little ballistic offset from the column: a kick up at the lip, drifting sideways and out
    _cp.x += SPILL.nx * ch.vx * a + PX * (ch.side * fallHW(a) + ch.side * 4 * a);
    _cp.z += SPILL.nz * ch.vx * a + PZ * (ch.side * fallHW(a) + ch.side * 4 * a);
    _cp.y += ch.vy * a;
    _cp.x += SPILL.nx * ch.out * fallTH(a); _cp.z += SPILL.nz * ch.out * fallTH(a);
    const s = ch.size * (0.6 + 0.6 * Math.min(1, a * 2)) * (1 - smooth(0.62, 1, k));
    _co.position.copy(_cp); _co.rotation.set(ch.ax + a * ch.spin, ch.ay + a * ch.spin * 0.7, 0); _co.scale.setScalar(Math.max(0.001, s)); _co.updateMatrix();
    chunkMesh.setMatrixAt(i, _co.matrix);
  }
  chunkMesh.instanceMatrix.needsUpdate = true;
}
// mist drifting down the falls
export const mistU = { uTime: fallU.uTime, uDpr: { value: DPR }, uCol: { value: new THREE.Color(1, 1, 1) } };
{
  const n = 140, seed = new Float32Array(n), side = new Float32Array(n), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i] = rand(); side[i] = rr(-1, 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  const sp = `vec3(${SPILL.x.toFixed(2)}, ${SPILL.y.toFixed(2)}, ${SPILL.z.toFixed(2)})`, nd = `vec2(${SPILL.nx.toFixed(4)}, ${SPILL.nz.toFixed(4)})`;
  const pts = mistPts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aSeed; attribute float aSide; uniform float uTime; uniform float uDpr; varying float vA;
      void main(){
        float k = fract(aSeed * 7.31 + uTime * (0.025 + aSeed * 0.02));
        float age = k * ${AGE_MAX.toFixed(3)};   // same path as the water, but drifting down slowly like spray in the air
        float drop = 0.5 * ${FALL_G.toFixed(1)} * age * age;
        float run = 1.0 + ${FALL_VX.toFixed(1)} * age + 4.0 + aSeed * 12.0;
        vec2 n = ${nd}; vec2 pp = vec2(-n.y, n.x);
        float w = ${(SPILL.w * 0.5).toFixed(2)} * (1.0 + 0.9 * k) * aSide;
        vec3 p = ${sp} + vec3(n.x * run + pp.x * w, -drop + sin(uTime * 0.7 + aSeed * 40.0) * 2.0, n.y * run + pp.y * w);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uDpr * (14.0 + 30.0 * k) * (260.0 / max(1.0, -mv.z));
        vA = sin(k * 3.14159) * 0.32;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uCol, vA * smoothstep(0.5, 0.0, d)); }',
  }));
  pts.frustumCulled = false; scene.add(pts);
}

// ---- lily pads: a hopping line from the jetty to the east bank, plus a few loose clusters ----
export interface Pad { x: number; z: number; r: number; y: number; load: number; tilt: number; tiltA: number; ph: number; idx: number; flower: boolean; claim: any; frog: any; }
export const PADS: Pad[] = [];
export const PAD_CHAIN: Pad[] = [];
const padWater = (x, z) => { const c = colXZ(x, z); return !!c && (c.type === 'deep' || c.type === 'shallow') && !c.jetty; };
const mkPad = (x, z, r, flower): Pad => { const p = { x, z, r, y: WATER_Y + 0.2, load: 0, tilt: 0, tiltA: rr(0, 6.283), ph: rr(0, 6.283), idx: -1, flower, claim: null, frog: null }; PADS.push(p); return p; };
/** Where a cat stands to start the hop: the tip of the jetty. */
export const PAD_START = V2(JETTY.i1 * B - 1, (JETTY.j0 + JETTY.j1) / 2 * B);
export let PAD_END = V2(0, 0);
{
  let x = PAD_START.x, z = PAD_START.y, k = 0;
  for (; k < 16; k++) {
    const nx = x + rr(9, 10.5), nz = PAD_START.y + (k % 2 ? 1 : -1) * rr(2.5, 4.5);
    if (!padWater(nx, nz) || !padWater(nx + 4, nz)) break;
    const p = mkPad(nx, nz, k % 3 === 2 ? rr(2.6, 2.9) : rr(3.3, 3.8), false); p.idx = PAD_CHAIN.length; PAD_CHAIN.push(p); x = nx; z = nz;
  }
  // the landing on the far bank: the nearest dry, walkable sand or grass ahead of the last pad
  let best: any = null, bd = 1e9;
  for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
    const i = Math.round(x / B) + a, j = Math.round(z / B) + b, c = colAt(i, j);
    if (!c || !(c.type === 'sand' || c.type === 'grass') || c.jetty || c.edge || !G.walk[idxOf(i, j)] || i * B < x) continue;
    const d = Math.hypot(i * B - x, j * B - z); if (d < bd) { bd = d; best = V2(i * B, j * B); }
  }
  PAD_END = best || V2(x + 10, z);
  // loose clusters elsewhere on the pond, kept clear of the hopping line
  for (let n = 0, placed = 0; n < 200 && placed < 9; n++) {
    const a = rr(0, 6.283), d = rr(4, 17), px = (LAKE.i + Math.cos(a) * d) * B, pz = (LAKE.j + Math.sin(a) * d) * B;
    if (!padWater(px, pz) || PADS.some(p => Math.hypot(p.x - px, p.z - pz) < (p.idx >= 0 ? 14 : 8))) continue;
    mkPad(px, pz, rr(2.8, 3.9), rand() < 0.45); placed++;
  }
}
/** Height of a pad's top surface, where a cat or frog stands. */
export const padY = (p: Pad) => p.y + 0.2;
export const nearestPadIdx = (x, z) => { let best = -1, bd = 1e9; for (const p of PAD_CHAIN) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.idx; } } return best; };

const PAD_PARTS = 4;   // two crossed slabs make an octagon, then a flower bud and its centre
const padMat = new THREE.MeshLambertMaterial();
const padMesh = new THREE.InstancedMesh(UNIT, padMat, PADS.length * PAD_PARTS);
padMesh.receiveShadow = true; padMesh.frustumCulled = false; scene.add(padMesh);
const _o = new THREE.Object3D(), _c = new THREE.Color(), _v = new THREE.Vector3();
PADS.forEach((p, i) => {
  const g = jit(0x6fae4f, 0.06);
  padMesh.setColorAt(i * PAD_PARTS, _c.setHex(g)); padMesh.setColorAt(i * PAD_PARTS + 1, _c.setHex(g));
  padMesh.setColorAt(i * PAD_PARTS + 2, _c.setHex(0xf4a6c0)); padMesh.setColorAt(i * PAD_PARTS + 3, _c.setHex(0xffe08a));
});
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function updatePond(dt, t) {
  fallU.uTime.value = t;
  const light = clamp(hemi.intensity * 0.85 + sun.intensity * 0.45, 0.28, 1.15);
  fallU.uCol.value.copy(waterMat.color).multiplyScalar(light * 1.05);
  fallU.uWhite.value.setRGB(0.93, 0.96, 1).multiplyScalar(clamp(light * 1.05, 0.3, 1.1));
  fallU.uSun.value.copy(sun.position).sub(sun.target.position).normalize();
  updateChunks(dt);
  mistU.uCol.value.setScalar(clamp(light * 0.95, 0.3, 1));
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    p.tilt *= Math.exp(-2.2 * dt);
    p.y = WATER_Y + 0.2 + Math.sin(t * 1.1 + p.ph) * 0.12 - p.load * 0.45;
    const rx = Math.cos(p.tiltA) * p.tilt, rz = Math.sin(p.tiltA) * p.tilt;
    for (let k = 0; k < PAD_PARTS; k++) {
      if (k >= 2 && !p.flower) { padMesh.setMatrixAt(i * PAD_PARTS + k, ZERO); continue; }
      const d = p.r * 2;
      if (k === 0) { _o.position.set(p.x, p.y, p.z); _o.rotation.set(rx, p.ph, rz); _o.scale.set(d, 0.35, d * 0.82); }
      else if (k === 1) { _o.position.set(p.x, p.y, p.z); _o.rotation.set(rx, p.ph + 0.785, rz); _o.scale.set(d * 0.86, 0.33, d * 0.7); }
      else if (k === 2) { _o.position.set(p.x + 0.8, p.y + 0.7, p.z - 0.4); _o.rotation.set(0, p.ph, 0); _o.scale.set(1.6, 1.0, 1.6); }
      else { _o.position.set(p.x + 0.8, p.y + 1.25, p.z - 0.4); _o.rotation.set(0, p.ph, 0); _o.scale.set(0.6, 0.3, 0.6); }
      _o.updateMatrix(); padMesh.setMatrixAt(i * PAD_PARTS + k, _o.matrix);
    }
  }
  padMesh.instanceMatrix.needsUpdate = true;
  // spray off the lip when someone is close enough to see it
  if (!reduceMotion && rand() < dt * 5 && camera.position.distanceTo(_v.set(SPILL.x, SPILL.y, SPILL.z)) < 420) {
    const s = rr(-0.5, 0.5) * SPILL.w;
    puff(dropTex, _v.set(SPILL.x - SPILL.nz * s + SPILL.nx * 2, SPILL.y + 0.8, SPILL.z + SPILL.nx * s + SPILL.nz * 2), rr(0.8, 1.6), 0.9, rr(3, 7), 0, SPILL.nx * rr(6, 12), SPILL.nz * rr(6, 12), 14);
  }
}
