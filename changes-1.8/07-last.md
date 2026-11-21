# FoodBlock 1.8, stage 7: last

Uses the words of `00-shared.md` with its meanings and defines none of them again. Written as if stages 0 to 6 have landed: it reads their texts (`00-clear-the-ground.md` to `06-circles.md`) for what will be there. Every passage is named by its first and last words; line numbers were read on 2026-11-11, mid stage 2, and are only a guide. Counts marked **measured** were taken by `stage7-scratch/counts.cjs` and `top.cjs` (in `~/foodx/research/2026-11-11-foodblock-1.7-review/stage7-scratch/`) on the tree as it stood, then moved by each later stage's own stated adds and deletes; everything else is marked **estimate**.

---

## 1. What this stage does

1. **Who learns what.** The rest of `privacy.md`: a sealed block, header and all, goes only to its audience; three grains of keeping apart; a carrier is told only the id a copy is for, and its silence is its own signed refrain; a sealed block can be handed on to a judge; invariant 17 made true. `terms.show`, `withheld`, `holds` and `speaks_for` in discovery go. What is not hidden is said, and three mechanisms are refused by name.
2. **The rule set named by hash.** A manifest of the normative files, hashed. `valid` is the sound part (one network); everything else is the read part (each reader's choice). A node lists a rule set only when it runs a build made from it. A block may state the rule set it means. A community types its own fields in its own schema. `version`, "year zero", the lock and the listed profiles' privilege go.
3. **The test, and the cut.** One test for "is this protocol?", in core.md. Applied to everything 1.8 has: 102 door ops become 38 protocol ops, 29 readings, 12 library tools and 23 of a node's own business. A builder conforms by passing the cases of the ops it answers. A "dealer" peer joins the table.
4. **Tidying.** The machine lock mended and moved out; the CBOR table's rule; dangling pointers; `protocol.md`, `THREAT-MODEL.md`, `NECESSITY.md` and `tools/necessity.cjs` brought to 1.8; the invariants re-issued 1 to 32.
5. **One addition that changes no answer:** `mount(blocks, into?)` and `unmount(mount)`, so a caller keeps a judged store between calls.

This stage adds three things: the test, the rule set by hash (with `state.rule_set`), and the mount pair. Everything else here removes, moves or rewords.

---

## 2. The jobs

### Job A. Who learns what

**Why.** 1.7 hid what a deal says and published that it happened: any unsigned pull got every sealed block's header, and a rival ranked the true pairs of traders first, 30 of 30 (b2/16, run). The cause was one chain for two audiences. Stage 2 already cut it from `valid` (no `prev` is read), so nothing now forces a sealed header on anyone. This job says so, and says plainly what is still seen.

#### A1. `spec/modules/privacy.md`

**Line 3**, "Commitments, audience, sealed blocks, envelopes and the public header. A core node writes public blocks only and needs none of this page." becomes: "What stays public, who learns what, commitments, audience, sealed blocks, handing on, envelopes and the header. A core node writes public blocks only and needs only What stays public."

**Add after line 3, whole, a new first section** (rule 8 of 00-shared, word for word, then what it means for a line):

> ## What stays public
>
> One key writes public blocks or sealed blocks, never both: a device, or her AI, that writes both holds two keys. A sealed block, header and all, goes only to its audience, and by handing on to whom they choose. Nothing need be public for two people who know each other to deal. What must be shown is a list of who must be shown: a word with an open set of reliers (an open offer, an open grant, a let-go, a kind, a schema, a rule set named by hash, an address) is public or reaches only those it is handed to; a counted line is shown whole, as bodies, to everyone who relies on it; the pieces of a signer go to whoever must know who signed. A carrier sees who wrote, for whom, how big and when; a keeper sees what she is sent.
>
> No check refuses a key that writes both (`valid` reads no `prev`). The cost falls on its signer: a line that holds a sealed block is not read whole by anyone outside that block's audience (folds.md, A line), so every public word on it that a fold reads along the line is `not_shown` to a stranger. A thing's id in a public block ties together every public block that names it: public provenance and a hidden supplier are opposites, and she chooses for each product.
>
> Ground: what I do not send, no one learns from me, and what you signed you will not tell, you may not (Rothbard: a promise of silence binds only as a signed word; nothing fills the silence of one who signed none).

**Line 9**, "**The author may commit any value in signed content.** ... An `observe` of kind `erase` asks nodes to do so (profiles/erasure.md)." Change only "Erasing deletes value and salt: the block still verifies and the hash can no longer be linked to the person." to: "Erasing, at the node that erases, deletes value and salt there: the block still verifies, and that node can no longer link the hash to the value. Each recipient that was sent the opening holds it still." (The old sentence claimed what no node can make true of another's disk.)

**Line 12, delete whole**: "- **Leaving the subject out is marked, never hidden.** An author may leave out of the audience ... A block without `withheld` claims nothing about who else saw it." Nothing true is lost: `withheld` was the author's unchecked claim, shown to every carrier, that someone the block is about was not told; with it gone every block says what its last sentence already said of most, nothing about who else saw it.

**Line 18, the Sealing section**, "A private block's body is encrypted to its audience (Envelope). ... is a node's promise (nodes.md)." Replace "The node serving a sealed copy knows who it is for; nobody else does." with "Who knows whom a copy is for is said in invariant 17."

**Lines 20 to 24, the section "## Showing a deal", delete whole** (from "A deal is its two sides'. Each holds its own copy" to "the term makes them no more true."). Put in its place:

> ## Showing a deal
>
> A deal is its two sides'. Each holds its own copy and may show what it holds; silence is no promise not to show. A side who wants the other's silence asks for a refrain (promises.md, Refrain), which may name what is kept: the terms, or that the two deal at all.

Nothing true is lost: `terms.show` granted a permission where nothing forbade, and so read as "secret unless listed", a default the protocol says it has none of (b2/16 row 8).

**Line 28, The public header, first sentence**: "plus `key` when the block has `refs.key`, and `withheld: true` or `skip: true` when the block says so" becomes "plus `key` when the block has `refs.key`, and `skip: true` when the block says so". **Line 32**: "(`hash`, `author`, `key`, `seq`, `prev`, `skip`, `withheld`; ..." loses `, `withheld``. **Line 36**: "(the object itself, with `withheld` or `skip` when present, and no other key)" becomes "(the object itself, with `skip` when present, and no other key)". The heading "## The public header" becomes "## The header" (it is public only for a public block).

**Add after line 30** ("**A sealed block is a block held by its header.** ... not read by a reader outside its audience."):

> **Who is sent a sealed block.** A sealed block goes, header and all, to those it is sealed to and to whom they hand it on. It goes to no one else by any rule of this protocol. The header lets one who cannot open the body check who signed it: a carrier before it keeps a copy, a reader handed a copy. A key's sealed line is seen, as headers, by those it seals to: they learn how many blocks it wrote (its `seq`; a skip blurs it), never to whom.

**Add a new section after "## Sealed messages"** (line 36):

> ## Handing on
>
> Whoever holds an opened sealed block may hand it on: the same header and signature, an envelope of its own making to the reader it chooses, and the reveals it holds. It is the same block (one id). The reader checks it as any sealed copy. A reveal that opens an audience commitment to the hander's id shows the block was sealed to the hander. The audience the block states does not change: it is the author's word on whom she meant, and the envelopes are what was done. So a side puts a sealed deal before the judge both named without the other's help, and without telling any node in the clear who the recipient was.

**Add a new section before "## Invariants"**:

> ## Keeping apart
>
> Three grains, each made of blocks that exist. None is chosen for her.
>
> | Grain | What she signs | A stranger learns | Each counterparty learns | A carrier learns |
> |---|---|---|---|---|
> | One sealing key for all | one key grant | nothing | how many sealed blocks the key wrote, and when, across all her dealing | that she wrote to that counterparty |
> | A key for one counterparty | a key grant adding a key under her sealing voice, sealed to that counterparty and herself (identity.md, A key under a voice) | nothing | only how many such key grants came before | that she wrote to that counterparty |
> | An identity for one counterparty | a genesis of its own, and a two-key link sealed to that counterparty | nothing | nothing of her other dealing | that an unnamed id wrote to an id |
>
> The first two keep one identity, so her grants, her line and what she owns are untouched; the third breaks her record into pieces on purpose, and a counterparty sees none of her history unless she shows the link.
>
> **What each one learns, in 1.8.** Three deals: Amara orders flour from Harry in **public** blocks; the same, **sealed** to the two of them; and **through a host**, where Mama Achieng has no key and her host signs a witness of her words.
>
> | Who | Public deal | Sealed deal | Through a host |
> |---|---|---|---|
> | The other side | everything, signed, for good | everything, signed, for good; how many commitments the audience holds; her `seq` on that key | everything; that she has no key; her handle and her host |
> | Her host (it carries her copies) | everything | who wrote, the id each copy is for, each copy's size, when, who pulled it; not the words | everything in the clear, and so does her phone carrier |
> | His host | everything | the same, for the copies it carries | what the witness shows; if sealed, author (the host), the id, size, time |
> | An index | everything | nothing, unless a side hands it on | the witness if public, with her handle; if sealed, nothing |
> | A stranger pulling | public blocks only | nothing; a gap in a door log's numbers shows only that something was taken | as an index |
> | A judge | everything | what a side hands on | what the host or Amara hands on |
> | A rival | price, lines, cadence | nothing from the protocol; whatever a carrier tells, unless it signed a refrain | if public, her handle; if sealed, nothing |
>
> **What is not hidden** (THREAT-MODEL.md): who connects to which node; how many blocks a node takes in (counts); when (timing). The machine that stores the bytes sees who wrote, for whom, how big and when. A sender who minds sizes pads her own plaintext; one who minds the network uses a link that hides it.

**Line 47, invariant 17**, "17. Nothing outside the audience can name a recipient." becomes:

> 32. A sealed block names no recipient: not in its signed bytes, not in its header, not in its envelope. Whom a copy is for is known to its author, to that recipient, to each carrier told so it could deliver, and to anyone who reads the link that carried it; a recipient also sees how many commitments the audience holds. No fold reads any of it.

(It is renumbered 32: Job D, the invariants.) Every clause is about bytes or is a plain fact; none binds a stranger's computer.

#### A2. `spec/modules/nodes.md`

- **Line 37**, "- An unsigned pull gets public blocks and the public headers of sealed ones. A signed pull also gets the copies sealed to the asker." becomes: "- An unsigned pull gets public blocks. A signed pull also gets each sealed block the node holds a copy of for the asker: its header, its signature and that copy. Nothing of a sealed block goes to any other asker, and for anyone else it matches no filter."
- **Push, stage 2's N10 first sentence** ("A sealed copy may say which of the receiving node's people it is for (`for`: `{ hash: [id] }`).") gains after it: "That id may be one made for this counterparty (privacy.md, Keeping apart). It is all a carrier is told. By carrying it also sees who wrote the block, the copy's size and when. A carrier owes silence on none of it unless it signed so."
- **Line 44**, "- **A sealed copy is kept only from its author:** from a signed push whose signer is the block's author. Any other push may bring the header but no copy." becomes: "- **A sealed copy is kept from a signed push.** A copy for a reader the push names is kept when the signer is the block's author, or, when it is not, under the node's admission rule for that signer (a copy handed on, privacy.md, Handing on). A handed-on copy never takes the place of the author's. An unsigned push brings no copy. A node sent an opened body as a plain message from anyone but its author keeps it as a copy for the reader the push names and serves it to no one else."
- **A host, the host's promise** (stage 2's N15 line list): add "that it tells no one what it carries (who wrote, whom a copy was for, how big, when), as a refrain with a stake and a judge (promises.md, Refrain), kept for a time it states". Add to Her address: "An address may be sealed: an address for one counterparty reaches only them."
- **Discovery, line 75**: `speaks_for` leaves the document (whether a node speaks for her is her own address block's word, which she may seal); `version` leaves it in Job B.
- **Finding** (stage 2's N19): add "A reader checks a public line it holds for gaps and pairs; a sealed line is checked by those it is sealed to, and a pair on it is seen only by one who holds both branches."

#### A3. Elsewhere

- `spec/modules/identity.md`, stage 1's paragraph "**One person, many keys.** She may use a different key with each counterparty ... Free keys let one person look like many (THREAT-MODEL.md)." Its first sentence becomes: "She may seal to each counterparty with a key of its own, a key under her sealing voice brought in by a key grant sealed to that counterparty and herself, or deal under an identity of its own and prove the link only to whom she chooses (privacy.md, Keeping apart)." The rest stays.
- `spec/modules/identity.md`, Her voices, add after the `key_hash` bullet the sentence stage 2 left (b2/18 choice 3): "A passkey shows its holder the site that asks, never the bytes: a passkey voice's signature is its key's word, never proof she saw what it signed (encoding.md, Passkeys). A wait on that voice gives a voice above time to say no."
- `spec/modules/promises.md`, Terms: delete `show` from the list "`{ price, quantity, ... fee_back, show, notice, deadline, fallback, waits_on }`" and delete the `show` bullet (line 37, "`show` is a sorted list of `from` and `to` ..." to its end). (Showing a deal, above, already points a side who wants silence to a refrain; stage 5's Refrain paragraph is not changed here.)
- `spec/modules/folds.md`, What each fold returns, line 143: delete the `show` output sentence. `spec/modules/encoding.md`, line 119: "with `key`, `skip` or `withheld` when the block has them" becomes "with `key` or `skip` when the block has them".
- `spec/transport.md`, **line 8**: delete "Header `FoodBlock-Hash: <hash>`." (a reader recomputes the id; the header only let a mail provider link envelopes).
- `spec/modules/consent.md`, lines 16 and 17 (the `keep` and `move` bullets): delete; line 12's "one of four machine tokens" becomes "`yes` or `stop`"; line 19's "outside these four" becomes "outside these two" and "may be only `stop`, `keep` or `move`, which only narrow" becomes "may be only `stop`, which only narrows". Where her record lives is her address block; keeping it is a term of her deal with a host. A KEEP re-opened a stranger's stopped offer (b2/17, run); nothing true is lost.
- `spec/profiles/custody.md`, With no key: add "A witness written public puts her handle where any index serves it; a host that promised her silence seals it."

#### A4. Refused, said once (THREAT-MODEL.md, What the protocol refuses; Job D)

- **Sealed sender.** Refused: a deal goes back and forth, and statistical disclosure links a hidden sender in a handful of messages; a key or identity for one counterparty gives the carrier the same unnamed sender with nothing new.
- **Mixnets and cover traffic.** Refused: they cost delay and constant traffic that a person paying per megabyte and often offline cannot pay; the protocol needs no transport, so anyone may carry blocks over one.
- **Private retrieval.** Refused: the node already knows which copy is hers (the push said `for`); it would hide what is not secret, at the cost of touching every byte for every question.

#### A5. `protocol.json`

R `terms` `show`; R `folds.promise_stage.output.show`; R `header_optional` `withheld` (becomes `["key","skip"]`: stage 2 built the header with it, in both engines, and this stage takes it out of both, the oracle's `asHeader` and `headerEntry`, the core's `header_bytes` and `header_entry`); R `fields.every` `withheld`; R `kind_fields` consent `word` values `keep`, `move` (`folds.consent.word_values` becomes `["yes","stop"]`); R `messages.discovery` `speaks_for`; C `door.ops.header.result` drops `withheld`; A `limits.message_bytes`: `1048576` (stage 2 left it here: one message, a block message or a sealed block, is at most this many bytes; a longer one is not read; it holds a 64 KB block sealed to several thousand recipients). Deleted, counted: 7 entries.

#### A6. Door ops

None added or removed. `header` loses `withheld`; `answer_pull` serves no sealed header to an asker it holds no copy for; `accept` keeps a handed-on copy under admission; `consent` reads two words.

---

### Job B. The rule set named by hash

**Why.** "1.7" named at least 18 different rule sets (b2/19, run); the lock was defined by itself and could not be checked; a newer field froze an older reader's view of an author for good. Stage 2 already made a newer block "not read", never refused. This job names what a reader runs.

#### B1. `spec/core.md`

**Line 3**, "Version 1.7, 2026-10-27. This page and canonical.md are enough to build a micro" becomes "This page and canonical.md are enough to build a micro" (the rest of the line stays). **Line 5, delete whole**: "There is no earlier version in the protocol: 1.6 is year zero and 1.7 adds to it, except the deletions CHANGELOG.md lists."

**Section 5, after the `state.audience` bullet** (line 100), add:

> - `state.rule_set` (optional, any block): the id of one rule set (section 11), its signer's word about which rules her block means. It is never read by `valid`: it changes no byte check, no id and no signature.

**Line 123**, delete from "or an optional profile in `protocol.json` (`optional_profiles`, its `fields` for that type and `every`) does." to "A profile's fields are always declared, known to the reader or not." Put: "does." (A profile's fields are declared by the profile's schema, named by the block, as anyone's are.)

**Section 11, lines 183 to 189, replace whole** (from "## 11. A signed block means tomorrow what it meant when it was signed" to "Until then any of it may change, and CHANGELOG.md says what did."):

> ## 11. Rule sets
>
> **A rule set is named by its hash**: the SHA-256, in lowercase hex, of the canonical JSON (canonical.md) of its manifest. A number such as "1.8" is a label for people; no reader reads it. Change one byte of a file the manifest names and it is another rule set.
>
> ```
> { "continues": [ <rule set id>, ... ],      sorted, may be []
>   "files": { "<path under spec/>": "<SHA-256 of the file's bytes>", ... },
>   "sound": "<SHA-256 of spec/sound.json's bytes>" }
> ```
>
> `files` names exactly `core.md`, `canonical.md`, each file of `modules/` but `nodes.md` (a convention), `protocol.json`, `sound.json` and `vectors.json`, and nothing else. The manifest is published beside them as `spec/rule-set.json`.
>
> **The sound part and the read part.** `valid` (section 8, checks 1 to 6, with canonical.md) is the **sound** part: who said these bytes. Its cases are `sound.json`. Two rule sets whose `sound` is the same, or one of which continues the other's sound part (it adds only suites, so an `unknown_suite` wait becomes a verdict), are **one network**: each holds every block the other writes and passes it on. Everything else (`read`, every fold) is the **read** part, each reader's choice. A block that is valid and not read under every set a reader runs is held, not read (section 8).
>
> **Continues.** A rule set continues another when every block the earlier one reads gets the same answers under the later one, on every op of section 12. Its `continues` says so, and anyone checks it as far as the earlier set's cases reach, by running them. A set that changes one answer does not continue, and must not say it does.
>
> **What a block means.** A block that states `state.rule_set` is read under that set and no other: a reader that does not run it holds the block not read (`unknown_rules`). A deal is read under the rule set its first promise states, and an answer consents to it with the rest of the terms. A block that states none is read under each set its reader runs; where two give different answers, that reader has no answer for it, and says so. Nobody need state one: a reader that runs a set and its continuations gets one answer by the meaning of continues.
>
> **Who runs which.** A reader runs the rule sets it chooses. A node lists in its discovery document's `reads` a rule set only when it runs a build made from that set's files. Passing an earlier set's cases shows that a set continues it as far as the cases reach; it never makes a reader a reader of the later set, or of an earlier one it did not build from.
>
> **A fork** is another rule set. It is **clean** when it is one network with the others (the same sound part, or one that continues it): every node still holds and passes on every block, and each reads what its own sets read. A fork with another sound part is a **split**: another network. Nobody issues a rule set and nobody locks one.
>
> **What a signed block keeps.** Under any rule set that continues the one a block was read under, it keeps its bytes and id, whether it is valid, whom it speaks for, what it binds and who owns what it moves, and the rule beneath them all: only a signed word binds, and it binds only its signer, their name to its truth, what they pledged to its condition, their consent to another acting for them, never their body. What one can hand on is what one acquired or was handed; a body was never acquired, so no word hands it on (Kinsella, revising Rothbard).
>
> Ground: an idea is not property, so no one can own the rules or forbid a fork; a rule binds a signer only as the words she could read when she signed, so the name of the rules is the hash of those words.

**Typed fields with no one's leave. `spec/modules/things.md`, Schemas, line 25** (the `fields` bullet, "(`text`, `integer`, `amount`...)", as stage 3 left it): replace the bullet with:

> - `fields`: each field's name with its shape, written as `kind_fields` writes one (`protocol.json`): `field:shape`, the shape one of the words `protocol.json` names in `field_shape` and `grammar` (`text`, `hash`, `id`, `time`, `date`, `duration`, `decimal`, `amount`, `count`) or `in:` and a list; a trailing `!` asks for the field. A block of any type that names the schema and carries such a field in another shape, or lacks one marked `!`, is not read (`shape`, `required`: `read`'s codes; core.md, section 8). Any other value in `fields` is a hint for people and checks nothing: a field with no shape is pencil, and no plain code matches on it.

and add after "**A schema adds and never takes away.**" (stage 0's paragraph): "A shape it gives is checked by `read` and never by `valid`: a block that fails it is held, not read, never turned away." And at the end of the Schemas section: "So a community types its own fields in its own schema, named by hash, and asks no one. Its readers name the schema's hash; a look-alike with the same kind word and another hash is another schema."

**`spec/core.md`, section 3, the `kind_fields` sentence** (line 73 in 1.7; "`kind_fields` lists ...") becomes: "`kind_fields` lists only the kinds a protocol fold reads, in the grammar a schema's `fields` use (things.md, Schemas)."

#### B2. `spec/modules/nodes.md`

**Discovery, line 75**, `{ protocol: "foodblock", version, node, speaks_for, admission, endpoints: { pull, push, challenge }, log, signature }` becomes `{ protocol: "foodblock", sound, reads, node, admission, endpoints: { pull, push, challenge }, log, signature }`, and add: "`sound` is the hash of the sound part the node judges by; `reads` the rule sets it reads (core.md, section 11): it lists one only when it runs a build made from that set's files. An index that answers a fold names in its signed answer the rule set it read under (`reads`) and lists `lacks`; the answer is its own word."

**Line 61, the heading "## A node's promise" becomes "## A node's word"** (stage 2 left this rename), and its first sentence (line 63, "What a node does with a block beyond holding it and passing it on is its own signed word, binds it alone, and is never a protocol duty.") stays; delete from "Examples: its admission rule," to "Other pages list only the fields they add." and put: "Each such word is stated where it lives. The core fills none in: a call that asks the core for a node's answer states each choice." Every pointer "(nodes.md, A node's promise)" becomes "(nodes.md, A node's word)": core.md lines 163 and 165; nodes.md lines 3, 34, 36, 56, 67, 69; `profiles/addressing.md` 11, `custody.md` 3, `erasure.md` 5, `residency.md` 7, `short-form.md` 3; `protocol.json` 2028, 2039; `patterns/earnest.md` (moved by stage 5).

#### B3. `GOVERNANCE.md`

**Lines 13 to 17, "## How versions work", replace whole** (from "- **The current version (1.7) stays editable until the lock**" to "Every package carries one version, taken from `spec/protocol.json`."):

> ## How rule sets are named
>
> - **A rule set is named by its hash** (`spec/core.md`, section 11): the hash of a manifest of the normative files. "1.8" is a label. A change of one byte is a new rule set; a set that changes no answer of an earlier one says it continues it.
> - **A fork is another rule set.** It is clean when it keeps the same sound part (`valid`), so every node still holds every block; it is a split when it does not. Anyone may publish one with no leave.
> - **What FoodX releases.** FoodX lists below the rule sets it has released. It never changes a listed one; a change is a new hash. Who else has built or run a set is theirs to say. This is FoodX's promise and binds only FoodX.
> - A package carries its own package number; that is the package's business, not the protocol's.
>
> Released: none yet.

**Line 9**, "**The spec governs.** `spec/core.md` and `spec/modules/` are the protocol." becomes "**The spec governs.** The files `spec/rule-set.json` names are the protocol." **Line 21** (Anyone may fork), "That is a fact about bytes, not a membership rule: a fork that changes how blocks hash or verify writes blocks that the others cannot read, and a fork that keeps it writes blocks everyone can." becomes "That is a fact about bytes, not a membership rule: a fork that keeps the sound part is one network with the others (a clean fork), and one that changes it is another network (a split)."

#### B4. `protocol.json`

R `version`; R the text "year zero" (line 2, and `cbor.about`'s "At year zero the key table is reset: this is table 1", Job D); R `optional_profiles` (Job C); A `fields.every` `rule_set`; A `field_shape.rule_set`: `"hash"`; A `refusals.read` `unknown_rules` with A `refusals.codes.read.unknown_rules`: "the block states a rule_set this reader does not run: kept, not read (core.md, section 11)"; C `messages.discovery`: `["protocol","sound","reads","node","admission","endpoints","log","signature"]`. Deleted, counted: 3 (`version`, the year-zero text twice); `optional_profiles` is counted in Job C.

#### B5. Door ops

A `rule_set(files)` → `{ id, manifest }`: the manifest of section 11 and its id, from a map of path to bytes. It is library (a tool): the name is a fact anyone computes. C `read`: may give `unknown_rules`, with an optional `runs` argument (the ids of the rule sets this reader runs; default the one it is built from). `spec` (it returned the package's `protocol.json`): its answer gains `rule_set`, the id.

#### B6. What goes, counted

`version` in discovery and in `protocol.json`; "year zero" (core.md line 5, `protocol.md` line 3, `protocol.json` twice; also the line "Strict. Year zero" in the repository's `CLAUDE.md`, which the owner edits); the lock (core.md line 189, `GOVERNANCE.md` line 15); "A later version may add" as a law about the future (core.md line 185, now the checkable claim continues); "Every version's vectors stay in the suite" (line 187); the words/reading paragraph of line 187 (Job C replaces it); the listed profiles' power to declare fields (core.md line 123). Nine things; one section.

---

### Job C. The test, and the cut

#### C1. The test, stated once

**`spec/core.md`, section 10, line 161, replace the first paragraph** ("The protocol carries only what strangers must agree on with no boss: who said it, under what authority, to whom, with what consent, and how it settled. Drafts, beliefs, ... speaks for them.") with:

> **The test.** A rule is protocol only when (1) without it, two readers who hold the same blocks could answer differently one of four questions about a signed block: *who signed these bytes; whom does it speak for; what of whose does it bind to whom, and on what condition; who owns what it moved*; and (2) the people who rely on that answer are not all signers of one block that could name the rule instead. Everything else is a **reading** (computed from blocks; it changes none of the four answers; a node may compute it, and a deal may name the rule set it is in by hash), **library** (a tool or data a block carries or names by hash), or **a node's own business** (what a machine does with a block: store, send, seal, admit, forget, show).
>
> A stranger applies it in order: is it about what a machine does with a block, not what the block says? A node's own business. Delete it: can two readers with the same blocks now differ on who signed, whom it speaks for, what it binds or who owns? If not, a reading or library. If they can: could everyone who relies on the answer have signed one block that names it? Then a named reading; else protocol.
>
> How a deal settled is carried as signed facts (transfers, answers, a bench's word); a sum over them is a reading. Drafts, beliefs, goals, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

Ground: only a signed word binds, and only its signer; the four questions are the parts of that sentence. Clause 2 is "nobody rules by default": where everyone who relies on a rule could have chosen it by signing, a rule the spec fixes for them is a default.

**Section 12, new, after section 11** (it replaces the word/reading paragraph of 1.7's section 11):

> ## 12. What a builder implements
>
> A **word** is an output that answers one of the four questions of section 10; every other output is a reading. A reading a word needs is part of that word. No word reads a view, a profile, a pattern or a reader's clock; a time is read against another only on a clock she named (blocks.md, Time).
>
> **The protocol ops** are the door ops that answer a word, listed in `protocol.json` `door.protocol`. An implementation **conforms for an op** when it reproduces every case of that op in `sound.json` and `vectors.json`; it conforms when it does so for the ops it answers, and it says which. Passing the protocol ops is conforming. Readings (`spec/readings/`), library tools and a node's conventions (`spec/conventions.json`, transport.md) each have their own cases, which nobody must run.

**`spec/NECESSITY.md`'s Method** says the same test as a measure (D5).

#### C2. Where readings go

Readings, library and conventions leave the normative files whole, as text moved, not rewritten:

- **`spec/readings/README.md`** (new): "Not normative. Each reading is computed from blocks and changes none of the four answers (core.md, section 10). A node may compute any; a deal may name the rule set that holds one (core.md, section 11)." Then one file per group, holding the moved text: `deals.md` (folds.md A promise's stage's reading outputs, A pot, Releases, Views, the reading bullets of What each fold returns; promises.md Clearing, release, a message with a receipt, `gives`, the signer's word, a claim of invasion's view, invariants 33 to 36), `things.md` (folds.md Where a thing is now, `made_from`, `use_shown`, `shares_on`, `not_free_shown`; things.md Uses of a place, Truth, invariant 24), `circles.md` (`ways_in`, `circle_key`, ballots' `counted_in`), `consent.md` (the `consent` fold and invariant 20), `machines.md` (the lock reading and `fence_reading`, C6). (`worst_case` stays in authority.md, The worst case: a voice's cap reads its `at_most`, C3.) `spec/readings/readings.json` holds what `protocol.json` held for them: `views`, the reading folds, `repeat`, and their door entries.
- **`spec/conventions.json`** (new): `envelope`, `messages`, `local_discovery`, `cbor`, and the node ops' door entries. nodes.md, privacy.md's Sealing, Sealed messages and Envelope, encoding.md's compact form, and transport.md each open with: "A convention. It changes no word (core.md, section 10); two nodes that share it can talk."
- **`spec/profiles/`** keeps only a node's conventions: `short-form`, `custody`, `erasure`, `residency`, `addressing`, `rekeys`. Each opens "A node's word: binds only a node that publishes it." `attestations`, `tax-recall`, `adapters`, `tasks`, `ballots` and `foodblock-profile-epcis` move to `spec/patterns/` (stage 5's folder: a schema and a worked example, no rule). `successor`'s close rule and heirs move into `identity.md` (the rule decides whom a block speaks for and who owns, so it is protocol; no word reads an optional profile: 00-shared, row 109). This is the one passage of stage 1's built `identity.md` that this stage moves; the edit, exactly: in `identity.md`, before "## Invariants", add a section "## After a death" whose first line is "A person names who records her death and who acts for her after it." (`profiles/successor.md` line 3, less "Optional." and "A peer without this profile ends nothing at a close.") and whose body is `profiles/successor.md` lines 7 to 14, word for word as stage 1 wrote them (from "- **The witnesses are a voice.**" to "the heir takes every condition of the deal (promises.md, Owed)."), with "(identity.md, Her voices)" and "(identity.md, When a key grant stands)" shortened to "(Her voices)" and "(When a key grant stands)". Line 5 ("**Adds:** ...") is replaced by `protocol.json` `kinds` (below), which lists `successor` and `close`; `optional_profiles.successor.close_rule` moves to `folds.identity.close_rule`, unchanged. `profiles/successor.md` is deleted.
- **`spec/protocol.json`**: R `peers`, `modules`, `optional_profiles`, `machine_lock` (C6); `views`, `repeat` and the reading folds move to `readings.json`; `envelope`, `messages`, `local_discovery`, `cbor` move to `conventions.json`; A `door.protocol` (the 38 names of C3); A `kinds` (the kinds a protocol fold reads, closing the pointer at blocks.md line 9 that names a `kinds` list that never existed): `{ "grant": ["key","member","operator","referee","successor","stop"], "observe": ["receipt","cutoff","dropped","close","received","account","witness"], "thing": ["schema"] }`.

#### C3. The cut, door op by door op

102 door ops stand after stage 6 (**measured** 104 on the tree stage 2 left, `export_whole` among them; then stage 3 adds 1, stage 4 adds 4 and removes 5, stage 5 removes 3, stage 6 adds 2 and removes 1: each counted from the stage texts' door-op sections). P protocol; R a named reading; L library; N a node's own business.

| Op | Class | Why |
|---|---|---|
| `hash`, `id_of`, `header`, `strict_text` | P | who signed which bytes: the id and the signed header |
| `verify`, `suite_of_key`, `valid` | P | who signed: the sound part |
| `read`, `needs`, `schemas_from` | P | a word is read only from a block this reader reads |
| `key_hash`, `signed_by_author`, `stands`, `operators_of` | P | whom a key speaks for; whether a word stands; who answers for a machine |
| `key_timeline` | P | which keys spoke for her, and when each ended (the identity fold's `keys`) |
| `check_chain`, `fork_pairs`, `read_whole`, `past_of`, `sees` | P | a pair, a line read whole and the causal past decide what binds and what landed |
| `salted_hash` | P | an audience and a committed term are read only through it |
| `speaks_for`, `under_ok`, `backed`, `keeps_to`, `meter`, `lowest_offer` | P | whom a block speaks for and what a grant binds (sentence 4, decision 7) |
| `terms_total`, `add_duration`, `count_of` | P | a deal's total, a period's end and a count, read by the words above |
| `circle_state`, `circle_versions`, `members_then`, `row_holds` | P | who owns a circle's parts and whom a move `as` it speaks for |
| `ownership` | P | who owns what moved |
| `worst_case` | P | for `at_most` only, which a voice's cap reads to count a grant (`stands`); the rest of its read-back is a reading |
| `promise_stage` | P | for its words only (`accept`, `offer`, `sides`, `takers`, `quantity`, `forks`, `crossed`, `requests`, and the counts rule 10's "no more than owed" reads: `lines`' `moved`, what each side is still owed); its other outputs, `paid` and `uncovered` among them, are the reading of the same name: Due reads the payee's signal, never the sum (00-shared row 118) |
| `condition_holds` | P | for the seven protocol shapes, on held blocks and named clocks; no `now` (C5) |
| `next_link`, `due`, `repeat_occurrences` | R | when, by the reader's clock; binds no one |
| `promise_view`, `promise_views`, `ownership_view` | R | a view: the reader's clock |
| `where_now`, `shares_on`, `use_shown`, `not_free_shown`, `invasion_shown`, `made_from` | R | facts shown; no owner changes |
| `pot`, `owed_back`, `gives`, `account_of`, `fee_back`, `clearing_applied`, `ruling_releases`, `release_shown`, `listing_check`, `check_reads` | R | sums and lists over signed facts: how a deal settled, not who is bound |
| `reading_is_persons_claim`, `reading_condition_holds` | R | a model's or a device's reading; its condition is named (C5) |
| `consent` | R | a STOP binds no one: `offered` and `declined` bind no one either way |
| `ways_in` | R | decided below |
| `machine_lock`, `fence_reading` | R | whether a machine runs is its owner's kit (C6) |
| `circle_key` | R | a circle's sealing key: privacy, no word |
| `keypair`, `public_key_of`, `sign`, `passkey_challenge`, `passkey_signature` | L | strangers must verify alike, not sign alike |
| `merkle_root`, `merkle_proof`, `merkle_verify` | L | large content is data a block names |
| `scope_reading`, `base_fields`, `spec`, `backed_all` | L | a parse, a list, the package's own file, `backed` for many blocks at once |
| `wrap`, `unwrap`, `seal`, `open`, `open_copy`, `verify_message` | N | the envelope and the signed request: conventions |
| `cbor_encode`, `cbor_decode` | N | the compact form: a convention |
| `accept`, `answer_pull`, `push_answer`, `pull_request`, `strict_push`, `matches`, `log_shown`, `export_whole` | N | a node's intake, its pulls, its log and her export |
| `admission_refusals`, `is_stranger`, `residency_refusals`, `live_keys`, `waited_too_long` | N | whom a node lets in and how it stores |
| `short_code`, `code_matches` | N | the short form, a host's convention |

**38 protocol, 29 readings, 12 library, 23 a node's own business: 102.** Job B adds one library op (`rule_set`) and Job E two (`mount`, `unmount`): 105 in the door table, 15 of them library.

The `due` op reads the reader's clock and is a reading; Due as rule 10 reads it (in the causal past of the paying block) is part of `under_ok` and needs no op.

**`ways_in`, decided: a reading.** It changes none of the four answers: who may sign `as` a circle is `row_holds`', and who owns its parts is `circle_state`'s; `ways_in` only lists ways a person could come to count, for a stranger to weigh, and binds no one (00-shared, Circles). Its fold moves to `readings/circles.md` and `readings.json`; its 1.8 cases move beside it. `circle_state`'s `owners` keep `no_person`, which is a fact of the word.

#### C4. Everything else, sorted

| List (after stage 6) | Protocol | Reading | Library | Node |
|---|---|---|---|---|
| Folds (19) | `identity`, `chain`, `ownership`, `promise_stage` (its words), `circle_state`, `circle_versions`, `members_then`, `row_holds` (8) | `where_now`, `shares_on`, `use_shown`, `not_free_shown`, `invasion_shown`, `next_link`, `consent`, `release_shown`, `made_from`, `ways_in`, `machine_lock` (11) | | |
| Views (6) | `condition_holds` becomes part of the words that read it (no longer a view) | `promise_view`, `ownership_view`, `due`, `pot`, `reading_condition_holds` (5) | | |
| Terms (24; 23 with `show` gone) | `price`, `quantity`, `lines`, `until`, `condition`, `expires`, `refrain`, `keepers`, `personal`, `backing`, `deadline`, `fallback`, `waits_on` (13) | `pay_by`, `deliver_by`, `band`, `repeat`, `forfeit`, `fee_back` (6) | `needs`, `zone`, `conciliation`, `notice` (4) | |
| Condition shapes (11) | `accepted`, `deed`, `signal`, `opened`, `within`, `without`, `stopped` (7) | `settled`, `paid`, `ruled`, `reading` (4, C5) | | |
| Statuses (5) | `accepted`, `declined`, `stopped`, `resumed` | | `lifted` goes (C6) | |
| Stop kinds | `before`, `onward`, `occurrences` | | | |
| Circle moves | `sign`, `take`, `issue`, `admit`, `remove`, `change` | | | `rekey` (rekeys' convention) |
| Verbs | `updates`, `answers`, `confirms`, `defeats`, `for`, `derives_from` | | `same_as` (each reader decides) | |
| Fields | as `fields`, bar: | | `when`, `where`, `channel`, `marks`, `name`, `fence` (moves to the `machine` schema, C6) | |
| `refs` | all but: | | `for_whom`, `place` | |
| Shapes, `field_shape`, `grammar` | all a word reads | `split` | `where`, `bound`, `when`, `reveal`, `mark` | `short_code`, `hour`, `zone`, `rrule_part` |
| Suites | `std` | | `p256` (and its passkey form), `sm` (a reader lacking a row says `unknown_suite`: a wait) | |
| Refusal codes | block, read, fold | | | message |
| Profiles (13 after stage 5) | `successor`'s close (into identity.md) | `ballots`' `counted_in` | `attestations`, `tax-recall`, `adapters`, `tasks`, `foodblock-profile-epcis` (to patterns) | `short-form`, `custody`, `erasure`, `residency`, `addressing`, `rekeys` |
| Patterns (stage 5 and 6) | | | all, by definition | |

Terms, shapes and fields a reading or library uses stay in their closed lists: those lists are what `read` accepts, and a term two sides signed stays readable. The cut is in what a conformer must compute, not in what a block may carry. Only `show` (Job A) and the lock's fields (C6) leave.

The five calls b2/13 named as judgment (a backup referee's turn by receipts; circle versions; `stopped` onward and pauses; shares standing on a thing; `personal`) are kept as protocol. A stricter reader could move the first two; it is listed in section 7.

#### C5. Where a reading still reaches a word, after stages 0 to 6

Stages 3 to 6 rewrote ownership, the deal and the circle around one line and named clocks, but none touched the four condition shapes or the reader's clock in a word. So these edges still stand in the reference code (oracle `spec/oracle/fb.cjs`; Rust `sdk/rust/src/`; line numbers as 1.7 stood, from b2/13 and b3/19):

1. **`owner` reaches the settlement sum.** A conditioned transfer (`{ paid }`, `{ settled }`) lands only where the condition held, and the oracle's `conditionHolds1` calls `promiseViewBase` for the sum (`fb.cjs:5348`, `:5355`); the core does the same through `fold/things.rs:97` (it clones every held block per conditioned transfer) and `fold/tasks.rs:191`, `:211` (a second index for `settled` and `paid`). Untangle: `settled` and `paid` are named readings (00-shared, A named reading; row 107): a block whose condition names one is read only by a reader that runs a rule set holding that reading; any other holds it not read (`reading_not_run`). The payee's own word needs no reading: `{ signal: "paid", by: [payee], subject: deal }`. Remove the calls from `ownershipFold`, `conditionHolds1` and `fold/things.rs`; the sum stays in `readings/deals.md`.
2. **`owner` reaches a ruling's reading** (`ruledFor`, `fb.cjs:5353`; `fold/settle.rs`). `ruled` becomes a named reading the same way; a judge's word is a `signal` with `by` the judge (stage 5: a ruling moves no thing).
3. **`owner` reaches `profiles/tasks.md`** (`readingConditionHolds`, `fb.cjs:5364`; `fold/tasks.rs:188`). `reading` becomes a named reading; `tasks` is a pattern.
4. **`owner` reaches a reader's clock.** `ownership(instance, held, now?)` and `condition_holds(condition, blocks, now, at?)` still take `now`; `signal` reads `o.state.at <= now` (`fb.cjs:5384`). Under sentence 3 no word reads a reader's clock. Untangle: `ownership` and `condition_holds` lose `now` (`condition_holds` keeps stage 5's `at?`; stage 3 changes `ownership`'s result and leaves this argument here); a time in a protocol shape is read only on the clock its signers named (`within`, `without`) or from the signal's own place on the line; `ownership_view` and `promise_view` keep `now` as views.
5. **`owner` reached `profiles/successor.md`** (`yieldsToSuccessor`, `fb.cjs:4022`, called from `ownershipFold`). Untangled by C2: the close rule is identity.md's (row 109).

**What is left to untangle.** With the four shapes named readings and the close rule in identity.md, no rule is left to decide: what remains is code, and this stage does it. Remove the settlement sum, `ruledFor` and `readingConditionHolds` from `conditionHolds1` and `ownershipFold` (oracle) and from `fold/things.rs`, `fold/tasks.rs` and `fold/settle.rs` (core), each moved to the readings; take `now` out of `ownership` and `condition_holds`; point `yieldsToSuccessor` at identity.md's close. Code line numbers are as 1.7 stood and only a guide.

Stage 6's `ways_in` reaches no word (checked: `circle_state` and `row_holds` do not call it in either build's plan). The consent fold still feeds `promise_stage`'s stage 8 (`declined` on a STOP); the stage is a reading, so it reaches no word.

`protocol.json`: C `condition_shapes` stays eleven; A `condition_shapes_class`: `{ "protocol": ["accepted","deed","signal","opened","within","without","stopped"], "reading": ["settled","paid","ruled","reading"] }`; A `refusals.read` `reading_not_run` and `refusals.codes.read.reading_not_run`: "a condition names a reading this reader does not run: kept, not read; the payee's or the confirmer's signal needs none". `promises.md`, Conditions: stage 5 writes the paragraph Named readings and rewrites the passage's opening (05-deals.md, P8), so this stage adds no sentence there.

#### C6. The machine lock and the fence

The lock answers none of the four questions: whether a machine runs is what its owner's kit does with blocks. The mend (b2/19 3C) is said where it now lives.

- `spec/modules/authority.md`, **delete "## A machine lock" whole** (lines 98 to 112, from "A machine lock is a grant of kind `stop` that carries `state.how`" to "as for an envelope (A machine's envelope)."), and **"## A machine's fence" whole** (stage 4 kept it unchanged). (Line 11's "a lift of a machine lock" goes in stage 4, which rewrites that bullet: 04-grants.md, A6.) Line 140, Kinds: "`key`, `member`, `operator` (`protocol.json`; profiles add more), and `stop` with `how` (A machine lock)." becomes "`key`, `member`, `operator`, `referee`, `successor` and `stop` (`protocol.json`, `kinds`)." Delete "the maker's signed safe states" wherever it is left (it was defined nowhere).
- `spec/modules/blocks.md`, line 43, Signed twice: "or a machine lock" goes in stage 4, which edits Finality (04-grants.md, V7; 00-shared rule 13, row 111).
- **New `spec/patterns/machines.md`**, with the fence moved word for word from authority.md and this paragraph in place of the lock:

> **A machine lock** is a stop of a machine: a grant of kind `stop` whose `refs.subject` is the machine. It is the owner's word when it is backed by the machine's owner, as the ownership fold reads him in the lock's causal past: his own block, or one signed under a grant of his that covers the type `grant.stop` and that machine. It ends as anything ends: by its author's stop. The owner's grant may say who else may end a lock placed under it, and on what stake; where it says nothing, no one else does. Any other signer's stop of a machine is that signer's reading: shown, and locking nothing. A locked machine goes to its owner's safe state; the lock names none.

- The reading `machine_lock(machine, held)` (in `readings/machines.md`) answers `{ locked, locks, claimed }`: `locks` the stops backed by the owner that stand, `claimed` the others. **Deleted:** the fields `how`, `placer`, `safe` and `reach`; the status `lifted`; `state.checked`; the owner's stake rule; the `machine_lock` list in `protocol.json`; `fields.grant` `fence` (the base schema `machine` declares it). **The lock's `reach` is settled by deletion:** `reach` means only a voice's duration.

---

### Job D. Tidying

#### D1. The invariants, re-issued 1 to 32

41 numbers stand after stage 6 (1.7's 35, with stage 3's 38, stage 4's 39, stage 5's 40 to 43). Thirty-two are protocol and are renumbered in file order. The other nine stay beside their text, unnumbered, where that text goes.

| New | Old | File | | New | Old | File |
|---|---|---|---|---|---|---|
| 1 | 1 | core.md | | 17 | 9 | authority.md |
| 2 | 2 | core.md | | 18 | 10 | authority.md |
| 3 | 3 | core.md | | 19 | 23 | authority.md |
| 4 | 25 | core.md | | 20 | 39 | authority.md |
| 5 | 29 | core.md (moved from consent.md: it states `valid`) | | 21 | 27 | circles.md |
| 6 | 8 | identity.md | | 22 | 11 | promises.md |
| 7 | 19 | identity.md | | 23 | 12 | promises.md |
| 8 | 4 | folds.md | | 24 | 13 | promises.md |
| 9 | 5 | folds.md | | 25 | 14 | promises.md |
| 10 | 26 | folds.md | | 26 | 15 | promises.md |
| 11 | 31 | folds.md | | 27 | 22 | promises.md |
| 12 | 37 | folds.md | | 28 | 32 | promises.md |
| 13 | 38 | folds.md | | 29 | 40 | promises.md |
| 14 | 43 | folds.md | | 30 | 41 | promises.md |
| 15 | 6 | authority.md | | 31 | 42 | promises.md |
| 16 | 7 | authority.md | | 32 | 17 | privacy.md (rewritten, Job A) |

Old 13, 40 and 43 speak of a deal's stage, a reading, and stay numbered because each bounds a word: what binds only grows, only the bench lowers it, and no stage moves a thing (ownership never reads the stage).

**Leave the numbered list:** 18 (a node signs its answers: a node's word, nodes.md); 30 (a first ask off the network: a node's word, nodes.md); 28 (the passkey form: library, the `p256` row, encoding.md); 20 (consent follows the principal), 24 (a model's reading), 33, 34, 35 (a list, a check, a clearing) and 36 (a ruling releases a stake): readings, moved to `spec/readings/`. Each keeps its sentence, prefixed "Holds:" in place of a number. Every pointer "(invariant N)" in `spec/` is rewritten by this map; the vectors' `invariants: [n]` tags are retagged by it (metadata, no re-signing).

#### D2. The CBOR key table

**The rule** (`conventions.json` `cbor.keys_about`, replacing "At year zero the key table is reset: this is table 1"): "The table is made, never edited, by `tools/cbor-table.cjs` from `protocol.json`: positions 0 to 9 are `type`, `state`, `refs`, `author`, `prev`, `seq`, `at`, `audience`, `key`, `hash`; then every other name `protocol.json` lists for a block's `state`, `refs`, `terms`, `scope`, a line, a voice, a row, a shape or a kind field, once each, sorted by its UTF-8 bytes. A name a schema adds has no position: it is written as text. A rule set that continues this one appends a new name at the end and never moves or empties one." The table is part of `conventions.json`; its hash is not in the manifest (it is a convention), and a compact-form reader names the table it reads by that file's hash.

**Names removed by stages 0 to 7:** stage 0: `acts` (renamed `types`); stage 1: `recovery_key_hash`, `recovery_reach`, `custodian`, `replaces`, `recovery_key`, `recovery_suite`; stage 3: `money`, `minor`, `lot`, `shares`, `currency`, `issuer`, `decimals`; stage 4: `limit_commitment` (where listed; it is not in today's table); stage 6: `removal`; stage 7: `withheld`, `show` (not in today's table), and `how`, `placer`, `safe`, `checked` (none in today's table). **Names added:** stage 0: `types`; stage 1: `key_hash`, `reach`, `voices`, `key`, `shown_key`, `keepers`; stage 3: `inputs`; stage 4: `on`, `meter`, `draws`, `drawn`, `total`, `deadline`, `fallback`, `each`; stage 5: `waits_on`, `grace`, `by`, `side`; stage 6: `rules`, `move`, `parts`, `needed`; stage 7: `rule_set`. Today's table: 122 names, no holes (**measured**). Under the rule: about 125 (**estimate**: 122 less 15 removed that are present, plus 18 added that are absent; the script decides).

#### D3. Dangling pointers

Each pointer below names a section a stage text deletes or renames; each is repointed or deleted here (searched in `spec/` on 2026-11-11; stages 3 to 6 fix the ones in passages they own, and this list is what is left):

- **"(identity.md, Held keys)"**: consent.md line 9, nodes.md line 70, transport.md line 25: become "(identity.md, A person with no key)" (authority.md line 13 is stage 4's, A7).
- **"(identity.md, Rotation)"**: gone in stage 4 (authority.md line 53, A14) and stage 3 (folds.md line 76, F6). **"(identity.md, A will)"**: folds.md line 23 (the `recovery_shown` row) and its line 24 (`recovery_reach`): delete both rows; promises.md line 260, "A will fires only on a true condition...": becomes "A successor acts only once a counted close is in the block's past (identity.md, After a death)."
- **"recovery"**: folds.md line 30 ("A view of the recovery reach") and line 84 ("Recovery reach"): delete the clauses; encoding.md line 101, the heading "#### Recovery" becomes "#### A lost passkey"; `protocol.md` lines 12, 99, 114: gone with D4; THREAT-MODEL.md line 44: D4; `protocol.json` lines 2364, 2365, 2392, 2429 (CBOR names): gone with D2.
- **"custodian"**: core.md line 163, "What a node, custodian, index or author does" becomes "What a node, index or author does".
- **"Orderer"** (stage 3 deletes the section): promises.md lines 80 and 88 and `vouches.md` line 10 are stage 3's swaps; folds.md invariant 4's "its one orderer" is stage 3's rewrite. Check after stage 3 lands: no "Orderer" left.
- **"The cut" heading in authority.md** (line 51; stage 4 kept it as a one-line stub and repointed lines 5 and 45, stage 6 repointed circles.md): delete the heading and its body. `patterns/pools.md` line 28 becomes "(blocks.md, The cut)".
- **"(blocks.md, No clock)"**: attestations.md line 17 is stage 5's; check none is left elsewhere.
- **"Equivocation"** (nodes.md line 77 heading): stays (stage 2 kept it; it names the section on pairs).
- **`profiles/` pointers to moved files**: `profiles/tasks.md` (blocks.md line 7, folds.md line 26, promises.md lines 52 and 177), `profiles/ballots.md` (circles.md), `profiles/attestations.md`, `profiles/tax-recall.md`, `profiles/adapters.md`, `profiles/foodblock-profile-epcis.md`: become `patterns/...`; `profiles/successor.md` (promises.md Death, circles.md, folds.md): become "(identity.md, After a death)". A pointer from a protocol file into a pattern or a reading is only an example; any that a rule needs is a fault to report, not to keep.
- **"money" and "currency"** in canonical.md's examples (lines 54, 60): the example's money object becomes an amount `{ "unit": "GBP", "value": "12.5" }` (the bytes of the example change; its point, key order, does not).
- **folds.md's table of folds and views** (lines 15 to 28, from "| Name | Kind | Reads | Where |" to "| `condition_holds`, `reading_condition_holds` | view | ..."): becomes the eight protocol folds only, and a line: "Readings are in `spec/readings/`." Line 30 ("A clock is a time ..., and so is an arrival in an arrival log") loses ", and so is an arrival in an arrival log".

#### D4. `spec/protocol.md`, whole

Replace the file with:

```markdown
# FoodBlock protocol

This is the index. A block is `{ type, state, refs }`, signed by its author; its id is the hash of its bytes. The one shape is a promise: *if this happens, this of mine becomes yours*. Each rule is stated once, in its home file; where files disagree, core.md governs, then the file that owns the rule. A rule set is named by the hash of `rule-set.json` (core.md, section 11); "1.8" is a label.

## Files

The protocol (named in `rule-set.json`):
- `core.md`: a block, types and verbs, suites, numbers and text, the genesis, the line, messages, required fields, `valid` and `read`, the test (section 10), rule sets (11), what a builder implements (12).
- `canonical.md`: the one byte form.
- `modules/blocks.md`: other fields, causal order, time, a named clock, the cut, finality.
- `modules/identity.md`: voices, keys, tools, `refs.key`, after a death.
- `modules/things.md`: things, makes, transfers, schemas.
- `modules/promises.md`: what a promise is, terms, answers, who may bind, settling, disputes.
- `modules/authority.md`: grants, who a block speaks for, blocks that bind, a limit along a line, a stop of one thing.
- `modules/circles.md`: owners in parts, rows, members and roles.
- `modules/folds.md`: a line, what is left, ownership, a fork, a promise's stage, counts.
- `modules/privacy.md`: what stays public, commitments, audience, the header, handing on, keeping apart.
- `modules/encoding.md`: bytes, shapes, limits.
- `modules/consent.md`: a STOP is a block, and changes what binds no one.
- `protocol.json`: every closed list, read by code. `sound.json`, `vectors.json`: the cases of the protocol ops.

Beside it, not the protocol:
- `modules/nodes.md`, `transport.md`, `conventions.json`, `profiles/`: a node's conventions and words (pull, push, the log, the envelope, the compact form, email, the short form).
- `readings/`: readings any node may compute, with `readings.json` and their cases.
- `patterns/`: schemas and worked examples; they add no rule.
- `schemas/`: the base schemas as signed things.

## Peers

Conformance is per op (core.md, section 12). The sizes below are a builder's choice, not a rule.

| Peer | Does | Answers these protocol ops |
|---|---|---|
| Micro | measures, signs, buffers, sends; may use the compact form | `hash`, `id_of`, `header`, `verify` for its own blocks |
| Micro that acts | adds: checks the grants it acts under, obeys a stop on arrival | adds `valid`, `under_ok` |
| Dealer | takes one deal and answers it (below) | `hash`, `id_of`, `header`, `strict_text`, `verify`, `valid`, `read`, and `promise_stage` for a one-to-one deal |
| Edge | adds local pull and push, its own deals, offline | adds the identity and line ops, `promise_stage`, `ownership` |
| Node | holds a person's or a machine's blocks; serves pull and push | all 38 |

Only people and machines hold nodes. A business is a circle of them, never a node.

**A dealer** takes one deal and answers it. It conforms when it does these eight things; nothing else is asked of it.
1. **Bytes.** It writes a block as canonical JSON and refuses a message whose bytes are not the bytes its own writer gives for the same value.
2. **Id.** A block's id is the SHA-256 of its bytes as they came.
3. **Who said it.** It checks the signature over the block's header with the key its pieces bring in: the author's genesis, the key grant its `refs.key` names, and that one's pieces. A message that carries a deal to a dealer carries its pieces. A block it cannot open it does not answer.
4. **Its own line.** It signs a genesis once. Each later block names its last block in `prev` and counts `seq` up by one. It keeps its own blocks and may keep nothing else.
5. **Reading a deal.** It reads a first promise with two named sides: `from`, `to`, what moves, `price`, `quantity`, `expires`, and `pay_by` and `deliver_by` as dates for people. A promise that carries a term, a schema or a condition it does not read, it holds not read and does not accept.
6. **Answering.** Its accept is a `promise` with `status: accepted` that `answers` the offer and names it in `for`; its decline an `observe` with `status: declined`. It adds no term.
7. **Settling.** It signs a `transfer` `for` the deal for what it hands over, and an `accepted` answer, with `covers`, to a payment made to it for that deal. It counts nothing as received on the giver's word.
8. **Under a grant.** It answers an order signed under a grant only when it can check that grant (authority.md, Blocks that bind); otherwise it asks for the same order in the person's own key, and says so.
It serves no pull and no push, keeps no other person's line, names no clock and reads no profile. What it cannot read it says it cannot read. Any envelope that carries the bytes whole will do; email is the first (transport.md). **Its cases:** `dealer` in `vectors.json`: four orders it must accept, four it must refuse (bytes, id, signature, an unread term), two settled deals the reference reads as `done`, one order under a grant it must decline to answer, one tampered payment.

## Invariants

Each is stated in its file under its number.

| Numbers | File |
|---|---|
| 1 to 5 | core.md |
| 6, 7 | identity.md |
| 8 to 14 | folds.md |
| 15 to 20 | authority.md |
| 21 | circles.md |
| 22 to 31 | promises.md |
| 32 | privacy.md |

## Glossary

One word, one meaning. Each is defined in its home file; the line here is a pointer.
- **valid**: who said these bytes (core.md, section 8). **read**: this reader can read the block (core.md, section 8). **not read**: kept as its header, counted in no fold. **unjudged**: its pieces are not all held, or its suite is not known. **pieces**: the author's genesis, the block `refs.key` names, and its pieces. **header**: `{ author, seq, prev, hash }`, with `key` and `skip` when present.
- **line**: one key's blocks by `seq`; **start**, **read whole**, **`not_shown`**, **`lacks`**, **pair** (folds.md, A line; A fork is a burden).
- **stands**, **waiting**, **the cut**, **an end**, **relier**, **seen**, **signed twice** (blocks.md, The cut; Finality). **a named clock**, **keeper**, **receipt**, **cutoff** (blocks.md, A named clock).
- **voice**, **a key under a voice**, **a voice's cap**, **tool**, **`refs.key`** (identity.md).
- **measure**, **draw**, **holds**, **lands**, **freed**, **amount**, **sum** (folds.md, What is left; encoding.md, Shapes).
- **grant**, **keeps to**, **`refs.meter`**, **a stop of one thing**, **a hand-back** (authority.md).
- **request**, **bench**, **due**, **final**, **`crossed`**, **side**, **allocation**, **bearer** (promises.md; folds.md, A promise's stage).
- **circle**, **part**, **row**, **move**, **hand**, **unissued**, **`not_voice`** (circles.md).
- **type**: what kind of block it is; a grant covers types. *Act* is no word of the protocol: what a person is doing is hers to name (promises.md, A name is pencil). **deed**: something done in the world.
- **commitment**, **reveals**, **audience**, **handing on** (privacy.md). **stranger** (consent.md). **schema**, **grounds** (things.md).
- **word**: an output that answers one of the four questions; **reading**: any other (core.md, sections 10 and 12). **rule set**, **sound part**, **read part**, **continues**, **clean fork**, **split**, **`unknown_rules`** (core.md, section 11). **a named reading**, **`reading_not_run`** (promises.md, Conditions). **a mount** (core.md, section 12).
- **pattern**: a schema and a worked example over the core, adding no rule (`patterns/`). **a node's word**: what a node signs about what it does, binding only it (nodes.md).

## Open questions

- **Ranking.** How a person's node weighs closeness. The protocol says nothing; a node may rank by its own rule.
- The rest of what 1.8 leaves open is in THREAT-MODEL.md, What the protocol does not keep.
```

(The 1.7 open questions "Arrival for a newcomer" and "Part of an instance in a transform" are gone: arrivals left in stage 1, and `state.inputs` answers the second in stage 3.)

#### D5. `spec/THREAT-MODEL.md`

- **Line 1**, "# FoodBlock 1.7 threat model" becomes "# FoodBlock 1.8 threat model"; **line 3**, "**Draft for Patrick, 2026-10-28. Not published.**" becomes "**Draft for Patrick, 2026-11-11. Not published.**"; line 8, "The source is the twenty-lens security review of 2026-10-28 (its root causes A to O)." adds "and the three-round review of 2026-11-11 (its root causes R to W)".
- **Line 21**, the second fact: "It must run every check (through the core) before it stores anything, because what it stores, others read." becomes "It judges every block (`valid`, then `read`) before it takes it; a block it cannot read it keeps as its header and counts in no fold."
- **The attackers' table.** Row **A counterparty**: "make money negative" becomes "make an amount negative". Row **A misbehaving or captured agent**: Cannot becomes "bind its giver by a block that does not keep to a promise she signed in `on`, past its grant's line, or before what it pays is due (authority.md, Blocks that bind)". Row **A node operator or host**: Can becomes "store, drop, delay; see everything public; see who wrote, whom a copy is for, how big and when, for what it carries"; Cannot adds "see any header of a sealed block it carries no copy of; be shown not to have left out a block it receipted (nodes.md, The arrival log)". Add rows: `| **A rival pulling** | read public blocks; count a door log's gaps | read any sealed header; pair two traders by their sealed blocks |` and `| **A stranger at a machine** | sign a stop of someone's machine | lock it: only the owner's backed stop is his word (patterns/machines.md) |` and `| **A rival rule set** | publish a set that passes the old cases and reads one word differently | be read by a node that does not run a build made from it (core.md, section 11) |`.
- **The kept table.** B: "After a rotation only the counted line counts; a fork voids from its split, for that key only" becomes "After a key grant that ends a key, only the counted line counts; a pair taints that key from its lower `seq`". D: "a counted death record" becomes "a counted close". F: "Every reading applies the same authority test the door reports" becomes "Every fold that counts a block under a grant reads `under_ok`". K: delete "a block after a sealed one follows it in the chain;" and "a push is judged with all it rests on" becomes "a push is judged on each block's pieces". L: "One depth (32), one read depth (128), enforced alike" becomes "One depth (32), one read depth (`limits.read_depth`, 64, as stage 2 built it), enforced alike". O: "the currency's own decimals" becomes "the amount as signed". Q: "her post-trigger gift yields to her successor's sale" becomes "her gift after a counted close yields to her successor's sale". Add: `| R | Any unsigned pull got every sealed header; a rival paired traders 30 of 30 | A sealed block, header and all, goes only to its audience and whom they hand it on |`; `| S | A newer field was refused for good and froze its author's line | It is valid and not read, kept as its header; the line answers \`not_shown\` |`; `| T | A stranger's free key locked a machine | Only the owner's backed stop is a lock |`; `| U | A hidden limit bound past itself | Only a limit the other side reads binds (authority.md) |`; `| V | A word's answer turned on a sum, a reader's clock or a profile | No word reads a view, a profile or a reader's clock (core.md, section 12) |`; `| W | "1.7" named eighteen rule sets and the lock could not be checked | A rule set is named by its hash; a node lists one only when it runs a build of it |`.
- **"What the protocol does not keep"**: delete "**What a header shows.** Who wrote, when, how often, and how many recipients share a copy. Sizes are not padded." Put: "**What a carrier sees.** A node that carries a sealed copy sees who wrote it, the id the copy is for, its size and when. Sizes are not padded. Only its signed refrain covers its silence; a stranger sees none of it." Add, each one line: **A holder's fork** (each branch binds her where a relier used it unseen, one bound per line; a meter she names closes it); **A meter's fork** (its proven lie, never the holder's); **A renewing limit** is read on her clock: with a keeper of one, that keeper says when a period turns; **A firm offer with no end and no clock** cannot be withdrawn from one who has not seen the withdrawal; **A clock of one** has no proof of its silence; **A count of names is a count of keys** (free keys); **A payee who signs nothing** keeps off-record money she was paid, and only her word shows it came; **Money as a plain unit word** ("KES") does not say whether it is a claim on someone; **A ring of circles** whose owners end in no person is shown, never refused; **A second identity under a weak table** (a father who joins his own family circle twice) counts where its rows let it; **A death with no successor** ends nothing; **A circle with no clock** bears the gap of every end until an outside relier uses its move; **A row read only on lines read whole** answers `not_shown` to a reader missing one; **A key that writes public and sealed blocks** is refused by no check: its public line is `not_shown` to strangers; **Delay and order by a sole keeper**: between receiving and signing she is free, and no block shows it; **Continues** is shown only as far as the earlier set's cases reach; **A rule set named and never published** is not read by anyone, for good.
- **New section "## What the protocol refuses"**, after it: "Plainly, so no one waits for it. **Who connects to which node, how much and when** is not hidden: the protocol adds no mixing, cover traffic, private retrieval or scanning. A carrier knows whom it carries for. A person who wants a network to learn less uses a link that hides it; a person who wants a carrier to say less holds its refrain." Then the three lines of A4.
- **Choices for Patrick**, 3, "Applied (clean round 1), as nodes.md's text already said: only a live key (not void, not frozen, not rotated out) opens a door; the core answers `live_keys`, and the reference node reads it." becomes "Applied: only a key that speaks for its signer opens a door (nodes.md, Messages); the core answers `live_keys`."

#### D6. `spec/NECESSITY.md` and `tools/necessity.cjs`

Batch 1 found the table proves only that a vector uses a name: twenty vectors named `necessity:` exist to make rows say COVERED (b1/15 F1). What it should test is the test of C1, clause 1, by measure.

**The Method paragraph** becomes: "For each listed thing, name the question of core.md section 10 whose answer changes without it, and show one pair: the same blocks, two answers to a protocol op's word output. A thing with no such pair is not protocol: it leaves the closed lists, or is a reading's, a library's or a node's. Clause 2 (could the reliers have named it) is a judgment, written beside each thing that needs it; no script measures it."

**What the tool changes:**
1. **What it deletes** grows from 134 names to every protocol item of C3 and C4: door ops (by making the op throw), folds, condition shapes, terms, statuses, stop kinds, circle moves, fold codes, `kinds`, besides today's fields, refs, verbs and keys.
2. **What it runs:** the protocol ops' cases only (`sound.json`, `vectors.json`), on the oracle and the core, then `test/audit/run.cjs`. Reading, library and convention cases run separately and never make a row protocol.
3. **What counts as needed:** a failing case whose failing output is a word (`protocol.json` `door.protocol` and each fold's `words`), and the row names which of the four questions it was. A failure only in a reading's output, or only in a `refusals` case that tests that a name is listed, is not enough.
4. **New verdicts:** PROTOCOL (a word fails), READING (only reading cases fail), USED, UNTESTED, DEAD, STRUCTURAL as today. A thing C3 or C4 marks protocol whose deletion fails no word is a contradiction the tool prints: either the class is wrong or a case is missing.
5. **Delete the twenty `necessity:` cases** that only carry a name; the pairs replace them, one per row, made by `make-vectors-necessity.cjs` from the row's story.
6. **Invariants:** read the numbered list 1 to 32 under each `## Invariants` heading; each must be carried by a protocol case. The "Holds:" sentences are not counted.
7. **Columns** become: Thing | Class | Question | Pair (the two answers) | Cases that carry it.

---

### Job E. The mount: a kept store that changes no answer

**Why.** Every question starts from nothing: the whole store is sent, indexed and every signature checked again. Over a 20 MB store one question costs 7.8 seconds and 763 MB; taking 1,603 blocks one at a time costs about 48 seconds (b3/19 F5 d). A caller who asks many questions of one store should be able to keep it.

**The names.** b3/19 proposed `hold` and `drop`. Every near word is taken: `holds` and `held` (a draw's amount; and `held`, the argument of every op), `stop` (a stop of one thing), `dropped` (a node's honest drop), `handle` (a witness's `state.handle`), `keep` and "kept" (a not-read block is kept), "store" (the schema store), "load" (an export loads). **`mount` and `unmount`** clash with nothing in 00-shared.md or the spec, and the thing returned is **a mount**.

**`spec/protocol.json`, `door.ops`** (and `sdk/door.table`), class library:

> - **`mount`**: args `blocks: [full_block or sealed message]`, `into?: mount`. Returns a mount: an opaque text (32 lowercase hex characters) that names, for this door only, the set of blocks given so far. With `into`, it adds `blocks` to that mount's set and returns the same mount. A block given twice is one. Nothing is ever taken out of a mount's set.
> - **`unmount`**: args `mount`. Forgets it; returns `true`. Any later op naming it is an argument error (`unknown_mount`), never a refusal.
> - **Every op that takes `held`** (or `blocks`) takes a mount in its place. Its answer is exactly its answer for the mount's set given as an array, in any order. A mount holds no clock, no `now`, no schema but what `schemas_from` finds in its set, and no rule set but the door's.
> - **What a mount carries.** It means nothing. No block names it; it is never signed, sent or stored in a block; two doors give two mounts for the same blocks; one door may give two. It is a caller's handle on the door's memory, no more.
> - **What is done once.** At `mount`, each block's bytes are read once (check 1), its id computed once, and it is indexed by id, by author and key line, and by every id it names. `valid` and `read` of each block are computed once and kept; the memoised causal past is kept. When `into` adds blocks, only blocks whose verdict could change are judged again: an `unjudged` block whose missing piece arrived, and a not-read block whose missing named block (`names_missing`) or schema arrived. A verdict once final (a refusal of `valid`) is never judged again.

`spec/core.md`, section 12, add: "A door may keep blocks between calls (`mount`, `unmount`): an op given a mount answers exactly as it does given the same blocks, so a mount is no part of any answer."

**No vector changes.** The runner (`spec/run-vectors.cjs`) runs every protocol case twice, once with `held` as given and once through a fresh mount, and the two answers must be byte-equal. New cases: `mount: union` (mount A, then `into` with B: every op over A∪B as given), `mount: late piece` (a block mounted before its key grant is `unjudged`; after the key grant is added, `valid` `[]`), `mount: late schema` (a block not read for want of its schema reads once the schema is added), `mount: forgotten` (`unmount`, then any op: `unknown_mount`).

---

## 3. The counts, 1.7 beside 1.8

1.7 is the tree that was reviewed on 2026-11-11 (b2/13 measured it). 1.8 is after stages 0 to 7.

| | 1.7 | 1.8 | How known |
|---|---|---|---|
| Door ops in the door table | 105 | 105 (102 after stage 6, plus `rule_set`, `mount`, `unmount`) | measured 104 after stage 2; later stages by their own door-op sections |
| Protocol ops (conformance) | 105 (every op) | 38 | this stage's table |
| Readings / library / node ops | none named | 29 / 15 / 23 | this stage's table |
| Folds | 18 | 19 in all; 8 protocol | measured 18 today; stage texts |
| Views | 9 | 6 in all, all readings; `condition_holds` is part of the words | measured 6 today |
| Invariants (numbered statements) | 35 (36 numbers, 32 used twice) | 32, numbered 1 to 32 with no gap | measured 35 today; stage texts |
| Terms | 21 | 23 (13 protocol) | measured 21 today; stages 4, 5, Job A |
| Condition shapes | 10 | 11 (7 protocol) | measured; stage 5 |
| Statuses | 5 | 4 | measured; C6 |
| Top-level lists in `protocol.json` | 50 | about 41 (11 leave or move, `kinds`, `door.protocol`, `fallbacks`, `waits_on`, `condition_shapes_class` come) | measured 50; **estimate** |
| Optional profiles | 15 listed (22 in protocol.md) | 0 listed; 6 node conventions, the rest patterns | measured |
| CBOR keys | 122 (no holes) | about 125 (no holes, made by script) | **estimate** |
| Non-empty lines of normative text (core, canonical, the modules) | 979 | about 560 (core, canonical and the eleven modules less nodes.md and the moved readings) | 1.7 measured by b2/13; today 1,008 measured mid stage 2; 1.8 **estimate**, ±60 |
| Door cases a conformer must pass | 3,183 | about 2,000 | **estimate**: b2/13's 1,940 for the 37 ops it named on 1.7, with stages 1 to 6's cases added and removed |

---

## 4. Vectors

**Nothing is re-signed by this stage** but what Job A changes in bytes: blocks that carry `state.withheld` (signed over a header that carries it too, so the header's bytes change as well as the body's) or `terms.show`, consent words `keep` or `move`, and machine locks with `how`, `placer`, `safe` or `reach` (each listed by the step 6 run of `tools/resign-vectors.cjs`, stage 2's tool). Their makers drop the field, and ids follow as in stage 2.

**Files.** `spec/vectors.json` keeps the protocol ops' cases. New beside it: `spec/sound.json` (the `valid`, `hash`, `id_of`, `header`, `verify`, `strict_text` cases and `canonical-vectors.json`, which folds into it), `spec/readings/vectors.json`, `spec/conventions-vectors.json`. Every case moves by its op's class; none is deleted.

**Door cases that leave conformance** (kept beside it, answers unchanged): every case of the 29 reading ops (`promise_view`, `promise_views`, `ownership_view`, `due`, `pot`, `where_now`, `shares_on`, `use_shown`, `not_free_shown`, `invasion_shown`, `made_from`, `next_link`, `repeat_occurrences`, `gives`, `owed_back`, `account_of`, `fee_back`, `clearing_applied`, `ruling_releases`, `release_shown`, `listing_check`, `check_reads`, `reading_is_persons_claim`, `reading_condition_holds`, `consent`, `ways_in`, `machine_lock`, `fence_reading`, `circle_key`); every case of the library and node ops; the `promise_stage` cases that test only reading outputs (b2/13 counted 317 of 597 in 1.7), split so a case tests words or readings, never both; the `condition_holds` cases on `settled`, `paid`, `ruled`, `reading` (27 in 1.7), which move to readings.

**Cases that change answer, and are meant to:** a word given a block conditioned on `settled`, `paid`, `ruled` or `reading`, with no rule set naming that reading: the block is not read (`reading_not_run`), listed in `unread`; `ownership` cases given `now`: the argument goes; the answer is the named clock's; `machine_lock` cases: `{ locked, locks, claimed }`, a stranger's lock `claimed`; discovery cases: `sound`, `reads`; `header` and `open_copy` cases with `withheld`; `consent` cases with `keep` or `move`; `answer_pull` cases that served an unsigned asker a sealed header; `promise_stage` cases with `show`.

**New cases.**
1. *An unsigned pull and a sealed block.* A door holds a sealed block and a public one: unsigned `answer_pull` gives the public one only; a signed pull by a recipient gives both, with the copy.
2. *Handing on.* Harry hands Amara's sealed accept to Leila (same header and signature, his envelope, his reveal): `open_copy` by Leila reads it; her reveal opens the commitment to Harry's id.
3. *A handed-on copy is kept under admission* from Harry's signed push, and never in the author's place.
4. *A key for one counterparty.* Amara's key grant adding a key under her sealing voice, sealed to Harry and herself; her order on that key: Harry's `valid` `[]`; his host, holding the key grant as its header, answers `unmet` naming it, never `bad_signature` (stage 2 built this: 00-shared, rows 93 and 94).
5. *Invariant 32.* A sealed message whose bytes name no recipient: every key of header, signature and envelope checked against the audience ids.
6. *A mixed key.* A public block whose line holds a sealed block: `valid` `[]`; `read_whole` for a stranger: `{ whole: false, lacks: [the sealed block] }`.
7. *`state.rule_set`.* A block stating an unknown rule set: `valid` `[]`, `read` `[unknown_rules]`; stating the reader's own: read.
8. *The manifest.* `rule_set` over the spec files gives the id in `rule-set.json`; one byte added to core.md gives another.
9. *A schema types a field.* The Kisumu co-op's schema `recalled_from:time`; a block naming it with a time: read; with `"banana"`: `read` `[shape]`; a block naming a look-alike schema of another hash: read under that one only.
10. *Title until paid.* Femi's mixer conditioned `{ paid: deal }` with no rule set: `ownership` lists it `unread`, owner Femi; conditioned `{ signal: "paid", by: [Femi] }` with Femi's signal held: owner the café.
11. *No word reads a clock.* A conditioned transfer on `within` with keepers: `ownership` answers from the keepers' receipts, the same at any time it is asked.
12. *The lock.* Twenty free keys lock Sam's roller: `machine_lock` `locked: false`, `claimed: 20`; Leila under Sam's grant covering `grant.stop`: `locked: true`; Leila's own stop of her lock: `locked: false`.
13. *Discovery* states `sound` and `reads` and no `version`, signed.
14. *The dealer*, twelve stories (D4): four accepted orders whose accept the reference reads as binding; four refused (bytes, id, signature, an unread term); two settled deals read `done`; one order under a grant the dealer declines to answer; one tampered payment.
15. *The mount*, four cases (Job E).
16. *Necessity pairs*, one per protocol row (D6), replacing the twenty `necessity:` cases.

---

## 5. Build notes, in order

1. **`protocol.json` first**, then `node test/sync-spec.cjs`: Job A's deletions; `version` out; `rule_set`, `unknown_rules`, `reading_not_run`, `kinds`, `door.protocol`, `condition_shapes_class`; the lock's list out; `views`, `repeat` and the reading folds into `spec/readings/readings.json`; `envelope`, `messages`, `local_discovery`, `cbor` into `spec/conventions.json`; `mount`, `unmount`, `rule_set` in `door.ops`. The loaders (`sdk/rust/src/spec.rs`, the oracle's `spec` read, `test/sync-spec.cjs`) learn the two new files.
2. **The spec text**, file by file, in Job order; then the moves of C2 (text moved word for word, each moved file opening with its one line of standing); then D3's pointers by search, until a search for every deleted heading finds nothing.
3. **The oracle** (`spec/oracle/fb.cjs`): `conditionHolds1` reads only the seven shapes and no `now`; the four reading shapes go to a separate `readings.cjs` that the oracle's `read` consults only when told it runs them; `ownershipFold` and `promiseStage` drop `now`; `yieldsToSuccessor` reads identity's close; `machineLock` and `fenceReading` move to `readings.cjs` with the new answer; the pull filter drops sealed headers for an asker with no copy; `accept` keeps handed-on copies; `read` gives `unknown_rules`, `reading_not_run`; the schema check reads `fields` shapes on every type; the header loses `withheld`. Then `mount`/`unmount` as a map from mount to a kept pool and its memo.
4. **The Rust core** (`sdk/rust/src/`), the same order: `fold/things.rs` (no clone per conditioned transfer; no `now`), `fold/tasks.rs` (the reading shapes behind the reader's choice), `views.rs` (`now` stays only here), `fold/successor.rs` into identity's close, `fold/lock.rs` and `grant_fence.rs` into a `readings` module, `sync.rs` (`answer_pull`, the copy rule, discovery), `check/` (schema shapes on every type; `withheld`, `show`, `keep`, `move` out), `sign.rs` and `sync.rs` (`header_bytes`, `header_entry`: no `withheld`), `door.rs` (`mount`, `unmount` holding an `Index` and its memo per mount, under a cap the door states; `rule_set`). `index.rs:28`'s memo cap is per mount.
5. **The vectors**: the resign tool's step 6 for Job A's bytes; split `vectors.json` by class into the four files; the new cases of section 4; `run-vectors.cjs` runs each protocol case twice (as given, and through a mount) and runs reading, convention and sound files as their own sections.
6. **The tools**: `tools/necessity.cjs` per D6; `tools/cbor-table.cjs` (new); `tools/rule-set.cjs` (new: writes `rule-set.json`); `tools/fuzz/diff.cjs` `OPS` and `folds.cjs` `ASK` to the 38 protocol ops first (they still asked the 1.7 identity fold: 00-shared, Open), readings after.
7. **The SDKs** (JavaScript, Python, Go, Swift, Kotlin): the door tables from `sdk/door.table`; each SDK's door groups ops by class; no API breaks but the removed `withheld` option and `machineLock`'s new answer.
8. **`mcp/`, `cli/`, `host/`**: `host/` answers discovery with `sound` and `reads`, serves no sealed header to a stranger, keeps a mount per open store (the files host's one-at-a-time intake, `host.mjs:125`, and the MCP memory node, `door.js:41`, are the first users); `cli/` gains `fb rule-set`; `mcp/` nothing but the door.
9. `README.md`, `ARCHITECTURE.md`, SDK READMEs, `CHANGELOG.md`: one entry, "1.8 stage 7: who learns what, rule sets by hash, the test", 2026-11-11, with the counts of section 3.

---

## 6. The end-of-build checklist

Run once, after this stage, in this order. Each is slow; none is run while building.

1. **Re-sign and re-make the vectors**: `node tools/resign-vectors.cjs` (all steps, every stage's map, to a fixed point); every maker `sdk/javascript/test/make-vectors-*.cjs`; `node sdk/javascript/test/make-schemas.cjs` (`published.json`); `spec/profiles/epcis/make-vectors.cjs` (now under `patterns/`); `tools/cbor-table.cjs`; `tools/rule-set.cjs`. Then split by class.
2. **Both engines on every case**: `node spec/oracle/run.cjs`, `cd sdk/rust && cargo test`, `node spec/run-vectors.cjs` (each protocol case twice), `node test/audit/run.cjs` (core and oracle identical on every audited world and story).
3. **The necessity table**: `node tools/necessity.cjs` (full measure), then `node test/necessity.cjs`. Every protocol row PROTOCOL with its question; no contradiction printed.
4. **Fuzz both engines against each other**: `tools/fuzz` differential and crash fuzzers over the 38 protocol ops first, then the readings; `tools/fuzz/known.json` stays `{}`.
5. **The TLA models**: `tools/tla` as CI runs them (key lines, consent, one open offer), and stage 5's deal model (`BindingOnlyGrows`, `StaysMoved`, `ReceiverSigned`).
6. **Rebuild every SDK**: WebAssembly (`cd sdk/javascript && node scripts/build-wasm.cjs`; `node tools/version-sync.cjs --write` for Go), the Python library (`cargo rustc --release --features ffi --crate-type cdylib`), the Swift XCFramework, the Kotlin natives.
7. **Each SDK's tests**: JavaScript `npm test`; Python `python3 -m unittest discover -s tests`; Go `CGO_ENABLED=0 go test ./...`; Swift `swift test`; Kotlin `./gradlew :foodblock:test`.
8. **`mcp`, `cli`, `host`**: `cd mcp && npm test`; `cd cli && npm test`; the host's tests (files and Postgres stores).
9. **The search**: every heading any stage deleted (Orderer, One whole, Held keys, Rotation, A will, Blocks that can be undone, A machine lock, A machine's fence, The cut in authority.md, Showing a deal's term, A node's promise), every removed name (`withheld`, `show`, `version`, `holds`, `speaks_for` in discovery, `keep`, `move`, `lifted`, `how`, `placer`, `checked`, `money`, `currency`, `minor`, `recovery`, `custodian`, `frozen`, `may_act_as`, `powers`, `bids_shown`, `limit_commitment`, `scope.condition`, "year zero"): no hit in `spec/`, `sdk/`, `host/`, `mcp/`, `cli/`, bar the CHANGELOG.
10. **The rule set's name**: `node tools/rule-set.cjs --check`: `rule-set.json` matches the files on disk, and its id is printed.

**Done means:** every step above green on one tree; the two engines identical on every case and audited world; every protocol case passing as given and through a mount; the necessity table showing every protocol item with its question and its pair; no pointer in `spec/` to a section that does not exist; `rule-set.json` naming that tree. Then the owner reads it and says whether that hash is released. Nothing is committed, pushed or published by this checklist.

---

## 7. What 1.8 still leaves open

One list, so a reader finds it in one place. THREAT-MODEL.md, What the protocol does not keep, carries the ones a person must know before relying.

- **A thief who takes her top voice** is her, for good. Every system checked has this.
- **A firm offer with no end and no clock** cannot be withdrawn from one who has not seen the withdrawal.
- **A carrier knows who deals with whom**; only its own signed refrain covers that.
- **Money as a plain unit word** ("KES") does not say whether it is a claim on someone.
- **Who connects to which node, how much and when** is not hidden (refused, Job A).
- **A key that writes public and sealed blocks** is refused by no check after stage 2; its cost is that its public line is `not_shown` to strangers.
- **A key under a voice when a voice above it is added or removed**: its place's index moves; neither engine handles it (stage 1).
- **Delay and order by a sole keeper**, and **a total wall** between two people whose only route is one host (b3/09).
- **Continues** is checked only as far as the earlier set's cases reach; a set named and never published is not read by anyone.
- **A signed `step` on a price**, if the owner wants one (stage 5).
- **A 50/50 removal** goes to the judge the partners chose; **parts transferred to a key that never answers** stay held unless the transfer named a clock (stage 6).
- **The post-quantum road** beyond the signature cap (the envelope's shape, a broken suite's cut); **the freshest tail of a door log**; **real passkeys from six clients** against the 91-byte frame, to be tried before any release (stage 2).
- **The five judgment calls** b2/13 kept as protocol (a backup referee's turn by receipts; circle versions; `stopped` onward and pauses; shares standing on a thing; `personal`); a stricter test would move the first two.
- **Ranking**: how a node weighs closeness.
- **The dealer's twelve cases do not exist yet**: until they do, "49 lines conform" is a claim.

---

## 8. Asks of the shared ground

Settled in 00-shared.md on 2026-11-11, each where it lives:
1. `withheld` leaves the header and Keeps to's list: row 110 (Keeps to's list is written without it by stage 4, which owns that passage).
2. Rule 13 drops "or a machine lock": row 111; stage 4 makes the blocks.md edit (V7), as it already edits Finality.
3. A key grant held only as its header: already built by stage 2 (rows 93, 94: `unmet`, never `bad_signature`; a refused piece `bad_piece`). Section 4's case 4 and Keeping apart read correctly against it.
4. The new words: section 2, The test and rule sets.
5. Named readings: row 107 (the owner). Stage 5 writes the Conditions paragraph.
6. Conformance per op, the conventions: row 108 (the owner).
7. The successor's close rule into identity.md: row 109 (the owner); the exact edit is C2.
Stage 7's own choices (`ways_in` a reading; the lock a pattern; the mount; the sound part by the hash of `sound.json`; `limits.message_bytes`): row 112. Clashes with stages 3 to 6: rows 115 to 119.
