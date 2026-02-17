const crypto = require('crypto')
const { canonical } = require('./canonical')

/**
 * Create a new FoodBlock.
 * Returns { hash, type, state, refs }
 */
function create(type, state = {}, refs = {}) {
  if (!type || typeof type !== 'string') {
    throw new Error('FoodBlock: type is required and must be a string')
  }
  if (typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('FoodBlock: state must be an object')
  }
  if (typeof refs !== 'object' || Array.isArray(refs)) {
    throw new Error('FoodBlock: refs must be an object')
  }

  const cleanState = omitNulls(state)
  const cleanRefs = omitNulls(refs)
  const h = hash(type, cleanState, cleanRefs)

  return { hash: h, type, state: cleanState, refs: cleanRefs }
}

/**
 * Create an update block that supersedes a previous block.
 * Note: state is a FULL REPLACEMENT, not a merge with previous state.
 * Use mergeUpdate() if you want to merge changes into previous state.
 */
function update(previousHash, type, state = {}, additionalRefs = {}) {
  if (!previousHash || typeof previousHash !== 'string') {
    throw new Error('FoodBlock: previousHash is required')
  }

  const refs = { ...additionalRefs, updates: previousHash }
  return create(type, state, refs)
}

/**
 * Create an update by merging changes into the previous block's state.
 * Shallow-merges stateChanges into previousBlock.state.
 *
 * @param {object} previousBlock - The block to update (must have .hash, .type, .state)
 * @param {object} stateChanges - Fields to merge into previous state
 * @param {object} additionalRefs - Extra refs (updates ref is added automatically)
 */
function mergeUpdate(previousBlock, stateChanges = {}, additionalRefs = {}) {
  if (!previousBlock || !previousBlock.hash) {
    throw new Error('FoodBlock: previousBlock with hash is required')
  }
  const mergedState = { ...previousBlock.state, ...stateChanges }
  return update(previousBlock.hash, previousBlock.type, mergedState, additionalRefs)
}

/**
 * Compute the SHA-256 hash of a FoodBlock's canonical form.
 */
function hash(type, state = {}, refs = {}) {
  const c = canonical(type, state, refs)
  return crypto.createHash('sha256').update(c, 'utf8').digest('hex')
}

/**
 * Recursively remove null/undefined values from an object.
 */
function omitNulls(obj) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(omitNulls).filter(v => v != null)

  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue
    if (typeof value === 'object') {
      result[key] = omitNulls(value)
    } else {
      result[key] = value
    }
  }
  return result
}

module.exports = { create, update, mergeUpdate, hash }
