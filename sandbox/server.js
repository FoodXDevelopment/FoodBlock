const http = require('http')
const { create, update, hash, chain, canonical, tombstone, verify, fb, PROTOCOL_VERSION } = require('../sdk/javascript/src/index')
const { generateSeed } = require('./seed')

// Body size limit (1MB)
const MAX_BODY_SIZE = 1024 * 1024

// In-memory store (SQLite-free for zero dependencies)
const store = new Map()

// Derived indexes
const byType = new Map()
const byAuthor = new Map()
const byRef = new Map()
const heads = new Map() // chain_id -> head hash
const authors = new Map() // block hash -> author_hash

function insertBlock(block) {
  store.set(block.hash, block)

  // Type index
  if (!byType.has(block.type)) byType.set(block.type, [])
  byType.get(block.type).push(block.hash)

  // Author tracking — extract from block.author_hash, refs.author, or state
  const authorHash = block.author_hash
    || (block.refs && block.refs.author)
    || null
  if (authorHash) {
    authors.set(block.hash, authorHash)
  }

  // Author index (refs.author for backward compat)
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

  // Head resolution with author-scoped logic (v0.3)
  const prevHash = block.refs && block.refs.updates
  if (prevHash) {
    const prev = store.get(prevHash)
    const chainId = prev ? (heads.has(prev.hash) ? prev.hash : findChainId(prevHash)) : prevHash

    const blockAuthor = authors.get(block.hash)
    const prevAuthor = authors.get(prevHash)
    const isSameAuthor = blockAuthor && prevAuthor && blockAuthor === prevAuthor
    const isTombstone = block.type === 'observe.tombstone'
    const hasApproval = block.refs && (block.refs.approved_agent || block.refs.approval)

    if (!isSameAuthor && blockAuthor && prevAuthor) {
      // Different author
      if (isTombstone) {
        // Tombstones always succeed — remove predecessor from heads
        heads.delete(prevHash)
        heads.set(block.hash, chainId)
      } else if (hasApproval) {
        // Approved cross-author update — normal behavior
        heads.delete(prevHash)
        heads.set(block.hash, chainId)
      } else {
        // No approval, different author — treat as fork (new chain)
        // Predecessor stays as head of its chain; this block starts a new chain
        heads.set(block.hash, block.hash)
      }
    } else {
      // Same author or author info missing — normal update behavior
      heads.delete(prevHash)
      heads.set(block.hash, chainId)
    }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  try {
    // GET /.well-known/foodblock — federation discovery
    if (path === '/.well-known/foodblock' && req.method === 'GET') {
      const types = [...new Set([...store.values()].map(b => b.type))]
      const templates = [...store.values()]
        .filter(b => b.type === 'observe.template')
        .map(b => ({ hash: b.hash, name: b.state.name }))
      const vocabularies = [...store.values()]
        .filter(b => b.type === 'observe.vocabulary')
        .map(b => ({ hash: b.hash, domain: b.state.domain }))
      return json(res, {
        protocol: 'foodblock',
        version: PROTOCOL_VERSION,
        name: 'FoodBlock Sandbox',
        types,
        count: store.size,
        templates,
        vocabularies,
        peers: [],
        endpoints: {
          blocks: '/blocks',
          batch: '/blocks/batch',
          chain: '/chain',
          heads: '/heads'
        }
      })
    }

    // GET / — sandbox info
    if (path === '/' && req.method === 'GET') {
      return json(res, {
        name: 'FoodBlock Sandbox',
        version: '0.4.0',
        protocol_version: PROTOCOL_VERSION,
        blocks: store.size,
        types: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.length])),
        endpoints: [
          'GET    /blocks              — list all blocks',
          'GET    /blocks/:hash        — get block by hash',
          'GET    /blocks?type=...     — filter by type',
          'POST   /blocks              — create a block',
          'POST   /blocks/batch        — insert multiple blocks in dependency order',
          'DELETE /blocks/:hash        — tombstone a block (soft delete)',
          'GET    /chain/:hash         — provenance chain',
          'GET    /forward/:hash       — blocks referencing this hash',
          'POST   /fb                  — natural language entry point',
          'GET    /heads               — all head blocks'
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

    // POST /blocks/batch — batch insert (must come before /blocks/:hash match)
    if (path === '/blocks/batch' && req.method === 'POST') {
      const body = await readBody(req)
      const { blocks: inputBlocks } = JSON.parse(body)

      if (!Array.isArray(inputBlocks)) {
        return error(res, 400, 'blocks must be an array')
      }

      const inserted = []
      const skipped = []
      const failed = []

      // Compute hashes and detect duplicates; retry in dependency order
      const pending = inputBlocks.map(b => ({
        raw: b,
        computed: null,
        done: false
      }))

      // Attempt up to N passes to resolve dependencies
      const maxPasses = pending.length + 1
      for (let pass = 0; pass < maxPasses; pass++) {
        let progress = false
        for (const item of pending) {
          if (item.done) continue
          try {
            const { type, state, refs, author_hash } = item.raw
            if (!type) {
              item.done = true
              failed.push({ block: item.raw, error: 'type is required' })
              progress = true
              continue
            }

            // Check if dependencies (refs.updates, etc.) are satisfied
            if (refs && refs.updates && !store.has(refs.updates)) {
              // Dependency not yet in store — retry next pass
              continue
            }

            const block = create(type, state || {}, refs || {})

            // Attach author_hash if provided
            if (author_hash) {
              block.author_hash = author_hash
            }

            if (store.has(block.hash)) {
              item.done = true
              skipped.push(block.hash)
              progress = true
              continue
            }

            insertBlock(block)
            item.done = true
            inserted.push(block.hash)
            progress = true
          } catch (err) {
            // Will retry on next pass unless it's the last pass
            if (pass === maxPasses - 1) {
              item.done = true
              failed.push({ block: item.raw, error: err.message })
            }
          }
        }
        if (!progress) break // No progress means remaining items have unresolvable deps
      }

      // Anything still not done is a failed dependency
      for (const item of pending) {
        if (!item.done) {
          failed.push({ block: item.raw, error: 'unresolved dependency' })
        }
      }

      return json(res, { inserted, skipped, failed }, 200)
    }

    // GET /blocks/:hash
    const blockMatch = path.match(/^\/blocks\/([a-f0-9]{64})$/)
    if (blockMatch && req.method === 'GET') {
      const block = store.get(blockMatch[1])
      if (!block) return notFound(res, 'Block not found')
      return json(res, block)
    }

    // DELETE /blocks/:hash — create a tombstone
    if (blockMatch && req.method === 'DELETE') {
      const targetHash = blockMatch[1]
      const target = store.get(targetHash)
      if (!target) return notFound(res, 'Block not found')

      // Read optional body for requester info
      let requestedBy = 'sandbox'
      let reason = 'erasure_request'
      try {
        const body = await readBody(req)
        if (body) {
          const parsed = JSON.parse(body)
          if (parsed.requested_by) requestedBy = parsed.requested_by
          if (parsed.reason) reason = parsed.reason
        }
      } catch (_) {
        // No body or invalid JSON — use defaults
      }

      // Create the tombstone block via SDK
      const tombstoneBlock = tombstone(targetHash, requestedBy, { reason })

      // Replace target block's state with tombstoned marker
      const tombstoned = store.get(targetHash)
      if (tombstoned) {
        tombstoned.state = { tombstoned: true }
      }

      // Insert the tombstone block
      insertBlock(tombstoneBlock)

      return json(res, tombstoneBlock, 200)
    }

    // GET /chain/:hash
    const chainMatch = path.match(/^\/chain\/([a-f0-9]{64})$/)
    if (chainMatch && req.method === 'GET') {
      const resolve = async (h) => store.get(h) || null
      const result = await chain(chainMatch[1], resolve)
      return json(res, { length: result.length, chain: result })
    }

    // GET /forward/:hash — find blocks that reference this hash
    const forwardMatch = path.match(/^\/forward\/([a-f0-9]{64})$/)
    if (forwardMatch && req.method === 'GET') {
      const targetHash = forwardMatch[1]
      if (!store.has(targetHash)) return notFound(res, 'Block not found')

      const referencing = []
      for (const block of store.values()) {
        if (!block.refs) continue
        for (const [role, ref] of Object.entries(block.refs)) {
          const hashes = Array.isArray(ref) ? ref : [ref]
          if (hashes.includes(targetHash)) {
            referencing.push({ block, role })
          }
        }
      }

      const typeFilter = url.searchParams.get('type')
      const roleFilter = url.searchParams.get('role')
      let results = referencing
      if (typeFilter) results = results.filter(r => r.block.type === typeFilter || r.block.type.startsWith(typeFilter + '.'))
      if (roleFilter) results = results.filter(r => r.role === roleFilter)

      return json(res, { count: results.length, referencing: results })
    }

    // GET /heads
    if (path === '/heads' && req.method === 'GET') {
      const headBlocks = [...heads.keys()].map(h => store.get(h)).filter(Boolean)
      return json(res, { count: headBlocks.length, blocks: headBlocks })
    }

    // POST /fb — natural language entry point
    if (path === '/fb' && req.method === 'POST') {
      const body = await readBody(req)
      const { text } = JSON.parse(body)

      if (!text || typeof text !== 'string') {
        return error(res, 400, 'text is required')
      }

      const result = fb(text)

      // Insert all generated blocks into the store
      for (const block of result.blocks) {
        if (!store.has(block.hash)) {
          insertBlock(block)
        }
      }

      return json(res, result, 201)
    }

    // POST /blocks — create (supports both unsigned and signed wrappers)
    if (path === '/blocks' && req.method === 'POST') {
      const body = await readBody(req)
      const parsed = JSON.parse(body)

      let type, state, refs, authorHash, signature

      if (parsed.foodblock) {
        // Signed wrapper: { foodblock: { type, state, refs }, author_hash, signature }
        ;({ type, state, refs } = parsed.foodblock)
        authorHash = parsed.author_hash
        signature = parsed.signature

        if (!authorHash || !signature) {
          return error(res, 400, 'Signed wrapper requires author_hash and signature')
        }

        // Verify signature if author's public key is available
        const authorBlock = store.get(authorHash)
        if (authorBlock && authorBlock.state && authorBlock.state.public_key) {
          const valid = verify(parsed, authorBlock.state.public_key)
          if (!valid) {
            return error(res, 403, 'Invalid signature')
          }
        }
      } else {
        // Unsigned block
        ;({ type, state, refs } = parsed)
        authorHash = (refs && refs.author) || parsed.author_hash || null
        signature = null
      }

      if (!type) return error(res, 400, 'type is required')
      if (type.length > 100) return error(res, 400, 'type must be 100 characters or less')

      const block = create(type, state || {}, refs || {})

      // Verify hash integrity — use block's actual state (may have injected instance_id)
      const expectedHash = hash(type, block.state, block.refs)
      if (block.hash !== expectedHash) {
        return error(res, 400, 'Hash integrity check failed')
      }

      // Attach author_hash if provided
      if (authorHash) {
        block.author_hash = authorHash
      }

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
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error('Request body too large. Max 1MB.'))
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const PORT = process.env.PORT || 3111

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     FoodBlock Sandbox v0.4.0             ║
  ║     Protocol ${PROTOCOL_VERSION}                       ║
  ║     http://localhost:${PORT}                ║
  ╠══════════════════════════════════════════╣
  ║  ${store.size} blocks loaded (3 stories)        ║
  ║                                          ║
  ║  Try:                                    ║
  ║  curl localhost:${PORT}/blocks              ║
  ║  curl localhost:${PORT}/blocks?type=actor    ║
  ║  curl localhost:${PORT}/chain/<hash>         ║
  ║                                          ║
  ║  New in v0.4:                            ║
  ║  curl -X POST localhost:${PORT}/blocks/batch ║
  ║  curl -X DELETE localhost:${PORT}/blocks/<h> ║
  ╚══════════════════════════════════════════╝
  `)
})
