// A tiny HTTP server over the host. Node built-ins only.
//   GET  /.well-known/foodblock   who this host is, whom it keeps blocks for, its promise
//   POST /pull   { since, limit, filter, heads }  -> signed answer (the SDK's answerPull)
//   POST /push   { messages }                     -> { taken, waiting, refused, equivocations }
//   GET  /export[?author=<id>&author=<id>]        -> { format, messages }: plain FoodBlocks, exactly as signed
//   POST /export   a signed pull as the body      -> the same, plus the unopened sealed copies that signer may have
//   POST /import { messages, copies? }            -> as /push, but all or nothing (copies need the owner's token)
//   POST /wake   { for }                          -> { woken }: a notice that something waits for her node; no block, no power
//   POST /sync   { peer }   (needs the admin token) -> { took, gave }
import http from 'node:http'
import fb from './sdk.cjs'
import { timingSafeEqual } from 'node:crypto'
import { MOST_MESSAGES, readPush } from '../rules.js'
import { UNSIGNED_PER_MINUTE } from './host.mjs'

const MAX_BODY = 8 * 1024 * 1024
// The owner's token, compared in constant time (F9): a guess learns nothing from how long the answer took.
const sameToken = (given, token) => { const a = Buffer.from(String(given ?? '')), b = Buffer.from(`Bearer ${token}`); return a.length === b.length && timingSafeEqual(a, b) }
// Unsigned requests (a pull, a wake, an export of someone's record) cost the host and prove nothing, so each address gets so many a minute, and all
// addresses together get twenty times that (F6, F7). The number is the owner's if the host's promise states `unsignedPerMinute`; else this code's choice, published.
function limiter(perMinute) {
  let minute = 0, total = 0; const per = new Map()
  return (who) => {
    const now = Math.floor(Date.now() / 60000)
    if (now !== minute) { minute = now; total = 0; per.clear() }
    const used = (per.get(who) || 0) + 1
    if (used > perMinute || total + 1 > perMinute * 20) return false
    per.set(who, used); total++
    return true
  }
}

export function serve(host, { port = 8787, bind = '127.0.0.1' } = {}) {
  const allowed = limiter(host.config.promise.unsignedPerMinute ?? UNSIGNED_PER_MINUTE)
  const owner = (req) => sameToken(req.headers.authorization, host.config.adminToken)
  const send = (res, code, body) => { const text = JSON.stringify(body); res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) }); res.end(text) }
  const read = (req) => new Promise((resolve, reject) => {
    const parts = []; let size = 0
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { code: 413 })); req.destroy() } else parts.push(chunk) })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://host')
      if (req.method === 'GET' && url.pathname === '/.well-known/foodblock') return send(res, 200, host.wellKnown())
      // the whole store, in one body, is the owner's; anyone else names the authors whose record they ask for (F7)
      if (req.method === 'GET' && url.pathname === '/export') {
        if (!owner(req) && !url.searchParams.getAll('author').length) return send(res, 401, { error: 'name the author whose record you ask for, or bring the host owner\'s token' })
        if (!owner(req) && !allowed(req.socket.remoteAddress)) return send(res, 429, { error: 'too many unsigned requests; wait a minute' })
        return send(res, 200, host.exportRecord(url.searchParams.getAll('author')))
      }
      if (req.method !== 'POST') return send(res, 404, { error: 'not found' })
      const text = await read(req)
      let body
      try { body = JSON.parse(text || '{}') } catch { return send(res, 400, { error: 'not JSON' }) }
      // A push is read from its bytes (canonical.md): a repeated key or a number written 1.0 is refused, never normalised into another form of a signed
      // block. A push that is not its canonical bytes whole is refused whole; a block whose own bytes are wrong is refused alone and the rest are judged.
      const unread = []
      if (url.pathname === '/push' || url.pathname === '/import') {
        if (!Array.isArray(body.messages)) return send(res, 400, { error: 'messages: a list of block messages' })
        let strict
        try { strict = url.pathname === '/push' ? readPush(text) : fb.sync.strictPush(fb.canonicalJSON({ messages: body.messages })) } catch (error) { return send(res, 400, { error: error.message }) }
        const whole = strict.refused ? [strict.refused] : []
        if (whole.length) return send(res, 200, { taken: [], unjudged: [], unread: [], refused: whole, equivocations: [], wrote: false })
        const bad = new Set()
        strict.messages.forEach((list, i) => { if (!list.length) return; bad.add(i); let hash = null; try { hash = fb.unwrap(body.messages[i]).hash } catch {}; unread.push(...list.map((one) => ({ hash, code: one.code, detail: one.detail }))) })
        if (bad.size) body = { ...body, messages: body.messages.filter((_, i) => !bad.has(i)) }
      }
      if (url.pathname === '/export') { const signer = host.checkSigned(body, 'pullRefusals'); return send(res, 200, host.exportRecord(url.searchParams.getAll('author'), { forSigner: signer })) }
      if (url.pathname === '/pull') {
        if (body.signature === undefined && !allowed(req.socket.remoteAddress)) return send(res, 429, { error: 'too many unsigned requests; wait a minute' })
        return send(res, 200, host.pull(body))
      }
      if (url.pathname === '/push' || url.pathname === '/import') {
        if (!Array.isArray(body.messages) || body.messages.length > MOST_MESSAGES) return send(res, 400, { error: `messages: a list of block messages (at most ${MOST_MESSAGES})` })
        if (url.pathname === '/import') {
          const isOwner = owner(req)
          if (body.copies?.length && !isOwner) return send(res, 401, { error: 'the host owner\'s token is needed to load sealed copies' })
          return send(res, 200, host.importRecord(body, { withCopies: true, owner: isOwner, unread }))
        }
        // a signed push is checked by the SDK against its signer's keys; only then may the signer's own sealed blocks leave their envelopes here
        if (body.signature !== undefined) { const signer = host.checkSigned(body, 'pushRefusals'); return send(res, 200, host.ingest(body.messages, { copiesBy: signer, forWhom: body.for || {}, unread })) }
        return send(res, 200, host.ingest(body.messages, { unread }))
      }
      if (url.pathname === '/wake') {
        if (!allowed(req.socket.remoteAddress)) return send(res, 429, { error: 'too many unsigned requests; wait a minute' })
        return send(res, 200, host.wake(body.for, host.onWake))
      }
      if (url.pathname === '/sync') {
        if (!owner(req)) return send(res, 401, { error: 'the host owner\'s token is needed to start a sync' })
        return send(res, 200, await host.sync(body.peer))
      }
      return send(res, 404, { error: 'not found' })
    } catch (error) { const known = error.code === 413 || error.code === 400 || error.code === 404; return send(res, known ? error.code : 500, { error: known ? error.message : 'the host could not answer' }) }   // a 500 names nothing of the host's insides (F10)
  })
  return new Promise((resolve) => server.listen(port, bind, () => resolve(server)))
}
