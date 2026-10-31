import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fb from '@foodxdev/foodblock'
import { createDoor, newPerson, remoteNode, remoteIndex, serveHttp } from '../server.js'

// The hosted door, end to end and local: a FoodOS host (foodx foodos/node/host.js) and a public index behind one HTTP server, the door
// reaching the person's node there through the host's window, and an assistant reaching the door over Streamable HTTP with OAuth.
// Needs the foodx checkout (FOODOS_BACKEND, default ~/foodx); skipped without it.
const BACKEND = process.env.FOODOS_BACKEND || resolve(homedir(), 'foodx')
const have = existsSync(resolve(BACKEND, 'foodos/node/host.js'))
if (!have) console.error(`\n*** SKIPPED (not passing): ${new URL(import.meta.url).pathname.split('/').pop()} needs the foodx checkout with foodos/ at ${BACKEND}. Set FOODOS_BACKEND to run it. ***\n`)
const load = (path) => import(pathToFileURL(resolve(BACKEND, path)).href)
const CODE = 'ABCDE-12345'
const use = async (client, name, args = {}) => {
  const reply = await client.callTool({ name, arguments: args })
  const body = reply.content[0].text
  return { error: reply.isError === true, value: (() => { try { return JSON.parse(body) } catch { return body } })() }
}
const b64 = (buf) => buf.toString('base64url')

describe('the hosted door', { skip: !have && 'no foodx checkout (set FOODOS_BACKEND)' }, () => {
  it('reaches a real host over HTTP, behind OAuth, and every block it signs lands on the host', async () => {
    const { Host } = await load('foodos/node/index.js')
    const { PublicIndex } = await load('foodos/index/index.js')
    const { handler: indexHandler } = await load('foodos/index/http.js')
    const { serveHost } = await load('foodos/testing/helpers/serve-host.mjs')

    // The host keeps the person's node; the seller's blocks are there as if synced in.
    const person = newPerson('person', { reach: 'P30D' }), seller = newPerson('person', { reach: 'P30D' })
    const host = new Host()
    await host.join(person.genesis)
    const hosted = host.node(person.id)
    const say = async (type, state, refs) => { const s = fb.write(type, state, refs, { author: seller.id, key: seller.keys, held: seller.chain, at: new Date().toISOString(), audience: 'public' }); seller.chain.push(s); const r = await hosted.ingest([s]); assert.deepEqual(r.refused, [], JSON.stringify(r.refused)); return s }
    await hosted.ingest([seller.genesis])
    const place = await say('thing', { kind: 'place', name: 'Hartley Mill' }, {})
    const flour = await say('thing', { kind: 'flour', name: 'Strong white flour' }, { place: place.hash })
    const offer = await say('promise', { terms: { price: { money: fb.money(150, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('100', 'kg'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, what: flour.hash, place: place.hash })
    const index = await PublicIndex.start()
    const served = await serveHost({ host, index: { handler: indexHandler(index) } })
    after(() => served.close())

    // The door holds the person's key (it signs on the person's tap) and reaches the node through the window credential.
    // The seller also publishes to the open index (public blocks); the door's find asks it, over HTTP, and verifies the signed answer.
    const merchant = newPerson('person', { reach: 'P30D' }) // another seller, public on the index (the host's seller chain holds private blocks the index never takes)
    const pub = (type, state, refs) => { const s = fb.write(type, { ...state, audience: 'public' }, refs, { author: merchant.id, key: merchant.keys, held: merchant.chain, at: new Date().toISOString(), audience: 'public' }); merchant.chain.push(s); return s }
    const pPlace = pub('thing', { kind: 'place', name: 'Hartley Mill', fields: { lat: '51.5010', lon: '-0.1250' } }, {})
    const pFlour = pub('thing', { kind: 'flour', name: 'flour' }, { place: pPlace.hash })
    const pOffer = pub('promise', { what: 'flour', terms: { price: { money: fb.money(150, 'GBP'), per: fb.amount('1', 'kg') }, expires: '2099-01-01T00:00:00.000Z' } }, { from: merchant.id, what: pFlour.hash, place: pPlace.hash })
    const taken = await index.take([merchant.genesis, pPlace, pFlour, pOffer])
    assert.deepEqual(taken.refused, [], JSON.stringify(taken.refused))
    const openIndex = remoteIndex({ base: `${served.url}/index` })
    const hits = await openIndex.offers({ what: 'flour', near: { lat: 51.5, lon: -0.12, radius_m: 5000 } })
    assert.deepEqual(hits.map((h) => h.offer), [pOffer.hash], 'find reaches the index and its signed answer verifies')
    assert.equal(hits[0].what.name, 'flour')
    assert.deepEqual((await openIndex.offers({ what: 'flour', near: 'nowhere' })), [], 'a near name no carried place matches')
    // A lying index: a tampered answer, or one signed by another key, is refused.
    const lies = (change) => remoteIndex({ base: `${served.url}/index`, fetch: async (url, opts) => { const r = await fetch(url, opts); const b = await r.json(); if (url.endsWith('/find')) change(b); return { ok: r.ok, status: r.status, json: async () => b } } })
    await assert.rejects(() => lies((a) => { a.blocks.find((b) => b.hash === pOffer.hash).state.what = 'free gold' }).offers({ what: 'flour' }), /does not hold/)
    await assert.rejects(() => lies((a) => { a.results.reverse(); a.query.what = 'fish' }).offers({ what: 'flour' }), /does not hold/)
    await assert.rejects(() => remoteIndex({ base: `${served.url}/index`, key: newPerson('person', { reach: 'P30D' }).keys.public_key_sign }).offers({ what: 'flour' }), /did not sign/)

    const token = host.credential(person.id, { scopes: ['read', 'write'] })
    const node = remoteNode({ base: `${served.url}/${person.id}`, token })
    await assert.rejects(() => remoteNode({ base: `${served.url}/${person.id}`, token: 'wrong' }).refresh(), /window needs its credential|HTTP 401/)
    const door = createDoor({ node, person, code: CODE })
    door.index = openIndex
    const server = await serveHttp(door, 0, { oauth: true })
    after(() => server.close())
    const base = door.base

    // 1. Without a token: 401, pointing at the protected-resource metadata.
    const bare = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
    assert.equal(bare.status, 401)
    assert.match(bare.headers.get('www-authenticate'), /resource_metadata="[^"]*oauth-protected-resource\/mcp"/)
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()
    assert.equal(resource.resource, `${base}/mcp`)
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()
    assert.deepEqual(meta.code_challenge_methods_supported, ['S256'])
    // Discovery fallbacks the MCP spec has clients try: the root protected-resource URL and OpenID Connect discovery answer with the same documents.
    for (const [path, want] of [['oauth-protected-resource', resource], ['oauth-protected-resource/mcp', resource], ['oauth-authorization-server', meta], ['openid-configuration', meta]]) {
      const r = await fetch(`${base}/.well-known/${path}`)
      assert.equal(r.status, 200, path); assert.deepEqual(await r.json(), want, path)
    }
    assert.ok(meta.registration_endpoint && meta.scopes_supported.includes('foodblock:draft'))

    // 2. Dynamic registration, then the code flow with PKCE; the person's yes is their approval code.
    const redirect = 'http://127.0.0.1:9/callback'
    const client = await (await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Test assistant', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })).json()
    const verifier = b64(randomBytes(32)), challenge = b64(createHash('sha256').update(verifier).digest())
    const authorize = new URL(meta.authorization_endpoint)
    Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'foodblock:read foodblock:draft', resource: `${base}/mcp` }).forEach(([k, v]) => authorize.searchParams.set(k, v))
    const consent = await fetch(authorize)
    const html = await consent.text()
    assert.equal(consent.status, 200); assert.match(html, /Connect Test assistant/); assert.match(html, /cannot send or bind/)
    const request = /name="request" value="([^"]+)"/.exec(html)[1]
    const answer = (code, action = 'allow') => fetch(`${base}/oauth/consent`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, code, do: action }) })
    assert.equal((await answer('WRONG-CODE0')).status, 403, 'a wrong approval code is not a yes')
    const yes = await answer(CODE)
    assert.equal(yes.status, 302)
    const back = new URL(yes.headers.get('location'))
    assert.equal(back.origin + back.pathname, redirect); assert.equal(back.searchParams.get('state'), 'xyz')
    const tokenCall = (params) => fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, ...params }) })
    assert.equal((await tokenCall({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: 'x'.repeat(43), redirect_uri: redirect })).status, 400, 'PKCE: a wrong verifier fails')
    const code2 = back.searchParams.get('code')
    const tokens = await (await tokenCall({ grant_type: 'authorization_code', code: code2, code_verifier: verifier, redirect_uri: redirect })).json()
    assert.equal(tokens.token_type, 'Bearer'); assert.equal(tokens.scope, 'foodblock:read foodblock:draft')
    assert.equal((await tokenCall({ grant_type: 'authorization_code', code: code2, code_verifier: verifier, redirect_uri: redirect })).status, 400, 'a code is single use')
    const refreshed = await (await tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).json()
    assert.ok(refreshed.access_token && refreshed.access_token !== tokens.access_token)
    assert.equal((await tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status, 400, 'a refresh token is used once')

    // 3. The assistant, over Streamable HTTP with the bearer token (in a header, never in a URL).
    const open = async (access) => { const c = new Client({ name: 'test', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${access}` } } })); return c }
    await assert.rejects(() => open('not-a-token'))
    const claude = await open(refreshed.access_token)
    const found = (await use(claude, 'foodblock_find', { what: 'flour', near: 'Hartley' })).value
    assert.deepEqual(found.map((o) => o.offer), [pOffer.hash], 'find goes to the open index, not the host')
    assert.deepEqual((await use(claude, 'foodblock_find', { kind: 'things', what: 'flour' })).value.length > 0, true, 'things and peers still read the host')

    // 4. Ask is a draft; the person's tap (approval page) signs with their key and the block lands on the HOST.
    const draft = (await use(claude, 'foodblock_ask', { audience: 'public', offer: offer.hash, quantity: { value: '5', unit: 'kg' } })).value
    assert.deepEqual([draft.status, draft.bound], ['pending', false])
    assert.ok(!(await hosted.blocks()).some((b) => b.type === 'promise' && b.refs.to === person.id), 'nothing on the host before the tap')
    const tap = (url, code, action) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, ...(action ? { do: action } : {}) }) })
    assert.equal((await tap(draft.approve_at, 'WRONG-CODE0')).status, 403)
    const sent = await tap(draft.approve_at, CODE)
    assert.equal(sent.status, 200)
    const ask = (await hosted.blocks()).find((b) => b.type === 'promise' && b.refs.to === person.id)
    assert.ok(ask, 'the ask is on the host'); assert.equal(ask.refs.author, person.id)
    assert.equal(fb.identity.signedByAuthor(ask, await hosted.blocks()), true)
    assert.equal((await use(claude, 'foodblock_read', { hash: ask.hash })).value.promise.stage, 'asked')

    // 5. A grant by the person's tap; the seller says yes and counters; the assistant binds, and its block is relayed under the grant.
    const none = (await use(claude, 'foodblock_accept', { audience: 'public', promise: offer.hash })).value
    assert.equal(none.bound, false, 'no grant, no binding')
    const pairing = (await use(claude, 'foodblock_connect', { audience: 'public', acts: ['promise'], days: 7, limit: { minor: 2000, currency: 'GBP' } })).value
    assert.match(pairing.summary, /may bind you on: promise/)
    assert.equal((await tap(pairing.approve_at, CODE)).status, 200)
    await say('observe', { kind: 'consent', word: 'yes' }, { subject: person.id })
    const counter = await say('promise', { terms: { price: { money: fb.money(140, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('5', 'kg'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id, what: flour.hash, answers: ask.hash, for: ask.hash })
    const bound = (await use(claude, 'foodblock_accept', { audience: 'public', promise: counter.hash })).value
    assert.equal(bound.bound, true, JSON.stringify(bound))
    const onHost = (await hosted.blocks()).find((b) => b.hash === bound.block)
    assert.ok(onHost?.refs.under, 'the assistant\'s block is on the host, naming the grant')
    assert.notEqual(onHost.refs.author, person.id)
    assert.deepEqual(fb.grant.whyNotUnder(onHost, await hosted.blocks(), { now: new Date().toISOString() }), [])

    // 6. A narrower token cannot draft; a revoked window credential stops the door at the host.
    const reader = await (async () => {
      const q = new URL(meta.authorization_endpoint); Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', scope: 'foodblock:read' }).forEach(([k, v]) => q.searchParams.set(k, v))
      const r = /name="request" value="([^"]+)"/.exec(await (await fetch(q)).text())[1]
      const ok = await fetch(`${base}/oauth/consent`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request: r, code: CODE, do: 'allow' }) })
      return (await (await tokenCall({ grant_type: 'authorization_code', code: new URL(ok.headers.get('location')).searchParams.get('code'), code_verifier: verifier, redirect_uri: redirect })).json()).access_token
    })()
    const narrow = await open(reader)
    assert.equal((await use(narrow, 'foodblock_find', { what: 'flour' })).error, false)
    assert.equal((await use(narrow, 'foodblock_ask', { audience: 'public', offer: offer.hash })).error, true, 'read-only token cannot draft')
    host.revoke(token)
    const gone = await use(claude, 'foodblock_find', { what: 'flour' })
    assert.equal(gone.error, true); assert.match(gone.value.error.message, /credential|401/)
    await claude.close(); await narrow.close()
  })
})
