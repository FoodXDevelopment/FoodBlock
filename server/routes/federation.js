import { Router } from 'express'
import crypto from 'crypto'
import { create, PROTOCOL_VERSION } from '../../sdk/javascript/src/index.js'
import { pool, insertBlock } from '../db.js'
import log from '../logger.js'

const logger = log.child('Federation')
const router = Router()

// ── Server Identity ─────────────────────────────────────────────────

let serverPublicKey = null
let serverPrivateKey = null

function ensureServerKeys() {
  if (serverPublicKey) return

  const pubHex = process.env.FEDERATION_PUBLIC_KEY
  const privHex = process.env.FEDERATION_PRIVATE_KEY

  if (pubHex && privHex) {
    serverPublicKey = Buffer.from(pubHex, 'hex')
    serverPrivateKey = Buffer.from(privHex, 'hex')
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    serverPublicKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
    serverPrivateKey = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32)
    logger.warn('Generated ephemeral keypair — set FEDERATION_PUBLIC_KEY/FEDERATION_PRIVATE_KEY for persistence')
    logger.info('Federation public key', { key: serverPublicKey.toString('hex') })
  }
}

function signPayload(data) {
  ensureServerKeys()
  const message = Buffer.from(JSON.stringify(data), 'utf8')
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), serverPrivateKey]),
    format: 'der',
    type: 'pkcs8'
  })
  return crypto.sign(null, message, privKeyObj).toString('hex')
}

function verifyPeerSignature(data, signature, publicKeyHex) {
  try {
    const message = Buffer.from(JSON.stringify(data), 'utf8')
    const pubKeyBuf = Buffer.from(publicKeyHex, 'hex')
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pubKeyBuf]),
      format: 'der',
      type: 'spki'
    })
    return crypto.verify(null, message, pubKeyObj, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

// ── GET / — server discovery ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    ensureServerKeys()

    const [countResult, typesResult, peersResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM foodblocks'),
      pool.query('SELECT DISTINCT type FROM foodblocks ORDER BY type'),
      pool.query('SELECT peer_url, peer_name, public_key FROM federation_peers WHERE status = $1', ['active']).catch(() => ({ rows: [] })),
    ])

    const totalBlocks = parseInt(countResult.rows[0]?.total || '0', 10)
    const types = typesResult.rows.map(r => r.type)

    const peerEnv = process.env.FOODBLOCK_PEERS || ''
    const envPeers = peerEnv ? peerEnv.split(',').map(p => p.trim()).filter(Boolean) : []
    const dbPeers = peersResult.rows.map(p => p.peer_url)
    const peers = [...new Set([...envPeers, ...dbPeers])]

    const doc = {
      protocol: 'foodblock',
      version: PROTOCOL_VERSION,
      name: process.env.FOODBLOCK_SERVER_NAME || 'FoodBlock Reference Server',
      public_key: serverPublicKey.toString('hex'),
      types,
      count: totalBlocks,
      peers,
      algorithms: { hash: ['sha256'], signature: ['ed25519'] },
      capabilities: ['blocks', 'federation', 'merkle', 'stream'],
      endpoints: {
        blocks: '/blocks',
        batch: '/batch',
        chain: '/chain',
        tree: '/tree',
        heads: '/heads',
        find: '/find',
        stream: '/stream',
        push: '/.well-known/foodblock/push',
        pull: '/.well-known/foodblock/pull',
        handshake: '/.well-known/foodblock/handshake',
      },
    }

    doc.signature = signPayload(doc)
    res.json(doc)
  } catch (err) {
    logger.error('Discovery error', { error: err.message })
    res.json({
      protocol: 'foodblock',
      version: PROTOCOL_VERSION,
      name: process.env.FOODBLOCK_SERVER_NAME || 'FoodBlock Reference Server',
      types: [],
      count: 0,
      peers: [],
    })
  }
})

// ── GET /resolve/:hash — federated block lookup ─────────────────────
router.get('/resolve/:hash([a-f0-9]{64})', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT hash, type, state, refs, created_at FROM foodblocks WHERE hash = $1',
      [req.params.hash]
    )
    if (!rows.length) return res.status(404).json({ error: 'Block not found' })
    res.json(rows[0])
  } catch (err) {
    logger.error('Resolve error', { error: err.message })
    res.status(500).json({ error: 'Failed to resolve block' })
  }
})

// ── POST /handshake — peer registration ─────────────────────────────
router.post('/handshake', async (req, res) => {
  try {
    const { peer_url, peer_name, public_key, signature, payload } = req.body

    if (!peer_url || !public_key || !signature || !payload) {
      return res.status(400).json({ error: 'Missing required fields: peer_url, public_key, signature, payload' })
    }

    if (!verifyPeerSignature(payload, signature, public_key)) {
      return res.status(403).json({ error: 'Invalid signature — handshake rejected' })
    }

    await pool.query(
      `INSERT INTO federation_peers (peer_url, peer_name, public_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (peer_url) DO UPDATE SET
         peer_name = EXCLUDED.peer_name,
         public_key = EXCLUDED.public_key,
         status = 'active'`,
      [peer_url.replace(/\/$/, ''), peer_name || 'Unknown Peer', public_key]
    )

    ensureServerKeys()

    const responsePayload = {
      peer_url: process.env.FOODBLOCK_SERVER_URL || req.protocol + '://' + req.get('host'),
      peer_name: process.env.FOODBLOCK_SERVER_NAME || 'FoodBlock Reference Server',
      public_key: serverPublicKey.toString('hex'),
      accepted_at: new Date().toISOString()
    }

    res.json({ success: true, ...responsePayload, signature: signPayload(responsePayload) })
    logger.info('Handshake accepted', { peer: peer_name || peer_url })
  } catch (err) {
    logger.error('Handshake error', { error: err.message })
    res.status(500).json({ error: 'Handshake failed' })
  }
})

// ── POST /push — receive blocks from peer ───────────────────────────
router.post('/push', async (req, res) => {
  try {
    const { peer_url, public_key, signature, blocks } = req.body

    if (!blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ error: 'blocks array is required' })
    }

    if (public_key && signature) {
      const payload = { peer_url, block_count: blocks.length, block_hashes: blocks.map(b => b.hash).filter(Boolean) }
      if (!verifyPeerSignature(payload, signature, public_key)) {
        return res.status(403).json({ error: 'Invalid signature' })
      }
    }

    let inserted = 0, skipped = 0, failed = 0

    for (const b of blocks) {
      try {
        if (!b.type) { failed++; continue }

        const block = create(b.type, b.state || {}, b.refs || {})

        if (b.hash && b.hash !== block.hash) { failed++; continue }

        const result = await insertBlock(block, b.author_hash || null)
        if (result.exists) skipped++
        else inserted++
      } catch {
        failed++
      }
    }

    if (peer_url) {
      await pool.query(
        `UPDATE federation_peers SET last_sync = NOW() WHERE peer_url = $1`,
        [peer_url.replace(/\/$/, '')]
      ).catch(() => {})
    }

    logger.info('Push received', { peer: peer_url || 'anonymous', inserted, skipped, failed })
    res.json({ success: true, inserted, skipped, failed })
  } catch (err) {
    logger.error('Push error', { error: err.message })
    res.status(500).json({ error: 'Push failed' })
  }
})

// ── POST /pull — send blocks to peer since cursor ───────────────────
router.post('/pull', async (req, res) => {
  try {
    const { since, after_hash, types, limit = 500 } = req.body
    const safeLimit = Math.min(Math.max(parseInt(limit) || 500, 1), 5000)

    let query = 'SELECT hash, type, state, refs, author_hash, created_at FROM foodblocks'
    const conditions = []
    const params = []

    if (since) {
      params.push(since)
      conditions.push(`created_at > $${params.length}`)
    }

    if (after_hash && /^[a-f0-9]{64}$/.test(after_hash)) {
      const { rows: cursorRows } = await pool.query(
        'SELECT created_at FROM foodblocks WHERE hash = $1', [after_hash]
      )
      if (cursorRows.length) {
        params.push(cursorRows[0].created_at)
        conditions.push(`created_at > $${params.length}`)
      }
    }

    if (types && Array.isArray(types) && types.length) {
      const typeConditions = types.map(t => {
        params.push(t, t + '.%')
        return `(type = $${params.length - 1} OR type LIKE $${params.length})`
      })
      conditions.push(`(${typeConditions.join(' OR ')})`)
    }

    conditions.push(`visibility != 'deleted'`)

    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`

    params.push(safeLimit)
    query += ` ORDER BY created_at ASC LIMIT $${params.length}`

    const { rows } = await pool.query(query, params)

    const cursor = rows.length ? rows[rows.length - 1].created_at : since || null

    res.json({
      blocks: rows,
      count: rows.length,
      cursor,
      has_more: rows.length === safeLimit
    })
  } catch (err) {
    logger.error('Pull error', { error: err.message })
    res.status(500).json({ error: 'Pull failed' })
  }
})

export default router
