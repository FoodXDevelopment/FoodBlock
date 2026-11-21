# Encoding

Bytes, shapes, limits, large content, the other suites, passkeys and the compact CBOR form. Numbers, time and text are in core.md; the canonical form in canonical.md; messages in nodes.md and privacy.md.

## Bytes

Patterns are in `protocol.json` (`grammar`). Beyond them:
- A hash is lowercase hex. A bare 64-hex id is SHA-256; any other hash has its name and a colon in front (core.md, Suites). Every hash in a row of `suites` is 32 bytes.
- A salt (privacy.md, A commitment) and a nonce are each 16 random bytes in hex.
- Signing keys, signatures and encryption keys follow the suite (core.md, Suites). Their patterns are in the suite's row in `protocol.json`. A `p256` signature is 64 bytes, or a passkey's longer form (Passkeys, below); in CBOR it is a byte string of either length. A signature in any suite, a passkey's included, is at most `limits.signature_bytes` bytes (8,192, which holds a passkey assertion, ML-DSA-44 and SLH-DSA-SHA2-128s); a longer one opens with no key.
- A `p256` key's point is written uncompressed, with first byte `04`. Any other spelling is no key.
- A short reply (profiles/short-form.md) opens only from its exact spelling: strict base64url, no padding, `seq` in its fewest bytes. Any other text opens nothing.

## Shapes

A shape is read **only at a place the protocol gives it**, never by a field name deeper in. The places are the fields of a block's `state`, of its `terms` and `scope`, and of each item of its `lines`, `split` and `inputs` (`protocol.json`, `shapes.places`). A value at a place is read as a shape by its own keys (the key lists are in `shapes`): an object whose keys are **exactly** those of a shape is that shape, and is checked as one, in any field; an object with any other set of keys is data, unless the field is a bare field, which must hold exactly one shape (so `weight: { value: "1" }` is data, `weight: { value: 1, unit: "kg" }` is an amount with a bad value, `shape`); a shape's own parts (a price's `amount` and `per`, a range's ends) are read as the shape says. The fields in `shapes.places.bare` (`price`, `amount`, `quantity`, `pack`, `where`) hold such an object, never a bare value: `state.price: "4"` is refused (`shape`). A map nested under a field is data, and nothing in it is read as a shape. **Some fields are not places at all** (`shapes.places.data`): a schema's `fields`, `grounds` and `roles` name things, so `fields: { value: "text", unit: "text" }` is data, not an amount. Nothing in them is read as a shape, on any block. The shapes:
- **An amount** is `{ value, unit }` or `{ value, unit, of }`: this much of a good. `value` is a decimal (core.md, section 3), zero or more where it is promised, moved or paid. `unit` is its author's own text (`kg`, `sack`, `head`, `part`, `GBP`, `KES`, `BTC`): the protocol keeps no list of units and none of monies, and a reader may read a unit by any table she trusts, on her own node. `of`, when given, is the id of a thing: the kind this is an amount of ("FAQ maize", "Maria's bread credit"). It is compared, never opened, and a reader need not hold it. **Two amounts are of one kind** when their `unit` is the same text, byte for byte, and their `of` is the same id, or neither has one. Amounts of one kind are added and compared exactly; amounts of two kinds are never added, compared or converted. A transfer's `amount` beside `refs.what`, and a thing's `pack`, carry no `of` (`shape`): their kind is the measure's own (for an instance, its `refs.of`). **An amount is added only within one measure:** to amounts of the same measure (the block its transfer names in `refs.what`), or, with no measure named, toward the one line or price its transfer is `for`. No fold adds across measures, so "what is to come to Harry, £80" never adds to £80 in hand.
- **Money is an amount.** The protocol has no shape for it and names no good as the one people take in order to trade it again. Which good that is (the most saleable: Menger, *On the Origins of Money*) is each person's choice and each reader's reading. So wherever this spec states a price, a payment, a cap or a stake, it is an amount of any good. **A claim to a good is not the good:** what is to come to someone is a deal its signer signed, handed on by a hand-over of what is to come (promises.md, What a deal names a side to receive). A unit word alone does not say whether an amount is the good itself or someone's promise of it; one who wants it said writes `of`, the id of the issuer's kind (a bread credit, a voucher). An amount with `of` and one without are two kinds, so a promise counts toward a plain price only by the payee's `covers` (Mises, *The Theory of Money and Credit*: a substitute is a claim, taken at par only by each taker's own choice).
- **A sum** a fold gives is an amount whose `value` is exact, printed in one form so two builds agree: the shortest decimal text, with no exponent, no leading zero but a single `0` before the point, no trailing zero after the point, no point when there is no fraction, `0` for nothing, and never `-0`. A figure a fold prints is the exact value of signed numbers: the shortest decimal text, of any length, where it has one; else `n/d`, two whole numbers in lowest terms, which no block may sign. A block that states a figure states a decimal of its signer's choosing.

What a `promise` or a `transfer` moves is never below zero: every amount at a place in one (a quantity, a range's `min` and `max`, a price's `amount` and `per`, a transfer's `amount`, an input's `amount`) is zero or more (`shape`). A reading may be below zero (a freezer at -18 °C); an amount promised, delivered or paid may not.

## Limits

A block's canonical body is at most 65,536 bytes; larger content is linked by its hash (below). It nests at most 32 deep (`limits.depth`), and a decimal names at most 40 digits (`limits.decimal_digits`; core.md, sections 3 and 8). `after` names at most 16 heads. A reader reads nothing nested deeper than `limits.read_depth` (64 levels): not what carries a block (a push, a message, a door's arguments, a CBOR item), and not the chain of places a thing is in. It bounds a reader's work, never a block, which `limits.depth` bounds.

## Large content

A stream, or a file read in parts, is linked by its **Merkle root**, so one chunk can be proved without sending the rest. There is one convention, and it uses SHA-256 whatever the suite:
- Divide the content into chunks of any size (a chunk may be empty). With one chunk the root is its leaf. With none there is no root.
- A **leaf** is SHA-256 of the byte `00` then the chunk. A **node** is SHA-256 of the byte `01` then the left hash then the right hash, 32 bytes each. The distinct first bytes mean a chunk can never be taken for a node.
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

A passkey is a signature form of the `p256` suite: the device signs a WebAuthn package that holds a *challenge*, and FoodBlock sets the challenge to the hash of the bytes signed for the block (its header's; a genesis's own bytes; core.md, section 2), so anyone can check it with the key and the block alone, and a private block needs one tap of its holder.

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

For the bytes `M` a signature is made over (a block's header as canonical JSON, a genesis's own canonical bytes, or a signed request or answer without `signature`):

- **the challenge** is `base64url(SHA-256(M))`: URL-safe alphabet, no `=` padding, 43 characters. For a genesis that is its id in base64url.
- **the device signs** `authenticatorData || SHA-256(clientDataJSON)` with ECDSA P-256 and SHA-256 (ES256).

#### The check

`verify(M, signature, key)` is true when all hold, else false with no reason:

1. The key is a P-256 key (Other suites, above), the signature is longer than 64 bytes, at most `limits.signature_bytes`, and parses as the table says.
2. Bit 0 (user present) and bit 2 (user verified) of the flags byte (byte 32 of `authenticatorData`) are set. A key held in software writes the byte itself, so it shows nothing about a person; a touch alone signs nothing.
3. `clientDataJSON` begins with exactly these bytes: `{"type":"webauthn.get","challenge":"`, the 43 characters of the challenge, then `","origin":"`: 91 bytes in all (WebAuthn Level 2 and Level 3, 5.8.1.1). Nothing after them is read, and no JSON is parsed.
4. The ECDSA signature `r`, `s` opens over `authenticatorData || SHA-256(clientDataJSON)` with the key.

#### What is deliberately not checked

Only what strangers must agree on is checked: that the author's key approved these bytes. The verifier ignores these parts of WebAuthn:

A passkey shows its holder the site that wants the signature, never the bytes, and one tap serves a sign-in and a promise alike. So a passkey signature is the key's word on whatever challenge the software chose, given on its holder's tap. The site (`origin`) and whether the device verified its holder (`UV`) are inside the signed bytes and travel with the signature; `valid` reads the user-verified bit and not the site that asked, and a judge may read both.

- **`rpIdHash`.** It names the website that wanted the signature; the block names none.
- **The counter.** Two blocks of a key on one `prev` or at one `seq` are a pair (core.md, invariant 3), which shows a clone better.
- **`BE`, `BS`**, extensions, and `crossOrigin`.
- **The attestation** made when the passkey was created. The key alone is what a genesis carries.

`rpId` and the credential id are what a client needs to reach the device; they stay on the author's node.

#### A lost passkey

A lost passkey is a lost key: a voice above it puts a new key in its place (identity.md, Her voices). A key grant adds a second passkey.

**Invariant.**

Holds: A passkey signature opens only for the key that made it, over one block's header (a genesis's own bytes): it carries its own challenge, and a reader checks nothing but the block. It says nothing of what its holder saw.

## The compact form (CBOR)

A convention. It changes no word (core.md, section 10); two nodes that share it can talk.

A **public block** may travel as CBOR (RFC 8949), media type `application/foodblock+cbor`, where JSON is too heavy. It is a transport form only. **The id is always the hash of the canonical JSON:** a receiver rebuilds the block, writes its canonical JSON (canonical.md), hashes it, and verifies the signature over its header (core.md, section 2); it never hashes or signs CBOR bytes.

**Writing is deterministic** (RFC 8949 §4.2.3: map keys sorted length first, then bytewise): shortest integer forms, definite lengths, map keys sorted by their encoded bytes (length first, then bytewise), no tags, no floats. A reader may accept any well-formed encoding of the same content, but refuses indefinite lengths, floats, tags, null, undefined, duplicate keys, and integers outside ±(2^53 - 1).

**Message.** A CBOR array `[t, block, signature]`:
- `t`: `0` when map keys are text; else the version of the key table in use (below).
- `block`: a map `{ type, state, refs }`.
- `signature`: a byte string, the signing key's signature bytes (a `p256` passkey's form is longer than 64).
A header is a map `{ author, seq, prev, hash }`, with `key` or `skip` when the block has them, and nothing more: `seq` an integer, the others 32-byte byte strings (bare ids under `cbor.bytes.hash`; an id with a hash prefix stays text). A push of several blocks is an array of messages. A message with a fourth entry is refused: no entry names a suite (core.md, section 2). Sealed blocks, envelopes and signed requests stay JSON.

**Mapping.** Each JSON value becomes one CBOR value, and back:
- object: map. Array: array, order kept. `true` and `false`: simple values 21 and 20.
- integer: CBOR integer.
- text: text string, as written. A **decimal string stays a text string** (`"0.8"` stays `"0.8"`), so no digit is lost.
- At the paths listed in `conventions.json` (`cbor.bytes`), a value that matches its grammar is a **byte string**, and a writer must use it. Anywhere else, or when the value does not match (`"public"` in an audience, an id with a hash prefix), it stays text.
  - `hash`: every bare id under `refs`, and the other id and commitment fields listed. 32 bytes; written back as lowercase hex.
  - `sign_key`: a signing key. For `std`, the 32 raw key bytes, with the fixed 12-byte SPKI prefix left off and put back by the reader. For another suite, its whole SPKI bytes.
  - `encrypt_key`: the suite's raw key bytes. `nonce`: 16 bytes.
- A time at a time field (a field `field_shape` marks time) that matches `grammar.time` is an integer of milliseconds since 1970-01-01T00:00:00.000Z. The reader writes the exact `YYYY-MM-DDTHH:MM:SS.sssZ` text back. Dates and durations stay text.

**Short keys.** `conventions.json` (`cbor.keys`) lists field names; a name's position is its integer. A sender may use that integer in place of the name; `t` says which table. A name not in the table stays text, and text and integer keys may mix. In the short form, `type` is its position in `protocol.json` (`types`). The table is made from `protocol.json` by its rule (`cbor.keys_about`). A later table appends a new name at the end and never moves or empties one, and a new table is a new `t`. Both forms hash the same.
