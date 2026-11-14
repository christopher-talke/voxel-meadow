from common import DIST, THREE_DIR
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page()
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        rows=await pg.evaluate("""()=>{const o=[];for(let z=-100;z<=70;z+=4){let r='';for(let x=-120;x<=30;x+=4){const c=MEADOW.cell(x,z);r+=!c?' ':c[3]?'T':c[0]==='grass'?(c[2]?String(c[1]%10):'x'):c[0]==='sand'?'s':c[0]==='path'?'p':'~';}o.push((z+'').padStart(4)+' '+r);}return o;}""")
        print('x from -120 step 4 (col0=-120, col30=0)\n'+'\n'.join(rows))
        await b.close()
asyncio.run(main())
