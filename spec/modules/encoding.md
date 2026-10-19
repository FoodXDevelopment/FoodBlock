# Encoding

Bytes, shapes, limits and the compact CBOR form. Numbers, time and text rules are in core.md; the canonical form is in canonical.md; messages are in nodes.md and privacy.md.

## Bytes

Patterns are in `protocol.json` (`grammar`). Beyond them:
- A hash is lowercase hex. A bare 64-hex id is SHA-256; any other hash has its name and a colon in front (core.md, Suites). Every hash in a row of `suites` is 32 bytes.
- A salt is 16 random bytes in hex. A nonce is 16 random bytes in hex.
- Signing keys, signatures and encryption keys follow the suite (core.md, Suites). Their patterns are in the suite's row in `protocol.json`. A `p256` signature is 64 bytes, or a passkey's longer form (encoding.md, Passkeys); in CBOR it is a byte string of either length.
- `recovery_key_hash` is the identity's suite hash of the recovery key's SPKI hex, as UTF-8 text.

## Shapes

A shape is read **only at a place the protocol gives it**, never by a field name deeper in. The places are the fields of a block's `state`, of its `terms` and `scope`, and of each item of its `lines` and `split` (`protocol.json`, `shapes.places`). A value at a place is read as a shape by its own keys (the key lists are in `shapes`): an object whose keys are **exactly** those of a shape is that shape, and is checked as one, in any field; an object with any other set of keys is data, unless the field is a bare field, which must hold exactly one shape (so `weight: { value: "1" }` is data and valid, `weight: { value: 1, unit: "kg" }` is an amount with a bad value, `shape`, and `price: { minor, currency, place }` is `shape` because a price is money or money per unit); a shape's own parts (a price's `money` and `per`, a range's ends) are read as the shape says. The fields in `shapes.places.bare` (`money`, `price`, `amount`, `quantity`, `pack`, `where`) hold such an object, never a bare value: `state.price: "4"` is refused (`shape`). A map nested under a field is data, and nothing in it is read as a shape: a schema's `fields: { price: "money" }`, `values`, `labels` and `value_confidence: { amount: "0.9" }` are valid whatever their keys are called. The shapes:
- an amount is `{ value, unit }`, `value` a decimal string, the unit from UCUM (a standard list of units, such as `kg`) or a pack the thing defines;
- money is `{ minor, currency }`, `minor` an integer in the currency's smallest unit. `currency` is either an ISO 4217 code (`GBP`), or an issuer's own unit `{ issuer, unit, decimals }`: `issuer` is an id whose published schema defines the unit, `unit` its name (points, bread credit, a chama's pot, a community currency), and `decimals` how many places a whole unit has, from 0 to 15. With at most 15 places, one whole unit always fits in `minor`. A reader decides what a unit is worth, if anything. Money in different currencies is never added or compared by the protocol;
- a confidence is a decimal string from 0 to 1.

## Limits

A block's canonical body is at most 65,536 bytes; larger content is linked by its hash. `after` names at most 16 heads. A post-quantum signature must still fit in the block limit.

## Large content

A block holds at most 65,536 bytes; larger content is linked by its hash. A stream, or a file read in parts, is linked by its **Merkle root**, so one chunk can be proved without sending the rest. There is one convention, and it uses SHA-256 whatever the suite:
- Split the content into chunks of any size (a chunk may be empty). With one chunk the root is its leaf. With none there is no root.
- A **leaf** is SHA-256 of the byte `00` then the chunk. A **node** is SHA-256 of the byte `01` then the left hash then the right hash, 32 bytes each. The distinct first bytes mean a chunk can never pass for a node.
- Hash the leaves in order. Join neighbours in pairs, left to right, into the level above. If a level has an odd number, its last hash is **carried up unchanged**, not hashed with itself. Repeat until one hash is left: the root, written as 64 lowercase hex characters.
- A **proof** of chunk `i` of `n` is the list of sibling hashes (hex), from the leaf up: at each level, the neighbour of the node on the path (the left one when the node is on the right, else the right one). A level where the node was carried adds nothing.
- To **verify**, take the chunk, `i` and `n`; hash the leaf; at each level of the path (its width starts at `n` and becomes the width rounded up to even, halved), use the next sibling when the node has a neighbour; the proof must be used up exactly, and the last hash must be the root. A sibling that is not 64 lowercase hex characters fails.
- The root does not commit to `n`; the count is stated beside the root, in the signed block that names it. A root is written as a mark `{ scheme: "merkle", value: <root> }` where a hash would be linked.

The door ops are `merkle_root`, `merkle_proof` and `merkle_verify` (`protocol.json`, `door`).

## Other suites

`std` is in core.md. `p256` and `sm` are two more rows of the same table in `protocol.json` (`suites`), for places where a key must be a platform key (a phone's secure hardware, a passkey) or a national standard applies.

| Suite | Hash | Signature | Signing key (hex) | Signature (hex) | Encryption key (hex) | Envelope |
|---|---|---|---|---|---|---|
| `p256` | SHA-256 | ECDSA P-256 with SHA-256 | SPKI DER: `3059301306072a8648ce3d020106082a8648ce3d030107034200` then 65 bytes | `r` then `s`, 32 bytes each | ECDH P-256, 65 bytes (SEC1 uncompressed) | `p256-hkdf-sha256-aes-256-gcm` |
| `sm` | SM3 | SM2 with SM3, user id `1234567812345678` | SPKI DER: `3059301306072a8648ce3d020106082a811ccf5501822d034200` then 65 bytes | `r` then `s`, 32 bytes each | SM2 curve ECDH, 65 bytes | `sm2-hkdf-sm3-sm4-gcm` |

- **Seed to key.** For `p256` and `sm` the seed is the private scalar `d`, 32 bytes big-endian (it must lie in 1 to n-1). The public key is the SPKI hex of the table, built from the public point: `04` then `x` then `y`, 32 bytes each.
- **ECDSA P-256.** `e` is SHA-256 of the bytes. The nonce `k` is derived by RFC 6979 section 3.2 with HMAC-SHA-256, the private scalar `d` and `h1` = the 32 bytes of `e`, no extra data; the first `k` in 1 to n-1 is used. `r` is the x coordinate of `kG` mod n, `s = k^-1 (e + r d) mod n`. `s` is not reduced to its low half. The signature is `r` then `s`, 32 bytes each, big-endian.
- **SM2** is GM/T 0003.2-2012 with the user id `1234567812345678`. `ZA = SM3(ENTLA || ID || a || b || xG || yG || xA || yA)`, `ENTLA` the 16-bit big-endian bit length of the id, every number 32 bytes big-endian, `a`, `b`, `G` the curve `sm2p256v1` of GM/T 0003.5 and `A` the signer's public point. `e = SM3(ZA || bytes)` as a 256-bit integer. The nonce `k` is derived by RFC 6979 section 3.2 with HMAC-SM3, `d` and `h1` = the 32 bytes of `e`. `r = (e + x1) mod n` where `(x1, y1) = kG`, and `s = ((1 + d)^-1 (k - r d)) mod n`. A pair with `r = 0`, `r + k = n` or `s = 0` takes the next `k` of the RFC 6979 sequence. The signature is `r` then `s`, 32 bytes each.
- SM3 is GM/T 0004-2012, SM4 is GM/T 0002-2012 (block cipher, 16-byte key), SM4-GCM is NIST SP 800-38D over SM4 with a 12-byte nonce, a 16-byte tag and no additional data, and HKDF-SM3 is HKDF of RFC 5869 with HMAC-SM3.
- The `p256` signature has two forms: the 64-byte ECDSA signature, and a longer **passkey** form, a WebAuthn assertion that carries its own challenge (Passkeys, below). A reader tells them apart by length. The passkey signature is made by the authenticator and is not deterministic.

## Passkeys

A passkey is a FoodBlock key. The phone's own sign-in, a fingerprint or a face, signs the block. No seed phrase, no key file, no app to install. This section is the one signature form that makes it so. It belongs to the `p256` suite (above).

**The idea.** A passkey is a P-256 key that never leaves the person's device. To use it, a program asks the device to sign a *challenge*. The device signs a small package (WebAuthn, the browser standard for passkeys) that holds the challenge. FoodBlock sets the challenge to the hash of the block. So the signature on the package is a signature on the block, and anyone can check it with the key and the block alone.

#### The key

The key is an ordinary `p256` signing key (Other suites, above): `state.public_key_sign` in the genesis or a key grant, `state.suite: "p256"`. WebAuthn gives it as SPKI DER (`getPublicKey()` with algorithm ES256, -7), which is the same bytes. From a COSE key (`x`, `y`, 32 bytes each) it is the suite's SPKI prefix, then `04`, `x`, `y`. Nothing marks a key as a passkey: the same key signs either way. A passkey that signed the genesis is the identity.

#### The signature

The signature (hex) is these bytes, in this order:

| Part | Bytes |
|---|---|
| `r` then `s` | 64. The ECDSA signature the device made, as the raw numbers (a device gives them as ASN.1 DER; the signer converts) |
| length of `authenticatorData` | 2, big-endian |
| `authenticatorData` | as long as the length says, at least 37 |
| `clientDataJSON` | all the rest, at least 1 |

A signature of exactly 64 bytes is the plain form (Other suites, above). One of more is the passkey form. It travels where a signature travels: in the message `signature`, in the CBOR byte string, in the store. No other field travels with the block, and a reader needs nothing but the block, the signature and the key.

#### What was signed, and the challenge

For the bytes `M` a signature covers (a block's canonical bytes; for a signed message part, canonical.md's bytes without `signature`):

- **the challenge** is `base64url(SHA-256(M))`: URL-safe alphabet (`-` and `_`), no `=` padding, 43 characters. For a block, `SHA-256(M)` is its id (p256 hashes with SHA-256), so the challenge is the id in base64url.
- **the device signs** `authenticatorData || SHA-256(clientDataJSON)` with ECDSA P-256 and SHA-256 (WebAuthn's ES256). So the verifier checks the ECDSA signature over exactly those bytes.

#### The check

`verify(M, signature, key)` is true when all of these hold; otherwise false, with no reason given:

1. The key is a P-256 key (Other suites, above) and the signature is longer than 64 bytes and parses as the table says.
2. Bit 0 of the flags byte of `authenticatorData` (byte 32) is set: the user was present (`UP`).
3. `clientDataJSON` is UTF-8 JSON, an object, with no key repeated at any depth. Its `type` is the text `webauthn.get` and its `challenge` is the text above, byte for byte. No other member is read.
4. The ECDSA signature `r`, `s` opens over `authenticatorData || SHA-256(clientDataJSON)` with the key.

#### What is deliberately not checked

The rule is: only what strangers must agree on. A stranger needs to know that the key held by the author approved these bytes. These parts of WebAuthn answer other questions, between the device and the site it works for, so the verifier ignores them:

- **`rpIdHash` and `origin`.** They say which website asked. The block names no website, a stranger cannot know which one the author meant, and the device itself already refuses to use a passkey for a site that does not own it. A key that signed is the proof.
- **The counter.** It exists so one site can notice a cloned key. The chain does it better: no two blocks of a key may name one `prev` (core.md, invariant 3). Synced passkeys keep it at 0.
- **`UV`** (the user was verified, by fingerprint or PIN), `BE`, `BS`, extensions, and `crossOrigin`. Whether to demand `UV` is the author's policy for their own device and stays on their node.
- **The attestation** made when the passkey was created. It says who made the device. The key alone is what a genesis carries.

`rpId` and the credential id are what a client needs to *ask* the device. They are the author's business and stay on their node. Losing them loses nothing a reader needs.

#### Recovery

A passkey can be lost with its device. That is what the recovery key is for (identity.md). A key grant adds a second passkey on another device, and a rotation retires a lost one.

**Invariant.**

28. A passkey signature opens only for the key that made it, over the block it was asked to sign: it carries its own challenge, and a reader checks nothing but the block.

## The compact form (CBOR)

For links where JSON is too heavy (a radio, a tag, a sensor) a **public block** may travel as CBOR (RFC 8949, a compact binary form of JSON), media type `application/foodblock+cbor`. It is a transport form only. **The id is always the hash of the canonical JSON.** A receiver rebuilds the block, writes its canonical JSON (canonical.md), hashes it, and verifies the signature over that JSON. It never hashes or signs CBOR bytes.

**Writing is deterministic** (RFC 8949 §4.2): shortest integer forms, definite lengths, map keys sorted by their encoded bytes (length first, then bytewise), no tags, no floats. A reader may accept any well-formed encoding of the same content, but refuses indefinite lengths, floats, tags, null, undefined, duplicate keys, and integers outside ±(2^53 - 1).

**Message.** A CBOR array `[t, block, signature]`:
- `t`: `0` when map keys are text; else the version of the key table in use (below).
- `block`: a map `{ type, state, refs }`.
- `signature`: a byte string, the suite's signature bytes (a `p256` passkey's form is longer than 64).
A chain header is a map `{ author, seq, prev, hash }` and nothing more. `seq` is an integer. `author`, `prev` and `hash` are byte strings of 32 bytes each (as the bare ids under `cbor.bytes.hash`); an id with a hash prefix stays text, as everywhere. A push of several blocks is an array of messages. A suite other than `std` is named by a text entry `suite` after the signature. Sealed blocks, envelopes and signed requests stay JSON.

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
