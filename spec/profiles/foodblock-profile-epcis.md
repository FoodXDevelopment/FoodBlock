# FoodBlock Profile: EPCIS 2.0 + FSMA 204

| | |
|---|---|
| **Profile id** | `foodblock-profile-epcis` |
| **Version** | 0.3 |
| **Status** | Draft, written in FoodBlock 1.6's own words |
| **Date** | 2026-10-15 |
| **License** | MIT (same as FoodBlock protocol) |

**One line:** carry GS1 EPCIS 2.0 events and the FDA Food Traceability Rule (FSMA 204, 21 CFR Part 1 Subpart S) Critical Tracking Events as ordinary FoodBlocks, with no GS1 or FSMA word in core.

## 1. Status

This is a **profile**, not a change to the protocol. Core stays as core.md says; a node that has never heard of this profile still accepts every block in it.

- **Normative for** implementers who claim `foodblock-profile-epcis`. **Informative for** everyone else.
- **Not legal advice.** Covered persons under FSMA 204 stay responsible for their records; FoodBlock carries the key data elements (KDEs).
- **Not in scope:** an EPCIS repository or its Query Interface; GS1 Digital Link; EU labelling or product-passport packs; any app.

### Decisions

1. **The kind is the CTE.** A step's `state.kind` names the Critical Tracking Event (`harvest`, `cool`, `pack`, `first_land_receive`, `ship`, `receive`, `process`). There is no separate CTE field.
2. **The lot is an instance; the TLC is a mark.** A lot is a `thing` instance of its product kind. Its Traceability Lot Code (TLC) is one of its marks, so a recall matches it exactly (modules/things.md).
3. **Parties and sites are actors and things.** They are written once and linked, never buried in an event.
4. **An escape hatch, not a path.** An EPCIS event no row below covers lands as an `observe` of kind `epcis`.

## 2. Core and profile

| Concern | Core | This profile |
|---|---|---|
| Block, types, verbs, canonical form, hashes | As core.md | Unchanged |
| Kinds (`state.kind`) | Open labels | Fixes the labels in §4 |
| Marks `[{ scheme, value }]` | Any scheme | Fixes the schemes in §3 |
| Fields beyond the base | Declared by a schema | Declares the KDE fields in §5 in profile schemas (things of kind schema, `target` as in §4) |
| Business step, disposition | Not defined | CBV URIs in `biz_step`, `disposition` |
| Round trip to EPCIS | Not defined | Optional `epcis_id`, `epcis_type`, `action` |

An EPCIS event id is not a FoodBlock id: the id of a block is its hash.

## 3. Things, actors and marks

- **Covered person.** A business is a circle (an `actor` of kind circle). Every CTE block is signed `as` it (`refs.as`), by a member who holds a signing role.
- **Site.** Farm, field, cooler, packhouse, distribution centre, vehicle: each is a `thing` of kind place, with `state.where`, a `name`, and its FSMA location description (§5). Its GLN is a mark `{ scheme: "gln", value }`. A site inside another (a field on a farm, a vehicle at a dock) uses `refs.place`.
- **Product kind.** A `thing` kind (spinach, flour) with its GTIN as a mark `{ scheme: "gtin", value }`.
- **Lot.** A `thing` instance: `refs.of` the product kind, `state.lot` its batch name, `state.amount` or `state.pack` its size, `state.use_by`. Its marks:
  - `{ scheme: "tlc", value }`: the Traceability Lot Code;
  - `{ scheme: "tlc_source", value }`: the GLN, or FDA registration number, of the place that assigned it;
  - `{ scheme: "gtin", value }`, `{ scheme: "sscc", value }`, `{ scheme: "sgtin", value }`: any other identifiers the lot carries.
- **Containment.** An EPCIS parent and children (case on pallet, pallet in truck) are `refs.place`: what is inside moves with its container (modules/things.md).
- **Traceability plan.** An `observe` of kind `traceability_plan` by the covered person: `state.text` names the plan document by its hash.

## 4. Events

### 4.1 FSMA 204 Critical Tracking Events

| CTE | Block | Kind | TLC | Recommended `biz_step` (CBV 2.0) |
|---|---|---|---|---|
| Harvesting | `transform`, no inputs; its output is the harvested instance, `refs.place` the field or farm; the author is the first owner | `harvest` | none assigned | `urn:epcglobal:cbv:bizstep:commissioning` (flag 1) |
| Cooling before initial packing | `transform` that keeps: `refs.subject` the instance, nothing consumed | `cool` | kept | `urn:epcglobal:cbv:bizstep:other` (flag 2) |
| Initial packing (not fishing-vessel food) | `transform`: inputs in `derives_from`; outputs are the packed lots, each naming it | `pack` | **assigned** on the output | `urn:epcglobal:cbv:bizstep:packing` |
| First land-based receiving (fishing vessel) | `transform` by the receiver: input the landed instance, output the lot | `first_land_receive` | **assigned** on the output | `urn:epcglobal:cbv:bizstep:receiving` |
| Shipping | `transfer`: `refs.what` the lot, `refs.to_owner` the receiving party, `refs.to_place` ship-to, `refs.to_holder` the carrier, `refs.place` ship-from | `ship` | kept | `urn:epcglobal:cbv:bizstep:shipping` |
| Receiving | the receiver's `answers` of the shipping transfer, `accepted`, with `state.when` and `refs.place` the receiving site; then the receiver's own `transfer` of kind `arrive` (`refs.what` the lot, `refs.to_place` the site), because only the owner's move changes where the lot is (folds.md, Ownership) | `receive` | kept | `urn:epcglobal:cbv:bizstep:receiving` |
| Transformation | `transform` with `derives_from` inputs and new lot outputs | `process` | **new TLC** on each output | `commissioning` or `creating_class_instance` (flag 3) |

Flags (CBV and GS1 US guidance, as of the *EPCIS Recommendations for FSMA 204*, Release 2.0, May 2025):
1. CBV 2.0 has no `harvesting` business step. Use `commissioning`; do not invent `…:bizstep:harvesting`.
2. CBV 2.0 has no cooling step; the guidance uses `other`.
3. The step depends on the process. An adapter preserves the source event's `biz_step` when importing.

A receiving from an exempt source (restaurant and retail food establishment exceptions in the rule) that has no TLC is a `transform` of kind `receive` by the receiver that assigns one, with no inputs, like harvesting. Its kind is `receive` like the receiver's answer, but its type is `transform`.

### 4.2 EPCIS 2.0 constructs

| EPCIS 2.0 | 1.6 |
|---|---|
| ObjectEvent | The block its `biz_step` names (§4.1). Anything else: an `observe` about the lot, `refs.subject` the instance |
| AggregationEvent ADD / DELETE | A `transfer` with `refs.to_place` the container (ADD), or out of it (DELETE) |
| TransactionEvent | The `transfer` it records; its business transactions in `biz_transactions` |
| TransformationEvent | `transform`, inputs in `derives_from` |
| AssociationEvent | An `observe` that links two things by `refs.subject` and `refs.place` |
| SensorElement | An `observe` reading: `amount`, `accuracy`, `coverage`, the sensor named in `refs.from`, the shipment or lot in `refs.subject`. Dense streams are linked by their Merkle root (modules/things.md, Truth) |
| ErrorDeclaration | The author's `updates` of the wrong event; for another author's event, a `defeats` of it, then a corrected block |
| eventTime, eventTimeZoneOffset | `state.when`, `state.tz` |
| recordTime | `state.at` (when it was said) |
| bizStep, disposition, persistentDisposition | `state.biz_step`, `state.disposition`, `state.persistent_disposition` |
| readPoint, bizLocation | `refs.place`, and `where_now` (a fold) for where the lot is after |
| epcList, quantityList | Instances by `refs.what`; a quantity as `state.amount` of an instance (a part keeps its marks) |
| eventID | `state.epcis_id`, only to round trip |
| epcList (SSCC, SGTIN), parentID, childEPCs | Instances and containers found by mark: the URN is a mark `{ scheme: "sscc" or "sgtin", value }` |
| quantityList, inputQuantityList, outputQuantityList, childQuantityList | Lots found by their `lgtin` mark; see §4.3 |
| sourceList, destinationList | `owning_party` is the author or `refs.to_owner`; `possessing_party` is `refs.to_holder`; `location` is `refs.place` or `refs.to_place` |
| bizTransactionList | `state.biz_transactions` |
| ILMD | The lot's data (`lot`, `use_by`, marks) on the output instance |

### 4.3 The adapter

The mapping is mechanical, so two adapters give the same blocks. `epcis/adapter.cjs` is the reference; `epcis/vectors.json` is what any other must reproduce (§9).

**What an adapter holds.** The blocks it reads (sites, product kinds, lots, containers) and a directory of parties, PGLN URN to actor id. The directory is the adapter's own configuration, never a block. Everything else is found by marks:
- a site is a `thing` of kind `place` with `{ scheme: "sgln", value: <SGLN URN> }` and `{ scheme: "gln", value: <GLN-13> }`;
- a product kind is a `thing` of kind `product` with `{ scheme: "gtin", value: <GTIN-14> }`. The GTIN of an LGTIN class is its indicator digit, company prefix and the rest of the item reference, then the GS1 check digit;
- a lot is an instance with `{ scheme: "lgtin", value: <the LGTIN class URN> }`. Its `state.lot` and, where §6 assigns one, its TLC mark are the lot part of that URN (everything after the item reference); `tlc_source` is the GLN of the site where the event happened;
- a container is a `thing` with an `sscc` mark.

**Which CTE an event is.** By event type and business step (§4.1) where they name it. Where CBV has no step for a CTE, or two CTEs share one, the event carries the profile's own extension `"fb:cte"` (`harvest`, `cool`, `first_land_receive`, `receive`). An event no row covers becomes the escape hatch.

| Event | Blocks |
|---|---|
| ObjectEvent ADD, `fb:cte` `harvest` or `receive` | A `transform` of that kind with no inputs, `refs.place` the site. Each `quantityList` item is a lot (`thing`) that names the transform in `derives_from`. `ilmd` `fb:commodity`, `fb:variety`, `fb:fieldName` and `cbvmda:itemExpirationDate` become `commodity`, `variety`, `field_name` and `use_by` on the lot. A harvest lot has no TLC mark; a `receive` lot is assigned one |
| ObjectEvent, `fb:cte` `cool` | A keep: a `transform` of kind `cool`, `refs.subject` the lot |
| ObjectEvent, shipping | A `transfer` of kind `ship` (§4.1). `state.amount` is written only when the quantity is less than the lot's |
| ObjectEvent, receiving | If a held shipment carries the same lots (and the same `biz_transactions`): the answer and the `arrive` transfer. Otherwise the escape hatch |
| TransformationEvent: packing, receiving (`fb:cte` `first_land_receive`) or commissioning | A `transform` of kind `pack`, `first_land_receive` or `process`, the inputs in `derives_from`; each output is a lot with its TLC |
| AggregationEvent | A `transfer` of kind `aggregate`: `refs.what` the children, `refs.subject` the container, `refs.to_place` the container (ADD) or the site (DELETE) |
| TransactionEvent | A `transfer` of kind `transaction`: `refs.what` the lots, `refs.to_owner` the destination owning party, `biz_transactions`. The new owner's `accepted` answer is the receiver's own block |

In every block, `when`, `tz`, `biz_step`, `disposition`, `action`, `epcis_id` and `biz_transactions` carry the event's own fields; `state.at` is `recordTime`; `refs.place` is the `readPoint`. The way back writes `bizLocation` equal to `readPoint`, except on shipping, and lists quantities in ascending `epcClass` order. A closed block (every `transfer`) names the profile's schema in `refs.schema`: a `thing` of kind `schema`, `target` `transfer`, declaring `biz_step`, `disposition`, `persistent_disposition`, `tz`, `action`, `epcis_id`, `biz_transactions` and `reference_document`. Units: UN/CEFACT `KGM`, `LBR` and `C62` are UCUM `kg`, `[lb_av]` and `{each}`.

An `observe` of kind `epcis` holds any other event: `state.epcis_type`, `state.biz_step`, `state.when`, and `state.raw`, the hash of the raw document. Prefer a row above whenever one applies.

## 5. Key data elements

KDEs are `state` fields the profile's schemas declare. Dates and times are the 1.6 time form; numbers are decimal strings; quantities are `{ value, unit }` with a UCUM unit.

| Field | Meaning |
|---|---|
| `biz_step`, `disposition`, `persistent_disposition` | CBV URIs (full URNs; short names only in a vocabulary map, expanded on export) |
| `tz` | EPCIS eventTimeZoneOffset (`+01:00`) |
| `action` | `ADD`, `OBSERVE` or `DELETE`, for round trip |
| `epcis_type`, `epcis_id` | For round trip, optional |
| `product_description` | FSMA product description |
| `reference_document` | `{ type, number }`: bill of lading, work order, field tag |
| `biz_transactions` | `[{ type, id }]` with CBV transaction-type URIs |
| `commodity`, `variety`, `field_name` | Harvest KDEs |

The date a CTE took place is `state.when`. The location is `refs.place`. The quantity and unit are `state.amount`, on the instance or the transfer. The TLC and its source are the lot's marks, so a ship or receive block carries them by naming the lot. A reader gets them from the fold, or an exporter copies them into the FDA's sortable spreadsheet.

**FSMA location description** (21 CFR §1.1310) is data on the site thing: `name`, `phone`, `address` (`line1`, `city`, `region`, `postal`, `country`), `where`, and the GLN mark.

## 6. TLC rules

1. The TLC is a mark on the lot instance, written when the lot is made.
2. A TLC is assigned only in `pack`, `first_land_receive`, `process`, and `receive` from an exempt source that has none. Other CTEs keep the TLC by naming the lot, and never write a new one.
3. The `tlc_source` mark names the place that assigned the code.
4. A lot's data cannot change: a correction is an `updates` of the lot by its author. CTE blocks name the lot by hash.

## 7. Tracing and recall

- **Forward.** Start from the instances whose marks match the TLC exactly. Follow `derives_from` to what was made from them (each output carries its own new TLC), `refs.what` to where they were shipped, and `refs.to_place` to the container they were put in.
- **Backward.** From a received lot, follow the `answers` to the shipping transfer, then `derives_from` to its inputs.
- **The record.** The CTE blocks that name any lot reached, one row each, in time order: CTE, TLC, TLC source, product, date, quantity and unit, location (GLN), ship-to, the party that signed, the business transactions, and the block. `trace` in the adapter is exact.
- **Whose records.** Each covered person holds their own CTE blocks. Sealed blocks show only their public headers, so a recall asks each holder, who answers for the blocks they hold. The regulator recall grant (tax-recall.md) lets a named authority ask with a 24-hour answer time.
- **The spreadsheet.** The FDA's 24-hour sortable record is an export from these folds, never a block.

## 8. Conformance

An implementation claims `foodblock-profile-epcis` when:
- core is intact, and every block passes the write check;
- the lot is an instance with its TLC as a mark, and a CTE uses the kind in §4.1;
- it reproduces `epcis/vectors.json` (§9): the same blocks from each event, the same event from each block;
- the TLC rules in §6 hold;
- `biz_step` and `disposition` are CBV URIs when it claims CBV-compatible export, with no invented `urn:epcglobal:cbv:` values;
- a site used as a FSMA location carries its location description.

## 9. Vectors

`epcis/vectors.json` holds a small supply chain of leafy greens and cod: 61 signed blocks, each valid and passing the write check against those before it. `node spec/profiles/epcis/run.cjs` checks it; `make-vectors.cjs` makes it.

- **Round trips (19 events).** Each EPCIS 2.0 event is turned into the recorded blocks, and the recorded block into the same event. They cover harvesting, cooling, initial packing, first land-based receiving, shipping, receiving, transformation, receiving from an exempt source, aggregation (ADD and DELETE), a transaction on invoice, and the escape hatch (which cannot round trip: it keeps only the document's hash).
- **Folds.** `ownership` and `where_now` over the whole world: the receiver owns the lot after it accepts, a lot in a tote is where the tote is, then on the sales floor once taken out.
- **The 24-hour traceback.** Five queries by lot code, forward and backward, each with the lots reached and the rows of the sortable record; and the holder's `recall` grant (`answer_within` `PT24H`, which is `P1D`) with the pull filter by mark that selects the lot and not another's.
- **A refusal.** A shipment that does not name the schema is refused for its undeclared fields.

The five EPCIS vectors in `test/vectors.json` (section `legacy-read`) were written before 1.6. They are 0.x data: the converter (legacy/converter.md) turns them into 1.6 blocks, and they are not 1.6 examples.

Not yet vectored: AssociationEvent, SensorElement, ErrorDeclaration, `persistent_disposition`, and a covered person that is a circle.

## 10. Open items

1. **Harvest and cooling steps.** If CBV adds dedicated business steps, adopt them as vocabulary; the kind does not change.
2. **Transformation step.** `commissioning` against `creating_class_instance` is process-dependent.
3. **GS1 Digital Link.** Out of scope; a mark scheme could carry it later.
4. **Part of a lot in a transform.** Naming the amount of an input a transform uses is open in protocol.md.
5. **Vocabulary map.** The short-name to CBV-URI map is still to be written. The adapter and the fixtures are written; the schema is a block in the vectors, not yet published.
6. **Where a lot is after it is sold.** Ownership moves when the receiver accepts, but the place moves only by the owner's own transfer, so a receiver writes an `arrive`. If a later fold lets the accepting answer carry the place, `arrive` goes.

## 11. Sources

| Source | Use |
|---|---|
| [EPCIS 2.0](https://ref.gs1.org/standards/epcis/2.0.0/) | Event types and dimensions |
| [CBV 2.0](https://ref.gs1.org/standards/cbv/2.0.0/) | Business steps, dispositions, transaction types |
| [FDA FSMA Food Traceability Rule, CTEs and KDEs (2024-05-20)](https://www.fda.gov/files/food/published/FSMA%20Rule%20for%20Food%20Traceability%20-%202024-0520-CTEs-KDEs.pdf) | CTE and KDE lists |
| [21 CFR Part 1 Subpart S](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-S) | Definitions and record rules |
| GS1 US *EPCIS Recommendations for FSMA 204 Critical Tracking Events* (Release 2.0, May 2025) | Cooling is `other`; produce CTE wiring |
