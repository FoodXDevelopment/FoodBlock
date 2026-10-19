// Adds to spec/vectors.json the cases of Phase 4 of the 1.6 refinement (CHANGELOG.md): the sealed limit (authority.md): `node test/make-vectors-phase4.cjs`.
// Idempotent: a case it made is replaced by name. Every expectation is worked out here (the commitment by plain SHA-256, below) and checked
// against the Rust core before the file is written; the oracle (spec/oracle) then checks the file against an implementation written from the spec
// text alone. Run it after `node scripts/build-wasm.cjs`.
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
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name) => {
  if (keys[name]) return keys[name]
  const kp = fb.keypairFromSeed(sha(`foodblock 1.6 phase 4 vectors: ${name}`), 'std')
  keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign }
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 20, 9, 0, 0) + 1000 * tick++).toISOString()
const LATER = '2027-12-31T00:00:00.000Z'
const M = (minor, currency = 'GBP') => ({ minor, currency })
function story() {
  const held = []
  const keep = (block) => { held.push(block); return block }
  const person = (name, { kind = 'person' } = {}) => { const g = keep(genesis(keyOf(name), { kind, at: at() })); return { name, id: g.hash, g } }
  const say = (who, type, state, refs = {}) => {
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    return keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held, at: at() }))
  }
  return { held, person, say }
}
function door(name, op, args, { expect, exact } = {}) {
  args = JSON.parse(JSON.stringify(args))
  const got = call(op, ...args)
  if (expect !== undefined) assert.deepEqual(got, expect, name)
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}) })
}

// ---- the commitment: SHA-256 of the salt's hex then the canonical JSON of { limit, per } ----
const SALT = 'ab'.repeat(16), OTHER_SALT = 'cd'.repeat(16)
const LIMIT = M(5000)
const plain = (limit, per, salt) => sha(salt + JSON.stringify(per ? { limit: { currency: limit.currency, minor: limit.minor }, per } : { limit: { currency: limit.currency, minor: limit.minor } }))
door('limit: the commitment is the salted hash of { limit, per } in canonical JSON', 'limit_commitment', [LIMIT, 'P1D', SALT], { expect: plain(LIMIT, 'P1D', SALT), exact: true })
door('limit: with no period, per is left out of the committed value', 'limit_commitment', [LIMIT, null, SALT], { expect: plain(LIMIT, null, SALT), exact: true })
door('limit: another salt, another commitment', 'limit_commitment', [LIMIT, 'P1D', OTHER_SALT], { expect: plain(LIMIT, 'P1D', OTHER_SALT), exact: true })
assert.notEqual(plain(LIMIT, 'P1D', SALT), plain(LIMIT, 'P1D', OTHER_SALT))
const C = plain(LIMIT, 'P1D', SALT)

// ---- reversibility under a sealed limit, and opening it on the principal's node ----
{
  const s = story(), farmer = s.person('farmer'), agent = s.person('agent', { kind: 'agent' })
  s.say(farmer, 'grant', { kind: 'operator' }, { to: agent.id })
  const field = s.say(farmer, 'thing', { kind: 'field', name: 'north field' })
  const ACTS = ['transfer.spray', 'transfer.water', 'transfer']
  const never = s.say(farmer, 'thing', { kind: 'schema', target: 'transfer.spray', fields: { field: 'text' }, undo: 'never' })
  const broad = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, until: LATER } }, { to: agent.id })
  const sealed = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, limit_commitment: C, until: LATER } }, { to: agent.id })
  const visible = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, limit: LIMIT, per: 'P1D', until: LATER } }, { to: agent.id })
  const unnamed = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ['transfer.water'], limit_commitment: C, until: LATER } }, { to: agent.id })
  const act = (kind, under, extra = {}) => s.say(agent, 'transfer', { kind }, { what: field.hash, to_place: field.hash, under: under.hash, ...extra })
  const underOk = (name, block, expect) => door(name, 'under_ok', [block, s.held], { expect, exact: true })
  underOk('sealed limit: a grant that names the act and carries a limit commitment is enough, marked never', act('spray', sealed, { schema: never.hash }), true)
  underOk('sealed limit: the same act under a broad grant with no limit is not live', act('spray', broad, { schema: never.hash }), false)
  underOk('sealed limit: a visible limit is still enough', act('spray', visible, { schema: never.hash }), true)
  underOk('sealed limit: a limit commitment on a grant that does not name the act is not enough', act('spray', unnamed, { schema: never.hash }), false)
  // the amount sits on the principal's node: an observe of kind limit, for the grant
  const fence = (state, refs) => s.say(farmer, 'observe', { kind: 'limit', ...state }, refs)
  const right = fence({ limit: LIMIT, per: 'P1D', salt: SALT }, { for: sealed.hash })
  const opens = (name, g, f, expect) => door(name, 'limit_opens', [g, f], { expect, exact: true })
  opens('sealed limit: the observe with the amount, period and salt opens the grant\'s commitment', sealed, right, true)
  opens('sealed limit: a tampered amount does not open it', sealed, fence({ limit: M(9000), per: 'P1D', salt: SALT }, { for: sealed.hash }), false)
  opens('sealed limit: a tampered period does not open it', sealed, fence({ limit: LIMIT, per: 'P7D', salt: SALT }, { for: sealed.hash }), false)
  opens('sealed limit: a left-out period does not open a commitment that holds one', sealed, fence({ limit: LIMIT, salt: SALT }, { for: sealed.hash }), false)
  opens('sealed limit: another salt does not open it', sealed, fence({ limit: LIMIT, per: 'P1D', salt: OTHER_SALT }, { for: sealed.hash }), false)
  opens('sealed limit: an observe with no salt does not open it', sealed, fence({ limit: LIMIT, per: 'P1D' }, { for: sealed.hash }), false)
  opens('sealed limit: an observe for another grant does not open it', sealed, fence({ limit: LIMIT, per: 'P1D', salt: SALT }, { for: unnamed.hash }), false)
  opens('sealed limit: an observe that is not of kind limit does not open it', sealed, s.say(farmer, 'observe', { kind: 'note', limit: LIMIT, per: 'P1D', salt: SALT }, { for: sealed.hash }), false)
  opens('sealed limit: a grant with a visible limit has nothing to open', visible, right, false)
  // the same amount, signed in a grant that updates it, is a new commitment: the old one is not changed
  const raised = plain(M(9000), 'P1D', SALT)
  assert.notEqual(raised, C)
  const updated = s.say(farmer, 'grant', { kind: 'authority', scope: { acts: ACTS, limit_commitment: raised, until: LATER } }, { to: agent.id, updates: sealed.hash })
  opens('sealed limit: the old observe does not open the grant that updates it with a new commitment', updated, right, false)
}

// ---- what is checked about the grant itself, and about a child's limit ----
{
  const s = story(), farmer = s.person('p-farmer'), agent = s.person('p-agent', { kind: 'agent' }), sub = s.person('p-sub', { kind: 'agent' })
  const ACTS = ['transfer.spray', 'transfer']
  const parentSealed = s.say(farmer, 'grant', { kind: 'authority', depth: 1, scope: { acts: ACTS, limit_commitment: C, until: LATER } }, { to: agent.id })
  const parentVisible = s.say(farmer, 'grant', { kind: 'authority', depth: 1, scope: { acts: ACTS, limit: LIMIT, until: LATER } }, { to: agent.id })
  const child = (scope, parent) => ({ state: { seq: 1, at: at(), audience: 'public', kind: 'authority', scope: { acts: ['transfer.spray'], until: LATER, ...scope } }, refs: { author: agent.id, prev: agent.id, parent: parent.hash, to: sub.id } })
  const codes = (name, type, state, refs, held, want) => {
    const got = [...new Set(call('refusals', type, state, refs, held, null).map((r) => r.code))]
    assert.deepEqual(got, want, `${name}: ${JSON.stringify(got)}`)
    made.add(name)
    V.door = V.door.filter((c) => c.name !== name)
    V.door.push({ name, op: 'refusals', args: JSON.parse(JSON.stringify([type, state, refs, held, null])), expect: want.map((code) => ({ code })), ...(want.length ? {} : { exact: true }) })
  }
  const lone = story().person('p-lone')
  const loneGrant = (scope) => ({ state: { seq: 1, at: at(), audience: 'public', kind: 'authority', scope: { acts: ['transfer'], until: LATER, ...scope } }, refs: { author: lone.id, prev: lone.id, to: lone.id } })
  const check = (name, scope, want) => { const b = loneGrant(scope); codes(name, 'grant', b.state, b.refs, [lone.g], want) }
  check('sealed limit: a grant carrying a limit commitment is well formed', { limit_commitment: C }, [])
  check('sealed limit: a grant carrying a visible limit is well formed', { limit: LIMIT }, [])
  check('sealed limit: a limit commitment that is not a hash is refused', { limit_commitment: 'five thousand pounds' }, ['grammar'])
  check('sealed limit: a limit commitment must be text', { limit_commitment: 5000 }, ['grammar'])
  check('sealed limit: a visible limit and a limit commitment together are refused', { limit: LIMIT, limit_commitment: C }, ['shape'])
  // children: when the parent's limit is sealed, a child carries a limit too; whether it is no larger is for the principal's node
  const held = s.held
  const c1 = (name, scope, parent, want) => { const c = child(scope, parent); codes(name, 'grant', c.state, c.refs, held, want) }
  c1('sealed limit: a child under a sealed parent carries a commitment of its own', { limit_commitment: plain(M(1000), 'P1D', OTHER_SALT) }, parentSealed, [])
  c1('sealed limit: a child under a sealed parent may carry a visible limit', { limit: M(1000) }, parentSealed, [])
  c1('sealed limit: a child under a sealed parent with no limit at all is wider', {}, parentSealed, ['wider_than_parent'])
  c1('sealed limit: the other fields are still checked under a sealed parent (acts)', { limit_commitment: plain(M(1000), 'P1D', OTHER_SALT), acts: ['observe'] }, parentSealed, ['wider_than_parent'])
  c1('sealed limit: a child under a visible parent that is sealed cannot be shown no larger, so it is wider', { limit_commitment: plain(M(1000), 'P1D', OTHER_SALT) }, parentVisible, ['wider_than_parent'])
  c1('sealed limit: a child under a visible parent keeps a visible limit no larger', { limit: M(1000) }, parentVisible, [])
}

fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
