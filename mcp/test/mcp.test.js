import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = resolve(__dirname, '..', 'server.js')

function sendJsonRpc(proc, method, params = {}, id = 1) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params })
  proc.stdin.write(msg + '\n')
}

function readJsonRpc(proc, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for MCP response')), timeout)
    let buffer = ''
    const onData = (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.id !== undefined) {
            clearTimeout(timer)
            proc.stdout.removeListener('data', onData)
            resolve(parsed)
            return
          }
        } catch {
          // Not valid JSON yet, keep buffering
        }
      }
    }
    proc.stdout.on('data', onData)
  })
}

function startServer() {
  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FOODBLOCK_URL: 'https://api.foodx.world/foodblock' },
  })
  return proc
}

async function initServer(proc) {
  sendJsonRpc(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.1.0' },
  })
  const result = await readJsonRpc(proc)

  // Send initialized notification
  const notif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  proc.stdin.write(notif + '\n')

  return result
}

describe('MCP Server', () => {
  it('initializes and lists all tools', async () => {
    const proc = startServer()

    try {
      const initResult = await initServer(proc)
      assert.equal(initResult.result.serverInfo.name, 'foodblock')
      assert.equal(initResult.result.serverInfo.version, '0.1.0')

      sendJsonRpc(proc, 'tools/list', {}, 2)
      const toolsResult = await readJsonRpc(proc)
      const toolNames = toolsResult.result.tools.map(t => t.name).sort()

      assert.ok(toolNames.includes('foodblock_create'), 'has foodblock_create')
      assert.ok(toolNames.includes('foodblock_update'), 'has foodblock_update')
      assert.ok(toolNames.includes('foodblock_get'), 'has foodblock_get')
      assert.ok(toolNames.includes('foodblock_query'), 'has foodblock_query')
      assert.ok(toolNames.includes('foodblock_chain'), 'has foodblock_chain')
      assert.ok(toolNames.includes('foodblock_tree'), 'has foodblock_tree')
      assert.ok(toolNames.includes('foodblock_heads'), 'has foodblock_heads')
      assert.ok(toolNames.includes('foodblock_info'), 'has foodblock_info')
      assert.ok(toolNames.includes('foodblock_create_agent'), 'has foodblock_create_agent')
      assert.ok(toolNames.includes('foodblock_agent_draft'), 'has foodblock_agent_draft')
      assert.ok(toolNames.includes('foodblock_approve_draft'), 'has foodblock_approve_draft')
      assert.ok(toolNames.includes('foodblock_list_agents'), 'has foodblock_list_agents')
      assert.equal(toolNames.length, 12, 'exactly 12 tools')
    } finally {
      proc.kill()
    }
  })

  it('each tool has a valid input schema', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      sendJsonRpc(proc, 'tools/list', {}, 2)
      const toolsResult = await readJsonRpc(proc)

      for (const tool of toolsResult.result.tools) {
        assert.ok(tool.name, `tool has name`)
        assert.ok(tool.inputSchema, `${tool.name} has inputSchema`)
        assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema is object type`)
      }
    } finally {
      proc.kill()
    }
  })

  it('can call foodblock_info tool and get structured response', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_info',
        arguments: {},
      }, 3)
      const result = await readJsonRpc(proc, 10000)

      assert.ok(result.result, 'got result')
      assert.ok(result.result.content, 'result has content')
      assert.ok(result.result.content.length > 0, 'has at least one content item')
      assert.equal(result.result.content[0].type, 'text', 'content is text')

      const parsed = JSON.parse(result.result.content[0].text)
      assert.ok(parsed.api_url, 'has api_url')
      assert.ok(parsed.protocol, 'has protocol info')
      assert.ok(parsed.protocol.base_types, 'has base types')
      assert.ok(parsed.tips, 'has tips')
    } finally {
      proc.kill()
    }
  })
})
