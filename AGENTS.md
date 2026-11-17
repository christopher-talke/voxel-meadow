# Voxel Meadow — Project Guide

## 1. Project summary

Voxel Meadow is a client-only, interactive 3D memorial meadow for Murphy, Mali, Bobby, Billy, and Ashy. A visitor can watch autonomous animal behaviour, follow animals with several cameras, pat or call them, start play or naps, move them around the island, adjust time and weather, and enable synthesized spatial audio. There are two single-file builds: `dist/index.html` (wallpaper: no UI or input, orbit camera) and `dist-pages/index.html` (shareable on GitHub Pages with the full menu and interaction). Both open offline. There is no backend, accounts, remote database, or application API. See `README.md` and `index.html`.

## 2. Technology stack

- **Application:** TypeScript targeting ES2022, native ES modules, HTML, and CSS.
- **Rendering/simulation:** Three.js 0.128.0 with a custom voxel surface mesher, instanced animal rigs, shaders, OrbitControls, and a `requestAnimationFrame` loop.
- **Browser services:** Web Audio, WebGL, pointer/touch events, `localStorage`, and media queries for coarse pointers and reduced motion.
- **Build:** Vite 8.3.8 and `vite-plugin-singlefile` 2.3.4; TypeScript 7.0.2 performs no-emit checking. Vite requires Node `^20.19.0 || >=22.12.0`; no project Node version pin was found.
- **Assets/tests:** Python voxel generators and Playwright scripts. The soak test launches `/usr/bin/google-chrome` and loads the built HTML through a `file://` URL.
- **Data:** Procedural terrain and generated animal geometry; JSON/localStorage for rigs and preferences/cloth state. There is no database.

Dependency versions are in `package.json` and `package-lock.json`. Strict TypeScript is enabled, but `noImplicitAny` and `strictPropertyInitialization` are disabled (`tsconfig.json`).

## 3. Repository map

The code is a library and an app: `src/engine` is the reusable engine, `src/meadow` is Voxel Meadow built on it. `tools/check-boundary.mjs` (run by `npm run typecheck`) fails if anything in `src/engine` imports from outside it. See `src/engine/README.md` for the engine's public API and what a content package provides.

- `index.html` — static DOM shell, settings controls, name tags, and the `/src/meadow/main.ts` entry.
- `src/engine/core/` — `scale.ts` (the only scale authority: `UNIT_CM`, `B`, `K`, `GRAV`), seeded random and math helpers, shared `state`, late-bound `hooks`.
- `src/engine/terrain/grid.ts` — column grid and walk grid, sized by `initGrid()` from the content.
- `src/engine/nav/path.ts` — weighted eight-direction A*, nearest-walkable and random-land queries.
- `src/engine/render/` — `stage.ts` (renderer, scene, camera, controls, lights, fog, sky dome, stars) and `mesher.ts` (voxel/column meshing, chunking, instanced boxes, see-through cutaway).
- `src/engine/sky/sky.ts` — sim clock, sun and moon, weather, rain; bound with `configureSky()`.
- `src/engine/camera/camera.ts` — follow, group, free, cinematic and auto camera; bound with `configureCamera()`.
- `src/engine/animal/animal.ts` — `Animal` (rig, locomotion, gait, gaze, pose blending, wetness, step queue) and generic steps.
- `src/engine/audio/synth.ts`, `src/engine/input/pointer.ts`, `src/engine/fx/` — synth primitives, pointer ray/taps/ground pick, sprite puffs and wet fur.
- `src/engine/app/loop.ts` — frame loop with a fixed hook order; started with `startLoop()`.
- `src/meadow/` — the island (`world/`), the five animals, personas and behaviours (`entities/`), the meadow's camera shots, sound, UI chrome, CSS, loop hooks, `app/debug.ts` (`window.MEADOW`) and `main.ts` (composition root).
- `assets/rig.json` — generated runtime animal rig data imported by `meadow/entities/roster.ts`; `.vox` files are asset exports and are not directly imported by `src`.
- `tools/` — Python model/rig generators. Run generators from `tools/` because they use relative inputs/outputs. `tools/build.py` and `tools/vox_export.py` contain legacy assumptions; see constraints below.
- `test/` — Playwright scripts. `baseline.py`/`compare.py` capture and diff a world fingerprint, a 600 s behaviour trace and fixed-camera stills; `camsmoke.py`, `propshot.py`, `wetshot.py`, `beyondshot.py` render checks. `test/common.py` picks the browser (`CHROME`) and bundle (`MEADOW_DIST`).
- `.github/workflows/pages.yml` — builds `dist-pages/` and deploys it to GitHub Pages on push to `main`.
- `dist/`, `dist-pages/`, `node_modules/`, `.venv/`, `test/baseline/`, screenshots, and Python caches — generated/ignored output.

## 4. Architecture and key flow

Initialization is side-effectful: imports construct the renderer and world, populate entity registries, attach DOM handlers, and start the frame loop. Engine modules that need the world are bound once by the content (`configureSky`, `configureCamera`, `startLoop`) and make no draws from the shared random stream at load. One shared seeded `rand` stream drives world generation and the animals, so module evaluation order shapes the world: any refactor must leave `MEADOW.fingerprint()` and `MEADOW.trace()` unchanged. `V3` is a shared scratch vector, so callers must consume/copy it before another operation reuses it.

**Ground-tap flow:**

1. `meadow/ui/interact.ts` handles `pointerup`, uses the engine's `isTap` and `pointerRay`, and calls `pickGround` when no object is selected.
2. `goTo(x, z)` classifies the terrain destination, chooses a lead dog, and interrupts its behaviour with an adventure step queue.
3. `Animal.update` consumes queued steps and requests routes with `findPath` when a movement goal needs one; the meadow `Dog` supplies `pick()`, `think()` and the other hooks.
4. Locomotion applies turning, speed, avoidance, ground height, gait, and pose blending.
5. The engine loop calls the meadow's `step`, `visuals`, `late` and `beforeRender` hooks around the camera, then renders.

## 5. Development workflow

Commands documented in `README.md` and defined in `package.json`:

```sh
npm install          # install JS dependencies
npm run dev          # Vite development server
npm run typecheck    # tsc --noEmit
npm run build        # typecheck, then wallpaper single-file build to dist/index.html
npm run build:pages  # typecheck, then full-UI single-file build to dist-pages/index.html
npm run preview      # preview the Vite production build
npm test             # python3 test/soak.py; build dist first
```

- Tests additionally require Python Playwright and Chrome at `/usr/bin/google-chrome`. `THREE_DIR` can override the default `node_modules/three/` location used by test request routing.
- Wallpaper versus full UI is the build-time `__WALLPAPER__` constant (declared in `src/globals.d.ts`, set in `vite.config.ts`: true only for `vite build` without `--mode pages`). Gate any new UI or input on it the same way; do not use `import.meta.env.PROD` for this.
- Run `tools/export_rig.py` from `tools/` to regenerate `assets/rig.json` after model changes; the voxel scripts also write `.vox`/JSON files in that directory.
- No lint, formatting, CI, deployment, Python dependency manifest, or automated screenshot-test commands were found.
- **Not executed during familiarization:** install, typecheck, build, or tests. `node_modules/` and `dist/` were absent. Available tooling was Node 24.14.0/npm 11.9.0 on Windows and Python 3.12.3 in WSL; WSL lacked Playwright and `/usr/bin/google-chrome`.

## 6. Conventions and constraints

- Preserve module dependency order and avoid import cycles. Use `state`, registry arrays, or a late-bound hook rather than introducing a reverse import.
- Match the existing compact, imperative style: many updates are deliberately single-line, geometry is constructed at import time, and mutable Three.js objects are shared. Do not rewrite this as a framework application as part of a focused change.
- Add stronger types incrementally. Existing public interfaces coexist with many intentional `any` annotations and loose converted-JavaScript areas.
- Use the existing seeded `rand`/`rr` helpers for simulation randomness when repeatable behaviour matters; audio noise intentionally uses `Math.random`.
- Reuse `store` for JSON-serialized `meadow-*` preferences and `$` for required static DOM elements. Storage and audio fail soft; a missing required DOM element throws immediately. There is no central logger or error boundary.
- Preserve touch/coarse-pointer handling, safe-area CSS, and `prefers-reduced-motion` behaviour. UI markup and styles use small DOM nodes and CSS variables rather than components.
- Treat `assets/rig.json`, `.vox` exports, generator JSON, `dist/`, `dist-pages/`, and test screenshots as generated artifacts; change their source generators rather than hand-editing where applicable.
- `tools/build.py` is stale: it references missing `src/shell.html` and `src/app.js`. Use `npm run build` instead. `tools/vox_export.py` has a hard-coded `/home/claude/export_rig.py` dependency and is not a portable default workflow.
- Tests commonly print collected `pageerror` values or screenshots rather than asserting them; inspect output instead of treating process exit zero alone as a correctness guarantee.

## 7. Open questions

- `package.json` reports version 0.35.0 while the lockfile root reports 0.34.0, and the root dependency specs also differ in exact-versus-caret form. Confirm intended metadata before relying on a clean-install baseline.
- The single-file/offline claim coexists with Google Fonts links in `index.html`; system-font fallbacks exist, but fully disconnected visual output has not been verified.
- No current build/test baseline is available in this checkout because dependencies and browser-test prerequisites are absent.
- The breadth and ownership of the many standalone test scripts are undocumented; only `test/soak.py` is wired to `npm test`.
- The modified `src/camera/camera.ts` working-tree change predates this inspection and was not reviewed or altered.

## 8. Suggested next inspection

Establish a clean baseline in the intended WSL environment: reconcile/confirm package metadata, install declared dependencies plus Playwright/Chrome, then run `npm run typecheck`, `npm run build`, and `npm test`. For feature work involving views, inspect `src/camera/camera.ts` together with the orbit/touch/cinematic scripts under `test/`.
