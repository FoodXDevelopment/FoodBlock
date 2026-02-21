const { create, update, mergeUpdate, hash } = require('./block')
const { chain, tree, head } = require('./chain')
const { query } = require('./query')
const { generateKeypair, sign, verify } = require('./verify')
const { canonical } = require('./canonical')
const { createAgent, createDraft, approveDraft, loadAgent } = require('./agent')
const { encrypt, decrypt, generateEncryptionKeypair } = require('./encrypt')
const { validate } = require('./validate')
const { offlineQueue } = require('./offline')
const { tombstone } = require('./tombstone')
const { registry } = require('./alias')
const { parse, parseAll, format } = require('./notation')
const { explain } = require('./explain')
const { toURI, fromURI } = require('./uri')
const { createTemplate, fromTemplate, TEMPLATES } = require('./template')
const { discover, federatedResolver, wellKnown, handshake, push, pull, sync } = require('./federation')
const { createVocabulary, mapFields, quantity, transition, nextStatuses, localize, VOCABULARIES } = require('./vocabulary')
const { forward, recall, downstream } = require('./forward')
const { detectConflict, merge, autoMerge } = require('./merge')
const { merkleize, selectiveDisclose, verifyProof, sha256 } = require('./merkle')
const { createSnapshot, verifySnapshot, summarize } = require('./snapshot')
const { attest, dispute, traceAttestations, trustScore } = require('./attestation')
const { fb } = require('./fb')
const { computeTrust, connectionDensity, createTrustPolicy, DEFAULT_WEIGHTS } = require('./trust')
const { seedVocabularies, seedTemplates, seedAll } = require('./seed')
const { createIdentity, encryptKeystore, decryptKeystore, rotateKeys, createRecoveryBlock } = require('./identity')
const { authorize, capture, refund, openTab, addToTab, closeTab } = require('./payment')

const PROTOCOL_VERSION = '0.5.0'

module.exports = {
  // Protocol
  PROTOCOL_VERSION,

  // Core
  create,
  update,
  mergeUpdate,
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

  // Encryption (Section 7.2)
  encrypt,
  decrypt,
  generateEncryptionKeypair,

  // Validation (Section 8)
  validate,

  // Offline (Section 5.5)
  offlineQueue,

  // Tombstone (Section 5.4)
  tombstone,

  // Agent
  createAgent,
  createDraft,
  approveDraft,
  loadAgent,

  // Human Interface (Section 15)
  registry,
  parse,
  parseAll,
  format,
  explain,
  toURI,
  fromURI,

  // Templates (Section 18)
  createTemplate,
  fromTemplate,
  TEMPLATES,

  // Federation (Section 19)
  discover,
  federatedResolver,
  wellKnown,
  handshake,
  push,
  pull,
  sync,

  // Vocabulary (Section 20)
  createVocabulary,
  mapFields,
  quantity,
  transition,
  nextStatuses,
  localize,
  VOCABULARIES,

  // Forward Traversal
  forward,
  recall,
  downstream,

  // Merge (Section 21)
  detectConflict,
  merge,
  autoMerge,

  // Merkle (Section 22)
  merkleize,
  selectiveDisclose,
  verifyProof,
  sha256,

  // Snapshot (Section 23)
  createSnapshot,
  verifySnapshot,
  summarize,

  // Attestation (Section 24)
  attest,
  dispute,
  traceAttestations,
  trustScore,

  // Trust Computation (Section 6.3)
  computeTrust,
  connectionDensity,
  createTrustPolicy,
  DEFAULT_WEIGHTS,

  // Seed Data (vocabularies + templates as blocks)
  seedVocabularies,
  seedTemplates,
  seedAll,

  // Consumer Identity (Implementation Paper §2)
  createIdentity,
  encryptKeystore,
  decryptKeystore,
  rotateKeys,
  createRecoveryBlock,

  // Payment Settlement (Implementation Paper §1)
  authorize,
  capture,
  refund,
  openTab,
  addToTab,
  closeTab,

  // Natural Language Entry Point
  fb,

  // Internal (exposed for interop testing)
  canonical
}
