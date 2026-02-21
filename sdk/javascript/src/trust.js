/**
 * FoodBlock Trust Computation (Section 6.3)
 *
 * Computes a trust score for an actor from five inputs derived
 * from the FoodBlock graph. Supports custom trust policies.
 */

const DEFAULT_WEIGHTS = {
  authority_certs: 3.0,
  peer_reviews: 1.0,
  chain_depth: 2.0,
  verified_orders: 1.5,
  account_age: 0.5
}

/**
 * Compute trust score for an actor.
 *
 * @param {string} actorHash - Hash of the actor to score
 * @param {object[]} blocks - All known blocks (or relevant subset)
 * @param {object} [policy] - Trust policy override (weights, required_authorities, min_score)
 * @returns {object} { score, inputs, meets_minimum }
 */
function computeTrust(actorHash, blocks, policy = {}) {
  if (!actorHash || typeof actorHash !== 'string') {
    throw new Error('FoodBlock: actorHash is required')
  }
  if (!Array.isArray(blocks)) {
    throw new Error('FoodBlock: blocks must be an array')
  }

  const weights = { ...DEFAULT_WEIGHTS, ...(policy.weights || {}) }
  const now = Date.now()

  const inputs = {
    authority_certs: countAuthorityCerts(actorHash, blocks, policy.required_authorities),
    peer_reviews: computePeerReviews(actorHash, blocks),
    chain_depth: computeChainDepth(actorHash, blocks),
    verified_orders: countVerifiedOrders(actorHash, blocks),
    account_age: computeAccountAge(actorHash, blocks, now)
  }

  const score =
    (inputs.authority_certs * weights.authority_certs) +
    (inputs.peer_reviews.weighted_score * weights.peer_reviews) +
    (inputs.chain_depth * weights.chain_depth) +
    (inputs.verified_orders * weights.verified_orders) +
    (inputs.account_age * weights.account_age)

  const minScore = policy.min_score || 0
  const meetsMinimum = score >= minScore

  return { score, inputs, meets_minimum: meetsMinimum }
}

/**
 * Count valid authority certifications for an actor.
 */
function countAuthorityCerts(actorHash, blocks, requiredAuthorities) {
  let count = 0
  for (const b of blocks) {
    if (b.type !== 'observe.certification') continue
    if (b.refs?.subject !== actorHash) continue
    if (b.state?.valid_until && new Date(b.state.valid_until) < new Date()) continue
    count++
  }
  return count
}

/**
 * Compute peer review score with independence weighting.
 * Returns { count, avg_score, weighted_score }.
 */
function computePeerReviews(actorHash, blocks) {
  const reviews = []
  for (const b of blocks) {
    if (b.type !== 'observe.review') continue
    if (b.refs?.subject !== actorHash) continue
    if (typeof b.state?.rating !== 'number') continue
    reviews.push(b)
  }

  if (reviews.length === 0) {
    return { count: 0, avg_score: 0, weighted_score: 0 }
  }

  let totalWeighted = 0
  let totalWeight = 0

  for (const review of reviews) {
    const reviewerHash = review.refs?.author || review.author_hash
    const density = connectionDensity(reviewerHash, actorHash, blocks)
    const weight = 1 - density
    totalWeighted += (review.state.rating / 5.0) * weight
    totalWeight += weight
  }

  const avgScore = reviews.reduce((sum, r) => sum + r.state.rating, 0) / reviews.length
  const weightedScore = totalWeight > 0 ? totalWeighted / totalWeight * reviews.length : 0

  return { count: reviews.length, avg_score: avgScore, weighted_score: weightedScore }
}

/**
 * Compute effective chain depth: count of distinct author_hash values
 * in the actor's provenance chains (blocks that reference this actor).
 */
function computeChainDepth(actorHash, blocks) {
  const authors = new Set()
  for (const b of blocks) {
    if (!b.refs) continue
    const refsActor = Object.values(b.refs).some(v =>
      v === actorHash || (Array.isArray(v) && v.includes(actorHash))
    )
    if (refsActor && b.author_hash) {
      authors.add(b.author_hash)
    }
  }
  return authors.size
}

/**
 * Count verified orders (transfer.order with adapter_ref).
 */
function countVerifiedOrders(actorHash, blocks) {
  let count = 0
  for (const b of blocks) {
    if (!b.type?.startsWith('transfer.order')) continue
    if (b.refs?.buyer !== actorHash && b.refs?.seller !== actorHash) continue
    if (b.state?.adapter_ref || b.state?.payment_ref) count++
  }
  return count
}

/**
 * Compute account age in days (capped at 365).
 */
function computeAccountAge(actorHash, blocks, now) {
  for (const b of blocks) {
    if (b.hash === actorHash && b.created_at) {
      const created = new Date(b.created_at).getTime()
      const days = (now - created) / (1000 * 60 * 60 * 24)
      return Math.min(days, 365)
    }
  }
  return 0
}

/**
 * Measure connection density between two actors (Section 6.3 sybil resistance).
 * Returns 0..1 where 0 = no shared refs, 1 = fully connected.
 */
function connectionDensity(actorA, actorB, blocks) {
  if (!actorA || !actorB) return 0

  const refsA = new Set()
  const refsB = new Set()

  for (const b of blocks) {
    if (!b.refs) continue
    const vals = Object.values(b.refs).flat()
    if (vals.includes(actorA)) {
      for (const v of vals) {
        if (v !== actorA) refsA.add(v)
      }
    }
    if (vals.includes(actorB)) {
      for (const v of vals) {
        if (v !== actorB) refsB.add(v)
      }
    }
  }

  if (refsA.size === 0 || refsB.size === 0) return 0

  let shared = 0
  for (const ref of refsA) {
    if (refsB.has(ref)) shared++
  }

  const union = new Set([...refsA, ...refsB]).size
  return union > 0 ? shared / union : 0
}

/**
 * Create a trust policy block.
 *
 * @param {string} name - Policy name
 * @param {object} weights - Custom weights
 * @param {object} [opts] - { required_authorities, min_score, author }
 * @returns {object} The trust policy FoodBlock
 */
function createTrustPolicy(name, weights, opts = {}) {
  const { create } = require('./block')

  const state = { name, weights }
  if (opts.required_authorities) state.required_authorities = opts.required_authorities
  if (opts.min_score !== undefined) state.min_score = opts.min_score

  const refs = {}
  if (opts.author) refs.author = opts.author

  return create('observe.trust_policy', state, refs)
}

module.exports = { computeTrust, connectionDensity, createTrustPolicy, DEFAULT_WEIGHTS }
