const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { computeTrust, connectionDensity, createTrustPolicy, DEFAULT_WEIGHTS } = require('../src/trust')
const { create } = require('../src/block')

// Helpers to build test graph
function actor(name) {
  return create('actor.producer', { name })
}

function certification(subjectHash, authorityHash, validUntil) {
  return {
    ...create('observe.certification', {
      instance_id: `cert-${subjectHash.slice(0, 8)}`,
      name: 'Organic',
      valid_until: validUntil
    }, { subject: subjectHash, authority: authorityHash }),
    author_hash: authorityHash
  }
}

function review(subjectHash, authorHash, rating) {
  return {
    ...create('observe.review', {
      instance_id: `rev-${authorHash.slice(0, 8)}`,
      rating
    }, { subject: subjectHash, author: authorHash }),
    author_hash: authorHash
  }
}

function order(buyerHash, sellerHash, hasPayment) {
  const state = {
    instance_id: `ord-${buyerHash.slice(0, 8)}-${sellerHash.slice(0, 8)}`,
    quantity: 10
  }
  if (hasPayment) state.adapter_ref = 'stripe_pi_123'
  return create('transfer.order', state, { buyer: buyerHash, seller: sellerHash })
}

describe('computeTrust', () => {
  it('returns zero score for unknown actor', () => {
    const result = computeTrust('nonexistent', [])
    assert.equal(result.score, 0)
    assert.equal(result.meets_minimum, true)
  })

  it('scores authority certifications', () => {
    const farm = actor('Green Acres')
    const authority = actor('Soil Association')
    const cert = certification(farm.hash, authority.hash, '2027-01-01')
    const blocks = [farm, authority, cert]

    const result = computeTrust(farm.hash, blocks)
    assert.equal(result.inputs.authority_certs, 1)
    assert.ok(result.score >= DEFAULT_WEIGHTS.authority_certs)
  })

  it('excludes expired certifications', () => {
    const farm = actor('Green Acres')
    const authority = actor('Soil Association')
    const cert = certification(farm.hash, authority.hash, '2020-01-01')
    const blocks = [farm, authority, cert]

    const result = computeTrust(farm.hash, blocks)
    assert.equal(result.inputs.authority_certs, 0)
  })

  it('scores peer reviews weighted by independence', () => {
    const shop = actor('Bakery')
    const reviewer1 = actor('Customer A')
    const reviewer2 = actor('Customer B')
    const r1 = review(shop.hash, reviewer1.hash, 5)
    const r2 = review(shop.hash, reviewer2.hash, 4)
    const blocks = [shop, reviewer1, reviewer2, r1, r2]

    const result = computeTrust(shop.hash, blocks)
    assert.equal(result.inputs.peer_reviews.count, 2)
    assert.ok(result.inputs.peer_reviews.avg_score > 0)
  })

  it('scores verified orders', () => {
    const buyer = actor('Restaurant')
    const seller = actor('Supplier')
    const ord = order(buyer.hash, seller.hash, true)
    const blocks = [buyer, seller, ord]

    const result = computeTrust(seller.hash, blocks)
    assert.equal(result.inputs.verified_orders, 1)
  })

  it('ignores orders without payment ref', () => {
    const buyer = actor('Restaurant')
    const seller = actor('Supplier')
    const ord = order(buyer.hash, seller.hash, false)
    const blocks = [buyer, seller, ord]

    const result = computeTrust(seller.hash, blocks)
    assert.equal(result.inputs.verified_orders, 0)
  })

  it('computes effective chain depth from distinct authors', () => {
    const farm = actor('Farm')
    const mill = actor('Mill')
    const bakery = actor('Bakery')
    // Both mill and bakery reference farm, with different author_hash
    const b1 = { ...create('transfer.order', { instance_id: 'o1', quantity: 50 }, { seller: farm.hash }), author_hash: mill.hash }
    const b2 = { ...create('transfer.order', { instance_id: 'o2', quantity: 30 }, { seller: farm.hash }), author_hash: bakery.hash }
    const blocks = [farm, mill, bakery, b1, b2]

    const result = computeTrust(farm.hash, blocks)
    assert.equal(result.inputs.chain_depth, 2)
  })

  it('computes account age capped at 365', () => {
    const farm = actor('Old Farm')
    // Simulate old account
    farm.created_at = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()

    const result = computeTrust(farm.hash, [farm])
    assert.ok(result.inputs.account_age <= 365)
    assert.ok(result.inputs.account_age >= 364)
  })

  it('applies custom trust policy weights', () => {
    const farm = actor('Green Acres')
    const authority = actor('FSA')
    const cert = certification(farm.hash, authority.hash, '2027-01-01')
    const blocks = [farm, authority, cert]

    const defaultResult = computeTrust(farm.hash, blocks)
    const customResult = computeTrust(farm.hash, blocks, {
      weights: { authority_certs: 10.0 }
    })

    assert.ok(customResult.score > defaultResult.score)
  })

  it('enforces min_score in policy', () => {
    const farm = actor('New Farm')
    const result = computeTrust(farm.hash, [farm], { min_score: 100 })
    assert.equal(result.meets_minimum, false)
  })

  it('throws on missing actorHash', () => {
    assert.throws(() => computeTrust('', []), /actorHash is required/)
    assert.throws(() => computeTrust(null, []), /actorHash is required/)
  })

  it('throws on non-array blocks', () => {
    assert.throws(() => computeTrust('hash', 'not array'), /blocks must be an array/)
  })
})

describe('connectionDensity', () => {
  it('returns 0 when actors share no refs', () => {
    const a = actor('A')
    const b = actor('B')
    const c = actor('C')
    const d = actor('D')
    const b1 = create('transfer.order', { instance_id: 'x1', q: 1 }, { buyer: a.hash, seller: c.hash })
    const b2 = create('transfer.order', { instance_id: 'x2', q: 1 }, { buyer: b.hash, seller: d.hash })
    const density = connectionDensity(a.hash, b.hash, [b1, b2])
    assert.equal(density, 0)
  })

  it('returns > 0 when actors share refs', () => {
    const a = actor('A')
    const b = actor('B')
    const shared = actor('Shared Supplier')
    const b1 = create('transfer.order', { instance_id: 'x1', q: 1 }, { buyer: a.hash, seller: shared.hash })
    const b2 = create('transfer.order', { instance_id: 'x2', q: 1 }, { buyer: b.hash, seller: shared.hash })
    const density = connectionDensity(a.hash, b.hash, [b1, b2])
    assert.ok(density > 0)
  })

  it('returns 0 for null actors', () => {
    assert.equal(connectionDensity(null, 'b', []), 0)
    assert.equal(connectionDensity('a', null, []), 0)
  })
})

describe('createTrustPolicy', () => {
  it('creates a valid observe.trust_policy block', () => {
    const policy = createTrustPolicy('UK Organic', { authority_certs: 5.0 }, {
      required_authorities: ['fsa_hash'],
      min_score: 10
    })
    assert.equal(policy.type, 'observe.trust_policy')
    assert.equal(policy.state.name, 'UK Organic')
    assert.deepEqual(policy.state.weights, { authority_certs: 5.0 })
    assert.deepEqual(policy.state.required_authorities, ['fsa_hash'])
    assert.equal(policy.state.min_score, 10)
  })

  it('creates minimal policy without optional fields', () => {
    const policy = createTrustPolicy('Basic', { peer_reviews: 2.0 })
    assert.equal(policy.type, 'observe.trust_policy')
    assert.equal(policy.state.name, 'Basic')
    assert.equal(policy.state.required_authorities, undefined)
  })
})
