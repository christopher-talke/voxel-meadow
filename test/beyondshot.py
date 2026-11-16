"""World-beyond mocks: the same orbit and low views with no mock, the sea mock and the sky-island mock.

usage (from test/): ../.venv/bin/python beyondshot.py <out-prefix>
"""
from common import DIST, CHROME
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, timezone_id='Australia/Sydney')
        await ctx.add_init_script('window.__MEADOW_PAUSE = true')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        await pg.evaluate('MEADOW.simMs = 1763172000000; MEADOW.timeMode = "cycle"; MEADOW.WX.mode = "clear"; MEADOW.WX.kind = "clear"')
        for tod in ('day', 'golden'):
            await pg.evaluate(f'MEADOW.setTod("{tod}"); MEADOW.advance(20)')
            for kind in ('none', 'sea', 'sky'):
                await pg.evaluate(f'MEADOW.mockBeyond({"null" if kind == "none" else repr(kind)})')
                d = await pg.evaluate('[MEADOW.ORBIT.d, MEADOW.ORBIT.el]')
                import math
                for view, cam in (('orbit', (math.cos(0.6) * d[0] * math.cos(d[1]), d[0] * math.sin(d[1]), math.sin(0.6) * d[0] * math.cos(d[1]), 0, 0, 0, d[0])),
                                  ('edge', (330, 70, 330, -500, 10, -100, 0))):
                    await pg.evaluate(f'MEADOW.view({",".join(map(str, cam))})')
                    await pg.wait_for_timeout(600)
                    await pg.screenshot(path=f'{OUT}-{tod}-{kind}-{view}.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
