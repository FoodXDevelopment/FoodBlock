// A passkey is a FoodBlock key (spec/modules/passkeys.md): a WebAuthn assertion from a test authenticator opens a block.
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
  const auth = Buffer.concat([sha('foodx.world'), Buffer.from([flags, 0, 0, 0, 1])])
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://foodx.world', crossOrigin: false }))
  const der = crypto.sign('sha256', Buffer.concat([auth, sha(cdj)]), { key: device, dsaEncoding: 'der' })
  return fb.passkeySignature(auth.toString('hex'), cdj.toString('hex'), der.toString('hex'))
}

test('a passkey signs a genesis and a note, and the plain form of the same key still works', () => {
  const g0 = fb.identity.genesis(key, { kind: 'person', at: '2026-10-16T12:00:00.000Z' })
  assert.equal(fb.passkeyChallenge(g0), Buffer.from(g0.hash, 'hex').toString('base64url'))
  const genesis = { ...g0, signature: assertion(fb.passkeyChallenge(g0)) }
  assert.ok(fb.verify(g0, genesis.signature, key.public_key_sign))
  assert.deepEqual(fb.valid(genesis, []), [])
  const n = fb.write('observe', { kind: 'note', text: 'hi' }, {}, { author: g0.hash, key, held: [g0], at: '2026-10-16T12:00:01.000Z', audience: 'public' })
  const note = { ...n, signature: assertion(fb.passkeyChallenge(n)) }
  assert.deepEqual(fb.valid(note, [genesis]), [])
  assert.deepEqual(fb.valid(n, [genesis]), [])
  assert.ok(!fb.verify(n, assertion(fb.passkeyChallenge(g0)), key.public_key_sign), 'a challenge for another block')
  assert.ok(!fb.verify(n, assertion(fb.passkeyChallenge(n), 0x04), key.public_key_sign), 'user presence unset')
})
