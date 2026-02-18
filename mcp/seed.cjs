const { create, update, createTemplate, createVocabulary, attest } = require('@foodxdev/foodblock')

/**
 * Generate sample FoodBlock data: a complete bakery supply chain.
 * Returns an array of blocks in creation order.
 *
 * Identical to sandbox/seed.js but imports from npm package
 * instead of relative path, for standalone MCP server use.
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
  const bakeryAgent = create('actor.agent', {
    name: 'Joes Bakery Assistant',
    model: 'claude-sonnet',
    capabilities: ['inventory', 'ordering', 'surplus', 'pricing']
  }, { operator: bakery.hash })
  blocks.push(bakeryAgent)

  const draftFlourOrder = create('transfer.order', {
    quantity: 50,
    unit: 'kg',
    total: 160.00,
    date: '2026-02-16',
    reason: 'auto: flour stock below 5kg threshold',
    draft: true
  }, { buyer: bakery.hash, seller: mill.hash, product: flour.hash, agent: bakeryAgent.hash })
  blocks.push(draftFlourOrder)

  const confirmedFlourOrder = update(draftFlourOrder.hash, 'transfer.order', {
    quantity: 50,
    unit: 'kg',
    total: 160.00,
    date: '2026-02-16',
    reason: 'auto: flour stock below 5kg threshold'
  }, { buyer: bakery.hash, seller: mill.hash, product: flour.hash, approved_agent: bakeryAgent.hash })
  blocks.push(confirmedFlourOrder)

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

  // ============================================================
  // STORY 2: London Restaurant Network (~30 blocks)
  // A Soho pizzeria with full ingredient provenance, sourcing,
  // reviews, certifications, and an AI agent.
  // ============================================================

  // --- Actors ---
  const luigi = create('actor.venue', { name: "Luigi's Pizzeria", cuisine: 'Italian', rating: 4.5 })
  blocks.push(luigi)

  const luigiPlace = create('place.venue', { name: '12 Dean Street, Soho, London', postcode: 'W1D 3RP' }, { venue: luigi.hash })
  blocks.push(luigiPlace)

  const tomatoFarm = create('actor.producer', { name: 'Campania Tomato Farm', region: 'Campania, Italy', organic: true })
  blocks.push(tomatoFarm)

  const mozzDairy = create('actor.producer', { name: 'Somerset Mozzarella Dairy', region: 'Somerset, UK' })
  blocks.push(mozzDairy)

  const tvMill = create('actor.producer', { name: 'Thames Valley Flour Mill', region: 'Oxfordshire, UK' })
  blocks.push(tvMill)

  // --- Ingredients ---
  const sanMarzano = create('substance.ingredient', { name: 'San Marzano Tomatoes', variety: 'DOP' }, { source: tomatoFarm.hash })
  blocks.push(sanMarzano)

  const mozzarella = create('substance.ingredient', { name: 'Buffalo Mozzarella', milk_type: 'buffalo' }, { source: mozzDairy.hash })
  blocks.push(mozzarella)

  const tipo00 = create('substance.ingredient', { name: 'Tipo 00 Flour' }, { source: tvMill.hash })
  blocks.push(tipo00)

  // --- Products ---
  const margherita = create('substance.product', {
    name: 'Margherita Pizza',
    price: { value: 12.50, unit: 'GBP' }
  }, { seller: luigi.hash, inputs: [sanMarzano.hash, mozzarella.hash, tipo00.hash] })
  blocks.push(margherita)

  const diavola = create('substance.product', {
    name: 'Diavola Pizza',
    price: { value: 14.00, unit: 'GBP' }
  }, { seller: luigi.hash, inputs: [sanMarzano.hash, mozzarella.hash, tipo00.hash] })
  blocks.push(diavola)

  const calzone = create('substance.product', {
    name: 'Calzone',
    price: { value: 13.00, unit: 'GBP' }
  }, { seller: luigi.hash, inputs: [sanMarzano.hash, mozzarella.hash, tipo00.hash] })
  blocks.push(calzone)

  // --- Transforms (dough making and pizza baking) ---
  const doughMaking = create('transform.process', {
    name: 'Pizza Dough Preparation',
    date: '2026-02-17',
    method: 'hand-kneaded, 24hr cold ferment',
    fermentation_hours: 24
  }, { inputs: [tipo00.hash], actor: luigi.hash, place: luigiPlace.hash })
  blocks.push(doughMaking)

  const pizzaBaking = create('transform.process', {
    name: 'Wood-Fired Pizza Baking',
    date: '2026-02-18',
    method: 'wood-fired oven',
    bake_temp: 450,
    bake_time_seconds: 90
  }, { inputs: [sanMarzano.hash, mozzarella.hash, tipo00.hash], output: margherita.hash, actor: luigi.hash, place: luigiPlace.hash })
  blocks.push(pizzaBaking)

  // --- Sourcing ---
  const tomatoOffer = create('transfer.offer', {
    name: 'San Marzano Supply Offer',
    quantity: 200,
    unit: 'kg',
    status: 'offered'
  }, { seller: tomatoFarm.hash, buyer: luigi.hash })
  blocks.push(tomatoOffer)

  const tomatoOrder = create('transfer.order', {
    name: 'Monthly Tomato Order',
    quantity: 200,
    unit: 'kg',
    total: { value: 480, unit: 'GBP' },
    status: 'confirmed'
  }, { seller: tomatoFarm.hash, buyer: luigi.hash })
  blocks.push(tomatoOrder)

  const mozzOrder = create('transfer.order', {
    name: 'Weekly Mozzarella Order',
    quantity: 50,
    unit: 'kg',
    total: { value: 375, unit: 'GBP' },
    status: 'confirmed'
  }, { seller: mozzDairy.hash, buyer: luigi.hash })
  blocks.push(mozzOrder)

  const flourOrder2 = create('transfer.order', {
    name: 'Bi-weekly Flour Order',
    quantity: 100,
    unit: 'kg',
    total: { value: 120, unit: 'GBP' },
    status: 'confirmed'
  }, { seller: tvMill.hash, buyer: luigi.hash })
  blocks.push(flourOrder2)

  // --- Reviews ---
  const sarahM = create('actor.consumer', { name: 'Sarah M' })
  blocks.push(sarahM)

  const jamesT = create('actor.consumer', { name: 'James T' })
  blocks.push(jamesT)

  const margheritaReview = create('observe.review', {
    rating: 5,
    text: 'Best margherita in Soho. The San Marzano tomatoes make all the difference.',
    visibility: 'public'
  }, { subject: margherita.hash, author: sarahM.hash })
  blocks.push(margheritaReview)

  const calzoneReview = create('observe.review', {
    rating: 4,
    text: 'Great calzone, generous fillings. Would come back.',
    visibility: 'public'
  }, { subject: calzone.hash, author: jamesT.hash })
  blocks.push(calzoneReview)

  const diavolaReview = create('observe.review', {
    rating: 5,
    text: 'The spicy nduja on the Diavola is phenomenal. Authentic Italian heat.',
    visibility: 'public'
  }, { subject: diavola.hash, author: jamesT.hash })
  blocks.push(diavolaReview)

  // --- Certifications ---
  const hygieneRating = create('observe.certification', {
    name: 'Food Hygiene Rating',
    score: 5,
    valid_until: '2027-03-15'
  }, { subject: luigi.hash, authority: inspector.hash })
  blocks.push(hygieneRating)

  const euCertAuthority = create('actor.authority', { name: 'EU PDO Certification Body', jurisdiction: 'EU' })
  blocks.push(euCertAuthority)

  const dopCert = create('observe.certification', {
    name: 'DOP San Marzano',
    standard: 'EU PDO',
    valid_until: '2026-12-31'
  }, { subject: sanMarzano.hash, authority: euCertAuthority.hash })
  blocks.push(dopCert)

  // --- Inspection ---
  const luigiInspection = create('observe.inspection', {
    date: '2026-01-10',
    score: 5,
    rating_label: 'Very Good',
    findings: 'Excellent food safety. Wood-fired oven properly maintained. Cold storage at correct temperatures.'
  }, { subject: luigi.hash, place: luigiPlace.hash, authority: inspector.hash })
  blocks.push(luigiInspection)

  // --- Agent ---
  const luigiAgent = create('actor.agent', {
    name: "Luigi's Daily Specials Agent",
    model: 'claude-sonnet',
    capabilities: ['menu_planning', 'inventory_check', 'supplier_comms']
  }, { operator: luigi.hash })
  blocks.push(luigiAgent)

  const luigiInventory = create('observe.inventory', {
    date: '2026-02-18T07:00:00Z',
    items: [
      { product: 'San Marzano Tomatoes', quantity_kg: 15.5, status: 'ok' },
      { product: 'Buffalo Mozzarella', quantity_kg: 8.2, status: 'ok' },
      { product: 'Tipo 00 Flour', quantity_kg: 22.0, status: 'ok' }
    ]
  }, { place: luigiPlace.hash, agent: luigiAgent.hash, operator: luigi.hash })
  blocks.push(luigiInventory)

  // --- Attestations ---
  const dopAttestation = attest(dopCert.hash, euCertAuthority.hash, {
    confidence: 'verified',
    method: 'laboratory analysis and farm inspection'
  })
  blocks.push(dopAttestation)

  const margheritaReviewAttestation = attest(margheritaReview.hash, sarahM.hash, {
    confidence: 'witnessed',
    method: 'personal dining experience'
  })
  blocks.push(margheritaReviewAttestation)

  // ============================================================
  // STORY 3: Farmers Market (~25 blocks)
  // Borough Market with multiple producers, surplus donations,
  // temperature monitoring, and a consumer review journey.
  // ============================================================

  // --- Market & Producers ---
  const boroughMarket = create('place.market', { name: 'Borough Market', market_day: 'Saturday', location: 'London SE1' })
  blocks.push(boroughMarket)

  const honeyFarm = create('actor.producer', { name: 'Cotswold Honey Farm', region: 'Cotswolds, UK', organic: true })
  blocks.push(honeyFarm)

  const cheeseCo = create('actor.producer', { name: 'Artisan Cheese Co', region: 'Sussex, UK' })
  blocks.push(cheeseCo)

  const wildBakery = create('actor.producer', { name: 'Wild Sourdough Bakery', region: 'Kent, UK' })
  blocks.push(wildBakery)

  // --- Products ---
  const wildflowerHoney = create('substance.product', {
    name: 'Wildflower Honey',
    price: { value: 8.50, unit: 'GBP' },
    weight: { value: 340, unit: 'g' }
  }, { seller: honeyFarm.hash, market: boroughMarket.hash })
  blocks.push(wildflowerHoney)

  const agedCheddar = create('substance.product', {
    name: 'Aged Cheddar',
    price: { value: 6.00, unit: 'GBP' },
    aging_days: 365
  }, { seller: cheeseCo.hash, market: boroughMarket.hash })
  blocks.push(agedCheddar)

  const marketSourdough = create('substance.product', {
    name: 'Sourdough Loaf',
    price: { value: 5.50, unit: 'GBP' },
    organic: true
  }, { seller: wildBakery.hash, market: boroughMarket.hash })
  blocks.push(marketSourdough)

  // --- Additional products ---
  const lavenderHoney = create('substance.product', {
    name: 'Lavender Honey',
    price: { value: 9.00, unit: 'GBP' },
    weight: { value: 340, unit: 'g' }
  }, { seller: honeyFarm.hash, market: boroughMarket.hash })
  blocks.push(lavenderHoney)

  const goatCheese = create('substance.product', {
    name: 'Soft Goat Cheese',
    price: { value: 7.50, unit: 'GBP' },
    milk_type: 'goat'
  }, { seller: cheeseCo.hash, market: boroughMarket.hash })
  blocks.push(goatCheese)

  // --- Certifications ---
  const honeyOrganic = create('observe.certification', {
    name: 'Soil Association Organic',
    standard: 'Soil Association',
    level: 'full',
    valid_until: '2026-09-01',
    certificate_id: 'SA-2025-3291'
  }, { subject: honeyFarm.hash, authority: inspector.hash })
  blocks.push(honeyOrganic)

  const cheeseHygiene = create('observe.certification', {
    name: 'Food Hygiene Rating',
    score: 5,
    valid_until: '2027-01-15'
  }, { subject: cheeseCo.hash, authority: inspector.hash })
  blocks.push(cheeseHygiene)

  // --- Surplus & Donation ---
  const eodSourdough = create('substance.surplus', {
    name: 'End of Day Sourdough',
    original_price: { value: 5.50, unit: 'GBP' },
    surplus_price: { value: 2.00, unit: 'GBP' },
    quantity: 3,
    status: 'available',
    available_until: '2026-02-18T16:00:00Z'
  }, { seller: wildBakery.hash, source: marketSourdough.hash, market: boroughMarket.hash })
  blocks.push(eodSourdough)

  const foodBank = create('actor.venue', { name: 'Southwark Food Bank', sector: 'charity' })
  blocks.push(foodBank)

  const marketDonation = create('transfer.donation', {
    name: 'End of Day Donation',
    quantity: 3,
    date: '2026-02-18',
    status: 'collected',
    reason: 'end_of_day_surplus'
  }, { source: wildBakery.hash, recipient: foodBank.hash, item: eodSourdough.hash })
  blocks.push(marketDonation)

  // --- Temperature Readings ---
  const cheeseTemp = create('observe.reading', {
    reading_type: 'temperature',
    temperature: { value: 4.2, unit: 'celsius' },
    location: 'Cheese Cold Display',
    timestamp: '2026-02-18T10:30:00Z',
    device: 'TempTracker-M2'
  }, { subject: agedCheddar.hash, place: boroughMarket.hash })
  blocks.push(cheeseTemp)

  const cheeseTempAfternoon = create('observe.reading', {
    reading_type: 'temperature',
    temperature: { value: 5.1, unit: 'celsius' },
    location: 'Cheese Cold Display',
    timestamp: '2026-02-18T14:00:00Z',
    device: 'TempTracker-M2'
  }, { subject: agedCheddar.hash, place: boroughMarket.hash })
  blocks.push(cheeseTempAfternoon)

  // --- Consumer Journey ---
  const emmaW = create('actor.consumer', { name: 'Emma W' })
  blocks.push(emmaW)

  const honeyReview = create('observe.review', {
    rating: 5,
    text: 'The wildflower honey is incredible - you can taste the meadow.',
    visibility: 'public'
  }, { subject: wildflowerHoney.hash, author: emmaW.hash, place: boroughMarket.hash })
  blocks.push(honeyReview)

  const cheddarReview = create('observe.review', {
    rating: 4,
    text: 'Perfectly aged cheddar, great with the sourdough.',
    visibility: 'public'
  }, { subject: agedCheddar.hash, author: emmaW.hash, place: boroughMarket.hash })
  blocks.push(cheddarReview)

  const sourdoughReview = create('observe.review', {
    rating: 5,
    text: 'Best sourdough in London, worth the queue.',
    visibility: 'public'
  }, { subject: marketSourdough.hash, author: emmaW.hash, place: boroughMarket.hash })
  blocks.push(sourdoughReview)

  // --- Market Sales ---
  const honeySale = create('transfer.order', {
    quantity: 2,
    total: { value: 17.00, unit: 'GBP' },
    date: '2026-02-18',
    payment_method: 'card'
  }, { buyer: emmaW.hash, seller: honeyFarm.hash, product: wildflowerHoney.hash })
  blocks.push(honeySale)

  const cheddarSale = create('transfer.order', {
    quantity: 1,
    total: { value: 6.00, unit: 'GBP' },
    date: '2026-02-18',
    payment_method: 'card'
  }, { buyer: emmaW.hash, seller: cheeseCo.hash, product: agedCheddar.hash })
  blocks.push(cheddarSale)

  const sourdoughSale = create('transfer.order', {
    quantity: 1,
    total: { value: 5.50, unit: 'GBP' },
    date: '2026-02-18',
    payment_method: 'cash'
  }, { buyer: emmaW.hash, seller: wildBakery.hash, product: marketSourdough.hash })
  blocks.push(sourdoughSale)

  // --- Attestations ---
  const honeyOrgAttestation = attest(honeyOrganic.hash, inspector.hash, {
    confidence: 'verified',
    method: 'annual inspection and honey analysis'
  })
  blocks.push(honeyOrgAttestation)

  const honeyReviewAttestation = attest(honeyReview.hash, emmaW.hash, {
    confidence: 'witnessed',
    method: 'personal purchase and tasting'
  })
  blocks.push(honeyReviewAttestation)

  return blocks
}

module.exports = { generateSeed }
