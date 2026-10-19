// Adds to spec/vectors.json the cases of "the 1.6 revisions after the audit" (CHANGELOG.md): `node test/make-vectors-refine.cjs`.
// Idempotent: a case it made is replaced by name, never repeated. Every expectation is written here by hand and checked
// against the Rust core (through this SDK) before the file is written; the oracle (spec/oracle) then checks the file
// against an implementation written from the spec text alone. Run it after `node scripts/build-wasm.cjs`.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')
const { genesis } = fb.identity

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name) => {
  if (keys[name]) return keys[name]
  const kp = fb.keypairFromSeed(sha(`foodblock 1.6 refine vectors: ${name}`), 'std')
  keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign }
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 19, 12, 0, 0) + 1000 * tick++).toISOString()
const DAY = '2026-12-20T00:00:00.000Z', LATER = '2027-12-31T00:00:00.000Z'
const M = (minor, currency = 'GBP') => fb.money(minor, currency)
const sorted = (list) => [...list].sort()

function story() {
  const held = []
  const keep = (block) => { held.push(block); return block }
  const person = (name, { kind = 'person' } = {}) => {
    const g = keep(genesis(keyOf(name), { kind, at: at() }))
    return { name, id: g.hash, g }
  }
  const say = (who, type, state, refs = {}, { after, link, audience = 'public' } = {}) => {
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    return keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held, at: at(), audience, after, link }))
  }
  // A block composed, chained and signed without the write check: what a node must still read, though it would refuse it.
  const raw = (who, type, state, refs = {}) => {
    const mine = held.filter((b) => b.refs && b.refs.author === who.id)
    const link = { seq: (mine.length ? mine[mine.length - 1].state.seq : 0) + 1, prev: mine.length ? mine[mine.length - 1].hash : who.id }
    const c = fb.compose(type, state, refs, { author: who.id, at: at(), audience: 'public', link })
    return keep({ ...c, signature: fb.sign(c, keyOf(who.name).private_key) })
  }
  const without = (...blocks) => held.filter((b) => !blocks.includes(b))
  return { held, person, say, keep, raw, without }
}

const made = new Set()
const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? b !== null && Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true))
// A door case: the op, its arguments, and what it must give (a subset match unless `exact`).
function door(name, op, args, { expect, exact } = {}) {
  args = JSON.parse(JSON.stringify(args))
  const got = call(op, ...args)
  if (expect !== undefined) { try { exact ? assert.deepEqual(got, expect) : subset(got, expect) } catch (e) { throw new Error(`${name}: ${e.message}\n got ${JSON.stringify(got).slice(0, 600)}`) } }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}) })
  return got
}
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
// A check case: the refusal the bytes of a block give, with nothing held.
function check(name, block, codes) {
  const got = call('refusals', block.type, block.state, block.refs, [], null)
  assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  made.add(name)
  V.refusals.cases = V.refusals.cases.filter((c) => c.name !== name)
  V.refusals.cases.push({ name, by: 'check', block: { type: block.type, state: block.state, refs: block.refs }, codes })
}
const stage = (name, first, held, expect) => door(name, 'promise_stage', [first, held, {}], { expect })

// ---- 1. A block speaks for one party: a circle's side is signed by someone who may sign for it ----
{
  const s = story(), ann = s.person('rann'), bea = s.person('rbea'), gus = s.person('rgus'), eve = s.person('reve'), rita = s.person('rrita'), sam = s.person('rsam')
  const cafe = s.say(ann, 'actor', { kind: 'circle', name: 'Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'manager', powers: ['sign'] }, { name: 'guest', powers: [] }] })
  const join = (p, roles) => { const g = s.say(ann, 'grant', { kind: 'member', roles }, { subject: cafe.hash, to: p.id, as: cafe.hash }); s.say(p, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: cafe.hash }); return g }
  join(bea, ['manager']); join(gus, ['guest']); const ritaGrant = join(rita, ['manager'])
  const eggs = s.say(sam, 'thing', { kind: 'eggs' })
  const offerTo = (price) => s.say(sam, 'promise', { terms: { price: M(price), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: sam.id, to: cafe.hash, what: eggs.hash })
  const answer = (who, offer, state, extra = {}) => s.say(who, 'promise', state, { answers: offer.hash, for: offer.hash, after: [offer.hash], ...extra })
  const accepted = { status: 'accepted' }
  // a valid member, an outsider, a member without the sign power
  const o1 = offerTo(450), a1 = answer(bea, o1, accepted, { as: cafe.hash })
  stage('circle-signed deal: a member with the sign power accepts as the circle: it binds', o1, s.held, { stage: 'accepted', accept: a1.hash })
  const o2 = offerTo(460), a2 = answer(eve, o2, accepted, { as: cafe.hash })
  stage('circle-signed deal: an outsider accepts as the circle: it binds no one', o2, s.held, { stage: 'offered', accept: null })
  const o3 = offerTo(470), a3 = answer(gus, o3, accepted, { as: cafe.hash })
  stage('circle-signed deal: a member without the sign power accepts as the circle: it binds no one', o3, s.held, { stage: 'offered', accept: null })
  assert.equal(call('may_act_as', a2, cafe.hash, s.held, null), false)
  assert.equal(call('may_act_as', a1, cafe.hash, s.held, null), true)
  // a removed member: her accept before the cut binds, the one after it does not
  const o4 = offerTo(480), r1 = answer(rita, o4, accepted, { as: cafe.hash })
  const o5 = offerTo(490)
  const cut = s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: r1.hash }, { updates: ritaGrant.hash, subject: cafe.hash, as: cafe.hash, after: [r1.hash] })
  const r2 = answer(rita, o5, accepted, { as: cafe.hash, after: [o5.hash] })
  stage('circle-signed deal: a removed member\'s accept inside the cut binds', o4, s.held, { stage: 'accepted', accept: r1.hash })
  stage('circle-signed deal: a removed member\'s accept after the cut binds no one', o5, s.held, { stage: 'offered', accept: null })
  assert.equal(call('may_act_as', r2, cafe.hash, s.held, null), false)
  // the circle's own offer: a member with the sign power makes it, an outsider forges it
  const real = s.say(bea, 'promise', { terms: { price: M(500), expires: DAY } }, { from: cafe.hash, to: sam.id, what: eggs.hash, as: cafe.hash })
  const forged = s.say(eve, 'promise', { terms: { price: M(1), expires: DAY } }, { from: cafe.hash, to: sam.id, what: eggs.hash, as: cafe.hash })
  stage('circle-signed deal: a circle\'s offer signed by a member with the sign power is offered', real, s.held, { stage: 'offered' })
  door('circle-signed deal: an offer signed as the circle by an outsider speaks for neither side: no stage', 'promise_stage', [forged, s.held, {}], { expect: null, exact: true })
  const sAccept = answer(sam, real, accepted)
  stage('circle-signed deal: the other side accepts the member\'s offer: it binds', real, s.held, { stage: 'accepted', accept: sAccept.hash })
  const sForged = answer(sam, forged, accepted)
  door('circle-signed deal: nothing binds an outsider\'s forged offer', 'promise_stage', [forged, s.held, {}], { expect: null, exact: true })
  // a stop signed as the circle by an outsider stops nothing; a member's stops it
  const o6 = s.say(bea, 'promise', { terms: { price: M(510), expires: DAY } }, { from: cafe.hash, to: sam.id, what: eggs.hash, as: cafe.hash })
  s.say(eve, 'promise', { status: 'stopped', stop: 'before' }, { updates: o6.hash, for: o6.hash, as: cafe.hash, after: [o6.hash] })
  stage('circle-signed deal: an outsider\'s stop signed as the circle stops nothing', o6, s.held, { stage: 'offered' })
  s.say(bea, 'promise', { status: 'stopped', stop: 'before' }, { updates: o6.hash, for: o6.hash, as: cafe.hash, after: [o6.hash] })
  stage('circle-signed deal: a member\'s stop signed as the circle stops it', o6, s.held, { stage: 'stopped', stop: 'before' })
}

// ---- 2. The maker of a thing made `as` a circle is the circle ----
{
  const s = story(), ann = s.person('oann'), bea = s.person('obea'), eve = s.person('oeve'), cal = s.person('ocal')
  const cafe = s.say(ann, 'actor', { kind: 'circle', name: 'Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'baker', powers: ['sign'] }] })
  const g = s.say(ann, 'grant', { kind: 'member', roles: ['baker'] }, { subject: cafe.hash, to: bea.id, as: cafe.hash })
  s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: cafe.hash })
  const kind = s.say(bea, 'thing', { kind: 'share', name: 'Cafe share' }, { as: cafe.hash })
  const share = s.say(bea, 'thing', { kind: 'share', lot: 'S1' }, { of: kind.hash, as: cafe.hash })
  const own = (name, thing, owner, extra = {}) => door(name, 'ownership', [thing, s.held], { expect: { owner, ...extra } })
  own('ownership: a share a member made as the circle belongs to the circle, not to the member', share, cafe.hash)
  const own2 = s.say(bea, 'thing', { kind: 'share', lot: 'S2' }, { of: kind.hash })
  own('ownership: the same share made in the member\'s own name is the member\'s', own2, bea.id)
  // the member gives it away as the circle; the receiver accepts
  const give = s.say(bea, 'transfer', {}, { what: share.hash, to_owner: cal.id, as: cafe.hash })
  own('ownership: a transfer signed as the circle waits for the receiver', share, cafe.hash)
  s.say(cal, 'transfer', { status: 'accepted' }, { answers: give.hash })
  own('ownership: the receiver accepts: the share is hers', share, cal.id, { transfers: [give.hash] })
  // an outsider cannot give away the circle\'s share by signing as the circle
  const stock = s.say(bea, 'thing', { kind: 'share', lot: 'S3' }, { of: kind.hash, as: cafe.hash })
  const steal = s.say(eve, 'transfer', {}, { what: stock.hash, to_owner: eve.id, as: cafe.hash })
  s.say(eve, 'transfer', { status: 'accepted' }, { answers: steal.hash })
  own('ownership: an outsider\'s transfer signed as the circle moves nothing', stock, cafe.hash, { transfers: [] })
  // nor can an outsider make stock for the circle: the block speaks for no one, so there is no owner
  const fake = s.say(eve, 'thing', { kind: 'share', lot: 'S4' }, { of: kind.hash, as: cafe.hash })
  door('ownership: a thing made as a circle by an outsider has no maker and no owner', 'ownership', [fake, s.held], { expect: { owner: null, transfers: [], conflict: null }, exact: true })
  // a circle-owned thing is where the circle's member moved it
  const shelf = s.say(bea, 'thing', { kind: 'shelf' }, { as: cafe.hash })
  s.say(bea, 'transfer', {}, { what: share.hash, to_place: shelf.hash, as: cafe.hash })
  s.say(bea, 'transfer', {}, { what: stock.hash, to_place: shelf.hash, as: cafe.hash })
  door('where_now: stock the circle owns is moved by a member signing as the circle', 'where_now', [stock, s.held], { expect: [shelf.hash], exact: true })
  const wander = s.say(eve, 'transfer', {}, { what: stock.hash, to_place: eve.id, as: cafe.hash })
  door('where_now: a move signed as the circle by an outsider does not count', 'where_now', [stock, s.held], { expect: [shelf.hash], exact: true })
}

// ---- 3. A bearer promise: refs.to names a thing, and its owner is that side ----
{
  const s = story(), lena = s.person('blena'), bo = s.person('bbo'), cy = s.person('bcy'), eve = s.person('beve')
  const coffee = s.say(lena, 'thing', { kind: 'coffee' })
  const voucher = s.say(lena, 'thing', { kind: 'voucher', name: 'one coffee' })
  const promise = s.say(lena, 'promise', { terms: { quantity: fb.amount('1', '{cup}'), expires: LATER } }, { from: lena.id, to: voucher.hash, what: coffee.hash })
  const pass = (from, to, thing) => { const t = s.say(from, 'transfer', {}, { what: thing.hash, to_owner: to.id }); s.say(to, 'transfer', { status: 'accepted' }, { answers: t.hash }); return t }
  const answer = (who, state, extra) => s.say(who, 'promise', state, { answers: promise.hash, for: promise.hash, after: [promise.hash], ...extra })
  pass(lena, bo, voucher)
  stage('bearer: the holder of the voucher is the receiving side; until she answers, the promise is offered', promise, s.held, { stage: 'offered', sides: { to: voucher.hash } })
  const outsider = answer(eve, { status: 'accepted' })
  stage('bearer: an accept by someone who does not hold the voucher binds no one', promise, s.held, { stage: 'offered', accept: null })
  const boAccept = answer(bo, { status: 'accepted' })
  stage('bearer: the holder\'s accept binds (a side, not not_a_side)', promise, s.held, { stage: 'accepted', accept: boAccept.hash })
  pass(bo, cy, voucher)
  stage('bearer: the voucher passed on carries the promise: the earlier holder\'s accept counts for nothing', promise, s.held, { stage: 'offered', accept: null })
  const cyAccept = answer(cy, { status: 'accepted' })
  stage('bearer: the new holder answers it again and it binds', promise, s.held, { stage: 'accepted', accept: cyAccept.hash })
  const cup = s.say(lena, 'thing', { kind: 'coffee', lot: 'C1', pack: fb.amount('1', '{cup}') }, { of: coffee.hash })
  const handed = s.say(lena, 'transfer', {}, { what: cup.hash, to_owner: cy.id, for: promise.hash })
  s.say(cy, 'transfer', { status: 'accepted' }, { answers: handed.hash, for: promise.hash })
  stage('bearer: what is owed goes to the holder, who accepts it: done', promise, s.held, { stage: 'done' })
  // a voucher with no owner (given to an open receiver) has no one to answer
  const loose = s.say(lena, 'thing', { kind: 'voucher', name: 'dropped' })
  const open = s.say(lena, 'transfer', { count: 1 }, { what: loose.hash, to_place: lena.id })
  const bearer2 = s.say(lena, 'promise', { terms: { quantity: fb.amount('1', '{cup}'), expires: LATER } }, { from: lena.id, to: loose.hash, what: coffee.hash })
  s.say(eve, 'promise', { status: 'accepted' }, { answers: bearer2.hash, for: bearer2.hash, after: [bearer2.hash] })
  stage('bearer: a voucher nobody owns yet has no side that can answer', bearer2, s.held, { stage: 'offered', accept: null })
}

// ---- 4. An allocation starts a deal of its own ----
{
  const s = story(), maya = s.person('amaya'), t1 = s.person('at1'), t2 = s.person('at2'), t3 = s.person('at3')
  const eggs = s.say(maya, 'thing', { kind: 'eggs' })
  const EGG = (n) => fb.amount(String(n), '{egg}')
  const O = s.say(maya, 'promise', { terms: { price: { money: M(300), per: EGG(1) }, quantity: EGG(100), expires: LATER } }, { from: maya.id, what: eggs.hash })
  const request = (t, q) => s.say(t, 'promise', { status: 'accepted', terms: { quantity: EGG(q) } }, { answers: O.hash, for: O.hash, after: [O.hash] })
  const allocate = (r, q) => s.say(maya, 'promise', { status: 'accepted', terms: { quantity: EGG(q) } }, { answers: r.hash, for: O.hash, after: [r.hash] })
  const r1 = request(t1, 60), r2 = request(t2, 30), r3 = request(t3, 30)
  stage('allocation: the open offer is offered until an allocation binds', O, s.held, { stage: 'offered', takers: [] })
  const a1 = allocate(r1, 60), a2 = allocate(r2, 30), a3 = allocate(r3, 30)
  stage('allocation: the open offer binds, and its quantity and total are what its allocations bind together (the third is over what was offered)', O, s.held,
    { stage: 'accepted', accept: a1.hash, quantity: { value: '90', unit: '{egg}' }, total: { minor: 27000, currency: 'GBP' }, takers: [{ who: t1.id, allocation: a1.hash }, { who: t2.id, allocation: a2.hash }] })
  stage('allocation: the first allocation is a deal of its own, between the offerer and the taker', a1, s.held,
    { stage: 'accepted', accept: a1.hash, offer: O.hash, sides: { from: maya.id }, quantity: { value: '60', unit: '{egg}' }, total: { minor: 18000, currency: 'GBP' }, takers: [{ who: t1.id, allocation: a1.hash }] })
  door('allocation: an allocation past what was offered has no deal', 'promise_stage', [a3, s.held, {}], { expect: null, exact: true })
  // t2 settles his own 30 eggs: goods and payment name his allocation
  const lot = s.say(maya, 'thing', { kind: 'eggs', lot: 'L2', pack: EGG(30) }, { of: eggs.hash })
  const handed = s.say(maya, 'transfer', {}, { what: lot.hash, to_owner: t2.id, for: a2.hash })
  s.say(t2, 'transfer', { status: 'accepted' }, { answers: handed.hash, for: a2.hash })
  const paid = s.say(t2, 'transfer', { money: M(9000) }, { to_owner: maya.id, for: a2.hash })
  s.say(maya, 'transfer', { status: 'accepted' }, { answers: paid.hash, for: a2.hash })
  stage('allocation: a taker\'s goods and payment, named for his allocation, settle his deal: done', a2, s.held, { stage: 'done', paid: { minor: 9000 }, quantity: { value: '30', unit: '{egg}' } })
  stage('allocation: another taker\'s deal is untouched by it: accepted, nothing paid', a1, s.held, { stage: 'accepted', paid: null })
  stage('allocation: and the open offer still only binds', O, s.held, { stage: 'accepted' })
  // money named for the open offer itself settles no one
  const stray = s.say(t1, 'transfer', { money: M(18000) }, { to_owner: maya.id, for: O.hash })
  s.say(maya, 'transfer', { status: 'accepted' }, { answers: stray.hash, for: O.hash })
  stage('allocation: a payment named for the open offer counts toward no taker\'s quantity', a1, s.held, { stage: 'accepted', paid: null })
  s.say(maya, 'promise', { status: 'stopped', stop: 'onward' }, { updates: a1.hash, for: a1.hash, after: [a1.hash] })
  stage('allocation: a stop onward ends that taker\'s deal alone', a1, s.held, { stage: 'stopped', stop: 'onward' })
  stage('allocation: and not another taker\'s', a2, s.held, { stage: 'done' })
}

// ---- 5. A promise's terms are fixed once written: an `updates` of a promise is its stop ----
{
  const s = story(), pia = s.person('upia'), quin = s.person('uquin')
  const eggs = s.say(pia, 'thing', { kind: 'eggs' })
  const offer = s.say(pia, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash })
  const edit = { terms: { price: M(350), quantity: fb.amount('1', '{tray}'), expires: DAY } }
  const cheaper = s.raw(pia, 'promise', edit, { from: pia.id, to: quin.id, what: eggs.hash, updates: offer.hash, for: offer.hash })
  check('a promise carrying new terms and updating another is refused: its terms are fixed once written', cheaper, ['required'])
  stage('terms fixed: a price written as an updates of the offer changes nothing in the deal', offer, s.held, { stage: 'offered', live: [offer.hash] })
  const accept = s.say(quin, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, after: [offer.hash, cheaper.hash] })
  stage('terms fixed: the accept binds the offer as written, at the written price', offer, s.held, { stage: 'accepted', accept: accept.hash, offer: offer.hash, total: { minor: 450, currency: 'GBP' } })
  const offer2 = s.say(pia, 'promise', { terms: { price: M(460), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash })
  const cheaper2 = s.raw(pia, 'promise', edit, { from: pia.id, to: quin.id, what: eggs.hash, updates: offer2.hash, for: offer2.hash })
  s.say(quin, 'promise', { status: 'accepted' }, { answers: cheaper2.hash, for: cheaper2.hash, after: [cheaper2.hash] })
  stage('terms fixed: an accept of the quiet edit binds nothing', offer2, s.held, { stage: 'offered', accept: null })
  const offer3 = s.say(pia, 'promise', { terms: { price: M(470), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash })
  const stop = s.say(pia, 'promise', { status: 'stopped', stop: 'before' }, { updates: offer3.hash, for: offer3.hash, after: [offer3.hash] })
  check('an updates of a promise that is its author\'s stop is the one allowed', stop, [])
}

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
