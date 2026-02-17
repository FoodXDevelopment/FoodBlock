const { normalize } = require('string_decoder')

/**
 * Produces deterministic JSON for hashing.
 * Aligns with RFC 8785 (JSON Canonicalization Scheme) for number formatting
 * and key ordering, extended with FoodBlock-specific rules.
 *
 * Rules (RFC 8785 + FoodBlock):
 * 1. Keys sorted lexicographically at every nesting level (RFC 8785 §3.2.3)
 * 2. No whitespace between tokens (RFC 8785 §3.2.1)
 * 3. Numbers: IEEE 754 shortest representation, no positive sign (RFC 8785 §3.2.2.3)
 *    -0 normalized to 0. NaN and Infinity are not valid.
 * 4. Strings: Unicode NFC normalization (FoodBlock extension)
 * 5. Arrays in `refs` are sorted lexicographically — set semantics (FoodBlock extension)
 * 6. Arrays in `state` preserve declared order — sequence semantics (FoodBlock extension)
 * 7. Null values are omitted (FoodBlock extension)
 * 8. Boolean values: literal `true` or `false` (RFC 8785 §3.2.2)
 */

function canonical(type, state, refs) {
  const obj = { type, state, refs }
  return canonicalStringify(obj, { inRefs: false })
}

function canonicalStringify(value, opts) {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new Error('FoodBlock: Infinity and NaN are not allowed')
    }
    return canonicalNumber(value)
  }

  if (typeof value === 'string') {
    return JSON.stringify(value.normalize('NFC'))
  }

  if (Array.isArray(value)) {
    const shouldSort = opts.inRefs && value.every(v => typeof v === 'string')
    const items = shouldSort
      ? value.slice().sort().map(v => canonicalStringify(v, opts))
      : value.map(v => canonicalStringify(v, opts))

    const filtered = items.filter(v => v !== undefined)
    return '[' + filtered.join(',') + ']'
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const parts = []

    for (const key of keys) {
      const isRefsKey = key === 'refs'
      const childOpts = isRefsKey ? { inRefs: true } : opts

      const val = canonicalStringify(value[key], childOpts)
      if (val !== undefined) {
        const normalizedKey = key.normalize('NFC')
        parts.push(JSON.stringify(normalizedKey) + ':' + val)
      }
    }

    return '{' + parts.join(',') + '}'
  }

  throw new Error(`FoodBlock: unsupported type ${typeof value}`)
}

function canonicalNumber(n) {
  if (Object.is(n, -0)) return '0'
  return String(n)
}

module.exports = { canonical }
