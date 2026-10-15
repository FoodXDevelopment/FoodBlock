// The envelope (spec/protocol.md, Encoding): a sealed copy's plaintext is encrypted with AES-256-GCM under a random
// 32-byte content key and a 12-byte nonce, no additional data. A fresh X25519 key per envelope agrees a secret with
// each recipient's key; HKDF-SHA256 (salted with the ephemeral public key's bytes then the recipient's, info
// `foodblock envelope key`) turns it into the key that seals the content key, with its own 12-byte nonce. The envelope
// names no recipient: each recipient tries every entry. `seal` encrypts; `sign` (sign.cjs) signs.
//   ALG      x25519-hkdf-sha256-aes-256-gcm  written now
//   ALG_RAW  x25519-aes-256-gcm              read forever: the agreed secret itself sealed the content key
// An older envelope's `key_hash` is ignored (aliases.json `envelope`).
const crypto = require('crypto')
const { PROTOCOL } = require('./spec.cjs')

const [ALG, ALG_RAW] = PROTOCOL.envelope.read
if (PROTOCOL.envelope.write !== ALG) throw new Error('envelope: protocol.json writes the first alg it reads')
const HKDF_INFO = Buffer.from(PROTOCOL.envelope.hkdf_info, 'utf8')
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex')
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')

const raw = (hex, length, what) => { const buf = Buffer.from(String(hex), 'hex'); if (buf.length !== length) throw new Error(`envelope: ${what} is ${length} bytes`); return buf }
const privateX = (hex) => crypto.createPrivateKey({ key: Buffer.concat([PKCS8_X25519, raw(hex, 32, 'an X25519 private key')]), format: 'der', type: 'pkcs8' })
const publicX = (hex) => crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519, raw(hex, 32, 'an X25519 public key')]), format: 'der', type: 'spki' })
const publicHexOf = (privateKey) => { const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }); return der.subarray(der.length - 32).toString('hex') }

/** A new encryption key: { public_key_encrypt, x25519_private } (raw 32 bytes, hex). */
function generateEncryptionKeypair() {
  const { privateKey } = crypto.generateKeyPairSync('x25519')
  const der = privateKey.export({ type: 'pkcs8', format: 'der' })
  return { public_key_encrypt: publicHexOf(privateKey), x25519_private: der.subarray(der.length - 32).toString('hex') }
}
/** The public encryption key of an X25519 private key (hex). */
const encryptionKeyOf = (privateHex) => publicHexOf(privateX(privateHex))

function sealingKey(alg, secret, ephemeralHex, recipientHex) {
  if (alg === ALG_RAW) return secret
  if (alg !== ALG) throw new Error(`envelope: unknown alg ${alg}`)
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.concat([Buffer.from(ephemeralHex, 'hex'), Buffer.from(recipientHex, 'hex')]), HKDF_INFO, 32))
}
const gcm = (key, nonce, data) => { const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce); return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]) }
const ungcm = (key, nonce, sealed) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(sealed.subarray(sealed.length - 16))
  return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()])
}

/**
 * Encrypt a value (JSON) to recipients' encryption keys: { alg, ephemeral_key, nonce, ciphertext, recipients:
 * [{ encrypted_key }] }. `fixed` ({ ephemeral, contentKey, nonce, keyNonces }) exists only to reproduce a vector.
 */
function seal(value, recipientKeys, { alg = ALG, fixed = {} } = {}) {
  if (!recipientKeys?.length) throw new Error('envelope: at least one recipient key')
  const contentKey = fixed.contentKey ? Buffer.from(fixed.contentKey, 'hex') : crypto.randomBytes(32)
  const nonce = fixed.nonce ? Buffer.from(fixed.nonce, 'hex') : crypto.randomBytes(12)
  const ephemeral = fixed.ephemeral ? privateX(fixed.ephemeral) : crypto.generateKeyPairSync('x25519').privateKey
  const ephemeralHex = publicHexOf(ephemeral)
  const recipients = recipientKeys.map((key, i) => {
    const keyNonce = fixed.keyNonces?.[i] ? Buffer.from(fixed.keyNonces[i], 'hex') : crypto.randomBytes(12)
    const secret = crypto.diffieHellman({ privateKey: ephemeral, publicKey: publicX(key) })
    return { encrypted_key: Buffer.concat([gcm(sealingKey(alg, secret, ephemeralHex, key), keyNonce, contentKey), keyNonce]).toString('base64') }
  })
  return { alg, ephemeral_key: ephemeralHex, nonce: nonce.toString('base64'), ciphertext: gcm(contentKey, nonce, Buffer.from(JSON.stringify(value), 'utf8')).toString('base64'), recipients }
}

/** Open an envelope with a recipient's X25519 private key: the value inside. Every entry is tried; none names its recipient. */
function open(envelope, privateHex) {
  const privateKey = privateX(privateHex), mine = publicHexOf(privateKey)
  const secret = crypto.diffieHellman({ privateKey, publicKey: publicX(envelope.ephemeral_key) })
  const key = sealingKey(envelope.alg || ALG_RAW, secret, envelope.ephemeral_key, mine)
  for (const entry of envelope.recipients || []) {
    const sealed = Buffer.from(entry.encrypted_key, 'base64')
    let contentKey
    try { contentKey = ungcm(key, sealed.subarray(sealed.length - 12), sealed.subarray(0, sealed.length - 12)) } catch { continue }
    return JSON.parse(ungcm(contentKey, Buffer.from(envelope.nonce, 'base64'), Buffer.from(envelope.ciphertext, 'base64')).toString('utf8'))
  }
  throw new Error('envelope: no entry opens with this key')
}


module.exports = { ALG, ALG_RAW, seal, open, generateEncryptionKeypair, encryptionKeyOf }
