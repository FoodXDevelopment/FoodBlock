// Adds to spec/vectors.json the cases of Phase 2 of the 1.6 refinement (CHANGELOG.md): `node test/make-vectors-phase2.cjs`.
// Idempotent: a case it made is replaced by name, never repeated. Every expectation is worked out here by hand (the Merkle
// roots by a third, plain implementation in this file) and checked against the Rust core before the file is written; the
// oracle (spec/oracle) then checks the file against an implementation written from the spec text alone. Run it after
// `node scripts/build-wasm.cjs`.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')
const { genesis } = fb.identity

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const made = new Set()
const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? b !== null && Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true))

// ---- a story: people with seeded keys, blocks written one after another ----
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name) => {
  if (keys[name]) return keys[name]
  const kp = fb.keypairFromSeed(sha(`foodblock 1.6 phase 2 vectors: ${name}`), 'std')
  keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign }
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 10, 3, 0, 0, 0) + 1000 * tick++).toISOString()
function story() {
  const held = []
  const keep = (block) => { held.push(block); return block }
  const person = (name, { kind = 'person' } = {}) => {
    const g = keep(genesis(keyOf(name), { kind, at: at() }))
    return { name, id: g.hash, g }
  }
  const say = (who, type, state, refs = {}, { time } = {}) => {
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    return keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held, at: time || at() }))
  }
  return { held, person, say }
}

// A door case: the op, its arguments, and what it must give (a subset match unless `exact`).
function door(name, op, args, { expect, exact, error } = {}) {
  args = JSON.parse(JSON.stringify(args))
  if (error) {
    assert.throws(() => call(op, ...args), (e) => (!error.kind || e.kind === error.kind), name)
    made.add(name); V.door = V.door.filter((c) => c.name !== name); V.door.push({ name, op, args, error }); return
  }
  const got = call(op, ...args)
  if (expect !== undefined) { try { exact ? assert.deepEqual(got, expect) : subset(got, expect) } catch (e) { throw new Error(`${name}: ${e.message}\n got ${JSON.stringify(got).slice(0, 600)}`) } }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}) })
  return got
}

// ---- cases that Phase 2 removes: the rule they tested is gone ----
for (const name of ['a lang that is not a language tag']) V.refusals.cases = V.refusals.cases.filter((c) => c.name !== name)

// ---- base fields: the closed types list theirs; the open types list none ----
{
  for (const type of ['actor', 'thing', 'observe', 'transform', 'transfer', 'promise', 'grant']) door(`base_fields: ${type}`, 'base_fields', [type], {})
}

// ---- the Merkle root (encoding.md, Large content) ----
// A third implementation, plain, to settle the expectations: level by level, an odd one carried up, as the spec states.
const h = (...parts) => crypto.createHash('sha256').update(Buffer.concat(parts)).digest()
const leaf = (hex) => h(Buffer.from([0]), Buffer.from(hex, 'hex'))
const levelsOf = (chunks) => { let level = chunks.map(leaf); const all = [level]; while (level.length > 1) { const next = []; for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? h(Buffer.from([1]), level[i], level[i + 1]) : level[i]); level = next; all.push(level) } return all }
const rootOf = (chunks) => { const l = levelsOf(chunks); return l[l.length - 1][0].toString('hex') }
const proofOf = (chunks, index) => { const out = []; let at = index; for (const level of levelsOf(chunks)) { if (level.length === 1) break; if (at % 2) out.push(level[at - 1].toString('hex')); else if (at + 1 < level.length) out.push(level[at + 1].toString('hex')); at = Math.floor(at / 2) } return out }
const chunk = (i) => Buffer.from(`chunk ${i}`, 'utf8').toString('hex')
const sets = { 1: [chunk(0)], 2: [0, 1].map(chunk), 3: [0, 1, 2].map(chunk), 5: [0, 1, 2, 3, 4].map(chunk), 7: [0, 1, 2, 3, 4, 5, 6].map(chunk) }
// The single-chunk root is the leaf hash; the empty chunk is a chunk.
door('merkle: one chunk is its own leaf, hash of 00 then the chunk', 'merkle_root', [sets[1]], { expect: leaf(sets[1][0]).toString('hex'), exact: true })
door('merkle: an empty chunk is a chunk (hash of the byte 00)', 'merkle_root', [['']], { expect: crypto.createHash('sha256').update(Buffer.from([0])).digest('hex'), exact: true })
for (const n of [2, 3, 5, 7]) door(`merkle: the root of ${n} chunks (an odd one is carried up unchanged)`, 'merkle_root', [sets[n]], { expect: rootOf(sets[n]), exact: true })
// A proof is the siblings from the leaf up; a carried level adds nothing.
for (const [n, i] of [[2, 1], [3, 2], [3, 0], [5, 4], [5, 2], [7, 6], [7, 3]]) {
  const root = rootOf(sets[n]), proof = proofOf(sets[n], i)
  door(`merkle: the proof of chunk ${i} of ${n}`, 'merkle_proof', [sets[n], i], { expect: proof, exact: true })
  door(`merkle: chunk ${i} of ${n} verifies under its root`, 'merkle_verify', [root, sets[n][i], i, n, proof], { expect: true, exact: true })
}
{
  const root = rootOf(sets[5]), proof = proofOf(sets[5], 4)
  door('merkle: the carried chunk 4 of 5 has a one-hash proof', 'merkle_proof', [sets[5], 4], { expect: proof, exact: true }); assert.equal(proof.length, 1)
  const good = proofOf(sets[5], 1)
  door('merkle: a proof for another chunk does not verify', 'merkle_verify', [root, sets[5][2], 2, 5, good], { expect: false, exact: true })
  door('merkle: a changed chunk does not verify', 'merkle_verify', [root, chunk(99), 1, 5, good], { expect: false, exact: true })
  door('merkle: the wrong index does not verify', 'merkle_verify', [root, sets[5][1], 0, 5, good], { expect: false, exact: true })
  // The root does not commit the count (the count is stated beside the root, signed in the same block), but the count fixes the shape of the path:
  door('merkle: the carried chunk 4 of 5 does not verify as chunk 4 of 6, where it has a sibling', 'merkle_verify', [root, sets[5][4], 4, 6, proof], { expect: false, exact: true })
  door('merkle: a proof with a hash too many does not verify', 'merkle_verify', [root, sets[5][1], 1, 5, [...good, good[0]]], { expect: false, exact: true })
  door('merkle: a proof with a hash too few does not verify', 'merkle_verify', [root, sets[5][1], 1, 5, good.slice(0, -1)], { expect: false, exact: true })
  door('merkle: a proof hash in capitals is refused', 'merkle_verify', [root, sets[5][1], 1, 5, [good[0].toUpperCase(), ...good.slice(1)]], { expect: false, exact: true })
  door('merkle: an index past the count does not verify', 'merkle_verify', [root, sets[5][1], 5, 5, good], { expect: false, exact: true })
  // The convention matters: a node is not a leaf, so a chunk that spells two hashes cannot stand in for their node.
  const l0 = leaf(sets[2][0]), l1 = leaf(sets[2][1])
  const forged = Buffer.concat([l0, l1]).toString('hex')
  door('merkle: two leaf hashes written as one chunk do not reproduce the node above them', 'merkle_root', [[forged]], { expect: leaf(forged).toString('hex'), exact: true })
  assert.notEqual(leaf(forged).toString('hex'), rootOf(sets[2]))
  door('merkle: no chunks, no root', 'merkle_root', [[]], { error: { kind: 'argument' } })
  door('merkle: no such chunk, no proof', 'merkle_proof', [sets[2], 2], { error: { kind: 'argument' } })
}

// ---- the base schemas (spec/schemas): stable ids, a valid chain, and what naming one does ----
{
  const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../spec/schemas/published.json'), 'utf8'))
  const pub = P.publisher.public_key_sign
  const full = (b) => b
  let prev = P.genesis
  for (const name of P.order) {
    const b = P.schemas[name]
    door(`base schema ${name}: its id is the hash of its bytes`, 'hash', [b.type, b.state, b.refs], { expect: b.hash, exact: true })
    door(`base schema ${name}: the publisher's signature opens`, 'verify', [{ type: b.type, state: b.state, refs: b.refs }, b.signature, pub], { expect: true, exact: true })
    prev = b
  }
  // A block is judged only with its whole chain behind it: the first and the last of the publisher's chain are valid.
  const chain = [P.genesis, ...P.order.map((n) => P.schemas[n])]
  door('base schemas: the first schema is valid after the publisher\'s genesis', 'valid', [chain[1], [chain[0]], null], { expect: [], exact: true })
  door('base schemas: the last schema is valid with the whole chain behind it', 'valid', [chain[chain.length - 1], chain.slice(0, -1), null], { expect: [], exact: true })
  const S = P.schemas
  const GBP = (minor) => ({ minor, currency: 'GBP' })
  const author = 'a'.repeat(64), other = 'b'.repeat(64)
  const refsOf = (schema) => ({ author, prev: author, from: author, to: other, ...(schema ? { schema: S[schema].hash } : {}) })
  const loanState = (extra = {}) => ({ seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'loan of 100 GBP', principal: GBP(10000), terms: { price: GBP(11000), expires: '2026-12-31T00:00:00.000Z' }, ...extra })
  const refusals = (name, state, refs, held, schemas, codes) => door(name, 'refusals', ['promise', state, refs, held, schemas], { expect: codes.map((code) => ({ code })), exact: false })
  // A closed block says more than the protocol's own fields only through a schema it names, and only what that schema declares.
  const codes = (type, state, refs, held, schemas) => [...new Set(call('refusals', type, state, refs, held, schemas).map((r) => r.code))]
  const closed = (name, state, refs, schemas, want) => {
    assert.deepEqual(codes('promise', state, refs, [], schemas), want, name)
    door(name, 'refusals', ['promise', state, refs, [], schemas], want.length ? { expect: want.map((code) => ({ code })) } : { expect: [], exact: true })
  }
  closed('base schema loan: a promise names it and carries principal: nothing to refuse', loanState(), refsOf('loan'), [S.loan], [])
  closed('base schema loan: principal without the schema is not a field of a promise', loanState(), refsOf(null), [], ['undeclared_field'])
  closed('base schema loan: a field the schema does not declare is refused', loanState({ colour: 'red' }), refsOf('loan'), [S.loan], ['undeclared_field'])
  closed('base schema loan: the schema must be held to be read', loanState(), refsOf('loan'), [], ['undeclared_ref'])
  closed('base schema teach: a promise that names it carries no extra field', { seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'teach sourdough', terms: { quantity: { value: '2', unit: 'h' }, expires: '2026-12-31T00:00:00.000Z' } }, refsOf('teach'), [S.teach], [])
}

// ---- devices: "this device, set up by X, reported Y at T" (profiles/attestations.md, Devices) ----
{
  const s = story()
  const farmer = s.person('devices: farmer'), installer = s.person('devices: installer'), stranger = s.person('devices: stranger')
  const device = s.person('devices: device', { kind: 'machine' }), rogue = s.person('devices: rogue device', { kind: 'machine' }), actorSensor = s.person('devices: sensor with a key', { kind: 'machine' })
  const probe = s.say(farmer, 'thing', { kind: 'sensor', name: 'frost probe' })
  const T = (h, m = 0) => `2026-11-03T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
  const reading = (who, from, value, h) => s.say(who, 'observe', { kind: 'temperature', amount: { value, unit: 'Cel' } }, { from }, { time: T(h) })
  const cond = (from) => ({ reading: from, kind: 'temperature', op: 'lt', value: { value: '0', unit: 'Cel' }, over: 'PT1H' })
  const holds = (name, from, held, now, expect) => door(name, 'reading_condition_holds', [cond(from), held, now], { expect, exact: true })
  // the device and the rogue read; with no grant at all neither counts
  reading(device, probe.hash, '-2', 1); reading(device, probe.hash, '-3', 2); reading(rogue, probe.hash, '-8', 1); reading(rogue, probe.hash, '-9', 2)
  holds('devices: no operator grant, no reading counts', probe.hash, s.held, T(2, 30), false)
  // a stranger's grant, and the installer's (who does not own the probe), make no operator of it
  s.say(stranger, 'grant', { kind: 'operator' }, { to: rogue.id, subject: probe.hash })
  s.say(installer, 'grant', { kind: 'operator' }, { to: rogue.id, subject: probe.hash })
  holds('devices: a stranger\'s or an installer\'s operator grant does not make an operator of the probe', probe.hash, s.held, T(2, 30), false)
  // the owner names the device: its readings count, the rogue\'s still do not
  const owner = s.say(farmer, 'grant', { kind: 'operator' }, { to: device.id, subject: probe.hash })
  holds('devices: the owner names the device: its readings count', probe.hash, s.held, T(2, 30), true)
  holds('devices: the rogue device\'s -9 C is not needed and not counted: without the device\'s readings nothing holds', probe.hash, s.held.filter((b) => !(b.type === 'observe' && b.refs.author === device.id)), T(2, 30), false)
  // the owner's own reading counts
  const ownerProbe = s.say(farmer, 'thing', { kind: 'sensor', name: 'second probe' })
  reading(farmer, ownerProbe.hash, '-1', 0); reading(farmer, ownerProbe.hash, '-2', 1)
  holds('devices: the owner\'s own reading counts', ownerProbe.hash, s.held, T(1, 30), true)
  // the sensor gives away: the old owner\'s grants stop counting
  const t = s.say(farmer, 'transfer', {}, { what: probe.hash, to_owner: installer.id })
  s.say(installer, 'transfer', { status: 'accepted' }, { answers: t.hash })
  holds('devices: the probe has a new owner: the old owner\'s grant to the device no longer counts', probe.hash, s.held.filter((b) => !(b.type === 'observe' && b.refs.author === rogue.id)), T(2, 30), false)
  holds('devices: the new owner (the installer) had named the rogue device: its reading counts now', probe.hash, s.held, T(2, 30), true)
  // a sensor that is an actor signs its own readings
  reading(actorSensor, actorSensor.id, '-4', 1); reading(actorSensor, actorSensor.id, '-5', 2)
  holds('devices: a sensor that is an actor signs its own readings, and they count', actorSensor.id, s.held, T(2, 30), true)
}

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
