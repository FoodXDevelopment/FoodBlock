/**
 * FoodBlock Federation — multi-server discovery, replication, and peer handshake.
 *
 * Servers publish a /.well-known/foodblock endpoint describing their capabilities.
 * Blocks can be resolved, pushed, and pulled across multiple servers.
 */

/**
 * Discover a FoodBlock server's capabilities.
 * @param {string} serverUrl - Base URL of the server
 * @param {object} [opts] - { fetch: custom fetch, timeout: ms }
 * @returns {object} Server discovery info (including public_key, signature)
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
    public_key: info.public_key || null,
    types: info.types || [],
    count: info.count || 0,
    schemas: info.schemas || [],
    templates: info.templates || [],
    peers: info.peers || [],
    endpoints: {
      blocks: '/blocks',
      batch: '/blocks/batch',
      chain: '/chain',
      heads: '/heads',
      push: '/.well-known/foodblock/push',
      pull: '/.well-known/foodblock/pull',
      handshake: '/.well-known/foodblock/handshake'
    }
  }
}

/**
 * Perform a peer handshake with a remote FoodBlock server.
 * Sends our identity (signed) and registers as a peer.
 *
 * @param {string} remoteUrl - Base URL of the remote server
 * @param {object} identity - { peer_url, peer_name, public_key }
 * @param {function} signFn - (payload) => signature hex string
 * @param {object} [opts] - { fetch, timeout }
 * @returns {object} Remote server's identity response
 */
async function handshake(remoteUrl, identity, signFn, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch
  const timeout = opts.timeout || 15000

  const payload = {
    peer_url: identity.peer_url,
    peer_name: identity.peer_name,
    public_key: identity.public_key,
    timestamp: new Date().toISOString()
  }

  const signature = signFn(payload)

  const url = `${remoteUrl.replace(/\/$/, '')}/.well-known/foodblock/handshake`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...identity,
      payload,
      signature
    }),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`FoodBlock: handshake failed with ${remoteUrl}: ${res.status} ${body}`)
  }

  return res.json()
}

/**
 * Push blocks to a remote FoodBlock server.
 *
 * @param {string} remoteUrl - Base URL of the remote server
 * @param {object[]} blocks - Array of blocks to push
 * @param {object} [identity] - { peer_url, public_key }
 * @param {function} [signFn] - (payload) => signature hex string
 * @param {object} [opts] - { fetch, timeout }
 * @returns {object} { inserted, skipped, failed }
 */
async function push(remoteUrl, blocks, identity, signFn, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch
  const timeout = opts.timeout || 30000

  const body = { blocks }

  // Sign the push if identity provided
  if (identity && signFn) {
    const payload = {
      peer_url: identity.peer_url,
      block_count: blocks.length,
      block_hashes: blocks.map(b => b.hash).filter(Boolean)
    }
    body.peer_url = identity.peer_url
    body.public_key = identity.public_key
    body.signature = signFn(payload)
  }

  const url = `${remoteUrl.replace(/\/$/, '')}/.well-known/foodblock/push`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FoodBlock: push to ${remoteUrl} failed: ${res.status} ${text}`)
  }

  return res.json()
}

/**
 * Pull blocks from a remote FoodBlock server since a cursor.
 *
 * @param {string} remoteUrl - Base URL of the remote server
 * @param {object} [query] - { since?: ISO string, after_hash?: string, types?: string[], limit?: number }
 * @param {object} [opts] - { fetch, timeout }
 * @returns {object} { blocks, count, cursor, has_more }
 */
async function pull(remoteUrl, query = {}, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch
  const timeout = opts.timeout || 30000

  const url = `${remoteUrl.replace(/\/$/, '')}/.well-known/foodblock/pull`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FoodBlock: pull from ${remoteUrl} failed: ${res.status} ${text}`)
  }

  return res.json()
}

/**
 * Bidirectional sync between two servers.
 * Pulls from remote, then pushes local blocks.
 *
 * @param {string} remoteUrl - Remote server URL
 * @param {object} localStore - { pull: fn, push: fn } or store adapter
 * @param {object} [opts] - { since, types, identity, signFn, fetch, timeout }
 * @returns {object} { pulled: { blocks, count }, pushed: { inserted, skipped, failed } }
 */
async function sync(remoteUrl, localStore, opts = {}) {
  // Pull from remote
  const pulled = await pull(remoteUrl, {
    since: opts.since,
    types: opts.types,
    limit: opts.limit || 1000
  }, opts)

  // Insert pulled blocks locally
  let localInserted = 0
  if (pulled.blocks && pulled.blocks.length && localStore.insertBlock) {
    for (const block of pulled.blocks) {
      try {
        await localStore.insertBlock(block)
        localInserted++
      } catch {
        // Skip duplicates or invalid blocks
      }
    }
  }

  // Push local blocks to remote
  let pushResult = { inserted: 0, skipped: 0, failed: 0 }
  if (localStore.getBlocksSince) {
    const localBlocks = await localStore.getBlocksSince(opts.since, opts.types)
    if (localBlocks.length) {
      pushResult = await push(remoteUrl, localBlocks, opts.identity, opts.signFn, opts)
    }
  }

  return {
    pulled: { count: pulled.count, local_inserted: localInserted, cursor: pulled.cursor },
    pushed: pushResult
  }
}

module.exports = { discover, federatedResolver, wellKnown, handshake, push, pull, sync }
