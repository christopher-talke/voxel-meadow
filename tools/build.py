"""Assemble src/shell.html + src/app.js + assets/rig.json into dist/doggo-meadow.html (single self-contained file)."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
shell = (root / 'src/shell.html').read_text()
app = (root / 'src/app.js').read_text()
rig = (root / 'assets/rig.json').read_text()
out = shell.replace('__RIG__', rig).replace('__APP__', app)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/doggo-meadow.html').write_text(out)
print('built dist/doggo-meadow.html', len(out), 'bytes')
