# FoodBlock 1.9, stage 7: last

Built from `changes-1.8/07-last.md` by deleting, keeping and changing. Uses the words of `00-shared.md` with its meanings and defines none of them again; where it needs a word that page lacks, section 9 asks for it. The text changes to built stages 0 to 3 are `CORE-SET.md`; where this stage would repeat one of them, it points and holds no copy. Stages 4 to 6 of 1.9 are not written yet: where this text reads them, it reads `00-shared.md`'s entries for them.

Each passage says **Kept** (1.8's text stands, word for word, at the place 1.8 named), **Changed** (the 1.9 text is given whole), **New**, or **Deleted**. Before each sentence that leaves, a comment names whose own thing it guarded and what guards it now (`00-shared.md` §1.4, the backward check).

Marks after a rule: *core*, *her word*, *convention*, *product* (FoodX's own default or promise; not protocol). Where a rule is protocol, a **World** gives the smallest story for one fixed world in `tools/fuzz/corpus/` and its expected answer.

Sources, as cited: **D1** to **D15**, **E1** to **E3** (`CHANGES-1.8.md`, the decisions of 2026-11-12 and 13 and of 2026-11-16); part **08**, **09**, **10** of the 1.9 plan (`foodx/research/2026-11-12-foodblock-1.9-plan/`), by rule (**09 R1**); **T5-1** to **T5-3** (part 10 §9, Tier 5, taken as a set); **seat NN** (`2026-11-12-foodblock-stress/`, "What survives").

---

## 1. What this stage does

1. **Who learns what.** The rest of `privacy.md`, as 1.8 planned it, with what the stress seats found: a later buyer's row, amounts on a line shown to every relier, a seller backing his own title, lots as a pattern with what they take, a key per partner and a key for one deal, a wrapped copy, padding, and what a host learns. Proof to everyone is said plainly, under "Not given".
2. **Rule sets by hash, read only by the block that names them.** The manifest stays. The sound part as a gate, `continues`, clean forks and splits go (D1). A release is a person's signed word about a hash: no shelf, no boss.
3. **Readings, renderers and the read-back.** Each reading and each renderer is a file named by its hash. The read-back is a reading's answer rendered, so a second reader can redo it and compare digests. Twenty lines a person can be shown, each copying an engine answer.
4. **What an old reader does,** said once, pointing to its homes.
5. **Conformance.** "Speaks FoodBlock" means passing the sound part and the cases of the 30 ops that answer a word. The dealer's twelve cases.
6. **Tidying,** and the mount, as 1.8 had them, with what 1.9 changed.

This stage adds: the read-back's three fields, the reading and renderer files, the release pattern, the lots pattern, the fourth grain, the padding sizes, and the admission sentence. Everything else here keeps, removes, moves or rewords.

---

## 2. The jobs

### Job A. Who learns what

**Why.** Kept as 1.8 Job A's "Why", word for word.

#### A1. `spec/modules/privacy.md`

**Line 3.** Kept as 1.8 A1.

**A new first section.** Changed. 1.8's "What stays public", with seat 41's and seat 43's sentences:

> ## What stays public
>
> One key writes public blocks or sealed blocks, never both: a device, or her AI, that writes both holds two keys. A sealed block, header and all, goes only to its audience, and by handing on to whom they choose. Nothing need be public for two people who know each other to deal. What must be shown is a list of who must be shown: a word with an open set of reliers (an open offer, an open grant, a let-go, a kind, a schema, a rule set named by hash, an address) is public or reaches only those it is handed to; a counted line is shown whole, as bodies, to everyone who relies on it; the pieces of a signer go to whoever must know who signed. Amounts on a line are shown to every relier on it. A buyer is named only where the seller names her plainly.
>
> A carrier sees what it is handed: of a sealed block, its header (who wrote, `seq`, `prev`, its id), the reader a push names, its size and when. A copy wrapped to a key of the reader's shows only that key, its size and when. A host that runs a person's AI sees what her AI reads. A clock sees what it is sent.
>
> No check refuses a key that writes both (`valid` reads no `prev`). Its own line then shows less to a stranger: a block on it held only as its header hides, from anyone outside its audience, each measure that line held at its place and each word of that key it could end (folds.md, Read whole), so a question about any of them is `not_shown` to a stranger. A thing's id in a public block ties together every public block that names it: public provenance and a hidden supplier are opposites, and she chooses for each product.
>
> Ground: what I do not send, no one learns from me, and what you signed you will not tell, you may not (Rothbard: a promise of silence binds only as a signed word; nothing fills the silence of one who signed none).

<!-- REMOVED "A carrier sees who wrote, for whom, how big and when; a keeper sees what she is sent." | guarded: nobody's thing; a description, and "keeper" is a second word for a clock | now: seat 43's carrier sentence, which says the same and adds the wrapped copy and the host that runs her AI; "a clock sees what it is sent". -->
<!-- REMOVED "The cost falls on its signer: a line that holds a sealed block is not read whole by anyone outside that block's audience" | guarded: every reader, against a guessed answer past a block it cannot read | now: Read whole as narrowed (CORE-SET 3b-7): the header hides only what it could name; "costs" leaves protocol text (00-shared, One vocabulary). -->

*core* (each sentence follows from: nothing of hers leaves without her grant, and a signed word proves itself to whoever holds it); *convention* for "one key, public or sealed".

**World.** (1) Harry H0, public; Harry's sealing key S, a key grant K1 under his sealing voice. (2) Amara A1, a public order for sack Q. (3) S signs H2, sealed to Amara: Q to Amara `for` A1. (4) Harry H3, public: sack R to Sam. A stranger's unsigned `answer_pull` gives H0, K1, A1, H3, never H2's header. Sam holding H2 only as its header: `ownership(Q)` `{ not_shown: true, lacks: [H2] }`; `ownership(R)` Sam.

**New section, after What stays public:**

> ## Not given
>
> **Deniability.** A block proves who said it to everyone who holds it and its key, chosen by its signer or not, for as long as they are held. Sealing limits who is sent it, never what it proves once shown. Wiping a key ends what it can sign next, never what it signed. One who wants less leaves it unsigned, or signs with a key no block ties to her.

*core* (a signature is a fact about bytes; a body was never acquired, but a signed word was given). From seat 42; T5-3.

**World.** (1) Amara A0, list `[card, phone P]`. (2) P signs A1: accepts Harry's offer H1, sealed to Harry. (3) Amara's card signs K2, ending P, `counted_to` A1, and her phone's private key is wiped. (4) Harry hands A1 to Gita, the judge both named (Handing on). Expect, at Gita: `valid(A1)` names P; `stands(A1)` true. A block P signs after K2 counts nothing for any block that has K2 in its past.

**Line 9 (erasure).** Kept as 1.8 A1.

**Line 12, `withheld`.** Deleted, as 1.8 A1.

<!-- REMOVED "Leaving the subject out is marked, never hidden. ... A block without `withheld` claims nothing about who else saw it." | guarded: nobody's thing; it was the author's unchecked claim, shown to every carrier | now: every block says nothing about who else saw it (choices row 110). -->

**Line 18, Sealing.** Kept as 1.8 A1 (its pointer names the privacy invariant, Job E).

**Lines 20 to 24, Showing a deal.** Changed. 1.8's text, with seat 42's two sentences:

> ## Showing a deal
>
> A deal is its two sides'. Each holds its own copy and may show what it holds; silence is no promise not to show. What a side shows is the other's signature, not the side's own account: it is proof to whoever is shown. A side who wants the other's silence asks for a refrain (promises.md, Refrain), which may name what is kept: the terms, or that the two deal at all. A refrain does not change what a shown block proves; it only names what its signer gives up for showing.

<!-- REMOVED the 1.7 section "Showing a deal" with `terms.show` | guarded: nobody's thing; it granted a permission where nothing forbade, and so read as "secret unless listed" | now: silence is no promise; a refrain is her signed word (as 1.8). -->

*core*.

**World.** (1) Amara A1 orders flour from Harry, sealed to both; Harry H2 accepts. (2) Amara shows H2 to Leila. Expect at Leila: `valid(H2)` names Harry's key. (3) The same with Amara's refrain R1 (Harry's terms kept, stake £50, judge Gita) in H2's past: `valid(H2)` the same; R1 is read as Amara's promise, nothing about H2 changes.

**Lines 28 to 36, the header.** Kept as 1.8 A1 (`withheld` out of the header; "The public header" becomes "The header").

**After line 30, "Who is sent a sealed block".** Kept as 1.8 A1. *core*.

**Sealed messages, appended.** New. CORE-SET 3a-11 writes the plaintext sentence and `pad`; this adds one:

> A sealer that pads pads to the next of 512, 1024, 2048, 4096 bytes, then each 4096.

*convention* (every sealer padding to the same sizes is what hides a size). From seat 43.

**World.** Amara seals her 600-byte order A1 to Maria with `pad`: the plaintext is 1024 bytes; `open_copy` gives A1, same id as unpadded (3a-11's world). A 5,000-byte plaintext pads to 8192.

**Handing on.** Kept as 1.8 A1. *convention*.

**World.** Kept as 1.8 §4 case 2 (Harry hands Amara's sealed accept to Leila; `open_copy` by Leila reads it; her reveal opens the commitment to Harry's id).

**Keeping apart.** Changed. 1.8's table, a fourth row, and two paragraphs:

> ## Keeping apart
>
> Four grains, each made of blocks that exist. None is chosen for her.
>
> | Grain | What she signs | A stranger learns | Each counterparty learns | A carrier learns |
> |---|---|---|---|---|
> | One sealing key for all | one key grant | nothing | how many sealed blocks the key wrote, and when, across all her dealing | that she wrote to that counterparty |
> | A key for one counterparty | a key grant adding a key under her sealing voice, sealed to that counterparty and herself (identity.md, A key under a voice) | nothing | only how many such key grants came before | that she wrote to that counterparty |
> | An identity for one counterparty | a genesis of its own, and a two-key link sealed to that counterparty | nothing | nothing of her other dealing | that an unnamed id wrote to an id |
> | A key for one deal | a genesis of its own, and no block that ties it to her | nothing | this deal only, and what she told him | that an unnamed id wrote to an id |
>
> The first two keep one identity, so her grants, her line and what she owns are untouched. The third breaks her record into pieces on purpose; a counterparty sees none of her history unless she shows the link. The fourth stands behind nothing beyond the deal itself, so a side who must wait on its word has nothing to wait on. What it receives is on its own line: to use it under another key of hers it signs a draw to that key, and that draw ties them for every later reader of what it moved.
>
> **A wrapped copy.** A copy may be wrapped, in an envelope of its own, to a key the reader gave the sender: a mailbox, which is an address she sealed to that one sender (nodes.md, Her address). A host that keeps it learns which mailbox, how big after padding, and when; not who wrote it.

*her word* (which grain, which mailbox); *convention* (the wrap is an envelope). From 1.8 A1; seat 42 (fourth row, its limits); seat 43 (the wrap).

**World.** (1) Amara A0; K1, a key grant adding key C under her sealing voice, sealed to Harry and herself. (2) C signs A2, an order to Harry. Expect Harry's `valid(A2)` names C; his host, holding K1 only as its header: `unmet` naming K1, never `bad_signature` (1.8 §4 case 4, built). (3) Amara wraps A2's copy to Harry's mailbox key X. Expect Harry's host `accept` keeps it under its admission rule (A2); what it holds of it is `{ mailbox: X, bytes: 4112, at }`; Harry's `open_copy` of the inner copy gives A2.

**Product, not protocol** (part 10 R7 `keys`; T5-3): "Where she has a key of her own, her AI seals to each counterparty with a key for that counterparty." FoodX suggests a key for one deal only where she pays first and the thing ends with her.

**What each one learns, in 1.9.** Changed. 1.8's three deals and table, with three rows changed or added:

> | Who | Public deal | Sealed deal | Through a host |
> |---|---|---|---|
> | The other side | everything, signed, for good | everything, signed, for good; how many commitments the audience holds; her `seq` on that key | everything; that she has no key; her handle and her host |
> | Her host (it carries her copies) | everything | of each copy: its header (who wrote, `seq`, `prev`, id), the reader the push names, its size, when, who pulled it; of a wrapped copy: which mailbox, how big after padding, when; not the words | everything in the clear, and so does her phone carrier |
> | A host that runs her AI | everything her AI reads | everything her AI reads | everything her AI reads |
> | His host | everything | the same, for the copies it carries | what the witness shows; if sealed, author (the host), the id, size, time |
> | A later buyer of the same thing | as bodies, every block of the seller's key from his sale back to its start, and of the key that brought that key in: the amounts and times of every earlier sale on that key, and each buyer he named plainly | the same bodies, handed on to him by the seller or their audience; without them, `not_shown`, and the seller's backing if he gave one | the same, from whoever holds the witness |
> | An index | everything | nothing, unless a side hands it on | the witness if public, with her handle; if sealed, nothing |
> | A stranger pulling | public blocks only | nothing; a gap in a door log's numbers shows only that something was taken | as an index |
> | A judge | everything | what a side hands on | what the host or Amara hands on |
> | A rival | price, lines, cadence | nothing from the protocol; whatever a carrier tells, unless it signed a refrain | if public, her handle; if sealed, nothing |
>
> **A seller backing his own title.** A seller who would not show his line to a later buyer may back his title in his offer: `terms.backing`, "if the judge we named finds this was not mine to give, £300 of mine becomes yours". The buyer still reads `not_shown`; he reads the backing beside it. The line goes only to the judge, and only in a dispute.
>
> **Selling from lots** is a pattern (patterns/lots.md): it hides who else bought, never how much and when.
>
> **What is not hidden** (THREAT-MODEL.md): who connects to which node; how many blocks a node takes in (counts); when (timing). The machine that stores the bytes sees what it is handed (What stays public). One host that carries both sides sees who deals with whom, whatever is sealed. A sender who minds sizes pads; one who minds the network uses a link that hides it.

*core* (the table and What is not hidden describe what the blocks show; nothing in them binds); *her word* (`terms.backing`). From 1.8 A1; seat 41 (the later buyer, backing); seat 43 (the host rows).

**World (the later buyer).** 3b-7's world B: Sam holds Harry's H50 only as its header: `ownership(Q)` `{ not_shown: true, lacks: [H50] }`. **World (backing).** (1) Harry H0, H1 sacks Q and R; H2, sealed to Amara: R to Amara. (2) Harry H3 offers Q to Sam with `terms.backing` 300 GBP, condition a ruling by Gita, whom both name. (3) Sam S1 accepts. Sam holds H2 only as its header. Expect `ownership(Q)` for Sam `{ not_shown: true, lacks: [H2] }`; `read(H3)` true, its backing term read.

**New file `spec/patterns/lots.md`:**

> **Selling from lots.** A seller who would not name one buyer to the next keeps three kinds of key: one that brings keys in and signs nothing else; one that holds the stock and signs only parts passed; and one per lot that accepts its part and sells from it. A later buyer then holds the parts passed (amounts and times), the key grants (how many and when), and her own lot's line. She is not shown who else bought. She is shown how much and when.
>
> **What it takes**, against a plain sale: for the seller, five blocks a sale where one did (the key grant, said again, the part passed, its accept, the sale); a wait on the issuing voice for each new key, unless made ahead; for the buyer, nothing more. It suits a mill or a warehouse with many buyers who read its title. For a spot sale, goods in hand and cash in hand, nobody reads the line, and nothing is needed.

Pattern: adds no rule. From seat 41 §6, §8 (its cost table, shown).

**Line 47, the privacy invariant.** Kept as 1.8 A1's text ("A sealed block names no recipient ..."). Its number is given by Job E1.

#### A2. `spec/modules/nodes.md`

- **Line 37, unsigned pull.** Kept as 1.8 A2. *convention*.
- **Push, the sentence after `for`.** Changed:

> That id may be one made for this counterparty (privacy.md, Keeping apart). It is all a carrier is told of the reader; a copy wrapped to a mailbox tells it only the mailbox. By carrying it also sees who wrote the block, the copy's size and when. A carrier is bound to silence on none of it unless it signed so.

<!-- REMOVED "A carrier owes silence on none of it unless it signed so." | guarded: nobody's thing; "owes" leaves protocol text (00-shared, One vocabulary) | now: "is bound to silence on none of it", the same meaning. -->

- **Line 44, which copies a node keeps.** Changed:

> - **Which pushes a node keeps a sealed copy from is its admission rule** (What a node does): a signed push, a key the reader gave the pusher, or any other it states. A handed-on copy never takes the place of the author's. A node sent an opened body as a plain message from anyone but its author keeps it as a copy for the reader the push names, and serves it to no one else.

<!-- REMOVED "A copy for a reader the push names is kept when the signer is the block's author, or, when it is not, under the node's admission rule for that signer" and "An unsigned push brings no copy." | guarded: nobody's thing; it made the protocol choose a host's admission rule, and so forced the leak a wrapped copy avoids (seat 43 B5) | now: the node's own admission rule, its signed word; a handed-on copy still never replaces the author's. -->

*convention* (a node's word). **World.** As A1's wrapped copy: a push of the wrapped copy, unsigned, to a node whose admission rule states "a key the reader gave the pusher": `accept` keeps it; to a node whose rule states only signed pushes: kept nowhere, `taken: []`.

- **Line 15, a receipt to a pusher.** New: "A receipt sealed to a pusher names only what that pusher's push added." *convention*. From seat 43 B8. **World.** Sam and Leila each push one block to Wanjiru's door in one second; her receipt sealed to Sam names Sam's block only.
- **The host's promise, Her address, Discovery's `speaks_for`, Finding.** Kept as 1.8 A2.

#### A3. Elsewhere

Kept as 1.8 A3, whole: `identity.md` One person, many keys; the passkey sentence (beside CORE-SET 3d-13, which it does not repeat); `promises.md` `show` out; `folds.md` `show` output out; `encoding.md` line 119; `transport.md` line 8; `consent.md` two words; `custody.md`, With no key.

#### A4. Refused

Moved to section 5 of this text, with the rest.

#### A5. `protocol.json`

Kept as 1.8 A5: R `terms` `show`; R `folds.promise_stage.output.show`; R `header_optional` `withheld`; R `fields.every` `withheld`; R consent `word` values `keep`, `move`; R `messages.discovery` `speaks_for`; C `door.ops.header.result`; A `limits.message_bytes` `1048576`. (`messages.plaintext` `pad` is CORE-SET 3a-11.)

#### A6. Door ops

Kept as 1.8 A6, with `accept` changed: it takes the node's admission rule as stated (A2), and keeps a wrapped copy where that rule names its mailbox key.

---

### Job B. Rule sets by hash, read only by the block that names them

**Why.** Changed. "1.7" named at least 18 different rule sets (b2/19, run). 1.8 named a set by hash, then routed it into blocks that did not name it, and an old reader named a different owner on unchanged bytes (seat 32). 1.9 keeps the name and drops the route (D1).

#### B1. `spec/core.md`

**Line 3** ("Version 1.7, 2026-10-27."). Deleted, as 1.8 B1.

<!-- REMOVED "Version 1.7, 2026-10-27." | guarded: nobody's thing; a label | now: a rule set is named by its hash (section 11). -->

**Line 5** ("There is no earlier version in the protocol: 1.6 is year zero ..."). Deleted.

<!-- REMOVED "There is no earlier version in the protocol: 1.6 is year zero and 1.7 adds to it" | guarded: every signer, whose block must mean tomorrow what it meant | now: the landing rule (00-shared §1.4): after the lock a change ships only behind a byte in the block whose answer it changes; and a later rule counts only in a block that names it. -->

**Section 5, the `state.rule_set` bullet.** Deleted from this stage: CORE-SET 3a-13 writes `state.rule_set` as a field of every block, in section 1.

<!-- REMOVED 1.8 B1's section 5 bullet "`state.rule_set` (optional, any block) ... It is never read by `valid`" | guarded: nobody's thing; one rule in two places | now: CORE-SET 3a-13, its one home. -->

**Line 123** (profiles declare fields). Kept as 1.8 B1.

**Section 11.** Changed. In place of 1.7's "A signed block means tomorrow what it meant when it was signed" (lines 183 to 189), and keeping the sentences CORE-SET 3a-13 writes there:

> ## 11. Rule sets
>
> **A rule set is named by its hash**: the SHA-256, in lowercase hex, of the canonical bytes (canonical.md) of its manifest. A number such as "1.9" is a label for people; no reader reads it. Change one byte of a file the manifest names and it is another rule set.
>
> ```
> { "files": { "<path under spec/>": "<SHA-256 of the file's bytes>", ... } }
> ```
>
> `files` names exactly `core.md`, `canonical.md`, each file of `modules/` but `nodes.md`, `protocol.json` and `vectors.json`, and nothing else. The manifest is published beside them as `spec/rule-set.json`.
>
> *(CORE-SET 3a-13's sentences stand here: a block that names no rule set is read by the core alone; no set is read into a block from another block; a rule that refuses what a signer would never name is in the core.)*
>
> **Who runs which.** A reader runs the rule sets it chooses. A node lists in its discovery document's `reads` a rule set only when it runs a build made from that set's files.
>
> **What a signed block keeps.** Under the core, and under the set it states, a block keeps its bytes and id, whether it is valid, whom it speaks for, what it binds and who owns what it moves, and the rule beneath them all: only a signed word binds, and it binds only its signer, their name to its truth, what they pledged to its condition, their consent to another acting for them, never their body. What one can hand on is what one acquired or was handed; a body was never acquired, so no word hands it on (Kinsella, revising Rothbard).
>
> Ground: an idea is not property, so no one can own the rules or forbid a fork; a rule binds a signer only as the words she could read when she signed, so the name of the rules is the hash of those words.

<!-- REMOVED `continues` and `sound` from the manifest, and the paragraphs "The sound part and the read part", "Continues" | guarded: nobody's thing; they let a set claim to read another's blocks the same, checked only as far as its cases reach, and made a network of a file | now: a later rule counts only in a block that names it (3a-13), so no set needs to say it continues another; `valid`'s cases stay as vectors (Job D). -->
<!-- REMOVED "What a block means": "A deal is read under the rule set its first promise states ... A block that states none is read under each set its reader runs; where two give different answers, that reader has no answer" | guarded: nobody's thing; it made silent Leila an owner by Harry's set (seat 14) and an old reader name a different owner (seat 32) | now: read by the core alone, or by the set the block itself states (D1; 3a-13). -->
<!-- REMOVED "A fork is another rule set. It is clean when ... a split ... Nobody issues a rule set and nobody locks one." | guarded: nobody's thing; labels for whole networks | now: GOVERNANCE.md, "Anyone may publish one" (B3); the landing rule says what the lock is. -->

*convention* (the manifest; who runs which); *core* (what a signed block keeps).

**World.** `rule_set` over the spec files gives the id in `rule-set.json`; one byte added to `core.md` gives another id (1.8 §4 case 8, kept). For what a block is read under: 3a-13's world.

**`spec/modules/things.md`, Schemas: typed fields.** Kept as 1.8 B1 (a community types its own fields in its own schema, named by hash, and asks no one; a shape is `read`'s, never `valid`'s). *her word* (the schema); *convention* (the grammar). **World.** Kept as 1.8 §4 case 9 (the Kisumu co-op's `recalled_from:time`).

**Section 3, the `kind_fields` sentence.** Kept as 1.8 B1.

#### B2. `spec/modules/nodes.md`

**Discovery, line 75.** Changed: `{ protocol: "foodblock", reads, node, admission, endpoints: { pull, push, challenge }, log, signature }`, and add: "`reads` lists the rule sets the node runs (core.md, section 11): it lists one only when it runs a build made from that set's files. An index that answers a fold names in its signed answer the rule sets it runs (`reads`) and lists `lacks`; the answer is its own word."

<!-- REMOVED `sound` from discovery, "the hash of the sound part the node judges by" | guarded: nobody's thing; the sound part is no network (D1) | now: `reads`. -->

**"A node's promise" becomes "A node's word".** Kept as 1.8 B2, with every pointer it lists.

#### B3. `GOVERNANCE.md`

**Lines 13 to 17, "How versions work".** Changed, whole:

> ## How rule sets are named
>
> - **A rule set is named by its hash** (`spec/core.md`, section 11). "1.9" is a label. A change of one byte is another rule set.
> - **Anyone may publish one,** with no one's leave. A block is read under the set it states, or by the core alone.
> - **A release** is a person's signed word naming bytes by hash: an `observe` of kind `software_release` (patterns/releases.md) that names a rule set by its id, and each package and binary built from it by its SHA-256. It binds only its signer, to the truth that those are hers. No list on this page or anywhere says which releases count, and no one's release outranks another's. A reader picks whose release words she trusts and checks the bytes against their hashes.
> - A package carries its own package number; that is the package's business, not the protocol's.

<!-- REMOVED "What FoodX releases. FoodX lists below the rule sets it has released. It never changes a listed one ..." and "Released: none yet." | guarded: FoodX's buyers, against a changed release | now: FoodX's own release words, each naming its bytes by hash (part 10 R10, product); a list kept here was a shelf only FoodX stocked. -->
<!-- REMOVED "A fork is another rule set. It is clean when it keeps the same sound part ... a split when it does not." | guarded: nobody's thing | now: "Anyone may publish one"; line 21 says what a fork does to bytes. -->

**Line 9.** Kept as 1.8 B3 ("The files `spec/rule-set.json` names are the protocol."). **Line 21.** Stays as 1.7 wrote it ("a fork that changes how blocks hash or verify writes blocks that the others cannot read, and a fork that keeps it writes blocks everyone can").

<!-- REMOVED 1.8 B3's line 21 change "a fork that keeps the sound part is one network with the others (a clean fork), and one that changes it is another network (a split)" | guarded: nobody's thing | now: 1.7's sentence, which says the same about bytes without the two labels. -->

**"Who wrote it"** (seat 46 §6; part 10 R11). *Product, the owner's.* Proposed text, replacing "It holds no power over the protocol and plans no steward"; it lands only on the owner's yes:

> Nobody governs the protocol: it is an idea. In fact, the reader most people run decides what most blocks are read to mean, and today that is FoodX's. FoodX holds every account, name, address and key it uses to serve, name or sign FoodBlock bytes (for example, as of [date]: this repository's account, the package names in `DISTRIBUTION.md`, the paper's address, the key that signs its releases). Each is FoodX's as a mill is Sam's, and anyone may hold the like. What FoodX does with them is one signed block, named here by its id; a sentence on this page that is not in that block describes, and promises nothing.

**New file `spec/patterns/releases.md`:** the base schema for the kind `software_release` and one worked example: Kofi's release naming his fork's rule set and his two packages by hash, beside FoodX's naming its own; a reader holding both reads two signed words, and no fold reads either. Pattern: adds no rule. *convention* (the kind word: `software_release`, since `release` already means a side letting go of her own claims, promises.md, Rulings, and one word has one meaning; settled in building). Its field names, `rule_set` and `packages` or `files`, are the pattern's own (SILENT 3, settled in building).

**Product, not protocol** (part 10 R10; T5-2): FoodX's builders' word is a block of its own with six lines (releases, no reach of mine, fixes, until, my last word, whom this binds), as part 10 R10 gives it; no user accepts it.

#### B4. `protocol.json`

Changed from 1.8 B4: R `version`; R the text "year zero" (line 2, and `cbor.about`'s); R `optional_profiles` (Job D3); C `messages.discovery`: `["protocol","reads","node","admission","endpoints","log","signature"]`. (`fields.every` `rule_set` and `refusals.read` `unknown_rules` are CORE-SET 3a-13.)

<!-- REMOVED 1.8 B4's A `field_shape.rule_set`, A `refusals.read` `unknown_rules`, A `fields.every` `rule_set` | guarded: nobody's thing; one entry in two stage texts | now: CORE-SET 3a-13. -->

#### B5. Door ops

Kept as 1.8 B5: A `rule_set(files)` → `{ id, manifest }` (library); C `read` takes `runs?` (the ids of the rule sets this reader runs; default the one it is built from); `spec` gains `rule_set`, the id.

---

### Job C. Readings, renderers and the read-back

**Why.** New. A read-back is the one thing a person meets before her yes. Built today, it is free text the host writes, and nobody can check it against the block (seat 45 B1, shown). 1.9 makes it a published reading's answer, rendered by a published renderer, both named by hash, so a second reader with the same blocks makes the same text or names the block she lacks (part 09; T5-1).

#### C1. The test, `spec/core.md` section 10

**Line 161, the first paragraph.** Changed. In its place, `00-shared.md`'s The test, word for word, then:

> A stranger applies it in order: is it about what a machine does with a block, not what the block says? A node's own business. Delete it: can two readers with the same blocks now differ on who signed, whom it speaks for, what it binds or who owns? If not, a reading or library. If they can, it is protocol.
>
> How a deal settled is carried as signed facts (transfers, answers, a bench's word); a sum over them is a reading. Drafts, beliefs, goals, budgets and rankings stay on each person's own **node**, the software that holds their blocks and speaks for them.

<!-- REMOVED 1.8 C1's clause (2) "and the people who rely on that answer are not all signers of one block that could name the rule instead", with "If they can: could everyone who relies on the answer have signed one block that names it? Then a named reading" | guarded: nobody's thing; it let a rule leave the protocol by being named in a deal, the route D1 removed | now: Rule D: a chosen rule is a value in the word it binds, and the test needs no second clause (00-shared, Rule sets). -->

*convention* (the test sorts text; it binds no one).

#### C2. Where readings and renderers go

Changed from 1.8 C2:

- **`spec/readings/README.md`** (new): "Not normative. Each reading is computed from blocks and changes none of the four answers (core.md, section 10). Each is a text file with a cases file beside it, named as a rule set is named: the SHA-256, in lowercase hex, of the canonical bytes of `{ files: { <path under spec/>: <SHA-256 of the file's bytes> } }` over those two files (core.md, section 11). An engine runs a reading when it passes the reading's cases. A node may compute any; no block is read under one unless it names it." The files, and the text moved into them, are 1.8 C2's (`deals.md`, `things.md`, `circles.md`, `consent.md`, `machines.md`), with `owed_back` named `to_come_back` (D12; CORE-SET 3c-7), and one more: `readback` (C3).
- **`spec/renderers/README.md`** (new): "Not normative. A renderer turns one reading's answer into words in one language. It reads that answer only, never a block, reads no free text and classifies nothing. Each is a text file with its cases, named as a reading is." First files: `en`, `en-sms`.
- **`spec/conventions.json`** (new): every list code reads that is not the protocol: `envelope`, `messages`, `local_discovery`, `cbor`, `peers`, `profiles` (what node ops read of each profile; a profile's fields are declared by its schema, never here), `views`, and the door entries of every op not in `door.protocol`, with `door.classes`. Its first line: "A node's conventions and the lists of readings and tools. Not the protocol: no word reads this file (core.md, section 12). Two nodes that share it can talk." The conventions' opening line: kept as 1.8 C2.
- **`spec/profiles/`**: kept as 1.8 C2 (node conventions stay; `attestations`, `tax-recall`, `adapters`, `tasks`, `ballots`, `foodblock-profile-epcis` move to `patterns/`).
- **`spec/protocol.json`**: the protocol only. R `peers`, `modules`, `optional_profiles`, `views` and every door entry not in `door.protocol` (all but `modules` to `conventions.json`); `repeat` stays (D3: protocol); A `door.protocol` listing the 37 names of D2; `kinds` without `successor` and `close`.

<!-- REMOVED 1.8 C2's "a deal may name the rule set that holds one" | guarded: nobody's thing; a route (D1) | now: no block is read under a reading unless it names it. -->
<!-- REMOVED 1.8 C2's move of `profiles/successor.md` into identity.md, "After a death", and `optional_profiles.successor.close_rule` into `folds.identity.close_rule` | guarded: Harry's heirs | now: his own wills (D9; CORE-SET 3d-16 deletes the successor). -->

*convention*. One hash covers a file and its cases as a rule set's covers its files (SILENT 1, settled in building).

**Not a word list** (part 09 D2(b), in T5-1): a renderer renders signed facts and reads no free text. Meaning is not hardcoded in it: free text is quoted, never read.

#### C3. The read-back that can be redone

**`spec/profiles/short-form.md`, after the built read-back paragraph.** New (09 R1):

> **A read-back that can be redone.** A `readback` may also carry `state.reading` and `state.renderer`, each the name of a published file with its cases (readings/README.md); `state.read`, the sorted ids the reading read (its answer's `read`); and `state.digits`, the digits its text ends in. `refs.to` names the person it is read back to. Its text is then the renderer's output over the reading's answer for the block it is `for`, then one space, then the digits, and `readback` is the SHA-256 of that text's UTF-8 bytes. Anyone who holds the inputs runs the reading and the renderer and gets the same digest, or names the input she lacks. Words after the digits are the host's own and are not covered. A `readback` that carries `read` is sealed to the person and to the readers she names; a side of the deal is shown its digest only.

*convention* (a node's word; `observe` is an open type, so no answer changes, 09 §8 step 4).

**`spec/readings/readback`.** New (09 R2):

> The answer reads typed fields and ops only. Each id is given by its short code and the name its own signer signed, never a name another gave it. Each line that names an instance gives the draw the ownership fold gives that block on it, read on the blocks held: its `state` (`held`, `landed`, `freed`) or its `why` (one of `protocol.json`'s reasons a draw takes nothing); where that fold is not read whole, `not_shown` with `lacks`. A line that names no instance gives `draw: null`. A line about an instance a block names but does not draw on is given only where `read_whole` from the block to the instance is whole. A pair is given as both draws, each with its receiver and whether that receiver accepted. Each amount is given per side and per kind, as the most of hers that goes out and the least that comes in, at both ends of every range. Free text is quoted, never read. A field this reading does not read, or a block that states a rule set this reader does not run, is answered `not_read`, and nothing else is said of the block. The answer lists the blocks it read (`read`, sorted ids) and what it lacks (`lacks`). Each block read is read with its pieces, its `prev` back to its line's start, and the held blocks that answer what a fold read, so the blocks it read alone give the same answer. A person's name is the `name` of her own valid `actor` that `updates` her genesis; two such that do not see each other give none. The person the read-back is to (`refs.to`) is read as "you", and her own name is never read.

*convention*. Changed from 09 R2 in two places: the `why` list points to `protocol.json`'s one list (it gains `out_of_place`, CORE-SET 3b-1), and the answer names `read` and `lacks` (3b-9's shape), so a second reader can redo it.

<!-- REMOVED (not written) seat 45's `state.answer` in the read-back | guarded: nobody's thing; carrying it told Harry what Amara's node holds about Sam (seat 45 B9) | now: the answer is computed again from `read`. -->
<!-- REMOVED (in building) `state.inputs` as the read-back's list of ids | guarded: nobody's thing; one word with two meanings (a make's `state.inputs: [{ from, amount }]`, 00-shared, Field names) | now: `state.read`, the answer's own word for the ids it read. -->

The `draw` field on `gives` (09 R3) is stage 5's text and lands in the same set (SILENT 26). Stage 4 is built in both engines, so the lines that read it (a grant's worst case, a price range, a tool's transfer) are computed.

**World A (redo).** (1) Harry H0, H1 lot L7 10 sacks. (2) Harry H2 offers L7 to Amara at £300. (3) FoodX signs RB, an `observe` of kind `readback` `for` H2, `to` Amara: reading r, renderer `en`, `read` `[H0, H1, H2]` (H0 with the block Harry signs his name in), digits 47. Wanjiru's kiosk holds H0, H1, H2, runs r and `en`: the same digest. **World B (a lying host).** The same, with FoodX's text "no price": the kiosk's digest differs. **World C (a lacking reader).** The kiosk holds H0 and H2 only: it names H1 as lacking, and makes no digest. **World D (a pair).** Harry H2 and H2', a pair, L7 to Amara and to Leila; Amara accepted: the answer gives both draws `{ draw, to, yes }`, never `owners: []`; the line says Harry signed it twice, and Amara's draw, read alone (rule 4), is kept for her.

#### C4. What a person sees: twenty lines

*Product* (09 R4 to R7). The checked text names people by the name they signed and their short code. Her names for them are added by her own device, outside the digest (09 R5). A read-back tells a person what another's word has kept for her, and tells the other side what hers has kept for him. It never tells her that her own word keeps nothing aside, and never says "only". It names no rule set, prints no `n/d` (her `step` gives the figure), and never prints `needed` or `names`: it names, by name, who must hear a deal and who can stop it. Each line that shows a thing kept for someone names whose word frees it. **A line is said only where it changes what she would do.**

Each line copies one answer field. Nothing in this table is a new state.

| # | Line (English renderer) | Copies | Shown to | When |
|---|---|---|---|---|
| 1 | "yours" | draw `landed` | receiver | always |
| 2 | "kept for you, in Harry's hands, on his record as you hold it" | `held`, signer holds | receiver | before her yes, and until it lands |
| 3 | "held for you by Gita" | `held`, a holder holds | receiver, and the payer | always |
| 4 | "Harry's word; nothing set aside" | `draw: null` | the other side only | where he would act on it |
| 5 | "can't tell yet: 1 of Harry's blocks is missing" | `not_shown`, `lacks` | receiver | always, with a way to fetch it |
| 6 | "not Harry's to give: already another's" | `past`, `not_owner` | receiver | before her yes |
| 7 | "Harry signed it twice. Neither is shown as yours." | `pair` | each receiver | always |
| 8 | "freed: Harry may sell it again" | `freed` | both | once |
| 9 | "10 sacks, on Harry's word" | who stated the instance | receiver | where she pays before it comes |
| 10 | "You pay at most £210 in all" / "You may be paid as little as £88" | per side, per kind, both ends | each side | every deal with a range |
| 11 | "It can give away nothing of yours" / "...up to these 40 loaves" | `can_lose` (stage 4) | grantor | at a grant |
| 12 | "a copied key could show this to several sellers" | the meter is the holder's key | grantor | at a grant |
| 13 | "Your till may sell for as little as £3 a loaf. Every buyer can read this." | a range's floor, selling grant | seller | at a grant |
| 14 | "FoodX and your phone must both hear each deal. Phone off: deals wait." | the grant's clocks, by name | grantor | at a grant |
| 15 | "Only FoodX hears your STOP; if it misses it, FoodX pays you back." | one clock, FoodX's promise | grantor | at a grant with one clock |
| 16 | "done when he says so" (any differing term, as the term) | the term | the side it binds | every deal it is on |
| 17 | "an id you have no name for (JYR9-Z9VR)" / "first deal with this seller" | short code; her own record | her | every first deal |
| 18 | "3 readers; you can see only yourself" | sealed audience | a side not the author | sealed deals |
| 19 | "Your reader does not read one field here, so it cannot say what this binds you to. Nothing was guessed." | `not_read` | her | any block with such a field |
| 20 | "What it can move on your bank is your bank's limit, not this." | FoodX's own line | grantor | at a grant that pays |

Lines 11 to 14 read stage 4's `worst_case`, which both engines compute (09 R6). Amounts are printed as signed ("300 GBP"): a renderer holds no table of money signs. Lines 15 and 20 are FoodX's own promise, said as FoodX's. Privacy is said once, at set-up and at her first sale a buyer relies on later, in four facts (09 §6.4), the first of them "Not given" above. Her list's read-back at set-up adds one line from `receives` (E3; CORE-SET 3b-8): which of her keys things that come to her land on.

#### C5. What an old reader does

New, `spec/core.md` section 11, after Who runs which. Each clause points to its one home and holds no copy:

> **An old reader** answers less, never otherwise (shared rule 11). A block it cannot read hides what that block could name, never the rest of its line (folds.md, Read whole). A later rule counts only in a block that names it (section 11). A reader that stops at its own limit says how far it got and never names another owner (folds.md, opening).

And `folds.md`'s opening, CORE-SET 3a-12's sentence "Where it stops, it answers `not_shown`, with why, and never names an owner" gains: "Its `lacks` names, on each walk it did not finish, the first block it did not read."

*core* (rule 11; a reader holds no right to guess past what it read). The reason in `lacks` is `{ stopped: "depth" }` (section 8, SILENT 4, settled).

**World.** 3a-12's: Maria's starter, 6,000 makes, M1 to M6000, each from the last; Amara buys a jar from M6000. A reader whose limit is 1,000 makes: `ownership(jar)` `{ not_shown: true, lacks: [M5000] }`, with why; a reader that walks it: Amara. For a block it cannot read and a later rule: 3b-7's world B and 3a-13's world.

---

### Job D. Conformance

#### D1. `spec/core.md` section 12, What a builder implements

Changed:

> ## 12. What a builder implements
>
> A **word** is an output that answers one of the four questions of section 10; every other output is a reading. A reading a word needs is part of that word. No word reads a view, a profile, a pattern or a reader's clock.
>
> **The sound part** is `valid` and what it reads: the bytes (canonical.md and strict writing), the id, the header and the signature. Its ops are `hash`, `id_of`, `header`, `strict_text`, `verify`, `suite_of_key` and `valid`; its cases are those ops' cases in `vectors.json`. It answers who said these bytes, and nothing else.
>
> **The word ops** are the door ops that answer a word, listed in `protocol.json` `door.protocol` beside the sound part.
>
> An implementation **conforms for an op** when it reproduces every case of that op in `vectors.json`. It **speaks FoodBlock** when it passes the sound part and the cases of every word op. Any other builder conforms for the ops it passes, and says which. Readings, renderers, library tools and a node's conventions each have their own cases, which nobody must run.
>
> A door may keep blocks between calls (`mount`, `unmount`): an op given a mount answers exactly as it does given the same blocks, so a mount is no part of any answer.

<!-- REMOVED "reproduces every case of that op in `sound.json` and `vectors.json`" | guarded: nobody's thing; `sound.json` was the gate of a network (D1) | now: `valid`'s cases stay as vectors in `vectors.json` (00-shared, Rule sets). -->
<!-- REMOVED "a time is read against another only on a clock she named (blocks.md, Time)" from the word paragraph | guarded: every relier, against a reader's clock | now: blocks.md, Time and A named clock (CORE-SET 3d-1, 3c-6), its one home. -->
<!-- REMOVED "Passing the protocol ops is conforming." | guarded: nobody's thing | now: "speaks FoodBlock", which says what passing them is. -->

*convention*.

**World.** The dealer (D4) passes the cases of `hash`, `id_of`, `header`, `strict_text`, `verify`, `valid`, `read` and `promise_stage` on a one-to-one deal: it conforms for those eight ops, and does not speak FoodBlock.

#### D2. The ops, sorted

Changed from 1.8 C3. P protocol; R a reading; L library; N a node's own business.

**The sound part (7):** `hash`, `id_of`, `header`, `strict_text`, `verify`, `suite_of_key`, `valid`.

**The word ops (30):**

| Ops | Why a word |
|---|---|
| `read`, `needs`, `schemas_from` | a word is read only from a block this reader reads |
| `key_hash`, `signed_by_author`, `stands`, `key_timeline`, `identity_state` | whom a key speaks for, on what terms, and whether a word stands |
| `check_chain`, `fork_pairs`, `read_whole`, `past_of`, `sees` | a pair, a line read whole and the causal past decide what binds and what landed |
| `salted_hash` | an audience and a committed term are read only through it |
| `speaks_for`, `under_ok`, `backed`, `keeps_to`, `meter`, `lowest_offer` | whom a block speaks for and what a grant binds |
| `terms_total`, `count_of` | a deal's total (with `step`) and a count, read by the words above |
| `circle_state`, `circle_versions`, `members_then`, `row_holds` | who owns a circle's parts and whom a move `as` it speaks for |
| `ownership` | who owns what moved |
| `worst_case` | for `at_most` only (choices row 116) |
| `promise_stage` | for its words only, as 1.8 C3 lists them, with `owed` named `to_come` |
| `condition_holds` | for the protocol shapes (D3), on held blocks and named clocks; no `now` (CORE-SET 3c-6) |

Every R, L and N op: as 1.8 C3, with these changes: `owed_back` is `to_come_back` (R); `add_duration` moves from P to L; `short_reply_open` (N, the short form); `rule_set`, `mount`, `unmount` (L).

<!-- REMOVED `operators_of` from the protocol ops ("who answers for a machine") | guarded: nobody's thing: the operator grant is gone (DECIDED 1 of 2026-11-11; 00-shared, People) | now: a tool acts under a grant she gave (identity.md); stage 4 deletes the op. -->
<!-- REMOVED `add_duration` from the protocol ops ("a period's end") | guarded: nobody's thing; no rule adds a span to a date (CORE-SET 3d-1) | now: a period turns at the cutoffs of its clock (00-shared, Clocks); the op stays as a library tool. -->

*convention*. `identity_state` joins because CORE-SET 3b-8, 3b-11 and 3d-3 read its answer (which voice receives, which keys carry `passes`, her `clocks`). **Count:** 37 protocol (7 sound, 30 word); about 30 readings, 14 library, 24 a node's own business (**estimate**: 1.8 C3's counts moved by these changes; stages 4 to 6 of 1.9 may move them again).

#### D3. Everything else, sorted

Kept as 1.8 C4, with these changes (each from a decision or a CORE-SET change):

- **Terms.** `keepers` is `clocks` (D15). `step` (3e-7) and `in_hand` (3e-3) are protocol. `forfeit` and `repeat` are protocol (choices row 112). `pay_by` (read by Keeps to, D3) and `deliver_by` (read by Freed, D5) are protocol. `show` is gone.
- **Condition shapes.** Protocol: `accepted`, `deed`, `signal`, `opened`, `within`, `without`, `stopped`, `ruled` (it reads signed fields only: 05-deals R-H9), `reading` (the fold reads it as a condition that can never be shown, so it never holds: CORE-SET 3c-5), and `closed` (CORE-SET 3d-16; 05-deals R-H7). Named readings: `settled`, `paid`.
- **Fields.** Add as protocol: a voice's `receives`, `above`, `passes`; `state.counted_to`; `state.rule_set`.
- **Profiles.** `successor` is deleted, not moved (3d-16).
- **Statuses.** `lifted` goes (D6 of this text).

<!-- REMOVED "`reading`" from 1.8 C4's named readings | guarded: every reader, against a model's word deciding title | now: CORE-SET 3c-5: a bare reading can never be shown, so it never holds, and it never freezes. -->

#### D4. The dealer

Kept as 1.8 D4 (in `protocol.md`), the eight things, with two changes:

- **5. Reading a deal**, its last sentence: "A promise that carries a term, a schema, a condition or a `state.rule_set` it does not read, it holds not read and does not accept."
- **7. Settling**, appended: "It signs only what its own `read` reads (blocks.md, Micro safety)."

<!-- REMOVED nothing from the dealer's eight; both changes add. -->

*convention*. **Its cases:** `dealer` in `vectors.json`, twelve stories, each one fixed world:

1. **Accept:** Amara orders 10 sacks from Harry at £300, public: accepted; `promise_stage` binding.
2. **Accept:** the same, sealed to both: accepted.
3. **Accept:** Mama sells 3 mandazi for KSh 10, `step` 1 KES; Leila takes 2: accepted, total 7.
4. **Accept:** Amara's order with `expires` Friday and `pay_by` three days on: accepted.
5. **Refuse:** a message whose bytes are not canonical: `not_canonical`.
6. **Refuse:** a block whose id is not the hash of its bytes: `bad_hash`.
7. **Refuse:** a block whose signature does not open, one of them a passkey signature with flags `0x01` (3d-13): `bad_signature`.
8. **Refuse:** an order with a `state.rule_set` the dealer does not run: held not read (`unknown_rules`), not accepted.
9. **Settled:** cash in hand: Harry's transfer and Amara's `accepted` with `covers`: `done`.
10. **Settled:** a credit order paid later: Amara's payment, Harry's `accepted` with `covers` after the goods: `done`.
11. **Under a grant:** an order signed by Amara's AI under her grant, which the dealer cannot check: it declines to answer and asks for her own key.
12. **Tampered payment:** a payment whose body changed after signing: refused (`bad_hash`).

#### D5. Where a reading still reaches a word

Changed from 1.8 C5. Kept: items 1 and 2 (the settlement sum and `ruledFor` leave `ownership` and `condition_holds`, moved to `readings/deals.md`). `settled` and `paid` are named readings, as 00-shared (Named readings) and 05-deals say: the core runs none, so a condition that names one, with no `state.rule_set`, is not read (`condition_holds` null), never holds, and what it holds stays held; a block that states a set this reader does not run is `unknown_rules`. There is no `reading_not_run` (05-deals: one fact, one code). Changed: item 3: `readingConditionHolds` leaves `ownership`, and the fold reads `reading` as CORE-SET 3c-5 says. `protocol.json`: `condition_shapes_class` as D3.

<!-- REMOVED 1.8 C5's `reading_not_run` and `ruled` as a named reading | guarded: nobody's thing; a second code for `unknown_rules`, and a ruling is a signed word every node reads | now: 05-deals (R-C3, R-H9), built in both engines. -->
<!-- REMOVED 1.8 C5 item 4 ("`owner` reaches a reader's clock ... `ownership` and `condition_holds` lose `now`") | guarded: every relier, against a reader's clock moving goods | now: CORE-SET 3c-6, its one home. -->
<!-- REMOVED 1.8 C5 item 5 ("`owner` reached `profiles/successor.md`") | guarded: Harry's heirs | now: his own wills (D9; 3d-16); `yieldsToSuccessor` is deleted, not repointed. -->

#### D6. The machine lock and the fence

Kept as 1.8 C6, whole (choices row 111).

---

### Job E. Tidying

#### E1. The invariants

Changed from 1.8 D1. The rule is kept: the invariants that are protocol are numbered 1 to N in file order; the others stay beside their text, unnumbered, prefixed "Holds:"; every pointer "(invariant N)" and the vectors' `invariants: [n]` tags are rewritten by the map. The table is made at build from the texts as they land, with the privacy invariant last.

**Built (stage 7 compare):** 28 protocol, numbered 1 to 28 in the Files-list order of `spec/protocol.md`; 8 stay beside their text as "Holds:". Old -> new (old 1.7/1.8 numbers, as in the vectors' `invariants` tags): 1->1, 2->2, 3->3, 25->4, 29->5 (moved from consent.md into core.md, as 1.8 D1), 8->6, 19->7, 11->8, 12->9, 13->10, 14->11, 15->12, 22->13, 32->14, 6->15, 7->16, 9->17, 10->18, 23->19, 27->20, 26->21, 4->22, 5->23, 37->24, 38->25, 31->26, 20->27, 17->28 (privacy, last). "Holds:" (no number): 18 (nodes.md), 24 (things.md), 28 (encoding.md), 30 (consent.md), 33, 34, 35, 36 (promises.md). Old 39 to 43 have no text left in `spec/`; their tags are dropped. Table by file: core.md 1-5; identity.md 6-7; promises.md 8-14; authority.md 15-19; circles.md 20; folds.md 21-26; consent.md 27; privacy.md 28. Calls: 20 (consent follows the principal) is numbered, not "Holds:" as in 1.8, because consent.md is now a protocol module and without it two readers differ on what a STOP binds; 30 stays "Holds:" (a host's witness, a node's word); 33 to 36 stay readings; 12 is kept beside 26 as 1.8 did. Consent's 27 sits before privacy so that privacy is last.

<!-- REMOVED 1.8 D1's table of 32 | guarded: nobody's thing; its numbers counted 1.8's stages 3 to 6, which 1.9 rewrites | now: the same rule, run on 1.9's texts at build. -->

#### E2. The CBOR key table

Kept as 1.8 D2, the rule, with its last sentence changed: "A later table appends a new name at the end and never moves or empties one." The table is `conventions.json` `cbor.keys` (a convention: no word reads it); `tools/cbor-table.cjs` makes it from `protocol.json`, and `--check` fails when it is out of date. Nothing is locked yet, so 1.9's table is made whole by the rule (settled in building): positions 0 to 9 `type`, `state`, `refs`, `author`, `prev`, `seq`, `at`, `audience`, `key`, `hash`, then every other name `protocol.json` lists for a block's `state`, `refs`, `terms`, `scope`, a line, a voice, a row, a shape or a kind field, once each, by UTF-8 bytes: 153 names (**measured**). From the lock on, a later table only appends. The names 1.8's list expected (`to_come`, `to_come_on`, `to_come_back`, `destination`, `destinations`) are in no block-field list of `protocol.json`, so the rule leaves them out; they travel as text, as a schema's names do.

<!-- REMOVED "A rule set that continues this one appends a new name at the end" | guarded: compact-form readers, against a moved position | now: "A later table appends a new name at the end", the same guard without `continues`. -->

#### E3. Dangling pointers

Kept as 1.8 D3, the rule (repoint or delete by search until a search for every deleted heading finds nothing), with: "(identity.md, After a death)" becomes a pointer to the will's section (3d-16); "keeper" and "keepers" become "clock" and `clocks`; "owed" becomes "to come"; "(sound.json)" is deleted.

#### E4. `spec/protocol.md`, whole

Changed. Replace the file with:

```markdown
# FoodBlock protocol

This is the index. A block is `{ type, state, refs }`, signed by its author; its id is the hash of its bytes. The one shape is a promise: *if this happens, this of mine becomes yours*. Each rule is stated once, in its home file; where files disagree, core.md governs, then the file that owns the rule. A rule set is named by the hash of `rule-set.json` (core.md, section 11); "1.9" is a label.

## Files

The protocol (named in `rule-set.json`):
- `core.md`: a block, types and verbs, suites, numbers and text, the genesis, the line, messages, `valid` and `read`, the test (section 10), rule sets and old readers (11), what a builder implements (12).
- `canonical.md`: the one byte form.
- `modules/blocks.md`: other fields, causal order, time, a named clock, the cut, finality.
- `modules/identity.md`: voices, keys, tools, `refs.key`, a close, a will.
- `modules/things.md`: things, makes, transfers, schemas.
- `modules/promises.md`: what a promise is, terms, answers, who may bind, settling, disputes.
- `modules/authority.md`: grants, who a block speaks for, blocks that bind, a limit along a line.
- `modules/circles.md`: owners in parts, rows, members.
- `modules/folds.md`: a line, what is left, ownership, a fork, a promise's stage, counts.
- `modules/privacy.md`: what stays public, not given, commitments, audience, the header, handing on, keeping apart.
- `modules/encoding.md`: bytes, shapes, limits.
- `modules/consent.md`: a STOP is a block, and changes what binds no one.
- `protocol.json`: every closed list, read by code. `vectors.json`: the cases of the sound part and the word ops.

Beside it, not the protocol:
- `modules/nodes.md`, `transport.md`, `conventions.json`, `profiles/`: a node's conventions and words.
- `readings/`, `renderers/`: readings any node may compute, and renderers of their answers, each named by its hash, with its cases.
- `patterns/`: schemas and worked examples; they add no rule.
- `schemas/`: the base schemas as signed things.

## Peers

Conformance is per op (core.md, section 12). The sizes below are a builder's choice, not a rule.

| Peer | Does | Conforms for |
|---|---|---|
| Micro | measures, signs, buffers, sends | `hash`, `id_of`, `header`, `verify` |
| Micro that acts | adds: checks the grants it acts under, obeys a stop on arrival | adds `valid`, `under_ok` |
| Dealer | takes one deal and answers it (below) | `hash`, `id_of`, `header`, `strict_text`, `verify`, `valid`, `read`, and `promise_stage` for a one-to-one deal |
| Edge | adds local pull and push, its own deals, offline | adds the identity and line ops, `promise_stage`, `ownership` |
| Node | holds a person's or a machine's blocks; serves pull and push | the sound part and every word op: it speaks FoodBlock |

Only people and machines hold nodes. A business is a circle of them, never a node.

**A dealer** (the eight things and its twelve cases, as `changes-1.9/07-last.md` D4 gives them).

## Invariants

Each is stated in its file under its number (the table made at build).

## Glossary

One word, one meaning. Each is defined in its home file; the line here is a pointer.
- **valid**, **read**, **not read**, **unjudged**, **pieces**, **header** (core.md, section 8).
- **line**, **in its place**, **start**, **read whole**, **`not_shown`**, **`lacks`**, **pair** (folds.md, A line; A fork is a burden).
- **stands**, **waiting**, **the cut**, **an end**, **relier**, **seen** (blocks.md). **clock**, **receipt**, **cutoff** (blocks.md, A named clock).
- **voice**, **a key under a voice**, **tool**, **`refs.key`**, **a close**, **a will** (identity.md).
- **measure**, **draw**, **holds**, **lands**, **freed**, **let go**, **amount** (folds.md, What is left; encoding.md).
- **grant**, **keeps to**, **`refs.meter`** (authority.md).
- **request**, **bench**, **due**, **final**, **`crossed`**, **to come** (promises.md; folds.md).
- **circle**, **part**, **row**, **move**, **hand**, **unissued** (circles.md).
- **type**: what kind of block it is. **deed**: something done in the world.
- **commitment**, **reveals**, **audience**, **handing on**, **a wrapped copy** (privacy.md). **schema** (things.md).
- **word**, **reading**, **the sound part**, **speaks FoodBlock** (core.md, sections 10 and 12). **rule set**, **`unknown_rules`**, **an old reader** (core.md, section 11). **a named reading** (promises.md). **a mount** (core.md, section 12).
- **renderer**, **read-back** (renderers/README.md; profiles/short-form.md). **a node's conventions** (`conventions.json`). **software release** (patterns/releases.md). **pattern** (patterns/). **a node's word** (nodes.md).

## Open questions

- **Ranking.** How a person's node weighs closeness. The protocol says nothing.
- The rest is in THREAT-MODEL.md, What the protocol does not keep.
```

<!-- REMOVED from 1.8's protocol.md: `sound.json` in Files; **sound part** as a network, **read part**, **continues**, **clean fork**, **split**; **keeper**; "line: one key's blocks by `seq`"; the successor; the invariants table of 32; the dealer's text duplicated in the index | guarded: nobody's thing | now: D1 for the network words; CORE-SET 3b-1 for the line; D15 for clock; D9 for the will; Job E1 for the table; D4 here, the dealer's one home. -->

#### E5. `spec/THREAT-MODEL.md`

Kept as 1.8 D5, with these changes:

- Line 1 becomes "# FoodBlock 1.9 threat model"; line 3 "**Draft for Patrick, 2026-11-16. Not published.**"; line 8 adds "and the stress test and plan of 2026-11-12".
- **The attackers' table.** Row **A node operator or host**, Can: "store, drop, delay; see everything public; see what it is handed (privacy.md, What stays public); if it runs her AI, see what her AI reads". Row **A rival rule set**, Cannot: "be read into a block that does not name it (core.md, section 11)".
- **The kept table.** Row W: "A rule set is named by its hash, and read only by a block that names it."
- **What the protocol does not keep.** Delete "**Continues** is shown only as far as the earlier set's cases reach" and "**A death with no successor** ends nothing". "A renewing limit is read on her clock: with a keeper of one" becomes "with a clock of one"; "Delay and order by a sole keeper" becomes "by a sole clock". "**What a carrier sees**" becomes: "A node that carries a sealed copy sees what it is handed (privacy.md, What stays public). Only its signed refrain covers its silence; a stranger sees none of it." Add, one line each: **Proof to everyone** (privacy.md, Not given); **One host for both ends** sees who deals with whom, whatever is sealed; **A later buyer** sees the amounts and times of every earlier sale on the seller's line, unless the seller sells from lots or backs his title.
- **What the protocol refuses.** Kept as 1.8 D5, with section 5's list of this text.

<!-- REMOVED "Continues is shown only as far as the earlier set's cases reach" | guarded: nobody's thing | now: `continues` is gone (Job B). -->
<!-- REMOVED "A death with no successor ends nothing" | guarded: Harry's heirs | now: his wills (D9). -->

#### E6. `spec/NECESSITY.md` and `tools/necessity.cjs`

Kept as 1.8 D6, with: the Method paragraph drops its last two sentences ("Clause 2 ... no script measures it"), and item 2 reads "the sound part and the word ops' cases only (`vectors.json`)".

<!-- REMOVED "Clause 2 (could the reliers have named it) is a judgment, written beside each thing that needs it" | guarded: nobody's thing | now: the test has no clause 2 (C1). -->

---

### Job F. The mount

Kept as 1.8 Job E, whole, with one phrase changed: "and no rule set but the door's" becomes "and runs no rule set but those the door runs". *Library*; changes no answer. Its four cases are kept.

---

## 3. The counts, 1.8 beside 1.9

| | 1.8's stage 7 | 1.9's stage 7 | How known |
|---|---|---|---|
| Protocol ops | 38 | 37: 7 sound, 30 word | D2 |
| Rule-set words | sound part (a network), read part, continues, clean fork, split | the sound part (cases only) | Job B |
| Manifest keys | `continues`, `files`, `sound` | `files` | Job B |
| Grains of keeping apart | 3 | 4 | Job A |
| Rows of "what each one learns" | 7 | 9 | Job A |
| Read-back | free text | a reading's answer, rendered, redone by digest | Job C |
| Lines a person can be shown | none listed | 20, each from one answer field | C4 |
| Dealer cases | 12 | 12 | D4 |
| This text | 15,550 words, 93 KB | about 12,700 words, 72 KB | measured |

---

## 4. Vectors

**Re-signed by this stage:** only what Job A changes in bytes, as 1.8 §4 (blocks with `withheld`, `terms.show`, consent `keep` or `move`, machine locks with `how`, `placer`, `safe` or `reach`).

**Files.** `spec/vectors.json` keeps the sound part's and the word ops' cases. Beside it: each reading's and renderer's own cases file, named with it (`spec/readings/readback.cases.json`, `spec/renderers/en.cases.json`, `en-sms.cases.json`; settled in building: a file's cases are part of its name, so they sit beside it), and `spec/conventions-vectors.json` for the ops in `conventions.json`. Every case moves by its op's class; none is deleted.

<!-- REMOVED `spec/sound.json` as a file of its own, with `canonical-vectors.json` folded into it | guarded: nobody's thing; a gate (D1) | now: the same cases in `vectors.json` under their ops. Whether a separate file is wanted stays open (SILENT 14). -->

**Door cases that leave conformance:** as 1.8 §4, with `owed_back` named `to_come_back`.

**Cases that change answer, and are meant to:** as 1.8 §4, less the `ownership` cases given `now` (CORE-SET 3c-6) and less the discovery `sound` field; plus every `accept` case of a sealed copy from an unsigned push (the admission rule decides, A2).

**New cases**, each a fixed world given above or in 1.8:

1. An unsigned pull and a sealed block (1.8 case 1; A1's world).
2. Handing on (1.8 case 2).
3. A handed-on copy is kept under admission, never in the author's place (1.8 case 3).
4. A key for one counterparty (1.8 case 4; A1 Keeping apart's world).
5. The privacy invariant (1.8 case 5).
6. A line holding a sealed block: Sam's `ownership(Q)` `not_shown`, `lacks` the header (A1, What stays public's world). Changed from 1.8 case 6, which said `{ whole: false }` for the whole line.
7. The manifest (1.8 case 8).
8. A schema types a field (1.8 case 9).
9. The lock (1.8 case 12).
10. Discovery states `reads` and no `version`, no `sound`.
11. The dealer, twelve stories (D4).
12. The mount, four cases (Job F).
13. Necessity pairs, one per protocol row (E6).
14. Deniability (A1, Not given's world).
15. Showing a deal and a refrain (A1's world).
16. Padding sizes (A1, Sealed messages' world).
17. A wrapped copy (A1, Keeping apart's world), and the admission rule's two answers (A2).
18. A receipt to a pusher names only that push's blocks (A2).
19. A seller backing his own title (A1's world).
20. The read-back: redo, a lying host, a lacking reader, a pair (C3, worlds A to D); and one case per line of C4's table, with the exact text expected, for `en` and `en-sms`.
21. An old reader that stops: `lacks` names the first block not read (C5's world).

<!-- REMOVED 1.8 case 7 (`state.rule_set` unknown) | guarded: nobody's thing | now: CORE-SET 3a-13's world. -->
<!-- REMOVED 1.8 case 10 ("Title until paid", a `{ paid: deal }` condition with no rule set) | guarded: Femi, whose mixer stays his until paid | now: the payee's own signal (`{ signal: "paid", by: [Femi] }`) and Paid only by the payee's word (00-shared, Amounts); how a block naming the named reading `paid` is read is stage 5's (SILENT). -->
<!-- REMOVED 1.8 case 11 ("No word reads a clock", with keepers) | guarded: every relier | now: CORE-SET 3c-6's world. -->

**The random-world test** (part 08 §7.2) adds, for every world, block and viewer's held set (09 §7): the core and the oracle give the same read-back digest; shuffling or adding unrelated blocks leaves it unchanged unless a pair was added; adding a block the viewer lacked changes the answer only where that block was in `lacks`, or is a pair; no answer has an empty owner where a held signed draw names a receiver; every line showing a thing kept names a freer who exists and can sign; every `en-sms` decision text is at most 160 GSM-7 characters; no rendered text holds `n/d`, a rule-set hash or a `needed` count.


**The end pass (the step right after the stage 7 compare), in order.** Nothing here was regenerated by the compare.
1. Re-sign what Job A changes in bytes (above), and drop `sound`, `version` and `speaks_for` from every discovery and announcement case.
2. Regenerate `spec/vectors.json` from both engines, then check they agree: every `accept` case of a sealed copy (the admission rule, `copies`, `wrapped`), every `answer_pull` case that served a stranger a sealed header (it now serves nothing), the `machine_lock` cases (no `lifted`, `{ locked, locks, claimed }`), the two genesis cases "with an author" and "with a seq" (`chain`, not `bad_genesis`: 00-shared, A genesis), the blocks with a profile's field and no schema (`undeclared_field`: a rekey's `epoch`), `worst_case` where a part and a promise sell one instance (counted once), and every `cbor_short` byte string (the table is now `conventions.json` `cbor.keys`, 153 names, made by `tools/cbor-table.cjs`).
3. Move each case by its op's class (D2): protocol ops stay; reading, library and node ops go to `spec/conventions-vectors.json`.
4. Add the 21 new cases above. Item 20's read-back cases are already published as the cases files; the end pass only checks both engines still pass them (`cargo test --test stage7 the_published_cases_of_the_read_back`, `node test/audit/k3-readback.cjs`).
5. Rewrite each case's `invariants: [n]` tag by the E1 map; drop the tags of old 39 to 43 (no text is left for them).
6. Re-publish the base schemas (`node sdk/javascript/test/make-schemas.cjs`, already run once: 28 of 51 ids changed when `of_members` and roles left) and repoint any vector that names a schema id.
7. `tools/version-sync.cjs` reads `protocol.json` `version`, which is gone: teach it to take the package version from one package file before running it with `--write`.
8. Then `node test/necessity.cjs` and E6's measure (`tools/necessity.cjs`, still 1.7's shape: it reads `P.powers`), once.

---

## 5. Refused, and written down as refused

Each was proposed and shown to harm someone, or to buy nothing. The shared list (`00-shared.md` §4) holds 1, 2, 11, 12 and 13 below; this stage writes them into THREAT-MODEL.md, What the protocol refuses, with the rest.

1. **Rule sets as swappable code, routed by "the word that gives authority".** Silent Leila is made owner by Harry's set (seats 14, 15, 32; shared 1).
2. **"Else the set her list states."** An old reader names a different owner on unchanged bytes (seat 32; shared 2).
3. **`sound.json` as a gate, `continues`, clean forks and splits.** They made a network of a file and let a set claim to read another's blocks the same (D1).
4. **A shelf of releases** that says which count. A release is its signer's word; a list kept by one party is a boss (seat 46; T5-2).
5. **Sealed sender.** A deal goes back and forth, and statistical disclosure links a hidden sender in a handful of messages (1.8 A4).
6. **Mixnets and cover traffic.** They take delay and constant traffic that a person paying per megabyte and often offline cannot pay (1.8 A4).
7. **Private retrieval.** The node already knows which copy is hers; it would hide what is not secret (1.8 A4).
8. **A relay** in front of a host. It hides where from, never who, and adds a party; a wrapped copy hides more (seat 43 B3).
9. **Counter skips by default.** They do not hide a count: Harry divides by five and is within 11% (seat 43 B2).
10. **A public list of every key a host holds.** It is a map for anyone who seizes it (shared 11).
11. **A signature only the two sides and their judge can check.** The judge could then write her orders (seat 42 B2; shared 12).
12. **Publishing a one-deal key afterwards, to make its words deniable.** Anyone could then sign a twin and wipe out a later buyer (seat 42 B4; shared 13).
13. **`state.answer` in the read-back.** It tells the other side what her node holds about a third (seat 45 B9).
14. **Name matching in the checked text** ("two held things share a name"). A Cyrillic о beats it, and a table of look-alikes is a lookup table (seat 45 B6). In its place: "an id you have no name for", "first deal with this seller".
15. **The rules line on a screen** ("Rules: FoodX 1.8 ..."), **`held: true/false`**, **"her word only"**, **printing `needed`, `names` or `n/d`.** Each told her nothing she would act on, or something false (09 §3).

---

## 6. What changes for each built engine operation

Built ops are those in `protocol.json` `door.ops` today (105). Only the ops below change answer, shape or class because of this stage; every other op keeps its answer and moves class only as D2 says.

| Op | What changes | Why |
|---|---|---|
| `answer_pull` | an unsigned asker, or one with no copy, gets no sealed header | A2 |
| `accept` | which sealed copies it keeps follows the node's stated admission rule (`choices.copies: { signed?, handed_on?, unsigned?, mailboxes? }`, the push as `{ signer?, for? }`); the answer adds `copies: [{ hash, for, from }]` and `wrapped: [{ mailbox, bytes }]`; a rule that states nothing keeps no copy | A2 |
| `push_answer` | a receipt that names a block not in that answer's `taken` is refused (`shape`) | A2 |
| `header` | no `withheld` | A5 |
| `open_copy` | no `withheld`; padded plaintexts open (3a-11) | A5 |
| `seal` | may pad to the sizes of A1 | A1 |
| `consent` | reads `yes` and `stop` only | A3 |
| `promise_stage` | no `show` output; `owed*` named `to_come*` (3c-7) | A5 |
| `condition_holds`, `ownership` | the settlement sum, `ruledFor` and `readingConditionHolds` leave them | D5 |
| `read` | takes `runs?`; adds no profile's fields (a profile's fields are its schema's) | B5, C2 |
| `machine_lock`, `fence_reading` | move to readings; `{ locked, locks, claimed }` | D6 |
| `spec` | its answer gains `rule_set` | B5 |
| `operators_of` | leaves the protocol ops (deleted with the operator grant, stage 4) | D2 |
| `add_duration` | leaves the protocol ops; library | D2 |
| `owed_back` | named `to_come_back`; a reading | C2 |
| discovery (`well_known`) | `reads`; no `version`, `sound`, `speaks_for` | B2, A2 |
| new: `rule_set`, `mount`, `unmount` | library | B5, Job F |
| new: `readback`, `render`, `readback_redo` | readings (C3) | C3 |
| `worst_case` | an instance the grant names in `refs.what` and each promise in `on` she sells from it count once, at the largest | 04-grants G18 (stage 7 compare) |

The read-back adds no protocol op: its fields are on an `observe`, an open type. Every engine, and every SDK through the door, reaches the reading and its renderers by three door ops of class reading: `readback(block, held, to?, renderer?, digits?)` gives `{ answer, text, state }`, `state` being the `observe`'s state an honest host signs; `render(answer, renderer)` gives the text; `readback_redo(rb, held)` gives `{ same, readback, lacks, not_run }`.

---

## 7. Build notes and the end-of-build checklist

Kept as 1.8 §5 and §6, in their order, with these changes: no `spec/sound.json` (its cases stay in `vectors.json`); `tools/rule-set.cjs` writes a manifest with `files` only; `spec/readings/readback`, `spec/renderers/en` and `en-sms` and their cases are run by both engines through `test/audit/k3-lib.cjs` and must give the same answer and digest on every case (09 §7); `yieldsToSuccessor` and `fold/successor.rs` are deleted, not repointed; the fuzz (`tools/fuzz`) asks the 37 protocol ops first, then the readings and the read-back, with the properties of section 4; the search adds `keeper`, `owed`, `sound.json`, `continues`, "clean fork", `successor`. "Done means" is kept, with "`rule-set.json` naming that tree" and no release signed by the checklist.

---

## 8. Open, and SILENT

**Still open from 1.8 §7,** kept where nothing in 1.9 closed them: a thief who takes her top voice; a firm offer with no end and no clock; a carrier knows who deals with whom; money as a plain unit word; who connects to which node is not hidden; a key that writes public and sealed blocks; a key under a voice when a voice above it moves (00-shared, Open); delay and order by a sole clock, and a total wall between two people whose only route is one host; real passkeys from six clients; ranking. Closed since 1.8: `step` (3e-7), the successor (D9), `continues`.

**From part 09 §10, open:** the glossary for free text in a unit field (quotes only, unproven); a stranger who copies a real seller's self-signed name; Swahili, Dholuo and spoken read-backs, not counted (a non-GSM letter cuts an SMS to 70 characters); whether the digits are worth anything once shown.

**SILENT here** (no source says; nothing was invented to fill it):

1. **How one hash names a file and its cases.** **Settled in building:** as a rule set is named, the hash of the canonical manifest over the file and its cases (readings/README.md).
2. **What language a reading or renderer file is written in.** **Settled in building:** text, as the protocol's own files are; each engine implements it and runs it only when it passes its cases. Two engines run the same file when both pass the same cases.
3. **The field names of a release.** **Settled in building:** the pattern's own: `rule_set`, and `packages` or `files` (a map of name to SHA-256); the kind is `software_release`.
4. **The name of the reason in `lacks` when a reader stops at its limit.** **Settled** by the shared ground: `{ stopped: "depth" }`, after the first block it did not read (00-shared, `not_shown`, `lacks`, `read`). The limit is the reader's own setting, never a door argument.
5. **Whether a clock may receipt a sealed word it cannot open.** Seat 43 B6 says a sealed word counts as arrived only when a copy that opens has arrived; that is clock text (CORE-SET 3d), not written here.
6. **"Pass" with two meanings.** "A part passed" (00-shared, Draws) and a voice's `passes` (D11) are two words on one root. The lots pattern says "parts passed" only.
7. **"Lot".** The lots pattern uses "lot" for a measure a per-lot key holds; question 3 uses it for a measure too (SILENT 2). One meaning, unless the owner says otherwise.
8. **Whether `sound.json` stays as a file** (SILENT 14): this text keeps `valid`'s cases in `vectors.json` and names no other file.
9. **How a block names the named reading `paid` or `settled`** ("a deal may name one by hash", choices row 107): by `state.rule_set` (05-deals). `ruled` is protocol (R-H9).

---

## 9. Asks of the shared ground

1. **New words**, for `00-shared.md` §2: **the sound part** (`valid` and what it reads; its cases; no gate); **speaks FoodBlock**; **reading** as a file named by hash; **renderer**; **read-back** (the `readback` with `reading`, `renderer`, `inputs`, `digits`); **release** (a person's signed word naming bytes by hash; no shelf); **a wrapped copy** and **mailbox**; **an old reader**.
2. **Rule 6 (What stays public)** says "A carrier sees who wrote, for whom, how big and when". This text says the same, longer (seat 43). Ask: replace rule 6's last sentence with A1's carrier sentence, or point to it.
3. **§4 Refused** gains items 3, 4, 8, 9, 13, 14 and 15 of section 5.
4. **`identity_state`** is a protocol op (D2). Ask: name it beside the identity fold.

---

## What building changed (stage 7, 2026-11-19 and 20)

The two builders' guesses were laid side by side: the core's 26 items (`stage7-rust-silent.md`) and the oracle's 4 conflicts, 18 readings and the not-built list (`stage7-oracle-silent.md`), joined where they asked the same thing, and the splits found when each engine was asked the other's stories. Every story of this stage is asked of both engines: the oracle's (`spec/oracle/stage7/export.cjs` writes `sdk/rust/tests/fixtures/stage7.json`, 238 questions; `tests/stage7.rs`, `the_oracle_stories_of_stage_7`), the core's (`FB_RECORD=<dir> cargo test --test stage7`, then `node spec/oracle/stage7/rust-stories.cjs <dir>`, 69 questions), the read-back's published cases (`spec/oracle/stage7/export-readback.cjs`; `the_published_cases_of_the_read_back`), every read-back of the stories and random worlds through both engines (`node test/audit/k3-readback.cjs`, 10,108 distinct, `en` and `en-sms`), and the random-world test (`tools/fuzz/corpus/s07-last.cjs`, 215 questions). Where they split, the text was fixed first, by the centre, then both engines. Each answer is written in the entry it names.

| Question | Choice | Sentence changed (where) |
|---|---|---|
| The read-back: a door op (core) or a library (oracle) | no protocol op; three door ops of class reading, `readback`, `render`, `readback_redo`, the one way every engine and SDK reaches it | section 6 (last sentence, and two rows) |
| How a reading and a renderer are named (core: hash of the path text; oracle: hash of a JS file) | a text file and its cases file, named as a rule set is: the hash of the canonical manifest over the two; no name is written down; an engine runs one when it passes its cases | C2 (both READMEs); section 8, SILENT 1 and 2 |
| The read-back's answer and words (core: 12 lines, no "you", "£"; oracle: 20 lines, "you", "300 GBP") | the oracle's design in both: `refs.to` is "you", all twenty lines, amounts as signed (no table of money signs), a name from her own valid actor that `updates` her genesis | C3, C4 |
| `state.inputs`: a list of ids (read-back) or `[{ from, amount }]` (a make) | the read-back's is renamed `state.read`, the answer's own word; a make keeps `inputs` | C3; 00-shared, Read-back |
| What the read-back's `read` holds (core: what it read plus their causal past) | what the reading read, each with its pieces, its `prev` to its line's start, and the blocks that answer what a fold read: the blocks it read alone give the same answer | C3 (reading paragraph) |
| The text before the digits | the renderer's words, one space, the digits; the digest the SHA-256 of that text's UTF-8 bytes | C3 |
| A sealed read-back that carries `read` | a host's convention; no op checks it; pinned by a story in both (sealed to Amara, opened, redone: the same) | C3 (as written) |
| A pair with one yes (world D: core `held` for Amara, oracle `pair` for both) | rule 4: a draw of the pair with her yes is read alone; the line says he signed it twice | C3, world D |
| Stage 4 `worst_case` counted 40 loaves twice (a part and the promise that sells from it) | one measure is counted once: an instance in `refs.what` and each promise in `on` she sells from it count once, at the largest | 04-grants G18 and story 19 |
| `settled` and `paid`: `reading_not_run` (this text) or not read (shared ground) | the shared ground and stage 5: not read, never hold, `unknown_rules` for a stated set the reader does not run; no `reading_not_run`; `ruled` is protocol | D3, D5, section 6 (`read` row), glossary |
| 3a-5 against nodes.md line 37 | A2: nothing of a sealed block, not its header, goes to an asker for whom no copy is held | CORE-SET 3a-5; 00-shared rule 6 |
| `accept`'s admission rule (two shapes) | the core's: `choices.copies: { signed?, handed_on?, unsigned?, mailboxes? }`, the push `{ signer?, for? }`; answer `copies`, `wrapped: [{ mailbox, bytes }]`; the node's clock is its own, not in the answer | A6; section 6 |
| A wrapped copy's `bytes` (core: the message's JSON length) | the envelope's ciphertext as the host holds it (padded plaintext and its 16-byte tag): 4112 in A1's world; the wrap pads, and seals `{ copy, pad }` | A1 (as written) |
| A receipt to a pusher | `push_answer` refuses (`shape`) a receipt naming a block not in its `taken`, in both | section 6 |
| A mount given a text that names none | an argument error, `unknown_mount` | Job F (as written) |
| What a genesis is (stage 6's split: a bare actor draft, `bad_genesis` or `chain`) | an actor that names its own key as text and has no author and no `seq`; one that names no key and no author lacks the common five, `chain` | protocol.json `genesis.recognised`; 00-shared, A genesis |
| `signed_by_author` of a valid block not read (core false) | true: `valid` says who said the bytes, whatever `read` says | none (as written) |
| A make under a grant (oracle: anything in the chain names a thing) | the core's: its `state.inputs` each name a thing the grant's `refs.what` names | none (00-shared, Draws) |
| `well_known_errors`, the announcement | one set of checks and words (the core's); the announcement carries `reads`; the mDNS TXT record carries no list | B2 (as written) |
| `read` with a `runs` entry that is no id | an argument error | B5 (as written) |
| Typed schema fields (core had not built them) | built in the core as 1.8 B1 says (`shape`, `required`, the list form) | B1 (as written) |
| `binds` of a draft `as` a circle (owner's decision 2; core ignored the row) | binds only where the row would hold or every owner signs it, and something moves | none (the decision's words) |
| Where non-protocol lists live (`optional_profiles`, `peers`, `modules`, `views`, `repeat`, the node lists) | `spec/conventions.json` holds every list code reads that is not the protocol, with the door entries of every op outside `door.protocol`; `modules` is deleted; `repeat` stays (D3); a profile's fields are its schema's, so `read` adds none | C2 (both `protocol.json` and `conventions.json` bullets); section 6 (`read` row) |
| The CBOR table (`tools/cbor-table.cjs` named, not written) | written; nothing is locked, so 1.9's table is made whole by the rule (153 names), then only appended | E2 |
| The kind word `release` (already a side letting go of her claims) | a person's naming of bytes by hash is `software_release` | B3; GOVERNANCE.md; patterns/releases.md; 00-shared |
| The depth stop's reason | `{ stopped: "depth" }`; the limit is the reader's own setting | section 8, SILENT 4; C5 |
| Mount verdicts (the core keeps none) | a door's own business; no answer changes; both answer the mount cases alike | Job F (as written) |

Building also found: `en-sms` names an unnamed id "unnamed id CODE" (shorter, same meaning). The 6,000-make world runs once in a slow test in each engine (`cargo test -- --ignored`, about 17 minutes; `FB_SLOW=1 node spec/oracle/stage7/7-oldreader.cjs`, about 12). The fixtures that stage 7 changed (`core-set-a` 3a-5, stage 6 #44, #127, #128) are regenerated from the oracle and asked again, unskipped. Owner decision 3 is done in the text files: `of_members` leaves `bounded_change` and the roles leave `pools.md`, `refusals.md` and `promises.md` (28 of 51 schema ids changed; nothing outside the vectors names them). The JavaScript SDK exposes the new door ops (`readback`, `render`, `readbackRedo`, `rowHolds`, `waysIn`, `keepsTo`, `meter`, `worstCase`, `lowestOffer`, `ruleSet`, `mount`, `unmount`, `read`'s `runs`); `sdk/door.table` is level with the core's door; the WebAssembly is rebuilt once and Go's copy is the same file. `tools/version-sync.cjs` takes the packages' one number from `sdk/javascript/package.json`, since `protocol.json` names no version.

Outside this step: `spec/vectors.json` is not regenerated (section 4, The end pass). The Python, Swift and Kotlin door wrappers still lag `sdk/door.table` (their hand layers name ops stage 4 and 6 deleted); they are made level with the SDK step. `spec/readings/deals.md` and its siblings (C2's moved text) are not written: 1.8 C2 names where the text sits, not the words. `identity.md` has no will section yet (3d-16, landing with stage 5), so the pointers to it wait. `spec/NECESSITY.md` and `tools/necessity.cjs` are still 1.7's shape (E6, the end pass).

Open, for the owner: an `en-sms` read-back of a grant (lines 11 to 20) or of a long deal runs to 170 to 254 characters, past section 4's 160; nothing was cut.

## End pass, 2026-11-20: where the engines and the text were brought to one reading

Each line names the rule, what changed, and the centre rule that decided it where the text was changed.

- **`binds` of a circle's founding block** (owner's decision, 2026-11-20): a founding block that states `pack` binds its founder; it puts every part in her hand and is her start for them (06-circles C1). Both engines; 06-circles, CORE-SET row.
- **A sensor's reading** (authority.md, patterns/attestations.md): the operator grant is gone (04-grants); a reading speaks for the sensor when it speaks for the sensor's owner: signed by a key of hers (a device she sets up holds a key her list brings in). A reading a tool signs under a grant speaks for the tool alone (authority.md, Blocks that bind). Text changed: it still named the operator grant. *Simplest wins*: one way a device speaks for her, her own key; no grant kind for it.
- **`undo`** (things.md, Schemas): deleted in 1.8; the core still refused a block under a grant for it. Rule and schema field gone.
- **`to_role`**: no field; the core's own refusal of it is gone (an undeclared field is refused as any).
- **`referee_ties.how`** is `member` (folds.md); the oracle said `owner`. Sorted in byte order (canonical.md).
- **3d-18 at `PT0S`**: a voice of other people speaks once `needed` of them have signed the word, each once; the engines asked each to sign twice.
- **A missing `wait` or `reach`** (00-shared, identity.md): text changed. A voice that states no `wait` lets no word that lets someone act for her stand by itself (a voice above says it); one that states no `reach` holds her moves for no time. *Nothing fills silence*: her silence grants no one power, and asks for no delay. The engines already read it so.
- **3d-16, her stop of a will**: counts once it is in the close's causal past, or one of her clocks received it before the cutoffs that closed the close's wait (the clock the list her close replaces states). Built in both engines; a story in core-set-b (stage5-3d-16).
- **`work_alone`** (patterns/machines.md): two spans are compared by what each adds to one fixed instant, never added to a date (authority.md, A range and a list). Text changed: it said both were added to the parent's `at`.
- **A signal under a grant** speaks for its signer alone (authority.md, Blocks that bind); the engines counted the grantor.
- **A fork's proof**: a sealed half goes only to an asker the node holds a copy for; nothing of it goes to any other asker (nodes.md).
- **core.md**: the read-back of "Showing a deal" (no `show` term: a side signs a promise not to show), and the depth (`limits.read_depth` is the one bound; a reader that stops says so).
- **The read-back quotes a deal's own words** (`state.what`, word for word) and an SMS read-back past 160 letters runs whole over several texts (owner's decision, 2026-11-20): renderers/en.md, en-sms.md, readings/readback.md.

## Purity pass, 2026-11-22

The goal: a new reader can read the text and the code without knowing how they were built. One word, one meaning; no dead code; files
named by what they hold. Each text change below names its reason. The text was fixed first, then both engines, then the wrappers.

**Text changes**

1. **"To come" is the one word** for what a side of a deal is still due (core.md, section 10, already said so). No text change; the code's
   `owed` (`fold/owed.rs`, `Owed`, `owed_owners`, "promises.md, Owed") now says `to_come` (`fold/to_come.rs`, `ToCome`, `ToComeAt`) and points
   at promises.md, Handing on a receiving place, which exists.
2. **No operator.** No text change: consent.md already states the rule ("binds only the recorder's own side: the recorder, and every
   sender whose block speaks for the recorder"). The code's "operator" words are gone, and the core's and the oracle's last rule for a grant
   of kind `operator` (it had to name `refs.to`) are deleted: such a grant is read as any grant, as core.md section 7 already says (only
   `key`, `referee` and `stop` say more).
3. **`undo` is gone.** patterns/tasks.md pointed to "authority.md (Blocks that can be undone)", a section that no longer exists: pointer
   removed. profiles/pledges.md said "`pledge_close` says `undo: never`, so a tool of hers closes only on her yes": no rule reads `undo`, so
   the clause is removed ("A close cannot be taken back."). The base schemas no longer declare `undo` (schemas.json; every base schema id
   changed, published.json regenerated).
4. **A deal is its lines** (Patrick's decision). The plain top-level form is deleted:
   - core.md section 7: a promise needs `terms.lines` or `state.what`; what it moves or prices is in its lines.
   - promises.md, What moves; Terms ("A deal is its lines": `lines` is `[{ id, what, quantity, price }]`, each of `what`, `quantity`, `price`
     optional, at least one stated; a line with no `what` moves its quantity, an amount: a loan; a line with neither prices time or a job;
     a promise that moves nothing and has no price has no lines); a line's price takes every price form, a per-unit line may state a range
     that the answer chooses in; a price fixed later prices one line, and its figure names that line in `state.line`; a block that names
     no line counts toward the one line it fits, and toward none where several fit; Answers (an answer names only `terms.lines` of
     `{ id, quantity }`); Who may bind (an accept keeps to each line; an allocation draws on each line: the quantity it names, else the
     whole line; a counter's lines drawn on the offer's line of the same id); What becomes whose; a promise not to do has no lines; Settling
     (a job's lines); Finding (a lookup matches a line's `what`); Rulings (a judge's fee is the price of her offer's one line); An IOU (one
     line priced at the sum); band per line.
   - folds.md: a hold is the quantity of the line naming the instance; done is per line; a line's quantity chosen; elapsed (no line names a
     what or a quantity); over_allocated per line; the open offer's lines and `takers[].lines`; `to_come.to` amount null (what moves is one
     whole); `terms_total` reads `lines` and `step` and the lines chosen; a measure is each line's quantity.
   - authority.md: Keeps to items 5, 6, 7 are read per line (a line's `what`, `price`, `quantity`); Her quantity is the measure: each line of
     a promise in `on` is a measure, written `<promise>#<line>`; A draw: the quantities its lines bind, else the deal's total at the lines it
     binds, a figure at its `max` (the text already said so; the core now does it too).
   - readings/readback.md items 8 and 9: named things and money come from the lines (a low and a high total over each line's price and
     quantity ends); the reading's and renderers' cases are rehashed.
   - protocol.json: `required` (promise: `terms.lines or state.what`), `terms` (no `price`, `quantity`), `set_places` (no `terms.price`,
     `terms.quantity`), the `lines` refusal text, the stage outputs, `terms_total`'s arguments. conventions.json: `gives` and `lookup`.
   - Profiles and patterns that wrote the old form: vouches.md, pledges.md, keeping.md, patterns/tasks.md, protocol.md (Reading a deal),
     schemas.json (`pledge`, `judging`).
   - The bug the end pass found is fixed in both engines: a transfer of goods `for` a deal, read in money (a row's cap, a grant's draw),
     is its line's share, the line's price at the amount it moves: 1 kg of a £3/kg line is £3, not the order's £10.
5. **`refs_single`** lists seven links; `author`, `prev` and `key` leave it (a set there is refused at `chain`, core.md section 8, item 3,
   which already said so). core.md section 1 says so; the necessity tool keeps nothing for them.
6. **`binds` of an ask:** no rule change. A vector names it: a paying ask binds its signer, a pure ask binds no one.
7. **Her plan** (Patrick's decision). promises.md, Sides: "To yourself ... is accepted when made" is replaced by **Her plan**: a first
   promise whose `refs.from` and `refs.to` both name its signer names no other side; it is no deal but her plan. It stays a `promise`, binds
   no one (no one holds a claim on it: a word binds its signer only toward someone who can hold her to it), and has no stage; the blocks made
   `for` it are her own record. A promise that leaves a side open (an open offer, a want) is still a deal. promises.md, The deal: a deal is
   a first promise that names another side or leaves one open, and the blocks made `for` it; `deal_not_named` reads "the deal or plan it
   names" (also protocol.json). folds.md: her plan has no stage (`stage` and `accept` null); `accept` no longer "the promise itself when made
   to oneself"; the range sentence about a promise to yourself goes. "Plan" now has one meaning: patterns/foodblock-profile-epcis.md's
   "Traceability plan" (kind `traceability_plan`) is "Traceability document" (kind `traceability_document`); patterns/tasks.md and
   profiles/pledges.md already used "plan" for the top of a set of tasks and the thing pledged to (the pledges' plan is a thing, named in a
   line's `what`; no rule reads it as a promise).

**Code, with no text change**

- Folders and files are named by subject: spec/oracle/stories/<subject>/ (records, things, keys, payments, grants, deals, circles, privacy,
  readback, rules) with one kit.cjs, one export.cjs, run-all.cjs and core-stories.cjs; fixtures sdk/rust/tests/fixtures/<subject>.json;
  Rust tests records.rs, things.rs, key_stories.rs, payment_stories.rs, grants.rs, deals.rs, circles.rs, privacy.rs, readback.rs, rules.rs;
  test/audit files by subject; the fuzz corpus scripts grants.cjs, deals.cjs, circles.cjs, rules.cjs. Story vectors are named
  "<subject>: <story>: <op>, question <n>", and every vector name lost its build labels (H14:, batch 2 P6, round 2, ...).
- Deleted as dead: spec/oracle/stage1-, stage2-, stage3-scratch (copies of old oracles, answers files), sdk/javascript/test/make-vectors-*
  and their kit (tools/vectors.cjs is the one generator), tools/vectors/1.9.cjs and 1.9-run.json (one-time migration; tools/vectors/steps.cjs
  holds the steps still in use), test/audit's amounts, deals, pots and lib-deals (diagnostics no run reads, with 1.8 expectations), the
  audit world written the 1.7 way that never built (the audit now fails on a world that does not build), tools/fuzz/fold (wrote the old deal
  form; nothing ran it), the oracle's `pureJunk.fence` and `capOf`, the core's `received_after`, an unused import, unused test helpers.
- spec/oracle/fb.cjs is split by spec module: basics.cjs, bytes.cjs, check.cjs, identity.cjs, grants.cjs, circles.cjs, deals.cjs,
  things.cjs, consent.cjs, wire.cjs; fb.cjs is the one entry point (the door and every export), its exports unchanged. sdk/rust/src/identity.rs
  is split by module: finality.rs (blocks.md, Finality) and forks.rs (core.md, invariant 3; folds.md, A fork is a burden).
- Build history left the code comments; a comment states the rule and the spec section. Readings the text does not state are marked
  "(the text does not say; read so)".
- The oracle's dealer read an opened sealed copy as `{ block }`; the door answers it as a message `{ hash, type, state, refs, signature }`.
- The Go wrapper wrote `keepers` for her clock (1.9 says `clocks`) and listed `operators` in the identity fold; fixed.

**Door ops whose answer changed (for FoodOS)**

- `promise_stage`, `promise_view`, `promise_views`: no top-level `quantity` (each line's quantity chosen is `lines[i].needed`); every line has
  its id (no `id: null` line); on an open offer `lines[i].needed` is what the allocations that take bind on that line, and `takers[i].lines`
  (`[{ id, quantity }]`) replaces `takers[i].quantity`; `to_come.to[].amount` is null (what moves is one whole); `price_fixed` is true only when
  every line priced by a figure is fixed; a plan answers `stage: null`, `accept: null`.
- `terms_total(terms, chosen)`: the second argument is the lines an answer chooses, `[{ id, quantity }]`, or null.
- `worst_case`: each `on` entry is one line of a promise, with `line`.
- `meter`: a promise in `on` is measured per line, `of: "<promise>#<line>"` (with `@<occurrence>` where it repeats).
- `gives`, `readback`, `render`: read the lines (money from the lines' price and quantity ends).
- `write_refusals`, `read`: a promise with `refs.what` is `lines`; with `terms.price` or `terms.quantity`, `undeclared_field`; with neither
  `terms.lines` nor `state.what`, `required`; an answer's terms are only `lines` of `{ id, quantity }`; a set in `refs.author`, `prev` or `key`
  is `chain` only.
- `why_not_live_undo`: gone. `binds`: unchanged (a plan binds no one, as before).
- The base schemas' ids changed (no `undo`, the `pledge` and `judging` texts).

**Counts.** Files 805 to 730; code files 492 to 428; code lines 109,947 to about 76,600. Cases: vectors.json 2,091 to 2,100 (door 1,998 to 2,007), conventions-vectors.json 872 to 877. The rebuild: first run kept 1,912, renewed 98, deleted 860 (story cases whose stories were written again), added 869; after her plan, kept 2,843, renewed 3, deleted 33, added 38; then a fixed point (2,884 kept, nothing else). Necessity: 126 things, 118 covered, 8 used, none untested or dead; 28 of 28 invariants stated and carried.

## The 1.9 update, 2026-11-22

The brief: ~/foodx/research/2026-11-22-foodblock-2.0-avenues/review/DECIDE.md (Part 1, items 1 to 17; the narrowed list; Part 2, option A on every
call), with the six reviews beside it. Where a review narrowed a proposal, the review's form is the one made. Text first, then both engines.

**1. A key keeps its own place as it was, bar the key in it** (call 1, A). identity.md, A voice changes only what is below it: a key grant
restates every voice above its signer's place as it was, "and its own place as it was, bar the key in it"; "A place, bar its key, is changed
only by a voice above it"; and (call 6, A) "A new key put in a place by a voice not above it starts with no `passes`". The people of a voice who
reach above keep that place "as it was, bar its key". Reason: a stolen daily key at `PT0S` could sign a list that set its own `passes: true`
and raised its own limit from £50 to £50,000, and both stood at once (stolen-key.md, 3b). The engines had a wider hole than the review saw:
"as it was" compared only who, suite, `wait` and `reach`, so a key could also change `passes`, `each`, `limit`, `every`, `receives` or `above`
on a voice above its own place. "As it was" is now the whole voice, everywhere it is read (above the signer, its own place, Narrowing). The
oracle (`identity.cjs`: `voiceOf` carries the rest of the voice; `keptBarKey`) and the core (`identity.rs`: `Voice` equality is the whole
voice; `Voice::kept_bar_key`, read by `restated` and `reaches_above`) agree. A key may no longer narrow its own place either (call 1 is A, not
B): Harry lowers his phone's limit from his card. New story `spec/oracle/stories/keys/a-key-keeps-its-own-place.cjs`: the exact attack (F1:
`passes: true` and £50 to £50,000: no key grant, his place as it was), P lowering its own limit (no key grant), P setting `passes` on the card
above it (no key grant), the card changing P's place (stands), P putting a new key in its own place with `passes` kept (no key grant) and
left out (stands).

**2. The judge is a term both sides signed; the `referee` grant kind goes** (merges.md, 3a; call 1 of merges, A). A judge named late was a
`grant` of kind `referee`, and the one ending rule lets the author stop any grant, so by the text a losing side could fire the judge; both
engines ignored the stop. promises.md, Terms: "A new date both sides signed" is now **A new term both sides signed**: a side's `observe` of
kind `message` `for` the deal stating `pay_by`, or `judge` (one id), which the other side answers `accepted`; "Neither side alone ends it".
Disputes, A judge named after the quarrel, and folds.md, Defeated blocks, read the judge from that message; a claim of invasion names its
judge by a message `for` the claim, her own word that needs no yes. Deleted: `kinds.grant.referee` (protocol.json), the `referee` kind in
core.md section 1 and authority.md, Kinds the protocol reads. protocol.json declares the kind `message` (`kinds.observe`) and its typed
fields `pay_by:time`, `judge:id`. Engines: oracle `namesJudge` (deals.cjs: `judgesFor`, `invasionShown`; grants.cjs: the stop's `ruled`
end); core `fold::judge_named` (deal.rs `judges_held`, grants.rs, invasion.rs). Vectors: tools/vectors/steps.cjs moves every `referee` grant
to its message and each grant accepting it to an observe accepting it (21 inputs); the stories the-stop and bench-and-judges and the audit
worlds signers-word-and-invasion and congruence-audit write the message. **Prose: "judge" is the one word** for one who rules (call 16):
"referee" is gone from the text; `referee_ties` is `judge_ties`, `[{ judge, side, how }]`.

**3. A ruling is shown as every block is** (words.md, A4, delete form; call 2 of words, A). Deleted: `terms.rulings` ("left out means
private") from promises.md, Rulings and from the base schema `judging` (schemas.json, its text too), and "Two things are public whatever
the offer says". New text: a ruling's audience is the judge's own `state.audience`; whoever holds it may show it; a judge or side who will
keep it close signs a promise not to show; "Nothing else makes a ruling private or public." The door op `ruling_audience` is gone; its one
useful part is the reading `ruling_honoured(ruling, blocks) -> { lines: [{ to, due, honoured }], why }` (conventions.json, a reading):
honoured when counted transfers `for` the ruling `to_owner` the one it awards add up to its sum in its kind, whoever paid, or when she
released it; an award with no sum only by her release; whether it was honoured by its due date is the reader's own clock. The old op read a
payment's `refs.to`, which a transfer never states, so no award was ever shown paid: fixed in both engines (`to_owner`). New story
deals/ruling-honoured.cjs. SDK door tables regenerated (tools/gen-door.cjs). FoodOS `judge.js` writes `terms.rulings`: it must stop.

**4. The lock has one meaning: H₀** (structure.md, A9; call 9, A). core.md section 1: "A build runs the one set its manifest names"
replaces "The core runs no set". Section 11: **The first set is H₀**: a block that names no rule set is read by H₀ ("an absent
`state.rule_set` is the one spelling of H₀'s id, as an absent suite is `std`"); a build reads by its own rules only the blocks that name
its manifest's id, and, if made from H₀, those that name none. The manifest's `files` now also names `fuzz-vectors.json` and
`audit-vectors.json`. "The core alone" is gone everywhere (protocol.json `read`, `named_readings_about`, patterns/releases.md, comments).
Deleted: the `read` argument `runs` (protocol.json, sdk/door.table, both engines' door, `rules::running` and its thread-local, the oracle's
`RUNS`; the JS, Python, Go, Swift and Kotlin `read` wrappers); each engine names its built-from set as null until spec/rule-set.json is
published at the lock. The story rules/rule-sets-and-discovery asks H₀ instead of `runs`. **Frozen audit answers**: test/audit/freeze.cjs
writes spec/audit-vectors.json, the audit's 18 worlds' blocks once each and every question the word ops ask of them, with the oracle's
answer (the core must agree or nothing is written; keys from fixed seeds); spec/oracle/run.cjs and sdk/rust/tests/audit_vectors.rs run it.

**5. Restitution's ground** (restitution.md, A1). core.md section 10, The three remedies: deleted "Rectification is the wrongdoer's own deed
at work ... the referee only reads it (Kinsella). The three remedies rest on that one ground." New: "The attacker's consent is not asked. By
his act he lost to her what it cost her, with no word of his (Kinsella). An attack is not a signed word, so the record cannot show it ...
title moves in it only by the previous owner's signed word, given then or before ... Whoever acts on a ruling answers for the act if it was
wrong." Invariant 24 and folds.md, Ownership: "one of two reasons" (the third, "the attacker's own signed payment after a ruling", is the
second). No fold changes; `awarded` is not added (rejected: a reading, and a griefing tool in a protocol answer). tools/fuzz/owners.cjs and
the audit check say invariant 24, two reasons.

**6. Fraud in a deal goes to its bench** (restitution.md, A3; call 3, A). core.md section 10: "Fraud in a deal is a condition of that deal
that failed (Rothbard, ch. 19; Kinsella), so it is that deal's dispute and goes to its bench"; "An attack is harm outside any deal of the one
harmed: theft, poisoning, drift, fraud that harms one outside the deal, or a word signed under a threat". promises.md, Two doors: "an attack
outside any deal goes to the victim's judge". Nothing is added for a deal with no bench: it shows `disputed` until both name a judge.

**7. `passes`** (stolen-key.md, 3a; calls 4, 5, 6 A). identity.md, What a key hands on: "toward every block that has not seen that key's
end"; added "No fold reads `passes`: the record shows the receiver of a key's draw as owner whoever held the key (folds.md, Ownership).
Whose the thing is, where the key was not her hand, is a judge's word, read on her `not_me` ... and on this word." No flag, no promise.
Call 6 is in item 1 (a new key starts with no `passes`). Calls 4 and 5 are FoodOS's: no warning before a complaint; `passes` only as her
own yes.

**8. `confirms`** (words.md, A5; call 8, A). core.md section 1: `answers` is "the reply to another's block: it accepts, declines or stops it.
Taking up an offer or an ask is only by an answer"; `confirms`: "its signer signs that block's word too ... it binds her only on what of
hers the block reaches: where she holds a part, a voice or a place in it, she joins it; where nothing in it is hers, it is her word that it
is true, and binds nothing"; `defeats`: "her word that it is false. It binds nothing of hers." No byte changes.

**9. A grant ends at `expires`** (words.md, A6; call of words 4, A). `scope.until` is `scope.expires` (authority.md: the scope list, What
she did not write, `scope.expires` is optional, Scope subset, the heading "Whose date tests `expires`"; things.md, a grant of leave;
blocks.md, The cut: "a time it states (`expires`; Time)"; circles.md, a row's `every`; nodes.md, an address; custody.md; tax-recall.md;
tasks.md: "a `repeat`, or `expires` for when the offer ends"). promises.md, Terms: "`until` is when the deal's own term ends ... `expires`
ends a word that waits on others: an offer, an ask, a grant, a transfer to a named receiver, an address." protocol.json `scope`,
`narrower_than`, the `worst_case` result; answers `scope_reading`, `worst_case` and `use_shown`'s `leave` say `expires`. Kept: `terms.until`,
a share's `state.until` (a lease, title to a use), `deliver_by`. Engines, stories, audit worlds, fuzz worlds and wrappers by Sonnet helpers
(their own files each), checked by me; tools/vectors/steps.cjs moves every vector input.

**10. Consent is a reading** (structure.md, A7). modules/consent.md moved to readings/consent.md: its section 1 (already nodes.md,
Admission) and its `scope.ends_on` paragraph (already authority.md, A witness, which keeps it) are deleted; "Consent decides what binds, not
what exists" is "A STOP refuses nothing" (an unanswered ask binds no one anyway; her own answer is what binds her). Deleted: the STOP clause
of folds.md, stage 7 (both engines: `promiseStage`'s consent branch; `promise.rs`'s `consent` call), invariant 27; privacy.md's 28 is now 27
(core.md and protocol.md say 1 to 27; vectors retagged). Invariant 5: "No one's word about what may reach her refuses another's block: a block
sent despite her STOP is valid and kept". The third remedy: "anyone may refuse to deal again: she does not answer, or answers no." A consent
word outside `yes` and `stop`, and a `yes` with no subject, are no longer refused by `read` (protocol.json `kind_fields.observe.consent`
and both engines' `required` check deleted): the reading counts them for nothing (oracle `consentFold` reads conventions.json
`folds.consent.word_values`, as the core already did). The story rules/deleted-things asks so. Every reference names readings/consent.md.

**11. Four folds filed twice** (structure.md, A8; call 12, A). Every reading's fold entry left protocol.json for conventions.json's new
`folds` (ways_in, where_now, made_from, machine_lock, use_shown, not_free_shown, invasion_shown, next_link, consent, release_shown), so
rewording a reading no longer changes the locked hash. `shares_on` is a word: it joins `door.protocol.word` and leaves the readings (its cases
move to vectors.json). `folds_about` cites core.md section 12. tools/fuzz/folds.cjs asks protocol folds, conventions folds and views. The
machine lock leaves the grant kinds (`kinds.grant` is `key` only): authority.md, Kinds the protocol reads, and core.md section 1 say so; the
lock stays the pattern's grant of kind `stop`, read by the `machine_lock` reading. folds.md's table files the readings apart.

**12. The calendar is a reading** (structure.md, A11b). promises.md, Terms keeps what `read` checks (the RRULE grammar, the zone's shape, a
calendar repeat carries `state.when` and `terms.zone`); The calendar forms, the counting rules (1) to (6) and the clock-change rule moved to
readings/calendar.md. The time zone pin "release 2026e" is deleted (core forbids tables, and it was out of date): which release is the
reader's own. conventions.json `repeat_occurrences` and protocol.json `repeat.rule` point to the reading. readings/README.md and protocol.md
list consent.md and calendar.md, whose cases are their ops' cases in conventions-vectors.json (flagged).

**13. The EPCIS cross-reference** points to encoding.md, Large content.

**14. The TLA+ model is deleted** (call 11, A): tools/tla/ and both CI jobs (`protocol-model`, `protocol-model-tlc`), and its .gitignore
line. It modelled 1.7, read no spec file and cost CI up to four hours a part. A 2.0 model is to be tied to the engines.

**15. Giving up is written once** (merges.md, 4, text only). folds.md, A draw: one ground, "title passes only by its owner's giving it up,
aimed at a receiver or at whoever first takes it, and only on the conditions she wrote (Kinsella, 2003, p. 28). A will is no draw while she
can sign." promises.md, What a promise is: the three-words list is "Title waits on a condition only in a draw". things.md, Letting go with no
receiver: the rule text points to folds.md, Ownership; the Ada example stays. identity.md, A will points to folds.md, A will. The will
stays its own rule; the types stay apart.

**16. The scope `limit` row and the dead orders** (merges.md, 2). authority.md, Scope subset: "A child is read only inside its parent ...
Its `limit` is a draw on its parent's line ... A child for more than is left takes nothing, and is never cut down"; the `limit` row is
deleted (the `every` row stays). protocol.json `narrower_than.limit` deleted; `narrower_than_about` names only the orders the table uses.
Deleted: Rust `keeps_condition`, the `superset` and `at-least-duration` arms of `wider_by`, its unused `from`; the oracle's `subset`,
`superset` and `at-least-duration` orders and `childProblem`'s limit check. **Call 7 (A): a circle row that states no limit lets nothing be
drawn.** circles.md, A grant from a row: "A row that states no `limit` and no `each` lets nothing be drawn, as a grant's silence does: a
grant from it states neither, and no transfer under it moves an amount above zero." Both engines (`widerThanRow`/`wider_than_row`,
`rowCovers`/the row cover check). Three circle stories now state the bound their rows meant (`each` 1 part, `each` £5).

**17. Post-quantum sealing: X-Wing** (sealing.md; calls 13 and 14, A). core.md section 2: **An encryption key** is the suite's own, bare,
or a name, a colon and a key, as a hash is; `xwing:` and 2,432 hex is an X-Wing key (draft-connolly-cfrg-xwing-kem-11: the ML-KEM-768 key,
then the X25519 key); the sealer uses the key as stated; **a named key whose name a reader does not know is skipped, and the rest of the
block that states it stands** (call 14; identity.md, Encryption keys, says so too). privacy.md, Envelope: one salt rule for both kinds, "the
encapsulation's bytes then the recipient's key bytes" (for X25519 the encapsulation is the fresh key's public bytes), and the bullet **A KEM
key** (`kem_ciphertext` per recipient, no `ephemeral_key`, `alg` `xwing-hkdf-sha256-aes-256-gcm`, one `alg` per envelope). protocol.json:
`encrypt_keys` (the xwing grammar and sizes, and `named`); `suites.future.pq.encrypt` deleted. THREAT-MODEL.md, Forward secrecy: an
`xwing:` key is not opened by a quantum break of X25519 alone; no forward secrecy. Core: crates `ml-kem =0.3.4` (hazmat: deterministic
keygen and encapsulation), `sha3 =0.12.0`, `shake =0.1.0`, under the `envelope` feature; `envelope.rs` seals and opens; the door's `seal`
takes per-recipient 64-byte `encaps` under `vectorsOnly`, refuses mixing kinds, and `encryption_keypair("xwing")`/`encryption_key_of(seed,
"xwing")` give the key. Oracle: opens with Node's own crypto (SHAKE256, SHA3-256, X25519, ML-KEM-768 decapsulation from the seed); it does
not seal (Node takes no fixed randomness), so the core seals the vector and the oracle opens it. Both match the draft's own test vector
(appendix C). Vectors: key `xwing_ann` (test key), one envelope case, the section `xwing_draft11`, three `read` cases (an X-Wing key; an
unknown named key `mlkem1024:` that is not refused; an `xwing:` key of the wrong length, `grammar`). Every SDK runner (JS, Python, Go,
Swift, Kotlin) runs them.

**The narrowed list.**
- **One panel shape, for the five places that count signers** (merges.md, 1; call 15, A). A panel is `{ names, needed }` (protocol.json
  `shapes.panel`; folds.md, Counts, which no longer carries `wait?`: `wait` has three meanings beside `needed` and stays outside). A signal's
  `by` and a price fixed later's `by` are panels (`signers` is gone); a schema's bench is `grounds.bench` (`confirmers` and `grounds.needed`
  are gone; `grounds.wait` and `grounds.clocks` stay); clocks and a voice of people already were. Not panels: a row's `{ to, needed }`, an
  event repeat's `by`, an account word's `by`. A bench's names keep their order (the backups' order). Text: promises.md (a signal, a price
  fixed later, Disputes), folds.md (Counts, Defeated blocks, a pot's payout), things.md (`grounds`), pools.md, rulebooks.md, refusals.md;
  schemas.json. Engines (`Check.panelOf`; `tasks::panel_of`, `shapes::panel_shape`): a panel that repeats a name is no panel (it was
  accepted before), and `needed` above the count of names holds nothing. Vectors moved by steps.cjs (about 250 sites).
- **The two-meaning words** (words.md, sweep; call 16, A). `confirmer`: a bench member is a judge (`grounds.bench`), a witness is a named
  signer (payment-proof's provider is now named in the payee's account word's `by`, never on a bench: flagged); "referee" is gone (item 2);
  `referee_ties` is `judge_ties`. `line` is only a deal line; one key's blocks in order are a **chain** everywhere in the text (headings: "A
  chain", "A limit is counted along one chain", "A circle's chain", "A chain goes on", "Her start, and her one chain", "Read once, along the
  chain", "A fork on a tool's chain", "The chain."), and the refusal code `not_on_line` is `not_on_chain` (both engines, vectors); answer
  rows that are no deal line are "entries". `held`: the blocks a reader has are "has" in prose ("A header a reader has"); `held` is the
  draw state alone (the door argument is still named `held`: flagged). A `standing promise` that repeats is a **repeating promise**; "stands
  in the causal past" is "is in". "Counts toward" a sum is "adds to"; "counted along" a line is "metered along" a chain. Done by a Sonnet
  helper on the spec prose, read through by me; the code comments that cite a renamed heading follow. Left as written (the helper's list):
  about 15 uses of "line" that are neither (a line of text, "a revolving line"), "counted on one chain", five "counts toward the stage".

**Tests added.** The own-place story (item 1); ruling-honoured (item 3); **unknown at every seat** (rules/unknown-at-every-seat.cjs: a
rule set no build here is made from, an undeclared field and an unknown hash name on the block itself; a rule set on the key grant it rests
on, on a block it names (an accept of an unread offer is `names_unread`), on a circle version, on one block of a pair, in the middle of a
chain, and on the message that names a judge: each answers less, never another owner, never a throw). Not covered: a sealed body's seat and
an unknown condition shape at each seat (an unknown kind is open data and changes no answer). The audit's worlds frozen (item 4).

**Flagged for Patrick** (calls the brief does not settle, each made so that silence means nothing):
1. Call 7 was made for a row's `limit` and `each` only. A row's other silences (`types`, `parties`, `on`, `what`) still "bound nothing",
   while a grant's same silence names nothing (authority.md, What she did not write) and circles.md, A row, says a row's scope is read as a
   grant's. Making a row read wholly as a grant would change many circle answers.
2. Under call 7 a priced promise signed `as` a circle under a row with no limit is still covered (only transfers and grants are bounded at
   zero); whether an offer or accept "draws" there is not settled by the text.
3. payment-proof.md named the provider in `grounds.confirmers`, which would have put a witness on the bench ("who says a thing happened
   never rules"); it is now named in the payee's account word's `by`. A pool's vet stays on the bench (`grounds.bench`), since the pool's
   payout reads that bench as its signal.
4. The readings consent.md and calendar.md are texts whose cases live in conventions-vectors.json; readings/README.md now says "each is a
   text with its cases", and only a reading a block may name (readback) is named by hash.
5. A STOP's shape is no longer refused by `read` (a consent word outside `yes`/`stop`, a `yes` with no subject): consent is a reading, so
   those blocks are data that count for nothing in it.
6. The door argument for the reader's blocks is still named `held`, the same word as the draw state `held`.
7. Old fuzz corpus files (tools/fuzz/corpus/legacy-1.7, found/) are signed JSON still written with `until` and `referee_ties` in their
   texts; they are 1.7 reproducers and both engines answer them alike (the short fuzz saw no new split), so they were left.
8. Spec words went up, not down (below): X-Wing, the two readings' headers and the new stated rules outweigh the deletions.
9. `git rm --cached spec/modules/consent.md` was run by mistake while moving the file: the deletion is staged in the index (nothing was
   committed). The working tree is as intended.

**Door ops whose answer changed (for FoodOS)**
- `promise_stage`: `referee_ties` is `judge_ties`, `[{ judge, side, how }]`; a judge named late is read from a `message` `for` the deal
  stating `judge`, accepted by an `observe` (no `referee` grant is read); a bench is read from `grounds.bench`; an ask sent despite a STOP
  is `asked`, never `declined`; `price_fixed` reads `by.needed`.
- `ruling_audience`: gone. New reading `ruling_honoured(ruling, blocks) -> { lines: [{ to, due, honoured }], why }`. FoodOS `judge.js`
  must stop writing `terms.rulings` (a base-schema term no longer declared: `undeclared_field`) and pass no `rulings` parameter.
- `read`: no `runs` argument; a block that names no rule set is read by H₀, any stated id is `unknown_rules`; a key grant's own-place
  change, a `passes` kept on a new key, or a key narrowing its own place is no key grant (its `stands` is false); a consent block is never
  refused for its word; an unknown named encryption key is not refused; an `xwing:` key of the wrong length is `grammar`.
- `stands`, `identity_state`: a key grant that changes its signer's own place (bar the key) or anything of a voice above is no key grant.
- Grants: `state.scope.until` is `state.scope.expires` everywhere FoodOS writes or reads a grant or a circle row (`scope_reading`,
  `worst_case` answer key `expires`; `use_shown` `leave.expires`); a child grant's `limit` is never `wider_than_parent` now (it is a draw:
  `not_live` when it does not fit).
- Circles: a grant `as` a circle under a row with no `limit`/`each` that states a limit or each is wider than the row; a transfer of an
  amount under such a row is not covered (`row_holds`, `circle_state`).
- Conditions and prices: a signal's `by` and a figure's `by` are `{ names, needed }` (`condition_holds`, `promise_stage`, `pot`); a
  schema's `grounds.bench` replaces `confirmers`/`needed`.
- `ownership`, `why_not_under`: the reason `not_on_line` is `not_on_chain`.
- `shares_on` is now a word op (in vectors.json); the reading folds moved to conventions.json (`machine_lock`, `use_shown`, `consent`, ...);
  their answers are unchanged.
- `seal`, `open`, `encryption_keypair`, `encryption_key_of`: accept X-Wing keys (`xwing:`).
- A judge named on a claim of invasion: a `message` `for` the claim stating `judge` (`invasion_shown`).

**Counts, before and after.** Door cases: vectors.json 2,007 to 2,045, conventions-vectors.json 877 to 868 (2,884 to 2,913); fuzz vectors
14 (now in the manifest); audit-vectors.json new, 17 worlds, 2,224 cases; protocol ops 37 to 38 (word ops 30 to 31); invariants 28 to 27;
spec words (every .md under spec/) 112,131 to 112,686; code lines 76,300 to 76,404; files 731 to 742. The rebuild: first run kept 2,668,
renewed 153, deleted 75, added 89; then a fixed point (2,913 kept, nothing else).

**The checks.** Vectors rebuilt to a fixed point (0 faults: every answer the oracle's, the core the same). cargo test: every suite passes,
audit_vectors included. `npm test` (sdk/javascript): run-vectors 3,105 passed, the oracle 5,277 passed (door 2,912, audit 2,224), the
audit 33 passed, 0 differing; node tests pass (test/envelope.test.cjs opens the X-Wing envelope by its `xwing_private`). Python 40 tests OK;
Go ok; Swift 26 tests, 0 failures; MCP 35 pass; CLI 11 pass; host 59 pass. Kotlin and tools/sim cannot run here (no JVM; the simulator
was not run). Short fuzz (`tools/fuzz/diff.cjs --seeds 1-25`): 11,487 questions, 5,898 property checks; 11 findings, all known, 0 new.
gen-door, sync-spec and version-sync current; the CBOR key table regenerated (152 names).

**Necessity** (one full measure, 6 h 32 min): 126 things: 117 covered, 9 used, 0 structural, 0 untested, 0 dead; invariants: 27/27 stated
and carried. `node tools/necessity.cjs --check` exits 0.

## Final round, 2026-11-23

The brief: settle the flags of the 1.9 update, delete every piece of legacy and dead code, and the coordinator's additions (the reports in
~/foodx/research/2026-11-23-foodblock-2.0-research: core-and-words.md item 6, food-and-stores.md items 17 and 18, genesis.md items 7 and 8,
merges.md item 4, limits/card-pin.md, and the acts library). Text first, then both engines, then the vectors. Where the brief did not settle a
call, the reading where silence means nothing was taken and it is flagged for Patrick below.

**1. A silent circle row means nothing, on every field.** circles.md, new bullet **What a row leaves out, it does not allow**: a block `as` the
circle is held by a row only where (1) its type is in `scope.types`; (2) each side it gives to is admitted (an id `parties` lists, a side a
promise in `scope.on` names, a side of a deal the circle bound; with no `parties`, anyone on a side an `on` promise leaves open: authority.md's
own rule, A side admitted); (3) a promise (offer, counter, accept) keeps to a promise in `scope.on` (Keeps to), and a transfer, or an accept of
one, is `for` a promise in `scope.on` or a deal the circle bound; (4) each thing it names is in `scope.what`, bar a block under (3), whose deal
names its things, and the circle's own parts only where `what` names the circle; (5) a row with no `limit` and no `each` lets nothing be drawn:
no block under it binds **or** moves an amount above zero (a priced promise too, which was the hole), bar a block counted once. A grant from a
row states no field the row does not (types, `parties`, `on` within the row's, `refs.what` within its `what`, as a child grant within its
parent). **The explicit "any":** the spec had a spelling for "anyone" (an `on` promise that leaves a side open) but none for "any deal" or
"any thing", so the smallest explicit form was added: a row's `parties`, `on` and `what` may each be the text `"any"` (a row's alone, never a
grant's; `"any"` at `what` reaches the circle's own parts too, since it says so). protocol.json `circle.about` says it. Engines: oracle
`circles.cjs` `rowCovers`, `widerThanRow`, `bindersOf` (new, shared by `countedWhenBound`); core `fold/circle.rs` `scope_misfit`,
`wider_than_row`, `binders_of`; the row shape check takes `"any"` (`check/actor.rs`, `scopeShapeOk`). Every story, audit world and fuzz world
whose rows meant "any" now says `parties: 'any', on: 'any'` (and the audit café's row a bound, `each` £300, since its priced
offer is now a draw) (circles/lib.cjs `r1`, rows-head-counts-and-bounds, every-owner-together,
unissued-parts, six audit worlds, tools/fuzz/seeded.cjs, the corpus); the loan in rows-head-counts-and-bounds lost a `state.what` (item 3).

**2. The door argument `held` is `blocks`** everywhere: protocol.json and conventions.json (every argument list and the prose that meant "the
blocks a reader has", now "has", "lacks", "given"), sdk/door.table and every generated wrapper, the spec text (`speaks_for(block, blocks)` and
the rest), the JS, Python, Go, Swift and Kotlin wrappers and their tests, mcp, cli, host, both engines (Rust: `WriteOptions.blocks`,
`CheckOptions.blocks`, `blocks_index`/`blocks_of`, the write wire key `blocks`; the oracle: `blockMap`, `blockList`, every parameter), the
tools and the audit (the `'blocks'` placeholder in `ask`, `$blocks` in the frozen audit). Three answer keys that meant "the reader has" were
renamed too, so `held` keeps the draw state alone: the push answer's `held` is **`had`** (nodes.md, conventions.json, sync.rs, host); the
`check_reads` entry `held` is **`has`**; the fork answer `{ pair: true, held, at_most }` is **`{ pair: true, blocks, at_most }`**; the
profile capability `folds_for_held_records` is `folds_for_its_records`. Left: `held` the draw state (ownership, pot, gives), "the condition
held" (a verb), refusal detail strings, and the case files of the readback reading (spec/readings/readback.cases.json is hashed with its
reading; flagged).

**3. A line that is both a loan and a job is refused when written, `lines`.** promises.md, A deal is its lines: "In a promise that states
`state.what`, a line's `quantity` is the measure of the work (two hours, three days); a line there with no `what` whose `quantity` is of its
price's own kind would move that amount back for more of it, a loan, and a line is a loan or a job, never both (`lines`)." The test reads two
signed fields only: the line's quantity and its price are of one kind (£20 lent for £22). protocol.json's `lines` text names it. Oracle
`check.cjs`, core `check/promise.rs`. `lines` fits: it is the code for every other malformed line. Story deals/what-a-promise-may-carry, now
asked through the door (`write_refusals`), so it is in the vectors: the loan with a job refused; the same loan with no `state.what` valid; a
job priced with no quantity valid; teaching for 2 hours at £20 an hour valid; 2 hours with no price valid. (A first cut of this refused every
line with a quantity under `state.what`, which made a job of two hours unwritable; the coordinator caught it and it is narrowed as above. The
two audit worlds teach for 2 hours again, folds.md's job rule counts work to each line's quantity chosen again, and the measure was stopped
40 minutes in and run again from the start, since `--only` refuses once the engines change.)

**4. The story that expects `underway`.** deals/what-an-offer-gives.cjs (3): Ruth defeats Maria's accept of the delivery; Maria's payment is
still counted. The story holds a signed block showing work began (the counted payment), and the text already gives `underway` for it (folds.md,
stage 4: a binding answer and a counted block `for` it; Defeated blocks: the ruling makes only the delivery count for nothing). So the text was
not missing the case; the story's own comments were wrong ("Expect stage `accepted`", "the text says `accepted`", "(the text does not say;
read so)"). The comments are fixed; no text or answer changed.

**5. A malformed STOP stays unrefused by `read`.** Decided, no change: consent is a reading (readings/consent.md), so a consent word outside
`yes`/`stop`, or a `yes` with no subject, is data that counts for nothing in it. The stale clause in protocol.json `required` ("a consent yes
with no refs.subject") is deleted.

**6. tools/sim is deleted** with everything that named it: the CI job `simulator`, dependabot's `/tools/sim`, the `sim` npm script and cargo
alias, the .gitignore line, and the comments that said "found by the simulator" (order.rs, sign.rs, fuzz_vectors.rs, diff.cjs, folds.cjs,
make-vectors.cjs and spec/fuzz-vectors.json's `$comment`).

**7. Kotlin.** Homebrew's openjdk 27 was there but Gradle 8.14 cannot run on it; `brew install openjdk@21` and `openjdk@17` (free; the build's
toolchain asks for 17). `./gradlew :foodblock:test` with JAVA_HOME at 17: **24 tests, 0 failures** (ApiTest, LoaderTest, VectorsTest; the
natives built from today's core). Nothing failed, so nothing was fixed.

**8. Unknowns, every place.** rules/unknown-at-every-seat.cjs is now the whole matrix: five unknowns (a rule set no build here is made from, an
undeclared field, an unknown kind, an unknown hash name, a condition shape no reader knows) at eight seats (the block itself, the key grant it
rests on, a block it names, a circle's version, one block of a pair, the middle of a chain, the message that names a judge, **a sealed block's
body**). Each of the 40 asks: never a throw, never more than with no unknown, and less wherever the unknown is not open data. The open-data
cells are named in the story (an unknown kind on a block whose kind no rule reads; a field of an `observe` of an open kind, which carries any
field; a pair, which has nothing to lose). Both engines agree on all 40. It found one split, fixed: an `actor` of a kind other than `circle`
that states `pack` or `rules` was read by the oracle and refused by the core; the core is right (a circle's actor alone carries `clocks`,
`pack` and `rules`: core.md section 7 now says so; the oracle refuses it, `undeclared_field`).

**9. The old fuzz corpus, rewritten.** found/*.json (22, the `end-pass-*` files and new-D/E/F): moved to today's forms (lines, panels,
`amount` splits) by tools/vectors/steps.cjs and re-signed by their own test keys, each renamed by what it tests (e.g.
found/ownership-twin-of-the-start.json); 12 of the 22 were unread under today's rules, so no longer reached their cause, and now do (e16 and
new-D needed a reshaped block to keep their path; new-F now splits on `lacks`, kept as known). legacy-1.7/ (63, authors' keys not
recoverable): rewritten as `build(L)` cases: z-scopes.cjs (all 46 `scope_reading` reproducers, `until` to `expires`, old money to
`{ value, unit }`), z-grants-and-circles.cjs (backed, made_from, pot, stands, speaks_for/members_then), z-lines-and-lone-blocks.cjs
(ownership, identity_state, valid). None needed deleting. legacy-1.7/ is deleted, and corpus.cjs's `legacy()` reader and its tables with it.
known.json names the cases as they are now.

**10. Word-cutting over spec/**, no rule changes (Sonnet helpers by file group, two rounds: the first cut only about 1,500 words, so a second
round went paragraph by paragraph). Cut: restated rules (kept at their home, a pointer where a reader needs one), long sentences, examples that
only repeated a plain rule (in promises.md about 37 such worked examples, each read back first: none carried a rule or a condition; the ones
with numbers or a form the rule alone does not show stay), explanations of why something is not a rule. The second round then had a review of its
own: four Sonnet reviewers read every changed passage against the copy taken before it and put back, word for word, every rule or
condition stated nowhere else (about 100 places: e.g. identity.md "A place, bar its key, is changed only by a voice above it", folds.md
"Withdrawing an offer a counter has replaced withdraws nothing else", core.md "The header carries nothing else", the profiles' "the
protocol fills in none"); I checked every heading, bold run-in heading, defined term, backticked name, table and numbered list against the
copy. The three files the engines hash
(readings/readback.md, renderers/en.md, en-sms.md) and the generated NECESSITY.md were not touched. promises.md 19,730 to 17,787; folds.md
15,431 to 15,131; core.md 7,072 to 7,020; authority.md 5,906 to 5,712; every other file a little. No vector reads the prose, so every vector
answers the same. A deeper cut would mean restructuring rules into one home each (2.0; flagged).

**11. The dead-code sweep** (Sonnet helpers by area, each deletion proved by grep or by the compiler; every one checked by me against the
suites). Deleted paths, by kind:
- *A tool nothing runs any more*: tools/sim/ (Cargo.toml, Cargo.lock, oracle-check.cjs, src/main.rs, world.rs, episodes.rs, invariants.rs).
- *One-time migration scripts*: changes-1.8/00-clear-the-ground.answers.cjs, changes-1.8/00-clear-the-ground.resign.cjs.
- *Old fuzz copies*: tools/fuzz/corpus/legacy-1.7/ (63 files), the 22 old found/*.json (rewritten under new names).
- *Scratch*: sdk/kotlin/gradle/verification-metadata.dryrun.xml (1,650 lines, untracked), sdk/door.table-E (a sed backup).
- *Renamed by what they hold*: tools/fuzz/lib18.cjs -> block-builders.cjs, world18.cjs -> random-worlds.cjs, world.cjs -> seeded.cjs;
  spec/oracle/stories/deals/deleted-shapes.cjs -> what-a-promise-may-carry.cjs, rules/deleted-things.cjs -> consent-words-and-recipients.cjs.
- *Unused code*: Rust: `Dec::is_decimal`, `strings_pub`, `Spec::has_type`, `Spec::knows_hash`, `sync::local_service`, `sign_bytes`,
  `verify_bytes`, `grant::is_live_in`, `check::is_code`, `check::findings_with`, a duplicate `act_value`, `hash_list_shape`, `readback::obj`,
  `Bench.bound` and the parameters only it fed (`wait_run`'s `reads`, `fence_wider`'s `from`, `recur`'s `tz`, `free_key_grant`'s `g`), about
  330 lines of unused test helpers; every `allow(dead_code)`/`allow(unused…)` removed and the items they hid deleted or gated by the feature
  that uses them. The oracle: `datedFrom`, `legacyMoneyProblem`, `refusalOf`, `amtF`, `tookAt`, `readsOf`, `isCutoffOk`, `namesIt`, `builtOn`, `reachOfWord`, `conditionStands`, the kit's `ownS` and `headerMessage`, dead locals and parameters (`disputesOf`, a no-op `conditionBinds`, a branch `&& false`), about 250 export names nothing imported; the 38 `s4*` names (build history) renamed by what they do (`blockKind`, `drawsOnLine`, `notDueBecause`, …). JS SDK: order.cjs `causesOf`, `headsAmong`, `indexOf`; spec.cjs's ten unused constants; protocol.cjs's
  unused re-exports; fold.cjs's duplicates of grant.cjs (`keepsTo`, `meter`, `worstCase`, `lowestOffer`). mcp: the throwing stub `newPerson`,
  `addDecimals`, unused imports and exports. Go: `hashesOfBlocks`, `isStr`, `isInt`, `uniq`, `sortedKeys`, three test helpers. Swift: five
  unused helpers and `CircleState.memberIds`. tools: `makeWorld` and `withRecovery` (seeded.cjs, about 105 lines with the old money form),
  `casesOf` and four exports of diff.cjs, `lesser`, `members`, `listAt`, `plus`, `strip`, dead ternaries in run-vectors.cjs; acts:
  `measures_of`.
- *Legacy readers and flags*: the oracle's `normHeld({ held })` and `heldList(h.held)` object forms; the CLI's "`init`, `key`, `create` are
  gone" branches and their test; host's store fallback for old copy lines with no `author`/`at`, two `ALTER TABLE … IF NOT EXISTS` lines;
  replay-check's `"version": "1.7"` message form; version-sync's `legacy|aliases-` and `tla` patterns; Go's `Version` that read a field that
  does not exist (now the core's label, as the other SDKs).
- *Checks of removed names* (they tested history, not a rule): the stories' "ops the protocol does not have are gone", "the old names are gone",
  "owed_back is gone", "promise_stage has no `show` output", the protocol.json-content and absent-output checks of deleted-shapes; Kotlin's
  `thereIsNoOlderShape` loop, Swift's `read_as` assertion.
- *Dependencies*: `hmac` (Rust; imported nowhere).
- *CI*: the `simulator` job; dependabot's `/server` (is `/host`) and `/tools/sim`.
- *Build history in comments and texts*: every "1.7"/"1.8"/"1.9 3a-3", "decision H9", "G1", "C10", "SILENT 27", "release 46", "part 08",
  "(F1…)", "(rN)", "(review …)", "was X", "year zero", "no earlier version" in the code, the READMEs, protocol.json and conventions.json
  (which also lost the stale `scope_reading` `until` and "the defaults of authority.md"), and the stale docs (README, ARCHITECTURE,
  DISTRIBUTION, SECURITY, TODOS: 1.9 now; host/mcp/cli READMEs and manifests; the JS README's names that do not exist).
- *Kept, with reason*: CHANGELOG.md, CHANGES-1.8.md, changes-1.8/ and changes-1.9/ (history logs); acts/ (FoodOS reads acts.json,
  compiled.json and runs acts/tools/check.py); sdk/javascript/test/make-schemas.cjs and tools/fuzz/make-vectors.cjs (live generators);
  exports that mirror door ops in every SDK (public API); `.claude/worktrees/` (an agent worktree, Claude's own configuration: not mine to
  remove; flagged).

**Added by the coordinator, from the research reports**

**a. Oracle against the text (core-and-words.md, item 6), each checked against the files as they stand:**
- *An order in hand counted past what she ordered* (deals.cjs, `orderInHand`; core `in_hand_order`): promises.md, Terms, `in_hand` now reads
  "for no more than the order states for that line, in all"; both engines cap what her order alone counts at her order's line. Story
  payments/paid-only-by-the-payees-word, world C: she orders 6 kg, the transfer says 10: moved 6 kg.
- *A stop counted as acting on a late accept* (things.cjs `actedOnLate`, deals.cjs `actedOn`; core things.rs `acted`, deal.rs `acted_on`):
  blocks.md, Time: an accept not in time binds its giver only by her later block that says yes to it (her `accepted` answer, or a block that
  performs the deal: a transfer `for` it, or her accepted answer to one); her stop, her decline, or a block that only has it in its past binds
  her to nothing. Both engines. (blocks.md's "under a grant with `until`" is `expires`.)
- *An offer freed "at once" by its giver's stop* (things.cjs; core draws.rs): deleted in both. folds.md, Freed and stage 6 already say an end by
  its giver frees where the one it is for has seen it (or by a clock), since an accept that has not seen a withdrawal still binds. The giver's
  decline of an accept still frees at once (the accept then binds nothing); the core now reads that decline as such (it had leaned on the
  deleted rule). Three stories now show held, then freed once the receiver has seen the end (answers-and-binding, people-of-a-voice-reach-above,
  time-is-what-is-in-the-past). A freed draw lists no `waiting` in either engine.
- *A backup judge's turn started by any `defeats`* (deals.cjs; core bench.rs): only a side's `defeats` of a block that speaks for the other side
  is a dispute (folds.md, Defeated blocks), in both.
- *A comment against its code* (bytes.cjs, cutoffs with no `at`): the comment now says what the code and blocks.md do.
- *A header of a key grant whose key is shown only in its body* was `bad_signature` (final): core.md section 8, The key that opens it: it is
  `unmet`, naming its own id, until its body is had. Both engines.
- **Flagged, not done**: things.cjs's make under a grant is checked only for `scope.on`, not authority.md's inputs test; "coming back" in
  ownership is not built (things.cjs 755). Each changes ownership answers under grants in both engines and needs its own vectors.
- *The text against itself*: (1) who starts a repeat and when it is due: folds.md said "a side or a signer `by` names" and "its observe's
  `at` plus `wait`"; promises.md (and both engines) say only `by`'s names, and the named clock's receipt plus `wait`. folds.md now says so
  (silence means nothing: no `by`, no start; a signer's own `at` fills nothing). (2) a bare `reading` condition: folds.md frees what it held
  from its signing, promises.md kept it held; both engines free; promises.md now says it frees (her own goods are hers again; holding them
  forever for no one fills a silence). (3) a missing `!` field: `shape` in `kind_fields.about`, `required` in things.md: now `required`
  for both, in both engines. (4) folds.md's ruling that ends the rest named its judge by "a grant of kind `judge`": it is the message both
  sides signed (the engines already read that). All four flagged.

**b. Stores (food-and-stores.md, items 17 and 18).** Two engine splits, run on today's core: (1) *a circle's shrink* (one make with no output,
`as` the circle): the core took nothing (`not_on_chain`). Cause: a make that took from two of the circle's lots was counted as two makes, so
the output had no start on any chain. Fixed in both engines (one make is one make; the oracle had the same flaw, hidden by the meter path).
(2) *makes by different authors*: the oracle's reading taken: an output's makes are those its own author wrote (things.md, A make, now says it:
a make by another, named by a thing she did not write, makes her no owner of it); the core now filters by author. Stories
circles/a-store-owned-in-common (parts for grain received; one shrink block: 600 kg gone, every owner's by her parts) and
things/a-make-is-its-authors. Text: things.md, Transfers, **Mixed goods**: her lot and his duty (`to_holder`, his `keeping` promise), her
share of the mass (a circle), or the store's promise (a loan); with none said, how it is stored is not said. promises.md's stored-goods note no
longer calls a promise of a kind storage, and no longer points at Shares. circles.md: **A store owned in common** is a circle, its shrink
one block under its row on the chain `refs.meter` names. things.md's "a loan moves the owner when its promise's `refs.what` is a kind" now
reads the line's `what`.

**c. Genesis (genesis.md, items 7 and 8).** (1) *A key named by hash in her genesis could never speak*: core.md section 5, `refs.key`: "a key
grant that shows a key named by hash in her genesis list names that genesis"; section 8 says the same. Both engines (oracle check.cjs and
`resolveKeys`; core valid.rs `signature_findings`, identity.rs `shown_key`). Story keys/a-hidden-key-in-her-genesis: it speaks; a key not in
the list is `bad_signature`; its next block counts in the top place. protocol.json `suites.future.pq` is `slh-dsa-sha2-128s` over `sha256`
(a future row only; nothing signs with it). (2) *Freezing a stolen phone*: identity.md, The people of a voice reach above it: "A key grant of
theirs that reaches above their place is never narrowing." That sentence is the report's, and it is Rust's reading, not the oracle's: a freeze
that only leaves a lower voice out narrows and stands once `needed` of them sign; a grant that puts a key above them waits their `wait`. The
oracle now agrees (`reachesAbove`). Story keys/people-freeze-a-stolen-phone (with `above` and without, and a reach above that waits). Freezing is fast
and a takeover slow (the coordinator confirmed this reading).

**d. Merges (merges.md, item 4).** (1) *A grant labelled `kind: "stop"` skipped her wait*: both engines' `givesPower` branched on it; deleted.
protocol.json `kinds` now declares every kind a word fold reads (`observe`: `done`, `link`, `work`; `thing`: `kind`, `share`; `actor`:
`circle`), and **test/kinds.cjs** (run first by `npm test` in sdk/javascript) fails if either engine compares a block's `state.kind` with a
kind that protocol.json does not declare and no reading in conventions.json names (conventions.json's clearing now names its `rate`). Story
keys/a-kind-is-a-label: the thief's grant labelled "stop" waits the phone's day. The machine lock (a reading of a grant of kind `stop`) is
left for Patrick; it now waits as any grant does. (2) *13 door vectors typed the late judge's message `grant`*: re-typed `observe` of kind
`message` and re-signed (tools/vectors.cjs now writes a block's type back, and steps.cjs moves such a block); cases 540 and 541 now differ:
the judge one side named alone rules on nothing (`underway`); once the other side accepts the message, her ruling counts (`accepted`).
(3) core.md section 1: a grant is "the signer's consent to who may speak as him (key grants) or act for him or on what is his (every other
grant)"; a machine signs readings, its own key grants, or a narrower part of a grant it holds.

**e. A voice's bounds with no reach** (limits/card-pin.md). Both engines already agreed: the bounds bind. identity.md now says so: "The bounds
bind whatever the voice's `reach`, with one or with none." Story keys/bounds-bind-with-no-reach.

**f. The acts library.** "Asking for a ruling on a dispute" and "Claiming a crossing" no longer name `rulings: public` or a judge's offer
term: a ruling's audience is the judge's own block's; whoever holds it may show it. "operator grant" is gone from form.json and FIELDS.md
(a machine moves under its owner's grant). compiled.json, LIBRARY.md and view/index.html rebuilt by acts/tools (compile, check: all pass,
build_library, build_page). The acts' own fact `undo` (whether an act can be undone, one of FoodOS's judged facts) is the library's word,
not the protocol's, and stays. No `referee`, `terms.rulings`, `scope.until`, `owed`, `runs`, `not_on_line` or door `held` was found as a term.

**Flagged for Patrick**
0. Item 3 reads "a loan" from two signed fields: a line's quantity and its price in one kind. A loan of flour repaid in money (quantity in
   kg, price in £) inside a promise that names a job reads as a job of 10 kg; it is not refused.
1. Circle rows: `"any"` is a new explicit form (a row's `parties`, `on`, `what`); with it, `what: "any"` reaches the circle's own parts. A row
   with no `on` now holds no promise and no payment except of a deal the circle already bound: a café's members can only fill the circle's
   standing promises, or say `on: "any"`.
2. A transfer of a deal the circle bound is checked against the deal's terms only through the stage, not against what that deal names its side
   to hand over (a grant's `not_due`); rows do not read `not_due`.
3. An offer stopped by its giver stays held until the one it is for has seen the stop, or a clock shows it: an unanswered offer whose receiver
   never writes again stays held (folds.md, Freed, as written).
4. The freeze (c.2): her people freezing a voice below them stands at once; replacing a voice above them waits their `wait` (the
   coordinator confirmed this reading). Both engines and keys/people-freeze-a-stolen-phone say exactly that.
5. The four text contradictions (a, last bullet) were each resolved toward silence meaning nothing.
6. things.cjs 751 and 755 (a make under a grant's inputs test; coming back in ownership): not built this round.
7. spec/readings/readback.cases.json still names the world's blocks `held` (it is hashed with its reading).
8. `.claude/worktrees/agent-a338c82935c3fe1c2` is an old agent worktree under Claude's configuration folder; left.
9. The word cut is about 4% of spec/; a deeper cut needs each rule moved to one home (a 2.0 restructure).

**Door ops whose answer changed (for FoodOS)**
- `row_holds`, `speaks_for`, `circle_state`, `backed`, `binds`, `ways_in` and every fold over blocks `as` a circle: a row's silence allows
  nothing (item 1). FoodOS must write `parties: "any"`, `on: "any"`, `what: "any"` where it means them, and a limit or each where a row draws.
- Every op: the argument `held` is `blocks` (positional, so only named callers change); `write` options `{ key, blocks }`.
- `push_answer` (and the host's push answer): `held` is `had`. `check_reads`: `read[].held` is `read[].has`. `under_ok`, `backed`: the fork
  answer is `{ pair: true, blocks, at_most }`.
- `read`, `write_refusals`: a promise with `state.what` and a line whose quantity is of its price's kind (a loan) is `lines`; a job line
  with a quantity in hours is valid; a non-circle actor with `pack` or `rules`
  is `undeclared_field`; a missing `!` field of a protocol kind is `required` (was `shape`); a header whose pieces name a hidden key and that
  no named key opens is `unmet` (was `bad_signature`); a key grant showing a key hidden in her genesis list, naming the genesis in
  `refs.key`, is valid.
- `stands`: a grant labelled `kind: "stop"` waits as any grant does; her people's freeze that only leaves a voice below them out stands once
  signed (the oracle had made it wait).
- `ownership`: an offer stopped by its giver stays held until the receiver has seen the stop; the giver's decline of an accept frees it; a freed
  draw lists no `waiting`; a late accept binds its giver only by her yes or a block that performs the deal; one make from several of her lots
  starts her output; an output's makes are its author's.
- `promise_stage`, `promise_view`: an order in hand counts no more than it states; a late accept is acted on only by a yes or a performing
  block; the backup judge's turn starts only from a side's dispute of the other side's block.
- `scope_reading`: unchanged (its description said `until`; it is `expires`).

**Counts, before and after.** Files (tracked and untracked, not ignored) 736 to 673; code files 427 to 430; code lines 76,508 to 73,882. Door cases:
vectors.json 2,045 to 2,123, conventions-vectors.json 868 to 884 (2,913 to 3,007); audit-vectors.json 17 worlds, 2,224 cases (frozen again);
fuzz-vectors.json 14. Words in spec/ without the generated NECESSITY.md: 103,514 to 99,981 (cut about 4,500, added about 950: the row rule, mixed goods, the
store, the unknowns, the genesis key, the freeze, the in-hand cap); with the regenerated NECESSITY.md, 109,197. The
rebuild: the first full run kept 2,655, deleted 258 (story questions whose stories were written again) and added 336; then the retyped
judge messages (6 renewed); then the narrowed loan-or-job refusal (45 added, 33 renumbered); then a fixed point: 3,007 kept, nothing else.

**The checks.** Vectors rebuilt to a fixed point (0 faults; the core gives every answer the oracle gives). cargo test: 21 test binaries,
242 tests, every one passing (audit_vectors included; the hand-written circle, deal, key and rules tests now state their rows' `"any"` and
show the stopped offer held until seen). sdk/javascript: test/kinds.cjs passes; run-vectors 3,199 passed; the oracle 5,371 passed (door and
audit frozen answers); node tests 57 passed; the audit 33 checks (one store expectation now lists the new `lines` code: the loan-and-job line it
writes), parity 0 differing. Python 40 tests OK; Go ok; Swift 26 tests, 0 failures (XCFramework rebuilt); Kotlin 24 tests, 0 failures (JDK 17,
natives built from today's core); MCP 35, CLI 10, host 59 passing. Short fuzz (`diff.cjs --seeds 1-25`): 11,579 questions, 5,914 property
checks; 12 findings, all known, 0 new (the corpus alone: 1 finding, known). sync-spec, gen-door, version-sync and the CBOR key table (152
names) current; acts/tools/check.py passes.

**Necessity.** One full measure (474m36.555s): 126 things: 117 covered, 9 used, 0 structural, 0 untested, 0 dead; invariants: 27/27 stated and carried. `node tools/necessity.cjs --check` exits 0. It ran in full after the last engine change (started 12:49), so it covers every part this round touched; a
`--only` run on top of it would measure nothing new.
