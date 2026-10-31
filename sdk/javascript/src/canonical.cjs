// Deterministic JSON for hashing and signing (spec/canonical.md). The rules run in the Rust core (core.cjs).
const door = require('./door.cjs')

const canonical = door.canonical
// A signed message part (spec/protocol.md, Encoding: Messages) is signed over its canonical JSON by the same rules.
const canonicalJSON = door.canonicalJson

module.exports = { canonical, canonicalJSON }
