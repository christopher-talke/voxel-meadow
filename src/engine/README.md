# Engine

A small library for gentle voxel worlds with animals in them. It is not a framework: there is no plugin
registry, ECS or scripting layer. Content imports the modules it needs, calls a few `configure*` functions
once at load, and subclasses `Animal`. Everything bundles into one offline HTML file with three.js r128.

Nothing in `src/engine` may import from outside it (three.js aside). `npm run typecheck` checks this.

## Public API

| Module | What it gives you |
|---|---|
| `core/scale` | `UNIT_CM` (3.2 cm per unit), `B` (terrain block), `K` (animal voxel), `GRAV` |
| `core/util` | seeded `rand`/`rr`, `seeded()` for side streams, `noise`, `hash`, `clamp`/`lerp`/`smooth`/`damp`, `store`, `$` |
| `core/state`, `core/hooks` | shared mutable state (clock, camera mode, test hooks) and late-bound callbacks |
| `terrain/grid` | `initGrid(r)`, `cols`, `G` (walk, level, ground height, cost), `colAt`, `colXZ`, `cellIdx`, `block`, `blockRect` |
| `nav/path` | `findPath`, `nearestWalk`, `randLand`, `bankNear`, `canStep` |
| `render/stage` | renderer, scene, camera, controls, sun and sky lights, fog, sky dome, stars (needs a `#stage` element) |
| `render/mesher` | `meshColumns`, `meshVoxels`, `chunks`, `buildBoxes`, `freeze`, `applyCutaway`, `DK` voxel keys |
| `sky/sky` | `configureSky()`, `env`, `WX` (weather), `updateEnv`, `setTod`, `simDate`, `underRoof` |
| `camera/camera` | `configureCamera()`, `setCamMode`, follow, free, cinematic shot player, automatic cuts, line of sight |
| `animal/animal` | `Animal`, generic `steps` (`go`, `hold`, `face`, `spin`, `climb`, `branchGo`, `call`), `BASE_POSE`, `PKEYS`, `SPEED`, `crowd` |
| `audio/synth` | `initSynth`, `sndOut`, `tone`, `noiseHit`, `updateListener` |
| `input/pointer` | `pointerRay`, `isTap`, `pickGround`, `nearestOnScreen` |
| `fx/sprites`, `fx/wet` | billboard puffs; wet fur shading and damp marks |
| `director/director` | `Director` interface and the default local weighted picker |
| `app/loop` | `startLoop()`, `stepWorld`, `ORBIT`, `fitOrbit`, `adaptState` |

## What a content package provides

1. **Terrain.** Call `initGrid(r)`, fill `cols` (heights, `wl` water level, `wade`/`swim` flags, any labels of its own),
   then fill `G`. Mesh it with `meshColumns`/`meshVoxels` and its own colour rules.
2. **Sky.** `configureSky({ palettes, lat, cover, ground, clouds, cloudMat, groundMat, waterMat, fireU, onBolt, weather })`.
3. **Camera.** `configureCamera({ subjects, group, ground, solid, shots, interest, label, hint, fade, joy })`.
4. **Animals.** Subclass `Animal`: `pick()` chooses the next behaviour (or ask a `Director`), `think()` runs standing urges,
   and `interruptPrelude`, `afterWet`, `onActivity`, `poseFor`, `standHeight` shape the rest. Pass a pose table
   (`{ ...BASE_POSE, ... }`) and a persona in the constructor options. Push walkers into `crowd`.
5. **Loop.** `startLoop({ step, visuals, late, beforeRender, orbit, fit, onDpr, clocks })`.

## Build flag

The engine reads one build-time constant, `__WALLPAPER__` (declared in `src/globals.d.ts`, defined by the content's
Vite config). When true, `state` starts in the orbit camera on a 20-minute day with tags, auto camera and see-through
off, OrbitControls are disabled and manual camera input is ignored. When false (dev server, shareable builds) the
stored preferences and full controls apply.

## Determinism

Simulation randomness comes from one seeded stream, so the order in which modules load and draw from it shapes the
world. Engine modules make no draws from that stream at load; decorative effects (rain, damp marks) use `seeded()`
side streams. Content that wants a repeatable world should do the same.
