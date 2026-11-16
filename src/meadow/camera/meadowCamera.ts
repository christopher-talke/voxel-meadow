import * as THREE from 'three';
import { state } from '../../engine/core/state';
import { rand } from '../../engine/core/util';
import { K } from '../../engine/core/scale';
import { configureCamera, type Shot } from '../../engine/camera/camera';
import { $ } from '../../engine/core/util';
import { SH, roofTop } from '../world/layout';
import { CHERRY, TREES } from '../world/decor';
import { groundTop } from '../world/mesh';
import { dogs, ents } from '../entities/registry';
import { showHint } from '../ui/hint';

// ================= the meadow's camera: its shots, what is worth watching, and what blocks the view =================
const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOTS: Shot[] = [
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
    orbit: { c: P3(CHERRY.x, 0, CHERRY.z), lookY: 26, r: 92, y: 18, y1: 44, da: 1.1 },
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

// how worth watching each behaviour is, for the automatic camera
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
/** The shelter roof (unless the see-through cutaway is on) and tree canopies block the camera's view. */
function solid(x: number, y: number, z: number, g: number, includeRoof: boolean) {
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

configureCamera({ subjects: ents, group: dogs, ground: groundTop, solid, shots: SHOTS, interest, label: camName, hint: showHint, fade: $('fade'), joy: $('joy') });
export { SHOTS };
