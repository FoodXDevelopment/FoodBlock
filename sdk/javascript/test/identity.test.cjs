const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { genesis, keyGrant, keyTimeline, liveKeys, signedByAuthor, stands, identityState, chainsOf, nextLinkFor } = fb.identity

// identity.md: you are your key; her list of voices; a device key sits under a voice and keeps its own line; her clock
// is `clocks` ({ names, needed }) and comes with `reach`.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const hand = (block, key) => ({ ...block, signature: fb.signMessage(fb.header(block), key.private_key).signature })
const say = (id, keys, blocks, state, n) => fb.write('observe', { kind: 'note', ...state }, {}, { audience: 'public', author: id, key: keys, blocks, at: at(n) })
function person() {
  const keys = fb.generateKeypair(), me = genesis(keys, { kind: 'person', audience: 'public', encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, at: at(0) })
  return { keys, me }
}

test('you are your key: a genesis proves itself and is a list of one voice', () => {
  const { keys, me } = person()
  assert.deepEqual([fb.valid(me, []), fb.read(me, [])], [[], []])
  assert.equal(fb.identity.isGenesis(me), true)
  assert.equal(fb.identity.genesisOpens(me), true)
  assert.equal(signedByAuthor(me, [me]), true)
  assert.equal(signedByAuthor({ ...me, state: { ...me.state, kind: 'agent' } }, [me]), false)
  assert.deepEqual(identityState(me.hash, [me]).keys, [keys.public_key_sign])
  assert.deepEqual(identityState(me.hash, [me]).clocks, null)
})

test('a genesis with a reach states its clocks; the field is clocks, not keepers', () => {
  const friend = person().me, keys = fb.generateKeypair()
  const state = { kind: 'person', audience: 'public', at: at(0) }
  assert.throws(() => genesis(keys, { ...state, reach: 'P30D' }), /clocks/, 'a reach with no clock is bad_genesis')
  const me = genesis(keys, { ...state, reach: 'P30D', clocks: { names: [friend.hash] } })
  assert.deepEqual([me.state.reach, me.state.clocks, me.state.keepers], ['P30D', { names: [friend.hash] }, undefined])
  assert.deepEqual([fb.valid(me, []), fb.read(me, [])], [[], []])
  const folded = identityState(me.hash, [me, friend])
  assert.deepEqual(folded.clocks, { names: [friend.hash] })
  assert.equal('keepers' in folded, false)
})

test('each block sits in its key chain: seq 1 follows the genesis, each next names the one before', () => {
  const { keys, me } = person()
  const first = say(me.hash, keys, [me], { text: 'one' }, 1)
  const second = say(me.hash, keys, [me, first], { text: 'two' }, 2)
  assert.deepEqual([first.state.seq, first.refs.prev, second.state.seq, second.refs.prev], [1, me.hash, 2, first.hash])
  const [chain] = chainsOf(me.hash, [me, first, second])
  assert.deepEqual([chain.head, chain.length, chain.ok], [second.hash, 2, true])
  assert.deepEqual(nextLinkFor(me.hash, keys.public_key_sign, [me, first, second]), { seq: 3, prev: second.hash })
  // a block signed by another key says nothing for her, and `valid` names whose it is: the id is right, the key is not the one its pieces name
  const forged = hand(fb.create('observe', { kind: 'note', seq: 3, at: at(3), audience: 'public' }, { author: me.hash, prev: second.hash }), fb.generateKeypair())
  assert.equal(signedByAuthor(forged, [me, first, second]), false, 'another key cannot speak as you')
  assert.deepEqual(fb.valid(second, [me, first]), [])
  assert.deepEqual(fb.valid(forged, [me, first, second]).map((r) => r.code), ['bad_signature'])
})

test('a device key is granted by the id, sits under her voice and keeps its own chain', () => {
  const { keys, me } = person(), phone = fb.generateKeypair()
  const grant = keyGrant(me.hash, { author: me.hash, keys, blocks: [me], at: at(1) }, { key: phone.public_key_sign })
  assert.deepEqual([fb.valid(grant, [me]), fb.read(grant, [me])], [[], []])
  assert.deepEqual(liveKeys(me.hash, [me, grant]).sort(), [keys.public_key_sign, phone.public_key_sign].sort())
  const timeline = keyTimeline(me.hash, [me, grant])
  assert.deepEqual(timeline.map((entry) => [entry.key, entry.under]), [[keys.public_key_sign, null], [phone.public_key_sign, keys.public_key_sign]])
  const fromPhone = fb.write('observe', { kind: 'note', text: 'from my phone' }, {}, { audience: 'public', author: me.hash, key: phone, blocks: [me, grant], at: at(2) })
  assert.deepEqual([fromPhone.state.seq, fromPhone.refs.prev, fromPhone.refs.key], [1, grant.hash, grant.hash])
  assert.equal(signedByAuthor(fromPhone, [me, grant]), true)
  assert.deepEqual(stands(fromPhone, [me, grant]), { stands: true, waiting: [] })
})

test('her whole list again replaces the old one and names it in updates; a list with clocks carries them', () => {
  const { keys, me } = person(), friend = person().me, phone = fb.generateKeypair()
  const voices = [{ key: keys.public_key_sign }, { key_hash: fb.identity.keyHash(phone.public_key_sign), passes: true }]
  const signer = { author: me.hash, keys, blocks: [me, friend], at: at(1) }
  assert.throws(() => keyGrant(me.hash, signer, { voices }), /updates/, 'a list names the list it replaces')
  const list = keyGrant(me.hash, signer, { voices, updates: me.hash, clocks: { names: [friend.hash] } })
  assert.equal(list.state.clocks.names[0], friend.hash)
  assert.equal(list.state.keepers, undefined)
  assert.deepEqual([fb.valid(list, [me]), fb.read(list, [me, friend])], [[], []])
  assert.equal(identityState(me.hash, [me, friend, list]).voices.length, 2)
})

test('a key may be in another suite: p256 or sm; the block is hashed with the suite of the key that signed it', () => {
  for (const [suite, prefix] of [['p256', ''], ['sm', 'sm3:']]) {
    const keys = fb.generateKeypair(suite), me = genesis(keys, { kind: 'person', audience: 'public', at: at(0) })
    assert.equal(me.hash.startsWith(prefix), true)
    assert.equal(me.state.suite, suite)
    const note = say(me.hash, keys, [me], { text: 'hi' }, 1)
    assert.deepEqual(fb.valid(note, [me]), [])
    assert.equal(note.hash.startsWith(prefix), true)
    assert.equal(fb.wrap(note).suite, undefined, 'a message names no suite: the id is in the suite of the key that signed it')
    assert.equal(fb.unwrap(fb.wrap(note)).hash, note.hash)
  }
})
