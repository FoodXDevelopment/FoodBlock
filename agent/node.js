#!/usr/bin/env node

/**
 * FoodX Node — Reference Agent
 *
 * A demo autonomous agent that simulates a day in the life of a bakery.
 * Watches inventory, proposes orders, lists surplus — all as draft FoodBlocks
 * that need human approval.
 *
 * Usage: node agent/node.js
 *
 * Everything the agent does is a FoodBlock. Everything is a draft until
 * the human approves it. Nothing is hidden from the graph.
 */

const { create, update, createAgent, createDraft, approveDraft, verify } = require('../sdk/javascript/src/index')
const readline = require('readline')

// ── Pretty logging ──────────────────────────────────────────────────

const GREY = '\x1b[90m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

function log(icon, msg) { console.log(`  ${icon}  ${msg}`) }
function logBlock(label, block) {
  console.log(`      ${GREY}${label}: ${block.hash.slice(0, 16)}... (${block.type})${RESET}`)
}
function divider(title) {
  console.log('')
  console.log(`${BOLD}${CYAN}── ${title} ${'─'.repeat(50 - title.length)}${RESET}`)
  console.log('')
}

// ── Simulated in-memory store ───────────────────────────────────────

const store = new Map()
function save(block) { store.set(block.hash, block); return block }

// ── Ask the human ───────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY || false })

const inputLines = []
let lineResolve = null

rl.on('line', (line) => {
  if (lineResolve) {
    const r = lineResolve
    lineResolve = null
    r(line.trim().toLowerCase())
  } else {
    inputLines.push(line.trim().toLowerCase())
  }
})

function ask(question) {
  process.stdout.write(`  ${YELLOW}?  ${question}${RESET} `)
  return new Promise((resolve) => {
    if (inputLines.length > 0) {
      const line = inputLines.shift()
      console.log(line)
      resolve(line)
    } else {
      lineResolve = (line) => {
        console.log(line)
        resolve(line)
      }
    }
  })
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log(`${BOLD}  ╔══════════════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}  ║           FoodX Node — Bakery Agent             ║${RESET}`)
  console.log(`${BOLD}  ║     A day in the life of an AI assistant        ║${RESET}`)
  console.log(`${BOLD}  ╚══════════════════════════════════════════════════╝${RESET}`)

  // ── Setup: Create the world ───────────────────────────────────────

  divider('SETUP: Creating the bakery world')

  const bakery = save(create('actor.venue', { name: 'Joes Bakery', sector: 'hospitality' }))
  log('🏪', `Bakery: ${BOLD}Joes Bakery${RESET}`)

  const mill = save(create('actor.maker', { name: 'Stone Mill Co', sector: 'processing' }))
  log('🏭', `Supplier: ${BOLD}Stone Mill Co${RESET}`)

  const foodBank = save(create('actor.sustainer', { name: 'Too Good To Go', sector: 'waste_sustainability' }))
  log('💚', `Food bank: ${BOLD}Too Good To Go${RESET}`)

  const shop = save(create('place.venue', { name: 'Joes on High Street', lat: 51.52, lng: -0.08 }, { owner: bakery.hash }))
  log('📍', `Location: ${BOLD}Joes on High Street${RESET}`)

  const flour = save(create('substance.product', {
    name: 'Stoneground Wholemeal Flour',
    price: 3.20,
    weight: { value: 1.5, unit: 'kg' }
  }, { seller: mill.hash }))
  log('🌾', `Product: ${BOLD}Flour${RESET} (£3.20/1.5kg)`)

  const sourdough = save(create('substance.product', {
    name: 'Artisan Sourdough',
    price: 5.00,
    weight: { value: 800, unit: 'g' },
    allergens: { gluten: true, dairy: false }
  }, { seller: bakery.hash }))
  log('🍞', `Product: ${BOLD}Artisan Sourdough${RESET} (£5.00)`)

  const croissant = save(create('substance.product', {
    name: 'Butter Croissant',
    price: 2.80,
    allergens: { gluten: true, dairy: true }
  }, { seller: bakery.hash }))
  log('🥐', `Product: ${BOLD}Butter Croissant${RESET} (£2.80)`)

  // ── Create the agent ──────────────────────────────────────────────

  divider('AGENT: Registering bakery assistant')

  const agent = createAgent('Joes Bakery Assistant', bakery.hash, {
    model: 'claude-sonnet',
    capabilities: ['inventory', 'ordering', 'surplus', 'pricing']
  })
  save(agent.block)

  log('🤖', `Agent: ${BOLD}${agent.block.state.name}${RESET}`)
  log('🔑', `Identity: ${GREY}${agent.authorHash.slice(0, 24)}...${RESET}`)
  log('👤', `Operator: Joes Bakery`)
  log('🧠', `Capabilities: inventory, ordering, surplus, pricing`)

  // ── 6:00 AM — Morning inventory check ────────────────────────────

  divider('6:00 AM — Morning inventory check')

  log('🤖', 'Agent scanning inventory...')
  await sleep(1000)

  const inventory = {
    flour_kg: 3.2,
    yeast_kg: 0.8,
    salt_kg: 2.1,
    sourdough_loaves: 0,
    croissants: 0
  }

  const inventoryBlock = save(createDraft(agent, 'observe.inventory', {
    date: '2026-02-16T06:00:00Z',
    items: [
      { product: 'Stoneground Wholemeal Flour', quantity_kg: inventory.flour_kg, status: inventory.flour_kg < 5 ? 'low' : 'ok' },
      { product: 'Wild Yeast Starter', quantity_kg: inventory.yeast_kg, status: 'ok' },
      { product: 'Sea Salt', quantity_kg: inventory.salt_kg, status: 'ok' }
    ]
  }, { place: shop.hash, operator: bakery.hash }).block)

  log('📋', `Flour: ${RED}${inventory.flour_kg}kg${RESET} (threshold: 5kg)`)
  log('📋', `Yeast: ${GREEN}${inventory.yeast_kg}kg${RESET}`)
  log('📋', `Salt: ${GREEN}${inventory.salt_kg}kg${RESET}`)
  logBlock('Inventory block', inventoryBlock)

  await sleep(500)
  log('⚠️', `${YELLOW}ALERT: Flour below reorder threshold (3.2kg < 5kg)${RESET}`)

  // ── 6:05 AM — Agent proposes flour reorder ────────────────────────

  divider('6:05 AM — Agent proposes flour reorder')

  log('🤖', 'Agent drafting flour order...')
  await sleep(800)

  const { block: draftOrder, signed } = createDraft(agent, 'transfer.order', {
    quantity: 50,
    unit: 'kg',
    total: 160.00,
    reason: 'auto: flour stock at 3.2kg, below 5kg threshold',
    date: '2026-02-16'
  }, {
    buyer: bakery.hash,
    seller: mill.hash,
    product: flour.hash
  })
  save(draftOrder)

  log('📝', `${BOLD}DRAFT ORDER:${RESET} 50kg flour from Stone Mill Co — £160.00`)
  log('📝', `Reason: flour stock at 3.2kg, below 5kg threshold`)
  log('🔏', `Signed by agent: ${GREY}${signed.signature.slice(0, 32)}...${RESET}`)
  logBlock('Draft block', draftOrder)

  console.log('')
  const approveOrder = await ask('Baker: approve this flour order? (y/n)')

  if (approveOrder === 'y' || approveOrder === 'yes') {
    const confirmed = save(approveDraft(draftOrder))
    log('✅', `${GREEN}ORDER APPROVED${RESET} — 50kg flour from Stone Mill Co`)
    logBlock('Confirmed block', confirmed)
    log('🔗', `${GREY}refs.updates → ${draftOrder.hash.slice(0, 16)}... (the draft)${RESET}`)
    log('🔗', `${GREY}refs.approved_agent → ${agent.authorHash.slice(0, 16)}... (the agent)${RESET}`)
  } else {
    log('❌', `${RED}ORDER REJECTED${RESET} — baker decided not to reorder yet`)
  }

  // ── 2:00 PM — Sales update ────────────────────────────────────────

  divider('2:00 PM — Midday sales update')

  log('🤖', 'Agent reading POS data...')
  await sleep(800)

  const sales = { sourdough_sold: 22, sourdough_remaining: 8, croissants_sold: 15, croissants_remaining: 3 }

  log('📊', `Sourdough: ${sales.sourdough_sold} sold, ${BOLD}${sales.sourdough_remaining} remaining${RESET}`)
  log('📊', `Croissants: ${sales.croissants_sold} sold, ${BOLD}${sales.croissants_remaining} remaining${RESET}`)
  log('💰', `Revenue so far: £${(sales.sourdough_sold * 5 + sales.croissants_sold * 2.80).toFixed(2)}`)

  // ── 5:00 PM — End of day surplus ──────────────────────────────────

  divider('5:00 PM — End of day surplus detection')

  log('🤖', 'Agent checking for unsold stock...')
  await sleep(800)

  const unsoldSourdough = 4
  const unsoldCroissants = 2
  const originalValue = (unsoldSourdough * 5) + (unsoldCroissants * 2.80)
  const surplusPrice = Math.round(originalValue * 0.4 * 100) / 100

  log('📦', `Unsold: ${unsoldSourdough} sourdough + ${unsoldCroissants} croissants`)
  log('📦', `Original value: £${originalValue.toFixed(2)}`)
  log('📦', `Proposed surplus price: ${BOLD}£${surplusPrice.toFixed(2)}${RESET} (60% off)`)

  await sleep(500)

  const { block: draftSurplus } = createDraft(agent, 'substance.surplus', {
    name: 'End of Day Mixed Bread & Pastries',
    items: [
      { product: 'Artisan Sourdough', quantity: unsoldSourdough },
      { product: 'Butter Croissant', quantity: unsoldCroissants }
    ],
    original_price: originalValue,
    surplus_price: surplusPrice,
    available_until: '2026-02-16T18:00:00Z'
  }, {
    seller: bakery.hash,
    collector: foodBank.hash
  })
  save(draftSurplus)

  log('📝', `${BOLD}DRAFT SURPLUS:${RESET} Mixed bread & pastries — £${surplusPrice.toFixed(2)} (was £${originalValue.toFixed(2)})`)
  log('📝', `Available until: 6:00 PM today`)
  log('📝', `Collector: Too Good To Go`)
  logBlock('Draft block', draftSurplus)

  console.log('')
  const approveSurplus = await ask('Baker: post this surplus listing? (y/n)')

  if (approveSurplus === 'y' || approveSurplus === 'yes') {
    const confirmed = save(approveDraft(draftSurplus))
    log('✅', `${GREEN}SURPLUS POSTED${RESET} — visible to food banks and collectors`)
    logBlock('Confirmed block', confirmed)
  } else {
    log('❌', `${RED}SURPLUS NOT POSTED${RESET} — baker keeping the stock`)
  }

  // ── 5:30 PM — Price suggestion ────────────────────────────────────

  divider('5:30 PM — Agent analyses the day')

  log('🤖', 'Agent analysing sales patterns...')
  await sleep(1000)

  log('📈', `Sourdough: 22/30 sold (73%) — ${GREEN}strong demand${RESET}`)
  log('📉', `Croissants: 15/18 sold (83%) — ${GREEN}good demand${RESET}`)
  log('💡', `${YELLOW}Suggestion: consider increasing sourdough batch size by 10%${RESET}`)
  log('💡', `${YELLOW}Suggestion: croissant pricing optimal, no change needed${RESET}`)

  // ── Summary ───────────────────────────────────────────────────────

  divider('END OF DAY — Summary')

  const totalBlocks = store.size
  const agentBlocks = [...store.values()].filter(b => b.refs && b.refs.agent === agent.authorHash).length

  log('📊', `Total FoodBlocks created today: ${BOLD}${totalBlocks}${RESET}`)
  log('🤖', `Blocks created by agent: ${BOLD}${agentBlocks}${RESET}`)
  log('👤', `Blocks approved by baker: checked in real-time above`)
  log('🔗', `Every action is traceable in the FoodBlock graph`)

  console.log('')
  console.log(`${GREY}  The agent proposed. The human decided. The graph recorded everything.${RESET}`)
  console.log(`${GREY}  That's the FoodX Node.${RESET}`)
  console.log('')

  rl.close()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
