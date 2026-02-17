const { create, update, hash } = require('./block')

/**
 * Offline queue for creating FoodBlocks without network connectivity.
 * Blocks are stored locally and synced when connectivity is restored.
 *
 * See Section 5.5 of the whitepaper.
 */
class OfflineQueue {
  constructor() {
    this._blocks = []
  }

  /** Create a block and add it to the offline queue. */
  create(type, state = {}, refs = {}) {
    const block = create(type, state, refs)
    this._blocks.push(block)
    return block
  }

  /** Create an update block and add it to the offline queue. */
  update(previousHash, type, state = {}, refs = {}) {
    const block = update(previousHash, type, state, refs)
    this._blocks.push(block)
    return block
  }

  /** Get all queued blocks. */
  get blocks() {
    return [...this._blocks]
  }

  /** Number of queued blocks. */
  get length() {
    return this._blocks.length
  }

  /** Clear the queue (e.g. after successful sync). */
  clear() {
    this._blocks = []
  }

  /**
   * Sort blocks in dependency order for sync.
   * Blocks that reference other blocks in the queue are placed after their dependencies.
   */
  sorted() {
    const hashes = new Set(this._blocks.map(b => b.hash))
    const graph = new Map()

    for (const block of this._blocks) {
      const deps = []
      if (block.refs) {
        for (const ref of Object.values(block.refs)) {
          const refHashes = Array.isArray(ref) ? ref : [ref]
          for (const h of refHashes) {
            if (hashes.has(h)) deps.push(h)
          }
        }
      }
      graph.set(block.hash, deps)
    }

    // Topological sort
    const visited = new Set()
    const result = []

    const visit = (hash) => {
      if (visited.has(hash)) return
      visited.add(hash)
      for (const dep of (graph.get(hash) || [])) {
        visit(dep)
      }
      const block = this._blocks.find(b => b.hash === hash)
      if (block) result.push(block)
    }

    for (const block of this._blocks) {
      visit(block.hash)
    }

    return result
  }

  /**
   * Sync queued blocks to a remote server.
   *
   * @param {string} url - The FoodBlock server URL (e.g. 'http://localhost:3111')
   * @param {object} [opts] - { fetch } for custom fetch implementation
   * @returns {object} - { inserted: string[], skipped: string[], failed: { hash, error }[] }
   */
  async sync(url, opts = {}) {
    const fetchFn = opts.fetch || globalThis.fetch
    const sorted = this.sorted()

    const response = await fetchFn(`${url}/blocks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: sorted })
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    this.clear()
    return result
  }
}

/**
 * Create a new offline queue.
 * @returns {OfflineQueue}
 */
function offlineQueue() {
  return new OfflineQueue()
}

module.exports = { offlineQueue, OfflineQueue }
