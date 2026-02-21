const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { seedVocabularies, seedTemplates, seedAll } = require('../src/seed')
const { VOCABULARIES } = require('../src/vocabulary')
const { TEMPLATES } = require('../src/template')

describe('seedVocabularies', () => {
  const vocabs = seedVocabularies()

  it('generates one block per built-in vocabulary', () => {
    assert.equal(vocabs.length, Object.keys(VOCABULARIES).length)
  })

  it('all blocks are observe.vocabulary type', () => {
    for (const v of vocabs) {
      assert.equal(v.type, 'observe.vocabulary')
    }
  })

  it('all blocks have hash, type, state, refs', () => {
    for (const v of vocabs) {
      assert.ok(v.hash)
      assert.ok(v.type)
      assert.ok(v.state)
      assert.ok(v.refs !== undefined)
    }
  })

  it('blocks contain domain and fields', () => {
    for (const v of vocabs) {
      assert.ok(v.state.domain)
      assert.ok(v.state.for_types)
      assert.ok(v.state.fields)
    }
  })

  it('bakery vocabulary is present', () => {
    const bakery = vocabs.find(v => v.state.domain === 'bakery')
    assert.ok(bakery)
    assert.ok(bakery.state.fields.price)
    assert.ok(bakery.state.fields.allergens)
  })

  it('workflow vocabulary preserves transitions', () => {
    const workflow = vocabs.find(v => v.state.domain === 'workflow')
    assert.ok(workflow)
    assert.ok(workflow.state.transitions)
    assert.ok(workflow.state.transitions.draft)
  })

  it('produces deterministic hashes', () => {
    const vocabs2 = seedVocabularies()
    for (let i = 0; i < vocabs.length; i++) {
      assert.equal(vocabs[i].hash, vocabs2[i].hash)
    }
  })
})

describe('seedTemplates', () => {
  const templates = seedTemplates()

  it('generates one block per built-in template', () => {
    assert.equal(templates.length, Object.keys(TEMPLATES).length)
  })

  it('all blocks are observe.template type', () => {
    for (const t of templates) {
      assert.equal(t.type, 'observe.template')
    }
  })

  it('blocks contain name, description, and steps', () => {
    for (const t of templates) {
      assert.ok(t.state.name)
      assert.ok(t.state.description)
      assert.ok(Array.isArray(t.state.steps))
      assert.ok(t.state.steps.length > 0)
    }
  })

  it('supply-chain template is present', () => {
    const sc = templates.find(t => t.state.name === 'Farm-to-Table Supply Chain')
    assert.ok(sc)
    assert.ok(sc.state.steps.length >= 4)
  })

  it('produces deterministic hashes', () => {
    const templates2 = seedTemplates()
    for (let i = 0; i < templates.length; i++) {
      assert.equal(templates[i].hash, templates2[i].hash)
    }
  })
})

describe('seedAll', () => {
  it('returns vocabularies + templates combined', () => {
    const all = seedAll()
    const expectedCount = Object.keys(VOCABULARIES).length + Object.keys(TEMPLATES).length
    assert.equal(all.length, expectedCount)
  })

  it('all hashes are unique', () => {
    const all = seedAll()
    const hashes = new Set(all.map(b => b.hash))
    assert.equal(hashes.size, all.length)
  })
})
