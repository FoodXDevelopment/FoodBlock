import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fb from '../../src/files/sdk.cjs'
import { initHost } from '../../src/files/host.mjs'
import { serve } from '../../src/files/server.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'refnode-'))
const promise = { cap: 100, servesPairs: true, takesPairs: false, allow: null, perStranger: 1000, strangersPerDay: 10000, admission: null, copyRecipients: 10, copyBytes: 1000000 }
const at = (i) => `2026-11-08T09:${String(i).padStart(2, '0')}:00.000Z`
const SECRET = 'THE-SECRET-RECIPE-TEXT'

const person = (i) => { const keys = fb.generateKeypair(), enc = fb.generateEncryptionKeypair(), genesis = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(i) }); return { keys, enc, genesis, id: genesis.hash, wrapped: fb.wrap(genesis) } }
// Alice writes one public note then one sealed block, sealed to Bob and to herself. Eve is a third person the block is not sealed to.
function world() {
  const alice = person(0), bob = person(1), eve = person(2)
  const note = fb.write('thing', { kind: 'note', name: 'public note' }, {}, { author: alice.id, key: alice.keys, held: [alice.genesis], at: at(3), audience: 'public' })
  const composed = fb.write('observe', { kind: 'note', text: SECRET }, {}, { author: alice.id, key: alice.keys, held: [alice.genesis, note], at: at(4), audience: [bob.id, alice.id] })
  const { salts, ...signed } = composed
  const message = fb.sealCopy(signed, { keys: [bob.enc.public_key_encrypt, alice.enc.public_key_encrypt], reveals: [fb.revealFor(salts, bob.id), fb.revealFor(salts, alice.id)] })
  return { alice, bob, eve, note, signed, message, hash: signed.hash }
}
let counter = 0
const signedPush = (who, host, body) => fb.sync.signPush(body, { signer: who.id, node: host.node, privateKey: who.keys.private_key, counter: ++counter })
const signedPull = (who, host, body = { since: 0 }) => fb.sync.signPull(body, { signer: who.id, node: host.node, privateKey: who.keys.private_key, counter: ++counter })
// the host keeps everyone's genesis (public); Alice pushes her blocks signed, naming whom her sealed block is for
function seeded(w, host = initHost(tmp(), promise)) {
  host.ingest([w.alice.wrapped, w.bob.wrapped, w.eve.wrapped, fb.wrap(w.note)])
  const result = host.ingest(signedPush(w.alice, host, { messages: [w.message], for: { [w.hash]: [w.bob.id, w.alice.id] } }).messages, { copiesBy: w.alice.id, forWhom: { [w.hash]: [w.bob.id, w.alice.id] } })
  return { host, result }
}
const serveHost = async (host) => { const s = await serve(host, { port: 0 }); return { s, url: `http://127.0.0.1:${s.address().port}` } }
const post = async (url, route, body, headers = {}) => { const r = await fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: fb.canonicalJSON(body) }); return { status: r.status, body: await r.json() } }

test('a sealed block is stored and exported unopened', () => {
  const w = world(), { host, result } = seeded(w)
  assert.deepEqual(result.taken, [w.hash]); assert.deepEqual(result.refused, [])
  const dir = host.dir, kept = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  assert.ok(!kept.includes(SECRET), 'the words of the sealed block are nowhere in what the host keeps')
  assert.ok(!kept.includes(w.alice.keys.private_key) && !kept.includes(w.alice.enc.x25519_private), 'none of her keys are there')
  assert.equal(host.store.entries().find((e) => e.hash === w.hash).message.envelope, undefined, 'the block row is the header alone')
  // her signed export carries the envelope exactly as she sealed it, and a recipient can open it with their own key
  const doc = host.exportRecord([], { forSigner: w.alice.id })
  assert.equal(doc.copies.length, 2)
  const bobsCopy = doc.copies.find((c) => c.recipient === w.bob.id)
  assert.deepEqual(bobsCopy.message, w.message)
  assert.equal(fb.openCopy(bobsCopy.message, w.bob.enc.x25519_private).state.text, SECRET)
  assert.ok(!JSON.stringify(doc.messages).includes(SECRET), 'the plain part of the export holds only the header')
})

test('a forged sealed block is refused', () => {
  const w = world(), host = initHost(tmp(), promise)
  host.ingest([w.alice.wrapped, w.bob.wrapped, fb.wrap(w.note)])
  const flip = (c) => (c === 'a' ? 'b' : 'a')
  const badSignature = { ...w.message, header_signature: w.message.header_signature.replace(/^./, flip) }
  const r1 = host.ingest([badSignature])
  assert.equal(r1.taken.length, 0); assert.equal(r1.refused[0].code, 'bad_signature')
  // a thief signs a header claiming Alice as author
  const thief = fb.generateKeypair()
  const stolen = { ...w.message, header_signature: fb.signMessage(w.message.header, thief.private_key) }
  assert.equal(host.ingest([stolen]).taken.length, 0)
  // a header that skips ahead in her chain
  const skipped = { ...w.message, header: { ...w.message.header, seq: 9 } }
  assert.equal(host.ingest([skipped]).taken.length, 0)
  assert.equal(host.store.count(), 3)
  // and a copy cannot be hung on a header it does not describe
  assert.equal(host.store.addCopy(w.hash, w.bob.id, w.message), false)
})

test('a reader it is not sealed to does not get it', async () => {
  const w = world(), { host } = seeded(w)
  const copiesIn = (answer) => answer.blocks.filter((b) => b.message.envelope).map((b) => b.message)
  const seen = (answer) => answer.blocks.map((b) => b.message)
  // anyone, unsigned: the public header of the sealed block and nothing more
  const open = host.pull({ since: 0 })
  assert.deepEqual(copiesIn(open), [])
  assert.ok(!JSON.stringify(open).includes('"envelope"'))
  assert.ok(!seen(open).some((m) => m.header?.hash === w.hash), 'a sealed block, header and all, goes only to its audience (privacy.md)')
  // Eve, a real signed pull, not in the audience
  const eves = host.pull(signedPull(w.eve, host))
  assert.ok(!seen(eves).some((m) => m.header?.hash === w.hash), 'not even its header')
  assert.deepEqual(copiesIn(eves), []); assert.ok(!JSON.stringify(eves).includes('"envelope"'))
  // Bob, sealed to: gets his copy, and it opens
  const bobs = host.pull(signedPull(w.bob, host))
  assert.equal(copiesIn(bobs).length, 1)
  const copy = copiesIn(bobs)[0]
  assert.equal(fb.openCopy(copy, w.bob.enc.x25519_private).state.text, SECRET)
  // a replayed or forged signed pull is refused
  const again = signedPull(w.bob, host)
  host.pull(again)
  assert.throws(() => host.pull(again), /counter|replay|highest/i)
  assert.throws(() => host.pull({ ...signedPull(w.eve, host), signer: w.bob.id }), /./)
  // Eve's signed export has no copies of Alice's block; Alice's own has them all
  assert.deepEqual(host.exportRecord([], { forSigner: w.eve.id }).copies, [])
  assert.equal(host.exportRecord([], { forSigner: w.bob.id }).copies.length, 1)
  // over HTTP the same: the unsigned export holds no copies at all
  const { s, url } = await serveHost(host)
  // F7: an unsigned export names the authors whose record it asks for; the whole store is the owner's
  assert.equal((await fetch(url + '/export')).status, 401)
  const plain = await (await fetch(url + `/export?author=${w.alice.id}`)).json()
  const eveExport = await post(url, '/export', signedPull(w.eve, host))
  s.close()
  assert.equal(plain.copies, undefined); assert.deepEqual(eveExport.body.copies, [])
})

test('an envelope is kept only from the block\'s own author, in a signed push', () => {
  const w = world(), host = initHost(tmp(), promise)
  host.ingest([w.alice.wrapped, w.bob.wrapped, w.eve.wrapped, fb.wrap(w.note)])
  // pushed unsigned: the header is kept, the envelope is dropped
  host.ingest([w.message])
  assert.equal(host.store.allCopies().length, 0)
  // Eve pushes the same message in a push she signed: not her block, so no copy
  host.ingest([w.message], { copiesBy: w.eve.id, forWhom: { [w.hash]: [w.eve.id] } })
  assert.equal(host.store.allCopies().length, 0)
  // Alice pushes it signed: now the copies are kept
  host.ingest([w.message], { copiesBy: w.alice.id, forWhom: { [w.hash]: [w.bob.id] } })
  assert.deepEqual(host.store.allCopies().map((c) => c.recipient), [w.bob.id])
})

test('her whole record, private blocks too, moves between hosts', async () => {
  const w = world(), { host: a } = seeded(w), b = initHost(tmp(), promise)
  const { s, url } = await serveHost(a), B = await serveHost(b)
  const doc = (await post(url, '/export', signedPull(w.alice, a))).body
  // loading copies needs the new host's owner
  const refusedCopies = await post(B.url, '/import', doc)
  assert.equal(refusedCopies.status, 401)
  assert.equal(b.store.count(), 0, 'nothing was written by the refused import')
  const loaded = await post(B.url, '/import', doc, { authorization: `Bearer ${b.config.adminToken}` })
  s.close(); B.s.close()
  assert.equal(loaded.body.wrote, true); assert.equal(loaded.body.copied, 2)
  assert.deepEqual(b.store.entries().map((e) => e.hash), a.store.entries().map((e) => e.hash), 'the same chain')
  assert.ok(b.store.entries().some((e) => e.hash === w.hash && e.sealed))
  // Bob asks the new host and reads it with his own key; Eve still does not get it
  const copy = b.pull(signedPull(w.bob, b)).blocks.find((x) => x.message.envelope).message
  assert.equal(fb.openCopy(copy, w.bob.enc.x25519_private).state.text, SECRET)
  assert.deepEqual(b.pull(signedPull(w.eve, b)).blocks.filter((x) => x.message.envelope), [])
  // and out again, the same
  assert.deepEqual(b.exportRecord([], { copies: 'all' }), a.exportRecord([], { copies: 'all' }))
})

test('/sync over HTTP with the owner token', async () => {
  const w = world(), { host: a } = seeded(w), b = initHost(tmp(), promise)
  b.ingest([person(7).wrapped])
  const A = await serveHost(a), B = await serveHost(b)
  const wrong = await post(A.url, '/sync', { peer: B.url }, { authorization: 'Bearer nope' })
  const none = await post(A.url, '/sync', { peer: B.url })
  const ok = await post(A.url, '/sync', { peer: B.url }, { authorization: `Bearer ${a.config.adminToken}` })
  const again = await post(A.url, '/sync', { peer: B.url }, { authorization: `Bearer ${a.config.adminToken}` })
  A.s.close(); B.s.close()
  assert.equal(wrong.status, 401); assert.equal(none.status, 401)
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { took: 1, gave: 5 })
  assert.deepEqual(again.body, { took: 0, gave: 0 }, 'a second sync moves nothing')
  const hashes = (h) => h.store.entries().map((e) => e.hash).sort()
  assert.deepEqual(hashes(a), hashes(b)); assert.equal(hashes(a).length, 6)
  // sync is the owner's own: it carries headers only, so B holds the sealed block's header but never its envelope
  assert.equal(b.store.allCopies().length, 0)
  assert.ok(b.store.entries().find((e) => e.hash === w.hash).sealed)
})

// A block that reached the host with its body in the clear but whose audience is not public: every door gives its header, never its text.
test('a private body held in the clear leaves by no door: pull, export (plain and signed), sync push', async () => {
  const w = world(), host = initHost(tmp(), promise)
  host.ingest([w.alice.wrapped, w.bob.wrapped, w.eve.wrapped, fb.wrap(w.note)])
  const taken = host.ingest([{ block: { type: w.signed.type, state: w.signed.state, refs: w.signed.refs }, signature: w.message.header_signature }])
  assert.deepEqual(taken.taken, [w.hash], 'the host holds the plain body')
  const out = (x) => JSON.stringify(x).includes(SECRET)
  assert.ok(!out(host.pull({ since: 0 })), 'pull')
  assert.ok(!out(host.exportRecord()), 'export')
  assert.ok(!out(host.exportRecord([w.alice.id], { forSigner: w.bob.id })), 'signed export, even for one in the audience')
  assert.ok(!out(host.exportRecord([], { copies: 'all' })), 'the owner\'s export')
  const { s, url } = await serveHost(host)
  // F7: an unsigned export names the authors whose record it asks for; the whole store is the owner's
  assert.equal((await fetch(url + '/export')).status, 401)
  const plain = await (await fetch(url + `/export?author=${w.alice.id}`)).json()
  s.close()
  assert.ok(!out(plain), 'GET /export')
  const header = plain.messages.find((m) => m.header?.hash === w.hash)
  assert.equal(header, undefined, 'a non-public block is given to no one without a copy for them: not even as its header')
  // a peer that syncs with this host is given the same
  const peer = initHost(tmp(), promise), got = []
  const ps = await serve(peer, { port: 0 }); const realIngest = peer.ingest
  peer.ingest = (m, o) => { got.push(...m); return realIngest(m, o) }
  await host.sync(`http://127.0.0.1:${ps.address().port}`)
  ps.close()
  assert.ok(got.length && !out(got), 'sync push')
})
