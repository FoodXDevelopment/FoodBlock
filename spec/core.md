# FoodBlock core

Version 1.7, 2026-10-27. This page and canonical.md are enough to build a micro: make a block, sign it, check it, chain it. Every other rule is in a module (protocol.md). Where files disagree, this page governs.

There is no earlier version in the protocol: 1.6 is year zero and 1.7 adds to it, except the deletions CHANGELOG.md lists. Old data enters once, through a converter outside the protocol (legacy/converter.md).

## 1. A block

A block is three fields and nothing else:

```
{ "type": <string>, "state": <object>, "refs": <object> }
```

- `type` says what kind of act it is.
- `state` holds data.
- `refs` holds links to other blocks. A link is one id, or a set of ids written as a sorted array, never an empty one (`grammar`). Seven links hold exactly one id, never an array: `author`, `prev`, `answers`, `updates`, `as`, `under`, `parent` (`protocol.json`, `refs_single`).

The **id** of a block is the hash of its canonical bytes (canonical.md). The author signs the same bytes. A reader recomputes the id and never trusts one it was sent.

**Types.** A type is a word matching `^[a-z][a-z0-9_]*$`. Seven are known, each with a mood:
- Exists: `actor` (a person, autonomous system, circle or contact; the kind `agent` names an autonomous system) and `thing` (anything held, found or written).
- Is: `observe` (a claim), `transform` (things change), `transfer` (owner, holder or place changes).
- Must: `promise`. May: `grant`.

**Open types, closed authority.** `actor`, `promise`, `transfer` and `grant` carry authority and are **closed**: this spec fixes their fields, and a node that checks refuses a closed block that breaks it. Every other type is **open** and is checked only against this page. A fold reads the types it knows; an unknown open block gives no authority, moves no owner and binds no one.

**The seven verbs** are the `refs` keys that link by meaning:
- `updates`: a new version of that block.
- `answers`: the reply to that block; the only way to consent.
- `confirms`, `defeats`: more or less true; they speak of truth only.
- `for`: what this block serves.
- `derives_from`: what it came from.
- `same_as`: these two records are one.

`prev` and `after` link by order, not meaning. The shared ref keys are in `protocol.json` (`refs`).

## 2. Suites: hash, signature, key agreement

A **suite** names a hash, a signature algorithm and an envelope (key agreement and encryption) together (`protocol.json`, `suites`). `std` is the fixed spelling of an absent suite field: an encoding, not a default. This page defines `std`; `p256` and `sm` are rows of the same shape (encoding.md, Other suites).

| Suite | Hash | Signature | Signing key (hex) | Signature (hex) | Encryption key (hex) | Envelope |
|---|---|---|---|---|---|---|
| `std` | SHA-256 | Ed25519, RFC 8032 | SPKI DER: `302a300506032b6570032100` then 32 bytes | 64 bytes | X25519, 32 raw bytes | `x25519-hkdf-sha256-aes-256-gcm` |

**Signing.** The signed bytes are the canonical bytes of what is signed; no hash is signed separately.
- A test or device key is made from a 32-byte seed, the RFC 8032 private key; the public key is the SPKI hex of the table.
- Ed25519 is pure and deterministic. A writer derives its nonce as the suite says, so the same key and bytes give the same signature (the vectors check exact bytes). A verifier accepts any valid signature, a passkey's included (encoding.md).
- **A verifier checks the grammar first:** a key and a signature are lowercase hex of exactly their suite's length (`protocol.json`, `suites.*.sign_key.grammar`, `suites.*.signature.grammar`; a passkey's longer form for `p256`), before anything is decoded or remembered; anything else opens with no key. For **Ed25519** it then requires: the key's point encoded canonically (`y` below 2^255 - 19, no sign bit on an `x` of zero) and not of small order ([8]A is not the identity); `R` canonical and not of small order; `S` below the group order L; and the cofactorless equation `[S]B = R + [k]A`, checked by encoding `[S]B - [k]A` and comparing with `R`'s bytes. A small-order key verifies a fixed signature over every message, so a genesis, key grant or any field holding a signing key that names one is `unknown_suite`. For **P-256**, `s` is low (at most half the group order); `n - s` is refused, and a writer, a passkey's signature included, writes the low one. A verifier may remember a verdict keyed by a digest of key, signature and bytes.

A post-quantum suite is one more row; it is `future` in `protocol.json` and unusable until its sizes are fixed in vectors.

**A bare hash is SHA-256.** Any other hash carries its name as a prefix: `sm3:` then 64 hex characters, for an id, a commitment or a manifest entry alike. The known hash names are those of the usable suites (`sm3`, the bare SHA-256; `sha3-256` is unknown until its suite is fixed in vectors). An id or commitment with a hash name the reader does not know, in any field the schema roles mark as one, is `unknown_suite`. An id's digest bytes are the 32 bytes after the colon.

**Which suite.** A key names its suite in `state.suite` (genesis or key grant). A block is hashed with the hash of the suite of the key that signed it and verified with that key's algorithm. **Nothing else names the suite:** no message, CBOR entry or field beside a block carries one, so a block has exactly one id, and an id in any other hash is `bad_hash`. A reader learns the suite from the key: a genesis names its own; any other block's key is read from what it rests on (check 6), or is the recovery key. A key's later block is hashed as its `prev` is; only a key's first block after a move to a suite of another hash (and the recovery key's first block, in a `recovery_suite` of another hash) needs the author's keys, held before judging (check 5). A block whose key names a suite the reader does not know is `unknown_suite`. Moving suite is a key grant that replaces a key and names the new suite (identity.md).

## 3. Numbers, time and text

Signed content holds only objects, arrays, strings, integers and booleans: never `null` or a float.
- **Integers** run from -(2^53 - 1) to 2^53 - 1. A count, `seq` and money `minor` are integers. `-0` is refused.
- **Decimals** are strings: `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`. Anything with a fraction is one (`"0.8"`). A reader compares, adds and divides them exactly, never as a float. At most `limits.decimal_digits` digits (40, both sides of the point) (`decimal`).
- **A time** is UTC to the millisecond, exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, a real instant (no 30 February, no `:60`). Times compare as text.
- **A date** is a real `YYYY-MM-DD`.
- **A duration** is ISO 8601 with at least one unit (`PT5M`, `P1Y2M`; `protocol.json`, `grammar.duration`). Months and years are calendar months and years in UTC; a day past the end of the month it lands in is that month's last day (31 January plus `P1M` is 28 February; 29 February plus `P1Y` is 28 February).
- **Text** is Unicode NFC with no unpaired surrogates, keys too. **Hex** is lowercase.
- Which fields hold times and dates is in `protocol.json`.

A reader refuses a block that breaks these rules and does not fix it.

## 4. The genesis

A **genesis** is the one block with no author: an `actor` with no `author`, `prev`, `after` or `seq`, signed by its own key. Its id is the id of the identity.

```
state: { kind, at, audience: "public", public_key_sign }      (suite, public_key_encrypt, custodian: optional; the recovery key's hash and `recovery_reach`: both together or neither)
refs:  { }
```

**Recognising a genesis.** An `actor` is judged as a genesis when it has `state.public_key_sign` or no `refs.author`, and is then held to this section only: a key with an `author`, or neither, is `bad_genesis`. Every other actor (a contact, a circle) has an `author` and no signing key.

That is the whole ceremony: one key. An encryption key, more devices or a custodian come later, each by a key grant (identity.md). A recovery key is named in the genesis or never (identity.md, The recovery key). **A genesis may carry any audience:** public, or a sorted list of commitments with its `nonce` (`protocol.json`, `genesis.private`). A node that lacks her genesis waits on her blocks (check 5). A genesis has no public header: a reader outside its audience is sent nothing of it.

## 5. The chain

Each signing key has its own chain.
- Every block but a genesis carries `refs.author` (the identity's id), `refs.prev`, `state.seq`, `state.at` and `state.audience`.
- `refs.prev` names the key's previous block. A key's first block names the block that brought the key in: the genesis or a key grant. Two first blocks of one key are a fork, whichever block they name (invariant 3).
- `state.seq` is one more than the `prev` block's; a key's first block has `seq` 1. A block marked `state.skip: true` (a **skip**) may jump to any higher `seq`.
- `state.at` is when the author says it was written, on the author's clock. An `observe`, `transform` or `transfer` may leave it out when its signer has no clock (blocks.md, No clock).
- `state.audience` is `"public"` or a sorted list of commitments, one per recipient (privacy.md). The core profile reads and writes public blocks only: it has no sealing, so a block there is public because it can be nothing else. That is a limit of the profile, never a default. A node that holds privacy.md writes a block public only when its author names `public`, and a sale is its two sides' to show.

The **core profile** knows one signing key per identity, the genesis key; a block signed by any other key counts for nothing there (identity.md).

## 6. Messages

A block travels as a message, UTF-8 JSON:

```
{ "block": { type, state, refs }, "signature": "<hex>" }
```

The signature is by the signing key over the canonical bytes of `block`. A message carrying a `suite` is refused with `bad_hash` (section 2). A message has no `version`: one that carries it is refused (`shape`); the block's bytes decide. Sealed blocks, pulls and pushes are in privacy.md and nodes.md.

## 7. Required fields

- **Every block but a genesis:** the five fields of section 5. A block that replies (`refs.answers`, or an author's own stop: `refs.updates` with `state.status: stopped`) needs only these and `state.status`; the one reply without a status is a **counter-offer** (promises.md, Answers). A block that starts something needs the fields of its type:
- **`actor`:** `state.kind`, a non-empty label; missing or non-text is `bad_genesis` on a genesis and `required` on any other actor.
- **`transfer`:** `refs.what`, and at least one of `refs.to_owner`, `refs.to_holder`, `refs.to_place` or `state.count`. A **payment** (`state.money`) names no thing and needs no `refs.what` (things.md, Transfers).
- **`promise`:** `refs.what` or `state.what`.
- **`grant`:** `state.kind`, a label; the kinds the protocol reads say more in their modules (identity.md: `key`; circles.md: `member`; authority.md: `operator`).
- **An open type:** nothing beyond the common five.

The fields each closed type may carry are in `protocol.json` (`fields`; `key_fields` is what an actor and a grant share). A key, its suite and its custodian (`public_key_sign`, `suite`, `custodian`, and on a grant `public_key_encrypt`) belong to a genesis or key grant alone: on any other actor or grant, or on a block with a status, each is `undeclared_field`, and no schema declares one (a circle's actor carries its `public_key_encrypt`). Any other field on a closed block is `undeclared_field` unless a schema the block names declares it or an optional profile in `protocol.json` (`optional_profiles`, its `fields` for that type and `every`) does. A profile's fields are always declared, known to the reader or not. A base schema's hash says what its bytes declare; who signed it adds nothing (`spec/schemas/README.md`).

## 8. `valid(block, context)`

`context` is the blocks the checker holds; it never includes a clock. `valid` runs the checks in order and **stops at the first that finds anything**. Its refusal is every code that check found, one per code, in the order of `protocol.json` (`refusals.codes.block`; `refusals.checks` lists each check's codes). `valid` is true when none finds anything.

1. The block is exactly `{type, state, refs}` and follows canonical.md, strict writing included (`not_canonical`).
2. Every value follows section 3 and its grammar in `protocol.json` (`float`, `integer_range`, `decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`; `unknown_suite` for an unknown hash name in an id).
3. The canonical body is at most `limits.block_bytes` and nests at most `limits.depth` deep (32: the block is 1, its `state` and `refs` 2, each object or array inside one more) (`size_limit`). `refs.after` names at most `limits.after_heads` blocks (`after_limit`). A reader reads JSON text and CBOR at least `limits.depth_read` deep (128, counting each object or array, in CBOR each item, in text each `[` or `{` outside a string) and no deeper in strict text, so a too-deep block is refused by its code and never unreadable.
4. A genesis (section 4) follows section 4 (`bad_genesis`; its values are checked by check 2). Any other block has the common five (`chain`, `at_missing`). Every audience, a genesis's too, is public or a sorted list of commitments with a nonce (`audience`).
5. **What it rests on.** Every block it needs is in the context (`unmet`). The needs are in `protocol.json` (`needs`): the author's genesis, `prev`, the grant or rule it acts under, `parent`, `counted_to`, the block it answers or updates, and the schema a closed block names. They are causal dependencies: a block lacking one is **not judged**; its refusal is `unmet` alone (ids ascending), and a node waits (nodes.md, Push) and judges it once when they arrive.
6. The id is the hash of the bytes in the suite of the key that signed it (`bad_hash`). **That key is read from what the block rests on alone:** the key that signed its `prev`, when the block follows that key's chain; the key its `prev` brought in, when the block is the key's first (the genesis brings in its own key; a key grant about the author, `refs.subject` the author and no status, brings in its `public_key_sign` when the author signed it, or when it names in `refs.under` an operator grant of its own author's that names the author in `refs.to`: that grant is one of its needs, and whether it stands is the identity fold's to say; no `kind` label is read, identity.md, Keys); or the recovery key, named by the genesis's hash, whose first block names the genesis. A block no such key opens is `bad_signature` (`unknown_suite` when the key's suite is unusable); one a key of its author opens, but whose `prev` neither brought that key in nor is that key's block, is `chain`. **A key of its author** is one that what the block rests on brings in (the genesis key, the keys of the key grants among its needs, and theirs in turn), never one another held block brings in. An author's own key grant that replaces a key is signed by that key or the recovery key (`not_own_rotation`); the recovery key signs only key grants and the defeats a profile gives it (`recovery_scope`). **A genesis** must open with its own `state.public_key_sign`; otherwise `bad_genesis`, never `bad_signature` (a passkey genesis with a wrong challenge too).
7. `seq` fits the chain: 1 on the key's first block, one more than its `prev`'s otherwise, or the block is a skip (`chain`). A `prev` held only by its public header (a sealed block) is the key's when the header's signature opens with the key (privacy.md).
8. A closed type has its required fields and no undeclared ones (`required`, `undeclared_ref`, `undeclared_field`), and its module's checks pass (the codes in `protocol.json`, in list order).

**Validity is about the block alone and what it rests on.** `valid` reads no other block, no clock and no arrival, so the same bytes, with what they rest on, have one verdict on every node, and a refusal is final. **Whether a key still speaks for its author is never validity's:** a block of a rotated-out key off its counted line, of a frozen or void key, or of a fork is valid and kept, and counts for nothing in every fold but the identity fold (folds.md, A fork is a burden). Consent never enters `valid`: it decides what binds, not what exists (consent.md, invariant 29). Checks 1 to 4 read the bytes alone, so a block failing one is refused at once, whatever it lacks.

**`check(block, held)`**, the strict check, is `valid` without checks 5, 6 and 7 and without stopping at the first finding: it runs checks 1 to 4 and 8 and gives every code found, one per code, in the order of `protocol.json` (`refusals.codes.block`). `held` is read only by check 8 (a schema or parent grant the block names, the grant it acts under, the block an answer answers). A closed block may carry the `fields` and `roles` of the schema it names (a `thing` of kind `schema`; any other block named in `refs.schema` declares nothing); given a schema store lacking the schema, `check` says `undeclared_ref`, and with no store it does not judge what a schema may declare. A fold reads only valid blocks, judged on what they rest on within the fold's input (folds.md); a valid block may still count for nothing. (The door's `refusals` op gives the codes; its `check` op one sentence per finding.)

## 9. The invariants

Core keeps these; the rest are in the module that owns them, still numbered (protocol.md).

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. A key's blocks form one chain: no two name the same `prev`, and it has one first block. Two that do are a fork, and both are kept. A fork is the same key with the same `prev`, and only that: the same `prev` named by different keys (the recovery key's first block and the first key's) is two chains (identity.md).
25. Authority depends on blocks, which are causal dependencies: a block waits until it holds every block it needs (check 5) and is then judged once. No node holds a block another would have judged otherwise for want of what it lacked.

## 10. What core leaves out

The protocol carries only what strangers must agree on with no boss: who said it, under what authority, to whom, with what consent, and how it settled. Drafts, beliefs, goals, limits, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

**What this spec binds.** It says what blocks mean and what folds compute. What a node, custodian, index or author does is only its own signed promise (nodes.md, A node's promise). Where it names a refusal code, that is the code a refusing node uses.

**Strict writing.** A block is only the current shapes, and signed content is never repaired: a block that is not canonical is refused, and its author signs a new one. A node that follows this keeps it as its own promise (nodes.md, A node's promise).

**The three remedies.** A broken deal has three remedies: what is still the other side's comes back (the money paid for what never came, a thing whose title never passed; promises.md, Settling), what both signed, before or after, for this case moves (a penalty, a bond, a buy-off; promises.md, Conditions; things.md, Transfers), and anyone may refuse to deal again (consent.md). FoodBlock carries all three as facts. Taking back what is already yours is the first remedy, not a fourth, and nothing beyond them rests on anyone's signed word. Force or fraud is not a broken deal but an attack; it goes to the victim's judge (promises.md, A claim of invasion), and FoodBlock still carries only facts. **Rectification is the wrongdoer's own act at work.** What moves after an attack is moved by the attacker's own signed or committed act; the referee only reads it (Kinsella). The three remedies rest on that one ground. (Rothbard, *The Ethics of Liberty*, ch. 12-13, 18-19.)

**One rule for silence.** Silence counts only by the silent person's own earlier signed word about what her silence will mean: co-owners who signed "no refusal in 14 days on the circle's clock means each owes a third"; "didn't happen by a time" (promises.md, By a time). Every such case is this one rule, never a special case. Nothing else fills a silence: a default would bind a person by a word she never signed.

**No implied duties.** No spec or schema text assumes a duty nobody signed: loyalty, best ability, confidentiality, a doctor's or an auditor's silence. Each exists only as a signed refrain (promises.md, Refrain). An "implicit" duty is a default, and a default binds a person by a word she never signed.

**A signature says what the signer binds, never that she can pay.** A promise binds its signer's name and what she pledged, and a referee settles a dispute about what the signed words mean, not a debt: a ruling is a fact, and what is owed is paid by the debtor's own act. No one's property answers for a word they never signed.

**A signer cannot deny her own signed act.** This is why a block counts against its signer on her word alone: estoppel in its narrow form (Kinsella). Only that form. Silent acquiescence is never counted.

**No rule chains.** Every binding term is readable from the block plus at most one rulebook named by hash. A rulebook that cites a rulebook that cites another is read by no fold. The sides sign the rules they mean, whole.

**Copies carry no power.** A block's power is its signer's word and nothing else. The same bytes are one block (one id). A copy re-signed under another key is another block that speaks for its new signer and for no one else. A bearer note changes hands only by a signed transfer, never by being copied.

**Any phone.** Holding keys is better, never required (identity.md, Held keys).

## 11. A signed block means tomorrow what it meant when it was signed

A later version may add (a type, a field, a term, a code, a fold) and may refuse what no earlier version took. It never changes what an earlier valid block says in the words a signer relies on: its bytes and id, its place in its key's chain, whether it is valid, whom it speaks for, what it binds, who owns what it moves (the owner as the record shows it, folds.md, Ownership; a written claim is never title itself), and the rule beneath them all: only a signed word binds, and it binds only its signer, their name to its truth, what they pledged to its condition, their consent to another acting for them, never their body (identity.md, authority.md, circles.md; promises.md, Who may bind and Settling; folds.md). A signed word never gives anyone a right to use force on the signer's body; only the signer's own attack, never their word, costs them that. What one can hand on is what one acquired or was handed; a body was never acquired, so no word hands it on (Kinsella, revising Rothbard).

Every fold and view is a named reading; its name in `protocol.json` (`folds`, `views`, and a profile's) is its stable id. A better one is published under a new name, and the old keeps its name and answers. A **word** is an output that decides who is bound or whom a block speaks for; every other output is a **reading**. The words are locked; a reading may be replaced. The words are the outputs `protocol.json` marks as `words` in each of `folds` (`"all"` where every output is one), and the `equivocations` a push lists, which are the chain fold's. A view is never the word, even one that changes a word's answer for its reader (`recovery_reach` adds the reader's arrivals to `signed_by_author`); the word is the pure fold. A reading inside a fold with words is replaced by a new fold under a new name carrying the old words unchanged. Every version's vectors stay in the suite.

The law binds from the **lock**: once two nodes and one implementation, each written and run by parties other than the author of that spec hash (whatever code they run), pass the 1.7 vectors as `spec/vectors.json` holds them at the lock. The lock is a fact anyone can check; nobody, its author included, announces it. Until then any of it may change, and CHANGELOG.md says what did.
