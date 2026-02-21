import express from 'express'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './db.js'
import log from './logger.js'
import blocksRouter from './routes/blocks.js'
import provenanceRouter from './routes/provenance.js'
import federationRouter from './routes/federation.js'
import findRouter from './routes/find.js'
import humanRouter from './routes/human.js'
import streamRouter, { startListener } from './routes/stream.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const logger = log.child('App')

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

if (!process.env.TEST) {
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
}

// Request logging
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logger.debug(`${req.method} ${req.path}`, { status: res.statusCode, ms: Date.now() - start })
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

// ── Health check ────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'unhealthy' })
  }
})

// ── Server info ─────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM foodblocks')
    res.json({
      name: 'FoodBlock Reference Server',
      version: '0.6.0',
      blocks: parseInt(rows[0].count),
      endpoints: {
        'GET    /health': 'Health check',
        'POST   /blocks': 'Create a block',
        'GET    /blocks/:hash': 'Get block by hash',
        'GET    /blocks': 'Query blocks (type, ref, heads)',
        'GET    /chain/:hash': 'Provenance chain',
        'GET    /tree/:hash': 'Full provenance tree',
        'GET    /heads': 'All head blocks',
        'GET    /find': 'Composable search',
        'POST   /fb': 'Natural language entry',
        'POST   /batch': 'Create multiple blocks',
        'GET    /verify/:hash': 'Verify block signature',
        'GET    /types': 'List registered schemas',
        'GET    /prove/:hash/:fields': 'Selective disclosure proof',
        'POST   /verify-proof': 'Verify Merkle proof',
        'GET    /merkle-root/:hash': 'Block state Merkle root',
        'GET    /explain/:hash': 'Provenance narrative',
        'POST   /parse-fbn': 'FBN text to blocks',
        'GET    /format/:hash': 'Block to FBN',
        'POST   /resolve-uri': 'URI to components',
        'GET    /uri/:hash': 'Block to URI',
        'GET    /stream': 'SSE real-time events',
        'GET    /.well-known/foodblock': 'Federation discovery',
        'POST   /.well-known/foodblock/handshake': 'Peer registration',
        'POST   /.well-known/foodblock/push': 'Receive blocks from peer',
        'POST   /.well-known/foodblock/pull': 'Send blocks to peer',
      }
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch server info' })
  }
})

// ── Mount routes ────────────────────────────────────────────────────
app.use(blocksRouter)
app.use(provenanceRouter)
app.use(findRouter)
app.use(humanRouter)
app.use('/stream', streamRouter)
app.use('/.well-known/foodblock', federationRouter)

// Serve static UI (after API routes so GET / returns JSON, not index.html)
app.use(express.static(resolve(__dirname, 'public')))

// ── Error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Max 1MB.' })
  }
  logger.error('Unhandled error', { error: err.message })
  res.status(500).json({ error: 'Internal server error' })
})

// ── Schema + startup ────────────────────────────────────────────────
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
          logger.info('Schema applied successfully')
        } else {
          logger.info('Schema already exists')
        }
        return
      } finally {
        client.release()
      }
    } catch (err) {
      if (i < maxRetries - 1) {
        logger.info(`Waiting for database...`, { attempt: i + 1, maxRetries })
        await new Promise(r => setTimeout(r, 2000))
      } else {
        logger.error('Failed to connect to database', { error: err.message })
        process.exit(1)
      }
    }
  }
}

const PORT = process.env.PORT || 3111

// Skip auto-start when imported for testing
if (!process.env.TEST) {
  ensureSchema().then(async () => {
    try {
      await startListener()
    } catch (err) {
      logger.warn('pg_notify listener failed — SSE stream will not work', { error: err.message })
    }
    app.listen(PORT, () => {
      logger.info('Server started', { port: PORT })
    })
  })
}

export default app
export { pool }
