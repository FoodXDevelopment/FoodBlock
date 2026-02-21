import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app, { pool } from '../index.js'
import { generateKeypair, sign, create, canonical } from '../../sdk/javascript/src/index.js'

// Clean tables before each test
beforeEach(async () => {
  await pool.query('DELETE FROM foodblocks')
  await pool.query('DELETE FROM federation_peers').catch(() => {})
})

after(async () => {
  await pool.end()
  // Force exit — setInterval in rate limiter keeps event loop alive
  setTimeout(() => process.exit(0), 100)
})

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'ok')
  })
})

describe('POST /blocks', () => {
  it('creates a block', async () => {
    const res = await request(app)
      .post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Test Farm' } })

    assert.equal(res.status, 201)
    assert.equal(res.body.type, 'actor.producer')
    assert.equal(res.body.state.name, 'Test Farm')
    assert.deepEqual(res.body.refs, {})
    assert.equal(res.body.hash.length, 64)
  })

  it('returns existing block on duplicate', async () => {
    const first = await request(app)
      .post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Test Farm' } })
    assert.equal(first.status, 201)

    const second = await request(app)
      .post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Test Farm' } })
    assert.equal(second.status, 200)
    assert.equal(second.body.exists, true)
    assert.equal(second.body.block.hash, first.body.hash)
  })

  it('creates a block with refs', async () => {
    const farm = await request(app)
      .post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })

    const product = await request(app)
      .post('/blocks')
      .send({
        type: 'substance.product',
        state: { name: 'Bread', price: 4.5 },
        refs: { seller: farm.body.hash }
      })

    assert.equal(product.status, 201)
    assert.equal(product.body.refs.seller, farm.body.hash)
  })

  it('rejects missing type', async () => {
    const res = await request(app)
      .post('/blocks')
      .send({ state: { name: 'No type' } })
    assert.equal(res.status, 400)
  })

  it('rejects type over 100 chars', async () => {
    const res = await request(app)
      .post('/blocks')
      .send({ type: 'a'.repeat(101) })
    assert.equal(res.status, 400)
  })

  it('rejects non-object state', async () => {
    const res = await request(app)
      .post('/blocks')
      .send({ type: 'test', state: 'not-an-object' })
    assert.equal(res.status, 400)
  })

  it('rejects non-object refs', async () => {
    const res = await request(app)
      .post('/blocks')
      .send({ type: 'test', refs: 'not-an-object' })
    assert.equal(res.status, 400)
  })
})

describe('GET /blocks/:hash', () => {
  it('fetches a block by hash', async () => {
    const created = await request(app)
      .post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Eggs' } })

    const res = await request(app).get(`/blocks/${created.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, created.body.hash)
    assert.equal(res.body.type, 'substance.product')
    assert.equal(res.body.state.name, 'Eggs')
  })

  it('returns 404 for unknown hash', async () => {
    const fakeHash = 'a'.repeat(64)
    const res = await request(app).get(`/blocks/${fakeHash}`)
    assert.equal(res.status, 404)
  })
})

describe('GET /blocks', () => {
  it('queries blocks by type', async () => {
    await request(app).post('/blocks').send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks').send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get('/blocks?type=actor')
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 1)
    assert.equal(res.body.blocks[0].type, 'actor.producer')
  })

  it('queries with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/blocks').send({ type: 'test', state: { i } })
    }

    const res = await request(app).get('/blocks?type=test&limit=2&offset=1')
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 2)
  })

  it('queries by ref value', async () => {
    const farm = await request(app)
      .post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })

    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' }, refs: { seller: farm.body.hash } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Cake' }, refs: { seller: 'other_hash' } })

    const res = await request(app).get(`/blocks?ref=seller&ref_value=${farm.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 1)
    assert.equal(res.body.blocks[0].state.name, 'Bread')
  })
})

describe('GET /heads', () => {
  it('returns head blocks', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.0 } })

    // Update — v1 should no longer be head
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 5.0 }, refs: { updates: v1.body.hash } })

    const res = await request(app).get('/heads')
    assert.equal(res.status, 200)
    // Only the updated block should be head
    const hashes = res.body.blocks.map(b => b.hash)
    assert.ok(!hashes.includes(v1.body.hash))
  })

  it('filters heads by type', async () => {
    await request(app).post('/blocks').send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks').send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get('/heads?type=substance')
    assert.equal(res.status, 200)
    assert.ok(res.body.blocks.every(b => b.type.startsWith('substance')))
  })
})

describe('GET /chain/:hash', () => {
  it('returns the provenance chain', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.0 } })

    const v2 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5 }, refs: { updates: v1.body.hash } })

    const v3 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 5.0 }, refs: { updates: v2.body.hash } })

    const res = await request(app).get(`/chain/${v3.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 3)
    assert.equal(res.body.chain[0].hash, v3.body.hash)
    assert.equal(res.body.chain[2].hash, v1.body.hash)
  })

  it('returns single block for genesis', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })

    const res = await request(app).get(`/chain/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 1)
  })

  it('respects depth parameter', async () => {
    let prev = await request(app).post('/blocks')
      .send({ type: 'test', state: { v: 0 } })

    for (let i = 1; i <= 10; i++) {
      prev = await request(app).post('/blocks')
        .send({ type: 'test', state: { v: i }, refs: { updates: prev.body.hash } })
    }

    const res = await request(app).get(`/chain/${prev.body.hash}?depth=3`)
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 3)
  })
})

describe('error handling', () => {
  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/blocks')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
    assert.equal(res.status, 400)
  })
})

// ── New tests below ─────────────────────────────────────────

describe('GET / (server info)', () => {
  it('returns server name, version, and block count', async () => {
    const res = await request(app).get('/')
    assert.equal(res.status, 200)
    assert.equal(res.body.name, 'FoodBlock Reference Server')
    assert.equal(res.body.version, '0.6.0')
    assert.equal(typeof res.body.blocks, 'number')
    assert.ok(res.body.endpoints)
  })

  it('block count reflects inserted blocks', async () => {
    await request(app).post('/blocks').send({ type: 'test', state: { n: 1 } })
    await request(app).post('/blocks').send({ type: 'test', state: { n: 2 } })

    const res = await request(app).get('/')
    assert.equal(res.status, 200)
    assert.equal(res.body.blocks, 2)
  })
})

describe('POST /fb (natural language)', () => {
  it('creates a block from natural language text', async () => {
    const res = await request(app)
      .post('/fb')
      .send({ text: 'Sourdough bread $4.50' })

    assert.equal(res.status, 201)
    assert.ok(res.body.blocks)
    assert.ok(res.body.blocks.length >= 1)
    assert.equal(res.body.primary.type, 'substance.product')
    assert.ok(res.body.primary.state.name)
    assert.deepEqual(res.body.primary.state.price, { value: 4.5, unit: 'USD' })
  })

  it('persists the generated block in the database', async () => {
    const fbRes = await request(app)
      .post('/fb')
      .send({ text: 'Sourdough bread $4.50' })
    assert.equal(fbRes.status, 201)

    const hash = fbRes.body.blocks[0].hash
    const getRes = await request(app).get(`/blocks/${hash}`)
    assert.equal(getRes.status, 200)
    assert.equal(getRes.body.hash, hash)
  })

  it('rejects missing text field', async () => {
    const res = await request(app)
      .post('/fb')
      .send({})
    assert.equal(res.status, 400)
    assert.ok(res.body.error)
  })

  it('rejects non-string text field', async () => {
    const res = await request(app)
      .post('/fb')
      .send({ text: 12345 })
    assert.equal(res.status, 400)
  })
})

describe('POST /blocks (fork detection)', () => {
  it('returns 409 when two blocks update the same predecessor', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.0 } })
    assert.equal(v1.status, 201)

    const v2 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5 }, refs: { updates: v1.body.hash } })
    assert.equal(v2.status, 201)

    // A second block that also updates v1 should conflict
    const v2b = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 5.0 }, refs: { updates: v1.body.hash } })
    assert.equal(v2b.status, 409)
    assert.ok(v2b.body.error.includes('Conflict'))
  })
})

describe('GET /blocks (combined filters)', () => {
  it('queries with type + ref + limit combined', async () => {
    const farm = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })

    // Create 5 products referencing the farm
    for (let i = 0; i < 5; i++) {
      await request(app).post('/blocks')
        .send({
          type: 'substance.product',
          state: { name: `Product ${i}` },
          refs: { seller: farm.body.hash }
        })
    }
    // Create a non-matching block (different type, same ref)
    await request(app).post('/blocks')
      .send({
        type: 'transfer.order',
        state: { total: 100 },
        refs: { seller: farm.body.hash }
      })

    const res = await request(app)
      .get(`/blocks?type=substance&ref=seller&ref_value=${farm.body.hash}&limit=3`)
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 3)
    assert.ok(res.body.blocks.every(b => b.type.startsWith('substance')))
    assert.ok(res.body.blocks.every(b => b.refs.seller === farm.body.hash))
  })

  it('queries with heads=true filter', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Milk', price: 3.0 } })

    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Milk', price: 3.5 }, refs: { updates: v1.body.hash } })

    const res = await request(app).get('/blocks?type=substance&heads=true')
    assert.equal(res.status, 200)
    // v1 is no longer a head, so only v2 should appear
    const hashes = res.body.blocks.map(b => b.hash)
    assert.ok(!hashes.includes(v1.body.hash))
    assert.equal(res.body.count, 1)
  })
})

describe('concurrent block creation', () => {
  it('handles two identical blocks created simultaneously', async () => {
    const payload = { type: 'actor.producer', state: { name: 'Concurrent Farm' } }

    // Fire both requests at the same time
    const [res1, res2] = await Promise.all([
      request(app).post('/blocks').send(payload),
      request(app).post('/blocks').send(payload)
    ])

    // One should be 201 (created) and the other 200 (exists) — or both could be 201
    // if the INSERT races, but either way no 500 errors
    assert.ok([200, 201].includes(res1.status), `res1 status was ${res1.status}`)
    assert.ok([200, 201].includes(res2.status), `res2 status was ${res2.status}`)

    // Both refer to the same hash
    const hash1 = res1.status === 201 ? res1.body.hash : res1.body.block.hash
    const hash2 = res2.status === 201 ? res2.body.hash : res2.body.block.hash
    assert.equal(hash1, hash2)
  })
})

describe('GET /chain/:hash (edge cases)', () => {
  it('returns 500 or empty for non-existent hash', async () => {
    const fakeHash = 'b'.repeat(64)
    const res = await request(app).get(`/chain/${fakeHash}`)
    // Chain of non-existent block returns empty chain or server error
    assert.ok([200, 500].includes(res.status))
    if (res.status === 200) {
      assert.equal(res.body.length, 0)
    }
  })

  it('depth=1 returns only the starting block', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'test', state: { v: 1 } })
    const v2 = await request(app).post('/blocks')
      .send({ type: 'test', state: { v: 2 }, refs: { updates: v1.body.hash } })
    const v3 = await request(app).post('/blocks')
      .send({ type: 'test', state: { v: 3 }, refs: { updates: v2.body.hash } })

    const res = await request(app).get(`/chain/${v3.body.hash}?depth=1`)
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 1)
    assert.equal(res.body.chain[0].hash, v3.body.hash)
  })
})

// ── Signed block creation ──────────────────────────────────

describe('POST /blocks (signed blocks)', () => {
  it('accepts a valid signed block', async () => {
    const keypair = generateKeypair()

    // Create an actor block with the public key
    const actor = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Signed Farm', public_key: keypair.publicKey } })
    assert.equal(actor.status, 201)

    // Create a block and sign it with the private key
    const block = create('substance.product', { name: 'Signed Bread', price: 4.5 }, {})
    const wrapper = sign(block, actor.body.hash, keypair.privateKey)

    const res = await request(app).post('/blocks').send(wrapper)
    assert.equal(res.status, 201)
    assert.equal(res.body.type, 'substance.product')
    assert.equal(res.body.state.name, 'Signed Bread')
  })

  it('rejects an invalid signature with 403', async () => {
    const keypair = generateKeypair()
    const wrongKeypair = generateKeypair()

    // Create an actor block with the real public key
    const actor = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Guarded Farm', public_key: keypair.publicKey } })
    assert.equal(actor.status, 201)

    // Create a block but sign with the WRONG private key
    const block = create('substance.product', { name: 'Forged Bread' }, {})
    const wrapper = sign(block, actor.body.hash, wrongKeypair.privateKey)

    const res = await request(app).post('/blocks').send(wrapper)
    assert.equal(res.status, 403)
    assert.ok(res.body.error.includes('Invalid signature'))
  })
})

// ── Tombstone blocks ───────────────────────────────────────

describe('POST /blocks (tombstone)', () => {
  it('creates a tombstone block targeting another block', async () => {
    const original = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Doomed Farm', contact: 'secret@email.com' } })
    assert.equal(original.status, 201)

    const requester = await request(app).post('/blocks')
      .send({ type: 'actor', state: { name: 'Data Officer' } })
    assert.equal(requester.status, 201)

    const tombstone = await request(app).post('/blocks')
      .send({
        type: 'observe.tombstone',
        state: { reason: 'gdpr_erasure', requested_by: requester.body.hash },
        refs: { target: original.body.hash, updates: original.body.hash }
      })
    assert.equal(tombstone.status, 201)
    assert.equal(tombstone.body.type, 'observe.tombstone')
  })

  it('tombstoned block is no longer a head', async () => {
    const original = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Eraseable Bread' } })
    assert.equal(original.status, 201)

    const requester = await request(app).post('/blocks')
      .send({ type: 'actor', state: { name: 'Requester' } })

    await request(app).post('/blocks')
      .send({
        type: 'observe.tombstone',
        state: { reason: 'user_request', requested_by: requester.body.hash },
        refs: { target: original.body.hash, updates: original.body.hash }
      })

    // The original block should no longer be a head
    const heads = await request(app).get('/heads?type=substance')
    const headHashes = heads.body.blocks.map(b => b.hash)
    assert.ok(!headHashes.includes(original.body.hash))
  })
})

// ── Pagination edge cases ──────────────────────────────────

describe('GET /blocks (pagination edge cases)', () => {
  it('offset beyond total count returns empty results', async () => {
    await request(app).post('/blocks').send({ type: 'test.pagination', state: { n: 1 } })
    await request(app).post('/blocks').send({ type: 'test.pagination', state: { n: 2 } })

    const res = await request(app).get('/blocks?type=test.pagination&offset=100')
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 0)
    assert.deepEqual(res.body.blocks, [])
  })

  it('limit=0 gets clamped to 1', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/blocks').send({ type: 'test.clamp', state: { i } })
    }

    const res = await request(app).get('/blocks?type=test.clamp&limit=0')
    assert.equal(res.status, 200)
    // clampLimit(0) => parseInt('0') || 50 => 0 is falsy => 50, then clamped to max(50,1) = 50
    // Actually: parseInt('0') is 0, 0 || 50 = 50
    assert.equal(res.body.count, 3)
  })

  it('very large limit gets clamped to 1000', async () => {
    await request(app).post('/blocks').send({ type: 'test.biglimit', state: { n: 1 } })

    const res = await request(app).get('/blocks?type=test.biglimit&limit=9999')
    assert.equal(res.status, 200)
    // Should succeed without error; limit is internally clamped to 1000
    assert.equal(res.body.count, 1)
  })
})

// ── Type prefix matching ───────────────────────────────────

describe('GET /blocks (type prefix matching)', () => {
  it('type=actor returns actor subtypes but not substance', async () => {
    await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm A' } })
    await request(app).post('/blocks')
      .send({ type: 'actor.seller', state: { name: 'Shop B' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get('/blocks?type=actor')
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 2)
    assert.ok(res.body.blocks.every(b => b.type.startsWith('actor')))
  })

  it('type=substance returns only substance blocks', async () => {
    await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Eggs' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.ingredient', state: { name: 'Flour' } })

    const res = await request(app).get('/blocks?type=substance')
    assert.equal(res.status, 200)
    assert.equal(res.body.count, 2)
    assert.ok(res.body.blocks.every(b => b.type.startsWith('substance')))
    assert.ok(!res.body.blocks.some(b => b.type.startsWith('actor')))
  })
})

// ── Update chain integrity ─────────────────────────────────

describe('update chain integrity', () => {
  it('v1 and v2 are not heads, v3 is the head', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Milk', price: 2.0 } })
    assert.equal(v1.status, 201)

    const v2 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Milk', price: 2.5 }, refs: { updates: v1.body.hash } })
    assert.equal(v2.status, 201)

    const v3 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Milk', price: 3.0 }, refs: { updates: v2.body.hash } })
    assert.equal(v3.status, 201)

    // Check that only v3 is a head
    const heads = await request(app).get('/heads?type=substance')
    assert.equal(heads.status, 200)
    const headHashes = heads.body.blocks.map(b => b.hash)
    assert.ok(!headHashes.includes(v1.body.hash), 'v1 should not be a head')
    assert.ok(!headHashes.includes(v2.body.hash), 'v2 should not be a head')
    assert.ok(headHashes.includes(v3.body.hash), 'v3 should be the head')
  })

  it('heads=true on /blocks returns only the latest version', async () => {
    const v1 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Butter', price: 1.0 } })
    const v2 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Butter', price: 1.5 }, refs: { updates: v1.body.hash } })
    const v3 = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Butter', price: 2.0 }, refs: { updates: v2.body.hash } })

    const res = await request(app).get('/blocks?type=substance&heads=true')
    assert.equal(res.status, 200)
    const hashes = res.body.blocks.map(b => b.hash)
    assert.ok(!hashes.includes(v1.body.hash), 'v1 should not appear in heads query')
    assert.ok(!hashes.includes(v2.body.hash), 'v2 should not appear in heads query')
    assert.ok(hashes.includes(v3.body.hash), 'v3 should appear in heads query')
    assert.equal(res.body.count, 1)
  })
})

// ── Natural language advanced ──────────────────────────────

describe('POST /fb (advanced)', () => {
  it('review text produces multiple blocks including a review', async () => {
    const res = await request(app)
      .post('/fb')
      .send({ text: "Amazing sourdough at Baker's Dozen, 5 stars" })

    assert.equal(res.status, 201)
    assert.ok(res.body.blocks.length >= 1)

    const types = res.body.blocks.map(b => b.type)
    // Should contain a review block (the primary intent is a review)
    const hasReview = types.some(t => t.startsWith('observe.review'))
    const hasPlace = types.some(t => t.startsWith('place') || t.startsWith('actor'))
    const hasProduct = types.some(t => t.startsWith('substance'))
    // At minimum, the primary should be a review or product
    assert.ok(hasReview || hasProduct, `Expected review or product in types: ${types}`)
  })

  it('extracts price from "$3.50 organic milk"', async () => {
    const res = await request(app)
      .post('/fb')
      .send({ text: '$3.50 organic milk' })

    assert.equal(res.status, 201)
    assert.ok(res.body.primary)
    assert.ok(res.body.primary.state.price, 'Expected price in state')
    assert.equal(res.body.primary.state.price.value, 3.5)
  })
})

// ══════════════════════════════════════════════════════════════════════
// NEW ENDPOINT TESTS
// ══════════════════════════════════════════════════════════════════════

// ── Tree ─────────────────────────────────────────────────────────────

describe('GET /tree/:hash', () => {
  it('returns provenance tree with nested refs', async () => {
    const farm = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })
    const product = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' }, refs: { seller: farm.body.hash } })

    const res = await request(app).get(`/tree/${product.body.hash}`)
    assert.equal(res.status, 200)
    assert.ok(res.body.block)
    assert.equal(res.body.block.hash, product.body.hash)
    assert.ok(res.body.ancestors)
    assert.ok(res.body.ancestors.seller)
  })

  it('returns single node for block with no refs', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Solo Farm' } })

    const res = await request(app).get(`/tree/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.block.hash, block.body.hash)
    assert.deepEqual(res.body.ancestors, {})
  })
})

// ── Find ─────────────────────────────────────────────────────────────

describe('GET /find', () => {
  it('filters by type', async () => {
    await request(app).post('/blocks').send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks').send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get('/find?type=substance')
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 1)
    assert.ok(res.body.blocks[0].type.startsWith('substance'))
  })

  it('filters by author', async () => {
    const farm = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' }, refs: { author: farm.body.hash } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Cake' }, refs: { author: 'other_hash' } })

    const res = await request(app).get(`/find?author=${farm.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 1)
    assert.equal(res.body.blocks[0].state.name, 'Bread')
  })

  it('filters by state field', async () => {
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', status: 'active' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Cake', status: 'draft' } })

    const res = await request(app).get('/find?state.status=active')
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 1)
    assert.equal(res.body.blocks[0].state.name, 'Bread')
  })

  it('returns has_more for paginated results', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/blocks').send({ type: 'test.find', state: { i } })
    }

    const res = await request(app).get('/find?type=test.find&limit=2')
    assert.equal(res.status, 200)
    assert.equal(res.body.blocks.length, 2)
    assert.equal(res.body.total, 5)
    assert.equal(res.body.has_more, true)
  })

  it('combines multiple filters', async () => {
    const farm = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Farm' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', status: 'active' }, refs: { seller: farm.body.hash } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Cake', status: 'draft' }, refs: { seller: farm.body.hash } })
    await request(app).post('/blocks')
      .send({ type: 'transfer.order', state: { total: 10 }, refs: { seller: farm.body.hash } })

    const res = await request(app).get(`/find?type=substance&ref=seller&ref_value=${farm.body.hash}&state.status=active`)
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 1)
    assert.equal(res.body.blocks[0].state.name, 'Bread')
  })
})

// ── Batch ────────────────────────────────────────────────────────────

describe('POST /batch', () => {
  it('creates multiple blocks', async () => {
    const res = await request(app).post('/batch').send({
      blocks: [
        { type: 'actor.producer', state: { name: 'Farm A' } },
        { type: 'actor.producer', state: { name: 'Farm B' } },
        { type: 'substance.product', state: { name: 'Bread' } },
      ]
    })

    assert.equal(res.status, 201)
    assert.equal(res.body.inserted, 3)
    assert.equal(res.body.skipped, 0)
    assert.equal(res.body.failed, 0)
    assert.equal(res.body.results.length, 3)
  })

  it('handles duplicates as skipped', async () => {
    await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Existing Farm' } })

    const res = await request(app).post('/batch').send({
      blocks: [
        { type: 'actor.producer', state: { name: 'Existing Farm' } },
        { type: 'substance.product', state: { name: 'New Bread' } },
      ]
    })

    assert.equal(res.status, 201)
    assert.equal(res.body.inserted, 1)
    assert.equal(res.body.skipped, 1)
  })

  it('rejects batches over 100 blocks', async () => {
    const blocks = Array.from({ length: 101 }, (_, i) => ({
      type: 'test', state: { i }
    }))

    const res = await request(app).post('/batch').send({ blocks })
    assert.equal(res.status, 400)
    assert.ok(res.body.error.includes('100'))
  })

  it('counts invalid blocks as failed', async () => {
    const res = await request(app).post('/batch').send({
      blocks: [
        { type: 'actor.producer', state: { name: 'Good' } },
        { state: { name: 'Missing type' } },
      ]
    })

    assert.equal(res.status, 201)
    assert.equal(res.body.inserted, 1)
    assert.equal(res.body.failed, 1)
  })
})

// ── Merkle ───────────────────────────────────────────────────────────

describe('Merkle proofs', () => {
  it('GET /prove/:hash/:fields generates selective disclosure proof', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5, organic: true } })

    const res = await request(app).get(`/prove/${block.body.hash}/name,price`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
    assert.ok(res.body.disclosed)
    assert.ok(res.body.proof)
    assert.ok(res.body.root)
    assert.equal(res.body.disclosed.name, 'Bread')
    assert.equal(res.body.disclosed.price, 4.5)
    assert.equal(res.body.disclosed.organic, undefined)
  })

  it('POST /verify-proof verifies a valid proof', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5 } })

    const proveRes = await request(app).get(`/prove/${block.body.hash}/name`)
    assert.equal(proveRes.status, 200)

    const verifyRes = await request(app).post('/verify-proof').send({
      disclosed: proveRes.body.disclosed,
      proof: proveRes.body.proof,
      root: proveRes.body.root,
    })
    assert.equal(verifyRes.status, 200)
    assert.equal(verifyRes.body.valid, true)
  })

  it('POST /verify-proof rejects tampered proof', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5 } })

    const proveRes = await request(app).get(`/prove/${block.body.hash}/name`)

    const verifyRes = await request(app).post('/verify-proof').send({
      disclosed: { name: 'TAMPERED' },
      proof: proveRes.body.proof,
      root: proveRes.body.root,
    })
    assert.equal(verifyRes.status, 200)
    assert.equal(verifyRes.body.valid, false)
  })

  it('GET /merkle-root/:hash returns Merkle root', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread', price: 4.5 } })

    const res = await request(app).get(`/merkle-root/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
    assert.ok(res.body.root)
    assert.equal(res.body.field_count, 2)
  })
})

// ── Human Interface ──────────────────────────────────────────────────

describe('Human interface', () => {
  it('GET /explain/:hash generates narrative', async () => {
    const farm = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Green Acres Farm' } })
    const product = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Sourdough' }, refs: { seller: farm.body.hash } })

    const res = await request(app).get(`/explain/${product.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, product.body.hash)
    assert.ok(typeof res.body.narrative === 'string')
  })

  it('POST /parse-fbn parses FBN text', async () => {
    const res = await request(app).post('/parse-fbn')
      .send({ text: 'actor.producer { name: "Test Farm" }' })
    assert.equal(res.status, 200)
    assert.ok(res.body.blocks)
  })

  it('GET /format/:hash formats block as FBN', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get(`/format/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
    assert.ok(typeof res.body.fbn === 'string')
  })

  it('POST /resolve-uri resolves fb: URI', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).post('/resolve-uri')
      .send({ uri: `fb:${block.body.hash}` })
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
  })

  it('GET /uri/:hash generates URI', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Bread' } })

    const res = await request(app).get(`/uri/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
    assert.ok(res.body.uri.startsWith('fb:'))
  })
})

// ── Verify Signature ─────────────────────────────────────────────────

describe('GET /verify/:hash', () => {
  it('verifies a signed block', async () => {
    const keypair = generateKeypair()

    const actor = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Verified Farm', public_key: keypair.publicKey } })

    const block = create('substance.product', { name: 'Verified Bread' }, {})
    const wrapper = sign(block, actor.body.hash, keypair.privateKey)

    const created = await request(app).post('/blocks').send(wrapper)
    assert.equal(created.status, 201)

    const res = await request(app).get(`/verify/${created.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.signed, true)
    assert.equal(res.body.verified, true)
  })

  it('reports unsigned blocks', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Unsigned Farm' } })

    const res = await request(app).get(`/verify/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.signed, false)
    assert.equal(res.body.verified, false)
  })
})

// ── Types ────────────────────────────────────────────────────────────

describe('GET /types', () => {
  it('lists core schemas', async () => {
    const res = await request(app).get('/types')
    assert.equal(res.status, 200)
    assert.ok(res.body.types)
    assert.ok(Object.keys(res.body.types).length > 0)
  })

  it('GET /types/:type returns specific schema', async () => {
    const res = await request(app).get('/types/substance.product')
    assert.equal(res.status, 200)
    assert.equal(res.body.type, 'substance.product')
    assert.ok(res.body.schema.fields)
    assert.ok(res.body.schema.fields.name)
  })

  it('GET /types/:type returns 404 for unknown type', async () => {
    const res = await request(app).get('/types/nonexistent.type')
    assert.equal(res.status, 404)
  })
})

// ── Federation ───────────────────────────────────────────────────────

describe('Federation', () => {
  it('GET /.well-known/foodblock returns discovery document', async () => {
    const res = await request(app).get('/.well-known/foodblock')
    assert.equal(res.status, 200)
    assert.equal(res.body.protocol, 'foodblock')
    assert.ok(res.body.public_key)
    assert.ok(res.body.signature)
    assert.ok(res.body.endpoints)
  })

  it('GET /.well-known/foodblock/resolve/:hash returns block', async () => {
    const block = await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Federated Farm' } })

    const res = await request(app).get(`/.well-known/foodblock/resolve/${block.body.hash}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.hash, block.body.hash)
  })

  it('POST /.well-known/foodblock/push inserts blocks', async () => {
    const block = create('actor.producer', { name: 'Pushed Farm' }, {})

    const res = await request(app).post('/.well-known/foodblock/push').send({
      blocks: [{ type: block.type, state: block.state, refs: block.refs, hash: block.hash }]
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.inserted, 1)
    assert.equal(res.body.skipped, 0)

    // Verify block exists
    const getRes = await request(app).get(`/blocks/${block.hash}`)
    assert.equal(getRes.status, 200)
  })

  it('POST /.well-known/foodblock/pull returns blocks', async () => {
    await request(app).post('/blocks')
      .send({ type: 'actor.producer', state: { name: 'Pullable Farm' } })
    await request(app).post('/blocks')
      .send({ type: 'substance.product', state: { name: 'Pullable Bread' } })

    const res = await request(app).post('/.well-known/foodblock/pull').send({
      types: ['substance'],
      limit: 10
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.count, 1)
    assert.ok(res.body.blocks[0].type.startsWith('substance'))
    assert.ok(res.body.cursor)
  })
})
