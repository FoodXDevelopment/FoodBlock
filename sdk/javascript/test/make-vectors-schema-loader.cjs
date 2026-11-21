// Adds to spec/vectors.json the cases of `schemas_from` and of a closed block that carries what a held schema declares (core.md, section 8,
// The schema store): the loader makes the store from the blocks held, and a promise or grant naming a held schema may carry its fields, roles
// and terms. `node test/make-vectors-schema-loader.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Every expectation is written by hand
// from the spec text; the Rust core must give it and so must the oracle (spec/oracle). Door cases: every SDK's vectors test runs the `door` section.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { door, story, DAY, M, AUTH } = kit

const s = story(), farm = s.person('slfarm'), mill = s.person('slmill'), eve = s.person('sleve')
const flour = s.say(farm, 'thing', { kind: 'flour' })
// a schema that declares one more term, one more promise field and one more ref key
const warranty = s.say(farm, 'thing', { kind: 'schema', target: 'promise', terms: { warranty: 'months of cover' }, fields: { grade: 'the grade promised' }, roles: ['inspector'] })
// a second schema, signed by someone else: whose signature it carries is never read
const other = s.say(eve, 'thing', { kind: 'schema', target: 'promise', fields: { origin: 'where grown' } })
const note = s.say(farm, 'observe', { kind: 'note', fields: { grade: 'not a schema' } })
const refs = (schema) => ({ author: farm.id, prev: farm.id, from: farm.id, to: mill.id, what: flour.hash, schema })
const base = { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public' }
const promise = (extra, terms = { expires: DAY }) => ({ ...base, terms, ...extra })

// the loader: things of kind schema among what is held, ids ascending, once each, whoever signed them; no other block
const ids = [warranty.hash, other.hash].sort()
const byId = { [warranty.hash]: warranty, [other.hash]: other }
door('schema loader: the schemas among the blocks held, ids ascending', 'schemas_from', [[...s.held].reverse()], { expect: ids.map((h) => byId[h]), exact: true })
door('schema loader: a thing that is not of kind schema is not one, and an observe naming itself a schema is not one', 'schemas_from', [[flour, note, farm.g]], { expect: [], exact: true })
door('schema loader: the same schema given twice is one', 'schemas_from', [[warranty, warranty, other]], { expect: [other, warranty].sort((a, b) => (a.hash < b.hash ? -1 : 1)), exact: true })
door('schema loader: nothing held, no schemas', 'schemas_from', [[]], { expect: [], exact: true })

// a promise that names a held schema may carry what it declares
door('schema loader: a term the held schema declares is no undeclared field', 'refusals', ['promise', promise({}, { expires: DAY, warranty: '12' }), refs(warranty.hash), s.held, [warranty]], { expect: [], exact: true })
door('schema loader: a field and a ref key the held schema declares are no undeclared field or ref', 'refusals', ['promise', promise({ grade: 'A' }), { ...refs(warranty.hash), inspector: eve.id }, s.held, [warranty]], { expect: [], exact: true })
door('schema loader: the same promise with the schema not in the store: undeclared_ref', 'refusals', ['promise', promise({}, { expires: DAY, warranty: '12' }), refs(warranty.hash), s.held, []], { expect: [{ code: 'undeclared_ref' }] })
door('schema loader: a field the schema does not declare is still undeclared_field', 'refusals', ['promise', promise({ colour: 'white' }), refs(warranty.hash), s.held, [warranty]], { expect: [{ code: 'undeclared_field' }] })
door('schema loader: a term the schema does not declare is still undeclared_field', 'refusals', ['promise', promise({}, { expires: DAY, guarantee: '12' }), refs(warranty.hash), s.held, [warranty]], { expect: [{ code: 'undeclared_field' }] })
door('schema loader: a ref key the schema does not declare is still undeclared_ref', 'refusals', ['promise', promise({}), { ...refs(warranty.hash), auditor: eve.id }, s.held, [warranty]], { expect: [{ code: 'undeclared_ref' }] })
door('schema loader: another schema\'s field is not this one\'s', 'refusals', ['promise', promise({ origin: 'Kent' }), refs(warranty.hash), s.held, [warranty, other]], { expect: [{ code: 'undeclared_field' }] })
door('schema loader: a schema signed by someone else declares as well as the author\'s own', 'refusals', ['promise', promise({ origin: 'Kent' }), refs(other.hash), s.held, [warranty, other]], { expect: [], exact: true })
door('schema loader: a block named in refs.schema that is not a schema declares nothing', 'refusals', ['promise', promise({ grade: 'A' }), refs(note.hash), s.held, [note]], { expect: [{ code: 'undeclared_field' }] })
door('schema loader: with no store at all the fields a schema declares are not judged', 'refusals', ['promise', promise({ colour: 'white' }), refs(warranty.hash), s.held, null], { expect: [], exact: true })
// a grant carries a field its schema declares
const grantRules = s.say(farm, 'thing', { kind: 'schema', target: 'grant', fields: { region: 'where it may be used' } })
door('schema loader: a grant carries a field its held schema declares', 'refusals', ['grant', { ...base, kind: 'errands', region: 'Kent', scope: { types: ['observe'], until: '2027-12-31T00:00:00.000Z' } }, { author: farm.id, prev: farm.id, to: mill.id, schema: grantRules.hash }, s.held, [grantRules]], { expect: [], exact: true })
door('schema loader: the same grant, its schema not in the store: undeclared_ref', 'refusals', ['grant', { ...base, kind: 'errands', region: 'Kent', scope: { types: ['observe'], until: '2027-12-31T00:00:00.000Z' } }, { author: farm.id, prev: farm.id, to: mill.id, schema: grantRules.hash }, s.held, []], { expect: [{ code: 'undeclared_ref' }] })

// valid: the schema is one of the things the block rests on. Held, the block is valid against the store made of what is held; not held, it is unmet.
const p = s.say(farm, 'promise', { terms: { expires: DAY, warranty: '12' } }, { from: farm.id, to: mill.id, what: flour.hash, schema: warranty.hash })
const heldWithout = s.held.filter((b) => b.hash !== warranty.hash)
door('schema loader: valid, the block\'s own schema held and loaded: no refusal', 'valid', [p, s.held, [warranty]], { expect: [], exact: true })
door('schema loader: valid, the schema not held: unmet', 'valid', [p, heldWithout, []], { expect: [{ code: 'unmet' }] })
door('schema loader: valid, the schema held but not loaded into the store: undeclared_ref is not said, the fields are not judged', 'valid', [p, s.held, null], { expect: [], exact: true })

assert.equal(V.door.filter((c) => c.name.startsWith('schema loader:')).length, kit.made.size)
vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
