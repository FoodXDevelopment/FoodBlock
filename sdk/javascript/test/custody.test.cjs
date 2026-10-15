const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.6 §2 Held keys, §7 the limit is the principal's fence, §10 Push `for` and the admission deposit.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const hash = (label) => require('crypto').createHash('sha256').update(label).digest('hex')

test('custody: a custodial genesis, a custodian-signed block with its channel, and take your keys', () => {
  const coop = fb.generateKeypair(), held = fb.generateKeypair(), recovery = fb.generateKeypair(), own = fb.generateKeypair()
  const custodian = hash('the co-op')
  const g = fb.identity.genesis(held, { recoveryKey: recovery.public_key_sign, at: at(0), custodian })
  assert.equal(g.state.custodian, custodian)
  assert.deepEqual(fb.refusals(g.type, g.state, g.refs), [])
  assert.ok(fb.refusals('actor', { ...g.state, custodian: 'co-op' }, {}).length, 'a custodian is an id')
  const said = fb.write('observe', { kind: 'note', text: 'two trays', channel: 'sms' }, { derives_from: hash('raw sms') }, { author: g.hash, key: held, held: [g], at: at(1) })
  assert.equal(said.state.channel, 'sms')
  assert.throws(() => fb.write('observe', { kind: 'note', channel: 'carrier pigeon' }, {}, { author: g.hash, key: held, held: [g], at: at(1) }), /channel/)
  const moved = fb.identity.takeKeys(g.hash, own.public_key_sign, { private_key: held.private_key, last: said }, { heldKey: held.public_key_sign, lastGood: said.hash, at: at(2) })
  assert.equal(moved.state.custodian, undefined)
  assert.deepEqual(fb.identity.keysOf(g.hash, [g, said, moved]).sort(), [held.public_key_sign, own.public_key_sign].sort())
  const grant = fb.identity.keyGrant(g.hash, own.public_key_sign, { private_key: held.private_key, last: null, broughtIn: g.hash }, { custodian, at: at(3) })
  assert.equal(grant.state.custodian, custodian)
})

test('the limit is the principal\'s fence: an observe of kind limit for the grant, sealed to the agent alone', () => {
  const principal = fb.generateKeypair(), agent = hash('the agent'), grant = hash('the grant')
  const g = fb.identity.genesis(principal, { recoveryKey: fb.generateKeypair().public_key_sign, at: at(0) })
  const fence = fb.grant.limitFence(grant, agent, { limit: fb.money(5000, 'GBP'), per: 'P7D' })
  const block = fb.write(fence.type, fence.state, fence.refs, { author: g.hash, key: principal, held: [g], audience: fence.audience, at: at(1) })
  assert.equal(block.refs.for, grant)
  assert.ok(Array.isArray(block.state.audience) && block.state.audience.length === 1)
  assert.ok(fb.findsSelf(block, agent, block.salts[agent]))
  assert.equal(fb.grant.withinLimit(block, fb.money(3000, 'GBP'), 2000), true)
  assert.equal(fb.grant.withinLimit(block, fb.money(3001, 'GBP'), 2000), false)
  assert.equal(fb.grant.withinLimit(block, fb.money(1, 'EUR')), false)

})

test('push `for` is a list; an older single id reads as a list of one; an admission deposit is { money, holder }', () => {
  const one = hash('a sealed copy'), a = hash('a'), b = hash('b')
  assert.deepEqual(fb.sync.pushRequest([], { [one]: [a, b] }).for, { [one]: [a, b] })
  assert.deepEqual(fb.sync.pushRequest([], { [one]: a }).for, { [one]: [a] })
  assert.deepEqual(fb.sync.recipientsOf({ [one]: a }, one), [a])
  assert.deepEqual(fb.sync.recipientsOf({}, one), [])
  const state = { kind: 'admission', parties: [a], per_stranger: 3, deposit: { money: fb.money(100, 'GBP'), holder: b } }
  const refs = { author: a, prev: a }
  const found = (deposit) => fb.refusals('observe', { seq: 1, at: at(0), audience: 'public', ...state, deposit }, refs).map((x) => x.code)
  assert.deepEqual(found(state.deposit), [])
  assert.deepEqual(found({ money: fb.money(100, 'GBP') }), ['shape'])
  assert.deepEqual(found({ money: { minor: 1.5 }, holder: b }).includes('shape') || found({ money: 5, holder: b }).includes('shape'), true)
  assert.deepEqual(found({ money: fb.money(100, 'GBP'), holder: 'x' }), ['grammar'])
})
