import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app, { pool } from '../index.js'

// Clean the table before each test
beforeEach(async () => {
  await pool.query('DELETE FROM foodblocks')
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
    assert.equal(res.body.version, '0.1.0')
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
