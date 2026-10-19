// Adds to spec/vectors.json the cases the necessity table asked for (spec/NECESSITY.md): `node test/make-vectors-necessity.cjs`.
// Each case is a closed block that carries one listed thing and passes the strict check (or, for a single-id link, one that
// breaks the rule). Without the thing in spec/protocol.json the case fails, which is what makes the thing necessary.
// Idempotent: a case it made is replaced by name. Every expectation is checked against the Rust core before it is written;
// the oracle then checks the file against an implementation written from the spec text alone.
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const key = fb.keypairFromSeed('c3'.repeat(32), 'std')
const g = fb.identity.genesis(key, { kind: 'person', at: '2026-10-19T12:00:00.000Z' })
const other = 'cd'.repeat(32), third = 'ef'.repeat(32)
const at = '2026-10-19T12:00:01.000Z', LATER = '2027-01-01T00:00:00.000Z'
const common = (seq = 1) => ({ seq, at, audience: 'public' })
const mine = { author: g.hash, prev: g.hash }
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
const made = new Set()
function check(name, block, codes) {
  const got = codesOf(call('refusals', block.type, block.state, block.refs, [], null))
  assert.deepEqual(got, codes, `${name}: ${JSON.stringify(got)}`)
  made.add(name)
  V.refusals.cases = V.refusals.cases.filter((c) => c.name !== name)
  V.refusals.cases.push({ name, by: 'check', block, codes })
}
// A promise (an offer: it names its giver) carrying one more state field or ref.
const promise = (state = {}, refs = {}) => ({ type: 'promise', state: { ...common(), what: 'bread', terms: { expires: LATER }, ...state }, refs: { ...mine, from: g.hash, ...refs } })
const carries = (thing, block) => check(`necessity: a closed block may carry ${thing}`, block, [])

carries('state.where', promise({ where: { lat: '51.5', lon: '-0.12' } }))
carries('state.nonce', promise({ nonce: 'ab'.repeat(16) }))
carries('state.confidence', promise({ confidence: '0.8' }))
carries('state.orderer', promise({ orderer: key.public_key_sign }))
carries('state.skip', { type: 'promise', state: { ...common(9), what: 'bread', terms: { expires: LATER }, skip: true }, refs: { ...mine, from: g.hash } })
carries('state.withheld', promise({ withheld: true }))
carries('state.channel', promise({ channel: 'sms' }))
carries('state.stop.occurrences', { type: 'promise', state: { ...common(), status: 'stopped', stop: { occurrences: ['2026-12-01T00:00:00.000Z'] } }, refs: { ...mine, updates: other } })
carries('scope.parties', { type: 'grant', state: { ...common(), kind: 'operator', scope: { acts: ['promise'], parties: [other] } }, refs: { ...mine, to: other } })
carries('scope.condition', { type: 'grant', state: { ...common(), kind: 'operator', scope: { acts: ['promise'], condition: { settled: other } } }, refs: { ...mine, to: other } })
carries('refs.confirms', promise({}, { confirms: other }))
carries('refs.defeats', promise({}, { defeats: other }))
carries('refs.derives_from', promise({}, { derives_from: other }))
carries('refs.same_as', { type: 'actor', state: { ...common(), kind: 'contact', name: 'Sam' }, refs: { ...mine, same_as: other } })
carries('refs.for_whom', promise({}, { for_whom: other }))
carries('refs.to_holder', { type: 'transfer', state: { ...common(), count: 1 }, refs: { ...mine, what: other, to_holder: third } })
carries('refs.place', { type: 'transfer', state: { ...common() }, refs: { ...mine, what: other, to_place: third, place: third } })
carries('refs.of', promise({}, { of: other }))
// refs.author and refs.prev each hold exactly one id (core.md, section 1): a set there is a grammar error.
for (const k of ['author', 'prev']) {
  check(`necessity: refs.${k} holds exactly one id, a set is refused`, { type: 'observe', state: { ...common(), kind: 'note' }, refs: { ...mine, [k]: [other, third] } }, ['grammar'])
}

fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
