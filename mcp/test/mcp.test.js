import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import fb from '@foodxdev/foodblock'

// The MCP server speaks FoodBlock: its tools, a write placed in the author's key chain, checked and signed by the SDK's
// one write path, a query that reads older types too, a record's history, and a signature anyone can verify.
const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'server.js')
let proc, buffer = '', next = 1
const waiting = new Map()
const call = (method, params = {}) => new Promise((done, fail) => {
  const id = next++
  waiting.set(id, done)
  setTimeout(() => fail(new Error(`no answer to ${method}`)), 8000).unref()
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
})
const tool = async (name, args = {}) => {
  const reply = await call('tools/call', { name, arguments: args })
  const body = reply.result?.content?.[0]?.text
  return { error: reply.result?.isError === true, value: (() => { try { return JSON.parse(body) } catch { return body } })() }
}

describe('FoodBlock MCP', () => {
  before(async () => {
    proc = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] })
    proc.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n'); buffer = lines.pop()
      for (const line of lines) { try { const msg = JSON.parse(line); waiting.get(msg.id)?.(msg); waiting.delete(msg.id) } catch {} }
    })
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  })
  after(() => proc.kill())

  it('offers the eight tools', async () => {
    const names = (await call('tools/list')).result.tools.map((item) => item.name).sort()
    assert.deepEqual(names, ['foodblock_check', 'foodblock_create', 'foodblock_get', 'foodblock_history', 'foodblock_info', 'foodblock_query', 'foodblock_read_as', 'foodblock_verify'])
  })
  it('says what the protocol is, from protocol.json: seven types, seven verbs, no place', async () => {
    const info = (await tool('foodblock_info')).value
    assert.deepEqual([info.protocol, info.types, info.verbs, info.terms], [fb.VERSION, fb.TYPES, fb.VERBS, fb.PROTOCOL.terms])
    assert.deepEqual([info.types.length, info.types.includes('place'), info.types.includes('schema')], [7, false, false])
  })
  it('writes a block in its key chain, checked and signed, and refuses a malformed one', async () => {
    const made = (await tool('foodblock_create', { type: 'thing', kind: 'oats', state: { name: 'Oats' } })).value
    assert.ok(made.state.at && made.state.audience === 'public' && made.refs.author && made.refs.prev && made.state.seq >= 1)
    const next = (await tool('foodblock_create', { type: 'thing', kind: 'rye', state: { name: 'Rye' } })).value
    assert.deepEqual([next.state.seq, next.refs.prev], [made.state.seq + 1, made.hash])
    assert.equal((await tool('foodblock_verify', { hash: made.hash })).value.signedByItsAuthor, true)
    const floaty = await tool('foodblock_create', { type: 'thing', kind: 'flour', state: { amount: { value: 1.5, unit: 'kg' } } })
    assert.equal(floaty.error, true)
    assert.match(String(floaty.value), /float/)
    const place = await tool('foodblock_create', { type: 'place', kind: 'kitchen' })
    assert.equal(place.error, true, 'place is read, never written')
  })
  it('writes a private block as audience commitments, with the salts beside it', async () => {
    const someone = 'a'.repeat(64)
    const made = (await tool('foodblock_create', { type: 'observe', kind: 'note', state: { text: 'for you' }, audience: [someone] })).value
    assert.equal(made.state.audience.length, 1)
    assert.notEqual(made.state.audience[0], someone)
    assert.ok(made.salts[someone] && made.state.nonce)
  })
  it('finds the seeded offer by type, and reads an older block as 1.6', async () => {
    const offers = (await tool('foodblock_query', { type: 'promise' })).value
    assert.deepEqual([offers[0].state.terms.price.minor, offers[0].state.status, Boolean(offers[0].refs.from && offers[0].refs.to && offers[0].refs.what)], [2400, undefined, true])
    assert.deepEqual(fb.check(offers[0].type, offers[0].state, offers[0].refs), [], 'an offer carries no status: offered is read from who signed it')
    const old = (await tool('foodblock_read_as', { type: 'place', state: { kind: 'kitchen' }, refs: {} })).value
    assert.equal(old.type, 'thing')
    const sale = (await tool('foodblock_read_as', { type: 'promise', state: {}, refs: { seller: 'a'.repeat(64), buyer: 'b'.repeat(64) } })).value
    assert.deepEqual([sale.refs.from, sale.refs.to], ['a'.repeat(64), 'b'.repeat(64)])
  })
  it('checks a block without writing it', async () => {
    const { errors } = (await tool('foodblock_check', { type: 'thing', state: { kind: 'eggs' }, refs: {} })).value
    assert.ok(errors.some((error) => /refs.author/.test(error)) && errors.some((error) => /seq/.test(error)))
  })
  it('the package names the protocol version it speaks', () => {
    const pkg = JSON.parse(readFileSync(resolve(dirname(SERVER), 'package.json'), 'utf8'))
    const registry = JSON.parse(readFileSync(resolve(dirname(SERVER), 'server.json'), 'utf8'))
    assert.ok([pkg.version, registry.version, registry.packages[0].version].every((version) => version.startsWith(`${fb.VERSION}.`)))
  })
  it('keeps a record\'s identity across versions', async () => {
    const first = (await tool('foodblock_create', { type: 'thing', kind: 'bread', state: { name: 'Rye loaf' } })).value
    const second = (await tool('foodblock_create', { type: 'thing', kind: 'bread', state: { name: 'Dark rye loaf' }, refs: { updates: first.hash } })).value
    const history = (await tool('foodblock_history', { hash: second.hash })).value
    assert.deepEqual([history.identity, history.versions.map((block) => block.state.name)], [first.hash, ['Rye loaf', 'Dark rye loaf']])
  })
})
