from common import DIST, THREE_DIR, CHROME
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2,has_touch=True,is_mobile=True)
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        await pg.evaluate("MEADOW.advance(3)")
        await pg.wait_for_timeout(600)
        print('start', await pg.evaluate("MEADOW.dbg().cam"))
        # tap a few px off Murphy's projected position
        pt=await pg.evaluate("()=>{const d=MEADOW.dogs[0],v=new MEADOW.camera.position.constructor(d.root.position.x,d.root.position.y+6,d.root.position.z);v.project(MEADOW.camera);return [(v.x+1)/2*innerWidth+18,(1-v.y)/2*innerHeight+14];}")
        print('pt',pt)
        await pg.touchscreen.tap(*pt); await pg.wait_for_timeout(300)
        print('after dog tap', await pg.evaluate("MEADOW.dbg().cam"))
        await pg.evaluate("MEADOW.advance(4)")
        await pg.evaluate("document.querySelector('#tag0 b').click()"); await pg.wait_for_timeout(200)
        print('after tag tap (toggle off)', await pg.evaluate("MEADOW.dbg().cam"))
        await pg.evaluate("document.querySelector('#tag1 b').click()"); await pg.wait_for_timeout(200)
        print('after tag1 tap', await pg.evaluate("MEADOW.dbg().cam"), 'pan enabled', await pg.evaluate("MEADOW.controls.enablePan"))
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path='touch.png')
        print('errors',errs)
        await b.close()
asyncio.run(main())
