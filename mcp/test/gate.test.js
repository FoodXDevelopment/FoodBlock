import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fb from '@foodxdev/foodblock'
import { createDoor, memoryNode, approvalHandler } from '../door.js'
import { testPerson, publicSide, tap } from './fixtures.js'
import { serveHttp } from '../server.js'

// The human gate: the person sees exactly what the tap signs, a standing promise is never sized as one occurrence, a
// disconnect ends the grant, the door answers only its own pages, and a code cannot be guessed.
const say = (who, node, type, state, refs) => { const s = fb.write(type, state, refs, { author: who.id, key: who.keys, blocks: who.chain, at: new Date().toISOString(), audience: 'public' }); who.chain.push(s); const r = node.push(s); assert.equal(r.refused.length, 0, JSON.stringify(r.refused)); return s }
const world = (terms) => {
  const node = memoryNode(), person = testPerson(), seller = testPerson()
  const door = createDoor({ node, person: publicSide(person) })
  node.push(seller.genesis)
  const flour = say(seller, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, {})
  const offer = say(seller, node, 'promise', { terms: { lines: [{ id: 'flour', what: flour.hash, ...terms }], expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id })
  return { node, person, seller, door, flour, offer }
}

describe('the human gate', () => {
  it('the summary is of the draft being signed: its own quantity, the total, the full counterparty id', () => {
    const { door, seller, offer } = world({ price: { amount: fb.amount('1.50', 'GBP'), per: fb.amount('1', 'kg') }, quantity: { min: fb.amount('1', 'kg'), max: fb.amount('100000', 'kg') } })
    const assistant = door.agent('claude')
    const draft = door.accept(assistant, { audience: 'public', promise: offer.hash, quantity: fb.amount('100000', 'kg') })
    assert.equal(draft.bound, false)
    assert.match(draft.summary, /^Accept: /)
    assert.match(draft.summary, /terms\.lines\.0\.quantity: 100000 kg/)
    assert.match(draft.summary, /what it comes to: 150000 GBP in all/)
    assert.ok(draft.summary.includes(seller.id), 'the whole id, never 8 characters')
    assert.ok(!/undefined/.test(draft.summary))
  })

  it('an amount reads as the exact decimal text it was signed as, in its own unit (no minor units, no currency table)', () => {
    const { door, offer } = world({ price: fb.amount('100000', 'JPY') })
    const draft = door.accept(door.agent(), { audience: 'public', promise: offer.hash })
    assert.match(draft.summary, /what it comes to: 100000 JPY in all/)
    const { door: d2, offer: o2 } = world({ price: fb.amount('1.500', 'KWD') })
    assert.match(d2.accept(d2.agent(), { audience: 'public', promise: o2.hash }).summary, /1\.5(00)? KWD/)
  })

  it('a name cannot reorder the page: direction controls are dropped and a long name is cut', () => {
    const node = memoryNode(), person = testPerson(), seller = testPerson()
    const door = createDoor({ node, person: publicSide(person) })
    node.push(seller.genesis)
    const thing = say(seller, node, 'thing', { kind: 'flour', name: 'flour ‮09.1 at ‬' + 'x'.repeat(500) }, {})
    const offer = say(seller, node, 'promise', { terms: { lines: [{ id: 'flour', what: thing.hash, price: fb.amount('1.50', 'GBP') }], expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id })
    const summary = door.accept(door.agent(), { audience: 'public', promise: offer.hash }).summary
    assert.ok(!/[‪-‮]/.test(summary))
    assert.ok(!summary.includes('x'.repeat(200)), 'a long name is cut')
  })

  // What a block under a grant draws is counted on the grant's line by the SDK; a grant that names no promise of hers in
  // `scope.on` binds nothing, a standing promise included
  it('a standing promise under a money limit is a draft', () => {
    const { door, person, seller, node, offer: once } = world({ price: fb.amount('19.00', 'GBP') })
    const daily = say(seller, node, 'promise', { when: '2026-11-01T09:00:00.000Z', terms: { lines: [{ id: 'flour', what: once.state.terms.lines[0].what, price: fb.amount('19.00', 'GBP') }], repeat: 'FREQ=DAILY', zone: 'UTC', until: '2027-11-01T00:00:00.000Z', expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id })
    const assistant = door.agent('claude')
    const grant = door.connect(assistant, { audience: 'public', parties: [seller.id], types: ['promise'], limit: fb.amount('20.00', 'GBP') })
    assert.equal(tap(door, grant.draft, person).ok, true)
    const got = door.accept(assistant, { audience: 'public', promise: daily.hash })
    assert.equal(got.bound, false)
    assert.match(got.why_a_draft, /scope\.on/)
    assert.match(got.summary, /terms\.repeat: FREQ=DAILY/); assert.match(got.summary, /terms\.until: 2027-11-01/)
  })

  it('a grant summary says when there is no limit; the tap signs one grant', () => {
    const { door, node, person } = world({ price: fb.amount('1.50', 'GBP') })
    const draft = door.connect(door.agent('claude'), { audience: 'public', types: ['promise'] })
    assert.match(draft.summary, /NO limit/)
    assert.equal(tap(door, draft.draft, person).ok, true)
    assert.equal(node.all().filter((b) => b.type === 'grant').length, 1, 'one grant, signed by the tap')
  })

  it('what she signs is what she was shown: the page names every reader, and every field of the block', async () => {
    const { door, person, seller, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const assistant = door.agent('claude')
    const page = async (draft) => { let body = ''; await approvalHandler(door)({ url: '/approve/' + draft.draft, method: 'GET' }, { writeHead() {}, end(t) { body = t } }); return body }
    const secret = await page(door.ask({ audience: [person.id, seller.id, assistant.id], offer: offer.hash }))
    for (const id of [person.id, seller.id, assistant.id]) assert.ok(secret.includes(id), 'every reader is named in full')
    const open = await page(door.ask({ audience: 'public', offer: offer.hash }))
    assert.match(open, /anyone/i)
    assert.ok(!open.includes(assistant.id))
    assert.ok(secret.includes(offer.hash), 'the thing asked for is on the page')
    assert.ok(secret.indexOf(assistant.id) < secret.indexOf(offer.hash), 'who may read comes first')
  })

  it('an ask with nothing to ask for is refused at draft time, never signed as the word "undefined"', () => {
    const { door, seller } = world({ price: fb.amount('1.50', 'GBP') })
    assert.throws(() => door.ask({ audience: 'public', from: seller.id }), /nothing to ask for/)
    assert.equal(door.pending().length, 0)
  })

  it('a full id, never a prefix: a short or shared prefix finds nothing', () => {
    const { door, node, offer } = world({ price: fb.amount('1.50', 'GBP') })
    assert.throws(() => door.accept(door.agent(), { audience: 'public', promise: offer.hash.slice(0, 8) }), /full id/)
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash.slice(0, 1) }), /full id/)
    assert.equal(node.get(offer.hash.slice(0, 1)), null)
  })

  it('disconnect drafts the stop for her device to sign: the door never ends a grant in her name', () => {
    const { door, node, person } = world({ price: fb.amount('1.50', 'GBP') })
    const assistant = door.agent('claude', { client: 'client-1' })
    const draft = door.connect(assistant, { audience: 'public', types: ['promise'], limit: fb.amount('20.00', 'GBP') })
    assert.equal(tap(door, draft.draft, person).ok, true)
    const grant = node.get(door.drafts.get(draft.draft).block)
    assert.equal(fb.grant.isLive(grant, node.all()), true)
    assert.deepEqual(door.disconnect('other-client').drafts, [], 'another client\'s assistants keep theirs')
    const before = node.all().length
    const { drafts } = door.disconnect('client-1')
    assert.equal(drafts.length, 1)
    assert.equal(node.all().length, before, 'the door signed nothing')
    assert.equal(fb.grant.isLive(grant, node.all()), true, 'nothing ends until her device signs the stop')
    assert.equal(tap(door, drafts[0].draft, person).ok, true)
    assert.equal(fb.grant.isLive(grant, node.all()), false)
  })

  it('a wrong signature costs its sender a second, and five lock the draft: guesses cannot run side by side', async () => {
    const { door, offer, person } = world({ price: fb.amount('1.50', 'GBP') })
    const draft = door.ask({ audience: 'public', offer: offer.hash })
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done)); after(() => server.close())
    door.base = `http://127.0.0.1:${server.address().port}`
    const post = (signature) => fetch(door.base + draft.approve_at, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ do: 'send', signature }) })
    await fetch(door.base + draft.approve_at)
    const started = Date.now()
    assert.equal((await post('ab'.repeat(64))).status, 403)
    assert.ok(Date.now() - started >= 900, 'a wrong signature waits a second before it is answered')
    for (let i = 0; i < 4; i++) await post('ab'.repeat(64))
    assert.equal(door.drafts.get(draft.draft).status, 'locked')
    assert.equal((await post(fb.sign(door.signing(draft.draft)?.block ?? {}, person.keys.private_key))).status, 403, 'a locked draft takes no more')
  })

  it('the approval page cannot be framed', async () => {
    const { door, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done)); after(() => server.close())
    door.base = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(door.ask({ audience: 'public', offer: offer.hash }).approve_at)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  })

  it('with no OAuth the door answers only its own pages: another Host or Origin is refused', async () => {
    const me = testPerson(), door = createDoor({ person: publicSide(me) })
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

describe('what she is shown', () => {
  it('a passkey signs: the page asks her browser for it, and the door takes the WebAuthn answer', async () => {
    const { passkeyAnswer } = await import('./fixtures.js')
    const keys = fb.generateKeypair('p256'), node = memoryNode()
    const genesis = fb.identity.genesis(keys, { kind: 'person', at: new Date().toISOString(), audience: 'public' })
    const seller = testPerson(); node.push(seller.genesis)
    const flour = say(seller, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, {})
    const offer = say(seller, node, 'promise', { terms: { lines: [{ id: 'flour', what: flour.hash, price: fb.amount('1.50', 'GBP') }], expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: genesis.hash })
    const door = createDoor({ node, person: { id: genesis.hash, genesis, chain: [genesis] } })
    const draft = door.ask({ audience: 'public', offer: offer.hash })
    let html = ''; await approvalHandler(door)({ url: '/approve/' + draft.draft, method: 'GET' }, { writeHead() {}, end(t) { html = t } })
    assert.match(html, /navigator\.credentials\.get/); assert.match(html, /Sign with my passkey/)
    const shown = door.signing(draft.draft)
    const answer = await passkeyAnswer(shown.challenge, keys)
    const sent = door.approve(draft.draft, answer)
    assert.equal(sent.ok, true, JSON.stringify(sent))
    assert.equal(fb.identity.signedByAuthor(node.get(sent.block), node.all()), true)
  })

  it('every id is shown by what signed blocks say of it: a name, a kind and a maker, with the full id beside it', () => {
    const { door, seller, flour, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const draft = door.ask({ audience: 'public', offer: offer.hash })
    const lines = door.drafts.get(draft.draft).shown.join('\n')
    assert.match(lines, /terms\.lines\.0\.what: "Strong white flour" \(their words\), kind flour, made by/)
    assert.ok(lines.includes(flour.hash) && lines.includes(seller.id))
  })

  it('two things with one name and kind are called out, so a look-alike cannot stand in for the one meant', () => {
    const { door, node, flour, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const other = testPerson(); node.push(other.genesis)
    say(other, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, {})
    const lines = door.drafts.get(door.ask({ audience: 'public', offer: offer.hash }).draft).shown.join('\n')
    assert.match(lines, /WARNING: 1 other thing here shares this name and kind/)
    assert.ok(flour)
  })

  it('a reader who is no party to the deal is flagged', () => {
    const { door, person, seller, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const third = testPerson(); door.node.push(third.genesis)
    const lines = door.drafts.get(door.ask({ audience: [person.id, seller.id, third.id], offer: offer.hash }).draft).shown.join('\n')
    assert.match(lines, /also readable by an id that is not a party/)
    assert.equal((lines.match(/not a party/g) || []).length, 1, 'only the stranger is flagged')
  })

  it('the tool\'s summary is the page\'s own lines, so it cannot say "no price" over a block that carries one', () => {
    const { door, offer } = world({ price: fb.amount('1.50', 'GBP') })
    const draft = door.ask({ audience: 'public', offer: offer.hash, price: fb.amount('900', 'GBP') })
    assert.match(draft.summary, /terms\.lines\.0\.price: 900 GBP/)
    assert.doesNotMatch(draft.summary, /no price/)
    for (const line of door.drafts.get(draft.draft).shown.slice(1)) assert.ok(draft.summary.includes(line))
  })

  it('words a tool wrote into a unit are refused at the draft; words in a text field are marked as theirs', () => {
    const { door, offer } = world({ price: fb.amount('1.50', 'GBP') })
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash, price: { value: '1', unit: 'GBP total, price agreed' } }), /one token/)
    assert.equal(door.pending().length, 0)
  })
})
