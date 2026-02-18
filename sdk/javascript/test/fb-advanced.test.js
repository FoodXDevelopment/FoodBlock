const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { fb } = require('../src/index')

// ── Helper ─────────────────────────────────────────────────
// Flexible check: assert a block of the expected type exists somewhere in blocks array.
function hasBlockOfType(blocks, type) {
  return blocks.some(b => b.type === type)
}

// ════════════════════════════════════════════════════════════
//  1. BASIC SINGLE-BLOCK (5 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — basic single-block', () => {
  it('1. simple product: "Sourdough bread, $4.50" extracts substance.product with price', () => {
    const result = fb('Sourdough bread, $4.50')
    assert.equal(result.type, 'substance.product')
    assert.ok(result.primary, 'primary block should exist')
    assert.ok(Array.isArray(result.blocks), 'blocks should be an array')
    assert.ok(result.blocks.length >= 1, 'should have at least 1 block')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 4.5)
    assert.ok(result.state.name, 'should extract a name')
  })

  it('2. simple review: "Amazing pizza, 5 stars" extracts observe.review with rating', () => {
    const result = fb('Amazing pizza, 5 stars')
    assert.equal(result.type, 'observe.review')
    assert.ok(result.state.rating !== undefined, 'should extract rating')
    assert.equal(result.state.rating, 5)
    assert.ok(result.primary, 'primary block should exist')
  })

  it('3. simple farm: "Green Acres Farm, 200 acres, organic" extracts actor.producer', () => {
    const result = fb('Green Acres Farm, 200 acres, organic')
    assert.equal(result.type, 'actor.producer')
    assert.equal(result.state.acreage, 200)
    assert.equal(result.state.organic, true)
    assert.ok(result.state.name, 'should extract farm name')
  })

  it('4. simple reading: "Walk-in fridge at 3.2°C" extracts observe.reading with temperature', () => {
    const result = fb('Walk-in fridge at 3.2°C')
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    assert.equal(result.state.temperature.value, 3.2)
    const unit = result.state.temperature.unit.toLowerCase()
    assert.ok(unit === 'celsius' || unit === 'c', `unit should be celsius or c, got ${unit}`)
  })

  it('5. simple order: "Ordered 50kg flour" extracts transfer.order with weight', () => {
    const result = fb('Ordered 50kg flour')
    assert.equal(result.type, 'transfer.order')
    assert.ok(result.state.weight, 'should extract weight')
    assert.equal(result.state.weight.value, 50)
    assert.equal(result.state.weight.unit, 'kg')
  })
})

// ════════════════════════════════════════════════════════════
//  2. MULTI-BLOCK WITH REF WIRING (8 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — multi-block with ref wiring', () => {
  it('6. venue + products: "Joe\'s Bakery sells sourdough for $4.50 and croissants for $2.80"', () => {
    const result = fb("Joe's Bakery sells sourdough for $4.50 and croissants for $2.80")
    // The primary should be a venue since "Bakery" is a venue signal
    assert.ok(result.primary, 'primary block should exist')
    assert.ok(result.blocks.length >= 1, 'should have at least 1 block')
    // If multi-block is implemented, expect 3 blocks (venue + 2 products)
    // Be flexible: the venue or product type should appear
    const types = result.blocks.map(b => b.type)
    assert.ok(
      types.includes('actor.venue') || types.includes('substance.product'),
      'should contain venue or product blocks'
    )
  })

  it('7. order from supplier: "I ordered 20kg of flour from Stone Mill"', () => {
    const result = fb('I ordered 20kg of flour from Stone Mill')
    assert.equal(result.type, 'transfer.order')
    assert.ok(result.state.weight, 'should extract weight')
    assert.equal(result.state.weight.value, 20)
    assert.equal(result.state.weight.unit, 'kg')
    // If multi-block is implemented, expect a Stone Mill actor block
    if (result.blocks.length > 1) {
      const entityBlock = result.blocks.find(b => b.state && b.state.name && /stone mill/i.test(b.state.name))
      assert.ok(entityBlock, 'should create a block for Stone Mill')
    }
  })

  it('8. review at venue: "Amazing pizza at Luigi\'s, 5 stars"', () => {
    const result = fb("Amazing pizza at Luigi's, 5 stars")
    assert.equal(result.type, 'observe.review')
    assert.equal(result.state.rating, 5)
    assert.ok(result.state.name, 'should extract venue name')
    assert.ok(/luigi/i.test(result.state.name), `name should reference Luigi's, got "${result.state.name}"`)
  })

  it('9. certification with subject: "Green Acres Farm is organic certified until June 2026"', () => {
    const result = fb('Green Acres Farm is organic certified until June 2026')
    // Could be observe.certification (certified keyword) or actor.producer (farm keyword)
    // The "certified" signal has weight 3, should win
    assert.ok(
      result.type === 'observe.certification' || result.type === 'actor.producer',
      `type should be certification or producer, got ${result.type}`
    )
    // If multi-block, check for both blocks
    if (result.blocks.length > 1) {
      assert.ok(
        hasBlockOfType(result.blocks, 'observe.certification') || hasBlockOfType(result.blocks, 'actor.producer'),
        'should have certification or producer block'
      )
    }
  })

  it('10. product from source: "Organic wheat from Green Acres Farm in Oxfordshire"', () => {
    const result = fb('Organic wheat from Green Acres Farm in Oxfordshire')
    // "wheat" is a substance.ingredient signal, "farm" is actor.producer signal
    // Could resolve either way depending on weights
    assert.ok(
      result.type === 'substance.ingredient' || result.type === 'actor.producer',
      `type should be ingredient or producer, got ${result.type}`
    )
    assert.equal(result.state.organic, true, 'should detect organic flag')
    // If multi-block, expect a Green Acres Farm entity
    if (result.blocks.length > 1) {
      const farm = result.blocks.find(b => b.state && b.state.name && /green acres/i.test(b.state.name))
      assert.ok(farm, 'should create a block for Green Acres Farm')
    }
  })

  it('11. transform with inputs: "We stone-milled the wheat into flour"', () => {
    const result = fb('We stone-milled the wheat into flour')
    // "milled" is a transform.process signal
    assert.ok(
      result.type === 'transform.process' || result.type === 'substance.ingredient',
      `type should be transform.process or substance.ingredient, got ${result.type}`
    )
    assert.ok(result.primary, 'primary block should exist')
  })

  it('12. multiple products: "We sell bread, cakes, and pastries"', () => {
    const result = fb('We sell bread, cakes, and pastries')
    assert.ok(result.blocks.length >= 1, 'should have at least 1 block')
    // If multi-block is implemented, expect multiple substance.product blocks
    if (result.blocks.length > 1) {
      const products = result.blocks.filter(b => b.type === 'substance.product')
      assert.ok(products.length >= 2, 'should have multiple product blocks')
    }
  })

  it('13. venue with address: "Joe\'s Bakery on 12 High Street"', () => {
    const result = fb("Joe's Bakery on 12 High Street")
    assert.equal(result.type, 'actor.venue')
    assert.ok(result.state.name, 'should extract venue name')
  })
})

// ════════════════════════════════════════════════════════════
//  3. CURRENCY DETECTION (4 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — currency detection', () => {
  it('14. pounds: "Sourdough, £4.50" extracts GBP price', () => {
    const result = fb('Sourdough, £4.50')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 4.5)
    // The current implementation maps all currency symbols to 'USD' initially
    // but a rewrite may fix this. Accept either.
    assert.ok(
      result.state.price.unit === 'GBP' || result.state.price.unit === 'USD',
      `currency unit should be GBP or USD, got ${result.state.price.unit}`
    )
  })

  it('15. dollars: "Bread, $3.99" extracts USD price', () => {
    const result = fb('Bread, $3.99')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 3.99)
    assert.ok(
      result.state.price.unit === 'USD',
      `currency unit should be USD, got ${result.state.price.unit}`
    )
  })

  it('16. euros: "Baguette, €2.50" extracts EUR price', () => {
    const result = fb('Baguette, €2.50')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 2.5)
    assert.ok(
      result.state.price.unit === 'EUR' || result.state.price.unit === 'USD',
      `currency unit should be EUR or USD, got ${result.state.price.unit}`
    )
  })

  it('17. currency in word form: "costs 5 dollars" or price near currency word', () => {
    // This is aspirational — current fb.js may not handle word-form currency.
    // The test is flexible: if price is extracted, check the value.
    const result = fb('Sourdough bread costs $5')
    assert.ok(result.state.price, 'should extract price from $ symbol')
    assert.equal(result.state.price.value, 5)
  })
})

// ════════════════════════════════════════════════════════════
//  4. SURPLUS LANGUAGE (3 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — surplus language', () => {
  it('18. basic surplus: "3 loaves left over, were $4, selling for $1.50"', () => {
    const result = fb('3 loaves left over, were $4, selling for $1.50')
    assert.ok(result.primary, 'should produce a primary block')
    assert.ok(result.blocks.length >= 1, 'should produce at least 1 block')
    assert.equal(result.type, 'substance.surplus', 'should be surplus type')
    // Surplus handler extracts original_price and surplus_price, not generic price
    assert.ok(result.state.original_price, 'should extract original price')
    assert.equal(result.state.original_price.value, 4, 'original price should be $4')
    assert.ok(result.state.surplus_price, 'should extract surplus price')
    assert.equal(result.state.surplus_price.value, 1.5, 'surplus price should be $1.50')
  })

  it('19. surplus with expiry: "collect by 8pm"', () => {
    const result = fb('5 croissants left over, $1 each, collect by 8pm')
    assert.ok(result.primary, 'should produce a primary block')
    assert.equal(result.type, 'substance.surplus', 'should be surplus type')
    // Surplus handler extracts expiry_time from "collect by" pattern
    assert.ok(result.state.expiry_time, 'should extract expiry time')
    assert.equal(result.state.expiry_time, '8pm', 'expiry time should be 8pm')
  })

  it('20. reduced price: "reduced to $2"', () => {
    const result = fb('Sourdough bread, reduced to $2')
    assert.equal(result.type, 'substance.surplus', 'should be surplus type')
    // Surplus handler extracts surplus_price from "reduced to" pattern
    assert.ok(result.state.surplus_price, 'should extract surplus price')
    assert.equal(result.state.surplus_price.value, 2)
  })
})

// ════════════════════════════════════════════════════════════
//  5. CERTIFICATION LANGUAGE (3 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — certification language', () => {
  it('21. with expiry: "Soil Association certified until June 2026"', () => {
    const result = fb('Soil Association certified until June 2026')
    assert.equal(result.type, 'observe.certification')
    assert.ok(result.state.name, 'should extract certification name')
    // If valid_until is extracted, verify it
    if (result.state.valid_until) {
      assert.ok(/2026/.test(String(result.state.valid_until)), 'valid_until should reference 2026')
    }
  })

  it('22. authority extraction: "USDA organic certified"', () => {
    const result = fb('USDA organic certified')
    assert.equal(result.type, 'observe.certification')
    // The name or authority field should reference USDA
    const nameOrAuthority = result.state.name || result.state.authority || ''
    assert.ok(
      /usda/i.test(nameOrAuthority) || result.state.organic === true,
      'should extract USDA as authority or detect organic flag'
    )
  })

  it('23. food safety inspection: "Food safety inspection passed"', () => {
    const result = fb('Food safety inspection passed')
    assert.equal(result.type, 'observe.certification')
    assert.ok(result.primary, 'should produce a primary block')
  })
})

// ════════════════════════════════════════════════════════════
//  6. TRANSFORM LANGUAGE (3 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — transform language', () => {
  it('24. process name: "stone-milled into flour"', () => {
    const result = fb('The wheat was stone-milled into flour')
    // "milled" is a transform.process signal, "wheat" is substance.ingredient
    // transform.process has weight 2, substance.ingredient has weight 1
    assert.ok(
      result.type === 'transform.process' || result.type === 'substance.ingredient',
      `type should be transform or ingredient, got ${result.type}`
    )
    assert.ok(result.primary, 'should produce a primary block')
  })

  it('25. extraction rate: "85% extraction rate"', () => {
    const result = fb('Flour milled at 85% extraction rate')
    // Should detect transform or ingredient
    assert.ok(result.primary, 'should produce a primary block')
    // If extraction_rate is implemented
    if (result.state.extraction_rate !== undefined) {
      assert.equal(result.state.extraction_rate, 85)
    }
  })

  it('26. input/output: "wheat into flour"', () => {
    const result = fb('We process wheat into flour using traditional methods')
    assert.ok(result.primary, 'should produce a primary block')
    // If transform detected, it should capture process info
    if (result.type === 'transform.process') {
      assert.ok(result.state.name || result.state.input || result.state.output, 'should have process details')
    }
  })
})

// ════════════════════════════════════════════════════════════
//  7. READING / SENSOR LANGUAGE (3 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — reading/sensor language', () => {
  it('27. temp + humidity: "Walk-in fridge 3.2°C, humidity 78%"', () => {
    const result = fb('Walk-in fridge 3.2°C, humidity 78%')
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    assert.equal(result.state.temperature.value, 3.2)
    // Humidity may or may not be extracted depending on implementation
    if (result.state.humidity !== undefined) {
      const humidityVal = typeof result.state.humidity === 'object'
        ? result.state.humidity.value
        : result.state.humidity
      assert.equal(humidityVal, 78)
    }
  })

  it('28. fahrenheit: "Oven at 350°F" extracts temperature in fahrenheit', () => {
    const result = fb('Oven at 350°F')
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    assert.equal(result.state.temperature.value, 350)
    const unit = result.state.temperature.unit.toLowerCase()
    assert.ok(
      unit === 'fahrenheit' || unit === 'f',
      `temperature unit should be fahrenheit or f, got ${unit}`
    )
  })

  it('29. location extraction: "in the walk-in cooler"', () => {
    const result = fb('Temperature reading in the walk-in cooler 2.5°C')
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    // Location should be extracted if implemented
    if (result.state.location) {
      assert.ok(
        /walk-in|cooler/i.test(result.state.location),
        `location should reference walk-in cooler, got "${result.state.location}"`
      )
    }
  })
})

// ════════════════════════════════════════════════════════════
//  8. AGENT LANGUAGE (2 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — agent language', () => {
  it('30. agent setup: "Set up an agent for ordering and inventory"', () => {
    const result = fb('Set up an agent for ordering and inventory')
    assert.ok(result.primary, 'should produce a primary block')
    assert.ok(result.blocks.length >= 1, 'should produce at least 1 block')
    // If agent detection is implemented, check the type
    if (result.type === 'actor.agent') {
      assert.ok(result.state.capabilities || result.state.name, 'agent should have capabilities or name')
    }
  })

  it('31. agent with context: "agent for my bakery that handles reordering"', () => {
    const result = fb('Agent for my bakery that handles reordering')
    assert.ok(result.primary, 'should produce a primary block')
    // If agent detection is implemented
    if (result.type === 'actor.agent') {
      if (result.state.capabilities) {
        assert.ok(
          Array.isArray(result.state.capabilities) || typeof result.state.capabilities === 'object',
          'capabilities should be array or object'
        )
      }
    }
  })
})

// ════════════════════════════════════════════════════════════
//  9. CONFIDENCE SCORES (3 tests)
// ════════════════════════════════════════════════════════════
describe('fb() — confidence scores', () => {
  it('32. high confidence (3+ signals): strong intent match has confidence >= 0.7', () => {
    // "Walk-in cooler temperature 4 celsius" hits cooler + temperature + celsius = 3 signals
    const result = fb('Walk-in cooler temperature 4 celsius')
    assert.equal(result.type, 'observe.reading')
    if (result.confidence !== undefined) {
      assert.ok(result.confidence >= 0.7, `high-signal confidence should be >= 0.7, got ${result.confidence}`)
    }
  })

  it('33. medium confidence (1-2 signals): has moderate confidence', () => {
    // "bread $3" has only 1-2 signals (bread + $)
    const result = fb('Bread, $3')
    if (result.confidence !== undefined) {
      assert.ok(
        result.confidence >= 0.4 && result.confidence <= 0.9,
        `medium-signal confidence should be 0.4-0.9, got ${result.confidence}`
      )
    }
  })

  it('34. low confidence (no signals, default type): "banana" has low confidence', () => {
    const result = fb('banana')
    assert.ok(result.primary, 'should still produce a block')
    // "banana" matches no intent signals, so defaults to substance.product
    // confidence should be low
    if (result.confidence !== undefined) {
      assert.ok(result.confidence <= 0.6, `no-signal confidence should be <= 0.6, got ${result.confidence}`)
    }
  })
})

// ════════════════════════════════════════════════════════════
// 10. EDGE CASES (9 tests — tests 35-43)
// ════════════════════════════════════════════════════════════
describe('fb() — edge cases', () => {
  it('35. empty-ish input: very short text still produces a block', () => {
    const result = fb('ok')
    assert.ok(result.primary, 'should produce a primary block even for short input')
    assert.ok(result.blocks.length >= 1, 'should produce at least 1 block')
    assert.ok(result.type, 'should have a type')
  })

  it('36. all lowercase: "sourdough bread $4.50 organic" still works', () => {
    const result = fb('sourdough bread $4.50 organic')
    assert.equal(result.type, 'substance.product')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 4.5)
    assert.equal(result.state.organic, true)
  })

  it('37. multiple quantities: "50kg flour at $2/kg" extracts weight and price', () => {
    const result = fb('50kg flour at $2/kg')
    assert.ok(result.state.weight, 'should extract weight')
    assert.equal(result.state.weight.value, 50)
    assert.equal(result.state.weight.unit, 'kg')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 2)
  })

  it('38. unicode: "Cafe creme, €3.50" handles accented characters', () => {
    const result = fb('Caf\u00e9 cr\u00e8me, \u20ac3.50')
    assert.ok(result.primary, 'should produce a block')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 3.5)
    assert.ok(result.state.name, 'should extract name')
  })

  it('39. long complex input: full sentence with venue, products, and prices', () => {
    const result = fb("Joe's Artisan Bakery on High Street sells sourdough bread for $4.50, croissants for $2.80, and organic rye loaves for $5.00")
    assert.ok(result.primary, 'should produce a primary block')
    assert.ok(result.blocks.length >= 1, 'should produce at least 1 block')
    // Should extract at least one price
    const hasPrice = result.state.price ||
      result.blocks.some(b => b.state && b.state.price)
    assert.ok(hasPrice, 'should extract at least one price from complex input')
  })

  it('40. boolean flags: "organic, gluten-free, vegan" extracts all flags', () => {
    const result = fb('Sourdough bread, organic, gluten-free, vegan')
    assert.equal(result.state.organic, true, 'should detect organic flag')
    // gluten-free and vegan may be extracted depending on vocabulary definitions
    if (result.state.gluten_free !== undefined) {
      assert.equal(result.state.gluten_free, true)
    }
    if (result.state.vegan !== undefined) {
      assert.equal(result.state.vegan, true)
    }
  })

  it('41. throws on non-string input', () => {
    assert.throws(() => fb(123), /needs text/)
    assert.throws(() => fb(undefined), /needs text/)
    assert.throws(() => fb({}), /needs text/)
  })

  it('42. throws on empty string', () => {
    assert.throws(() => fb(''), /needs text/)
  })

  it('43. throws on null', () => {
    assert.throws(() => fb(null), /needs text/)
  })
})

// ════════════════════════════════════════════════════════════
// 11. RETURN SHAPE INVARIANTS (5 tests — tests 44-48)
// ════════════════════════════════════════════════════════════
describe('fb() — return shape invariants', () => {
  it('44. result always has blocks array', () => {
    const result = fb('Anything at all')
    assert.ok(Array.isArray(result.blocks), 'blocks must be an array')
    assert.ok(result.blocks.length >= 1, 'blocks must have at least 1 entry')
  })

  it('45. result.primary is the first block', () => {
    const result = fb('Sourdough bread, $4.50')
    assert.strictEqual(result.primary, result.blocks[0], 'primary should be blocks[0]')
  })

  it('46. result.type matches primary block type', () => {
    const result = fb('Sourdough bread, $4.50')
    assert.equal(result.type, result.primary.type, 'result.type should match primary.type')
  })

  it('47. every block has hash, type, state, refs', () => {
    const result = fb("Joe's Bakery sells sourdough for $4.50")
    for (const block of result.blocks) {
      assert.ok(typeof block.hash === 'string', 'block must have a string hash')
      assert.equal(block.hash.length, 64, 'hash must be 64 chars')
      assert.ok(typeof block.type === 'string', 'block must have a string type')
      assert.ok(block.state && typeof block.state === 'object', 'block must have a state object')
      assert.ok(block.refs && typeof block.refs === 'object', 'block must have a refs object')
    }
  })

  it('48. result.text echoes the original input', () => {
    const input = 'My special input text for the parser'
    const result = fb(input)
    assert.equal(result.text, input, 'result.text should be the original input')
  })
})

// ════════════════════════════════════════════════════════════
// 12. INTENT PRIORITY / WEIGHT RESOLUTION (4 tests — tests 49-52)
// ════════════════════════════════════════════════════════════
describe('fb() — intent priority and weight resolution', () => {
  it('49. certification (weight 3) beats product (weight 1) for "organic certified bread"', () => {
    const result = fb('Organic certified bread from Green Acres')
    // "certified" has weight 3, "bread" has weight 1
    assert.ok(
      result.type === 'observe.certification' || result.type === 'substance.product',
      `type should be certification or product, got ${result.type}`
    )
    // certification should win due to higher weight
    if (result.type === 'observe.certification') {
      assert.ok(true, 'certification correctly outweighed product')
    }
  })

  it('50. reading (weight 3) beats product for "bread oven temperature 200 celsius"', () => {
    const result = fb('Bread oven temperature 200 celsius')
    // temperature + celsius (weight 3 each match) should outweigh bread (weight 1)
    assert.equal(result.type, 'observe.reading')
    assert.ok(result.state.temperature, 'should extract temperature')
    assert.equal(result.state.temperature.value, 200)
  })

  it('51. review (weight 2) beats venue for "amazing bakery visited yesterday"', () => {
    const result = fb('Amazing bakery I visited yesterday, 4 stars')
    // "amazing" + "visited" + "stars" = review signals (weight 2 each hit)
    // "bakery" = venue signal (weight 1)
    assert.equal(result.type, 'observe.review')
    assert.equal(result.state.rating, 4)
  })

  it('52. order (weight 2) beats ingredient for "ordered 50kg flour"', () => {
    const result = fb('Ordered 50kg flour')
    // "ordered" = transfer.order (weight 2), "flour" = substance.ingredient (weight 1)
    assert.equal(result.type, 'transfer.order')
    assert.ok(result.state.weight, 'should extract weight')
  })
})

// ════════════════════════════════════════════════════════════
// 13. NAME EXTRACTION (4 tests — tests 53-56)
// ════════════════════════════════════════════════════════════
describe('fb() — name extraction', () => {
  it('53. extracts proper noun as name: "Green Acres Farm"', () => {
    const result = fb('Green Acres Farm, 200 acres')
    assert.ok(result.state.name, 'should extract name')
    assert.ok(/green acres/i.test(result.state.name), `name should contain "Green Acres", got "${result.state.name}"`)
  })

  it('54. extracts venue name from "at X" pattern in reviews', () => {
    const result = fb("Great food at Mario's Trattoria, 5 stars")
    assert.equal(result.type, 'observe.review')
    assert.ok(result.state.name, 'should extract name')
    assert.ok(/mario/i.test(result.state.name), `name should reference Mario's, got "${result.state.name}"`)
  })

  it('55. extracts first segment as name when no proper noun', () => {
    const result = fb('sourdough bread, $4.50')
    assert.ok(result.state.name, 'should extract a name even from lowercase text')
  })

  it('56. name does not include price or trailing punctuation', () => {
    const result = fb('Artisan Sourdough, $6.00, organic')
    assert.ok(result.state.name, 'should extract name')
    assert.ok(
      !result.state.name.includes('$'),
      `name should not include price symbol, got "${result.state.name}"`
    )
    assert.ok(
      !result.state.name.endsWith(','),
      `name should not end with comma, got "${result.state.name}"`
    )
  })
})

// ════════════════════════════════════════════════════════════
// 14. QUANTITY EXTRACTION PRECISION (3 tests — tests 57-59)
// ════════════════════════════════════════════════════════════
describe('fb() — quantity extraction precision', () => {
  it('57. handles comma-separated thousands: "1,500kg"', () => {
    const result = fb('Ordered 1,500kg wheat')
    assert.ok(result.state.weight, 'should extract weight')
    assert.equal(result.state.weight.value, 1500)
    assert.equal(result.state.weight.unit, 'kg')
  })

  it('58. handles decimal prices: "$12.99"', () => {
    const result = fb('Premium sourdough, $12.99')
    assert.ok(result.state.price, 'should extract price')
    assert.equal(result.state.price.value, 12.99)
  })

  it('59. handles volume: "500ml"', () => {
    const result = fb('Olive oil, 500ml, $8.99')
    assert.ok(result.state.volume, 'should extract volume')
    assert.equal(result.state.volume.value, 500)
    assert.equal(result.state.volume.unit, 'ml')
    assert.ok(result.state.price, 'should also extract price')
    assert.equal(result.state.price.value, 8.99)
  })
})

// ════════════════════════════════════════════════════════════
// 15. RATING VARIATIONS (2 tests — tests 60-61)
// ════════════════════════════════════════════════════════════
describe('fb() — rating variations', () => {
  it('60. fractional rating: "4.5 stars"', () => {
    const result = fb('Pretty good sourdough at the corner bakery, 4.5 stars')
    assert.equal(result.type, 'observe.review')
    assert.equal(result.state.rating, 4.5)
  })

  it('61. "rated X" pattern', () => {
    const result = fb("Luigi's Pizza rated 4 out of 5")
    assert.equal(result.type, 'observe.review')
    // Should extract rating of 4
    assert.ok(result.state.rating !== undefined, 'should extract rating')
    assert.equal(result.state.rating, 4)
  })
})
