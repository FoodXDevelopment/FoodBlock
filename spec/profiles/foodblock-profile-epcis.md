# FoodBlock Profile: EPCIS 2.0 + FSMA 204

| | |
|---|---|
| **Profile id** | `foodblock-profile-epcis` |
| **Version** | 0.2 |
| **Status** | Draft, written in FoodBlock 1.6's own words |
| **Date** | 2026-10-15 |
| **License** | MIT (same as FoodBlock protocol) |

**One line:** carry GS1 EPCIS 2.0 events and the FDA Food Traceability Rule (FSMA 204, 21 CFR Part 1 Subpart S) Critical Tracking Events as ordinary FoodBlocks, with no GS1 or FSMA word in core.

## 1. Status

This is a **profile**, not a change to the protocol. Core stays as protocol.md says; a node that has never heard of this profile still accepts every block in it.

- **Normative for** implementers who claim `foodblock-profile-epcis`. **Informative for** everyone else.
- **Not legal advice.** Covered persons under FSMA 204 stay responsible for their records; FoodBlock carries the key data elements (KDEs).
- **Not in scope:** an EPCIS repository or its Query Interface; GS1 Digital Link; EU labelling or product-passport packs; any app.

### Decisions

1. **The kind is the CTE.** A step's `state.kind` names the Critical Tracking Event (`harvest`, `cool`, `pack`, `first_land_receive`, `ship`, `receive`, `process`). There is no separate CTE field.
2. **The lot is an instance; the TLC is a mark.** A lot is a `thing` instance of its product kind. Its Traceability Lot Code (TLC) is one of its marks, so a recall matches it exactly (protocol.md, Things).
3. **Parties and sites are actors and things.** They are written once and linked, never buried in an event.
4. **An escape hatch, not a path.** An EPCIS event no row below covers lands as an `observe` of kind `epcis`.

## 2. Core and profile

| Concern | Core | This profile |
|---|---|---|
| Block, types, verbs, canonical form, hashes | As protocol.md | Unchanged |
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
- **Lot.** A `thing` instance: `refs.kind` the product kind, `state.lot` its batch name, `state.amount` or `state.pack` its size, `state.use_by`. Its marks:
  - `{ scheme: "tlc", value }`: the Traceability Lot Code;
  - `{ scheme: "tlc_source", value }`: the GLN, or FDA registration number, of the place that assigned it;
  - `{ scheme: "gtin", value }`, `{ scheme: "sscc", value }`, `{ scheme: "sgtin", value }`: any other identifiers the lot carries.
- **Containment.** An EPCIS parent and children (case on pallet, pallet in truck) are `refs.place`: what is inside moves with its container (protocol.md, Things).
- **Traceability plan.** An `observe` of kind `traceability_plan` by the covered person: `state.text` names the plan document by its hash.

## 4. Events

### 4.1 FSMA 204 Critical Tracking Events

| CTE | Block | Kind | TLC | Recommended `biz_step` (CBV 2.0) |
|---|---|---|---|---|
| Harvesting | `transform`, no inputs; its output is the harvested instance, `refs.place` the field or farm; the author is the first owner | `harvest` | none assigned | `urn:epcglobal:cbv:bizstep:commissioning` (flag 1) |
| Cooling before initial packing | `transform` that keeps: `refs.subject` the instance, nothing consumed | `cool` | kept | `urn:epcglobal:cbv:bizstep:other` (flag 2) |
| Initial packing (not fishing-vessel food) | `transform`: inputs in `derives_from`; outputs are the packed lots, each naming it | `pack` | **assigned** on the output | `urn:epcglobal:cbv:bizstep:packing` |
| First land-based receiving (fishing vessel) | `transform` by the receiver: input the landed instance, output the lot | `first_land_receive` | **assigned** on the output | `urn:epcglobal:cbv:bizstep:receiving` |
| Shipping | `transfer`: `refs.what` the lot, `refs.to_place` ship-to, `refs.to_holder` the carrier, `refs.place` ship-from | `ship` | kept | `urn:epcglobal:cbv:bizstep:shipping` |
| Receiving | the receiver's `answers` of the shipping transfer, `accepted`, with `state.at`, `state.when` and `refs.place` the receiving site | `receive` | kept | `urn:epcglobal:cbv:bizstep:receiving` |
| Transformation | `transform` with `derives_from` inputs and new lot outputs | `process` | **new TLC** on each output | `commissioning` or `creating_class_instance` (flag 3) |

Flags (CBV and GS1 US guidance, as of the *EPCIS Recommendations for FSMA 204*, Release 2.0, May 2025):
1. CBV 2.0 has no `harvesting` business step. Use `commissioning`; do not invent `…:bizstep:harvesting`.
2. CBV 2.0 has no cooling step; the guidance uses `other`.
3. The step depends on the process. An adapter preserves the source event's `biz_step` when importing.

A receiving from an exempt source (restaurant and retail food establishment exceptions in the rule) that has no TLC is a `transform` of kind `receive` by the receiver that assigns one, like first land-based receiving.

### 4.2 EPCIS 2.0 constructs

| EPCIS 2.0 | 1.6 |
|---|---|
| ObjectEvent | The block its `biz_step` names (§4.1). Anything else: an `observe` about the lot, `refs.subject` the instance |
| AggregationEvent ADD / DELETE | A `transfer` with `refs.to_place` the container (ADD), or out of it (DELETE) |
| TransactionEvent | The `transfer` it records; its business transactions in `biz_transactions` |
| TransformationEvent | `transform`, inputs in `derives_from` |
| AssociationEvent | An `observe` that links two things by `refs.subject` and `refs.place` |
| SensorElement | An `observe` reading: `amount`, `accuracy`, `coverage`, the sensor named in `refs.from`, the shipment or lot in `refs.subject`. Dense streams are linked by their Merkle root (protocol.md, Truth) |
| ErrorDeclaration | The author's `updates` of the wrong event; for another author's event, a `defeats` of it, then a corrected block |
| eventTime, eventTimeZoneOffset | `state.when`, `state.tz` |
| recordTime | `state.at` (when it was said) |
| bizStep, disposition, persistentDisposition | `state.biz_step`, `state.disposition`, `state.persistent_disposition` |
| readPoint, bizLocation | `refs.place`, and `where_now` (a fold) for where the lot is after |
| epcList, quantityList | Instances by `refs.what`; a quantity as `state.amount` of an instance (a part keeps its marks) |
| eventID | `state.epcis_id`, only to round trip |
| ILMD | The lot's data (`lot`, `use_by`, marks) on the output instance |

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

- **Forward.** Start from the instances whose marks match the TLC exactly. Follow `derives_from` to what was made from them (each output carries its own new TLC), `refs.what` to where they were shipped, and `refs.place` to what they were packed in.
- **Backward.** From a received lot, follow the `answers` to the shipping transfer, then `derives_from` to its inputs.
- **Whose records.** Each covered person holds their own CTE blocks. Sealed blocks show only their public headers, so a recall asks each holder, who answers for the blocks they hold (protocol.md, Open questions).
- **The spreadsheet.** The FDA's 24-hour sortable record is an export from these folds, never a block.

## 8. Conformance

An implementation claims `foodblock-profile-epcis` when:
- core is intact, and every block passes the write check;
- the lot is an instance with its TLC as a mark, and a CTE uses the kind in §4.1;
- the TLC rules in §6 hold;
- `biz_step` and `disposition` are CBV URIs when it claims CBV-compatible export, with no invented `urn:epcglobal:cbv:` values;
- a site used as a FSMA location carries its location description.

## 9. Vectors

The five EPCIS vectors in `test/vectors.json` (section `legacy-read`: harvest, cooling, initial packing with TLC, shipping, transformation) were written before 1.6. They are legacy-read only: they still hash the same, and `aliases.json` reads their types as 1.6 types. They are not 1.6 examples.

This profile should gain these 1.6 vectors (not yet written):
1. Harvest: a `transform` of kind `harvest` with no inputs.
2. Cool: a keep of kind `cool`.
3. Initial pack: a `transform` of kind `pack` with the lot's `tlc` and `tlc_source` marks.
4. Ship and receive: a `transfer` of kind `ship` and the receiver's `accepted` answer, with the fold's `where_now` and `ownership`.
5. Transformation: a `transform` of kind `process`, new TLC on the output.
6. An exempt-source receive that assigns a TLC.
7. Recall trace by mark: forward and backward, over the blocks above.
8. Aggregation: a `transfer` into a container, and the contained thing's `where_now`.

## 10. Open items

1. **Harvest and cooling steps.** If CBV adds dedicated business steps, adopt them as vocabulary; the kind does not change.
2. **Transformation step.** `commissioning` against `creating_class_instance` is process-dependent.
3. **GS1 Digital Link.** Out of scope; a mark scheme could carry it later.
4. **Part of a lot in a transform.** Naming the amount of an input a transform uses is open in protocol.md.
5. **Vocabulary map and schemas.** The profile's schemas, the short-name to CBV-URI map, a capture adapter and fixtures are still to be written.

## 11. Sources

| Source | Use |
|---|---|
| [EPCIS 2.0](https://ref.gs1.org/standards/epcis/2.0.0/) | Event types and dimensions |
| [CBV 2.0](https://ref.gs1.org/standards/cbv/2.0.0/) | Business steps, dispositions, transaction types |
| [FDA FSMA Food Traceability Rule, CTEs and KDEs (2024-05-20)](https://www.fda.gov/files/food/published/FSMA%20Rule%20for%20Food%20Traceability%20-%202024-0520-CTEs-KDEs.pdf) | CTE and KDE lists |
| [21 CFR Part 1 Subpart S](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-S) | Definitions and record rules |
| GS1 US *EPCIS Recommendations for FSMA 204 Critical Tracking Events* (Release 2.0, May 2025) | Cooling is `other`; produce CTE wiring |
