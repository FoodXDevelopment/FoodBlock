/**
 * Alias registry — maps human-readable names to block hashes.
 * Aliases let non-technical users reference blocks by name instead of hash.
 *
 * Usage:
 *   const reg = fb.registry()
 *   const farm = reg.create('actor.producer', { name: 'Green Acres' }, {}, { alias: 'farm' })
 *   const wheat = reg.create('substance.ingredient', { name: 'Wheat' }, { source: '@farm' })
 *   // '@farm' is resolved to farm.hash before block creation
 */

const { create, update } = require('./block')

class Registry {
  constructor() {
    this._aliases = new Map()
  }

  /** Register an alias for a hash. */
  set(alias, hash) {
    this._aliases.set(alias, hash)
    return this
  }

  /** Resolve an alias to a hash. Returns the alias itself if not found (pass-through for raw hashes). */
  resolve(aliasOrHash) {
    if (typeof aliasOrHash === 'string' && aliasOrHash.startsWith('@')) {
      const name = aliasOrHash.slice(1)
      const hash = this._aliases.get(name)
      if (!hash) throw new Error(`FoodBlock: unresolved alias "@${name}"`)
      return hash
    }
    return aliasOrHash
  }

  /** Resolve all @aliases in a refs object. */
  resolveRefs(refs) {
    const resolved = {}
    for (const [key, value] of Object.entries(refs)) {
      if (Array.isArray(value)) {
        resolved[key] = value.map(v => this.resolve(v))
      } else {
        resolved[key] = this.resolve(value)
      }
    }
    return resolved
  }

  /** Create a block, resolving any @aliases in refs. Optionally register an alias for the new block. */
  create(type, state = {}, refs = {}, opts = {}) {
    const resolvedRefs = this.resolveRefs(refs)
    const block = create(type, state, resolvedRefs)
    if (opts.alias) {
      this._aliases.set(opts.alias, block.hash)
    }
    return block
  }

  /** Create an update block, resolving @aliases. */
  update(previousHash, type, state = {}, refs = {}, opts = {}) {
    const resolvedPrev = this.resolve(previousHash)
    const resolvedRefs = this.resolveRefs(refs)
    const block = update(resolvedPrev, type, state, resolvedRefs)
    if (opts.alias) {
      this._aliases.set(opts.alias, block.hash)
    }
    return block
  }

  /** Get all registered aliases. */
  get aliases() {
    return Object.fromEntries(this._aliases)
  }

  /** Check if an alias exists. */
  has(alias) {
    return this._aliases.has(alias)
  }

  /** Get the number of registered aliases. */
  get size() {
    return this._aliases.size
  }
}

function registry() {
  return new Registry()
}

module.exports = { registry, Registry }
