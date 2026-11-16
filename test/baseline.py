"""Capture a regression baseline: world fingerprint, behaviour trace, render cost and fixed-camera stills.

usage (from test/): ../.venv/bin/python baseline.py <label> [--no-shots] [--trace-sec N]
writes test/baseline/<label>/. Compare two labels with compare.py.
"""
from common import DIST, CHROME
import asyncio, sys, json, os, pathlib
from playwright.async_api import async_playwright

label = sys.argv[1]
SHOTS = '--no-shots' not in sys.argv
TRACE = int(sys.argv[sys.argv.index('--trace-sec') + 1]) if '--trace-sec' in sys.argv else 600
OUT = pathlib.Path(__file__).parent / 'baseline' / label
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1280, 720
SIM_MS = 1763172000000   # a fixed November morning, so the sky and the animals' clock agree run to run

# each scenario: (name, setup js, seconds to settle). Views are camera, target pairs; 'auto' views are computed in page.
SCEN = [
    ('day', "MEADOW.setTod('day');MEADOW.WX.mode='clear';MEADOW.WX.kind='clear'", 40),
    ('golden', "MEADOW.setTod('golden');MEADOW.WX.mode='clear';MEADOW.WX.kind='clear'", 40),
    ('night', "MEADOW.setTod('night');MEADOW.WX.mode='clear';MEADOW.WX.kind='clear'", 40),
    ('rain', "MEADOW.setTod('day');MEADOW.WX.mode='rain';MEADOW.WX.kind='rain'", 70),
    ('storm', "MEADOW.setTod('day');MEADOW.WX.mode='storm';MEADOW.WX.kind='storm'", 70),
]
# camera views in world units. 'cat' and 'dog' views are placed relative to an animal after settling.
VIEWS_JS = """(() => { const M = MEADOW, d = M.ORBIT.d, el = M.ORBIT.el, L = M.LOOK, ly = L.top * 4;
  const a = M.cats[1], m = M.dogs[0];
  return {
    orbit: [Math.cos(0.6) * d * Math.cos(el), d * Math.sin(el), Math.sin(0.6) * d * Math.cos(el), 0, 0, 0, d],
    shelter: [10, 38, 70, -74, 6, 0],
    lake: [40, 46, 250, 150, 0, 160],
    bench: [L.i * 4 + 60, ly + 32, L.j * 4 + 70, L.i * 4, ly + 10, L.j * 4 - 12],
    field: [a.pos.x + 26, a.rootY + 10, a.pos.y + 18, a.pos.x, a.rootY + 5, a.pos.y],
    follow: [m.pos.x + 60, m.rootY + 40, m.pos.y + 45, m.pos.x, m.rootY + 6, m.pos.y],
  }; })()"""
# Ashy is parked in the flower field so the close-up always has a cat among the flowers
PARK = """(() => { const c = MEADOW.cats[1]; c.pos.set(236, -60); c.goal = null; c.step = null; c.interrupt([MEADOW.S.hold('sit', 9999, { fixed: true })], 'sit'); })()"""

async def page(p, pause=True):
    b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': H}, timezone_id='Australia/Sydney')
    if pause: await ctx.add_init_script('window.__MEADOW_PAUSE = true')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
    await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
    await pg.evaluate(f'MEADOW.simMs = {SIM_MS}; MEADOW.timeMode = "cycle"')
    return b, pg, errs

async def main():
    res = {}
    async with async_playwright() as p:
        b, pg, errs = await page(p)
        res['fingerprint'] = await pg.evaluate('MEADOW.fingerprint()')
        res['trace'] = await pg.evaluate(f'MEADOW.trace({TRACE})')
        res['errors'] = errs
        await b.close()
        if SHOTS:
            res['perf'] = {}
            for name, js, settle in SCEN:
                b, pg, errs = await page(p)
                await pg.evaluate(js); await pg.evaluate(PARK); await pg.evaluate(f'MEADOW.advance({settle})')
                views = await pg.evaluate(VIEWS_JS)
                for v, c in views.items():
                    await pg.evaluate(f'MEADOW.view({",".join(map(str, c))})')
                    await pg.wait_for_timeout(700)
                    await pg.screenshot(path=str(OUT / f'{name}-{v}.png'))
                    if v in ('orbit', 'shelter'): res['perf'][f'{name}-{v}'] = await pg.evaluate('MEADOW.perf()')
                res['errors'] += errs
                await b.close()
    (OUT / 'baseline.json').write_text(json.dumps(res, indent=1))
    print(label, 'fingerprint', res['fingerprint'], 'trace events', len(res['trace']), 'errors', res['errors'])
    if res['errors']: sys.exit(1)
asyncio.run(main())
