/**
 * FoodBlock URI scheme: fb:<hash> or fb:<type>/<name>
 *
 * Usage:
 *   fb.toURI(block) => 'fb:a1b2c3...'
 *   fb.toURI(block, { alias: 'sourdough' }) => 'fb:substance.product/sourdough'
 *   fb.fromURI('fb:a1b2c3...') => { hash: 'a1b2c3...' }
 *   fb.fromURI('fb:substance.product/sourdough') => { type: 'substance.product', alias: 'sourdough' }
 */

const URI_PREFIX = 'fb:'

/**
 * Convert a block or hash to a FoodBlock URI.
 * @param {object|string} blockOrHash - A block object or hash string
 * @param {object} [opts] - { alias: string } for named URIs
 * @returns {string} FoodBlock URI
 */
function toURI(blockOrHash, opts = {}) {
  if (opts.alias) {
    const type = typeof blockOrHash === 'string' ? null : blockOrHash.type
    if (type) {
      return `${URI_PREFIX}${type}/${opts.alias}`
    }
  }
  const hash = typeof blockOrHash === 'string' ? blockOrHash : blockOrHash.hash
  return `${URI_PREFIX}${hash}`
}

/**
 * Parse a FoodBlock URI.
 * @param {string} uri - A fb: URI string
 * @returns {object} { hash } for hash URIs, { type, alias } for named URIs
 */
function fromURI(uri) {
  if (!uri.startsWith(URI_PREFIX)) {
    throw new Error(`FoodBlock: invalid URI, must start with "${URI_PREFIX}"`)
  }
  const body = uri.slice(URI_PREFIX.length)

  // Check if it's a named URI: type/alias
  const slashIdx = body.indexOf('/')
  if (slashIdx !== -1 && body.indexOf('.') < slashIdx) {
    return {
      type: body.slice(0, slashIdx),
      alias: body.slice(slashIdx + 1)
    }
  }

  // Hash URI
  return { hash: body }
}

module.exports = { toURI, fromURI }
