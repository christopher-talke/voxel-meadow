from common import DIST, THREE_DIR
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
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
        r=await pg.evaluate("""()=>{const M=MEADOW,a=M.cats[1];a.pos.set(-20,36);a.interrupt([M.S.hold('sit',9999,{look:'forward',fixed:true})],'x');
          M.dogs.forEach((d,i)=>{d.watchCd=0});M.dogs[0].pos.set(-4,36);let w=[0,0,0],sw=0,mx=0;const lab=[];
          for(let i=0;i<1200;i++){M.advance(0.1);M.dogs.forEach((d,k)=>{if(d.behaviour==='watchtail')w[k]++});if(a.swishing)sw++;mx=Math.max(mx,a.swishAmt);
            if(i%100==0)lab.push(M.dogs[0].label());}
          return [w,sw,mx.toFixed(2),lab];}""")
        print(r); print('errors',errs)
        await b.close()
asyncio.run(main())
