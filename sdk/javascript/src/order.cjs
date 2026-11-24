// Causal order (spec/protocol.md §1, §11): a block's causal past is every block reachable from it through its refs.
// The rules run in the Rust core.
const door = require('./door.cjs')

/** Every given block in a block's causal past (a Set of hashes; the block itself is not in it). */
const pastOf = (block, blocks) => new Set(door.pastOf(block, blocks))
/** Whether `later` has `earlier` (a block or its hash) in its causal past. */
const sees = (later, earlier, blocks) => Boolean(later && earlier) && door.sees(later, typeof earlier === 'string' ? { hash: earlier } : earlier, blocks)
/** Causes first; each step places, of the blocks whose causes among the blocks are all placed, the one with the lowest hash. */
const causalOrder = door.causalOrder

module.exports = { pastOf, sees, causalOrder }
