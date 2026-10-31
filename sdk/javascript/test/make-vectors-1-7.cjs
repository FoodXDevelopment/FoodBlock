// Adds to spec/vectors.json the cases of FoodBlock 1.7 (CHANGELOG.md): `node test/make-vectors-1-7.cjs`.
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

const vectorsFile = require('./vectors-file.cjs')
const FILE = vectorsFile.FILE
const { V, tags: INVARIANTS } = vectorsFile.load()
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name) => {
  if (keys[name]) return keys[name]
  const kp = fb.keypairFromSeed(sha(`foodblock 1.7 vectors: ${name}`), 'std')
  keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign }
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 27, 12, 0, 0) + 1000 * tick++).toISOString()
const DAY = '2026-12-20T00:00:00.000Z', LATER = '2027-12-31T00:00:00.000Z'
const BEFORE = '2027-06-01T00:00:00.000Z', AFTER = '2028-01-02T00:00:00.000Z'
const M = (minor, currency = 'GBP') => fb.money(minor, currency)

function story() {
  const held = []
  const keep = (block) => { held.push(block); return block }
  const person = (name, { kind = 'person' } = {}) => {
    const g = keep(genesis(keyOf(name), { kind, at: at() }))
    return { name, id: g.hash, g }
  }
  const say = (who, type, state, refs = {}, { after, audience = 'public', time } = {}) => {
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    const when = time || at()
    // a sealed block's nonce and salts are fixed from its author and time, so the file is the same on every run
    const sealed = audience === 'public' ? {} : {
      nonce: sha(`nonce ${who.name} ${when}`).slice(0, 32),
      salts: Object.fromEntries(audience.map((r) => [r, sha(`salt ${who.name} ${when} ${r}`).slice(0, 32)]))
    }
    return keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held, at: when, audience, after, ...sealed }))
  }
  // a block the writer would refuse, chained and signed by hand: a node never holds one, but a fold given one must still agree with the oracle
  const raw = (who, type, state, refs = {}, { after } = {}) => {
    const mine = held.filter((b) => b.refs && b.refs.author === who.id)
    const last = mine.reduce((m, b) => (!m || b.state.seq > m.state.seq ? b : m), null)
    refs = { ...refs, author: who.id, prev: last ? last.hash : who.id, ...(after ? { after } : {}) }
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    state = { ...state, at: at(), audience: 'public', seq: last ? last.state.seq + 1 : 1 }
    return keep({ hash: fb.hash(type, state, refs), type, state, refs, signature: fb.sign({ type, state, refs }, keyOf(who.name).private_key) })
  }
  return { held, person, say, keep, raw }
}

const made = new Set()
const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? b !== null && Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true))
function door(name, op, args, { expect, exact, invariants } = {}) {
  args = JSON.parse(JSON.stringify(args))
  const got = call(op, ...args)
  if (expect !== undefined) { try { exact ? assert.deepEqual(got, expect) : subset(got, expect) } catch (e) { if (process.env.COLLECT) { console.log('FLIP\t' + name + '\t' + e.message.replace(/\n/g, ' ').slice(0, 300) + '\t' + JSON.stringify(got).slice(0, 300)); return got } throw new Error(`${name}: ${e.message}\n got ${JSON.stringify(got).slice(0, 600)}`) } }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}), ...(invariants ? { invariants } : {}) })
  return got
}
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
// A check case: the refusals the bytes of a block give, with the blocks held (most need none).
const AUTH = '1'.repeat(64)
function check(name, block, codes, held = [], { invariants } = {}) {
  const author = (block.refs && block.refs.author) || AUTH
  block = { type: block.type, state: { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', ...block.state }, refs: { prev: author, ...block.refs, author } }
  const got = call('refusals', block.type, block.state, block.refs, held, null)
  if (process.env.COLLECT && JSON.stringify(codesOf(got)) !== JSON.stringify(codes)) console.log('FLIP\t' + name + '\tcodes ' + JSON.stringify(codes) + '\t' + JSON.stringify(codesOf(got)))
  else assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op: 'refusals', args: JSON.parse(JSON.stringify([block.type, block.state, block.refs, held, null])), codes, ...(invariants ? { invariants } : {}) })
}
const stage = (name, first, held, expect) => door(name, 'promise_stage', [first, held, {}], { expect })
const view = (name, first, held, now, expect) => door(name, 'promise_view', [first, held, { now }], { expect })
const holds = (name, condition, held, now, expect) => door(name, 'condition_holds', [condition, held, now], { expect, exact: true })
const answer = (s, who, offer, state, extra = {}) => s.say(who, 'promise', state, { answers: offer.hash, for: offer.hash, after: [offer.hash], ...extra })

// ---- 0. Base fields: an actor may say how many holders a power needs; a grant may be made to a role ----
// the recovery pair is named only in a genesis (security C, 2026-10-28): neither type's base fields list it; genesis.recovery does
door('base_fields: actor (the recovery fields are a genesis\'s alone: security C)', 'base_fields', ['actor'], { expect: ['name', 'marks', 'removal', 'needed', 'public_key_sign', 'public_key_encrypt', 'suite', 'roles', 'custodian'], exact: true })
door('base_fields: grant (no key grant names the recovery pair: security C)', 'base_fields', ['grant'], { expect: ['scope', 'depth', 'replaces', 'counted_to', 'recovery_key', 'to_role', 'public_key_sign', 'public_key_encrypt', 'suite', 'roles', 'custodian'], exact: true })

// ---- 1. A promise not to do something: kept by its until unless a counted defeats breaks it ----
{
  const s = story(), farm = s.person('rfarm'), mill = s.person('rmill'), eve = s.person('reve'), judge = s.person('rjudge')
  const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
  const ID = '0'.repeat(64)
  check('refrain: a promise not to do something carries terms.until', { type: 'promise', state: { terms: { refrain: true, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['required'])
  check('refrain: terms.refrain is true, nothing else', { type: 'promise', state: { terms: { refrain: 'yes', until: LATER, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
  const promise = (price) => s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY, ...(price ? { price: M(price) } : {}) } }, { from: farm.id, to: mill.id, what: spray.hash })
  // kept: accepted, no defeat
  const p1 = promise()
  answer(s, mill, p1, { status: 'accepted' })
  stage('refrain: accepted and not broken: accepted, never done in the fold', p1, s.held, { stage: 'accepted' })
  view('refrain: before its until the view says accepted', p1, s.held, BEFORE, { stage: 'accepted' })
  view('H15: refrain: once the reader\'s clock passes its until with no referee\'s defeat, the view says elapsed, never done (before: done)', p1, s.held, AFTER, { stage: 'elapsed' })
  // a stranger's defeat breaks nothing
  s.say(eve, 'observe', { kind: 'report', text: 'they sprayed' }, { defeats: p1.hash, for: p1.hash })
  stage('refrain: a stranger\'s defeats breaks nothing', p1, s.held, { stage: 'accepted' })
  // the side it was made to shows it was broken
  const p2 = promise()
  answer(s, mill, p2, { status: 'accepted' })
  const breach = s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p2.hash, for: p2.hash })
  stage('refrain: the side it was made to defeats it: a dispute, shown, and still accepted (batch 2 P4)', p2, s.held, { stage: 'accepted', from: null, disputed: [{ hash: breach.hash, of: p2.hash, by: 'to' }] })
  view('H15: refrain: a refrain the side only disputes is elapsed once its until passes (batch 2 P4; before: done)', p2, s.held, AFTER, { stage: 'elapsed' })
  // a confirmer the schema names
  const rules = s.say(farm, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'residue found', confirmers: [judge.id] } })
  const p3 = s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash, schema: rules.hash })
  answer(s, mill, p3, { status: 'accepted' })
  const ruling = s.say(judge, 'observe', { kind: 'ruling', text: 'sprayed in May' }, { defeats: p3.hash, for: p3.hash })
  stage('refrain: a confirmer the schema names defeats it: breached', p3, s.held, { stage: 'breached', from: ruling.hash })
  view('refrain: a refrain the referee breached is never done, whatever the clock (batch 2 P4)', p3, s.held, AFTER, { stage: 'breached' })
  // paid for: kept only once paid
  const p4 = promise(5000)
  answer(s, mill, p4, { status: 'accepted' })
  view('H15: refrain: a paid refrain past its until is elapsed, its unpaid price beside it (before: accepted)', p4, s.held, AFTER, { stage: 'elapsed', paid: null })
  holds('H15: settled: an elapsed refrain whose price is unpaid is not settled', { settled: p4.hash }, s.held, AFTER, false)
  const pay = s.say(mill, 'transfer', { money: M(5000) }, { what: farm.id, to_owner: farm.id, for: p4.hash })
  s.say(farm, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p4.hash })
  view('H15: refrain: once paid, the view says elapsed past its until, what was paid beside it (before: done)', p4, s.held, AFTER, { stage: 'elapsed', paid: { minor: 5000, currency: 'GBP' } })
  holds('H15: settled: an elapsed refrain with its price paid is settled', { settled: p4.hash }, s.held, AFTER, true)
  // a breach counts only within the term, and only if the side it was made to had not already let it go
  const p5 = promise()
  answer(s, mill, p5, { status: 'accepted' })
  s.say(mill, 'observe', { kind: 'test', text: 'residue found, a year on' }, { defeats: p5.hash, for: p5.hash }, { time: '2028-02-01T00:00:00.000Z' })
  stage('refrain: a defeats signed after its until breaks nothing', p5, s.held, { stage: 'accepted' })
  const p6 = promise()
  const yes6 = answer(s, mill, p6, { status: 'accepted' })
  const release = answer(s, mill, p6, { status: 'stopped', stop: 'onward' }, { after: [yes6.hash] })
  s.say(mill, 'observe', { kind: 'test', text: 'residue found after all' }, { defeats: p6.hash, for: p6.hash, after: [release.hash] })
  stage('refrain: a defeats by the side that had already let it go breaks nothing: it stays stopped', p6, s.held, { stage: 'stopped', stop: 'onward', from: release.hash, by: 'to' })
  // after a counter, the deal is the accepted offer's terms
  const p7 = promise()
  const plain = answer(s, mill, p7, { terms: { price: M(100), expires: DAY } })
  answer(s, farm, plain, { status: 'accepted' }, { for: p7.hash })
  s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p7.hash, for: p7.hash })
  stage('refrain: a counter with no refrain, accepted, is not a refrain: a defeats breaks nothing', p7, s.held, { stage: 'accepted' })
  const p8 = s.say(farm, 'promise', { terms: { price: M(100), expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash })
  const withRefrain = answer(s, mill, p8, { terms: { refrain: true, until: LATER, expires: DAY } })
  answer(s, farm, withRefrain, { status: 'accepted' }, { for: p8.hash })
  const b8 = s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: withRefrain.hash, for: p8.hash })
  stage('refrain: a counter that adds a refrain, accepted, is one, and a defeats of the counter accepted is a dispute of it (batch 2 P4)', p8, s.held, { stage: 'accepted', disputed: [{ hash: b8.hash, of: withRefrain.hash, by: 'to' }] })
}

// ---- 2. A death: a close ends the person's standing promises, grants and memberships, unless it carries them on ----
{
  const s = story(), gran = s.person('dgran'), son = s.person('dson'), w1 = s.person('dwit1'), agent = s.person('dagent', { kind: 'agent' }), shop = s.person('dshop'), eve = s.person('deve')
  const succ = s.say(gran, 'grant', { kind: 'successor', witnesses: [w1.id], needed: 1, wait: 'P7D' }, { to: son.id })
  const milk = s.say(shop, 'thing', { kind: 'milk' })
  const weekly = s.say(shop, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(300), expires: DAY } }, { from: shop.id, to: gran.id, what: milk.hash })
  answer(s, gran, weekly, { status: 'accepted' })
  const carried = s.say(shop, 'promise', { when: '2026-11-03T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=TU', price: M(200), expires: DAY } }, { from: shop.id, to: gran.id, what: milk.hash })
  answer(s, gran, carried, { status: 'accepted' })
  const once = s.say(shop, 'promise', { terms: { price: M(900), expires: DAY } }, { from: shop.id, to: gran.id, what: milk.hash })
  answer(s, gran, once, { status: 'accepted' })
  const errands = s.say(gran, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: agent.id })
  const kept = s.say(gran, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: agent.id })
  const club = s.say(shop, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Lunch club', roles: [{ name: 'host', powers: ['sign', 'admit', 'remove'] }, { name: 'member', powers: [] }] })
  const inv = s.say(shop, 'grant', { kind: 'member', roles: ['member'] }, { subject: club.hash, to: gran.id, as: club.hash })
  s.say(gran, 'grant', { status: 'accepted', kind: 'member' }, { answers: inv.hash, subject: club.hash })
  stage('close: before the death, the weekly delivery binds', weekly, s.held, { stage: 'accepted' })
  door('close: before the death, the agent acts under her grant', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'checked in' }, { under: errands.hash }), s.held], { expect: true, exact: true })
  // a stranger's close counts for nothing
  s.say(eve, 'observe', { kind: 'close' }, { subject: gran.id })
  stage('close: a close by someone who is not her successor ends nothing', weekly, s.held, { stage: 'accepted' })
  const before = s.say(agent, 'observe', { kind: 'note', text: 'paid the milk' }, { under: errands.hash })
  // a close with no trigger from her witnesses ends nothing
  s.say(son, 'observe', { kind: 'close' }, { under: succ.hash, subject: gran.id })
  stage('close: a close with no witness\'s trigger in its causal past ends nothing', weekly, s.held, { stage: 'accepted' })
  // her successor closes, once her witness has recorded the death, carrying one delivery and one grant on
  const trig = s.say(w1, 'observe', { kind: 'trigger', text: 'she died on Sunday' }, { under: succ.hash, subject: gran.id })
  const close = s.say(son, 'observe', { kind: 'close', continues: [carried.hash, kept.hash] }, { under: succ.hash, subject: gran.id, after: [trig.hash] })
  stage('close: a standing promise she is a side of does not end at her successor\'s close: a death ends no promise (batch 2 P7)', weekly, s.held, { stage: 'accepted', stop: null, from: null })
  stage('close: a standing promise the close names in continues carries on', carried, s.held, { stage: 'accepted' })
  stage('close: a one-off promise is not standing: the close does not end it', once, s.held, { stage: 'accepted' })
  door('close: a grant she gave is not live for a block that sees the close', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'checked again' }, { under: errands.hash, after: [close.hash] }), s.held], { expect: false, exact: true })
  door('close: what was done under her grant before the close stands', 'under_ok', [before, s.held], { expect: true, exact: true })
  door('close: a grant the close names in continues is still live', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'carried on' }, { under: kept.hash }), s.held], { expect: true, exact: true })
  door('close: she is out of every circle from the close', 'circle_state', [club.hash, s.held], { expect: { removed: { [gran.id]: null } } })
}
{
  const s = story(), mum = s.person('emum'), kid = s.person('ekid'), wit = s.person('ewit'), alt = s.person('ealt'), farm = s.person('efarm')
  const box = s.say(farm, 'thing', { kind: 'veg box' })
  const weekly = () => { const p = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(1500), expires: DAY } }, { from: farm.id, to: mum.id, what: box.hash }); answer(s, mum, p, { status: 'accepted' }); return p }
  // she took the successor grant back: a close under it ends nothing
  const g1 = s.say(mum, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: kid.id })
  const back = s.say(mum, 'grant', { kind: 'successor', status: 'stopped', stop: 'onward' }, { updates: g1.hash })
  const t1 = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: g1.hash, subject: mum.id })
  const w1 = weekly()
  s.say(kid, 'observe', { kind: 'close' }, { under: g1.hash, subject: mum.id, after: [t1.hash, back.hash] })
  stage('close: a close under a successor grant she stopped, the stop in its past, ends nothing', w1, s.held, { stage: 'accepted' })
  // she said it was not so: a trigger she defeats counts for nothing
  const g2 = s.say(mum, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: alt.id })
  const t2 = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: g2.hash, subject: mum.id })
  s.say(mum, 'observe', { kind: 'alive', text: 'I am here' }, { defeats: t2.hash })
  s.say(alt, 'observe', { kind: 'close' }, { under: g2.hash, subject: mum.id, after: [t2.hash] })
  stage('close: a trigger she defeats counts for nothing, so the close ends nothing', w1, s.held, { stage: 'accepted' })
  // a successor grant to herself: she cannot close herself
  const g3 = s.say(mum, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: mum.id })
  const t3 = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: g3.hash, subject: mum.id })
  s.say(mum, 'observe', { kind: 'close' }, { under: g3.hash, subject: mum.id, after: [t3.hash] })
  stage('close: a person never closes herself', w1, s.held, { stage: 'accepted' })
  // two witnesses needed: one is not enough
  const wit2 = s.person('ewit2')
  const g4 = s.say(mum, 'grant', { kind: 'successor', witnesses: [wit.id, wit2.id], needed: 2, wait: 'P7D' }, { to: kid.id })
  const t4 = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: g4.hash, subject: mum.id })
  const c4 = s.say(kid, 'observe', { kind: 'close' }, { under: g4.hash, subject: mum.id, after: [t4.hash] })
  stage('close: where two witnesses are needed, one trigger is not enough', w1, s.held, { stage: 'accepted' })
  const t5 = s.say(wit2, 'observe', { kind: 'trigger', text: 'she died' }, { under: g4.hash, subject: mum.id })
  const c5 = s.say(kid, 'observe', { kind: 'close' }, { under: g4.hash, subject: mum.id, after: [t4.hash, t5.hash] })
  stage('close: with both witnesses\' triggers in its past, the close still ends no promise (batch 2 P7)', w1, s.held, { stage: 'accepted', from: null })
  void c4
}

// ---- 3. Conditions: settled, a deed, and a signal from people the condition names ----
{
  const s = story(), ann = s.person('cann'), bob = s.person('cbob'), imam = s.person('cimam'), elder = s.person('celder'), eve = s.person('ceve')
  const flour = s.say(ann, 'thing', { kind: 'flour' })
  const sale = s.say(ann, 'promise', { terms: { price: M(400), quantity: fb.amount('1', '{sack}'), expires: DAY } }, { from: ann.id, to: bob.id, what: flour.hash })
  holds('conditions: settled does not hold while the promise is only offered', { settled: sale.hash }, s.held, BEFORE, false)
  answer(s, bob, sale, { status: 'accepted' })
  const sack = s.say(ann, 'thing', { kind: 'flour', pack: fb.amount('1', '{sack}') }, { of: flour.hash })
  const give = s.say(ann, 'transfer', {}, { what: sack.hash, to_owner: bob.id, for: sale.hash })
  s.say(bob, 'transfer', { status: 'accepted' }, { answers: give.hash, for: sale.hash })
  const pay = s.say(bob, 'transfer', { money: M(400) }, { what: bob.id, to_owner: ann.id, for: sale.hash })
  s.say(ann, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: sale.hash })
  holds('conditions: settled holds once the promise is done', { settled: sale.hash }, s.held, BEFORE, true)
  holds('conditions: a deed holds when the block is held and counts', { deed: give.hash }, s.held, BEFORE, true)
  holds('conditions: a deed not held does not hold', { deed: 'a'.repeat(64) }, s.held, BEFORE, false)
  // a signal: the new moon sighted by two of the named
  const mosque = s.say(imam, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Mosque', roles: [{ name: 'imam', powers: ['sign', 'admit', 'remove'] }, { name: 'sighter', powers: [] }] })
  const g = s.say(imam, 'grant', { kind: 'member', roles: ['sighter'] }, { subject: mosque.hash, to: elder.id, as: mosque.hash })
  s.say(elder, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: mosque.hash })
  const moon = { signal: 'moon_sighted', by: [imam.id, mosque.hash + '#sighter'], signers: 2 }
  s.say(imam, 'observe', { kind: 'moon_sighted', text: 'seen at dusk' }, {}, { time: '2027-03-01T18:00:00.000Z' })
  holds('conditions: a signal needing two signers does not hold on one', moon, s.held, '2027-03-02T00:00:00.000Z', false)
  s.say(eve, 'observe', { kind: 'moon_sighted', text: 'I saw it too' }, {}, { time: '2027-03-01T18:05:00.000Z' })
  holds('conditions: a signer the condition does not name does not count', moon, s.held, '2027-03-02T00:00:00.000Z', false)
  s.say(elder, 'observe', { kind: 'moon_sighted', text: 'seen from the hill' }, {}, { time: '2027-03-01T18:10:00.000Z' })
  holds('conditions: a holder of circle#role counts: two named signers, the signal holds', moon, s.held, '2027-03-02T00:00:00.000Z', true)
  holds('conditions: a signal signed after the reader\'s clock does not count', moon, s.held, '2027-03-01T18:07:00.000Z', false)
  // a price trigger: a signal with a rule
  const board = s.person('cboard')
  s.say(board, 'observe', { kind: 'price', amount: fb.amount('410', 'GBP/t') }, { subject: flour.hash }, { time: '2027-04-01T09:00:00.000Z' })
  holds('conditions: a signal with a rule holds when the signed amount keeps to it', { signal: 'price', by: [board.id], subject: flour.hash, op: 'ge', value: fb.amount('400', 'GBP/t') }, s.held, '2027-04-02T00:00:00.000Z', true)
  holds('conditions: a signal with a rule does not hold when the signed amount breaks it', { signal: 'price', by: [board.id], subject: flour.hash, op: 'ge', value: fb.amount('420', 'GBP/t') }, s.held, '2027-04-02T00:00:00.000Z', false)
  holds('conditions: a shape the protocol does not know is not read: null, never false (batch 2 P9)', { weather: 'fine' }, s.held, '2027-04-02T00:00:00.000Z', null)
  const T = '2027-04-02T00:00:00.000Z', price = { signal: 'price', by: [board.id], subject: flour.hash }
  holds('conditions: by is a list: a bare id does not hold', { ...price, by: board.id }, s.held, T, false)
  holds('conditions: by is never empty', { ...price, by: [] }, s.held, T, false)
  holds('conditions: a name with two # names no one, and the condition does not hold', { ...price, by: [board.id, mosque.hash + '#imam#x'] }, s.held, T, false)
  holds('conditions: signers is a whole number of at least 1: 0 does not hold', { ...price, signers: 0 }, s.held, T, false)
  holds('conditions: signers 1.5 does not hold', { ...price, signers: 1.5 }, s.held, T, false)
  holds('conditions: subject is one id: a list does not hold', { ...price, subject: [flour.hash] }, s.held, T, false)
  holds('conditions: op without value does not hold', { ...price, op: 'ge' }, s.held, T, false)
  holds('conditions: value without op does not hold', { ...price, value: fb.amount('400', 'GBP/t') }, s.held, T, false)
  holds('conditions: a value that is not an amount does not hold', { ...price, op: 'ge', value: { value: 400, unit: 'GBP/t' } }, s.held, T, false)
  holds('conditions: money is not an amount: it does not hold', { ...price, op: 'gt', value: { minor: 5000, currency: 'GBP' } }, s.held, T, false)
  holds('conditions: an op the protocol does not know does not hold', { ...price, op: 'about', value: fb.amount('400', 'GBP/t') }, s.held, T, false)
  holds('conditions: a well-formed signal with no rule holds', price, s.held, T, true)
  // a signer takes their signal back by defeating it
  const said = s.say(eve, 'observe', { kind: 'rain', text: 'it rained' }, {}, { time: '2027-05-01T09:00:00.000Z' })
  holds('conditions: a signal holds while its signer stands by it', { signal: 'rain', by: [eve.id] }, s.held, '2027-05-02T00:00:00.000Z', true)
  s.say(eve, 'observe', { kind: 'correction', text: 'it was a hose' }, { defeats: said.hash }, { time: '2027-05-01T10:00:00.000Z' })
  holds('conditions: a signal its signer defeats no longer counts', { signal: 'rain', by: [eve.id] }, s.held, '2027-05-02T00:00:00.000Z', false)
}

// ---- 4. Many hands: a power a circle needs N holders for counts once N have signed ----
{
  const s = story(), ann = s.person('qann'), bea = s.person('qbea'), cal = s.person('qcal'), dan = s.person('qdan'), eve = s.person('qeve'), sam = s.person('qsam')
  check('needed: state.needed names powers and whole numbers of at least 1', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, roles: [{ name: 'keeper', powers: ['sign'] }], needed: { sign: 0 } }, refs: {} }, ['shape'])
  check('needed: a power the needed rule does not cover is refused', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, roles: [{ name: 'keeper', powers: ['sign'] }], needed: { remove: 2 } }, refs: {} }, ['shape'])
  check('needed: only signing takes many hands: admit keeps its own rule', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, roles: [{ name: 'keeper', powers: ['sign', 'admit'] }], needed: { admit: 2 } }, refs: {} }, ['shape'])
  const solo = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Pot', roles: [{ name: 'treasurer', powers: ['sign', 'admit', 'remove'] }, { name: 'member', powers: [] }], needed: { sign: 2 } })
  const tg = s.say(ann, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: solo.hash, to: bea.id, as: solo.hash })
  s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: tg.hash, subject: solo.hash })
  const mg = s.say(ann, 'grant', { kind: 'member', roles: ['member'] }, { subject: solo.hash, to: dan.id, as: solo.hash })
  s.say(dan, 'grant', { status: 'accepted', kind: 'member' }, { answers: mg.hash, subject: solo.hash })
  door('needed: a circle that needs two to sign still admits with one: admit is not named', 'circle_state', [solo.hash, s.held], { expect: { members: { [bea.id]: { roles: ['treasurer'] }, [dan.id]: { roles: ['member'] } } } })
  // signing as the circle needs two treasurers
  const seed = s.say(sam, 'thing', { kind: 'seed' })
  const offer = s.say(sam, 'promise', { terms: { price: M(2000), expires: DAY } }, { from: sam.id, to: solo.hash, what: seed.hash })
  const yes = answer(s, ann, offer, { status: 'accepted' }, { as: solo.hash })
  door('needed: one treasurer signing as the circle does not speak for it', 'may_act_as', [yes, solo.hash, s.held], { expect: false, exact: true })
  stage('needed: one treasurer\'s accept does not bind the circle', offer, s.held, { stage: 'offered', accept: null })
  s.say(eve, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  door('needed: a confirm by someone who holds no sign power adds no hand', 'may_act_as', [yes, solo.hash, s.held], { expect: false, exact: true })
  s.say(dan, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  door('needed: a member without the sign power adds no hand', 'may_act_as', [yes, solo.hash, s.held], { expect: false, exact: true })
  s.say(bea, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes.hash })
  door('needed: a second treasurer confirms: two hands, it speaks for the circle', 'may_act_as', [yes, solo.hash, s.held], { expect: true, exact: true })
  stage('needed: with two treasurers, the accept binds the circle', offer, s.held, { stage: 'accepted', accept: yes.hash })
  // a hand counts once, the author's own confirm adds none, and a removed treasurer's confirm outside the cut adds none
  const stall = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Stall', roles: [{ name: 'treasurer', powers: ['sign', 'admit', 'remove'] }], needed: { sign: 2 } })
  const into = (who) => { const g = s.say(ann, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: stall.hash, to: who.id, as: stall.hash }); return s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: stall.hash }) }
  into(bea)
  const calIn = into(cal)
  const calGrant = calIn.refs.answers
  const offer2 = s.say(sam, 'promise', { terms: { price: M(900), expires: DAY } }, { from: sam.id, to: stall.hash, what: seed.hash })
  const yes2 = answer(s, bea, offer2, { status: 'accepted' }, { as: stall.hash })
  s.say(bea, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes2.hash })
  door('needed: the author\'s own confirm adds no hand', 'may_act_as', [yes2, stall.hash, s.held], { expect: false, exact: true })
  s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: calIn.hash }, { updates: calGrant, subject: stall.hash, as: stall.hash, after: [calIn.hash] })
  s.say(cal, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes2.hash })
  door('needed: a removed treasurer\'s confirm outside the cut adds no hand, whether or not they saw the removal', 'may_act_as', [yes2, stall.hash, s.held], { expect: false, exact: true })
  s.say(ann, 'observe', { kind: 'agree', text: 'yes' }, { confirms: yes2.hash })
  door('needed: a treasurer still in confirms: two hands', 'may_act_as', [yes2, stall.hash, s.held], { expect: true, exact: true })
  door('needed: a block not signed as the circle never speaks for it, whatever its author holds', 'may_act_as', [s.say(ann, 'observe', { kind: 'note', text: 'plain' }), stall.hash, s.held], { expect: false, exact: true })
  void cal
}
{
  const s = story(), ann = s.person('fann'), bea = s.person('fbea'), dan = s.person('fdan')
  // the founder holds the first role and only its powers
  const odd = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Odd', roles: [{ name: 'member', powers: [] }, { name: 'clerk', powers: ['sign', 'admit', 'remove'] }] })
  const g = s.say(ann, 'grant', { kind: 'member', roles: ['clerk'] }, { subject: odd.hash, to: bea.id, as: odd.hash })
  s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: odd.hash })
  door('founder: a founder whose first role cannot admit admits no one', 'circle_state', [odd.hash, s.held], { expect: { members: { [ann.id]: { roles: ['member'] } }, removed: {} }, exact: false })
  // the founder is an ordinary member (batch 2 P5): a grant they accept supersedes the founding block, as for anyone
  const club = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Club', roles: [{ name: 'host', powers: ['sign', 'admit', 'remove'] }, { name: 'member', powers: [] }, { name: 'cook', powers: [] }] })
  const h = s.say(ann, 'grant', { kind: 'member', roles: ['host'] }, { subject: club.hash, to: bea.id, as: club.hash })
  const hy = s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: h.hash, subject: club.hash })
  const back = s.say(bea, 'grant', { kind: 'member', roles: ['member'] }, { subject: club.hash, to: ann.id, as: club.hash, after: [hy.hash] })
  s.say(ann, 'grant', { status: 'accepted', kind: 'member' }, { answers: back.hash, subject: club.hash })
  door('founder: a founder who accepts a lesser grant holds only it, as any member would (batch 2 P5)', 'circle_state', [club.hash, s.held], { expect: { members: { [ann.id]: { roles: ['member'] } } } })
  // a role taken away before the answer counts whichever a reader meets first (the invitation is the host's: the founder no longer admits)
  const inv = s.say(bea, 'grant', { kind: 'member', roles: ['cook', 'member'] }, { subject: club.hash, to: dan.id, as: club.hash })
  s.say(bea, 'grant', { kind: 'member', roles: ['member'] }, { updates: inv.hash, subject: club.hash, as: club.hash })
  s.say(dan, 'grant', { status: 'accepted', kind: 'member' }, { answers: inv.hash, subject: club.hash })
  door('circle: a role taken away from an invitation counts at once, whatever the answer saw (an admin\'s invitation, batch 2 P5)', 'circle_state', [club.hash, s.held], { expect: { members: { [dan.id]: { roles: ['member'] } } } })
}

// ---- 5. A grant to a role: whoever holds the role acts under it, and only while they hold it ----
{
  const s = story(), ann = s.person('tann'), bea = s.person('tbea'), cal = s.person('tcal'), bank = s.person('tbank')
  const ID = '0'.repeat(64)
  check('to_role: a grant to a role names the circle in refs.to', { type: 'grant', state: { kind: 'authority', to_role: 'treasurer', scope: { acts: ['observe'], until: LATER } }, refs: {} }, ['required'])
  check('to_role: state.to_role is a role\'s name', { type: 'grant', state: { kind: 'authority', to_role: '', scope: { acts: ['observe'], until: LATER } }, refs: { to: ID } }, ['shape'])
  check('to_role: a grant to a role is not passed on: it carries no depth', { type: 'grant', state: { kind: 'authority', to_role: 'treasurer', depth: 1, scope: { acts: ['observe'], until: LATER } }, refs: { to: ID } }, ['shape'])
  const chama = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Chama', roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }, { name: 'treasurer', powers: [] }] })
  const g = s.say(ann, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: chama.hash, to: bea.id, as: chama.hash })
  const yes = s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: chama.hash })
  const statements = s.say(bank, 'grant', { kind: 'statements', to_role: 'treasurer', scope: { acts: ['observe'], until: LATER } }, { to: chama.hash })
  door('to_role: the treasurer acts under a grant made to the role', 'under_ok', [s.say(bea, 'observe', { kind: 'note', text: 'statement read' }, { under: statements.hash }), s.held], { expect: true, exact: true })
  door('to_role: someone who does not hold the role does not', 'under_ok', [s.say(cal, 'observe', { kind: 'note', text: 'statement read' }, { under: statements.hash }), s.held], { expect: false, exact: true })
  const stop = s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: yes.hash }, { updates: g.hash, subject: chama.hash, as: chama.hash, after: [yes.hash] })
  door('to_role: a removed holder\'s block that has not seen the removal acts under it no more (the cut)', 'under_ok', [s.say(bea, 'observe', { kind: 'note', text: 'read offline' }, { under: statements.hash }), s.held], { expect: false, exact: true })
  door('to_role: once the role is taken away, its last holder no longer acts under the grant', 'under_ok', [s.say(bea, 'observe', { kind: 'note', text: 'read again' }, { under: statements.hash, after: [stop.hash] }), s.held], { expect: false, exact: true })
  const g2 = s.say(ann, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: chama.hash, to: cal.id, as: chama.hash })
  const yes2 = s.say(cal, 'grant', { status: 'accepted', kind: 'member' }, { answers: g2.hash, subject: chama.hash })
  door('to_role: the new treasurer acts under the same grant, with no new grant from the bank', 'under_ok', [s.say(cal, 'observe', { kind: 'note', text: 'statement read' }, { under: statements.hash, after: [yes2.hash] }), s.held], { expect: true, exact: true })
  // a grant the circle signs to its own role: a stranger signing as the circle cannot stop it; one who may sign for it can
  const dan = s.person('tdan')
  const till = s.say(ann, 'grant', { kind: 'authority', to_role: 'treasurer', scope: { acts: ['observe'], until: LATER } }, { to: chama.hash, as: chama.hash })
  s.say(dan, 'grant', { kind: 'authority', status: 'stopped', stop: 'onward' }, { updates: till.hash, as: chama.hash })
  door('to_role: a stranger\'s stop signed as the circle stops nothing', 'under_ok', [s.say(cal, 'observe', { kind: 'note', text: 'till counted' }, { under: till.hash, after: [yes2.hash] }), s.held], { expect: true, exact: true })
  const tillStop = s.say(ann, 'grant', { kind: 'authority', status: 'stopped', stop: 'onward' }, { updates: till.hash, as: chama.hash })
  door('to_role: a stop by one who may sign for the circle ends its grant for a block that sees it', 'under_ok', [s.say(cal, 'observe', { kind: 'note', text: 'till counted again' }, { under: till.hash, after: [yes2.hash, tillStop.hash] }), s.held], { expect: false, exact: true })
  // refs.to that is not one id names no one
  const pair = s.say(bank, 'grant', { kind: 'statements', scope: { acts: ['observe'], until: LATER } }, { to: [bea.id, cal.id] })
  door('to: a grant to a set of ids is open to no stranger', 'under_ok', [s.say(dan, 'observe', { kind: 'note', text: 'read' }, { under: pair.hash }), s.held], { expect: false, exact: true })
  door('to: a grant to a set of ids is received by no one, not even one of them', 'under_ok', [s.say(cal, 'observe', { kind: 'note', text: 'read' }, { under: pair.hash }), s.held], { expect: false, exact: true })
}

// ---- 6. Limits: an amount as well as money, and a cap on each act ----
{
  const s = story(), farm = s.person('lfarm'), agent = s.person('lagent', { kind: 'agent' })
  const ID = '0'.repeat(64)
  check('limits: a limit may be an amount', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], limit: fb.amount('500', 'kg'), every: 'P7D', each: fb.amount('50', 'kg'), until: LATER } }, refs: { to: ID } }, [])
  check('limits: a cap on each act is money or an amount', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], each: { value: 5 }, until: LATER } }, refs: { to: ID } }, ['shape'])
  check('limits: a sealed limit keeps each inside its commitment', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], limit_commitment: ID, each: M(2000), until: LATER } }, refs: { to: ID } }, ['shape'])
  const parent = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], limit: fb.amount('500', 'kg'), every: 'P7D', each: fb.amount('50', 'kg'), until: LATER } }, { to: agent.id })
  const child = (scope) => ({ type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], every: 'P7D', until: LATER, ...scope } }, refs: { parent: parent.hash, to: ID, author: agent.id } })
  check('limits: a child\'s cap on each act no larger than its parent\'s is within it', child({ limit: fb.amount('400', 'kg'), each: fb.amount('40', 'kg') }), [], s.held)
  check('limits: a child\'s cap on each act larger than its parent\'s is wider', child({ limit: fb.amount('400', 'kg'), each: fb.amount('80', 'kg') }), ['wider_than_parent'], s.held)
  check('limits: a child\'s limit in another unit is wider', child({ limit: fb.amount('400', 'L'), each: fb.amount('40', 'kg') }), ['wider_than_parent'], s.held)
  const salt = '5'.repeat(32)
  const sealed = door('limits: a commitment covers each beside the limit and its period', 'limit_commitment', [M(5000), 'P7D', salt, null, M(1000)])
  // pinned to the oracle's answer, an implementation written from the spec text alone, so the core is not checked against itself
  door('H14: limits: with no cap on each act the commitment is of { limit, every } alone', 'limit_commitment', [M(5000), 'P7D', salt, null, null], { expect: require('../../../spec/oracle/fb.cjs').door('limit_commitment', M(5000), 'P7D', salt, null, null), exact: true })
  assert.notEqual(sealed, call('limit_commitment', M(5000), 'P7D', salt, null))
  const g = s.say(farm, 'grant', { kind: 'authority', scope: { acts: ['promise'], limit_commitment: sealed, every: 'P7D', until: LATER } }, { to: agent.id })
  const fence = s.say(farm, 'observe', { kind: 'limit', limit: M(5000), every: 'P7D', each: M(1000), salt }, { for: g.hash }, { audience: [agent.id] })
  door('limits: the limit observe with each opens the commitment', 'limit_opens', [g, fence, null], { expect: true, exact: true })
  // amounts are compared exactly, whatever their size
  const big = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], limit: fb.amount('90071992547409990', 'kg'), every: 'P7D', each: fb.amount('9007199254740992', 'kg'), until: LATER } }, { to: agent.id })
  const bigChild = (each) => ({ type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], every: 'P7D', until: LATER, limit: fb.amount('9007199254740992', 'kg'), each: fb.amount(each, 'kg') } }, refs: { parent: big.hash, to: ID, author: agent.id } })
  check('limits: amounts are compared exactly: one more in the last place is wider', bigChild('9007199254740993'), ['wider_than_parent'], s.held)
  check('limits: amounts are compared exactly: the same is within', bigChild('9007199254740992'), [], s.held)
  // a currency an issuer defines is compared by its canonical value
  const coin = { issuer: 'c'.repeat(64), unit: 'token', decimals: 0 }
  const tok = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], limit: { minor: 500, currency: coin }, every: 'P7D', until: LATER } }, { to: agent.id })
  check('limits: a limit in an issuer\'s currency, the same as its parent\'s, is within', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], every: 'P7D', until: LATER, limit: { minor: 500, currency: { ...coin } } } }, refs: { parent: tok.hash, to: ID, author: agent.id } }, [], s.held)
  // within_limit: on the principal's node, what was spent and this act, exactly
  const kg = (v) => fb.amount(v, 'kg')
  door('within_limit: an amount and a decimal spent, over the limit', 'within_limit', [{ limit: kg('3') }, kg('1'), '2.5'], { expect: false, exact: true })
  door('within_limit: an amount and what was spent, exactly at the limit', 'within_limit', [{ limit: kg('3') }, kg('1'), '2'], { expect: true, exact: true })
  door('within_limit: a cap on each act alone holds whatever was spent', 'within_limit', [{ each: kg('5') }, kg('5'), '900'], { expect: true, exact: true })
  door('within_limit: an act larger than each is not within', 'within_limit', [{ each: kg('5') }, kg('5.01'), 0], { expect: false, exact: true })
  door('within_limit: an amount in another unit is never within', 'within_limit', [{ limit: kg('3') }, fb.amount('1', 'L'), 0], { expect: false, exact: true })
  door('within_limit: money, in minor units', 'within_limit', [{ limit: M(1000) }, M(400), 600], { expect: true, exact: true })
  door('within_limit: money one minor unit over', 'within_limit', [{ limit: M(1000) }, M(400), 601], { expect: false, exact: true })
  door('within_limit: spent that is not a number is never within', 'within_limit', [{ limit: M(1000) }, M(400), 'abc'], { expect: false, exact: true })
}

// ---- 7. Repeats and endings: a time zone, another calendar, a repeat on an event; a stop names no reason (batch 2 P6) ----
{
  const ID = '0'.repeat(64)
  const p = (terms, state = { when: '2027-01-04T07:00:00.000Z' }) => ({ type: 'promise', state: { ...state, terms: { price: M(300), expires: DAY, ...terms } }, refs: { from: AUTH, to: ID, what: ID } })
  check('repeat: a time zone is an IANA name', p({ repeat: 'FREQ=WEEKLY;BYDAY=MO', zone: 'Europe/London' }), [])
  check('repeat: a zone that is not an IANA name is refused', p({ repeat: 'FREQ=WEEKLY;BYDAY=MO', zone: 'London time' }), ['grammar'])
  check('repeat: another calendar, named first by RSCALE', p({ repeat: 'RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=15' }), [])
  check('repeat: a rule with no FREQ is refused', p({ repeat: 'RSCALE=HEBREW;BYMONTH=7' }), ['grammar'])
  check('repeat: on an event, each time an observe of a kind is written, with who may write it and a wait', p({ repeat: { after: 'moon_sighted', by: [ID + '#sighter'], wait: 'PT12H' } }, {}), [])
  check('repeat: an event repeat names the kind it follows', p({ repeat: { by: [ID] } }, {}), ['shape'])
  check('repeat: an event repeat\'s signers are ids or circle#role', p({ repeat: { after: 'moon_sighted', by: ['the imam'], wait: 'PT12H' } }, {}), ['shape'])
  check('repeat: circle#role has one #', p({ repeat: { after: 'moon_sighted', by: [ID + '#imam#x'], wait: 'PT12H' } }, {}), ['shape'])
  const stop = (state) => ({ type: 'promise', state: { status: 'stopped', ...state }, refs: { updates: ID, for: ID } })
  check('reason: a stop names no reason: state.reason is no field of a promise (batch 2 P6)', stop({ stop: 'onward', reason: 'let_go' }), ['undeclared_field'])
  check('reason: no word list either: any reason, in any words, is refused on the stop (batch 2 P6)', stop({ stop: 'onward', reason: 'the river took the bridge' }), ['undeclared_field'])
  check('occurrences: a stop may name an occurrence by the hash of the block that started it', stop({ stop: { occurrences: ['b'.repeat(64)] } }), [])
  check('occurrences: an occurrence is a start time or a hash, nothing else', stop({ stop: { occurrences: ['abc'] } }), ['bad_status'])
  check('occurrences: a hash is lowercase', stop({ stop: { occurrences: ['B'.repeat(64)] } }), ['bad_status'])
  check('occurrences: a start time has its time, not only a date', stop({ stop: { occurrences: ['2026-11-09'] } }), ['bad_status'])
  check('occurrences: a stop names occurrences and nothing else', stop({ stop: { occurrences: [], extra: 1 } }), ['bad_status'])
}

// ---- 8. Who ended it: the side a stop speaks for, or both ----
{
  const s = story(), cook = s.person('bcook'), buyer = s.person('bbuyer')
  const pie = s.say(cook, 'thing', { kind: 'pie' })
  const order = () => { const p = s.say(cook, 'promise', { terms: { price: M(1200), expires: DAY } }, { from: cook.id, to: buyer.id, what: pie.hash }); const a = answer(s, buyer, p, { status: 'accepted' }); return [p, a] }
  const [p1, a1] = order()
  const stop1 = s.say(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p1.hash, for: p1.hash, after: [a1.hash] })
  stage('by: a one-off its maker stops onward is ended by the maker\'s side', p1, s.held, { stage: 'stopped', stop: 'onward', from: stop1.hash, by: 'from' })
  const [p2, a2] = order()
  const stop2 = s.say(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p2.hash, for: p2.hash, after: [a2.hash] })
  s.say(buyer, 'observe', { kind: 'agree', text: 'fine, next week' }, { confirms: stop2.hash, for: p2.hash })
  stage('by: a stop the other side confirms is ended by both: a release both agree', p2, s.held, { stage: 'stopped', stop: 'onward', from: stop2.hash, by: 'both' })
  const [p3, a3] = order()
  const stop3 = answer(s, buyer, p3, { status: 'stopped', stop: 'onward' }, { after: [a3.hash] })
  stage('by: the other side\'s stop is theirs', p3, s.held, { stage: 'stopped', stop: 'onward', from: stop3.hash, by: 'to' })
}

// ---- 9. A close that carries her circle on ----
{
  const s = story(), gma = s.person('kgma'), heir = s.person('kheir'), wit = s.person('kwit'), host = s.person('khost')
  const succ = s.say(gma, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: heir.id })
  const club = s.say(host, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Allotment', roles: [{ name: 'host', powers: ['sign', 'admit', 'remove'] }, { name: 'member', powers: [] }] })
  const inv = s.say(host, 'grant', { kind: 'member', roles: ['member'] }, { subject: club.hash, to: gma.id, as: club.hash })
  s.say(gma, 'grant', { status: 'accepted', kind: 'member' }, { answers: inv.hash, subject: club.hash })
  const t = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: succ.hash, subject: gma.id })
  s.say(heir, 'observe', { kind: 'close', continues: [club.hash] }, { under: succ.hash, subject: gma.id, after: [t.hash] })
  door('close: a close that names the circle in continues keeps her in it', 'circle_state', [club.hash, s.held], { expect: { members: { [gma.id]: { roles: ['member'] } }, removed: {} } })
}

// ---- 10. The second review: what it found, pinned ----
// A door call that must be refused as an argument error.
function refusedArg(name, op, args) {
  args = JSON.parse(JSON.stringify(args))
  let threw = null
  try { call(op, ...args) } catch (e) { threw = e }
  assert.ok(threw && threw.kind === 'argument', `${name}: expected an argument error, got ${threw ? threw.kind : 'an answer'}`)
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, error: { kind: 'argument' } })
}
// The parts of a stage the spec fixes.
const stagePart = (s) => s && { stage: s.stage, stop: s.stop, from: s.from, by: s.by, accept: s.accept }
// A fuzz finding (signed blocks and the call), pinned with what the core answers, read through `pick`.
// Each fixture is a story a randomized core-against-oracle run found (signed blocks and the call), kept so the rule stays pinned.
const FINDINGS = path.join(__dirname, 'fixtures-1-7')
function finding(file, i, name, pick = (x) => x) {
  const r = JSON.parse(fs.readFileSync(path.join(FINDINGS, file), 'utf8'))
  const c = r.calls[i]
  return door(name, c.op, c.args, { expect: pick(call(c.op, ...JSON.parse(JSON.stringify(c.args)))) })
}
{
  const roles = (st) => st && { members: Object.fromEntries(Object.entries(st.members).map(([k, m]) => [k, { roles: m.roles }])), removed: st.removed }
  finding('F01-condition-needed-2pow32.json', 0, 'review: a signal needing 2^32 signers does not hold on none')
  finding('F02-founder-grant-cannot-be-stopped.json', 0, 'review: a grant the founder accepted can be stopped; the founder keeps the first role', roles)
  finding('F02-founder-grant-cannot-be-stopped.json', 1, 'review: once that grant is stopped, the founder signs with the first role\'s powers only')
  finding('F02b-fuzz-founder-self-grant.json', 0, 'review: a role the founder held by a stopped grant gives no act under a grant to that role')
  finding('F03a-successor-late-defeat.json', 0, 'review: successor view: a defeats that arrives after the trigger fired cancels nothing')
  finding('F03b-successor-unknown-arrival.json', 1, 'review: successor view: a trigger with no recorded arrival comes after those that have one')
  finding('F03c-successor-event-tie-impure.json', 0, 'review: successor view: two triggers of one witness arriving together: the lowest hash names the event')
  finding('F04-oracle-cut-forgotten-on-readmission.json', 0, 'review: a member invited back still carries the cut of the grant that ended: their accept outside it binds no one', stagePart)
  finding('F04-oracle-cut-forgotten-on-readmission.json', 1, 'review: a member who admits themselves back from outside the cut is not back in', roles)
  finding('F04c-fuzz-cut-then-readmit-no-stage.json', 0, 'review: an offer signed as the circle from outside the cut speaks for no one: no stage', stagePart)
  finding('F05-two-stops-removed-counted-to.json', 0, 'review: two stops that do not see each other both remove the member; removed names no counted_to (a circle reads none)', roles)
  finding('F06-role-re-added-after-answer.json', 0, 'review: a role taken away then added back counts only once the member answers the change that adds it', roles)
  finding('F07-agent-offer-without-grant.json', 0, 'review: an autonomous system\'s offer under no grant is a quote request: an accept binds no one', stagePart)
  finding('F08-concurrent-onward-stops-from.json', 0, 'review: two onward stops that do not see each other, one by each side: from names the lowest hash, by is both (no hash decides it)', stagePart)
  finding('F10a-within-limit-overflow.json', 0, 'review: within_limit compares exactly at any size')
  // (F10b, whose signed parent names scope.per, is retired by decision H14: its twin is in section 29)
  finding('F12b-within-limit-empty-fence.json', 0, 'review: within_limit with a fence that has neither limit nor each is never within')
  finding('F12c-integer-beyond-range-code.json', 0, 'review: a number from 1e21 on is a float: JSON writes it with an exponent', (x) => x.map((r) => ({ code: r.code })))
  finding('G01-crossing-with-an-unseen-answer.json', 0, 'D13: review: a removal and a stop of the remover\'s invitation whose answer it did not see cross: both stand, no member is immune', roles)
  finding('G02-admin-dead-at-the-stop.json', 0, 'review: a member dead in the stop\'s causal past holds no admin power there: one stop removes them (removed names no counted_to)', roles)
  finding('G03-may-act-as-after-death-and-stop.json', 0, 'review: who may sign for the circle after a death and a stop')
  finding('G04-stage-after-death-and-stop.json', 0, 'review: a deal signed as the circle after a death and a stop', stagePart)
  assert.equal(finding('R3-01-goods-to-a-non-side-seed20.json', 0, 'round 3: fuzz: goods moved to someone who is not the to side settle nothing', stagePart).stage, 'accepted')
  finding('G06-under-ok-role.json', 0, 'D13: review: acting under a grant to a role after removals that cross, every one of them standing')
  finding('H01-stops-of-other-grants-do-not-add-up.json', 0, 'review: removing an admin, stops of an earlier grant of theirs do not add up toward the stop of a newer one', roles)
  finding('H02-a-stop-that-removes-no-one-crosses-nothing.json', 0, 'review: a stop too weak to remove anyone crosses nothing: the removal it would have crossed stands', roles)
  finding('H03-an-admin-who-stops-their-own-grant-leaves.json', 0, 'review: an admin who stops their own grant by an updates leaves: a deal they then sign as the circle speaks for no one', stagePart)
}
{
  const s = story(), farm = s.person('vfarm'), mill = s.person('vmill'), judge = s.person('vjudge')
  const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
  // a refrain is breached only by the referee both sides named in its schema (batch 2 P4)
  const rules = s.say(farm, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'residue found', confirmers: [judge.id] } })
  const promise = () => s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash, schema: rules.hash })
  // dated by when it happened
  const p1 = promise(); const a1 = answer(s, mill, p1, { status: 'accepted' })
  const late = s.say(judge, 'observe', { kind: 'test', text: 'residue from the spring', when: '2027-05-01T00:00:00.000Z' }, { defeats: p1.hash, for: p1.hash, after: [a1.hash] }, { time: '2028-02-01T00:00:00.000Z' })
  stage('refrain: a breach is dated by when it happened (its when): found and reported after the term, the referee\'s word still counts (batch 2 P4)', p1, s.held, { stage: 'breached', from: late.hash })
  const p2 = promise(); const a2 = answer(s, mill, p2, { status: 'accepted' })
  s.say(judge, 'observe', { kind: 'test', text: 'residue, sprayed last month', when: { from: '2028-01-05T00:00:00.000Z', to: '2028-01-20T00:00:00.000Z' } }, { defeats: p2.hash, for: p2.hash, after: [a2.hash] })
  stage('refrain: a breach whose range starts after the term breaks nothing', p2, s.held, { stage: 'accepted' })
  // the promiser's own stop: a fact; the referee's word on what happened within the term still counts
  const p3 = promise(); const a3 = answer(s, mill, p3, { status: 'accepted' })
  const leave = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p3.hash, for: p3.hash, after: [a3.hash] })
  stage('refrain: the promiser stopping it alone: stopped, by from (batch 2 P3: no verdict)', p3, s.held, { stage: 'stopped', stop: 'onward', from: leave.hash, by: 'from' })
  const b3 = s.say(judge, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p3.hash, for: p3.hash, after: [leave.hash] })
  stage('refrain: the referee\'s word that it was broken within the term counts, whatever stop came first (batch 2 P4)', p3, s.held, { stage: 'breached', from: b3.hash })
  const p4 = promise(); const a4 = answer(s, mill, p4, { status: 'accepted' })
  const leave4 = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p4.hash, for: p4.hash, after: [a4.hash] })
  const ok4 = s.say(mill, 'observe', { kind: 'agree', text: 'fine by us' }, { confirms: leave4.hash, for: p4.hash })
  s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p4.hash, for: p4.hash, after: [ok4.hash] })
  stage('refrain: a stop the side it was made to agrees to (both) releases it: a later defeats breaks nothing', p4, s.held, { stage: 'stopped', by: 'both' })
  void judge
}
{
  // conditions and the clock
  const s = story(), ann = s.person('kann'), bob = s.person('kbob')
  const flour = s.say(ann, 'thing', { kind: 'flour' })
  s.say(bob, 'observe', { kind: 'price', amount: fb.amount('410', 'GBP/t') }, { subject: flour.hash }, { time: '2027-04-01T09:00:00.000Z' })
  const T = '2027-04-02T00:00:00.000Z', price = { signal: 'price', by: [bob.id], subject: flour.hash }
  holds('conditions: a value with a leading zero is not a decimal: the condition does not hold', { ...price, op: 'ge', value: fb.amount('0400', 'GBP/t') }, s.held, T, false)
  holds('conditions: a reading condition over a span that is not a duration does not hold', { reading: flour.hash, kind: 'temp', op: 'lt', value: fb.amount('5', 'C'), over: 'a while' }, s.held, T, false)
  refusedArg('clock: condition_holds refuses a clock that is not a time', 'condition_holds', [price, s.held, 'tomorrow'])
  refusedArg('clock: promise_view refuses a now that is not a time', 'promise_view', [flour, s.held, { now: '2027-04-02' }])
  refusedArg('clock: live_grant refuses a clock that is not a time', 'live_grant', [null, [], 'x'])
  refusedArg('clock: reading_condition_holds refuses a now that is not a time', 'reading_condition_holds', [{ reading: flour.hash, kind: 'temp', op: 'lt', value: fb.amount('5', 'C'), over: 'PT1H' }, s.held, 5])
  // limits, exactly
  door('limits: within_limit adds what was spent exactly, past 18 decimals', 'within_limit', [{ limit: fb.amount('1.00000000000000000005', 'kg') }, fb.amount('0.00000000000000000002', 'kg'), '1.00000000000000000003'], { expect: true, exact: true })
  door('limits: within_limit refuses a value that is not a decimal (a leading zero)', 'within_limit', [{ limit: fb.amount('3', 'kg') }, fb.amount('01', 'kg'), 0], { expect: false, exact: true })
  door('limits: within_limit with money that names no currency is never within', 'within_limit', [{ limit: M(10) }, { minor: 1 }, 0], { expect: false, exact: true })
}
{
  // forks bind no one: a forked grant gives no authority, a forked stop or decline ends nothing
  const s = story(), farm = s.person('xfarm'), agent = s.person('xagent', { kind: 'agent' })
  const fork = (who, type, state, refs) => {
    const last = [...s.held].reverse().find((b) => b.refs.author === who.id)
    return s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held: s.held.filter((b) => b !== last), at: at(), audience: 'public' }))
  }
  const g1 = s.say(farm, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: agent.id })
  s.say(farm, 'observe', { kind: 'note', text: 'the next block' })
  const g1b = fork(farm, 'observe', { kind: 'note', text: 'and its twin' }, {})
  void g1b
  door('forks: a stop in a forked pair ends nothing (the grant before the fork stays live)', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'checked' }, { under: g1.hash }), s.held], { expect: true, exact: true })
  const s2 = story(), f2 = s2.person('yfarm'), ag2 = s2.person('yagent', { kind: 'agent' })
  s2.say(f2, 'observe', { kind: 'note', text: 'first' })
  const last = [...s2.held].reverse().find((b) => b.refs.author === f2.id)
  const g2 = s2.say(f2, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: ag2.id })
  s2.keep(fb.write('observe', { kind: 'note', text: 'twin of the grant' }, {}, { author: f2.id, key: keyOf(f2.name), held: s2.held.filter((b) => b !== g2), at: at(), audience: 'public' }))
  void last
  door('forks: a grant that is one half of a forked pair gives no authority', 'under_ok', [s2.say(ag2, 'observe', { kind: 'note', text: 'acted' }, { under: g2.hash }), s2.held], { expect: false, exact: true })
}
{
  // operators: a death ends the operator grant, from the close on; a key the operator rotated before it stands
  const s = story(), F = s.person('oF'), S = s.person('oS'), W = s.person('oW'), A = s.person('oA', { kind: 'agent' })
  const og = s.say(F, 'grant', { kind: 'operator' }, { to: A.id })
  // the agent accepts it: an operator answers for a machine only once the machine has said yes (security A, 2026-10-28)
  s.say(A, 'grant', { status: 'accepted' }, { answers: og.hash })
  const act = s.say(A, 'observe', { kind: 'note', text: 'a' })
  const rot = s.say(F, 'grant', { kind: 'key', public_key_sign: keyOf('oAnew').public_key_sign, replaces: keyOf('oA').public_key_sign, counted_to: act.hash }, { subject: A.id })
  const clean = s.keep(fb.write('observe', { kind: 'note', text: 'clean' }, {}, { author: A.id, key: keyOf('oAnew'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: rot.hash } }))
  const succ = s.say(F, 'grant', { kind: 'successor', witnesses: [W.id], needed: 1, wait: 'P7D' }, { to: S.id })
  const trig = s.say(W, 'observe', { kind: 'trigger' }, { under: succ.hash, subject: F.id })
  s.say(S, 'observe', { kind: 'close' }, { under: succ.hash, subject: F.id, after: [trig.hash] })
  const close = s.held[s.held.length - 1]
  door('operators: a key the operator rotated before the death still signs for the agent (the agent accepted the grant)', 'valid', [clean, s.held, null], { expect: [], exact: true })
  // the gate (valid) takes the operator's rotation itself, and refuses the same rotation from a stranger (identity.md, Who may rotate)
  door('operators: the operator\'s rotation of its agent\'s key passes valid (the agent accepted the grant)', 'valid', [rot, s.held, null], { expect: [], exact: true })
  const Z = s.person('oZ')
  const stranger = fb.write('grant', { kind: 'key', public_key_sign: keyOf('oAz').public_key_sign, replaces: keyOf('oAnew').public_key_sign, counted_to: clean.hash }, { subject: A.id }, { author: Z.id, key: keyOf('oZ'), held: s.held, at: at(), audience: 'public' })
  // clean round 1: validity reads only what a block rests on, so who stands behind a key grant about a machine is the identity fold's to judge
  door('operators: a rotation of another\'s key by one who is not its operator is valid (clean round 1: the identity fold judges operators)', 'valid', [stranger, s.held, null], { expect: [], exact: true })
  door('operators: and it brings no key into the agent', 'key_timeline', [A.id, [...s.held, stranger], null], { expect: [{ key: keyOf('oA').public_key_sign }, { key: keyOf('oAnew').public_key_sign }] })
  // after the death, a key grant the dead operator signs (one that sees the close) brings in nothing
  const rot2 = s.say(F, 'grant', { kind: 'key', public_key_sign: keyOf('oAlate').public_key_sign, replaces: keyOf('oAnew').public_key_sign, counted_to: clean.hash }, { subject: A.id, after: [close.hash] })
  door('operators: a rotation the operator signs having seen its own close is valid, and brings in no key (clean round 1)', 'key_timeline', [A.id, s.held, null], { expect: [{ key: keyOf('oA').public_key_sign }, { key: keyOf('oAnew').public_key_sign }] })
  const late = s.keep(fb.write('observe', { kind: 'note', text: 'late' }, {}, { author: A.id, key: keyOf('oAlate'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: rot2.hash } }))
  door('operators: a death ends the operator grant: a block of a key the dead operator brings in after the close is valid, and counts for nothing (clean round 1)', 'signed_by_author', [late, s.held, null], { expect: false, exact: true })
}
{
  // circles: changes of changes, a repeat acceptance, leaving by declining, the founder, removing an admin, the cut
  const s = story(), ann = s.person('zann'), e = s.person('ze'), d = s.person('zd'), b = s.person('zb')
  const club = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Club', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }, { name: 'cook', powers: [] }] })
  const inv = (who, roles, extra = {}) => s.say(ann, 'grant', { kind: 'member', roles }, { subject: club.hash, to: who.id, as: club.hash, ...extra })
  const yes = (who, g, extra = {}) => s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: club.hash, ...extra })
  const ge = inv(e, ['boss']); const y1 = yes(e, ge)
  const u = s.say(ann, 'grant', { kind: 'member', roles: ['mem', 'cook'] }, { updates: ge.hash, subject: club.hash, as: club.hash, after: [y1.hash] })
  const y2 = s.say(e, 'grant', { status: 'accepted', kind: 'member' }, { answers: u.hash, subject: club.hash })
  yes(e, ge, { after: [y2.hash] })
  door('circle: a second accept of a grant already held brings back no role taken away', 'circle_state', [club.hash, s.held], { expect: { members: { [e.id]: { roles: ['mem', 'cook'] } } } })
  const gd = inv(d, ['mem', 'cook']); const yd = yes(d, gd)
  const v1 = s.say(ann, 'grant', { kind: 'member', roles: ['mem', 'cook'] }, { updates: gd.hash, subject: club.hash, as: club.hash, after: [yd.hash] })
  s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { updates: v1.hash, subject: club.hash, as: club.hash })
  door('circle: a change of a change is a change of the same grant: the role it takes away goes', 'circle_state', [club.hash, s.held], { expect: { members: { [d.id]: { roles: ['mem'] } } } })
  const gb = inv(b, ['mem']); const yb = yes(b, gb)
  s.say(b, 'grant', { status: 'declined', kind: 'member' }, { answers: gb.hash, subject: club.hash, after: [yb.hash] })
  door('circle: a member who declines a grant they accepted leaves', 'circle_state', [club.hash, s.held], { expect: { removed: { [b.id]: null } } })
  // the founder accepts a lesser grant from a host, then leaves it: an ordinary member who left (batch 2 P5)
  const gh = inv(b, ['boss']); const yh = yes(b, gh)
  const toAnn = s.say(b, 'grant', { kind: 'member', roles: ['cook'] }, { subject: club.hash, to: ann.id, as: club.hash, after: [yh.hash] })
  const ya = s.say(ann, 'grant', { status: 'accepted', kind: 'member' }, { answers: toAnn.hash, subject: club.hash })
  s.say(ann, 'grant', { status: 'stopped', stop: 'onward', kind: 'member' }, { answers: toAnn.hash, subject: club.hash, after: [ya.hash] })
  door('circle: the founder who accepts a lesser grant, then leaves it, is out like any member (batch 2 P5)', 'circle_state', [club.hash, s.held], { expect: { removed: { [ann.id]: null } } })
  assert.ok(!(ann.id in call('circle_state', club.hash, s.held).members))
}
{
  // removing an admin, judged at the stop; two stops in turn; a removed member's stop of a grant to a role is set aside
  const s = story(), ann = s.person('rann'), e = s.person('re'), f = s.person('rf'), bank = s.person('rbank')
  const pot = s.say(ann, 'actor', { kind: 'circle', name: 'Pot', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }], removal: { needed: 2 } })
  const ge = s.say(ann, 'grant', { kind: 'member', roles: ['boss'] }, { subject: pot.hash, to: e.id, as: pot.hash })
  const ye = s.say(e, 'grant', { status: 'accepted', kind: 'member' }, { answers: ge.hash, subject: pot.hash })
  const lone = s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: ye.hash }, { updates: ge.hash, subject: pot.hash, as: pot.hash, after: [ye.hash] })
  s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { updates: ge.hash, subject: pot.hash, as: pot.hash, after: [lone.hash] })
  door('circle: a lone stop of an admin where two must stands for nothing, and one admin alone cannot take the admin role away either: the member keeps it', 'circle_state', [pot.hash, s.held], { expect: { members: { [e.id]: { roles: ['boss'] } }, removed: {} } })
  const club = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Club', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'till', powers: [] }] })
  const gf = s.say(ann, 'grant', { kind: 'member', roles: ['boss', 'till'] }, { subject: club.hash, to: f.id, as: club.hash })
  const yf = s.say(f, 'grant', { status: 'accepted', kind: 'member' }, { answers: gf.hash, subject: club.hash })
  const note = s.say(f, 'observe', { kind: 'note', text: 'last thing before going' })
  const first = s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: yf.hash }, { updates: gf.hash, subject: club.hash, as: club.hash, after: [yf.hash] })
  s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: note.hash }, { updates: gf.hash, subject: club.hash, as: club.hash, after: [first.hash, note.hash] })
  door('circle: of two stops in turn, the member is out; removed names no counted_to (a circle reads none)', 'circle_state', [club.hash, s.held], { expect: { removed: { [f.id]: null } } })
  // a grant to the till role, and the removed member's stop of it from outside the cut
  const g = s.say(ann, 'grant', { kind: 'member', roles: ['till'] }, { subject: club.hash, to: e.id, as: club.hash })
  const yt = s.say(e, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: club.hash })
  const till = s.say(ann, 'grant', { kind: 'statements', to_role: 'till', scope: { acts: ['observe'], until: LATER } }, { to: club.hash, as: club.hash })
  s.say(f, 'grant', { kind: 'statements', status: 'stopped', stop: 'onward' }, { updates: till.hash, as: club.hash, after: [till.hash] })
  door('circle: a removed member\'s stop of a grant the circle gave, from outside the cut, is set aside: the grant stands', 'under_ok', [s.say(e, 'observe', { kind: 'note', text: 'statement read' }, { under: till.hash, after: [yt.hash] }), s.held], { expect: true, exact: true })
  void bank
}
{
  // checks
  const ID = '0'.repeat(64)
  check('refs: a link is never an empty set', { type: 'observe', state: { kind: 'note' }, refs: { for: [] } }, ['grammar'])
  check('grant: depth is a whole number', { type: 'grant', state: { kind: 'operator', depth: '1' }, refs: { to: ID } }, ['shape'])
  check('promise: terms.needs is data, never a bare name', { type: 'promise', state: { terms: { needs: 'done', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
  check('successor: needed is no more than the number of witnesses', { type: 'grant', state: { kind: 'successor', witnesses: [ID], needed: 2, wait: 'P7D' }, refs: { to: ID } }, ['shape'])
  // (its witness is someone other than its successor: security D refuses a successor who is a witness, section 19)
  check('H11: successor: a successor grant may carry a scope.until: it ends then (before: scope_until)', { type: 'grant', state: { kind: 'successor', witnesses: ['2'.repeat(64)], needed: 1, wait: 'P7D', scope: { until: LATER } }, refs: { to: ID } }, [])
  check('repeat: an event repeat\'s signers are ids or circle#role', { type: 'promise', state: { terms: { price: M(300), expires: DAY, repeat: { after: 'moon_sighted', by: ['someone'], wait: 'PT12H' } } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
  check('occurrences: an entry that is neither a time nor a hash is refused', { type: 'promise', state: { status: 'stopped', stop: { occurrences: ['abc'] } }, refs: { updates: ID, for: ID } }, ['bad_status'])
  check('occurrences: an uppercase hash is refused', { type: 'promise', state: { status: 'stopped', stop: { occurrences: ['B'.repeat(64)] } }, refs: { updates: ID, for: ID } }, ['bad_status'])
  check('occurrences: a date with no time is refused', { type: 'promise', state: { status: 'stopped', stop: { occurrences: ['2026-11-09'] } }, refs: { updates: ID, for: ID } }, ['bad_status'])
  check('occurrences: nothing else sits beside occurrences', { type: 'promise', state: { status: 'stopped', stop: { occurrences: [], extra: 1 } }, refs: { updates: ID, for: ID } }, ['bad_status'])
  // a grant passed on by someone who is not the receiver, and wider: both refusals
  const s = story(), farm = s.person('pfarm'), agent = s.person('pagent', { kind: 'agent' }), eve = s.person('peve')
  const parent = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], limit: M(1000), every: 'P7D', until: LATER } }, { to: agent.id })
  check('grants: a child by a non-receiver that is also wider gives both refusals', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], limit: M(2000), every: 'P7D', until: LATER } }, refs: { parent: parent.hash, to: ID, author: eve.id } }, ['wider_than_parent', 'not_receiver'], s.held)
  const cp = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['observe'], until: LATER, condition: { a: { x: 1 } } } }, { to: agent.id })
  check('grants: a child keeps each of the parent\'s conditions exactly: adding inside a nested one is wider', { type: 'grant', state: { kind: 'authority', scope: { acts: ['observe'], until: LATER, condition: { a: { x: 1, y: 2 } } } }, refs: { parent: cp.hash, to: ID, author: agent.id } }, ['wider_than_parent'], s.held)
  check('grants: a child may add a condition of its own beside the parent\'s', { type: 'grant', state: { kind: 'authority', scope: { acts: ['observe'], until: LATER, condition: { a: { x: 1 }, b: true } } }, refs: { parent: cp.hash, to: ID, author: agent.id } }, [], s.held)
}

{
  // a counter need not name what moves again; crossing removals decide whose stop names the cut
  const s = story(), cook = s.person('wcook'), shop = s.person('wshop'), b = s.person('wb'), d = s.person('wd'), e = s.person('we')
  const bread = s.say(cook, 'thing', { kind: 'bread' })
  const p = s.say(cook, 'promise', { terms: { price: M(500), quantity: fb.amount('2', 'kg'), expires: DAY } }, { from: cook.id, to: shop.id, what: bread.hash })
  const counter = answer(s, shop, p, { terms: { price: M(450), quantity: fb.amount('2', 'kg'), expires: DAY } })
  answer(s, cook, counter, { status: 'accepted' }, { for: p.hash })
  const loaf = s.say(cook, 'thing', { kind: 'bread', pack: fb.amount('2', 'kg') }, { of: bread.hash })
  const give = s.say(cook, 'transfer', {}, { what: loaf.hash, to_owner: shop.id, for: p.hash })
  s.say(shop, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
  const pay = s.say(shop, 'transfer', { money: M(450) }, { what: shop.id, to_owner: cook.id, for: p.hash })
  s.say(cook, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash })
  stage('counter: a counter that names no refs.what moves what the first promise names: delivered and paid, it is done', p, s.held, { stage: 'done' })
  const c = s.say(b, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Crew', roles: [{ name: 'r0', powers: ['sign', 'admit', 'remove'] }] })
  const gd = s.say(b, 'grant', { kind: 'member', roles: ['r0'] }, { subject: c.hash, to: d.id, as: c.hash })
  const yd = s.say(d, 'grant', { status: 'accepted', kind: 'member' }, { answers: gd.hash, subject: c.hash })
  const ge = s.say(b, 'grant', { kind: 'member', roles: ['r0'] }, { subject: c.hash, to: e.id, as: c.hash, after: [yd.hash] })
  const ye = s.say(e, 'grant', { status: 'accepted', kind: 'member' }, { answers: ge.hash, subject: c.hash })
  s.say(b, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: gd.hash, subject: c.hash, as: c.hash })
  s.say(d, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: ye.hash }, { updates: ge.hash, subject: c.hash, as: c.hash })
  s.say(e, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: yd.hash }, { updates: gd.hash, subject: c.hash, as: c.hash })
  // the founder also removed d, and d's stop of e is not in that stop's past: a crossing stop is kept only from the cut of the stop it crosses
  door('circle: of two removals that cross, the earlier member\'s would win, but the founder removed that member too: their stop is outside the founder\'s cut, so the other stays', 'circle_state', [c.hash, s.held], { expect: { members: { [e.id]: { roles: ['r0'] } }, removed: { [d.id]: null } } })
}

{
  // a member who stops their own grant by an updates leaves: no power, no quorum
  const s = story(), ann = s.person('lann'), bea = s.person('lbea'), cal = s.person('lcal')
  const c = s.say(ann, 'actor', { kind: 'circle', name: 'Board', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }], removal: { needed: 2 } })
  const gb = s.say(ann, 'grant', { kind: 'member', roles: ['boss'] }, { subject: c.hash, to: bea.id, as: c.hash })
  const yb = s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: gb.hash, subject: c.hash })
  s.say(bea, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: gb.hash, subject: c.hash, as: c.hash, after: [yb.hash] })
  const gc = s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: cal.id, as: c.hash })
  const yc = s.say(cal, 'grant', { status: 'accepted', kind: 'member' }, { answers: gc.hash, subject: c.hash })
  s.say(cal, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: gc.hash, subject: c.hash, after: [yc.hash] })
  door('circle: a member who stops their own grant by an updates leaves, an admin with no quorum and a member with no power alike', 'circle_state', [c.hash, s.held], { expect: { members: { [ann.id]: { roles: ['boss'] } } } })
  const st = call('circle_state', c.hash, s.held)
  assert.ok(bea.id in st.removed && cal.id in st.removed)
}

// ---- 11. Fix round 1: a circle is folded all at once, never in the order a reader met its blocks ----
{
  const roles = (st) => st && { members: Object.fromEntries(Object.entries(st.members).map(([k, m]) => [k, { roles: m.roles }])), removed: st.removed }
  finding('R1-01-oracle-two-accepts-order.json', 0, 'round 1: two accepts of one invitation and a stop that saw the first: she joined, then was removed', roles)
  finding('R1-01-oracle-two-accepts-order.json', 1, 'round 1: the same blocks held in another order give the same circle', roles)
  finding('R1-02-oracle-void-sets-aside-the-close.json', 0, 'round 1: a successor\'s close is never set aside by a cut of the successor: the dead founder\'s note speaks for no one')
  finding('R1-02-oracle-void-sets-aside-the-close.json', 1, 'round 1: a successor who leaves with an early cut still closed the founder: the founder is out', roles)
  finding('R1-03-core-ignores-second-own-leave.json', 0, 'round 1: a member\'s second leaving of an ended grant cuts too: a block outside it speaks for no one')
  finding('R1-03-core-ignores-second-own-leave.json', 1, 'round 1: a member\'s second leaving of an ended grant names removed like any later stop', roles)
  finding('R1-04-core-insufficient-removal-names-cut.json', 0, 'round 1: a removal short of its quorum names nothing, though the member left by another stop', roles)
  finding('R1-05-core-early-stop-crosses-nothing.json', 0, 'D13: round 1: a stop of an invitation whose answer it did not see crosses a removal: both stand', roles)
  finding('R1-06-core-early-stop-drops-last-head-silently.json', 0, 'round 1: a member whose one grant ended and whose other was stopped before her answer is removed', roles)
  finding('R1-07-circle-state-unknown-circle.json', 0, 'round 1: circle_state of a circle not held is null')
  finding('R1-08-core-invitee-revives-a-grant-she-stopped-answers.json', 0, 'round 1: an invitee who stops her invitation by an answer and then accepts never joins', roles)
  finding('R1-08-core-invitee-revives-a-grant-she-stopped-answers.json', 1, 'round 1: an invitee who stopped her invitation by an answer does not sign for the circle by it')
  finding('R1-08-core-invitee-revives-a-grant-she-stopped-updates.json', 0, 'round 1: an invitee who stops her invitation by an updates and then accepts never joins', roles)
  finding('R1-08-core-invitee-revives-a-grant-she-stopped-updates.json', 1, 'round 1: an invitee who stopped her invitation by an updates does not sign for the circle by it')
}
{
  const s = story(), ann = s.person('xann'), bea = s.person('xbea'), cal = s.person('xcal'), dee = s.person('xdee'), fay = s.person('xfay')
  const R = [{ name: 'host', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }]
  const circle = (who, name, extra = {}) => s.say(who, 'actor', { kind: 'circle', removal: { needed: 1 }, name, roles: R, ...extra })
  const invite = (by, c, to, roles, after) => s.say(by, 'grant', { kind: 'member', roles }, { subject: c.hash, ...(to ? { to: to.id } : {}), as: c.hash }, { after })
  const accept = (who, c, g) => s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: c.hash })
  const stop = (by, c, g, after, counted_to) => s.say(by, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', ...(counted_to ? { counted_to } : {}) }, { updates: g.hash, subject: c.hash, as: c.hash }, { after })
  const leave = (who, c, g, status = 'stopped') => s.say(who, 'grant', { status, kind: 'member', ...(status === 'stopped' ? { stop: 'onward' } : {}) }, { answers: g.hash, subject: c.hash })
  const state = (name, c, expect, held = s.held) => door(name, 'circle_state', [c.hash, held], { expect })
  // two accepts, and a stop that saw only the first: whichever order a reader holds them in
  const c1 = circle(ann, 'Two accepts')
  const g1 = invite(ann, c1, bea, ['mem'])
  const y1 = accept(bea, c1, g1)
  accept(bea, c1, g1)
  stop(ann, c1, g1, [y1.hash])
  state('circle: a stop that saw her first accept and not her second removes her', c1, { members: { [ann.id]: { roles: ['host'] } }, removed: { [bea.id]: null } })
  state('circle: the same, the blocks held in reverse', c1, { removed: { [bea.id]: null } }, [...s.held].reverse())
  // a second leaving of a grant already ended still cuts and still names removed
  const c2 = circle(ann, 'Leaves twice')
  const g2 = invite(ann, c2, bea, ['host'])
  const y2 = accept(bea, c2, g2)
  const note = s.say(bea, 'observe', { kind: 'note', text: 'for the circle' }, { as: c2.hash })
  leave(bea, c2, g2)
  s.say(bea, 'grant', { status: 'stopped', stop: 'onward', kind: 'member', counted_to: y2.hash }, { answers: g2.hash, subject: c2.hash })
  state('circle: of two leavings of one grant, she is out; removed names no counted_to (a circle reads none)', c2, { removed: { [bea.id]: null } })
  // a member's own leaving cuts at the stop itself, whatever counted_to it names (circles.md, Leaving and removal; Patrick's round-1 decision 1)
  door('circle: a second leaving naming an earlier counted_to still cuts at the stop: what she signed before it speaks', 'may_act_as', [note, c2.hash, s.held], { expect: true, exact: true })
  // a removal short of its quorum names nothing, though she left by her own stop
  const c3 = circle(ann, 'Quorum', { removal: { needed: 2 } })
  const g3 = invite(ann, c3, bea, ['host'])
  const y3 = accept(bea, c3, g3)
  leave(bea, c3, g3)
  stop(ann, c3, g3, [y3.hash], bea.id)
  state('circle: a lone removal where two must names no counted_to: her own leaving does', c3, { removed: { [bea.id]: null } })
  // every stop of a quorum ends the grant: removed names the lowest hash of those that do not see each other
  const c4 = circle(ann, 'Board', { removal: { needed: 2 } })
  const gc = invite(ann, c4, cal, ['host'])
  const yc = accept(cal, c4, gc)
  const gd = invite(ann, c4, dee, ['host'], [yc.hash])
  const yd = accept(dee, c4, gd)
  const memo = s.say(dee, 'observe', { kind: 'note', text: 'memo' })
  const sa = stop(ann, c4, gd, [yd.hash, yc.hash], yd.hash)
  const sc = stop(cal, c4, gd, [yd.hash], memo.hash)
  const low = [sa, sc].sort((x, y) => (x.hash < y.hash ? -1 : 1))[0]
  assert.ok(low)
  state('circle: two stops make a quorum: the member is out; removed names no counted_to (a circle reads none)', c4, { removed: { [dee.id]: null } })
  // a stop that saw none of her accepts, beside her own leaving: she never joined
  const c5 = circle(ann, 'Unseen')
  const g5 = invite(ann, c5, bea, ['mem'])
  accept(bea, c5, g5)
  leave(bea, c5, g5)
  stop(ann, c5, g5, [g5.hash])
  state('circle: a removal that saw no answer beside her own leaving: she never joined, so is not in removed', c5, { members: { [ann.id]: { roles: ['host'] } }, removed: {} })
  // her own stop before her answer ends the invitation, by each of the three routes
  for (const [route, write] of [['declined', (g, c) => leave(bea, c, g, 'declined')], ['stopped answer', (g, c) => leave(bea, c, g)], ['stopped update', (g, c) => s.say(bea, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: g.hash, subject: c.hash })]]) {
    const c = circle(ann, `Own stop ${route}`)
    const g = invite(ann, c, bea, ['host'])
    write(g, c)
    accept(bea, c, g)
    const x = s.say(bea, 'observe', { kind: 'note', text: 'mine' }, { as: c.hash })
    state(`circle: an invitee whose own stop (${route}) came before her answer never joins`, c, { members: { [ann.id]: { roles: ['host'] } }, removed: {} })
    door(`circle: an invitee whose own stop (${route}) came before her answer does not sign for the circle`, 'may_act_as', [x, c.hash, s.held], { expect: false, exact: true })
  }
  // two invitations to one person: one ended after her answer, the other stopped before it
  const c6 = circle(ann, 'Twice invited')
  const h1 = invite(ann, c6, bea, ['mem'])
  const k1 = accept(bea, c6, h1)
  const h2 = invite(ann, c6, bea, ['mem'])
  accept(bea, c6, h2)
  stop(ann, c6, h1, [k1.hash])
  stop(ann, c6, h2, [h2.hash])
  state('circle: one grant ended after her answer and the other stopped before it: she is removed', c6, { members: { [ann.id]: { roles: ['host'] } }, removed: { [bea.id]: null } })
  // a stop of an invitation whose answer it did not see crosses a removal by the one it stopped
  const c7 = circle(fay, 'Crossing')
  const ga = invite(fay, c7, ann, ['host'])
  const ya = accept(ann, c7, ga)
  const gdd = invite(fay, c7, dee, ['host'], [ya.hash])
  const ydd = accept(dee, c7, gdd)
  stop(ann, c7, gdd, [gdd.hash, ya.hash])
  stop(dee, c7, ga, [ydd.hash])
  state('D13: circle: an early stop crosses a removal by the one it stopped: both stand, so the earlier member is out too and the other never joined', c7, { members: { [fay.id]: { roles: ['host'] } }, removed: { [ann.id]: null } })
  // an open group: everyone who accepts is in; a joiner leaves alone; a stop of the grant ends it for every joiner
  const c8 = circle(ann, 'Open')
  const open = invite(ann, c8, null, ['mem'])
  const yo = accept(bea, c8, open)
  const yt = accept(cal, c8, open)
  state('circle: an open grant makes everyone who accepts it a member', c8, { members: { [ann.id]: { roles: ['host'] }, [bea.id]: { roles: ['mem'] }, [cal.id]: { roles: ['mem'] } }, removed: {} })
  leave(bea, c8, open)
  state('circle: a joiner of an open grant leaves alone', c8, { members: { [cal.id]: { roles: ['mem'] } }, removed: { [bea.id]: null } })
  const endOpen = stop(ann, c8, open, [yt.hash, yo.hash])
  state('H12: circle: a stop of an open grant ends only future joins: who joined by it stays (before: it removed every joiner)', c8, { members: { [ann.id]: { roles: ['host'] }, [cal.id]: { roles: ['mem'] } }, removed: { [bea.id]: null } })
  assert.ok(!(cal.id in call('circle_state', c8.hash, s.held).removed))
  // (explicit times: the blocks added here take no tick of the story clock, so no later case's bytes change)
  s.say(dee, 'grant', { status: 'accepted', kind: 'member' }, { answers: open.hash, subject: c8.hash }, { time: '2027-01-02T00:00:00.000Z' })
  state('H12: circle: an accept the stop of the open grant had not seen joins nothing', c8, { members: { [ann.id]: { roles: ['host'] }, [cal.id]: { roles: ['mem'] } }, removed: { [bea.id]: null } })
  assert.ok(!(dee.id in call('circle_state', c8.hash, s.held).members))
  s.say(ann, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: open.hash, subject: c8.hash, as: c8.hash, to: cal.id }, { after: [endOpen.hash], time: '2027-01-03T00:00:00.000Z' })
  state('H12: circle: a stop of the open grant that names a joiner in refs.to removes that joiner, by the circle\'s removal rule', c8, { members: { [ann.id]: { roles: ['host'] } }, removed: { [bea.id]: null, [cal.id]: null } })
  // a role is named once
  check('circle: two roles of one name are refused', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, name: 'Dup', roles: [{ name: 'x', powers: ['sign'] }, { name: 'x', powers: ['admit'] }] }, refs: {} }, ['bad_roles'])
}

// ---- 12. Fix round 1: promises, deaths, conditions, time and the checks ----
{
  // a counter written after the deal bound ends nothing: the deal stays where it was
  const s = story(), baker = s.person('ybaker'), cafe = s.person('ycafe')
  const bread = s.say(baker, 'thing', { kind: 'bread' })
  const p = s.say(baker, 'promise', { terms: { price: M(300), expires: DAY } }, { from: baker.id, to: cafe.id, what: bread.hash })
  const yes = answer(s, cafe, p, { status: 'accepted' })
  const pay = s.say(cafe, 'transfer', { money: M(300) }, { what: cafe.id, to_owner: baker.id, for: p.hash, after: [yes.hash] })
  s.say(baker, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash })
  stage('counter: before any counter, the paid deal is underway', p, s.held, { stage: 'underway', paid: { minor: 300 } })
  answer(s, cafe, p, { terms: { price: M(200), expires: DAY } }, { after: [yes.hash, pay.hash] })
  stage('counter: a counter that saw the accept of the offer it answers ends nothing: still underway, still paid', p, s.held, { stage: 'underway', paid: { minor: 300 }, accept: yes.hash })
}
{
  // the wronged side's word is a dispute (batch 2 P4): its stop or its agreement to the promiser's stop ends the deal, and the dispute stays shown
  const s = story(), farm = s.person('zfarm'), mill = s.person('zmill')
  const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
  const promise = () => s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash })
  const p1 = promise(), y1 = answer(s, mill, p1, { status: 'accepted' })
  const b1 = s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p1.hash, for: p1.hash, after: [y1.hash] })
  answer(s, mill, p1, { status: 'stopped', stop: 'onward' }, { after: [b1.hash] })
  stage('refrain: the wronged side\'s own word is a dispute, and its stop after it ends the deal: stopped, the dispute shown (batch 2 P4)', p1, s.held, { stage: 'stopped', by: 'to', disputed: [{ hash: b1.hash, of: p1.hash, by: 'to' }] })
  const p2 = promise(), y2 = answer(s, mill, p2, { status: 'accepted' })
  const own = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p2.hash, for: p2.hash, after: [y2.hash] })
  const b2 = s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p2.hash, for: p2.hash, after: [own.hash] })
  s.say(mill, 'observe', { kind: 'agree', text: 'fine, it is over' }, { confirms: own.hash, for: p2.hash, after: [b2.hash] })
  stage('refrain: the promiser\'s stop, agreed after the other side disputed it: stopped by both, the dispute shown (batch 2 P4)', p2, s.held, { stage: 'stopped', by: 'both', disputed: [{ hash: b2.hash, of: p2.hash, by: 'to' }] })
  const p3 = promise(), y3 = answer(s, mill, p3, { status: 'accepted' })
  const own3 = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p3.hash, for: p3.hash, after: [y3.hash] })
  const ok3 = s.say(mill, 'observe', { kind: 'agree', text: 'fine' }, { confirms: own3.hash, for: p3.hash })
  s.say(mill, 'observe', { kind: 'test', text: 'residue found' }, { defeats: p3.hash, for: p3.hash, after: [ok3.hash] })
  stage('refrain: a release agreed before the breach still erases it', p3, s.held, { stage: 'stopped', by: 'both' })
  // paid for, then paid back in full: reversed, neither kept nor broken
  const p4 = s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY, price: M(5000) } }, { from: farm.id, to: mill.id, what: spray.hash })
  answer(s, mill, p4, { status: 'accepted' })
  const pay = s.say(mill, 'transfer', { money: M(5000) }, { what: mill.id, to_owner: farm.id, for: p4.hash })
  s.say(farm, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p4.hash })
  const back = s.say(farm, 'transfer', { money: M(5000) }, { what: farm.id, to_owner: mill.id, for: p4.hash })
  s.say(mill, 'transfer', { status: 'accepted' }, { answers: back.hash, for: p4.hash })
  stage('refrain: paid and paid back in full is reversed', p4, s.held, { stage: 'reversed' })
  view('refrain: paid back in full is reversed in the view too, never done', p4, s.held, AFTER, { stage: 'reversed' })
}
{
  // a weekly promise is never done as a whole: one week delivered and paid is underway, and a stop or a death still ends it
  const s = story(), farm = s.person('wfarm2'), mum = s.person('wmum'), kid = s.person('wkid'), wit = s.person('wwit')
  const box = s.say(farm, 'thing', { kind: 'veg box' })
  const weekly = () => { const p = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(1500), expires: DAY } }, { from: farm.id, to: mum.id, what: box.hash }); answer(s, mum, p, { status: 'accepted' }); return p }
  const week = (p) => {
    const one = s.say(farm, 'thing', { kind: 'veg box', week: 1 }, { of: box.hash })
    const t = s.say(farm, 'transfer', {}, { what: one.hash, to_owner: mum.id, for: p.hash })
    s.say(mum, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash })
    const pay = s.say(mum, 'transfer', { money: M(1500) }, { what: mum.id, to_owner: farm.id, for: p.hash })
    s.say(farm, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash })
  }
  const w1 = weekly(); week(w1)
  stage('repeat: one week delivered and paid is underway, never done as a whole', w1, s.held, { stage: 'underway' })
  const stop = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: w1.hash, for: w1.hash })
  stage('repeat: a stop after one week ends it', w1, s.held, { stage: 'stopped', from: stop.hash, by: 'from' })
  const w2 = weekly(); week(w2)
  const g = s.say(mum, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: kid.id })
  const t = s.say(wit, 'observe', { kind: 'trigger' }, { under: g.hash, subject: mum.id })
  const close = s.say(kid, 'observe', { kind: 'close' }, { under: g.hash, subject: mum.id, after: [t.hash] })
  stage('repeat: a death after one week ends no promise: underway, what was paid still shown (batch 2 P7)', w2, s.held, { stage: 'underway', from: null, paid: { minor: 1500 } })
  void close
}
{
  // a refrain whose promiser died before its until outlives her: a death ends authority, never a promise (batch 2 P7)
  const s = story(), gran = s.person('rgran'), shop = s.person('rshop'), heir = s.person('rheir'), doc = s.person('rdoc')
  const jam = s.say(gran, 'thing', { kind: 'jam' })
  const p = s.say(gran, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: gran.id, to: shop.id, what: jam.hash })
  answer(s, shop, p, { status: 'accepted' })
  const g = s.say(gran, 'grant', { kind: 'successor', witnesses: [doc.id], needed: 1, wait: 'P7D' }, { to: heir.id })
  const t = s.say(doc, 'observe', { kind: 'trigger' }, { under: g.hash, subject: gran.id })
  const close = s.say(heir, 'observe', { kind: 'close' }, { under: g.hash, subject: gran.id, after: [t.hash] })
  stage('refrain: a refrain outlives its promiser\'s death: still accepted, never stopped by the close (batch 2 P7)', p, s.held, { stage: 'accepted', from: null })
  void close
}
{
  // a close counts only under a successor grant that counts and covers it
  const s = story(), pa = s.person('spa'), kid = s.person('skid'), wit = s.person('swit'), ag = s.person('sag', { kind: 'agent' })
  const errands = s.say(pa, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: ag.id })
  const narrow = s.say(pa, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D', scope: { acts: ['promise'] } }, { to: kid.id })
  const t1 = s.say(wit, 'observe', { kind: 'trigger' }, { under: narrow.hash, subject: pa.id })
  const c1 = s.say(kid, 'observe', { kind: 'close' }, { under: narrow.hash, subject: pa.id, after: [t1.hash] })
  door('close: under a successor grant whose scope does not cover the close, it ends nothing', 'under_ok', [s.say(ag, 'observe', { kind: 'note', text: 'still here' }, { under: errands.hash, after: [c1.hash] }), s.held], { expect: true, exact: true })
  // a forked successor grant: two of her blocks name one prev, so neither counts
  const g1 = s.say(pa, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: kid.id })
  s.keep(fb.write('grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P30D' }, { to: kid.id }, { author: pa.id, key: keyOf(pa.name), held: s.held.filter((b) => b !== g1), at: at(), audience: 'public' }))
  const t2 = s.say(wit, 'observe', { kind: 'trigger' }, { under: g1.hash, subject: pa.id })
  const c2 = s.say(kid, 'observe', { kind: 'close' }, { under: g1.hash, subject: pa.id, after: [t2.hash] })
  door('close: under one half of a forked successor grant, it ends nothing', 'under_ok', [s.say(ag, 'observe', { kind: 'note', text: 'still here too' }, { under: errands.hash, after: [c2.hash] }), s.held], { expect: true, exact: true })
  // a trigger about someone else is no event of this grant
  const g3 = s.say(kid, 'grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: pa.id })
  s.say(wit, 'observe', { kind: 'trigger' }, { under: g3.hash, subject: ag.id })
  door('successor view: a trigger about someone else is no event', 'successor_view', [g3, s.held, AFTER, null], { expect: { events: [], fired: false } })
}
{
  // the recovery key's first block may be the defeats of a trigger
  const s = story(), wit = s.person('qwit'), heir = s.person('qheir')
  const rec = fb.keypairFromSeed(sha('foodblock 1.7 vectors: recovery q'), 'std')
  const me = keyOf('qme')
  const g = s.keep(genesis(me, { kind: 'person', at: at(), recoveryKey: rec.public_key_sign, reach: 'P30D' }))
  const succ = s.keep(fb.write('grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: heir.id }, { author: g.hash, key: me, held: s.held, at: at(), audience: 'public' }))
  const t = s.say(wit, 'observe', { kind: 'trigger' }, { under: succ.hash, subject: g.hash })
  const O = require('../../../spec/oracle/fb.cjs')
  const d = { type: 'observe', state: { kind: 'alive', at: at(), audience: 'public', seq: 1, recovery_key: rec.public_key_sign }, refs: { author: g.hash, prev: g.hash, defeats: t.hash, under: succ.hash } }
  d.hash = O.hashOfBlock(d); d.signature = O.signBlock(d, rec.private_key)
  door('recovery: its first block (seq 1, prev the genesis) may be the defeats of a trigger', 'valid', [d, s.held, null, null], { expect: [], exact: true })
  // the recovery key defeats only triggers under a successor grant its author gave, named in refs.under (profiles/successor.md)
  const bare = { type: 'observe', state: { kind: 'alive', at: at(), audience: 'public', seq: 1, recovery_key: rec.public_key_sign }, refs: { author: g.hash, prev: g.hash, defeats: t.hash } }
  bare.hash = O.hashOfBlock(bare); bare.signature = O.signBlock(bare, rec.private_key)
  door('recovery: a defeats that names no successor grant in refs.under is outside its scope', 'valid', [bare, s.held, null, null], { expect: [{ code: 'recovery_scope' }] })
  const other = s.say(heir, 'promise', { terms: { refrain: true, until: LATER } }, { from: heir.id, to: g.hash, what: wit.id })
  const wide = { type: 'observe', state: { kind: 'alive', at: at(), audience: 'public', seq: 1, recovery_key: rec.public_key_sign }, refs: { author: g.hash, prev: g.hash, defeats: other.hash, under: succ.hash } }
  wide.hash = O.hashOfBlock(wide); wide.signature = O.signBlock(wide, rec.private_key)
  void wide // retired in clean round 2: such a defeats is valid (section 24)
}
{
  // a sensor's operator: each reading is judged by the grant as of that reading, so a death later takes nothing back
  const s = story(), farmer = s.person('ofarmer'), dev = s.person('odevice', { kind: 'machine' }), son = s.person('oson'), w = s.person('ow')
  const probe = s.say(farmer, 'thing', { kind: 'sensor', name: 'probe' })
  const T = (h, m = 0) => `2026-11-03T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
  const reading = (who, v, h) => s.say(who, 'observe', { kind: 'temperature', amount: { value: v, unit: 'Cel' } }, { from: probe.hash }, { time: T(h) })
  s.say(farmer, 'grant', { kind: 'operator' }, { to: dev.id, subject: probe.hash })
  reading(dev, '-2', 1); reading(dev, '-3', 2)
  const cond = { reading: probe.hash, kind: 'temperature', op: 'lt', value: { value: '0', unit: 'Cel' }, over: 'PT1H' }
  const succ = s.say(farmer, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: son.id })
  const t = s.say(w, 'observe', { kind: 'trigger' }, { under: succ.hash, subject: farmer.id })
  s.say(son, 'observe', { kind: 'close' }, { under: succ.hash, subject: farmer.id, after: [t.hash] }, { time: '2026-11-10T00:00:00.000Z' })
  door('tasks: readings the operator made before the owner died still count after the close', 'reading_condition_holds', [cond, s.held, T(2, 30)], { expect: true, exact: true })
  // two readings at one instant: every one must keep to the rule, in whatever order they are held
  const s2 = story(), owner = s2.person('oowner')
  const probe2 = s2.say(owner, 'thing', { kind: 'sensor', name: 'probe 2' })
  for (const v of ['4.0', '6.0']) s2.say(owner, 'observe', { kind: 'temperature', amount: { value: v, unit: 'Cel' } }, { from: probe2.hash }, { time: T(1) })
  const cond2 = { reading: probe2.hash, kind: 'temperature', op: 'lt', value: { value: '5', unit: 'Cel' }, over: 'PT1H' }
  door('tasks: two readings at one instant, one breaking the rule: it does not hold', 'reading_condition_holds', [cond2, s2.held, T(2, 30)], { expect: false, exact: true })
  door('tasks: the same two readings held the other way round: it does not hold', 'reading_condition_holds', [cond2, [...s2.held].reverse(), T(2, 30)], { expect: false, exact: true })
}
{
  // time: a duration too large to hold is never small; a nonsense clock is refused
  const s = story(), farm = s.person('tfarm'), agent = s.person('tagent', { kind: 'agent' })
  const parent = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], limit: M(1000), every: 'P30D', until: LATER } }, { to: agent.id })
  for (const per of ['PT99999999999999999999H', 'P99999999999999999999D', 'P8000Y']) {
    check(`H14: time: a child whose scope.every (${per}) cannot be added to a time is wider than its parent's`, { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], limit: M(1000), every: per, until: LATER } }, refs: { parent: parent.hash, to: AUTH, author: agent.id } }, ['wider_than_parent'], s.held)
  }
  const probe = s.say(farm, 'thing', { kind: 'sensor', name: 'probe' })
  s.say(farm, 'observe', { kind: 'temperature', amount: { value: '-1', unit: 'Cel' } }, { from: probe.hash }, { time: '2026-11-03T01:00:00.000Z' })
  door('time: a window too long to hold has no reading before its start: it does not hold', 'reading_condition_holds', [{ reading: probe.hash, kind: 'temperature', op: 'lt', value: { value: '0', unit: 'Cel' }, over: 'PT99999999999999999999H' }, s.held, '2026-11-03T02:00:00.000Z'], { expect: false, exact: true })
  refusedArg('clock: 30 February is no clock', 'condition_holds', [{ deed: probe.hash }, s.held, '2026-02-30T00:00:00.000Z'])
  refusedArg('clock: second 60 is no clock', 'condition_holds', [{ deed: probe.hash }, s.held, '2026-02-03T00:00:60.000Z'])
}
{
  // exact decimals: a shortfall of one in seventeen digits is not done
  const s = story(), mill = s.person('dmill'), baker = s.person('dbaker')
  const grain = s.say(mill, 'thing', { kind: 'grain' })
  const p = s.say(mill, 'promise', { terms: { quantity: fb.amount('9007199254740993', 'g'), expires: DAY } }, { from: mill.id, to: baker.id, what: grain.hash })
  answer(s, baker, p, { status: 'accepted' })
  const t = s.say(mill, 'transfer', { amount: fb.amount('9007199254740992', 'g') }, { what: grain.hash, to_owner: baker.id, for: p.hash })
  s.say(baker, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash })
  stage('exact: one gram short of 9007199254740993 is not done', p, s.held, { stage: 'underway' })
}
{
  // limits: below zero is never within; a cap on each act alone is a limit
  door('limits: an act below zero is never within, whatever was spent', 'within_limit', [{ limit: M(10000) }, M(-5000), 10000], { expect: false, exact: true })
  door('limits: a spent amount below zero is never within', 'within_limit', [{ limit: M(10000) }, M(100), -5000], { expect: false, exact: true })
  door('limits: an unknown suite is refused, never read as the default', 'refusals', ['actor', { kind: 'person', suite: '' }, {}, [], null], { expect: [{ code: 'unknown_suite' }] })
  const s = story(), shop = s.person('lshop'), agent = s.person('lagent', { kind: 'agent' }), mill = s.person('lmill')
  const flour = s.say(mill, 'thing', { kind: 'flour' })
  const g = s.say(shop, 'grant', { kind: 'authority', scope: { acts: ['transfer'], each: M(2000), until: LATER } }, { to: agent.id })
  door('limits: a grant that names the act and caps each act alone lets an autonomous system pay', 'under_ok', [s.say(agent, 'transfer', { money: M(1500) }, { what: shop.id, to_owner: mill.id, under: g.hash, for: flour.hash }), s.held], { expect: true, exact: true })
}
{
  // the checks: ids are text, never a list holding one; each shape the core refuses, the spec refuses
  const ID = '0'.repeat(64), H = 'a'.repeat(64)
  const g = (state, refs = {}) => ({ type: 'grant', state: { kind: 'authority', ...state }, refs: { to: ID, ...refs } })
  check('checks: scope.limit_commitment is an id, not a list holding one', g({ scope: { acts: ['promise'], limit_commitment: [H], until: LATER } }), ['grammar'])
  check('checks: scope.parties lists ids, never a list in a list', g({ scope: { acts: ['promise'], parties: [[H]], until: LATER } }), ['grammar'])
  check('checks: scope.acts is a list of acts', g({ scope: { acts: 'promise', until: LATER } }), ['shape'])
  check('H14: checks: scope.every is a duration, never an amount', g({ scope: { acts: ['promise'], limit: M(100), every: { value: '1', unit: 'kg' }, until: LATER } }), ['time'])
  check('checks: a line\'s what is an id, not a list holding one', { type: 'promise', state: { terms: { lines: [{ id: 'a', what: [H], quantity: fb.amount('1', 'kg') }], expires: DAY } }, refs: { from: AUTH, to: ID, what: H } }, ['lines'])
  check('checks: a line with no what is refused, never thrown', { type: 'promise', state: { terms: { lines: [{ id: 'a', what: H }, { id: 'b' }], expires: DAY } }, refs: { from: AUTH, to: ID, what: H } }, ['lines'])
  check('checks: terms.lines is a list', { type: 'promise', state: { terms: { lines: true, expires: DAY } }, refs: { from: AUTH, to: ID, what: H } }, ['lines'])
  check('checks: when.not_before is a time', { type: 'promise', state: { when: { not_before: 'soon' }, terms: { expires: DAY } }, refs: { from: AUTH, to: ID, what: H } }, ['time'])
  check('checks: when.takes is a duration', { type: 'promise', state: { when: { not_before: DAY, takes: 'an hour' }, terms: { expires: DAY } }, refs: { from: AUTH, to: ID, what: H } }, ['time'])
  for (const [name, removal] of [['0', 0], ['-1', -1], ['a string', '2'], ['an extra key', { needed: 2, x: 1 }], ['empty', {}]]) {
    check(`checks: a circle's removal rule (${name}) is { needed: N }, N at least 1`, { type: 'actor', state: { kind: 'circle', roles: [{ name: 'r', powers: ['sign'] }], removal: typeof removal === 'object' ? removal : { needed: removal } }, refs: {} }, ['shape'])
  }
  check('checks: removal 2.5 is refused at the first check that finds it: a float', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'r', powers: ['sign'] }], removal: { needed: 2.5 } }, refs: {} }, ['float'])
  check('checks: a rekey is signed as the circle', { type: 'grant', state: { kind: 'key', epoch: 2, keys: { sealed: 'x' } }, refs: { subject: ID, after: [ID] } }, ['required'])
  check('checks: an operator grant is never to a role', g({ kind: 'operator', to_role: 'cook' }), ['shape'])
  check('checks: a successor grant is never to a role', { type: 'grant', state: { kind: 'successor', witnesses: [ID], needed: 1, wait: 'P7D', to_role: 'cook' }, refs: { to: ID } }, ['shape'])
  check('repeat: two FREQ parts are refused', { type: 'promise', state: { when: DAY, terms: { price: M(300), expires: DAY, repeat: 'FREQ=WEEKLY;FREQ=DAILY' } }, refs: { from: AUTH, to: ID, what: H } }, ['grammar'])
  check('repeat: an RRULE is upper case', { type: 'promise', state: { when: DAY, terms: { price: M(300), expires: DAY, repeat: 'freq=weekly' } }, refs: { from: AUTH, to: ID, what: H } }, ['grammar'])
  check('repeat: a calendar repeat counts from state.when', { type: 'promise', state: { terms: { price: M(300), expires: DAY, repeat: 'FREQ=WEEKLY' } }, refs: { from: AUTH, to: ID, what: H } }, ['shape'])
  door('checks: a type that is not text is refused for its type', 'refusals', [7, {}, {}, [], null], { expect: [{ code: 'type_name' }] })
  door('checks: a null time is refused at the first check that finds it: not canonical', 'refusals', ['observe', { kind: 'note', seq: 1, at: null, audience: 'public' }, { author: AUTH, prev: AUTH }, [], null], { expect: [{ code: 'not_canonical' }], exact: false })
  check('checks: a limit whose minor is text is refused for its shape, before any rule of the grant', g({ scope: { acts: ['promise'], limit: { minor: '100', currency: 'GBP' } } }), ['shape'])
  let threw = null
  try { call('limit_commitment', M(5000), 'P7D', '00'.repeat(16), 'nope', null) } catch (e) { threw = e }
  assert.ok(threw && threw.code === 'unknown_suite', 'limit_commitment refuses an unknown suite')
}
{
  // consent follows the principal to whoever holds the role a grant was made to
  const s = story(), cal = s.person('kcal'), bank = s.person('kbank'), bea = s.person('kbea')
  const c = s.say(bank, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Bank', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'teller', powers: [] }] })
  const inv = s.say(bank, 'grant', { kind: 'member', roles: ['teller'] }, { subject: c.hash, to: bea.id, as: c.hash })
  s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: inv.hash, subject: c.hash })
  const g = s.say(bank, 'grant', { kind: 'authority', to_role: 'teller', scope: { acts: ['observe'], until: LATER } }, { to: c.hash })
  s.say(cal, 'observe', { kind: 'consent', word: 'stop' }, { subject: bank.id })
  door('consent: a STOP about the grantor reaches a holder of the role the grant was made to', 'consent', [cal.id, bea.id, s.held, g.hash], { expect: { word: 'stop' } })
}
{
  // a circle's roles are those it was founded with: an updates of the actor changes none of them
  const s = story(), ann = s.person('uann'), bea = s.person('ubea'), cal = s.person('ucal')
  const c = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Founded', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }] })
  s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Founded', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: ['admit'] }] }, { updates: c.hash })
  const g = s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: bea.id, as: c.hash })
  const y = s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: c.hash })
  s.say(bea, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: cal.id, as: c.hash, after: [y.hash] })
  door('circle: an updates of the circle actor gives a role no power it was not founded with', 'circle_state', [c.hash, s.held], { expect: { members: { [bea.id]: { roles: ['mem'] } } } })
  assert.ok(!(cal.id in call('circle_state', c.hash, s.held).members))
}

// ---- 13. Fix round 2: what the fuzzer and the fresh reviewers found, pinned ----
{
  const roles = (st) => st && { members: Object.fromEntries(Object.entries(st.members).map(([k, m]) => [k, { roles: m.roles }])), removed: st.removed }
  finding('R2-01-refrain-refund-to-third-party.json', 0, 'round 2: money sent to a stranger is no refund: a part-paid refrain stays underway', stagePart)
  finding('R2-01b-refund-to-stranger-settled-condition.json', 0, 'round 2: money sent to a stranger does not unsettle a settled refrain')
  finding('R2-01c-refund-to-stranger-promise-view.json', 0, 'H15: round 2: money sent to a stranger is no refund: the view reads the refrain elapsed (before: done)', stagePart)
  finding('R2-01d-refund-to-stranger-by-payer.json', 0, 'round 2: the payer sending money to a stranger refunds nothing', stagePart)
  finding('R2-02-oracle-circlefold-exponential-min.json', 0, 'round 2: a circle with a long history of grants and stops folds at once', roles)
  finding('R2-02-oracle-circlefold-exponential-seed7003537.json', 0, 'round 2: a circle with 24 member grants and 16 stops folds at once', roles)
}
{
  // refunds: money back to the side that paid
  const s = story(), farm = s.person('sfarm'), mill = s.person('smill'), eve = s.person('seve')
  const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
  const refrain = (price) => s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY, price: M(price) } }, { from: farm.id, to: mill.id, what: spray.hash })
  const money = (p, who, to, minor) => { const t = s.say(who, 'transfer', { money: M(minor) }, { what: who.id, to_owner: to.id, for: p.hash }); s.say(to, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash }); return t }
  const p1 = refrain(1000)
  answer(s, mill, p1, { status: 'accepted' })
  money(p1, mill, farm, 1000)
  money(p1, farm, eve, 1000)
  stage('round 2: refunds: money the promiser sends a stranger refunds nothing: underway', p1, s.held, { stage: 'underway' })
  money(p1, farm, mill, 1000)
  stage('round 2: refunds: money back to the side that paid, covering it, is reversed', p1, s.held, { stage: 'reversed' })
  const p2 = refrain(1000)
  answer(s, mill, p2, { status: 'accepted' })
  money(p2, mill, farm, 400)
  money(p2, farm, mill, 400)
  stage('round 2: refunds: a refrain paid in part and paid back in full is reversed', p2, s.held, { stage: 'reversed' })
  // a refrain kept for its whole term and stopped after it reads done in the view
  const p3 = s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash })
  answer(s, mill, p3, { status: 'accepted' })
  const late = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p3.hash, for: p3.hash }, { time: '2028-01-01T12:00:00.000Z' })
  stage('round 2: refrain: a stop after its until still reads stopped in the fold', p3, s.held, { stage: 'stopped', from: late.hash, by: 'from' })
  view('round 2: refrain: a stop the promiser alone dates after its until does not count as after it on their word alone: the view reads it stopped', p3, s.held, AFTER, { stage: 'stopped', from: late.hash, by: 'from' })
  // the view compares what was paid exactly
  const big = s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY, price: { money: M(1), per: fb.amount('1', 'kg') }, quantity: fb.amount('9007199254740993', 'kg') } }, { from: farm.id, to: mill.id, what: spray.hash })
  answer(s, mill, big, { status: 'accepted' })
  money(big, mill, farm, 9007199254740991)
  money(big, mill, farm, 1)
  view('H15: round 2: refrain: a price short by one minor unit at 2^53: elapsed, never done, the payments beside it (before: underway)', big, s.held, AFTER, { stage: 'elapsed', paid: { minor: '9007199254740992', currency: 'GBP' } })
  holds('H15: settled: a refrain short by one minor unit at 2^53 is not settled: what was paid is compared exactly', { settled: big.hash }, s.held, AFTER, false)
}
{
  // after a counter, the offerer is who signed the offer the accept answers
  const s = story(), ann = s.person('sann'), bob = s.person('sbob')
  const bread = s.say(ann, 'thing', { kind: 'bread' })
  const o = s.say(ann, 'promise', { terms: { price: M(300), expires: DAY } }, { from: ann.id, to: bob.id, what: bread.hash })
  const c = answer(s, bob, o, { terms: { price: M(250), expires: DAY } })
  const yes = answer(s, ann, c, { status: 'accepted' }, { for: o.hash })
  s.say(ann, 'promise', { status: 'declined' }, { answers: yes.hash, for: o.hash })
  stage('round 2: decline: the accepter declining their own accept voids nothing', o, s.held, { stage: 'accepted', accept: yes.hash })
  s.say(bob, 'promise', { status: 'declined' }, { answers: yes.hash, for: o.hash })
  stage('round 2: decline: the counter\'s signer, whose offer the accept answers, declines it: nothing binds', o, s.held, { stage: 'offered', accept: null })
  // a withdrawal stops only the offer it names
  const o2 = s.say(ann, 'promise', { terms: { price: M(300), expires: DAY } }, { from: ann.id, to: bob.id, what: bread.hash })
  const c2 = answer(s, bob, o2, { terms: { price: M(280), expires: DAY } })
  const pull = s.say(ann, 'promise', { status: 'stopped', stop: 'before' }, { updates: o2.hash, for: o2.hash, after: [c2.hash] })
  const yes2 = answer(s, ann, c2, { status: 'accepted' }, { for: o2.hash, after: [pull.hash] })
  stage('round 2: withdrawal: withdrawing an offer a counter replaced does not stop the counter: its accept binds', o2, s.held, { stage: 'accepted', accept: yes2.hash })
  // a counter keeps the deal's sides
  const o3 = s.say(ann, 'promise', { terms: { price: M(300), expires: DAY } }, { from: ann.id, to: bob.id, what: bread.hash })
  const turn = answer(s, bob, o3, { terms: { price: M(300), expires: DAY } }, { from: bob.id, to: ann.id, what: bread.hash })
  answer(s, ann, turn, { status: 'accepted' }, { for: o3.hash })
  stage('round 2: counter: a counter that swaps the sides is not live: its accept binds nothing', o3, s.held, { stage: 'offered', accept: null, live: [o3.hash] })
  // two onward stops that do not see each other: the lowest hash names from
  const week = s.say(ann, 'promise', { what: 'a loaf a week', when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY', expires: DAY } }, { from: ann.id, to: bob.id })
  const wy = answer(s, bob, week, { status: 'accepted' })
  for (let i = 0; i < 3; i++) s.say(ann, 'observe', { kind: 'note', text: 'baking ' + i })
  const sa = s.say(ann, 'promise', { status: 'stopped', stop: 'onward' }, { updates: week.hash, for: week.hash })
  const sb = answer(s, bob, week, { status: 'stopped', stop: 'onward' }, { after: [wy.hash] })
  const low = [sa.hash, sb.hash].sort()[0]
  stage('round 2: stops: of two onward stops that do not see each other, one by each side, from is the lowest hash, whatever their pasts; by is both', week, s.held, { stage: 'stopped', from: low, by: 'both' })
  // a stop is a promise's: a transfer that says stopped stops nothing
  const loaf = s.say(ann, 'promise', { terms: { expires: DAY } }, { from: ann.id, to: bob.id, what: bread.hash })
  answer(s, bob, loaf, { status: 'accepted' })
  const give = s.say(ann, 'transfer', {}, { what: bread.hash, to_owner: bob.id, for: loaf.hash })
  s.say(bob, 'transfer', { status: 'stopped', stop: 'onward' }, { answers: give.hash, for: loaf.hash })
  stage('round 2: stops: a transfer answered stopped onward stops no promise', loaf, s.held, { stage: 'accepted', stop: null })
}
{
  // an autonomous system's quote request binds only on the principal's own yes
  const s = story(), pat = s.person('spat'), bot = s.person('sbot', { kind: 'agent' }), shop = s.person('sshop')
  const eggs = s.say(shop, 'thing', { kind: 'eggs' })
  const look = s.say(pat, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: bot.id })
  const ask = s.say(bot, 'promise', { terms: { price: M(300), expires: DAY } }, { from: pat.id, to: shop.id, what: eggs.hash, under: look.hash })
  answer(s, shop, ask, { status: 'accepted' })
  answer(s, bot, ask, { status: 'accepted' }, { under: look.hash })
  stage('round 2: quotes: the autonomous system accepting its own quote request under a grant that does not name promise binds no one', ask, s.held, { stage: 'offered', accept: null })
  answer(s, pat, ask, { status: 'accepted' })
  stage('round 2: quotes: the principal\'s own accept makes it bind', ask, s.held, { stage: 'accepted' })
  const bare = s.say(bot, 'promise', { terms: { price: M(300), expires: DAY } }, { from: bot.id, to: shop.id, what: eggs.hash })
  answer(s, shop, bare, { status: 'accepted' })
  answer(s, bot, bare, { status: 'accepted' })
  stage('round 2: quotes: a bare autonomous system\'s offer is its own word: the buyer\'s accept binds it, its own accept of it binds nothing (batch 2 P11)', bare, s.held, { stage: 'accepted' })
}
{
  // units: goods in another unit move nothing; moved is the exact sum, more than needed when more came
  const s = story(), mill = s.person('smill2'), bake = s.person('sbake')
  const flour = s.say(mill, 'thing', { kind: 'flour' })
  const goods = (p, amount) => { const t = s.say(mill, 'transfer', { amount }, { what: flour.hash, to_owner: bake.id, for: p.hash }); s.say(bake, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash }); return t }
  const p = s.say(mill, 'promise', { terms: { quantity: fb.amount('3', 'kg'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, p, { status: 'accepted' })
  goods(p, fb.amount('0.2', 'g'))
  stage('round 2: units: 0.2 g against 3 kg moves nothing: underway', p, s.held, { stage: 'underway', lines: [{ needed: 3, moved: 0 }] })
  const q = s.say(mill, 'promise', { terms: { quantity: fb.amount('0.3', 'kg'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, q, { status: 'accepted' })
  goods(q, fb.amount('0.1', 'kg'))
  goods(q, fb.amount('0.2', 'kg'))
  stage('round 2: units: 0.1 kg and 0.2 kg cover 0.3 kg exactly: done, moved 0.3', q, s.held, { stage: 'done', lines: [{ needed: 0.3, moved: 0.3 }] })
  goods(q, fb.amount('10.2', 'kg'))
  stage('round 2: units: more than needed is reported as it came, never capped: moved 10.5', q, s.held, { stage: 'done', lines: [{ needed: 0.3, moved: 10.5 }] })
  // an accept keeps to the offer's quantity
  const flat = s.say(mill, 'promise', { terms: { price: M(100), quantity: fb.amount('5', 'kg'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, flat, { status: 'accepted', terms: { quantity: fb.amount('50', 'kg') } })
  stage('round 2: quantity: an accept naming another quantity than a fixed one binds nothing', flat, s.held, { stage: 'offered', accept: null })
  const range = s.say(mill, 'promise', { terms: { price: { money: M(100), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('1', 'kg'), max: fb.amount('10', 'kg') }, expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, range, { status: 'accepted' })
  stage('round 2: quantity: an accept of a range that names no quantity binds nothing', range, s.held, { stage: 'offered', accept: null })
  answer(s, bake, range, { status: 'accepted', terms: { quantity: fb.amount('50', 'kg') } })
  answer(s, bake, range, { status: 'accepted', terms: { quantity: fb.amount('500', 'g') } })
  stage('round 2: quantity: accepts outside the range, or in another unit, bind nothing', range, s.held, { stage: 'offered', accept: null })
  const fits = answer(s, bake, range, { status: 'accepted', terms: { quantity: fb.amount('4', 'kg') } })
  stage('round 2: quantity: an accept inside the range binds at its quantity', range, s.held, { stage: 'accepted', accept: fits.hash, quantity: { value: '4', unit: 'kg' }, total: { minor: 400 } })
  // a price with no total is never paid
  const grams = s.say(mill, 'promise', { terms: { price: { money: M(100), per: fb.amount('1', 'kg') }, quantity: fb.amount('500', 'g'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, grams, { status: 'accepted' })
  goods(grams, fb.amount('500', 'g'))
  stage('round 2: price: a per-kg price on a quantity in grams has no total: delivered and unpaid is underway, never done', grams, s.held, { stage: 'underway', total: null })
  const zero = s.say(mill, 'promise', { terms: { price: { money: M(100), per: fb.amount('0', 'kg') }, quantity: fb.amount('3', 'kg'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, zero, { status: 'accepted' })
  stage('round 2: price: a per of zero has no total', zero, s.held, { stage: 'accepted', total: null })
  // one currency: with no price, payments in two currencies add up to nothing (no hash or order picks one: batch 2 P10)
  const job = s.say(mill, 'promise', { terms: { quantity: fb.amount('1', 'kg'), expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
  answer(s, bake, job, { status: 'accepted' })
  for (const m of [M(100), M(5, 'EUR')]) { const t = s.say(bake, 'transfer', { money: m }, { what: bake.id, to_owner: mill.id, for: job.hash }); s.say(mill, 'transfer', { status: 'accepted' }, { answers: t.hash, for: job.hash }) }
  stage('round 2: currency: with no price, payments in two currencies are never added: paid is null (batch 2 P10)', job, s.held, { stage: 'underway', paid: null })
  // lines: a line priced per unit
  const rye = s.say(mill, 'thing', { kind: 'rye' })
  const order = s.say(mill, 'promise', { terms: { lines: [{ id: 'a', what: flour.hash, quantity: fb.amount('2', 'kg'), price: M(100) }, { id: 'b', what: rye.hash, quantity: fb.amount('4', '{piece}'), price: { money: M(50), per: fb.amount('1', '{piece}') } }], expires: DAY } }, { from: mill.id, to: bake.id, what: [flour.hash, rye.hash] })
  answer(s, bake, order, { status: 'accepted' })
  stage('round 2: lines: a line priced per unit comes to its money times its quantity', order, s.held, { stage: 'accepted', total: { minor: 300 } })
  check('round 2: lines: every line of one promise is priced in one currency', { type: 'promise', state: { terms: { lines: [{ id: 'a', what: flour.hash, price: M(100) }, { id: 'b', what: rye.hash, price: M(50, 'EUR') }], expires: DAY } }, refs: { from: AUTH, to: bake.id, what: [flour.hash, rye.hash].sort() } }, ['lines'])
}
{
  // a confirmer whose key forked confirms nothing
  const s = story(), mill = s.person('smill3'), bake = s.person('sbake3'), judge = s.person('sjudge')
  const flour = s.say(mill, 'thing', { kind: 'flour' })
  const rules = s.say(bake, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [judge.id] } })
  const p = s.say(mill, 'promise', { terms: { expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash, schema: rules.hash })
  answer(s, bake, p, { status: 'accepted' })
  const give = s.say(mill, 'transfer', {}, { what: flour.hash, to_owner: bake.id, for: p.hash })
  const ok = s.say(judge, 'observe', { kind: 'check', text: 'delivered' }, { confirms: give.hash, for: p.hash })
  stage('round 2: confirms: a named confirmer\'s confirm counts the delivery', p, s.held, { stage: 'done' })
  s.keep(fb.write('observe', { kind: 'note', text: 'a twin' }, {}, { author: judge.id, key: keyOf('sjudge'), held: s.held.filter((b) => b.hash !== ok.hash), at: at(), audience: 'public' }))
  stage('round 2: confirms: a confirmer whose key forked confirms nothing', p, s.held, { stage: 'accepted' })
}
{
  // open offers: on a limited offer an allocation names a quantity in the offer's unit
  const s = story(), stall = s.person('sstall'), b1 = s.person('sb1'), b2 = s.person('sb2'), b3 = s.person('sb3')
  const apples = s.say(stall, 'thing', { kind: 'apples' })
  const o = s.say(stall, 'promise', { terms: { price: M(100), quantity: fb.amount('10', 'kg'), expires: DAY } }, { from: stall.id, what: apples.hash })
  const r1 = answer(s, b1, o, { status: 'accepted' })
  answer(s, stall, r1, { status: 'accepted' }, { for: o.hash })
  stage('round 2: open offer: an allocation that names no quantity on a limited offer binds nothing', o, s.held, { stage: 'offered', takers: [] })
  const r2 = answer(s, b2, o, { status: 'accepted', terms: { quantity: fb.amount('8', 'g') } })
  answer(s, stall, r2, { status: 'accepted' }, { for: o.hash })
  const r3 = answer(s, b3, o, { status: 'accepted', terms: { quantity: fb.amount('8', 'kg') } })
  const a3 = answer(s, stall, r3, { status: 'accepted' }, { for: o.hash })
  stage('round 2: open offer: an allocation in another unit binds nothing; one in the offer\'s unit binds', o, s.held, { stage: 'accepted', accept: a3.hash, quantity: { value: '8', unit: 'kg' } })
}
{
  // circles: a removed member's offline removal is set aside
  const s = story(), f = s.person('cf'), r = s.person('cr'), m = s.person('cm')
  const c = s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Co-op', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'rem', powers: ['remove'] }, { name: 'mem', powers: [] }] })
  const gR = s.say(f, 'grant', { kind: 'member', roles: ['rem'] }, { subject: c.hash, to: r.id, as: c.hash })
  const aR = s.say(r, 'grant', { status: 'accepted', kind: 'member' }, { answers: gR.hash, subject: c.hash })
  const gM = s.say(f, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: m.id, as: c.hash })
  s.say(m, 'grant', { status: 'accepted', kind: 'member' }, { answers: gM.hash, subject: c.hash })
  s.say(f, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: aR.hash }, { updates: gR.hash, subject: c.hash, as: c.hash, after: [aR.hash] })
  const off = s.say(r, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: gM.hash, subject: c.hash, as: c.hash, after: [gM.hash] })
  door('round 2: circle: a removed member\'s removal past their cut is set aside: the member they stopped stays', 'circle_state', [c.hash, s.held], { expect: { members: { [f.id]: { roles: ['boss'] }, [m.id]: { roles: ['mem'] } }, removed: { [r.id]: null } } })
  door('round 2: circle: that removal speaks for no one', 'may_act_as', [off, c.hash, s.held], { expect: false, exact: true })
}
{
  // circles: counted_to is a block by the member it ends; any other cuts at the stop
  for (const [tag, own] of [['x', false], ['y', true]]) {
    const s = story(), f = s.person('k' + tag + 'f'), r = s.person('k' + tag + 'r'), m = s.person('k' + tag + 'm')
    const c = s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Pot', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'rem', powers: ['remove'] }, { name: 'sig', powers: ['sign'] }] })
    const gR = s.say(f, 'grant', { kind: 'member', roles: ['rem'] }, { subject: c.hash, to: r.id, as: c.hash })
    s.say(r, 'grant', { status: 'accepted', kind: 'member' }, { answers: gR.hash, subject: c.hash })
    const gM = s.say(f, 'grant', { kind: 'member', roles: ['sig'] }, { subject: c.hash, to: m.id, as: c.hash })
    const aM = s.say(m, 'grant', { status: 'accepted', kind: 'member' }, { answers: gM.hash, subject: c.hash })
    const note = s.say(m, 'observe', { kind: 'note', text: 'paid the miller' }, { as: c.hash })
    s.say(r, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: own ? aM.hash : c.hash }, { updates: gM.hash, subject: c.hash, as: c.hash, after: [note.hash] })
    if (own) door('round 2: circle: a remover naming the member\'s own block as counted_to still cuts at the stop (a circle reads no counted_to): what the stop saw stands', 'may_act_as', [note, c.hash, s.held], { expect: true, exact: true })
    else door('round 2: circle: a remover naming a block that is not the member\'s cuts at the stop: what the stop saw stands', 'may_act_as', [note, c.hash, s.held], { expect: true, exact: true })
  }
}
{
  // circles: role changes that do not see each other are read without an order: a role one admin takes away is gone
  const s = story(), f = s.person('ef'), a = s.person('ea'), m = s.person('em')
  const c = s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Kitchen', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'sig', powers: ['sign'] }, { name: 'adm', powers: ['admit'] }] })
  const gA = s.say(f, 'grant', { kind: 'member', roles: ['boss'] }, { subject: c.hash, to: a.id, as: c.hash })
  const aA = s.say(a, 'grant', { status: 'accepted', kind: 'member' }, { answers: gA.hash, subject: c.hash })
  const gM = s.say(f, 'grant', { kind: 'member', roles: ['sig', 'adm'] }, { subject: c.hash, to: m.id, as: c.hash })
  const aM = s.say(m, 'grant', { status: 'accepted', kind: 'member' }, { answers: gM.hash, subject: c.hash })
  for (let i = 0; i < 4; i++) s.say(f, 'observe', { kind: 'note', text: 'busy ' + i })
  s.say(f, 'grant', { kind: 'member', roles: [] }, { updates: gM.hash, subject: c.hash, as: c.hash, after: [aM.hash] })
  s.say(a, 'grant', { kind: 'member', roles: ['sig', 'adm'] }, { updates: gM.hash, subject: c.hash, as: c.hash, after: [aA.hash, aM.hash] })
  door('round 2: circle: of two role changes that do not see each other, a role one takes away is gone, whatever the hashes or pasts', 'circle_state', [c.hash, s.held], { expect: { members: { [m.id]: { roles: [] } } } })
  // a member grant whose refs.to is a set names no one: no one joins by it
  const x = s.person('ex')
  const set = s.say(f, 'grant', { kind: 'member', roles: ['sig'] }, { subject: c.hash, to: [x.id], as: c.hash })
  const xyes = s.say(x, 'grant', { status: 'accepted', kind: 'member' }, { answers: set.hash, subject: c.hash })
  assert.ok(!(x.id in call('circle_state', c.hash, s.held, null).members))
  door('round 2: circle: a member grant whose refs.to is a set names no one: its accept makes no member', 'members_then', [s.say(f, 'observe', { kind: 'note', text: 'who is in' }, { after: [xyes.hash, aA.hash] }), c.hash, s.held], { expect: [a.id, f.id, m.id].sort(), exact: true })
  check('round 2: checks: refs.answers is one id', { type: 'grant', state: { status: 'accepted', kind: 'member' }, refs: { answers: [c.hash], subject: c.hash } }, ['grammar'])
  check('round 2: checks: refs.updates is one id', { type: 'grant', state: { status: 'stopped', stop: 'onward' }, refs: { updates: [gM.hash], subject: c.hash, as: c.hash } }, ['grammar'])
  // an actor of another kind is no circle
  const org = s.say(f, 'actor', { kind: 'org', name: 'Not a circle', roles: [{ name: 'r', powers: ['sign'] }] })
  door('round 2: circle: an actor that is not of kind circle has no circle state', 'circle_state', [org.hash, s.held], { expect: null, exact: true })
  door('round 2: circle: and no block speaks as it', 'may_act_as', [s.say(f, 'observe', { kind: 'note', text: 'as the org' }, { as: org.hash }), org.hash, s.held], { expect: false, exact: true })
}
{
  // circles: a member who accepts one grant from two devices at once: supersession reads every first acceptance, never one chosen by hash
  const s = story(), f = s.person('df'), m = s.person('dm')
  const c = s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Stall', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'sig', powers: ['sign'] }, { name: 'mem', powers: [] }] })
  s.say(m, 'grant', { kind: 'key', public_key_sign: keyOf('dmphone').public_key_sign }, { subject: m.id })
  const phone = (type, state, refs, skip) => s.keep(fb.write(type, state, refs, { author: m.id, key: keyOf('dmphone'), held: s.held.filter((b) => !skip.includes(b.hash)), at: at(), audience: 'public' }))
  const g1 = s.say(f, 'grant', { kind: 'member', roles: ['sig'] }, { subject: c.hash, to: m.id, as: c.hash })
  const a1 = s.say(m, 'grant', { status: 'accepted', kind: 'member' }, { answers: g1.hash, subject: c.hash })
  phone('grant', { status: 'accepted', kind: 'member' }, { answers: g1.hash, subject: c.hash }, [a1.hash])
  const g2 = s.say(f, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: m.id, as: c.hash })
  phone('grant', { status: 'accepted', kind: 'member' }, { answers: g2.hash, subject: c.hash }, [a1.hash])
  door('round 2: circle: a later grant accepted having seen either first acceptance of an earlier one supersedes it', 'circle_state', [c.hash, s.held], { expect: { members: { [m.id]: { roles: ['mem'] } } } })
}
{
  // authority: a grant signed as a circle by someone who may not sign for it gives nothing
  const s = story(), t1 = s.person('at1'), t2 = s.person('at2'), x = s.person('ax'), d = s.person('ad', { kind: 'agent' })
  const pot = s.say(t1, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Pot', roles: [{ name: 'treasurer', powers: ['sign', 'admit'] }], needed: { sign: 2 } })
  const g2 = s.say(t1, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: pot.hash, to: t2.id, as: pot.hash })
  const y2 = s.say(t2, 'grant', { status: 'accepted', kind: 'member' }, { answers: g2.hash, subject: pot.hash })
  const stray = s.say(x, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: d.id, as: pot.hash })
  door('round 2: authority: a grant signed as a circle by an outsider is not live: nothing acts under it', 'under_ok', [s.say(d, 'observe', { kind: 'note', text: 'on the pot\'s word' }, { under: stray.hash }), s.held], { expect: false, exact: true })
  const one = s.say(t1, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: d.id, as: pot.hash, after: [y2.hash] })
  const early = s.say(d, 'observe', { kind: 'note', text: 'before the second hand' }, { under: one.hash })
  door('round 2: authority: a grant with one of the two hands the circle needs is not live', 'under_ok', [early, s.held], { expect: false, exact: true })
  const hand = s.say(t2, 'observe', { kind: 'agree', text: 'second signature' }, { confirms: one.hash, after: [one.hash] })
  door('round 2: authority: with the second hand in the relying block\'s past, it is live', 'under_ok', [s.say(d, 'observe', { kind: 'note', text: 'after the second hand' }, { under: one.hash, after: [hand.hash] }), s.held], { expect: true, exact: true })
  door('round 2: authority: a block that did not see the second hand still relies on one hand: not live', 'under_ok', [early, s.held], { expect: false, exact: true })
}
{
  // authority: a stop that restates the grant is still a stop, never a grant
  const s = story(), p = s.person('gp'), bot = s.person('gbot', { kind: 'agent' }), son = s.person('gson'), w = s.person('gw')
  const g = s.say(p, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: bot.id })
  const halt = s.say(p, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER }, status: 'stopped', stop: 'onward' }, { updates: g.hash, to: bot.id })
  door('round 2: authority: nothing acts under a stop that restates the grant', 'under_ok', [s.say(bot, 'observe', { kind: 'note', text: 'under the stop' }, { under: halt.hash }), s.held], { expect: false, exact: true })
  const succ = s.say(p, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: son.id })
  const shut = s.say(p, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D', status: 'stopped', stop: 'onward' }, { updates: succ.hash, to: son.id })
  const own = s.say(p, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: bot.id })
  const t = s.say(w, 'observe', { kind: 'trigger', text: 'he died' }, { under: shut.hash, subject: p.id })
  const close = s.say(son, 'observe', { kind: 'close' }, { under: shut.hash, subject: p.id, after: [t.hash] })
  door('round 2: authority: a close under a stop of the successor grant ends nothing: his grant is live after it', 'under_ok', [s.say(bot, 'observe', { kind: 'note', text: 'after the close' }, { under: own.hash, after: [close.hash] }), s.held], { expect: true, exact: true })
  // an operator's stop that restates the grant makes no operator
  const op = s.say(p, 'grant', { kind: 'operator' }, { to: bot.id })
  s.say(p, 'grant', { kind: 'operator', status: 'stopped', stop: 'onward' }, { updates: op.hash, to: bot.id, after: [op.hash] })
  door('round 2: authority: a stopped operator is no operator, though the stop restates refs.to', 'operators_of', [bot.id, s.held, null], { expect: [], exact: true })
  // a key brought in twice is one key
  s.say(p, 'grant', { kind: 'key', public_key_sign: keyOf('gpphone').public_key_sign }, { subject: p.id })
  s.say(p, 'grant', { kind: 'key', public_key_sign: keyOf('gpphone').public_key_sign }, { subject: p.id })
  door('round 2: identity: a key two key grants bring in is listed once', 'key_timeline', [p.id, s.held, null], { expect: [{ key: keyOf('gp').public_key_sign }, { key: keyOf('gpphone').public_key_sign }] })
}
{
  // successor: the person's defeats voids the close for good, even after the trigger fired
  const s = story(), gma = s.person('lgma'), heir = s.person('lheir'), w = s.person('lw'), bot = s.person('lbot', { kind: 'agent' })
  const succ = s.say(gma, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: heir.id })
  const own = s.say(gma, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: bot.id })
  const t = s.say(w, 'observe', { kind: 'trigger', text: 'she died' }, { under: succ.hash, subject: gma.id })
  const close = s.say(heir, 'observe', { kind: 'close' }, { under: succ.hash, subject: gma.id, after: [t.hash] })
  door('round 2: successor: after the close her grant is not live', 'under_ok', [s.say(bot, 'observe', { kind: 'note', text: 'after the close' }, { under: own.hash, after: [close.hash] }), s.held], { expect: false, exact: true })
  s.say(gma, 'observe', { kind: 'back', text: 'I am alive' }, { defeats: t.hash, after: [close.hash] }, { time: '2026-12-01T00:00:00.000Z' })
  door('round 2: successor: her defeats of the trigger, written after the close, voids it for good: her grant is live again', 'under_ok', [s.say(bot, 'observe', { kind: 'note', text: 'she is back' }, { under: own.hash, after: [close.hash] }), s.held], { expect: true, exact: true })
  refusedArg('round 2: successor_view refuses an arrival that is not a time', 'successor_view', [succ, s.held, '2026-12-01T00:00:00.000Z', { [t.hash]: '2026-10-28 00:00:00' }])
  refusedArg('round 2: due refuses an arrival that is not a time', 'due', [{ type: 'promise', state: { when: { after: t.hash, wait: 'P1D' } }, refs: {} }, { [t.hash]: '2026-02-30T12:00:00.000Z' }])
  check('round 2: checks: a successor grant names each witness once', { type: 'grant', state: { kind: 'successor', witnesses: [w.id, w.id], needed: 2, wait: 'P7D' }, refs: { to: heir.id } }, ['shape'])
}
{
  // the write check, round 2
  const H = 'c'.repeat(64), SHA3 = 'sha3-256:' + 'd'.repeat(64)
  const thing = (state) => ({ type: 'thing', state: { kind: 'x', ...state }, refs: {} })
  check('round 2: checks: sha3-256 is no hash name a reader knows yet, in refs', { type: 'observe', state: { kind: 'note' }, refs: { subject: SHA3 } }, ['unknown_suite'])
  check('round 2: checks: nor in state', { type: 'actor', state: { kind: 'person', custodian: SHA3 }, refs: {} }, ['unknown_suite'])
  check('round 2: checks: an object with exactly a mark\'s keys is checked as a mark, in any field', thing({ tag: { scheme: 5, value: 'y' } }), ['shape'])
  check('round 2: checks: an object with more keys than a shape is data', thing({ tag: { scheme: 5, value: 'y', note: 1 } }), [])
  check('round 2: checks: a share is checked in any field', thing({ part: { from: H, share: '1.5.1' } }), ['decimal'])
  check('round 2: checks: an issuer\'s currency is checked in any field', thing({ unit: { issuer: H, unit: 'u', decimals: 99 } }), ['shape'])
  check('round 2: checks: a point is checked in any field', thing({ spot: { lat: 'x', lon: '2' } }), ['shape'])
  check('round 2: checks: a bare field holds exactly one shape: a price with a place is none', thing({ price: { minor: 1, currency: 'GBP', place: 'x' } }), ['shape'])
  check('round 2: checks: a price whose money is empty is refused for its shape alone', { type: 'promise', state: { terms: { price: { money: {}, per: {} }, expires: DAY } }, refs: { from: AUTH, to: H } }, ['shape'])
  check('round 2: checks: an actor\'s own stop needs no kind', { type: 'actor', state: { status: 'stopped', stop: 'before' }, refs: { updates: H } }, [])
  check('round 2: checks: a grant with no kind is refused for that alone', { type: 'grant', state: { scope: {} }, refs: {} }, ['required'])
  check('H14: round 2: checks: a scope\'s every is a duration, whatever the type', thing({ scope: { every: { a: 1 } } }), ['time'])
  check('round 2: checks: a limit below zero is refused', { type: 'grant', state: { kind: 'errands', scope: { acts: ['transfer'], limit: M(-5), until: LATER } }, refs: { to: H } }, ['shape'])
  check('round 2: checks: a range is compared exactly: min above max by a hair is refused', { type: 'promise', state: { terms: { price: { money: M(1), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('12345678901234567890.2', 'kg'), max: fb.amount('12345678901234567890.1', 'kg') }, expires: DAY } }, refs: { from: AUTH, to: H, what: H } }, ['shape'])
  check('round 2: checks: a latitude past 90 by a hair is refused', thing({ where: { lat: '90.00000000000000001', lon: '0' } }), ['shape'])
  check('round 2: checks: a when that is an empty object fits no form', thing({ when: {} }), ['shape'])
  check('round 2: checks: a when with from and no to fits no form', thing({ when: { from: DAY } }), ['shape'])
  check('round 2: checks: a when that is a number fits no form', thing({ when: 5 }), ['shape'])
  check('round 2: checks: a stop occurrence that is no real instant is refused', { type: 'promise', state: { status: 'stopped', stop: { occurrences: ['2026-02-30T12:00:00.000Z'] } }, refs: { updates: H, for: H } }, ['bad_status'])
  check('round 2: checks: a split part is for one of what the payment is for', { type: 'transfer', state: { money: M(100), split: [{ for: H, money: M(100) }] }, refs: { to_owner: H, for: 'e'.repeat(64) } }, ['shape'])
  check('round 2: checks: a split part\'s money is money', { type: 'transfer', state: { money: M(100), split: [{ for: H, money: fb.amount('1', 'kg') }] }, refs: { to_owner: H, for: H } }, ['shape'])
  door('round 2: strict_text: a non-breaking space is not JSON whitespace', 'strict_text', ['{"type":"thing", "state":{},"refs":{}}'], { expect: [{ code: 'not_canonical' }] })
  door('round 2: strict_text: a leading zero is not JSON', 'strict_text', ['{"type":"thing","state":{"n":01},"refs":{}}'], { expect: [{ code: 'not_canonical' }] })
}
{
  // a child's condition keeps every key of its parent's; durations land on the last day of a short month
  const s = story(), p = s.person('hp'), a = s.person('ha'), b = s.person('hb')
  const parent = s.say(p, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['observe'], until: LATER, condition: { kind: 'x', n: 1 } } }, { to: a.id })
  const child = (scope) => ({ type: 'grant', state: { kind: 'errands', scope: { acts: ['observe'], until: LATER, ...scope } }, refs: { author: a.id, to: b.id, parent: parent.hash } })
  check('round 2: checks: a child whose condition drops a key of its parent\'s is wider, never thrown', child({ condition: { kind: 'x' } }), ['wider_than_parent'], [parent])
  const jan = s.say(p, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['transfer'], limit: M(1000), every: 'P30D', until: LATER } }, { to: a.id }, { time: '2026-01-31T00:00:00.000Z' })
  const kid = (per, from) => ({ type: 'grant', state: { kind: 'errands', scope: { acts: ['transfer'], limit: M(1000), every: per, until: LATER } }, refs: { author: a.id, to: b.id, parent: from.hash } })
  check('round 2: time: 31 January plus P1M is 28 February, so P1M is shorter than P30D from it: wider', kid('P1M', jan), ['wider_than_parent'], [jan])
  const jan2 = s.say(p, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['transfer'], limit: M(1000), every: 'P1M', until: LATER } }, { to: a.id }, { time: '2026-01-31T00:00:00.000Z' })
  check('round 2: time: and P30D from 31 January is longer than P1M: within', kid('P30D', jan2), [], [jan2])
}

{
  // round 3: checks. A stop or an answer is never a grant: no grant rule reads the scope or parent it restates (authority.md)
  const H = 'c'.repeat(64)
  check('round 3: checks: a stop restating an empty scope is not a grant: no scope_until', { type: 'grant', state: { status: 'stopped', stop: 'onward', scope: {} }, refs: { updates: H } }, [])
  check('round 3: checks: a stop restating a scope with a stray field is not a grant: nothing undeclared in it', { type: 'grant', state: { status: 'stopped', stop: 'onward', scope: { acts: ['observe'], note: 'x' } }, refs: { updates: H } }, [])
  check('round 3: checks: an accepted answer restating a scope without until is not a grant', { type: 'grant', state: { status: 'accepted', scope: { acts: ['observe'] } }, refs: { answers: H } }, [])
  const s = story(), p = s.person('r3p'), a = s.person('r3a')
  const parent = s.say(p, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: a.id })
  check('round 3: checks: a stop carrying refs.parent is not a child grant: no wider_than_parent', { type: 'grant', state: { status: 'stopped', stop: 'onward' }, refs: { author: a.id, updates: parent.hash, parent: parent.hash } }, [], [parent])
  // an audience commitment is written like an id: an unknown hash name is unknown_suite (core.md, section 2)
  check('round 3: checks: an audience commitment with a hash name the reader does not know is unknown_suite', { type: 'observe', state: { kind: 'note', audience: ['foo:' + '7'.repeat(64)], nonce: 'ab'.repeat(16) }, refs: {} }, ['unknown_suite'])
  // marks are exact { scheme, value } on every type (things.md)
  check('round 3: checks: a thing\'s mark with a field beside scheme and value is refused', { type: 'thing', state: { kind: 'flour', marks: [{ scheme: 'gtin', value: '1', note: 'x' }] }, refs: {} }, ['shape'])
  check('round 3: checks: marks that are not a list are refused on a promise too', { type: 'promise', state: { marks: true, terms: { expires: DAY } }, refs: { from: AUTH, to: H, what: H } }, ['shape'])
  check('round 3: checks: an exact mark on an observe passes', { type: 'observe', state: { kind: 'note', marks: [{ scheme: 'lot', value: 'A1' }] }, refs: {} }, [])
  // a whole number written in digits past what 64 bits hold is a whole number out of range, not a float (from 1e21 on, JSON writes an exponent)
  check('round 3: checks: 1e20 is a whole number out of range: integer_range', { type: 'observe', state: { kind: 'note', n: 1e20 }, refs: {} }, ['integer_range'])
  check('round 3: checks: 2^64 is a whole number out of range: integer_range', { type: 'observe', state: { kind: 'note', n: 18446744073709551616 }, refs: {} }, ['integer_range'])
  // a line's id is non-empty text (promises.md)
  check('round 3: checks: a line whose id is empty names no line', { type: 'promise', state: { terms: { lines: [{ id: '', what: H, quantity: fb.amount('1', 'kg'), price: M(100) }], expires: DAY } }, refs: { from: AUTH, to: H, what: [H] } }, ['lines'])
  // the year 0000 is a leap year of the proleptic Gregorian calendar (core.md section 3)
  check('round 3: time: 0000-02-29 is a real day', { type: 'observe', state: { kind: 'note', at: '0000-02-29T00:00:00.000Z' }, refs: {} }, [])
  door('round 3: time: P1M from 0000-01-31 is 0000-02-29', 'add_duration', ['0000-01-31T00:00:00.000Z', 'P1M', 1], { expect: '0000-02-29T00:00:00.000Z', exact: true })
  // only a thing of kind schema declares fields (core.md, section 8)
  const note = s.say(p, 'observe', { kind: 'note', fields: { foo: { type: 'text' } } })
  door('round 3: checks: a block named in refs.schema that is not a schema declares nothing', 'refusals', ['promise', { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', foo: 'x', terms: { expires: DAY } }, { author: AUTH, prev: AUTH, from: AUTH, to: H, what: H, schema: note.hash }, [note], [note]], { expect: [{ code: 'undeclared_field' }] })
  // -0 travels to the core from JavaScript, and is refused there as everywhere (core.md section 3)
  assert.deepEqual(codesOf(call('refusals', 'observe', { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', kind: 'note', n: -0 }, { author: AUTH, prev: AUTH }, [], null)), ['integer_range'])
  // terms_total: what a promise's terms come to (folds.md, stage 2)
  door('round 3: terms_total: a per-unit price times the quantity chosen', 'terms_total', [{ price: { money: M(140), per: fb.amount('1', 'kg') }, quantity: fb.amount('100', 'kg') }, fb.amount('5000', 'kg')], { expect: { minor: 700000, currency: 'GBP' }, exact: true })
  door('round 3: terms_total: lines add up in the first line\'s currency', 'terms_total', [{ lines: [{ id: 'a', what: H, quantity: fb.amount('2', 'kg'), price: { money: M(150), per: fb.amount('1', 'kg') } }, { id: 'b', what: H, quantity: fb.amount('1', 'kg'), price: M(900) }] }, null], { expect: { minor: 1200, currency: 'GBP' }, exact: true })
  door('round 3: terms_total: a per-unit price with no quantity in its unit has no total', 'terms_total', [{ price: { money: M(140), per: fb.amount('1', 'kg') } }, null], { expect: null, exact: true })
  // limit_fence: the limit observe for a grant, its audience the agent alone
  door('round 3: limit_fence: a limit over a period, salted', 'limit_fence', [H, AUTH, M(2000), 'P1M', 'ab'.repeat(16), null], { expect: { type: 'observe', state: { kind: 'limit', limit: M(2000), every: 'P1M', salt: 'ab'.repeat(16) }, refs: { for: H }, audience: [AUTH] }, exact: true })
  door('round 3: limit_fence: a cap on each act alone', 'limit_fence', [H, AUTH, null, null, null, fb.amount('5', 'kg')], { expect: { type: 'observe', state: { kind: 'limit', each: fb.amount('5', 'kg') }, refs: { for: H }, audience: [AUTH] }, exact: true })
  door('round 3: limit_fence: a limit and each together', 'limit_fence', [H, AUTH, M(2000), null, null, M(500)], { expect: { type: 'observe', state: { kind: 'limit', limit: M(2000), each: M(500) }, refs: { for: H }, audience: [AUTH] }, exact: true })
}
{
  // round 3: goods count only when they move to the `to` side (folds.md, stage 2): a delivery to a stranger settles nothing
  const s = story(), farm = s.person('g3farm'), x = s.person('g3x'), y = s.person('g3y')
  const flour = s.say(farm, 'thing', { kind: 'flour' })
  const offer = s.say(farm, 'promise', { terms: { quantity: fb.amount('2', 'kg'), expires: LATER } }, { from: farm.id, to: x.id, what: flour.hash })
  answer(s, x, offer, { status: 'accepted' })
  const moved = s.say(farm, 'transfer', { amount: fb.amount('2', 'kg') }, { what: flour.hash, to_owner: y.id, for: offer.hash })
  s.say(y, 'transfer', { status: 'accepted' }, { answers: moved.hash, for: offer.hash })
  stage('round 3: goods delivered to a stranger move nothing toward the promise', offer, s.held, { stage: 'accepted', lines: [{ id: null, needed: 2, moved: 0 }] })
}
{
  // round 3: circles. A member's own leaving cuts at the stop, whatever counted_to it names; an open grant's joiner leaves alone
  const s = story(), F = s.person('c3F'), M2 = s.person('c3M'), N = s.person('c3N'), R = s.person('c3R')
  const roles = [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'adm', powers: ['admit', 'remove', 'sign'] }, { name: 'mem', powers: [] }, { name: 'rm', powers: ['remove'] }]
  const C = s.say(F, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'c3', roles })
  const join = (by, who, r) => { const g = s.say(by, 'grant', { kind: 'member', roles: r }, { subject: C.hash, to: who.id, as: C.hash }); return { g, a: s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: C.hash }) } }
  const jm = join(F, M2, ['adm'])
  const x1 = s.say(M2, 'observe', { kind: 'note', text: 'early' }, { as: C.hash })
  const jn = join(M2, N, ['mem'])
  const x2 = s.say(M2, 'observe', { kind: 'note', text: 'late' }, { as: C.hash })
  s.say(M2, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: x1.hash }, { updates: jm.g.hash, subject: C.hash, as: C.hash }, { after: [x2.hash, jn.a.hash] })
  door('round 3: circles: a member leaving with an early counted_to keeps whom they admitted: the leave cuts at the stop', 'circle_state', [C.hash, s.held, null], { expect: { members: { [N.id]: { roles: ['mem'] } }, removed: { [M2.id]: null } } })
  door('round 3: circles: and what they signed for the circle before leaving still speaks for it', 'may_act_as', [x2, C.hash, s.held, null], { expect: true, exact: true })
  // an open grant: a joiner who holds remove (the founder) and stops it in the usual form (kind, subject, as) leaves it alone
  const open = s.say(F, 'grant', { kind: 'member', roles: ['mem'] }, { subject: C.hash, as: C.hash })
  const aj = s.say(F, 'grant', { status: 'accepted', kind: 'member' }, { answers: open.hash, subject: C.hash })
  const ak = s.say(R, 'grant', { status: 'accepted', kind: 'member' }, { answers: open.hash, subject: C.hash })
  s.say(F, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: open.hash, subject: C.hash, as: C.hash }, { after: [aj.hash, ak.hash] })
  const st = door('round 3: circles: an open grant\'s joiner who holds remove and stops it with as leaves it alone; the other joiner stays (the founder, who joined it, is out: batch 2 P5)', 'circle_state', [C.hash, s.held, null])
  assert.deepEqual(st.members[R.id].roles, ['mem'])
  assert.ok(!(F.id in st.members) && F.id in st.removed)
}
{
  // round 3: death. A close ends no promise, whatever continues names, and two closes end none either (batch 2 P7); a dead founder is out
  const UNTIL = '2028-12-31T00:00:00.000Z'
  const world = (keep, both) => {
    const s = story(), A = s.person('d3A' + keep + both), B = s.person('d3B' + keep + both), W = s.person('d3W' + keep + both), C = s.person('d3C' + keep + both)
    const thing = s.say(A, 'thing', { kind: 'x', name: 'x' })
    const p = s.say(A, 'promise', { what: 'no rival', terms: { expires: LATER } }, { from: A.id, to: C.id, what: thing.hash })
    const ctr = s.say(C, 'promise', { terms: { refrain: true, until: UNTIL, expires: LATER } }, { answers: p.hash, for: p.hash })
    const acc = s.say(A, 'promise', { status: 'accepted' }, { answers: ctr.hash, for: p.hash })
    const sg = s.say(A, 'grant', { kind: 'successor', witnesses: [W.id], needed: 1, wait: 'P7D' }, { to: B.id })
    const t = s.say(W, 'observe', { kind: 'trigger' }, { under: sg.hash, subject: A.id })
    const named = { first: [p.hash], counter: [ctr.hash], accept: [acc.hash] }[keep]
    s.say(B, 'observe', { kind: 'close', continues: named }, { under: sg.hash, subject: A.id, after: [t.hash] })
    if (both) s.say(B, 'observe', { kind: 'close' }, { under: sg.hash, subject: A.id, after: [t.hash] })
    return { s, p, sg, A, t }
  }
  for (const keep of ['first', 'counter', 'accept']) {
    const { s, p } = world(keep, false)
    stage(`round 3: close: a close naming the ${keep} in continues: no close ends a promise, whatever it names (batch 2 P7)`, p, s.held, { stage: 'accepted', from: null })
  }
  const two = world('first', true)
  stage('round 3: close: two closes, one naming the promise and one not: neither ends it (batch 2 P7)', two.p, two.s.held, { stage: 'accepted', from: null })
  // the view reads events alone: a stopped successor grant still reads fired once its events and wait have run (the fold counts no close under it)
  const v = world('first', false)
  v.s.say(v.A, 'grant', { status: 'stopped', stop: 'onward' }, { updates: v.sg.hash })
  door('round 3: successor view: it reads the events alone, so a stopped grant still reads fired', 'successor_view', [v.sg, v.s.held, '2030-01-01T00:00:00.000Z', { [v.t.hash]: '2027-01-01T00:00:00.000Z' }], { expect: { fired: true } })
  // a dead founder: the founder is never removed except by a death
  const s = story(), F = s.person('d3F'), K = s.person('d3K'), W = s.person('d3W')
  const C = s.say(F, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'd3', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }] })
  const sg = s.say(F, 'grant', { kind: 'successor', witnesses: [W.id], needed: 1, wait: 'P7D' }, { to: K.id })
  const t = s.say(W, 'observe', { kind: 'trigger' }, { under: sg.hash, subject: F.id })
  s.say(K, 'observe', { kind: 'close' }, { under: sg.hash, subject: F.id, after: [t.hash] })
  door('round 3: circles: a dead founder is out from the close, in removed with no counted_to', 'circle_state', [C.hash, s.held, null], { expect: { members: {}, removed: { [F.id]: null } }, exact: false })
}


{
  // ---- 14. Patrick's round-1 decisions not yet in the tree, and the market-design study's engine disagreements ----
  const ID = '0'.repeat(64)
  // decision 2: an open member grant carries no power
  {
    const s = story(), F = s.person('o2F'), R = s.person('o2R'), N = s.person('o2N')
    const C = s.say(F, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'o2', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }, { name: 'rm', powers: ['remove'] }] })
    const strong = s.say(F, 'grant', { kind: 'member', roles: ['rm'] }, { subject: C.hash, as: C.hash })
    s.say(R, 'grant', { status: 'accepted', kind: 'member' }, { answers: strong.hash, subject: C.hash })
    const weak = s.say(F, 'grant', { kind: 'member', roles: ['mem'] }, { subject: C.hash, as: C.hash })
    s.say(N, 'grant', { status: 'accepted', kind: 'member' }, { answers: weak.hash, subject: C.hash })
    const st = door('decision 2: an open member grant naming a role with a power counts for nothing; one with a powerless role lets anyone in', 'circle_state', [C.hash, s.held, null], { expect: { members: { [N.id]: { roles: ['mem'] } }, removed: {} } })
    assert.ok(!(R.id in st.members))
    s.say(F, 'grant', { kind: 'member', roles: ['rm'] }, { updates: weak.hash, subject: C.hash, as: C.hash })
    door('decision 2: a change of an open grant that names a role with a power counts for nothing', 'circle_state', [C.hash, s.held, null], { expect: { members: { [N.id]: { roles: ['mem'] } } } })
  }
  // decision 3: only an explicit confirms makes a stop both sides'
  {
    const s = story(), A = s.person('o3A'), B = s.person('o3B'), loaf = s.say(A, 'thing', { kind: 'loaf' })
    const one = () => { const p = s.say(A, 'promise', { terms: { price: M(300), expires: DAY } }, { from: A.id, to: B.id, what: loaf.hash }); const y = answer(s, B, p, { status: 'accepted' }); return { p, y } }
    const a = one()
    const sa = s.say(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: a.p.hash, for: a.p.hash, after: [a.y.hash] })
    answer(s, B, a.p, { status: 'stopped', stop: 'onward' }, { after: [sa.hash] })
    stage('decision 3: the seller stops alone and the buyer stops later: by is the seller, not both', a.p, s.held, { stage: 'stopped', from: sa.hash, by: 'from' })
    const b = one()
    const sb = s.say(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: b.p.hash, for: b.p.hash, after: [b.y.hash] })
    s.say(B, 'observe', { kind: 'note', text: 'agreed' }, { confirms: sb.hash, for: b.p.hash })
    stage('decision 3: the buyer confirms the seller\'s stop: both', b.p, s.held, { stage: 'stopped', from: sb.hash, by: 'both' })
  }
  // decision 4, replaced by batch 2 P4 and P7: a close ends no refrain, and the side's word of a breach is a dispute, whenever it happened
  {
    const s = story(), farm = s.person('o4farm'), mill = s.person('o4mill'), son = s.person('o4son'), w = s.person('o4w')
    const spray = s.say(farm, 'thing', { kind: 'schema', name: 'spray' })
    const sg = s.say(farm, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: son.id })
    const p = s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash })
    answer(s, mill, p, { status: 'accepted' })
    const t = s.say(w, 'observe', { kind: 'trigger' }, { under: sg.hash, subject: farm.id })
    const close = s.say(son, 'observe', { kind: 'close' }, { under: sg.hash, subject: farm.id, after: [t.hash] }, { time: '2027-01-01T00:00:00.000Z' })
    const d1 = s.say(mill, 'observe', { kind: 'test', text: 'residue found', when: '2027-03-01T00:00:00.000Z' }, { defeats: p.hash, for: p.hash })
    stage('decision 4 (batch 2 P7): the promiser\'s close ends no refrain: still accepted after it, the side\'s word a dispute', p, s.held, { stage: 'accepted', from: null, disputed: [{ hash: d1.hash, of: p.hash, by: 'to' }] })
    const b = s.say(mill, 'observe', { kind: 'test', text: 'residue from before', when: '2026-12-01T00:00:00.000Z' }, { defeats: p.hash, for: p.hash })
    const both = [d1.hash, b.hash].sort().map((h) => ({ hash: h, of: p.hash, by: 'to' }))
    stage('decision 4 (batch 2 P4): two claims of a breach by the side it was made to are two disputes, both shown: no stage changes', p, s.held, { stage: 'accepted', disputed: both })
    void close
  }
  // decision 6: an updates stop counts only from the author
  {
    const s = story(), A = s.person('o6A'), B = s.person('o6B'), loaf = s.say(A, 'thing', { kind: 'loaf' })
    const p = s.say(A, 'promise', { terms: { price: M(300), expires: DAY } }, { from: A.id, to: B.id, what: loaf.hash })
    const y = answer(s, B, p, { status: 'accepted' })
    s.say(B, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p.hash, for: p.hash, after: [y.hash] })
    stage('decision 6: the other side\'s updates stop counts for nothing: they stop by answers', p, s.held, { stage: 'accepted', from: null })
    const own = s.say(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p.hash, for: p.hash, after: [y.hash] })
    stage('decision 6: the author\'s own updates stop counts', p, s.held, { stage: 'stopped', from: own.hash, by: 'from' })
  }
  // decision 8: a child's scope.every is no shorter than its parent's; decision 9: limit_within_parent
  {
    const s = story(), p = s.person('o8p'), a = s.person('o8a')
    const parent = s.say(p, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['transfer'], limit: M(1000), every: 'P7D', until: LATER } }, { to: a.id })
    const kid = (per) => ({ type: 'grant', state: { kind: 'errands', scope: { acts: ['transfer'], limit: M(1000), every: per, until: LATER } }, refs: { author: a.id, to: ID, parent: parent.hash } })
    check('decision 8: a child whose period is shorter than its parent\'s is wider (the same limit, spent more often)', kid('P1D'), ['wider_than_parent'], [parent])
    check('decision 8: a child whose period is longer than its parent\'s is within', kid('P14D'), [], [parent])
    const T = '2026-10-27T12:00:00.000Z', par = { limit: M(1000), every: 'P1D', each: M(200) }
    door('decision 9: limit_within_parent: a smaller limit over a longer period, a smaller cap on each act, is within', 'limit_within_parent', [{ limit: M(500), every: 'P7D', each: M(100) }, par, T], { expect: true, exact: true })
    door('decision 9: limit_within_parent: a shorter period is not within', 'limit_within_parent', [{ limit: M(500), every: 'PT1H', each: M(100) }, par, T], { expect: false, exact: true })
    door('decision 9: limit_within_parent: a larger limit is not within', 'limit_within_parent', [{ limit: M(2000), every: 'P7D', each: M(100) }, par, T], { expect: false, exact: true })
    door('decision 9: limit_within_parent: another currency is not within', 'limit_within_parent', [{ limit: M(500, 'EUR'), every: 'P7D', each: M(100, 'EUR') }, par, T], { expect: false, exact: true })
    door('decision 9: limit_within_parent: a child with no cap on each act where the parent has one is not within', 'limit_within_parent', [{ limit: M(500), every: 'P7D' }, par, T], { expect: false, exact: true })
    door('decision 9: limit_within_parent: the limit observes themselves are read by their state', 'limit_within_parent', [{ type: 'observe', state: { kind: 'limit', limit: fb.amount('40', 'kg'), every: 'P7D' } }, { type: 'observe', state: { kind: 'limit', limit: fb.amount('50', 'kg'), every: 'P7D' } }, T], { expect: true, exact: true })
    refusedArg('decision 9: limit_within_parent: at is a time', 'limit_within_parent', [{ limit: M(500), every: 'P7D' }, { limit: M(1000), every: 'P1D' }, 'yesterday'])
  }
  // decision 12: a stop ends a grant only for the blocks that see it, as a death does
  {
    const s = story(), p = s.person('o12p'), agent = s.person('o12agent', { kind: 'agent' }), kid = s.person('o12kid'), w = s.person('o12w'), farm = s.person('o12farm')
    const errands = s.say(p, 'grant', { kind: 'errands', scope: { acts: ['observe.note'], until: LATER } }, { to: agent.id })
    const stop = s.say(p, 'grant', { status: 'stopped', stop: 'onward' }, { updates: errands.hash })
    door('decision 12: a block that has not seen the stop still acts under the grant (what was done before stands)', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'offline' }, { under: errands.hash, after: [errands.hash] }), s.held], { expect: true, exact: true })
    door('decision 12: a block that sees the stop does not', 'under_ok', [s.say(agent, 'observe', { kind: 'note', text: 'after' }, { under: errands.hash, after: [stop.hash] }), s.held], { expect: false, exact: true })
    const box = s.say(farm, 'thing', { kind: 'veg box' })
    const weekly = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(1500), expires: DAY } }, { from: farm.id, to: p.id, what: box.hash })
    answer(s, p, weekly, { status: 'accepted' })
    const sg = s.say(p, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: kid.id })
    s.say(p, 'grant', { status: 'stopped', stop: 'onward' }, { updates: sg.hash })
    const t = s.say(w, 'observe', { kind: 'trigger' }, { under: sg.hash, subject: p.id })
    const close = s.say(kid, 'observe', { kind: 'close' }, { under: sg.hash, subject: p.id, after: [t.hash] })
    // security D (2026-10-28): the person can always take a successor grant back: their stop voids every close under it, seen or not
    stage('security D: a close that has not seen the person\'s stop of the successor grant counts for nothing: the stop voids every close under it', weekly, s.held, { stage: 'accepted', from: null, by: null })
    void close
  }
  // decision 13: a dead successor closes no one
  for (const sonDiesFirst of [true, false]) {
    const tag = sonDiesFirst ? 'a' : 'b'
    const s = story(), gran = s.person('o13gran' + tag), son = s.person('o13son' + tag), gs = s.person('o13gs' + tag), w = s.person('o13w' + tag), farm = s.person('o13farm' + tag)
    const box = s.say(farm, 'thing', { kind: 'veg box' })
    const weekly = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(1500), expires: DAY } }, { from: farm.id, to: gran.id, what: box.hash })
    answer(s, gran, weekly, { status: 'accepted' })
    const g1 = s.say(gran, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: son.id })
    const g2 = s.say(son, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: gs.id })
    const t1 = s.say(w, 'observe', { kind: 'trigger' }, { under: g1.hash, subject: gran.id })
    const sonDies = () => { const t2 = s.say(w, 'observe', { kind: 'trigger' }, { under: g2.hash, subject: son.id }); return s.say(gs, 'observe', { kind: 'close' }, { under: g2.hash, subject: son.id, after: [t2.hash] }) }
    if (sonDiesFirst) {
      const sonsClose = sonDies()
      s.say(son, 'observe', { kind: 'close' }, { under: g1.hash, subject: gran.id, after: [t1.hash, sonsClose.hash] })
      stage('decision 13: a close by a successor whose own counted close is in its past counts for nothing', weekly, s.held, { stage: 'accepted' })
    } else {
      const close = s.say(son, 'observe', { kind: 'close' }, { under: g1.hash, subject: gran.id, after: [t1.hash] })
      sonDies()
      stage('decision 13: a close the successor wrote before their own death ends no promise (batch 2 P7; its authority twin is in section 22)', weekly, s.held, { stage: 'accepted', from: null })
      void close
    }
  }
  // decision 15: a schema's fields, grounds and roles, and the items of shares, are not places
  check('decision 15: a schema\'s fields named value and unit are data, not an amount', { type: 'thing', state: { kind: 'schema', target: 'observe', fields: { value: 'text', unit: 'text' } } }, [])
  check('decision 15: a schema\'s fields with a value of true are data', { type: 'thing', state: { kind: 'schema', target: 'observe', fields: { scheme: 'the register', value: true } } }, [])
  check('decision 15: a schema\'s grounds and roles are data, whatever their keys', { type: 'thing', state: { kind: 'schema', target: 'observe', grounds: { minor: 'x', currency: 'y' }, roles: { min: 'a', max: 'b' } } }, [])
  check('decision 15: the items of shares are not read as shapes', { type: 'transform', state: { kind: 'make', shares: [{ from: '1e3', share: '1' }, { value: 'x', unit: 1 }] }, refs: { derives_from: [ID] } }, [])
  check('decision 15: marks are still read on a schema', { type: 'thing', state: { kind: 'schema', target: 'observe', fields: { value: 'text', unit: 'text' }, marks: [{ scheme: 'x' }] } }, ['shape'])
  // decision 16: legacy zone names
  {
    const z = (zone) => ({ type: 'promise', state: { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY', zone, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } })
    for (const name of ['GMT', 'CET', 'EST5EDT', 'Zulu', 'Etc/GMT+5']) check(`decision 16: the legacy zone name ${name} is shaped like an IANA name`, z(name), [])
    for (const name of ['', 'Europe/', '/London', 'Europe London', '5Zone']) check(`decision 16: ${JSON.stringify(name)} is not shaped like a zone name`, z(name), ['grammar'])
  }
  // market design: two members who may sign allocate the last stock from one open offer, offline: a fork, neither binds, in any order
  {
    const kg = (q) => fb.amount(String(q), 'kg')
    const s = story(), own = s.person('mdown'), st1 = s.person('mdst1'), st2 = s.person('mdst2'), b1 = s.person('mdb1'), b2 = s.person('mdb2')
    const C = s.say(own, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Stall', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'staff', powers: ['sign'] }] })
    for (const m of [st1, st2]) { const g = s.say(own, 'grant', { kind: 'member', roles: ['staff'] }, { subject: C.hash, as: C.hash, to: m.id }); s.say(m, 'grant', { status: 'accepted' }, { answers: g.hash }) }
    const eggs = s.say(own, 'thing', { kind: 'eggs' })
    const O = s.say(own, 'promise', { terms: { price: { money: M(100, 'KES'), per: kg(1) }, quantity: kg(100), expires: DAY } }, { from: C.hash, as: C.hash, what: eggs.hash })
    const R1 = answer(s, b1, O, { status: 'accepted', terms: { quantity: kg(30) } }, { to: b1.id })
    const R2 = answer(s, b2, O, { status: 'accepted', terms: { quantity: kg(30) } }, { to: b2.id })
    const A1 = s.say(st2, 'promise', { status: 'accepted' }, { answers: R1.hash, for: O.hash, as: C.hash, after: [R1.hash, O.hash] })
    const A2 = s.say(st1, 'promise', { status: 'accepted' }, { answers: R2.hash, for: O.hash, as: C.hash, after: [R2.hash, O.hash] })
    const base = s.held.filter((b) => b !== A1 && b !== A2), forks = [A1.hash, A2.hash].sort()
    // decision C2: every allocation the offerer signed binds the offerer; the fork is her lie, shown, and frees her of neither taker
    stage('C2: market: two staff allocate from one open offer offline: a fork, shown, and both allocations bind the stall', O, [...base, A1, A2], { stage: 'accepted', takers: [{ allocation: A1.hash }, { allocation: A2.hash }].sort((x, y) => (x.allocation < y.allocation ? -1 : 1)), forks, quantity: { value: '60', unit: 'kg' } })
    stage('C2: market: the same blocks met in the other order give the same answer', O, [...base, A2, A1], { stage: 'accepted', forks, quantity: { value: '60', unit: 'kg' } })
  }
  // market design: an open offer with lines offers each line once
  {
    const s = story(), a = s.person('mlA'), x = s.say(a, 'thing', { kind: 'x' }), y = s.say(a, 'thing', { kind: 'y' })
    const O = s.say(a, 'promise', { terms: { lines: [{ id: '1', what: x.hash, quantity: fb.amount('1', 'kg'), price: M(450) }, { id: '2', what: y.hash, quantity: fb.amount('2', 'kg'), price: M(900) }], expires: DAY } }, { from: a.id, what: [x.hash, y.hash] })
    let first = null
    for (const n of ['1', '2', '3']) {
      const t = s.person('mlT' + n), r = answer(s, t, O, { status: 'accepted' })
      const prior = s.held.filter((b) => b.refs.author === a.id && b.state.status === 'accepted').map((b) => b.hash)
      const al = s.say(a, 'promise', { status: 'accepted' }, { answers: r.hash, for: O.hash, after: [r.hash, ...prior] })
      first = first || al
    }
    stage('C2: market: an open offer with lines: each allocation its offerer signed binds her: three takers are each owed the basket', O, s.held, { stage: 'accepted', accept: first.hash, takers: [{ allocation: first.hash }, {}, {}] })
  }
  // market design: one payment never pays many promises in full
  {
    check('market: a payment for several promises with no split is refused', { type: 'transfer', state: { money: M(1000) }, refs: { to_owner: ID, for: ['a'.repeat(64), 'b'.repeat(64)] } }, ['required'])
    check('market: a split adding up to more than the payment is refused', { type: 'transfer', state: { money: M(1000), split: [{ for: 'a'.repeat(64), money: M(1000) }, { for: 'b'.repeat(64), money: M(1000) }] }, refs: { to_owner: ID, for: ['a'.repeat(64), 'b'.repeat(64)] } }, ['shape'])
    check('market: a split in another currency than the payment is refused', { type: 'transfer', state: { money: M(1000), split: [{ for: 'a'.repeat(64), money: M(500, 'EUR') }] }, refs: { to_owner: ID, for: ['a'.repeat(64), 'b'.repeat(64)] } }, ['shape'])
    check('market: a split that adds up to the payment passes', { type: 'transfer', state: { money: M(1000), split: [{ for: 'a'.repeat(64), money: M(600) }, { for: 'b'.repeat(64), money: M(400) }] }, refs: { to_owner: ID, for: ['a'.repeat(64), 'b'.repeat(64)] } }, [])
    const s = story(), A = s.person('mpA'), B = s.person('mpB'), x = s.say(A, 'thing', { kind: 'x' })
    const ps = [0, 1, 2].map(() => { const p = s.say(A, 'promise', { terms: { price: M(1000), expires: DAY } }, { from: A.id, to: B.id, what: x.hash }); answer(s, B, p, { status: 'accepted' }); return p })
    const fors = ps.map((p) => p.hash)
    const pay = s.raw(B, 'transfer', { money: M(1000) }, { to_owner: A.id, for: fors })
    s.say(A, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: fors })
    stage('market: a payment for three promises with no split (held anyway) pays none of them', ps[0], s.held, { stage: 'accepted', paid: null })
    // the split payments are in section 17: B's chain here holds the refused payment above, so nothing B signs after it is read
  }
}

// ---- 15. Repair after the simplification: the cases two engines read differently, now one reading, each with a vector ----
{
  const ID = '0'.repeat(64)
  // A promise names its act only under the grant it acts under: live, and made for its signer (folds.md, Who a block speaks for). A grant that is
  // not live or not for the signer is no grant: the word under it is its signer's own, whoever signs it (batch 2 P11), and binds them alone.
  {
    const s = story(), b = s.person('qb'), f = s.person('qf'), g = s.person('qg', { kind: 'agent' }), h = s.person('qh')
    const flour = s.say(b, 'thing', { kind: 'flour' })
    const grant = (to) => s.say(b, 'grant', { kind: 'authority', scope: { acts: ['promise'], until: LATER, limit: M(1000) } }, { to: to.id })
    const terms = { expires: DAY, price: M(100) }
    const toH = grant(h)
    const pB = s.raw(g, 'promise', { terms }, { from: g.id, to: f.id, what: flour.hash, under: toH.hash }, { after: [toH.hash] })
    answer(s, f, pB, { status: 'accepted' })
    stage('repair: an autonomous system\'s offer under a grant made for someone else acts under no grant: its own word, the accept binds it alone (batch 2 P11)', pB, s.held, { stage: 'accepted', sides: { from: g.id } })
    const toG = grant(g)
    const stop = s.say(b, 'grant', { kind: 'authority', status: 'stopped', stop: 'onward' }, { updates: toG.hash, after: [toG.hash] })
    const pE = s.raw(g, 'promise', { terms }, { from: g.id, to: f.id, what: flour.hash, under: toG.hash }, { after: [toG.hash, stop.hash] })
    answer(s, f, pE, { status: 'accepted' })
    stage('repair: an autonomous system\'s offer under its own grant that it saw stopped acts under no grant: its own word, the accept binds it alone (batch 2 P11)', pE, s.held, { stage: 'accepted', sides: { from: g.id } })
    const pA = s.raw(b, 'promise', { terms }, { from: b.id, to: f.id, what: flour.hash, under: toG.hash }, { after: [toG.hash] })
    const yA = answer(s, f, pA, { status: 'accepted' })
    stage('repair: a person\'s offer naming a grant not made for them speaks for the person and binds when accepted', pA, s.held, { stage: 'accepted', accept: yA.hash })
    const toG2 = grant(g)
    const pOk = s.say(g, 'promise', { terms }, { from: b.id, to: f.id, what: flour.hash, under: toG2.hash })
    const yOk = answer(s, f, pOk, { status: 'accepted' })
    stage('repair: an autonomous system\'s offer under its own live grant that names the act binds its principal', pOk, s.held, { stage: 'accepted', accept: yOk.hash, sides: { from: b.id, to: f.id } })
  }
  // The quantity chosen is an amount, never the offer's range: a job done counts work against the quantity accepted; a promise to yourself with a range
  // has chosen nothing
  {
    const s = story(), d = s.person('rjd'), f = s.person('rjf'), eggs = s.say(d, 'thing', { kind: 'eggs' })
    const g = (v) => fb.amount(String(v), 'g'), kg = (v) => fb.amount(String(v), 'kg')
    const job = s.say(f, 'promise', { what: 'job', terms: { expires: DAY, price: { money: M(100), per: g(3) }, quantity: { min: g(2), max: g(10) } } }, { from: f.id, to: d.id })
    const y = answer(s, d, job, { status: 'accepted', terms: { quantity: g(7) } })
    const pay = s.say(d, 'transfer', { money: M(5000) }, { to_owner: f.id, for: job.hash, after: [y.hash] })
    s.say(f, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: job.hash })
    stage('repair: a job offered as a range and paid, with no work done, is underway: work counts against the 7 g accepted', job, s.held, { stage: 'underway', quantity: g(7), total: { minor: 233, currency: 'GBP' } })
    const w1 = s.say(f, 'observe', { kind: 'work', amount: g(5) }, { for: job.hash, after: [y.hash] })
    s.say(d, 'observe', { status: 'accepted' }, { answers: w1.hash, for: job.hash })
    stage('repair: accepted work of 5 g against the 7 g accepted is not done', job, s.held, { stage: 'underway' })
    const w2 = s.say(f, 'observe', { kind: 'work', amount: g(2) }, { for: job.hash, after: [y.hash] })
    s.say(d, 'observe', { status: 'accepted' }, { answers: w2.hash, for: job.hash })
    stage('repair: accepted work that covers the 7 g accepted is done', job, s.held, { stage: 'done' })
    const self = s.say(f, 'promise', { terms: { expires: DAY, price: { money: M(333), per: kg(1) }, quantity: { min: kg(1), max: kg(5) } } }, { from: f.id, to: f.id, what: eggs.hash })
    stage('repair: a promise to yourself with a range has chosen no quantity: none is needed and no total is known', self, s.held, { stage: 'accepted', quantity: null, lines: [{ id: null, needed: null, moved: 0 }], total: null })
  }
  // An allocation from an open offer that speaks for neither side has no stage (the oracle used to throw)
  {
    const s = story(), a = s.person('ala'), b = s.person('alb'), f = s.person('alf')
    const flour = s.say(a, 'thing', { kind: 'flour' })
    const C = s.say(a, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'C1', roles: [{ name: 'r0', powers: ['admit'] }, { name: 'r1', powers: ['sign'] }] })
    const O = s.raw(b, 'promise', { terms: { expires: DAY, lines: [{ id: 'l0', what: flour.hash, quantity: fb.amount('2', 'kg'), price: M(999, 'USD') }] } }, { what: flour.hash, from: C.hash, as: C.hash })
    const R = s.raw(f, 'promise', { status: 'accepted' }, { answers: O.hash, for: O.hash }, { after: [O.hash] })
    const A = s.raw(b, 'promise', { status: 'accepted' }, { answers: R.hash, for: O.hash, as: C.hash }, { after: [R.hash] })
    door('repair: an open offer signed as a circle by one who may not sign for it has no stage', 'promise_stage', [O, s.held, {}], { expect: null, exact: true })
    door('repair: an allocation from that offer has no stage either', 'promise_stage', [A, s.held, {}], { expect: null, exact: true })
    door('repair: nor a view of it', 'promise_view', [A, s.held, { now: BEFORE }], { expect: null, exact: true })
  }
  // The door's optional arguments: may_act_as with a role, circle_state within a block, and key_timeline's by, signer and void
  {
    const s = story(), a = s.person('dra'), b = s.person('drb')
    const C = s.say(a, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'C', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'cook', powers: [] }] })
    const G = s.say(a, 'grant', { kind: 'member', roles: ['cook'] }, { subject: C.hash, to: b.id, as: C.hash })
    const early = s.say(b, 'observe', { kind: 'note', text: 'before joining' }, { after: [G.hash] })
    const yes = s.say(b, 'grant', { status: 'accepted' }, { answers: G.hash, subject: C.hash })
    const note = s.say(b, 'observe', { kind: 'note', text: 'hi' }, { after: [yes.hash] })
    door('repair: may_act_as with a role: true when the author holds it in the fold of the block\'s past, signed as the circle or not', 'may_act_as', [note, C.hash, s.held, 'cook'], { expect: true, exact: true })
    door('repair: may_act_as with a role the author does not hold is false', 'may_act_as', [note, C.hash, s.held, 'boss'], { expect: false, exact: true })
    door('repair: may_act_as with a role, read at a block from before the author joined, is false', 'may_act_as', [early, C.hash, s.held, 'cook'], { expect: false, exact: true })
    door('repair: may_act_as with no role: a block not signed as the circle does not speak for it', 'may_act_as', [note, C.hash, s.held, null], { expect: false, exact: true })
    const founderOnly = { [a.id]: { roles: ['boss'], grant: C.hash, counted_to: null } }
    door('repair: circle_state within a block from before the member answered shows only the founder', 'circle_state', [C.hash, s.held, G], { expect: { founder: a.id, members: founderOnly, removed: {} }, exact: true })
    door('repair: circle_state within a block after the member answered shows them', 'circle_state', [C.hash, s.held, note], { expect: { founder: a.id, members: { ...founderOnly, [b.id]: { roles: ['cook'], grant: G.hash, counted_to: null } }, removed: {} }, exact: true })
    const last = s.held.filter((x) => x.refs.author === b.id).pop()
    const rot = s.say(b, 'grant', { kind: 'key', public_key_sign: keyOf('drbnew').public_key_sign, replaces: keyOf('drb').public_key_sign, counted_to: last.hash }, { subject: b.id })
    door('repair: key_timeline names the block that brought each key in and the key that signed it (no void field: a void key is never listed)', 'key_timeline', [b.id, s.held, null], { expect: [
      { key: keyOf('drb').public_key_sign, by: b.id, signer: null, frozen: false, suite: 'std' },
      { key: keyOf('drbnew').public_key_sign, by: rot.hash, signer: keyOf('drb').public_key_sign, frozen: false, suite: 'std' },
    ], exact: true })
  }
  // The one receiver rule: a to_role that is not a role's name names no one, and so does a refs.to that is not one id, in under_ok and in consent
  {
    const s = story(), a = s.person('rra'), x = s.person('rrx'), p = s.person('rrp')
    for (const role of ['', 5, true, ['r0'], { r: 1 }]) {
      const g = s.raw(a, 'grant', { kind: 'errands', to_role: role, scope: { acts: ['observe'], until: LATER } }, { to: x.id })
      door(`repair: a grant whose to_role is ${JSON.stringify(role)} (not a role's name) is received by no one, not even its refs.to`, 'under_ok', [s.raw(x, 'observe', { kind: 'note', text: 'acted' }, { under: g.hash }, { after: [g.hash] }), s.held], { expect: false, exact: true })
    }
    const blank = s.raw(a, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: '' })
    door('repair: a grant whose refs.to is empty text is received by no one', 'under_ok', [s.raw(x, 'observe', { kind: 'note', text: 'acted' }, { under: blank.hash }, { after: [blank.hash] }), s.held], { expect: false, exact: true })
    s.say(p, 'observe', { kind: 'consent', word: 'stop' }, { subject: a.id })
    door('repair: consent: a person\'s stop about a grantor does not reach a sender under a grant whose refs.to is empty text', 'consent', [p.id, x.id, s.held, blank.hash], { expect: { word: null, block: null }, exact: true })
  }
}

// ---- 16. Groups, refrains, crossing stops and the small fixes (Patrick's decisions F1 to F7, 2026-10-28) ----
{
  const ID = '0'.repeat(64)
  const R = [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'adm', powers: ['admit'] }, { name: 'rm', powers: ['remove'] }, { name: 'mem', powers: [] }, { name: 'sig', powers: ['sign'] }]
  const kit = (s) => {
    const circle = (f, extra = {}) => s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'C' + tick, roles: R, ...extra })
    const invite = (by, C, who, roles, after) => s.say(by, 'grant', { kind: 'member', roles }, { subject: C.hash, to: who.id, as: C.hash, ...(after ? { after } : {}) })
    const accept = (who, C, g, after) => s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: C.hash, ...(after ? { after } : {}) })
    const join = (by, C, who, roles, after) => { const g = invite(by, C, who, roles, after); return { g, a: accept(who, C, g) } }
    const stopOf = (by, C, g, after) => s.say(by, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: g.hash, subject: C.hash, as: C.hash, ...(after ? { after } : {}) })
    const change = (by, C, g, roles, after) => s.say(by, 'grant', { kind: 'member', roles }, { updates: g.hash, subject: C.hash, as: C.hash, ...(after ? { after } : {}) })
    return { circle, invite, accept, join, stopOf, change }
  }
  const rolesIn = (st) => st && { members: Object.fromEntries(Object.entries(st.members).map(([k, m]) => [k, { roles: m.roles }])), removed: st.removed }
  const circ = (name, C, held, expect) => door(name, 'circle_state', [C.hash, held], { expect })

  // F1. Every removal-like act needs N people: taking admit or remove away, and a stop that never saw the answer
  {
    const s = story(), k = kit(s), F = s.person('g1F'), A = s.person('g1A'), B = s.person('g1B')
    const C = k.circle(F, { removal: { needed: 2 } })
    const ja = k.join(F, C, A, ['boss'])
    const jb = k.join(F, C, B, ['boss'], [ja.a.hash])
    k.change(A, C, jb.g, ['mem'], [jb.a.hash])
    circ('groups: one admin alone cannot take admin or remove from a member where removal needs two: the member keeps the role', C, s.held, { members: { [B.id]: { roles: ['boss'] } }, removed: {} })
    k.change(F, C, jb.g, ['mem'], [jb.a.hash])
    circ('groups: a second admin making the same change takes it away: two hands (the role it adds counts once the member answers)', C, s.held, { members: { [B.id]: { roles: [] } }, removed: {} })
  }
  {
    // round 3 #5: one holder of admit gives themselves remove, takes the target's powers and stops their grant alone
    const s = story(), k = kit(s), F = s.person('g5F'), A = s.person('g5A'), B = s.person('g5B')
    const C = k.circle(F, { removal: { needed: 2 } })
    const ja = k.join(F, C, A, ['adm'])
    const jb = k.join(F, C, B, ['boss'], [ja.a.hash])
    const up = k.change(A, C, ja.g, ['adm', 'rm'], [jb.a.hash])
    const yes = k.accept(A, C, up)
    const dem = k.change(A, C, jb.g, ['mem'], [yes.hash])
    k.stopOf(A, C, jb.g, [dem.hash])
    circ('groups: one holder of admit cannot give themselves remove: no one gives a power they do not hold, and the target keeps every role (batch 2 P5)', C, s.held, { members: { [A.id]: { roles: ['adm'] }, [B.id]: { roles: ['boss'] } }, removed: {} })
  }
  {
    // round 2 r7, round 3 #1: a stop that never saw the answer to an invitation giving admin
    const s = story(), k = kit(s), F = s.person('g7F'), A = s.person('g7A'), B = s.person('g7B')
    const C = k.circle(F, { removal: { needed: 2 } })
    const ja = k.join(F, C, A, ['boss'])
    const gb = k.invite(F, C, B, ['boss'], [ja.a.hash])
    k.accept(B, C, gb)
    k.stopOf(A, C, gb, [gb.hash])
    circ('groups: a lone stop that never saw the answer to an invitation giving admin is judged like a removal: where two must, the member is in', C, s.held, { members: { [B.id]: { roles: ['boss'] } }, removed: {} })
    k.stopOf(F, C, gb)
    const st = circ('groups: with a second remover the two stops stand: the member never joined by that grant, and is not in removed', C, s.held, { removed: {} })
    assert.ok(!(B.id in st.members))
  }
  {
    // taking back an invitation that gives admin
    const s = story(), k = kit(s), F = s.person('g8F'), A = s.person('g8A'), B = s.person('g8B')
    const C = k.circle(F, { removal: { needed: 2 } })
    const ja = k.join(F, C, A, ['boss'])
    const gb = k.invite(F, C, B, ['boss'], [ja.a.hash])
    const back = k.stopOf(A, C, gb, [gb.hash])
    k.accept(B, C, gb, [back.hash])
    circ('groups: one person alone cannot take back an invitation that gives admin where two must: the invitee who answers after it is in', C, s.held, { members: { [B.id]: { roles: ['boss'] } }, removed: {} })
    const s2 = story(), k2 = kit(s2), F2 = s2.person('g9F'), A2 = s2.person('g9A'), B2 = s2.person('g9B')
    const C2 = k2.circle(F2)
    const ja2 = k2.join(F2, C2, A2, ['boss'])
    const gb2 = k2.invite(F2, C2, B2, ['boss'], [ja2.a.hash])
    const back2 = k2.stopOf(A2, C2, gb2, [gb2.hash])
    k2.accept(B2, C2, gb2, [back2.hash])
    const st = circ('groups: where one removes, one takes it back: the later answer accepts nothing', C2, s2.held, { removed: {} })
    assert.ok(!(B2.id in st.members))
  }

  // F2. A removal always cuts at the stop: a circle reads no counted_to (the twin of a 1.6 causal case, the same blocks)
  {
    const OLD = 'circle_state: the removal keeps the counted_to the stop named', NEW = 'circles: a removal that names counted_to: removed names none (a circle reads no counted_to)'
    const src = V.door.find((c) => c.name === OLD) || V.door.find((c) => c.name === NEW)
    const removed = Object.fromEntries(Object.keys(src.expect.removed).map((id) => [id, null]))
    door(NEW, 'circle_state', src.args, { expect: { removed } })
  }

  // F3. A circle block that someone outside the circle built on before the stop stands, whatever the cut (built on in a stop's causal past)
  {
    const s = story(), k = kit(s), F = s.person('g3F'), P = s.person('g3P'), T = s.person('g3T'), N = s.person('g3N'), mill = s.person('g3mill')
    const C = k.circle(F)
    const flour = s.say(mill, 'thing', { kind: 'flour' })
    const jp = k.join(F, C, P, ['rm'])
    const jt = k.join(F, C, T, ['sig'], [jp.a.hash])
    const jn = k.join(F, C, N, ['mem'], [jt.a.hash])
    const offer = (n) => s.say(T, 'promise', { terms: { price: M(1000 + n), expires: DAY } }, { from: mill.id, to: C.hash, what: flour.hash, as: C.hash, after: [jt.a.hash] })
    const o1 = offer(1)
    const acc1 = answer(s, mill, o1, { status: 'accepted' })
    const o3 = offer(3)
    const note = s.say(N, 'observe', { kind: 'note', text: 'saw the order' }, { after: [o3.hash, jn.a.hash] })
    // two stops end T's grant: the founder's saw the mill's accept and N's note; P's saw neither
    k.stopOf(F, C, jt.g, [jt.a.hash, acc1.hash, note.hash])
    k.stopOf(P, C, jt.g, [jt.a.hash])
    const o2 = offer(2)
    answer(s, mill, o2, { status: 'accepted' })
    door('groups: a deal signed as the circle that someone outside it accepted, in the causal past of one stop that removed its signer, stands whatever the other cut', 'may_act_as', [o1, C.hash, s.held], { expect: true, exact: true })
    stage('groups: and that deal binds the circle: accepted', o1, s.held, { stage: 'accepted' })
    door('groups: one only a member built on is set aside by the stop that had not seen it: it speaks for no one', 'may_act_as', [o3, C.hash, s.held], { expect: false, exact: true })
    door('C6: groups: a removed member\'s deal an outsider accepted without seeing the removal stands: the circle is bound by what it let them sign', 'may_act_as', [o2, C.hash, s.held], { expect: true, exact: true })
  }

  // F4 (1). An invitation answer counts only if the invitation came after the removal
  {
    const s = story(), k = kit(s), F = s.person('g41F'), M2 = s.person('g41M')
    const C = k.circle(F)
    const g1 = k.invite(F, C, M2, ['mem'])
    const y1 = k.accept(M2, C, g1)
    const g2 = k.invite(F, C, M2, ['sig'])
    const stop = k.stopOf(F, C, g1, [y1.hash])
    k.accept(M2, C, g2, [stop.hash])
    const st = circ('groups: after a removal, an answer to an invitation from before it brings no one back: rejoining needs a new grant', C, s.held, { removed: { [M2.id]: null } })
    assert.ok(!(M2.id in st.members))
    const g3 = k.invite(F, C, M2, ['mem'], [stop.hash])
    k.accept(M2, C, g3)
    circ('groups: an invitation written after the removal brings them back once answered', C, s.held, { members: { [M2.id]: { roles: ['mem'], grant: g3.hash } }, removed: {} })
  }

  // F4 (3). A ring of removals is read like a crossing pair: the earliest member wins, otherwise all stand
  {
    const s = story(), k = kit(s), F = s.person('g43F'), A = s.person('g43A'), B = s.person('g43B'), Cc = s.person('g43C')
    const C = k.circle(F)
    const ja = k.join(F, C, A, ['boss'])
    const jb = k.join(F, C, B, ['boss'], [ja.a.hash])
    const jc = k.join(F, C, Cc, ['boss'], [jb.a.hash])
    k.stopOf(A, C, jb.g, [jb.a.hash])
    k.stopOf(B, C, jc.g, [jc.a.hash])
    k.stopOf(Cc, C, ja.g, [ja.a.hash])
    circ('D13: groups: three removals in a ring (A stops B, B stops C, C stops A, none seeing another): every one stands, the earliest member gets no immunity', C, s.held,
      { members: { [F.id]: { roles: ['boss'] } }, removed: { [A.id]: null, [B.id]: null, [Cc.id]: null } })
  }
  {
    const s = story(), k = kit(s), F = s.person('g44F'), A1 = s.person('g44A1'), A2 = s.person('g44A2'), A3 = s.person('g44A3'), B = s.person('g44B'), Cc = s.person('g44C'), D = s.person('g44D')
    const C = k.circle(F)
    // the three who admit hold every power they give (batch 2 P5: powers narrow as they pass)
    const j1 = k.join(F, C, A1, ['boss'])
    const j2 = k.join(F, C, A2, ['boss'], [j1.a.hash])
    const j3 = k.join(F, C, A3, ['boss'], [j2.a.hash])
    const jb = k.join(A1, C, B, ['boss'], [j3.a.hash])
    const jc = k.join(A2, C, Cc, ['boss'], [j3.a.hash])
    const jd = k.join(A3, C, D, ['boss'], [j3.a.hash])
    k.stopOf(B, C, jc.g, [jc.a.hash])
    k.stopOf(Cc, C, jd.g, [jd.a.hash])
    k.stopOf(D, C, jb.g, [jb.a.hash])
    circ('groups: a ring whose members have no earliest (their grants do not see each other): every removal in it stands (granted by admins who hold every power they give)', C, s.held, { removed: { [B.id]: null, [Cc.id]: null, [D.id]: null } })
  }

  // F5, deleted by batch 2 P4: a refrain a stop ended stays stopped in the view; when the stop came, against until, is a fact for each reader
  {
    const s = story(), farm = s.person('g5farm'), mill = s.person('g5mill')
    const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
    const refrain = () => s.say(farm, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm.id, to: mill.id, what: spray.hash })
    const p1 = refrain()
    answer(s, mill, p1, { status: 'accepted' })
    const late1 = s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p1.hash, for: p1.hash }, { time: '2028-01-01T12:00:00.000Z' })
    s.say(mill, 'observe', { kind: 'note', text: 'agreed: the term ran out' }, { confirms: late1.hash, for: p1.hash })
    view('refrains: a stop dated after until, the other side confirming it, stays stopped in the view: a fact, not a verdict (batch 2 P4)', p1, s.held, AFTER, { stage: 'stopped', from: late1.hash, by: 'both' })
    const p2 = refrain()
    answer(s, mill, p2, { status: 'accepted' })
    const seen = s.say(mill, 'observe', { kind: 'note', text: 'new year' }, {}, { time: '2028-01-01T00:00:00.000Z' })
    s.say(farm, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p2.hash, for: p2.hash, after: [seen.hash] }, { time: '2028-01-01T12:00:00.000Z' })
    view('refrains: a stop with someone else\'s later block in its past stays stopped in the view too (batch 2 P4)', p2, s.held, AFTER, { stage: 'stopped', by: 'from' })
    // a fresh story: the farm's own chain must not already hold the mill's new-year block
    const t = story(), farm3 = t.person('g5farm3'), mill3 = t.person('g5mill3')
    const spray3 = t.say(farm3, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
    const p3 = t.say(farm3, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: farm3.id, to: mill3.id, what: spray3.hash })
    answer(t, mill3, p3, { status: 'accepted' })
    const own = t.say(farm3, 'observe', { kind: 'note', text: 'my own new year' }, {}, { time: '2028-01-01T00:00:00.000Z' })
    const late3 = t.say(farm3, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p3.hash, for: p3.hash, after: [own.hash] }, { time: '2028-01-01T12:00:00.000Z' })
    view('refrains: the signer\'s own later blocks in its past are no witness: still stopped', p3, t.held, AFTER, { stage: 'stopped', from: late3.hash, by: 'from' })
  }

  // F6. Two crossing stops of a one-off deal read both: the deal reads released
  {
    const s = story(), cook = s.person('g6cook'), shop = s.person('g6shop')
    const bread = s.say(cook, 'thing', { kind: 'bread' })
    const p = s.say(cook, 'promise', { terms: { price: M(500), expires: DAY } }, { from: cook.id, to: shop.id, what: bread.hash })
    const yes = answer(s, shop, p, { status: 'accepted' })
    const a = s.say(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: p.hash, for: p.hash, after: [yes.hash] })
    const b = answer(s, shop, p, { status: 'stopped', stop: 'onward' }, { after: [yes.hash] })
    stage('stops: two onward stops of a one-off deal that do not see each other, one by each side, read both: released, whichever hash is lower', p, s.held, { stage: 'stopped', from: [a.hash, b.hash].sort()[0], by: 'both' })
  }

  // F7. The small fixes
  check('roles: a role name with # is refused: circle#role could never name it', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, name: 'Hash', roles: [{ name: 'a#b', powers: ['sign'] }] }, refs: {} }, ['bad_roles'])
  check('roles: a role that lists a power twice is refused', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, name: 'Twice', roles: [{ name: 'boss', powers: ['sign', 'sign'] }] }, refs: {} }, ['bad_roles'])
  door('totals: a total past 2^53 is written as decimal text, exactly (lines the write check takes)', 'terms_total', [{ lines: [{ id: 'a', what: '5'.repeat(64), price: M(9007199254740000) }, { id: 'b', what: '6'.repeat(64), price: M(9007199254740000) }] }, null], { expect: { minor: '18014398509480000', currency: 'GBP' }, exact: true })
  door('totals: terms the write check refuses (a line that names no thing) are junk: no total (technical call: the check first)', 'terms_total', [{ lines: [{ id: 'a', price: M(9007199254740000) }, { id: 'b', price: M(9007199254740000) }] }, null], { expect: null, exact: true })
  door('totals: a per-unit total past 2^53 is written as decimal text', 'terms_total', [{ price: { money: M(5000000000000), per: fb.amount('1', 'g') }, quantity: fb.amount('100000000', 'g') }, null], { expect: { minor: '500000000000000000000', currency: 'GBP' }, exact: true })
  door('totals: one within 2^53 stays a number', 'terms_total', [{ price: M(9007199254740991) }, null], { expect: { minor: 9007199254740991, currency: 'GBP' }, exact: true })
  {
    const s = story(), farm = s.person('g7farm'), mill = s.person('g7mill'), agent = s.person('g7agent', { kind: 'agent' })
    const flour = s.say(mill, 'thing', { kind: 'flour' })
    const big = s.say(mill, 'promise', { terms: { price: { money: M(5000000000000), per: fb.amount('1', 'g') }, quantity: fb.amount('100000000', 'g'), expires: DAY } }, { from: mill.id, to: farm.id, what: flour.hash })
    answer(s, farm, big, { status: 'accepted' })
    stage('totals: a deal\'s total past 2^53 is decimal text in its stage', big, s.held, { stage: 'accepted', total: { minor: '500000000000000000000', currency: 'GBP' } })
    const open = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['promise'], until: LATER } }, {})
    check('grants: a child of a parent with no receiver is refused not_receiver: no one received it to pass on', { type: 'grant', state: { kind: 'authority', scope: { acts: ['promise'], until: LATER } }, refs: { parent: open.hash, to: ID, author: agent.id } }, ['not_receiver'], s.held)
  }
  {
    const s = story(), k = kit(s), F = s.person('g74F'), x = s.person('g74x')
    const before = s.say(x, 'observe', { kind: 'note', text: 'before any circle' })
    const C = k.circle(F)
    door('circle_state: within a block whose causal past does not hold the circle there is no circle yet: null', 'circle_state', [C.hash, s.held, before], { expect: null, exact: true })
    door('circle_state: within the circle\'s own block too (a block\'s past is what came before it)', 'circle_state', [C.hash, s.held, C], { expect: null, exact: true })
    door('members_then: a circle in the audience of a block from before it means no one', 'members_then', [before, C.hash, s.held], { expect: [], exact: true })
  }
}

// ---- 17. Folds read only blocks that pass the write check (Patrick's decision F8, 2026-10-28) ----
{
  const ID = '0'.repeat(64)
  // An ill-formed block counts for nothing, and its author's chain stops there: every later block names it, by prev, as a need.
  {
    const s = story(), pia = s.person('wfPia'), quin = s.person('wfQuin')
    const eggs = s.say(pia, 'thing', { kind: 'eggs' })
    const offer = s.say(pia, 'promise', { terms: { price: M(460), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash })
    const edit = s.raw(pia, 'promise', { terms: { price: M(350), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash, updates: offer.hash, for: offer.hash })
    check('well-formed: a quiet edit (an updates carrying new terms) is refused', edit, ['required'])
    const yes = s.say(quin, 'promise', { status: 'accepted' }, { answers: edit.hash, for: edit.hash, after: [edit.hash] })
    stage('well-formed: an accept of a quiet edit binds nothing: the offer is offered, with no accept', offer, s.held, { stage: 'offered', accept: null })
    stage('well-formed: a fold of the refused edit itself is null: an ill-formed promise is no deal', edit, s.held, null)
    stage('well-formed: nor is the accept that answers it read (it needs the edit)', yes, s.held, null)
    const later = s.say(pia, 'promise', { terms: { price: M(470), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pia.id, to: quin.id, what: eggs.hash })
    stage('well-formed: an offer the author writes after her refused block rests on it by prev: the fold reads it as nothing (null)', later, s.held, null)
  }
  // The input's schemas are the schema store: a closed block naming a schema the input does not hold counts for nothing.
  {
    const s = story(), a = s.person('wfSa'), b = s.person('wfSb')
    const schema = s.say(a, 'thing', { kind: 'schema', target: 'promise', fields: { grade: 'text' } })
    const eggs = s.say(a, 'thing', { kind: 'eggs' })
    const offer = s.say(a, 'promise', { grade: 'A', terms: { price: M(300), expires: DAY } }, { from: a.id, to: b.id, what: eggs.hash, schema: schema.hash })
    stage('well-formed: a promise naming a schema the input holds may carry the field it declares: offered', offer, s.held, { stage: 'offered' })
    stage('well-formed: the same promise with its schema not in the input is refused there (undeclared_ref): null', offer, s.held.filter((x) => x !== schema), null)
  }
  // A child grant wider than its parent counts for nothing: who acts under it acts under no grant.
  {
    const s = story(), p = s.person('wfGp'), c = s.person('wfGc'), x = s.person('wfGx')
    const parent = s.say(p, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['observe'], until: DAY } }, { to: c.id })
    const wide = s.raw(c, 'grant', { kind: 'errands', scope: { acts: ['observe', 'transfer'], until: DAY } }, { to: x.id, parent: parent.hash })
    door('well-formed: a child grant wider than its parent is refused (wider_than_parent)', 'refusals', [wide.type, wide.state, wide.refs, s.held, null], { expect: [{ code: 'wider_than_parent' }] })
    const act = s.say(x, 'observe', { kind: 'note', text: 'done' }, { under: wide.hash }, { after: [wide.hash] })
    door('well-formed: an act under a child grant wider than its parent speaks for no grant', 'under_ok', [act, s.held], { expect: false, exact: true })
  }
  // Twins of the vectors whose worlds held a refused block in a payer's or grantor's chain (each now reads that chain as cut there).
  {
    const s = story(), A = s.person('wfmA'), B = s.person('wfmB'), x = s.say(A, 'thing', { kind: 'x' })
    const ps = [0, 1, 2].map(() => { const p = s.say(A, 'promise', { terms: { price: M(1000), expires: DAY } }, { from: A.id, to: B.id, what: x.hash }); answer(s, B, p, { status: 'accepted' }); return p })
    const fors = ps.map((p) => p.hash)
    const split = s.say(B, 'transfer', { money: M(3000), split: ps.map((p) => ({ for: p.hash, money: M(1000) })) }, { to_owner: A.id, for: fors })
    s.say(A, 'transfer', { status: 'accepted' }, { answers: split.hash, for: fors })
    stage('market: a payment split three ways pays each its own part (a payer whose chain holds no refused block)', ps[1], s.held, { stage: 'underway', paid: { minor: 1000, currency: 'GBP' } })
    const y = s.say(A, 'thing', { kind: 'y' })
    const lined = s.say(A, 'promise', { terms: { lines: [{ id: '1', what: x.hash, price: M(450) }, { id: '2', what: y.hash, price: M(900) }], expires: DAY } }, { from: A.id, to: B.id, what: [x.hash, y.hash].sort() })
    answer(s, B, lined, { status: 'accepted' })
    const other = s.say(A, 'promise', { terms: { price: M(100), expires: DAY } }, { from: A.id, to: B.id, what: x.hash })
    answer(s, B, other, { status: 'accepted' })
    const two = [lined.hash, other.hash].sort()
    const pay2 = s.say(B, 'transfer', { money: M(1450), split: [{ for: lined.hash, line: '1', money: M(450) }, { for: lined.hash, line: '2', money: M(900) }, { for: other.hash, money: M(100) }] }, { to_owner: A.id, for: two })
    s.say(A, 'transfer', { status: 'accepted' }, { answers: pay2.hash, for: two })
    stage('market: every part of a split for one promise counts toward it: two lines\' parts add up (a payer whose chain holds no refused block)', lined, s.held, { stage: 'underway', paid: { minor: 1350, currency: 'GBP' } })
  }
  {
    const s = story(), A = s.person('wfcA'), B = s.person('wfcB'), x = s.say(A, 'thing', { kind: 'x' }), y = s.say(A, 'thing', { kind: 'y' })
    const p = s.raw(A, 'promise', { terms: { lines: [{ id: '1', what: x.hash, price: M(450) }, { id: '2', what: y.hash, price: M(900, 'EUR') }], expires: DAY } }, { from: A.id, to: B.id, what: [x.hash, y.hash] })
    answer(s, B, p, { status: 'accepted' })
    stage('market: a promise in two currencies is refused, and a fold reads it as nothing: null', p, s.held, null)
  }
  {
    const s = story(), a = s.person('wfra'), x = s.person('wfrx'), p = s.person('wfrp')
    s.say(p, 'observe', { kind: 'consent', word: 'stop' }, { subject: a.id })
    const open = s.say(a, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, {})
    door('repair: consent: a person\'s stop about a grantor reaches a sender under an open grant from that grantor (a grantor whose chain holds no refused block)', 'consent', [p.id, x.id, s.held, open.hash], { expect: { word: 'stop' } })
    const blank = s.raw(a, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: LATER } }, { to: '' })
    door('well-formed: a grant whose refs.to is empty text is refused, so the stop reaches no sender under it', 'consent', [p.id, x.id, s.held, blank.hash], { expect: { word: null, block: null }, exact: true })
  }
  // What a fold reads is judged again without what it left out: a block whose check read a block that is out (here the thing an ask
  // names as its side) is judged as a node would judge it without that block, and a chain that holds it stops there.
  {
    const s = story(), a = s.person('wfFa'), b = s.person('wfFb'), d = s.person('wfFd')
    const eggs = s.say(b, 'thing', { kind: 'eggs' })
    const bad = s.raw(d, 'thing', { kind: 'note', pack: 5 })
    check('well-formed: a thing whose pack is a bare number is refused', bad, ['shape'])
    const ask = s.say(b, 'promise', { terms: { price: M(200), expires: DAY } }, { from: a.id, to: bad.hash, what: bad.hash })
    door('well-formed: an ask naming as its side a thing the store holds passes the check against that store', 'refusals', [ask.type, ask.state, ask.refs, s.held, null], { expect: [], exact: true })
    const offer = s.say(b, 'promise', { terms: { price: M(300), expires: DAY } }, { from: b.id, to: a.id, what: eggs.hash })
    void offer // retired in clean round 2: the ask stands without the thing (section 24)
    stage('well-formed: the same offer from a chain without that ask is offered', s.say(a, 'promise', { terms: { price: M(300), expires: DAY } }, { from: a.id, to: b.id, what: eggs.hash }), s.held, { stage: 'offered' })
  }
  // A listed term is part of a well-formed promise: deliver_by, a time a reader may read against its own clock (folds.md, Kept and broken)
  {
    check('well-formed: terms.deliver_by is a time', { type: 'promise', state: { terms: { price: M(300), deliver_by: DAY, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, [])
    check('well-formed: a deliver_by that is not a time is refused', { type: 'promise', state: { terms: { price: M(300), deliver_by: 'next week', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['time'])
    const s = story(), a = s.person('wfDa'), b = s.person('wfDb'), eggs = s.say(a, 'thing', { kind: 'eggs' })
    const offer = s.say(a, 'promise', { terms: { price: M(300), deliver_by: DAY, expires: DAY } }, { from: a.id, to: b.id, what: eggs.hash })
    stage('well-formed: a promise carrying deliver_by is read like any other: offered', offer, s.held, { stage: 'offered' })
  }
  void ID
}

// ---- 18. Market design: the cornerstone repairs, a referee, firm offers, forks, catch weight (Patrick's decisions M1 to M7, 2026-10-28) ----
{
  const ID = '0'.repeat(64)
  // a block that names the same prev (and seq) as `of`: a fork; and one that follows a given block of the same key
  const forkOf = (s, who, of, type, state, refs, after) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held: s.held, at: at(), audience: 'public', after, link: { seq: of.state.seq, prev: of.refs.prev } }))
  const next = (s, who, prev, type, state, refs, after) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held: s.held, at: at(), audience: 'public', after, link: { seq: prev.state.seq + 1, prev: prev.hash } }))

  // M4: an offerer voids an accept by declining it only on an offer that carried expires. An offer with no expires is firm.
  {
    const s = story(), tia = s.person('mdTia'), ugo = s.person('mdUgo'), eggs = s.say(tia, 'thing', { kind: 'eggs' })
    const firm = s.say(tia, 'promise', { terms: { price: M(450) } }, { from: tia.id, to: ugo.id, what: eggs.hash })
    const yes = answer(s, ugo, firm, { status: 'accepted' })
    answer(s, tia, yes, { status: 'declined' }, { for: firm.hash })
    stage('firm: an offer with no expires is firm: the offerer declining an accept of it voids nothing', firm, s.held, { stage: 'accepted', accept: yes.hash })
    const timed = s.say(tia, 'promise', { terms: { price: M(450), expires: DAY } }, { from: tia.id, to: ugo.id, what: eggs.hash })
    const yes2 = answer(s, ugo, timed, { status: 'accepted' })
    answer(s, tia, yes2, { status: 'declined' }, { for: timed.hash })
    stage('firm: on an offer that carried expires, the offerer declining an accept (one that reached her late) voids it', timed, s.held, { stage: 'offered', accept: null })
  }
  // M1: an allocation binds a taker to no more than she asked for, and never below a range's min; a taker may withdraw her request.
  {
    const s = story(), baker = s.person('mdBaker'), bea = s.person('mdBea'), cal = s.person('mdCal'), loaf = s.say(baker, 'thing', { kind: 'loaf' })
    const O = s.say(baker, 'promise', { terms: { price: { money: M(300), per: fb.amount('1', '{loaf}') }, quantity: fb.amount('100', '{loaf}'), expires: DAY } }, { from: baker.id, what: loaf.hash })
    const r = answer(s, bea, O, { status: 'accepted', terms: { quantity: fb.amount('8', '{loaf}') } })
    const over = answer(s, baker, r, { status: 'accepted', terms: { quantity: fb.amount('90', '{loaf}') } }, { for: O.hash })
    stage('asked: an allocation of 90 loaves to a request for 8 binds nothing: no one is bound past what they asked for', O, s.held, { stage: 'offered', takers: [] })
    door('asked: that allocation has no deal of its own', 'promise_stage', [over, s.held, {}], { expect: null, exact: true })
    const fair = answer(s, baker, r, { status: 'accepted', terms: { quantity: fb.amount('5', '{loaf}') } }, { for: O.hash })
    stage('asked: an allocation of 5 to a request for 8 binds 5', O, s.held, { stage: 'accepted', accept: fair.hash, quantity: { value: '5', unit: '{loaf}' } })
    const r2 = answer(s, cal, O, { status: 'accepted', terms: { quantity: fb.amount('4', '{loaf}') } })
    const pull = s.say(cal, 'promise', { status: 'stopped', stop: 'before' }, { updates: r2.hash, for: O.hash })
    const late = answer(s, baker, r2, { status: 'accepted' }, { for: O.hash, after: [r2.hash, pull.hash] })
    stage('asked: a taker withdraws her request: an allocation that saw the withdrawal binds nothing', O, s.held, { stage: 'accepted', takers: [{ allocation: fair.hash }] })
    door('asked: nor has it a deal of its own', 'promise_stage', [late, s.held, {}], { expect: null, exact: true })
  }
  {
    const s = story(), baker = s.person('mdBk2'), cal = s.person('mdCal2'), loaf = s.say(baker, 'thing', { kind: 'loaf' })
    const O = s.say(baker, 'promise', { terms: { price: { money: M(300), per: fb.amount('1', '{loaf}') }, quantity: fb.amount('10', '{loaf}'), expires: DAY } }, { from: baker.id, what: loaf.hash })
    const r = answer(s, cal, O, { status: 'accepted', terms: { quantity: fb.amount('4', '{loaf}') } })
    s.say(cal, 'promise', { status: 'stopped', stop: 'before' }, { updates: r.hash, for: O.hash })
    const blind = answer(s, baker, r, { status: 'accepted' }, { for: O.hash, after: [r.hash] })
    stage('asked: an allocation that had not seen the withdrawal binds: an accept beats a withdrawal it has not seen', O, s.held, { stage: 'accepted', accept: blind.hash })
  }
  {
    const s = story(), mill = s.person('mdMill'), dee = s.person('mdDee'), eve = s.person('mdEve'), flour = s.say(mill, 'thing', { kind: 'flour' })
    const O = s.say(mill, 'promise', { terms: { price: { money: M(90), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('20', 'kg'), max: fb.amount('100', 'kg') }, expires: DAY } }, { from: mill.id, what: flour.hash })
    const r = answer(s, dee, O, { status: 'accepted', terms: { quantity: fb.amount('5', 'kg') } })
    answer(s, mill, r, { status: 'accepted' }, { for: O.hash })
    stage('range: an allocation below the range\'s min binds nothing', O, s.held, { stage: 'offered', takers: [] })
    const r2 = answer(s, eve, O, { status: 'accepted', terms: { quantity: fb.amount('25', 'kg') } })
    const a2 = answer(s, mill, r2, { status: 'accepted' }, { for: O.hash })
    stage('range: one within the range binds', O, s.held, { stage: 'accepted', accept: a2.hash, quantity: { value: '25', unit: 'kg' } })
  }
  // M1: a stopped allocation frees its quantity, for the allocations that see the stop; stopping one allocation does not stop the offer.
  {
    const s = story(), stall = s.person('mdStall'), gus = s.person('mdGus'), hal = s.person('mdHal'), ivy = s.person('mdIvy'), fish = s.say(stall, 'thing', { kind: 'fish' })
    const O = s.say(stall, 'promise', { terms: { price: { money: M(1200), per: fb.amount('1', 'kg') }, quantity: fb.amount('10', 'kg'), expires: DAY } }, { from: stall.id, what: fish.hash })
    const rg = answer(s, gus, O, { status: 'accepted', terms: { quantity: fb.amount('10', 'kg') } })
    const ag = answer(s, stall, rg, { status: 'accepted' }, { for: O.hash })
    const rh = answer(s, hal, O, { status: 'accepted', terms: { quantity: fb.amount('10', 'kg') } })
    const gone = s.say(gus, 'promise', { status: 'stopped', stop: 'onward' }, { answers: ag.hash, for: O.hash })
    const blind = answer(s, stall, rh, { status: 'accepted' }, { for: O.hash, after: [rh.hash] })
    stage('C2: freed: a second allocation past the offer, signed while the taker\'s stop of the first was unseen, still binds the stall: both takers are listed', O, s.held, { stage: 'accepted', takers: [{ allocation: ag.hash }, { allocation: blind.hash }], quantity: { value: '10', unit: 'kg' } })
    const seen = answer(s, stall, rh, { status: 'accepted' }, { for: O.hash, after: [rh.hash, gone.hash] })
    stage('C2: freed: one request is allocated once: a second allocation of it binds nothing more', O, s.held, { stage: 'accepted', takers: [{ allocation: ag.hash }, { allocation: blind.hash }] })
    stage('freed: the stopped allocation\'s own deal reads stopped onward, by the taker', ag, s.held, { stage: 'stopped', stop: 'onward', by: 'to' })
    const ri = answer(s, ivy, O, { status: 'accepted', terms: { quantity: fb.amount('10', 'kg') } })
    const mine = s.say(stall, 'promise', { status: 'stopped', stop: 'onward' }, { updates: blind.hash, for: blind.hash })
    const ai = answer(s, stall, ri, { status: 'accepted' }, { for: O.hash, after: [ri.hash] })
    stage('C2: freed: the offerer\'s own stop of an allocation frees its quantity too, and stops that allocation alone: the offer still binds', O, s.held, { stage: 'accepted', takers: [{ allocation: ag.hash }, { allocation: blind.hash }, { allocation: ai.hash }], quantity: { value: '10', unit: 'kg' } })
    void mine, seen
  }
  // M1: an unanswered transfer is no free option: the giver's withdrawal, and on a transfer that carried expires, the giver's decline.
  {
    const s = story(), sal = s.person('mdSal'), xan = s.person('mdXan'), yul = s.person('mdYul')
    const tray = s.say(sal, 'thing', { kind: 'tray' })
    const tx = s.say(sal, 'transfer', {}, { what: tray.hash, to_owner: xan.id })
    const pull = s.say(sal, 'transfer', { status: 'stopped', stop: 'before' }, { updates: tx.hash })
    check('free option: the giver\'s withdrawal of a transfer is well-formed', { type: pull.type, state: pull.state, refs: pull.refs }, [])
    s.say(xan, 'transfer', { status: 'accepted' }, { answers: tx.hash }, { after: [pull.hash] })
    door('free option: a receiver who accepts a transfer after seeing the giver\'s withdrawal owns nothing', 'ownership', [tray, s.held], { expect: { owner: sal.id, transfers: [] }, exact: false })
    const ty = s.say(sal, 'transfer', {}, { what: tray.hash, to_owner: yul.id })
    s.say(yul, 'transfer', { status: 'accepted' }, { answers: ty.hash })
    door('free option: the giver then sells it to another, who owns it', 'ownership', [tray, s.held], { expect: { owner: yul.id, transfers: [ty.hash] }, exact: false })
  }
  {
    const s = story(), sal = s.person('mdSal2'), xan = s.person('mdXan2')
    const tray = s.say(sal, 'thing', { kind: 'tray' })
    const tx = s.say(sal, 'transfer', {}, { what: tray.hash, to_owner: xan.id })
    s.say(sal, 'transfer', { status: 'stopped', stop: 'before' }, { updates: tx.hash })
    s.say(xan, 'transfer', { status: 'accepted' }, { answers: tx.hash }, { after: [tx.hash] })
    door('free option: an accept that had not seen the withdrawal still takes the transfer: an accept beats a withdrawal it has not seen', 'ownership', [tray, s.held], { expect: { owner: xan.id, transfers: [tx.hash] }, exact: false })
  }
  {
    const s = story(), sal = s.person('mdSal3'), xan = s.person('mdXan3')
    const t1 = s.say(sal, 'thing', { kind: 'tray' }), t2 = s.say(sal, 'thing', { kind: 'tray' })
    const timed = s.say(sal, 'transfer', { expires: DAY }, { what: t1.hash, to_owner: xan.id })
    const late = s.say(xan, 'transfer', { status: 'accepted' }, { answers: timed.hash })
    s.say(sal, 'transfer', { status: 'declined' }, { answers: late.hash })
    door('free option: on a transfer that carried expires, the giver declining a late accept keeps it with the giver', 'ownership', [t1, s.held], { expect: { owner: sal.id, transfers: [] }, exact: false })
    const firm = s.say(sal, 'transfer', {}, { what: t2.hash, to_owner: xan.id })
    const yes = s.say(xan, 'transfer', { status: 'accepted' }, { answers: firm.hash })
    s.say(sal, 'transfer', { status: 'declined' }, { answers: yes.hash })
    door('free option: on a transfer with no expires, the giver\'s decline voids nothing: the receiver owns it', 'ownership', [t2, s.held], { expect: { owner: xan.id, transfers: [firm.hash] }, exact: false })
    check('free option: a transfer may carry expires (a time)', { type: 'transfer', state: { expires: DAY }, refs: { what: ID, to_owner: ID } }, [])
    check('free option: a transfer\'s expires that is not a time is refused', { type: 'transfer', state: { expires: 'soon' }, refs: { what: ID, to_owner: ID } }, ['time'])
  }
  {
    // the same rule in a deal: a delivery the giver withdrew, accepted after the withdrawal, settles nothing
    const s = story(), far = s.person('mdFar'), bud = s.person('mdBud'), eggs = s.say(far, 'thing', { kind: 'eggs' })
    const p = s.say(far, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: far.id, to: bud.id, what: eggs.hash })
    answer(s, bud, p, { status: 'accepted' })
    const tray = s.say(far, 'thing', { kind: 'eggs', pack: fb.amount('1', '{tray}') })
    const give = s.say(far, 'transfer', {}, { what: tray.hash, to_owner: bud.id, for: p.hash })
    const pull = s.say(far, 'transfer', { status: 'stopped', stop: 'before' }, { updates: give.hash, for: p.hash })
    s.say(bud, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash }, { after: [pull.hash] })
    stage('free option: in a deal, a delivery accepted after the giver withdrew it settles nothing', p, s.held, { stage: 'accepted' })
  }
  // M1: an answer that carries a status names no term but the quantity it chooses
  {
    check('accept terms: an accept carrying a price is refused', { type: 'promise', state: { status: 'accepted', terms: { price: M(100) } }, refs: { answers: ID, for: ID } }, ['undeclared_field'])
    check('accept terms: an accept naming the quantity it chooses is well-formed', { type: 'promise', state: { status: 'accepted', terms: { quantity: fb.amount('2', 'kg') } }, refs: { answers: ID, for: ID } }, [])
    check('accept terms: a stop carrying terms is refused', { type: 'promise', state: { status: 'stopped', stop: 'onward', terms: { until: DAY } }, refs: { answers: ID, for: ID } }, ['undeclared_field'])
  }
  // M3: a referee named in the deal's schema has the last word on a delivery or a breach; with none named, a side's defeats is a dispute (batch 2 P4).
  {
    const s = story(), far = s.person('mdRf'), buy = s.person('mdRb'), ref = s.person('mdRr')
    const schema = s.say(far, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [ref.id] } })
    const eggs = s.say(far, 'thing', { kind: 'eggs' })
    const deal = (refd) => {
      const p = s.say(far, 'promise', { terms: { quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: far.id, to: buy.id, what: eggs.hash, ...(refd ? { schema: schema.hash } : {}) })
      answer(s, buy, p, { status: 'accepted' })
      const tray = s.say(far, 'thing', { kind: 'eggs', pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
      const give = s.say(far, 'transfer', {}, { what: tray.hash, to_owner: buy.id, for: p.hash })
      const got = s.say(buy, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      return { p, give, got }
    }
    const a = deal(true)
    const no = s.say(buy, 'observe', { kind: 'dispute' }, { defeats: a.give.hash, for: a.p.hash })
    stage('referee: the receiver disputes a delivery it accepted while the referee says nothing: it still settles, the dispute shown (batch 2 P4)', a.p, s.held, { stage: 'done', disputed: [{ hash: no.hash, of: a.give.hash, by: 'to' }] })
    const ruled = s.say(ref, 'observe', { kind: 'ruling' }, { confirms: a.give.hash }, { after: [no.hash] })
    void ruled
    const b = deal(true)
    const out = s.say(ref, 'observe', { kind: 'ruling' }, { defeats: b.give.hash })
    stage('referee: a delivery the referee defeats counts for nothing, though the receiver accepted it', b.p, s.held, { stage: 'accepted' })
    s.say(ref, 'observe', { kind: 'ruling' }, { confirms: b.give.hash }, { after: [out.hash] })
    const c = deal(false)
    s.say(buy, 'observe', { kind: 'dispute' }, { defeats: c.give.hash, for: c.p.hash })
    s.say(ref, 'observe', { kind: 'ruling' }, { confirms: c.give.hash })
    stage('referee: with no referee named in the deal, the receiver\'s defeats is a dispute: the delivery still settles (batch 2 P4)', c.p, s.held, { stage: 'done' })
  }
  {
    // a refrain with a referee: a side's defeats is a dispute; only the referee breaches it (batch 2 P4)
    const s = story(), far = s.person('mdQf'), buy = s.person('mdQb'), ref = s.person('mdQr')
    const schema = s.say(buy, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [ref.id] } })
    const land = s.say(far, 'thing', { kind: 'field' })
    const make = (refd) => {
      const p = s.say(far, 'promise', { terms: { refrain: true, until: LATER, expires: DAY } }, { from: far.id, to: buy.id, what: land.hash, ...(refd ? { schema: schema.hash } : {}) })
      answer(s, buy, p, { status: 'accepted' })
      const claim = s.say(buy, 'observe', { kind: 'breach' }, { defeats: p.hash, for: p.hash })
      return { p, claim }
    }
    const a = make(true)
    stage('referee: a refrain the side it was made to says was broken is only disputed while the referee says nothing (batch 2 P4)', a.p, s.held, { stage: 'accepted', disputed: [{ hash: a.claim.hash, of: a.p.hash, by: 'to' }] })
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: a.claim.hash })
    stage('referee: the referee defeats that claim: overruled, the refrain is not breached', a.p, s.held, { stage: 'accepted' })
    const b = make(false)
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: b.claim.hash })
    stage('referee: with no referee named, the side\'s claim is a dispute, and someone else\'s defeat of it changes nothing (batch 2 P4)', b.p, s.held, { stage: 'accepted', disputed: [{ hash: b.claim.hash, of: b.p.hash, by: 'to' }] })
  }
  // M5: a fork voids what the forker claims, never what they owe.
  {
    // twins of the 1.6 vectors: walt accepts the eggs, then signs a decline naming the same prev; and accepts the milk after the fork
    const s = story(), ann = s.person('mdVera'), bob = s.person('mdWalt')
    const eggs = s.say(ann, 'thing', { kind: 'eggs' }), milk = s.say(ann, 'thing', { kind: 'milk' })
    const offer = s.say(ann, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const offer2 = s.say(ann, 'promise', { terms: { price: M(120), quantity: fb.amount('1', 'L'), expires: DAY } }, { from: ann.id, to: bob.id, what: milk.hash })
    const yes = answer(s, bob, offer, { status: 'accepted' })
    forkOf(s, bob, yes, 'promise', { status: 'declined' }, { answers: offer.hash, for: offer.hash }, [offer.hash])
    const later = next(s, bob, yes, 'promise', { status: 'accepted' }, { answers: offer2.hash, for: offer2.hash }, [offer2.hash])
    stage('fork: two blocks of one key naming one prev: the accept still binds its signer, and the forked decline frees no one', offer, s.held, { stage: 'accepted', accept: yes.hash })
    stage('fork: an accept the forker signs after the fork binds them too', offer2, s.held, { stage: 'accepted', accept: later.hash })
  }
  {
    // the forker received the eggs, then forks with a stop: the stop frees no one, and the debt stands
    const s = story(), ann = s.person('mdFa'), bob = s.person('mdFb'), eggs = s.say(ann, 'thing', { kind: 'eggs' })
    const p = s.say(ann, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    answer(s, bob, p, { status: 'accepted' })
    const tray = s.say(ann, 'thing', { kind: 'eggs', pack: fb.amount('1', '{tray}') })
    const give = s.say(ann, 'transfer', {}, { what: tray.hash, to_owner: bob.id, for: p.hash })
    const got = s.say(bob, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
    forkOf(s, bob, got, 'promise', { status: 'stopped', stop: 'onward' }, { answers: p.hash, for: p.hash }, [p.hash])
    const s2 = story(), c = s2.person('mdFc'), d = s2.person('mdFd'), x = s2.say(c, 'thing', { kind: 'x' })
    const q = s2.say(c, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: c.id, to: d.id, what: x.hash })
    answer(s2, d, q, { status: 'accepted' })
    const box = s2.say(c, 'thing', { kind: 'x', pack: fb.amount('1', '{tray}') })
    const giv = s2.say(c, 'transfer', {}, { what: box.hash, to_owner: d.id, for: q.hash })
    const ok = s2.say(d, 'transfer', { status: 'accepted' }, { answers: giv.hash, for: q.hash })
    const twin = forkOf(s2, d, ok, 'observe', { kind: 'note', text: 'a twin' }, {})
    next(s2, d, twin, 'observe', { kind: 'dispute' }, { defeats: giv.hash, for: q.hash })
  }
  {
    // two accepts of one key that do not see each other: the same terms bind; different terms do not
    const s = story(), ann = s.person('mdGa'), bob = s.person('mdGb'), flour = s.say(ann, 'thing', { kind: 'flour' })
    const p = s.say(ann, 'promise', { terms: { price: { money: M(90), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('1', 'kg'), max: fb.amount('10', 'kg') }, expires: DAY } }, { from: ann.id, to: bob.id, what: flour.hash })
    const y1 = answer(s, bob, p, { status: 'accepted', terms: { quantity: fb.amount('5', 'kg') } })
    const y2 = forkOf(s, bob, y1, 'promise', { status: 'accepted', terms: { quantity: fb.amount('5.0', 'kg') } }, { answers: p.hash, for: p.hash }, [p.hash])
    const forks = [y1.hash, y2.hash].sort()
    stage('fork: two accepts that do not see each other and say the same thing bind: the lowest hash names the accept, and both are listed', p, s.held, { stage: 'accepted', accept: forks[0], forks })
    const s2 = story(), c = s2.person('mdGc'), d = s2.person('mdGd'), f2 = s2.say(c, 'thing', { kind: 'flour' })
    const q = s2.say(c, 'promise', { terms: { price: { money: M(90), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('1', 'kg'), max: fb.amount('10', 'kg') }, expires: DAY } }, { from: c.id, to: d.id, what: f2.hash })
    const z1 = answer(s2, d, q, { status: 'accepted', terms: { quantity: fb.amount('5', 'kg') } })
    const z2 = forkOf(s2, d, z1, 'promise', { status: 'accepted', terms: { quantity: fb.amount('9', 'kg') } }, { answers: q.hash, for: q.hash }, [q.hash])
    stage('fork: two that choose different quantities bind nothing: the terms are not one', q, s2.held, { stage: 'offered', accept: null, forks: [z1.hash, z2.hash].sort() })
  }
  // M7: catch weight. The fold prices a per-unit deal on what the receiver accepted, inside a band the deal states.
  {
    const s = story(), boat = s.person('mdBoat'), cook = s.person('mdCook'), cod = s.say(boat, 'thing', { kind: 'cod' })
    const sale = (band, weighed) => {
      const p = s.say(boat, 'promise', { terms: { price: { money: M(1200), per: fb.amount('1', 'kg') }, quantity: fb.amount('10', 'kg'), ...(band ? { band } : {}), expires: DAY } }, { from: boat.id, to: cook.id, what: cod.hash })
      answer(s, cook, p, { status: 'accepted' })
      const give = s.say(boat, 'transfer', { amount: fb.amount(weighed, 'kg') }, { what: cod.hash, to_owner: cook.id, for: p.hash })
      s.say(cook, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      return p
    }
    const pay = (p, minor) => { const m = s.say(cook, 'transfer', { money: M(minor) }, { to_owner: boat.id, for: p.hash }); s.say(boat, 'transfer', { status: 'accepted' }, { answers: m.hash, for: p.hash }) }
    const a = sale('0.05', '9.8')
    stage('catch weight: 9.8 kg inside a 5% band is priced on what was accepted: the total is 117.60', a, s.held, { stage: 'underway', total: { minor: 11760, currency: 'GBP' } })
    pay(a, 11760)
    stage('catch weight: and paid that, it is done', a, s.held, { stage: 'done', paid: { minor: 11760, currency: 'GBP' } })
    const b = sale(null, '9.8')
    pay(b, 11760)
    stage('catch weight: with no band, 9.8 kg of a 10 kg deal never covers it', b, s.held, { stage: 'underway', total: { minor: 12000, currency: 'GBP' } })
    const c = sale('0.05', '9')
    stage('catch weight: 9 kg is below the band: the quantity chosen is priced, and the line is not covered', c, s.held, { stage: 'underway', total: { minor: 12000, currency: 'GBP' } })
    const d = sale('0.05', '10.8')
    pay(d, 12000)
    stage('catch weight: 10.8 kg is above the band: it covers the line, priced at the quantity chosen', d, s.held, { stage: 'done', total: { minor: 12000, currency: 'GBP' } })
    check('catch weight: terms.band is a decimal from 0 to 1', { type: 'promise', state: { terms: { price: { money: M(1200), per: fb.amount('1', 'kg') }, quantity: fb.amount('10', 'kg'), band: '0.05', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, [])
    check('catch weight: a band above 1 is refused', { type: 'promise', state: { terms: { price: { money: M(1200), per: fb.amount('1', 'kg') }, quantity: fb.amount('10', 'kg'), band: '1.5', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
    check('catch weight: a band that is not decimal text is refused', { type: 'promise', state: { terms: { price: { money: M(1200), per: fb.amount('1', 'kg') }, quantity: fb.amount('10', 'kg'), band: 5, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
  }
  // a transfer may carry expires: the base fields name it
  door('base_fields: transfer (a transfer may carry expires: decision M1; an answer to a payment may say what it covers: batch 2 P10; a payment may name the occurrence it pays: decision E4)', 'base_fields', ['transfer'], { expect: ['money', 'marks', 'amount', 'count', 'split', 'expires', 'covers', 'occurrence'], exact: true })
}

// ---- 19. Security: the cornerstone breakers A to E (Patrick's decisions P1 A to E, 2026-10-28; security20/SYNTHESIS.md) ----
// Each fix has a negative vector built from the security repro that broke it (scratchpad/security20/<lens>/<repro>).
{
  const ID = '0'.repeat(64)
  // a block signed by hand at a given place in a key's chain (as a thief with an old key would make it), past the writer's own refusals
  const hand = (s, who, keyName, type, state, refs, seq) => {
    const st = { at: at(), audience: 'public', seq, ...state }
    const b = fb.create(type, st, { author: who.id, ...refs })
    return { ...b, signature: fb.sign(b, keyOf(keyName).private_key) }
  }
  const withRecovery = (s, name, kind = 'person') => {
    const rec = keyOf(name + '_recovery')
    const g = s.keep(genesis(keyOf(name), { kind, at: at(), recoveryKey: rec.public_key_sign, reach: 'P30D' }))
    return { name, id: g.hash, g, rec }
  }
  const rotate = (s, who, keyName, newName, last, countedTo, extra = {}) => s.keep(fb.identity.keyGrant(who.id, keyOf(newName).public_key_sign,
    { private_key: keyOf(keyName).private_key, last, broughtIn: who.id }, { replaces: keyOf(keyName).public_key_sign, countedTo: countedTo.hash || countedTo, at: at(), ...extra }))
  const onKey = (s, who, keyName, prev, seq, type, state, refs = {}) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(keyName), held: s.held, at: at(), audience: 'public', link: { seq, prev: prev.hash } }))
  const keysOf = (id, held) => call('key_timeline', id, held, null).map((k) => k.key).sort()

  // A. An operator grant counts only after the machine signs an accept of it (keys/e4, spec-gaps/t9, agents/t11, threat-model/c3).
  {
    const s = story(), bot = s.person('sAbot', { kind: 'agent' }), stranger = s.person('sAstranger'), owner = s.person('sAowner')
    const first = s.say(bot, 'observe', { kind: 'note', text: 'the agent speaks' })
    const og = s.say(stranger, 'grant', { kind: 'operator' }, { to: bot.id })
    check('A: an operator grant a stranger signs naming someone else\'s agent is well-formed (it answers for no one until the agent accepts)', { type: og.type, state: og.state, refs: og.refs }, [])
    const theft = s.say(stranger, 'grant', { kind: 'key', public_key_sign: keyOf('sAthief').public_key_sign, replaces: keyOf('sAbot').public_key_sign, counted_to: first.hash }, { subject: bot.id })
    door('A: a stranger\'s unaccepted operator grant rotates nothing: its rotation of the agent\'s key is valid and brings in no key (keys/e4; clean round 1: the identity fold judges operators)', 'valid', [theft, s.held.filter((b) => b !== theft), null], { expect: [], exact: true })
    door('A: so the agent\'s keys are its own: the stranger\'s key is not among them', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('sAbot').public_key_sign }], exact: false })
    const forged = s.keep(hand(s, bot, 'sAthief', 'observe', { kind: 'note', text: 'the stranger speaks as the agent' }, { prev: theft.hash }, 1))
    door('A: and a block the stranger\'s key signs as the agent counts for nothing: no word of the agent\'s (clean round 1: valid on what it rests on)', 'signed_by_author', [forged, s.held, null], { expect: false, exact: true })
    // the owner's grant, accepted by the agent: the operator now rotates, but only from a block that has the accept in its causal past
    const mine = s.say(owner, 'grant', { kind: 'operator' }, { to: bot.id })
    const early = s.say(owner, 'grant', { kind: 'key', public_key_sign: keyOf('sAearly').public_key_sign, replaces: keyOf('sAbot').public_key_sign, counted_to: first.hash }, { subject: bot.id })
    door('A: a rotation by the named operator before the agent accepts brings in no key (clean round 1: valid, judged by the identity fold)', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('sAbot').public_key_sign }] })
    s.held.splice(s.held.indexOf(early), 1)
    const yes = s.say(bot, 'grant', { status: 'accepted' }, { answers: mine.hash })
    check('A: the agent\'s accept of its operator grant is a grant answer with status accepted', { type: yes.type, state: yes.state, refs: yes.refs }, [])
    const rot = s.say(owner, 'grant', { kind: 'key', public_key_sign: keyOf('sAnew').public_key_sign, replaces: keyOf('sAbot').public_key_sign, counted_to: yes.hash }, { subject: bot.id, after: [yes.hash] })
    door('A: once the agent accepts, its operator\'s rotation (that has the accept in its causal past) passes valid', 'valid', [rot, s.held.filter((b) => b !== rot), null], { expect: [], exact: true })
    door('A: and the new key is the agent\'s', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('sAbot').public_key_sign }, { key: keyOf('sAnew').public_key_sign, signer: 'operator' }] })
  }
  {
    // the twins of the 1.6 identity stories of an agent and its operator, now that the agent accepts the operator grant
    const s = story(), lou = s.person('sAlou'), bot = s.person('sAlou_agent', { kind: 'agent' })
    const og = s.say(lou, 'grant', { kind: 'operator' }, { to: bot.id })
    s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash })
    const shop = s.say(lou, 'grant', { kind: 'shop', scope: { acts: ['observe.note', 'promise'], limit: M(5000), every: 'P7D', until: LATER } }, { to: bot.id })
    const act = s.say(bot, 'observe', { kind: 'note', text: 'ordered flour' }, { under: shop.hash })
    door('A: an agent writes under its principal\'s grant: it speaks for her (the agent accepted its operator grant)', 'under_ok', [act, s.held], { expect: true, exact: true })
    const outside = s.say(bot, 'observe', { kind: 'review', text: 'five stars' }, { under: shop.hash })
    door('A: an act the grant does not cover speaks for no one', 'under_ok', [outside, s.held], { expect: false, exact: true })
    const rot = s.say(lou, 'grant', { kind: 'key', public_key_sign: keyOf('sAlou_agent_new').public_key_sign, replaces: keyOf('sAlou_agent').public_key_sign, counted_to: act.hash }, { subject: bot.id })
    door('A: the operator rotates its agent\'s key, counting up to its last good block', 'valid', [rot, s.held.filter((b) => b !== rot), null], { expect: [], exact: true })
    const stale = hand(s, bot, 'sAlou_agent', 'observe', { kind: 'note', text: 'late' }, { prev: outside.hash }, outside.state.seq + 1)
    door('C1: A: the old key writes after counted_to, unseen by the operator\'s rotation: still the agent\'s word (only the recovery key reaches back)', 'signed_by_author', [stale, s.held, null], { expect: true, exact: true })
    const clean = onKey(s, bot, 'sAlou_agent_new', rot, 1, 'observe', { kind: 'note', text: 'clean' })
    door('A: the new key writes: it stands', 'valid', [clean, s.held.filter((b) => b !== clean), null], { expect: [], exact: true })
    door('A: after the operator\'s rotation the agent\'s keys are its old key and the new one the operator brought in', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('sAlou_agent').public_key_sign }, { key: keyOf('sAlou_agent_new').public_key_sign, signer: 'operator' }] })
    // the fence: a limit observe sealed to the agent; the grant check never reads it, and the principal's node checks it
    const opal = s.person('sAopal'), ob = s.person('sAopal_agent', { kind: 'agent' })
    const og2 = s.say(opal, 'grant', { kind: 'operator' }, { to: ob.id })
    s.say(ob, 'grant', { status: 'accepted' }, { answers: og2.hash })
    const visible = s.say(opal, 'grant', { kind: 'shop', scope: { acts: ['observe.note'], until: LATER } }, { to: ob.id })
    const oact = s.say(ob, 'observe', { kind: 'note', text: 'ordered flour' }, { under: visible.hash })
    const fence = fb.grant.limitFence(visible.hash, ob.id, { limit: M(5000), every: 'P7D' })
    const limit = s.say(opal, fence.type, { ...fence.state, nonce: sha('sAopal fence nonce').slice(0, 32) }, fence.refs, { audience: fence.audience })
    door('A: the limit is the principal\'s fence: with the limit observe held, the act speaks for her', 'under_ok', [oact, s.held], { expect: true, exact: true })
    door('A: and without it, the same: the grant check never reads the limit', 'under_ok', [oact, s.held.filter((b) => b !== limit)], { expect: true, exact: true })
    for (const [spent, minor, currency, ok] of [[2000, 3000, 'GBP', true], [2000, 3001, 'GBP', false], [0, 1, 'EUR', false]]) {
      door(`A: the principal's node checks the limit: ${spent} spent, ${minor} ${currency} more is ${ok ? 'within' : 'not within'}`, 'within_limit', [limit, M(minor, currency), spent], { expect: ok, exact: true })
    }
  }
  {
    // the consent side (threat-model/c3, market-abuse/m5, agents/t15): a stranger's unaccepted operator grant puts the stranger on no one's side
    const s = story(), v = s.person('sAv'), sup = s.person('sAsup'), mal = s.person('sAmal'), shop = s.person('sAshop'), app = s.person('sAapp', { kind: 'agent' })
    const ask = s.say(sup, 'promise', { what: 'bread', terms: { expires: DAY } }, { from: sup.id, to: v.id })
    s.say(mal, 'grant', { kind: 'operator' }, { to: sup.id })
    const stop = s.say(mal, 'observe', { kind: 'consent', word: 'stop' }, { from: v.id })
    door('A: a STOP recorded by one whose operator grant the sender never accepted binds the sender in nothing (threat-model/c3)', 'consent', [v.id, sup.id, s.held], { expect: { word: null, block: null } })
    stage('A: so the sender\'s offer is not declined in advance', ask, s.held, { stage: 'offered' })
    void stop
    // the operator twins of the 1.6 consent vectors: the app accepted its shop's operator grant, so a STOP naming the shop reaches it
    const og = s.say(shop, 'grant', { kind: 'operator' }, { to: app.id })
    s.say(app, 'grant', { status: 'accepted' }, { answers: og.hash })
    const yes = s.say(v, 'observe', { kind: 'consent', word: 'yes' }, { subject: app.id })
    const no = s.say(v, 'observe', { kind: 'consent', word: 'stop' }, { subject: shop.id }, { after: [yes.hash] })
    door('A: consent: a STOP naming the operator covers its agents, later than the yes (the agent accepted the operator grant)', 'consent', [v.id, app.id, s.held], { expect: { word: 'stop', block: no.hash } })
    const contact = s.say(mal, 'actor', { kind: 'contact', marks: [{ scheme: 'phone', value: '+447700900124' }] })
    const appStop = s.say(shop, 'observe', { kind: 'consent', word: 'stop' }, { from: contact.hash, subject: shop.id, derives_from: sha('stop, in her words: security A') })
    door('A: consent: the asker may record a STOP for itself: it covers its agents (the agent accepted the operator grant)', 'consent', [contact.hash, app.id, s.held], { expect: { word: 'stop', block: appStop.hash } })
    s.say(app, 'observe', { kind: 'consent', word: 'yes' }, { from: contact.hash, subject: app.id, derives_from: sha('a reply the app read: security A') }, { after: [appStop.hash] })
    door('A: consent: the asker\'s side never lifts a STOP (the agent accepted the operator grant)', 'consent', [contact.hash, app.id, s.held], { expect: { word: 'stop', block: appStop.hash } })
  }

  // B. A rotated key counts only on its counted line: counted_to and its prev-ancestry. A sibling off it is void and forms no pair; forks
  //    are marked by (author, key); a block whose key does not speak counts in no fold (keys/e1, e1b, e8; forks/f8, f9; time/r10).
  {
    const s = story(), al = s.person('sBal'), bob = s.person('sBbob')
    const early = s.say(al, 'observe', { kind: 'note', text: 'early' })
    const car = s.say(al, 'thing', { kind: 'car' })
    const sale = s.say(al, 'transfer', {}, { what: car.hash, to_owner: bob.id })
    s.say(bob, 'transfer', { status: 'accepted' }, { answers: sale.hash })
    const last = s.say(al, 'observe', { kind: 'note', text: 'last good' })
    rotate(s, al, 'sBal', 'sBal2', last, last)
    const sib = hand(s, al, 'sBal', 'observe', { kind: 'note', text: 'a stale key\'s sibling of an old block' }, { prev: early.refs.prev }, early.state.seq)
    door('C1: B: a rotated-out key signs a sibling of an old block, unseen by its own rotation: her word, for her own rotation voids nothing she signed (keys/e1)', 'signed_by_author', [sib, s.held, null], { expect: true, exact: true })
    const held = [...s.held, sib]
    door('C1: B: the sibling and the old block it shares a prev with are a pair: proof of her lie', 'fork_pairs', [held], { expect: [[early.hash, sib.hash].sort()], exact: true })
    door('B: so the sale before the rotation stands: the buyer still owns the car (keys/e1b)', 'ownership', [car, held], { expect: { owner: bob.id, transfers: [sale.hash], conflict: null } })
    const device = hand(s, al, 'sBal', 'grant', { kind: 'key', public_key_sign: keyOf('sBthiefdevice').public_key_sign }, { subject: al.id, prev: early.refs.prev }, early.state.seq)
    door('C1: B: a stale key\'s key grant unseen by her own rotation is her word too: only the recovery key reaches back (keys/e8)', 'signed_by_author', [device, s.held, null], { expect: true, exact: true })
    door('C1: B: so the device key it brings in is a key of hers until the recovery key settles it', 'key_timeline', [al.id, [...s.held, device], null], { expect: [{ key: keyOf('sBal').public_key_sign }, { key: keyOf('sBthiefdevice').public_key_sign }, { key: keyOf('sBal2').public_key_sign }] })
  }
  {
    // forks/f9: a thief signs a sibling of the owner's next block first; the owner's rotation names the same prev. The sibling is off the line.
    const s = story(), ow = s.person('sBow'), yan = s.person('sByan')
    const tray = s.say(ow, 'thing', { kind: 'tray' })
    const thief = s.keep(hand(s, ow, 'sBow', 'observe', { kind: 'note', text: 'the thief\'s block, held first' }, { prev: tray.hash }, tray.state.seq + 1))
    const rot = rotate(s, ow, 'sBow', 'sBow2', tray, tray)
    assert.equal(rot.refs.prev, thief.refs.prev)
    door('C1: B: a rotation that names the same prev as a thief\'s block is a pair with it, kept and listed as proof: her own rotation voids nothing (forks/f9)', 'accept', [[rot], s.held.filter((b) => b !== rot), null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [[thief.hash, rot.hash].sort()] } })
    const t2 = onKey(s, ow, 'sBow2', rot, 1, 'thing', { kind: 'tray' })
    const sold = s.keep(fb.write('transfer', {}, { what: t2.hash, to_owner: yan.id }, { author: ow.id, key: keyOf('sBow2'), held: s.held, at: at(), audience: 'public', link: { seq: 2, prev: t2.hash } }))
    s.say(yan, 'transfer', { status: 'accepted' }, { answers: sold.hash })
    door('B: the new key\'s chain counts: its sale moves the new tray (forks are marked by author and key)', 'ownership', [t2, s.held], { expect: { owner: yan.id, transfers: [sold.hash], conflict: null } })
    door('C1: B: and the pair is listed', 'fork_pairs', [s.held], { expect: [[thief.hash, rot.hash].sort()], exact: true })
  }
  {
    // a fork of one key leaves the author's other keys alone: a block of a second device key counts though the first key forked
    const s = story(), pa = s.person('sBpa'), qi = s.person('sBqi')
    const dev = s.keep(fb.identity.keyGrant(pa.id, keyOf('sBpa_phone').public_key_sign, { private_key: keyOf('sBpa').private_key, last: null, broughtIn: pa.id }, { at: at() }))
    const n1 = s.say(pa, 'observe', { kind: 'note', text: 'one' })
    const n1b = s.keep(hand(s, pa, 'sBpa', 'observe', { kind: 'note', text: 'one, again' }, { prev: n1.refs.prev }, n1.state.seq))
    const crate = onKey(s, pa, 'sBpa_phone', dev, 1, 'thing', { kind: 'crate' })
    const gift = s.keep(fb.write('transfer', {}, { what: crate.hash, to_owner: qi.id }, { author: pa.id, key: keyOf('sBpa_phone'), held: s.held, at: at(), audience: 'public', link: { seq: 2, prev: crate.hash } }))
    s.say(qi, 'transfer', { status: 'accepted' }, { answers: gift.hash })
    door('B: a pair of one key is a pair', 'fork_pairs', [s.held], { expect: [[n1.hash, n1b.hash].sort()], exact: true })
    door('B: and the author\'s other key still counts: its transfer moves the crate', 'ownership', [crate, s.held], { expect: { owner: qi.id, transfers: [gift.hash], conflict: null } })
  }
  {
    // the retired-key gap, settled: a block of a rotated key past its counted line counts in no fold, in the core as in the oracle
    const s = story(), xo = s.person('sBxo'), zed = s.person('sBzed')
    const box = s.say(xo, 'thing', { kind: 'box' })
    const give = s.say(xo, 'transfer', {}, { what: box.hash, to_owner: zed.id })
    s.say(zed, 'transfer', { status: 'accepted' }, { answers: give.hash })
    rotate(s, xo, 'sBxo', 'sBxo2', give, box)
    door('C1: B: a rotation counted to a block before a transfer of the old key voids nothing she signed: the receiver keeps the box', 'ownership', [box, s.held], { expect: { owner: zed.id, transfers: [give.hash], conflict: null } })
  }
  {
    // keys/e2: two rotations of one key that cross cannot be told apart without a clock: both new keys freeze, and the old key counts only on
    // the part of their lines both share. The recovery key settles it (below).
    const s = story(), me = withRecovery(s, 'sBme'), buyer = s.person('sBbuyer')
    const b1 = s.say(me, 'thing', { kind: 'cart' })
    const b2 = s.say(me, 'transfer', {}, { what: b1.hash, to_owner: buyer.id })
    s.say(buyer, 'transfer', { status: 'accepted' }, { answers: b2.hash })
    door('B: before any rotation, the sale stands', 'ownership', [b1, s.held], { expect: { owner: buyer.id, transfers: [b2.hash], conflict: null } })
    const mine = rotate(s, me, 'sBme', 'sBmine', b2, b2)
    s.keep(hand(s, me, 'sBme', 'grant', { kind: 'key', public_key_sign: keyOf('sBtheirs').public_key_sign, replaces: keyOf('sBme').public_key_sign, counted_to: b1.hash }, { subject: me.id, prev: b1.hash }, 2))
    door('B: two rotations of one key that cross freeze both new keys (keys/e2: no pure rule can tell the thief from the owner)', 'key_timeline', [me.id, s.held, null], { expect: [{ key: keyOf('sBme').public_key_sign, frozen: false }, { key: keyOf('sBtheirs').public_key_sign, frozen: true }, { key: keyOf('sBmine').public_key_sign, frozen: true }] })
    door('B: and no rotation un-counts what another counted: the old key speaks on either line, the sale stands (keys/e2; clean round 1)', 'ownership', [b1, s.held], { expect: { owner: buyer.id, transfers: [b2.hash], conflict: null } })
    const late = hand(s, me, 'sBmine', 'observe', { kind: 'note', text: 'the owner\'s new key' }, { prev: mine.hash }, 1)
    door('B: a frozen key speaks for no one (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [late, s.held, null], { expect: false, exact: true })
    // the recovery key settles it: its line decides, and the key its rotation saw speaks
    const settle = s.keep(fb.identity.keyGrant(me.id, keyOf('sBsettled').public_key_sign, { private_key: me.rec.private_key, recoveryKey: me.rec.public_key_sign, last: null }, { replaces: keyOf('sBme').public_key_sign, countedTo: mine.hash, at: at(), after: [mine.hash] }))
    const ok = hand(s, me, 'sBsettled', 'observe', { kind: 'note', text: 'settled' }, { prev: settle.hash }, 1)
    door('B: a recovery rotation counted to the owner\'s rotation settles it: the recovery key\'s new key speaks', 'valid', [ok, s.held, null], { expect: [], exact: true })
    door('B: the old key\'s blocks on the recovery rotation\'s line count again: the sale stands', 'ownership', [b1, s.held], { expect: { owner: buyer.id, transfers: [b2.hash], conflict: null } })
    door('B: the key the recovery rotation saw speaks; the crossing rotation off its line is void, and so is the key it brought in', 'key_timeline', [me.id, s.held, null], { expect: [{ key: keyOf('sBme').public_key_sign, frozen: false }, { key: keyOf('sBmine').public_key_sign, frozen: false }, { key: keyOf('sBsettled').public_key_sign, frozen: false, signer: 'recovery' }] })
  }
  {
    // keys/e6, spec-gaps/t14: of two recovery rotations in causal order, the latest's line decides, in the core and the oracle alike
    const s = story(), me = withRecovery(s, 'sBre'), buyer = s.person('sBrebuyer')
    const n1 = s.say(me, 'thing', { kind: 'cask' })
    const n2 = s.say(me, 'transfer', {}, { what: n1.hash, to_owner: buyer.id })
    s.say(buyer, 'transfer', { status: 'accepted' }, { answers: n2.hash })
    const n3 = s.say(me, 'observe', { kind: 'note', text: 'n3' })
    const r1 = s.keep(fb.identity.keyGrant(me.id, keyOf('sBre1').public_key_sign, { private_key: me.rec.private_key, recoveryKey: me.rec.public_key_sign, last: null }, { replaces: keyOf('sBre').public_key_sign, countedTo: n1.hash, at: at(), after: [n3.hash] }))
    door('B: a recovery rotation counted to the block before a sale voids it', 'ownership', [n1, s.held], { expect: { owner: me.id, transfers: [], conflict: null } })
    s.keep(fb.identity.keyGrant(me.id, keyOf('sBre2').public_key_sign, { private_key: me.rec.private_key, recoveryKey: me.rec.public_key_sign, last: r1 }, { replaces: keyOf('sBre').public_key_sign, countedTo: n3.hash, at: at() }))
    door('B: of two recovery rotations in causal order, the later one\'s line decides (keys/e6, spec-gaps/t14): the sale counts again', 'ownership', [n1, s.held], { expect: { owner: buyer.id, transfers: [n2.hash], conflict: null } })
    const a1 = hand(s, me, 'sBre', 'observe', { kind: 'note', text: 'n4' }, { prev: n3.hash }, 4)
    door('B: and a block of the old key past the later line is no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [a1, s.held, null], { expect: false, exact: true })
  }
  {
    // time/r3: the recovery_reach view protects only what another identity built on and that arrived before the reach began
    const s = story(), me = withRecovery(s, 'sBrr'), other = s.person('sBrrother')
    const dev = s.keep(fb.identity.keyGrant(me.id, keyOf('sBrr_laptop').public_key_sign, { private_key: keyOf('sBrr').private_key, last: null, broughtIn: me.id }, { at: at() }))
    const used = s.say(me, 'observe', { kind: 'note', text: 'someone builds on this' })
    s.say(other, 'observe', { kind: 'note', text: 'built on it' }, { derives_from: used.hash })
    const lone = s.say(me, 'observe', { kind: 'note', text: 'nobody builds on this (it is in no other identity\'s causal past)' })
    const settle = s.keep(fb.identity.keyGrant(me.id, keyOf('sBrr2').public_key_sign, { private_key: me.rec.private_key, recoveryKey: me.rec.public_key_sign, last: null }, { replaces: keyOf('sBrr').public_key_sign, countedTo: dev.hash, at: at() }))
    const arrivals = { [lone.hash]: '2026-08-01T00:00:00.000Z', [used.hash]: '2026-08-01T00:00:00.000Z', [settle.hash]: '2026-10-15T00:00:00.000Z' }
    door('B: recovery_reach protects a block another identity built on that arrived before the reach, never one nobody used (time/r3)', 'recovery_reach', [settle, s.held, arrivals], { expect: [used.hash], exact: true })
  }
  {
    // the twin of the 1.6 story: two key grants of one key naming one prev, then a recovery rotation that saw key a's grant. The recovery
    // rotation decides the pair: the half on its counted line stands; the other is off the line, void, and so is the key it brought in.
    const s = story(), p = withRecovery(s, 'sBxena')
    const gA = s.keep(fb.identity.keyGrant(p.id, keyOf('sBxena_a').public_key_sign, { private_key: keyOf('sBxena').private_key, last: null, broughtIn: p.id }, { at: at() }))
    const gB = s.keep(fb.identity.keyGrant(p.id, keyOf('sBxena_b').public_key_sign, { private_key: keyOf('sBxena').private_key, last: null, broughtIn: p.id }, { at: at() }))
    const fromA = hand(s, p, 'sBxena_a', 'observe', { kind: 'note', text: 'a' }, { prev: gA.hash }, 1)
    door('B: two key grants of one key naming one prev freeze the keys they bring in', 'key_timeline', [p.id, s.held, null], { expect: [{ key: keyOf('sBxena').public_key_sign, frozen: false }, { key: keyOf(gA.hash < gB.hash ? 'sBxena_a' : 'sBxena_b').public_key_sign, frozen: true }, { key: keyOf(gA.hash < gB.hash ? 'sBxena_b' : 'sBxena_a').public_key_sign, frozen: true }] })
    door('B: a block of a frozen key is no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [fromA, s.held, null], { expect: false, exact: true })
    s.keep(fb.identity.keyGrant(p.id, keyOf('sBxena_new').public_key_sign, { private_key: p.rec.private_key, recoveryKey: p.rec.public_key_sign, last: null }, { replaces: keyOf('sBxena').public_key_sign, countedTo: gA.hash, after: [gA.hash], at: at() }))
    door('B: a recovery rotation counted to key a\'s grant settles the pair: key a speaks', 'valid', [fromA, s.held, null], { expect: [], exact: true })
    door('B: and the other grant, off the recovery rotation\'s line, is void, with the key it brought in', 'key_timeline', [p.id, s.held, null], { expect: [{ key: keyOf('sBxena').public_key_sign, frozen: false }, { key: keyOf('sBxena_a').public_key_sign, frozen: false }, { key: keyOf('sBxena_new').public_key_sign, frozen: false, signer: 'recovery' }] })
  }
  {
    // the node: a stale key's sibling is refused, so it never stands beside the block it copies (forks/f8); with no rotation, a pair is a pair
    const s = story(), rx = withRecovery(s, 'sBrx')
    const first = s.say(rx, 'observe', { kind: 'note', text: 'the first key signs first' })
    const rot = s.keep(fb.identity.keyGrant(rx.id, keyOf('sBrx_new').public_key_sign, { private_key: rx.rec.private_key, recoveryKey: rx.rec.public_key_sign, last: null }, { replaces: keyOf('sBrx').public_key_sign, countedTo: first.hash, at: at() }))
    const twin = hand(s, rx, 'sBrx', 'observe', { kind: 'note', text: 'a second story' }, { prev: first.refs.prev }, 1)
    door('B: accept: after a recovery rotation counted to the first key\'s first block, a sibling of it is taken and forms no pair: it counts for nothing (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'accept', [[twin], s.held, null, null], { expect: { taken: [twin.hash], waiting: [], refused: [], equivocations: [] } })
    door('B: and the sibling is no word of hers', 'signed_by_author', [twin, s.held, null], { expect: false, exact: true })
    const plain = s.held.filter((b) => b !== rot)
    door('B: accept: with no rotation, the first key twice naming one prev is an equivocation', 'accept', [[twin], plain, null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [[first.hash, twin.hash].sort()] } })
  }

  // C. A recovery key is named only in the genesis (spec-gaps/t21, keys/e3, e3b, time/r4).
  {
    const R = keyOf('sCrecovery').public_key_sign
    check('C: a key grant that names the recovery pair is refused: only the genesis names it (spec-gaps/t21)', { type: 'grant', state: { kind: 'key', public_key_sign: keyOf('sCdev').public_key_sign, recovery_key_hash: fb.identity.recoveryKeyHash(R), recovery_reach: 'P30D' }, refs: { subject: AUTH } }, ['undeclared_field'])
    check('C: a key grant that names only the recovery pair names no key', { type: 'grant', state: { kind: 'key', recovery_key_hash: fb.identity.recoveryKeyHash(R), recovery_reach: 'P30D' }, refs: { subject: AUTH } }, ['required', 'undeclared_field'])
    door('C: a genesis still names the recovery pair', 'refusals', ['actor', { kind: 'person', at: '2026-10-28T12:00:00.000Z', audience: 'public', public_key_sign: keyOf('sCg').public_key_sign, recovery_key_hash: fb.identity.recoveryKeyHash(R), recovery_reach: 'P30D' }, {}, [], null], { expect: [], exact: true })
    const s = story(), me = s.person('sCme')
    const n1 = s.say(me, 'observe', { kind: 'note', text: 'one' })
    const plant = hand(s, me, 'sCme', 'grant', { kind: 'key', public_key_sign: keyOf('sCdev2').public_key_sign, recovery_key_hash: fb.identity.recoveryKeyHash(R), recovery_reach: 'P30D' }, { subject: me.id, prev: n1.hash }, 2)
    door('C: a planted recovery pair in a key grant is refused at the gate (spec-gaps/t21)', 'valid', [plant, s.held, null], { expect: [{ code: 'undeclared_field' }] })
    const rot = { type: 'grant', state: { kind: 'key', seq: 1, at: at(), audience: 'public', public_key_sign: keyOf('sCthief').public_key_sign, replaces: keyOf('sCme').public_key_sign, counted_to: n1.hash, recovery_key: R }, refs: { author: me.id, subject: me.id, prev: me.id } }
    const signed = { ...fb.create(rot.type, rot.state, rot.refs), signature: fb.sign(rot, keyOf('sCrecovery').private_key) }
    door('C: so a recovery rotation by a key the genesis never named opens with no key of the author\'s (keys/e3, time/r4)', 'valid', [signed, [...s.held, plant], null], { expect: [{ code: 'bad_signature' }] })
  }

  // D. A successor grant has no power until its death conditions hold; the successor is no witness; the person's stop voids every close.
  {
    const s = story(), P = s.person('sDp'), S = s.person('sDs'), W = s.person('sDw'), B = s.person('sDb')
    const cow = s.say(P, 'thing', { kind: 'cow', name: 'Daisy' })
    const G = s.say(P, 'grant', { kind: 'successor', witnesses: [W.id], needed: 1, wait: 'P30D' }, { to: S.id })
    const take = s.say(S, 'transfer', {}, { what: cow.hash, to_owner: S.id, under: G.hash })
    s.say(S, 'transfer', { status: 'accepted' }, { answers: take.hash })
    door('D: a successor with no counted close in the past of their block moves nothing of the living person\'s (successor/r5)', 'ownership', [cow, s.held], { expect: { owner: P.id, transfers: [], conflict: null } })
    door('D: their block under the grant speaks for no one (under_ok is false)', 'under_ok', [take, s.held], { expect: false, exact: true })
    const offer = s.say(S, 'promise', { terms: { price: M(100000), expires: DAY } }, { from: P.id, to: B.id, what: cow.hash, under: G.hash })
    s.say(B, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    door('D: nor do they bind the person to a sale: the offer speaks for neither side (successor/r5b)', 'promise_stage', [offer, s.held, {}], { expect: null, exact: true })
    const t = s.say(W, 'observe', { kind: 'trigger' }, { under: G.hash, subject: P.id })
    const close = s.say(S, 'observe', { kind: 'close' }, { under: G.hash, subject: P.id, after: [t.hash] })
    const later = s.say(S, 'transfer', {}, { what: cow.hash, to_owner: S.id, under: G.hash }, { after: [close.hash] })
    s.say(S, 'transfer', { status: 'accepted' }, { answers: later.hash })
    door('D: after a counted close in their block\'s causal past, the successor acts for the person', 'ownership', [cow, s.held], { expect: { owner: S.id, transfers: [later.hash], conflict: null } })
  }
  {
    // successor/r1, r2: the person's counted stop of the successor grant voids every close under it, whenever it came
    const s = story(), P = s.person('sDp2'), S = s.person('sDs2'), W = s.person('sDw2'), farm = s.person('sDfarm2')
    const box = s.say(farm, 'thing', { kind: 'veg box' })
    const weekly = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(1500), expires: DAY } }, { from: farm.id, to: P.id, what: box.hash })
    answer(s, P, weekly, { status: 'accepted' })
    const G = s.say(P, 'grant', { kind: 'successor', witnesses: [W.id], needed: 1, wait: 'P7D' }, { to: S.id })
    const t = s.say(W, 'observe', { kind: 'trigger' }, { under: G.hash, subject: P.id })
    const close = s.say(S, 'observe', { kind: 'close' }, { under: G.hash, subject: P.id, after: [t.hash] })
    stage('D: before the person\'s stop, a counted close ends no promise of hers (batch 2 P7; its authority twin is in section 22)', weekly, s.held, { stage: 'accepted', from: null })
    void close
    s.say(P, 'grant', { status: 'stopped', stop: 'onward' }, { updates: G.hash })
    stage('D: her stop of the successor grant, written after the close, voids it: she is back (successor/r2)', weekly, s.held, { stage: 'accepted', from: null })
    check('D: a successor grant whose successor is a witness is refused (successor/r6: no one records the event that gives them power)', { type: 'grant', state: { kind: 'successor', witnesses: [ID], needed: 1, wait: 'P7D' }, refs: { to: ID } }, ['shape'])
    check('D: with another witness beside the successor, still refused', { type: 'grant', state: { kind: 'successor', witnesses: [ID, '2'.repeat(64)].sort(), needed: 1, wait: 'P7D' }, refs: { to: ID } }, ['shape'])
  }

  // E. The suite is derived from the signing key: no message, CBOR entry or label names it (canonical/relabel_fold, relabel_oracle, divergence/R2).
  {
    const s = story(), al = s.person('sEal')
    const note = s.say(al, 'observe', { kind: 'note', text: 'an std-signed block' })
    const relabel = { ...note, hash: fb.hash(note.type, note.state, note.refs, 'sm') }
    assert.ok(relabel.hash.startsWith('sm3:'))
    door('E: an std-signed block under an sm3 id is bad_hash: one signed block has one id (canonical/relabel_fold)', 'valid', [relabel, s.held, null], { expect: [{ code: 'bad_hash' }] })
    door('E: a node computes the id itself: the block and a copy under another id are one block, taken once, and no pair (canonical/relabel)', 'accept', [[note, relabel], s.held.filter((b) => b !== note), null, null], { expect: { taken: [note.hash], waiting: [], refused: [], equivocations: [] } })
    door('E: a public block as a message names no suite', 'wrap', [note], { expect: { version: fb.PROTOCOL.version, block: { type: note.type, state: note.state, refs: note.refs }, signature: note.signature }, exact: true })
    const msg = call('wrap', note)
    V.door = V.door.filter((c) => c.name !== 'E: a message that names a suite is refused (bad_hash): no label gives a block a second id')
    let threw = null
    try { call('unwrap', { ...msg, suite: 'sm' }) } catch (e) { threw = e }
    assert.ok(threw && threw.code === 'bad_hash', 'unwrap refuses a message naming a suite')
    V.door.push({ name: 'E: a message that names a suite is refused (bad_hash): no label gives a block a second id', op: 'unwrap', args: JSON.parse(JSON.stringify([{ ...msg, suite: 'sm' }])), error: { kind: 'crypto', code: 'bad_hash' } })
    made.add('E: a message that names a suite is refused (bad_hash): no label gives a block a second id')
    door('E: unwrapping an std block rebuilds its std id', 'unwrap', [msg], { expect: { hash: note.hash, signature: note.signature } })
    // a CBOR message with an entry after the signature is refused
    const cbor = call('cbor_encode', note, true)
    const bytes = Buffer.from(cbor, 'hex')
    assert.equal(bytes[0], 0x83)
    const four = Buffer.concat([Buffer.from([0x84]), bytes.subarray(1), Buffer.from([0x62, 0x73, 0x6d])]).toString('hex')
    const name = 'a fourth entry after the signature (a suite named beside the block: security E)'
    V.cbor.refused = V.cbor.refused.filter((r) => r.name !== name)
    let refused = false
    try { call('cbor_decode', four) } catch { refused = true }
    assert.ok(refused, 'cbor_decode refuses a fourth entry')
    V.cbor.refused.push({ name, cbor: four })
    made.add('cbor refused: ' + name)
  }
  for (const suite of ['p256', 'sm']) {
    // the twins of the 1.6 suite vectors: the message and the CBOR form carry no suite; the id is rebuilt in the signing key's suite
    const s = story(), name = `sE${suite}`
    const kp = fb.keypairFromSeed(sha(`foodblock 1.7 vectors: ${name}`), suite)
    keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign, suite }
    const g = s.keep(genesis(keys[name], { kind: 'person', at: at() }))
    const who = { name, id: g.hash, g }
    const note = s.keep(fb.write('observe', { kind: 'note', text: 'hello' }, {}, { author: who.id, key: keys[name], held: s.held, at: at(), audience: 'public' }))
    assert.equal(note.hash.startsWith('sm3:'), suite === 'sm')
    const msg = door(`E: ${suite}: a public block as a message names no suite`, 'wrap', [note], { expect: { version: fb.PROTOCOL.version, block: { type: note.type, state: note.state, refs: note.refs }, signature: note.signature }, exact: true })
    door(`E: ${suite}: unwrapping rebuilds the id in the suite of the key that signed it (read from the block: as its prev is hashed)`, 'unwrap', [msg], { expect: { hash: note.hash } })
    door(`E: ${suite}: unwrapping a genesis rebuilds its id in the suite it names`, 'unwrap', [call('wrap', g)], { expect: { hash: g.hash } })
    const cb = door(`E: ${suite}: a block as CBOR is [t, block, signature], nothing after`, 'cbor_encode', [note, true])
    door(`E: ${suite}: and decodes to the same block and id`, 'cbor_decode', [cb], { expect: { hash: note.hash, signature: note.signature } })
    door(`E: ${suite}: the block is valid against its genesis`, 'valid', [note, s.held.filter((b) => b !== note), null], { expect: [], exact: true })
  }
  {
    // a key's first block after a move to a suite of another hash: read from the block alone it hashes as its prev; the author's keys give the
    // signing key's suite, and a node computes it so before it judges the block
    const s = story(), mv = s.person('sEmover')
    const kp = fb.keypairFromSeed(sha('foodblock 1.7 vectors: sEmover_sm'), 'sm')
    keys.sEmover_sm = { private_key: kp.private_key, public_key_sign: kp.public_key_sign, suite: 'sm' }
    const last = s.say(mv, 'observe', { kind: 'note', text: 'the last block in std' })
    const move = s.keep(fb.identity.keyGrant(mv.id, kp.public_key_sign, { private_key: keyOf('sEmover').private_key, last, broughtIn: mv.id }, { replaces: keyOf('sEmover').public_key_sign, countedTo: last.hash, suite: 'sm', at: at() }))
    const after = fb.write('observe', { kind: 'note', text: 'the first block in sm' }, {}, { author: mv.id, key: keys.sEmover_sm, held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: move.hash } })
    assert.ok(after.hash.startsWith('sm3:'))
    door('E: id_of a key\'s first block after a move to sm, with the author\'s keys held: sm3', 'id_of', [after, s.held], { expect: after.hash, exact: true })
    door('E: id_of the same block read alone: hashed as its prev is (SHA-256)', 'id_of', [after], { expect: fb.hash(after.type, after.state, after.refs), exact: true })
    const msg = call('wrap', after)
    door('E: unwrap with the author\'s keys held gives the sm3 id', 'unwrap', [msg, s.held], { expect: { hash: after.hash } })
    const off = call('unwrap', msg)
    door('E: a node computes the id in the signing key\'s suite before it judges: the first sm block is taken under its sm3 id', 'accept', [[off], s.held, null, null], { expect: { taken: [after.hash], waiting: [], refused: [], equivocations: [] } })
  }
  {
    // the passkey twins: a passkey's block travels with its longer signature and no suite
    const pk = V.door.find((c) => c.name === 'passkey: a note signed by a passkey is valid against its genesis')
    if (pk) {
      const [note, held] = pk.args
      const msg = door('E: passkey: a block signed by a passkey travels as a message with no suite, its signature one hex string', 'wrap', [note], { expect: { block: { type: note.type, state: note.state, refs: note.refs }, signature: note.signature }, exact: false })
      assert.equal(msg.suite, undefined)
      door('E: passkey: unwrapping rebuilds the id and keeps the signature', 'unwrap', [msg, held], { expect: { hash: note.hash, signature: note.signature } })
      const cb = door('E: passkey: a block signed by a passkey as CBOR: the signature is a longer byte string, and nothing follows it', 'cbor_encode', [note, true])
      door('E: passkey: it decodes back to the same block and signature', 'cbor_decode', [cb, held], { expect: { hash: note.hash, signature: note.signature } })
    }
  }

  // B, the two engines settled alike (found by a fuzzer aimed at A to E: scratchpad/sec-final/idfuzz.cjs, seeds 100, 112, 189, 213, 290).
  {
    // two recovery rotations that do not see each other end the identity, even when neither is the first (seed 290): R1 then R2 in order,
    // and R3 a fork of the recovery key's chain that sees R1 by its counted_to but not R2
    const s = story(), me = withRecovery(s, 'sBend'), buyer = s.person('sBendbuyer')
    const dev = s.keep(fb.identity.keyGrant(me.id, keyOf('sBend_phone').public_key_sign, { private_key: keyOf('sBend').private_key, last: null, broughtIn: me.id }, { at: at() }))
    const n1 = s.say(me, 'thing', { kind: 'tin' })
    const recKey = { private_key: me.rec.private_key, recoveryKey: me.rec.public_key_sign }
    const r1 = s.keep(fb.identity.keyGrant(me.id, keyOf('sBend1').public_key_sign, { ...recKey, last: null }, { replaces: keyOf('sBend').public_key_sign, countedTo: n1.hash, at: at() }))
    const r2 = s.keep(fb.identity.keyGrant(me.id, keyOf('sBend2').public_key_sign, { ...recKey, last: r1 }, { replaces: keyOf('sBend1').public_key_sign, countedTo: r1.hash, at: at() }))
    // the phone (a key no rotation touches) sells the tin after both, seeing neither
    const sale = onKey(s, me, 'sBend_phone', dev, 1, 'transfer', {}, { what: n1.hash, to_owner: buyer.id })
    s.say(buyer, 'transfer', { status: 'accepted' }, { answers: sale.hash })
    door('B: one line of recovery rotations in causal order: the phone, a key no rotation touches, sells the tin', 'ownership', [n1, s.held], { expect: { owner: buyer.id, transfers: [sale.hash], conflict: null } })
    const r3 = s.keep(fb.identity.keyGrant(me.id, keyOf('sBend3').public_key_sign, { ...recKey, last: r1 }, { replaces: keyOf('sBend1').public_key_sign, countedTo: r1.hash, at: at() }))
    assert.equal(r3.refs.prev, r2.refs.prev)
    door('B: a recovery rotation that crosses the latest (both after the first) ends the identity: the phone\'s sale, in neither one\'s past, counts for nothing', 'ownership', [n1, s.held], { expect: { owner: me.id, transfers: [], conflict: null } })
    door('B: and the phone\'s sale is no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [sale, s.held, null], { expect: false, exact: true })
    door('B: the recovery key\'s two blocks after the first are a pair of its own chain', 'fork_pairs', [s.held], { expect: [[r2.hash, r3.hash].sort()], exact: true })
    const tl = door('B: what each of the crossing recovery rotations brings in is frozen; what the first brought in is not', 'key_timeline', [me.id, s.held, null])
    assert.deepEqual(Object.fromEntries(tl.map((k) => [k.key, k.frozen])), Object.fromEntries([['sBend', false], ['sBend_phone', false], ['sBend1', false], ['sBend2', true], ['sBend3', true]].map(([n, f]) => [keyOf(n).public_key_sign, f])))
  }
  {
    // a key grant a frozen key signs brings in no key (seeds 100, 112): the frozen key is listed, the key it would bring in is not
    const s = story(), me = withRecovery(s, 'sBfz')
    const b1 = s.say(me, 'thing', { kind: 'pail' })
    const mine = rotate(s, me, 'sBfz', 'sBfzmine', b1, b1)
    s.keep(hand(s, me, 'sBfz', 'grant', { kind: 'key', public_key_sign: keyOf('sBfztheirs').public_key_sign, replaces: keyOf('sBfz').public_key_sign, counted_to: b1.hash }, { subject: me.id, prev: b1.hash }, b1.state.seq + 1))
    const child = s.keep(hand(s, me, 'sBfzmine', 'grant', { kind: 'key', public_key_sign: keyOf('sBfzchild').public_key_sign }, { subject: me.id, prev: mine.hash }, 1))
    const tl = door('B: a frozen key\'s key grant brings in no key: the keys are the old key and the two frozen ones', 'key_timeline', [me.id, s.held, null])
    assert.deepEqual(Object.fromEntries(tl.map((k) => [k.key, k.frozen])), Object.fromEntries([['sBfz', false], ['sBfztheirs', true], ['sBfzmine', true]].map(([n, f]) => [keyOf(n).public_key_sign, f])))
    const late = hand(s, me, 'sBfzchild', 'observe', { kind: 'note', text: 'the child key' }, { prev: child.hash }, 1)
    door('B: so a block the would-be child key signs is no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [late, s.held, null], { expect: false, exact: true })
    door('B: the frozen key\'s own key grant is no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [child, s.held, null], { expect: false, exact: true })
  }
  {
    // an operator's rotation is a rotation like any other (seeds 1130, 5296): two accepted operators rotating one machine key without
    // seeing each other freeze what each brings in, and so does a later rotation by the first that still does not see the second
    const s = story(), bot = s.person('sBop_bot', { kind: 'agent' }), o1 = s.person('sBop_o1'), o2 = s.person('sBop_o2')
    const g1 = s.say(o1, 'grant', { kind: 'operator' }, { to: bot.id })
    const g2 = s.say(o2, 'grant', { kind: 'operator' }, { to: bot.id })
    s.say(bot, 'grant', { status: 'accepted' }, { answers: g1.hash })
    const yes2 = s.say(bot, 'grant', { status: 'accepted' }, { answers: g2.hash })
    const ra = s.say(o1, 'grant', { kind: 'key', public_key_sign: keyOf('sBop_a').public_key_sign, replaces: keyOf('sBop_bot').public_key_sign, counted_to: yes2.hash }, { subject: bot.id })
    s.say(o2, 'grant', { kind: 'key', public_key_sign: keyOf('sBop_b').public_key_sign, replaces: keyOf('sBop_bot').public_key_sign, counted_to: yes2.hash }, { subject: bot.id })
    s.say(o1, 'grant', { kind: 'key', public_key_sign: keyOf('sBop_c').public_key_sign, replaces: keyOf('sBop_bot').public_key_sign, counted_to: yes2.hash }, { subject: bot.id, after: [ra.hash] })
    const tl = door('B: two operators\' rotations of one machine key that cross freeze what each brings in, and a later one that sees only its own', 'key_timeline', [bot.id, s.held, null])
    assert.deepEqual(Object.fromEntries(tl.map((k) => [k.key, k.frozen])), Object.fromEntries([['sBop_bot', false], ['sBop_a', true], ['sBop_b', true], ['sBop_c', true]].map(([n, f]) => [keyOf(n).public_key_sign, f])))
  }
  {
    // valid() asks whether the key speaks with the block held, as a node will hold it once taken (seeds 1115, 5546)
    const s = story(), me = s.person('sBheld')
    const n1 = s.say(me, 'observe', { kind: 'note', text: 'one' })
    const rot = rotate(s, me, 'sBheld', 'sBheld2', n1, n1)
    const k1 = onKey(s, me, 'sBheld2', rot, 1, 'observe', { kind: 'note', text: 'the new key' })
    // the old key signs a later rotation, a sibling of its first, that sees the first only through the new key's block
    const late = s.keep(hand(s, me, 'sBheld', 'grant', { kind: 'key', public_key_sign: keyOf('sBheld3').public_key_sign, replaces: keyOf('sBheld').public_key_sign, counted_to: n1.hash }, { subject: me.id, prev: n1.hash, after: [k1.hash] }, n1.state.seq + 1))
    door('B: judged with it held, the new key\'s block speaks: the later rotation sees the first through it, so nothing crosses', 'valid', [k1, s.held.filter((b) => b !== k1), null], { expect: [], exact: true })
    door('B: and the old key\'s later rotation, which saw its first, is a block of the old key off the line: no word of hers (clean round 1: whether a key speaks is the folds\', never validity\'s)', 'signed_by_author', [late, s.held, null], { expect: false, exact: true })
  }
}

// ---- 20. Security: the authority test, the promise fold's signed acts, strict signatures, one causal past, limits (Patrick's
// decisions P1 F to I and L, 2026-10-28; security20/SYNTHESIS.md) ----
// Each fix has a negative vector built from the security repro that broke it (scratchpad/security20/<lens>/<repro>); each vector an
// approved rule flipped is retired below and twinned here under a new name.
{
  const ID = '0'.repeat(64)
  const P256N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n
  // a P-256 signature (r then s, or a passkey's form, which starts with r then s) with its s made low
  const lowS = (hex) => {
    const s = BigInt('0x' + hex.slice(64, 128))
    return s <= P256N / 2n ? hex : hex.slice(0, 64) + (P256N - s).toString(16).padStart(64, '0') + hex.slice(128)
  }
  // the retired p256 and passkey cases, kept as they were in a fixture (they are retired from spec/vectors.json)
  const ORIGINALS = JSON.parse(fs.readFileSync(path.join(FINDINGS, 'H-high-s-originals.json'), 'utf8')).cases
  const old = (name) => {
    const c = ORIGINALS.find((x) => x.name === name)
    assert.ok(c, 'a vector to twin: ' + name)
    return JSON.parse(JSON.stringify(c))
  }
  // a block whose signature is a P-256 one (its own genesis names p256, or its author's genesis does), with s made low
  const lowBlock = (b, held) => {
    const g = b.refs && b.refs.author ? held.find((x) => x.hash === b.refs.author) : b
    return g && g.state && g.state.suite === 'p256' ? { ...b, signature: lowS(b.signature) } : b
  }

  // H. Signatures and keys as the suite accepts them (crypto/valid_variants, small_order, p256; divergence/R1; ffi/verify_cache).
  {
    // the p256 vectors whose signatures had a high s: each refused as it was, and opening once s is made low
    for (const name of ['p256: the genesis is valid, its id hashed in the suite', 'p256: a block of the chain is valid against the genesis']) {
      const c = old(name)
      const [block, held, ...rest] = c.args
      // a block whose author's genesis is not valid rests on nothing a node holds: it is not judged (clean round 1: validity reads what it rests on)
      const code = held.length ? 'unmet' : 'bad_genesis'
      door(held.length ? `H: high s: ${name}: with the genesis's own high s, the genesis is no block a node holds, so the block is not judged (unmet)` : `H: high s: ${name}: a signature whose s is high is refused (${code})`, 'valid', c.args, { expect: [{ code }] })
      const fixed = held.map((h) => lowBlock(h, held))
      door(`H: low s: ${name}`, 'valid', [lowBlock(block, fixed), fixed, ...rest], { expect: [], exact: true })
    }
    for (const name of ['passkey: the plain 64-byte form of the same key still opens a block', 'passkey: extension data after the 37 bytes: opens', 'passkey: the counter is not looked at, however large',
      'passkey: members of clientDataJSON beyond type and challenge are ignored', 'passkey: clientDataJSON is read as JSON: member order and spaces do not matter']) {
      const c = old(name)
      const [block, sig, key] = c.args
      door(`H: high s: ${name}: with the device's high s it opens nothing`, 'verify', c.args, { expect: false, exact: true })
      door(`H: low s: ${name}`, 'verify', [block, lowS(sig), key], { expect: true, exact: true })
    }
    {
      const name = 'passkey: a signed message part (a pull request) can be signed by a passkey too: the challenge is its canonical JSON without the signature'
      const c = old(name)
      const [part, key] = c.args
      door(`H: high s: ${name}: with the device's high s it opens nothing`, 'verify_message', c.args, { expect: false, exact: true })
      door(`H: low s: ${name}`, 'verify_message', [{ ...part, signature: lowS(part.signature) }, key], { expect: true, exact: true })
    }
    {
      const name = 'passkey: a DER signature and the same r then s make the same wire form'
      const c = old(name)
      door(`H: low s: ${name}, with s made low`, 'passkey_signature', c.args, { expect: lowS(c.expect), exact: true })
    }
    // one written form: lowercase hex of the suite's exact length, before anything is decoded
    const s = story(), al = s.person('sHal')
    const note = s.say(al, 'observe', { kind: 'note', text: 'one form' })
    door('H: a signature written in uppercase opens with no key (divergence/R1: one signature, one written form)', 'valid', [{ ...note, signature: note.signature.toUpperCase() }, s.held.filter((b) => b !== note), null], { expect: [{ code: 'bad_signature' }] })
    door('H: nor does a genesis signed in uppercase hex open with its own key', 'valid', [{ ...al.g, signature: al.g.signature.toUpperCase() }, []], { expect: [{ code: 'bad_genesis' }] })
    door('H: verify: an uppercase key opens nothing', 'verify', [note, note.signature, keyOf('sHal').public_key_sign.toUpperCase()], { expect: false, exact: true })
    door('H: verify: a signature with a byte too many opens nothing', 'verify', [note, note.signature + '00', keyOf('sHal').public_key_sign], { expect: false, exact: true })
    // small-order and non-canonical Ed25519 keys (crypto/small_order: the identity point and a fixed signature verify for every message)
    const SPKI = '302a300506032b6570032100'
    const identity = SPKI + '01' + '00'.repeat(31)
    const yPlusP = SPKI + 'ee' + 'ff'.repeat(30) + '7f'
    const order2 = SPKI + 'ec' + 'ff'.repeat(30) + '7f'
    const forgery = '01' + '00'.repeat(63)
    for (const [label, key] of [['the identity point', identity], ['a point of order 2', order2], ['a non-canonical encoding (y = p + 1)', yPlusP]]) {
      door(`H: a genesis whose key is ${label} is no key of its suite (unknown_suite)`, 'refusals', ['actor', { kind: 'person', at: '2026-10-28T00:00:00.000Z', audience: 'public', public_key_sign: key }, {}, [], null], { expect: [{ code: 'unknown_suite' }] })
      door(`H: ${label} opens no signature, not even the fixed one that would open for every message`, 'verify', [note, forgery, key], { expect: false, exact: true })
    }
    check('H: a key grant that brings in a small-order key is refused (unknown_suite)', { type: 'grant', state: { kind: 'key', public_key_sign: identity }, refs: { subject: AUTH } }, ['unknown_suite'])
  }

  // L and I. One depth, one digit limit (divergence/R3, R3b; dos/bigdec, promises/t9).
  {
    const nest = (d) => { let v = 'x'; for (let i = 0; i < d; i++) v = { a: v }; return v }
    // the block is 1, its state 2, each object inside one more: state.deep nested 30 objects deep makes the block 32
    check('L: a block that nests 32 deep is well formed', { type: 'observe', state: { kind: 'note', deep: nest(30) }, refs: {} }, [])
    check('L: a block that nests 33 deep is refused (size_limit)', { type: 'observe', state: { kind: 'note', deep: nest(31) }, refs: {} }, ['size_limit'])
    check('L: and one 123 deep, which once wedged every pull past it, is refused too (divergence/R3b)', { type: 'observe', state: { kind: 'note', deep: nest(120) }, refs: {} }, ['size_limit'])
    const text = (d) => JSON.stringify({ type: 'observe', state: { kind: 'note', deep: nest(d) }, refs: {} })
    door('L: strict text nested deeper than limits.depth_read is not read: not_canonical, the same for every reader', 'strict_text', [text(127)], { expect: [{ code: 'not_canonical' }] })
    door('L: strict text within limits.depth_read is read, and a block that deep is size_limit', 'strict_text', [text(126)], { expect: [{ code: 'size_limit' }] })
    const forty = '1' + '0'.repeat(39), fortyOne = '1' + '0'.repeat(40)
    check('I: an amount of 41 digits is no decimal (decimal)', { type: 'transfer', state: { amount: fb.amount(fortyOne, 'kg') }, refs: { what: ID, to_owner: ID } }, ['decimal'])
    check('I: an amount of 40 digits is a decimal', { type: 'transfer', state: { amount: fb.amount(forty, 'kg') }, refs: { what: ID, to_owner: ID } }, [])
    check('I: nor are digits after the point free: 1 then 40 decimals is no decimal', { type: 'transfer', state: { amount: fb.amount('1.' + '0'.repeat(40), 'kg') }, refs: { what: ID, to_owner: ID } }, ['decimal'])
    // the twins of the vectors whose decimals were longer than limits.decimal_digits
    door('I: within_limit compares exactly at 40 digits: 1 kg inside a limit of 10^39 kg', 'within_limit', [{ limit: fb.amount(forty, 'kg') }, fb.amount('1', 'kg'), '0'], { expect: true, exact: true })
    door('I: within_limit: a limit of 41 digits is no limit: never within', 'within_limit', [{ limit: fb.amount(fortyOne, 'kg') }, fb.amount('1', 'kg'), '0'], { expect: false, exact: true })
    door('I: within_limit: what was spent, past 40 digits, is no number: never within (review F10a)', 'within_limit', [{ limit: fb.amount('5', 'kg') }, fb.amount('1', 'kg'), '0.' + '1'.repeat(40)], { expect: false, exact: true })
    door('I: within_limit: what was spent at 40 digits is added exactly', 'within_limit', [{ limit: fb.amount('5', 'kg') }, fb.amount('1', 'kg'), '0.' + '1'.repeat(39)], { expect: true, exact: true })
    const s = story(), ann = s.person('sIann'), bob = s.person('sIbob')
    const flour = s.say(ann, 'thing', { kind: 'flour' })
    s.say(bob, 'observe', { kind: 'price', amount: fb.amount('410', 'GBP/t') }, { subject: flour.hash }, { time: '2027-04-01T09:00:00.000Z' })
    const T = '2027-04-02T00:00:00.000Z', price = { signal: 'price', by: [bob.id], subject: flour.hash }
    holds('I: conditions: a value of 40 digits compares exactly', { ...price, op: 'lt', value: fb.amount(forty, 'GBP/t') }, s.held, T, true)
    holds('I: conditions: a value of 41 digits is no decimal: the condition does not hold', { ...price, op: 'lt', value: fb.amount(fortyOne, 'GBP/t') }, s.held, T, false)
  }

  // I. One causal past per fold, and a star of pairs (dos/push_amp, fork_wide, chain).
  {
    const s = story(), me = s.person('sIfork')
    const three = ['a', 'b', 'c'].map((t) => s.keep(fb.write('observe', { kind: 'note', text: t }, {}, { author: me.id, key: keyOf('sIfork'), held: [], at: at(), audience: 'public', link: { seq: 1, prev: me.id } })))
    const hs = three.map((b) => b.hash).sort()
    const star = [[hs[0], hs[1]], [hs[0], hs[2]]]
    door('I: three blocks of one key on one prev: the chain lists a star of pairs, each with the lowest hash, never every pair', 'check_chain', [three, me.id], { expect: { equivocations: star, ok: false, length: 0 } })
    door('I: and fork_pairs lists the same star', 'fork_pairs', [s.held], { expect: star, exact: true })
    door('I: and a push of all three lists the same star, taking none', 'accept', [three, [me.g], null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: star } })
  }

  // F. The fold applies the same authority test the door reports (grants/t1, t3, t4, t5; agents/t10, t9).
  {
    const s = story(), alice = s.person('sFalice'), bot = s.person('sFbot', { kind: 'agent' }), bob = s.person('sFbob'), eve = s.person('sFeve')
    const flour = s.say(alice, 'thing', { kind: 'flour' })
    const UNTIL = '2027-12-31T00:00:00.000Z'
    s.say(alice, 'grant', { kind: 'operator' }, { to: bot.id })
    // parties: a grant to deal with bob alone binds alice to no one else (grants/t1)
    const withBob = s.say(alice, 'grant', { kind: 'errands', scope: { acts: ['promise', 'transfer'], parties: [bob.id], limit: M(100000), until: UNTIL } }, { to: bot.id })
    const toEve = s.say(bot, 'promise', { terms: { price: M(500), expires: DAY } }, { from: alice.id, to: eve.id, what: flour.hash, under: withBob.hash })
    answer(s, eve, toEve, { status: 'accepted' })
    stage('F: an offer under a grant whose parties do not name the other side binds no one: a quote request (grants/t1)', toEve, s.held, { stage: 'offered', accept: null })
    door('F: and the door says the same: it is outside the grant\'s parties', 'under_ok', [toEve, s.held], { expect: false, exact: true })
    const toBob = s.say(bot, 'promise', { terms: { price: M(500), expires: DAY } }, { from: alice.id, to: bob.id, what: flour.hash, under: withBob.hash })
    const yes = answer(s, bob, toBob, { status: 'accepted' })
    stage('F: the same offer to a party the grant names binds alice', toBob, s.held, { stage: 'accepted', accept: yes.hash })
    // rule 23 in the fold: a grant that names the act but carries no limit binds no one by an act that cannot be undone (grants/t3)
    const noLimit = s.say(alice, 'grant', { kind: 'errands', scope: { acts: ['promise', 'transfer'], until: UNTIL } }, { to: bot.id })
    const big = s.say(bot, 'promise', { terms: { price: M(99999999), expires: DAY } }, { from: alice.id, to: eve.id, what: flour.hash, under: noLimit.hash })
    answer(s, eve, big, { status: 'accepted' })
    stage('F: an offer under a grant with no limit, no trusted schema and no ask binds no one (grants/t3: rule 23 is the fold\'s too)', big, s.held, { stage: 'offered', accept: null })
    const sack = s.say(alice, 'thing', { kind: 'flour', lot: 'F1' }, { of: flour.hash })
    const away = s.say(bot, 'transfer', {}, { what: sack.hash, to_owner: eve.id, under: noLimit.hash })
    s.say(eve, 'transfer', { status: 'accepted' }, { answers: away.hash })
    door('F: nor does a transfer under it move alice\'s goods (grants/t3)', 'ownership', [sack, s.held], { expect: { owner: alice.id, transfers: [], conflict: null } })
    // one ask backs one act (grants/t4)
    const ask = s.say(bot, 'promise', { what: 'transfer', terms: { expires: DAY } }, { from: bot.id, to: alice.id, under: noLimit.hash })
    answer(s, alice, ask, { status: 'accepted' })
    const one = s.say(alice, 'thing', { kind: 'flour', lot: 'F2' }, { of: flour.hash }), two = s.say(alice, 'thing', { kind: 'flour', lot: 'F3' }, { of: flour.hash })
    const first = s.say(bot, 'transfer', {}, { what: one.hash, to_owner: bob.id, under: noLimit.hash, for: ask.hash })
    const second = s.say(bot, 'transfer', {}, { what: two.hash, to_owner: bob.id, under: noLimit.hash, for: ask.hash }, { after: [first.hash] })
    door('F: the transfer an accepted ask names is backed by it', 'under_ok', [first, s.held], { expect: true, exact: true })
    door('F: a second transfer naming the same ask is not: one yes backs one act (grants/t4)', 'under_ok', [second, s.held], { expect: false, exact: true })
    // a stop outside the grant's acts stops nothing of the principal's (grants/t5)
    const look = s.say(alice, 'grant', { kind: 'errands', scope: { acts: ['observe'], until: UNTIL } }, { to: bot.id })
    const offer = s.say(alice, 'promise', { terms: { price: M(700), expires: DAY } }, { from: alice.id, to: bob.id, what: flour.hash })
    const halt = s.say(bot, 'promise', { status: 'stopped', stop: 'before' }, { updates: offer.hash, for: offer.hash, under: look.hash })
    const take = answer(s, bob, offer, { status: 'accepted' }, { after: [halt.hash] })
    stage('F: an agent whose grant names only observe stops none of the principal\'s offers (grants/t5)', offer, s.held, { stage: 'accepted', accept: take.hash })
    // acts are matched exactly: promise.deposit covers a promise of kind deposit, never an accept of no kind (agents/t10: core and oracle agreed on it)
    const deposit = s.say(alice, 'grant', { kind: 'errands', scope: { acts: ['promise.deposit'], limit: M(100000), until: UNTIL } }, { to: bot.id })
    const quote = s.say(bob, 'promise', { terms: { price: M(300), expires: DAY } }, { from: bob.id, to: alice.id, what: flour.hash })
    answer(s, bot, quote, { status: 'accepted' }, { under: deposit.hash })
    stage('F: an agent\'s accept of no kind under a grant for promise.deposit binds no one (agents/t10)', quote, s.held, { stage: 'offered', accept: null })
  }

  // G. The promise fold trusts only signed acts by the right side (promises/t1 to t16).
  {
    const s = story(), sel = s.person('sGsel'), buy = s.person('sGbuy'), eve = s.person('sGeve'), ref = s.person('sGref')
    const eggs = s.say(sel, 'thing', { kind: 'eggs' })
    const tray = (lot) => s.say(sel, 'thing', { kind: 'eggs', lot, pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
    const deal = (extra = {}, refs = {}) => {
      const p = s.say(sel, 'promise', { terms: { price: M(500), quantity: fb.amount('1', '{tray}'), expires: DAY, ...extra } }, { from: sel.id, to: buy.id, what: eggs.hash, ...refs })
      const a = answer(s, buy, p, { status: 'accepted' })
      return { p, a }
    }
    const deliver = (p, t, receiver = buy, extra = {}) => { const g = s.say(sel, 'transfer', {}, { what: t.hash, to_owner: receiver.id, for: p.hash, ...extra }); s.say(receiver, 'transfer', { status: 'accepted' }, { answers: g.hash, for: p.hash }); return g }
    const pay = (p, by = buy, to = sel, minor = 500) => { const m = s.say(by, 'transfer', { money: M(minor) }, { to_owner: to.id, for: p.hash }); s.say(to, 'transfer', { status: 'accepted' }, { answers: m.hash, for: p.hash }); return m }
    // positivity (promises/t1, t8, t13; P10): money and what a promise or a transfer moves is never below zero
    check('G: a split part below zero is refused (promises/t1: one payment paid two promises by a part of -100)', { type: 'transfer', state: { money: M(100), split: [{ for: ID, money: M(100) }, { for: '2'.repeat(64), money: M(-100) }] }, refs: { to_owner: AUTH, for: [ID, '2'.repeat(64)] } }, ['shape'])
    check('G: a payment below zero is refused (promises/t13: a seller wiped a payment with one)', { type: 'transfer', state: { money: M(-100) }, refs: { to_owner: AUTH, for: ID } }, ['shape'])
    check('G: an allocation of a quantity below zero is refused (promises/t8: it freed capacity)', { type: 'promise', state: { status: 'accepted', terms: { quantity: fb.amount('-1000', 'kg') } }, refs: { answers: ID, for: ID } }, ['shape'])
    check('G: a price below zero is refused', { type: 'promise', state: { terms: { price: M(-5), expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
    check('G: a transfer of an amount below zero is refused', { type: 'transfer', state: { amount: fb.amount('-2', 'kg') }, refs: { what: ID, to_owner: ID } }, ['shape'])
    check('G: a reading below zero is still a reading: an observe may say -18 degrees', { type: 'observe', state: { kind: 'temperature', amount: fb.amount('-18', 'Cel') }, refs: {} }, [])
    // signed by the right side (promises/t3, t13; round 2 R2-01d)
    const d1 = deal(); deliver(d1.p, tray('G1')); pay(d1.p)
    stage('G: delivered and paid: done', d1.p, s.held, { stage: 'done' })
    const forged = s.say(buy, 'transfer', { money: M(500) }, { to_owner: buy.id, for: d1.p.hash })
    s.say(buy, 'transfer', { status: 'accepted' }, { answers: forged.hash, for: d1.p.hash })
    stage('G: the buyer\'s money to himself is no refund: a refund speaks for the from side (promises/t3)', d1.p, s.held, { stage: 'done' })
    const d2 = deal(); deliver(d2.p, tray('G2')); const m2 = pay(d2.p)
    s.say(buy, 'observe', { kind: 'complaint', text: 'take it back' }, { defeats: m2.hash, for: d2.p.hash })
    stage('G: the payer defeats his own accepted payment: it still counts (promises/t13: a side never defeats its own act)', d2.p, s.held, { stage: 'done' })
    const d3 = deal(); const g3 = deliver(d3.p, tray('G3')); pay(d3.p)
    s.say(sel, 'observe', { kind: 'complaint', text: 'not mine to give' }, { defeats: g3.hash, for: d3.p.hash })
    stage('G: the giver defeats his own delivery: it still counts (twin of "defeats: the giver defeats his own delivery")', d3.p, s.held, { stage: 'done' })
    const d4 = deal(); const g4 = deliver(d4.p, tray('G4')); pay(d4.p)
    s.say(buy, 'observe', { kind: 'complaint', text: 'cracked' }, { defeats: g4.hash, for: d4.p.hash })
    stage('G: the receiver\'s defeats of a delivery it accepted is a dispute: it still counts, done, the dispute shown (batch 2 P4)', d4.p, s.held, { stage: 'done', disputed: [{ of: g4.hash, by: 'to' }] })
    const d5 = deal(); deliver(d5.p, tray('G5'))
    const own = s.say(sel, 'transfer', { money: M(500) }, { to_owner: sel.id, for: d5.p.hash })
    s.say(sel, 'transfer', { status: 'accepted' }, { answers: own.hash, for: d5.p.hash })
    stage('G: a seller paying himself pays nothing: a payment speaks for the to side (twin of round 2 R2-01d)', d5.p, s.held, { stage: 'underway', paid: null })
    // join only a deal it names in for (promises/t2)
    const d6 = deal(), d7 = deal()
    const across = s.say(buy, 'transfer', { money: M(500) }, { to_owner: sel.id, for: d6.p.hash, updates: d7.a.hash })
    s.say(sel, 'transfer', { status: 'accepted' }, { answers: across.hash, for: d6.p.hash })
    stage('G: a payment for one deal that updates a block of another pays that other nothing (promises/t2)', d7.p, s.held, { stage: 'accepted', paid: null })
    stage('G: it pays the deal it names', d6.p, s.held, { stage: 'underway', paid: { minor: 500 } })
    // the bound offer's schema, not the root's (promises/t4)
    const puppet = s.person('sGpup')
    const theirs = s.say(buy, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [puppet.id] } })
    const want = s.say(buy, 'promise', { terms: { price: M(100), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: sel.id, to: buy.id, what: eggs.hash, schema: theirs.hash })
    const counter = s.say(sel, 'promise', { terms: { price: M(150), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { answers: want.hash, for: want.hash, from: sel.id, to: buy.id })
    answer(s, buy, counter, { status: 'accepted' }, { for: want.hash })
    const unpaid = s.say(buy, 'transfer', { money: M(150) }, { to_owner: sel.id, for: want.hash })
    s.say(puppet, 'observe', { kind: 'check', text: 'paid' }, { confirms: unpaid.hash, for: want.hash })
    stage('G: a confirmer named only in a schema the counter left out confirms nothing (promises/t4)', want, s.held, { stage: 'accepted', paid: null })
    // goods: of the line's kind, the giver's own, once (promises/t10, t15)
    const order = deal({ quantity: fb.amount('3', '{tray}') })
    const same = tray('G7')
    deliver(order.p, same); deliver(order.p, same); deliver(order.p, same)
    stage('G: one tray delivered three times moves one tray (promises/t10 a)', order.p, s.held, { stage: 'underway', lines: [{ needed: 3, moved: 1 }] })
    const other = s.person('sGother')
    const theirTray = s.say(other, 'thing', { kind: 'eggs', lot: 'X', pack: fb.amount('3', '{tray}') }, { of: eggs.hash })
    const o2 = deal({ quantity: fb.amount('3', '{tray}') })
    deliver(o2.p, theirTray)
    stage('G: a tray someone else owns settles nothing (promises/t10 b)', o2.p, s.held, { stage: 'accepted' })
    const o3 = deal({ quantity: fb.amount('1', '{tray}') })
    const lent = s.say(sel, 'transfer', {}, { what: tray('G8').hash, to_holder: buy.id, for: o3.p.hash })
    s.say(buy, 'transfer', { status: 'accepted' }, { answers: lent.hash, for: o3.p.hash })
    stage('G: a loan (to_holder) settles no sale (promises/t10 c)', o3.p, s.held, { stage: 'accepted' })
    const pebble = s.say(sel, 'thing', { kind: 'pebble', pack: fb.amount('1', '{tray}') })
    const o4 = deal({ quantity: fb.amount('1', '{tray}') })
    deliver(o4.p, pebble)
    stage('G: a thing not of the line\'s kind settles nothing (promises/t10 d)', o4.p, s.held, { stage: 'accepted' })
    const o5 = deal(); pay(o5.p)
    s.say(sel, 'transfer', { count: 1 }, { what: tray('G9').hash, for: o5.p.hash })
    stage('G: on a deal with a named receiver, the seller\'s count alone delivers nothing (promises/t15)', o5.p, s.held, { stage: 'underway', paid: { minor: 500 } })
    // an accept never adds a quantity (promises/t12)
    const flat = s.say(sel, 'promise', { terms: { price: M(500), expires: DAY } }, { from: sel.id, to: buy.id, what: eggs.hash })
    answer(s, buy, flat, { status: 'accepted', terms: { quantity: fb.amount('1000', 'kg') } })
    stage('G: an accept that names a quantity the offer did not have binds nothing (promises/t12)', flat, s.held, { stage: 'offered', accept: null })
    // one request is allocated once (promises/t8)
    const O = s.say(sel, 'promise', { terms: { price: { money: M(200), per: fb.amount('1', 'kg') }, quantity: fb.amount('20', 'kg'), expires: DAY } }, { from: sel.id, what: eggs.hash })
    const req = answer(s, buy, O, { status: 'accepted', terms: { quantity: fb.amount('5', 'kg') } })
    const al1 = answer(s, sel, req, { status: 'accepted' }, { for: O.hash })
    answer(s, sel, req, { status: 'accepted' }, { for: O.hash, after: [al1.hash] })
    stage('G: three allocations of one request bind one taker, once (promises/t8)', O, s.held, { stage: 'accepted', takers: [{ allocation: al1.hash, quantity: { value: '5', unit: 'kg' } }], quantity: { value: '5', unit: 'kg' } })
    // the referee twins: the tray is of the line's kind
    const rules = s.say(sel, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [ref.id] } })
    const r1 = deal({}, { schema: rules.hash }); const rg = deliver(r1.p, tray('R1')); pay(r1.p)
    stage('G: referee: a delivery of the line\'s kind the receiver accepted settles the deal', r1.p, s.held, { stage: 'done' })
    const no = s.say(buy, 'observe', { kind: 'dispute' }, { defeats: rg.hash, for: r1.p.hash })
    stage('G: referee: the receiver disputes it, the referee silent: it still settles (batch 2 P4)', r1.p, s.held, { stage: 'done', disputed: [{ hash: no.hash, of: rg.hash, by: 'to' }] })
    s.say(ref, 'observe', { kind: 'ruling' }, { confirms: rg.hash }, { after: [no.hash] })
    stage('G: referee: the referee confirms it: its word is the last, the delivery stands', r1.p, s.held, { stage: 'done' })
    const r2 = deal({}, { schema: rules.hash }); const rg2 = deliver(r2.p, tray('R2')); pay(r2.p)
    const out = s.say(ref, 'observe', { kind: 'ruling' }, { defeats: rg2.hash })
    stage('G: referee: a delivery the referee defeats counts for nothing', r2.p, s.held, { stage: 'underway' })
    s.say(ref, 'observe', { kind: 'ruling' }, { confirms: rg2.hash }, { after: [out.hash] })
    stage('G: referee: its later confirm, seeing its own defeat, restores it', r2.p, s.held, { stage: 'done' })
    const loose = { p: s.say(sel, 'promise', { terms: { quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: sel.id, to: buy.id, what: eggs.hash, schema: rules.hash }) }
    answer(s, buy, loose.p, { status: 'accepted' })
    const bare = s.say(sel, 'thing', { kind: 'eggs', pack: fb.amount('1', '{tray}') })
    deliver(loose.p, bare)
    stage('G: referee: a tray that names no kind (no refs.of) is not of the line\'s eggs: it settles nothing', loose.p, s.held, { stage: 'accepted' })
  }
  // G. A bearer note: the holder where each block stands (promises/t16), and the twins of the bearer vectors the rule flipped.
  {
    const s = story(), lena = s.person('sGlena'), bo = s.person('sGbo'), cy = s.person('sGcy')
    const coffee = s.say(lena, 'thing', { kind: 'coffee' })
    const note = s.say(lena, 'thing', { kind: 'note', name: 'one coffee' })
    const promise = s.say(lena, 'promise', { terms: { quantity: fb.amount('1', '{cup}'), expires: LATER } }, { from: lena.id, to: note.hash, what: coffee.hash })
    const pass = (from, to) => { const t = s.say(from, 'transfer', {}, { what: note.hash, to_owner: to.id }); return s.say(to, 'transfer', { status: 'accepted' }, { answers: t.hash }) }
    pass(lena, bo)
    const boAccept = answer(s, bo, promise, { status: 'accepted' })
    pass(bo, cy)
    stage('G: bearer: the note passed on keeps the accept its holder signed while she held it: the deal stays bound', promise, s.held, { stage: 'accepted', accept: boAccept.hash })
    answer(s, cy, promise, { status: 'accepted' })
    stage('G: bearer: the new holder\'s accept binds nothing more: the first binding accept stands', promise, s.held, { stage: 'accepted', accept: boAccept.hash })
    const cup = s.say(lena, 'thing', { kind: 'coffee', lot: 'C1', pack: fb.amount('1', '{cup}') }, { of: coffee.hash })
    const handed = s.say(lena, 'transfer', {}, { what: cup.hash, to_owner: cy.id, for: promise.hash })
    s.say(cy, 'transfer', { status: 'accepted' }, { answers: handed.hash, for: promise.hash })
    stage('G: bearer: what is owed goes to whoever holds the note where she accepts it: done', promise, s.held, { stage: 'done' })
    const dan = s.person('sGdan')
    pass(cy, dan)
    answer(s, dan, promise, { status: 'accepted' })
    stage('G: bearer: the used note passed on reopens nothing: still done, bound by the first accept (promises/t16: no double redeem)', promise, s.held, { stage: 'done', accept: boAccept.hash })
  }
  // G. An accept binds the offer live where it stands: the accepter's counter on a second key, unseen by the accept, takes nothing back (promises/t5).
  {
    const s = story(), sel = s.person('sG5sel'), buy = s.person('sG5buy')
    const eggs = s.say(sel, 'thing', { kind: 'eggs' })
    // a second device key of the buyer, brought in before anything else
    const dev = s.keep(fb.identity.keyGrant(buy.id, keyOf('sG5dev').public_key_sign, { private_key: keyOf('sG5buy').private_key, last: null, broughtIn: buy.id }, { at: at() }))
    const p = s.say(sel, 'promise', { terms: { price: M(100), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: sel.id, to: buy.id, what: eggs.hash })
    const a = answer(s, buy, p, { status: 'accepted' })
    const t = s.say(sel, 'thing', { kind: 'eggs', lot: 'T5', pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
    const give = s.say(sel, 'transfer', {}, { what: t.hash, to_owner: buy.id, for: p.hash })
    s.say(buy, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
    const m = s.say(buy, 'transfer', { money: M(100) }, { to_owner: sel.id, for: p.hash })
    s.say(sel, 'transfer', { status: 'accepted' }, { answers: m.hash, for: p.hash })
    stage('G: paid and delivered: done', p, s.held, { stage: 'done', accept: a.hash })
    // on the second key the buyer counters at 1, its causal past holding only the offer: it does not see his own accept
    s.keep(fb.write('promise', { terms: { price: M(1), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { answers: p.hash, for: p.hash, from: sel.id, to: buy.id }, { author: buy.id, key: keyOf('sG5dev'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: dev.hash }, after: [p.hash] }))
    stage('G: the accepter\'s counter on another key, not seeing his accept, takes nothing back: still done (promises/t5)', p, s.held, { stage: 'done', accept: a.hash })
  }
  // the M5 fork stories whose trays named no kind, twinned with trays of the line's kind
  {
    const forkOf = (s, who, of, type, state, refs, after) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held: s.held, at: at(), audience: 'public', after, link: { seq: of.state.seq, prev: of.refs.prev } }))
    const next = (s, who, prev, type, state, refs, after) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held: s.held, at: at(), audience: 'public', after, link: { seq: prev.state.seq + 1, prev: prev.hash } }))
    const s = story(), ann = s.person('sGFa'), bob = s.person('sGFb'), eggs = s.say(ann, 'thing', { kind: 'eggs' })
    const p = s.say(ann, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    answer(s, bob, p, { status: 'accepted' })
    const tray = s.say(ann, 'thing', { kind: 'eggs', pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
    const give = s.say(ann, 'transfer', {}, { what: tray.hash, to_owner: bob.id, for: p.hash })
    const got = s.say(bob, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
    forkOf(s, bob, got, 'promise', { status: 'stopped', stop: 'onward' }, { answers: p.hash, for: p.hash }, [p.hash])
    stage('G: fork: the receiver who took a tray of the eggs and forked with a stop is still bound: underway, unpaid', p, s.held, { stage: 'underway', stop: null, paid: null })
    const s2 = story(), c = s2.person('sGFc'), d = s2.person('sGFd'), x = s2.say(c, 'thing', { kind: 'x' })
    const q = s2.say(c, 'promise', { terms: { price: M(450), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: c.id, to: d.id, what: x.hash })
    answer(s2, d, q, { status: 'accepted' })
    const box = s2.say(c, 'thing', { kind: 'x', pack: fb.amount('1', '{tray}') }, { of: x.hash })
    const giv = s2.say(c, 'transfer', {}, { what: box.hash, to_owner: d.id, for: q.hash })
    const ok = s2.say(d, 'transfer', { status: 'accepted' }, { answers: giv.hash, for: q.hash })
    const twin = forkOf(s2, d, ok, 'observe', { kind: 'note', text: 'a twin' }, {})
    next(s2, d, twin, 'observe', { kind: 'dispute' }, { defeats: giv.hash, for: q.hash })
    stage('G: fork: the receiver\'s defeats signed after a fork of its key frees it of nothing: the delivery of the line\'s kind stands', q, s2.held, { stage: 'underway' })
  }
  // the round 2 finding the payment rule flipped (R2-01d), pinned by hand under its new reading
  {
    const r = JSON.parse(fs.readFileSync(path.join(FINDINGS, 'R2-01d-refund-to-stranger-by-payer.json'), 'utf8'))
    const c = r.calls[0]
    door('G: round 2 R2-01d: the from side paying itself pays nothing, and money to a stranger refunds nothing: accepted', c.op, c.args, { expect: { stage: 'accepted', paid: null } })
  }
}

// ---- 21. Security: the FFI's 64-bit reads, the node's wire and the sealed chain (Patrick's decisions P1 J and K, 2026-10-28;
// security20/SYNTHESIS.md) ----
// Each fix has a negative vector built from the security repro that broke it (scratchpad/security20/<lens>/<repro>).
{
  // J. A 32-bit reader (WebAssembly: JavaScript and Go) reads a length, a count or a table position as the 64-bit number it is written
  // as, so it refuses what a 64-bit reader (Swift, Python, Kotlin, C) refuses (ffi/cbor_trunc, ffi/cbor_keys).
  {
    const kp = keyOf('sJcbor')
    const blk = call('create', 'thing', { kind: 'x', name: 'a' }, {})
    blk.signature = call('sign', blk, kp.private_key)
    const long = call('cbor_encode', blk, false), short = call('cbor_encode', blk, true)
    const crafted = [
      ['J: a text length written 2^32 + 5 in an 8-byte head is that long, never 5 (ffi/cbor_trunc)', long, '6574' + '68696e67', '7b0000000100000005' + '7468696e67'],
      ['J: a map count written 2^32 + 3 in an 8-byte head is that many, never 3 (ffi/cbor_trunc)', long, 'a36472656673a0', 'bb0000000100000003' + '6472656673a0'],
      ['J: a key table position written 2^32 + 7 is no key, never key 7 (ffi/cbor_keys)', short, 'a207617817', 'a21b0000000100000007617817'],
    ]
    for (const [name, hex, from, to] of crafted) {
      const cbor = hex.replace(from, to)
      assert.notEqual(cbor, hex, name + ': crafted')
      let refused = false
      try { call('cbor_decode', cbor) } catch { refused = true }
      assert.ok(refused, name + ': the WebAssembly core refuses it')
      V.cbor.refused = V.cbor.refused.filter((r) => r.name !== name)
      V.cbor.refused.push({ name, cbor })
      made.add('cbor refused: ' + name)
    }
    // the Merkle check reads the signed count and the index as 64-bit numbers (ffi/merkle_trunc)
    const root = call('merkle_root', ['6162'])
    const chunks = (n) => ({ type: 'thing', state: { kind: 'x', marks: [{ scheme: 'merkle', value: root }], chunks: n }, refs: {} })
    door('J: merkle: one chunk under its root, honest', 'merkle_verify', [chunks(1), '6162', 0, []], { expect: true, exact: true })
    door('J: merkle: a signed count of 2^32 + 1 is not a one-chunk tree on any reader (ffi/merkle_trunc)', 'merkle_verify', [chunks(4294967297), '6162', 0, []], { expect: false, exact: true })
    door('J: merkle: index 2^32 is not index 0 (ffi/merkle_trunc)', 'merkle_verify', [chunks(1), '6162', 4294967296, []], { expect: false, exact: true })
    door('J: merkle: nor under a count of 2^32 + 1', 'merkle_verify', [chunks(4294967297), '6162', 4294967296, []], { expect: false, exact: true })
    // a wrong argument is an error, never read as a default (ffi F9)
    refusedArg('J: add_duration: a sign that is not a whole number is an argument error, never 1', 'add_duration', ['2026-10-28T00:00:00.000Z', 'P1D', 'x'])
    door('J: add_duration: no sign is 1', 'add_duration', ['2026-10-28T00:00:00.000Z', 'P1D', null], { expect: '2026-10-29T00:00:00.000Z', exact: true })
    refusedArg('J: waited_too_long: a time to wait that is not milliseconds is an argument error, never 0', 'waited_too_long', ['2026-10-28T00:00:00.000Z', '2026-10-28T00:00:01.000Z', 'soon'])
    door('J: pull_request: a request that is not an object asks for everything from the start (ffi F8: it had stopped the core)', 'pull_request', [true], { expect: { since: 0 }, exact: true })
  }

  // K. The node's wire.
  {
    // a push is read from its bytes: a repeated key refuses the push; a block's float is refused where it was written (canonical/node_text)
    const s = story(), ann = s.person('sKwire')
    const note = s.say(ann, 'observe', { kind: 'eggs', text: 'two trays' })
    const text = JSON.stringify({ messages: [call('wrap', note)], for: {} })
    door('K: strict_push: a push as its author wrote it: no finding', 'strict_push', [text], { expect: [[]], exact: true })
    const floaty = text.replace(`"seq":${note.state.seq}`, `"seq":${note.state.seq}.0`)
    assert.notEqual(floaty, text)
    door('K: strict_push: a seq written 1.0 by a relay is a float, never normalised to 1 (canonical/node_text)', 'strict_push', [floaty], { expect: [[{ code: 'float' }]] })
    const twice = text.replace('"kind":"eggs"', '"kind":"JUNK","kind":"eggs"')
    assert.notEqual(twice, text)
    refusedArg('K: strict_push: a repeated key anywhere refuses the whole push (canonical/node_text)', 'strict_push', [twice])
    refusedArg('K: strict_push: text that is not a push is an argument error', 'strict_push', ['{"messages":'])

    // a private block held in the clear answers no filter on its content: only its public header (privacy/r6, door/t3)
    const bo = s.person('sKbo'), carol = s.person('sKcarol'), node = s.person('sKnode')
    const complaint = s.say(ann, 'observe', { kind: 'complaint', text: 'about Carol' }, { subject: carol.id }, { audience: [bo.id] })
    const log = [{ n: 1, block: complaint }]
    const pull = (filter) => [log, { since: 0, filter }, node.id, keyOf('sKnode').private_key, 500, null, null, 'std']
    for (const [what, filter] of [['its kind', { kind: 'complaint' }], ['whom it names', { refs: { subject: carol.id } }], ['its type', { type: 'observe' }]]) {
      door(`K: answer_pull: a filter on a private block's ${what} finds nothing (privacy/r6: a membership oracle on who a complaint is about)`, 'answer_pull', pull(filter), { expect: { blocks: [] } })
    }
    door('K: answer_pull: its public header answers a filter on its author, and only the header travels', 'answer_pull', pull({ author: ann.id }), { expect: { blocks: [{ n: 1, message: { header: { author: ann.id, hash: complaint.hash } } }] } })

    // a block after a sealed one follows it in the key's chain: one sealed block never freezes the public chain (privacy/r7)
    const t = story(), al = t.person('sKseal'), b2 = t.person('sKseal2')
    const secret = t.say(al, 'observe', { kind: 'note', text: 's1' }, {}, { audience: [b2.id] })
    const { salts, ...bare } = secret
    // the envelope is random; only the signed public header (which is not) goes in the file
    const message = fb.sealCopy(bare, { keys: [fb.generateEncryptionKeypair().public_key_encrypt], reveals: [], privateKey: keyOf('sKseal').private_key })
    const headerOnly = { version: message.version, header: message.header, header_signature: message.header_signature }
    const pub = t.say(al, 'observe', { kind: 'note', text: 'public again' })
    door('K: accept: a public block whose prev is a sealed block held by its header alone is taken (privacy/r7: it was refused chain)', 'accept', [[pub], [al.g, headerOnly], null, null], { expect: { taken: [pub.hash], waiting: [], refused: [], equivocations: [] } })
    const rot = t.keep(fb.identity.keyGrant(al.id, fb.keypairFromSeed(sha('sKseal rotated')).public_key_sign, { private_key: keyOf('sKseal').private_key, last: pub, broughtIn: al.id }, { replaces: keyOf('sKseal').public_key_sign, countedTo: pub.hash, at: at() }))
    door('K: accept: a rotation after a public block after a sealed one is taken: a stolen key can still be rotated out', 'accept', [[rot], [al.g, headerOnly, pub], null, null], { expect: { taken: [rot.hash], refused: [] } })

    // a body beats a false header: a stranger's header claiming a block's hash is read as never held once the block arrives (forks/f13)
    const u = story(), vic = u.person('sKvic'), mal = u.person('sKmal')
    const v = u.say(vic, 'observe', { kind: 'note', text: 'the delivery was accepted' }), v2 = u.say(vic, 'observe', { kind: 'note', text: 'and after' })
    const m1 = u.say(mal, 'observe', { kind: 'note', text: 'm1' })
    const header = { ...call('header', m1), hash: v.hash }
    const squat = { version: fb.PROTOCOL.version, header, header_signature: call('sign_message', header, keyOf('sKmal').private_key).signature }
    door('K: accept_sealed: a stranger\'s header claiming a hash not held is taken (no node can check a sealed hash)', 'accept_sealed', [[squat], [vic.g, mal.g], null], { expect: { taken: [v.hash] } })
    door('K: accept: the block under that hash, and the block after it, are taken; the header is false (forks/f13: the block had been dropped)', 'accept', [[v, v2], [vic.g, mal.g, squat], null, null], { expect: { taken: [v.hash, v2.hash], refused: [], false_headers: [v.hash] } })
    door('K: accept: a body for its own honest header is the other half: taken, and no header is false', 'accept', [[pub], [al.g, headerOnly], null, null], { expect: { false_headers: [] } })
  }
}

// ---- 22. Batch 2: lock only the words; facts, never verdicts; disputes; the founder an ordinary member; death ends authority; pay_by;
// schemas may add terms; the payee's word; agents' first contact is each node's rule (Patrick's decisions P2 to P11 and the plain-words
// rounds, 2026-10-28), and the technical calls (no orderer, CBOR table 1 reordered, the check before pure functions, circle_key at epoch 0) ----
{
  const ID = '0'.repeat(64)
  const checkWith = (name, block, codes, schemas) => {
    const b = { type: block.type, state: { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', ...block.state }, refs: { prev: AUTH, ...block.refs, author: AUTH } }
    const got = [...new Set(call('refusals', b.type, b.state, b.refs, [], schemas).map((r) => r.code))]
    assert.deepEqual(got, codes, `${name}: ${JSON.stringify(got)}`)
    made.add(name)
    V.door = V.door.filter((c) => c.name !== name)
    V.door.push({ name, op: 'refusals', args: JSON.parse(JSON.stringify([b.type, b.state, b.refs, [], schemas])), codes })
  }

  // P3, P9: the base schemas, published again: no kept_* schema ships, and the schema schema names the terms a schema may add. Every id after
  // the first changed (nothing is locked yet, P2); each is checked as phase 2 checked it.
  {
    const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../spec/schemas/published.json'), 'utf8'))
    assert.ok(!P.order.includes('kept_promises') && !P.order.includes('kept_and_broken'))
    const pub = P.publisher.public_key_sign
    for (const name of P.order) {
      const b = P.schemas[name]
      door(`base schema ${name}: its id is the hash of its bytes`, 'hash', [b.type, b.state, b.refs], { expect: b.hash, exact: true })
      door(`base schema ${name}: the publisher's signature opens`, 'verify', [{ type: b.type, state: b.state, refs: b.refs }, b.signature, pub], { expect: true, exact: true })
    }
    const chain = [P.genesis, ...P.order.map((n) => P.schemas[n])]
    door('base schemas: the first schema is valid after the publisher\'s genesis', 'valid', [chain[1], [chain[0]], null], { expect: [], exact: true })
    door('base schemas: the last schema is valid with the whole chain behind it', 'valid', [chain[chain.length - 1], chain.slice(0, -1), null], { expect: [], exact: true })
    assert.ok(P.schemas.schema.state.fields.terms, 'the schema schema names terms')
    const S = P.schemas, GBP = (minor) => ({ minor, currency: 'GBP' }), author = 'a'.repeat(64), other = 'b'.repeat(64)
    const refsOf = (schema) => ({ author, prev: author, from: author, to: other, ...(schema ? { schema: S[schema].hash } : {}) })
    const loanState = (extra = {}) => ({ seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'loan of 100 GBP', principal: GBP(10000), terms: { price: GBP(11000), expires: '2026-12-31T00:00:00.000Z' }, ...extra })
    const closed = (name, state, refs, schemas, want) => {
      assert.deepEqual([...new Set(call('refusals', 'promise', state, refs, [], schemas).map((r) => r.code))], want, name)
      door(name, 'refusals', ['promise', state, refs, [], schemas], want.length ? { expect: want.map((code) => ({ code })) } : { expect: [], exact: true })
    }
    closed('base schema loan: a promise names it and carries principal: nothing to refuse', loanState(), refsOf('loan'), [S.loan], [])
    closed('base schema loan: principal without the schema is not a field of a promise', loanState(), refsOf(null), [], ['undeclared_field'])
    closed('base schema loan: a field the schema does not declare is refused', loanState({ colour: 'red' }), refsOf('loan'), [S.loan], ['undeclared_field'])
    closed('base schema loan: the schema must be held to be read', loanState(), refsOf('loan'), [], ['undeclared_ref'])
    closed('base schema teach: a promise that names it carries no extra field', { seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'teach sourdough', terms: { quantity: { value: '2', unit: 'h' }, expires: '2026-12-31T00:00:00.000Z' } }, refsOf('teach'), [S.teach], [])
  }

  // The CBOR key table 1, reordered (technical call: the dead keys if_wrong and settled_by, and confidence and orderer, are out; covers is in):
  // every compact case is written again from its block, and each still decodes to the same block and id
  {
    const signedOf = (c) => ({ hash: c.hash, ...c.block, signature: c.signature })
    for (const c of V.cbor.cases) {
      const signed = signedOf(c)
      const text = fb.cbor.encode(signed), short = fb.cbor.encode(signed, { short: true })
      for (const bytes of [text, short]) { const back = fb.cbor.decode(bytes); assert.deepEqual(back, signed); assert.equal(fb.hash(back.type, back.state, back.refs), c.hash) }
      c.cbor = Buffer.from(text).toString('hex'); c.cbor_short = Buffer.from(short).toString('hex')
    }
    const byHash = Object.fromEntries(V.cbor.cases.map((c) => [c.hash, c]))
    const members = V.cbor.push.hashes.map((h) => { const c = byHash[h]; return { hash: c.hash, type: c.block.type, state: c.block.state, refs: c.block.refs, signature: c.signature } })
    V.cbor.push.cbor = Buffer.from(fb.cbor.encodePush(members)).toString('hex')
    V.cbor.push.cbor_short = Buffer.from(fb.cbor.encodePush(members, { short: true })).toString('hex')
    assert.deepEqual(fb.cbor.decodePush(fb.cbor.encodePush(members, { short: true })), members)
    for (const h of V.cbor.headers) { h.cbor = Buffer.from(fb.cbor.encodeHeader(h.header)).toString('hex'); h.cbor_short = Buffer.from(fb.cbor.encodeHeader(h.header, { short: true })).toString('hex') }
    const keys = fb.PROTOCOL.cbor.keys
    for (const gone of ['if_wrong', 'settled_by', 'confidence', 'orderer']) assert.ok(!keys.includes(gone), gone)
    assert.ok(keys.includes('pay_by') && keys.includes('covers'))
  }

  // P4: a side's defeats is a dispute, shown, never a verdict (the twins of the 1.6 refine cases "defeats: ...")
  {
    const s = story(), pat = s.person('b2Dpat'), lena = s.person('b2Dlena'), judge = s.person('b2Djudge'), eve = s.person('b2Deve')
    const eggs = s.say(pat, 'thing', { kind: 'eggs' })
    const schema = s.say(pat, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'a tray of eggs reached the buyer', confirmers: [judge.id] } })
    let n = 0
    const deal = (withSchema) => {
      const offer = s.say(pat, 'promise', { terms: { price: M(500), quantity: fb.amount('1', '{tray}'), expires: DAY } }, { from: pat.id, to: lena.id, what: eggs.hash, ...(withSchema ? { schema: schema.hash } : {}) })
      answer(s, lena, offer, { status: 'accepted' })
      const tray = s.say(pat, 'thing', { kind: 'eggs', lot: 'B2D' + n++, pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
      const delivery = s.say(pat, 'transfer', {}, { what: tray.hash, to_owner: lena.id, for: offer.hash })
      s.say(lena, 'transfer', { status: 'accepted' }, { answers: delivery.hash, for: offer.hash })
      const payment = s.say(lena, 'transfer', { money: M(500) }, { to_owner: pat.id, for: offer.hash })
      s.say(pat, 'transfer', { status: 'accepted' }, { answers: payment.hash, for: offer.hash })
      return { offer, delivery, payment }
    }
    const defeat = (who, target, offer) => s.say(who, 'observe', { kind: 'complaint', text: 'not as agreed' }, { defeats: target.hash, for: offer.hash })
    const d1 = deal(false)
    const no1 = defeat(lena, d1.delivery, d1.offer)
    stage('batch 2 P4: the receiver defeats the delivery she accepted: a dispute, by her, on her date; the deal is still done', d1.offer, s.held, { stage: 'done', lines: [{ needed: 1, moved: 1 }], paid: { minor: 500 }, disputed: [{ hash: no1.hash, of: d1.delivery.hash, by: 'to', at: no1.state.at }] })
    const d2 = deal(false)
    defeat(eve, d2.delivery, d2.offer)
    stage('batch 2 P4: a stranger\'s defeats is no dispute: nothing is shown', d2.offer, s.held, { stage: 'done', disputed: [] })
    const d3 = deal(false)
    defeat(pat, d3.delivery, d3.offer)
    stage('batch 2 P4: the giver\'s defeats of his own delivery is no dispute (a side never disputes its own act)', d3.offer, s.held, { stage: 'done', disputed: [] })
    const d4 = deal(true)
    const out = defeat(judge, d4.delivery, d4.offer)
    stage('batch 2 P4: only the referee named in advance changes the stage: its defeats takes the delivery out', d4.offer, s.held, { stage: 'underway', disputed: [] })
    s.say(judge, 'observe', { kind: 'ruling', text: 'on second look, fine' }, { confirms: d4.delivery.hash, after: [out.hash] })
    stage('batch 2 P4: and its later confirms, seeing that defeats, puts it back', d4.offer, s.held, { stage: 'done' })
    const job = s.say(pat, 'promise', { what: 'teach bread', terms: { quantity: fb.amount('2', 'h'), expires: DAY } }, { from: pat.id, to: lena.id })
    s.say(lena, 'promise', { status: 'accepted' }, { answers: job.hash, for: job.hash, after: [job.hash] })
    const lesson = s.say(pat, 'observe', { kind: 'work', amount: fb.amount('2', 'h'), text: 'taught 2h' }, { for: job.hash })
    s.say(lena, 'observe', { status: 'accepted' }, { answers: lesson.hash, for: job.hash })
    const no2 = defeat(lena, lesson, job)
    stage('batch 2 P4: the learner defeats the lesson she accepted: a dispute; the work still counts and the job is done', job, s.held, { stage: 'done', disputed: [{ hash: no2.hash, of: lesson.hash, by: 'to' }] })
  }
  // P4: a refrain is breached only by the referee, or by its own signal condition holding at its until
  {
    const s = story(), farm = s.person('b2Sfarm'), mill = s.person('b2Smill'), lab = s.person('b2Slab'), eve = s.person('b2Seve')
    const spray = s.say(farm, 'thing', { kind: 'schema', name: 'synthetic pesticide' })
    const refrain = (until) => s.say(farm, 'promise', { terms: { refrain: true, until, expires: DAY, condition: { signal: 'residue', by: [lab.id], subject: spray.hash } } }, { from: farm.id, to: mill.id, what: spray.hash })
    const p1 = refrain(LATER)
    answer(s, mill, p1, { status: 'accepted' })
    s.say(eve, 'observe', { kind: 'residue', text: 'found it' }, { subject: spray.hash })
    stage('batch 2 P4: a signal from someone the condition does not name breaks nothing', p1, s.held, { stage: 'accepted' })
    s.say(lab, 'observe', { kind: 'residue', text: 'residue above the line' }, { subject: spray.hash }, { time: '2027-06-01T00:00:00.000Z' })
    stage('batch 2 P4: the refrain\'s own signal condition, signed by the lab both sides named, holds within the term: breached, from null', p1, s.held, { stage: 'breached', from: null })
    view('batch 2 P4: a refrain its signal breached is never done, whatever the clock', p1, s.held, AFTER, { stage: 'breached' })
    const p2 = refrain('2027-03-01T00:00:00.000Z')
    answer(s, mill, p2, { status: 'accepted' })
    stage('batch 2 P4: a signal signed after the refrain\'s until breaks nothing', p2, s.held, { stage: 'accepted' })
  }

  // P5: the founder is an ordinary member; each circle picks its removal rule at founding, and with none any holder of remove alone removes
  {
    const s = story(), dev = s.person('b2Cdev'), priya = s.person('b2Cpriya'), ana = s.person('b2Cana'), raj = s.person('b2Craj'), hr = s.person('b2Chr'), kim = s.person('b2Ckim')
    const roles = [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'staff', powers: ['sign'] }, { name: 'hr', powers: ['admit'] }]
    const cafe = s.say(dev, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Cafe', roles })
    door('batch 2 P5: the founding block is the founder\'s first member grant: the first role, the circle as the grant', 'circle_state', [cafe.hash, s.held], { expect: { members: { [dev.id]: { roles: ['owner'], grant: cafe.hash } }, removed: {} } })
    const sale = s.say(dev, 'grant', { kind: 'member', roles: ['owner'] }, { subject: cafe.hash, to: priya.id, as: cafe.hash })
    const yes = s.say(priya, 'grant', { status: 'accepted', kind: 'member' }, { answers: sale.hash, subject: cafe.hash })
    const left = s.say(dev, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: cafe.hash, subject: cafe.hash, after: [yes.hash] })
    door('batch 2 P5: a cafe is sold: the founder adds the buyer with every power, then leaves', 'circle_state', [cafe.hash, s.held], { expect: { members: { [priya.id]: { roles: ['owner'] } }, removed: { [dev.id]: null } } })
    door('batch 2 P5: the founder\'s word as the cafe after leaving speaks for no one', 'may_act_as', [s.say(dev, 'observe', { kind: 'note', text: 'still mine' }, { as: cafe.hash, after: [left.hash] }), cafe.hash, s.held, null], { expect: false, exact: true })
    // a co-op that chose no removal rule: any holder of remove alone removes anyone, the founder too
    const coop = s.say(ana, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Coop', roles })
    const ga = s.say(ana, 'grant', { kind: 'member', roles: ['owner'] }, { subject: coop.hash, to: raj.id, as: coop.hash })
    const ya = s.say(raj, 'grant', { status: 'accepted', kind: 'member' }, { answers: ga.hash, subject: coop.hash })
    s.say(raj, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: coop.hash, subject: coop.hash, as: coop.hash, after: [ya.hash] })
    door('batch 2 P5: with no removal rule chosen, one admin alone removes the founder (a chat group\'s default)', 'circle_state', [coop.hash, s.held], { expect: { members: { [raj.id]: { roles: ['owner'] } }, removed: { [ana.id]: null } } })
    // a circle that chose needed 2: one admin alone cannot remove the founder
    const pot = s.say(ana, 'actor', { kind: 'circle', name: 'Pot', roles, removal: { needed: 2 } })
    const gp = s.say(ana, 'grant', { kind: 'member', roles: ['owner'] }, { subject: pot.hash, to: raj.id, as: pot.hash })
    const yp = s.say(raj, 'grant', { status: 'accepted', kind: 'member' }, { answers: gp.hash, subject: pot.hash })
    s.say(raj, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: pot.hash, subject: pot.hash, as: pot.hash, after: [yp.hash] })
    door('batch 2 P5: a circle that chose needed 2: one admin alone cannot remove the founder, who stays', 'circle_state', [pot.hash, s.held], { expect: { members: { [ana.id]: { roles: ['owner'] }, [raj.id]: { roles: ['owner'] } }, removed: {} } })
    // an admin changes the founder's roles as anyone's: a change of the founding block
    const shop = s.say(kim, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Shop', roles })
    const gk = s.say(kim, 'grant', { kind: 'member', roles: ['owner'] }, { subject: shop.hash, to: raj.id, as: shop.hash })
    const yk = s.say(raj, 'grant', { status: 'accepted', kind: 'member' }, { answers: gk.hash, subject: shop.hash })
    s.say(raj, 'grant', { kind: 'member', roles: ['staff'] }, { updates: shop.hash, subject: shop.hash, as: shop.hash, after: [yk.hash] })
    door('batch 2 P5: an admin changes the founder\'s roles by a change of the founding block, as anyone\'s: the owner role taken away', 'circle_state', [shop.hash, s.held], { expect: { members: { [kim.id]: { roles: [] } } } })
    // powers narrow as they pass: a holder of admit alone gives no role whose powers they lack
    const club = s.say(kim, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Club', roles })
    const gh = s.say(kim, 'grant', { kind: 'member', roles: ['hr'] }, { subject: club.hash, to: hr.id, as: club.hash })
    const yh = s.say(hr, 'grant', { status: 'accepted', kind: 'member' }, { answers: gh.hash, subject: club.hash })
    const gx = s.say(hr, 'grant', { kind: 'member', roles: ['owner', 'hr'] }, { subject: club.hash, to: priya.id, as: club.hash, after: [yh.hash] })
    s.say(priya, 'grant', { status: 'accepted', kind: 'member' }, { answers: gx.hash, subject: club.hash })
    door('batch 2 P5: powers narrow as they pass: a holder of admit gives the role it holds, never a role with sign or remove', 'circle_state', [club.hash, s.held], { expect: { members: { [priya.id]: { roles: ['hr'] }, [hr.id]: { roles: ['hr'] } } } })
  }

  // P7: a death ends authority (grants, membership), never a promise; what she paid stays visible (the twins of the close's promise cases)
  {
    const s = story(), mum = s.person('b2Kmum'), kid = s.person('b2Kkid'), w1 = s.person('b2Kw1'), w2 = s.person('b2Kw2'), helper = s.person('b2Khelper', { kind: 'agent' }), farm = s.person('b2Kfarm')
    const errands = s.say(mum, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: helper.id })
    const probe = (after) => s.say(helper, 'observe', { kind: 'note', text: 'an errand' }, { under: errands.hash, after })
    const box = s.say(farm, 'thing', { kind: 'veg box' })
    const weekly = s.say(farm, 'promise', { when: '2026-11-02T07:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=MO', price: M(6000), expires: DAY } }, { from: farm.id, to: mum.id, what: box.hash })
    answer(s, mum, weekly, { status: 'accepted' })
    const prepaid = s.say(mum, 'transfer', { money: M(6000) }, { to_owner: farm.id, for: weekly.hash })
    s.say(farm, 'transfer', { status: 'accepted' }, { answers: prepaid.hash, for: weekly.hash })
    const g = s.say(mum, 'grant', { kind: 'successor', witnesses: [w1.id, w2.id], needed: 2, wait: 'P7D' }, { to: kid.id })
    const t1 = s.say(w1, 'observe', { kind: 'trigger', text: 'she died' }, { under: g.hash, subject: mum.id })
    const c1 = s.say(kid, 'observe', { kind: 'close' }, { under: g.hash, subject: mum.id, after: [t1.hash] })
    door('batch 2 P7: a close with one of the two triggers it needs ends no authority: her grant is still live', 'under_ok', [probe([c1.hash]), s.held], { expect: true, exact: true })
    const t2 = s.say(w2, 'observe', { kind: 'trigger', text: 'she died' }, { under: g.hash, subject: mum.id })
    const c2 = s.say(kid, 'observe', { kind: 'close' }, { under: g.hash, subject: mum.id, after: [t1.hash, t2.hash] })
    const late = probe([c2.hash])
    door('batch 2 P7: with both triggers in its past, the close ends the grant she gave, for every block that sees it', 'under_ok', [late, s.held], { expect: false, exact: true })
    stage('batch 2 P7: and ends no promise: the prepaid box stays underway, the 60 pounds she paid shown as a fact', weekly, s.held, { stage: 'underway', from: null, paid: { minor: 6000, currency: 'GBP' } })
    s.say(mum, 'grant', { kind: 'successor', status: 'stopped', stop: 'onward' }, { updates: g.hash })
    door('batch 2 P7 (D twin): her stop of the successor grant, written after the close, voids it: her grant is live again for that same block', 'under_ok', [late, s.held], { expect: true, exact: true })
  }
  {
    const s = story(), gran = s.person('b2Ggran'), son = s.person('b2Gson'), gs = s.person('b2Ggs'), w = s.person('b2Gw'), helper = s.person('b2Ghelper', { kind: 'agent' })
    const errands = s.say(gran, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: LATER } }, { to: helper.id })
    const g1 = s.say(gran, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: son.id })
    const g2 = s.say(son, 'grant', { kind: 'successor', witnesses: [w.id], needed: 1, wait: 'P7D' }, { to: gs.id })
    const t1 = s.say(w, 'observe', { kind: 'trigger' }, { under: g1.hash, subject: gran.id })
    const close = s.say(son, 'observe', { kind: 'close' }, { under: g1.hash, subject: gran.id, after: [t1.hash] })
    const t2 = s.say(w, 'observe', { kind: 'trigger' }, { under: g2.hash, subject: son.id })
    s.say(gs, 'observe', { kind: 'close' }, { under: g2.hash, subject: son.id, after: [t2.hash] })
    door('batch 2 P7 (decision 13 twin): a close the successor wrote before their own death still counts: her grant is not live after it', 'under_ok', [s.say(helper, 'observe', { kind: 'note', text: 'after' }, { under: errands.hash, after: [close.hash] }), s.held], { expect: false, exact: true })
  }

  // P8: pay_by is one term; due and paid_at are facts beside what moved and what was paid
  {
    const s = story(), mill = s.person('b2Pmill'), bake = s.person('b2Pbake')
    const flour = s.say(mill, 'thing', { kind: 'flour' })
    const DUE = '2027-02-01T00:00:00.000Z'
    const p = s.say(mill, 'promise', { terms: { price: M(1000), pay_by: DUE, expires: DAY } }, { from: mill.id, to: bake.id, what: flour.hash })
    answer(s, bake, p, { status: 'accepted' })
    stage('batch 2 P8: pay_by is a term: the stage says it as due; nothing paid, no paid_at', p, s.held, { stage: 'accepted', due: DUE, paid: null, paid_at: null })
    const pay = (minor, at, ackAt) => { const t = s.say(bake, 'transfer', { money: M(minor) }, { to_owner: mill.id, for: p.hash }, { time: at }); s.say(mill, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash }, { time: ackAt }); return t }
    pay(600, '2027-01-10T00:00:00.000Z', '2027-01-11T00:00:00.000Z')
    stage('batch 2 P8: part paid: paid says what came, paid_at stays null until the price is paid in full', p, s.held, { stage: 'underway', due: DUE, paid: { minor: 600 }, paid_at: null })
    pay(400, '2027-02-20T00:00:00.000Z', '2027-03-01T00:00:00.000Z')
    stage('batch 2 P8: paid in full: paid_at is when the payee says the last payment came, after due: a fact, no verdict of lateness', p, s.held, { stage: 'underway', due: DUE, paid: { minor: 1000 }, paid_at: '2027-03-01T00:00:00.000Z' })
    check('batch 2 P8: pay_by is a time', { type: 'promise', state: { terms: { price: M(100), pay_by: 'next month', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['time'])
    check('batch 2 P8: pay_by is a term of the protocol: no schema needed', { type: 'promise', state: { terms: { price: M(100), pay_by: DUE, expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, [])
  }

  // P9: a named schema both sides signed may add terms; the fold reads only those it knows; conditions read three ways
  {
    const s = story(), coop = s.person('b2Tcoop'), mill = s.person('b2Tmill')
    const maize = s.say(coop, 'thing', { kind: 'maize' })
    const form = s.say(coop, 'thing', { kind: 'schema', target: 'promise', name: 'spot less five', terms: { basis: 'Kitale spot on delivery day, less a fixed amount' } })
    const offer = { type: 'promise', state: { terms: { price: M(4000), basis: '-500', expires: DAY } }, refs: { from: AUTH, to: ID, what: ID, schema: form.hash } }
    checkWith('batch 2 P9: a term the promise\'s schema declares is taken', offer, [], [form])
    checkWith('batch 2 P9: the same term with no schema that declares it is refused (undeclared_field)', { ...offer, refs: { from: AUTH, to: ID, what: ID } }, ['undeclared_field'], [form])
    checkWith('batch 2 P9: a term the schema does not declare is refused', { ...offer, state: { terms: { price: M(4000), discount: '5', expires: DAY } } }, ['undeclared_field'], [form])
    checkWith('batch 2 P9: an answer still names no term but the quantity, whatever its schema declares', { type: 'promise', state: { status: 'accepted', terms: { basis: '-500' } }, refs: { answers: ID, for: ID, schema: form.hash } }, ['undeclared_field'], [form])
    // an ignored term never changes who is bound: the same deal with and without it reads the same
    const deal = (withTerm) => {
      const p = s.say(coop, 'promise', { terms: { price: M(4000), ...(withTerm ? { basis: '-500' } : {}), expires: DAY } }, { from: coop.id, to: mill.id, what: maize.hash, ...(withTerm ? { schema: form.hash } : {}) })
      answer(s, mill, p, { status: 'accepted' })
      const bag = s.say(coop, 'thing', { kind: 'maize', lot: withTerm ? 'T1' : 'T0' }, { of: maize.hash })
      const t = s.say(coop, 'transfer', {}, { what: bag.hash, to_owner: mill.id, for: p.hash })
      s.say(mill, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash })
      return p
    }
    const plain = deal(false), named = deal(true)
    const read = (p) => { const x = call('promise_stage', p, s.held, {}); return { stage: x.stage, quantity: x.quantity, total: x.total, paid: x.paid, lines: x.lines, sides: x.sides } }
    assert.deepEqual(read(named), read(plain), 'an ignored term changes nothing')
    stage('batch 2 P9: a deal without the schema\'s term: accepted and delivered, unpaid', plain, s.held, { ...read(plain) })
    stage('batch 2 P9: the same deal with the schema\'s term: the fold reads the same, so an ignored term binds no one', named, s.held, { ...read(plain), sides: read(named).sides })
    holds('batch 2 P9: a condition that is not an object is not read: null', 'when it rains', s.held, '2027-04-02T00:00:00.000Z', null)
    holds('batch 2 P9: a signal written wrong (no one named) does not hold: false, not null', { signal: 'rain', by: [] }, s.held, '2027-04-02T00:00:00.000Z', false)
  }

  // P10: the payee's own signed answer says how much a payment covers; the owed side may accept less, or another currency
  {
    const s = story(), farm = s.person('b2Mfarm'), cafe = s.person('b2Mcafe')
    const tea = s.say(farm, 'thing', { kind: 'tea' })
    const sale = (minor) => {
      const p = s.say(farm, 'promise', { terms: { price: M(minor), expires: DAY } }, { from: farm.id, to: cafe.id, what: tea.hash })
      answer(s, cafe, p, { status: 'accepted' })
      const chest = s.say(farm, 'thing', { kind: 'tea', lot: 'M' + tick }, { of: tea.hash })
      const t = s.say(farm, 'transfer', {}, { what: chest.hash, to_owner: cafe.id, for: p.hash })
      s.say(cafe, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash })
      return p
    }
    const pay = (p, money, covers) => { const t = s.say(cafe, 'transfer', { money }, { to_owner: farm.id, for: p.hash }); s.say(farm, 'transfer', { status: 'accepted', ...(covers ? { covers } : {}) }, { answers: t.hash, for: p.hash }); return t }
    const a = sale(10000)
    const kes = pay(a, M(1700000, 'KES'))
    stage('batch 2 P10: money in another currency covers nothing while the payee says nothing of it', a, s.held, { stage: 'underway', paid: { minor: 0, currency: 'GBP' } })
    s.say(farm, 'transfer', { status: 'accepted', covers: M(10000) }, { answers: kes.hash, for: a.hash })
    stage('batch 2 P10: the payee\'s own answer says the shillings cover the price in pounds: done (no rate is read)', a, s.held, { stage: 'done', paid: { minor: 10000, currency: 'GBP' } })
    const b = sale(10000)
    pay(b, M(8000), M(10000))
    stage('batch 2 P10: the owed side accepts less by her signed word (a quality discount): done', b, s.held, { stage: 'done', paid: { minor: 10000 } })
    const c = sale(10000)
    pay(c, M(0), M(10000))
    stage('batch 2 P10: forgiveness: nothing came, and her answer says it covers all: done', c, s.held, { stage: 'done', paid: { minor: 10000 } })
    const d = sale(10000)
    const half = pay(d, M(5000), M(5000))
    s.say(farm, 'transfer', { status: 'accepted', covers: M(7000) }, { answers: half.hash, for: d.hash })
    stage('G20: of two answers of hers to one payment, the latest in causal order counts (here also the most)', d, s.held, { stage: 'underway', paid: { minor: 7000 } })
    check('batch 2 P10: covers goes only on an accepted answer', { type: 'transfer', state: { money: M(100), covers: M(100) }, refs: { to_owner: ID, for: ID } }, ['shape'])
    check('batch 2 P10: covers is money', { type: 'transfer', state: { status: 'accepted', covers: '100' }, refs: { answers: ID, for: ID } }, ['shape'])
    check('batch 2 P10: covers on a declined answer is refused', { type: 'transfer', state: { status: 'declined', covers: M(100) }, refs: { answers: ID, for: ID } }, ['shape'])
    check('batch 2 P10: a negative price is refused: paying someone to take a thing is a job the giver buys', { type: 'promise', state: { terms: { price: M(-100), expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['shape'])
  }

  // The technical calls: no orderer field; the check before pure functions; circle_key at epoch 0 lists no grant
  check('batch 2: state.orderer is no field: handing over who allocates is a grant', { type: 'promise', state: { orderer: keyOf('b2orderer').public_key_sign, terms: { price: M(100), expires: DAY } }, refs: { from: AUTH, to: ID, what: ID } }, ['undeclared_field'])
  check('batch 2 P6: a confidence on an observe is the observe\'s own data: no grammar is read', { type: 'observe', state: { kind: 'reading', confidence: 'very sure' }, refs: {} }, [])
  door('batch 2: limit_within_parent: a fence the write check refuses (minor as text) is junk: never within', 'limit_within_parent', [{ limit: { minor: '5', currency: 'GBP' }, every: 'P4W' }, { limit: { minor: '5', currency: 'GBP' } }, '2028-02-29T00:00:00.000Z'], { expect: false, exact: true })
  door('batch 2: limit_within_parent: a well-formed fence is judged as before', 'limit_within_parent', [{ limit: M(5), every: 'P4W' }, { limit: M(5) }, '2028-02-29T00:00:00.000Z'], { expect: true, exact: true })
  {
    const s = story(), host = s.person('b2Rhost')
    const key = fb.encryptionKeyOf(sha('b2 circle key'))
    const circle = s.say(host, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Keyed', roles: [{ name: 'host', powers: ['sign', 'admit', 'remove'] }], public_key_encrypt: key })
    const name = 'batch 2: circle_key at epoch 0 is the circle actor\'s own key, and lists no grant: no rekey has counted'
    const got = call('circle_key', circle.hash, s.held)
    assert.deepEqual(got, { epoch: 0, keys: [key], grants: [] })
    made.add(name)
    V.folds.rekeys = V.folds.rekeys.filter((c) => c.name !== name)
    // every block here is the host's: its key is listed with the others, so each runner verifies them as it verifies every fold story
    const x = sha('foodblock 1.7 vectors x25519: b2Rhost')
    V.keys.b2Rhost = { seed: sha('foodblock 1.7 vectors: b2Rhost'), private_key: keyOf('b2Rhost').private_key, public_key_sign: keyOf('b2Rhost').public_key_sign, x25519_private: x, public_key_encrypt: fb.encryptionKeyOf(x) }
    V.folds.rekeys.push({ name, blocks: s.held.map((b, i) => ({ name: i ? 'b2Rhost: the circle' : 'b2Rhost: genesis', hash: b.hash, signer: 'b2Rhost', block: { type: b.type, state: b.state, refs: b.refs }, signature: b.signature })), circle: circle.hash, expected: got })
  }
}

// ---- 23. Clean round 1: validity reads only what a block rests on; speech is the folds'; what the round's findings broke, pinned ----
// (scratchpad/combined-clean: findings f1 to f12, r1 to r14, security20 new/n1 to n10 and the lenses). Each rule has its vector here; each
// vector an approved rule flipped is retired below and twinned here under a new name.
{
  const P256N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n
  const lowS = (hex) => { const s = BigInt('0x' + hex.slice(64, 128)); return s <= P256N / 2n ? hex : hex.slice(0, 64) + (P256N - s).toString(16).padStart(64, '0') + hex.slice(128) }
  // a block signed by hand at a given place in a key's chain, past the writer's own refusals (what a thief or a hand-rolled writer makes)
  const hand = (who, keyName, type, state, refs, seq) => {
    const b = fb.create(type, { at: at(), audience: 'public', seq, ...state }, { author: who.id, ...refs })
    return { ...b, signature: fb.sign(b, keyOf(keyName).private_key) }
  }
  const rotate = (s, who, keyName, newName, last, countedTo, extra = {}) => s.keep(fb.identity.keyGrant(who.id, keyOf(newName).public_key_sign,
    { private_key: keyOf(keyName).private_key, last, broughtIn: who.id }, { replaces: keyOf(keyName).public_key_sign, countedTo: countedTo.hash || countedTo, at: at(), ...extra }))
  const onKey = (s, who, keyName, prev, seq, type, state, refs = {}) => s.keep(fb.write(type, state, refs, { author: who.id, key: keyOf(keyName), held: s.held, at: at(), audience: 'public', link: { seq, prev: prev.hash } }))
  const codes = (got) => got.map((r) => r.code)

  // The twins of the 1.6 maker's cases this round flips (sdk/javascript/test/make-vectors.cjs writes them; they are retired below).
  {
    const ORIG = JSON.parse(fs.readFileSync(path.join(FINDINGS, 'clean1-originals.json'), 'utf8'))
    const old = ORIG.identity
    {
      const twin = JSON.parse(JSON.stringify(old))
      twin.name = 'a rotation by another of the id\'s keys is refused (not_own_rotation): no node holds it, so it is no word of anyone\'s (clean round 1)'
      for (const b of twin.blocks) if (b.name.startsWith('the laptop key tries to rotate the genesis key')) twin.signed_by_author[b.hash] = false
      V.identities = V.identities.filter((v) => v.name !== twin.name)
      V.identities.push(twin)
      made.add(twin.name)
    }
    const frozen = ORIG.refusal
    {
      const twin = { ...JSON.parse(JSON.stringify(frozen)), name: 'a block signed by a frozen key is taken: validity reads no speech, and the folds count it for nothing (clean round 1)', taken: frozen.incoming }
      delete twin.codes
      V.refusals.cases = V.refusals.cases.filter((c) => c.name !== twin.name)
      V.refusals.cases.push(twin)
      made.add(twin.name)
    }
    for (const name of ['p256: a changed block is not', 'p256: another identity\'s key does not open it']) {
      const c = ORIG.door.find((x) => x.name === name)
      const [block, held, ...rest] = JSON.parse(JSON.stringify(c.args))
      const fixed = held.map((h) => (h.state && h.state.suite === 'p256' && !h.refs.author ? { ...h, signature: lowS(h.signature) } : h))
      door(`${name} (clean round 1: against a genesis with a low s, a node holds it)`, 'valid', [block, fixed, ...rest], { expect: [{ code: 'bad_signature' }] })
    }
    const s = story(), she = s.person('c1she'), app = s.person('c1app'), sock = s.person('c1sock')
    const stop = s.say(app, 'observe', { kind: 'consent', word: 'stop' }, { from: she.id, subject: app.id })
    s.say(sock, 'observe', { kind: 'consent', word: 'yes' }, { from: she.id, subject: app.id, after: [stop.hash] })
    door('consent: a yes recorded by a recorder outside the asker\'s side lifts nothing: the stop the asker\'s side recorded stands (clean round 1, threat-model/c1)', 'consent', [she.id, app.id, s.held], { expect: { word: 'stop', block: stop.hash }, exact: true })
    const own = s.say(she, 'observe', { kind: 'consent', word: 'stop' }, { subject: app.id })
    s.say(sock, 'observe', { kind: 'consent', word: 'yes' }, { from: she.id, subject: app.id, after: [own.hash] })
    door('consent: her own signed stop is lifted by her own block alone: a stranger\'s recorded yes reaches it not (threat-model/c2)', 'consent', [she.id, app.id, s.held], { expect: { word: 'stop' } })
    s.say(app, 'observe', { kind: 'consent', word: 'yes' }, { from: she.id, subject: app.id, after: [stop.hash, own.hash] })
    door('consent: a recorder\'s yes lifts only a stop that same recorder recorded: her own stop still stands', 'consent', [she.id, app.id, s.held], { expect: { word: 'stop' } })
    const needs1 = ORIG.door.find((x) => x.name === 'needs: an observe rests on its prev alone, whatever else it names')
    door('needs: an observe rests on its author\'s genesis, its prev and the grant it acts under, nothing else it names (clean round 1)', 'needs', JSON.parse(JSON.stringify(needs1.args)))
    const needs2 = ORIG.door.find((x) => x.name === 'needs: a grant passed on rests on its parent')
    door('needs: a grant passed on rests on its author\'s genesis, its prev and its parent (clean round 1)', 'needs', JSON.parse(JSON.stringify(needs2.args)))
  }

  // Validity reads only what a block rests on (findings r1, r2, r14, f10, f11, f8a; security20 divergence): one verdict on every node.
  {
    const s = story(), al = s.person('c2al')
    const n1 = s.say(al, 'observe', { kind: 'note', text: 'one' })
    const n2 = s.say(al, 'observe', { kind: 'note', text: 'two' })
    const before = s.held.slice()
    const rot = rotate(s, al, 'c2al', 'c2al2', n1, n1)
    void rot
    door('valid: a block of a key, judged before its rotation is held: valid (r1)', 'valid', [n2, before.filter((b) => b !== n2), null], { expect: [], exact: true })
    door('valid: the same block judged with a rotation that voids it held: still valid, for validity reads only what it rests on (r1)', 'valid', [n2, s.held.filter((b) => b !== n2), null], { expect: [], exact: true })
    door('C1: valid: and the fold counts it: her own rotation voids nothing she signed', 'signed_by_author', [n2, s.held, null], { expect: true, exact: true })
    const sib = hand(al, 'c2al', 'observe', { kind: 'note', text: 'a sibling of the rotation' }, { prev: n1.hash }, n1.state.seq + 1)
    door('valid: a sibling of a rotation by the rotated-out key is valid whatever else is held (r1, r2)', 'valid', [sib, s.held, null], { expect: [], exact: true })
    door('C1: valid: and it is her word, a pair with the rotation', 'signed_by_author', [sib, s.held, null], { expect: true, exact: true })
  }
  {
    // r14, f11: a closed block rests on the schema it names: it waits for it, and is judged once with it
    const s = story(), al = s.person('c3al'), pub = s.person('c3publisher')
    const schema = s.say(pub, 'thing', { kind: 'schema', target: 'promise', terms: { tip: 'money' } })
    const eggs = s.say(al, 'thing', { kind: 'eggs' })
    const offer = s.keep(fb.write('promise', { terms: { expires: DAY, tip: M(100) } }, { from: al.id, what: eggs.hash, schema: schema.hash }, { author: al.id, key: keyOf('c3al'), held: s.held, at: at(), audience: 'public', schemas: [schema] }))
    door('needs: a closed block rests on the schema it names (r14)', 'needs', [offer], { expect: [...new Set([offer.refs.prev, schema.hash, al.id])].sort(), exact: true })
    door('valid: without the schema held, it is not judged: unmet, never a final refusal (r14)', 'valid', [offer, s.held.filter((b) => b !== offer && b !== schema), null], { expect: [{ code: 'unmet' }] })
    door('valid: with it held, judged against it: valid (r14)', 'valid', [offer, s.held.filter((b) => b !== offer), [schema]], { expect: [], exact: true })
    door('accept: a push whose offer names a schema the node lacks: the offer waits for the schema (f11)', 'accept', [[offer], s.held.filter((b) => b !== offer && b !== schema), null, null], { expect: { taken: [], waiting: [{ hash: offer.hash, needs: [schema.hash] }], refused: [] } })
    // r11: a block of any type rests on the grant it acts under
    const bot = s.person('c3bot', { kind: 'agent' })
    const g = s.say(al, 'grant', { kind: 'shop', scope: { acts: ['transfer'], until: LATER } }, { to: bot.id })
    const tr = s.say(bot, 'transfer', {}, { what: eggs.hash, to_owner: al.id, under: g.hash })
    door('needs: a transfer under a grant rests on it (r11)', 'needs', [tr], { expect: [...new Set([tr.refs.prev, g.hash, bot.id])].sort(), exact: true })
    door('valid: and without it is not judged (r11)', 'valid', [tr, s.held.filter((b) => b !== tr && b !== g), null], { expect: [{ code: 'unmet' }] })
  }
  {
    // f10: a frozen key brought in again by a sound rotation is still frozen: one key, frozen when any grant that brings it in is
    const s = story(), al = s.person('c4al')
    const d2 = s.keep(fb.identity.keyGrant(al.id, keyOf('c4d2').public_key_sign, { private_key: keyOf('c4al').private_key, last: null, broughtIn: al.id }, { at: at() }))
    const note = onKey(s, al, 'c4d2', d2, 1, 'observe', { kind: 'note', text: 'd2' })
    const rN = s.keep(hand(al, 'c4d2', 'grant', { kind: 'key', public_key_sign: keyOf('c4N').public_key_sign, replaces: keyOf('c4d2').public_key_sign, counted_to: note.hash }, { subject: al.id, prev: note.hash }, 2))
    s.keep(hand(al, 'c4d2', 'grant', { kind: 'key', public_key_sign: keyOf('c4M').public_key_sign, replaces: keyOf('c4d2').public_key_sign, counted_to: note.hash }, { subject: al.id, prev: note.hash }, 2))
    const d5 = s.keep(fb.write('grant', { kind: 'key', public_key_sign: keyOf('c4d5').public_key_sign }, { subject: al.id }, { author: al.id, key: keyOf('c4al'), held: s.held, at: at(), audience: 'public' }))
    const again = s.keep(hand(al, 'c4d5', 'grant', { kind: 'key', public_key_sign: keyOf('c4N').public_key_sign, replaces: keyOf('c4d5').public_key_sign, counted_to: d5.hash }, { subject: al.id, prev: d5.hash }, 1))
    const byN = hand(al, 'c4N', 'observe', { kind: 'note', text: 'N speaks' }, { prev: again.hash }, 1)
    void rN
    door('identity: a frozen key brought in again by a sound rotation is one key, still frozen (f10)', 'signed_by_author', [byN, [...s.held, byN], null], { expect: false, exact: true })
    door('valid: and its block is valid in both engines, for validity reads no speech (f10)', 'valid', [byN, s.held, null], { expect: [], exact: true })
  }
  {
    // f4, f7: a key has one first block; a decoy genesis made with the same key brings that key into no other identity
    const s = story(), al = s.person('c5al')
    const g1 = s.keep(fb.identity.keyGrant(al.id, keyOf('c5k').public_key_sign, { private_key: keyOf('c5al').private_key, last: null, broughtIn: al.id }, { at: at() }))
    const g2 = s.keep(fb.write('grant', { kind: 'key', public_key_sign: keyOf('c5k').public_key_sign }, { subject: al.id }, { author: al.id, key: keyOf('c5al'), held: s.held, at: at(), audience: 'public' }))
    const A = s.keep(hand(al, 'c5k', 'observe', { kind: 'note', text: 'first root' }, { prev: g1.hash }, 1))
    const B = s.keep(hand(al, 'c5k', 'observe', { kind: 'note', text: 'second root' }, { prev: g2.hash }, 1))
    door('identity: two first blocks of one key, each naming a grant that brought it in, are a pair (f4)', 'fork_pairs', [s.held], { expect: [[A.hash, B.hash].sort()], exact: true })
    door('accept: and a node takes neither of two that arrive together (f4)', 'accept', [[A, B], s.held.filter((b) => b !== A && b !== B), null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [[A.hash, B.hash].sort()] } })
    const decoy = s.keep(genesis(keyOf('c5al'), { kind: 'person', at: at() }))
    const h2 = hand(al, 'c5al', 'observe', { kind: 'note', text: 'names a decoy genesis' }, { prev: decoy.hash }, 1)
    door('valid: a block whose prev is another identity\'s genesis with the same key brought nothing in: chain (f7)', 'valid', [h2, s.held, null], { expect: [{ code: 'chain' }] })
  }
  {
    // r3, r5, f1: a key grant counts for the id it names as subject, signed by that id; key fields only on a genesis or a key grant
    const s = story(), al = s.person('c6al'), mal = s.person('c6mal')
    const kgm = s.say(mal, 'grant', { kind: 'key', public_key_sign: keyOf('c6x').public_key_sign }, { subject: al.id })
    const asMal = hand(mal, 'c6x', 'observe', { kind: 'note', text: 'X claims mallory' }, { prev: kgm.hash }, 1)
    door('valid: a key grant about someone else brings no key into its author: a block X signs as mallory opens with no key of hers (r3)', 'valid', [asMal, s.held, null], { expect: [{ code: 'bad_signature' }] })
    door('identity: nor into the one it names, who did not sign it (r3)', 'key_timeline', [al.id, s.held, null], { expect: [{ key: keyOf('c6al').public_key_sign }] })
    check('check: a stop of a key grant carries no key: a block with a status is never a key grant (r5)', { type: 'grant', state: { kind: 'key', status: 'stopped', stop: 'onward', public_key_sign: keyOf('c6y').public_key_sign }, refs: { updates: kgm.hash, subject: AUTH } }, ['undeclared_field'])
    check('check: a circle\'s actor names no suite (f1)', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, name: 'c', suite: 'std', roles: [{ name: 'r', powers: ['sign'] }] }, refs: {} }, ['undeclared_field'])
    check('check: an authority grant names no suite (f1: no message-level suite label)', { type: 'grant', state: { kind: 'authority', suite: 'sm', scope: { acts: ['observe'], until: LATER } }, refs: { to: AUTH } }, ['undeclared_field'])
    check('check: a member grant names no suite and no key (f1)', { type: 'grant', state: { kind: 'member', roles: ['r'], suite: 'std', public_key_sign: keyOf('c6z').public_key_sign }, refs: { subject: AUTH, as: AUTH, to: AUTH } }, ['undeclared_field'])
    check('check: a circle\'s actor still carries its encryption key', { type: 'actor', state: { kind: 'circle', removal: { needed: 1 }, name: 'c', public_key_encrypt: '0'.repeat(63) + '9', roles: [{ name: 'r', powers: ['sign'] }] }, refs: {} }, [])
    door('check: a genesis names no name and no marks (security20 spec-gaps/t6)', 'refusals', ['actor', { kind: 'person', at: '2026-10-28T12:00:00.000Z', audience: 'public', public_key_sign: keyOf('c6g').public_key_sign, name: 'Ann' }, {}, [], null], { expect: [{ code: 'bad_genesis' }] })
  }
  {
    // f9: the writer refuses what valid() refuses (a key grant of the author's that rotates another of their keys)
    const s = story(), al = s.person('c7al')
    s.keep(fb.identity.keyGrant(al.id, keyOf('c7d2').public_key_sign, { private_key: keyOf('c7al').private_key, last: null, broughtIn: al.id }, { at: at() }))
    let threw = null
    try { fb.write('grant', { kind: 'key', public_key_sign: keyOf('c7n').public_key_sign, replaces: keyOf('c7al').public_key_sign, counted_to: al.id }, { subject: al.id }, { author: al.id, key: keyOf('c7d2'), held: s.held, at: at(), audience: 'public' }) } catch (e) { threw = e }
    assert.ok(threw && /not_own_rotation/.test(threw.message), 'f9: write refuses not_own_rotation')
  }
  {
    // f7, f7b, f7c: the head of a deal must be its author's word too
    const s = story(), h = s.person('c8h'), x = s.person('c8x')
    const crate = s.say(h, 'thing', { kind: 'crate' })
    const good = s.say(h, 'observe', { kind: 'note', text: 'last good' })
    rotate(s, h, 'c8h', 'c8h2', good, good)
    const offer = s.keep(hand(h, 'c8h', 'promise', { terms: { price: M(500), expires: DAY } }, { from: h.id, to: x.id, what: crate.hash, prev: good.hash }, good.state.seq + 1))
    const acc = s.say(x, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    door('C1: promise_stage: an offer the rotated-out key signed, unseen by its own rotation, still binds her once accepted (f7)', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'accepted', accept: acc.hash } })
  }
  {
    // f5: recovery reach limits recovery rotations alone
    const s = story(), me = s.person('c9me'), other = s.person('c9other')
    const used = s.say(me, 'observe', { kind: 'note', text: 'used' })
    s.say(other, 'observe', { kind: 'note', text: 'built on it' }, { derives_from: used.hash })
    const rot = rotate(s, me, 'c9me', 'c9me2', used, me.id)
    door('recovery_reach: asked about a rotation the old key signed, nothing: the reach limits recovery rotations alone (f5)', 'recovery_reach', [rot, s.held, { [used.hash]: '2026-08-01T00:00:00.000Z', [rot.hash]: '2026-10-15T00:00:00.000Z' }], { expect: [], exact: true })
  }
  {
    // f6, r4, r7: admission, the same in both engines
    const s = story(), ag = s.person('caagnes'), jo = s.person('cajoseph'), bot = s.person('cabot', { kind: 'agent' }), sly = s.person('casly')
    const ask = s.say(jo, 'promise', { terms: { expires: DAY } }, { to: jo.id, from: ag.id, what: ag.id })
    s.say(ag, 'promise', { status: 'declined' }, { answers: ask.hash, for: ask.hash })
    const next = s.say(jo, 'observe', { kind: 'note', text: 'hello again' }, { to: ag.id })
    door('admission: per_stranger counts every sender outside parties, one she answered too (f6, nodes.md)', 'admission_refusals', [next, ag.id, s.held, { per_stranger: 1 }, 1], { expect: [{ code: 'not_admitted' }] })
    const offer = s.say(bot, 'promise', { terms: { price: M(100), expires: DAY } }, { from: bot.id, to: ag.id, what: bot.id })
    door('admission: an order channel written as one string names no act (r4)', 'admission_refusals', [offer, ag.id, s.held, { order_channel: 'promise' }, 0], { expect: [{ code: 'not_human' }] })
    const og = s.say(jo, 'grant', { kind: 'operator' }, { to: sly.id })
    s.say(sly, 'grant', { status: 'accepted' }, { answers: og.hash })
    const slyOffer = s.say(sly, 'promise', { terms: { price: M(100), expires: DAY } }, { from: sly.id, to: ag.id, what: sly.id })
    void slyOffer // retired in clean round 2: the receiver answered the operator, so is no stranger (section 24 twins it)
  }
  {
    // f4, f8: a block a fold is asked about that no node would take is no word
    const s = story(), f = s.person('cbf'), m = s.person('cbm')
    const club = s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'club', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'staff', powers: [] }] })
    const g = s.say(f, 'grant', { kind: 'member', roles: ['staff'] }, { subject: club.hash, to: m.id, as: club.hash })
    s.say(m, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: club.hash })
    const ghost = { ...fb.create('observe', { kind: 'note', text: 'rests on nothing held', at: at(), audience: [AUTH], seq: 9 }, { author: m.id, prev: '9'.repeat(64), after: [club.hash] }), signature: '00'.repeat(64) }
    door('circle_state: within a block no node would take, no circle: null (f4)', 'circle_state', [club.hash, s.held, ghost], { expect: null, exact: true })
    door('members_then: and the circle in its audience means no one (f8d)', 'members_then', [ghost, club.hash, s.held], { expect: [], exact: true })
  }
  {
    // f12: chain(blocks, brought_in): a device key's chain with its key grant
    const s = story(), al = s.person('ccal')
    const kg = s.keep(fb.identity.keyGrant(al.id, keyOf('ccd').public_key_sign, { private_key: keyOf('ccal').private_key, last: null, broughtIn: al.id }, { at: at() }))
    const d1 = onKey(s, al, 'ccd', kg, 1, 'observe', { kind: 'note', text: 'd1' })
    const d2 = onKey(s, al, 'ccd', d1, 2, 'observe', { kind: 'note', text: 'd2' })
    door('chain: a device key\'s chain, brought in by its key grant: head and length (f12)', 'check_chain', [[d1, d2], kg.hash], { expect: { head: d2.hash, length: 2, ok: true } })
  }
  {
    // security20 n1, keys/e2: of two rotations that cross, none un-counts what another counted: the sale stands; both new keys freeze
    const s = story(), al = s.person('cdal'), bob = s.person('cdbob')
    const early = s.say(al, 'observe', { kind: 'note', text: 'early' })
    const car = s.say(al, 'thing', { kind: 'car' })
    const sale = s.say(al, 'transfer', {}, { what: car.hash, to_owner: bob.id })
    s.say(bob, 'transfer', { status: 'accepted' }, { answers: sale.hash })
    const last = s.say(al, 'observe', { kind: 'note', text: 'last good' })
    rotate(s, al, 'cdal', 'cdal2', last, last)
    s.keep(hand(al, 'cdal', 'grant', { kind: 'key', public_key_sign: keyOf('cdthief').public_key_sign, replaces: keyOf('cdal').public_key_sign, counted_to: early.hash }, { subject: al.id, prev: early.hash }, early.state.seq + 1))
    door('ownership: a stale rotation by the rotated-out key, beside the car, un-counts nothing: bob still owns the car (security20 n1)', 'ownership', [car, s.held], { expect: { owner: bob.id, transfers: [sale.hash] } })
  }
  {
    // security20 forks/f3: a fork voids what the forker claims, never what they owe: an accepted transfer stands
    const s = story(), ow = s.person('ceowen'), xe = s.person('cexena'), ya = s.person('ceyan')
    const tray = s.say(ow, 'thing', { kind: 'tray' })
    const give = s.say(ow, 'transfer', {}, { what: tray.hash, to_owner: xe.id })
    s.say(xe, 'transfer', { status: 'accepted' }, { answers: give.hash })
    s.keep(hand(ow, 'ceowen', 'observe', { kind: 'note', text: 'a sibling of the transfer' }, { prev: give.refs.prev }, give.state.seq))
    door('ownership: the giver forks beside an accepted transfer: it stands, the receiver owns it (security20 forks/f3)', 'ownership', [tray, s.held], { expect: { owner: xe.id, transfers: [give.hash] } })
    void ya
  }
  {
    // security20 n4 to n6: an operator answers for a machine only by the machine's own signed accept
    const s = story(), vic = s.person('cfvictim', { kind: 'agent' }), st = s.person('cfstranger')
    const og = s.say(st, 'grant', { kind: 'operator' }, { to: vic.id })
    const forged = { ...fb.create('grant', { status: 'accepted', at: at(), audience: 'public', seq: 1 }, { author: vic.id, prev: vic.id, answers: og.hash }) }
    s.keep({ ...forged, signature: fb.sign(forged, keyOf('cfstranger').private_key) })
    door('operators: an accept a stranger signed in the machine\'s name makes no one its operator (security20 n6)', 'operators_of', [vic.id, s.held, null], { expect: [], exact: true })
  }
  {
    // security20 circles/a6: one remover stopping a member's old plain grant wipes no steward grant beside it, where two must remove
    const s = story(), f = s.person('cgf'), r = s.person('cgr'), m = s.person('cgm')
    const co = s.say(f, 'actor', { kind: 'circle', name: 'Co-op', removal: { needed: 2 }, roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'steward', powers: ['remove', 'admit'] }, { name: 'member', powers: [] }] })
    const inv = (who, roles) => s.say(f, 'grant', { kind: 'member', roles }, { subject: co.hash, to: who.id, as: co.hash })
    const yes = (who, g) => s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: co.hash })
    yes(r, inv(r, ['steward']))
    const plain = inv(m, ['member']); const ap = yes(m, plain)
    yes(m, inv(m, ['steward']))
    s.say(r, 'grant', { status: 'stopped', stop: 'onward' }, { updates: plain.hash, subject: co.hash, as: co.hash, after: [ap.hash] })
    door('circle: a lone remover\'s stop of a member\'s old plain grant does not wipe the steward grant beside it where two must remove (security20 circles/a6)', 'circle_state', [co.hash, s.held], { expect: { members: { [m.id]: { roles: ['steward'] } }, removed: {} } })
  }
  {
    // promises/t6: a decline voids an accept only when the offerer never acted on it
    const s = story(), se = s.person('chseller'), bu = s.person('chbuyer')
    const goods = s.say(se, 'thing', { kind: 'flour' })
    const offer = s.say(se, 'promise', { terms: { price: M(900), expires: DAY } }, { from: se.id, to: bu.id, what: goods.hash })
    const acc = answer(s, bu, offer, { status: 'accepted' })
    const give = s.say(se, 'transfer', {}, { what: goods.hash, to_owner: bu.id, for: offer.hash }, { after: [acc.hash] })
    s.say(bu, 'transfer', { status: 'accepted' }, { answers: give.hash, for: offer.hash })
    s.say(se, 'promise', { status: 'declined' }, { answers: acc.hash, for: offer.hash })
    door('promise_stage: the offerer who delivered on an accept cannot decline it later: the deal still binds (promises/t6)', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'underway', accept: acc.hash } })
  }
  {
    // r9, r6, r12: answers of another type answer nothing; one id per side; no range inside lines
    const s = story(), pa = s.person('cipat'), bo = s.person('cibob')
    const eggs = s.say(pa, 'thing', { kind: 'eggs' })
    const offer = s.say(pa, 'promise', { terms: { price: M(500) } }, { from: pa.id, to: bo.id, what: eggs.hash })
    s.keep(hand(bo, 'cibob', 'observe', { kind: 'note', status: 'accepted' }, { answers: offer.hash, for: offer.hash, prev: bo.id }, 1))
    door('promise_stage: an observe that says accepted to a promise answers nothing: offered (r9)', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'offered', accept: null } })
    check('check: a promise\'s side is one id, never a set (r6)', { type: 'promise', state: { terms: { expires: DAY } }, refs: { from: AUTH, to: ['2'.repeat(64), '3'.repeat(64)].sort(), what: AUTH } }, ['shape'])
    check('check: a block speaks as one circle (r6)', { type: 'observe', state: { kind: 'note' }, refs: { as: ['2'.repeat(64), '3'.repeat(64)].sort() } }, ['grammar'])
    check('check: a block acts under one grant (r6)', { type: 'observe', state: { kind: 'note' }, refs: { under: ['2'.repeat(64), '3'.repeat(64)].sort() } }, ['grammar'])
    check('check: a line\'s quantity is an amount, never a range (r12)', { type: 'promise', state: { terms: { lines: [{ id: 'a', what: '2'.repeat(64), quantity: { min: fb.amount('1', 'kg'), max: fb.amount('5', 'kg') }, price: { money: M(100), per: fb.amount('1', 'kg') } }], expires: DAY } }, refs: { from: AUTH, what: ['2'.repeat(64)] } }, ['lines'])
    check('check: a window opens before it closes', { type: 'observe', state: { kind: 'task', when: { not_before: '2026-11-01T00:00:00.000Z', not_after: '2026-10-01T00:00:00.000Z' } }, refs: {} }, ['shape'])
  }
  {
    // r2: a side is never its own deal's referee
    const s = story(), mill = s.person('cjmill'), ag = s.person('cjagnes')
    const rules = s.say(mill, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'wet bags', confirmers: [mill.id] } })
    const bags = s.say(ag, 'thing', { kind: 'maize' })
    const ask = s.say(mill, 'promise', { terms: { price: M(9000), expires: DAY } }, { from: ag.id, to: mill.id, what: bags.hash, schema: rules.hash })
    answer(s, ag, ask, { status: 'accepted' })
    const give = s.say(ag, 'transfer', {}, { what: bags.hash, to_owner: mill.id, for: ask.hash })
    s.say(mill, 'transfer', { status: 'accepted' }, { answers: give.hash, for: ask.hash })
    s.say(mill, 'observe', { kind: 'ruling', text: 'wet' }, { defeats: give.hash, for: ask.hash })
    door('promise_stage: a side the schema names as confirmer rules on nothing: its defeats is a dispute, the delivery counts (r2)', 'promise_stage', [ask, s.held, {}], { expect: { stage: 'underway' } })
  }
  {
    // r13: a stage takes no caller option: the same with or without one
    const s = story(), pa = s.person('ckpat'), bo = s.person('ckbob'), zed = s.person('ckzed')
    const gift = s.say(pa, 'promise', {}, { from: pa.id, to: bo.id, what: pa.id })
    answer(s, bo, gift, { status: 'accepted' })
    const w = s.say(pa, 'observe', { kind: 'work', text: 'done' }, { for: gift.hash })
    s.say(zed, 'observe', { kind: 'confirm' }, { confirms: w.hash, for: gift.hash })
    door('promise_stage: a stage is a function of the blocks alone: a caller\'s confirmers adds no one (r13)', 'promise_stage', [gift, s.held, { confirmers: [zed.id] }], { expect: { stage: 'accepted' } })
  }
  {
    // canonical: a negative zero in any form is integer_range; __proto__ is a key like any other
    door('strict_text: -0.0 is -0: integer_range (canonical/fuzztext)', 'strict_text', ['{"type":"observe","state":{"n":-0.0},"refs":{}}'], { expect: [{ code: 'integer_range' }] })
    door('strict_text: a repeated __proto__ key is not canonical (canonical/proto)', 'strict_text', ['{"type":"observe","state":{"__proto__":1,"__proto__":2},"refs":{}}'], { expect: [{ code: 'not_canonical' }] })
    door('strict_text: a float under __proto__ is a float (canonical/proto)', 'strict_text', ['{"type":"observe","state":{"__proto__":{"x":1.5},"kind":"x"},"refs":{}}'], { expect: [{ code: 'float' }] })
  }
  {
    // divergence/t16: clientDataJSON is UTF-8 with no byte order mark, its numbers finite
    const fx = JSON.parse(fs.readFileSync(path.join(FINDINGS, 'clean1-passkey.json'), 'utf8'))
    door('passkey: a clientDataJSON read strictly opens (the control)', 'verify', [fx.block, fx.cases.plain, fx.key], { expect: true, exact: true })
    door('passkey: a clientDataJSON with a byte order mark opens nothing (divergence/t16)', 'verify', [fx.block, fx.cases.bom, fx.key], { expect: false, exact: true })
    door('passkey: a clientDataJSON with 1e999 opens nothing (divergence/t16)', 'verify', [fx.block, fx.cases.num_out_of_range, fx.key], { expect: false, exact: true })
  }
  {
    // pull: a filter never fails open; an answer that is not full goes on from the last arrival read
    const s = story(), al = s.person('clal')
    const n1 = s.say(al, 'observe', { kind: 'note', text: 'one' })
    door('matches: a filter key the protocol does not know matches nothing (divergence R4)', 'matches', [n1, { colour: 'red' }, s.held], { expect: false, exact: true })
    door('matches: a refs filter that is not an object matches nothing', 'matches', [n1, { refs: 'x' }, s.held], { expect: false, exact: true })
    const log = s.held.map((b, i) => ({ n: i + 1, block: b }))
    const got = door('answer_pull: a filter that matches nothing in the window read goes on from the last arrival read (security20 n3)', 'answer_pull', [log, { since: 0, filter: { kind: 'none such' } }, al.id, null, 500, null, null, 'std', 40], { expect: { blocks: [], next: 40 } })
    void got
  }
  {
    // r7: a request is signed by a live key: a rotated-out key is not one
    const s = story(), al = s.person('cmal')
    const n1 = s.say(al, 'observe', { kind: 'note', text: 'one' })
    rotate(s, al, 'cmal', 'cmal2', n1, n1)
    door('live_keys: a rotated-out key is no live key: it signs no request (r7, nodes.md)', 'live_keys', [al.id, s.held], { expect: [keyOf('cmal2').public_key_sign], exact: true })
  }
  {
    // agents/t4: many deals of one store read against one reading of it
    const s = story(), se = s.person('cnseller'), bu = s.person('cnbuyer')
    const flour = s.say(se, 'thing', { kind: 'flour' })
    const o1 = s.say(se, 'promise', { terms: { price: M(100), expires: DAY } }, { from: se.id, what: flour.hash })
    const o2 = s.say(se, 'promise', { terms: { price: M(200), expires: DAY } }, { from: se.id, to: bu.id, what: flour.hash })
    answer(s, bu, o2, { status: 'accepted' })
    door('promise_views: each deal\'s view, from one reading of the store (agents/t4)', 'promise_views', [[o1.hash, o2.hash], s.held, { now: '2026-11-01T00:00:00.000Z' }], { expect: { [o1.hash]: { stage: 'offered' }, [o2.hash]: { stage: 'accepted' } } })
  }
  {
    // privacy/r2: a limit observe opens its commitment only with a salt of the grammar
    const s = story(), pr = s.person('coprin'), bot = s.person('cobot', { kind: 'agent' })
    const salt = 'ab'
    const commitment = call('limit_commitment', M(5000), 'P7D', salt, 'std', null)
    const g = s.say(pr, 'grant', { kind: 'shop', scope: { acts: ['observe.note'], until: LATER, limit_commitment: commitment } }, { to: bot.id })
    const fence = { type: 'observe', state: { kind: 'limit', limit: M(5000), every: 'P7D', salt }, refs: { for: g.hash } }
    door('limit_opens: a salt outside the grammar (16 random bytes as hex) opens nothing (privacy/r2)', 'limit_opens', [g, fence], { expect: false, exact: true })
  }
}

// ---- 24. Clean round 2: no hash and no unrested block decides; the engines agree on chains, pushes and door views ----
// (scratchpad/combined-clean round2, round2b, round3, r2-sec20, r2-market). Each fix has its vector here; each vector a fix flipped is
// retired below and twinned here under a new name.
{
  const X = JSON.parse(fs.readFileSync(path.join(FINDINGS, 'clean2-shrunk.json'), 'utf8'))
  const signed = (key, author, type, state, refs) => { const c = fb.create(type, { audience: 'public', ...state }, { ...(author ? { author } : {}), ...refs }); return { ...c, signature: fb.sign(c, keyOf(key).private_key) } }
  {
    // f4: two recovery rotations of one key that cross end the identity, and every block either counts stands (identity.md, Conflict)
    const r = X.recovery, B = (i) => r.blocks.find((b) => b.hash === r.labels[i])
    door('recovery: two recovery rotations that cross end the identity: a key grant one of them counts to speaks (f4, identity.md Conflict)', 'signed_by_author', [B(5), r.blocks, null], { expect: true, exact: true })
    door('recovery: and with the reader\'s arrivals too: no arrival decides which crossing rotation sets the reach (f4)', 'signed_by_author', [B(5), r.blocks, r.arrivals], { expect: true, exact: true })
    door('recovery_reach: of a recovery rotation another crosses, nothing: no latest rotation, so no reach (f4)', 'recovery_reach', [B(9), r.blocks, r.arrivals], { expect: [], exact: true })
  }
  {
    // f5: two mirror-image recovery rotations: which one arrived first never changes whether a block speaks (no hash picks the reach)
    const rec = keyOf('d5hR'), G = s0 => s0
    const g = genesis(keyOf('d5h'), { kind: 'person', at: '2026-10-27T12:00:00.000Z', recoveryKey: rec.public_key_sign, reach: 'P30D' })
    const f = genesis(keyOf('d5f'), { kind: 'person', at: '2026-10-27T12:00:00.000Z' })
    const N = signed('d5h', g.hash, 'observe', { kind: 'note', text: 'n', seq: 1, at: '2026-10-27T12:01:00.000Z' }, { prev: g.hash })
    const KG = signed('d5h', g.hash, 'grant', { kind: 'key', public_key_sign: keyOf('d5dev').public_key_sign, seq: 2, at: '2026-10-27T12:02:00.000Z' }, { subject: g.hash, prev: N.hash })
    const FB = signed('d5f', f.hash, 'observe', { kind: 'note', text: 'seen', seq: 1, at: '2026-10-27T12:03:00.000Z' }, { prev: f.hash, after: [KG.hash] })
    const rot = (n) => fb.identity.keyGrant(g.hash, keyOf(n).public_key_sign, { private_key: rec.private_key, recoveryKey: rec.public_key_sign, last: null }, { replaces: keyOf('d5h').public_key_sign, countedTo: N.hash, at: '2026-10-28T12:00:00.000Z', after: [KG.hash] })
    const R1 = rot('d5n1'), R2 = rot('d5n2'), held = [g, f, N, KG, FB, R1, R2]
    void G
    const base = { [g.hash]: '2026-10-01T00:00:00.000Z', [f.hash]: '2026-10-01T00:00:00.000Z', [N.hash]: '2026-10-02T00:00:00.000Z', [KG.hash]: '2026-10-15T00:00:00.000Z', [FB.hash]: '2026-10-16T00:00:00.000Z' }
    for (const [lab, a] of [['the first early', { ...base, [R1.hash]: '2026-11-01T00:00:00.000Z', [R2.hash]: '2026-12-31T00:00:00.000Z' }], ['the second early', { ...base, [R1.hash]: '2026-12-31T00:00:00.000Z', [R2.hash]: '2026-11-01T00:00:00.000Z' }]]) {
      door(`recovery: two mirror-image recovery rotations that cross, ${lab}: a key grant off both lines speaks for no one, whatever arrived first (f5: no hash picks the reach)`, 'signed_by_author', [KG, held, a], { expect: false, exact: true })
    }
  }
  {
    // rc2: a block's id is read from what it rests on (core.md, section 2), never from whether its key still speaks
    const r = X.badhash, B = (i) => r.blocks.find((b) => b.hash === r.labels[i])
    const held = [B(0), B(1), B(2)]
    door('id: a key\'s first block in std after an sm chain, brought in by a key grant a rotated-out key signed: its id is its key\'s suite, read from what it rests on (rc2)', 'id_of', [B(3), held], { expect: B(3).hash, exact: true })
    door('id: and a node takes it under that id (rc2)', 'accept', [[B(3)], held, null, null], { expect: { taken: [B(3).hash], waiting: [], refused: [], equivocations: [] } })
  }
  {
    // f3: accept judges with the schema store a node passes; a block the folds cannot read speaks for no one, so it forms no pair
    const cat = genesis(keyOf('d3cat'), { kind: 'person', at: '2026-10-27T12:00:00.000Z' }), dan = genesis(keyOf('d3dan'), { kind: 'person', at: '2026-10-27T12:00:00.000Z' })
    const T = signed('d3cat', cat.hash, 'thing', { kind: 'eggs', seq: 1, at: '2026-10-27T12:01:00.000Z' }, { prev: cat.hash })
    const S = signed('d3cat', cat.hash, 'thing', { kind: 'schema', target: 'promise', seq: 2, at: '2026-10-27T12:02:00.000Z' }, { prev: T.hash })
    const P = signed('d3cat', cat.hash, 'promise', { terms: { expires: '2028-06-01T00:00:00.000Z', basis: '-5' }, seq: 3, at: '2026-10-27T12:03:00.000Z' }, { from: cat.hash, to: dan.hash, what: T.hash, schema: S.hash, prev: S.hash })
    const KG = signed('d3cat', cat.hash, 'grant', { kind: 'key', public_key_sign: keyOf('d3phone').public_key_sign, seq: 4, at: '2026-10-27T12:04:00.000Z' }, { subject: cat.hash, prev: P.hash })
    const X1 = signed('d3phone', cat.hash, 'observe', { kind: 'note', text: 'one', seq: 1, at: '2026-10-27T12:05:00.000Z' }, { prev: KG.hash })
    const X2 = signed('d3phone', cat.hash, 'observe', { kind: 'note', text: 'two', seq: 1, at: '2026-10-27T12:06:00.000Z' }, { prev: KG.hash })
    const all = [cat, dan, T, S, P, KG, X1, X2]
    door('accept: with the node\'s schema store, an offer carrying a term its schema does not declare is refused, and what rests on it waits (f3)', 'accept', [all, [], null, [S]], { expect: { waiting: [KG.hash, X1.hash, X2.hash].sort().map((hash) => ({ hash })), refused: [{ hash: P.hash, code: 'undeclared_field' }], equivocations: [] } })
    door('accept: with no schema store both first blocks of a key the folds cannot read are taken: they speak for no one, so they are no pair (f3, nodes.md Push)', 'accept', [all, [], null, null], { expect: { waiting: [], refused: [], equivocations: [] } })
  }
  {
    // f6: a pair is two blocks of one signing key: a block of another key on the same prev is no rival
    const r = X.star, by = (n) => [...r.base, ...r.inc].find((b) => r.label[b.hash] === n)
    // f6 is twinned in section 27 (decision F2: its shrunk fixture holds a circle that states no removal rule, so the fixture no longer stands)
    void r, void by
  }
  {
    // f1, f1b, rc1, c8: the chain fold reads each block and its prev alone, never the order given; a key's first blocks take one place
    const g = genesis(keyOf('d1me'), { kind: 'person', at: '2026-10-27T12:00:00.000Z' })
    const A = signed('d1me', g.hash, 'observe', { kind: 'note', text: 'a', seq: 1, at: '2026-10-27T12:01:00.000Z' }, { prev: g.hash })
    const Bb = signed('d1me', g.hash, 'observe', { kind: 'note', text: 'b', seq: 2, at: '2026-10-27T12:02:00.000Z' }, { prev: A.hash })
    const C = signed('d1me', g.hash, 'observe', { kind: 'note', text: 'c', seq: 5, skip: true, at: '2026-10-27T12:03:00.000Z' }, { prev: A.hash })
    door('chain: a skip that jumps forward from its prev is not broken; with a block on the same prev it is a pair (f1)', 'check_chain', [[A, Bb, C], g.hash], { expect: { broken: [], equivocations: [[Bb.hash, C.hash].sort()], skips: [C.hash], length: 1, ok: false }, exact: false })
    const A2 = signed('d1me', g.hash, 'observe', { kind: 'note', text: 'a2', seq: 1, at: '2026-10-27T12:04:00.000Z' }, { prev: g.hash })
    const Y = signed('d1me', g.hash, 'observe', { kind: 'note', text: 'y', seq: 1, at: '2026-10-27T12:05:00.000Z' }, { prev: '7'.repeat(64) })
    const want = check_chain_answer => check_chain_answer
    void want
    const got1 = door('chain: blocks at seq 1 that name another block that brought the key in are first blocks too: one place, a star of pairs, and none counted (f1b, c8)', 'check_chain', [[A, A2, Y], g.hash], { expect: { length: 0, broken: [Y.hash], ok: false }, exact: false })
    door('chain: the same blocks in another order give the same answer (f1b: a fold reads no order)', 'check_chain', [[Y, A2, A], g.hash], { expect: got1, exact: true })
  }
  {
    // rc3, n4: one block's text never makes the push unreadable: each message's block is judged by its own text
    const ok = '{"type":"observe","state":{"kind":"note","text":"hi","seq":1,"at":"2026-10-27T12:00:00.000Z","audience":"public"},"refs":{"author":"' + '1'.repeat(64) + '","prev":"' + '1'.repeat(64) + '"}}'
    const big = ok.replace('"text":"hi"', '"text":"hi","n":1e999')
    const lone = ok.replace('"text":"hi"', '"text":"\\ud800"')
    const deep = ok.replace('"text":"hi"', '"text":"hi","deep":' + '['.repeat(140) + ']'.repeat(140))
    const push = (blocks) => '{"messages":[' + blocks.map((b) => '{"version":"1.7","block":' + b + ',"signature":"' + 'ab'.repeat(64) + '"}').join(',') + ']}'
    door('strict_push: a number too large for a float in one block refuses that block alone (rc3)', 'strict_push', [push([ok, big])], { expect: [[], [{ code: 'not_canonical' }]] })
    door('strict_push: a lone surrogate in one block refuses that block alone (rc3)', 'strict_push', [push([ok, lone])], { expect: [[], [{ code: 'not_canonical' }]] })
    door('strict_push: a block nested past limits.depth_read refuses that block alone, never the push (security20 n4)', 'strict_push', [push([ok, deep])], { expect: [[], [{ code: 'not_canonical' }]] })
    door('strict_text: a whole number written as a float in money is float alone, as seq 1.0 is (rc4)', 'strict_text', ['{"type":"transfer","state":{"money":{"minor":5.0,"currency":"GBP"},"seq":1,"at":"2026-10-27T12:00:00.000Z","audience":"public"},"refs":{"author":"' + '1'.repeat(64) + '","prev":"' + '1'.repeat(64) + '"}}'], { expect: [{ code: 'float' }], exact: false })
  }
  {
    // f7: a circle the folds cannot read has no key
    door('circle_key: of a circle whose actor the folds cannot read: epoch 0, no keys (f7)', 'circle_key', [X.circlekey.circle, X.circlekey.blocks], { expect: { epoch: 0, keys: [], grants: [] }, exact: true })
  }
  {
    // n6: a door view asked about a block no node would take answers as of no word
    const s = story(), pr = s.person('d6prin'), bot = s.person('d6bot', { kind: 'agent' })
    const g = s.say(pr, 'grant', { kind: 'shop', scope: { acts: ['observe.note'], until: LATER } }, { to: bot.id })
    const n = s.say(bot, 'observe', { kind: 'note', text: 'for her' }, { under: g.hash })
    door('under_ok: with every block it rests on, a note under a live grant is under it (n6, the control)', 'under_ok', [n, s.held], { expect: true, exact: true })
    door('under_ok: without its author\'s genesis it is no word, under no grant (n6)', 'under_ok', [n, s.held.filter((b) => b.hash !== bot.id)], { expect: false, exact: true })
    const se = s.person('d6seller'), bu = s.person('d6buyer'), egg = s.say(se, 'thing', { kind: 'eggs' })
    const o = s.say(se, 'promise', { terms: { price: M(300), expires: DAY } }, { from: se.id, to: bu.id, what: egg.hash })
    const w = s.say(se, 'promise', { status: 'stopped', stop: 'before' }, { updates: o.hash, for: o.hash })
    const seen = s.say(bu, 'observe', { kind: 'note', text: 'saw it' }, { after: [w.hash] })
    door('withdrawal_seen: in the block\'s causal past (n6, the control)', 'withdrawal_seen', [w, seen, s.held, null], { expect: true, exact: true })
    door('withdrawal_seen: without the counterparty\'s genesis its block is no word, and has seen nothing (n6)', 'withdrawal_seen', [w, seen, s.held.filter((b) => b.hash !== bu.id), null], { expect: false, exact: true })
  }
  {
    // m3: a stopped allocation frees its quantity: the open offer binds only what its allocations still bind together
    const s = story(), se = s.person('d7seller'), a = s.person('d7a'), b = s.person('d7b')
    const fish = s.say(se, 'thing', { kind: 'fish' })
    const o = s.say(se, 'promise', { terms: { price: { money: M(900), per: { value: '1', unit: 'kg' } }, quantity: { value: '20', unit: 'kg' }, expires: DAY } }, { from: se.id, what: fish.hash })
    const ra = answer(s, a, o, { status: 'accepted', terms: { quantity: { value: '20', unit: 'kg' } } })
    const aa = s.say(se, 'promise', { status: 'accepted' }, { answers: ra.hash, for: o.hash, after: [ra.hash] })
    const stop = s.say(se, 'promise', { status: 'stopped', stop: 'onward' }, { updates: aa.hash, for: aa.hash })
    const rb = answer(s, b, o, { status: 'accepted', terms: { quantity: { value: '5', unit: 'kg' } } })
    s.say(se, 'promise', { status: 'accepted' }, { answers: rb.hash, for: o.hash, after: [rb.hash, stop.hash] })
    stage('allocations: an open offer binds what its allocations still bind: a stopped allocation\'s quantity is freed, in the offer\'s own stage too (r2-sec20 m3)', o, s.held, { stage: 'accepted', quantity: { value: '5', unit: 'kg' }, total: { minor: 4500, currency: 'GBP' } })
  }
  {
    // grants/t2: a limit with no period covers all time: a child with a period under it is wider
    const s = story(), pr = s.person('d8prin'), mid = s.person('d8mid')
    const parent = s.say(pr, 'grant', { kind: 'shop', depth: 1, scope: { acts: ['promise'], until: LATER, limit: M(10000) } }, { to: mid.id })
    const child = { type: 'grant', state: { kind: 'shop', scope: { acts: ['promise'], until: LATER, limit: M(10000), every: 'P1D' } }, refs: { parent: parent.hash, to: pr.id, author: mid.id } }
    check('grants: a child with a period under a parent whose limit has none is wider: the parent\'s limit covers all time (grants/t2)', child, ['wider_than_parent'], s.held)
    check('grants: refs.parent names one grant: a set is grammar (round 3 c6, c7)', { type: 'grant', state: { kind: 'shop', scope: { acts: ['promise'], until: LATER } }, refs: { parent: [parent.hash, '2'.repeat(64)].sort(), to: pr.id, author: mid.id } }, ['grammar'], s.held)
  }
  {
    // divergence/t17: junk given to a door answers as absent, the same in both engines
    const s = story(), al = s.person('d9al'), bo = s.person('d9bo'), egg = s.say(al, 'thing', { kind: 'eggs' })
    door('matches: a marks filter that is not { scheme, value } matches nothing (divergence/t17)', 'matches', [egg, { marks: null }, s.held], { expect: false, exact: true })
    door('matches: a filter that is not an object matches nothing: a filter never fails open (divergence/t17)', 'matches', [egg, 'x', s.held], { expect: false, exact: true })
    door('matches: no filter matches every block (the control)', 'matches', [egg, null, s.held], { expect: true, exact: true })
    const o = s.say(al, 'promise', { terms: { price: M(300), expires: DAY } }, { from: al.id, to: bo.id, what: egg.hash })
    const { hash, ...bare } = o
    void hash
    door('promise_stage: a first promise with no id is no block a fold holds: no stage (divergence/t17)', 'promise_stage', [bare, s.held.filter((b) => b !== o), {}], { expect: null, exact: true })
  }
  {
    // m5 a, b; r7: consent follows the principal: one who answered the principal is no stranger to the hands acting under its live grant
    const s = story(), ag = s.person('daagnes'), acme = s.person('daacme'), bot = s.person('dabot', { kind: 'agent' }), hand = s.person('dahand')
    const o = s.say(ag, 'promise', { terms: { price: M(900), expires: DAY } }, { from: ag.id, to: acme.id, what: ag.id })
    s.say(acme, 'promise', { status: 'accepted' }, { answers: o.hash, for: o.hash })
    const ask = s.say(acme, 'promise', { terms: { expires: DAY } }, { from: ag.id, to: acme.id, what: ag.id })
    s.say(ag, 'promise', { status: 'declined' }, { answers: ask.hash, for: ask.hash })
    const g = s.say(acme, 'grant', { kind: 'buying', scope: { acts: ['promise'], parties: [ag.id], until: LATER } }, { to: bot.id })
    const order = s.say(bot, 'promise', { terms: { expires: DAY } }, { from: ag.id, to: acme.id, what: ag.id, under: g.hash })
    door('admission: a known buyer\'s agent, under its live grant, is no stranger to one who answered the buyer: consent follows the principal (r2-market m5 a)', 'admission_refusals', [order, ag.id, s.held, {}, 0], { expect: [], exact: true })
    const g2 = s.say(acme, 'grant', { kind: 'buying', scope: { acts: ['promise'], parties: [ag.id], until: LATER } }, { to: hand.id })
    const order2 = s.say(hand, 'promise', { terms: { expires: DAY } }, { from: ag.id, to: acme.id, what: ag.id, under: g2.hash })
    door('admission: a shop hand under the buyer\'s live grant, the same (r2-market m5 b)', 'admission_refusals', [order2, ag.id, s.held, {}, 0], { expect: [], exact: true })
    const t = story(), ag2 = t.person('dbagnes'), jo = t.person('dbjoseph'), sly = t.person('dbsly')
    const og = t.say(jo, 'grant', { kind: 'operator' }, { to: sly.id })
    t.say(sly, 'grant', { status: 'accepted' }, { answers: og.hash })
    const slyOffer = t.say(sly, 'promise', { terms: { price: M(100), expires: DAY } }, { from: sly.id, to: ag2.id, what: sly.id })
    door('admission: an author an operator answers for is an autonomous system, whatever kind it gives itself: to a stranger it may not write first, under a rule that states an order channel (r7; clean round 2; F1)', 'admission_refusals', [slyOffer, ag2.id, t.held, { order_channel: [] }, 0], { expect: [{ code: 'not_human' }] })
  }
  {
    // round 3 c2: the recovery key's defeats is judged on what it rests on: the grant; what it defeats is the successor fold's
    const s = story(), wit = s.person('dcwit'), heir = s.person('dcheir')
    const rec = fb.keypairFromSeed(sha('foodblock 1.7 vectors: recovery dc'), 'std')
    const me = keyOf('dcme')
    const g = s.keep(genesis(me, { kind: 'person', at: at(), recoveryKey: rec.public_key_sign, reach: 'P30D' }))
    const succ = s.keep(fb.write('grant', { kind: 'successor', witnesses: [wit.id], needed: 1, wait: 'P7D' }, { to: heir.id }, { author: g.hash, key: me, held: s.held, at: at(), audience: 'public' }))
    const t = s.say(wit, 'observe', { kind: 'trigger' }, { under: succ.hash, subject: g.hash })
    const O = require('../../../spec/oracle/fb.cjs')
    const d = { type: 'observe', state: { kind: 'alive', at: at(), audience: 'public', seq: 1, recovery_key: rec.public_key_sign }, refs: { author: g.hash, prev: g.hash, defeats: t.hash, under: succ.hash } }
    d.hash = O.hashOfBlock(d); d.signature = O.signBlock(d, rec.private_key)
    door('recovery: its defeats of a trigger is valid on a node that does not hold the trigger: what it defeats is not a block it rests on (round 3 c2)', 'valid', [d, s.held.filter((b) => b !== t), null, null], { expect: [], exact: true })
    const other = s.say(heir, 'promise', { terms: { refrain: true, until: LATER } }, { from: heir.id, to: g.hash, what: wit.id })
    const wide = { type: 'observe', state: { kind: 'alive', at: at(), audience: 'public', seq: 1, recovery_key: rec.public_key_sign }, refs: { author: g.hash, prev: g.hash, defeats: other.hash, under: succ.hash } }
    wide.hash = O.hashOfBlock(wide); wide.signature = O.signBlock(wide, rec.private_key)
    door('recovery: a defeats of something that is no trigger under the grant is valid, and cancels nothing in the successor fold (round 3 c2)', 'valid', [wide, s.held, null, null], { expect: [], exact: true })
  }
  {
    // round 3 c3: whether the signer is a side is the fold's: a side may name a thing whose owner is no block the promise rests on
    const s = story(), a = s.person('ddA'), b = s.person('ddB'), d = s.person('ddD')
    const note = s.say(d, 'thing', { kind: 'note' })
    const ask = s.say(b, 'promise', { terms: { price: M(200), expires: DAY } }, { from: a.id, to: note.hash, what: note.hash })
    door('promises: a promise naming a thing as its side has one verdict whether or not the node holds the thing (round 3 c3)', 'refusals', [ask.type, ask.state, ask.refs, s.held.filter((x) => x !== note), null], { expect: [], exact: true })
    check('promises: a promise signed by neither side is valid: it counts for nothing in the fold (round 3 c3; folds.md, Who a block speaks for)', { type: 'promise', state: { terms: { expires: '2026-10-20T00:00:00.000Z' } }, refs: { from: '2'.repeat(64), what: '3'.repeat(64) } }, [])
    const offer = s.say(b, 'promise', { terms: { price: M(300), expires: DAY } }, { from: b.id, to: a.id, what: note.hash })
    stage('promises: the offer its author wrote after a promise naming a thing the input lacks still has its stage (round 3 c3)', offer, s.held.filter((x) => x !== note), { stage: 'offered' })
  }
  {
    // round 3 c1: "a key of its author" is one that what the block rests on brings in: one code on every node
    const s = story(), me = s.person('deme')
    const kg = s.keep(fb.identity.keyGrant(me.id, keyOf('dephone').public_key_sign, { private_key: keyOf('deme').private_key, last: null, broughtIn: me.id }, { at: at() }))
    const stray = signed('dephone', me.id, 'observe', { kind: 'note', text: 'stray', seq: 1, at: at() }, { prev: me.id })
    door('valid: a key\'s block whose prev brought in no key of the author\'s it rests on: bad_signature, on a node that holds the genesis alone (round 3 c1)', 'valid', [stray, [me.g], null, null], { expect: [{ code: 'bad_signature' }] })
    door('valid: and the same code on a node that also holds the key grant it does not rest on (round 3 c1)', 'valid', [stray, [me.g, kg], null, null], { expect: [{ code: 'bad_signature' }] })
  }
}

// ---- 25. Decisions C and D (2026-10-29): a fork or a removal never erases what outsiders built on; a side never rules ----
// (~/Documents/foodx-decisions-2026-10-29/foodblock-decisions-c.md, batch C 1 to 10 and batch D 11 to 18). Each rule has its vector here;
// each vector a rule flipped is retired below and twinned here under a new name.
{
  {
    // C4 (r2:market m1, m1b): a payment never counts for less than was sent; covers only raises it
    const s = story(), dealer = s.person('c4dealer'), agnes = s.person('c4agnes')
    const fert = s.say(dealer, 'thing', { kind: 'fertiliser' })
    const sale = () => {
      const p = s.say(dealer, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: dealer.id, to: agnes.id, what: fert.hash })
      answer(s, agnes, p, { status: 'accepted' })
      const bag = s.say(dealer, 'thing', { kind: 'fertiliser', lot: 'C4' + tick }, { of: fert.hash })
      const t = s.say(dealer, 'transfer', {}, { what: bag.hash, to_owner: agnes.id, for: p.hash })
      s.say(agnes, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash })
      return p
    }
    const pay = (p, money, covers) => { const t = s.say(agnes, 'transfer', { money }, { to_owner: dealer.id, for: p.hash }); s.say(dealer, 'transfer', { status: 'accepted', ...(covers ? { covers } : {}) }, { answers: t.hash, for: p.hash }); return t }
    const a = sale()
    pay(a, M(900000, 'KES'), M(100000, 'KES'))
    stage('C4: the payee who takes KES 9,000 and writes covers KES 1,000 makes it count for nothing less: done (m1)', a, s.held, { stage: 'done', paid: { minor: 900000, currency: 'KES' } })
    const b = sale()
    pay(b, M(900000, 'KES'), M(100, 'USD'))
    stage('C4: a covers in another currency never makes money in the price\'s currency count for less: done (m1)', b, s.held, { stage: 'done', paid: { minor: 900000, currency: 'KES' } })
    const c = sale()
    pay(c, M(900000, 'KES'), M(0, 'KES'))
    stage('C4: a covers of nothing never unpays money that moved: done (m1)', c, s.held, { stage: 'done', paid: { minor: 900000, currency: 'KES' } })
    const d = sale()
    pay(d, M(800000, 'KES'), M(900000, 'KES'))
    stage('C4: covers still raises: the owed side takes KES 8,000 as the whole price by her word: done', d, s.held, { stage: 'done', paid: { minor: 900000, currency: 'KES' } })
  }
  {
    // C7 (r2:market m3, m7, m2, r1, r1b): the deal says how many referees must agree (E3: no default); a side never rules, by any name
    // or hand; a ruling reaches the accept and a payee's answer too
    const s = story(), agnes = s.person('c7agnes'), buyer = s.person('c7buyer')
    const e = [s.person('c7elder1'), s.person('c7elder2'), s.person('c7elder3')]
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const deal = (grounds) => {
      const rules = s.say(agnes, 'thing', { kind: 'schema', target: 'promise', grounds })
      const p = s.say(agnes, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: agnes.id, to: buyer.id, what: maize.hash, schema: rules.hash })
      const acc = answer(s, buyer, p, { status: 'accepted' })
      const bags = s.say(agnes, 'thing', { kind: 'maize', lot: 'C7' + tick }, { of: maize.hash })
      const give = s.say(agnes, 'transfer', {}, { what: bags.hash, to_owner: buyer.id, for: p.hash })
      s.say(buyer, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      const pay = s.say(buyer, 'transfer', { money: M(900000, 'KES') }, { to_owner: agnes.id, for: p.hash })
      const ack = s.say(agnes, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash })
      return { p, acc, give, pay, ack }
    }
    // decision E3: a deal naming several confirmers states how many must agree (no default); this panel states two of three
    const panel = { confirmers: e.map((x) => x.id).sort(), needed: 2 }
    const a = deal(panel)
    const c1 = s.say(e[0], 'observe', { kind: 'ruling' }, { confirms: a.give.hash, for: a.p.hash })
    const c2 = s.say(e[1], 'observe', { kind: 'ruling' }, { confirms: a.give.hash, for: a.p.hash })
    s.say(e[2], 'observe', { kind: 'ruling' }, { defeats: a.give.hash, for: a.p.hash, after: [c1.hash, c2.hash].sort() })
    stage('E3: the deal states two of three referees must agree; one defeats the delivery after two confirmed it: the delivery stands: done (m3)', a.p, s.held, { stage: 'done' })
    s.say(e[2], 'observe', { kind: 'ruling' }, { defeats: a.pay.hash, for: a.p.hash })
    stage('E3: with two of three needed, one referee alone erases no payment that moved: done (m3)', a.p, s.held, { stage: 'done', paid: { minor: 900000, currency: 'KES' } })
    const b = deal(panel)
    s.say(e[1], 'observe', { kind: 'ruling' }, { defeats: b.give.hash, for: b.p.hash })
    s.say(e[2], 'observe', { kind: 'ruling' }, { defeats: b.give.hash, for: b.p.hash })
    stage('E3: with two of three needed, two referees defeat the delivery: it counts for nothing (m3)', b.p, s.held, { stage: 'underway', lines: [{ moved: 0 }] })
    const c = deal({ ...panel, needed: 1 })
    s.say(e[2], 'observe', { kind: 'ruling' }, { defeats: c.give.hash, for: c.p.hash })
    stage('C7: grounds.needed 1: the deal said any one referee decides, and one defeats the delivery', c.p, s.held, { stage: 'underway', lines: [{ moved: 0 }] })
    const d = deal({ confirmers: [e[0].id] })
    s.say(e[0], 'observe', { kind: 'ruling' }, { defeats: d.ack.hash, for: d.p.hash })
    stage('C7: the referee defeats the payee\'s answer to the payment: the answer counts for nothing, so the payment is not counted (m7)', d.p, s.held, { stage: 'underway', paid: null })
    s.say(e[0], 'observe', { kind: 'ruling' }, { defeats: d.acc.hash, for: d.p.hash })
    stage('C7: the referee defeats the binding accept: it binds nothing, and the offer is offered again (m7)', d.p, s.held, { stage: 'offered', accept: null })
    // a side holding the referee role in another circle (m2 A), and an arbiter a side appointed after the deal bound (m2 B)
    const elder = e[0], clerk = s.person('c7clerk')
    const assoc = s.say(elder, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Traders', roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }, { name: 'arbiter', powers: [] }] })
    const made = s.say(elder, 'grant', { kind: 'member', roles: ['arbiter'] }, { subject: assoc.hash, to: buyer.id, as: assoc.hash })
    s.say(buyer, 'grant', { status: 'accepted', kind: 'member' }, { answers: made.hash, subject: assoc.hash })
    const f = deal({ confirmers: [assoc.hash + '#arbiter'] })
    s.say(buyer, 'observe', { kind: 'ruling', text: 'bags were wet' }, { defeats: f.give.hash, for: f.p.hash })
    stage('C7: the buyer holds the arbiter role the deal names: his ruling on her delivery is a dispute, never a verdict (m2)', f.p, s.held, { stage: 'done', disputed: [{ by: 'to' }] })
    const own = s.person('c7own')
    const shop = s.say(own, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Shop', roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }, { name: 'arbiter', powers: [] }] })
    const g = (() => {
      const rules = s.say(agnes, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [shop.hash + '#arbiter'] } })
      const p = s.say(agnes, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: agnes.id, to: own.id, what: maize.hash, schema: rules.hash })
      answer(s, own, p, { status: 'accepted' })
      const bags = s.say(agnes, 'thing', { kind: 'maize', lot: 'C7g' }, { of: maize.hash })
      const give = s.say(agnes, 'transfer', {}, { what: bags.hash, to_owner: own.id, for: p.hash })
      s.say(own, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      return { p, give }
    })()
    const later = s.say(own, 'grant', { kind: 'member', roles: ['arbiter'] }, { subject: shop.hash, to: clerk.id, as: shop.hash })
    const yes = s.say(clerk, 'grant', { status: 'accepted', kind: 'member' }, { answers: later.hash, subject: shop.hash })
    s.say(clerk, 'observe', { kind: 'ruling' }, { defeats: g.give.hash, for: g.p.hash, after: [yes.hash] })
    stage('C7: an arbiter the buyer appointed after the deal bound rules on nothing: the delivery stands (m2 B)', g.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    // an autonomous system a side runs (r1), and a member of a side's circle named by id (r1b)
    const qa = s.person('c7qa', { kind: 'agent' })
    const og = s.say(buyer, 'grant', { kind: 'operator' }, { to: qa.id })
    const ok = s.say(qa, 'grant', { status: 'accepted' }, { answers: og.hash })
    const h = deal({ confirmers: [qa.id] })
    s.say(qa, 'observe', { kind: 'ruling' }, { defeats: h.give.hash, for: h.p.hash, after: [ok.hash] })
    stage('H9: C7: an autonomous system the buyer runs, named as referee in the schema both sides signed, rules: its defeat counts, and the tie is shown (before: it ruled on nothing, done)', h.p, s.held, { stage: 'underway', lines: [{ moved: 0 }], referee_ties: [{ referee: qa.id, side: 'to', how: 'operator' }] })
    const coop = s.say(e[1], 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Co-op', roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }] })
    const k = (() => {
      const rules = s.say(agnes, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [e[1].id] } })
      const p = s.say(agnes, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: agnes.id, to: coop.hash, what: maize.hash, schema: rules.hash })
      answer(s, e[1], p, { status: 'accepted' }, { as: coop.hash })
      const bags = s.say(agnes, 'thing', { kind: 'maize', lot: 'C7k' }, { of: maize.hash })
      const give = s.say(agnes, 'transfer', {}, { what: bags.hash, to_owner: coop.hash, for: p.hash })
      s.say(e[1], 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash, as: coop.hash })
      return { p, give }
    })()
    s.say(e[1], 'observe', { kind: 'ruling' }, { defeats: k.give.hash, for: k.p.hash })
    stage('H9: C7: the co-op\'s own chair, named by id in the schema both sides signed, rules in the co-op\'s deal, the tie shown (before: it ruled on nothing)', k.p, s.held, { stage: 'accepted', referee_ties: [{ referee: e[1].id, side: 'to', how: 'member' }] })
  }
  {
    // C8: both sides name a referee after the quarrel: one signs a grant of kind referee for the deal, the other accepts it
    const s = story(), seller = s.person('c8seller'), buyer = s.person('c8buyer'), judge = s.person('c8judge')
    const tea = s.say(seller, 'thing', { kind: 'tea' })
    const p = s.say(seller, 'promise', { terms: { price: M(5000), expires: DAY } }, { from: seller.id, to: buyer.id, what: tea.hash })
    answer(s, buyer, p, { status: 'accepted' })
    const chest = s.say(seller, 'thing', { kind: 'tea', lot: 'C8' }, { of: tea.hash })
    const give = s.say(seller, 'transfer', {}, { what: chest.hash, to_owner: buyer.id, for: p.hash })
    s.say(buyer, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
    const named = s.say(seller, 'grant', { kind: 'referee', scope: { until: LATER } }, { to: judge.id, subject: p.hash })
    const ruling = s.say(judge, 'observe', { kind: 'ruling', text: 'the chest was short' }, { defeats: give.hash, for: p.hash, after: [named.hash] })
    stage('C8: a referee one side named alone rules on nothing: the delivery stands', p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    s.say(buyer, 'grant', { status: 'accepted' }, { answers: named.hash })
    stage('C8: once the other side accepts the grant naming her, her ruling counts: the delivery counts for nothing', p, s.held, { stage: 'accepted', lines: [{ moved: 0 }] })
    void ruling
  }
  {
    // D11 (x1): of two crossing accepts by one side on different terms, the one the other side acted on binds: a lie never frees the liar
    const s = story(), agnes = s.person('d11agnes'), kamau = s.person('d11kamau')
    const kg = s.say(kamau, 'grant', { kind: 'key', public_key_sign: keyOf('d11tab').public_key_sign }, { subject: kamau.id })
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const bag = (n) => fb.amount(String(n), '{bag}')
    const offer = s.say(agnes, 'promise', { terms: { price: { money: M(90000, 'KES'), per: bag(1) }, quantity: { min: bag(5), max: bag(20) }, expires: DAY } }, { from: agnes.id, to: kamau.id, what: maize.hash })
    const a1 = answer(s, kamau, offer, { status: 'accepted', terms: { quantity: bag(10) } })
    const lot = s.say(agnes, 'thing', { kind: 'maize', lot: 'D11' }, { of: maize.hash, after: [a1.hash] })
    const give = s.say(agnes, 'transfer', {}, { what: lot.hash, to_owner: kamau.id, for: offer.hash })
    s.say(kamau, 'transfer', { status: 'accepted' }, { answers: give.hash, for: offer.hash })
    const a2 = s.keep(fb.write('promise', { status: 'accepted', terms: { quantity: bag(20) } }, { answers: offer.hash, for: offer.hash, after: [offer.hash] }, { author: kamau.id, key: keyOf('d11tab'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: kg.hash } }))
    stage('E2: the seller delivered after the first accept of 10 but her delivery names neither accept: the crossing accepts on different terms bind nothing (x1)', offer, s.held, { stage: 'offered', accept: null, forks: [a1.hash, a2.hash].sort() })
    const offer2 = s.say(agnes, 'promise', { terms: { price: { money: M(90000, 'KES'), per: bag(1) }, quantity: { min: bag(5), max: bag(20) }, expires: DAY } }, { from: agnes.id, to: kamau.id, what: maize.hash })
    const b1 = answer(s, kamau, offer2, { status: 'accepted', terms: { quantity: bag(10) } })
    const b2 = s.keep(fb.write('promise', { status: 'accepted', terms: { quantity: bag(20) } }, { answers: offer2.hash, for: offer2.hash, after: [offer2.hash] }, { author: kamau.id, key: keyOf('d11tab'), held: s.held, at: at(), audience: 'public', link: { seq: a2.state.seq + 1, prev: a2.hash } }))
    stage('D11: two crossing accepts on different terms that the seller acted on neither of: neither binds', offer2, s.held, { stage: 'offered', accept: null, forks: [b1.hash, b2.hash].sort() })
  }
  {
    // C2 (market-abuse m1, promises t14): every allocation the offerer signed binds her; together past what she offered, her broken promise
    const s = story(), maya = s.person('c2maya'), t1 = s.person('c2t1'), t2 = s.person('c2t2'), t3 = s.person('c2t3')
    const eggs = s.say(maya, 'thing', { kind: 'eggs' })
    const EGG = (n) => fb.amount(String(n), '{egg}')
    const O = s.say(maya, 'promise', { terms: { price: { money: M(300), per: EGG(1) }, quantity: EGG(100), expires: LATER } }, { from: maya.id, what: eggs.hash })
    const request = (t, q) => answer(s, t, O, { status: 'accepted', terms: { quantity: EGG(q) } })
    const allocate = (r, q) => s.say(maya, 'promise', { status: 'accepted', terms: { quantity: EGG(q) } }, { answers: r.hash, for: O.hash, after: [r.hash] })
    const r1 = request(t1, 60), r2 = request(t2, 30), r3 = request(t3, 30)
    const a1 = allocate(r1, 60), a2 = allocate(r2, 30), a3 = allocate(r3, 30)
    stage('C2: allocations past what was offered still bind: the offer binds 120 eggs of the 100 it offered, her broken promise, and lists every taker', O, s.held,
      { stage: 'accepted', accept: a1.hash, quantity: { value: '120', unit: '{egg}' }, total: { minor: 36000, currency: 'GBP' }, takers: [{ who: t1.id, allocation: a1.hash }, { who: t2.id, allocation: a2.hash }, { who: t3.id, allocation: a3.hash }] })
    stage('C2: the allocation past what was offered is a deal of its own: the third taker is owed', a3, s.held, { stage: 'accepted', accept: a3.hash, quantity: { value: '30', unit: '{egg}' } })
  }
  {
    // D14 (c10, time r5): an act dated at or after its grant's until acts under no grant: it binds no one but its signer
    const s = story(), farmer = s.person('d14farmer'), agent = s.person('d14agent', { kind: 'agent' }), vendor = s.person('d14vendor')
    const g = s.say(farmer, 'grant', { kind: 'buy', scope: { acts: ['promise.purchase'], until: '2026-11-01T00:00:00.000Z', each: M(100000) } }, { to: agent.id })
    const flour = s.say(vendor, 'thing', { kind: 'flour' })
    const offer = s.say(vendor, 'promise', { kind: 'purchase', terms: { price: M(5000), expires: DAY } }, { from: vendor.id, to: farmer.id, what: flour.hash })
    const late = s.say(agent, 'promise', { kind: 'purchase', status: 'accepted' }, { answers: offer.hash, for: offer.hash, under: g.hash, after: [offer.hash] }, { time: '2026-11-02T00:00:00.000Z' })
    door('D14: an accept the agent dated after its grant\'s until acts under no grant (c10)', 'under_ok', [late, s.held], { expect: false, exact: true })
    stage('D14: so it binds the farmer to nothing: the offer is still offered (c10, time r5)', offer, s.held, { stage: 'offered', accept: null })
    const offer2 = s.say(vendor, 'promise', { kind: 'purchase', terms: { price: M(5000), expires: DAY } }, { from: vendor.id, to: farmer.id, what: flour.hash }, { time: '2026-10-29T00:00:00.000Z' })
    const inTime = s.say(agent, 'promise', { kind: 'purchase', status: 'accepted' }, { answers: offer2.hash, for: offer2.hash, under: g.hash, after: [offer2.hash] }, { time: '2026-10-30T00:00:00.000Z' })
    stage('D14: an accept dated before the until binds the farmer, whatever any clock says now', offer2, s.held, { stage: 'accepted', accept: inTime.hash })
  }
  {
    // D15 (c11): a grant to a circle is passed on by a block signed as the circle, no wider than given; the signer's role is the fold's
    const s = story(), ann = s.person('d15ann'), mo = s.person('d15mo'), eve = s.person('d15eve'), bot = s.person('d15bot', { kind: 'agent' })
    const shop = s.say(mo, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Shop', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }] })
    const g = s.say(ann, 'grant', { kind: 'supply', depth: 2, scope: { acts: ['observe'], until: LATER } }, { to: shop.hash })
    const child = s.say(mo, 'grant', { kind: 'supply', depth: 1, scope: { acts: ['observe'], until: LATER } }, { to: bot.id, parent: g.hash, as: shop.hash })
    door('D15: the shop\'s owner passes on a grant made to the shop, signed as the shop: valid (c11)', 'valid', [child, s.held, null], { expect: [], exact: true })
    door('D15: and the autonomous system acts under it, for ann', 'under_ok', [s.say(bot, 'observe', { kind: 'note', text: 'stock counted' }, { under: child.hash }), s.held], { expect: true, exact: true })
    const sly = s.raw(eve, 'grant', { kind: 'supply', depth: 1, scope: { acts: ['observe'], until: LATER } }, { to: bot.id, parent: g.hash, as: shop.hash })
    door('D15: someone with no role in the shop who signs as it passes on nothing: the check takes the block, the fold gives it no authority', 'valid', [sly, s.held, null], { expect: [], exact: true })
    door('D15: so an act under that child acts under no grant', 'under_ok', [s.raw(bot, 'observe', { kind: 'note', text: 'eve says so' }, { under: sly.hash }), s.held], { expect: false, exact: true })
  }
  {
    // D16 (p1): a standing promise is due and paid occurrence by occurrence: one occurrence's payment is never read as the whole
    const s = story(), agnes = s.person('d16agnes'), school = s.person('d16school')
    const milk = s.say(agnes, 'thing', { kind: 'milk' })
    const p = s.say(agnes, 'promise', { when: '2026-11-03T07:00:00.000Z', terms: { price: M(50000, 'KES'), repeat: 'FREQ=WEEKLY;BYDAY=TU', pay_by: '2026-11-06T17:00:00.000Z', expires: DAY } }, { from: agnes.id, to: school.id, what: milk.hash })
    answer(s, school, p, { status: 'accepted' })
    for (const wk of [0, 1]) {
      const jug = s.say(agnes, 'thing', { kind: 'milk', lot: 'D16w' + wk }, { of: milk.hash })
      const d = s.say(agnes, 'transfer', {}, { what: jug.hash, to_owner: school.id, for: p.hash })
      s.say(school, 'transfer', { status: 'accepted' }, { answers: d.hash, for: p.hash })
    }
    const pay = s.say(school, 'transfer', { money: M(50000, 'KES') }, { to_owner: agnes.id, for: p.hash })
    s.say(agnes, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash })
    stage('D16: two weeks delivered, one paid: a standing promise reports no due and no paid_at, never one week\'s payment as the whole (p1)', p, s.held, { stage: 'underway', paid: { minor: 50000, currency: 'KES' }, due: null, paid_at: null })
  }
  {
    // D17 (m5 d): stranger admission counts per sender: the count the node passes is this sender's own, so one spammer closes no door to others
    const s = story(), agnes = s.person('d17agnes'), acme = s.person('d17acme'), spam = s.person('d17spam')
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const order = s.say(acme, 'promise', { terms: { price: M(1000, 'KES'), expires: DAY } }, { from: agnes.id, to: acme.id, what: maize.hash })
    const junk = s.say(spam, 'promise', { terms: { price: M(1, 'KES'), expires: DAY } }, { from: agnes.id, to: spam.id, what: maize.hash })
    const held = s.held.filter((b) => b !== order && b !== junk)
    door('D17: the spammer has sent 20 today under per_stranger 20: its next is not admitted', 'admission_refusals', [junk, agnes.id, held, { per_stranger: 20 }, 20], { expect: [{ code: 'not_admitted' }] })
    door('D17: acme, who sent nothing today, is admitted: the spammer\'s 20 are the spammer\'s count alone (m5 d)', 'admission_refusals', [order, agnes.id, held, { per_stranger: 20 }, 0], { expect: [], exact: true })
  }
  // C1, C5, n3, c9: a key's own rotation only closes its future; only the recovery key reaches back, and the reach (a view) protects what
  // others built on before it; a crossing never erases what someone else built on
  const keep25 = (s, b) => s.keep(b)
  const withRec25 = (s, name) => { const rec = keyOf(name + '_recovery'); const g = s.keep(genesis(keyOf(name), { kind: 'person', at: at(), recoveryKey: rec.public_key_sign, reach: 'P30D' })); return { name, id: g.hash, g, rec } }
  const rot25 = (s, who, keyName, newName, last, countedTo) => keep25(s, fb.identity.keyGrant(who.id, keyOf(newName).public_key_sign, { private_key: keyOf(keyName).private_key, last, broughtIn: who.id }, { replaces: keyOf(keyName).public_key_sign, countedTo: countedTo.hash, at: at() }))
  const recover25 = (s, who, keyName, newName, countedTo) => keep25(s, fb.identity.keyGrant(who.id, keyOf(newName).public_key_sign, { private_key: who.rec.private_key, recoveryKey: who.rec.public_key_sign }, { replaces: keyOf(keyName).public_key_sign, countedTo: countedTo.hash, at: at() }))
  {
    // C1 (r8, forks f1, f2): a seller's own rotation counted to before her sale un-signs nothing: the buyer keeps the cow, the deal binds
    const s = story(), al = withRec25(s, 'c1al'), bob = s.person('c1bob')
    const cow = s.say(al, 'thing', { kind: 'cow' })
    const offer = s.say(al, 'promise', { terms: { price: M(50000), expires: DAY } }, { from: al.id, to: bob.id, what: cow.hash })
    answer(s, bob, offer, { status: 'accepted' })
    const sale = s.say(al, 'transfer', {}, { what: cow.hash, to_owner: bob.id, for: offer.hash })
    s.say(bob, 'transfer', { status: 'accepted' }, { answers: sale.hash, for: offer.hash })
    const own = rot25(s, al, 'c1al', 'c1al2', sale, cow)
    door('C1: her own rotation counted to before the sale: the sale is still her word (r8, forks f1)', 'signed_by_author', [sale, s.held, null], { expect: true, exact: true })
    door('C1: so the buyer still owns the cow', 'ownership', [cow, s.held], { expect: { owner: bob.id, transfers: [sale.hash], conflict: null } })
    stage('C1: and the deal is still underway: her accept-bound offer binds her (forks f2)', offer, s.held, { stage: 'underway' })
    // only the recovery key reaches back: its rotation counted to the cow voids the sale in the fold, the word
    const s2 = story(), cy = withRec25(s2, 'c1cy'), dee = s2.person('c1dee')
    const cow2 = s2.say(cy, 'thing', { kind: 'cow' })
    const sale2 = s2.say(cy, 'transfer', {}, { what: cow2.hash, to_owner: dee.id })
    s2.say(dee, 'transfer', { status: 'accepted' }, { answers: sale2.hash })
    const rec = recover25(s2, cy, 'c1cy', 'c1cy2', cow2)
    door('C1: only the recovery key reaches back: its rotation counted to the cow voids the sale in the fold', 'ownership', [cow2, s2.held], { expect: { owner: cy.id, transfers: [], conflict: null } })
    // c9: the ownership view applies the reach: a sale another built on that arrived before the reach began stands for that reader
    const early = Object.fromEntries(s2.held.map((b) => [b.hash, '2026-01-01T00:00:00.000Z'])); early[rec.hash] = '2026-10-27T12:30:00.000Z'
    door('c9: the ownership view: the buyer\'s sale arrived nine months before the recovery rotation, past its reach: the buyer owns the cow', 'ownership_view', [cow2, s2.held, early], { expect: { owner: dee.id, transfers: [sale2.hash], conflict: null } })
    const late = { ...early }; late[sale2.hash] = '2026-10-20T00:00:00.000Z'
    door('c9: the ownership view: a sale that arrived inside the reach is reached: the seller owns it again', 'ownership_view', [cow2, s2.held, late], { expect: { owner: cy.id, transfers: [], conflict: null } })
    // C1 void spreads, twinned: a key brought in by a block the recovery key voids is void, and every key it brought in
    const s3 = story(), jo = withRec25(s3, 'c1jo')
    const good = s3.say(jo, 'observe', { kind: 'note', text: 'mine' })
    const brought = keep25(s3, fb.identity.keyGrant(jo.id, keyOf('c1jo_thief').public_key_sign, { private_key: keyOf('c1jo').private_key, last: good }, { at: at() }))
    const broughtOn = keep25(s3, fb.identity.keyGrant(jo.id, keyOf('c1jo_thief2').public_key_sign, { private_key: keyOf('c1jo_thief').private_key, last: null, broughtIn: brought.hash }, { at: at() }))
    const fromSecond = keep25(s3, fb.write('observe', { kind: 'note', text: 'pay me' }, {}, { author: jo.id, key: keyOf('c1jo_thief2'), held: s3.held, at: at(), audience: 'public', link: { seq: 1, prev: broughtOn.hash } }))
    recover25(s3, jo, 'c1jo', 'c1jo_new', good)
    door('C1: void spreads: the recovery rotation voids the stolen key\'s key grant after the last good block', 'signed_by_author', [brought, s3.held, null], { expect: false, exact: true })
    door('C1: void spreads: and the key it brought in is void, and what that key brought in', 'signed_by_author', [fromSecond, s3.held, null], { expect: false, exact: true })
  }
  {
    // n3: the old key's holder signs a rotation that crosses the owner's: both new keys freeze, and what someone else built on stands
    const s = story(), alice = s.person('n3alice'), bob = s.person('n3bob')
    const n1 = s.say(alice, 'observe', { kind: 'note', text: 'last K1 block' })
    const mine = rot25(s, alice, 'n3alice', 'n3alice2', n1, n1)
    const tray = keep25(s, fb.write('thing', { kind: 'eggs', lot: 'N3' }, {}, { author: alice.id, key: keyOf('n3alice2'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: mine.hash } }))
    const sale = keep25(s, fb.write('transfer', {}, { what: tray.hash, to_owner: bob.id }, { author: alice.id, key: keyOf('n3alice2'), held: s.held, at: at(), audience: 'public', link: { seq: 2, prev: tray.hash } }))
    s.say(bob, 'transfer', { status: 'accepted' }, { answers: sale.hash })
    const note = keep25(s, fb.write('observe', { kind: 'note', text: 'nobody built on this' }, {}, { author: alice.id, key: keyOf('n3alice2'), held: s.held, at: at(), audience: 'public', link: { seq: 3, prev: sale.hash } }))
    const thief = keep25(s, fb.identity.keyGrant(alice.id, keyOf('n3thief').public_key_sign, { private_key: keyOf('n3alice').private_key, last: n1, broughtIn: alice.id }, { replaces: keyOf('n3alice').public_key_sign, countedTo: n1.hash, at: at() }))
    void thief
    door('n3: the crossing freezes her new key, yet her sale Bob accepted is still her word', 'signed_by_author', [sale, s.held, null], { expect: true, exact: true })
    door('n3: so Bob keeps the tray', 'ownership', [tray, s.held], { expect: { owner: bob.id, transfers: [sale.hash], conflict: null } })
    door('n3: a block of the frozen key nobody built on counts for nothing until the recovery key settles it', 'signed_by_author', [note, s.held, null], { expect: false, exact: true })
  }
  // C6, d2, D13: a removal never erases what outsiders built on; a close cuts like a removal; no crossing after removal
  const circle25 = (s, f, name) => s.say(f, 'actor', { kind: 'circle', removal: { needed: 1 }, name, roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }, { name: 'treasurer', powers: ['sign'] }] })
  const join25 = (s, by, C, who, roles, after) => { const g = s.say(by, 'grant', { kind: 'member', roles }, { subject: C.hash, to: who.id, as: C.hash, ...(after ? { after } : {}) }); return { g, a: s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: C.hash }) } }
  const stop25 = (s, by, C, g, after) => s.say(by, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: g.hash, subject: C.hash, as: C.hash, ...(after ? { after } : {}) })
  {
    // C6 (r8, a4): the chair removes the treasurer by a stop that cites none of her deal: the trader's deal, and her yes to his payment, stand
    const s = story(), chair = s.person('c6chair'), ruth = s.person('c6ruth'), joseph = s.person('c6joseph'), eve = s.person('c6eve')
    const C = circle25(s, chair, 'Maize co-op')
    const jr = join25(s, chair, C, ruth, ['treasurer'])
    const maize = s.say(chair, 'thing', { kind: 'maize' })
    const offer = s.say(ruth, 'promise', { terms: { price: M(4500000, 'KES'), expires: DAY } }, { from: C.hash, to: joseph.id, what: maize.hash, as: C.hash })
    answer(s, joseph, offer, { status: 'accepted' })
    const pay = s.say(joseph, 'transfer', { money: M(4500000, 'KES') }, { to_owner: C.hash, for: offer.hash })
    s.say(ruth, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: offer.hash, as: C.hash })
    stop25(s, chair, C, jr.g, [jr.a.hash])
    door('C6: a removal that never saw the treasurer\'s deal erases nothing an outsider accepted: her offer still speaks for the co-op (r8)', 'may_act_as', [offer, C.hash, s.held, null], { expect: true, exact: true })
    stage('C6: and the deal binds the co-op, his payment counted by her yes to it', offer, s.held, { stage: 'underway', paid: { minor: 4500000, currency: 'KES' } })
    const late = s.say(ruth, 'promise', { terms: { price: M(100, 'KES'), expires: DAY } }, { from: C.hash, to: eve.id, what: maize.hash, as: C.hash })
    door('C6: her offer after the cut that no outsider took up speaks for no one', 'may_act_as', [late, C.hash, s.held, null], { expect: false, exact: true })
    const seen = s.held.find((b) => b.type === 'grant' && b.state.status === 'stopped')
    const eveAcc = answer(s, eve, late, { status: 'accepted' }, { after: [late.hash, seen.hash].sort() })
    void eveAcc
    door('C6: an outsider who had seen the removal and accepts anyway builds on nothing: still no one\'s word', 'may_act_as', [late, C.hash, s.held, null], { expect: false, exact: true })
  }
  {
    // d2: a dead treasurer's phone signs for the co-op after the close: the close cuts like a removal, and what an outsider accepted stands
    const s = story(), chair = s.person('d2chair'), agnes = s.person('d2agnes'), peter = s.person('d2peter'), nb = s.person('d2neighbour'), friend = s.person('d2friend')
    const C = circle25(s, chair, 'Co-op')
    join25(s, chair, C, agnes, ['treasurer'])
    const maize = s.say(chair, 'thing', { kind: 'maize' })
    const succ = s.say(agnes, 'grant', { kind: 'successor', witnesses: [nb.id], needed: 1, wait: 'P7D' }, { to: peter.id })
    const trig = s.say(nb, 'observe', { kind: 'trigger', text: 'she died' }, { under: succ.hash, subject: agnes.id })
    s.say(peter, 'observe', { kind: 'close' }, { under: succ.hash, subject: agnes.id, after: [trig.hash] })
    const phone = s.say(agnes, 'promise', { terms: { price: M(100000, 'KES'), expires: DAY } }, { from: C.hash, to: friend.id, what: maize.hash, as: C.hash })
    door('d2: the dead treasurer\'s phone signs an offer as the co-op after the close: no one has built on it, so it speaks for no one', 'may_act_as', [phone, C.hash, s.held, null], { expect: false, exact: true })
    answer(s, friend, phone, { status: 'accepted' })
    door('d2: an outsider who had not seen the close accepts it: what others built on stands', 'may_act_as', [phone, C.hash, s.held, null], { expect: true, exact: true })
  }
  {
    // D13 (m6): the founder sells the café, the buyer removes her; her stale stop of his grant never undoes it: every removal in the ring stands
    const s = story(), rose = s.person('d13rose'), juma = s.person('d13juma'), school = s.person('d13school')
    const C = s.say(rose, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Rose Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }] })
    const jj = join25(s, rose, C, juma, ['owner'])
    const out = s.say(juma, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: C.hash, subject: C.hash, as: C.hash, after: [jj.a.hash] })
    const mandazi = s.say(juma, 'thing', { kind: 'mandazi' })
    const offer = s.say(juma, 'promise', { terms: { price: M(400000, 'KES'), expires: DAY } }, { from: C.hash, to: school.id, what: mandazi.hash, as: C.hash, after: [out.hash] })
    answer(s, school, offer, { status: 'accepted' })
    stop25(s, rose, C, jj.g, [jj.a.hash])
    door('D13: the founder\'s stale stop crosses the removal of her: both stand, she is not back (m6)', 'circle_state', [C.hash, s.held], { expect: { members: {}, removed: { [rose.id]: null, [juma.id]: null } } })
    door('D13: and the school\'s deal with the café, accepted before it saw her stop, stands', 'may_act_as', [offer, C.hash, s.held, null], { expect: true, exact: true })
  }
  {
    // d1: a voided close voids only what the successor claimed for himself; the estate sale a trader accepted and paid for stands
    const s = story(), agnes = s.person('d1agnes'), peter = s.person('d1peter'), nb = s.person('d1neighbour'), joseph = s.person('d1joseph')
    const succ = s.say(agnes, 'grant', { kind: 'successor', witnesses: [nb.id], needed: 1, wait: 'P7D' }, { to: peter.id })
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const bags = s.say(agnes, 'thing', { kind: 'maize', lot: 'D1' }, { of: maize.hash })
    const pigs = s.say(agnes, 'thing', { kind: 'pig', lot: 'D1p' })
    const trig = s.say(nb, 'observe', { kind: 'trigger', text: 'she died' }, { under: succ.hash, subject: agnes.id })
    const close = s.say(peter, 'observe', { kind: 'close' }, { under: succ.hash, subject: agnes.id, after: [trig.hash] })
    const offer = s.say(peter, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: agnes.id, to: joseph.id, what: bags.hash, under: succ.hash, after: [close.hash] })
    answer(s, joseph, offer, { status: 'accepted' })
    const pay = s.say(joseph, 'transfer', { money: M(900000, 'KES') }, { to_owner: agnes.id, for: offer.hash })
    s.say(peter, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: offer.hash, under: succ.hash })
    const give = s.say(peter, 'transfer', {}, { what: bags.hash, to_owner: joseph.id, for: offer.hash, under: succ.hash })
    s.say(joseph, 'transfer', { status: 'accepted' }, { answers: give.hash, for: offer.hash })
    const mine = s.say(peter, 'transfer', {}, { what: pigs.hash, to_owner: peter.id, under: succ.hash })
    s.say(peter, 'transfer', { status: 'accepted' }, { answers: mine.hash })
    s.say(agnes, 'observe', { kind: 'denial', text: 'not dead' }, { defeats: trig.hash })
    door('d1: her defeats of the trigger voids the close, yet the bags the trader paid for stay his', 'ownership', [bags, s.held], { expect: { owner: joseph.id, transfers: [give.hash], conflict: null } })
    stage('d1: and the estate sale is still done', offer, s.held, { stage: 'done' })
    door('d1: what the successor gave himself under the voided close is void: the pigs are hers', 'ownership', [pigs, s.held], { expect: { owner: agnes.id, transfers: [], conflict: null } })
  }
  {
    // D12 (e1): a timely accept beats a late decline by her receipt: the offerer's node's signed push answer, dated before expires
    const s = story(), mill = s.person('d12mill'), agnes = s.person('d12agnes')
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const ask = (n) => s.say(mill, 'promise', { terms: { price: M(90000, 'KES'), expires: '2026-11-01T00:00:00.000Z' } }, { from: agnes.id, to: mill.id, what: maize.hash })
    const deal = (n, at) => {
      const p = ask(n)
      const acc = answer(s, agnes, p, { status: 'accepted' })
      if (at) {
        const receipt = fb.sync.pushAnswer({ taken: [acc.hash], at }, { node: mill.id, privateKey: keyOf('d12mill').private_key })
        s.say(agnes, 'observe', { kind: 'receipt', answer: receipt }, { derives_from: acc.hash, for: p.hash })
      }
      s.say(mill, 'promise', { status: 'declined' }, { answers: acc.hash, for: p.hash })
      return { p, acc }
    }
    const a = deal(1, '2026-10-02T09:00:00.000Z')
    stage('D12: the mill declines an accept its own node signed as taken on 2 Oct, before expires: the decline voids nothing (e1)', a.p, s.held, { stage: 'accepted', accept: a.acc.hash })
    const b = deal(2, null)
    stage('D12: with no receipt, the decline of an accept on an offer that carried expires still voids it', b.p, s.held, { stage: 'asked', accept: null })
    const c = deal(3, '2026-11-02T09:00:00.000Z')
    stage('D12: a receipt dated after expires protects nothing: the decline voids the accept', c.p, s.held, { stage: 'asked', accept: null })
  }
}

// ---- 26. Decisions E1 to E8 (2026-10-29): signed acts decide, never a default; one rule for every deal ----
{
  {
    // E1: a backup referee's wait runs from the first referee's own signed receipt of the dispute (the D12 receipt), and the backup's word counts
    // only where it dated it after the wait: signed times alone, so the backup is in the fold, the same on every node
    const s = story(), seller = s.person('e1seller'), buyer = s.person('e1buyer'), first = s.person('e1first'), backup = s.person('e1backup'), other = s.person('e1other')
    const rules = s.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [first.id, backup.id], needed: 1, wait: 'P7D' } })
    const tea = s.say(seller, 'thing', { kind: 'tea' })
    const deal = () => {
      const p = s.say(seller, 'promise', { terms: { price: M(5000), expires: DAY } }, { from: seller.id, to: buyer.id, what: tea.hash, schema: rules.hash })
      answer(s, buyer, p, { status: 'accepted' })
      const chest = s.say(seller, 'thing', { kind: 'tea', lot: 'E1' + tick }, { of: tea.hash })
      const give = s.say(seller, 'transfer', {}, { what: chest.hash, to_owner: buyer.id, for: p.hash })
      s.say(buyer, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      const dispute = s.say(buyer, 'observe', { kind: 'dispute', text: 'short' }, { defeats: give.hash, for: p.hash })
      return { p, give, dispute }
    }
    const receipt = (d, at, signer = first) => {
      const answer = fb.sync.pushAnswer({ taken: [d.dispute.hash], at }, { node: first.id, privateKey: keyOf(signer.name).private_key })
      return s.say(buyer, 'observe', { kind: 'receipt', answer }, { derives_from: d.dispute.hash, for: d.p.hash })
    }
    const rule = (d, time) => s.say(backup, 'observe', { kind: 'ruling' }, { defeats: d.give.hash, for: d.p.hash, after: [d.dispute.hash] }, { time })
    const a = deal()
    rule(a, '2026-12-01T00:00:00.000Z')
    stage('E1: with no receipt of the dispute from the first referee, the wait never began: the backup\'s word changes nothing', a.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    const b = deal()
    receipt(b, '2026-11-28T00:00:00.000Z')
    rule(b, '2026-12-01T00:00:00.000Z')
    stage('E1: the backup ruled three days after the first referee\'s own receipt, inside the seven-day wait: its word changes nothing', b.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    const c = deal()
    receipt(c, '2026-11-01T00:00:00.000Z')
    rule(c, '2026-12-01T00:00:00.000Z')
    stage('E1: the first referee signed for the dispute on 1 Nov and said nothing; the backup ruled after the wait: its ruling counts in the fold', c.p, s.held, { stage: 'accepted', lines: [{ moved: 0 }] })
    view('E1: and every reader, whatever its clock, reads the same', c.p, s.held, '2026-10-28T00:00:00.000Z', { stage: 'accepted', lines: [{ moved: 0 }] })
    const d = deal()
    receipt(d, '2026-11-01T00:00:00.000Z')
    s.say(backup, 'observe', { kind: 'ruling' }, { defeats: d.give.hash, for: d.p.hash, after: [d.dispute.hash] }, { time: '2026-11-03T00:00:00.000Z' })
    stage('E1: a ruling the backup dated before the wait had run counts for nothing', d.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    const e = deal()
    receipt(e, '2026-11-01T00:00:00.000Z')
    rule(e, '2026-12-01T00:00:00.000Z')
    s.say(first, 'observe', { kind: 'ruling' }, { confirms: e.give.hash, for: e.p.hash, after: [e.dispute.hash] })
    stage('E1: the first referee spoke: the backup\'s word never counts', e.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    const f = deal()
    receipt(f, '2026-11-01T00:00:00.000Z', other)
    rule(f, '2026-12-01T00:00:00.000Z')
    stage('E1: a receipt signed by a key that does not speak for the first referee starts no wait', f.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
  }
  {
    // E2: of crossing accepts on different terms, the one the seller's delivery names binds: her own signed act says which word she took up
    const s = story(), agnes = s.person('e2agnes'), kamau = s.person('e2kamau')
    const kg = s.say(kamau, 'grant', { kind: 'key', public_key_sign: keyOf('e2tab').public_key_sign }, { subject: kamau.id })
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const bag = (n) => fb.amount(String(n), '{bag}')
    const offer = s.say(agnes, 'promise', { terms: { price: { money: M(90000, 'KES'), per: bag(1) }, quantity: { min: bag(5), max: bag(20) }, expires: DAY } }, { from: agnes.id, to: kamau.id, what: maize.hash })
    const a1 = answer(s, kamau, offer, { status: 'accepted', terms: { quantity: bag(10) } })
    const a2 = s.keep(fb.write('promise', { status: 'accepted', terms: { quantity: bag(20) } }, { answers: offer.hash, for: offer.hash, after: [offer.hash] }, { author: kamau.id, key: keyOf('e2tab'), held: s.held, at: at(), audience: 'public', link: { seq: 1, prev: kg.hash } }))
    const lot = s.say(agnes, 'thing', { kind: 'maize', lot: 'E2' }, { of: maize.hash })
    const give = s.say(agnes, 'transfer', {}, { what: lot.hash, to_owner: kamau.id, for: offer.hash }, { after: [a1.hash, a2.hash].sort() })
    stage('E2: the seller saw both of the buyer\'s crossing accepts and her delivery names both: neither binds', offer, s.held, { stage: 'offered', accept: null, forks: [a1.hash, a2.hash].sort() })
    const offer2 = s.say(agnes, 'promise', { terms: { price: { money: M(90000, 'KES'), per: bag(1) }, quantity: { min: bag(5), max: bag(20) }, expires: DAY } }, { from: agnes.id, to: kamau.id, what: maize.hash })
    const b1 = answer(s, kamau, offer2, { status: 'accepted', terms: { quantity: bag(10) } })
    const b2 = s.keep(fb.write('promise', { status: 'accepted', terms: { quantity: bag(20) } }, { answers: offer2.hash, for: offer2.hash, after: [offer2.hash] }, { author: kamau.id, key: keyOf('e2tab'), held: s.held, at: at(), audience: 'public', link: { seq: a2.state.seq + 1, prev: a2.hash } }))
    const lot2 = s.say(agnes, 'thing', { kind: 'maize', lot: 'E2b' }, { of: maize.hash })
    s.say(agnes, 'transfer', {}, { what: lot2.hash, to_owner: kamau.id, for: offer2.hash }, { after: [b1.hash] })
    stage('E2: she saw both and her delivery names the accept of 10: the 10 bind (x1)', offer2, s.held, { stage: 'accepted', accept: b1.hash, quantity: bag(10), forks: [b1.hash, b2.hash].sort() })
    void give
  }
  {
    // E3: no default number of referees: a deal naming several states how many must agree, and a judge named later beside one makes two who must both
    const s = story(), seller = s.person('e3seller'), buyer = s.person('e3buyer'), ref = s.person('e3ref'), judge = s.person('e3judge')
    const two = s.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [judge.id, ref.id].sort() } })
    const state = { seq: two.state.seq + 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', terms: { price: M(5000), expires: DAY } }
    const codes = (name, schema, want) => { const refs = { author: seller.id, prev: two.hash, from: seller.id, to: buyer.id, what: two.hash, schema: schema.hash }; const got = [...new Set(call('refusals', 'promise', state, refs, [], [schema]).map((r) => r.code))]; assert.deepEqual(got, want, name); door(name, 'refusals', ['promise', state, refs, [], [schema]], want.length ? { expect: want.map((code) => ({ code })) } : { expect: [], exact: true }) }
    codes('E3: a promise naming a schema whose grounds list two confirmers and no needed is refused: the deal says how many must agree', two, ['shape'])
    const both = s.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [judge.id, ref.id].sort(), needed: 2 } })
    codes('E3: with needed stated it stands', both, [])
    const one = s.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [ref.id] } })
    const tea = s.say(seller, 'thing', { kind: 'tea' })
    const p = s.say(seller, 'promise', { terms: { price: M(5000), expires: DAY } }, { from: seller.id, to: buyer.id, what: tea.hash, schema: one.hash })
    answer(s, buyer, p, { status: 'accepted' })
    const chest = s.say(seller, 'thing', { kind: 'tea', lot: 'E3' }, { of: tea.hash })
    const give = s.say(seller, 'transfer', {}, { what: chest.hash, to_owner: buyer.id, for: p.hash })
    s.say(buyer, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
    const named = s.say(buyer, 'grant', { kind: 'referee', scope: { until: LATER } }, { to: judge.id, subject: p.hash })
    s.say(seller, 'grant', { status: 'accepted' }, { answers: named.hash })
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: give.hash, for: p.hash })
    stage('E3: one confirmer and a judge named later make two, with no number stated: one ruling alone changes nothing', p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    s.say(judge, 'observe', { kind: 'ruling' }, { defeats: give.hash, for: p.hash, after: [named.hash] })
    stage('H2: both rule, but no number was ever signed: no ruling counts, the delivery stands (before: both must agree, and the delivery counted for nothing)', p, s.held, { stage: 'underway', lines: [{ moved: null }] })
  }
  {
    // E4: a payment names the occurrence it pays, and the stage reports each occurrence's due and paid
    const s = story(), hotel = s.person('e4hotel'), farm = s.person('e4farm'), sighter = s.person('e4sighter')
    const eggs = s.say(farm, 'thing', { kind: 'eggs' })
    const weekly = s.say(farm, 'promise', { when: '2026-11-06T09:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=FR', price: M(5000), expires: DAY } }, { from: farm.id, to: hotel.id, what: eggs.hash })
    answer(s, hotel, weekly, { status: 'accepted' })
    const pay = (occurrence, minor) => { const t = s.say(hotel, 'transfer', { money: M(minor), ...(occurrence ? { occurrence } : {}) }, { to_owner: farm.id, for: weekly.hash }); s.say(farm, 'transfer', { status: 'accepted' }, { answers: t.hash, for: weekly.hash }, { time: '2026-11-07T10:00:00.000Z' }); return t }
    pay('2026-11-06T09:00:00.000Z', 5000)
    pay('2026-11-13T09:00:00.000Z', 2000)
    stage('E4: a weekly promise: the 6 Nov Friday is paid in full, the 13 Nov Friday in part; each is seen on its own', weekly, s.held, { stage: 'underway', due: null, paid_at: null, paid: { minor: 7000, currency: 'GBP' }, occurrences: [
      { occurrence: '2026-11-06T09:00:00.000Z', due: '2026-11-06T09:00:00.000Z', paid: { minor: 5000, currency: 'GBP' }, paid_at: '2026-11-07T10:00:00.000Z' },
      { occurrence: '2026-11-13T09:00:00.000Z', due: '2026-11-13T09:00:00.000Z', paid: { minor: 2000, currency: 'GBP' }, paid_at: null }] })
    const moon = s.say(farm, 'promise', { terms: { repeat: { after: 'moon_sighted', by: [sighter.id], wait: 'PT12H' }, price: M(1000), expires: DAY } }, { from: farm.id, to: hotel.id, what: eggs.hash })
    answer(s, hotel, moon, { status: 'accepted' })
    const seen = s.say(sighter, 'observe', { kind: 'moon_sighted' }, { for: moon.hash }, { time: '2026-11-10T18:00:00.000Z' })
    stage('E4: an event repeat: each sighting is an occurrence, due its wait after the sighting, unpaid until a payment names it', moon, s.held, { occurrences: [{ occurrence: seen.hash, due: '2026-11-11T06:00:00.000Z', paid: null, paid_at: null }] })
    const one = s.say(farm, 'promise', { terms: { price: M(300), expires: DAY } }, { from: farm.id, to: hotel.id, what: eggs.hash })
    stage('E4: a promise that does not repeat reports no occurrences', one, s.held, { occurrences: [] })
    check('E4: state.occurrence goes on a payment', { type: 'transfer', state: { occurrence: '2026-11-06T09:00:00.000Z' }, refs: { what: '0'.repeat(64), to_owner: '0'.repeat(64) } }, ['shape'])
    check('E4: state.occurrence is a start time or a hash', { type: 'transfer', state: { money: M(100), occurrence: 'next friday' }, refs: { to_owner: '0'.repeat(64), for: '0'.repeat(64) } }, ['shape'])
    check('E4: a payment naming an occurrence by its start time', { type: 'transfer', state: { money: M(100), occurrence: '2026-11-06T09:00:00.000Z' }, refs: { to_owner: '0'.repeat(64), for: '0'.repeat(64) } }, [])
  }
  {
    // E5: a referee's ruling reaches an allocation on an open offer as it reaches an accept: one rule for every deal
    const s = story(), maya = s.person('e5maya'), tom = s.person('e5tom'), ref = s.person('e5ref')
    const rules = s.say(maya, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [ref.id] } })
    const eggs = s.say(maya, 'thing', { kind: 'eggs' })
    const dozen = (n) => fb.amount(String(n), '{dozen}')
    const offer = s.say(maya, 'promise', { terms: { price: { money: M(300), per: dozen(1) }, quantity: dozen(100), expires: DAY } }, { from: maya.id, what: eggs.hash, schema: rules.hash })
    const req = answer(s, tom, offer, { status: 'accepted', terms: { quantity: dozen(10) } })
    const alloc = s.say(maya, 'promise', { status: 'accepted', terms: { quantity: dozen(10) } }, { answers: req.hash, for: offer.hash })
    stage('E5: the first-come offer binds Tom\'s allocation', offer, s.held, { stage: 'accepted', takers: [{ allocation: alloc.hash }] })
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: alloc.hash, for: offer.hash })
    stage('E5: the deal\'s referee defeats the allocation: it binds nothing, as an accept the referee defeats binds nothing', offer, s.held, { stage: 'offered', takers: [] })
    stage('E5: and the allocation has no deal of its own', alloc, s.held, null)
  }
  {
    // E7: after her death was recorded under her own successor grant, her own gift of what her successor sold moves nothing: her broken promise
    const s = story(), agnes = s.person('e7agnes'), peter = s.person('e7peter'), nb = s.person('e7neighbour'), joseph = s.person('e7joseph'), mary = s.person('e7mary'), ruth = s.person('e7ruth')
    const succ = s.say(agnes, 'grant', { kind: 'successor', witnesses: [nb.id], needed: 1, wait: 'P7D' }, { to: peter.id })
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const bags = s.say(agnes, 'thing', { kind: 'maize', name: '10 bags' }, { of: maize.hash })
    const sacks = s.say(agnes, 'thing', { kind: 'maize', name: '5 sacks' }, { of: maize.hash })
    // a gift she made before any death was recorded, unseen by her successor: it still crosses his sale
    const early = s.say(agnes, 'transfer', {}, { what: sacks.hash, to_owner: ruth.id })
    s.say(ruth, 'transfer', { status: 'accepted' }, { answers: early.hash })
    const trig = s.say(nb, 'observe', { kind: 'trigger', text: 'Agnes died on Sunday' }, { under: succ.hash, subject: agnes.id })
    const close = s.say(peter, 'observe', { kind: 'close' }, { under: succ.hash, subject: agnes.id, after: [trig.hash] })
    const sell = (thing) => {
      const give = s.say(peter, 'transfer', {}, { what: thing.hash, to_owner: joseph.id, under: succ.hash }, { after: [close.hash] })
      s.say(joseph, 'transfer', { status: 'accepted' }, { answers: give.hash })
      return give
    }
    const g1 = sell(bags)
    const g2 = sell(sacks)
    s.say(agnes, 'observe', { kind: 'denial', text: 'not dead' }, { defeats: trig.hash })
    const later = s.say(agnes, 'transfer', {}, { what: bags.hash, to_owner: mary.id })
    s.say(mary, 'transfer', { status: 'accepted' }, { answers: later.hash })
    door('E7: her old phone, having seen her death recorded, gives the bags Peter sold Joseph to Mary: Joseph keeps them, with no conflict', 'ownership', [bags, s.held], { expect: { owner: joseph.id, transfers: [g1.hash], conflict: null } })
    door('E7: a gift she made before any death was recorded still crosses her successor\'s sale: the ownership fold shows the conflict', 'ownership', [sacks, s.held], { expect: { owner: agnes.id, transfers: [], conflict: [early.hash, g2.hash].sort() } })
  }
}

// ---- 27. Decisions F (2026-10-29): the anarcho-capitalist pass: no default the protocol fills in, no duty nobody signed ----
// Each rule has its vector here; each vector a rule flipped is retired below and twinned here under a new name.
{
  {
    // F1: the protocol keeps no admission default: only a rule that states an order channel refuses an autonomous system's first block
    for (const name of ['not_human: a first block to a stranger that an agent signed', "admission_refusals: the agent's first block to a person who has stopped its principal is refused: not_human only (the STOP is read by the fold, not refused)"]) {
      const old = V.door.find((c) => c.name === name)
      if (!old) continue
      const [block, receiver, held, rule, today] = old.args
      door(`F1: ${name}, under a rule that states an empty order channel`, 'admission_refusals', [block, receiver, held, { ...(rule || {}), order_channel: [] }, today], { expect: [{ code: 'not_human' }] })
      door(`F1: the same block under a rule that names no order channel: the protocol refuses nothing (${name.split(':')[0]})`, 'admission_refusals', [block, receiver, held, rule || {}, today], { expect: [], exact: true })
    }
  }
  {
    // F2: a circle states its removal rule; a signal that may name more than one signer states how many
    check('F2: a circle whose roles carry admit or remove and states no removal rule is refused', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }] } }, ['required'])
    check('F2: the same circle stating removal { needed: 1 } stands', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }], removal: { needed: 1 } } }, [])
    check('F2: a circle whose roles carry admit alone states it too: taking admit away is removal-like', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'host', powers: ['sign', 'admit'] }] } }, ['required'])
    check('F2: a circle whose roles carry neither admit nor remove needs no removal rule: it removes no one', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'voice', powers: ['sign'] }] } }, [])
    const s = story(), a = s.person('f2a'), b = s.person('f2b'), x = s.person('f2x')
    const club = s.say(x, 'actor', { kind: 'circle', roles: [{ name: 'judge', powers: [] }], removal: { needed: 1 } })
    s.say(a, 'observe', { kind: 'rain', amount: fb.amount('12', 'mm') })
    const now = '2027-01-01T00:00:00.000Z'
    holds('F2: a signal two names may sign, with no signers stated, does not hold: the protocol keeps no default', { signal: 'rain', by: [a.id, b.id].sort() }, s.held, now, false)
    holds('F2: the same signal with signers 1 stated holds on one of them', { signal: 'rain', by: [a.id, b.id].sort(), signers: 1 }, s.held, now, true)
    holds('F2: a signal one id may sign needs no signers: one is its plain meaning', { signal: 'rain', by: [a.id] }, s.held, now, true)
    holds('F2: a signal a role may sign, with no signers stated, does not hold', { signal: 'rain', by: [club.hash + '#judge'] }, s.held, now, false)
  }
  {
    // F7: a block whose body is held is nothing new, whatever order the store lists its header and its body in; a node may say so
    const s = story(), ann = s.person('f7ann')
    const note = s.say(ann, 'observe', { kind: 'note', text: 'oven at 6' })
    const header = call('header', note)
    const headerOnly = { version: '1.7', header, header_signature: fb.signMessage(header, keyOf('f7ann').private_key).signature }
    const before = s.held.filter((b) => b.hash !== note.hash)
    door('F7: accept: a block held whole beside its own public header is held: pushed again it is nothing new, neither taken nor refused', 'accept', [[note], [...before, note, headerOnly], null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [] } })
    door('F7: accept: and the same with the header listed first', 'accept', [[note], [...before, headerOnly, note], null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [] } })
    door('F7: accept: a body arriving for a header held alone is the other half: taken', 'accept', [[note], [...before, headerOnly], null, null], { expect: { taken: [note.hash] } })
    const node = keyOf('f7node')
    const answer = door('F7: push_answer: a node may list the blocks of the push it already held, ascending', 'push_answer', [{ taken: [], waiting: [], refused: [], equivocations: [], held: [note.hash, ann.id].sort().reverse() }, ann.id, node.private_key, 'std'], { expect: { held: [note.hash, ann.id].sort(), taken: [] } })
    assert.ok(answer.signature)
    const plain = door('F7: push_answer: a node that says nothing of what it held gives no held key', 'push_answer', [{ taken: [], waiting: [], refused: [], equivocations: [] }, ann.id, node.private_key, 'std'])
    assert.equal(plain.held, undefined)
  }
  {
    // F7: where a thing is now reads each move by whoever owned the thing where that move stands
    const s = story(), maker = s.person('f7maker'), buyer = s.person('f7buyer'), mover = s.person('f7mover')
    const shed = s.say(maker, 'thing', { kind: 'place', name: 'the shed' })
    const yard = s.say(buyer, 'thing', { kind: 'place', name: 'the yard' })
    const crate = s.say(maker, 'thing', { kind: 'crate' })
    s.say(maker, 'transfer', {}, { what: crate.hash, to_place: shed.hash })
    const sale = s.say(maker, 'transfer', {}, { what: crate.hash, to_owner: buyer.id })
    const took = s.say(buyer, 'transfer', { status: 'accepted' }, { answers: sale.hash })
    door('F7: where_now: the crate sold stays where its maker put it while it was hers', 'where_now', [crate, s.held], { expect: [shed.hash], exact: true })
    const lane = s.say(maker, 'thing', { kind: 'place', name: 'the lane' })
    s.say(maker, 'transfer', {}, { what: crate.hash, to_place: lane.hash }, { after: [took.hash] })
    door('F7: where_now: a move by the maker that has seen the sale counts for nothing: she no longer owns it there', 'where_now', [crate, s.held], { expect: [shed.hash], exact: true })
    s.say(buyer, 'transfer', {}, { what: crate.hash, to_place: yard.hash })
    door('F7: where_now: the buyer moves it: the yard', 'where_now', [crate, s.held], { expect: [yard.hash], exact: true })
    void mover
  }
  {
    // F7 (f6 twin): crossing rotations on one prev pair with each other, never with the first block of the device key their prev brought in
    const A = genesis(keyOf('f6ann'), { kind: 'person', at: '2026-10-27T12:00:00.000Z' })
    const sig = (key, type, state, refs) => { const c = fb.create(type, { audience: 'public', ...state }, { author: A.hash, ...refs }); return { ...c, signature: fb.sign(c, keyOf(key).private_key) } }
    const p = sig('f6ann', 'observe', { kind: 'note', text: 'first', seq: 1, at: '2026-10-27T12:01:00.000Z' }, { prev: A.hash })
    const kg = sig('f6ann', 'grant', { kind: 'key', public_key_sign: keyOf('f6phone').public_key_sign, seq: 2, at: '2026-10-27T12:02:00.000Z' }, { subject: A.hash, prev: p.hash })
    const phone = sig('f6phone', 'observe', { kind: 'note', text: 'from the phone', seq: 1, at: '2026-10-27T12:03:00.000Z' }, { prev: kg.hash })
    const r1 = sig('f6ann', 'grant', { kind: 'key', public_key_sign: keyOf('f6new1').public_key_sign, replaces: keyOf('f6ann').public_key_sign, counted_to: kg.hash, seq: 3, at: '2026-10-27T12:04:00.000Z' }, { subject: A.hash, prev: kg.hash })
    const r2 = sig('f6ann', 'grant', { kind: 'key', public_key_sign: keyOf('f6new2').public_key_sign, replaces: keyOf('f6ann').public_key_sign, counted_to: kg.hash, seq: 3, at: '2026-10-27T12:05:00.000Z' }, { subject: A.hash, prev: kg.hash })
    door('F7: accept: crossing rotations on one prev pair with each other, never with the first block of the key their prev brought in (f6 twin)', 'accept', [[r2], [A, p, kg, phone, r1], null, null], { expect: { taken: [], equivocations: [[r1.hash, r2.hash].sort()] } })
  }
}

// ---- 28. Pass G (2026-10-29): no fill for a silent field, one reading where code had two ----
// Each rule has its vector here; each vector a rule flipped is retired below and twinned here (or in place) under a name marked "G<n>:".
{
  {
    // G20: of several covers answers by the payee, the latest in causal order counts; answers that do not see each other say nothing of it
    const s = story(), ann = s.person('g20ann'), bea = s.person('g20bea'), cal = s.person('g20cal'), cafe = s.person('g20cafe'), farm = s.person('g20farm')
    const tea = s.say(farm, 'thing', { kind: 'tea' })
    const sale = (from, as) => {
      const p = s.say(from, 'promise', { terms: { price: M(10000), expires: DAY } }, { from: as ? as.hash : from.id, to: cafe.id, what: tea.hash, ...(as ? { as: as.hash } : {}) })
      answer(s, cafe, p, { status: 'accepted' })
      return p
    }
    const a = sale(farm)
    const t = s.say(cafe, 'transfer', { money: M(5000) }, { to_owner: farm.id, for: a.hash })
    s.say(farm, 'transfer', { status: 'accepted', covers: M(7000) }, { answers: t.hash, for: a.hash })
    s.say(farm, 'transfer', { status: 'accepted', covers: M(6000) }, { answers: t.hash, for: a.hash })
    stage('G20: her later answer says the payment covers less than her earlier one: the later word counts (before: the most she granted, 7000)', a, s.held, { stage: 'underway', paid: { minor: 6000, currency: 'GBP' } })
    // a payee that is a circle: two treasurers answer one payment as the circle, neither seeing the other
    const stall = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'G20 stall', roles: [{ name: 'treasurer', powers: ['sign', 'admit', 'remove'] }] })
    const into = (who) => { const g = s.say(ann, 'grant', { kind: 'member', roles: ['treasurer'] }, { subject: stall.hash, to: who.id, as: stall.hash }); return s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: stall.hash }) }
    into(bea)
    into(cal)
    const b = sale(ann, stall)
    const pay = s.say(cafe, 'transfer', { money: M(5000) }, { to_owner: stall.hash, for: b.hash })
    const y1 = s.say(bea, 'transfer', { status: 'accepted', covers: M(7000) }, { answers: pay.hash, for: b.hash, as: stall.hash })
    const y2 = s.say(cal, 'transfer', { status: 'accepted', covers: M(9000) }, { answers: pay.hash, for: b.hash, as: stall.hash })
    stage('G20: two answers of the payee that do not see each other say nothing of what it covers: the payment counts for its own money (before: the most, 9000)', b, s.held, { stage: 'underway', paid: { minor: 5000, currency: 'GBP' } })
    s.say(ann, 'transfer', { status: 'accepted', covers: M(8000) }, { answers: pay.hash, for: b.hash, as: stall.hash, after: [y1.hash, y2.hash].sort() })
    stage('G20: a third answer that sees both is her latest word: it counts (before: the most, 9000)', b, s.held, { stage: 'underway', paid: { minor: 8000, currency: 'GBP' } })
  }
  {
    // G54: a block with no `at` has an unknown time in every fold (blocks.md, No clock): no fold falls back to another block's time
    const s = story(), farm = s.person('g54farm'), cafe = s.person('g54cafe'), edge = s.person('g54edge')
    const tea = s.say(farm, 'thing', { kind: 'tea' })
    const p = s.say(farm, 'promise', { terms: { price: M(1000), expires: DAY } }, { from: farm.id, to: cafe.id, what: tea.hash })
    answer(s, cafe, p, { status: 'accepted' })
    const pay = s.say(cafe, 'transfer', { money: M(1000) }, { to_owner: farm.id, for: p.hash })
    const took = s.keep(fb.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: p.hash }, { author: farm.id, key: keyOf('g54farm'), held: s.held, clockless: true }))
    assert.equal(took.state.at, undefined)
    stage('G54: the payee\'s answer has no time: paid in full, paid_at unknown (null), not the payment\'s own at', p, s.held, { paid: { minor: 1000, currency: 'GBP' }, paid_at: null })
    s.say(edge, 'observe', { kind: 'receipt' }, { derives_from: took.hash }, { time: '2026-11-01T10:00:00.000Z' })
    stage('G54: an edge\'s receipt of the answer is a reading for a reader who trusts that edge; no fold reads it as the answer\'s time', p, s.held, { paid: { minor: 1000, currency: 'GBP' }, paid_at: null })
  }
  {
    // G106: residency: a receiver that states a holds_in refuses a block whose stays_in leaves it out; one that states none refuses nothing
    const s = story(), ann = s.person('g106ann')
    const eu = s.say(ann, 'observe', { kind: 'note', text: 'stays in the EU', stays_in: ['EU'] })
    door('G106: residency: a receiver that states no holds_in (an empty list) refuses nothing (before: the core refused it, the oracle did not)', 'residency_refusals', [eu, []], { expect: [], exact: true })
    door('G106: residency: a receiver that states no holds_in at all (null) refuses nothing (before: refused, in the core and the oracle)', 'residency_refusals', [eu, null], { expect: [], exact: true })
    door('G106: residency: a receiver that holds in DE is not inside EU: no label is expanded', 'residency_refusals', [eu, ['DE']], { expect: [{ code: 'residency' }] })
    door('G106: residency: a receiver that holds in EU and US is not inside a block that stays in EU alone', 'residency_refusals', [eu, ['EU', 'US']], { expect: [{ code: 'residency' }] })
    const none = s.say(ann, 'observe', { kind: 'note', text: 'stays nowhere named', stays_in: [] })
    door('G106: residency: an empty stays_in asks nothing (before: the oracle refused it, the core did not)', 'residency_refusals', [none, ['EU']], { expect: [], exact: true })
  }
  {
    // G93: the circle fold fills in no removal.needed. A circle whose roles carry admit or remove and that states none is refused by the
    // check (decision F2), so no fold reads it at all (a fold reads only valid blocks): the old fill of 1 could never be reached
    const s = story(), x = s.person('g93x'), b = s.person('g93b')
    const club = s.raw(x, 'actor', { kind: 'circle', name: 'G93 club', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }] })
    check('G93: a circle with admit or remove and no removal.needed is refused', { type: 'actor', state: { kind: 'circle', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }] } }, ['required'])
    const g = s.say(x, 'grant', { kind: 'member', roles: ['admin'] }, { subject: club.hash, to: b.id, as: club.hash })
    s.say(b, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: club.hash })
    door('G93: and it has no circle state: no fold reads a removal number it does not state', 'circle_state', [club.hash, s.held], { expect: null, exact: true })
  }
  {
    // G94/G135: the successor view fills in no needed (no 1) and no wait (no ""): with either absent or malformed it never fires.
    // The check refuses such a grant (profiles/successor.md: both are required), and a trigger under it rests on a block no node
    // takes, so no fold ever reached the old fill: each case is pinned here, signed by hand, each by its own person and witness
    const s = story(), kid = s.person('g94kid')
    let n = 0
    const view = (name, state, expect) => {
      const mum = s.person('g94mum' + n), wit = s.person('g94wit' + n++)
      const grant = s.raw(mum, 'grant', { kind: 'successor', witnesses: [wit.id], ...state }, { to: kid.id })
      const t = s.say(wit, 'observe', { kind: 'trigger', text: 'she died' }, { under: grant.hash, subject: mum.id })
      door(name, 'successor_view', [grant, s.held, AFTER, { [t.hash]: '2027-01-01T00:00:00.000Z' }], { expect: { ...expect, events: expect.events ? [t.hash] : [] }, exact: true })
    }
    const never = { cancelled: [], since: null, fires: null, fired: false }
    view('G94: a successor grant that states no needed never fires', { wait: 'P7D' }, never)
    view('G94: a successor grant whose needed is not a whole number never fires', { needed: 1.5, wait: 'P7D' }, never)
    view('G94: a successor grant whose needed is 0 never fires', { needed: 0, wait: 'P7D' }, never)
    view('G94: a successor grant that states no wait never fires', { needed: 1 }, never)
    view('G94: the same grant with needed and wait stated fires', { needed: 1, wait: 'P7D' }, { events: true, cancelled: [], since: '2027-01-01T00:00:00.000Z', fires: '2027-01-08T00:00:00.000Z', fired: true })
  }
  {
    // G98: the view reads only the stage's exact paid_up; an open offer, which no one settles, is never read as paid and done
    const s = story(), maya = s.person('g98maya'), tom = s.person('g98tom')
    const noise = s.say(maya, 'thing', { kind: 'schema', name: 'loud music after ten' })
    const quiet = s.say(maya, 'promise', { terms: { refrain: true, until: '2027-03-01T00:00:00.000Z', quantity: fb.amount('3', '{night}'), expires: DAY } }, { from: maya.id, what: noise.hash })
    const req = answer(s, tom, quiet, { status: 'accepted', terms: { quantity: fb.amount('1', '{night}') } })
    s.say(maya, 'promise', { status: 'accepted', terms: { quantity: fb.amount('1', '{night}') } }, { answers: req.hash, for: quiet.hash })
    view('H15: G98: an open refrain offer that binds is elapsed once its until has passed: a fact of its term, never a word that it was kept (before: accepted)', quiet, s.held, '2027-06-01T00:00:00.000Z', { stage: 'elapsed' })
    holds('H15: G98: settled: an open refrain offer is settled by no one, elapsed or not', { settled: quiet.hash }, s.held, '2027-06-01T00:00:00.000Z', false)
  }
  {
    // G104/G139: a listed party is exempt from the stranger count only for a block whose key still speaks for that party
    const s = story(), boss = s.person('g104boss'), friend = s.person('g104friend')
    const note = s.say(friend, 'observe', { kind: 'note', text: 'mine' })
    const phone = fb.keypairFromSeed(sha('foodblock 1.7 vectors: g104 phone'), 'std')
    const rot = s.keep(fb.identity.keyGrant(friend.id, phone.public_key_sign, { private_key: keyOf('g104friend').private_key, last: note, broughtIn: friend.id }, { replaces: keyOf('g104friend').public_key_sign, countedTo: note.hash, at: at() }))
    const fromPhone = s.keep(fb.write('observe', { kind: 'note', text: 'from the phone' }, {}, { author: friend.id, key: phone, held: s.held, at: at() }))
    const thief = s.raw(friend, 'observe', { kind: 'note', text: 'not hers' })
    assert.equal(thief.refs.prev, rot.hash)
    const rule = { parties: [friend.id], per_stranger: 0 }
    door('G104: a listed party\'s block by her live key is exempt from the count', 'admission_refusals', [fromPhone, boss.id, s.held, rule, 0], { expect: [], exact: true })
    door('G104: a block of her key rotated out past its counted line is counted as anyone else\'s: refused at per_stranger 0 (before: exempt by her name alone)', 'admission_refusals', [thief, boss.id, s.held, rule, 0], { expect: [{ code: 'not_admitted' }] })
    door('G104: the same block under a rule that does not list her is refused, as before', 'admission_refusals', [thief, boss.id, s.held, { parties: [], per_stranger: 0 }, 0], { expect: [{ code: 'not_admitted' }] })
  }
  {
    // G105 (forks only): an answer of the receiver's that is half of a fork binds no one, so it makes no sender a non-stranger
    const s = story(), ann = s.person('g105ann'), bot = s.person('g105bot', { kind: 'agent' }), bea = s.person('g105bea'), bot2 = s.person('g105bot2', { kind: 'agent' })
    const hello = s.say(bot, 'observe', { kind: 'note', text: 'hello, I sell eggs' }, { to: ann.id })
    const other = s.say(ann, 'observe', { kind: 'note', text: 'shopping list' })
    s.keep(fb.write('observe', { kind: 'note', text: 'hi', status: 'accepted' }, { answers: hello.hash }, { author: ann.id, key: keyOf('g105ann'), held: s.held.filter((b) => b !== other), at: at() }))
    const next = s.say(bot, 'observe', { kind: 'note', text: 'a dozen for 3 pounds?' }, { to: ann.id })
    door('G105: the receiver\'s only answer to the agent is half of a fork: the agent is still a stranger, outside the order channel (before: the forked answer made it none)', 'admission_refusals', [next, ann.id, s.held, { order_channel: [] }, 0], { expect: [{ code: 'not_human' }] })
    const hello2 = s.say(bot2, 'observe', { kind: 'note', text: 'hello, I sell milk' }, { to: bea.id })
    s.say(bea, 'observe', { kind: 'note', text: 'hi', status: 'accepted' }, { answers: hello2.hash })
    const next2 = s.say(bot2, 'observe', { kind: 'note', text: 'a pint for 1 pound?' }, { to: bea.id })
    door('G105: an answer that counts makes the agent no stranger: nothing refused', 'admission_refusals', [next2, bea.id, s.held, { order_channel: [] }, 0], { expect: [], exact: true })
  }
  {
    // G110: a genesis that names a recovery key and no recovery_reach is refused; the reader then never guesses a reach (no "")
    const R = keyOf('g110recovery').public_key_sign
    const base = { kind: 'person', at: '2026-10-29T12:00:00.000Z', audience: 'public', public_key_sign: keyOf('g110').public_key_sign }
    door('G110: a genesis with recovery_key_hash and no recovery_reach is refused', 'refusals', ['actor', { ...base, recovery_key_hash: fb.identity.recoveryKeyHash(R) }, {}, [], null], { expect: [{ code: 'bad_genesis' }] })
    door('G110: a genesis with an empty recovery_reach is refused', 'refusals', ['actor', { ...base, recovery_key_hash: fb.identity.recoveryKeyHash(R), recovery_reach: '' }, {}, [], null], { expect: [{ code: 'time' }] })
  }
  {
    // G112: durations in a grant chain compare from the parent's own at; a parent with no at gives no instant, and no year 2000 is filled in.
    // A grant always carries state.at (the check refuses one without), so the parent here is signed by hand: the old anchor was reached
    // only by a block no node takes
    const s = story(), pr = s.person('g112prin'), mid = s.person('g112mid')
    const parent = s.raw(pr, 'grant', { kind: 'shop', depth: 1, scope: { acts: ['promise'], until: LATER, limit: M(10000), every: 'P1M', notice: 'P2D' } }, { to: mid.id })
    delete parent.state.at
    parent.hash = fb.hash(parent.type, parent.state, parent.refs)
    parent.signature = fb.sign({ type: parent.type, state: parent.state, refs: parent.refs }, keyOf('g112prin').private_key)
    const child = (scope) => ({ type: 'grant', state: { kind: 'shop', scope: { acts: ['promise'], until: LATER, limit: M(10000), ...scope } }, refs: { parent: parent.hash, to: pr.id, author: mid.id } })
    check('H14: G112: under a parent with no at, a child\'s every and notice cannot be compared: wider_than_parent (before: compared from 2000-01-01 in the core, not at all in the oracle)', child({ every: 'P1M', notice: 'P2D' }), ['wider_than_parent'], s.held)
    const dated = s.say(pr, 'grant', { kind: 'shop', depth: 1, scope: { acts: ['promise'], until: LATER, limit: M(10000), every: 'P1M', notice: 'P2D' } }, { to: mid.id })
    check('G112: the same child under a parent with an at is within it', { ...child({ every: 'P1M', notice: 'P2D' }), refs: { parent: dated.hash, to: pr.id, author: mid.id } }, [], s.held)
    check('H14: G112: under a parent with no at, a child that drops every is wider, as before', child({ notice: 'P2D' }), ['wider_than_parent'], s.held)
  }
  {
    // G141: a pull answer is signed by the node when a private key is given; the signature is exact bytes (Ed25519, and RFC 6979 for p256)
    const s = story(), ann = s.person('g141ann'), node = s.person('g141node')
    const note = s.say(ann, 'observe', { kind: 'note', text: 'bread at 7' })
    const log = [{ n: 1, block: ann.g }, { n: 2, block: note }]
    const signed = door('G141: answer_pull with the node\'s private key carries its signature, exactly', 'answer_pull', [log, {}, node.id, keyOf('g141node').private_key, 10, null, null, null, null], { exact: true })
    assert.ok(typeof signed.signature === 'string' && fb.verifyMessage(signed, keyOf('g141node').public_key_sign))
    const p256 = fb.keypairFromSeed(sha('foodblock 1.7 vectors: g141 p256 node'), 'p256')
    const signed2 = door('G141: answer_pull signed in p256: the RFC 6979 nonce makes the bytes the same in every implementation', 'answer_pull', [log, {}, node.id, p256.private_key, 10, null, null, 'p256', null], { exact: true })
    assert.ok(fb.verifyMessage(signed2, p256.public_key_sign))
    const plain = door('G141: answer_pull with no private key carries no signature', 'answer_pull', [log, {}, node.id, null, 10, null, null, null, null], { exact: true })
    assert.equal(plain.signature, undefined)
  }
  // (pass G: more cases above this line)
}

// ---- 29. Decisions H (2026-10-29): the reader decides; the protocol refuses no word it can read ----
// Each rule has its vector here; each vector a rule flipped is retired below and twinned here (or in place) under a name marked "H<n>:".
{
  {
    // H2: more than one referee and no number signed: no ruling counts; one name alone rules; a number both signed rules
    const s = story(), seller = s.person('h2seller'), buyer = s.person('h2buyer'), ref = s.person('h2ref'), judge = s.person('h2judge')
    const tea = s.say(seller, 'thing', { kind: 'tea' })
    const deal = (grounds, lot, later) => {
      const rules = s.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds })
      const p = s.say(seller, 'promise', { terms: { price: M(5000), expires: DAY } }, { from: seller.id, to: buyer.id, what: tea.hash, schema: rules.hash })
      answer(s, buyer, p, { status: 'accepted' })
      const chest = s.say(seller, 'thing', { kind: 'tea', lot }, { of: tea.hash })
      const give = s.say(seller, 'transfer', {}, { what: chest.hash, to_owner: buyer.id, for: p.hash })
      s.say(buyer, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash })
      let named = null
      if (later) {
        named = s.say(buyer, 'grant', { kind: 'referee', scope: { until: LATER } }, { to: judge.id, subject: p.hash })
        s.say(seller, 'grant', { status: 'accepted' }, { answers: named.hash })
      }
      return { p, give, named }
    }
    const a = deal({ confirmers: [ref.id] }, 'H2a', false)
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: a.give.hash, for: a.p.hash })
    stage('H2: one confirmer and no number: one name is its plain meaning, and its ruling counts', a.p, s.held, { stage: 'accepted', lines: [{ moved: 0 }] })
    const b = deal({ confirmers: [ref.id] }, 'H2b', true)
    s.say(ref, 'observe', { kind: 'ruling' }, { defeats: b.give.hash, for: b.p.hash })
    stage('H2: one confirmer and a judge named later, no number signed: the confirmer\'s ruling alone counts for nothing', b.p, s.held, { stage: 'underway', lines: [{ moved: null }] })
    const c = deal({ confirmers: [ref.id], needed: 1 }, 'H2c', true)
    s.say(judge, 'observe', { kind: 'ruling' }, { defeats: c.give.hash, for: c.p.hash, after: [c.named.hash] })
    stage('H2: with needed 1 in the schema both sides signed, the judge named later rules alone: the delivery counts for nothing', c.p, s.held, { stage: 'accepted', lines: [{ moved: 0 }] })
  }
  {
    // H9: a referee both sides signed for counts even when tied to a side; the tie is a fact beside the stage. A side alone never judges,
    // and a role a side gave after the deal bound makes no referee
    const s = story(), agnes = s.person('h9agnes'), boss = s.person('h9boss'), clerk = s.person('h9clerk'), late = s.person('h9late')
    const maize = s.say(agnes, 'thing', { kind: 'maize' })
    const coop = s.say(boss, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'H9 co-op', roles: [{ name: 'chair', powers: ['sign', 'admit', 'remove'] }, { name: 'arbiter', powers: [] }] })
    const made = s.say(boss, 'grant', { kind: 'member', roles: ['arbiter'] }, { subject: coop.hash, to: clerk.id, as: coop.hash })
    s.say(clerk, 'grant', { status: 'accepted', kind: 'member' }, { answers: made.hash, subject: coop.hash })
    const rules = s.say(agnes, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [coop.hash + '#arbiter'] } })
    const p = s.say(agnes, 'promise', { terms: { price: M(900000, 'KES'), expires: DAY } }, { from: agnes.id, to: coop.hash, what: maize.hash, schema: rules.hash })
    const yes = answer(s, boss, p, { status: 'accepted' }, { as: coop.hash })
    const bags = s.say(agnes, 'thing', { kind: 'maize', lot: 'H9' }, { of: maize.hash })
    const give = s.say(agnes, 'transfer', {}, { what: bags.hash, to_owner: coop.hash, for: p.hash })
    s.say(boss, 'transfer', { status: 'accepted' }, { answers: give.hash, for: p.hash, as: coop.hash })
    // a role the co-op gave after the deal bound: its holder rules on nothing
    const later = s.say(boss, 'grant', { kind: 'member', roles: ['arbiter'] }, { subject: coop.hash, to: late.id, as: coop.hash, after: [yes.hash] })
    const ly = s.say(late, 'grant', { status: 'accepted', kind: 'member' }, { answers: later.hash, subject: coop.hash })
    s.say(late, 'observe', { kind: 'ruling' }, { defeats: give.hash, for: p.hash, after: [ly.hash] })
    stage('H9: an arbiter role the co-op (a side) gave by a grant signed as the co-op after the deal bound makes no referee: its holder rules on nothing, the tie of the name shown', p, s.held, { stage: 'underway', lines: [{ moved: null }], referee_ties: [{ referee: coop.hash + '#arbiter', side: 'to', how: 'role' }] })
    s.say(clerk, 'observe', { kind: 'ruling' }, { defeats: give.hash, for: p.hash })
    stage('H9: a role inside a side\'s circle that both sides signed for counts: the clerk\'s ruling (appointed before the deal) makes the delivery count for nothing; the tie is shown beside the stage', p, s.held, { stage: 'accepted', lines: [{ moved: 0 }], referee_ties: [{ referee: coop.hash + '#arbiter', side: 'to', how: 'role' }] })
    // a side alone never judges: the boss signs as the co-op, so its block speaks for a side
    const s2 = story(), seller = s2.person('h9seller'), buyer = s2.person('h9buyer')
    const tea = s2.say(seller, 'thing', { kind: 'tea' })
    const own = s2.say(seller, 'thing', { kind: 'schema', target: 'promise', grounds: { confirmers: [buyer.id] } })
    const q = s2.say(seller, 'promise', { terms: { price: M(5000), expires: DAY } }, { from: seller.id, to: buyer.id, what: tea.hash, schema: own.hash })
    answer(s2, buyer, q, { status: 'accepted' })
    const chest = s2.say(seller, 'thing', { kind: 'tea', lot: 'H9b' }, { of: tea.hash })
    const g2 = s2.say(seller, 'transfer', {}, { what: chest.hash, to_owner: buyer.id, for: q.hash })
    s2.say(buyer, 'transfer', { status: 'accepted' }, { answers: g2.hash, for: q.hash })
    s2.say(buyer, 'observe', { kind: 'ruling' }, { defeats: g2.hash, for: q.hash })
    stage('H9: a side named as its own deal\'s referee rules on nothing, though both signed the schema: a side alone never judges (its defeat is a dispute)', q, s2.held, { stage: 'underway', lines: [{ moved: null }], disputed: [{ by: 'to' }], referee_ties: [] })
  }
  {
    // H17: a condition that another deal binds: { accepted: <its first promise> }, read from that deal's own stage
    const s = story(), kofi = s.person('h17kofi'), york = s.person('h17york'), leeds = s.person('h17leeds')
    const tom = s.say(kofi, 'thing', { kind: 'tomatoes' })
    const kg = (n) => fb.amount(String(n), 'kg')
    const pair = () => {
      const y = s.say(kofi, 'promise', { terms: { price: M(6000), quantity: kg(20), expires: DAY } }, { from: kofi.id, to: york.id, what: tom.hash })
      const l = s.say(kofi, 'promise', { terms: { price: M(4000), quantity: kg(20), expires: DAY, condition: { accepted: y.hash } } }, { from: leeds.id, to: kofi.id, what: tom.hash })
      const ly = answer(s, leeds, l, { status: 'accepted' })
      return { y, l, ly }
    }
    const a = pair()
    holds('H17: the accepted condition does not hold while York has not answered Kofi\'s offer', a.l.state.terms.condition, s.held, BEFORE, false)
    stage('H17: Leeds accepts Kofi\'s ask, conditioned on York accepting his York offer, before York answers: it binds nothing yet (asked)', a.l, s.held, { stage: 'asked', accept: null })
    answer(s, york, a.y, { status: 'accepted' })
    holds('H17: York accepts: the condition holds, read from York\'s deal', a.l.state.terms.condition, s.held, BEFORE, true)
    stage('H17: York accepts: the Leeds ask binds, on the accept Leeds already signed', a.l, s.held, { stage: 'accepted', accept: a.ly.hash })
    const b = pair()
    answer(s, york, b.y, { status: 'declined' })
    holds('H17: York declines: the condition does not hold', b.l.state.terms.condition, s.held, BEFORE, false)
    stage('H17: York declines: the Leeds ask binds nothing', b.l, s.held, { stage: 'asked', accept: null })
    const c = pair()
    view('H17: York lets the offer lapse: the Leeds ask binds nothing, past its own expires too', c.l, s.held, AFTER, { stage: 'expired', accept: null })
    holds('H17: a condition naming a block no reader holds does not hold', { accepted: sha('h17 nothing') }, s.held, BEFORE, false)
    holds('H17: a condition whose accepted is not a hash does not hold', { accepted: 7 }, s.held, BEFORE, false)
    // a deal stopped onward did bind: the condition still holds
    const d = pair()
    const dy = answer(s, york, d.y, { status: 'accepted' })
    answer(s, york, d.y, { status: 'stopped', stop: 'onward' }, { after: [dy.hash] })
    holds('H17: a deal stopped onward did bind: the condition holds', d.l.state.terms.condition, s.held, BEFORE, true)
  }
  {
    // H18 and H16: the offerer's accept of a counter to her open offer binds a deal between the two; the open offer stays live for
    // others, and the counter's quantity counts against it (Ana offers 14 loaves; Bea counters 12 at 2.20; Ana accepts; 2 remain)
    const s = story(), ana = s.person('h18ana'), bea = s.person('h18bea'), cal = s.person('h18cal'), dan = s.person('h18dan')
    const loaf = s.say(ana, 'thing', { kind: 'loaf' })
    const L = (n) => fb.amount(String(n), '{loaf}')
    const O = s.say(ana, 'promise', { terms: { price: { money: M(250), per: L(1) }, quantity: L(14), expires: DAY } }, { from: ana.id, what: loaf.hash })
    const counter = answer(s, bea, O, { terms: { price: { money: M(220), per: L(1) }, quantity: L(12), expires: DAY } }, { to: bea.id })
    stage('H18: a counter to an open offer its offerer has not accepted binds nothing: the offer is offered', O, s.held, { stage: 'offered', quantity: null, takers: [] })
    const yes = s.say(ana, 'promise', { status: 'accepted' }, { answers: counter.hash, for: O.hash, after: [counter.hash] })
    stage('H18: Ana accepts Bea\'s counter of 12 at 2.20 to her open offer of 14: it binds, and the 12 count against the 14 (before: nothing bound)', O, s.held, { stage: 'accepted', quantity: L(12), total: { minor: 2640, currency: 'GBP' }, takers: [{ who: bea.id, request: counter.hash, allocation: yes.hash, quantity: L(12) }] })
    stage('H18: and her accept is a deal of its own between the two, on the counter\'s own terms, whole', yes, s.held, { stage: 'accepted', offer: counter.hash, accept: yes.hash, quantity: L(12), total: { minor: 2640, currency: 'GBP' } })
    const req = answer(s, cal, O, { status: 'accepted', terms: { quantity: L(2) } })
    const alloc = s.say(ana, 'promise', { status: 'accepted', terms: { quantity: L(2) } }, { answers: req.hash, for: O.hash, after: [req.hash, yes.hash] })
    stage('H18: the open offer stays live for others: Cal\'s request for the 2 left, allocated, binds 14 in all, each deal at its own price', O, s.held, { stage: 'accepted', quantity: L(14), total: { minor: 3140, currency: 'GBP' } })
    const req2 = answer(s, dan, O, { status: 'accepted', terms: { quantity: L(1) } })
    s.say(ana, 'promise', { status: 'accepted', terms: { quantity: L(1) } }, { answers: req2.hash, for: O.hash, after: [req2.hash, alloc.hash] })
    stage('H16: the counters the offerer accepted count against her open offer\'s quantity: one more loaf allocated shows 15 bound of 14 (her broken promise, owed to each taker, never hidden)', O, s.held, { stage: 'accepted', quantity: L(15) })
    // a counter Ana never accepted, and one that names another seller, bind nothing
    const other = answer(s, dan, O, { terms: { price: { money: M(100), per: L(1) }, quantity: L(3), expires: DAY } }, { to: dan.id, from: cal.id })
    s.say(ana, 'promise', { status: 'accepted' }, { answers: other.hash, for: O.hash, after: [other.hash] })
    stage('H18: a counter that names another side than the offer\'s offerer binds nothing, even accepted', O, s.held, { stage: 'accepted', quantity: L(15) })
  }
  {
    // H11: the protocol refuses no word it can read: an ask with no expires, and a grant with or without scope.until, whatever its kind
    const ID = '0'.repeat(64)
    check('H11: an ask with no terms.expires is allowed: it lasts until its author stops it (before: ask_without_expires)', { type: 'promise', state: { what: 'eggs' }, refs: { to: AUTH } }, [])
    check('H11: a grant others act under with no scope.until is allowed: it lasts until its author stops it (before: scope_until)', { type: 'grant', state: { kind: 'shop', scope: { acts: ['promise', 'observe.note'], limit: M(5000), every: 'P7D' } }, refs: { to: ID } }, [])
    check('H11: a grant others act under with no scope at all is allowed (before: scope_until)', { type: 'grant', state: { kind: 'shop' }, refs: { to: ID } }, [])
    check('H11: a key grant with a scope.until is allowed: the key speaks until then (before: scope_until)', { type: 'grant', state: { kind: 'key', public_key_sign: keyOf('h11k').public_key_sign, scope: { until: LATER } }, refs: { subject: AUTH } }, [])
    check('H11: an operator grant with a scope.until is allowed: it answers for the machine until then (before: scope_until)', { type: 'grant', state: { kind: 'operator', scope: { until: LATER } }, refs: { to: ID } }, [])
    // a key grant with until: the key speaks for no block it dated at or after it
    const s = story(), ann = s.person('h11ann')
    const U = '2026-11-15T00:00:00.000Z'
    const phone = keyOf('h11phone')
    const kg = s.say(ann, 'grant', { kind: 'key', public_key_sign: phone.public_key_sign, scope: { until: U } }, { subject: ann.id }, { time: '2026-11-01T00:00:00.000Z' })
    const before = s.keep(fb.write('observe', { kind: 'note', text: 'before' }, {}, { author: ann.id, key: phone, held: s.held, at: '2026-11-10T00:00:00.000Z', audience: 'public', link: { seq: 1, prev: kg.hash } }))
    const after = s.keep(fb.write('observe', { kind: 'note', text: 'after' }, {}, { author: ann.id, key: phone, held: s.held, at: '2026-11-20T00:00:00.000Z', audience: 'public', link: { seq: 2, prev: before.hash } }))
    door('H11: a key brought in by a key grant with scope.until speaks for a block it dated before then', 'signed_by_author', [before, s.held, null], { expect: true, exact: true })
    door('H11: and for none it dated at or after it, like a cut at that time', 'signed_by_author', [after, s.held, null], { expect: false, exact: true })
    // an operator grant with until: a key grant it signs dated at or after the until brings no key in
    const op = s.person('h11op'), bot = s.person('h11bot', { kind: 'agent' })
    const og = s.say(op, 'grant', { kind: 'operator', scope: { until: U } }, { to: bot.id }, { time: '2026-11-01T00:00:00.000Z' })
    s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash }, { time: '2026-11-02T00:00:00.000Z' })
    const botNote = s.say(bot, 'observe', { kind: 'note', text: 'awake' }, {}, { time: '2026-11-03T00:00:00.000Z' })
    s.say(op, 'grant', { kind: 'key', public_key_sign: keyOf('h11bot1').public_key_sign, replaces: keyOf('h11bot').public_key_sign, counted_to: botNote.hash }, { subject: bot.id }, { time: '2026-11-10T00:00:00.000Z' })
    door('H11: an operator grant with scope.until answers for the machine until then: a key grant it signed before brings a key in', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('h11bot').public_key_sign }, { key: keyOf('h11bot1').public_key_sign }] })
    s.say(op, 'grant', { kind: 'key', public_key_sign: keyOf('h11bot2').public_key_sign, replaces: keyOf('h11bot1').public_key_sign, counted_to: botNote.hash }, { subject: bot.id }, { time: '2026-11-20T00:00:00.000Z' })
    door('H11: and one it signed dated at or after the until brings none', 'key_timeline', [bot.id, s.held, null], { expect: [{ key: keyOf('h11bot').public_key_sign }, { key: keyOf('h11bot1').public_key_sign }] })
    // a member grant with until: a block the member signs as the circle dated at or after it holds no role
    const boss = s.person('h11boss'), tess = s.person('h11tess')
    const C = s.say(boss, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'H11 stall', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'till', powers: ['sign'] }] }, {}, { time: '2026-11-01T00:00:00.000Z' })
    const inv = s.say(boss, 'grant', { kind: 'member', roles: ['till'], scope: { until: U } }, { subject: C.hash, to: tess.id, as: C.hash }, { time: '2026-11-02T00:00:00.000Z' })
    s.say(tess, 'grant', { status: 'accepted', kind: 'member' }, { answers: inv.hash, subject: C.hash }, { time: '2026-11-03T00:00:00.000Z' })
    const in1 = s.say(tess, 'observe', { kind: 'note', text: 'till open' }, { as: C.hash }, { time: '2026-11-10T00:00:00.000Z' })
    const in2 = s.say(tess, 'observe', { kind: 'note', text: 'till open again' }, { as: C.hash }, { time: '2026-11-20T00:00:00.000Z' })
    door('H11: a member grant with scope.until: a block the member signs as the circle dated before it speaks for the circle', 'may_act_as', [in1, C.hash, s.held], { expect: true, exact: true })
    door('H11: and one dated at or after it holds no role: the membership ended then, like a cut at that time', 'may_act_as', [in2, C.hash, s.held], { expect: false, exact: true })
    door('H11: the circle\'s state, a fold of the set, still lists her: whether her grant has ended now is the reader\'s clock (live_grant)', 'circle_state', [C.hash, s.held], { expect: { members: { [boss.id]: { roles: ['boss'] }, [tess.id]: { roles: ['till'] } } } })
    // cute: dateless cut (silence may only narrow, never widen): a block with no date is cut by a grant that has an until, like one dated after it
    const undated = s.keep(fb.write('observe', { kind: 'note', text: 'no date' }, {}, { author: ann.id, key: phone, held: s.held, clockless: true, audience: 'public', link: { seq: 3, prev: after.hash } }))
    door('cute: a key brought in by a key grant with scope.until speaks for no block that has no date: it is cut like one dated after the until', 'signed_by_author', [undated, s.held, null], { expect: false, exact: true })
    const in3 = s.keep(fb.write('observe', { kind: 'note', text: 'till, no date' }, { as: C.hash }, { author: tess.id, key: keyOf('h11tess'), held: s.held, clockless: true, audience: 'public', link: { seq: in2.state.seq + 1, prev: in2.hash } }))
    door('cute: a member grant with scope.until gives no role to a block that has no date: the membership is cut for it', 'may_act_as', [in3, C.hash, s.held], { expect: false, exact: true })
    // (an operator grant's relying block is a key grant, and a grant always carries its date: the cut is the same function, and no written block can show it)
  }
  {
    // H13: only an accept, a deal or a counter-offer from her makes a sender no stranger; a declined or stopped answer keeps him one
    const s = story(), ann = s.person('h13ann')
    const eggs = s.say(ann, 'thing', { kind: 'eggs' })
    let n = 0
    const sender = () => s.person('h13bot' + n++, { kind: 'agent' })
    const offer = (bot) => s.say(bot, 'promise', { terms: { price: M(300), expires: DAY } }, { from: bot.id, to: ann.id, what: eggs.hash })
    const next = (bot) => s.say(bot, 'observe', { kind: 'note', text: 'a dozen more?' }, { to: ann.id })
    const refused = (name, bot, expect) => door(name, 'admission_refusals', [next(bot), ann.id, s.held, { order_channel: [] }, 0], expect.length ? { expect } : { expect: [], exact: true })
    const b1 = sender(), o1 = offer(b1)
    answer(s, ann, o1, { status: 'declined' })
    refused('H13: her declined answer keeps the sender a stranger: his agent writes again outside the order channel (before: nothing refused)', b1, [{ code: 'not_human' }])
    const b2 = sender(), o2 = offer(b2)
    answer(s, ann, o2, { status: 'stopped', stop: 'before' })
    refused('H13: her stopped answer keeps him a stranger too (before: nothing refused)', b2, [{ code: 'not_human' }])
    const b3 = sender(), hi = s.say(b3, 'observe', { kind: 'note', text: 'hello' }, { to: ann.id })
    s.say(ann, 'observe', { kind: 'note', text: 'who is this?' }, { answers: hi.hash })
    refused('H13: a reply of hers with no status is no deal: he stays a stranger (before: nothing refused)', b3, [{ code: 'not_human' }])
    const b4 = sender(), o4 = offer(b4)
    answer(s, ann, o4, { status: 'accepted' })
    refused('H13: her accept makes him no stranger', b4, [])
    const b5 = sender(), o5 = offer(b5)
    answer(s, ann, o5, { terms: { price: M(250), expires: DAY } })
    refused('H13: her counter-offer makes him no stranger', b5, [])
    const b6 = sender()
    s.say(ann, 'promise', { terms: { price: M(300), expires: DAY } }, { from: b6.id, to: ann.id, what: eggs.hash })
    refused('H13: a deal she opened with him (her own promise naming him as a side) makes him no stranger', b6, [])
  }
  {
    // H10: a genesis may carry any audience; a reader verifies it once it holds it, and a node waits on a block whose genesis it lacks
    const s = story(), bob = s.person('h10bob'), node = s.person('h10node')
    const sam = keyOf('h10sam')
    const aud = fb.commit([bob.id], { [bob.id]: sha('h10 salt').slice(0, 32) })
    const state = { kind: 'person', at: '2026-10-29T12:00:00.000Z', audience: aud.audience, nonce: sha('h10 nonce').slice(0, 32), public_key_sign: sam.public_key_sign }
    const G = { hash: fb.hash('actor', state, {}), type: 'actor', state, refs: {}, signature: fb.sign({ type: 'actor', state, refs: {} }, sam.private_key) }
    door('H10: a genesis sealed to Bob, with its nonce, is valid: a genesis may carry any audience (before: bad_genesis)', 'valid', [G, [], null], { expect: [], exact: true })
    door('H10: a genesis whose audience is a list with no nonce is refused for its audience, as any private block', 'refusals', ['actor', { ...state, nonce: undefined }, {}, [], null], { expect: [{ code: 'audience' }] })
    const note = fb.write('observe', { kind: 'note', text: 'hello from Sam' }, {}, { author: G.hash, key: sam, held: [G], at: '2026-10-29T12:01:00.000Z', audience: 'public' })
    door('H10: a node that lacks the sealed genesis waits on its author\'s block, as for any need', 'accept', [[note], [], null, null], { expect: { taken: [], waiting: [{ hash: note.hash, needs: [G.hash] }], refused: [], equivocations: [] } })
    door('H10: once it holds the genesis (Bob opened his copy) it verifies the block and takes it', 'accept', [[note], [G], null, null], { expect: { taken: [note.hash], waiting: [], refused: [], equivocations: [] } })
    door('H10: the block is its author\'s once the genesis is held', 'signed_by_author', [note, [G], null], { expect: true, exact: true })
    door('H10: and its author\'s keys are read from the sealed genesis like any other', 'key_timeline', [G.hash, [G, note], null], { expect: [{ key: sam.public_key_sign }] })
    const log = [{ n: 1, block: G }, { n: 2, block: note }]
    door('H10: answer_pull sends nothing of a sealed genesis to an asker outside its audience: a genesis has no public header', 'answer_pull', [log, {}, node.id, null, 10, null, null, null, null], { expect: { blocks: [{ n: 2 }] } })
    const msg = fb.sealCopy(G, { keys: [fb.generateEncryptionKeypair().public_key_encrypt], reveals: [], privateKey: sam.private_key })
    door('H10: a sealed genesis offered as a header is refused: it travels whole, to whom its author shows it', 'accept_sealed', [[{ version: msg.version, header: msg.header, header_signature: msg.header_signature }], []], { expect: { taken: [], refused: [{ code: 'shape' }] } })
  }
  {
    // H14: a grant's period is scope.every (a duration); a price's per stays an amount. The limit observe and its commitment read every
    {
      // F10b twin: a child whose long decimal limit equals its parent's is within it (the fixture's signed parent named scope.per)
      const s = story(), pr = s.person('h14f10b')
      const lim = fb.amount('2.9999999999999999999', 'kg')
      const parent = s.say(pr, 'grant', { kind: 'authority', depth: 1, scope: { acts: ['observe'], until: '2028-12-01T00:00:00.000Z', limit: lim, every: 'P1D' } }, { to: pr.id })
      check('H14: review: a child whose long decimal limit equals its parent\'s is within it (scope.every)', { type: 'grant', state: { kind: 'authority', scope: { acts: ['observe'], until: '2028-12-01T00:00:00.000Z', limit: lim, every: 'P1D' } }, refs: { parent: parent.hash, to: pr.id, author: pr.id } }, [], s.held)
    }
    check('H14: a scope that still names per is refused: per is a price\'s word alone (undeclared_field)', { type: 'grant', state: { kind: 'shop', scope: { acts: ['promise'], limit: M(5000), per: 'P7D', until: LATER } }, refs: { to: '0'.repeat(64) } }, ['undeclared_field'])
    check('H14: a duration that is not ISO 8601 is refused: scope.every weekly (time)', { type: 'grant', state: { kind: 'shop', scope: { acts: ['promise'], limit: M(5000), every: 'weekly', until: LATER } }, refs: { to: '0'.repeat(64) } }, ['time'])
    check('H14: an observe\'s own field per is data, never a duration: per weekly is not refused (before: time)', { type: 'observe', state: { kind: 'note', per: 'weekly' }, refs: {} }, [])
    check('H14: every is a duration wherever it is written: an observe\'s every weekly is refused (time)', { type: 'observe', state: { kind: 'note', every: 'weekly' }, refs: {} }, ['time'])
    door('H14: limit_fence writes the period as every', 'limit_fence', ['1'.repeat(64), AUTH, M(5000), 'P7D', null, null], { expect: { type: 'observe', state: { kind: 'limit', limit: M(5000), every: 'P7D' }, refs: { for: '1'.repeat(64) }, audience: [AUTH] }, exact: true })
    // the hash vector of a grant (section hashes) rewritten with every, signed again by its signer, in the same place in her chain
    const i = V.hashes.findIndex((h) => h.name === 'a grant: what a shop may do' || h.name.startsWith('H14: a grant: what a shop may do'))
    if (i >= 0) {
      const old = V.hashes[i], key = V.keys[old.signer]
      const scope = Object.fromEntries(Object.entries(old.block.state.scope).map(([k, v]) => [k === 'per' ? 'every' : k, v]))
      const block = { type: old.block.type, state: { ...old.block.state, scope }, refs: old.block.refs }
      const hash = fb.hash(block.type, block.state, block.refs), signature = fb.sign(block, key.private_key)
      const name = 'H14: a grant: what a shop may do (its limit renews every 7 days: scope.every)'
      const oldHash = old.hash
      V.hashes[i] = { name, signer: old.signer, block, canonical: fb.canonical(block.type, block.state, block.refs), hash, signature }
      const j = V.signatures.findIndex((x) => x.hash === oldHash || x.name === name)
      if (j >= 0) V.signatures[j] = { name, hash, signer: old.signer, signature }
      assert.deepEqual(call('valid', { hash, ...block, signature }, [...V.ledger.genesis, ...V.hashes.slice(0, i)].map((h) => ({ hash: h.hash, ...h.block, signature: h.signature })), null), [])
    }
    // the reversibility story (decision of the 1.6 refinement), told again with scope.every: its old telling carried scope.per
    const s = story(), farmer = s.person('h14farmer'), agent = s.person('h14agent', { kind: 'agent' }), eve = s.person('h14eve'), buyer = s.person('h14buyer')
    const og = s.say(farmer, 'grant', { kind: 'operator' }, { to: agent.id })
    s.say(agent, 'grant', { status: 'accepted' }, { answers: og.hash })
    const field = s.say(farmer, 'thing', { kind: 'field', name: 'north field' })
    const ACTS = ['transfer.spray', 'transfer.water', 'transfer.open_valve', 'transfer.restock', 'transfer.sell', 'transfer', 'promise', 'observe']
    const broad = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, until: LATER } }, { to: agent.id })
    const limited = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, limit: M(5000), every: 'P1D', until: LATER } }, { to: agent.id })
    const schema = (who, target, undo) => s.say(who, 'thing', { kind: 'schema', target, fields: { field: 'text' }, ...(undo ? { undo } : {}) })
    const never = schema(farmer, 'transfer.spray', 'never'), ok = schema(farmer, 'transfer.water', 'ok'), silent = schema(farmer, 'transfer.open_valve')
    const strangerOk = schema(eve, 'transfer.restock', 'ok'), odd = schema(farmer, 'transfer.sell', 'maybe')
    schema(eve, 'transfer.water', 'never')
    const act = (kind, under, extra = {}) => s.say(agent, 'transfer', { kind }, { what: field.hash, to_place: field.hash, under: under.hash, ...extra })
    const underOk = (name, block, expect) => door(name, 'under_ok', [block, s.held], { expect, exact: true })
    underOk('H14: reversibility: an act the grantor\'s schema marks undo never, under a broad grant, is not live', act('spray', broad, { schema: never.hash }), false)
    underOk('H14: reversibility: an act the grantor\'s schema marks undo ok is live under the broad grant', act('water', broad, { schema: ok.hash }), true)
    underOk('H14: reversibility: an act whose schema states no undo is treated as irreversible', act('open_valve', broad, { schema: silent.hash }), false)
    underOk('H14: reversibility: an act that names no schema at all is treated as irreversible', act('launch_robot', broad), false)
    underOk('H14: reversibility: a schema that writes some other word than never or ok marks nothing', act('sell', broad, { schema: odd.hash }), false)
    underOk('H14: reversibility: a stranger\'s schema marking undo ok cannot unblock another person\'s act', act('restock', broad, { schema: strangerOk.hash }), false)
    underOk('H14: reversibility: a stranger\'s schema marking undo never cannot block an act the grantor marked ok (the act names its own schema)', act('water', broad, { schema: ok.hash }), true)
    underOk('H14: reversibility: the schema is found by refs.schema alone: one that targets the act but is not named marks nothing', act('water', broad), false)
    s.say(farmer, 'observe', { kind: 'trust', text: 'I use this schema' }, { confirms: strangerOk.hash })
    underOk('H14: reversibility: a stranger\'s schema the grantor confirmed is trusted: undo ok counts', act('restock', broad, { schema: strangerOk.hash }), true)
    underOk('H14: reversibility: a grant that names the act and has a limit (scope.every its period) is enough, marked never or not', act('spray', limited, { schema: never.hash }), true)
    underOk('H14: reversibility: a grant with a limit that does not name the act is not enough', act('irrigate', limited), false)
    const ask = s.say(agent, 'promise', { what: 'transfer.spray', terms: { expires: LATER } }, { to: farmer.id, from: agent.id, under: broad.hash, schema: never.hash })
    const spray2 = act('spray', broad, { schema: never.hash, for: ask.hash })
    underOk('H14: reversibility: a specific ask not yet answered does not make the act live', spray2, false)
    s.say(farmer, 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash, after: [ask.hash] })
    underOk('H14: reversibility: the principal\'s accepted answer to the ask naming the act makes it live', spray2, true)
    const quote = s.say(agent, 'promise', { what: 'a delivery', terms: { expires: LATER } }, { to: farmer.id, from: buyer.id, under: broad.hash })
    underOk('H14: reversibility: an agent\'s ask is a quote request, not an act that binds', quote, true)
    const offer = s.say(agent, 'promise', { what: 'a delivery', terms: { price: M(300), expires: LATER } }, { from: farmer.id, to: buyer.id, under: broad.hash })
    underOk('H14: reversibility: an agent\'s offer binds its principal: irreversible unless marked', offer, false)
    const offerOk = s.say(agent, 'promise', { what: 'a delivery', terms: { price: M(300), expires: LATER } }, { from: farmer.id, to: buyer.id, under: broad.hash, schema: ok.hash })
    underOk('H14: reversibility: the same offer under a schema the grantor marked ok is live', offerOk, true)
    const note = s.say(agent, 'observe', { kind: 'note', text: 'checked the gate' }, { under: broad.hash })
    underOk('H14: reversibility: an observe that moves nothing and binds no one needs no marking', note, true)
  }
  {
    // H21: a recall is an ordinary grant: scope.acts pull, scope.until, scope.notice; an answer time or marks come from a schema the holder names
    const ID = '0'.repeat(64)
    check('H21: a recall is an ordinary grant: acts pull, until and notice, no kind the protocol lists (before: a recall with scope.until was refused, scope_until)', { type: 'grant', state: { kind: 'recall', scope: { acts: ['pull'], until: LATER, notice: 'PT1H' } }, refs: { to: ID } }, [])
    check('H21: a grant that names answer_within is refused unless a schema it names declares it: no profile lists it (before: allowed)', { type: 'grant', state: { kind: 'recall', answer_within: 'PT1H', scope: { acts: ['pull'], until: LATER } }, refs: { to: ID } }, ['undeclared_field'])
  }
  // ---- H20 (2026-10-29): a threshold pledge is a base schema, not core (profiles/pledges.md) ----
  // A pledge is an ask under the schema `pledge`: its money in terms.price, its threshold in terms.condition ({ pledged: money }),
  // its date in terms.expires, the plan in refs.what, the organiser in refs.from. The organiser's close is an observe under the
  // schema `pledge_close` that names the pledges it counts in refs.derives_from. The core reads neither: no core change.
  {
    const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../spec/schemas/published.json'), 'utf8'))
    const S = P.schemas
    const s = story()
    // the schemas rest on their publisher's chain: hold all of it, so the schema a block names is itself valid
    ;[P.genesis, ...P.order.map((n) => S[n])].forEach((b) => s.keep(b))
    const org = s.person('h20org'), ann = s.person('h20ann'), bo = s.person('h20bo')
    const plan = s.say(org, 'thing', { name: 'H20 lorry to market' })
    const pledge = (who, minor, threshold) => s.say(who, 'promise', { terms: { price: M(minor), condition: { pledged: M(threshold) }, expires: BEFORE } }, { from: org.id, to: who.id, what: plan.hash, schema: S.pledge.hash })
    const a = pledge(ann, 2000, 4000), b = pledge(bo, 2000, 4000)
    door('H20: a pledge under the pledge schema (money in price, threshold in condition, date in expires) is valid: no core change', 'valid', [a, s.held.filter((x) => x !== a && x !== b), null], { expect: [], exact: true })
    const close = s.say(org, 'observe', {}, { schema: S.pledge_close.hash, derives_from: [a.hash, b.hash] }, { time: '2027-02-01T00:00:00.000Z' })
    door('H20: the organiser\'s close, an observe under pledge_close naming the pledges in derives_from, is valid', 'valid', [close, s.held.filter((x) => x !== close), null], { expect: [], exact: true })
    holds('H20: the protocol does not read the pledged condition: it is the schema\'s readers\' (not read, null)', a.state.terms.condition, s.held, '2027-02-02T00:00:00.000Z', null)
    // the threshold is the condition, never a term of its own: the schema declares no terms, so terms.threshold is refused
    const st = { ...a.state, terms: { ...a.state.terms, threshold: M(4000) } }
    door('H20: a pledge carrying terms.threshold is refused: the pledge schema declares no terms (the threshold is the condition)', 'refusals', ['promise', st, a.refs, [], [S.pledge]], { expect: [{ code: 'undeclared_field' }] })
  }
  // (decisions H: more cases above this line)
}

// ---- write ----
// Cases an earlier run of this file made under names it no longer writes.
const RETIRED = new Set([
  // decisions H (2026-10-29): each twinned in section 29, or in place (marked "H<n>:")
  'refrain: once the reader\'s clock passes its until with nothing broken and nothing owed, the view says done',
  'refrain: a refrain the side only disputes is done once its until passes (batch 2 P4)',
  'refrain: a paid refrain past its until with the price unpaid is not done',
  'refrain: once paid, the view says done past its until',
  'round 2: money sent to a stranger is no refund: the view reads the kept refrain done',
  'round 2: refrain: a price short by one minor unit at 2^53 is unpaid: never done',
  'G98: an open refrain offer that binds stays accepted once the until has passed: it is settled by no one (before: a float fallback read it as paid, and done)',
  'successor: a successor grant carries no scope.until (a witness other than the successor)',
  'circle: a stop of an open grant ends it for everyone who joined by it',
  'C7: an autonomous system the buyer runs, named as referee, rules on nothing (r1)',
  "C7: the co-op's own chair, named by id, rules on nothing in the co-op's deal (r1b)",
  'E3: both rule: the delivery counts for nothing',
  'limits: with no cap on each act the commitment is of { limit, per } alone',
  "time: a child whose scope.per (PT99999999999999999999H) cannot be added to a time is wider than its parent's",
  "time: a child whose scope.per (P99999999999999999999D) cannot be added to a time is wider than its parent's",
  "time: a child whose scope.per (P8000Y) cannot be added to a time is wider than its parent's",
  'checks: scope.per is a duration, never an amount',
  "round 2: checks: a scope's per is a duration, whatever the type",
  "G112: under a parent with no at, a child's per and notice cannot be compared: wider_than_parent (before: compared from 2000-01-01 in the core, not at all in the oracle)",
  'limit: the commitment is the salted hash of { limit, per } in canonical JSON',
  'limit: with no period, per is left out of the committed value',
  "A: the act outside the grant, after counted_to, is void in the agent's identity: its key timeline is the old key and the new",
  'a duration that is not ISO 8601',
  "review: a child whose long decimal limit equals its parent's is within it",
  'G112: under a parent with no at, a child that drops per is wider, as before',
  'a genesis that is not public',
  'an ask with no expires',
  'a grant others act under with no scope.until',
  'a key grant with a scope.until',
  'a grant others act under with no scope has no scope.until',
  "reversibility: an act the grantor's schema marks undo never, under a broad grant, is not live",
  "reversibility: an act the grantor's schema marks undo ok is live under the broad grant",
  'reversibility: an act whose schema states no undo is treated as irreversible',
  'reversibility: an act that names no schema at all is treated as irreversible',
  'reversibility: a schema that writes some other word than never or ok marks nothing',
  "reversibility: a stranger's schema marking undo ok cannot unblock another person's act",
  "reversibility: a stranger's schema marking undo never cannot block an act the grantor marked ok (the act names its own schema)",
  'reversibility: the schema is found by refs.schema alone: one that targets the act but is not named marks nothing',
  "reversibility: a stranger's schema the grantor confirmed is trusted: undo ok counts",
  'reversibility: a grant that names the act and has a limit is enough, marked never or not',
  'reversibility: a grant with a limit that does not name the act is not enough',
  'reversibility: a specific ask not yet answered does not make the act live',
  "reversibility: the principal's accepted answer to the ask naming the act makes it live",
  "reversibility: an agent's ask is a quote request, not an act that binds",
  "reversibility: an agent's offer binds its principal: irreversible unless marked",
  'reversibility: the same offer under a schema the grantor marked ok is live',
  'reversibility: an observe that moves nothing and binds no one needs no marking',
  // pass G (2026-10-29): each twinned in section 28, or in place (marked "G<n>:")
  'batch 2 P10: of two answers of hers to one payment, the most she granted counts',
  // decisions F (2026-10-29): each twinned in section 27, or in place (r7)
  'not_human: a first block to a stranger that an agent signed',
  "admission_refusals: the agent's first block to a person who has stopped its principal is refused: not_human only (the STOP is read by the fold, not refused)",
  'admission: an author an operator answers for is an autonomous system, whatever kind it gives itself: to a stranger it may not write first (r7; clean round 2)',
  'accept: crossing rotations on one prev pair with each other, never with the first block of the key one of them brought in (f6, nodes.md Equivocation)',
  // clean round 1 (2026-10-28): validity reads only what a block rests on, so whether a key speaks is the folds'; each twinned in section 23
  'A: a rotation by the named operator before the agent accepts is not_own_rotation',
  'A: a stranger\'s unaccepted operator grant rotates nothing: its rotation of the agent\'s key is not_own_rotation (keys/e4)',
  'A: and a block the stranger\'s key signs as the agent opens with no key of the agent\'s (bad_signature)',
  'A: the old key writes after counted_to: void',
  'B: a block of a frozen key is void_key',
  'B: a frozen key speaks for no one',
  'B: a rotated-out key signs a sibling of a block on its counted line: void_key (keys/e1)',
  'B: a stale key\'s key grant off the counted line brings in nothing: void_key (keys/e8)',
  'B: accept: after a recovery rotation counted to the first key\'s first block, a sibling of it is void: refused, and no pair',
  'B: and a block of the old key past the later line is void',
  'B: and the old key counts only on the part of their lines both share: past the split, the sale counts for nothing until the recovery key settles it',
  'B: and the old key\'s later rotation, which saw its first, is a block of the old key off the line: void_key',
  'B: and the phone\'s sale is void_key',
  'B: so a block the would-be child key signs opens with no key of the author\'s (bad_signature)',
  'B: the frozen key\'s own key grant is void_key',
  'H: high s: p256: a block of the chain is valid against the genesis: a signature whose s is high is refused (bad_signature)',
  'a block signed by a frozen key: a key of its author that does not speak',
  'a rotation by another of the id\'s keys is not counted: its key never comes in',
  'consent: her fresh yes through a recorder outside the asker\'s side lifts it',
  'needs: a grant passed on rests on its parent',
  'needs: an observe rests on its prev alone, whatever else it names',
  'operators: a death ends the operator grant: a key the dead operator brings in after the close signs nothing',
  'operators: a rotation of another\'s key by one who is not its operator is not_own_rotation',
  'operators: a rotation the operator signs having seen its own close is not_own_rotation',
  'p256: a changed block is not',
  'p256: another identity\'s key does not open it',
  'close: a close under a successor grant she stopped ends nothing',
  'to_role: a stop by one who may sign for the circle ends its grant',
  'review: two onward stops that do not see each other: from names the lowest hash, by is both',
  'round 2: stops: of two onward stops that do not see each other, from is the lowest hash, whatever their pasts',
  'round 2: time: 31 January plus P1M is 28 February, so P1M is no longer than P30D from it',
  'round 2: time: and P30D from 31 January is longer than P1M',
  'round 3: circles: an open grant\'s joiner who stops it with as leaves alone; the other joiner stays',
  'conditions: needed is a whole number of at least 1: 0 does not hold',
  'conditions: needed 1.5 does not hold',
  'circle: a block outside the cut of a second leaving speaks for no one',
  'limits: with no cap on each act the commitment is the 1.6 one',
  'review: members_then after removals that cross',
  'operators: before a death the operator answers for the agent',
  'operators: a death ends the operator grant',
  'close: a grant she gave is not live after the close',
  'needed: admit needs two holders: one treasurer\'s invitation alone makes no member',
  'needed: the founder alone cannot admit where two must: the first board member is not in yet',
  // decisions F1 to F7 (2026-10-28): each has a twin under its new reading
  'review: two stops that do not see each other: removed names the lowest hash\'s counted_to',
  'review: two onward stops that do not see each other: from names the lowest hash, by is its side (two stops are no agreement)',
  'review: a member dead in the stop\'s causal past holds no admin power there: one stop removes them, naming its counted_to',
  'circle: a lone stop of an admin where two must stands for nothing, judged at the stop, even after the admin role is taken away',
  'circle: of two stops in turn, removed keeps the counted_to of the last',
  'circle: of two removals that cross, the one by the earlier member stands: the losing stop names no cut',
  'circle: of two leavings of one grant, removed names the counted_to of the later',
  'circle: two stops make a quorum: removed names the counted_to of the lower hash, only to name one',
  'round 2: refrain: a stop dated after its until leaves it done in the view (its term was kept)',
  'round 2: stops: of two onward stops that do not see each other, from is the lowest hash, whatever their pasts; by is its side',
  'round 2: circle: a remover naming the member\'s own block cuts there: what came after it speaks for no one, even what the stop saw',
  'repair: key_timeline names the block that brought each key in and the key that signed it',
  'circle_state: the removal keeps the counted_to the stop named',
  // decision F8 (2026-10-28): folds read only blocks that pass the write check; each has a twin in section 17
  'terms fixed: an accept of the quiet edit binds nothing',
  'market: a payment split three ways pays each its own part',
  'market: every part of a split for one promise counts toward it: two lines\' parts add up',
  'market: two currencies are never added: the total is the first line\'s currency alone',
  'repair: consent: the same stop reaches a sender under an open grant from that grantor',
  // decisions M1 to M7 (2026-10-28): each has a twin in section 18
  'base_fields: transfer',
  'two blocks of one key naming one prev: neither binds anyone else, so the offer stands unanswered',
  'a later block of a key that signed two naming one prev counts for nothing',
  // security A to E (2026-10-28): each has a twin in section 19 (or beside it, renamed)
  'base_fields: actor',
  'base_fields: grant',
  'successor: a successor grant carries no scope.until',
  'decision 12: a close that has not seen the person\'s stop of the successor grant still counts',
  'operators: a key the operator rotated before the death still signs for the agent',
  'operators: the operator\'s rotation of its agent\'s key passes valid',
  'p256: a public block as a message names its suite',
  'p256: unwrapping rebuilds the id in the message\'s suite',
  'p256: a message naming a suite this reader does not know',
  'p256: a block as CBOR names its suite after the signature',
  'p256: and decodes to the same block',
  'sm: a public block as a message names its suite',
  'sm: unwrapping rebuilds the id in the message\'s suite',
  'sm: a message naming a suite this reader does not know',
  'sm: a block as CBOR names its suite after the signature',
  'sm: and decodes to the same block',
  'consent: a STOP naming the operator covers its agents, later than the yes',
  'consent: the asker may record a STOP for itself: it covers its agents',
  'consent: the asker\'s side never lifts a STOP',
  'accept: the first key twice naming one prev is an equivocation, recovery rotation or not',
  'passkey: a block signed by a passkey travels as a message, its signature one hex string',
  'passkey: unwrapping rebuilds the id and keeps the signature',
  'passkey: a block signed by a passkey as CBOR: the signature is a longer byte string, after the suite',
  'passkey: it decodes back to the same block and signature',
  'a genesis with no recovery adds it later by a key grant that names both; the recovery key then rotates',
  'an agent is an actor with its own genesis; its operator is the author of its live grant of kind operator',
  'an operator rotates its agent\'s key: the old key is void after counted_to, the new key speaks',
  'a recovery rotation settles a key-grant pair: the key in its causal past speaks, the other stays frozen',
  'the limit is the principal\'s fence: an observe of kind limit for the grant, sealed to the agent; the grant check never reads it',
  // security F to I and L (2026-10-28): each has a twin in section 20
  'p256: the genesis is valid, its id hashed in the suite',
  'p256: a block of the chain is valid against the genesis',
  'passkey: a DER signature and the same r then s make the same wire form',
  'passkey: the plain 64-byte form of the same key still opens a block',
  'passkey: extension data after the 37 bytes: opens',
  'passkey: the counter is not looked at, however large',
  'passkey: members of clientDataJSON beyond type and challenge are ignored',
  'passkey: clientDataJSON is read as JSON: member order and spaces do not matter',
  'passkey: a signed message part (a pull request) can be signed by a passkey too: the challenge is its canonical JSON without the signature',
  'review: within_limit compares exactly at any size',
  'conditions: a decimal of any size compares exactly',
  'limits: within_limit at any size: 1 kg inside a limit of 10^45 kg',
  'bearer: the note passed on carries the promise: the earlier holder\'s accept counts for nothing',
  'bearer: the new holder answers it again and it binds',
  'defeats: the giver defeats his own delivery: it no longer counts',
  'defeats: a defeated payment is not paid: the goods are in, the price is not covered',
  'round 2: the payer sending money to a stranger refunds nothing',
  'referee: a delivery the receiver accepted settles the deal',
  'referee: the referee the deal\'s schema names confirms it: its word is the last, the delivery stands',
  'referee: the referee\'s later confirm, seeing its own defeat, restores it',
  'fork: the receiver who took the eggs and forked with a stop is still bound: underway, unpaid',
  'fork: the receiver\'s defeats signed after a fork of its key frees it of nothing: the delivery stands',

  // batch 2 (2026-10-28): the names an approved rule flipped, each twinned in place (marked "batch 2") or in section 22
  "base_fields: transfer (a transfer may carry expires: decision M1)",
  "circle: a role taken away from an invitation counts at once, whatever the answer saw",
  "circle: the founder who leaves a grant they accepted keeps the first role and is never removed",
  "close: a standing promise she is a side of ends at her successor's close, from that block",
  "close: with both witnesses' triggers in its past, the close ends her standing promise",
  "conditions: a shape the protocol does not know does not hold",
  "D: before the person's stop, a counted close ends her standing promise",
  "decision 13: a close the successor wrote before their own death still counts",
  "decision 4: a breach that happened after the promiser's close, though before until, breaks nothing: the close ended the term",
  "decision 4: a breach that happened before the close still counts",
  "founder: a founder who accepts a lesser grant keeps the first role beside it",
  "G: referee: the receiver defeats it, the referee silent: it no longer settles",
  "G: the receiver defeats a delivery: it no longer counts",
  "groups: a ring whose members have no earliest (their grants do not see each other): every removal in it stands",
  "groups: one holder of admit who gives themselves remove, takes the target's powers, then stops their grant alone removes no one where two must",
  "reason: a reason goes only with a stop",
  "reason: a reason that is not on the list is refused",
  "reason: a stop may say why it ended, from the closed list",
  "reason: done is on the list",
  "reason: let_go is on the list",
  "reason: lost is on the list",
  "reason: paused is on the list",
  "reason: ran_out is on the list",
  "reason: replaced is on the list",
  "referee: a refrain the side it was made to says was broken is breached while the referee says nothing",
  "referee: the receiver defeats it, and the referee has said nothing: the side decides, so it no longer settles",
  "referee: with no referee named in the deal, a confirm by someone else restores nothing: the side decides",
  "referee: with no referee named, someone else's defeat of the claim changes nothing: breached",
  "refrain: a breach is dated by when it happened (its when): found and reported after the term, it still counts",
  "refrain: a breached refrain is never done, whatever the clock",
  "refrain: a counter that adds a refrain, accepted, is one, and a defeats of the counter accepted breaches it",
  "refrain: a refrain ended by its promiser's death reads stopped, from the close",
  "refrain: agreeing to the promiser's stop after the breach erases nothing",
  "refrain: the promiser stopping it alone: stopped, by from (broken in kept and broken, before its until)",
  "refrain: the promiser's own stop is no release: a breach within the term after it still counts",
  "refrain: the side it was made to defeats it: breached, from that block",
  "refrain: the wronged side's stop after the breach erases nothing",
  "refrains: a stop dated after until that the other side confirms counts as after it: the view reads it done",
  "refrains: a stop whose causal past holds a block someone else signed after until counts as after it: done",
  "repair: an autonomous system's offer under a grant made for someone else is a quote request: no accept binds",
  "repair: an autonomous system's offer under its own grant that it saw stopped is a quote request: no accept binds",
  "repeat: a death after one week ends it at the close",
  "round 2: currency: with no price, only the first payment's currency is counted",
  "round 2: quotes: a bare autonomous system accepting its own offer binds no one",
  "round 3: circles: an open grant's joiner who holds remove and stops it with as leaves it alone; the other joiner stays",
  "round 3: close: continues naming the accept carries nothing on: a promise is named by its first offer",
  "round 3: close: continues naming the counter carries nothing on: a promise is named by its first offer",
  "round 3: close: continues naming the first carries the promise on",
  "round 3: close: two closes, one carrying the promise on and one not: the one that does not ends it",
  "totals: a total past 2^53 is written as decimal text, exactly",
  "defeats: the receiver defeats the delivery: it no longer counts, and the deal is not done",
  "defeats: and defeats it: the work counts for nothing and the job is accepted, not done",
  "necessity: a closed block may carry state.confidence",
  "necessity: a closed block may carry state.orderer",
  // clean round 2 (2026-10-29): each twinned in section 24
  'a promise signed by neither side',
  'recovery: a defeats of anything but a trigger under the grant is outside its scope',
  'well-formed: the same ask against a store without that thing has no side (not_a_side)',
  'well-formed: the thing is out, so the ask is judged without it and is out too, and so is the offer its author wrote after it: null',
  'admission: an author an operator answers for is an autonomous system, whatever kind it gives itself (r7)',
  // decisions E1 to E8 (2026-10-29): each twinned in place (marked "E2", "E3") or in section 26
  'base_fields: transfer (a transfer may carry expires: decision M1; an answer to a payment may say what it covers: batch 2 P10)',
  'C7: of three referees, one defeats the delivery after two confirmed it: a majority rules, the delivery stands: done (m3)',
  'C7: one referee of three alone erases no payment that moved: done (m3)',
  'C7: two of three referees defeat the delivery: it counts for nothing (m3)',
  "C9: in the fold only the first referee rules: the backup's word changes nothing",
  "C9: before the wait has passed since the dispute, the backup's word changes nothing on the reader's clock",
  "C9: once the first referee has said nothing for the wait after the dispute, the backup's ruling counts in the view",
  "C9: the first referee spoke: the backup's word never counts, whatever the clock",
  "D11: the buyer's second device accepts 20 bags, unseen by the first accept of 10 the seller delivered on: the 10 still bind (x1)",
  // decisions C and D (2026-10-29): each twinned in place (marked "C2", ...) or in section 25
  'allocation: the open offer binds, and its quantity and total are what its allocations bind together (the third is over what was offered)',
  'allocation: an allocation past what was offered has no deal',
  'market: two staff allocate from one open offer offline: a fork, neither binds',
  'market: the same blocks met in the other order give the same answer',
  'market: an open offer with lines binds its first allocation only: three takers are not each bound to the whole basket',
  "freed: while the taker's stop of an allocation is unseen, its quantity is still bound: a second allocation past the offer binds nothing",
  "freed: an allocation that sees the taker's stop of an earlier one has its quantity back",
  "freed: the offerer's own stop of an allocation frees it too, and stops that allocation alone: the offer still binds",
  "A: the old key writes after counted_to: no word of the agent's (clean round 1: whether a key speaks is the folds', never validity's)",
  "B: a rotated-out key signs a sibling of a block on its counted line: no word of hers (keys/e1; clean round 1: whether a key speaks is the folds', never validity's)",
  'B: the sibling forms no pair with the counted block',
  "B: a stale key's key grant off the counted line is no word of hers (keys/e8; clean round 1: whether a key speaks is the folds', never validity's)",
  "B: the thief's device key is no key of the owner's, held or not",
  "B: a rotation that names the same prev as a thief's block is no pair with it: a node holding the thief's block takes it (forks/f9)",
  'B: and no pair is listed',
  'B: a rotation counted to a block before a transfer of the old key voids it in every fold: the giver owns the box again',
  'valid: and the fold counts it for nothing: no word of hers',
  'valid: and counts for nothing',
  "promise_stage: an offer the rotated-out key signed past its counted line has no stage: no word of its author's, owed or claimed (f7)",
  'a key brought in by a void block is void, and so is every key it brought in',
  "review: a removal and a stop of the remover's invitation whose answer it did not see cross: the earlier member's stop wins",
  'review: acting under a grant to a role after removals that cross',
  'round 1: a stop of an invitation whose answer it did not see crosses: the earlier member stays',
  'circle: an early stop crosses a removal by the one it stopped: the earlier member stays and the other never joined',
  "groups: a removed member's deal that no stop had seen anyone outside build on speaks for no one, though an outsider accepted it (invariant 27)",
  "groups: three removals in a ring (A stops B, B stops C, C stops A, none seeing another): the earliest member wins; the others' stops remove no one",
])
V.door = V.door.filter((c) => !RETIRED.has(c.name))
V.folds.promises = V.folds.promises.filter((c) => !RETIRED.has(c.name))
// security A to E (2026-10-28): the identity stories they flip, each twinned in section 19
V.identities = V.identities.filter((c) => !RETIRED.has(c.name))
V.refusals.cases = V.refusals.cases.filter((c) => !RETIRED.has(c.name))
vectorsFile.save(V, INVARIANTS)
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
