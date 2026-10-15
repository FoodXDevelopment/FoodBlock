// A key's own chain (spec/protocol.md §1).
// Every block but a genesis sits in its signing key's chain: `state.seq` its number, `refs.prev` the key's previous
// block. A key's first block has seq 1 and its prev is the block that brought the key in (the genesis, or the key
// grant). Gaps show what is missing; two blocks with the same seq prove a lie (invariant 3).

/**
 * Where the next block for a key goes: { seq, prev }. `last` is the key's latest block; with none, the key's first
 * block follows `broughtIn` (the hash of the genesis or key grant that brought the key in).
 */
function nextLink(last, broughtIn) {
  if (last) {
    if (!Number.isInteger(last.state?.seq)) throw new Error('chain: the last block has no seq; a key whose blocks have no seq starts again from the block that brought it in')
    return { seq: last.state.seq + 1, prev: last.hash }
  }
  if (!broughtIn) throw new Error('chain: a key\'s first block follows the block that brought the key in')
  return { seq: 1, prev: broughtIn }
}

/**
 * Check one key's chain: blocks it signed (each with state.seq and refs.prev) and the block that brought it in.
 * Returns { head, length, gaps, equivocations, broken, ok }: `gaps` the missing seq numbers, `equivocations` the sets
 * of hashes sharing a seq, `broken` the blocks whose prev is not the block before them.
 */
function checkChain(blocks, broughtIn) {
  const bySeq = new Map()
  for (const block of blocks) {
    const seq = block.state?.seq
    if (!Number.isInteger(seq) || seq < 1) continue
    bySeq.set(seq, [...new Set([...(bySeq.get(seq) || []), block.hash])])
  }
  const blockOf = new Map(blocks.map((block) => [block.hash, block]))
  const length = bySeq.size ? Math.max(...bySeq.keys()) : 0
  const gaps = [], equivocations = [], broken = []
  for (let seq = 1; seq <= length; seq++) {
    const here = bySeq.get(seq)
    if (!here) { gaps.push(seq); continue }
    if (here.length > 1) equivocations.push([...here].sort())
    const before = seq === 1 ? [broughtIn] : bySeq.get(seq - 1)
    if (before && before.length === 1) for (const hash of here) if (blockOf.get(hash).refs?.prev !== before[0]) broken.push(hash)
  }
  const top = bySeq.get(length)
  const head = top && top.length === 1 ? blockOf.get(top[0]) : null
  return { head, length, gaps, equivocations, broken, ok: !gaps.length && !equivocations.length && !broken.length }
}

module.exports = { nextLink, checkChain }
