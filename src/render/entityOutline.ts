import * as THREE from 'three';
import { isSmoothToonRenderer, onSmoothToonRendererChange } from './renderFlags';

const OUTLINE_COLOR = new THREE.Color(0x1e1a1d);
const outlineMap = new WeakMap<THREE.Object3D, THREE.Object3D>();
const outlineSet = new WeakSet<THREE.Object3D>();

export function makeOutlineMaterial(thickness = 0.04) {
  const mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, depthWrite: true, depthTest: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uOutlineThickness = { value: thickness };
    sh.uniforms.uOutlineOn = { value: isSmoothToonRenderer() ? 1 : 0 };
    onSmoothToonRendererChange(v => (sh.uniforms.uOutlineOn.value = v ? 1 : 0));
    sh.vertexShader =
      'uniform float uOutlineThickness;\nuniform float uOutlineOn;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        if (uOutlineOn > 0.5) {
          vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
          float distScale = clamp((-mv.z) / 700.0, 0.4, 2.0);
          transformed += normal * (uOutlineThickness * distScale);
        }
        `,
      );
    sh.fragmentShader =
      'uniform float uOutlineOn;\n' +
      sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        if (uOutlineOn < 0.5) discard;
        #include <dithering_fragment>
        `,
      );
  };
  return mat;
}

export function attachEntityOutline<T extends THREE.Mesh | THREE.InstancedMesh>(src: T, thickness = 0.04): T {
  if (outlineSet.has(src)) return src;
  const existing = outlineMap.get(src) as T | undefined;
  if (existing) return existing;
  const mat = makeOutlineMaterial(thickness);
  const ol = (src as THREE.InstancedMesh).isInstancedMesh
    ? (new THREE.InstancedMesh((src as THREE.InstancedMesh).geometry, mat, (src as THREE.InstancedMesh).count) as T)
    : (new THREE.Mesh((src as THREE.Mesh).geometry, mat) as T);
  ol.renderOrder = src.renderOrder - 0.01;
  ol.frustumCulled = src.frustumCulled;
  ol.castShadow = false;
  ol.receiveShadow = false;
  outlineSet.add(ol);
  outlineMap.set(src, ol);
  if ((src as THREE.InstancedMesh).isInstancedMesh && (ol as THREE.InstancedMesh).isInstancedMesh) {
    syncInstancedOutline(src as THREE.InstancedMesh, ol as THREE.InstancedMesh);
  }
  src.add(ol as any);
  return ol;
}

export function syncInstancedOutline(src: THREE.InstancedMesh, outline: THREE.InstancedMesh) {
  outline.count = src.count;
  outline.instanceMatrix.copy(src.instanceMatrix);
  outline.instanceMatrix.needsUpdate = true;
  if (src.instanceColor && outline.instanceColor) {
    outline.instanceColor.copy(src.instanceColor);
    outline.instanceColor.needsUpdate = true;
  }
}
