// Reading older blocks (spec/protocol.md: strict writing, generous reading; Encoding: Aliases). Every earlier shape is
// read as its 1.6 form through the one table, spec/aliases.json, in the order protocol.json gives: type names, then the
// shape rules for the block's type.kind and type, then the shared ref renames, then `outside`. It applies to every
// block, with or without seq. Reading never changes a block or its hash: what readAs adds beside the content
// (readFrom, settles, outside, retired) is a reader's mark, never signed.
const { ALIASES, PROTOCOL, TYPES } = require('./spec.cjs')

const ORDER = PROTOCOL.aliases.order
if (ORDER.join() !== 'types,shapes,refs,outside') throw new Error(`aliases: this reader follows the order types, shapes, refs, outside; protocol.json says ${ORDER.join(', ')}`)
const IS_TYPE = new Set(TYPES)

const get = (block, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), block)
const holds = (block, when = {}) => Object.entries(when).every(([path, value]) =>
  value === '*' ? get(block, path) != null : value === null ? get(block, path) == null : get(block, path) === value)
// Paths are `state.x.y` or `refs.x`; a block is copied before it changes.
function put(block, path, value, force) {
  const keys = path.split('.'), last = keys.pop()
  const parent = keys.reduce((node, key) => (node[key] = node[key] && typeof node[key] === 'object' && !Array.isArray(node[key]) ? node[key] : {}), block)
  if (force || parent[last] === undefined) parent[last] = value
}
function remove(block, path) {
  const keys = path.split('.'), last = keys.pop()
  const parent = keys.reduce((node, key) => (node == null ? node : node[key]), block)
  if (parent && typeof parent === 'object') delete parent[last]
}

// The 1.6 type and kind an old type name reads as. Any other old `base.kind` reads as its base's type, with that kind.
function typeOf(name) {
  if (IS_TYPE.has(name)) return { type: name }
  const alias = ALIASES.types[name]
  if (alias) return alias
  const [base, ...rest] = String(name).split('.')
  const as = IS_TYPE.has(base) ? { type: base } : ALIASES.types[base]
  if (as && !as.retired && rest.length) return { ...as, kind: rest.join('.') }
  // A type only the shape rows read (the earlier name `schema`).
  return name !== '*' && ALIASES.shapes[name] ? { type: name } : null
}

// One shape rule applied to a block as read so far (a copy, changed in place).
function apply(read, rule, marks) {
  for (const [from, to] of Object.entries(rule.refs || {})) { const value = read.refs[from]; if (value !== undefined) { delete read.refs[from]; put(read, `refs.${to}`, value, rule.force) } }
  for (const [from, to] of Object.entries(rule.move || {})) { const value = get(read, from); if (value !== undefined) { remove(read, from); put(read, to, value, rule.force) } }
  for (const [to, from] of Object.entries(rule.copy || {})) { const value = get(read, from); if (value !== undefined) put(read, to, structuredClone(value), rule.force) }
  for (const [to, from] of Object.entries(rule.join || {})) { const parts = from.map((path) => get(read, path)).filter((part) => part != null); if (parts.length) put(read, to, parts.join('.'), true) }
  for (const path of rule.drop || []) remove(read, path)
  for (const [path, value] of Object.entries(rule.set || {})) put(read, path, structuredClone(value), rule.force)
  if (rule.type) read.type = rule.type
  if (rule.kind) read.state.kind = rule.kind
  if (rule.settles) marks.settles = read.refs[rule.settles]
}
// Per-type rows (type.kind, then type), then the every-type rows (`*`).
const shapesOf = (read) => [...(ALIASES.shapes[`${read.type}.${read.state.kind}`] || []), ...(ALIASES.shapes[read.type] || []), ...(ALIASES.shapes['*'] || [])]

/** A block of any earlier shape, read as FoodBlock 1.6 through every row of the table; a block that needs no reading comes back as itself. */
function readAs(block) {
  if (!block) return block
  const alias = typeOf(block.type)
  if (!alias) return block
  if (alias.retired) return { ...block, retired: true }
  const { type, fields: renamed = {}, retired: _r, outside: _o, ...defaults } = alias
  const state = { ...block.state }
  for (const [from, to] of Object.entries(renamed)) if (from in state) { state[to] = state[from]; delete state[from] }
  const read = structuredClone({ type, state: { ...defaults, ...state }, refs: { ...block.refs } })
  const marks = {}
  for (const seen = new Set(); !seen.has(`${read.type}.${read.state.kind}`);) {
    seen.add(`${read.type}.${read.state.kind}`)
    for (const rule of shapesOf(read)) if (holds(read, rule.when)) apply(read, rule, marks)
  }
  const refs = {}
  for (const [old, value] of Object.entries(read.refs)) {
    const role = ALIASES.refs[old] || old
    // A ref naming someone with no record (`outside:Plenish`) is an open side: the name is kept beside, never as a ref.
    if (typeof value === 'string' && value.startsWith(ALIASES.outside)) (marks.outside ||= {})[role] = value.slice(ALIASES.outside.length)
    else refs[role] = value
  }
  read.refs = refs
  if (read.type === block.type && JSON.stringify([read.state, read.refs]) === JSON.stringify([block.state, block.refs]) && !Object.keys(marks).length) return block
  return { ...block, ...read, ...marks, readFrom: block.type }
}

// Whether a block, old or new, is of this 1.6 type (and kind, when named): the one test every reader uses.
function isA(block, type, kind) {
  const read = readAs(block)
  return Boolean(read && !read.retired && read.type === type && (kind === undefined || read.state?.kind === kind))
}

module.exports = { readAs, isA }
