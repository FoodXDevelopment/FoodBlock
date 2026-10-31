import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mcpEndpoint, createDoor, newPerson } from '../server.js'
import { sealer, durableDrafts, durableSessions } from '../store.js'

// A restart loses nothing: draft links still open and can be approved, and an assistant's MCP session carries on (same assistant, same grant).
describe('durable drafts and sessions', () => {
  it('survives a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dur-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const seal = sealer(randomBytes(40).toString('hex')), person = newPerson('person', { reach: 'P30D' }), code = 'ABCDE-12345'
    const boot = () => {
      const door = createDoor({ person, code, drafts: durableDrafts(join(dir, 'drafts'), seal)(person.id) })
      door.base = 'https://x.test'
      return { door, mcp: mcpEndpoint(door, { store: durableSessions(join(dir, 'sessions.json'), seal) }) }
    }
    let life = boot()
    const server = http.createServer(async (req, res) => {
      let raw = ''; for await (const c of req) raw += c
      await life.mcp(req, res, raw ? JSON.parse(raw) : undefined, undefined, undefined, person.id)
    })
    await new Promise((d) => server.listen(0, '127.0.0.1', d)); after(() => { server.close(); server.closeAllConnections?.() })
    const client = new Client({ name: 't', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)))
    const call = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text)
    const grant = await call('foodblock_connect', { audience: 'public', acts: ['promise'] })
    assert.equal(grant.status, 'pending')

    await life.mcp.drain(); life = boot()                              // the restart: new door, new endpoint, same disk
    assert.equal(life.door.drafts.get(grant.draft).status, 'pending', 'the draft link survived')
    const again = await call('foodblock_find', { kind: 'peers' })      // same session id, no new initialize
    assert.ok(Array.isArray(again), 'the session continued')
    assert.equal(life.door.approve(grant.draft, code).ok, true, 'the link can still be approved')

    await life.mcp.drain(); life = boot()                              // and again: the approved draft survives with its status
    assert.equal(life.door.drafts.get(grant.draft).status, 'sent')
    const read = await call('foodblock_read', { hash: grant.draft })
    assert.equal(read.status, 'sent')
  })
})
