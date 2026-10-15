// A key's own chain (core.md, The chain): every block but a genesis sits in its signing key's chain. The rules run
// in the Rust core.
const { call, list } = require('./core.cjs')

/** Where the next block for a key goes: { seq, prev }. */
const nextLink = (last, broughtIn) => call('next_link', last || null, broughtIn)
/** Check one key's chain: { head, length, gaps, skips, equivocations (pairs naming one prev), broken, ok }. */
const checkChain = (blocks, broughtIn) => call('check_chain', list(blocks), String(broughtIn))

module.exports = { nextLink, checkChain }
