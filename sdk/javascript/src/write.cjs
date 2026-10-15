// Writing a block and carrying it (core.md sections 5 and 6, modules/privacy.md). `compose` stamps an author's words
// with what every block carries; `write` is the one path every writer shares: compose, check, sign, chain. On the wire
// a public block is { version, block, signature }; a sealed one is { version, header, header_signature, envelope }.
// The rules run in the Rust core; this module gives them JavaScript's option names.
const { call, list } = require('./core.cjs')
const { VERSION } = require('./spec.cjs')

const PUBLIC = 'public'

// The options compose and write share, as the door takes them.
const composing = ({ author, audience = PUBLIC, after = [], at, clockless, link, salts, nonce, suite, skip } = {}) =>
  ({ author, audience: audience === PUBLIC ? [] : audience, after, at, clockless: Boolean(clockless), link, salts: salts || null, nonce, suite, skip: Boolean(skip) })

/**
 * A block as its author says it: `link` ({ seq, prev }), `audience` ('public', or recipients), `after` (heads seen),
 * `at`. A private block comes back with its salts beside it (`salts`), never signed.
 */
const compose = (type, state = {}, refs = {}, options = {}) => call('compose', type, state, refs, composing(options))

/**
 * The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place in
 * that key's chain among `held`. Returns the signed block; throws with every reason when the check refuses.
 */
function write(type, state, refs, { key, held = [], schemas, ...options } = {}) {
  return call('write', type, state, refs, { ...composing(options), key, held: list(held), ...(schemas ? { schemas: list(schemas) } : {}) })
}

// ---- Messages ----
/** A signed public block as it travels: { version, block, signature }, and `suite` when it is not std. */
const wrap = (signed, version = VERSION) => ({ ...call('wrap', signed), version })
/** A block off the wire: its hash recomputed from its content, its signature and version kept beside. */
const unwrap = (message) => call('unwrap', message)
/** A block's public header: { author, seq, prev, hash }. */
const header = (block) => call('header', block)
/** A sealed copy: { version, header, header_signature, envelope }. */
function sealCopy(signed, { keys, reveals = [], privateKey, suite = 'std', fixed } = {}) {
  return call('seal_copy', signed, keys || [], reveals, privateKey, fixed, suite)
}
/** Whether a sealed copy's header is signed by this key (the key that signed the block). */
const headerSignedBy = (message, publicKey) => call('header_signed_by', message, String(publicKey))
/** Open a sealed copy with a recipient's private encryption key: the block, its signature and its reveals. */
const openCopy = (message, x25519Private) => call('open_copy', message, x25519Private)

module.exports = { PUBLIC, compose, write, wrap, unwrap, header, sealCopy, headerSignedBy, openCopy }
