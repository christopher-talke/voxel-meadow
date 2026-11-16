import * as THREE from 'three';
import { scene } from './stage';

// ================= cloud decks: soft, endless layers of cloud seen from above =================
// A huge plane with procedural noise (no texture, so no tiling seams), fogged like everything else, thinning out
// towards the edge of the world. Colours are pushed in each frame from the sky so decks follow the time of day.

export interface CloudDeckOptions {
  /** Height of the deck, world units. */
  y: number;
  /** Noise scale: world units per cloud cell (bigger is puffier). */
  cell?: number;
  /** Peak opacity, 0 to 1. */
  opacity?: number;
  /** Drift speed in world units per second, along +x. */
  speed?: number;
  /** How much of the sky the deck covers, 0 (wisps) to 1 (overcast). */
  cover?: number;
  seed?: number;
  /** Radius past which the deck thins away, world units. */
  radius?: number;
}
export const deckU = {
  uTime: { value: 0 },
  uLit: { value: new THREE.Color(1, 1, 1) },
  uShade: { value: new THREE.Color(0.7, 0.75, 0.85) },
};
const decks: THREE.Mesh[] = [];
export function addCloudDeck(o: CloudDeckOptions) {
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const R = o.radius ?? 7000;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCell: { value: o.cell ?? 420 }, uOp: { value: o.opacity ?? 0.85 }, uSpeed: { value: o.speed ?? 6 },
      uCover: { value: o.cover ?? 0.55 }, uSeed: { value: o.seed ?? 0 }, uR: { value: R },
    }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uCell, uOp, uSpeed, uCover, uSeed, uR; uniform vec3 uLit, uShade; varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)) + uSeed) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){
        vec2 p = (vW.xz + vec2(uTime * uSpeed, uTime * uSpeed * 0.3)) / uCell;
        float n = fbm(p), d = fbm(p * 2.7 + 3.1);
        float dens = smoothstep(1.0 - uCover - 0.18, 1.0 - uCover + 0.22, n);
        float edge = 1.0 - smoothstep(uR * 0.55, uR, length(vW.xz - cameraPosition.xz));
        float a = dens * uOp * edge;
        if (a < 0.004) discard;
        // tops catch the light, the hollows between puffs sit in shade
        gl_FragColor = vec4(mix(uShade, uLit, smoothstep(0.35, 0.8, d * 0.6 + dens * 0.5)), a);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, deckU);   // shared: time and colours are set once a frame for every deck
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(R, 1, R); m.position.y = o.y; m.frustumCulled = false; m.renderOrder = -1;
  scene.add(m); decks.push(m);
  return m;
}
/** Advance drift and set the lit and shaded cloud colours. */
export function updateCloudDecks(t: number, lit: THREE.Color, shade: THREE.Color, camX = 0, camZ = 0) {
  deckU.uTime.value = t; deckU.uLit.value.copy(lit); deckU.uShade.value.copy(shade);
  // decks travel with the camera so the world never runs out, while the noise stays pinned in world space
  for (const m of decks) { m.position.x = camX; m.position.z = camZ; }
}
