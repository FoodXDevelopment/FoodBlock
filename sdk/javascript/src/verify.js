const crypto = require('crypto')
const { canonical } = require('./canonical')

const PROTOCOL_VERSION = '0.4.0'

// DER prefixes for Ed25519 key encoding
// PKCS8 prefix for Ed25519 private key (wraps 32-byte seed)
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
// SPKI prefix for Ed25519 public key (wraps 32-byte key)
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/**
 * Generate a new Ed25519 keypair for signing FoodBlocks.
 * Returns { publicKey, privateKey } as hex strings (raw 32-byte format).
 * This format is cross-language compatible with Python, Go, and Swift SDKs.
 */
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

  // Export as raw 32-byte keys (strip DER envelope)
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })

  return {
    publicKey: pubDer.subarray(pubDer.length - 32).toString('hex'),
    privateKey: privDer.subarray(privDer.length - 32).toString('hex')
  }
}

/**
 * Sign a FoodBlock.
 * Returns the authentication wrapper: { foodblock, author_hash, signature, protocol_version }
 *
 * @param {object} block - The FoodBlock to sign
 * @param {string} authorHash - Hash of the author's actor block
 * @param {string} privateKeyHex - Raw 32-byte Ed25519 private key seed as hex
 */
function sign(block, authorHash, privateKeyHex) {
  const privateKey = rawPrivateKeyToKeyObject(privateKeyHex)

  const content = canonical(block.type, block.state, block.refs)
  const signature = crypto.sign(null, Buffer.from(content, 'utf8'), privateKey)

  return {
    foodblock: block,
    author_hash: authorHash,
    signature: signature.toString('hex'),
    protocol_version: PROTOCOL_VERSION
  }
}

/**
 * Verify a signed FoodBlock wrapper.
 * Returns true if the signature is valid.
 *
 * @param {object} wrapper - { foodblock, author_hash, signature }
 * @param {string} publicKeyHex - Raw 32-byte Ed25519 public key as hex
 */
function verify(wrapper, publicKeyHex) {
  const publicKey = rawPublicKeyToKeyObject(publicKeyHex)

  const { foodblock, signature } = wrapper
  const content = canonical(foodblock.type, foodblock.state, foodblock.refs)

  return crypto.verify(
    null,
    Buffer.from(content, 'utf8'),
    publicKey,
    Buffer.from(signature, 'hex')
  )
}

/**
 * Convert a raw 32-byte private key hex to a Node.js KeyObject.
 */
function rawPrivateKeyToKeyObject(hex) {
  const seed = Buffer.from(hex, 'hex')
  if (seed.length !== 32) {
    throw new Error(`FoodBlock: private key must be 32 bytes, got ${seed.length}`)
  }
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8'
  })
}

/**
 * Convert a raw 32-byte public key hex to a Node.js KeyObject.
 */
function rawPublicKeyToKeyObject(hex) {
  const raw = Buffer.from(hex, 'hex')
  if (raw.length !== 32) {
    throw new Error(`FoodBlock: public key must be 32 bytes, got ${raw.length}`)
  }
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: 'der',
    type: 'spki'
  })
}

module.exports = { generateKeypair, sign, verify }
