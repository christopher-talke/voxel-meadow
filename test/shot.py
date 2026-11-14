from common import DIST, THREE_DIR
import asyncio, sys, json
from playwright.async_api import async_playwright
NM = THREE_DIR
MAP = {'three.min.js': NM + 'build/three.min.js', 'OrbitControls.js': NM + 'examples/js/controls/OrbitControls.js'}

# usage: shot.py out.png [js-to-run-before] [wait-ms] [w] [h]
out = sys.argv[1]
pre = sys.argv[2] if len(sys.argv) > 2 else ''
wait = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1200
H = int(sys.argv[5]) if len(sys.argv) > 5 else 800

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H})
        errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        async def route(r):
            for k, v in MAP.items():
                if r.request.url.endswith(k):
                    return await r.fulfill(path=v, content_type='application/javascript')
            if 'fonts.g' in r.request.url:
                return await r.abort()
            await r.continue_()
        await pg.route('**/*', route)
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW', timeout=30000)
        if pre:
            await pg.evaluate(pre)
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        info = await pg.evaluate('window.MEADOW.dogs.map(d=>[d.activity,d.poseName,d.behaviour,Math.round(d.pos.x),Math.round(d.pos.y)])')
        print(json.dumps(info))
        for e in errs[:10]:
            print(e)
        await b.close()
asyncio.run(main())
