import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fb from '../../src/files/sdk.cjs'
import { initHost, openHost } from '../../src/files/host.mjs'
import { serve } from '../../src/files/server.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'refnode-'))
const promise = { cap: 100, servesPairs: true, takesPairs: false, allow: null, perStranger: 1000, strangersPerDay: 10000, admission: null, copyRecipients: 10, copyBytes: 1000000 }
const at = (i) => `2026-11-08T09:${String(i).padStart(2, '0')}:00.000Z`

// Her record, made on her own device: a genesis and a chain of three notes, all signed with her key. The hosts below never see that key.
function hers() {
  const keys = fb.generateKeypair()
  const genesis = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(0) })
  const held = [genesis]
  for (let i = 1; i <= 3; i++) held.push(fb.write('thing', { kind: 'note', name: `note ${i}` }, {}, { author: genesis.hash, key: keys, held, at: at(i), audience: 'public' }))
  return { keys, genesis, blocks: held, messages: held.map((block) => fb.wrap(block)) }
}
const serveHost = async (host) => { const s = await serve(host, { port: 0 }); return { s, url: `http://127.0.0.1:${s.address().port}` } }
const post = async (url, route, body, headers = {}) => (await fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: fb.canonicalJSON(body) })).json()

test('a good record is taken, in order, and served back', async () => {
  const host = initHost(tmp(), promise), her = hers()
  const result = host.ingest(her.messages)
  assert.equal(result.taken.length, 4); assert.deepEqual(result.refused, [])
  const answer = host.pull({ since: 0 })
  assert.deepEqual(answer.blocks.map((one) => one.message.block.state.name ?? 'genesis'), ['genesis', 'note 1', 'note 2', 'note 3'])
})

test('a bad signature is refused, over HTTP too, and nothing is written', async () => {
  const host = initHost(tmp(), promise), her = hers()
  host.ingest(her.messages.slice(0, 2))
  const forged = { ...her.messages[2], signature: her.messages[2].signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) }
  const result = host.ingest([forged])
  assert.equal(result.taken.length, 0)
  assert.equal(result.refused[0].code, 'bad_signature')
  // a block whose content was changed after signing is not what its signature signed
  const edited = JSON.parse(JSON.stringify(her.messages[2])); edited.block.state.name = 'note 2 (edited by the host)'
  assert.equal(host.ingest([edited]).taken.length, 0)
  // a block signed by someone else's key but claiming her as author
  const thief = fb.generateKeypair()
  const real = fb.unwrap(her.messages[2]), thiefSig = fb.sign(real.hash, thief.private_key)
  const claim = { block: her.messages[2].block, signature: typeof thiefSig === 'string' ? thiefSig : thiefSig.signature }
  assert.equal(host.ingest([claim]).taken.length, 0)
  const { s, url } = await serveHost(host)
  const over = await post(url, '/push', { messages: [forged] })
  s.close()
  assert.equal(over.taken.length, 0); assert.equal(over.refused[0].code, 'bad_signature')
  assert.equal(host.store.count(), 2)
})

test('export from one host, import into another, gives the same chain', async () => {
  const a = initHost(tmp(), promise), b = initHost(tmp(), promise), her = hers()
  a.ingest(her.messages)
  const doc = a.exportRecord([her.genesis.hash])
  assert.equal(doc.format, 'application/foodblock+json')
  const result = b.ingest(doc.messages, { all: true })
  assert.equal(result.wrote, true); assert.equal(result.taken.length, 4)
  assert.deepEqual(b.store.entries().map((e) => e.hash), a.store.entries().map((e) => e.hash))
  assert.deepEqual(b.exportRecord([her.genesis.hash]), doc, 'the same plain blocks come back out')
  // and it is her chain: each block verifies against her key from the exported bytes alone
  const bytes = JSON.stringify(doc); assert.ok(!bytes.includes(her.keys.private_key), 'her private key is nowhere in the export')
})

test('an import with one forged block writes nothing at all', () => {
  const a = initHost(tmp(), promise), b = initHost(tmp(), promise), her = hers()
  a.ingest(her.messages)
  const doc = a.exportRecord()
  doc.messages[3] = { ...doc.messages[3], signature: doc.messages[3].signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) }
  const result = b.ingest(doc.messages, { all: true })
  assert.equal(result.wrote, false); assert.equal(b.store.count(), 0)
})

test('nothing is ever overwritten: a block held is left exactly as it was', () => {
  const dir = tmp(), host = initHost(dir, promise), her = hers()
  host.ingest(her.messages)
  const before = fs.readFileSync(path.join(dir, 'blocks.jsonl'), 'utf8')
  const again = host.ingest(her.messages)                       // the same blocks again
  assert.equal(again.taken.length, 0); assert.equal(host.store.count(), 4)
  assert.equal(host.store.append(host.store.get(her.blocks[1].hash)), null)
  // a rival block in the same place of her chain is a fork: it is not taken, and the first stays
  const rival = fb.write('thing', { kind: 'note', name: 'rival note 1' }, {}, { author: her.genesis.hash, key: her.keys, held: [her.genesis], at: at(20), audience: 'public' })
  const r = host.ingest([fb.wrap(rival)])
  assert.equal(r.taken.length, 0)
  const after = fs.readFileSync(path.join(dir, 'blocks.jsonl'), 'utf8')
  assert.equal(after, before, 'the file is byte for byte what it was')
  assert.ok(after.startsWith(before))
  // reopening reads the same chain
  assert.deepEqual(openHost(dir).store.entries().map((e) => e.hash), her.blocks.map((b) => b.hash))
  // the store offers no way to change or remove
  assert.deepEqual(Object.keys(host.store).filter((k) => /delete|remove|update|set|put|clear/i.test(k)), [])
})

test('two hosts sync both ways and agree', async () => {
  const a = initHost(tmp(), promise), b = initHost(tmp(), promise), her = hers(), other = hers()
  a.ingest(her.messages); b.ingest(other.messages)
  const { s, url } = await serveHost(b)
  const { s: sa, url: urlA } = await serveHost(a)
  const result = await a.sync(url)
  s.close(); sa.close()
  assert.deepEqual(result, { took: 4, gave: 4 })
  const set = (h) => h.store.entries().map((e) => e.hash).sort()
  assert.deepEqual(set(a), set(b)); assert.equal(set(a).length, 8)
  assert.ok(urlA)
})

test('the host holds no key of hers: its key is its own, and a sync needs its owner\'s token', async () => {
  const dir = tmp(), host = initHost(dir, promise), her = hers()
  host.ingest(her.messages)
  const files = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  assert.ok(!files.includes(her.keys.private_key), 'her private key is not in anything the host keeps')
  assert.notEqual(host.node, her.genesis.hash)
  // every pull answer is signed by the host's own key, never hers
  assert.equal(host.pull({ since: 0 }).node, host.node)
  const { s, url } = await serveHost(host)
  const denied = await post(url, '/sync', { peer: 'http://127.0.0.1:1' })
  s.close()
  assert.match(denied.error, /token/)
  assert.equal(fs.statSync(path.join(dir, 'host.json')).mode & 0o077, 0, 'the host key file is private to its owner')
})

test('a host that names its authors keeps blocks only for them', () => {
  const her = hers(), other = hers()
  const host = initHost(tmp(), { ...promise, allow: [her.genesis.hash] })
  assert.equal(host.ingest(other.messages).taken.length, 0)
  assert.equal(host.ingest(her.messages).taken.length, 4)
})
