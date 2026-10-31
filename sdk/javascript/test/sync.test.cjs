const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { genesis } = fb.identity

// FoodBlock 1.7 (nodes.md): Pull (signed or not, heads), Push (chain checks, waiting), signed node answers, discovery.
// A signed request carries a counter or a challenge, never a time.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const person = (kind = 'person') => { const keys = fb.generateKeypair(); return { keys, me: genesis(keys, { audience: 'public', kind, encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, at: at(0) }) } }
const say = (me, keys, held, text, n, link) => fb.write('observe', { kind: 'note', text }, {}, { audience: 'public', author: me.hash, key: keys, held, at: at(n), link })

test('push: a node takes only what its authors signed; it refuses with a code', () => {
  const { keys, me } = person()
  const good = say(me, keys, [me], 'Oats', 1)
  const forged = { ...good, state: { ...good.state, text: 'Gold' } }
  forged.hash = fb.hash(forged.type, forged.state, forged.refs)
  const { taken, refused } = fb.sync.accept([good, forged, me], [], { takesPairs: false })
  assert.deepEqual(taken.map((block) => block.hash).sort(), [me.hash, good.hash].sort())
  assert.deepEqual(refused.map((item) => [item.hash, item.code]), [[forged.hash, 'bad_signature']])
})

test('push: two blocks from one key naming one prev prove a lie; a block whose prev is not held waits', () => {
  const { keys, me } = person()
  const one = say(me, keys, [me], 'two trays', 1), other = say(me, keys, [me], 'five trays', 1)
  const { taken, refused, equivocations } = fb.sync.accept([other], [me, one], { takesPairs: false })
  assert.deepEqual([taken.length, refused, equivocations], [0, [], [[one.hash, other.hash].sort()]], 'the second of a pair is neither taken nor refused')
  const answer = fb.sync.pushAnswer({ taken, waiting: [], refused, equivocations }, { node: me.hash, privateKey: keys.private_key })
  assert.deepEqual([answer.refused, answer.equivocations], [[], [[one.hash, other.hash].sort()]])
  assert.deepEqual(fb.sync.pushAnswer({ taken: [] }, { node: me.hash, privateKey: keys.private_key }).equivocations, [], 'equivocations is always there')
  const third = say(me, keys, [me, one], 'later', 3, { seq: 2, prev: 'f'.repeat(64) })
  assert.deepEqual(fb.sync.accept([third], [me, one], { takesPairs: false }).waiting, [{ hash: third.hash, needs: ['f'.repeat(64)] }])
})

test('push: every type is taken (open types are stored and passed on); a closed type that breaks the spec is refused', () => {
  const { keys, me } = person()
  const weather = fb.write('weather', { wind: 'north' }, { place: 'a'.repeat(64) }, { audience: 'public', author: me.hash, key: keys, held: [me], at: at(1) })
  assert.equal(fb.sync.accept([weather], [me], { takesPairs: false }).taken.length, 1)
  const bad = fb.create('promise', { seq: 1, at: at(2), audience: 'public', colour: 'brown' }, { author: me.hash, prev: me.hash, from: me.hash, what: 'a'.repeat(64) })
  bad.signature = fb.sign(bad, keys.private_key)
  assert.deepEqual(fb.sync.accept([bad], [me], { takesPairs: false }).refused.map((r) => r.code), ['undeclared_field'])
})

test('pull: by arrival number, never a time; filters AND together; heads; a sealed block shows only its header', () => {
  const { keys, me } = person(), { me: node, keys: nodeKeys } = person('node'), friend = person()
  const a = say(me, keys, [me], 'a', 1), b = say(me, keys, [me, a], 'b', 2)
  const secret = fb.write('observe', { kind: 'note', text: 'for my friend' }, {}, { author: me.hash, key: keys, held: [me, a, b], audience: [friend.me.hash], at: at(3) })
  const log = [me, a, b, secret].map((block, i) => ({ n: i + 1, block, header_signature: fb.signMessage(fb.header(block), keys.private_key).signature }))
  const page = fb.sync.answerPull(log, fb.sync.pullRequest({ since: 1, limit: 2, filter: { author: me.hash, type: 'observe' } }), { node: node.hash, privateKey: nodeKeys.private_key, cap: 500, servesPairs: true })
  assert.deepEqual([page.blocks.map((entry) => entry.n), page.next], [[2, 3], 3])
  assert.equal(fb.sync.answerSignedBy(page, nodeKeys.public_key_sign), true, 'the node signs its answer')
  const heads = fb.sync.answerPull(log, { since: 0, filter: { author: me.hash }, heads: true }, { node: node.hash, cap: 500, servesPairs: true })
  assert.deepEqual(heads.blocks.map((entry) => entry.n), [4], 'heads: what no other match names by prev or updates')
  const sealed = fb.sync.answerPull(log, { since: 3 }, { node: node.hash, cap: 500, servesPairs: true }).blocks[0].message
  assert.deepEqual(Object.keys(sealed).sort(), ['header', 'header_signature'], 'an unsigned pull gets a sealed block\'s public header')
  assert.equal(fb.sync.matches(a, { marks: { scheme: 'tel', value: '1' } }, []), false, 'a marks filter needs the mark')
})

test('a signed pull names the node and carries a counter or a challenge: replays and other nodes are refused; no clock is read', () => {
  const { keys, me } = person(), node = 'c'.repeat(64)
  const pull = fb.sync.signPull({ since: 0 }, { signer: me.hash, node, privateKey: keys.private_key, counter: 7 })
  assert.equal(pull.at, undefined)
  assert.equal(pull.nonce, undefined)
  const options = (more = {}) => ({ node, keys: [keys.public_key_sign], highest: 6, ...more })
  const codes = (message, more) => fb.sync.pullRefusals(message, options(more)).map((one) => one.code)
  assert.deepEqual(codes(pull), [])
  assert.deepEqual(codes(pull, { highest: 7 }), ['replay'], 'a counter must be above the highest seen')
  assert.deepEqual(codes(pull, { node: 'd'.repeat(64) }), ['wrong_node'])
  // a counter is an integer of signed content, at most 2^53 - 1: past it the signed text writes many counters one way, so one signature
  // would answer for them all (clean round 2, canonical_counter)
  const huge = fb.sync.signPull({ since: 0 }, { signer: me.hash, node, privateKey: keys.private_key, counter: 2 ** 53 + 64 })
  assert.deepEqual(codes(huge), ['replay'])
  assert.deepEqual(codes({ ...pull, since: 5 }), ['bad_signature'])
  const challenge = fb.sync.newChallenge()
  const byChallenge = fb.sync.signPush({ messages: [] }, { signer: me.hash, node, privateKey: keys.private_key, challenge })
  assert.deepEqual(fb.sync.pushRefusals(byChallenge, options({ issued: [challenge] })), [])
  assert.deepEqual(fb.sync.pushRefusals(byChallenge, options({ issued: [] })).map((one) => one.code), ['replay'])
  assert.throws(() => fb.sync.signPull({ since: 0 }, { signer: me.hash, node, privateKey: keys.private_key }), /exactly one/)
})

test('discovery: .well-known/foodblock names the node, what it holds, its admission rule and three endpoints', () => {
  const doc = fb.sync.wellKnown({ node: 'c'.repeat(64), holds: ['a'.repeat(64)], speaks_for: ['a'.repeat(64)], admission: 'b'.repeat(64), endpoints: { pull: 'https://node.example/pull', push: 'https://node.example/push', challenge: 'https://node.example/challenge' } })
  assert.deepEqual([doc.protocol, doc.version, Object.keys(doc.endpoints)], ['foodblock', '1.7', ['pull', 'push', 'challenge']])
  assert.deepEqual(fb.sync.wellKnownErrors(doc), [])
  assert.deepEqual(Object.keys(fb.sync.announcement(doc)), ['protocol', 'version', 'node', 'endpoints'])
  assert.match(fb.sync.wellKnownErrors({ ...doc, holds: ['me'] })[0], /holds/)
})

test('push: authority rests on blocks, so a block waits for them and is judged once; a pair that arrives together is taken by neither', () => {
  const { keys, me } = person()
  const ag = person('agent')
  const grant = fb.write('grant', { kind: 'shop', scope: { acts: ['promise'], until: '2026-12-31T00:00:00.000Z' } }, { to: ag.me.hash }, { audience: 'public', author: me.hash, key: keys, held: [me, ag.me], at: at(1) })
  const offer = fb.write('promise', { terms: { expires: '2026-10-20T00:00:00.000Z' } }, { from: me.hash, what: me.hash, under: grant.hash }, { audience: 'public', author: ag.me.hash, key: ag.keys, held: [me, ag.me, grant], at: at(2) })
  assert.deepEqual(fb.sync.accept([offer], [me, ag.me], { takesPairs: false }).waiting, [{ hash: offer.hash, needs: [grant.hash] }], 'the grant it acts under is a block it needs')
  assert.deepEqual(fb.sync.accept([offer, grant], [me, ag.me], { takesPairs: false }).taken.map((b) => b.hash), [grant.hash, offer.hash])
  const one = say(me, keys, [me], 'two trays', 1), other = say(me, keys, [me], 'five trays', 1)
  for (const order of [[one, other], [other, one]]) {
    const { taken, equivocations } = fb.sync.accept(order, [me], { takesPairs: false })
    assert.deepEqual([taken.length, equivocations], [0, [[one.hash, other.hash].sort()]])
  }
})

test('push: a sealed block is checked by its public header in the core; a header and a body of one hash are two halves of one block', () => {
  const { keys, me } = person()
  const first = say(me, keys, [me], 'one', 1)
  const body = say(me, keys, [me, first], 'two', 2)
  const header = fb.header(body)
  const sign = (h, privateKey) => { const { signature, ...rest } = fb.call ? fb.call('sign_message', h, privateKey, 'std') : require('../src/core.cjs').call('sign_message', h, privateKey, 'std'); return { header: rest, header_signature: signature } }
  const message = sign(header, keys.private_key)
  assert.deepEqual(fb.sync.acceptSealed([message], [me, first], { takesPairs: false }).taken, [message])
  assert.deepEqual(fb.sync.acceptSealed([sign({ ...header, seq: 5 }, keys.private_key)], [me, first], { takesPairs: false }).refused.map((r) => r.code), ['chain'])
  // the body arrives for the header already held: the other half, not a duplicate
  assert.deepEqual(fb.sync.accept([body], [me, first, message], { takesPairs: false }).taken.map((b) => b.hash), [body.hash])
  // and the header for a body held
  assert.deepEqual(fb.sync.acceptSealed([message], [me, first, body], { takesPairs: false }).taken, [message])
})

test('a node\'s own choices are stated, never filled: its cap, whether it serves and takes pairs, its admission rule and count', () => {
  const { keys, me } = person()
  const one = say(me, keys, [me], 'two trays', 1), other = say(me, keys, [me], 'five trays', 1)
  const node = person('machine')
  const log = [{ n: 1, block: me }, { n: 2, block: one }, { n: 3, block: other }]
  const ask = { since: 0, filter: { hash: one.hash } }
  const answer = (choices) => fb.sync.answerPull(log, ask, { node: node.me.hash, ...choices })
  assert.throws(() => answer({ servesPairs: true }), /cap/, 'no cap: refused, not 500')
  assert.throws(() => answer({ cap: 0, servesPairs: true }), /cap/)
  assert.throws(() => answer({ cap: 5 }), /serves_pairs/)
  assert.deepEqual(answer({ cap: 5, servesPairs: true }).blocks.map((b) => b.n), [2, 3], 'a node that serves a pair\'s proof sends the other half')
  assert.deepEqual(answer({ cap: 5, servesPairs: false }).blocks.map((b) => b.n), [2], 'a node that does not sends only what matches')
  assert.throws(() => fb.sync.accept([one, other], [me]), /takes_pairs/)
  assert.throws(() => fb.sync.acceptSealed([], [me]), /takes_pairs/)
  const pair = [[one.hash, other.hash].sort()]
  const kept = fb.sync.accept([one, other], [me], { takesPairs: false }), took = fb.sync.accept([one, other], [me], { takesPairs: true })
  assert.deepEqual([kept.taken.length, kept.equivocations], [0, pair])
  assert.deepEqual([took.taken.length, took.equivocations], [2, pair], 'a node that takes pairs takes both, and still lists the pair')
  const stranger = person().me
  assert.throws(() => fb.sync.admissionRefusals(one, stranger.hash, [me], undefined, 0), /admission/, 'the rule, or an explicit null')
  assert.throws(() => fb.sync.admissionRefusals(one, stranger.hash, [me], null), /strangersToday/)
  assert.deepEqual(fb.sync.admissionRefusals(one, stranger.hash, [me], null, 0), [])
  assert.equal(fb.sync.pullCap, undefined, 'the core names no cap of its own')
})
