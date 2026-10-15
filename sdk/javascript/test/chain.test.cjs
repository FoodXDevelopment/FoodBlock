const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// FoodBlock 1.6 §1 (a key's own chain) and the causal past (every block reachable through refs).
const block = (hash, seq, prev, extra = {}) => ({ hash, type: 'observe', state: { seq, ...extra }, refs: { prev } })
const g = 'g'.repeat(64)

test('nextLink: a key starts after the block that brought it in, then counts on', () => {
  assert.deepEqual(fb.nextLink(null, g), { seq: 1, prev: g })
  assert.deepEqual(fb.nextLink(block('a', 1, g), g), { seq: 2, prev: 'a' })
  assert.throws(() => fb.nextLink(null), /brought the key in/)
})

test('checkChain: gaps show what is missing; two blocks with one seq are an equivocation; a wrong prev breaks it', () => {
  const a = block('a', 1, g), b = block('b', 2, 'a'), d = block('d', 4, 'c')
  assert.deepEqual(fb.checkChain([a, b], g), { head: b, length: 2, gaps: [], equivocations: [], broken: [], ok: true })
  assert.deepEqual(fb.checkChain([a, b, d], g).gaps, [3])
  assert.deepEqual(fb.checkChain([a, b, block('x', 2, 'a')], g).equivocations, [['b', 'x']])
  assert.deepEqual(fb.checkChain([a, block('y', 2, g)], g).broken, ['y'])
})

test('causal past and order: causes first through every ref; no clock is read', () => {
  const h = (c) => c.repeat(64)
  const early = { hash: h('b'), state: { at: '2020-01-01T00:00:00.000Z' }, refs: {} }, late = { hash: h('a'), state: { at: '2030-01-01T00:00:00.000Z' }, refs: {} }
  assert.deepEqual(fb.causalOrder([early, late]).map((x) => x.hash), [h('a'), h('b')], 'unrelated blocks are only listed, by hash, whatever time they claim')
  const offer = { hash: h('c'), refs: {} }, answer = { hash: h('0'), refs: { answers: h('c') } }, about = { hash: h('1'), refs: { subject: h('0') } }
  assert.deepEqual(fb.causalOrder([about, answer, offer]).map((x) => x.hash), [h('c'), h('0'), h('1')])
  assert.deepEqual([...fb.pastOf(about, [about, answer, offer])].sort(), [h('0'), h('c')])
  assert.equal(fb.sees(about, offer, [about, answer, offer]), true)
})
