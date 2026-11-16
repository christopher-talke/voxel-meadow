import type { Dog } from "../entities/dog";
import * as THREE from "three";
import { state } from "../engine/core/state";
import { $, clamp, lerp, rand, store } from "../engine/core/util";
import { COARSE, camera, controls, focus } from "../engine/render/stage";
import { SH, roofTop } from "../world/layout";
import { K } from "../engine/core/scale";
import { CHERRY, TREES } from "../world/decor";
import { groundTop } from "../world/mesh";
import { WX, env } from "../sim/sky";
import { cats, dogs, ents } from "../entities/registry";
import { showHint } from "../ui/hint";
import { hooks } from "../engine/core/hooks";
const WALLPAPER_BUILD = import.meta.env.PROD;

// ================= camera follow =================

export const freeT = new THREE.Vector3(),
  goalF = new THREE.Vector3();
export function focusGoal() {
  if (state.camMode === "free") return goalF.copy(freeT);
  if (typeof state.camMode === "number") {
    const d = ents[state.camMode];
    return goalF.set(d.pos.x, d.rootY + 7, d.pos.y);
  }
  // all the dogs: the middle of the group, or the nearest dog if they have spread out
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const d of dogs) {
    cx += d.pos.x;
    cy += d.rootY;
    cz += d.pos.y;
  }
  cx /= dogs.length;
  cy /= dogs.length;
  cz /= dogs.length;
  let spread = 0;
  for (const d of dogs)
    spread = Math.max(spread, Math.hypot(d.pos.x - cx, d.pos.y - cz));
  if (spread > 90) {
    let best = dogs[0],
      bd = 1e9;
    for (const d of dogs) {
      const q = Math.hypot(d.pos.x - focus.x, d.pos.y - focus.z);
      if (q < bd) {
        bd = q;
        best = d;
      }
    }
    return goalF.set(best.pos.x, best.rootY + 7, best.pos.y);
  }
  return goalF.set(cx, cy + 7, cz);
}
focus.copy(focusGoal());
controls.target.copy(focus);
camera.position.set(focus.x + 62, focus.y + 50, focus.z + 104);

// ================= camera: cycle, automatic switching, free-cam joystick, no ghosting through terrain =================
const joy = $("joy"),
  joyK = joy.querySelector("i")!;
const CAM_ORDER = ["both", 0, 1, 2, 3, 4, "orbit", "cine", "free"];
function camName(m) {
  return m === "both"
    ? "Watching everyone"
    : m === "free"
      ? "Free camera"
      : m === "cine"
        ? "Cinematic"
        : m === "orbit"
          ? "Island orbit"
          : "Following " + ents[m].name;
}
export function setCamMode(m, manual) {
  if (state.camMode === "cine" && m !== "cine") cineStop();
  if (m === "orbit")
    state.orbitA = Math.atan2(camera.position.z, camera.position.x);
  state.camMode = m;
  if (typeof m === "number") state.followZoom = true;
  else if (m === "free") freeT.copy(controls.target);
  else if (m === "cine") cineStart();
  if (manual) state.autoT = -14;
  hooks.syncMenu?.();
  showHint(
    camName(m) +
      (m === "free"
        ? COARSE
          ? ". Use the joystick to move, drag to look."
          : ". WASD or arrows to move, drag to look."
        : ""),
    2600,
  );
}

const ACT = {
  ambush: 4,
  spook: 4.5,
  adventure: 3,
  ball: 3.5,
  contest: 3.5,
  burst: 3,
  tidy: 3,
  grump: 3,
  hello: 3,
  fish: 3,
  fishcarry: 3,
  climb: 3,
  perch: 2,
  watchtail: 2.5,
  tummy: 2,
  displaced: 2,
  leave: 2,
  shakeoff: 2,
  drink: 1.5,
  sunbathe: 0.4,
  nap: 0.1,
  catnap: 0.1,
  sit: 0.6,
};
function interest(e) {
  let v = ACT[e.behaviour] !== undefined ? ACT[e.behaviour] : 1.2;
  if (e.swimming) v = 5;
  if (e.poseName === "sleep") v = 0.1;
  if (e.v > 8 * K) v += 0.6;
  if (e.wetV > 0.4) v += 0.3;
  return v + rand() * 0.6;
}
export function autoCamUpdate(dt) {
  if (
    !state.autoCam ||
    state.camMode === "free" ||
    state.camMode === "cine" ||
    state.camMode === "orbit"
  )
    return;
  state.autoT += dt;
  const cur = typeof state.camMode === "number" ? ents[state.camMode] : null,
    curV = cur ? interest(cur) : 0;
  if (state.autoT < 12) return;
  let best = -1,
    bv = -1;
  ents.forEach((e, i) => {
    if (e === cur) return;
    const v = interest(e);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  if (
    best >= 0 &&
    (!cur || bv > curV + 0.8 || state.autoT > 30) &&
    rand() < 0.2
  ) {
    state.autoT = 0;
    state.camMode = "cine";
    cineStart();
    showHint("Cinematic", 1800);
    return;
  }
  if (best >= 0 && (!cur || bv > curV + 0.8 || state.autoT > 30)) {
    state.autoT = 0;
    state.camMode = best;
    state.followZoom = true;
    showHint(camName(best), 2200);
  }
}
// free-cam movement: joystick (touch) or keys (desktop). Touch drags still only rotate.
const mv = { x: 0, y: 0 },
  keys: Record<string, boolean> = {};
addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA/.test((e.target as HTMLElement | null)?.tagName || ""))
    return;
  const k = e.key.toLowerCase();
  if (("wasdqe".includes(k) && k.length === 1) || k.startsWith("arrow")) {
    keys[k] = true;
    if (state.camMode !== "free" && !e.metaKey && !e.ctrlKey)
      setCamMode("free", true);
  }
});
addEventListener("keyup", (e) => {
  delete keys[e.key.toLowerCase()];
});
let joyId: number | null = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect(),
    R = r.width / 2;
  let dx = e.clientX - (r.left + R),
    dy = e.clientY - (r.top + R);
  const L = Math.hypot(dx, dy),
    m = Math.min(L, R * 0.7);
  if (L > 0) {
    dx = (dx / L) * m;
    dy = (dy / L) * m;
  }
  mv.x = dx / (R * 0.7);
  mv.y = dy / (R * 0.7);
  joyK.style.transform =
    "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
}
joy.addEventListener("pointerdown", (e) => {
  joyId = e.pointerId;
  joy.setPointerCapture(e.pointerId);
  joyMove(e);
  state.lastInteract = performance.now();
  e.preventDefault();
});
joy.addEventListener("pointermove", (e) => {
  if (e.pointerId === joyId) joyMove(e);
});
const joyEnd = (e) => {
  if (e.pointerId !== joyId) return;
  joyId = null;
  mv.x = mv.y = 0;
  joyK.style.transform = "";
};
joy.addEventListener("pointerup", joyEnd);
joy.addEventListener("pointercancel", joyEnd);
const _fwd = new THREE.Vector3(),
  _rt = new THREE.Vector3(),
  _mv = new THREE.Vector3();
export function freeMove(dt) {
  const free = state.camMode === "free";
  joy.classList.toggle("on", free && COARSE);
  controls.touches.TWO =
    free && COARSE ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
  if (free && COARSE) controls.enablePan = false;
  if (!free) return;
  let x = mv.x,
    y = mv.y;
  if (keys.a || keys.arrowleft) x -= 1;
  if (keys.d || keys.arrowright) x += 1;
  if (keys.w || keys.arrowup) y -= 1;
  if (keys.s || keys.arrowdown) y += 1;
  const up = (keys.e ? 1 : 0) - (keys.q ? 1 : 0);
  if (!x && !y && !up) return;
  const L = Math.hypot(x, y);
  if (L > 1) {
    x /= L;
    y /= L;
  }
  _fwd
    .set(
      controls.target.x - camera.position.x,
      0,
      controls.target.z - camera.position.z,
    )
    .normalize();
  _rt.set(-_fwd.z, 0, _fwd.x);
  const dist = camera.position.distanceTo(controls.target),
    sp = clamp(dist, 30, 300) * 0.9 * dt;
  _mv
    .set(0, 0, 0)
    .addScaledVector(_fwd, -y * sp)
    .addScaledVector(_rt, x * sp);
  _mv.y = up * sp * 0.6;
  const t = controls.target.clone().add(_mv),
    g = groundTop(t.x, t.z);
  if (g > -40) {
    t.y = Math.max(t.y, g + 3);
    _mv.copy(t).sub(controls.target);
    camera.position.add(_mv);
    controls.target.copy(t);
    focus.copy(t);
    freeT.copy(t);
  }
  state.lastInteract = performance.now();
  controls.autoRotate = false;
}
// the view never sits inside the ground or hills: pull the lens in along the line to the focus, and ease back out
let clipK = 1;
const _rc = new THREE.Vector3(),
  _trueCam = new THREE.Vector3();
function solidAt(x, y, z, includeRoof = true) {
  const g = groundTop(x, z);
  if (y < g + 1.4) return true;
  if (includeRoof && !state.seeThrough && x > SH.x0 && x < SH.x1 && z > SH.z0 && z < SH.z1) {
    const r = roofTop(x);
    if (y < r + 0.6 && y > r - 3.2) return true;
  }
  for (const t of TREES) {
    const tx = t[0] * 4;
    const tz = t[1] * 4;
    const radius = Math.max(5.5, (t[2] || 3) * 2.6);
    const d2 = (x - tx) ** 2 + (z - tz) ** 2;
    const canopyBase = Math.max(g, groundTop(tx, tz) + 2);
    if (d2 <= radius * radius && y > canopyBase && y < canopyBase + 30) return true;
  }
  return false;
}
const _losDir = new THREE.Vector3();
/**
 * Terrain/shelter line of sight from camera to a world-space point.
 * Returns true only when no solid voxel is found along the ray.
 */
export function hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, includeRoof = true) {
  _losDir.copy(to).sub(from);
  const L = _losDir.length();
  if (L < 1) return true;
  _losDir.multiplyScalar(1 / L);
  for (let d = 1.5; d < L - 1.2; d += 2.2) {
    const x = from.x + _losDir.x * d,
      y = from.y + _losDir.y * d,
      z = from.z + _losDir.z * d;
    if (solidAt(x, y, z, includeRoof)) return false;
  }
  return true;
}
export function camClipBegin(dt) {
  _trueCam.copy(camera.position);
  const f = controls.target,
    dx = _trueCam.x - f.x,
    dy = _trueCam.y - f.y,
    dz = _trueCam.z - f.z,
    L = Math.hypot(dx, dy, dz);
  let want = 1;
  if (L > 1) {
    for (let d = 5; d <= L; d += 2.5) {
      const k = d / L;
      // The shelter roof is an open canopy, not a terrain collision surface for the camera.
      // Treating it as a hard blocker here pulls the orbit camera toward the island center.
      if (solidAt(f.x + dx * k, f.y + dy * k, f.z + dz * k, false)) {
        want = Math.max(0.08, (d - 6) / L);
        break;
      }
    }
  }
  clipK =
    want < clipK ? want : clipK + (want - clipK) * (1 - Math.exp(-3 * dt));
  camera.position.set(f.x + dx * clipK, f.y + dy * clipK, f.z + dz * clipK);
  const g = groundTop(camera.position.x, camera.position.z);
  if (g > -40 && camera.position.y < g + 2.2) camera.position.y = g + 2.2;
}
export const camClipEnd = () => camera.position.copy(_trueCam);
// ================= cinematic camera: designated shots around the meadow =================
const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** One scripted shot for the cinematic camera: a camera path and look path, an orbit, a follow of the liveliest animal, or a look toward the sun. */
export interface Shot {
  name: string;
  dur: number;
  cam?: THREE.Vector3[];
  look?: THREE.Vector3[];
  orbit?: {
    c?: THREE.Vector3;
    r: number;
    y: number;
    y1?: number;
    da: number;
    cherry?: boolean;
  };
  follow?: boolean;
  sunward?: boolean;
}
export const SHOTS: Shot[] = [
  {
    name: "The shelter",
    cam: [P3(70, 30, 80), P3(20, 24, 46), P3(-22, 19, 24)],
    look: [P3(-55, 8, 14), P3(-68, 8, 4), P3(-74, 7, -4)],
    dur: 30,
  },
  {
    name: "Along the lake",
    cam: [P3(30, 18, 100), P3(80, 13, 126), P3(140, 13, 132), P3(196, 20, 118)],
    look: [P3(100, 4, 160), P3(140, 5, 164), P3(185, 0, 175), P3(210, 0, 190)],
    dur: 34,
  },
  {
    name: "Over the meadow",
    orbit: { c: P3(0, 0, 0), r: 300, y: 170, da: 0.9 },
    dur: 40,
  },
  {
    name: "The far field",
    cam: [P3(140, 20, -10), P3(190, 18, -44), P3(244, 22, -96)],
    look: [P3(232, 4, -72), P3(246, 4, -84), P3(268, 4, -118)],
    dur: 30,
  },
  {
    name: "Under the cherry",
    orbit: { cherry: true, r: 92, y: 18, y1: 44, da: 1.1 },
    dur: 30,
  },
  {
    name: "From the jetty",
    cam: [P3(146, 14, 160), P3(130, 16, 160), P3(110, 20, 158)],
    look: [P3(40, 14, 70), P3(0, 12, 20), P3(-40, 10, 0)],
    dur: 28,
  },
  { name: "Companion", follow: true, dur: 26 },
  { name: "Into the sun", sunward: true, dur: 32 },
];
export const cine: {
  i: number;
  t: number;
  shot: Shot | null;
  curve: THREE.CatmullRomCurve3 | null;
  lookC: THREE.CatmullRomCurve3 | null;
  a0: number;
  who: Dog | null;
  order: number[];
} = {
  i: -1,
  t: 0,
  shot: null,
  curve: null,
  lookC: null,
  a0: 0,
  who: null,
  order: [],
};
const fadeEl = $("fade");
const liftY = (v, min) => {
  const g = groundTop(v.x, v.z);
  v.y = Math.max(v.y, (g > -40 ? g : 0) + min);
  return v;
};
function cineNext() {
  if (!cine.order.length) {
    const golden = env.el > -4 && env.el < 18 && WX.cover < 0.6;
    cine.order = SHOTS.map((_, i) => i)
      .filter((i) => !SHOTS[i].sunward || golden)
      .sort(() => rand() - 0.5);
    if (golden) cine.order.unshift(SHOTS.findIndex((x) => x.sunward));
    if (cine.order[0] === cine.i) cine.order.push(cine.order.shift()!);
  }
  cine.i = cine.order.shift()!;
  const s = (cine.shot = SHOTS[cine.i]);
  cine.t = 0;
  cine.a0 = rand() * 6.283;
  if (s.cam) {
    cine.curve = new THREE.CatmullRomCurve3(
      s.cam.map((p) => liftY(p.clone(), 9)),
    );
    cine.lookC = new THREE.CatmullRomCurve3(
      s.look!.map((p) => liftY(p.clone(), 3)),
    );
  }
  if (s.follow) {
    let best = 0,
      bv = -1;
    ents.forEach((e, i) => {
      const v = interest(e);
      if (v > bv) {
        bv = v;
        best = i;
      }
    });
    cine.who = ents[best];
  }
  fadeEl.style.opacity = "0";
}
export function cineStart() {
  cine.order = [];
  fadeEl.style.transition = "none";
  fadeEl.style.opacity = "1";
  void fadeEl.offsetWidth;
  fadeEl.style.transition = "";
  cineNext();
}
function cineStop() {
  fadeEl.style.opacity = "0";
}
const _cl = new THREE.Vector3(),
  _cp = new THREE.Vector3(),
  _near = new THREE.Vector3();
export function cineUpdate(dt) {
  const s = cine.shot;
  if (!s) {
    cineStart();
    return;
  }
  cine.t += dt;
  const u0 = clamp(cine.t / s.dur, 0, 1),
    u = 0.5 - 0.5 * Math.cos(Math.PI * u0);
  if (s.cam) {
    cine.curve!.getPoint(u, _cp);
    cine.lookC!.getPoint(u, _cl);
  } else if (s.orbit) {
    const o = s.orbit!,
      c = o.cherry ? P3(CHERRY.x, 0, CHERRY.z) : o.c!,
      a = cine.a0 + o.da * u;
    _cp.set(
      c.x + Math.cos(a) * o.r,
      lerp(o.y, o.y1 || o.y, u),
      c.z + Math.sin(a) * o.r,
    );
    liftY(_cp, 9);
    _cl.set(c.x, o.cherry ? 26 : 6, c.z);
  } else if (s.sunward) {
    // look out along the sun, slowly craning up from the meadow
    const hx = env.sunDir.x,
      hz = env.sunDir.z,
      L = Math.hypot(hx, hz) || 1;
    _cp.set(
      (-hx / L) * (140 - 60 * u),
      lerp(16, 40, u),
      (-hz / L) * (140 - 60 * u),
    );
    liftY(_cp, 12);
    _cl.set(
      _cp.x + (hx / L) * 400,
      _cp.y + 400 * Math.max(0.02, env.sunDir.y) * 0.7 + 10,
      _cp.z + (hz / L) * 400,
    );
  } else if (s.follow) {
    const e = cine.who!,
      a = cine.a0 + 0.7 * u,
      r = lerp(52, 34, u);
    _cl.set(e.root.position.x, e.root.position.y + 6, e.root.position.z);
    _cp.set(
      _cl.x + Math.cos(a) * r,
      _cl.y + lerp(20, 12, u),
      _cl.z + Math.sin(a) * r,
    );
    liftY(_cp, 8);
  }
  // drift the aim a little towards whoever is nearby, so shots are rarely empty
  if (!s.follow && !s.sunward) {
    let bd = 70,
      who: Dog | null = null;
    for (const e of ents) {
      const d = Math.hypot(e.pos.x - _cl.x, e.pos.y - _cl.z);
      if (d < bd) {
        bd = d;
        who = e;
      }
    }
    if (who)
      _cl.lerp(
        _near.set(who.pos.x, who.root.position.y + 6, who.pos.y),
        0.45 * (1 - bd / 70),
      );
  }
  camera.position.copy(_cp);
  controls.target.copy(_cl);
  focus.copy(_cl);
  controls.autoRotate = false;
  if (cine.t > s.dur - 0.9) fadeEl.style.opacity = "1";
  if (cine.t >= s.dur) {
    if (state.autoCam && rand() < 0.65) {
      cineStop();
      let best = 0,
        bv = -1;
      ents.forEach((e, i) => {
        const v = interest(e);
        if (v > bv) {
          bv = v;
          best = i;
        }
      });
      state.camMode = best;
      state.followZoom = true;
      state.autoT = 0;
      cine.shot = null;
      showHint(camName(best), 2200);
    } else cineNext();
  }
}

// ================= interaction =================

controls.addEventListener("start", () => {
  if (WALLPAPER_BUILD) return;
  if (state.camMode === "cine" || state.camMode === "orbit") {
    if (state.camMode === "cine") cineStop();
    state.camMode = "both";
    hooks.syncMenu?.();
  }
  controls.autoRotate = false;
  state.lastInteract = performance.now();
  state.gesture = true;
  state.followZoom = false;
});
controls.addEventListener("end", () => {
  if (WALLPAPER_BUILD) return;
  state.lastInteract = performance.now();
  state.gesture = false;
  // a deliberate pan lets go of the follow; a pinch that drifted a little does not
  if (state.camMode !== "free" && controls.target.distanceTo(focus) > 7) {
    state.camMode = "free";
    freeT.copy(controls.target);
  }
  focus.copy(controls.target);
});
