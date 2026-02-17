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

// Encryption
export const encrypt = sdk.encrypt
export const decrypt = sdk.decrypt

// Validation
export const validate = sdk.validate

// Offline
export const offlineQueue = sdk.offlineQueue

// Tombstone
export const tombstone = sdk.tombstone

// Agent
export const createAgent = sdk.createAgent
export const createDraft = sdk.createDraft
export const approveDraft = sdk.approveDraft
export const loadAgent = sdk.loadAgent

// Internal
export const canonical = sdk.canonical

// Default export
export default sdk
