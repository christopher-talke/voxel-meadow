import type { Dog } from '../entities/dog';
import * as THREE from 'three';
import { state } from '../../engine/core/state';
import { V2, V3, rand, rr, store } from '../../engine/core/util';
import { camera, controls, renderer, scene, stage } from '../../engine/render/stage';
import { BEDS, FIELD, JETTY, LAKE } from '../world/layout';
import { colXZ, isWaterCol } from '../../engine/terrain/grid';
import { B } from '../../engine/core/scale';
import { LOOK } from '../world/decor';
import { ballMesh, bedMesh, groundTop } from '../world/mesh';
import { cats, dogs, ents } from '../entities/registry';
import { hideHint, showHint } from './hint';
import { SFX, SND, whistle } from '../audio/sound';
import { CLOCK, timeText } from '../world/clock';
import { WHISTLE } from '../world/whistle';
import { S, dogMeshes } from '../entities/behaviours';
import { CLOTHS, clothMeshes, saveCloth } from '../entities/cloth';
import { SB } from '../entities/ball';
import { isTap, nearestOnScreen, pickGround as pickGroundE, pointerRay, ray } from '../../engine/input/pointer';
export { pointerRay };
const WALLPAPER_BUILD = import.meta.env.PROD;

export function callThem() { hideHint(); state.camMode = 'both'; whistle(); if (SND.on && SND.ctx) SFX.whistle(); dogs.forEach(d => d.interrupt(d.B('hello'), 'hello')); }
export function playtime() {
  const awake = dogs.filter(d => d.poseName !== 'sleep');
  const lead = (awake.length ? awake : dogs)[Math.floor(rand() * (awake.length || 2))];
  lead.forceChase = true; state.camMode = 'both';
  if (lead.other.poseName === 'sleep') lead.other.interrupt([S.hold('stand', 0.3)], 'wake');
  lead.interrupt(lead.B('zoomies'), 'zoomies');
}
export function ballGame(forced) {
  hideHint(); state.camMode = 'both';
  const m = dogs[0];
  if (m.behaviour === 'ball') return;
  m.forceChase = forced;
  if (m.other.poseName === 'sleep') m.other.interrupt([S.hold('stand', 0.3)], 'wake');
  m.interrupt(m.B('ball'), 'ball');
}
let saveT = 0, messHinted = !!store.get('meadow-mess-hint');
export function clothCheck(dt) {
  saveT += dt; if (saveT > 8) { saveT = 0; saveCloth(); }
}
// a freshly made bed is irresistible to Murphy
CLOTHS.forEach(c => { c.onTidy = () => {
  saveCloth();
  if (c.bed === undefined) return;
  const d = dogs[c.bed];
  if (d && d.poseName !== 'sleep' && d.free() && rand() < (d.p.eager ? 0.7 : 0.35)) {
    const bd = BEDS[c.bed], his = d.p.pro;
    d.interrupt([S.go(V2(bd.x, bd.z), d.p.eager ? 'trot' : 'walk', { text: 'Checking out ' + his + ' tidy bed', arrive: 1.6 }), S.hold('sniff', 1.2, { text: 'Checking out ' + his + ' tidy bed', look: 'none' }), S.spin(1), S.face(() => bd.rot),
      S.hold('lie', rr(8, 14), { text: d.p.eager ? 'Testing the freshly made bed' : 'Settling into ' + his + ' fresh blanket' }), S.hold('stand', 0.6)], 'bedtest');
  }
}; });
export function napTime() { state.camMode = 'both'; dogs.forEach(d => { if (d.behaviour !== 'nap') d.interrupt(d.B('nap'), 'nap'); }); }
function bedNap(i) { const d = dogs[i]; if (!d) return; state.camMode = 'both'; if (d.behaviour !== 'nap') { d.interrupt(d.B('nap'), 'nap'); } }
export function goTo(x, z) {
  const c = colXZ(x, z); if (!c) return;
  let key = 'spot';
  const bi = x / B, bj = z / B;
  if (c.jetty || (Math.abs(bj - (JETTY.j0 + JETTY.j1) / 2) < 5 && bi > JETTY.i0 - 2 && bi < JETTY.i1 + 2)) key = 'jetty';
  else if (c.type === 'shallow' || (c.type === 'sand' && Math.hypot(bi - LAKE.i, bj - LAKE.j) < LAKE.r + 6)) key = 'beach';
  else if (isWaterCol(c)) key = 'drink';
  else if (Math.hypot(bi - LOOK.i, bj - LOOK.j) < 9) key = 'lookout';
  else if (c.forest) key = 'woods';
  else if (Math.hypot(bi - FIELD.i, bj - FIELD.j) < FIELD.r + 2) key = 'field';
  const p = V2(x, z);
  state.camMode = 'both';
  const lead = dogs[0].poseName === 'sleep' && dogs[1].poseName !== 'sleep' ? dogs[1] : dogs[0];
  lead.lastPlace = lead.other.lastPlace = key;
  lead.interrupt(lead.adventure(key, p, true), 'adventure');
  ring(x, z);
}
// a soft ring where you tapped
export const ringMesh = new THREE.Mesh(new THREE.RingGeometry(3, 3.9, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
ringMesh.rotation.x = -Math.PI / 2; scene.add(ringMesh);

function ring(x, z) { ringMesh.position.set(x, groundTop(x, z) + 0.6, z); state.ringT = 1; }

export function pickThing() {
  const targets: THREE.Object3D[] = [...dogMeshes, ballMesh, bedMesh, ...clothMeshes, ...CLOCK.g.children, ...CLOCK.head.children, ...WHISTLE.meshes];
  const hits = ray.intersectObjects(targets, false);
  if (!hits.length) return null;
  const h = hits[0], o = h.object;
  if (WHISTLE.meshes.includes(o as THREE.Mesh)) return { kind: 'whistle' };
  if (o.parent === CLOCK.g || o.parent === CLOCK.head) return { kind: 'clock' };
  if (o === ballMesh) return { kind: 'ball' };
  if (o.userData.cloth) return { kind: 'cloth', cloth: o.userData.cloth, point: h.point };
  if (o === bedMesh) { const i = BEDS.reduce((b, bd, k) => Math.hypot(h.point.x - bd.x, h.point.z - bd.z) < Math.hypot(h.point.x - BEDS[b].x, h.point.z - BEDS[b].z) ? k : b, 0); return { kind: 'bed', bed: i }; }
  return { kind: 'dog', dog: o.userData.dog };
}
const nearDog = (e, px) => nearestOnScreen<Dog>(dogs.concat(cats), e, px);
export function followDog(i) {
  if (state.camMode === i) { state.camMode = 'both'; return; }
  state.camMode = i; state.followZoom = true;
  if (!store.get('meadow-follow-hint')) { store.set('meadow-follow-hint', 1); showHint('Following ' + ents[i].name + '. Tap the name again to let go.', 6000); }
}
// the walking surface for taps: water, the bridges and the jetty deck sit a little above their columns
const pickGround = () => pickGroundE(c => (c.wl !== null ? c.wl : c.top * B) + (c.bridge ? 1.6 : 0) + (c.jetty ? 4.2 : 0));
export let down: { x: number; y: number; t: number } | null = null, hoverT = 0, drag: any = null;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), dragPt = new THREE.Vector3();
function endDrag() { if (!drag) return; clearTimeout(drag.hold); if (drag.moved) { for (const k of drag.ks) drag.cl.grabs.delete(k); saveCloth(); } controls.enabled = true; const d = drag; drag = null; return d; }
if (!WALLPAPER_BUILD) {
  renderer.domElement.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    pointerRay(e);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag || drag.done) return;
    if (!drag.moved && Math.hypot(e.clientX - down!.x, e.clientY - down!.y) < 6) return;
    if (!drag.moved) { drag.moved = true; clearTimeout(drag.hold); hideHint();
      const cl = drag.cl, nx = cl.nx, kx = drag.k % nx, kz = Math.floor(drag.k / nx), p0 = [cl.p[drag.k * 3], cl.p[drag.k * 3 + 2]];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = kx + dx, z = kz + dz; if (x < 0 || z < 0 || x >= nx || z >= cl.nz) continue;
        const k = z * nx + x, ox = cl.p[k * 3] - p0[0], oz = cl.p[k * 3 + 2] - p0[1]; drag.ks.push(k);
        cl.grabs.set(k, () => ({ x: drag.target.x + ox, y: drag.target.y, z: drag.target.z + oz }));
      } }
    pointerRay(e); dragPlane.constant = -drag.y;
    if (ray.ray.intersectPlane(dragPlane, dragPt)) drag.target.copy(dragPt);
  });
  renderer.domElement.addEventListener('pointercancel', endDrag);
  renderer.domElement.addEventListener('pointerup', e => {
    const dr = endDrag();
    if (dr && (dr.moved || dr.done)) { down = null; return; }
    const touch = e.pointerType === 'touch';
    if (isTap(down, e)) {
      hideHint(); pointerRay(e);
      let th = pickThing();
      const nd = (!th || (th.kind !== 'ball' && th.kind !== 'whistle')) ? nearDog(e, touch ? 52 : 30) : null;
      if (nd) th = { kind: 'dog', dog: nd };
      if (th && th.kind === 'dog') { th.dog.pat(); if (ents.includes(th.dog)) { if (state.camMode !== th.dog.idx) { state.camMode = th.dog.idx; state.followZoom = true; } th.dog.talkT = 4; } }
      else if (th && th.kind === 'whistle') { WHISTLE.kick = 1; callThem(); }
      else if (th && th.kind === 'ball') { const a = rand() * 6.283; SB.vel.set(Math.cos(a) * 45, Math.sin(a) * 45); SB.vy = 60; ballGame(true); }
      else if (th && th.kind === 'cloth') { if (th.cloth.bed !== undefined) bedNap(th.cloth.bed); else napTime(); }
      else if (th && th.kind === 'bed') bedNap(th.bed);
      else if (th && th.kind === 'clock') showHint('The meadow clock says ' + timeText() + (state.timeMode === 'live' ? '.' : ', running fast.'), 3000);
      else { const g = pickGround(); if (g) goTo(g.x, g.z); }
    }
    down = null;
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || down || drag) return;
    const now = performance.now(); if (now - hoverT < 90) return; hoverT = now;
    pointerRay(e); stage.classList.toggle('pointer', !!pickThing());
  });
}
