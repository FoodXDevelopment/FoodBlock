/**
 * FoodBlock Notation (FBN) — a human-readable text format for FoodBlocks.
 *
 * Format: @alias = type { key: value, ... } -> refRole: @target, refRole: @target
 *
 * Examples:
 *   @farm = actor.producer { name: "Green Acres Farm" }
 *   @wheat = substance.ingredient { name: "Organic Wheat" } -> source: @farm
 *   @bread = substance.product { name: "Sourdough", price: 4.50 } -> seller: @bakery, inputs: [@flour, @water]
 */

/**
 * Parse a single line of FBN into { alias, type, state, refs }.
 * Refs may contain @alias strings (not yet resolved to hashes).
 */
function parse(line) {
  line = line.trim()
  if (!line || line.startsWith('#') || line.startsWith('//')) return null

  let alias = null
  let rest = line

  // Extract alias: @name = ...
  const aliasMatch = rest.match(/^@(\w+)\s*=\s*/)
  if (aliasMatch) {
    alias = aliasMatch[1]
    rest = rest.slice(aliasMatch[0].length)
  }

  // Extract type: word.word or just word
  const typeMatch = rest.match(/^([\w.]+)\s*/)
  if (!typeMatch) throw new Error(`FBN: expected type in "${line}"`)
  const type = typeMatch[1]
  rest = rest.slice(typeMatch[0].length)

  // Extract state: { ... }
  let state = {}
  if (rest.startsWith('{')) {
    const braceEnd = findClosingBrace(rest, 0)
    const stateStr = rest.slice(0, braceEnd + 1)
    // Convert FBN state to JSON (allow unquoted keys)
    state = parseState(stateStr)
    rest = rest.slice(braceEnd + 1).trim()
  }

  // Extract refs: -> key: value, key: value
  let refs = {}
  if (rest.startsWith('->')) {
    rest = rest.slice(2).trim()
    refs = parseRefs(rest)
  }

  return { alias, type, state, refs }
}

/**
 * Parse multiple lines of FBN.
 */
function parseAll(text) {
  return text.split('\n')
    .map(line => parse(line))
    .filter(Boolean)
}

/**
 * Format a block as a single line of FBN.
 * If aliasMap is provided, hashes are replaced with @aliases.
 */
function format(block, opts = {}) {
  const aliasMap = opts.aliasMap || {}
  const alias = opts.alias

  // Reverse lookup: hash -> alias name
  const hashToAlias = {}
  for (const [name, hash] of Object.entries(aliasMap)) {
    hashToAlias[hash] = name
  }

  let line = ''
  if (alias) line += `@${alias} = `
  line += block.type

  // State
  if (block.state && Object.keys(block.state).length > 0) {
    line += ' ' + formatState(block.state)
  }

  // Refs
  if (block.refs && Object.keys(block.refs).length > 0) {
    const refParts = []
    for (const [key, value] of Object.entries(block.refs)) {
      if (Array.isArray(value)) {
        const items = value.map(v => hashToAlias[v] ? `@${hashToAlias[v]}` : v)
        refParts.push(`${key}: [${items.join(', ')}]`)
      } else {
        const display = hashToAlias[value] ? `@${hashToAlias[value]}` : value
        refParts.push(`${key}: ${display}`)
      }
    }
    line += ' -> ' + refParts.join(', ')
  }

  return line
}

// ── Internal helpers ──────────────────────────────────────────────────

function findClosingBrace(str, start) {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < str.length; i++) {
    const ch = str[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') { depth--; if (depth === 0) return i }
  }
  throw new Error('FBN: unmatched brace')
}

function parseState(str) {
  // Normalize to valid JSON: add quotes around unquoted keys
  let json = str.replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":')
  // Handle trailing commas
  json = json.replace(/,\s*}/g, '}')
  try {
    return JSON.parse(json)
  } catch (e) {
    // Fallback: try as-is (already valid JSON)
    return JSON.parse(str)
  }
}

function parseRefs(str) {
  const refs = {}
  // Split by comma, but not inside brackets
  const parts = splitRefParts(str)

  for (const part of parts) {
    const colonIdx = part.indexOf(':')
    if (colonIdx === -1) continue
    const key = part.slice(0, colonIdx).trim()
    let value = part.slice(colonIdx + 1).trim()

    if (value.startsWith('[')) {
      // Array ref
      value = value.slice(1, -1).trim()
      refs[key] = value.split(',').map(v => v.trim())
    } else {
      refs[key] = value
    }
  }
  return refs
}

function splitRefParts(str) {
  const parts = []
  let current = ''
  let inBracket = false
  for (const ch of str) {
    if (ch === '[') inBracket = true
    if (ch === ']') inBracket = false
    if (ch === ',' && !inBracket) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

function formatState(state) {
  const parts = []
  for (const [key, value] of Object.entries(state)) {
    parts.push(`${key}: ${JSON.stringify(value)}`)
  }
  return '{ ' + parts.join(', ') + ' }'
}

module.exports = { parse, parseAll, format }
