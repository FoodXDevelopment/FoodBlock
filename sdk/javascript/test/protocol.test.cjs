const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const protocolJson = require('../../../spec/protocol.json')

// FoodBlock 1.6: one source for lists, the strict write check, the one write path, valid(block, context), year zero.
const vectors = require('../../../spec/vectors.json')
const ledger = (name) => vectors.hashes.find((v) => v.name.startsWith(name)).block
const jo = 'a'.repeat(64), tom = 'b'.repeat(64), genesisOfJo = 'e'.repeat(64)
const strict = (type, state, refs, options = {}) => fb.check(type, state, refs, options)
const codes = (type, state, refs, options) => [...new Set(fb.refusals(type, state, refs, options).map((r) => r.code))]

test('the package carries spec/protocol.json exactly (and no alias table)', () => {
  const fs = require('fs'), path = require('path')
  assert.ok(fs.readFileSync(path.join(__dirname, '../spec/protocol.json')).equals(fs.readFileSync(path.join(__dirname, '../../../spec/protocol.json'))), 'run node test/sync-spec.cjs')
  assert.equal(fs.existsSync(path.join(__dirname, '../spec/aliases.json')), false, 'year zero: no alias table')
  assert.equal(fb.readAs, undefined)
  assert.equal(fb.ALIASES, undefined)
})

test('times and dates are real calendar values; a micro genesis may leave out its encryption key and its recovery', () => {
  for (const bad of ['2026-02-30T12:00:00.000Z', '2026-10-15T24:00:00.000Z', '2025-02-29T00:00:00.000Z', '2026-13-01T00:00:00.000Z', '2026-10-15T12:60:00.000Z']) assert.equal(fb.isTime(bad), false, bad)
  for (const good of ['2024-02-29T00:00:00.000Z', '2026-10-15T23:59:59.999Z']) assert.equal(fb.isTime(good), true, good)
  const g = fb.identity.genesis(fb.generateKeypair(), { kind: 'machine' })
  assert.equal(g.state.public_key_encrypt, undefined)
  assert.deepEqual(fb.check(g.type, g.state, g.refs), [])
})

test('this SDK speaks and writes 1.6, read from protocol.json', () => {
  assert.equal(fb.VERSION, '1.6')
  assert.deepEqual(fb.TYPES, Object.keys(protocolJson.types))
  assert.equal(fb.TYPES.length, 7)
  assert.deepEqual(fb.VERBS, protocolJson.verbs)
  assert.deepEqual(fb.REF_KEYS, [...protocolJson.refs.who_and_where, ...protocolJson.refs.what_and_which, ...protocolJson.verbs, ...protocolJson.causal])
  assert.deepEqual(fb.PEERS, protocolJson.peers)
  assert.deepEqual(fb.SUITES, ['std', 'p256', 'sm'])
  assert.ok(fb.REF_KEYS.includes('of') && !fb.REF_KEYS.includes('kind'))
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
  const me = fb.identity.genesis(keys, { encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, recoveryKey: recovery.public_key_sign, reach: 'P30D' })
  const first = fb.write('thing', { kind: 'eggs', name: 'Eggs' }, {}, { author: me.hash, key: keys, held: [me] })
  assert.deepEqual([first.state.seq, first.refs.prev, fb.verify(first, first.signature, keys.public_key_sign)], [1, me.hash, true])
  const second = fb.write('observe', { kind: 'note', text: 'laid today' }, { subject: first.hash }, { author: me.hash, key: keys, held: [me, first] })
  assert.deepEqual([second.state.seq, second.refs.prev], [2, first.hash])
  assert.throws(() => fb.write('observe', { kind: 'note', weight: 1.5 }, {}, { author: me.hash, key: keys, held: [me] }), /float/)
  assert.throws(() => fb.write('observe', { kind: 'note', weight: null }, {}, { author: me.hash, key: keys, held: [me] }), /not_canonical|null/)
  assert.throws(() => fb.write('observe', { kind: 'note' }, { subject: [tom, jo] }, { author: me.hash, key: keys, held: [me] }), /set/)
  assert.deepEqual(fb.valid(second, [me, first]), [])
})

test('strict writing: a null, a float, an unsorted set, a repeat, text outside NFC and a repeated key are refused, never repaired', () => {
  const base = { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.deepEqual(codes('observe', { ...base, x: null }, refs), ['not_canonical'])
  assert.deepEqual(codes('observe', { ...base, x: 0.5 }, refs), ['float'])
  assert.deepEqual(codes('observe', { ...base, x: 2 ** 60 }, refs), ['integer_range'])
  assert.deepEqual(codes('observe', base, { ...refs, subject: [tom, jo] }), ['not_canonical'])
  assert.deepEqual(codes('observe', base, { ...refs, subject: [jo, jo] }), ['not_canonical'])
  assert.deepEqual(codes('observe', { ...base, s: 'café' }, refs), ['not_canonical'])
  assert.deepEqual(fb.strictText('{"refs":{},"state":{"a":1,"a":2},"type":"observe"}').map((r) => r.code), ['not_canonical'])
  assert.deepEqual(codes('observe', { ...base, x: { refs: [tom, jo] } }, refs), [], 'only the top-level refs holds sets')
})

test('the strict check: open types are checked against the core alone; closed types against their module', () => {
  const thing = ledger('an observe').refs && vectors.hashes.find((v) => v.block.type === 'thing' && v.block.refs.of)
  const wrong = (patch, refs = thing.block.refs) => strict('thing', { ...thing.block.state, ...patch }, refs).join('; ')
  assert.match(wrong({ pack: { value: 30, unit: '{egg}' } }), /amount/)
  assert.match(wrong({ weight: 0.5 }), /float/)
  assert.match(wrong({ at: '2026-10-15T09:00:04Z' }), /UTC time/)
  assert.match(wrong({ use_by: '1st November' }), /date/)
  assert.match(wrong({ where: { lat: '51.5', lon: '-0.1', radius: fb.amount('20', 'km') } }), /where/)
  assert.deepEqual(strict('thing', { ...thing.block.state, colour: 'brown' }, thing.block.refs), [], 'a thing is open: any field')
  assert.deepEqual(strict('weather', { ...thing.block.state }, { ...thing.block.refs, seller: jo }), [], 'any new type word is open')
  assert.match(strict('Weather', thing.block.state, thing.block.refs).join(), /not a type name/)
  assert.deepEqual(codes('promise', { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public', colour: 'brown' }, { author: jo, prev: genesisOfJo, from: jo, what: tom }), ['undeclared_field'])
  assert.deepEqual(codes('actor', { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public', public_key_sign: vectors.keys.ann.public_key_sign, alg_sign: 'ed25519' }, {}), ['bad_genesis'])
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
  assert.deepEqual(strict('promise', { ...offer, when: { after: 'f'.repeat(64), wait: 'PT30M' } }, refs), [], 'a relative when')
  assert.deepEqual(strict('promise', { ...offer, not: true, when: { from: '2026-10-16T09:00:00.000Z', to: '2026-10-16T10:00:00.000Z' }, terms: { ...offer.terms, repeat: 'FREQ=WEEKLY;BYDAY=FR', price: { share: '0.06', of: 'f'.repeat(64) } } }, refs), [])
  assert.match(strict('promise', { seq: 1, at: offer.at, audience: 'public', what: 'eggs' }, { author: tom, prev: genesisOfJo, to: tom }).join(), /expires/)
})

test('transfers: what changed, or how many received; money with marks and no thing; a split for several promises', () => {
  const base = { seq: 4, at: '2026-10-15T09:00:06.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.deepEqual(codes('transfer', base, refs), ['required'])
  assert.deepEqual(strict('transfer', { ...base, count: 120 }, { ...refs, what: 'c'.repeat(64) }), [], 'an open receiver: a langar says how many')
  const one = 'd'.repeat(64), two = 'f'.repeat(64)
  assert.deepEqual(strict('transfer', { ...base, money: fb.money(750, 'GBP'), marks: [{ scheme: 'card', value: 'ch_1' }], split: [{ for: one, money: fb.money(450, 'GBP') }, { for: two, line: 'eggs', money: fb.money(300, 'GBP') }] }, { ...refs, to_owner: tom, for: [one, two] }), [])
  assert.match(strict('transfer', { ...base, money: fb.money(1, 'GBP'), split: [{ for: 'a'.repeat(64), money: fb.money(1, 'GBP') }] }, { ...refs, to_owner: tom, for: one }).join(), /split/)
})

test('grants: the kinds the protocol reads, a profile\'s kinds, and a child never wider than its parent', () => {
  const base = { seq: 6, at: '2026-10-15T09:00:10.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  assert.deepEqual(strict('grant', { ...base, kind: 'licence', scope: { acts: ['copy'], until: '2027-01-01T00:00:00.000Z' } }, refs), [], 'an open grant: a public licence')
  assert.match(strict('grant', { ...base, kind: 'licence', scope: { acts: ['copy'] } }, refs).join(), /scope.until/)
  assert.deepEqual(strict('grant', { ...base, kind: 'successor', witnesses: ['c'.repeat(64), 'd'.repeat(64)], needed: 2, wait: 'P30D', keys: { sealed: 'x' } }, { ...refs, to: tom }), [], 'a successor grant (a profile) has no until')
  assert.match(strict('grant', { ...base, kind: 'member', roles: ['admin'] }, { ...refs, subject: 'c'.repeat(64), to: tom }).join(), /signed as the circle/)
  assert.deepEqual(strict('grant', { ...base, kind: 'key', public_key_encrypt: 'f'.repeat(64) }, { ...refs, subject: jo }), [], 'an encryption-only key grant')
  assert.match(strict('grant', { ...base, kind: 'key', public_key_sign: vectors.keys.ann.public_key_sign, replaces: vectors.keys.ann.public_key_sign }, { ...refs, subject: jo }).join(), /counted_to/)
  const parent = { hash: 'c'.repeat(64), type: 'grant', state: { ...base, kind: 'shop', depth: 1, scope: { acts: ['accept'], limit: fb.money(500, 'GBP'), until: '2026-12-01T00:00:00.000Z' } }, refs: { ...refs, to: tom } }
  const child = (scope, depth) => strict('grant', { ...base, kind: 'shop', ...(depth === undefined ? {} : { depth }), scope }, { author: tom, prev: genesisOfJo, parent: parent.hash, to: 'd'.repeat(64) }, { held: new Map([[parent.hash, parent]]) })
  assert.deepEqual(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }), [])
  assert.match(child({ acts: ['accept', 'offer'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }).join(), /acts/)
  assert.match(child({ acts: ['accept'], until: '2026-11-01T00:00:00.000Z' }).join(), /limit/)
  assert.match(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2027-01-01T00:00:00.000Z' }).join(), /until/)
  assert.match(child({ acts: ['accept'], limit: fb.money(100, 'GBP'), until: '2026-11-01T00:00:00.000Z' }, 1).join(), /depth/)
})

test('circles list their roles as data: [{ name, powers }], the founder holds the first', () => {
  const base = { seq: 9, at: '2026-10-15T09:00:13.000Z', audience: 'public' }, refs = { author: jo, prev: genesisOfJo }
  const circle = (roles) => codes('actor', { ...base, kind: 'circle', name: 'Co-op', roles }, refs)
  assert.deepEqual(circle([{ name: 'chef', powers: ['sign', 'admit', 'remove'] }, { name: 'guest', powers: [] }]), [])
  assert.deepEqual(circle([{ name: 'chef', powers: ['fly'] }]), ['bad_roles'])
  assert.deepEqual(circle([]), ['bad_roles'])
  assert.deepEqual(circle(undefined), ['bad_roles'])
  assert.deepEqual(strict('actor', { ...base, kind: 'contact', name: 'cash buyer' }, refs), [])
  assert.match(strict('actor', { ...base, kind: 'contact', public_key_encrypt: 'f'.repeat(64) }, refs).join(), /no keys/)
})

test("a schema's fields and roles are declared for a closed block: a reader holding the schema accepts them", () => {
  const schema = { hash: 'c'.repeat(64), type: 'thing', state: { kind: 'schema', target: 'promise', fields: { hens: 'text' }, roles: ['farm'] } }
  const promise = { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public', what: 'eggs', hens: 'free range' }
  const refs = { author: jo, prev: genesisOfJo, from: jo, schema: schema.hash, farm: tom }
  assert.deepEqual(strict('promise', promise, refs, { schemas: new Map([[schema.hash, schema]]) }), [])
  assert.match(strict('promise', promise, refs, { schemas: new Map() }).join(), /does not hold/)
  assert.match(strict('promise', promise, { author: jo, prev: genesisOfJo, from: jo, farm: tom }).join(), /refs.farm is not declared/)
})

test('ids are bare (SHA-256) or name:hex; the suites name their hashes and keys', () => {
  assert.deepEqual(codes('observe', { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public' }, { author: jo, prev: `sm3:${genesisOfJo}` }), [])
  assert.deepEqual(codes('observe', { seq: 1, at: '2026-10-15T09:00:00.000Z', audience: 'public' }, { author: jo, prev: `md5:${genesisOfJo}` }), ['unknown_suite'])
  assert.match(fb.hash('thing', {}, {}, 'sm'), /^sm3:[0-9a-f]{64}$/)
  assert.match(fb.hash('thing', {}, {}, 'p256'), /^[0-9a-f]{64}$/)
})

test('the converter turns old blocks into fresh 1.6 blocks; nothing else reads an older shape', () => {
  const keys = fb.generateKeypair()
  const g = { type: 'actor.foodie', state: { name: 'Ann', public_key_sign: keys.public_key_sign, at: '2024-01-01T00:00:00.000Z', audience: 'public' }, refs: {} }
  const id = fb.legacy.oldHash(g)
  const note = { type: 'observe.received', state: { text: 'x', weight: 1.5 }, refs: { author: id } }
  const done = fb.legacy.convert([g, note], { keys: { [id]: keys }, at: '2026-10-15T12:00:00.000Z' })
  assert.equal(done.blocks.length, 3)
  assert.equal(done.blocks[1].state.kind, 'converted', 'the genesis has no refs: the first block of the new chain names the old identity')
  assert.deepEqual(done.blocks[1].refs.derives_from, [id])
  assert.deepEqual(fb.valid(done.blocks[1], [done.blocks[0]]), [])
  assert.deepEqual(fb.valid(done.blocks[2], [done.blocks[0], done.blocks[1]]), [])
  assert.equal(done.blocks[2].state.weight, '1.5')
  assert.deepEqual(done.blocks[2].refs.derives_from, [fb.legacy.oldHash(note)])
  assert.match(strict('observe.received', {}, {}).join(), /not a type name/, 'a dotted old type is refused')
})
