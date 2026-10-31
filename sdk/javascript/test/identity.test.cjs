const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { genesis, keyGrant, keysOf, keyTimeline, signedByAuthor, chainsOf, nextLinkFor, recoveryKeyHash } = fb.identity

// FoodBlock 1.7 (identity.md): you are your key; devices have their own keys; a key changes by naming its last good
// block, and only by itself, the recovery key or an operator. There is no history to close: year zero.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
function person() {
  const keys = fb.generateKeypair(), recovery = fb.generateKeypair()
  const me = genesis(keys, { kind: 'person', audience: 'public', encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, recoveryKey: recovery.public_key_sign, reach: 'P30D', at: at(0) })
  return { keys, recovery, me }
}
const say = (id, keys, held, state, n) => fb.write('observe', { kind: 'note', ...state }, {}, { audience: 'public', author: id, key: keys, held, at: at(n) })

test('you are your key: a genesis proves itself; the recovery key is optional, and comes as a pair', () => {
  const { me, recovery } = person()
  assert.deepEqual(fb.check(me.type, me.state, me.refs), [])
  assert.equal(me.state.recovery_key_hash, recoveryKeyHash(recovery.public_key_sign))
  assert.equal(signedByAuthor(me, [me]), true)
  assert.equal(signedByAuthor({ ...me, state: { ...me.state, kind: 'agent' } }, [me]), false)
  const bare = genesis(fb.generateKeypair(), { kind: 'person', audience: 'public', at: at(0) })
  assert.deepEqual([bare.state.recovery_key_hash, bare.state.recovery_reach], [undefined, undefined])
  assert.deepEqual(fb.valid(bare, []), [])
  assert.throws(() => genesis(fb.generateKeypair(), { kind: 'person', audience: 'public', recoveryKey: recovery.public_key_sign, at: at(0) }), /how far back/, 'the recovery key comes with its reach')
})

test('each block sits in its key chain: seq 1 follows the genesis, each next names the one before', () => {
  const { keys, me } = person()
  const first = say(me.hash, keys, [me], { text: 'one' }, 1)
  const second = say(me.hash, keys, [me, first], { text: 'two' }, 2)
  assert.deepEqual([first.state.seq, first.refs.prev, second.state.seq, second.refs.prev], [1, me.hash, 2, first.hash])
  const [chain] = chainsOf(me.hash, [me, first, second])
  assert.deepEqual([chain.head, chain.length, chain.ok], [second.hash, 2, true])
  const forged = { ...fb.compose('observe', { kind: 'note' }, {}, { audience: 'public', author: me.hash, at: at(3), link: { seq: 3, prev: second.hash } }) }
  forged.signature = fb.sign(forged, fb.generateKeypair().private_key)
  assert.equal(signedByAuthor(forged, [me, first, second]), false, 'another key cannot speak as you')
  assert.deepEqual(fb.valid(second, [me, first]), [])
  assert.deepEqual(fb.valid(forged, [me, first, second]).map((r) => r.code), ['bad_signature'])
})

test('a device key is granted by the id and keeps its own chain', () => {
  const { keys, me } = person(), phone = fb.generateKeypair()
  const grant = keyGrant(me.hash, phone.public_key_sign, { private_key: keys.private_key, last: null, broughtIn: me.hash }, { at: at(1) })
  assert.deepEqual(fb.check(grant.type, grant.state, grant.refs), [])
  assert.deepEqual(keysOf(me.hash, [me, grant]), [keys.public_key_sign, phone.public_key_sign])
  const fromPhone = say(me.hash, phone, [me, grant], { text: 'from my phone' }, 2)
  assert.deepEqual([fromPhone.state.seq, fromPhone.refs.prev], [1, grant.hash])
  assert.equal(nextLinkFor(me.hash, keys.public_key_sign, [me, grant]).seq, 2)
  assert.equal(signedByAuthor(fromPhone, [me, grant]), true)
})

test('a key\'s own rotation only closes its future (decision C1): what the old key signed before it still speaks; the rotation stands', () => {
  const { keys, me } = person()
  const one = say(me.hash, keys, [me], { text: 'mine' }, 1)
  const stolen = say(me.hash, keys, [me, one], { text: 'pay the thief' }, 2)
  const next = fb.generateKeypair()
  const rotate = keyGrant(me.hash, next.public_key_sign, { private_key: keys.private_key, last: stolen }, { replaces: keys.public_key_sign, countedTo: one.hash, at: at(3) })
  const held = [me, one, stolen, rotate]
  // counted_to reaches back only on a recovery rotation: her own rotation voids nothing she signed
  assert.deepEqual([signedByAuthor(one, held), signedByAuthor(stolen, held), signedByAuthor(rotate, held)], [true, true, true])
  assert.equal(signedByAuthor(say(me.hash, keys, held, { text: 'old key after its rotation' }, 4), [...held]), false)
  assert.equal(signedByAuthor(say(me.hash, next, held, { text: 'new key' }, 4), held), true)
})

test('a key is rotated only by itself or the recovery key; recovery reach is read from arrival, never from at', () => {
  const { keys, me, recovery } = person(), laptop = fb.generateKeypair()
  const device = keyGrant(me.hash, laptop.public_key_sign, { private_key: keys.private_key, last: null }, { at: at(1) })
  const rogue = keyGrant(me.hash, fb.generateKeypair().public_key_sign, { private_key: laptop.private_key, last: null, broughtIn: device.hash }, { replaces: keys.public_key_sign, countedTo: device.hash, at: at(2) })
  assert.equal(keyTimeline(me.hash, [me, device, rogue]).length, 2, 'the laptop cannot rotate the genesis key')
  assert.deepEqual(fb.valid(rogue, [me, device]).map((r) => r.code), ['not_own_rotation'])
  const after = fb.write('observe', { kind: 'note', text: 'thief, backdated' }, {}, { audience: 'public', author: me.hash, key: keys, held: [me, device], at: '2020-01-01T00:00:00.000Z' })
  const fresh = fb.generateKeypair()
  const settle = keyGrant(me.hash, fresh.public_key_sign, { private_key: recovery.private_key, recoveryKey: recovery.public_key_sign, last: null }, { replaces: keys.public_key_sign, countedTo: device.hash, at: at(4) })
  const arrived = { [after.hash]: '2026-08-01T00:00:00.000Z', [settle.hash]: '2026-10-15T00:00:00.000Z' }
  assert.equal(signedByAuthor(after, [me, device, after, settle], { arrivedAt: (hash) => arrived[hash], unknownArrival: 'inside' }), false, 'a block nobody built on is void whenever it arrived (identity.md, Recovery reach)')
  const other = person()
  const built = fb.write('observe', { kind: 'note', text: 'built on it' }, { derives_from: after.hash }, { audience: 'public', author: other.me.hash, key: other.keys, held: [other.me, after], at: at(3) })
  const held = [me, device, after, settle, other.me, built]
  assert.equal(signedByAuthor(after, held), false, 'within reach (no arrival known), whatever at it claims')
  assert.equal(signedByAuthor(after, held, { arrivedAt: (hash) => arrived[hash], unknownArrival: 'inside' }), true, 'another identity built on it and it arrived before the reach began (P30D, by the calendar)')
  arrived[after.hash] = '2026-10-01T00:00:00.000Z'
  assert.equal(signedByAuthor(after, held, { arrivedAt: (hash) => arrived[hash], unknownArrival: 'inside' }), false)
  assert.equal(fb.grant.addDuration('2026-03-31T00:00:00.000Z', 'P1M', -1), '2026-02-28T00:00:00.000Z', 'P1M is a calendar month: a day past the month\'s end is its last day')
})

test('two rotations of one key naming one prev freeze only the keys they bring in', () => {
  const { keys, me } = person(), laptop = fb.generateKeypair()
  const device = keyGrant(me.hash, laptop.public_key_sign, { private_key: keys.private_key, last: null }, { at: at(1) })
  const a = fb.generateKeypair(), b = fb.generateKeypair()
  const one = keyGrant(me.hash, a.public_key_sign, { private_key: keys.private_key, last: device }, { replaces: keys.public_key_sign, countedTo: device.hash, at: at(2) })
  const two = keyGrant(me.hash, b.public_key_sign, { private_key: keys.private_key, last: device }, { replaces: keys.public_key_sign, countedTo: device.hash, at: at(2) })
  const held = [me, device, one, two]
  assert.deepEqual(keyTimeline(me.hash, held).filter((entry) => entry.frozen).map((entry) => entry.key).sort(), [a.public_key_sign, b.public_key_sign].sort())
  assert.equal(signedByAuthor(say(me.hash, laptop, held, { text: 'still here' }, 3), held), true, 'the laptop keeps speaking')
  assert.deepEqual(fb.identity.forkPairs(held), [[one.hash, two.hash].sort()])
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
