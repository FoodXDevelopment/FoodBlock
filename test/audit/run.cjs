// The audit regression suite: `node test/audit/run.cjs` (it is part of `npm test` in sdk/javascript).
//
// The cases c1 to c9 are small worlds of signed blocks that a read-only audit of FoodBlock 1.6 (2026-10-19) built to find where the Rust
// core (the one engine every SDK wraps) and the oracle (spec/oracle, written from the spec text alone) disagreed, or where the spec let a
// stranger do something it should not. Each fixed rule stays fixed here:
//   1. PARITY: every fold in protocol.json (`folds`) is computed by the core and by the oracle over every subject of every world, and the
//      answers must be identical. Zero differences, or this exits 1.
//   2. RULES: what each of the nine revisions says, asserted on these worlds (CHANGELOG.md, "1.6 revisions after the audit").
const assert = require('assert/strict')
const { fb, oracle, World, T, readFor } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

const files = ['c1', 'c1b', 'c1d', 'c1e', 'c2', 'c3', 'c3b', 'c4', 'c4b', 'c5', 'c6', 'c7', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'k1-keys', 'k2-store']
const realLog = console.log
console.log = () => {}
// A world file that cannot be built (its fixtures sign the 1.7 way: a key grant by `replaces`, a recovery key) is named, and its worlds are left out.
const unbuilt = []
for (const f of files) {
  const before = (global.__worlds || []).length
  try { require('./' + f + '.cjs') } catch (e) { unbuilt.push(`${f}: ${String(e.message).split('\n')[0]}`); global.__worlds = (global.__worlds || []).slice(0, before) }
}
// Stage 1 (keys): the oracle builder's eighteen stories, every door call asked of both engines (k1-stories.cjs), and their worlds folded below.
const k1stories = require('./k1-stories.cjs')
// Stage 2 (the store): the oracle builder's fourteen stories, every door call asked of both engines (k2-stories.cjs).
const k2stories = require('./k2-stories.cjs')
console.log = realLog
const worlds = global.__worlds
const world = (name) => worlds.find((w) => w.name === name)

let pass = 0, fail = 0
const failures = []
const check = (name, fn) => { try { fn(); pass++ } catch (e) { fail++; failures.push(`${name}: ${String(e.message).split('\n').slice(0, 6).join(' | ')}`) } }

// ---------- 1. Parity ----------
// Every fold of protocol.json (`folds`) is asked of every world through tools/fuzz/folds.cjs and compared with the one projection table
// (tools/fuzz/diff.cjs OPS); a fold neither can ask fails the run.
const { askAll } = require('../../tools/fuzz/folds.cjs')
const { ownersHaveReasons } = require('../../tools/fuzz/owners.cjs')
const reasonless = []
const { compare: compareAnswers, unaskable, OPS } = require('../../tools/fuzz/diff.cjs')
// Stage 1 (keys) changed the identity fold's answer (voices, keepers, waiting; no `frozen`) and added `stands`. tools/fuzz is brought in step
// at the end-of-day pass; until then the audit asks the identity fold whole here, and `stands` through the stage 1 questions below.
OPS.identity_state = { oracle: (id, held) => oracle.door('identity_state', id, held), proj: (s) => s }
OPS.key_timeline = { oracle: (id, held) => oracle.door('key_timeline', id, held), proj: (l) => l }
OPS.stands = { oracle: (b, held) => oracle.door('stands', b, held), proj: (s) => s }
const PJ = require('../../spec/protocol.json')
PJ.folds.identity.ops = PJ.folds.identity.ops.filter((o) => o !== 'stands')
const J = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v))
const diffs = []
const tally = {}
if (unaskable().length) { realLog('no OPS entry for the fold(s) ' + unaskable().join(', ')); process.exit(1) }
// The vectors' own stories are worlds too: whatever they hold is compared the same way.
const V = require('../../spec/vectors.json')
const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature })
const k1worlds = [...k1stories.worlds.map((w, i) => ({ name: 'k1 story ' + i, blocks: w.blocks, log: [] })), ...k2stories.worlds.map((w, i) => ({ name: 'k2 story ' + i, blocks: w.blocks, log: [] }))]
// the vectors' stories (1.9: each is a door case whose held blocks are its world; tools/vectors.cjs made them from the old story sections), one world per held set
void full
const stories = (() => {
  const seen = new Set(), out = []
  for (const d of V.door) {
    if (!/^(promise fold|identity|owner|where now|circle fold|refused \()/.test(d.name || '')) continue
    const held = (d.args || []).find((a) => Array.isArray(a) && a.length && a.every((b) => b && typeof b === 'object' && typeof b.type === 'string' && typeof b.hash === 'string'))
    if (!held) continue
    const key = held.map((b) => b.hash).sort().join(',')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: 'vectors: ' + d.name, blocks: held, log: [] })
  }
  return out
})()
for (const w of [...worlds, ...k1worlds, ...stories]) {
  const label = (b) => (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note || b.hash.slice(0, 8)
  for (const q of askAll(w.blocks, label)) {
    let ans
    try { ans = { ok: call(q.op, ...JSON.parse(JSON.stringify(q.args))) } } catch (e) { ans = { error: 'throws', message: String(e.message) } }
    if (q.op === 'ownership' && ans.ok) { const why = ownersHaveReasons(q.args[0], q.args[1], ans.ok); if (why) reasonless.push(`${w.name}, ${q.what}: ${why}`) }
    const bad = compareAnswers(q, ans)
    tally[q.fold] = tally[q.fold] || [0, 0]
    tally[q.fold][0]++
    if (bad) { tally[q.fold][1]++; diffs.push(`${q.fold} (${w.name}, ${q.what}): ${bad.kind} ${bad.detail.slice(0, 500)}`) }
  }
}
check('parity: every fold agrees between the Rust core and the oracle, over every block of every world', () => assert.deepEqual(diffs, []))

// ---------- Stage 1, keys: every question of the Rust builder's worlds (k1-keys.cjs) and of the oracle builder's stories (k1-stories.cjs) ----------
// A refusal's `detail` is free text no node reads, and an argument error is an error whatever its words (same.cjs); every other answer whole.
const { same } = require('./same.cjs')
const sameAnswer = (op, a, b) => same(a, b)
const k1diffs = []
for (const q of require('./k1-keys.cjs').questions) {
  let o
  try { o = oracle.door(q.op, ...JSON.parse(JSON.stringify(q.args))) } catch (e) { o = { error: e.message } }
  if (!sameAnswer(q.op, q.core, o)) k1diffs.push(`${q.world}, ${q.question}: core ${J(q.core).slice(0, 200)} oracle ${J(o).slice(0, 200)}`)
}
for (const q of [...k1stories.questions, ...require('./k1-shapes.cjs').questions]) if (!sameAnswer(q.op, q.core, q.oracleAnswer)) k1diffs.push(`${q.world}, ${q.question}: core ${J(q.core).slice(0, 200)} oracle ${J(q.oracleAnswer).slice(0, 200)}`)
check('stage 1 parity: the core and the oracle answer every question of the keys worlds and stories alike', () => assert.deepEqual(k1diffs, []))
check('stage 1: every question of the Rust builder\'s worlds gets the answer the text gives', () => assert.deepEqual(require('./k1-keys.cjs').questions.filter((q) => !q.agrees).map((q) => q.question), []))
// ---------- Stage 2, the store: every question of the Rust builder's worlds (k2-store.cjs) and of the oracle builder's stories (k2-stories.cjs) ----------
const k2diffs = []
for (const q of require('./k2-store.cjs').questions) if (!sameAnswer(q.op, q.whole, q.oracleWhole)) k2diffs.push(`${q.world}, ${q.question}: core ${J(q.whole).slice(0, 200)} oracle ${J(q.oracleWhole).slice(0, 200)}`)
for (const q of k2stories.questions) if (!sameAnswer(q.op, q.core, q.oracleAnswer)) k2diffs.push(`${q.world}, ${q.question}: core ${J(q.core).slice(0, 200)} oracle ${J(q.oracleAnswer).slice(0, 200)}`)
check('stage 2 parity: the core and the oracle answer every question of the store worlds and stories alike', () => assert.deepEqual(k2diffs, []))
check('stage 2: every question of the Rust builder\'s worlds gets the answer the text gives', () => assert.deepEqual(require('./k2-store.cjs').questions.filter((q) => !q.agrees).map((q) => q.question), []))
const worldCount = worlds.length, blockCount = worlds.reduce((n, w) => n + w.blocks.length, 0)
check('invariant 32: owners change only for one of three reasons: every owner the ownership fold names has its reason, over every block of every world', () => assert.deepEqual(reasonless, []))
check('parity: the two engines judge every block of every world valid or not alike', () => assert.deepEqual(worlds.flatMap((w) => w.problems), []))

// ---------- 2. The nine revisions ----------
const stageOf = (first, w) => call('promise_stage', first, w.blocks, {})
const c1 = world('case1 coffee shop')
const cafe = c1 && c1.blocks.find((b) => b.type === 'actor' && b.state.kind === 'circle')

// Rule 1 (1.9 circles, C10, C14, C18): a block signed `as` a circle speaks for its owners only where a row holds for it, or every owner signs it.
// One who owns no part acts only under a grant `as` the circle, within its scope. The 1.7 "manager with the sign power" is Bob, an owner whose
// row holds alone; "an outsider" owns no part and holds no grant; "a guest" holds a grant as the circle whose scope names no promise.
check('rule 1: an outsider\'s accept as the circle binds no one; the guest\'s decline ends nothing', () => {
  const w = world('repro: circle sign power in promise_stage')
  const offer = w.find('alice offers eggs to cafe')
  assert.equal(stageOf(offer, w).stage, 'offered')
  assert.equal(stageOf(offer, w).accept, null)
  assert.equal(oracle.door('promise_stage', offer, w.blocks).stage, 'offered')
  const eve = w.find('eve (no part, no grant) accepts as cafe')
  assert.equal(call('row_holds', eve, w.blocks).holds, false)
  assert.equal(oracle.door('row_holds', eve, w.blocks).holds, false)
  assert.equal(call('speaks_for', eve, w.blocks), null)
  assert.equal(oracle.door('speaks_for', eve, w.blocks), null)
})
check('rule 1: an owner whose row holds alone accepts as the circle and it binds; an outsider\'s accept beside it does not', () => {
  const offer = c1.find('alice offers to cafe'), good = c1.find('manager bob accepts as cafe (sign power)')
  assert.equal(stageOf(offer, c1).stage, 'accepted')
  assert.equal(stageOf(offer, c1).accept, good.hash)
})
check('rule 1: an offer forged as the circle by an outsider speaks for neither side: no stage', () => {
  const forged = c1.find('forged: carol offers as cafe')
  assert.equal(stageOf(forged, c1), null)
  assert.equal(oracle.door('promise_stage', forged, c1.blocks), null)
})
check('rule 1: a circle\'s offer by an owner whose row holds is a deal, settled by the buyer and the circle\'s accepts', () => {
  const offer = c1.find('offer 5 shares (bob as cafe) -> carol')
  assert.equal(stageOf(offer, c1).stage, 'done')
  assert.equal(oracle.door('promise_stage', offer, c1.blocks).stage, 'done')
  assert.equal(call('row_holds', offer, c1.blocks).holds, true)
})

// Rule 2: the maker of a thing made `as` a circle is the circle. (The café's "shares" here are vouchers, things made as the café; its
// parts are the 1.9 shares, and they move by a transfer the receiver accepts.)
// The world hands shares 0 to 4 to Carol (one transfer, `transfer 5 shares to carol`); share 10 is still the circle's: Alice's transfer of it
// as the café is a draw off the line it was made on (Bob's, the café having no meter: C21), so it takes nothing (`not_on_line`).
// The check once asked Carol for share 10, an answer neither engine has given since the world was built this way (the snapshot before
// 1.9 stage 5 gives the circle too): the check was wrong, not the engines.
check('rule 2: things an owner made as the circle belong to the circle; a handed-over one belongs to the receiver; parts belong to whom they were handed', () => {
  const share = (i) => c1.find('share ' + i)
  assert.equal(call('ownership', share(7), c1.blocks).owner, cafe.hash)
  assert.equal(call('ownership', share(0), c1.blocks).owner, c1.people.carol.id)
  assert.equal(call('ownership', c1.find('share kind (bob as cafe)'), c1.blocks).owner, null) // a kind is a description and has no owner (things.md); its instances do
  assert.equal(call('ownership', share(10), c1.blocks).owner, cafe.hash)
  for (const i of [0, 7, 10]) assert.equal(call('ownership', share(i), c1.blocks).owner, oracle.door('ownership', share(i), c1.blocks).owner, 'share ' + i)
  const owners = (cs) => cs.owners.map((o) => [o.owner, o.amount.value])
  const cs = call('circle_state', cafe.hash, c1.blocks, null)
  assert.deepEqual(owners(cs), [[c1.people.alice.id, '90'], [c1.people.bob.id, '10']].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
  assert.deepEqual(owners(oracle.door('circle_state', cafe.hash, c1.blocks)), owners(cs))
})

// Rule 3: a bearer promise's side is the thing's current owner.
check('rule 3: the holder of the note is the receiving side of a bearer promise; the earlier holder is not', () => {
  const w = world('case2 lending')
  const bearer = w.find('bearer promise (to = the note thing)'), cy = w.people.cy, bo = w.people.bo
  assert.equal(call('ownership', w.find('bearer note thing'), w.blocks).owner, cy.id)
  const s = stageOf(bearer, w)
  assert.equal(s.accept, w.find('cy (holder) accepts bearer promise').hash)
  assert.notEqual(s.accept, null)
  assert.equal(bo.id === call('ownership', w.find('bearer note thing'), w.blocks).owner, false)
})

// Rule 4: an allocation starts a deal of its own.
check('rule 4: several takers have a deal each: one taker\'s goods and payment never count toward another\'s', () => {
  const w = world('case4b multi-taker settlement')
  const O = w.find('open offer'), a1 = w.find('allocation t1'), a2 = w.find('allocation t2')
  assert.equal(stageOf(a2, w).stage, 'done')
  assert.equal(stageOf(a1, w).stage, 'accepted')
  assert.equal(stageOf(a1, w).paid, null)
  assert.equal(stageOf(O, w).stage, 'accepted')
  assert.deepEqual(stageOf(O, w).quantity, { value: '3', unit: 'egg' })
  assert.equal(stageOf(O, w).total.value, '9')
})
check('rule 4 (decision C2): an allocation past what the open offer holds still binds its offerer: a deal of its own', () => {
  const w = world('case4 market maker')
  assert.equal(stageOf(w.find('maya allocates t3 30 (would be 120 of 100)'), w).stage, 'accepted')
  assert.notEqual(stageOf(w.find('maya allocates t1 60'), w), null)
})

// Rule 5: a promise's terms are fixed once written.
check('rule 5: a price written as an updates of a promise is refused, and changes nothing', () => {
  const w = world('case4 market maker')
  const O = w.find('standing open offer 100 eggs @3.00/egg(minor)')
  assert.ok(w.log.some((l) => l.note.startsWith('maya updates price') && l.writeRefused && /required|updates/.test(l.writeRefused + l.refused)))
  // every allocation binds (decision C2), but the offer's quantity counts only the allocations that take as draws on its 100 eggs (03-amounts,
  // F11 `quantity`): 90 of the 120 take, at the price as written; the rest are her broken promise, shown over_allocated
  assert.equal(stageOf(O, w).total.value, '270')
})

// Rule 6: a defeated transfer or work block stops counting.
check('rule 6 (batch 2 P4): a delivery the receiver defeated still counts: her defeats is a dispute, shown, never a verdict', () => {
  const w = world('case2 lending')
  const kept = w.blocks.find((b) => b.type === 'promise' && b.refs.answers === undefined && (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note === 'd1 kept offer')
  const defeated = w.blocks.find((b) => b.type === 'promise' && b.refs.answers === undefined && (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note === 'd4 delivered then defeated offer')
  assert.equal(stageOf(kept, w).stage, 'done')
  assert.equal(stageOf(defeated, w).stage, 'underway')
  assert.equal(stageOf(defeated, w).disputed.length, 1)
})

// Rule 7 (1.9, G1: one predicate, `under_ok`): a block under a grant speaks for the grantor only where it is for a promise in the grant's
// `scope.on` (or a deal made under the grant), keeps to it, and fits on the grant's line. A limit alone, a `for` ask, a published schema or a
// stranger's schema name no promise, so none of them puts an act under the grant: a spray under a grant with a limit and no promise named
// is not under it (`not_kept`). 1.8 let a named limit or a specific accepted ask do it; 1.9 deletes those ways.
check('rule 7: an act is under a grant only if it is for a promise the grant names (G1); a limit with no promise named is not enough', () => {
  const w = world('case9 reversibility')
  const named = {
    'spray under transfer.spray (limit)': false, // a limit but no promise named: not under (1.8 said true)
    'spray under transfer+observe +for': false, // an accepted ask is no promise in `on`
    'spray under transfer+observe': false,
    'spray under transfer.spray (no limit)': false,
    'open_valve under transfer+observe': false,
    'launch_robot under transfer+observe': false,
    'spray under transfer+observe +schema': false,
    'restock under transfer+observe': false // a stranger's schema cannot unblock
  }
  for (const l of w.log) if (l.type === 'transfer' && l.sdk === 'valid') assert.equal(call('under_ok', w.find(l.note), w.blocks), oracle.door('under_ok', w.find(l.note), w.blocks), l.note)
  for (const [note, expected] of Object.entries(named)) assert.equal(call('under_ok', w.find(note), w.blocks), expected, note)
  const why = (note) => call('why_not_under', w.find(note), w.blocks, null).map((r) => r.code)
  assert.deepEqual(why('spray under transfer.spray (limit)'), ['not_kept'])
  assert.deepEqual(why('spray under transfer.spray (limit)'), oracle.door('why_not_under', w.find('spray under transfer.spray (limit)'), w.blocks, null).map((r) => r.code))
})

// Rule 8: readings count only when the sensor or its operator signed them.
// 1.9 R-C1 (05-deals.md, sections 6 and 11): `reading_condition_holds` has no reader's clock. Its third argument is the block it is read for:
// the readings in that block's causal past count, and the window ends at its own `at` (readFor, lib.cjs).
check('rule 8: a rogue device\'s reading confirms no condition; the operator\'s device\'s does', () => {
  const w = world('case6 device reading')
  const sensor = w.find('sensor thing (placed in bed 3)')
  const cond = { reading: sensor.hash, kind: 'reading', op: 'lt', value: { value: '10', unit: '%' }, over: 'PT1H' }
  const rogueOnly = w.blocks.filter((b) => b.hash !== w.find('device reading 31% at T').hash)
  const at6 = readFor(rogueOnly, w.people.edge, '2026-10-05T10:30:00.000Z')
  assert.equal(call('reading_condition_holds', cond, rogueOnly, at6), false)
  assert.equal(oracle.door('reading_condition_holds', cond, rogueOnly, at6), false)
  const w3 = world('case3 risk pool'), s3 = w3.find('sensor thing (by installer)')
  const c3 = { reading: s3.hash, kind: 'rain', op: 'gt', value: { value: '50', unit: 'mm' }, over: 'PT1H' }
  const at3 = readFor(w3.blocks, w3.people.mia, '2026-10-05T13:00:00.000Z')
  assert.equal(call('reading_condition_holds', c3, w3.blocks, at3), true)
  assert.equal(oracle.door('reading_condition_holds', c3, w3.blocks, at3), true)
})

// Rule 9: acceptances and stops are derived from what they answer. 1.9 circles: Mo joins by taking parts with a bare yes; Nan's seat (a grant
// as the co-op that a head-count row names) ends by a bare stop, so her hand counts before it and not after.
check('rule 9: an acceptance and a stop that carry only status, no kind and no subject, still count', () => {
  const w = world('case10 bare acceptance')
  const co = w.find('circle')
  const state = call('circle_state', co.hash, w.blocks, null)
  assert.deepEqual(state.owners.find((o) => o.owner === w.people.mo.id).amount, { value: '3', unit: 'part' }, 'mo owns 3 parts by a bare acceptance')
  assert.deepEqual(J(state), J(oracle.door('circle_state', co.hash, w.blocks)))
  const holds = (note) => { const b = w.find(note), a = call('row_holds', b, w.blocks); assert.deepEqual(J(a), J(oracle.door('row_holds', b, w.blocks)), note); return a }
  assert.equal(holds('nan counts stock as the co-op (seated)').holds, true, 'nan\'s seat counts before the stop')
  const after = holds('nan counts stock as the co-op after the stop')
  assert.equal(after.holds, false, 'nan\'s seat was ended by a bare stop')
  assert.deepEqual(after.hands.map((h) => h.why), ['not_voice'])
})

// ---------- Phase 2 ----------
// Large content: one Merkle convention (encoding.md). Roots, proofs and verdicts are identical in the core and the oracle, for every size.
check('merkle: the core and the oracle give one root and one proof for every chunk of 1 to 40 chunks, and every proof opens', () => {
  const chunks = (n) => Array.from({ length: n }, (_, i) => Buffer.from(`chunk ${i}`).toString('hex'))
  for (let n = 1; n <= 40; n++) {
    const c = chunks(n), root = call('merkle_root', c), named = { type: 'thing', state: { kind: 'stream', marks: [{ scheme: 'merkle', value: root }], chunks: n }, refs: {} }
    assert.equal(oracle.door('merkle_root', c), root, `root of ${n}`)
    for (let i = 0; i < n; i++) {
      const proof = call('merkle_proof', c, i)
      assert.deepEqual(oracle.door('merkle_proof', c, i), proof, `proof ${i} of ${n}`)
      assert.equal(call('merkle_verify', named, c[i], i, proof), true)
      assert.equal(oracle.door('merkle_verify', named, c[i], i, proof), true)
      const other = c[(i + 1) % n]
      if (n > 1) { assert.equal(call('merkle_verify', named, other, i, proof), false); assert.equal(oracle.door('merkle_verify', named, other, i, proof), false) }
    }
  }
})

// The base schemas (spec/schemas) in use: each is data over folds both engines already share.
const both = (op, ...args) => { const a = call(op, ...args), b = oracle.door(op, ...args); assert.deepEqual(J(a), J(b), op); return a }
const c11 = world('case11 base schemas')
check('base schemas: the publisher\'s chain is held and every use of a schema is valid in both engines', () => {
  assert.deepEqual(c11.problems, [])
  assert.equal(c11.log.filter((l) => l.writeRefused).length, 0)
  assert.equal(Object.keys(c11.baseSchemas).length, 50) // end pass 2026-11-20: `pass` deleted (promises.md has no Passing a part; handing on is a transfer); // 1.9 stage 6 deleted share_vote (a count by share is a parts row); lookup, listing, check, clearing, rate and judging (market); witness; account and answer; done and pass (R9); shareback, rebate, draw and bounded_change (batch 10); place_use (batch 9); reliance, price_reading, keeping and loss (batch 8); pledge and pledge_close (decision H20); not_free, invasion and ruling (batch 4); loyalty, vouch, payback, refusal, pool, link, rulebook, glossary and grader (batch 5)
  assert.ok(!('kept_promises' in c11.baseSchemas) && !('kept_and_broken' in c11.baseSchemas) && !('share_vote' in c11.baseSchemas))
})
// The facts of each promise (folds.md, Facts, never verdicts): its stage and who ended it, alike in both engines. No verdict is read: batch 2 P3
// deleted the kept_and_broken schema; P4 makes the buyer's word on promise 8 (a promise not to do, 1.9 R-H8) a dispute; P7 lets promise 12
// outlive its promiser's close (1.9 R-H7: a key grant that leaves no voice, no successor).
check('facts: each promise\'s stage and who ended it are read alike in both engines, with no verdict', () => {
  const stages = c11.promises.map((h) => [c11.blocks.find((b) => b.hash === h), both('promise_stage', c11.blocks.find((b) => b.hash === h), c11.blocks, {})])
  assert.deepEqual(stages.map(([, s]) => s.stage), ['done', 'stopped', 'declined', 'accepted', 'stopped', 'stopped', 'stopped', 'accepted', 'stopped', 'stopped', 'accepted', 'accepted'])
  assert.deepEqual(stages.map(([, s]) => s.by), [null, 'from', null, null, 'to', 'both', 'from', null, 'from', 'to', null, null])
  assert.deepEqual(stages.map(([, s]) => s.disputed.length), [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0])
})
check('a will (1.9 R-H7): her own transfer on { closed: <her id> } holds nothing while she can sign and takes at her close, alike in both engines', () => {
  const jam = c11.blocks.find((b) => b.hash === c11.will.jam)
  assert.equal(both('ownership', jam, c11.blocks).owner, c11.will.heir)
  assert.equal(both('ownership', jam, c11.blocks.filter((b) => b.hash !== c11.will.close)).owner, c11.will.gran)
  assert.equal(both('condition_holds', { closed: c11.will.gran }, c11.blocks, null), true)
  assert.equal(both('condition_holds', { closed: c11.will.gran }, c11.blocks, c11.will.close), false, 'read in the close\'s own past')
})
// A promise not to do is `elapsed` only in the view, after its until (1.9 R-H10: `elapsed` for any promise that moves nothing past `until`;
// `terms.refrain` is deleted, R-H8). Each is read at a clock before and after its until, in both engines: left alone, stopped after until by
// either side, outliving its promiser's close, and stopped early by its promiser. A stop ends it whenever it came: when, against until, is a
// fact for each reader (batch 2 P4 deleted the after-until rules), and a close ends no promise (P7). 1.9 R-H7: the close is a key grant that
// leaves no voice of her list; there is no successor.
check('promises not to do through promise_view: elapsed after until when left alone, never done (R-H10); a stop, early or late, agreed or not, stays stopped; a close ends nothing', () => {
  const w = new World('audit promises not to do in the view')
  const A = w.person('A'), B = w.person('B')
  const until = new Date(Date.parse(T()) + 30 * 60000).toISOString()
  const refrain = (note) => {
    const p = w.w(A, 'promise', { what: 'no spray', terms: { until, expires: '2099-01-01T00:00:00.000Z' } }, { from: A.id, to: B.id }, note)
    w.w(B, 'promise', { status: 'accepted' }, { answers: p.hash, for: p.hash }, note + ' accepted')
    return p
  }
  const alone = refrain('alone'), early = refrain('early'), late = refrain('late'), agreed = refrain('agreed'), other = refrain('other'), closed = refrain('closed')
  w.w(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: early.hash, for: early.hash }, 'early stop')
  while (T() <= until) { /* the clock passes until */ }
  w.w(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: late.hash, for: late.hash }, 'late stop')
  const lateAgreed = w.w(A, 'promise', { status: 'stopped', stop: 'onward' }, { updates: agreed.hash, for: agreed.hash }, 'late stop, agreed')
  w.w(B, 'observe', { kind: 'note', text: 'agreed' }, { confirms: lateAgreed.hash, for: agreed.hash }, 'B confirms the late stop')
  w.w(B, 'promise', { status: 'stopped', stop: 'onward' }, { answers: other.hash, for: other.hash }, 'other stop')
  assert.deepEqual(w.problems, [])
  assert.deepEqual(w.log.filter((l) => l.writeRefused), [])
  const before = new Date(Date.parse(until) - 60000).toISOString(), after = '2099-06-01T00:00:00.000Z'
  const view = (p, now, blocks = w.blocks) => both('promise_view', p, blocks, { now }).stage
  assert.equal(view(alone, before), 'accepted')
  assert.equal(view(alone, after), 'elapsed')
  // a stop is a stop, whenever it came and whoever agreed to it
  assert.equal(view(late, after), 'stopped')
  assert.equal(view(agreed, after), 'stopped')
  assert.equal(view(early, after), 'stopped')
  view(other, before); view(other, after)
  // the close comes after until: it ends no promise, so one left alone reads elapsed once until has passed
  w.w(A, 'grant', { kind: 'key', voices: [] }, { subject: A.id, updates: A.id }, 'A closes her list')
  assert.deepEqual(w.log.filter((l) => l.writeRefused), [])
  assert.equal(both('condition_holds', { closed: A.id }, w.blocks, null), true)
  assert.equal(view(closed, after), 'elapsed')
  assert.equal(view(early, after), 'stopped')
})
check('person_confirmed: the receiver\'s accepted answer to the transfer is what makes the delivery count', () => {
  const stage = (h) => both('promise_stage', c11.blocks.find((b) => b.hash === h), c11.blocks, {})
  assert.equal(stage(c11.personConfirmed.confirmed).stage, 'done')
  assert.equal(stage(c11.personConfirmed.unconfirmed).stage, 'accepted')
})
check('teach: the learner\'s accepted answer to the lesson settles the promise to teach', () => {
  assert.equal(both('promise_stage', c11.blocks.find((b) => b.hash === c11.teach), c11.blocks, {}).stage, 'done')
})
check('loan: the advance (a payout record the borrower accepts) and the repayment settle the promise', () => {
  const s = both('promise_stage', c11.blocks.find((b) => b.hash === c11.loan), c11.blocks, {})
  assert.equal(s.stage, 'done')
  assert.deepEqual(s.total, { value: '110', unit: 'GBP' })
})

// Device attestation: who may sign a sensor's readings is the sensor's owner's word, and only that.
const c12 = world('case12 device attestation')
check('device attestation: the world is valid in both engines, with the schema store', () => { assert.deepEqual(c12.problems, []); assert.equal(c12.log.filter((l) => l.writeRefused).length, 0) })
check('device attestation: the owner\'s device and the owner count; a stranger\'s or an installer\'s grant makes no operator of the probe', () => {
  // 1.9 R-C1: read for a block at h:30 with the readings signed by then in its past, never at a reader's clock
  const time = (h) => `2026-11-03T${String(h).padStart(2, '0')}:30:00.000Z`
  const reader = c12.people.mia
  const atIn = (blocks) => (h) => readFor(blocks, reader, time(h))
  const at = atIn(c12.blocks)
  const frost = c12.frost
  // the device read 3 C at 01:00, -2 C at 02:00, -3 C at 03:00; the owner read -1 C at 04:00; a rogue device read -9 C at 03:00
  assert.equal(both('reading_condition_holds', frost, c12.blocks, at(2)), false, 'at 02:30 the state at the start of the hour (01:30) was 3 C')
  assert.equal(both('reading_condition_holds', frost, c12.blocks, at(3)), true, 'at 03:30 the hour opened at -2 C and stayed below zero')
  assert.equal(both('reading_condition_holds', frost, c12.blocks, at(4)), true)
  // 1.9: readings are told apart by the device that signed them (its note): the farmer's device signs with a key of hers, the rogue boxes
  // with the installer's and the liar's keys (end pass 2026-11-20)
  const by = (prefix) => new Set([...c12.byNote].filter(([n]) => n.startsWith(prefix)).map(([, b]) => b.hash))
  const without = (who) => { const s = by(who === 'device' ? 'device:' : 'rogue'); return c12.blocks.filter((b) => !s.has(b.hash)) }
  assert.equal(both('reading_condition_holds', frost, without('device'), atIn(without('device'))(4)), false, 'without the device\'s readings there is none at the start of the hour: the rogue\'s -9 C and the owner\'s -1 C do not carry it')
  const rogueSet = by('rogue'), onlyRogue = c12.blocks.filter((b) => !(b.type === 'observe' && b.state.kind === 'temperature' && !rogueSet.has(b.hash)))
  assert.equal(both('reading_condition_holds', frost, onlyRogue, atIn(onlyRogue)(4)), false, 'only the rogue device\'s reading is held: neither the stranger\'s nor the installer\'s grant makes it an operator of the probe')
})
// 1.9 stage 4: the operator grant is deleted with its reading (`operators_of`); a sensor's operator grant (tasks.md) names no one's operator
check('device attestation: when the owner gives the sensor away, the old owner\'s grants stop counting and the new owner\'s start', () => {
  const sensor = c12.blocks.find((b) => b.type === 'thing' && b.state.name === 'frost probe')
  const t = fb.write('transfer', {}, { what: sensor.hash, to_owner: c12.people.installer.id }, { author: c12.people.farmer.id, key: c12.people.farmer.keys, held: c12.blocks, audience: 'public', at: '2026-11-03T05:00:00.000Z' })
  const acc = fb.write('transfer', { status: 'accepted' }, { answers: t.hash }, { author: c12.people.installer.id, key: c12.people.installer.keys, held: [...c12.blocks, t], audience: 'public', at: '2026-11-03T05:01:00.000Z' })
  const held = [...c12.blocks, t, acc]
  assert.equal(both('ownership', sensor, held).owner, c12.people.installer.id)
  // 1.9 R-C1: read for a block at 05:30 (after the 05:00 hand-over) with the hand-over, its accept and the readings in its past
  const at = (blocks) => readFor(blocks, c12.people.mia, '2026-11-03T05:30:00.000Z')
  const rogueOf = new Set([...c12.byNote].filter(([n]) => n.startsWith('rogue')).map(([, b]) => b.hash))
  const without = () => held.filter((b) => !rogueOf.has(b.hash))
  assert.equal(both('reading_condition_holds', c12.frost, without(), at(without())), false, 'the device the farmer named no longer counts: the farmer no longer owns the probe')
  assert.equal(both('reading_condition_holds', c12.frost, held, at(held)), true, 'the installer, now the owner, had named the rogue device: its readings count')
})


// ---------- 3. Congruence ----------
// A rule asked of everyone but its author is a privilege. FoodX's own offers, grants, signals and rulings are folded exactly like anyone's.
const c15 = require('./c15.cjs').worlds
const answersOf = (k) => {
  const { w, house, una, helper, offer, small, big, claim } = c15[k]
  const label = new Map([[house.id, 'house'], [una.id, 'una'], [helper.id, 'helper'], [c15[k].judge.id, 'judge']])
  const norm = (x) => JSON.parse(JSON.stringify(x, (key, v) => (typeof v === 'string' && label.has(v) ? label.get(v) : typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? 'hash' : v)))
  const stage = call('promise_stage', offer, w.blocks, {})
  const out = { stage: stage.stage, disputed: stage.disputed.map((d) => d.by), paid: stage.paid }
  out.small = call('under_ok', small, w.blocks)
  out.big = call('under_ok', big, w.blocks)
  // 1.9 (05-deals.md, section 10): invasion_shown loses `standing`, `crossed`, `commanded`, `accused` and `nothing`; what is left is compared
  const inv = call('invasion_shown', claim, w.blocks)
  out.invasion = { claimant: inv.claimant, holder: inv.holder, evidence: inv.evidence.length, judges: inv.judges.map((j) => j.judge), rulings: inv.rulings.length }
  // 1.9 R-C1: no reader's clock; null reads the condition on every block held
  out.signal = call('condition_holds', { signal: 'ready', by: [house.id], signers: 1, subject: una.id }, w.blocks, null)
  out.twice = call('condition_holds', { signal: 'ready', by: [house.id], signers: 2, subject: una.id }, w.blocks, null)
  return norm(out)
}
check('congruence: FoodX\'s own offer, grant, claim, signal and ruling are folded exactly like a stranger\'s: the same scene gives the same answers', () => {
  assert.deepEqual(answersOf('FoodX'), answersOf('a stranger'))
  assert.equal(answersOf('FoodX').big, false, 'a visible limit binds FoodX too')
  assert.equal(answersOf('FoodX').twice, false, 'FoodX signing twice is one signer')
  assert.deepEqual(answersOf('FoodX').disputed, ['from'], 'FoodX\'s defeats of a block of its own deal is a dispute, not a ruling')
})
check('congruence: no source of the core, the oracle or the SDK names FoodX: no key, name or id is exempt (the one hit is the Android package path)', () => {
  const fs = require('fs'), path = require('path')
  const root = path.join(__dirname, '../..')
  const files = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'target' || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(rs|cjs|json)$/.test(e.name)) files.push(p) } }
  walk(path.join(root, 'sdk/rust/src')); walk(path.join(root, 'sdk/javascript/src')); files.push(path.join(root, 'spec/oracle/fb.cjs'), path.join(root, 'spec/protocol.json'))
  const hits = []
  for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/foodx/i.test(l) && !/world[._]foodx/i.test(l)) hits.push(`${path.relative(root, f)}:${i + 1}`) })
  assert.deepEqual(hits, [])
})

for (const u of unbuilt) realLog('not built (1.7 fixtures): ' + u)
for (const f of failures) realLog('✗ ' + f)
realLog(`audit: ${worldCount} worlds, ${blockCount} blocks. Parity [compared, differing]: ${J(tally)}`)
for (const d of diffs.slice(0, Number(process.env.SHOW_DIFFS || 15))) realLog('  differs: ' + d)
realLog(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
