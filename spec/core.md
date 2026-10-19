# FoodBlock core

Version 1.6 (2026-10-15). This page and canonical.md are enough to build a micro: make a block, sign it, check it, chain it. Every other rule is in a module (protocol.md). Where files disagree, this page governs.

There is no earlier version in the protocol. Version 1.6 is year zero. Old data enters once, through a converter outside the protocol (legacy/converter.md).

## 1. A block

A block is three fields and nothing else:

```
{ "type": <string>, "state": <object>, "refs": <object> }
```

- `type` says what kind of act it is.
- `state` holds data.
- `refs` holds links to other blocks. A link is one id, or a set of ids written as a sorted array. Two links hold exactly one id and never an array: `author` and `prev` (`protocol.json`, `refs_single`); an array there is `grammar`.

The **id** of a block is the hash of its canonical bytes (canonical.md). The author signs the same bytes. A reader recomputes the id from the bytes and never trusts one it was sent.

**The known types.** A type is a word that matches `^[a-z][a-z0-9_]*$`. Seven are known. Each has a mood, which says what the block claims:
- Exists: `actor` (a person, agent, circle or contact) and `thing` (anything held, found or written).
- Is: `observe` (a claim), `transform` (things change) and `transfer` (owner, holder or place changes).
- Must: `promise`. May: `grant`.

**Open types, closed authority.** Four types carry authority and are **closed**: `actor`, `promise`, `transfer` and `grant`. Their fields are fixed by this spec, and a node refuses a closed block that breaks the spec. Every other type (`thing`, `observe`, `transform` and any new word) is **open**. A node checks an open block only against this page, then stores it and passes it on. A fold reads the types it knows. An open block it does not know gives no authority, moves no owner and binds no one.

**The seven verbs** are the `refs` keys that link one block to another by meaning:
- `updates`: this is a new version of that block.
- `answers`: this is the reply to that block. It is the only way to consent.
- `confirms` and `defeats`: this makes that claim more or less true. They speak of truth only.
- `for`: what this block serves.
- `derives_from`: what this block came from.
- `same_as`: these two records are one.

`prev` and `after` link blocks by order, not meaning, so they are not verbs. The shared ref keys are listed in `protocol.json` (`refs`).

## 2. Suites: hash, signature, key agreement

A **suite** names a hash, a signature algorithm and an envelope (key agreement and encryption) together. The default is `std`. The suites are in `protocol.json` (`suites`).

| Suite | Hash | Signature | Signing key (hex) | Signature (hex) | Encryption key (hex) | Envelope |
|---|---|---|---|---|---|---|
| `std` | SHA-256 | Ed25519, RFC 8032 | SPKI DER: `302a300506032b6570032100` then 32 bytes | 64 bytes | X25519, 32 raw bytes | `x25519-hkdf-sha256-aes-256-gcm` |
| `p256` | SHA-256 | ECDSA P-256 with SHA-256 | SPKI DER: `3059301306072a8648ce3d020106082a8648ce3d030107034200` then 65 bytes | `r` then `s`, 32 bytes each | ECDH P-256, 65 bytes (SEC1 uncompressed) | `p256-hkdf-sha256-aes-256-gcm` |
| `sm` | SM3 | SM2 with SM3, user id `1234567812345678` | SPKI DER: `3059301306072a8648ce3d020106082a811ccf5501822d034200` then 65 bytes | `r` then `s`, 32 bytes each | SM2 curve ECDH, 65 bytes | `sm2-hkdf-sm3-sm4-gcm` |

**How a signature is made.** The signed bytes are the UTF-8 canonical bytes (canonical.md) of what is signed; no hash is signed separately except as the algorithm says.
- **Seed to key.** A test or device key is made from a 32-byte seed. For `std` the seed is the Ed25519 private key of RFC 8032. For `p256` and `sm` the seed is the private scalar `d`, 32 bytes big-endian (it must lie in 1 to n-1). The public key is the SPKI hex of the table, built from the public point (`std`: the 32-byte RFC 8032 key; the others: `04` then `x` then `y`, 32 bytes each).
- **Ed25519** is deterministic by RFC 8032 (pure Ed25519, the message is the bytes).
- **ECDSA P-256.** `e` is SHA-256 of the bytes. The nonce `k` is derived by RFC 6979 section 3.2 with HMAC-SHA-256, the private scalar `d` and `h1` = the 32 bytes of `e`, no extra data; the first `k` in 1 to n-1 is used. `r` is the x coordinate of `kG` mod n, `s = k^-1 (e + r d) mod n`. `s` is not reduced to its low half. The signature is `r` then `s`, 32 bytes each, big-endian.
- **SM2** is GM/T 0003.2-2012 with the user id `1234567812345678`. `ZA = SM3(ENTLA || ID || a || b || xG || yG || xA || yA)`, `ENTLA` the 16-bit big-endian bit length of the id, every number 32 bytes big-endian, `a`, `b`, `G` the curve `sm2p256v1` of GM/T 0003.5 and `A` the signer's public point. `e = SM3(ZA || bytes)` as a 256-bit integer. The nonce `k` is derived by RFC 6979 section 3.2 with HMAC-SM3, `d` and `h1` = the 32 bytes of `e`. `r = (e + x1) mod n` where `(x1, y1) = kG`, and `s = ((1 + d)^-1 (k - r d)) mod n`. A pair with `r = 0`, `r + k = n` or `s = 0` takes the next `k` of the RFC 6979 sequence. The signature is `r` then `s`, 32 bytes each.
- SM3 is GM/T 0004-2012, SM4 is GM/T 0002-2012 (block cipher, 16-byte key), SM4-GCM is NIST SP 800-38D over SM4 with a 12-byte nonce, a 16-byte tag and no additional data, and HKDF-SM3 is HKDF of RFC 5869 with HMAC-SM3.
- **Verifiers accept any valid signature.** A writer must derive its nonce as above, so that two implementations given the same key and bytes write the same signature (the vectors check exact bytes). A passkey signature (modules/passkeys.md) is made by the authenticator and is not deterministic.

The `p256` signature has two forms: the 64-byte ECDSA signature, and a longer **passkey** form, a WebAuthn assertion that carries its own challenge (modules/passkeys.md). A reader tells them apart by length.

A post-quantum suite (ML-DSA, ML-KEM, SHA3-256) is one more row. It is noted in `protocol.json` as `future` and is not usable until its sizes are fixed in vectors. A signature is never longer than the block limit allows.

**A bare hash is SHA-256.** Any other hash carries its name as a prefix: `sm3:` then 64 hex characters. An id, a commitment or a manifest entry is written the same way. So a new hash needs no new protocol. **The known hash names** are the hashes of the suites in `protocol.json` (`suites`) that a reader can use: `sm3`, and the bare SHA-256. `sha3-256` is listed in `hashes` for the future suite and is unknown (`unknown_suite`) until that suite is fixed in vectors. The digest bytes of an id are the 32 bytes after the colon; the prefix is never part of them.

**How a suite is chosen.** A key names its suite in `state.suite` (genesis or key grant); left out, it is `std`. A block is hashed with the hash of the suite of the key that signed it, and is verified with that key's algorithm. A message that carries a block names the suite when it is not `std`. A reader refuses a block whose key names a suite it does not know (`unknown_suite`). Moving to a new suite is a key grant that replaces a key and names the new suite (identity.md).

## 3. Numbers, time and text

Signed content holds exactly these value kinds: object, array, string, integer, boolean. It never holds `null` or a float.
- **Integers** run from -(2^53 - 1) to 2^53 - 1. A count, `seq` and money `minor` are integers. `-0` is refused.
- **Decimals** are strings: `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`. Anything with a fraction is a decimal string (`"0.8"`).
- **A time** is UTC to the millisecond, exactly `YYYY-MM-DDTHH:MM:SS.sssZ`. It must be a real calendar instant (no 30 February, no `:60`). Times compare as text.
- **A date** is `YYYY-MM-DD` and must be real.
- **A duration** is ISO 8601 with at least one unit (`PT5M`, `P1Y2M`). Months and years are calendar months and years in UTC. Its pattern is in `protocol.json` (`grammar.duration`).
- **Text** is Unicode in NFC with no unpaired surrogates. Keys too.
- **Hex** is lowercase.
- Which fields hold times and dates is in `protocol.json` (`time_fields`, `date_fields`).

A reader refuses a block that breaks these rules. It does not fix it.

## 4. The genesis

A **genesis** is the one block with no author. It is an `actor` with no `author`, `prev`, `after` or `seq`, signed by its own key. Its id is the id of the identity.

```
state: { kind, at, audience: "public", public_key_sign }      (suite, public_key_encrypt, recovery fields: optional)
refs:  { }
```

**Recognising a genesis.** A reader judges an `actor` as a genesis when it has `state.public_key_sign` or has no `refs.author`. It is then held to this section and to nothing else: an actor with a key and also an `author` is `bad_genesis`, and so is an actor with neither a key nor an `author`. A genesis is signed by its own key (check 6). Every other actor (a contact, a circle) has an `author` and no signing key of its own.

That is the whole ceremony: one key. A person adds an encryption key, a recovery key, more devices or a custodian later, each by a key grant (identity.md). A genesis is always public.

## 5. The chain

Each signing key has its own chain.
- Every block but a genesis carries `refs.author` (the identity's id), `refs.prev`, `state.seq`, `state.at` and `state.audience`.
- `refs.prev` names the key's previous block. A key's first block names the block that brought the key in: the genesis, or a key grant.
- `state.seq` is one more than the `seq` of the `prev` block. A key's first block has `seq` 1. The one exception is a **skip**: a block marked `state.skip: true` may jump to any higher `seq`. A micro that lost its counter writes one.
- `state.at` is when the author says it was written, on the author's clock. An `observe`, `transform` or `transfer` may leave it out when its signer has no clock (blocks.md, No clock).
- `state.audience` is `"public"`, or a sorted list of commitments, one per recipient (privacy.md). A core node writes and reads public blocks only.

A **core node** knows one signing key per identity: the genesis key. It stores a block signed by any other key and counts it for nothing. Rotation, recovery and devices are in identity.md.

## 6. Messages

A block travels as a message, UTF-8 JSON:

```
{ "version": "1.6", "block": { type, state, refs }, "signature": "<hex>" }
```

The signature is by the signing key over the canonical bytes of `block`. A suite other than `std` adds `"suite": "<name>"`. Sealed blocks, pulls and pushes are in privacy.md and nodes.md.

## 7. Required fields

- **Every block but a genesis:** the five fields of section 5.
- **`actor`:** `state.kind`, a label (non-empty text). A missing or non-text `kind` is `bad_genesis` on a block judged as a genesis (section 4) and `required` on any other actor.
- **`transfer`:** `refs.what`, and at least one of `refs.to_owner`, `refs.to_holder`, `refs.to_place` or `state.count`. A **payment** is the exemption: a transfer that carries `state.money` names no thing, so it needs no `refs.what` (things.md, Transfers).
- **`promise`:** `refs.what` or `state.what`; an ask also carries `terms.expires`.
- **`grant`:** `state.kind`, a label; the grant kinds the protocol reads say more in their modules (identity.md: `key`, circles.md: `member`, authority.md: `operator`).
- **An answer** (a block with `refs.answers`) carries `state.status` and is exempt from the other required fields of its type. So is an author's own **stop**, a block with `refs.updates` and `state.status: stopped`: it needs no more than the common five. The one exception to the status is a **counter-offer**, a promise that answers a promise with new terms and no status (promises.md, Answers).
- **An open type:** nothing beyond the common five.

The fields each closed type may carry are in `protocol.json` (`fields`); the key fields an actor and a grant share, written once, are `key_fields`. A closed block with any other field is refused (`undeclared_field`), unless a schema the block names declares it, or an optional profile in `protocol.json` (`optional_profiles`, the profile's `fields` for that type and `every`) declares it. The profile's fields are always declared, whether or not the reader knows the profile: a node that has never heard of one still accepts every block in it.

## 8. `valid(block, context)`

`context` is the blocks the checker holds. It never includes a clock. `valid` runs the checks below in this order and **stops at the first check that finds anything**. Its refusal is every code that one check found, one per code, in the order of `protocol.json` (`refusals.codes.block`, which lists the codes in the order of the checks; `refusals.checks` lists each check's codes). `valid` is true when no check finds anything.

1. The block is exactly `{type, state, refs}` and follows canonical.md, strict writing included (`not_canonical`).
2. Every value follows section 3 and its grammar in `protocol.json` (`float`, `integer_range`, `decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`; `unknown_suite` for a hash name in refs that the reader does not know).
3. The canonical body is at most `limits.block_bytes` (`size_limit`). `refs.after` names at most `limits.after_heads` blocks (`after_limit`).
4. A block judged as a genesis (section 4) follows section 4 (`bad_genesis`; its other values are checked by check 2 as for any block). Any other block has the common five fields of section 5 (`chain`, `at_missing`), and its audience is public or a sorted list of commitments (`audience`).
5. **What it rests on.** Every block it needs is in the context (`unmet`). The needs are in `protocol.json` (`needs`): every block needs its `prev`; a grant also its `parent`, the block it counts to (`counted_to`), the block it answers or updates (`answers`, `updates`: a member's acceptance, an author's stop) and the grant it acts under (`under`); a promise also the grant it acts under (`under`) and the promise it answers or stops (`answers`, `updates`). The list is `protocol.json` `needs`; the ids a block waits for are reported ascending. Authority depends on these blocks, so they are causal dependencies: a block that lacks one is **not judged**. Its refusal is `unmet` alone, and a node waits (nodes.md, Push). When they arrive it is judged once, with every other check.
6. The id sent is the hash of the bytes (`bad_hash`). Its signing key is a key of the author that speaks for it, and its signature opens (`bad_signature`, `void_key`, `unknown_suite`, `not_own_rotation`, `recovery_scope`). **A genesis** has no author to speak for it: its signature must open with its own `state.public_key_sign`, and when it does not the code is `bad_genesis`, never `bad_signature` (the form of a genesis is check 4, its signature this check; a passkey genesis with a wrong challenge is `bad_genesis`).
7. `prev` and `seq` fit the key's chain, or the block is a skip (`chain`).
8. If the type is closed, it has its required fields and no undeclared ones (`required`, `undeclared_ref`, `undeclared_field`), and its module's checks pass (the codes in `protocol.json`, in the order of the list).

**Validity is about the block alone and what it rests on.** Consent never enters `valid`: a block sent despite a STOP is valid, is kept, and the next block of its chain is judged as usual. Consent decides what binds, not what exists (modules/consent.md, invariant 29).

Checks 1 to 4 read the bytes alone (no other block, no key of the author), so a block that fails one is refused at once, whatever it lacks.

**`check(block, held)`**, the strict check, is `valid` without checks 5, 6 and 7 and without stopping at the first check that finds anything: it runs checks 1 to 4 and 8 and gives every code found, one per code, in the order of `protocol.json` (`refusals.codes.block`). `held` is read only by check 8 (a schema or parent grant the block names, the blocks `refs.after` names). A node also keeps the schemas it has seen: a closed block that names a schema the node does not hold is `undeclared_ref` (ask for it), and one that names a schema it holds may carry the `fields` and `roles` that schema declares. A checker with no schema store does not judge what a schema may declare. Nodes use it to say everything wrong with a block's form at once; `valid` is what decides. A block that passes may still count for nothing in a fold (folds.md). `valid` says only that the bytes are sound.

## 9. The invariants

Core keeps three. Every other invariant is in the module that owns it, still numbered (protocol.md lists them).

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. A key's blocks form one chain: no two of its blocks name the same `prev`. Two that do prove a lie. Both are kept, and neither binds anyone else. A lie is the same key with the same `prev`, and only that: two blocks naming one `prev` that different keys signed, such as the recovery key's first block and the first key's, are two chains, not a fork (identity.md).
25. Authority depends on blocks, and they are causal dependencies: a block waits until it holds every block it needs (core.md, check 5), and is then judged once. No node holds a block that another would have judged otherwise for want of what it lacked.

## 10. What core leaves out

The protocol carries only what strangers must agree on with no boss: who said it, under what authority, to whom, with what consent, and how it settled. Drafts, beliefs, goals, limits, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

**Strict writing.** A node writes only the current shapes. It never repairs signed content: it refuses a block, and the author signs a new one.

**Any phone.** Holding keys is better, never required (identity.md, Held keys).
