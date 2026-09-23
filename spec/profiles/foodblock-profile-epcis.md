# FoodBlock Profile: EPCIS 2.0 + FSMA 204

| | |
|---|---|
| **Profile id** | `foodblock-profile-epcis` |
| **Version** | 0.1 |
| **Status** | Draft |
| **Date** | 2026-09-23 |
| **License** | MIT (same as FoodBlock protocol) |

**One-liner:** Map GS1 EPCIS 2.0 visibility events and FDA FSMA Food Traceability Rule (21 CFR Part 1 Subpart S) Critical Tracking Events onto FoodBlock's three-field primitive — without putting GS1/FSMA vocabulary into core.

---

## 1. Status

This document is a **profile**, not a core protocol change.

- **Normative for:** implementers who claim conformance to `foodblock-profile-epcis`.
- **Informative for:** all other FoodBlock users (hospitality menus, reviews, surplus, etc.).
- **Not legal advice.** Covered persons under FSMA 204 remain responsible for records; FoodBlock carries structured KDEs.

### Locked decisions (do not reopen in v0.1)

1. **Subtype-first.** Common CTEs and ops use dedicated FoodBlock subtypes (`transform.harvest`, `transfer.shipment`, …). Optional `observe.epcis` is a **lossless escape hatch** only.
2. **Profile, not core.** EPCIS 2.0 + FSMA 204 vocabulary and schemas live under this profile. Core stays universal (six bases, SHA-256 identity, type/state/refs).
3. **`substance.lot` is TLC source of truth.** Lot/batch identity (including Traceability Lot Code) lives on the lot block. CTE events **MAY** copy `tlc` into event `state` for export convenience.

---

## 2. Non-goals

- Replacing EPCIS repositories or implementing the full EPCIS Query Interface.
- Putting GS1 Digital Link, CBV, or FSMA KDEs into FoodBlock **core** schemas.
- FoodX (or any app) UI / product roadmap.
- Legal compliance certification or competitor comparisons.
- Inventing CBV URIs that are not in ratified CBV 2.0 (flagged where industry guidance differs).

---

## 3. Design principles

1. **No seventh base type.** EPCIS maps onto existing bases: `transform`, `transfer`, `observe` + entities `actor`, `place`, `substance`.
2. **Dimensions in `state`; graph in `refs`.** EPCIS what / when / where / why / how → recommended state keys; linkages → named refs.
3. **Content identity unchanged.** FoodBlock hash = `SHA-256(canonical(type + state + refs))`. EPCIS `eventID` (if present) is stored as `state.epcis_event_id`; it is not the protocol id.
4. **Master data as entity blocks.** Parties, sites, and lots are first-class `actor.*` / `place.*` / `substance.*` blocks. Events reference them; do not bury reusable master data only inside ephemeral event state.
5. **FSMA is a KDE overlay.** CTE identity is `state.cte` (profile enum). FoodBlock subtype chooses the action shape; KDEs fill state/refs.
6. **CBV URIs preferred in profile state.** Prefer full CBV URNs (`urn:epcglobal:cbv:bizstep:…`). Short aliases MAY exist in a profile vocabulary map; export SHOULD expand to URIs.

---

## 4. What is core vs profile

| Concern | Core FoodBlock | This profile (`foodblock-profile-epcis`) |
|---------|----------------|------------------------------------------|
| Primitive | `type` / `state` / `refs`; SHA-256 | Unchanged |
| Six bases | `actor`, `place`, `substance`, `transform`, `transfer`, `observe` | Unchanged |
| Subtypes | Open; sector-agnostic names OK | Standardizes CTE/EPCIS subtypes listed below |
| `substance.lot` | Allowed as a substance subtype | **Required convention** for TLC/lot identity when claiming profile conformance |
| CBV bizStep / disposition URIs | Not required | Recommended in `state.biz_step` / `state.disposition` |
| `state.cte` | Not defined | Profile enum for FSMA CTE name |
| `observe.epcis` | Not required | Optional lossless envelope |
| Schemas / vectors / adapter | Optional | Profile deliverables (see §11) |
| Capability advert | Generic discover | MAY declare `epcis_2_0`, `fsma_204`, CBV version |

Servers that do not implement this profile MUST still accept ordinary FoodBlocks. Profile subtypes outside a server's registry SHOULD validate as unknown-but-well-formed (same as any other subtype), unless the server claims profile conformance.

---

## 5. Type / subtype table

### 5.1 EPCIS 2.0 constructs → FoodBlock

| EPCIS 2.0 construct | FoodBlock mapping (profile) | Notes |
|---------------------|----------------------------|-------|
| ObjectEvent | **Prefer** bizStep → subtype (`transfer.shipment`, `transfer.receive`, `transform.pack`, …). Else `observe.epcis` | Set `state.epcis_type: "ObjectEvent"` when round-trip matters |
| AggregationEvent | `transform.aggregate` (ADD/DELETE) or `observe.aggregation` (OBSERVE) | `refs.parent`, `refs.children[]` |
| TransactionEvent | Often `transfer.order` / `transfer.shipment` + biz transactions | Prefer refs or structured `state.biz_transactions[]` |
| TransformationEvent | `transform.process` (or `transform.pack` / `transform.harvest` when CTE-specific) | `refs.inputs[]`, `refs.outputs[]` |
| AssociationEvent | `observe.association` | Persistent place↔object / equipment links |
| SensorElement (how) | Prefer separate `observe.reading` / `observe.alert`; else nested `state.sensor` | High-frequency paths: separate blocks |
| PersistentDisposition | `state.persistent_disposition` | CBV disposition URI |
| bizStep | `state.biz_step` | CBV URI (see §5.3 caveats) |
| disposition | `state.disposition` | CBV URI |
| readPoint / bizLocation | `refs.read_point`, `refs.biz_location` → `place.*` | Mirror GLN on `place.state` as needed |
| epcList / quantityList | Instances → `refs.objects[]` / inputs/outputs; class+qty → `state.quantities[]` | |
| action | `state.action` | `ADD` \| `OBSERVE` \| `DELETE` |
| errorDeclaration | Prefer `observe.error_declaration` + `refs.target` | Audit clarity |
| ILMD | On output `substance.lot` / packing event | Lot birth |
| eventID | `state.epcis_event_id` | UUID URI or Event Hash ID |

### 5.2 FSMA 204 CTEs → FoodBlock

FDA Critical Tracking Events (21 CFR §1.1310 definition; KDEs in §§1.1325–1.1350):

| CTE | FoodBlock subtype | TLC rule | Recommended `state.biz_step` (CBV 2.0) | Flag |
|-----|-------------------|----------|----------------------------------------|------|
| Harvesting | `transform.harvest` | No new TLC | `urn:epcglobal:cbv:bizstep:commissioning` | **[flag]** CBV 2.0 has **no** `harvesting` bizStep; CBV describes harvesting as a sector activity under **commissioning**. Do not invent `…:bizstep:harvesting`. Identify the CTE with `state.cte: "harvesting"`. |
| Cooling (before initial packing) | `transform.cool` | No new TLC | `urn:epcglobal:cbv:bizstep:other` | **[flag]** Per GS1 US *EPCIS Recommendations for FSMA 204* (Release 2.0, May 2025): no dedicated CBV cooling bizStep; guidance uses **`other`**. Identify CTE with `state.cte: "cooling"`. Optional sensor data in `state.sensor` or linked `observe.reading`. |
| Initial packing (RAC, not fishing-vessel food) | `transform.pack` | **Assign TLC** | `urn:epcglobal:cbv:bizstep:packing` | Often also a TransformationEvent shape (`epcis_type`). |
| First land-based receiving (fishing vessel) | `transfer.receive` | **Assign TLC** | `urn:epcglobal:cbv:bizstep:receiving` (or `accepting` where possession acknowledgment is the modeled step) | Distinguish with `state.cte: "first_land_based_receiving"`. |
| Shipping | `transfer.shipment` | Keep TLC | `urn:epcglobal:cbv:bizstep:shipping` | Disposition often `…:disp:in_transit`. |
| Receiving | `transfer.receive` | Keep TLC; assign if received from exempt source (RFE/restaurant exceptions apply in rule) | `urn:epcglobal:cbv:bizstep:receiving` | `state.cte: "receiving"`. |
| Transformation | `transform.process` | **New TLC** on output | Context-dependent: often `commissioning` or `creating_class_instance` | CTE identity is `state.cte: "transformation"` + TransformationEvent; do not rely on a non-existent `transforming` CBV bizStep. |

**Traceability plan** (not an EPCIS event): `observe.traceability_plan` referenced from the covered `actor` (procedures, FTL identification method, TLC assignment method, contact, farm-map ref).

### 5.3 Profile subtype registry (standardized names)

| Subtype | Role |
|---------|------|
| `transform.harvest` | Harvesting CTE |
| `transform.cool` | Cooling before initial packing |
| `transform.pack` | Initial packing / packing ops |
| `transform.process` | Transformation CTE / general process |
| `transform.aggregate` | AggregationEvent ADD/DELETE |
| `transfer.shipment` | Shipping CTE |
| `transfer.receive` | Receiving / first land-based receive |
| `transfer.order` | PO / order TransactionEvent-ish |
| `observe.reading` | Sensor / measurement |
| `observe.alert` | Threshold breach / alert |
| `observe.association` | AssociationEvent |
| `observe.aggregation` | Aggregation OBSERVE |
| `observe.epcis` | **Lossless escape hatch** — opaque/normalized EPCIS envelope |
| `observe.error_declaration` | EPCIS errorDeclaration |
| `observe.coa` | Certificate of analysis (optional companion) |
| `observe.claim` | Claim / proof-point (optional companion) |
| `observe.traceability_plan` | FSMA traceability plan |
| `substance.lot` | Lot/batch — **TLC source of truth** |
| `substance.product` | Product class / catalog |
| `place.site` / `place.field` / `place.vehicle` | Location shapes as needed |

---

## 6. Recommended state keys and refs

### 6.1 Event dimension keys (recommended)

```json
{
  "event_time": "2026-09-20T14:30:00Z",
  "event_time_zone_offset": "+01:00",
  "biz_step": "urn:epcglobal:cbv:bizstep:shipping",
  "disposition": "urn:epcglobal:cbv:disp:in_transit",
  "persistent_disposition": null,
  "action": "OBSERVE",
  "epcis_type": "ObjectEvent",
  "epcis_event_id": "urn:uuid:00000000-0000-4000-8000-000000000001",
  "cte": "shipping",
  "instance_id": "00000000-0000-4000-8000-000000000099",
  "tlc": "TLC-GA-20260918-01",
  "product_description": "Baby spinach 200g clamshell",
  "quantity": { "value": 40, "unit": "case" },
  "quantities": [],
  "reference_document": { "type": "BOL", "number": "BOL-88921" },
  "biz_transactions": [
    { "type": "urn:epcglobal:cbv:btt:bol", "id": "BOL-88921" }
  ],
  "sensor": {
    "type": "temperature",
    "value": 3.2,
    "unit": "celsius",
    "device_id": "probe-77"
  },
  "adapter": "epcis",
  "adapter_ref": "capture:doc-…"
}
```

| Key | Meaning |
|-----|---------|
| `event_time` | EPCIS eventTime (ISO-8601) |
| `event_time_zone_offset` | EPCIS eventTimeZoneOffset |
| `biz_step` | CBV Business Step URI |
| `disposition` | CBV Disposition URI |
| `action` | ADD / OBSERVE / DELETE |
| `epcis_type` | ObjectEvent \| AggregationEvent \| TransactionEvent \| TransformationEvent \| AssociationEvent |
| `epcis_event_id` | EPCIS eventID if present |
| `cte` | Profile FSMA CTE slug (see §5.2) |
| `tlc` | **Copy** of lot TLC for export rows; source of truth remains `substance.lot` |
| `product_description` | FSMA product description KDE |
| `quantity` / `quantities` | Single qty or class-level list |
| `reference_document` | FSMA reference document type + number |
| `biz_transactions` | Optional structured EPCIS bizTransactionList |
| `sensor` | Nested how-dimension (prefer separate observe blocks when dense) |

### 6.2 FSMA location description on `place.*`

Per 21 CFR §1.1310 location description elements — store on the place block:

```json
{
  "type": "place.site",
  "state": {
    "name": "Green Acres Packhouse",
    "phone": "+1-555-0100",
    "address": {
      "line1": "1 Farm Rd",
      "city": "Salinas",
      "region": "CA",
      "postal": "93901",
      "country": "US"
    },
    "geo": { "lat": 36.6777, "lon": -121.6555 },
    "gln": "0614141123452"
  },
  "refs": {
    "operator": "sha256:actor_producer_placeholder_0001"
  }
}
```

### 6.3 Refs patterns

| Role | Meaning | Typical target |
|------|---------|----------------|
| `objects` | Subject instances (ObjectEvent) | `substance.*` |
| `inputs` / `outputs` | Transformation graph | `substance.*` |
| `parent` / `children` | Aggregation / association | substance or place |
| `read_point` | Where observed | `place.*` |
| `biz_location` | Where business locates object after event | `place.*` |
| `from` / `to` | Ship-from / ship-to sites | `place.*` |
| `shipper` / `receiver` | Transfer parties | `actor.*` |
| `tlc_source` | Where TLC was assigned | `place.*` |
| `farm` / `field` | Harvest KDEs | `place.*` |
| `harvester` / `operator` | Actors | `actor.*` |
| `subsequent_recipient` | Harvest/cool forward party/site | `place.*` or `actor.*` |
| `subject` | Observation about X | any |
| `evidence` | Proof-point backing | `observe.coa`, docs |
| `shipment` | Link sensor/alert to shipment | `transfer.shipment` |
| `updates` | Successor block | previous hash |

---

## 7. TLC / lot rules

1. **Source of truth:** `substance.lot.state.tlc` (and related lot identifiers: GTIN+lot, batch code, etc.).
2. **Assignment events** (create or first attach TLC on the lot block):
   - Initial packing of a RAC (not fishing-vessel food)
   - First land-based receiving of fishing-vessel food
   - Transformation (new TLC on **output** lot)
   - Receiving from an exempt source when no TLC exists (rule exceptions for RFE/restaurant apply)
3. **Non-assignment CTEs** (harvest, cool, ship, ordinary receive): **MUST NOT** invent a new TLC; **MAY** copy existing `tlc` into event `state` for sortable export.
4. **`refs.tlc_source`** on assignment (and on later CTEs that carry TLC) → `place.*` where the code was assigned.
5. **Events never replace the lot block.** Updating lot master data creates a new `substance.lot` via normal FoodBlock update/`refs.updates` rules; CTE events point at the current lot hash.

**Lot block sketch:**

```json
{
  "type": "substance.lot",
  "state": {
    "name": "Baby spinach 200g",
    "tlc": "TLC-GA-20260918-01",
    "gtin": "00614141123458",
    "quantity": { "value": 4800, "unit": "each" }
  },
  "refs": {
    "product_class": "sha256:substance_product_spinach200g_0001",
    "packed_at": "sha256:transform_pack_placeholder_0001",
    "tlc_source": "sha256:place_packhouse_placeholder_0001"
  }
}
```

---

## 8. Worked examples (5)

Placeholder hashes use the form `sha256:<role>_placeholder_<nnnn>` so they are obvious and stable in prose. Production SDKs replace them with real SHA-256 digests of canonical JSON.

### Example 1 — Harvesting CTE → `transform.harvest`

```json
{
  "type": "transform.harvest",
  "state": {
    "instance_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "event_time": "2026-09-18T16:00:00Z",
    "event_time_zone_offset": "-07:00",
    "biz_step": "urn:epcglobal:cbv:bizstep:commissioning",
    "action": "ADD",
    "epcis_type": "ObjectEvent",
    "cte": "harvesting",
    "commodity": "spinach",
    "variety": "baby leaf",
    "quantity": { "value": 1200, "unit": "kg" },
    "reference_document": { "type": "field_tag", "number": "FT-4412" }
  },
  "refs": {
    "farm": "sha256:place_farm_placeholder_0001",
    "field": "sha256:place_field_north3_placeholder_0001",
    "harvester": "sha256:actor_producer_placeholder_0001",
    "subsequent_recipient": "sha256:place_packhouse_placeholder_0001",
    "outputs": ["sha256:substance_spinach_bulk_placeholder_0001"],
    "read_point": "sha256:place_field_north3_placeholder_0001"
  }
}
```

### Example 2 — Cooling CTE → `transform.cool`

```json
{
  "type": "transform.cool",
  "state": {
    "instance_id": "8d0f7780-8536-41ef-a55c-f18fd2a01bf8",
    "event_time": "2026-09-18T18:30:00Z",
    "event_time_zone_offset": "-07:00",
    "biz_step": "urn:epcglobal:cbv:bizstep:other",
    "disposition": "urn:epcglobal:cbv:disp:in_progress",
    "action": "OBSERVE",
    "epcis_type": "ObjectEvent",
    "cte": "cooling",
    "quantity": { "value": 1200, "unit": "kg" },
    "sensor": {
      "type": "temperature",
      "value": 2.0,
      "unit": "celsius",
      "device_id": "cooler-probe-3"
    },
    "reference_document": { "type": "cool_log", "number": "CL-918" }
  },
  "refs": {
    "objects": ["sha256:substance_spinach_bulk_placeholder_0001"],
    "farm": "sha256:place_farm_placeholder_0001",
    "read_point": "sha256:place_cooler_placeholder_0001",
    "biz_location": "sha256:place_cooler_placeholder_0001",
    "subsequent_recipient": "sha256:place_packhouse_placeholder_0001",
    "updates": "sha256:transform_harvest_placeholder_0001"
  }
}
```

### Example 3 — Initial packing + TLC assignment → `transform.pack` + `substance.lot`

```json
{
  "type": "transform.pack",
  "state": {
    "instance_id": "9b2c3d4e-1111-2222-3333-444455556666",
    "event_time": "2026-09-18T22:10:00Z",
    "event_time_zone_offset": "-07:00",
    "biz_step": "urn:epcglobal:cbv:bizstep:packing",
    "action": "ADD",
    "epcis_type": "TransformationEvent",
    "cte": "initial_packing",
    "tlc": "TLC-GA-20260918-01",
    "product_description": "Baby spinach 200g clamshell",
    "quantity_in": { "value": 1200, "unit": "kg" },
    "quantity_out": { "value": 4800, "unit": "each" },
    "reference_document": { "type": "pack_log", "number": "PL-918" }
  },
  "refs": {
    "inputs": ["sha256:substance_spinach_bulk_placeholder_0001"],
    "outputs": ["sha256:substance_lot_TLC_GA_20260918_01_placeholder"],
    "tlc_source": "sha256:place_packhouse_placeholder_0001",
    "farm": "sha256:place_farm_placeholder_0001",
    "field": "sha256:place_field_north3_placeholder_0001",
    "harvester": "sha256:actor_producer_placeholder_0001",
    "read_point": "sha256:place_packhouse_placeholder_0001"
  }
}
```

Linked lot (source of truth for TLC):

```json
{
  "type": "substance.lot",
  "state": {
    "name": "Baby spinach 200g",
    "tlc": "TLC-GA-20260918-01",
    "gtin": "00614141123458",
    "quantity": { "value": 4800, "unit": "each" }
  },
  "refs": {
    "product_class": "sha256:substance_product_spinach200g_0001",
    "packed_at": "sha256:transform_pack_placeholder_0001",
    "tlc_source": "sha256:place_packhouse_placeholder_0001"
  }
}
```

### Example 4 — Shipping CTE → `transfer.shipment`

```json
{
  "type": "transfer.shipment",
  "state": {
    "instance_id": "a1a1a1a1-bbbb-cccc-dddd-eeeeeeeeeeee",
    "event_time": "2026-09-19T08:00:00Z",
    "event_time_zone_offset": "-07:00",
    "biz_step": "urn:epcglobal:cbv:bizstep:shipping",
    "disposition": "urn:epcglobal:cbv:disp:in_transit",
    "action": "OBSERVE",
    "epcis_type": "ObjectEvent",
    "cte": "shipping",
    "tlc": "TLC-GA-20260918-01",
    "product_description": "Baby spinach 200g clamshell",
    "quantity": { "value": 40, "unit": "case" },
    "sscc": "006141419999999999",
    "reference_document": { "type": "BOL", "number": "BOL-88921" },
    "biz_transactions": [
      { "type": "urn:epcglobal:cbv:btt:bol", "id": "BOL-88921" }
    ]
  },
  "refs": {
    "objects": ["sha256:substance_lot_TLC_GA_20260918_01_placeholder"],
    "from": "sha256:place_packhouse_placeholder_0001",
    "to": "sha256:place_dc_placeholder_0001",
    "tlc_source": "sha256:place_packhouse_placeholder_0001",
    "shipper": "sha256:actor_producer_placeholder_0001",
    "read_point": "sha256:place_packhouse_placeholder_0001"
  }
}
```

### Example 5 — Transformation CTE → `transform.process` (new TLC)

```json
{
  "type": "transform.process",
  "state": {
    "instance_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "event_time": "2026-09-21T10:00:00Z",
    "event_time_zone_offset": "+01:00",
    "biz_step": "urn:epcglobal:cbv:bizstep:creating_class_instance",
    "action": "ADD",
    "epcis_type": "TransformationEvent",
    "cte": "transformation",
    "process": "stone_milling",
    "input_lots": [
      { "tlc": "WHEAT-LOT-55", "quantity": { "value": 500, "unit": "kg" } }
    ],
    "tlc": "FLOUR-LOT-90",
    "product_description": "Stoneground bread flour 25kg",
    "quantity": { "value": 480, "unit": "kg" },
    "reference_document": { "type": "work_order", "number": "WO-3321" }
  },
  "refs": {
    "inputs": ["sha256:substance_lot_wheat_55_placeholder"],
    "outputs": ["sha256:substance_lot_flour_90_placeholder"],
    "tlc_source": "sha256:place_mill_placeholder_0001",
    "operator": "sha256:actor_maker_placeholder_0001",
    "read_point": "sha256:place_mill_placeholder_0001"
  }
}
```

**Receiving CTE** (table-complete; not expanded as a sixth full example): same shape as Example 4 with `type: "transfer.receive"`, `cte: "receiving"`, `biz_step: "urn:epcglobal:cbv:bizstep:receiving"`, and `refs.from` / `refs.to` swapped in the receive direction.

**Sensor escape (optional pattern):** prefer `observe.alert` / `observe.reading` with `biz_step: "urn:epcglobal:cbv:bizstep:sensor_reporting"` (CBV 2.0) and `refs.shipment` / `refs.subject` — not a FSMA CTE.

**Lossless hatch:** unknown or exotic EPCIS documents MAY land as:

```json
{
  "type": "observe.epcis",
  "state": {
    "epcis_type": "ObjectEvent",
    "biz_step": "urn:epcglobal:cbv:bizstep:inspecting",
    "event_time": "2026-09-19T12:00:00Z",
    "normalized": { },
    "raw_ref": "visibility:restricted-or-external-store-id"
  },
  "refs": {
    "objects": ["sha256:substance_lot_TLC_GA_20260918_01_placeholder"]
  }
}
```

Prefer subtypes when a row in §5.2 applies.

---

## 9. Conformance checklist (short)

An implementation **claims** `foodblock-profile-epcis` when it meets all of:

- [ ] **Core intact** — only three fields; six bases; SHA-256 content identity unchanged.
- [ ] **Subtype-first** — harvest / cool / pack / ship / receive / process use §5.3 subtypes; `observe.epcis` only as escape hatch.
- [ ] **`state.cte`** set on FSMA CTE events to the slugs in §5.2.
- [ ] **CBV URIs** in `biz_step` / `disposition` when claiming CBV-compatible export; no invented `urn:epcglobal:cbv:…` payloads.
- [ ] **TLC rule** — `substance.lot` holds authoritative `tlc`; assignment only at pack / first land-based receive / transform (and exempt-source receive per rule); other CTEs may copy TLC into event state.
- [ ] **`refs.tlc_source`** present on TLC-assignment events.
- [ ] **Places carry location description** KDEs when used as FSMA locations.
- [ ] **Round-trip optional** — if `epcis_type` / `epcis_event_id` present, export reconstructs those fields.
- [ ] **Vectors** — at least the five examples in §8 hash-stable across SDKs (canonical JSON).

---

## 10. Remaining open items (tiny)

Only items **not** settled by the three locks:

1. **Harvest bizStep on the wire** — Profile recommends CBV `commissioning` + `state.cte: "harvesting"`. If a future CBV addendum or industry extension publishes a dedicated harvest bizStep, adopt it via vocabulary alias without changing the FoodBlock subtype.
2. **Cooling bizStep** — Profile follows GS1 US FSMA guidance (`other`) until CBV adds a cooling value. `state.cte: "cooling"` remains the FoodBlock discriminator.
3. **Transformation default bizStep** — `creating_class_instance` vs `commissioning` is process-dependent; examples pick one. Adapters SHOULD preserve the source event's bizStep when importing.
4. **GS1 Digital Link as first-class alternate id** — out of scope for v0.1; keep `state.gtin` / GLN fields; helpers may be added later without core changes.
5. **Class-only quantity events** — whether to always mint a synthetic `substance.lot` / `substance.product` vs state-only `quantities[]` when no instance EPCs exist. Recommendation: mint `substance.product` (class) + optional lot when TLC exists; document in adapter.

---

## 11. Implementation order (FoodBlock protocol only)

1. **Publish this profile** under `spec/profiles/foodblock-profile-epcis.md` ✅
2. **JSON Schemas** for profile subtypes + recommended state keys (`cte` enum, TLC fields, place location description). Register in the **profile** schema pack, not core-required.
3. **Vocabulary aliases** — short names ↔ CBV URIs (`shipping` → `urn:epcglobal:cbv:bizstep:shipping`); include flagged harvest/cool mappings.
4. **Canonical vectors** — add §8 examples to `test/vectors.json` (or `test/vectors/profile-epcis.json`) so every SDK agrees on hashes.
5. **Capture adapter (protocol-facing)** — EPCIS 2.0 JSON/JSON-LD → FoodBlocks (subtype-first; fallback `observe.epcis`); optional export to EPCIS JSON and FSMA sortable rows from a subgraph.
6. **Capability advertisement** — `.well-known/foodblock` (or existing discover) MAY list `profiles: ["foodblock-profile-epcis@0.1"]` with CBV/EPCIS versions.
7. **Sandbox fixtures** — golden EPCIS docs → FoodBlocks → export notes (conformance pack).

Still deferred: full EPCIS Query dialect; EU FIC / DPP packs; app UI.

---

## 12. Sources

| Source | Use |
|--------|-----|
| FoodBlock README / technical whitepaper (FoodXDevelopment/FoodBlock) | Core primitive, six bases |
| [EPCIS 2.0](https://ref.gs1.org/standards/epcis/2.0.0/) | Event types & dimensions |
| [CBV 2.0](https://ref.gs1.org/standards/cbv/2.0.0/) | bizStep / disposition / btt URIs (Jun 2022) |
| [FDA FSMA Food Traceability Rule — CTE/KDE overview (2024-05-20)](https://www.fda.gov/files/food/published/FSMA%20Rule%20for%20Food%20Traceability%20-%202024-0520-CTEs-KDEs.pdf) | CTE/KDE lists |
| [21 CFR Part 1 Subpart S (eCFR)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-S) | Normative definitions & record rules |
| GS1 US *EPCIS Recommendations for FSMA 204 Critical Tracking Events* (Release 2.0, May 2025) | Cooling → `other`; produce CTE wiring guidance |

---

*End of `foodblock-profile-epcis` v0.1*
