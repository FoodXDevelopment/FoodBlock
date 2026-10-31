// Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block that names a root.
const door = require('./door.cjs')

/** The root (64 hex) over the chunks (each hex). */
const root = door.merkleRoot
/** The sibling hashes (hex) that prove chunk `index`, from the leaf up. */
const proof = door.merkleProof
/** True when `proof` shows `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`) under its one merkle mark (`state.marks`). */
const verify = door.merkleVerify

module.exports = { root, proof, verify }
