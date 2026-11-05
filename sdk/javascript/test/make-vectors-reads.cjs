// Adds to spec/vectors.json the cases of three reads a product must ask this SDK and never keep a copy of (CHANGELOG.md, "New door ops"):
// `is_stranger` (consent.md), `speaks_for` (authority.md, Who a block speaks for) and `scope_reading` (authority.md, `state.scope`).
// `node test/make-vectors-reads.cjs`, after `node scripts/build-wasm.cjs`. Idempotent: a case it made is replaced by name, never repeated.
// Every expectation is written here by hand, from the spec text, and checked against the Rust core before the file is written; the
// oracle (spec/oracle) then checks the file against an implementation written from the spec text alone.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, call, story, door, M, DAY, LATER, BEFORE, AFTER, answer, keyOf, at } = kit

const has = (list, code) => list.some((r) => r.code === code)

// ---- 1. is_stranger: only her accept, her counter-offer, a deal she opened or her own live yes makes a sender no stranger ----
const stranger = (name, receiver, sender, held, expect, block) =>
  door(name, 'is_stranger', block === undefined ? [receiver.id, sender.id, held] : [receiver.id, sender.id, held, block], { expect, exact: true })
{
  const s = story(), pia = s.person('rdpia')
  const eggs = s.say(pia, 'thing', { kind: 'eggs' })
  const sender = (name) => s.person(name)
  const offer = (who) => s.say(who, 'promise', { terms: { price: M(300), expires: DAY } }, { from: who.id, to: pia.id, what: eggs.hash })

  const sam = sender('rdsam'); offer(sam)
  stranger('reads: is_stranger: a sender who has only written to her is a stranger (his offer is not dealing with her)', pia, sam, s.held, true)
  stranger('reads: is_stranger: and a sender she has never heard of is a stranger too', pia, sender('rdnobody'), s.held, true)

  const bea = sender('rdbea'); const offerB = offer(bea)
  answer(s, pia, offerB, { status: 'accepted' })
  stranger('reads: is_stranger: her accepted answer to his offer makes him no stranger', pia, bea, s.held, false)

  const cal = sender('rdcal'); const offerC = offer(cal)
  answer(s, pia, offerC, { terms: { price: M(250), expires: DAY } })
  stranger('reads: is_stranger: her counter-offer (a promise with no status answering his) makes him no stranger', pia, cal, s.held, false)

  const dan = sender('rddan')
  s.say(pia, 'promise', { terms: { price: M(300), expires: DAY } }, { from: dan.id, to: pia.id, what: eggs.hash })
  stranger('reads: is_stranger: a deal she opened that names him as a side makes him no stranger', pia, dan, s.held, false)

  const eve = sender('rdeve'); const offerE = offer(eve)
  answer(s, pia, offerE, { status: 'declined' })
  stranger('reads: is_stranger: her declined answer keeps him a stranger', pia, eve, s.held, true)

  const fay = sender('rdfay'); const offerF = offer(fay)
  answer(s, pia, offerF, { status: 'stopped', stop: 'before' })
  stranger('reads: is_stranger: her stopped answer keeps him a stranger too', pia, fay, s.held, true)

  const gus = sender('rdgus'); const hello = s.say(gus, 'observe', { kind: 'note', text: 'hello' }, { to: pia.id })
  s.say(pia, 'observe', { kind: 'note', text: 'who is this?' }, { answers: hello.hash })
  stranger('reads: is_stranger: any other reply of hers (asking who he is) is not dealing with him: he stays a stranger', pia, gus, s.held, true)

  const hal = sender('rdhal'), ivy = sender('rdivy')
  s.say(pia, 'observe', { kind: 'consent', word: 'yes' }, { subject: hal.id })
  stranger('reads: is_stranger: her own live yes about him makes him no stranger', pia, hal, s.held, false)
  stranger('reads: is_stranger: and her yes about hal is no word about ivy', pia, ivy, s.held, true)

  // a yes that someone else recorded is never her consent (consent.md): a recorder's yes only lifts a stop that same recorder recorded
  const jon = sender('rdjon')
  s.say(jon, 'observe', { kind: 'consent', word: 'yes' }, { from: pia.id, subject: jon.id })
  stranger('reads: is_stranger: a yes recorded by the sender himself, from her, counts for nothing: he stays a stranger', pia, jon, s.held, true)
}
{
  // a yes the sender's own operator recorded (after a stop it recorded) is the live word of the fold, and still not her consent
  const s = story(), pia = s.person('rdpia2'), op = s.person('rdop'), bot = s.person('rdbot', { kind: 'agent' })
  const og = s.say(op, 'grant', { kind: 'operator' }, { to: bot.id })
  s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash })
  const stop = s.say(op, 'observe', { kind: 'consent', word: 'stop' }, { from: pia.id, subject: bot.id })
  const yes = s.say(op, 'observe', { kind: 'consent', word: 'yes' }, { from: pia.id, subject: bot.id, after: [stop.hash] })
  assert.deepEqual(call('consent', pia.id, bot.id, s.held, null), { word: 'yes', block: yes.hash })
  stranger('reads: is_stranger: a yes recorded by the sender\'s own operator is the fold\'s live word, and still not her consent: he stays a stranger', pia, bot, s.held, true)
  s.say(pia, 'observe', { kind: 'consent', word: 'yes' }, { subject: bot.id, after: [stop.hash, yes.hash] })
  stranger('reads: is_stranger: her own yes, written after the stop, makes him no stranger', pia, bot, s.held, false)
}
{
  // consent follows the principal: an agent acting under a grant is named by whom its block speaks for
  const s = story(), pat = s.person('rdpat'), ag = s.person('rdag', { kind: 'agent' }), rex = s.person('rdrex'), mia = s.person('rdmia')
  const eggs = s.say(pat, 'thing', { kind: 'eggs' })
  const grant = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['promise'], parties: [rex.id], each: M(5000), until: LATER } }, { to: ag.id })
  const post = s.say(ag, 'promise', { terms: { price: M(300), expires: DAY } }, { from: pat.id, to: rex.id, what: eggs.hash, under: grant.hash })
  const note = s.say(ag, 'observe', { kind: 'note', text: 'hello' }, { to: rex.id, under: grant.hash })
  const mia2 = s.say(ag, 'promise', { terms: { price: M(300), expires: DAY } }, { from: pat.id, to: mia.id, what: eggs.hash, under: grant.hash })
  stranger('reads: is_stranger: with nothing between them, her principal\'s agent is a stranger to her (consent follows the principal: given the agent\'s block)', rex, ag, s.held, true, post)
  const offerP = s.say(pat, 'promise', { terms: { price: M(300), expires: DAY } }, { from: pat.id, to: rex.id, what: eggs.hash })
  answer(s, rex, offerP, { status: 'accepted' })
  stranger('reads: is_stranger: one who accepted the principal\'s offer is no stranger to the agent whose block acts under the principal\'s live grant (consent follows the principal)', rex, ag, s.held, false, post)
  stranger('reads: is_stranger: without the agent\'s block only the agent and its operators are named: the principal\'s deal does not reach it', rex, ag, s.held, true)
  stranger('reads: is_stranger: with the block given as an explicit null, the same', rex, ag, s.held, true, null)
  stranger('reads: is_stranger: an agent\'s block outside the grant\'s scope speaks for the agent alone: the principal\'s deal does not reach it', rex, ag, s.held, true, note)
  stranger('reads: is_stranger: and a person who dealt with no one of that principal stays a stranger to the agent, block or not', mia, ag, s.held, true, mia2)
}
{
  // is_stranger agrees with admission_refusals' not_human: a first block of an autonomous system to a stranger is refused outside the order channel
  const s = story(), zed = s.person('rdzed'), bot = s.person('rdbot2', { kind: 'agent' })
  const first = s.say(bot, 'observe', { kind: 'note', text: 'a dozen more?' }, { to: zed.id })
  const refusals = (held) => call('admission_refusals', first, zed.id, held, { order_channel: [] }, 0)
  const was = refusals(s.held)
  assert.equal(has(was, 'not_human'), true)
  assert.equal(call('is_stranger', zed.id, bot.id, s.held, first), true)
  stranger('reads: is_stranger: the agent\'s first block to a stranger is refused not_human: he is a stranger (admission_refusals and is_stranger agree)', zed, bot, s.held, true, first)
  door('reads: admission_refusals: the same story, under a rule with an empty order channel: not_human', 'admission_refusals', [first, zed.id, s.held, { order_channel: [] }, 0], { expect: [{ code: 'not_human' }] })
  const eggs = s.say(zed, 'thing', { kind: 'eggs' })
  s.say(zed, 'promise', { terms: { price: M(300), expires: DAY } }, { from: bot.id, to: zed.id, what: eggs.hash })
  const now = refusals(s.held)
  assert.equal(has(now, 'not_human'), false)
  assert.equal(call('is_stranger', zed.id, bot.id, s.held, first), false)
  stranger('reads: is_stranger: once she opened a deal naming him he is no stranger, and the same block is no longer refused (admission_refusals and is_stranger agree)', zed, bot, s.held, false, first)
  door('reads: admission_refusals: the same story after her deal: nothing refused', 'admission_refusals', [first, zed.id, s.held, { order_channel: [] }, 0], { expect: [], exact: true })
}

// ---- 2. speaks_for: the one party a fold counts a block for ----
const speaks = (name, block, held, expect) => door(name, 'speaks_for', [block, held], { expect, exact: true })
{
  const s = story(), ann = s.person('rdann')
  const plain = s.say(ann, 'observe', { kind: 'note', text: 'plain' })
  speaks('reads: speaks_for: a plain block speaks for its author', plain, s.held, ann.id)
}
{
  // signed as a circle: by a holder of sign it speaks for the circle; by a member without sign, or an outsider, for no one
  const s = story(), fay = s.person('rdfay'), mo = s.person('rdmo'), nell = s.person('rdnell'), ola = s.person('rdola')
  const circle = s.say(fay, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Bakery', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }, { name: 'orders', powers: ['sign'] }, { name: 'speak', powers: [] }] })
  const invite = (who, roles) => s.say(fay, 'grant', { kind: 'member', roles }, { subject: circle.hash, as: circle.hash, to: who.id })
  const join = (who, inv) => s.say(who, 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: circle.hash, after: [inv.hash] })
  join(mo, invite(mo, ['orders']))
  join(nell, invite(nell, ['speak']))
  const note = (who, text, extra = {}) => s.say(who, 'observe', { kind: 'note', text }, { as: circle.hash, ...extra })
  speaks('reads: speaks_for: signed as a circle by its founder, who holds sign: it speaks for the circle', note(fay, 'by the founder'), s.held, circle.hash)
  speaks('reads: speaks_for: signed as a circle by a member who holds sign: it speaks for the circle', note(mo, 'by an orderer'), s.held, circle.hash)
  speaks('reads: speaks_for: signed as a circle by a member without sign: it speaks for no one (no_role)', note(nell, 'by a member who may only speak'), s.held, null)
  speaks('reads: speaks_for: signed as a circle by an outsider: it speaks for no one', note(ola, 'by an outsider'), s.held, null)
  speaks('reads: speaks_for: a holder of sign who does not sign as the circle speaks for herself', s.say(fay, 'observe', { kind: 'note', text: 'for myself' }), s.held, fay.id)
  // a first message being checked: not held yet, read with the blocks as if it were
  const draft = fb.write('observe', { kind: 'note', text: 'not yet held' }, { as: circle.hash }, { author: mo.id, key: keyOf('rdmo'), held: s.held, at: at(), audience: 'public' })
  assert.ok(!s.held.some((b) => b.hash === draft.hash))
  speaks('reads: speaks_for: a first message not among the blocks yet is read as if it were: signed as the circle by a holder of sign', draft, s.held, circle.hash)
  speaks('reads: speaks_for: a block that rests on a block not held (its author\'s genesis) is no word: it speaks for no one', note(mo, 'ahead of its genesis'), s.held.filter((b) => b.hash !== mo.id && b.refs.author !== mo.id), null)
  // the cut: a member removed after signing still speaks for the circle for what she signed before the cut, and for nothing after it
  const before = note(mo, 'signed before the cut')
  const late = note(mo, 'signed after the cut, unseen by the stop')
  const joinMo = s.held.find((b) => b.type === 'grant' && b.state.status === 'accepted' && b.refs.author === mo.id)
  s.say(fay, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: joinMo.refs.answers, subject: circle.hash, as: circle.hash, after: [joinMo.refs.answers, joinMo.hash, before.hash] })
  speaks('reads: speaks_for: a member removed after signing still speaks for the circle for a block the removal saw (the cut)', before, s.held, circle.hash)
  speaks('reads: speaks_for: and a block of hers the removal did not see carries no authority for the circle: it speaks for no one', late, s.held, null)
}
{
  // many hands: a circle that states needed.sign 2 is spoken for once two different holders of sign have signed
  const s = story(), ann = s.person('rdann2'), bea = s.person('rdbea2'), dan = s.person('rddan2'), sam = s.person('rdsam2')
  const solo = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Pot', roles: [{ name: 'treasurer', powers: ['sign', 'admit', 'remove'] }, { name: 'member', powers: [] }], needed: { sign: 2 } })
  const into = (who, role) => { const g = s.say(ann, 'grant', { kind: 'member', roles: [role] }, { subject: solo.hash, to: who.id, as: solo.hash }); return s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: solo.hash }) }
  into(bea, 'treasurer'); into(dan, 'member')
  const seed = s.say(sam, 'thing', { kind: 'seed' })
  const offer = s.say(sam, 'promise', { terms: { price: M(2000), expires: DAY } }, { from: sam.id, to: solo.hash, what: seed.hash })
  const yes = answer(s, ann, offer, { status: 'accepted' }, { as: solo.hash })
  speaks('reads: speaks_for: signed as a circle that needs two hands, by one holder of sign: it speaks for no one yet', yes, s.held, null)
  s.say(dan, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  speaks('reads: speaks_for: a confirm by a member without sign adds no hand: still no one', yes, s.held, null)
  s.say(ann, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  speaks('reads: speaks_for: the author\'s own confirm adds no hand: still no one', yes, s.held, null)
  s.say(bea, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  speaks('reads: speaks_for: a second holder of sign confirms: two hands, it speaks for the circle', yes, s.held, solo.hash)
}
{
  // under a grant: the grantor if the grant is live, made for the author and covers the act; else the author
  const s = story(), pat = s.person('rdpat2'), ag = s.person('rdag2', { kind: 'agent' }), vic = s.person('rdvic')
  const grant = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe.note'], until: BEFORE } }, { to: ag.id })
  const note = (text, extra = {}, opts) => s.say(ag, 'observe', { kind: 'note', text, ...extra }, { under: grant.hash }, opts)
  speaks('reads: speaks_for: a block under a live grant made for its author, the act named in the scope: it speaks for the grantor', note('covered'), s.held, pat.id)
  speaks('reads: speaks_for: a block under the grant whose act the scope does not name speaks for its author alone', s.say(ag, 'observe', { kind: 'sighting', text: 'not named' }, { under: grant.hash }), s.held, ag.id)
  speaks('reads: speaks_for: a block dated at or after the grant\'s until acts under no grant: it speaks for its author (the act\'s own date tests until)', note('too late', {}, { time: AFTER }), s.held, ag.id)
  const open = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } })
  speaks('reads: speaks_for: under an open grant (no refs.to) any author\'s block speaks for the grantor', s.say(vic, 'observe', { kind: 'note', text: 'for the open grant' }, { under: open.hash }), s.held, pat.id)
  const wrong = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } }, { to: vic.id })
  speaks('reads: speaks_for: a grant made for someone else is not one this author acts under: it speaks for its author', s.say(ag, 'observe', { kind: 'note', text: 'not mine' }, { under: wrong.hash }), s.held, ag.id)
  // a stop ends the grant for the blocks that see it, and no other
  const pre = note('before the stop')
  const stop = s.say(pat, 'grant', { status: 'stopped', stop: 'onward' }, { updates: grant.hash, after: [grant.hash] })
  speaks('reads: speaks_for: a block the grantor\'s stop has not seen still speaks for the grantor', pre, s.held, pat.id)
  const post = s.say(ag, 'observe', { kind: 'note', text: 'after the stop' }, { under: grant.hash, after: [stop.hash] })
  speaks('reads: speaks_for: a block that has the stop in its causal past speaks for its author alone', post, s.held, ag.id)
  speaks('reads: speaks_for: and the earlier block, read again with the stop held, still speaks for the grantor', pre, s.held, pat.id)

  // the quote-request exception: a promise with no status under a live grant made for its author speaks for its principal, though the act is not covered
  const quotes = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } }, { to: ag.id })
  const eggs = s.say(vic, 'thing', { kind: 'eggs' })
  const ask = s.say(ag, 'promise', { terms: { expires: DAY } }, { from: vic.id, to: pat.id, what: eggs.hash, under: quotes.hash })
  speaks('reads: speaks_for: a promise with no status under a live grant made for its author, act not covered, speaks for its principal (a quote request: it binds no one)', ask, s.held, pat.id)
  const offer = s.say(vic, 'promise', { terms: { price: M(300), expires: DAY } }, { from: vic.id, to: pat.id, what: eggs.hash })
  const accept = answer(s, ag, offer, { status: 'accepted' }, { under: quotes.hash })
  speaks('reads: speaks_for: an accepted answer under the same grant is no quote request: act not covered, it speaks for its author alone', accept, s.held, ag.id)
}
{
  // a grant signed as a circle gives the circle's authority only where its signer may sign for the circle
  const s = story(), fay = s.person('rdfay3'), nell = s.person('rdnell3'), ag = s.person('rdag3', { kind: 'agent' })
  const circle = s.say(fay, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Shop', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }, { name: 'speak', powers: [] }] })
  const inv = s.say(fay, 'grant', { kind: 'member', roles: ['speak'] }, { subject: circle.hash, as: circle.hash, to: nell.id })
  s.say(nell, 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: circle.hash, after: [inv.hash] })
  const byFay = s.say(fay, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } }, { to: ag.id, as: circle.hash })
  const byNell = s.say(nell, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } }, { to: ag.id, as: circle.hash })
  speaks('reads: speaks_for: under a grant the circle gave by a holder of sign, it speaks for the circle', s.say(ag, 'observe', { kind: 'note', text: 'for the shop' }, { under: byFay.hash }), s.held, circle.hash)
  speaks('reads: speaks_for: under a grant signed as the circle by a member without sign (no_role: not live), it speaks for its author', s.say(ag, 'observe', { kind: 'note', text: 'not for the shop' }, { under: byNell.hash }), s.held, ag.id)
}
{
  const name = 'reads: speaks_for: a block that is no object is an argument error'
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op: 'speaks_for', args: ['oops', []], error: { kind: 'argument' } })
  assert.throws(() => call('speaks_for', 'oops', []), (e) => e.kind === 'argument')
}

// ---- 3. scope_reading: every default of authority.md, and what cannot be read ----
const read = (over = {}) => ({ acts: [], parties: [], limit: null, each: null, every: null, until: null, notice: null, sealed: false, condition: null, junk: [], ...over })
const scoped = (name, scope, expect) => door(name, 'scope_reading', [scope], { expect, exact: true })
{
  const id1 = 'a1'.repeat(32), id2 = 'b2'.repeat(32), commitment = 'c3'.repeat(32), issuer = 'd4'.repeat(32)
  scoped('reads: scope_reading: no scope reads as an empty scope: no act, no one, no money, no end, no notice, no condition', null, read())
  door('reads: scope_reading: called with no argument at all, the same', 'scope_reading', [], { expect: read(), exact: true })
  scoped('reads: scope_reading: a scope that states nothing fills nothing in', {}, read())
  scoped('reads: scope_reading: acts and parties are the lists as signed, in their order', { acts: ['promise', 'transfer.gift', 'observe.note'], parties: [id2, id1] }, read({ acts: ['promise', 'transfer.gift', 'observe.note'], parties: [id2, id1] }))
  scoped('reads: scope_reading: a name that is no act is kept as signed (it covers nothing, and is never checked)', { acts: ['promise.purchase', 'dance'] }, read({ acts: ['promise.purchase', 'dance'] }))
  scoped('reads: scope_reading: a limit with every P1M is the visible fence and its period', { acts: ['promise'], limit: M(5000), every: 'P1M' }, read({ acts: ['promise'], limit: M(5000), every: 'P1M' }))
  scoped('reads: scope_reading: a cap on each act alone (an amount) reads as each, with no limit', { each: fb.amount('5', 'kg') }, read({ each: fb.amount('5', 'kg') }))
  scoped('reads: scope_reading: a limit and a cap on each act together', { limit: M(5000), each: M(900), every: 'P7D' }, read({ limit: M(5000), each: M(900), every: 'P7D' }))
  scoped('reads: scope_reading: a limit in an issuer\'s own unit is money too', { limit: { minor: 10, currency: { issuer, unit: 'LETS', decimals: 2 } } }, read({ limit: { minor: 10, currency: { issuer, unit: 'LETS', decimals: 2 } } }))
  scoped('reads: scope_reading: a limit of zero is a limit (nothing moves), not a missing one', { limit: M(0) }, read({ limit: M(0) }))
  scoped('reads: scope_reading: a sealed limit shows no amount: sealed, and limit and each stay null', { acts: ['promise'], limit_commitment: commitment, every: 'P1M' }, read({ acts: ['promise'], sealed: true, every: 'P1M' }))
  scoped('reads: scope_reading: until and notice are read when they are a time and a duration; every alone is read too', { until: LATER, notice: 'PT48H' }, read({ until: LATER, notice: 'PT48H' }))
  scoped('reads: scope_reading: every with no limit is read as signed', { every: 'P1W' }, read({ every: 'P1W' }))
  const condition = { settled: id1, nested: [1, { b: 'x' }], none: null }
  scoped('reads: scope_reading: a condition is passed through as signed', { condition }, read({ condition }))
  scoped('reads: scope_reading: a condition that is a list or a text is passed through too', { condition: ['a', 'b'] }, read({ condition: ['a', 'b'] }))
  scoped('reads: scope_reading: a condition that is null is null, and no junk', { condition: null }, read())

  // junk: present and not readable. The field reads as null or [] beside it, and the name is listed
  scoped('reads: scope_reading: an until that is no time ("tomorrow") is junk, and reads as no end only beside the junk that says so', { acts: ['promise'], until: 'tomorrow' }, read({ acts: ['promise'], junk: ['until'] }))
  scoped('reads: scope_reading: an until in the right shape that is no real instant (30 February) is junk', { until: '2027-02-30T00:00:00.000Z' }, read({ junk: ['until'] }))
  scoped('reads: scope_reading: an until that is null is junk, not a missing one', { until: null }, read({ junk: ['until'] }))
  scoped('reads: scope_reading: a negative limit is junk', { limit: { minor: -5, currency: 'GBP' } }, read({ junk: ['limit'] }))
  scoped('reads: scope_reading: a negative amount is junk', { each: { value: '-0.5', unit: 'kg' } }, read({ junk: ['each'] }))
  scoped('reads: scope_reading: a limit that is a bare number is junk', { limit: 5 }, read({ junk: ['limit'] }))
  scoped('reads: scope_reading: an amount whose value is no decimal is junk', { limit: { value: '1,5', unit: 'kg' } }, read({ junk: ['limit'] }))
  scoped('reads: scope_reading: an every that is no duration ("monthly") is junk', { limit: M(5000), every: 'monthly' }, read({ limit: M(5000), junk: ['every'] }))
  scoped('reads: scope_reading: a notice that is no duration (PT has no unit) is junk', { notice: 'PT' }, read({ junk: ['notice'] }))
  scoped('reads: scope_reading: acts that is not a list is junk', { acts: 'promise' }, read({ junk: ['acts'] }))
  scoped('reads: scope_reading: acts that holds anything but text is junk, whole', { acts: ['promise', 7] }, read({ junk: ['acts'] }))
  scoped('reads: scope_reading: parties that names something that is no id is junk, whole', { acts: ['promise'], parties: [id1, 'the bakery'] }, read({ acts: ['promise'], junk: ['parties'] }))
  scoped('reads: scope_reading: a party in a hash this reader does not know is junk', { parties: ['zz9:' + id1] }, read({ junk: ['parties'] }))
  scoped('reads: scope_reading: a visible limit beside a commitment is junk (a scope says it has a limit one way, never both)', { limit: M(5000), limit_commitment: commitment }, read({ sealed: true, junk: ['limit'] }))
  scoped('reads: scope_reading: a cap on each act beside a commitment is junk (a sealed scope keeps each inside it)', { each: M(900), limit_commitment: commitment }, read({ sealed: true, junk: ['each'] }))
  scoped('reads: scope_reading: a commitment that is no hash is junk, and the scope is still sealed', { limit_commitment: 'not a hash' }, read({ sealed: true, junk: ['limit_commitment'] }))
  scoped('reads: scope_reading: a name that is no scope field is junk', { acts: ['promise'], colour: 'red' }, read({ acts: ['promise'], junk: ['colour'] }))
  scoped('reads: scope_reading: several junk fields are listed sorted, and what reads well beside them is kept', { until: 'soon', limit: -1, parties: [id1], acts: ['promise'], zebra: 1 }, read({ acts: ['promise'], parties: [id1], junk: ['limit', 'until', 'zebra'] }))
  scoped('reads: scope_reading: a scope that is a text is no scope', 'oops', read({ junk: ['scope'] }))
  scoped('reads: scope_reading: a scope that is a list is no scope', ['promise'], read({ junk: ['scope'] }))
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
