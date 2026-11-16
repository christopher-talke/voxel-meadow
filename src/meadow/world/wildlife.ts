import * as THREE from 'three';
import { smooth } from '../../engine/core/util';
import { B } from '../../engine/core/scale';
import { G, cols, idxOf } from '../../engine/terrain/grid';
import { type AgentKind, addAgents } from '../../engine/ambient/agents';
import { WX, env } from '../../engine/sky/sky';
import { FIELD, WOODS } from './layout';
import { TREES } from './decor';
import { groundTop } from './mesh';
import { ents } from '../entities/registry';

// ================= the meadow's small wildlife =================
// Little brown birds and a few magpies on the grass, bees in the flower field, dragonflies over the lake, cabbage whites
// drifting about, and a couple of rabbits at the edge of the woods. Nobody catches anything: birds flush, rabbits bolt.
// Sizes are true to the scale (1 unit is about 3.2 cm): a small bird is about 8 cm, a rabbit about 35 cm long.

// candidate spots, gathered once from the finished island
const lawn: number[] = [], lake: number[] = [], field: number[] = [], woodsEdge: number[] = [];
for (const c of cols) {
  if (!c) continue;
  const k = idxOf(c.i, c.j);
  if ((c.wade || c.swim) && !c.jetty) { lake.push(k); continue; }
  if (!G.walk[k] || c.wade || c.bridge || c.jetty || c.type === 'sand') continue;
  lawn.push(k);
  if (Math.hypot(c.i - FIELD.i, c.j - FIELD.j) < FIELD.r) field.push(k);
  const dw = Math.hypot(c.i - WOODS.i, c.j - WOODS.j); if (dw > WOODS.r - 2 && dw < WOODS.r + 8 && !c.forest) woodsEdge.push(k);
}
const cellXZ = (k: number, r: () => number, v: THREE.Vector3, y: number) => { const c = cols[k]!; const x = c.i * B + (r() - 0.5) * B, z = c.j * B + (r() - 0.5) * B; return v.set(x, groundTop(x, z) + y, z); };
const pickIn = (list: number[], r: () => number) => list[Math.floor(r() * list.length)];
const threats = () => ents.map(e => e.pos);
const daylight = () => smooth(-4, 8, env.el) * (1 - 0.7 * WX.rain);
const _v = new THREE.Vector3();

// small brown birds: they land on the lawn, hop and peck, and flush when anyone comes near
const brown = 0x8a6a4a, dark = 0x5a4030;
addAgents({
  name: 'bird', style: 'flier', count: 8, speed: 42, flushR: 20, seed: 101,
  parts: [{ size: [2.2, 1.4, 1.4], at: [0, 0.9, 0], col: brown }, { size: [1.1, 1.1, 1.1], at: [1.3, 1.6, 0], col: 0x6a4e36 }, { size: [0.5, 0.25, 0.25], at: [2.0, 1.5, 0], col: 0xe0b040 },
    { size: [1.2, 0.3, 0.6], at: [-1.5, 1.1, 0], col: dark }, { size: [1.4, 0.2, 1.2], at: [0, 1.3, 1.3], col: dark, flap: 1 }, { size: [1.4, 0.2, 1.2], at: [0, 1.3, -1.3], col: dark, flap: -1 }],
  spot: (r, perch) => cellXZ(pickIn(lawn, r), r, _v, perch ? 0 : 18 + r() * 30),
  ground: groundTop, threats, activity: daylight,
});
// magpies: bigger, black and white, a few of them strutting about the open grass
addAgents({
  name: 'magpie', style: 'flier', count: 3, speed: 46, flushR: 28, scale: 1.7, seed: 102,
  parts: [{ size: [2.2, 1.4, 1.4], at: [0, 0.9, 0], col: 0x1d1d20 }, { size: [1.1, 1.1, 1.1], at: [1.3, 1.6, 0], col: 0x1d1d20 }, { size: [0.6, 0.25, 0.25], at: [2.05, 1.5, 0], col: 0xc9c2b2 },
    { size: [1.6, 0.3, 0.7], at: [-1.7, 1.1, 0], col: 0x1d1d20 }, { size: [1.4, 0.2, 1.2], at: [0, 1.3, 1.3], col: 0xf2f0ea, flap: 1 }, { size: [1.4, 0.2, 1.2], at: [0, 1.3, -1.3], col: 0xf2f0ea, flap: -1 }],
  spot: (r, perch) => cellXZ(pickIn(lawn, r), r, _v, perch ? 0 : 20 + r() * 30),
  ground: groundTop, threats, activity: daylight,
});
// bees: busy in the flower field on warm, calm days
addAgents({
  name: 'bee', style: 'hover', count: 12, speed: 14, scale: 0.45, seed: 103,
  parts: [{ size: [1.1, 0.8, 0.8], at: [0, 0, 0], col: 0xf2c230 }, { size: [0.35, 0.85, 0.85], at: [-0.15, 0, 0], col: 0x2a2420 }, { size: [0.6, 0.1, 0.7], at: [0, 0.5, 0.35], col: 0xeef4ff, flap: 1 }, { size: [0.6, 0.1, 0.7], at: [0, 0.5, -0.35], col: 0xeef4ff, flap: -1 }],
  spot: r => cellXZ(pickIn(field, r), r, _v, 2 + r() * 2.5),
  ground: groundTop, threats: () => [], activity: () => env.bugs,
});
// dragonflies: darting low over the lake
addAgents({
  name: 'dragonfly', style: 'hover', count: 6, speed: 30, scale: 0.8, seed: 104,
  parts: [{ size: [3.2, 0.35, 0.35], at: [0, 0, 0], col: 0x2f86a8 }, { size: [0.6, 0.6, 0.6], at: [1.8, 0, 0], col: 0x1f5a70 },
    { size: [0.6, 0.08, 2.2], at: [0.6, 0.2, 1.1], col: 0xdff2ff, flap: 1 }, { size: [0.6, 0.08, 2.2], at: [0.6, 0.2, -1.1], col: 0xdff2ff, flap: -1 },
    { size: [0.5, 0.08, 1.9], at: [-0.1, 0.2, 0.95], col: 0xdff2ff, flap: 1 }, { size: [0.5, 0.08, 1.9], at: [-0.1, 0.2, -0.95], col: 0xdff2ff, flap: -1 }],
  spot: r => cellXZ(pickIn(lake, r), r, _v, 3 + r() * 5),
  ground: groundTop, threats: () => [], activity: () => env.bugs,
});
// cabbage whites: wandering, bobbing, settling on the grass now and then
addAgents({
  name: 'butterfly', style: 'flutter', count: 8, speed: 9, seed: 105,
  parts: [{ size: [1.2, 0.3, 0.3], at: [0, 0, 0], col: 0x3a3330 }, { size: [1.3, 0.1, 1.1], at: [0, 0.1, 0.65], col: 0xfdfbf2, flap: 1 }, { size: [1.3, 0.1, 1.1], at: [0, 0.1, -0.65], col: 0xfdfbf2, flap: -1 }],
  spot: (r, perch) => cellXZ(pickIn(r() < 0.5 ? field : lawn, r), r, _v, perch ? 1.2 : 4 + r() * 10),
  ground: groundTop, threats: () => [], activity: () => env.bugs,
});
// rabbits: grazing at the edge of the woods, bolting for the trees when anyone comes close
const RABBIT = 0xa58a6c;
addAgents({
  name: 'rabbit', style: 'runner', count: 2, speed: 28, flushR: 48, seed: 106,
  parts: [{ size: [6, 4.2, 3.6], at: [0, 2.6, 0], col: RABBIT }, { size: [3, 3, 2.6], at: [3.4, 4.2, 0], col: RABBIT }, { size: [0.8, 3, 0.6], at: [3.0, 6.8, 0.7], col: 0xb59a7c }, { size: [0.8, 3, 0.6], at: [3.0, 6.8, -0.7], col: 0xb59a7c },
    { size: [1.2, 1.2, 1.2], at: [-3.3, 3, 0], col: 0xf2ece0 }],
  spot: (r) => cellXZ(pickIn(woodsEdge.length ? woodsEdge : lawn, r), r, _v, 0),
  cover: (from) => { let best = TREES[0], bd = 1e9; for (const t of TREES) { const d = Math.hypot(t[0] * B - from.x, t[1] * B - from.z); if (d < bd) { bd = d; best = t; } } const x = best[0] * B + 3, z = best[1] * B + 3; return _v.set(x, groundTop(x, z), z); },
  ground: groundTop, threats, activity: daylight,
});
