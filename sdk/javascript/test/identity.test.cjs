const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { genesis, keyGrant, keysOf, keyTimeline, signedByAuthor, chainsOf, nextLinkFor, recoveryKeyHash, historyCounts } = fb.identity

// FoodBlock 1.6 §2: you are your key; devices have their own keys; a key changes by naming its last good block, and
// only by itself or the recovery key; history is closed.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
function person() {
  const keys = fb.generateKeypair(), recovery = fb.generateKeypair()
  const me = genesis(keys, { encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, recoveryKey: recovery.public_key_sign, at: at(0) })
  return { keys, recovery, me }
}
const say = (id, keys, held, state, n) => fb.write('observe', { kind: 'note', ...state }, {}, { author: id, key: keys, held, at: at(n) })

test('you are your key: a 1.6 genesis proves itself and passes the strict check', () => {
  const { me, recovery } = person()
  assert.deepEqual(fb.check(me.type, me.state, me.refs), [])
  assert.equal(me.state.recovery_key_hash, recoveryKeyHash(recovery.public_key_sign))
  assert.equal(signedByAuthor(me, [me]), true)
  assert.equal(signedByAuthor({ ...me, state: { ...me.state, kind: 'agent' } }, [me]), false)
  assert.throws(() => genesis(fb.generateKeypair(), {}), /recovery key/, 'every genesis written now names its recovery key')
})

test('each block sits in its key chain: seq 1 follows the genesis, each next names the one before', () => {
  const { keys, me } = person()
  const first = say(me.hash, keys, [me], { text: 'one' }, 1)
  const second = say(me.hash, keys, [me, first], { text: 'two' }, 2)
  assert.deepEqual([first.state.seq, first.refs.prev, second.state.seq, second.refs.prev], [1, me.hash, 2, first.hash])
  const [chain] = chainsOf(me.hash, [me, first, second])
  assert.deepEqual([chain.head.hash, chain.length, chain.ok], [second.hash, 2, true])
  const forged = { ...fb.compose('observe', { kind: 'note' }, {}, { author: me.hash, at: at(3), link: { seq: 3, prev: second.hash } }) }
  forged.signature = fb.sign(forged, fb.generateKeypair().private_key)
  assert.equal(signedByAuthor(forged, [me, first, second]), false, 'another key cannot speak as you')
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

test('a rotation names the last good block: the old key speaks up to it; the rotation itself stands', () => {
  const { keys, me } = person()
  const one = say(me.hash, keys, [me], { text: 'mine' }, 1)
  const stolen = say(me.hash, keys, [me, one], { text: 'pay the thief' }, 2)
  const next = fb.generateKeypair()
  const rotate = keyGrant(me.hash, next.public_key_sign, { private_key: keys.private_key, last: stolen }, { replaces: keys.public_key_sign, lastGood: one.hash, at: at(3) })
  const held = [me, one, stolen, rotate]
  assert.deepEqual([signedByAuthor(one, held), signedByAuthor(stolen, held), signedByAuthor(rotate, held)], [true, false, true])
  assert.equal(signedByAuthor(say(me.hash, next, held, { text: 'new key' }, 4), held), true)
  const late = keyGrant(me.hash, fb.generateKeypair().public_key_sign, { private_key: keys.private_key, last: rotate }, { replaces: keys.public_key_sign, lastGood: one.hash, at: at(5), after: [rotate.hash] })
  assert.equal(keysOf(me.hash, [...held, late]).length, 2, 'a later rotation that has seen the first is void')
})

test('a key is rotated only by itself or the recovery key; recovery reach is read from arrival, never from at', () => {
  const { keys, me, recovery } = person(), laptop = fb.generateKeypair()
  const device = keyGrant(me.hash, laptop.public_key_sign, { private_key: keys.private_key, last: null }, { at: at(1) })
  const rogue = keyGrant(me.hash, fb.generateKeypair().public_key_sign, { private_key: laptop.private_key, last: null, broughtIn: device.hash }, { replaces: keys.public_key_sign, lastGood: device.hash, at: at(2) })
  assert.equal(keyTimeline(me.hash, [me, device, rogue]).length, 2, 'the laptop cannot rotate the genesis key')
  const after = fb.write('observe', { kind: 'note', text: 'thief, backdated' }, {}, { author: me.hash, key: keys, held: [me, device], at: '2020-01-01T00:00:00.000Z' })
  const fresh = fb.generateKeypair()
  const settle = keyGrant(me.hash, fresh.public_key_sign, { private_key: recovery.private_key, recoveryKey: recovery.public_key_sign, last: null }, { replaces: keys.public_key_sign, lastGood: device.hash, at: at(4) })
  const held = [me, device, after, settle]
  assert.equal(signedByAuthor(after, held), false, 'within reach (no arrival known), whatever at it claims')
  const arrived = { [after.hash]: '2026-08-01T00:00:00.000Z', [settle.hash]: '2026-10-15T00:00:00.000Z' }
  assert.equal(signedByAuthor(after, held, { arrivedAt: (hash) => arrived[hash] }), true, 'it arrived before the reach began (P30D, by the calendar)')
  arrived[after.hash] = '2026-10-01T00:00:00.000Z'
  assert.equal(signedByAuthor(after, held, { arrivedAt: (hash) => arrived[hash] }), false)
  assert.equal(fb.grant.addDuration('2026-03-31T00:00:00.000Z', 'P1M', -1), '2026-03-03T00:00:00.000Z', 'P1M is a calendar month')
  assert.equal(fb.grant.addDuration('2026-10-15T00:00:00.000Z', 'P1Y', -1), '2025-10-15T00:00:00.000Z', 'P1Y is a calendar year')
})

test('two rotations of one key that do not see each other freeze only the keys they bring in', () => {
  const { keys, me } = person(), laptop = fb.generateKeypair()
  const device = keyGrant(me.hash, laptop.public_key_sign, { private_key: keys.private_key, last: null }, { at: at(1) })
  const a = fb.generateKeypair(), b = fb.generateKeypair()
  const one = keyGrant(me.hash, a.public_key_sign, { private_key: keys.private_key, last: device }, { replaces: keys.public_key_sign, lastGood: device.hash, at: at(2) })
  const two = keyGrant(me.hash, b.public_key_sign, { private_key: keys.private_key, last: device }, { replaces: keys.public_key_sign, lastGood: device.hash, at: at(2) })
  const held = [me, device, one, two]
  assert.deepEqual(keyTimeline(me.hash, held).filter((entry) => entry.frozen).map((entry) => entry.key).sort(), [a.public_key_sign, b.public_key_sign].sort())
  assert.equal(signedByAuthor(say(me.hash, laptop, held, { text: 'still here' }, 3), held), true, 'the laptop keeps speaking')
})

test('history is closed: a 1.6 identity has none; an older one keeps only what its first 1.6 block saw or lists', () => {
  const { keys, me } = person()
  const seqless = fb.create('observe', { kind: 'note', at: at(1), audience: 'public' }, { author: me.hash }); seqless.signature = fb.sign(seqless, keys.private_key)
  assert.equal(historyCounts(seqless, me.hash, [me]), false)
  assert.equal(fb.sync.accept([seqless], [me]).refused[0].code, 'no_history')
  const old = fb.generateKeypair(), oldG = fb.create('actor', { kind: 'person', public_key_sign: old.public_key_sign, at: at(0), audience: 'public' }, {})
  oldG.signature = fb.sign(oldG, old.private_key)
  const h1 = fb.create('observe', { kind: 'note', text: 'kept' }, { author: oldG.hash }), h2 = fb.create('observe', { kind: 'note', text: 'listed' }, { author: oldG.hash }), h3 = fb.create('observe', { kind: 'note', text: 'late' }, { author: oldG.hash })
  for (const h of [h1, h2, h3]) h.signature = fb.sign(h, old.private_key)
  assert.equal(historyCounts(h3, oldG.hash, [oldG, h3]), true, 'until its first 1.6 block, an older identity\'s history is open')
  const first = fb.write('observe', { kind: 'note', manifest: [h2.hash] }, { derives_from: h1.hash }, { author: oldG.hash, key: old, held: [oldG] })
  const held = [oldG, h1, h2, h3, first]
  assert.deepEqual([h1, h2, h3].map((h) => historyCounts(h, oldG.hash, held)), [true, true, false])
})
