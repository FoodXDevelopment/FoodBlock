const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { genesis } = fb.identity

// FoodBlock 1.6 (nodes.md): Pull (signed or not, heads), Push (chain checks, waiting), signed node answers, discovery.
// A signed request carries a counter or a challenge, never a time.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const person = (kind) => { const keys = fb.generateKeypair(); return { keys, me: genesis(keys, { kind, encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt, at: at(0) }) } }
const say = (me, keys, held, text, n, link) => fb.write('observe', { kind: 'note', text }, {}, { author: me.hash, key: keys, held, at: at(n), link })

test('push: a node takes only what its authors signed; it refuses with a code', () => {
  const { keys, me } = person()
  const good = say(me, keys, [me], 'Oats', 1)
  const forged = { ...good, state: { ...good.state, text: 'Gold' } }
  forged.hash = fb.hash(forged.type, forged.state, forged.refs)
  const { taken, refused } = fb.sync.accept([good, forged, me])
  assert.deepEqual(taken.map((block) => block.hash).sort(), [me.hash, good.hash].sort())
  assert.deepEqual(refused.map((item) => [item.hash, item.code]), [[forged.hash, 'bad_signature']])
})

test('push: two blocks from one key naming one prev prove a lie; a block whose prev is not held waits', () => {
  const { keys, me } = person()
  const one = say(me, keys, [me], 'two trays', 1), other = say(me, keys, [me], 'five trays', 1)
  const { taken, refused, equivocations } = fb.sync.accept([other], [me, one])
  assert.deepEqual([taken.length, refused, equivocations], [0, [], [[one.hash, other.hash].sort()]], 'the second of a pair is neither taken nor refused')
  const answer = fb.sync.pushAnswer({ taken, waiting: [], refused, equivocations }, { node: me.hash, privateKey: keys.private_key })
  assert.deepEqual([answer.refused, answer.equivocations], [[], [[one.hash, other.hash].sort()]])
  assert.deepEqual(fb.sync.pushAnswer({ taken: [] }, { node: me.hash, privateKey: keys.private_key }).equivocations, [], 'equivocations is always there')
  const third = say(me, keys, [me, one], 'later', 3, { seq: 2, prev: 'f'.repeat(64) })
  assert.deepEqual(fb.sync.accept([third], [me, one]).waiting, [{ hash: third.hash, needs: ['f'.repeat(64)] }])
})

test('push: every type is taken (open types are stored and passed on); a closed type that breaks the spec is refused', () => {
  const { keys, me } = person()
  const weather = fb.write('weather', { wind: 'north' }, { place: 'a'.repeat(64) }, { author: me.hash, key: keys, held: [me], at: at(1) })
  assert.equal(fb.sync.accept([weather], [me]).taken.length, 1)
  const bad = fb.create('promise', { seq: 1, at: at(2), audience: 'public', colour: 'brown' }, { author: me.hash, prev: me.hash, from: me.hash, what: 'a'.repeat(64) })
  bad.signature = fb.sign(bad, keys.private_key)
  assert.deepEqual(fb.sync.accept([bad], [me]).refused.map((r) => r.code), ['undeclared_field'])
})

test('pull: by arrival number, never a time; filters AND together; heads; a sealed block shows only its header', () => {
  const { keys, me } = person(), { me: node, keys: nodeKeys } = person('node'), friend = person()
  const a = say(me, keys, [me], 'a', 1), b = say(me, keys, [me, a], 'b', 2)
  const secret = fb.write('observe', { kind: 'note', text: 'for my friend' }, {}, { author: me.hash, key: keys, held: [me, a, b], audience: [friend.me.hash], at: at(3) })
  const log = [me, a, b, secret].map((block, i) => ({ n: i + 1, block, header_signature: fb.signMessage(fb.header(block), keys.private_key).signature }))
  const page = fb.sync.answerPull(log, fb.sync.pullRequest({ since: 1, limit: 2, filter: { author: me.hash, type: 'observe' } }), { node: node.hash, privateKey: nodeKeys.private_key })
  assert.deepEqual([page.blocks.map((entry) => entry.n), page.next], [[2, 3], 3])
  assert.equal(fb.sync.answerSignedBy(page, nodeKeys.public_key_sign), true, 'the node signs its answer')
  const heads = fb.sync.answerPull(log, { since: 0, filter: { author: me.hash }, heads: true }, { node: node.hash })
  assert.deepEqual(heads.blocks.map((entry) => entry.n), [4], 'heads: what no other match names by prev or updates')
  const sealed = fb.sync.answerPull(log, { since: 3 }, { node: node.hash }).blocks[0].message
  assert.deepEqual(Object.keys(sealed).sort(), ['header', 'header_signature', 'version'], 'an unsigned pull gets a sealed block\'s public header')
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
  assert.deepEqual(codes({ ...pull, since: 5 }), ['bad_signature'])
  const challenge = fb.sync.newChallenge()
  const byChallenge = fb.sync.signPush({ messages: [] }, { signer: me.hash, node, privateKey: keys.private_key, challenge })
  assert.deepEqual(fb.sync.pushRefusals(byChallenge, options({ issued: [challenge] })), [])
  assert.deepEqual(fb.sync.pushRefusals(byChallenge, options({ issued: [] })).map((one) => one.code), ['replay'])
  assert.throws(() => fb.sync.signPull({ since: 0 }, { signer: me.hash, node, privateKey: keys.private_key }), /exactly one/)
})

test('discovery: .well-known/foodblock names the node, what it holds, its admission rule and three endpoints', () => {
  const doc = fb.sync.wellKnown({ node: 'c'.repeat(64), holds: ['a'.repeat(64)], speaks_for: ['a'.repeat(64)], admission: 'b'.repeat(64), endpoints: { pull: 'https://node.example/pull', push: 'https://node.example/push', challenge: 'https://node.example/challenge' } })
  assert.deepEqual([doc.protocol, doc.version, Object.keys(doc.endpoints)], ['foodblock', '1.6', ['pull', 'push', 'challenge']])
  assert.deepEqual(fb.sync.wellKnownErrors(doc), [])
  assert.deepEqual(Object.keys(fb.sync.announcement(doc)), ['protocol', 'version', 'node', 'endpoints'])
  assert.match(fb.sync.wellKnownErrors({ ...doc, holds: ['me'] })[0], /holds/)
})
