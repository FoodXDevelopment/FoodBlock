// Makes spec/vectors.json: `node test/make-vectors.cjs`. Everything is built from fixed seeds and fixed times, so a run
// gives the same file. Each expectation is written here by hand and checked against the Rust core (through this SDK)
// before the file is written: if the core and the expectation disagree, nothing is written. The oracle (spec/oracle)
// then checks the file against an implementation written from the spec text alone.
//
// Sections: keys; canonical; hashes; audience; signatures; bad_signatures; envelopes; sealed; headers; identities;
// deals; circles; folds (promises, circles, audience, things, successors, rekeys, ballots); refusals; messages; cbor;
// door (one case per rule the spec author listed: a door op, its arguments, what it must give).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')
const { recoveryKeyHash, genesis, keyGrant, signedByAuthor } = fb.identity

const vectorsFile = require('./vectors-file.cjs')
const FILE = vectorsFile.FILE
const INVARIANTS = fs.existsSync(FILE) ? vectorsFile.load().tags : new Map()
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name, suite = 'std') => {
  if (keys[name]) return keys[name]
  const seed = sha(`foodblock 1.6 vectors: ${name}`), x = sha(`foodblock 1.6 vectors x25519: ${name}`)
  const kp = fb.keypairFromSeed(seed, suite)
  keys[name] = { ...(suite === 'std' ? {} : { suite }), seed, private_key: kp.private_key, public_key_sign: kp.public_key_sign, x25519_private: x, public_key_encrypt: fb.encryptionKeyOf(x, suite) }
  if (name.endsWith('_recovery')) keys[name].hash = recoveryKeyHash(kp.public_key_sign, suite)
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 15, 12, 0, 0) + 1000 * tick++).toISOString()
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
const DAY = '2026-10-20T00:00:00.000Z'

// A group of people writing one story: every block signed, kept with its signer's name.
function story() {
  const held = [], out = []
  const keep = (name, block, signer) => { held.push(block); out.push({ name, hash: block.hash, signer, ...(block.suite ? { suite: block.suite } : {}), block: { type: block.type, state: block.state, refs: block.refs }, signature: block.signature }); return block }
  const person = (name, { kind = 'person', reach = 'P30D', recover = true, suite = 'std', custodian } = {}) => {
    const key = keyOf(name, suite), recovery = recover ? keyOf(`${name}_recovery`, suite) : null
    const g = genesis(key, { kind, at: at(), encryptionKey: key.public_key_encrypt, ...(recover ? { recoveryKey: recovery.public_key_sign, reach } : {}), custodian })
    keep(`${name}: genesis`, g, name)
    return { name, id: g.hash, key, recovery, g, suite }
  }
  // `unchecked`: a refusal case. The block is composed, chained and signed without the write check (write refuses it).
  const say = (who, label, type, state, refs = {}, { key = who.name, audience = 'public', after, salts, link, clockless, skip, nonce, time, unchecked } = {}) => {
    const mine = held.filter((b) => b.refs && b.refs.author === who.id)
    const chain = unchecked && !link ? { seq: (mine.length ? mine[mine.length - 1].state.seq : 0) + 1, prev: mine.length ? mine[mine.length - 1].hash : who.id } : link
    const block = unchecked
      ? (() => { const c = fb.compose(type, state, refs, { author: who.id, at: time || at(), audience, after, link: chain }); return { ...c, signature: fb.sign(c, keyOf(key).private_key) } })()
      : fb.write(type, state, refs, { author: who.id, key: keyOf(key), held, at: clockless ? undefined : (time || at()), clockless, audience, after, salts, link, skip, nonce })
    const { salts: _salts, ...signed } = block
    return keep(label, signed, key)
  }
  return { held, out, keep, person, say, byName: (name) => out.find((block) => block.name === name) }
}
const blocksOf = (s) => s.out.slice()
const asHeld = (list) => list.map((b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature }))
const M = (minor, currency = 'GBP') => fb.money(minor, currency)
const A = (value, unit) => fb.amount(value, unit)

const V = { keys, door: [], refusals: { blocks: [], cases: [] }, sealed: { blocks: [], cases: [] }, folds: { promises: [], circles: [], audience: [], things: [], successors: [], rekeys: [], ballots: [] }, identities: [], deals: [], circles: [] }

// A door case: an op of the core, its arguments, and what it must give. `expect` is a subset match (every key given
// must match); `codes` compares the refusal codes of a list; `error` a failure's kind and code.
function door(name, op, args, { expect, codes, error, exact, oracle = true } = {}) {
  args = JSON.parse(JSON.stringify(args))
  let got, failed
  try { got = call(op, ...args) } catch (e) { failed = e }
  if (error) {
    assert.ok(failed, `${name}: should fail`)
    if (error.code) assert.equal(failed.code, error.code, name)
    V.door.push({ name, op, args, error, ...(oracle ? {} : { oracle: false }) })
    return got
  }
  assert.ok(!failed, `${name}: ${failed && failed.message}`)
  if (codes) assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  else if (expect !== undefined) {
    const subset = (a, b) => Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true)
    if (exact) assert.deepEqual(got, expect, name); else subset(got, expect)
  }
  V.door.push({ name, op, args, ...(codes ? { codes } : expect !== undefined ? { expect, ...(exact ? { exact: true } : {}) } : { expect: got }), ...(oracle ? {} : { oracle: false }) })
  return got
}

// ---- Canonical form (canonical.md): the complete example, the edge cases, UTF-16 order ----
V.canonical = []
function canon(name, block, expected) {
  const canonical = fb.canonical(block.type, block.state, block.refs)
  if (expected !== undefined) assert.equal(canonical, expected, name)
  V.canonical.push({ name, block, canonical, hash: fb.hash(block.type, block.state, block.refs) })
}
canon('the complete example of canonical.md', { type: 'thing', state: { name: 'Sourdough', price: { minor: 450, currency: 'GBP' }, weight: { value: '0.8', unit: 'kg' } }, refs: { author: 'abc123', of: 'def456' } },
  '{"refs":{"author":"abc123","of":"def456"},"state":{"name":"Sourdough","price":{"currency":"GBP","minor":450},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}')
assert.equal(V.canonical[0].hash, '7bda2dba2c55126f32646c376de02d3f7d91a21ff956336649307dd6e7c0d51d')
canon('an empty state and empty refs are kept', { type: 'thing', state: {}, refs: {} }, '{"refs":{},"state":{},"type":"thing"}')
canon('an empty array is kept', { type: 'thing', state: { a: [] }, refs: {} }, '{"refs":{},"state":{"a":[]},"type":"thing"}')
canon('a set under refs, as written (sorted)', { type: 'thing', state: {}, refs: { participants: ['a', 'b'] } }, '{"refs":{"participants":["a","b"]},"state":{},"type":"thing"}')
canon('a state array keeps its order', { type: 'thing', state: { steps: ['b', 'a'] }, refs: {} }, '{"refs":{},"state":{"steps":["b","a"]},"type":"thing"}')
canon('only the top-level refs holds sets: a refs key inside state is ordinary', { type: 'thing', state: { x: { refs: ['b', 'a'] } }, refs: {} }, '{"refs":{},"state":{"x":{"refs":["b","a"]}},"type":"thing"}')
canon('keys sort by UTF-16 code units: the emoji (a surrogate pair) before the full-width tilde', { type: 'thing', state: { '～': 2, '😀': 1 }, refs: {} }, '{"refs":{},"state":{"😀":1,"～":2},"type":"thing"}')
canon('integers are plain digits; the largest is 2^53 - 1', { type: 'thing', state: { big: 9007199254740991, neg: -5, zero: 0 }, refs: {} }, '{"refs":{},"state":{"big":9007199254740991,"neg":-5,"zero":0},"type":"thing"}')
canon('strings use the shortest escapes, in UTF-8', { type: 'thing', state: { s: 'a"b\\c\nd\u0001é🍞<>&' }, refs: {} }, '{"refs":{},"state":{"s":"a\\"b\\\\c\\nd\\u0001é🍞<>&"},"type":"thing"}')
canon('nested keys sort at every depth', { type: 'thing', state: { b: { z: 1, a: 2 }, a: [{ y: 1, x: 2 }] }, refs: {} }, '{"refs":{},"state":{"a":[{"x":2,"y":1}],"b":{"a":2,"z":1}},"type":"thing"}')

// ---- Hashes: one block of every type, in 1.6 shapes, written by ann and checked as a chain ----
function ledger() {
  const s = story(), ann = s.person('ann'), bob = s.person('bob')
  const circle = s.say(ann, 'a circle: the founder holds the first role', 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Elm St co-op', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'cook', powers: ['sign'] }, { name: 'guest', powers: [] }], public_key_encrypt: keyOf('circle').public_key_encrypt })
  const contact = s.say(ann, 'a contact: someone with no keys, marked by a phone number', 'actor', { kind: 'contact', name: 'Joseph', marks: [{ scheme: 'tel', value: '+254700000000' }] })
  const eggs = s.say(ann, 'a thing that is a kind', 'thing', { kind: 'eggs', name: 'Eggs', marks: [{ scheme: 'gtin', value: '05012345678900' }] })
  const tray = s.say(ann, 'a thing that is one of the kind (refs.of)', 'thing', { lot: 'L-1', use_by: '2026-11-01', pack: A('30', '{egg}') }, { of: eggs.hash })
  const note = s.say(ann, 'an observe with a confidence, a point and a range of time', 'observe', { kind: 'reading', text: 'cold', amount: A('3.9', 'Cel'), confidence: '0.9', where: { lat: '51.4545', lon: '-2.5879' }, when: { from: '2026-10-15T08:00:00.000Z', to: '2026-10-15T09:00:00.000Z' }, method: 'probe' }, { subject: tray.hash })
  const make = s.say(ann, 'a transform: a make, with a share', 'transform', { kind: 'make', shares: [{ from: tray.hash, share: '1' }] }, { derives_from: [tray.hash] })
  const offer = s.say(ann, 'a promise: an offer with a price and an expiry', 'promise', { terms: { price: M(450), quantity: A('2', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
  s.say(bob, 'an answer: accepted', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash] })
  s.say(ann, 'a transfer: the tray moves to bob', 'transfer', { amount: A('1', '{tray}') }, { to_owner: bob.id, what: tray.hash, for: offer.hash })
  s.say(ann, 'a grant: what a shop may do', 'grant', { kind: 'shop', scope: { acts: ['promise', 'observe.note'], limit: M(5000), per: 'P7D', until: '2026-12-31T00:00:00.000Z', notice: 'PT1H' } }, { to: bob.id })
  void circle; void contact; void make; void note
  return s
}
const L = ledger()
V.hashes = blocksOf(L).filter((b) => b.block.refs.author).map((b) => ({ name: b.name, signer: b.signer, block: b.block, canonical: fb.canonical(b.block.type, b.block.state, b.block.refs), hash: b.hash, signature: b.signature }))
V.ledger = { genesis: blocksOf(L).filter((b) => !b.block.refs.author).map((b) => ({ name: b.name, signer: b.signer, hash: b.hash, block: b.block, signature: b.signature })) }
// Every block of the ledger is valid against the blocks before it.
{
  const before = []
  for (const b of L.held) { assert.deepEqual(fb.valid(b, before), [], b.hash); before.push(b) }
}

// ---- Audience, signatures, bad signatures ----
V.audience = [
  { name: 'a commitment is the salted hash of the salt\'s hex and the value', salt: sha('salt a').slice(0, 32), recipient: L.held[0].hash, commitment: fb.saltedHash(sha('salt a').slice(0, 32), L.held[0].hash) },
  { name: 'a role: circle#role', salt: sha('salt b').slice(0, 32), recipient: `${L.held[0].hash}#owner`, commitment: fb.saltedHash(sha('salt b').slice(0, 32), `${L.held[0].hash}#owner`) }
]
assert.equal(V.audience[0].commitment, sha(V.audience[0].salt + V.audience[0].recipient))
V.signatures = blocksOf(L).map((b) => ({ name: `${b.name}`, hash: b.hash, signer: b.signer, signature: b.signature }))
{
  const g = blocksOf(L).find((b) => b.name === 'ann: genesis'), forged = fb.sign(blocksOf(L)[2].block, keyOf('bob').private_key)
  V.bad_signatures = [{ name: 'a block signed by another key', hash: blocksOf(L)[2].hash, signer: 'ann', signature: forged }, { name: 'a genesis checked against another key', hash: g.hash, signer: 'bob', signature: g.signature }]
}

// ---- Identities: which blocks are their author's, which keys speak, who operates an agent ----
function identityVectors() {
  const out = V.identities
  const record = (name, s, id, extra = {}, options = {}) => {
    const held = s.held
    const signed_by_author = Object.fromEntries(held.filter((block) => block.refs?.author === id || block.hash === id).map((block) => [block.hash, signedByAuthor(block, held, options)]))
    out.push({ name, id, blocks: blocksOf(s), signed_by_author, keys: fb.identity.keysOf(id, held, options).sort(), ...extra })
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
    const rotation = s.keep('the recovery rotation', keyGrant(gil.id, fresh.public_key_sign, { private_key: gil.recovery.private_key, recoveryKey: gil.recovery.public_key_sign, last: null }, { replaces: gil.key.public_key_sign, countedTo: early.hash, at: at() }), 'gil_recovery')
    const arrivals = Object.fromEntries(s.held.map((block) => [block.hash, '2026-09-01T00:00:00.000Z']))
    arrivals[late.hash] = '2026-11-20T00:00:00.000Z'; arrivals[rotation.hash] = '2026-12-01T00:00:00.000Z'
    const options = { arrivedAt: (hash) => arrivals[hash] }
    const got = record('recovery reach is causal and read from arrival: what another identity built on before the reach began stands', s, gil.id, { arrivals }, options)
    assert.deepEqual([got[used.hash], got[late.hash], got[early.hash]], [true, false, true])
    // The view: what the reach protects on this reader's node.
    door('the view recovery_reach lists the voided blocks the reach protects', 'recovery_reach', [rotation, s.held, arrivals], { expect: [used.hash] })
    door('without arrivals the reach protects nothing: an unknown arrival is inside the reach', 'recovery_reach', [rotation, s.held, null], { expect: [] })
  }
  {
    // A freeze covers only the contested key: the device key keeps speaking.
    const s = story(), hal = s.person('ida')
    const laptop = keyOf('ida_laptop')
    s.keep('a device key', keyGrant(hal.id, laptop.public_key_sign, { private_key: hal.key.private_key, last: null, broughtIn: hal.id }, { at: at() }), 'ida')
    const one = s.say(hal, 'last good', 'observe', { kind: 'note', text: 'mine' })
    const a = keyOf('ida_a'), b = keyOf('ida_b')
    const rotA = s.keep('a rotation to key a', keyGrant(hal.id, a.public_key_sign, { private_key: hal.key.private_key, last: one }, { replaces: hal.key.public_key_sign, countedTo: one.hash, at: at() }), 'ida')
    const rotB = s.keep('a rival rotation to key b, naming the same prev', keyGrant(hal.id, b.public_key_sign, { private_key: hal.key.private_key, last: one }, { replaces: hal.key.public_key_sign, countedTo: one.hash, at: at() }), 'ida')
    const fromA = s.say(hal, 'key a speaks: frozen', 'observe', { kind: 'note', text: 'a' }, {}, { key: 'ida_a', link: { seq: 1, prev: rotA.hash } })
    const fromLaptop = s.say(hal, 'the laptop key keeps speaking', 'observe', { kind: 'note', text: 'laptop' }, {}, { key: 'ida_laptop' })
    const got = record('two rotations of one key that name one prev freeze only the keys they bring in', s, hal.id, { frozen: [a.public_key_sign, b.public_key_sign].sort() })
    assert.deepEqual([got[fromA.hash], got[fromLaptop.hash], got[rotA.hash], got[rotB.hash]], [false, true, true, true])
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
    s.keep('the rotation by the key itself, naming its counted_to block', keyGrant(jo.id, fresh.public_key_sign, { private_key: jo.key.private_key, last: brought }, { replaces: jo.key.public_key_sign, countedTo: good.hash, at: at() }), 'jud')
    // decision C1 (2026-10-29): a key's own rotation voids nothing it signed, so here nothing is void; make-vectors-1-7.cjs retires this
    // name and twins it with a recovery rotation (section 25)
    const got = record('a key brought in by a void block is void, and so is every key it brought in', s, jo.id)
    assert.deepEqual([got[brought.hash], got[broughtOn.hash], got[fromSecond.hash]], [true, true, true])
  }
  {
    // A key is rotated only by itself, by the recovery key, or by an operator.
    const s = story(), kit = s.person('kit')
    const laptop = keyOf('kit_laptop')
    const device = s.keep('a device key', keyGrant(kit.id, laptop.public_key_sign, { private_key: kit.key.private_key, last: null, broughtIn: kit.id }, { at: at() }), 'kit')
    const rogue = s.keep('the laptop key tries to rotate the genesis key: not counted', keyGrant(kit.id, keyOf('kit_rogue').public_key_sign, { private_key: laptop.private_key, last: null, broughtIn: device.hash }, { replaces: kit.key.public_key_sign, countedTo: device.hash, at: at() }), 'kit_laptop')
    const still = s.say(kit, 'the genesis key still speaks', 'observe', { kind: 'note', text: 'still me' })
    const got = record('a rotation by another of the id\'s keys is not counted: its key never comes in', s, kit.id)
    assert.deepEqual([got[rogue.hash], got[still.hash]], [true, true])
    assert.ok(!fb.identity.keysOf(kit.id, s.held).includes(keyOf('kit_rogue').public_key_sign))
    assert.deepEqual(codesOf(fb.valid(rogue, s.held.filter((block) => block !== rogue))), ['not_own_rotation'])
  }
  {
    // An agent, its operator, and the operator's rotation of its key (a micro that lost its counter gets a clean key).
    const s = story(), ann = s.person('lou'), bot = s.person('lou_agent', { kind: 'agent' })
    s.say(ann, 'lou answers for her agent: a grant of kind operator, the only place the operator is named', 'grant', { kind: 'operator' }, { to: bot.id })
    const grant = s.say(ann, 'what the agent may do for lou', 'grant', { kind: 'shop', scope: { acts: ['observe.note', 'promise'], limit: M(5000), per: 'P7D', until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const act = s.say(bot, 'the agent writes under the grant', 'observe', { kind: 'note', text: 'ordered flour' }, { under: grant.hash })
    assert.deepEqual(fb.grant.operatorsOf(bot.id, s.held), [ann.id])
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held), [])
    const outside = s.say(bot, 'an act the grant does not cover', 'observe', { kind: 'review', text: 'five stars' }, { under: grant.hash })
    assert.ok(fb.grant.whyNotUnder(outside, s.held).length)
    record('an agent is an actor with its own genesis; its operator is the author of its live grant of kind operator', s, bot.id, { operators: [ann.id], under: { [act.hash]: true, [outside.hash]: false } })
    // The operator route.
    const fresh = keyOf('lou_agent_new')
    const rot = s.say(ann, 'the operator rotates the agent\'s key, counting up to the last good block', 'grant', { kind: 'key', public_key_sign: fresh.public_key_sign, replaces: bot.key.public_key_sign, counted_to: act.hash }, { subject: bot.id })
    const stale = s.say(bot, 'the old key writes after counted_to: void', 'observe', { kind: 'note', text: 'late' })
    const clean = s.say(bot, 'the new key writes', 'observe', { kind: 'note', text: 'clean' }, {}, { key: 'lou_agent_new', link: { seq: 1, prev: rot.hash } })
    const got = record('an operator rotates its agent\'s key: the old key is void after counted_to, the new key speaks', s, bot.id, { operators: [ann.id] })
    assert.deepEqual([got[act.hash], got[outside.hash], got[stale.hash], got[clean.hash]], [true, false, false, true], 'outside and stale come after counted_to')
    assert.ok(fb.identity.keysOf(bot.id, s.held).includes(fresh.public_key_sign))
    assert.deepEqual(fb.valid(clean, s.held.filter((b) => b !== clean)), [])
    // A person's own operator cannot do this for a person (kind person): the same grant for a person is not counted.
    const s2 = story(), boss = s2.person('lou_boss'), worker = s2.person('lou_worker')
    s2.say(boss, 'an operator grant naming a person', 'grant', { kind: 'operator' }, { to: worker.id })
    const rot2 = s2.say(boss, 'the boss tries to rotate a person\'s key: not counted', 'grant', { kind: 'key', public_key_sign: keyOf('lou_worker_new').public_key_sign, replaces: worker.key.public_key_sign, counted_to: worker.g.hash }, { subject: worker.id })
    assert.ok(!fb.identity.keysOf(worker.id, s2.held).includes(keyOf('lou_worker_new').public_key_sign), 'only an agent or a machine has an operator who may rotate')
    void rot2
    record('a person has no operator who may rotate their key', s2, worker.id)
  }
  {
    // A genesis with no recovery fields; recovery added later by a key grant naming both; then used.
    const s = story(), neo = s.person('neo', { recover: false })
    assert.equal(neo.g.state.recovery_key_hash, undefined)
    assert.deepEqual(fb.valid(neo.g, []), [])
    const first = s.say(neo, 'a note', 'observe', { kind: 'note', text: 'one' })
    const rec = keyOf('neo_recovery')
    const adds = s.keep('a key grant adds the recovery pair: hash and reach, together', keyGrant(neo.id, null, { private_key: neo.key.private_key, last: first }, { recovery: { key: rec.public_key_sign, reach: 'P30D' }, at: at() }), 'neo')
    const bad = s.say(neo, 'last good', 'observe', { kind: 'note', text: 'last good' })
    const thief = s.say(neo, 'a note after', 'observe', { kind: 'note', text: 'after the last good' })
    const fresh = keyOf('neo_new')
    const rot = s.keep('the recovery key rotates the key', keyGrant(neo.id, fresh.public_key_sign, { private_key: rec.private_key, recoveryKey: rec.public_key_sign, last: null }, { replaces: neo.key.public_key_sign, countedTo: bad.hash, at: at() }), 'neo_recovery')
    const got = record('a genesis with no recovery adds it later by a key grant that names both; the recovery key then rotates', s, neo.id)
    assert.deepEqual([got[adds.hash], got[bad.hash], got[thief.hash], got[rot.hash]], [true, true, false, true])
    assert.ok(Array.isArray(fb.identity.keysOf(neo.id, s.held)))
    // A recovery key never named cannot sign.
    const s3 = story(), nox = s3.person('nox', { recover: false }), stranger = keyOf('nox_stranger')
    const forged = fb.sign(fb.create('grant', { seq: 1, at: at(), audience: 'public', kind: 'key', public_key_sign: stranger.public_key_sign, recovery_key: stranger.public_key_sign }, { author: nox.id, prev: nox.id, subject: nox.id }), stranger.private_key)
    void forged
  }
  {
    // Held keys (custody): a custodial genesis, a block signed on the person's word by SMS, and the keys taken back.
    const s = story(), coop = s.person('ngozi_coop'), key = keyOf('ama'), recovery = keyOf('ama_recovery')
    const g = genesis(key, { at: at(), recoveryKey: recovery.public_key_sign, reach: 'P30D', custodian: coop.id })
    assert.deepEqual(fb.refusals(g.type, g.state, g.refs), [])
    s.keep('ama: a genesis whose key the co-op holds (state.custodian)', g, 'ama')
    const ama = { name: 'ama', id: g.hash, key }
    const raw = sha('sms from +234 800 000 0000: 2 trays of eggs for Saturday')
    const said = s.say(ama, 'the co-op signs on her word, by SMS: the channel and the raw message named', 'observe', { kind: 'note', text: '2 trays of eggs for Saturday', channel: 'sms' }, { derives_from: raw })
    const phone = keyOf('ama_phone')
    const moved = s.keep('ama takes her key: a key grant to her own phone rotates the held key out', fb.identity.takeKeys(ama.id, phone.public_key_sign, { private_key: key.private_key, last: said }, { heldKey: key.public_key_sign, countedTo: said.hash, at: at() }), 'ama')
    const own = s.say(ama, 'ama speaks from her own phone', 'observe', { kind: 'note', text: 'eggs collected' }, {}, { key: 'ama_phone' })
    const got = record('held keys: a custodial genesis, a block signed on the person\'s word by SMS, and the keys moved to her own device', s, ama.id)
    assert.deepEqual([got[said.hash], got[moved.hash], got[own.hash]], [true, true, true])
  }
  {
    // Two blocks of one key naming one prev: both the author's in the identity fold. A fork voids what the forker claims, never what they owe
    // (decision M5, 2026-10-28): the accept still binds walt, and so does his accept after the fork (make-vectors-1-7.cjs section 18).
    const s = story(), ann = s.person('vera'), bob = s.person('walt')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' }), milk = s.say(ann, 'the kind: milk', 'thing', { kind: 'milk' })
    const offer = s.say(ann, 'the offer: a tray for 4.50', 'promise', { terms: { price: M(450), quantity: A('1', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const offer2 = s.say(ann, 'a second offer: a litre of milk for 1.20', 'promise', { terms: { price: M(120), quantity: A('1', 'L'), expires: DAY } }, { from: ann.id, to: bob.id, what: milk.hash })
    const yes = s.say(bob, 'walt accepts the eggs', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash] })
    const no = s.say(bob, 'walt declines the eggs, naming the same prev: a fork', 'promise', { status: 'declined' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash], link: { seq: yes.state.seq, prev: yes.refs.prev } })
    const later = s.say(bob, 'walt accepts the milk after the fork: it counts for nothing', 'promise', { status: 'accepted' }, { answers: offer2.hash, for: offer2.hash }, { after: [offer2.hash], link: { seq: yes.state.seq + 1, prev: yes.hash } })
    const stage = (first) => fb.promiseStage(s.held.find((b) => b.hash === first), s.held)
    assert.deepEqual([stage(offer.hash).stage, stage(offer.hash).accept, stage(offer2.hash).stage], ['accepted', yes.hash, 'accepted'])
    const got = fb.sync.accept([no], s.held.filter((block) => block !== no))
    const pair = [yes.hash, no.hash].sort()
    assert.deepEqual([got.taken, got.refused, got.equivocations], [[], [], [pair]])
    const signed = record('two blocks of one key that name one prev are both the author\'s in the identity fold', s, bob.id)
    assert.deepEqual([signed[yes.hash], signed[no.hash], signed[later.hash]], [true, true, true])
    V.refusals.cases.push({ name: 'the second of two blocks naming one prev is neither taken nor refused: it is listed in its pair', by: 'accept', incoming: [no.hash], held: s.held.filter((block) => block !== no).map((block) => block.hash), codes: [], taken: [], equivocations: [pair] })
    V.refusals.blocks.push(...blocksOf(s))
    door('the chain fold lists the pair that names one prev', 'check_chain', [s.held.filter((b) => b.refs.author === bob.id && fb.identity.signerOf(b, [{ key: bob.key.public_key_sign, suite: 'std' }])), bob.id], { expect: { equivocations: [pair], ok: false, length: 0 } })
    door('fork_pairs finds the pair across the held blocks', 'fork_pairs', [s.held], { expect: [pair], exact: true })
  }
  {
    // Two key grants of one key naming one prev (a fork that rotates nothing): the keys freeze until the recovery key settles it.
    const s = story(), p = s.person('xena'), a = keyOf('xena_a'), b = keyOf('xena_b')
    const gA = s.keep('a key grant bringing in key a', keyGrant(p.id, a.public_key_sign, { private_key: p.key.private_key, last: null, broughtIn: p.id }, { at: at() }), 'xena')
    const gB = s.keep('a key grant naming the same prev bringing in key b: a fork', keyGrant(p.id, b.public_key_sign, { private_key: p.key.private_key, last: null, broughtIn: p.id }, { at: at() }), 'xena')
    const fromA = s.say(p, 'key a speaks', 'observe', { kind: 'note', text: 'a' }, {}, { key: 'xena_a', link: { seq: 1, prev: gA.hash } })
    const before = blocksOf(s).slice(), frozen = asHeld(before)
    let state = fb.identityState(p.id, frozen)
    assert.deepEqual([state.frozen, state.signed_by_author[gA.hash], state.signed_by_author[gB.hash], state.signed_by_author[fromA.hash]], [[a.public_key_sign, b.public_key_sign].sort(), true, true, false])
    assert.deepEqual(codesOf(fb.sync.accept([fromA], frozen.filter((block) => block.hash !== fromA.hash)).refused), ['void_key'])
    out.push({ name: 'two key grants naming one prev freeze the keys they bring in, whether or not they rotate', id: p.id, blocks: before, signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
    V.refusals.cases.push({ name: 'a block signed by a frozen key: a key of its author that does not speak', by: 'accept', incoming: [fromA.hash], held: before.filter((b) => b.hash !== fromA.hash).map((b) => b.hash), codes: ['void_key'] })
    s.keep('the recovery key rotates the forked key, having seen key a\'s grant', keyGrant(p.id, keyOf('xena_new').public_key_sign, { private_key: p.recovery.private_key, recoveryKey: p.recovery.public_key_sign, last: null }, { replaces: p.key.public_key_sign, countedTo: gA.hash, after: [gA.hash], at: at() }), 'xena_recovery')
    state = fb.identityState(p.id, s.held)
    assert.deepEqual([state.frozen, state.signed_by_author[fromA.hash]], [[b.public_key_sign], true])
    out.push({ name: 'a recovery rotation settles a key-grant pair: the key in its causal past speaks, the other stays frozen', id: p.id, blocks: blocksOf(s), signed_by_author: state.signed_by_author, keys: state.keys, frozen: state.frozen, history: state.history })
  }
  {
    // A micro that only signs: a genesis without an encryption key, which adds one later by a key grant.
    const s = story(), key = keyOf('probe')
    const g = s.keep('probe: a genesis without an encryption key or recovery', genesis(key, { kind: 'machine', at: at() }), 'probe')
    assert.deepEqual(fb.check(g.type, g.state, g.refs), [])
    assert.equal(g.state.public_key_encrypt, undefined)
    s.keep('probe adds an encryption key by a key grant', keyGrant(g.hash, null, { private_key: key.private_key, last: null, broughtIn: g.hash }, { encrypt: key.public_key_encrypt, at: at() }), 'probe')
    const signed = record('a micro that only signs: kind, at, audience and one key are the whole genesis; an encryption key comes later by a key grant', s, g.hash)
    assert.ok(Object.values(signed).every(Boolean))
  }
  {
    // The admission rule may carry the profile field earnest; a limit observe is sealed to the agent (the fence).
    const s = story(), opal = s.person('opal'), bot = s.person('opal_agent', { kind: 'agent' })
    s.say(opal, 'opal answers for her agent', 'grant', { kind: 'operator' }, { to: bot.id })
    const grant = s.say(opal, 'what the agent may do: the visible scope, with no limit in it', 'grant', { kind: 'shop', scope: { acts: ['observe.note'], until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const act = s.say(bot, 'the agent writes under the grant', 'observe', { kind: 'note', text: 'ordered flour' }, { under: grant.hash })
    const fence = fb.grant.limitFence(grant.hash, bot.id, { limit: M(5000), per: 'P7D' })
    const salts = { [bot.id]: sha('opal fence salt').slice(0, 32) }
    const limit = s.say(opal, 'the limit, for the grant: 50.00 a week, sealed to the agent alone', fence.type, { ...fence.state, nonce: sha('opal fence nonce').slice(0, 32) }, fence.refs, { audience: fence.audience, salts })
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held), [])
    assert.deepEqual(fb.grant.whyNotUnder(act, s.held.filter((block) => block !== limit)), [])
    assert.ok(fb.findsSelf(limit, bot.id, salts[bot.id]) && !fb.findsSelf(limit, opal.id, salts[bot.id]))
    const message = fb.sealCopy(limit, { keys: [bot.key.public_key_encrypt], reveals: [fb.revealFor(salts, bot.id)], privateKey: opal.key.private_key, fixed: fixedFor('opal fence', 1) })
    assert.equal(fb.openCopy(message, bot.key.x25519_private).hash, limit.hash)
    const within = [[2000, 3000, 'GBP', true], [2000, 3001, 'GBP', false], [0, 1, 'EUR', false]].map(([spent, minor, currency, ok]) => {
      assert.equal(fb.grant.withinLimit(limit, M(minor, currency), spent), ok)
      return { spent, money: M(minor, currency), within: ok }
    })
    const st = fb.identityState(bot.id, s.held), ours = fb.identityState(opal.id, s.held)
    V.sealed.cases.push({ name: 'the limit observe for a grant is sealed to the agent alone', recipient: 'opal_agent', signer: 'opal', message, opens_to: { hash: limit.hash, signature: limit.signature, reveals: [fb.revealFor(salts, bot.id)] } })
    V.sealed.blocks.push(...blocksOf(s))
    out.push({ name: 'the limit is the principal\'s fence: an observe of kind limit for the grant, sealed to the agent; the grant check never reads it', id: bot.id, blocks: blocksOf(s), signed_by_author: { ...st.signed_by_author, ...ours.signed_by_author }, keys: st.keys, operators: [opal.id], under: { [act.hash]: true },
      fence: { block: limit.hash, grant: grant.hash, agent: bot.id, principal: opal.id, salt: salts[bot.id], limit: fence.state.limit, per: fence.state.per, within }, history: st.history })
  }
}
function fixedFor(label, count) { return { vectorsOnly: true, ephemeral: sha(`${label} ephemeral`), contentKey: sha(`${label} content key`), nonce: sha(`${label} nonce`).slice(0, 24), keyNonces: Array.from({ length: count }, (_, i) => sha(`${label} key nonce ${i}`).slice(0, 24)) } }
identityVectors()

// ---- Deals, circles and the folds. A circle lists its roles as data: [{ name, powers }]; the founder holds the first. ----
const ROLES = { admin: { name: 'admin', powers: ['sign', 'admit', 'remove'] }, orders: { name: 'orders', powers: ['sign'] }, speak: { name: 'speak', powers: [] } }
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
  const circle = s.say(rae, 'the circle', 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Elm St co-op', roles: [ROLES.admin, ROLES.orders, ROLES.speak], public_key_encrypt: keyOf('circle').public_key_encrypt })
  const invitation = s.say(rae, 'the invitation', 'grant', { kind: 'member', roles: ['orders'] }, { subject: circle.hash, as: circle.hash, to: sol.id })
  const answer = s.say(sol, 'the answer', 'grant', { kind: 'member', status: 'accepted' }, { answers: invitation.hash, subject: circle.hash }, { after: [invitation.hash] })
  s.say(rae, 'the end: an updates with status stopped', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: answer.hash }, { updates: invitation.hash, subject: circle.hash, as: circle.hash }, { after: [answer.hash] })
  return { name: 'a membership: invitation, answer, and its end by an updates with status stopped', blocks: blocksOf(s), circle: circle.hash, expected: { members: [rae.id], removed: [sol.id] } }
}


// ---- Folds: promises ----
function promiseFolds() {
  const vectors = []
  const add = (name, s, first, expected, options = {}) => {
    const got = fb.promiseStage(s.held.find((block) => block.hash === first), s.held)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, `${name}: ${key}`)
    vectors.push({ name, blocks: blocksOf(s), first, expected })
  }
  const deal = (setup) => {
    const s = story(), ann = s.person('tia'), bob = s.person('uma')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs', name: 'Eggs' })
    const tray = s.say(ann, 'an instance: a tray', 'thing', { lot: 'L1', pack: fb.amount('1', '{tray}') }, { of: eggs.hash })
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
  const C = s.say(gus, 'the circle', 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'The bakery', roles: [ROLES.admin, ROLES.orders, ROLES.speak] })
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
  s.say(lee, 'lee removes mia', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: miaYes.hash }, { updates: miaInvite.hash, subject: C.hash, as: C.hash }, { after: [leeYes.hash, miaYes.hash] })
  s.say(mia, 'mia removes lee', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: leeYes.hash }, { updates: leeInvite.hash, subject: C.hash, as: C.hash }, { after: [leeYes.hash, miaYes.hash] })
  s.say(kim, 'kim leaves', 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { answers: kimInvite.hash, subject: C.hash })
  s.say(gus, 'hal is removed, his counted_to block named', 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: halYes.hash }, { updates: halInvite.hash, subject: C.hash, as: C.hash })
  const state = fb.circleState(C, s.held)
  const members = Object.fromEntries(Object.entries(state.members).map(([who, member]) => [who, [...member.roles].sort()]))
  const expected = { members: { [gus.id]: ['admin'], [jon.id]: ['admin'] }, removed: [hal.id, kim.id, lee.id, mia.id].sort() }
  assert.deepEqual(members, expected.members)
  assert.deepEqual(Object.keys(state.removed).sort(), expected.removed)
  const circles = [{ name: 'membership and roles: answers, an added role, a role taken away, a removal, a leave, crossing admin removals', blocks: blocksOf(s), circle: C.hash, expected }]
  {
    const t = story(), f = t.person('max'), a1 = t.person('ned_a'), a2 = t.person('oak'), a3 = t.person('pip'), m = t.person('rio'), q = t.person('sam')
    const K = t.say(f, 'a circle: removing an admin takes two, orders may sign as it', 'actor', { kind: 'circle', name: 'Co-op kitchen', removal: { needed: 2 }, roles: [ROLES.admin, ROLES.orders, ROLES.speak] })
    const join = (who, roles) => { const g = t.say(f, `${who.name} invited: ${roles.join(', ')}`, 'grant', { kind: 'member', roles }, { subject: K.hash, as: K.hash, to: who.id }); const y = t.say(who, `${who.name} says yes`, 'grant', { kind: 'member', status: 'accepted' }, { answers: g.hash, subject: K.hash }, { after: [g.hash] }); return { g, y } }
    const j1 = join(a1, ['admin']), j2 = join(a2, ['admin']), j3 = join(a3, ['admin']), jm = join(m, ['orders']), jq = join(q, ['speak'])
    const asM = t.say(m, 'rio signs as the circle (orders may)', 'observe', { kind: 'note', text: 'flour ordered' }, { as: K.hash }, { after: [jm.y.hash] })
    const asQ = t.say(q, 'sam signs as the circle (speak may not)', 'observe', { kind: 'note', text: 'hello' }, { as: K.hash }, { after: [jq.y.hash] })
    const remove = (by, j, label) => t.say(by, label, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: j3.y.hash }, { updates: j3.g.hash, subject: K.hash, as: K.hash }, { after: [j.y.hash, j3.y.hash] })
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
    { name: 'a transfer to an open receiver moves on the orderer\'s signature, to nobody named', thing: soup.hash, owner: null, conflict: null },
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
    const e1 = s.say(w1, 'the first witness records the event', 'observe', { kind: 'trigger', text: 'closed' }, { under: grant.hash, subject: pam.id })
    const e2 = s.say(w2, 'the second witness records it', 'observe', { kind: 'trigger', text: 'closed' }, { under: grant.hash, subject: pam.id })
    const arrivals = { [e1.hash]: '2026-10-01T00:00:00.000Z', [e2.hash]: '2026-10-02T00:00:00.000Z' }
    if (cancel) { const no = s.say(pam, 'gia defeats it: she is here', 'observe', { kind: 'event', text: 'not so' }, { defeats: e2.hash }); arrivals[no.hash] = '2026-10-05T00:00:00.000Z' }
    const now = '2026-10-10T00:00:00.000Z'
    const got = fb.fold.successorView(grant, s.held, { now, arrivedAt: (hash) => arrivals[hash] })
    const expected = cancel ? { events: [e1.hash], fired: false, fires: null } : { events: [e1.hash, e2.hash].sort(), fired: true, fires: '2026-10-09T00:00:00.000Z' }
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, key)
    out.push({ name: cancel ? 'the person defeats an event observe within the wait: the trigger never fires' : 'the needed witnesses record the event; it fires its wait after the last arrived', blocks: blocksOf(s), grant: grant.hash, arrivals, now, expected })
  }
  return out
}
function rekeyFolds() {
  const s = story(), gus = s.person('kai'), jon = s.person('lia')
  const C = s.say(gus, 'the circle, its key at epoch 0', 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Allotment', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove', 'rekey'] }], public_key_encrypt: keyOf('kai_circle0').public_key_encrypt })
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


V.deals = [dealVector()]
V.circles = [circleVector()]
V.folds.promises.push(...promiseFolds())
{ const c = circleFolds(); V.folds.circles.push(...c.circles); V.folds.audience.push(...c.audience) }
V.folds.things.push(thingFolds())
V.folds.successors.push(...successorFolds())
V.folds.rekeys.push(...rekeyFolds())
V.folds.ballots.push(...ballotFolds())

// ---- More stages of the promise fold (folds.md: the order), quote requests, roles with powers ----
{
  const deal = () => {
    const s = story(), ann = s.person('tia2'), bob = s.person('uma2')
    const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs', name: 'Eggs' })
    const tray = s.say(ann, 'an instance: a tray', 'thing', { lot: 'L1', pack: A('1', '{tray}') }, { of: eggs.hash })
    const offer = s.say(ann, 'the offer: two trays for 4.50', 'promise', { terms: { price: M(450), quantity: A('2', '{tray}'), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    s.say(bob, 'the accept', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [offer.hash] })
    return { s, ann, bob, eggs, tray, offer }
  }
  const settle = (d) => {
    const t = d.s.say(d.ann, 'both trays', 'transfer', { amount: A('2', '{tray}') }, { to_owner: d.bob.id, what: d.tray.hash, for: d.offer.hash })
    d.s.say(d.bob, 'received', 'transfer', { status: 'accepted' }, { answers: t.hash, for: d.offer.hash }, { after: [t.hash] })
    const p = d.s.say(d.bob, 'the payment', 'transfer', { money: M(450) }, { to_owner: d.ann.id, for: d.offer.hash })
    d.s.say(d.ann, 'payment received', 'transfer', { status: 'accepted' }, { answers: p.hash, for: d.offer.hash }, { after: [p.hash] })
  }
  const add = (name, d, expected) => {
    const got = fb.promiseStage(d.s.held.find((b) => b.hash === d.offer.hash), d.s.held)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(got[key], value, `${name}: ${key}`)
    V.folds.promises.push({ name, blocks: blocksOf(d.s), first: d.offer.hash, expected })
  }
  let d = deal(); settle(d); d.s.say(d.bob, 'stops onward after it is done', 'promise', { status: 'stopped', stop: 'onward' }, { answers: d.offer.hash, for: d.offer.hash })
  add('the order: done comes before stopped onward, so a done promise stays done', d, { stage: 'done' })
  d = deal(); { const t = d.s.say(d.ann, 'one tray', 'transfer', { amount: A('1', '{tray}') }, { to_owner: d.bob.id, what: d.tray.hash, for: d.offer.hash }); d.s.say(d.bob, 'received', 'transfer', { status: 'accepted' }, { answers: t.hash, for: d.offer.hash }, { after: [t.hash] }) }
  d.s.say(d.bob, 'stops onward while underway', 'promise', { status: 'stopped', stop: 'onward' }, { answers: d.offer.hash, for: d.offer.hash })
  add('the order: stopped onward comes before underway', d, { stage: 'stopped', stop: 'onward' })
  {
    const s = story(), ann = s.person('tia2'), bob = s.person('uma2'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'the offer', 'promise', { terms: { price: M(450), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    const sub = s.say(bob, 'a promise that names the offer in for but answers nothing: a new deal the offer serves', 'promise', { what: 'pick up the eggs', terms: { expires: DAY } }, { from: bob.id, to: bob.id, for: offer.hash })
    const got = fb.promiseStage(offer, s.held), subGot = fb.promiseStage(sub, s.held)
    assert.deepEqual([got.stage, subGot.stage], ['offered', 'accepted'])
    V.folds.promises.push({ name: 'first input: a promise with no answers is not in the deal even if it names the first promise in for', blocks: blocksOf(s), first: offer.hash, expected: { stage: 'offered', accept: null } })
  }
  {
    // Consent decides what binds, not what exists: an ask sent despite a live STOP is valid and kept, and reads as declined.
    const s = story(), ann = s.person('tia4'), bob = s.person('uma4'), eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
    const stop = s.say(bob, 'bob tells ann he wants no contact', 'observe', { kind: 'consent', word: 'stop' }, { subject: ann.id })
    const ask = s.say(ann, 'ann asks bob for a tray anyway', 'promise', { terms: { price: M(450), expires: DAY } }, { from: bob.id, to: ann.id, what: eggs.hash })
    assert.equal(fb.promiseStage(ask, s.held).stage, 'declined')
    V.folds.promises.push({ name: 'consent: an ask sent despite a live STOP is kept and reads as declined: it binds no one', blocks: blocksOf(s), first: ask.hash, expected: { stage: 'declined', accept: null } })
    s.say(bob, 'bob answers it accepted himself: answers is the only consent to a deal', 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash }, { after: [ask.hash] })
    assert.equal(fb.promiseStage(ask, s.held).stage, 'accepted')
    V.folds.promises.push({ name: 'consent: his own accept of that ask still binds', blocks: blocksOf(s), first: ask.hash, expected: { stage: 'accepted' } })
    void stop
  }
  {
    // A quote request: an agent's ask whose grant does not name the act binds no one until the principal answers it.
    const mk = (acts) => {
      const s = story(), ann = s.person('tia3'), bob = s.person('uma3'), bot = s.person('uma3_agent', { kind: 'agent' })
      s.say(bob, 'bob answers for his agent', 'grant', { kind: 'operator' }, { to: bot.id })
      const grant = s.say(bob, `the agent may ${acts.join(', ')}`, 'grant', { kind: 'shop', scope: { acts, until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
      const eggs = s.say(ann, 'the kind: eggs', 'thing', { kind: 'eggs' })
      const ask = s.say(bot, 'the agent asks ann for a tray', 'promise', { terms: { price: M(450), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash, under: grant.hash })
      s.say(ann, 'ann accepts the ask', 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash }, { after: [ask.hash] })
      return { s, ann, bob, bot, ask }
    }
    let q = mk(['observe.note'])
    assert.equal(fb.promiseStage(q.ask, q.s.held).stage, 'asked')
    V.folds.promises.push({ name: 'an agent\'s ask is a quote request unless its grant names the act: ann\'s accept binds no one', blocks: blocksOf(q.s), first: q.ask.hash, expected: { stage: 'asked', accept: null } })
    q.s.say(q.bob, 'the principal answers the ask accepted: now ann\'s accept binds', 'promise', { status: 'accepted' }, { answers: q.ask.hash, for: q.ask.hash })
    assert.equal(fb.promiseStage(q.ask, q.s.held).stage, 'accepted')
    V.folds.promises.push({ name: 'the principal\'s own answer makes the agent\'s ask bind', blocks: blocksOf(q.s), first: q.ask.hash, expected: { stage: 'accepted' } })
    q = mk(['promise', 'observe.note'])
    assert.equal(fb.promiseStage(q.ask, q.s.held).stage, 'accepted')
    V.folds.promises.push({ name: 'a grant whose scope.acts names promise lets the agent\'s ask bind at once', blocks: blocksOf(q.s), first: q.ask.hash, expected: { stage: 'accepted' } })
    const qq = mk(['observe.note'])
    assert.equal(fb.promiseStage(qq.ask, qq.s.held).stage, 'asked')
    V.refusals.cases.push({ name: 'an accept of a quote request binds no one', by: 'fold', blocks: blocksOf(qq.s), first: qq.ask.hash, expected: { stage: 'asked' }, codes: ['quote_only'] })
  }
  {
    // Roles with powers: sign, admit, remove. The founder holds the first role. A role's name is never read.
    const s = story(), eve = s.person('eve'), fay = s.person('fay'), gus = s.person('gus'), hal = s.person('hal'), ivy = s.person('ivy')
    const C = s.say(eve, 'the circle: roles are data, [{ name, powers }]', 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Night kitchen', roles: [{ name: 'chef', powers: ['sign', 'admit', 'remove'] }, { name: 'cook', powers: ['sign'] }, { name: 'guest', powers: [] }] })
    const join = (who, roles, label, by = eve, after = []) => { const g = s.say(by, `${label}: invited`, 'grant', { kind: 'member', roles }, { subject: C.hash, as: C.hash, to: who.id }, { after }); const y = s.say(who, `${label}: says yes`, 'grant', { kind: 'member', status: 'accepted' }, { answers: g.hash, subject: C.hash }, { after: [g.hash] }); return { g, y } }
    const f = join(fay, ['cook'], 'fay is a cook'), g = join(gus, ['guest'], 'gus is a guest'), h = join(hal, ['chef'], 'hal is a chef')
    // A cook holds no admit: her invitation of ivy does not count. A chef's does.
    const bad = s.say(fay, 'a cook invites ivy: no admit, not counted', 'grant', { kind: 'member', roles: ['cook'] }, { subject: C.hash, as: C.hash, to: ivy.id }, { after: [f.y.hash] })
    s.say(ivy, 'ivy says yes to the cook\'s invitation', 'grant', { kind: 'member', status: 'accepted' }, { answers: bad.hash, subject: C.hash }, { after: [bad.hash] })
    const asFay = s.say(fay, 'a cook signs as the circle (sign)', 'observe', { kind: 'note', text: 'bread out' }, { as: C.hash }, { after: [f.y.hash] })
    const asGus = s.say(gus, 'a guest signs as the circle: no sign power', 'observe', { kind: 'note', text: 'hello' }, { as: C.hash }, { after: [g.y.hash] })
    const asHal = s.say(hal, 'a chef signs as the circle', 'observe', { kind: 'note', text: 'closed' }, { as: C.hash }, { after: [h.y.hash] })
    const state = fb.circleState(C, s.held)
    const members = Object.fromEntries(Object.entries(state.members).map(([who, m]) => [who, [...m.roles].sort()]))
    const expected = { members: { [eve.id]: ['chef'], [fay.id]: ['cook'], [gus.id]: ['guest'], [hal.id]: ['chef'] }, removed: [] }
    assert.deepEqual(members, expected.members)
    const may_act = { [asFay.hash]: true, [asGus.hash]: false, [asHal.hash]: true }
    for (const [hash, ok] of Object.entries(may_act)) assert.equal(fb.fold.mayActAs(s.held.find((b) => b.hash === hash), C, s.held), ok)
    V.folds.circles.push({ name: 'roles with powers: only admit invites, only sign signs as the circle; a role\'s name is never read', blocks: blocksOf(s), circle: C.hash, expected, may_act })
    V.refusals.cases.push({ name: 'a signature as a circle by a member without the sign power', by: 'may_act_as', blocks: blocksOf(s), circle: C.hash, block: asGus.hash, ok: false, codes: ['no_role'] })
    // bad_roles is a block-level refusal.
    const roleBlock = (roles) => ({ type: 'actor', state: { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public', kind: 'circle', name: 'x', roles }, refs: { author: eve.id, prev: eve.id } })
    for (const [name, roles] of [['a role with a power the protocol does not list', [{ name: 'chef', powers: ['fly'] }]], ['a circle with no first role for the founder', []], ['a role without a name', [{ powers: ['sign'] }]]]) {
      const b = roleBlock(roles)
      assert.deepEqual(codesOf(fb.refusals(b.type, b.state, b.refs)), ['bad_roles'], name)
      V.refusals.cases.push({ name, by: 'check', block: b, codes: ['bad_roles'] })
    }
  }
}

// ---- Refusals: blocks every node must refuse, with the codes a strict check finds ----
function refusals() {
  const R = V.refusals
  const pushStory = (st) => { for (const b of blocksOf(st)) if (!R.blocks.some((x) => x.hash === b.hash)) R.blocks.push(b) }
  const s = story(), ann = s.person('mae'), bob = s.person('ned')
  const common = { seq: 1, at: '2026-10-15T12:00:00.000Z', audience: 'public' }
  const base = (state = {}, refs = {}, type = 'observe') => ({ type, state: { ...common, kind: 'note', ...state }, refs: { author: ann.id, prev: ann.id, ...refs } })
  const check = (name, block, want, held) => {
    const options = held ? { held: new Map(held.map((b) => [b.hash, b])) } : undefined
    const codes = codesOf(fb.refusals(block.type, block.state, block.refs, options))
    assert.deepEqual(codes, want, `${name}: ${JSON.stringify(fb.refusals(block.type, block.state, block.refs, options))}`)
    R.cases.push({ name, by: 'check', block, ...(held ? { held: held.map((b) => b.hash) } : {}), codes })
  }
  const h1 = sha('one'), h2 = sha('two')
  // Strict writing (canonical.md).
  check('a float', base({ temperature: 3.9 }), ['float'])
  check('a whole number above 2^53 - 1', base({ seq: 2 ** 53 }), ['integer_range'])
  check('a null in state', base({ text: null }), ['not_canonical'])
  check('a null in an array', base({ list: ['a', null] }), ['not_canonical'])
  check('a set under refs not sorted', base({}, { subject: [h1, h2].sort().reverse() }), ['not_canonical'])
  check('a repeat in a set', base({}, { subject: [h1, h1] }), ['not_canonical'])
  check('a string not in NFC', base({ text: 'café' }), ['not_canonical'])
  check('a key not written in NFC', base({ ['café']: 'decomposed' }), ['not_canonical'])
  check('a state that is not an object', { type: 'observe', state: [], refs: {} }, ['not_canonical'])
  // Values and grammars.
  check('a decimal string with a leading zero', base({ pack: { value: '007', unit: '{egg}' } }, {}, 'thing'), ['decimal'])
  check('an id that is not 64 hex', base({}, { subject: 'ABC' }), ['grammar'])
  check('an id with a hash name this reader does not know', base({}, { subject: `blake3:${sha('x')}` }), ['unknown_suite'])
  check('an id with a known hash name is fine (sm3:)', base({}, { subject: `sm3:${sha('x')}` }), [])
  check('a type that is not a word (a dotted old name)', { type: 'observe.received', state: { ...common }, refs: { author: ann.id, prev: ann.id } }, ['type_name'])
  check('a type with a capital', { type: 'Observe', state: { ...common }, refs: { author: ann.id, prev: ann.id } }, ['type_name'])
  check('a time on 30 February', base({ at: '2026-02-30T12:00:00.000Z' }), ['calendar'])
  check('a time not in the exact form', base({ at: '2026-10-15T12:00:00Z' }), ['time'])
  check('a date on 30 February', base({ use_by: '2026-02-30' }, {}, 'thing'), ['calendar'])
  check('a duration that is not ISO 8601', base({ per: 'weekly' }), ['time'])
  check('an amount without its unit', base({ weight: { value: '1' } }), [])
  check('an amount without its unit, as a shape (unit and value, value a number)', base({ weight: { value: 1, unit: 'kg' } }), ['shape'])
  // Limits.
  check('a body over 65,536 bytes', base({ text: 'x'.repeat(65536) }), ['size_limit'])
  check('more than 16 heads in after', base({}, { after: Array.from({ length: 17 }, (_, i) => sha(`head ${i}`)).sort() }), ['after_limit'])
  // The common five, the genesis.
  check('a block with no author, prev, seq or audience', { type: 'observe', state: { at: '2026-10-15T12:00:00.000Z', kind: 'note' }, refs: {} }, ['chain'])
  check('a thing with no at: only an observe, transform or transfer may leave it out', base({ kind: 'eggs', at: undefined }, {}, 'thing'), ['at_missing'])
  check('an observe with no at is accepted (a micro with no clock)', base({ at: undefined }), [])
  {
    const key = keyOf('mae'), recovery = keyOf('mae_recovery')
    const g = { kind: 'person', at: common.at, audience: 'public', public_key_sign: key.public_key_sign }
    check('a genesis of kind, at, audience and one key', { type: 'actor', state: g, refs: {} }, [])
    check('a genesis with the recovery pair', { type: 'actor', state: { ...g, recovery_key_hash: recoveryKeyHash(recovery.public_key_sign), recovery_reach: 'P30D' }, refs: {} }, [])
    check('a genesis with only recovery_reach', { type: 'actor', state: { ...g, recovery_reach: 'P30D' }, refs: {} }, ['bad_genesis'])
    check('a genesis with only recovery_key_hash', { type: 'actor', state: { ...g, recovery_key_hash: recoveryKeyHash(recovery.public_key_sign) }, refs: {} }, ['bad_genesis'])
    check('a genesis with an author', { type: 'actor', state: g, refs: { author: ann.id } }, ['bad_genesis'])
    check('a genesis with a seq', { type: 'actor', state: { ...g, seq: 1 }, refs: {} }, ['bad_genesis'])
    check('a genesis that is not public', { type: 'actor', state: { ...g, audience: [sha('c')] }, refs: {} }, ['bad_genesis'])
    check('a genesis with no kind', { type: 'actor', state: { at: g.at, audience: 'public', public_key_sign: g.public_key_sign }, refs: {} }, ['bad_genesis'])
    check('a genesis naming a suite this reader does not know', { type: 'actor', state: { ...g, suite: 'ml-dsa' }, refs: {} }, ['unknown_suite'])
    check('a genesis whose key is not in the grammar of its suite', { type: 'actor', state: { ...g, suite: 'p256' }, refs: {} }, ['unknown_suite'])
    check('a genesis whose custodian is not an id', { type: 'actor', state: { ...g, custodian: 'the co-op' }, refs: {} }, ['grammar'])
  }
  // Closed types: required fields, undeclared fields and refs.
  check('an actor with no kind', base({ kind: undefined }, {}, 'actor'), ['required'])
  check('a transfer that moves nothing and says what', base({}, {}, 'transfer'), ['required'])
  check('a transfer with a what and no receiver', base({}, { what: h1 }, 'transfer'), ['required'])
  check('a promise with no what', base({ terms: { expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id }, 'promise'), ['required'])
  check('a grant with no kind', base({ kind: undefined }, {}, 'grant'), ['required'])
  check('a field a closed type does not declare', base({ colour: 'brown' }, { from: ann.id, what: h1 }, 'promise'), ['undeclared_field'])
  check('a ref a closed type does not declare', base({}, { from: ann.id, what: h1, seller: bob.id }, 'promise'), ['undeclared_ref'])
  check('an open type is checked against core alone: any field, any ref', base({ colour: 'brown' }, { seller: bob.id }, 'weather'), [])
  check('a promise carrying a status without answering', base({ status: 'accepted' }, { from: ann.id, to: bob.id, what: h1 }, 'promise'), ['status_not_answer'])
  check('a status outside the three', base({ status: 'delivered' }, { answers: h1, for: h1 }, 'promise'), ['bad_status'])
  check('an ask with no expires', base({ what: 'eggs' }, { to: ann.id }, 'promise'), ['ask_without_expires'])
  // a promise signed by neither side is valid (clean round 2): whether its signer is a side is the fold's (make-vectors-1-7.cjs, section 24)
  check('an answer that does not name its deal in for', base({ status: 'accepted' }, { answers: h1 }, 'promise'), ['deal_not_named'])
  check('a grant others act under with no scope.until', base({ kind: 'shop', scope: { acts: ['promise'] } }, { to: bob.id }, 'grant'), ['scope_until'])
  check('a key grant with a scope.until', base({ kind: 'key', public_key_sign: keyOf('mae').public_key_sign, scope: { until: '2026-12-31T00:00:00.000Z' } }, { subject: ann.id }, 'grant'), ['scope_until'])
  check('a line without an id', base({ terms: { lines: [{ what: h1, quantity: A('1', 'kg'), price: M(100) }], expires: '2026-10-20T00:00:00.000Z' } }, { from: ann.id, what: h1 }, 'promise'), ['lines'])
  check('a member grant not signed as the circle', base({ kind: 'member' }, { subject: h1, to: bob.id }, 'grant'), ['required'])
  check('a key grant naming no key', base({ kind: 'key' }, { subject: ann.id }, 'grant'), ['required'])
  check('a rotation naming the old key but not counted_to', base({ kind: 'key', public_key_sign: keyOf('mae').public_key_sign, replaces: keyOf('mae').public_key_sign }, { subject: ann.id }, 'grant'), ['required'])
  // Year zero: the old words are not read. A closed type refuses them; an open type just stores them.
  {
    const key = keyOf('mae')
    check('a genesis naming alg_sign (an old field)', { type: 'actor', state: { kind: 'person', at: common.at, audience: 'public', public_key_sign: key.public_key_sign, alg_sign: 'ed25519' }, refs: {} }, ['bad_genesis'])
    check('a contact naming signers (an old field of a circle)', base({ kind: 'contact', signers: ['admin'] }, {}, 'actor'), ['undeclared_field'])
    check('a grant naming a manifest (an old field)', base({ kind: 'key', public_key_sign: key.public_key_sign, manifest: [h1] }, { subject: ann.id }, 'grant'), ['undeclared_field'])
    check('a promise naming a status as an old reading: delivered', base({ status: 'delivered' }, { from: ann.id, to: bob.id, what: h1 }, 'promise'), ['status_not_answer', 'bad_status'])
  }
  // Money, currencies, the profile fields an open type may carry.
  const bread = { issuer: keyOf('mae').public_key_sign.slice(-64), unit: 'bread credit', decimals: 0 }
  check('money in an issuer unit { issuer, unit, decimals } is accepted', base({ money: { minor: 3, currency: bread } }, { to_owner: bob.id, what: h1 }, 'transfer'), [])
  check('a currency that is neither an ISO code nor an issuer unit', base({ money: { minor: 3, currency: 'gbp' } }, { to_owner: bob.id }, 'transfer'), ['shape'])
  check('an issuer unit needs its decimals', base({ money: { minor: 3, currency: { issuer: bread.issuer, unit: 'bread credit' } } }, { to_owner: bob.id }, 'transfer'), ['shape'])
  check('decimals above the limit of 15', base({ money: { minor: 3, currency: { ...bread, decimals: 16 } } }, { to_owner: bob.id }, 'transfer'), ['shape'])
  check('a sealed audience not sorted', base({ audience: [sha('b'), sha('a')].sort().reverse(), nonce: sha('n').slice(0, 32) }), ['audience'])
  check('a sealed block with no nonce', base({ audience: [sha('a')] }), ['audience'])
  // A child grant wider than its parent (needs the parent).
  {
    const parent = s.say(ann, 'a parent grant: acts accept, until December, depth 1', 'grant', { kind: 'shop', depth: 1, scope: { acts: ['accept'], limit: M(5000), until: '2026-12-31T00:00:00.000Z' } }, { to: bob.id })
    const child = { type: 'grant', state: { ...common, kind: 'shop', scope: { acts: ['accept', 'offer'], limit: M(9000), until: '2027-06-30T00:00:00.000Z' } }, refs: { author: bob.id, prev: bob.id, parent: parent.hash, to: sha('someone') } }
    check('a child grant wider than its parent', child, ['wider_than_parent'], [parent])
    check('a grant passed on by someone who is not the parent\'s receiver', { ...child, state: { ...child.state, scope: { acts: ['accept'], limit: M(100), until: '2026-11-30T00:00:00.000Z' } }, refs: { ...child.refs, author: ann.id } }, ['not_receiver'], [parent])
  }
  // The checks that read the context: signature, key and chain.
  const valid = (name, block, held, codes) => {
    const got = codesOf(fb.valid(block, held))
    assert.deepEqual(got, codes, `${name}: ${JSON.stringify(fb.valid(block, held))}`)
    R.cases.push({ name, by: 'valid', block, held: held.map((b) => b.hash), codes })
  }
  {
    const note = s.say(ann, 'mae writes a note', 'observe', { kind: 'note', text: 'one' })
    const known = s.held.filter((b) => b !== note)
    valid('a valid block is valid against the blocks before it', note, known, [])
    valid('an id sent with the block is not the hash of its bytes', { ...note, hash: sha('not it') }, known, ['bad_hash'])
    valid('a signature by a key that is not the author\'s', { ...note, signature: fb.sign(note, keyOf('ned').private_key) }, known, ['bad_signature'])
    valid('a signature that does not open the bytes', { ...note, state: { ...note.state, text: 'two' }, hash: undefined }, known, ['bad_signature'])
    valid('a block whose author\'s genesis is not held', note, [], ['unmet'])
    valid('a block whose prev is not held waits: it is not judged', note, known.filter((b) => b.hash === ann.id), ['unmet'])
    const skewed = fb.write('observe', { kind: 'note', text: 'seq skewed' }, {}, { author: ann.id, key: keyOf('mae'), held: s.held, at: at(), link: { seq: 7, prev: note.hash } })
    valid('a seq that is not one more than the previous block\'s', skewed, s.held, ['chain'])
    const skip = fb.write('observe', { kind: 'note', text: 'a skip' }, {}, { author: ann.id, key: keyOf('mae'), held: s.held, at: at(), link: { seq: 7, prev: note.hash }, skip: true })
    valid('a skip block may jump seq forward', skip, s.held, [])
    const back = fb.write('observe', { kind: 'note', text: 'a skip backwards' }, {}, { author: ann.id, key: keyOf('mae'), held: s.held, at: at(), link: { seq: 1, prev: note.hash }, skip: true })
    valid('a skip that goes backwards', back, s.held, ['chain'])
    const recoveryNote = fb.sign(fb.create('observe', { seq: 1, at: at(), audience: 'public', kind: 'note', text: 'from the recovery key', recovery_key: keyOf('mae_recovery').public_key_sign }, { author: ann.id, prev: ann.id }), keyOf('mae_recovery').private_key)
    void recoveryNote
    const rb = fb.create('observe', { seq: 1, at: at(), audience: 'public', kind: 'note', text: 'from the recovery key', recovery_key: keyOf('mae_recovery').public_key_sign }, { author: ann.id, prev: ann.id })
    rb.signature = fb.sign(rb, keyOf('mae_recovery').private_key)
    valid('the recovery key signs only key grants and the defeats a profile gives it', rb, s.held.filter((b) => b.hash === ann.id), ['recovery_scope'])
  }
  // Push: what a node waits for, takes and refuses.
  {
    const note = s.say(bob, 'ned writes a note', 'observe', { kind: 'note', text: 'hi' })
    const next = s.say(bob, 'ned writes a second note', 'observe', { kind: 'note', text: 'again' })
    const got = fb.sync.accept([next], s.held.filter((b) => b !== note && b !== next))
    assert.deepEqual([got.taken.length, got.waiting.map((w) => w.hash), got.refused.length], [0, [next.hash], 0])
    R.cases.push({ name: 'a block whose prev is not held waits', by: 'accept', incoming: [next.hash], held: s.held.filter((b) => b !== note && b !== next).map((b) => b.hash), codes: [], taken: [], waiting: [next.hash] })
    const got2 = fb.sync.accept([next, note], s.held.filter((b) => b !== note && b !== next))
    assert.deepEqual(got2.taken.map((b) => b.hash), [note.hash, next.hash])
    R.cases.push({ name: 'a push in any order is taken in causal order', by: 'accept', incoming: [next.hash, note.hash], held: s.held.filter((b) => b !== note && b !== next).map((b) => b.hash), codes: [], taken: [note.hash, next.hash] })
    const forged = { ...note, signature: fb.sign(note, keyOf('mae').private_key) }
    assert.deepEqual(codesOf(fb.sync.accept([forged], s.held.filter((b) => b !== note && b !== next)).refused), ['bad_signature'])
    R.cases.push({ name: 'a block signed by another identity\'s key', by: 'accept', incoming: [forged.hash], held: s.held.filter((b) => b !== note && b !== next).map((b) => b.hash), codes: ['bad_signature'], inline: [forged] })
    const open = s.say(bob, 'an open type from ned', 'weather', { colour: 'grey' }, { seller: ann.id })
    assert.equal(fb.sync.accept([open], s.held.filter((b) => b !== open && b !== next && b !== note).concat([note, next])).taken.length, 1)
  }
  // Folds: why a fold counts a block for nothing.
  {
    const d = story(), tia = d.person('ora'), uma = d.person('pam'), eve = d.person('rex')
    const eggs = d.say(tia, 'the kind', 'thing', { kind: 'eggs' })
    const offer = d.say(tia, 'a one-to-one offer', 'promise', { terms: { price: M(450), expires: DAY } }, { from: tia.id, to: uma.id, what: eggs.hash })
    d.say(eve, 'a stranger answers it accepted', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { unchecked: true })
    assert.equal(fb.promiseStage(offer, d.held).stage, 'offered')
    R.cases.push({ name: 'a deal block signed by a non-side does not count', by: 'fold', blocks: blocksOf(d), first: offer.hash, expected: { stage: 'offered' }, codes: ['not_a_side'] })
  }
  {
    const d = story(), tia = d.person('ora'), dan = d.person('sid'), cat = d.person('tom')
    const eggs = d.say(tia, 'the kind', 'thing', { kind: 'eggs' })
    const offer = d.say(tia, 'an open offer', 'promise', { terms: { price: M(450), quantity: A('10', '{tray}'), expires: DAY } }, { from: tia.id, what: eggs.hash })
    d.say(dan, 'a stranger counters it', 'promise', { terms: { price: M(100), expires: DAY } }, { from: tia.id, to: dan.id, what: eggs.hash, answers: offer.hash, for: offer.hash })
    const request = d.say(cat, 'another asks for two', 'promise', { status: 'accepted', terms: { quantity: A('2', '{tray}') } }, { answers: offer.hash, for: offer.hash, to: cat.id })
    d.say(tia, 'the offerer allocates to her', 'promise', { status: 'accepted' }, { answers: request.hash, for: offer.hash })
    assert.equal(fb.promiseStage(offer, d.held).stage, 'accepted')
    R.cases.push({ name: 'a counter does not end an open offer: only its author does', by: 'fold', blocks: blocksOf(d), first: offer.hash, expected: { stage: 'accepted' }, codes: ['open_offer_counter'] })
  }
  {
    const d = story(), tia = d.person('ora2'), uma = d.person('pam2')
    const eggs = d.say(tia, 'the kind', 'thing', { kind: 'eggs' }), tray = d.say(tia, 'a tray', 'thing', { pack: A('1', '{tray}') }, { of: eggs.hash })
    const offer = d.say(tia, 'the offer', 'promise', { terms: { price: M(450), quantity: A('1', '{tray}'), expires: DAY } }, { from: tia.id, to: uma.id, what: eggs.hash })
    d.say(uma, 'yes', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    d.say(tia, 'a tray sent, never accepted by the receiver', 'transfer', { amount: A('1', '{tray}') }, { to_owner: uma.id, what: tray.hash, for: offer.hash })
    assert.equal(fb.promiseStage(offer, d.held).stage, 'accepted')
    R.cases.push({ name: 'a settling block the receiver has not accepted counts for nothing', by: 'fold', blocks: blocksOf(d), first: offer.hash, expected: { stage: 'accepted' }, codes: ['not_counted'] })
  }
  // Acts that cannot be undone.
  {
    const u = story(), farm = u.person('farm'), bot = u.person('farm_bot', { kind: 'machine' })
    u.say(farm, 'the farm answers for its sprayer', 'grant', { kind: 'operator' }, { to: bot.id })
    const schema = u.say(farm, 'a schema: spraying cannot be undone', 'thing', { kind: 'schema', target: 'observe.spray', undo: 'never', fields: { field: 'text' } })
    const broad = u.say(farm, 'a broad grant: any observe', 'grant', { kind: 'shop', scope: { acts: ['observe'], limit: M(5000), until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const named = u.say(farm, 'a grant that names the act and has a limit', 'grant', { kind: 'shop', scope: { acts: ['observe.spray'], limit: M(5000), until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const noLimit = u.say(farm, 'a grant that names the act and has no limit', 'grant', { kind: 'shop', scope: { acts: ['observe.spray'], until: '2026-12-31T00:00:00.000Z' } }, { to: bot.id })
    const spray = (grant) => u.say(bot, 'the sprayer sprays', 'observe', { kind: 'spray', text: 'bed 3' }, { under: grant.hash, schema: schema.hash })
    const a = spray(broad), b = spray(named), c = spray(noLimit)
    assert.equal(fb.grant.whyNotUnder(a, u.held).length, 1)
    assert.deepEqual(fb.grant.whyNotUnder(b, u.held), [])
    assert.equal(fb.grant.whyNotUnder(c, u.held).length, 1)
    // A specific ask the principal answered accepted.
    const ask = u.say(bot, 'the machine asks: may I spray bed 3', 'promise', { what: 'observe.spray', terms: { expires: DAY } }, { from: farm.id, to: bot.id, under: broad.hash })
    u.say(farm, 'the farm answers accepted', 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash })
    const d2 = u.say(bot, 'the sprayer sprays after the accepted ask', 'observe', { kind: 'spray', text: 'bed 3' }, { under: broad.hash, schema: schema.hash, for: ask.hash })
    assert.deepEqual(fb.grant.whyNotUnder(d2, u.held), [])
    pushStory(u)
    R.cases.push({ name: 'an act that cannot be undone, under a broad grant, is not live', by: 'under', block: a.hash, held: 'blocks', live: false, codes: ['not_live'] })
    R.cases.push({ name: 'an act that cannot be undone, under a grant that names it with a limit, is live', by: 'under', block: b.hash, held: 'blocks', live: true, codes: [] })
    R.cases.push({ name: 'a grant that names the act but has no limit is not enough', by: 'under', block: c.hash, held: 'blocks', live: false, codes: ['not_live'] })
    R.cases.push({ name: 'a specific ask the principal answered accepted makes the act live', by: 'under', block: d2.hash, held: 'blocks', live: true, codes: [] })
  }
  // Envelope over limits: a sealed copy whose block is over 65,536 bytes is refused when opened.
  {
    const big = fb.create('observe', { seq: 2, at: '2026-10-15T12:40:00.000Z', audience: 'public', kind: 'note', text: 'x'.repeat(70000) }, { author: ann.id, prev: ann.id })
    big.signature = fb.sign(big, keyOf('mae').private_key)
    const message = fb.sealCopy(big, { keys: [keyOf('ned').public_key_encrypt], privateKey: keyOf('mae').private_key, fixed: fixedFor('big', 1) })
    assert.throws(() => fb.openCopy(message, keyOf('ned').x25519_private), (error) => error.code === 'size_limit')
    R.cases.push({ name: 'a sealed copy whose block is over 65,536 bytes is refused', by: 'open', recipient: 'ned', message, codes: ['size_limit'] })
  }
  pushStory(s)
}
refusals()

// ---- Sealed copies, headers, envelopes and node messages ----
function messages() {
  const s = story(), ivy = s.person('ivo'), jon = s.person('jem'), holder = s.person('kiosk', { kind: 'machine' }), quin = s.person('quin'), rae = s.person('rae'), sol = s.person('sol')
  // A node signs with a key of its holder, brought in by a key grant; there is no separate node actor.
  s.keep('the kiosk brings in its node key', keyGrant(holder.id, keyOf('kiosk_node').public_key_sign, { private_key: holder.key.private_key, last: null, broughtIn: holder.id }, { at: at() }), 'kiosk')
  const node = { id: holder.id, key: keyOf('kiosk_node') }
  const salts = { [jon.id]: sha('jem salt').slice(0, 32) }
  const note = s.say(ivy, 'a note sealed to jem', 'observe', { kind: 'note', text: 'two trays kept back', nonce: sha('note nonce').slice(0, 32) }, {}, { audience: [jon.id], salts })
  const message = fb.sealCopy(note, { keys: [jon.key.public_key_encrypt], reveals: [fb.revealFor(salts, jon.id)], privateKey: ivy.key.private_key, fixed: fixedFor('note', 1) })
  assert.equal(fb.openCopy(message, jon.key.x25519_private).hash, note.hash)
  V.sealed.cases.push({ name: 'a private block sealed to one recipient, its reveal inside, its header signed', recipient: 'jem', signer: 'ivo', message, opens_to: { hash: note.hash, signature: note.signature, reveals: [fb.revealFor(salts, jon.id)] } })
  // A copy for two recipients.
  const salts2 = { [rae.id]: sha('rae push salt').slice(0, 32), [sol.id]: sha('sol push salt').slice(0, 32) }
  const note2 = s.say(quin, 'a note sealed to rae and sol', 'observe', { kind: 'note', text: 'oven at 6', nonce: sha('quin push nonce').slice(0, 32) }, {}, { audience: [rae.id, sol.id], salts: salts2 })
  const message2 = fb.sealCopy(note2, { keys: [rae.key.public_key_encrypt, sol.key.public_key_encrypt], reveals: [fb.revealFor(salts2, rae.id), fb.revealFor(salts2, sol.id)], privateKey: quin.key.private_key, fixed: fixedFor('quin push', 2) })
  for (const who of [rae, sol]) V.sealed.cases.push({ name: `a copy sealed to two recipients opens for ${who.name}`, recipient: who.name, signer: 'quin', message: message2, opens_to: { hash: note2.hash, signature: note2.signature, reveals: [fb.revealFor(salts2, rae.id), fb.revealFor(salts2, sol.id)] } })
  V.sealed.blocks.push(...blocksOf(s))
  // Headers: author, seq, prev, hash; withheld says the author left the block's subject out of its audience (privacy.md, decision F8).
  const headers = blocksOf(s).filter((b) => b.block.state.seq !== undefined).map((b) => ({ name: b.name, hash: b.hash, header: fb.header({ hash: b.hash, ...b.block }), signer: b.signer, header_signature: fb.signMessage(fb.header({ hash: b.hash, ...b.block }), keyOf(b.signer).private_key).signature }))
  V.headers = headers
  const withheld = s.say(ivy, 'a safety report with its subject left out: the header repeats withheld', 'observe', { kind: 'report', text: 'listeria', withheld: true }, { under: sha('a food safety law') })
  door('a withheld block\'s public header says so', 'header', [withheld], { expect: { author: ivy.id, seq: withheld.state.seq, prev: withheld.refs.prev, hash: withheld.hash, withheld: true }, exact: true })
  door('an ordinary header has the four fields only', 'header', [note], { expect: { author: ivy.id, seq: note.state.seq, prev: note.refs.prev, hash: note.hash }, exact: true })
  V.messages = { node: node.id, node_signer: 'kiosk_node' }
  // Signed requests: a counter, or a challenge issued by the node. No time anywhere.
  const pull = fb.sync.signPull({ since: 0, limit: 10, filter: { author: ivy.id } }, { signer: jon.id, node: node.id, privateKey: jon.key.private_key, counter: 5 })
  assert.equal(pull.at, undefined)
  const challenge = sha('a challenge the node issued').slice(0, 32)
  const pullC = fb.sync.signPull({ since: 0 }, { signer: jon.id, node: node.id, privateKey: jon.key.private_key, challenge })
  const push = fb.sync.signPush({ messages: [message], for: { [note.hash]: [jon.id] } }, { signer: ivy.id, node: node.id, privateKey: ivy.key.private_key, counter: 1 })
  const keysOfJem = [jon.key.public_key_sign]
  const opts = (extra) => ({ node: node.id, keys: keysOfJem, ...extra })
  assert.deepEqual(fb.sync.pullRefusals(pull, opts({ highest: 4 })), [])
  assert.deepEqual(codesOf(fb.sync.pullRefusals(pull, opts({ highest: 5 }))), ['replay'])
  assert.deepEqual(fb.sync.pullRefusals(pullC, opts({ issued: [challenge] })), [])
  assert.deepEqual(codesOf(fb.sync.pullRefusals(pullC, opts({ issued: [] }))), ['replay'])
  assert.deepEqual(codesOf(fb.sync.pullRefusals(pull, opts({ node: sha('another node'), highest: 4 }))), ['wrong_node'])
  assert.deepEqual(codesOf(fb.sync.pullRefusals({ ...pull, since: 1 }, opts({ highest: 4 }))), ['bad_signature'])
  assert.deepEqual(codesOf(fb.sync.pullRefusals(pull, opts({ keys: [ivy.key.public_key_sign], highest: 4 }))), ['bad_signature'])
  const log = s.held.map((block, i) => ({ n: i + 1, block, ...(block.hash === note.hash ? { copies: { [jon.id]: message }, header_signature: message.header_signature } : {}) }))
  const answer = fb.sync.answerPull(log, pull, { node: node.id, privateKey: node.key.private_key })
  const pushed = fb.sync.pushAnswer({ taken: [note.hash], waiting: [], refused: [{ hash: sha('a bad block'), code: 'bad_signature', detail: 'its signature opens with no key of its author' }], equivocations: [] }, { node: node.id, privateKey: node.key.private_key })
  const discovery = fb.sync.wellKnown({ node: node.id, holds: [ivy.id, jon.id], speaks_for: [ivy.id], admission: null, endpoints: { pull: 'https://node.example/pull', push: 'https://node.example/push', challenge: 'https://node.example/challenge' } })
  assert.deepEqual(fb.sync.wellKnownErrors(discovery), [])
  Object.assign(V.messages, {
    signed_pull: { message: pull, signer: 'jem', highest: 4 },
    signed_pull_challenge: { message: pullC, signer: 'jem', challenge },
    signed_push: { message: push, signer: 'ivo', highest: 0 },
    pull_answer: { message: answer, matches: answer.blocks.length }, push_answer: { message: pushed }, discovery, announcement: fb.sync.announcement(discovery),
    push: { name: 'a push names, for each sealed copy, the list of ids it is for', request: fb.sync.pushRequest([message2], { [note2.hash]: [rae.id, sol.id].sort() }), hash: note2.hash, recipients: [rae.id, sol.id].sort() }
  })
  assert.deepEqual(V.messages.push.request.for[note2.hash], V.messages.push.recipients)
  // A pull filter by marks (profiles/addressing.md): the contacts and claims for an address.
  const c = s.say(ivy, 'a contact marked by a phone number', 'actor', { kind: 'contact', name: 'Joseph', marks: [{ scheme: 'tel', value: '+254700000000' }] })
  door('a pull filter by marks matches the exact mark', 'matches', [c, { marks: { scheme: 'tel', value: '+254700000000' } }, []], { expect: true })
  door('a pull filter by marks refuses another value', 'matches', [c, { marks: { scheme: 'tel', value: '+254700000001' } }, []], { expect: false })
  door('the filters AND together', 'matches', [c, { type: 'actor', kind: 'contact', marks: { scheme: 'tel', value: '+254700000000' }, author: ivy.id }, []], { expect: true })
  // The node's signed answer covers the whole answer; a changed one no longer verifies.
  assert.ok(fb.sync.answerSignedBy(answer, node.key.public_key_sign) && !fb.sync.answerSignedBy({ ...pushed, taken: [] }, node.key.public_key_sign))
  V.envelopes = []
  const signedNote = note
  const env = fb.seal(fb.wrap(signedNote), [jon.key.public_key_encrypt], { fixed: fixedFor('envelope', 1) })
  assert.equal(env.alg, fb.ALG)
  V.envelopes.push({ name: 'a message sealed to one recipient (x25519-hkdf-sha256-aes-256-gcm)', recipient: 'jem', envelope: env, opens_to: { hash: signedNote.hash, signature: signedNote.signature, version: '1.6' } })
}
messages()

// ---- The compact form (CBOR), key table 1 ----
// A deliberately small CBOR writer, independent of the core, to build the malformed inputs a reader must refuse.
const cbor = (() => {
  const head = (major, n) => n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : n < 65536 ? [major << 5 | 25, n >> 8, n & 255] : [major << 5 | 26, ...[24, 16, 8, 0].map((sh) => (n >>> sh) & 255)]
  const text = (t) => { const b = [...Buffer.from(t, 'utf8')]; return [...head(3, b.length), ...b] }
  const bytes = (b) => [...head(2, b.length), ...b]
  const uint = (n) => head(0, n)
  const map = (pairs) => [...head(5, pairs.length), ...pairs.flat(2)]
  const array = (items) => [...head(4, items.length), ...items.flat()]
  return { head, text, bytes, uint, map, array, hex: (a) => Buffer.from(a).toString('hex') }
})()

// ---- The compact form (CBOR): block <-> bytes, the sizes, the loose encodings a reader accepts, and what it refuses ----
function cborVectors(vectors, s, { reading, moved, dev }) {
  const sig = (b) => b.signature
  const find = (list, name) => list.find((b) => b.name.startsWith(name))
  const veg = find(vectors.folds.promises.flatMap((v) => v.blocks), 'a weekly veg box')
  const rotation = vectors.identities.flatMap((v) => v.blocks).find((b) => b.block.state.counted_to)
  const genesisBlock = s.byName('tal: genesis')
  const entries = [[`a micro observe with no at, three refs`, reading.hash, reading.signer || 'tal', reading], ['a genesis: keys, the recovery hash', genesisBlock.hash, 'tal', genesisBlock], ['a micro transfer with no at', moved.hash, 'tal', moved],
    ['a promise: money, times as milliseconds, a standing when', veg.hash, veg.signer, veg], ['a key grant: the rotated key, counted_to as bytes', rotation.hash, rotation.signer, rotation]]
  const cases = entries.map(([name, hash, signer, b]) => {
    const block = b.block || { type: b.type, state: b.state, refs: b.refs }
    const signed = { hash, ...block, signature: b.signature }
    const text = fb.cbor.encode(signed), short = fb.cbor.encode(signed, { short: true })
    for (const bytes of [text, short]) { const back = fb.cbor.decode(bytes); assert.deepEqual(back, signed); assert.equal(fb.hash(back.type, back.state, back.refs), hash) }
    assert.deepEqual(Buffer.from(fb.cbor.encode(signed)), Buffer.from(text), 'writing is deterministic')
    return { name, signer, block, signature: b.signature, hash, canonical_bytes: Buffer.byteLength(fb.canonical(block.type, block.state, block.refs)), cbor: Buffer.from(text).toString('hex'), cbor_short: Buffer.from(short).toString('hex') }
  })
  const members = [reading, moved].map((b) => ({ hash: b.hash, type: b.type, state: b.state, refs: b.refs, signature: b.signature }))
  const push = { name: 'a push of two messages', hashes: members.map((b) => b.hash), cbor: Buffer.from(fb.cbor.encodePush(members)).toString('hex'), cbor_short: Buffer.from(fb.cbor.encodePush(members, { short: true })).toString('hex') }
  assert.deepEqual(fb.cbor.decodePush(fb.cbor.encodePush(members, { short: true })), members)
  const header = { author: dev.id, seq: reading.state.seq, prev: reading.refs.prev, hash: reading.hash }
  const headers = [{ name: 'a chain header', header, cbor: Buffer.from(fb.cbor.encodeHeader(header)).toString('hex'), cbor_short: Buffer.from(fb.cbor.encodeHeader(header, { short: true })).toString('hex') }]
  assert.deepEqual(fb.cbor.decodeHeader(fb.cbor.encodeHeader(header, { short: true })), header)

  // A reader accepts any well-formed encoding of the same content: keys out of order, integers longer than they need to be.
  const h = (hex) => [...Buffer.from(hex, 'hex')], T = cbor.text, B = cbor.bytes
  const looseReading = cbor.array([cbor.uint(0), cbor.map([[T('refs'), cbor.map([[T('subject'), B(h(reading.refs.subject))], [T('prev'), B(h(reading.refs.prev))], [T('author'), B(h(reading.refs.author))]])],
    [T('state'), cbor.map([[T('seq'), [0x19, 0, reading.state.seq]], [T('kind'), T('reading')], [T('audience'), T('public')], [T('amount'), cbor.map([[T('unit'), T('Cel')], [T('value'), T('3.9')]])]])], [T('type'), T('observe')]]), B(h(reading.signature))])
  const loose = { name: 'any well-formed encoding of the same content is accepted: keys out of order, a longer integer', cbor: cbor.hex(looseReading), hash: reading.hash }
  assert.equal(fb.cbor.decode(Uint8Array.from(looseReading)).hash, reading.hash)

  // What a reader refuses.
  const empty = (state, t = 0, extra = {}) => cbor.array([cbor.uint(t), cbor.map([[T('type'), T('observe')], [T('state'), state], [T('refs'), cbor.map([])]]), B(new Array(64).fill(1))])
  const ok = cbor.map([[T('kind'), T('note')]])
  const x = (value) => cbor.map([[T('x'), value]])
  const refused = [
    ['a float (64-bit)', empty(x([0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0]))],
    ['a float (16-bit)', empty(x([0xf9, 0x3e, 0x00]))],
    ['a tag', empty(x([0xc1, ...cbor.uint(1)]))],
    ['null', empty(x([0xf6]))],
    ['undefined', empty(x([0xf7]))],
    ['a simple value other than true and false', empty(x([0xf8, 0x20]))],
    ['an indefinite-length map', empty([0xbf, ...T('kind'), ...T('note'), 0xff])],
    ['an indefinite-length text string', empty(x([0x7f, ...T('a'), 0xff]))],
    ['an indefinite-length array', empty(x([0x9f, 0x01, 0xff]))],
    ['a duplicate key', empty(cbor.map([[T('kind'), T('note')], [T('kind'), T('note')]]))],
    ['a duplicate key, once as text and once as its table position (short keys)', cbor.array([cbor.uint(1), cbor.map([[cbor.uint(0), cbor.uint(2)], [T('type'), T('observe')], [cbor.uint(1), ok], [cbor.uint(2), cbor.map([])]]), B(new Array(64).fill(1))])],
    ['an integer above 2^53 - 1', empty(x([0x1b, 0, 0x20, 0, 0, 0, 0, 0, 0]))],
    ['an integer below -(2^53 - 1)', empty(x([0x3b, 0, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))],
    ['a byte string where the protocol has none', empty(x(B([1, 2, 3])))],
    ['a hash that is not 32 bytes', cbor.array([cbor.uint(0), cbor.map([[T('type'), T('observe')], [T('state'), ok], [T('refs'), cbor.map([[T('subject'), B(new Array(31).fill(2))]])]]), B(new Array(64).fill(1))])],
    ['a key position outside the table', cbor.array([cbor.uint(1), cbor.map([[cbor.uint(0), cbor.uint(2)], [cbor.uint(1), cbor.map([[cbor.uint(9999), cbor.uint(1)]])], [cbor.uint(2), cbor.map([])]]), B(new Array(64).fill(1))])],
    ['a key table the reader does not have (t = 2)', empty(ok, 2)],
    ['a signature that is not 64 bytes', cbor.array([cbor.uint(0), cbor.map([[T('type'), T('observe')], [T('state'), ok], [T('refs'), cbor.map([])]]), B(new Array(63).fill(1))])],
    ['bytes after the message', [...empty(ok), 0x00]],
    ['a message that stops short', empty(ok).slice(0, -3)]
  ].map(([name, bytes]) => ({ name, cbor: cbor.hex(bytes) }))
  for (const r of refused) assert.throws(() => fb.cbor.decode(Uint8Array.from(Buffer.from(r.cbor, 'hex'))), undefined, r.name)
  vectors.cbor = { $comment: 'The compact form (spec/modules/encoding.md): a public block as CBOR, key table 1 (protocol.json cbor.table). `cbor` writes text keys, `cbor_short` the key table (t = 1); each decodes back to the block, whose id is the hash of its canonical JSON. `loose` is another well-formed encoding of the first case, accepted. `refused` are inputs a reader must refuse.', cases, push, headers, loose, refused }
}

{
  const s = story(), dev = s.person('tal', { kind: 'machine' })
  const eggs = s.say(dev, 'tal: the kind eggs', 'thing', { kind: 'eggs' })
  const reading = s.say(dev, 'a micro reading with no clock: an observe may leave out at', 'observe', { kind: 'reading', amount: A('3.9', 'Cel') }, { subject: dev.id }, { clockless: true })
  const make = s.say(dev, 'a micro transform with no clock', 'transform', { kind: 'make' }, { derives_from: [eggs.hash] }, { clockless: true })
  const moved = s.say(dev, 'a micro transfer with no clock', 'transfer', {}, { to_owner: dev.id, what: eggs.hash }, { clockless: true })
  for (const b of [reading, make, moved]) assert.equal(b.state.at, undefined)
  for (const b of [reading, make, moved]) assert.deepEqual(fb.refusals(b.type, b.state, b.refs), [])
  V.refusals.blocks.push(...blocksOf(s))
  cborVectors(V, s, { reading, moved, dev })
}

// ======================================================================================================================
// The door: one case per rule (an op of the Rust core, its arguments, what it must give). The oracle runs these too.
// ======================================================================================================================
function doorVectors() {
  const bytesHex = (u8) => Buffer.from(u8).toString('hex')
  // ---- Suites: p256 and sm beside std ----
  for (const suite of ['p256', 'sm']) {
    const s = story(), who = s.person(`suite_${suite}`, { suite }), other = s.person(`suite_${suite}_b`, { suite })
    const key = who.key
    assert.equal(fb.suiteOfKey(key.public_key_sign), suite)
    door(`${suite}: a key from a seed (SPKI, then the point)`, 'keypair', [key.seed, suite], { expect: { public_key_sign: key.public_key_sign, private_key: key.private_key, suite } })
    const block = { type: 'thing', state: { kind: 'eggs', name: 'Eggs' }, refs: {} }
    const signature = door(`${suite}: a signature over the canonical bytes`, 'sign', [block, key.private_key, suite])
    door(`${suite}: the signature opens`, 'verify', [block, signature, key.public_key_sign], { expect: true })
    door(`${suite}: another block does not open it`, 'verify', [{ ...block, state: { kind: 'milk' } }, signature, key.public_key_sign], { expect: false })
    door(`${suite}: another key does not open it`, 'verify', [block, signature, other.key.public_key_sign], { expect: false })
    const id = door(`${suite}: the id is the hash of the canonical bytes in the suite's hash`, 'hash', ['thing', block.state, block.refs, suite])
    if (suite === 'sm') assert.ok(/^sm3:[0-9a-f]{64}$/.test(id)); else assert.equal(id, fb.hash('thing', block.state, block.refs))
    assert.equal(who.g.hash, id === undefined ? undefined : who.g.hash)
    door(`${suite}: the genesis is valid, its id hashed in the suite`, 'valid', [who.g, []], { codes: [] })
    assert.equal(who.g.hash.startsWith('sm3:'), suite === 'sm')
    const note = s.say(who, `${suite}: a first block`, 'observe', { kind: 'note', text: 'hello' })
    door(`${suite}: a block of the chain is valid against the genesis`, 'valid', [note, [who.g]], { codes: [] })
    door(`${suite}: a changed block is not`, 'valid', [{ ...note, state: { ...note.state, text: 'bye' }, hash: undefined }, [who.g]], { codes: ['bad_signature'] })
    door(`${suite}: another identity's key does not open it`, 'valid', [{ ...note, signature: fb.sign(note, other.key.private_key, suite) }, [who.g]], { codes: ['bad_signature'] })
    door(`${suite}: the key's hash for a recovery key is in the identity's suite`, 'recovery_key_hash', [key.public_key_sign, suite])
    door(`${suite}: a commitment is hashed in the suite`, 'salted_hash', [sha('s').slice(0, 32), 'value', suite])
    // The wire: a message names the suite when it is not std; the reader hashes with it.
    const message = door(`${suite}: a public block as a message names its suite`, 'wrap', [note], { expect: { suite, version: '1.6' } })
    door(`${suite}: unwrapping rebuilds the id in the message's suite`, 'unwrap', [message], { expect: { hash: note.hash, suite } })
    door(`${suite}: a message naming a suite this reader does not know`, 'unwrap', [{ ...message, suite: 'ml-dsa' }], { error: { kind: 'crypto', code: 'unknown_suite' } })
    // The envelope: the suite's key agreement and cipher.
    const fixed = fixedFor(`${suite} envelope`, 1)
    const env = door(`${suite}: an envelope sealed with fixed randomness`, 'seal', [{ hello: 'world' }, [key.public_key_encrypt], suite, fixed], { expect: { alg: PROTOCOL.suites[suite].envelope } })
    door(`${suite}: it opens with the recipient's private key`, 'open', [env, key.x25519_private], { expect: { hello: 'world' } })
    door(`${suite}: it does not open with another key`, 'open', [env, other.key.x25519_private], { error: { kind: 'crypto' } })
    // The compact form carries the suite after the signature.
    const cbor = door(`${suite}: a block as CBOR names its suite after the signature`, 'cbor_encode', [note, true])
    door(`${suite}: and decodes to the same block`, 'cbor_decode', [cbor], { expect: { hash: note.hash, suite } })
  }
  door('an unknown suite cannot make a key', 'keypair', [sha('x'), 'ml-dsa'], { error: { kind: 'crypto', code: 'unknown_suite' } })
  door('std keys are the default suite', 'suite_of_key', [keyOf('ann').public_key_sign], { expect: 'std' })
  {
    // A key grant moves an identity to a new suite: the key names its suite; blocks it signs hash with the new hash.
    const s = story(), p = s.person('mover'), fresh = keyOf('mover_sm', 'sm')
    const last = s.say(p, 'the last block in std', 'observe', { kind: 'note', text: 'before' })
    const move = s.keep('a key grant that replaces the key and names the suite sm', keyGrant(p.id, fresh.public_key_sign, { private_key: p.key.private_key, last }, { replaces: p.key.public_key_sign, countedTo: last.hash, suite: 'sm', at: at() }), 'mover')
    assert.equal(move.state.suite, 'sm')
    const after = fb.write('observe', { kind: 'note', text: 'after' }, {}, { author: p.id, key: fresh, held: s.held, at: at(), link: { seq: 1, prev: move.hash } })
    assert.ok(after.hash.startsWith('sm3:'))
    door('moving to a new suite: a key grant that names it; the new key\'s blocks hash with sm3', 'valid', [after, s.held], { codes: [] })
    door('the identity fold lists the new key in its suite', 'key_timeline', [p.id, [...s.held, after], null], { expect: [{ suite: 'std' }, { suite: 'sm', key: fresh.public_key_sign }] })
  }

  // ---- Strict writing from the bytes ----
  {
    const a = keyOf('ann'), id = L.held[0].hash
    const text = (stateExtra) => `{"refs":{"author":"${id}","prev":"${id}"},"state":{"at":"2026-10-15T12:00:00.000Z","audience":"public","seq":1${stateExtra}},"type":"observe"}`
    door('strict text: a clean block has no refusal', 'strict_text', [text('')], { codes: [] })
    door('strict text: a repeated key at any depth', 'strict_text', [`{"refs":{},"state":{"a":{"b":1,"b":2}},"type":"observe"}`], { codes: ['not_canonical'] })
    door('strict text: 1.0 is a float, even though it is whole', 'strict_text', [text(',"x":1.0')], { codes: ['float'] })
    door('strict text: an exponent is a float', 'strict_text', [text(',"x":1e21')], { codes: ['float'] })
    door('strict text: -0 is refused', 'strict_text', [text(',"x":-0')], { codes: ['integer_range'] })
    door('strict text: an integer past 2^53 - 1', 'strict_text', [text(',"x":9007199254740992')], { codes: ['integer_range'] })
    door('strict text: a null', 'strict_text', [text(',"x":null')], { codes: ['not_canonical'] })
    void a
  }

  // ---- The chain: skip blocks, gaps, forks ----
  {
    const s = story(), p = s.person('chainy')
    const n1 = s.say(p, 'one', 'observe', { kind: 'note', text: '1' }), n2 = s.say(p, 'two', 'observe', { kind: 'note', text: '2' })
    const sk = s.say(p, 'a skip: the counter was lost, jumping to seq 9', 'observe', { kind: 'note', text: 'skip' }, {}, { link: { seq: 9, prev: n2.hash }, skip: true })
    const n10 = s.say(p, 'ten', 'observe', { kind: 'note', text: '10' })
    const mine = s.held.filter((b) => b.refs.author === p.id)
    door('the chain fold: a skip block explains the gap before it', 'check_chain', [mine, p.id], { expect: { gaps: [], skips: [sk.hash], equivocations: [], broken: [], ok: true, length: 4, head: n10.hash } })
    door('a skip block is valid', 'valid', [sk, s.held.filter((b) => b !== sk && b !== n10)], { codes: [] })
    const noskip = fb.write('observe', { kind: 'note', text: 'a jump with no skip mark' }, {}, { author: p.id, key: keyOf('chainy'), held: s.held, at: at(), link: { seq: 20, prev: n10.hash } })
    door('a jump of seq without the skip mark is a chain error', 'valid', [noskip, s.held], { codes: ['chain'] })
    door('and the chain fold lists the numbers missing', 'check_chain', [[...mine, noskip], p.id], { expect: { gaps: Array.from({ length: 9 }, (_, i) => i + 11), ok: false } })
    door('next_link: one more than the last, naming it', 'next_link', [n10, p.id], { expect: { seq: n10.state.seq + 1, prev: n10.hash } })
    door('next_link for a key with no blocks: seq 1, naming the block that brought it in', 'next_link', [null, p.id], { expect: { seq: 1, prev: p.id } })
    // Equivocation is two blocks of one key with the same prev, whatever their seq.
    const fork = fb.write('observe', { kind: 'note', text: 'a second block naming the same prev as n2' }, {}, { author: p.id, key: keyOf('chainy'), held: s.held, at: at(), link: { seq: 99, prev: n1.hash }, skip: true })
    door('equivocation is two blocks of one key naming one prev, whatever their seq', 'fork_pairs', [[...s.held, fork]], { expect: [[n2.hash, fork.hash].sort()], exact: true })
  }

  // ---- Relative time (promises.md): a step due `wait` after a block arrives on the performer's node ----
  {
    const s = story(), p = s.person('plan'), q = s.person('plan_q')
    const anchor = s.say(q, 'the anchor: the delivery', 'observe', { kind: 'delivery', text: 'arrived' })
    const step = s.say(p, 'a step due 30 minutes after the delivery arrives', 'promise', { what: 'wash the crates', when: { after: anchor.hash, wait: 'PT30M' }, terms: { expires: DAY } }, { from: p.id, to: p.id })
    door('a relative when is valid', 'valid', [step, s.held.filter((b) => b !== step)], { codes: [] })
    door('due: wait after the anchor arrived on the performer\'s node', 'due', [step, { [anchor.hash]: '2026-10-16T10:00:00.000Z' }], { expect: '2026-10-16T10:30:00.000Z' })
    door('due: null while the anchor has not arrived', 'due', [step, {}], { expect: null })
    const bad = { type: 'promise', state: { ...step.state, when: { after: anchor.hash, wait: 'half an hour' } }, refs: step.refs }
    door('a relative when needs a duration', 'refusals', [bad.type, bad.state, bad.refs, [], null], { codes: ['time'] })
    const view = (now) => door(`promise_view: ${now}`, 'promise_view', [step, s.held, { now }], { expect: {} })
    void view
  }

  // ---- Views ----
  {
    const s = story(), ann = s.person('viewa'), bob = s.person('viewb')
    const eggs = s.say(ann, 'eggs', 'thing', { kind: 'eggs' })
    const offer = s.say(ann, 'an offer expiring on the 20th', 'promise', { terms: { price: M(450), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
    door('promise_view: expired once the reader\'s clock passes expires and nothing binds', 'promise_view', [offer, s.held, { now: '2026-10-21T00:00:00.000Z' }], { expect: { stage: 'expired' } })
    door('promise_view: before expires it is offered', 'promise_view', [offer, s.held, { now: '2026-10-19T00:00:00.000Z' }], { expect: { stage: 'offered' } })
    door('promise_stage: the fold itself reads no clock', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'offered' } })
    s.say(bob, 'accepted', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    door('promise_view: an accepted promise is never expired', 'promise_view', [offer, s.held, { now: '2026-10-21T00:00:00.000Z' }], { expect: { stage: 'accepted' } })
    const grant1 = { state: { scope: { until: '2026-12-31T00:00:00.000Z' } } }, grant2 = { state: { scope: { until: '2026-11-01T00:00:00.000Z' } } }
    door('live_grant: every grant\'s scope.until is later than the relying node\'s clock', 'live_grant', [{}, [grant1, grant2], '2026-10-31T00:00:00.000Z'], { expect: true })
    door('live_grant: one grant that has ended', 'live_grant', [{}, [grant1, grant2], '2026-11-02T00:00:00.000Z'], { expect: false })
    const wd = s.say(ann, 'a withdrawal', 'promise', { status: 'stopped', stop: 'before' }, { updates: offer.hash, for: offer.hash })
    const act = s.say(bob, 'a counterparty block', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
    door('withdrawal_seen: neither in the causal past nor arrived on its node', 'withdrawal_seen', [wd, act, s.held, {}], { expect: false })
    door('withdrawal_seen: arrived on the counterparty\'s node', 'withdrawal_seen', [wd, act, s.held, { [wd.hash]: '2026-10-16T00:00:00.000Z' }], { expect: true })
    const after = s.say(bob, 'a block that names the withdrawal in after', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, { after: [wd.hash] })
    door('withdrawal_seen: in the block\'s causal past', 'withdrawal_seen', [wd, after, s.held, {}], { expect: true })
  }

  // ---- Strangers: consent as a block, a live STOP, a human author, the receipt code ----
  {
    const s = story(), pat = s.person('pat'), op = s.person('shop'), bot = s.person('shop_bot', { kind: 'agent' }), friend = s.person('friend'), stranger = s.person('stranger')
    s.say(op, 'the shop answers for its agent', 'grant', { kind: 'operator' }, { to: bot.id })
    const yes = s.say(pat, 'pat says yes to the shop\'s agent', 'observe', { kind: 'consent', word: 'yes' }, { subject: bot.id })
    door('consent: a yes naming the sender', 'consent', [pat.id, bot.id, s.held], { expect: { word: 'yes', block: yes.hash } })
    door('consent: no consent block about another sender gives no word', 'consent', [pat.id, friend.id, s.held], { expect: { word: null, block: null } })
    const stop = s.say(pat, 'pat says STOP to the shop (its operator): every agent under it', 'observe', { kind: 'consent', word: 'stop' }, { subject: op.id })
    door('consent: a STOP naming the operator covers its agents, later than the yes', 'consent', [pat.id, bot.id, s.held], { expect: { word: 'stop', block: stop.hash } })
    const all = s.say(pat, 'pat says keep to everyone with no live word', 'observe', { kind: 'consent', word: 'keep' })
    door('consent: left out, a word is about every sender who has no live word', 'consent', [pat.id, stranger.id, s.held], { expect: { word: 'keep', block: all.hash } })
    door('consent: the named word beats the one about everyone', 'consent', [pat.id, friend.id, s.held], { expect: { word: 'keep', block: all.hash } })
    // A tie: two devices say yes and stop without seeing each other. A stop wins.
    const phone = keyOf('pat_phone')
    s.keep('pat adds a phone', keyGrant(pat.id, phone.public_key_sign, { private_key: pat.key.private_key, last: null, broughtIn: pat.id }, { at: at() }), 'pat')
    const t = story(), a = t.person('tie'), bphone = keyOf('tie_phone'), who = t.person('tie_sender')
    t.keep('tie adds a phone', keyGrant(a.id, bphone.public_key_sign, { private_key: a.key.private_key, last: null, broughtIn: a.id }, { at: at() }), 'tie')
    const y = t.say(a, 'yes, on the laptop', 'observe', { kind: 'consent', word: 'yes' }, { subject: who.id })
    const n = t.say(a, 'stop, on the phone, not seeing the yes', 'observe', { kind: 'consent', word: 'stop' }, { subject: who.id }, { key: 'tie_phone', link: { seq: 1, prev: t.held.find((b) => b.state.kind === 'key').hash } })
    door('consent: a stop wins a tie between devices that do not see each other', 'consent', [a.id, who.id, t.held], { expect: { word: 'stop', block: n.hash } })
    void y
    // Two devices say different words (yes and keep) without seeing each other: no live word. Two that agree: the word stands.
    {
      const u = story(), ua = u.person('tie2'), uphone = keyOf('tie2_phone'), usender = u.person('tie2_sender')
      u.keep('tie2 adds a phone', keyGrant(ua.id, uphone.public_key_sign, { private_key: ua.key.private_key, last: null, broughtIn: ua.id }, { at: at() }), 'tie2')
      const uy = u.say(ua, 'yes, on the laptop', 'observe', { kind: 'consent', word: 'yes' }, { subject: usender.id })
      const uk = u.say(ua, 'keep, on the phone, not seeing the yes', 'observe', { kind: 'consent', word: 'keep' }, { subject: usender.id }, { key: 'tie2_phone', link: { seq: 1, prev: u.held.find((x) => x.state.kind === 'key').hash } })
      door('consent: a tie between other words leaves no live word', 'consent', [ua.id, usender.id, u.held], { expect: { word: null, block: null } })
      const uy2 = u.say(ua, 'yes again, on the phone, not seeing the first', 'observe', { kind: 'consent', word: 'yes' }, { subject: usender.id }, { key: 'tie2_phone', link: { seq: 2, prev: uk.hash } })
      door('consent: a tie of the same word stands and names the lowest hash', 'consent', [ua.id, usender.id, u.held], { expect: { word: 'yes', block: [uy.hash, uy2.hash].sort()[0] } })
    }
    {
      // A person off FoodX: a contact with no keys. Whoever received her STOP records it, and it binds the recorder's own side only.
      const o = story(), gate = o.person('gateway'), shop = o.person('shop2'), app = o.person('shop2_app', { kind: 'agent' }), other = o.person('other_shop'), gate2 = o.person('gateway2')
      o.say(shop, 'the shop answers for its app', 'grant', { kind: 'operator' }, { to: app.id })
      const contact = o.say(gate, 'a contact: a phone number, no keys', 'actor', { kind: 'contact', marks: [{ scheme: 'phone', value: '+447700900123' }] })
      door('consent: a person with no keys and no word has none', 'consent', [contact.hash, app.id, o.held], { expect: { word: null, block: null } })
      const gateStop = o.say(gate, 'the gateway received her STOP and records it against its own sending', 'observe', { kind: 'consent', word: 'stop' }, { from: contact.hash, subject: gate.id, derives_from: sha('STOP, as received') })
      door('consent: a recorded STOP binds the recorder\'s own side', 'consent', [contact.hash, gate.id, o.held], { expect: { word: 'stop', block: gateStop.hash } })
      door('consent: a STOP recorded by someone else does not bind another sender', 'consent', [contact.hash, app.id, o.held], { expect: { word: null, block: null } })
      const appStop = o.say(shop, 'the shop (the asker) sees her reply and records the STOP against its own sending', 'observe', { kind: 'consent', word: 'stop' }, { from: contact.hash, subject: shop.id, derives_from: sha('stop, in her words') })
      door('consent: the asker may record a STOP for itself: it covers its agents', 'consent', [contact.hash, app.id, o.held], { expect: { word: 'stop', block: appStop.hash } })
      o.say(app, 'the asker\'s app records a yes from her', 'observe', { kind: 'consent', word: 'yes' }, { from: contact.hash, subject: app.id, derives_from: sha('a reply the app read') }, { after: [appStop.hash] })
      door('consent: the asker\'s side never lifts a STOP', 'consent', [contact.hash, app.id, o.held], { expect: { word: 'stop', block: appStop.hash } })
      const lift = o.say(gate, 'her own fresh yes, received by a recorder the asker does not control, with the stop in its past', 'observe', { kind: 'consent', word: 'yes' }, { from: contact.hash, subject: app.id, derives_from: sha('YES, as received') }, { after: [appStop.hash] })
      door('consent: her fresh yes through a recorder outside the asker\'s side lifts it', 'consent', [contact.hash, app.id, o.held], { expect: { word: 'yes', block: lift.hash } })
      o.say(gate2, 'a yes from a recorder that never saw a stop', 'observe', { kind: 'consent', word: 'yes' }, { from: contact.hash, subject: other.id })
      door('consent: a recorder\'s yes that has no stop in its causal past counts for nothing', 'consent', [contact.hash, other.id, o.held], { expect: { word: null, block: null } })
    }
    // Admission, a human author, STOP.
    const lonely = story(), lp = lonely.person('lp'), lbot = lonely.person('lp_bot', { kind: 'agent' }), lme = lonely.person('lp_me')
    const agentFirst = lonely.say(lbot, 'an agent\'s first block to a stranger', 'observe', { kind: 'offer', text: 'buy our bread' }, { subject: lme.id })
    door('not_human: a first block to a stranger that an agent signed', 'admission_refusals', [agentFirst, lme.id, lonely.held, { parties: [] }, 0], { codes: ['not_human'] })
    const orderFirst = lonely.say(lbot, 'an order, an act the receiver\'s order channel lists', 'promise', { kind: 'order', what: 'bread', terms: { expires: DAY } }, { from: lme.id, to: lbot.id })
    door('not_human: the receiver\'s published order channel lets an agent send those acts first', 'admission_refusals', [orderFirst, lme.id, lonely.held, { order_channel: ['promise.order'] }, 0], { codes: [] })
    door('not_human: an act outside the order channel is still refused', 'admission_refusals', [agentFirst, lme.id, lonely.held, { order_channel: ['promise.order'] }, 0], { codes: ['not_human'] })
    const human = lonely.say(lp, 'a person\'s first block to a stranger', 'observe', { kind: 'offer', text: 'buy my bread' }, { subject: lme.id })
    door('a person may write first to a stranger', 'admission_refusals', [human, lme.id, lonely.held, { parties: [] }, 0], { codes: [] })
    door('not_admitted: the node took its per_stranger blocks for the day', 'admission_refusals', [human, lme.id, lonely.held, { parties: [], per_stranger: 3 }, 3], { codes: ['not_admitted'] })
    door('a listed party is always admitted', 'admission_refusals', [human, lme.id, lonely.held, { parties: [lp.id], per_stranger: 0 }, 9], { codes: [] })
    const noone = lonely.say(lme, 'lp_me says STOP to the sender', 'observe', { kind: 'consent', word: 'stop' }, { subject: lp.id })
    door('a block sent despite a live STOP is not refused: it is valid and kept, and the fold reads it as stopped', 'admission_refusals', [human, lme.id, lonely.held, { parties: [] }, 0], { codes: [] })
    door('consent: the same STOP is the live word the fold reads', 'consent', [lme.id, lp.id, lonely.held, null], { expect: { word: 'stop', block: noone.hash } })
    const after = lonely.say(lp, 'the sender\'s next block, chained on the one sent despite the STOP: not stalled', 'observe', { kind: 'note', text: 'second' }, { subject: lme.id })
    door('a stopped sender\'s chain goes on: the next block is judged on its own and what it rests on', 'admission_refusals', [after, lme.id, lonely.held, { parties: [] }, 0], { codes: [] })
  }
  {
    // The receipt code: the first 5 bytes (40 bits) of the id, in Crockford Base32, XXXX-XXXX.
    const crockford = (hex, long = false) => {
      const A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
      const n = long ? 10 : 8
      let bits = ''
      for (const byte of Buffer.from(hex.slice(0, 14), 'hex')) bits += byte.toString(2).padStart(8, '0')
      const chars = bits.slice(0, n * 5).match(/.{5}/g).map((b) => A32[parseInt(b, 2)]).join('')
      return `${chars.slice(0, n / 2)}-${chars.slice(n / 2)}`
    }
    for (const id of [L.held[0].hash, sha('a deal'), '00' .repeat(32), 'ff'.repeat(32)]) door(`receipt code of ${id.slice(0, 10)}`, 'receipt_code', [id], { expect: crockford(id) })
    door('the receipt code of a prefixed id uses the hash bytes', 'receipt_code', [`sm3:${sha('x')}`], { expect: crockford(sha('x')) })
    assert.ok(PROTOCOL_GRAMMAR_RECEIPT.test(crockford(sha('a deal'))))
    // The long form (a custodian whose index holds two blocks with one short code): the first 50 bits, XXXXX-XXXXX.
    for (const id of [sha('a deal'), 'ff'.repeat(32)]) door(`long receipt code of ${id.slice(0, 10)}`, 'receipt_code', [id, true], { expect: crockford(id, true) })
    assert.ok(new RegExp(PROTOCOL.grammar.receipt_code_long).test(crockford(sha('a deal'), true)))
    // A typed code names a block the way a person types it: case, spaces and hyphens do not matter; O is 0, I and L are 1; only 8 or 10 characters match.
    const deal = sha('a deal'), shortCode = crockford(deal), longCode = crockford(deal, true)
    door('a typed code: exactly as shown', 'code_matches', [shortCode, deal], { expect: true })
    door('a typed code: lower case', 'code_matches', [shortCode.toLowerCase(), deal], { expect: true })
    door('a typed code: spaces for the hyphen, and around', 'code_matches', [` ${shortCode.replace('-', ' ')} `, deal], { expect: true })
    door('a typed code: no hyphen at all', 'code_matches', [shortCode.replace('-', ''), deal], { expect: true })
    door('a typed code: the long form', 'code_matches', [longCode, deal], { expect: true })
    door('a typed code: another block\'s code', 'code_matches', [shortCode, sha('another deal')], { expect: false })
    door('a typed code: seven characters match nothing', 'code_matches', [shortCode.slice(0, 8), deal], { expect: false })
    door('a typed code: nine characters match nothing', 'code_matches', [shortCode + 'A', deal], { expect: false })
    door('a typed code: a prefixed id uses the hash bytes', 'code_matches', [shortCode, `sm3:${deal}`], { expect: true })
    const zeros = '00'.repeat(32)
    door('a typed code: O is read as zero', 'code_matches', ['OOOO-OOOO', zeros], { expect: true })
    door('a typed code: I and L are read as one', 'code_matches', ['IL11-lI1i', '0842108421'.padEnd(64, '0')], { expect: true })
  }

  // ---- Profiles ----
  {
    const s = story(), me = s.person('res')
    const stays = s.say(me, 'a block that stays in the EU', 'observe', { kind: 'note', text: 'x', stays_in: ['EU'] })
    door('residency: a node that holds in the EU takes a block that stays in the EU', 'residency_refusals', [stays, ['EU']], { codes: [] })
    door('residency: a node that holds elsewhere refuses it', 'residency_refusals', [stays, ['US']], { codes: ['residency'] })
    door('residency: a block with no stays_in goes anywhere', 'residency_refusals', [s.held[0], ['US']], { codes: [] })
    door('earnest: an admission earnest is { money, holder }', 'earnest_shape_ok', [{ money: M(100), holder: me.id }], { expect: true })
    door('earnest: without the holder it is not', 'earnest_shape_ok', [{ money: M(100) }], { expect: false })
    const ask = s.say(me, 'an ask that needs earnest', 'promise', { what: 'a table for six', terms: { expires: DAY } }, { to: me.id })
    const dep = s.say(me, 'the earnest paid to the holder', 'transfer', { money: M(100) }, { to_owner: s.held[0].hash, for: ask.hash })
    door('earnest: a transfer for the ask of at least the earnest to the holder pays it', 'earnest_paid', [ask, { money: M(100), holder: s.held[0].hash }, s.held], { expect: true })
    door('earnest: not enough', 'earnest_paid', [ask, { money: M(200), holder: s.held[0].hash }, s.held], { expect: false })
    void dep
    // A model's reading is not a person's observation until the person confirms it.
    const agent = s.person('reader', { kind: 'agent' })
    const reading = s.say(agent, 'a model\'s reading of a receipt', 'observe', { kind: 'reading', text: 'milk 1.20', method: 'ocr' }, { derives_from: sha('the receipt photo') })
    door('a reading is the agent\'s claim, not the person\'s', 'reading_is_persons_claim', [reading, me.id, s.held], { expect: false })
    s.say(me, 'the person confirms it privately', 'observe', { kind: 'confirm', confidence: '1' }, { confirms: reading.hash })
    door('a private confirms is not her claim', 'reading_is_persons_claim', [reading, me.id, s.held], { expect: false })
    const friend = s.person('reading_friend')
    s.say(friend, 'someone else shares the reading', 'observe', { kind: 'note', text: 'look at this' }, { to: me.id, derives_from: reading.hash })
    door('sharing a reading claims nothing', 'reading_is_persons_claim', [reading, me.id, s.held], { expect: false })
    s.say(me, 'she keeps it for herself, naming no one else', 'observe', { kind: 'note', text: 'milk 1.20' }, { derives_from: reading.hash })
    door('a block that names no one else is not putting the fact to someone', 'reading_is_persons_claim', [reading, me.id, s.held], { expect: false })
    s.say(me, 'she puts the fact to someone else in her own step', 'observe', { kind: 'note', text: 'I paid 1.20 for milk' }, { to: friend.id, derives_from: reading.hash })
    door('it becomes the person\'s claim when she puts that fact to someone else in her own step', 'reading_is_persons_claim', [reading, me.id, s.held], { expect: true })
    const imported = s.say(agent, 'an import: a record brought back from a platform', 'observe', { kind: 'reading', text: 'platform export', method: 'import' }, { derives_from: sha('the export file') })
    door('an import is a reading: the agent\'s claim until she puts it to someone', 'reading_is_persons_claim', [imported, me.id, s.held], { expect: false })
    // Tasks: a sensor condition is checked against the readings an operator or the sensor signed: make-vectors-refine.cjs (rule 8).
  }

  // ---- Tasks (profiles/tasks.md): a task is a promise; skills are standing open offers; progress is an observe ----
  {
    const s = story(), farm = s.person('taskfarm'), mower = s.person('taskmower', { kind: 'machine' })
    const job = s.say(farm, 'a job kind is a thing of kind schema', 'thing', { kind: 'schema', target: 'promise', name: 'job:mow', fields: { bed: 'text' } })
    const skill = s.say(mower, 'a skill: a standing open offer to mow, with its rate and a geofence in needs', 'promise', { terms: { price: { money: M(800), per: A('1', 'h') }, needs: { geofence: { lat: '51.4545', lon: '-2.5879', radius: A('2', 'km') } }, until: '2027-01-01T00:00:00.000Z', expires: DAY } }, { from: mower.id, what: job.hash })
    door('tasks: a skill is a standing open offer (from itself, to open) and is valid', 'valid', [skill, s.held.filter((b) => b !== skill)], { codes: [] })
    const plan = s.say(farm, 'the top of a plan is a promise to oneself', 'promise', { what: 'the autumn beds', terms: { expires: DAY } }, { from: farm.id, to: farm.id })
    const sub = s.say(farm, 'a sub-task names its parent in for', 'promise', { what: 'mow bed 3', when: { not_before: '2026-10-16T06:00:00.000Z', not_after: '2026-10-16T18:00:00.000Z', takes: 'PT2H' }, terms: { condition: { settled: plan.hash }, expires: DAY } }, { from: mower.id, to: farm.id, for: plan.hash, what: job.hash })
    door('tasks: a window not_before, not_after and takes in when; a dependency as a condition', 'valid', [sub, s.held.filter((b) => b !== sub)], { codes: [] })
    const progress = s.say(mower, 'progress: a change of phase', 'observe', { kind: 'progress', phase: 'cutting', fraction: '0.4' }, { for: sub.hash })
    door('tasks: a progress observe for the ask', 'valid', [progress, s.held.filter((b) => b !== progress)], { codes: [] })
    door('tasks: the plan to oneself is accepted when made', 'promise_stage', [plan, s.held, {}], { expect: { stage: 'accepted' } })
    const edgeCond = s.say(farm, 'a sensor condition as data under the schema reading_condition', 'promise', { what: 'water bed 3', terms: { condition: { reading: sha('sensor'), kind: 'moisture', op: 'lt', value: A('30', '%'), over: 'PT2H' }, expires: DAY } }, { from: mower.id, to: farm.id })
    door('tasks: a sensor condition is data the protocol does not evaluate', 'valid', [edgeCond, s.held.filter((b) => b !== edgeCond)], { codes: [] })
  }

  // ---- The one-time converter (not part of the protocol) ----
  {
    const aKey = keyOf('conv_owner')
    const g = { type: 'actor.foodie', state: { name: 'Ann', public_key_sign: aKey.public_key_sign, at: '2024-01-01T00:00:00.000Z', audience: 'public' }, refs: {} }
    const gHash = call('old_hash', g)
    const note = { type: 'observe.received', state: { text: 'two trays', at: '2024-01-02T00:00:00.000Z', weight: 1.5, gone: null, alg_sign: 'ed25519' }, refs: { author: gHash, kind: sha('eggs'), order: sha('an order') } }
    const noteHash = call('old_hash', note)
    const out = door('convert: old blocks become fresh 1.6 blocks, signed by the key given, each deriving from the old hash', 'convert', [[g, note], { keys: { [gHash]: { public_key_sign: aKey.public_key_sign, private_key: aKey.private_key } }, at: '2026-10-15T12:00:00.000Z' }], { expect: { skipped: [] }, oracle: false })
    const ids = Object.fromEntries(out.blocks.map((b) => [b.type, b]))
    assert.ok(out.blocks.length >= 3 && ids.actor && out.map[gHash] === ids.actor.hash && out.map[noteHash])
    assert.equal(out.blocks[1].state.kind, 'converted', 'a genesis has no refs: the old identity is named by the first block of the new chain')
    assert.deepEqual(out.blocks[1].refs.derives_from, [gHash])
    assert.deepEqual(codesOf(fb.valid(out.blocks[1], [out.blocks[0]])), [])
    assert.deepEqual(codesOf(fb.valid(out.blocks[2], [out.blocks[0], out.blocks[1]])), [])
    assert.ok(out.blocks[2].refs.derives_from.includes(noteHash))
    assert.equal(out.blocks[2].state.weight, '1.5', 'a float becomes a decimal string')
    assert.ok(Array.isArray(out.blocks[2].state.audience) && Array.isArray(out.blocks[1].state.audience), 'a block that named no audience is its author\'s alone, never public')
    assert.equal(out.blocks[2].state.gone, undefined, 'a null is dropped')
    const again = call('convert', [g, note], { keys: { [gHash]: { public_key_sign: aKey.public_key_sign, private_key: aKey.private_key } }, at: '2026-10-15T13:00:00.000Z', map: out.map, existing: out.blocks })
    assert.deepEqual(again.blocks, [], 'running again with the same map changes nothing')
    door('convert: an old block whose author has no key given is not converted', 'convert', [[g, note], { keys: {}, at: '2026-10-15T12:00:00.000Z' }], { expect: { blocks: [] }, oracle: false })
  }
}
const { PROTOCOL } = fb
const PROTOCOL_GRAMMAR_RECEIPT = new RegExp(PROTOCOL.grammar.receipt_code)
doorVectors()

// ---- Write the file ----
const ordered = {
  $comment: 'FoodBlock conformance vectors (spec/protocol.md, Conformance). Built by the reference SDK (sdk/javascript/test/make-vectors.cjs) from fixed seeds and times, every expectation written by hand and checked against the Rust core before this file is written; spec/run-vectors.cjs checks every section, and the oracle (spec/oracle), written from the spec text alone, checks it again. Test keys come from fixed seeds: never use them for anything real. A `seed` is the Ed25519 seed (std) or the private scalar d, 32 bytes big-endian (p256, sm); core.md section 2 gives the public key, and fixes the signature nonce (RFC 6979), so every signature here can be reproduced byte for byte. Placeholder ids are sha256 of a label. A block in a story is { name, hash, signer, block: { type, state, refs }, signature } (and suite when it is not std); `signer` names a key in `keys`. Sections: keys; canonical; hashes (one block of every type) and ledger (its genesis blocks); audience; signatures; bad_signatures; envelopes; sealed; headers; identities; deals; circles; folds (promises, circles, audience, things, successors, rekeys, ballots); refusals (each case with the codes from protocol.json refusals.codes: by check, valid, accept, fold, may_act_as, under, open); messages; cbor (key table 1); door (an op of the core, its arguments, and what it gives: `expect` is a subset match, `codes` the refusal codes, `error` a failure; a case with oracle false is outside the spec text).',
  keys: V.keys, canonical: V.canonical, hashes: V.hashes, ledger: V.ledger, audience: V.audience, signatures: V.signatures, bad_signatures: V.bad_signatures, envelopes: V.envelopes,
  sealed: V.sealed, headers: V.headers, identities: V.identities, deals: V.deals, circles: V.circles, folds: V.folds, refusals: V.refusals, messages: V.messages, cbor: V.cbor, door: V.door
}
vectorsFile.save(ordered, INVARIANTS)
const count = (x) => Array.isArray(x) ? x.length : Object.values(x).reduce((n, y) => n + (Array.isArray(y) ? y.length : 0), 0)
console.log(`wrote ${FILE}: ${Object.entries(ordered).filter(([k]) => k !== '$comment').map(([k, v]) => `${k} ${v && typeof v === 'object' ? (k === 'refusals' ? v.cases.length : count(v)) : ''}`).join(', ')}`)
