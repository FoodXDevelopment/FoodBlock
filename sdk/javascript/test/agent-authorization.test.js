const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createAuthorization, checkAuthorization } = require('../src/agent')

// ── createAuthorization ───────────────────────────────────────────────────

describe('createAuthorization', () => {
  const agentHash = 'a'.repeat(64)

  it('creates a transfer.authorization block with required fields', () => {
    const block = createAuthorization(agentHash, ['transfer.order'])
    assert.equal(block.type, 'transfer.authorization')
    assert.deepEqual(block.state.scope, ['transfer.order'])
    assert.equal(block.state.approval_mode, 'draft') // default
    assert.equal(block.refs.agent, agentHash)
  })

  it('defaults approval_mode to draft', () => {
    const block = createAuthorization(agentHash, ['transfer.*'])
    assert.equal(block.state.approval_mode, 'draft')
  })

  it('accepts all three approval_mode values', () => {
    for (const mode of ['auto', 'draft', 'ask']) {
      const block = createAuthorization(agentHash, ['transfer.order'], { approvalMode: mode })
      assert.equal(block.state.approval_mode, mode)
    }
  })

  it('includes optional monetary limits when provided', () => {
    const block = createAuthorization(agentHash, ['transfer.order'], {
      maxPerTransaction: 50,
      maxPerPeriod: 250,
      period: '7d',
      currency: 'GBP',
    })
    assert.equal(block.state.max_per_transaction, 50)
    assert.equal(block.state.max_per_period, 250)
    assert.equal(block.state.period, '7d')
    assert.equal(block.state.currency, 'GBP')
  })

  it('omits optional fields when not provided', () => {
    const block = createAuthorization(agentHash, ['transfer.order'])
    assert.equal(block.state.max_per_transaction, undefined)
    assert.equal(block.state.max_per_period, undefined)
    assert.equal(block.state.period, undefined)
    assert.equal(block.state.currency, undefined)
    assert.equal(block.state.expires, undefined)
  })

  it('includes expires when provided', () => {
    const expires = '2026-12-31T23:59:59Z'
    const block = createAuthorization(agentHash, ['transfer.order'], { expires })
    assert.equal(block.state.expires, expires)
  })

  it('throws when agentHash is missing', () => {
    assert.throws(() => createAuthorization(null, ['transfer.order']), /agentHash is required/)
  })

  it('throws when agentHash is not a string', () => {
    assert.throws(() => createAuthorization(123, ['transfer.order']), /agentHash is required/)
  })

  it('throws when scope is not an array', () => {
    assert.throws(() => createAuthorization(agentHash, 'transfer.order'), /non-empty array/)
  })

  it('throws when scope is an empty array', () => {
    assert.throws(() => createAuthorization(agentHash, []), /non-empty array/)
  })

  it('throws on invalid approvalMode', () => {
    assert.throws(
      () => createAuthorization(agentHash, ['transfer.order'], { approvalMode: 'yolo' }),
      /approvalMode must be/
    )
  })
})

// ── checkAuthorization ────────────────────────────────────────────────────

describe('checkAuthorization', () => {
  const agentHash = 'a'.repeat(64)

  function makeAuth(overrides = {}) {
    return {
      type: 'transfer.authorization',
      state: {
        scope: ['transfer.order'],
        approval_mode: 'auto',
        ...overrides,
      },
      refs: { agent: agentHash },
    }
  }

  it('authorizes exact type match', () => {
    const result = checkAuthorization(makeAuth(), 'transfer.order')
    assert.equal(result.authorized, true)
    assert.equal(result.mode, 'auto')
  })

  it('authorizes via wildcard transfer.*', () => {
    const auth = makeAuth({ scope: ['transfer.*'] })
    assert.equal(checkAuthorization(auth, 'transfer.order').authorized, true)
    assert.equal(checkAuthorization(auth, 'transfer.shipment').authorized, true)
    assert.equal(checkAuthorization(auth, 'transfer.donation').authorized, true)
  })

  it('wildcard transfer.* does not match observe.post', () => {
    const auth = makeAuth({ scope: ['transfer.*'] })
    const result = checkAuthorization(auth, 'observe.post')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'SCOPE_MISMATCH')
  })

  it('authorizes via global wildcard *', () => {
    const auth = makeAuth({ scope: ['*'] })
    assert.equal(checkAuthorization(auth, 'transfer.order').authorized, true)
    assert.equal(checkAuthorization(auth, 'observe.review').authorized, true)
    assert.equal(checkAuthorization(auth, 'substance.product').authorized, true)
  })

  it('denies type not in scope', () => {
    const result = checkAuthorization(makeAuth(), 'observe.post')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'SCOPE_MISMATCH')
  })

  it('denies expired authorization', () => {
    const auth = makeAuth({ expires: '2020-01-01T00:00:00Z' })
    const result = checkAuthorization(auth, 'transfer.order')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'AUTHORIZATION_EXPIRED')
  })

  it('allows non-expired authorization', () => {
    const auth = makeAuth({ expires: '2099-01-01T00:00:00Z' })
    assert.equal(checkAuthorization(auth, 'transfer.order').authorized, true)
  })

  it('denies when value exceeds max_per_transaction', () => {
    const auth = makeAuth({ max_per_transaction: 50 })
    const result = checkAuthorization(auth, 'transfer.order', 51)
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'EXCEEDED_LIMIT')
  })

  it('allows when value equals max_per_transaction', () => {
    const auth = makeAuth({ max_per_transaction: 50 })
    assert.equal(checkAuthorization(auth, 'transfer.order', 50).authorized, true)
  })

  it('allows when no value limit set', () => {
    const auth = makeAuth()
    assert.equal(checkAuthorization(auth, 'transfer.order', 9999).authorized, true)
  })

  it('returns UNAUTHORIZED for null authBlock', () => {
    const result = checkAuthorization(null, 'transfer.order')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'UNAUTHORIZED')
  })

  it('returns UNAUTHORIZED for wrong block type', () => {
    const notAuth = { type: 'observe.post', state: { scope: ['*'] }, refs: {} }
    const result = checkAuthorization(notAuth, 'transfer.order')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'UNAUTHORIZED')
  })

  it('returns UNAUTHORIZED for tombstoned block (state: {})', () => {
    // Tombstoning zeroes state — scope will be absent
    const tombstoned = { type: 'transfer.authorization', state: {}, refs: { agent: agentHash } }
    const result = checkAuthorization(tombstoned, 'transfer.order')
    assert.equal(result.authorized, false)
    assert.equal(result.reason, 'UNAUTHORIZED')
  })

  it('returns approval_mode from the auth block', () => {
    const auth = makeAuth({ approval_mode: 'draft' })
    const result = checkAuthorization(auth, 'transfer.order')
    assert.equal(result.authorized, true)
    assert.equal(result.mode, 'draft')
  })

  it('handles multiple scope entries', () => {
    const auth = makeAuth({ scope: ['transfer.order', 'observe.post', 'substance.*'] })
    assert.equal(checkAuthorization(auth, 'transfer.order').authorized, true)
    assert.equal(checkAuthorization(auth, 'observe.post').authorized, true)
    assert.equal(checkAuthorization(auth, 'substance.product').authorized, true)
    assert.equal(checkAuthorization(auth, 'observe.review').authorized, false)
  })
})
