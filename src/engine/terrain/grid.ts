import { B } from '../core/scale';

// ================= the terrain grid: one column per block, plus the walkability model =================
// The content package sizes the grid with initGrid(), fills `cols` with its terrain, then fills `G` from it.
// Exports are live bindings, so modules that import them before initGrid() still see the arrays it creates.

/** One terrain column. `type` is the content's own label; the engine only reads heights, water and the flags below. */
export interface Col {
  i: number; j: number;
  /** Height of the top block, in block units; base is where the grass starts, bot the underside. */
  top: number; base: number; bot: number;
  type: string;
  /** Water surface height in world units, or null for dry land. */
  wl: number | null;
  bridge: boolean; jetty: boolean; forest: boolean; edge: boolean;
  /** Standing water an animal can walk through (slowly), and water deep enough to swim in. Set by the content. */
  wade?: boolean; swim?: boolean;
  [extra: string]: any;
}
/** Grid half-size in blocks, and side length (2R + 1). */
export let R = 0, N = 0;
export let cols: (Col | null)[] = [];
/** Walk grid: walkable flag, step level, ground height in world units, and path cost multiplier per cell. */
export let G = { walk: new Uint8Array(0), lvl: new Int8Array(0), gy: new Float32Array(0), cost: new Float32Array(0) };
export function initGrid(r: number) {
  R = r; N = 2 * r + 1;
  cols = new Array(N * N).fill(null);
  G = { walk: new Uint8Array(N * N), lvl: new Int8Array(N * N), gy: new Float32Array(N * N), cost: new Float32Array(N * N) };
}
export const idxOf = (i, j) => (i + R) * N + (j + R);
export const inGrid = (i, j) => i >= -R && i <= R && j >= -R && j <= R;
export const colAt = (i, j) => inGrid(i, j) ? cols[idxOf(i, j)] : null;
export const colXZ = (x, z) => colAt(Math.round(x / B), Math.round(z / B));
export const cellIdx = (x, z) => { const i = Math.round(x / B), j = Math.round(z / B); return inGrid(i, j) ? idxOf(i, j) : -1; };
/** Any column with a water surface: lakes, shallows and creeks (bridged or not). */
export const isWaterCol = c => !!c && c.wl !== null;
export const gyAt = (x, z) => { const c = cellIdx(x, z); return c >= 0 ? G.gy[c] : 0; };
export function blockRect(x0, x1, z0, z1) { for (let i = Math.floor(x0 / B); i <= Math.ceil(x1 / B); i++) for (let j = Math.floor(z0 / B); j <= Math.ceil(z1 / B); j++) if (inGrid(i, j)) G.walk[idxOf(i, j)] = 0; }
export function block(i0, j0, r) { for (let i = Math.floor(i0 - r); i <= Math.ceil(i0 + r); i++) for (let j = Math.floor(j0 - r); j <= Math.ceil(j0 + r); j++) if (inGrid(i, j) && Math.hypot(i - i0, j - j0) <= r) G.walk[idxOf(i, j)] = 0; }
