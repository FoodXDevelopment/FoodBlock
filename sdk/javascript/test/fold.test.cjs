const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.9 (folds.md, promises.md): the stage of a promise, what a transfer gives and whether its signer backs it, where to pay
// someone, and what is to come back. Each world is signed here, block by block, by people with their own keys.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
function world() {
  const people = {}, held = []
  let n = 1
  for (const name of ['ann', 'bob']) {
    const keys = fb.generateKeypair(), g = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(0) })
    people[name] = { keys, id: g.hash }
    held.push(g)
  }
  const w = (who, type, state, refs) => {
    const block = fb.write(type, state, refs, { audience: 'public', at: at(n++), author: people[who].id, key: people[who].keys, held })
    held.push(block)
    return block
  }
  return { people, held, w }
}

test('a promise moves through its stages by signed answers, never by its own word', () => {
  const { people, held, w } = world()
  const eggs = w('ann', 'thing', { kind: 'eggs', pack: fb.amount('6', '{egg}') }, {})
  const offer = w('ann', 'promise', { terms: { quantity: fb.amount('6', '{egg}') } }, { from: people.ann.id, to: people.bob.id, what: eggs.hash })
  assert.equal(fb.promiseStage(offer, held).stage, 'offered')
  w('bob', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const accepted = fb.promiseStage(offer, held)
  assert.deepEqual([accepted.stage, accepted.quantity], ['accepted', fb.amount('6', '{egg}')])
})

test('the fold reads no clock: expired is a view, and the same blocks give the same stage', () => {
  const { people, held, w } = world()
  const offer = w('ann', 'promise', { terms: { quantity: fb.amount('1', '{egg}'), expires: at(100) } }, { from: people.ann.id, to: people.bob.id, what: people.ann.id })
  assert.equal(fb.promiseStage(offer, held).stage, 'offered')
  assert.equal(fb.promiseView(offer, held, { now: at(50) }).stage, 'offered')
  assert.equal(fb.promiseView(offer, held, { now: '2099-01-01T00:00:00.000Z' }).stage, 'expired')
})

test('gives and backed: a transfer moves what the terms say, and its signer backs it', () => {
  const { people, held, w } = world()
  const eggs = w('ann', 'thing', { kind: 'eggs' }, {})
  const offer = w('ann', 'promise', { terms: { quantity: fb.amount('6', '{egg}') } }, { from: people.ann.id, to: people.bob.id, what: eggs.hash })
  w('bob', 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const deed = w('ann', 'transfer', { amount: fb.amount('6', '{egg}') }, { what: eggs.hash, to_owner: people.bob.id, for: offer.hash })
  assert.deepEqual(fb.gives(offer, people.ann.id, held).gives.map((line) => [line.to, line.amount]), [[people.bob.id, fb.amount('6', '{egg}')]])
  assert.deepEqual(fb.backed(deed, people.ann.id, held).backed, true)
  assert.deepEqual(fb.backedAll(people.ann.id, held)[deed.hash].backed, true)
})

test('what is to come back is `to_come`, asked as toComeBack (1.9 3c-7: it was owed_back and `owed`)', () => {
  const { people, held, w } = world()
  assert.deepEqual(fb.toComeBack(people.ann.id, held), { to_come: [] })
  assert.deepEqual(fb.fold.toComeBack(people.bob.id, held), { to_come: [] })
  assert.equal(fb.owedBack, undefined)
  assert.equal(fb.fold.owedBack, undefined)
  assert.deepEqual(Object.keys(fb.fold.toComeBack(people.ann.id, held)), ['to_come'])
})

test('where to pay me: the head of her account words, a list of destinations (1.9 3e-8)', () => {
  const { people, held, w } = world()
  assert.equal(fb.fold.accountOf(people.ann.id, held), null, 'no account word: null')
  const first = w('ann', 'observe', { kind: 'account', destinations: [{ destination: 'till 123456', by: people.ann.id }] }, {})
  const head = fb.fold.accountOf(people.ann.id, held)
  assert.deepEqual([head.who, head.destinations, head.hash], [people.ann.id, [{ destination: 'till 123456', by: people.ann.id }], first.hash])
  const second = w('ann', 'observe', { kind: 'account', destinations: [{ destination: 'stall', by: people.ann.id }, { destination: 'till 123456', by: people.bob.id }] }, {})
  assert.deepEqual(fb.fold.accountOf(people.ann.id, held).destinations.map((one) => one.destination), ['stall', 'till 123456'], 'a new word replaces the old')
  assert.equal(fb.fold.accountOf(people.ann.id, held).hash, second.hash)
})

test('stage 5 door ops: no reader\'s clock on conditions, rulings, ownership or pots; the removed ops are gone (05-deals.md, section 11)', () => {
  const { people, held, w } = world()
  for (const gone of ['bidsShown', 'earnestShapeOk', 'earnestPaid', 'owedBack']) {
    assert.equal(fb.fold[gone], undefined, gone)
    assert.equal(fb.strangers[gone], undefined, gone)
    assert.equal(require('../src/door.cjs')[gone], undefined, gone)
  }
  const eggs = w('ann', 'thing', { kind: 'eggs' }, {})
  // ownership and pot take no clock; the view keeps the reader's clock
  assert.equal(fb.fold.ownership.length, 2)
  assert.equal(fb.fold.pot.length, 2)
  assert.equal(fb.fold.rulingReleases.length, 2)
  assert.deepEqual(fb.fold.ownership(eggs, held), fb.fold.ownershipView(eggs, held, { now: '2099-01-01T00:00:00.000Z' }))
  // a condition is read for a block (or for every block held, with null): a signal by Bob about Ann holds once his word is in its past
  const cond = { signal: 'ready', by: [people.bob.id], signers: 1, subject: people.ann.id }
  const before = w('ann', 'observe', { kind: 'note', text: 'before' }, {})
  assert.equal(fb.strangers.conditionHolds(cond, held, null), false)
  const ready = w('bob', 'observe', { kind: 'ready' }, { subject: people.ann.id })
  assert.equal(fb.strangers.conditionHolds(cond, held), true, 'null: every block held')
  assert.equal(fb.strangers.conditionHolds(cond, held, before.hash), false, 'the signal is not in the past of a block signed before it')
  const after = w('ann', 'observe', { kind: 'note', text: 'after' }, { after: [ready.hash] })
  assert.equal(fb.strangers.conditionHolds(cond, held, after), true)
})
