# Voxel Meadow: engineering brief

You are working on Voxel Meadow, a gentle 3D voxel simulation that keeps virtual versions of Chris's late pets: the dogs Murphy, Mali and Bobby, and the cats Billy and Ashy. It is a memorial piece first and a tech demo second. It may end up as a desktop wallpaper or a framed display running continuously, and it may be gifted to family.

Tone rules for the world itself: calm, warm, slightly nostalgic. No danger, no illness, no death, no predation beyond a cat half-heartedly stalking a fish. Nothing that reads as a game objective. The animals should look content.

Chris is a DevSecOps engineer with a full-stack background. Write terse, direct replies. Australian English. No em dashes.

## Repo

`https://github.com/christopher-talke/voxel-meadow`, branch `main`. TypeScript, three.js r128, Vite with `vite-plugin-singlefile`. The build output is one offline self-contained `dist/index.html` (~630 KB). `dist/` is gitignored.

```
npm run typecheck   # tsc --noEmit, currently zero errors
npm run build       # typecheck then single-file bundle
npm run dev         # vite dev server
npm test            # python3 test/soak.py
```

Headless checks live in `test/` and drive the built bundle through Playwright plus `/usr/bin/google-chrome` with swiftshader. `test/common.py` points `DIST` at `dist/index.html`, so rebuild before testing. `test/shot.py out.png "<js>" <waitMs> <w> <h>` renders a still, which is the fastest way to actually look at a change. `test/q.py "<js-expression>"` evaluates against the loaded page. `test/soak.py` fast-forwards the sim and asserts no page errors.

`window.MEADOW` in `src/app/debug.ts` is the test surface: dogs, cats, camera, controls, `setTod`, `setCamMode`, `advance(seconds)`, weather, sound. Extend it when you add systems that need testing, and keep its keys unique, since duplicates are a TS1117 error.

## Current structure

```
src/
  main.ts            entry; imports modules in dependency order
  core/              util, shared mutable state, late-bound hooks
  render/stage.ts    renderer, scene, camera, OrbitControls, sky shader, fog, stars
  world/             layout (terrain grid and landmarks), decor, mesher, clock, whistle post
  sim/sky.ts         sky palettes, day/night, weather state machine, rain, lightning
  entities/          dog.ts (the voxel animal class, 836 lines), behaviours, cloth, ball, roster, registry
  nav/path.ts        grid pathfinding
  camera/camera.ts   orbit, free, follow, cinematic shots
  audio/sound.ts     WebAudio synth, no sample files
  fx/sprites.ts      billboard puffs
  ui/                hint, pointer interaction, menu, name tags
  app/               loop.ts (main loop), debug.ts (window.MEADOW)
assets/              rig.json (voxel animal rigs), .vox models
tools/               python voxel generators
```

Conventions worth knowing before you touch anything:

- `B = 4` is the terrain block size, `K = 0.48` is the animal voxel size, and `src/world/layout.ts` documents the world scale as **1 world unit is about 3.2 cm**. That constant is the only scale authority in the codebase.
- The terrain is a fixed grid, `N x N` with `R = 90`, flattened into `cols[]` plus the walkability arrays in `G` (`G.walk`, `G.lvl`, `G.gy`, `G.cost`).
- Animals run a **step queue**. `S.*` in `src/entities/behaviours.ts` builds steps (`go`, `hold`, `face`, `spin`, `swat`, `swim`, `climb`, `call`), `Dog.B(key)` returns a step array for a named behaviour, and `Dog.pick()` chooses the next behaviour from a weighted table. The renderer never drives behaviour and behaviour never touches frames.
- Module cycles are avoided deliberately: shared mutable state lives in `core/state.ts`, cross-module callbacks in `core/hooks.ts` (`thunder`, `syncMenu`), and the animal arrays in `entities/registry.ts`, filled by `entities/roster.ts`. `main.ts` import order matters; `roster` must be imported or the world loads empty.
- Strict TypeScript with `noImplicitAny` off. The code was converted from a single 2,900-line JS file, so plenty is still `any`. Tighten opportunistically, never in a commit that also changes behaviour.

## Job 1: separate engine from content

This is the main architectural task and the reason this session exists. Chris wants the engine reusable for other projects, with Voxel Meadow as one piece of content sitting on top.

Roughly, the split is:

**Engine (generic, reusable):** voxel meshing and greedy quad generation, the terrain grid and its walkability model, pathfinding, the step-queue runtime and pose interpolation, the rig format loader, the day/night and weather simulation, the camera rig and its modes, the WebAudio synth primitives, pointer and touch input, the cutaway shader, the main loop and fixed-step accumulator.

**Content (this meadow):** the island layout and landmarks, all decor placement, the five animals and their personas and weight tables, the named behaviours and their dialogue lines, bed and blanket and ball specifics, the UI chrome, the palettes.

Before you move a single file, write the proposed boundary down and get Chris to agree. Say explicitly what the engine's public API looks like, what a content package has to provide to boot a world, and which current couplings break the boundary. There are several: `behaviours.ts` imports `PLACES` that know about the jetty and the lookout, `dog.ts` imports shelter and bed geometry from `layout.ts`, and `camera.ts` has shot definitions tied to named landmarks. Those are the interesting cases, not the easy ones.

Constraints on the split:

- Behaviour must not regress. Prove it with before and after runs of the test harness and with stills from the same camera positions.
- The single-file offline build stays. Whatever package layout you propose has to bundle to one HTML file with no network at runtime.
- Do not invent a plugin system, an ECS or a scripting language. Chris wants a library and an app, not a framework.
- Workspaces or a plain `src/engine` and `src/meadow` split are both acceptable. Argue for one.

## Job 2: known bugs

Each of these is confirmed. File and line references are from the current `main`.

**Weather is confined to the island.** `rainUpdate` in `src/sim/sky.ts` (around line 120) keeps 1,600 rain particles in a 340 unit box that follows `focus`, and wraps them at +/-170. The orbit camera sits around 960 units out when it fits the island, so the rain renders as a small patch in the middle of the frame with clear sky around it. Clouds and the storm flash have the same problem in reverse: they are global, but nothing in the distance responds to the weather. Fix the rain volume so it reads as weather over a whole world, probably by scaling the volume with camera distance and billowing distant rain into the fog rather than drawing individual streaks at range.

**Wet fur goes blue, not wet.** `src/entities/dog.ts` line 722: `this.mat.color.setRGB(1 - 0.4 * wetV, 1 - 0.32 * wetV, 1 - 0.2 * wetV)`. Red is attenuated hardest and blue least, so a wet animal tints cold blue. Real wet fur darkens, saturates slightly, clumps, and goes darkest at the legs and belly first. Options worth considering: a uniform multiply with a small saturation boost, a vertical gradient so the underside is wetter, a darker patch on the ground under a dripping animal, and matted fur via a per-voxel offset rather than a colour trick. The drips themselves are fine.

**Props are out of scale.** The documented scale is 1 unit = 3.2 cm, but props were eyeballed. The hilltop bench in `src/world/decor.ts` around line 115 is the worst case. Audit every prop against the scale constant and against a reference animal: a dog is 33 voxels tall, which is about 50 cm, and about 21 units long. Grass tufts and flowers also read too large; in a close shot they come up past a cat's shoulder. Produce a table of prop, current size, implied real size, intended real size, before changing anything, so Chris can sign off rather than discovering the meadow has silently changed shape.

**The island floats in an abyss.** There is a sky sphere, fog from 950 to 2,900, and nothing else. Beyond the island edge there is flat gradient. This needs a decision from Chris before you build anything, and there are two coherent answers:

1. *Sea level world.* An endless voxel sea at the island's water level, distant headlands or small islands fading into haze, a proper horizon line, maybe a boat. Reads as a real place.
2. *Sky island.* Commit to the float: cloud layers below the island, a waterfall off the lake edge dissolving into mist, other islands drifting at distance. Reads as deliberate rather than unfinished.

Put both to Chris with a still of each if you can mock them cheaply. Do not pick on his behalf.

## Job 3: make it feel alive

The animals currently pick from a weighted table with a damping factor on the last behaviour. It works, but it reads as a loop on a timer. Chris's own words: he wants it a lot more random and natural, with days where Murphy just wants to sleep all day because he is a tired boy, and days where Mali does not want to do much while Murphy is bouncing off the walls.

Hard constraint from Chris: **core personalities stay fixed.** Murphy stays nervous, Bobby stays grumpy. Variation happens at the edges, in energy and mood and habit, never in character. This is a memorial, so an animal behaving unrecognisably is a failure, not a feature.

Directions to explore, in order of value:

- **Daily temperament.** Each animal rolls a mood and energy budget for the day, seeded so it is stable across a session, drifting slowly rather than resampling per behaviour. A sleepy day biases naps and short wanders; a bright day biases zoomies and ball.
- **Per-entity memory.** A small store per animal: what it did, how it ended, who it was with, where it was. Feed it back into the weights so behaviours that completed well get slightly more likely and interrupted ones less. This alone kills the loop feeling and needs no network.
- **Interruption and attention.** Right now behaviours mostly run to completion. Animals should notice things mid-behaviour: another animal passing, the ball moving, rain starting, a bird landing nearby.
- **Pluggable director.** Chris eventually wants an optional online mode where an LLM nudges weights and picks intents every few minutes via a server proxy, never in the browser with a key in the page, with structured JSON out and full fallback to local behaviour when the call fails. You are not building this now. You are making sure the engine boundary has a clean seam for it: a director interface that receives a summary and returns weight adjustments and an intent, with the local weighted picker as the default implementation.

**More wildlife.** Chris wants the meadow busier. There are butterflies already in `src/world/mesh.ts` and fish in `behaviours.ts`. Add more, as cheap instanced or billboard entities that the animals can occasionally notice but mostly ignore: birds that land, hop, peck and flush when an animal gets close; more butterflies with better flight paths; bees around the flowers; dragonflies over the lake; maybe a rabbit or a lizard that bolts for cover. These should be engine-level generic ambient agents, not bespoke one-offs, since they are exactly the sort of thing another project would reuse.

## Budgets and constraints

- This may run as a wallpaper or on a small always-on display, so idle cost matters. Hold a steady 60 fps at 1080p on a mid-range GPU and degrade gracefully. Respect the existing `reduceMotion` path.
- No new runtime dependencies without asking. three.js r128 and nothing else is the current position.
- Keep the build offline and self-contained. No CDN, no fonts fetched at runtime that break the offline case, no telemetry.
- Do not change the rig format or regenerate the `.vox` assets without asking. The animals are likenesses of real pets and the models were tuned by hand.
- Do not undo recent work: the diegetic whistle post that replaced the menu button, the aspect-aware orbit fit that keeps the whole island in frame, clouds that never fade, and the NaN guard on heading when `dt` is zero.

## How to work

Read before you propose. The behaviour system is denser than it looks, and `dog.ts` carries a lot of hard-won detail about how the animals move.

Plan first, in writing, for anything structural. Chris would rather argue about a boundary for ten minutes than unpick a refactor.

Verify visually. This is a thing people look at, so a passing test suite proves nothing about whether the meadow still feels right. Render stills from fixed camera positions, before and after, and look at them.

Keep `npm run typecheck` at zero errors and `npm test` clean on every commit. Commit in small behaviour-preserving steps, with the refactor separate from the feature work.

End commit messages with:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
```

Ask Chris about: the world beyond the island, the engine boundary, any prop resize that changes the meadow's silhouette, anything that touches how the animals are recognisably themselves. Decide yourself on: internal structure, naming, test coverage, performance work, and bug fixes that restore clearly intended behaviour.
