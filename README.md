# FoodBlock

A content-addressable protocol for universal food data.

Three fields. Six base types. Every food industry operation.

```json
{
  "type": "substance.product",
  "state": { "name": "Sourdough", "price": 4.50, "allergens": { "gluten": true } },
  "refs": { "seller": "a1b2c3...", "inputs": ["flour_hash", "water_hash", "yeast_hash"] }
}
```

`id = SHA-256(canonical(type + state + refs))`

## Why

The food industry spans 14 sectors — farming, processing, distribution, retail, hospitality, regulation, sustainability, and more. Every sector models food data differently. There is no shared primitive.

FoodBlock is that primitive. One data structure that can represent a farm harvest, a restaurant menu item, a food safety certification, a cold chain reading, a grocery order, or a consumer review. Same three fields. Same hashing. Same protocol.

## The Primitive

Every FoodBlock has exactly three fields:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | What kind of block (dot-notated subtypes) |
| `state` | object | The block's data (schemaless, any valid JSON) |
| `refs` | object | Named references to other blocks by hash |

Identity is derived from content: `SHA-256(canonical(type + state + refs))`. Same content always produces the same hash, regardless of where or when the block is created.

## Six Base Types

**Entities** — things that exist:
- **actor** — farmer, restaurant, retailer, regulator, consumer, device
- **place** — farm, factory, store, warehouse, kitchen, vehicle
- **substance** — ingredient, product, meal, surplus, commodity

**Actions** — things that happen:
- **transform** — cooking, milling, harvesting, fermenting, composting
- **transfer** — sale, shipment, donation, booking, subscription
- **observe** — review, certification, inspection, post, sensor reading

Subtypes via dot notation: `actor.producer`, `substance.product`, `observe.review`, `transfer.order`.

## Install

```bash
npm install foodblock
```

## Quick Start

```javascript
const fb = require('foodblock')

// Create a farm
const farm = fb.create('actor.producer', { name: 'Green Acres Farm' })
// => { hash: 'e3b0c4...', type: 'actor.producer', state: {...}, refs: {} }

// Create a product with provenance
const wheat = fb.create('substance.ingredient', { name: 'Organic Wheat' }, { source: farm.hash })
const flour = fb.create('substance.product', { name: 'Stoneground Flour' }, { source: wheat.hash })
const bread = fb.create('substance.product', {
  name: 'Sourdough',
  price: 4.50
}, {
  seller: bakery.hash,
  inputs: [flour.hash, water.hash, yeast.hash]
})

// Update (creates new block, old one preserved)
const updated = fb.update(bread.hash, 'substance.product', {
  name: 'Sourdough',
  price: 5.00
}, { seller: bakery.hash })
// updated.refs.updates === bread.hash

// Sign and verify
const keys = fb.generateKeypair()
const signed = fb.sign(bread, farm.hash, keys.privateKey)
const valid = fb.verify(signed, keys.publicKey) // true

// Provenance chain
const history = await fb.chain(updated.hash, resolve)
// [{ price: 5.00 }, { price: 4.50 }] — newest to oldest
```

## Sandbox

Try it locally with zero setup:

```bash
cd sandbox
node server.js
```

```bash
# List all blocks
curl localhost:3111/blocks

# Filter by type
curl localhost:3111/blocks?type=substance.product

# Get head blocks only (latest versions)
curl localhost:3111/blocks?type=substance.product&heads=true

# Provenance chain
curl localhost:3111/chain/<hash>

# Create a block
curl -X POST localhost:3111/blocks \
  -H "Content-Type: application/json" \
  -d '{"type":"observe.review","state":{"rating":5,"text":"Amazing"},"refs":{"subject":"<product_hash>"}}'
```

The sandbox ships preloaded with 32 blocks modelling a complete bakery supply chain — from farm to consumer, including certifications, shipments, cold chain readings, and reviews.

## API

### `create(type, state, refs) → block`

Create a new FoodBlock. Returns `{ hash, type, state, refs }`.

### `update(previousHash, type, state, refs) → block`

Create an update block that supersedes a previous version. Automatically adds `refs.updates`.

### `hash(type, state, refs) → string`

Compute the SHA-256 hash without creating a block object.

### `chain(hash, resolve, opts) → block[]`

Follow the update chain backwards. `resolve` is `async (hash) => block | null`.

### `tree(hash, resolve, opts) → { block, ancestors }`

Follow ALL refs recursively to build the full provenance tree.

### `head(hash, resolveForward) → string`

Find the latest version in an update chain.

### `sign(block, authorHash, privateKey) → wrapper`

Sign a block with Ed25519. Returns `{ foodblock, author_hash, signature }`.

### `verify(wrapper, publicKey) → boolean`

Verify a signed block wrapper.

### `generateKeypair() → { publicKey, privateKey }`

Generate a new Ed25519 keypair for signing.

### `query(resolve) → Query`

Fluent query builder:

```javascript
const results = await fb.query(resolver)
  .type('substance.product')
  .byRef('seller', bakeryHash)
  .whereLt('price', 10)
  .latest()
  .limit(20)
  .exec()
```

## Protocol Rules

1. A FoodBlock is a JSON object with exactly three fields: `type`, `state`, `refs`.
2. Identity is `SHA-256(canonical(type + state + refs))`.
3. Blocks are append-only. No block is ever modified or deleted.
4. Updates create a new block with `refs: { updates: previous_hash }`.
5. Genesis blocks (empty refs) establish entity identity.
6. Base type determines expected refs schema (conventions, not enforcement).
7. Authentication: `{ foodblock, author_hash, signature }` using Ed25519.
8. Encrypted state: keys prefixed with `_` contain encrypted values.
9. Any system understanding the six base types can process any FoodBlock.
10. The protocol is open. No registration, licensing, or permission required.

## Canonical JSON

Deterministic hashing requires deterministic serialization:

- Keys sorted lexicographically at every nesting level
- No whitespace between tokens
- Numbers: no trailing zeros, no leading zeros
- Strings: Unicode NFC normalization
- Arrays in `refs`: sorted lexicographically (set semantics)
- Arrays in `state`: preserve declared order (sequence semantics)
- Null values: omitted

## Database Schema

```sql
CREATE TABLE foodblocks (
    hash        VARCHAR(64) PRIMARY KEY,
    type        VARCHAR(100) NOT NULL,
    state       JSONB NOT NULL DEFAULT '{}',
    refs        JSONB NOT NULL DEFAULT '{}',
    author_hash VARCHAR(64),
    signature   TEXT,
    chain_id    VARCHAR(64),
    is_head     BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

Full schema with indexes and triggers: [`sql/schema.sql`](sql/schema.sql)

## Cross-Language Test Vectors

[`test/vectors.json`](test/vectors.json) contains known inputs and expected hashes. Any SDK in any language must produce identical hashes for these inputs. If JavaScript and Python disagree, the protocol is broken.

## Project Structure

```
foodblock/
├── spec/whitepaper.md           Protocol specification
├── sdk/javascript/              JavaScript SDK
│   ├── src/                     Source code
│   └── test/                    Test suite (31 tests)
├── sandbox/                     Local sandbox server
│   ├── server.js                Zero-dependency HTTP API
│   └── seed.js                  Sample bakery supply chain
├── sql/schema.sql               Postgres schema + triggers
├── test/vectors.json            Cross-language test vectors
└── LICENSE                      MIT
```

## Sector Coverage

The six base types cover all fourteen food industry sectors:

| Sector | Key Types |
|--------|-----------|
| Primary Production | `actor.producer`, `place.farm`, `transform.harvest` |
| Processing | `actor.maker`, `transform.process`, `observe.inspection` |
| Distribution | `actor.distributor`, `transfer.shipment`, `observe.reading` |
| Retail | `substance.product`, `transfer.order` |
| Hospitality | `actor.venue`, `transfer.booking`, `observe.review` |
| Food Service | `observe.plan`, `transform.process` |
| Waste & Sustainability | `actor.sustainer`, `substance.surplus`, `transfer.donation` |
| Regulation | `actor.authority`, `observe.certification` |
| Education & Media | `actor.creator`, `observe.post` |
| Community | `actor.group`, `observe.event` |
| Health & Nutrition | `actor.professional`, `observe.assessment` |
| Finance | `transfer.investment`, `observe.market` |
| Cultural Food | `observe.certification`, `place.region` |
| Food Technology | `actor.innovator`, `observe.experiment` |

## License

MIT — use it however you want.

## Links

- [Whitepaper](spec/whitepaper.md)
- [Test Vectors](test/vectors.json)
- [Schema](sql/schema.sql)
