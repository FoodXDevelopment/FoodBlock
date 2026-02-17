/**
 * FoodBlock Merkle — Merkle-ized state for selective disclosure.
 * Each state field becomes a leaf in a Merkle tree.
 */

const crypto = require('crypto')

/**
 * Compute SHA-256 hash of a string.
 * @param {string} data
 * @returns {string} hex digest
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

/**
 * Produce a canonical string representation of a value for hashing.
 * @param {*} value
 * @returns {string}
 */
function canonicalValue(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value, Object.keys(value).sort())
  return String(value)
}

/**
 * Create a Merkle tree from a state object.
 * Each key-value pair becomes a leaf: SHA-256(key + ":" + canonical(value)).
 *
 * @param {object} state - The state object to merkle-ize
 * @returns {object} { root: hex, leaves: { fieldName: leafHash }, tree: [layer0, layer1, ...] }
 */
function merkleize(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('FoodBlock: state must be an object')
  }

  const keys = Object.keys(state).sort()
  const leaves = {}

  for (const key of keys) {
    leaves[key] = sha256(key + ':' + canonicalValue(state[key]))
  }

  // Build tree layers
  const layer0 = keys.map(k => leaves[k])
  const tree = [layer0]

  let currentLayer = layer0
  while (currentLayer.length > 1) {
    const nextLayer = []
    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        // Pair two nodes — sort for deterministic ordering
        const pair = [currentLayer[i], currentLayer[i + 1]].sort()
        nextLayer.push(sha256(pair[0] + pair[1]))
      } else {
        // Odd node — promote to next layer
        nextLayer.push(currentLayer[i])
      }
    }
    tree.push(nextLayer)
    currentLayer = nextLayer
  }

  const root = currentLayer.length > 0 ? currentLayer[0] : sha256('')

  return { root, leaves, tree }
}

/**
 * Create a selective disclosure of specific fields with a Merkle proof.
 *
 * @param {object} state - The full state object
 * @param {string[]} fieldNames - Fields to disclose
 * @returns {object} { disclosed, proof, root }
 */
function selectiveDisclose(state, fieldNames) {
  if (!state || typeof state !== 'object') {
    throw new Error('FoodBlock: state must be an object')
  }
  if (!Array.isArray(fieldNames)) {
    throw new Error('FoodBlock: fieldNames must be an array')
  }

  const { root, leaves, tree } = merkleize(state)

  const disclosed = {}
  for (const name of fieldNames) {
    if (name in state) {
      disclosed[name] = state[name]
    }
  }

  // Collect proof: sibling hashes needed to reconstruct the root
  const sortedKeys = Object.keys(state).sort()
  const proof = []

  for (const name of fieldNames) {
    const idx = sortedKeys.indexOf(name)
    if (idx === -1) continue

    // Walk up the tree collecting sibling nodes
    let currentIdx = idx
    for (let layer = 0; layer < tree.length - 1; layer++) {
      const layerNodes = tree[layer]
      const siblingIdx = (currentIdx % 2 === 0) ? currentIdx + 1 : currentIdx - 1

      if (siblingIdx >= 0 && siblingIdx < layerNodes.length) {
        proof.push({
          hash: layerNodes[siblingIdx],
          position: currentIdx % 2 === 0 ? 'right' : 'left',
          layer
        })
      }
      // Move to parent index
      currentIdx = Math.floor(currentIdx / 2)
    }
  }

  return { disclosed, proof, root }
}

/**
 * Verify that disclosed fields and proof reconstruct the given Merkle root.
 *
 * @param {object} disclosed - Object with disclosed field key-value pairs
 * @param {object[]} proof - Array of { hash, position, layer } proof elements
 * @param {string} root - Expected Merkle root
 * @returns {boolean} True if the proof is valid
 */
function verifyProof(disclosed, proof, root) {
  if (!disclosed || typeof disclosed !== 'object') return false
  if (!root || typeof root !== 'string') return false

  // Recompute leaf hashes for each disclosed field
  const disclosedKeys = Object.keys(disclosed).sort()

  for (const key of disclosedKeys) {
    let currentHash = sha256(key + ':' + canonicalValue(disclosed[key]))

    // Gather proof entries in layer order for this field
    const relevantProofs = proof.filter(() => true) // use all proof elements
    const byLayer = {}
    for (const p of relevantProofs) {
      if (!byLayer[p.layer]) byLayer[p.layer] = []
      byLayer[p.layer].push(p)
    }

    // Walk up layers
    const maxLayer = Math.max(...proof.map(p => p.layer), -1)
    for (let layer = 0; layer <= maxLayer; layer++) {
      const layerProofs = byLayer[layer]
      if (!layerProofs || layerProofs.length === 0) continue

      // Find the proof element for this layer
      const proofEntry = layerProofs.shift()
      if (!proofEntry) continue

      const pair = proofEntry.position === 'right'
        ? [currentHash, proofEntry.hash]
        : [proofEntry.hash, currentHash]

      const sorted = pair.sort()
      currentHash = sha256(sorted[0] + sorted[1])
    }

    if (currentHash === root) return true
  }

  // If no disclosed key produced a valid path, return false
  return disclosedKeys.length === 0 ? proof.length === 0 && root === sha256('') : false
}

module.exports = { merkleize, selectiveDisclose, verifyProof, sha256 }
