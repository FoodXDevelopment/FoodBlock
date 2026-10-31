// The EPCIS 2.0 <-> FoodBlock reference adapter (spec/profiles/foodblock-profile-epcis.md, section 4). Pure mapping:
// it reads and writes the JSON of an EPCIS event and the { type, state, refs } of a block. It signs nothing and hashes
// nothing but the raw event (escape hatch). A party directory (`parties`: PGLN URN -> actor id) is the adapter's own
// configuration; sites, lots, containers and product kinds are found in the blocks held, by their marks.
//
//   fromEvent(event, { held, parties, me, schema }) -> [draft]   the blocks an event becomes, the event's own block first
//   toEvent(block, { held, parties })               -> event     the event a block is
//   trace(held, tlc, direction)                     -> { lots, blocks, rows }   forward or backward from a lot code
//
// A draft is { role, type, state, refs, after? }; a ref written "$role" is the hash of the earlier draft of that role.
const crypto = require('crypto')

const PREFIX = 'urn:epcglobal:cbv:'
const STEP = { commissioning: `${PREFIX}bizstep:commissioning`, other: `${PREFIX}bizstep:other`, packing: `${PREFIX}bizstep:packing`, shipping: `${PREFIX}bizstep:shipping`, receiving: `${PREFIX}bizstep:receiving` }
const UOM = { KGM: 'kg', LBR: '[lb_av]', C62: '{each}' }
const UOM_BACK = Object.fromEntries(Object.entries(UOM).map(([k, v]) => [v, k]))
const ILMD = { 'fb:commodity': 'commodity', 'fb:variety': 'variety', 'fb:fieldName': 'field_name', 'cbvmda:itemExpirationDate': 'use_by' }
const ILMD_BACK = Object.fromEntries(Object.entries(ILMD).map(([k, v]) => [v, k]))
const sorted = (list) => [...new Set(list)].sort()
const list = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x])
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const jcs = (v) => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`)

// ---- identifiers ----
// An EPC URN names its scheme: urn:epc:id:sscc:..., urn:epc:class:lgtin:...
const schemeOf = (urn) => String(urn).split(':')[3]
// The lot part of an LGTIN: everything after the company prefix and the item reference.
const lotOf = (lgtin) => String(lgtin).split(':').pop().split('.').slice(2).join('.')
// GS1 mod-10 check digit of a digit string (the digits before the check digit).
const checkDigit = (digits) => (10 - ([...digits].reverse().reduce((sum, d, i) => sum + Number(d) * (i % 2 === 0 ? 3 : 1), 0) % 10)) % 10
// The GTIN-14 an LGTIN class names: indicator, company prefix, the rest of the item reference, check digit.
function gtinOf(lgtin) {
  const [prefix, item] = String(lgtin).split(':').pop().split('.')
  const body = item[0] + prefix + item.slice(1)
  return body + checkDigit(body)
}

// ---- finding what is held ----
const marksOf = (b) => (b.state && b.state.marks) || []
const hasMark = (b, scheme, value) => marksOf(b).some((m) => m.scheme === scheme && m.value === value)
const byMark = (held, scheme, value) => held.find((b) => hasMark(b, scheme, value))
const markValue = (b, scheme) => (marksOf(b).find((m) => m.scheme === scheme) || {}).value
const need = (what, found) => { if (!found) throw new Error(`the adapter holds no ${what}`); return found }
const siteOf = (held, sgln) => (sgln === undefined ? undefined : need(`site ${sgln}`, byMark(held, 'sgln', sgln)).hash)
const sglnOfSite = (held, hash) => markValue(need(`site ${hash}`, held.find((b) => b.hash === hash)), 'sgln')
const actorOf = (parties, pgln) => need(`party ${pgln}`, parties[pgln])
const pglnOfActor = (parties, id) => need(`directory entry for ${id}`, Object.keys(parties).find((p) => parties[p] === id))
const kindOfGtin = (held, lgtin) => need(`product kind ${gtinOf(lgtin)}`, held.find((b) => b.type === 'thing' && b.state.kind === 'product' && hasMark(b, 'gtin', gtinOf(lgtin)))).hash
const quantityOf = (item) => ({ value: String(item.quantity), unit: need(`unit ${item.uom}`, UOM[item.uom]) })
const lotItem = (held, item) => ({ lgtin: item.epcClass, qty: quantityOf(item), thing: need(`lot ${item.epcClass}`, byMark(held, 'lgtin', item.epcClass)) })
const transactionsOf = (event) => (event.bizTransactionList ? { biz_transactions: event.bizTransactionList.map((t) => ({ type: t.type, id: t.bizTransaction })) } : {})

function common(event) {
  return {
    when: event.eventTime, tz: event.eventTimeZoneOffset,
    ...(event.bizStep ? { biz_step: event.bizStep } : {}), ...(event.disposition ? { disposition: event.disposition } : {}),
    ...(event.action ? { action: event.action } : {}), ...(event.eventID ? { epcis_id: event.eventID } : {}), ...transactionsOf(event)
  }
}

// The critical tracking event an event is, when its type and business step name it; else its `fb:cte` (the profile's
// own extension, written where CBV has no step: harvest, cooling, and the two receivings that assign a code).
function cteOf(event) {
  const t = event.type, step = event.bizStep
  if (event['fb:cte']) return event['fb:cte']
  if (t === 'TransformationEvent') return step === STEP.packing ? 'pack' : step === STEP.commissioning ? 'process' : undefined
  if (t === 'AggregationEvent') return 'aggregate'
  if (t === 'TransactionEvent') return 'transaction'
  if (t === 'ObjectEvent') return step === STEP.shipping ? 'ship' : step === STEP.receiving ? 'receive' : undefined
  return undefined
}
const ASSIGNS = new Set(['pack', 'first_land_receive', 'process', 'first_receive'])

// A lot an event makes: the instance, with the marks the lot carries.
function outputDraft(held, item, role, cteKind, event, place, ilmd) {
  const at = event.recordTime
  const kind = kindOfGtin(held, item.epcClass)
  const marks = [{ scheme: 'lgtin', value: item.epcClass }]
  if (ASSIGNS.has(cteKind)) marks.push({ scheme: 'tlc', value: lotOf(item.epcClass) }, { scheme: 'tlc_source', value: markValue(held.find((b) => b.hash === place), 'gln') })
  const data = {}
  for (const [k, v] of Object.entries(ilmd || {})) if (ILMD[k]) data[ILMD[k]] = v
  return { role, type: 'thing', state: { lot: lotOf(item.epcClass), amount: quantityOf(item), marks, ...data, ...(at ? { at } : {}) }, refs: { of: kind, derives_from: ['$event'], place } }
}

function fromEvent(event, ctx) {
  const { held, parties, schema } = ctx
  const cte = cteOf(event)
  const place = siteOf(held, (event.readPoint || event.bizLocation || {}).id)
  const at = event.recordTime
  const base = (type, state, refs, extra = {}) => ({ role: 'event', type, state: { ...state, ...(at ? { at } : {}) }, refs, ...extra })
  // harvest, and the receiving from an exempt source, are the events that say so themselves: `fb:cte` alone (profile 4.1, 4.3)
  const own = event['fb:cte']
  if (event.type === 'ObjectEvent' && (own === 'harvest' || own === 'first_receive')) {
    const out = list(event.quantityList).map((item, i) => outputDraft(held, item, `out${i}`, own, event, place, event.ilmd))
    return [base('transform', { kind: own, ...common(event) }, { place }), ...out]
  }
  if (event.type === 'ObjectEvent' && cte === 'cool') {
    return [base('transform', { kind: 'cool', ...common(event) }, { subject: lotItem(held, event.quantityList[0]).thing.hash, place })]
  }
  if (event.type === 'ObjectEvent' && cte === 'ship') {
    const lots = list(event.quantityList).map((i) => lotItem(held, i))
    const dest = (type) => (event.destinationList || []).find((x) => x.type === `${PREFIX}sdt:${type}`)
    const refs = { what: sorted(lots.map((l) => l.thing.hash)), to_owner: actorOf(parties, dest('owning_party').destination), place, schema }
    if (dest('possessing_party')) refs.to_holder = actorOf(parties, dest('possessing_party').destination)
    if (dest('location')) refs.to_place = siteOf(held, dest('location').destination)
    const state = { kind: 'ship', ...common(event) }
    if (lots.length === 1 && lots[0].qty.value !== lots[0].thing.state.amount.value) state.amount = lots[0].qty
    return [base('transfer', state, refs)]
  }
  if (event.type === 'ObjectEvent' && cte === 'receive') {
    const lots = list(event.quantityList).map((i) => lotItem(held, i)).map((l) => l.thing.hash)
    const ships = held.filter((b) => b.type === 'transfer' && b.state.kind === 'ship' && lots.every((l) => list(b.refs.what).includes(l)))
    const same = ships.filter((b) => jcs(b.state.biz_transactions || null) === jcs(common(event).biz_transactions || null))
    const ship = (same.length ? same : ships)[0]
    if (!ship) return [escape(event, place, at)]
    // The answer moves ownership (folds.md); the new owner's own move puts the lot at the site, so where_now follows.
    const arrive = { role: 'arrive', type: 'transfer', state: { kind: 'arrive', when: event.eventTime, tz: event.eventTimeZoneOffset, ...(at ? { at } : {}) }, refs: { what: sorted(lots), to_place: place, place, schema }, after: ['$event'] }
    return [base('transfer', { kind: 'receive', status: 'accepted', ...common(event) }, { answers: ship.hash, place, schema }, { after: [ship.hash] }), arrive]
  }
  if (event.type === 'TransformationEvent' && ['pack', 'first_land_receive', 'process'].includes(cte)) {
    const inputs = sorted(list(event.inputQuantityList).map((i) => lotItem(held, i).thing.hash))
    const out = list(event.outputQuantityList).map((item, i) => outputDraft(held, item, `out${i}`, cte, event, place, event.ilmd))
    return [base('transform', { kind: cte, ...common(event) }, { derives_from: inputs, place }), ...out]
  }
  if (event.type === 'AggregationEvent') {
    const parent = need(`container ${event.parentID}`, byMark(held, schemeOf(event.parentID), event.parentID))
    const kids = [...list(event.childEPCs).map((e) => need(`item ${e}`, byMark(held, schemeOf(e), e))), ...list(event.childQuantityList).map((i) => lotItem(held, i).thing)]
    const refs = { what: sorted(kids.map((k) => k.hash)), subject: parent.hash, to_place: event.action === 'ADD' ? parent.hash : place, place, schema }
    return [base('transfer', { kind: 'aggregate', ...common(event) }, refs)]
  }
  if (event.type === 'TransactionEvent') {
    const lots = list(event.quantityList).map((i) => lotItem(held, i).thing.hash)
    const dest = (event.destinationList || []).find((x) => x.type === `${PREFIX}sdt:owning_party`)
    return [base('transfer', { kind: 'transaction', ...common(event) }, { what: sorted(lots), to_owner: actorOf(parties, dest.destination), schema })]
  }
  return [escape(event, place, at)]
}
// Any other event: an observe of kind epcis that holds the hash of the raw document (the profile's escape hatch).
function escape(event, place, at) {
  return { role: 'event', type: 'observe', state: { kind: 'epcis', epcis_type: event.type, ...(event.bizStep ? { biz_step: event.bizStep } : {}), when: event.eventTime, raw: sha256(jcs(event)), ...(at ? { at } : {}) }, refs: place ? { place } : {} }
}

// ---- blocks to events ----
const lotsFrom = (held, hashes) => hashes.map((h) => need(`lot ${h}`, held.find((b) => b.hash === h)))
const byClass = (a, b) => (a.epcClass < b.epcClass ? -1 : a.epcClass > b.epcClass ? 1 : 0)
const quantityItem = (lot, amount = lot.state.amount) => ({ epcClass: markValue(lot, 'lgtin'), quantity: Number(amount.value), uom: need(`UCUM ${amount.unit}`, UOM_BACK[amount.unit]) })
function ilmdOf(thing) {
  const out = {}
  for (const [k, v] of Object.entries(thing.state)) if (ILMD_BACK[k]) out[ILMD_BACK[k]] = v
  return Object.keys(out).length ? out : undefined
}
function envelope(block, type, extra) {
  const s = block.state
  const event = { type, eventTime: s.when, eventTimeZoneOffset: s.tz, ...(s.at ? { recordTime: s.at } : {}), ...(s.epcis_id ? { eventID: s.epcis_id } : {}) }
  if (s.action) event.action = s.action
  if (s.biz_step) event.bizStep = s.biz_step
  if (s.disposition) event.disposition = s.disposition
  return Object.assign(event, extra)
}
const transactionList = (s) => (s.biz_transactions ? { bizTransactionList: s.biz_transactions.map((t) => ({ type: t.type, bizTransaction: t.id })) } : {})
const point = (held, place) => (place ? { readPoint: { id: sglnOfSite(held, place) }, bizLocation: { id: sglnOfSite(held, place) } } : {})

function toEvent(block, ctx) {
  const { held, parties } = ctx
  const s = block.state, r = block.refs
  const made = () => held.filter((b) => b.type === 'thing' && list(b.refs.derives_from).includes(block.hash))
  if (block.type === 'transform' && (s.kind === 'harvest' || s.kind === 'first_receive')) {
    const outs = made()
    const ilmd = ilmdOf(outs[0])
    return envelope(block, 'ObjectEvent', { 'fb:cte': s.kind, ...point(held, r.place), quantityList: outs.map((o) => quantityItem(o)).sort(byClass), ...(ilmd ? { ilmd } : {}) })
  }
  if (block.type === 'transform' && s.kind === 'cool') {
    const lot = need('lot', held.find((b) => b.hash === r.subject))
    return envelope(block, 'ObjectEvent', { 'fb:cte': 'cool', ...point(held, r.place), quantityList: [quantityItem(lot)] })
  }
  if (block.type === 'transform' && ['pack', 'first_land_receive', 'process'].includes(s.kind)) {
    const outs = made(), ins = lotsFrom(held, list(r.derives_from))
    const ilmd = ilmdOf(outs[0])
    return envelope(block, 'TransformationEvent', { ...(s.kind === 'first_land_receive' ? { 'fb:cte': 'first_land_receive' } : {}), ...point(held, r.place), inputQuantityList: ins.map((l) => quantityItem(l)).sort(byClass), outputQuantityList: outs.map((o) => quantityItem(o)).sort(byClass), ...(ilmd ? { ilmd } : {}) })
  }
  if (block.type === 'transfer' && s.kind === 'ship') {
    const lots = lotsFrom(held, list(r.what))
    const dest = [{ type: `${PREFIX}sdt:owning_party`, destination: pglnOfActor(parties, r.to_owner) }]
    if (r.to_holder) dest.push({ type: `${PREFIX}sdt:possessing_party`, destination: pglnOfActor(parties, r.to_holder) })
    if (r.to_place) dest.push({ type: `${PREFIX}sdt:location`, destination: sglnOfSite(held, r.to_place) })
    return envelope(block, 'ObjectEvent', { readPoint: { id: sglnOfSite(held, r.place) }, quantityList: lots.map((l) => quantityItem(l, s.amount || l.state.amount)).sort(byClass), ...transactionList(s), sourceList: [{ type: `${PREFIX}sdt:owning_party`, source: pglnOfActor(parties, block.refs.author) }, { type: `${PREFIX}sdt:location`, source: sglnOfSite(held, r.place) }], destinationList: dest })
  }
  if (block.type === 'transfer' && s.kind === 'receive') {
    const ship = need('shipment', held.find((b) => b.hash === r.answers))
    const lots = lotsFrom(held, list(ship.refs.what))
    return envelope(block, 'ObjectEvent', { ...point(held, r.place), quantityList: lots.map((l) => quantityItem(l, ship.state.amount || l.state.amount)), ...transactionList(s), sourceList: [{ type: `${PREFIX}sdt:owning_party`, source: pglnOfActor(parties, ship.refs.author) }], destinationList: [{ type: `${PREFIX}sdt:owning_party`, destination: pglnOfActor(parties, block.refs.author) }] })
  }
  if (block.type === 'transfer' && s.kind === 'aggregate') {
    const kids = lotsFrom(held, list(r.what))
    const tote = need('container', held.find((b) => b.hash === r.subject))
    const units = kids.filter((k) => markValue(k, 'lgtin')), plain = kids.filter((k) => !markValue(k, 'lgtin'))
    return envelope(block, 'AggregationEvent', { ...point(held, r.place), parentID: markValue(tote, 'sscc'), ...(plain.length ? { childEPCs: plain.map((k) => marksOf(k)[0].value) } : {}), ...(units.length ? { childQuantityList: units.map((u) => quantityItem(u)).sort(byClass) } : {}) })
  }
  if (block.type === 'transfer' && s.kind === 'transaction') {
    const lots = lotsFrom(held, list(r.what))
    return envelope(block, 'TransactionEvent', { quantityList: lots.map((l) => quantityItem(l)).sort(byClass), ...transactionList(s), sourceList: [{ type: `${PREFIX}sdt:owning_party`, source: pglnOfActor(parties, block.refs.author) }], destinationList: [{ type: `${PREFIX}sdt:owning_party`, destination: pglnOfActor(parties, r.to_owner) }] })
  }
  throw new Error(`no EPCIS event for ${block.type} ${s.kind}`)
}

// ---- tracing (profile section 7) ----
// From a lot code: the lots reached, the critical tracking event blocks that name any of them, and the rows of the FDA's
// sortable record (one per block, in time order). Forward, a lot reaches what is made from it and what it is put in;
// backward, what it was made from.
function trace(held, tlc, direction) {
  const byHash = new Map(held.map((b) => [b.hash, b]))
  const lots = new Set(held.filter((b) => b.type === 'thing' && hasMark(b, 'tlc', tlc)).map((b) => b.hash))
  const isCte = (b) => (b.type === 'transform' || b.type === 'transfer') && b.state.kind && b.state.kind !== 'arrive' && (!b.state.status || b.state.kind === 'receive')
  const ctes = held.filter(isCte)
  // The things a block names: what it moves, keeps, uses or makes.
  const named = (b) => [...list(b.refs.what), ...list(b.refs.subject), ...(b.refs.answers && byHash.get(b.refs.answers) ? list(byHash.get(b.refs.answers).refs.what) : []), ...list(b.refs.derives_from), ...held.filter((t) => t.type === 'thing' && list(t.refs.derives_from).includes(b.hash)).map((t) => t.hash)]
  for (let grew = true; grew;) {
    grew = false
    const add = (h) => { if (h && byHash.has(h) && !lots.has(h)) { lots.add(h); grew = true } }
    for (const b of ctes) {
      if (!named(b).some((h) => lots.has(h))) continue
      if (direction === 'backward') {
        for (const x of list(b.refs.derives_from)) add(x)
      } else if (b.type === 'transform') {
        for (const t of held.filter((t) => t.type === 'thing' && list(t.refs.derives_from).includes(b.hash))) add(t.hash)
      }
      if (direction === 'forward' && b.type === 'transfer' && b.refs.to_place && byHash.get(b.refs.to_place).type === 'thing' && byHash.get(b.refs.to_place).state.kind !== 'place') add(b.refs.to_place)
    }
  }
  const siteGln = (h) => (byHash.get(h) ? markValue(byHash.get(h), 'gln') : undefined)
  const rows = ctes.filter((b) => named(b).some((h) => lots.has(h))).map((b) => {
    const things = named(b).filter((h) => lots.has(h)).map((h) => byHash.get(h))
    const row = {
      cte: b.state.kind, tlc: sorted(things.map((t) => markValue(t, 'tlc')).filter(Boolean)), tlc_source: sorted(things.map((t) => markValue(t, 'tlc_source')).filter(Boolean)),
      product: sorted(things.map((t) => (byHash.get(t.refs.of) || { state: {} }).state.name).filter(Boolean)), when: b.state.when,
      quantity: things.length === 1 ? (b.state.amount || things[0].state.amount) : undefined, location: siteGln(b.refs.place), party: b.refs.author, block: b.hash
    }
    if (b.refs.to_place && byHash.get(b.refs.to_place).state.kind === 'place') row.ship_to = siteGln(b.refs.to_place)
    if (b.state.biz_transactions) row.reference = b.state.biz_transactions.map((t) => t.id)
    return JSON.parse(JSON.stringify(row))
  }).sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a.block < b.block ? -1 : 1))
  return { lots: [...lots].sort(), blocks: rows.map((r) => r.block), rows }
}

module.exports = { fromEvent, toEvent, trace, gtinOf, lotOf, checkDigit, STEP, PREFIX, jcs, sha256 }
