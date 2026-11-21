// The CBOR key table (encoding.md, compact form; conventions.json `cbor.keys`), made, never edited, from protocol.json.
// Positions 0 to 9 are type, state, refs, author, prev, seq, at, audience, key, hash; then every other name protocol.json
// lists for a block's state, refs, terms, scope, a line, a voice, a row, a shape or a kind field, once each, sorted by its
// UTF-8 bytes. Nothing is locked yet, so the table is made whole by that rule. From the lock on, a later table only
// appends a new name at the end and never moves or empties one: set LOCKED below to the locked table's length then.
//   node tools/cbor-table.cjs          writes conventions.json `cbor.keys`
//   node tools/cbor-table.cjs --check  writes nothing; fails if `cbor.keys` is not what the rule makes
const fs = require('fs')
const path = require('path')

const SPEC = path.join(__dirname, '..', 'spec')
const LOCKED = 0 // how many leading names are locked (none yet)
const FIRST = ['type', 'state', 'refs', 'author', 'prev', 'seq', 'at', 'audience', 'key', 'hash']

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const names = (x) => (Array.isArray(x) ? x.filter((n) => typeof n === 'string') : [])
// every list of names under a value, at any depth (a shape's key sets: shapes.where.point, shapes.voice.key...)
const listsUnder = (x) => (Array.isArray(x) ? names(x) : isObj(x) ? Object.values(x).flatMap(listsUnder) : [])

function namesOf(P) {
  const out = []
  // a block's state: the common five, the base fields of each closed type, the key fields, a genesis's, the causal state field,
  // and every field `field_shape` gives a shape
  out.push(...names(P.common))
  for (const [t, l] of Object.entries(P.fields || {})) if (t !== 'about') out.push(...names(l))
  out.push(...names(P.key_fields && P.key_fields.fields), ...names(P.genesis && P.genesis.required), ...names(P.genesis && P.genesis.private))
  out.push(...names(P.causal_state), ...Object.keys(P.field_shape || {}))
  // refs: the shared ref keys, the verbs, the causal refs, the single-id refs and the refs read by name
  out.push(...names(P.refs && P.refs.who_and_where), ...names(P.refs && P.refs.what_and_which), ...names(P.verbs), ...names(P.causal))
  out.push(...names(P.refs_single), ...names(P.read_by_name))
  // terms, scope, a line
  out.push(...names(P.terms), ...names(P.scope), ...Object.keys(P.narrower_than || {}), ...names(P.line))
  // a shape (a voice and a row among them; the places a shape is read at), a condition's shape, an event repeat's keys
  out.push(...listsUnder(P.shapes), ...names(P.condition_shapes), ...names(P.repeat && P.repeat.keys))
  // a kind field: `field:shape`, the field a path in the state (`terms.reveal_by`)
  for (const [t, kinds] of Object.entries(P.kind_fields || {})) if (isObj(kinds)) for (const lines of Object.values(kinds)) for (const line of names(lines)) out.push(...line.split(':')[0].split('.'))
  return out
}

function table(P, old) {
  const locked = old.slice(0, LOCKED)
  const rest = [...new Set(namesOf(P))].filter((n) => !FIRST.includes(n) && !locked.includes(n)).sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
  return LOCKED ? [...locked, ...rest] : [...FIRST, ...rest]
}

const P = JSON.parse(fs.readFileSync(path.join(SPEC, 'protocol.json'), 'utf8'))
const file = path.join(SPEC, 'conventions.json')
const C = JSON.parse(fs.readFileSync(file, 'utf8'))
const keys = table(P, C.cbor.keys)
if (process.argv.includes('--check')) {
  const same = JSON.stringify(keys) === JSON.stringify(C.cbor.keys)
  if (!same) {
    const had = new Set(C.cbor.keys), has = new Set(keys)
    console.log(`✗ conventions.json cbor.keys is out of date (run node tools/cbor-table.cjs): ${keys.length} names by the rule, ${C.cbor.keys.length} in the file`)
    console.log('  adds:', keys.filter((n) => !had.has(n)).join(' ') || '(none)')
    console.log('  drops:', C.cbor.keys.filter((n) => !has.has(n)).join(' ') || '(none)')
  } else console.log(`cbor.keys is the rule's table: ${keys.length} names`)
  process.exit(same ? 0 : 1)
}
C.cbor.keys = keys
fs.writeFileSync(file, JSON.stringify(C, null, 1) + '\n')
console.log(`wrote conventions.json cbor.keys: ${keys.length} names`)
