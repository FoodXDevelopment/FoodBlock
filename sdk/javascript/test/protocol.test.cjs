const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const protocolJson = require('../../../spec/protocol.json')

// FoodBlock 1.6 (spec/protocol.md): one source for lists, the strict write check, the one write path, and reading
// every earlier shape through the one alias table.
const vectors = require('../../../spec/vectors.json')
const vector = (name) => vectors.hashes.find((v) => v.name.startsWith(name)).block
const jo = 'a'.repeat(64), tom = 'b'.repeat(64), genesisOfJo = 'e'.repeat(64)
const strict = (type, state, refs, options = {}) => fb.check(type, state, refs, options)

test('the package carries spec/ exactly: its copies of protocol.json and aliases.json match byte for byte', () => {
  const fs = require('fs'), path = require('path')
  for (const file of ['protocol.json', 'aliases.json']) assert.ok(fs.readFileSync(path.join(__dirname, '../spec', file)).equals(fs.readFileSync(path.join(__dirname, '../../../spec', file))), `sdk/javascript/spec/${file}: run node test/sync-spec.cjs`)
})

test('times and dates are real calendar values; a micro genesis may leave out its encryption key', () => {
  for (const bad of ['2026-02-30T12:00:00.000Z', '2026-10-15T24:00:00.000Z', '2025-02-29T00:00:00.000Z', '2026-13-01T00:00:00.000Z', '2026-10-15T12:60:00.000Z']) assert.equal(fb.isTime(bad), false, bad)
  for (const good of ['2024-02-29T00:00:00.000Z', '2026-10-15T23:59:59.999Z']) assert.equal(fb.isTime(good), true, good)
  const keys = fb.generateKeypair ? fb.generateKeypair() : null
  if (keys) {
    const g = fb.identity.genesis(keys, { kind: 'machine', recoveryKey: fb.generateKeypair().public_key_sign })
    assert.equal(g.state.public_key_encrypt, undefined)
    assert.deepEqual(fb.check(g.type, g.state, g.refs), [])
  }
})

test('the switch has flipped: this SDK speaks and writes 1.6, read from protocol.json', () => {
  assert.equal(fb.VERSION, '1.6')
  assert.equal(fb.WRITES, undefined, 'the draft bridge is gone')
  assert.deepEqual(fb.TYPES, Object.keys(protocolJson.types))
  assert.equal(fb.TYPES.length, 7, 'seven types: a schema is a thing of kind schema')
  assert.deepEqual(fb.VERBS, protocolJson.verbs)
  assert.equal(fb.VERBS.includes('after'), false, 'after is causal metadata, not a verb')
  assert.deepEqual(fb.REF_KEYS, [...protocolJson.refs.who_and_where, ...protocolJson.refs.what_and_which, ...protocolJson.refs.verbs])
  assert.deepEqual(fb.PROFILES, protocolJson.profiles)
})

test('compose: when, who, its place in the chain, what was seen and for whom, inside its content', () => {
  const block = fb.compose('observe', { kind: 'note', text: 'two trays kept back' }, {}, { author: jo, audience: [tom], after: ['c'.repeat(64)], at: '2026-10-15T09:00:00.000Z', link: { seq: 1, prev: genesisOfJo } })
  assert.deepEqual([block.state.at, block.state.seq, block.refs.prev, block.refs.author, block.refs.after], ['2026-10-15T09:00:00.000Z', 1, genesisOfJo, jo, ['c'.repeat(64)]])
  assert.equal(block.state.audience.includes(tom), false, 'recipients are never written in the clear')
  assert.equal(fb.findsSelf(block, tom, block.salts[tom]), true)
  assert.deepEqual(strict(block.type, block.state, block.refs), [])
})

test('write: compose, check, sign and chain in one step; a refused block is never repaired', () => {
  const keys = fb.generateKeypair(), recovery = fb.generateKeypair()
  const me = fb.identity.genesis(keys, { encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, recoveryKey: recovery.public_key_sign })
  const first = fb.write('thing', { kind: 'eggs', name: 'Eggs' }, {}, { author: me.hash, key: keys, held: [me] })
  assert.deepEqual([first.state.seq, first.refs.prev, fb.verify(first, first.signature, keys.public_key_sign)], [1, me.hash, true])
  const second = fb.write('observe', { kind: 'note', text: 'laid today' }, { subject: first.hash }, { author: me.hash, key: keys, held: [me, first] })
  assert.deepEqual([second.state.seq, second.refs.prev], [2, first.hash])
  assert.throws(() => fb.write('observe', { kind: 'note', weight: 1.5 }, {}, { author: me.hash, key: keys, held: [me] }), /float/)
})

test('the strict check refuses floats, big numbers, undeclared names, NFC twins, loose clocks and broken shapes', () => {
  const thing = vector('thing: an instance')
  const wrong = (patch, refs = thing.refs) => strict('thing', { ...thing.state, ...patch }, refs).join('; ')
  assert.match(wrong({ pack: { value: 30, unit: '{egg}' } }), /amount/)
  assert.match(wrong({ weight: 0.5 }), /float/)
  assert.match(wrong({ seq: 2 ** 60 }), /2\^53/)
  assert.match(wrong({ colour: 'brown' }), /state.colour is not declared/)
  assert.match(strict('thing', thing.state, { ...thing.refs, seller: jo }).join(), /refs.seller is not declared/)
  assert.match(strict('thing', thing.state, { ...thing.refs, prev: [jo, tom] }).join(), /refs.prev is one hash/)
  assert.match(wrong({ at: '2026-10-15T09:00:04Z' }), /UTC time/)
  assert.match(wrong({ use_by: '1st November' }), /date/)
  assert.match(wrong({ where: { lat: '51.5', lon: '-0.1', radius: fb.amount('20', 'km') } }), /where/)
  assert.deepEqual(strict('thing', { ...thing.state, where: { lat: '51.5', lon: '-0.1', radius: fb.amount('200', 'm') } }, thing.refs), [])
  assert.match(wrong({ ['café']: 1, ['café']: 2 }), /NFC/)
  assert.match(strict('schema', {}, {}).join(), /not a FoodBlock 1.6 type/)
  assert.match(strict('actor', { ...vector('actor: genesis').state, recovery_reach: undefined }, {}).join(), /recovery_reach/)
})

test('promises: no status on an offer or ask, three answers with stop scopes, for the first promise, lines with ids', () => {
  const offer = { seq: 3, at: '2026-10-15T09:00:04.000Z', audience: 'public', terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }
  const refs = { author: jo, prev: genesisOfJo, from: jo, to: tom, what: 'c'.repeat(64) }
  assert.deepEqual(strict('promise', offer, refs), [])
  assert.match(strict('promise', { ...offer, status: 'offered' }, refs).join(), /carries a status/)
  assert.match(strict('promise', offer, { ...refs, from: tom, to: undefined }).join(), /signed by a side/)
  const answer = (state, more = {}) => strict('promise', { seq: 1, at: '2026-10-15T09:00:05.000Z', audience: 'public', ...state }, { author: tom, prev: genesisOfJo, answers: 'd'.repeat(64), for: 'd'.repeat(64), ...more })
  assert.deepEqual(answer({ status: 'accepted' }), [])
  assert.deepEqual(answer({ status: 'stopped', stop: 'onward' }), [])
  assert.deepEqual(answer({ status: 'stopped', stop: { occurrences: ['2026-10-23T09:00:00.000Z'] } }), [])
  assert.match(answer({ status: 'stopped' }).join(), /state.stop is/)
  assert.match(answer({ status: 'withdrawn' }).join(), /accepted, declined, stopped/)
  assert.match(answer({ status: 'accepted' }, { for: undefined }).join(), /refs.for/)
  const lines = { ...offer, terms: { lines: [{ id: 'a', what: 'c'.repeat(64), quantity: fb.amount('2', '{tray}'), price: fb.money(900, 'GBP') }], expires: '2026-10-20T00:00:00.000Z' } }
  assert.deepEqual(strict('promise', lines, refs), [])
  assert.match(strict('promise', { ...lines, terms: { ...lines.terms, lines: [{ ...lines.terms.lines[0], id: undefined }] } }, refs).join(), /id names the line/)
  assert.match(strict('promise', { ...offer, terms: { ...offer.terms, repeat: 'every friday' } }, refs).join(), /RRULE/)
  assert.match(strict('promise', { ...offer, terms: { ...offer.terms, repeat: 'FREQ=WEEKLY' } }, refs).join(), /state.when/)
  assert.deepEqual(strict('promise', { ...offer, not: true, when: { from: '2026-10-16T09:00:00.000Z', to: '2026-10-16T10:00:00.000Z' }, terms: { ...offer.terms, repeat: 'FREQ=WEEKLY;BYDAY=FR', price: { share: '0.06', of: 'f'.repeat(64) } } }, refs), [])
  assert.match(strict('promise', { seq: 1, at: offer.at, audience: 'public', what: 'eggs' }, { author: tom, prev: genesisOfJo, to: tom }).join(), /expires/)
})

test('transfers: what changed, or how many received; money with marks; a split for several promises', () => {
  const base = { seq: 4, at: '2026-10-15T09:00:06.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.match(strict('transfer', base, refs).join(), /what changed/)
  assert.deepEqual(strict('transfer', { ...base, count: 120 }, { ...refs, what: 'c'.repeat(64) }), [], 'an open receiver: a langar says how many')
  const one = 'd'.repeat(64), two = 'f'.repeat(64)
  assert.deepEqual(strict('transfer', { ...base, money: fb.money(750, 'GBP'), marks: [{ scheme: 'card', value: 'ch_1' }], split: [{ for: one, money: fb.money(450, 'GBP') }, { for: two, line: 'eggs', money: fb.money(300, 'GBP') }] }, { ...refs, to_owner: tom, for: [one, two] }), [])
  assert.match(strict('transfer', { ...base, money: fb.money(1, 'GBP'), split: [{ for: 'a'.repeat(64), money: fb.money(1, 'GBP') }] }, { ...refs, to_owner: tom, for: one }).join(), /split/)
})

test('grants: receiver refs.to (or open), the three kinds the protocol reads, and a child never wider than its parent', () => {
  const base = { seq: 6, at: '2026-10-15T09:00:10.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.deepEqual(strict('grant', { ...base, kind: 'licence', scope: { acts: ['copy'], until: '2027-01-01T00:00:00.000Z' } }, refs), [], 'an open grant: a public licence')
  assert.match(strict('grant', { ...base, kind: 'licence', scope: { acts: ['copy'] } }, refs).join(), /scope.until/)
  assert.deepEqual(strict('grant', { ...base, kind: 'successor', witnesses: ['c'.repeat(64), 'd'.repeat(64)], needed: 2, wait: 'P30D', keys: { sealed: 'x' } }, { ...refs, to: tom }), [], 'a successor grant has no until')
  assert.match(strict('grant', { ...base, kind: 'successor', witnesses: ['c'.repeat(64)], needed: 2, wait: 'P30D', public_key_sign: vector('actor: genesis').state.public_key_sign }, { ...refs, to: tom }).join(), /needed.*|never signing keys/)
  assert.match(strict('grant', { ...base, kind: 'member', roles: ['admin'] }, { ...refs, subject: 'c'.repeat(64), to: tom }).join(), /signed as the circle/)
  assert.deepEqual(strict('grant', { ...base, kind: 'key', public_key_encrypt: 'f'.repeat(64) }, { ...refs, subject: jo }), [], 'an encryption-only key grant')
  assert.match(strict('grant', { ...base, kind: 'key', public_key_sign: vector('actor: genesis').state.public_key_sign, replaces: vector('actor: genesis').state.public_key_sign }, { ...refs, subject: jo }).join(), /counted_to/)
  const parent = { hash: 'c'.repeat(64), type: 'grant', state: { ...base, kind: 'shop', depth: 1, scope: { acts: ['accept'], limit: fb.money(500, 'GBP'), until: '2026-12-01T00:00:00.000Z' } }, refs: { ...refs, to: tom } }
  const child = (scope, depth) => strict('grant', { ...base, kind: 'shop', ...(depth === undefined ? {} : { depth }), scope }, { author: tom, prev: genesisOfJo, parent: parent.hash, to: 'd'.repeat(64) }, { held: new Map([[parent.hash, parent]]) })
  assert.deepEqual(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }), [])
  assert.match(child({ acts: ['accept', 'offer'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }).join(), /acts/)
  assert.match(child({ acts: ['accept'], until: '2026-11-01T00:00:00.000Z' }).join(), /limit/)
  assert.match(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2027-01-01T00:00:00.000Z' }).join(), /until/)
  assert.match(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }, 1).join(), /depth/)
})

test('things: a schema is a thing of kind schema; marks, words and use_by; contacts have no keys', () => {
  const base = { seq: 9, at: '2026-10-15T09:00:13.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.deepEqual(strict('thing', { ...base, kind: 'schema', target: 'thing.eggs', fields: { lot: 'text', use_by: 'date' }, roles: ['farm'], grounds: { event: 'a person saw the eggs', confirms: ['observe'] } }, refs), [])
  assert.match(strict('thing', { ...base, kind: 'schema', target: 'place' }, refs).join(), /target/)
  assert.match(strict('thing', { ...base, kind: 'schema', target: 'thing', fields: { lot: 'words' } }, refs).join(), /field type/)
  assert.match(strict('thing', { ...base, kind: 'eggs', target: 'thing' }, refs).join(), /belongs to a schema/)
  assert.deepEqual(strict('actor', { ...base, kind: 'contact', name: 'cash buyer' }, refs), [])
  assert.match(strict('actor', { ...base, kind: 'contact', public_key_encrypt: 'f'.repeat(64) }, refs).join(), /no keys/)
  assert.match(strict('actor', { ...base, kind: 'agent', public_key_sign: vector('actor: genesis').state.public_key_sign }, refs).join(), /only a genesis/)
})

test("a schema's fields and roles are declared: a reader holding the schema accepts them", () => {
  const schema = { hash: 'c'.repeat(64), type: 'thing', state: { kind: 'schema', target: 'thing.eggs', fields: { hens: 'text' }, roles: ['farm'] } }
  const eggs = { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public', kind: 'eggs', hens: 'free range' }
  const refs = { author: jo, prev: genesisOfJo, schema: schema.hash, farm: tom }
  assert.deepEqual(strict('thing', eggs, refs, { schemas: new Map([[schema.hash, schema]]) }), [])
  assert.match(strict('thing', eggs, refs, { schemas: new Map() }).join(), /does not hold/)
  assert.match(strict('thing', eggs, { author: jo, prev: genesisOfJo, farm: tom }).join(), /refs.farm is not declared/)
})

test('older blocks are read as 1.6 through one table, unchanged', () => {
  const old = fb.create('transfer.order', { status: 'accepted', what: 'eggs', due: '2026-10-20T00:00:00.000Z' }, { author: tom, seller: jo, buyer: tom, order: 'e'.repeat(64) })
  const read = fb.readAs(old)
  assert.deepEqual([read.type, read.state.kind, read.refs.from, read.refs.to, read.refs.answers, read.state.terms.deliver_by, read.readFrom, read.hash],
    ['promise', 'order', jo, tom, 'e'.repeat(64), '2026-10-20T00:00:00.000Z', 'transfer.order', old.hash])
  assert.equal(fb.isA(fb.create('place.venue', { name: 'Hill Bakery' }, {}), 'thing', 'venue'), true)
  const thing = vector('thing: an instance')
  assert.equal(fb.readAs(thing), thing, 'a 1.6 block reads as itself')
})

test('the 124 older cross-language vectors: same canonical form and hash; a legacy-read shape is refused on write', () => {
  const old = require('../../../test/vectors.json')
  for (const v of old) {
    assert.equal(fb.canonical(v.type, v.state, v.refs), v.expected_canonical, v.name)
    assert.equal(fb.hash(v.type, v.state, v.refs), v.expected_hash, v.name)
    if (v.section === 'legacy-read') assert.ok(strict(v.type, v.state, v.refs).length, `${v.name} is refused on write`)
  }
})
