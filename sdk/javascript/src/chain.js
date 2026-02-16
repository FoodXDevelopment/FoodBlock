/**
 * Provenance chain traversal.
 * Follows refs backwards to build the full history of a FoodBlock.
 */

/**
 * Get the full provenance chain for a block.
 * Takes a resolve function that fetches a block by hash.
 *
 * @param {string} startHash - The hash to start from
 * @param {function} resolve - async (hash) => block | null
 * @param {object} opts - { maxDepth: 100 }
 * @returns {Array} - chain of blocks from newest to oldest
 */
async function chain(startHash, resolve, opts = {}) {
  const maxDepth = opts.maxDepth || 100
  const visited = new Set()
  const result = []

  let currentHash = startHash
  let depth = 0

  while (currentHash && depth < maxDepth) {
    if (visited.has(currentHash)) break
    visited.add(currentHash)

    const block = await resolve(currentHash)
    if (!block) break

    result.push(block)

    // Follow updates chain (version history)
    currentHash = block.refs && block.refs.updates
      ? (Array.isArray(block.refs.updates) ? block.refs.updates[0] : block.refs.updates)
      : null

    depth++
  }

  return result
}

/**
 * Get the full provenance tree for a block.
 * Follows ALL refs recursively, not just updates.
 *
 * @param {string} startHash - The hash to start from
 * @param {function} resolve - async (hash) => block | null
 * @param {object} opts - { maxDepth: 20 }
 * @returns {object} - { block, ancestors: { role: tree } }
 */
async function tree(startHash, resolve, opts = {}) {
  const maxDepth = opts.maxDepth || 20
  const visited = new Set()

  async function buildTree(hash, depth) {
    if (!hash || depth >= maxDepth || visited.has(hash)) {
      return null
    }
    visited.add(hash)

    const block = await resolve(hash)
    if (!block) return null

    const ancestors = {}
    if (block.refs) {
      for (const [role, ref] of Object.entries(block.refs)) {
        const hashes = Array.isArray(ref) ? ref : [ref]
        const subtrees = []

        for (const h of hashes) {
          const subtree = await buildTree(h, depth + 1)
          if (subtree) subtrees.push(subtree)
        }

        if (subtrees.length === 1) ancestors[role] = subtrees[0]
        else if (subtrees.length > 1) ancestors[role] = subtrees
      }
    }

    return { block, ancestors }
  }

  return buildTree(startHash, 0)
}

/**
 * Find the head (latest version) of an update chain.
 *
 * @param {string} startHash - Any hash in the chain
 * @param {function} resolveForward - async (hash) => block[] that ref this hash via updates
 * @returns {object} - The head block
 */
async function head(startHash, resolveForward) {
  let currentHash = startHash

  while (true) {
    const children = await resolveForward(currentHash)
    const updater = children.find(c => {
      const updates = c.refs && c.refs.updates
      if (Array.isArray(updates)) return updates.includes(currentHash)
      return updates === currentHash
    })

    if (!updater) break
    currentHash = updater.hash
  }

  return currentHash
}

module.exports = { chain, tree, head }
