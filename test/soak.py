from common import DIST, THREE_DIR, CHROME
import asyncio
from playwright.async_api import async_playwright
NM=THREE_DIR
MAP={'three.min.js':NM+'build/three.min.js','OrbitControls.js':NM+'examples/js/controls/OrbitControls.js'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':1000,'height':640})
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
        seen=set(); mx=0; takes=0
        for i in range(36):
            await pg.evaluate("MEADOW.advance(10)")
            r=await pg.evaluate("[MEADOW.dogs.map(d=>d.behaviour),MEADOW.CLOTHS.map(c=>c.mess()),Math.max(...MEADOW.CLOTHS.map(c=>Math.max(...Array.from({length:c.N},(_,k)=>c.p[k*3+1]))))]")
            seen.update([x for x in r[0] if x]); mx=max(mx,r[2])
            if 'takespot' in r[0]: takes+=1
        print('behaviours',sorted(seen),'maxY',round(mx,1),'takespot samples',takes,'mess',[round(x,2) for x in r[1]])
        await pg.evaluate("MEADOW.CLOTHS[0].shakeOut();MEADOW.advance(2)")
        await pg.reload(); await pg.wait_for_function('window.MEADOW',timeout=30000)
        print('after reload mess',await pg.evaluate("MEADOW.CLOTHS.map(c=>c.mess().toFixed(2))"))
        print('errors',errs)
        await b.close()
asyncio.run(main())
