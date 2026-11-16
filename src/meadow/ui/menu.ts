import { hooks } from '../../engine/core/hooks';
import { state, type TimeMode } from '../../engine/core/state';
import { $, V3, clamp, rr, store } from '../../engine/core/util';
import { camera, stage } from '../../engine/render/stage';
import { WX } from '../../engine/sky/sky';
import { ents } from '../entities/registry';
import { hideHint } from './hint';
import { SND, tgSound } from '../audio/sound';
import { timeText } from '../world/clock';
import { setCamMode } from '../../engine/camera/camera';
import { followDog } from './interact';

const WALLPAPER_BUILD = import.meta.env.PROD;

// the settings menu: one button, a tidy panel, and it all fades away when you leave it alone
const menuEl = $('menu'), btnMenu = $('btn-menu'), skyNow = $('skynow');
const selCam = $<HTMLSelectElement>('sel-cam'), selTime = $<HTMLSelectElement>('sel-time'), selWx = $<HTMLSelectElement>('sel-wx');
const tgAuto = $<HTMLInputElement>('tg-auto'), tgSee = $<HTMLInputElement>('tg-see'), tgTags = $<HTMLInputElement>('tg-tags'), tagsEl = $('tags');
const WXNAME = { clear: 'clear', cloudy: 'cloudy', windy: 'windy', rain: 'raining', storm: 'stormy' };
let menuT = 0, idleT = 0;
if (WALLPAPER_BUILD) document.documentElement.setAttribute('data-wallpaper', '1');
export function syncMenu() {
  selCam.value = String(state.camMode); selTime.value = state.timeMode; selWx.value = WX.mode;
  tgAuto.checked = state.autoCam; tgSee.checked = state.seeThrough; tgTags.checked = state.showTags; tgSound.checked = SND.on;
  skyNow.textContent = timeText() + ' in the meadow, ' + WXNAME[WX.kind];
}
hooks.syncMenu = syncMenu;
function openMenu(open) { menuEl.hidden = !open; btnMenu.setAttribute('aria-expanded', open ? 'true' : 'false'); menuT = 0; if (open) { hideHint(); syncMenu(); } }
btnMenu.addEventListener('click', e => { e.stopPropagation(); openMenu(menuEl.hidden); });
addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target as Node) && !(e.target as HTMLElement).closest('#btn-menu')) openMenu(false); });
for (const ev of ['pointerdown', 'pointermove', 'input', 'change', 'focusin', 'keydown']) menuEl.addEventListener(ev, () => { menuT = 0; });
selCam.addEventListener('change', () => { const v = selCam.value; setCamMode(/^\d$/.test(v) ? +v : v, true); selCam.blur(); });
selTime.addEventListener('change', () => { const v = selTime.value; if (v === 'live') state.simMs = Date.now(); state.timeMode = v as TimeMode; store.set('meadow-time', v); selTime.blur(); syncMenu(); });
selWx.addEventListener('change', () => { const v = selWx.value; WX.mode = v; store.set('meadow-wx', v); if (v === 'auto') WX.left = rr(120, 300); selWx.blur(); syncMenu(); });
tgAuto.addEventListener('change', () => { state.autoCam = tgAuto.checked; store.set('meadow-autocam', state.autoCam ? '1' : '0'); state.autoT = 99; });
tgSee.addEventListener('change', () => { state.seeThrough = tgSee.checked; store.set('meadow-see', state.seeThrough ? '1' : '0'); });
tgTags.addEventListener('change', () => { state.showTags = tgTags.checked; store.set('meadow-tags', state.showTags ? '1' : '0'); tagsEl.hidden = !state.showTags; shown.fill(''); });
tagsEl.hidden = !state.showTags;
// the menu closes itself after a quiet spell, and the button fades back until you move or touch
const appEl = $('app');
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { idleT = 0; appEl.classList.remove('idle'); }, { passive: true });
setInterval(() => {
  if (!menuEl.hidden) { menuT += 0.5; syncMenu(); if (menuT > 9 && !menuEl.contains(document.activeElement)) openMenu(false); }
  else { idleT += 0.5; if (idleT > 4) appEl.classList.add('idle'); }
}, 500);
syncMenu();

// name tags
const tags = [0, 1, 2, 3, 4].map(i => $('tag' + i));
const tagSub = tags.map(t => t.querySelector('i')!);
tags.forEach((t, i) => t.querySelector('b')!.addEventListener('click', ev => { ev.stopPropagation(); hideHint(); followDog(i); }));
const shown = ['', '', '', '', ''];
ents.forEach(d => { d.talkT = 0; });
const tagPos = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0, s: 1 }));
export function updateTags(dt) {
  if (!state.showTags) { for (const d of ents) d.talkT -= dt; return; }
  const w = stage.clientWidth, h = stage.clientHeight;
  ents.forEach((d, i) => {
    const txt = d.label();
    if (txt !== shown[i]) { shown[i] = txt; tagSub[i].textContent = txt; d.talkT = 4.5; }
    d.talkT -= dt;
    const p = V3.set(d.root.position.x, d.root.position.y + 18, d.root.position.z).project(camera);
    const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    const dist = camera.position.distanceTo(d.root.position);
    tags[i].classList.toggle('off', !vis || dist > 600);
    tags[i].classList.toggle('talk', d.talkT > 0 || state.camMode === i);
    tagPos[i].x = (p.x * 0.5 + 0.5) * w; tagPos[i].y = (-p.y * 0.5 + 0.5) * h; tagPos[i].s = clamp(130 / dist, 0.75, 1.1);
  });
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < tagPos.length; i++) for (let j = i + 1; j < tagPos.length; j++) {
    const a = tagPos[i], b = tagPos[j], gap = 40 + (ents[i].talkT > 0 || ents[j].talkT > 0 ? 18 : 0);
    if (Math.abs(a.x - b.x) < 110 && Math.abs(a.y - b.y) < gap) { const up = a.y <= b.y ? a : b, dn = up === a ? b : a, push = (gap - Math.abs(a.y - b.y)) / 2; up.y -= push; dn.y += push; }
  }
  tagPos.forEach((t, i) => { tags[i].style.transform = 'translate(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px) translate(-50%,-100%) scale(' + t.s.toFixed(3) + ')'; });
}
