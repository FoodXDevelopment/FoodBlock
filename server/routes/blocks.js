import { Router } from 'express'
import { create, verify as verifySignature, fb } from '../../sdk/javascript/src/index.js'
import { CORE_SCHEMAS } from '../../sdk/javascript/src/validate.js'
import { pool, insertBlock } from '../db.js'
import { clampLimit, clampOffset } from '../pagination.js'
import log from '../logger.js'

const logger = log.child('Blocks')
const router = Router()

// ── POST /blocks — create a block ───────────────────────────────────
router.post('/blocks', async (req, res) => {
  try {
    let type, state, refs, authorHash, signature

    if (req.body.foodblock) {
      const wrapper = req.body
      ;({ type, state, refs } = wrapper.foodblock)
      authorHash = wrapper.author_hash
      signature = wrapper.signature

      if (!authorHash || !signature) {
        return res.status(400).json({ error: 'Signed wrapper requires author_hash and signature' })
      }

      const authorResult = await pool.query(
        'SELECT state FROM foodblocks WHERE hash = $1',
        [authorHash]
      )
      if (authorResult.rows.length > 0 && authorResult.rows[0].state.public_key) {
        const pubKey = authorResult.rows[0].state.public_key
        const valid = verifySignature(wrapper, pubKey)
        if (!valid) {
          return res.status(403).json({ error: 'Invalid signature' })
        }
      }
    } else {
      ;({ type, state, refs } = req.body)
      authorHash = (refs && refs.author) || null
      signature = null
    }

    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'type is required and must be a string' })
    }
    if (type.length > 100) {
      return res.status(400).json({ error: 'type must be 100 characters or less' })
    }
    if (state && typeof state !== 'object') {
      return res.status(400).json({ error: 'state must be an object' })
    }
    if (refs && typeof refs !== 'object') {
      return res.status(400).json({ error: 'refs must be an object' })
    }

    const block = create(type, state || {}, refs || {})

    // Agent permission enforcement
    if (block.refs.agent) {
      const agentResult = await pool.query(
        'SELECT state FROM foodblocks WHERE hash = $1 AND type = $2',
        [block.refs.agent, 'actor.agent']
      )
      if (agentResult.rows.length > 0) {
        const agentState = agentResult.rows[0].state
        if (agentState.capabilities && Array.isArray(agentState.capabilities)) {
          const allowed = agentState.capabilities.some(cap =>
            cap === '*' || block.type === cap ||
            (cap.endsWith('.*') && block.type.startsWith(cap.slice(0, -1)))
          )
          if (!allowed) {
            return res.status(403).json({ error: `Agent not authorized for type ${block.type}` })
          }
        }
        if (agentState.rate_limit_per_hour) {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as cnt FROM foodblocks
             WHERE refs->>'agent' = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
            [block.refs.agent]
          )
          if (parseInt(countRows[0].cnt) >= agentState.rate_limit_per_hour) {
            return res.status(429).json({ error: 'Agent rate limit exceeded' })
          }
        }
        if (agentState.max_amount != null) {
          const amount = (block.state.total || block.state.amount || block.state.value || 0)
          if (amount > agentState.max_amount) {
            return res.status(403).json({
              error: `Amount ${amount} exceeds agent max_amount ${agentState.max_amount}`
            })
          }
        }
      }
    }

    const result = await insertBlock(block, authorHash, signature)

    if (result.exists) return res.json({ exists: true, block })
    if (result.conflict) {
      return res.status(409).json({
        error: 'Conflict: another block already updates this predecessor',
        hash: block.hash
      })
    }

    res.status(201).json(block)
  } catch (err) {
    logger.error('POST /blocks error', { error: err.message })
    res.status(500).json({ error: 'Failed to create block' })
  }
})

// ── GET /blocks/:hash — get by hash ─────────────────────────────────
router.get('/blocks/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
      [req.params.hash]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Block not found' })
    res.json(rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to fetch block' })
  }
})

// ── GET /blocks — query ─────────────────────────────────────────────
router.get('/blocks', async (req, res) => {
  try {
    const { type, ref, ref_value, heads } = req.query
    const limit = clampLimit(req.query.limit)
    const offset = clampOffset(req.query.offset)

    let query = 'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE 1=1'
    const params = []
    let idx = 1

    if (type) {
      query += ` AND (type = $${idx} OR type LIKE $${idx + 1})`
      params.push(type, type + '.%')
      idx += 2
    }

    if (ref && ref_value) {
      query += ` AND refs->>$${idx} = $${idx + 1}`
      params.push(ref, ref_value)
      idx += 2
    }

    if (heads === 'true') {
      query += ' AND is_head = TRUE'
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`
    params.push(limit, offset)

    const { rows } = await pool.query(query, params)
    res.json({ count: rows.length, blocks: rows })
  } catch {
    res.status(500).json({ error: 'Failed to query blocks' })
  }
})

// ── GET /heads — all head blocks ────────────────────────────────────
router.get('/heads', async (req, res) => {
  try {
    const { type } = req.query
    const limit = clampLimit(req.query.limit)
    const offset = clampOffset(req.query.offset)

    let query = 'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE is_head = TRUE'
    const params = []
    let idx = 1

    if (type) {
      query += ` AND (type = $${idx} OR type LIKE $${idx + 1})`
      params.push(type, type + '.%')
      idx += 2
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`
    params.push(limit, offset)

    const { rows } = await pool.query(query, params)
    res.json({ count: rows.length, blocks: rows })
  } catch {
    res.status(500).json({ error: 'Failed to fetch heads' })
  }
})

// ── POST /fb — natural language entry point ─────────────────────────
router.post('/fb', async (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' })
    }

    const result = fb(text)

    let inserted = 0
    for (const block of result.blocks) {
      try {
        await insertBlock(block)
        inserted++
      } catch (err) {
        if (!err.message?.includes('duplicate') && !err.code?.includes('23505')) {
          throw err
        }
      }
    }

    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /batch — create multiple blocks ────────────────────────────
router.post('/batch', async (req, res) => {
  try {
    const { blocks } = req.body
    if (!blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ error: 'blocks array is required' })
    }
    if (blocks.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 blocks per batch' })
    }

    let inserted = 0, skipped = 0, failed = 0
    const results = []

    for (const b of blocks) {
      try {
        if (!b.type || typeof b.type !== 'string') {
          failed++
          results.push({ status: 'failed', error: 'type is required' })
          continue
        }

        const block = create(b.type, b.state || {}, b.refs || {})
        const result = await insertBlock(block, b.author_hash || null)

        if (result.exists) {
          skipped++
          results.push({ hash: block.hash, status: 'skipped' })
        } else if (result.conflict) {
          failed++
          results.push({ hash: block.hash, status: 'conflict' })
        } else {
          inserted++
          results.push({ hash: block.hash, status: 'inserted' })
        }
      } catch {
        failed++
        results.push({ status: 'failed', error: 'Insert error' })
      }
    }

    res.status(201).json({ success: true, inserted, skipped, failed, results })
  } catch (err) {
    logger.error('POST /batch error', { error: err.message })
    res.status(500).json({ error: 'Batch creation failed' })
  }
})

// ── GET /verify/:hash — verify block signature ─────────────────────
router.get('/verify/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT hash, type, state, refs, author_hash, signature FROM foodblocks WHERE hash = $1',
      [req.params.hash]
    )
    if (!rows.length) return res.status(404).json({ error: 'Block not found' })

    const block = rows[0]
    if (!block.signature) {
      return res.json({ hash: block.hash, signed: false, verified: false, reason: 'Block is unsigned' })
    }

    if (!block.author_hash) {
      return res.json({ hash: block.hash, signed: true, verified: false, reason: 'No author_hash to verify against' })
    }

    const authorResult = await pool.query(
      'SELECT state FROM foodblocks WHERE hash = $1',
      [block.author_hash]
    )

    if (!authorResult.rows.length || !authorResult.rows[0].state.public_key) {
      return res.json({ hash: block.hash, signed: true, verified: false, reason: 'Author public key not found' })
    }

    const wrapper = {
      foodblock: { type: block.type, state: block.state, refs: block.refs },
      author_hash: block.author_hash,
      signature: block.signature
    }
    const valid = verifySignature(wrapper, authorResult.rows[0].state.public_key)

    res.json({ hash: block.hash, signed: true, verified: valid, author_hash: block.author_hash })
  } catch (err) {
    logger.error('GET /verify error', { error: err.message })
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ── GET /types — list registered schemas ────────────────────────────
router.get('/types', (req, res) => {
  res.json({ types: CORE_SCHEMAS })
})

// ── GET /types/:type — get specific schema ──────────────────────────
router.get('/types/:type', (req, res) => {
  const key = `foodblock:${req.params.type}@1.0`
  const schema = CORE_SCHEMAS[key]
  if (!schema) return res.status(404).json({ error: 'Schema not found' })
  res.json({ type: req.params.type, schema })
})

export default router
