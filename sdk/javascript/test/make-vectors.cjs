// Makes spec/vectors.json: `node test/make-vectors.cjs`. Every earlier section is kept byte for byte (its hashes never
// change); the sections below are built from fixed seeds and fixed times, so a run gives the same file. Each fold
// expectation is written here by hand and checked against the SDK before the file is written: if the SDK and the
// expectation disagree, nothing is written.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { recoveryKeyHash, genesis, keyGrant, signedByAuthor, identityOf } = fb.identity

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const old = JSON.parse(fs.readFileSync(FILE, 'utf8'))
// The sections written before this generator, as they were: on a second run they come back from where it put them.
const EARLIER = old.reads ? {
  identities: old.identities.slice(0, 2),
  deals: [old.reads.groups[0]].map((g) => ({ name: g.name.replace(/^draft words: /, ''), blocks: g.blocks.map(({ reads_as: _r, ...b }) => b) })),
  circles: [old.reads.groups[1]].map((g) => ({ name: g.name.replace(/^draft words: /, ''), blocks: g.blocks.map(({ reads_as: _r, ...b }) => b), older_end: g.older_end }))
} : { identities: old.identities, deals: old.deals, circles: old.circles }
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = { ...old.keys }
const keyOf = (name) => {
  if (keys[name]) return keys[name]
  const seed = sha(`foodblock 1.6 vectors: ${name}`), x = sha(`foodblock 1.6 vectors x25519: ${name}`)
  const kp = fb.keypairFromSeed(seed)
  keys[name] = { ed25519_seed: seed, private_key: kp.private_key, public_key_sign: kp.public_key_sign, x25519_private: x, public_key_encrypt: fb.encryptionKeyOf(x) }
  if (name.endsWith('_recovery')) keys[name].hash = recoveryKeyHash(kp.public_key_sign)
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 15, 12, 0, 0) + 1000 * tick++).toISOString()
const later = (time, ms) => new Date(Date.parse(time) + ms).toISOString()

// A group of people writing one story: every block signed, kept with its signer's name.
function story() {
  const held = [], out = []
  const keep = (name, block, signer) => { held.push(block); out.push({ name, hash: block.hash, signer, block: { type: block.type, state: block.state, refs: block.refs }, signature: block.signature }); return block }
  const person = (name, { kind = 'person', reach = 'P30D' } = {}) => {
    const key = keyOf(name), recovery = keyOf(`${name}_recovery`)
    const g = genesis(key, { kind, at: at(), encryptionKey: key.public_key_encrypt, recoveryKey: recovery.public_key_sign, reach })
    keep(`${name}: genesis`, g, name)
    return { name, id: g.hash, key, recovery, g }
  }
  const say = (who, label, type, state, refs = {}, { key = who.name, audience = 'public', after, salts, link } = {}) => {
    const block = fb.write(type, state, refs, { author: who.id, key: keyOf(key), held, at: at(), audience, after, salts, link })
    const { salts: _salts, ...signed } = block
    return keep(label, signed, key)
  }
  return { held, out, keep, person, say, byName: (name) => out.find((block) => block.name === name) }
}
const blocksOf = (s) => s.out
// The codes a refusal list carries, once each, in the order given (protocol.json's).
const codesOf = (list) => [...new Set(list.map((one) => one.code))]

// ---- Deal: the platonic replacement of the earlier deals vector ----
function dealVector() {
  const s = story()
  const pia = s.person('pia'), quin = s.person('quin')
  const eggs = s.say(pia, 'the kind', 'thing', { kind: 'eggs', name: 'Eggs' })
  const offer = s.say(pia, 'the offer: 3 GBP a dozen, 12 to 120, open to anyone', 'promise', { terms: { price: { money: fb.money(300, 'GBP'), per: fb.amount('12', '{egg}') }, quantity: { min: fb.amount('12', '{egg}'), max: fb.amount('120', '{egg}') }, expires: '2026-10-16T12:00:00.000Z' } }, { from: pia.id, what: eggs.hash })
  const request = s.say(quin, 'the accept: 36 (a request, as the offer is open)', 'promise', { status: 'accepted', terms: { quantity: fb.amount('36', '{egg}') } }, { answers: offer.hash, for: offer.hash, to: quin.id }, { after: [offer.hash] })
  s.say(pia, "the offerer's allocation: it binds", 'promise', { status: 'accepted' }, { answers: request.hash, for: offer.hash }, { after: [request.hash] })
  return { name: 'a per-unit price with a quantity range; an accept to an open offer is a request; the allocation binds', blocks: blocksOf(s), first: offer.hash, expected: { stage: 'accepted', quantity: fb.amount('36', '{egg}'), total: fb.money(900, 'GBP') } }
}

// ---- Circle: the platonic replacement of the earlier circles vector ----
function circleVector() {
  const s = story()
  const rae = s.person('rae'), sol = s.person('sol')
  const circle = s.say(rae, 'the circle', 'actor', { kind: 'circle', name: 'Elm St co-op', public_key_encrypt: keyOf('circle').public_key_encrypt })
  const invitation = s.say(rae, 'the invitation', 'grant', { kind: 'member', roles: ['orders'] }, { subject: circle.hash, as: circle.hash, to: sol.id })
  const answer = s.say(sol, 'the answer', 'grant', { kind: 'member', status: 'accepted' }, { answers: invitation.hash, subject: circle.hash }, { after: [invitation.hash] })
  s.say(rae, 'the end: an updates with status stopped', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: answer.hash }, { updates: invitation.hash, subject: circle.hash, as: circle.hash }, { after: [answer.hash] })
  return { name: 'a membership: invitation, answer, and its end by an updates with status stopped', blocks: blocksOf(s), circle: circle.hash, expected: { members: [rae.id], removed: [sol.id] } }
}

// ---- Folds: promises ----
function promiseFolds() {
  const vectors = []
  const add = (name, s, first, expected, options = {}) => {
    const got = fb.promiseStage(s.held.find((block) => block.hash === first), s.held, options)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, `${name}: ${key}`)
    vectors.push({ name, blocks: blocksOf(s), first, ...(options.now ? { now: options.now } : {}), expected })
  }
  const deal = (setup) => {
    const s = story(), ann = s.person('tia'), bob = s.person('uma')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs', name: 'Eggs' })
    const tray = s.say(ann, 'an instance: a tray', 'thing', { lot: 'L1', pack: fb.amount('1', '{tray}') }, { kind: eggs.hash })
    const offer = s.say(ann, 'the offer: two trays for 4.50', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    return { s, ann, bob, eggs, tray, offer, ...(setup || {}) }
  }
  const accept = (d, label = 'the accept') => d.s.say(d.bob, label, 'promise', { status: 'accepted' }, { answers: d.offer.hash, for: d.offer.hash }, { after: [d.offer.hash] })
  const goods = (d, label, value, line) => {
    const t = d.s.say(d.ann, label, 'transfer', { amount: fb.amount(value, '{tray}'), ...(line ? { line } : {}) }, { to_owner: d.bob.id, what: d.tray.hash, for: d.offer.hash })
    return t
  }
  const receive = (d, t, who = d.bob, label = 'received') => d.s.say(who, label, 'transfer', { status: 'accepted' }, { answers: t.hash, for: d.offer.hash }, { after: [t.hash] })
  const pay = (d, minor, label = 'the payment') => {
    const t = d.s.say(d.bob, label, 'transfer', { money: fb.money(minor, 'GBP'), marks: [{ scheme: 'card', value: 'ch_1' }] }, { to_owner: d.ann.id, for: d.offer.hash })
    receive(d, t, d.ann, 'payment received')
    return t
  }

  let d = deal(); add('a one-to-one offer, unanswered: offered', d.s, d.offer.hash, { stage: 'offered' })
  d = deal(); add('expired once the reader\'s clock passes expires (a view)', d.s, d.offer.hash, { stage: 'expired' }, { now: '2026-10-21T00:00:00.000Z' })
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma')
    const ask = s.say(bob, 'a want: an ask with from open', 'promise', { what: 'a dozen eggs', terms: { expires: '2026-10-20T00:00:00.000Z' } }, { to: bob.id })
    add('an ask, signed by its to side: asked', s, ask.hash, { stage: 'asked' })
    void ann
  }
  d = deal(); accept(d); add('accepted by the other side', d.s, d.offer.hash, { stage: 'accepted' })
  d = deal(); d.s.say(d.bob, 'declined', 'promise', { status: 'declined' }, { answers: d.offer.hash, for: d.offer.hash }); add('declined by the other side', d.s, d.offer.hash, { stage: 'declined' })
  d = deal(); d.s.say(d.ann, 'withdrawn by its author: stopped before', 'promise', { status: 'stopped', stop: 'before' }, { updates: d.offer.hash, for: d.offer.hash }); add('stopped before acceptance (a withdrawal)', d.s, d.offer.hash, { stage: 'stopped', stop: 'before' })
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'the offer', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    // Bob accepts on his own chain, never having seen the withdrawal.
    s.say(bob, 'the accept, not seeing the withdrawal', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    s.say(ann, 'the withdrawal', 'promise', { status: 'stopped', stop: 'before' }, { updates: offer.hash, for: offer.hash })
    add('an accept beats a withdrawal it has not seen', s, offer.hash, { stage: 'accepted' })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'the offer', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const stop = s.say(ann, 'the withdrawal', 'promise', { status: 'stopped', stop: 'before' }, { updates: offer.hash, for: offer.hash })
    s.say(bob, 'the accept, after seeing the withdrawal', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [stop.hash] })
    add('a withdrawal in the accept\'s causal past beats it', s, offer.hash, { stage: 'stopped', stop: 'before' })
  }
  d = deal(); accept(d); { const t = goods(d, 'one tray sent', '1'); receive(d, t) } add('partial delivery: one of two trays received: underway', d.s, d.offer.hash, { stage: 'underway', lines: [{ id: null, needed: 2, moved: 1 }] })
  d = deal(); accept(d); goods(d, 'a tray sent, never answered by the receiver', '2'); add('a giver\'s own transfer, unanswered, settles nothing', d.s, d.offer.hash, { stage: 'accepted' })
  d = deal(); accept(d); { const a = goods(d, 'first tray', '1'); receive(d, a, d.bob, 'first received'); const b = goods(d, 'second tray', '1'); receive(d, b, d.bob, 'second received') } pay(d, 450)
  add('done: both trays received and 4.50 paid', d.s, d.offer.hash, { stage: 'done', paid: fb.money(450, 'GBP'), total: fb.money(450, 'GBP') })
  d = deal(); accept(d); { const a = goods(d, 'both trays', '2'); receive(d, a) } pay(d, 450)
  { const back = d.s.say(d.ann, 'the refund', 'transfer', { money: fb.money(450, 'GBP') }, { to_owner: d.bob.id, for: d.offer.hash }); receive(d, back, d.bob, 'refund received') }
  add('reversed: a done promise with a counted refund for it', d.s, d.offer.hash, { stage: 'reversed' })
  d = deal(); accept(d); d.s.say(d.bob, 'stopped onward', 'promise', { status: 'stopped', stop: 'onward' }, { answers: d.offer.hash, for: d.offer.hash }); add('stopped onward, after acceptance', d.s, d.offer.hash, { stage: 'stopped', stop: 'onward' })
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), box = s.say(ann, 'the kind: a veg box', 'thing', { kind: 'veg box' })
    const offer = s.say(ann, 'a weekly veg box, Fridays', 'promise', { when: { from: '2026-10-16T09:00:00.000Z', to: '2026-10-16T10:00:00.000Z' }, terms: { price: fb.money(1500, 'GBP'), quantity: fb.amount('1', '{box}'), repeat: 'FREQ=WEEKLY;BYDAY=FR', expires: '2026-10-16T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: box.hash })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    s.say(bob, 'paused for one Friday', 'promise', { status: 'stopped', stop: { occurrences: ['2026-10-23T09:00:00.000Z'] } }, { answers: offer.hash, for: offer.hash })
    add('a standing promise: a named occurrence stopped, the rest stands', s, offer.hash, { stage: 'accepted', stopped: ['2026-10-23T09:00:00.000Z'] })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'the offer: 4.50', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const counter = s.say(bob, 'a counter: 4.00', 'promise', { terms: { price: fb.money(400, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash, answers: offer.hash, for: offer.hash })
    s.say(ann, 'the counter accepted', 'promise', { status: 'accepted' }, { answers: counter.hash, for: offer.hash })
    add('a counter between the two sides is the live offer; its accept binds', s, offer.hash, { stage: 'accepted', offer: counter.hash })
  }
  {
    const s = story(), ann = s.person('tia'), cat = s.person('vic'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'an open offer: ten trays to anyone', 'promise', { terms: { price: { money: fb.money(225, 'GBP'), per: fb.amount('1', '{tray}') }, quantity: fb.amount('10', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, what: eggs.hash })
    s.say(cat, 'a request for four', 'promise', { status: 'accepted', terms: { quantity: fb.amount('4', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: cat.id })
    add('an accept to an open offer is only a request: still offered', s, offer.hash, { stage: 'offered' })
  }
  {
    const s = story(), ann = s.person('tia'), cat = s.person('vic'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'an open offer: ten trays to anyone', 'promise', { terms: { price: { money: fb.money(225, 'GBP'), per: fb.amount('1', '{tray}') }, quantity: fb.amount('10', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, what: eggs.hash })
    const request = s.say(cat, 'a request for four', 'promise', { status: 'accepted', terms: { quantity: fb.amount('4', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: cat.id })
    const allocation = s.say(ann, 'the allocation', 'promise', { status: 'accepted' }, { answers: request.hash, for: offer.hash }, { after: [request.hash] })
    add('the offerer\'s allocation binds an open offer', s, offer.hash, { stage: 'accepted', takers: [{ who: cat.id, request: request.hash, allocation: allocation.hash, quantity: fb.amount('4', '{tray}') }], total: fb.money(900, 'GBP') })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' }), milk = s.say(ann, 'the kind: milk', 'thing', { kind: 'milk' })
    const offer = s.say(ann, 'one order, two lines', 'promise', { terms: { lines: [{ id: 'eggs', what: eggs.hash, quantity: fb.amount('2', '{tray}'), price: fb.money(900, 'GBP') }, { id: 'milk', what: milk.hash, quantity: fb.amount('1', 'L'), price: fb.money(120, 'GBP') }], expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: [eggs.hash, milk.hash] })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    const t = s.say(ann, 'the eggs line delivered', 'transfer', { amount: fb.amount('2', '{tray}'), line: 'eggs' }, { to_owner: bob.id, what: eggs.hash, for: offer.hash })
    s.say(bob, 'eggs received', 'transfer', { status: 'accepted' }, { answers: t.hash, for: offer.hash })
    add('lines: one line delivered, the other not yet', s, offer.hash, { stage: 'underway', total: fb.money(1020, 'GBP'), lines: [{ id: 'eggs', needed: 2, moved: 2 }, { id: 'milk', needed: 1, moved: 0 }] })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const one = s.say(ann, 'promise one: 4.50', 'promise', { terms: { price: fb.money(450, 'GBP'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const two = s.say(ann, 'promise two: 3.00', 'promise', { terms: { price: fb.money(300, 'GBP'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    s.say(bob, 'yes to one', 'promise', { status: 'accepted' }, { answers: one.hash, for: one.hash })
    const payment = s.say(bob, 'one payment for both, split', 'transfer', { money: fb.money(750, 'GBP'), split: [{ for: one.hash, money: fb.money(450, 'GBP') }, { for: two.hash, money: fb.money(300, 'GBP') }] }, { to_owner: ann.id, for: [one.hash, two.hash] })
    s.say(ann, 'payment received', 'transfer', { status: 'accepted' }, { answers: payment.hash, for: [one.hash, two.hash] })
    add('a payment for several promises: each counts its own split', s, one.hash, { stage: 'underway', paid: fb.money(450, 'GBP') })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma'), bank = s.person('wil'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const schema = s.say(ann, 'a schema whose grounds name the bank as a confirmer', 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'money moved', confirms: ['observe'], confirmers: [bank.id] } })
    const offer = s.say(ann, 'the offer, under that schema', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash, schema: schema.hash })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    const payment = s.say(bob, 'the payment, never answered by ann', 'transfer', { money: fb.money(450, 'GBP') }, { to_owner: ann.id, for: offer.hash })
    s.say(bank, 'the bank confirms it', 'observe', { kind: 'confirm', confidence: '1' }, { confirms: payment.hash })
    add('a confirmer the schema\'s grounds name counts a transfer', s, offer.hash, { stage: 'underway', paid: fb.money(450, 'GBP') })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma')
    const job = s.say(ann, 'a job: paint the shopfront', 'promise', { what: 'paint the shopfront', terms: { price: fb.money(5000, 'GBP'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: job.hash, for: job.hash })
    const work = s.say(ann, 'the work, by the worker', 'observe', { kind: 'work', text: 'painted' }, { for: job.hash })
    s.say(bob, 'the receiving side accepts the work', 'observe', { status: 'accepted' }, { answers: work.hash, for: job.hash })
    const pay = s.say(bob, 'paid', 'transfer', { money: fb.money(5000, 'GBP') }, { to_owner: ann.id, for: job.hash })
    s.say(ann, 'payment received', 'transfer', { status: 'accepted' }, { answers: pay.hash, for: job.hash })
    add('a job is done when the receiver accepts the work and the price is paid', s, job.hash, { stage: 'done' })
  }
  {
    const s = story(), ann = s.person('tia'), bob = s.person('uma')
    const time = s.say(ann, 'time: three hours of help', 'promise', { what: 'help in the kitchen', terms: { quantity: fb.amount('3', 'h'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: time.hash, for: time.hash })
    for (const [hours, n] of [['2', 'first'], ['1', 'second']]) {
      const w = s.say(ann, `${n} work block: ${hours} h`, 'observe', { kind: 'work', amount: fb.amount(hours, 'h') }, { for: time.hash })
      s.say(bob, `${n} accepted`, 'observe', { status: 'accepted' }, { answers: w.hash, for: time.hash })
    }
    add('time is done when accepted work covers terms.quantity', s, time.hash, { stage: 'done' })
  }
  return vectors
}

// ---- Folds: circles and audiences ----
function circleFolds() {
  const s = story()
  const gus = s.person('wes'), hal = s.person('xia'), jon = s.person('yan'), kim = s.person('zed'), lee = s.person('abe'), mia = s.person('bea'), ivy = s.person('cal')
  const C = s.say(gus, 'the circle', 'actor', { kind: 'circle', name: 'The bakery' })
  const invite = (by, who, roles, label, after = []) => s.say(by, label, 'grant', { kind: 'member', roles }, { subject: C.hash, as: C.hash, to: who.id }, { after })
  const yes = (who, grant, label) => s.say(who, label, 'grant', { kind: 'member', status: 'accepted' }, { answers: grant.hash, subject: C.hash }, { after: [grant.hash] })
  const halInvite = invite(gus, hal, ['orders'], 'hal invited, orders'); const halYes = yes(hal, halInvite, 'hal says yes')
  invite(gus, ivy, ['orders'], 'ivy invited, never answers')
  const jonInvite = invite(gus, jon, ['admin'], 'jon invited as admin'); const jonYes = yes(jon, jonInvite, 'jon says yes')
  const kimInvite = invite(jon, kim, ['orders'], 'kim invited by jon, an admin then', [jonYes.hash]); const kimYes = yes(kim, kimInvite, 'kim says yes')
  const audienceBefore = s.say(gus, 'a note to the circle, before kim joined', 'observe', { kind: 'note', text: 'oven at 6', nonce: '00000000000000000000000000000001' }, {}, { audience: [C.hash], salts: { [C.hash]: '00000000000000000000000000000002' }, after: [halYes.hash, jonYes.hash] })
  const audienceAfter = s.say(gus, 'a note naming kim\'s yes in after', 'observe', { kind: 'note', text: 'oven at 7', nonce: '00000000000000000000000000000003' }, {}, { audience: [`${C.hash}#admin`, C.hash], salts: { [C.hash]: '00000000000000000000000000000004', [`${C.hash}#admin`]: '00000000000000000000000000000005' }, after: [kimYes.hash] })
  const halMore = s.say(gus, 'hal is offered speak as well', 'grant', { kind: 'member', roles: ['orders', 'speak'] }, { updates: halInvite.hash, subject: C.hash, as: C.hash }, { after: [halYes.hash] })
  const snapshot1 = fb.circleState(C, s.held)
  assert.deepEqual(snapshot1.members[hal.id].roles, ['orders'], 'a role added counts once answered')
  s.say(hal, 'hal says yes to speak', 'grant', { kind: 'member', status: 'accepted' }, { answers: halMore.hash, subject: C.hash }, { after: [halMore.hash] })
  s.say(gus, 'kim loses orders at once', 'grant', { kind: 'member', roles: [] }, { updates: kimInvite.hash, subject: C.hash, as: C.hash }, { after: [kimYes.hash] })
  const leeInvite = invite(gus, lee, ['admin'], 'lee invited as admin by the founder'); const leeYes = yes(lee, leeInvite, 'lee says yes')
  const miaInvite = invite(jon, mia, ['admin'], 'mia invited as admin by jon', [jonYes.hash]); const miaYes = yes(mia, miaInvite, 'mia says yes')
  // lee and mia remove each other; neither's admin grant is earlier in causal order, so both removals stand.
  s.say(lee, 'lee removes mia', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: miaYes.hash }, { updates: miaInvite.hash, subject: C.hash, as: C.hash }, { after: [leeYes.hash, miaYes.hash] })
  s.say(mia, 'mia removes lee', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: leeYes.hash }, { updates: leeInvite.hash, subject: C.hash, as: C.hash }, { after: [leeYes.hash, miaYes.hash] })
  s.say(kim, 'kim leaves', 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { answers: kimInvite.hash, subject: C.hash })
  s.say(gus, 'hal is removed, his last counted block named', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: halYes.hash }, { updates: halInvite.hash, subject: C.hash, as: C.hash })
  const state = fb.circleState(C, s.held)
  const members = Object.fromEntries(Object.entries(state.members).map(([who, member]) => [who, [...member.roles].sort()]))
  const expected = { members: { [gus.id]: ['admin'], [jon.id]: ['admin'] }, removed: [hal.id, kim.id, lee.id, mia.id].sort() }
  assert.deepEqual(members, expected.members)
  assert.deepEqual(Object.keys(state.removed).sort(), expected.removed)
  const circles = [{ name: 'membership and roles: answers, an added role, a role taken away, a removal, a leave, crossing admin removals', blocks: blocksOf(s), circle: C.hash, expected }]
  {
    const t = story(), f = t.person('max'), a1 = t.person('ned_a'), a2 = t.person('oak'), a3 = t.person('pip'), m = t.person('rio'), q = t.person('sam')
    const K = t.say(f, 'a circle: removing an admin takes two, orders may sign as it', 'actor', { kind: 'circle', name: 'Co-op kitchen', removal: { needed: 2 }, signers: ['admin', 'orders'] })
    const join = (who, roles) => { const g = t.say(f, `${who.name} invited: ${roles.join(', ')}`, 'grant', { kind: 'member', roles }, { subject: K.hash, as: K.hash, to: who.id }); const y = t.say(who, `${who.name} says yes`, 'grant', { kind: 'member', status: 'accepted' }, { answers: g.hash, subject: K.hash }, { after: [g.hash] }); return { g, y } }
    const j1 = join(a1, ['admin']), j2 = join(a2, ['admin']), j3 = join(a3, ['admin']), jm = join(m, ['orders']), jq = join(q, ['speak'])
    const asM = t.say(m, 'rio signs as the circle (orders may)', 'observe', { kind: 'note', text: 'flour ordered' }, { as: K.hash }, { after: [jm.y.hash] })
    const asQ = t.say(q, 'sam signs as the circle (speak may not)', 'observe', { kind: 'note', text: 'hello' }, { as: K.hash }, { after: [jq.y.hash] })
    const remove = (by, j, label) => t.say(by, label, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: j3.y.hash }, { updates: j3.g.hash, subject: K.hash, as: K.hash }, { after: [j.y.hash, j3.y.hash] })
    remove(a1, j1, 'ned_a removes pip')
    const one = blocksOf(t).slice()
    remove(a2, j2, 'oak agrees')
    const may_act = { [asM.hash]: true, [asQ.hash]: false }
    for (const [hash, ok] of Object.entries(may_act)) assert.equal(fb.fold.mayActAs(t.held.find((b) => b.hash === hash), K, t.held), ok)
    const everyone = [f, a1, a2, a3, m, q].map((p) => p.id).sort()
    const held = (list) => list.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))
    assert.deepEqual(Object.keys(fb.circleState(K, held(one)).members).sort(), everyone)
    assert.deepEqual(Object.keys(fb.circleState(K, t.held).removed), [a3.id])
    circles.push({ name: 'one admin alone cannot remove an admin when the circle\'s removal needs two', blocks: one, circle: K.hash, expected: { members: everyone, removed: [] }, may_act })
    circles.push({ name: 'a second admin agrees: the admin is removed', blocks: blocksOf(t), circle: K.hash, expected: { members: everyone.filter((id) => id !== a3.id), removed: [a3.id] } })
  }
  const audience = [
    { name: 'a circle in the audience means its members in the block\'s causal past', block: audienceBefore.hash, recipient: C.hash, members: [gus.id, hal.id, jon.id].sort() },
    { name: 'naming the circle\'s head in after brings new members in', block: audienceAfter.hash, recipient: C.hash, members: [gus.id, hal.id, jon.id, kim.id].sort() },
    { name: 'a role means its holders there', block: audienceAfter.hash, recipient: `${C.hash}#admin`, members: [gus.id, jon.id].sort() }
  ]
  for (const v of audience) assert.deepEqual(fb.membersThen(s.held.find((block) => block.hash === v.block), v.recipient, s.held), v.members, v.name)
  return { circles, audience: [{ name: 'members then', blocks: blocksOf(s), salts: { [C.hash]: '00000000000000000000000000000002' }, cases: audience }] }
}

// ---- Folds: where a thing is now, and who owns it ----
function thingFolds() {
  const s = story()
  const ann = s.person('dee'), bob = s.person('eli'), cat = s.person('fox')
  const phone = keyOf('dee_phone')
  s.keep('dee brings in a phone key', keyGrant(ann.id, phone.public_key_sign, { private_key: ann.key.private_key, last: null, broughtIn: ann.id }, { at: at() }), 'dee')
  const farm = s.say(ann, 'the farm, where it is on the map', 'thing', { kind: 'farm', name: 'Hill Farm', where: { lat: '51.4545', lon: '-2.5879', radius: fb.amount('400', 'm') } })
  const market = s.say(ann, 'the market', 'thing', { kind: 'market', name: 'Saturday market' })
  const truck = s.say(ann, 'the truck, first seen at the farm', 'thing', { kind: 'truck' }, { place: farm.hash })
  const pallet = s.say(ann, 'a pallet at the farm', 'thing', { kind: 'pallet' }, { place: farm.hash })
  const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
  const tray = s.say(ann, 'a tray, made at the farm', 'thing', { pack: fb.amount('30', '{egg}'), lot: 'L-9' }, { kind: eggs.hash, place: farm.hash })
  s.say(ann, 'the tray onto the pallet', 'transfer', {}, { to_place: pallet.hash, what: tray.hash })
  s.say(ann, 'the pallet into the truck', 'transfer', {}, { to_place: truck.hash, what: pallet.hash })
  s.say(ann, 'the truck to the market', 'transfer', {}, { to_place: market.hash, what: truck.hash })
  const crate = s.say(ann, 'a crate at the farm', 'thing', { kind: 'crate' }, { place: farm.hash })
  // Two moves of the crate from two of dee's keys that do not see each other.
  s.say(ann, 'the crate to the market (laptop)', 'transfer', {}, { to_place: market.hash, what: crate.hash })
  s.say(ann, 'the crate back to the farm (phone), not seeing it', 'transfer', {}, { to_place: farm.hash, what: crate.hash }, { key: 'dee_phone' })
  const where = [
    { name: 'containment: the tray is where its pallet is, which is where the truck is', thing: tray.hash, places: [market.hash] },
    { name: 'a thing never moved is at its own refs.place', thing: farm.hash, places: [] },
    { name: 'two moves that do not see each other: both places', thing: crate.hash, places: [farm.hash, market.hash].sort() }
  ]
  for (const v of where) assert.deepEqual(fb.whereNow(s.held.find((block) => block.hash === v.thing), s.held), v.places, v.name)
  const bowl = s.say(ann, 'a bowl ann made', 'thing', { kind: 'bowl' })
  const sold = s.say(ann, 'sold to bob', 'transfer', { money: fb.money(1200, 'GBP') }, { to_owner: bob.id, what: bowl.hash })
  const took = s.say(bob, 'bob accepts it: ownership moves', 'transfer', { status: 'accepted' }, { answers: sold.hash }, { after: [sold.hash] })
  const again = s.say(ann, 'ann tries to sell it again to cat', 'transfer', {}, { to_owner: cat.id, what: bowl.hash })
  s.say(cat, 'cat accepts ann\'s second sale: it counts for nothing', 'transfer', { status: 'accepted' }, { answers: again.hash }, { after: [again.hash] })
  const resale = s.say(bob, 'bob sells it to cat', 'transfer', {}, { to_owner: cat.id, what: bowl.hash }, { after: [took.hash] })
  s.say(cat, 'cat accepts bob\'s sale', 'transfer', { status: 'accepted' }, { answers: resale.hash }, { after: [resale.hash] })
  const cup = s.say(ann, 'a cup', 'thing', { kind: 'cup' })
  s.say(ann, 'the cup sent to bob, never answered', 'transfer', {}, { to_owner: bob.id, what: cup.hash })
  const soup = s.say(ann, 'a pot of soup', 'thing', { kind: 'soup' })
  s.say(ann, 'the soup served to an open receiver, 40 people', 'transfer', { count: 40 }, { what: soup.hash })
  const flour = s.say(ann, 'a sack of flour', 'thing', { kind: 'flour', pack: fb.amount('25', 'kg') })
  s.say(ann, 'a part of the sack to bob', 'transfer', { amount: fb.amount('5', 'kg') }, { to_owner: bob.id, what: flour.hash })
  const jar = s.say(ann, 'a jar', 'thing', { kind: 'jar' })
  const jarBob = s.say(ann, 'the jar to bob (laptop)', 'transfer', {}, { to_owner: bob.id, what: jar.hash })
  const jarCat = s.say(ann, 'the jar to cat (phone), not seeing it', 'transfer', {}, { to_owner: cat.id, what: jar.hash }, { key: 'dee_phone' })
  s.say(bob, 'bob accepts the jar', 'transfer', { status: 'accepted' }, { answers: jarBob.hash })
  s.say(cat, 'cat accepts the jar', 'transfer', { status: 'accepted' }, { answers: jarCat.hash })
  const owners = [
    { name: 'owned by the last counted transfer, each signed by the owner the one before named', thing: bowl.hash, owner: cat.id, conflict: null },
    { name: 'a part leaves ownership where it is', thing: flour.hash, owner: ann.id, conflict: null },
    { name: 'a transfer the named receiver never accepted leaves it with the giver', thing: cup.hash, owner: ann.id, conflict: null },
    { name: 'a transfer to an open receiver moves on the sequencer\'s signature, to nobody named', thing: soup.hash, owner: null, conflict: null },
    { name: 'two accepted transfers by the owner that do not see each other prove a lie', thing: jar.hash, owner: ann.id, conflict: [jarBob.hash, jarCat.hash].sort() }
  ]
  for (const v of owners) { const got = fb.fold.ownership(s.held.find((block) => block.hash === v.thing), s.held); assert.deepEqual([got.owner, got.conflict], [v.owner, v.conflict], v.name) }
  return { name: 'things: where they are and who owns them', blocks: blocksOf(s), where, owners }
}

// ---- Folds: a successor's trigger, and a circle's key by epoch ----
function successorFolds() {
  const out = []
  for (const cancel of [false, true]) {
    const s = story(), pam = s.person('gia'), heir = s.person('hal_heir'), w1 = s.person('ina'), w2 = s.person('jax')
    const grant = s.say(pam, 'gia names her successor: two witnesses, a week\'s wait', 'grant', { kind: 'successor', witnesses: [w1.id, w2.id].sort(), needed: 2, wait: 'P7D', keys: { sealed_to: heir.id, envelope: 'opaque' } }, { to: heir.id })
    const e1 = s.say(w1, 'the first witness records the event', 'observe', { kind: 'event', text: 'closed' }, { under: grant.hash, subject: pam.id })
    const e2 = s.say(w2, 'the second witness records it', 'observe', { kind: 'event', text: 'closed' }, { under: grant.hash, subject: pam.id })
    const arrivals = { [e1.hash]: '2026-10-01T00:00:00.000Z', [e2.hash]: '2026-10-02T00:00:00.000Z' }
    if (cancel) { const no = s.say(pam, 'gia defeats it: she is here', 'observe', { kind: 'event', text: 'not so' }, { defeats: e2.hash }); arrivals[no.hash] = '2026-10-05T00:00:00.000Z' }
    const now = '2026-10-10T00:00:00.000Z'
    const got = fb.fold.successorState(grant, s.held, { now, arrivedAt: (hash) => arrivals[hash] })
    const expected = cancel ? { events: [e1.hash], fired: false, fires: null } : { events: [e1.hash, e2.hash].sort(), fired: true, fires: '2026-10-09T00:00:00.000Z' }
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, key)
    out.push({ name: cancel ? 'the person defeats an event observe within the wait: the trigger never fires' : 'the needed witnesses record the event; it fires its wait after the last arrived', blocks: blocksOf(s), grant: grant.hash, arrivals, now, expected })
  }
  return out
}
function rekeyFolds() {
  const s = story(), gus = s.person('kai'), jon = s.person('lia')
  const C = s.say(gus, 'the circle, its key at epoch 0', 'actor', { kind: 'circle', name: 'Allotment', public_key_encrypt: keyOf('kai_circle0').public_key_encrypt })
  const inv = s.say(gus, 'lia invited as admin', 'grant', { kind: 'member', roles: ['admin'] }, { subject: C.hash, as: C.hash, to: jon.id })
  const yes = s.say(jon, 'lia says yes', 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: C.hash }, { after: [inv.hash] })
  const rekey = (who, label, epoch, name, after) => s.say(who, label, 'grant', { kind: 'key', epoch, public_key_encrypt: keyOf(name).public_key_encrypt, keys: { sealed_to_members: 'opaque' } }, { subject: C.hash, as: C.hash }, { after })
  const one = rekey(gus, 'epoch 1, naming epoch 0 (the circle) in after', 1, 'kai_circle1', [C.hash, yes.hash])
  rekey(jon, 'an epoch 2 that names no epoch 1 in after: not counted', 2, 'kai_circle_stray', [yes.hash])
  const twoA = rekey(gus, 'epoch 2, by kai', 2, 'kai_circle2a', [one.hash])
  const twoB = rekey(jon, 'epoch 2, by lia, not seeing it', 2, 'kai_circle2b', [one.hash])
  const all = blocksOf(s).slice()
  const three = rekey(gus, 'epoch 3, seeing both: it settles', 3, 'kai_circle3', [twoA.hash, twoB.hash])
  const open = { epoch: 2, keys: [keyOf('kai_circle2a').public_key_encrypt, keyOf('kai_circle2b').public_key_encrypt].sort() }
  const settled = { epoch: 3, keys: [keyOf('kai_circle3').public_key_encrypt] }
  const held = (list) => list.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))
  for (const [list, want] of [[all, open], [blocksOf(s), settled]]) { const got = fb.fold.circleKey(C, held(list)); assert.deepEqual({ epoch: got.epoch, keys: got.keys }, want) }
  void three
  return [{ name: 'two rekeys in one epoch both open', blocks: all, circle: C.hash, expected: open }, { name: 'the next epoch settles them', blocks: blocksOf(s), circle: C.hash, expected: settled }]
}

// ---- Folds: a secret ballot's counted commitments ----
function ballotFolds() {
  const s = story(), tally = s.person('tal'), other = s.person('ume')
  const salt = (n) => sha(`ballot salt ${n}`).slice(0, 32)
  const c = [1, 2, 3].map((n) => fb.saltedHash(salt(n), n === 3 ? 'no' : 'yes'))
  const result = s.say(tally, 'the named counter signs the result and the commitments it counted', 'observe', { kind: 'result', text: 'yes 2', counted: [c[0], c[1]].sort() })
  const forged = s.say(other, 'someone else signs a result', 'observe', { kind: 'result', text: 'yes 3', counted: c.slice().sort() })
  const cases = [
    { name: 'a voter finds its commitment among those counted', result: result.hash, commitment: c[0], counter: tally.id, counted: true },
    { name: 'a commitment the counter did not list was not counted', result: result.hash, commitment: c[2], counter: tally.id, counted: false },
    { name: 'only the named counter\'s result counts', result: forged.hash, commitment: c[2], counter: tally.id, counted: false }
  ]
  for (const v of cases) assert.equal(fb.fold.countedIn(s.held.find((b) => b.hash === v.result), v.commitment, v.counter), v.counted)
  return [{ name: 'a secret ballot', blocks: blocksOf(s), cases }]
}

// ---- Identities ----
function identityVectors() {
  const out = []
  const record = (name, s, id, extra = {}, options = {}) => {
    const held = s.held
    const signed_by_author = Object.fromEntries(held.filter((block) => block.refs?.author === id || block.hash === id).map((block) => [block.hash, signedByAuthor(block, held, options)]))
    out.push({ name, id, blocks: blocksOf(s), signed_by_author, keys: fb.identity.keysOf(id, held, options).sort(), history: fb.identityState(id, held, options).history, ...extra })
    return signed_by_author
  }
  {
    // Recovery beyond reach: arrival times on the reader's node decide, never `at`.
    const s = story(), gil = s.person('gil'), hub = s.person('hub')
    const early = s.say(gil, 'last good', 'observe', { kind: 'note', text: 'mine' })
    const used = s.say(gil, 'after the last good, but hub built on it before the reach began: stands', 'observe', { kind: 'note', text: 'deal done' })
    s.say(hub, 'hub builds on it', 'observe', { kind: 'confirm', confidence: '0.9' }, { confirms: used.hash })
    const late = s.say(gil, 'after the last good, arrived within the reach: void', 'observe', { kind: 'note', text: 'pay the thief' })
    const fresh = keyOf('gil_new')
    const rotation = s.keep('the recovery rotation', keyGrant(gil.id, fresh.public_key_sign, { private_key: gil.recovery.private_key, recoveryKey: gil.recovery.public_key_sign, last: null }, { replaces: gil.key.public_key_sign, lastGood: early.hash, at: at() }), 'gil_recovery')
    const arrivals = Object.fromEntries(s.held.map((block) => [block.hash, '2026-09-01T00:00:00.000Z']))
    arrivals[late.hash] = '2026-11-20T00:00:00.000Z'; arrivals[rotation.hash] = '2026-12-01T00:00:00.000Z'
    const options = { arrivedAt: (hash) => arrivals[hash] }
    const got = record('recovery reach is causal and read from arrival: what another identity built on before the reach began stands', s, gil.id, { arrivals }, options)
    assert.deepEqual([got[used.hash], got[late.hash], got[early.hash]], [true, false, true])
  }
  {
    // A freeze covers only the contested key: the device key keeps speaking.
    const s = story(), hal = s.person('ida')
    const laptop = keyOf('ida_laptop')
    const device = s.keep('a device key', keyGrant(hal.id, laptop.public_key_sign, { private_key: hal.key.private_key, last: null, broughtIn: hal.id }, { at: at() }), 'ida')
    const one = s.say(hal, 'last good', 'observe', { kind: 'note', text: 'mine' })
    const a = keyOf('ida_a'), b = keyOf('ida_b')
    const rotA = s.keep('a rotation to key a', keyGrant(hal.id, a.public_key_sign, { private_key: hal.key.private_key, last: one }, { replaces: hal.key.public_key_sign, lastGood: one.hash, at: at() }), 'ida')
    // The same key signs a rival rotation from the same place in its chain: it does not see the first.
    const rotB = s.keep('a rival rotation to key b, not seeing it', keyGrant(hal.id, b.public_key_sign, { private_key: hal.key.private_key, last: one }, { replaces: hal.key.public_key_sign, lastGood: one.hash, at: at() }), 'ida')
    const fromA = s.say(hal, 'key a speaks: frozen', 'observe', { kind: 'note', text: 'a' }, {}, { key: 'ida_a', link: { seq: 1, prev: rotA.hash } })
    const fromLaptop = s.say(hal, 'the laptop key keeps speaking', 'observe', { kind: 'note', text: 'laptop' }, {}, { key: 'ida_laptop' })
    const got = record('two rotations of one key that do not see each other freeze only the keys they bring in', s, hal.id, { frozen: [a.public_key_sign, b.public_key_sign].sort() })
    assert.deepEqual([got[fromA.hash], got[fromLaptop.hash], got[rotA.hash], got[rotB.hash]], [false, true, true, true])
    void device
  }
  {
    // Void spreads: a thief's key brought in by a void block is void, and every key it brought in.
    const s = story(), jo = s.person('jud')
    const good = s.say(jo, 'last good', 'observe', { kind: 'note', text: 'mine' })
    const thief = keyOf('jud_thief'), second = keyOf('jud_thief2')
    const brought = s.keep('the stolen key brings in a thief key (after the last good)', keyGrant(jo.id, thief.public_key_sign, { private_key: jo.key.private_key, last: good }, { at: at() }), 'jud')
    const broughtOn = s.keep('the thief key brings in another', keyGrant(jo.id, second.public_key_sign, { private_key: thief.private_key, last: null, broughtIn: brought.hash }, { at: at() }), 'jud_thief')
    const fromSecond = s.say(jo, 'the second thief key speaks: void', 'observe', { kind: 'note', text: 'pay me' }, {}, { key: 'jud_thief2', link: { seq: 1, prev: broughtOn.hash } })
    const fresh = keyOf('jud_new')
    s.keep('the rotation by the key itself, naming its last good block', keyGrant(jo.id, fresh.public_key_sign, { private_key: jo.key.private_key, last: brought }, { replaces: jo.key.public_key_sign, lastGood: good.hash, at: at() }), 'jud')
    const got = record('a key brought in by a void block is void, and so is every key it brought in', s, jo.id)
    assert.deepEqual([got[brought.hash], got[broughtOn.hash], got[fromSecond.hash]], [false, false, false])
  }
  {
    // A key is rotated only by itself or by the recovery key.
    const s = story(), kit = s.person('kit')
    const laptop = keyOf('kit_laptop')
    const device = s.keep('a device key', keyGrant(kit.id, laptop.public_key_sign, { private_key: kit.key.private_key, last: null, broughtIn: kit.id }, { at: at() }), 'kit')
    const rogue = s.keep('the laptop key tries to rotate the genesis key: not counted', keyGrant(kit.id, keyOf('kit_rogue').public_key_sign, { private_key: laptop.private_key, last: null, broughtIn: device.hash }, { replaces: kit.key.public_key_sign, lastGood: device.hash, at: at() }), 'kit_laptop')
    const still = s.say(kit, 'the genesis key still speaks', 'observe', { kind: 'note', text: 'still me' })
    const got = record('a rotation by another of the id\'s keys is not counted: its key never comes in', s, kit.id)
    assert.deepEqual([got[rogue.hash], got[still.hash]], [true, true])
    assert.ok(!fb.identity.keysOf(kit.id, s.held).includes(keyOf('kit_rogue').public_key_sign))
    assert.equal(fb.sync.accept([rogue], s.held.filter((block) => block !== rogue)).refused[0]?.code, 'not_own_rotation')
  }
  {
    // An agent's genesis and the grant that names its operator.
    const s = story(), ann = s.person('lou'), bot = s.person('lou_agent', { kind: 'agent' })
    s.say(ann, 'lou answers for her agent: a grant of kind operator, the only place the operator is named', 'grant', { kind: 'operator' }, { to: bot.id })
    const grant = s.say(ann, 'what the agent may do for lou', 'grant', { kind: 'shop', scope: { acts: ['observe.note', 'promise'], limit: fb.money(5000, 'GBP'), per: 'P7D', until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const act = s.say(bot, 'the agent writes under the grant', 'observe', { kind: 'note', text: 'ordered flour' }, { under: grant.hash })
    assert.deepEqual(fb.grant.operatorsOf(bot.id, s.held), [ann.id])
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held), [])
    const outside = s.say(bot, 'an act the grant does not cover', 'observe', { kind: 'review', text: 'five stars' }, { under: grant.hash })
    assert.ok(fb.grant.whyNotUnder(outside, s.held).length)
    record('an agent is an actor with its own genesis; its operator is the author of its live grant of kind operator', s, bot.id, { operators: [ann.id], under: { [act.hash]: true, [outside.hash]: false } })
  }
  {
    // An older identity with no 1.6 block yet: its history is open; a grant in it is taken but no fold reads it.
    const s = story(), key = keyOf('pre')
    const g = { ...fb.create('actor', { kind: 'person', public_key_sign: key.public_key_sign, at: '2026-05-01T00:00:00.000Z', audience: 'public' }, {}) }
    g.signature = fb.sign(g, key.private_key); s.keep('an older genesis', g, 'pre')
    const note = fb.create('observe', { kind: 'note', text: 'before 1.6', at: '2026-06-01T00:00:00.000Z' }, { author: g.hash }); note.signature = fb.sign(note, key.private_key); s.keep('history: counts while open', note, 'pre')
    const grant = fb.create('grant', { kind: 'key', public_key_sign: keyOf('pre_device').public_key_sign, at: '2026-06-02T00:00:00.000Z' }, { author: g.hash, subject: g.hash }); grant.signature = fb.sign(grant, key.private_key); s.keep('a key grant without seq: taken, but it brings in no key', grant, 'pre')
    assert.equal(fb.sync.accept([note, grant], [g]).taken.length, 2)
    const got = record('an older identity with no 1.6 block yet has open history', s, g.hash, { history: 'open' })
    assert.deepEqual([got[note.hash], keysOfLast()], [true, [key.public_key_sign]])
    function keysOfLast () { return out.at(-1).keys }
  }
  return out
}

// ---- Refusals: blocks every node must refuse ----
function refusals() {
  const out = []
  const s = story(), ann = s.person('mae'), bob = s.person('ned')
  const base = (state = {}, refs = {}) => ({ type: 'observe', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'note', ...state }, refs: { author: ann.id, prev: ann.id, ...refs } })
  const strict = (name, block, want) => {
    const codes = codesOf(fb.refusals(block.type, block.state, block.refs))
    assert.ok(codes.length, `${name} should be refused`)
    if (want) assert.deepEqual(codes, want, name)
    out.push({ name, by: 'check', block, codes })
  }
  strict('a float', base({ temperature: 3.9 }))
  strict('a whole number above 2^53 - 1', base({ seq: 2 ** 53 }))
  strict('a ref the shared keys and its schema do not declare', base({}, { seller: bob.id }))
  strict('a field its type and schema do not declare', base({ colour: 'brown' }))
  strict('a key not written in NFC', base({ ['cafe\u0301']: 'decomposed' }))
  strict('a body over 65,536 bytes', base({ text: 'x'.repeat(65536) }))
  strict('more than 16 heads in after', base({}, { after: Array.from({ length: 17 }, (_, i) => sha(`head ${i}`)) }))
  strict('a promise carrying a status without answering (offered is read from who signed)', { type: 'promise', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', status: 'accepted' }, refs: { author: ann.id, prev: ann.id, from: ann.id, to: bob.id } })
  strict('an ask with no expires', { type: 'promise', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', what: 'eggs' }, refs: { author: bob.id, prev: bob.id, to: bob.id } })
  strict('a promise signed by neither side', { type: 'promise', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', terms: { expires: '2026-10-20T00:00:00.000Z' } }, refs: { author: ann.id, prev: ann.id, from: bob.id } })
  strict('an answer that does not name its deal in for', { type: 'promise', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', status: 'accepted' }, refs: { author: bob.id, prev: bob.id, answers: sha('offer') } })
  strict('a decimal string with a leading zero', { type: 'thing', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'eggs', pack: { value: '007', unit: '{egg}' } }, refs: { author: ann.id, prev: ann.id } }, ['decimal'])
  {
    const parent = s.say(ann, 'a parent grant: acts accept, until December, depth 1', 'grant', { kind: 'shop', depth: 1, scope: { acts: ['accept'], limit: fb.money(5000, 'GBP'), until: '2026-12-31T00:00:00.000Z' } }, { to: bob.id })
    const child = { type: 'grant', state: { seq: 1, at: '2026-10-15T12:10:00.000Z', audience: 'public', kind: 'shop', scope: { acts: ['accept', 'offer'], limit: fb.money(9000, 'GBP'), until: '2027-06-30T00:00:00.000Z' } }, refs: { author: bob.id, prev: bob.id, parent: parent.hash, to: sha('someone') } }
    const codes = codesOf(fb.refusals(child.type, child.state, child.refs, { held: new Map(s.held.map((block) => [block.hash, block])) }))
    assert.deepEqual(codes, ['wider_than_parent'])
    out.push({ name: 'a child grant wider than its parent', by: 'check', block: child, held: [parent.hash], codes })
  }
  // Push: what a node refuses to take in.
  const push = (name, incoming, held, code) => {
    const got = fb.sync.accept(incoming, held)
    const refused = got.refused.map((item) => item.hash)
    assert.ok(incoming.every((block) => refused.includes(block.hash)), `${name}: ${JSON.stringify(got.refused)}`)
    assert.deepEqual(codesOf(got.refused), [code], `${name}: ${JSON.stringify(got.refused)}`)
    out.push({ name, by: 'accept', incoming: incoming.map((block) => block.hash), held: held.map((block) => block.hash), codes: [code] })
  }
  const seqless = s.keep('a block without seq from a 1.6 identity', { ...fb.create('observe', { at: '2026-10-15T12:20:00.000Z', audience: 'public', kind: 'note', text: 'old?' }, { author: ann.id }), signature: null }, 'mae')
  seqless.signature = fb.sign(seqless, ann.key.private_key); s.out.at(-1).signature = seqless.signature
  push('a block without seq from a 1.6 identity', [seqless], [ann.g], 'no_history')
  {
    // An older identity: a genesis without recovery, history, then its first 1.6 block closes the history.
    const key = keyOf('old'), oldG = { ...fb.create('actor', { kind: 'person', public_key_sign: key.public_key_sign, at: '2026-06-01T00:00:00.000Z', audience: 'public' }, {}) }
    oldG.signature = fb.sign(oldG, key.private_key); s.keep('an older genesis (no recovery)', oldG, 'old')
    const h1 = fb.create('observe', { kind: 'note', text: 'before 1.6', at: '2026-07-01T00:00:00.000Z' }, { author: oldG.hash }); h1.signature = fb.sign(h1, key.private_key); s.keep('history, in the first 1.6 block\'s causal past', h1, 'old')
    const h2 = fb.create('observe', { kind: 'note', text: 'slipped in', at: '2026-07-02T00:00:00.000Z' }, { author: oldG.hash }); h2.signature = fb.sign(h2, key.private_key); s.keep('a block without seq outside the closed history', h2, 'old')
    const h3 = fb.create('grant', { kind: 'key', public_key_sign: keyOf('old_thief').public_key_sign, at: '2026-07-03T00:00:00.000Z' }, { author: oldG.hash, subject: oldG.hash }); h3.signature = fb.sign(h3, key.private_key); s.keep('history that grants a key', h3, 'old')
    const first = fb.write('observe', { kind: 'note', text: 'my first 1.6 block' }, { derives_from: h1.hash }, { author: oldG.hash, key, held: [oldG], at: '2026-10-15T12:30:00.000Z' })
    s.keep('the first 1.6 block, closing the history', first, 'old')
    assert.equal(fb.sync.accept([h1], [oldG, first]).taken.length, 1, 'history in the causal past counts')
    push('a block without seq outside an older identity\'s closed history', [h2], [oldG, first], 'history_closed')
    push('a grant without seq outside the closed history', [h3], [oldG, first], 'history_closed')
  }
  // Identity: a key brought in by a void block speaks for nobody (see identities); a deal block signed by a non-side.
  {
    const d = story(), tia = d.person('ora'), uma = d.person('pam'), eve = d.person('rex')
    const eggs = d.say(tia, 'the kind', 'thing', { kind: 'eggs' })
    const offer = d.say(tia, 'a one-to-one offer', 'promise', { terms: { price: fb.money(450, 'GBP'), expires: '2026-10-20T00:00:00.000Z' } }, { from: tia.id, to: uma.id, what: eggs.hash })
    d.say(eve, 'a stranger answers it accepted', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    assert.equal(fb.promiseStage(offer, d.held).stage, 'offered')
    out.push({ name: 'a deal block signed by a non-side does not count', by: 'fold', blocks: blocksOf(d), first: offer.hash, expected: { stage: 'offered' }, codes: ['not_a_side'] })
  }
  {
    const d = story(), tia = d.person('ora'), dan = d.person('sid'), cat = d.person('tom')
    const eggs = d.say(tia, 'the kind', 'thing', { kind: 'eggs' })
    const offer = d.say(tia, 'an open offer', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('10', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: tia.id, what: eggs.hash })
    d.say(dan, 'a stranger counters it', 'promise', { terms: { price: fb.money(100, 'GBP'), expires: '2026-10-20T00:00:00.000Z' } }, { from: tia.id, to: dan.id, what: eggs.hash, answers: offer.hash, for: offer.hash })
    const request = d.say(cat, 'another asks for two', 'promise', { status: 'accepted', terms: { quantity: fb.amount('2', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: cat.id })
    d.say(tia, 'the offerer allocates to her', 'promise', { status: 'accepted' }, { answers: request.hash, for: offer.hash })
    assert.equal(fb.promiseStage(offer, d.held).stage, 'accepted')
    out.push({ name: 'a counter does not end an open offer: only its author does', by: 'fold', blocks: blocksOf(d), first: offer.hash, expected: { stage: 'accepted' }, codes: ['open_offer_counter'] })
  }
  // Envelope over limits: a sealed copy whose block is over 65,536 bytes is refused when opened.
  {
    const big = fb.create('observe', { seq: 2, at: '2026-10-15T12:40:00.000Z', audience: 'public', kind: 'note', text: 'x'.repeat(70000) }, { author: ann.id, prev: ann.id })
    big.signature = fb.sign(big, ann.key.private_key)
    const message = fb.sealCopy(big, { keys: [bob.key.public_key_encrypt], privateKey: ann.key.private_key, fixed: { ephemeral: sha('big ephemeral'), contentKey: sha('big content'), nonce: sha('big nonce').slice(0, 24), keyNonces: [sha('big key nonce').slice(0, 24)] } })
    assert.throws(() => fb.openCopy(message, bob.key.x25519_private), (error) => error.code === 'size_limit')
    out.push({ name: 'a sealed copy whose block is over 65,536 bytes is refused', by: 'open', recipient: 'ned', message, codes: ['size_limit'] })
  }
  return { blocks: blocksOf(s), cases: out }
}

// ---- Alias reads: one per row ----
function reads() {
  const A = sha('a'), B = sha('b'), C = sha('c'), D = sha('d')
  const cases = [
    ['types: place reads as thing', { type: 'place.venue', state: { name: 'Hill Bakery' }, refs: {} }],
    ['types: substance reads as thing', { type: 'substance.product', state: { name: 'Sourdough' }, refs: { author: A } }],
    ['types: base.kind of a 1.6 type keeps the kind', { type: 'observe.whatever', state: {}, refs: {} }],
    ['types: a retired type', { type: 'observe.checkout_error', state: {}, refs: {} }],
    ['types: fields renamed (a preference\'s kind is what it says)', { type: 'observe.preference', state: { kind: 'vegan' }, refs: {} }],
    ['promise: seller, buyer and need; due', { type: 'transfer.order', state: { status: 'accepted', due: '2026-10-20T00:00:00.000Z' }, refs: { seller: A, buyer: B, need: C } }],
    ['promise: not_true reads as stopped onward', { type: 'promise', state: { status: 'not_true' }, refs: { updates: A } }],
    ['promise: revoked reads as stopped onward', { type: 'promise', state: { status: 'revoked' }, refs: { updates: A } }],
    ['promise: delivered marks what it settles', { type: 'promise', state: { status: 'delivered' }, refs: { seller: A, buyer: B, updates: C } }],
    ['promise: state.delivered marks what it settles', { type: 'promise', state: { seq: 3, delivered: { value: '1', unit: '{tray}' } }, refs: { author: A, updates: C } }],
    ['promise: offered reads as no status (read from who signed)', { type: 'promise', state: { seq: 2, status: 'offered' }, refs: { author: A, from: A, to: B } }],
    ['promise: asked reads as no status', { type: 'promise', state: { seq: 2, status: 'asked' }, refs: { author: B, from: A, to: B } }],
    ['promise: withdrawn reads as stopped before', { type: 'promise', state: { seq: 2, status: 'withdrawn' }, refs: { author: A, updates: C } }],
    ['promise: ended reads as stopped onward', { type: 'promise', state: { seq: 2, status: 'ended' }, refs: { author: A, updates: C } }],
    ['promise: paused reads as stopped occurrences', { type: 'promise', state: { seq: 2, status: 'paused', occurrences: ['2026-10-23T09:00:00.000Z'] }, refs: { author: B, answers: C } }],
    ['promise: a top-level condition reads as terms.condition', { type: 'promise', state: { seq: 2, condition: { collect: 'Saturday' } }, refs: { author: A, from: A } }],
    ['promise: counterparty beside from reads as to', { type: 'promise', state: { seq: 2 }, refs: { author: A, from: A, counterparty: B } }],
    ['promise: counterparty beside to reads as from', { type: 'promise', state: { seq: 2 }, refs: { author: B, to: B, counterparty: A } }],
    ['every type: refs.deal reads as for', { type: 'promise', state: { seq: 2, status: 'accepted' }, refs: { author: B, answers: C, deal: C } }],
    ['every type: state.rule reads as refs.under', { type: 'observe', state: { seq: 2, kind: 'vote', rule: D }, refs: { author: A } }],
    ['transfer: order reads as for', { type: 'transfer', state: { kind: 'payment' }, refs: { order: C } }],
    ['observe.want and observe.intent read as an ask', { type: 'observe.intent', state: { product_name: 'cream' }, refs: { author: A } }],
    ['grant: revoked reads as stopped onward', { type: 'grant', state: { kind: 'agent', status: 'revoked' }, refs: { updates: A } }],
    ['grant: live reads as no status', { type: 'grant', state: { seq: 6, kind: 'agent', status: 'live' }, refs: { author: A, agent: B } }],
    ['grant: withdrawn reads as stopped onward', { type: 'grant', state: { seq: 7, kind: 'agent', status: 'withdrawn' }, refs: { author: A, updates: C } }],
    ['grant: refs.agent reads as to', { type: 'grant', state: { seq: 6, kind: 'agent' }, refs: { author: A, agent: B } }],
    ['grant: scope.parties "any" reads as left out (everyone)', { type: 'grant', state: { seq: 6, kind: 'agent', scope: { parties: 'any', until: '2026-12-31T00:00:00.000Z' } }, refs: { author: A, to: B } }],
    ['grant.member: member and group', { type: 'grant', state: { kind: 'member' }, refs: { author: A, group: C, member: B } }],
    ['grant.member: a join by confirms reads as an accepted answer', { type: 'grant', state: { kind: 'member' }, refs: { author: B, group: C, confirms: D } }],
    ['grant.member: an end by defeats reads as an update with status stopped', { type: 'grant', state: { kind: 'member' }, refs: { author: A, group: C, defeats: D } }],
    ['grant.member: an invitation without as reads as signed as the circle', { type: 'grant', state: { seq: 2, kind: 'member' }, refs: { author: A, subject: C, agent: B } }],
    ['grant.holder: member and group', { type: 'grant', state: { kind: 'holder' }, refs: { author: A, group: C, member: B } }],
    ['grant.voice: member and group', { type: 'grant', state: { kind: 'voice' }, refs: { author: A, group: C, member: B } }],
    ['grant.body: refs.member reads as to', { type: 'grant', state: { seq: 2, kind: 'body' }, refs: { author: A, subject: A, member: B } }],
    ['grant.successor: sealed reads as keys', { type: 'grant', state: { seq: 2, kind: 'successor', sealed: { alg: 'x' } }, refs: { author: A, to: B } }],
    ['actor: an agent\'s operator is named only by its grant', { type: 'actor', state: { seq: 2, kind: 'agent', operator: A }, refs: { author: A, operator: A } }],
    ['schema: the type schema reads as a thing of kind schema, its kind into its target', { type: 'schema', state: { seq: 9, target: 'thing', kind: 'eggs', fields: { lot: 'text' } }, refs: { author: A } }],
    ['observe.received: confirms marks what it settles', { type: 'observe', state: { kind: 'received' }, refs: { confirms: C } }],
    ['observe.attestation: received marks what it settles', { type: 'observe.attestation', state: { received: true }, refs: { confirms: C } }],
    ['observe.attestation: accepted reads as a member\'s answer', { type: 'observe.attestation', state: { accepted: true }, refs: { author: B, group: C, confirms: D } }],
    ['observe.attestation: not accepted reads as an end', { type: 'observe.attestation', state: { accepted: false }, refs: { author: B, group: C, confirms: D } }],
    ...Object.entries(fb.ALIASES.refs).map(([from, to]) => [`refs: ${from} reads as ${to}`, { type: 'observe', state: { kind: 'note' }, refs: { [from]: A } }]),
    ['outside: a ref naming someone with no record is an open side', { type: 'promise', state: { status: 'accepted' }, refs: { seller: A, buyer: 'outside:Plenish' } }]
  ]
  const out = cases.map(([name, block]) => {
    const read = fb.readAs(fb.create(block.type, block.state, block.refs))
    const reads_as = { type: read.type, state: read.state, refs: read.refs, ...(read.settles ? { settles: read.settles } : {}), ...(read.outside ? { outside: read.outside } : {}), ...(read.retired ? { retired: true } : {}) }
    return { name, block, reads_as }
  })
  const draftRead = (name, group) => ({ name, blocks: group.blocks.map((b) => ({ name: b.name, hash: b.hash, block: b.block, signer: b.signer, signature: b.signature, reads_as: (({ type, state, refs }) => ({ type, state, refs }))(fb.readAs({ hash: b.hash, ...b.block })) })) })
  return { cases: out, groups: [draftRead(`draft words: ${EARLIER.deals[0].name}`, EARLIER.deals[0]), { ...draftRead(`draft words: ${EARLIER.circles[0].name}`, EARLIER.circles[0]), older_end: (({ block }) => { const read = fb.readAs(fb.create(block.type, block.state, block.refs)); return { block, reads_as: { type: read.type, status: read.state.status, stop: read.state.stop, updates: read.refs.updates } } })(EARLIER.circles[0].older_end) }] }
}

// ---- Sealed copies, headers and node messages ----
function messages() {
  const s = story(), ivy = s.person('ivo'), jon = s.person('jem'), holder = s.person('kiosk', { kind: 'machine' })
  // A node signs with a key of its holder, brought in by a key grant; there is no separate node actor.
  s.keep('the kiosk brings in its node key', keyGrant(holder.id, keyOf('kiosk_node').public_key_sign, { private_key: holder.key.private_key, last: null, broughtIn: holder.id }, { at: at() }), 'kiosk')
  const node = { id: holder.id, key: keyOf('kiosk_node') }
  const salts = { [jon.id]: sha('jem salt').slice(0, 32) }
  const note = s.say(ivy, 'a note sealed to jem', 'observe', { kind: 'note', text: 'two trays kept back', nonce: sha('note nonce').slice(0, 32) }, {}, { audience: [jon.id], salts })
  const fixed = { ephemeral: sha('ephemeral'), contentKey: sha('content key'), nonce: sha('nonce').slice(0, 24), keyNonces: [sha('key nonce').slice(0, 24)] }
  const message = fb.sealCopy(note, { keys: [jon.key.public_key_encrypt], reveals: [fb.revealFor(salts, jon.id)], privateKey: ivy.key.private_key, fixed })
  const opened = fb.openCopy(message, jon.key.x25519_private)
  assert.equal(opened.hash, note.hash)
  const sealed = [{ name: 'a private block sealed to one recipient, its reveal inside, its header signed', recipient: 'jem', signer: 'ivo', message, opens_to: { hash: note.hash, signature: note.signature, reveals: [fb.revealFor(salts, jon.id)] } }]
  const headers = s.out.filter((b) => b.block.state.seq !== undefined).map((b) => ({ name: b.name, hash: b.hash, header: fb.header({ hash: b.hash, ...b.block }), signer: b.signer, header_signature: fb.signMessage(fb.header({ hash: b.hash, ...b.block }), keyOf(b.signer).private_key).signature }))
  const pull = fb.sync.signPull({ since: 0, limit: 10, filter: { author: ivy.id } }, { asker: jon.id, node: node.id, privateKey: jon.key.private_key, nonce: sha('pull nonce').slice(0, 32), at: '2026-10-15T12:59:00.000Z' })
  assert.deepEqual(fb.sync.pullErrors(pull, { node: node.id, now: '2026-10-15T13:00:00.000Z', keys: [jon.key.public_key_sign] }), [])
  const log = s.held.map((block, i) => ({ n: i + 1, block, ...(block.hash === note.hash ? { copies: { [jon.id]: message }, header_signature: message.header_signature } : {}) }))
  const answer = fb.sync.answerPull(log, pull, { node: node.id, privateKey: node.key.private_key })
  const push = fb.sync.pushAnswer({ taken: [note.hash], waiting: [], refused: [{ hash: sha('a bad block'), code: 'bad_signature', detail: 'its signature opens with no key of its author' }], equivocations: [] }, { node: node.id, privateKey: node.key.private_key })
  const discovery = fb.sync.wellKnown({ node: node.id, holds: [ivy.id, jon.id], speaks_for: [ivy.id], admission: null, endpoints: { pull: 'https://node.example/pull', push: 'https://node.example/push' } })
  assert.deepEqual(fb.sync.wellKnownErrors(discovery), [])
  return { blocks: blocksOf(s), sealed, headers, messages: { node: node.id, node_signer: 'kiosk_node', signed_pull: { message: pull, signer: 'jem', now: '2026-10-15T13:00:00.000Z' }, pull_answer: { message: answer, matches: answer.blocks.length },
    push_answer: { message: push }, discovery, announcement: fb.sync.announcement(discovery) } }
}

// ---- Hashes: the earlier vectors, those in draft words marked ----
function markHashes() {
  return old.hashes.map((v) => {
    const { draft_words: _d, reads_as: _r, ...rest } = v
    const strict = codesOf(fb.refusals(v.block.type, v.block.state, v.block.refs))
    if (!strict.length) return rest
    const read = fb.readAs({ hash: v.hash, ...v.block })
    return { ...rest, draft_words: strict, reads_as: { type: read.type, state: read.state, refs: read.refs } }
  })
}

function canonicalVectors() {
  // UTF-16 order: U+1F373 (surrogates D83C DF73) sorts before U+FF61, though its code point is larger.
  const block = { type: 'thing', state: { '｡': 'halfwidth full stop', '\u{1F373}': 'cooking', a: 'first' }, refs: { after: ['｡', '\u{1F373}'] } }
  return [{ name: 'keys and ref sets sort by UTF-16 code units, not code points', block, canonical: fb.canonical(block.type, block.state, block.refs), hash: fb.hash(block.type, block.state, block.refs) }]
}

// ---- The final 1.6 pass: closed history stands, a micro genesis, a promise to yourself, real calendar times, a member invited again ----
function finalVectors(vectors) {
  // An older identity: a genesis without recovery, signed by its own key; its blocks without seq are history.
  const older = (s, name, time) => {
    const key = keyOf(name), g = fb.create('actor', { kind: 'person', public_key_sign: key.public_key_sign, at: time, audience: 'public' }, {})
    g.signature = fb.sign(g, key.private_key); s.keep(`${name}: an older genesis (no recovery)`, g, name)
    return { name, id: g.hash, key, g }
  }
  const history = (s, who, label, type, state, refs) => { const b = fb.create(type, state, { author: who.id, ...refs }); b.signature = fb.sign(b, who.key.private_key); return s.keep(label, b, who.name) }
  const first16 = (s, who, label, after) => s.keep(label, fb.write('observe', { kind: 'note', text: 'my first 1.6 block' }, {}, { author: who.id, key: who.key, held: s.held, at: at(), after }), who.name)
  const members = (state) => Object.keys(state.members).sort()
  const held = (list) => list.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))

  // A: an old membership, written before 1.6 in the old words (member, group, confirms), stands once history closes;
  // one slipped in after the founder's first 1.6 block does not. While history is open, both count.
  {
    const s = story(), fay = older(s, 'fay', '2026-03-01T00:00:00.000Z'), moe = older(s, 'moe', '2026-03-02T00:00:00.000Z'), nia = older(s, 'nia', '2026-03-03T00:00:00.000Z')
    const C = history(s, fay, 'the circle, before 1.6', 'actor', { kind: 'circle', name: 'Old bakery', at: '2026-03-04T00:00:00.000Z' }, {})
    const invite = history(s, fay, 'moe invited, in the old words (group, member)', 'grant', { kind: 'member', roles: ['orders'], at: '2026-03-05T00:00:00.000Z' }, { group: C.hash, member: moe.id })
    const join = history(s, moe, 'moe joins, in the old words (confirms)', 'grant', { kind: 'member', at: '2026-03-06T00:00:00.000Z' }, { group: C.hash, confirms: invite.hash })
    const slipped = history(s, fay, 'nia invited without seq, outside the closed history', 'grant', { kind: 'member', roles: ['orders'], at: '2026-03-07T00:00:00.000Z' }, { group: C.hash, member: nia.id })
    history(s, nia, 'nia joins (her history is open)', 'grant', { kind: 'member', at: '2026-03-08T00:00:00.000Z' }, { group: C.hash, confirms: slipped.hash })
    const open = blocksOf(s).slice()
    const closing = first16(s, fay, "fay's first 1.6 block: its causal past is her closed history", [C.hash, invite.hash])
    first16(s, moe, "moe's first 1.6 block, naming his join", [join.hash])
    const want = { open: [fay.id, moe.id, nia.id].sort(), closed: [fay.id, moe.id].sort() }
    assert.deepEqual(members(fb.circleState(C.hash, held(open))), want.open)
    assert.deepEqual(members(fb.circleState(C.hash, s.held)), want.closed)
    assert.equal(fb.sync.accept([invite], [fay.g, closing]).taken.length, 1, 'a grant in the closed history is taken')
    assert.deepEqual(codesOf(fb.sync.accept([slipped], [fay.g, closing]).refused), ['history_closed'], 'a grant outside it is refused')
    vectors.folds.circles.push(
      { name: 'open history counts: an older identity with no 1.6 block yet; its memberships without seq count', blocks: open, circle: C.hash, expected: { members: want.open, removed: [] } },
      { name: 'closed history stands: an old membership in the old words counts; one without seq outside the closed history does not', blocks: blocksOf(s), circle: C.hash, expected: { members: want.closed, removed: [] } })
    vectors.refusals.blocks.push(...blocksOf(s))
    vectors.refusals.cases.push({ name: 'a member grant without seq outside the closed history', by: 'accept', incoming: [slipped.hash], held: [fay.g.hash, closing.hash], codes: ['history_closed'] })
  }
  // F: a member removed and later invited again is in, by the new grant.
  {
    const s = story(), ida = s.person('ola'), joe = s.person('pia_m')
    const C = s.say(ida, 'the circle', 'actor', { kind: 'circle', name: 'Night market' })
    const one = s.say(ida, 'joe invited', 'grant', { kind: 'member', roles: ['orders'] }, { subject: C.hash, as: C.hash, to: joe.id })
    const yes = s.say(joe, 'joe says yes', 'grant', { kind: 'member', status: 'accepted' }, { answers: one.hash, subject: C.hash }, { after: [one.hash] })
    const out = s.say(ida, 'joe removed', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', last_counted: yes.hash }, { updates: one.hash, subject: C.hash, as: C.hash }, { after: [yes.hash] })
    const two = s.say(ida, 'joe invited again', 'grant', { kind: 'member', roles: ['orders'] }, { subject: C.hash, as: C.hash, to: joe.id }, { after: [out.hash] })
    s.say(joe, 'joe says yes again', 'grant', { kind: 'member', status: 'accepted' }, { answers: two.hash, subject: C.hash }, { after: [two.hash] })
    const expected = { members: { [ida.id]: ['admin'], [joe.id]: ['orders'] }, removed: [] }
    const got = fb.circleState(C, s.held)
    assert.deepEqual(Object.fromEntries(Object.entries(got.members).map(([who, m]) => [who, [...m.roles].sort()])), expected.members)
    assert.deepEqual(Object.keys(got.removed), [])
    vectors.folds.circles.push({ name: 'a member removed and later invited again is in, by the new grant', blocks: blocksOf(s), circle: C.hash, expected })
  }
  // C: a promise to yourself is accepted when made.
  {
    const s = story(), cook = s.person('quy')
    const self = s.say(cook, 'a promise to myself: the stock on by six', 'promise', { what: 'the stock on by six', terms: { expires: '2026-10-16T18:00:00.000Z' } }, { from: cook.id, to: cook.id })
    assert.equal(fb.promiseStage(self, s.held).stage, 'accepted')
    vectors.folds.promises.push({ name: 'a promise whose from and to both name its author is accepted when made', blocks: blocksOf(s), first: self.hash, expected: { stage: 'accepted', accept: self.hash } })
  }
  // B: a micro that only signs: a genesis without an encryption key, which adds one later by a key grant.
  {
    const s = story(), key = keyOf('probe'), recovery = keyOf('probe_recovery')
    const g = s.keep('probe: a genesis without an encryption key', genesis(key, { kind: 'machine', at: at(), recoveryKey: recovery.public_key_sign }), 'probe')
    assert.deepEqual(fb.check(g.type, g.state, g.refs), [])
    assert.equal(g.state.public_key_encrypt, undefined)
    s.keep('probe adds an encryption key by a key grant', keyGrant(g.hash, null, { private_key: key.private_key, last: null, broughtIn: g.hash }, { encrypt: key.public_key_encrypt, at: at() }), 'probe')
    const signed_by_author = Object.fromEntries(s.held.map((block) => [block.hash, signedByAuthor(block, s.held)]))
    assert.ok(Object.values(signed_by_author).every(Boolean))
    vectors.identities.push({ name: 'a micro that only signs: its genesis leaves out the encryption key and adds one later by a key grant', id: g.hash, blocks: blocksOf(s), signed_by_author, keys: [key.public_key_sign] })
  }
  // E: times and dates are real calendar values.
  {
    const author = keyOf('mae') && vectors.refusals.blocks.find((b) => b.name === 'mae: genesis').hash
    const note = (state, label) => ({ type: 'observe', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'note', ...state }, refs: { author, prev: author }, label })
    for (const { label, ...block } of [note({ at: '2026-02-30T12:00:00.000Z' }, 'a time on 30 February'), note({ at: '2026-10-15T24:00:00.000Z' }, 'a time at 24:00'),
      { type: 'thing', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'eggs', use_by: '2026-02-30' }, refs: { author, prev: author }, label: 'a date on 30 February' }]) {
      const codes = codesOf(fb.refusals(block.type, block.state, block.refs))
      assert.deepEqual(codes, ['calendar'], label)
      vectors.refusals.cases.push({ name: label, by: 'check', block, codes })
    }
  }
}

// ---- The codes pass: two blocks at one seq, a key-grant pair, crossing allocations, per-unit rounding, dotted types ----
function codesVectors(vectors) {
  const held = (list) => list.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))
  const authored = (id, list) => Object.fromEntries(list.filter((block) => block.hash === id || block.refs?.author === id).map((block) => [block.hash, signedByAuthor(block, list)]))
  const stage = (s, first) => fb.promiseStage(s.held.find((block) => block.hash === first), s.held)
  // A: two blocks at one seq. Both are kept as proof and both are the author's in the identity fold; outside it,
  // neither counts, nor any later block of that key. Pushed, the second is neither taken nor refused: it is listed in
  // its pair.
  {
    const s = story(), ann = s.person('vera'), bob = s.person('walt')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' }), milk = s.say(ann, 'the kind: milk', 'thing', { kind: 'milk' })
    const offer = s.say(ann, 'the offer: a tray for 4.50', 'promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('1', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const offer2 = s.say(ann, 'a second offer: a litre of milk for 1.20', 'promise', { terms: { price: fb.money(120, 'GBP'), quantity: fb.amount('1', 'L'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: milk.hash })
    const yes = s.say(bob, 'walt accepts the eggs', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash] })
    const no = s.say(bob, 'walt declines the eggs at the same seq: a fork', 'promise', { status: 'declined' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash], link: { seq: yes.state.seq, prev: yes.refs.prev } })
    const later = s.say(bob, 'walt accepts the milk after the fork: it counts for nothing', 'promise', { status: 'accepted' }, { answers: offer2.hash, for: offer2.hash }, { after: [offer2.hash], link: { seq: yes.state.seq + 1, prev: yes.hash } })
    assert.deepEqual([stage(s, offer.hash).stage, stage(s, offer.hash).accept, stage(s, offer2.hash).stage], ['offered', null, 'offered'])
    const got = fb.sync.accept([no], s.held.filter((block) => block !== no))
    const pair = [yes.hash, no.hash].sort()
    assert.deepEqual([got.taken, got.refused, got.equivocations], [[], [], [pair]])
    const signed_by_author = authored(bob.id, s.held)
    assert.deepEqual([signed_by_author[yes.hash], signed_by_author[no.hash], signed_by_author[later.hash]], [true, true, true])
    vectors.folds.promises.push(
      { name: 'two blocks at one seq: neither binds anyone else, so the offer stands unanswered', blocks: blocksOf(s), first: offer.hash, expected: { stage: 'offered', accept: null } },
      { name: 'a later block of a key that signed two at one seq counts for nothing', blocks: blocksOf(s), first: offer2.hash, expected: { stage: 'offered', accept: null } })
    vectors.identities.push({ name: 'two blocks at one seq are both the author\'s in the identity fold', id: bob.id, blocks: blocksOf(s), signed_by_author, keys: fb.identity.keysOf(bob.id, s.held).sort(), history: 'none' })
    vectors.refusals.cases.push({ name: 'the second of two blocks at one seq is neither taken nor refused: it is listed in its pair', by: 'accept', incoming: [no.hash], held: s.held.filter((block) => block !== no).map((block) => block.hash), codes: [], taken: [], equivocations: [pair] })
  }
  // B: two key grants at one seq of one key (a fork that rotates nothing): Conflict. The keys they bring in freeze;
  // a recovery rotation of that key settles it, and the key in its causal past speaks.
  {
    const s = story(), p = s.person('xena'), a = keyOf('xena_a'), b = keyOf('xena_b')
    const gA = s.keep('a key grant bringing in key a', keyGrant(p.id, a.public_key_sign, { private_key: p.key.private_key, last: null, broughtIn: p.id }, { at: at() }), 'xena')
    const gB = s.keep('a key grant at the same seq bringing in key b: a fork', keyGrant(p.id, b.public_key_sign, { private_key: p.key.private_key, last: null, broughtIn: p.id }, { at: at() }), 'xena')
    const fromA = s.say(p, 'key a speaks', 'observe', { kind: 'note', text: 'a' }, {}, { key: 'xena_a', link: { seq: 1, prev: gA.hash } })
    const before = blocksOf(s).slice(), frozen = held(before)
    let state = fb.identityState(p.id, frozen)
    assert.deepEqual([state.frozen, state.signed_by_author[gA.hash], state.signed_by_author[gB.hash], state.signed_by_author[fromA.hash]], [[a.public_key_sign, b.public_key_sign].sort(), true, true, false])
    const pushed = fb.sync.accept([fromA], frozen.filter((block) => block.hash !== fromA.hash))
    assert.deepEqual(codesOf(pushed.refused), ['void_key'])
    vectors.identities.push({ name: 'two key grants at one seq freeze the keys they bring in, whether or not they rotate', id: p.id, blocks: before, signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
    vectors.refusals.cases.push({ name: 'a block signed by a frozen key: a key of its author that does not speak', by: 'accept', incoming: [fromA.hash], held: before.filter((b) => b.hash !== fromA.hash).map((b) => b.hash), codes: ['void_key'] })
    s.keep('the recovery key rotates the forked key, having seen key a\'s grant', keyGrant(p.id, keyOf('xena_new').public_key_sign, { private_key: p.recovery.private_key, recoveryKey: p.recovery.public_key_sign, last: null }, { replaces: p.key.public_key_sign, lastGood: gA.hash, after: [gA.hash], at: at() }), 'xena_recovery')
    state = fb.identityState(p.id, s.held)
    assert.deepEqual([state.frozen, state.signed_by_author[fromA.hash]], [[b.public_key_sign], true])
    vectors.identities.push({ name: 'a recovery rotation settles a key-grant pair: the key in its causal past speaks, the other stays frozen', id: p.id, blocks: blocksOf(s), signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
  }
  // C: two allocations that do not see each other (two of the offerer's keys): neither counts.
  {
    const s = story(), ann = s.person('yara'), c1 = s.person('zane'), c2 = s.person('abby')
    s.keep('yara brings in a laptop key', keyGrant(ann.id, keyOf('yara_laptop').public_key_sign, { private_key: ann.key.private_key, last: null, broughtIn: ann.id }, { at: at() }), 'yara')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'an open offer: ten trays to anyone', 'promise', { terms: { price: { money: fb.money(225, 'GBP'), per: fb.amount('1', '{tray}') }, quantity: fb.amount('10', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, what: eggs.hash })
    const r1 = s.say(c1, 'zane asks for four', 'promise', { status: 'accepted', terms: { quantity: fb.amount('4', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: c1.id }, { after: [offer.hash] })
    const r2 = s.say(c2, 'abby asks for two', 'promise', { status: 'accepted', terms: { quantity: fb.amount('2', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: c2.id }, { after: [offer.hash] })
    const a1 = s.say(ann, 'the allocation to zane (phone)', 'promise', { status: 'accepted' }, { answers: r1.hash, for: offer.hash }, { after: [r1.hash] })
    const a2 = s.say(ann, 'the allocation to abby (laptop), not seeing it', 'promise', { status: 'accepted' }, { answers: r2.hash, for: offer.hash }, { after: [r2.hash], key: 'yara_laptop' })
    const expected = { stage: 'offered', accept: null, takers: [], forks: [a1.hash, a2.hash].sort() }
    const got = stage(s, offer.hash)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, key)
    vectors.folds.promises.push({ name: 'two allocations that do not see each other prove a lie: neither counts', blocks: blocksOf(s), first: offer.hash, expected })
  }
  // D: a per-unit total rounds to the nearest minor unit, halves up: 25 a kilo for half a kilo is 13.
  {
    const s = story(), ann = s.person('bret'), bob = s.person('cara')
    const flour = s.say(ann, 'the kind: flour', 'thing', { kind: 'flour' })
    const offer = s.say(ann, 'half a kilo at 0.25 a kilo', 'promise', { terms: { price: { money: fb.money(25, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('0.5', 'kg'), expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, to: bob.id, what: flour.hash })
    s.say(bob, 'yes', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash] })
    const expected = { stage: 'accepted', quantity: fb.amount('0.5', 'kg'), total: fb.money(13, 'GBP') }
    const got = stage(s, offer.hash)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, key)
    vectors.folds.promises.push({ name: 'a per-unit total rounds to the nearest minor unit, halves up', blocks: blocksOf(s), first: offer.hash, expected })
  }
  // E: a type name with no row, written base.rest, reads as base with state.kind rest, never overwriting the block's
  // own kind (types_dotted). It is read, never written.
  for (const [name, block, want] of [
    ['types_dotted: an unknown base.rest never overwrites the block\'s own kind', { type: 'observe.fridge_log', state: { kind: 'temperature' }, refs: {} }, { type: 'observe', kind: 'temperature' }],
    ['types_dotted: a base that is a type row reads as that row, with the kind after the dot', { type: 'substance.flour', state: {}, refs: {} }, { type: 'thing', kind: 'flour' }]]) {
    const read = fb.readAs(fb.create(block.type, block.state, block.refs))
    assert.deepEqual({ type: read.type, kind: read.state.kind }, want, name)
    vectors.reads.cases.push({ name, block, reads_as: { type: read.type, state: read.state, refs: read.refs, ...(read.settles ? { settles: read.settles } : {}), ...(read.outside ? { outside: read.outside } : {}), ...(read.retired ? { retired: true } : {}) } })
  }
  // F: held keys (custody). A person with a basic phone: a co-op holds her key, and her genesis says so
  // (state.custodian). The co-op signs on her word, naming the channel and the raw message. Later she takes her key: a
  // key grant to a key on her own device rotates the held key out, and her record stays one chain, hers.
  {
    const s = story(), coop = s.person('ngozi_coop'), key = keyOf('ama'), recovery = keyOf('ama_recovery')
    const g = genesis(key, { at: at(), recoveryKey: recovery.public_key_sign, custodian: coop.id })
    assert.deepEqual(fb.refusals(g.type, g.state, g.refs), [], 'a custodial genesis passes the write check')
    s.keep('ama: a genesis whose key the co-op holds (state.custodian)', g, 'ama')
    const ama = { name: 'ama', id: g.hash, key }
    const raw = sha('sms from +234 800 000 0000: 2 trays of eggs for Saturday')
    const said = s.say(ama, 'the co-op signs on her word, by SMS: the channel and the raw message named', 'observe', { kind: 'note', text: '2 trays of eggs for Saturday', channel: 'sms' }, { derives_from: raw })
    const phone = keyOf('ama_phone')
    const moved = s.keep('ama takes her key: a key grant to her own phone rotates the held key out', fb.identity.takeKeys(ama.id, phone.public_key_sign, { private_key: key.private_key, last: said }, { heldKey: key.public_key_sign, lastGood: said.hash, at: at() }), 'ama')
    const own = s.say(ama, 'ama speaks from her own phone', 'observe', { kind: 'note', text: 'eggs collected' }, {}, { key: 'ama_phone' })
    const state = fb.identityState(ama.id, s.held)
    assert.deepEqual([state.signed_by_author[said.hash], state.signed_by_author[moved.hash], state.signed_by_author[own.hash], state.keys], [true, true, true, [key.public_key_sign, phone.public_key_sign].sort()])
    vectors.identities.push({ name: 'held keys: a custodial genesis, a block the custodian signed on the person\'s word by SMS, and the keys moved to her own device', id: ama.id, blocks: blocksOf(s), signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
  }
  {
    const author = vectors.refusals.blocks.find((b) => b.name === 'mae: genesis').hash
    const block = { type: 'observe.fridge_log', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'temperature' }, refs: { author, prev: author } }
    const codes = codesOf(fb.refusals(block.type, block.state, block.refs))
    assert.deepEqual(codes, ['unknown_type'])
    vectors.refusals.cases.push({ name: 'a dotted type is read, never written', by: 'check', block, codes })
  }
}

// ---- The custody pass: a custodian-held key grant, the limit fence, an admission deposit, a push for two ----
// Written last, after every other section, so every earlier block keeps its time and its hash.
function custodyVectors(vectors) {
  const fixedFor = (label, count) => ({ ephemeral: sha(`${label} ephemeral`), contentKey: sha(`${label} content key`), nonce: sha(`${label} nonce`).slice(0, 24), keyNonces: Array.from({ length: count }, (_, i) => sha(`${label} key nonce ${i}`).slice(0, 24)) })
  const standing = (id, s) => fb.identityState(id, s.held)
  // A: a key grant that names the custodian: a co-op holds a SIM phone's key for her. She takes her keys with her
  // recovery key: the held key is rotated out, what the co-op signed before stands, and her record stays one chain.
  {
    const s = story(), coop = s.person('mimi_coop'), mimi = s.person('mimi'), held = keyOf('mimi_sim'), own = keyOf('mimi_own')
    const grant = s.keep('mimi lets the co-op hold a key for her SIM phone: a key grant that names the custodian', keyGrant(mimi.id, held.public_key_sign, { private_key: mimi.key.private_key, last: null, broughtIn: mimi.id }, { custodian: coop.id, at: at() }), 'mimi')
    assert.equal(grant.state.custodian, coop.id)
    assert.deepEqual(fb.refusals(grant.type, grant.state, grant.refs), [], 'a custodial key grant passes the write check')
    const said = s.say(mimi, 'the co-op signs on her word, by voice: the channel and the raw message named', 'observe', { kind: 'note', text: 'a dozen eggs for Friday', channel: 'voice' }, { derives_from: sha('voice message from +234 800 000 0001') }, { key: 'mimi_sim', link: { seq: 1, prev: grant.hash } })
    const taken = s.keep('mimi takes her keys: her recovery key rotates the held key out for her own device key', fb.identity.takeKeys(mimi.id, own.public_key_sign, { private_key: mimi.recovery.private_key, recoveryKey: mimi.recovery.public_key_sign, last: null }, { heldKey: held.public_key_sign, lastGood: said.hash, at: at() }), 'mimi_recovery')
    assert.equal(taken.state.custodian, undefined)
    const mine = s.say(mimi, 'mimi speaks from her own device', 'observe', { kind: 'note', text: 'eggs collected' }, {}, { key: 'mimi_own', link: { seq: 1, prev: taken.hash } })
    const state = standing(mimi.id, s)
    assert.deepEqual([state.signed_by_author[said.hash], state.signed_by_author[mine.hash]], [true, true])
    assert.ok(state.keys.includes(own.public_key_sign))
    vectors.identities.push({ name: 'held keys: a key grant names the custodian; the person takes her keys with her recovery key, and what the custodian signed stands', id: mimi.id, blocks: blocksOf(s), signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
  }
  // B: the limit is the principal's fence. The grant shows the agent's acts and when it ends, never the limit. The limit
  // is an observe of kind limit `for` the grant, sealed to the agent alone; the grant check never reads it.
  {
    const s = story(), opal = s.person('opal'), bot = s.person('opal_agent', { kind: 'agent' })
    s.say(opal, 'opal answers for her agent', 'grant', { kind: 'operator' }, { to: bot.id })
    const grant = s.say(opal, 'what the agent may do: the visible scope, with no limit in it', 'grant', { kind: 'shop', scope: { acts: ['observe.note'], until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const act = s.say(bot, 'the agent writes under the grant', 'observe', { kind: 'note', text: 'ordered flour' }, { under: grant.hash })
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held), [])
    const fence = fb.grant.limitFence(grant.hash, bot.id, { limit: fb.money(5000, 'GBP'), per: 'P7D' })
    const salts = { [bot.id]: sha('opal fence salt').slice(0, 32) }
    const limit = s.say(opal, 'the limit, for the grant: 50.00 a week, sealed to the agent alone', fence.type, { ...fence.state, nonce: sha('opal fence nonce').slice(0, 32) }, fence.refs, { audience: fence.audience, salts })
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held), [], 'the grant check never reads the limit')
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held.filter((block) => block !== limit)), [])
    assert.ok(fb.findsSelf(limit, bot.id, salts[bot.id]) && !fb.findsSelf(limit, opal.id, salts[bot.id]))
    const message = fb.sealCopy(limit, { keys: [bot.key.public_key_encrypt], reveals: [fb.revealFor(salts, bot.id)], privateKey: opal.key.private_key, fixed: fixedFor('opal fence', 1) })
    assert.equal(fb.openCopy(message, bot.key.x25519_private).hash, limit.hash)
    const within = [[2000, 3000, 'GBP', true], [2000, 3001, 'GBP', false], [0, 1, 'EUR', false]].map(([spent, minor, currency, ok]) => {
      assert.equal(fb.grant.withinLimit(limit, fb.money(minor, currency), spent), ok)
      return { spent, money: fb.money(minor, currency), within: ok }
    })
    const state = standing(bot.id, s), ours = standing(opal.id, s)
    vectors.sealed.cases.push({ name: 'the limit observe for a grant is sealed to the agent alone', recipient: 'opal_agent', signer: 'opal', message, opens_to: { hash: limit.hash, signature: limit.signature, reveals: [fb.revealFor(salts, bot.id)] } })
    vectors.identities.push({ name: 'the limit is the principal\'s fence: an observe of kind limit for the grant, sealed to the agent; the grant check never reads it', id: bot.id, blocks: blocksOf(s), signed_by_author: { ...state.signed_by_author, ...ours.signed_by_author }, keys: state.keys, operators: [opal.id], under: { [act.hash]: true },
      fence: { block: limit.hash, grant: grant.hash, agent: bot.id, principal: opal.id, salt: salts[bot.id], limit: fence.state.limit, per: fence.state.per, within } })
  }
  // C: the owner's admission rule with a deposit: { money, holder }. Only the shape is checked; no money is handled.
  {
    const s = story(), pia = s.person('pia'), friend = s.person('pia_friend'), holder = s.person('pia_holder')
    const rule = s.say(pia, 'the admission rule: a friend always, three blocks a day from anyone else, and a 1.00 deposit held by pia_holder', 'observe', { kind: 'admission', parties: [friend.id], per_stranger: 3, deposit: { money: fb.money(100, 'GBP'), holder: holder.id } })
    const state = standing(pia.id, s)
    assert.deepEqual(state.signed_by_author[rule.hash], true)
    vectors.identities.push({ name: 'an admission rule may carry a deposit { money, holder }', id: pia.id, blocks: blocksOf(s), signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
  }
  // D: a push whose `for` maps a sealed copy's hash to a list of ids. An older single id reads as a list of one.
  {
    const s = story(), quin = s.person('quin'), rae = s.person('rae'), sol = s.person('sol')
    const salts = { [rae.id]: sha('rae push salt').slice(0, 32), [sol.id]: sha('sol push salt').slice(0, 32) }
    const note = s.say(quin, 'a note sealed to rae and sol', 'observe', { kind: 'note', text: 'oven at 6', nonce: sha('quin push nonce').slice(0, 32) }, {}, { audience: [rae.id, sol.id], salts })
    const message = fb.sealCopy(note, { keys: [rae.key.public_key_encrypt, sol.key.public_key_encrypt], reveals: [fb.revealFor(salts, rae.id), fb.revealFor(salts, sol.id)], privateKey: quin.key.private_key, fixed: fixedFor('quin push', 2) })
    const ids = [rae.id, sol.id].sort()
    const request = fb.sync.pushRequest([message], { [note.hash]: ids })
    assert.deepEqual(request.for[note.hash], ids)
    assert.deepEqual(fb.sync.pushRequest([message], { [note.hash]: rae.id }).for[note.hash], [rae.id])
    vectors.sealed.blocks.push(...blocksOf(s))
    for (const who of [rae, sol]) vectors.sealed.cases.push({ name: `a copy sealed to two recipients opens for ${who.name}`, recipient: who.name, signer: 'quin', message, opens_to: { hash: note.hash, signature: note.signature, reveals: [fb.revealFor(salts, rae.id), fb.revealFor(salts, sol.id)] } })
    vectors.messages.push = { name: 'a push names, for each sealed copy, the list of ids it is for; an older single id reads as a list of one', request, hash: note.hash, recipients: ids, older_for: { [note.hash]: rae.id }, older_reads_as: { [note.hash]: [rae.id] } }
  }
  // E: shapes every node must refuse.
  {
    const author = vectors.refusals.blocks.find((b) => b.name === 'mae: genesis').hash
    const base = { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public' }
    const refs = { author, prev: author }
    for (const [name, state, want] of [
      ['an admission deposit names who holds the money', { ...base, kind: 'admission', deposit: { money: fb.money(100, 'GBP') } }, ['shape']],
      ['an admission deposit\'s holder is an id', { ...base, kind: 'admission', deposit: { money: fb.money(100, 'GBP'), holder: 'the bank' } }, ['grammar']],
      ['a limit is money, never a bare number', { ...base, kind: 'limit', limit: 5000 }, ['shape']],
      ['a limit\'s period is a duration', { ...base, kind: 'limit', limit: fb.money(5000, 'GBP'), per: 'weekly' }, ['time']],
      ['a channel is one of the closed list', { ...base, kind: 'note', channel: 'carrier pigeon' }, ['shape']]]) {
      const codes = codesOf(fb.refusals('observe', state, refs))
      assert.deepEqual(codes, want, name)
      vectors.refusals.cases.push({ name, by: 'check', block: { type: 'observe', state, refs }, codes })
    }
    const genesisState = { kind: 'person', at: '2026-10-15T12:00:00.000Z', audience: 'public', public_key_sign: keyOf('mae').public_key_sign, recovery_key_hash: recoveryKeyHash(keyOf('mae_recovery').public_key_sign), recovery_reach: 'P30D', custodian: 'the co-op' }
    const codes = codesOf(fb.refusals('actor', genesisState, {}))
    assert.deepEqual(codes, ['grammar'])
    vectors.refusals.cases.push({ name: 'a custodian is an id', by: 'check', block: { type: 'actor', state: genesisState, refs: {} }, codes })
  }
}

const deals = [dealVector()]
const circles = [circleVector()]
{ const got = fb.promiseStage(deals[0].blocks.find((b) => b.hash === deals[0].first) && { hash: deals[0].first, ...deals[0].blocks.find((b) => b.hash === deals[0].first).block }, deals[0].blocks.map((b) => ({ hash: b.hash, ...b.block }))); assert.equal(got.stage, 'accepted') }
const circleFoldsOut = circleFolds()
const vectors = {
  $comment: 'FoodBlock 1.6 conformance vectors (protocol.md, Conformance). Built by the reference SDK (sdk/javascript/test/make-vectors.cjs) from fixed seeds and times; spec/run-vectors.cjs checks every section. A conforming node reproduces every canonical string, hash and signature, opens every envelope, refuses every refusal, reads every alias row and agrees on every fold. Test keys come from fixed seeds: never use them for anything real. Placeholder hashes are sha256 of a label. Sections: keys; hashes (earlier blocks; those in the draft-1.6 words carry draft_words, the codes the strict check finds, and reads_as); canonical; audience; signatures; bad_signatures; envelopes (older ones carry key_hash, which a reader ignores); sealed; headers; identities; deals; circles; folds (promises, circles, audience, things, successors, rekeys, ballots); refusals (each case with the codes from protocol.json refusals.codes; an accept case may list taken and equivocations); reads (one per alias row, and the earlier deal and circle in draft words); messages.',
  keys,
  hashes: markHashes(),
  canonical: canonicalVectors(),
  audience: old.audience,
  signatures: old.signatures,
  bad_signatures: old.bad_signatures,
  envelopes: old.envelopes.map((v) => ({ ...v, legacy: 'an older envelope: it names key_hash, which a reader ignores' })),
  identities: [...EARLIER.identities, ...identityVectors()],
  deals,
  circles,
  folds: { promises: promiseFolds(), circles: circleFoldsOut.circles, audience: circleFoldsOut.audience, things: [thingFolds()], successors: successorFolds(), rekeys: rekeyFolds(), ballots: ballotFolds() },
  refusals: refusals(),
  reads: reads(),
  ...(() => { const m = messages(); return { sealed: { blocks: m.blocks, cases: m.sealed }, headers: m.headers, messages: m.messages } })()
}
// The 1.6 final pass, written last so every earlier block keeps its time and its hash.
finalVectors(vectors)
codesVectors(vectors)
custodyVectors(vectors)
fs.writeFileSync(FILE, JSON.stringify(vectors, null, 1) + '\n')
console.log(`wrote ${FILE}`)
