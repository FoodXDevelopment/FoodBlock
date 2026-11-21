# FoodBlock 1.8, stage 2: the store

Uses the words of `00-shared.md` with its meanings. Depends on stage 1's `refs.key` and key grant shape, both built. Every passage is named by its first and last words, and the words govern; line numbers were read on 2026-11-11 after stage 1 was built and are only a guide (`core.md` moved one line down from line 95, `blocks.md` about 25).

---

## 1. What this stage does

A block stops being one question and becomes three. `valid` says who said these bytes, reading only the block's pieces. `read` says whether this reader can read it. A fold says what follows, and answers only from a line it holds whole.

Story. Sam's mill runs an old node. Maria signs block 41 with a field from a newer version, then block 42, then an offer. Today block 41 is refused and everything after it waits for good: Maria goes silent on Sam's node. After this stage block 41 is valid (her key signed it), not read (Sam's lists do not know the field), and kept as its header. Block 42 and the offer are valid and read. A fold that needs Maria's line through block 41 answers `not_shown` and names block 41 in `lacks`. Nothing else stops.

This stage also makes the bytes exact. A message is canonical JSON, whole. Text is well-formed Unicode, compared byte for byte, with no table. Every block but a genesis is signed over its header. A passkey check reads 91 fixed bytes and parses no JSON. A pair is two blocks of one key on one `prev` or at one `seq`. A node's arrivals are a sealed line of receipts, and leaving is an export of each block's pieces and the lines its answers read.

---

## 2. Spec edits, file by file

### `spec/core.md`

**C1. Section 1, line 23.** Old: "The author signs the same bytes. A reader recomputes the id and never trusts one it was sent." New: "A reader recomputes the id and never trusts one it was sent. What the author signs is in section 2."

**C2. Section 2, line 52, the paragraph "**Signing.** The signed bytes are ... and every other block's own bytes."** Replace whole with:

> **Signing.** A key signs canonical JSON (canonical.md) of four shapes only: a block's header, a genesis's own bytes, a signed request and a signed answer (nodes.md). No two share a set of top-level keys: a header has `hash`, a genesis has `type`, a request has `signer` and `node`, an answer has `node` and neither `signer` nor `hash`. A verifier checks the key set before the signature. No hash is signed separately.
>
> **A block is signed over its header** (privacy.md, The public header) and over nothing else. The header names the block by its id, so the signature is the key's word on exactly those bytes, and one signature serves a reader who holds only the header and a reader who holds the body. A genesis has no header and is signed over its own bytes; it is the one exception, and no genesis is signed again. A signature shows that a key signed these bytes. It never shows what the key's holder saw: consent is shown by a signature, and only the signer's own word binds her (core.md, section 10).

The three bullets after it (lines 53 to 55) stay word for word.

**C3. Section 2, line 57.** Old: "A post-quantum suite is one more row; it is `future` in `protocol.json` and unusable until its sizes are fixed in vectors." New: "A post-quantum suite is one more row; it is `future` in `protocol.json` and unusable until its sizes are fixed in vectors. Its signature fits `limits.signature_bytes` (encoding.md, Bytes)."

**C4. Section 2, line 61, the paragraph "**Which suite.**".** Delete from "A reader learns the suite from the key:" to "A block whose key names a suite the reader does not know is `unknown_suite`." (it names the recovery key and `recovery_suite`, which stage 1 removed). Put in its place:

> A reader learns the suite from the key its pieces name (section 8, check 6): the genesis key, or a key the key grant its `refs.key` names brings in. A block whose key names a suite the reader does not know is not judged (`unknown_suite`): like `unmet`, it waits, and a reader that learns the suite judges it.

The sentences before ("**Which suite.** A key names ... is `bad_hash`.") stay; the last ("Moving suite is a key grant that puts a key of another suite in a place (identity.md, A suite move).") is stage 1's, already in.

**C5. Section 3, line 71.** Old: "- **Text** is Unicode NFC with no unpaired surrogates, keys too. **Hex** is lowercase." New:

> - **Text** is well-formed Unicode: valid UTF-8 with no surrogate code point, keys too. Nothing else about text is checked: no normal form, no table, no Unicode version. Two texts are the same when their bytes are the same. Noncharacters are text. **Hex** is lowercase.

**C6. Section 5, line 94, last sentence.** Old: "Two first blocks of one key are a fork, whichever block they name (invariant 3)." New: "Two blocks of one key that name one `prev` or state one `seq` are a pair, whatever block they name (invariant 3)."

**C7. Section 5, line 96, the `seq` bullet ("- `state.seq` is one more than the `prev` block's; ... may jump to any higher `seq`."; line 95 above it is stage 1's `refs.key` bullet), add at its end:** "A key's blocks are one line, ordered by `seq` (folds.md, A line). A block whose `seq` or `prev` does not fit its line is still valid: `valid` reads neither (section 8), and the chain fold shows it (`broken`, `gaps`)."

**C8. Section 6, line 110** ("The signature is by the signing key over `block` ... are in privacy.md and nodes.md."). Replace the paragraph with:

> A message is canonical JSON, whole (canonical.md, On the wire), and exactly `{ block, signature }`: any other key refuses it (`shape`). The signature is by the signing key over the block's header, or a genesis's over its own bytes (section 2). Sealed blocks, pulls and pushes are in privacy.md and nodes.md.

(The fenced example at lines 106 to 108 stays; delete ", UTF-8 JSON", comma and all, from line 104: "A block travels as a message:".)

**C9. Section 8, lines 123 to 138**, from the heading "## 8. `valid(block, context)`" to the end of the paragraph "**`check(block, held)`**, the strict check, ...". Replace the whole section with (check 6 as it stands still reads the key from `prev` or the recovery key and names `not_own_rotation` and `recovery_scope`; stage 1 left it to this stage):

> ## 8. `valid(block, held)` and `read(block, held)`
>
> `valid(block, held)` answers one question: who said these bytes. It is true when the block follows sections 1 to 4 and canonical.md, its pieces are held (A block's pieces, below; `unmet` naming each one missing), and the key its pieces name, in a suite this reader knows (`unknown_suite`), opens its signature over its header (`bad_signature`, `bad_hash`). It reads no `prev`, no other link, no schema and no clock. A refusal is final for those bytes. `unmet` and `unknown_suite` are no refusal: this reader cannot judge the block yet, so it is kept, counted in no fold, and judged when the piece is held or the suite is known. Where the block sits on its key's line is the line's question (folds.md, A line). Whether this reader can read it is `read`'s. A block that is valid and not read is kept as its header and counts in no fold; it is never refused for being unreadable.
>
> `held` is the blocks the checker holds; it never holds a clock. `valid` runs these checks in order and **stops at the first that finds anything**. Its answer is every code that check found, one per code, in the order of `protocol.json` (`refusals.codes.block`; `refusals.checks` lists each check's codes). `unmet` and `unknown_suite` are waits: a block that gets one is judged again when what it lacks is held. Every other code is final for those bytes.
>
> 1. The block's bytes are the canonical bytes of a value that follows strict writing (canonical.md) (`not_canonical`).
> 2. Every value follows section 3 and its grammar in `protocol.json` (`float`, `integer_range`, `decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`; `unknown_suite` for an unknown hash name in an id).
> 3. The canonical body is at most `limits.block_bytes` and nests at most `limits.depth` deep (32: the block is 1, its `state` and `refs` 2, each object or array inside one more) (`size_limit`). `refs.after` names at most `limits.after_heads` blocks (`after_limit`).
> 4. A genesis (section 4) follows section 4 (`bad_genesis`; its values are checked by check 2). Any other block has the common five (`chain` for a missing `refs.author`, `refs.prev` or `state.seq`; `at_missing`). Every audience, a genesis's too, is public or a sorted list of commitments with a nonce (`audience`).
> 5. **A block's pieces** are its author's genesis, the block its `refs.key` names, and that block's pieces. Nothing else is a piece: not `prev`, not the block it answers, and not the grant it acts under, an operator grant included (who said a machine's bytes is its own key; whether they bind its operator is whom it speaks for, which reads that grant as a block named for its meaning). Each piece is held and valid (`unmet`, naming each one not held, ids ascending). They are grounded in the genesis by construction, so a ring of key grants has no pieces. A block with no `refs.key` is signed by its author's genesis key.
> 6. The block `refs.key` names is a key grant (a `grant` of kind `key`) whose `refs.subject` is this block's author, whoever signed it (else `bad_signature`; one not held is check 5's `unmet`). A key it brings in (identity.md, `refs.key`: a `key` voice of its list, its one key under a voice, or its own `shown_key`), or the genesis key when there is no `refs.key`, opens the block's signature over its header (`bad_signature`), and the id is the hash of the block's bytes in that key's suite (`bad_hash`). A key in a suite the reader does not know is `unknown_suite`. A genesis opens with its own `state.public_key_sign`, over its own bytes (`bad_genesis`). A key grant that is valid brings its key in for this check whether or not this reader can read it; one that is not read gives its key no voice in any fold.
>
> **A held header.** A sealed block is held by a reader outside its audience as its header message `{ header, header_signature }` (privacy.md), and no other unsigned or bare form counts as held. `valid` of a header checks its keys (`protocol.json`, `header`, `header_optional`; `shape`), its pieces (check 5, from its `author` and `key`) and its signature (check 6). Its id is checked against the body when a body is held (privacy.md, The public header).
>
> **`read(block, held, schemas)`** answers whether this reader can read a valid block. It is true when the reader holds the body, the body passes check 8 against `schemas`, and every block it names for its meaning (`protocol.json`, `needs`) is held, valid and read (`names_missing`, naming the id of each one not held; `names_unread`, naming the id of each one held and not valid or not read). It gives every code it finds, one per code, in the order of `protocol.json` (`refusals.read`).
>
> 8. A closed type has its required fields and no undeclared ones (`required`, `undeclared_ref`, `undeclared_field`), and its module's checks pass (the codes in `protocol.json`, in list order).
>
> A block `read` cannot read is **not read**: it is valid and kept as its header, listed with its codes, counted in no fold, and never refused; a later reader, or this one with more blocks or newer lists, may read it. A block held by its header alone is not read, and `read` is not asked of it. Whether a node keeps a not-read block's body is its own word; a not-read block gives no one a claim on its disk.
>
> **The schema store** is what a reader makes of the blocks it holds with `schemas_from(held)` (the door's op): every `thing` of kind `schema` among them, once per id, and nothing else; a schema counts by being held, whoever signed it. A closed block that names a held schema in `refs.schema` may carry the `fields`, `roles` and promise terms the schema declares; a field it does not declare is `undeclared_field`; a schema not held is `names_missing`. The store is the reader's own reading of its held blocks: no block signs it and it holds no clock.
>
> **Whether a key still speaks for its author is never `valid`'s:** a block of a key an end has reached off its counted line, of a key whose key grant is waiting or not read, or of a pair is valid and kept, and counts for nothing in every fold but the identity fold (identity.md; folds.md, A fork is a burden). Consent never enters `valid`: it decides what binds, not what exists (consent.md, invariant 29). Why the split: a signed word binds only its signer, so the one fact every reader must share is who signed; what a reader cannot read is that reader's gap, never the signer's silence, so it is held and never refused.

**C10. Section 9, invariant 3 (line 146).** Old, the whole invariant: from "3. A key's blocks form one chain: no two name the same `prev`" to "(the recovery key's first block and the first key's) is two chains (identity.md)." New: "3. A key's blocks form one line: no two name the same `prev` or state the same `seq`, and it has one first block. Two that do are a pair, and both are kept. A pair is the same key with the same `prev` or `seq`, and only that: the same `prev` named by different keys (the first blocks of two keys a list brings in) is two lines (identity.md)."

**C11. Section 9, invariant 25 (line 147).** Replace with: "25. A question waits only for the blocks it reads: `valid` for a block's pieces, `read` for the blocks it names for its meaning, a fold for the line it reads. No block waits for its `prev`, and no verdict of `valid` changes for want of a block."

### `spec/canonical.md`

**K1. Add a section after "What RFC 8785 gives" (after line 23), before "## Strict writing":**

> ## On the wire
>
> **A message is its canonical bytes.** Everything FoodBlock sends as JSON (a block message, a sealed block, a request, an answer, a push, an export, an envelope's plaintext) is canonical JSON, whole: the bytes RFC 8785 gives for the value they parse to. A reader keeps the bytes as they came and takes them only if they are exactly those bytes. Any difference refuses the message (`not_canonical`): a space, a key out of order, a repeated key, an escape that is not the shortest, a number not written as the writer writes it, bytes that are not UTF-8, text that is not JSON.
>
> **A block's id is the hash of its bytes as they came.** In a block message they are the bytes after `{"block":` and before `,"signature":`. Those bytes must also be the canonical bytes of a value that follows strict writing (below), or the block is refused (`not_canonical`; core.md, check 1). No reader hashes bytes it rebuilt from text.
>
> **Two limits are read on the bytes first.** A block's bytes longer than `limits.block_bytes`, or that open more than `limits.depth` levels (each `{` or `[` outside a string opens one), are `size_limit`, and nothing else is read.
>
> **A refusal names bytes.** Its `hash` is the SHA-256 of the bytes refused, as they came. Bytes that are refused have no canonical form and no id.
>
> Everything signed follows strict writing: a signed request, answer or header holds no float and no null. CBOR has no text: its reader rebuilds the value and writes the canonical bytes (encoding.md, The compact form).

**K2. Line 27.** Old: "...and never repairs it. Nothing is sorted, dropped or normalised on the way in." New: "...and never repairs it (On the wire)."

**K3. Lines 30 to 35, rules 2 to 7.** Replace with:

> 2. **No null.** A `null` anywhere is refused.
> 3. **Whole numbers only.** A number is a whole number from -(2^53 - 1) to 2^53 - 1, written `0`, or an optional `-`, a digit 1 to 9, then digits. On the wire any other number token is not canonical (`not_canonical`): no reader turns a token into a float to judge it. `float` and `integer_range` are for a value that never was text: a number in CBOR, or a value handed to a writer.
> 4. **Well-formed text.** Every string and key is valid UTF-8 with no surrogate code point (core.md, section 3). No normal form is checked.
> 5. **Sorted sets.** (line 33, unchanged)

Delete rules 6 and 7 (a repeated key is not canonical bytes; the audience is check 4's `audience`).

**K4. Edge cases table, line 67.** Old row: "| a key or string not in NFC | refused | NFC only |". New rows: "| a key or string not in NFC | as written | Text is compared byte for byte |" and "| a lone surrogate, as an escape or raw | refused | Not well-formed text |". Line 66's reason column becomes "No float, no negative zero (`not_canonical` on the wire)".

**K5. Lines 71 to 80, section "## Signatures".** Delete it. Put: "## Signatures\n\nWhat is signed is in core.md, section 2."

**K6. Line 84.** Old: "...is still hashed and signed as the JCS bytes above." New: "...is still hashed as the JCS bytes above, and signed over its header (core.md, section 2)."

### `spec/transport.md`

**T1. Line 7.** Old: "...holds `{ "messages": [ ... ] }`: block messages (core.md, section 6), sealed when not public, with the author's genesis and the grant chain the autonomous system acts under." New: "...holds `{ "messages": [ ... ] }` as canonical JSON (canonical.md, On the wire): block messages (core.md, section 6), sealed when not public, with each block's pieces (core.md, section 8), enough to say who signed it. A block whose answer reads a line (a block under a grant, a draw) may travel with that line from it back to its start (folds.md, A line)."

### `spec/modules/encoding.md` (Bytes, Passkeys, and three phrases the rules above force)

**E1. Bytes, line 10, add at its end:** "A signature in any suite, a passkey's included, is at most `limits.signature_bytes` bytes (8,192, which holds a passkey assertion, ML-DSA-44 and SLH-DSA-SHA2-128s); a longer one opens with no key."

**E2. Limits, line 23.** Delete "A post-quantum signature must still fit in the block limit."

**E3. Passkeys, line 54.** Old: "(its own, or its header's when it is private; core.md, section 2)" New: "(its header's; a genesis's own bytes; core.md, section 2)".

**E4. Line 75.** Old: "(a block's canonical bytes, or its header's canonical JSON for a private block; for a signed message part, canonical.md's bytes without `signature`)". New: "(a block's header as canonical JSON, a genesis's own canonical bytes, or a signed request or answer without `signature`)".

**E5. Line 77.** Old: "For a public block that is its id in base64url." New: "For a genesis that is its id in base64url."

**E6. The check, lines 82 to 87.** Replace the list with:

> 1. The key is a P-256 key (Other suites, above), the signature is longer than 64 bytes, at most `limits.signature_bytes`, and parses as the table says.
> 2. Bit 0 of the flags byte (byte 32 of `authenticatorData`) is set. This is a check of form: a key held in software writes the byte itself, so it shows nothing about a person.
> 3. `clientDataJSON` begins with exactly these bytes: `{"type":"webauthn.get","challenge":"`, the 43 characters of the challenge, then `","origin":"`: 91 bytes in all (WebAuthn Level 2 and Level 3, 5.8.1.1). Nothing after them is read, and no JSON is parsed.
> 4. The ECDSA signature `r`, `s` opens over `authenticatorData || SHA-256(clientDataJSON)` with the key.

**E7. "What is deliberately not checked", line 91, insert before the list:**

> A passkey shows its holder the site that asks, never the bytes, and one tap serves a sign-in and a promise alike. So a passkey signature is the key's word on whatever challenge the asking software chose, given on its holder's tap. The site that asked (`origin`) and whether the device verified its holder (`UV`) are inside the signed bytes and travel with the signature; `valid` reads neither, and a judge may read both.

Line 93 ("- **`rpIdHash` and `origin`.** They say which website asked; the block names none.") becomes: "- **`rpIdHash`.** It says which website asked; the block names none." Line 94: "- **The counter.** Two blocks of a key on one `prev` or at one `seq` are a pair (core.md, invariant 3), which shows a clone better."

**E8. Invariant 28, line 106.** Replace with: "28. A passkey signature opens only for the key that made it, over one block's header (a genesis's own bytes): it carries its own challenge, and a reader checks nothing but the block. It says nothing of what its holder saw."

**E9. The compact form, line 110.** "...writes its canonical JSON (canonical.md), hashes it and verifies the signature over that JSON" becomes "...writes its canonical JSON (canonical.md), hashes it, and verifies the signature over its header (core.md, section 2)". **Line 112:** "(RFC 8949 §4.2)" becomes "(RFC 8949 §4.2.3: map keys sorted length first, then bytewise)". **Line 118:** "A chain header is a map `{ author, seq, prev, hash }` and nothing more" becomes "A header is a map `{ author, seq, prev, hash }`, with `key`, `skip` or `withheld` when the block has them, and nothing more". **Line 123:** "text: text string, NFC." becomes "text: text string, as written."

**E10. Bytes, line 11.** Delete the bullet "- `recovery_key_hash` is the identity's suite hash of the recovery key's SPKI hex, as UTF-8 text." (stage 1 removed the recovery key; a `key_hash` voice is identity.md's).

**E11. Passkeys, "#### Recovery" (lines 100 to 102).** Replace its paragraph ("A lost passkey is handled by the recovery key (identity.md). ... a rotation retires a lost one.") with: "A lost passkey is a lost key: a voice above it puts a new key in its place (identity.md, Her voices). A key grant adds a second passkey."

### `spec/modules/privacy.md` (The public header only)

**P1. Lines 26 to 39.** Replace the section body (from "Every block but a genesis has one" to "...`false_headers`, nodes.md).") with:

> Every block but a genesis has one: `{ author, seq, prev, hash }`, plus `key` when the block has `refs.key`, and `withheld: true` or `skip: true` when the block says so (a skip's header must say so). It is what the block is signed over (core.md, section 2), so a header and a body can never carry two words that disagree, and a passkey asks its holder once. A public block's header is read from the block; a sealed block's travels beside the envelope (Sealed messages). A header shows its key's `seq`, so a key that minds showing how many blocks it wrote skips (`skip`). It shows nothing the block had seen: no `after`, no `at`, no amount (folds.md, A line).
>
> **A sealed block is a block held by its header.** It is valid as any block is (core.md, section 8), and not read by a reader outside its audience.
>
> A recipient takes a body only when its header describes it exactly (`hash`, `author`, `key`, `seq`, `prev`, `skip`, `withheld`; `open_copy` refuses otherwise). A header and a body of one hash are two halves of one block, never a duplicate. A header that does not describe the body held under its hash is refused (`bad_hash`); a body arriving under the hash of a header it does not fit shows that header false and replaces it (`false_headers`, nodes.md).

(Deleted: "So anyone can check a chain, its gaps and its forks"; the paragraph "One signature" as its own rule, now core.md section 2; "Checking a sealed block's link" and its three bullets; the paragraph "A block of any kind whose `prev` is a sealed block ...".)

### `spec/modules/folds.md`

**F1. Line 7, the paragraph "**A fold reads only what is whole and valid.**".** Replace with:

> **A fold reads only what is valid and read.** A block that is not valid is out: it is no word, means no one and speaks for no one. A block that is valid and not read (core.md, section 8) is held as its header: it keeps its place on its line, and no fold reads its body, so a line holding it is not read whole (A line). Of a block that is not read, a reader reads its header and, to say what it cannot read, its `refs.updates`, `refs.answers` and `refs.for`; a fold that answers about a record may list in `unread` each such block that names the record there and is signed by the record's author or a side the record names (`from`, `to`). What a fold does with an `unread` block is said where the fold is defined. A sealed block held by its header alone is a block not read.

(Deleted: "every later block of a chain holding an ill-formed block" and "A fold of a promise that is not whole or well-formed returns null" stays as its own sentence at the end.)

**F2. Insert a new section after line 30 (before "## Orderer"):**

> ## A line
>
> **A line** is one key's blocks, ordered by `seq` and joined by `prev`. A keeper's receipts are a line like any other; that is all a clock's order is. Nothing orders two blocks of different lines but a ref: a block is after every block it names.
>
> **A start** is the block where the line a question reads begins. Each fold that reads a line names its start where it is defined.
>
> **Read whole.** A reader holds a line read whole from a block back to a start when it holds every block reached from the first by `prev` until the start, and each is valid and read. A block held only as its header leaves the line not whole, whatever the header says: a header shows no `after`, so it cannot show what its key had seen.
>
> **A line goes on past its key's replacement only for what its person owns.** A key grant that puts a new key in an old key's place continues the old key's line from the old key's last block that counts (the key grant itself, when the old key signed it; else the block it names in `state.counted_to`). A grant's line never follows: the giver signs a new grant for a new hand. Two continuations of one line are a pair.
>
> **`not_shown`, `lacks`.** A fold whose line is not read whole answers `{ not_shown: true, lacks }` in place of its answer, and lists in `lacks` each block it would need: its id where a held `prev` names it, else `{ author, key, seq }` (`key` the id of the key grant that brought the key in, null for the genesis key). Filling a hole never changes an answer, because with the hole there was none. The door op `read_whole(block, start, held)` gives `{ whole, lacks }`.
>
> A fold that reads an order, a sum or what a key had seen answers only on the line it names, read whole from the block back to the line's start. Otherwise its answer is `not_shown` with `lacks`, the blocks it would need. It never answers from the part it holds.
>
> Why: a reader who answers from part of a line fills the missing blocks with her guess, and a guess binds no one; the signer's own line is the only order she stated.

**F3. Line 60, A fork is a burden, first two sentences.** Old: "Two blocks of one key that name one `prev`, or two first blocks of one key, both counting in the identity fold, are a **pair** (core.md, invariant 3). The pair proves the key lied; it ends nothing the key bound. In every fold but identity, the pair and every later block of that key (one with a block of the pair in its `prev`-ancestry through that key's blocks) are blocks of a fork, ..." New: "Two blocks of one key that name one `prev` or state one `seq`, both counting in the identity fold, are a **pair** (core.md, invariant 3). The pair proves the key lied; it ends nothing the key bound. A pair needs no line: its two headers are the whole proof. In every fold but identity, the pair and every block of that key whose `seq` is at or above the lower `seq` of the pair are blocks of a fork, ..." (the rest of the section, from "until the key is rotated" to its end, is stage 3's: 03-amounts.md, F6).

**F4. Line 147, `chain`.** In "It reports `equivocations`, the pairs that prove each group of blocks taking one place", add after "taking one place": "or stating one `seq`". After "a block whose `prev` is neither is broken." (not inside the sentence that begins "`broken`, each block whose `prev` ...", which runs on) add "A block that is broken or follows a gap is still valid (core.md, section 8)."

**F5. Invariant 26, line 151.** Replace with: "26. A fold reads only valid, read input, and is a function of it: the same blocks give the same answer on every node, whatever order they came in. A block `valid` refuses counts for nothing; a block not read is held as its header."


**F6. What each fold returns, line 125**, the `signed_by_author` bullet ("- `signed_by_author` is true for a block that is the id's, ... a block the reach protects is true as well."), still names the recovery key and arrivals, which stage 1 removed. Replace with stage 1's meaning, word for word from its op: "- `signed_by_author` is true when a key of the block's author spoke for her there (identity.md, invariant 8); a block that is waiting is true here and listed by `stands` (blocks.md, Finality)." No rule changes.
### `spec/modules/blocks.md` (two sentences that state the old `valid`; the rest of blocks.md is stage 1's)

**B1. Line 52, Micro safety.** Old: "If it cannot learn it, it stops using that key: its operator rotates it with `counted_to` the last block anyone has (identity.md, Who may rotate)." New: "If it cannot learn it, a lost block stops nothing: its later blocks are valid, and the chain fold shows the gap; a line read whole across the gap is not shown until the block turns up."

**B2. Line 54, Refusals.** Old: "...and is final for those bytes (core.md, section 8)." New: "...and is final for those bytes, bar `unmet` and `unknown_suite`, which wait (core.md, section 8). A block `read` cannot read is not refused: it is not read."

### `spec/modules/nodes.md`

**N1. Line 3.** Old: "A block that is sound under core.md is valid whatever its type (core.md, Open types); whether a node stores it or passes it on is that node's own promise (A node's promise, below)." New: "A block is valid whatever its type (core.md, section 8); whether a node stores it or passes it on is that node's own promise (A node's promise, below)."

**N2. Messages, line 7.** Old: "A message is UTF-8 JSON." New: "A message is canonical JSON, whole (canonical.md, On the wire)."

**N3. Line 8.** Replace "by a live key of the signer: not void, not frozen, not rotated out (a rotated-out key still speaks for its blocks up to `counted_to`, but opens no door)." with "by a key that speaks for the signer (identity.md; the door's `live_keys`)." Add at its end: "A signed request from a signer the node does not hold is checked against the pieces the push carries."

**N4. Line 9.** Old: "...that the signer raises with every request to that node, which refuses an equal or lower one;" New: "...that the signing key raises with every request to that node, which keeps the highest per key and refuses an equal or lower one;".

**N5. Line 10.** Replace with:

> In a pull answer, `request` is the bare SHA-256 hex (whatever the suite) of the canonical JSON of the whole signed request, `signature` included, and `n` is each block's arrival number on the log the answer names (The arrival log). A push answer is `{ node, receipt, taken, held, unjudged, refused, unread, equivocations, signature }`; every key is always present but `receipt` and `held`, and an empty list is `[]`. `receipt` is the receipt of what the push added, as a sealed block message, left out when the push added nothing or the node signs none. `held` lists the blocks already held, ascending by hash. Giving either is the node's promise (below).

**N6. Insert a new section before "## Pull" (after line 11):**

> ## The arrival log
>
> A node says "I hold this" as anyone says anything: with a signed block on its own line.
> - A **door log** is the line of one key of the node's holder that it keeps for one person's door and for nothing else. Each block on it is a receipt (blocks.md, A named clock) of what pushes added for that door: `refs.derives_from` the blocks, `refs.subject` the door's person, sealed to her and to the pusher (privacy.md). One receipt may name every block a door took in a span, from several pushes. Its `seq` may skip (`skip`), so a number shows order and never a count.
> - A node that keeps a log of public blocks (an index) keeps it on another key, with public receipts: one key writes public blocks or sealed blocks, never both.
> - A log is named by the id of the block that brought its key in. A block's **arrival number** on a log is the `seq` of the first receipt on it that names the block.
> - A block the node refused, or never showed the door's person, takes no receipt. A node that stops holding a block says so on the same log: an `observe` of kind `dropped`, `refs.derives_from` the blocks, or receipts, which drops every block they name that the door's person neither signed nor answered.
> - A receipt on a door log after a receipt of her address that no longer names this node is no taking at her door (Her address).
> - A push that got no receipt has not been shown to be taken.
>
> **Three things are shown by signed words alone** (door op `log_shown`):
> - **Left out.** A receipt puts a block at a number; a pull answer signed for the same log covers that number (the request's `since` is below it and the answer's `next` at or above it); the block matches the request's filter as the asker may see it; no `dropped` at or below `next` names it; and the block, or its header, is not in the answer.
> - **Stopped short.** A request names in `seen` a receipt on the log; the answer's `next` is below that receipt's `seq` and equals the request's `since`.
> - **Two logs.** Two receipts of one log's key that name one `prev` or state one `seq`: a pair (Equivocation).
>
> Each is a fact about what the node signed, never a verdict. What it costs the node is whatever its own word, or a deal its holder signed, says.

**N7. Pull, line 14.** Replace with: "- `log` names the log the asker reads; a door log is served only to a signed asker it is sealed to. `since` is an arrival number on that log (exclusive; 0 from the start). With no `log` (the node keeps none, or the asker names none), `since` and `n` are the node's own word: numbers it keeps for itself, 1, 2, 3 in the order it took blocks, which show nothing. `seen` is the id of a receipt on that log the asker holds: an answer to it is the node's word that it read its log at least that far."

**N8. Line 18, add at its end:** "The answer names its `log`. A puller moves past a block it refuses or cannot yet judge: `next` is a place on the peer's log, never a claim that the puller took every block before it."

**N9. Line 19.** "both blocks of a pair it holds" stays; add after the first sentence: "A pair is two blocks of one key on one `prev` or at one `seq` (Equivocation)." Delete the last sentence, "A recovery rotation and the first key's block are not a pair."

**N10. Push, lines 24 to 32.** Replace with:

> A sealed copy may say which of the receiving node's people it is for (`for`: `{ hash: [id] }`). A sealed block arrives as its header message, which `valid` judges as any block (core.md, section 8).
> - **A push is one message,** read by the wire rule (canonical.md, On the wire): bytes that are not canonical refuse the whole push (`not_canonical`), and nothing in it is judged. A block whose own bytes break strict writing is refused alone.
> - **A node judges each block on its pieces.** Every block of a push is judged by `valid` against what the node holds and the rest of the push. One whose pieces are not all there is unjudged (`unjudged`, with the pieces it lacks as `needs`); nothing else holds a block back. A valid block is taken; it is then read (`read`), and one that is not read is listed in `unread` with its codes and held as its header. An accept pushed alone is valid on its own pieces, and read once the offer is held.
> - **A sealed copy is kept only from its author:** from a signed push whose signer is the block's author. Any other push may bring the header but no copy.
> - **A body beats a false header.** When a block arrives whose hash the node holds as a header naming another author, key, `seq` or `prev`, `valid` judges the block, the answer lists the hash in `false_headers`, and the node keeps the block in the header's place.
> - **Unjudged.** How many blocks may stay unjudged for one author, from whom, and for how long is the node's own word. A node fetches a missing piece from the signer of a signed push, or from a route in an address block its author signed.
> - **The answer.** `taken` and `refused` are ascending by hash, a block's codes in `protocol.json` order; `unjudged` and `unread` ascending by hash, each `needs` and `codes` in order; what is taken never depends on the order of a push. `equivocations` is always present: the pairs (Equivocation) of each group of blocks of one key on one `prev` or at one `seq` that a block of this push belongs to, counting only blocks that speak for their author once the push is taken (a block that does not count for its author forms no pair: identity.md, A suite move). The pairs are a **star**: each block of the push paired with the lowest hash of its group, and a block that is that lowest paired with each other. Each pair is sorted as text, and so is the list. **Both blocks of a pair are kept.** Whether a node takes them is its own promise: a node that does not takes neither when both arrive in one push, and not a block that forks one already held. Such a block is neither refused nor unjudged. A sealed pair's proof is its two headers.

**N11. Signed answers, line 34.** Delete the last sentence ("Two signed answers giving different blocks for one arrival number are a fork of the node's own answers."). Two logs is a pair.

**N12. Admission, line 39.** Replace with: "- `per_stranger` is the most **asks** one day may bring from each sender not in `parties`, counted for that sender alone. An ask is a block that names one of the node's people in a ref; a block's pieces, and the blocks its answer reads, are never counted. When the node has taken that many asks today from that sender, the next is `not_admitted` (`asks_today >= per_stranger`). A key costs nothing, so a count for each sender bounds no flood: a door that wants a bound states a total (below)." **Line 41:** "most blocks a day" becomes "most asks a day".

**N13. A node's promise, line 48.** "giving `held` or `at`" becomes "keeping an arrival log, and giving `receipt` or `held`"; "how many blocks may wait for one author" stays.

**N14. A host, line 53 (Her address), add after "...she lists the new route before she drops the old, so there is an overlap.":** "An address may state `until`: by her word, it names no route after that time."

**N15. Line 55, the host's promise.** Add to the lines a host may state: "that it keeps one door log for each person it keeps a door for, on a key of its own for that door, every receipt naming her in `refs.subject` and sealed to her and to the pusher".

**N16. Line 56, Export and import.** Replace with:

> - **Her record at a host** is every block her door log names, every block she signed that the host holds, each one's pieces, the lines each one's answers read, from the block back to their starts (folds.md, A line), and the door log. It leaves as `{ format: "application/foodblock+json", messages }`, canonical JSON, each block exactly as signed; another author's sealed block as its header, with the unopened envelopes for the one they are sealed to. **An export is whole** when the door log runs unbroken from its first receipt to a receipt she holds; every block a receipt on it names is in it or named by a `dropped`; every piece of every block in it is in it; and no fold asked of a block in it answers `not_shown` with a `lacks` that a receipt on the log names. She, and anyone she hands the log to, checks this from the document. It loads by the rule of a push: each block is judged alone, and one the new host does not take holds back only the blocks it is a piece of. **She need not ask to leave:** a pull of her door log `since` her last receipt brings the same blocks.

**N17. Discovery, line 60.** `{ protocol: "foodblock", version, node, holds, speaks_for, admission, endpoints: { pull, push, challenge } }` becomes `{ protocol: "foodblock", version, node, speaks_for, admission, endpoints: { pull, push, challenge }, log, signature }`. Add: "`log` names the node's public log, when it keeps one. The document is signed like any answer (invariant 18)." (`holds` is deleted: a ready list for a harvester.)

**N18. Equivocation, line 64, the whole paragraph** ("A pair is two blocks with one signing key and one `prev`, or two first blocks of one key ... What a fold does with a pair is in folds.md."). New: "A pair is two blocks with one signing key and one `prev` or one `seq` (core.md, invariant 3); it needs no line, only the two (or their headers). Blocks of two keys are never a pair. A sealed block known by its header alone pairs the same way (privacy.md). A node keeps both. What a fold does with a pair is in folds.md." (Gone: the recovery key as a signer of its own, two recovery rotations, and "two binding blocks of one record that do not see each other ... are pairs too": on one line those are a pair already, and across lines they are no pair, 00-shared row 4.)

**N19. Finding, line 68.** Old: "...serving others' public records; a reader can check that it left nothing out against public headers, `seq` gaps and heads." New: "...serving others' public records. An index's answer to a find is its own selection: no reader can show it complete. A seller who holds an index's receipt tests his own listing by a pull on his own id (Left out)."

---

## 3. `protocol.json` edits

| Key | Change |
|---|---|
| `needs` | `every`: `["refs.under","refs.answers","refs.updates","refs.for"]`; `actor`, `promise`, `transfer`: `["refs.schema"]`; `grant`: `["refs.parent","state.counted_to","refs.schema","scope.on"]` (`scope.on` is stage 4's field; until it lands the reader finds none). `refs.author` and `refs.prev` leave. `about`: "The blocks a block names for its meaning: `read` reads them (core.md, section 8), and a block that names one not held, not valid or not read is not read. A block's pieces (its author's genesis, the block its `refs.key` names, and that one's pieces) are `valid`'s and are not listed here. No block waits for its `prev`." |
| `header` | unchanged `["author","seq","prev","hash"]` |
| `header_optional` | `["key","withheld","skip"]` |
| `limits` | delete `depth_read`; add `"signature_bytes": 8192` |
| `suites.future.pq.status` | its last words "a signature must still fit limits.block_bytes" become "... fit limits.signature_bytes" |
| `cbor.deterministic` | `"4.2.3"` |
| `refusals.about` | "Every refusal is { hash, code, detail }. block: why `valid` refuses a block's bytes, final for those bytes, bar `unmet` and `unknown_suite`, which wait. read: why `read` cannot read a valid block; never a refusal: the block is kept, not read. fold: why a fold counts a block for nothing, or gives no answer. message: why a node refuses a message. `valid` runs the checks in `checks` in order and stops at the first that finds anything." |
| `refusals.checks` | six rows: `["not_canonical"]`, `["float","integer_range","decimal","grammar","time","calendar","shape","type_name","unknown_suite"]`, `["size_limit","after_limit"]`, `["audience","bad_genesis","chain","at_missing"]`, `["unmet"]`, `["bad_hash","bad_signature","unknown_suite","bad_genesis"]` (today eight rows, the sixth still naming `not_own_rotation` and `recovery_scope`, which stage 1 took out of `refusals.codes.block`: until this row lands the file names two codes it lacks) |
| `refusals.read` (new) | `["names_missing","names_unread","required","undeclared_ref","undeclared_field","status_not_answer","bad_status","deal_not_named","lines","wider_than_parent","not_receiver","bad_roles"]` |
| `refusals.codes.block.not_canonical` | "bytes that are not exactly the canonical bytes of a value that follows strict writing: any spelling but the one, a null, a number that is not a whole number in range, text that is not well-formed, a set out of order or with a repeat, or not exactly type, state and refs" |
| `...float` | "a number with a fraction or exponent in a value that never was text (CBOR, or a value handed to a writer)" |
| `...integer_range` | "a whole number outside integers.min..integers.max, or -0, in a value that never was text" |
| `...size_limit` | "its bytes are over limits.block_bytes (a sealed copy's block, once opened), or open more than limits.depth levels" |
| `...chain` | "a block that is not a genesis lacks refs.author, refs.prev or state.seq" |
| `...unmet` | "a piece is not held as valid (its author's genesis, the block its refs.key names, and that block's pieces): not a refusal but a wait" |
| `...names_missing` (new) | "read's own code: a block it names for its meaning (needs) is not held; listed with the id of each such block. The cure is to fetch it. The block is kept, not read" |
| `...names_unread` (new) | "read's own code: a block it names for its meaning (needs) is held and not valid or not read; listed with the id of each such block. Fetching does not cure it. The block is kept, not read" |
| `...bad_signature` | "the key its pieces name does not open its signature over its header (a genesis: over its own bytes), or the block its refs.key names is not a key grant of its author about its author" |
| `...unknown_suite` | add: "not a refusal but a wait: judged again when the reader knows the suite" |
| `refusals.codes.fold.equivocation` | renamed `pair` (00-shared row 41): "one of a pair that name one prev or state one seq, or a later block of that key (a draw of a fork takes nothing: folds.md, What is left): ..." (rest unchanged). Every fold answer that gave the code `equivocation` gives `pair`; field names `equivocations` stay |
| `refusals.codes.fold.not_shown` (new) | "the line the question reads is not read whole from the block back to its start: no answer is given, and lacks lists what it would need" |
| `refusals.codes.message.not_canonical` (new) | "the message's bytes are not exactly the canonical bytes of the value they parse to" |
| `messages.public_block_about` | "A message is canonical JSON, whole, and exactly { block, signature }: any other key refuses it (shape). No suite and no version travel beside a block." |
| `messages.pull`, `signed_pull` | add `"log"`, `"seen"` |
| `messages.pull_answer` | `["node","request","log","blocks","next","signature"]` |
| `messages.push_answer` | `["node","receipt","taken","held","unjudged","refused","unread","equivocations","signature"]` (was `["node","taken","waiting","refused","equivocations","held","at","signature"]`); `push_answer_optional`: `["receipt","held"]` |
| `messages.push_answer_order` | "taken and refused: ascending by hash, a block's codes in the order of refusals.codes.block. unjudged and unread: ascending by hash, each needs ascending, each codes in list order. equivocations: each pair sorted, the list sorted. held: ascending by hash." |
| `messages.unread_entry` (new) | `["hash","codes"]` |
| `messages.lacks_entry` (new) | `["author","key","seq"]` |
| `messages.signature_about` | "A key signs four shapes, each canonical JSON: a block's header (header, header_optional), a genesis's own bytes, a request without its signature key, an answer without its signature key. A header has hash; a genesis has type; a request has signer and node; an answer has node and neither signer nor hash. A pull answer's request is the bare SHA-256 hex of the canonical JSON of the whole signed request. header_signature is the block's one signature. An envelope plaintext is the canonical JSON of the plaintext object." |
| `messages.discovery` | `["protocol","version","node","speaks_for","admission","endpoints","log","signature"]` (`holds` out) |
| `messages.admission_about` (new) | "per_stranger and strangers_per_day count asks: blocks that name one of the node's people in a ref, never a block's pieces" |
| `folds.chain.equivocations` | "pairs of hashes naming one prev or stating one seq, each pair sorted" |
| `kind_fields.observe.dropped` (new) | `[]`, with the note in `kind_fields.about`: "dropped: refs.derives_from the blocks or receipts a node no longer holds, on the log that took them in (nodes.md, The arrival log)" |

## 4. Door ops

| Op | Change | Args | Result |
|---|---|---|---|
| `valid` | changed | `block: full_block or { header, header_signature }`, `held` | codes of checks 1 to 6 (core.md, section 8); the third argument `schemas` goes |
| `read` | **added** | `full_block`, `held`, `schemas?` | every code `read` finds (`refusals.read` order); `[]` when read. Asked of a block that is not valid: an argument error |
| `refusals` | **removed** | | its two halves are `valid` and `read` (1.7's `check`) |
| `needs` | changed | `full_block`, `held?` | the ids it names for its meaning (`protocol.json` `needs`), ascending; with `held`, those not held. Never its author or `prev` |
| `header` | changed | `full_block` | `{ author, seq, prev, hash }` with `key`, `withheld`, `skip` when present |
| `sign` | changed | `block`, `private_key`, `suite?` | signature over the block's header as canonical JSON; a genesis: over its own bytes |
| `verify` | changed | `block`, `signature`, `public_key` | true when it opens over the header (a genesis: its own bytes), a passkey's included. The body form no longer opens |
| `id_of` | changed | `full_block`, `held?` | the hash in the suite of the key its pieces name. It needs no held block: without `held`, a genesis's own suite, else the hash name of `refs.key`, else of `refs.author` (a reader's guess; `valid` never uses it) |
| `strict_text` | changed | `text` | `not_canonical` when the bytes are not the canonical bytes of a strict value; else the first of checks 2, 3, 4. Check 8 is no longer asked |
| `strict_push` | changed | `text` | `not_canonical` (a message code) when the push is not canonical whole; else each message as `strict_text` |
| `passkey_challenge` | changed | `full_block` | `base64url(SHA-256(header bytes))`; a genesis's own bytes |
| `accept` | changed | `incoming: [full_block or sealed message]`, `held`, `choices: { takes_pairs }`, `schemas?` | `{ taken, unjudged, refused, unread: [{ hash, codes }], equivocations, false_headers }`, nodes.md, Push |
| `accept_sealed` | **removed** | | `accept` takes sealed messages |
| `fork_pairs` | changed | `held` | pairs on one `prev` or one `seq`, from bodies or headers |
| `check_chain` | changed | as now | `equivocations` by `prev` or `seq` |
| `read_whole` | **added** | `block`, `start: id`, `held` | `{ whole, lacks }` (folds.md, A line). A start not on the block's line is an argument error |
| `answer_pull` | changed | `log: [{ n, block, header?, header_signature?, copies? }]`, `request` (with `log?`, `seen?`), `node`, `private_key or null`, `choices`, `asker`, `held`, `suite?`, `through?` | `{ node, request, log, blocks, next, signature }` |
| `push_answer` | changed | `parts: { receipt?, held?, unjudged, refused, unread, equivocations }`, `node`, `private_key`, `suite?` | the signed answer of nodes.md, Messages |
| `pull_request` | changed | adds `log?`, `seen?` | |
| `log_shown` | **added** | `receipts: [sealed or full receipt]`, `request`, `answer`, `held` | `{ left_out: [id], stopped_short: boolean }` (nodes.md, The arrival log). Two logs is `fork_pairs` |
| `admission_refusals` | changed | 5th argument `asks_today` | counts asks, not blocks |
| `schemas_from` | text only | | "the `schemas` that `read` and `accept` read" |

---

## 5. What changes for existing blocks and vectors

**Ids.** A block signed by its author's genesis key keeps its bytes and id. A block signed by any other key gains `refs.key` in stage 1, so its id changes, and so does every block that names it, down each line. 01-keys.md, section 6, gave steps 1 to 3 of the tool below to stage 1; stage 1 left no `tools/resign-vectors.cjs`, so this stage writes the tool whole and runs all six steps (steps 1 to 3 change nothing where stage 1's makers already wrote `refs.key`).

**Signatures.** Genesis signatures (2,839 in `vectors.json`) are unchanged: a genesis is still signed over its own bytes. Every non-genesis public block (7,575, 4 of them passkeys) is re-signed over its header. The 23 private blocks are already signed over their headers; they are re-signed only where `key` or an id changed. The 21 passkey signatures are re-made with the 91-byte frame.

**How the vectors are re-made.** The generator named in `vectors.json` `$comment` (`make-vectors.cjs`) is not in the tree, so most of the 3,183 `door` cases cannot be regenerated by script. The builder writes one tool, `tools/resign-vectors.cjs`, and runs its six steps here.
1. Build the key table: `keys` (262 seeds), plus `sha256("foodblock 1.7 vectors: " + name)` for every name the kit makes. Stop and list any public key with no private key.
2. Walk every signed block in the file (story blocks, case arguments, `held` lists, messages, sealed headers), each case's blocks in causal order. A block signed by a key other than its author's genesis key gains `refs.key`, the key grant among that case's blocks that brought the key in; recompute its id; record old to new.
3. Replace every old id by its new id across the whole file, to a fixed point (a changed id changes the `prev` after it).
4. Re-sign every non-genesis block over its header. Leave genesis signatures alone.
5. `valid` cases: drop the third argument. A `valid` case whose expected codes are check 8 codes becomes a `read` case with the same codes. `accept_sealed` cases become `accept` cases with sealed messages as `incoming`.
6. Run every case on the new core. Accept the new answer without review only where it equals the old one after the id map and after re-sorting lists the spec sorts by hash. Print every other case for review against the lists below.

**The generators.** `vectors-kit.cjs`: `say` already writes through `fb.write`, which must add `refs.key` when the key is not the author's genesis key (it finds the key grant in `held`) and sign the header; nothing else changes there. `raw` builds blocks by hand: give it `refs.key` from a new helper `kit.keyGrantOf(who, key)` and keep `fb.sign`, which now signs the header. `check(...)` builds bare blocks with `prev` the author: unchanged. In `make-vectors-will.cjs` (3 `fb.sign` calls), `make-vectors-account.cjs` (1) and `make-vectors-backed.cjs` (1), every hand-signed block signed by a key a key grant brought in needs `refs.key`. Every maker re-run after the tool, so its cases replace the re-signed ones by name.

**Answers that change, and are meant to.** Of batch 3's 29 (b3/14, 4.2), this stage intends 28:
- K1 (6): `valid` `[chain]` becomes `[]`; the two `accept_sealed` `chain` cases become `accept` cases that take the block. `check_chain` reports `broken`.
- K2 (4): a block whose `prev` is not held is taken. The one that differed only in the order of `taken` is now ascending by hash.
- K3 (8): the four `valid` cases `[unmet]` become `[]` with `read` giving `[names_missing]`; the four `accept` cases that listed the block in `unjudged` become `taken`, `unread: [{ hash, codes: ["names_missing"] }]`.
- K4 (3): `undeclared_field` and `wider_than_parent` move from `valid` to `read`.
- K6 (3): two `promise_stage` cases go from null to `offered`; "with no schema store both first blocks ... are no pair" now lists the pair (the vector's reasoning dies with the old rule; rename it "after:").
- K7 (2): `needs` loses the author's genesis and the `prev`.
- K8 (2): two `exact` push answers gain `unread: []`.
- **K5 (1) keeps its answer:** the note at `seq` 1 carries no `refs.key`, so only the genesis key is tried, and it is `bad_signature` as now.

Further changes this stage makes: every `refusals` case becomes a `read` case (or a `valid` case for codes of checks 1 to 4); multi-block `accept` cases whose `taken` was in round order are re-sorted; a message with a `suite` key is `shape` (was `bad_hash`); `strict_text` cases with a float, an exponent, an out-of-range or 310-digit number give `not_canonical`; the NFC rows of `canonical-vectors.json` and about 8 of the 16 `strict_text` cases flip to taken; the `signatures` (12), `bad_signatures` (2), `headers` (3) and `sealed` sections are re-made. The `needs` list now holds `refs.for`, `refs.answers` and `refs.updates` on every type: any case that held a block without the block it is `for` gives `unread` where it gave a fold answer. None was found by reading; the run in step 6 lists them.

**What must not change.** Every fold answer on a whole set: identity (58), ownership (166), `backed` (49), `under_ok` (94), `signed_by_author` (45), circles, consent, successor, ballots, and 595 of 597 `promise_stage`. A block's id when it has no `refs.key`.

**New vectors**, each a one-line story and its answer:
1. *No `prev` held.* Maria's block 3, only her genesis held: `valid` `[]`; `check_chain` `gaps: [1, 2]`.
2. *A not-read block and the next.* Block 41 has `state.sparkle`; block 42 a plain thing: `valid` `[]` for both; `read(41)` `[undeclared_field]`; `read(42)` `[]`; `accept` takes both, `unread: [41]`.
3. *A block before its key grant.* Her tablet's first block, its key grant not held: `valid` `[unmet: key grant]`; with it held: `[]`.
4. *A forged key grant.* A key grant signed by the key it brings in, naming no `refs.key`: `bad_signature`; a block naming it: `bad_piece` (section 9).
5. *A not-read key grant.* Her key grant carries a field Sam's lists lack; the block its key signs: `valid` `[]`; `signed_by_author` false.
6. *Pair by `seq`.* Two blocks of Maria's key at `seq` 7, one naming her real block 6, one a made-up id: `fork_pairs` lists them; with nothing else held, so does `accept`.
7. *Pair of two headers alone.* Two sealed header messages of one key on one `prev`: `fork_pairs` lists them.
8. *A line with a hole.* Blocks 1, 2, 4 held, 3 not: `read_whole(4, 1)` `{ whole: false, lacks: [3's id] }` (block 4's `prev` names it); blocks 1, 2, 5 held, 3 and 4 not: `read_whole(5, 1)` `{ whole: false, lacks: [4's id, { author, key: null, seq: 3 }] }`; with all held: `{ whole: true, lacks: [] }`.
9. *A line through a header.* Block 3 held as its sealed header: `read_whole(4, 1)` `whole: false`, `lacks: [3's id]`.
10. *A line across a key replacement.* New key's block 2, its key grant signed by the old key, old key's blocks 1 to 5: `read_whole(new 2, old 1)` whole.
11. *A held header in `valid`.* `{ header, header_signature }` with its pieces held: `[]`; with `key` changed in the header: `bad_signature`.
12. *A stranger's first signed push.* Harry's signed push carrying his genesis and one ask, Maria's node holding nothing of his: the request is checked against the pieces it carries; the ask is taken.
13. *`per_stranger` counts asks.* Harry, 60 earlier blocks pushed as pieces, then one ask; `per_stranger` 20: taken.
14. *Left out.* Receipt 812 names Harry's accept; an answer `since: 811, next: 813` without it: `left_out: [accept]`. With `dropped` 813 naming it: `[]`.
15. *Stopped short.* Request `since: 1, seen: receipt 3`; answer `next: 1`: `stopped_short: true`.
16. *Two logs.* Two receipts of one door key at `seq` 812: `fork_pairs` lists them.
17. *Export whole.* `export_whole(her export, the log, the last block of it she holds)`: `{ whole: true, lacks: [] }`; the same with one receipt's block removed: `{ whole: false, lacks: [its id] }`.
18. *A message key out of order.* `{"signature":...,"block":...}`: `not_canonical` (message).
19. The 84 block cases and 6 message cases of `b2/18-scratch/vectors-wire.json`, as they stand there.
20. The 4 cases of `vectors-signed-shape.json`, with the genesis pair flipped by shared choice 28: a genesis over its own bytes `[]`; a genesis over `{ hash }` `[bad_genesis]`; a public block over its header `[]`; over its own bytes `[bad_signature]`.
21. The 16 cases of `vectors-passkey.json`, as they stand (the challenge is of the header; the frame; 8,192 taken, 8,193 not).
22. The ten Ed25519 cases of `vectors-ed25519.json` (batch 1's six and four more): `verify` true, false (S + L), false (R of order 8), false (mixed-order key, k not 0 mod 8), true (k = 0 mod 8); `valid` of a genesis key of order 4, of order 8, not on the curve, written as y + p: `[unknown_suite]`; of mixed order: `[]`.
23. The three code points that split Unicode 16 from 17 (`nfc-split.json`): taken, one id each.

Also add to `spec/run-vectors.cjs` a section "read in stories" beside "valid in stories": every block of every story is read against its story (b3/14 F5).

---

## 6. Build notes

**The oracle, `spec/oracle/fb.cjs`.** b3/14's `apply.cjs` is the map; take it with these differences: no `authorKeys`, no retry in a push, no switches, no counters (`FORMS`, `SEQ_EQUAL`), pairs by `seq` always. In this order:
1. **Bytes.** `strictText` and the push reader: parse, write canonical, compare bytes; one code `not_canonical`. Delete the NFC checks, the float path for text, `depth_read`.
2. **Signing.** `headerBytes` gains `key`; `verifyBlock` opens a header only (a genesis its own bytes); `sign` signs the header. Passkey verify: 91-byte prefix, the cap, no JSON.
3. **Pieces.** `piecesLacking(b, m)`: the genesis, then `refs.key` and that block's pieces. The key is found by stage 1's one function (01-keys.md, section 7, oracle step 2); check 6 calls it and adds the subject test. Delete `seqFits`, `closeMap`, and the search through needs for a key.
4. **`validStages`.** Checks 1 to 6; `valid` of a header message. Delete check 7 and the schema argument.
5. **`read`, `readFindings`.** Check 8, `names_missing` for a named block not held, `names_unread` for one held and not valid or not read. Delete the `refusals` op.
6. **The pool.** `dropIllFormed` keeps a valid, not-read block as its header (`asHeader`, with `key`), to a fixed point. `needsOf` from `protocol.json` `needs`.
7. **Pairs.** Group by `prev` and by `seq`, in the fork fold and in `pairsAt`; the taint at or above the lower `seq`.
8. **`readWhole(b, start, pool)`**, with key-replacement continuation and `lacks`.
9. **`accept`.** No rounds: judge each against held plus push; `taken` ascending; `unread`; sealed messages in; delete `accept_sealed`.
10. **The node ops.** `answerPull` with `log` and `seen`; `pushAnswer` with `receipt`; `logShown`; admission counting asks.
11. **The door table** (`tools/door`, `sdk/door.table`): the ops of section 4.

**The Rust core, `sdk/rust/src/`.** Same order:
1. `canonical.rs` (`parse_strict`, `push_block_spans` become parse, write, compare; delete `nfc`; delete `js_number` and `canonical_any_type` if nothing else calls them), `check/strict.rs` (`strict_findings`), `cbor.rs` (NFC out, header map `key`, map key order 4.2.3); `Cargo.toml` drops `unicode-normalization`.
2. `sign.rs`: `header_bytes` with `key`, `signed_bytes`, `sign_in`, `verify_in` (header only; genesis own bytes), `passkey_message` (frame, cap).
3. `identity.rs` (`signer_in`, `brought_key` and `signer_step` are stage 1's, by `refs.key`): `chain_slot`; `pairs_of` and `fork_pairs_in` by `prev` or `seq`; the fork taint by `seq`.
4. `valid.rs`: `valid` (checks 1 to 6), `bytes_findings`, `rested_keys` becomes the pieces walk, `signature_refusals`; a new `read`. `check/mod.rs`: `ordered` for the `read` group.
5. `js.rs` `closed_ref`, `closed` and `fold/mod.rs` `read_all`: keep a not-read block as its header, drop only the not valid.
6. A new `read_whole` beside `chain.rs`; `chain.rs` `check_chain` pairs by `seq`.
7. `sync.rs`: `accept` and `take_in` without rounds; `accept_sealed`, `judge_header` folded in; `header_entry` with `key`; `push_answer`, `answer_pull`, `pull_request`; `log_shown`. `strangers.rs`: count asks.
8. `door.rs`, `spec.rs`: the ops and keys (`write.rs` adds `refs.key` in stage 1).

**Identical before and after**, checked at each step on both builds: every case in the "must not change" list of section 5; `test/audit/run.cjs` (core and oracle identical on every audited world and story); every id of a block with no `refs.key`. After step 9, the oracle and the core must agree on all of section 5's new vectors. `host/`, `mcp/` and `cli/` ask the SDK and follow it (`accept_sealed` and `check` callers move to `accept` and `read`; `fb check` becomes `fb read`); not this stage's text.

---

## 7. What this stage leaves, and what it needs

**From stage 1, built:** `refs.key` (core.md section 5, `refs_single`); the key grant's shape and the keys it brings in, so check 6 can test "a key grant about its author" (00-shared, `refs.key`); the receipt, cutoff and named clock in `blocks.md`, which the door log is built on; `state.counted_to` on a key grant that replaces a key, which A line's continuation reads. The recovery key's last traces in the files this stage owns (core.md Which suite and check 6, invariant 3, encoding.md Bytes and Passkeys, nodes.md lines 8, 19 and 64, folds.md `signed_by_author`) leave here: C4, C9, C10, E10, E11, N3, N9, N18, F6. `blocks.md` already points to folds.md, A line, which F2 writes under that exact heading.

**Leaves to stages 3 to 6:** every fold's start and what it does with `not_shown` and `unread`; the fork rule's burden (`folds.md`, the rest of A fork is a burden); what a not-read end does to a grant (stage 4); `owed.forked` wording (stage 3).

**Leaves to stage 7:** who learns what (privacy.md beyond The public header: who is sent a sealed block, three grains); `message_bytes` (the largest honest sealed block is privacy's to size); the ways past a full door (her open offer, a vouch that names the sender, earnest; b3/10 F5); an index's signed fold answer (`reads`, `lacks`); renaming "A node's promise" to "A node's word"; `keep` and `move` in consent.md; `version` in discovery (the rule set by hash); the identity.md sentence that a passkey tap is not her yes (b2/18 3.5).

**Leaves open:** the post-quantum road beyond the cap (b2/18 3.7: the envelope's shape, `recovery_suite`, a broken suite's cut); the freshest tail of a door log (b2/17 A3); real passkeys from six clients against the 91-byte frame (b2/18 A4), which must be tried before the lock.

---

## 8. Asks of the shared ground

Asks settled in 00-shared.md on 2026-11-11.

---

## 9. Settled in the third step (2026-11-11): where the two builds differed, the words now say

Two builders worked from sections 2 to 4 apart: the Rust core and the oracle. Every place they read the text two ways, or both guessed where it was silent, is settled below, in the spec itself; both engines follow it, and `node test/audit/run.cjs` asks both every question of the Rust builder's worlds (`test/audit/k2-store.cjs`) and of the oracle builder's stories (`test/audit/k2-stories/`). The choices another stage could trip on are rows 93 to 106 of `00-shared.md`, section 4. Sections 2 to 5 above read with these changes:

- **core.md, section 8:** `valid` runs checks 1 to 6 and `read` runs check 7 (the stray "8." is 7; there is no gap). Check 2 reads a key grant's list as a value (`voices` and `public_key_sign` never both, `keepers` only with `voices`, `keepers` with any `reach` or `wait` above zero; `shape`), as row 32 had it. Check 5: a piece not held, or held only as its header, is `unmet` (fetching cures it); one held that waits on a suite makes the block `unknown_suite`; one held and refused is **`bad_piece`**, naming it and its code, final. Check 6 points to it. A value with a `header` key is a header message, exactly `{ header, header_signature }` (else `shape`). `read` runs check 7 alone, with the schema store of `held` when no `schemas` is given, gives its codes in the order of `refusals.read`, which lists every code it can give; the ids `names_missing` names are what `needs(block, held)` gives (a refusal carries no `ids` key). A schema named and not held leaves the fields it might declare unjudged.
- **folds.md, A line:** read whole counts both ends; the line is what `prev` joins, so a `seq` that jumps with no `skip` is no hole. `lacks`: the id where a held block's `prev` names it, or where it is held only as its header or not read; past a block not held, `{ author, key, seq }` for each `seq` down to the next block of that key held, or to the start, the walk going on from there (none under a `skip`). A block not valid is not held. A start the walk never meets, with nothing lacking, is not on the line.
- **nodes.md:** a pull answer has `log` only when the request names one; a block with no receipt on that log has no arrival number there and is not served under it. **Left out** and **Stopped short** read only an answer signed by a key that speaks for its node and naming the request's hash, and only receipts that are valid bodies on the log; a block matches the filter whole when public or the asker's, else by its header, and one not held only a request with no filter; a `dropped` drops a block by naming it or its receipt, never one the door's person signed or answered. Push: a block that waits only on a suite needs `[]`; a body held, and a header that describes it, are nothing new. Admission: an ask names one of the node's people in a ref other than `refs.author`; a block that is no ask is never refused by the count. Her record: the log runs from its first block to a block of it she holds; a block a receipt names is excused only by a `dropped` naming it or its receipt; the fourth clause reads each block's line back to where it begins (stricter than a fold's start, which stages 3 to 6 name), and she checks it all with the door op `export_whole`.
- **privacy.md, The public header:** a header that describes the body held under its hash is nothing new.
- **encoding.md, Limits:** a reader reads nothing nested deeper than `limits.read_depth` (64): what carries a block and the chain of places a thing is in.
- **protocol.json:** `limits.read_depth` 64; `refusals.codes.block.bad_piece` (after `unmet`), check 5's row `["unmet","bad_piece","unknown_suite"]`, `unmet`'s and `unknown_suite`'s texts; `refusals.read` gains `decimal`, `grammar`, `time`, `calendar`, `shape`; `refusals.about` names checks 1 to 6 and 7; `messages.pull_answer_optional` `["log"]` with `pull_answer_about`; `door.conventions.text` (a string holding a lone surrogate is an argument error); door ops: `strict_push` refuses a push that is not canonical whole as a list of one refusal; `read` (check 7, its store, a header is an argument error); `read_whole` (its walk); `log_shown` (receipts as whole blocks; what it reads); **`export_whole(document, log, last)`** added, `{ whole, lacks }`; `accept` (nothing new; `needs: []` for a suite); `answer_pull` (an entry with no `n` of at least 1 is never served; `log?`); `push_answer`'s parts name `taken`.
- **Section 5's vectors 4, 8 and 17** are corrected in place above.

The engines also follow text that was already plain: a fold asked about a block that is not read gives no answer (the core's `pot` answered one); `log_shown` checks the answer's signature (the oracle did not); `strict_push` and `strict_text` refusals carry `hash`.

Left open, each marked `GUESS` in the oracle: who counts toward a pair when held as a header (`[S2-14]`); a key grant that shows its own key, held as a header (`[S2-13]`); "two continuations of one line are a pair" (`[S2-18]`), which row 91 has since narrowed for stage 6 to write.

