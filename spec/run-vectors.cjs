// Conformance runner: node spec/run-vectors.cjs. Checks every section of spec/vectors.json (and the adversarial
// canonical vectors) against the reference SDK. Another SDK passes when it reproduces the same results.
const assert = require('assert/strict')
const fb = require('../sdk/javascript/src/index.cjs')
const { vectors: adversarial } = require('./canonical-vectors.json')
const V = require('./vectors.json')

let pass = 0, fail = 0
const report = (ok, name, why = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !why ? '' : ` (${why})`}`); ok ? pass++ : fail++ }
const same = (a, b) => { try { assert.deepEqual(a, b); return true } catch { return false } }
const attempt = (name, fn) => { try { const out = fn(); report(out !== false, name) } catch (error) { report(false, name, error.message.split('\n')[0]) } }
const strict = (b) => fb.check(b.type, b.state, b.refs)
// The codes a refusal list carries, once each, in protocol.json's order.
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
const codes = (b, options) => codesOf(fb.refusals(b.type, b.state, b.refs, options))
const pub = (signer) => V.keys[signer].public_key_sign
const blocksOf = (list) => list.map((b) => ({ hash: b.hash, ...b.block, signature: b.signature }))

// Canonical form: the adversarial cases.
for (const v of adversarial) {
  const h = (b) => fb.hash(b.type, b.state, b.refs), c = fb.canonical(v.block.type, v.block.state, v.block.refs)
  report(!(v.same_as && h(v.block) !== h(v.same_as)) && !(v.not_same_as && h(v.block) === h(v.not_same_as)) && !(v.canonical_contains && !c.includes(v.canonical_contains)), `canonical: ${v.name}`)
}
for (const v of V.canonical) report(fb.canonical(v.block.type, v.block.state, v.block.refs) === v.canonical && fb.hash(v.block.type, v.block.state, v.block.refs) === v.hash, `canonical: ${v.name}`)

// Hashes and the write check. A block written in the draft-1.6 words is refused by the strict check, and reads as its
// 1.6 form.
for (const v of V.hashes) {
  const { type, state, refs } = v.block
  report(fb.canonical(type, state, refs) === v.canonical && fb.hash(type, state, refs) === v.hash, `hash: ${v.name}`)
  if (!v.draft_words) { const wrong = strict(v.block); report(!wrong.length, `write check: ${v.name}`, wrong.join('; ')); continue }
  report(same(codes(v.block), v.draft_words), `strict check refuses the draft words, with its codes: ${v.name}`)
  const read = fb.readAs({ hash: v.hash, ...v.block })
  report(same({ type: read.type, state: read.state, refs: read.refs }, v.reads_as), `reads as 1.6: ${v.name}`)
}
// Each author's blocks form one key chain: seq 1, 2, 3, each prev the block before, the first after the genesis.
for (const id of new Set(V.hashes.map((v) => v.block.refs.author).filter(Boolean))) {
  const mine = V.hashes.filter((v) => v.block.refs.author === id).map((v) => ({ hash: v.hash, ...v.block }))
  report(fb.checkChain(mine, id).ok, `chain: ${id.slice(0, 8)}'s ${mine.length} blocks, no gaps, no equivocation`)
}
for (const v of V.audience) report(fb.saltedHash(v.salt, v.recipient) === v.commitment, `audience: ${v.name}`)

// Every signed block in every story: its hash, its signature, and (for a 1.6 block or a 1.6 genesis, which names its
// recovery and may leave out its encryption key) the strict write check.
const byHash = new Map(V.hashes.map((v) => [v.hash, v.block]))
const stories = [
  ...V.identities.map((v) => ['identity', v.name, v.blocks]), ...V.deals.map((v) => ['deal', v.name, v.blocks]), ...V.circles.map((v) => ['circle', v.name, v.blocks]),
  ...V.folds.promises.map((v) => ['promise fold', v.name, v.blocks]), ...V.folds.circles.map((v) => ['circle fold', v.name, v.blocks]), ...V.folds.audience.map((v) => ['audience fold', v.name, v.blocks]),
  ...V.folds.things.map((v) => ['thing fold', v.name, v.blocks]), ...V.folds.successors.map((v) => ['successor fold', v.name, v.blocks]), ...V.folds.rekeys.map((v) => ['rekey fold', v.name, v.blocks]), ...V.folds.ballots.map((v) => ['ballot fold', v.name, v.blocks]), ['refusal', 'stories', V.refusals.blocks], ...V.refusals.cases.filter((c) => c.blocks).map((c) => ['refusal', c.name, c.blocks]),
  ['sealed', 'stories', V.sealed.blocks], ...V.reads.groups.map((g) => ['draft words', g.name, g.blocks])
]
for (const [group, name, list] of stories) {
  const wrong = []
  for (const b of list) {
    byHash.set(b.hash, b.block)
    if (fb.hash(b.block.type, b.block.state, b.block.refs) !== b.hash) wrong.push(`${b.name}: hash`)
    if (!fb.verify(b.block, b.signature, pub(b.signer))) wrong.push(`${b.name}: signature`)
    const is16 = b.block.state.seq !== undefined || fb.identity.is16Genesis(b.block)
    if (group !== 'draft words' && is16 && strict(b.block).length) wrong.push(`${b.name}: ${strict(b.block).join('; ')}`)
  }
  report(!wrong.length, `${group}: ${name}: ${list.length} blocks hash, verify and pass the write check`, wrong.join(' | '))
}
const opens = (v) => byHash.has(v.hash) && fb.verify(byHash.get(v.hash), v.signature, pub(v.signer))
for (const v of V.signatures) report(opens(v), `signature: ${v.name}`)
for (const v of V.bad_signatures) report(!opens(v), `bad signature refused: ${v.name}`)

// Envelopes: the older ones (key_hash ignored), and sealed copies with their signed public header.
for (const v of V.envelopes) attempt(`envelope: ${v.name}`, () => {
  const m = fb.unwrap(fb.open(v.envelope, V.keys[v.recipient].x25519_private))
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && m.version === v.opens_to.version
})
for (const v of V.sealed.cases) attempt(`sealed: ${v.name}`, () => {
  const m = fb.openCopy(v.message, V.keys[v.recipient].x25519_private)
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && same(m.reveals, v.opens_to.reveals) && fb.headerSignedBy(v.message, pub(v.signer))
})
for (const v of V.headers) report(same(fb.header({ hash: v.hash, ...byHash.get(v.hash) }), v.header) && fb.verifyMessage({ ...v.header, signature: v.header_signature }, pub(v.signer)), `header: ${v.name}`)

// Identities: which blocks are their author's, which keys speak, who operates an agent.
for (const v of V.identities) {
  const held = blocksOf(v.blocks), options = v.arrivals ? { arrivedAt: (hash) => v.arrivals[hash] } : {}
  for (const b of held) if (b.hash in v.signed_by_author) report(fb.identity.signedByAuthor(b, held, options) === v.signed_by_author[b.hash], `identity: ${v.name}: ${v.blocks.find((x) => x.hash === b.hash).name} ${v.signed_by_author[b.hash] ? 'stands' : 'is void'}`)
  if (v.keys) report(same(fb.identity.keysOf(v.id, held, options).sort(), v.keys), `identity: ${v.name}: the keys that speak`)
  if (v.frozen) report(same(fb.identity.keyTimeline(v.id, held).filter((k) => k.frozen).map((k) => k.key).sort(), v.frozen), `identity: ${v.name}: the frozen keys`)
  if (v.operators) report(same(fb.grant.operatorsOf(v.id, held), v.operators), `identity: ${v.name}: its operators`)
  if (v.history) {
    const state = fb.identityState(v.id, held, options)
    report(state.history === v.history && same(state.keys, v.keys) && (!v.frozen || same(state.frozen, v.frozen)) && Object.entries(v.signed_by_author).every(([hash, ok]) => state.signed_by_author[hash] === ok), `identity: ${v.name}: the identity fold (signed_by_author, keys, frozen, history)`)
  }
  for (const [hash, ok] of Object.entries(v.under || {})) report(!fb.grant.whyNotUnder(held.find((b) => b.hash === hash), held).length === ok, `identity: ${v.name}: a block under the grant speaks for its grantor`)
}

// Folds.
const stageOf = (v) => { const held = blocksOf(v.blocks); return fb.promiseStage(held.find((b) => b.hash === v.first), held, v.now ? { now: v.now } : {}) }
const subset = (got, want) => Object.entries(want).every(([key, value]) => same(got[key], value))
for (const v of [...V.deals, ...V.folds.promises]) attempt(`promise fold: ${v.name}: ${v.expected.stage}`, () => subset(stageOf(v), v.expected))
for (const v of [...V.circles, ...V.folds.circles]) attempt(`circle fold: ${v.name}`, () => {
  const state = fb.circleState(v.circle, blocksOf(v.blocks))
  const members = Array.isArray(v.expected.members) ? Object.keys(state.members).sort() : Object.fromEntries(Object.entries(state.members).map(([who, m]) => [who, [...m.roles].sort()]))
  const held = blocksOf(v.blocks)
  return same(members, v.expected.members) && same(Object.keys(state.removed).sort(), v.expected.removed)
    && Object.entries(v.may_act || {}).every(([hash, ok]) => fb.fold.mayActAs(held.find((b) => b.hash === hash), v.circle, held) === ok)
})
for (const v of V.folds.audience) for (const c of v.cases) attempt(`audience fold: ${c.name}`, () => { const held = blocksOf(v.blocks); return same(fb.membersThen(held.find((b) => b.hash === c.block), c.recipient, held), c.members) })
for (const v of V.folds.things) {
  const held = blocksOf(v.blocks)
  for (const c of v.where) attempt(`where now: ${c.name}`, () => same(fb.whereNow(held.find((b) => b.hash === c.thing), held), c.places))
  for (const c of v.owners) attempt(`owner: ${c.name}`, () => { const got = fb.fold.ownership(held.find((b) => b.hash === c.thing), held); return got.owner === c.owner && same(got.conflict, c.conflict) })
}

for (const v of V.folds.successors) attempt(`successor: ${v.name}`, () => { const held = blocksOf(v.blocks); return subset(fb.fold.successorState(held.find((b) => b.hash === v.grant), held, { now: v.now, arrivedAt: (hash) => v.arrivals[hash] }), v.expected) })
for (const v of V.folds.ballots) for (const c of v.cases) attempt(`ballot: ${c.name}`, () => fb.fold.countedIn(blocksOf(v.blocks).find((b) => b.hash === c.result), c.commitment, c.counter) === c.counted)
for (const v of V.folds.rekeys) attempt(`circle key: ${v.name}`, () => subset(fb.fold.circleKey(v.circle, blocksOf(v.blocks)), v.expected))

// Refusals: what every node must refuse.
const refusalBlocks = new Map(blocksOf([...V.refusals.blocks, ...stories.flatMap(([, , list]) => list)]).map((b) => [b.hash, b]))
for (const c of V.refusals.cases) attempt(`refused (${c.by}): ${c.name}`, () => {
  if (c.by === 'check') return same(codes(c.block, { held: new Map((c.held || []).map((hash) => [hash, refusalBlocks.get(hash)])) }), c.codes)
  if (c.by === 'accept') {
    const got = fb.sync.accept(c.incoming.map((h) => refusalBlocks.get(h)), c.held.map((h) => refusalBlocks.get(h)))
    // The second of a pair is neither taken nor refused: it is listed in its pair.
    if (c.equivocations) return same(got.taken.map((b) => b.hash), c.taken) && !got.refused.length && same(got.equivocations, c.equivocations)
    return c.incoming.every((h) => got.refused.some((r) => r.hash === h)) && same(codesOf(got.refused), c.codes)
  }
  // A fold's codes say why it counted a block for nothing; the fold returns the stage, which is what is checked.
  if (c.by === 'fold') return subset(stageOf(c), c.expected)
  if (c.by === 'open') { try { fb.openCopy(c.message, V.keys[c.recipient].x25519_private); return false } catch (error) { return same([error.code], c.codes) } }
  return false
})

// Alias reads: one per row, and the earlier deal and circle written in the draft words.
const marks = (read) => ({ type: read.type, state: read.state, refs: read.refs, ...(read.settles ? { settles: read.settles } : {}), ...(read.outside ? { outside: read.outside } : {}), ...(read.retired ? { retired: true } : {}) })
for (const v of V.reads.cases) report(same(marks(fb.readAs(fb.create(v.block.type, v.block.state, v.block.refs))), v.reads_as), `reads: ${v.name}`)
for (const g of V.reads.groups) {
  for (const b of g.blocks) { const read = fb.readAs({ hash: b.hash, ...b.block }); report(same({ type: read.type, state: read.state, refs: read.refs }, b.reads_as) && read.hash === b.hash, `reads: ${g.name}: ${b.name}`) }
  if (g.older_end) { const read = fb.readAs(g.older_end.block), want = g.older_end.reads_as; report(read.type === want.type && read.state.status === want.status && read.state.stop === want.stop && read.refs.updates === want.updates, `reads: an older end (defeats) reads as an updates with status stopped`) }
}

// Messages between nodes: every answer signed by the node.
const M = V.messages, nodeKey = pub(M.node_signer)
report(!fb.sync.pullErrors(M.signed_pull.message, { node: M.node, now: M.signed_pull.now, keys: [pub(M.signed_pull.signer)] }).length, 'message: a signed pull names the node, a fresh nonce and at, and is signed by its asker')
report(fb.sync.pullErrors(M.signed_pull.message, { node: M.node, now: M.signed_pull.now, keys: [pub(M.signed_pull.signer)], seen: () => true }).length > 0, 'message: a signed pull replayed is refused')
report(fb.sync.pullErrors({ ...M.signed_pull.message, node: '0'.repeat(64) }, { node: M.node, now: M.signed_pull.now, keys: [pub(M.signed_pull.signer)] }).length > 0, 'message: a signed pull for another node is refused')
report(fb.identity.keysOf(M.node, blocksOf(V.sealed.blocks)).includes(nodeKey), 'message: the node key is a key of its holder, brought in by a key grant')
report(fb.sync.answerSignedBy(M.pull_answer.message, nodeKey) && M.pull_answer.message.blocks.length === M.pull_answer.matches, 'message: a pull answer is signed by the node')
report(fb.sync.answerSignedBy(M.push_answer.message, nodeKey), 'message: a push answer is signed by the node')
{
  // Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
  // Rebuilt from its parts by the node's key, it is the same message, byte for byte.
  const P = M.push_answer.message, known = new Set(Object.values(fb.CODES).flatMap(Object.keys))
  report(same(Object.keys(P), fb.PROTOCOL.messages.push_answer) && P.refused.every((r) => same(Object.keys(r), fb.PROTOCOL.messages.refusal) && known.has(r.code))
    && P.equivocations.every((pair) => same(pair, [...pair].sort())), 'message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs')
  report(same(fb.sync.pushAnswer(P, { node: P.node, privateKey: V.keys[M.node_signer].private_key }), P), 'message: the push answer rebuilds byte for byte')
}
report(!fb.sync.answerSignedBy({ ...M.push_answer.message, taken: [] }, nodeKey), 'message: a changed answer no longer verifies')
report(!fb.sync.wellKnownErrors(M.discovery).length && same(M.announcement, fb.sync.announcement(M.discovery)), 'message: discovery and its local announcement')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
