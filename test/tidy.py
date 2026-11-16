from common import DIST, THREE_DIR, CHROME
import asyncio
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
        await pg.evaluate("()=>{const M=window.MEADOW;M.freezeCam=true;M.setTod('day',true);M.dogs.forEach(d=>{d.spookCd=999});const m=M.dogs[0];m.interrupt(m.B('nap'),'nap');M.dogs[1].interrupt([M.S.hold('sit',999)],'x');M.advance(14);m.interrupt([M.S.go({x:-20,y:60},'run')],'x');M.advance(8);M.camera.position.set(-40,48,25);M.controls.target.set(-76,0,-15);M.camera.lookAt(-76,0,-15);M.controls.update();}")
        print('mess before', await pg.evaluate("MEADOW.CLOTHS.map(c=>c.mess().toFixed(2))"))
        # a cloth vertex near centre, projected to screen
        pt = await pg.evaluate("()=>{const c=MEADOW.CLOTHS[1],v=new MEADOW.camera.position.constructor(c.h[3*20],c.h[3*20+1]+0.3,c.h[3*20+2]);v.project(MEADOW.camera);return [(v.x+1)/2*1000,(1-v.y)/2*640];}")
        print('pt', pt, await pg.evaluate('MEADOW.pick(%f,%f)' % tuple(pt)), await pg.evaluate('MEADOW.pick(500,320)'))
        await pg.mouse.move(*pt); await pg.mouse.down(); await pg.wait_for_timeout(300); print('dbg1', await pg.evaluate('MEADOW.dbg()')); await pg.wait_for_timeout(600); print('dbg2', await pg.evaluate('MEADOW.dbg()')); await pg.mouse.up()
        await pg.wait_for_timeout(300)
        await pg.evaluate("MEADOW.advance(1.5)")
        print('after hold', await pg.evaluate("MEADOW.CLOTHS.map(c=>c.mess().toFixed(2))"))
        # drag test on Mali's blanket (flat): drag a point sideways, check mess rises
        pt2 = await pg.evaluate("()=>{const c=MEADOW.CLOTHS[2],v=new MEADOW.camera.position.constructor(c.h[3*20],c.h[3*20+1]+0.3,c.h[3*20+2]);v.project(MEADOW.camera);return [(v.x+1)/2*1000,(1-v.y)/2*640];}")
        r = await pg.evaluate("""([x,y])=>{const M=MEADOW,cv=document.querySelector('#stage canvas');const ev=(t,dx,dy)=>cv.dispatchEvent(new PointerEvent(t,{clientX:x+dx,clientY:y+dy,pointerType:'mouse',bubbles:true,isPrimary:true}));
 ev('pointerdown',0,0);for(let i=1;i<=8;i++)ev("pointermove",i*4,-i*1);const mid=M.dbg();M.advance(1);const m1=M.CLOTHS[2].mess().toFixed(2);ev('pointerup',72,-16);M.advance(3);return [mid,m1,M.CLOTHS[2].mess().toFixed(2)];}""", pt2)
        print('drag', r)
        await pg.screenshot(path='tidy.png')
        await b.close()
asyncio.run(main())
