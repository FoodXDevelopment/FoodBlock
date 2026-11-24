// The host's rules (spec/modules/nodes.md, A host): its promise is its own signed word, her address is served as blocks, a wake is only a notice,
// and her record leaves and loads as plain FoodBlocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fb from '../../src/files/sdk.cjs'
import { initHost, openHost } from '../../src/files/host.mjs'
import { serve } from '../../src/files/server.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hostrules-'))
const promise = { cap: 100, servesPairs: true, takesPairs: false, allow: null, perStranger: 1000, strangersPerDay: 10000, admission: null, copyRecipients: 10, copyBytes: 1000000 }
const at = (i) => `2026-11-08T10:${String(i).padStart(2, '0')}:00.000Z`

function hers() {
  const keys = fb.generateKeypair()
  const genesis = fb.identity.genesis(keys, { kind: 'person', audience: 'public', at: at(0) })
  const blocks = [genesis]
  const say = (state, refs = {}, i) => { const b = fb.write('observe', state, refs, { author: genesis.hash, key: keys, blocks, at: at(i), audience: 'public' }); blocks.push(b); return b }
  const first = say({ kind: 'address', routes: [{ via: 'host', to: 'http://one.example' }] }, {}, 1)
  const moved = say({ kind: 'address', routes: [{ via: 'host', to: 'http://one.example' }, { via: 'host', to: 'http://two.example' }] }, { updates: first.hash }, 2)
  return { keys, genesis, first, moved, blocks, messages: blocks.map((b) => fb.wrap(b)) }
}
const serveHost = async (host) => { const s = await serve(host, { port: 0 }); return { s, url: `http://127.0.0.1:${s.address().port}` } }
const post = async (url, route, body) => { const r = await fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: fb.canonicalJSON(body) }); return { status: r.status, body: await r.json() } }

test('the host signs its promise with its own key, publishes it, and holds nothing of hers', async () => {
  const dir = tmp(), host = initHost(dir, promise), her = hers()
  host.ingest(her.messages)
  const doc = host.wellKnown()
  const block = doc.promise.block
  assert.equal(block.type, 'observe'); assert.equal(block.state.kind, 'host_promise'); assert.equal(block.refs.author, host.node)
  assert.deepEqual(fb.valid(block, [host.config.genesis]).filter((x) => x.code === 'bad_signature'), [])
  assert.equal(fb.unwrap(fb.wrap(block), [host.config.genesis]).hash, block.hash, 'its signature opens with the host key')
  for (const line of ['stores', 'syncs', 'reachable', 'never_holds_key', 'lets_leave']) assert.ok(block.state[line], line)
  assert.equal(block.state.wake, '/wake'); assert.equal(block.state.export, '/export'); assert.equal(block.state.import, '/import')
  assert.notEqual(block.refs.author, her.genesis.hash)
  const files = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  assert.ok(!files.includes(her.keys.private_key))
  // reopening gives the same signed word, not a new one
  assert.equal(openHost(dir).wellKnown().promise.block.hash, block.hash)
})

test('her address is served as blocks: the head of her chain of address blocks', () => {
  const host = initHost(tmp(), promise), her = hers()
  host.ingest(her.messages)
  const heads = host.addressOf(her.genesis.hash)
  assert.deepEqual(heads.map((b) => b.hash), [her.moved.hash])
  assert.equal(heads[0].state.routes.length, 2, 'she listed the new route before dropping the old: an overlap')
})

test('a wake is a notice for an id the host keeps: no block, no power, then it is taken once', async () => {
  const dir = tmp(), host = initHost(dir, promise), her = hers()
  const woken = []
  const wired = openHost(dir, { onWake: (id) => woken.push(id) })
  wired.ingest(her.messages)
  const { s, url } = await serveHost(wired)
  const stranger = await post(url, '/wake', { for: 'f'.repeat(64) })
  assert.equal(stranger.status, 404); assert.match(stranger.body.error, /not_kept/)
  const ok = await post(url, '/wake', { for: her.genesis.hash })
  await post(url, '/wake', { for: her.genesis.hash })
  s.close()
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { woken: her.genesis.hash })
  assert.deepEqual(woken, [her.genesis.hash], 'the owner\'s callback is called once per wait, not once per request')
  assert.equal(wired.store.count(), 3, 'a wake wrote no block')
  assert.deepEqual(wired.takeWakes(), [her.genesis.hash])
  assert.deepEqual(wired.takeWakes(), [])
  assert.ok(host)
})

test('she can leave: export from one host, import into another, her address blocks come with her', () => {
  const a = initHost(tmp(), promise), b = initHost(tmp(), promise), her = hers()
  a.ingest(her.messages)
  const doc = a.exportRecord([her.genesis.hash])
  assert.equal(doc.format, 'application/foodblock+json')
  assert.equal(b.importRecord(doc).taken.length, 3)
  assert.deepEqual(b.addressOf(her.genesis.hash).map((x) => x.hash), [her.moved.hash])
})
