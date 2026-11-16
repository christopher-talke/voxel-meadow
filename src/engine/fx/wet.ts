import * as THREE from 'three';
import { seeded } from '../core/util';
import { scene } from '../render/stage';

// ================= wet fur and the damp it leaves behind =================
// Real wet fur darkens and deepens in colour rather than changing hue, soaks the legs and belly first and dries
// from the top down, and hangs in clumps. All of that happens in the animal's own material, so it costs nothing on the CPU.

export interface WetUniforms { uWet: { value: number }; uRootY: { value: number }; uHeight: { value: number } }

/** Patch an animal's voxel material for wetness. `height` is the animal's standing height in world units. */
export function wetFur(mat: THREE.MeshLambertMaterial, height: number): WetUniforms {
  const u: WetUniforms = { uWet: { value: 0 }, uRootY: { value: 0 }, uHeight: { value: height } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uWet, uRootY, uHeight;\nvarying float vWetH;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        // each voxel gets a stable hash from where it sits in the rig, so clumps stay put as the animal moves
        vec3 cellP = instanceMatrix[3].xyz;
        float hv = fract(sin(dot(cellP, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h01 = clamp((wp0.y - uRootY) / uHeight, 0.0, 1.0);
        float wl = smoothstep(h01 - 0.18, h01 + 0.18, uWet * 1.25 - 0.1);
        // wet fur hangs: voxels sag a little, unevenly, so the coat looks matted rather than fluffy.
        // Only a sag, never a shrink, so neighbouring voxels never open a gap.
        transformed.y -= wl * (0.06 + 0.22 * hv);
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpW = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wpW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vWetH = clamp((wpW.y - uRootY) / uHeight, 0.0, 1.0);`);
    sh.fragmentShader = 'uniform float uWet;\nvarying float vWetH;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // soaked from the bottom up: legs and belly first, the back and head last; drying runs the other way
          float w = smoothstep(vWetH - 0.18, vWetH + 0.18, uWet * 1.25 - 0.1) * smoothstep(0.0, 0.08, uWet);
          // darker and richer, never bluer: raise to a power (deepens saturation) and dim evenly across channels
          diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.0 + 0.45 * w)) * (1.0 - 0.32 * w);
        }`);
  };
  mat.needsUpdate = true;
  return u;
}

// damp patches: a dripping animal leaves a few soft dark marks on the ground that fade as they dry
const R = seeded(9127);
const MARK_N = 48;
const markGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const marks: { m: THREE.Mesh; t: number; life: number; a: number }[] = [];
for (let i = 0; i < MARK_N; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x2b2416, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(markGeo, mat); m.visible = false; m.renderOrder = 1; scene.add(m);
  marks.push({ m, t: 1, life: 1, a: 0 });
}
let nextMark = 0;
/** Leave a damp mark at a ground point. `amount` is how wet the animal is (0 to 1). */
export function dampMark(x: number, y: number, z: number, amount: number) {
  const k = marks[nextMark]; nextMark = (nextMark + 1) % MARK_N;
  k.m.position.set(x + R.rr(-2.5, 2.5), y + 0.06, z + R.rr(-2.5, 2.5));
  k.m.scale.setScalar(R.rr(2.2, 4.2) * (0.6 + 0.4 * amount)); k.m.rotation.y = R.rr(0, 6.28);
  k.t = 0; k.life = R.rr(18, 30); k.a = 0.16 * amount; k.m.visible = true;
}
export function updateWetMarks(dt: number) {
  for (const k of marks) {
    if (!k.m.visible) continue;
    k.t += dt / k.life;
    if (k.t >= 1) { k.m.visible = false; continue; }
    (k.m.material as THREE.MeshBasicMaterial).opacity = k.a * Math.min(1, k.t * 8) * (1 - k.t);
  }
}
/** The seeded stream damp marks use, so callers can time them without touching the shared one. */
export const wetRand = R.rand;
