import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fb from '@foodxdev/foodblock'
import { createDoor, memoryNode, approvalHandler } from '../door.js'
import { testPerson, publicSide, tap } from './fixtures.js'
import http from 'node:http'

// The door against a local in-memory node: an assistant finds an offer, drafts an ask, the person approves, the seller
// accepts, the promise reads right; without a grant it never binds; a STOP'd recipient is never messaged.
const say = (who, node, type, state, refs) => { const s = fb.write(type, state, refs, { author: who.id, key: who.keys, blocks: who.chain, at: new Date().toISOString(), audience: 'public' }); who.chain.push(s); const r = node.push(s); assert.equal(r.refused.length, 0, JSON.stringify(r.refused)); return s }
const world = () => {
  const node = memoryNode(), person = testPerson(), seller = testPerson()
  const door = createDoor({ node, person: publicSide(person) })   // the door is given her public side only; `person` here is her device
  node.push(seller.genesis)
  const place = say(seller, node, 'thing', { kind: 'place', name: 'Hartley Mill' }, {})
  const flour = say(seller, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, { place: place.hash })
  const offer = say(seller, node, 'promise', { terms: { lines: [{ id: 'flour', what: flour.hash, quantity: fb.amount('100', 'kg'), price: { amount: fb.amount('1.50', 'GBP'), per: fb.amount('1', 'kg') } }], expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, place: place.hash })
  return { node, person, seller, door, place, flour, offer }
}

describe('the door', () => {
  it('finds an offer by what and near, and a peer', () => {
    const { door, offer, seller, place } = world()
    const found = door.find({ kind: 'offers', what: 'flour', near: 'hartley' })
    assert.deepEqual(found.map((o) => o.offer), [offer.hash])
    assert.equal(found[0].what.name, 'Strong white flour')
    assert.deepEqual(door.find({ kind: 'offers', what: 'flour', near: place.hash }).length, 1)
    assert.deepEqual(door.find({ kind: 'offers', what: 'fish' }), [])
    assert.deepEqual(door.find({ kind: 'offers', what: 'flour', near: 'nowhere' }), [])
    assert.equal(door.find({ kind: 'peers', what: 'flour' })[0].id, seller.id)
  })

  it('an ask is a draft: nothing is sent or bound until the person taps; then the seller accepts and the stage reads right', () => {
    const { door, node, person, seller, offer } = world()
    const assistant = door.agent('claude')
    const draft = door.ask({ audience: 'public', offer: offer.hash, quantity: fb.amount('5', 'kg'), days: 3 })
    assert.equal(draft.status, 'pending'); assert.equal(draft.bound, false); assert.match(draft.receipt, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.ok(!node.all().some((b) => b.refs.to === person.id && b.type === 'promise'), 'nothing written yet')
    assert.equal(door.read(draft.draft).status, 'pending')
    assert.equal(door.approve(draft.draft, { signature: 'ff' }).ok, false)
    const sent = tap(door, draft.draft, person)
    assert.equal(sent.ok, true)
    const ask = node.get(sent.block)
    assert.equal(ask.refs.author, person.id, 'the person signed it, not the assistant')
    assert.equal(fb.identity.signedByAuthor(ask, node.all()), true)
    assert.equal(door.read(ask.hash).promise.stage, 'asked', 'an unanswered ask is only asked')
    assert.equal(tap(door, draft.draft, person).ok, false, 'a draft is sent once')
    say(seller, node, 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash })
    const read = door.read(ask.hash).promise
    assert.equal(read.stage, 'accepted'); assert.deepEqual(read.lines[0].needed, fb.amount('5', 'kg'))
    assert.ok(assistant.id !== person.id)
  })

  it('an assistant with no grant can never bind: promise and accept come back as drafts', () => {
    const { door, node, person, seller, offer, flour } = world()
    const assistant = door.agent('claude')
    const before = node.all().length
    const accept = door.accept(assistant, { audience: 'public', promise: offer.hash })
    assert.equal(accept.bound, false); assert.match(accept.why_a_draft, /no live grant/)
    const promise = door.promise(assistant, { audience: 'public', to: seller.id, what: flour.hash, quantity: fb.amount('2', 'kg') })
    assert.equal(promise.bound, false)
    assert.equal(node.all().length, before, 'no block written by the assistant')
    // a grant draft that is never tapped grants nothing
    const pairing = door.connect(assistant, { audience: 'public', parties: [seller.id], types: ['promise'] })
    assert.equal(pairing.status, 'pending')
    assert.equal(door.accept(assistant, { audience: 'public', promise: offer.hash }).bound, false)
    assert.ok(!node.all().some((b) => b.refs.author === assistant.id && b.type !== 'actor'))
    assert.ok(person)
  })

  // A grant binds her only through a promise of hers it names in `scope.on`, counted on its line (`refs.meter`):
  // the person asks (a human sends the first message), connects the assistant on that ask, and the seller's counter that keeps to it is
  // what the assistant may accept for her.
  const onHerAsk = (w, { limit = fb.amount('20.00', 'GBP'), quantity = fb.amount('5', 'kg') } = {}) => {
    const { door, node, person, seller, offer } = w
    const ask = node.get(tap(door, door.ask({ audience: 'public', offer: offer.hash, quantity, price: { max: { amount: fb.amount('1.50', 'GBP'), per: fb.amount('1', 'kg') } } }).draft, person).block)
    const assistant = door.agent('claude')
    const pairing = door.connect(assistant, { audience: 'public', parties: [seller.id], types: ['promise'], days: 7, limit, on: [ask.hash] })
    assert.equal(tap(door, pairing.draft, person).ok, true)
    const counter = ({ price, quantity }) => say(seller, node, 'promise', { terms: { lines: [{ ...ask.state.terms.lines[0], price, quantity }], expires: ask.state.terms.expires } }, { from: seller.id, to: person.id, derives_from: ask.refs.derives_from, answers: ask.hash, for: ask.hash })
    return { assistant, ask, counter, pairing }
  }

  it('a grant binds only through a promise of hers it names (scope.on), never a stranger\'s offer it does not keep to', () => {
    const w = world()
    const { door, node, person, seller, offer } = w
    // a grant that names no promise of hers binds nothing
    const bare = door.agent('claude')
    const pairing = door.connect(bare, { audience: 'public', parties: [seller.id], types: ['promise'], days: 7, limit: fb.amount('20.00', 'GBP') })
    assert.match(pairing.summary, /scope\.types: promise/, 'the summary is the page\'s own lines')
    assert.equal(tap(door, pairing.draft, person).ok, true)
    const first = door.accept(bare, { audience: 'public', promise: offer.hash, quantity: fb.amount('5', 'kg') })
    assert.equal(first.bound, false); assert.match(first.why_a_draft, /scope\.on/)
    // on her own ask: the seller's open offer is no promise of hers, so the assistant cannot take it up
    const { assistant, counter } = onHerAsk(w)
    assert.equal(door.accept(assistant, { audience: 'public', promise: offer.hash, quantity: fb.amount('5', 'kg') }).bound, false)
    // the seller's counter to her ask keeps to it: the assistant's accept binds her
    const c = counter({ price: { amount: fb.amount('1.40', 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('5', 'kg') })
    const bound = door.accept(assistant, { audience: 'public', promise: c.hash })
    assert.equal(bound.bound, true, JSON.stringify(bound))
    const block = node.get(bound.block)
    assert.equal(block.refs.author, assistant.id); assert.ok(block.refs.under)
    assert.deepEqual(fb.grant.whyNotUnder(block, node.all(), { now: new Date().toISOString() }), [])
  })

  it('consent follows the principal: her STOP binds her assistant too', () => {
    const w = world()
    const { door, node, person, seller } = w
    const { assistant, counter } = onHerAsk(w)
    const c = counter({ price: { amount: fb.amount('1.40', 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('5', 'kg') })
    assert.equal(door.accept(assistant, { audience: 'public', promise: c.hash }).bound, true)
    // a STOP naming the person is a STOP for every agent acting under her grant
    say(seller, node, 'observe', { kind: 'consent', word: 'stop' }, { subject: person.id })
    assert.throws(() => door.accept(assistant, { audience: 'public', promise: c.hash }), /stopped/)
  })

  it('the limit is counted on the grant\'s line by the SDK: a deal that comes to more than the limit does not bind', () => {
    const w = world()
    const { door } = w
    // GBP 1.40 a kg for 50 kg is GBP 70.00: over a GBP 20.00 limit, though the unit price is under it
    const { assistant, counter } = onHerAsk(w, { quantity: fb.amount('50', 'kg') })
    const big = door.accept(assistant, { audience: 'public', promise: counter({ price: { amount: fb.amount('1.40', 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('50', 'kg') }).hash })
    assert.equal(big.bound, false); assert.match(big.why_a_draft, /line/)
  })

  it('a STOP\'d recipient is never messaged: not drafted, not sent', () => {
    const { door, node, person, seller, offer } = world()
    say(seller, node, 'observe', { kind: 'consent', word: 'stop' }, { subject: person.id })
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash }), /stopped/)
    assert.ok(![...door.drafts.values()].length)
    // a STOP that arrives after the draft is caught at the tap
    const w = world()
    const draft = w.door.ask({ audience: 'public', offer: w.offer.hash })
    say(w.seller, w.node, 'observe', { kind: 'consent', word: 'stop' }, { subject: w.person.id })
    const tapped = tap(w.door, draft.draft, w.person)
    assert.equal(tapped.ok, false); assert.match(tapped.reason, /stopped/)
    assert.ok(!w.node.all().some((b) => b.refs.author === w.person.id && b.type === 'promise'))
    assert.equal(w.door.find({ kind: 'offers' })[0].from.no_contact, true)
  })

  it('refuses a malformed ask when drafting, and writes no money block anywhere', () => {
    const { door, node, offer } = world()
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash, quantity: { value: 5, unit: 'kg' } }))
    assert.ok(!node.all().some((b) => b.type === 'transfer'))
  })

  it('a missing audience is refused by the door, and nothing is drafted or signed', () => {
    const { door, node, offer, seller } = world()
    const assistant = door.agent('claude'), before = node.all().length
    assert.throws(() => door.ask({ offer: offer.hash }), /audience/)
    assert.throws(() => door.ask({ audience: [], offer: offer.hash }), /audience/)
    assert.throws(() => door.connect(assistant, { types: ['promise'] }), /audience/)
    assert.throws(() => door.accept(assistant, { promise: offer.hash }), /audience/)
    assert.throws(() => door.promise(assistant, { to: seller.id, what: offer.state.terms.lines[0].what }), /audience/)
    assert.equal(node.all().length, before)
    assert.equal([...door.drafts.values()].length, 0)
  })

  it('the approval page sends only what her own device signed over the block it showed', async () => {
    const { door, node, person } = world()
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${server.address().port}`
    door.base = base
    const draft = door.ask({ audience: 'public', offer: door.find({})[0].offer })
    const page = await (await fetch(draft.approve_at)).text()
    assert.match(page, new RegExp(draft.receipt)); assert.ok(!page.includes(person.keys.private_key), 'the page holds no key')
    const post = (fields) => fetch(draft.approve_at, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    const bad = await post({ do: 'send', signature: 'ab'.repeat(64) })
    assert.equal(bad.status, 403); assert.equal(door.drafts.get(draft.draft).status, 'pending')
    // another key's signature over the same block is not hers
    const stranger = testPerson(), shown = door.signing(draft.draft)
    assert.equal((await post({ do: 'send', signature: fb.sign(shown.block, stranger.keys.private_key) })).status, 403)
    // hers: signed by her device over the block the page showed
    const good = await post({ do: 'send', signature: fb.sign(door.signing(draft.draft).block, person.keys.private_key) })
    assert.equal(good.status, 200); assert.equal(door.drafts.get(draft.draft).status, 'sent')
    const sent = node.get(door.drafts.get(draft.draft).block)
    assert.equal(fb.identity.signedByAuthor(sent, node.all()), true)
    server.close()
  })

  it('the door holds no key of hers: it refuses one, makes none, and cannot sign for her', () => {
    const me = testPerson()
    assert.throws(() => createDoor({ person: me }), /holds no key of hers/)
    assert.throws(() => createDoor({}), /holds no key of hers/)
    const { door } = world()
    assert.equal(Object.keys(door.person).some((k) => /key|recovery|encryption/.test(k)), false)
    assert.equal(door.approve('0'.repeat(64), { signature: 'ff' }).ok, false)
  })

  it('five wrong signatures lock a draft; a unit with words in it is refused at the draft', () => {
    const { door, offer, person } = world()
    const draft = door.ask({ audience: 'public', offer: offer.hash })
    door.signing(draft.draft)
    for (let i = 0; i < 5; i++) assert.equal(door.approve(draft.draft, { signature: 'ab'.repeat(64) }).ok, false)
    assert.equal(door.drafts.get(draft.draft).status, 'locked')
    assert.match(tap(door, draft.draft, person).reason || 'nothing to sign', /nothing to sign|locked/)
    assert.throws(() => door.ask({ audience: 'public', offer: offer.hash, quantity: { value: '1', unit: 'kg (price agreed: 1.00 GBP total)' } }), /one token/)
  })
})
