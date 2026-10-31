// A FoodBlock node over HTTP (modules/nodes.md): two messages, and how to find it.
//   POST /pull   a pull { since, limit, filter, heads }, or a signed pull (adds signer, node, a counter or a challenge,
//                signature; no time) -> { node, request, blocks: [{ n, message }], next, signature }
//   POST /push   { messages, for }  ->  { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }
//   GET  /challenge                  a fresh challenge for one signed request: { challenge }
//   GET  /.well-known/foodblock-admission  { admission, per_stranger, strangers_per_day, order_channel, software_chose }: the admission choices in effect, this node's own (its config) where the owner's rule is silent
//   GET  /.well-known/foodblock     { protocol, version, node, holds, speaks_for, admission, endpoints: { pull, push, challenge } }
// The node belongs to its holder (a person or a machine) and signs every answer with a key of theirs, brought in by
// a key grant. Every check is the SDK's: valid(block, context), equivocation (`sync.accept`), signed requests
// (`sync.pullRefusals`), strangers (`sync.admissionRefusals`). The node only stores, numbers and answers. Any type
// is stored and passed on: open types carry no authority.
import express from 'express'
import fb from '@foodxdev/foodblock'

const HASH = new RegExp(fb.PROTOCOL.grammar.id)
const DAY = 24 * 60 * 60 * 1000
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
const placeholders = (values, start = 1) => values.map((_, i) => `$${start + i}`).join(', ')
const authorOf = (block) => block.refs?.author || block.hash
const isSealed = (message) => Boolean(message?.header)
// A sealed block as the node knows it: its public header, so chains, folds over headers, and filters on author and
// hash still work. Its body is only in the copies.
const headerBlock = ({ header, header_signature }) => ({ hash: header.hash, state: { seq: header.seq, audience: ['sealed'], ...(header.withheld ? { withheld: true } : {}), ...(header.skip ? { skip: true } : {}) }, refs: { author: header.author, prev: header.prev }, header_signature })
// A waiting row keeps its recipients as a JSON list; an older row holds one bare id, read as a list of one.
const waitingRecipients = (text) => (!text ? [] : text.startsWith('[') ? JSON.parse(text) : [text])
const blockOf = (message) => (isSealed(message) ? headerBlock(message) : fb.unwrap(message))
// what a block names that its judgement may rest on: its prev, schema, causal heads, the grant it acts under or passes on, what it answers or updates, its counted_to
const namedBy = (block) => [block.refs?.prev, block.refs?.schema, ...list(block.refs?.after), ...list(block.refs?.under), ...list(block.refs?.parent), ...list(block.refs?.answers), ...list(block.refs?.updates), ...list(block.refs?.for), block.state?.counted_to].filter((h) => typeof h === 'string' && HASH.test(h))

// the most challenges a node keeps unanswered at once
const CHALLENGES = 10000
// a message is kept as JSON text (sql/schema.sql); a store that hands back an object is read as it is
const parse = (m) => (typeof m === 'string' ? JSON.parse(m) : m)

/** The store: one append-only table of blocks, numbered on arrival; sealed copies; blocks waiting; the highest counter of each signer; challenges issued. */
export function store(pool) {
  const rows = async (where, params, tail = '') => (await pool.query(`SELECT n, hash, message, arrived_at FROM blocks WHERE ${where} ORDER BY n ${tail}`, params)).rows
  // a block is read under the id the node computed when it took it (in the suite of the key that signed it, core.md section 2): a key's first
  // block after a move to a suite of another hash has an id its bytes alone do not show (security E, n10)
  const read = (row) => { const message = parse(row.message); return { n: Number(row.n), message, block: { ...blockOf(message), hash: row.hash } } }
  return {
    // the rows after an arrival number, at most `limit` of them (the query stops there: a pull never reads the whole store for one answer)
    async since(n, limit) { return (await rows('n > $1', [n], Number.isInteger(limit) ? `LIMIT ${limit}` : '')).map(read) },
    // the blocks that take one of these places in a chain (author and prev): the other half of a pair travels with it (nodes.md, Pull)
    async samePlace(places) {
      if (!places.length) return []
      // a key's first block (seq 1) rivals every other first block of its author's keys, whatever bringer it names (core.md, invariant 3)
      const where = places.map((p, i) => p.first ? `(author = $${2 * i + 1} AND (prev = $${2 * i + 2} OR seq = 1))` : `(author = $${2 * i + 1} AND prev = $${2 * i + 2})`).join(' OR ')
      return (await rows(where, places.flatMap((p) => [p.author, p.prev]))).map(read)
    },
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
          [block.hash, authorOf(block), block.state?.seq ?? null, block.refs?.prev ?? null, isSealed(message), JSON.stringify(message)])
      } catch (error) { if (error.code !== '23505') throw error } // already held: the same signed bytes
    },
    async copy(hash, recipient, message, author) {
      try { await pool.query('INSERT INTO copies (hash, recipient, message, author) VALUES ($1, $2, $3, $4)', [hash, recipient, JSON.stringify(message), author]) } catch (error) { if (error.code !== '23505') throw error }
    },
    // the copies sealed to one recipient for these blocks only: a pull reads the window it answers, never every copy the node holds
    async copiesFor(recipient, hashes) {
      if (!recipient || !hashes.length) return []
      return (await pool.query(`SELECT hash, message FROM copies WHERE recipient = $1 AND hash IN (${placeholders(hashes, 2)})`, [recipient, ...hashes])).rows.map((row) => ({ ...row, message: parse(row.message) }))
    },
    // what an author has put on this node since a time: blocks held, blocks waiting, and sealed copies kept for their blocks
    async arrivedSince(author, time) {
      const held = (await pool.query('SELECT count(*) AS c FROM blocks WHERE author = $1 AND arrived_at > $2', [author, time])).rows[0].c
      const waits = (await pool.query('SELECT count(*) AS c FROM waiting WHERE author = $1', [author])).rows[0].c
      const copies = (await pool.query('SELECT count(*) AS c FROM copies WHERE author = $1 AND arrived_at > $2', [author, time])).rows[0].c
      return Number(held) + Number(waits) + Number(copies)
    },
    // what everyone outside these ids (the owners and the rule's parties) has put on this node since a time: the strangers' total
    async strangersSince(exempt, time) {
      const rows = [
        ...(await pool.query('SELECT author, count(*) AS c FROM blocks WHERE arrived_at > $1 GROUP BY author', [time])).rows,
        ...(await pool.query('SELECT author, count(*) AS c FROM waiting GROUP BY author')).rows,
        ...(await pool.query('SELECT author, count(*) AS c FROM copies WHERE arrived_at > $1 GROUP BY author', [time])).rows
      ]
      return rows.filter((row) => !exempt.includes(row.author)).reduce((n, row) => n + Number(row.c), 0)
    },
    async holds() { return (await pool.query('SELECT hash FROM blocks WHERE author = hash ORDER BY hash')).rows.map((row) => row.hash) },
    // the waiting blocks that wait for one of these hashes: a row is tried again only when what it needs arrives, never with every push
    async waitingFor(hashes) { return hashes.length ? (await pool.query(`SELECT hash, message, recipient, since FROM waiting WHERE needs IN (${placeholders(hashes)})`, hashes)).rows.map((row) => ({ ...row, message: parse(row.message) })) : [] },
    async expire(before) { await pool.query('DELETE FROM waiting WHERE since < $1', [before]) },
    async waitingOf(author) { return Number((await pool.query('SELECT count(*) AS c FROM waiting WHERE author = $1', [author])).rows[0].c) },
    async heldAs(hash, author) { return (await pool.query('SELECT hash FROM blocks WHERE hash = $1 AND author = $2', [hash, author])).rows.length > 0 },
    async holdsGenesis(author) { return (await pool.query('SELECT hash FROM blocks WHERE hash = $1 AND author = $1', [author])).rows.length > 0 },
    async wait(block, message, recipients, needs) {
      await pool.query('DELETE FROM waiting WHERE hash = $1', [block.hash])
      await pool.query('INSERT INTO waiting (hash, message, recipient, author, needs) VALUES ($1, $2, $3, $4, $5)', [block.hash, JSON.stringify(message), recipients?.length ? JSON.stringify(recipients) : null, authorOf(block), needs])
    },
    async unwait(hashes) { if (hashes.length) await pool.query(`DELETE FROM waiting WHERE hash IN (${placeholders(hashes)})`, hashes) },
    // A signed request's proof against replay: the highest counter seen from a signer, or a challenge this node issued.
    async highest(signer) { const row = (await pool.query('SELECT highest FROM counters WHERE signer = $1', [signer])).rows[0]; return row ? Number(row.highest) : null },
    // one statement each, so two copies of one request racing cannot both pass: the counter only rises, a challenge is used once
    async count(signer, counter) {
      await pool.query('INSERT INTO counters (signer, highest) VALUES ($1, $2) ON CONFLICT (signer) DO NOTHING', [signer, -1])
      return (await pool.query('UPDATE counters SET highest = $2 WHERE signer = $1 AND highest < $2 RETURNING highest', [signer, counter])).rows.length > 0
    },
    // a challenge lives a day on this node's clock (housekeeping only): unanswered ones are dropped as new ones are issued (door/t2: they had piled up)
    // and at most CHALLENGES wait at once: past that the oldest go first, so a stranger asking all day fills no table. Who may ask, and how often, is
    // this node's own front door's promise (nodes.md, A node's promise); the protocol and this reference node keep no list of who is identified
    async issue(challenge) {
      await pool.query('DELETE FROM challenges WHERE issued_at < $1', [new Date(Date.now() - DAY)])
      const waiting = Number((await pool.query('SELECT count(*) AS c FROM challenges WHERE used = false')).rows[0].c)
      if (waiting >= CHALLENGES) {
        const old = (await pool.query('SELECT challenge FROM challenges WHERE used = false ORDER BY issued_at, challenge LIMIT $1', [waiting - CHALLENGES + 1])).rows.map((row) => row.challenge)
        if (old.length) await pool.query(`DELETE FROM challenges WHERE challenge IN (${placeholders(old)})`, old)
      }
      await pool.query('INSERT INTO challenges (challenge) VALUES ($1)', [challenge])
    },
    async issued(challenge) { return (await pool.query('SELECT challenge FROM challenges WHERE challenge = $1 AND used = false', [challenge])).rows.length > 0 },
    async use(challenge) { return (await pool.query('UPDATE challenges SET used = true WHERE challenge = $1 AND used = false RETURNING challenge', [challenge])).rows.length > 0 },
    // a sealed header the body under its hash proved false (the core's false_headers): it was never that block, so the block takes its row
    async dropFalseHeader(hash) { await pool.query('DELETE FROM blocks WHERE hash = $1 AND sealed = true', [hash]) }
  }
}

/**
 * The owner's admission rule (§10), the published block whose hash discovery names: `state.parties` (ids always
 * admitted) and `state.per_stranger` (blocks a day from each other sender, counted per sender; 0 refuses strangers), fields its schema
 * declares. Waiting blocks count against it. Where the owner states no `per_stranger` (or publishes no rule), the protocol reads no
 * limit (nodes.md: the SDK's admission refuses only by a number someone stated); this node then applies its own choice, `chosen`
 * (createNode's `perStranger`, from its config), and publishes it as its own at /.well-known/foodblock-admission. With neither, no limit.
 * `strangersPerDay` is this node's own total for all strangers together, stated by its owner and always published as the node's word.
 */
function admissionRule(blocks, hash, owners, chosen, strangersPerDay) {
  const found = hash ? blocks.find((one) => one.hash === hash) : null
  const rule = found && owners.includes(authorOf(found)) ? found.state : null
  const state = rule || {}
  const stated = Number.isInteger(state.per_stranger)
  const limit = stated ? state.per_stranger : chosen
  const exempt = [...new Set([...owners, ...list(state.parties)])]
  const exemptAuthor = (id) => exempt.includes(id)
  return {
    hash: rule ? hash : null,
    state,
    // the per_stranger in effect, and whose word it is: the owner's rule, this node's config, or no one's (no limit)
    perStranger: { limit, by: stated ? 'owner' : 'node' },
    // the node's own total of stranger blocks a day, stated by its owner (no default); every sender outside the owners and the rule's parties shares it
    strangersPerDay,
    exempt,
    // `speaks`: whether the block speaks for its author (a block of a key rotated out off its counted line, frozen or void counts for
    // nothing, so it is admitted only as anyone else's block is: a thief with an old key cannot fill the store under her name)
    admits: async (db, block, admittedNow, speaks = true) => {
      const author = authorOf(block)
      if (exemptAuthor(author) && speaks) return true
      if ((await db.arrivedSince(author, new Date(Date.now() - DAY))) + (admittedNow.get(author) || 0) >= limit) return false
      const sum = [...admittedNow].filter(([id]) => !exemptAuthor(id)).reduce((n, [, c]) => n + c, 0)
      return (await db.strangersSince(exempt, new Date(Date.now() - DAY))) + sum < strangersPerDay
    }
  }
}

/**
 * The node. `pool` is a pg Pool (or anything with its query method); `holder` the id of the person or machine whose
 * node it is; `key` ({ public_key_sign, private_key }) a key of the holder that signs every answer; `owners` the ids
 * it speaks for (default the holder); `admission` the hash of the owner's admission block; `url` where it is reached;
 * `ttl` how long a block may wait for its prev (ms); `perStranger` this node's own per_stranger where the owner's rule states none
 * (an integer, required; 0 refuses strangers), published as its own. Also required, each the owner's own number: `waitingPerAuthor`, `copyRecipients`,
 * `copyBytes` (what one author may leave waiting, and the most recipients and bytes of sealed copies one push adds). Also required: `admission` (the hash, or null for no rule), `cap`
 * (blocks in one pull answer), `servesPairs` and `takesPairs` (booleans). None has a default.
 * Returns the Express app, with `app.node` = { pull, push, wellKnown, announcement } for use without HTTP.
 */
export function createNode({ pool, holder, key, owners = holder ? [holder] : [], admission, url = '', ttl = DAY, cap, scan = 5000, perStranger, strangersPerDay, servesPairs, takesPairs, waitingPerAuthor, copyRecipients, copyBytes } = {}) {
  // The owner states nine choices; the node fills in none of them (a missing one is refused, by name).
  if (!(Number.isInteger(perStranger) && perStranger >= 0)) throw new Error('node: perStranger is required: a whole number of blocks a day from each stranger (0 refuses strangers)')
  if (!(Number.isInteger(strangersPerDay) && strangersPerDay >= 0)) throw new Error('node: strangersPerDay is required: a whole number, the most blocks one day may bring from all strangers together (0 refuses strangers)')
  if (admission === undefined || (admission !== null && !(typeof admission === 'string' && HASH.test(admission)))) throw new Error('node: admission is required: the hash of the owner\'s admission block, or null for no rule')
  if (!(Number.isInteger(cap) && cap >= 1)) throw new Error('node: cap is required: a whole number of blocks, 1 or more, at most in one pull answer')
  if (typeof servesPairs !== 'boolean') throw new Error('node: servesPairs is required: true or false')
  if (typeof takesPairs !== 'boolean') throw new Error('node: takesPairs is required: true or false')
  if (!(Number.isInteger(waitingPerAuthor) && waitingPerAuthor >= 0)) throw new Error('node: waitingPerAuthor is required: a whole number of blocks that may wait for one author (0 keeps none)')
  if (!(Number.isInteger(copyRecipients) && copyRecipients >= 0)) throw new Error('node: copyRecipients is required: a whole number, the most recipients one sealed block may be copied to (0 keeps no copies)')
  if (!(Number.isInteger(copyBytes) && copyBytes >= 0)) throw new Error('node: copyBytes is required: a whole number, the most bytes of sealed copies one push may add (0 keeps none)')
  if (!holder || !key?.private_key) throw new Error('node: a node signs its answers with a key of its holder: give holder and key')
  const db = store(pool)
  const refuse = (message) => Object.assign(new Error(message), { status: 400 })

  async function wellKnown() {
    const held = (await db.around(owners, admission ? [admission] : [])).map((entry) => entry.block)
    return fb.sync.wellKnown({ node: holder, holds: await db.holds(), speaks_for: owners, admission: admissionRule(held, admission, owners, perStranger, strangersPerDay).hash,
      endpoints: url ? { pull: `${url}/pull`, push: `${url}/push`, challenge: `${url}/challenge` } : {} })
  }

  // The discovery document is closed (the SDK refuses a field it does not list), so what this node's software chose sits beside it, as plain data.
  async function admissionInEffect() {
    const held = (await db.around(owners, admission ? [admission] : [])).map((entry) => entry.block)
    const rule = admissionRule(held, admission, owners, perStranger, strangersPerDay)
    // What this node chooses where the owner's rule is silent (consent.md, No default; nodes.md), printed as plain data so owners and senders see it:
    // per_stranger is the owner's, else this node's stated choice;
    // no order_channel means a person writes first. `software_chose` names each choice that is this node's, not the owner's.
    const state = rule.state, channel = Array.isArray(state.order_channel)
    return { admission: rule.hash, per_stranger: rule.perStranger.limit, order_channel: channel ? state.order_channel : [], strangers_per_day: rule.strangersPerDay, software_chose: [...(rule.perStranger.by === 'node' ? ['per_stranger'] : []), 'strangers_per_day', ...(channel ? [] : ['order_channel'])] }
  }

  // A signed request: its signer's live keys open it, it is for this node, and its counter is above the highest seen
  // from that signer, or its challenge is one this node issued and has not seen used. No clock is read.
  async function checkSigned(request, check, who) {
    // a request that is malformed, for another node, or replayed is refused before the signer's chain is read: a forged request costs one
    // cheap check, never a load of someone else's chain (only the signature, which needs their keys, waits for it)
    const challenge0 = typeof request.challenge === 'string' ? request.challenge : null
    const cheap = fb.sync[check](request, { node: holder, keys: [], highest: await db.highest(who), issued: challenge0 && await db.issued(challenge0) ? [challenge0] : [] })
      .filter((one) => !/not signed by its signer/.test(one.detail))
    if (cheap.length) throw refuse(cheap.map((one) => `${one.code}: ${one.detail}`).join('; '))
    // a request is signed by a live key of its signer (nodes.md, Messages): a rotated-out, frozen or void key opens no door (r7)
    const keys = fb.identity.liveKeys(who, (await db.byAuthor(who)).map((entry) => entry.block))
    const challenge = typeof request.challenge === 'string' ? request.challenge : null
    const wrong = fb.sync[check](request, { node: holder, keys, highest: await db.highest(who), issued: challenge && await db.issued(challenge) ? [challenge] : [] })
    if (wrong.length) throw refuse(wrong.map((one) => `${one.code}: ${one.detail}`).join('; '))
    if (!(challenge ? await db.use(challenge) : await db.count(who, request.counter))) throw refuse('replay: this request was already answered')
  }

  // Pull: every match the signer may see since an arrival number, oldest first, unranked. A signed pull also gets the
  // copies sealed to its signer; anyone else gets a sealed block's public header.
  async function pull(request = {}) {
    const signed = request.signature !== undefined
    if (!signed && !Object.keys(request).every((name) => fb.PROTOCOL.messages.pull.includes(name))) throw refuse(`a pull is { ${fb.PROTOCOL.messages.pull.join(', ')} }, or a signed pull`)
    const since = Number(request.since || 0)
    if (!Number.isInteger(since) || since < 0) throw refuse('since is an arrival number')
    const who = signed ? request.signer : null
    if (signed) await checkSigned(request, 'pullRefusals', who)
    // the rows the answer can hold: at most `cap` after `since` with no filter and no heads asked, and at most a window of `scan` rows with
    // them (the query stops there either way: an unsigned pull never makes the node read the whole store; security n3). An answer that is
    // not full goes on from the last row read (`through`). Beside them, the blocks that share a place in a chain with one of them, so a lie
    // travels with its proof.
    const filtered = Boolean(request.filter || request.heads)
    const after = await db.since(since, filtered ? scan : cap)
    // the last row read: an answer that is not full goes on from here, and a rival row beyond it rides as a proof, never moves `next`
    const through = after.length ? after[after.length - 1].n : since
    const places = after.filter(({ block }) => typeof block.refs?.author === 'string' && typeof block.refs?.prev === 'string').map(({ block }) => ({ author: block.refs.author, prev: block.refs.prev, first: block.state?.seq === 1 }))
    const rows = [...after, ...(await db.samePlace(places)).filter((row) => !after.some((one) => one.n === row.n))]
    const copies = new Map((await db.copiesFor(who, rows.map(({ block }) => block.hash))).map((row) => [row.hash, row.message]))
    const log = rows.map(({ n, message, block }) => ({ n, block, ...(isSealed(message) ? { header: message.header, header_signature: message.header_signature } : {}),
      ...(copies.has(block.hash) ? { copies: { [who]: copies.get(block.hash) } } : {}) }))
    // a record filter reads each row's chain of updates back to its first version: those blocks and no more
    let held
    if (request.filter?.record) {
      const got = new Map(rows.map(({ block }) => [block.hash, block]))
      for (let ask = [...got.values()].map((b) => b.refs?.updates).filter((h) => typeof h === 'string' && !got.has(h)); ask.length;) {
        for (const entry of await db.around([], ask)) got.set(entry.block.hash, entry.block)
        ask = [...new Set(ask.map((h) => got.get(h)?.refs?.updates))].filter((h) => typeof h === 'string' && !got.has(h))
      }
      held = [...got.values()]
    }
    return fb.sync.answerPull(log, request, { node: holder, privateKey: key.private_key, signer: who, cap, servesPairs, held, suite: key.suite, through })
  }

  // What the core needs to judge blocks: every block they name, with each author's whole chain, and what those rest on in turn, to the end
  // (the causal closure). One step deep is not enough: an accept pushed alone needs the offer, and the offer its author's keys (security K).
  async function context(authors, hashes) {
    const got = new Map(), seenAuthors = new Set(), seenHashes = new Set()
    let A = [...new Set(authors.filter(Boolean))], H = [...new Set(hashes.filter(Boolean))]
    while (A.length || H.length) {
      A.forEach((a) => seenAuthors.add(a)); H.forEach((h) => seenHashes.add(h))
      for (const entry of await db.around(A, H)) if (!got.has(entry.block.hash)) got.set(entry.block.hash, entry)
      const blocks = [...got.values()].map((entry) => entry.block)
      A = [...new Set(blocks.map(authorOf))].filter((a) => a && !seenAuthors.has(a))
      H = [...new Set(blocks.flatMap(namedBy))].filter((h) => !seenHashes.has(h) && !got.has(h))
    }
    return [...got.values()]
  }

  // Push: the SDK decides what is well formed, signed by a live key of its author, in its chain and not history out of
  // place; the owner's rule decides who is admitted. A block whose key's previous block is not held waits.
  // A push off the wire is its text: the core reads it (`strict_push`), so a repeated key or a number written 1.0 is refused, never
  // normalised into a second form of a signed block (nodes.md, Push). An object is taken as given (a caller in this process).
  async function push(input = {}) {
    let body = input, strict = []
    if (typeof input === 'string') {
      try { strict = fb.sync.strictPush(input) } catch (error) { throw refuse(error.message) }
      body = JSON.parse(input)
    }
    const { messages, for: forWhom = {} } = body
    if (body.signature !== undefined) await checkSigned(body, 'pushRefusals', body.signer)
    // a sealed copy is kept only from a push its block's author signed (nodes.md): a stranger who saw a header stores no envelope
    const signer = body.signature !== undefined ? body.signer : null
    if (!Array.isArray(messages) || messages.length > 1000) throw refuse('a push is { messages, for }: messages a list of block messages (at most 1000)')
    const refused = [], incoming = []
    // The copies this push may add: the owner's numbers (copyRecipients for one block, copyBytes for the push). A sealed block that would pass
    // either is refused whole, never half kept.
    let copyBudget = copyBytes
    // Admission before the expensive work (§10, Admission): an author who is no owner and no listed party, and who already has all the blocks
    // the rule allows a day, is refused here, before any context is read or any block judged. The full rule is applied again after judging.
    const early = admissionRule((await db.around(owners, admission ? [admission] : [])).map((entry) => entry.block), admission, owners, perStranger, strangersPerDay)
    const sinceDay = new Date(Date.now() - DAY), claimed = new Map()
    for (const [i, message] of messages.entries()) {
      if (strict[i]?.length) {
        let hash = null
        try { hash = fb.unwrap(message).hash } catch {}
        for (const one of strict[i]) refused.push({ hash, code: one.code, detail: one.detail })
        continue
      }
      try {
        if (isSealed(message) && !(HASH.test(message.header.hash || '') && HASH.test(message.header.author || ''))) throw new Error('a sealed block is { header, header_signature, envelope }')
        let recipients = isSealed(message) && signer === message.header.author ? fb.sync.recipientsOf(forWhom, message.header.hash) : []
        if (recipients.length) {
          const cost = JSON.stringify(message).length * recipients.length
          if (recipients.length > copyRecipients || cost > copyBudget) { refused.push({ hash: message.header.hash, code: 'not_admitted', detail: "more sealed copies than this node's owner allows" }); continue }
          copyBudget -= cost
        }
        const block = blockOf(message), author = authorOf(block)
        if (!owners.includes(author) && !list(early.state.parties).includes(author)) {
          const done = (await db.arrivedSince(author, sinceDay)) + (claimed.get(author) || 0)
          const total = [...claimed.values()].reduce((n, c) => n + c, 0)
          if (done >= early.perStranger.limit || (await db.strangersSince(early.exempt, sinceDay)) + total >= strangersPerDay) { refused.push({ hash: block.hash, code: 'not_admitted', detail: "not admitted by this node's rule" }); continue }
          claimed.set(author, (claimed.get(author) || 0) + 1)
        }
        incoming.push({ message, block, recipients })
      } catch (error) { refused.push({ hash: null, code: 'shape', detail: error.message }) }
    }
    // Waiting blocks expire after the node's own time; one is tried again only when a block it waits for arrives (and what waited on it, in
    // turn), so a pile of waiting junk costs nothing on later pushes (nodes.md; security I).
    await db.expire(new Date(Date.now() - ttl))
    for (let ask = incoming.map((one) => one.block.hash).filter(Boolean); ask.length;) {
      const rows = (await db.waitingFor(ask)).filter((row) => !incoming.some((one) => one.block.hash === row.hash))
      ask = rows.map((row) => row.hash)
      for (const row of rows) incoming.push({ message: row.message, block: blockOf(row.message), recipients: waitingRecipients(row.recipient), waited: true })
    }
    const blocks = incoming.map((one) => one.block)
    // what the SDK needs to judge these blocks: the blocks each rests on (prev, the grant it acts under or passes on, the offer it answers, a counted_to)
    // with the blocks' own hashes too: what the store already holds under them (a body for a header held, or a header that lies about it)
    const around = await context([...blocks.map(authorOf), ...owners], [...blocks.map((block) => block.hash), ...blocks.flatMap(namedBy), ...(admission ? [admission] : [])])
    // a whole block the push brings again is judged again (the same bytes are taken again); a header held under an arriving block's hash stays
    const known = around.map((entry) => entry.block).filter((block) => block.type === undefined || !blocks.some((other) => other.hash === block.hash && other.type === undefined))
    // a block whose body the node already holds is nothing new (nodes.md, Rounds): it is not judged again, neither taken nor refused, and
    // the answer says it was held (the node's own word, `held`). The id must be the one the core computes and the signature the one held.
    const heldBodies = new Map(known.filter((block) => block.type !== undefined).map((block) => [block.hash, block]))
    const heldNow = new Set()
    for (const one of incoming) {
      const have = heldBodies.get(one.block.hash)
      if (!have || one.waited || isSealed(one.message) || one.block.type === undefined || have.signature !== one.block.signature) continue
      let id = null
      try { id = fb.idOf(one.block, known) } catch {}
      if (id === one.block.hash) heldNow.add(one.block.hash)
    }
    const schemas = new Map([...known, ...blocks].filter((block) => block.type === 'thing' && block.state?.kind === 'schema').map((block) => [block.hash, block]))
    const result = fb.sync.accept(blocks.filter((block) => block.type !== undefined && !heldNow.has(block.hash)), known, { takesPairs, schemas })
    // A sealed block arrives as its signed public header. The core checks it (a key of its author that speaks for it, the same key's next
    // seq, no rival, once its prev is held); the node does none of it.
    const sealedAnswer = fb.sync.acceptSealed(incoming.filter((one) => isSealed(one.message)).map((one) => one.message), [...known, ...result.taken], { takesPairs })
    const sealed = { taken: sealedAnswer.taken.map(headerBlock), waiting: sealedAnswer.waiting, refused: sealedAnswer.refused, equivocations: sealedAnswer.equivocations }

    // a header the body under its hash proved false gives the body its row (the body is its own proof; nodes.md)
    for (const hash of result.false_headers || []) await db.dropFalseHeader(hash)
    const rule = admissionRule([...known, ...result.taken], admission, owners, perStranger, strangersPerDay)
    const copyable = (id) => owners.includes(id) || list(rule.state.parties).includes(id)
    const taken = [], admittedNow = new Map()
    // whether each block speaks for its author, read once per author (the identity fold over what the node holds once this push is taken)
    const voices = new Map()
    const speaks = (block) => {
      const author = authorOf(block)
      if (!author || block.type === undefined) return true
      if (!voices.has(author)) voices.set(author, fb.identity.identityState(author, [...known, ...result.taken, ...blocks.filter((b) => b.type !== undefined)]).signed_by_author)
      return voices.get(author)[block.hash] !== false
    }
    // an arriving block is found by the id the core computed, or, for a key's first block after a move to a suite of another hash (whose id
    // its bytes alone do not show), by its signature: it is then kept under the id the core computed
    const entryOf = (hash, block) => incoming.find((one) => one.block.hash === hash) ||
      (block && incoming.find((one) => one.block.type === block.type && one.block.signature === block.signature && (one.block = { ...one.block, hash: block.hash })))
    for (const block of [...result.taken, ...sealed.taken]) {
      const one = entryOf(block.hash, block)
      if (!one) continue
      const { message, recipients } = one
      if (!(await rule.admits(db, block, admittedNow, speaks(block)))) { refused.push({ hash: block.hash, code: 'not_admitted', detail: "not admitted by this node's rule" }); continue }
      // A block to one of the people this node speaks for: a human author for a first message to a stranger. A live STOP refuses nothing:
      // the block is kept (its sender's chain goes on) and the fold reads it as stopped (consent.md, invariant 29).
      const to = owners.find((id) => id !== authorOf(block) && Object.values(block.refs || {}).flat().includes(id))
      // With no order channel in the owner's rule the protocol says nothing (consent.md, No default); this node's own choice is that a
      // person writes first, so it reads a missing channel as an empty one.
      const strangers = to ? fb.sync.admissionRefusals(block, to, [...known, ...result.taken], { order_channel: [], ...rule.state }, 0).filter((one) => one.code !== 'not_admitted') : []
      if (strangers.length) { for (const one of strangers) refused.push({ hash: block.hash, code: one.code, detail: one.detail }); continue }
      admittedNow.set(authorOf(block), (admittedNow.get(authorOf(block)) || 0) + 1)
      await keep(block, message, recipients, copyable)
      taken.push(block)
    }
    // Two blocks of one key naming one prev: both are kept and served with the chain, so anyone can publish the proof.
    // Each arriving block of a pair is admitted by the same rule as any other (an equivocation is no way past it), and kept once.
    const kept = new Set()
    for (const pair of [...result.equivocations, ...sealed.equivocations]) for (const hash of pair) {
      const one = entryOf(hash)
      if (!one || kept.has(hash) || taken.some((block) => block.hash === hash)) continue
      kept.add(hash)
      if (!(await rule.admits(db, one.block, admittedNow, speaks(one.block)))) continue
      admittedNow.set(authorOf(one.block), (admittedNow.get(authorOf(one.block)) || 0) + 1)
      await keep(one.block, one.message, one.recipients, copyable)
    }
    // A block waits on this node only when it comes in a signed push whose signer is its author (a claim of authorship by someone who did not
    // sign the push keeps nothing here), the author's genesis is held (else no key could ever judge it), the author has fewer than the owner's
    // waitingPerAuthor waiting, and the owner's admission rule admits one more from them; any other is answered as waiting but not kept: its
    // sender pushes it again (nodes.md). The quota and the admission count against the signer.
    const waiting = []
    const takenNow = new Set(taken.map((block) => block.hash))
    for (const wait of [...result.waiting, ...sealed.waiting]) {
      const one = entryOf(wait.hash), author = authorOf(one.block)
      const genesis = author && (takenNow.has(author) || await db.holdsGenesis(author))
      if (genesis && (one.waited || (signer === author && (await db.waitingOf(author)) < waitingPerAuthor && (await rule.admits(db, { refs: { author } }, admittedNow, true))))) {
        if (!one.waited) admittedNow.set(author, (admittedNow.get(author) || 0) + 1)
        await db.wait(one.block, one.message, one.recipients, wait.needs[0])
      }
      waiting.push(wait.hash)
    }
    // a copy its author signed for a sealed block already held (by an earlier header) is kept beside it, once the header held is the author's own
    const refusedNow = new Set([...result.refused, ...sealed.refused].map((one) => one.hash))
    for (const one of incoming) {
      if (!isSealed(one.message) || !one.recipients.length || !one.message.envelope || takenNow.has(one.block.hash) || refusedNow.has(one.block.hash)) continue
      // a late copy is a block too: the author's admission counts it, and only people this node speaks for, or the owner's rule lists, hold copies
      const author = one.message.header.author
      if (!(await db.heldAs(one.block.hash, author)) || !(await rule.admits(db, { refs: { author } }, admittedNow, true))) continue
      for (const recipient of one.recipients.filter(copyable)) await db.copy(one.block.hash, recipient, one.message, author)
      admittedNow.set(author, (admittedNow.get(author) || 0) + 1)
    }
    const allRefused = [...refused, ...result.refused, ...sealed.refused]
    await db.unwait(incoming.filter((one) => one.waited && !waiting.includes(one.block.hash)).map((one) => one.block.hash))
    // the node's own time it took the push, signed with the answer: a receipt its pusher may keep in a deal (nodes.md; promises.md, decision D12)
    return fb.sync.pushAnswer({ taken, waiting, refused: allRefused, equivocations: [...result.equivocations, ...sealed.equivocations], ...(heldNow.size ? { held: [...heldNow].sort() } : {}), at: new Date().toISOString() }, { node: holder, privateKey: key.private_key, suite: key.suite })
  }

  // a copy is kept only for a person this node speaks for or one the owner's admission rule lists
  async function keep(block, message, recipients, copyable) {
    if (!isSealed(message)) return db.put(block, fb.wrap(block))
    const { envelope, ...header } = message
    await db.put(block, header)
    if (envelope) for (const recipient of recipients.filter(copyable)) await db.copy(block.hash, recipient, message, authorOf(block))
  }


  const app = express()
  // the body is read as text: a push goes to the core as the bytes that came (strict_push); a pull is parsed here
  app.use(express.text({ type: () => true, limit: '4mb' }))
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  // a refusal says why; anything else says only that the node could not answer (no stack, no path, no database text)
  const route = (handler, { text = false } = {}) => async (req, res) => {
    try {
      const raw = typeof req.body === 'string' ? req.body : ''
      let input = {}
      if (text) input = raw || '{}'
      else if (raw) { try { input = JSON.parse(raw) } catch { throw refuse('the body is JSON') } }
      res.json(await handler(input))
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'the node could not answer' }) }
  }
  app.get('/health', route(async () => { try { await pool.query('SELECT 1') } catch { throw Object.assign(new Error('the store is not reachable'), { status: 503 }) } return { status: 'ok' } }))
  app.get('/.well-known/foodblock', route(wellKnown))
  app.get('/.well-known/foodblock-admission', route(admissionInEffect))
  app.get('/challenge', route(async () => { const challenge = fb.sync.newChallenge(); await db.issue(challenge); return { challenge } }))
  app.post('/pull', route(pull))
  app.post('/push', route(push, { text: true }))
  app.use((error, req, res, next) => { res.status(error.status && error.status < 500 ? error.status : 500).json({ error: error.status && error.status < 500 ? 'the request could not be read' : 'the node could not answer' }) })
  app.node = { pull, push, challenge: async () => { const challenge = fb.sync.newChallenge(); await db.issue(challenge); return { challenge } }, wellKnown, admissionInEffect, announcement: async () => fb.sync.announcement(await wellKnown()) }
  return app
}
