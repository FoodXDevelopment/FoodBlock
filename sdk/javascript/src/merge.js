/**
 * FoodBlock Merge — conflict resolution for forked update chains.
 * Merges turn chains into DAGs.
 */

const { create } = require('./block')

/**
 * Detect whether two block hashes represent a fork (conflict) in an
 * update chain by walking both chains backward to find a common ancestor.
 *
 * @param {string} hashA - First chain head hash
 * @param {string} hashB - Second chain head hash
 * @param {function} resolve - async (hash) => block | null
 * @returns {object} { isConflict, commonAncestor, chainA, chainB }
 */
async function detectConflict(hashA, hashB, resolve) {
  if (hashA === hashB) {
    return { isConflict: false, commonAncestor: hashA, chainA: [], chainB: [] }
  }

  const chainA = []
  const chainB = []
  const visitedA = new Set()
  const visitedB = new Set()

  // Walk chain A
  let current = hashA
  while (current) {
    visitedA.add(current)
    const block = await resolve(current)
    if (!block) break
    chainA.push(block)
    current = block.refs && block.refs.updates
      ? (Array.isArray(block.refs.updates) ? block.refs.updates[0] : block.refs.updates)
      : null
  }

  // Walk chain B, looking for intersection with A
  let commonAncestor = null
  current = hashB
  while (current) {
    if (visitedA.has(current)) {
      commonAncestor = current
      break
    }
    visitedB.add(current)
    const block = await resolve(current)
    if (!block) break
    chainB.push(block)
    current = block.refs && block.refs.updates
      ? (Array.isArray(block.refs.updates) ? block.refs.updates[0] : block.refs.updates)
      : null
  }

  return {
    isConflict: commonAncestor !== null,
    commonAncestor,
    chainA,
    chainB
  }
}

/**
 * Create a merge block that resolves a fork between two chain heads.
 *
 * @param {string} hashA - First fork head hash
 * @param {string} hashB - Second fork head hash
 * @param {function} resolve - async (hash) => block | null
 * @param {object} [opts] - { state, strategy: 'a_wins' | 'b_wins' | 'manual' }
 * @returns {object} The merge FoodBlock
 */
async function merge(hashA, hashB, resolve, opts = {}) {
  const strategy = opts.strategy || 'manual'

  let mergedState
  if (strategy === 'manual') {
    if (!opts.state) {
      throw new Error('FoodBlock: manual merge requires opts.state')
    }
    mergedState = opts.state
  } else if (strategy === 'a_wins') {
    const blockA = await resolve(hashA)
    if (!blockA) throw new Error('FoodBlock: could not resolve hashA')
    mergedState = blockA.state
  } else if (strategy === 'b_wins') {
    const blockB = await resolve(hashB)
    if (!blockB) throw new Error('FoodBlock: could not resolve hashB')
    mergedState = blockB.state
  } else {
    throw new Error('FoodBlock: unknown merge strategy: ' + strategy)
  }

  return create('observe.merge', {
    strategy,
    ...mergedState
  }, {
    merges: [hashA, hashB]
  })
}

/**
 * Attempt an automatic merge using vocabulary-defined per-field strategies.
 *
 * @param {string} hashA - First fork head hash
 * @param {string} hashB - Second fork head hash
 * @param {function} resolve - async (hash) => block | null
 * @param {object} [vocabulary] - A vocabulary block with merge strategies per field
 * @returns {object} The merge FoodBlock
 */
async function autoMerge(hashA, hashB, resolve, vocabulary) {
  const blockA = await resolve(hashA)
  const blockB = await resolve(hashB)

  if (!blockA) throw new Error('FoodBlock: could not resolve hashA')
  if (!blockB) throw new Error('FoodBlock: could not resolve hashB')

  const stateA = blockA.state || {}
  const stateB = blockB.state || {}

  // Gather all keys from both states
  const allKeys = new Set([...Object.keys(stateA), ...Object.keys(stateB)])
  const mergedState = {}
  const fields = vocabulary && (vocabulary.state || vocabulary).fields

  for (const key of allKeys) {
    const valA = stateA[key]
    const valB = stateB[key]

    // If values are the same, no conflict
    if (JSON.stringify(valA) === JSON.stringify(valB)) {
      mergedState[key] = valA !== undefined ? valA : valB
      continue
    }

    // If only one side has the value, take it
    if (valA === undefined) { mergedState[key] = valB; continue }
    if (valB === undefined) { mergedState[key] = valA; continue }

    // Values differ — use vocabulary strategy if available
    const fieldDef = fields && fields[key]
    const mergeStrategy = fieldDef && fieldDef.merge

    if (!mergeStrategy || mergeStrategy === 'conflict') {
      throw new Error('FoodBlock: auto-merge conflict on field "' + key + '" — manual resolution required')
    }

    if (mergeStrategy === 'last_writer_wins' || mergeStrategy === 'lww') {
      // Prefer B (convention: later writer)
      mergedState[key] = valB
    } else if (mergeStrategy === 'max') {
      mergedState[key] = typeof valA === 'number' && typeof valB === 'number'
        ? Math.max(valA, valB) : valB
    } else if (mergeStrategy === 'min') {
      mergedState[key] = typeof valA === 'number' && typeof valB === 'number'
        ? Math.min(valA, valB) : valB
    } else if (mergeStrategy === 'union') {
      const arrA = Array.isArray(valA) ? valA : [valA]
      const arrB = Array.isArray(valB) ? valB : [valB]
      mergedState[key] = [...new Set([...arrA, ...arrB])]
    } else {
      throw new Error('FoodBlock: unknown merge strategy "' + mergeStrategy + '" for field "' + key + '"')
    }
  }

  return create('observe.merge', {
    strategy: 'auto',
    ...mergedState
  }, {
    merges: [hashA, hashB]
  })
}

module.exports = { detectConflict, merge, autoMerge }
