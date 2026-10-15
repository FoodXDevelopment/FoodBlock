const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.6 §11: the folds, as spec/vectors.json states them (spec/run-vectors.cjs runs every case; these name
// the rules that matter most). Every fold reads blocks as 1.6, whatever words they were written in.
const vectors = require('../../../spec/vectors.json')
const held = (v) => v.blocks.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))
const stage = (name) => { const v = vectors.folds.promises.find((one) => one.name.startsWith(name)); return fb.promiseStage(held(v).find((b) => b.hash === v.first), held(v), v.now ? { now: v.now } : {}) }

test('a promise moves through its stages by signed answers and counted transfers, never by its own word', () => {
  assert.equal(stage('a one-to-one offer').stage, 'offered')
  assert.equal(stage('expired').stage, 'expired')
  assert.equal(stage('an accept beats').stage, 'accepted')
  assert.equal(stage("a withdrawal in the accept's").stage, 'stopped')
  assert.equal(stage("a giver's own transfer").stage, 'accepted', 'a deed is counted only once the receiver answers it')
  assert.equal(stage('partial delivery').stage, 'underway')
  assert.equal(stage('done').stage, 'done')
  assert.equal(stage('reversed').stage, 'reversed')
  assert.equal(stage('an accept to an open offer').stage, 'offered', 'only the offerer\'s allocation binds an open offer')
})

test('circles, audiences, places and owners', () => {
  const circle = vectors.folds.circles[0], state = fb.circleState(circle.circle, held(circle))
  assert.deepEqual(Object.keys(state.members).sort(), Object.keys(circle.expected.members).sort())
  const things = vectors.folds.things[0], blocks = held(things)
  for (const c of things.where) assert.deepEqual(fb.whereNow(blocks.find((b) => b.hash === c.thing), blocks), c.places, c.name)
  for (const c of things.owners) assert.equal(fb.ownerOf(blocks.find((b) => b.hash === c.thing), blocks), c.owner, c.name)
})

test("a successor's trigger waits, and the person may stop it; a circle's key moves by epoch", () => {
  for (const v of vectors.folds.successors) {
    const blocks = held(v), got = fb.fold.successorState(blocks.find((b) => b.hash === v.grant), blocks, { now: v.now, arrivedAt: (hash) => v.arrivals[hash] })
    assert.equal(got.fired, v.expected.fired, v.name)
  }
  for (const v of vectors.folds.rekeys) assert.deepEqual(fb.fold.circleKey(v.circle, held(v)).keys, v.expected.keys, v.name)
})
