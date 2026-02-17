/**
 * FoodBlock Forward Traversal — downstream graph navigation.
 *
 * While chain() follows refs backwards (provenance), forward() follows
 * refs forward (impact). Essential for recall operations: "which products
 * used this contaminated ingredient?"
 */

/**
 * Find all blocks that reference a given hash in any ref field.
 *
 * @param {string} hash - The hash to search for
 * @param {function} resolveForward - async (hash) => block[] — returns all blocks that reference this hash
 * @returns {object} - { referencing: [{ block, role }], count: number }
 */
async function forward(hash, resolveForward) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('FoodBlock: hash is required and must be a string')
  }
  if (typeof resolveForward !== 'function') {
    throw new Error('FoodBlock: resolveForward must be a function')
  }

  const blocks = await resolveForward(hash)
  if (!blocks || !Array.isArray(blocks)) {
    return { referencing: [], count: 0 }
  }

  const referencing = []

  for (const block of blocks) {
    if (!block || !block.refs) continue

    for (const [role, ref] of Object.entries(block.refs)) {
      const hashes = Array.isArray(ref) ? ref : [ref]
      if (hashes.includes(hash)) {
        referencing.push({ block, role })
      }
    }
  }

  return { referencing, count: referencing.length }
}

/**
 * Trace a contamination/recall path downstream.
 * Starting from a source block (e.g., contaminated ingredient), follow
 * all forward references recursively to find every affected block.
 *
 * @param {string} sourceHash - The contaminated/recalled block hash
 * @param {function} resolveForward - async (hash) => block[] — returns blocks referencing this hash
 * @param {object} opts - { maxDepth: 50, types: null (filter by type), roles: null (filter by ref role) }
 * @returns {object} - { affected: block[], depth: number, paths: [[hash, ...]] }
 */
async function recall(sourceHash, resolveForward, opts = {}) {
  if (!sourceHash || typeof sourceHash !== 'string') {
    throw new Error('FoodBlock: sourceHash is required and must be a string')
  }
  if (typeof resolveForward !== 'function') {
    throw new Error('FoodBlock: resolveForward must be a function')
  }

  const maxDepth = opts.maxDepth || 50
  const types = opts.types || null
  const roles = opts.roles || null

  const visited = new Set()
  const affected = []
  let maxDepthReached = 0

  // BFS: queue entries are { hash, depth, path }
  const queue = [{ hash: sourceHash, depth: 0, path: [sourceHash] }]
  visited.add(sourceHash)

  const paths = []

  while (queue.length > 0) {
    const { hash, depth, path } = queue.shift()

    if (depth >= maxDepth) continue

    const blocks = await resolveForward(hash)
    if (!blocks || !Array.isArray(blocks)) continue

    for (const block of blocks) {
      if (!block || !block.hash) continue
      if (visited.has(block.hash)) continue

      // Determine which ref roles connect this block to the current hash
      const matchingRoles = []
      if (block.refs) {
        for (const [role, ref] of Object.entries(block.refs)) {
          const hashes = Array.isArray(ref) ? ref : [ref]
          if (hashes.includes(hash)) {
            matchingRoles.push(role)
          }
        }
      }

      // Filter by roles if specified
      if (roles && matchingRoles.length > 0) {
        const hasMatchingRole = matchingRoles.some(r => roles.includes(r))
        if (!hasMatchingRole) continue
      }

      // Filter by types if specified
      if (types) {
        const matchesType = types.some(t => {
          if (t.endsWith('.*')) {
            const prefix = t.slice(0, -1)
            return block.type && block.type.startsWith(prefix)
          }
          return block.type === t
        })
        if (!matchesType) continue
      }

      visited.add(block.hash)

      const blockPath = [...path, block.hash]
      const currentDepth = depth + 1

      if (currentDepth > maxDepthReached) {
        maxDepthReached = currentDepth
      }

      affected.push(block)
      paths.push(blockPath)

      queue.push({ hash: block.hash, depth: currentDepth, path: blockPath })
    }
  }

  return { affected, depth: maxDepthReached, paths }
}

/**
 * Find all downstream products of a given input.
 * Convenience wrapper around recall() that filters for substance.* types.
 *
 * @param {string} ingredientHash - Hash of the ingredient
 * @param {function} resolveForward - async (hash) => block[]
 * @param {object} opts - Additional options passed to recall()
 * @returns {Array} - substance blocks that use this ingredient (directly or indirectly)
 */
async function downstream(ingredientHash, resolveForward, opts = {}) {
  const recallOpts = {
    ...opts,
    types: opts.types || ['substance.*']
  }

  const result = await recall(ingredientHash, resolveForward, recallOpts)
  return result.affected
}

module.exports = { forward, recall, downstream }
