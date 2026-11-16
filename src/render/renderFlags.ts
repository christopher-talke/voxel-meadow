import { store } from '../core/util';

const WALLPAPER_BUILD = import.meta.env.PROD;
export const USE_SMOOTH_TOON_RENDERER = true;

let smoothToonRenderer = WALLPAPER_BUILD
  ? USE_SMOOTH_TOON_RENDERER
  : store.get('meadow-smooth') !== '0';
const listeners = new Set<(enabled: boolean) => void>();

export function isSmoothToonRenderer() {
  return smoothToonRenderer;
}

export function setSmoothToonRenderer(enabled: boolean, persist = true) {
  const next = !!enabled;
  if (next === smoothToonRenderer) return;
  smoothToonRenderer = next;
  if (!WALLPAPER_BUILD && persist) store.set('meadow-smooth', next ? '1' : '0');
  listeners.forEach(fn => fn(next));
}

export function toggleSmoothToonRenderer() {
  setSmoothToonRenderer(!smoothToonRenderer);
}

export function onSmoothToonRendererChange(fn: (enabled: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
