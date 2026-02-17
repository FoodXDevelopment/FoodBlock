/**
 * FoodBlock Federation — multi-server discovery and cross-server resolution.
 * Servers publish a /.well-known/foodblock endpoint describing their capabilities.
 * Blocks can be resolved across multiple servers by hash.
 */

/**
 * Discover a FoodBlock server's capabilities.
 * @param {string} serverUrl - Base URL of the server
 * @param {object} [opts] - { fetch: custom fetch, timeout: ms }
 * @returns {object} Server discovery info
 */
async function discover(serverUrl, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch
  const timeout = opts.timeout || 10000

  const url = `${serverUrl.replace(/\/$/, '')}/.well-known/foodblock`
  const res = await fetchFn(url, {
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) {
    throw new Error(`FoodBlock: discovery failed for ${serverUrl}: ${res.status}`)
  }

  return res.json()
}

/**
 * Create a federated resolver that tries multiple servers.
 * Tries local first, then peers in order.
 *
 * @param {string[]} servers - Array of server URLs to try, in priority order
 * @param {object} [opts] - { fetch: custom fetch, timeout: ms, cache: boolean }
 * @returns {function} async (hash) => block | null
 */
function federatedResolver(servers, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch
  const timeout = opts.timeout || 10000
  const cache = opts.cache !== false ? new Map() : null

  return async function resolve(hash) {
    // Check cache first
    if (cache && cache.has(hash)) {
      return cache.get(hash)
    }

    for (const server of servers) {
      try {
        const url = `${server.replace(/\/$/, '')}/blocks/${hash}`
        const res = await fetchFn(url, {
          signal: AbortSignal.timeout(timeout)
        })

        if (res.ok) {
          const block = await res.json()
          if (block && !block.error) {
            if (cache) cache.set(hash, block)
            return block
          }
        }
      } catch {
        // Try next server
        continue
      }
    }

    return null
  }
}

/**
 * Generate the well-known discovery document for a server.
 * @param {object} info - Server info
 * @returns {object} Discovery document
 */
function wellKnown(info) {
  return {
    protocol: 'foodblock',
    version: info.version || '0.4.0',
    name: info.name || 'FoodBlock Server',
    types: info.types || [],
    count: info.count || 0,
    schemas: info.schemas || [],
    templates: info.templates || [],
    peers: info.peers || [],
    endpoints: {
      blocks: '/blocks',
      batch: '/blocks/batch',
      chain: '/chain',
      heads: '/heads'
    }
  }
}

module.exports = { discover, federatedResolver, wellKnown }
