const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// folds.md, promises.md: the stage of a promise, what a transfer gives and whether its signer backs it, where to pay
// someone, and what is to come back. Each world is signed here, block by block, by people with their own keys.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
function world() {
  const people = {}, blocks = []
  let n = 1
  for (const name of ['ann', 'bob']) {
    const keys = fb.generateKeypair(), g = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(0) })
    people[name] = { keys, id: g.hash }
    blocks.push(g)
  }
  const w = (who, type, state, refs) => {
    const block = fb.write(type, state, refs, { audience: 'public', at: at(n++), author: people[who].id, key: people[who].keys, blocks })
    blocks.push(block)
    return block
  }
  return { people, blocks, w }
}

test('a promise moves through its stages by signed answers, never by its own word', () => {
  const { people, blocks, w } = world()
  const eggs = w('ann', 'thing', { kind: 'eggs', pack: fb.amount('6', '{egg}') }, {})
  const offer = w('ann', 'promise', { terms: { lines: [{ id: 'eggs', what: eggs.hash, quantity: fb.amount('6', '{egg}') }] } }, { from: people.ann.id, to: people.bob.id })
  assert.equal(fb.promiseStage(offer, blocks).stage, 'offered')
  w('bob', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const accepted = fb.promiseStage(offer, blocks)
  assert.deepEqual([accepted.stage, accepted.lines[0].needed], ['accepted', fb.amount('6', '{egg}')])
})

test('the fold reads no clock: expired is a view, and the same blocks give the same stage', () => {
  const { people, blocks, w } = world()
  const offer = w('ann', 'promise', { terms: { lines: [{ id: 'eggs', what: people.ann.id, quantity: fb.amount('1', '{egg}') }], expires: at(100) } }, { from: people.ann.id, to: people.bob.id })
  assert.equal(fb.promiseStage(offer, blocks).stage, 'offered')
  assert.equal(fb.promiseView(offer, blocks, { now: at(50) }).stage, 'offered')
  assert.equal(fb.promiseView(offer, blocks, { now: '2099-01-01T00:00:00.000Z' }).stage, 'expired')
})

test('gives and backed: a transfer moves what the terms say, and its signer backs it', () => {
  const { people, blocks, w } = world()
  const eggs = w('ann', 'thing', { kind: 'eggs' }, {})
  const offer = w('ann', 'promise', { terms: { lines: [{ id: 'eggs', what: eggs.hash, quantity: fb.amount('6', '{egg}') }] } }, { from: people.ann.id, to: people.bob.id })
  w('bob', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const deed = w('ann', 'transfer', { amount: fb.amount('6', '{egg}') }, { what: eggs.hash, to_owner: people.bob.id, for: offer.hash })
  assert.deepEqual(fb.gives(offer, people.ann.id, blocks).gives.map((line) => [line.to, line.amount]), [[people.bob.id, fb.amount('6', '{egg}')]])
  assert.deepEqual(fb.backed(deed, people.ann.id, blocks).backed, true)
  assert.deepEqual(fb.backedAll(people.ann.id, blocks)[deed.hash].backed, true)
})

test('what is to come back is `to_come`, asked as toComeBack', () => {
  const { people, blocks, w } = world()
  assert.deepEqual(fb.toComeBack(people.ann.id, blocks), { to_come: [] })
  assert.deepEqual(fb.fold.toComeBack(people.bob.id, blocks), { to_come: [] })
  assert.deepEqual(Object.keys(fb.fold.toComeBack(people.ann.id, blocks)), ['to_come'])
})

test('where to pay me: the head of her account words, a list of destinations', () => {
  const { people, blocks, w } = world()
  assert.equal(fb.fold.accountOf(people.ann.id, blocks), null, 'no account word: null')
  const first = w('ann', 'observe', { kind: 'account', destinations: [{ destination: 'till 123456', by: people.ann.id }] }, {})
  const head = fb.fold.accountOf(people.ann.id, blocks)
  assert.deepEqual([head.who, head.destinations, head.hash], [people.ann.id, [{ destination: 'till 123456', by: people.ann.id }], first.hash])
  const second = w('ann', 'observe', { kind: 'account', destinations: [{ destination: 'stall', by: people.ann.id }, { destination: 'till 123456', by: people.bob.id }] }, {})
  assert.deepEqual(fb.fold.accountOf(people.ann.id, blocks).destinations.map((one) => one.destination), ['stall', 'till 123456'], 'a new word replaces the old')
  assert.equal(fb.fold.accountOf(people.ann.id, blocks).hash, second.hash)
})

test('no reader\'s clock on conditions, rulings, ownership or pots (folds.md, What each fold returns)', () => {
  const { people, blocks, w } = world()
  const eggs = w('ann', 'thing', { kind: 'eggs' }, {})
  // ownership and pot take no clock; the view keeps the reader's clock
  assert.equal(fb.fold.ownership.length, 2)
  assert.equal(fb.fold.pot.length, 2)
  assert.equal(fb.fold.rulingReleases.length, 2)
  assert.deepEqual(fb.fold.ownership(eggs, blocks), fb.fold.ownershipView(eggs, blocks, { now: '2099-01-01T00:00:00.000Z' }))
  // a condition is read for a block (or for every block given, with null): a signal by Bob about Ann holds once his word is in its past
  const cond = { signal: 'ready', by: { names: [people.bob.id], needed: 1 }, subject: people.ann.id }
  const before = w('ann', 'observe', { kind: 'note', text: 'before' }, {})
  assert.equal(fb.strangers.conditionHolds(cond, blocks, null), false)
  const ready = w('bob', 'observe', { kind: 'ready' }, { subject: people.ann.id })
  assert.equal(fb.strangers.conditionHolds(cond, blocks), true, 'null: every block given')
  assert.equal(fb.strangers.conditionHolds(cond, blocks, before.hash), false, 'the signal is not in the past of a block signed before it')
  const after = w('ann', 'observe', { kind: 'note', text: 'after' }, { after: [ready.hash] })
  assert.equal(fb.strangers.conditionHolds(cond, blocks, after), true)
})
