from common import DIST, THREE_DIR
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':390,'height':800})
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST); await pg.wait_for_function('window.MEADOW',timeout=30000)
        print(await pg.evaluate('''()=>{const M=MEADOW; let mr=0,cx=0,cz=0,n=0; for(let i=-90;i<=90;i++)for(let j=-90;j<=90;j++){const c=M.cols[M.idxOf(i,j)]; if(c){mr=Math.max(mr,Math.hypot(i,j)*4); cx+=i*4; cz+=j*4; n++;}} return [mr,cx/n,cz/n,n]}'''))
        await b.close()
asyncio.run(main())
