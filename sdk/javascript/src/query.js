/**
 * Query builder for FoodBlocks.
 * Works with any storage backend that implements the resolver interface.
 */

class Query {
  constructor(resolve) {
    this._resolve = resolve
    this._type = null
    this._refs = {}
    this._stateFilters = []
    this._limit = 50
    this._offset = 0
    this._headsOnly = false
  }

  /** Filter by block type (exact match or prefix) */
  type(t) {
    this._type = t
    return this
  }

  /** Filter by ref value */
  byRef(role, hash) {
    this._refs[role] = hash
    return this
  }

  /** Filter by state field (equality) */
  whereEq(field, value) {
    this._stateFilters.push({ field, op: 'eq', value })
    return this
  }

  /** Filter by state field (less than) */
  whereLt(field, value) {
    this._stateFilters.push({ field, op: 'lt', value })
    return this
  }

  /** Filter by state field (greater than) */
  whereGt(field, value) {
    this._stateFilters.push({ field, op: 'gt', value })
    return this
  }

  /** Only return head blocks (latest in each update chain) */
  latest() {
    this._headsOnly = true
    return this
  }

  /** Limit results */
  limit(n) {
    this._limit = n
    return this
  }

  /** Offset results */
  offset(n) {
    this._offset = n
    return this
  }

  /** Execute the query */
  async exec() {
    return this._resolve({
      type: this._type,
      refs: this._refs,
      stateFilters: this._stateFilters,
      limit: this._limit,
      offset: this._offset,
      headsOnly: this._headsOnly
    })
  }
}

/**
 * Create a new query.
 * @param {function} resolve - async (queryParams) => blocks[]
 */
function query(resolve) {
  return new Query(resolve)
}

module.exports = { query, Query }
