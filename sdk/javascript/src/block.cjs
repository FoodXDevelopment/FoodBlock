// A block: its canonical form and its id. The rules run in the Rust core (core.cjs).
const { call } = require('./core.cjs')

/** Create a new FoodBlock: { hash, type, state, refs }. */
const create = (type, state = {}, refs = {}) => call('create', type, state, refs)

/** The SHA-256 hash of a FoodBlock's canonical form. */
const hash = (type, state = {}, refs = {}) => call('hash', type, state, refs)

module.exports = { create, hash }
