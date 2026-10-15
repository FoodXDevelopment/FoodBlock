// Causal order (spec/protocol.md §1, §11). A block's causal past is every block reachable from it through its refs:
// whatever a block names comes before it. Blocks with no causal link are listed by lowest hash only so every reader
// lists them the same way; no rule of authority reads that order (invariant 7), and nobody's clock is read (invariant 6).
const HASH = /^[0-9a-f]{64}$/
const list = (ref) => (Array.isArray(ref) ? ref : typeof ref === 'string' ? [ref] : [])
/** The hashes a block names, through every ref. */
const causesOf = (block) => [...new Set(Object.values(block?.refs || {}).flatMap(list).filter((hash) => HASH.test(hash)))]

/** A lookup by hash: a Map, or one built from a list of blocks. */
const indexOf = (blocks) => (blocks instanceof Map ? blocks : new Map((blocks || []).map((block) => [block.hash, block])))

/** Every held block in a block's causal past (a Set of hashes; the block itself is not in it). */
function pastOf(block, blocks) {
  const byHash = indexOf(blocks), past = new Set(), todo = [...causesOf(block)]
  while (todo.length) {
    const hash = todo.pop()
    if (past.has(hash)) continue
    past.add(hash)
    if (byHash.has(hash)) todo.push(...causesOf(byHash.get(hash)))
  }
  return past
}

/** Whether `later` has `earlier` in its causal past. */
const sees = (later, earlier, blocks) => Boolean(later && earlier) && pastOf(later, blocks).has(earlier.hash || earlier)

/** The blocks no other block among them has in its causal past. */
function headsAmong(blocks) {
  const named = new Set()
  for (const block of blocks) for (const hash of pastOf(block, blocks)) named.add(hash)
  return blocks.filter((block) => !named.has(block.hash))
}

/** Causes first; each step places, of the blocks whose held causes are all placed, the one with the lowest hash. */
function causalOrder(blocks) {
  const byHash = indexOf(blocks)
  const waits = new Map(), next = new Map()
  for (const block of byHash.values()) {
    const causes = causesOf(block).filter((cause) => cause !== block.hash && byHash.has(cause))
    waits.set(block.hash, causes.length)
    for (const cause of causes) next.set(cause, [...(next.get(cause) || []), block.hash])
  }
  const ready = [...waits].filter(([, n]) => n === 0).map(([hash]) => hash).sort()
  const placed = []
  while (placed.length < byHash.size) {
    // A cycle (only made-up data can have one) is broken at its lowest hash.
    const hash = ready.length ? ready.shift() : [...waits].filter(([, n]) => n > 0).map(([h]) => h).sort()[0]
    waits.set(hash, -1)
    placed.push(byHash.get(hash))
    for (const after of next.get(hash) || []) {
      if (waits.get(after) > 0 && waits.set(after, waits.get(after) - 1).get(after) === 0) {
        const at = ready.findIndex((other) => other > after)
        ready.splice(at === -1 ? ready.length : at, 0, after)
      }
    }
  }
  return placed
}

module.exports = { causesOf, pastOf, sees, headsAmong, causalOrder, indexOf }
