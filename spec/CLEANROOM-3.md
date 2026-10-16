# Clean room 3: FoodBlock 1.6, built from the text alone

Builder read only: core.md, canonical.md, protocol.md, transport.md, protocol.json, modules/*.md, profiles/*.md (not epcis), and vectors.json / fuzz-vectors.json (inputs and expected outputs). No oracle, sdk, server, mcp, cli, tools, or earlier clean-room work.

Build: `/private/tmp/claude-501/-Users-patrickreynolds/6b02b558-959e-4b40-a1a3-ad15802665cf/scratchpad/cleanroom3/` (Python, `cryptography` for Ed25519, P-256 verify, AES-GCM, X25519, HKDF-SHA256; pure Python for RFC 6979 ECDSA, SM2, SM4-GCM glue). Run `python3 conformance.py`.

## Result

**813 / 814** items pass (every vector section, plus all 15 fuzz vectors).
Not counted: 2 `convert` door cases (marked `oracle: false`, they need legacy/converter.md, which this run could not read).

| Section | Pass |
|---|---|
| keys (seed to public key, 261) | 261/261 |
| canonical, hashes, ledger, signatures, bad_signatures, commitments | 40/40 |
| envelopes, sealed (blocks, cases), headers | 23/23 |
| identities | 15/15 |
| deals, folds.promises, circles, folds.circles, audience, things, successors, rekeys, ballots | 59/59 |
| messages | 8/8 |
| cbor (cases, push, loose, refused) | 31/31 |
| cbor.headers | 0/1 (spec bug 10) |
| refusals (check 90, valid 10, accept 5, fold 4, under 4, may_act_as 1, open 1) | 115/115 |
| door (253 ops: valid 26, verify 44, accept 13, accept_sealed 12, consent 20, ...) | 251/251 (2 convert excluded) |
| fuzz | 15/15 |

**Honesty note.** The result looks better than the text deserves. In every place below marked **[vector]** the text was silent or ambiguous and I fixed my build by reading the expected output. A stranger who has no vectors would have guessed differently. Where the text was clear and my build was wrong (SM2 nonce, `_pub` import slips, circle crossing rule order, the ask/offer stage, header-for-held-body), I fixed my build and do not list it.

## Spec bugs (38)

Each: where, the sentence, what goes wrong, proposed exact fix.

### Signatures, keys, bytes

1. **Deterministic signing is not stated [vector].** core.md section 2 (table) says only "ECDSA P-256 with SHA-256" and "SM2 with SM3". The `sign` door vectors expect exact bytes, so the nonce rule matters. They match RFC 6979 (HMAC-SHA-256 over SHA-256(M)) for p256 and, for sm, RFC 6979 with HMAC-SM3 where `h1` is the 32-byte SM2 digest `e`. Fix, add to core.md section 2: "A signer derives the ECDSA nonce by RFC 6979 (HMAC-SHA-256, `h1` = SHA-256(M)). An SM2 signer derives it by RFC 6979 with HMAC-SM3, `h1` = the 32-byte SM2 digest e = SM3(ZA || M). Verifiers accept any valid nonce. Ed25519 is deterministic (RFC 8032)."
2. **Seed to key not stated [vector].** vectors.json `keys` give `seed`; nothing says p256/sm private scalar = the 32 seed bytes big-endian, std private = the Ed25519 seed. Fix: in vectors.json `$comment`: "For p256 and sm the seed is the private scalar d (big-endian); for std it is the RFC 8032 seed."
3. **SM2/SM3/SM4 references missing.** core.md: "SM2 with SM3, user id `1234567812345678`". Not stated: ZA = SM3(ENTLA || ID || a || b || xG || yG || xA || yA), r,s order, HKDF-SM3 = HMAC-SM3, SM4-GCM with 12-byte nonce. Fix: add "SM2 per GM/T 0003.2-2012 (ZA as in GM/T 0009), SM3 per GM/T 0004, SM4 per GM/T 0002, HKDF-SM3 is RFC 5869 with HMAC-SM3, SM4-GCM is NIST SP 800-38D over SM4."
4. **`header_signature` covers unspecified bytes [vector].** privacy.md: "`header_signature` is by the key that signed the block". Which bytes? It is the signature over JCS of the header object (`{author,seq,prev,hash[,withheld][,skip]}`). Fix: "`header_signature` is the signature, by the block's signing key, over the canonical JSON (RFC 8785) of `header`."
5. **Envelope plaintext serialisation unspecified.** privacy.md: "The plaintext is encrypted with AES-256-GCM". Serialisation of `{version, block, signature, reveals}` is not named. Fix: "The plaintext is the canonical JSON (RFC 8785) of that object, UTF-8."
6. **Signed answers: signed bytes and the `request` hash [vector].** nodes.md: "In a pull answer, `request` is the hash of the canonical signed request" and "A node signs every answer". It does not say the answer signature covers JCS of the answer without `signature`, and "signed request" could mean with or without `signature`. Vectors: with `signature`. Fix: "A node's answer signature covers the canonical JSON of the answer without `signature`. `request` is SHA-256 hex of the canonical JSON of the whole signed request, `signature` included."
7. **Receipt code of a prefixed id [vector].** short-form.md: "Take the first 5 bytes (40 bits) of the block's id". For `sm3:`-prefixed ids the bytes are those of the hash after the colon. Fix: "(the digest bytes; a hash name prefix is not part of them)".
8. **Which hash names are known.** core.md check 2: "`unknown_suite` for a hash name in refs that the reader does not know". protocol.json `hashes` lists `sha3-256`, but `suites` has no suite using it (`future`). Is `sha3-256:<hex>` known? I treated it as known. Fix: state "Known hash names are `sm3` (and bare SHA-256). `sha3-256:` is unknown until its suite is fixed."

### valid(), refusals

9. **Genesis is not recognisable by the stated definition [vector].** core.md section 4: "A genesis is the one block with no author. It is an `actor` with no `author`, `prev`, `after` or `seq`". Vectors: an actor with an `author` and a key is `bad_genesis` (not `chain`), and an actor with no author and no key is `bad_genesis` (fuzz). Fix: "A block is judged as a genesis when it is an `actor` with no `refs.prev` and either no `refs.author` or a `state.public_key_sign`. If it breaks this section it is `bad_genesis`."
10. **Genesis signature belongs to check 4, which "reads the bytes alone" [vector].** core.md section 8: "Checks 1 to 4 read the bytes alone". protocol.json `bad_genesis`: "or not signed by its own key". A passkey genesis with a wrong challenge expects `bad_genesis`, never `bad_signature`. Fix: "Check 4 also opens a genesis's signature with its own key (`bad_genesis` on failure); `bad_signature` is never reported for a genesis."
11. **Non-text `kind` has no code [vector].** Fuzz: genesis with `kind` an object expects `bad_genesis`. A non-genesis actor with such a kind is `required`. core.md names neither. Fix: section 7: "`state.kind`, a label (text, non-empty); otherwise `bad_genesis` on a genesis and `required` on any other closed block."
12. **Which refs hold sets.** canonical.md: "A string array directly under a `refs` key is a set". core.md: "A link is one id, or a set of ids". Fuzz expects `refs.author: [id]` to be `grammar`. Nothing says `author` and `prev` are single-valued. Fix: protocol.json: add `refs_single: ["author","prev"]` and core section 1: "`author` and `prev` hold exactly one id."
13. **`updates` with a stop has no required-field exemption [vector].** core.md section 7: "An answer ... is exempt from the other required fields". The author's own stop (`updates` + `status: stopped`) is not an answer, yet fuzz expects it not to be `required`. Fix: "An answer, and an author's own stop (a block with `refs.updates` and `state.status: stopped`), is exempt..."
14. **`deal_not_named` with no context [vector].** promises.md defines it by the first promise. Vector `an answer that does not name its deal in for`: the block has `answers` and no `for` and is judged with no held blocks. Fix: "An answer or counter with no `refs.for` is `deal_not_named` even when the deal's first promise is not held."
15. **`check` ("strict check") is undefined [vector].** protocol.md Conformance: "refusals (with the codes a strict check finds)". Vectors `by: check` run checks 1-4 and 8 without `unmet`, hash, signature, chain. Fix: define `check(block, held)` in core.md section 8 as "`valid` without checks 5, 6 and 7; `held` is read only by check 8".
16. **Profile fields vs `undeclared_field`.** core.md section 7: "A closed block with any other field is refused (`undeclared_field`)". protocol.md Optional profiles: "A node that has never heard of one still accepts every block in it." A successor grant (`witnesses`, `needed`, `wait`, `keys`) is a closed `grant` with fields not in `fields.grant`. Fix: protocol.json `fields`: either list profile fields as always declared (I did) or write "undeclared_field is not raised for fields a profile in `optional_profiles` declares".
17. **Shapes recognised by exact key set, not stated [vector].** encoding.md: "A value at a place is read as a shape by its own keys". Vectors: `weight: {value:"1"}` valid (not a shape), `weight: {value:1, unit:"kg"}` is `shape` (a non-bare field, still an amount), `price: {minor,currency,place}` is `shape` (bare). Fix: "A non-bare field holding an object with exactly the keys of a shape is checked as that shape; any other key set is data. A bare field must hold exactly one shape."
18. **The `when` window form is only in the tasks profile.** blocks.md: "Three forms: an instant; a range `{from,to}`; or `{after,wait}`". tasks.md: "`state.when` under a schema may add `not_before`, `not_after` and `takes`". protocol.json `shapes.when` has two. A vector (tasks) is valid. Fix: add `when_window: ["not_before","not_after","takes"]` (any subset, at least one) to protocol.json `shapes` and one sentence to blocks.md.
19. **Key grant requirements.** identity.md says "`refs.subject` the id, `state.public_key_sign` the new key"; vectors refuse a key grant with no key, and a `replaces` without `counted_to`, as `required`; the text never says refusal. Also unclear whether `refs.subject` is required. Fix: section 7: "`grant`, kind `key`: `refs.subject`, and at least one of `state.public_key_sign`, `state.public_key_encrypt`, or both `recovery_key_hash` and `recovery_reach`; with `replaces`, both `public_key_sign` and `counted_to`."
20. **`needs` omits grant dependencies.** protocol.json `needs.grant` is `parent` and `counted_to`; a member grant that `answers` an invitation or `updates` a grant, or acts `under` another, is not listed, yet circles.md says a stop "`counted_to` is a block the stop needs". Fold wholeness (folds.md) cannot be computed. Fix: `needs.grant: ["refs.parent","state.counted_to","refs.answers","refs.updates","refs.under"]`.

### Folds

21. **Cut after `counted_to` by chain position, not causality [vector].** identity.md: "`counted_to` is the last block of the old key's chain that still counts. The old key's blocks after it are void." Vector (recovery settles a pair): a sibling block with the same `prev` and the same `seq` as `counted_to` still counts. Fix: "A block of the old key is after `counted_to` when its `seq` is greater than that of `counted_to` (same key); a block of another branch with a `seq` at or below it is not after."
22. **`signed_by_author` mixes fold and view [vector].** identity.md: "The identity fold is pure: it voids every block after `counted_to`." The identities story "recovery reach is causal" expects `signed_by_author[6108…] = true` for such a block (protected by the reach, a view that needs arrivals). Fix: move that expectation to the `recovery_reach` view case, or state in protocol.json `folds.identity` that `signed_by_author` is true for blocks the reach protects when `arrivals` are supplied.
23. **Circle removal rule says N other, vectors count N total [vector].** circles.md: "N other holders of `remove` must agree (default 1)". Vectors: `removal: {needed: 2}` is met by the remover plus one more (two in all); one holder alone does not remove an admin. Fix: "at least N holders of `remove` (the remover included) must each stop that grant."
24. **Agreement and crossing details.** circles.md: "the remover whose grant is earlier in the circle's causal order (in the other's causal past) wins; the founder above all". Not said: agreement counts only stops of the same grant; "earlier" is judged by the removers' own member grants. I assumed both. Fix: add "agreeing stops name the same grant; the removers' own member grants are compared".
25. **Order of `taken` in a push [vector].** nodes.md "Rounds ... what is taken never depends on the order inside a push", but `taken` is a list. Vectors list a note (`at` earlier) before a grant in one round, and a grant before a promise across rounds. Fix: "`taken` is in round order; inside a round, sorted ascending by hash" (and the vectors regenerated), or "`taken` is a set; compare unordered".
26. **Fold refusals have no output field [vector].** protocol.json `refusals.codes.fold` lists `not_a_side`, `quote_only`, `not_counted`, `open_offer_counter`, `equivocation`, `not_live`, `no_role`; `folds.promise_stage.output` has no place for them. Fix: add `ignored: [{hash, code}]` to the `promise_stage` output, and `may_act_as` returns `{ok, code}`.
27. **Money in `price` and `lines`.** promises.md: "price is money, money per unit ..., or a share". Only per-unit total is defined. Vectors: a flat `{minor,currency}` price is the total (also per line). Fix: "A flat money price is the total for the whole promise (for a line, the total for that line, whatever its quantity)."
28. **When is a promise `done`? [vector].** folds.md item 2 covers goods "the quantity accepted". Not stated: a promise with `refs.what` and a price but no quantity (vector: stays `underway` after a counted full payment); a job with a price (needs work accepted and price paid); which currencies. Fix: "With no quantity, a counted transfer of `what` is needed; a job or time promise is done when accepted work covers `terms.quantity` (or exists, with none) and any price is paid."
29. **`where_now` of a place that has no place [vector].** folds.md: "If that place is a thing, the thing is wherever that place is, found the same way". The vectors return the place itself when it has none, and `[]` for a thing that was never moved and has no `refs.place`. Fix: "A place with no place of its own is itself the answer."
30. **A sale transfer (`money` and `what`).** things.md: "A payment names no thing". Vector: a transfer with `money`, `to_owner` and `what` moves ownership once accepted. Fix: things.md Transfers: "A transfer that names both a thing and money is a sale: it moves ownership like any transfer."

### API shapes of the vectors (spec silent)

31. **`door` ops are undefined [vector].** protocol.md Conformance: "A node conforms when it reproduces, exactly, the vectors". The positional arguments and result shapes are only in vectors.json. Reverse-engineered: `accept(incoming, held, _, _)`, `accept_sealed(incoming, held, _)`, `answer_pull(entries, request, node, _, cap, _, held, suite)`, `consent(person, sender, blocks, under)`, `admission_refusals(block, receiver, blocks, rule, count)`, `may_act_as(block, circle, blocks, role)`, `promise_view(P, blocks, {now})`, `successor_view(grant, blocks, now, arrivals)`, `key_timeline(id, blocks, arrivals)`. Fix: add `spec/door.md` with a table of ops: args (typed) and result.
32. **`consent` input lacks the grant [vector].** protocol.json `folds.consent.input`: "a person and a sender (or none), and the blocks held". Principal-following (strangers.md) needs the grant the sender acts under. Fix: "input: a person, a sender, optionally the grant hash the sender's block acts under, and the blocks held."
33. **`per_stranger` counting [vector].** nodes.md: "how many blocks a day from anyone else". Vectors: refuse when `count >= per_stranger`; absent means no limit. Fix: "`per_stranger` is the most blocks one stranger may send in a day; the (n+1)th is `not_admitted`; absent means no limit; listed `parties` are exempt."
34. **Region containment.** residency.md: "a list of ISO 3166-1 country codes, or `EU`, `EEA`" and "whose `holds_in` lies inside `stays_in`". Does `DE` lie inside `EU`? Vectors only test equal codes. Fix: "`holds_in` lies inside `stays_in` when every code in it appears in `stays_in`, or is a member of a listed region (`EU`, `EEA`); the membership lists are fixed in protocol.json".
35. **Successor wait anchor.** successor.md: "The trigger fires `wait` after the `needed`-th witness observe arrives. In that time any live key of the person ... stops it by a `defeats`". A `defeats` is read against which window? I used each defeated event's own arrival + `wait`; vectors do not separate the readings. Fix: "A `defeats` cancels an event if its arrival is no later than that event's arrival plus `wait`."
36. **Chain header ids in CBOR [vector].** encoding.md: "A chain header is a map `{ author, seq, prev, hash }`." protocol.json `cbor.bytes` lists only block paths. The vector writes the ids as 32-byte strings. Fix: add `header.author`, `header.prev`, `header.hash` to `cbor.bytes.hash`. (This is the one failing vector section: 0/1.)
37. **`check_chain` is per key; the op takes an identity.** folds.md `chain` is "the key's blocks"; the op is called with an id. Fix: "`chain(id)` folds all blocks authored by the id as one chain; multiple keys use one chain per signing key, reported as a list" (or add a `key` argument).
38. **Vector flag `oracle: false` is wrong for `reading_condition_holds`.** The tasks profile fully defines it (window from `now` less `over`, latest reading at or before the start, etc.); I passed both cases from the text alone. Fix: set `oracle: true` for those two.

(38 entries; 31 to 38 are API/vector-file issues rather than rules.)

## What the text got right (no vector needed)

JCS + strict writing; ids and all four hashing suites; Ed25519, P-256, SM2 verification; the whole passkey form (all 44 verify cases first run); commitments and the X25519/P-256/SM2 envelopes (open and fixed-randomness seal); equivocation, rounds and sealed-header acceptance; the promise stage order; consent and admission; CBOR table, bytes paths and the 20 refusals.

## Fixed (all 38), and the second run

The text now says every item below. Where the proposed fix and the code differed, the rule that decided: the text says what strangers must agree on, so I took the clearer rule and made text, Rust core, oracle and vectors agree. Behaviour changed in four places (marked **code**); everything else is text catching up with what the core and vectors already did.

| # | Fixed in | How |
|---|---|---|
| 1 | core.md s2 | RFC 6979 nonce for ECDSA (HMAC-SHA-256) and SM2 (HMAC-SM3, `h1` = e); Ed25519 per RFC 8032; no low-s; `r`,`s` formulas written out |
| 2 | core.md s2, vectors `$comment` | seed = RFC 8032 seed (std) or scalar d big-endian (p256, sm) |
| 3 | core.md s2 | GM/T references, ZA, SM3, SM4-GCM (12-byte nonce, 16-byte tag), HKDF-SM3 |
| 4 | privacy.md, protocol.json `signature_note` | `header_signature` signs the canonical JSON of `header` |
| 5 | privacy.md; **code**: envelope plaintext is now canonical JSON (was serde) | canonical JSON of `{version, block, signature, reveals}` |
| 6 | nodes.md, protocol.json | answer signature over the answer without `signature`; `request` = bare SHA-256 of the whole signed request |
| 7 | short-form.md, core.md | digest bytes, never the hash-name prefix |
| 8 | core.md s2, protocol.json `hashes_note` | known hash names: bare SHA-256 and `sm3`; `sha3-256` unknown |
| 9 | core.md s4 | recognised as a genesis: an actor with `public_key_sign` or with no `refs.author` (the core's rule; the proposed "no `prev`" test was not it) |
| 10 | core.md s4, s8 check 6 | form is check 4; the signature of a genesis opens with its own key in check 6, code `bad_genesis`, never `bad_signature`; "checks 1 to 4 read the bytes alone" now says no other block and no author key |
| 11 | core.md s7 | non-text or missing actor `kind`: `bad_genesis` on a genesis, `required` otherwise |
| 12 | core.md s1, protocol.json `refs_single`; **code** reads the list | `author` and `prev` hold one id |
| 13 | core.md s7 | an author's own stop is exempt like an answer |
| 14 | promises.md | an answer or counter with no `refs.for` is `deal_not_named` |
| 15 | core.md s8 | `check` defined: checks 1-4 and 8, all codes, `held` read only by check 8 |
| 16 | core.md s7 | profile fields in `optional_profiles` are always declared |
| 17 | encoding.md | exact key set means a shape; bare fields hold exactly one shape |
| 18 | blocks.md, tasks.md, protocol.json `shapes.when_window`; **code** reads the list | the window form is core |
| 19 | identity.md | key grant requires subject, a key or the recovery pair, `replaces` with `counted_to` |
| 20 | core.md s8 check 5, protocol.json `needs.grant`; **code** (list is read from the file) | grants also need `answers`, `updates`, `under`; needs are reported ascending |
| 21 | identity.md | cut by `seq` in the key's chain, not causality |
| 22 | identity.md, folds.md | `signed_by_author` is the pure fold without arrivals, the reach view with them |
| 23 | circles.md, protocol.json `circle.removal_rule` | **N is total** (remover included); default 1 means the remover alone. The vectors and core already counted this way; the text said "other" |
| 24 | circles.md | agreeing stops name the same grant; crossing compares the removers' own member grants |
| 25 | nodes.md, protocol.json `messages.push_answer_order`; **code** in Rust and oracle, new vector | `taken` is in round order, ascending by hash inside a round; `refused` and `waiting` likewise |
| 26 | folds.md | fold codes explain; the answer is the stage alone, `may_act_as` a boolean (no new output field) |
| 27 | promises.md | a flat money price is the total of the promise or line |
| 28 | folds.md | `done` with no quantity, jobs and time, other currencies |
| 29 | folds.md | a place with no place is itself; never-moved thing without place: empty |
| 30 | things.md | a transfer with `what` and `money` is a sale |
| 31 | protocol.json `door` (not a new file) | every op the vectors use: arguments, result, conventions |
| 32 | strangers.md, protocol.json | `consent` takes the grant hash the sender acts under |
| 33 | nodes.md | `per_stranger`: refuse when `taken_today >= per_stranger`; absent is no limit; `parties` exempt (it counts all strangers together, as the core does) |
| 34 | residency.md | **plain membership** of entries (`DE` is not inside `EU`); no region tables, none hardcoded |
| 35 | successor.md | the exact pass-by-pass reading of `defeats` (strictly before `fires`) |
| 36 | encoding.md, protocol.json `cbor.message.header_bytes` | header ids are 32-byte strings |
| 37 | folds.md | `chain(blocks of one key, brought_in)` |
| 38 | oracle gained `reading_condition_holds`; generator flag removed | both cases run in the oracle |

**Second run** (builder patched only where the new text differs: sorted needs, the extended grant needs, header ids as bytes): `python3 conformance.py` gives 812 of 812. Before the patch the only misses were exactly those three items, which is the proof that the text now carries them. Still read from the vectors by the builder, and not yet in the text: exact bytes of `keypair` for std (the PKCS#8 form of `private_key`, written in `door.conventions`), and the draw order of `seal`'s `fixed` values (written in `door.ops.seal`).

Checked after the change: Rust core, JavaScript, Python, Go, Swift, Kotlin (JDK 17: the Gradle toolchain pins 17 and refuses 21) all green; `diff.cjs` 120 worlds clean with `taken` compared in order; `fbfuzz` 130 s clean; oracle 779 of 779. The oracle still signs with a random nonce (it checks signatures by opening them); the builder, not the oracle, is the proof for the nonce rule.
