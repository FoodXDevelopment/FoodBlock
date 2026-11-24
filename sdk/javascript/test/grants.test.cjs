const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
// Grants: the ops that answer from blocks alone (`meter`, `worst_case`, `lowest_offer`, `backed`, `keeps_to`,
// `why_not_under`). The world is the oracle's base world W (spec/oracle/stories/grants): Amara's want, her grant to her AI with
// a limit of 210 GBP on that want, her AI's own line as the meter.
const L = require('../../../spec/oracle/stories/grants/lib.cjs')
const world = () => {
  const W = L.baseWorld({ meter: 'own' })
  const H1 = W.offer(W.harry, 20.5, {}, 'H1'), I1 = W.accept(H1, 205, 'I1')
  return { W, H1, I1, blocks: W.w.blocks }
}

test('why_not_under: [] for a block under her grant; a code for a side the grant does not admit', () => {
  const { W, I1, blocks } = world()
  assert.deepEqual(fb.grant.whyNotUnder(I1, blocks), [])
  const R1 = W.offer(W.ravi, 20.5, {}, 'R1'), I2 = W.accept(R1, 205, 'I2')
  assert.equal(fb.grant.whyNotUnder(I2, W.w.blocks)[0].code, 'not_live')
})

test('meter: an accept draws its total on the grant\'s line, and what is left of the limit is shown', () => {
  const { W, I1, blocks } = world()
  const m = fb.grant.meter(W.G, blocks, I1)
  assert.deepEqual([m.fits, m.why, m.line], [true, null, 'own'])
  const gbp = (rows) => rows.filter((r) => r.of === W.G.hash).map((r) => r.amount.value)
  assert.deepEqual(gbp(m.draws.filter((d) => d.block === I1.hash)), ['205'])
  assert.deepEqual(gbp(m.left), ['5'])
  assert.deepEqual(m.comes_back, [])
})

test('worst_case: at_most is the limit, per kind; lowest_offer is pending with no deadline reached', () => {
  const { W, blocks } = world()
  const wc = fb.grant.worstCase(W.G, blocks)
  assert.deepEqual(wc.at_most, [{ value: '210', unit: 'GBP' }])
  assert.deepEqual(wc.on.map((o) => [o.promise, o.side]), [[W.A1.hash, 'to']])
  assert.deepEqual(wc.sides.length, 3)
  const lo = fb.grant.lowestOffer(W.G, blocks)
  assert.deepEqual([lo.offer, lo.received, lo.why], [null, null, 'pending'])
})

test('backed: her tool\'s accept is backed by her, the chain naming the block and its grant', () => {
  const { W, I1, blocks } = world()
  const b = fb.backed(I1, W.amara.id, blocks)
  assert.equal(b.backed, true)
  assert.deepEqual(b.chain, [I1.hash, W.G.hash])
})

test('keeps_to: an offer inside her want keeps to it; a counter that adds a place does not, and why names the path', () => {
  const { W, H1, blocks } = world()
  assert.deepEqual(fb.grant.keepsTo(H1, W.A1, blocks), { keeps: true, why: null })
  const where = { lat: '51.5', lon: '-0.1' }
  const C1 = L.T(W.harry.write('promise', { terms: H1.state.terms, where }, { ...H1.refs, answers: H1.hash, for: H1.hash }), 'C1')
  assert.deepEqual(fb.grant.keepsTo(C1, H1, W.w.blocks), { keeps: false, why: 'state.where' })
})
