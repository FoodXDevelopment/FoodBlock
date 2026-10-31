// Publishes the base schemas (spec/schemas/schemas.json): `node test/make-schemas.cjs`. One publisher key, derived from the
// public seed text in schemas.json; a genesis, then one `thing` of kind schema per entry, in order, one second apart. The ids
// are stable: the same list gives the same ids on every machine and in every SDK. It writes spec/schemas/published.json and
// checks every block with the core. A new schema is added at the end of the list, never in the middle.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')

const DIR = path.join(__dirname, '../../../spec/schemas')
const defs = JSON.parse(fs.readFileSync(path.join(DIR, 'schemas.json'), 'utf8'))
const seed = crypto.createHash('sha256').update(defs.publisher.seed_text, 'utf8').digest('hex')
const keys = fb.keypairFromSeed(seed, 'std')
const at = (n) => new Date(Date.parse(defs.publisher.at) + 1000 * n).toISOString()

const held = []
const genesis = fb.identity.genesis(keys, { kind: defs.publisher.kind, at: at(0), audience: 'public' })
held.push(genesis)
const out = { about: 'Written by sdk/javascript/test/make-schemas.cjs from schemas.json. Do not edit.', publisher: { id: genesis.hash, public_key_sign: keys.public_key_sign, seed_text: defs.publisher.seed_text }, genesis, order: [], schemas: {} }
defs.schemas.forEach((def, i) => {
  const { name, ...rest } = def
  const state = { kind: 'schema', name, ...rest }
  const block = fb.write('thing', state, {}, { author: genesis.hash, key: keys, held, at: at(i + 1), audience: 'public' })
  assert.deepEqual(fb.valid(block, held), [], name)
  held.push(block)
  out.order.push(name)
  out.schemas[name] = block
})
fs.writeFileSync(path.join(DIR, 'published.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`${out.order.length} schemas published by ${genesis.hash.slice(0, 12)}`)
