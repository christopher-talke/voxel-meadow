"""Live camera smoke test: each camera mode runs for a few seconds in a real (unpaused) page.
Fails on a page error or a non-finite camera; writes one still per mode.

usage (from test/): ../.venv/bin/python camsmoke.py [out-prefix]
"""
from common import DIST, CHROME
import asyncio, sys, math
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else None
MODES = ['both', 0, 3, 'orbit', 'cine', 'free']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 960, 'height': 600})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        bad = []
        for m in MODES:
            await pg.evaluate(f'MEADOW.setCamMode({m!r} === undefined ? null : {repr(m) if isinstance(m, str) else m}, true)')
            await pg.wait_for_timeout(3500)
            cp = await pg.evaluate('[...MEADOW.cp, MEADOW.controls.target.x, MEADOW.controls.target.y, MEADOW.controls.target.z]')
            ok = all(math.isfinite(v) for v in cp)
            print(m, 'ok' if ok else 'NON-FINITE', [round(v) for v in cp])
            if not ok: bad.append(m)
            if OUT: await pg.screenshot(path=f'{OUT}-{m}.png')
        print('errors', errs)
        await b.close()
        if errs or bad: sys.exit(1)
asyncio.run(main())
