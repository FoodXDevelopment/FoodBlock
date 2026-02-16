# foodblock

SDK for the FoodBlock Protocol — a content-addressable data primitive for universal food data.

## Install

```bash
pip install foodblock
```

## Quick Start

```python
from foodblock import create, update, chain

# Create a block
farm = create('actor.producer', {'name': 'Green Acres Farm'})
# => {'hash': 'a1b2c3...', 'type': 'actor.producer', 'state': {...}, 'refs': {}}

# Create with references
bread = create('substance.product', {'name': 'Sourdough', 'price': 4.50}, {
    'seller': farm['hash']
})

# Update a block (creates a new block referencing the previous)
updated = update(bread['hash'], 'substance.product', {'name': 'Sourdough', 'price': 5.00})
# updated['refs']['updates'] == bread['hash']
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

### `create(type_, state=None, refs=None)`

Create a new FoodBlock. Returns `{'hash', 'type', 'state', 'refs'}`.

### `update(previous_hash, type_, state=None, refs=None)`

Create an update block that supersedes a previous block.

### `compute_hash(type_, state=None, refs=None)`

Compute the SHA-256 hash without creating a full block object.

### `canonical(type_, state, refs)`

Produce the deterministic canonical JSON string used for hashing.

### `chain(start_hash, resolve, max_depth=100)`

Follow the `updates` chain backwards. `resolve` is `async (hash) -> block or None`.

### `tree(start_hash, resolve, max_depth=20)`

Follow ALL refs recursively to build the full provenance tree.

### `generate_keypair()`

Generate an Ed25519 keypair. Returns `{'public_key', 'private_key'}` as hex strings.

### `sign(block, author_hash, private_key_hex)`

Sign a block. Returns `{'foodblock', 'author_hash', 'signature'}`.

### `verify(wrapper, public_key_hex)`

Verify a signed block wrapper. Returns `True` or `False`.

## Cross-Language Compatibility

The Python and JavaScript SDKs produce identical hashes for the same input. This is verified by shared test vectors.

## Sandbox

Try the live sandbox at [api.foodx.world/foodblock](https://api.foodx.world/foodblock/)

## License

MIT
