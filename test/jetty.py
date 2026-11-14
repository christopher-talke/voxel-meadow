from common import DIST, THREE_DIR
import asyncio, json
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
        await pg.goto(DIST,wait_until='domcontentloaded')
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("""()=>{const M=MEADOW,res=[];
          for(let n=0;n<30;n++){const d=M.dogs[n%3];
            const i=21+Math.floor(Math.random()*16),j=38+Math.floor(Math.random()*5);d.pos.set(i*4,j*4);d.h=Math.random()*6.28;d.setQueue([M.S.hold('stand',0.3)],'t');
            let lp=[d.pos.x,d.pos.y],lt=0,t=0,stuck=null;
            for(;t<70&&!stuck;t+=0.2){M.advance(0.2);const mvd=Math.hypot(d.pos.x-lp[0],d.pos.y-lp[1]);
              if(mvd>3){lp=[d.pos.x,d.pos.y];lt=t;}
              else if(t-lt>8&&d.goal&&d.v<2){stuck=[d.name,i,j,d.pos.x.toFixed(0),d.pos.y.toFixed(0),d.behaviour,d.label(),d.goal.fail,d.goal.path?d.goal.path.length:null,JSON.stringify(M.cell(d.pos.x,d.pos.y)),d.gait,JSON.stringify(d.goal.pt),JSON.stringify((d.goal.path||[]).slice(0,4)),d.goal.k,d.h.toFixed(2),d.goal.direct];}}
            if(stuck)res.push(stuck);}
          return res;}""")
        print(len(r),'stuck')
        for x in r: print(x)
        print('errors',errs)
        await b.close()
asyncio.run(main())
