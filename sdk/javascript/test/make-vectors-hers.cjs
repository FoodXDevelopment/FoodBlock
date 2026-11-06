// Adds to spec/vectors.json the cases of "hers" as one reading (authority.md, Backed by a person; promises.md, What becomes whose; things.md, Transfers):
// `gives` asks `backed`, down a chain of three grants; `speaks_for` walks to the same top grant; a thing is hers as of the block's own place in time, and a thing
// the record does not hold is not hers; a chain of three honest conditional transfers is read to its end; `check_reads` and `not_free_shown` ask `backed`;
// `ruling_releases` needs a stake that binds. `node test/make-vectors-hers.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written by hand.
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, view, LATER, M } = kit

const accept = (s, who, deal) => s.say(who, 'promise', { status: 'accepted' }, { answers: deal.hash, for: deal.hash, after: [deal.hash] })
const agentGrant = (s, who, to, scope, refs = {}, depth) => s.say(who, 'grant', { kind: 'agent', scope, ...(depth ? { depth } : {}) }, { to: to.id, ...refs })

{
  // three links: her, her AI, a helper, a helper's helper. The reader of "hers" is one: gives, backed and speaks_for agree down the whole chain.
  const s = story(), her = s.person('hr-her'), ai = s.person('hr-ai', { kind: 'agent' }), h1 = s.person('hr-h1', { kind: 'agent' }), h2 = s.person('hr-h2', { kind: 'agent' }), shop = s.person('hr-shop')
  const scope = { acts: ['transfer', 'observe.note'], parties: [shop.id], limit: M(1000), until: LATER }
  const g = agentGrant(s, her, ai, scope, {}, 2), h = agentGrant(s, ai, h1, scope, { parent: g.hash }, 1), k = agentGrant(s, h1, h2, scope, { parent: h.hash })
  const t = s.say(h2, 'transfer', { money: M(300) }, { under: k.hash, to_owner: shop.id })
  const line = { of: 'money', minor: 300, currency: 'GBP', to: shop.id, back: null }
  door('gives: a transfer signed under the third link of a chain of grants is her money, as backed says', 'gives', [t, her.id, s.held], { expect: { gives: [line] }, exact: true, invariants: [9, 10] })
  door('gives: and none of her AI\'s, though its grant is in the chain', 'gives', [t, ai.id, s.held], { expect: { gives: [] }, exact: true })
  door('gives: nor of the helper that signed it', 'gives', [t, h2.id, s.held], { expect: { gives: [] }, exact: true })
  door('speaks_for: a block under the third link speaks for the top of the chain, the same one backed names', 'speaks_for', [t, s.held], { expect: her.id, exact: true, invariants: [9, 10] })
  const note = s.say(h2, 'observe', { kind: 'note', text: 'x' }, { under: k.hash })
  door('speaks_for: and so does a note, not only a transfer', 'speaks_for', [note, s.held], { expect: her.id, exact: true })
  // the read-back is of a block not yet signed: gives reads it exactly as its signed form
  const unsigned = { type: 'transfer', state: { money: M(300) }, refs: { to_owner: shop.id, author: her.id } }
  door('gives: an unsigned money transfer (the read-back before she signs) gives what its signed form gives', 'gives', [unsigned, her.id, s.held], { expect: { gives: [line] }, exact: true })
  door('gives: and still none of anyone else\'s', 'gives', [unsigned, shop.id, s.held], { expect: { gives: [] }, exact: true })
  // her stop reaches the chain: a transfer that has seen it is not backed, so it gives nothing
  const stop = s.say(her, 'grant', { kind: 'agent', status: 'stopped', stop: 'onward' }, { updates: g.hash })
  const late = s.say(h2, 'transfer', { money: M(200) }, { under: k.hash, to_owner: shop.id }, { after: [stop.hash] })
  door('gives: under a chain her stop has reached, nothing is hers: gives agrees with backed', 'gives', [late, her.id, s.held], { expect: { gives: [] }, exact: true, invariants: [9] })
  door('backed: the same block is not backed', 'backed', [late, her.id, s.held], { expect: { backed: false }, invariants: [9] })
  // a grant passed on by one who never received the parent: gives refuses what backed refuses
  const mal = s.person('hr-mal')
  const s2 = story(), her2 = s2.person('hr2-her'), bot2 = s2.person('hr2-bot', { kind: 'agent' }), mal2 = s2.person('hr2-mal'), shop2 = s2.person('hr2-shop')
  const scope2 = { acts: ['transfer'], parties: [shop2.id], limit: M(1000), until: LATER }
  const top = agentGrant(s2, her2, bot2, scope2, {}, 1)
  const fake = s2.raw(mal2, 'grant', { kind: 'agent', scope: scope2 }, { to: bot2.id, parent: top.hash })
  const forged = s2.raw(bot2, 'transfer', { money: M(500) }, { under: fake.hash, to_owner: shop2.id })
  door('gives: a transfer under a grant passed on by one who never received the parent is not her money', 'gives', [forged, her2.id, s2.held], { expect: { gives: [] }, exact: true })
  void mal
}
{
  // a thing is hers as of the block's own place in time, and a thing the record does not hold is not hers
  const s = story(), her = s.person('ht-her'), joe = s.person('ht-joe'), shop = s.person('ht-shop')
  const kind = s.say(her, 'thing', { kind: 'mixer' }), mixer = s.say(her, 'thing', { kind: 'my mixer' }, { of: kind.hash })
  const promise = (what, after) => s.say(her, 'promise', { what: 'a mixer', terms: { price: M(100) } }, { from: her.id, to: shop.id, what }, after ? { after } : {})
  const goods = (what) => ({ gives: [{ of: 'goods', what, to: shop.id, back: null }] })
  const before = promise(mixer.hash)
  door('gives: a promise of a mixer she owns gives it', 'gives', [before, her.id, s.held], { expect: goods(mixer.hash), exact: true })
  const sale = s.say(her, 'transfer', {}, { what: mixer.hash, to_owner: joe.id })
  const took = s.say(joe, 'transfer', { status: 'accepted' }, { answers: sale.hash })
  door('ownership: the mixer is Joe\'s now', 'ownership', [mixer, s.held, null], { expect: { owner: joe.id }, invariants: [] })
  door('gives: the promise she signed before the sale still gives it: it is read at its own place in time, not by today\'s owner', 'gives', [before, her.id, s.held], { expect: goods(mixer.hash), exact: true })
  const after = promise(mixer.hash, [took.hash])
  door('gives: a promise of the mixer signed after she saw the sale accepted gives nothing of hers', 'gives', [after, her.id, s.held], { expect: { gives: [] }, exact: true })
  const ghost = 'ab'.repeat(32)
  const unheld = s.raw(her, 'promise', { what: 'a mixer', terms: { price: M(100) } }, { from: her.id, to: shop.id, what: ghost })
  door('gives: a thing the record does not hold is not hers: a missing record is never filled in as ownership', 'gives', [unheld, her.id, s.held], { expect: { gives: [], unplaced: [ghost] }, exact: true })
  door('gives: and it is listed as unplaced, never as nothing: a reader may only raise its bar for it', 'gives', [unheld, shop.id, s.held], { expect: { gives: [{ of: 'money', minor: 100, currency: 'GBP', to: her.id, back: null }] }, exact: true })
}
{
  // three honest conditional transfers in a row: the mixer is sold on, each title waiting for its price. A micro reads it to its end as a node does.
  const s = story(), a = s.person('hc-a'), b = s.person('hc-b'), c = s.person('hc-c'), d = s.person('hc-d')
  const kind = s.say(a, 'thing', { kind: 'mixer' }), mixer = s.say(a, 'thing', { kind: 'the mixer' }, { of: kind.hash })
  const sell = (from, to, minor) => {
    const deal = s.say(from, 'promise', { what: 'the mixer', terms: { price: M(minor) } }, { from: from.id, to: to.id, what: mixer.hash })
    accept(s, to, deal)
    const title = s.say(from, 'transfer', { condition: { paid: deal.hash } }, { what: mixer.hash, to_owner: to.id, for: deal.hash })
    s.say(to, 'transfer', { status: 'accepted' }, { answers: title.hash, for: deal.hash })
    const pay = s.say(to, 'transfer', { money: M(minor) }, { to_owner: from.id, for: deal.hash })
    s.say(from, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: deal.hash })
    return title
  }
  const t1 = sell(a, b, 1000), t2 = sell(b, c, 1100), t3 = sell(c, d, 1200)
  door('ownership: a chain of three conditional transfers is read to its end: the last buyer owns the mixer', 'ownership', [mixer, s.held, null], { expect: { owner: d.id, transfers: [t1.hash, t2.hash, t3.hash], conflict: null }, exact: true })
}
{
  // check_reads and not_free_shown ask `backed`, not a comparison of authors
  const s = story(), her = s.person('hk-her'), bot = s.person('hk-bot', { kind: 'agent' })
  const g = agentGrant(s, her, bot, { acts: ['observe.note', 'observe.not_free', 'observe.check'], parties: [], until: LATER })
  const mine = s.say(her, 'observe', { kind: 'note', text: 'hers' })
  const throughBot = s.say(bot, 'observe', { kind: 'note', text: 'hers, through her agent' }, { under: g.hash })
  const check = s.say(her, 'observe', { kind: 'check', of: 'observe' }, { subject: her.id, derives_from: [mine.hash, throughBot.hash] })
  door('check_reads: a block her agent signed under her grant concerns her, as one she signed does', 'check_reads', [check, s.held], { expect: { ok: true, read: [{ hash: mine.hash, concerns: true }, { hash: throughBot.hash, concerns: true }].sort((x, y) => (x.hash < y.hash ? -1 : 1)) }, exact: false })
  const claim = s.say(her, 'promise', { what: 'a thing', terms: { price: M(100) } }, { from: her.id, to: her.id })
  const word = s.say(bot, 'observe', { kind: 'not_free', reason: 'threatened' }, { subject: claim.hash, under: g.hash })
  door('not_free_shown: her word, said through her agent under her grant, is shown as hers', 'not_free_shown', [claim, s.held], { expect: { shown: [{ block: word.hash, by: bot.id }], nothing: [] }, exact: false })
}
{
  // ruling_releases: a stake no one accepted releases nothing
  const s = story(), dep = s.person('hu-dep'), bene = s.person('hu-bene'), judge = s.person('hu-judge', { kind: 'agent' })
  const trade = s.say(dep, 'promise', { what: 'the order', terms: { price: M(5000) } }, { from: bene.id, to: dep.id }); accept(s, bene, trade)
  const stake = s.say(dep, 'promise', { what: 'deposit', terms: { price: M(5000), condition: { ruled: trade.hash, by: judge.id, awards: bene.id } } }, { from: dep.id, to: bene.id })
  s.say(judge, 'observe', { kind: 'ruling', text: 'she is owed', awards: [{ to: bene.id, money: M(3000) }] }, { subject: trade.hash })
  door('ruling: a stake the other side has not accepted releases nothing, whatever the judge ruled', 'ruling_releases', [stake, s.held, null], { expect: { releases: false, to: bene.id, money: null, ruling: s.held.find((b) => b.state.kind === 'ruling').hash }, invariants: [36] })
  accept(s, bene, stake)
  door('ruling: once both sides have signed the stake, the same ruling releases', 'ruling_releases', [stake, s.held, null], { expect: { releases: true, to: bene.id, money: { minor: 3000 } }, invariants: [36] })
  const deal2 = s.say(dep, 'promise', { what: 'another order', terms: { price: M(800) } }, { from: bene.id, to: dep.id })
  const esc = s.say(dep, 'transfer', { money: M(800), condition: { ruled: trade.hash, by: judge.id, awards: bene.id } }, { what: deal2.hash, to_owner: bene.id, for: deal2.hash })
  door('ruling: an escrow transfer for a deal that was only offered releases nothing', 'ruling_releases', [esc, s.held, null], { expect: { releases: false }, invariants: [36] })
}
{
  // a circle's offer is judged at its own place: signed while the member held the role, it stands after the role is stopped; one signed after the stop does not
  const s = story(), ann = s.person('hm-ann'), sam = s.person('hm-sam'), shop = s.person('hm-shop')
  const cafe = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'orders', powers: ['sign'] }] })
  const invite = s.say(ann, 'grant', { kind: 'member', roles: ['orders'] }, { subject: cafe.hash, to: sam.id, as: cafe.hash })
  const yes = s.say(sam, 'grant', { status: 'accepted', kind: 'member' }, { answers: invite.hash, subject: cafe.hash })
  const early = s.say(sam, 'promise', { what: 'bread' }, { from: cafe.hash, to: shop.id, as: cafe.hash }, { after: [yes.hash] })
  const stop = s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: invite.hash, as: cafe.hash }, { after: [early.hash] })
  const late = s.say(sam, 'promise', { what: 'cake' }, { from: cafe.hash, to: shop.id, as: cafe.hash }, { after: [stop.hash] })
  door('backed: a circle offer signed while the member held the role is the circle\'s still, after the role is stopped', 'backed', [early, cafe.hash, s.held], { expect: { backed: true }, invariants: [9] })
  door('backed: one signed after the stop is not', 'backed', [late, cafe.hash, s.held], { expect: { backed: false }, invariants: [9] })
  view('promise_view: the earlier circle offer still stands (offered) when the role is stopped later', early, s.held, null, { stage: 'offered' })
  door('speaks_for: the later one speaks for no one', 'speaks_for', [late, s.held], { expect: null, exact: true })
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
