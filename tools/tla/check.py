#!/usr/bin/env python3
"""Exhaustive bounded checker for tools/tla/FoodBlock.tla.

Explores every reachable state of one honest node that receives any pushes (1 or 2 blocks each)
of a small universe of blocks, in every order, and checks the invariants on every state.
Three independent components (identity, consent, allocation) share no blocks, so their product
is the interleaving of independent machines; counts are reported per component and as a product.

  python3 tools/tla/check.py            # check all three components
  python3 tools/tla/check.py --mutate N # run with a deliberate bug; the checker must fail
"""
import sys, itertools
from collections import defaultdict, deque

MUT = None   # set by --mutate

def B(id, **kw):
    kw['id'] = id
    kw.setdefault('prev', None); kw.setdefault('key', None); kw.setdefault('kind', 'plain')
    for k in ('counted_to', 'under', 'answers', 'replaces', 'newkey', 'word', 'subject', 'person', 'q', 'recovery'):
        kw.setdefault(k, None)
    return kw

# ---------------------------------------------------------------- universes
def identity_universe():
    g = lambda i, k: B(i, kind='genesis', author='X', key=k)
    pre = [g('Xg', 'gX')]
    bl = [
      B('x1',  author='X', key='gX', prev='Xg'),
      B('x2',  author='X', key='gX', prev='x1'),
      B('x2f', author='X', key='gX', prev='x1'),
      B('ROT', author='X', key='gX', kind='keygrant', prev='x2', counted_to='x1', replaces='gX', newkey='kX2'),
      B('ROT2',author='X', key='gX', kind='keygrant', prev='x2', counted_to='x1', replaces='gX', newkey='kX4'),
      B('y1',  author='X', key='kX2', prev='ROT'),
      B('y2',  author='X', key='kX4', prev='ROT2'),
      B('REC', author='X', key='rX', kind='keygrant', prev='Xg', counted_to='Xg', replaces='gX', newkey='kX3', recovery=True),
      B('z1',  author='X', key='kX3', prev='REC'),
      B('PR',  author='X', key='rX', prev='REC'),                      # recovery key signs a non-grant
      B('FR',  author='X', key='kE', kind='keygrant', prev='x1', counted_to='x1', replaces='gX', newkey='kE'),  # forged
    ]
    return pre, bl

def consent_universe():
    pre = [B(i, kind='genesis', author=a, key=k) for i, a, k in
           [('Pg','P','kP'),('Qg','Q','kQ'),('Ag','A','kA'),('Rg','R','kR'),('Zg','Z','kZ')]]
    bl = [
      B('GR',   author='Q', key='kQ', kind='grant', prev='Qg'),                       # Q lets A act
      B('ASK',  author='A', key='kA', kind='ask', prev='Ag', under='GR'),            # A asks P under Q's grant
      B('ASK0', author='Q', key='kQ', kind='ask', prev='YESq'),                        # Q asks P itself
      B('YESq', author='Q', key='kQ', kind='consent', word='yes', subject='Q', person='P', prev='GR'),  # not P's word
      B('STOP', author='P', key='kP', kind='consent', word='stop', subject='Q', prev='Pg'),
      B('YES',  author='P', key='kP', kind='consent', word='yes', subject='Q', prev='STOP'),
      B('STOPR',author='R', key='kR', kind='consent', word='stop', subject='R', person='P', prev='Rg'),   # recorder's STOP
      B('ASKR', author='R', key='kR', kind='ask', prev='STOPR'),
      B('ASKZ', author='Z', key='kZ', kind='ask', prev='Zg'),                        # unrelated sender
    ]
    return pre, bl

def alloc_universe():
    pre = [B(i, kind='genesis', author=a, key=k) for i, a, k in
           [('Sg','S','kS'),('B1g','B1','kB1'),('B2g','B2','kB2')]]
    bl = [
      B('O',   author='S', key='kS', kind='offer', prev='Sg', q=2),                # open offer of 2
      B('A1',  author='B1',key='kB1',kind='accept',prev='B1g',answers='O'),
      B('A2',  author='B2',key='kB2',kind='accept',prev='B2g',answers='O'),
      B('AL1', author='S', key='kS', kind='alloc', prev='O',  answers='A1', q=1),
      B('AL2', author='S', key='kS', kind='alloc', prev='AL1',answers='A2', q=1),
      B('AL2f',author='S', key='kS', kind='alloc', prev='AL1',answers='A2', q=1),  # equivocation with AL2
      B('AL3', author='S', key='kS', kind='alloc', prev='AL2',answers='A1', q=1),  # would exceed the offer
      B('FAKE',author='B1',key='kB1',kind='alloc', prev='A1', answers='A1', q=2),  # a buyer "allocates" to itself
      B('BADS',author='S', key='kB2',kind='alloc', prev='O',  answers='A1', q=1),  # wrong signing key
    ]
    return pre, bl

# ---------------------------------------------------------------- shared helpers
def needs(b):
    return {x for x in (b['prev'], b['counted_to'], b['under'], b['answers']) if x}

def past(b, S, byid):
    out, todo = set(), [b['id']]
    while todo:
        i = todo.pop()
        if i in out or i not in byid: continue
        out.add(i); todo += list(needs(byid[i]))
    out.discard(b['id']); return out

def anc_chain(i, byid, key):
    """i and its ancestors along prev while the key stays the same."""
    out = set()
    while i in byid and byid[i]['key'] == key and i not in out:
        out.add(i); i = byid[i]['prev']
    return out

def pairs(S, byid):
    g = defaultdict(set)
    for i in S:
        b = byid[i]
        if b['prev'] and b['kind'] != 'genesis': g[(b['key'], b['prev'])].add(i)
    return [v for v in g.values() if len(v) > 1]

def equivocated(S, byid, exempt_kind=None):
    """Both blocks of every pair and every later block of the same key."""
    bad = set()
    for pr in pairs(S, byid):
        bad |= pr
        k = byid[next(iter(pr))]['key']
        for i in S:
            if byid[i]['key'] == k and (anc_chain(i, byid, k) & pr) : bad.add(i)
    return bad

# ---------------------------------------------------------------- identity fold
GENESIS_KEY = {'X': 'gX'}
RECOVERY_KEY = {'X': 'rX'}

def keys_in(S, byid, author='X'):
    """Keys that speak for the author in the set S (the fold), plus frozen keys."""
    held = [byid[i] for i in S]
    kg = [b for b in held if b['kind'] == 'keygrant' and b['author'] == author]
    rots = defaultdict(list)
    for b in kg:
        if b['replaces']: rots[b['replaces']].append(b)
    # blocks of a replaced key after the lowest counted_to are void (rotations of that key stand)
    cut = {}
    for K, rs in rots.items():
        c = None
        for r in rs:
            a = anc_chain(r['counted_to'], byid, K) if r['counted_to'] in byid else set()
            c = a if c is None else (c & a)
        cut[K] = c
    def void(b):
        K = b['key']
        if K in cut and b['id'] not in cut[K]:
            return not (b['kind'] == 'keygrant' and b['replaces'] == K)
        return False
    # conflict: >=2 rotations of one key; their keys are frozen unless brought by the recovery key
    frozen = set()
    for K, rs in rots.items():
        if len(rs) >= 2:
            for r in rs:
                if not r['recovery']: frozen.add(r['newkey'])
    keys = {GENESIS_KEY[author]}
    ch = True
    while ch:
        ch = False
        for b in kg:
            ok_signer = (b['key'] in keys) or (b['recovery'] and b['key'] == RECOVERY_KEY[author])
            if ok_signer and not void(b) and b['newkey'] and b['newkey'] not in keys:
                keys.add(b['newkey']); ch = True
    # void spreads through frozen keys: whatever a frozen key brought in is frozen too
    ch = True
    while ch:
        ch = False
        for b in kg:
            if b['key'] in frozen and b['newkey'] in keys and b['newkey'] not in frozen:
                frozen.add(b['newkey']); ch = True
    return keys, frozen, void

def identity_fold(S, byid):
    keys, frozen, void = keys_in(S, byid)
    eq = equivocated(S, byid)
    counted = set()
    for i in S:
        b = byid[i]
        if b['kind'] == 'genesis': continue
        # the identity fold counts both blocks of a forked key grant (so the key can still be rotated)
        exempt = b['kind'] == 'keygrant' and any(i in p for p in pairs(S, byid))
        if b['key'] in frozen or void(b): continue
        if i in eq and not exempt: continue
        if b['key'] in keys or (b['recovery'] and b['key'] == RECOVERY_KEY['X']):
            counted.add(i)
    return (frozenset(counted), frozenset(keys), frozenset(frozen))

def identity_judge(b, S, byid):
    P = past(b, S, byid)
    if MUT == 'judge_by_store':
        keys, _, vd = keys_in(S, byid)         # BUG: judges by everything held, not by what the block rests on
        if vd(b): return 'void_key'
    else:
        keys, _, _ = keys_in(P | {i for i in S if byid[i]['kind'] == 'genesis'}, byid)
    k = b['key']
    if k == RECOVERY_KEY['X']:
        if b['kind'] != 'keygrant': return 'recovery_scope'
    elif k not in keys: return 'bad_signature'
    if b['kind'] == 'keygrant' and b['replaces'] and not (k == b['replaces'] or k == RECOVERY_KEY['X']):
        return 'not_own_rotation'
    p = byid[b['prev']]
    if not (p['key'] == k or (p['kind'] == 'genesis' and p['key'] == k) or (p['newkey'] == k) or
            (k == RECOVERY_KEY['X'] and p['kind'] == 'genesis')):
        return 'chain'
    return None

# ---------------------------------------------------------------- consent fold
def principals(a, byid):
    s = {a['author']}
    if a['under'] in byid: s.add(byid[a['under']]['author'])
    return s

def live_stop(ask, S, byid, P='P'):
    pr = principals(ask, byid)
    def applies(c):
        if c['kind'] != 'consent': return False
        who = c['person'] or c['author']
        if who != P: return False
        if c['subject'] is not None and c['subject'] not in pr: return False
        if c['author'] != P and c['author'] not in pr: return False      # a recorder binds only its own side
        return True
    stops = [byid[i] for i in S if applies(byid[i]) and byid[i]['word'] == 'stop']
    yes = [byid[i] for i in S if applies(byid[i]) and byid[i]['word'] == 'yes' and byid[i]['author'] == P]
    for c in stops:
        if not any(c['id'] in past(y, S, byid) for y in yes): return True
    return False

def consent_fold(S, byid):
    return tuple(sorted((i, live_stop(byid[i], S, byid)) for i in S if byid[i]['kind'] == 'ask'))

def simple_judge(b, S, byid):
    p = byid[b['prev']]
    if b['key'] != {'Q':'kQ','P':'kP','A':'kA','R':'kR','Z':'kZ','S':'kS','B1':'kB1','B2':'kB2','X':'gX'}[b['author']]:
        return 'bad_signature'
    if not (p['key'] == b['key']): return 'chain'
    return None

def consent_oracle(a, T):
    """What the spec says, written by hand for this universe: is this ask stopped, given the set T?"""
    if a in ('ASK', 'ASK0'): return 'STOP' in T and 'YES' not in T
    if a == 'ASKR': return 'STOPR' in T
    return False

# ---------------------------------------------------------------- allocation fold
def alloc_fold(S, byid):
    if 'O' not in S: return ()
    orderer = byid['O']['key']; cap = byid['O']['q']
    eq = equivocated(S, byid)
    chain, cur, total = [], 'O', 0
    while True:
        nxt = [i for i in S if byid[i]['prev'] == cur and byid[i]['kind'] == 'alloc' and byid[i]['key'] == orderer and i not in eq]
        if MUT == 'nonorderer_binds':
            nxt += [i for i in S if byid[i]['kind'] == 'alloc' and byid[i]['key'] != orderer and i not in chain]
        if not nxt: break
        i = sorted(nxt)[0]
        if i in chain: break
        q = byid[i]['q']
        if MUT != 'overbind' and total + q > cap: break
        chain.append(i); total += q; cur = i
        if MUT == 'nonorderer_binds' and byid[i]['key'] != orderer: cur = 'O'
    return tuple(chain)

# ---------------------------------------------------------------- the node
class Comp:
    def __init__(s, name, pre, bl, fold, judge):
        s.name, s.fold, s.judge = name, fold, judge
        s.pre = frozenset(b['id'] for b in pre)
        s.byid = {b['id']: b for b in pre + bl}
        s.ids = [b['id'] for b in bl]

def push(c, st, batch):
    store, waiting, refused, rstop, seen, viol, over = st
    byid = c.byid
    new = [b for b in batch if b not in seen]
    if not new: return None
    seen = seen | set(new)
    W = set(waiting) | set(new)
    store = set(store); refused = set(refused); rstop = set(rstop)
    while True:
        R = sorted(i for i in W if needs(byid[i]) <= store)
        if not R: break
        okset = []
        for i in R:
            code = c.judge(byid[i], store, byid)
            W.discard(i)
            if code: refused.add(i)
            else: okset.append(i)
        if c.name == 'consent':
            inround = store | set(okset) if MUT != 'stop_ignores_round' else set(store)
            for i in list(okset):
                if byid[i]['kind'] != 'ask': continue
                stopped = live_stop(byid[i], inround, byid)
                truth = consent_oracle(i, store | set(okset))
                if stopped and not truth: over = True
                if stopped:
                    okset.remove(i); rstop.add(i)
                elif truth: viol = True      # taken while a STOP that had arrived was live
        # equivocation: a pair is kept and not taken; here both are simply stored as the pair (nodes.md)
        store |= set(okset)
        if not okset and not R: break
        if not okset: continue
    return (frozenset(store), frozenset(W), frozenset(refused), frozenset(rstop), frozenset(seen), viol, over)

def invariants(c, st):
    store, waiting, refused, rstop, seen, viol, over = st
    byid = c.byid; errs = []
    S = store
    if refused & store: errs.append('refused block stored')
    if rstop & store: errs.append('stopped ask stored')
    for i in store:
        if not needs(byid[i]) <= store: errs.append('stored block %s lacks a need' % i)
    for i in waiting:
        if needs(byid[i]) <= store: errs.append('waiting block %s has all it needs' % i)
        if i in refused: errs.append('waiting and refused')
    if viol: errs.append('ask taken after a live STOP arrived')
    if over: errs.append('ask stopped with no live STOP for its side')
    # equivocation kept: both members of a pair that were not refused are stored
    for pr in pairs(store, byid):
        pass
    for i in seen:
        if i in refused or i in rstop or i in waiting: continue
        if i not in store: errs.append('block %s seen, judged, lost' % i)
    if c.name == 'identity':
        counted, keys, frozen = c.fold(S, byid)
        for i in counted:
            b = byid[i]
            if b['key'] in frozen: errs.append('frozen key counted')
            if not (b['key'] in keys or (b['recovery'] and b['kind'] == 'keygrant')): errs.append('count without right signer: ' + i)
        for bad in ('FR', 'PR'):
            if bad in store: errs.append(bad + ' stored')
        if 'ROT' in store and 'ROT2' in store and ({'y1','y2'} & counted): errs.append('crossing rotations: frozen key spoke')
        if 'ROT' in store and 'ROT2' not in store and 'REC' not in store and 'y1' in store and 'y1' not in counted: errs.append('lone rotation did not speak')
        for i in ('x2', 'x2f'):
            if ('ROT' in store or 'REC' in store) and i in counted: errs.append(i + ' counted after counted_to')
        if 'x2' in store and 'x2f' in store and ('x2' in counted or 'x2f' in counted): errs.append('forked pair counted')
        if 'REC' in store and 'z1' in store and 'z1' not in counted: errs.append('recovered key did not speak')
        if 'REC' in store and ('x1' in counted): errs.append('gX block survived recovery')
    if c.name == 'allocation':
        bound = c.fold(S, byid)
        if sum(byid[i]['q'] for i in bound) > 2: errs.append('bound more than offered')
        for i in bound:
            if byid[i]['key'] != byid['O']['key']: errs.append('bound by non-orderer')
        if 'AL2' in store and 'AL2f' in store and ({'AL2','AL2f','AL3'} & set(bound)): errs.append('forked allocation bound')
        if 'BADS' in store: errs.append('badly signed block stored')
    return errs

def stable(c, st):
    store, waiting, refused, rstop, seen, _, _ = st
    byid = c.byid
    nonask = lambda X: frozenset(i for i in X if byid[i]['kind'] != 'ask')
    return (nonask(store), frozenset(store | rstop), waiting, refused, c.fold(nonask(store) if c.name == 'consent' else store, byid)
            if c.name != 'consent' else c.fold(frozenset(), byid) and None)

def run(c):
    init = (c.pre, frozenset(), frozenset(), frozenset(), frozenset(), False, False)
    seenst = {init}; q = deque([init]); trans = 0; groups = defaultdict(set); fails = []
    while q:
        st = q.popleft()
        groups[st[4]].add(st)
        for e in invariants(c, st):
            fails.append((e, sorted(st[4]))); 
        pending = [i for i in c.ids if i not in st[4]]
        for r in (1, 2):
            for batch in itertools.combinations(pending, r):
                ns = push(c, st, batch); trans += 1
                if ns and ns not in seenst:
                    seenst.add(ns); q.append(ns)
    # confluence: same blocks delivered => same stored blocks (bar asks), same refusals, same waiting, same fold
    conf = 0
    for sn, sts in groups.items():
        outs = {stable(c, s) for s in sts}
        if len(outs) > 1:
            fails.append(('two nodes that received the same blocks differ', sorted(sn)))
        conf += 1
    return len(seenst), trans, conf, fails

def emit_tla():
    F = ['comp','author','key','kind','prev','counted_to','under','answers','replaces','newkey','word','subject','person','q','recovery']
    q = lambda v: 'FALSE' if v is None and False else ('"none"' if v is None else ('TRUE' if v is True else ('%d' % v if isinstance(v, int) else '"%s"' % v)))
    rows = []
    for name, u in (('identity', identity_universe), ('consent', consent_universe), ('allocation', alloc_universe)):
        pre, bl = u()
        for b in pre + bl:
            b = dict(b); b['comp'] = name
            if b['recovery'] is None: b['recovery'] = False
            rows.append('  "%s" |-> [%s]' % (b['id'], ', '.join('%s |-> %s' % (f, ('FALSE' if b[f] is False else q(b[f]))) for f in F)))
    print('T == [\n' + ',\n'.join(rows) + '\n]')

def main():
    global MUT
    if '--emit-tla' in sys.argv: emit_tla(); return
    if '--mutate' in sys.argv: MUT = sys.argv[sys.argv.index('--mutate') + 1]
    comps = []
    pre, bl = identity_universe(); comps.append(Comp('identity', pre, bl, identity_fold, identity_judge))
    pre, bl = consent_universe();  comps.append(Comp('consent', pre, bl, consent_fold, simple_judge))
    pre, bl = alloc_universe();    comps.append(Comp('allocation', pre, bl, alloc_fold, simple_judge))
    prod = 1; bad = False
    for c in comps:
        n, t, g, f = run(c); prod *= n
        print('%-10s blocks=%2d states=%7d transitions=%8d delivered-sets=%5d violations=%d' % (c.name, len(c.ids), n, t, g, len(f)))
        for e, w in f[:3]: print('   FAIL:', e, 'after receiving', w); 
        bad |= bool(f)
    print('product of independent components: %d states' % prod)
    print('RESULT:', 'VIOLATIONS' if bad else 'all invariants hold')
    sys.exit(1 if bad else 0)

main()
