"""Compare two baselines from baseline.py: fingerprint and trace must match for a pure refactor; stills are diffed.

usage (from test/): ../.venv/bin/python compare.py <before> <after> [--sheet out.png]
"""
import sys, json, pathlib
from PIL import Image, ImageChops, ImageStat
root = pathlib.Path(__file__).parent / 'baseline'
a, b = root / sys.argv[1], root / sys.argv[2]
A, Bj = json.loads((a / 'baseline.json').read_text()), json.loads((b / 'baseline.json').read_text())
ok = True
for k in sorted(set(A['fingerprint']) | set(Bj['fingerprint'])):
    same = A['fingerprint'].get(k) == Bj['fingerprint'].get(k)
    ok &= same
    print(f'fingerprint {k:8s} {"same" if same else "CHANGED"}')
ta, tb = A['trace'], Bj['trace']
first = next((i for i, (x, y) in enumerate(zip(ta, tb)) if x != y), None)
if first is None and len(ta) == len(tb): print(f'trace same ({len(ta)} events)')
else:
    ok = False; i = first if first is not None else min(len(ta), len(tb))
    print(f'trace DIVERGES at event {i}:', ta[i] if i < len(ta) else None, 'vs', tb[i] if i < len(tb) else None)
for k in sorted(set(A.get('perf', {})) & set(Bj.get('perf', {}))):
    pa, pb = A['perf'][k], Bj['perf'][k]
    print(f'perf {k:16s} calls {pa["calls"]}->{pb["calls"]} tris {pa["tris"]}->{pb["tris"]}')
pairs = [(p, b / p.name) for p in sorted(a.glob('*.png')) if (b / p.name).exists()]
for pa, pb in pairs:
    d = ImageChops.difference(Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB'))
    print(f'still {pa.stem:16s} mean diff {sum(ImageStat.Stat(d).mean) / 3:6.2f}')
if '--sheet' in sys.argv and pairs:
    out = sys.argv[sys.argv.index('--sheet') + 1]; w, h = 640, 360
    sheet = Image.new('RGB', (w * 2, h * len(pairs)), 'white')
    for i, (pa, pb) in enumerate(pairs):
        sheet.paste(Image.open(pa).resize((w, h)), (0, i * h)); sheet.paste(Image.open(pb).resize((w, h)), (w, i * h))
    sheet.save(out); print('sheet', out)
sys.exit(0 if ok else 1)
