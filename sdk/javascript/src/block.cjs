const crypto = require('crypto')
const { canonical } = require('./canonical.cjs')

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

  // Validate ref values are strings or arrays of strings
  for (const [key, value] of Object.entries(cleanRefs)) {
    if (typeof value === 'string') continue
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) continue
    throw new Error(`FoodBlock: refs.${key} must be a string or array of strings`)
  }

  const h = hash(type, cleanState, cleanRefs)

  return { hash: h, type, state: cleanState, refs: cleanRefs }
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
    if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = omitNulls(value)
    } else {
      result[key] = value
    }
  }
  return result
}

module.exports = { create, hash }
