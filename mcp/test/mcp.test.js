import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fb from '@foodxdev/foodblock'
import { createDoor, serveHttp, createServer, seed } from '../server.js'

// Both transports serve the same six tools; an assistant can find the seeded offer and draft an ask over each.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOOLS = ['foodblock_accept', 'foodblock_ask', 'foodblock_connect', 'foodblock_find', 'foodblock_promise', 'foodblock_read']
const use = async (client, name, args = {}) => {
  const reply = await client.callTool({ name, arguments: args })
  const body = reply.content[0].text
  return { error: reply.isError === true, value: (() => { try { return JSON.parse(body) } catch { return body } })() }
}
const flow = async (client) => {
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), TOOLS)
  const offers = (await use(client, 'foodblock_find', { what: 'flour', near: 'Hartley' })).value
  assert.equal(offers.length, 1)
  const draft = (await use(client, 'foodblock_ask', { audience: 'public', offer: offers[0].offer, quantity: { value: '5', unit: 'kg' } })).value
  assert.deepEqual([draft.status, draft.bound], ['pending', false])
  assert.equal((await use(client, 'foodblock_read', { hash: draft.draft })).value.status, 'pending')
  const bound = (await use(client, 'foodblock_accept', { audience: 'public', promise: offers[0].offer })).value
  assert.equal(bound.bound, false, 'an unconnected assistant never binds')
  assert.equal((await use(client, 'foodblock_ask', { audience: 'public', offer: offers[0].offer, quantity: { value: 5, unit: 'kg' } })).error, true, 'a float is refused')
  // the audience is the person's choice, asked for every time: a call without one is refused, and nothing is drafted
  for (const [name, args] of [['foodblock_ask', { offer: offers[0].offer }], ['foodblock_accept', { promise: offers[0].offer }], ['foodblock_connect', { acts: [] }], ['foodblock_promise', { to: offers[0].from.id || 'x', what: offers[0].offer }]]) {
    const refused = await use(client, name, args)
    assert.equal(refused.error, true, `${name} without an audience is refused`)
    assert.match(JSON.stringify(refused.value), /audience/)
  }
  return draft
}

describe('FoodBlock MCP transports', () => {
  it('stdio', async () => {
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, 'server.js')], env: { ...process.env, FOODBLOCK_SEED: 'demo', FOODBLOCK_REACH: 'P30D' }, stderr: 'pipe' }))
    const draft = await flow(client)
    assert.match(draft.approve_at, /^http:\/\/127\.0\.0\.1:\d+\/approve\/[0-9a-f]{64}$/)
    assert.equal((await fetch(draft.approve_at)).status, 200, 'the approval page is served')
    await client.close()
  })
  it('streamable http, one assistant per session', async () => {
    const door = createDoor({ reach: 'P30D' })
    seed(door)
    const server = await serveHttp(door, 0)
    after(() => server.close())
    const open = async () => { const c = new Client({ name: 'test', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(`${door.base}/mcp`))); return c }
    const a = await open(), b = await open()
    const draft = await flow(a)
    assert.equal((await use(b, 'foodblock_connect', { audience: 'public', acts: ['promise'] })).value.status, 'pending')
    assert.equal((await fetch(draft.approve_at)).status, 200)
    assert.equal(door.pending().length, 3)
    await a.close(); await b.close()
  })
  it('the package names the protocol version it speaks', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    const registry = JSON.parse(readFileSync(resolve(ROOT, 'server.json'), 'utf8'))
    assert.ok([pkg.version, registry.version, registry.packages[0].version].every((v) => v.startsWith(`${fb.VERSION}.`)))
    assert.ok(createServer)
  })
})
