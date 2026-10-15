# FoodBlock Canonical Serialization Specification

**Version:** FoodBlock 1.6
**Status:** Normative
**Purpose:** The one exact byte form of a block, so every implementation in any language gets the same hash. Follow these rules exactly.

## Overview

A FoodBlock is three fields: `type` (a string), `state` (an object) and `refs` (an object). Its hash is

```
hash = SHA-256(canonical(type, state, refs))
```

where `canonical()` makes one exact UTF-8 JSON string. The seven 1.6 types are in `protocol.json`; older names (`place`, `substance`, `schema`) hash the same way, because the canonical form never reads the type.

## Algorithm

Build `{ "type": type, "state": state, "refs": refs }` and write it with these rules.

1. **Key order.** Every object's keys are sorted at every depth, by UTF-16 code units, as JavaScript's default sort compares strings. This differs from code-point order only outside the Basic Multilingual Plane, and every implementation must follow it. The same order sorts the string arrays of Rule 5.
2. **No whitespace.** Compact JSON: `{"a":1,"b":2}`.
3. **Numbers.** No trailing decimal zeros (`1`, not `1.0`), no leading zeros, no `+` sign. Negative zero is `0`. `Infinity` and `NaN` are an error. Writers refuse floats (modules/encoding.md, Numbers); this rule only keeps old hashes valid (Inherited quirks).
4. **Strings are Unicode NFC.** Values are normalised before encoding. Writers write keys already in NFC and refuse a block with a key that is not; readers hash the keys as sent (sort, then serialise). Escaping follows RFC 8259.
5. **Sets in `refs`.** A string array under a key named `refs` is sorted (Inherited quirks). An array holding anything but strings keeps its order.
6. **Sequences in `state`.** Every other array keeps its declared order.
7. **Nulls are dropped.** A key with `null` or `undefined` is left out; a null inside an array is dropped.

The string is encoded as UTF-8 and hashed with SHA-256; the hash is 64 lowercase hex characters.

## Inherited quirks

Three rules exist only because blocks from earlier versions exist. Each is kept because changing it would change every existing hash.
- **Nulls are dropped**, in objects and in arrays.
- **String arrays under any key named `refs`, at any depth, are set-sorted.** That means the top-level `refs` and anything inside it, and also a key called `refs` inside `state`.
- **Legacy floats are written as JavaScript writes them** (ECMAScript `Number::toString`): `1e+21`, `1e-7`, `0.000001`, `123.456`; never as another language's default (`1e-07`). New blocks hold no floats.

## Complete example

**Input:**
```
type: "thing"
state: { "name": "Sourdough", "price": { "minor": 450, "currency": "GBP" }, "weight": { "value": "0.8", "unit": "kg" }, "tags": null }
refs: { "author": "abc123", "kind": "def456" }
```

**Canonical string** (keys sorted at every depth, `tags` dropped as null, `450` an integer, `"0.8"` a string):
```
{"refs":{"author":"abc123","kind":"def456"},"state":{"name":"Sourdough","price":{"currency":"GBP","minor":450},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}
```

**Hash:** `ac1c39cfaf51942db52fbbda1b7c2451473e164a8dae7b05d59a8f900154b4ee`

## Edge cases

| Input | Canonical output | Why |
|---|---|---|
| `state: {}` | `"state":{}` | Empty objects are preserved |
| `state: { "a": [] }` | `"state":{"a":[]}` | Empty arrays are preserved |
| `refs: { "participants": ["b","a"] }` | `"refs":{"participants":["a","b"]}` | String arrays in refs are sorted |
| `state: { "steps": ["b","a"] }` | `"state":{"steps":["b","a"]}` | Arrays in state preserve order |
| `state: { "x": null }` | `"state":{}` | Null values omitted |
| `state: { "n": -0 }` | `"state":{"n":0}` | Negative zero → zero |
| `state: { "n": 1.0 }` | `"state":{"n":1}` | No trailing decimal zeros |
| `refs: { "tags": [1, "a"] }` | `"refs":{"tags":[1,"a"]}` | Mixed arrays NOT sorted |
| `state: { "a": [1, null, 2] }` | `"state":{"a":[1,2]}` | Nulls inside arrays are dropped (Rule 7) |
| `state: { "n": 1e21 }` (old data) | `"state":{"n":1e+21}` | JavaScript's number form |
| `state: { "n": 1e-7 }` (old data) | `"state":{"n":1e-7}` | JavaScript's number form |
| a key not in NFC (`"é"` decomposed) | refused | Keys are written in NFC (Rule 4); a writer refuses the block |
| `state: { "x": { "refs": ["b","a"] } }` | `"state":{"x":{"refs":["a","b"]}}` | A key named `refs`, at any depth |

## Verification

Two conforming implementations produce identical hashes for identical inputs. Vectors: `spec/canonical-vectors.json` (adversarial cases, run with `node spec/run-vectors.cjs`) and `test/vectors.json` (cross-language, each with its `expected_canonical` and `expected_hash`). Older vectors there use pre-1.6 type names and floats; they still hash the same.

## Signatures

When a block is signed, the signature covers the same canonical string:

```
signature = Sign_alg(private_key, utf8_bytes(canonical(type, state, refs)))   (Ed25519 by default)
```

Verification:
```
valid = Verify_alg(public_key, utf8_bytes(canonical(type, state, refs)), signature)
```

The signing key is one of the author's live keys: the genesis's `state.public_key_sign`, or a key brought in by a `grant` of kind key (modules/identity.md). The reader tries each live key with that key's own algorithm (`alg_sign`, default ed25519; `algs` in `protocol.json`).

## Compact form

A block sent as CBOR (modules/encoding.md) is still hashed and signed as the canonical JSON above. A receiver rebuilds the JSON first. The hash never covers CBOR bytes.
