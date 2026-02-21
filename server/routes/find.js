import { Router } from 'express'
import { pool } from '../db.js'
import log from '../logger.js'

const logger = log.child('Find')
const router = Router()

const STATE_FIELD_WHITELIST = new Set([
  'name', 'status', 'action', 'draft', 'removed', 'cuisine', 'venue_type'
])

router.get('/find', async (req, res) => {
  try {
    const {
      type,
      ref, ref_value,
      author,
      after, before,
      heads = 'true',
      sort = 'newest'
    } = req.query

    const rawLimit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100)
    const rawOffset = Math.max(parseInt(req.query.offset) || 0, 0)

    const conditions = []
    const params = []
    let idx = 1

    // Type filter (exact or prefix)
    if (type) {
      if (type.endsWith('.*')) {
        conditions.push(`f.type LIKE $${idx}`)
        params.push(type.replace('.*', '.%'))
        idx++
      } else {
        conditions.push(`(f.type = $${idx} OR f.type LIKE $${idx + 1})`)
        params.push(type, type + '.%')
        idx += 2
      }
    }

    // Ref filter
    if (ref && ref_value) {
      conditions.push(`f.refs->>$${idx} = $${idx + 1}`)
      params.push(ref, ref_value)
      idx += 2
    }

    // Author filter
    if (author) {
      conditions.push(`COALESCE(f.refs->>'author', f.author_hash) = $${idx}`)
      params.push(author)
      idx++
    }

    // Time range
    if (after) {
      conditions.push(`f.created_at >= $${idx}`)
      params.push(after)
      idx++
    }
    if (before) {
      conditions.push(`f.created_at <= $${idx}`)
      params.push(before)
      idx++
    }

    // Heads filter (default true)
    if (heads !== 'false') {
      conditions.push('f.is_head = TRUE')
    }

    // State field filters
    for (const key of Object.keys(req.query)) {
      if (!key.startsWith('state.')) continue
      const field = key.slice(6)
      if (!STATE_FIELD_WHITELIST.has(field)) continue

      conditions.push(`f.state->>$${idx} = $${idx + 1}`)
      params.push(field, req.query[key])
      idx += 2
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderBy = sort === 'oldest' ? 'f.created_at ASC' : 'f.created_at DESC'

    // Count query
    const countSQL = `SELECT COUNT(*) FROM foodblocks f ${whereClause}`
    const { rows: countRows } = await pool.query(countSQL, params)
    const total = parseInt(countRows[0].count)

    // Main query
    params.push(rawLimit, rawOffset)
    const mainSQL = `
      SELECT f.hash, f.type, f.state, f.refs, f.author_hash, f.created_at, f.is_head
      FROM foodblocks f
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${idx} OFFSET $${idx + 1}`

    const { rows } = await pool.query(mainSQL, params)

    res.json({
      blocks: rows,
      total,
      limit: rawLimit,
      offset: rawOffset,
      has_more: rawOffset + rawLimit < total
    })
  } catch (err) {
    logger.error('Find query error', { error: err.message })
    res.status(500).json({ error: 'Find query failed' })
  }
})

export default router
