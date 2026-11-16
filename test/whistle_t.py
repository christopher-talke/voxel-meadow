from common import DIST, THREE_DIR, CHROME
import asyncio, sys
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1000,'height':640})
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("""()=>{const M=MEADOW,W=M.WHISTLE,c=M.camera; M.setTod(13); M.setCamMode('both',true);
          c.position.set(W.x-34,30,W.z+58); M.controls.target.set(W.x,10,W.z); M.focus.set(W.x,10,W.z); M.controls.update(); return 1}""")
        await pg.wait_for_timeout(2000)
        pos=await pg.evaluate("""()=>{const M=MEADOW,W=M.WHISTLE,c=M.camera; const v=W.meshes[0].getWorldPosition(new c.position.constructor()).project(c); const r=document.querySelector('canvas').getBoundingClientRect(); return [(v.x*.5+.5)*r.width+r.left,(-v.y*.5+.5)*r.height+r.top]}""")
        print('screen',pos)
        k=await pg.evaluate("(p)=>MEADOW.pick(p[0],p[1])",pos); print('pick',k)
        await pg.screenshot(path='/tmp/w0.png')
        await pg.mouse.click(pos[0],pos[1]); await pg.wait_for_timeout(600)
        st=await pg.evaluate("()=>({kick:MEADOW.WHISTLE.kick,beh:MEADOW.dogs.map(d=>d.behaviour)})"); print(st)
        await pg.screenshot(path='/tmp/w1.png'); print('errors',errs)
        await b.close()
asyncio.run(main())
