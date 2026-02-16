const crypto = require('crypto')
const { canonical } = require('./canonical')

/**
 * Generate a new Ed25519 keypair for signing FoodBlocks.
 * Returns { publicKey, privateKey } as hex strings.
 */
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex')
  }
}

/**
 * Sign a FoodBlock.
 * Returns the authentication wrapper: { foodblock, author_hash, signature }
 */
function sign(block, authorHash, privateKeyHex) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8'
  })

  const content = canonical(block.type, block.state, block.refs)
  const signature = crypto.sign(null, Buffer.from(content, 'utf8'), privateKey)

  return {
    foodblock: block,
    author_hash: authorHash,
    signature: signature.toString('hex')
  }
}

/**
 * Verify a signed FoodBlock wrapper.
 * Returns true if the signature is valid.
 */
function verify(wrapper, publicKeyHex) {
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyHex, 'hex'),
    format: 'der',
    type: 'spki'
  })

  const { foodblock, signature } = wrapper
  const content = canonical(foodblock.type, foodblock.state, foodblock.refs)

  return crypto.verify(
    null,
    Buffer.from(content, 'utf8'),
    publicKey,
    Buffer.from(signature, 'hex')
  )
}

module.exports = { generateKeypair, sign, verify }
