import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = 'file://' + str(ROOT / 'dist/index.html')
# local three.js (r128) so tests run offline: npm i three@0.128.0 then set THREE_DIR, or it defaults to ./node_modules/three/
THREE_DIR = os.environ.get('THREE_DIR', str(ROOT / 'node_modules/three')).rstrip('/') + '/'
