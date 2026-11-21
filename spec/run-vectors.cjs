// Conformance runner: node spec/run-vectors.cjs. Checks every section of spec/vectors.json (and the adversarial
// canonical vectors) against the reference SDK, which runs the one Rust core. Another SDK passes when it reproduces the
// same results. The oracle (spec/oracle/run.cjs) runs the same file against an implementation written from the spec text.
const assert = require('assert/strict')
const fb = require('../sdk/javascript/src/index.cjs')
const { call } = require('../sdk/javascript/src/core.cjs')
const { vectors: adversarial } = require('./canonical-vectors.json')
const V = require('./vectors.json')
const C = require('./conventions-vectors.json')

let pass = 0, fail = 0
const report = (ok, name, why = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !why ? '' : ` (${why})`}`); ok ? pass++ : fail++ }
const same = (a, b) => { try { assert.deepEqual(a, b); return true } catch { return false } }
const attempt = (name, fn) => { try { const out = fn(); report(out !== false, name) } catch (error) { report(false, name, error.message.split('\n')[0]) } }
// The codes a refusal list carries, once each, in order.
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
// What a block's own bytes say (checks 1 to 4, core.md, section 8): the 1.7 op `refusals` is gone; its halves are `valid` and `read`.
// A canonical vector's `refused` is what a writer refuses of the value (write_refusals: a float is `float`, not the wire's `not_canonical`).
const bytesRefusals = (type, state, refs) => { try { return call('write_refusals', { type, state, refs }, []) } catch (e) { return [{ code: e.code || 'not_canonical', detail: e.message }] } }
const pub = (signer) => V.keys[signer].public_key_sign
const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature })
const blocksOf = (list) => list.map(full)
const subset = (got, want) => Array.isArray(want) && Array.isArray(got) && got.length === want.length ? want.every((v, i) => subset(got[i], v))
  : want && typeof want === 'object' && !Array.isArray(want) ? got !== null && typeof got === 'object' && Object.entries(want).every(([k, v]) => subset(got[k], v)) : same(got, want)

// Canonical form: the adversarial cases.
for (const v of adversarial) {
  const h = (b) => fb.hash(b.type, b.state, b.refs), c = (b) => fb.canonical(b.type, b.state, b.refs)
  const ok = !(v.same_as && h(v.block) !== h(v.same_as)) && !(v.not_same_as && h(v.block) === h(v.not_same_as)) && !(v.canonical_contains && !c(v.block).includes(v.canonical_contains))
    && !(v.canonical && c(v.block) !== v.canonical) && !(v.refused && !v.refused.every((code) => codesOf(bytesRefusals(v.block.type, v.block.state, v.block.refs)).includes(code)))
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

// The sealed stories: every block hashes, verifies and passes the strict check on its own bytes.
const stories = [['sealed', 'stories', V.sealed.blocks]]
for (const [group, name, list] of stories) {
  const wrong = []
  for (const b of list) {
    byHash.set(b.hash, b)
    if (fb.hash(b.block.type, b.block.state, b.block.refs, b.suite || 'std') !== b.hash) wrong.push(`${b.name}: hash`)
    if (!fb.verify(full(b), b.signature, pub(b.signer))) wrong.push(`${b.name}: signature`)
    const found = bytesRefusals(b.block.type, b.block.state, b.block.refs)
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
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature
})
for (const v of V.sealed.cases) attempt(`sealed: ${v.name}`, () => {
  const m = fb.openCopy(v.message, V.keys[v.recipient].x25519_private)
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && same(m.reveals, v.opens_to.reveals) && fb.headerSignedBy(v.message, pub(v.signer))
})
// a header is no message (core.md, section 2): its signature is the block's, over the header (headerSignedBy)
for (const v of V.headers) report(same(fb.header({ hash: v.hash, ...byHash.get(v.hash).block }), v.header) && fb.headerSignedBy({ header: v.header, header_signature: v.header_signature }, pub(v.signer)), `header: ${v.name}`)

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
report(fb.identity.liveKeys(MS.node, blocksOf(V.sealed.blocks)).includes(nodeKey), 'message: the node key is a key of its holder, brought in by a key grant')
report(fb.sync.answerSignedBy(MS.pull_answer.message, nodeKey) && MS.pull_answer.message.blocks.length === MS.pull_answer.matches, 'message: a pull answer is signed by the node')
report(fb.sync.answerSignedBy(MS.push_answer.message, nodeKey), 'message: a push answer is signed by the node')
{
  // Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
  const P = MS.push_answer.message, known = new Set(Object.values(fb.CODES).flatMap(Object.keys))
  report(same(Object.keys(P), fb.CONVENTIONS.messages.push_answer.filter((k) => k in P || !fb.CONVENTIONS.messages.push_answer_optional.includes(k))) && P.refused.every((r) => same(Object.keys(r), fb.CONVENTIONS.messages.refusal) && known.has(r.code)) && P.equivocations.every((pair) => same(pair, [...pair].sort())), 'message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs')
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
for (const d of [...V.door, ...C.door]) attempt(`door: ${d.name}`, () => {
  let got
  try { got = call(d.op, ...d.args) } catch (error) { return Boolean(d.error) && (!d.error.code || error.code === d.error.code) && (!d.error.kind || error.kind === d.error.kind) }
  if (d.error) return false
  if (d.codes) return same(codesOf(got), d.codes)
  return d.exact ? same(got, d.expect) : subset(got, d.expect)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
