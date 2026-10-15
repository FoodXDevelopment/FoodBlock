// A block: its canonical form and its id. The rules run in the Rust core (core.cjs).
const { call } = require('./core.cjs')

/** Create a new FoodBlock: { hash, type, state, refs } (and `suite` when it is not std). Strict writing: a null, a float, an unsorted set or text outside NFC is refused. */
const create = (type, state = {}, refs = {}, suite = 'std') => call('create', type, state, refs, suite)

/** The id of a block: the hash of its canonical form in the hash of the suite of the key that signed it (SHA-256 bare, `sm3:...`). */
const hash = (type, state = {}, refs = {}, suite = 'std') => call('hash', type, state, refs, suite)

module.exports = { create, hash }
