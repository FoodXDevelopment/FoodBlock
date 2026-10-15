# FoodBlock Canonical Serialization Specification

**Version:** FoodBlock 1.6
**Status:** Normative
**Purpose:** This document defines the canonical serialization algorithm used to compute FoodBlock content hashes. Implementations in any language MUST follow these rules exactly to produce identical hashes for identical blocks.

## Overview

A FoodBlock is defined by three fields: `type` (string), `state` (object), and `refs` (object). The content hash is computed as:

```
hash = SHA-256(canonical(type, state, refs))
```

where `canonical()` produces a deterministic UTF-8 JSON string.

## Algorithm

### Input

The `canonical()` function takes three arguments:
1. `type` — a string (e.g., `"thing"`). The seven 1.6 types are listed in `protocol.json`; older names (`place`, `substance`, `schema`) hash the same way, because the canonical form never reads the type
2. `state` — a JSON object (block properties)
3. `refs` — a JSON object (references to other blocks by hash)

### Step 1: Construct the canonical object

```
obj = { "type": type, "state": state, "refs": refs }
```

### Step 2: Serialize with canonical rules

The object is serialized to a JSON string following these rules:

#### Rule 1: Lexicographic key ordering
All object keys at every nesting level are sorted in Unicode lexicographic order. Order is by UTF-16 code units, as JavaScript's default sort compares strings; the same order sorts string arrays in `refs` (Rule 5). It differs from code-point order only for characters outside the Basic Multilingual Plane, and every implementation must follow it.

**Example:** `{"b":1,"a":2}` → `{"a":2,"b":1}`

#### Rule 2: No whitespace
No spaces, tabs, or newlines between tokens. Compact JSON only.

**Correct:** `{"a":1,"b":2}`
**Wrong:** `{"a": 1, "b": 2}`

#### Rule 3: Number encoding
- No trailing decimal zeros: `1` not `1.0`
- No leading zeros: `0.5` not `00.5`
- No positive sign: `1` not `+1`
- Negative zero is encoded as `0`
- `Infinity` and `NaN` are not allowed (MUST throw an error)
- Floats are refused when writing (protocol.md, Encoding): money is `{minor, currency}`, an amount `{value, unit}` with a decimal string. This rule itself is unchanged, so every existing hash stays valid.
- A number in old data is written exactly as JavaScript writes it (ECMAScript `Number::toString`): `1e+21`, `1e-7`, `0.000001`, `123.456`. Never as another language's default (`1e-07`).

#### Rule 4: String encoding — Unicode NFC
All string values MUST be normalized to Unicode NFC form before JSON encoding. Writers write object keys already in NFC; a non-NFC key is refused on write. Readers hash exactly as these rules say (sort, then serialise). JSON string escaping follows the standard JSON specification (RFC 8259).

**Example:** `"café"` (composed) not `"café"` (decomposed `e` + combining accent)

#### Rule 5: Array handling in refs — set semantics
Arrays that appear anywhere inside the `refs` object AND contain only string elements are sorted lexicographically before serialization. This gives refs set semantics — the order of participants, tags, or hash lists does not affect the hash.

**Example:** `refs.participants = ["hash_b", "hash_a"]` → serialized as `["hash_a","hash_b"]`

Non-string arrays in refs, and all arrays in state, preserve their declared order.

#### Rule 6: Array handling in state — sequence semantics
Arrays inside the `state` object preserve their original order. This respects ordered data like recipe steps, ingredient lists, and item arrays.

**Example:** `state.steps = ["mix", "bake"]` → serialized as `["mix","bake"]` (order preserved)

#### Rule 7: Null omission
`null` and `undefined` values are omitted entirely. Keys with null values do not appear in the output, and nulls inside arrays are dropped.

**Example:** `{"a":1,"b":null,"c":3}` → `{"a":1,"c":3}`

### Step 3: Compute SHA-256

The canonical JSON string is encoded as UTF-8 bytes, then hashed with SHA-256. The result is a 64-character lowercase hexadecimal string.

```
hash = hex(SHA-256(utf8_bytes(canonical_json)))
```

## Complete Example

**Input:**
```json
type: "thing"
state: { "name": "Sourdough", "price": { "minor": 450, "currency": "GBP" }, "weight": { "value": "0.8", "unit": "kg" }, "tags": null }
refs: { "author": "abc123", "kind": "def456" }
```

**Step 1 — Construct:**
```json
{ "type": "thing", "state": { "name": "Sourdough", "price": { "minor": 450, "currency": "GBP" }, "weight": { "value": "0.8", "unit": "kg" }, "tags": null }, "refs": { "author": "abc123", "kind": "def456" } }
```

**Step 2 — Canonical serialize:**
- Top-level keys sorted: `refs`, `state`, `type`
- `state` keys sorted: `name`, `price`, `weight` (tags omitted — null); nested keys sorted too: `currency`, `minor` and `unit`, `value`
- `refs` keys sorted: `author`, `kind`
- Numbers: `450` (an integer); the amount `"0.8"` is a string, never a float

```
{"refs":{"author":"abc123","kind":"def456"},"state":{"name":"Sourdough","price":{"currency":"GBP","minor":450},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}
```

**Step 3 — SHA-256:**
```
hash = SHA-256(the string above)
     = ac1c39cfaf51942db52fbbda1b7c2451473e164a8dae7b05d59a8f900154b4ee
```

## Edge Cases

| Input | Canonical Output | Rationale |
|-------|-----------------|-----------|
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
| `state: { "x": { "refs": ["b","a"] } }` | `"state":{"x":{"refs":["a","b"]}}` | Any object key named `refs`, at any depth, gives its string arrays set order |

## Verification

Any two conforming implementations MUST produce identical hashes for identical inputs. Test vectors: `spec/canonical-vectors.json` (adversarial cases, run with `node spec/run-vectors.cjs`) and `test/vectors.json` (cross-language, each with its `expected_canonical` and `expected_hash`). Older vectors there use pre-1.6 type names and floats; they still hash the same, because the canonical rule is unchanged.

## Security Considerations

- The canonical form is used as the pre-image for SHA-256. Any ambiguity in serialization would allow hash collisions for semantically identical blocks.
- Unicode NFC normalization prevents equivalent-but-different byte sequences from producing different hashes.
- Lexicographic key ordering prevents object key insertion order from affecting the hash.
- Null omission prevents `{"a":null}` and `{}` from producing different hashes when semantically identical.

## Signatures

When a block is signed, the signature covers the same canonical string:

```
signature = Ed25519_sign(private_key, utf8_bytes(canonical(type, state, refs)))
```

Verification:
```
valid = Ed25519_verify(public_key, utf8_bytes(canonical(type, state, refs)), signature)
```

The signing key is one of the author's live keys: the genesis's `state.public_key_sign`, or a key brought in by a `grant` of kind key (protocol.md, Who someone is). The reader tries each live key.
