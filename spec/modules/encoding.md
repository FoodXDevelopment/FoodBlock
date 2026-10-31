# Encoding

Bytes, shapes, limits, large content, the other suites, passkeys and the compact CBOR form. Numbers, time and text are in core.md; the canonical form in canonical.md; messages in nodes.md and privacy.md.

## Bytes

Patterns are in `protocol.json` (`grammar`). Beyond them:
- A hash is lowercase hex. A bare 64-hex id is SHA-256; any other hash has its name and a colon in front (core.md, Suites). Every hash in a row of `suites` is 32 bytes.
- A salt (privacy.md, A commitment) and a nonce are each 16 random bytes in hex.
- Signing keys, signatures and encryption keys follow the suite (core.md, Suites). Their patterns are in the suite's row in `protocol.json`. A `p256` signature is 64 bytes, or a passkey's longer form (Passkeys, below); in CBOR it is a byte string of either length.
- `recovery_key_hash` is the identity's suite hash of the recovery key's SPKI hex, as UTF-8 text.

## Shapes

A shape is read **only at a place the protocol gives it**, never by a field name deeper in. The places are the fields of a block's `state`, of its `terms` and `scope`, and of each item of its `lines` and `split` (`protocol.json`, `shapes.places`). A value at a place is read as a shape by its own keys (the key lists are in `shapes`): an object whose keys are **exactly** those of a shape is that shape, and is checked as one, in any field; an object with any other set of keys is data, unless the field is a bare field, which must hold exactly one shape (so `weight: { value: "1" }` is data, `weight: { value: 1, unit: "kg" }` is an amount with a bad value, `shape`); a shape's own parts (a price's `money` and `per`, a range's ends) are read as the shape says. The fields in `shapes.places.bare` (`money`, `price`, `amount`, `quantity`, `pack`, `where`) hold such an object, never a bare value: `state.price: "4"` is refused (`shape`). A map nested under a field is data, and nothing in it is read as a shape. **Some fields are not places at all** (`shapes.places.data`): a schema's `fields`, `grounds` and `roles` name things, so `fields: { value: "text", unit: "text" }` is data, not an amount; and the items of a make's `shares` are data. Nothing in them is read as a shape, on any block. The shapes:
- an amount is `{ value, unit }`, `value` a decimal string, `unit` the author's own text (such as `kg`): the protocol keeps no list of units, and a reader may read it as UCUM (a standard list of units) where that reader trusts that table, or as a pack the thing defines;
- money is `{ minor, currency }`, `minor` an integer of zero or more in the currency's smallest unit: money is never below zero (a debt is a promise; a refund is a transfer the other way), and money below zero is `shape`. `currency` is either a code (`GBP`), a plain label, or an issuer's own unit `{ issuer, unit, decimals }`: `issuer` is an id whose published schema defines the unit, `unit` its name (points, bread credit, a chama's pot, a community currency), and `decimals` how many places a whole unit has, from 0 to 15. With at most 15 places, one whole unit always fits in `minor`. A reader decides what a unit is worth, if anything. A code is one issuer's unit like any other: a reader who trusts the table that publishes it (ISO 4217 for `GBP`) reads it as that table stood at the block's own `at`. Money in different currencies is never added or compared by the protocol.

What a `promise` or a `transfer` moves is never below zero: every amount at a place in one (a quantity, a range's `min` and `max`, a price's `per`, a transfer's `amount`) is zero or more (`shape`). A reading may be below zero (a freezer at -18 °C); an amount promised, delivered or paid may not.

## Limits

A block's canonical body is at most 65,536 bytes; larger content is linked by its hash (below). It nests at most 32 deep (`limits.depth`), and a decimal names at most 40 digits (`limits.decimal_digits`; core.md, sections 3 and 8). `after` names at most 16 heads. A post-quantum signature must still fit in the block limit.

## Large content

A stream, or a file read in parts, is linked by its **Merkle root**, so one chunk can be proved without sending the rest. There is one convention, and it uses SHA-256 whatever the suite:
- Split the content into chunks of any size (a chunk may be empty). With one chunk the root is its leaf. With none there is no root.
- A **leaf** is SHA-256 of the byte `00` then the chunk. A **node** is SHA-256 of the byte `01` then the left hash then the right hash, 32 bytes each. The distinct first bytes mean a chunk can never pass for a node.
- Hash the leaves in order. Join neighbours in pairs, left to right, into the level above. If a level has an odd number, its last hash is **carried up unchanged**, not hashed with itself. Repeat until one hash is left: the root, written as 64 lowercase hex characters.
- A **proof** of chunk `i` of `n` is the list of sibling hashes (hex), from the leaf up: at each level, the neighbour of the node on the path (the left one when the node is on the right, else the right one). A level where the node was carried adds nothing.
- To **verify**, take the chunk, `i` and `n`; hash the leaf; at each level of the path (its width starts at `n` and becomes the width rounded up to even, halved), use the next sibling when the node has a neighbour; the proof must be used up exactly, and the last hash must be the root. A sibling that is not 64 lowercase hex characters fails.
- **The count is signed with the root.** The root does not commit to `n`, so the same block states it: a root is written as a mark `{ scheme: "merkle", value: <root> }` in `state.marks`, and `state.chunks`, an integer of at least 1, is the number of chunks, beside it. A reader takes `n` from `state.chunks` of the block that names the root, never from whoever offers the chunk, so a proof cannot be bent to another count. A block with no such mark, two such marks, or no integer `state.chunks` proves nothing.

The door ops are `merkle_root`, `merkle_proof` and `merkle_verify(block, chunk, index, proof)`, which reads the root and the count from the block (`protocol.json`, `door`).

## Other suites

`std` is in core.md. `p256` and `sm` are two more rows of the table in `protocol.json` (`suites`), for platform keys (secure hardware, passkeys) or a national standard.

| Suite | Hash | Signature | Signing key (hex) | Signature (hex) | Encryption key (hex) | Envelope |
|---|---|---|---|---|---|---|
| `p256` | SHA-256 | ECDSA P-256 with SHA-256 | SPKI DER: `3059301306072a8648ce3d020106082a8648ce3d030107034200` then 65 bytes | `r` then `s`, 32 bytes each | ECDH P-256, 65 bytes (SEC1 uncompressed) | `p256-hkdf-sha256-aes-256-gcm` |
| `sm` | SM3 | SM2 with SM3, user id `1234567812345678` | SPKI DER: `3059301306072a8648ce3d020106082a811ccf5501822d034200` then 65 bytes | `r` then `s`, 32 bytes each | SM2 curve ECDH, 65 bytes | `sm2-hkdf-sm3-sm4-gcm` |

- **Seed to key.** For `p256` and `sm` the seed is the private scalar `d`, 32 bytes big-endian (it must lie in 1 to n-1). The public key is the SPKI hex of the table, built from the public point: `04` then `x` then `y`, 32 bytes each.
- **ECDSA P-256.** `e` is SHA-256 of the bytes. The nonce `k` is RFC 6979 section 3.2 with HMAC-SHA-256, `d` and `h1` = the 32 bytes of `e`, no extra data; the first `k` in 1 to n-1. `r` is the x coordinate of `kG` mod n, `s = k^-1 (e + r d) mod n`. `s` is then reduced to its low half: when it is more than n/2 it becomes `n - s` (core.md, Suites: a verifier accepts only the low `s`).
- **SM2** is GM/T 0003.2-2012 with the user id `1234567812345678`. `ZA = SM3(ENTLA || ID || a || b || xG || yG || xA || yA)`, `ENTLA` the 16-bit big-endian bit length of the id, every number 32 bytes big-endian, `a`, `b`, `G` the curve `sm2p256v1` of GM/T 0003.5 and `A` the signer's public point. `e = SM3(ZA || bytes)` as a 256-bit integer. The nonce `k` is derived by RFC 6979 section 3.2 with HMAC-SM3, `d` and `h1` = the 32 bytes of `e`. `r = (e + x1) mod n` where `(x1, y1) = kG`, and `s = ((1 + d)^-1 (k - r d)) mod n`. A pair with `r = 0`, `r + k = n` or `s = 0` takes the next `k` of the RFC 6979 sequence. The signature is `r` then `s`, 32 bytes each.
- SM3 is GM/T 0004-2012, SM4 is GM/T 0002-2012 (block cipher, 16-byte key), SM4-GCM is NIST SP 800-38D over SM4 with a 12-byte nonce, a 16-byte tag and no additional data, and HKDF-SM3 is HKDF of RFC 5869 with HMAC-SM3.
- The `p256` signature has two forms: the 64-byte ECDSA signature, and a longer **passkey** form, a WebAuthn assertion that carries its own challenge (Passkeys, below). A reader tells them apart by length. The passkey signature is made by the authenticator and is not deterministic.

## Passkeys

A passkey is a signature form of the `p256` suite: the device signs a WebAuthn package that holds a *challenge*, and FoodBlock sets the challenge to the hash of the block, so anyone can check it with the key and the block alone.

#### The key

The key is an ordinary `p256` signing key: `state.public_key_sign` in the genesis or a key grant, `state.suite: "p256"`. WebAuthn's `getPublicKey()` (ES256, -7) gives the same SPKI DER bytes; from a COSE key (`x`, `y`, 32 bytes each) it is the suite's SPKI prefix, `04`, `x`, `y`. Nothing marks a key as a passkey: the same key signs either way.

#### The signature

The signature (hex) is these bytes, in this order:

| Part | Bytes |
|---|---|
| `r` then `s` | 64. The ECDSA signature the device made, as the raw numbers (a device gives them as ASN.1 DER; the signer converts), with `s` made low (`n - s` when the device gave a high one; both verify, and the suite accepts the low one) |
| length of `authenticatorData` | 2, big-endian |
| `authenticatorData` | as long as the length says, at least 37 |
| `clientDataJSON` | all the rest, at least 1 |

Exactly 64 bytes is the plain form; more is the passkey form. It travels where a signature travels, with no other field; a reader needs only the block, the signature and the key.

#### What was signed, and the challenge

For the bytes `M` a signature covers (a block's canonical bytes; for a signed message part, canonical.md's bytes without `signature`):

- **the challenge** is `base64url(SHA-256(M))`: URL-safe alphabet, no `=` padding, 43 characters. For a block that is its id in base64url.
- **the device signs** `authenticatorData || SHA-256(clientDataJSON)` with ECDSA P-256 and SHA-256 (ES256).

#### The check

`verify(M, signature, key)` is true when all hold, else false with no reason:

1. The key is a P-256 key (Other suites, above) and the signature is longer than 64 bytes and parses as the table says.
2. Bit 0 of the flags byte of `authenticatorData` (byte 32) is set: the user was present (`UP`).
3. `clientDataJSON` is UTF-8 with no byte order mark, JSON text (RFC 8259) whose every number is finite as a double (no `1e999`), nested no deeper than `limits.depth_read`, an object, with no key repeated at any depth. Its `type` is the text `webauthn.get` and its `challenge` is the text above, byte for byte. No other member is read.
4. The ECDSA signature `r`, `s` opens over `authenticatorData || SHA-256(clientDataJSON)` with the key.

#### What is deliberately not checked

Only what strangers must agree on is checked: that the author's key approved these bytes. The verifier ignores these parts of WebAuthn:

- **`rpIdHash` and `origin`.** They say which website asked; the block names none.
- **The counter.** The chain notices a clone better: no two blocks of a key may name one `prev` (core.md, invariant 3).
- **`UV`** (the user was verified, by fingerprint or PIN), `BE`, `BS`, extensions, and `crossOrigin`. Whether to demand `UV` is the author's own policy.
- **The attestation** made when the passkey was created. The key alone is what a genesis carries.

`rpId` and the credential id are what a client needs to ask the device; they stay on the author's node.

#### Recovery

A lost passkey is handled by the recovery key (identity.md). A key grant adds a second passkey, and a rotation retires a lost one.

**Invariant.**

28. A passkey signature opens only for the key that made it, over the block it was asked to sign: it carries its own challenge, and a reader checks nothing but the block.

## The compact form (CBOR)

A **public block** may travel as CBOR (RFC 8949), media type `application/foodblock+cbor`, where JSON is too heavy. It is a transport form only. **The id is always the hash of the canonical JSON:** a receiver rebuilds the block, writes its canonical JSON (canonical.md), hashes it and verifies the signature over that JSON; it never hashes or signs CBOR bytes.

**Writing is deterministic** (RFC 8949 §4.2): shortest integer forms, definite lengths, map keys sorted by their encoded bytes (length first, then bytewise), no tags, no floats. A reader may accept any well-formed encoding of the same content, but refuses indefinite lengths, floats, tags, null, undefined, duplicate keys, and integers outside ±(2^53 - 1).

**Message.** A CBOR array `[t, block, signature]`:
- `t`: `0` when map keys are text; else the version of the key table in use (below).
- `block`: a map `{ type, state, refs }`.
- `signature`: a byte string, the signing key's signature bytes (a `p256` passkey's form is longer than 64).
A chain header is a map `{ author, seq, prev, hash }` and nothing more: `seq` an integer, the others 32-byte byte strings (bare ids under `cbor.bytes.hash`; an id with a hash prefix stays text). A push of several blocks is an array of messages. A message with a fourth entry is refused: no entry names a suite (core.md, section 2). Sealed blocks, envelopes and signed requests stay JSON.

**Mapping.** Each JSON value becomes one CBOR value, and back:
- object: map. Array: array, order kept. `true` and `false`: simple values 21 and 20.
- integer: CBOR integer.
- text: text string, NFC. A **decimal string stays a text string** (`"0.8"` stays `"0.8"`), so no digit is lost.
- At the paths listed in `protocol.json` (`cbor.bytes`), a value that matches its grammar is a **byte string**, and a writer must use it. Anywhere else, or when the value does not match (`"public"` in an audience, an id with a hash prefix), it stays text.
  - `hash`: every bare id under `refs`, and the other id and commitment fields listed. 32 bytes; written back as lowercase hex.
  - `sign_key`: a signing key. For `std`, the 32 raw key bytes, with the fixed 12-byte SPKI prefix left off and put back by the reader. For another suite, its whole SPKI bytes.
  - `encrypt_key`: the suite's raw key bytes. `nonce`: 16 bytes.
- A time at a time field (a field `field_shape` marks time) that matches `grammar.time` is an integer of milliseconds since 1970-01-01T00:00:00.000Z. The reader writes the exact `YYYY-MM-DDTHH:MM:SS.sssZ` text back. Dates and durations stay text.

**Short keys.** `protocol.json` (`cbor.keys`) lists field names; a name's position is its integer. A sender may use that integer in place of the name; `t` says which table. A name not in the table stays text, and text and integer keys may mix. In the short form, `type` is its position in `protocol.json` (`types`). The table only grows, and a new table is a new `t`. Both forms hash the same.
