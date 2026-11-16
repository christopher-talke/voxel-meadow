import { store } from './util';

/** How fast the meadow clock runs against real time. */
export const TIME_RATE = { live: 1, cycle: 72, fast: 360 } as const;
export type TimeMode = keyof typeof TIME_RATE;
const WALLPAPER_BUILD = import.meta.env.PROD;

/** Which view the camera is in: everyone, one animal (index), or a scripted mode. */
export type CamMode = 'both' | 'orbit' | 'cine' | 'free' | number;

/**
 * Mutable state shared between modules. ES module bindings cannot be reassigned by importers,
 * so anything that more than one module writes lives here.
 */
export const state = {
  /** Seconds of simulated time since start. */
  T: 0,
  /** Extra fog distance used while the whole island is in view. */
  fogPush: 0,
  /** True while the user is dragging or pinching the view. */
  gesture: false,
  /** True while a follow-cam is easing in to its friendly distance. */
  followZoom: false,
  lastInteract: performance.now(),
  timeMode: (WALLPAPER_BUILD ? 'cycle' : (TIME_RATE[store.get('meadow-time') as TimeMode] ? store.get('meadow-time') : 'live')) as TimeMode,
  /** Simulated wall-clock time in ms since the epoch. */
  simMs: Date.now(),
  /** Current angle of the island orbit camera. */
  orbitA: 0,
  camMode: (WALLPAPER_BUILD ? 'orbit' : 'both') as CamMode,
  seeThrough: WALLPAPER_BUILD ? false : store.get('meadow-see') !== '0',
  autoCam: WALLPAPER_BUILD ? false : store.get('meadow-autocam') === '1',
  /** Floating name tags over each animal; off unless the visitor turns them on. */
  showTags: WALLPAPER_BUILD ? false : store.get('meadow-tags') === '1',
  /** Seconds since the auto camera last cut. */
  autoT: 0,
  /** Fade of the tap ring (1 to 0). */
  ringT: 0,
};
