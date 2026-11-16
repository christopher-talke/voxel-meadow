import * as THREE from "three";
import { state, TIME_RATE } from "../core/state";
import {
  clamp,
  lerp,
  rand,
  reduceMotion,
  rr,
  seeded,
  smooth,
  store,
} from "../core/util";
import { camera, fog, hemi, scene, skyU, starU, sun } from "../render/stage";
import { colXZ } from "../terrain/grid";
import { hooks } from "../core/hooks";
import { cols } from "../terrain/grid";
import { B } from "../core/scale";

// ================= time, sun, moon and weather =================
/** One sky palette stop, keyed by sun elevation `e` in degrees. Colours are hex; hI is the sky light intensity. */
export interface PaletteStop { e: number; top: number; mid: number; hor: number; bot: number; sun: number; hs: number; hg: number; hI: number; water: number; cloudE: number }
/** Everything the sky needs from the world it sits over. Set once by the content with configureSky(). */
export interface SkyConfig {
  /** Morning and afternoon palettes, each sorted by sun elevation. */
  palettes: { am: PaletteStop[]; pm: PaletteStop[] };
  /** Latitude in degrees (negative south), for the sun and moon paths. */
  lat: number;
  /** Height of a roof over this point, or null in the open: rain stops there and animals count as sheltered. */
  cover(x: number, z: number): number | null;
  /** Ground or water surface height. */
  ground(x: number, z: number): number;
  clouds: THREE.Object3D[];
  cloudMat: THREE.MeshLambertMaterial; groundMat: THREE.MeshLambertMaterial; waterMat: THREE.MeshLambertMaterial;
  fireU: { uOp: { value: number } };
  /** Called on each lightning strike. */
  onBolt?(): void;
  /** Starting weather timers, so a content package can keep its own random sequence. */
  weather?: { left: number; bolt: number };
}
let SKY: SkyConfig;
let PAL_AM: PaletteStop[] = [], PAL_PM: PaletteStop[] = [];
let PAL: PaletteStop[] = PAL_PM;
const PKEYS_C = [
  "top",
  "mid",
  "hor",
  "bot",
  "sun",
  "hs",
  "hg",
  "water",
  "cloudE",
];
/** The live sky: sun and moon directions, light levels and the blended palette colours for the current moment. */
export const env = {
  dir: new THREE.Vector3(0.4, 1, 0.3).normalize(),
  sunDir: new THREE.Vector3(),
  moonDir: new THREE.Vector3(),
  sunI: 0.95,
  hI: 0.6,
  stars: 0,
  fire: 0,
  bugs: 1,
  el: 30,
  flash: 0,
  wetG: 0,
  /** Moon phase, 0 to 1. */
  phase: 0,
  top: new THREE.Color(),
  mid: new THREE.Color(),
  hor: new THREE.Color(),
  bot: new THREE.Color(),
  sun: new THREE.Color(),
  hs: new THREE.Color(),
  hg: new THREE.Color(),
  water: new THREE.Color(),
  cloudE: new THREE.Color(),
};
const tmpC = new THREE.Color(),
  tmpC2 = new THREE.Color(),
  tmpV = new THREE.Vector3(),
  GREY = new THREE.Color();
export let todKey = "day";
// the meadow keeps its own clock: live (matches the viewer's clock) or sped up so a whole day passes while you watch

let LAT = 0;
export function simDate() {
  return new Date(state.simMs);
}
function sunMoon(dt) {
  state.simMs =
    state.timeMode === "live"
      ? Date.now()
      : state.simMs + dt * 1000 * TIME_RATE[state.timeMode];
  const d = simDate(),
    y0 = new Date(d.getFullYear(), 0, 1),
    doy = (d.getTime() - y0.getTime()) / 864e5;
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset(),
    jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
  const dst = d.getTimezoneOffset() < Math.max(jan, jul) ? 1 : 0;
  const solarH =
    d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 - dst + 0.2;
  const decl =
    ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const dirFor = (ha, dc, out) => {
    const sinEl =
        Math.sin(LAT) * Math.sin(dc) +
        Math.cos(LAT) * Math.cos(dc) * Math.cos(ha),
      el = Math.asin(sinEl);
    const az = Math.atan2(
      -Math.sin(ha),
      Math.tan(dc) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(ha),
    ); // from north, clockwise
    return out.set(
      Math.sin(az) * Math.cos(el),
      sinEl,
      -Math.cos(az) * Math.cos(el),
    );
  };
  dirFor(((solarH - 12) * 15 * Math.PI) / 180, decl, env.sunDir);
  const phase =
    ((state.simMs - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588) % 1;
  env.phase = phase < 0 ? phase + 1 : phase;
  dirFor(
    ((solarH - 12 - env.phase * 24.84) * 15 * Math.PI) / 180,
    -decl * 0.8,
    env.moonDir,
  );
  env.el = (Math.asin(env.sunDir.y) * 180) / Math.PI;
  return d;
}
function paletteAt(el) {
  let a = PAL[0],
    b = PAL[PAL.length - 1];
  if (el <= a.e) b = a;
  else if (el >= b.e) a = b;
  else
    for (let i = 0; i < PAL.length - 1; i++)
      if (el >= PAL[i].e && el <= PAL[i + 1].e) {
        a = PAL[i];
        b = PAL[i + 1];
        break;
      }
  const t = a === b ? 0 : (el - a.e) / (b.e - a.e);
  return { a, b, t };
}

// weather: drifts between states on its own, or can be pinned from the sky menu
const WX_KIND = {
  clear: { cover: 0.08, rain: 0, wind: 0.2, storm: 0, w: 5 },
  cloudy: { cover: 0.7, rain: 0, wind: 0.4, storm: 0, w: 3 },
  windy: { cover: 0.35, rain: 0, wind: 1, storm: 0, w: 1.4 },
  rain: { cover: 0.92, rain: 0.7, wind: 0.45, storm: 0, w: 1.6 },
  storm: { cover: 1, rain: 1, wind: 0.95, storm: 1, w: 0.5 },
};
export const WX = {
  mode: WX_KIND[store.get("meadow-wx")] ? store.get("meadow-wx") : "auto",
  kind: "clear",
  left: 200,
  cover: 0.08,
  rain: 0,
  wind: 0.2,
  storm: 0,
  boltT: 8,
};
if (WX.mode !== "auto") WX.kind = WX.mode;
function wxNext() {
  let s = 0;
  for (const k in WX_KIND) s += WX_KIND[k].w;
  let r = rand() * s;
  for (const k in WX_KIND) {
    r -= WX_KIND[k].w;
    if (r <= 0) return k;
  }
  return "clear";
}

// a sun you can see: a soft disc and glow; a moon with its proper phase

const moonCanvas = document.createElement("canvas");
moonCanvas.width = moonCanvas.height = 128;
const moonTex = new THREE.CanvasTexture(moonCanvas);
let moonDrawn = -1;
function drawMoon(ph) {
  const g = moonCanvas.getContext("2d")!,
    r = 22;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#f4f1e6";
  g.beginPath();
  g.arc(64, 64, r, 0, 6.283);
  g.fill();
  // southern hemisphere: a waxing moon is lit on the left
  const waxing = ph < 0.5,
    k = Math.cos(ph * 2 * Math.PI),
    litLeft = waxing;
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  if (litLeft) g.rect(64, 0, 64, 128);
  else g.rect(0, 0, 64, 128);
  g.fill();
  g.beginPath();
  g.ellipse(64, 64, Math.abs(k) * r, r, 0, 0, 6.283);
  if (k > 0) g.fill();
  else {
    g.globalCompositeOperation = "source-over";
    g.fill();
  }
  g.globalCompositeOperation = "destination-over";
  g.fillStyle = "rgba(150,165,205,0.22)";
  g.beginPath();
  g.arc(64, 64, r, 0, 6.283);
  g.fill();
  const glow = g.createRadialGradient(64, 64, r, 64, 64, 64);
  glow.addColorStop(0, "rgba(200,215,255,0.28)");
  glow.addColorStop(1, "rgba(200,215,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = "source-over";
  moonTex.needsUpdate = true;
}
export const moonDisc = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: moonTex,
    transparent: true,
    depthWrite: false,
    fog: false,
  }),
);
moonDisc.scale.setScalar(240);
moonDisc.renderOrder = -1;
scene.add(moonDisc);

// rain, in three layers so it reads as weather over the whole world from any distance:
//  near: streaks in a box around the view whose size follows the camera's distance, so they still read from the island orbit
//  far: two fog-tinted curtains wrapped round the camera, so distant rain billows into the haze instead of stopping at a box edge
//  shafts: soft sheets of rain hanging under the clouds, out over the horizon
// Rain is pure decoration, so it draws from its own random stream and never shifts the animals' choices.
const R = seeded(4417);
const RAIN_N = 2400,
  rainPos = new Float32Array(RAIN_N * 6),
  rainP: { u: number; w: number; y: number; v: number }[] = [];
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({
  color: 0xb4c2d4,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
rainMesh.frustumCulled = false;
scene.add(rainMesh);
// positions are kept in box units (u, w across, y up from 0 to 1) so the box can grow and shrink without reseeding
for (let i = 0; i < RAIN_N; i++)
  rainP.push({ u: R.rr(-1, 1), w: R.rr(-1, 1), y: R.rand(), v: R.rr(0.85, 1.15) });
const rainBox = { c: new THREE.Vector3(), ext: 170, h: 170 };

// curtains and shafts share one shader: soft falling streaks, tinted toward the fog, fading at top and bottom
const veilU = {
  uTime: { value: 0 },
  uRain: { value: 0 },
  uCol: { value: new THREE.Color(0x9aa7b4) },
  uFlash: { value: 0 },
};
const veilMat = (alpha: number, cols: number) =>
  new THREE.ShaderMaterial({
    uniforms: { ...veilU, uAlpha: { value: alpha }, uCols: { value: cols } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uRain, uAlpha, uCols, uFlash; uniform vec3 uCol; varying vec2 vUv;
      float h(float n){ return fract(sin(n * 91.345) * 47453.21); }
      void main(){
        float x = vUv.x * uCols, c = floor(x), f = fract(x);
        float sp = 0.55 + 0.5 * h(c), ph = h(c + 7.0);
        float y = fract(vUv.y * (2.0 + 2.0 * h(c + 3.0)) + uTime * sp + ph);
        float streak = smoothstep(0.5, 0.0, abs(f - 0.5) * 2.2) * smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.6, y);
        float body = 0.55 + 0.45 * streak;
        float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = uRain * uAlpha * body * fade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(mix(uCol, vec3(0.92, 0.95, 1.0), uFlash * 0.7), a);
      }`,
  });
const curtains: THREE.Mesh[] = [];
for (const [r, a, n] of [[460, 0.2, 260], [1050, 0.32, 420]] as const) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 900, 48, 1, true), veilMat(a, n));
  m.frustumCulled = false; m.renderOrder = 2; m.visible = false; scene.add(m); curtains.push(m);
}
const shaftGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
const shafts: THREE.Mesh[] = [];

const ripGeo = new THREE.RingGeometry(0.75, 1, 20);
ripGeo.rotateX(-Math.PI / 2);
const ripples: any[] = [];
for (let i = 0; i < 46; i++) {
  const m = new THREE.Mesh(
    ripGeo,
    new THREE.MeshBasicMaterial({
      color: 0xe8f2ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  m.visible = false;
  scene.add(m);
  ripples.push({ m, t: 1, life: 1 });
}
/** Bind the sky to a world: palettes, latitude, cover, ground, clouds and the materials it tints. Call once at load. */
export function configureSky(c: SkyConfig) {
  SKY = c; PAL_AM = c.palettes.am; PAL_PM = c.palettes.pm; PAL = PAL_PM; LAT = (c.lat * Math.PI) / 180;
  if (c.weather) { WX.left = c.weather.left; WX.boltT = c.weather.bolt; }
  for (const cl of c.clouds) {
    const m = new THREE.Mesh(shaftGeo, veilMat(0.42, 14));
    m.scale.set(R.rr(60, 110), 1, 1); m.position.set(R.rr(-12, 12), -8, R.rr(-8, 8)); m.visible = false;
    cl.add(m); shafts.push(m);
  }
  // every open-water cell, so ripples land across whole lakes rather than near the camera's focus
  for (const w of cols) if (w && (w.wade || w.swim) && !w.jetty && w.wl !== null) OPEN_WATER.push({ x: w.i * B, z: w.j * B, y: w.wl + 0.15 });
}
const OPEN_WATER: { x: number; z: number; y: number }[] = [];
const _toCam = new THREE.Vector3();
function rainUpdate(dt, focus) {
  const on = WX.rain > 0.02;
  veilU.uRain.value = Math.min(1, WX.rain * 1.3);
  veilU.uFlash.value = env.flash;
  veilU.uCol.value.copy(fog.color).multiplyScalar(0.8).lerp(tmpC.setRGB(0.5, 0.55, 0.62), 0.25);   // rain is darker than the haze behind it
  if (!reduceMotion) veilU.uTime.value += dt * 0.9;
  for (const m of curtains) { m.visible = on; m.position.set(camera.position.x, 200, camera.position.z); }
  for (const m of shafts) {
    m.visible = on && WX.cover > 0.6;
    if (!m.visible) continue;
    const g = m.parent!; m.scale.y = g.position.y + 120;
    m.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
  }
  // reduced motion: the curtains stay as a still veil and nothing falls
  rainMesh.visible = on && !reduceMotion;
  if (!rainMesh.visible) {
    for (const r of ripples) r.m.visible = false;
    return;
  }
  // the box sits between camera and focus and grows with distance, keeping streaks a readable size on screen
  const dist = camera.position.distanceTo(focus), s = clamp(dist / 320, 1, 4.2);
  rainBox.ext = 170 * s; rainBox.h = 170 * s;
  _toCam.copy(camera.position).sub(focus);
  rainBox.c.copy(focus).addScaledVector(_toCam, clamp(0.35 - 60 / Math.max(dist, 1), 0, 0.35));
  rainMat.opacity = 0.7 * Math.min(1, WX.rain * 1.4);
  const n = Math.floor(RAIN_N * Math.min(1, WX.rain)),
    sx = WX.wind * 26,
    len = 4.2 * s,
    E = rainBox.ext, Hh = rainBox.h, base = rainBox.c.y - 40 * s;
  rainGeo.setDrawRange(0, n * 2);
  for (let i = 0; i < n; i++) {
    const p = rainP[i];
    p.y -= (130 * p.v * dt) / Hh;
    p.u += (sx * dt) / E;
    if (p.u > 1) p.u -= 2;
    const X = rainBox.c.x + p.u * E, Z = rainBox.c.z + p.w * E;
    let Y = base + p.y * Hh, cv: number | null;
    if (p.y < 0 || Y < SKY.ground(X, Z) + 1 || ((cv = SKY.cover(X, Z)) !== null && Y < cv)) {
      p.y = R.rr(0.7, 1); p.u = R.rr(-1, 1); p.w = R.rr(-1, 1);
      continue;
    }
    const o = i * 6;
    rainPos[o] = X;
    rainPos[o + 1] = Y;
    rainPos[o + 2] = Z;
    rainPos[o + 3] = X - ((sx * len) / (130 * p.v)) * 4;
    rainPos[o + 4] = Y + len;
    rainPos[o + 5] = Z;
  }
  rainGeo.attributes.position.needsUpdate = true;
  for (const r of ripples) {
    r.t += dt / r.life;
    if (r.t >= 1) {
      r.m.visible = false;
      if (OPEN_WATER.length && R.rand() < WX.rain * 0.6) {
        const w = OPEN_WATER[Math.floor(R.rand() * OPEN_WATER.length)];
        r.m.position.set(w.x + R.rr(-2, 2), w.y, w.z + R.rr(-2, 2));
        r.t = 0;
        r.life = R.rr(0.6, 1.1);
        r.m.visible = true;
      }
      continue;
    }
    r.m.scale.setScalar(0.6 + r.t * 3.2);
    r.m.material.opacity = 0.55 * (1 - r.t);
  }
}
/** True where something roofs this point over. */
export const underRoof = (x, z) => SKY.cover(x, z) !== null;

function weatherUpdate(dt) {
  if (WX.mode === "auto") {
    WX.left -= dt;
    if (WX.left <= 0) {
      WX.kind = wxNext();
      WX.left = rr(180, 480);
    }
  } else WX.kind = WX.mode;
  const k = WX_KIND[WX.kind],
    f = 1 - Math.exp(-dt / 14);
  for (const p of ["cover", "wind", "storm"]) WX[p] += (k[p] - WX[p]) * f;
  WX.rain +=
    (k.rain * (WX.cover > 0.75 ? 1 : 0) - WX.rain) * (1 - Math.exp(-dt / 9));
  env.wetG = clamp(env.wetG + (WX.rain > 0.15 ? dt / 25 : -dt / 160), 0, 1);
  env.flash = Math.max(0, env.flash - dt * 3.2);
  if (WX.storm > 0.6) {
    WX.boltT -= dt;
    if (WX.boltT <= 0) {
      WX.boltT = rr(6, 18);
      env.flash = 1;
      hooks.thunder?.(rr(0.4, 2.6));
      setTimeout(() => {
        env.flash = Math.max(env.flash, 0.6);
      }, 160);
      SKY.onBolt?.();
    }
  }
}

export function updateEnv(dt, focus) {
  sunMoon(dt);
  weatherUpdate(dt);
  PAL = simDate().getHours() < 12 ? PAL_AM : PAL_PM;
  const el = env.el,
    P = paletteAt(el);
  for (const c of PKEYS_C) env[c].setHex(P.a[c]).lerp(tmpC.setHex(P.b[c]), P.t);
  env.hI = lerp(P.a.hI, P.b.hI, P.t);
  const day = smooth(-4, 7, el),
    night = 1 - smooth(-10, -2, el),
    moonUp = smooth(-2, 6, env.moonDir.y * 57.3);
  todKey = el > 10 ? "day" : el > -4 ? "golden" : "night";
  // overcast greys the sky and softens the light
  const ov = WX.cover * 0.95,
    dim = 1 - 0.42 * WX.rain;
  for (const c of ["top", "mid", "hor", "bot"]) {
    const L = (env[c].r * 0.3 + env[c].g * 0.59 + env[c].b * 0.11) * dim;
    GREY.setRGB(L * 0.94, L * 0.97, L * 1.03);
    env[c].lerp(GREY, ov * (c === "top" ? 0.92 : 0.8));
  }
  if (env.flash > 0)
    for (const c of ["top", "mid", "hor", "bot"])
      env[c].lerp(tmpC.setRGB(0.85, 0.88, 1), env.flash * 0.6);
  const useMoon = el < -3;
  env.dir.copy(useMoon ? env.moonDir : env.sunDir);
  if (env.dir.y < 0.14) {
    env.dir.y = 0.14;
    env.dir.normalize();
  }
  env.sunI =
    (useMoon ? 0.4 * night * Math.max(0.65, moonUp) : 0.98 * day) *
    (1 - 0.74 * WX.cover) *
    (1 - 0.5 * WX.rain);
  if (useMoon) env.sun.setHex(0x9db2ff);
  env.hI = env.hI * (1 + 0.1 * WX.cover - 0.38 * WX.rain) + env.flash * 1.4;
  env.hs.lerp(tmpC.setRGB(0.78, 0.82, 0.88), WX.cover * 0.6);
  env.hg.multiplyScalar(1 - 0.25 * WX.rain);
  env.stars = night * (1 - WX.cover * 0.95);
  env.fire = night * (1 - WX.rain);
  env.bugs = day * (1 - Math.min(1, WX.rain * 2)) * (1 - WX.wind * 0.6);
  skyU.top.value.copy(env.top);
  skyU.mid.value.copy(env.mid);
  skyU.hor.value.copy(env.hor);
  skyU.bot.value.copy(env.bot);
  skyU.uTw.value =
    (1 - smooth(8, 20, el)) * smooth(-10, -3, el) * (1 - WX.cover * 0.85);
  skyU.uDisc.value = (1 - WX.cover * 0.97) * smooth(-0.04, 0.0, env.sunDir.y);
  skyU.uSun.value.copy(env.sunDir);
  skyU.uSunCol.value.copy(
    tmpC.setHex(P.a.sun).lerp(tmpC2.setHex(P.b.sun), P.t),
  );
  skyU.uGlow.value = smooth(-8, 2, el) * (1 - WX.cover * 0.85);
  fog.color.copy(env.mid).lerp(env.hor, 0.6);
  fog.near = lerp(950, 180, Math.min(1, WX.rain * 1.2)) + state.fogPush * 0.9;
  fog.far = lerp(2900, 1000, Math.min(1, WX.rain * 1.2)) + state.fogPush * 1.9;
  sun.color.copy(env.sun);
  sun.intensity = env.sunI;
  sun.target.position.set(0, 0, 0); // shadows cover the whole island, so the sun stays centred on it
  sun.position.copy(env.dir).multiplyScalar(800).add(sun.target.position);
  hemi.color.copy(env.hs);
  hemi.groundColor.copy(env.hg);
  hemi.intensity = env.hI;
  SKY.waterMat.color.copy(env.water).lerp(tmpC.setHex(0x6a7a86), WX.cover * 0.4);
  SKY.cloudMat.emissive.copy(env.cloudE).lerp(tmpC.setRGB(0.9, 0.92, 1), env.flash * 0.75);
  SKY.cloudMat.color.setRGB(
    1 - 0.45 * WX.cover,
    1 - 0.43 * WX.cover,
    1 - 0.38 * WX.cover,
  );
  SKY.groundMat.color.setRGB(
    1 - 0.16 * env.wetG,
    1 - 0.14 * env.wetG,
    1 - 0.1 * env.wetG,
  );
  starU.uOp.value = env.stars;
  SKY.fireU.uOp.value = env.fire;
  // sun and moon discs, placed far out along their directions from the camera
  moonDisc.position.copy(camera.position).addScaledVector(env.moonDir, 3000);
  moonDisc.visible = env.moonDir.y > -0.05;
  moonDisc.material.opacity =
    (1 - WX.cover * 0.9) *
    (0.35 + 0.65 * (1 - day)) *
    smooth(-0.05, 0.04, env.moonDir.y);
  const ph = Math.round(env.phase * 60);
  if (ph !== moonDrawn) {
    moonDrawn = ph;
    drawMoon(env.phase);
  }
  rainUpdate(dt, focus);
}
export function setTod(k) {
  // jump the meadow clock to a time of day (tests and old saves)
  const d = new Date(state.simMs),
    h = { day: 11, golden: 18.6, night: 22.5 }[k] || 11;
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
  state.simMs = d.getTime();
  if (state.timeMode === "live") state.timeMode = "cycle";
}
