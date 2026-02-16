const { create, update, hash } = require('./block')
const { chain, tree, head } = require('./chain')
const { query } = require('./query')
const { generateKeypair, sign, verify } = require('./verify')
const { canonical } = require('./canonical')

module.exports = {
  // Core
  create,
  update,
  hash,

  // Provenance
  chain,
  tree,
  head,

  // Query
  query,

  // Signing
  generateKeypair,
  sign,
  verify,

  // Internal (exposed for interop testing)
  canonical
}
