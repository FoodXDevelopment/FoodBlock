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
- `refs` holds links to other blocks. A link is one id, or a set of ids written as a sorted array.

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

A post-quantum suite (ML-DSA, ML-KEM, SHA3-256) is one more row. It is noted in `protocol.json` as `future` and is not usable until its sizes are fixed in vectors. A signature is never longer than the block limit allows.

**A bare hash is SHA-256.** Any other hash carries its name as a prefix: `sm3:` then 64 hex characters. An id, a commitment or a manifest entry is written the same way. So a new hash needs no new protocol.

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
- **`actor`:** `state.kind`, a label.
- **`transfer`:** `refs.what`, and at least one of `refs.to_owner`, `refs.to_holder`, `refs.to_place` or `state.count`. A **payment** is the exemption: a transfer that carries `state.money` names no thing, so it needs no `refs.what` (things.md, Transfers).
- **`promise`:** `refs.what` or `state.what`; an ask also carries `terms.expires`.
- **`grant`:** `state.kind`, a label; the grant kinds the protocol reads say more in their modules.
- **An answer** (a block with `refs.answers`) carries `state.status` and is exempt from the other required fields of its type. The one exception is a **counter-offer**, a promise that answers a promise with new terms and no status (promises.md, Answers).
- **An open type:** nothing beyond the common five.

The fields each closed type may carry are in `protocol.json` (`fields`). A closed block with any other field is refused (`undeclared_field`), unless a schema the block names declares it.

## 8. `valid(block, context)`

`context` is the blocks the checker holds. It never includes a clock. `valid` runs the checks below in this order and **stops at the first check that finds anything**. Its refusal is every code that one check found, one per code, in the order of `protocol.json` (`refusals.codes.block`, which lists the codes in the order of the checks; `refusals.checks` lists each check's codes). `valid` is true when no check finds anything.

1. The block is exactly `{type, state, refs}` and follows canonical.md, strict writing included (`not_canonical`).
2. Every value follows section 3 and its grammar in `protocol.json` (`float`, `integer_range`, `decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`; `unknown_suite` for a hash name in refs that the reader does not know).
3. The canonical body is at most `limits.block_bytes` (`size_limit`). `refs.after` names at most `limits.after_heads` blocks (`after_limit`).
4. A genesis follows section 4 (`bad_genesis`). Any other block has the common five fields of section 5 (`chain`, `at_missing`), and its audience is public or a sorted list of commitments (`audience`).
5. **What it rests on.** Every block it needs is in the context (`unmet`). The needs are in `protocol.json` (`needs`): every block needs its `prev`; a grant also its `parent` and the block it counts to (`counted_to`); a promise also the grant it acts under (`under`) and the promise it answers or stops (`answers`, `updates`). Authority depends on these blocks, so they are causal dependencies: a block that lacks one is **not judged**. Its refusal is `unmet` alone, and a node waits (nodes.md, Push). When they arrive it is judged once, with every other check.
6. The id sent is the hash of the bytes (`bad_hash`). Its signing key is a key of the author that speaks for it, and its signature opens (`bad_signature`, `void_key`, `unknown_suite`, `not_own_rotation`, `recovery_scope`).
7. `prev` and `seq` fit the key's chain, or the block is a skip (`chain`).
8. If the type is closed, it has its required fields and no undeclared ones (`required`, `undeclared_ref`, `undeclared_field`), and its module's checks pass (the codes in `protocol.json`, in the order of the list).

Checks 1 to 4 read the bytes alone, so a block that fails one is refused at once, whatever it lacks. A block that passes may still count for nothing in a fold (folds.md). `valid` says only that the bytes are sound.

## 9. The invariants

Core keeps three. Every other invariant is in the module that owns it, still numbered (protocol.md lists them).

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. A key's blocks form one chain: no two of its blocks name the same `prev`. Two that do prove a lie. Both are kept, and neither binds anyone else.
25. Authority depends on blocks, and they are causal dependencies: a block waits until it holds every block it needs (core.md, check 5), and is then judged once. No node holds a block that another would have judged otherwise for want of what it lacked.

## 10. What core leaves out

The protocol carries only what strangers must agree on with no boss: who said it, under what authority, to whom, with what consent, and how it settled. Drafts, beliefs, goals, limits, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

**Strict writing.** A node writes only the current shapes. It never repairs signed content: it refuses a block, and the author signs a new one.

**Any phone.** Holding keys is better, never required (identity.md, Held keys).
