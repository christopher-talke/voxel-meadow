"""Behaviour histograms over simulated days, lively mode off and on, plus character checks.

usage (from test/): ../.venv/bin/python livelyhist.py [days] [out.json]
Each day is 1,200 s of sim time at the 'cycle' clock (72x). Prints seconds per behaviour per animal per day.
"""
from common import DIST, CHROME
import asyncio, sys, json
from playwright.async_api import async_playwright
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
OUT = sys.argv[2] if len(sys.argv) > 2 else None
RUN = """(on) => { const M = MEADOW; localStorage.clear(); M.setLively(on, false); M.WX.mode = 'auto';
  const day = 1200, res = [];
  for (let d = 0; d < %d; d++) {
    const hist = {}, kinds = {}, ev = {};
    for (const a of M.dogs.concat(M.cats)) { hist[a.name] = {}; ev[a.name] = {}; kinds[a.name] = M.temperament(a.name, M.simMs).kind; }
    const last = {};
    for (let s = 0; s < day; s++) {
      M.advance(1);
      for (const a of M.dogs.concat(M.cats)) { const b = a.behaviour || '-'; hist[a.name][b] = (hist[a.name][b] || 0) + 1; if (last[a.name] !== b) { ev[a.name][b] = (ev[a.name][b] || 0) + 1; last[a.name] = b; } }
    }
    res.push({ hist, kinds, starts: ev });
  }
  return res; }""" % DAYS
async def main():
    out = {}
    async with async_playwright() as p:
        for mode in ('off', 'on'):
            b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
            ctx = await b.new_context(viewport={'width': 400, 'height': 300}, timezone_id='Australia/Sydney')
            await ctx.add_init_script('window.__SIM_PAUSE = true')
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_())
            await pg.goto(DIST); await pg.wait_for_function('window.MEADOW', timeout=60000)
            await pg.evaluate('MEADOW.simMs = new Date(2026, 10, 16, 6, 0).getTime(); MEADOW.timeMode = "cycle"')
            out[mode] = await pg.evaluate(RUN, mode == 'on')
            out[mode + '_errors'] = errs
            await b.close()
    for mode in ('off', 'on'):
        print('==', mode, 'errors', out[mode + '_errors'])
        for di, day in enumerate(out[mode]):
            for name, h in day['hist'].items():
                top = sorted(h.items(), key=lambda kv: -kv[1])[:7]
                print(f"day {di + 1} {name:7s} {day['kinds'][name]:9s}", ' '.join(f'{k}:{v}' for k, v in top))
    bad = []
    for mode in ('off', 'on'):
        tot = {}
        for day in out[mode]:
            for name, h in day['hist'].items():
                for k, v in h.items(): tot.setdefault(name, {}).setdefault(k, 0); tot[name][k] += v
        if tot['Mali'].get('ball'): bad.append(f'{mode}: Mali played ball')
        for c in ('Billy', 'Ashy'):
            if tot[c].get('zoomies') or tot[c].get('ball'): bad.append(f'{mode}: {c} did zoomies or ball')
        starts = {}
        for day in out[mode]:
            for name, e in day['starts'].items():
                for k, v in e.items(): starts.setdefault(name, {}).setdefault(k, 0); starts[name][k] += v
        print(mode, 'Murphy spooks', starts['Murphy'].get('spook', 0), 'Bobby grumps', starts['Bobby'].get('grump', 0), 'tidies', starts['Bobby'].get('tidy', 0), 'leaves', starts['Bobby'].get('leave', 0))
    print('character checks', 'OK' if not bad else bad)
    if OUT: open(OUT, 'w').write(json.dumps(out))
    if bad or out['off_errors'] or out['on_errors']: sys.exit(1)
asyncio.run(main())
