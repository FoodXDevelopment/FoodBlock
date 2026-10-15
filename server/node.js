// A FoodBlock 1.6 node over HTTP (spec/protocol.md §10): two messages, and how to find it.
//   POST /pull   a pull { since, limit, filter, heads }, or a signed pull (adds signer, node, nonce, at, signature)
//                -> { node, request, blocks: [{ n, message }], next, signature }
//   POST /push   { messages, for }  ->  { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }
//   GET  /.well-known/foodblock     { protocol, version, node, holds, speaks_for, admission, endpoints }
// The node belongs to its holder (a person or a machine) and signs every answer with a key of theirs, brought in by
// a key grant. Every check is the SDK's: the write check, signatures, key chains, history, equivocation
// (`sync.accept`), signed pulls (`sync.pullErrors`), and old-shape reading (`readAs`). The node only stores, numbers
// and answers.
import express from 'express'
import fb from '@foodxdev/foodblock'

const HASH = new RegExp(fb.PROTOCOL.grammar.hash)
const DAY = 24 * 60 * 60 * 1000
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
const placeholders = (values, start = 1) => values.map((_, i) => `$${start + i}`).join(', ')
const authorOf = (block) => block.refs?.author || block.hash
const isSealed = (message) => Boolean(message?.header)
// A sealed block as the node knows it: its public header, so chains, folds over headers, and filters on author and
// hash still work. Its body is only in the copies.
const headerBlock = ({ header }) => ({ hash: header.hash, state: { seq: header.seq, audience: ['sealed'] }, refs: { author: header.author, prev: header.prev } })
// A waiting row keeps its recipients as a JSON list; an older row holds one bare id, read as a list of one.
const waitingRecipients = (text) => (!text ? [] : text.startsWith('[') ? JSON.parse(text) : [text])
const blockOf = (message) => (isSealed(message) ? headerBlock(message) : fb.unwrap(message))

/** The store: one append-only table of blocks, numbered on arrival; sealed copies; blocks waiting; seen nonces. */
export function store(pool) {
  const rows = async (where, params, tail = '') => (await pool.query(`SELECT n, hash, message, arrived_at FROM blocks WHERE ${where} ORDER BY n ${tail}`, params)).rows
  const read = (row) => ({ n: Number(row.n), message: row.message, block: blockOf(row.message) })
  return {
    async since(n) { return (await rows('n > $1', [n])).map(read) },
    async all() { return (await rows('n > 0', [])).map(read) },
    // What a push needs to check these blocks: their authors' genesis, key grants and chains, and what they name.
    async around(authors, hashes) {
      const ids = [...new Set([...authors, ...hashes])]
      if (!ids.length) return []
      return (await rows(`hash IN (${placeholders(ids)}) OR author IN (${placeholders(authors, ids.length + 1)})`, [...ids, ...authors])).map(read)
    },
    async byAuthor(id) { return (await rows('hash = $1 OR author = $1', [id])).map(read) },
    async put(block, message) {
      try {
        await pool.query('INSERT INTO blocks (hash, author, seq, prev, sealed, message) VALUES ($1, $2, $3, $4, $5, $6)',
          [block.hash, authorOf(block), block.state?.seq ?? null, block.refs?.prev ?? null, isSealed(message), message])
      } catch (error) { if (error.code !== '23505') throw error } // already held: the same signed bytes
    },
    async copy(hash, recipient, message) {
      try { await pool.query('INSERT INTO copies (hash, recipient, message) VALUES ($1, $2, $3)', [hash, recipient, message]) } catch (error) { if (error.code !== '23505') throw error }
    },
    async copiesFor(recipient) { return recipient ? (await pool.query('SELECT hash, message FROM copies WHERE recipient = $1', [recipient])).rows : [] },
    async arrivedSince(author, time) {
      const held = (await pool.query('SELECT count(*) AS c FROM blocks WHERE author = $1 AND arrived_at > $2', [author, time])).rows[0].c
      const waits = (await pool.query('SELECT count(*) AS c FROM waiting WHERE author = $1', [author])).rows[0].c
      return Number(held) + Number(waits)
    },
    async holds() { return (await pool.query('SELECT hash FROM blocks WHERE author = hash ORDER BY hash')).rows.map((row) => row.hash) },
    async waiting() { return (await pool.query('SELECT hash, message, recipient, since FROM waiting')).rows },
    async wait(block, message, recipients, needs) {
      try { await pool.query('INSERT INTO waiting (hash, message, recipient, author, needs) VALUES ($1, $2, $3, $4, $5)', [block.hash, message, recipients?.length ? JSON.stringify(recipients) : null, authorOf(block), needs]) } catch (error) { if (error.code !== '23505') throw error }
    },
    async unwait(hashes) { if (hashes.length) await pool.query(`DELETE FROM waiting WHERE hash IN (${placeholders(hashes)})`, hashes) },
    async seen(nonce) { return (await pool.query('SELECT nonce FROM nonces WHERE nonce = $1', [nonce])).rows.length > 0 },
    async see(nonce) {
      try { await pool.query('INSERT INTO nonces (nonce) VALUES ($1)', [nonce]) } catch (error) { if (error.code !== '23505') throw error }
    }
  }
}

/**
 * The owner's admission rule (§10), the published block whose hash discovery names: `state.parties` (ids always
 * admitted) and `state.per_stranger` (blocks a day from anyone else; 0 refuses strangers), fields its schema
 * declares. Waiting blocks count against it. With no rule, the node admits every block the SDK takes.
 */
function admissionRule(blocks, hash, owners) {
  const found = hash ? blocks.find((one) => one.hash === hash) : null
  const rule = found && owners.includes(authorOf(found)) ? found.state : null
  return {
    hash: rule ? hash : null,
    admits: async (db, block, admittedNow) => {
      const author = authorOf(block)
      if (!rule || owners.includes(author) || list(rule.parties).includes(author)) return true
      const limit = Number.isInteger(rule.per_stranger) ? rule.per_stranger : 0
      return (await db.arrivedSince(author, new Date(Date.now() - DAY))) + (admittedNow.get(author) || 0) < limit
    }
  }
}

/**
 * The node. `pool` is a pg Pool (or anything with its query method); `holder` the id of the person or machine whose
 * node it is; `key` ({ public_key_sign, private_key }) a key of the holder that signs every answer; `owners` the ids
 * it speaks for (default the holder); `admission` the hash of the owner's admission block; `url` where it is reached;
 * `ttl` how long a block may wait for its prev (ms); `window` how far a signed pull's `at` may be from this clock (ms).
 * Returns the Express app, with `app.node` = { pull, push, wellKnown, announcement } for use without HTTP.
 */
export function createNode({ pool, holder, key, owners = holder ? [holder] : [], admission = null, url = '', ttl = DAY, window, cap = 500 } = {}) {
  if (!holder || !key?.private_key) throw new Error('node: a node signs its answers with a key of its holder: give holder and key')
  const db = store(pool)
  const refuse = (message) => Object.assign(new Error(message), { status: 400 })

  async function wellKnown() {
    const held = (await db.around(owners, admission ? [admission] : [])).map((entry) => entry.block)
    return fb.sync.wellKnown({ node: holder, holds: await db.holds(), speaks_for: owners, admission: admissionRule(held, admission, owners).hash,
      endpoints: url ? { pull: `${url}/pull`, push: `${url}/push` } : {} })
  }

  // Pull: every match the signer may see since an arrival number, oldest first, unranked. A signed pull also gets the
  // copies sealed to its signer; anyone else gets a sealed block's public header.
  async function pull(request = {}) {
    const signed = request.signature !== undefined
    if (!signed && !Object.keys(request).every((name) => fb.PROTOCOL.messages.pull.includes(name))) throw refuse(`a pull is { ${fb.PROTOCOL.messages.pull.join(', ')} }, or a signed pull`)
    const since = Number(request.since || 0)
    if (!Number.isInteger(since) || since < 0) throw refuse('since is an arrival number')
    const who = signed ? fb.sync.readMessage('signed_pull', request).signer : null // an older pull names its asker
    if (signed) {
      const keys = fb.identity.keysOf(who, (await db.byAuthor(who)).map((entry) => entry.block))
      const replay = typeof request.nonce === 'string' && await db.seen(request.nonce)
      const wrong = fb.sync.pullErrors(request, { node: holder, keys, seen: () => replay, ...(window ? { window } : {}) })
      if (wrong.length) throw refuse(wrong.join('; '))
      await db.see(request.nonce)
    }
    const copies = new Map((await db.copiesFor(who)).map((row) => [row.hash, row.message]))
    const log = (await db.since(since)).map(({ n, message, block }) => ({ n, block, ...(isSealed(message) ? { header: message.header, header_signature: message.header_signature } : {}),
      ...(copies.has(block.hash) ? { copies: { [who]: copies.get(block.hash) } } : {}) }))
    const held = request.filter?.record ? (await db.all()).map((entry) => entry.block) : undefined
    return fb.sync.answerPull(log, request, { node: holder, privateKey: key.private_key, signer: who, cap, held })
  }

  // Push: the SDK decides what is well formed, signed by a live key of its author, in its chain and not history out of
  // place; the owner's rule decides who is admitted. A block whose key's previous block is not held waits.
  async function push({ messages, for: forWhom = {} } = {}) {
    if (!Array.isArray(messages) || messages.length > 1000) throw refuse('a push is { messages, for }: messages a list of block messages (at most 1000)')
    const refused = [], incoming = []
    for (const message of messages) {
      try {
        if (isSealed(message) && !(HASH.test(message.header.hash || '') && HASH.test(message.header.author || ''))) throw new Error('a sealed block is { version, header, header_signature, envelope }')
        incoming.push({ message, block: blockOf(message), recipients: fb.sync.recipientsOf(forWhom, message.header?.hash) })
      } catch (error) { refused.push({ hash: null, code: 'shape', detail: error.message }) }
    }
    // Waiting blocks are tried again with every push, until they expire.
    const now = new Date().toISOString(), expired = []
    for (const row of await db.waiting()) {
      if (fb.sync.waitedTooLong(new Date(row.since).toISOString(), now, ttl)) { expired.push(row.hash); continue }
      if (!incoming.some((one) => one.block.hash === row.hash)) incoming.push({ message: row.message, block: blockOf(row.message), recipients: waitingRecipients(row.recipient), waited: true })
    }
    await db.unwait(expired)
    const blocks = incoming.map((one) => one.block)
    const named = blocks.flatMap((block) => [block.refs?.prev, block.refs?.schema, ...list(block.refs?.after)]).filter(Boolean)
    const around = await db.around([...new Set(blocks.map(authorOf))], [...new Set([...named, ...(admission ? [admission] : [])])])
    const known = around.map((entry) => entry.block).filter((block) => !blocks.some((other) => other.hash === block.hash))
    const schemas = new Map([...known, ...blocks].filter((block) => fb.isA(block, 'thing', 'schema')).map((block) => [block.hash, block]))
    const result = fb.sync.accept(blocks.filter((block) => block.type !== undefined), known, { schemas })
    const sealed = acceptSealed(incoming.filter((one) => isSealed(one.message)), [...known, ...result.taken])

    const rule = admissionRule([...known, ...result.taken], admission, owners)
    const taken = [], admittedNow = new Map()
    const entryOf = (hash) => incoming.find((one) => one.block.hash === hash)
    for (const block of [...result.taken, ...sealed.taken]) {
      const { message, recipients } = entryOf(block.hash)
      if (!(await rule.admits(db, block, admittedNow))) { refused.push({ hash: block.hash, code: 'not_admitted', detail: "not admitted by this node's rule" }); continue }
      admittedNow.set(authorOf(block), (admittedNow.get(authorOf(block)) || 0) + 1)
      await keep(block, message, recipients)
      taken.push(block)
    }
    // Two blocks from one key with one seq: both are kept and served with the chain, so anyone can publish the proof.
    for (const pair of [...result.equivocations, ...sealed.equivocations]) for (const hash of pair) { const one = entryOf(hash); if (one) await keep(one.block, one.message, one.recipients) }
    const waiting = []
    for (const wait of [...result.waiting, ...sealed.waiting]) {
      const one = entryOf(wait.hash)
      await db.wait(one.block, one.message, one.recipients, wait.needs[0])
      waiting.push(wait.hash)
    }
    const allRefused = [...refused, ...result.refused, ...sealed.refused]
    await db.unwait(incoming.filter((one) => one.waited && !waiting.includes(one.block.hash)).map((one) => one.block.hash))
    return fb.sync.pushAnswer({ taken, waiting, refused: allRefused, equivocations: [...result.equivocations, ...sealed.equivocations] }, { node: holder, privateKey: key.private_key })
  }

  async function keep(block, message, recipients = []) {
    if (!isSealed(message)) return db.put(block, fb.wrap(block, message.version || fb.VERSION))
    const { envelope, ...header } = message
    await db.put(block, header)
    if (envelope) for (const recipient of recipients) await db.copy(block.hash, recipient, message)
  }

  const app = express()
  app.use(express.json({ limit: '4mb' }))
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  const route = (handler) => async (req, res) => {
    try { res.json(await handler(req.body || {})) } catch (error) { res.status(error.status || 500).json({ error: error.message }) }
  }
  app.get('/health', route(async () => { await pool.query('SELECT 1'); return { status: 'ok' } }))
  app.get('/.well-known/foodblock', route(wellKnown))
  app.post('/pull', route(pull))
  app.post('/push', route(push))
  app.node = { pull, push, wellKnown, announcement: async () => fb.sync.announcement(await wellKnown()) }
  return app
}

/**
 * Sealed blocks arrive as their signed public header: taken when the header is signed by a live key of its author
 * and its prev is held; waiting when the prev is not; two from one key with one seq prove a lie. The body stays
 * sealed, so the write check is the recipients' to make when they open it.
 */
function acceptSealed(incoming, held) {
  const taken = [], waiting = [], refused = [], equivocations = []
  const has = new Set(held.map((block) => block.hash))
  const slots = new Map()
  for (const block of held) if (Number.isInteger(block.state?.seq) && block.type !== undefined) {
    const signer = fb.identity.signerOf(block, fb.identity.keyTimeline(block.refs.author, held))
    if (signer) slots.set(`${block.refs.author} ${signer} ${block.state.seq}`, block.hash)
  }
  for (const { message, block } of [...incoming].sort((a, b) => (a.block.state.seq ?? 0) - (b.block.state.seq ?? 0))) {
    const { header } = message
    const signer = fb.identity.keysOf(header.author, held).find((key) => fb.headerSignedBy(message, key))
    if (!Number.isInteger(header.seq) || header.seq < 1 || !HASH.test(header.prev || '')) { refused.push({ hash: block.hash, code: 'shape', detail: 'a header is { author, seq, prev, hash }' }); continue }
    if (!has.has(header.prev)) { waiting.push({ hash: block.hash, needs: [header.prev] }); continue }
    if (!signer) { refused.push({ hash: block.hash, code: 'bad_signature', detail: 'the header is not signed by a live key of its author' }); continue }
    const slot = `${header.author} ${signer} ${header.seq}`
    if (slots.has(slot) && slots.get(slot) !== block.hash) {
      equivocations.push([slots.get(slot), block.hash].sort()); continue
    }
    slots.set(slot, block.hash)
    has.add(block.hash)
    taken.push(block)
  }
  return { taken, waiting, refused, equivocations }
}
