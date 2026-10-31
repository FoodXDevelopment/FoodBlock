// A block: its canonical form and its id. The rules run in the Rust core (core.cjs).
const door = require('./door.cjs')

/** Create a new FoodBlock: { hash, type, state, refs }, its id in the hash of `suite` (the signing key's). Strict writing: a null, a float, an unsorted set or text outside NFC is refused. */
const create = (type, state = {}, refs = {}, suite) => door.create(type, state, refs, suite)

/** The id of a block: the hash of its canonical form in the hash of the suite of the key that signed it (SHA-256 bare, `sm3:...`). */
const hash = (type, state = {}, refs = {}, suite) => door.hash(type, state, refs, suite)

/** A block's id: in the suite of the key that signed it, that key found among `held` (core.md, section 2); without `held`, in the suite the
 * block shows (a genesis's own, else as its prev is hashed). */
const idOf = (block, held) => (held === undefined ? door.idOf(block) : door.idOf(block, require('./core.cjs').list(held)))

module.exports = { create, hash, idOf }
