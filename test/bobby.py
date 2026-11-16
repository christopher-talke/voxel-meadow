from common import DIST, THREE_DIR, CHROME
import asyncio, sys
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
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
        await pg.evaluate("()=>{const M=window.MEADOW;M.setTod('day',true);M.dogs.forEach(d=>{d.spookCd=999});}")
        # 1: tidy a bunched blanket
        r=await pg.evaluate("""()=>{const M=MEADOW,b=M.dogs[2],c=M.CLOTHS[3];
          for(let k=0;k<c.N;k++){c.p[k*3]+=(Math.sin(k*1.7))*4;c.p[k*3+2]+=(Math.cos(k*2.3))*4;c.p[k*3+1]+=Math.abs(Math.sin(k))*3;}
          const m0=c.mess();b.interrupt(b.B('tidy'),'tidy');const seen=new Set();
          for(let i=0;i<60;i++){M.advance(1);seen.add(b.label());}
          return [m0.toFixed(2),c.mess().toFixed(2),[...seen]];}""")
        print('tidy',r)
        # 2: tricks
        r=await pg.evaluate("""()=>{const M=MEADOW,b=M.dogs[2];b.trickCd=0;b.interrupt([M.S.hold('stand',0.2)],'x');M.advance(2);b.pat();const seen=[];
          for(let i=0;i<30;i++){M.advance(0.5);const l=b.label();if(seen[seen.length-1]!==l)seen.push(l);}return seen;}""")
        print('tricks',r)
        # 3: ball irritation
        r=await pg.evaluate("""()=>{const M=MEADOW,b=M.dogs[2],m=M.dogs[0];b.leaveCd=0;m.interrupt(m.B('ball'),'ball');M.advance(6);
          b.interrupt([M.S.hold('stand',99)],'x');b.pos.set(M.SB?M.SB.pos.x+25:m.pos.x+25,M.SB?M.SB.pos.y:m.pos.y);const seen=[];
          for(let i=0;i<30;i++){M.advance(0.5);const l=b.label();if(seen[seen.length-1]!==l)seen.push(l);}return [m.behaviour,b.behaviour,seen];}""")
        print('leave',r)
        # 4: grump + pose shots
        await pg.evaluate("()=>{const M=MEADOW,b=M.dogs[2];b.mood=1;b.interrupt(b.B('grump'),'grump');for(let i=0;i<40;i++)M.advance(1);}")
        print('grump', await pg.evaluate("MEADOW.dogs[2].label()"))
        await b.close()
asyncio.run(main())
