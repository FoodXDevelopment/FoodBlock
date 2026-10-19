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
  const without = (...blocks) => held.filter((b) => !blocks.includes(b))
  return { held, person, say, keep, without }
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

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
