/**
 * FoodBlock Seed Data — vocabularies and templates as actual blocks.
 *
 * Converts the built-in VOCABULARIES and TEMPLATES constants into
 * real FoodBlocks that can be inserted into any store.
 */

const { create } = require('./block')
const { VOCABULARIES } = require('./vocabulary')
const { TEMPLATES } = require('./template')

/**
 * Generate all vocabulary blocks from built-in definitions.
 * @returns {object[]} Array of observe.vocabulary blocks
 */
function seedVocabularies() {
  return Object.entries(VOCABULARIES).map(([domain, def]) => {
    return create('observe.vocabulary', {
      domain: def.domain,
      for_types: def.for_types,
      fields: def.fields,
      ...(def.transitions ? { transitions: def.transitions } : {})
    })
  })
}

/**
 * Generate all template blocks from built-in definitions.
 * @returns {object[]} Array of observe.template blocks
 */
function seedTemplates() {
  return Object.entries(TEMPLATES).map(([key, def]) => {
    return create('observe.template', {
      name: def.name,
      description: def.description,
      steps: def.steps
    })
  })
}

/**
 * Generate all seed blocks (vocabularies + templates).
 * @returns {object[]} Array of all seed FoodBlocks
 */
function seedAll() {
  return [...seedVocabularies(), ...seedTemplates()]
}

module.exports = { seedVocabularies, seedTemplates, seedAll }
