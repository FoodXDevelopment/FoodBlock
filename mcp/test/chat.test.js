import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createHub } from '../hosted.js'
import { createServer, mcpEndpoint } from '../server.js'
import { createDoor } from '../door.js'

// A person who first wrote from a chat signs in to the app with a code sent to a chat she uses, and inside any assistant her own agent talks.
describe('the chat door on the hub', () => {
  it('signs in by a code sent to a chat, the same page for any number; one session per person', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const sent = []
    const chat = {
      custody: () => null,
      signin: {
        start: async (phone) => { if (phone === '+254700000202') sent.push('123456'); return { ok: true } },
        check: async (phone, code) => (phone === '+254700000202' && code === '123456' ? 'person-1' : null),
      },
    }
    let hub; const server = http.createServer((req, res) => hub.app(req, res)); await new Promise((d) => server.listen(0, '127.0.0.1', d)); after(() => { server.close(); server.closeAllConnections?.() })
    const base = `http://127.0.0.1:${server.address().port}`
    hub = createHub({ stateFile: join(dir, 'state.json'), master: randomBytes(40).toString('hex'), publicUrl: base, provision: async () => ({ base: 'http://127.0.0.1:9/p', token: 't' }), mcp: mcpEndpoint(), chat })
    const page = await (await fetch(`${base}/account`)).text()
    assert.match(page, /Sign in to FoodX/); assert.match(page, /A code in your chat/); assert.match(page, /Built on the open FoodBlock protocol/); assert.ok(!/Sign in to FoodBlock/.test(page))
    const request = /name="request" value="([^"]+)"/.exec(page)[1]
    const post = (body) => fetch(`${base}/signin/code`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, ...body }) })
    const known = await (await post({ phone: '+254700000202' })).text(), unknown = await (await post({ phone: '+254700099999' })).text()
    assert.equal(known.replaceAll('+254700000202', 'N'), unknown.replaceAll('+254700099999', 'N'), 'nothing says whether a number has an account')
    assert.deepEqual(sent, ['123456'])
    const bad = await post({ phone: '+254700000202', code: '000000' }); assert.equal(bad.status, 403)
    const ok = await post({ phone: '+254700000202', code: '123456' })
    assert.equal(ok.status, 302); assert.match(ok.headers.get('location'), /^\/oauth\/continue/); assert.match(ok.headers.getSetCookie().join(';'), /fb_session=/)
  })

  it('offers ask_my_foodos first, relays the words, and returns the agent\'s answer', async () => {
    const door = createDoor(); const heard = []
    door.talk = async (words) => { heard.push(words); return 'Sales: 3.' }
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createServer({ door }).connect(b)
    const client = new Client({ name: 'chatgpt', version: '1' }); await client.connect(a)
    const tools = (await client.listTools()).tools
    assert.equal(tools[0].name, 'ask_my_foodos'); assert.deepEqual(tools.map((t) => t.name).sort(), ['ask_my_foodos', 'foodblock_find', 'foodblock_read'], 'a hosted door finds and reads; binding is on the approval page, not a tool')
    assert.deepEqual(tools[0]._meta.securitySchemes, [{ type: 'oauth2', scopes: ['foodblock:read'] }], 'each tool names its own scope'); assert.equal(tools[0]._meta.ui.resourceUri, 'ui://foodx/approval-card')
    const card = await client.readResource({ uri: 'ui://foodx/approval-card' }); assert.equal(card.contents[0].mimeType, 'text/html;profile=mcp-app'); assert.match(card.contents[0].text, /approval_url/)
    const r = await client.callTool({ name: 'ask_my_foodos', arguments: { message: 'what did I sell?' } })
    const out = JSON.parse(r.content[0].text); assert.equal(out.answer, 'Sales: 3.'); assert.match(out.conversation, /^[0-9a-f]{16}$/); assert.deepEqual(heard, ['what did I sell?'])
    const bare = new Client({ name: 'x', version: '1' }); const [c, d] = InMemoryTransport.createLinkedPair(); await createServer({ door: createDoor() }).connect(d); await bare.connect(c)
    assert.ok(!(await bare.listTools()).tools.some((t) => t.name === 'ask_my_foodos'), 'no agent on this host, no talk tool')
  })
})
