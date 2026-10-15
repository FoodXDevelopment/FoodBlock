# Encoding

Bytes, numbers, limits, messages, the compact form, aliases and conformance.

## Bytes

Patterns are in `protocol.json` (`grammar`). Beyond them:
- A hash is lowercase hex, everywhere. A salt or a nonce is 16 random bytes in hex.
- Keys and signatures follow the key's algorithm (`algs` in `protocol.json`; identity.md, Algorithms). For the defaults: a signing key is Ed25519, its SPKI DER bytes in lowercase hex (starting `302a300506032b6570032100`); a signature is the 64-byte Ed25519 signature in hex; an encryption key is X25519, its raw 32 bytes in hex.
- A time is UTC ISO 8601 with milliseconds, exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, so times compare as text. A date is `YYYY-MM-DD`. Both must be a real calendar instant (no 30 February). A duration is ISO 8601 and names at least one unit; its pattern uses no lookahead, so every regex engine can run it. The time fields and the date fields (`use_by`) are in `protocol.json` (`time_fields`, `date_fields`), checked in top-level `state`, `terms`, `scope` and each line.
- `recovery_key_hash` is SHA-256 of the recovery key's SPKI hex, as UTF-8 text.

## Canonical form

It is in canonical.md, with the quirks inherited from earlier versions (nulls dropped, string arrays under any key named `refs` set-sorted, legacy floats as JavaScript writes them). The id is SHA-256 of the canonical UTF-8 string of `{ type, state, refs }`; the author signs the same bytes with the key's algorithm. The reader recomputes the hash and never trusts a sent one.

## Numbers

Signed content holds no floats. A plain number is an integer from -(2^53 - 1) to 2^53 - 1 (`seq`, a count). Anything with a fraction is a decimal string. Shapes are recognised by their keys wherever they sit in `state` (the key lists are in `protocol.json`, `shapes`):
- an amount is `{ value, unit }`, the unit from UCUM or a pack the thing defines;
- money is `{ minor, currency }`, `minor` an integer in the currency's smallest unit. `currency` is either an ISO 4217 code (`GBP`), or an issuer's own unit `{ issuer, unit, decimals }`: `issuer` is an id whose published schema defines the unit, `unit` its name (points, bread credit, a chama's pot, a community currency), and `decimals` how many places a whole unit has. A reader decides what a unit is worth, if anything. Money in different currencies is never added or compared by the protocol;
- a confidence is a decimal string from 0 to 1.

## Limits

A block's canonical body is at most 65,536 bytes; larger content is linked by its hash. `after` names at most 16 heads. A sealed copy is checked once opened: a block inside over the limit is refused (`size_limit`).

## Messages

A message is UTF-8 JSON; every shape is in `protocol.json` (`messages`). Where a part is signed, the signature covers its canonical JSON without the `signature` key, by a key of the named signer. `version` is `"1.6"`.
- A public block is `{ version, block, signature }`. A sealed block is `{ version, header, header_signature, envelope }`; `header_signature` is by the key that signed the block, and a reader outside the audience gets it without `envelope`.
- The plaintext of an envelope is `{ version, block, signature, reveals }`, `reveals` being `[{ salt, value }]`, the openings for this recipient only (its audience salt, with `value` its own id; a personal field's salt and value). A copy with reveals is sealed to one recipient; one envelope holds several only when they share every reveal (the members of one circle).
- A signed pull or push adds `signer`, `node`, `nonce`, `at` and `signature`. In a push, `for` is optional (`{ hash: [id] }`): which of the node's people a sealed copy is for, one or several. (Before this merge the signer was `asker` in a pull and `pusher` in a push; both are read as `signer`.)
- In a pull answer, `request` is the SHA-256 of the canonical signed request message, and `n` is each block's arrival number. Every key of a push answer is always present; an empty list is written `[]`.

## The compact form (CBOR)

For links where JSON is too heavy (a radio, a tag, a sensor) a **public block** may travel as CBOR (RFC 8949), media type `application/foodblock+cbor`. It is a transport form only. **The id is always the hash of the canonical JSON.** A receiver rebuilds the block, writes its canonical JSON (canonical.md), hashes it, and verifies the signature over that JSON. It never hashes or signs CBOR bytes.

**Writing is deterministic** (RFC 8949 §4.2): shortest integer forms, definite lengths, map keys sorted by their encoded bytes (length first, then bytewise), no tags, no floats. A reader may accept any well-formed encoding of the same content, but refuses indefinite lengths, floats, tags, null, undefined, duplicate keys, and integers outside ±(2^53 - 1).

**Message.** A CBOR array `[t, block, signature]`:
- `t`: `0` when map keys are text; else the version of the key table in use (below).
- `block`: a map `{ type, state, refs }`.
- `signature`: a byte string (64 bytes for ed25519).
A chain header is a map `{ author, seq, prev, hash }`. A push of several blocks is an array of messages. Sealed blocks, envelopes and signed pulls stay JSON.

**Mapping.** Each JSON value becomes one CBOR value, and back:
- object: map. Array: array, order kept. `true` and `false`: simple values 21 and 20.
- integer: CBOR integer (major 0 or 1).
- text: text string, NFC. A **decimal string stays a text string** (`"0.8"` stays `"0.8"`), so no digit is lost.
- At the paths listed in `protocol.json` (`cbor.bytes`), a value that matches its grammar is a **byte string**, and a writer must use it. Anywhere else, or when the value does not match (`"public"` in an audience), it stays text.
  - `hash`: every value under `refs`, and the other id and commitment fields listed. 32 bytes; the reader writes lowercase hex.
  - `sign_key`: a signing key. For ed25519, the 32 raw key bytes, with the fixed 12-byte SPKI prefix left off and put back by the reader. For another algorithm, its whole SPKI bytes.
  - `encrypt_key`: 32 bytes. `nonce`: 16 bytes.
- A time at a time field (`protocol.json`, `time_fields`, in the places the Bytes rule checks) that matches `grammar.time` is an **unsigned or negative integer of milliseconds** since 1970-01-01T00:00:00.000Z. The reader writes the exact `YYYY-MM-DDTHH:MM:SS.sssZ` text back. Dates and durations stay text.
- Null never appears: canonical form drops it first.

**Short keys.** `protocol.json` (`cbor.keys`) lists field names; a name's position is its integer. A sender may use that integer in place of the name; `t` says which table. A name not in the table stays text, and text and integer keys may mix. In the short form, `type` is its position in `protocol.json` (`types`). The table only grows, never reorders; a new table is a new `t`. Both forms hash the same.

**Size.** A small micro `observe` (a temperature reading, three refs, no `at`) is 328 bytes of canonical JSON, 195 as CBOR with text keys, and 148 with short keys, before the 64-byte signature. Every id and key is 32 bytes instead of 64 hex characters. Vectors for this form are owed.

## Aliases

`aliases.json` reads older shapes in the order `protocol.json` gives (`aliases`): type names (per-type rows, then every-type rows, `*`), then the shape rules for the new type and kind in listed order (each `when` tested on the block as read so far), then the shared ref renames, then `outside`. Message field renames (`messages` in `aliases.json`) are read on messages. Reading never changes a block or its hash.
- A type name with no row, written `base.rest`, where `base` is a 1.6 type or a type row that is not retired, reads as `base` with `state.kind` set to `rest` (all after the first dot), unless the block already has a `state.kind`: `observe.whatever` reads as type `observe`, kind `whatever` (`types_dotted`). A type row's `kind` likewise never overwrites a `state.kind` the block has.
- A reading is `{ hash, type, state, refs }`, the hash unchanged, plus the reader's marks only when they apply: `settles` (the hash the block settles), `outside` (`{ ref: name }` for an open side named outside), `retired` (true: no longer protocol; `outside` in the type row says where it went).

**Merged fields.** One name for one idea; the old names are read as the new:
- `counted_to` ← `last_good`, `last_counted` (identity.md).
- `signer` ← `asker`, `pusher` (Messages, above).

## Conformance

A node conforms when it reproduces, exactly, the vectors in `spec/vectors.json` for what it does: canonical strings, hashes, signatures, commitments, envelopes, and how identities, deals and circles read. The vectors include folds (with expected results), refusals (with the codes a strict check finds), alias reads and CBOR. Every 1.6 block in a vector's stories, outside the refusal cases, passes the write check. A node finds a block's signing key from the identity fold, never from a vector's signer name. The spec files, `protocol.json`, `aliases.json` and the vectors are enough to build a node.
