/**
 * FoodBlock Snapshot — subgraph summarization for scalability.
 * Creates compact summaries of block collections.
 */

const crypto = require('crypto')
const { create } = require('./block')

/**
 * Compute SHA-256 hash of a string.
 * @param {string} data
 * @returns {string} hex digest
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

/**
 * Compute the Merkle root of an array of hashes.
 * @param {string[]} hashes - Sorted array of hex hash strings
 * @returns {string} Merkle root hash
 */
function computeMerkleRoot(hashes) {
  if (hashes.length === 0) return sha256('')
  if (hashes.length === 1) return hashes[0]

  let layer = hashes.slice().sort()
  while (layer.length > 1) {
    const next = []
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        const pair = [layer[i], layer[i + 1]].sort()
        next.push(sha256(pair[0] + pair[1]))
      } else {
        next.push(layer[i])
      }
    }
    layer = next
  }
  return layer[0]
}

/**
 * Create a snapshot block that summarizes a collection of blocks.
 *
 * @param {object[]} blocks - Array of blocks (each must have .hash)
 * @param {object} [opts] - { summary, date_range: [start, end] }
 * @returns {object} The snapshot FoodBlock
 */
function createSnapshot(blocks, opts = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('FoodBlock: blocks must be a non-empty array')
  }

  const hashes = blocks.map(b => {
    if (!b || !b.hash) throw new Error('FoodBlock: each block must have a hash')
    return b.hash
  })

  const merkle_root = computeMerkleRoot(hashes)

  const state = {
    block_count: blocks.length,
    merkle_root
  }

  if (opts.date_range) state.date_range = opts.date_range
  if (opts.summary) state.summary = opts.summary

  return create('observe.snapshot', state, {})
}

/**
 * Verify that a set of blocks matches a snapshot's Merkle root.
 *
 * @param {object} snapshot - A snapshot block
 * @param {object[]} blocks - Array of blocks to verify
 * @returns {object} { valid: boolean, missing: string[] }
 */
function verifySnapshot(snapshot, blocks) {
  const state = snapshot.state || snapshot
  const expectedRoot = state.merkle_root
  const expectedCount = state.block_count

  if (!expectedRoot) {
    return { valid: false, missing: [] }
  }

  const hashes = blocks.map(b => b.hash).filter(Boolean)
  const actualRoot = computeMerkleRoot(hashes)

  const valid = actualRoot === expectedRoot && hashes.length === expectedCount

  // Identify any missing blocks (if count differs)
  const missing = []
  if (hashes.length < expectedCount) {
    // We can't know which hashes are missing without the original set,
    // but we can report the root mismatch
  }

  return { valid, missing }
}

/**
 * Produce a summary of a block collection.
 *
 * @param {object[]} blocks - Array of blocks
 * @returns {object} { total, by_type: { 'substance.product': count, ... } }
 */
function summarize(blocks) {
  if (!Array.isArray(blocks)) {
    throw new Error('FoodBlock: blocks must be an array')
  }

  const by_type = {}
  for (const block of blocks) {
    const type = block.type || 'unknown'
    by_type[type] = (by_type[type] || 0) + 1
  }

  return {
    total: blocks.length,
    by_type
  }
}

module.exports = { createSnapshot, verifySnapshot, summarize }
