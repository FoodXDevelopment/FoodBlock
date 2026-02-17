const { create, update, createTemplate, createVocabulary, attest } = require('../sdk/javascript/src/index')

/**
 * Generate sample FoodBlock data: a complete bakery supply chain.
 * Returns an array of blocks in creation order.
 */
function generateSeed() {
  const blocks = []

  // === ACTORS ===
  const farm = create('actor.producer', { name: 'Green Acres Farm', sector: 'primary_production' })
  blocks.push(farm)

  const mill = create('actor.maker', { name: 'Stone Mill Co', sector: 'processing' })
  blocks.push(mill)

  const bakery = create('actor.venue', { name: 'Joes Bakery', sector: 'hospitality' })
  blocks.push(bakery)

  const distributor = create('actor.distributor', { name: 'FreshFleet Logistics', sector: 'distribution' })
  blocks.push(distributor)

  const retailer = create('actor.venue', { name: 'Corner Shop', sector: 'retail' })
  blocks.push(retailer)

  const foodie = create('actor.foodie', { name: 'Sarah', diet: 'vegetarian' })
  blocks.push(foodie)

  const inspector = create('actor.authority', { name: 'Food Standards Agency', jurisdiction: 'UK' })
  blocks.push(inspector)

  const sustainer = create('actor.sustainer', { name: 'Too Good To Go', sector: 'waste_sustainability' })
  blocks.push(sustainer)

  // === PLACES ===
  const field = create('place.farm', { name: 'North Field', lat: 51.45, lng: -1.98 }, { owner: farm.hash })
  blocks.push(field)

  const factory = create('place.facility', { name: 'Mill Building A' }, { owner: mill.hash })
  blocks.push(factory)

  const shop = create('place.venue', { name: 'Joes on High Street', lat: 51.52, lng: -0.08 }, { owner: bakery.hash })
  blocks.push(shop)

  const warehouse = create('place.warehouse', { name: 'FreshFleet Hub London' }, { owner: distributor.hash })
  blocks.push(warehouse)

  // === SUBSTANCES ===
  const wheat = create('substance.ingredient', { name: 'Organic Wheat', variety: 'Red Fife' }, { source: field.hash, producer: farm.hash })
  blocks.push(wheat)

  const flour = create('substance.product', {
    name: 'Stoneground Wholemeal Flour',
    weight: { value: 1.5, unit: 'kg' },
    price: 3.2
  }, { maker: mill.hash, source: wheat.hash })
  blocks.push(flour)

  const yeast = create('substance.ingredient', { name: 'Wild Yeast Starter', age_days: 120 })
  blocks.push(yeast)

  const water = create('substance.ingredient', { name: 'Filtered Water' })
  blocks.push(water)

  const salt = create('substance.ingredient', { name: 'Sea Salt', origin: 'Maldon' })
  blocks.push(salt)

  const sourdough = create('substance.product', {
    name: 'Artisan Sourdough',
    price: 4.5,
    weight: { value: 800, unit: 'g' },
    allergens: { gluten: true, dairy: false }
  }, { seller: bakery.hash, inputs: [flour.hash, yeast.hash, water.hash, salt.hash] })
  blocks.push(sourdough)

  const croissant = create('substance.product', {
    name: 'Butter Croissant',
    price: 2.8,
    allergens: { gluten: true, dairy: true }
  }, { seller: bakery.hash })
  blocks.push(croissant)

  const surplus = create('substance.surplus', {
    name: 'End of Day Pastries',
    original_price: 8.5,
    surplus_price: 3.0,
    quantity: 4,
    available_until: '2026-02-15T18:00:00Z'
  }, { seller: bakery.hash, collector: sustainer.hash })
  blocks.push(surplus)

  // === TRANSFORMS ===
  const harvest = create('transform.harvest', {
    date: '2026-09-15',
    yield_kg: 2400,
    method: 'combine'
  }, { input: wheat.hash, place: field.hash, actor: farm.hash })
  blocks.push(harvest)

  const milling = create('transform.process', {
    name: 'Stone Milling',
    date: '2026-10-01',
    method: 'traditional stone ground'
  }, { inputs: [wheat.hash], output: flour.hash, facility: factory.hash, actor: mill.hash })
  blocks.push(milling)

  const baking = create('transform.process', {
    name: 'Sourdough Baking',
    date: '2026-02-14',
    fermentation_hours: 18,
    bake_temp: 230
  }, { inputs: [flour.hash, yeast.hash, water.hash, salt.hash], output: sourdough.hash, place: shop.hash, actor: bakery.hash })
  blocks.push(baking)

  // === TRANSFERS ===
  const flourOrder = create('transfer.order', {
    quantity: 20,
    unit: 'kg',
    total: 42.6,
    date: '2026-02-10'
  }, { buyer: bakery.hash, seller: mill.hash, product: flour.hash })
  blocks.push(flourOrder)

  const shipment = create('transfer.shipment', {
    date: '2026-02-11',
    vehicle: 'VAN-042',
    temp_range: { min: 15, max: 20 }
  }, { sender: mill.hash, receiver: bakery.hash, order: flourOrder.hash, carrier: distributor.hash })
  blocks.push(shipment)

  const breadSale = create('transfer.order', {
    quantity: 1,
    total: 4.5,
    date: '2026-02-15',
    payment_method: 'card'
  }, { buyer: foodie.hash, seller: bakery.hash, product: sourdough.hash })
  blocks.push(breadSale)

  const donation = create('transfer.donation', {
    date: '2026-02-15',
    items: 4,
    reason: 'end_of_day_surplus'
  }, { donor: bakery.hash, recipient: sustainer.hash, product: surplus.hash })
  blocks.push(donation)

  // === OBSERVATIONS ===
  const organicCert = create('observe.certification', {
    standard: 'Soil Association Organic',
    level: 'full',
    valid_from: '2025-06-01',
    valid_until: '2026-06-01',
    certificate_id: 'SA-2025-7842'
  }, { subject: farm.hash, authority: inspector.hash })
  blocks.push(organicCert)

  const coldChain = create('observe.reading', {
    temp_celsius: 17.2,
    humidity_pct: 45,
    timestamp: '2026-02-11T14:30:00Z',
    device: 'TempTracker-X1'
  }, { shipment: shipment.hash, place: warehouse.hash })
  blocks.push(coldChain)

  const review = create('observe.review', {
    rating: 5,
    text: 'Best sourdough in East London. Perfect crust, amazing tang.',
    visibility: 'public'
  }, { subject: sourdough.hash, author: foodie.hash, place: shop.hash })
  blocks.push(review)

  const inspection = create('observe.inspection', {
    date: '2026-01-20',
    score: 5,
    rating_label: 'Very Good',
    findings: 'All standards met. Excellent hygiene practices.'
  }, { subject: bakery.hash, place: shop.hash, authority: inspector.hash })
  blocks.push(inspection)

  // === PRICE UPDATE (version chain) ===
  const sourdoughV2 = update(sourdough.hash, 'substance.product', {
    name: 'Artisan Sourdough',
    price: 5.0,
    weight: { value: 800, unit: 'g' },
    allergens: { gluten: true, dairy: false },
    price_reason: 'flour cost increase'
  }, { seller: bakery.hash, inputs: [flour.hash, yeast.hash, water.hash, salt.hash] })
  blocks.push(sourdoughV2)

  // === AGENT ===
  // Bakery AI assistant — monitors inventory, places orders, manages surplus
  const bakeryAgent = create('actor.agent', {
    name: 'Joes Bakery Assistant',
    model: 'claude-sonnet',
    capabilities: ['inventory', 'ordering', 'surplus', 'pricing']
  }, { operator: bakery.hash })
  blocks.push(bakeryAgent)

  // Agent detects low flour stock and creates a draft reorder
  const draftFlourOrder = create('transfer.order', {
    quantity: 50,
    unit: 'kg',
    total: 160.00,
    date: '2026-02-16',
    reason: 'auto: flour stock below 5kg threshold',
    draft: true
  }, { buyer: bakery.hash, seller: mill.hash, product: flour.hash, agent: bakeryAgent.hash })
  blocks.push(draftFlourOrder)

  // Baker approves the draft next morning — creates confirmed version
  const confirmedFlourOrder = update(draftFlourOrder.hash, 'transfer.order', {
    quantity: 50,
    unit: 'kg',
    total: 160.00,
    date: '2026-02-16',
    reason: 'auto: flour stock below 5kg threshold'
  }, { buyer: bakery.hash, seller: mill.hash, product: flour.hash, approved_agent: bakeryAgent.hash })
  blocks.push(confirmedFlourOrder)

  // Agent creates inventory observation
  const inventoryCheck = create('observe.inventory', {
    date: '2026-02-16T06:00:00Z',
    items: [
      { product: 'Stoneground Wholemeal Flour', quantity_kg: 3.2, status: 'low' },
      { product: 'Wild Yeast Starter', quantity_kg: 0.8, status: 'ok' },
      { product: 'Sea Salt', quantity_kg: 2.1, status: 'ok' }
    ],
    alert: 'flour below reorder threshold (5kg)'
  }, { place: shop.hash, agent: bakeryAgent.hash, operator: bakery.hash })
  blocks.push(inventoryCheck)

  // Agent posts end-of-day surplus automatically
  const agentSurplus = create('substance.surplus', {
    name: 'End of Day Mixed Bread',
    original_price: 12.00,
    surplus_price: 4.00,
    quantity: 3,
    available_until: '2026-02-16T18:00:00Z',
    auto_posted: true
  }, { seller: bakery.hash, collector: sustainer.hash, agent: bakeryAgent.hash })
  blocks.push(agentSurplus)

  // === TEMPLATES ===
  const supplyChainTemplate = createTemplate('Farm-to-Table Supply Chain',
    'A complete provenance chain from primary producer to retail product',
    [
      { type: 'actor.producer', alias: 'farm', required: ['name'] },
      { type: 'substance.ingredient', alias: 'crop', refs: { source: '@farm' }, required: ['name'] },
      { type: 'transform.process', alias: 'processing', refs: { input: '@crop' }, required: ['name'] },
      { type: 'substance.product', alias: 'product', refs: { origin: '@processing' }, required: ['name', 'price'] },
      { type: 'transfer.order', alias: 'sale', refs: { item: '@product' } }
    ],
    { author: inspector.hash }
  )
  blocks.push(supplyChainTemplate)

  const reviewTemplate = createTemplate('Product Review',
    'A consumer review of a food product at a venue',
    [
      { type: 'actor.venue', alias: 'venue', required: ['name'] },
      { type: 'substance.product', alias: 'product', refs: { seller: '@venue' }, required: ['name'] },
      { type: 'observe.review', alias: 'review', refs: { subject: '@product' }, required: ['rating'] }
    ]
  )
  blocks.push(reviewTemplate)

  const certTemplate = createTemplate('Product Certification',
    'An authority certifying a producer or product',
    [
      { type: 'actor.authority', alias: 'authority', required: ['name'] },
      { type: 'actor.producer', alias: 'producer', required: ['name'] },
      { type: 'observe.certification', alias: 'cert', refs: { authority: '@authority', subject: '@producer' }, required: ['name'] }
    ]
  )
  blocks.push(certTemplate)

  // === VOCABULARIES ===
  const bakeryVocab = createVocabulary('bakery', ['substance.product'], {
    name: { type: 'string', required: true, aliases: ['called', 'named', 'product name'] },
    price: { type: 'number', unit: 'local_currency', aliases: ['costs', 'sells for', 'priced at'] },
    allergens: { type: 'object<boolean>', aliases: ['contains', 'allergy info', 'allergen'] },
    weight: { type: 'object', aliases: ['weighs', 'weight is'] }
  }, { author: inspector.hash })
  blocks.push(bakeryVocab)

  const farmVocab = createVocabulary('farm', ['actor.producer', 'substance.ingredient'], {
    name: { type: 'string', required: true, aliases: ['called', 'named', 'farm name'] },
    organic: { type: 'boolean', aliases: ['is organic', 'certified organic'] },
    sector: { type: 'string', aliases: ['industry', 'sector is'] },
    variety: { type: 'string', aliases: ['type', 'variety is', 'crop type'] }
  })
  blocks.push(farmVocab)

  const lotVocab = createVocabulary('lot', ['substance.product', 'substance.ingredient', 'transform.process'], {
    lot_id: { type: 'string', required: true, aliases: ['lot', 'lot number', 'batch'] },
    production_date: { type: 'string', aliases: ['produced', 'manufactured', 'made on'] },
    expiry_date: { type: 'string', aliases: ['expires', 'best before', 'use by'] },
    lot_size: { type: 'number', aliases: ['lot size', 'batch size', 'quantity produced'] },
    facility: { type: 'string', aliases: ['facility', 'plant', 'factory'] }
  })
  blocks.push(lotVocab)

  const unitsVocab = createVocabulary('units', ['substance.product', 'transfer.order', 'observe.reading'], {
    weight: { type: 'quantity', valid_units: ['g', 'kg', 'oz', 'lb'], aliases: ['weight', 'weighs'] },
    volume: { type: 'quantity', valid_units: ['ml', 'l', 'fl_oz', 'gal'], aliases: ['volume', 'capacity'] },
    temperature: { type: 'quantity', valid_units: ['celsius', 'fahrenheit'], aliases: ['temperature', 'temp'] },
    currency: { type: 'quantity', valid_units: ['USD', 'EUR', 'GBP'], aliases: ['price', 'cost'] }
  })
  blocks.push(unitsVocab)

  const workflowVocab = createVocabulary('workflow', ['transfer.order', 'transfer.shipment'], {
    status: { type: 'string', required: true, aliases: ['status', 'state', 'stage'],
      valid_values: ['draft', 'quote', 'order', 'confirmed', 'processing', 'shipped', 'delivered', 'paid', 'cancelled', 'returned'] },
    previous_status: { type: 'string', aliases: ['was', 'previously', 'changed from'] },
    reason: { type: 'string', aliases: ['reason', 'because', 'note'] }
  })
  blocks.push(workflowVocab)

  // === ATTESTATIONS ===
  const organicAttestation = attest(organicCert.hash, inspector.hash, {
    confidence: 'verified',
    method: 'on-site inspection and document review'
  })
  blocks.push(organicAttestation)

  const reviewAttestation = attest(review.hash, foodie.hash, {
    confidence: 'witnessed',
    method: 'personal experience'
  })
  blocks.push(reviewAttestation)

  return blocks
}

module.exports = { generateSeed }
