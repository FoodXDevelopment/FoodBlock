/**
 * FoodBlock Vocabulary — shared field definitions that bridge natural
 * language and protocol structure. Vocabularies are themselves FoodBlocks
 * (observe.vocabulary).
 */

const { create } = require('./block')

/**
 * Create an observe.vocabulary block.
 *
 * @param {string} domain - Domain name like "bakery", "dairy", "restaurant"
 * @param {string[]} forTypes - Block types this vocabulary applies to
 * @param {object} fields - Map of field name to { type, required?, aliases?, description? }
 * @param {object} [opts] - { author: hash }
 * @returns {object} The vocabulary FoodBlock
 */
function createVocabulary(domain, forTypes, fields, opts = {}) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('FoodBlock: domain is required and must be a string')
  }
  if (!Array.isArray(forTypes) || forTypes.length === 0) {
    throw new Error('FoodBlock: forTypes must be a non-empty array')
  }
  if (!fields || typeof fields !== 'object') {
    throw new Error('FoodBlock: fields must be an object')
  }

  const refs = {}
  if (opts.author) refs.author = opts.author

  return create('observe.vocabulary', {
    domain,
    for_types: forTypes,
    fields
  }, refs)
}

/**
 * Given natural language text and a vocabulary block, extract field values
 * using simple keyword/pattern matching on field aliases.
 *
 * @param {string} text - Natural language text to parse
 * @param {object} vocabulary - A vocabulary block (or its state)
 * @returns {object} { matched: { field: value }, unmatched: string[] }
 */
function mapFields(text, vocabulary) {
  const state = vocabulary.state || vocabulary
  const fields = state.fields
  if (!fields) {
    return { matched: {}, unmatched: [text] }
  }

  const matched = {}
  const words = text.toLowerCase()
  const tokens = words.split(/[\s,;]+/).filter(Boolean)
  const usedTokenIndices = new Set()

  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    const aliases = fieldDef.aliases || [fieldName]
    const fieldType = fieldDef.type || 'string'

    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase()

      if (fieldType === 'boolean' || fieldType === 'flag') {
        // Boolean fields: if alias appears in text, set to true
        if (words.includes(aliasLower)) {
          if (typeof matched[fieldName] === 'object') {
            matched[fieldName][aliasLower] = true
          } else if (matched[fieldName] === undefined && fieldDef.compound) {
            matched[fieldName] = { [aliasLower]: true }
          } else {
            matched[fieldName] = true
          }
          // Mark tokens used
          for (let i = 0; i < tokens.length; i++) {
            if (tokens[i] === aliasLower) usedTokenIndices.add(i)
          }
        }
      } else if (fieldType === 'number') {
        // Number fields: find alias then extract adjacent number
        const aliasIdx = tokens.indexOf(aliasLower)
        if (aliasIdx !== -1) {
          usedTokenIndices.add(aliasIdx)
          // Look for a number adjacent to the alias
          for (let offset = -2; offset <= 2; offset++) {
            if (offset === 0) continue
            const idx = aliasIdx + offset
            if (idx >= 0 && idx < tokens.length) {
              const num = parseFloat(tokens[idx])
              if (!isNaN(num)) {
                matched[fieldName] = num
                usedTokenIndices.add(idx)
                break
              }
            }
          }
        } else {
          // Try regex pattern: "alias ... number" or "number ... alias"
          const pattern = new RegExp(
            '(?:' + escapeRegex(aliasLower) + ')\\s+(?:for\\s+)?([\\d.]+)|([\\d.]+)\\s+(?:' + escapeRegex(aliasLower) + ')',
            'i'
          )
          const match = text.match(pattern)
          if (match) {
            const num = parseFloat(match[1] || match[2])
            if (!isNaN(num)) {
              matched[fieldName] = num
            }
          }
        }
      } else if (fieldType === 'compound') {
        // Compound fields: collect aliases as keys in an object
        if (words.includes(aliasLower)) {
          if (!matched[fieldName]) matched[fieldName] = {}
          matched[fieldName][aliasLower] = true
          for (let i = 0; i < tokens.length; i++) {
            if (tokens[i] === aliasLower) usedTokenIndices.add(i)
          }
        }
      } else {
        // String fields: find alias then extract adjacent word(s)
        const aliasIdx = tokens.indexOf(aliasLower)
        if (aliasIdx !== -1) {
          usedTokenIndices.add(aliasIdx)
          // Take the next token as the value
          if (aliasIdx + 1 < tokens.length) {
            matched[fieldName] = tokens[aliasIdx + 1]
            usedTokenIndices.add(aliasIdx + 1)
          }
        }
      }
    }
  }

  // Collect unmatched tokens
  const unmatched = []
  for (let i = 0; i < tokens.length; i++) {
    if (!usedTokenIndices.has(i)) {
      unmatched.push(tokens[i])
    }
  }

  return { matched, unmatched }
}

/**
 * Escape a string for use in a regular expression.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Built-in vocabulary definitions (not blocks, just field definitions).
 */
const VOCABULARIES = {
  bakery: {
    domain: 'bakery',
    for_types: ['substance.product', 'substance.ingredient', 'transform.process'],
    fields: {
      price: {
        type: 'number',
        aliases: ['price', 'cost', 'sells for', 'costs'],
        description: 'Price of the baked good'
      },
      weight: {
        type: 'number',
        aliases: ['weight', 'weighs', 'grams', 'kg'],
        description: 'Weight of the product'
      },
      allergens: {
        type: 'compound',
        aliases: ['gluten', 'nuts', 'dairy', 'eggs', 'soy', 'wheat'],
        description: 'Allergens present in the product'
      },
      name: {
        type: 'string',
        required: true,
        aliases: ['name', 'called', 'named'],
        description: 'Product name'
      },
      organic: {
        type: 'boolean',
        aliases: ['organic', 'bio'],
        description: 'Whether the product is organic'
      }
    }
  },

  restaurant: {
    domain: 'restaurant',
    for_types: ['actor.venue', 'substance.product', 'observe.review'],
    fields: {
      cuisine: {
        type: 'string',
        aliases: ['cuisine', 'style', 'serves'],
        description: 'Type of cuisine served'
      },
      rating: {
        type: 'number',
        aliases: ['rating', 'rated', 'stars', 'score'],
        description: 'Rating score'
      },
      price_range: {
        type: 'string',
        aliases: ['price range', 'budget', 'expensive', 'cheap', 'moderate'],
        description: 'Price range category'
      },
      halal: {
        type: 'boolean',
        aliases: ['halal'],
        description: 'Whether food is halal'
      },
      kosher: {
        type: 'boolean',
        aliases: ['kosher'],
        description: 'Whether food is kosher'
      },
      vegan: {
        type: 'boolean',
        aliases: ['vegan', 'plant-based'],
        description: 'Whether food is vegan'
      }
    }
  },

  farm: {
    domain: 'farm',
    for_types: ['actor.producer', 'substance.ingredient', 'observe.certification'],
    fields: {
      crop: {
        type: 'string',
        aliases: ['crop', 'grows', 'produces', 'cultivates'],
        description: 'Primary crop or product'
      },
      acreage: {
        type: 'number',
        aliases: ['acreage', 'acres', 'hectares', 'area'],
        description: 'Farm size'
      },
      organic: {
        type: 'boolean',
        aliases: ['organic', 'bio', 'chemical-free'],
        description: 'Whether the farm is organic'
      },
      region: {
        type: 'string',
        aliases: ['region', 'location', 'from', 'based in'],
        description: 'Geographic region'
      },
      seasonal: {
        type: 'boolean',
        aliases: ['seasonal'],
        description: 'Whether production is seasonal'
      }
    }
  },

  retail: {
    domain: 'retail',
    for_types: ['actor.venue', 'substance.product', 'transfer.order'],
    fields: {
      price: {
        type: 'number',
        aliases: ['price', 'cost', 'sells for', 'priced at'],
        description: 'Retail price'
      },
      sku: {
        type: 'string',
        aliases: ['sku', 'product code', 'item number'],
        description: 'Stock keeping unit'
      },
      quantity: {
        type: 'number',
        aliases: ['quantity', 'qty', 'count', 'units'],
        description: 'Available quantity'
      },
      category: {
        type: 'string',
        aliases: ['category', 'department', 'section', 'aisle'],
        description: 'Product category'
      },
      on_sale: {
        type: 'boolean',
        aliases: ['on sale', 'discounted', 'clearance'],
        description: 'Whether the item is on sale'
      }
    }
  },

  lot: {
    domain: 'lot',
    for_types: ['substance.product', 'substance.ingredient', 'transform.process'],
    fields: {
      lot_id: {
        type: 'string',
        required: true,
        aliases: ['lot', 'lot number', 'lot id', 'batch'],
        description: 'Lot or batch identifier'
      },
      batch_id: {
        type: 'string',
        aliases: ['batch', 'batch number', 'batch id'],
        description: 'Batch identifier (alias for lot_id in some systems)'
      },
      production_date: {
        type: 'string',
        aliases: ['produced', 'manufactured', 'made on', 'production date'],
        description: 'Date of production (ISO 8601)'
      },
      expiry_date: {
        type: 'string',
        aliases: ['expires', 'expiry', 'best before', 'use by', 'sell by'],
        description: 'Expiry or best-before date (ISO 8601)'
      },
      lot_size: {
        type: 'number',
        aliases: ['lot size', 'batch size', 'quantity produced'],
        description: 'Number of units in the lot'
      },
      facility: {
        type: 'string',
        aliases: ['facility', 'plant', 'factory', 'site'],
        description: 'Production facility identifier'
      }
    }
  },

  units: {
    domain: 'units',
    for_types: ['substance.product', 'substance.ingredient', 'transfer.order', 'observe.reading'],
    fields: {
      weight: {
        type: 'quantity',
        aliases: ['weight', 'weighs', 'mass'],
        valid_units: ['g', 'kg', 'oz', 'lb', 'ton', 'mg'],
        description: 'Weight/mass measurement'
      },
      volume: {
        type: 'quantity',
        aliases: ['volume', 'capacity', 'amount'],
        valid_units: ['ml', 'l', 'fl_oz', 'gal', 'cup', 'tbsp', 'tsp'],
        description: 'Volume measurement'
      },
      temperature: {
        type: 'quantity',
        aliases: ['temperature', 'temp', 'degrees'],
        valid_units: ['celsius', 'fahrenheit', 'kelvin'],
        description: 'Temperature reading'
      },
      length: {
        type: 'quantity',
        aliases: ['length', 'height', 'width', 'depth', 'distance'],
        valid_units: ['mm', 'cm', 'm', 'km', 'in', 'ft'],
        description: 'Length/distance measurement'
      },
      currency: {
        type: 'quantity',
        aliases: ['price', 'cost', 'total', 'amount'],
        valid_units: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'],
        description: 'Monetary amount'
      }
    }
  },

  workflow: {
    domain: 'workflow',
    for_types: ['transfer.order', 'transfer.shipment', 'transfer.booking'],
    fields: {
      status: {
        type: 'string',
        required: true,
        aliases: ['status', 'state', 'stage'],
        valid_values: ['draft', 'quote', 'order', 'confirmed', 'processing', 'shipped', 'delivered', 'paid', 'cancelled', 'returned'],
        description: 'Current workflow status'
      },
      previous_status: {
        type: 'string',
        aliases: ['was', 'previously', 'changed from'],
        description: 'Previous status before transition'
      },
      reason: {
        type: 'string',
        aliases: ['reason', 'because', 'note'],
        description: 'Reason for status change'
      }
    },
    transitions: {
      draft: ['quote', 'order', 'cancelled'],
      quote: ['order', 'cancelled'],
      order: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'returned'],
      delivered: ['paid', 'returned'],
      paid: [],
      cancelled: [],
      returned: ['order']
    }
  }
}

/**
 * Create a quantity object with value and unit.
 * Convention: all measurable values should use { value, unit } format.
 *
 * @param {number} value - The numeric value
 * @param {string} unit - The unit of measurement
 * @param {string} [type] - Optional measurement type for validation (weight, volume, etc.)
 * @returns {object} { value, unit }
 */
function quantity(value, unit, type) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('FoodBlock: quantity value must be a number')
  }
  if (!unit || typeof unit !== 'string') {
    throw new Error('FoodBlock: quantity unit is required')
  }

  // Validate unit against vocabulary if type is provided
  if (type && VOCABULARIES.units) {
    const fieldDef = VOCABULARIES.units.fields[type]
    if (fieldDef && fieldDef.valid_units && !fieldDef.valid_units.includes(unit)) {
      throw new Error(`FoodBlock: invalid unit '${unit}' for ${type}. Valid: ${fieldDef.valid_units.join(', ')}`)
    }
  }

  return { value, unit }
}

/**
 * Validate a workflow state transition.
 *
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {boolean} Whether the transition is valid
 */
function transition(from, to) {
  const transitions = VOCABULARIES.workflow.transitions
  if (!transitions[from]) return false
  return transitions[from].includes(to)
}

/**
 * Get valid next statuses for a given status.
 *
 * @param {string} status - Current status
 * @returns {string[]} Valid next statuses
 */
function nextStatuses(status) {
  const transitions = VOCABULARIES.workflow.transitions
  return transitions[status] || []
}

/**
 * Localize a block's state fields, extracting values for a specific locale.
 * Convention: multilingual fields use nested objects { en: "...", fr: "...", ... }.
 *
 * @param {object} block - A FoodBlock
 * @param {string} locale - Locale code (e.g. 'en', 'fr', 'de')
 * @param {string} [fallback='en'] - Fallback locale if requested locale not found
 * @returns {object} Block with localized state
 */
function localize(block, locale, fallback = 'en') {
  if (!block || !block.state) return block

  const localized = { ...block, state: {} }

  for (const [key, value] of Object.entries(block.state)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Check if this looks like a locale object (keys are 2-letter codes)
      const keys = Object.keys(value)
      const isLocaleObj = keys.length > 0 && keys.every(k => /^[a-z]{2}(-[A-Z]{2})?$/.test(k))
      if (isLocaleObj) {
        localized.state[key] = value[locale] || value[fallback] || value[keys[0]] || value
      } else {
        localized.state[key] = value
      }
    } else {
      localized.state[key] = value
    }
  }

  return localized
}

module.exports = { createVocabulary, mapFields, quantity, transition, nextStatuses, localize, VOCABULARIES }
