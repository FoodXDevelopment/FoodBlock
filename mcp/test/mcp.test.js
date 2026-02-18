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
    env: { ...process.env },
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
      assert.equal(initResult.result.serverInfo.version, '0.5.0')

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
      assert.ok(toolNames.includes('foodblock_fb'), 'has foodblock_fb')
      assert.ok(toolNames.includes('foodblock_tombstone'), 'has foodblock_tombstone')
      assert.ok(toolNames.includes('foodblock_validate'), 'has foodblock_validate')
      assert.ok(toolNames.includes('foodblock_batch'), 'has foodblock_batch')
      assert.ok(toolNames.includes('foodblock_load_agent'), 'has foodblock_load_agent')
      assert.ok(toolNames.includes('foodblock_discover'), 'has foodblock_discover')
      assert.ok(toolNames.includes('foodblock_negotiate'), 'has foodblock_negotiate')
      assert.ok(toolNames.includes('foodblock_trace'), 'has foodblock_trace')
      assert.equal(toolNames.length, 20, 'exactly 20 tools')
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
      assert.ok(parsed.mode, 'has mode')
      assert.ok(parsed.protocol, 'has protocol info')
      assert.ok(parsed.protocol.base_types, 'has base types')
      assert.ok(parsed.tips, 'has tips')
    } finally {
      proc.kill()
    }
  })

  // ── Block CRUD ──────────────────────────────────────────────────────

  it('foodblock_create — creates a block and returns hash', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.product',
          state: { name: 'Sourdough', price: 4.50 },
          refs: {},
        },
      }, 2)
      const result = await readJsonRpc(proc, 10000)

      assert.ok(result.result, 'got result')
      const parsed = JSON.parse(result.result.content[0].text)
      assert.ok(parsed.hash, 'block has a hash')
      assert.equal(parsed.hash.length, 64, 'hash is 64 hex chars')
      assert.equal(parsed.type, 'substance.product', 'type matches')
      assert.equal(parsed.state.name, 'Sourdough', 'state.name matches')
      assert.equal(parsed.state.price, 4.50, 'state.price matches')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_get — retrieves a block by hash', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create a block first
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor.producer',
          state: { name: 'Green Acres Farm' },
          refs: {},
        },
      }, 2)
      const createResult = await readJsonRpc(proc, 10000)
      const created = JSON.parse(createResult.result.content[0].text)

      // Get it back by hash
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_get',
        arguments: { hash: created.hash },
      }, 3)
      const getResult = await readJsonRpc(proc, 10000)
      const fetched = JSON.parse(getResult.result.content[0].text)

      assert.equal(fetched.hash, created.hash, 'hashes match')
      assert.equal(fetched.type, 'actor.producer', 'type matches')
      assert.equal(fetched.state.name, 'Green Acres Farm', 'state matches')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_update — creates a new version with refs.updates', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create original block
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.product',
          state: { name: 'Sourdough', price: 4.00 },
          refs: {},
        },
      }, 2)
      const createResult = await readJsonRpc(proc, 10000)
      const original = JSON.parse(createResult.result.content[0].text)

      // Update the block
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_update',
        arguments: {
          previous_hash: original.hash,
          type: 'substance.product',
          state: { name: 'Sourdough', price: 4.50 },
          refs: {},
        },
      }, 3)
      const updateResult = await readJsonRpc(proc, 10000)
      const updated = JSON.parse(updateResult.result.content[0].text)

      assert.ok(updated.hash, 'updated block has a hash')
      assert.notEqual(updated.hash, original.hash, 'updated hash differs from original')
      assert.equal(updated.refs.updates, original.hash, 'refs.updates points to original')
      assert.equal(updated.state.price, 4.50, 'state reflects new price')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_query — filters blocks by type', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create blocks of different types
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'observe.test_note',
          state: { text: 'note one' },
          refs: {},
        },
      }, 2)
      await readJsonRpc(proc, 10000)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'observe.test_note',
          state: { text: 'note two' },
          refs: {},
        },
      }, 3)
      await readJsonRpc(proc, 10000)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'place.warehouse',
          state: { name: 'Warehouse A' },
          refs: {},
        },
      }, 4)
      await readJsonRpc(proc, 10000)

      // Query for observe.test_note type
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_query',
        arguments: { type: 'observe.test_note', limit: 50 },
      }, 5)
      const queryResult = await readJsonRpc(proc, 10000)
      const queried = JSON.parse(queryResult.result.content[0].text)

      assert.ok(queried.count >= 2, 'found at least 2 observe.test_note blocks')
      for (const block of queried.blocks) {
        assert.ok(block.type.startsWith('observe.test_note'), 'all results match type filter')
      }
    } finally {
      proc.kill()
    }
  })

  // ── Traversal ───────────────────────────────────────────────────────

  it('foodblock_chain — traces update chain A -> B -> C', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create block A
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.product',
          state: { name: 'Bread', version: 1 },
          refs: {},
        },
      }, 2)
      const aResult = await readJsonRpc(proc, 10000)
      const blockA = JSON.parse(aResult.result.content[0].text)

      // Create block B (updates A)
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_update',
        arguments: {
          previous_hash: blockA.hash,
          type: 'substance.product',
          state: { name: 'Bread', version: 2 },
        },
      }, 3)
      const bResult = await readJsonRpc(proc, 10000)
      const blockB = JSON.parse(bResult.result.content[0].text)

      // Create block C (updates B)
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_update',
        arguments: {
          previous_hash: blockB.hash,
          type: 'substance.product',
          state: { name: 'Bread', version: 3 },
        },
      }, 4)
      const cResult = await readJsonRpc(proc, 10000)
      const blockC = JSON.parse(cResult.result.content[0].text)

      // Trace chain from C
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_chain',
        arguments: { hash: blockC.hash },
      }, 5)
      const chainResult = await readJsonRpc(proc, 10000)
      const chainData = JSON.parse(chainResult.result.content[0].text)

      assert.equal(chainData.length, 3, 'chain has 3 blocks')
      const chainHashes = chainData.chain.map(b => b.hash)
      assert.equal(chainHashes[0], blockC.hash, 'chain starts with C (newest)')
      assert.equal(chainHashes[1], blockB.hash, 'chain middle is B')
      assert.equal(chainHashes[2], blockA.hash, 'chain ends with A (oldest)')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_tree — builds provenance tree from refs', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create a farm
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor.producer',
          state: { name: 'Wheat Farm' },
          refs: {},
        },
      }, 2)
      const farmResult = await readJsonRpc(proc, 10000)
      const farm = JSON.parse(farmResult.result.content[0].text)

      // Create wheat (references farm)
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.ingredient',
          state: { name: 'Wheat' },
          refs: { producer: farm.hash },
        },
      }, 3)
      const wheatResult = await readJsonRpc(proc, 10000)
      const wheat = JSON.parse(wheatResult.result.content[0].text)

      // Create bread (references wheat)
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.product',
          state: { name: 'Bread' },
          refs: { ingredient: wheat.hash },
        },
      }, 4)
      const breadResult = await readJsonRpc(proc, 10000)
      const bread = JSON.parse(breadResult.result.content[0].text)

      // Get tree from bread
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_tree',
        arguments: { hash: bread.hash },
      }, 5)
      const treeResult = await readJsonRpc(proc, 10000)
      const treeData = JSON.parse(treeResult.result.content[0].text)

      assert.ok(treeData, 'tree returned data')
      assert.ok(treeData.block, 'tree has block at root')
      assert.equal(treeData.block.hash, bread.hash, 'tree root is bread')
      assert.ok(treeData.ancestors, 'tree has ancestors')
      assert.ok(treeData.ancestors.ingredient, 'tree has ingredient ancestor')
      assert.equal(treeData.ancestors.ingredient.block.hash, wheat.hash, 'ingredient ancestor is wheat')

      // Check deeper nesting: wheat -> producer -> farm
      assert.ok(treeData.ancestors.ingredient.ancestors.producer, 'wheat has producer ancestor')
      assert.equal(
        treeData.ancestors.ingredient.ancestors.producer.block.hash,
        farm.hash,
        'producer ancestor is the farm'
      )
    } finally {
      proc.kill()
    }
  })

  it('foodblock_heads — returns only latest version in each chain', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create original
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'observe.test_head',
          state: { name: 'Original' },
          refs: {},
        },
      }, 2)
      const origResult = await readJsonRpc(proc, 10000)
      const original = JSON.parse(origResult.result.content[0].text)

      // Update it
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_update',
        arguments: {
          previous_hash: original.hash,
          type: 'observe.test_head',
          state: { name: 'Updated' },
        },
      }, 3)
      const updResult = await readJsonRpc(proc, 10000)
      const updated = JSON.parse(updResult.result.content[0].text)

      // Get heads filtered by type
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_heads',
        arguments: { type: 'observe.test_head' },
      }, 4)
      const headsResult = await readJsonRpc(proc, 10000)
      const headsData = JSON.parse(headsResult.result.content[0].text)

      const headHashes = headsData.blocks.map(b => b.hash)
      assert.ok(headHashes.includes(updated.hash), 'heads includes updated block')
      assert.ok(!headHashes.includes(original.hash), 'heads does not include superseded original')
    } finally {
      proc.kill()
    }
  })

  // ── Batch + Tombstone ─────────────────────────────────────────────────

  it('foodblock_batch — inserts multiple blocks at once', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_batch',
        arguments: {
          blocks: [
            { type: 'actor.producer', state: { name: 'Farm A' }, refs: {} },
            { type: 'actor.producer', state: { name: 'Farm B' }, refs: {} },
            { type: 'place.warehouse', state: { name: 'Depot C' }, refs: {} },
          ],
        },
      }, 2)
      const result = await readJsonRpc(proc, 10000)
      const parsed = JSON.parse(result.result.content[0].text)

      assert.equal(parsed.inserted.length, 3, 'inserted 3 blocks')
      assert.equal(parsed.failed.length, 0, 'no failures')
      for (const h of parsed.inserted) {
        assert.equal(h.length, 64, 'each inserted hash is 64 hex chars')
      }
    } finally {
      proc.kill()
    }
  })

  it('foodblock_tombstone — marks a block for erasure', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create an actor to act as requester
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor',
          state: { name: 'Admin' },
          refs: {},
        },
      }, 2)
      const actorResult = await readJsonRpc(proc, 10000)
      const actor = JSON.parse(actorResult.result.content[0].text)

      // Create a block to tombstone
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'substance.product',
          state: { name: 'Recalled Product' },
          refs: {},
        },
      }, 3)
      const targetResult = await readJsonRpc(proc, 10000)
      const target = JSON.parse(targetResult.result.content[0].text)

      // Tombstone it
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_tombstone',
        arguments: {
          target_hash: target.hash,
          requested_by: actor.hash,
          reason: 'gdpr_erasure',
        },
      }, 4)
      const tombResult = await readJsonRpc(proc, 10000)
      const tombData = JSON.parse(tombResult.result.content[0].text)

      assert.ok(tombData.tombstone, 'tombstone block created')
      assert.equal(tombData.tombstone.type, 'observe.tombstone', 'tombstone has correct type')
      assert.equal(tombData.target, target.hash, 'target hash matches')

      // Verify target state was erased
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_get',
        arguments: { hash: target.hash },
      }, 5)
      const getResult = await readJsonRpc(proc, 10000)
      const erased = JSON.parse(getResult.result.content[0].text)
      assert.equal(erased.state.tombstoned, true, 'target state replaced with tombstoned: true')
    } finally {
      proc.kill()
    }
  })

  // ── Agent lifecycle ─────────────────────────────────────────────────

  it('foodblock_create_agent — registers agent with credentials', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create an operator actor first
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor',
          state: { name: 'Bakery Corp' },
          refs: {},
        },
      }, 2)
      const operatorResult = await readJsonRpc(proc, 10000)
      const operator = JSON.parse(operatorResult.result.content[0].text)

      // Create an agent for that operator
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create_agent',
        arguments: {
          name: 'Bakery Assistant',
          operator_hash: operator.hash,
          model: 'claude-sonnet',
          capabilities: ['transfer.order', 'substance.product'],
        },
      }, 3)
      const agentResult = await readJsonRpc(proc, 10000)
      const agentData = JSON.parse(agentResult.result.content[0].text)

      assert.ok(agentData.agent_hash, 'agent_hash returned')
      assert.ok(agentData.block, 'block returned')
      assert.ok(agentData.credentials, 'credentials returned')
      assert.ok(agentData.credentials.public_key, 'public_key present')
      assert.ok(agentData.credentials.private_key, 'private_key present')
      assert.ok(agentData.message.includes('Bakery Assistant'), 'message includes agent name')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_agent_draft — creates a draft block with draft=true', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create operator
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor',
          state: { name: 'Draft Test Corp' },
          refs: {},
        },
      }, 2)
      const opResult = await readJsonRpc(proc, 10000)
      const operator = JSON.parse(opResult.result.content[0].text)

      // Create agent
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create_agent',
        arguments: {
          name: 'Draft Agent',
          operator_hash: operator.hash,
        },
      }, 3)
      const agentResult = await readJsonRpc(proc, 10000)
      const agentData = JSON.parse(agentResult.result.content[0].text)

      // Create draft block
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_agent_draft',
        arguments: {
          agent_hash: agentData.agent_hash,
          type: 'transfer.order',
          state: { amount: 100, currency: 'gbp' },
          refs: {},
        },
      }, 4)
      const draftResult = await readJsonRpc(proc, 10000)
      const draftData = JSON.parse(draftResult.result.content[0].text)

      assert.ok(draftData.draft, 'draft block returned')
      assert.equal(draftData.draft.state.draft, true, 'state.draft is true')
      assert.equal(draftData.draft.state.amount, 100, 'state.amount preserved')
      assert.equal(draftData.draft.refs.agent, agentData.agent_hash, 'refs.agent set')
      assert.equal(draftData.signed_by, agentData.agent_hash, 'signed_by matches agent')
    } finally {
      proc.kill()
    }
  })

  it('foodblock_approve_draft — approves a draft and removes draft flag', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      // Create operator
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create',
        arguments: {
          type: 'actor',
          state: { name: 'Approval Test Corp' },
          refs: {},
        },
      }, 2)
      const opResult = await readJsonRpc(proc, 10000)
      const operator = JSON.parse(opResult.result.content[0].text)

      // Create agent
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_create_agent',
        arguments: {
          name: 'Approval Agent',
          operator_hash: operator.hash,
        },
      }, 3)
      const agentResult = await readJsonRpc(proc, 10000)
      const agentData = JSON.parse(agentResult.result.content[0].text)

      // Create draft
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_agent_draft',
        arguments: {
          agent_hash: agentData.agent_hash,
          type: 'transfer.order',
          state: { amount: 250, currency: 'usd' },
          refs: {},
        },
      }, 4)
      const draftResult = await readJsonRpc(proc, 10000)
      const draftData = JSON.parse(draftResult.result.content[0].text)

      // Approve the draft
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_approve_draft',
        arguments: {
          draft_hash: draftData.draft.hash,
        },
      }, 5)
      const approveResult = await readJsonRpc(proc, 10000)
      const approveData = JSON.parse(approveResult.result.content[0].text)

      assert.ok(approveData.approved, 'approved block returned')
      assert.equal(approveData.original_draft, draftData.draft.hash, 'original_draft references the draft')
      assert.ok(approveData.message.includes('approved'), 'message confirms approval')

      // Verify the approved block does not have draft=true
      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_get',
        arguments: { hash: approveData.approved.hash },
      }, 6)
      const getResult = await readJsonRpc(proc, 10000)
      const approved = JSON.parse(getResult.result.content[0].text)
      assert.ok(!approved.state.draft, 'approved block does not have draft=true')
      assert.equal(approved.state.amount, 250, 'approved block preserves state')
    } finally {
      proc.kill()
    }
  })

  // ── Natural language ────────────────────────────────────────────────

  it('foodblock_fb — parses natural language into substance.product', async () => {
    const proc = startServer()

    try {
      await initServer(proc)

      sendJsonRpc(proc, 'tools/call', {
        name: 'foodblock_fb',
        arguments: {
          text: 'Sourdough bread $4.50 organic',
        },
      }, 2)
      const result = await readJsonRpc(proc, 10000)
      const parsed = JSON.parse(result.result.content[0].text)

      assert.ok(parsed.blocks, 'result has blocks array')
      assert.ok(parsed.blocks.length > 0, 'at least one block created')

      const productBlock = parsed.blocks.find(b => b.type === 'substance.product')
      assert.ok(productBlock, 'found a substance.product block')
      assert.ok(productBlock.hash, 'product block has hash')
      assert.ok(
        productBlock.state.name.toLowerCase().includes('sourdough') ||
        productBlock.state.product_name?.toLowerCase().includes('sourdough'),
        'product name includes sourdough'
      )
    } finally {
      proc.kill()
    }
  })
})
