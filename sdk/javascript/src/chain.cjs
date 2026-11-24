// A key's own chain (core.md, The chain): every block but a genesis sits in its signing key's chain. The rules run
// in the Rust core.
const door = require('./door.cjs')

/** Where the next block for a key goes: { seq, prev }. */
const nextLink = (last, broughtIn) => door.nextLink(last || null, broughtIn)
/** Check one key's chain: { head, length, gaps, skips, equivocations (pairs naming one prev or stating one seq), broken, ok }. */
const checkChain = (blocks, broughtIn) => door.checkChain(blocks, String(broughtIn))
/** Whether the line is read whole from a block back to a start (folds.md, A chain): { whole, lacks }. */
const readWhole = (block, start, blocks = []) => door.readWhole(String(block), String(start), blocks)

module.exports = { nextLink, checkChain, readWhole }
