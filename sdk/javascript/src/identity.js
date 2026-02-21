/**
 * FoodBlock Consumer Identity (Implementation Paper §2)
 *
 * Custodial key management: key generation, encrypted storage,
 * key rotation, key recovery, multi-device sync.
 */

const crypto = require('crypto')
const { create, update } = require('./block')
const { generateKeypair, sign } = require('./verify')
const { generateEncryptionKeypair } = require('./encrypt')

const PBKDF2_ITERATIONS = 600000
const PBKDF2_KEY_LENGTH = 32
const PBKDF2_DIGEST = 'sha256'

/**
 * Create a new consumer identity: actor block + encrypted keystore.
 *
 * @param {string} name - Display name
 * @param {string} password - User's password (for key derivation)
 * @param {object} [opts] - { deviceId }
 * @returns {object} { actorBlock, signedActor, keystore, publicKeys, privateKeys }
 */
function createIdentity(name, password, opts = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('FoodBlock: name is required')
  }
  if (!password || typeof password !== 'string') {
    throw new Error('FoodBlock: password is required')
  }

  const signKeys = generateKeypair()
  const encryptKeys = generateEncryptionKeypair()
  const deviceId = opts.deviceId || crypto.randomUUID()

  const actorBlock = create('actor', {
    name,
    public_key_sign: signKeys.publicKey,
    public_key_encrypt: encryptKeys.publicKey
  })

  const signed = sign(actorBlock, actorBlock.hash, signKeys.privateKey)

  const keystore = encryptKeystore({
    sign_private: signKeys.privateKey,
    encrypt_private: encryptKeys.privateKey
  }, password, deviceId)

  return {
    actorBlock,
    signedActor: signed,
    keystore,
    publicKeys: {
      sign: signKeys.publicKey,
      encrypt: encryptKeys.publicKey
    },
    privateKeys: {
      sign: signKeys.privateKey,
      encrypt: encryptKeys.privateKey
    }
  }
}

/**
 * Encrypt private keys for storage using a password-derived key.
 *
 * @param {object} keys - { sign_private, encrypt_private }
 * @param {string} password - User's password
 * @param {string} deviceId - Device identifier
 * @returns {object} Encrypted keystore blob
 */
function encryptKeystore(keys, password, deviceId) {
  const salt = crypto.randomBytes(32)
  const derivedKey = crypto.pbkdf2Sync(
    password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST
  )

  const nonce = crypto.randomBytes(12)
  const plaintext = JSON.stringify(keys)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted_keys: Buffer.concat([encrypted, authTag]).toString('base64'),
    key_derivation: {
      algorithm: 'PBKDF2',
      iterations: PBKDF2_ITERATIONS,
      salt: salt.toString('hex')
    },
    nonce: nonce.toString('base64'),
    device_id: deviceId,
    created_at: new Date().toISOString()
  }
}

/**
 * Decrypt a keystore using the user's password.
 *
 * @param {object} keystore - Encrypted keystore from encryptKeystore()
 * @param {string} password - User's password
 * @returns {object} { sign_private, encrypt_private }
 */
function decryptKeystore(keystore, password) {
  const salt = Buffer.from(keystore.key_derivation.salt, 'hex')
  const derivedKey = crypto.pbkdf2Sync(
    password, salt, keystore.key_derivation.iterations, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST
  )

  const nonce = Buffer.from(keystore.nonce, 'base64')
  const ciphertextBuf = Buffer.from(keystore.encrypted_keys, 'base64')
  const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16)
  const data = ciphertextBuf.subarray(0, ciphertextBuf.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, nonce)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')

  return JSON.parse(plaintext)
}

/**
 * Rotate keys: create new keypair, produce a key_rotation block signed by old key.
 *
 * @param {string} actorHash - The actor's block hash
 * @param {string} oldPrivateKey - Current private key (hex)
 * @param {string} oldPublicKey - Current public key (hex)
 * @param {string} reason - Rotation reason
 * @returns {object} { rotationBlock, signedRotation, newActorBlock, newKeys }
 */
function rotateKeys(actorHash, oldPrivateKey, oldPublicKey, reason = 'scheduled') {
  const newSignKeys = generateKeypair()
  const newEncryptKeys = generateEncryptionKeypair()

  const rotationBlock = create('observe.key_rotation', {
    old_public_key: oldPublicKey,
    new_public_key: newSignKeys.publicKey,
    new_encrypt_key: newEncryptKeys.publicKey,
    reason,
    rotated_at: new Date().toISOString()
  }, { actor: actorHash })

  const signedRotation = sign(rotationBlock, actorHash, oldPrivateKey)

  const newActorBlock = update(actorHash, 'actor', {
    public_key_sign: newSignKeys.publicKey,
    public_key_encrypt: newEncryptKeys.publicKey
  })

  return {
    rotationBlock,
    signedRotation,
    newActorBlock,
    newKeys: {
      sign: newSignKeys,
      encrypt: newEncryptKeys
    }
  }
}

/**
 * Create a key recovery block (for audit trail).
 *
 * @param {string} actorHash - The actor's block hash
 * @param {string} deviceId - New device ID
 * @param {string} method - Recovery method used
 * @returns {object} The recovery FoodBlock
 */
function createRecoveryBlock(actorHash, deviceId, method = 'password_backup') {
  return create('observe.key_recovery', {
    device_id: deviceId,
    method,
    recovered_at: new Date().toISOString()
  }, { actor: actorHash })
}

module.exports = {
  createIdentity,
  encryptKeystore,
  decryptKeystore,
  rotateKeys,
  createRecoveryBlock,
  PBKDF2_ITERATIONS
}
