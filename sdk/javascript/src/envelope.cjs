// The envelope (modules/privacy.md): a sealed copy's plaintext is encrypted under a random content key, which is sealed
// to each recipient's encryption key by the suite's key agreement and cipher (std: X25519, HKDF-SHA256, AES-256-GCM;
// p256: ECDH P-256; sm: ECDH SM2, HKDF-SM3, SM4-GCM). `seal` encrypts; `sign` (sign.cjs) signs. The rules run in the Rust core.
const { call } = require('./core.cjs')
const { PROTOCOL } = require('./spec.cjs')

const ALG = PROTOCOL.suites.std.envelope

/** A new encryption key: { public_key_encrypt, x25519_private } (the raw private scalar, hex) in a suite. */
const generateEncryptionKeypair = (suite = 'std') => call('encryption_keypair', suite)
/** The public encryption key of a private key (hex) in a suite. */
const encryptionKeyOf = (privateHex, suite = 'std') => call('encryption_key_of', privateHex, suite)
/** Encrypt a value (JSON) to recipients' encryption keys in a suite. `fixed` ({ ephemeral, contentKey, nonce, keyNonces }) exists only to reproduce a vector. */
const seal = (value, recipientKeys, { suite = 'std', fixed } = {}) => call('seal', value, recipientKeys || [], suite, fixed)
/** Open an envelope with a recipient's private key: the value inside. */
const open = (envelope, privateHex) => call('open', envelope, privateHex)

module.exports = { ALG, seal, open, generateEncryptionKeypair, encryptionKeyOf }
