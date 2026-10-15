// Between nodes (spec/protocol.md §10, Encoding: Messages): two messages, Pull and Push. Pull asks for the blocks the
// asker may see since the responder's arrival number (never a time); `heads: true` returns only the heads among the
// matches. A signed pull names the asker, the node it is for, a fresh nonce and `at`. Push sends signed blocks; a node
// takes those signed by a live key of their author that pass the write check, holds back (waiting) those whose prev
// it lacks, lists the second of two blocks at one seq beside the first (`equivocations`), and refuses the rest, each
// { hash, code, detail } with a code from protocol.json's refusals.codes. Every node answer is signed by the node
// (invariant 18).
const crypto = require('crypto')
const { canonicalJSON } = require('./canonical.cjs')
const { signMessage, verifyMessage } = require('./sign.cjs')
const { refusals, ordered } = require('./protocol.cjs')
const { addDuration } = require('./grant.cjs')
const { readAs } = require('./aliases.cjs')
const { signedByAuthor, keyTimeline, signerOf, isGenesis, is16Genesis, historyCounts } = require('./identity.cjs')
const { causalOrder, indexOf } = require('./order.cjs')
const { wrap } = require('./write.cjs')
const { VERSION, PROTOCOL, GRAMMAR, LIMITS } = require('./spec.cjs')

const M = PROTOCOL.messages
const list = (ref) => (Array.isArray(ref) ? ref : ref ? [ref] : [])
const pick = (object, keys) => Object.fromEntries(keys.filter((key) => object[key] !== undefined).map((key) => [key, object[key]]))

// ---- Pull ----
/** A pull: { since (exclusive arrival number, 0 from the start), limit (the asker's wish), filter, heads }. */
const pullRequest = ({ since = 0, limit, filter, heads } = {}) => pick({ since, limit, filter, heads }, M.pull)

/** A signed pull: the request, plus asker, node, a fresh nonce and at, signed by one of the asker's keys. */
const signPull = (request, { asker, node, privateKey, nonce = crypto.randomBytes(16).toString('hex'), at = new Date().toISOString() }) =>
  signMessage({ ...pullRequest(request), asker, node, nonce, at }, privateKey)

// How far a signed message's `at` may be from the node's clock, either way (protocol.json limits.signed_window), in ms.
const WINDOW = Date.parse(addDuration('2000-01-01T00:00:00.000Z', LIMITS.signed_window)) - Date.parse('2000-01-01T00:00:00.000Z')

/**
 * Why a node refuses a signed message (a pull, or a push: `fields` its keys), for the node `node` whose clock reads
 * `now`: [{ code, detail }] with codes from protocol.json's refusals.codes.message, [] when it may be answered. `keys`
 * are the signer's live signing keys; `seen(nonce)` says whether the node has seen this nonce; `window` (ms, default
 * limits.signed_window) is how far `at` may be from its own clock.
 */
function messageRefusals(message, { node, now = new Date().toISOString(), keys = [], seen = () => false, window = WINDOW, fields = M.signed_pull } = {}) {
  const w = (code, detail) => ({ code, detail })
  return ordered([
    ...(Object.keys(message || {}).every((key) => fields.includes(key)) ? [] : [w('bad_signature', `a signed message is { ${fields.join(', ')} }`)]),
    ...(message?.node === node ? [] : [w('wrong_node', 'the message names another node')]),
    ...(GRAMMAR.nonce.test(message?.nonce || '') ? (seen(message.nonce) ? [w('replay', 'this nonce was seen: a replay')] : []) : [w('replay', 'a signed message carries a fresh nonce')]),
    ...(GRAMMAR.time.test(message?.at || '') && Math.abs(Date.parse(message.at) - Date.parse(now)) <= window ? [] : [w('window', 'its at is outside this node\'s window')]),
    ...(keys.some((key) => verifyMessage(message, key)) ? [] : [w('bad_signature', 'it is not signed by its signer')])
  ], PROTOCOL.refusals.codes.message)
}
/** Why a node refuses a signed pull: [{ code, detail }]. */
const pullRefusals = (message, options = {}) => messageRefusals(message, { ...options, fields: M.signed_pull })
/** Why a node refuses a signed push: [{ code, detail }]. */
const pushRefusals = (message, options = {}) => messageRefusals(message, { ...options, fields: M.signed_push })
/** What is wrong with a signed pull, in plain words: [] when it may be answered. */
const pullErrors = (message, options) => pullRefusals(message, options).map((one) => one.detail)

/** Whether a block matches a pull filter (every key, ANDed; `type` read through aliases). `held` resolves records. */
function matches(block, filter = {}, held) {
  if (!filter || !Object.keys(filter).length) return true
  const read = readAs(block)
  if (filter.type !== undefined && read.type !== filter.type) return false
  if (filter.kind !== undefined && read.state?.kind !== filter.kind) return false
  if (filter.author !== undefined && block.refs?.author !== filter.author) return false
  if (filter.hash !== undefined && block.hash !== filter.hash) return false
  if (filter.record !== undefined && !recordOf(block, held).includes(filter.record)) return false
  return Object.entries(filter.refs || {}).every(([key, hash]) => list(read.refs?.[key]).includes(hash))
}
// Every first version a block is a version of (itself, and back through `updates`).
function recordOf(block, held) {
  const byHash = indexOf(held || []), out = [], seen = new Set()
  const walk = (one) => { if (!one || seen.has(one.hash)) return; seen.add(one.hash); out.push(one.hash); for (const hash of list(one.refs?.updates)) walk(byHash.get(hash) || { hash, refs: {} }) }
  walk(block)
  return out
}
/** The heads among blocks: those no other among them names by prev or updates. */
function headsOf(blocks) {
  const named = new Set(blocks.flatMap((block) => [...list(block.refs?.prev), ...list(block.refs?.updates)]))
  return blocks.filter((block) => !named.has(block.hash))
}

/**
 * Answer a pull from a node's arrival log [{ n, block, copies? }] (n numbered 1, 2, 3 as blocks were taken in, never
 * reused; `copies` the sealed copies by recipient id). A public block travels whole; a sealed one as its header,
 * or, to a signed pull's asker, the copy sealed to them. Signed by the node: { node, request, blocks: [{ n, message }],
 * next, signature }. `cap` is the responder's own limit.
 */
function answerPull(log, request = {}, { node, privateKey, asker = request.asker, cap = 500, held } = {}) {
  const since = Number(request.since || 0), limit = Math.min(Number(request.limit || cap), cap)
  let found = log.filter((entry) => entry.n > since && matches(entry.block, request.filter, held || log.map((one) => one.block))).sort((a, b) => a.n - b.n)
  if (request.heads) { const heads = new Set(headsOf(found.map((entry) => entry.block)).map((block) => block.hash)); found = found.filter((entry) => heads.has(entry.block.hash)) }
  found = found.slice(0, limit)
  const messageOf = (entry) => entry.block.state?.audience === 'public' || !Array.isArray(entry.block.state?.audience) ? wrap(entry.block)
    : asker && entry.copies?.[asker] ? entry.copies[asker] : { version: VERSION, header: entry.header || { author: entry.block.refs.author, seq: entry.block.state.seq, prev: entry.block.refs.prev, hash: entry.block.hash }, header_signature: entry.header_signature }
  const answer = { node, request: crypto.createHash('sha256').update(canonicalJSON(request), 'utf8').digest('hex'), blocks: found.map((entry) => ({ n: entry.n, message: messageOf(entry) })), next: found.length ? found.at(-1).n : since }
  return privateKey ? signMessage(answer, privateKey) : answer
}

/** Whether a node's answer (pull or push) is signed by one of the node's keys. Two signed answers that differ for one arrival number prove a lie. */
const answerSignedBy = (answer, nodeKeys) => list(nodeKeys).some((key) => verifyMessage(answer, key))

// ---- Push ----
const pushRequest = (messages, forWhom) => pick({ messages, for: forWhom }, M.push)

/**
 * What a node takes of a push: { taken, waiting: [{ hash, needs }], refused: [{ hash, code, detail }], equivocations }.
 * Genesis blocks are read first. A block without seq is taken only as history: an older identity's, while its history
 * is open or inside its closed history (a grant or an answer there stands). A 1.6 block passes the write check and is
 * signed by a key of its author that speaks for it (`bad_signature` when no key of the author opens it, `void_key` when
 * one does but does not speak); one whose key's previous block is not held waits. The second of two blocks from one key
 * at one seq is neither taken nor refused: the pair is listed in `equivocations` (sorted), and the node keeps both as
 * proof. Options: `arrivedAt` (for recovery reach), `schemas` (check options).
 */
function accept(incoming, held = [], { arrivedAt, schemas } = {}) {
  const known = indexOf([...held, ...incoming])
  const has = new Set(known.keys())
  const taken = [], refused = [], waiting = [], equivocations = []
  const slots = new Map()
  const slot = (block) => { const key = signerOf(block, keyTimeline(block.refs.author, known)); return key ? `${block.refs.author} ${key} ${block.state.seq}` : null }
  for (const block of held) if (Number.isInteger(block.state?.seq) && block.refs?.author) { const at = slot(block); if (at) slots.set(at, block.hash) }
  const refuse = (block, code, detail) => refused.push({ hash: block.hash, code, detail })
  // Not the author's: no key of the author opens it (bad_signature), or one does but does not speak for it (void_key).
  const unsigned = (block) => {
    if (isGenesis(block)) return refuse(block, 'bad_genesis', 'a genesis is signed by its own key')
    const opened = signerOf(block, keyTimeline(block.refs?.author, known)) || (block.state?.recovery_key && signerOf(block, [{ key: block.state.recovery_key }]))
    return opened ? refuse(block, 'void_key', 'signed by a key of its author that does not speak for it: void, frozen, or rotated past last_good')
      : refuse(block, 'bad_signature', 'its signature opens with no key of its author')
  }
  for (const block of causalOrder(incoming)) {
    if (!isGenesis(block) && block.state?.seq === undefined) {
      const root = known.get(block.refs?.author)
      if (root && is16Genesis(root)) { refuse(block, 'no_history', 'a 1.6 identity has no history: a block without seq is refused'); continue }
      if (root && !historyCounts(block, root.hash, known)) { refuse(block, 'history_closed', "history is closed: it is in neither the first 1.6 block's causal past nor its manifest"); continue }
      if (!signedByAuthor(block, known, { arrivedAt })) { unsigned(block); continue }
      taken.push(block); continue
    }
    const wrong = refusals(block.type, block.state, block.refs, { schemas })
    if (wrong.length) { for (const { code, detail } of wrong) refuse(block, code, detail); continue }
    if (!isGenesis(block) && block.refs?.prev && !has.has(block.refs.prev)) { waiting.push({ hash: block.hash, needs: [block.refs.prev] }); continue }
    if (!signedByAuthor(block, known, { arrivedAt })) { unsigned(block); continue }
    if (block.type === 'grant' && block.state?.kind === 'key' && block.state.replaces && !block.state.recovery_key && signerOf(block, keyTimeline(block.refs.author, known)) !== block.state.replaces) { refuse(block, 'not_own_rotation', 'a key is rotated only by itself or by the recovery key'); continue }
    const at = Number.isInteger(block.state?.seq) ? slot(block) : null
    // The second of a pair: neither taken nor refused, listed with the first. The node keeps both and serves them together.
    if (at && slots.has(at) && slots.get(at) !== block.hash) { equivocations.push([slots.get(at), block.hash].sort()); continue }
    if (at) slots.set(at, block.hash)
    taken.push(block)
  }
  return { taken, waiting, refused, equivocations }
}

/** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
const waitedTooLong = (since, now, ttl) => Date.parse(now) - Date.parse(since) > ttl

/**
 * A node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by a key grant):
 * { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }. Every key is
 * always there; an empty list is []. Each pair is sorted as text.
 */
const pushAnswer = ({ taken = [], waiting = [], refused = [], equivocations = [] }, { node, privateKey }) => signMessage({ node, taken: taken.map((block) => block.hash || block), waiting: waiting.map((item) => item.hash || item),
  refused: refused.map(({ hash, code = null, detail = null }) => ({ hash, code, detail })), equivocations: equivocations.map((pair) => [...pair].sort()) }, privateKey)

// ---- Discovery ----
/** What a node publishes at `.well-known/foodblock`. */
const wellKnown = ({ node, holds = [], speaks_for = [], admission = null, endpoints = {} } = {}) => ({
  protocol: 'foodblock', version: VERSION, node, holds, speaks_for, admission, endpoints: Object.fromEntries(M.endpoints.map((key) => [key, endpoints[key] || null])) })
/** A local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }. */
const announcement = (doc) => pick(doc, M.announcement)

/** What is wrong with a `.well-known/foodblock` document, in plain words. */
function wellKnownErrors(doc) {
  if (!doc || doc.protocol !== 'foodblock') return ['protocol is "foodblock"']
  const HASH = GRAMMAR.hash
  return [
    ...Object.keys(doc).filter((key) => !M.discovery.includes(key)).map((key) => `${key} is not part of discovery (${M.discovery.join(', ')})`),
    ...(typeof doc.version === 'string' ? [] : ['version names the rules the node speaks']),
    ...(HASH.test(doc.node || '') ? [] : ['node is the id of the node (an actor)']),
    ...['holds', 'speaks_for'].flatMap((key) => Array.isArray(doc[key]) && doc[key].every((id) => HASH.test(id)) ? [] : [`${key} lists ids (hashes)`]),
    ...(doc.admission === null || HASH.test(doc.admission || '') ? [] : ['admission is the hash of the admission block']),
    ...(doc.endpoints && Object.keys(doc.endpoints).every((key) => M.endpoints.includes(key)) && M.endpoints.every((key) => doc.endpoints[key] === null || /^https?:\/\//.test(doc.endpoints[key] || '')) ? [] : [`endpoints: { ${M.endpoints.join(', ')} } are URLs`])
  ]
}


module.exports = { pullRequest, signPull, pullErrors, pullRefusals, pushRefusals, messageRefusals, matches, headsOf, answerPull, answerSignedBy, pushRequest, accept, waitedTooLong, pushAnswer, wellKnown, announcement, wellKnownErrors }
