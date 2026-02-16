# FoodBlock: A Content-Addressable Protocol for Universal Food Data

**Version 0.1 — February 2026**

---

## Abstract

The global food industry spans 14 sectors — from primary production to retail, regulation to innovation — yet lacks a shared data primitive. Each sector, company, and system models food data differently, creating fragmentation that prevents interoperability, traceability, and trust. We propose FoodBlock: a minimal, content-addressable data structure consisting of three fields (`type`, `state`, `refs`) and six base types that can represent any food industry operation. FoodBlocks are append-only, cryptographically signed, and form provenance chains through hash-linked references. The protocol requires no blockchain, no specialized infrastructure — only JSON, hashing, and a database.

---

## 1. The Problem

Food data is generated at every stage of the supply chain. A farm records a harvest. A processor logs a batch. A distributor tracks a shipment. A retailer lists a product. A consumer writes a review. A regulator issues a certification. Each event is captured in isolated systems with incompatible schemas.

The consequences:

- A consumer cannot trace their bread back to the wheat field.
- A regulator cannot instantly identify every retailer affected by a recall.
- A distributor cannot verify a supplier's organic certification without phone calls.
- A developer building food applications must integrate dozens of proprietary APIs.

Previous attempts at food data standardization — GS1 barcodes, FDA FSMA, EU FIC — address narrow slices: product identification, safety reporting, labeling. No primitive exists that can represent all food data across all sectors.

We ask: **what is the minimum data structure that can express any food industry operation?**

---

## 2. The Primitive

A FoodBlock is a JSON object with three fields:

```json
{
  "type": "substance.product",
  "state": { "name": "Sourdough", "price": 4.50, "weight": { "value": 500, "unit": "g" } },
  "refs": { "seller": "a1b2c3...", "origin": "d4e5f6..." }
}
```

**type** — A string from an open registry, using dot notation for subtypes.

**state** — A key-value object containing the block's data. Schemaless. Any valid JSON.

**refs** — A key-value object mapping named roles to block hashes. Values may be a single hash (`string`) or multiple hashes (`string[]`). Arrays are sorted lexicographically before hashing.

The block's identity is derived from its content:

```
id = SHA-256(canonical(type + state + refs))
```

Where `canonical()` produces deterministic JSON: keys sorted lexicographically, no whitespace, no trailing zeros on numbers, NFC Unicode normalization.

A FoodBlock is immutable. Once created, its hash is its permanent identity.

---

## 3. Base Types

Six base types classify all food industry operations.

### Entities (things that exist)

| Type | Description | Examples |
|------|-------------|----------|
| **actor** | Any participant in the food system | Farmer, restaurant, retailer, regulator, consumer |
| **place** | Any location | Farm, factory, store, warehouse, kitchen, vehicle |
| **substance** | Any food item or material | Ingredient, product, meal, surplus, commodity |

### Actions (things that happen)

| Type | Description | Examples |
|------|-------------|----------|
| **transform** | Any process that changes food | Cooking, milling, fermenting, composting, harvesting |
| **transfer** | Any movement of food or value | Sale, shipment, donation, subscription, booking |
| **observe** | Any record about food | Review, inspection, certification, post, sensor reading |

Subtypes extend base types via dot notation. The registry is open — any participant can define subtypes. There is no central authority controlling type names.

Examples: `actor.producer`, `place.warehouse`, `substance.product`, `transform.process`, `transfer.order`, `observe.review`, `observe.certification`.

---

## 4. Protocol Rules

1. A FoodBlock is a JSON object with exactly three fields: `type`, `state`, `refs`.
2. A block's identity is `SHA-256(canonical(type + state + refs))`. The identity is derived, never assigned.
3. Blocks are append-only. No block is ever modified or deleted.
4. State updates are expressed by creating a new block with `refs: { updates: previous_hash }`.
5. A genesis block — one with empty refs `{}` — establishes an entity's identity. Its hash becomes the entity's permanent identifier.
6. The base type determines the expected refs schema. These are conventions, not enforcement.
7. Authentication wraps the block: `{ foodblock, author_hash, signature }`. The signature covers the canonical block content.
8. Encrypted state: keys prefixed with `_` contain encrypted values, readable only by authorized parties.
9. Any system that understands the six base types can process any FoodBlock.
10. The protocol is open. No registration, licensing, or permission is required to create or consume FoodBlocks.

---

## 5. Provenance

FoodBlocks form provenance chains through refs. Each block references the blocks it derives from, creating a directed acyclic graph of food history.

### 5.1 Tracing a Loaf of Bread

```
bread (substance.product)
  ← baking (transform.process)
    ← dough (substance.ingredient)
      ← flour (substance.ingredient)
        ← milling (transform.process)
          ← wheat (substance.ingredient)
            ← harvest (transform.harvest)
              ← farm (place.farm)
                ← organic_cert (observe.certification)
                  ← soil_association (actor.authority)
```

Each arrow is a ref. Following refs backwards reveals the complete history of any food item. Chain depth equals transparency depth.

### 5.2 Probabilistic Provenance

Not every actor knows their full supply chain. A baker may not know which farm produced their eggs. The protocol does not require complete knowledge — each actor references what they know.

A wholesaler who sources eggs from multiple farms can express composition:

```json
{
  "type": "substance.product",
  "state": {
    "name": "Free Range Eggs",
    "composition": [
      { "source": "hash_farm_a", "proportion": 0.6 },
      { "source": "hash_farm_b", "proportion": 0.4 }
    ]
  },
  "refs": { "seller": "hash_supplier" }
}
```

The chain is as deep as collective knowledge goes. No actor is compelled to know the full chain. Depth accumulates naturally as more participants adopt the protocol.

---

## 6. Trust

Trust is not a field. It emerges from the graph.

### Layer 1: Authenticity

Every block is signed. The authentication wrapper — `{ foodblock, author_hash, signature }` — provides cryptographic proof of authorship. A block is authentic if its signature matches the author's public key.

### Layer 2: Verification Depth

Claims exist on a spectrum:

- **Self-declared** — An actor states something about themselves.
- **Peer-verified** — Other actors corroborate. A review confirms a restaurant's quality. A repeat customer's orders confirm a supplier's reliability.
- **Authority-verified** — A recognized body certifies. The Soil Association certifies organic status. The FSA certifies food safety compliance.

Verification depth is not stored — it is computed by examining who signed related blocks. An `observe.certification` signed by a known `actor.authority` carries more weight than a self-declared claim.

### Layer 3: Chain Depth

Deeper provenance chains are harder to fabricate. A product with eight levels of traceable history — each signed by different actors across different organizations — is more trustworthy than a product with no refs.

### 6.1 Sybil Resistance

Trust is weighted by economic proof. Actors with verifiable economic activity — real transactions (`transfer.order` blocks backed by payment processors) — carry more weight than actors with no transaction history. Creating fake blocks is cheap. Creating fake economic history across multiple independent actors is expensive.

### 6.2 Temporal Validity

Certifications expire. `state.valid_until` on `observe.certification` blocks enables query-time validation. Expired certifications remain in the chain (append-only) but are flagged as expired by consuming systems.

---

## 7. Visibility

Visibility is declared inside `state`, making it part of the block's hash:

```json
{
  "type": "observe.post",
  "state": { "text": "New seasonal menu", "visibility": "network" },
  "refs": { "author": "actor_hash", "place": "venue_hash" }
}
```

| Level | Audience |
|-------|----------|
| **public** | Everyone |
| **sector** | Actors in the same industry sector |
| **network** | Connected actors (direct relationships) |
| **direct** | Specific actors referenced in the block |
| **internal** | Members of an actor.group |

Because visibility is in state, changing it creates a new block with `refs: { updates: previous_hash }`. This is correct — making something public that was private is a meaningful change, and the audit trail is preserved. The previous block remains in the chain but is superseded.

Visibility is granular. Within a single post, individual content blocks can carry different visibility levels — enabling scenarios where a producer shares product information publicly while keeping pricing visible only to their network.

Visibility is enforced at the query layer. Restricted blocks use encrypted state (Rule 8), with decryption keys distributed according to the visibility level.

---

## 8. Implementation

FoodBlock requires no specialized infrastructure.

### 8.1 Storage

A single database table:

```sql
CREATE TABLE foodblocks (
    hash        VARCHAR(64) PRIMARY KEY,
    type        VARCHAR(100) NOT NULL,
    state       JSONB NOT NULL,
    refs        JSONB NOT NULL DEFAULT '{}',
    author_hash VARCHAR(64),
    signature   TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fb_type ON foodblocks(type);
CREATE INDEX idx_fb_refs ON foodblocks USING GIN(refs);
CREATE INDEX idx_fb_author ON foodblocks(author_hash);
CREATE INDEX idx_fb_created ON foodblocks(created_at DESC);
```

### 8.2 Head Resolution

The protocol is append-only, but applications need current state. When a user updates their product's price, a new block is created with `refs: { updates: previous_hash }`. To resolve the latest version — the head — use a denormalized `head_hash` column updated on write, providing O(1) current-state lookups.

### 8.3 Event Propagation

New blocks trigger downstream processing: feed updates, notifications, analytics. PostgreSQL `LISTEN/NOTIFY` or database triggers are sufficient. No message queue infrastructure is required at launch.

### 8.4 Why Not Blockchain

FoodBlock adopts the hash-linked, append-only, signed architecture of distributed ledgers without the consensus mechanism. The critical distinction: **food data is not scarce**. There is no double-spend problem. Two restaurants can independently claim to serve the best carbonara — both blocks are valid. What food data needs is not consensus but authenticity (signatures), traceability (provenance chains), and interoperability (a universal primitive). All three are achieved with JSON, SHA-256, and a database.

---

## 9. Autonomous Agents

AI agents are first-class participants in the FoodBlock protocol. An agent is an `actor.agent` — a software process that creates, queries, and responds to FoodBlocks on behalf of a human or organisation.

### 9.1 Agent Identity

An agent registers itself as an actor block:

```json
{
  "type": "actor.agent",
  "state": {
    "name": "Bakery Assistant",
    "model": "claude-sonnet",
    "capabilities": ["inventory", "ordering", "pricing"]
  },
  "refs": { "operator": "human_or_business_actor_hash" }
}
```

The `refs.operator` field is required. Every agent must reference the actor that controls it. An agent without an operator is invalid by convention.

The agent's genesis block hash becomes its permanent identity. Like any actor, it generates an Ed25519 keypair and signs the blocks it creates.

### 9.2 Agent Actions

Blocks created by agents carry the agent's signature and are traceable through the graph. An agent that orders flour on behalf of a bakery produces:

```json
{
  "type": "transfer.order",
  "state": { "quantity": 50, "unit": "kg", "total": 90.00, "draft": true },
  "refs": { "buyer": "bakery_hash", "seller": "mill_hash", "product": "flour_hash", "agent": "agent_hash" }
}
```

The `refs.agent` field records which agent created the block. The `state.draft` field indicates the action awaits human approval. Once the operator confirms, a new block is created with `draft` removed and `refs: { updates: draft_hash }`.

This pattern makes agent actions visible, attributable, and reversible. No agent action is hidden from the graph.

### 9.3 Agent Discovery

Agents expose their capabilities through MCP (Model Context Protocol) tool interfaces. Any MCP-compatible client — Claude Desktop, development environments, custom applications — can discover and interact with agents that speak FoodBlock.

The protocol does not prescribe how agents communicate. It prescribes that agent actions are FoodBlocks, signed and traceable like any other block.

---

## 10. Sector Coverage

The six base types express operations across all fourteen food industry sectors:

| Sector | Key Block Types |
|--------|----------------|
| Primary Production | `actor.producer`, `place.farm`, `substance.ingredient`, `transform.harvest` |
| Processing & Manufacturing | `actor.maker`, `transform.process`, `observe.inspection` |
| Distribution & Logistics | `actor.distributor`, `transfer.shipment`, `observe.reading` |
| Retail | `actor.venue`, `substance.product`, `transfer.order` |
| Hospitality | `actor.venue`, `transfer.booking`, `observe.review` |
| Food Service | `substance.product`, `observe.plan`, `transform.process` |
| Waste & Sustainability | `actor.sustainer`, `substance.surplus`, `transfer.donation` |
| Regulation & Food Safety | `actor.authority`, `observe.certification`, `observe.inspection` |
| Food Education & Media | `actor.creator`, `observe.post`, `transfer.subscription` |
| Community & Social Food | `actor.group`, `observe.event`, `transfer.share` |
| Health & Nutrition | `actor.professional`, `observe.assessment`, `observe.plan` |
| Food Finance & Economics | `transfer.investment`, `transfer.trade`, `observe.market` |
| Cultural Food | `observe.certification`, `substance.ingredient`, `place.region` |
| Food Technology & Innovation | `actor.innovator`, `observe.experiment`, `transform.process` |
| Autonomous Operations | `actor.agent`, `transfer.order` (draft), `observe.inventory` |

No sector requires a type outside the six bases. Sector-specific needs are expressed through subtypes and state conventions, not protocol extensions.

---

## 11. Canonical JSON Specification

Deterministic hashing requires deterministic serialization. The canonical form of a FoodBlock is:

1. **Keys** are sorted lexicographically at every level of nesting.
2. **No whitespace** between tokens.
3. **Numbers** use no trailing zeros, no leading zeros, no positive sign prefix.
4. **Strings** use Unicode NFC normalization.
5. **Arrays** within `refs` are sorted lexicographically.
6. **Null values** are omitted.

Example — a block before canonicalization:

```json
{
  "refs": { "seller": "abc", "inputs": ["def", "abc"] },
  "type": "transform.process",
  "state": { "name": "Baking", "temp": 200.0 }
}
```

After canonicalization:

```
{"refs":{"inputs":["abc","def"],"seller":"abc"},"state":{"name":"Baking","temp":200},"type":"transform.process"}
```

This byte string is the input to SHA-256.

---

## 12. Developer Interface

Any system that can produce and consume JSON can participate in FoodBlock. A minimal SDK exposes five operations:

```
create(type, state, refs)       → { hash, type, state, refs }
query(type, filters)            → [ blocks ]
chain(hash)                     → [ block, ...ancestors ]
update(previous_hash, changes)  → { hash, type, state, refs }
verify(hash, signature, pubkey) → boolean
```

The HTTP API mirrors these operations:

```
POST   /blocks                              → create
GET    /blocks/:hash                        → read
GET    /blocks?type=...&ref.seller=...      → query
GET    /chain/:hash                         → provenance
PUT    /blocks/:hash                        → update (creates new block)
```

---

## 13. Conclusion

FoodBlock compresses the complexity of food industry data into three fields, six base types, and ten rules. Any food operation — from a farm harvest to a Michelin review, from a cold chain reading to a commodity trade — is expressible as a FoodBlock.

Provenance emerges from hash-linked references. Trust emerges from signatures, verification depth, and chain depth. Interoperability emerges from a shared primitive. No new infrastructure is required.

The food industry's data fragmentation is not a technology problem. It is a primitives problem. FoodBlock provides the missing primitive.

---

*FoodBlock is an open protocol. This specification is released for public use.*
