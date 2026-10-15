// Signing (spec/protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of { type, state, refs }. Keys and
// signatures are lowercase hex. `sign` signs; `seal` (envelope.cjs) encrypts. The rules run in the Rust core.
const { call } = require('./core.cjs')

/** A new signing key: { public_key_sign, private_key } (hex). */
const generateKeypair = () => call('keypair')
/** The signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt. */
const keypairFromSeed = (seedHex) => call('keypair', seedHex)
/** The author's signature over a block's canonical form: hex. */
const sign = (block, privateKeyHex) => call('sign', block, privateKeyHex)
/** Whether a signature is this key's over exactly this block. Never throws. */
const verify = (block, signature, publicKeyHex) => call('verify', block, String(signature), String(publicKeyHex))
/** A message part, signed: the part with `signature` added (over its canonical JSON without `signature`). */
const signMessage = (part, privateKeyHex) => call('sign_message', part, privateKeyHex)
/** Whether a signed message part's `signature` is this key's. Never throws. */
const verifyMessage = (part, publicKeyHex) => call('verify_message', part || {}, String(publicKeyHex))

module.exports = { generateKeypair, keypairFromSeed, sign, verify, signMessage, verifyMessage }
