import { Router } from 'express'
import pg from 'pg'
import { EventEmitter } from 'events'
import { pool } from '../db.js'
import log from '../logger.js'

const logger = log.child('Stream')
const router = Router()

const blockStream = new EventEmitter()
blockStream.setMaxListeners(200)

let listenerClient = null

export async function startListener() {
  listenerClient = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock'
  })

  listenerClient.on('notification', (msg) => {
    if (msg.channel !== 'new_block') return
    try {
      blockStream.emit('block', JSON.parse(msg.payload))
    } catch (err) {
      logger.error('Failed to parse notification', { error: err.message })
    }
  })

  listenerClient.on('error', (err) => {
    logger.error('Listener error, reconnecting in 5s', { error: err.message })
    setTimeout(startListener, 5000)
  })

  await listenerClient.connect()
  await listenerClient.query('LISTEN new_block')
  logger.info('Listening for new_block events')
}

// ── GET /stream — Server-Sent Events ────────────────────────────────
router.get('/', (req, res) => {
  const { type, author, ref } = req.query

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  res.write('data: {"event":"connected"}\n\n')

  const onBlock = async (notification) => {
    try {
      if (type) {
        const matchExact = notification.type === type
        const matchPrefix = type.endsWith('*') && notification.type.startsWith(type.slice(0, -1))
        if (!matchExact && !matchPrefix) return
      }

      if (author && notification.author_hash !== author) return

      // Fetch full block for ref filtering and delivery
      const { rows } = await pool.query(
        'SELECT hash, type, state, refs, author_hash, created_at FROM foodblocks WHERE hash = $1',
        [notification.hash]
      )
      if (!rows.length) return

      const block = rows[0]

      if (ref) {
        let refs = block.refs
        try {
          if (typeof refs === 'string') refs = JSON.parse(refs)
        } catch {
          logger.warn('Malformed refs in block', { hash: notification.hash })
          return
        }
        const refValues = Object.values(refs || {}).flat()
        if (!refValues.includes(ref)) return
      }

      res.write(`data: ${JSON.stringify(block)}\n\n`)
    } catch (err) {
      logger.error('Stream delivery error', { error: err.message })
    }
  }

  blockStream.on('block', onBlock)

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 30000)

  req.on('close', () => {
    blockStream.removeListener('block', onBlock)
    clearInterval(keepalive)
  })
})

export default router
