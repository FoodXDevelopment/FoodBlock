# compile.py: writes compiled.json, every act's rules worked out once by moves.py for its usual case (shape, moves, what each
# move records and needs, and the term rules), so FoodOS's JavaScript reads them as data
# (acts/index.mjs) instead of keeping a second copy of the rules. `unruled` is the one answer a deal's consent can change: for
# each consent a deal may say, whether the act is then a demand with no rule behind it. check.py fails when compiled.json is
# older than the library or the rules.
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from notes import note_parts
from moves import (other_sides, word_of, deal_terms, words_for, moves_for, record_of, needs_for, shape_hash, act_key,
                   unruled, GRAMMAR_FACTS)

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'

def source_hash():
    return hashlib.sha256(b''.join(open(D + f, 'rb').read() for f in ('acts.json', 'form.json', 'tools/moves.py', 'tools/notes.py', 'tools/compile.py'))).hexdigest()[:16]

def compile_library(acts, form):
    out, by_name, library = [], {x['name']: act_key(x) for x in acts}, {x['name']: x for x in acts}
    for a in acts:
        shape, ms = moves_for(a, form)
        out.append({'id': act_key(a), 'name': a['name'], 'shape': shape, 'shape_hash': shape_hash(a),
                    'words': words_for(a, form), 'other_sides': [by_name[n] for n in other_sides(a, acts, form)],      # a name that is no act raises: check.py would say which
                    'apart_from': [by_name[n] for n in (note_parts(a['note']) or {}).get('apart from', [])],
                    'was': a.get('was', []), 'sides': a.get('sides'), 'known_as': a.get('known as', []), 'you_do_this_when': a.get('you do this when'),
                    'facts': {k: a[k] for k in GRAMMAR_FACTS if k in a}, 'terms': deal_terms(a, library, form),
                    'unruled': {c: unruled(a, {'consent': c}, form) for c in form['facts']['consent']},
                    'moves': {m: {'word': word_of(a, m, form), 'group': form['moves'][m]['group'], 'record': record_of(a, m, form), 'needs': needs_for(a, m, form),
                                  'first': needs_for(a, m, form, first=True)} for m in ms}})
    # What a move writes when no act is named (a tap on a row): the record most acts of a deal give it. Counted from the library, never listed.
    deal = {}
    for x in out:
        if x['shape'] == 'deal':
            for m, v in x['moves'].items(): deal.setdefault(m, {}).setdefault(v['record'], 0); deal[m][v['record']] += 1
    usual = {m: max(c, key=lambda r: (c[r], -list(c).index(r))) for m, c in deal.items()}
    moves = form['moves']
    return {'about': 'Made by tools/compile.py from acts.json and form.json; never edited by hand.', 'from': source_hash(),
            'records': {k: v for k, v in moves['record forms'].items() if k != 'about'},
            'says': {m: d['says'] for m, d in moves.items() if isinstance(d, dict) and 'stage' in d}, 'usual': usual,
            'live by stage': {k: v for k, v in form['moves']['live by stage'].items() if k != 'about'},
            'pending': {k: v for k, v in form['moves']['pending'].items() if k != 'about'},
            'questions': {k: v for k, v in form['questions'].items() if k != 'about'}, 'acts': out}

if __name__ == '__main__':
    acts, form = json.load(open(D + 'acts.json')), json.load(open(D + 'form.json'))
    json.dump(compile_library(acts, form), open(D + 'compiled.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'compiled.json: {len(acts)} acts')
