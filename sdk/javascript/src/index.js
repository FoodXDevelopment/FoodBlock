const { create, update, hash } = require('./block')
const { chain, tree, head } = require('./chain')
const { query } = require('./query')
const { generateKeypair, sign, verify } = require('./verify')
const { canonical } = require('./canonical')
const { createAgent, createDraft, approveDraft, loadAgent } = require('./agent')

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

  // Agent
  createAgent,
  createDraft,
  approveDraft,
  loadAgent,

  // Internal (exposed for interop testing)
  canonical
}
