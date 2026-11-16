import { store } from '../../engine/core/util';
import { chain, setDirector } from '../../engine/director/director';
import { loadMemory, memoryDirector, saveMemory } from './memory';
import { temperamentDirector } from './temperament';
import { attentionTick, resetAttention } from './attention';

// ================= lively mode: daily temperament, memory and attention =================
// On by default (signed off 2026-11-16). Turned off from the settings menu, with ?calm, or MEADOW.setLively(false);
// with it off the animals choose exactly as they did before it existed.
export const LIVELY = { on: false };
export function setLively(on: boolean, persist = true) {
  LIVELY.on = on;
  if (persist) store.set('meadow-lively', on ? 1 : 0);
  if (on) loadMemory(); else resetAttention();
  setDirector(on ? chain(temperamentDirector, memoryDirector) : null);
}
let saveT = 0;
/** Per simulation step: attention, and now and then a save of what everyone remembers. */
export function livelyStep(dt: number) {
  if (!LIVELY.on) return;
  attentionTick(dt);
  if ((saveT += dt) > 30) { saveT = 0; saveMemory(); }
}
// on unless the viewer turned it off in settings, or the address asks for ?calm (the old behaviour, for comparison)
setLively(/[?&]lively\b/.test(location.search) || (!/[?&]calm\b/.test(location.search) && store.get('meadow-lively') !== 0), false);
