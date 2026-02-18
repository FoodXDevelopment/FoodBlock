const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  // Core
  create, update, hash,

  // Vocabulary (Section 20)
  createVocabulary, mapFields, VOCABULARIES,

  // Merge (Section 21)
  detectConflict, merge, autoMerge,

  // Merkle (Section 22)
  merkleize, selectiveDisclose, verifyProof, sha256,

  // Snapshot (Section 23)
  createSnapshot, verifySnapshot, summarize,

  // Attestation (Section 24)
  attest, dispute, traceAttestations, trustScore,

  // Template (Section 18)
  createTemplate, fromTemplate, TEMPLATES,

  // Federation (Section 19)
  wellKnown
} = require('../src/index')

// ---------------------------------------------------------------------------
// vocabulary
// ---------------------------------------------------------------------------
describe('vocabulary', () => {
  it('VOCABULARIES should have 14 entries', () => {
    const keys = Object.keys(VOCABULARIES)
    assert.equal(keys.length, 14)
    assert.ok(keys.includes('bakery'))
    assert.ok(keys.includes('restaurant'))
    assert.ok(keys.includes('farm'))
    assert.ok(keys.includes('retail'))
    assert.ok(keys.includes('lot'))
    assert.ok(keys.includes('units'))
    assert.ok(keys.includes('workflow'))
  })

  it('createVocabulary creates a custom vocab', () => {
    const vocab = createVocabulary('dairy', ['substance.product'], {
      fat_content: { type: 'number', aliases: ['fat', 'fat content'] },
      pasteurized: { type: 'boolean', aliases: ['pasteurized'] }
    })
    assert.equal(vocab.type, 'observe.vocabulary')
    assert.equal(vocab.state.domain, 'dairy')
    assert.deepEqual(vocab.state.for_types, ['substance.product'])
    assert.ok(vocab.state.fields.fat_content)
    assert.ok(vocab.state.fields.pasteurized)
    assert.ok(typeof vocab.hash === 'string' && vocab.hash.length === 64)
  })

  it('mapFields extracts known fields from text', () => {
    const vocab = VOCABULARIES.bakery
    const result = mapFields('organic sourdough price 4.50 gluten', vocab)
    assert.equal(result.matched.organic, true)
    assert.equal(result.matched.price, 4.50)
    assert.ok(result.matched.allergens)
    assert.equal(result.matched.allergens.gluten, true)
    assert.ok(Array.isArray(result.unmatched))
  })
})

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------
describe('merge', () => {
  // Build a small in-memory store for merge tests: an original block and two
  // divergent updates that share it as a common ancestor.
  const original = create('substance.product', { name: 'Bread', price: 3 })
  const forkA = update(original.hash, 'substance.product', { name: 'Bread', price: 4 })
  const forkB = update(original.hash, 'substance.product', { name: 'Bread', price: 5 })

  const store = {
    [original.hash]: original,
    [forkA.hash]: forkA,
    [forkB.hash]: forkB
  }

  it('detectConflict detects a fork when two blocks share common ancestor', async () => {
    const resolve = async (h) => store[h] || null
    const result = await detectConflict(forkA.hash, forkB.hash, resolve)
    assert.equal(result.isConflict, true)
    assert.equal(result.commonAncestor, original.hash)
    assert.ok(Array.isArray(result.chainA))
    assert.ok(Array.isArray(result.chainB))
  })

  it('merge with manual strategy creates observe.merge block', async () => {
    const resolve = async (h) => store[h] || null
    const merged = await merge(forkA.hash, forkB.hash, resolve, {
      strategy: 'manual',
      state: { name: 'Bread', price: 4.50 }
    })
    assert.equal(merged.type, 'observe.merge')
    assert.equal(merged.state.strategy, 'manual')
    assert.equal(merged.state.price, 4.50)
    assert.deepEqual(merged.refs.merges, [forkA.hash, forkB.hash])
  })

  it('merge with a_wins strategy uses hashA state', async () => {
    const resolve = async (h) => store[h] || null
    const merged = await merge(forkA.hash, forkB.hash, resolve, {
      strategy: 'a_wins'
    })
    assert.equal(merged.type, 'observe.merge')
    assert.equal(merged.state.strategy, 'a_wins')
    assert.equal(merged.state.price, 4)
    assert.equal(merged.state.name, 'Bread')
  })

  it('autoMerge with lww strategy picks the later value', async () => {
    const resolve = async (h) => store[h] || null
    const vocab = {
      fields: {
        name: { type: 'string', merge: 'lww' },
        price: { type: 'number', merge: 'lww' }
      }
    }
    const merged = await autoMerge(forkA.hash, forkB.hash, resolve, vocab)
    assert.equal(merged.type, 'observe.merge')
    assert.equal(merged.state.strategy, 'auto')
    // lww convention: B wins (the later writer)
    assert.equal(merged.state.price, 5)
    assert.deepEqual(merged.refs.merges, [forkA.hash, forkB.hash])
  })
})

// ---------------------------------------------------------------------------
// merkle
// ---------------------------------------------------------------------------
describe('merkle', () => {
  it('merkleize creates tree with root, leaves and layers', () => {
    const state = { name: 'Sourdough', price: 4.50, organic: true }
    const result = merkleize(state)
    assert.ok(typeof result.root === 'string' && result.root.length === 64)
    assert.ok(result.leaves && typeof result.leaves === 'object')
    assert.ok(result.leaves.name)
    assert.ok(result.leaves.price)
    assert.ok(result.leaves.organic)
    assert.ok(Array.isArray(result.tree))
    assert.ok(result.tree.length >= 1)
  })

  it('selectiveDisclose returns disclosed fields and proof', () => {
    const state = { name: 'Sourdough', price: 4.50, organic: true }
    const result = selectiveDisclose(state, ['name'])
    assert.deepEqual(result.disclosed, { name: 'Sourdough' })
    assert.ok(Array.isArray(result.proof))
    assert.ok(result.proof.length > 0)
    assert.ok(typeof result.root === 'string' && result.root.length === 64)
  })

  it('verifyProof returns true for valid proof', () => {
    const state = { name: 'Sourdough', price: 4.50, organic: true }
    const { disclosed, proof, root } = selectiveDisclose(state, ['name'])
    const valid = verifyProof(disclosed, proof, root)
    assert.equal(valid, true)
  })

  it('sha256 returns 64 hex char digest', () => {
    const digest = sha256('hello world')
    assert.equal(typeof digest, 'string')
    assert.equal(digest.length, 64)
    assert.ok(/^[0-9a-f]{64}$/.test(digest))
  })
})

// ---------------------------------------------------------------------------
// snapshot
// ---------------------------------------------------------------------------
describe('snapshot', () => {
  const blockA = create('substance.product', { name: 'Bread' })
  const blockB = create('substance.ingredient', { name: 'Flour' })
  const blockC = create('actor.producer', { name: 'Farm' })

  it('createSnapshot creates observe.snapshot with merkle_root and block_count', () => {
    const snap = createSnapshot([blockA, blockB, blockC])
    assert.equal(snap.type, 'observe.snapshot')
    assert.equal(snap.state.block_count, 3)
    assert.ok(typeof snap.state.merkle_root === 'string' && snap.state.merkle_root.length === 64)
    assert.ok(typeof snap.hash === 'string' && snap.hash.length === 64)
  })

  it('verifySnapshot returns valid:true for matching blocks', () => {
    const snap = createSnapshot([blockA, blockB, blockC])
    const result = verifySnapshot(snap, [blockA, blockB, blockC])
    assert.equal(result.valid, true)
    assert.deepEqual(result.missing, [])
  })

  it('summarize counts blocks by type', () => {
    const blocks = [
      create('substance.product', { name: 'Bread' }),
      create('substance.product', { name: 'Cake' }),
      create('actor.producer', { name: 'Farm' }),
      create('observe.review', { rating: 5 })
    ]
    const result = summarize(blocks)
    assert.equal(result.total, 4)
    assert.equal(result.by_type['substance.product'], 2)
    assert.equal(result.by_type['actor.producer'], 1)
    assert.equal(result.by_type['observe.review'], 1)
  })
})

// ---------------------------------------------------------------------------
// attestation
// ---------------------------------------------------------------------------
describe('attestation', () => {
  const target = create('substance.product', { name: 'Organic Flour', organic: true })
  const attestor = create('actor.authority', { name: 'USDA Organic' })
  const disputer = create('actor.authority', { name: 'FDA Inspector' })

  it('attest creates observe.attestation with confirms ref', () => {
    const a = attest(target.hash, attestor.hash)
    assert.equal(a.type, 'observe.attestation')
    assert.equal(a.refs.confirms, target.hash)
    assert.equal(a.refs.attestor, attestor.hash)
    assert.equal(a.state.confidence, 'verified')
    assert.ok(typeof a.hash === 'string' && a.hash.length === 64)
  })

  it('dispute creates observe.dispute with challenges ref', () => {
    const d = dispute(target.hash, disputer.hash, 'Lab results show pesticides')
    assert.equal(d.type, 'observe.dispute')
    assert.equal(d.refs.challenges, target.hash)
    assert.equal(d.refs.disputor, disputer.hash)
    assert.equal(d.state.reason, 'Lab results show pesticides')
  })

  it('traceAttestations finds attestations and disputes', () => {
    const a1 = attest(target.hash, attestor.hash)
    const a2 = attest(target.hash, attestor.hash, { confidence: 'probable' })
    const d1 = dispute(target.hash, disputer.hash, 'Contested claim')
    const allBlocks = [target, attestor, disputer, a1, a2, d1]

    const result = traceAttestations(target.hash, allBlocks)
    assert.equal(result.attestations.length, 2)
    assert.equal(result.disputes.length, 1)
    assert.equal(result.score, 1) // 2 attestations - 1 dispute
  })

  it('trustScore returns net score (attestations - disputes)', () => {
    const a1 = attest(target.hash, attestor.hash)
    const d1 = dispute(target.hash, disputer.hash, 'Issue A')
    const d2 = dispute(target.hash, disputer.hash, 'Issue B')
    const allBlocks = [a1, d1, d2]

    const score = trustScore(target.hash, allBlocks)
    assert.equal(score, -1) // 1 attestation - 2 disputes
  })
})

// ---------------------------------------------------------------------------
// template
// ---------------------------------------------------------------------------
describe('template', () => {
  it('TEMPLATES has 9 entries', () => {
    const keys = Object.keys(TEMPLATES)
    assert.equal(keys.length, 9)
    assert.ok(keys.includes('supply-chain'))
    assert.ok(keys.includes('review'))
    assert.ok(keys.includes('certification'))
    assert.ok(keys.includes('surplus-rescue'))
    assert.ok(keys.includes('agent-reorder'))
    assert.ok(keys.includes('restaurant-sourcing'))
    assert.ok(keys.includes('food-safety-audit'))
    assert.ok(keys.includes('market-day'))
    assert.ok(keys.includes('cold-chain'))
  })

  it('fromTemplate generates correct number of blocks', () => {
    const template = TEMPLATES['supply-chain']
    const blocks = fromTemplate(template, {
      farm: { state: { name: 'Green Acres' } },
      crop: { state: { name: 'Wheat' } },
      processing: { state: { name: 'Milling' } },
      product: { state: { name: 'Flour' } },
      sale: { state: { total: 100 } }
    })
    assert.equal(blocks.length, 5)
    assert.equal(blocks[0].type, 'actor.producer')
    assert.equal(blocks[0].state.name, 'Green Acres')
    assert.equal(blocks[1].type, 'substance.ingredient')
    assert.equal(blocks[1].refs.source, blocks[0].hash)
    assert.equal(blocks[4].type, 'transfer.order')
    assert.equal(blocks[4].refs.item, blocks[3].hash)
  })

  it('createTemplate creates a custom template', () => {
    const tmpl = createTemplate(
      'inspection',
      'A food safety inspection of a venue',
      [
        { type: 'actor.authority', alias: 'inspector', required: ['name'] },
        { type: 'actor.venue', alias: 'venue', required: ['name'] },
        { type: 'observe.review', alias: 'report', refs: { inspector: '@inspector', subject: '@venue' } }
      ]
    )
    assert.equal(tmpl.type, 'observe.template')
    assert.equal(tmpl.state.name, 'inspection')
    assert.equal(tmpl.state.description, 'A food safety inspection of a venue')
    assert.equal(tmpl.state.steps.length, 3)
    assert.ok(typeof tmpl.hash === 'string' && tmpl.hash.length === 64)
  })
})

// ---------------------------------------------------------------------------
// federation
// ---------------------------------------------------------------------------
describe('federation', () => {
  it('wellKnown generates correct discovery document shape', () => {
    const doc = wellKnown({
      name: 'Test Server',
      version: '0.4.0',
      count: 42,
      types: ['substance.product', 'actor.producer'],
      peers: ['https://peer1.example.com']
    })
    assert.equal(doc.protocol, 'foodblock')
    assert.equal(doc.version, '0.4.0')
    assert.equal(doc.name, 'Test Server')
    assert.equal(doc.count, 42)
    assert.deepEqual(doc.types, ['substance.product', 'actor.producer'])
    assert.deepEqual(doc.peers, ['https://peer1.example.com'])
    assert.ok(doc.endpoints)
    assert.equal(doc.endpoints.blocks, '/blocks')
    assert.equal(doc.endpoints.batch, '/blocks/batch')
    assert.equal(doc.endpoints.chain, '/chain')
    assert.equal(doc.endpoints.heads, '/heads')
    assert.equal(doc.endpoints.push, '/.well-known/foodblock/push')
    assert.equal(doc.endpoints.pull, '/.well-known/foodblock/pull')
    assert.equal(doc.endpoints.handshake, '/.well-known/foodblock/handshake')
    assert.equal(doc.public_key, null)
    assert.deepEqual(doc.schemas, [])
    assert.deepEqual(doc.templates, [])
  })
})
