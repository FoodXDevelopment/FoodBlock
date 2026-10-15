# FoodBlock canonical form

**Version:** FoodBlock 1.6
**Status:** Normative
**Purpose:** The one exact byte form of a block, so every implementation in any language gets the same id.

## The rule in one line

The canonical form is **RFC 8785** (the JSON Canonicalization Scheme, JCS), applied to a block that already follows the **strict writing** rules below. The id is the hash of those bytes:

```
id = Hash_suite( JCS({ "type": type, "state": state, "refs": refs }) )
```

`Hash_suite` is the hash of the signing key's suite (core.md, Suites): SHA-256 written as 64 lowercase hex characters, or another hash written with its name as a prefix (`sm3:...`).

## What RFC 8785 gives

Cite it; do not copy it. In short:
- Object keys are sorted by UTF-16 code units, at every depth.
- No whitespace.
- Strings use the shortest JSON escapes, in UTF-8.
- Numbers are written as ECMAScript writes them. FoodBlock allows only integers (core.md, section 3), so a number is plain digits with an optional leading `-`.

## Strict writing

JCS fixes the bytes. These rules fix the content. A writer follows them. A reader **refuses** a block that breaks one (`not_canonical`, or the code in brackets) and never repairs it. Nothing is sorted, dropped or normalised on the way in.

1. **Three fields.** The block is exactly `type`, `state` and `refs`.
2. **No null, no float.** A key with `null` is refused, so is a `null` in an array (`not_canonical`). A number with a fraction or exponent is refused (`float`).
3. **Integers only** within ±(2^53 - 1) (`integer_range`). `-0` is refused.
4. **NFC.** Every string and every key is Unicode NFC, with no unpaired surrogates.
5. **Sorted sets.** A string array directly under a `refs` key is a set. It is written in ascending UTF-16 order, with no repeats. An array of anything else keeps its written order. A `refs` key inside `state` is an ordinary key: nothing is sorted there.
6. **No duplicate keys** in any object.
7. **Sorted audience.** `state.audience` is `"public"` or a sorted list with no repeats (privacy.md).

Every other array keeps its written order.

## Complete example

**Input** (ids shortened for reading; a real block has 64-hex ids):
```
type: "thing"
state: { "name": "Sourdough", "price": { "minor": 450, "currency": "GBP" }, "weight": { "value": "0.8", "unit": "kg" } }
refs: { "author": "abc123", "of": "def456" }
```

**Canonical string:**
```
{"refs":{"author":"abc123","of":"def456"},"state":{"name":"Sourdough","price":{"currency":"GBP","minor":450},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}
```

**Id** (SHA-256): `7bda2dba2c55126f32646c376de02d3f7d91a21ff956336649307dd6e7c0d51d`

## Edge cases

| Input | Result | Why |
|---|---|---|
| `state: {}` | `"state":{}` | Empty objects are kept |
| `state: { "a": [] }` | `"state":{"a":[]}` | Empty arrays are kept |
| `refs: { "participants": ["a","b"] }` | as written | Sorted set |
| `refs: { "participants": ["b","a"] }` | refused | Set not sorted |
| `refs: { "participants": ["a","a"] }` | refused | Repeat in a set |
| `state: { "steps": ["b","a"] }` | `"steps":["b","a"]` | State arrays keep order |
| `state: { "x": null }` | refused | No null |
| `state: { "n": 1.0 }`, `1e21`, `-0` | refused | No float, no negative zero |
| a key or string not in NFC | refused | NFC only |
| `state: { "x": { "refs": ["b","a"] } }` | as written | Only the top-level `refs` holds sets |
| keys `"😀"` and `"～"` | emoji sorts first | UTF-16 order; code-point order would put it last |

## Signatures

The signature covers the same canonical bytes:

```
signature = Sign_alg( private_key, JCS(block) )
valid     = Verify_alg( public_key, JCS(block), signature )
```

The key is one of the author's live keys: the genesis `state.public_key_sign`, or a key brought in by a key grant (modules/identity.md). The reader tries each live key with that key's suite. The algorithms, key bytes and signature bytes are in core.md.

## The compact form

A block sent as CBOR (modules/encoding.md) is still hashed and signed as the JCS bytes above. The receiver rebuilds the JSON first. The id never covers CBOR bytes.

## Checking an implementation

Vectors: `spec/canonical-vectors.json` and `spec/vectors.json`. Two conforming implementations give the same id for the same block, and both refuse the same bad blocks.
