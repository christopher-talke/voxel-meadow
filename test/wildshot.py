"""Wildlife close-ups: the camera finds one of each ambient kind and frames it, with a dog for scale where one is near.

usage (from test/): ../.venv/bin/python wildshot.py <out-prefix>
"""
from common import DIST, CHROME
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
import os
KINDS = [tuple(k.split(':')[0:1]) + (float(k.split(':')[1]),) for k in os.environ['KINDS'].split(',')] if os.environ.get('KINDS') else [('bird', 14), ('magpie', 20), ('bee', 7), ('dragonfly', 12), ('butterfly', 9), ('rabbit', 34)]
TOP = os.environ.get('TOP')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 900, 'height': 560}, timezone_id='Australia/Sydney')
        await ctx.add_init_script('window.__SIM_PAUSE = true')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        await pg.evaluate('MEADOW.simMs = 1763172000000; MEADOW.timeMode = "cycle"; MEADOW.setTod("day"); MEADOW.WX.mode = "clear"; MEADOW.WX.kind = "clear"; MEADOW.advance(25)')
        for kind, dist in KINDS:
            a = await pg.evaluate(f"(() => {{ const l = MEADOW.agentsOf('{kind}'); const s = l.find(x => x.state === 'perch' || x.state === 'rest') || l[0]; return s; }})()")
            print(kind, a)
            if TOP: await pg.evaluate(f"MEADOW.view({a['x'] + 0.5}, {a['y'] + dist}, {a['z'] + 0.5}, {a['x']}, {a['y']}, {a['z']})")
            else: await pg.evaluate(f"MEADOW.view({a['x'] + dist * 0.8}, {a['y'] + dist * 0.45}, {a['z'] + dist * 0.6}, {a['x']}, {a['y'] + 1}, {a['z']})")
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'{OUT}-{kind}.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
