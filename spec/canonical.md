# FoodBlock canonical form

**Version:** FoodBlock 1.9
**Status:** Normative
**Purpose:** The one exact byte form of everything FoodBlock signs, hashes or sends as JSON, so every implementation in any language gets the same bytes and the same id.

## The one form

**The one form.** Everything FoodBlock signs, hashes or sends as JSON (a block, a header, a genesis, a request, an answer, a message, a commitment's value) is written in these bytes, and a reader takes such bytes only if they are exactly these. The bytes are UTF-8 text with no space or line break outside a string. An object is `{`, its members parted by `,`, then `}`; a member is its key written as a string, `:`, and its value. Members are in ascending order of the UTF-8 bytes of their keys' characters (not of their escapes), compared byte by byte, a shorter key before a longer one it begins; no key is written twice. An array is `[`, its values in the order written, parted by `,`, then `]`. A whole number is `0`, or an optional `-`, a digit 1 to 9, then any number of digits. `true` and `false` are written so; there is no null and no fraction. A string is `"`, its characters, `"`: `"` is written `\"`, `\` is `\\`, U+0008, U+0009, U+000A, U+000C and U+000D are `\b`, `\t`, `\n`, `\f`, `\r`, any other character below U+0020 is `\u00` and two lowercase hex digits, and every other character is itself. Text is well-formed UTF-8. Any other bytes are not canonical. Every value that has these bytes, and in which no object has a key above U+FFFF, has exactly the bytes RFC 8785 gives it.

## On the wire

**A message is its canonical bytes.** Everything FoodBlock sends as JSON (a block message, a sealed block, a request, an answer, a push, an export, an envelope's plaintext) is canonical JSON, whole: the bytes of the one form for the value they parse to. A reader keeps the bytes as they came and takes them only if they are exactly those bytes. Any difference refuses the message (`not_canonical`): a space, a key out of order, a repeated key, an escape that is not the one form's, a number not written as the one form writes it, bytes that are not UTF-8, text that is not JSON.

**A block's id is the hash of its bytes as they came.** In a block message they are the bytes after `{"block":` and before `,"signature":`. Those bytes must also be the canonical bytes of a value that follows strict writing (below), or the block is refused (`not_canonical`; core.md, section 8). No reader hashes bytes it rebuilt from text.

**Two limits are read on the bytes first.** A block's bytes longer than `limits.block_bytes`, or that open more than `limits.depth` levels (each `{` or `[` outside a string opens one), are `size_limit`, and nothing else is read.

**A refusal names bytes.** Its `hash` is the SHA-256 of the bytes refused, as they came. Bytes that are refused have no canonical form and no id.

Everything signed follows strict writing: a signed request, answer or header holds no float and no null. CBOR has no text: its reader rebuilds the value and writes the canonical bytes (encoding.md, The compact form).

## Strict writing

The one form fixes the bytes. These rules fix the content. A writer follows them. A reader **refuses** a block that breaks one (`not_canonical`, or the code in brackets) and never repairs it (On the wire).

1. **Three fields.** The block is exactly `type`, `state` and `refs`.
2. **No null.** A `null` anywhere is refused.
3. **Whole numbers only.** A number is a whole number from −(2^53 − 1) to 2^53 − 1. On the wire any other number token is not canonical (`not_canonical`): no reader turns a token into a float to judge it. `float` and `integer_range` are for a value that never was text: a number in CBOR, or a value handed to a writer.
4. **Well-formed text.** Every string and key is valid UTF-8 with no surrogate code point (core.md, section 3). No normal form is checked.
5. **Sorted sets.** In a block, an array that is the value of a member of the block's own top-level `refs`, and holds only strings, is a set. Its strings are in ascending order of their UTF-8 bytes, with no repeat. Every other array, a `refs` key inside `state` included, keeps its written order. An empty set is canonical, and `read` refuses it as `grammar`.

## Complete example

**Input** (ids shortened for reading; a real block has 64-hex ids):
```
type: "thing"
state: { "name": "Sourdough", "price": { "value": "4.5", "unit": "GBP" }, "weight": { "value": "0.8", "unit": "kg" } }
refs: { "author": "abc123", "of": "def456" }
```

**Canonical string:**
```
{"refs":{"author":"abc123","of":"def456"},"state":{"name":"Sourdough","price":{"unit":"GBP","value":"4.5"},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}
```

**Id** (SHA-256): `7b7fd20bcc0d15649d39156b6865a0d758daaf180377139d470d817c0e527629`

## Edge cases

| Input | Result | Why |
|---|---|---|
| `state: {}` | `"state":{}` | Empty objects are kept |
| `state: { "a": [] }` | `"state":{"a":[]}` | Empty arrays are kept |
| `refs: { "participants": ["a","b"] }` | as written | Sorted set |
| `refs: { "participants": ["b","a"] }` | refused | Set not sorted |
| `refs: { "participants": ["a","a"] }` | refused | Repeat in a set |
| `refs: { "sees": [] }` | as written; `read` refuses it (`grammar`) | An empty set is canonical |
| `state: { "steps": ["b","a"] }` | `"steps":["b","a"]` | State arrays keep order |
| `state: { "x": null }` | refused | No null |
| `state: { "n": 1.0 }`, `1e21`, `-0` | refused | No float, no negative zero (`not_canonical` on the wire) |
| a key or string not in NFC | as written | Text is compared byte for byte |
| a lone surrogate, as an escape or raw | refused | Not well-formed text |
| `state: { "x": { "refs": ["b","a"] } }` | as written | Only the top-level `refs` holds sets |
| keys `"😀"` and `"～"` | `～` first | Byte order |

## Signatures

What is signed is in core.md, section 2.

## The compact form

A block sent as CBOR (modules/encoding.md) is still hashed as the canonical bytes above, and signed over its header (core.md, section 2). The receiver rebuilds the JSON first. No id is the hash of CBOR bytes.

## Checking an implementation

Vectors: `spec/canonical-vectors.json` and `spec/vectors.json`. Two conforming implementations give the same id for the same block, and both refuse the same bad blocks.
