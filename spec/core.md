# FoodBlock core

This page and canonical.md are enough to build a micro: make a block, sign it, check it, chain it. Every other rule is in a module (protocol.md). Where files disagree, this page governs.

## The one shape

The protocol has one shape, and it is a promise: *if this happens, this of mine becomes yours.* A judge, if the sides name one, settles a quarrel; a promise with none binds all the same. A sale, a loan, a wage, a deposit, a warranty, a stake and a guarantee are all it (promises.md, What a promise is). A transfer is the shape with its condition already met; a ruling is the settling the shape names, a signed fact by the one named. Two signed things are not a promise: a grant lets another act for me, and binds me only through what is then done under it; a circle is people who hold such grants and things together. A rule a person signs in advance for what her autonomous system may do is a grant, and so is a limit she sets on it.

## 1. A block

A block is three fields and nothing else:

```
{ "type": <string>, "state": <object>, "refs": <object> }
```

- `type` says what kind of block it is.
- `state` holds data.
- `refs` holds links to other blocks. A link is one id, or a set of ids written as a sorted array, never an empty one (`grammar`). Seven links hold exactly one id, never an array: `answers`, `updates`, `as`, `under`, `parent`, `meter`, `to_owner` (`protocol.json`, `refs_single`); `author`, `prev` and `key` are one id too, and a set there is `chain` (section 8). A list where a ref takes one id is `grammar`, except in a ref a rule names as a list: a grant's `refs.to` and a row's `to`, each with `needed`.

The **id** of a block is the hash of its canonical bytes (canonical.md). A reader recomputes the id and never trusts one it was sent. What the author signs is in section 2.

**`state.rule_set`** is a field of every type, read by every reader. A block that states a set this reader does not run is not read (`unknown_rules`), and it hides what it could name (`folds.md`, Read whole). A build runs the one set its manifest names (section 11); a value that is not an id is `grammar`.

**Types.** A type is a word matching `^[a-z][a-z0-9_]*$`. Seven are known, each in one of three moods, and there is no fourth:
- **Is** (a reading): binds its signer's name to its truth and obliges no one to act; any key signs one, a machine's included. `actor` (a person, autonomous system, circle or contact; the kind `agent` names an autonomous system), `thing` (anything held, found or written), `observe` (a claim) and `transform` (things change). A `transform` with no inputs, a first use, is a reading: evidence a judge reads, never title made by a signature.
- **Must** (a promise): binds its signer's property to its condition; only a person signs one. `promise`, and `transfer` (owner, holder or place changes), which is a promise whose condition is already met.
- **May** (a grant): the signer's consent to who may speak as him (key grants) or act for him or on what is his (every other grant), within limits; a holder hands on only a narrower part. `grant`.

A machine (kind `agent` or `machine`) signs only readings, its own key grants, or a narrower part of a grant it holds, handed on. Acting under a person's grant it signs a reading, "I did X under grant G" (`refs.under`); what binds the person is her own grant, and nobody signs as anyone else. An answer that accepts is a promise, written with the type of the block it answers; one exception, a machine's reading "accepted under rule R", counts as its principal's accept only when R is her live grant that names it (promises.md, Answers). A decline is a reading: an `observe` that `answers` the block it declines and says `state.status: declined` (a deal's decline also names it in `refs.for`), and it binds nothing of its signer's. A decline written before the three moods, with the type of the block it answered, is read the same forever (blocks are append-only). A stop keeps its form (promises.md, Answers).

**Open types, closed authority.** `actor`, `promise`, `transfer` and `grant` carry authority and are **closed**: this spec fixes their fields, and a closed block that breaks them is not read (section 8). Every other type is **open** and is checked only against this page. A fold reads the types it knows; an unknown open block gives no authority, moves no owner and binds no one.

**The seven verbs** are the `refs` keys that link by meaning:
- `updates`: a new version of that block.
- `answers`: the reply to another's block: it accepts, declines or stops it. Taking up an offer or an ask is only by an answer.
- `confirms`: its signer signs that block's word too. Like every word, it binds her only on what of hers the block reaches: where she holds a part, a voice or a place in it, she joins it; where nothing in it is hers, it is her word that it is true, and binds nothing.
- `defeats`: her word that it is false. It binds nothing of hers.
- `for`: what this block serves.
- `derives_from`: what it came from.
- `same_as`: these two records are one.

`prev` and `after` link by order, not meaning. The shared ref keys are in `protocol.json` (`refs`).

## 2. Suites: hash, signature, key agreement

A **suite** names a hash, a signature algorithm and an envelope (key agreement and encryption) together (`protocol.json`, `suites`). `std` is the fixed spelling of an absent suite field: an encoding, not a default. This page defines `std`; `p256` and `sm` are rows of the same shape (encoding.md, Other suites).

| Suite | Hash | Signature | Signing key (hex) | Signature (hex) | Encryption key (hex) | Envelope |
|---|---|---|---|---|---|---|
| `std` | SHA-256 | Ed25519, RFC 8032 | SPKI DER: `302a300506032b6570032100` then 32 bytes | 64 bytes | X25519, 32 raw bytes | `x25519-hkdf-sha256-aes-256-gcm` |

**Signing.** A key signs canonical JSON (canonical.md) of four shapes only: a block's header, a genesis's own bytes, a signed request and a signed answer (nodes.md). No two share a set of top-level keys: a header has `hash`, a genesis has `type`, a request has `signer` and `node`, an answer has `node` and neither `signer` nor `hash`. A verifier checks the key set before the signature. No hash is signed separately.

**A block is signed over its header** (privacy.md, The header) and over nothing else. The **header** is `{ author, seq, prev, hash }`, plus `key` when the block has `refs.key`, and `skip: true` when the block says so. A genesis is signed over its own bytes and has no header. The header carries nothing else: no `draws`, no `at`, no `after`. The header names the block by its id, so the signature is the key's word on exactly those bytes, and one signature serves a reader who holds only the header and a reader who holds the body. No genesis is signed again. A signature shows that a key signed these bytes. It never shows what the key's holder saw: consent is shown by a signature, and only the signer's own word binds her (section 10).
- A test or device key is made from a 32-byte seed, the RFC 8032 private key; the public key is the SPKI hex of the table.
- Ed25519 is pure and deterministic. A writer derives its nonce as the suite says, so the same key and bytes give the same signature (the vectors check exact bytes). A verifier accepts any valid signature, a passkey's included (encoding.md).
- **A verifier checks the grammar first:** a key and a signature are lowercase hex of exactly their suite's length (`protocol.json`, `suites.*.sign_key.grammar`, `suites.*.signature.grammar`; a passkey's longer form for `p256`), before anything is decoded or remembered; anything else opens with no key. For **Ed25519** it then requires: the key's point encoded canonically (`y` below 2^255 - 19, no sign bit on an `x` of zero) and not of small order ([8]A is not the identity); `R` canonical and not of small order; `S` below the group order L; and the cofactorless equation `[S]B = R + [k]A`, checked by encoding `[S]B - [k]A` and comparing with `R`'s bytes. A small-order key verifies a fixed signature over every message, so a genesis, key grant or any field holding a signing key that names one is `unknown_suite`. For **P-256**, `s` is low (at most half the group order); `n - s` is refused, and a writer, a passkey's signature included, writes the low one. A verifier may remember a verdict keyed by a digest of key, signature and bytes.

A post-quantum signing suite is one more row; it is `future` in `protocol.json` and unusable until its sizes are fixed in vectors. Its signature fits `limits.signature_bytes` (encoding.md, Bytes).

**An encryption key** is the suite's own, written bare, or a name, a colon and a key, as a hash is (`protocol.json`, `encrypt_keys`). `xwing:` and then 2,432 lowercase hex characters is an X-Wing key (draft-connolly-cfrg-xwing-kem, version 11): the 1,184-byte ML-KEM-768 key, then the 32-byte X25519 key. The sealer uses the key as stated. A named key whose name this reader does not know is skipped: it seals nothing for her, and the rest of the block that states it stands, since sealing to her is a convention (privacy.md, Envelope).

**A bare hash is SHA-256.** Any other hash carries its name as a prefix: `sm3:` then 64 hex characters, for an id, a commitment or a manifest entry alike. The known hash names are those of the usable suites (`sm3`, the bare SHA-256; `sha3-256` is unknown until its suite is fixed in vectors). An id or commitment with a hash name the reader does not know, in any field a schema marks as one, is `unknown_suite`. An id's digest bytes are the 32 bytes after the colon.

**Which suite.** A key names its suite in `state.suite` (genesis or key grant). A block is hashed with the hash of the suite of the key that signed it and verified with that key's algorithm. **Nothing else names the suite:** no message, CBOR entry or field beside a block carries one, so a block has exactly one id, and an id in any other hash is `bad_hash`. A reader learns the suite from the key its pieces name (section 8, the signature): the genesis key, or a key the key grant its `refs.key` names brings in. A block whose key names a suite the reader does not know is not judged (`unknown_suite`): like `unmet`, it waits, and a reader that learns the suite judges it. Moving suite is a key grant, by a voice above a key, that puts a key of another suite in that key's place (identity.md, A suite move).

## 3. Numbers, time and text

Signed content holds only objects, arrays, strings, integers and booleans: never `null` or a float.
- **Integers** run from -(2^53 - 1) to 2^53 - 1. A count and `seq` are integers. An amount is a decimal (encoding.md, Shapes). `-0` is refused.
- **Decimals** are strings: `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`. Anything with a fraction is one (`"0.8"`). A reader compares, adds and divides them exactly, never as a float. At most `limits.decimal_digits` digits (40, both sides of the point) (`decimal`).
- **A time** is UTC to the millisecond, exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, a real instant (no 30 February, no `:60`). Times compare as text.
- **A date** is a real `YYYY-MM-DD`.
- **A duration** is ISO 8601 with at least one unit (`PT5M`, `P1Y2M`; `protocol.json`, `grammar.duration`). Months and years are calendar months and years in UTC; a day past the end of the month it lands in is that month's last day (31 January plus `P1M` is 28 February; 29 February plus `P1Y` is 28 February).
- **Text** is well-formed Unicode: valid UTF-8 with no surrogate code point, keys too. Nothing else about text is checked: no normal form, no table, no Unicode version. Two texts are the same when their bytes are the same. Noncharacters are text. **Hex** is lowercase.
- **No tables in the protocol.** No Unicode table, no time zone database, no currency list, no list of units. A unit is its author's text.
- Which fields hold times and dates is in `protocol.json`.
- **A kind may type its own fields.** `protocol.json`, `kind_fields`, lists under a type and a kind (`state.kind`) the fields the module that owns the kind already names, each with one shape: `text`, `hash` (a SHA-256 digest in hex), `id`, `time`, `count` (a whole number of at least 1), or one of a closed list. A field that is there must have its shape (`shape`, `grammar` or `time`); a field left out is needed by nothing, unless its line says the kind states it (a kind that must state a field is no kind without it: `shape`), a field not listed is not read, and no kind is refused for carrying more. The rule is the same for every kind, open types included.

A `null`, a float, a whole number outside this range or text that is not well-formed is bytes that are not canonical, and `valid` refuses them (`not_canonical`). A value that breaks any other rule here is `read`'s: the block is not read (section 8). No reader fixes it.

## 4. The genesis

A **genesis** is the one block with no author: an `actor` with no `author`, `prev`, `after` or `seq`, signed by its own key. Its id is the id of the identity.

```
state: { kind, at, audience: "public", public_key_sign }      (suite, public_key_encrypt, reach, clocks, voices: optional; clocks required with reach)
refs:  { }
```

**Recognising a genesis.** A genesis is an actor that names its own signing key (`state.public_key_sign`) and has no `refs.author` and no `state.seq`. It is held to this section only (`bad_genesis`). A block that names no key and no author is no genesis and lacks the common five (`chain`). Every other actor (a contact, a circle) has an `author` and no signing key.

A genesis is one key, made in a thing she holds at her first yes that binds her. It is her first voice, and her genesis is a list of one voice, or states her whole list in `state.voices`, its own key a `key` voice of it (identity.md, Her voices). An encryption key, more devices and more voices come later, each by a key grant. **A genesis may carry any audience:** public, or a sorted list of commitments with its `nonce` (`protocol.json`, `genesis.private`). A node that lacks her genesis waits on her blocks (section 8, its pieces). A genesis has no public header: a reader outside its audience is sent nothing of it.

## 5. The chain

Each signing key has its own chain.
- Every block but a genesis carries the **common five**: `refs.author` (the identity's id), `refs.prev`, `state.seq`, `state.audience`, and `state.at`, which any block may leave out.
- `refs.prev` names the key's previous block. A key's first block names the block that brought the key in: the genesis or a key grant. Two blocks of one key that name one `prev` or state one `seq` are a pair (a block on no chain of its key is none) (invariant 3).
- **`refs.key`.** On every block signed by a key other than its author's genesis key: the id of the key grant that brought that key in; a key grant that shows a key named by hash in her genesis list names that genesis. The header repeats it as `key`, so a header alone names its pieces. The key grant is a `grant` of kind `key` whose `refs.subject` is the block's author; its own author may be another (one of a voice of named people). The keys it brings in are each `key` voice of the list it states, the one `public_key_sign` it adds under a voice, and the key it states in `shown_key` when that key's hash is a `key_hash` voice of the list its own `refs.key` names.
- `state.seq` is above the `prev` block's; a key's first block has `seq` 1. A block marked `state.skip: true` (a **skip**) may jump to any higher `seq`. A key's blocks are one chain, joined by `prev`; `seq` numbers the chain and never orders it (folds.md, A chain). A block whose `seq` or `prev` does not fit its chain is still valid: `valid` reads neither (section 8), and the chain fold shows it (`broken`, `gaps`).
- `state.at` is when the author says it was written, on the author's clock. Any block may leave it out (blocks.md, Time).
- `state.audience` is `"public"` or a sorted list of commitments, one per recipient (privacy.md). The core profile reads and writes public blocks only: it has no sealing, so a block there is public because it can be nothing else. That is a limit of the profile, never a default. A node that holds privacy.md writes a block public only when its author names `public`, and a sale is its two sides' to show (privacy.md, Showing a deal: a side who wants it kept close signs a promise not to show it).

The **core profile** knows one signing key per identity, the genesis key; a block signed by any other key counts for nothing there (identity.md).

## 6. Messages

A block travels as a message:

```
{ "block": { type, state, refs }, "signature": "<hex>" }
```

A message is canonical JSON, whole (canonical.md, On the wire), and exactly `{ block, signature }`: any other key refuses it (`shape`). The signature is by the signing key over the block's header, or a genesis's over its own bytes (section 2). Sealed blocks, pulls and pushes are in privacy.md and nodes.md.

## 7. Required fields

- **Every block but a genesis:** the common five of section 5. A block that replies (`refs.answers`, or an author's own stop: `refs.updates` with `state.status: stopped`) needs only these and `state.status`; the one reply without a status is a **counter-offer** (promises.md, Answers). A block that starts something needs the fields of its type:
- **`actor`:** `state.kind`, a non-empty label; missing or non-text is `bad_genesis` on a genesis and `required` on any other actor.
- **`transfer`:** `refs.what` or `state.amount`, and at least one of `refs.to_owner`, `refs.to_holder`, `refs.to_place` or `state.count`. A transfer that names no instance in `refs.what` moves an amount of a good the record does not hold, and names `refs.to_owner` (`required`). A transfer with `state.amount` names neither `refs.to_holder` nor `refs.to_place` (`shape`): an amount moves only title, and what is kept apart or placed is a thing (things.md, Transfers).
- **`promise`:** `terms.lines` or `state.what`. A promise that moves anything or names a price states it in its lines, each a thing, an amount of a good (money now for money later is one; there is no loan type), or a price for time or a job; one that moves nothing and names no price says in `state.what` what it is (promises.md, Terms).
- **`grant`:** `state.kind`, a label; the kinds the protocol reads say more in their modules (identity.md: `key`; `protocol.json` `kinds`).
- **An open type:** nothing beyond the common five.

The fields each closed type may carry are in `protocol.json` (`fields`; `key_fields` is what an actor and a grant share). A key, its suite and her voices (`public_key_sign`, `suite`, `reach`, `voices`, `clocks`, `shown_key`, and on a grant `public_key_encrypt`) belong to a genesis or key grant alone: on any other actor or grant, or on a block with a status, each is `undeclared_field`, and no schema declares one (a circle's actor alone carries `clocks`, `pack` and `rules`, circles.md; any actor but a contact may carry `public_key_encrypt`). Any other field on a closed block is `undeclared_field` unless a schema the block names declares it does. (A profile's fields are declared by the profile's schema, named by the block, as anyone's are.) A base schema's hash says what its bytes declare; who signed it adds nothing (`spec/schemas/README.md`).

## 8. `valid(block, blocks)` and `read(block, blocks)`

`valid(bytes, blocks)` answers one question: which key said these bytes. Where the block sits on its chain, and whether this reader can read it, are other questions. It reads five things, in order, and stops at the first that finds anything. (1) **The size.** Bytes longer than `limits.block_bytes`, or opening more than `limits.depth` levels, are `size_limit`, and nothing else is read. (2) **The bytes** are the canonical bytes of a value that follows strict writing, exactly `{ type, state, refs }`: no fraction, and no whole number past 2^53 − 1 (`not_canonical`). (3) **The header** has the common five, each of `author`, `prev` and `key` one id in the id grammar, or is a genesis (`chain`); an id in a hash name this reader does not know waits (`unknown_suite`). (4) **Its pieces** are among the blocks the reader has, and valid (`unmet`, `bad_piece`). (5) **The signature.** The id is the hash of the bytes in the suite of a key its pieces bring in (`bad_hash`), and that key opens the signature over the header that names the block by that id (`bad_signature`); the first that finds anything is given, never both. A genesis: a suite this reader does not know waits (`unknown_suite`); else its id is the hash of its bytes in its own suite (`bad_hash`); else its own key opens it over its own bytes (`bad_signature`). A place this reader cannot read brings in nothing and refuses nothing. `bad_signature` is given only when every place the pieces offer is one this reader can read. `size_limit`, `not_canonical`, `chain`, `bad_piece`, `bad_signature` and `bad_hash` are final for those bytes. `unmet` and `unknown_suite` wait. A reader refuses for good only what no later rule could make sayable.

`blocks` is the blocks the checker has; it never holds a clock. `valid` reads no `prev`, no other link, no schema and no clock. Its answer is every code the first of the five that finds anything found, one per code, in the order of `protocol.json` (`refusals.codes.block`; `refusals.checks` lists each one's codes). A block that waits (`unmet`, `unknown_suite`) is kept, counted in no fold, and judged again when the reader has what it lacks or knows its suite.

**A block's pieces** are its author's genesis, the block its `refs.key` names, and that block's pieces. Nothing else is a piece: not `prev`, not the block it answers, and not a grant it acts under (who said a tool's bytes is its own key; whom they speak for reads that grant as a block named for its meaning). Whoever presents a block carries its pieces. The reader has each piece, with its body, and it is valid. One she lacks, or has only as its header, is `unmet`, naming each such piece, ids ascending: fetching it cures the wait. One she has that waits on a suite this reader does not know makes the block wait the same way (`unknown_suite`). One she has and refused is `bad_piece`, naming it and its code: a piece's id is the hash of its bytes, so it can never become valid, and nor can a block that rests on it. They are grounded in the genesis by construction, so a ring of key grants has no pieces. A block with no `refs.key` is signed by its author's genesis key.

**The key that opens it.** The block `refs.key` names is a key grant whose `refs.subject` is this block's author, whoever signed it, or her genesis for a key grant that shows a key her genesis list names by hash (else `bad_signature`). A header whose pieces' list names a key by its hash, and that no key they name opens, may be a key grant whose key is shown only in its body: it is `unmet`, naming its own id, until its body is had. The keys it brings in are section 5's. A key grant that is valid brings its key in whether or not this reader can read it; one that is not read gives its key no voice in any fold. A block such a key signs is its author's word where that key has a voice in a list this reader reads (`signed_by_author`): it names the not-read key grant only to find its key.

**A header a reader has.** A reader outside a sealed block's audience has it as its header message `{ header, header_signature }` (privacy.md), and no other unsigned or bare form counts as a header she has. A value with a `header` key is read as a header message. `valid` of a header checks its keys (the message is exactly `{ header, header_signature }`, the header's keys are `protocol.json` `header` and `header_optional`; else `chain`), its pieces (from its `author` and `key`) and its signature, as above. Its id is checked against the body when the reader has a body (privacy.md, The header).

**`read(block, blocks, schemas)`** answers whether this reader can read a valid block. It is true when the reader holds the body and:
- every value follows section 3 and its grammar in `protocol.json` (`decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`; `unknown_suite` for an id or key in a hash or suite this reader does not know). A key grant's list is such a value (identity.md, Her voices): each voice as `shapes.voice` gives it, `voices` and a key under a voice (`public_key_sign`) never both, `clocks` only with `voices`, and `clocks` with any `reach` or `wait` above zero (`shape`). A genesis follows section 4 (`bad_genesis`). Every audience, a genesis's too, is public or a sorted list of commitments with a nonce (`audience`). `refs.after` names at most `limits.after_heads` blocks (`after_limit`);
- a closed type has its required fields and no undeclared ones (`required`, `undeclared_ref`, `undeclared_field`), its module's checks pass, and any rule set it states is one this reader runs (`unknown_rules`, section 1), against `schemas` (with none given, the schema store of `held`, below);
- every block it names for its meaning (`protocol.json`, `needs`) is among the blocks she has, valid and read (`names_missing`, naming the id of each one she lacks; `names_unread`, naming the id of each one she has that is not valid or not read).

It gives every code it finds, one per code, in the order of `protocol.json` (`refusals.read`), which lists every code it can give. The ids `names_missing` names are what `needs(block, blocks)` gives.

A block `read` cannot read is **not read**: it is valid and kept as its header, listed with its codes, counted in no fold, and never refused; a later reader, or this one with more blocks or newer lists, may read it. A block a reader has by its header alone is not read, and `read` is not run on it. A not-read block gives no one a claim on its disk. A block whose body `read` refuses, and whose header its key opens, is only a header the reader has. `valid` and `read` are answers about bytes; neither is a duty to keep, pass on or show anything.

**The schema store** is what a reader makes of the blocks it holds with `schemas_from(blocks)` (the door's op): every `thing` of kind `schema` among them, once per id, and nothing else; a schema counts by being among the blocks a reader has, whoever signed it. A closed block that names a schema she has in `refs.schema` may carry the `fields`, `roles` and promise terms the schema declares; a field it does not declare is `undeclared_field`; a schema she lacks is `names_missing`, and the fields it might declare are not judged until she has it. The store is the reader's own reading of the blocks she has: no block signs it and it holds no clock.

**Whether a key still speaks for its author is never `valid`'s:** a block of a key an end has reached off its counted chain, of a key whose key grant is waiting or not read, or of a pair is valid and kept, and counts for nothing in every fold but the identity fold (identity.md; folds.md, A fork is a burden). Consent never enters `valid`: it decides what binds, not what exists (invariant 5 below). Why two questions: a signed word binds only its signer, so the one fact every reader must share is who signed; what a reader cannot read is that reader's gap, never the signer's silence, so she has it and never refuses it.

## 9. The invariants

The invariants that are protocol are numbered 1 to 27 in the order of the files in protocol.md; each sits in its file, under its number. The others stay beside their text, unnumbered, prefixed "Holds:".

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. A key's blocks form one chain: no two name the same `prev` or state the same `seq`, and it has one first block. Two that do are a pair, and both are kept. A pair is the same key with the same `prev` or `seq`, and only that: the same `prev` named by different keys (the first blocks of two keys a list brings in) is two chains (identity.md).
4. A question waits only for the blocks it reads: `valid` for a block's pieces, `read` for the blocks it names for its meaning, a fold for the chain it reads. No block waits for its `prev`, and no verdict of `valid` changes for want of a block.
5. Validity is about the block alone and what it rests on. No one's word about what may reach her refuses another's block: a block sent despite her STOP is valid and kept, so an honest sender's chain never stalls for anyone else's word.

## 10. What core leaves out

**The test.** A rule is protocol only when, without it, two readers holding the same blocks could answer differently one of four questions about a signed block (*who signed these bytes; whom does it speak for; what of whose does it bind to whom, and on what condition; who owns what it moved*). Everything else is a **reading**, **library**, or **a node's own business**.

A stranger applies it in order: is it about what a machine does with a block, not what the block says? A node's own business. Delete it: can two readers with the same blocks now differ on who signed, whom it speaks for, what it binds or who owns? If not, a reading or library. If they can, it is protocol.

How a deal settled is carried as signed facts (transfers, answers, a bench's word); a sum over them is a reading. Drafts, beliefs, goals, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

**Only what she signed.** A record holds only words that people signed: no fact, no silence and no ruling is in it. A word acts only on what is its signer's own; whatever of another's it touches waits for that other's own word naming it. A word on what is wholly its signer's own needs no other's word: it waits only on what she herself stated before it (blocks.md, Finality).

**Only from what she holds.** A reader answers only from words she holds, on a chain read whole back to its start; otherwise she says what she holds and what she lacks, and never "nobody" where she holds a signed word that names someone. A word is after every word it names, and after the one before it on its chain. Nothing else shows which word was made first: no date, no arrival, no hash, no size of past. So across two chains the record shows only after: never before, and never that nothing came. Before and nothing-between are shown only along one chain read whole. Where a rule needs to know which of two words came first and the record does not show it, neither came first (folds.md, A chain).

**The record, never the right.** A fold is arithmetic over words. Nobody signed its answer, so it acts on nothing. Who is right is a judge's word. Every answer here is the record: what signed words show.

**What this spec binds.** It says what blocks mean and what folds compute. What a node, index or author does is only its own signed promise (nodes.md, A node's word). Where it names a refusal code, that is the code a refusing node uses.

**Strict writing.** A block is only the current shapes, and signed content is never repaired: a block that is not canonical is refused, and its author signs a new one.

**The three remedies.** A broken deal has three remedies: what is still the other side's comes back (the money paid for what never came, a thing whose title never moved; promises.md, Settling), what both signed, before or after, for this case moves (a penalty, a bond, a buy-off; promises.md, Conditions; things.md, Transfers), and anyone may refuse to deal again: she does not answer, or answers no. FoodBlock carries all three as facts. Taking back what is already yours is the first remedy, not a fourth, and nothing beyond them rests on anyone's signed word. Fraud in a deal is a condition of that deal that failed (Rothbard, ch. 19; Kinsella), so it is that deal's dispute and goes to its bench (promises.md, Disputes). **An attack is harm outside any deal of the one harmed**: theft, poisoning, drift, fraud that harms one outside the deal, or a word signed under a threat, which is no word of hers (promises.md, The signer's word). It goes to her own judge (promises.md, A claim of invasion). **The attacker's consent is not asked.** By his act he lost to her what it cost her, with no word of his (Kinsella). An attack is not a signed word, so the record cannot show it: it shows her claim and her judge's ruling as facts, and title moves in it only by the previous owner's signed word, given then or before (a bond a ruling releases: promises.md, Rulings). Whoever acts on a ruling answers for the act if it was wrong. (Rothbard, *The Ethics of Liberty*, ch. 9, 12-13, 19.)

**One rule for silence.** Silence counts only by the silent person's own earlier signed word about what her silence will mean: co-owners who signed "no refusal in 14 days on the circle's clock means each pays a third"; "didn't happen by a time" (promises.md, By a time). Nothing else fills a silence: a default would bind a person by a word she never signed.

**No implied duties.** No spec or schema text assumes a duty nobody signed: loyalty, best ability, confidentiality, a doctor's or an auditor's silence. Each exists only as a signed promise not to do, with its stake (promises.md, A promise not to do).

**A signature says what the signer binds, never that she can pay.** A promise binds its signer's name and what she pledged, and a judge settles a dispute about what the signed words mean, not a debt: a ruling is a fact, and what is to come is paid by the debtor's own deed. No one's property answers for a word they never signed. This is Kinsella's form: a promise to pay later carries the condition that she has title to the sum then, and where she has not, no title passes (Kinsella, "A Libertarian Theory of Contract", 2003, p. 23). Rothbard would reach the debtor's other property and future income (*The Ethics of Liberty*, ch. 19); here that reach is a term a borrower may sign ("10% of each payday until repaid"), never a rule.

**A signer cannot deny her own signed word.** This is why a block counts against its signer on her word alone: estoppel in its narrow form (Kinsella). Only that form. Silent acquiescence is never counted.

**No rule chains.** Every binding term is readable from the block plus at most one rulebook named by hash. A rulebook that cites a rulebook that cites another is read by no fold. The sides sign the rules they mean, whole.

**Copies carry no power.** A block's power is its signer's word and nothing else. The same bytes are one block (one id). A copy re-signed under another key is another block that speaks for its new signer and for no one else. A bearer note changes hands only by a signed transfer, never by being copied.

**One signature.** A person binds herself only by a block a key of hers signed; the least she signs is a genesis. Where her key lives is hers to choose: a phone, a card, a SIM, a passkey. Until she has signed, what anyone writes about her words is that writer's word; she is bound by nothing, and others' signed words to her bind them all the same.

## 11. Rule sets

**A rule set is named by its hash**: the SHA-256, in lowercase hex, of the canonical bytes (canonical.md) of its manifest. A number such as "1.9" is a label for people; no reader reads it. Change one byte of a file the manifest names and it is another rule set.

```
{ "files": { "<path under spec/>": "<SHA-256 of the file's bytes>", ... } }
```

`files` names exactly `core.md`, `canonical.md`, each file of `modules/` but `nodes.md`, `protocol.json`, `vectors.json`, `fuzz-vectors.json` and `audit-vectors.json` (the audit's worlds, frozen as their answers: data, never one engine's program), and nothing else. The manifest is published beside them as `spec/rule-set.json` at the lock; until then a build names no set.

**The first set is H₀**, the one these files make, locked with its manifest. A block that names no rule set is read by H₀: an absent `state.rule_set` is the one spelling of H₀'s id, as an absent suite is `std`. A build reads by its own rules only the blocks that name its own manifest's id, and, if it is made from H₀, those that name none; every other id is `unknown_rules` to it. No set is read into a block from another block. A later rule counts only in a block that names it. A rule whose purpose is to refuse what a signer would never name (a fork, a backdate, a summed limit) is no later rule: it is in the core.

**A chosen rule is a value written in the word it binds.** A rule that is not derived binds a person only as a value in a word she signed, or in a block that word names. No value is read into a block from a block it does not name. Where a rule could honestly be otherwise, acting only on what is its signer's own, it is a field with stated values that every reader of the one engine reads. No value makes a thing land without its receiver's yes, cuts a draw down to what is left, or makes one amount count on two chains at once: each would act on another's thing.

**Who runs which.** A reader runs the rule sets it chooses. A node lists in its discovery document's `reads` a rule set only when it runs a build made from that set's files.

**Less, never otherwise.** A reader that cannot read something on a chain answers less about every thing that chain could have touched, never something else. No answer depends on the machine that computes it. The protocol fixes no depth of its own beyond `limits.read_depth` (encoding.md): a reader that stops, there or sooner, says so (`not_shown`, with what it did not reach), never another owner; a reader that goes on answers fully.

**An old reader** answers less, never otherwise. A block it cannot read hides what that block could name, never the rest of its chain (folds.md, Read whole).

**What a signed block keeps.** Under the core, and under the set it states, a block keeps its bytes and id, whether it is valid, whom it speaks for, what it binds and who owns what it moves, and the rule beneath them all: only a signed word binds, and it binds only its signer, their name to its truth, what they pledged to its condition, their consent to another acting for them, never their body. What one can hand on is what one acquired or was handed; a body was never acquired, so no word hands it on (Kinsella, revising Rothbard).

Ground: an idea is not property, so no one can own the rules or forbid a fork; a rule binds a signer only as the words she could read when she signed, so the name of the rules is the hash of those words.

## 12. What a builder implements

A **word** is an output that answers one of the four questions of section 10; every other output is a reading. A reading a word needs is part of that word. No word reads a view, a profile, a pattern or a reader's clock.

**The sound part** is `valid` and what it reads: the bytes (canonical.md and strict writing), the id, the header and the signature. Its ops are `hash`, `id_of`, `header`, `strict_text`, `verify`, `suite_of_key` and `valid`; its cases are those ops' cases in `vectors.json`. It answers who said these bytes, and nothing else.

**The word ops** are the door ops that answer a word, listed in `protocol.json` `door.protocol` beside the sound part.

An implementation **conforms for an op** when it reproduces every case of that op in `vectors.json`. It **speaks FoodBlock** when it passes the sound part and the cases of every word op. Any other builder conforms for the ops it passes, and says which. Readings, renderers, library tools and a node's conventions each have their own cases, which nobody must run.

A door may keep blocks between calls (`mount`, `unmount`): an op given a mount answers exactly as it does given the same blocks.
