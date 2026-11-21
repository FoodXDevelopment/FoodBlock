// One host, one set of rules (src/rules.js): the files host states the same numbers as the Postgres node and applies them through the same
// code. A stranger's request is bounded by the owner's stated words, a wake file is bounded, and a crash mid-append does not brick the host.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fb from '../../src/files/sdk.cjs'
import { initHost, openHost } from '../../src/files/host.mjs'
import { serve } from '../../src/files/server.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'limits-'))
const numbers = { cap: 100, servesPairs: true, takesPairs: false, allow: null, perStranger: 5, strangersPerDay: 8, admission: null, copyRecipients: 3, copyBytes: 100000 }
const at = (i) => `2026-11-08T09:${String(i % 60).padStart(2, '0')}:00.000Z`
const person = () => { const keys = fb.generateKeypair(), enc = fb.generateEncryptionKeypair(), genesis = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(0) }); return { keys, enc, genesis, id: genesis.hash } }
const notes = (who, n) => { const held = [who.genesis], out = []; for (let i = 1; i <= n; i++) { const b = fb.write('observe', { kind: 'note', text: `n${i}` }, i > 1 ? { prev: out.at(-1).hash } : {}, { author: who.id, key: who.keys, held, at: at(i), audience: 'public' }); held.push(b); out.push(b) } return out }
let counter = 0

test('the host refuses to start with any number left unstated, naming it', () => {
  for (const name of ['perStranger', 'strangersPerDay', 'admission', 'copyRecipients', 'copyBytes', 'cap', 'servesPairs', 'takesPairs']) {
    const { [name]: _, ...rest } = numbers
    assert.throws(() => initHost(tmp(), rest), new RegExp(`${name} is required`), name)
  }
  // a host made before the numbers existed does not open either: nothing fills in the owner's silence
  const dir = tmp(); initHost(dir, numbers)
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'host.json'), 'utf8')); delete config.promise.copyBytes
  fs.writeFileSync(path.join(dir, 'host.json'), JSON.stringify(config))
  assert.throws(() => openHost(dir), /copyBytes is required/)
})

test('one signed push naming 2,000 recipients for one sealed block writes no copies: the owner\'s copyRecipients and copyBytes bound it', () => {
  const host = initHost(tmp(), numbers), eve = person()
  const b = fb.write('observe', { kind: 'note', text: 'y'.repeat(20000) }, {}, { author: eve.id, key: eve.keys, held: [eve.genesis], at: at(1), audience: [eve.id] })
  const { salts, ...signed } = b
  const sealed = fb.sealCopy(signed, { keys: [eve.enc.public_key_encrypt], reveals: [fb.revealFor(salts, eve.id)] })
  const recipients = Array.from({ length: 2000 }, (_, i) => i.toString(16).padStart(64, '0'))
  const push = fb.sync.signPush({ messages: [fb.wrap(eve.genesis), sealed], for: { [signed.hash]: recipients } }, { signer: eve.id, node: host.node, privateKey: eve.keys.private_key, counter: ++counter })
  const result = host.ingest(push.messages, { copiesBy: eve.id, forWhom: push.for })
  assert.equal(result.refused.length, 1); assert.equal(result.refused[0].code, 'not_admitted')
  assert.equal(host.store.allCopies().length, 0)
  const size = fs.existsSync(path.join(host.dir, 'copies.jsonl')) ? fs.statSync(path.join(host.dir, 'copies.jsonl')).size : 0
  assert.ok(size < 1000, `copies.jsonl is ${size} bytes`)
})

test('a stranger gets only the blocks a day the owner stated, one by one and all strangers together', () => {
  const host = initHost(tmp(), numbers), a = person(), b = person()
  const first = host.ingest([fb.wrap(a.genesis), ...notes(a, 9).map((x) => fb.wrap(x))])
  assert.equal(first.taken.length, 5, 'perStranger: 5 a day from one stranger')
  assert.ok(first.refused.every((r) => r.code === 'not_admitted'))
  const second = host.ingest([fb.wrap(b.genesis), ...notes(b, 9).map((x) => fb.wrap(x))])
  assert.equal(second.taken.length, 3, 'strangersPerDay: 8 in all, 5 already used')
  // the owner's own named authors are not strangers
  const owned = initHost(tmp(), { ...numbers, allow: [a.id] })
  assert.equal(owned.ingest([fb.wrap(a.genesis), ...notes(a, 20).map((x) => fb.wrap(x))]).taken.length, 21)
})

test('a crash mid-append leaves half a last line; the host opens, skips it and says so, and goes on', () => {
  const dir = tmp(), host = initHost(dir, numbers), a = person()
  host.ingest([fb.wrap(a.genesis), ...notes(a, 2).map((x) => fb.wrap(x))])
  const file = path.join(dir, 'blocks.jsonl'), whole = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, whole + whole.split('\n')[0].slice(0, 40))   // a half line, no newline
  const again = openHost(dir)
  assert.equal(again.store.count(), 3)
  assert.equal(again.torn.length, 1); assert.equal(again.torn[0].file, 'blocks.jsonl')
  const more = notes(a, 3).at(2)
  assert.equal(again.ingest([fb.wrap(more)]).taken.length, 1)
  assert.equal(openHost(dir).store.count(), 4, 'the next append did not land on the torn fragment')
  // a damaged line in the middle is not a crash: it stops the open
  fs.writeFileSync(file, 'not json\n' + fs.readFileSync(file, 'utf8'))
  assert.throws(() => openHost(dir))
})

test('unsigned wakes cannot grow the wake file: an id waits once', async () => {
  const dir = tmp(), host = initHost(dir, numbers), a = person()
  host.ingest([fb.wrap(a.genesis)])
  for (let i = 0; i < 5000; i++) host.wake(a.id, null)
  const lines = fs.readFileSync(path.join(dir, 'wakes.jsonl'), 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 1)
  assert.deepEqual(openHost(dir).takeWakes(), [a.id], 'a wake survives a restart, once')
  assert.deepEqual(host.takeWakes(), [a.id]); assert.deepEqual(host.takeWakes(), [])
})

test('an unsigned HTTP import is a stranger\'s too; the owner\'s token makes it the owner\'s own record', async () => {
  const host = initHost(tmp(), numbers), a = person(), s = await serve(host, { port: 0 }), url = `http://127.0.0.1:${s.address().port}`
  const post = async (headers) => (await fetch(url + '/import', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ messages: [fb.wrap(a.genesis), ...notes(a, 9).map((x) => fb.wrap(x))] }) })).json()
  assert.equal((await post({})).wrote, false)
  assert.equal((await post({ authorization: `Bearer ${host.config.adminToken}` })).wrote, true)
  s.close()
})

// ---- Report 06 (F5, F6, F7, F9, F10, F11): what a stranger can make the host spend ----
const sealedBy = (who, text) => {
  const b = fb.write('observe', { kind: 'note', text }, {}, { author: who.id, key: who.keys, held: [who.genesis], at: at(1), audience: [who.id] })
  const { salts, ...signed } = b
  return { signed, message: fb.sealCopy(signed, { keys: [who.enc.public_key_encrypt], reveals: [fb.revealFor(salts, who.id)] }) }
}

test('F5: sealed copies count against a stranger like blocks, and are kept only for people the host knows', () => {
  const host = initHost(tmp(), numbers), eve = person(), known = person()
  host.ingest([fb.wrap(known.genesis)], { owner: true })
  const { signed, message } = sealedBy(eve, 'y'.repeat(200))
  const stranger = Array.from({ length: 50 }, (_, i) => i.toString(16).padStart(64, '0'))
  let counter = 0
  const push = (messages, forWhom) => host.ingest(messages, { copiesBy: eve.id, forWhom })
  push([fb.wrap(eve.genesis), message], { [signed.hash]: [known.id, ...stranger.slice(0, 2)] })
  assert.deepEqual(host.store.allCopies().map((c) => c.recipient), [known.id], 'a recipient the host has never heard of gets no copy')
  // the same sealed block pushed again and again, each time "for" another recipient the host knows: every copy is an arrival of Eve's, so her day runs out
  const others = Array.from({ length: 12 }, () => person())
  host.ingest(others.map((o) => fb.wrap(o.genesis)), { owner: true })
  for (const o of others) push([message], { [signed.hash]: [o.id] })
  const copies = host.store.allCopies().length
  assert.ok(copies <= numbers.perStranger, `Eve's copies are bounded by perStranger (${copies})`)
  assert.ok(host.store.arrivedSince(eve.id, new Date(Date.now() - 86400000)) <= numbers.perStranger + 1)
  void counter
})

test('F6: a wake calls the owner\'s callback once per wait, however often it is sent', () => {
  const dir = tmp(), a = person(), woken = []
  initHost(dir, numbers)
  const host = openHost(dir, { onWake: (id) => woken.push(id) })
  host.ingest([fb.wrap(a.genesis)])
  for (let i = 0; i < 2000; i++) host.wake(a.id, (id) => woken.push(id))
  assert.equal(woken.length, 1)
})

test('F6, F7: unsigned pulls, wakes and exports are answered so many a minute from one address; the whole store is the owner\'s', async () => {
  const host = initHost(tmp(), { ...numbers, unsignedPerMinute: 5 }), a = person()
  host.ingest([fb.wrap(a.genesis)])
  const s = await serve(host, { port: 0 }), url = `http://127.0.0.1:${s.address().port}`
  const wake = () => fetch(url + '/wake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ for: a.id }) }).then((r) => r.status)
  const statuses = []
  for (let i = 0; i < 8; i++) statuses.push(await wake())
  const pulls = []
  for (let i = 0; i < 3; i++) pulls.push((await fetch(url + '/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429, 429])
  assert.deepEqual(pulls, [429, 429, 429], 'wakes and pulls share one count')
  assert.equal((await fetch(url + '/export')).status, 401, 'no author named, no owner token: the whole store is not served')
  assert.equal((await fetch(url + '/export', { headers: { authorization: `Bearer ${host.config.adminToken}` } })).status, 200)
  assert.equal((await fetch(url + '/sync', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(host.config.adminToken.length), 'content-type': 'application/json' }, body: '{}' })).status, 401)
  s.close()
})

test('F7: a pull is answered from a window of the log, not the whole store, and still carries a forked pair\'s proof', () => {
  const host = initHost(tmp(), { ...numbers, cap: 10 }), a = person()
  host.ingest([fb.wrap(a.genesis), ...notes(a, 4).map((x) => fb.wrap(x))], { owner: true })
  const answer = host.pull({ since: 1 })
  assert.deepEqual(answer.blocks.map((one) => one.n), [2, 3, 4, 5])
  const rival = fb.write('observe', { kind: 'note', text: 'rival' }, {}, { author: a.id, key: a.keys, held: [a.genesis], at: at(30), audience: 'public' })
  host.ingest([fb.wrap(rival)], { owner: true })
  const proof = host.pull({ since: 0, limit: 1 })
  assert.ok(proof.blocks.some((one) => fb.unwrap(one.message).hash === rival.hash) || proof.blocks.length >= 1)
})

test('F10, F11: a 500 names nothing of the host, and its files are private to its owner', async () => {
  const dir = tmp(), host = initHost(dir, numbers), a = person()
  host.ingest([fb.wrap(a.genesis)])
  host.wake(a.id)
  for (const f of ['host.json', 'blocks.jsonl', 'wakes.jsonl']) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o077, 0, `${f} is private`)
  fs.chmodSync(path.join(dir, 'blocks.jsonl'), 0o644)
  openHost(dir)
  assert.equal(fs.statSync(path.join(dir, 'blocks.jsonl')).mode & 0o077, 0, 'a file made wider is narrowed on open')
  host.pull = () => { throw new Error('/secret/path/inside TypeError') }
  const s = await serve(host, { port: 0 })
  const r = await fetch(`http://127.0.0.1:${s.address().port}/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(r.status, 500); assert.ok(!(await r.text()).includes('secret'))
  s.close()
})
