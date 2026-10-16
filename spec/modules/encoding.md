# Encoding

Bytes, shapes, limits and the compact CBOR form. Numbers, time and text rules are in core.md; the canonical form is in canonical.md; messages are in nodes.md and privacy.md.

## Bytes

Patterns are in `protocol.json` (`grammar`). Beyond them:
- A hash is lowercase hex. A bare 64-hex id is SHA-256; any other hash has its name and a colon in front (core.md, Suites). Every hash in a row of `suites` is 32 bytes.
- A salt is 16 random bytes in hex. A nonce is 16 random bytes in hex.
- Signing keys, signatures and encryption keys follow the suite (core.md, Suites). Their patterns are in the suite's row in `protocol.json`.
- `recovery_key_hash` is the identity's suite hash of the recovery key's SPKI hex, as UTF-8 text.

## Shapes

A shape is read **only at a place the protocol gives it**, never by a field name deeper in. The places are the fields of a block's `state`, of its `terms` and `scope`, and of each item of its `lines` and `split` (`protocol.json`, `shapes.places`). A value at a place is read as a shape by its own keys (the key lists are in `shapes`); a shape's own parts (a price's `money` and `per`, a range's ends) are read as the shape says. The fields in `shapes.places.bare` (`money`, `price`, `amount`, `quantity`, `pack`, `where`) hold such an object, never a bare value: `state.price: "4"` is refused (`shape`). A map nested under a field is data, and nothing in it is read as a shape: a schema's `fields: { price: "money" }`, `values`, `labels` and `value_confidence: { amount: "0.9" }` are valid whatever their keys are called. The shapes:
- an amount is `{ value, unit }`, `value` a decimal string, the unit from UCUM (a standard list of units, such as `kg`) or a pack the thing defines;
- money is `{ minor, currency }`, `minor` an integer in the currency's smallest unit. `currency` is either an ISO 4217 code (`GBP`), or an issuer's own unit `{ issuer, unit, decimals }`: `issuer` is an id whose published schema defines the unit, `unit` its name (points, bread credit, a chama's pot, a community currency), and `decimals` how many places a whole unit has, from 0 to 15. With at most 15 places, one whole unit always fits in `minor`. A reader decides what a unit is worth, if anything. Money in different currencies is never added or compared by the protocol;
- a confidence is a decimal string from 0 to 1.

## Limits

A block's canonical body is at most 65,536 bytes; larger content is linked by its hash. `after` names at most 16 heads. A post-quantum signature must still fit in the block limit.

## The compact form (CBOR)

For links where JSON is too heavy (a radio, a tag, a sensor) a **public block** may travel as CBOR (RFC 8949, a compact binary form of JSON), media type `application/foodblock+cbor`. It is a transport form only. **The id is always the hash of the canonical JSON.** A receiver rebuilds the block, writes its canonical JSON (canonical.md), hashes it, and verifies the signature over that JSON. It never hashes or signs CBOR bytes.

**Writing is deterministic** (RFC 8949 §4.2): shortest integer forms, definite lengths, map keys sorted by their encoded bytes (length first, then bytewise), no tags, no floats. A reader may accept any well-formed encoding of the same content, but refuses indefinite lengths, floats, tags, null, undefined, duplicate keys, and integers outside ±(2^53 - 1).

**Message.** A CBOR array `[t, block, signature]`:
- `t`: `0` when map keys are text; else the version of the key table in use (below).
- `block`: a map `{ type, state, refs }`.
- `signature`: a byte string, the suite's signature bytes.
A chain header is a map `{ author, seq, prev, hash }`. A push of several blocks is an array of messages. A suite other than `std` is named by a text entry `suite` after the signature. Sealed blocks, envelopes and signed requests stay JSON.

**Mapping.** Each JSON value becomes one CBOR value, and back:
- object: map. Array: array, order kept. `true` and `false`: simple values 21 and 20.
- integer: CBOR integer.
- text: text string, NFC. A **decimal string stays a text string** (`"0.8"` stays `"0.8"`), so no digit is lost.
- At the paths listed in `protocol.json` (`cbor.bytes`), a value that matches its grammar is a **byte string**, and a writer must use it. Anywhere else, or when the value does not match (`"public"` in an audience, an id with a hash prefix), it stays text.
  - `hash`: every bare id under `refs`, and the other id and commitment fields listed. 32 bytes; the reader writes lowercase hex.
  - `sign_key`: a signing key. For `std`, the 32 raw key bytes, with the fixed 12-byte SPKI prefix left off and put back by the reader. For another suite, its whole SPKI bytes.
  - `encrypt_key`: the suite's raw key bytes. `nonce`: 16 bytes.
- A time at a time field (`protocol.json`, `time_fields`) that matches `grammar.time` is an integer of milliseconds since 1970-01-01T00:00:00.000Z. The reader writes the exact `YYYY-MM-DDTHH:MM:SS.sssZ` text back. Dates and durations stay text.

**Short keys.** `protocol.json` (`cbor.keys`) lists field names; a name's position is its integer. A sender may use that integer in place of the name; `t` says which table. A name not in the table stays text, and text and integer keys may mix. In the short form, `type` is its position in `protocol.json` (`types`). The table only grows, never reorders; a new table is a new `t`. Both forms hash the same.

**Size.** A small micro `observe` (a temperature reading, three refs, no `at`) is about 330 bytes of canonical JSON, 195 as CBOR with text keys, and 150 with short keys, before the 64-byte signature. Every bare id and key is 32 bytes instead of 64 hex characters.
