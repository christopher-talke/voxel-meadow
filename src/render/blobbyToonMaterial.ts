import * as THREE from 'three';
import { onSmoothToonRendererChange, isSmoothToonRenderer } from './renderFlags';
import { sun } from './stage';

export interface BlobbyToonOptions {
  top?: THREE.ColorRepresentation;
  bottom?: THREE.ColorRepresentation;
  bands?: [number, number];
  gloss?: number;
  rim?: number;
  ambient?: number;
}

const toonUniforms = new Set<{ value: number }>();
onSmoothToonRendererChange(enabled => {
  const v = enabled ? 1 : 0;
  toonUniforms.forEach(u => (u.value = v));
});

const _lightDir = new THREE.Vector3();
function sunDir() {
  _lightDir.copy(sun.position).normalize();
  return _lightDir;
}

function setColor(c: THREE.ColorRepresentation | undefined, fallback: number) {
  return new THREE.Color(c === undefined ? fallback : c);
}

export function applyBlobbyToonMaterial(mat: THREE.Material, opts: BlobbyToonOptions = {}) {
  const m = mat as THREE.Material & { userData: Record<string, any>; onBeforeCompile: (shader: THREE.Shader) => void };
  if (m.userData && m.userData.blobbyToonPatched) return mat;
  m.userData = m.userData || {};
  m.userData.blobbyToonPatched = true;

  const base = m.onBeforeCompile?.bind(m);
  m.onBeforeCompile = shader => {
    if (base) base(shader);
    shader.uniforms.uToonEnable = { value: isSmoothToonRenderer() ? 1 : 0 };
    shader.uniforms.uColorTop = { value: setColor(opts.top, 0xf6e5db) };
    shader.uniforms.uColorBottom = { value: setColor(opts.bottom, 0xd7c6b8) };
    shader.uniforms.uToonBands = { value: new THREE.Vector2(opts.bands ? opts.bands[0] : 0.36, opts.bands ? opts.bands[1] : 0.72) };
    shader.uniforms.uToonGloss = { value: opts.gloss === undefined ? 0.2 : opts.gloss };
    shader.uniforms.uToonRim = { value: opts.rim === undefined ? 0.12 : opts.rim };
    shader.uniforms.uToonAmbient = { value: opts.ambient === undefined ? 0.42 : opts.ambient };
    shader.uniforms.uLightDir = { value: sunDir().clone() };
    toonUniforms.add(shader.uniforms.uToonEnable);
    m.userData.blobbyToonUniforms = shader.uniforms;

    shader.vertexShader =
      'varying vec3 vToonLocalPos;\nvarying vec3 vToonWorldPos;\nvarying vec3 vToonWorldNormal;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `
          vToonLocalPos = transformed;
          vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          #endif
          vToonWorldPos = (modelMatrix * wp4).xyz;
          vToonWorldNormal = normalize(mat3(modelMatrix) * normal);
          #include <project_vertex>
        `,
      );

    shader.fragmentShader =
      'uniform float uToonEnable;uniform vec3 uColorTop;uniform vec3 uColorBottom;uniform vec2 uToonBands;uniform float uToonGloss;uniform float uToonRim;uniform float uToonAmbient;uniform vec3 uLightDir;varying vec3 vToonLocalPos;varying vec3 vToonWorldPos;varying vec3 vToonWorldNormal;\n' +
      shader.fragmentShader
        .replace(
          'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
          `
          vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
          if (uToonEnable > 0.5) {
            vec3 N = normalize(vToonWorldNormal);
            vec3 L = normalize(uLightDir);
            vec3 V = normalize(cameraPosition - vToonWorldPos);
            vec3 H = normalize(L + V);
            float ndl = dot(N, L);
            float b0 = smoothstep(uToonBands.x - 0.02, uToonBands.x + 0.02, ndl);
            float b1 = smoothstep(uToonBands.y - 0.02, uToonBands.y + 0.02, ndl);
            float shade = mix(0.22, 0.56, b0);
            shade = mix(shade, 1.0, b1);
            float y01 = clamp((vToonLocalPos.y + 18.0) / 36.0, 0.0, 1.0);
            vec3 grad = mix(uColorBottom, uColorTop, y01);
            vec3 base = diffuseColor.rgb * grad;
            vec3 hemi = mix(vec3(0.92, 0.83, 0.76), vec3(0.86, 0.94, 0.98), clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
            float spec = step(0.92, pow(max(dot(N, H), 0.0), 64.0)) * uToonGloss;
            float rim = (1.0 - max(dot(N, V), 0.0));
            rim = smoothstep(0.6, 1.0, rim) * uToonRim;
            outgoingLight = base * (uToonAmbient + shade * 0.85) * hemi + spec * vec3(1.0, 0.97, 0.92) + rim * vec3(0.95, 0.86, 0.92);
          }
          `,
        );
  };
  m.needsUpdate = true;
  return mat;
}
