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
 *   fb("3 loaves left over today, were £4 each, selling for £1.50, collect by 8pm")
 *   fb("We stone-mill the wheat into wholemeal flour, 85% extraction rate")
 *   fb("Joe's Bakery sells sourdough for £4.50 and croissants for £2.80")
 *   fb("Green Acres Farm is Soil Association organic certified until June 2026")
 *   fb("Set up an agent that handles ordering and inventory")
 */

const { create } = require('./block')
const { VOCABULARIES } = require('./vocabulary')

// ── Intent signals ──────────────────────────────────────────
// Each intent maps to a block type. Patterns are tested against the input.
const INTENTS = [
  // Agent setup (must be very early — "set up an agent" is not a product)
  {
    type: 'actor.agent',
    signals: ['set up an agent', 'create an agent', 'register an agent', 'new agent',
              'agent for', 'agent that handles', 'agent to handle'],
    weight: 5
  },
  // Surplus / leftover food
  {
    type: 'substance.surplus',
    signals: ['left over', 'leftover', 'surplus', 'reduced', 'reduced to',
              'selling for', 'collect by', 'pick up by', 'use by today',
              'going spare', 'end of day', 'waste', 'about to expire'],
    weight: 4
  },
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
              'haccp', 'iso', 'organic certified', 'grade', 'soil association'],
    weight: 3
  },
  // Readings / measurements
  {
    type: 'observe.reading',
    signals: ['temperature', 'temp', 'celsius', 'fahrenheit', 'humidity', 'ph',
              'reading', 'measured', 'sensor', 'cooler', 'freezer', 'thermometer',
              'fridge', 'oven', 'cold room', 'hot hold', 'probe'],
    weight: 3
  },
  // Orders / transactions
  {
    type: 'transfer.order',
    signals: ['ordered', 'order', 'purchased', 'bought', 'sold', 'invoice',
              'shipped', 'delivered', 'shipment', 'payment', 'receipt', 'transaction'],
    weight: 2
  },
  // Processes / transforms (before farms — "mill the wheat" is a transform)
  {
    type: 'transform.process',
    signals: ['baked', 'cooked', 'fried', 'grilled', 'roasted', 'fermented',
              'brewed', 'distilled', 'processed', 'mixed', 'blended', 'milled',
              'smoked', 'cured', 'pickled', 'recipe', 'preparation',
              'stone-mill', 'stone mill', 'extraction rate',
              'into', 'transform', 'converted'],
    weight: 2
  },
  // Farms / producers
  {
    type: 'actor.producer',
    signals: ['farm', 'ranch', 'orchard', 'vineyard', 'grows', 'cultivates', 'harvested',
              'harvest', 'planted', 'acres', 'hectares', 'acreage', 'seasonal',
              'producer', 'grower', 'farmer', 'variety'],
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
              'croissant', 'bagel', 'muffin', 'cookie', 'pie', 'tart',
              'sourdough', 'loaf'],
    weight: 1
  }
]

// ── Currency detection ──────────────────────────────────────
const CURRENCY_SYMBOLS = { '\u00a3': 'GBP', '$': 'USD', '\u20ac': 'EUR' }
const CURRENCY_WORDS = {
  pounds: 'GBP', gbp: 'GBP',
  dollars: 'USD', usd: 'USD',
  euros: 'EUR', eur: 'EUR'
}

/**
 * Detect currency from text. Returns 'USD' as default.
 */
function detectCurrency(text) {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(sym)) return code
  }
  const lower = text.toLowerCase()
  for (const [word, code] of Object.entries(CURRENCY_WORDS)) {
    if (lower.includes(word)) return code
  }
  return 'USD'
}

// ── Number + unit extraction ────────────────────────────────
const NUM_PATTERNS = [
  // Price: $4.50, £12, €8.99 (currency auto-detected)
  { pattern: /[$\u00a3\u20ac]\s*([\d,.]+)/g, field: 'price', currencyAuto: true },
  // Weight: 50kg, 200g, 5lb
  { pattern: /([\d,.]+)\s*(kg|g|oz|lb|mg|ton)\b/gi, field: 'weight', unitGroup: 2 },
  // Volume: 500ml, 2l, 1gal
  { pattern: /([\d,.]+)\s*(ml|l|fl_oz|gal|cup|tbsp|tsp)\b/gi, field: 'volume', unitGroup: 2 },
  // Temperature: 4 celsius, 72 fahrenheit, 350F
  { pattern: /([\d,.]+)\s*\u00b0?\s*(celsius|fahrenheit|kelvin|[CFK])\b/gi, field: 'temperature', unitGroup: 2 },
  // Acreage: 200 acres, 50 hectares
  { pattern: /([\d,.]+)\s*(acres?|hectares?)\b/gi, field: 'acreage' },
  // Rating: 5 stars, rated 4.5, 3/5
  { pattern: /([\d.]+)\s*(?:\/5\s*)?(?:stars?|star)\b/gi, field: 'rating' },
  { pattern: /\brated?\s*([\d.]+)/gi, field: 'rating' },
  // Percentage: 85% extraction rate
  { pattern: /([\d.]+)\s*%/g, field: '_percent' },
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

// ── Relationship patterns ───────────────────────────────────
const REL_PATTERNS = [
  { pattern: /\bfrom\s+([A-Z][A-Za-z\s'.-]+)/g, role: 'source' },
  { pattern: /\bat\s+([A-Z][A-Za-z\s'.-]+)/g, role: 'subject' },
  { pattern: /\bby\s+([A-Z][A-Za-z\s'.-]+)/g, role: 'author' },
]

// ── Surplus patterns ────────────────────────────────────────
const SURPLUS_QUANTITY_PATTERN = /(\d+)\s*(loaves?|items?|portions?|servings?|pieces?|bags?|boxes?|trays?|units?|kg|g)\b/i
const SURPLUS_ORIGINAL_PRICE = /(?:were|was|originally?|rrp)\s*[$\u00a3\u20ac]\s*([\d,.]+)/i
const SURPLUS_REDUCED_PRICE = /(?:selling\s+for|reduced\s+to|now)\s*[$\u00a3\u20ac]\s*([\d,.]+)/i
const SURPLUS_COLLECT_BY = /(?:collect|pick\s*up|use)\s+by\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?)/i

// ── Transform patterns ─────────────────────────────────────
const TRANSFORM_INTO_PATTERN = /\b(?:the\s+)?(\w+(?:\s+\w+)?)\s+into\s+(\w+(?:\s+\w+)?)(?:\s*[,.]|$)/i
const TRANSFORM_FROM_TO_PATTERN = /from\s+(\w[\w\s-]*?)\s+to\s+(\w[\w\s-]*?)(?:\s*[,.]|$)/i
const TRANSFORM_PROCESS_PATTERN = /\b(stone[- ]mill|mill|bake|cook|fry|grill|roast|ferment|brew|distill|smoke|cure|pickle|blend|mix|process)\w*\b/i
const EXTRACTION_RATE_PATTERN = /([\d.]+)\s*%\s*extraction\s+rate/i

// ── Certification expiry ────────────────────────────────────
const CERT_EXPIRY_PATTERN = /(?:until|expires?|valid\s+until|through)\s+([A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i
const CERT_NAME_PATTERN = /\bis\s+(.+?)\s+certified/i
const CERT_NAME_PATTERN_FALLBACK = /(.+?)\s+certified/i

// ── Sells X and Y ───────────────────────────────────────────
const SELLS_PATTERN = /\bsells?\s+(.+)/i
const PRODUCT_PRICE_PATTERN = /(.+?)\s+(?:for|at)\s+[$\u00a3\u20ac]\s*([\d,.]+)/i

// ── Agent language ──────────────────────────────────────────
const AGENT_CAPABILITIES_PATTERN = /\b(?:handles?|manages?|does|for)\s+(.+)/i

// ── Compound entity: "X from Y" ─────────────────────────────
const FROM_ENTITY_PATTERN = /\bfrom\s+([A-Z][A-Za-z\s'.-]+?)(?:\s+in\s+|\s*[,.]|$)/i
const IN_LOCATION_PATTERN = /\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)/
const VARIETY_PATTERN = /\b([A-Z][A-Za-z\s]+?)\s+variety\b/i
const HARVESTED_PATTERN = /\bharvested?\s+([A-Za-z]+\s+\d{4}|\d{4})/i

/**
 * fb() — describe food in plain English, get FoodBlocks back.
 *
 * @param {string} text - Any food-related natural language
 * @returns {object} { blocks: block[], primary: block, type: string, state: object, refs: object, text: string, confidence: number }
 */
function fb(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('fb() needs text')
  }

  const lower = text.toLowerCase()
  const currency = detectCurrency(text)

  // 1. Score intents
  const scores = INTENTS.map(intent => {
    let score = 0
    let matchCount = 0
    for (const signal of intent.signals) {
      if (lower.includes(signal)) {
        score += intent.weight
        matchCount++
      }
    }
    return { type: intent.type, score, matchCount }
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score)

  const topScore = scores.length > 0 ? scores[0] : null
  let primaryType = topScore ? topScore.type : 'substance.product'

  // Calculate confidence
  let confidence
  if (!topScore) {
    confidence = 0.4
  } else if (topScore.matchCount >= 3) {
    confidence = 1.0
  } else if (topScore.matchCount >= 2) {
    confidence = 0.8
  } else {
    confidence = 0.6
  }

  // ── Special-case: "sells X and Y" → venue + products ──────
  const sellsMatch = text.match(SELLS_PATTERN)
  const isVenueSelling = sellsMatch && (primaryType === 'actor.venue' || /bakery|cafe|restaurant|shop|store|market|deli|diner|bar|bistro|pizzeria/i.test(text))

  if (isVenueSelling) {
    return handleVenueSells(text, lower, sellsMatch[1], currency, confidence)
  }

  // ── Special-case: surplus language ─────────────────────────
  if (primaryType === 'substance.surplus') {
    return handleSurplus(text, lower, currency, confidence)
  }

  // ── Special-case: transform language ───────────────────────
  if (primaryType === 'transform.process') {
    return handleTransform(text, lower, currency, confidence)
  }

  // ── Special-case: certification with subject ───────────────
  if (primaryType === 'observe.certification') {
    return handleCertification(text, lower, currency, confidence)
  }

  // ── Special-case: agent language ───────────────────────────
  if (primaryType === 'actor.agent') {
    return handleAgent(text, lower, confidence)
  }

  // ── Special-case: order with "from X" → order + entity ─────
  if (primaryType === 'transfer.order') {
    return handleOrder(text, lower, currency, confidence)
  }

  // ── Special-case: compound ingredient with "from X" ────────
  // If scored as producer but text has "from [Farm]" pattern, the primary
  // subject is likely the ingredient, not the farm
  if (primaryType === 'actor.producer' && /\bfrom\s+[A-Z]/i.test(text)) {
    // Check if any ingredient signal also matched
    const hasIngredient = scores.some(s => s.type === 'substance.ingredient' && s.score > 0)
    if (hasIngredient) {
      primaryType = 'substance.ingredient'
    }
  }
  if (primaryType === 'substance.ingredient' || primaryType === 'actor.producer') {
    return handleCompoundEntity(text, lower, primaryType, currency, confidence)
  }

  // ── General path ───────────────────────────────────────────
  const name = extractName(text, primaryType)
  const quantities = extractQuantities(text, currency)
  const flags = extractFlags(lower)
  const state = buildState(name, quantities, flags)

  // Type-specific enrichment
  enrichState(state, primaryType, text, lower, quantities)

  // Extract relationship entities
  const { entityBlocks, refs } = extractRelationships(text, primaryType)

  // Create primary block with refs
  const primary = create(primaryType, state, refs)
  const blocks = [primary, ...entityBlocks]

  return {
    blocks,
    primary,
    type: primaryType,
    state,
    refs,
    text,
    confidence
  }
}

// ── Handler: Venue sells products ────────────────────────────
function handleVenueSells(text, lower, sellsText, currency, confidence) {
  const blocks = []

  // Extract venue name
  const venueName = extractName(text, 'actor.venue')
  const venueState = { name: venueName }
  const venueFlags = extractFlags(lower)
  Object.assign(venueState, venueFlags)

  const venueBlock = create('actor.venue', venueState)
  blocks.push(venueBlock)

  // Parse "sourdough for £4.50 and croissants for £2.80"
  // Split on " and " or ", "
  const productSegments = sellsText.split(/\s+and\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean)

  for (const segment of productSegments) {
    const priceMatch = segment.match(PRODUCT_PRICE_PATTERN)
    const productState = {}

    if (priceMatch) {
      productState.name = cleanProductName(priceMatch[1].trim())
      const priceVal = parseFloat(priceMatch[2].replace(/,/g, ''))
      if (!isNaN(priceVal)) {
        // Detect per-segment currency
        const segCurrency = detectSegmentCurrency(segment, currency)
        productState.price = { value: priceVal, unit: segCurrency }
      }
    } else {
      productState.name = cleanProductName(segment)
    }

    // Also pick up any standalone price in the segment
    if (!productState.price) {
      const standalonePrice = segment.match(/[$\u00a3\u20ac]\s*([\d,.]+)/)
      if (standalonePrice) {
        const val = parseFloat(standalonePrice[1].replace(/,/g, ''))
        if (!isNaN(val)) {
          const segCurrency = detectSegmentCurrency(segment, currency)
          productState.price = { value: val, unit: segCurrency }
        }
      }
    }

    if (productState.name) {
      const productBlock = create('substance.product', productState, { seller: venueBlock.hash })
      blocks.push(productBlock)
    }
  }

  return {
    blocks,
    primary: blocks[0],
    type: 'actor.venue',
    state: venueState,
    refs: {},
    text,
    confidence: Math.max(confidence, 0.8)
  }
}

// ── Handler: Surplus food ────────────────────────────────────
function handleSurplus(text, lower, currency, confidence) {
  const blocks = []
  const state = {}

  // Extract product name
  const name = extractName(text, 'substance.surplus')
  if (name) state.name = name

  // Extract quantity: "3 loaves"
  const qtyMatch = text.match(SURPLUS_QUANTITY_PATTERN)
  if (qtyMatch) {
    state.quantity = { value: parseInt(qtyMatch[1], 10), unit: qtyMatch[2].toLowerCase() }
  }

  // Original price: "were £4 each"
  const origMatch = text.match(SURPLUS_ORIGINAL_PRICE)
  if (origMatch) {
    state.original_price = { value: parseFloat(origMatch[1].replace(/,/g, '')), unit: currency }
  }

  // Surplus price: "selling for £1.50"
  const surplusMatch = text.match(SURPLUS_REDUCED_PRICE)
  if (surplusMatch) {
    state.surplus_price = { value: parseFloat(surplusMatch[1].replace(/,/g, '')), unit: currency }
  }

  // Collect by: "collect by 8pm"
  const collectMatch = text.match(SURPLUS_COLLECT_BY)
  if (collectMatch) {
    state.expiry_time = collectMatch[1].trim()
  }

  // Boolean flags
  const flags = extractFlags(lower)
  Object.assign(state, flags)

  const primary = create('substance.surplus', state)
  blocks.push(primary)

  return {
    blocks,
    primary,
    type: 'substance.surplus',
    state,
    refs: {},
    text,
    confidence
  }
}

// ── Handler: Transform process ───────────────────────────────
function handleTransform(text, lower, currency, confidence) {
  const blocks = []
  const state = {}

  // Extract process name
  const processMatch = text.match(TRANSFORM_PROCESS_PATTERN)
  if (processMatch) {
    state.process = processMatch[1].trim()
  }

  // "X into Y" pattern
  const intoMatch = text.match(TRANSFORM_INTO_PATTERN)
  if (intoMatch) {
    state.inputs = [cleanProductName(intoMatch[1].trim())]
    state.outputs = [cleanProductName(intoMatch[2].trim())]
  }

  // "from X to Y" pattern
  if (!intoMatch) {
    const fromToMatch = text.match(TRANSFORM_FROM_TO_PATTERN)
    if (fromToMatch) {
      state.inputs = [cleanProductName(fromToMatch[1].trim())]
      state.outputs = [cleanProductName(fromToMatch[2].trim())]
    }
  }

  // Extraction rate: "85% extraction rate"
  const extractionMatch = text.match(EXTRACTION_RATE_PATTERN)
  if (extractionMatch) {
    state.extraction_rate = parseFloat(extractionMatch[1])
  }

  // Name extraction
  const name = extractName(text, 'transform.process')
  if (name && !state.process) state.name = name
  if (state.process) state.name = state.process

  const flags = extractFlags(lower)
  Object.assign(state, flags)

  const primary = create('transform.process', state)
  blocks.push(primary)

  return {
    blocks,
    primary,
    type: 'transform.process',
    state,
    refs: {},
    text,
    confidence
  }
}

// ── Handler: Certification ───────────────────────────────────
function handleCertification(text, lower, currency, confidence) {
  const blocks = []
  const state = {}
  const refs = {}

  // Extract certification name: "is Soil Association organic certified"
  const certNameMatch = text.match(CERT_NAME_PATTERN)
  if (certNameMatch) {
    state.name = certNameMatch[1].trim()
  } else {
    const fallbackMatch = text.match(CERT_NAME_PATTERN_FALLBACK)
    if (fallbackMatch) {
      state.name = fallbackMatch[1].trim()
    } else {
      state.name = extractName(text, 'observe.certification')
    }
  }

  // Extract expiry: "until June 2026"
  const expiryMatch = text.match(CERT_EXPIRY_PATTERN)
  if (expiryMatch) {
    state.valid_until = expiryMatch[1].trim()
  }

  // Is there a subject entity? "Green Acres Farm is..."
  const subjectMatch = text.match(/^([A-Z][A-Za-z\s'.-]+?)\s+(?:is|has|was|are)\s+/i)
  if (subjectMatch) {
    const subjectName = subjectMatch[1].trim()
    const subjectType = inferEntityType(subjectName)
    const subjectState = { name: subjectName }

    // Extract region for farms
    const regionMatch = text.match(IN_LOCATION_PATTERN)
    if (regionMatch && subjectType === 'actor.producer') {
      subjectState.region = regionMatch[1].trim()
    }

    const subjectBlock = create(subjectType, subjectState)
    blocks.push(subjectBlock)
    refs.subject = subjectBlock.hash
  }

  const flags = extractFlags(lower)
  Object.assign(state, flags)

  const primary = create('observe.certification', state, refs)
  // primary goes first
  blocks.unshift(primary)

  return {
    blocks,
    primary,
    type: 'observe.certification',
    state,
    refs,
    text,
    confidence
  }
}

// ── Handler: Agent ───────────────────────────────────────────
function handleAgent(text, lower, confidence) {
  const state = {}

  // Extract name
  const nameMatch = text.match(/agent\s+(?:called|named)\s+["']?([^"',]+)["']?/i)
  if (nameMatch) {
    state.name = nameMatch[1].trim()
  } else {
    state.name = 'agent'
  }

  // Extract capabilities: "handles ordering and inventory"
  const capMatch = text.match(AGENT_CAPABILITIES_PATTERN)
  if (capMatch) {
    const capText = capMatch[1]
    const capabilities = capText.split(/\s+and\s+|\s*,\s*/).map(c => c.trim().toLowerCase()).filter(c => c.length > 1)
    if (capabilities.length > 0) {
      state.capabilities = capabilities
    }
  }

  const primary = create('actor.agent', state)

  return {
    blocks: [primary],
    primary,
    type: 'actor.agent',
    state,
    refs: {},
    text,
    confidence
  }
}

// ── Handler: Order with "from X" ─────────────────────────────
function handleOrder(text, lower, currency, confidence) {
  const blocks = []
  const refs = {}

  const name = extractName(text, 'transfer.order')
  const quantities = extractQuantities(text, currency)
  const flags = extractFlags(lower)
  const state = buildState(name, quantities, flags)

  // Extract the "from X" entity and create a block for it
  const fromMatch = text.match(FROM_ENTITY_PATTERN)
  if (fromMatch) {
    const entityName = fromMatch[1].trim().replace(/[,.\s]+$/, '')
    if (entityName.length >= 2) {
      const entityType = inferEntityType(entityName)
      const entityBlock = create(entityType, { name: entityName })
      blocks.push(entityBlock)
      refs.seller = entityBlock.hash
    }
  }

  const primary = create('transfer.order', state, refs)
  blocks.unshift(primary)

  return {
    blocks,
    primary,
    type: 'transfer.order',
    state,
    refs,
    text,
    confidence
  }
}

// ── Handler: Compound entity (ingredient / producer) ─────────
function handleCompoundEntity(text, lower, detectedType, currency, confidence) {
  const blocks = []
  const refs = {}

  const quantities = extractQuantities(text, currency)
  const flags = extractFlags(lower)

  // Determine the primary type and entities
  const fromMatch = text.match(FROM_ENTITY_PATTERN)
  const locationMatch = text.match(IN_LOCATION_PATTERN)
  const varietyMatch = text.match(VARIETY_PATTERN)
  const harvestedMatch = text.match(HARVESTED_PATTERN)

  // If "from Farm" → ingredient is primary, farm is secondary
  if (fromMatch && detectedType === 'substance.ingredient') {
    // Create farm block
    const farmName = fromMatch[1].trim().replace(/[,.\s]+$/, '')
    const farmState = { name: farmName }
    if (locationMatch) farmState.region = locationMatch[1].trim()
    const farmBlock = create(inferEntityType(farmName), farmState)
    blocks.push(farmBlock)
    refs.source = farmBlock.hash

    // Build ingredient state — name is everything before "from"
    const beforeFrom = text.split(/\s+from\s+/i)[0].trim()
    const name = beforeFrom.replace(/[,.\s]+$/, '') || extractName(text, 'substance.ingredient')
    const state = buildState(name, quantities, flags)
    if (varietyMatch) state.variety = varietyMatch[1].trim()
    if (harvestedMatch) state.harvested = harvestedMatch[1].trim()

    const primary = create('substance.ingredient', state, refs)
    blocks.unshift(primary)

    return {
      blocks,
      primary,
      type: 'substance.ingredient',
      state,
      refs,
      text,
      confidence
    }
  }

  // If producer is primary, build normally but also extract crop etc.
  if (detectedType === 'actor.producer') {
    const name = extractName(text, 'actor.producer')
    const state = buildState(name, quantities, flags)
    enrichState(state, 'actor.producer', text, lower, quantities)
    if (varietyMatch) state.variety = varietyMatch[1].trim()
    if (harvestedMatch) state.harvested = harvestedMatch[1].trim()

    const primary = create('actor.producer', state, refs)
    blocks.unshift(primary)

    return {
      blocks,
      primary,
      type: 'actor.producer',
      state,
      refs,
      text,
      confidence
    }
  }

  // Fallback to general path
  const name = extractName(text, detectedType)
  const state = buildState(name, quantities, flags)
  enrichState(state, detectedType, text, lower, quantities)

  const primary = create(detectedType, state, refs)
  blocks.unshift(primary)

  return {
    blocks,
    primary,
    type: detectedType,
    state,
    refs,
    text,
    confidence
  }
}

// ── Shared helpers ───────────────────────────────────────────

/**
 * Extract quantities from text.
 */
function extractQuantities(text, currency) {
  const quantities = {}
  for (const np of NUM_PATTERNS) {
    const regex = new RegExp(np.pattern.source, np.pattern.flags)
    let match
    while ((match = regex.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (isNaN(value)) continue

      if (np.currencyAuto) {
        quantities[np.field] = { value, unit: currency }
      } else if (np.unitGroup && match[np.unitGroup]) {
        const rawUnit = match[np.unitGroup].toLowerCase()
        quantities[np.field] = { value, unit: UNIT_NORMALIZE[rawUnit] || rawUnit }
      } else {
        quantities[np.field] = value
      }
    }
  }
  return quantities
}

/**
 * Extract boolean flags from all vocabularies.
 */
function extractFlags(lower) {
  const flags = {}
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
  return flags
}

/**
 * Build state from name, quantities, and flags.
 */
function buildState(name, quantities, flags) {
  const state = {}
  if (name) state.name = name
  for (const [field, val] of Object.entries(quantities)) {
    if (field.startsWith('_')) continue // skip internal fields like _percent
    state[field] = val
  }
  for (const [field, val] of Object.entries(flags)) {
    state[field] = val
  }
  return state
}

/**
 * Enrich state with type-specific fields.
 */
function enrichState(state, type, text, lower, quantities) {
  if (type === 'observe.review') {
    if (!state.rating && quantities.rating) state.rating = quantities.rating
    state.text = text
  }
  if (type === 'observe.reading') {
    if (quantities.temperature) state.temperature = quantities.temperature
    if (quantities.humidity) state.humidity = quantities.humidity
    const locationMatch = text.match(/\b(?:in|at)\s+(?:the\s+)?(.+?)(?:\s*[,.]|$)/i)
    if (locationMatch) {
      const loc = locationMatch[1].trim()
      if (loc.length > 1 && loc.length < 50) state.location = loc
    }
  }
  if (type === 'actor.producer') {
    const growsMatch = text.match(/\b(?:grows?|cultivates?|produces?)\s+(.+?)(?:\s*[,.]|\s+in\s+|\s+on\s+|$)/i)
    if (growsMatch) state.crop = growsMatch[1].trim()
    if (quantities.acreage) state.acreage = typeof quantities.acreage === 'object' ? quantities.acreage.value : quantities.acreage
    const regionMatch = text.match(/\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)/)
    if (regionMatch) state.region = regionMatch[1].trim()
  }
}

/**
 * Extract relationships and create entity blocks.
 * Returns { entityBlocks: block[], refs: object }
 */
function extractRelationships(text, primaryType) {
  const entityBlocks = []
  const refs = {}

  for (const rp of REL_PATTERNS) {
    const regex = new RegExp(rp.pattern.source, rp.pattern.flags)
    let match
    while ((match = regex.exec(text)) !== null) {
      const entityName = match[1].trim().replace(/[,.\s]+$/, '')
      if (entityName.length < 2) continue

      const entityType = inferEntityType(entityName)
      const entityBlock = create(entityType, { name: entityName })
      entityBlocks.push(entityBlock)

      if (refs[rp.role]) {
        refs[rp.role] = Array.isArray(refs[rp.role])
          ? [...refs[rp.role], entityBlock.hash]
          : [refs[rp.role], entityBlock.hash]
      } else {
        refs[rp.role] = entityBlock.hash
      }
    }
  }

  return { entityBlocks, refs }
}

/**
 * Extract the most likely "name" from natural language text.
 */
function extractName(text, type) {
  // For reviews, extract the subject name ("Amazing pizza at Luigi's" -> "Luigi's")
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
    if (candidate.length > 2 && text.indexOf(candidate) > 0) return candidate
    if (candidate.length > 2) return candidate
  }

  // Fall back to first segment before comma, dollar sign, or common delimiters
  const firstSegment = text.split(/[,$\u00a3\u20ac\u2022\-\u2014|]/)[0].trim()
  if (firstSegment && firstSegment.length < 80) {
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

/**
 * Clean a product name - strip trailing prepositions, articles, etc.
 */
function cleanProductName(name) {
  return name
    .replace(/\s+(for|at|on|in|from|to|by|with)\s*$/i, '')
    .replace(/\s+$/, '')
    .trim()
}

/**
 * Detect currency from a text segment (checks for symbol in the segment itself).
 */
function detectSegmentCurrency(segment, fallback) {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (segment.includes(sym)) return code
  }
  return fallback
}

module.exports = { fb }
