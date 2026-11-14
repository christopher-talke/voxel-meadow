# Voxel Meadow

A gentle 3D voxel memorial meadow for Murphy, Mali, Bobby, Billy and Ashy. Built on three.js r128 with a custom voxel mesher, instanced voxel animals, a day/night and weather cycle, synthesised sound and a few cameras. Ships as one offline HTML file.

## Run

```
npm install
npm run dev        # vite dev server
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + single-file bundle -> dist/index.html
npm test           # headless soak test (needs python3 playwright + google-chrome)
```

## Layout

```
src/
  main.ts           entry, imports modules in dependency order
  core/             util, shared state, late-bound hooks
  render/           renderer, scene, camera, lights
  world/            layout (terrain grid), decor, mesher, clock, whistle post
  sim/              sky shader, palettes, weather
  entities/         dog (voxel animal rig), behaviours, cloth, ball, roster, registry
  nav/              grid pathfinding
  camera/           orbit / free / follow / cinematic shots
  audio/            WebAudio synth
  fx/               sprites
  ui/               hint, tap/touch interaction, menu, name tags
  app/              main loop, window.MEADOW debug hook
assets/             rig.json and .vox models
tools/              python voxel generators
test/               headless Playwright checks (tests load dist/index.html)
```

## Notes

- Strict TypeScript with `noImplicitAny` off: the code was converted from a single JS file, so some loosely typed parts remain as `any`. Tighten gradually.
- Module cycles are avoided with the `registry` arrays, the shared `state` object and `core/hooks.ts`.
- `window.MEADOW` exposes internals for the tests.
