"""Wet fur stills: Murphy and Billy parked side by side on dry grass at a few wetness levels, close up.

usage (from test/): ../.venv/bin/python wetshot.py <out-prefix>
"""
from common import DIST, CHROME
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
SETUP = """(() => { const M = MEADOW, put = (d, x, z, h) => { d.pos.set(x, z); d.h = h; d.goal = null; d.step = null; d.queue = []; d.interrupt([M.S.hold('stand', 9999, { fixed: true, look: 'forward' })], 'sit'); };
  M.setTod('day'); M.WX.mode = 'clear'; M.WX.kind = 'clear';
  put(M.dogs[0], 40, -40, 0.4); put(M.cats[0], 40, -18, 0.6); M.advance(2); })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 960, 'height': 640}, timezone_id='Australia/Sydney')
        await ctx.add_init_script('window.__MEADOW_PAUSE = true')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        await pg.evaluate('MEADOW.simMs = 1763172000000; MEADOW.timeMode = "cycle"')
        await pg.evaluate(SETUP)
        for w in (0, 0.3, 0.6, 1):
            await pg.evaluate(f"for (const d of [MEADOW.dogs[0], MEADOW.cats[0]]) {{ d.wet = {w}; d.wetV = {min(1, w * 1.4)}; d.dryT = 0; d.shakeCd = 99; }} MEADOW.advance(0.5); for (const d of [MEADOW.dogs[0], MEADOW.cats[0]]) {{ d.wet = {w}; d.wetV = {min(1, w * 1.4)}; }} MEADOW.advance(1/60)")
            m = await pg.evaluate('[MEADOW.dogs[0].pos.x, MEADOW.dogs[0].rootY, MEADOW.dogs[0].pos.y]')
            await pg.evaluate(f'MEADOW.view({m[0] + 34}, {m[1] + 16}, {m[2] + 30}, {m[0]}, {m[1] + 6}, {m[2] + 11})')
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{OUT}-{w}.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
