"""How calm the wallpaper orbit is: runs the built page live in orbit mode and measures the camera every frame.

Reports peak and 99th-percentile speed and acceleration of the camera and its target, how many lean-ins happened,
how long they lasted and the shortest gap between them. With --strict it fails on a hop from one animal straight
to another or a lean-in sooner than the rest time.

usage (from test/): ../.venv/bin/python orbitcalm.py [sim-seconds] [--strict] [--frames out-prefix]
Frames are stepped without rendering (MEADOW.camRun); --frames also saves a still every 10 sim seconds.
"""
from common import DIST, CHROME
import asyncio, sys, math
from playwright.async_api import async_playwright

SEC = next((float(a) for a in sys.argv[1:] if a.replace('.', '').isdigit()), 600)
STRICT = '--strict' in sys.argv
FRAMES = sys.argv[sys.argv.index('--frames') + 1] if '--frames' in sys.argv else None

def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else 0

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 960, 'height': 600})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        await pg.evaluate("MEADOW.setTod(11)")
        await pg.evaluate("window.__SIM_PAUSE = true")   # stop the live loop; frames are stepped below at a steady 30 Hz
        log, n = [], 0
        for k in range(int(SEC // 10)):
            log += await pg.evaluate('MEADOW.camRun(10)')
            if FRAMES:
                await pg.evaluate("window.__SIM_PAUSE = false"); await pg.wait_for_timeout(120)
                await pg.screenshot(path=f'{FRAMES}-{n:03d}.png'); n += 1
                await pg.evaluate("window.__SIM_PAUSE = true")
        # a cat on the lily pads or the roof keeps the camera for as long as the show lasts and it can be seen
        acts = []
        for act in ('lilyhop', 'perch'):
            r = await pg.evaluate('''(act) => { const M = MEADOW, c = M.cats[0], o = M.orbitDirector, out = [];
              c.forceSlip = false; c.interrupt(c.B(act), act);
              M.camRun(0.5); o.phase = 'in'; o.who = c; o.t = 0; o.rested = 0; o.losLost = 0;
              for (let s = 0; s < 70; s++) { M.camRun(1); out.push([s, c.behaviour, c.poseName, o.phase, Math.round(o.losLost * 10) / 10]); if (c.behaviour !== act) break; }
              return out; }''', act)
            left = next((x for x in r if x[3] in ('out', 'wide')), None)
            acts.append((act, left, r[-1]))
            print(f'{act}: show ran {r[-1][0]}s, camera', f'let go at {left[0]}s ({left[1]}/{left[2]}, los lost {left[4]}s)' if left else 'stayed throughout')
        await b.close()
    sim, cs, ts, ca, ta = 0.0, [], [], [], []
    lean, leans, inLean, start, phases, whos = [], [], False, 0.0, set(), []
    pcv = ptv = None
    for i in range(1, len(log)):
        dt = log[i][0]; sim += dt
        a, q = log[i - 1], log[i]
        cv = math.dist(q[1:4], a[1:4]) / dt; tv = math.dist(q[4:7], a[4:7]) / dt
        cs.append(cv); ts.append(tv)
        if pcv is not None: ca.append(abs(cv - pcv) / dt); ta.append(abs(tv - ptv) / dt)
        pcv, ptv = cv, tv
        d = math.dist(q[1:4], q[4:7]); close = d < 0.7 * q[7]
        if close and not inLean: inLean, start = True, sim
        elif not close and inLean: inLean = False; leans.append((start, sim))
        phases.add(q[8])
        if q[9] and (not whos or whos[-1][1] != q[9]): whos.append((q[8], q[9], sim))
    if inLean: leans.append((start, sim))
    gaps = [leans[i][0] - leans[i - 1][1] for i in range(1, len(leans))]
    hops = sum(1 for i in range(1, len(whos)) if whos[i][0] != 'wide' and whos[i - 1][0] != 'wide' and whos[i][2] - whos[i - 1][2] < 3)
    print(f'frames {len(log)}  sim {sim:.0f}s  errors {errs}')
    print(f'camera speed  p99 {pct(cs, .99):7.1f}  max {max(cs):7.1f}   accel p99 {pct(ca, .99):8.1f}  max {max(ca):8.1f}')
    print(f'target speed  p99 {pct(ts, .99):7.1f}  max {max(ts):7.1f}   accel p99 {pct(ta, .99):8.1f}  max {max(ta):8.1f}')
    print(f'lean-ins {len(leans)}  lengths {[round(e - s) for s, e in leans]}  shortest gap {round(min(gaps)) if gaps else "-"}s')
    if whos: print('focus', [(w[1], round(w[2])) for w in whos])
    bad = bool(errs)
    for act, left, end in acts:   # letting go mid-show is only fair once the camera has lost sight or hit its longest hold
        if STRICT and left and left[1] == act and left[2] not in ('lie', 'sleep') and left[4] < 2.5 and left[0] < 58:
            print(f'FAIL: camera let go of {act} mid-show'); bad = True
    if STRICT:
        if hops: print('FAIL: focus hopped between animals', hops); bad = True
        if gaps and min(gaps) < 15: print('FAIL: lean-ins too close together'); bad = True
    sys.exit(1 if bad else 0)
asyncio.run(main())
