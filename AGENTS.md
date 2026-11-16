# Voxel Meadow — Project Guide

## 1. Project summary

Voxel Meadow is a client-only, interactive 3D memorial meadow for Murphy, Mali, Bobby, Billy, and Ashy. A visitor can watch autonomous animal behaviour, follow animals with several cameras, pat or call them, start play or naps, move them around the island, adjust time and weather, and enable synthesized spatial audio. The intended production artifact is a single `dist/index.html` that can be opened offline. There is no backend, accounts, remote database, or application API. See `README.md` and `index.html`.

## 2. Technology stack

- **Application:** TypeScript targeting ES2022, native ES modules, HTML, and CSS.
- **Rendering/simulation:** Three.js 0.128.0 with a custom voxel surface mesher, instanced animal rigs, shaders, OrbitControls, and a `requestAnimationFrame` loop.
- **Browser services:** Web Audio, WebGL, pointer/touch events, `localStorage`, and media queries for coarse pointers and reduced motion.
- **Build:** Vite 8.3.8 and `vite-plugin-singlefile` 2.3.4; TypeScript 7.0.2 performs no-emit checking. Vite requires Node `^20.19.0 || >=22.12.0`; no project Node version pin was found.
- **Assets/tests:** Python voxel generators and Playwright scripts. The soak test launches `/usr/bin/google-chrome` and loads the built HTML through a `file://` URL.
- **Data:** Procedural terrain and generated animal geometry; JSON/localStorage for rigs and preferences/cloth state. There is no database.

Dependency versions are in `package.json` and `package-lock.json`. Strict TypeScript is enabled, but `noImplicitAny` and `strictPropertyInitialization` are disabled (`tsconfig.json`).

## 3. Repository map

- `index.html` — static DOM shell, settings controls, name tags, external font links, and `/src/main.ts` entry.
- `src/main.ts` — composition root; imports CSS and modules in dependency order.
- `src/core/` — shared mutable `state`, deterministic math/random helpers, safe storage/DOM access, and late-bound `hooks`.
- `src/render/stage.ts` — WebGL renderer, scene, camera, OrbitControls, lights, fog, sky, and stars.
- `src/world/` — procedural terrain/walk grid (`layout.ts`), voxel geometry and scene props (`mesh.ts`, `decor.ts`), clock, and whistle.
- `src/sim/sky.ts` — simulated wall clock, sun/moon positions, weather, lighting, palettes, fog, rain, and material updates.
- `src/entities/` — `Dog` rig/locomotion/poses, shared behaviour factories/personas, roster and registry, ball, and cloth simulation.
- `src/nav/path.ts` — weighted eight-direction A*, traversal checks, and line-of-sight path smoothing.
- `src/camera/camera.ts` — follow, orbit, free, and cinematic camera behaviour.
- `src/audio/sound.ts` — lazily initialized Web Audio synthesis and ambient/SFX state.
- `src/ui/` — raycast/drag interaction, menu, name tags, and hints.
- `src/app/loop.ts` — frame orchestration, world stepping, camera updates, and rendering.
- `src/app/debug.ts` / `src/globals.d.ts` — optional `window.MEADOW` test/debug interface.
- `src/styles/main.css` — full-screen UI, floating tags, responsive controls, and accessibility media rules.
- `assets/rig.json` — generated runtime animal rig data imported by `entities/roster.ts`; `.vox` files are asset exports and are not directly imported by `src`.
- `tools/` — Python model/rig generators. Run generators from `tools/` because they use relative inputs/outputs. `tools/build.py` and `tools/vox_export.py` contain legacy assumptions; see constraints below.
- `test/` — standalone Playwright inspection/soak/screenshot scripts, not a unified assertion-based runner. `test/common.py` points tests at `dist/index.html` and supports `THREE_DIR`.
- `dist/`, `node_modules/`, screenshots, and Python caches — generated/ignored output.

## 4. Architecture and key flow

Initialization is side-effectful: imports construct the renderer and world, populate entity registries, attach DOM handlers, and start the frame loop. Cross-module writes belong in `core/state.ts`; entity collections live in `entities/registry.ts`; `core/hooks.ts` breaks low-level-to-high-level import cycles. `V3` is a shared scratch vector, so callers must consume/copy it before another operation reuses it.

**Ground-tap flow:**

1. `ui/interact.ts` handles `pointerup`, builds a camera ray with `pointerRay`, and calls `pickGround` when no object is selected.
2. `goTo(x, z)` classifies the terrain destination, chooses a lead dog, and interrupts its behaviour with an adventure step queue.
3. `Dog.update` consumes queued behaviour steps and requests routes with `findPath` when a movement goal needs one.
4. `nav/path.ts` searches the walkability/cost grid built by `world/layout.ts`; locomotion then applies turning, speed, avoidance, terrain height, gait, and pose blending.
5. `app/loop.ts` calls every entity and subsystem update, advances weather/camera/audio/effects, updates tags and cloth, and finishes with `renderer.render(scene, camera)`.

Other boundaries follow the same imperative model: settings handlers update shared state and persist preferences; `sim/sky.ts` pushes environmental values into Three.js materials/lights; audio initializes only after user activation; `window.MEADOW.advance` can deterministically step simulation time for tests.

## 5. Development workflow

Commands documented in `README.md` and defined in `package.json`:

```sh
npm install          # install JS dependencies
npm run dev          # Vite development server
npm run typecheck    # tsc --noEmit
npm run build        # typecheck, then Vite single-file build to dist/index.html
npm run preview      # preview the Vite production build
npm test             # python3 test/soak.py; build dist first
```

- Tests additionally require Python Playwright and Chrome at `/usr/bin/google-chrome`. `THREE_DIR` can override the default `node_modules/three/` location used by test request routing.
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
- Treat `assets/rig.json`, `.vox` exports, generator JSON, `dist/`, and test screenshots as generated artifacts; change their source generators rather than hand-editing where applicable.
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
