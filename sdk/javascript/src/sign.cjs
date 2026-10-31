// Signing (core.md, Suites): a signature over the canonical UTF-8 bytes of { type, state, refs }, by the algorithm of the
// signing key's suite (std: Ed25519, p256: ECDSA P-256, sm: SM2 with SM3). Keys and signatures are lowercase hex. `sign`
// signs; `seal` (envelope.cjs) encrypts. The rules run in the Rust core.
const door = require('./door.cjs')

/** A new signing key: { public_key_sign, private_key } (hex), and `suite` when it is not std. */
const generateKeypair = (suite) => door.keypair(null, suite)
/** The signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt. */
const keypairFromSeed = door.keypair
/** The author's signature over a block's canonical form: hex. `suite` is the suite of the signing key. */
const sign = door.sign
/** Whether a signature is this key's over exactly this block. Never throws. */
const verify = (block, signature, publicKeyHex) => door.verify(block, String(signature), String(publicKeyHex))
/** A message part, signed: the part with `signature` added (over its canonical JSON without `signature`). */
const signMessage = door.signMessage
/** Whether a signed message part's `signature` is this key's. Never throws. */
const verifyMessage = (part, publicKeyHex) => door.verifyMessage(part || {}, String(publicKeyHex))

/**
 * The challenge to ask a passkey to sign (navigator.credentials.get({ publicKey: { challenge } })): base64url of the
 * SHA-256 of the signed bytes, which for a block is its id. Takes a block, or a message part (modules/encoding.md, Passkeys).
 */
const passkeyChallenge = door.passkeyChallenge
/**
 * A passkey's answer as a FoodBlock signature (hex): `authenticatorData`, `clientDataJSON` and the signature are the bytes
 * of the WebAuthn response, each as hex. The signature may be DER, as the authenticator gives it. `verify` and `valid` open it.
 */
const passkeySignature = (authenticatorDataHex, clientDataJsonHex, signatureHex) => door.passkeySignature(String(authenticatorDataHex), String(clientDataJsonHex), String(signatureHex))

/** The suite a signing key (SPKI hex) belongs to, or null. */
const suiteOfKey = (publicKeyHex) => door.suiteOfKey(String(publicKeyHex))

module.exports = { passkeyChallenge, passkeySignature, suiteOfKey, generateKeypair, keypairFromSeed, sign, verify, signMessage, verifyMessage }
