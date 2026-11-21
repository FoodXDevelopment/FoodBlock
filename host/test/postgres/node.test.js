// The FoodBlock node over HTTP (modules/nodes.md), against an in-memory Postgres (pg-mem), or a real one when
// TEST_DATABASE_URL is set (its tables are dropped and made again for each test).
import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import request from 'supertest'
import { newDb } from 'pg-mem'
import pg from 'pg'
import fb from '@foodxdev/foodblock'
import { createNode } from '../../src/postgres/node.js'

const schema = readFileSync(new URL('../../src/postgres/schema.sql', import.meta.url), 'utf8')
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()

// A person or a machine: their keys, their genesis, and every block they have signed (so each takes its place).
function person(kind = 'person') {
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair()
  const me = fb.identity.genesis(keys, { kind, encryptionKey: encryption.public_key_encrypt, at: at(0), audience: 'public' })
  const chain = [me]
  const say = (type, state, refs = {}, options = {}) => {
    const block = fb.write(type, state, refs, { author: me.hash, key: keys, held: chain, at: at(chain.length), audience: 'public', ...options })
    chain.push(block)
    return block
  }
  return { keys, encryption, me, id: me.hash, chain, say }
}
// Signed without the write check (nor strict writing), to show the node refuses what the SDK refuses.
const unchecked = (who, type, state, refs = {}, link = fb.identity.nextLinkFor(who.id, who.keys.public_key_sign, who.chain)) => {
  const body = { type, state: { ...state, seq: link.seq, at: at(9), audience: 'public' }, refs: { ...refs, author: who.id, prev: link.prev } }
  const block = { hash: fb.hash(body.type, body.state, body.refs), ...body }
  return { ...block, signature: fb.signMessage(fb.header(block), who.keys.private_key).signature }
}
const wrap = (...blocks) => blocks.map((block) => fb.wrap(block))

// The node's holder: a machine identity with its own key. The node signs its answers with that key and holds a key of no one else.
function holderOf() {
  const holder = person('machine')
  return { holder, device: holder.keys, proof: [holder.me] }
}

let pool, app, owner
// The five choices a node's owner must state (the node fills in none): a test states them where it makes a node.
const choices = { perStranger: 1000, strangersPerDay: 100000, admission: null, cap: 500, servesPairs: true, takesPairs: false, waitingPerAuthor: 1000, copyRecipients: 100, copyBytes: 1 << 24 }
// `speaksFor`: other people this node speaks for (a sealed copy is kept only for them or for a party the owner's rule lists)
const node = async ({ speaksFor = [], ...options } = {}) => {
  owner = holderOf()
  app = createNode({ pool, holder: owner.holder.id, key: owner.device, owners: [owner.holder.id, ...speaksFor], url: 'https://node.example', ...choices, ...options })
  await app.node.push({ messages: wrap(...owner.proof) })
  return app
}
// a push is its canonical bytes (1.8): the helpers send them as the core writes them
const sendPush = (body) => request(app).post('/push').set('Content-Type', 'application/json').send(fb.canonicalJSON(body))
const push = (...blocks) => sendPush({ messages: wrap(...blocks) })
// a signed push by its author (a waiting block is kept only from one); the counter must rise per signer
let counter = 0
const signedPush = (who, ...blocks) => sendPush(fb.sync.signPush({ messages: wrap(...blocks) }, { signer: who.id, node: owner.holder.id, privateKey: who.keys.private_key, counter: ++counter + 1000 }))
const pull = (body = {}) => request(app).post('/pull').send(body)
const hashes = (answer) => answer.blocks.map((entry) => fb.unwrap(entry.message).hash)
const signedByNode = (answer) => fb.sync.answerSignedBy(answer, fb.identity.liveKeys(owner.holder.id, owner.proof))

beforeEach(async () => {
  await pool?.end?.()
  if (process.env.TEST_DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
    await pool.query('DROP TABLE IF EXISTS blocks, copies, waiting, counters, challenges')
  } else pool = new (newDb().adapters.createPg().Pool)()
  await pool.query(schema)
  await node()
})
after(() => pool?.end?.())

describe('push', () => {
  it('takes blocks signed by their authors, once each, and signs its answer with a key of its holder', async () => {
    const ann = person()
    const eggs = ann.say('thing', { kind: 'eggs', name: 'Free-range eggs' })
    const first = (await push(ann.me, eggs)).body
    assert.equal(signedByNode(first), true, 'the push answer is signed by the node own own machine key')
    assert.deepEqual([first.node, [...first.taken].sort(), first.refused, first.unjudged], [owner.holder.id, [ann.id, eggs.hash].sort(), [], []])
    const again = (await push(eggs)).body
    assert.deepEqual([again.taken, again.refused, again.held], [[], [], [eggs.hash]], 'a block whose body is held is nothing new: not judged again, reported as held')
    assert.equal(signedByNode(again), true)
    assert.equal((await pull()).body.blocks.length, 3)
  })

  it('refuses a forgery and a block that fails the write check, with a reason', async () => {
    const ann = person()
    await push(ann.me)
    const good = unchecked(ann, 'observe', { kind: 'note', text: 'Oats' })
    const forged = fb.create(good.type, { ...good.state, text: 'Gold' }, good.refs)
    forged.signature = good.signature
    const floaty = unchecked(ann, 'thing', { kind: 'flour', amount: { value: 1.5, unit: 'kg' } })
    const { body } = await push(forged, floaty)
    assert.deepEqual(body.taken, [])
    // 1.9 3a-6, 3a-8: a push is read from its bytes whole; a number that is not canonical refuses the whole push as not_canonical, and nothing in it is taken
    assert.deepEqual(body.refused.map((item) => item.code), ['not_canonical'])
  })

  it('never trusts a sent hash: the content decides', async () => {
    const ann = person()
    // 1.8: a message is exactly { block, signature }; one that also carries a hash is refused as a shape, not quietly trimmed
    const { body } = await sendPush({ messages: [{ ...fb.wrap(ann.me), hash: 'f'.repeat(64) }] })
    assert.deepEqual([body.taken, body.refused.map((item) => item.code)], [[], ['shape']])
    assert.deepEqual((await push(ann.me)).body.taken, [ann.id], 'the content decides: the block as signed is taken')
  })

  it('judges a block on its pieces: a gap in the chain is not a wait (1.8); a block whose author is unknown is unjudged and kept nowhere', async () => {
    const ann = person(), stranger = person()
    const one = ann.say('observe', { kind: 'note', text: 'two trays' })
    const two = ann.say('observe', { kind: 'note', text: 'one tray left' })
    assert.deepEqual((await push(ann.me)).body.taken, [ann.id])
    const gap = (await signedPush(ann, two)).body
    assert.deepEqual([gap.taken, gap.unjudged], [[two.hash], []], 'seq 2 before seq 1 is taken at once: the chain shows the gap, the node does not hold it back')
    assert.deepEqual((await push(one)).body.taken, [one.hash])
    // a block whose author this node has never heard of lacks a piece it cannot judge without (the genesis): unjudged, and an unsigned push keeps nothing
    const note = stranger.say('observe', { kind: 'note', text: 'from nowhere' })
    const lost = (await push(note)).body
    assert.deepEqual([lost.taken, lost.unjudged.map((u) => u.hash), lost.unjudged[0].needs], [[], [note.hash], [stranger.id]])
    assert.deepEqual((await pool.query('SELECT hash FROM waiting')).rows, [])
  })
})

describe('pull', () => {
  it('answers by arrival number, oldest first, signed, and says where to go on', async () => {
    const ann = person()
    const notes = [1, 2, 3].map((n) => ann.say('observe', { kind: 'note', text: `note ${n}` }))
    await push(ann.me, ...notes)
    const ask = { since: 1, limit: 2 }
    const page = (await pull(ask)).body
    assert.deepEqual([hashes(page), page.blocks.map((entry) => entry.n)], [[ann.id, notes[0].hash], [2, 3]])
    assert.equal(page.request, createHash('sha256').update(fb.canonicalJSON(ask), 'utf8').digest('hex'))
    assert.equal(signedByNode(page), true)
    const rest = (await pull({ since: page.next })).body
    assert.deepEqual([hashes(rest), Object.keys(rest.blocks[0].message)], [[notes[1].hash, notes[2].hash], ['block', 'signature']])
    assert.deepEqual((await pull({ since: rest.next })).body.blocks, [])
    assert.equal((await pull({ since: 'soon' })).status, 400)
  })

  it('heads: only the blocks no other match names by prev or updates', async () => {
    const ann = person()
    const v1 = ann.say('thing', { kind: 'bread', name: 'Sourdough' })
    const v2 = ann.say('thing', { kind: 'bread', name: 'Seeded sourdough' }, { updates: v1.hash })
    await push(ann.me, v1, v2)
    assert.deepEqual(hashes((await pull({ filter: { author: ann.id }, heads: true })).body), [v2.hash])
    assert.deepEqual(hashes((await pull({ filter: { record: v1.hash } })).body), [v1.hash, v2.hash])
  })

  it('filters by type, kind and marks (profiles/addressing.md): an address finds its contacts', async () => {
    const ann = person()
    const stall = ann.say('thing', { kind: 'stall', name: 'Saturday stall' })
    const joseph = ann.say('actor', { kind: 'contact', name: 'Joseph', marks: [{ scheme: 'tel', value: '+254700000000' }] })
    await push(ann.me, stall, joseph)
    assert.deepEqual(hashes((await pull({ filter: { type: 'thing', kind: 'stall' } })).body), [stall.hash])
    assert.deepEqual(hashes((await pull({ filter: { marks: { scheme: 'tel', value: '+254700000000' } } })).body), [joseph.hash])
    assert.deepEqual(hashes((await pull({ filter: { marks: { scheme: 'tel', value: '+1' } } })).body), [])
  })

  it('a sealed block: nothing to anyone but its recipient, who is given the copy by a signed pull', async () => {
    const ann = person(), bo = person()
    await node({ speaksFor: [bo.id] })
    const secret = ann.say('observe', { kind: 'note', text: 'for Bo' }, {}, { audience: [bo.id] })
    const copy = fb.sealCopy(secret, { keys: [bo.encryption.public_key_encrypt], reveals: [fb.revealFor(secret.salts, bo.id)] })
    await push(ann.me, bo.me)
    // a copy is kept only from a push its author signed (nodes.md, Push)
    const signed = fb.sync.signPush({ messages: [copy], for: { [secret.hash]: [bo.id] } }, { signer: ann.id, node: owner.holder.id, privateKey: ann.keys.private_key, counter: 1 })
    const pushed = (await sendPush(signed)).body
    assert.deepEqual(pushed.taken, [secret.hash])
    assert.deepEqual((await pull({ filter: { hash: secret.hash } })).body.blocks, [], 'not even its header goes to an asker without a copy (privacy.md)')
    const ask = fb.sync.signPull({ filter: { hash: secret.hash } }, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, counter: 1 })
    const mine = (await pull(ask)).body
    assert.equal(signedByNode(mine), true)
    const read = fb.openCopy(mine.blocks[0].message, bo.encryption.x25519_private)
    assert.deepEqual([read.hash, read.state.text, fb.findsSelf(read, bo.id, read.reveals[0].salt)], [secret.hash, 'for Bo', true])
    assert.match((await pull(ask)).body.error, /replay/, 'a counter is answered once')
    const elsewhere = fb.sync.signPull({}, { signer: bo.id, node: 'c'.repeat(64), privateKey: bo.keys.private_key, counter: 2 })
    assert.match((await pull(elsewhere)).body.error, /another node/)
    const stranger = fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: fb.generateKeypair().private_key, counter: 3 })
    assert.match((await pull(stranger)).body.error, /not signed/)
  })

  it('a challenge: GET /challenge issues one, a signed request uses it once, a made-up one is refused; no time anywhere', async () => {
    const bo = person()
    await push(bo.me)
    const { challenge } = (await request(app).get('/challenge')).body
    const ask = fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, challenge })
    assert.equal(ask.at, undefined)
    assert.equal(signedByNode((await pull(ask)).body), true)
    assert.match((await pull(ask)).body.error, /replay/, 'a challenge is used once')
    const made = fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, challenge: fb.sync.newChallenge() })
    assert.match((await pull(made)).body.error, /not issued/)
    const lower = fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, counter: 5 })
    assert.equal((await pull(lower)).status, 200)
    assert.match((await pull(fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, counter: 5 }))).body.error, /replay/)
  })
})

describe('the wire: a node trusts nothing it is sent (security K)', () => {
  const sealedFor = (ann, bo, text) => {
    const secret = ann.say('observe', { kind: 'note', text }, {}, { audience: [bo.id] })
    return { secret, copy: fb.sealCopy(secret, { keys: [bo.encryption.public_key_encrypt], reveals: [fb.revealFor(secret.salts, bo.id)] }) }
  }
  const signedPull = (who, body, counter) => fb.sync.signPull(body, { signer: who.id, node: owner.holder.id, privateKey: who.keys.private_key, counter })

  it('reads a push from its bytes: a repeated key refuses the push, a number written 1.0 refuses its block (canonical/node_text)', async () => {
    const ann = person()
    await push(ann.me)
    const note = ann.say('observe', { kind: 'eggs', text: 'two trays' })
    const text = JSON.stringify({ messages: wrap(note) })
    const twice = text.replace('"kind":"eggs"', '"kind":"JUNK","kind":"eggs"')
    assert.notEqual(twice, text)
    const dup = await request(app).post('/push').set('Content-Type', 'application/json').send(twice)
    // 1.8 (canonical.md): a message is its canonical bytes; one that is not (here a repeated key) is refused as not_canonical, per message, not as a 400 for the whole push
    assert.equal(dup.status, 200)
    assert.deepEqual([dup.body.taken, dup.body.refused.map((r) => r.code)], [[], ['not_canonical']])
    const floaty = text.replace(`"seq":${note.state.seq}`, `"seq":${note.state.seq}.0`)
    assert.notEqual(floaty, text)
    const one = (await request(app).post('/push').set('Content-Type', 'application/json').send(floaty)).body
    assert.deepEqual([one.taken, one.refused.map((r) => r.code)], [[], ['not_canonical']])
    assert.deepEqual((await push(note)).body.taken, [note.hash], 'the block as its author wrote it is taken')
    const bad = await request(app).post('/push').set('Content-Type', 'application/json').send('{"messages":')
    assert.equal(bad.status, 400)
    assert.equal(bad.text.includes('node_modules'), false, 'no stack and no path in an error')
  })

  it('a private block held in the clear answers no filter at all: not its content, and not its header (privacy/r6, door/t3)', async () => {
    const ann = person(), carol = person(), bo = person()
    await push(ann.me, carol.me, bo.me)
    const complaint = ann.say('observe', { kind: 'complaint', text: 'about Carol' }, { subject: carol.id }, { audience: [bo.id] })
    assert.deepEqual((await push(complaint)).body.taken, [complaint.hash])
    for (const filter of [{ kind: 'complaint' }, { refs: { subject: carol.id } }, { type: 'observe' }]) assert.deepEqual((await pull({ filter })).body.blocks, [], JSON.stringify(filter))
    assert.deepEqual((await pull({ filter: { author: ann.id } })).body.blocks.map((entry) => entry.message.header?.hash).filter(Boolean), [], 'nor does its header answer a filter on its author')
  })

  it('a block after a sealed one follows it in the chain: a sealed block never freezes the public chain (privacy/r7)', async () => {
    const ann = person(), bo = person()
    await push(ann.me, bo.me)
    const { secret, copy } = sealedFor(ann, bo, 'for Bo')
    assert.deepEqual((await sendPush({ messages: [copy] })).body.taken, [secret.hash])
    const after = ann.say('observe', { kind: 'note', text: 'public again' })
    assert.deepEqual((await push(after)).body.taken, [after.hash])
    const stop = ann.say('observe', { kind: 'note', text: 'and on' })
    assert.deepEqual((await push(stop)).body.taken, [stop.hash])
  })

  it('keeps a sealed copy only from its author: a stranger\'s junk envelope is not stored in the recipient\'s place (door/t6, privacy/r4)', async () => {
    const ann = person(), bo = person(), eve = person()
    await node({ speaksFor: [bo.id] })
    await push(ann.me, bo.me, eve.me)
    const { secret, copy } = sealedFor(ann, bo, 'for Bo')
    const junk = { ...copy, envelope: { ...copy.envelope, ciphertext: Buffer.from('junk').toString('base64') } }
    await sendPush({ messages: [junk], for: { [secret.hash]: [bo.id] } })
    assert.deepEqual((await pool.query('SELECT hash FROM copies')).rows, [], 'an unsigned push stores no copy')
    const signed = fb.sync.signPush({ messages: [copy], for: { [secret.hash]: [bo.id] } }, { signer: ann.id, node: owner.holder.id, privateKey: ann.keys.private_key, counter: 1 })
    await sendPush(signed)
    const mine = (await pull(signedPull(bo, { filter: { hash: secret.hash } }, 1))).body
    assert.equal(fb.openCopy(mine.blocks[0].message, bo.encryption.x25519_private).state.text, 'for Bo')
  })

  it('a block waits only from a push its author signed, and a sealed block copies only to as many and as much as the owner states (release 3, 4)', async () => {
    const ann = person(), bo = person(), eve = person()
    await node({ speaksFor: [bo.id], copyRecipients: 1 })
    await push(ann.me, bo.me, eve.me)
    const two = (ann.say('observe', { kind: 'note', text: 'one' }), ann.say('observe', { kind: 'note', text: 'two' }))
    assert.deepEqual((await signedPush(eve, two)).body.taken, [two.hash], 'a push signed by another author makes no difference: the block is judged by its own author\'s keys')
    assert.deepEqual((await pool.query('SELECT hash FROM waiting')).rows, [], 'and nothing waits: 1.8 holds back only a block whose pieces are missing')
    // two recipients where the owner allows one: refused whole, nothing kept
    const secret = ann.say('observe', { kind: 'note', text: 'for Bo and Eve' }, {}, { audience: [bo.id, eve.id] })
    const copy = fb.sealCopy(secret, { keys: [bo.encryption.public_key_encrypt, eve.encryption.public_key_encrypt], reveals: [fb.revealFor(secret.salts, bo.id), fb.revealFor(secret.salts, eve.id)] })
    const signed = fb.sync.signPush({ messages: [copy], for: { [secret.hash]: [bo.id, eve.id] } }, { signer: ann.id, node: owner.holder.id, privateKey: ann.keys.private_key, counter: 5000 })
    const answer = (await sendPush(signed)).body
    assert.deepEqual([answer.taken, answer.refused.map((r) => r.code)], [[], ['not_admitted']])
    assert.deepEqual((await pool.query('SELECT hash FROM copies')).rows, [])
  })

  it('a pull that carries a rival row from beyond what it read does not move next past the rows between (release 5)', async () => {
    const ann = person(), bo = person()
    await node({ cap: 1 })
    const first = ann.say('observe', { kind: 'note', text: 'first' })
    const rival = unchecked(ann, 'observe', { kind: 'note', text: 'rival' }, {}, { seq: 1, prev: ann.id })
    await push(ann.me, first)
    await push(bo.me)
    await push(rival)
    const rows = (await pool.query('SELECT n, hash FROM blocks ORDER BY n')).rows.map((r) => ({ n: Number(r.n), hash: r.hash }))
    const at = (hash) => rows.find((r) => r.hash === hash).n
    const answer = (await pull({ since: at(first.hash) - 1 })).body
    assert.equal(answer.next, at(first.hash), 'next is the last row read, not the rival row that rides beyond it')
    assert.ok(hashes(answer).includes(rival.hash), 'the rival rides as a proof')
    assert.ok(hashes((await pull({ since: answer.next })).body).includes(bo.id), 'the row between is still to be read from next')
  })

  it('a body beats a false header: a stranger\'s header claiming a block\'s hash gives way when the block arrives (forks/f13)', async () => {
    const vic = person(), mal = person(), bo = person()
    await push(vic.me, mal.me, bo.me)
    const v = vic.say('observe', { kind: 'note', text: 'the delivery was accepted' }), v2 = vic.say('observe', { kind: 'note', text: 'and after' })
    const { copy } = sealedFor(mal, bo, 'm1')
    const header = { ...copy.header, hash: v.hash }
    const squat = { ...copy, header, header_signature: fb.signMessage(header, mal.keys.private_key).signature }
    assert.deepEqual((await sendPush({ messages: [squat] })).body.taken, [v.hash])
    const both = (await push(v, v2)).body
    assert.deepEqual(both.taken, [v.hash, v2.hash].sort(), '1.8: a push answer lists what it took ascending by hash')
    const row = (await pool.query('SELECT author, sealed FROM blocks WHERE hash = $1', [v.hash])).rows
    assert.deepEqual(row, [{ author: vic.id, sealed: false }], 'the block holds its own hash')
    assert.deepEqual(hashes((await pull({ filter: { author: vic.id } })).body).sort(), [v.hash, v2.hash].sort())
  })

  it('judges a push with all it rests on: an honest accept pushed alone is taken (synthesis/node_attack2)', async () => {
    const alice = person(), bob = person()
    await push(alice.me, bob.me)
    const eggs = alice.say('thing', { kind: 'eggs' })
    const offer = alice.say('promise', { terms: { price: fb.amount('4.50', 'GBP'), quantity: fb.amount('1', '{tray}') } }, { from: alice.id, to: bob.id, what: eggs.hash })
    const accept = bob.say('promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, after: [offer.hash] })
    await push(eggs, offer)
    const { body } = await push(accept)
    assert.deepEqual([body.taken, body.unjudged], [[accept.hash], []])
    const held = (await pull({})).body.blocks.map((entry) => fb.unwrap(entry.message))
    assert.equal(fb.promiseStage(offer, held).stage, 'accepted')
  })

  it('a counter or a challenge answers once, even when two copies of one request race (door/t2, t2b)', async () => {
    const bo = person()
    await push(bo.me)
    const ask = signedPull(bo, {}, 7)
    const answers = await Promise.all(Array.from({ length: 6 }, () => pull(ask)))
    assert.equal(answers.filter((r) => r.status === 200).length, 1)
    const { challenge } = (await request(app).get('/challenge')).body
    const once = fb.sync.signPull({}, { signer: bo.id, node: owner.holder.id, privateKey: bo.keys.private_key, challenge })
    const raced = await Promise.all(Array.from({ length: 4 }, () => pull(once)))
    assert.equal(raced.filter((r) => r.status === 200).length, 1)
  })
})

describe('discovery and admission', () => {
  it('publishes .well-known/foodblock, and a local announcement from it', async () => {
    const ann = person()
    await node({ owners: [ann.id] })
    await push(ann.me)
    const doc = (await request(app).get('/.well-known/foodblock')).body
    assert.deepEqual(fb.sync.wellKnownErrors(doc), [])
    assert.deepEqual([doc.node, doc.reads, doc.admission, doc.endpoints], [owner.holder.id, [], null,
      { pull: 'https://node.example/pull', push: 'https://node.example/push', challenge: 'https://node.example/challenge' }])
    assert.deepEqual(await app.node.announcement(), fb.sync.announcement(doc))
    assert.deepEqual((await request(app).get('/.well-known/foodblock-admission')).body, { admission: null, per_stranger: 1000, strangers_per_day: 100000, order_channel: [], software_chose: ['per_stranger', 'strangers_per_day', 'order_channel'] }, 'no rule: the number in effect is the node owner\'s stated choice, and says so')
  })

  it("prints its own per_stranger, from its config, where the owner's rule is silent, and admits by it (pass G 40/87)", async () => {
    const boss = person(), stranger = person()
    const rules = boss.say('thing', { kind: 'schema', target: 'observe.admission', fields: { parties: 'hashes', per_stranger: 'integer' } })
    const rule = boss.say('observe', { kind: 'admission', text: 'Nobody else.', parties: [] }, { schema: rules.hash }, { schemas: new Map([[rules.hash, rules]]) })
    await node({ owners: [boss.id], admission: rule.hash, perStranger: 0 })
    await push(boss.me, rules, rule)
    const doc = (await request(app).get('/.well-known/foodblock-admission')).body
    assert.deepEqual(doc, { admission: rule.hash, per_stranger: 0, strangers_per_day: 100000, order_channel: [], software_chose: ['per_stranger', 'strangers_per_day', 'order_channel'] })
    const { body } = await push(stranger.me)
    assert.deepEqual([body.taken, body.refused.map((item) => item.code)], [[], ['not_admitted']], "the node's own 0 refuses the stranger")
  })

  it("with the owner's rule silent on the number, the node's stated choice applies and is published as its own", async () => {
    const boss = person(), stranger = person()
    const rules = boss.say('thing', { kind: 'schema', target: 'observe.admission', fields: { parties: 'hashes', per_stranger: 'integer' } })
    const rule = boss.say('observe', { kind: 'admission', text: 'Nobody else.', parties: [] }, { schema: rules.hash }, { schemas: new Map([[rules.hash, rules]]) })
    await node({ owners: [boss.id], admission: rule.hash })
    await push(boss.me, rules, rule)
    const doc = (await request(app).get('/.well-known/foodblock-admission')).body
    assert.deepEqual(doc, { admission: rule.hash, per_stranger: 1000, strangers_per_day: 100000, order_channel: [], software_chose: ['per_stranger', 'strangers_per_day', 'order_channel'] })
    const { body } = await push(stranger.me)
    assert.deepEqual([body.taken, body.refused], [[stranger.id], []])
  })

  it("the owner's own per_stranger wins over the node's config, and is published as the owner's", async () => {
    const boss = person()
    const rules = boss.say('thing', { kind: 'schema', target: 'observe.admission', fields: { parties: 'hashes', per_stranger: 'integer' } })
    const rule = boss.say('observe', { kind: 'admission', text: 'Two a day.', parties: [], per_stranger: 2 }, { schema: rules.hash }, { schemas: new Map([[rules.hash, rules]]) })
    await node({ owners: [boss.id], admission: rule.hash, perStranger: 0 })
    await push(boss.me, rules, rule)
    assert.deepEqual((await request(app).get('/.well-known/foodblock-admission')).body, { admission: rule.hash, per_stranger: 2, strangers_per_day: 100000, order_channel: [], software_chose: ['strangers_per_day', 'order_channel'] })
  })

  it('refuses a perStranger that is not a whole number', () => {
    const o = holderOf()
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, perStranger: -1 }), /perStranger/)
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, perStranger: 1.5 }), /perStranger/)
  })

  it('refuses a strangersPerDay that is not a whole number, and admits strangers only up to the node\'s own total for all of them together', async () => {
    const o = holderOf()
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, strangersPerDay: undefined }), /strangersPerDay/)
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, strangersPerDay: -1 }), /strangersPerDay/)
    await pool.query('DELETE FROM blocks'); await pool.query('DELETE FROM waiting'); await pool.query('DELETE FROM copies') // the first node's owner is not this node's
    await node({ strangersPerDay: 2, perStranger: 10 })
    const [a, b, c] = [person(), person(), person()]
    assert.deepEqual((await push(a.me)).body.taken, [a.id])
    assert.deepEqual((await push(b.me)).body.taken, [b.id])
    const third = await push(c.me)
    assert.deepEqual([third.body.taken, third.body.refused.map((item) => item.code)], [[], ['not_admitted']])
    assert.equal((await request(app).get('/.well-known/foodblock-admission')).body.strangers_per_day, 2)
  })

  it('index.js exits non-zero naming each choice the owner left out', () => {
    const env = { PATH: process.env.PATH, STRANGERS_PER_DAY: '50', PER_STRANGER: '5', ADMISSION: 'none', PULL_CAP: '100', SERVES_PAIRS: 'true', TAKES_PAIRS: 'false' }
    for (const name of ['STRANGERS_PER_DAY', 'PER_STRANGER', 'ADMISSION', 'PULL_CAP', 'SERVES_PAIRS', 'TAKES_PAIRS']) {
      const { [name]: _left, ...rest } = env
      const run = spawnSync(process.execPath, [new URL('../../src/postgres/index.js', import.meta.url).pathname], { env: rest, encoding: 'utf8' })
      assert.notEqual(run.status, 0)
      assert.match(run.stderr, new RegExp(`${name} is required`))
    }
    const bad = spawnSync(process.execPath, [new URL('../../src/postgres/index.js', import.meta.url).pathname], { env: { ...env, PULL_CAP: '0' }, encoding: 'utf8' })
    assert.notEqual(bad.status, 0)
    assert.match(bad.stderr, /PULL_CAP must be a whole number, 1 or more/)
  })

  it('refuses to start without each of its five choices, naming the missing one', () => {
    const o = holderOf()
    for (const name of Object.keys(choices)) {
      const { [name]: _left, ...rest } = choices
      assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...rest }), new RegExp(name))
    }
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, cap: 0 }), /cap/)
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, servesPairs: 'yes' }), /servesPairs/)
    assert.throws(() => createNode({ pool, holder: o.holder.id, key: o.device, ...choices, admission: 'none' }), /admission/)
  })

  it("admits by the owner's published rule: known parties always, strangers at a rate", async () => {
    const boss = person(), friend = person(), stranger = person()
    const rules = boss.say('thing', { kind: 'schema', target: 'observe.admission', fields: { parties: 'hashes', per_stranger: 'integer' } })
    const rule = boss.say('observe', { kind: 'admission', text: 'Known parties, and one block a day from anyone else.', parties: [friend.id], per_stranger: 1 }, { schema: rules.hash },
      { schemas: new Map([[rules.hash, rules]]) })
    await node({ owners: [boss.id], admission: rule.hash })
    assert.deepEqual((await push(boss.me, rules, rule)).body.refused, [])
    assert.equal((await request(app).get('/.well-known/foodblock')).body.admission, rule.hash)
    assert.deepEqual((await push(friend.me, friend.say('observe', { kind: 'note', text: 'hello' }))).body.refused, [])
    const hello = stranger.say('observe', { kind: 'note', text: 'hi' })
    const { body } = await push(stranger.me, hello)
    assert.deepEqual([body.taken, body.refused.map((item) => item.hash)], [[stranger.id], [hello.hash]])
    assert.equal(body.refused[0].code, 'not_admitted')
  })

  it('admits a listed party only for blocks that speak for it: an old key\'s blocks after its rotation are anyone else\'s (clean round 2, security20 n2)', async () => {
    const boss = person(), friend = person(), phone = fb.generateKeypair()
    const rules = boss.say('thing', { kind: 'schema', target: 'observe.admission', fields: { parties: 'hashes', per_stranger: 'integer' } })
    const rule = boss.say('observe', { kind: 'admission', text: 'Known parties, and no block from anyone else.', parties: [friend.id], per_stranger: 0 }, { schema: rules.hash },
      { schemas: new Map([[rules.hash, rules]]) })
    await node({ owners: [boss.id], admission: rule.hash })
    assert.deepEqual((await push(boss.me, rules, rule)).body.refused, [])
    const note = friend.say('observe', { kind: 'note', text: 'mine' })
    // 1.8: a new key joins only by a second signature, so the case here is the one that stands at once: she takes herself out (voices: [])
    const rot = fb.identity.keyGrant(friend.id, { author: friend.id, keys: friend.keys, held: friend.chain, at: at(5) }, { voices: [], updates: friend.id })
    friend.chain.push(rot)
    assert.deepEqual((await push(friend.me, note, rot)).body.refused, [])
    // the old key goes on signing after its counted_to: valid, kept by no node that admits only her
    const thief = unchecked(friend, 'observe', { kind: 'note', text: 'not hers' }, {}, { seq: 3, prev: rot.hash })
    const { body } = await push(thief)
    assert.deepEqual([body.taken, body.refused.map((item) => item.code)], [[], ['not_admitted']])
  })
})

describe('the node package', () => {
  it('names no protocol version: the discovery document lists the rule sets it reads, and the package number is the package\'s own', async () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    assert.match(version, /^\d+\.\d+\.\d+$/)
    const doc = (await request(app).get('/.well-known/foodblock')).body
    assert.equal(doc.version, undefined)
  })
})
