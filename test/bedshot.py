from common import DIST, THREE_DIR
import asyncio, sys
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
JS=sys.argv[2]; CX,CY,CZ,TX,TZ=sys.argv[3:8]; TY=sys.argv[8] if len(sys.argv)>8 else "5"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1000,'height':640})
        pg.on('pageerror',lambda e:print('pageerror',e))
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("()=>{const M=window.MEADOW;M.freezeCam=true;M.setTod('day',true);"+JS+"M.camera.position.set(" + CX + "," + CY + "," + CZ + ");M.controls.target.set(" + TX + "," + TY + "," + TZ + ");M.camera.lookAt(" + TX + "," + TY + "," + TZ + ");M.controls.update();return M.dogs.map(d=>[d.activity,d.poseName]).concat([M.CLOTHS.map(c=>c.mess().toFixed(2))]);}")
        print(r)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=sys.argv[1])
        await b.close()
asyncio.run(main())
