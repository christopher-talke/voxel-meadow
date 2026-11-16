from common import DIST, THREE_DIR, CHROME
import asyncio
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
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("""()=>{const M=MEADOW,seen=[new Set(),new Set()];let maxD=[0,0];const p0=M.cats.map(c=>[c.pos.x,c.pos.y]);
          for(let i=0;i<900;i++){M.advance(0.5);M.cats.forEach((c,k)=>{seen[k].add(c.behaviour);maxD[k]=Math.max(maxD[k],Math.hypot(c.pos.x-p0[k][0],c.pos.y-p0[k][1]));});}
          M.cats[0].pat();return [seen.map(s=>[...s]),maxD,M.cats.map(c=>c.label())];}""")
        print(r); print('errors',errs)
        await b.close()
asyncio.run(main())
