/**
 * fb() — The single natural language entry point to FoodBlock.
 *
 * Takes any food-related text. Returns blocks.
 *
 *   fb("Sourdough bread, $4.50, organic, contains gluten")
 *   fb("Joe's Bakery on Main Street sells bread and croissants")
 *   fb("Amazing pizza at Luigi's, 5 stars")
 *   fb("Ordered 50kg flour from Stone Mill")
 *   fb("Walk-in cooler temperature 4 celsius")
 *   fb("Green Acres Farm, 200 acres, grows organic wheat in Oregon")
 */

const { create } = require('./block')
const { VOCABULARIES } = require('./vocabulary')

// ── Intent signals ──────────────────────────────────────────
// Each intent maps to a block type. Patterns are tested against the input.
const INTENTS = [
  // Reviews / ratings (must come before product — "5 stars at X" is a review, not a product)
  {
    type: 'observe.review',
    signals: ['stars', 'star', 'rated', 'rating', 'review', 'amazing', 'terrible', 'loved', 'hated',
              'best', 'worst', 'delicious', 'disgusting', 'fantastic', 'awful', 'great', 'horrible',
              'recommend', 'overrated', 'underrated', 'disappointing', 'outstanding', 'mediocre',
              'tried', 'visited', 'went to', 'ate at', 'dined at'],
    weight: 2
  },
  // Certifications / inspections
  {
    type: 'observe.certification',
    signals: ['certified', 'certification', 'inspection', 'inspected', 'passed', 'failed',
              'audit', 'audited', 'compliance', 'approved', 'accredited', 'usda', 'fda',
              'haccp', 'iso', 'organic certified', 'grade'],
    weight: 3
  },
  // Readings / measurements
  {
    type: 'observe.reading',
    signals: ['temperature', 'temp', 'celsius', 'fahrenheit', 'humidity', 'ph',
              'reading', 'measured', 'sensor', 'cooler', 'freezer', 'thermometer'],
    weight: 3
  },
  // Orders / transactions
  {
    type: 'transfer.order',
    signals: ['ordered', 'order', 'purchased', 'bought', 'sold', 'invoice',
              'shipped', 'delivered', 'shipment', 'payment', 'receipt', 'transaction'],
    weight: 2
  },
  // Farms / producers
  {
    type: 'actor.producer',
    signals: ['farm', 'ranch', 'orchard', 'vineyard', 'grows', 'cultivates', 'harvested',
              'harvest', 'planted', 'acres', 'hectares', 'acreage', 'seasonal',
              'producer', 'grower', 'farmer'],
    weight: 2
  },
  // Venues / businesses
  {
    type: 'actor.venue',
    signals: ['restaurant', 'bakery', 'cafe', 'shop', 'store', 'market', 'bar',
              'deli', 'diner', 'bistro', 'pizzeria', 'taqueria', 'patisserie',
              'on', 'street', 'avenue', 'located', 'downtown', 'opens', 'closes'],
    weight: 1
  },
  // Processes / transforms
  {
    type: 'transform.process',
    signals: ['baked', 'cooked', 'fried', 'grilled', 'roasted', 'fermented',
              'brewed', 'distilled', 'processed', 'mixed', 'blended', 'milled',
              'smoked', 'cured', 'pickled', 'recipe', 'preparation'],
    weight: 2
  },
  // Ingredients
  {
    type: 'substance.ingredient',
    signals: ['ingredient', 'flour', 'sugar', 'salt', 'butter', 'milk', 'eggs',
              'yeast', 'water', 'oil', 'spice', 'herb', 'raw material', 'grain',
              'wheat', 'rice', 'corn', 'barley', 'oats'],
    weight: 1
  },
  // Products (broadest — catches what nothing else does)
  {
    type: 'substance.product',
    signals: ['bread', 'cake', 'pizza', 'pasta', 'cheese', 'wine', 'beer',
              'chocolate', 'coffee', 'tea', 'juice', 'sauce', 'jam',
              'product', 'item', 'sells', 'menu', 'dish', '$',
              'croissant', 'bagel', 'muffin', 'cookie', 'pie', 'tart'],
    weight: 1
  }
]

// ── Relationship patterns ───────────────────────────────────
const REL_PATTERNS = [
  { pattern: /\bfrom\s+([A-Z][A-Za-z\s']+)/g, role: 'source' },
  { pattern: /\bat\s+([A-Z][A-Za-z\s']+)/g, role: 'subject' },
  { pattern: /\bby\s+([A-Z][A-Za-z\s']+)/g, role: 'author' },
  { pattern: /\bfor\s+([A-Z][A-Za-z\s']+)/g, role: 'recipient' },
  { pattern: /\bto\s+([A-Z][A-Za-z\s']+)/g, role: 'recipient' },
  { pattern: /\bsells\s+(.+?)(?:\s+and\s+|\s*,\s*|$)/gi, role: '_products' },
]

// ── Number + unit extraction ────────────────────────────────
const NUM_PATTERNS = [
  // Price: $4.50, £12, €8.99
  { pattern: /[$£€]\s*([\d,.]+)/g, field: 'price', unit: 'USD' },
  // Weight: 50kg, 200g, 5lb
  { pattern: /([\d,.]+)\s*(kg|g|oz|lb|mg|ton)\b/gi, field: 'weight', unitGroup: 2 },
  // Volume: 500ml, 2l, 1gal
  { pattern: /([\d,.]+)\s*(ml|l|fl_oz|gal|cup|tbsp|tsp)\b/gi, field: 'volume', unitGroup: 2 },
  // Temperature: 4 celsius, 72 fahrenheit, 350°F
  { pattern: /([\d,.]+)\s*°?\s*(celsius|fahrenheit|kelvin|[CFK])\b/gi, field: 'temperature', unitGroup: 2 },
  // Acreage: 200 acres, 50 hectares
  { pattern: /([\d,.]+)\s*(acres?|hectares?)\b/gi, field: 'acreage' },
  // Rating: 5 stars, rated 4.5, 3/5
  { pattern: /([\d.]+)\s*(?:\/5\s*)?(?:stars?|star)\b/gi, field: 'rating' },
  { pattern: /\brated?\s*([\d.]+)/gi, field: 'rating' },
  // Generic number near "score": score 95
  { pattern: /\bscore\s*([\d.]+)/gi, field: 'score' },
  // Lot size: 500 units, batch of 1000
  { pattern: /([\d,]+)\s*units?\b/gi, field: 'lot_size' },
]

// ── Unit normalization ──────────────────────────────────────
const UNIT_NORMALIZE = {
  c: 'celsius', f: 'fahrenheit', k: 'kelvin',
  acre: 'acres', hectare: 'hectares'
}

/**
 * fb() — describe food in plain English, get FoodBlocks back.
 *
 * @param {string} text - Any food-related natural language
 * @returns {object} { blocks: block[], type: string, state: object, refs: object, text: string }
 */
function fb(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('fb() needs text')
  }

  const lower = text.toLowerCase()
  const blocks = []

  // 1. Score intents
  const scores = INTENTS.map(intent => {
    let score = 0
    for (const signal of intent.signals) {
      if (lower.includes(signal)) score += intent.weight
    }
    return { type: intent.type, score }
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score)

  const primaryType = scores.length > 0 ? scores[0].type : 'substance.product'

  // 2. Extract name — first capitalized phrase or first meaningful segment
  let name = extractName(text, primaryType)

  // 3. Extract numbers and quantities
  const quantities = {}
  for (const np of NUM_PATTERNS) {
    const regex = new RegExp(np.pattern.source, np.pattern.flags)
    let match
    while ((match = regex.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (isNaN(value)) continue

      if (np.unit) {
        quantities[np.field] = { value, unit: np.unit }
      } else if (np.unitGroup && match[np.unitGroup]) {
        const rawUnit = match[np.unitGroup].toLowerCase()
        quantities[np.field] = { value, unit: UNIT_NORMALIZE[rawUnit] || rawUnit }
      } else {
        quantities[np.field] = value
      }
    }
  }

  // 4. Extract boolean flags from all vocabularies
  const flags = {}
  const allAliases = []
  for (const vocab of Object.values(VOCABULARIES)) {
    for (const [fieldName, fieldDef] of Object.entries(vocab.fields)) {
      if (fieldDef.type === 'boolean') {
        for (const alias of (fieldDef.aliases || [])) {
          if (lower.includes(alias.toLowerCase())) {
            flags[fieldName] = true
          }
        }
      }
      if (fieldDef.type === 'compound') {
        for (const alias of (fieldDef.aliases || [])) {
          if (lower.includes(alias.toLowerCase())) {
            if (!flags[fieldName]) flags[fieldName] = {}
            flags[fieldName][alias.toLowerCase()] = true
          }
        }
      }
    }
  }

  // 5. Extract relationships
  const refs = {}
  const relatedEntities = []
  for (const rp of REL_PATTERNS) {
    const regex = new RegExp(rp.pattern.source, rp.pattern.flags)
    let match
    while ((match = regex.exec(text)) !== null) {
      const entityName = match[1].trim().replace(/[,.\s]+$/, '')
      if (entityName.length < 2) continue

      if (rp.role === '_products') {
        // "sells bread and croissants" → create product blocks
        const products = entityName.split(/\s+and\s+|\s*,\s*/).map(p => p.trim()).filter(Boolean)
        for (const p of products) {
          relatedEntities.push({ name: p, type: 'substance.product', role: 'seller' })
        }
      } else {
        relatedEntities.push({ name: entityName, role: rp.role })
      }
    }
  }

  // 6. Build state
  const state = {}
  if (name) state.name = name

  // Add quantities
  for (const [field, val] of Object.entries(quantities)) {
    state[field] = val
  }

  // Add flags
  for (const [field, val] of Object.entries(flags)) {
    state[field] = val
  }

  // Type-specific state enrichment
  if (primaryType === 'observe.review') {
    if (!state.rating && quantities.rating) state.rating = quantities.rating
    // Extract the review text (the whole thing is essentially the review)
    state.text = text
  }
  if (primaryType === 'observe.reading') {
    if (quantities.temperature) state.temperature = quantities.temperature
    if (quantities.humidity) state.humidity = quantities.humidity
    // Try to extract location context
    const locationMatch = text.match(/\b(?:in|at)\s+(?:the\s+)?(.+?)(?:\s*[,.]|$)/i)
    if (locationMatch) {
      const loc = locationMatch[1].trim()
      if (loc.length > 1 && loc.length < 50) state.location = loc
    }
  }
  if (primaryType === 'actor.producer') {
    // Extract crop from "grows X" patterns
    const growsMatch = text.match(/\b(?:grows?|cultivates?|produces?)\s+(.+?)(?:\s*[,.]|\s+in\s+|\s+on\s+|$)/i)
    if (growsMatch) state.crop = growsMatch[1].trim()
    if (quantities.acreage) state.acreage = typeof quantities.acreage === 'object' ? quantities.acreage.value : quantities.acreage
    // Extract region from "in X" at end
    const regionMatch = text.match(/\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)/)
    if (regionMatch) state.region = regionMatch[1].trim()
  }

  // 7. Create primary block
  const primary = create(primaryType, state, refs)
  blocks.push(primary)

  // 8. Create related entity blocks and wire refs
  for (const entity of relatedEntities) {
    const entityType = entity.type || inferEntityType(entity.name)
    const entityBlock = create(entityType, { name: entity.name })
    blocks.push(entityBlock)

    if (entity.role === 'seller') {
      // Re-create primary with seller ref
      // (we add refs but keep same state)
    }
  }

  // 9. Return
  return {
    blocks,
    primary: blocks[0],
    type: primaryType,
    state,
    text
  }
}

/**
 * Extract the most likely "name" from natural language text.
 */
function extractName(text, type) {
  // For reviews, extract the subject name ("Amazing pizza at Luigi's" → "Luigi's")
  if (type === 'observe.review') {
    const atMatch = text.match(/\bat\s+([A-Z][A-Za-z\s']+)/i)
    if (atMatch) return atMatch[1].trim().replace(/[,.\s]+$/, '')
  }

  // For readings, don't extract a name
  if (type === 'observe.reading') return null

  // Try to find a proper noun phrase (capitalized words)
  const properMatch = text.match(/([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*(?:'s)?)/)
  if (properMatch) {
    const candidate = properMatch[1].trim()
    // Skip if it's just the first word of the sentence
    if (candidate.length > 2 && text.indexOf(candidate) > 0) return candidate
    if (candidate.length > 2) return candidate
  }

  // Fall back to first segment before comma, dollar sign, or common delimiters
  const firstSegment = text.split(/[,$•\-—|]/)[0].trim()
  if (firstSegment && firstSegment.length < 80) {
    // Strip leading articles
    return firstSegment.replace(/^(a|an|the|my|our|i'm|we're|i am|we are)\s+/i, '').trim()
  }

  return text.slice(0, 50).trim()
}

/**
 * Infer a block type from an entity name.
 */
function inferEntityType(name) {
  const lower = name.toLowerCase()
  if (/farm|ranch|orchard|vineyard|grove/i.test(lower)) return 'actor.producer'
  if (/bakery|restaurant|cafe|shop|store|market|deli|diner|bar|bistro/i.test(lower)) return 'actor.venue'
  if (/mill|factory|plant|brewery|winery|dairy/i.test(lower)) return 'actor.producer'
  return 'actor.venue'
}

module.exports = { fb }
