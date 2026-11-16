from common import DIST, THREE_DIR, CHROME
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':390,'height':800})
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW',timeout=30000)
        await pg.evaluate('''()=>{const M=MEADOW,o=M.ORBIT,c=M.camera,a=4.0; M.setCamMode('orbit',true); c.position.set(Math.cos(a)*o.d*Math.cos(o.el), Math.sin(o.el)*o.d, Math.sin(a)*o.d*Math.cos(o.el)); M.controls.target.set(0,0,0); M.focus.set(0,0,0);}''')
        await pg.wait_for_timeout(2500)
        print(await pg.evaluate('''()=>{const M=MEADOW,o=M.ORBIT,c=M.camera; return [o.d, c.position.length(), c.position.y, o.d*Math.sin(o.el), M.controls.maxDistance, M.controls.target.toArray()]}'''))
        await b.close()
asyncio.run(main())
