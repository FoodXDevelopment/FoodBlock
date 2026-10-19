// The audit regression suite: `node test/audit/run.cjs` (it is part of `npm test` in sdk/javascript).
//
// The cases c1 to c9 are small worlds of signed blocks that a read-only audit of FoodBlock 1.6 (2026-10-19) built to find where the Rust
// core (the one engine every SDK wraps) and the oracle (spec/oracle, written from the spec text alone) disagreed, or where the spec let a
// stranger do something it should not. Each fixed rule stays fixed here:
//   1. PARITY: every fold in protocol.json (`folds`) is computed by the core and by the oracle over every block of every world, and the
//      answers must be identical. Zero differences, or this exits 1.
//   2. RULES: what each of the nine revisions says, asserted on these worlds (CHANGELOG.md, "1.6 revisions after the audit").
const assert = require('assert/strict')
const { fb, oracle } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

const files = ['c1', 'c1b', 'c1d', 'c1e', 'c2', 'c3', 'c3b', 'c4', 'c4b', 'c5', 'c6', 'c7', 'c9', 'c10']
const realLog = console.log
console.log = () => {}
for (const f of files) require('./' + f + '.cjs')
console.log = realLog
const worlds = global.__worlds
const world = (name) => worlds.find((w) => w.name === name)

let pass = 0, fail = 0
const failures = []
const check = (name, fn) => { try { fn(); pass++ } catch (e) { fail++; failures.push(`${name}: ${String(e.message).split('\n').slice(0, 6).join(' | ')}`) } }

// ---------- 1. Parity ----------
const J = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v))
const sameAnswer = (a, b) => J(a) === J(b)
const diffs = []
const compare = (fold, world, what, a, b) => { tally[fold] = tally[fold] || [0, 0]; tally[fold][0]++; if (!sameAnswer(a, b)) { tally[fold][1]++; diffs.push(`${fold} (${world}, ${what}): core ${J(a).slice(0, 300)} | oracle ${J(b).slice(0, 300)}`) } }
const tally = {}
const NOW = '2026-12-01T00:00:00.000Z'
const sortedRoles = (c) => c && ({ founder: c.founder, removed: c.removed, members: Object.fromEntries(Object.entries(c.members).map(([k, v]) => [k, { roles: [...v.roles].sort(), grant: v.grant, counted_to: v.counted_to }])) })
// The vectors' own stories are worlds too: whatever they hold is compared the same way.
const V = require('../../spec/vectors.json')
const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature })
const stories = [...V.deals, ...V.circles, ...V.identities, ...V.folds.promises, ...V.folds.circles, ...V.folds.things, ...V.refusals.cases.filter((c) => c.blocks)].map((v, i) => {
  const blocks = v.blocks.map(full)
  const people = {}
  for (const b of blocks) if (b.type === 'actor' && b.state.public_key_sign) people[b.hash] = { label: b.hash.slice(0, 6), id: b.hash }
  return { name: 'vectors: ' + (v.name || i), blocks, log: v.blocks.map((b) => ({ hash: b.hash.slice(0, 8), note: b.name })), people }
})
for (const w of [...worlds, ...stories]) {
  const held = w.blocks
  const label = (b) => (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note || b.hash.slice(0, 8)
  const people = Object.values(w.people)
  const circles = held.filter((b) => b.type === 'actor' && b.state.kind === 'circle')
  for (const b of held) {
    if (b.type === 'promise') {
      compare('promise_stage', w.name, label(b), call('promise_stage', b, held, {}), oracle.door('promise_stage', b, held, {}))
      if (b.refs.answers === undefined && b.refs.updates === undefined) compare('promise_view', w.name, label(b), call('promise_view', b, held, { now: NOW }), oracle.door('promise_view', b, held, { now: NOW }))
    }
    if (b.type === 'thing') {
      compare('ownership', w.name, label(b), call('ownership', b, held), oracle.door('ownership', b, held))
      compare('where_now', w.name, label(b), [...call('where_now', b, held)].sort(), [...oracle.door('where_now', b, held)].sort())
    }
    if (b.refs.as) {
      const c = held.find((x) => x.hash === b.refs.as)
      if (c) compare('may_act_as', w.name, label(b), call('may_act_as', b, c.hash, held, null), oracle.door('may_act_as', b, c.hash, held))
    }
    if (b.type === 'actor' && b.state.public_key_sign) {
      const s = fb.identity.identityState(b.hash, held), o = oracle.identityFold(b.hash, held)
      compare('identity', w.name, label(b), { keys: [...s.keys].sort(), frozen: [...s.frozen].sort(), operators: [...s.operators].sort() }, { keys: (o.keys instanceof Map ? [...o.keys.keys()] : o.keys.map((k) => k.key || k)).sort(), frozen: [...o.frozen].sort(), operators: [...oracle.operatorsOf(b.hash, held)].sort() })
      const slim = (t) => t.map((k) => ({ key: k.key, frozen: k.frozen, suite: k.suite }))
      compare('key_timeline', w.name, label(b), slim(call('key_timeline', b.hash, held, null)), slim(oracle.door('key_timeline', b.hash, held, null)))
      const mine = held.filter((x) => x.refs.author === b.hash && x.state.seq !== undefined && !(x.type === 'grant' && x.state.kind === 'key'))
      if (mine.length && mine.every((x) => x.refs.prev === b.hash || mine.some((y) => y.hash === x.refs.prev))) {
        compare('chain', w.name, label(b), call('check_chain', mine, b.hash), oracle.door('check_chain', mine, b.hash))
        const last = mine.reduce((a, x) => (!a || x.state.seq > a.state.seq ? x : a), null)
        compare('next_link', w.name, label(b), call('next_link', last, b.hash), oracle.door('next_link', last, b.hash))
      }
    }
  }
  for (const c of circles) {
    compare('circle_state', w.name, label(c), sortedRoles(call('circle_state', c.hash, held, null)), sortedRoles(oracle.door('circle_state', c.hash, held)))
    const roles = (c.state.roles || []).map((r) => r.name)
    for (const b of held.filter((x) => x.refs.as === c.hash)) {
      for (const who of [c.hash, ...roles.map((r) => `${c.hash}#${r}`)]) compare('members_then', w.name, label(b) + ' ' + who.slice(0, 6), [...call('members_then', b, who, held)].sort(), [...oracle.membersThen(b, who, held)].sort())
    }
  }
  for (const p of people) for (const q of [null, ...people]) compare('consent', w.name, `${p.label} <- ${q ? q.label : 'anyone'}`, call('consent', p.id, q && q.id, held, null), oracle.door('consent', p.id, q && q.id, held, null))
}
check('parity: every fold agrees between the Rust core and the oracle, over every block of every world', () => assert.deepEqual(diffs, []))
const worldCount = worlds.length, blockCount = worlds.reduce((n, w) => n + w.blocks.length, 0)
check('parity: the two engines judge every block of every world valid or not alike', () => assert.deepEqual(worlds.flatMap((w) => w.problems), []))

// ---------- 2. The nine revisions ----------
const stageOf = (first, w) => call('promise_stage', first, w.blocks, {})
const c1 = world('case1 coffee shop')
const cafe = c1.blocks.find((b) => b.type === 'actor' && b.state.kind === 'circle')

// Rule 1: a block signed `as` a circle speaks for it only if its author holds `sign` there.
check('rule 1: an outsider\'s accept as the circle binds no one; the guest\'s decline ends nothing', () => {
  const w = world('repro: circle sign power in promise_stage')
  const offer = w.find('alice offers eggs to cafe')
  assert.equal(stageOf(offer, w).stage, 'offered')
  assert.equal(stageOf(offer, w).accept, null)
  assert.equal(fb.fold.mayActAs(w.find('eve (not a member) accepts as cafe'), w.blocks.find((b) => b.hash === offer.refs.to), w.blocks), false)
})
check('rule 1: a manager (sign power) accepts as the circle and it binds; an outsider\'s accept beside it does not', () => {
  const offer = c1.find('alice offers to cafe'), good = c1.find('manager bob accepts as cafe (sign power)')
  assert.equal(stageOf(offer, c1).stage, 'accepted')
  assert.equal(stageOf(offer, c1).accept, good.hash)
})
check('rule 1: an offer forged as the circle by an outsider speaks for neither side: no stage', () => {
  const forged = c1.find('forged: carol offers as cafe')
  assert.equal(stageOf(forged, c1), null)
  assert.equal(oracle.door('promise_stage', forged, c1.blocks), null)
})
check('rule 1: a circle\'s offer by a member with the sign power is a deal, settled by the buyer and the circle\'s accepts', () => {
  const offer = c1.find('offer 5 shares (bob as cafe) -> carol')
  assert.equal(stageOf(offer, c1).stage, 'done')
})

// Rule 2: the maker of a thing made `as` a circle is the circle.
check('rule 2: shares and stock a member made as the circle belong to the circle; a handed-over share belongs to the receiver', () => {
  const share = (i) => c1.find('share ' + i)
  assert.equal(call('ownership', share(7), c1.blocks).owner, cafe.hash)
  assert.equal(call('ownership', share(0), c1.blocks).owner, c1.people.carol.id)
  assert.equal(call('ownership', c1.find('share kind (bob as cafe)'), c1.blocks).owner, cafe.hash)
  assert.equal(call('ownership', share(10), c1.blocks).owner, c1.people.carol.id)
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
  assert.equal(stageOf(O, w).total.minor, 900)
})
check('rule 4: an allocation past what the open offer holds has no deal', () => {
  const w = world('case4 market maker')
  assert.equal(stageOf(w.find('maya allocates t3 30 (would be 120 of 100)'), w), null)
  assert.notEqual(stageOf(w.find('maya allocates t1 60'), w), null)
})

// Rule 5: a promise's terms are fixed once written.
check('rule 5: a price written as an updates of a promise is refused, and changes nothing', () => {
  const w = world('case4 market maker')
  const O = w.find('standing open offer 100 eggs @3.00/egg(minor)')
  assert.ok(w.log.some((l) => l.note.startsWith('maya updates price') && l.writeRefused && /required|updates/.test(l.writeRefused + l.refused)))
  assert.equal(stageOf(O, w).total.minor, 27000)
})

// Rule 6: a defeated transfer or work block stops counting.
check('rule 6: a delivery the receiver defeated no longer reads as done', () => {
  const w = world('case2 lending')
  const kept = w.blocks.find((b) => b.type === 'promise' && b.refs.answers === undefined && (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note === 'd1 kept offer')
  const defeated = w.blocks.find((b) => b.type === 'promise' && b.refs.answers === undefined && (w.log.find((l) => l.hash === b.hash.slice(0, 8)) || {}).note === 'd4 delivered then defeated offer')
  assert.equal(stageOf(kept, w).stage, 'done')
  assert.notEqual(stageOf(defeated, w).stage, 'done')
  assert.equal(stageOf(defeated, w).stage, 'accepted')
})

// Rule 7: reversibility is closed by default.
check('rule 7: an act is irreversible for an agent unless a trusted schema says ok; a stranger\'s schema cannot unblock; a limit that names the act opens it', () => {
  const w = world('case9 reversibility')
  const ok = (note) => call('under_ok', w.find(note), w.blocks) === true
  const same = (note) => assert.equal(call('under_ok', w.find(note), w.blocks), oracle.door('under_ok', w.find(note), w.blocks), note)
  for (const l of w.log) if (l.type === 'transfer' && l.sdk === 'valid') same(l.note)
  assert.equal(ok('spray under transfer.spray (limit)'), true)
  assert.equal(ok('spray under transfer+observe'), false)
  assert.equal(ok('spray under transfer+observe +for'), true)
  assert.equal(ok('spray under transfer.spray (no limit)'), false)
  assert.equal(ok('open_valve under transfer+observe'), false)
  assert.equal(ok('launch_robot under transfer+observe'), false)
  assert.equal(ok('spray under transfer+observe +schema'), false)
  assert.equal(ok('restock under transfer+observe'), false)
})

// Rule 8: readings count only when the sensor or its operator signed them.
check('rule 8: a rogue device\'s reading confirms no condition; the operator\'s device\'s does', () => {
  const w = world('case6 device reading')
  const sensor = w.find('sensor thing (placed in bed 3)')
  const cond = { reading: sensor.hash, kind: 'reading', op: 'lt', value: { value: '10', unit: '%' }, over: 'PT1H' }
  const rogueOnly = w.blocks.filter((b) => b.hash !== w.find('device reading 31% at T').hash)
  assert.equal(call('reading_condition_holds', cond, rogueOnly, '2026-10-05T10:30:00.000Z'), false)
  assert.equal(oracle.door('reading_condition_holds', cond, rogueOnly, '2026-10-05T10:30:00.000Z'), false)
  const w3 = world('case3 risk pool'), s3 = w3.find('sensor thing (by installer)')
  const c3 = { reading: s3.hash, kind: 'rain', op: 'gt', value: { value: '50', unit: 'mm' }, over: 'PT1H' }
  assert.equal(call('reading_condition_holds', c3, w3.blocks, '2026-10-05T13:00:00.000Z'), true)
  assert.equal(oracle.door('reading_condition_holds', c3, w3.blocks, '2026-10-05T13:00:00.000Z'), true)
})

// Rule 9: member acceptances and stops are derived from what they answer.
check('rule 9: an acceptance and a stop that carry only status, no kind and no subject, still count', () => {
  const w = world('case10 bare acceptance')
  const cafe10 = w.blocks.find((b) => b.type === 'actor' && b.state.kind === 'circle')
  const state = call('circle_state', cafe10.hash, w.blocks, null)
  assert.ok(state.members[w.people.mo.id], 'mo joined by a bare acceptance')
  assert.ok(!(w.people.nan.id in state.members) && w.people.nan.id in state.removed, 'nan was removed by a bare stop')
  assert.deepEqual(sortedRoles(state), sortedRoles(oracle.door('circle_state', cafe10.hash, w.blocks)))
})

// ---------- Phase 2 ----------
// Large content: one Merkle convention (encoding.md). Roots, proofs and verdicts are identical in the core and the oracle, for every size.
check('merkle: the core and the oracle give one root and one proof for every chunk of 1 to 40 chunks, and every proof opens', () => {
  const chunks = (n) => Array.from({ length: n }, (_, i) => Buffer.from(`chunk ${i}`).toString('hex'))
  for (let n = 1; n <= 40; n++) {
    const c = chunks(n), root = call('merkle_root', c)
    assert.equal(oracle.door('merkle_root', c), root, `root of ${n}`)
    for (let i = 0; i < n; i++) {
      const proof = call('merkle_proof', c, i)
      assert.deepEqual(oracle.door('merkle_proof', c, i), proof, `proof ${i} of ${n}`)
      assert.equal(call('merkle_verify', root, c[i], i, n, proof), true)
      assert.equal(oracle.door('merkle_verify', root, c[i], i, n, proof), true)
      const other = c[(i + 1) % n]
      if (n > 1) { assert.equal(call('merkle_verify', root, other, i, n, proof), false); assert.equal(oracle.door('merkle_verify', root, other, i, n, proof), false) }
    }
  }
})

for (const f of failures) realLog('✗ ' + f)
realLog(`audit: ${worldCount} worlds, ${blockCount} blocks. Parity [compared, differing]: ${J(tally)}`)
for (const d of diffs.slice(0, 15)) realLog('  differs: ' + d)
realLog(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
