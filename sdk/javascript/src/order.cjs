// Causal order (spec/protocol.md §1, §11): a block's causal past is every block reachable from it through its refs.
// The rules run in the Rust core.
const door = require('./door.cjs')
const { list } = require('./core.cjs')

/** The hashes a block names, through every ref. */
const causesOf = (block) => door.causesOf(block || null)
/** A lookup by hash: a Map, or one built from a list of blocks. */
const indexOf = (blocks) => (blocks instanceof Map ? blocks : new Map(list(blocks).map((block) => [block.hash, block])))
/** Every held block in a block's causal past (a Set of hashes; the block itself is not in it). */
const pastOf = (block, blocks) => new Set(door.pastOf(block, blocks))
/** Whether `later` has `earlier` (a block or its hash) in its causal past. */
const sees = (later, earlier, blocks) => Boolean(later && earlier) && door.sees(later, typeof earlier === 'string' ? { hash: earlier } : earlier, blocks)
/** The blocks no other block among them has in its causal past. */
const headsAmong = door.headsAmong
/** Causes first; each step places, of the blocks whose held causes are all placed, the one with the lowest hash. */
const causalOrder = door.causalOrder

module.exports = { causesOf, pastOf, sees, headsAmong, causalOrder, indexOf }
