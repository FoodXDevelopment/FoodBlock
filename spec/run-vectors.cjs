// Conformance runner: node spec/run-vectors.cjs. Checks every section of spec/vectors.json (and the adversarial
// canonical vectors) against the reference SDK, which runs the one Rust core. Another SDK passes when it reproduces the
// same results. The oracle (spec/oracle/run.cjs) runs the same file against an implementation written from the spec text.
const assert = require('assert/strict')
const fb = require('../sdk/javascript/src/index.cjs')
const { call } = require('../sdk/javascript/src/core.cjs')
const { vectors: adversarial } = require('./canonical-vectors.json')
const V = require('./vectors.json')

let pass = 0, fail = 0
const report = (ok, name, why = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !why ? '' : ` (${why})`}`); ok ? pass++ : fail++ }
const same = (a, b) => { try { assert.deepEqual(a, b); return true } catch { return false } }
const attempt = (name, fn) => { try { const out = fn(); report(out !== false, name) } catch (error) { report(false, name, error.message.split('\n')[0]) } }
// The codes a refusal list carries, once each, in order.
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
const pub = (signer) => V.keys[signer].public_key_sign
const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature })
const blocksOf = (list) => list.map(full)
const subset = (got, want) => Array.isArray(want) && Array.isArray(got) && got.length === want.length ? want.every((v, i) => subset(got[i], v))
  : want && typeof want === 'object' && !Array.isArray(want) ? Object.entries(want).every(([k, v]) => subset(got && got[k], v)) : same(got, want)

// Canonical form: the adversarial cases.
for (const v of adversarial) {
  const h = (b) => fb.hash(b.type, b.state, b.refs), c = (b) => fb.canonical(b.type, b.state, b.refs)
  const ok = !(v.same_as && h(v.block) !== h(v.same_as)) && !(v.not_same_as && h(v.block) === h(v.not_same_as)) && !(v.canonical_contains && !c(v.block).includes(v.canonical_contains))
    && !(v.canonical && c(v.block) !== v.canonical) && !(v.refused && !v.refused.every((code) => codesOf(fb.refusals(v.block.type, v.block.state, v.block.refs)).includes(code)))
  report(ok, `canonical: ${v.name}`)
}
// The cross-language canonical vectors that predate 1.6 and still hash the same.
for (const v of require('../test/vectors.json')) report(fb.canonical(v.type, v.state, v.refs) === v.expected_canonical && fb.hash(v.type, v.state, v.refs) === v.expected_hash, `canonical (test/vectors.json): ${v.name}`)
for (const v of V.canonical) report(fb.canonical(v.block.type, v.block.state, v.block.refs) === v.canonical && fb.hash(v.block.type, v.block.state, v.block.refs) === v.hash, `canonical: ${v.name}`)

// Hashes: one block of every type, each valid against the blocks before it, its signature opens, one chain per author.
const byHash = new Map()
const ledger = [...V.ledger.genesis, ...V.hashes]
for (const v of ledger) byHash.set(v.hash, v)
{
  const before = []
  for (const v of ledger) {
    const block = full(v)
    if (v.canonical) report(fb.canonical(v.block.type, v.block.state, v.block.refs) === v.canonical && fb.hash(v.block.type, v.block.state, v.block.refs) === v.hash, `hash: ${v.name}`)
    report(fb.hash(v.block.type, v.block.state, v.block.refs) === v.hash && fb.verify(block, v.signature, pub(v.signer)), `ledger: ${v.name}: hash and signature`)
    const wrong = fb.valid(block, before)
    report(!wrong.length, `valid: ${v.name}`, wrong.map((r) => r.code).join(', '))
    before.push(block)
  }
  for (const id of new Set(V.hashes.map((v) => v.block.refs.author))) report(fb.checkChain(V.hashes.filter((v) => v.block.refs.author === id).map(full), id).ok, `chain: ${id.slice(0, 8)}'s blocks, no gaps, no equivocation`)
}
for (const v of V.audience) report(fb.saltedHash(v.salt, v.recipient) === v.commitment, `audience: ${v.name}`)

// Every signed block in every story: its hash and its signature, and every block of a story passes `valid` unless it is
// one a refusal case names.
const stories = [
  ...V.identities.map((v) => ['identity', v.name, v.blocks]), ...V.deals.map((v) => ['deal', v.name, v.blocks]), ...V.circles.map((v) => ['circle', v.name, v.blocks]),
  ...V.folds.promises.map((v) => ['promise fold', v.name, v.blocks]), ...V.folds.circles.map((v) => ['circle fold', v.name, v.blocks]), ...V.folds.audience.map((v) => ['audience fold', v.name, v.blocks]),
  ...V.folds.things.map((v) => ['thing fold', v.name, v.blocks]), ...V.folds.successors.map((v) => ['successor fold', v.name, v.blocks]), ...V.folds.rekeys.map((v) => ['rekey fold', v.name, v.blocks]), ...V.folds.ballots.map((v) => ['ballot fold', v.name, v.blocks]),
  ['refusal', 'stories', V.refusals.blocks], ...V.refusals.cases.filter((c) => c.blocks).map((c) => ['refusal', c.name, c.blocks]), ['sealed', 'stories', V.sealed.blocks]
]
for (const [group, name, list] of stories) {
  const wrong = []
  for (const b of list) {
    byHash.set(b.hash, b)
    if (fb.hash(b.block.type, b.block.state, b.block.refs, b.suite || 'std') !== b.hash) wrong.push(`${b.name}: hash`)
    if (!fb.verify(full(b), b.signature, pub(b.signer))) wrong.push(`${b.name}: signature`)
    const open = V.keys[b.signer].suite || 'std'
    if (open !== (b.suite || 'std')) wrong.push(`${b.name}: suite`)
    // The strict check on the block's own bytes.
    const found = fb.refusals(b.block.type, b.block.state, b.block.refs)
    if (found.length) wrong.push(`${b.name}: ${found.map((r) => r.code).join(', ')}`)
  }
  report(!wrong.length, `${group}: ${name}: ${list.length} blocks hash, verify and pass the check`, wrong.join(' | '))
}
const opens = (v) => byHash.has(v.hash) && fb.verify(full(byHash.get(v.hash)), v.signature, pub(v.signer))
for (const v of V.signatures) report(opens(v), `signature: ${v.name}`)
for (const v of V.bad_signatures) report(!opens(v), `bad signature refused: ${v.name}`)

// Envelopes, and sealed copies with their signed public header.
for (const v of V.envelopes) attempt(`envelope: ${v.name}`, () => {
  const m = fb.unwrap(fb.open(v.envelope, V.keys[v.recipient].x25519_private))
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && m.version === v.opens_to.version
})
for (const v of V.sealed.cases) attempt(`sealed: ${v.name}`, () => {
  const m = fb.openCopy(v.message, V.keys[v.recipient].x25519_private)
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && same(m.reveals, v.opens_to.reveals) && fb.headerSignedBy(v.message, pub(v.signer))
})
for (const v of V.headers) report(same(fb.header({ hash: v.hash, ...byHash.get(v.hash).block }), v.header) && fb.verifyMessage({ ...v.header, signature: v.header_signature }, pub(v.signer)), `header: ${v.name}`)

// Identities: which blocks are their author's, which keys speak, who operates an agent.
for (const v of V.identities) {
  const held = blocksOf(v.blocks), options = v.arrivals ? { arrivedAt: (hash) => v.arrivals[hash] } : {}
  for (const b of held) if (b.hash in v.signed_by_author) report(fb.identity.signedByAuthor(b, held, options) === v.signed_by_author[b.hash], `identity: ${v.name}: ${v.blocks.find((x) => x.hash === b.hash).name} ${v.signed_by_author[b.hash] ? 'stands' : 'is void'}`)
  if (v.keys) report(same(fb.identity.keysOf(v.id, held, options).sort(), v.keys), `identity: ${v.name}: the keys that speak`)
  if (v.frozen) report(same(fb.identity.keyTimeline(v.id, held).filter((k) => k.frozen).map((k) => k.key).sort(), v.frozen), `identity: ${v.name}: the frozen keys`)
  if (v.operators) report(same(fb.grant.operatorsOf(v.id, held), v.operators), `identity: ${v.name}: its operators`)
  {
    const state = fb.identityState(v.id, held, options)
    report(same(state.keys, v.keys) && (!v.frozen || same(state.frozen, v.frozen)) && Object.entries(v.signed_by_author).every(([hash, ok]) => !(hash in state.signed_by_author) || state.signed_by_author[hash] === ok), `identity: ${v.name}: the identity fold (signed_by_author, keys, frozen)`)
  }
  // The limit is the principal's fence: sealed to the agent alone, never read by the grant check, read by the principal's node.
  if (v.fence) {
    const f = v.fence, limit = held.find((b) => b.hash === f.block), grant = held.find((b) => b.hash === f.grant)
    report(limit.refs.for === f.grant && limit.state.kind === 'limit' && same(limit.state.limit, f.limit) && fb.findsSelf(limit, f.agent, f.salt) && !fb.findsSelf(limit, f.principal, f.salt) && limit.state.audience.length === 1, `identity: ${v.name}: sealed to the agent alone`)
    report(grant.state.scope.limit === undefined && Object.keys(v.under).every((hash) => same(fb.grant.whyNotUnder(held.find((b) => b.hash === hash), held), fb.grant.whyNotUnder(held.find((b) => b.hash === hash), held.filter((b) => b !== limit)))), `identity: ${v.name}: the grant check never reads the limit`)
    report(f.within.every((c) => fb.grant.withinLimit(limit, c.money, c.spent) === c.within), `identity: ${v.name}: the principal's node checks the limit (withinLimit)`)
  }
  for (const [hash, ok] of Object.entries(v.under || {})) report(!fb.grant.whyNotUnder(held.find((b) => b.hash === hash), held).length === ok, `identity: ${v.name}: a block under the grant speaks for its grantor`)
}

// Folds.
const stageOf = (v) => { const held = blocksOf(v.blocks); return fb.promiseStage(held.find((b) => b.hash === v.first), held) }
for (const v of [...V.deals, ...V.folds.promises]) attempt(`promise fold: ${v.name}: ${v.expected.stage}`, () => subset(stageOf(v), v.expected))
for (const v of [...V.circles, ...V.folds.circles]) attempt(`circle fold: ${v.name}`, () => {
  const state = fb.circleState(v.circle, blocksOf(v.blocks))
  const members = Array.isArray(v.expected.members) ? Object.keys(state.members).sort() : Object.fromEntries(Object.entries(state.members).map(([who, m]) => [who, [...m.roles].sort()]))
  const held = blocksOf(v.blocks)
  return same(members, v.expected.members) && same(Object.keys(state.removed).sort(), v.expected.removed) && (!v.expected.counted_to || same(state.removed, v.expected.counted_to))
    && Object.entries(v.may_act || {}).every(([hash, ok]) => fb.fold.mayActAs(held.find((b) => b.hash === hash), v.circle, held) === ok)
})
for (const v of V.folds.audience) for (const c of v.cases) attempt(`audience fold: ${c.name}`, () => { const held = blocksOf(v.blocks); return same(fb.membersThen(held.find((b) => b.hash === c.block), c.recipient, held), c.members) })
for (const v of V.folds.things) {
  const held = blocksOf(v.blocks)
  for (const c of v.where) attempt(`where now: ${c.name}`, () => same(fb.whereNow(held.find((b) => b.hash === c.thing), held), c.places))
  for (const c of v.owners) attempt(`owner: ${c.name}`, () => { const got = fb.fold.ownership(held.find((b) => b.hash === c.thing), held); return got.owner === c.owner && same(got.conflict, c.conflict) })
}
for (const v of V.folds.successors) attempt(`successor: ${v.name}`, () => { const held = blocksOf(v.blocks); return subset(fb.fold.successorView(held.find((b) => b.hash === v.grant), held, { now: v.now, arrivedAt: (hash) => v.arrivals[hash] }), v.expected) })
for (const v of V.folds.ballots) for (const c of v.cases) attempt(`ballot: ${c.name}`, () => fb.fold.countedIn(blocksOf(v.blocks).find((b) => b.hash === c.result), c.commitment, c.counter) === c.counted)
for (const v of V.folds.rekeys) attempt(`circle key: ${v.name}`, () => subset(fb.fold.circleKey(v.circle, blocksOf(v.blocks)), v.expected))

// Refusals: what every node must refuse.
const refusalBlocks = new Map(stories.flatMap(([, , list]) => list).map((b) => [b.hash, full(b)]))
for (const c of V.refusals.cases) attempt(`refused (${c.by}): ${c.name}`, () => {
  const held = Array.isArray(c.held) ? c.held.map((hash) => refusalBlocks.get(hash)) : []
  if (c.by === 'check') return same(codesOf(fb.refusals(c.block.type, c.block.state, c.block.refs, { held: new Map(held.map((b) => [b.hash, b])) })), c.codes)
  if (c.by === 'valid') return same(codesOf(fb.valid(c.block, held)), c.codes)
  if (c.by === 'accept') {
    const incoming = c.inline || c.incoming.map((h) => refusalBlocks.get(h))
    const got = fb.sync.accept(incoming, held)
    // The second of a pair is neither taken nor refused: it is listed in its pair.
    if (c.equivocations) return same(got.taken.map((b) => b.hash), c.taken) && !got.refused.length && same(got.equivocations, c.equivocations)
    if (c.waiting) return same(got.waiting.map((w) => w.hash), c.waiting) && !got.refused.length
    if (c.taken) return same(got.taken.map((b) => b.hash), c.taken)
    return c.incoming.every((h) => got.refused.some((r) => r.hash === h)) && same(codesOf(got.refused), c.codes)
  }
  // A fold's codes say why it counted a block for nothing; the fold returns the stage, which is what is checked.
  if (c.by === 'fold') return subset(stageOf(c), c.expected)
  if (c.by === 'may_act_as') { const blocks = blocksOf(c.blocks); return fb.fold.mayActAs(blocks.find((b) => b.hash === c.block), c.circle, blocks) === c.ok }
  if (c.by === 'under') { const blocks = [...refusalBlocks.values()]; return !fb.grant.whyNotUnder(refusalBlocks.get(c.block), blocks).length === c.live }
  if (c.by === 'open') { try { fb.openCopy(c.message, V.keys[c.recipient].x25519_private); return false } catch (error) { return same([error.code], c.codes) } }
  return false
})

// Messages between nodes: every answer signed by the node; a signed request carries a counter or a challenge, no time.
const MS = V.messages, nodeKey = pub(MS.node_signer)
{
  const jem = pub(MS.signed_pull.signer), p = MS.signed_pull, c = MS.signed_pull_challenge
  report(!fb.sync.pullRefusals(p.message, { node: MS.node, keys: [jem], highest: p.highest }).length && p.message.at === undefined, 'message: a signed pull names the node and a counter above the highest seen, and carries no time')
  report(same(codesOf(fb.sync.pullRefusals(p.message, { node: MS.node, keys: [jem], highest: p.message.counter })), ['replay']), 'message: a counter that is not above the highest seen is a replay')
  report(!fb.sync.pullRefusals(c.message, { node: MS.node, keys: [jem], issued: [c.challenge] }).length, 'message: a challenge the node issued is taken')
  report(same(codesOf(fb.sync.pullRefusals(c.message, { node: MS.node, keys: [jem], issued: [] })), ['replay']), 'message: a challenge the node did not issue, or has seen used, is a replay')
  report(same(codesOf(fb.sync.pullRefusals(p.message, { node: '0'.repeat(64), keys: [jem], highest: p.highest })), ['wrong_node']), 'message: a signed pull for another node is refused')
  report(same(codesOf(fb.sync.pullRefusals({ ...p.message, since: 1 }, { node: MS.node, keys: [jem], highest: p.highest })), ['bad_signature']), 'message: a changed request no longer verifies')
  report(!fb.sync.pushRefusals(MS.signed_push.message, { node: MS.node, keys: [pub(MS.signed_push.signer)], highest: MS.signed_push.highest }).length, 'message: a signed push')
}
report(fb.identity.keysOf(MS.node, blocksOf(V.sealed.blocks)).includes(nodeKey), 'message: the node key is a key of its holder, brought in by a key grant')
report(fb.sync.answerSignedBy(MS.pull_answer.message, nodeKey) && MS.pull_answer.message.blocks.length === MS.pull_answer.matches, 'message: a pull answer is signed by the node')
report(fb.sync.answerSignedBy(MS.push_answer.message, nodeKey), 'message: a push answer is signed by the node')
{
  // Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
  const P = MS.push_answer.message, known = new Set(Object.values(fb.CODES).flatMap(Object.keys))
  report(same(Object.keys(P), fb.PROTOCOL.messages.push_answer) && P.refused.every((r) => same(Object.keys(r), fb.PROTOCOL.messages.refusal) && known.has(r.code)) && P.equivocations.every((pair) => same(pair, [...pair].sort())), 'message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs')
  report(same(fb.sync.pushAnswer(P, { node: P.node, privateKey: V.keys[MS.node_signer].private_key }), P), 'message: the push answer rebuilds byte for byte')
  const Q = MS.push
  report(same(fb.sync.pushRequest(Q.request.messages, Q.request.for), Q.request) && same(Q.request.for[Q.hash], Q.recipients) && Q.recipients.length === 2, 'message: a push names the list of ids each sealed copy is for')
}
report(!fb.sync.answerSignedBy({ ...MS.push_answer.message, taken: [] }, nodeKey), 'message: a changed answer no longer verifies')
report(!fb.sync.wellKnownErrors(MS.discovery).length && same(MS.announcement, fb.sync.announcement(MS.discovery)) && 'challenge' in MS.discovery.endpoints, 'message: discovery names the challenge endpoint, and its local announcement')

// The compact form: block <-> CBOR bytes, text keys and key table 1; the id is the hash of the canonical JSON.
const fromHex = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'))
for (const c of V.cbor.cases) attempt(`cbor: ${c.name}`, () => {
  const block = { hash: c.hash, ...c.block, signature: c.signature }
  const text = fb.cbor.encode(block), short = fb.cbor.encode(block, { short: true })
  return Buffer.from(text).toString('hex') === c.cbor && Buffer.from(short).toString('hex') === c.cbor_short
    && same(fb.cbor.decode(fromHex(c.cbor)), block) && same(fb.cbor.decode(fromHex(c.cbor_short)), block) && fb.hash(c.block.type, c.block.state, c.block.refs) === c.hash
    && Buffer.byteLength(fb.canonical(c.block.type, c.block.state, c.block.refs)) === c.canonical_bytes
})
attempt(`cbor: ${V.cbor.loose.name}`, () => fb.cbor.decode(fromHex(V.cbor.loose.cbor)).hash === V.cbor.loose.hash)
attempt(`cbor: ${V.cbor.push.name}`, () => {
  const blocks = V.cbor.push.hashes.map((h) => V.cbor.cases.find((c) => c.hash === h)).map((c) => ({ hash: c.hash, ...c.block, signature: c.signature }))
  return Buffer.from(fb.cbor.encodePush(blocks)).toString('hex') === V.cbor.push.cbor && same(fb.cbor.decodePush(fromHex(V.cbor.push.cbor_short)), blocks)
})
for (const h of V.cbor.headers) attempt(`cbor: ${h.name}`, () => Buffer.from(fb.cbor.encodeHeader(h.header)).toString('hex') === h.cbor && same(fb.cbor.decodeHeader(fromHex(h.cbor_short)), h.header))
for (const r of V.cbor.refused) attempt(`cbor refused: ${r.name}`, () => { try { fb.cbor.decode(fromHex(r.cbor)); return false } catch { return true } })

// The door: one case per rule.
for (const d of V.door) attempt(`door: ${d.name}`, () => {
  let got
  try { got = call(d.op, ...d.args) } catch (error) { return Boolean(d.error) && (!d.error.code || error.code === d.error.code) && (!d.error.kind || error.kind === d.error.kind) }
  if (d.error) return false
  if (d.codes) return same(codesOf(got), d.codes)
  return d.exact ? same(got, d.expect) : subset(got, d.expect)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
