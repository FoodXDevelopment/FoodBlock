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
    if (step.required) {
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
  }
}

module.exports = { createTemplate, fromTemplate, TEMPLATES }
