// The FoodBlock 1.6 node over HTTP (modules/nodes.md), against an in-memory Postgres (pg-mem), or a real one when
// TEST_DATABASE_URL is set (its tables are dropped and made again for each test).
import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import request from 'supertest'
import { newDb } from 'pg-mem'
import pg from 'pg'
import fb from '@foodxdev/foodblock'
import { createNode } from '../node.js'

const schema = readFileSync(new URL('../../sql/schema.sql', import.meta.url), 'utf8')
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()

// A person or a machine: their keys, their genesis, and every block they have signed (so each takes its place).
function person(kind = 'person') {
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair()
  const me = fb.identity.genesis(keys, { kind, encryptionKey: encryption.public_key_encrypt, recoveryKey: fb.generateKeypair().public_key_sign, reach: 'P30D', at: at(0) })
  const chain = [me]
  const say = (type, state, refs = {}, options = {}) => {
    const block = fb.write(type, state, refs, { author: me.hash, key: keys, held: chain, at: at(chain.length), ...options })
    chain.push(block)
    return block
  }
  return { keys, encryption, me, id: me.hash, chain, say }
}
// Signed without the write check (nor strict writing), to show the node refuses what the SDK refuses.
const unchecked = (who, type, state, refs = {}, link = fb.identity.nextLinkFor(who.id, who.keys.public_key_sign, who.chain)) => {
  const body = { type, state: { ...state, seq: link.seq, at: at(9), audience: 'public' }, refs: { ...refs, author: who.id, prev: link.prev } }
  const block = { hash: fb.hash(body.type, body.state, body.refs), ...body }
  return { ...block, signature: fb.sign(block, who.keys.private_key) }
}
const wrap = (...blocks) => blocks.map((block) => fb.wrap(block))

// The node's holder, and the device key (brought in by a key grant) that signs the node's answers.
function holderOf() {
  const holder = person('machine'), device = fb.generateKeypair()
  const grant = fb.identity.keyGrant(holder.id, device.public_key_sign, { private_key: holder.keys.private_key, last: null, broughtIn: holder.id }, { at: at(1) })
  holder.chain.push(grant)
  return { holder, device, proof: [holder.me, grant] }
}

let pool, app, owner
const node = async (options = {}) => {
  owner = holderOf()
  app = createNode({ pool, holder: owner.holder.id, key: owner.device, url: 'https://node.example', ...options })
  await app.node.push({ messages: wrap(...owner.proof) })
  return app
}
const push = (...blocks) => request(app).post('/push').send({ messages: wrap(...blocks) })
const pull = (body = {}) => request(app).post('/pull').send(body)
const hashes = (answer) => answer.blocks.map((entry) => fb.unwrap(entry.message).hash)
const signedByNode = (answer) => fb.sync.answerSignedBy(answer, fb.identity.keysOf(owner.holder.id, owner.proof))

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
    assert.equal(signedByNode(first), true, 'the push answer is signed by the device key its holder brought in')
    assert.deepEqual([first.node, [...first.taken].sort(), first.refused, first.waiting], [owner.holder.id, [ann.id, eggs.hash].sort(), [], []])
    assert.deepEqual((await push(eggs)).body.taken, [eggs.hash], 'the same signed bytes are taken again, never stored twice')
    assert.equal((await pull()).body.blocks.length, 4)
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
    assert.deepEqual([...new Set(body.refused.map((item) => item.hash))].sort(), [forged.hash, floaty.hash].sort())
    assert.equal(body.refused.find((item) => item.hash === floaty.hash).code, 'float')
  })

  it('never trusts a sent hash: the content decides', async () => {
    const ann = person()
    const { body } = await request(app).post('/push').send({ messages: [{ ...fb.wrap(ann.me), hash: 'f'.repeat(64) }] })
    assert.deepEqual(body.taken, [ann.id])
  })

  it('holds a block whose prev is missing until the prev arrives, and lets it expire after the node\'s time', async () => {
    const ann = person()
    const one = ann.say('observe', { kind: 'note', text: 'two trays' })
    const two = ann.say('observe', { kind: 'note', text: 'one tray left' })
    assert.deepEqual((await push(ann.me, two)).body.waiting, [two.hash])
    assert.deepEqual((await push(one)).body.taken.sort(), [one.hash, two.hash].sort())
    assert.deepEqual((await pool.query('SELECT hash FROM waiting')).rows, [])
    await node({ ttl: 0 })
    const three = ann.say('observe', { kind: 'note', text: 'sold out' }), four = ann.say('observe', { kind: 'note', text: 'restocked' })
    await push(ann.me, one, two, four)
    await new Promise((done) => setTimeout(done, 5))
    await push(person().me)
    assert.deepEqual((await pool.query('SELECT hash FROM waiting')).rows, [], 'a block that waited past the node\'s time is dropped')
    assert.deepEqual((await push(three)).body.taken, [three.hash])
  })

  it('catches two blocks of one key naming one prev, and keeps both as proof', async () => {
    const ann = person()
    const one = ann.say('observe', { kind: 'note', text: 'two trays' })
    const other = unchecked(ann, 'observe', { kind: 'note', text: 'five trays' }, {}, { seq: 1, prev: ann.id })
    await push(ann.me, one)
    const { body } = await push(other)
    assert.deepEqual([body.taken, body.refused, body.equivocations], [[], [], [[one.hash, other.hash].sort()]])
    assert.deepEqual(hashes((await pull({ filter: { author: ann.id } })).body).sort(), [one.hash, other.hash].sort(), 'both are served with the chain')
  })

  it('stores and passes on any type: an open type carries no authority', async () => {
    const ann = person()
    const weather = ann.say('weather', { wind: 'north' }, { seller: ann.id })
    const { body } = await push(ann.me, weather)
    assert.deepEqual([...body.taken].sort(), [ann.id, weather.hash].sort())
    assert.deepEqual(body.refused, [])
  })

  it('refuses a block without the common five from a identity: no seq, no prev', async () => {
    const ann = person()
    const loose = { ...fb.create('observe', { kind: 'note', text: 'from before', at: at(3), audience: 'public' }, { author: ann.id }) }
    const { body } = await push(ann.me, { ...loose, signature: fb.sign(loose, ann.keys.private_key) })
    assert.deepEqual(body.taken, [ann.id])
    assert.equal(body.refused[0].code, 'chain')
  })

  it('a first block to a person this node speaks for: an agent may not write first, a live STOP is honoured', async () => {
    const me = person(), agent = person('agent'), human = person()
    await node({ owners: [me.id] })
    await push(me.me, agent.me, human.me)
    const ask = agent.say('observe', { kind: 'offer', text: 'buy our bread' }, { subject: me.id })
    const refused = (await push(ask)).body.refused
    assert.deepEqual(refused.map((one) => one.code), ['not_human'])
    const hi = human.say('observe', { kind: 'offer', text: 'hello' }, { subject: me.id })
    assert.deepEqual((await push(hi)).body.taken, [hi.hash])
    await push(me.say('observe', { kind: 'consent', word: 'stop' }, { subject: human.id }))
    const again = human.say('observe', { kind: 'offer', text: 'hello again' }, { subject: me.id })
    assert.deepEqual((await push(again)).body.refused.map((one) => one.code), ['stopped'])
  })
})

describe('pull', () => {
  it('answers by arrival number, oldest first, signed, and says where to go on', async () => {
    const ann = person()
    const notes = [1, 2, 3].map((n) => ann.say('observe', { kind: 'note', text: `note ${n}` }))
    await push(ann.me, ...notes)
    const ask = { since: 2, limit: 2 }
    const page = (await pull(ask)).body
    assert.deepEqual([hashes(page), page.blocks.map((entry) => entry.n)], [[ann.id, notes[0].hash], [3, 4]])
    assert.equal(page.request, createHash('sha256').update(fb.canonicalJSON(ask), 'utf8').digest('hex'))
    assert.equal(signedByNode(page), true)
    const rest = (await pull({ since: page.next })).body
    assert.deepEqual([hashes(rest), rest.blocks[0].message.version], [[notes[1].hash, notes[2].hash], '1.6'])
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

  it('a sealed block: its header to anyone, its copy only to a signed pull by its recipient', async () => {
    const ann = person(), bo = person()
    const secret = ann.say('observe', { kind: 'note', text: 'for Bo' }, {}, { audience: [bo.id] })
    const copy = fb.sealCopy(secret, { keys: [bo.encryption.public_key_encrypt], reveals: [fb.revealFor(secret.salts, bo.id)], privateKey: ann.keys.private_key })
    const pushed = (await request(app).post('/push').send({ messages: [...wrap(ann.me, bo.me), copy], for: { [secret.hash]: [bo.id] } })).body
    assert.deepEqual(pushed.taken.sort(), [ann.id, bo.id, secret.hash].sort())
    const open = (await pull({ filter: { hash: secret.hash } })).body.blocks[0].message
    assert.deepEqual(Object.keys(open).sort(), ['header', 'header_signature', 'version'])
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

describe('discovery and admission', () => {
  it('publishes .well-known/foodblock, and a local announcement from it', async () => {
    const ann = person()
    await node({ owners: [ann.id] })
    await push(ann.me)
    const doc = (await request(app).get('/.well-known/foodblock')).body
    assert.deepEqual(fb.sync.wellKnownErrors(doc), [])
    assert.deepEqual([doc.node, doc.version, doc.holds.includes(ann.id), doc.speaks_for, doc.admission, doc.endpoints], [owner.holder.id, fb.VERSION, true, [ann.id], null,
      { pull: 'https://node.example/pull', push: 'https://node.example/push', challenge: 'https://node.example/challenge' }])
    assert.deepEqual(await app.node.announcement(), fb.sync.announcement(doc))
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
})

describe('the node package', () => {
  it('names the protocol version it speaks, read from protocol.json', () => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    assert.ok(version.startsWith(`${fb.VERSION}.`))
  })
})
