import express from 'express'
import pg from 'pg'
import { create, update, hash, chain, canonical } from '../sdk/javascript/src/index.js'

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock'
})

// GET / — server info
app.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM foodblocks')
  res.json({
    name: 'FoodBlock Reference Server',
    version: '0.1.0',
    blocks: parseInt(rows[0].count),
    endpoints: {
      'POST   /blocks': 'Create a block',
      'GET    /blocks/:hash': 'Get block by hash',
      'GET    /blocks': 'Query blocks (type, ref, heads)',
      'GET    /chain/:hash': 'Provenance chain',
      'GET    /heads': 'All head blocks',
    }
  })
})

// POST /blocks — create a block
app.post('/blocks', async (req, res) => {
  try {
    const { type, state, refs } = req.body
    if (!type) return res.status(400).json({ error: 'type is required' })

    const block = create(type, state || {}, refs || {})

    // Check if already exists
    const existing = await pool.query('SELECT hash FROM foodblocks WHERE hash = $1', [block.hash])
    if (existing.rows.length > 0) {
      return res.json({ exists: true, block })
    }

    const authorHash = (refs && refs.author) || null

    await pool.query(
      `INSERT INTO foodblocks (hash, type, state, refs, author_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [block.hash, block.type, block.state, block.refs, authorHash]
    )

    res.status(201).json(block)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /blocks/:hash — get by hash
app.get('/blocks/:hash', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
    [req.params.hash]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'Block not found' })
  res.json(rows[0])
})

// GET /blocks — query
app.get('/blocks', async (req, res) => {
  const { type, ref, ref_value, heads, limit = 50, offset = 0 } = req.query
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
  params.push(parseInt(limit), parseInt(offset))

  const { rows } = await pool.query(query, params)
  res.json({ count: rows.length, blocks: rows })
})

// GET /chain/:hash — provenance chain
app.get('/chain/:hash', async (req, res) => {
  const resolve = async (h) => {
    const { rows } = await pool.query(
      'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
      [h]
    )
    return rows[0] || null
  }

  const result = await chain(req.params.hash, resolve, { maxDepth: parseInt(req.query.depth || 100) })
  res.json({ length: result.length, chain: result })
})

// GET /heads — all head blocks
app.get('/heads', async (req, res) => {
  const { type, limit = 50, offset = 0 } = req.query
  let query = 'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE is_head = TRUE'
  const params = []
  let idx = 1

  if (type) {
    query += ` AND (type = $${idx} OR type LIKE $${idx + 1})`
    params.push(type, type + '.%')
    idx += 2
  }

  query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`
  params.push(parseInt(limit), parseInt(offset))

  const { rows } = await pool.query(query, params)
  res.json({ count: rows.length, blocks: rows })
})

const PORT = process.env.PORT || 3111
app.listen(PORT, () => {
  console.log(`FoodBlock Reference Server running on port ${PORT}`)
})

export default app
