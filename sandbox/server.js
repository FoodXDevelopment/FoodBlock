const http = require('http')
const { create, update, hash, chain, canonical } = require('../sdk/javascript/src/index')
const { generateSeed } = require('./seed')

// In-memory store (SQLite-free for zero dependencies)
const store = new Map()

// Derived indexes
const byType = new Map()
const byAuthor = new Map()
const byRef = new Map()
const heads = new Map() // chain_id -> head hash

function insertBlock(block) {
  store.set(block.hash, block)

  // Type index
  if (!byType.has(block.type)) byType.set(block.type, [])
  byType.get(block.type).push(block.hash)

  // Author index
  const author = block.refs && block.refs.author
  if (author) {
    if (!byAuthor.has(author)) byAuthor.set(author, [])
    byAuthor.get(author).push(block.hash)
  }

  // Ref index (all ref values)
  if (block.refs) {
    for (const [role, ref] of Object.entries(block.refs)) {
      const hashes = Array.isArray(ref) ? ref : [ref]
      for (const h of hashes) {
        if (!byRef.has(h)) byRef.set(h, [])
        byRef.get(h).push(block.hash)
      }
    }
  }

  // Head resolution
  const prevHash = block.refs && block.refs.updates
  if (prevHash) {
    // Find chain_id from predecessor
    const prev = store.get(prevHash)
    const chainId = prev ? (heads.has(prev.hash) ? prev.hash : findChainId(prevHash)) : prevHash
    heads.delete(prevHash) // predecessor is no longer head
    heads.set(block.hash, chainId)
  } else {
    // Genesis block
    heads.set(block.hash, block.hash)
  }
}

function findChainId(hash) {
  for (const [headHash, chainId] of heads.entries()) {
    if (headHash === hash) return chainId
  }
  // Walk backwards
  const block = store.get(hash)
  if (!block) return hash
  const prev = block.refs && block.refs.updates
  if (!prev) return hash
  return findChainId(prev)
}

// Seed the store
const seedBlocks = generateSeed()
for (const block of seedBlocks) {
  insertBlock(block)
}

// HTTP handler
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  try {
    // GET / — sandbox info
    if (path === '/' && req.method === 'GET') {
      return json(res, {
        name: 'FoodBlock Sandbox',
        version: '0.1.0',
        blocks: store.size,
        types: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.length])),
        endpoints: [
          'GET  /blocks              — list all blocks',
          'GET  /blocks/:hash        — get block by hash',
          'GET  /blocks?type=...     — filter by type',
          'GET  /chain/:hash         — provenance chain',
          'GET  /heads               — all head blocks',
          'POST /blocks              — create a block'
        ]
      })
    }

    // GET /blocks — list/filter
    if (path === '/blocks' && req.method === 'GET') {
      let results = [...store.values()]

      const type = url.searchParams.get('type')
      if (type) {
        results = results.filter(b => b.type === type || b.type.startsWith(type + '.'))
      }

      const ref = url.searchParams.get('ref')
      const refValue = url.searchParams.get('ref_value')
      if (ref && refValue) {
        results = results.filter(b => {
          const r = b.refs && b.refs[ref]
          if (Array.isArray(r)) return r.includes(refValue)
          return r === refValue
        })
      }

      const headsOnly = url.searchParams.get('heads') === 'true'
      if (headsOnly) {
        const headSet = new Set(heads.keys())
        results = results.filter(b => headSet.has(b.hash))
      }

      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')
      results = results.slice(offset, offset + limit)

      return json(res, { count: results.length, blocks: results })
    }

    // GET /blocks/:hash
    const blockMatch = path.match(/^\/blocks\/([a-f0-9]{64})$/)
    if (blockMatch && req.method === 'GET') {
      const block = store.get(blockMatch[1])
      if (!block) return notFound(res, 'Block not found')
      return json(res, block)
    }

    // GET /chain/:hash
    const chainMatch = path.match(/^\/chain\/([a-f0-9]{64})$/)
    if (chainMatch && req.method === 'GET') {
      const resolve = async (h) => store.get(h) || null
      const result = await chain(chainMatch[1], resolve)
      return json(res, { length: result.length, chain: result })
    }

    // GET /heads
    if (path === '/heads' && req.method === 'GET') {
      const headBlocks = [...heads.keys()].map(h => store.get(h)).filter(Boolean)
      return json(res, { count: headBlocks.length, blocks: headBlocks })
    }

    // POST /blocks — create
    if (path === '/blocks' && req.method === 'POST') {
      const body = await readBody(req)
      const { type, state, refs } = JSON.parse(body)

      if (!type) return error(res, 400, 'type is required')

      const block = create(type, state || {}, refs || {})

      if (store.has(block.hash)) {
        return json(res, { exists: true, block: store.get(block.hash) })
      }

      insertBlock(block)
      return json(res, block, 201)
    }

    notFound(res, 'Not found')
  } catch (err) {
    error(res, 500, err.message)
  }
})

function json(res, data, status = 200) {
  res.writeHead(status)
  res.end(JSON.stringify(data, null, 2))
}

function notFound(res, msg) {
  res.writeHead(404)
  res.end(JSON.stringify({ error: msg }))
}

function error(res, status, msg) {
  res.writeHead(status)
  res.end(JSON.stringify({ error: msg }))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const PORT = process.env.PORT || 3111

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║          FoodBlock Sandbox               ║
  ║          http://localhost:${PORT}           ║
  ╠══════════════════════════════════════════╣
  ║  ${store.size} blocks loaded (bakery chain)      ║
  ║                                          ║
  ║  Try:                                    ║
  ║  curl localhost:${PORT}/blocks              ║
  ║  curl localhost:${PORT}/blocks?type=actor    ║
  ║  curl localhost:${PORT}/chain/<hash>         ║
  ╚══════════════════════════════════════════╝
  `)
})
