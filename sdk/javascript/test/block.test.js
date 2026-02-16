const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { create, update, hash, canonical, generateKeypair, sign, verify, chain, createAgent, createDraft, approveDraft, loadAgent } = require('../src/index')

describe('canonical', () => {
  it('sorts keys lexicographically', () => {
    const result = canonical('test', { b: 2, a: 1 }, {})
    assert.ok(result.indexOf('"a"') < result.indexOf('"b"'))
  })

  it('sorts refs arrays lexicographically', () => {
    const result = canonical('test', {}, { inputs: ['zzz', 'aaa', 'mmm'] })
    assert.ok(result.indexOf('"aaa"') < result.indexOf('"mmm"'))
    assert.ok(result.indexOf('"mmm"') < result.indexOf('"zzz"'))
  })

  it('preserves state array order', () => {
    const result = canonical('test', { items: ['zzz', 'aaa'] }, {})
    assert.ok(result.indexOf('"zzz"') < result.indexOf('"aaa"'))
  })

  it('omits null values', () => {
    const result = canonical('test', { a: 1, b: null }, {})
    assert.ok(!result.includes('"b"'))
  })

  it('handles nested objects with sorted keys', () => {
    const result = canonical('test', { outer: { z: 1, a: 2 } }, {})
    assert.ok(result.indexOf('"a"') < result.indexOf('"z"'))
  })

  it('formats numbers without trailing zeros', () => {
    const result = canonical('test', { price: 4.5 }, {})
    assert.ok(result.includes('4.5'))
    assert.ok(!result.includes('4.50'))
  })

  it('handles -0 as 0', () => {
    const result = canonical('test', { val: -0 }, {})
    assert.ok(result.includes(':0'))
  })

  it('produces no whitespace', () => {
    const result = canonical('test', { a: 1, b: 'hello' }, { c: 'ref' })
    assert.ok(!result.includes(' '))
    assert.ok(!result.includes('\n'))
  })
})

describe('cross-language vectors', () => {
  const vectorsPath = join(__dirname, '..', '..', '..', 'test', 'vectors.json')
  const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'))

  for (const vector of vectors) {
    it(`vector: ${vector.name}`, () => {
      const c = canonical(vector.type, vector.state, vector.refs)
      assert.equal(c, vector.expected_canonical, `canonical mismatch for "${vector.name}"`)

      const block = create(vector.type, vector.state, vector.refs)
      assert.equal(block.hash, vector.expected_hash, `hash mismatch for "${vector.name}"`)
    })
  }
})

describe('create', () => {
  it('creates a genesis block with empty refs', () => {
    const block = create('actor.producer', { name: 'Test Farm' })
    assert.equal(block.type, 'actor.producer')
    assert.deepEqual(block.state, { name: 'Test Farm' })
    assert.deepEqual(block.refs, {})
    assert.equal(typeof block.hash, 'string')
    assert.equal(block.hash.length, 64)
  })

  it('produces deterministic hashes', () => {
    const a = create('substance.product', { name: 'Bread', price: 4.5 }, { seller: 'abc' })
    const b = create('substance.product', { name: 'Bread', price: 4.5 }, { seller: 'abc' })
    assert.equal(a.hash, b.hash)
  })

  it('produces different hashes for different content', () => {
    const a = create('substance.product', { name: 'Bread' }, {})
    const b = create('substance.product', { name: 'Cake' }, {})
    assert.notEqual(a.hash, b.hash)
  })

  it('produces same hash regardless of key order', () => {
    const a = create('test', { a: 1, b: 2 }, {})
    const b = create('test', { b: 2, a: 1 }, {})
    assert.equal(a.hash, b.hash)
  })

  it('produces same hash regardless of refs array order', () => {
    const a = create('transform.process', {}, { inputs: ['abc', 'def'] })
    const b = create('transform.process', {}, { inputs: ['def', 'abc'] })
    assert.equal(a.hash, b.hash)
  })

  it('produces different hash for different state array order', () => {
    const a = create('observe.post', { content_order: ['abc', 'def'] }, {})
    const b = create('observe.post', { content_order: ['def', 'abc'] }, {})
    assert.notEqual(a.hash, b.hash)
  })

  it('strips null values from state', () => {
    const block = create('test', { a: 1, b: null })
    assert.deepEqual(block.state, { a: 1 })
  })

  it('throws on missing type', () => {
    assert.throws(() => create(''), /type is required/)
    assert.throws(() => create(null), /type is required/)
  })

  it('throws on invalid state', () => {
    assert.throws(() => create('test', 'not an object'), /state must be an object/)
    assert.throws(() => create('test', [1, 2, 3]), /state must be an object/)
  })
})

describe('base types', () => {
  it('creates all 6 base types', () => {
    const types = [
      { type: 'actor.producer', state: { name: 'Green Farm' } },
      { type: 'place.farm', state: { name: 'North Field', lat: 51.5, lng: -0.1 } },
      { type: 'substance.product', state: { name: 'Sourdough', price: 4.5 } },
      { type: 'transform.process', state: { name: 'Baking', temp: 220 } },
      { type: 'transfer.order', state: { quantity: 2, total: 9.0 } },
      { type: 'observe.review', state: { rating: 5, text: 'Excellent' } }
    ]

    for (const { type, state } of types) {
      const block = create(type, state)
      assert.equal(block.type, type)
      assert.equal(typeof block.hash, 'string')
      assert.equal(block.hash.length, 64)
    }
  })
})

describe('update', () => {
  it('creates a block with updates ref', () => {
    const original = create('substance.product', { name: 'Bread', price: 4.5 }, { seller: 'abc' })
    const updated = update(original.hash, 'substance.product', { name: 'Bread', price: 5.0 }, { seller: 'abc' })

    assert.equal(updated.refs.updates, original.hash)
    assert.equal(updated.state.price, 5.0)
    assert.notEqual(updated.hash, original.hash)
  })

  it('throws on missing previous hash', () => {
    assert.throws(() => update('', 'test'), /previousHash is required/)
  })
})

describe('multi-ref', () => {
  it('handles array refs (Option A)', () => {
    const block = create('transform.process', { name: 'Baking' }, {
      inputs: ['flour_hash', 'water_hash', 'yeast_hash'],
      output: 'bread_hash',
      facility: 'bakery_hash'
    })

    assert.ok(Array.isArray(block.refs.inputs))
    assert.equal(block.refs.inputs.length, 3)
    assert.equal(typeof block.refs.output, 'string')
  })
})

describe('sign and verify', () => {
  it('signs and verifies a block', () => {
    const keys = generateKeypair()
    const block = create('substance.product', { name: 'Test' })
    const actor = create('actor.foodie', { name: 'Test User' })

    const wrapper = sign(block, actor.hash, keys.privateKey)
    assert.equal(wrapper.author_hash, actor.hash)
    assert.equal(typeof wrapper.signature, 'string')

    const valid = verify(wrapper, keys.publicKey)
    assert.ok(valid)
  })

  it('rejects tampered blocks', () => {
    const keys = generateKeypair()
    const block = create('substance.product', { name: 'Test' })
    const actor = create('actor.foodie', { name: 'Test User' })

    const wrapper = sign(block, actor.hash, keys.privateKey)

    // Tamper with the block
    wrapper.foodblock = create('substance.product', { name: 'Tampered' })

    const valid = verify(wrapper, keys.publicKey)
    assert.ok(!valid)
  })

  it('rejects wrong key', () => {
    const keys1 = generateKeypair()
    const keys2 = generateKeypair()
    const block = create('substance.product', { name: 'Test' })
    const actor = create('actor.foodie', { name: 'Test User' })

    const wrapper = sign(block, actor.hash, keys1.privateKey)
    const valid = verify(wrapper, keys2.publicKey)
    assert.ok(!valid)
  })
})

describe('chain', () => {
  it('traverses update chain', async () => {
    const v1 = create('substance.product', { name: 'Bread', price: 4.0 })
    const v2 = update(v1.hash, 'substance.product', { name: 'Bread', price: 4.5 })
    const v3 = update(v2.hash, 'substance.product', { name: 'Bread', price: 5.0 })

    const store = { [v1.hash]: v1, [v2.hash]: v2, [v3.hash]: v3 }
    const resolve = async (h) => store[h] || null

    const result = await chain(v3.hash, resolve)
    assert.equal(result.length, 3)
    assert.equal(result[0].hash, v3.hash)
    assert.equal(result[1].hash, v2.hash)
    assert.equal(result[2].hash, v1.hash)
  })

  it('handles single block (genesis)', async () => {
    const block = create('actor.producer', { name: 'Farm' })
    const resolve = async (h) => h === block.hash ? block : null

    const result = await chain(block.hash, resolve)
    assert.equal(result.length, 1)
    assert.equal(result[0].hash, block.hash)
  })

  it('respects max depth', async () => {
    const blocks = []
    let prev = create('test', { v: 0 })
    blocks.push(prev)

    for (let i = 1; i <= 10; i++) {
      prev = update(prev.hash, 'test', { v: i })
      blocks.push(prev)
    }

    const store = Object.fromEntries(blocks.map(b => [b.hash, b]))
    const resolve = async (h) => store[h] || null

    const result = await chain(prev.hash, resolve, { maxDepth: 5 })
    assert.equal(result.length, 5)
  })
})

describe('visibility', () => {
  it('visibility in state affects hash', () => {
    const a = create('observe.post', { text: 'Hello', visibility: 'direct' })
    const b = create('observe.post', { text: 'Hello', visibility: 'public' })
    assert.notEqual(a.hash, b.hash)
  })
})

describe('real-world scenarios', () => {
  it('models a full provenance chain (farm to table)', () => {
    const farm = create('actor.producer', { name: 'Green Acres Farm' })
    const field = create('place.farm', { name: 'North Field' }, { owner: farm.hash })
    const wheat = create('substance.ingredient', { name: 'Organic Wheat' }, { source: field.hash })
    const harvest = create('transform.harvest', { date: '2026-09-15' }, { input: wheat.hash, place: field.hash })
    const mill = create('actor.maker', { name: 'Stone Mill Co' })
    const flour = create('substance.product', { name: 'Stoneground Flour' }, { source: harvest.hash, maker: mill.hash })
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const bread = create('substance.product', { name: 'Sourdough', price: 4.5 }, {
      inputs: [flour.hash],
      seller: bakery.hash
    })
    const review = create('observe.review', { rating: 5, text: 'Best bread in town' }, {
      subject: bread.hash, author: farm.hash
    })

    // All blocks have valid hashes
    const allBlocks = [farm, field, wheat, harvest, mill, flour, bakery, bread, review]
    for (const block of allBlocks) {
      assert.equal(block.hash.length, 64)
    }

    // Bread refs flour
    assert.ok(bread.refs.inputs.includes(flour.hash))

    // Review refs bread
    assert.equal(review.refs.subject, bread.hash)
  })

  it('models IoT fridge camera', () => {
    const device = create('actor.device', { name: 'FridgeCam Pro', model: 'FC-1' })
    const user = create('actor.foodie', { name: 'Test User' })
    const fridge = create('place.appliance', { kind: 'fridge' }, { owner: user.hash, device: device.hash })

    const scan = create('observe.scan', {
      visibility: 'direct',
      detected: [
        { item: 'Eggs', gtin: '5000128000123', quantity: 6, best_before: '2026-02-22' },
        { item: 'Milk', gtin: '5000128000456', quantity: 1, best_before: '2026-02-17' }
      ]
    }, {
      author: device.hash,
      place: fridge.hash,
      owner: user.hash
    })

    assert.equal(scan.type, 'observe.scan')
    assert.equal(scan.refs.author, device.hash)
    assert.equal(scan.state.detected.length, 2)
  })

  it('models enterprise delegation', () => {
    const company = create('actor.group', { name: 'M&S Food', members: ['emp1_hash', 'emp2_hash'] })
    const employee = create('actor.professional', { name: 'Jane Smith', role: 'Product Manager' })

    const product = create('substance.product', { name: 'M&S Sourdough', price: 2.5 }, {
      author: employee.hash,
      org: company.hash
    })

    assert.equal(product.refs.author, employee.hash)
    assert.equal(product.refs.org, company.hash)
  })
})

describe('agent', () => {
  it('creates an agent with keypair and identity', () => {
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const agent = createAgent('Bakery Assistant', bakery.hash, {
      model: 'claude-sonnet',
      capabilities: ['inventory', 'ordering']
    })

    assert.equal(agent.block.type, 'actor.agent')
    assert.equal(agent.block.state.name, 'Bakery Assistant')
    assert.equal(agent.block.state.model, 'claude-sonnet')
    assert.deepEqual(agent.block.state.capabilities, ['inventory', 'ordering'])
    assert.equal(agent.block.refs.operator, bakery.hash)
    assert.equal(agent.authorHash, agent.block.hash)
    assert.equal(typeof agent.keypair.publicKey, 'string')
    assert.equal(typeof agent.keypair.privateKey, 'string')
    assert.equal(typeof agent.sign, 'function')
  })

  it('agent can sign blocks', () => {
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const agent = createAgent('Bakery Assistant', bakery.hash)

    const product = create('substance.product', { name: 'Sourdough', price: 5.0 }, { seller: bakery.hash })
    const signed = agent.sign(product)

    assert.equal(signed.author_hash, agent.authorHash)
    assert.equal(signed.foodblock.hash, product.hash)
    assert.equal(typeof signed.signature, 'string')

    // Verify signature
    const valid = verify(signed, agent.keypair.publicKey)
    assert.ok(valid)
  })

  it('creates draft blocks with agent ref', () => {
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const mill = create('actor.maker', { name: 'Stone Mill Co' })
    const flour = create('substance.product', { name: 'Flour', price: 3.20 }, { seller: mill.hash })
    const agent = createAgent('Bakery Assistant', bakery.hash)

    const { block, signed } = createDraft(agent, 'transfer.order', {
      quantity: 50,
      unit: 'kg',
      total: 160.00
    }, {
      buyer: bakery.hash,
      seller: mill.hash,
      product: flour.hash
    })

    // Draft has draft: true in state
    assert.equal(block.state.draft, true)
    // Draft has agent ref
    assert.equal(block.refs.agent, agent.authorHash)
    // Draft is signed by the agent
    assert.equal(signed.author_hash, agent.authorHash)
    // Signature is valid
    assert.ok(verify(signed, agent.keypair.publicKey))
  })

  it('approves draft blocks', () => {
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const agent = createAgent('Bakery Assistant', bakery.hash)

    const { block: draft } = createDraft(agent, 'transfer.order', {
      quantity: 50,
      total: 160.00
    }, {
      buyer: bakery.hash,
      seller: 'mill_hash'
    })

    const approved = approveDraft(draft)

    // Approved block has no draft flag
    assert.equal(approved.state.draft, undefined)
    // Approved block references the draft via updates
    assert.equal(approved.refs.updates, draft.hash)
    // Approved block records which agent created it
    assert.equal(approved.refs.approved_agent, agent.authorHash)
    // Different hash from draft
    assert.notEqual(approved.hash, draft.hash)
  })

  it('loads an existing agent from saved credentials', () => {
    const bakery = create('actor.venue', { name: 'Joes Bakery' })
    const original = createAgent('Bakery Assistant', bakery.hash)

    // Save credentials (in real life, to disk)
    const savedHash = original.authorHash
    const savedKeypair = original.keypair

    // Reload
    const loaded = loadAgent(savedHash, savedKeypair)

    assert.equal(loaded.authorHash, savedHash)
    assert.equal(typeof loaded.sign, 'function')

    // Loaded agent can sign and verify
    const block = create('observe.inventory', { flour_kg: 12 }, { place: 'shop_hash' })
    const signed = loaded.sign(block)
    assert.ok(verify(signed, savedKeypair.publicKey))
  })

  it('requires operator hash', () => {
    assert.throws(() => createAgent('Test', ''), /operatorHash is required/)
    assert.throws(() => createAgent('Test', null), /operatorHash is required/)
  })

  it('requires name', () => {
    assert.throws(() => createAgent('', 'some_hash'), /name is required/)
    assert.throws(() => createAgent(null, 'some_hash'), /name is required/)
  })
})
