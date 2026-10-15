const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.6 Encoding: the envelope names no recipient; a sealed copy carries its signed public header.
const vectors = require('../../../spec/vectors.json')

test('a new envelope derives its sealing key with HKDF-SHA256, names no recipient, and opens only for its recipients', () => {
  const ann = fb.generateEncryptionKeypair(), bob = fb.generateEncryptionKeypair(), eve = fb.generateEncryptionKeypair()
  const envelope = fb.seal({ hello: 'bob' }, [ann.public_key_encrypt, bob.public_key_encrypt])
  assert.equal(envelope.alg, fb.ALG)
  assert.deepEqual(Object.keys(envelope.recipients[0]), ['encrypted_key'], 'no key_hash: recipients cannot be linked')
  assert.deepEqual(fb.open(envelope, bob.x25519_private), { hello: 'bob' })
  assert.throws(() => fb.open(envelope, eve.x25519_private), /no entry opens/)
  assert.throws(() => fb.open({ ...envelope, alg: fb.ALG_RAW }, bob.x25519_private), /no entry opens/, 'the alg cannot be swapped')
})

test('older envelopes (the raw secret, and a key_hash a reader ignores) still open', () => {
  for (const v of vectors.envelopes) {
    const opened = fb.unwrap(fb.open(v.envelope, vectors.keys[v.recipient].x25519_private))
    assert.deepEqual([opened.hash, opened.signature], [v.opens_to.hash, v.opens_to.signature])
  }
})

test('a sealed copy: its header is public and signed; its body and reveals are for the recipient alone', () => {
  const keys = fb.generateKeypair(), bob = fb.generateEncryptionKeypair()
  const block = fb.compose('observe', { kind: 'note', text: 'two trays kept' }, {}, { author: 'a'.repeat(64), audience: ['b'.repeat(64)], link: { seq: 1, prev: 'a'.repeat(64) } })
  const { salts, ...unsalted } = block
  const signed = { ...unsalted, signature: fb.sign(unsalted, keys.private_key) }
  const message = fb.sealCopy(signed, { keys: [bob.public_key_encrypt], reveals: [fb.revealFor(salts, 'b'.repeat(64))], privateKey: keys.private_key })
  assert.deepEqual(message.header, { author: 'a'.repeat(64), seq: 1, prev: 'a'.repeat(64), hash: signed.hash })
  assert.equal(fb.headerSignedBy(message, keys.public_key_sign), true)
  const opened = fb.openCopy(message, bob.x25519_private)
  assert.deepEqual([opened.hash, fb.verify(opened, opened.signature, keys.public_key_sign), fb.findsSelf(opened, 'b'.repeat(64), opened.reveals[0].salt)], [signed.hash, true, true])
  assert.throws(() => fb.openCopy({ ...message, header: { ...message.header, hash: 'f'.repeat(64) } }, bob.x25519_private), /another block/)
})
