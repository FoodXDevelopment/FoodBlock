// The envelope (spec/protocol.md, Encoding): a sealed copy's plaintext is encrypted under a random content key, which
// is sealed to each recipient's X25519 key (HKDF-SHA256, AES-256-GCM). `seal` encrypts; `sign` (sign.cjs) signs. The
// rules run in the Rust core; the two algs are read from protocol.json.
const { call } = require('./core.cjs')
const { PROTOCOL } = require('./spec.cjs')

const [ALG, ALG_RAW] = PROTOCOL.envelope.read

/** A new encryption key: { public_key_encrypt, x25519_private } (raw 32 bytes, hex). */
const generateEncryptionKeypair = () => call('encryption_keypair')
/** The public encryption key of an X25519 private key (hex). */
const encryptionKeyOf = (privateHex) => call('encryption_key_of', privateHex)
/** Encrypt a value (JSON) to recipients' encryption keys. `fixed` ({ ephemeral, contentKey, nonce, keyNonces }) exists only to reproduce a vector. */
const seal = (value, recipientKeys, { alg = ALG, fixed } = {}) => call('seal', value, recipientKeys || [], alg, fixed)
/** Open an envelope with a recipient's X25519 private key: the value inside. */
const open = (envelope, privateHex) => call('open', envelope, privateHex)

module.exports = { ALG, ALG_RAW, seal, open, generateEncryptionKeypair, encryptionKeyOf }
