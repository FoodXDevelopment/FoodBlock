const { create } = require('./block')
const crypto = require('crypto')

/**
 * Create a tombstone block that marks a target block for content erasure.
 * See Section 5.4 of the whitepaper.
 *
 * @param {string} targetHash - Hash of the block to erase
 * @param {string} requestedBy - Hash of the actor requesting erasure
 * @param {object} [opts] - { reason: string }
 * @returns {object} - The tombstone FoodBlock
 */
function tombstone(targetHash, requestedBy, opts = {}) {
  if (!targetHash || typeof targetHash !== 'string') {
    throw new Error('FoodBlock: targetHash is required')
  }
  if (!requestedBy || typeof requestedBy !== 'string') {
    throw new Error('FoodBlock: requestedBy is required')
  }

  return create('observe.tombstone', {
    instance_id: crypto.randomUUID(),
    reason: opts.reason || 'erasure_request',
    requested_by: requestedBy,
    requested_at: new Date().toISOString()
  }, {
    target: targetHash,
    updates: targetHash
  })
}

module.exports = { tombstone }
