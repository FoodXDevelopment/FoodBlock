const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.6 (privacy.md, Envelope): the envelope names no recipient; a sealed copy carries its signed public header;
// the suite names the key agreement and the cipher.
const vectors = require('../../../spec/vectors.json')

test('an envelope derives its sealing key with HKDF, names no recipient, and opens only for its recipients', () => {
  for (const suite of ['std', 'p256', 'sm']) {
    const ann = fb.generateEncryptionKeypair(suite), bob = fb.generateEncryptionKeypair(suite), eve = fb.generateEncryptionKeypair(suite)
    const envelope = fb.seal({ hello: 'bob' }, [ann.public_key_encrypt, bob.public_key_encrypt], { suite })
    assert.equal(envelope.alg, fb.PROTOCOL.suites[suite].envelope)
    assert.deepEqual(Object.keys(envelope.recipients[0]), ['encrypted_key'], 'no key_hash: recipients cannot be linked')
    assert.deepEqual(fb.open(envelope, bob.x25519_private), { hello: 'bob' })
    assert.throws(() => fb.open(envelope, eve.x25519_private), /no entry opens/)
  }
  const std = fb.generateEncryptionKeypair(), envelope = fb.seal({ a: 1 }, [std.public_key_encrypt])
  assert.throws(() => fb.open({ ...envelope, alg: 'x25519-aes-256-gcm' }, std.x25519_private), /unknown_suite|does not know/, 'the old raw-secret alg is gone')
})

test('the vectors\' envelopes open', () => {
  for (const v of vectors.envelopes) {
    const opened = fb.unwrap(fb.open(v.envelope, vectors.keys[v.recipient].x25519_private))
    assert.deepEqual([opened.hash, opened.signature], [v.opens_to.hash, v.opens_to.signature])
  }
})

test('a sealed copy: its header is public and signed; its body and reveals are for the recipient alone', () => {
  const keys = fb.generateKeypair(), bob = fb.generateEncryptionKeypair()
  const block = fb.compose('observe', { kind: 'note', text: 'two trays kept' }, {}, { author: 'a'.repeat(64), audience: ['b'.repeat(64)], link: { seq: 1, prev: 'a'.repeat(64) }, at: '2026-10-15T09:00:00.000Z' })
  const { salts, ...unsalted } = block
  const signed = { ...unsalted, signature: fb.sign(unsalted, keys.private_key) }
  const message = fb.sealCopy(signed, { keys: [bob.public_key_encrypt], reveals: [fb.revealFor(salts, 'b'.repeat(64))], privateKey: keys.private_key })
  assert.deepEqual(message.header, { author: 'a'.repeat(64), seq: 1, prev: 'a'.repeat(64), hash: signed.hash })
  assert.equal(fb.headerSignedBy(message, keys.public_key_sign), true)
  const opened = fb.openCopy(message, bob.x25519_private)
  assert.deepEqual([opened.hash, fb.verify(opened, opened.signature, keys.public_key_sign), fb.findsSelf(opened, 'b'.repeat(64), opened.reveals[0].salt)], [signed.hash, true, true])
  assert.throws(() => fb.openCopy({ ...message, header: { ...message.header, hash: 'f'.repeat(64) } }, bob.x25519_private), /another block/)
})
