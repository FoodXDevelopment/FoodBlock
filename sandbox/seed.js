const { create, update } = require('../sdk/javascript/src/index')

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

  return blocks
}

module.exports = { generateSeed }
