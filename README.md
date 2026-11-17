# Voxel Meadow

A gentle 3D memorial meadow for Murphy, Mali, Bobby, Billy and Ashy, on a small island floating above the clouds. Built on three.js r128 with a custom voxel mesher, animated animal rigs, a day/night and weather cycle, synthesised spatial sound and a few cameras. Ships as one self-contained HTML file.

## Builds

There are two builds of the same meadow. Both are a single `index.html` with everything inlined.

| Build | Command | Output | For |
|---|---|---|---|
| Wallpaper | `npm run build` | `dist/index.html` | Wallpaper Engine or an always-on display. No menu, joystick, name tags or hint text; pointer and touch input off; island orbit camera; day in 20 minutes. |
| Pages | `npm run build:pages` | `dist-pages/index.html` | Sharing on GitHub Pages. The full settings menu and all interaction. |

The switch is the `__WALLPAPER__` constant set in `vite.config.ts` (`true` only for a normal `vite build`). The dev server behaves like the Pages build.

### What the Pages build lets visitors do

- **Settings menu** (top right): camera view (everyone, one animal, island orbit, cinematic, free), auto switch, name tags, lively days, see through objects, sound, time (live clock, day in 20 min, day in 4 min) and weather.
- **Tap or click** an animal to pat or follow it; tap the ground to send someone there; drag to orbit the camera.
- Settings are remembered per browser in `localStorage`. Add `?calm` to the URL to start with lively days off.

### Publishing to GitHub Pages

`.github/workflows/pages.yml` runs `npm run build:pages` on every push to `main` (or by hand from the Actions tab) and deploys `dist-pages/`.

One-off setup: in the repo, **Settings > Pages > Build and deployment > Source**, choose **GitHub Actions**. The site then appears at `https://<owner>.github.io/voxel-meadow/`.

To publish by hand instead, upload `dist-pages/index.html` to any static host. It also opens straight from disk.

## Develop

```
npm install
npm run dev          # vite dev server, full UI
npm run typecheck    # tsc --noEmit plus the engine boundary check
npm run build        # typecheck + wallpaper bundle -> dist/index.html
npm run build:pages  # typecheck + shareable bundle -> dist-pages/index.html
npm run preview      # serve the last build
npm test             # headless soak test against dist/ (needs Python Playwright and Chrome)
```

## Layout

```
src/
  engine/           reusable engine; must not import from outside itself (see src/engine/README.md)
    core/           scale, seeded random, util, shared state, late-bound hooks
    terrain/ nav/   column and walk grids, A* pathfinding
    render/         renderer, scene, lights, sky dome, mesher, cloud deck
    sky/            sim clock, sun and moon, weather, rain
    camera/         follow, group, orbit, free, cinematic and auto cameras
    animal/         Animal base: rig, locomotion, gait, gaze, poses, step queue
    ambient/ director/ audio/ input/ fx/ app/
  meadow/           Voxel Meadow built on the engine
    world/          island layout, decor, pond, clock, whistle post, wildlife, the sky beyond
    entities/       the five animals, behaviours, temperament, memory, cloth, ball, frogs
    camera/ audio/  meadow camera shots and sounds
    ui/             menu, tap/touch interaction, hint
    styles/         CSS
    app/            loop hooks, window.MEADOW debug hook
    main.ts         composition root
assets/             rig.json and .vox models
tools/              python voxel and rig generators
test/               headless Playwright checks (load dist/index.html, or MEADOW_DIST)
```

## Notes

- Strict TypeScript with `noImplicitAny` off: the code was converted from a single JS file, so some loosely typed parts remain as `any`.
- Module cycles are avoided with registry arrays, the shared `state` object and `core/hooks.ts`.
- One seeded random stream drives the world and the animals, so module load order matters. `MEADOW.fingerprint()` and `MEADOW.trace()` should be unchanged by refactors.
- `window.MEADOW` exposes internals for the tests.
- `index.html` loads Google Fonts; offline it falls back to system fonts.
