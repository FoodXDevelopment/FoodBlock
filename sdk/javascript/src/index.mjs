/**
 * FoodBlock SDK - ESM wrapper
 *
 * Provides ESM (import/export) access to the FoodBlock SDK.
 * The core SDK is CJS; this wrapper uses createRequire for compatibility.
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

const sdk = require(join(__dirname, 'index.js'))

// Protocol
export const PROTOCOL_VERSION = sdk.PROTOCOL_VERSION

// Core
export const create = sdk.create
export const update = sdk.update
export const mergeUpdate = sdk.mergeUpdate
export const hash = sdk.hash

// Provenance
export const chain = sdk.chain
export const tree = sdk.tree
export const head = sdk.head

// Query
export const query = sdk.query

// Signing
export const generateKeypair = sdk.generateKeypair
export const sign = sdk.sign
export const verify = sdk.verify

// Encryption (Section 7.2)
export const encrypt = sdk.encrypt
export const decrypt = sdk.decrypt
export const generateEncryptionKeypair = sdk.generateEncryptionKeypair

// Validation (Section 8)
export const validate = sdk.validate

// Offline (Section 5.5)
export const offlineQueue = sdk.offlineQueue

// Tombstone (Section 5.4)
export const tombstone = sdk.tombstone

// Agent
export const createAgent = sdk.createAgent
export const createDraft = sdk.createDraft
export const approveDraft = sdk.approveDraft
export const loadAgent = sdk.loadAgent

// Human Interface (Section 15)
export const registry = sdk.registry
export const parse = sdk.parse
export const parseAll = sdk.parseAll
export const format = sdk.format
export const explain = sdk.explain
export const toURI = sdk.toURI
export const fromURI = sdk.fromURI

// Templates (Section 18)
export const createTemplate = sdk.createTemplate
export const fromTemplate = sdk.fromTemplate
export const TEMPLATES = sdk.TEMPLATES

// Federation (Section 19)
export const discover = sdk.discover
export const federatedResolver = sdk.federatedResolver
export const wellKnown = sdk.wellKnown

// Vocabulary (Section 20)
export const createVocabulary = sdk.createVocabulary
export const mapFields = sdk.mapFields
export const quantity = sdk.quantity
export const transition = sdk.transition
export const nextStatuses = sdk.nextStatuses
export const localize = sdk.localize
export const VOCABULARIES = sdk.VOCABULARIES

// Forward Traversal
export const forward = sdk.forward
export const recall = sdk.recall
export const downstream = sdk.downstream

// Merge (Section 21)
export const detectConflict = sdk.detectConflict
export const merge = sdk.merge
export const autoMerge = sdk.autoMerge

// Merkle (Section 22)
export const merkleize = sdk.merkleize
export const selectiveDisclose = sdk.selectiveDisclose
export const verifyProof = sdk.verifyProof
export const sha256 = sdk.sha256

// Snapshot (Section 23)
export const createSnapshot = sdk.createSnapshot
export const verifySnapshot = sdk.verifySnapshot
export const summarize = sdk.summarize

// Attestation (Section 24)
export const attest = sdk.attest
export const dispute = sdk.dispute
export const traceAttestations = sdk.traceAttestations
export const trustScore = sdk.trustScore

// Natural Language Entry Point
export const fb = sdk.fb

// Internal (exposed for interop testing)
export const canonical = sdk.canonical

// Default export
export default sdk
