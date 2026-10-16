import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHub } from '../hosted.js'
import { mcpEndpoint } from '../server.js'
import { remoteIndex } from '../remote.js'

// The many-person door, end to end and local: a real FoodOS host (Backend kernel), the hub (sign-in with a fake Google, reviewer sign-in,
// durable tokens), and MCP clients as several people with several assistants. Nothing may cross between people or assistants.
const BACKEND = process.env.FOODOS_BACKEND || resolve(homedir(), 'Backend-foodx-computer')
const have = existsSync(resolve(BACKEND, 'kernel/node/host.js'))
const load = (path) => import(pathToFileURL(resolve(BACKEND, path)).href)
const b64 = (buf) => buf.toString('base64url')
const listen = (handler) => new Promise((done) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => done({ s, url: `http://127.0.0.1:${s.address().port}` })) })
const use = async (client, name, args = {}) => { const r = await client.callTool({ name, arguments: args }); let v = r.content[0].text; try { v = JSON.parse(v) } catch {} return { error: r.isError === true, value: v } }

// a browser: a cookie jar over fetch, following redirects by hand
const browser = () => {
  const jar = new Map()
  const go = async (url, opts = {}) => {
    const r = await fetch(url, { redirect: 'manual', ...opts, headers: { ...(opts.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } })
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (c.includes('Max-Age=0')) jar.delete(k); else jar.set(k, v) }
    return r
  }
  const follow = async (url, opts) => { let r = await go(url, opts); for (let n = 0; n < 6 && r.status >= 300 && r.status < 400 && r.headers.get('location'); n++) { const next = new URL(r.headers.get('location'), url); url = next.href; r = await go(url) } return { r, url: new URL(url) } }
  return { go, follow, jar }
}
let hubBase = ''

describe('the many-person door', { skip: !have && 'no Backend checkout (set FOODOS_BACKEND)' }, () => {
  it('keeps every person and every assistant apart, survives a restart, and revokes', async () => {
    const { Host } = await load('kernel/node/index.js')
    const { PublicIndex } = await load('kernel/index/index.js')
    const { handler: indexHandler } = await load('kernel/index/http.js')
    const { serveHost } = await load('kernel/testing/helpers/serve-host.mjs')
    const dir = mkdtempSync(join(tmpdir(), 'hub-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const stateFile = join(dir, 'state.json'), master = randomBytes(40).toString('hex')

    const host = new Host(), index = await PublicIndex.start()
    const served = await serveHost({ host, index: { handler: indexHandler(index) } }); after(() => served.close())
    const provision = async ({ id, genesis }) => { if (!host.tenants.has(id)) await host.join(genesis); return { base: `${served.url}/${id}`, token: host.credential(id, { scopes: ['read', 'write'] }) } }

    // a fake Google: the authorization page signs in whoever `signingIn` names; the token endpoint returns an unsigned id_token
    let signingIn = null; const issued = new Map()
    const fake = await listen(async (req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/auth') { const code = b64(randomBytes(9)); issued.set(code, { nonce: u.searchParams.get('nonce'), ...signingIn }); res.writeHead(302, { location: `${u.searchParams.get('redirect_uri')}?code=${code}&state=${u.searchParams.get('state')}` }).end(); return }
      let raw = ''; for await (const c of req) raw += c
      const held = issued.get(new URLSearchParams(raw).get('code'))
      const claims = { iss: 'https://accounts.google.com', aud: 'gid', exp: Math.floor(Date.now() / 1000) + 600, nonce: held?.nonce, sub: held?.sub, email: held?.email, email_verified: true, name: held?.name }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: `x.${b64(Buffer.from(JSON.stringify(claims)))}.y` }))
    }); after(() => fake.s.close())

    const front = await listen((req, res) => hub.app(req, res)); after(() => { front.s.close(); front.s.closeAllConnections?.() })
    hubBase = front.url
    const build = (extra = {}) => {
      const hub = createHub({ stateFile, master, publicUrl: front.url, provision, index: remoteIndex({ base: `${served.url}/index` }),
        google: { clientId: 'gid', clientSecret: 'gsecret', redirectUri: `${front.url}/oauth/google/callback`, authUrl: `${fake.url}/auth`, tokenUrl: `${fake.url}/token` },
        reviewer: { passphrase: 'open-sesame' }, mcp: mcpEndpoint(), ...extra })
      return hub
    }
    let hub = build()

    // the open index has one public offer to find
    const merchant = (await import('../door.js')).newPerson(), fb = (await import('@foodxdev/foodblock')).default
    const pub = (type, state, refs) => { const s = fb.write(type, { ...state, audience: 'public' }, refs, { author: merchant.id, key: merchant.keys, held: merchant.chain }); merchant.chain.push(s); return s }
    const pPlace = pub('thing', { kind: 'place', name: 'Hartley Mill', fields: { lat: '51.5010', lon: '-0.1250' } }, {})
    const pFlour = pub('thing', { kind: 'flour', name: 'flour' }, { place: pPlace.hash })
    const pOffer = pub('promise', { what: 'flour', terms: { price: { money: fb.money(150, 'GBP'), per: fb.amount('1', 'kg') }, expires: '2099-01-01T00:00:00.000Z' } }, { from: merchant.id, what: pFlour.hash, place: pPlace.hash })
    assert.deepEqual((await index.take([merchant.genesis, pPlace, pFlour, pOffer])).refused, [])

    const base = front.url
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()
    assert.deepEqual(meta.code_challenge_methods_supported, ['S256'])
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401)

    // connect: a person's assistant, signed in by google (sub/email) or as a reviewer; returns an MCP client + its tokens
    async function connect({ name, as, drawing = true, via = 'google', web = browser() }) {
      const redirect = 'http://127.0.0.1:9/cb'
      const client = await (await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })).json()
      const verifier = b64(randomBytes(32)), challenge = b64(createHash('sha256').update(verifier).digest())
      const auth = new URL(meta.authorization_endpoint)
      Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'st', scope: 'foodblock:read foodblock:draft', resource: `${base}/mcp` }).forEach(([k, v]) => auth.searchParams.set(k, v))
      let html = await (await web.go(auth)).text()
      let request = /name="request" value="([^"]+)"/.exec(html)?.[1] ?? /request=([^"&]+)/.exec(html)?.[1]
      if (/Sign in with Google/.test(html)) {
        request = /signin\/google\?request=([^"]+)"/.exec(html)[1]
        if (via === 'google') {
          signingIn = as
          const { r } = await web.follow(`${base}/signin/google?request=${request}`)
          assert.equal(r.status, 200, 'consent page after sign-in'); html = await r.text()
        } else {
          const r = await web.go(`${base}/signin/reviewer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, name: as.sub, passphrase: as.pass }) })
          assert.equal(r.status, 302); html = await (await web.go(new URL(r.headers.get('location'), base))).text()
        }
      }
      assert.match(html, /Connect /); assert.match(html, /only your own FoodX node/); assert.match(html, /Built on the open FoodBlock protocol/)
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1]; request = /name="request" value="([^"]+)"/.exec(html)[1]
      const yes = await web.go(`${base}/oauth/consent`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, csrf, do: 'allow', ...(drawing ? { draft: '1' } : {}) }) })
      assert.equal(yes.status, 302)
      const code = new URL(yes.headers.get('location')).searchParams.get('code')
      const tokens = await (await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: verifier, redirect_uri: redirect }) })).json()
      assert.ok(tokens.access_token)
      const mcp = new Client({ name, version: '1' })
      await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }))
      return { mcp, tokens, client, web, redirect, verifier }
    }

    const alice = { sub: 'g-alice', email: 'alice@example.com', name: 'Alice' }, bob = { sub: 'g-bob', email: 'bob@example.com', name: 'Bob' }
    const a1 = await connect({ name: 'Claude (Alice)', as: alice }), a2 = await connect({ name: 'ChatGPT (Alice)', as: alice, web: browser() })
    const b1 = await connect({ name: 'Claude (Bob)', as: bob })
    const c1 = await connect({ name: 'Reviewer assistant', as: { sub: 'reviewer-one', pass: 'open-sesame' }, via: 'reviewer' })
    assert.equal(hub.state.accounts.size(), 3, 'alice signed in twice and is one person')
    assert.equal(host.people().length, 3, 'three people, three nodes on the host')

    // tools: every one has a title and an honest annotation
    const tools = (await a1.mcp.listTools()).tools
    assert.equal(tools.length, 6)
    for (const t of tools) assert.ok(t.title && t.annotations && typeof t.annotations.readOnlyHint === 'boolean' && typeof t.annotations.destructiveHint === 'boolean', t.name)
    assert.equal(tools.find((t) => t.name === 'foodblock_find').annotations.readOnlyHint, true)
    assert.equal(tools.find((t) => t.name === 'foodblock_ask').annotations.readOnlyHint, false)

    // 1. every person finds the open index; each asks; each draft is their own
    const found = (await use(a1.mcp, 'foodblock_find', { what: 'flour' })).value
    assert.deepEqual(found.map((o) => o.offer), [pOffer.hash])
    const dA = (await use(a1.mcp, 'foodblock_ask', { offer: pOffer.hash, quantity: { value: '5', unit: 'kg' } })).value
    const dB = (await use(b1.mcp, 'foodblock_ask', { offer: pOffer.hash, quantity: { value: '9', unit: 'kg' } })).value
    assert.equal(dA.bound, false)
    // the second assistant of the same person sees the person's drafts (one node, one person) but Bob's assistant never sees Alice's
    assert.equal((await use(a2.mcp, 'foodblock_read', { hash: dA.draft })).error, false, 'alice\'s other assistant is still alice')
    const cross = await use(b1.mcp, 'foodblock_read', { hash: dA.draft })
    assert.equal(cross.error, true); assert.equal(cross.value.error.code, 'not_found', 'bob cannot read alice\'s draft')

    // 2. the tap: only the signed-in owner can see or send a draft
    const idOf = (d) => /approve\/([0-9a-f]{64})/.exec(d.approve_at)[1]
    const path = (d) => `${base}/approve/${idOf(d)}`
    assert.equal((await fetch(path(dA), { redirect: 'manual' })).status, 200, 'not signed in: the sign-in page, never the draft')
    assert.doesNotMatch(await (await fetch(path(dA))).text(), /Send as me/)
    const bobSees = await b1.web.go(path(dA)); assert.equal(bobSees.status, 404, 'bob\'s session cannot open alice\'s draft')
    assert.equal((await b1.web.go(path(dA), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ do: 'send' }) })).status, 404)
    const page = await (await a1.web.go(path(dA))).text(); assert.match(page, /Send as me/)
    const csrf = /name="csrf" value="([^"]+)"/.exec(page)[1]
    assert.equal((await a1.web.go(path(dA), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ do: 'send' }) })).status, 403, 'no csrf token, no send')
    const sent = await a1.web.go(path(dA), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ do: 'send', csrf }) })
    assert.equal(sent.status, 200)
    const ids = [...host.tenants.keys()], aliceId = hub.state.accounts.get('google:g-alice').person, bobId = hub.state.accounts.get('google:g-bob').person
    const onAlice = (await host.node(aliceId).blocks()).find((b) => b.type === 'promise' && b.refs.to === aliceId)
    assert.ok(onAlice, 'alice\'s ask is on alice\'s node')
    assert.ok(!(await host.node(bobId).blocks()).some((b) => b.hash === onAlice.hash), 'and not on bob\'s')
    assert.equal((await use(b1.mcp, 'foodblock_read', { hash: onAlice.hash })).error, true, 'bob cannot read alice\'s block')
    assert.equal((await use(a1.mcp, 'foodblock_read', { hash: onAlice.hash })).error, false)
    assert.equal((await use(a1.mcp, 'foodblock_read', { hash: dB.draft })).error, true, 'alice cannot read bob\'s draft')

    // 3. a session belongs to its assistant: alice's second assistant cannot borrow alice's first session
    const sid = a1.mcp.transport?.sessionId ?? (a1.mcp._transport || {}).sessionId
    assert.ok(sid)
    const borrowed = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${a2.tokens.access_token}`, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) })
    assert.equal(borrowed.status, 403)
    const bobBorrow = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${b1.tokens.access_token}`, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) })
    assert.equal(bobBorrow.status, 403)

    // 4. scoped grants per assistant: a read-only connection cannot draft
    const ro = await connect({ name: 'Read-only (Bob)', as: bob, drawing: false })
    assert.equal(ro.tokens.scope, 'foodblock:read')
    assert.equal((await use(ro.mcp, 'foodblock_find', { what: 'flour' })).error, false)
    const denied = await use(ro.mcp, 'foodblock_ask', { offer: pOffer.hash }); assert.equal(denied.error, true); assert.equal(denied.value.error.code, 'insufficient_scope')

    // 5. a restart: new hub, same file, same host; old tokens still open the door, the same person comes back to the same node
    hub = build()
    const again = new Client({ name: 'again', version: '1' })
    await again.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${a1.tokens.access_token}` } } }))
    assert.equal((await use(again, 'foodblock_read', { hash: onAlice.hash })).error, false, 'after a restart alice\'s token still opens alice\'s node')
    const aliceBack = await connect({ name: 'Claude (Alice) again', as: alice })
    assert.equal(hub.state.accounts.get('google:g-alice').person, aliceId, 'signing in again is the same person')
    assert.equal(host.people().length, 3, 'no new node for a returning person')
    assert.equal((await use(aliceBack.mcp, 'foodblock_read', { hash: onAlice.hash })).error, false)

    const reopen = async (t) => { const c = new Client({ name: 'again', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${t.tokens.access_token}` } } })); t.mcp = c }
    await reopen(b1); await reopen(a2)

    // 6. revocation: the account page disconnects one assistant and leaves the other
    const acct = await (await a1.web.go(`${base}/account`)).text()
    assert.match(acct, /Claude \(Alice\)/); assert.match(acct, /ChatGPT \(Alice\)/); assert.doesNotMatch(acct, /Claude \(Bob\)/, 'bob\'s assistants are not on alice\'s page')
    const acsrf = /name="csrf" value="([^"]+)"/.exec(acct)[1]
    assert.equal((await a1.web.go(`${base}/account/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: acsrf, client: b1.client.client_id }) })).status, 303)
    assert.equal((await use(b1.mcp, 'foodblock_find', { what: 'flour' })).error, false, 'alice cannot revoke bob\'s assistant')
    assert.equal((await a1.web.go(`${base}/account/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: acsrf, client: a2.client.client_id }) })).status, 303)
    const stale = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${a2.tokens.access_token}` }, body: '{}' })
    assert.equal(stale.status, 401, 'a revoked assistant is out')
    assert.equal((await use(again, 'foodblock_find', { what: 'flour' })).error, false, 'alice\'s other assistant is untouched')
    // RFC 7009 revoke also works
    assert.equal((await fetch(meta.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: ro.client.client_id, token: ro.tokens.access_token }) })).status, 200)
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${ro.tokens.access_token}` }, body: '{}' })).status, 401)

    // 7. refusals: a wrong reviewer passphrase, an unknown redirect scheme, a replayed google state, a tight rate limit
    const w = browser(); const redirect = 'http://127.0.0.1:9/cb'
    const cl = await (await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json()
    const au = new URL(meta.authorization_endpoint); Object.entries({ response_type: 'code', client_id: cl.client_id, redirect_uri: redirect, code_challenge: b64(randomBytes(32)), code_challenge_method: 'S256' }).forEach(([k, v]) => au.searchParams.set(k, v))
    const rid = /signin\/google\?request=([^"]+)"/.exec(await (await w.go(au)).text())[1]
    const bad = await w.go(`${base}/signin/reviewer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request: rid, name: 'reviewer-one', passphrase: 'wrong' }) })
    assert.equal(bad.status, 403)
    const notReviewer = await w.go(`${base}/signin/reviewer`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request: rid, name: 'alice', passphrase: 'open-sesame' }) })
    assert.equal(notReviewer.status, 403, 'the reviewer passphrase opens only reviewer-* demo people')
    assert.equal((await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'evil', redirect_uris: ['javascript:alert(1)'], token_endpoint_auth_method: 'none' }) })).status, 400)
    const tight = createHub({ stateFile: join(dir, 'tight.json'), master, publicUrl: front.url, provision, mcp: mcpEndpoint(), limits: { mcp: 2 } })
    const noGoogle = await fetch(`${base}/signin/google?request=none`); assert.ok([400, 404].includes(noGoogle.status))
    assert.ok(tight.app)
    for (const x of [a1, aliceBack, b1, c1]) await x.mcp.close().catch(() => {})
    await again.close().catch(() => {})
  })

  it('rate limits one person without slowing another', async () => {
    const { Host } = await load('kernel/node/index.js')
    const { serveHost } = await load('kernel/testing/helpers/serve-host.mjs')
    const dir = mkdtempSync(join(tmpdir(), 'hub2-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const host = new Host(), served = await serveHost({ host }); after(() => served.close())
    const provision = async ({ id, genesis }) => { if (!host.tenants.has(id)) await host.join(genesis); return { base: `${served.url}/${id}`, token: host.credential(id, { scopes: ['read', 'write'] }) } }
    const front = await listen((req, res) => hub.app(req, res)); after(() => { front.s.close(); front.s.closeAllConnections?.() })
    const hub = createHub({ stateFile: join(dir, 's.json'), master: randomBytes(40).toString('hex'), publicUrl: front.url, provision, mcp: mcpEndpoint(), limits: { mcp: 3 } })
    const call = async (person) => { const t = secretToken(hub, person); return fetch(`${front.url}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${t}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) }) }
    const one = hub.accountFor('reviewer:reviewer-a', {}).person, two = hub.accountFor('reviewer:reviewer-b', {}).person
    const statuses = []; for (let i = 0; i < 5; i++) statuses.push((await call(one)).status)
    assert.ok(statuses.includes(429), statuses.join())
    assert.notEqual((await call(two)).status, 429, 'the other person is not slowed')
  })
})
function secretToken(hub, person) { // mint a token for a test person without the browser flow
  const token = randomBytes(24).toString('base64url')
  hub.state.access.set(createHash('sha256').update(token).digest('hex'), { clientId: 'c', person, scopes: ['foodblock:read', 'foodblock:draft'], expiresAt: Math.floor(Date.now() / 1000) + 600 })
  return token
}
