#!/usr/bin/env python3
"""Model-check tools/tla/FoodBlock.tla with TLC, one .cfg per part, then the deliberate bugs.

  python3 tools/tla/run-tlc.py              # the three parts must hold; every bug must be caught
  python3 tools/tla/run-tlc.py --parts      # only the three parts
  python3 tools/tla/run-tlc.py --mutants    # only the bugs
  python3 tools/tla/run-tlc.py consent      # one part, then the bugs that break it (CI runs the parts side by side)

The full parts take about an hour each (about 2.1 million states for identity and consent, 131 thousand for allocation;
nodes are symmetric); the bugs are caught within minutes.

Needs Java 17+. Downloads a pinned tla2tools.jar (TLA+ v1.7.4, TLC 2.19) into tools/tla/.cache/ (gitignored)
and checks its SHA-256. The bugs are the same names as `check.py --mutate`; each runs on the part it breaks.
"""
import hashlib, os, re, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
JAR = os.path.join(CACHE, 'tla2tools.jar')
URL = 'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar'
SHA = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
PARTS = ['identity', 'consent', 'allocation']
MUTANTS = [('judge_by_store', 'identity'), ('refuse_stop', 'consent'),
           ('nonorderer_binds', 'allocation')]

def jar():
    if not os.path.exists(JAR) or hashlib.sha256(open(JAR, 'rb').read()).hexdigest() != SHA:
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(URL, JAR)
        if hashlib.sha256(open(JAR, 'rb').read()).hexdigest() != SHA:
            sys.exit('tla2tools.jar does not match the pinned SHA-256')
    return JAR

def tlc(part, mut):
    cfg = open(os.path.join(HERE, 'FoodBlock.%s.cfg' % part)).read().replace('Mut = "none"', 'Mut = "%s"' % mut)
    with tempfile.TemporaryDirectory() as d:
        p = 'FoodBlock.%s.cfg' % part          # TLC reads the .cfg beside the spec, so run in a scratch copy
        open(os.path.join(d, p), 'w').write(cfg)
        shutil.copy(os.path.join(HERE, 'FoodBlock.tla'), d)
        r = subprocess.run(['java', '-XX:+UseParallelGC', '-cp', jar(), 'tlc2.TLC', '-nowarning', '-workers', 'auto',
                            '-metadir', os.path.join(d, 'states'), '-config', p, 'FoodBlock.tla'],
                           capture_output=True, text=True, cwd=d)
    return r.stdout + r.stderr

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    bad = False
    if only != '--mutants':
        for part in ([only] if only in PARTS else PARTS):
            out = tlc(part, 'none')
            m = re.search(r'(\d+) states generated, (\d+) distinct states found', out)
            ok = 'No error has been found' in out
            print('%-10s %s  generated=%s distinct=%s' % (part, 'holds' if ok else 'FAILS', *(m.groups() if m else ('?', '?'))))
            if not ok: bad = True; print(out[-3000:])
    if only != '--parts':
        for mut, part in MUTANTS:
            if only in PARTS and part != only: continue
            out = tlc(part, mut)
            m = re.search(r'Invariant (\w+) is violated', out)
            print('%-17s on %-10s %s' % (mut, part, ('caught: ' + m.group(1)) if m else 'NOT CAUGHT'))
            if not m: bad = True; print(out[-1500:])
    sys.exit(1 if bad else 0)

main()
