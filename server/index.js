import express from 'express'
import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { create, update, hash, chain, canonical, verify as verifySignature } from '../sdk/javascript/src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

// Strip base path prefix (e.g. /foodblock when behind ALB path-based routing)
const BASE_PATH = process.env.BASE_PATH || ''
if (BASE_PATH) {
  app.use((req, res, next) => {
    if (req.path.startsWith(BASE_PATH)) {
      req.url = req.url.slice(BASE_PATH.length) || '/'
    }
    next()
  })
}

// Serve static UI
app.use(express.static(resolve(__dirname, 'public')))

// Body size limit
app.use(express.json({ limit: '1mb' }))

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Simple in-memory rate limiter (100 req/min per IP)
const rateLimitStore = new Map()
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX = 100

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(ip, { start: now, count: 1 })
    return next()
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.start + RATE_LIMIT_WINDOW - now) / 1000))
    return res.status(429).json({ error: 'Rate limit exceeded. Max 100 requests per minute.' })
  }

  next()
})

// Request logging
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

// Clean up rate limit store every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitStore) {
    if (now - entry.start > RATE_LIMIT_WINDOW) rateLimitStore.delete(ip)
  }
}, 5 * 60 * 1000)

// Pagination bounds
const MAX_LIMIT = 1000
function clampLimit(val) {
  const n = parseInt(val) || 50
  return Math.min(Math.max(n, 1), MAX_LIMIT)
}
function clampOffset(val) {
  const n = parseInt(val) || 0
  return Math.max(n, 0)
}

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock'
})

// GET /health — health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'unhealthy' })
  }
})

// GET / — server info
app.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM foodblocks')
    res.json({
      name: 'FoodBlock Reference Server',
      version: '0.1.0',
      blocks: parseInt(rows[0].count),
      endpoints: {
        'GET    /health': 'Health check',
        'POST   /blocks': 'Create a block',
        'GET    /blocks/:hash': 'Get block by hash',
        'GET    /blocks': 'Query blocks (type, ref, heads)',
        'GET    /chain/:hash': 'Provenance chain',
        'GET    /heads': 'All head blocks',
      }
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch server info' })
  }
})

// POST /blocks — create a block
// Accepts either:
//   { type, state, refs }                           — unsigned (dev/bootstrapping)
//   { foodblock: { type, state, refs }, author_hash, signature } — signed (production)
app.post('/blocks', async (req, res) => {
  try {
    let type, state, refs, authorHash, signature

    if (req.body.foodblock) {
      // Signed wrapper
      const wrapper = req.body
      ;({ type, state, refs } = wrapper.foodblock)
      authorHash = wrapper.author_hash
      signature = wrapper.signature

      if (!authorHash || !signature) {
        return res.status(400).json({ error: 'Signed wrapper requires author_hash and signature' })
      }

      // Look up author's public key from their actor block
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
      // If author not found or no public_key, allow (bootstrapping)
    } else {
      // Unsigned block
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

    // Check if already exists
    const existing = await pool.query('SELECT hash FROM foodblocks WHERE hash = $1', [block.hash])
    if (existing.rows.length > 0) {
      return res.json({ exists: true, block })
    }

    // Agent permission enforcement (Fix #11)
    if (block.refs.agent) {
      const agentResult = await pool.query(
        'SELECT state FROM foodblocks WHERE hash = $1 AND type = $2',
        [block.refs.agent, 'actor.agent']
      )
      if (agentResult.rows.length > 0) {
        const agentState = agentResult.rows[0].state
        // Check capabilities
        if (agentState.capabilities && Array.isArray(agentState.capabilities)) {
          const allowed = agentState.capabilities.some(cap =>
            cap === '*' || block.type === cap ||
            (cap.endsWith('.*') && block.type.startsWith(cap.slice(0, -1)))
          )
          if (!allowed) {
            return res.status(403).json({ error: `Agent not authorized for type ${block.type}` })
          }
        }
        // Check rate limit
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
        // Check max_amount
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

    try {
      await pool.query(
        `INSERT INTO foodblocks (hash, type, state, refs, author_hash, signature)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [block.hash, block.type, block.state, block.refs, authorHash, signature]
      )
    } catch (err) {
      // Fix #7: Fork detection — unique constraint on refs->>'updates'
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Conflict: another block already updates this predecessor',
          hash: block.hash
        })
      }
      throw err
    }

    res.status(201).json(block)
  } catch (err) {
    console.error('POST /blocks error:', err)
    res.status(500).json({ error: 'Failed to create block' })
  }
})

// GET /blocks/:hash — get by hash
app.get('/blocks/:hash([a-f0-9]{64})', async (req, res) => {
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

// GET /blocks — query
app.get('/blocks', async (req, res) => {
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

// GET /chain/:hash — provenance chain
app.get('/chain/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const resolve = async (h) => {
      const { rows } = await pool.query(
        'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
        [h]
      )
      return rows[0] || null
    }

    const maxDepth = Math.min(parseInt(req.query.depth) || 100, 500)
    const result = await chain(req.params.hash, resolve, { maxDepth })
    res.json({ length: result.length, chain: result })
  } catch {
    res.status(500).json({ error: 'Failed to traverse chain' })
  }
})

// GET /heads — all head blocks
app.get('/heads', async (req, res) => {
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

// Global error handler for malformed JSON etc.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Max 1MB.' })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Auto-apply schema on startup (for standalone/sandbox deployments)
async function ensureSchema() {
  const maxRetries = 10
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect()
      try {
        const { rows } = await client.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'foodblocks')`
        )
        if (!rows[0].exists) {
          const schema = readFileSync(resolve(__dirname, '../sql/schema.sql'), 'utf8')
          await client.query(schema)
          console.log('Schema applied successfully')
        } else {
          console.log('Schema already exists')
        }
        return
      } finally {
        client.release()
      }
    } catch (err) {
      if (i < maxRetries - 1) {
        console.log(`Waiting for database... (attempt ${i + 1}/${maxRetries})`)
        await new Promise(r => setTimeout(r, 2000))
      } else {
        console.error('Failed to connect to database after retries:', err.message)
        process.exit(1)
      }
    }
  }
}

const PORT = process.env.PORT || 3111

// Skip auto-start when imported for testing
if (!process.env.TEST) {
  ensureSchema().then(() => {
    app.listen(PORT, () => {
      console.log(`FoodBlock Reference Server running on port ${PORT}`)
    })
  })
}

export default app
export { pool }
