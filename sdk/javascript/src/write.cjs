// Writing a block and carrying it (core.md sections 5 and 6, modules/privacy.md). `compose` stamps an author's words
// with what every block carries; `write` is the one path every writer shares: compose, check, sign, chain. On the wire
// a public block is { block, signature }; a sealed one is { header, header_signature, envelope }. It fills nothing in the author's
// silence: `audience` ('public' or recipients) and `at` (or `clockless: true`) are stated, or the core refuses.
// The rules run in the Rust core; this module gives them JavaScript's option names.
const door = require('./door.cjs')
const { list } = require('./core.cjs')

const PUBLIC = 'public'

// The options compose and write share, as the door takes them.
const composing = ({ author, audience, after = [], at, clockless, link, salts, nonce, suite, skip } = {}) =>
  ({ author, audience, after, at, clockless: Boolean(clockless), link, salts: salts || null, nonce, suite, skip: Boolean(skip) })

/**
 * A block as its author says it: `link` ({ seq, prev }), `audience` ('public', or recipients; required), `after` (heads seen),
 * `at` (required unless `clockless`). A private block comes back with its salts beside it (`salts`), never signed.
 */
const compose = (type, state = {}, refs = {}, options = {}) => door.compose(type, state, refs, composing(options))

/**
 * The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place in
 * that key's chain among `held`. Returns the signed block; throws with every reason when the check refuses.
 */
function write(type, state, refs, { key, held = [], schemas, ...options } = {}) {
  return door.write(type, state, refs, { ...composing(options), key, held: list(held), ...(schemas ? { schemas: list(schemas) } : {}) })
}

// ---- Messages ----
/** A signed public block as it travels: { block, signature }. It never names a suite or a version (core.md, sections 2 and 6). */
const wrap = door.wrap
/** A block off the wire: its hash recomputed from its content, in the suite of the key that signed it (found among `held`, the author's
 * blocks; without it, the suite the block shows), its signature kept beside. A message that names a suite or carries a version is refused. */
const unwrap = (message, held) => (held === undefined ? door.unwrap(message) : door.unwrap(message, list(held)))
/** A block's public header: { author, seq, prev, hash }. */
const header = door.header
/** A sealed copy: { header, header_signature, envelope }. */
function sealCopy(signed, { keys, reveals = [], privateKey, suite, fixed } = {}) {
  return door.sealCopy(signed, keys || [], reveals, privateKey, fixed, suite)
}
/** Whether a sealed copy's header is signed by this key (the key that signed the block). */
const headerSignedBy = (message, publicKey) => door.headerSignedBy(message, String(publicKey))
/** Open a sealed copy with a recipient's private encryption key: the block, its signature and its reveals. */
const openCopy = door.openCopy

module.exports = { PUBLIC, compose, write, wrap, unwrap, header, sealCopy, headerSignedBy, openCopy }
