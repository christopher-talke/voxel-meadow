from common import DIST, THREE_DIR
import asyncio, sys
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
# usage: orbit.py W H out.png [angleRad]
async def main():
    W,H=int(sys.argv[1]),int(sys.argv[2]); ang=float(sys.argv[4]) if len(sys.argv)>4 else 0.3
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':W,'height':H})
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("""(a)=>{const M=MEADOW; M.setTod(13); M.setCamMode('orbit',true); const o=M.ORBIT, c=M.camera;
          c.position.set(Math.cos(a)*o.d*Math.cos(o.el), Math.sin(o.el)*o.d, Math.sin(a)*o.d*Math.cos(o.el)); M.controls.target.set(0,0,0); M.focus.set(0,0,0); M.controls.maxDistance=Math.max(1150,o.d*1.08); return JSON.stringify(o)}""",ang)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=sys.argv[3]); print(r, 'errors', errs)
        await b.close()
asyncio.run(main())
