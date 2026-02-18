# FoodBlock

A content-addressable protocol for universal food data.

One axiom. Three fields. Six base types. Every food industry operation.

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

## Quick Start — `fb()`

The fastest way to use FoodBlock. Describe food in plain English, get structured blocks back.

```javascript
const { fb } = require('foodblock')

fb("Sourdough bread, $4.50, organic, contains gluten")
// => { type: 'substance.product', state: { name: 'Sourdough bread', price: { value: 4.5, unit: 'USD' }, organic: true, allergens: { gluten: true } }, blocks: [...] }

fb("Amazing pizza at Luigi's, 5 stars")
// => { type: 'observe.review', state: { name: "Luigi's", rating: 5, text: "..." }, blocks: [...] }

fb("Green Acres Farm, 200 acres, organic wheat in Oregon")
// => { type: 'actor.producer', state: { name: 'Green Acres Farm', acreage: 200, crop: 'organic wheat', region: 'Oregon' }, blocks: [...] }

fb("Walk-in cooler temperature 4 celsius")
// => { type: 'observe.reading', state: { temperature: { value: 4, unit: 'celsius' } }, blocks: [...] }

fb("Ordered 50kg flour from Stone Mill")
// => { type: 'transfer.order', state: { weight: { value: 50, unit: 'kg' } }, blocks: [...] }
```

No types to memorize. No schemas to configure. No API calls — `fb()` is pure pattern matching, runs locally, costs nothing.

## Programmatic API

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
// signed.protocol_version === '0.4.0'
const valid = fb.verify(signed, keys.publicKey) // true

// Provenance chain
const history = await fb.chain(updated.hash, resolve)
// [{ price: 5.00 }, { price: 4.50 }] — newest to oldest

// Validate against schema
const errors = fb.validate(bread)  // [] if valid

// Tombstone (GDPR erasure)
const ts = fb.tombstone(bread.hash, user.hash, { reason: 'gdpr_erasure' })

// Offline queue
const queue = fb.offlineQueue()
queue.create('transfer.order', { total: 12.00 }, { seller: farmHash })
await queue.sync('https://api.example.com/foodblock')

// --- Human Interface ---

// Aliases: use @names instead of hashes
const reg = fb.registry()
const myFarm = reg.create('actor.producer', { name: 'Green Acres' }, {}, { alias: 'farm' })
const myWheat = reg.create('substance.ingredient', { name: 'Wheat' }, { source: '@farm' })
// '@farm' resolves to myFarm.hash automatically

// FoodBlock Notation: one-line text format
const blocks = fb.parseAll(`
@farm = actor.producer { "name": "Green Acres Farm" }
@wheat = substance.ingredient { "name": "Wheat" } -> source: @farm
`)

// Explain: human-readable narrative from graph
const story = await fb.explain(bread.hash, resolve)
// "Sourdough ($4.50). By Green Acres Bakery. Made from Organic Flour (Green Acres Farm)."

// URIs: shareable block references
fb.toURI(bread)                          // 'fb:a1b2c3...'
fb.toURI(bread, { alias: 'sourdough' })  // 'fb:substance.product/sourdough'

// --- Templates ---

// Use built-in templates for common patterns
const chain = fb.fromTemplate(fb.TEMPLATES['supply-chain'], {
  farm: { state: { name: 'Green Acres Farm' } },
  crop: { state: { name: 'Organic Wheat' } },
  processing: { state: { name: 'Stone Milling' } },
  product: { state: { name: 'Flour', price: 3.20 } }
})
// Returns 5 blocks in dependency order, with @alias refs auto-resolved

// Create custom templates
const myTemplate = fb.createTemplate('Bakery Review', 'Review a bakery product', [
  { type: 'actor.venue', alias: 'bakery', required: ['name'] },
  { type: 'substance.product', alias: 'item', refs: { seller: '@bakery' } },
  { type: 'observe.review', alias: 'review', refs: { subject: '@item' }, required: ['rating'] }
])

// --- Federation ---

// Discover another FoodBlock server
const info = await fb.discover('https://farm.example.com')
// { protocol: 'foodblock', version: '0.4.0', types: [...], count: 142 }

// Resolve blocks across multiple servers
const resolve = fb.federatedResolver([
  'http://localhost:3111',
  'https://farm.example.com',
  'https://market.example.com'
])
const block = await resolve('a1b2c3...')  // tries each server in order
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

# Batch create (offline sync)
curl -X POST localhost:3111/blocks/batch \
  -H "Content-Type: application/json" \
  -d '{"blocks":[...]}'

# Tombstone (content erasure)
curl -X DELETE localhost:3111/blocks/<hash>

# Federation discovery
curl localhost:3111/.well-known/foodblock

# List templates
curl localhost:3111/blocks?type=observe.template

# Natural language entry point
curl -X POST localhost:3111/fb \
  -H "Content-Type: application/json" \
  -d '{"text":"Sourdough bread, $4.50, organic, contains gluten"}'

# Forward traversal (what references this block?)
curl localhost:3111/forward/<hash>

# Natural language → blocks
curl -X POST localhost:3111/fb \
  -H "Content-Type: application/json" \
  -d '{"text":"Sourdough bread, $4.50, organic, contains gluten"}'

# List vocabularies
curl localhost:3111/blocks?type=observe.vocabulary
```

The sandbox ships preloaded with 47 blocks modelling a complete bakery supply chain — from farm to consumer, including certifications, shipments, cold chain readings, reviews, and operational vocabularies.

## API

### `fb(text) → { blocks, primary, type, state, text }`

The natural language entry point. Pass any food-related text, get FoodBlocks back. Detects intent (product, review, farm, order, certification, reading, process, venue, ingredient), extracts quantities (price, weight, volume, temperature, rating), flags (organic, gluten-free, kosher, etc.), and relationships ("from X", "at Y", "by Z"). No LLM — pure regex pattern matching against built-in vocabularies.

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

Sign a block with Ed25519. Returns `{ foodblock, author_hash, signature, protocol_version }`.

### `verify(wrapper, publicKey) → boolean`

Verify a signed block wrapper.

### `generateKeypair() → { publicKey, privateKey }`

Generate a new Ed25519 keypair for signing.

### `encrypt(value, recipientPublicKeys) → envelope`

Encrypt a value for multiple recipients using envelope encryption (Section 7.2).

### `decrypt(envelope, privateKey, publicKey) → value`

Decrypt an encryption envelope.

### `validate(block, schema?) → string[]`

Validate a block against its declared schema or a provided schema. Returns an array of error messages (empty = valid).

### `tombstone(targetHash, requestedBy, opts?) → block`

Create a tombstone block for content erasure (Section 5.4).

### `offlineQueue() → Queue`

Create an offline queue for local-first block creation with batch sync.

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

### `registry() → Registry`

Alias registry for human-readable references. Use `@name` in refs instead of hashes.

### `parse(line) → { alias, type, state, refs }`

Parse a single line of FoodBlock Notation (FBN).

### `parseAll(text) → block[]`

Parse multiple lines of FBN.

### `format(block, opts?) → string`

Format a block as FBN text.

### `explain(hash, resolve) → string`

Generate a human-readable narrative from a block's provenance graph.

### `toURI(block, opts?) → string`

Convert a block to a `fb:` URI. `toURI(block)` → `fb:<hash>`, `toURI(block, { alias: 'name' })` → `fb:<type>/<alias>`.

### `fromURI(uri) → object`

Parse a `fb:` URI into `{ hash }` or `{ type, alias }`.

### `createTemplate(name, description, steps, opts?) → block`

Create a template block (`observe.template`) that defines a reusable workflow pattern.

### `fromTemplate(template, values) → block[]`

Instantiate a template into real blocks. `values` maps step aliases to `{ state, refs }` overrides. `@alias` references between steps are resolved automatically.

### `TEMPLATES`

Built-in templates: `supply-chain`, `review`, `certification`.

### `discover(serverUrl, opts?) → info`

Fetch a server's `/.well-known/foodblock` discovery document.

### `federatedResolver(servers, opts?) → resolve`

Create a resolver that tries multiple servers in priority order. Returns `async (hash) => block | null` with optional caching.

### `createVocabulary(domain, forTypes, fields, opts?) → block`

Create a vocabulary block (`observe.vocabulary`) defining canonical field names, types, and natural language aliases for a domain.

### `mapFields(text, vocabulary) → { matched, unmatched }`

Extract field values from natural language text using a vocabulary's aliases. Returns matched fields and unmatched terms.

### `VOCABULARIES`

Built-in vocabulary definitions: `bakery`, `restaurant`, `farm`, `retail`, `lot`, `units`, `workflow`.

### `quantity(value, unit, type?) → { value, unit }`

Create a quantity object. Validates unit against the `units` vocabulary if `type` is provided (e.g. `'weight'`, `'volume'`, `'temperature'`).

### `transition(from, to) → boolean`

Validate a workflow state transition against the `workflow` vocabulary's transition map (e.g. `draft→order` is valid, `draft→shipped` is not).

### `nextStatuses(status) → string[]`

Get valid next statuses for a given workflow status.

### `localize(block, locale, fallback?) → block`

Extract locale-specific text from multilingual state fields. Fields using `{ en: "...", fr: "..." }` nested objects are resolved to the requested locale.

### `forward(hash, resolveForward) → { referencing, count }`

Find all blocks that reference a given hash. Returns blocks grouped by ref role.

### `recall(sourceHash, resolveForward, opts?) → { affected, depth, paths }`

Trace contamination/recall paths downstream via BFS. Starting from a source block, follows all forward references recursively. Supports `types` and `roles` filters.

### `downstream(ingredientHash, resolveForward) → block[]`

Find all downstream substance blocks that use a given ingredient (convenience wrapper around `recall`).

### `merkleize(state) → { root, leaves, tree }`

Build a Merkle tree from a state object for selective disclosure.

### `selectiveDisclose(state, fieldNames) → { disclosed, proof, root }`

Reveal only specific fields with a Merkle proof that they belong to the block.

### `verifyProof(disclosed, proof, root) → boolean`

Verify a selective disclosure proof.

### `merge(hashA, hashB, resolve, opts?) → block`

Create a merge block resolving a fork between two update chain heads.

### `attest(targetHash, attestorHash, opts?) → block`

Create an attestation block confirming a claim. `opts.confidence`: `verified`, `probable`, `unverified`.

### `dispute(targetHash, disputerHash, reason) → block`

Create a dispute block challenging a claim.

### `trustScore(hash, allBlocks) → number`

Compute net trust score: attestations minus disputes.

### `createSnapshot(blocks, opts?) → block`

Summarize a set of blocks into a snapshot with a Merkle root for archival verification.

## The Axiom

**A FoodBlock's identity is its content:** `SHA-256(canonical(type + state + refs))`.

Everything follows from this:
- **Immutability** — change content, change identity
- **Determinism** — same content, same hash, anywhere
- **Deduplication** — identical products resolve to one block
- **Tamper evidence** — any modification is detectable
- **Offline validity** — no server needed to create blocks
- **Provenance** — refs form a directed graph of history

Seven operational rules govern the protocol's use:

1. A FoodBlock has exactly three fields: `type`, `state`, `refs`.
2. Authentication: `{ foodblock, author_hash, signature, protocol_version }` using Ed25519.
3. Encrypted state: `_` prefixed keys contain envelope-encrypted values.
4. Author-scoped updates: only the original author or approved actor may create successors.
5. Tombstones erase content while preserving graph structure.
6. Schema declarations are optional.
7. The protocol is open. No permission required.

## Canonical JSON

Deterministic hashing requires deterministic serialization. Aligns with [RFC 8785 (JSON Canonicalization Scheme)](https://tools.ietf.org/html/rfc8785) for number formatting and key ordering:

- Keys sorted lexicographically at every nesting level
- No whitespace between tokens
- Numbers: no trailing zeros, no leading zeros. `-0` normalized to `0`.
- Strings: Unicode NFC normalization
- Arrays in `refs`: sorted lexicographically (set semantics)
- Arrays in `state`: preserve declared order (sequence semantics)
- Null values: omitted
- Booleans: `true` or `false`

## Database Schema

```sql
CREATE TABLE foodblocks (
    hash             VARCHAR(64) PRIMARY KEY,
    type             VARCHAR(100) NOT NULL,
    state            JSONB NOT NULL DEFAULT '{}',
    refs             JSONB NOT NULL DEFAULT '{}',
    author_hash      VARCHAR(64),
    signature        TEXT,
    protocol_version VARCHAR(10) DEFAULT '0.3',
    chain_id         VARCHAR(64),
    is_head          BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT NOW()
);
```

Full schema with indexes, author-scoped head trigger, and tombstone trigger: [`sql/schema.sql`](sql/schema.sql)

## Cross-Language Test Vectors

[`test/vectors.json`](test/vectors.json) contains 30 known inputs and expected hashes — including tombstone blocks, schema references, vocabulary blocks, attestation blocks, merge blocks, RFC 8785 number edge cases, and more. Any SDK in any language must produce identical hashes for these inputs. If JavaScript and Python disagree, the protocol is broken.

## Project Structure

```
foodblock/
├── spec/whitepaper.md           Protocol specification (v0.4)
├── sdk/javascript/              JavaScript SDK (reference implementation)
│   ├── src/                     block, chain, verify, encrypt, validate, offline, tombstone,
│   │                            alias, notation, explain, uri, template, federation,
│   │                            vocabulary, forward, merge, merkle, snapshot, attestation
│   └── test/                    Test suite (104 tests)
├── sdk/python/                  Python SDK
│   ├── foodblock/               block, chain, verify, validate, tombstone,
│   │                            alias, notation, explain, uri, template, federation,
│   │                            vocabulary, forward, merge, merkle, snapshot, attestation
│   └── tests/                   Test suite (80 tests)
├── sdk/go/                      Go SDK
│   └── foodblock.go             block, chain, sign/verify, tombstone
├── sdk/swift/                   Swift SDK
│   └── Sources/                 block, tombstone
├── mcp/                         MCP server for AI agent integration (15 tools)
├── sandbox/                     Local sandbox server
│   ├── server.js                Zero-dependency HTTP API + federation discovery
│   └── seed.js                  47-block bakery chain + templates + vocabularies
├── sql/schema.sql               Postgres schema + triggers
├── test/vectors.json            Cross-language test vectors (30 vectors)
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

- [Whitepaper](spec/whitepaper.md) ([PDF](spec/whitepaper.pdf))
- [Technical Specification](spec/technical-whitepaper.md) ([PDF](spec/technical-whitepaper.pdf))
- [Test Vectors](test/vectors.json)
- [Schema](sql/schema.sql)
- [MCP Server](mcp/README.md)
