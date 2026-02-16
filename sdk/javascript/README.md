# @foodxdev/foodblock

SDK for the FoodBlock Protocol — a content-addressable data primitive for universal food data.

## Install

```bash
npm install @foodxdev/foodblock
```

## Quick Start

```js
const { create, update, chain } = require('@foodxdev/foodblock')

// Create a block
const farm = create('actor.producer', { name: 'Green Acres Farm' })
// => { hash: 'a1b2c3...', type: 'actor.producer', state: {...}, refs: {} }

// Create with references
const bread = create('substance.product', { name: 'Sourdough', price: 4.50 }, {
  seller: farm.hash
})

// Update a block (creates a new block referencing the previous)
const updated = update(bread.hash, 'substance.product', { name: 'Sourdough', price: 5.00 })
// updated.refs.updates === bread.hash

// Follow the provenance chain
const history = await chain(updated.hash, async (hash) => {
  // your resolver: fetch block by hash from DB/API
  return await fetch(`/blocks/${hash}`).then(r => r.json())
})
```

## Base Types

FoodBlock defines 6 base types. Subtypes use dot notation (e.g. `actor.producer`).

| Type | Description |
|------|-------------|
| `actor` | People, orgs, devices, agents |
| `place` | Locations, facilities, appliances |
| `substance` | Ingredients, products, materials |
| `transform` | Processes that change substances |
| `transfer` | Movement of substances between actors |
| `observe` | Reviews, scans, certifications |

## API

### `create(type, state?, refs?)`

Create a new FoodBlock. Returns `{ hash, type, state, refs }`.

- `type` — string, required (e.g. `'substance.product'`)
- `state` — object, the block's data
- `refs` — object, references to other blocks by hash

The hash is `SHA-256(canonical(type + state + refs))` — deterministic and content-addressable.

### `update(previousHash, type, stateChanges?, additionalRefs?)`

Create an update block that supersedes a previous block. Adds `refs.updates` pointing to the previous hash.

### `hash(type, state?, refs?)`

Compute the SHA-256 hash without creating a full block object.

### `canonical(type, state, refs)`

Produce the deterministic canonical JSON string used for hashing.

### `chain(startHash, resolve, opts?)`

Follow the `updates` chain backwards. `resolve` is `async (hash) => block | null`. Returns array from newest to oldest.

### `tree(startHash, resolve, opts?)`

Follow ALL refs recursively to build the full provenance tree.

### `generateKeypair()`

Generate an Ed25519 keypair for signing. Returns `{ publicKey, privateKey }` as hex strings.

### `sign(block, authorHash, privateKeyHex)`

Sign a block. Returns `{ foodblock, author_hash, signature }`.

### `verify(wrapper, publicKeyHex)`

Verify a signed block wrapper. Returns `true` or `false`.

### `createAgent(name, operatorHash, opts?)`

Create an AI agent identity with its own keypair. Returns an agent object with a `.sign()` method.

## Canonical Form Rules

1. Keys sorted lexicographically at every nesting level
2. No whitespace
3. Numbers: no trailing zeros, no leading zeros
4. Strings: Unicode NFC normalization
5. Arrays in `refs`: sorted lexicographically (set semantics)
6. Arrays in `state`: preserve declared order (sequence semantics)
7. Null values: omitted

## Sandbox

Try the live sandbox at [api.foodx.world/foodblock](https://api.foodx.world/foodblock/)

## License

MIT
