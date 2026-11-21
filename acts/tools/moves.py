# moves.py: works out which moves an act can take, what every move does, who it reaches, who can undo it, what it needs
# to know, the record it writes, the restraints it puts on FoodOS moving alone, which term rules hold and which acts can be
# its other side, from the act's facts (form.json: facts, properties, moves, term rules). Nothing is listed per act and verbs
# carry no rules. The code reads the properties form.json gives each value (`properties`), never the words: a new value is
# added there with its properties and every rule here reads it at once. The facts a model judged are the act's usual case: a
# real deal passed as `deal` carries its own, and may move consent only toward force. Given where an act stands and which
# proposals are open, live_moves keeps only the moves that fit now. Whether FoodOS may move alone is never decided here:
# restraints_of gives only what the library knows (what widens a grant, what always waits, who a move reaches, who can
# undo it, which measures it carries); her grant is read by the Gate through the FoodBlock SDK.
import hashlib, json, os

_FORM = None

def _form(form=None):
    global _FORM
    if form is not None: return form
    if _FORM is None: _FORM = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'form.json')))
    return _FORM

def prop(fact_name, value, key, form=None):
    """a property of a fact's value, from form.json `properties`: the one place meaning is written."""
    return _form(form)['properties'].get(fact_name, {}).get(value, {}).get(key)

DEFAULT = {'my side': 'just me', 'closes': 'at the first yes', 'audience': 'her node only'}

def fact(a, k, deal=None, form=None):
    """the act's usual value for a fact, unless this deal carries its own; consent moves only toward force."""
    usual = a.get(k, DEFAULT.get(k))
    if k == 'consent' and deal and 'consent' in deal:
        return max(usual, deal['consent'], key=lambda v: prop('consent', v, 'force', form) or 0)
    return (deal or {}).get(k, usual)

def P(a, k, key, deal=None, form=None):
    return prop(k, fact(a, k, deal, form), key, form)

def any_of(a, k, key, form=None):
    """a property held by any of a list fact's values (nouns, changes)."""
    return any(prop(k, v, key, form) for v in a.get(k, []))

def separate(a, form=None):
    """separate plans deal: the one test every rule reads for 'others'."""
    return P(a, 'who is in it', 'plans', form=form) == 'separate'

def alone(a, form=None):
    return P(a, 'who is in it', 'parties', form=form) == 'none'

def many(a, form=None):
    """more than one person on a side: a group in it, on the other side, or on her side."""
    return P(a, 'who is in it', 'parties', form=form) == 'many' or bool(P(a, 'other side', 'many', form=form)) or bool(P(a, 'my side', 'many', form=form))

def side_of(a, form=None):
    """economy when everyone in it shares one plan (alone, a household, a crew); catallaxy when separate plans deal."""
    return 'catallaxy' if separate(a, form) else 'economy'

def holds(a, form=None):
    """she keeps a quantity for a time: things she makes, keeps herself, carries or holds for another, perishables she trades,
    or money a group or a holder keeps; never what is gone in one go (eating it), a gift, or a thing bought for use."""
    if span(a, form) == 'instant': return False
    things = any_of(a, 'nouns', 'thing', form)
    return ((things and (any_of(a, 'changes', 'makes', form) or alone(a, form) or any_of(a, 'changes', 'custody', form) or any_of(a, 'changes', 'place', form)))
            or (any_of(a, 'nouns', 'perishes', form) and priced(a, form))
            or (any_of(a, 'nouns', 'money', form) and (P(a, 'who is in it', 'parties', form=form) == 'many' or bool(P(a, 'my side', 'many', form=form))
                                                     or any_of(a, 'changes', 'custody', form))))

def keeps_for_others(a, form=None):
    """she holds what is not hers: custody passes and ownership does not."""
    return any_of(a, 'changes', 'custody', form) and not any_of(a, 'changes', 'title', form)

def priced(a, form=None):
    """something goes the other way."""
    return bool(a['in exchange']) and bool(prop('in exchange', a['in exchange'][0], 'priced', form))

def forced(a, deal=None, form=None):
    return bool(P(a, 'consent', 'forced', deal, form))

def span(a, form=None):
    return prop('runs', a['runs'][0], 'span', form)

def recurs(a, form=None):
    return bool(P(a, 'recurs', 'recurs', form=form))

def credit(a, deal=None, form=None):
    """a priced deal between separate plans where one side's part comes later, on no condition."""
    return (separate(a, form) and priced(a, form) and not forced(a, deal, form) and bool(P(a, 'who waits', 'ordered', deal, form))
            and not P(a, 'on a condition', 'contingent', deal, form))

def money_leg(a, form=None):
    """money goes one way in this act."""
    return bool(a['in exchange'] and prop('in exchange', a['in exchange'][0], 'money', form)) or (any_of(a, 'nouns', 'money', form) and any_of(a, 'changes', 'hands', form))

def is_grant(a, form=None):
    """an act that gives or restores authority or access (a permission that is not the use of a thing): only the one who
    gives it signs what widens it. The price is a term; a permission she buys (a licence, a permit) is an ordinary deal."""
    return (any(prop('nouns', n, 'promise', form) == 'may' for n in a['nouns']) and not any_of(a, 'nouns', 'thing', form)
            and any_of(a, 'changes', 'binds', form) and not (P(a, 'which way', 'receives', form=form) and not P(a, 'which way', 'sends', form=form) and priced(a, form)))

def told(a, form=None):
    """an act whose only change is what someone else knows: telling, to the other side or to an audience she chose."""
    return (all(prop('changes', c, 'knows', form) for c in a['changes']) and bool(P(a, 'which way', 'sends', form=form))
            and (separate(a, form) or P(a, 'audience', 'reach', form=form) != 'nobody'))

def ordered_shape(a, deal=None, form=None):
    """compelled and dealing with the one who claims it: received, done, contested in its own act. A compelled duty met by
    a supplier she chooses (a priced deal at a price not set by a rule) is an ordinary deal inside the duty."""
    chosen = priced(a, form) and not P(a, 'price set by', 'law', form=form) and not P(a, 'price set by', 'signed rule', form=form)
    return forced(a, deal, form) and not alone(a, form) and not chosen

def shape_of(a, form=None, deal=None):
    sp, ch = span(a, form), set(a['changes'])
    if ordered_shape(a, deal, form): return 'ordered'
    if sp == 'instant': return 'one block'
    if sp == 'lasts' and all(prop('changes', c, 'knows', form) or prop('changes', c, 'binds', form) for c in ch) \
            and (alone(a, form) or P(a, 'which way', 'sends', form=form) and not P(a, 'which way', 'receives', form=form)) and not priced(a, form): return 'standing'
    if alone(a, form): return 'alone'
    if separate(a, form) and priced(a, form) and sp == 'once' and P(a, 'which way', 'sends', form=form) != P(a, 'which way', 'receives', form=form) \
            and not P(a, 'who waits', 'ordered', deal, form) and not P(a, 'on a condition', 'contingent', deal, form) \
            and P(a, 'price set by', 'posted', form=form): return 'exchange'
    return 'deal'

def moves_for(a, form=None, deal=None):
    """every move the act can ever take: one skeleton (propose, reply, do its parts, close) for every act, each move kept
    or skipped for a reason its facts give, never a list per shape."""
    form = _form(form)
    s = shape_of(a, form, deal)
    instant, lasts = span(a, form) == 'instant', span(a, form) == 'lasts'
    other = not alone(a, form)                                     # someone else is in it
    hands = any_of(a, 'changes', 'hands', form)
    proposes = other and s not in ('ordered', 'one block', 'standing')     # another's yes is needed for it
    ms = ['Change', 'Question', 'Answer', 'Note']                  # every act can be changed, asked about and noted
    if proposes: ms += ['Promise', 'Withdraw', 'Decline']
    if proposes and s != 'exchange': ms.append('Accept')           # at a posted price the buyer's yes is the sale itself
    if not instant and s != 'exchange': ms.append('Start')
    if not instant: ms.append('End')
    if s in ('deal', 'alone'): ms += ['Invite', 'Pass']
    if s in ('deal', 'alone') and many(a, form): ms += ['Leave', 'Remove']    # only a group has members to leave or remove
    if other and s in ('deal', 'exchange', 'ordered'):             # each side's part
        if money_leg(a, form): ms.append('Pay')
        if hands and not all(prop('nouns', n, 'money', form) for n in a['nouns']): ms.append('Hand over')   # money alone is paid
        ms.append('Receive')                                       # the receiver signs for goods, or for work done
    if (s in ('alone', 'one block', 'ordered') or (other and not hands)) and not lasts: ms.append('Done')
    if (recurs(a, form) or lasts) and s in ('deal', 'alone', 'standing'): ms += ['Pause', 'Resume']
    if is_grant(a, form) and s != 'ordered': ms += ['Accept', 'Decline']        # whoever is given the authority answers it
    for w in a.get('move words', []):
        ms += [m for m in w['moves'] if m not in ms]
    if s == 'ordered': ms = [m for m in ms if m not in ('Promise', 'Accept', 'Decline', 'Withdraw', 'Invite', 'Pass', 'Leave', 'Remove')]
    order = [m for m, d in form['moves'].items() if isinstance(d, dict) and 'stage' in d]
    return s, sorted(dict.fromkeys(ms), key=order.index)

def word_of(a, move, form=None):
    """the word a move reads as on this act: a Promise reads Offer from the one who gives and Ask from the one who receives."""
    if move == 'Promise': return 'Offer' if P(a, 'which way', 'sends', form=form) else 'Ask'
    return move

def live_moves(a, form=None, stage='not started', pending=(), deal=None):
    """the moves that fit now: where the act stands (form.json `live by stage`) plus the answers to every open proposal
    (`pending`: dicts with 'waiting on' 'you' or 'them'), inside what the act can ever take."""
    form = _form(form)
    table, pend = form['moves']['live by stage'], form['moves']['pending']
    live = set(table.get(stage, []))
    for p in pending: live |= set(pend['waiting on ' + p['waiting on']])
    can = moves_for(a, form, deal=deal)[1]
    return [m for m in can if m in live]

# What every move does and needs, worked out from the act's facts and the move, never listed per act. The words each
# function may return are form.json `move rules`; check.py holds every answer to them.

def effect_of(a, move, form=None, deal=None):
    """what the move does to the world (form.json move rules, `effect judged`)."""
    ch, sep = set(a['changes']), separate(a, form) or many(a, form)
    if move == 'Pay': return 'money'
    if move in ('Invite', 'Pass', 'Remove'): return 'binds another person'
    if move == 'Note': return 'what is known' if separate(a, form) else 'nothing yet'   # a Note in a deal is signed into it: the other side reads it
    if move in ('Withdraw', 'Resume'): return 'nothing yet'
    if move in ('Accept', 'Promise', 'Change', 'End', 'Leave', 'Pause'):
        return 'a promise' if sep else 'nothing yet'
    if move in ('Question', 'Answer', 'Decline'):
        return 'what is known' if sep else 'nothing yet'
    if move == 'Start' and shape_of(a, form, deal) in ('deal', 'exchange', 'ordered') and not any_of(a, 'changes', 'makes', form): return 'nothing yet'
    if move in ('Hand over', 'Receive'):
        if any(prop('changes', c, 'title', form) or prop('changes', c, 'custody', form) for c in ch): return 'something changes hands'
        return 'something moves' if any_of(a, 'changes', 'place', form) else 'what is known'
    if any_of(a, 'changes', 'makes', form): return 'something is made or changed'
    if any_of(a, 'changes', 'place', form): return 'something moves'
    if any(prop('changes', c, 'title', form) or prop('changes', c, 'custody', form) for c in ch): return 'something changes hands'
    if any_of(a, 'changes', 'binds', form): return 'a promise'
    return 'what is known'

def reach_of(a, move, form=None):
    """who the move reaches: nobody (stays in her node), the other side, a named person, or anyone. What she does alone
    reaches the audience she chose for it."""
    if move in ('Invite', 'Pass', 'Remove'): return 'a named person'
    if alone(a, form):
        aud = P(a, 'audience', 'reach', form=form)
        return aud if aud != 'nobody' and move in ('Start', 'Change', 'Done', 'Resume') else 'nobody'
    if P(a, 'other side', 'open', form=form) and move in ('Promise', 'Start', 'Hand over', 'Change', 'Done'): return 'anyone'
    return 'the other side'

def undo_of(a, move, form=None, deal=None):
    """who holds the power to undo it: by you alone, with the other side's yes, by a new act, or no."""
    e = effect_of(a, move, form, deal)
    if e == 'nothing yet': return 'by you alone'
    if e == 'what is known': return 'no'
    if move in ('Invite', 'Pass'): return 'by you alone'             # until they accept
    if e in ('a promise', 'binds another person'): return "with the other side's yes"
    if e == 'something is made or changed': return a.get('undo', 'no')
    return 'by a new act' if alone(a, form) else "with the other side's yes"

def bet(a, deal=None, form=None):
    return bool(P(a, 'who carries the outcome', 'bet', deal, form))

def commits_to_future(a, move, deal=None, form=None):
    """a move that opens or accepts a bet she carries."""
    return move in ('Promise', 'Accept', 'Start') and bet(a, deal, form)

def needs_for(a, move, form=None, deal=None, first=False):
    """the fields a yes to this move must have filled; FoodOS tries her record, then a Find out act, and asks last. With
    first=True, an opening move asks at most two things (form.json move rules, `first move`)."""
    form = _form(form)
    g, n, sep = form['moves'][move]['group'], [], separate(a, form)
    if sep and g in ('opening', 'doing'): n.append('the other side')
    if any(prop('changes', c, 'title', form) or prop('changes', c, 'custody', form) for c in a['changes']) and move in ('Promise', 'Hand over', 'Receive'): n.append('what and how much')
    if money_leg(a, form) and move in ('Promise', 'Pay', 'Accept'): n.append('terms: how much')
    if any_of(a, 'changes', 'place', form) and move in ('Promise', 'Start', 'Hand over'): n.append('where and when')
    if recurs(a, form) and move in ('Promise', 'Start'): n.append('how often')
    if P(a, 'on a condition', 'contingent', deal, form) and move in ('Promise', 'Accept'): n.append('what must happen first')
    if credit(a, deal, form) and move in ('Promise', 'Accept'): n += ["when each side's part arrives", 'what backs it']
    if sep and (span(a, form) == 'lasts' or recurs(a, form)) and move in ('Promise', 'Accept'): n.append('what leaving costs')
    if commits_to_future(a, move, deal, form): n.append('what you expect')      # hers, private; blank is allowed
    if move == 'Accept': n.append('the proposal it answers')
    if move == 'Change': n.append('the field it changes and its new value')
    if move in ('Invite', 'Pass', 'Remove'): n.append('who')
    n = list(dict.fromkeys(n))
    if first and g == 'opening':
        order, most = form['moves']['move rules']['first move order'], form['moves']['move rules']['first move at most']
        n = sorted(n, key=lambda x: order.index(x) if x in order else 99)[:most]
    return n

WIDENS = ('Promise', 'Start', 'Accept', 'Change', 'Resume')      # on an act that gives authority, these widen it

def record_of(a, move, form=None, deal=None):
    """the signed record the move writes."""
    form = _form(form)
    g, s = form['moves'][move]['group'], shape_of(a, form, deal)
    if is_grant(a, form) and move in WIDENS: return 'a grant'
    if move == 'Answer':
        if many(a, form) and 'what\'s agreed' in a['changes'] and separate(a, form): return 'a vote'      # a vote is her signature on the circle's new version: a promise
        return 'an answer to a question'                                        # a typed field and value, so a reader checks it and her rule's scope can bound it
    if move == 'Pass': return 'a claim handed on' if 'a claim' in terms_for(a, form) else 'a part passed on'    # a claim is handed over; a part is passed by two signatures
    if move in ('Invite', 'Remove'): return 'a grant'
    if s == 'ordered' and move in ('Pay', 'Hand over'): return 'a transfer, under compulsion'
    if s == 'exchange' and move == 'Hand over' and P(a, 'which way', 'sends', form=form): return 'an exchange, signed by the seller'
    if move == 'Promise': return 'a promise, asked or offered'
    if move == 'Start':
        if s in ('deal', 'exchange', 'ordered'): return 'an observation'
        if form['verbs'].get(a['verb'], {}).get('typed by her'): return 'an observation'     # she types it herself: her reading
        if reach_of(a, move, form) != 'nobody': return 'a promise, asked or offered'          # a standing word published to an audience she chose
        return 'a plan of your own'                                                 # her own information: pencil, never a block
    if move == 'Accept': return 'an acceptance'                                     # her signature on the promise
    if move == 'Decline': return 'a decline'                                        # a reading: she signs only that she did not say yes
    if move == 'Receive': return 'a receipt'                                        # a reading: I received it; the giver's transfer is what moves title
    if move == 'Change': return 'a new promise answering the old' if s in ('deal', 'exchange') else 'an update'
    if move == 'Leave': return 'an update, stopped'
    if told(a, form) and move in ('Done', 'Hand over'): return 'a message, done when read'
    if move in ('Pay', 'Hand over'): return 'a transfer'
    if move == 'Done':
        if any_of(a, 'changes', 'makes', form): return 'a transform'
        return 'a transfer' if any_of(a, 'changes', 'hands', form) else 'an observation'
    if move == 'Resume': return 'a pause ended'
    if g == 'stopping': return 'an update, stopped'
    return 'an observation'                                          # Question, Note

def measures_of(a, move, form=None):
    """the measures a move carries, which her grant must bound before FoodOS moves alone: an amount where money moves (a Pay
    always moves money, even in an act with no money leg of its own, as a move word may add one) or a money promise is staked,
    a quantity where something changes hands."""
    m = []
    staked = (any_of(a, 'nouns', 'money', form) or any(prop('nouns', n, 'promise', form) == 'must' for n in a['nouns'])) and any_of(a, 'changes', 'binds', form)
    if move == 'Pay' or (money_leg(a, form) and move in ('Promise', 'Accept', 'Change')) or (staked and move in ('Promise', 'Start', 'Accept', 'Change')): m.append('amount')
    if any(prop('changes', c, 'title', form) or prop('changes', c, 'custody', form) for c in a['changes']) and move in ('Promise', 'Accept', 'Hand over', 'Receive', 'Change'): m.append('quantity')
    return m

def act_key(a):
    return a.get('id') or a['name']

def unruled(a, deal=None, form=None):
    """a demand with no rule behind it: forced, and by no rule (form.json properties of consent). A deal's consent moves it
    only toward force, so a deal can never talk a demand down to consent."""
    return bool(P(a, 'consent', 'forced', deal, form) and not P(a, 'consent', 'rule', deal, form))

ONLY = (None, 'you')                                                    # the words restraints_of may give `only`
WAITS = (None, 'compelled by force', 'differs from the usual case')    # ... and `waits` for a move the act has; for any other move: 'no such move'

def restraints_of(a, move, form=None, deal=None):
    """what the act library itself knows about a move, as inputs the Gate reads beside the FoodBlock SDK's reading of her
    grant; this reads no grant. `only`: 'you' when the move widens a grant (FoodOS never makes it), else None. `waits`: a
    code when the move always drafts for her tap: 'compelled by force' (a demand with no rule behind it; a deal's consent
    moves it only toward force) or 'differs from the usual case' (a deal states a fact that differs from the act's own);
    else None. An unknown move waits as 'no such move'."""
    form = _form(form)
    if move not in moves_for(a, form)[1]: return {'only': None, 'waits': 'no such move'}
    if unruled(a, deal, form): waits = 'compelled by force'
    elif deal and any(k in a and k in GRAMMAR_FACTS and v != a[k] for k, v in deal.items()): waits = 'differs from the usual case'
    else: waits = None
    return {'only': 'you' if record_of(a, move, form) == 'a grant' else None, 'waits': waits}

def terms_for(a, form=None, deal=None):
    """the term rules that hold for this act (form.json `term rules`), worked out from its facts; each is written once."""
    form = _form(form)
    sep, pr, fo = separate(a, form), priced(a, form), forced(a, deal, form)
    cr, cond = credit(a, deal, form), bool(P(a, 'on a condition', 'contingent', deal, form))
    lasts = span(a, form) == 'lasts' or recurs(a, form)
    t = []
    if fo: t.append('compelled')
    if sep and pr and not fo: t.append('a signed price')
    if cr: t += ['credit', 'what backs it']
    if sep and pr and cond and not fo: t.append('what backs it')
    if sep and lasts: t.append('what leaving costs')
    if P(a, 'may the holder use it', 'held', form=form): t.append('held, not owned')
    if (cr or any(prop('nouns', n, 'promise', form) == 'must' for n in a['nouns']) or (a['in exchange'] and prop('in exchange', a['in exchange'][0], 'claim', form))
            or P(a, 'may the holder use it', 'claim', form=form)): t.append('a claim')
    if told(a, form): t.append('done when read')
    if bet(a, deal, form): t.append('what you expect')
    if (not sep and fact(a, 'who waits', deal) == 'she waits') or (sep and bet(a, deal, form) and pr and P(a, 'which way', 'receives', form=form)
            and not P(a, 'who waits', 'ordered', deal, form)): t.append('the wait')
    if many(a, form) or P(a, 'price set by', 'signed rule', form=form): t.append('a signed rule binds only its signers')
    if many(a, form) and (money_leg(a, form) or any_of(a, 'nouns', 'money', form)): t.append('a shared pot')
    if sep and pr and not fo: t.append("the law's floor")
    if sep and pr and not fo and money_leg(a, form): t += ['tax on a price', "what's taken off"]
    if holds(a, form): t.append('the remainder')
    if any_of(a, 'changes', 'hands', form) and any_of(a, 'nouns', 'thing', form): t.append('where it came from')
    idea_only = any_of(a, 'nouns', 'idea', form) and all(prop('nouns', n, 'idea', form) or prop('nouns', n, 'carrier', form) for n in a['nouns'])
    if ((P(a, 'may the holder use it', 'claim', form=form) and a.get('back when') == 'on demand')
            or (P(a, 'consent', 'rule', deal, form) and money_leg(a, form))
            or (idea_only and any(prop('changes', c, 'title', form) or prop('changes', c, 'binds', form) for c in a['changes']))
            or (any_of(a, 'nouns', 'service', form) and sep and span(a, form) == 'lasts')): t.append('where Austrians differ')
    return list(dict.fromkeys(t))

# The everyday words on any deal (form.json moves `on any deal`) hold only where their `when` holds, read from the facts.
WHEN = {
    'priced': lambda a, f: priced(a, f), 'money': lambda a, f: money_leg(a, f), 'recurs': lambda a, f: recurs(a, f),
    'lasts': lambda a, f: span(a, f) == 'lasts', 'credit': lambda a, f: credit(a, None, f), 'compelled': lambda a, f: forced(a, None, f),
    'hands': lambda a, f: any_of(a, 'changes', 'hands', f), 'group': lambda a, f: many(a, f),
    'backed': lambda a, f: 'what backs it' in terms_for(a, f), 'claim': lambda a, f: 'a claim' in terms_for(a, f),
    'sends': lambda a, f: bool(P(a, 'which way', 'sends', form=f)), 'receives': lambda a, f: bool(P(a, 'which way', 'receives', form=f)),
    'chosen': lambda a, f: not forced(a, None, f),
    'other': lambda a, f: not alone(a, f), 'things': lambda a, f: any_of(a, 'nouns', 'thing', f),
    'service': lambda a, f: any_of(a, 'nouns', 'service', f), 'makes': lambda a, f: any_of(a, 'changes', 'makes', f),
    'perishes': lambda a, f: any_of(a, 'nouns', 'perishes', f), 'separate': lambda a, f: separate(a, f),
    'posted': lambda a, f: bool(P(a, 'price set by', 'posted', form=f)),
    'due': lambda a, f: not alone(a, f) and not told(a, f) and (any_of(a, 'changes', 'hands', f) or any_of(a, 'nouns', 'service', f) or any_of(a, 'changes', 'binds', f)),
    # a handover at a time agreed: priced, or carried
    'waits': lambda a, f: not alone(a, f) and any_of(a, 'changes', 'hands', f) and (priced(a, f) or any_of(a, 'changes', 'place', f)),
    'kept': lambda a, f: keeps_for_others(a, f),
    'holds': lambda a, f: holds(a, f),
    # something she holds can be lost: a perishable she holds, or anything she holds for someone else
    'losable': lambda a, f: span(a, f) != 'instant' and ((holds(a, f) and any_of(a, 'nouns', 'perishes', f)) or keeps_for_others(a, f)),
    # something she holds has a state worth reading: a perishable, or a thing with a meter or a clock (energy, equipment)
    'readable': lambda a, f: span(a, f) != 'instant' and any_of(a, 'nouns', 'perishes', f) and holds(a, f)
        or (any_of(a, 'nouns', 'read', f) and (holds(a, f) or priced(a, f))),
    # goods or money leave her hands, or she holds another's, between two who each keep a count: a sale, a business, a group,
    # a carrier or a keeper; never a gift between people (a meal, a recipe, a will)
    'handed': lambda a, f: keeps_for_others(a, f) or (
        (any_of(a, 'nouns', 'thing', f) or any_of(a, 'nouns', 'money', f))
        and (bool(P(a, 'which way', 'sends', form=f)) or any_of(a, 'changes', 'custody', f))
        and (priced(a, f) or a.get('other side') not in (None, 'a person or household') or any_of(a, 'changes', 'place', f))),
    # work someone else did: a priced service between separate plans, or a hand in what she makes again and again
    'countersign': lambda a, f: (any_of(a, 'nouns', 'service', f) and bool(P(a, 'which way', 'sends', form=f)) and separate(a, f) and priced(a, f))
        or (any_of(a, 'changes', 'makes', f) and recurs(a, f) and not separate(a, f)),
    'held': lambda a, f: bool(P(a, 'may the holder use it', 'held', form=f)),
}

def words_for(a, form=None):
    """the words on any deal that fit this act: their `when` holds and the act can take one of their moves."""
    form = _form(form)
    ms = set(moves_for(a, form)[1])
    return [w['words'] for w in form['moves']['on any deal'] if all(WHEN[k](a, form) for k in w.get('when', [])) and ms & set(w['moves'])]

SHARED_TERMS = ('a signed price', 'credit', 'what backs it', 'what leaving costs', 'held, not owned', 'a claim', 'done when read',
                'a signed rule binds only its signers', 'a shared pot', "the law's floor", 'tax on a price', "what's taken off", 'where it came from')

def deal_terms(a, library, form=None):
    """the terms of the deal an act is one side of: its own, plus the shared terms its other sides hold, so both sides of
    one deal always read the same terms. What she expects, the wait and force stay each side's own."""
    form = _form(form)
    t = terms_for(a, form)
    for m in other_sides(a, list(library.values()), form):
        if m in library: t += [x for x in terms_for(library[m], form) if x in SHARED_TERMS]
    order = list(form['term rules'])
    return sorted(dict.fromkeys(t), key=lambda x: order.index(x) if x in order else 99)

DEAL_FACTS = ('in exchange', 'price set by', 'on a condition', 'may the holder use it', 'back when')

def deal_mismatch(a, b, form=None):
    """the facts the two sides of one deal must agree on, where they disagree: what goes in exchange, how the price is set,
    whether a part is on a condition, and what the holder may do, plus who waits read from each side (she waits on one side
    is they wait on the other). Consent, how long it runs and who carries the outcome may differ: a recall is compelled for
    the seller and chosen by the buyer; a standing offer meets many one-off deals; each side carries its own outcome."""
    form = _form(form)
    out = [k for k in DEAL_FACTS if a.get(k) != b.get(k)]
    if form['facts']['who waits, other end'].get(a['who waits']) != b['who waits']: out.append('who waits')
    return out

def mirror_candidates(a, acts, form=None):
    """acts that can be the other side of the same deal: between separate plans alike, opposite ends, a shared change, a
    shared noun, and the deal's own facts agreeing. Every other side, written or worked out, must be among these."""
    end = _form(form)['facts']['other end'].get(a['which way'])
    return [b['name'] for b in acts if b is not a and not b.get('sides') and b['which way'] == end and side_of(b, form) == side_of(a, form)
            and set(a['changes']) & set(b['changes']) and set(a['nouns']) & set(b['nouns']) and not deal_mismatch(a, b, form)]

NEAR = ('nouns', 'changes', 'runs', 'recurs', 'consent', 'closes', 'my side', 'undoes', 'other side')

def nearness(a, b):
    """how many of the act's own facts two acts share, every fact counted the same (lists by overlap)."""
    n = 0
    for k in NEAR:
        x, y = a.get(k), b.get(k)
        n += len(set(x) & set(y or [])) / max(1, len(set(x) | set(y or []))) if isinstance(x, list) else float(x == y)
    return n

def computed_side(a, acts, form=None):
    """the other side the facts decide: the one act the deal's facts allow, or the unique nearest of those they allow;
    None when they allow none or tie."""
    if not separate(a, form) or told(a, form) or a.get('no mirror') or a.get('sides') or no_side_reason(a, form): return None      # an act that names both its sides is its own other end
    by = {b['name']: b for b in acts}
    c = sorted(((nearness(a, by[n]), n) for n in mirror_candidates(a, acts, form)), reverse=True)
    if not c or (len(c) > 1 and c[0][0] == c[1][0]): return None
    return c[0][1]

def no_side_reason(a, form=None):
    """why an act needs no other act, when its facts say so; None when only judgement can say (then it is written)."""
    if forced(a, None, form) and a.get('other side') == 'an institution or the state' and not priced(a, form): return "the state's side is a rule it published, not a plan that answers"
    if P(a, 'which way', 'sends', form=form) and P(a, 'which way', 'receives', form=form) and (P(a, 'other side', 'many', form=form) or P(a, 'my side', 'many', form=form)):
        return 'its own other side: every member does the same act toward the others'
    if told(a, form): return 'whoever reads it answers with Receive, the reading itself'
    return None

def other_sides(a, acts, form=None):
    """the acts on the other side of this act's deal: written in `mirror` where the facts tie or are overruled by
    judgement (or there are several), otherwise worked out by computed_side."""
    if 'mirror' in a: return list(a['mirror'])
    c = computed_side(a, acts, form)
    return [c] if c else []

GRAMMAR_FACTS = ('verb', 'nouns', 'changes', 'who is in it', 'my side', 'which way', 'undoes', 'in exchange', 'runs', 'recurs', 'consent', 'who waits',
                 'on a condition', 'who carries the outcome', 'other side', 'price set by', 'closes', 'may the holder use it', 'back when',
                 'audience', 'undo')

def fact_tags(a, form=None, library=None):
    """the act's facts in words, for the pages (LIBRARY.md, view/index.html)."""
    t = [', '.join(a['nouns']), 'changes ' + ' + '.join(a['changes']), a['who is in it'] + ', ' + a['which way'], a['consent'],
         'who waits: ' + a['who waits'] + (', on a condition' if a.get('on a condition') == 'yes' else ''), 'outcome: ' + a['who carries the outcome']]
    if a.get('my side'): t.append('with ' + a['my side'])
    if a.get('other side'): t.append('other side: ' + a['other side'])
    if a.get('price set by'): t.append('price: ' + a['price set by'])
    if a.get('closes'): t.append('closes ' + a['closes'])
    if a.get('may the holder use it'): t.append(f"holder may use it: {a['may the holder use it']}, back {a['back when']}")
    if a.get('audience'): t.append('seen by ' + a['audience'])
    if a['in exchange']: t.append('in exchange: ' + a['in exchange'][0])
    t.append('runs ' + a['runs'][0] + (', recurs' if a.get('recurs') == 'yes' else ''))
    terms = deal_terms(a, library, form) if library else terms_for(a, form)
    if terms: t.append('terms: ' + ', '.join(terms))
    return t

def shape_hash(a):
    """a hash of everything that decides an act's behaviour: the library's own change-detector (no grant names an act)."""
    return hashlib.sha256(json.dumps({k: a.get(k) for k in GRAMMAR_FACTS}, sort_keys=True).encode()).hexdigest()[:16]
