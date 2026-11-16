"""Scale stills: Murphy and Billy parked beside each prop, so prop sizes can be judged against the animals.

usage (from test/): ../.venv/bin/python propshot.py <out-prefix>
"""
from common import DIST, CHROME
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1]
# name: (murphy x,z,h), (billy x,z,h), camera offset from murphy (dx,dy,dz), target offset from murphy
SCENES = """(() => { const L = MEADOW.LOOK, bx = L.i * 4, bz = (L.j - 3) * 4;
  return {
    bench: [[bx + 32, bz + 4, 3.1], [bx - 8, bz + 9, 1.4], [-6, 22, 78], [-24, 6, -4]],
    clock: [[-34, -52, 2.6], [-50, -50, 0.2], [32, 18, 60], [-10, 12, -8]],
    jetty: [[118, 160, 0], [104, 160, 0], [-8, 26, 64], [0, 3, 0]],
    oak: [[-56, -58, 2.4], [-50, -64, 1], [40, 70, 150], [-16, 34, -16]],
    shelter: [[-44, 6, 3.1], [-46, -12, 3.1], [70, 46, 20], [-20, 10, -4]],
    flowers: [[230, -66, 2.8], [222, -74, 0.5], [30, 16, 44], [-4, 4, -4]],
  }; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 1000, 'height': 640}, timezone_id='Australia/Sydney')
        await ctx.add_init_script('window.__SIM_PAUSE = true')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
        await pg.evaluate('MEADOW.simMs = 1763172000000; MEADOW.timeMode = "cycle"; MEADOW.setTod("day"); MEADOW.WX.mode = "clear"; MEADOW.WX.kind = "clear"')
        scenes = await pg.evaluate(SCENES)
        for name, (m, c, cam, tgt) in scenes.items():
            await pg.evaluate(f"""(() => {{ const put = (d, x, z, h) => {{ d.pos.set(x, z); d.h = h; d.goal = null; d.step = null; d.queue = []; d.elevT = 0; d.elev = 0; d.ovY = null; d.interrupt([MEADOW.S.hold('stand', 9999, {{ fixed: true, look: 'forward' }})], 'sit'); }};
              put(MEADOW.dogs[0], {m[0]}, {m[1]}, {m[2]}); put(MEADOW.cats[0], {c[0]}, {c[1]}, {c[2]}); MEADOW.advance(1.5); }})()""")
            r = await pg.evaluate('[MEADOW.dogs[0].pos.x, MEADOW.dogs[0].rootY, MEADOW.dogs[0].pos.y]')
            await pg.evaluate(f'MEADOW.view({r[0] + cam[0]}, {r[1] + cam[1]}, {r[2] + cam[2]}, {r[0] + tgt[0]}, {r[1] + tgt[1]}, {r[2] + tgt[2]})')
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{OUT}-{name}.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
