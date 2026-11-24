// A passkey is a FoodBlock key (spec/modules/encoding.md, Passkeys): a WebAuthn assertion from a test authenticator opens a block.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fb = require('../src/index.cjs')

const sha = (x) => crypto.createHash('sha256').update(x).digest()
const key = fb.keypairFromSeed(sha('passkey test').toString('hex'), 'p256')
const point = Buffer.from(key.public_key_sign.slice(-130), 'hex')
const device = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: Buffer.from(key.private_key, 'hex').toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' })
// What the browser hands back for a challenge.
function assertion(challenge, flags = 0x05) {
  const auth = Buffer.concat([sha('foodx.network'), Buffer.from([flags, 0, 0, 0, 1])])
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://foodx.network', crossOrigin: false }))
  const der = crypto.sign('sha256', Buffer.concat([auth, sha(cdj)]), { key: device, dsaEncoding: 'der' })
  return fb.passkeySignature(auth.toString('hex'), cdj.toString('hex'), der.toString('hex'))
}

test('a passkey signs a genesis and a note, and the plain form of the same key still works', () => {
  const g0 = fb.identity.genesis(key, { audience: 'public', kind: 'person', at: '2026-10-16T12:00:00.000Z' })
  assert.equal(fb.passkeyChallenge(g0), Buffer.from(g0.hash, 'hex').toString('base64url'))
  const genesis = { ...g0, signature: assertion(fb.passkeyChallenge(g0)) }
  assert.ok(fb.verify(g0, genesis.signature, key.public_key_sign))
  assert.deepEqual(fb.valid(genesis, []), [])
  const n = fb.write('observe', { kind: 'note', text: 'hi' }, {}, { author: g0.hash, key, blocks: [g0], at: '2026-10-16T12:00:01.000Z', audience: 'public' })
  const note = { ...n, signature: assertion(fb.passkeyChallenge(n)) }
  assert.deepEqual(fb.valid(note, [genesis]), [])
  assert.deepEqual(fb.valid(n, [genesis]), [])
  assert.ok(!fb.verify(n, assertion(fb.passkeyChallenge(g0)), key.public_key_sign), 'a challenge for another block')
  assert.ok(!fb.verify(n, assertion(fb.passkeyChallenge(n), 0x04), key.public_key_sign), 'user presence unset')
  for (const flags of [0x01, 0x00]) assert.ok(!fb.verify(n, assertion(fb.passkeyChallenge(n), flags), key.public_key_sign), 'flags ' + flags)
})

test('a private block asks the passkey once: its one signature is over its header, and opens for the header and the body alike', () => {
  const g0 = fb.identity.genesis(key, { audience: 'public', kind: 'person', at: '2026-10-16T12:00:00.000Z' })
  const genesis = { ...g0, signature: assertion(fb.passkeyChallenge(g0)) }
  const bob = fb.generateEncryptionKeypair()
  const n = fb.write('observe', { kind: 'note', text: 'for bob' }, {}, { author: g0.hash, key, blocks: [genesis], at: '2026-10-16T12:00:01.000Z', audience: ['b'.repeat(64)] })
  const { salts, ...draft } = n
  assert.equal(fb.passkeyChallenge(draft), fb.passkeyChallenge(fb.header(draft)), 'the challenge of a private block is its header\'s')
  let asked = 0
  const face = (challenge) => { asked++; return assertion(challenge) }
  const signed = { ...draft, signature: face(fb.passkeyChallenge(draft)) }
  const message = fb.sealCopy(signed, { keys: [bob.public_key_encrypt], reveals: [fb.revealFor(salts, 'b'.repeat(64))] })
  assert.equal(asked, 1, 'one face prompt')
  assert.equal(fb.headerSignedBy(message, key.public_key_sign), true, 'a stranger checks the header alone')
  const opened = fb.openCopy(message, bob.x25519_private)
  assert.deepEqual(fb.valid(opened, [genesis]), [], 'the recipient checks the body with the same signature')
  assert.ok(!fb.verify({ ...draft, state: { ...draft.state, text: 'changed' } }, signed.signature, key.public_key_sign), 'the header names the body, so another body does not open')
})
