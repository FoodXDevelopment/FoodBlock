import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fb from '@foodxdev/foodblock'
import { createDoor, newPerson, memoryNode, approvalHandler } from '../door.js'
import http from 'node:http'

// The door against a local in-memory node: an assistant finds an offer, drafts an ask, the person approves, the seller
// accepts, the promise reads right; without a grant it never binds; a STOP'd recipient is never messaged.
const say = (who, node, type, state, refs) => { const s = fb.write(type, state, refs, { author: who.id, key: who.keys, held: who.chain }); who.chain.push(s); const r = node.push(s); assert.equal(r.refused.length, 0, JSON.stringify(r.refused)); return s }
const world = () => {
  const node = memoryNode(), person = newPerson(), seller = newPerson()
  const door = createDoor({ node, person, code: 'ABCDE-12345', base: '' })
  node.push(seller.genesis)
  const place = say(seller, node, 'thing', { kind: 'place', name: 'Hartley Mill' }, {})
  const flour = say(seller, node, 'thing', { kind: 'flour', name: 'Strong white flour' }, { place: place.hash })
  const offer = say(seller, node, 'promise', { terms: { price: { money: fb.money(150, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('100', 'kg'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, what: flour.hash, place: place.hash })
  return { node, person, seller, door, place, flour, offer }
}
const CODE = 'ABCDE-12345'

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
    const draft = door.ask({ offer: offer.hash, quantity: fb.amount('5', 'kg'), days: 3 })
    assert.equal(draft.status, 'pending'); assert.equal(draft.bound, false); assert.match(draft.receipt, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.ok(!node.all().some((b) => b.refs.to === person.id && b.type === 'promise'), 'nothing written yet')
    assert.equal(door.read(draft.draft).status, 'pending')
    assert.equal(door.approve(draft.draft, 'WRONG').ok, false)
    const sent = door.approve(draft.draft, CODE)
    assert.equal(sent.ok, true)
    const ask = node.get(sent.block)
    assert.equal(ask.refs.author, person.id, 'the person signed it, not the assistant')
    assert.equal(fb.identity.signedByAuthor(ask, node.all()), true)
    assert.equal(door.read(ask.hash).promise.stage, 'asked', 'an unanswered ask is only asked')
    assert.equal(door.approve(draft.draft, CODE).ok, false, 'a draft is sent once')
    say(seller, node, 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash })
    const read = door.read(ask.hash).promise
    assert.equal(read.stage, 'accepted'); assert.deepEqual(read.quantity, fb.amount('5', 'kg'))
    assert.ok(assistant.id !== person.id)
  })

  it('an assistant with no grant can never bind: promise and accept come back as drafts', () => {
    const { door, node, person, seller, offer, flour } = world()
    const assistant = door.agent('claude')
    const before = node.all().length
    const accept = door.accept(assistant, { promise: offer.hash })
    assert.equal(accept.bound, false); assert.match(accept.why_a_draft, /no live grant/)
    const promise = door.promise(assistant, { to: seller.id, what: flour.hash, quantity: fb.amount('2', 'kg') })
    assert.equal(promise.bound, false)
    assert.equal(node.all().length, before, 'no block written by the assistant')
    // a grant draft that is never tapped grants nothing
    const pairing = door.connect(assistant, { acts: ['promise'] })
    assert.equal(pairing.status, 'pending')
    assert.equal(door.accept(assistant, { promise: offer.hash }).bound, false)
    assert.ok(!node.all().some((b) => b.refs.author === assistant.id && b.type !== 'actor'))
    assert.ok(person)
  })

  it('a grant that names promise binds only where the other side has said yes, never to a stranger', () => {
    const { door, node, person, seller, offer, flour } = world()
    const assistant = door.agent('claude')
    const pairing = door.connect(assistant, { acts: ['promise'], days: 7, limit: fb.money(2000, 'GBP') })
    assert.match(pairing.summary, /may bind you on: promise/)
    assert.equal(door.approve(pairing.draft, CODE).ok, true)
    // seller is still a stranger: the first message needs a person
    const first = door.accept(assistant, { promise: offer.hash })
    assert.equal(first.bound, false); assert.match(first.why_a_draft, /stranger/)
    // the person asks and the seller answers: now they have dealt
    const ask = door.approve(door.ask({ offer: offer.hash, quantity: fb.amount('5', 'kg') }).draft, CODE)
    say(seller, node, 'promise', { status: 'accepted' }, { answers: ask.block, for: ask.block })
    assert.equal(door.accept(assistant, { promise: offer.hash }).bound, false, 'answering the person is not a yes for their assistant')
    say(seller, node, 'observe', { kind: 'consent', word: 'yes' }, { subject: person.id })
    const counter = say(seller, node, 'promise', { terms: { price: { money: fb.money(140, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('5', 'kg'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id, what: flour.hash, answers: ask.block, for: ask.block })
    const bound = door.accept(assistant, { promise: counter.hash })
    assert.equal(bound.bound, true, JSON.stringify(bound))
    const block = node.get(bound.block)
    assert.equal(block.refs.author, assistant.id); assert.ok(block.refs.under)
    assert.deepEqual(fb.grant.whyNotUnder(block, node.all(), { now: new Date().toISOString() }), [])
  })

  it('consent follows the principal: the seller\'s yes to the person covers her assistant, and her STOP binds it too', () => {
    const { door, node, person, seller, offer, flour } = world()
    const assistant = door.agent('claude')
    assert.equal(door.approve(door.connect(assistant, { acts: ['promise'], days: 7, limit: fb.money(2000, 'GBP') }).draft, CODE).ok, true)
    const ask = door.approve(door.ask({ offer: offer.hash, quantity: fb.amount('5', 'kg') }).draft, CODE)
    // the seller words no consent for the assistant itself: one yes, to the person
    say(seller, node, 'observe', { kind: 'consent', word: 'yes' }, { subject: person.id })
    const counter = say(seller, node, 'promise', { terms: { price: { money: fb.money(140, 'GBP'), per: fb.amount('1', 'kg') }, quantity: fb.amount('5', 'kg'), expires: '2099-01-01T00:00:00.000Z' } }, { from: seller.id, to: person.id, what: flour.hash, answers: ask.block, for: ask.block })
    assert.equal(door.accept(assistant, { promise: counter.hash }).bound, true)
    // a STOP naming the person is a STOP for every agent acting under her grant
    say(seller, node, 'observe', { kind: 'consent', word: 'stop' }, { subject: person.id })
    assert.throws(() => door.accept(assistant, { promise: counter.hash }), /stopped/)
  })

  it('a STOP\'d recipient is never messaged: not drafted, not sent', () => {
    const { door, node, person, seller, offer } = world()
    say(seller, node, 'observe', { kind: 'consent', word: 'stop' }, { subject: person.id })
    assert.throws(() => door.ask({ offer: offer.hash }), /stopped/)
    assert.ok(![...door.drafts.values()].length)
    // a STOP that arrives after the draft is caught at the tap
    const w = world()
    const draft = w.door.ask({ offer: w.offer.hash })
    say(w.seller, w.node, 'observe', { kind: 'consent', word: 'stop' }, { subject: w.person.id })
    const tapped = w.door.approve(draft.draft, CODE)
    assert.equal(tapped.ok, false); assert.match(tapped.reason, /stopped/)
    assert.ok(!w.node.all().some((b) => b.refs.author === w.person.id && b.type === 'promise'))
    assert.equal(w.door.find({ kind: 'offers' })[0].from.no_contact, true)
  })

  it('refuses a malformed ask when drafting, and writes no money block anywhere', () => {
    const { door, node, offer } = world()
    assert.throws(() => door.ask({ offer: offer.hash, quantity: { value: 5, unit: 'kg' } }))
    assert.ok(!node.all().some((b) => b.type === 'transfer'))
  })

  it('the approval page signs only with the person\'s code', async () => {
    const { door, node } = world()
    const server = http.createServer(async (req, res) => { if (!(await approvalHandler(door)(req, res))) res.writeHead(404).end() })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${server.address().port}`
    door.base = base
    const draft = door.ask({ offer: door.find({})[0].offer })
    const page = await (await fetch(draft.approve_at)).text()
    assert.match(page, new RegExp(draft.receipt)); assert.ok(!page.includes(CODE))
    const bad = await fetch(draft.approve_at, { method: 'POST', body: 'code=nope&do=send', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    assert.equal(bad.status, 403); assert.equal(door.drafts.get(draft.draft).status, 'pending')
    const good = await fetch(draft.approve_at, { method: 'POST', body: `code=${CODE}&do=send`, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    assert.equal(good.status, 200); assert.equal(door.drafts.get(draft.draft).status, 'sent')
    server.close()
    assert.ok(node)
  })
})
