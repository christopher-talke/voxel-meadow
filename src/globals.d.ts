/// <reference types="vite/client" />

/** Test hook: window.MEADOW exposes the sim to the headless Playwright checks. */
interface Window {
  MEADOW?: any;
}
