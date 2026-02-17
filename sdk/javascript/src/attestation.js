/**
 * FoodBlock Attestation — multi-party trust and dispute resolution.
 * Enables attestors to confirm or challenge claims.
 */

const { create } = require('./block')

/**
 * Create an attestation block confirming a claim.
 *
 * @param {string} targetHash - Hash of the block being attested
 * @param {string} attestorHash - Hash of the attestor actor block
 * @param {object} [opts] - { confidence: 'verified'|'probable'|'unverified', method: string }
 * @returns {object} The attestation FoodBlock
 */
function attest(targetHash, attestorHash, opts = {}) {
  if (!targetHash || typeof targetHash !== 'string') {
    throw new Error('FoodBlock: targetHash is required')
  }
  if (!attestorHash || typeof attestorHash !== 'string') {
    throw new Error('FoodBlock: attestorHash is required')
  }

  const confidence = opts.confidence || 'verified'
  const state = { confidence }
  if (opts.method) state.method = opts.method

  return create('observe.attestation', state, {
    confirms: targetHash,
    attestor: attestorHash
  })
}

/**
 * Create a dispute block challenging a claim.
 *
 * @param {string} targetHash - Hash of the block being disputed
 * @param {string} disputerHash - Hash of the disputer actor block
 * @param {string} reason - Reason for the dispute
 * @param {object} [opts] - Additional state fields
 * @returns {object} The dispute FoodBlock
 */
function dispute(targetHash, disputerHash, reason, opts = {}) {
  if (!targetHash || typeof targetHash !== 'string') {
    throw new Error('FoodBlock: targetHash is required')
  }
  if (!disputerHash || typeof disputerHash !== 'string') {
    throw new Error('FoodBlock: disputerHash is required')
  }
  if (!reason || typeof reason !== 'string') {
    throw new Error('FoodBlock: reason is required')
  }

  return create('observe.dispute', {
    reason,
    ...opts
  }, {
    challenges: targetHash,
    disputor: disputerHash
  })
}

/**
 * Find all attestation and dispute blocks referencing a given hash.
 *
 * @param {string} hash - The target block hash to trace
 * @param {object[]} allBlocks - Array of all known blocks to search through
 * @returns {object} { attestations: block[], disputes: block[], score: number }
 */
function traceAttestations(hash, allBlocks) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('FoodBlock: hash is required')
  }
  if (!Array.isArray(allBlocks)) {
    throw new Error('FoodBlock: allBlocks must be an array')
  }

  const attestations = []
  const disputes = []

  for (const block of allBlocks) {
    if (!block.refs) continue

    if (block.refs.confirms === hash) {
      attestations.push(block)
    }
    if (block.refs.challenges === hash) {
      disputes.push(block)
    }
  }

  const score = attestations.length - disputes.length

  return { attestations, disputes, score }
}

/**
 * Convenience function: returns just the numeric trust score for a block.
 *
 * @param {string} hash - The target block hash
 * @param {object[]} allBlocks - Array of all known blocks
 * @returns {number} Net trust score (attestations - disputes)
 */
function trustScore(hash, allBlocks) {
  return traceAttestations(hash, allBlocks).score
}

module.exports = { attest, dispute, traceAttestations, trustScore }
