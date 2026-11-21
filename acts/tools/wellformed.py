# wellformed.py: the shape check for one act, from any publisher. It reads only the act and the grammar (form.json),
# never another act or FoodX's house style, so any node can run it on any list. An act that passes computes every
# move's rules from its facts. Usage: problems(act, form) -> list of strings.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from moves import moves_for, effect_of, undo_of, needs_for, record_of, restraints_of, ONLY, WAITS, reach_of, terms_for, live_moves, separate, priced, alone as alone_act, any_of

ONE = ('who is in it', 'which way', 'consent', 'who waits', 'on a condition', 'who carries the outcome', 'recurs')
OPTIONAL = ('closes', 'undoes')
RUNNING = ('accepted', 'underway')

def problems(a, form):
    F, MR, out = form['facts'], form['moves']['move rules'], []
    n = a.get('name') or a.get('id') or '?'
    def bad(msg): out.append(f'{n}: {msg}')
    if not a.get('id'): bad('no id')
    if not a.get('name'): bad('no name')
    if a.get('verb') not in form['verbs']: bad(f'family "{a.get("verb")}" is not one of the {len(form["verbs"])}')
    for x in a.get('nouns') or [None]:
        if x not in form['nouns']: bad(f'noun "{x}" is not in the list')
    for c in a.get('changes') or [None]:
        if c not in F['changes']: bad(f'changes "{c}" is not one of {F["changes"]}')
    for k in ONE:
        if a.get(k) not in F[k]: bad(f'{k} "{a.get(k)}" is not one of {F[k]}')
    if out: return out                                   # the rest needs well-typed facts
    alone = a['who is in it'] == 'alone'
    if not isinstance(a.get('in exchange'), list): bad('in exchange is a list: empty exactly when everyone in it shares one plan')
    if out: return out
    if len(a['in exchange']) > 1: bad('in exchange has one value')
    for b in a['in exchange']:
        if b not in F['in exchange']: bad(f'in exchange "{b}" is not one of {F["in exchange"]}')
    one_plan = not separate(a, form)
    if one_plan == bool(a['in exchange']): bad('in exchange is empty exactly when everyone in it shares one plan')
    if len(a.get('runs') or []) != 1 or a['runs'][0] not in F['runs']: bad(f'runs is one of {F["runs"]}')
    if out: return out
    if separate(a, form) != bool(a.get('other side')): bad('the other side is named exactly when separate plans deal')
    elif a.get('other side') and a['other side'] not in F['other side']: bad(f'other side "{a["other side"]}" is not one of {F["other side"]}')
    want_price = separate(a, form) and priced(a, form)
    if want_price != bool(a.get('price set by')): bad('how the price is set is named exactly when something goes the other way between separate plans')
    elif a.get('price set by') and a['price set by'] not in F['price set by']: bad(f'price set by "{a["price set by"]}" is not one of {F["price set by"]}')
    if a.get('my side') and (a['my side'] not in F['my side'] or not separate(a, form)): bad('my side is said only between separate plans, and is one of ' + str(F['my side']))
    if a.get('audience') and (a['audience'] not in F['audience'] or not alone_act(a, form)): bad('audience is said only of what she does alone, and is one of ' + str(F['audience']))
    for k in OPTIONAL:
        if a.get(k) and a[k] not in F[k]: bad(f'{k} "{a[k]}" is not one of {F[k]}')
    custody = any_of(a, 'changes', 'custody', form) and not any_of(a, 'changes', 'title', form)
    for k in ('may the holder use it', 'back when'):
        if custody and not a.get(k): bad(f'something is held that is not owned, so it says {k}')
        if a.get(k) and a[k] not in F[k]: bad(f'{k} "{a[k]}" is not one of {F[k]}')
    if not (a.get('judged') or {}).get('by'): bad('the judged facts need who judged')
    # The family's own facts (form.json verbs[...].facts): every fact it names must hold one of the values the family allows. That is where a
    # family says what it never does (buying, selling, giving, getting and swapping are by consent), so no word list is kept here.
    flip = F['other end']
    for k, allowed in (form['verbs'][a['verb']].get('facts') or {}).items():
        if k == 'changes': ok = bool(set(a['changes']) & set(allowed))
        elif k == 'in exchange': ok = (a['in exchange'][0] if a['in exchange'] else None) in allowed or (not a['in exchange'] and 'nothing' in allowed)
        elif k == 'runs': ok = a['runs'][0] in allowed
        elif k == 'which way' and a.get('undoes') == 'yes': ok = flip.get(a['which way'], a['which way']) in allowed      # an act that undoes a deal runs the other way
        else: ok = a.get(k) in allowed
        if not ok: bad(f'the family {a["verb"]} has {k} in {allowed}, but the act says {a.get(k)}')
    if 'undo' in a and a['undo'] not in MR['undo']: bad(f'undo "{a["undo"]}" is not one of {MR["undo"]}')
    for k in (a.get('judged') or {}).get('facts', []):
        if k not in a: bad(f'judged names {k}, which the act does not say')
    for e in a.get('examples', []):
        if not (e.get('id') and e.get('card') and e.get('filled')): bad(f'example {e.get("id")} is incomplete')
    # A deal is one act, whoever signs: `sides` names each end of it in her words (the template's `sides`: `from` gives the thing, `to`
    # takes it and pays), and `was` holds the ids of acts merged into this one so an old deal that names one still resolves.
    if 'sides' in a:
        sd = a['sides']
        if not (isinstance(sd, dict) and set(sd) == {'from', 'to'} and all(isinstance(v, str) and v.strip() for v in sd.values()) and sd['from'] != sd['to']): bad('sides is {from, to}: two different names, one for each end of the deal')
        if not separate(a, form): bad('sides is said only between separate plans, where there are two ends')
    if 'was' in a and not (isinstance(a['was'], list) and a['was'] and all(isinstance(x, str) and x for x in a['was']) and len(set(a['was'])) == len(a['was']) and a['id'] not in a['was']): bad('was is a list of other acts\' ids, each once')
    if 'known as' in a and not (isinstance(a['known as'], list) and a['known as'] and all(isinstance(x, str) and x for x in a['known as'])): bad('known as is a list of names the act also goes by')
    if 'you do this when' in a and not (isinstance(a['you do this when'], str) and a['you do this when'].strip()): bad('you do this when is one line')
    for lang, lab in (a.get('labels') or {}).items():
        if not isinstance(lab, dict) or set(lab) - {'name', 'card', 'note', 'examples'}: bad(f'labels "{lang}" may hold only name, card, note and examples')
    if out: return out
    try:
        ms = moves_for(a, form)[1]
        for m in ms:
            for kind, v in (('effect', effect_of(a, m, form)), ('undo', undo_of(a, m, form)), ('record', record_of(a, m, form)),
                            ('reach', reach_of(a, m, form))):
                if v not in MR[kind]: bad(f'{m}: {kind} "{v}" is not one of {MR[kind]}')
            r = restraints_of(a, m, form)
            if r['only'] not in ONLY or r['waits'] not in WAITS: bad(f'{m}: restraints only "{r["only"]}", waits "{r["waits"]}" are not one of {ONLY}, {WAITS}')
            for need in needs_for(a, m, form):
                if need not in MR['needs']: bad(f'{m}: need "{need}" is not one of {MR["needs"]}')
        for t in terms_for(a, form):
            if t not in form['term rules']: bad(f'term rule "{t}" is not in form.json')
        stages = [s for s in form['moves']['live by stage'] if s != 'about']
        reach = set()
        for s in stages:
            for p in ([], [{'waiting on': 'you'}], [{'waiting on': 'them'}]): reach |= set(live_moves(a, form, s, p))
        for m in ms:
            if m not in reach: bad(f'{m} is never live at any stage')
        for w in a.get('move words', []):
            if not (w.get('moves') and w.get('words')): bad(f'move words "{w.get("words")}" need moves and words')
            for m in w.get('moves', []):
                if m not in ms: bad(f'move words "{w.get("words")}" use {m}, which the act cannot take')
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as e:
        bad(f'the move rules fail ({e!r})')
    return out
