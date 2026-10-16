// Checks spec/profiles/epcis/vectors.json: `node spec/profiles/epcis/run.cjs`.
// Every block hashes, is signed and passes the write check against the blocks before it. Every EPCIS event makes the blocks
// recorded for it, and its block makes the event again. The folds and the 24-hour traceback give what the file says.
const assert = require('assert/strict')
const fb = require('../../../sdk/javascript/src/index.cjs')
const { call } = require('../../../sdk/javascript/src/core.cjs')
const A = require('./adapter.cjs')
const V = require('./vectors.json')

let pass = 0, fail = 0
const attempt = (name, fn) => { try { fn(); console.log(`✓ ${name}`); pass++ } catch (error) { console.log(`✗ ${name} (${String(error.message).split('\n')[0]})`); fail++ } }
const pub = (signer) => V.keys[signer].public_key_sign
const full = (b) => ({ hash: b.hash, ...b.block, signature: b.signature })
const held = V.blocks.map(full)
const parties = Object.fromEntries(Object.entries(V.parties).map(([pgln, p]) => [pgln, p.id]))
const byName = new Map(V.blocks.map((b, i) => [b.name, i]))

for (const [i, b] of V.blocks.entries()) {
  attempt(`block: ${b.name}`, () => {
    assert.equal(fb.hash(b.block.type, b.block.state, b.block.refs), b.hash)
    assert.ok(fb.verify(held[i], b.signature, pub(b.signer)))
    assert.deepEqual(fb.valid(held[i], held.slice(0, i)), [])
    assert.deepEqual(fb.refusals(b.block.type, b.block.state, b.block.refs, held.slice(0, i)), [])
  })
}
for (const n of V.negatives) {
  attempt(`refused: ${n.name}`, () => {
    const i = held.findIndex((b) => b.hash === n.block), { schema: _s, ...refs } = held[i].refs
    assert.deepEqual([...new Set(fb.refusals(held[i].type, held[i].state, refs, held.slice(0, i)).map((x) => x.code))], n.codes)
  })
}

// An event makes its blocks: state and refs, apart from the chain (author, prev, seq, audience).
const bare = (b, hashOf) => {
  const { seq, audience, ...state } = b.state
  const { author, prev, after, ...refs } = b.refs
  return { type: b.type, state, refs }
}
for (const e of V.events) {
  const own = e.blocks.map((h) => held.find((b) => b.hash === h))
  const before = held.slice(0, e.before)
  attempt(`EPCIS to FoodBlock: ${e.name}`, () => {
    const drafts = A.fromEvent(e.event, { held: before, parties, schema: V.schema })
    const made = {}
    drafts.forEach((d, i) => { made[d.role] = own[i].hash })
    const resolve = (v) => (typeof v === 'string' && v.startsWith('$') ? made[v.slice(1)] : Array.isArray(v) ? v.map(resolve) : v)
    drafts.forEach((d, i) => {
      const want = { type: d.type, state: d.state, refs: Object.fromEntries(Object.entries(d.refs).map(([k, v]) => [k, resolve(v)])) }
      const got = bare(own[i])
      assert.deepEqual(got.type, want.type)
      assert.deepEqual(got.state, want.state, `${d.role} state`)
      assert.deepEqual(got.refs, want.refs, `${d.role} refs`)
    })
  })
  if (e.roundtrip) {
    attempt(`FoodBlock to EPCIS: ${e.name}`, () => {
      const upto = held.slice(0, held.findIndex((b) => b.hash === e.blocks[e.blocks.length - 1]) + 1)
      assert.deepEqual(A.toEvent(own[0], { held: upto, parties }), e.event)
    })
  }
}

for (const f of V.folds) {
  attempt(`fold: ${f.name}`, () => {
    const thing = held.find((b) => b.hash === f.thing)
    const context = f.held === 'all' ? held : held.slice(0, byName.get('aggregation: the kits out of the tote'))
    assert.deepEqual(call(f.op, thing, context), f.expect)
  })
}

// The 24-hour traceback: from a lot code, the lots and the rows of the sortable record.
for (const t of V.traces) {
  attempt(`traceback: ${t.name}`, () => {
    const got = A.trace(held, t.tlc, t.direction)
    assert.deepEqual(got, t.expect)
    for (const row of got.rows) assert.ok(row.cte && row.when && row.party)
    const times = got.rows.map((r) => r.when)
    assert.deepEqual(times, [...times].sort(), 'rows are in time order')
  })
}
attempt('recall: the grant is valid and answers inside a day', () => {
  const i = held.findIndex((b) => b.hash === V.recall.grant)
  assert.deepEqual(fb.valid(held[i], held.slice(0, i)), [])
  assert.equal(held[i].state.kind, 'recall')
  assert.equal(held[i].state.answer_within, V.recall.answer_within)
  assert.equal(call('compare_durations', V.recall.answer_within, 'P1D', '2026-10-14T00:00:00.000Z'), 0)
})
for (const p of V.recall.pulls) attempt(`recall: ${p.name}`, () => assert.equal(call('matches', held.find((b) => b.hash === p.block), V.recall.filter, []), p.expect))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
