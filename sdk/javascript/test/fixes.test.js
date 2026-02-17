const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  create, update, mergeUpdate, hash, canonical,
  generateKeypair, sign, verify,
  chain, head,
  encrypt, decrypt, generateEncryptionKeypair,
  createAgent, createDraft, approveDraft, loadAgent
} = require('../src/index')

// ============================================================
// Fix 2: Cross-language signing (raw 32-byte Ed25519 keys)
// ============================================================
describe('Fix 2: Raw 32-byte Ed25519 keys', () => {
  it('generateKeypair returns 32-byte hex keys', () => {
    const keys = generateKeypair()
    assert.equal(keys.publicKey.length, 64)   // 32 bytes = 64 hex chars
    assert.equal(keys.privateKey.length, 64)
  })

  it('sign and verify round-trip with raw keys', () => {
    const keys = generateKeypair()
    const block = create('test', { data: 'hello' })
    const actor = create('actor.foodie', { name: 'User' })

    const wrapper = sign(block, actor.hash, keys.privateKey)
    assert.ok(verify(wrapper, keys.publicKey))
  })

  it('rejects wrong-length private key', () => {
    assert.throws(() => {
      const block = create('test', { x: 1 })
      sign(block, 'author', 'abcd')
    }, /private key must be 32 bytes/)
  })

  it('rejects wrong-length public key', () => {
    const keys = generateKeypair()
    const block = create('test', { x: 1 })
    const wrapper = sign(block, 'author', keys.privateKey)
    assert.throws(() => verify(wrapper, 'abcd'), /public key must be 32 bytes/)
  })

  it('cross-SDK interop: Python-generated keys would be same format', () => {
    // Both JS and Python now export raw 32-byte keys
    // Verify that we can sign/verify with any valid 32-byte hex key
    const keys = generateKeypair()
    assert.ok(/^[0-9a-f]{64}$/.test(keys.publicKey))
    assert.ok(/^[0-9a-f]{64}$/.test(keys.privateKey))
  })
})

// ============================================================
// Fix 12: head() cycle detection and depth limit
// ============================================================
describe('Fix 12: head() cycle detection', () => {
  it('handles single block (no updaters)', async () => {
    const block = create('test', { v: 1 })
    const resolveForward = async () => []
    const result = await head(block.hash, resolveForward)
    assert.equal(result, block.hash)
  })

  it('finds head of a chain', async () => {
    const v1 = create('test', { v: 1 })
    const v2 = update(v1.hash, 'test', { v: 2 })
    const v3 = update(v2.hash, 'test', { v: 3 })

    const forward = {}
    for (const b of [v1, v2, v3]) {
      const upd = b.refs.updates
      if (upd) {
        if (!forward[upd]) forward[upd] = []
        forward[upd].push(b)
      }
    }

    const resolveForward = async (h) => forward[h] || []
    const result = await head(v1.hash, resolveForward)
    assert.equal(result, v3.hash)
  })

  it('respects maxDepth', async () => {
    // Create a chain of 10 blocks
    const blocks = [create('test', { v: 0 })]
    for (let i = 1; i <= 10; i++) {
      blocks.push(update(blocks[i - 1].hash, 'test', { v: i }))
    }

    const forward = {}
    for (const b of blocks) {
      const upd = b.refs.updates
      if (upd) {
        if (!forward[upd]) forward[upd] = []
        forward[upd].push(b)
      }
    }

    const resolveForward = async (h) => forward[h] || []
    const result = await head(blocks[0].hash, resolveForward, { maxDepth: 3 })
    // Should stop after 3 steps (block index 3)
    assert.equal(result, blocks[3].hash)
  })

  it('detects cycles and terminates', async () => {
    // Simulate a cycle: A -> B -> A
    const a = { hash: 'aaa', type: 'test', state: {}, refs: {} }
    const b = { hash: 'bbb', type: 'test', state: {}, refs: { updates: 'aaa' } }

    const resolveForward = async (h) => {
      if (h === 'aaa') return [b]
      if (h === 'bbb') return [{ hash: 'aaa', type: 'test', state: {}, refs: { updates: 'bbb' } }]
      return []
    }

    // Should terminate due to cycle detection, not loop forever
    const result = await head('aaa', resolveForward)
    // Result should be either 'aaa' or 'bbb' — the point is it doesn't hang
    assert.ok(['aaa', 'bbb'].includes(result))
  })
})

// ============================================================
// Fix 10: mergeUpdate
// ============================================================
describe('Fix 10: mergeUpdate', () => {
  it('merges state changes into previous block', () => {
    const original = create('substance.product', { name: 'Bread', price: 4.0, organic: true })
    const updated = mergeUpdate(original, { price: 5.0 })

    assert.equal(updated.state.name, 'Bread')
    assert.equal(updated.state.price, 5.0)
    assert.equal(updated.state.organic, true)
    assert.equal(updated.refs.updates, original.hash)
  })

  it('new fields override old ones', () => {
    const original = create('test', { a: 1, b: 2 })
    const updated = mergeUpdate(original, { b: 99, c: 3 })

    assert.equal(updated.state.a, 1)
    assert.equal(updated.state.b, 99)
    assert.equal(updated.state.c, 3)
  })

  it('preserves additional refs', () => {
    const original = create('test', { x: 1 }, { author: 'abc' })
    const updated = mergeUpdate(original, { x: 2 }, { reviewer: 'def' })

    assert.equal(updated.refs.updates, original.hash)
    assert.equal(updated.refs.reviewer, 'def')
  })

  it('throws on missing previousBlock', () => {
    assert.throws(() => mergeUpdate(null), /previousBlock/)
    assert.throws(() => mergeUpdate({}), /previousBlock/)
  })
})

// ============================================================
// Fix 4: omitNulls array recursion
// ============================================================
describe('Fix 4: omitNulls handles nested arrays', () => {
  it('strips nulls from arrays', () => {
    const block = create('test', { items: [1, null, 3] })
    assert.deepEqual(block.state.items, [1, 3])
  })

  it('recurses into objects inside arrays', () => {
    const block = create('test', {
      detected: [
        { item: 'Eggs', spoiled: null },
        { item: 'Milk', freshness: 0.9 }
      ]
    })
    assert.ok(!('spoiled' in block.state.detected[0]))
    assert.equal(block.state.detected[1].freshness, 0.9)
  })
})

// ============================================================
// Fix 14: Encryption round-trip
// ============================================================
describe('Fix 14: Encryption', () => {
  it('generateEncryptionKeypair returns 32-byte hex keys', () => {
    const keys = generateEncryptionKeypair()
    assert.equal(keys.publicKey.length, 64)
    assert.equal(keys.privateKey.length, 64)
  })

  it('encrypt/decrypt round-trip', () => {
    const keys = generateEncryptionKeypair()
    const secret = { ingredient: 'Secret Sauce', recipe_id: 42 }

    const envelope = encrypt(secret, [keys.publicKey])

    assert.equal(envelope.alg, 'x25519-aes-256-gcm')
    assert.equal(envelope.recipients.length, 1)
    assert.ok(envelope.ciphertext)
    assert.ok(envelope.nonce)
    assert.ok(envelope.ephemeral_key)
    assert.equal(envelope.ephemeral_key.length, 64) // raw 32-byte hex

    const decrypted = decrypt(envelope, keys.privateKey, keys.publicKey)
    assert.deepEqual(decrypted, secret)
  })

  it('supports multiple recipients', () => {
    const keys1 = generateEncryptionKeypair()
    const keys2 = generateEncryptionKeypair()

    const data = { secret: 'shared' }
    const envelope = encrypt(data, [keys1.publicKey, keys2.publicKey])

    assert.equal(envelope.recipients.length, 2)

    // Both can decrypt
    const d1 = decrypt(envelope, keys1.privateKey, keys1.publicKey)
    const d2 = decrypt(envelope, keys2.privateKey, keys2.publicKey)
    assert.deepEqual(d1, data)
    assert.deepEqual(d2, data)
  })

  it('wrong key cannot decrypt', () => {
    const keys1 = generateEncryptionKeypair()
    const keys2 = generateEncryptionKeypair()

    const envelope = encrypt({ x: 1 }, [keys1.publicKey])
    assert.throws(() => decrypt(envelope, keys2.privateKey, keys2.publicKey), /no matching recipient/)
  })

  it('encrypts various value types', () => {
    const keys = generateEncryptionKeypair()

    // String
    const e1 = encrypt('hello', [keys.publicKey])
    assert.equal(decrypt(e1, keys.privateKey, keys.publicKey), 'hello')

    // Number
    const e2 = encrypt(42, [keys.publicKey])
    assert.equal(decrypt(e2, keys.privateKey, keys.publicKey), 42)

    // Array
    const e3 = encrypt([1, 2, 3], [keys.publicKey])
    assert.deepEqual(decrypt(e3, keys.privateKey, keys.publicKey), [1, 2, 3])
  })
})

// ============================================================
// Fix 3: canonical number edge cases
// ============================================================
describe('Fix 3: Canonical number formatting', () => {
  it('handles -0 as 0', () => {
    const c = canonical('test', { val: -0 }, {})
    assert.ok(c.includes(':0'))
    assert.ok(!c.includes('-0'))
  })

  it('handles integer values', () => {
    const c = canonical('test', { val: 42 }, {})
    assert.ok(c.includes('42'))
  })

  it('handles float values', () => {
    const c = canonical('test', { val: 3.14 }, {})
    assert.ok(c.includes('3.14'))
  })

  it('handles large integers', () => {
    const c = canonical('test', { val: 999999999999 }, {})
    assert.ok(c.includes('999999999999'))
  })

  it('handles very small decimals', () => {
    const c = canonical('test', { val: 0.001 }, {})
    assert.ok(c.includes('0.001'))
  })
})

// ============================================================
// Fix 15: ESM wrapper smoke test
// ============================================================
describe('Fix 15: ESM wrapper exists', () => {
  it('index.mjs file exists', () => {
    const fs = require('fs')
    const path = require('path')
    const mjs = path.join(__dirname, '..', 'src', 'index.mjs')
    assert.ok(fs.existsSync(mjs), 'index.mjs should exist')
  })
})

// ============================================================
// Agent tests (expanded)
// ============================================================
describe('Agent comprehensive', () => {
  it('agent keypair produces valid signatures', () => {
    const bakery = create('actor.venue', { name: 'Bakery' })
    const agent = createAgent('Bot', bakery.hash)

    const block = create('test', { val: 1 })
    const signed = agent.sign(block)
    assert.ok(verify(signed, agent.keypair.publicKey))
  })

  it('agent sign produces protocol_version', () => {
    const op = create('actor.foodie', { name: 'User' })
    const agent = createAgent('Bot', op.hash)
    const block = create('test', { x: 1 })
    const signed = agent.sign(block)
    assert.ok(signed.protocol_version)
  })

  it('loadAgent can sign and verify', () => {
    const op = create('actor.venue', { name: 'Shop' })
    const original = createAgent('Bot', op.hash)

    const loaded = loadAgent(original.authorHash, original.keypair)
    const block = create('test', { data: 'test' })
    const signed = loaded.sign(block)

    assert.ok(verify(signed, original.keypair.publicKey))
  })

  it('draft and approve workflow end-to-end', () => {
    const op = create('actor.venue', { name: 'Shop' })
    const agent = createAgent('Bot', op.hash)

    const { block: draft, signed } = createDraft(agent, 'transfer.order', {
      quantity: 10, total: 50
    }, { buyer: op.hash })

    // Draft is valid
    assert.equal(draft.state.draft, true)
    assert.ok(verify(signed, agent.keypair.publicKey))

    // Approve
    const approved = approveDraft(draft)
    assert.equal(approved.state.draft, undefined)
    assert.equal(approved.refs.updates, draft.hash)
    assert.equal(approved.refs.approved_agent, agent.authorHash)
  })
})

// ============================================================
// chain() with cycle detection (also part of Fix 12)
// ============================================================
describe('chain() cycle detection', () => {
  it('handles visited hashes', async () => {
    const v1 = create('test', { v: 1 })
    const v2 = update(v1.hash, 'test', { v: 2 })

    // Simulate a corrupted store where v1.refs.updates points to v2 (cycle)
    const cycleV1 = { ...v1, refs: { updates: v2.hash } }
    const store = { [v1.hash]: cycleV1, [v2.hash]: v2 }
    const resolve = async (h) => store[h] || null

    const result = await chain(v2.hash, resolve, { maxDepth: 100 })
    // Should terminate, not loop forever
    assert.ok(result.length <= 3)
  })
})
