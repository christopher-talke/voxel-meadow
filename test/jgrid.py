from common import DIST, THREE_DIR, CHROME
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page()
        async def route(r):
            for k,v in MAP.items():
                if r.request.url.endswith(k): return await r.fulfill(path=v,content_type='application/javascript')
            if 'fonts.g' in r.request.url: return await r.abort()
            await r.continue_()
        await pg.route('**/*',route)
        await pg.goto(DIST)
        await pg.wait_for_function('window.MEADOW',timeout=30000)
        r=await pg.evaluate("""()=>{const M=MEADOW,out=[],trk=M.dogs.map(()=>({g:null,t:0,p:null}));
          for(let n=0;n<30;n++){M.goTo(128+Math.random()*16,152+Math.random()*16);
            for(let t=0;t<120;t+=0.2){M.advance(0.2);M.dogs.forEach((d,k)=>{const T=trk[k];
              if(d.goal!==T.g){T.g=d.goal;T.t=0;T.p=[d.pos.x,d.pos.y];}
              else if(d.goal){T.t+=0.2;if(T.t>=8){const m=Math.hypot(d.pos.x-T.p[0],d.pos.y-T.p[1]);
                if(m<4)out.push([n,d.name,d.behaviour,d.label(),d.pos.x.toFixed(0),d.pos.y.toFixed(0),JSON.stringify(M.cell(d.pos.x,d.pos.y)),JSON.stringify(d.goal.pt),d.goal.path&&d.goal.path.length,d.goal.ball,d.v.toFixed(1)]);T.t=0;T.p=[d.pos.x,d.pos.y];}}});}}
          return out;}""")
        print(len(r),'stuck'); [print(x) for x in r[:14]]
        r=[[],[]]
        print('\n'.join(r[0])); print('nopath',r[1])
        await b.close()
asyncio.run(main())
