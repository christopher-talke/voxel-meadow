import { store } from '../../engine/core/util';
import { chain, setDirector } from '../../engine/director/director';
import { loadMemory, memoryDirector, saveMemory } from './memory';
import { temperamentDirector } from './temperament';
import { attentionTick, resetAttention } from './attention';

// ================= lively mode: daily temperament, memory and attention =================
// Off by default until signed off: with it off the animals choose exactly as they always have.
// Turn on with ?lively in the URL, MEADOW.setLively(true), or the stored preference.
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
setLively(/[?&]lively\b/.test(location.search) || store.get('meadow-lively') === 1, false);
