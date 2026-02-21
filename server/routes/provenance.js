import { Router } from 'express'
import { chain, tree, merkleize, selectiveDisclose, verifyProof } from '../../sdk/javascript/src/index.js'
import { pool, resolveBlock } from '../db.js'
import log from '../logger.js'

const logger = log.child('Provenance')
const router = Router()

const HASH_RE = /^[a-f0-9]{64}$/

// ── GET /chain/:hash — provenance chain ─────────────────────────────
router.get('/chain/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const maxDepth = Math.min(parseInt(req.query.depth) || 100, 500)
    const result = await chain(req.params.hash, resolveBlock, { maxDepth })
    res.json({ length: result.length, chain: result })
  } catch {
    res.status(500).json({ error: 'Failed to traverse chain' })
  }
})

// ── GET /tree/:hash — full provenance tree ──────────────────────────
router.get('/tree/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const maxDepth = Math.min(parseInt(req.query.depth) || 10, 50)
    const result = await tree(req.params.hash, resolveBlock, { maxDepth })
    res.json(result)
  } catch (err) {
    logger.error('Tree traversal error', { error: err.message })
    res.status(500).json({ error: 'Failed to build provenance tree' })
  }
})

// ── GET /prove/:hash/:fields — selective disclosure proof ───────────
router.get('/prove/:hash([a-f0-9]{64})/:fields', async (req, res) => {
  try {
    const { hash, fields } = req.params
    const fieldNames = fields.split(',').map(f => f.trim()).filter(Boolean)

    if (!fieldNames.length) {
      return res.status(400).json({ error: 'At least one field name is required' })
    }

    const { rows } = await pool.query('SELECT state FROM foodblocks WHERE hash = $1', [hash])
    if (!rows.length) return res.status(404).json({ error: 'Block not found' })

    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state

    const missing = fieldNames.filter(f => !(f in state))
    if (missing.length) {
      return res.status(400).json({ error: `Fields not found in block state: ${missing.join(', ')}` })
    }

    const { disclosed, proof, root } = selectiveDisclose(state, fieldNames)
    res.json({ hash, disclosed, proof, root })
  } catch (err) {
    logger.error('Prove error', { error: err.message })
    res.status(500).json({ error: 'Failed to generate proof' })
  }
})

// ── POST /verify-proof — verify a selective disclosure proof ────────
router.post('/verify-proof', (req, res) => {
  try {
    const { disclosed, proof, root } = req.body

    if (!disclosed || !proof || !root) {
      return res.status(400).json({ error: 'disclosed, proof, and root are required' })
    }

    const valid = verifyProof(disclosed, proof, root)
    res.json({ valid })
  } catch (err) {
    logger.error('Verify proof error', { error: err.message })
    res.status(500).json({ error: 'Failed to verify proof' })
  }
})

// ── GET /merkle-root/:hash — block state Merkle root ────────────────
router.get('/merkle-root/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT state FROM foodblocks WHERE hash = $1', [req.params.hash])
    if (!rows.length) return res.status(404).json({ error: 'Block not found' })

    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state
    const { root, leaves } = merkleize(state)

    res.json({ hash: req.params.hash, root, field_count: Object.keys(leaves).length })
  } catch (err) {
    logger.error('Merkle root error', { error: err.message })
    res.status(500).json({ error: 'Failed to compute Merkle root' })
  }
})

export default router
