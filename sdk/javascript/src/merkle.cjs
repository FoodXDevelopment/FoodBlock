// Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block that names a root.
const { call } = require('./core.cjs')

/** The root (64 hex) over the chunks (each hex). */
const root = (chunks) => call('merkle_root', chunks)
/** The sibling hashes (hex) that prove chunk `index`, from the leaf up. */
const proof = (chunks, index) => call('merkle_proof', chunks, index)
/** True when `proof` shows `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`) under its one merkle mark (`state.marks`). */
const verify = (block, chunk, index, siblings) => call('merkle_verify', block, chunk, index, siblings)

module.exports = { root, proof, verify }
