const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { create, forward, recall, downstream, quantity, transition, nextStatuses, localize } = require('../src/index')
const { fb } = require('../src/fb')

// ── fb() tests ──────────────────────────────────────────────
describe('fb()', () => {
  it('returns the expected shape: blocks, primary, type, state, text', () => {
    const result = fb('Sourdough bread')
    assert.ok(Array.isArray(result.blocks), 'blocks should be an array')
    assert.ok(result.primary, 'primary should exist')
    assert.equal(typeof result.type, 'string', 'type should be a string')
    assert.ok(result.state && typeof result.state === 'object', 'state should be an object')
    assert.equal(typeof result.text, 'string', 'text should be a string')
  })

  it('parses a product with price and organic flag', () => {
    const result = fb('Sourdough bread, $4.50, organic')
    assert.equal(result.type, 'substance.product')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 4.5)
    assert.equal(result.state.price.unit, 'USD')
    assert.equal(result.state.organic, true)
  })

  it('parses a review with rating', () => {
    const result = fb('5 stars amazing pizza at Luigi\'s')
    assert.equal(result.type, 'observe.review')
    assert.equal(result.state.rating, 5)
    assert.equal(result.state.name, "Luigi's")
  })

  it('parses a producer with crop, acreage, and region', () => {
    const result = fb('Green Acres Farm, 200 acres, organic wheat in Oregon')
    assert.equal(result.type, 'actor.producer')
    assert.equal(result.state.acreage, 200)
    assert.equal(result.state.organic, true)
    assert.equal(result.state.region, 'Oregon')
  })

  it('parses a reading with temperature quantity', () => {
    const result = fb('Walk-in cooler temperature 4 celsius')
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    assert.equal(result.state.temperature.value, 4)
    assert.equal(result.state.temperature.unit, 'celsius')
  })

  it('parses an order with weight quantity', () => {
    const result = fb('Ordered 50kg flour from Stone Mill')
    assert.equal(result.type, 'transfer.order')
    assert.ok(result.state.weight, 'should extract weight')
    assert.equal(result.state.weight.value, 50)
    assert.equal(result.state.weight.unit, 'kg')
  })

  it('parses a venue', () => {
    const result = fb("Joe's Bakery on Main Street")
    assert.equal(result.type, 'actor.venue')
    assert.ok(result.state.name, 'should extract a name')
  })

  it('parses a certification', () => {
    const result = fb('Passed USDA organic inspection')
    assert.equal(result.type, 'observe.certification')
  })

  it('throws on empty input', () => {
    assert.throws(() => fb(''), /needs text/)
    assert.throws(() => fb(null), /needs text/)
  })

  it('primary block has a valid 64-char hash', () => {
    const result = fb('Artisan sourdough loaf, $6.00')
    assert.equal(typeof result.primary.hash, 'string')
    assert.equal(result.primary.hash.length, 64)
  })
})

// ── forward() tests ─────────────────────────────────────────
describe('forward()', () => {
  // Helper: build a resolveForward function backed by a Map
  function makeResolver(store) {
    return async (h) => [...store.values()].filter(b => {
      if (!b.refs) return false
      return Object.values(b.refs).some(r => {
        const hashes = Array.isArray(r) ? r : [r]
        return hashes.includes(h)
      })
    })
  }

  it('finds direct forward references (A -> B)', async () => {
    const a = create('substance.ingredient', { name: 'Flour' })
    const b = create('substance.product', { name: 'Bread' }, { inputs: [a.hash] })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)

    const result = await forward(a.hash, makeResolver(store))
    assert.equal(result.count, 1)
    assert.equal(result.referencing[0].block.hash, b.hash)
    assert.equal(result.referencing[0].role, 'inputs')
  })

  it('returns count 0 when nothing references the hash', async () => {
    const a = create('substance.ingredient', { name: 'Flour' })

    const store = new Map()
    store.set(a.hash, a)

    const result = await forward(a.hash, makeResolver(store))
    assert.equal(result.count, 0)
    assert.deepEqual(result.referencing, [])
  })

  it('finds multiple forward references from one hash', async () => {
    const a = create('substance.ingredient', { name: 'Flour' })
    const b = create('substance.product', { name: 'Bread' }, { inputs: [a.hash] })
    const c = create('substance.product', { name: 'Pasta' }, { inputs: [a.hash] })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)
    store.set(c.hash, c)

    const result = await forward(a.hash, makeResolver(store))
    assert.equal(result.count, 2)
    const hashes = result.referencing.map(r => r.block.hash)
    assert.ok(hashes.includes(b.hash))
    assert.ok(hashes.includes(c.hash))
  })

  it('throws on invalid hash', async () => {
    await assert.rejects(
      () => forward('', async () => []),
      /hash is required/
    )
  })
})

// ── recall() tests ──────────────────────────────────────────
describe('recall()', () => {
  function makeResolver(store) {
    return async (h) => [...store.values()].filter(b => {
      if (!b.refs) return false
      return Object.values(b.refs).some(r => {
        const hashes = Array.isArray(r) ? r : [r]
        return hashes.includes(h)
      })
    })
  }

  it('traces full depth through a chain A -> B -> C', async () => {
    const a = create('substance.ingredient', { name: 'Contaminated Wheat' })
    const b = create('substance.product', { name: 'Flour' }, { source: a.hash })
    const c = create('substance.product', { name: 'Bread' }, { inputs: [b.hash] })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)
    store.set(c.hash, c)

    const result = await recall(a.hash, makeResolver(store))
    assert.equal(result.affected.length, 2)
    const affectedHashes = result.affected.map(b => b.hash)
    assert.ok(affectedHashes.includes(b.hash))
    assert.ok(affectedHashes.includes(c.hash))
    assert.ok(result.depth >= 2)
  })

  it('returns empty affected list when no downstream blocks exist', async () => {
    const a = create('substance.ingredient', { name: 'Safe Flour' })

    const store = new Map()
    store.set(a.hash, a)

    const result = await recall(a.hash, makeResolver(store))
    assert.equal(result.affected.length, 0)
    assert.equal(result.depth, 0)
  })

  it('handles branching graphs (A -> B, A -> C, B -> D)', async () => {
    const a = create('substance.ingredient', { name: 'Wheat' })
    const b = create('substance.product', { name: 'Flour' }, { source: a.hash })
    const c = create('substance.product', { name: 'Cereal' }, { source: a.hash })
    const d = create('substance.product', { name: 'Bread' }, { inputs: [b.hash] })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)
    store.set(c.hash, c)
    store.set(d.hash, d)

    const result = await recall(a.hash, makeResolver(store))
    assert.equal(result.affected.length, 3)
    const affectedHashes = result.affected.map(b => b.hash)
    assert.ok(affectedHashes.includes(b.hash))
    assert.ok(affectedHashes.includes(c.hash))
    assert.ok(affectedHashes.includes(d.hash))
  })
})

// ── downstream() tests ──────────────────────────────────────
describe('downstream()', () => {
  function makeResolver(store) {
    return async (h) => [...store.values()].filter(b => {
      if (!b.refs) return false
      return Object.values(b.refs).some(r => {
        const hashes = Array.isArray(r) ? r : [r]
        return hashes.includes(h)
      })
    })
  }

  it('filters to substance.* types only', async () => {
    const a = create('substance.ingredient', { name: 'Wheat' })
    const b = create('transform.process', { name: 'Milling' }, { input: a.hash })
    const c = create('substance.product', { name: 'Flour' }, { source: a.hash })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)
    store.set(c.hash, c)

    const result = await downstream(a.hash, makeResolver(store))
    // downstream filters to substance.* — should include c but not b
    assert.equal(result.length, 1)
    assert.equal(result[0].hash, c.hash)
  })

  it('returns empty array when no substance blocks downstream', async () => {
    const a = create('substance.ingredient', { name: 'Wheat' })
    const b = create('transform.process', { name: 'Milling' }, { input: a.hash })

    const store = new Map()
    store.set(a.hash, a)
    store.set(b.hash, b)

    const result = await downstream(a.hash, makeResolver(store))
    assert.equal(result.length, 0)
  })
})

// ── quantity() tests ────────────────────────────────────────
describe('quantity()', () => {
  it('creates a quantity with value and unit', () => {
    const q = quantity(1.5, 'kg')
    assert.deepEqual(q, { value: 1.5, unit: 'kg' })
  })

  it('validates unit against type and succeeds for valid units', () => {
    const q = quantity(1.5, 'kg', 'weight')
    assert.deepEqual(q, { value: 1.5, unit: 'kg' })
  })

  it('throws for invalid unit when type is specified', () => {
    assert.throws(
      () => quantity(1.5, 'stones', 'weight'),
      /invalid unit 'stones' for weight/
    )
  })

  it('throws when value is not a number', () => {
    assert.throws(
      () => quantity('abc', 'kg'),
      /must be a number/
    )
  })

  it('throws when unit is missing', () => {
    assert.throws(
      () => quantity(5, ''),
      /unit is required/
    )
  })

  it('accepts various valid measurement types', () => {
    assert.deepEqual(quantity(100, 'celsius', 'temperature'), { value: 100, unit: 'celsius' })
    assert.deepEqual(quantity(500, 'ml', 'volume'), { value: 500, unit: 'ml' })
    assert.deepEqual(quantity(9.99, 'USD', 'currency'), { value: 9.99, unit: 'USD' })
  })
})

// ── transition() tests ──────────────────────────────────────
describe('transition()', () => {
  it('returns true for valid transitions', () => {
    assert.equal(transition('draft', 'order'), true)
    assert.equal(transition('draft', 'quote'), true)
    assert.equal(transition('order', 'confirmed'), true)
    assert.equal(transition('shipped', 'delivered'), true)
  })

  it('returns false for invalid transitions', () => {
    assert.equal(transition('draft', 'shipped'), false)
    assert.equal(transition('draft', 'delivered'), false)
    assert.equal(transition('paid', 'draft'), false)
  })

  it('returns false for unknown status', () => {
    assert.equal(transition('nonexistent', 'order'), false)
  })
})

// ── nextStatuses() tests ────────────────────────────────────
describe('nextStatuses()', () => {
  it('returns valid next statuses for confirmed', () => {
    const next = nextStatuses('confirmed')
    assert.deepEqual(next, ['processing', 'cancelled'])
  })

  it('returns empty array for terminal states', () => {
    assert.deepEqual(nextStatuses('paid'), [])
    assert.deepEqual(nextStatuses('cancelled'), [])
  })

  it('returns empty array for unknown status', () => {
    assert.deepEqual(nextStatuses('nonexistent'), [])
  })

  it('returns correct options for draft', () => {
    const next = nextStatuses('draft')
    assert.deepEqual(next, ['quote', 'order', 'cancelled'])
  })
})

// ── localize() tests ────────────────────────────────────────
describe('localize()', () => {
  it('extracts the requested locale from locale objects', () => {
    const block = create('substance.product', {
      name: { en: 'Bread', fr: 'Pain' },
      price: 4.5
    })

    const localized = localize(block, 'fr')
    assert.equal(localized.state.name, 'Pain')
    assert.equal(localized.state.price, 4.5)
  })

  it('falls back to en when requested locale is missing', () => {
    const block = create('substance.product', {
      name: { en: 'Bread', fr: 'Pain' },
      price: 4.5
    })

    const localized = localize(block, 'de')
    assert.equal(localized.state.name, 'Bread')
  })

  it('preserves non-locale objects in state as-is', () => {
    const block = create('substance.product', {
      name: { en: 'Bread', fr: 'Pain' },
      allergens: { gluten: true, dairy: false },
      price: 4.5
    })

    const localized = localize(block, 'fr')
    assert.equal(localized.state.name, 'Pain')
    // allergens keys are not 2-letter locale codes, so should be preserved as-is
    assert.deepEqual(localized.state.allergens, { gluten: true, dairy: false })
    assert.equal(localized.state.price, 4.5)
  })

  it('returns block as-is when block has no state', () => {
    const result = localize(null, 'en')
    assert.equal(result, null)
  })

  it('handles block with empty state', () => {
    const block = create('substance.product', {})
    const localized = localize(block, 'fr')
    assert.deepEqual(localized.state, {})
  })
})
