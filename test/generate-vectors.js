const { create, canonical } = require('../sdk/javascript/src/index')

// Generate test vectors for cross-language verification
const vectors = [
  {
    name: 'empty genesis block',
    type: 'actor.producer',
    state: {},
    refs: {}
  },
  {
    name: 'simple product',
    type: 'substance.product',
    state: { name: 'Sourdough', price: 4.5 },
    refs: { seller: 'abc123def456' }
  },
  {
    name: 'multi-ref transform',
    type: 'transform.process',
    state: { name: 'Baking', temp: 220 },
    refs: { inputs: ['flour_hash', 'water_hash', 'yeast_hash'], output: 'bread_hash' }
  },
  {
    name: 'refs array order independence',
    type: 'transform.process',
    state: {},
    refs: { inputs: ['zzz', 'aaa', 'mmm'] }
  },
  {
    name: 'state array order preservation',
    type: 'observe.post',
    state: { content_order: ['block_c', 'block_a', 'block_b'] },
    refs: {}
  },
  {
    name: 'key order independence',
    type: 'test',
    state: { z: 26, a: 1, m: 13 },
    refs: {}
  },
  {
    name: 'nested state',
    type: 'substance.product',
    state: { name: 'Eggs', weight: { value: 500, unit: 'g' }, allergens: { gluten: false, dairy: false, eggs: true } },
    refs: {}
  },
  {
    name: 'visibility in state',
    type: 'observe.review',
    state: { rating: 5, text: 'Excellent', visibility: 'public' },
    refs: { subject: 'product_hash', author: 'user_hash' }
  },
  {
    name: 'unicode content',
    type: 'substance.product',
    state: { name: { en: 'Bread', ar: '\u062e\u0628\u0632', fr: 'Pain', ja: '\u30d1\u30f3' } },
    refs: {}
  },
  {
    name: 'IoT fridge scan',
    type: 'observe.scan',
    state: {
      visibility: 'direct',
      detected: [
        { item: 'Sourdough', gtin: '5000128000123', best_before: '2026-02-20', confidence: 0.94 }
      ]
    },
    refs: { author: 'camera_hash', place: 'fridge_hash', owner: 'user_hash' }
  }
]

const output = vectors.map(v => {
  const block = create(v.type, v.state, v.refs)
  return {
    name: v.name,
    type: v.type,
    state: v.state,
    refs: v.refs,
    expected_canonical: canonical(v.type, v.state, v.refs),
    expected_hash: block.hash
  }
})

console.log(JSON.stringify(output, null, 2))
