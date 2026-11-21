# FoodBlock 1.9: the one set (plan step 3)

Every text change to built stages 0 to 3 that changes an answer on bytes that do not change, or changes the bytes themselves. They land together, on both engines, with the vectors regenerated once (the landing rule, `00-shared.md` §1.4). Inside the set the layers come in this order, because each reads the one before: **3a bytes, 3b place and order, 3c holds, 3d keys and time, 3e amounts.**

How to read each change:
- **Reads:** the sentence as it will read, in its home spec file. Words are `00-shared.md`'s.
- **Replaces:** the passage it replaces, by the 1.8 stage text and its change id (`01-keys.md` §2.1, `02-store.md` C9, `03-amounts.md` F4 and so on), and the spec file it lands in.
- **Answers:** which door ops answer differently, and how. "Text only" means no built answer moves.
- **World:** the smallest story that a builder turns into one fixed world in `tools/fuzz/corpus/` and one vector. Blocks are numbered in the order signed; each line names its signer. The expected answer is stated so two builders get the same one.
- **From:** the plan part and rule (`02 R6`), the decision (`D7`), or the stress seat.

Three things never land apart (PLAN-1.9): 3c-6 (no reader's clock), 3c-5 (a dead condition frees) and 3c-3 (the receiver's door). Also: 3a-1 with 3a-13 (the `valid` cut with `state.rule_set`); 3b-4's "each takes where all fit" with 3b-5 (twins `for` one deal count once); 3d-10 with 3d-11 (her own word stands alone needs the join built).

Where a change rests on a tier-1 suggestion of part 10 §9 that the owner did not answer by name, it says **(tier-1 set)**: those were taken as a set (coordinator's ruling, 2026-11-16, on the owner's "the rest as a set"). **E1** to **E3** are the owner's answers of 2026-11-16.

## Byte names chosen for the builders (2026-11-16)

Where the decisions named a rule and no byte, the name below is chosen. Each uses a word the shared ground already has; none is a second word for a thing that has one.

| Rule | Byte | Where | Shape and meaning | Change |
|---|---|---|---|---|
| Her list names which voice receives (D7, E3) | `receives` | a voice in `state.voices` | `true` on one voice at most (`shape` otherwise): what comes to her starts on that voice's line. Left out: her first voice | 3b-8 |
| People she placed may reach above, and close (D8, E2) | `above` | a voice of other people (`{ names, needed, wait, above }`) | `true`: that voice may sign a key grant that fills a place above its own, or that leaves no voice. Left out: it may not | 3d-14 |
| What a key signs of hers passes (D11) | `passes` | any voice | `true`: a thing of hers this key signs over is the receiver's, toward every block that has not seen that voice's end. Left out: nothing passes she did not sign by hand | 3b-11 |
| The goods are in her hand (D4) | `terms.in_hand` | an order (a promise) | `true`: her word that the goods are in her hand; the order counts the block toward what moves to her | 3e-3 |
| A block out of its place | `out_of_place` | `protocol.json`, the draw reasons | the seventh reason a draw takes nothing | 3b-1 |
| A will's condition (D9) | `{ closed: <id> }` | a condition | holds once that id's list is closed | 3d-16 |
| The field once called `keepers` (D15) | `clocks` | everywhere `keepers` was | `{ names, needed }` | 3d-3 |
| A genesis's own list (T1-24) | `state.voices` | a genesis | the same field as a key grant's list | 3d-17 |
| The offer's stop term (owner decision 5, 2026-11-19) | `terms.stoppable` | an offer (a promise's terms) | `true`: the offer says ahead that the stop of the grant her tool accepted it under ends what of the deal has not come. Left out: her stop ends none of it | stage 4, G16 |
| A judge's ruling that ends the rest (owner decision 5) | `state.ends_rest` | an `observe` of kind `ruling`, `refs.subject` the offer | `true`: what of the deal has not come can no longer fall due; it counts only from a judge both sides named (a `referee` grant one side signs, the other accepts) | stage 4, G16 |
| The named readings the core does not run (R-C3, stage 5) | `named_readings` | `protocol.json`, a list | `settled`, `paid`, `reading`: a condition naming one, with no `state.rule_set`, is not read (`condition_holds` null) | stage 5, R-C3 |
| A draw a `gives` line holds (R-H1, stage 5) | `held` | a line of `gives` | `true` where the block is a draw that holds that instance from its signer's word (an offer to a named receiver other than himself, or a transfer, naming an instance); else `false` | stage 5, R-H1 |
| A voice's bounds (V1 to V5) | `each`, `limit`, `every` | a `key` or `key_hash` voice in `state.voices` | amounts, and a duration only with `limit`: the voice's line (00-shared, A line's bounds) | stage 4, A voice's bounds |
| The part a key under a voice is passed (V5) | `limit`, `each` | a key grant that adds one key under a capped voice | the part of the voice's `limit` it passes that key (a draw on the voice's line), and an `each` no higher | stage 4, A voice's bounds |
| A circle's parts and rows (stage 6, C1, C10) | `state.pack`, `state.rules` | a circle's founding block (`rules` also on a version) | `pack` whole parts, `unit` `part`; a row `{ parts, scope }` or `{ to, needed, scope }` (`shapes.row`); CBOR: `removal` replaced in place by `rules`, `parts` and `needed` added at the end | stage 6 |
| What a row names (stage 6, SILENT 11) | `scope.what` | a row's scope | one id or a list: a block's `refs.what` must be within it; a block naming the circle needs a row naming it | stage 6, C4 |
| The unissued parts a meter states (stage 6, C6) | `state.unissued` | the circle meter's `observe` of kind `receipt` naming the move in `refs.derives_from` | an amount in `part`; several held must agree | stage 6, C6 |
| A hand (stage 6, C15) | `refs.confirms` | any counted block | naming a move signed `as` a circle: a hand of its signer (or of the circle a confirm is signed `as`) | stage 6, C15 |
| A grant's own ending term (the owner's decision, 2026-11-19) | `scope.ends_on` | a grant's scope | `{ witness: <id>, said: <text> }`: the grant counts for nothing for every block that has in its causal past that host's counted witness saying exactly that, `for` the grant | stage 4 (04-grants, What building changed) |
| Whether a draft binds anyone (the owner's decision, 2026-11-19) | `binds` | `protocol.json`, a door op | true where the draft is an accept, or `gives` of the one whose word it is is not empty, or it is a circle's founding block that states `pack` (it puts every part in the founder's hand; the owner's decision, 2026-11-20) | stage 6 |

The values of `limits.push_bytes` and `limits.push_messages` (3a-8) are numbers, not names: 8 MiB (8388608 bytes) and 1024 messages (SILENT 12, chosen in building).

---

## 3a. Bytes (part 08; seats 29, 30, 32, 43)

### 3a-1. `valid` reads five things
- **Reads** (`core.md` §8, in place of its opening and checks 1 to 6): "`valid(bytes, held)` answers one question: which key said these bytes. It reads five things, in order, and stops at the first that finds anything. (1) **The size.** Bytes longer than `limits.block_bytes`, or opening more than `limits.depth` levels, are `size_limit`, and nothing else is read. (2) **The bytes** are the canonical bytes of a value that follows strict writing, exactly `{ type, state, refs }`: no fraction, and no whole number past 2^53 − 1 (`not_canonical`). (3) **The header** has the common five, each of `author`, `prev` and `key` one id in the id grammar, or is a genesis (`chain`); an id in a hash name this reader does not know waits (`unknown_suite`). (4) **Its pieces** are held and valid (`unmet`, `bad_piece`). (5) **The signature.** The id is the hash of the bytes in the suite of a key its pieces bring in (`bad_hash`), and that key opens the signature over the header that names the block by that id (`bad_signature`); the first that finds anything is given, never both. A genesis: a suite this reader does not know waits (`unknown_suite`); else its id is the hash of its bytes in its own suite (`bad_hash`); else its own key opens it over its own bytes (`bad_signature`). A place this reader cannot read brings in nothing and refuses nothing. `bad_signature` is given only when every place the pieces offer is one this reader can read. `size_limit`, `not_canonical`, `chain`, `bad_piece`, `bad_signature` and `bad_hash` are final for those bytes. `unmet` and `unknown_suite` wait. A reader refuses for good only what no later rule could make sayable."
- **Replaces:** `02-store.md` C9, checks 1 to 6 and the paragraph before them; `protocol.json` `refusals.checks` and `refusals.codes.block` (`decimal`, `grammar`, `time`, `calendar`, `shape`, `type_name`, `at_missing`, `audience`, `after_limit`, and `bad_genesis`'s value checks move to `refusals.read`; a float and a whole number past 2^53 − 1 are bytes that are not canonical, `not_canonical`, 3a-6). `limits.signature_bytes` stays, read before any decoding (`02-store.md` E1).
- **Answers:** `valid` gives one of eight codes where it gave about twenty-five; about 270 vectors move a code from `valid` to `read` (b2-07's count, not re-run). `read` adds every value code. Engine rows 2 and 3 of part 08's table end (forged block: `bad_hash` alone, never both; mutated block: `not_canonical` on both).
- **World:** (1) Harry's genesis H0. (2) Harry, block H1, `seq` 1, a thing L7 `pack` 1 sack, `at` written `2026-11-12T10:00:00.0000001Z` (seven fraction digits). Expect `valid(H1)` true; `read(H1)` `time`. Today both engines refuse it in `valid` (`time`).
- **From:** 08 V1 to V3; seat 29 §6; T1-18 (64 KB, 32 levels kept) (tier-1 set).

### 3a-2. A refused body is held as its header
- **Reads** (`core.md` §8, after "A block `read` cannot read is not read"): "A block whose body `read` refuses, and whose header its key opens, is held as its header. `valid` and `read` are answers about bytes; neither is a duty to keep, pass on or show anything."
- **Replaces:** `02-store.md` C9, the paragraph "A block `read` cannot read is **not read**: …" (adds two sentences; deletes "Whether a node keeps a not-read block's body is its own word", which the second sentence says whole).
- **Answers:** `chain` lists a pair where one twin's body has a bad value; `ownership` of the thing it could reach is `not_shown` (3b-6), never the other twin's receiver.
- **World:** (1) Harry H0. (2) Harry H1, L7, 1 sack. (3) Sam S0, Sam S1 orders L7. (4) Harry H2, `seq` 2, `prev` H1: L7 to Sam `for` S1, `at` with seven fraction digits. (5) Amara A0, A1 orders L7. (6) Harry H2', `seq` 2, `prev` H1: L7 to Amara `for` A1, good `at`. Expect `chain(Harry)` `equivocations: [[H2, H2']]`; `ownership(L7)` `{ not_shown: true, lacks: [H2] }`. Today: H2 refused, so H2' stands alone and Amara owns L7 on both engines (seat 32 §4.3).
- **From:** 08 V4, V6; seat 32 S-6.

### 3a-3. A writer signs only what its own `read` reads
- **Reads** (`blocks.md`, Micro safety, its last sentence): "A writer signs only what its own `read` reads. A block a node lists as unread is on her line: her next block follows it."
- **Replaces:** `02-store.md` B1's new sentence stays; this follows it.
- **Answers:** `sign` in every SDK refuses to sign a block its own `read` refuses (a new error, no new code).
- **World:** Mama's phone is asked to sign M2 with `at` of seven fraction digits: `sign` refuses; nothing is signed; her next block is `seq` 2.
- **From:** 08 V7; seat 29 §4.2.

### 3a-4. A hole only at or below its place
- **Reads** (`folds.md`, A line, after Read whole): "A block this reader cannot judge, signed at a place in her list, is a hole only in the lines of the keys at or below that place: a word it could reach is `not_shown` for this reader, with `lacks` naming it. A block this reader can judge that has it in its causal past, or names it in `refs.defeats`, closes the hole."
- **Replaces:** nothing built (b2-07's hole bullet was never built). New.
- **Answers:** `ownership`, `stands` for words of keys at or below a place whose block is `unknown_suite` for this reader: `not_shown`; for keys above it: unchanged.
- **Built as:** a block held with its body that this reader cannot judge (its pieces not all held, or a suite it does not know) is on no line and counts in no fold; it hides each thing its refs name, as a block held and not read does (3b-7). Held only as its header, it hides nothing more than a header does.
- **World:** (1) Mama M0 (card A, `p256`); card A makes tomatoes T1 (2 kg) and maize Z1 on her own line. (2) Mama, card A, key grant K1: voices card B by hash, card A, SIM key in suite `slh` (a suite Sam's reader does not know). (3) SIM key, M3: T1 to Leila. (4) Card A, M4: Z1 to Sam. Sam's reader: `ownership(T1)` `not_shown`, `lacks: [M3]`; `ownership(Z1)` Sam. Today neither engine has the rule.
- **From:** 08 V8; seat 29 §6.

### 3a-5. A node shows a body only to an audience it can read
- **Reads** (`privacy.md`, first paragraph, appended): "A node shows a block's body only to an audience it can read. A body whose audience it cannot read, it shows to no one; it serves only a copy it holds for the asker, as it came (nodes.md, Pull)." (Changed in stage 7's compare: "and passes on as its header" went. nodes.md line 37, kept by 1.9 A2, says nothing of a sealed block goes to any other asker, and what I do not send, no one learns from me.)
- **Replaces:** nothing; new.
- **Answers:** the door's serve of a pulled block: nothing of a sealed block, not its header, to an unsigned asker or to one for whom the node holds no copy. No fold. A node can read an audience where it holds the block's body and every commitment of the audience is written in a hash name it knows. A sealed copy pushed for one person is passed to her as it came: it shows no body, so a relay that holds only the copy passes it on to her.
- **World:** a relay holds Amara's sealed order to Maria whose audience it cannot open, with a copy for Maria; Sam pulls: the relay sends nothing of it. Maria pulls, signed: she gets her copy as it came.
- **From:** 08 V5.

### 3a-6. One byte form for everything signed, hashed or sent
- **Reads** (`canonical.md`, in place of lines 9 to 23, "the opening rule and What RFC 8785 gives"): "**The one form.** Everything FoodBlock signs, hashes or sends as JSON (a block, a header, a genesis, a request, an answer, a message, a commitment's value) is written in these bytes, and a reader takes such bytes only if they are exactly these. The bytes are UTF-8 text with no space or line break outside a string. An object is `{`, its members parted by `,`, then `}`; a member is its key written as a string, `:`, and its value. Members are in ascending order of the UTF-8 bytes of their keys' characters (not of their escapes), compared byte by byte, a shorter key before a longer one it begins; no key is written twice. An array is `[`, its values in the order written, parted by `,`, then `]`. A whole number is `0`, or an optional `-`, a digit 1 to 9, then any number of digits. `true` and `false` are written so; there is no null and no fraction. A string is `"`, its characters, `"`: `"` is written `\"`, `\` is `\\`, U+0008, U+0009, U+000A, U+000C and U+000D are `\b`, `\t`, `\n`, `\f`, `\r`, any other character below U+0020 is `\u00` and two lowercase hex digits, and every other character is itself. Text is well-formed UTF-8. Any other bytes are not canonical. Every value that has these bytes, and in which no object has a key above U+FFFF, has exactly the bytes RFC 8785 gives it." Strict writing keeps its range rule: "A number is a whole number from −(2^53 − 1) to 2^53 − 1."
- **Replaces:** `canonical.md` lines 9 to 23; `02-store.md` K1 "On the wire": "the bytes RFC 8785 gives for the value they parse to" becomes "the bytes of the one form for the value they parse to"; `authority.md` line 117 "the RFC 8785 JSON of" becomes "the canonical bytes of"; the edge-case table line 80, keys "😀" and "～": "`～` first: byte order".
- **Answers:** the canonical writer in both engines (`canonical.rs:53`, the oracle's `jcs`): keys by UTF-8 bytes, not UTF-16 units. One unsigned vector row flips (the emoji row, seat 30 over 36,819 ids); every other id is unchanged.
- **World:** five vectors, one each: (a) keys `"` and `#` give `{"\"":1,"#":2}`; (b) keys U+0001 and `A` give `\u0001` first; (c) Maria's block with `state.batch.refs = {"flours": ["spelt","rye"]}` is canonical as written; (d) a block with keys "😀" and "～": `～` first; (e) a block message whose block has an Adlam key and `ｱ` is taken, with its id.
- **From:** 08 B1, B2; seat 30 §6 (Breaks 1, 3, 5). The range as a content rule beside the bytes (tier-1 set).

### 3a-7. Sorted sets, and the empty set
- **Reads** (`canonical.md`, Strict writing 5, in place of its first two sentences): "**Sorted sets.** In a block, an array that is the value of a member of the block's own top-level `refs`, and holds only strings, is a set. Its strings are in ascending order of their UTF-8 bytes, with no repeat. Every other array, a `refs` key inside `state` included, keeps its written order. An empty set is canonical, and `read` refuses it as `grammar`."
- **Replaces:** `canonical.md` Strict writing 5's first two sentences (`02-store.md` K3 kept it "unchanged").
- **Answers:** `valid` of a block with `refs.sees: []`: true; `read`: `grammar`. A `refs` key inside `state` is never sorted.
- **World:** (1) Sam S0. (2) Sam, S1 with `refs.sees: []`. Expect `valid` true, `read` `grammar`. Vector (c) of 3a-6 covers the nested case.
- **From:** 08 B3; seat 30 Breaks 2 and 4.

### 3a-8. One reader for every message
- **Reads** (`transport.md`, after T1's sentence): "Every message, signed or not, holds only what strict writing allows: no float, no null, and no whole number past 2^53 − 1. A push is exactly `{ messages, for }`, `for` left out where it says nothing. `limits.push_bytes` (8 MiB) and `limits.push_messages` (1024) are read on the bytes first. A carrier deeper than `limits.read_depth` is refused whole, before any block in it is read. Where one hash comes more than once in one push, each copy is judged, and the valid one is kept; where none is valid, one refusal is listed for the id, naming the copy with the lowest signature. The order of arrival never changes what is taken."
- **Replaces:** `02-store.md` T1 adds it; `protocol.json` adds `limits.push_bytes` 8388608 and `limits.push_messages` 1024 (SILENT 12). A whole push over a limit, or deeper than `limits.read_depth`, is `size_limit`; any other refusal of the whole push is `not_canonical`.
- **Answers:** `strict_push`: a float or 2^53 in `for` refuses the whole push (both engines; today the core takes everything); a float inside one block refuses the whole push (today the core refuses that block only); an extra top key is refused (today the core throws an argument error, the oracle takes it); a push 65 levels deep is refused (today the oracle takes it); one hash twice, in either order, keeps the valid copy (today the oracle refuses in one order). Rows 36, 43 to 46 of part 08's table.
- **World:** Sam's till pushes `{ messages: [S1], for: 1.5 }`: refused whole. Then `{ messages: [S1, S1'], for: "…" }` where S1' is S1's hash with a bad signature, in both orders: S1 taken both times.
- **From:** 08 B4, B8; security 01 M1, 02 F4, F5.

### 3a-9. The answer of `strict_push`; the door takes bytes
- **Reads** (`nodes.md`, Push): "`strict_push` answers one list per message, plus one field for a refusal of the whole push: `{ refused, messages: [] }`, or `{ messages }` with `refused` left out where the push is not refused. The door takes a push as bytes, so no caller decodes text before the core reads it."
- **Replaces:** the 1.8 shape "a list of one refusal object" (00-shared row 103); `door.ops.strict_push` in `protocol.json`.
- **Answers:** `strict_push`'s shape on every push. Both hosts store a block only under the id its bytes hash to.
- **World:** a push that is not canonical whole: `{ refused: { code: not_canonical, hash }, messages: [] }`.
- **From:** 08 B5; security 02 F2.

### 3a-10. Key, reply and message spellings
- **Reads** (`encoding.md`, Bytes): "A `p256` key's point is written uncompressed, with first byte `04`. Any other spelling is no key." (`protocol.json` `suites.p256.sign_key.grammar` states the `04`; `suite_of_key` of any other spelling is null.) (`encoding.md`, the short reply): "A short reply opens only from its exact spelling: strict base64url, no padding, `seq` in its fewest bytes. Any other text opens nothing." (`core.md` §2, Signing): "`verify_message` checks the key set before the signature."
- **Replaces:** nothing; each is new (`02-store.md` C2's "A verifier checks the key set before the signature" moves into the op's own text).
- **Answers:** `valid` of a genesis whose key is spelled `06` or `07`: refused on both (today the oracle takes it); `short_reply_open` of a padded, `+/`, spaced or leading-zero reply: opens nothing on both; `verify_message` of a header or genesis: false on both. Rows 35, 38 to 41.
- **World:** Amara's genesis A0 written with her key spelled `06…`: refused. Mama's reply `MDEx` with one `=` of padding: opens nothing.
- **From:** 08 B6, B7, B8; security 01 H2, M2, M3, M4.

### 3a-11. `pad` in a sealed plaintext
- **Reads** (`privacy.md`, Sealed messages): "The plaintext is `{ block, reveals }`, and may carry `pad`, a string of spaces, which a reader ignores. A `pad` that is not a string of spaces opens nothing (`shape`)."
- **Replaces:** `protocol.json` `messages.plaintext` (`["block","reveals"]` adds `pad`).
- **Answers:** `open_copy` of a padded plaintext opens it; the block's id is unchanged. Today both engines already open it; the closed list makes it protocol.
- **World:** Amara seals her order A1 to Maria twice, once plain and once with `pad` to 1024 bytes: both open to A1, same id.
- **From:** 10 R13; seat 43; T1-34 (tier-1 set).

### 3a-12. No answer depends on the machine
- **Reads** (`folds.md`, opening): "No answer depends on the machine that computes it. The protocol fixes no depth: a fold's limits on depth and work are its reader's own. A reader that stops says so: it answers `not_shown`, with what it did not reach in `lacks` (`{ stopped: "depth" }`), and never names an owner. A reader that goes on answers fully. `valid` reads only a block's bytes and its pieces, so the work of checking a push grows with what the push brings, never with the store."
- **Replaces:** nothing; new.
- **Answers:** `ownership`, `made_from` and the other walking folds on a chain of makes deeper than the engine walks: `not_shown` (a new reason in `lacks`), never a trap, an abort or `RangeError` (row 51).
- **World:** Maria feeds her starter: (1) Maria M0, a starter thing; (2) to (6001) Maria, 6,000 makes, each from the last. Amara buys a jar from the last. `ownership(jar)` is Amara on a reader that walks it, and `not_shown` on one that stops; never an abort.
- **From:** 08 C1, C2; security 08 F1 (the bound: owner's ruling of 2026-11-16, SILENT 9).

### 3a-13. `state.rule_set` on every block, read by every reader
- **Reads** (`core.md` §1, a field of every block): "`state.rule_set` is a field of every type, read by every reader. A block that states a set this reader does not run is not read (`unknown_rules`), and it hides what it could name (`folds.md`, Read whole). The core runs no set, so every id stated there is `unknown_rules` to it; a value that is not an id is `grammar`." (`core.md` §11): "A block that names no rule set is read by the core alone. No set is read into a block from another block. A rule whose purpose is to refuse what a signer would never name (a fork, a backdate, a summed limit) is no later rule: it is in the core."
- **Replaces:** `protocol.json` `fields.every` adds `rule_set`; `refusals.read` adds `unknown_rules` (moved forward from stage 7); `07-last.md`'s routing sentences are struck before stage 7 is written.
- **Answers:** `read` of a block naming a set this reader does not run: `unknown_rules` (today `undeclared_field`); folds asked about what it names: `not_shown`.
- **World:** (1) Sam S0. (2) Sam's till, S1: a sale of crate C1 to Ben, `state.rule_set` a hash no reader runs. Expect `read(S1)` `unknown_rules`; `ownership(C1)` `not_shown`, `lacks: [S1]`; folds on Sam's other things unchanged.
- **From:** 08 O2 to O4; 01 §2.4; D1; the coordinator's ruling of 2026-11-16 ("read by the core alone").

---

## 3b. Place and order (part 02; seats 01 to 04, 24, 25, 32, 41, 50)

### 3b-1. In its place
- **Reads** (`folds.md`, A line, first paragraph): "A block is in its place on its key's line where its `prev` names a block of that key and its `seq` is above that block's, or, for a key's first block, where its `prev` names the first block that brought that key in and its `seq` is 1. A key has one line: of several blocks that bring one key in, the first is the one the others have in their causal past, and a later one starts none; where none is first (two apart), none starts a line for that key. A block whose `prev` the reader does not hold is not shown, never out of place. A block whose `prev` names a block of its key with a `seq` not below its own, or that names the first block that brought its key in with a `seq` other than 1, is out of its place: it takes nothing (`out_of_place`). A block whose `prev` names neither a block of its key nor the first block that brought its key in is on no line of that key: a draw it signs takes nothing (`not_on_line`), and it is no block of a pair. Each binds its signer as a block of a fork does; `chain` lists it as `broken`. Where a draw is out of its place or on no line, that is its answer, read before whose the measure is. A fold reads a line in `prev` order; `seq` numbers the line and never orders it." (`core.md` §5, the `seq` bullet): "one more than" becomes "above".
- **Replaces:** `02-store.md` F2, "**A line** is one key's blocks, ordered by `seq` and joined by `prev`"; C7's added sentence ("A key's blocks are one line, ordered by `seq`"). The restatement's "a block whose `seq` is not above its `prev` block's is a pair" was never built and is not written.
- **Answers:** `ownership`, `draws`, `chain`. A block of lower `seq` after its `prev` takes nothing: the core gives the sack to Amara today and the oracle to Leila; both give Amara. One key brought in by two key grants: Amara `landed`, Leila `not_on_line` (her sale's `prev` names the second key grant: on no line), on both, and `fork_pairs` lists no pair (row 6).
- **World A:** (1) Harry H0. (2) Harry H1, `seq` 1, L7 1 sack. (3) Amara A0, A1 orders L7. (4) Harry H2, `seq` 10, `prev` H1, L7 to Amara `for` A1. (5) Leila E0, E1 orders L7. (6) Harry H3, `prev` H2, `seq` 7, L7 to Leila `for` E1. Expect `ownership(L7)` Amara; H3 listed in `draws` with `takes: false`, `why: out_of_place`; `chain(Harry)` lists H3 in `broken`.
- **World B:** (1) Amara A0. (2) Amara K1, key grant bringing in her tablet key T. (3) Amara K2 (`updates` K1), a second key grant bringing in T again. (4) T, `prev` K1, `seq` 1, makes her lot of 2 sacks; T, next on that line, sells sack 1 to Ben. (5) T, `prev` K2, `seq` 1, sells sack 2 to Leila. Expect Ben's draw `landed`; Leila's `not_on_line`; no pair.
- **From:** 02 R1; seat 01 §6; T1-2 (tier-1 set).

### 3b-2. The taint of a fork
- **Reads** (`folds.md`, A fork is a burden, second sentence): "In every fold but identity, the pair, and every block of that key whose `seq` is at or above the lower `seq` of the pair or that has a block of the pair in its causal past, are blocks of a fork. A block of a fork that draws on a measure no draw of the pair names is read as any draw."
- **Replaces:** `02-store.md` F3, "In every fold but identity, the pair and every block of that key whose `seq` is at or above the lower `seq` of the pair are blocks of a fork".
- **Answers:** none on whole lines (seat 01 shows the engines already read a fork's other draws so). It decides the header-only case: a later block that has a pair branch in its causal past is tainted though its `seq` says nothing.
- **World:** (1) Maria M0. (2) Maria M1 sack X, M2 sack Y. (3) Maria M3 and M3', a pair at `seq` 3, X to Leila and X to Ben. (4) Maria M4, `prev` M3, Y to Amara. Expect Y Amara (`landed`); X held on a pair.
- **From:** 02 R2.

### 3b-3. Neither came first, and the seven guessed orders go
- **Reads** (`folds.md`, once, after A line): "**A fold's order.** Where a rule needs to know which of two words came first and the record does not order them, neither came first. Where they reach for one thing, neither takes it; both are listed, and each binds its signer as far as its own word goes. A fold may read words in any order its engine likes; no answer changes with that order. A word is counted against another only where the other is in its causal past. Holding a block outside a word's past changes no answer about that word, except where it shows that the word's own signer signed two things for one place. A lowest hash may name one of two blocks that say the same; it never picks which one counts." (`03-amounts.md` F4, One rule): "From her start, in `seq` order" becomes "From her start, in `prev` order along her one line read whole". (`folds.md`, What is left, One rule, appended): "What came to her counts for a later draw of hers only where the draw that brought it is in that draw's causal past, whenever her yes was signed."
- **Replaces:** the guessed orders in the engines (lowest hash `order.rs`; `seq` then hash, oracle 4309; size of past `deal.rs` 145; `seq` across lines `deal.rs` 643; clock dates `clock.rs`, `release.rs`, oracle 3408); `03-amounts.md` F4's "in `seq` order".
- **Answers:** `ownership`, `draws`, `promise_stage` (`over_allocated`, `takers`). Two sales off the line naming a stranger's chain: today Leila or Amara by run on the core, Harry on the oracle; after, no draw takes and both are listed (rows 11, 12, 47). Two accepts of one draw: today 0.4 and 0.6 on the core; after, as 3b-8 (row 49).
- **World:** (1) Harry H0, H1 L7 1 sack. (2) Amara A0, A1 orders L7; Leila E0, E1 orders L7. (3) Harry H2 L7 to Amara and H2' L7 to Leila, both `prev` H1 (a pair), shuffled in every order. Expect the same answer in every order: L7 held on a pair (3b-4).
- **From:** 02 R5; Rule C; seat 04 §6.

### 3b-4. Allocations apart, and first on a clock
- **Reads** (`folds.md`, What each fold returns, `over_allocated`): "Allocations the record does not order are counted together. Where they come to more than the offer's quantity, none of those not ordered before the excess takes; each is shown `over_allocated` and still binds its signer." (`blocks.md`, A named clock, a new bullet): "Of two blocks, one came first on a clock where `needed` of its lines each hold a receipt of it before any receipt of the other. A receipt's place on the clock's line is its time (one receipt is before another where the other has it in its causal past); its `at` orders nothing. A line that holds a receipt of one and none of the other shows the one first. Until one holds, neither came first." (`folds.md`, Ownership, Letting go): "and then the first taker the clock received is the first owner" becomes "and then the first taker is the one that came first on that clock (blocks.md, A named clock); two first takers that did not come one first: neither takes, and both are listed".
- **Replaces:** `03-amounts.md` F11 `over_allocated`; F5's let-go sentence; `01-keys.md` §2.2's A named clock adds the bullet.
- **Answers:** `promise_stage` of an open offer: Maria's phone and till each allocating 6 of 10 apart: today the core binds 12 with no flag and the oracle shows the till's 6 over; after, both 6 are `over_allocated`, neither takes (row 10). `ownership` after a let-go with a clock: read by receipt order, never dates.
- **Built as:** allocations are read in rounds: each round, the allocations with no other left in their causal past; an allocation is counted against another only where the other is in its past and not freed for it; where a round comes to more than is left for any of it, none of that round takes. Two allocations of one signer that do not see each other are listed in `forks` (decision C2).
- **World A:** (1) Maria M0, open offer O, 10 loaves. (2) Maria's phone P1 allocates 6 to Leila; her till T1 allocates 6 to Ben; neither in the other's past. Expect both `over_allocated: true`, neither takes, both bind Maria, both in `forks`.
- **World B:** (1) Sam S0, crate C1, S1 lets C1 go, `clocks: { names: [Wanjiru], needed: 1 }`; Wanjiru W0 receipts S1 (the let-go stands only once its clock holds it). (2) Ben B1 takes C1 (a first use); Leila E1 takes C1, dated an hour earlier. (3) Wanjiru W1 receipts B1; W2 receipts E1. Expect Ben first owner; before W1, no owner. Today the core reads the dates and names Leila. (Until 3d-3 lands the field is still `keepers`.)
- **From:** 02 R5 cases; seat 04 s3, s4.

### 3b-5. A thing drawn twice (Rule B)
- **Reads** (`folds.md`, A fork is a burden, in place of "**A thing drawn twice:** …"): "The draws of a pair on a measure are read together, where the first of them is read. Where they, with the draws before them, come to no more than what was there, each takes. Twins `for` one deal count once: two blocks of a pair that name the same deal in `refs.for`, the same receiver and the same amount are one draw; each is listed with that draw's answer, and its amount is counted once. A draw of the pair that takes nothing by itself (out of its place, or past what is left alone) is read as any draw. A draw of the pair that has not its receiver's yes changes nothing on the others and takes nothing (`pair`): where one has her yes, it is read as a draw alone. Where two or more have it and they come to more, which one moved the thing is not shown: neither lands, each reads `pair`, each later draw that rests on either reads `pair`, the answer lists them in `pair`, each receiver holds the word signed to her, and what each paid is `uncovered`. No later block of that key chooses between them. A draw of the pair that takes nothing waits on nothing. It ends when the receivers have given up every draw of the pair on that measure but one, by each one's own `declined` or `stopped` answer, whether or not her yes came before; that one is read as a draw alone, and a draw given up is freed and holds nothing against the others. Or it ends by a ruling of a judge the receivers chose."
- **Replaces:** `03-amounts.md` F6, the sentences from "**A thing drawn twice:**" to "or by the judge the receivers choose", including "its signer owns none of that measure on that line" and "It ends by a receiver's own letting go".
- **Answers:** `ownership`. An unanswered twin no longer wipes Amara's sack (today `owners: []` on both). Fitting twins each take (today neither lands). A receiver's decline after her yes frees on both (today core frees, oracle not: rows 7, 9).
- **World A** (seat 50 `act.cjs`): (1) Harry H0, H1 L7 10 sacks. (2) Amara A0, A1 orders L7; Harry H2 L7 to Amara `for` A1. Expect Amara 10. (3) Harry H2', at H2's place, L7 to a puppet key P. Expect Amara 10 (the twin does not stand). (4) P says yes to H2'. Expect `pair: [{ draw: H2, to: Amara, yes: true }, { draw: H2', to: P, yes: true }]`, no owner. (5) P declines H2'. Expect Amara 10 on both engines.
- **World B:** (1) Maria M0, M1 flour F 10 kg. (2) Leila E1 orders 4 kg; Ben B1 orders 3 kg. (3) Maria M2 4 kg of F to Leila and M2' 3 kg of F to Ben, a pair. Expect Leila 4, Ben 3, Maria 3. (4) A crash signs M3 and M3', each 2 kg of F to Amara `for` A1: Amara 2, once.
- **From:** 02 R6; Rule B; seats 03, 47 A3, A4; T1-1, T1-3, T1-6 (tier-1 set).

### 3b-6. A line past a key replacement
- **Reads** (`folds.md`, A line goes on, appended): "Where a line goes on past a key replacement, the sum of the pair's draws on a measure that did not take (those with their receiver's yes) stays out of what the new key may draw on, until the pair ends as A fork is a burden says. A block of the new key that goes on the old key's line is read after the old key's blocks."
- **Replaces:** `03-amounts.md` F6's "its signer owns none of that measure on that line" (gone in 3b-5); `02-store.md` F2's "A line goes on past its key's replacement only for what its person owns".
- **Answers:** `ownership`, `draws` after a key replacement that follows a fork: today the core gives Sam 8 kg, the oracle nothing; after, nothing until the pair ends (row 8).
- **World:** (1) Maria M0 (card first voice), phone key P. (2) P, F 10 kg; P sells 6 kg to Leila and, at the same place, 6 kg to Ben. (3) Card, key grant putting tablet key T in P's place, `counted_to` the block before the pair. (4) T sells 8 kg of F to Sam: `past`. (5) Ben declines: Leila 6 lands. (6) T sells 4 kg to Amara: takes. Sam's 8 still `past`.
- **From:** 02 R7; seat 01 N10.

### 3b-7. Read whole, narrow, and what a header hides
- **Reads** (`folds.md`, A line, Read whole): "A line is read whole for a question when each block on it, from the block back to the start, the two ends included, is held and valid, and each block that names the thing asked about is read. A block on a key's line that this reader holds and does not read hides each thing it could name. Held as a body, it could name each id in its `refs` other than its line's own links (`author`, `prev`, `key`, `after`). Held only as a header, it could name each measure that key's line held at its place (after the block that starts an owner's line for it, a first owner's or a receiver's a draw landed to), and each word of that key it could end. A question whose answer could turn on such a thing answers `not_shown`, the block in `lacks`, whether or not a draw this reader read reaches it. A pair is read from the two headers alone. Where either branch is not read or held only as a header, every draw of that key on a measure it could name, from the pair's place on, is `not_shown`, that branch in `lacks`. A later rule counts only in a block that names it."
- **Replaces:** `02-store.md` F2, "**Read whole.** A reader holds a line read whole from a block back to a start when …"; F1's "so a line holding it is not read whole (A line)" becomes "so it hides what it could name (A line, Read whole)".
- **Answers:** `ownership`, `pot`, and every line-reading fold. A header message `{ header, header_signature }` a reader holds is held as its header in every fold. Wanjiru's sack is shown though one of Harry's 200 sales names a deal she lacks (today `not_shown`). A header-only sale hides the sack (today the oracle says `stands: true` for the lot's key grant and the core `false`; both now `not_shown`, row 32).
- **World A:** (1) Harry H0, H1 sack Q, H2 sack R. (2) Harry H3…H202, 200 sales of other sacks; H50 names deal D Wanjiru does not hold. (3) Wanjiru W1 orders Q; Harry H203 Q to Wanjiru. Expect `ownership(Q)` Wanjiru.
- **World B:** the same, but Wanjiru holds H50 only as its header. Expect `ownership(Q)` `{ not_shown: true, lacks: [H50] }`.
- **From:** DECIDED 10 (2026-11-11); seat 32 S-1, S-2; T1-22 (tier-1 set).

### 3b-8. One start: her list names the voice that receives (D7)
- **Reads** (`folds.md`, What is left, in place of One start): "**One start.** An amount that comes to her starts on the line of the voice her list marks `receives: true`, else her first voice: at her yes signed by that voice's key (of several, the one the others have in their past; two apart start none). Another key's accept of it is her yes and starts nothing; a draw on it by that other key takes nothing (`not_on_line`). Where another fact already fixes the line, it wins: a part passed comes back to the line that passed it; a part she passes from one key's line to another (a transfer to its own giver) starts on the line of the key it is handed to; a circle that names `refs.meter` counts on the meter's line. An amount that comes to an id with no list held (a circle) starts as stage 6 says; until then, at its one yes, or the one the others have in their past."
- **Replaces:** `03-amounts.md` F4, the paragraph "**One start.** An accept that brings an amount onto a line …" to "an order no reader can check is not read", whole; `03-amounts.md` F4b's "Two accepts or take-ups apart … are no pair: What is left, One start" becomes "Two accepts of her keys are read by One start". Choices rows 92, 113: reversed.
- **Answers:** `ownership`, `draws`. Two accepts apart no longer put her amount on no line: Amara's 2 sacks stop moving back on both engines (seat 02 `twostarts.cjs`).
- **World:** (1) Maria M0: list `[card (hash), phone P, tablet T]`, P marked `receives: true`. (2) Sam S1 gives Maria 10 sacks G. (3) P accepts; T accepts, neither in the other's past. (4) P sells 2 of G to Amara. (5) T sells 2 of G to Ben. Expect Amara 2 (`landed`); Ben's draw `not_on_line`; Maria 8 on P's line. Today both engines: Amara's 2 not shown as hers.
- **World B (the default):** Mama M0, list `[card B (hash), card A, SIM]`, no voice marked: Sam's gift lands on card B's line; a draw on it by her SIM key is `not_on_line`.
- **Product note (FoodX, not protocol):** at set-up FoodX drafts `receives: true` on her daily key into her list, and her read-back says so in one line (E3).
- **From:** 02 R4; D7; E3.

### 3b-9. An answer never says "nobody"
- **Reads** (`folds.md`, Ownership output): "An answer never says "nobody" where it holds a signed word naming someone. Where an answer turns on a block not held, or held and not read, it is `not_shown` with `lacks`, never `not_owner`. An instance on a pair answers `pair: [{ draw, to, yes }]` and no owner; every other answer says `pair: []`. A draw that rests on a pair reads `pair`. Every ownership answer names the blocks it read (`read`, sorted ids): the thing, the block that starts each owner's line for it, each draw listed, and each yes that landed one. A draw by one who owns none of the measure anywhere is `not_owner`, whatever her own line lacks."
- **Replaces:** `03-amounts.md` F11, the `ownership` bullet's "and no owner on a line where the thing was drawn twice (A fork is a burden)"; its output shape adds `pair` and `read`.
- **Answers:** `ownership` shape on every instance; `not_owner` for a missing block becomes `not_shown` on the core (row 33; the oracle already does).
- **World:** (1) Harry H0, H1 sack Q. (2) Amara A1 orders Q; Harry H2 Q to Amara. (3) Amara A2, an unrelated block. (4) Leila E1 orders Q; Amara A3 (`prev` A2) Q to Leila. A reader holding all but A2: `{ not_shown: true, lacks: [A2] }`. Today the core says `not_owner`.
- **From:** 02 R9; seat 50 §7; seat 41.

### 3b-10. Words shown with a thing; `standing` goes
- **Reads** (`things.md`, The same thing): "Any block may say two statements are one thing (`refs.same_as`). It is its signer's word and no one else's. It moves nothing on either, merges no measure however many sign it, and says nothing of amount. No reading of one is a reading of the other." (`folds.md`, Ownership output): "`named_by` `[{ block, by, own, pair, ref }]`, sorted by block: each block the reader holds that names this thing, or a draw this answer lists, by any ref, other than the draws and yeses this answer already lists; whom it speaks for (`by`); whether it is backed by whom the named draw spoke for (`own`); whether it is one of a pair (`pair`); and the ref that names it (one entry per block: the first ref key, in byte order, that names it, never `author`, `prev`, `key` or `after`; `own` is false where the block speaks for no one; the yeses left out are each receiver's own `accepted` answer to a listed draw, and each yes that landed one, her order included). A word is listed whether or not it counts: showing it moves nothing and frees no one. A reader who holds none says nothing of whether one exists."
- **Replaces:** the `standing` output and its values on a claim (built by stage 1's THREAT-MODEL rows and the core's claim reading; `protocol.json` folds output).
- **Answers:** `ownership` loses `standing`, adds `named_by`. No owner changes.
- **World:** (1) Harry H0; a thief with Harry's phone signs H5: sack Q to Amara; Amara accepts. (2) Harry's card, H6: an `observe` "not me" naming H5. Expect `ownership(Q)` Amara, `named_by: [{ block: H6, by: Harry, own: true, pair: false, ref: subject }]`.
- **From:** 02 R10; seats 23, 24. Whether a claim reaches through makes (D4 of part 02) was not answered: SILENT 8.

### 3b-11. What a key hands on (D11)
- **Reads** (`identity.md`, Her voices, a new paragraph): "A key grant is her word that the key's blocks are counted on her line. By itself it hands on nothing of hers that she did not sign with her own hand. A voice that states that what it signs of hers passes is her word that a thing of hers this key signs over is the receiver's, toward every block that has not seen that voice's end. A block another signs with her key is still his act, and her claim is on him."
- **Replaces:** `01-keys.md` §2.8 line 223's bullet and §5's lines 312, 314 ("who wins" on a taken key); `01-keys.md` §2.2 Who bears the gap's ground "the word she signed is the only showing there is".
- **Answers:** text only for the folds: the fold counts the same under every option (seat 25). `identity_state` lists, per voice, whether it states that what it signs passes (`passes: true` or `false` on every voice).
- **World:** (1) Harry H0, list `[card, phone P]`; P's voice states no `passes`. (2) A thief with P signs H5: Q to Amara; Amara accepts. Expect `ownership(Q)` Amara (counted); `identity_state(Harry)` shows P without `passes`. World B: the same, P stating `passes: true`: the judge reads H5 as Harry's word that Q passed.
- **From:** 02 R11; D11.

### 3b-12. What landed stays
- **Reads** (`folds.md`, What is left): "**What landed stays.** A payment reversed after the draw landed and stood moves nothing back: no fold takes from a later receiver what a standing draw moved. Whose the goods are, where a word was not its owner's, is a judge's word."
- **Replaces:** `03-amounts.md` F4, "**What landed stays landed** … is a sum the receiver owes the giver, and never takes goods from a later buyer."
- **Answers:** text only.
- **World:** none new; the vector of 03-amounts story 19 keeps its answer.
- **From:** 02 R12.

### 3b-13. A clock orders a pair where his voice states a reach
- **Reads** (`folds.md`, A fork is a burden, after Rule B's sentences): "Where the voice of the key states a `reach`, of two draws of a pair the one that stands (its clock's receipts, each stating no other block of that key at that place before it, and the reach closed) is on the line, and the other is a block of a fork. A clock that receipts both as first has made its own pair, and its receipts order nothing. With fewer than `needed` agreeing, the pair is read as A fork is a burden says."
- **Replaces:** nothing; new. It reads only fields that exist today, so it lands before the lock or never.
- **Answers:** `ownership` of a pair whose key's voice states a reach: the draw the clock received first, with the reach closed, lands; the other is a block of a fork. No sale stands until received, so nothing that stood moves back.
- **World:** (1) Harry H0, phone voice `reach` PT1H, `clocks: { names: [Wanjiru], needed: 1 }`. (2) Amara A1, Leila E1 each order sack Q. (3) Harry H2 Q to Amara, H2' Q to Leila, a pair. (4) Wanjiru W1 receipts H2, stating no other block at its place before it; W2 receipts H2'. (5) Wanjiru's cutoff W3 an hour after W1. Expect Amara owns Q; H2' a block of a fork. World B: Wanjiru receipts both as first: her receipts order nothing; Q held on a pair.
- **From:** 02 R8; T1-5 (tier-1 set). Shown only in a toy model (seat 03 `f3-rules.cjs`); it must pass the random-world test before the lock.
- **Built:** NOT BUILT in the first half (owner's ruling of 2026-11-16): marked in both engines (`fold/draws.rs`, the oracle's `drawsOn`), to be built and run in the random-world test after it.

---

## 3c. Holds (part 03; seats 05 to 08, 11, 35)

### 3c-1. Where a hold starts
- **Reads** (`folds.md`, What is left, A draw, first sentence after the list): "A block that names an instance of its signer's and a receiver is a draw on that instance, whether it is a transfer or an offer. An offer is the draw where it is its giver's own first promise to a named receiver other than himself (no status; it answers and updates nothing); it holds its `terms.quantity` where that is an amount in the instance's unit, else all he owns of it. A transfer holds the amount it states. Each holds from where its signer signs it, on his line. A yes to an order holds nothing: the order is the buyer's word, and the hold starts at the seller's own word that names the instance and her (his offer, or his transfer). A block that names only a kind or an amount holds nothing."
- **Replaces:** `03-amounts.md` F4, "**A draw** is a counted block that speaks for an owner, names a measure, and takes an amount …" adds the sentence; the list of draws adds "an offer that names an instance".
- **Answers:** `ownership`, `draws`: a one-to-one offer of a lot now holds it (offers as draws are not built today).
- **World:** (1) Harry H0, H1 L7 10 sacks. (2) Harry H2: offer of L7 to Amara. (3) Bob B1 orders L7; Harry accepts B1 (no draw); Harry H3 L7 to Bob `for` B1. Expect H2 `held`; H3 `past`.
- **From:** 03 R1; seat 05.

### 3c-2. An offer's hold follows its accept
- **Reads** (`folds.md`, Lands): "A draw that is an offer lands, or is freed, exactly where the accept that answers it binds, or does not. Its landing then waits on Due: a transfer of its giver `for` it, to the same receiver, on the instance, performs it. That transfer takes the offer's hold over (the hold is counted once, as the transfer's), and the offer is landed where the transfer lands."
- **Replaces:** `03-amounts.md` F4 Freed's last sentence, "An end of a draw is its signer's counted stop of it, or a time it states (`expires`) read only against the receiver's own dated word: her block dated at or after it has seen it, and her accept dated at or after it is late and no yes."
- **Answers:** `ownership` and `promise_stage` never disagree on one block: no "no deal" with "landed".
- **World:** (1) Harry H0, H1 L7; H2 offers L7 to Amara, `expires` Thursday. (2) Amara A1 accepts, `at` Friday. Expect `promise_stage` `offered`; `ownership(L7)` Harry, H2 `held` (it waits for Harry's next word). (3) Harry H3 declines A1: H2 freed. Today `offered` with owner Amara on both (`late.cjs`).
- **From:** 03 R2; reads 3d-2.

### 3c-3. The receiver's door (Rule A)
- **Reads** (`folds.md`, Freed, in place of its first sentences): "**Freed by the one it is for.** Before a draw lands, the one it would go to frees it by her own counted `declined` or `stopped` answer to it, or to the deal it is `for`, or by her counter to the offer that is the draw, even with her yes in its past. It is freed for its giver's later draws that have her answer in their past. **Freed by its giver.** An end by its giver frees it where she has seen the end before any yes, or, where the draw names a clock, once the lines that read no hold the end with no yes before it. An end by its giver that has her yes in its past frees nothing, save as 3c-4 says."
- **Replaces:** `03-amounts.md` F4, Freed, from "The amount is its owner's again" to "A no or an end that has her yes in its past frees nothing."
- **Answers:** `ownership`, `pot`, `draws`: a no after her yes frees, on both (row 14; today core `held`, oracle `landed`). An accept with the giver's end in its causal past: freed on both (row 30; today the core lands it).
- **World:** (1) Joe J0, box X. (2) Joe J1: X to Amara, on the condition that he is late (`without` his arrival, clocks Wanjiru and Leila, needed 2). (3) Amara A1 accepts. (4) Joe arrives; Amara A2 declines J1. Expect X freed, Joe's. Today held for ever on the core.
- **From:** 03 R3; Rule A; T1-8 (tier-1 set).

### 3c-4. A hold that waits on her money
- **Reads** (`folds.md`, Freed, after 3c-3): "Where a draw's landing waits on payment (`terms.waits_on: price`), its signer's end frees it where no block of his side accepting a payment toward the price is in the end's causal past."
- **Replaces:** nothing; new.
- **Answers:** `ownership` of a cash quote's lot after the seller's end.
- **World:** (1) Harry H0, H1 L7; H2 quote of L7 to Bob, `waits_on: price`, £60. (2) Bob B1 accepts. (3) Harry H3 ends H2. Expect L7 freed, Harry's. World B: as A, with (2b) Bob B2 pays £20 and Harry H2b accepts it before H3: L7 stays held for Bob.
- **From:** 03 R4; T1-9 (tier-1 set).

### 3c-5. A dead condition frees
- **Reads** (`folds.md`, Freed): "A condition that can no longer hold, by the signed words and clock it names, frees what it held, for its giver's later draws that have that in their past. "Can no longer hold" is read only from the clock's own readings: for `within`, its no-reading; for `without`, the yes-reading of its inner condition. A condition that can never be shown (a bare `reading`, a bench of `none`) can no longer hold from its signing."
- **Replaces:** nothing built; the restatement's sentence (draft A4) in its place.
- **Answers:** `ownership`, `pot`: a pledge whose condition died frees; a bare-reading condition never lands and never freezes.
- **World A:** (1) Maria M0, wheat W; M1 W to Leila, `without` the counter's signal that the price came by T, clock: the counter C. (2) C1 signals the price came before T. Expect W freed, Maria's.
- **World B:** (1) Harry H1, a bonus sack to Leila on a bare `reading` "silo dry for an hour". Expect freed from signing; never `held`.
- **From:** 03 R5; seat 47 B8; security 09 H3.

### 3c-6. No reader's clock
- **Reads** (`folds.md`, What is left, Lands, and the door ops): "A condition is read on the words in the past of the block that relies on it, never on a reader's clock. A time in a condition is shown only by its clock's cutoffs, and against a signer by her own date. A signal counts once it is counted, whatever its `at`; a later `defeats` of it ends it only for blocks that have not used it. `ownership` and `pot` take no clock. A draw held because its condition has not held is listed in `waiting` with `on: condition`. `expired`, `elapsed` and any view at a clock are readings, binding no one."
- **Replaces:** the `now` argument of `door.ops.ownership` and `door.ops.pot` in `protocol.json`; in the engines `tasks.rs` 85, 295, 359, `market.rs` 275, `door.rs` 621, 636. `03-amounts.md` T14's "read in the causal past of the block that relies on it" already says it.
- **Answers:** 274 of 393 `ownership`, `pot` and condition vectors pass a clock today (seat 11); each is re-run and its answer read.
- **World:** (1) Joe J0 box X; J1 X to Amara, `without` his arrival by 07:00 20 Nov, clocks Wanjiru and Leila, needed 2. (2) Amara A1 accepts. No cutoff is signed. Expect X `held` at every reader, whatever its clock says. Today: owner Amara at `now` 2027, `held` at null, both engines.
- **From:** 03 R6. Never without 3c-3 and 3c-5.

### 3c-7. A receiving place handed on; a note; "to come"
- **Reads** (`promises.md`, in place of Owed, the stage 3 swaps): "**What a deal names a side to receive.** Where the other side's word names an instance of hers, it is held. Where it names a kind or an amount, nothing is held for it: it is the other side's signed word, and the record shows it, what came, and when. **Handing on a receiving place.** The side a deal names to receive may hand that place, or a part of it, to another by a transfer that names the deal, which the other accepts. It is a draw on his own place, counted along his line, so one place goes once; it holds nothing against the other side. It reaches the other side only by her own word: her promise named a bearer, or she answers the hand-over `accepted`. Otherwise what she sends to the side her promise names counts, and that side is shown keeping it for the new one. **A note.** A payment counts toward whoever owned the note where the payment stands. That owner's answer counts it wherever the answer stands. Where the note moved after the payment, its old owner is shown keeping that amount for the new one." Field names: `owed` becomes `to_come`, `owed_on` becomes `to_come_on`, `owed_back` becomes `to_come_back`; the door op `to_come_back` answers `{ to_come: [{ block, amount, to, why }] }`.
- **Replaces:** `03-amounts.md` §2.8's swaps in `promises.md` line 10 (Owed); F11's `owed` and `owed_on` bullets (renamed, their arithmetic kept); `protocol.json` fold outputs.
- **Answers:** `promise_stage`: the names of three outputs, everywhere (D12); Mama's payment after a hand-over counts toward her price (today counts nothing); a payment before the move counts for the old holder, shown kept for the new (today `underway`, `paid` null, `owed3.cjs`).
- **World:** (1) Mama M0; Harry H0. (2) Mama M1 promises Harry KSh 2,000 for flour; Harry accepts. (3) Harry H2 hands his place to Wanjiru; Wanjiru accepts. (4) Mama M2 pays Harry 2,000; Harry accepts. Expect paid 2,000; `to_come_on: [{ from: Harry, to: Wanjiru, amount: 2000 KES, payment: M2 }]`.
- **From:** 03 R11; seat 06; D12. **The note** is the receiving place a deal names, as it passes from one holder to the next (a tab handed on); its owner is whoever holds it where a payment stands (`00-shared.md`, Deals).

---

## 3d. Keys and time (part 06; seats 10, 12, 31, 34 to 37)

### 3d-1. Time
- **Reads** (`blocks.md`, Time, whole): "**Time.** The record holds one kind of time: this word has that word in its past. Everything else about time is somebody's word. A block's `at` is its signer's word of what her clock showed; any block may leave it out. No rule orders two blocks by dates, adds a span to a date, or reads a date along a line."
- **Replaces:** `01-keys.md` §2.2, the paragraph "**Time.** A block's `at` is read only against its signer. …", whole (it held "A block's date on a line is the latest `at` …" and "A block with no `at` is past every end").
- **Answers:** none alone; with 3d-2 and 3d-5 every answer that read a date along a line or added a span (`line.rs` `add_duration`, `shown_false`).
- **World:** (1) Leila's tool, under her grant `until` Friday: block T9 dated Wednesday, then T10 (`prev` T9) dated Tuesday. Expect T10 after T9 by `prev`, whatever its date.
- **From:** 06 R1; seat 10.

### 3d-2. A stated end, and a missing `at`
- **Reads** (`blocks.md`, Time, appended): "A time a word states is an end of that word. On a clock the word names, its clocks' cutoffs show it (The cut). With no clock, a block made on the word is in time only by its own `at`, before the end. A block whose `at` is at or after the end, or that states none, is not in time: it binds the word's signer only by her own later block, or by a relier's block that has it in its past. A block's own date shows it late against its own signer, always. A missing `at` reads the same in every part: under a grant with `until`, as under any stated end. A clock's receipt after its own cutoff dated before its time, and a signer's two dates against each other, are readings, binding no one."
- **Replaces:** `02-store.md` C9 check 4's `at_missing` (out of `valid` and `read`); `protocol.json` `required` lists for `at`.
- **Answers:** `stands`, `ownership`: an undated yes after an `expires` is not in time (today `held` for ever, her stop frees nothing: seat 10 `t1` B, D). An act grant no longer backs an undated block that an operator or circle grant cuts (both engines contradict themselves today).
- **World:** (1) Maria M0, M1 offer of 10 kg flour F to Harry, `expires` the 12th, no clock. (2) Harry H1 accepts, no `at`, in June. Expect not in time: F `held` until Maria's next word. (3) Maria M2 ends M1: F freed. Today `held` for ever.
- **From:** 06 R2, R3, R4; T1-12 (tier-1 set).

### 3d-3. A clock is a line; `keepers` becomes `clocks` (D15)
- **Reads** (`blocks.md`, A named clock, first paragraph): "A **clock** is a line the word's signer named, so that her ends, the times she stated and other people's blocks sit on one line and are put in order: `clocks: { names, needed }`. Each name names a line, read as it goes on (A line goes on). A receipt counts only where its key spoke for that clock's owner at that block." Every byte name `keepers` becomes `clocks`: `state.keepers` (a genesis, a key grant's list, a let-go), `scope.keepers`, `terms.keepers`, `shapes.keepers`, the door's `keepers` in `identity_state`; every prose "keeper" becomes "clock".
- **Replaces:** `01-keys.md` §2.2 A named clock, its first paragraph and the bullet "A **keeper** is whoever keeps a line a clock names"; `protocol.json` everywhere it names `keepers` (617 lines of `vectors.json`).
- **Answers:** every id of a block that carries the field (bytes change); `on_line` follows her list, not one fixed key, so a wait on a clock whose owner changed keys is no longer stuck.
- **World:** (1) Maria M0, list with `clocks: { names: [Wanjiru W0], needed: 1 }`, a voice with `reach` P1D. (2) Maria's phone sells F to Sam (S9). (3) Wanjiru replaces her phone key by a key grant W5. (4) Wanjiru's new key receipts S9, then cuts off through S9 plus a day. Expect S9 stands. Today the wait on W0's old key line is stuck (security 03 F1).
- **From:** 06 R5; D15; security 03 F1.

### 3d-4. A cutoff by its place
- **Reads** (`blocks.md`, A named clock, Cutoff): "A clock's counted `observe` of kind `cutoff`, `refs.subject` the word, `state.when` the word's own text for that time: an instant; for a span (a wait, a reach), the span itself, a duration, with `refs.derives_from` the receipt or earlier cutoff it runs from. A span cutoff closes a span no longer than its own (durations are compared, never added to a date). On her line it is that time's place: a receipt before it came before the time, a receipt after it came after. A cutoff whose own `at` is before its `when` closes nothing: its own date shows it early, against its own signer. A cutoff that states no `at`, and a span's, is never early."
- **Replaces:** `01-keys.md` §2.2, the Cutoff bullet ("`state.when` an instant T … shown false by that receipt, and closes nothing"); the four readings' "dated no later than T" and "through the keeper's receipt of its start plus the wait".
- **Answers:** `stands`, the `within`/`without` conditions, the cut: no date check on a cutoff (`line.rs` 65, 87 to 90 out).
- **World:** (1) Joe J1 bond as 3c-6, clocks Wanjiru and Leila. (2) Wanjiru W3 cuts off "07:00 20 Nov", her receipt of Joe's arrival W4 after it on her line, dated 06:55. Expect on Wanjiru's line: Joe late. Today `shown_false` by the date. **World B:** on 1 October Wanjiru signs W3' "the time has come" for 07:00 20 November, `at` 1 October. Expect W3' closes nothing (seat 11 Q4). **World C** (3d-3's): Wanjiru's receipt of S9, then her cutoff `when: P1D` deriving from it: Maria's reach of a day has run on her line.
- **From:** 06 R6; seat 11 Q4; T1-15 (tier-1 set).

### 3d-5. Which reading needs `needed`
- **Reads** (`blocks.md`, A named clock, in place of "One to narrow" and the counts in The four readings): "On a clock, `needed` lines must show the reading that moves a thing out of its signer's hand, or widens what a word allows (a block in time, a wait run, a reach run). The other reading takes `names` less `needed`, plus one. They never both hold, and once every line has spoken one of them holds."
- **Replaces:** `01-keys.md` §2.2, "**One to narrow, the stated number to widen.**" whole, and The four readings' "`needed` lines each hold a cutoff through T"; `01-keys.md` §2.1 "Saying no is signing"'s "one keeper's line holding the no's receipt … is enough".
- **Answers:** `stands`, conditions, the cut. Joe's box goes to Amara only when both clocks say he was late (`f-two-keepers.cjs`); Maria's stop on one of three clocks (any two) no longer ends a thief's sale.
- **World A:** Joe's bond, clocks Wanjiru and Leila, `needed` 2 (the move is "late"). Wanjiru cuts off late; Leila receipts Joe on time. Expect X Joe's. **World B:** Maria, three clocks, `needed` 2; her stop reaches one; the thief's sale S holds two receipts stating no end before it. Expect S counts. With her stop on two lines: S counts for nothing.
- **From:** 06 R7; DECIDED 17 (2026-11-11); T1-13 (tier-1 set).

### 3d-6. One receipt that names an end and a block (D-also)
- **Reads** (`blocks.md`, A named clock, Receipt, appended): "Where one receipt names an end and a block made on the word, neither came first on that line: the receipt shows the block neither before nor after the end. A later receipt of the block on that line is after the end."
- **Replaces:** the engines' `end_first` tie (`line.rs`) and the vector that keeps it (vector 34, per 06 §7). Plan 06 R8 ("the end is first") is not written.
- **Answers:** the cut: a block in one receipt with its end waits (`on: end`) on that line, then counts for nothing at the next receipt of it.
- **World:** (1) Amara's grant G, `scope.clocks` her node N (1 of 1). (2) Amara stops G (A5); a thief's accept X under G. (3) N1 receipts A5 and X together. Expect X waiting. (4) N2 receipts X again. Expect X counts for nothing.
- **From:** D-also, reversing 06 R8 and T1-14(a).

### 3d-7. A clock is read in the past of the block that relies on it
- **Reads** (`blocks.md`, A named clock): "No reading of a clock reaches outside the causal past of the block that relies on it, bar whether an end stands. A key grant a block names for its meaning is read, for that block, within the block's own causal past: its wait and its reach run only on the receipts and cutoffs that block holds." (`stands` of the relying block answers it; no other door op is needed.)
- **Replaces:** `01-keys.md` §2.2's bullet "**What a keeper signed and another built on stands against those who named her.**" (its first sentence kept as this one).
- **Answers:** the cut, `stands`: a receipt the relying block does not hold is not read for it.
- **World:** Leila's key grant K, reach P30D, clock Wanjiru. Wanjiru's cutoff W9 closes K's reach. Mill Lane's block M holds no W9. Expect: for M, K still waiting.
- **From:** 06 R9; security 03 F2.

### 3d-8. Her own word stands alone
- **Reads** (`blocks.md`, The cut, a new first case): "A block joined to no other person's block (it names none, and none names it as her yes), and made on no word but her own whose ends only her own voices sign, stands against those ends when signed. A key grant by her voice above that key whose `counted_to` is before it, or a pair at its place, puts it off her line toward every block that does not have it in its past. Nothing else does. A block another person's block is joined to is read by the rest of The cut."
- **Replaces:** `01-keys.md` §2.2 The cut's "or, where the word names none, a relier's counted block uses it, or the word's signer names it in a later counted block of her own" (a lone block no longer waits for a relier or her own naming).
- **Answers:** `stands`, `ownership`: Mama's newest "it came", make or stop stands when signed (today `on: end`, `a-built.cjs` 1a to 1c). `k1-keys` and `k1-stories` flip every "her newest block waits on end".
- **World:** (1) Mama M0, card A only, no clock, `reach` PT0S. (2) Mama M1: her `received` KSh 100 `for` Leila's order. Expect `stands` true when signed. Today `on: end`. (3) A thief with her SIM signs M2: a stop of her grant to Soko. (4) Card A signs K2, ending the SIM key, `counted_to` M1. Expect M2 off her line: the grant stands. Had Soko's block already built on M2, M2 would stay for Soko.
- **From:** 06 R11; T1-17 (tier-1 set). 06 R12; E1 (question 5's second exception).

### 3d-9. The join: a cash sale is done at the seller's block
- **Reads** (`blocks.md`, The cut): "A block made on the word counts as made on it where the end has it in its past; or where another person's block is joined to it (names it, or is named by it as her yes) and has not seen the end. Where the word names a clock, the join is the clocks' receipts of the block, held in the other's block's past, stating that no end is before it on their lines (`needed` of them). For one who signs nothing more, an end is shown only on a clock. Any other block made on an ended word counts for nothing."
- **Replaces:** `01-keys.md` §2.2, The cut, from "A block made on such a word (a block under it …) that has seen an end counts for nothing" to "Until it passes, it is waiting"; Seen's second fact.
- **Answers:** `stands`: Mama's transfer `for` Leila's order stands at Mama's block (today waits for Leila's third block).
- **World:** (1) Leila E1 orders 2 kg of Mama's lot T, naming T. (2) Mama M2 transfers 2 kg of T `for` E1. Expect M2 `stands` true; Leila owns 2 kg.
- **From:** DECIDED 2 (2026-11-11), "already decided; the engines must catch up" (10 §9). 3d-8 needs it.

### 3d-10. A transform's inputs are draws in the pair test
- **Reads** (`folds.md`, A fork is a burden): "A transform's `inputs` are draws on the thing they name, in the pair test as everywhere."
- **Replaces:** nothing in text; the core's pair test.
- **Answers:** `ownership`: a pair of a make and a give lands neither (today the core lands Leila's 10 kg, row 15).
- **World:** (1) Maria M1 flour F 10 kg. (2) At one place: M2 a make taking all F into dough; M2' F to Leila. Expect neither takes; F held on a pair.
- **From:** 06 R13; seat 12.

### 3d-11. A key grant is a key grant; the mail key
- **Reads** (`identity.md`, in place of Encryption keys): "No kind of key grant skips the cut, the reach, or the pair rule. A key grant that states only `public_key_encrypt` is a grant of hers: it waits on its key's reach and passes the cut as any grant of that key does, and is not signed twice. Two of one voice, neither in the other's causal past, are a pair: neither stands. A key grant that states her list may also state `public_key_encrypt`. An end of a key ends the encryption keys it named. Which key a sealer uses is a reading: the encryption keys of her standing grants in the sealer's causal past whose key still speaks for her there, less any a later standing one of the same or a higher voice has in its past; of two that cross, the higher voice's. A sealer whose block relies on one names that grant in `refs.after`."
- **Replaces:** `01-keys.md` §2.1 "**Encryption keys.** A key grant that states only `public_key_encrypt` brings in no voice, lets no one act and waits on nothing. …" whole; §2.2 Finality's "nor is a key grant that adds only an encryption key"; the engines' skip (`fb.cjs` 1885, 2076; `identity.rs` 719 to 723, 1079).
- **Answers:** `stands`, the mail-key reading: a mail key from an ended phone does not stand; a fork's two mail keys both fail; a new phone's mail key stands after her reach (one day), not thirty.
- **World:** (1) Leila L0, list `[card, phone P (reach P1D)]`, clocks Wanjiru. (2) Card ends P. (3) A thief with P signs a mail key grant E1. Expect E1 does not stand. (4) Card adds new phone Q; Q signs mail key grant E2. Expect E2 waiting `on: reach` until Wanjiru's cutoff a day on; then stands.
- **From:** 06 R14 to R16; seat 36; D-also; T1-26.

### 3d-12. A suite move only by a voice above; a hidden voice has no suite
- **Reads** (`identity.md`, in place of A suite move): "**A suite move** is a key grant, by a voice above a key, that puts a key of another suite in that key's place. A key's own key grant is never a suite move. To a reader who believes the old suite, a suite move is an end, read as any end is. To a reader who no longer believes it, a block of the old key counts only when it is in the move's causal past, or she held it before she stopped believing that suite. Receipts of an old-suite block count in no fold. Whether a key grant counts is read on the lists that stand in its own causal past, before any pair it would cut. A pair in a suite this reader no longer believes proves nothing. Each key's suite is read from its own spelling." (`identity.md`, Her voices, the voice list): "`{ key_hash }`: a key not yet shown, named by the hash of its SPKI text, with no `suite` field. A voice this reader cannot read keeps its place in the list, is compared by its bytes, and is a hole as 3a-4 says: only in the lines of the keys at or below its place. Her genesis shows its own key: a hidden voice that names it is a key of hers that speaks, listed in `identity_state.keys`." (06 R18 said "a hole in every line it could end"; 08 V8's bound is written, as T1-20 in the tier-1 set.)
- **Replaces:** `01-keys.md` §2.1 "**A suite move.** A key grant that puts a key of another suite in a place cuts by causal order alone …" whole; the voice `{ key_hash, suite }`; `protocol.json` `shapes.voice` (`key_hash` loses `suite`).
- **Answers:** `stands`, `signed_by_author`: a forger's own-key suite move makes nobody Harry (today the core does, row 29); Mama's goat sale is not cut with no pair recorded; a reader lacking a suite can hold the list (today the whole list is `unknown_suite`). Audit key-grant ids that carry `key_hash` change.
- **World:** (1) Harry H0, list `[card (key_hash), phone P (p256)]`. (2) A forger with P's broken key signs F1: a key grant from P putting a new key of suite `slh` in P's place. Expect F1 is no suite move; Harry's list unchanged. (3) Harry's card signs C1, the same move. Expect C1 is the move.
- **From:** 06 R17, R18; seat 31; T1-24 (tier-1 set; its genesis-list hedge is 3d-17).

### 3d-13. A passkey signature counts only when the user was verified (D10)
- **Reads** (`encoding.md`, Passkeys, The check, item 2): "Bit 0 (user present) and bit 2 (user verified) of the flags byte (byte 32 of `authenticatorData`) are set. A key held in software writes the byte itself, so it shows nothing about a person; a touch alone signs nothing."
- **Replaces:** `02-store.md` E6 item 2 ("Bit 0 of the flags byte … is set"); E7's "and whether the device verified its holder (`UV`) … `valid` reads neither" becomes "`valid` reads the user-verified bit and not the site that asked".
- **Answers:** `valid` of a passkey block with flags `0x01`: `bad_signature` (today valid on both). Every passkey vector signed with `0x01` flips (`sign.rs` 385 to 445, `fb.cjs` 270 to 310).
- **World:** (1) Mama M0 with card A as a passkey voice. (2) Card A signs M1 with flags `0x01`: `bad_signature`. (3) The same with flags `0x05`: valid.
- **From:** 06 R19; D10; seat 37.

### 3d-14. The people of a voice may reach above it (D8)
- **Reads** (`identity.md`, in place of "Nothing else a voice signs reaches above it" and with "A voice changes only what is below it"): "Where her list says so, a voice of other people whose `wait` is above zero may sign a key grant that puts a new key in a place above its own (that place's wait and reach kept), or that leaves no voice at all. It is never narrowing: it stands only when `needed` of them have signed it again after their wait has run on her clocks, and where no voice above them said no in that wait. Only the first voice changes `clocks`, and only the first voice adds or changes a voice of other people. A key grant of a voice of other people is one of a pair only once `needed` of them have signed it or named it in `refs.confirms`. A list that does not say so keeps meaning what it meant."
- **Replaces:** `01-keys.md` §2.1, "**A voice changes only what is below it.** … Only the first voice changes `keepers`." adds it; the built "never" (`34-scratch/kin.cjs`).
- **Answers:** `stands`, `identity_state` for lists that say so. No old list changes answer.
- **World:** (1) Maria M0, list `[card C, phone P, { names: [Mum, Brother], needed: 2, wait: P30D }]`, placed by C, the people's voice stating `above: true`, clocks Wanjiru. (2) C burns. (3) Mum signs K1: new card C2 in C's place; Brother confirms. (4) Thirty days on Wanjiru's cutoffs; Mum and Brother confirm again. Expect K1 stands. World B: the same, with P signing a no inside the thirty days: K1 never stands.
- **From:** 06 R20, R21; D8; E2 (the close on the same terms); seat 34.

### 3d-15. A close
- **Reads** (`identity.md`, Taking oneself out, in place of its last sentence): "A key grant that leaves no voice closes the actor. For every block that has it in its causal past, no key of hers speaks, whatever its place. A close is an end of every standing word of hers (grants, offers, requests, transfers that wait on an answer, account words, hands) except a transfer conditioned on her close. For each draw of hers it is an end by its giver, read as any end of hers (folds.md, Freed): it frees the draw, for her later draws that have it in their past, where its receiver has seen the close before any yes, and an offer no yes answers at once; it never frees a draw that landed. What another accepted, before the close or unseen by it, stands as signed (stage 5 compare). The record says closed, never why. A close is for good."
- **Replaces:** `01-keys.md` §2.1 Taking oneself out, "A list with no voice left closes her identity: nothing signed after it in any block's causal past counts for her."
- **Answers:** `stands`, `signed_by_author`: a card that signs after the close counts for nothing (today it signs, both engines: `dead-card-both.cjs`); her open offers end at the close.
- **World:** (1) Harry H0, list `[card, { names: [Leila, Sam], needed: 2, wait: P30D }]`. (2) Leila and Sam close it (3d-14's path). (3) Harry's nephew with the card signs H9: the mill to Ben. Expect H9 counts for nothing.
- **From:** 06 R22; seat 35.

### 3d-16. A will holds nothing in life; the successor goes (D9)
- **Reads** (`identity.md`, in place of After a death, and `folds.md`, Ownership): "A will is her own transfer on `{ closed: <her id> }`. While she can sign it holds nothing; an accept of it before the close is a request; she may end it until the close, and her stop counts for every reader once one of her clocks received it before the cutoffs that closed the close's wait. At the close her wills take in the order of her line; a will whose thing is gone takes nothing. The receiver signs as owner in his own name. What she willed to no one stays shown hers."
- **Replaces:** `01-keys.md` §2.7 `profiles/successor.md`, whole (deleted); `protocol.json` grant kind `successor`, `observe` kind `close`, `continues`; choices rows 64, 109.
- **Answers:** `ownership`: Harry's willed mill shows Harry as owner in life (today no owner, both engines); a later sale goes through; `stands` of a will accepted early: a request.
- **World:** (1) Harry H0. (2) Harry H1 (2027): mill X to Leila on `{ closed: Harry }`. (3) Leila accepts. Expect X Harry's. (4) Harry H2 (2029): X to Sam; Sam accepts. Expect Sam. (5) Harry's list closes. Expect H1 takes nothing. The `closed` condition is stage 5's shape: SILENT 16.
- **From:** 06 R23; 03 R8; D9.
- **Lands with stage 5** (owner's ruling, 2026-11-19): not built in this set. Both engines keep the successor profile until then; the oracle's will reading is written and switched off (`STAGE5_WILLS`), and its story is `core-set-b/stage5-3d-16.cjs`.

### 3d-17. A genesis may state her list
- **Reads** (`identity.md`, Her voices, after "The genesis is a list of one voice"): "A genesis may instead state her whole list in `state.voices`, the highest voice first, as a key grant does; a hidden voice may be first. Its own `state.public_key_sign` is then the `key` voice of that list that names it, and a genesis whose key is no voice of its own list is no genesis (`shape`). A twin of a genesis is another person, so no one can twin a list stated there."
- **Replaces:** `01-keys.md` §2.1 Her voices, "The genesis is a list of one voice: its own key, `state.public_key_sign` (and `state.suite`)." adds the sentence; `core.md` §4's genesis fields add `voices`.
- **Answers:** a genesis that states `voices` has a new id (new bytes); `identity_state` reads its list from the genesis. Old genesis blocks read as before.
- **World:** (1) Harry H0, `state.voices: [{ key_hash: card }, { key: phone, suite: std }]`, signed by the phone key. (2) Years on, std falls; a forger with the phone key signs F1 at `seq` 1, a key grant moving the phone place to his own `p256` key. Expect F1 no suite move (3d-12) and Harry's card still first in his list from his id.
- **From:** 06 D5(b); seat 31 §6 (E); T1-24 (tier-1 set). The `shape` clause is this text's: SILENT 22.

### 3d-18. A word at `PT0S` stands when signed (owner's ruling, 2026-11-19)
- **Reads** (`blocks.md`, Finality, in place of Signed twice; `identity.md`, When a key grant stands): "A word of a key that lets a key or a person act or spend for her, or more than before, stands once that key has said it again after its voice's `wait` has run on her clocks, or a voice above has said it. At `PT0S` it stands when signed: signing twice is her own choice in her list, a `wait` above zero. A voice of other people speaks only when `needed` of them have signed it."
- **Replaces:** 1.8 rule 13, "A word that lets another act for her is signed twice" (already removed from `00-shared.md` §3), and the engines' second signing at a zero wait (`identity.rs` `power_standing`; the oracle's `twice`).
- **Answers:** `stands`, `identity_state` (`waiting` on `confirm`), `signed_by_author` of every block under a key grant at `PT0S` that no second signing confirmed: Mama's phone key, added at `PT0S`, speaks when its key grant is signed (today it waits on `confirm`, and every block it signs counts for nothing).
- **World:** (1) Mama M0; card A signs K1: `[card, phone P (wait PT0S)]`. (2) P signs a transfer T of Mama's lot to Leila. Expect K1 stands when signed; T counts.
- **From:** restatement S5, kept by 06 §3; owner's ruling of 2026-11-19 ("her own choice in her list").

---

## 3e. Amounts (part 04; seats 26 to 28, 47, 49)

### 3e-1. Paid only by the payee's word, or by the very thing named
- **Reads** (`folds.md`, What is left, in place of The other side): "**The other side.** A block `for` a deal counts toward one half of it: what moves, or the price. It counts in one of two ways only. **The very thing named.** A draw on the instance a half names (the deal's `refs.what`, a line's `what`, or the `of` of its price where that block is an instance) counts toward that half where it lands, at what landed. It lands as any draw does: her `accepted` answer, or her yes already in its causal past (her own first promise of the deal, which its giver accepted). Where the reader does not hold the block an `of` names, the answer is `not_shown`, lacking it. **Her word.** Anything else counts at what the side that half goes to said of it, in that half's `unit`, and at nothing else: her `accepted` answer, at the block's amount or the `state.amount` she states, no more than the block's where it states one; her `covers`; her `received`; a `received` by a signer her account word names, where it names that account word. Where she said nothing in that unit, the block counts nothing. A draw on any other instance counts only by her word, never by landing. `paid` is null until a block counts toward the price. No fold compares `of`."
- **Replaces:** `03-amounts.md` F4, The other side, from "**The other side.** A draw is one side of a hand-over" to "Each half of a deal is counted this one way: toward what moves, and toward the price", including "A transfer that names an instance counts toward a price only where the price states an `of` and the instance's `refs.of` is that id".
- **Answers:** `promise_stage` (`paid`, `stage`, `uncovered`): Harry's self-made credit pays nothing (today the core paid 5, row 19); a real part of Maria's issue pays as a landed draw (row 20); a draw the payee has not answered pays nothing (row 21); a `received` that answers a transfer counts (row 22).
- **World:** (1) Maria M0, kind K "bread credit", her issue I (an instance of K). (2) Maria M1 sells Harry 5 loaves at 5 `of` I; Harry accepts. (3) Harry H1, a thing "5 credit" `of` K of his own; H2 transfers it to Maria `for` M1. Expect nothing paid (`paid` null); had Maria answered H2 `accepted`, it would count 5 by her word. (4) Harry H3 draws 5 of a part of I he holds, to Maria `for` M1; it lands where it is signed (M1, her own offer that Harry accepted, is her yes). Expect `paid` 5.
- **From:** 04 R1; seat 26; T1-29 (tier-1 set).

### 3e-2. Once
- **Reads** (`folds.md`, The other side, appended): "The words of one side about one block count once, at the most any of them says: her own words, and each word of a tool that speaks for her. A `received` that `answers` a transfer is a word about that transfer. One that answers none is a payment of its own. A word by a signer who does not speak for that side is that signer's reading. What came beyond is shown (`uncovered`). A block a word of hers counts (her accept, her `received` that answers it, her order in hand) is not `unanswered`."
- **Replaces:** `03-amounts.md` F4, "**One payment counts once, at the most its receiving side has said of it:** …" to "No one else's word raises it."; F7's "(of several answers of the payee to one payment, the one whose `covers` says most counts)".
- **Answers:** `promise_stage` `paid`: Mama's tablet accept and phone `received` of one KSh 20: 20 (today 40, both); Amara's door and fridge tools each 40 l: 40 l (today 80 l).
- **World:** (1) Leila E1 promises Mama KSh 20; Mama accepts. (2) Leila E2 transfers 20 `for` E1. (3) Mama's tablet accepts E2; Mama's phone M5 `received` 20 answering E2. Expect `paid` 20. Two `received` words answering no transfer: 40 (her word, kept).
- **From:** 04 R2; seat 49.

### 3e-3. Her order, where it says the goods are in her hand (D4)
- **Reads** (`folds.md`, The other side): "**Her order**, where it is in the block's causal past and states that it is her word that the goods are in her hand, counts the block toward what moves to her, for no more than it states. An order that does not say so counts nothing toward what came. No order counts toward a price."
- **Replaces:** `03-amounts.md` T13's "counts toward its line only on the receiver's accept, or the signal of a signer her account word names"; the restatement's A11 (DECIDED 6 as first written).
- **Answers:** `promise_stage` `moved` toward a line. The heap at the basin: two blocks done. The mill order with no term: what came is what Harry says came.
- **World A:** (1) Leila E1 orders 2 kg of tomatoes from Mama, with `terms.in_hand: true`. (2) Mama M3 transfers 2 kg, naming no instance, `for` E1. Expect `moved` 2 kg. **World B:** (1) Harry H1 orders 40 sacks from Sam, no term. (2) Sam S2 transfers 40 sacks naming none. (3) Harry H2 `received` 36. Expect `moved` 36.
- **From:** 04 R3; D4; seat 47 A2.

### 3e-4. How a price is counted: multiply, never divide
- **Reads** (`folds.md`, A promise's stage, the counting sentences stage 3 wrote): "Let P be what counts as paid toward a price, in its unit. A flat price A is paid when P is at least A. A price `{ amount: a, per: p }` at quantity q in `per`'s unit (under `band`, what was accepted inside it) is paid when P times p's value is at least a's value times q's value. A price on `lines` is paid when P is at least the exact sum of its lines' prices. No fold rounds, and no test divides: each test compares products of signed numbers. A `per` of zero, a quantity not in `per`'s unit, or a figure not yet fixed has no total, and such a price is never paid. Where a total is finer than anything payable, only the payee's word closes the gap: her `covers`, her signal, or the `step` her price names."
- **Replaces:** `03-amounts.md` F7, the sentences on what covers a price and "(a per-unit price with no quantity in `per`'s unit, or a `per` of zero)".
- **Answers:** `promise_stage` `paid`, `stage`; `terms_total`.
- **World:** (1) Mama M1 offers mandazi at 7 per 3; Leila takes 3 and pays 5. Expect not paid (15 < 21). (2) The same, paid 7: paid.
- **From:** 04 R4, R7.

### 3e-5. What a fold prints
- **Reads** (`encoding.md`, A sum, in place of "It has no cap … Nothing is rounded: …"): "A figure a fold prints is the exact value of signed numbers: the shortest decimal text, of any length, where it has one; else `n/d`, two whole numbers in lowest terms, which no block may sign. A block that states a figure states a decimal of its signer's choosing."
- **Replaces:** `03-amounts.md` E2, the sentences after "printed in one form so two builds agree" from "It has no cap" to its end; the core's 40-place cap (`decimal.rs` `div`).
- **Answers:** `terms_total`, `uncovered`: a total of 41 places prints (today null on the core, row 27); 10 per 3 at 2 prints `20/3`.
- **World:** Mama's price 10 per 3; Leila takes 2: `terms_total` `20/3`.
- **From:** 04 R5.

### 3e-6. Pieces a payment pays for
- **Reads** (`folds.md`, `uncovered`, the per-unit clause): "Under a price `{ amount: a, per: p }`, the pieces the payments pay for are P times p over a, exact, in `per`'s unit, and they are taken only from what moved in that same unit. Under a price of zero, all that moved is paid for."
- **Replaces:** `03-amounts.md` F11 `uncovered`, "(under a per-unit price, what was paid over the price per unit …)".
- **Answers:** `uncovered.from` in four splits (rows 23 to 26): 7 per 3, took 3, paid 5: `from` `[{ line: null, amount: "6/7" }]` (3 less 15/7; today the core 3, the oracle null); 0 per 3, took 3: `from` 0; 120 per kg, took 2,500 g, paid 300: `from` 2500 g (today the core 2497.5); 10 per 3, took 7, paid 24: `from` 0.
- **World:** Harry's price 120 GBP per kg; Sam takes 2,500 g; pays 300. Expect `uncovered.from` 2500 g.
- **From:** 04 R6; seat 27.

### 3e-7. `step`
- **Reads** (`promises.md`, Terms; `protocol.json` an optional price term `step`): "`step`: under a price, the least payable amount its signers take, an amount in the price's unit. The total is the least whole number of steps at or above the exact figure. With no `step`, the total is exact."
- **Replaces:** the 1.8 shared ground row 39's "A signed `step` waits in Open"; nothing built.
- **Answers:** `terms_total`, `paid` on a price that states `step` (new bytes; an old reader reads a different total on these blocks, so it lands in the set).
- **World:** (1) Mama M1, 3 mandazi for KSh 10, `step` 1 KES. (2) Leila takes 2: total 7. (3) Leila pays 7: paid. Harry's tonne at £285.50, 23.457 t, `step` 0.01: total £6,696.98.
- **From:** 04 R8; T1-30 (tier-1 set).

### 3e-8. Where it came, and one account word with a list of places
- **Reads** (`promises.md`, Where to pay me): "A word that a payment came may name, in `refs.derives_from`, the account word of the one it speaks for, and state in `state.destination` one place that word lists. It then says the payment reached that place. A word that names none says only that it came. A pointer to a word that is not the payee's, or is not her head where it is signed, or a place that word does not list, names no place. A `received` by a signer her account word names in `by` counts toward her price only where it names that account word and the place." (The `account` base schema): "An account word states `destinations: [{ destination, by }]`. Of one signer's account words the head is the one no other of hers has in its causal past. A new word replaces the old, and two heads that do not see each other name none." "Money" leaves the schema's text ("where money to the signer goes").
- **Replaces:** the `account` schema in `spec/schemas/schemas.json` (a new schema id, then `published.json`); `03-amounts.md` T13's "the signal of a signer her account word names" reading.
- **Answers:** `account_of` (one head, a list); `promise_stage` `paid` from a till service's word: counts only naming her account word and place (today counts by inference).
- **World:** (1) Mama M0, account word AW1: stall (by Mama), till 123456 (by Soko). (2) Ben pays KSh 600; Soko S1 `received` 600 naming AW1 and till 123456. Expect counts 600. (3) Soko S2 `received` 600 naming no account word: counts nothing. (4) A thief's AW2 of Mama's key, a later head: `account_of` lists only AW2's places.
- **From:** 04 R9 to R11, R14 (spelling chosen, 2026-11-16).

### 3e-9. No sum across, and "money"
- **Reads** (`folds.md`): "No fold sums payments across deals or places." (Normative text): "Money" appears only in a title or a quotation.
- **Replaces:** `03-amounts.md` E2's "Money is an amount" stays as a title; every other normative "money" is reworded.
- **Answers:** text only.
- **World:** none.
- **From:** 04 R13, R14.

---

## Count

| Layer | Changes |
|---|---|
| 3a Bytes | 13 |
| 3b Place and order | 13 |
| 3c Holds | 7 |
| 3d Keys and time | 18 |
| 3e Amounts | 9 |
| **All** | **60** |

Not in this set, because they are stage 4 to 7 text: part 03's R7 (a grant's room) and R12, R9, R10, R13; part 04's R12 (a circle's account word); part 06's R10 (a period on a voice; built in stage 4); D3, D6, D13, D14; part 09's `draw` field on `gives`. They change no built answer and are written in step 4.

---

## What building changed (3a and 3b, 2026-11-16)

The two builders' guesses were laid side by side: 25 questions (the oracle's 3a-N1 to N10 and 3b-N1 to N7, the core's 16 marks, joined where they asked the same thing). 8 were built the same, 12 differently, and on 5 the text was silent. The random-world test then found 9 more. Each answer below is now written in the entry it names (and in `00-shared.md` where it is a shared meaning), and both engines follow it.

| Question | Choice | Sentence added (where) |
|---|---|---|
| A header link that is not one id (a list, a number, a stray character) | `chain`; an id in a hash name the reader does not know waits | 3a-1 (3); 00-shared, Valid |
| Which of `bad_hash` and `bad_signature` a forged block gets | the id first, then the key over the header that names that id; never both. A genesis: unknown suite, then the id, then its key | 3a-1 (5) |
| A float or a whole number past 2^53 − 1 inside a block | bytes that are not canonical (`not_canonical`), never a value code | 3a-1 (2), 3a-6; 00-shared, Valid |
| What "an audience it can read" is | it holds the body and every commitment is in a hash name it knows; a sealed copy is passed to the one it was pushed for whatever the node holds (the host's relay test) | 3a-5 |
| Push limits (SILENT 12, owner's ruling) | 8 MiB and 1024 messages | byte-name table; 3a-8; `protocol.json` |
| A push with nothing to say in `for` | `for` is left out; any other key refuses the whole push | 3a-8 |
| `refused` on a push that is read | left out (the one form has no null) | 3a-9 |
| One hash twice, no copy valid | one refusal for the id, naming the copy with the lowest signature | 3a-8 |
| A `p256` key not spelled `04` | no key: the grammar in `protocol.json` states `04`; `suite_of_key` is null | 3a-10; SILENT 27 settled |
| `pad` that is not spaces | opens nothing (`shape`) (same in both) | 3a-11 |
| How deep a fold walks (SILENT 9, owner's ruling) | no fixed depth; a reader that stops says `not_shown` with `{ stopped: "depth" }`; one that goes on answers fully | 3a-12; 00-shared rule 11 |
| A rule set the core does not run | every stated id is `unknown_rules`; a non-id is `grammar` (same in both) | 3a-13 |
| A block the reader cannot judge, held with its body | on no line; it hides each thing its refs name | 3a-4; 00-shared, Read whole |
| Which key grant starts a key's line when two bring it in | the one the others have in their past; two apart start none | 3b-1; 00-shared, In its place |
| A block whose `prev` is foreign, or a later bringer | on no line: `not_on_line`, no block of a pair; `out_of_place` only for a wrong `seq`; place is read before whose the measure is | 3b-1 (World B now names its lot and its `updates`) |
| Whether a later draw counts an amount whose landing draw it has not seen | no: only where the draw that brought it is in its past, whenever her yes came | 3b-3; 00-shared, Read once (the 3b-9 story now has A3 after H2) |
| Allocations apart | read in rounds of causal minima; a round over what is left: none takes; one signer's apart allocations are `forks` | 3b-4 |
| First on a clock | a receipt is before another where the other has it in its past; a line with a receipt of one and none of the other shows the one first | 3b-4 (World B needs the let-go's own receipt) |
| How a pair is decided | read together; draws that take nothing alone are read as any draw; a draw without her yes takes nothing (`pair`) and changes nothing; one with her yes alone is read alone; two with her yes that do not fit: unresolved, listed in `pair` | 3b-5; 00-shared rule 4 |
| A twin's row | listed with the answer of the draw it repeats, counted once | 3b-5; 00-shared, Pair |
| A draw of a pair its receiver gave up | freed, holds nothing against the others; a pair-draw's no frees even after her yes | 3b-5 |
| A make that is a later block of a fork | read as any draw | 3b-2 (as written) |
| What a pair that did not fit keeps from a new key | the sum of its draws with her yes; the new key's blocks are read after the old key's | 3b-6 |
| What a block held and not read could name | each id in its refs but `author`, `prev`, `key`, `after` | 3b-7; 00-shared, Read whole |
| Where a header-only block hides | on the line of every owner of the measure after her start, a receiver's included; a held header message is a header in every fold, `pot` included | 3b-7 |
| Which accept starts her line | her yes signed by the receiving voice's key; of several, the earliest; two apart, none | 3b-8; 00-shared, One start |
| A transfer to its own giver; an id with no list | starts on the line of the key it is handed to; a circle: its one yes, until stage 6 | 3b-8 |
| `pair` when there is none | `pair: []` on every ownership answer | 3b-9 |
| What `read` names | the thing, each owner's start, each draw, each yes that landed one (not the blocks walked) | 3b-9; 00-shared, `read` |
| A stranger's draw whose own line lacks a block | `not_owner`: one who owns none of the measure anywhere | 3b-9; 00-shared |
| `named_by`: entries, `own`, the yeses left out | one per block, first ref in byte order (never `after`); `own` needs a speaker; each receiver's own accepted answer to a listed draw is left out; `pair` means one of a pair | 3b-10 |
| `passes` in `identity_state` | on every voice, `true` or `false` | 3b-11 |
| A header held beside the body of the same block | the body is the block; a header never takes its place | 3b-7 |
| Who owns an output whose input's answer is not shown | not shown, with the input's `lacks` | 3b-9 |
| A draw signed before the start of her line for the measure | `not_owner` where she owns none of it where it stands, `not_on_line` only where she owns some on another line or none | 3b-9 (decision [S3-6] of 1.8, kept) |
| 3b-13 (owner's ruling) | not built in this half; marked in both engines for after the random-world test | 3b-13 |

Outside the files this step may touch: the audit's worlds (`test/audit/`) and one host test (`host/test/postgres/node.test.js`, the float block) sign deliberately bad blocks with `sign`, which 3a-3 now refuses; each needs the hand signer the fuzz worlds now use (`tools/fuzz/lib18.cjs`, `handSign`). The vectors are not regenerated: 3a-1 moves codes from `valid` to `read`, so `spec/fuzz-vectors.json` holds 13 reproducers the core no longer gives (11 before this step) until the set lands with its vectors regenerated once.

Left for the second half (3c, 3d, 3e and stages 4 to 7): Rule A for draws that are no pair (a no after her yes), clocks read by dates (`fold/clock.rs` `received_at`, `release.rs`), the `keepers` rename, and the random-world findings listed in `tools/fuzz/known.json` under "3c/3d/3e" names.

## What building changed (3c, 3d and 3e, 2026-11-19)

The two builders' guesses were laid side by side: 24 questions (the oracle's 15 marks and the core's 14, joined where they asked the same thing). 7 were built the same, 7 differently, and on 10 the text was silent (one of them, 3d-16, is stage 5's by the owner's ruling). The stories of both halves were then asked of both engines (`spec/oracle/core-set-a/export.cjs`, `core-set-b/export.cjs`; `tests/core_set_a.rs`, `core_set_b.rs`), and the random-world test found more. Each answer below is now written in the entry it names (and in `00-shared.md` where it is a shared meaning), and both engines follow it.

| Question | Choice | Sentence added (where) |
|---|---|---|
| Which promise is an offer that holds (oracle [3c-1], core [3c-1a]) | the giver's own first promise to a named receiver other than himself, no status, answering and updating nothing; it holds `terms.quantity` in the instance's unit, else all; a later block of a fork is read as any draw | 3c-1; 00-shared, Draw |
| A yes to an order (built by neither) | holds nothing: the order is the buyer's word, and the hold starts at the seller's own word that names the instance (his offer or his transfer). Built as a draw, it moved every 3b pair onto the line of the accepts. **For the owner to confirm** | 3c-1; 00-shared, Draw |
| An offer a transfer `for` its deal performs (core [3c-2a]: freed; oracle: landed) | the transfer takes the hold over and it is counted once; the offer is held while the transfer is, and landed where it lands | 3c-2; 00-shared, Lands |
| Her no after her yes (core [3c-3a]) | as built: it frees unless the draw landed at that yes | 3c-3 (as written) |
| Accepting a payment toward the price (oracle [3c-4]) | his `accepted` answer to a transfer `for` the deal, or his `received` for it (same in both) | 3c-4 (as written) |
| Which conditions can die (oracle [3c-5], core [3c-5a]) | the same answers in every world tried | 3c-5 (as written) |
| A draw held on a condition that has not held (silent; met once no reader's clock fills it) | listed in `waiting`, `on: condition` | 3c-6; 00-shared, Waiting |
| A receipt with no cutoff before it; a third argument to `ownership` (core [3c-6a], [3c-6c]) | as built (no world tried disagrees) | 3c-6 (as written) |
| `to_come_back`'s field (oracle [3c-7]) | `{ to_come: [...] }`, by the rename rule | 3c-7 |
| A late accept; an unanswered offer and its giver's stop (oracle [3d-2]) | same: a late accept is no yes and waits on his next word; his end with no yes before it frees the offer at once | 3d-2 (as written) |
| A block with no `at` under a grant with `until` | not in time: under no grant (the core read it as in time) | 3d-2 (as written) |
| A cutoff with no `at` (oracle [3d-4]: closes nothing; core [3d-4a]: never early) | never early: a missing `at` reads as a late one | 3d-4; 00-shared, Cutoff |
| A span cutoff (core [3d-4b/c]; owner's ruling) | `when` the span itself, a duration at least the word's (durations compared, never added to a date), running from the receipt in `refs.derives_from`; `protocol.json` `kind_fields.observe.cutoff` is `when:time_or_duration!` | 3d-4; 00-shared, Cutoff |
| A span of `PT0S` on a clock | runs when signed (the core waited on a cutoff) | 3d-18; 00-shared, `wait` and `reach` |
| Signing twice at a zero wait (owner's ruling) | gone: a word at `PT0S` stands when signed | 3d-18 (new); 00-shared rule 10 |
| 3d-7: a door op that takes the relying block | not needed: `stands` of the relying block reads each key grant it names for its meaning within its own causal past (built in the core) | 3d-7; 00-shared, Clocks |
| 3d-8: `counted_to` and a block joined to another's | it cuts a lone block only; a joined block passes where her yes there has not seen the end (the core cut it) | 3d-8 (as written) |
| `counted_to` naming a block of the voice above; naming a person's id (oracle [3d-8], core [3d-8a]) | as built, no world tried disagrees | 3d-8 (as written) |
| A close and her open draws (oracle [3d-15]; core silent) | freed by the close where no yes of its receiver is in the close's causal past | 3d-15; 00-shared, A close |
| A key's own key grant to another suite (3d-12, not built in the core) | never stands, each key's suite read from its own spelling; to a believing reader a suite move is an end read as any end (the core's cut by causal order alone is gone) | 3d-12; 00-shared rule 10 |
| A hidden voice that names her genesis key | her genesis shows its key: listed in `identity_state.keys` | 3d-12; 00-shared, A hidden voice |
| `{ key_hash, suite }` | `shape`: `protocol.json` `shapes.voice.key_hash` loses `suite` | 3d-12 (as written) |
| A genesis that states her list (3d-17, not built in the core) | built: her list read from the genesis, each `key` voice brought in by it; a genesis whose key is no `key` voice of it is `shape` | 3d-17 (as written) |
| 3d-14 kin's own voice; "placed by her first voice" (oracle [3d-14], core [3d-14a]) | as built, no world tried disagrees | 3d-14 (as written) |
| 3d-16 (oracle [3d-16]) | stage 5 (owner's ruling): the oracle's will reading is switched off (`STAGE5_WILLS`), the successor profile stays in both until then | 3d-16 |
| `paid` when nothing counts (oracle [3e-1]: 0) | null until a block counts | 3e-1; 00-shared |
| A draw on another instance that she answers (core: nothing) | her word counts it at what she said; landing alone never | 3e-1; 00-shared |
| The very thing named, landing by the deal's own yes | it lands where signed where her own first promise of the deal, accepted by the giver, is in its past, and counts | 3e-1 (World updated) |
| The price's `of` not held (core [3e-1a]) | `not_shown`, lacking it; and a stage whose answer turns on an ownership this reader is not shown is not shown | 3e-1 (as written) |
| Her accept stating an amount of a block that states none | counts what she states | 3e-1 (as written) |
| `unanswered`; her `received` signed by a block of a fork | a block her `received` answers, or her order in hand counts, is not unanswered; her `received` binds her, a block of a fork too (Rule B) | 3e-2 |
| The order's quantity as a cap; `step` in another unit; `by` (oracle [3e-3], [3e-7], [3e-8]; core [3e-3a], [3e-7a]) | same in both | 3e-3, 3e-7, 3e-8 (as written) |
| `named_by` and her order (found by the 3a/3b stories with `deal()` an order) | each yes that landed a listed draw (in `read`) is left out, her order included | 3b-10 |
| The order of `lacks` and of `waiting` | ids first, then `{ author, key, seq }` by canonical text; `waiting` by block, then `on` | 00-shared, `not_shown` |
| An offer's giver ends it after her yes, the two apart (audit, case 4) | his end frees it only where she saw the end before any yes; at once only while no yes answers it | 3d-2 (as written) |
| Her no after her yes to an offer (audit, case 11) | frees it: an offer never lands at its yes (Rule A) | 3c-3 (as written) |
| A bare sensor `reading` in a view (audit, cases 3 and 12) | never holds, in every reading too | 3c-5 (as written) |
| A block at or before an end's `counted_to` (audit, k1 lost phone); a lone one after it (k1 story 1) | that end is no end for the first: it counts; the second is off her line in `signed_by_author` too, not only in `stands` | 3d-8 (question 5, as written) |
| The join under a clock (audit, k1 thief) | the receipts must be in a joined block's own past; the joined blocks are those it names as her yes and those of others that name it, never a clock's receipt or cutoff | 3d-9 (as written) |
| A second signing her key made after an end of it (audit, k1 stolen phone) | counts for nothing, so it sets nothing aside | 3d-18 |
| An output of a make with no inputs (a mint) | her line starts at the make | 3b-9 (`read`) |

Outside the files this step may touch: `sdk/javascript/src/identity.cjs` still spells the genesis and key-grant option `keepers` (the core's door takes `clocks`), so a genesis made through the JS SDK with a reach is refused; `test/audit/k1-keys.cjs` asks the core's door directly. The stage 1 stories in `test/audit/k1-stories/` that sign a cutoff by hand still state a time for a wait or a reach; they now close nothing in both engines (parity holds), and are rewritten as span cutoffs with stage 4. The audit's parity is 0 on every op but in one world, the stage 1 story 11 (`k1 story 11`: a death recorded by witnesses and a successor's close), where `backed`, `speaks_for`, `identity_state` and `key_timeline` still differ: it is the successor profile, which 3d-16 deletes, and lands with stage 5. The audit's other checks that fail (stage 1 and 2 "answers the text gives", rule 2, base schemas) assert 1.8 answers and were not run since the first half (the audit did not build then). The vectors are not regenerated: they land with the set.
