import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = 'file://' + os.environ.get('MEADOW_DIST', str(ROOT / 'dist/index.html'))
# local three.js (r128) so tests run offline: npm i three@0.128.0 then set THREE_DIR, or it defaults to ./node_modules/three/
THREE_DIR = os.environ.get('THREE_DIR', str(ROOT / 'node_modules/three')).rstrip('/') + '/'
# browser: CHROME env var, else system Chrome, else Playwright's cached headless shell
import glob
def _chrome():
    if os.environ.get('CHROME'): return os.environ['CHROME']
    if os.path.exists('/usr/bin/google-chrome'): return '/usr/bin/google-chrome'
    hits = sorted(glob.glob(os.path.expanduser('~/.cache/ms-playwright/chromium_headless_shell-*/*/headless_shell')))
    return hits[-1] if hits else '/usr/bin/google-chrome'
CHROME = _chrome()
# NSS libs unpacked without root (apt-get download + dpkg -x) for the headless shell on bare WSL
_L = os.path.expanduser('~/.local/chromelibs/root/usr/lib/x86_64-linux-gnu')
if os.path.isdir(_L): os.environ['LD_LIBRARY_PATH'] = _L + ':' + os.environ.get('LD_LIBRARY_PATH', '')
