// Adds to spec/vectors.json the cases of a judge's offer to settle first with a fee back, and of a deal that says which sides may show it
// (promises.md, Terms: conciliation, fee_back, show; Rulings, A fee back when the sides settle; privacy.md, Showing a deal): the checks of the three
// terms, the door op `fee_back`, and the promise fold's `show`. `node test/make-vectors-judges.cjs`, after `node scripts/build-wasm.cjs`. Idempotent.
// Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const fs = require('fs')
const path = require('path')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, stage, M } = kit

const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../spec/schemas/published.json'), 'utf8')), J = P.schemas.judging
const base = [P.genesis, ...P.order.map((n) => P.schemas[n])]
const accept = (s, who, deal) => s.say(who, 'promise', { status: 'accepted' }, { answers: deal.hash, for: deal.hash, after: [deal.hash] })

// the first draft of the stage cases gave every deal a `show`; a deal that says nothing has none, so those cases are retired
kit.retire(['both sides may show', 'only the to side may show', 'a deal that says nothing shows none'].flatMap((n) => [`show: ${n}: before it binds the stage shows none`, `show: ${n}: once both signed, the stage shows []`, `show: ${n}: once both signed, the stage shows ["from","to"]`, `show: ${n}: once both signed, the stage shows ["to"]`]).filter((n) => /shows none|shows \[\]/.test(n)))

// ---- the checks: conciliation is true; fee_back a decimal 0 to 1 and only beside a conciliation; show lists from and/or to ----
{
  const au = 'a'.repeat(64)
  const state = (terms) => ({ seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'disputes over a delivery of food', terms: { price: M(5000), rules_within: 'P14D', ...terms } })
  const refs = { author: au, prev: au, from: au, schema: J.hash }
  const closed = (name, terms, codes) => door(name, 'refusals', ['promise', state(terms), refs, [J], [J]], { expect: codes.map((code) => ({ code })), exact: false })
  closed('judges: an offer that tries to settle first and gives back half the fee has nothing to refuse', { conciliation: true, fee_back: '0.5' }, [])
  closed('judges: a conciliation with no fee back has nothing to refuse', { conciliation: true }, [])
  closed('judges: a fee back of 0 and of 1 are both stated parts', { conciliation: true, fee_back: '1' }, [])
  closed('judges: a conciliation that is not true is refused', { conciliation: false }, ['shape'])
  closed('judges: a fee back above 1 is refused', { conciliation: true, fee_back: '1.5' }, ['shape'])
  closed('judges: a fee back written as a float is refused as every float is', { conciliation: true, fee_back: 0.5 }, ['float'])
  closed('judges: a negative fee back is refused', { conciliation: true, fee_back: '-0.1' }, ['shape'])
  closed('judges: a fee back with no conciliation is refused: nothing fills the conciliation in', { fee_back: '0.5' }, ['shape'])
  closed('show: both sides may show the deal: nothing to refuse', { show: ['from', 'to'] }, [])
  closed('show: one side may show the deal: nothing to refuse', { show: ['to'] }, [])
  closed('show: the sides out of order are refused (one list, one spelling)', { show: ['to', 'from'] }, ['shape'])
  closed('show: an empty list is refused: leave the term out to say nothing', { show: [] }, ['shape'])
  closed('show: a side listed twice is refused', { show: ['from', 'from'] }, ['shape'])
  closed('show: a word that is no side is refused', { show: ['either'] }, ['shape'])
  closed('show: a bare word, not a list, is refused', { show: 'from' }, ['shape'])
}

// ---- the stage reports who may show the deal: what the binding terms list, and nothing else ----
{
  const cases = [['both sides may show', ['from', 'to'], ['from', 'to']], ['only the to side may show', ['to'], ['to']], ['a deal that says nothing has no show', undefined, null]]
  for (const [name, show, expect] of cases) {
    const s = story(), ann = s.person('shAnn'), bob = s.person('shBob'), eggs = s.say(ann, 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'promise', { terms: { price: M(450), ...(show ? { show } : {}) } }, { from: ann.id, to: bob.id, what: eggs.hash })
    stage(`show: ${name}: before it binds the stage has no show`, offer, s.held, { stage: 'offered' })
    accept(s, bob, offer)
    if (expect) stage(`show: ${name}: once both signed, the stage shows ${JSON.stringify(expect)}`, offer, s.held, { stage: 'accepted', show: expect })
    else stage(`show: ${name}`, offer, s.held, { stage: 'accepted' })
  }
}

// ---- the fee back ----
// one dispute: the buyer b and the seller d, a judge j who tries to settle first and gives back `back` of her fee; each side paid half of £50
const dispute = (tag, terms, { pays = [['b', 2500], ['d', 2500]], extraOffer = {} } = {}) => {
  const s = story(), d = s.person(`${tag}-d`), b = s.person(`${tag}-b`), j = s.person(`${tag}-j`), other = s.person(`${tag}-o`)
  const deal = s.say(d, 'promise', { what: 'the order', terms: { price: M(5000) } }, { from: b.id, to: d.id }); accept(s, b, deal)
  const offer = s.say(j, 'promise', { what: 'disputes over a delivery of food', terms: { price: M(5000), rules_within: 'P14D', ...terms }, ...extraOffer }, { from: j.id, schema: J.hash })
  const who = { b, d }
  const pay = (key, minor, extra = {}) => s.say(who[key], 'transfer', { money: M(minor) }, { for: offer.hash, subject: deal.hash, to: j.id, to_owner: j.id, ...extra })
  for (const [key, minor] of pays) pay(key, minor)
  const release = (key, extra = {}) => s.say(who[key], 'observe', { kind: 'release', text: 'we are settled' }, { subject: deal.hash, ...extra })
  const ask = (name, expect) => door(`fee_back: ${name}`, 'fee_back', [offer, deal, [...base, ...s.held]], { expect, exact: false })
  return { s, d, b, j, other, deal, offer, pay, release, ask }
}
const line = (to, money, returned, left) => ({ to, money: M(money), returned: M(returned), left: M(left) })
const byId = (lines) => [...lines].sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0))
const T = { conciliation: true, fee_back: '0.5' }

{
  const w = dispute('fb1', T)
  w.ask('no release: nothing settled, nothing owed', { settled: false, owed: [] })
  w.release('b')
  w.ask('one side alone released: not settled, nothing owed', { settled: false, owed: [] })
  const rd = w.release('d')
  const rb = w.s.held.find((x) => x.type === 'observe' && x.state.kind === 'release' && x.refs.author === w.b.id)
  w.ask('both sides released the deal: settled, half of each side\'s £25 is owed back', {
    settled: true, releases: [rb.hash, rd.hash].sort(), owed: byId([line(w.b.id, 1250, 0, 1250), line(w.d.id, 1250, 0, 1250)])
  })
  // she sends the buyer his part back: his line is returned, hers to the seller still stands
  w.s.say(w.j, 'transfer', { money: M(1250) }, { for: w.offer.hash, subject: w.deal.hash, to: w.b.id, to_owner: w.b.id })
  w.ask('she sent the buyer his £12.50: his line is returned and nothing is left, the seller\'s is still left', {
    settled: true, owed: byId([line(w.b.id, 1250, 1250, 0), line(w.d.id, 1250, 0, 1250)])
  })
  w.s.say(w.j, 'transfer', { money: M(5000) }, { for: w.offer.hash, subject: w.deal.hash, to: w.d.id, to_owner: w.d.id })
  w.ask('she sent the seller more than she owed: left is never below zero', { settled: true, owed: byId([line(w.b.id, 1250, 1250, 0), line(w.d.id, 1250, 5000, 0)]) })
}
{
  const w = dispute('fb2', T, { pays: [['b', 333], ['d', 1]] })
  w.release('b'); w.release('d')
  w.ask('333 and 1 paid at half: 166.5 rounds up to 167 and 0.5 rounds up to 1 (halves up, as a per-unit price)', { settled: true, owed: byId([line(w.b.id, 167, 0, 167), line(w.d.id, 1, 0, 1)]) })
}
{
  const w = dispute('fb3', T)
  w.release('b')
  const ruling = w.s.say(w.j, 'observe', { kind: 'ruling', text: 'the goods were late', awards: [{ to: w.b.id, money: M(300) }] }, { subject: w.deal.hash })
  w.s.say(w.d, 'observe', { kind: 'release', text: 'we are settled' }, { subject: w.deal.hash, after: [ruling.hash] })
  w.ask('the seller released after she ruled: not a settling through her, nothing owed', { settled: false, owed: [] })
}
{
  const w = dispute('fb4', T)
  w.release('b'); w.release('d')
  // a ruling that the releases did not see (written after them, by her) blocks nothing: they settled before she ruled
  w.s.say(w.j, 'observe', { kind: 'ruling', text: 'late word', awards: [{ to: w.b.id, money: M(300) }] }, { subject: w.deal.hash })
  w.ask('a ruling of hers that came after both releases changes nothing: they settled first', { settled: true })
}
{
  const w = dispute('fb5', T)
  w.release('b')
  // a ruling of someone else's, in the past of the seller's release, does not count: only hers
  const fake = w.s.say(w.other, 'observe', { kind: 'ruling', text: 'not the judge', awards: [{ to: w.b.id, money: M(300) }] }, { subject: w.deal.hash })
  w.s.say(w.d, 'observe', { kind: 'release', text: 'we are settled' }, { subject: w.deal.hash, after: [fake.hash] })
  w.ask('a ruling by someone who is not the judge does not stop the settling', { settled: true })
}
{
  const w = dispute('fb6', T)
  w.release('b')
  w.s.say(w.other, 'observe', { kind: 'release', text: 'we are settled' }, { subject: w.deal.hash })
  w.ask('a release signed by a stranger is no side\'s release', { settled: false, owed: [] })
}
{
  const w = dispute('fb7', { conciliation: true })
  w.release('b'); w.release('d')
  w.ask('an offer with a conciliation and no fee back: settled is not asked, nothing is owed', { settled: false, owed: [] })
}
{
  const w = dispute('fb8', {})
  w.release('b'); w.release('d')
  w.ask('an offer with neither term: nothing owed', { settled: false, owed: [] })
}
{
  const w = dispute('fb9', T, { pays: [['b', 2500]] })
  w.s.say(w.b, 'transfer', { money: M(900) }, { for: w.offer.hash, to: w.j.id, to_owner: w.j.id })
  w.s.say(w.d, 'transfer', { money: M(700) }, { for: w.deal.hash, subject: w.deal.hash, to: w.j.id, to_owner: w.j.id })
  w.release('b'); w.release('d')
  w.ask('only money for her offer and about this deal counts as her fee: a payment naming no deal, or the deal and not the offer, does not', { settled: true, owed: [line(w.b.id, 1250, 0, 1250)] })
}
{
  const w = dispute('fb10', { conciliation: true, fee_back: '1' }, { pays: [['b', 2500]] })
  w.release('b'); w.release('d')
  w.ask('a fee back of 1 gives the whole fee back', { settled: true, owed: [line(w.b.id, 2500, 0, 2500)] })
}
{
  const w = dispute('fb11', { conciliation: true, fee_back: '0' }, { pays: [['b', 2500]] })
  w.release('b'); w.release('d')
  w.ask('a fee back of 0 gives nothing back', { settled: true, owed: [line(w.b.id, 0, 0, 0)] })
}
{
  const w = dispute('fb12', T, { pays: [] })
  w.release('b'); w.release('d')
  w.ask('the sides settled and nobody paid her: settled, nothing owed', { settled: true, owed: [] })
}
{
  // an offer that is not hers (someone else's block signed as a judge's) or not under judging owes nothing
  const w = dispute('fb13', T)
  w.release('b'); w.release('d')
  door('fee_back: a block that is no judge\'s offer owes nothing', 'fee_back', [w.deal, w.deal, [...base, ...w.s.held]], { expect: { settled: false, owed: [] }, exact: false })
  const plain = w.s.say(w.j, 'promise', { what: 'disputes', terms: { price: M(5000), ...T } }, { from: w.j.id })
  door('fee_back: an offer under no judging schema owes nothing', 'fee_back', [plain, w.deal, [...base, ...w.s.held]], { expect: { settled: false, owed: [] }, exact: false })
}

vectorsFile.save(V, tags)
console.log('ok')
