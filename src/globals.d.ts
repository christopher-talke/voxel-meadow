/// <reference types="vite/client" />

/** Build-time flag from vite.config.ts: true for the wallpaper build (dist/), false for dev and the Pages build. */
declare const __WALLPAPER__: boolean;

/** Test hook: window.MEADOW exposes the sim to the headless Playwright checks. */
interface Window {
  MEADOW?: any;
}
