/**
 * Late-bound callbacks that let low-level modules (sky, camera) notify higher-level ones (sound, menu)
 * without importing them, which would create import cycles. The owning module assigns its hook at load.
 */
export interface Hooks {
  /** Rolls a thunderclap `delay` seconds after the flash. */
  thunder?: (delay: number) => void;
  /** Re-reads camera, sky and sound state into the settings menu. */
  syncMenu?: () => void;
}

export const hooks: Hooks = {};
