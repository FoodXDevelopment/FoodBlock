const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const protocolJson = fb.PROTOCOL // the package's own copy; the first test checks it is the repo's

// One source for lists, the one write path, and the two questions before any fold. `valid` says who said these bytes
// (eight codes: size_limit, not_canonical, chain, unmet, bad_piece, bad_hash, bad_signature, unknown_suite); `read` says whether this reader
// can read them (the value codes: time, decimal, shape, ...).
const at = '2026-10-15T09:00:00.000Z'
const jo = 'a'.repeat(64), tom = 'b'.repeat(64), genesisOfJo = 'e'.repeat(64)
const person = () => { const keys = fb.generateKeypair(); return { keys, me: fb.identity.genesis(keys, { kind: 'person', audience: 'public', at }) } }
// A block signed by hand over its header, as a careless or hostile device signs it: `sign` refuses what its own `read` refuses.
const hand = (me, keys, type, state, refs) => {
  const block = fb.create(type, { seq: 1, at, audience: 'public', ...state }, { author: me.hash, prev: me.hash, ...refs })
  return { ...block, signature: fb.signMessage(fb.header(block), keys.private_key).signature }
}

test('the package carries spec/protocol.json exactly', () => {
  const fs = require('fs'), path = require('path')
  assert.ok(fs.readFileSync(path.join(__dirname, '../spec/protocol.json')).equals(fs.readFileSync(path.join(__dirname, '../../../spec/protocol.json'))), 'copy spec/protocol.json into sdk/javascript/spec')
  assert.ok(fs.readFileSync(path.join(__dirname, '../spec/conventions.json')).equals(fs.readFileSync(path.join(__dirname, '../../../spec/conventions.json'))), 'copy spec/conventions.json into sdk/javascript/spec')
})

test('times and dates are real calendar values; a micro genesis may leave out its encryption key', () => {
  for (const bad of ['2026-02-30T12:00:00.000Z', '2026-10-15T24:00:00.000Z', '2025-02-29T00:00:00.000Z', '2026-13-01T00:00:00.000Z', '2026-10-15T12:60:00.000Z']) assert.equal(fb.isTime(bad), false, bad)
  for (const good of ['2024-02-29T00:00:00.000Z', '2026-10-15T23:59:59.999Z']) assert.equal(fb.isTime(good), true, good)
  const g = fb.identity.genesis(fb.generateKeypair(), { audience: 'public', at, kind: 'machine' })
  assert.equal(g.state.public_key_encrypt, undefined)
  assert.deepEqual([fb.valid(g, []), fb.read(g, [])], [[], []])
})

test('this SDK\'s lists come from protocol.json, and its number is its package\'s (protocol.json names no version)', () => {
  assert.equal(protocolJson.version, undefined)
  assert.equal(fb.VERSION, require('../package.json').version)
  assert.deepEqual(fb.TYPES, Object.keys(protocolJson.types))
  assert.equal(fb.TYPES.length, 7)
  assert.deepEqual(fb.VERBS, protocolJson.verbs)
  assert.deepEqual(fb.REF_KEYS, [...protocolJson.refs.who_and_where, ...protocolJson.refs.what_and_which, ...protocolJson.verbs, ...protocolJson.causal])
  assert.deepEqual(fb.PEERS, require('../spec/conventions.json').peers)
  assert.deepEqual(fb.SUITES, ['std', 'p256', 'sm'])
  assert.ok(fb.REF_KEYS.includes('of') && !fb.REF_KEYS.includes('kind'))
})

test('byte names are in the closed lists: receives, above, passes, terms.in_hand, terms.step, out_of_place, clocks', () => {
  const text = JSON.stringify(protocolJson)
  for (const name of ['receives', 'above', 'passes', 'in_hand', 'step', 'out_of_place', 'clocks']) assert.ok(text.includes(`"${name}"`), name)
  assert.equal(text.includes('"keepers"'), false, 'the field is `clocks`')
  assert.equal(text.includes('"at_missing"'), false, 'there is no `at_missing` code')
})

test('compose: when, who, its place in the chain, what was seen and for whom, inside its content', () => {
  const block = fb.compose('observe', { kind: 'note', text: 'two trays kept back' }, {}, { author: jo, audience: [tom], after: ['c'.repeat(64)], at, link: { seq: 1, prev: genesisOfJo } })
  assert.deepEqual([block.state.at, block.state.seq, block.refs.prev, block.refs.author, block.refs.after], [at, 1, genesisOfJo, jo, ['c'.repeat(64)]])
  assert.equal(block.state.audience.includes(tom), false, 'recipients are never written in the clear')
  assert.equal(fb.findsSelf(block, tom, block.salts[tom]), true)
  // a salt outside the grammar opens nothing: salt and value are one text, so a longer salt would open one commitment to two values
  assert.equal(fb.findsSelf(block, tom.slice(4), block.salts[tom] + tom.slice(0, 4)), false)
})

test('write: compose, check, sign and chain in one step; a refused block is never repaired', () => {
  const { keys, me } = person()
  const first = fb.write('thing', { kind: 'eggs', name: 'Eggs' }, {}, { audience: 'public', at, author: me.hash, key: keys, blocks: [me] })
  assert.deepEqual([first.state.seq, first.refs.prev, fb.verify(first, first.signature, keys.public_key_sign)], [1, me.hash, true])
  const second = fb.write('observe', { kind: 'note', text: 'laid today' }, { subject: first.hash }, { audience: 'public', at, author: me.hash, key: keys, blocks: [me, first] })
  assert.deepEqual([second.state.seq, second.refs.prev], [2, first.hash])
  const options = { audience: 'public', at, author: me.hash, key: keys, blocks: [me] }
  assert.throws(() => fb.write('observe', { kind: 'note', weight: 1.5 }, {}, options), /float/)
  assert.throws(() => fb.write('observe', { kind: 'note', weight: null }, {}, options), /not_canonical/)
  assert.throws(() => fb.write('observe', { kind: 'note' }, { subject: [tom, jo] }, options), /set/)
  assert.deepEqual([fb.valid(second, [me, first]), fb.read(second, [me, first])], [[], []])
})

test('a writer signs only what its own read reads; a block signed by hand is valid, and read refuses it', () => {
  const { keys, me } = person()
  const fraction = hand(me, keys, 'observe', { kind: 'note', when: '2026-10-15T09:00:00.0000001Z' }, {})
  assert.throws(() => fb.sign(fb.create(fraction.type, fraction.state, fraction.refs), keys.private_key), /its own read reads/)
  assert.deepEqual(fb.valid(fraction, [me]), [], 'valid is who said these bytes')
  assert.deepEqual(fb.read(fraction, [me]).map((r) => r.code), ['time'], 'the value code is read\'s, never valid\'s')
  const forged = { ...hand(me, keys, 'observe', { kind: 'note' }, {}), signature: fb.signMessage({ a: 1 }, fb.generateKeypair().private_key).signature }
  assert.deepEqual(fb.valid(forged, [me]).map((r) => r.code), ['bad_signature'])
})

test('valid gives only its eight codes; the value codes are read\'s', () => {
  const eight = ['size_limit', 'not_canonical', 'chain', 'unmet', 'bad_piece', 'bad_hash', 'bad_signature', 'unknown_suite']
  const { keys, me } = person()
  const odd = hand(me, keys, 'observe', { kind: 'note', when: 'not a time', n: '1.5' }, {})
  assert.deepEqual(fb.valid(odd, [me]), [])
  assert.ok(fb.read(odd, [me]).length > 0)
  for (const block of [odd, { ...odd, signature: 'ab' }, { ...odd, refs: { ...odd.refs, prev: 'zz' } }]) for (const r of fb.valid(block, [me])) assert.ok(eight.includes(r.code), r.code)
  for (const code of ['time', 'decimal', 'shape', 'grammar', 'calendar', 'audience', 'type_name', 'after_limit']) assert.ok(protocolJson.refusals.read.includes(code), code)
  assert.equal(protocolJson.refusals.read.includes('at_missing'), false, 'there is no `at_missing` code')
})

test('strict writing: a null, a float, an unsorted set, a repeat and a repeated key are refused as bytes that are not canonical', () => {
  const { keys, me } = person()
  const options = { audience: 'public', at, author: me.hash, key: keys, blocks: [me] }
  for (const [state, refs, code] of [[{ x: null }, {}, 'not_canonical'], [{ x: 0.5 }, {}, 'float'], [{ x: 2 ** 60 }, {}, 'integer_range'], [{}, { subject: [tom, jo] }, 'not_canonical'], [{}, { subject: [jo, jo] }, 'not_canonical']])
    assert.throws(() => fb.write('observe', { kind: 'note', ...state }, refs, options), new RegExp(code))
  assert.deepEqual(fb.strictText('{"refs":{},"state":{"a":1,"a":2},"type":"observe"}').map((r) => r.code), ['not_canonical'])
  assert.deepEqual(fb.strictText('{"refs":{},"state":{"a":null},"type":"observe"}').map((r) => r.code), ['not_canonical'])
  assert.deepEqual(fb.strictText('{"refs":{},"state":{"a":1.5},"type":"observe"}').map((r) => r.code), ['not_canonical'], 'a fraction in bytes is bytes that are not canonical')
})

test('a closed type that breaks its fields is signed by hand, valid, and unread with its codes', () => {
  const { keys, me } = person()
  const promise = hand(me, keys, 'promise', { what: 'eggs', colour: 'brown' }, { from: me.hash })
  assert.deepEqual(fb.valid(promise, [me]), [])
  assert.deepEqual(fb.read(promise, [me]).map((r) => r.code), ['undeclared_field'])
  assert.throws(() => fb.write('promise', { what: 'eggs', colour: 'brown' }, { from: me.hash }, { audience: 'public', at, author: me.hash, key: keys, blocks: [me] }), /undeclared_field/)
  const thing = fb.write('thing', { kind: 'eggs', colour: 'brown' }, {}, { audience: 'public', at, author: me.hash, key: keys, blocks: [me] })
  assert.deepEqual(fb.read(thing, [me]), [], 'a thing is open: any field')
})

test("a schema's fields are declared for a closed block: a reader holding the schema reads them", () => {
  const { keys, me } = person()
  const schema = fb.write('thing', { kind: 'schema', target: 'promise', fields: { hens: 'text' }, roles: ['farm'] }, {}, { audience: 'public', at, author: me.hash, key: keys, blocks: [me] })
  const promise = hand(me, keys, 'promise', { what: 'eggs', hens: 'free range' }, { from: me.hash, schema: schema.hash, farm: tom })
  const read = (blocks) => fb.read(promise, [me, ...blocks]).map((r) => r.code)
  assert.deepEqual(read([schema]), [])
  assert.ok(read([]).length > 0, 'a reader without the schema does not read the block')
  assert.deepEqual(fb.schemasFrom([me, schema]).map((s) => s.hash), [schema.hash])
})

test('ids are bare (SHA-256) or name:hex; the suites name their hashes and keys', () => {
  assert.match(fb.hash('thing', {}, {}, 'sm'), /^sm3:[0-9a-f]{64}$/)
  assert.match(fb.hash('thing', {}, {}, 'p256'), /^[0-9a-f]{64}$/)
  const { keys, me } = person()
  const link = hand(me, keys, 'observe', { kind: 'note' }, { prev: `md5:${genesisOfJo}` })
  assert.deepEqual(fb.valid(link, [me]).map((r) => r.code), ['unknown_suite'], 'a hash name this reader does not know waits')
})

test('writing fills nothing in the author\'s silence: audience and at are stated, a genesis states its kind, at and audience; a message has no version', () => {
  const keys = fb.generateKeypair()
  assert.throws(() => fb.identity.genesis(keys, { at, audience: 'public' }), /kind/)
  assert.throws(() => fb.identity.genesis(keys, { kind: 'person', audience: 'public' }), /`at`/)
  assert.throws(() => fb.identity.genesis(keys, { kind: 'person', at }), /audience/)
  const me = fb.identity.genesis(keys, { kind: 'person', at, audience: 'public' })
  const options = { author: me.hash, key: keys, blocks: [me] }
  assert.throws(() => fb.write('observe', { kind: 'note' }, {}, { ...options, at }), /audience/, 'no audience: refused, not made public')
  assert.throws(() => fb.write('observe', { kind: 'note' }, {}, { ...options, audience: 'public' }), /`at`/, 'no time: refused, not read from a clock')
  assert.ok(fb.write('observe', { kind: 'note' }, {}, { ...options, audience: 'public', at }).signature)
  const message = fb.wrap(me)
  assert.deepEqual(Object.keys(message).sort(), ['block', 'signature'])
  assert.throws(() => fb.unwrap({ ...message, version: '1.9' }), /exactly/)
})

test('binds: a draft binds anyone where it is an accept, or where something of the one whose word it is moves', () => {
  const { keys, me } = person()
  const buyer = person()
  const eggs = fb.write('thing', { kind: 'eggs', name: 'Eggs', pack: fb.amount('12', 'egg') }, {}, { audience: 'public', at, author: me.hash, key: keys, blocks: [me] })
  const blocks = [me, buyer.me, eggs]
  const draft = (type, state, refs) => ({ type, state: { seq: 2, at, audience: 'public', ...state }, refs: { author: me.hash, prev: eggs.hash, ...refs } })
  // her transfer of her eggs moves something of hers
  assert.equal(fb.binds(draft('transfer', { amount: fb.amount('6', 'egg') }, { what: eggs.hash, to_owner: buyer.me.hash }), blocks), true)
  // a note moves nothing
  assert.equal(fb.binds(draft('observe', { kind: 'note', text: 'laid today' }, { subject: eggs.hash }), blocks), false)
  // an accept binds, whatever it names
  const offer = fb.write('promise', { terms: { lines: [{ id: 'eggs', what: eggs.hash, price: fb.amount('3', 'GBP') }] } }, { from: me.hash, to: buyer.me.hash }, { audience: 'public', at, author: buyer.me.hash, key: buyer.keys, blocks })
  assert.equal(fb.binds(draft('promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }), [...blocks, offer]), true)
})
