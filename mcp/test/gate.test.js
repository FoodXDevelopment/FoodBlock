import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fb from '@foodxdev/foodblock'
import { createDoor, newPerson, memoryNode, approvalHandler } from '../door.js'
import { serveHttp } from '../server.js'

// The human gate (security O): the person sees exactly what the tap signs, a standing promise is never sized as one occurrence, a
// disconnect ends the grant, the door answers only its own pages, and a code cannot be guessed. Each case is built from the repro that
// broke it (scratchpad/security20/door-server and agents).
const CODE = 'ABCDE-12345'
const say = (who, node, type, state, refs) => { const s = fb.write(type, state, refs, { author: who.id, key: who.keys, held: who.chain, at: new Date().toISOString(), audience: 'public' }); who.chain.push(s); const r = node.push(s); assert.equal(r.refused.length, 0, JSON.stringify(r.refused)); return s }
const world = (terms) => {
  const node = memoryNode(), person = newPerson('person', { reach: 'P30D' }), seller = newPerson('person', { reach: 'P30D' })
  const door = createDoor({ node, person, code: CODE })
  node.push(seller.genesis)
  const flour = say(seller, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, {})
  const offer = say(seller, node, 'promise', { terms: { expires: '2099-01-01T00:00:00.000Z', ...terms } }, { from: seller.id, to: person.id, what: flour.hash })
  return { node, person, seller, door, flour, offer }
}

describe('the human gate', () => {
  it('the summary is of the draft being signed: its own quantity, the total, the full counterparty id (door/t9, agents/t1)', () => {
    const { door, seller, offer } = world({ price: { money: fb.money(150, 'GBP'), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('1', 'kg'), max: fb.amount('100000', 'kg') } })
    const assistant = door.agent('claude')
    const draft = door.accept(assistant, { audience: 'public', promise: offer.hash, quantity: fb.amount('100000', 'kg') })
    assert.equal(draft.bound, false)
    assert.match(draft.summary, /Accept 100000 kg/)
    assert.match(draft.summary, /150000\.00 GBP in all/)
    assert.ok(draft.summary.includes(seller.id), 'the whole id, never 8 characters')
    assert.ok(!/undefined/.test(draft.summary))
  })

  it('money reads in the currency\'s own decimals: 100000 JPY is 100000 yen, never 1000.00 (agents/t1 a)', () => {
    const { door, offer } = world({ price: fb.money(100000, 'JPY') })
    const draft = door.accept(door.agent(), { audience: 'public', promise: offer.hash })
    assert.match(draft.summary, /at 100000 JPY/)
    const { door: d2, offer: o2 } = world({ price: fb.money(1500, 'KWD') })
    assert.match(d2.accept(d2.agent(), { audience: 'public', promise: o2.hash }).summary, /at 1\.500 KWD/)
  })

  it('a name cannot reorder the page: direction controls are dropped and a long name is cut (agents/t7)', () => {
    const node = memoryNode(), person = newPerson('person', { reach: 'P30D' }), seller = newPerson('person', { reach: 'P30D' })
    const door = createDoor({ node, person, code: CODE })
    node.push(seller.genesis)
    const thing = say(seller, node, 'thing', { kind: 'flour', name: 'flour ‮09.1 at ‬' + 'x'.repeat(500) }, {})
    const offer = say(seller, node, 'promise', { terms: { price: fb.money(150, 'GBP'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id, what: thing.hash })
    const summary = door.accept(door.agent(), { audience: 'public', promise: offer.hash }).summary
    assert.ok(!/[‪-‮]/.test(summary))
    assert.ok(summary.length < 400)
  })

  it('a standing promise under a money limit is a draft: one occurrence is not what it comes to (agents/t3)', () => {
    const { door, person, seller, node, offer: once } = world({ price: fb.money(1900, 'GBP') })
    const daily = say(seller, node, 'promise', { when: '2026-11-01T09:00:00.000Z', terms: { price: fb.money(1900, 'GBP'), repeat: 'FREQ=DAILY', zone: 'UTC', until: '2027-11-01T00:00:00.000Z', expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id, what: once.refs.what })
    const assistant = door.agent('claude')
    const grant = door.connect(assistant, { audience: 'public', parties: [seller.id], acts: ['promise'], limit: fb.money(2000, 'GBP') })
    assert.equal(door.approve(grant.draft, CODE).ok, true)
    const got = door.accept(assistant, { audience: 'public', promise: daily.hash })
    assert.equal(got.bound, false)
    assert.match(got.why_a_draft, /no total/)
    assert.match(got.summary, /repeating FREQ=DAILY until 2027-11-01/)
  })

  it('a grant summary says when there is no limit, and that the tap also signs the operator grant (door-server L2)', () => {
    const { door } = world({ price: fb.money(150, 'GBP') })
    const draft = door.connect(door.agent('claude'), { audience: 'public', acts: ['promise'] })
    assert.match(draft.summary, /no limit/)
    assert.match(draft.summary, /operator grant/)
  })

  it('a full id, never a prefix: a short or shared prefix finds nothing (door-server L1, agents/t20)', () => {
    const { door, node, offer } = world({ price: fb.money(150, 'GBP') })
    assert.throws(() => door.accept(door.agent(), { audience: 'public', promise: offer.hash.slice(0, 8) }), /full id/)
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash.slice(0, 1) }), /full id/)
    assert.equal(node.get(offer.hash.slice(0, 1)), null)
  })

  it('disconnect ends the authority: the person signs a stop of the grant and of the operator grant (door-server M4, agents/t10)', () => {
    const { door, node } = world({ price: fb.money(150, 'GBP') })
    const assistant = door.agent('claude', { client: 'client-1' })
    const draft = door.connect(assistant, { audience: 'public', acts: ['promise'], limit: fb.money(2000, 'GBP') })
    assert.equal(door.approve(draft.draft, CODE).ok, true)
    const grant = node.get(door.drafts.get(draft.draft).block)
    assert.equal(fb.grant.isLive(grant, node.all()), true)
    assert.deepEqual(door.disconnect('other-client').stopped, [], 'another client\'s assistants keep theirs')
    const { stopped } = door.disconnect('client-1')
    assert.equal(stopped.length, 2)
    assert.equal(fb.grant.isLive(grant, node.all()), false)
  })

  it('a wrong code costs its sender a second and locks nothing: a stranger cannot lock the person out (release 50; door-server M6, agents/t20)', async () => {
    const { door, offer } = world({ price: fb.money(150, 'GBP') })
    const draft = door.ask({ audience: 'public', offer: offer.hash })
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done)); after(() => server.close())
    door.base = `http://127.0.0.1:${server.address().port}`
    const post = (code) => fetch(door.base + draft.approve_at, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ do: 'allow', code }) })
    for (let i = 0; i < 5; i++) assert.equal(door.approve(draft.draft, 'WRONG').ok, false)
    const started = Date.now()
    assert.equal((await post('WRONG')).status, 403)
    assert.ok(Date.now() - started >= 900, 'a wrong code waits a second before it is answered')
    assert.equal(door.approve(draft.draft, CODE).ok, true, 'the right code works at once, however many wrong ones came before')
  })

  it('the approval page cannot be framed (agents/t7 e)', async () => {
    const { door, offer } = world({ price: fb.money(150, 'GBP') })
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done)); after(() => server.close())
    door.base = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(door.ask({ audience: 'public', offer: offer.hash }).approve_at)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  })

  it('with no OAuth the door answers only its own pages: another Host or Origin is refused (door-server M6, agents/t13)', async () => {
    const door = createDoor({ reach: 'P30D', code: CODE })
    const server = await serveHttp(door, 0); after(() => server.close())
    const port = server.address().port
    const ask = (headers) => new Promise((done) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (res) => { res.resume(); done(res.statusCode) })
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }))
    })
    assert.equal(await ask({ host: 'evil.example' }), 403)
    assert.equal(await ask({ host: `127.0.0.1:${port}`, origin: 'http://evil.example' }), 403)
    assert.notEqual(await ask({ host: `127.0.0.1:${port}` }), 403)
  })
})
