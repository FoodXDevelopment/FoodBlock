// The host: what it keeps (blocks), what it promises (a small signed-by-itself word, published), and the one rule for
// taking a block in. It holds its own key and nothing of hers: no function here takes or makes a key for any author but the host.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import fb from './sdk.cjs'
import { openStore, isSealed } from './store.mjs'
import { stated, admissionRule, copyBudget, COPIES_REFUSED, authorOf, DAY } from '../rules.js'

const NOW = () => new Date().toISOString()
// A file written whole is written beside itself and renamed into place, private to its owner: a crash leaves the old file or the new one, never half of one.
function writeWhole(file, text) {
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, text, { mode: 0o600 })
  fs.renameSync(temp, file)
}
/** What a host with no stated number for unsigned requests does: this many unsigned pulls and wakes a minute from one address (the host's own choice, published in its promise). */
export const UNSIGNED_PER_MINUTE = 120
// The owner's numbers this store has use for: all of the Postgres node's but waitingPerAuthor (this host keeps nothing waiting for a prev: it answers waiting, the sender pushes again).
const NAMES = ['perStranger', 'strangersPerDay', 'admission', 'cap', 'servesPairs', 'takesPairs', 'copyRecipients', 'copyBytes']

/**
 * The host's promise as its own signed word (nodes.md, A host): an `observe` of kind `host_promise` signed by the host's key, never anyone's
 * else. The lines are the owner's stated choices plus what this code does; nothing here is filled in by the protocol.
 */
function signPromise(config) {
  const { cap, servesPairs, takesPairs, allow, perStranger, strangersPerDay, admission, copyRecipients, copyBytes } = config.promise
  const state = {
    kind: 'host_promise', cap, serves_pairs: servesPairs, takes_pairs: takesPairs, per_stranger: perStranger, strangers_per_day: strangersPerDay, copy_recipients: copyRecipients, copy_bytes: copyBytes, ...(admission ? { admission } : {}), ...(allow ? { allow } : {}),
    stores: 'public blocks whole, sealed blocks as header plus unopened envelopes; append-only, never changed or removed',
    syncs: 'takes what a peer has and gives what it lacks, every block through the same check',
    reachable: 'serves her address blocks by pull (kind address, author, heads) and accepts a wake for an id it keeps',
    never_holds_key: 'it signs only its own pull answers and this promise; it holds no key of anyone it keeps blocks for',
    unsigned: `an unsigned pull, wake or export is answered at most ${config.promise.unsignedPerMinute ?? UNSIGNED_PER_MINUTE} a minute from one address`,
    lets_leave: 'a complete export on request, and import of any record as plain FoodBlocks',
    wake: '/wake', export: '/export', import: '/import'
  }
  return fb.write('observe', state, {}, { author: config.genesis.hash, key: config.key, blocks: [config.genesis], at: NOW(), audience: 'public' })
}

/** First run: make the host's own key and its promise. The promise is the owner's word, stated; nothing is filled in later. */
export function initHost(dir, promise = {}) {
  const file = path.join(dir, 'host.json')
  if (fs.existsSync(file)) throw new Error('this folder already holds a host; its key and promise are not replaced')
  const { allow } = promise
  const numbers = stated(promise, 'host', NAMES)
  if (allow !== null && !Array.isArray(allow)) throw new Error('allow: a list of author ids this host keeps blocks for, or null for any author')
  fs.mkdirSync(dir, { recursive: true })
  const key = fb.generateKeypair()
  const genesis = fb.identity.genesis(key, { kind: 'machine', audience: 'public', at: NOW() })
  const adminToken = crypto.randomBytes(24).toString('hex')
  writeWhole(file, JSON.stringify({ about: 'This host\'s own key and word. It holds no key of anyone it keeps blocks for.', node: genesis.hash, genesis, key, adminToken, promise: { ...numbers, allow, ...(Number.isInteger(promise.unsignedPerMinute) && promise.unsignedPerMinute > 0 ? { unsignedPerMinute: promise.unsignedPerMinute } : {}) } }, null, 2))
  return openHost(dir)
}

export function openHost(dir, { onWake = null } = {}) {
  const file = path.join(dir, 'host.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  stated(config.promise, 'host', NAMES)   // a host without its owner's numbers does not open: nothing fills in the silence
  // the host's promise is signed on first open, once, and kept (its own file, its own word)
  if (!config.promiseBlock) { config.promiseBlock = signPromise(config); writeWhole(file, JSON.stringify(config, null, 1)) }
  const store = openStore(dir)
  const { promise, key, node } = config

  // Counters of signed requests: the highest each signer has used (replay protection; no clock). Resume points, not part of any record.
  const counterFile = path.join(dir, 'counters.json')
  const counters = fs.existsSync(counterFile) ? JSON.parse(fs.readFileSync(counterFile, 'utf8')) : {}
  const voiceOf = (id) => store.blocks().filter((block) => block.hash === id || authorOf(block) === id)

  /** A signed request (pull or push) is judged by the SDK against the signer's live keys that this host holds, then its counter is spent. Throws with the reasons. */
  function checkSigned(request, check) {
    const who = request.signer
    const cheap = fb.sync[check](request, { node, keys: [], highest: counters[who] ?? null, issued: [] }).filter((one) => !/not signed by its signer/.test(one.detail))
    const keys = fb.identity.liveKeys(who, voiceOf(who))
    const wrong = cheap.length ? cheap : fb.sync[check](request, { node, keys, highest: counters[who] ?? null, issued: [] })
    if (wrong.length) throw Object.assign(new Error(wrong.map((one) => `${one.code}: ${one.detail}`).join('; ')), { code: 400 })
    counters[who] = request.counter
    writeWhole(counterFile, JSON.stringify(counters))
    return who
  }

  /**
   * A wake (nodes.md, A host): a notice `{ for }` that something waits for her node. It is no block and no word; it is accepted only for an id this
   * host keeps blocks for, written to `wakes.jsonl` (a resume point, not part of any record), and handed to `onWake` if the owner gave one. The node
   * learns what happened from signed blocks it pulls, never from the wake.
   */
  // An id waits once however many wakes name it, so the file holds at most one line per id the host keeps. A line torn by a crash is a lost notice, not a lost record.
  const wakeFile = path.join(dir, 'wakes.jsonl')
  const waiting = new Set(fs.existsSync(wakeFile) ? fs.readFileSync(wakeFile, 'utf8').split('\n').flatMap((l) => { try { return [JSON.parse(l).for] } catch { return [] } }) : [])
  function wake(id, onWake) {
    if (typeof id !== 'string' || !voiceOf(id).length) throw Object.assign(new Error('not_kept: this host keeps no blocks for that id'), { code: 404 })
    // the owner's callback is called once per wait, not once per request: a stranger who knows her id cannot call it again and again
    if (!waiting.has(id)) { waiting.add(id); fs.appendFileSync(wakeFile, JSON.stringify({ for: id }) + '\n', { mode: 0o600 }); if (onWake) onWake(id) }
    return { woken: id }
  }
  /** The ids woken since the last call (each once), and the wake file emptied. */
  function takeWakes() {
    const ids = [...waiting]
    waiting.clear(); writeWhole(wakeFile, '')
    return ids
  }
  /** Her current address (nodes.md, A host): the heads of her chain of `address` blocks, from the pull the SDK answers. */
  function addressOf(id) {
    return pull({ filter: { author: id, kind: 'address' }, heads: true }).blocks.map((one) => fb.unwrap(one.message, store.given()))
  }

  /**
   * The one rule for taking blocks in. `messages` are { block, signature } (public) or { header, header_signature, envelope? } (sealed) off the wire.
   * The SDK judges each: a public block's hash, signature, chain place; a sealed block's header signature, link and rival (acceptSealed), without
   * ever opening it. This host adds only its owner's stated words: `allow`, and the numbers src/rules.js reads (a stranger's blocks a day, the
   * copies one push may add), the same code the Postgres node runs. `owner`: the push is the owner's own act (the CLI, a sync, an import with the
   * owner's token), not a stranger's, so the stranger numbers do not count it. `all` (import): nothing is written unless every block is taken.
   * `copiesBy`: the id of a signer whose signed push this is; the envelopes of that signer's own sealed blocks are kept for the recipients
   * `forWhom` names ({ hash: [id] }). With no signed push, a sealed block's header is kept and its envelope is dropped.
   */
  function ingest(messages, { all = false, copiesBy = null, forWhom = {}, owner = false, unread = [] } = {}) {
    const refused = [...unread]
    const rule = admissionRule(promise.admission ? store.blocks() : [], promise.admission, promise.allow ?? [], promise.perStranger, promise.strangersPerDay)
    const copies = copyBudget(promise), claimed = new Map(), since = new Date(Date.now() - DAY)
    // a sealed copy is kept only for a person this host keeps blocks for or one the owner's rule lists, and only if the host holds that person's genesis
    const copyable = (id) => rule.exempt.includes(id) || store.has(id)
    const strangerRefused = (author, hash) => {
      if (owner || !rule.isStranger(author) || rule.allows(author, store.arrivedSince(author, since), store.strangersSince(rule.exempt, since), claimed)) return false
      refused.push({ hash, code: 'not_admitted', detail: "not admitted by this host's rule" }); return true
    }
    let publics = [], sealeds = []
    const envelopes = new Map()
    for (const message of messages) {
      try {
        if (isSealed(message)) {
          const { header, header_signature, envelope, ...extra } = message
          if (Object.keys(extra).length || !header?.hash || !header?.author) throw new Error('a sealed block is { header, header_signature, envelope }')
          const recipients = envelope && !owner && copiesBy === header.author ? fb.sync.recipientsOf(forWhom, header.hash) : []
          if (recipients.length && !copies(recipients.length, JSON.stringify(message).length * recipients.length)) { refused.push({ hash: header.hash, code: 'not_admitted', detail: COPIES_REFUSED }); continue }
          if (store.has(header.hash)) { if (envelope) envelopes.set(header.hash, message); continue }
          if (promise.allow && !promise.allow.includes(header.author)) { refused.push({ hash: header.hash, code: 'not_admitted', detail: 'this host keeps blocks only for the authors it names' }); continue }
          if (strangerRefused(header.author, header.hash)) continue
          if (envelope) envelopes.set(header.hash, message)
          sealeds.push({ header, header_signature })      // the host judges the header alone; the body is never read
        } else {
          const block = fb.unwrap(message, store.given())
          if (store.has(block.hash)) continue
          if (promise.allow && !promise.allow.includes(authorOf(block))) { refused.push({ hash: block.hash, code: 'not_admitted', detail: 'this host keeps blocks only for the authors it names' }); continue }
          if (strangerRefused(authorOf(block), block.hash)) continue
          publics.push(block)
        }
      } catch (error) { refused.push({ hash: null, code: 'shape', detail: error.message }) }
    }
    // one judgement for public blocks and sealed headers together (nodes.md, A node judges each block on its pieces): what is taken never depends on order
    const answerOf = fb.sync.accept([...publics, ...sealeds], store.given(), { takesPairs: promise.takesPairs })
    // the core lists what it took ascending by hash; this host's own arrival log keeps the order the sender sent them in
    const sentAt = new Map([...publics, ...sealeds].map((one, i) => [one.hash ?? one.header.hash, i]))
    const takenBlocks = answerOf.taken.slice().sort((a, b) => sentAt.get(a.hash ?? a.header.hash) - sentAt.get(b.hash ?? b.header.hash))
    // a block whose pieces are not all here is unjudged: this host keeps nothing unjudged, it answers so and the sender pushes again
    const answer = { taken: [], unjudged: answerOf.unjudged, unread: answerOf.unread, refused: [...refused, ...answerOf.refused], equivocations: answerOf.equivocations, false_headers: answerOf.false_headers }
    if (all && (answer.unjudged.length || answer.refused.length)) return { ...answer, wrote: false }
    for (const block of takenBlocks) { const entry = store.append(block); if (entry) answer.taken.push(entry.hash) }
    // a copy is kept only from the block's own author (a signed push), for the people the author names
    // Each copy is an arrival of its author's: it counts against a stranger's numbers like a block does, and a recipient the host does not know is kept nothing for.
    if (copiesBy) for (const [hash, message] of envelopes) {
      if (message.header.author !== copiesBy || !store.has(hash)) continue
      for (const recipient of fb.sync.recipientsOf(forWhom, hash)) {
        if (!copyable(recipient) || store.hasCopy(hash, recipient)) continue
        if (!owner && rule.isStranger(copiesBy) && !rule.allows(copiesBy, store.arrivedSince(copiesBy, since), store.strangersSince(rule.exempt, since), claimed)) { answer.refused.push({ hash, code: 'not_admitted', detail: "not admitted by this host's rule" }); break }
        store.addCopy(hash, recipient, message)
      }
    }
    return { ...answer, wrote: true }
  }

  /**
   * The one reading of what an asker may be given of the blocks it keeps: the SDK's answerPull, over the arrival log of `entries`. A public block
   * goes whole; a non-public one goes as its signed header, or, to a signed asker, as the copy sealed to them. Every door that hands blocks
   * out (pull, export, sync) asks this; none reads `entry.message` for anyone. `signer` is a checked signer or null; `sign` has the host sign
   * the answer (a pull's answer is signed, a document made for a reader is not).
   */
  function give(entries, request, { signer = null, cap = promise.cap, servesPairs = promise.servesPairs, sign = false, blocks = [], through = null } = {}) {
    const mine = new Map(signer ? store.copiesFor(signer).map((c) => [c.hash, c.message]) : [])
    const log = entries.map(({ n, block, sealed, message }) => ({ n, block, ...(sealed ? { header: message.header, header_signature: message.header_signature } : { header_signature: message.signature }), ...(mine.has(block.hash) ? { copies: { [signer]: mine.get(block.hash) } } : {}) }))
    return fb.sync.answerPull(log, request, { node, privateKey: sign ? key.private_key : null, signer, cap, servesPairs, blocks, suite: key.suite, through })
  }

  /**
   * `given` (what the core hands an asker) plus, for the host's own owner, the header of each sealed block the core withheld from a stranger. The
   * core keeps a sealed block's header from every asker without a copy; the owner moving her own record between her own hosts is not such an asker.
   */
  function withHeaders(entries, given) {
    const seen = new Set(given.map((one) => one.n))
    const headers = entries.filter((entry) => entry.sealed && !seen.has(entry.n)).map((entry) => ({ n: entry.n, message: entry.message }))
    return [...given, ...headers].sort((a, b) => a.n - b.n)
  }

  /** A pull, answered by `give` for the signer of a signed request (or for anyone, unsigned) and signed with the host's key. */
  function pull(request = {}) {
    const who = request.signature !== undefined ? checkSigned(request, 'pullRefusals') : null
    // With no filter and no heads the answer is the next `cap` arrivals after `since` and the other halves of any forked pair among them: the core is
    // given that window, never the whole store. A filter reads every entry, as it must.
    if (request.filter || request.heads || !Number.isInteger(request.since ?? 0)) return give(store.entries(), request, { signer: who, sign: true })
    const window = store.window(request.since ?? 0, promise.cap)
    const authors = new Set(window.rows.map(({ block }) => authorOf(block)))
    return give(window.rows, request, { signer: who, sign: true, blocks: window.rivals ? store.blocks().filter((block) => authors.has(authorOf(block))) : [], through: window.rows.length ? window.through : null })
  }

  /**
   * Her record as plain FoodBlocks: the transport's { messages } document in arrival order, exactly as signed (a sealed block, or one not public, as its header: `give`).
   * `copies` (unopened envelopes) go only to `forSigner`, who must have been checked by the caller: the copies sealed to that signer and every
   * copy of blocks that signer authored. `copies: 'all'` is for the host's own owner on the command line.
   */
  function exportRecord(authors = [], { forSigner = null, copies = null } = {}) {
    const want = new Set(authors)
    const chosen = store.entries().filter(({ block }) => !want.size || want.has(authorOf(block)))
    // a signed asker is given what the core gives them (the copies sealed to them); the host's own owner, moving her whole record, is given the sealed headers too
    const given = give(chosen, {}, { cap: chosen.length || 1, servesPairs: false, signer: forSigner }).blocks
    const out = { format: 'application/foodblock+json', messages: (copies === 'all' ? withHeaders(chosen, given) : given).map((one) => one.message) }
    if (forSigner || copies === 'all') {
      const inDoc = new Set(chosen.map((entry) => entry.hash))
      out.copies = store.allCopies().filter((c) => inDoc.has(c.hash) && (copies === 'all' || c.recipient === forSigner || c.message.header.author === forSigner))
    }
    return out
  }

  /** Loads a record document: its blocks by the one rule (all or nothing), then its sealed copies beside the headers they describe. */
  function importRecord(doc, { withCopies = false, owner = false, unread = [] } = {}) {
    const result = ingest(doc.messages, { all: true, owner, unread })
    if (!result.wrote) return result
    let copied = 0
    if (withCopies) for (const c of doc.copies || []) if (store.addCopy(c.hash, c.recipient, c.message)) copied++
    return { ...result, copied }
  }

  function wellKnown() {
    return { ...fb.sync.wellKnown({ node, admission: null, endpoints: { pull: '/pull', push: '/push' } }),
      promise: { block: config.promiseBlock, wake: '/wake', cap: promise.cap, per_stranger: promise.perStranger, strangers_per_day: promise.strangersPerDay, admission: promise.admission, copy_recipients: promise.copyRecipients, copy_bytes: promise.copyBytes, serves_pairs: promise.servesPairs, takes_pairs: promise.takesPairs, allow: promise.allow, keeps: 'public blocks whole, sealed blocks as header plus unopened envelopes for the people they are sealed to; append-only, never changed or removed', export: '/export', import: '/import' } }
  }

  // Sync with another host: take what it has (its pull, every block through the same rule), then give what it lacks (our push).
  // Cursors are the peer's arrival numbers; they only say where to resume, they are not part of any record.
  async function sync(peer) {
    const curFile = path.join(dir, 'sync.json')
    const cursors = fs.existsSync(curFile) ? JSON.parse(fs.readFileSync(curFile, 'utf8')) : {}
    const mine = cursors[peer] || { pulled: 0, pushed: 0 }
    // a peer is the owner's choice, but a slow or endless one must not hold this host: a time limit on each request and a size limit on each answer
    const post = async (route, body) => {
      const r = await fetch(peer.replace(/\/$/, '') + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: fb.canonicalJSON(body), signal: AbortSignal.timeout(30000) })
      if (!r.ok) throw new Error(`${peer}${route}: ${r.status}`)
      const text = await r.text()
      if (text.length > 32 * 1024 * 1024) throw new Error(`${peer}${route}: the answer is larger than this host reads`)
      return JSON.parse(text)
    }
    let took = 0, gave = 0
    for (;;) {
      const answer = await post('/pull', { since: mine.pulled })
      if (!answer.blocks.length) { mine.pulled = Math.max(mine.pulled, answer.next ?? mine.pulled); break }
      // blocks may need their author's chain from earlier in the same answer: judged together
      const got = ingest(answer.blocks.map((one) => one.message), { owner: true })
      took += got.taken.length
      const unsettled = got.unjudged.length + got.refused.length
      if (unsettled) { cursors[peer] = mine; writeWhole(curFile, JSON.stringify(cursors)); throw new Error(`peer sent ${unsettled} block(s) this host will not take; stopped before moving the cursor`) }
      const next = answer.next ?? answer.blocks.at(-1).n
      if (!(next > mine.pulled)) throw new Error('peer answered without moving its cursor; stopped')   // a peer that repeats itself ends the loop here, not never
      mine.pulled = next
    }
    for (;;) {
      const batch = store.entries().filter((entry) => entry.n > mine.pushed).slice(0, 200)
      if (!batch.length) break
      const result = await post('/push', { messages: withHeaders(batch, give(batch, {}, { cap: batch.length, servesPairs: false }).blocks).map((one) => one.message) })
      gave += result.taken.length
      mine.pushed = batch.at(-1).n
    }
    cursors[peer] = mine; writeWhole(curFile, JSON.stringify(cursors))
    return { took, gave }
  }

  return { dir, node, config, store, ingest, importRecord, checkSigned, pull, exportRecord, wellKnown, sync, wake, takeWakes, addressOf, onWake, torn: store.torn }
}
