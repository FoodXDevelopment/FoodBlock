// Adds to spec/vectors.json the cases of the 1.7 release review (CHANGELOG.md, "Release review"): `node test/make-vectors-release.cjs`.
// Run after `node scripts/build-wasm.cjs`, after make-vectors-1-7.cjs, and after `node test/rewrite-release.cjs` (which restates the successor
// stories whose grants left `scope.acts` out). Idempotent: a case it made is replaced by name. Every case a rule flipped is retired and
// has a twin marked "release:" that says what it was before; the new cases pin the rules the review added.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, call, story, door, check, M, keyOf, DAY } = kit

// (cases of an earlier draft of this maker, under other names)
kit.retire(['release: a child grant that lists acts under a parent that lists none is wider (acts left out name none; before: a missing field meant all)', 'release: a child that lists no acts under a parent that lists none stays within', 'release: a child that lists acts the parent lists stays within'])

function refusedArg(name, op, args) {
  args = JSON.parse(JSON.stringify(args))
  let threw = null
  try { call(op, ...args) } catch (e) { threw = e }
  assert.ok(threw && threw.kind === 'argument', `${name}: expected an argument error, got ${threw ? threw.kind : 'an answer'}`)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, error: { kind: 'argument' } })
}

// ---- 1. A limit with no period covers all time, so a child limit with one is wider (item 6)
{
  const before = 'batch 2: limit_within_parent: a well-formed fence is judged as before'
  const old = V.door.find((c) => c.name === before)
  if (old) {
    kit.retire([before])
    V.door.push({ ...JSON.parse(JSON.stringify(old)), name: 'release: batch 2: limit_within_parent: a parent limit with no every covers all time, so a child with an every is wider (before: within)', expect: false, exact: true })
  }
  door('release: limit_within_parent: a parent with a limit and an every keeps a child with a longer every within', 'limit_within_parent', [{ limit: M(5), every: 'P4W' }, { limit: M(5), every: 'P2W' }, '2028-02-29T00:00:00.000Z'], { expect: true, exact: true })
  door('release: limit_within_parent: a parent limit with no every and a child limit with none stays within', 'limit_within_parent', [{ limit: M(5) }, { limit: M(5) }, '2028-02-29T00:00:00.000Z'], { expect: true, exact: true })
}

// ---- 2. A block with no author cannot take another block's place in a causal past (item 1)
{
  const s = story(), ann = s.person('rel1ann')
  const a1 = s.say(ann, 'observe', { kind: 'note', text: 'one' })
  const a2 = s.say(ann, 'observe', { kind: 'note', text: 'two' })
  const forged = { hash: a1.hash, type: 'thing', state: { kind: 'eggs', at: '2026-10-27T12:00:00.000Z', audience: 'public' }, refs: {} }
  door('release: an authorless block that claims another block\'s id takes its place in no causal past: the genesis is still in the past of the second note (before: it was cut off)', 'past_of',
    [a2, [...s.held, forged]], { expect: [ann.id, a1.hash].sort(), exact: true })
}

// ---- 3. What a grantor does not write, the grant does not allow: a grant with no scope.acts covers no act (call a)
{
  const s = story(), boss = s.person('rel3boss'), bot = s.person('rel3bot', { kind: 'agent' })
  const bare = s.say(boss, 'grant', { kind: 'errands' }, { to: bot.id })
  const named = s.say(boss, 'grant', { kind: 'errands', scope: { acts: ['observe.note'] } }, { to: bot.id })
  const n1 = s.say(bot, 'observe', { kind: 'note', text: 'bare' }, { under: bare.hash })
  const n2 = s.say(bot, 'observe', { kind: 'note', text: 'named' }, { under: named.hash })
  door('release: an act under a grant that states no scope.acts speaks for its author alone: under_ok is false (before: a grant with no acts covered everything)', 'under_ok', [n1, s.held], { expect: false, exact: true })
  door('release: the same act under a grant that lists observe.note speaks for the grantor', 'under_ok', [n2, s.held], { expect: true, exact: true })
  // passing a grant on: the child's acts are a subset of the parent's, and a parent that lists none lists none to pass on
  const other = s.person('rel3other')
  const passable = s.say(boss, 'grant', { kind: 'errands', depth: 1, scope: {} }, { to: bot.id })
  const listed = s.say(boss, 'grant', { kind: 'errands', depth: 1, scope: { acts: ['promise', 'transfer'] } }, { to: bot.id })
  const wide = s.raw(bot, 'grant', { kind: 'errands', depth: 0, scope: { acts: ['promise'] } }, { to: other.id, parent: passable.hash })
  const none = s.raw(bot, 'grant', { kind: 'errands', depth: 0, scope: {} }, { to: other.id, parent: passable.hash })
  const inside = s.raw(bot, 'grant', { kind: 'errands', depth: 0, scope: { acts: ['promise'] } }, { to: other.id, parent: listed.hash })
  const refused = (b) => ['refusals', b.type, b.state, b.refs, s.held.filter((x) => x.hash !== b.hash), null]
  door('release: a child grant that lists acts under a parent that lists none is wider_than_parent (acts left out name none; before: a missing field meant all)', ...refused(wide).slice(0, 1), refused(wide).slice(1), { expect: [{ code: 'wider_than_parent' }] })
  door('release: a child that lists no acts under a parent that lists none is within', ...refused(none).slice(0, 1), refused(none).slice(1), { expect: [], exact: true })
  door('release: a child that lists acts the parent lists is within', ...refused(inside).slice(0, 1), refused(inside).slice(1), { expect: [], exact: true })
}

// ---- 4. A recorder's yes is never the receiver's own consent (item 8)
{
  const s = story(), ann = s.person('rel4ann'), op = s.person('rel4op'), bot = s.person('rel4bot', { kind: 'agent' })
  const og = s.say(op, 'grant', { kind: 'operator' }, { to: bot.id })
  s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash })
  const stop = s.say(op, 'observe', { kind: 'consent', word: 'stop' }, { from: ann.id, subject: bot.id })
  const yes = s.say(op, 'observe', { kind: 'consent', word: 'yes' }, { from: ann.id, subject: bot.id, after: [stop.hash] })
  const hello = s.say(bot, 'observe', { kind: 'note', text: 'a dozen more?' }, { to: ann.id })
  door('release: consent: the recorder\'s yes (it lifts a stop that same recorder recorded) is the live word', 'consent', [ann.id, bot.id, s.held, hello], { expect: { word: 'yes', block: yes.hash }, exact: true })
  door('release: an autonomous system\'s first block to someone whose only yes is a recorder\'s is still a first block to a stranger: refused outside the order channel (before: the recorder\'s yes made it no stranger)',
    'admission_refusals', [hello, ann.id, s.held, { order_channel: [] }, 0], { expect: [{ code: 'not_human' }] })
  const own = s.say(ann, 'observe', { kind: 'consent', word: 'yes' }, { subject: bot.id, after: [stop.hash, yes.hash] })
  const hello2 = s.say(bot, 'observe', { kind: 'note', text: 'and eggs?' }, { to: ann.id })
  door('release: her own yes, after the stop, makes the sender no stranger', 'admission_refusals', [hello2, ann.id, s.held, { order_channel: [] }, 0], { expect: [], exact: true })
  void own
}

// ---- 5. A collection that is not a list is an argument error, never the empty list (item 18)
refusedArg('release: valid: held given as text is an argument error, not an empty store', 'valid', [{ type: 'thing', state: {}, refs: {} }, 'oops', null])
refusedArg('release: past_of: blocks given as a number is an argument error', 'past_of', [{ type: 'thing', state: {}, refs: {}, hash: 'a'.repeat(64) }, 7])

// ---- 6. Sealing to a key written any way but lowercase hex is refused (item 40)
{
  const key = '02ecf18e7e6dd29d217c86cd7a6d176562989ae0f4fba9e7fd6af55647ba9d46'
  V.door = V.door.filter((c) => c.name !== 'release: seal: a recipient key in capital letters is refused: one key, one spelling')
  V.door.push({ name: 'release: seal: a recipient key in capital letters is refused: one key, one spelling', op: 'seal', args: [{ a: 1 }, [key.toUpperCase()], null, null], error: { kind: 'crypto' }, oracle: false })
}

refusedArg('release: seal: fixed randomness that does not say it only reproduces a vector is an argument error (a nonce a caller chose is a nonce reused)', 'seal',
  [{ a: 1 }, ['02ecf18e7e6dd29d217c86cd7a6d176562989ae0f4fba9e7fd6af55647ba9d46'], null, { ephemeral: '11'.repeat(32), contentKey: '22'.repeat(32), nonce: '33'.repeat(12), keyNonces: ['44'.repeat(12)] }])

// ---- 7. A chain of deals each conditioned on the one before is read in time, not in exponential time (item 2)
{
  const s = story(), kofi = s.person('rel7kofi'), buyer = s.person('rel7buyer')
  const tom = s.say(kofi, 'thing', { kind: 'tomatoes' })
  const kg = fb.amount('5', 'kg')
  let prev = null, last = null
  for (let i = 0; i < 24; i++) {
    const terms = { price: M(100), quantity: kg, expires: DAY, ...(prev ? { condition: { accepted: prev.hash } } : {}) }
    const o = s.say(kofi, 'promise', { terms }, { from: kofi.id, to: buyer.id, what: tom.hash })
    s.say(buyer, 'promise', { status: 'accepted' }, { answers: o.hash, for: o.hash, after: [o.hash] })
    prev = last = o
  }
  door('release: a chain of 24 deals, each conditioned on the one before binding, is read at once: the last binds (before: the reading doubled at every link)', 'promise_stage', [last, s.held, {}], { expect: { stage: 'accepted' } })
}

// ---- 8. A map with a repeated key is refused wherever the repeat sits (item 12)
{
  const first = V.cbor.refused.find((r) => r.name === 'a duplicate key')
  const name = 'a duplicate key, two keys away from its twin (the check keeps the keys seen, not a pair of neighbours)'
  const cbor = first.cbor.replace('a2646b696e64646e6f7465646b696e64646e6f7465', 'a3646b696e64646e6f746564746578746161646b696e64646e6f7465')
  assert.notEqual(cbor, first.cbor)
  V.cbor.refused = V.cbor.refused.filter((r) => r.name !== name)
  V.cbor.refused.push({ name, cbor })
}

// ---- 9. After the machine declines, the operator's key grants that do not see the decline bring in no key (P1: the one exception to "a stop cuts where signed")
{
  const s = story(), op = s.person('fin9op'), bot = s.person('fin9bot', { kind: 'agent' })
  const og = s.say(op, 'grant', { kind: 'operator' }, { to: bot.id })
  const yes = s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash })
  const k1 = s.say(op, 'grant', { kind: 'key', public_key_sign: keyOf('fin9k1').public_key_sign }, { subject: bot.id, under: og.hash, after: [yes.hash] })
  const timeline = () => call('key_timeline', bot.id, s.held, null).map((k) => k.key)
  assert.ok(timeline().includes(keyOf('fin9k1').public_key_sign))
  const before = call('key_timeline', bot.id, s.held, null)
  door('final: a key grant the operator signed while the grant stood brings its key in', 'key_timeline', [bot.id, s.held, null], { expect: before, exact: true })
  const no = s.say(bot, 'grant', { status: 'declined' }, { answers: og.hash, after: [k1.hash] })
  const mid = call('key_timeline', bot.id, s.held, null)
  assert.ok(mid.some((k) => k.key === keyOf('fin9k1').public_key_sign))
  door('final: and still does after the machine declines, because the decline saw it (what was done before stands)', 'key_timeline', [bot.id, s.held, null], { expect: mid, exact: true })
  s.say(op, 'grant', { kind: 'key', public_key_sign: keyOf('fin9k2').public_key_sign }, { subject: bot.id, under: og.hash })
  const after = call('key_timeline', bot.id, s.held, null)
  assert.ok(!after.some((k) => k.key === keyOf('fin9k2').public_key_sign), 'the unseen key grant must bring in no key')
  assert.deepEqual(after, mid)
  door('final: a key grant the operator signs that does not cite the decline brings in no key (before: it counted, and the operator kept rotating the machine\'s keys)', 'key_timeline', [bot.id, s.held, null], { expect: after, exact: true })
  void no
}

vectorsFile.save(V, tags)
console.log('release vectors written')
