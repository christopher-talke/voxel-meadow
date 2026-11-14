from common import DIST, THREE_DIR
import asyncio, sys
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
        for beh in ['climb','perch']:
            r=await pg.evaluate("""(beh)=>{const M=MEADOW,c=M.cats[0];c.interrupt(c.B(beh),beh);const out=[];let maxE=0,seen=[];window.__nan=null;
              for(let i=0;i<3000;i++){M.advance(0.05);maxE=Math.max(maxE,c.elev);window.__prev=[c.step&&c.step.text,c.h,c.pos.x,c.pos.y,c.poseName,c.v,c.faceH,c.spinLeft,c.goal&&1];if(!window.__nan&&(c.h!==c.h)){window.__nan=[i,c.step&&c.step.text,c.queue.length,c.label(),c.poseName,c.h,c.v,c.elev,c.fakeV];}const l=c.label();if(seen[seen.length-1]!==l)seen.push(l);if(window.__nan||(i>30&&c.behaviour!==beh))break;}
              return [beh,c.behaviour,maxE.toFixed(1),c.elev.toFixed(1),c.pos.x.toFixed(0),c.pos.y.toFixed(0),seen];}""",beh)
            print(r, await pg.evaluate('window.__nan'), await pg.evaluate('window.__prev'))
        print('errors',errs)
        await b.close()
asyncio.run(main())
