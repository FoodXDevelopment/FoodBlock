const crypto = require('crypto')

// DER prefixes for X25519 key encoding
const PKCS8_X25519_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')
const SPKI_X25519_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')

/**
 * Convert a raw 32-byte X25519 private key hex to a Node.js KeyObject.
 */
function rawX25519PrivateToKeyObject(hex) {
  const seed = Buffer.from(hex, 'hex')
  if (seed.length !== 32) {
    throw new Error(`FoodBlock: X25519 private key must be 32 bytes, got ${seed.length}`)
  }
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_X25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8'
  })
}

/**
 * Convert a raw 32-byte X25519 public key hex to a Node.js KeyObject.
 */
function rawX25519PublicToKeyObject(hex) {
  const raw = Buffer.from(hex, 'hex')
  if (raw.length !== 32) {
    throw new Error(`FoodBlock: X25519 public key must be 32 bytes, got ${raw.length}`)
  }
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_X25519_PREFIX, raw]),
    format: 'der',
    type: 'spki'
  })
}

/**
 * Encrypt a value for multiple recipients using envelope encryption.
 *
 * Uses X25519 key agreement + AES-256-GCM symmetric encryption.
 * Keys are raw 32-byte format (hex), cross-language compatible.
 *
 * @param {any} value - The value to encrypt (will be JSON-serialized)
 * @param {string[]} recipientPublicKeys - Array of recipient X25519 public keys (hex, raw 32-byte)
 * @returns {object} - Encryption envelope per Section 7.2
 */
function encrypt(value, recipientPublicKeys) {
  if (!recipientPublicKeys || recipientPublicKeys.length === 0) {
    throw new Error('FoodBlock: at least one recipient public key is required')
  }

  const plaintext = JSON.stringify(value)

  // Generate a random content key (256-bit)
  const contentKey = crypto.randomBytes(32)
  const nonce = crypto.randomBytes(12)

  // Encrypt the value with the content key
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64')

  // Generate ephemeral X25519 keypair for ECDH
  const { publicKey: ephPub, privateKey: ephPriv } = crypto.generateKeyPairSync('x25519')
  const ephPubDer = ephPub.export({ type: 'spki', format: 'der' })
  const ephemeralPublicHex = ephPubDer.subarray(ephPubDer.length - 32).toString('hex')

  const recipients = recipientPublicKeys.map(pubKeyHex => {
    const recipientKey = rawX25519PublicToKeyObject(pubKeyHex)

    // Derive shared secret via ECDH
    const sharedSecret = crypto.diffieHellman({
      privateKey: ephPriv,
      publicKey: recipientKey
    })

    // Use shared secret to encrypt the content key
    const keyNonce = crypto.randomBytes(12)
    const keyCipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, keyNonce)
    const encryptedKey = Buffer.concat([
      keyCipher.update(contentKey),
      keyCipher.final(),
      keyCipher.getAuthTag(),
      keyNonce
    ])

    const keyHash = crypto.createHash('sha256').update(Buffer.from(pubKeyHex, 'hex')).digest('hex')

    return {
      key_hash: keyHash,
      encrypted_key: encryptedKey.toString('base64')
    }
  })

  return {
    alg: 'x25519-aes-256-gcm',
    ephemeral_key: ephemeralPublicHex,
    recipients,
    nonce: nonce.toString('base64'),
    ciphertext
  }
}

/**
 * Decrypt an encryption envelope.
 *
 * @param {object} envelope - The encryption envelope
 * @param {string} privateKeyHex - Recipient's X25519 private key (hex, raw 32-byte)
 * @param {string} publicKeyHex - Recipient's X25519 public key (hex, raw 32-byte, for key_hash matching)
 * @returns {any} - The decrypted value (JSON-parsed)
 */
function decrypt(envelope, privateKeyHex, publicKeyHex) {
  const keyHash = crypto.createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex')

  const recipient = envelope.recipients.find(r => r.key_hash === keyHash)
  if (!recipient) {
    throw new Error('FoodBlock: no matching recipient entry found for this key')
  }

  // Reconstruct the ephemeral public key from raw 32-byte hex
  const ephemeralKey = rawX25519PublicToKeyObject(envelope.ephemeral_key)
  const privateKey = rawX25519PrivateToKeyObject(privateKeyHex)

  // Derive shared secret
  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: ephemeralKey
  })

  // Decrypt the content key
  const encryptedKeyBuf = Buffer.from(recipient.encrypted_key, 'base64')
  const keyNonce = encryptedKeyBuf.subarray(encryptedKeyBuf.length - 12)
  const keyAuthTag = encryptedKeyBuf.subarray(encryptedKeyBuf.length - 28, encryptedKeyBuf.length - 12)
  const keyData = encryptedKeyBuf.subarray(0, encryptedKeyBuf.length - 28)

  const keyDecipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, keyNonce)
  keyDecipher.setAuthTag(keyAuthTag)
  const contentKey = Buffer.concat([keyDecipher.update(keyData), keyDecipher.final()])

  // Decrypt the ciphertext
  const ciphertextBuf = Buffer.from(envelope.ciphertext, 'base64')
  const contentNonce = Buffer.from(envelope.nonce, 'base64')
  const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16)
  const data = ciphertextBuf.subarray(0, ciphertextBuf.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', contentKey, contentNonce)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')

  return JSON.parse(plaintext)
}

/**
 * Generate an X25519 keypair for encryption.
 * Returns { publicKey, privateKey } as hex strings (raw 32-byte format).
 * Cross-language compatible with Python SDK.
 */
function generateEncryptionKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')

  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })

  return {
    publicKey: pubDer.subarray(pubDer.length - 32).toString('hex'),
    privateKey: privDer.subarray(privDer.length - 32).toString('hex')
  }
}

module.exports = { encrypt, decrypt, generateEncryptionKeypair }
