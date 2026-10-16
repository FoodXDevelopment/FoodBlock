// Makes spec/profiles/epcis/vectors.json: `node spec/profiles/epcis/make-vectors.cjs`.
// A small leafy-greens and seafood supply chain, written as EPCIS 2.0 events, each turned into signed FoodBlock 1.6 blocks
// by the reference adapter (adapter.cjs), then turned back into the same event. Every expectation is checked here against
// the SDK (the Rust core) before the file is written; run.cjs checks the file again. Test keys come from fixed seeds.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../../../sdk/javascript/src/index.cjs')
const { call } = require('../../../sdk/javascript/src/core.cjs')
const A = require('./adapter.cjs')

const FILE = path.join(__dirname, 'vectors.json')
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const P = A.PREFIX

// ---- people, with a GS1 party id each ----
const PEOPLE = {
  fieldhouse: { name: 'Fieldhouse Farm', pgln: 'urn:epc:id:pgln:0614141.00000' },
  greenacres: { name: 'Green Acres Growers', pgln: 'urn:epc:id:pgln:0614155.00000' },
  metrofresh: { name: 'Metro Fresh Distribution', pgln: 'urn:epc:id:pgln:0614160.00000' },
  cornermarket: { name: 'Corner Market', pgln: 'urn:epc:id:pgln:0614190.00000' },
  haulltd: { name: 'Haul Ltd', pgln: 'urn:epc:id:pgln:0614195.00000' },
  seabird: { name: 'FV Seabird', pgln: 'urn:epc:id:pgln:0614170.00000' },
  harbourfish: { name: 'Harbour Fish Landing', pgln: 'urn:epc:id:pgln:0614175.00000' },
  profile: { name: 'the EPCIS profile', pgln: 'urn:epc:id:pgln:0000000.00000' },
  regulator: { name: 'a food safety regulator', pgln: 'urn:epc:id:pgln:0000001.00000' }
}
const keys = {}
for (const who of Object.keys(PEOPLE)) {
  const seed = sha(`foodblock 1.6 epcis vectors: ${who}`), kp = fb.keypairFromSeed(seed)
  keys[who] = { seed, private_key: kp.private_key, public_key_sign: kp.public_key_sign }
}

// ---- the blocks, in the order they were written ----
const blocks = []
const held = []
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 11, 12, 0, 0) + 1000 * tick++).toISOString()
const record = (name, signer, block) => { held.push(block); blocks.push({ name, signer, hash: block.hash, block: { type: block.type, state: block.state, refs: block.refs }, signature: block.signature }); return block }
const ids = {}
const say = (name, who, type, state, refs = {}, opts = {}) => {
  const { at: when, ...rest } = state
  const clean = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
  return record(name, who, fb.write(type, rest, clean, { author: ids[who], key: keys[who], held, at: when || at(), audience: 'public', ...opts }))
}
for (const who of Object.keys(PEOPLE)) {
  const g = fb.identity.genesis(keys[who], { kind: 'person', at: at() })
  ids[who] = g.hash
  record(`${who}: genesis`, who, g)
}
const parties = Object.fromEntries(Object.entries(PEOPLE).map(([who, p]) => [p.pgln, ids[who]]))

// ---- sites, product kinds, a container, the schema ----
const SITES = {
  field_a: { who: 'fieldhouse', name: 'Fieldhouse Farm, Field A', sgln: 'urn:epc:id:sgln:0614141.00001.0', where: ['36.6777', '-121.6555'], address: { line1: '1 Salinas Road', city: 'Salinas', region: 'CA', postal: '93901', country: 'US' } },
  ff_packhouse: { who: 'fieldhouse', name: 'Fieldhouse packhouse and cooler', sgln: 'urn:epc:id:sgln:0614141.00002.0', where: ['36.6801', '-121.6602'], address: { line1: '2 Salinas Road', city: 'Salinas', region: 'CA', postal: '93901', country: 'US' } },
  ga_field: { who: 'greenacres', name: 'Green Acres, Field B', sgln: 'urn:epc:id:sgln:0614155.00001.0', where: ['36.5502', '-121.4021'], address: { line1: '9 Soledad Lane', city: 'Soledad', region: 'CA', postal: '93960', country: 'US' } },
  ga_packhouse: { who: 'greenacres', name: 'Green Acres packhouse', sgln: 'urn:epc:id:sgln:0614155.00002.0', where: ['36.5510', '-121.4050'], address: { line1: '11 Soledad Lane', city: 'Soledad', region: 'CA', postal: '93960', country: 'US' } },
  dc: { who: 'metrofresh', name: 'Metro Fresh distribution centre', sgln: 'urn:epc:id:sgln:0614160.00001.0', where: ['37.7749', '-122.3894'], address: { line1: '500 Pier Way', city: 'San Francisco', region: 'CA', postal: '94124', country: 'US' } },
  store: { who: 'cornermarket', name: 'Corner Market, receiving dock', sgln: 'urn:epc:id:sgln:0614190.00001.0', where: ['37.7599', '-122.4148'], address: { line1: '3 Mission Street', city: 'San Francisco', region: 'CA', postal: '94110', country: 'US' } },
  backroom: { who: 'cornermarket', name: 'Corner Market, back room', sgln: 'urn:epc:id:sgln:0614190.00002.0', where: ['37.7599', '-122.4148'], address: { line1: '3 Mission Street', city: 'San Francisco', region: 'CA', postal: '94110', country: 'US' } },
  floor: { who: 'cornermarket', name: 'Corner Market, sales floor', sgln: 'urn:epc:id:sgln:0614190.00003.0', where: ['37.7599', '-122.4148'], address: { line1: '3 Mission Street', city: 'San Francisco', region: 'CA', postal: '94110', country: 'US' } },
  sea: { who: 'seabird', name: 'Fishing ground 27.IVb', sgln: 'urn:epc:id:sgln:0614170.00001.0', where: ['54.5', '2.5'], address: { line1: 'North Sea', city: 'At sea', region: 'FAO 27', postal: '00000', country: 'GB' } },
  dock: { who: 'harbourfish', name: 'Harbour Fish landing dock', sgln: 'urn:epc:id:sgln:0614175.00001.0', where: ['57.1437', '-2.0981'], address: { line1: '4 Fish Quay', city: 'Aberdeen', region: 'Scotland', postal: 'AB11 5HX', country: 'GB' } }
}
const glnOf = (sgln) => { const [prefix, loc] = sgln.split(':').pop().split('.'); const body = prefix + loc; return body + A.checkDigit(body) }
const site = {}
for (const [key, s] of Object.entries(SITES)) {
  site[key] = say(`site: ${key}`, s.who, 'thing', { kind: 'place', name: s.name, marks: [{ scheme: 'gln', value: glnOf(s.sgln) }, { scheme: 'sgln', value: s.sgln }], where: { lat: s.where[0], lon: s.where[1] }, address: s.address, phone: '+1 555 0100' })
}
const PRODUCTS = [
  ['romaine', 'Romaine lettuce, field run', 'urn:epc:class:lgtin:0614141.107346.0', 'fieldhouse'],
  ['romaine_pack', 'Romaine hearts, 3 pack', 'urn:epc:class:lgtin:0614141.107353.0', 'fieldhouse'],
  ['romaine_ga', 'Romaine lettuce, field run (Green Acres)', 'urn:epc:class:lgtin:0614155.107340.0', 'greenacres'],
  ['romaine_ga_pack', 'Romaine, trimmed 5 lb', 'urn:epc:class:lgtin:0614155.107357.0', 'greenacres'],
  ['salad_kit', 'Caesar salad kit', 'urn:epc:class:lgtin:0614160.100011.0', 'metrofresh'],
  ['tomatoes', 'Roma tomatoes, 25 lb', 'urn:epc:class:lgtin:0614180.100059.0', 'cornermarket'],
  ['cod_catch', 'Cod, whole, landed', 'urn:epc:class:lgtin:0614170.100022.0', 'seabird'],
  ['cod_fillet', 'Cod fillet, fresh', 'urn:epc:class:lgtin:0614175.100039.0', 'harbourfish']
]
const kind = {}
for (const [key, name, lgtin, who] of PRODUCTS) kind[key] = say(`product kind: ${key}`, who, 'thing', { kind: 'product', name, marks: [{ scheme: 'gtin', value: A.gtinOf(lgtin) }] })
const tote = say('container: a tote', 'cornermarket', 'thing', { kind: 'container', name: 'Produce tote', marks: [{ scheme: 'sscc', value: 'urn:epc:id:sscc:0614190.1000000017' }] }, { place: site.backroom.hash })
// The profile's schema for the transfers (closed blocks need their fields declared, core.md section 7).
const schema = say('schema: EPCIS transfers', 'profile', 'thing', {
  kind: 'schema', name: 'EPCIS transfer fields', target: 'transfer',
  fields: { biz_step: 'text', disposition: 'text', persistent_disposition: 'object', tz: 'text', action: 'text', epcis_id: 'text', biz_transactions: 'list', reference_document: 'object' }
})

// ---- events ----
const U = (who) => ({ ctx: { held, parties, me: ids[who], schema: schema.hash } })
const events = []
const lgtin = (company, item, lot) => `urn:epc:class:lgtin:${company}.${item}.${lot}`
const bol = (n) => [{ type: `${P}btt:bol`, bizTransaction: `urn:epc:id:gdti:0614141.00007.BOL-${n}` }]
function step(name, who, event, { roundtrip = true, extra = [], note } = {}) {
  const before = held.length
  const drafts = A.fromEvent(event, { held, parties, schema: schema.hash })
  const made = {}
  const written = []
  for (const d of drafts) {
    const resolve = (v) => (typeof v === 'string' && v.startsWith('$') ? made[v.slice(1)].hash : Array.isArray(v) ? v.map(resolve) : v)
    const refs = Object.fromEntries(Object.entries(d.refs).map(([k, v]) => [k, resolve(v)]))
    const opts = d.after ? { after: d.after.map(resolve) } : {}
    const b = say(`${name}${d.role === 'event' ? '' : ` (${d.role})`}`, who, d.type, d.state, refs, opts)
    made[d.role] = b
    written.push(b)
  }
  for (const [n, s, t, st, rf] of extra) { const b = say(n, s, t, st, rf(made)); written.push(b); made[n] = b }
  // The way back: the event block (and what it made) gives the same event.
  if (roundtrip) assert.deepEqual(A.toEvent(written[0], { held, parties: Object.fromEntries(Object.entries(parties).map(([k, v]) => [k, v])) }), event, `${name}: back to the event`)
  events.push({ name, signer: who, before, event, blocks: written.map((b) => b.hash), roundtrip, ...(note ? { note } : {}) })
  return { event: written[0], made }
}
const sgln = (key) => SITES[key].sgln
const loc = (key) => ({ readPoint: { id: sgln(key) }, bizLocation: { id: sgln(key) } })
const base = (type, time, tz, extra) => ({ type, eventTime: time, recordTime: new Date(Date.parse(time) + 180000).toISOString(), eventTimeZoneOffset: tz, ...extra })

// 1-3. Fieldhouse Farm: harvest, cool, initial pack
const H = lgtin('0614141', '107346', 'FLD-A-1012')
const L1c = lgtin('0614141', '107353', 'F-285-A')
const harvest = step('harvesting: Field A', 'fieldhouse', base('ObjectEvent', '2026-10-12T05:30:00.000Z', '-07:00', {
  eventID: 'ni:///sha-256;7c1f2a?ver=CBV2.0', action: 'ADD', bizStep: A.STEP.commissioning, 'fb:cte': 'harvest', disposition: `${P}disp:active`, ...loc('field_a'),
  quantityList: [{ epcClass: H, quantity: 1200, uom: 'KGM' }], ilmd: { 'fb:commodity': 'Romaine lettuce', 'fb:variety': 'Green Towers', 'fb:fieldName': 'Field A' }
}))
step('cooling: the packhouse cooler', 'fieldhouse', base('ObjectEvent', '2026-10-12T09:00:00.000Z', '-07:00', {
  action: 'OBSERVE', bizStep: A.STEP.other, 'fb:cte': 'cool', disposition: `${P}disp:active`, ...loc('ff_packhouse'), quantityList: [{ epcClass: H, quantity: 1200, uom: 'KGM' }]
}))
const pack = step('initial packing: romaine hearts', 'fieldhouse', base('TransformationEvent', '2026-10-12T14:00:00.000Z', '-07:00', {
  bizStep: A.STEP.packing, disposition: `${P}disp:in_progress`, ...loc('ff_packhouse'),
  inputQuantityList: [{ epcClass: H, quantity: 1200, uom: 'KGM' }], outputQuantityList: [{ epcClass: L1c, quantity: 1180, uom: 'KGM' }], ilmd: { 'cbvmda:itemExpirationDate': '2026-10-22' }
}))

// 4-5. Green Acres: harvest, initial pack (its own lot code)
const H2 = lgtin('0614155', '107340', 'FLD-B-0077')
const L2c = lgtin('0614155', '107357', 'GA-285-B')
step('harvesting: Green Acres Field B', 'greenacres', base('ObjectEvent', '2026-10-12T06:10:00.000Z', '-07:00', {
  action: 'ADD', bizStep: A.STEP.commissioning, 'fb:cte': 'harvest', disposition: `${P}disp:active`, ...loc('ga_field'), quantityList: [{ epcClass: H2, quantity: 800, uom: 'KGM' }], ilmd: { 'fb:commodity': 'Romaine lettuce', 'fb:variety': 'Parris Island', 'fb:fieldName': 'Field B' }
}))
step('initial packing: trimmed romaine', 'greenacres', base('TransformationEvent', '2026-10-12T13:20:00.000Z', '-07:00', {
  bizStep: A.STEP.packing, disposition: `${P}disp:in_progress`, ...loc('ga_packhouse'), inputQuantityList: [{ epcClass: H2, quantity: 800, uom: 'KGM' }], outputQuantityList: [{ epcClass: L2c, quantity: 760, uom: 'KGM' }]
}))

// 6-9. Both farms ship to Metro Fresh, which receives
const shipping = (who, from, to, c, qty, n, time, tz) => base('ObjectEvent', time, tz, {
  action: 'OBSERVE', bizStep: A.STEP.shipping, disposition: `${P}disp:in_transit`, readPoint: { id: sgln(from) }, quantityList: [{ epcClass: c, quantity: qty, uom: 'KGM' }], bizTransactionList: bol(n),
  sourceList: [{ type: `${P}sdt:owning_party`, source: PEOPLE[who].pgln }, { type: `${P}sdt:location`, source: sgln(from) }],
  destinationList: [{ type: `${P}sdt:owning_party`, destination: PEOPLE[to].pgln }, { type: `${P}sdt:possessing_party`, destination: PEOPLE.haulltd.pgln }, { type: `${P}sdt:location`, destination: sgln(c === L1c || c === L2c ? 'dc' : 'store') }]
})
const receiving = (who, from, at_, c, qty, n, time, tz) => base('ObjectEvent', time, tz, {
  action: 'OBSERVE', bizStep: A.STEP.receiving, disposition: `${P}disp:in_progress`, ...loc(at_), quantityList: [{ epcClass: c, quantity: qty, uom: 'KGM' }], bizTransactionList: bol(n),
  sourceList: [{ type: `${P}sdt:owning_party`, source: PEOPLE[from].pgln }], destinationList: [{ type: `${P}sdt:owning_party`, destination: PEOPLE[who].pgln }]
})
step('shipping: Fieldhouse to Metro Fresh', 'fieldhouse', shipping('fieldhouse', 'ff_packhouse', 'metrofresh', L1c, 1180, 5521, '2026-10-13T06:00:00.000Z', '-07:00'))
step('shipping: Green Acres to Metro Fresh', 'greenacres', shipping('greenacres', 'ga_packhouse', 'metrofresh', L2c, 760, 7710, '2026-10-13T05:00:00.000Z', '-07:00'))
step('receiving: Metro Fresh takes the Green Acres lot', 'metrofresh', receiving('metrofresh', 'greenacres', 'dc', L2c, 760, 7710, '2026-10-13T08:15:00.000Z', '-07:00'))
step('receiving: Metro Fresh takes the Fieldhouse lot', 'metrofresh', receiving('metrofresh', 'fieldhouse', 'dc', L1c, 1180, 5521, '2026-10-13T09:30:00.000Z', '-07:00'))

// 10. Transformation: a salad kit from both lots, a new lot code
const L3c = lgtin('0614160', '100011', 'DC-SK-1001')
const process_ = step('transformation: salad kits', 'metrofresh', base('TransformationEvent', '2026-10-13T11:00:00.000Z', '-07:00', {
  bizStep: A.STEP.commissioning, disposition: `${P}disp:in_progress`, ...loc('dc'),
  inputQuantityList: [{ epcClass: L1c, quantity: 1180, uom: 'KGM' }, { epcClass: L2c, quantity: 760, uom: 'KGM' }], outputQuantityList: [{ epcClass: L3c, quantity: 1700, uom: 'KGM' }], ilmd: { 'cbvmda:itemExpirationDate': '2026-10-20' }
}))

// 11-12. The kits ship to Corner Market and are received
step('shipping: Metro Fresh to Corner Market', 'metrofresh', shipping('metrofresh', 'dc', 'cornermarket', L3c, 1700, 8802, '2026-10-14T04:30:00.000Z', '-07:00'))
step('receiving: Corner Market takes the kits', 'cornermarket', receiving('cornermarket', 'metrofresh', 'store', L3c, 1700, 8802, '2026-10-14T07:45:00.000Z', '-07:00'))

// 13-14. Aggregation: into a tote, then out onto the sales floor
const SSCC = 'urn:epc:id:sscc:0614190.1000000017'
step('aggregation: the kits into a tote', 'cornermarket', base('AggregationEvent', '2026-10-14T08:20:00.000Z', '-07:00', {
  action: 'ADD', bizStep: A.STEP.other, ...loc('backroom'), parentID: SSCC, childQuantityList: [{ epcClass: L3c, quantity: 1700, uom: 'KGM' }]
}))
step('aggregation: the kits out of the tote', 'cornermarket', base('AggregationEvent', '2026-10-14T16:00:00.000Z', '-07:00', {
  action: 'DELETE', bizStep: A.STEP.other, ...loc('floor'), parentID: SSCC, childQuantityList: [{ epcClass: L3c, quantity: 1700, uom: 'KGM' }]
}))

// 15. Receiving from a source the rule exempts, with no code: the receiver assigns one
const L4c = lgtin('0614180', '100059', 'CM-RX-0001')
step('receiving from an exempt source: the receiver assigns the code', 'cornermarket', base('ObjectEvent', '2026-10-14T09:00:00.000Z', '-07:00', {
  action: 'ADD', bizStep: A.STEP.receiving, 'fb:cte': 'receive', disposition: `${P}disp:in_progress`, ...loc('store'), quantityList: [{ epcClass: L4c, quantity: 90, uom: 'LBR' }], ilmd: { 'fb:commodity': 'Roma tomatoes' }
}))

// 16-18. Seafood: the catch, first land-based receiving, then a sale by invoice (a transaction)
const C1 = lgtin('0614170', '100022', 'TRIP-0942')
const L5c = lgtin('0614175', '100039', 'HF-285-1')
step('harvesting: the catch', 'seabird', base('ObjectEvent', '2026-10-11T21:00:00.000Z', '-08:00', {
  action: 'ADD', bizStep: A.STEP.commissioning, 'fb:cte': 'harvest', disposition: `${P}disp:active`, ...loc('sea'), quantityList: [{ epcClass: C1, quantity: 640, uom: 'KGM' }], ilmd: { 'fb:commodity': 'Atlantic cod', 'fb:variety': 'Gadus morhua', 'fb:fieldName': 'FAO 27.IVb' }
}))
step('first land-based receiving: the dock fillets the catch', 'harbourfish', base('TransformationEvent', '2026-10-12T06:00:00.000Z', '+01:00', {
  'fb:cte': 'first_land_receive', bizStep: A.STEP.receiving, disposition: `${P}disp:in_progress`, ...loc('dock'), inputQuantityList: [{ epcClass: C1, quantity: 640, uom: 'KGM' }], outputQuantityList: [{ epcClass: L5c, quantity: 410, uom: 'KGM' }]
}))
const invoice = [{ type: `${P}btt:inv`, bizTransaction: 'urn:epc:id:gdti:0614175.00003.INV-3317' }]
step('transaction: the fillets sold on invoice', 'harbourfish', base('TransactionEvent', '2026-10-12T10:00:00.000Z', '+01:00', {
  action: 'ADD', bizStep: `${P}bizstep:selling`, quantityList: [{ epcClass: L5c, quantity: 410, uom: 'KGM' }], bizTransactionList: invoice,
  sourceList: [{ type: `${P}sdt:owning_party`, source: PEOPLE.harbourfish.pgln }], destinationList: [{ type: `${P}sdt:owning_party`, destination: PEOPLE.cornermarket.pgln }]
}), { extra: [['transaction: Corner Market accepts the fillets', 'cornermarket', 'transfer', { kind: 'receive', status: 'accepted', when: '2026-10-12T10:20:00.000Z' }, (made) => ({ answers: made.event.hash })]] })

// 19. An event no row covers: the escape hatch
step('escape hatch: storing, which no row maps', 'cornermarket', base('ObjectEvent', '2026-10-14T12:00:00.000Z', '-07:00', {
  action: 'OBSERVE', bizStep: `${P}bizstep:storing`, disposition: `${P}disp:in_progress`, ...loc('backroom'), epcList: [SSCC]
}), { roundtrip: false, note: 'The raw document is kept by its hash; the way back needs the document.' })

// ---- the world after all of it: where things are, who owns them ----
const find = (n) => blocks.find((b) => b.name === n)
const lotThing = (c) => held.find((b) => b.type === 'thing' && A.jcs(b.state.marks || []).includes(c))
const L1 = lotThing(L1c), L2 = lotThing(L2c), L3 = lotThing(L3c), L4 = lotThing(L4c), L5 = lotThing(L5c), H1 = lotThing(H)
const folds = []
// `held` is 'all' (every block) or 'before the unload' (every block but the DELETE aggregation and what follows it).
const unload = blocks.findIndex((b) => b.name === 'aggregation: the kits out of the tote')
const fold = (name, op, thing, expect, heldName = 'all') => {
  const context = heldName === 'all' ? held : held.slice(0, unload)
  const got = call(op, thing, context)
  assert.deepEqual(got, expect, `${name}: ${JSON.stringify(got)}`)
  folds.push({ name, op, thing: thing.hash, held: heldName, expect })
}
const shipOf = (lot) => held.find((b) => b.type === 'transfer' && b.state.kind === 'ship' && b.refs.what.includes(lot.hash)).hash
fold('Metro Fresh owns the Fieldhouse lot once it receives it', 'ownership', L1, { owner: ids.metrofresh, transfers: [shipOf(L1)], conflict: null })
fold('Corner Market owns the kits', 'ownership', L3, { owner: ids.cornermarket, transfers: [shipOf(L3)], conflict: null })
fold('the fillets belong to Corner Market once the sale is accepted', 'ownership', L5, { owner: ids.cornermarket, transfers: [held.find((b) => b.type === 'transfer' && b.state.kind === 'transaction').hash], conflict: null })
fold('the harvest stays with the farm that made it', 'ownership', H1, { owner: ids.fieldhouse, transfers: [], conflict: null })
fold('the Fieldhouse lot is at Metro Fresh after it arrives', 'where_now', L1, [site.dc.hash])
fold('the kits, in the tote, are where the tote is', 'where_now', L3, [tote.refs.place], 'before the unload')
fold('the kits, taken out onto the sales floor, are on the sales floor', 'where_now', L3, [site.floor.hash])
fold('the tomatoes are where they were received', 'where_now', L4, [site.store.hash])

// ---- a 24-hour traceback ----
const traces = []
function trace(name, tlc, direction, what) {
  const got = A.trace(held, tlc, direction)
  assert.ok(got.rows.length, name)
  traces.push({ name, tlc, direction, expect: got, ...(what ? { note: what } : {}) })
  return got
}
const back = trace('backward from the salad kits', 'DC-SK-1001', 'backward', 'Every critical tracking event of the kits and of the lots they were made from, back to both harvests.')
assert.deepEqual(back.lots.length, 5) // kits, two packed lots, two harvests
const fwd = trace('forward from the Fieldhouse lot', 'F-285-A', 'forward', 'Where the lot went: the kits made from it and their shipment and receiving.')
assert.ok(fwd.lots.includes(L3.hash) && !fwd.lots.includes(L2.hash))
trace('forward from the Green Acres lot', 'GA-285-B', 'forward')
trace('backward from the fillets', 'HF-285-1', 'backward', 'The catch, the landing and the sale.')
trace('forward from the tomatoes', 'CM-RX-0001', 'forward', 'A lot received from an exempt source: one row, the receiver\'s own.')
// A recall: the regulator may ask for blocks whose marks match, and the holder answers inside a day.
const recall = say('recall grant: Metro Fresh to the regulator', 'metrofresh', 'grant', { kind: 'recall', answer_within: 'PT24H', marks: [{ scheme: 'tlc', value: 'F-285-A' }, { scheme: 'tlc', value: 'DC-SK-1001' }] }, { to: ids.regulator })
const filter = { marks: { scheme: 'tlc', value: 'F-285-A' } }
const pulls = [
  { name: 'a pull by lot code selects the lot', filter, block: L1, expect: true },
  { name: 'and not another farm\'s lot', filter, block: L2, expect: false },
  { name: 'and not the kits made from it (they carry their own code)', filter, block: L3, expect: false }
]
for (const p of pulls) assert.equal(call('matches', p.block, p.filter, []), p.expect, p.name)
assert.equal(call('compare_durations', 'PT24H', 'P1D', '2026-10-14T00:00:00.000Z'), 0)

// ---- every block is valid against the blocks before it, the schema held ----
for (let i = 0; i < blocks.length; i++) {
  const b = held[i]
  const wrong = fb.valid(b, held.slice(0, i))
  assert.deepEqual(wrong.map((x) => x.code), [], `${blocks[i].name}: ${JSON.stringify(wrong)}`)
}

// A shipment that leaves out the schema is refused: a closed block's fields must be declared.
const ship0 = held.find((b) => b.type === 'transfer' && b.state.kind === 'ship')
const { schema: _s, ...noSchema } = ship0.refs
const negatives = [{ name: 'a shipping transfer that does not name the profile schema is refused', block: ship0.hash, without: 'refs.schema', codes: [...new Set(fb.refusals(ship0.type, ship0.state, noSchema, held.slice(0, held.indexOf(ship0))).map((x) => x.code))] }]
assert.deepEqual(negatives[0].codes, ['undeclared_field'])
for (let i = 0; i < held.length; i++) assert.deepEqual(fb.refusals(held[i].type, held[i].state, held[i].refs, held.slice(0, i)).map((x) => x.code), [], `${blocks[i].name}: the write check`)

fs.writeFileSync(FILE, JSON.stringify({
  $comment: 'FoodBlock 1.6 profile vectors for EPCIS 2.0 and FSMA 204 (spec/profiles/foodblock-profile-epcis.md, section 9). Made by make-vectors.cjs from fixed seeds. `blocks` is every signed block in the order it was written, each valid against those before it. `events` are EPCIS 2.0 events: `blocks` names the ones the adapter makes from it (the first is the event\'s own), `before` is how many blocks existed when it was captured. Both ways must hold: the event makes those blocks (state and refs, apart from the chain fields), and the event\'s block makes the event again unless `roundtrip` is false. `folds` are door ops on the whole world; `traces` the 24-hour traceback (profile section 7); `recall` the regulator\'s grant and the pulls it allows. Test keys: never use them for anything real.',
  context: 'https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld', keys, parties: Object.fromEntries(Object.entries(PEOPLE).map(([who, p]) => [p.pgln, { signer: who, id: ids[who] }])),
  schema: schema.hash, blocks, events, folds, negatives, traces, recall: { grant: recall.hash, filter, pulls: pulls.map((p) => ({ name: p.name, block: p.block.hash, expect: p.expect })), answer_within: 'PT24H' }
}, null, 1) + '\n')
console.log(`${blocks.length} blocks, ${events.length} events, ${folds.length} folds, ${traces.length} traces -> ${path.relative(process.cwd(), FILE)}`)
