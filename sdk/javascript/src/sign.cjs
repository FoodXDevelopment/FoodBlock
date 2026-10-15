// Signing (spec/protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of { type, state, refs }. A signing key
// is its SPKI DER bytes in lowercase hex; a signature the 64-byte signature in lowercase hex. `sign` signs; `seal`
// (envelope.cjs) encrypts. A signed message part is signed over its canonical JSON without its `signature` key.
const crypto = require('crypto')
const { canonical, canonicalJSON } = require('./canonical.cjs')

const PKCS8_ED25519 = '302e020100300506032b657004220420'
const privateKeyOf = (hex) => crypto.createPrivateKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'pkcs8' })
const publicKeyOf = (hex) => crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' })
const keypairOf = (privateKey) => ({
  public_key_sign: crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('hex'),
  private_key: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex')
})

/** A new signing key: { public_key_sign, private_key } (hex). */
const generateKeypair = () => keypairOf(crypto.generateKeyPairSync('ed25519').privateKey)

/** The signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt. */
const keypairFromSeed = (seedHex) => keypairOf(privateKeyOf(PKCS8_ED25519 + seedHex))

const bytes = (block) => Buffer.from(canonical(block.type, block.state, block.refs), 'utf8')

/** The author's signature over a block's canonical form: hex. */
const sign = (block, privateKeyHex) => crypto.sign(null, bytes(block), privateKeyOf(privateKeyHex)).toString('hex')

/** Whether a signature is this key's over exactly this block. Never throws. */
function verify(block, signature, publicKeyHex) {
  try { return crypto.verify(null, bytes(block), publicKeyOf(publicKeyHex), Buffer.from(String(signature), 'hex')) } catch { return false }
}

/** A message part, signed: the part with `signature` added (over its canonical JSON without `signature`). */
function signMessage(part, privateKeyHex) {
  const { signature: _old, ...rest } = part
  return { ...rest, signature: crypto.sign(null, Buffer.from(canonicalJSON(rest), 'utf8'), privateKeyOf(privateKeyHex)).toString('hex') }
}

/** Whether a signed message part's `signature` is this key's. Never throws. */
function verifyMessage(part, publicKeyHex) {
  const { signature, ...rest } = part || {}
  try { return crypto.verify(null, Buffer.from(canonicalJSON(rest), 'utf8'), publicKeyOf(publicKeyHex), Buffer.from(String(signature), 'hex')) } catch { return false }
}

module.exports = { generateKeypair, keypairFromSeed, sign, verify, signMessage, verifyMessage }
