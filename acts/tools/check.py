# check.py: FoodX's checks on its own act library. Two kinds, kept apart:
#   1. wellformed.py: the shape check any node runs on any act from any publisher (run here on every act);
#   2. house checks below: FoodX's own style and the library-wide invariants (names, notes, examples, other sides,
#      twins, and the restraints the library puts on FoodOS moving alone; her grant is read by the Gate through the FoodBlock
#      SDK, never here). Another publisher's list need not follow the style.
# --draft skips the style checks that need full notes, examples and triggers. Prints problems, exits 1 if any.
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import defaultdict, Counter
from wellformed import problems as wellformed
from notes import note_parts
from moves import (no_side_reason, other_sides, side_of, mirror_candidates, deal_mismatch, moves_for, restraints_of, record_of,
                   separate, act_key, is_grant, WIDENS, WHEN, prop, any_of)

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
acts = json.load(open(D + 'acts.json'))
form = json.load(open(D + 'form.json'))
STRICT = '--draft' not in sys.argv
by = {a['name']: a for a in acts}
problems = []
def bad(msg): problems.append(msg)

# the grammar agrees with itself
MOVE = {m for m, d in form['moves'].items() if isinstance(d, dict) and 'stage' in d}
for m in MOVE:
    for k in form['moves'][m].get('known by', []):
        if k not in form['proof']: bad(f'move {m}: proof "{k}" is not one of {sorted(form["proof"])}')

# every record word a move can write is a FoodBlock form, and every move says what it adds to it (a status, a kind, a stop) or why it writes none
FORMS = form['moves']['record forms']
for r in form['moves']['move rules']['record']:
    if r not in FORMS: bad(f'move rules: record "{r}" has no record form')
for r in FORMS:
    if r != 'about' and r not in form['moves']['move rules']['record']: bad(f'record forms: "{r}" is no record of the move rules')
# every record form is exactly one word of the core: a reading (observe, transform), a promise, a grant, a transfer (a promise already met), or pencil (no block); an answer takes the anchor's type only where it must
KINDS = {'observe': 'reading', 'transform': 'reading', 'thing': 'reading', 'actor': 'reading', 'promise': 'promise', 'transfer': 'promise', 'grant': 'grant', 'pencil': 'pencil', 'as the anchor': 'anchor'}
for r, v in FORMS.items():
    if r == 'about': continue
    if v['type'] not in KINDS: bad(f'record form "{r}": type "{v["type"]}" is none of reading, promise, grant or pencil')
    if (v['type'] == 'pencil') != (v.get('writes') is False): bad(f'record form "{r}": pencil writes no block (`writes: false`), and only pencil does')
for m in MOVE:
    says = form['moves'][m].get('says')
    if says is None: bad(f'move {m}: says nothing of what it writes (`says`)')
    elif says.get('writes') is False and not says.get('because'): bad(f'move {m}: writes no block but gives no reason')

for fact_name, vals in form['properties'].items():
    if fact_name == 'about': continue
    known = form['nouns'] if fact_name == 'nouns' else form['facts'].get(fact_name, [])
    for v in vals:
        if v not in known: bad(f'properties: "{v}" is not a value of {fact_name}')
    for v in known:
        if v not in vals: bad(f'properties: {fact_name} "{v}" has no properties')
for fact_name, q in form['questions'].items():
    if fact_name == 'about': continue
    vals = form['facts'].get(fact_name) if isinstance(form['facts'].get(fact_name), list) else {'nouns': form['nouns'], 'verb': form['verbs']}.get(fact_name)
    if vals is None: bad(f'questions: "{fact_name}" is not a fact'); continue
    if set(q['answers']) != set(vals): bad(f'questions: the answers to "{q["question"]}" are not the values of {fact_name}')

# 1. shape, act by act
for a in acts: problems.extend(wellformed(a, form))

# 2. house style
for a in acts:
    n = a['name']
    if not n.split()[0].endswith('ing'): bad(f'{n}: an English name is a present participle, named for the whole life')
    if not a.get('card'): bad(f'{n}: no card')
    elif STRICT and '?' not in a['card']: bad(f'{n}: the card asks for no decision')
    if not a.get('note'): bad(f'{n}: no note')
    if STRICT and a.get('note'):
        nt, parts = a['note'], note_parts(a['note'])
        if not nt.startswith('You '): bad(f'{n}: the note opens with "You ", what you are doing')
        if nt.count('Kept apart from ') != 1 or not parts: bad(f'{n}: the note has one "Kept apart from " sentence before "It usually starts when "')
        elif re.search(r'\. [A-Z]', parts['starts when']): bad(f'{n}: the note ends with "It usually starts when "')
        else:
            for x in parts['apart from']:
                if x not in by: bad(f'{n}: kept apart from "{x}", which is not an act')
                elif x == n: bad(f'{n}: kept apart from itself')
    if STRICT:
        line = a.get('you do this when')
        if not line: bad(f'{n}: no "you do this when" line, what sets it apart from its neighbours')
        elif not line.rstrip().endswith('.'): bad(f'{n}: the "you do this when" line is a sentence that ends with a full stop')
    for k in a.get('known as', []):
        if k in by: bad(f'{n}: also known as "{k}", which is an act of its own')
    if len(a.get('examples', [])) < (3 if STRICT else 1): bad(f'{n}: fewer than {3 if STRICT else 1} examples')
    for e in a.get('examples', []):
        if STRICT and not e['filled'].rstrip().endswith('?'): bad(f'{n}: example {e["id"]} asks for no decision')
        if e['filled'] == a.get('card'): bad(f'{n}: example {e["id"]} repeats the card')
    for w in a.get('move words', []):
        if not (w.get('card') and w.get('examples')): bad(f'{n}: "{w.get("words")}" needs a card and examples')
        if STRICT and not w.get('trigger'): bad(f'{n}: "{w.get("words")}" has no trigger')

for w in form['moves']['on any deal']:
    for k in w.get('when', []):
        if k not in WHEN: bad(f'on any deal "{w["words"]}": when "{k}" is not one of {sorted(WHEN)}')

def words():
    for a in acts:
        for w in a.get('move words', []): yield a['name'], w
    for w in form['moves']['on any deal']: yield 'on any deal', w
seen = {}
for where, w in words():
    k = w['words'].lower()
    if k in seen and seen[k][1] != sorted(w['moves']): bad(f'"{w["words"]}" means {seen[k][1]} on {seen[k][0]} but {sorted(w["moves"])} on {where}')
    seen.setdefault(k, (where, sorted(w['moves'])))

# the two sides of one deal: real acts, both ways, the facts allow it, and the deal's own facts agree
END = form['facts']['other end']
SIDES = {a['name']: other_sides(a, acts, form) for a in acts}
# a written side is kept only where the facts tie or are overruled; one the facts decide alone is not written
for a in acts:
    if len(a.get('mirror', [])) == 1:
        from moves import computed_side
        if computed_side(a, acts, form) == a['mirror'][0]: bad(f'{a["name"]}: its other side is worked out from the facts, so it is not written')
for a in acts:
    ms = SIDES[a['name']]
    if separate(a, form) and END.get(a['which way'], a['which way']) != a['which way'] and (any_of(a, 'changes', 'title', form) or any_of(a, 'changes', 'custody', form)) and not ms and not a.get('no mirror') and not a.get('sides') and not no_side_reason(a, form):
        bad(f'{a["name"]}: no other side and no reason')
    for m in ms:
        if m not in by: bad(f'{a["name"]}: other side "{m}" is not an act'); continue
        b = by[m]
        if a['name'] not in SIDES[m]: bad(f'{a["name"]} -> {m}: the other side is one-way')
        if side_of(a) != side_of(b): bad(f'{a["name"]} -> {m}: one side is inside a plan and the other is not')
        if a.get('sides') or b.get('sides'): continue          # a deal that names both its sides is one act whoever signs: it is its own other end, so only that the two exist and name each other is checked
        if END.get(a['which way']) != b['which way']: bad(f'{a["name"]} -> {m}: "{a["which way"]}" and "{b["which way"]}" are not two ends of one deal')
        mm = deal_mismatch(a, b, form)
        if mm: bad(f'{a["name"]} -> {m}: the two sides disagree on the deal\'s {", ".join(mm)}')
        elif m not in mirror_candidates(a, acts, form): bad(f'{a["name"]} -> {m}: the facts do not allow this other side (nouns or changes differ)')

# acts with the same facts name each other in their notes (which ones a person would confuse is judgement)
if STRICT:
    twins = defaultdict(list)
    for a in acts:
        twins[(a['verb'], a['who is in it'], a['which way'], a.get('undoes', ''), a.get('other side', ''), a.get('price set by', ''), a.get('who waits'),
               a.get('recurs'), a.get('on a condition'), a.get('my side', ''), a.get('closes', ''), a.get('audience', ''),
               *(tuple(sorted(a[k])) for k in ('changes', 'in exchange', 'runs', 'nouns')))].append(a)
    for g in twins.values():
        for x in g:
            if len(g) > 1 and not any(y['name'] in (note_parts(x['note']) or {}).get('apart from', []) for y in g if y is not x):
                bad(f'{x["name"]}: same facts as {", ".join(y["name"] for y in g if y is not x)}, but it is kept apart from none of them')

# safety: what the library restrains. The library reads no grant: the protocol reading of her grant is the SDK's (FoodBlock's vectors
# prove it), asked by the Gate. The library knows only what restraints_of gives the Gate: what widens a grant is only hers; a demand with
# no rule behind it always waits, and a deal cannot talk it down.
def unruled(a):
    """a demand with no rule behind it: forced, and not by a rule (form.json properties of consent)."""
    return bool(prop('consent', a['consent'], 'forced', form) and not prop('consent', a['consent'], 'rule', form))
CALM = next(v for v, p in form['properties']['consent'].items() if not p.get('forced'))      # consent a deal may say to try to talk a demand down
for a in acts:
    for m in moves_for(a, form)[1]:
        r = restraints_of(a, m, form)
        grant = record_of(a, m, form) == 'a grant'
        if grant and r['only'] != 'you': bad(f'{a["name"]} / {m}: a grant is hers to sign, but FoodOS may make it')
        if r['only'] == 'you' and not grant: bad(f'{a["name"]} / {m}: only you, but the move writes no grant')
        if is_grant(a, form) and m in WIDENS and r['only'] != 'you': bad(f'{a["name"]} / {m}: widens a grant, but FoodOS may make it')
        if unruled(a) and not r['waits']: bad(f'{a["name"]} / {m}: a demand with no rule behind it must wait for her')
        if unruled(a) and restraints_of(a, m, form, deal={'consent': CALM})['waits'] != 'compelled by force': bad(f'{a["name"]} / {m}: a deal talked a demand down to consent')

# compiled.json is the library as FoodOS's JavaScript reads it: current, and answering every case as moves.py does.
import subprocess, tempfile
from compile import source_hash
from moves import live_moves
from pick import shortlist, next_question
try: compiled = json.load(open(D + 'compiled.json'))
except FileNotFoundError: compiled = None
if not compiled or compiled.get('from') != source_hash(): bad('compiled.json is older than the library: run tools/compile.py')
else:
    cases = []
    CONSENTS = form['facts']['consent']
    # deals the library must answer alike in Python and JavaScript: none; each consent a deal may say (and one it may not); the act's own
    # facts restated; one fact differing (a one-value fact, a list fact), alone and with force; and a key that is no fact of the act
    ONE_FACTS = ('who waits', 'on a condition', 'who carries the outcome', 'recurs')
    def deals_for(a):
        yield None
        for c in CONSENTS: yield {'consent': c}
        yield {'consent': 'not a consent'}
        own = {**{k: a[k] for k in ONE_FACTS}, 'runs': a['runs']}
        yield own
        for k in ONE_FACTS: yield {k: next(x for x in form['facts'][k] if x != a[k])}
        yield {'runs': [next(x for x in form['facts']['runs'] if x != a['runs'][0])]}
        yield {**own, 'consent': CONSENTS[-1], 'who waits': next(x for x in form['facts']['who waits'] if x != a['who waits'])}
        yield {'price': 5}
    for a in acts:
        for m in moves_for(a, form)[1] + ['No such move']:
            for deal in deals_for(a):
                cases.append({'kind': 'restraints', 'id': act_key(a), 'move': m, 'deal': deal, 'want': restraints_of(a, m, form, deal=deal)})
        for st in compiled['live by stage']:
            for pend in ([], [{'waiting on': 'you'}], [{'waiting on': 'them'}]):
                cases.append({'kind': 'live', 'id': act_key(a), 'stage': st, 'pending': pend, 'want': live_moves(a, form, st, pend)})
    qs = [(k, list(q['answers'])) for k, q in form['questions'].items() if k != 'about']
    for k, vs in qs:
        for v in vs: cases.append({'kind': 'pick', 'answers': {k: v}, 'want': [act_key(x) for x in shortlist(acts, {k: v})]})
    for (k1, v1s), (k2, v2s) in zip(qs, qs[1:] + qs[:1]):               # two answers at once, and the question to ask next
        for v1 in v1s[:3]:
            for v2 in v2s[:3]:
                answers = {k1: v1, k2: v2}; left = shortlist(acts, answers)
                cases.append({'kind': 'pick', 'answers': answers, 'want': [act_key(x) for x in left]})
                cases.append({'kind': 'next', 'answers': answers, 'want': next_question(left, answers, form)})
    for k, vs in qs:
        for v in vs[:3]: cases.append({'kind': 'next', 'answers': {k: v}, 'want': next_question(shortlist(acts, {k: v}), {k: v}, form)})
    cases.append({'kind': 'next', 'answers': {}, 'want': next_question(acts, {}, form)})
    # the JavaScript reader is FoodOS's; FoodBlock alone does not have it, so the proof runs only where the two repos sit side by side
    reader = os.environ.get('FOODOS_WORDS') or os.path.normpath(os.path.join(os.path.realpath(D), '..', '..', 'foodx', 'foodos', 'words', 'index.mjs'))
    if not os.path.exists(reader):
        print('note: no FoodOS reader beside this library; the JavaScript parity proof was skipped')
        off = []
    else:
      with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump({'cases': cases}, f)
      r = subprocess.run(['node', os.path.join(D, 'tools', 'parity.mjs'), f.name], capture_output=True, text=True)
      os.unlink(f.name)
      off = json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else [f'parity.mjs failed: {r.stderr.strip()[:300]}']
    for o in off[:20]: bad(f'the JavaScript reader disagrees: {o}')
    if len(off) > 20: bad(f'... and {len(off) - 20} more disagreements')

# the page builder reads nested lists as nested
from md2html import md
if md('- a\n  - b\n  - c\n- d') != '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>': bad('md2html flattens a nested list')

# the pages made from the library are current: built now, each must equal what is on disk (a stale page teaches an idea already replaced)
from build_page import page_html
from build_library import library_md
for name, builder, built in (('view/index.html', 'build_page.py', page_html()[0]), ('LIBRARY.md', 'build_library.py', library_md()[0])):
    try: on_disk = open(D + name).read()
    except FileNotFoundError: on_disk = None
    if on_disk != built: bad(f'{name} is older than what it is built from: run tools/{builder}')

for line, c in Counter(a.get('you do this when') for a in acts if a.get('you do this when')).items():
    if c > 1: bad(f'{c} acts share the "you do this when" line "{line[:60]}"')
for i, c in Counter(w for a in acts for w in a.get('was', [])).items():
    if c > 1: bad(f'the id {i} is `was` of {c} acts')
for a in acts:
    for w in a.get('was', []):
        if w in {x['id'] for x in acts}: bad(f'{a["name"]}: was {w}, which is a live act')
for name, c in Counter(a['name'] for a in acts).items():
    if c > 1: bad(f'two acts are called "{name}"')
for i, c in Counter(a['id'] for a in acts).items():
    if c > 1: bad(f'two acts share the id {i}')
ids = [e['id'] for a in acts for e in a['examples']] + [e['id'] for _, w in words() for e in w['examples']]
for i, c in Counter(ids).items():
    if c > 1: bad(f'example {i} is used {c} times')

print(f'{len(acts)} acts, {len(form["verbs"])} families. ', end='')
if problems:
    print(f'{len(problems)} problems:'); [print('  -', p) for p in problems[:200]]; sys.exit(1)
print('All checks pass.' + ('' if STRICT else ' (draft: notes, examples and triggers not yet checked)'))
