/**
 * FoodBlock Templates — reusable patterns for common workflows.
 * Templates are themselves FoodBlocks (observe.template) that describe
 * a sequence of block types with expected state and ref relationships.
 */

const { create } = require('./block')

/**
 * Create a template block.
 * @param {string} name - Template name
 * @param {string} description - What the template models
 * @param {Array} steps - Array of step definitions
 * @param {object} [opts] - { author: hash }
 * @returns {object} The template FoodBlock
 */
function createTemplate(name, description, steps, opts = {}) {
  const refs = {}
  if (opts.author) refs.author = opts.author
  return create('observe.template', {
    name,
    description,
    steps
  }, refs)
}

/**
 * Instantiate a template — create real blocks from a template pattern.
 *
 * @param {object} template - A template block (or its state)
 * @param {object} values - Map of step alias to { state, refs } overrides
 * @param {object} [opts] - { registry } for alias resolution
 * @returns {object[]} Array of created blocks, in dependency order
 */
function fromTemplate(template, values = {}) {
  const state = template.state || template
  const steps = state.steps
  if (!steps || !Array.isArray(steps)) {
    throw new Error('FoodBlock: template must have steps array')
  }

  const aliases = new Map()
  const blocks = []

  for (const step of steps) {
    const alias = step.alias || step.type
    const overrides = values[alias] || {}

    // Build state from step defaults + overrides
    const blockState = { ...(step.default_state || {}) }
    if (Array.isArray(step.required)) {
      for (const field of step.required) {
        if (!overrides.state || !(field in overrides.state)) {
          // Skip if required field not provided (partial instantiation)
        }
      }
    }
    if (overrides.state) Object.assign(blockState, overrides.state)

    // Build refs, resolving @aliases to previously created block hashes
    const blockRefs = {}
    if (step.refs) {
      for (const [role, target] of Object.entries(step.refs)) {
        if (typeof target === 'string' && target.startsWith('@')) {
          const refAlias = target.slice(1)
          if (aliases.has(refAlias)) {
            blockRefs[role] = aliases.get(refAlias)
          }
        } else {
          blockRefs[role] = target
        }
      }
    }
    // Override refs from values
    if (overrides.refs) {
      for (const [role, target] of Object.entries(overrides.refs)) {
        if (typeof target === 'string' && target.startsWith('@')) {
          const refAlias = target.slice(1)
          if (aliases.has(refAlias)) {
            blockRefs[role] = aliases.get(refAlias)
          }
        } else {
          blockRefs[role] = target
        }
      }
    }

    const block = create(step.type, blockState, blockRefs)
    aliases.set(alias, block.hash)
    blocks.push(block)
  }

  return blocks
}

/**
 * Built-in templates for common patterns.
 */
const TEMPLATES = {
  'supply-chain': {
    name: 'Farm-to-Table Supply Chain',
    description: 'A complete provenance chain from primary producer to retail',
    steps: [
      { type: 'actor.producer', alias: 'farm', required: ['name'] },
      { type: 'substance.ingredient', alias: 'crop', refs: { source: '@farm' }, required: ['name'] },
      { type: 'transform.process', alias: 'processing', refs: { input: '@crop' }, required: ['name'] },
      { type: 'substance.product', alias: 'product', refs: { origin: '@processing' }, required: ['name'] },
      { type: 'transfer.order', alias: 'sale', refs: { item: '@product' } }
    ]
  },
  'review': {
    name: 'Product Review',
    description: 'A consumer review of a food product',
    steps: [
      { type: 'actor.venue', alias: 'venue', required: ['name'] },
      { type: 'substance.product', alias: 'product', refs: { seller: '@venue' }, required: ['name'] },
      { type: 'observe.review', alias: 'review', refs: { subject: '@product' }, required: ['rating'] }
    ]
  },
  'certification': {
    name: 'Product Certification',
    description: 'An authority certifying a producer or product',
    steps: [
      { type: 'actor.authority', alias: 'authority', required: ['name'] },
      { type: 'actor.producer', alias: 'producer', required: ['name'] },
      { type: 'observe.certification', alias: 'cert', refs: { authority: '@authority', subject: '@producer' }, required: ['name'] }
    ]
  },
  'surplus-rescue': {
    name: 'Surplus Rescue',
    description: 'Food business posts surplus, sustainer collects, donation recorded',
    steps: [
      { type: 'actor.venue', alias: 'donor', required: true, defaultState: { name: 'Food Business' } },
      { type: 'substance.surplus', alias: 'surplus', refs: { seller: '@donor' }, required: true, defaultState: { name: 'Surplus Food', status: 'available' } },
      { type: 'transfer.donation', alias: 'donation', refs: { source: '@donor', item: '@surplus' }, required: true, defaultState: { status: 'collected' } }
    ]
  },
  'agent-reorder': {
    name: 'Agent Reorder',
    description: 'Inventory check → low stock → draft order → approve → order placed',
    steps: [
      { type: 'actor.venue', alias: 'business', required: true, defaultState: { name: 'Business' } },
      { type: 'observe.reading', alias: 'inventory-check', refs: { subject: '@business' }, required: true, defaultState: { name: 'Inventory Check', reading_type: 'stock_level' } },
      { type: 'actor.agent', alias: 'agent', refs: { operator: '@business' }, required: true, defaultState: { name: 'Reorder Agent', capabilities: ['ordering'] } },
      { type: 'transfer.order', alias: 'draft-order', refs: { buyer: '@business', agent: '@agent' }, required: true, defaultState: { status: 'draft', draft: true } },
      { type: 'transfer.order', alias: 'confirmed-order', refs: { buyer: '@business', updates: '@draft-order' }, required: true, defaultState: { status: 'confirmed' } }
    ]
  },
  'restaurant-sourcing': {
    name: 'Restaurant Sourcing',
    description: 'Restaurant needs ingredient → discovery → supplier offer → accept → order → delivery',
    steps: [
      { type: 'actor.venue', alias: 'restaurant', required: true, defaultState: { name: 'Restaurant' } },
      { type: 'substance.ingredient', alias: 'needed', refs: {}, required: true, defaultState: { name: 'Ingredient Needed' } },
      { type: 'actor.producer', alias: 'supplier', required: true, defaultState: { name: 'Supplier' } },
      { type: 'transfer.offer', alias: 'offer', refs: { seller: '@supplier', item: '@needed', buyer: '@restaurant' }, required: true, defaultState: { status: 'offered' } },
      { type: 'transfer.order', alias: 'order', refs: { buyer: '@restaurant', seller: '@supplier', item: '@needed' }, required: true, defaultState: { status: 'confirmed' } },
      { type: 'transfer.delivery', alias: 'delivery', refs: { order: '@order', seller: '@supplier', buyer: '@restaurant' }, required: true, defaultState: { status: 'delivered' } }
    ]
  },
  'food-safety-audit': {
    name: 'Food Safety Audit',
    description: 'Inspector visits → readings taken → report → certification → attestation',
    steps: [
      { type: 'actor.venue', alias: 'premises', required: true, defaultState: { name: 'Food Premises' } },
      { type: 'actor.producer', alias: 'inspector', required: true, defaultState: { name: 'Food Safety Inspector' } },
      { type: 'observe.reading', alias: 'readings', refs: { subject: '@premises', author: '@inspector' }, required: true, defaultState: { name: 'Safety Readings' } },
      { type: 'observe.certification', alias: 'certificate', refs: { subject: '@premises', authority: '@inspector' }, required: true, defaultState: { name: 'Food Safety Certificate' } },
      { type: 'observe.attestation', alias: 'attestation', refs: { confirms: '@certificate', attestor: '@inspector' }, required: true, defaultState: { confidence: 'verified' } }
    ]
  },
  'market-day': {
    name: 'Market Day',
    description: 'Producer brings stock → stall setup → sales → end-of-day surplus → donation',
    steps: [
      { type: 'actor.producer', alias: 'producer', required: true, defaultState: { name: 'Market Producer' } },
      { type: 'place.market', alias: 'market', required: true, defaultState: { name: 'Farmers Market' } },
      { type: 'substance.product', alias: 'stock', refs: { seller: '@producer' }, required: true, defaultState: { name: 'Market Stock' } },
      { type: 'transfer.order', alias: 'sales', refs: { seller: '@producer', item: '@stock' }, required: false, defaultState: { status: 'completed' } },
      { type: 'substance.surplus', alias: 'leftover', refs: { seller: '@producer', source: '@stock' }, required: false, defaultState: { name: 'End of Day Surplus', status: 'available' } }
    ]
  },
  'cold-chain': {
    name: 'Cold Chain',
    description: 'Shipment departs → temperature readings → delivery → chain verified',
    steps: [
      { type: 'actor.distributor', alias: 'carrier', required: true, defaultState: { name: 'Cold Chain Carrier' } },
      { type: 'transfer.delivery', alias: 'shipment', refs: { carrier: '@carrier' }, required: true, defaultState: { status: 'in_transit' } },
      { type: 'observe.reading', alias: 'temp-log', refs: { subject: '@shipment' }, required: true, defaultState: { name: 'Temperature Log', reading_type: 'temperature' } },
      { type: 'observe.attestation', alias: 'chain-verified', refs: { confirms: '@shipment', attestor: '@carrier' }, required: true, defaultState: { confidence: 'verified', method: 'continuous_monitoring' } }
    ]
  }
}

module.exports = { createTemplate, fromTemplate, TEMPLATES }
