// Adds to spec/vectors.json the cases of modules/passkeys.md (a passkey IS the key): `node test/make-vectors-passkey.cjs`.
// Idempotent: a case it made is replaced by name. The test authenticator is a fixed P-256 key that signs real-shaped
// WebAuthn assertions (authenticatorData, clientDataJSON as Chrome writes it, an ASN.1 DER ES256 signature), the way
// navigator.credentials.get() returns them. Every expectation is written here and checked against the Rust core first.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const sha = (x) => crypto.createHash('sha256').update(x).digest()
const seed = sha('foodblock 1.6 passkey vectors: the authenticator').toString('hex')
const key = fb.keypairFromSeed(seed, 'p256')
const other = fb.keypairFromSeed(sha('foodblock 1.6 passkey vectors: another authenticator').toString('hex'), 'p256')
const edKey = fb.keypairFromSeed(sha('foodblock 1.6 passkey vectors: an ed25519 key').toString('hex'))
const point = Buffer.from(key.public_key_sign.slice(-130), 'hex')
const authenticator = crypto.createPrivateKey({
  key: { kty: 'EC', crv: 'P-256', d: Buffer.from(seed, 'hex').toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk'
})
const otherAuthenticator = (() => {
  const p = Buffer.from(other.public_key_sign.slice(-130), 'hex')
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: Buffer.from(other.private_key, 'hex').toString('base64url'), x: p.subarray(1, 33).toString('base64url'), y: p.subarray(33).toString('base64url') }, format: 'jwk' })
})()

// ---- the authenticator ----
const UP = 0x01, UV = 0x04, BE = 0x08, BS = 0x10
function authData({ rp = 'foodx.network', flags = UP | UV, counter = 0, tail } = {}) {
  const n = Buffer.alloc(4); n.writeUInt32BE(counter)
  return Buffer.concat([sha(rp), Buffer.from([flags]), n, ...(tail ? [tail] : [])])
}
const clientData = (challenge, { type = 'webauthn.get', origin = 'https://foodx.network' } = {}) =>
  Buffer.from(`{"type":"${type}","challenge":"${challenge}","origin":"${origin}","crossOrigin":false}`, 'utf8')
// What navigator.credentials.get({ publicKey: { challenge } }) gives back for a challenge, from this authenticator.
function assert_(challenge, { priv = authenticator, auth = authData(), cdj = clientData(challenge) } = {}) {
  const signature = crypto.sign('sha256', Buffer.concat([auth, sha(cdj)]), { key: priv, dsaEncoding: 'der' })
  return { auth, cdj, signature }
}
const wire = (a) => call('passkey_signature', a.auth.toString('hex'), a.cdj.toString('hex'), a.signature.toString('hex'))
const challengeOf = (value) => call('passkey_challenge', value)
const flip = (hex, at) => { const b = Buffer.from(hex, 'hex'); b[at] ^= 1; return b.toString('hex') }

// ---- the vectors file ----
const made = new Set()
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
function door(name, op, args, { expect, codes } = {}) {
  args = JSON.parse(JSON.stringify(args))
  const got = call(op, ...args)
  if (codes) assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  else if (expect !== undefined) {
    const subset = (a, b) => ((b && typeof b === 'object' && !Array.isArray(b)) ? Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b, name), true))
    subset(got, expect)
  }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, ...(codes ? { codes } : { expect: expect !== undefined ? expect : got }) })
  return got
}

// ---- an identity that is a passkey: genesis and a note, both signed by assertions ----
const at = (n) => `2026-10-16T12:00:0${n}.000Z`
const g0 = fb.identity.genesis(key, { kind: 'person', at: at(0) })
const sign = (block, over = {}) => {
  const a = assert_(challengeOf(block), over)
  return { ...block, signature: wire(a) }
}
const genesis = sign(g0)
const note0 = fb.write('observe', { kind: 'note', text: 'signed with a fingerprint' }, {}, { author: g0.hash, key, held: [g0], at: at(1), audience: 'public' })
const note = sign(note0)
const msg = { ...note }
const P = 'passkey: '

// the challenge is the id
door(P + 'the challenge to ask a passkey to sign is the block\'s id as base64url, no padding', 'passkey_challenge', [g0], { expect: Buffer.from(g0.hash, 'hex').toString('base64url') })
assert.equal(challengeOf(g0).length, 43)
door(P + 'a message part\'s challenge is the SHA-256 of its canonical JSON without its signature', 'passkey_challenge', [{ since: 0, limit: 10, signer: key.public_key_sign, signature: 'ignored' }],
  { expect: sha(Buffer.from(call('canonical_json', { limit: 10, since: 0, signer: key.public_key_sign }), 'utf8')).toString('base64url') })

// valid
{ // the same assertion as DER (as an authenticator gives it) and as r||s writes the same wire form
  const a = assert_(challengeOf(g0))
  const der = wire(a), rs = der.slice(0, 128)
  assert.equal(call('passkey_signature', a.auth.toString('hex'), a.cdj.toString('hex'), rs), der)
  door(P + 'a DER signature and the same r then s make the same wire form', 'passkey_signature', [a.auth.toString('hex'), a.cdj.toString('hex'), a.signature.toString('hex')], { expect: der })
  assert.equal(Buffer.from(der, 'hex').subarray(0, 64).length, 64)
}
door(P + 'a genesis signed by a passkey opens', 'verify', [g0, genesis.signature, key.public_key_sign], { expect: true })
door(P + 'a genesis signed by a passkey is valid', 'valid', [genesis, []], { codes: [] })
door(P + 'a note signed by a passkey is valid against its genesis', 'valid', [note, [genesis]], { codes: [] })
door(P + 'the plain 64-byte form of the same key still opens a block', 'verify', [note0, fb.sign(note0, key.private_key, 'p256'), key.public_key_sign], { expect: true })
door(P + 'the id of a block does not depend on how it was signed', 'hash', ['observe', note.state, note.refs, 'p256'], { expect: note.hash })
for (const [what, auth] of [
  ['user verification set', authData({ flags: UP | UV })], ['user verification not set (user presence only)', authData({ flags: UP })],
  ['a counter of zero, as a synced passkey keeps it', authData({ counter: 0 })], ['a counter that went backwards is not looked at', authData({ counter: 1 })],
  ['backup eligible and backed up flags', authData({ flags: UP | UV | BE | BS, counter: 7 })],
  ['extension data after the 37 bytes', authData({ flags: UP | 0x80, tail: Buffer.from('a16b6372656450726f7465637401', 'hex') })]
]) {
  const s = sign(g0, { auth })
  door(P + `${what}: opens`, 'verify', [g0, s.signature, key.public_key_sign], { expect: true })
}
{
  const s = sign(g0, { auth: authData({ counter: 4_000_000_000 }) })
  door(P + 'the counter is not looked at, however large', 'verify', [g0, s.signature, key.public_key_sign], { expect: true })
}
{
  const s = sign(g0, { auth: authData({ rp: 'login.example.org' }) })
  door(P + 'rpIdHash is not checked: another relying party\'s hash opens (the key is the authority, not the origin)', 'verify', [g0, s.signature, key.public_key_sign], { expect: true })
  const o = sign(g0, { cdj: clientData(challengeOf(g0), { origin: 'https://evil.example' }) })
  door(P + 'origin is not checked either', 'verify', [g0, o.signature, key.public_key_sign], { expect: true })
  const x = sign(g0, { cdj: Buffer.from(`{"type":"webauthn.get","challenge":"${challengeOf(g0)}","origin":"https://foodx.network","crossOrigin":true,"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"}`) })
  door(P + 'members of clientDataJSON beyond type and challenge are ignored', 'verify', [g0, x.signature, key.public_key_sign], { expect: true })
  const r = sign(g0, { cdj: Buffer.from(`{ "origin" : "https://foodx.network" , "challenge" : "${challengeOf(g0)}" , "type" : "webauthn.get" }`) })
  door(P + 'clientDataJSON is read as JSON: member order and spaces do not matter', 'verify', [g0, r.signature, key.public_key_sign], { expect: true })
}

// refused
{
  const wrongChallenge = sign(g0, { cdj: clientData(challengeOf(note0)) })
  door(P + 'a challenge for another block does not open (wrong challenge)', 'verify', [g0, wrongChallenge.signature, key.public_key_sign], { expect: false })
  door(P + 'so a genesis with it is refused', 'valid', [{ ...g0, signature: wrongChallenge.signature }, []], { codes: ['bad_genesis'] })
  door(P + 'a note signed for the genesis\'s challenge is refused', 'valid', [{ ...note0, signature: sign(note0, { cdj: clientData(challengeOf(g0)) }).signature }, [genesis]], { codes: ['bad_signature'] })
  const replay = note.signature
  door(P + 'an assertion for one block cannot sign another (no replay)', 'verify', [{ ...note0, state: { ...note0.state, text: 'changed' } }, replay, key.public_key_sign], { expect: false })
  const std = challengeOf(g0)
  const padded = sign(g0, { cdj: clientData(Buffer.from(g0.hash, 'hex').toString('base64') ) })
  door(P + 'a challenge in standard base64 with padding does not open', 'verify', [g0, padded.signature, key.public_key_sign], { expect: false })
  const hexChallenge = sign(g0, { cdj: clientData(g0.hash) })
  door(P + 'a challenge written as hex does not open', 'verify', [g0, hexChallenge.signature, key.public_key_sign], { expect: false })
  void std
  const noUP = sign(g0, { auth: authData({ flags: UV }) })
  door(P + 'user presence not set (UP unset) does not open, though the signature is true', 'verify', [g0, noUP.signature, key.public_key_sign], { expect: false })
  const create = sign(g0, { cdj: clientData(challengeOf(g0), { type: 'webauthn.create' }) })
  door(P + 'clientDataJSON of type webauthn.create does not open', 'verify', [g0, create.signature, key.public_key_sign], { expect: false })
  const dup = sign(g0, { cdj: Buffer.from(`{"type":"webauthn.get","challenge":"AAAA","challenge":"${challengeOf(g0)}","origin":"https://foodx.network"}`) })
  door(P + 'a repeated key in clientDataJSON does not open', 'verify', [g0, dup.signature, key.public_key_sign], { expect: false })
  const notJson = sign(g0, { cdj: Buffer.from('not json') })
  door(P + 'clientDataJSON that is not JSON does not open', 'verify', [g0, notJson.signature, key.public_key_sign], { expect: false })
  const array = sign(g0, { cdj: Buffer.from('[]') })
  door(P + 'clientDataJSON that is not an object does not open', 'verify', [g0, array.signature, key.public_key_sign], { expect: false })
  const short = sign(g0, { auth: authData().subarray(0, 36) })
  door(P + 'authenticatorData shorter than 37 bytes does not open', 'verify', [g0, short.signature, key.public_key_sign], { expect: false })
  const bytes = genesis.signature
  door(P + 'a flipped byte in r does not open', 'verify', [g0, flip(bytes, 3), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in s does not open', 'verify', [g0, flip(bytes, 40), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in authenticatorData (its rpIdHash) does not open: it was signed', 'verify', [g0, flip(bytes, 66), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in the counter does not open', 'verify', [g0, flip(bytes, 66 + 34), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in the flags (UP cleared) does not open', 'verify', [g0, flip(bytes, 66 + 32), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in clientDataJSON does not open', 'verify', [g0, flip(bytes, bytes.length / 2 - 3), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in the challenge does not open', 'verify', [g0, flip(bytes, 66 + 37 + 36), key.public_key_sign], { expect: false })
  door(P + 'a flipped byte in the length does not open', 'verify', [g0, flip(bytes, 65), key.public_key_sign], { expect: false })
  door(P + 'a signature cut short does not open', 'verify', [g0, bytes.slice(0, bytes.length - 2), key.public_key_sign], { expect: false })
  door(P + 'a signature with nothing after the length does not open', 'verify', [g0, bytes.slice(0, 132), key.public_key_sign], { expect: false })
  door(P + 'a signature with a byte added at the end does not open', 'verify', [g0, bytes + '00', key.public_key_sign], { expect: false })
  door(P + 'another key does not open it', 'verify', [g0, bytes, other.public_key_sign], { expect: false })
  const stranger = sign(g0, { priv: otherAuthenticator })
  door(P + 'an assertion by another authenticator does not open', 'verify', [g0, stranger.signature, key.public_key_sign], { expect: false })
  door(P + 'an Ed25519 key never opens the passkey form', 'verify', [g0, bytes, edKey.public_key_sign], { expect: false })
  door(P + 'the odd-length hex does not open', 'verify', [g0, bytes + '0', key.public_key_sign], { expect: false })
  door(P + 'a note signed by another authenticator is refused', 'valid', [{ ...note0, signature: sign(note0, { priv: otherAuthenticator }).signature }, [genesis]], { codes: ['bad_signature'] })
  door(P + 'UP unset on a note is refused', 'valid', [{ ...note0, signature: sign(note0, { auth: authData({ flags: UV }) }).signature }, [genesis]], { codes: ['bad_signature'] })
}

// the wire
{
  const message = door(P + 'a block signed by a passkey travels as a message, its signature one hex string', 'wrap', [note], { expect: { version: '1.6', suite: 'p256', signature: note.signature } })
  door(P + 'unwrapping rebuilds the id and keeps the signature', 'unwrap', [message], { expect: { hash: note.hash, suite: 'p256', signature: note.signature } })
  const cbor = door(P + 'a block signed by a passkey as CBOR: the signature is a longer byte string, after the suite', 'cbor_encode', [note, true])
  door(P + 'it decodes back to the same block and signature', 'cbor_decode', [cbor], { expect: { hash: note.hash, signature: note.signature, suite: 'p256' } })
  const text = cbor
  assert.ok(text.length > 400)
  const pull = fb.sign ? { since: 0, limit: 10, signer: key.public_key_sign, node: g0.hash, counter: 1 } : null
  const ch = challengeOf(pull)
  const a = assert_(ch)
  const signed = { ...pull, signature: wire(a) }
  door(P + 'a signed message part (a pull request) can be signed by a passkey too: the challenge is its canonical JSON without the signature', 'verify_message', [signed, key.public_key_sign], { expect: true })
  door(P + 'a message part changed after signing does not open', 'verify_message', [{ ...signed, limit: 11 }, key.public_key_sign], { expect: false })
}

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} passkey cases written to ${path.relative(process.cwd(), FILE)}`)
