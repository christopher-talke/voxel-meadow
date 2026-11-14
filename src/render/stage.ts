import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { state } from '../core/state';
import { $, rand, rr } from '../core/util';

// ================= renderer, scene, camera =================
export const stage = $('stage');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
export const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const fog = new THREE.Fog(0xcfe9f3, 950, 2900);
scene.fog = fog;
   // pushes the fog back while the whole island is in view
export const camera = new THREE.PerspectiveCamera(38, 1, 1, 7000);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = true; controls.screenSpacePanning = false; controls.panSpeed = 0.8;
controls.minDistance = 22; controls.maxDistance = 1150;
controls.maxPolarAngle = Math.PI * 0.62;
controls.autoRotate = false; controls.autoRotateSpeed = 0.25;
export const COARSE = matchMedia('(pointer: coarse)').matches;
if (COARSE) { controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.9; controls.dampingFactor = 0.16; controls.panSpeed = 0.9; }
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };


export const hemi = new THREE.HemisphereLight(0xe4f3ff, 0x7f9a62, 0.62);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff3df, 0.95);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 1700 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

export const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, uTw: { value: 0 }, uDisc: { value: 1 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uGlow: { value: 0 } };
export const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 bot; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uGlow; uniform float uTw; uniform float uDisc; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = h > 0.0 ? (h < 0.16 ? mix(hor, mid, smoothstep(0.0, 0.16, h)) : mix(mid, top, pow(clamp((h - 0.16) * 1.3, 0.0, 1.0), 0.6))) : mix(hor, bot, clamp(-h * 3.0, 0.0, 1.0));
      // the side of the sky with the sun burns pink and peach; the far side cools to lavender
      vec2 sh = normalize(uSun.xz + vec2(1e-4)), dh = normalize(d.xz + vec2(1e-4)); float side = dot(sh, dh) * 0.5 + 0.5;
      float band = (1.0 - smoothstep(0.0, 0.5, abs(h))) * uTw;
      c = mix(c, c * vec3(0.78, 0.8, 1.02), (1.0 - side) * band * 0.55);
      c += hor * pow(side, 3.0) * band * 0.12;
      float s = max(dot(d, uSun), 0.0);
      c += uSunCol * uGlow * (pow(s, 6.0) * 0.12 * (1.0 - clamp(abs(h) * 1.6, 0.0, 1.0)) + pow(s, 1400.0) * 0.18);
      // the sun itself: a hard-edged disc, pale and bright, a little warmer near the horizon
      float cosR = 0.99935;
      float ds = dot(d, uSun), disc = smoothstep(cosR - 0.00004, cosR + 0.00004, ds) * uDisc;
      float rim = smoothstep(cosR - 0.0006, cosR - 0.00005, ds) * (1.0 - disc) * uDisc * uTw;
      c *= 1.0 - 0.1 * rim;
      vec3 sc = mix(vec3(1.0, 0.99, 0.94), vec3(1.0, 0.97, 0.86), uTw);
      c = mix(c, sc, disc);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -2;
scene.add(sky);
export const starU = { uOp: { value: 0 }, uTime: { value: 0 }, uDpr: { value: DPR } };
{
  const n = 600, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = rr(0.06, 1), a = rr(0, Math.PI * 2), r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 3000; pos[i * 3 + 1] = y * 3000; pos[i * 3 + 2] = Math.sin(a) * r * 3000; seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uDpr; varying float vA; void main(){ vA = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0); gl_PointSize = (1.3 + aSeed * 2.2) * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOp; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.97, 0.9, uOp * vA * smoothstep(0.5, 0.0, d)); }',
  }));
  stars.renderOrder = -1; stars.frustumCulled = false;
  sky.add(stars);
}

export const focus = new THREE.Vector3(0, 14, 0);
