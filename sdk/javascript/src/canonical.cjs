// Deterministic JSON for hashing and signing (spec/canonical.md). The rules run in the Rust core (core.cjs).
const { call } = require('./core.cjs')

const canonical = (type, state, refs) => call('canonical', type, state, refs)
// A signed message part (spec/protocol.md, Encoding: Messages) is signed over its canonical JSON by the same rules.
const canonicalJSON = (value) => call('canonical_json', value)

module.exports = { canonical, canonicalJSON }
