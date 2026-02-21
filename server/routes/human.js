import { Router } from 'express'
import { explain, parseAll, format, toURI, fromURI } from '../../sdk/javascript/src/index.js'
import { resolveBlock } from '../db.js'
import log from '../logger.js'

const logger = log.child('Human')
const router = Router()

const HASH_RE = /^[a-f0-9]{64}$/

// ── GET /explain/:hash — plain-English provenance narrative ─────────
router.get('/explain/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const narrative = await explain(req.params.hash, resolveBlock)
    res.json({ narrative, hash: req.params.hash })
  } catch (err) {
    logger.error('Explain error', { error: err.message })
    res.status(500).json({ error: 'Failed to generate narrative' })
  }
})

// ── POST /parse-fbn — FBN text to blocks ────────────────────────────
router.post('/parse-fbn', (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required and must be a string' })
    }
    const blocks = parseAll(text)
    res.json({ blocks })
  } catch (err) {
    logger.error('Parse FBN error', { error: err.message })
    res.status(500).json({ error: 'Failed to parse FBN' })
  }
})

// ── GET /format/:hash — block to FBN string ─────────────────────────
router.get('/format/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const block = await resolveBlock(req.params.hash)
    if (!block) return res.status(404).json({ error: 'Block not found' })

    const fbn = format(block)
    res.json({ fbn, hash: req.params.hash })
  } catch (err) {
    logger.error('Format error', { error: err.message })
    res.status(500).json({ error: 'Failed to format block' })
  }
})

// ── POST /resolve-uri — URI to components ───────────────────────────
router.post('/resolve-uri', (req, res) => {
  try {
    const { uri } = req.body
    if (!uri || typeof uri !== 'string') {
      return res.status(400).json({ error: 'uri is required and must be a string' })
    }
    const parsed = fromURI(uri)
    if (parsed.hash) return res.json({ hash: parsed.hash, type: 'hash' })
    return res.json({ type: parsed.type, alias: parsed.alias })
  } catch (err) {
    logger.error('Resolve URI error', { error: err.message })
    res.status(400).json({ error: err.message })
  }
})

// ── GET /uri/:hash — block to URI ───────────────────────────────────
router.get('/uri/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const block = await resolveBlock(req.params.hash)
    if (!block) return res.status(404).json({ error: 'Block not found' })

    const uri = toURI(block)
    res.json({ uri, hash: req.params.hash })
  } catch (err) {
    logger.error('URI error', { error: err.message })
    res.status(500).json({ error: 'Failed to generate URI' })
  }
})

export default router
