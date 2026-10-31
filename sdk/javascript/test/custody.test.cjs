const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.7: held keys (identity.md), the limit is the principal's fence (authority.md), a push's `for` (nodes.md),
// and the earnest profile.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const hash = (label) => require('crypto').createHash('sha256').update(label).digest('hex')

test('custody: a custodial genesis, a custodian-signed block with its channel, and take your keys', () => {
  const held = fb.generateKeypair(), recovery = fb.generateKeypair(), own = fb.generateKeypair()
  const custodian = hash('the co-op')
  const g = fb.identity.genesis(held, { kind: 'person', audience: 'public', recoveryKey: recovery.public_key_sign, reach: 'P30D', at: at(0), custodian })
  assert.equal(g.state.custodian, custodian)
  assert.deepEqual(fb.refusals(g.type, g.state, g.refs), [])
  assert.deepEqual(fb.refusals('actor', { ...g.state, custodian: 'co-op' }, {}).map((r) => r.code), ['grammar'], 'a custodian is an id')
  const said = fb.write('observe', { kind: 'note', text: 'two trays', channel: 'sms' }, { derives_from: hash('raw sms') }, { audience: 'public', author: g.hash, key: held, held: [g], at: at(1) })
  assert.equal(said.state.channel, 'sms')
  assert.equal(fb.write('observe', { kind: 'note', channel: 'carrier pigeon' }, {}, { audience: 'public', author: g.hash, key: held, held: [g], at: at(1) }).state.channel, 'carrier pigeon', 'a channel is an open label')
  const moved = fb.identity.takeKeys(g.hash, own.public_key_sign, { private_key: held.private_key, last: said }, { heldKey: held.public_key_sign, countedTo: said.hash, at: at(2) })
  assert.equal(moved.state.custodian, undefined)
  assert.deepEqual(fb.identity.keysOf(g.hash, [g, said, moved]).sort(), [held.public_key_sign, own.public_key_sign].sort())
})

test('the limit is the principal\'s fence: an observe of kind limit for the grant, sealed to the agent alone', () => {
  const principal = fb.generateKeypair(), agent = hash('the agent'), grant = hash('the grant')
  const g = fb.identity.genesis(principal, { kind: 'person', audience: 'public', at: at(0) })
  const fence = fb.grant.limitFence(grant, agent, { limit: fb.money(5000, 'GBP'), every: 'P7D' })
  const block = fb.write(fence.type, fence.state, fence.refs, { author: g.hash, key: principal, held: [g], audience: fence.audience, at: at(1) })
  assert.equal(block.refs.for, grant)
  assert.ok(Array.isArray(block.state.audience) && block.state.audience.length === 1)
  assert.ok(fb.findsSelf(block, agent, block.salts[agent]))
  assert.equal(fb.grant.withinLimit(block, fb.money(3000, 'GBP'), 2000), true)
  assert.equal(fb.grant.withinLimit(block, fb.money(3001, 'GBP'), 2000), false)
  assert.equal(fb.grant.withinLimit(block, fb.money(1, 'EUR'), 0), false)
})

test('push `for` is a list; earnest are a profile: { money, holder }', () => {
  const one = hash('a sealed copy'), a = hash('a'), b = hash('b')
  assert.deepEqual(fb.sync.pushRequest([], { [one]: [a, b] }).for, { [one]: [a, b] })
  assert.deepEqual(fb.sync.recipientsOf({ [one]: [a] }, one), [a])
  assert.deepEqual(fb.sync.recipientsOf({}, one), [])
  assert.equal(fb.strangers.earnestShapeOk({ money: fb.money(100, 'GBP'), holder: b }), true)
  assert.equal(fb.strangers.earnestShapeOk({ money: fb.money(100, 'GBP') }), false)
  assert.equal(fb.strangers.earnestShapeOk({ money: fb.money(100, 'GBP'), holder: 'x' }), false)
})
