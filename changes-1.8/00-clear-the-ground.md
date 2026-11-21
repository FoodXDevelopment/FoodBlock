# 1.8 stage 0: clear the ground (the exact edits)

Decision 5: a name is a reading. What a deal is, is what its blocks say; any name for it is its reader's own. So the protocol stops stamping deals with an act and stops checking deals against act templates, and a grant's scope says what it covers: types. Words as in 00-shared.md section 2: a **type** is what a grant covers; an **act** is a person's name for what she is doing (a reading, no field); a **move** is one signed step; a **deed** is something done in the world. The verb "act" stays free ("acts under a grant", "only persons act").

## 1. Spec text

**`spec/core.md`**
- The one shape: delete the sentence "An act (a way people deal) is not a second thing: ... (promises.md, An act is a template of the one shape)."
- The block's three fields: "`type` says what kind of act it is." becomes "`type` says what kind of block it is."
- "**A signer cannot deny her own signed act.**" becomes "**A signer cannot deny her own signed word.**"

**`spec/modules/promises.md`**
- Delete the paragraph "**An act is a template of the one shape.** An act, in the sense ... never a term of the deal." Put in its place, whole:
  > **A name is pencil.** What a deal is, is what its blocks say: its sides, what moves, its typed terms, and the blocks made `for` it. A name for it (selling spare food, khata, a lease, a loan, a partnership) is a reading of those blocks, and its reader's own. Any reader may give one; two readers may give two, and neither is wrong: the two sides of one deal are often doing different things, and each names her own. No field of a block states a name, and no fold answers one. A person may sign her own name for a deal, an `observe` whose `refs.subject` is the deal: it binds her name to it and no one else's, changes no stage of the deal, and nothing writes one unasked. Sides who want words they share name one schema in `refs.schema` (things.md, Schemas). **An open offer is its own template:** it carries every term the deal will have, and a taker answers it, choosing only what the offer leaves open. Ground: only a signed word binds, and only as written; what a person is doing, and for what end, is hers to say (Mises: only persons act).
- What becomes whose: "never a word of a template, a schema or text" becomes "never a word of a schema or text".
- No partnership type, last sentence: becomes "“Partnership”, “commenda” or “loan” is a name (A name is pencil)."
- "Taking an act as yours afterwards" becomes "Taking a block as yours afterwards"; in it, "An act outside a grant" becomes "A block outside a grant" and "the rule for taking an act" "the rule for taking a block".
- An autonomous system's ask: "unless its grant names the act" becomes "unless its grant covers its type"; "its `scope.acts` does not name the promise exactly" becomes "its `scope.types` does not name the promise exactly". Invariant 22 likewise.
- An answer to a question: "a grant's `scope.acts` may name `observe.answer`" becomes `scope.types`.
- Invariant 32 becomes "32. What a block gives is read from its typed terms and refs alone, never from a word of a schema or a text." (the template half is deleted). It keeps number 32.

**`spec/modules/things.md`**
- Schemas, after the `labels` bullet, added whole:
  > **A schema adds and never takes away.** It may declare fields, terms and roles a closed block may then carry. It cannot forbid a field or term the protocol reads, make a side be named, or set a smallest size. Its words are pencil. A reader that turns away a sound block because it does not match a schema's words is using its own rule of admission (consent.md), never the protocol's.
- `undo`: "when the act cannot be taken back" becomes "when the block cannot be taken back (authority.md, Blocks that can be undone)"; the base-schemas paragraph's last sentence: "counts for an act" becomes "counts for a block".
- Uses of a place: "**A use is an act.**" becomes "**A use is a deed.**"; "The kinds of use are the acts a schema lists" becomes "the ones a schema lists"; "**A use names its act ...**" becomes "**A use names what was done ...**", "name different acts" "name different uses", "same act"/"different act" "same use"/"different use"; the water-draw view "acts, first and last" becomes "uses, first and last".

**`spec/modules/folds.md`**
- `use_shown`: the output field `acts` becomes `uses`, and `overlap_acts` (`[{ with, act }]`) becomes `overlap_uses` (`[{ with, use }]`), "share an act word" "share a use word".
- The second invariant 32 ("An owner changes only for one of three reasons") is renumbered **37**: 32 was used twice. Its four vectors are retagged.

**`spec/modules/authority.md`** (one meaning per word: a grant covers types; one signed step is a block)
- `state.scope`: `{ acts, ... }` becomes `{ types, ... }`; "`acts` lists block types or `type.kind` names" becomes "`types` lists block types or `type.kind` names"; "the ids the acts may deal with" becomes "the ids its blocks may deal with"; "A missing `types` covers no block (list the types you give)" is said once here.
- `refs.under`: "the scope (acts by exact name, parties)" becomes "(types by exact name, parties)". Who a block speaks for, check list: "the act is named" becomes "its type is covered".
- Scope subset: "A missing `acts` or `parties`" and the table row `acts, parties` become `types`.
- "**The act's own date:**" becomes "**The block's own date:**" with "an act whose `at`" "a block whose `at`", "An act with no `at`" "A block with no `at`", "pass on an act outside `until`" "a block outside `until`"; the fence paragraph "(the grant's `acts` and `until` still bind)" becomes `types`.
- "Do as you see fit": "the grant carries the list in `scope.acts`, each act by its exact name" becomes "in `scope.types`, each type by its exact name".
- The heading "## Acts that can be undone" becomes "## Blocks that can be undone"; in it "A grant covers only acts its grantor's own word names. An act **moves things or binds someone** when" becomes "only blocks ... A block **moves things or binds someone** when", and "the act" (one block) becomes "the block" through that section, "a grant whose `scope.acts` names that act" becomes "`scope.types` names its type", "A grant listing only a broad kind of act" becomes "a broad type", "**An ask names the act**" becomes "**An ask names the block**", "**One ask backs one act**" "one block". Invariants 6 ("An act's own `at`") and 23 ("An act that moves things") say "block". "One agent, many principals", "A delegation carries its moment", the limit paragraphs ("a cap on one act", "An act whose own value") say "block" likewise.
- Anything pointing at "Acts that can be undone" elsewhere (things.md, protocol.json) points at "Blocks that can be undone".

**`spec/modules/nodes.md`**: `order_channel` "a list of acts" becomes "a list of types"; "the acts an autonomous system may send first" "the types".
**`spec/THREAT-MODEL.md`**: "outside the grant's acts" becomes "types"; row G "side-acts", "signed act" become "side-blocks", "signed block".
**`spec/protocol.md`**: glossary "Act" replaced by:
  > - **Type:** what kind of block it is: one of the seven, or `type.kind` where a kind narrows it. A grant covers types (authority.md). *Act* is not a word of the protocol: what a person is doing, taken whole, is a reading and hers to name (promises.md, A name is pencil).
  "`limit`, `every`, `each`": "a cap on one act" becomes "a cap on one block". The invariant table: 32 in promises.md and 37 in folds.md; 33 to 36 added to promises.md (they were missing).
**`spec/profiles/successor.md`, `tax-recall.md`, `foodblock-profile-epcis.md`**: `scope.acts` becomes `scope.types`.

**`spec/schemas/schemas.json`**: delete the base schema `act`. The hints of `admission.order_channel` ("the types, as type.kind"), `place_use.layer` ("name different uses") and `answer` ("may allow the type") say types. Every base schema's id changes (they are one chain); `published.json` is regenerated.

## 2. `spec/protocol.json`
Delete: the key `act` (about, kind, fields, sides, types, types_about, moves, moves_about, record: 64 closed names); `act` from `refs.what_and_which` and from `refs_single`; the sentence on `refs.act` in `refs.about`; the door op `act_check`. Rename: `scope` entry `acts` to `types`; `narrower_than.acts` to `types`; `cbor.keys` entry `acts` to `types` (same integer, 83); and delete the door op `act_name` (it named "the act a block is"; it had no vector, `type_name` is already a refusal code, and what a grant covers is `under_ok`'s question). Text: `refusals.codes.fold.not_live` and `quote_only`, `door.ops.under_ok`, `door.ops.scope_reading` (output `types`), `use_shown`, say type and block.

## 3. Door ops
Delete `act_check` (door.rs arm, door.table, the six generated doors, the hand-written exports in JS `fold.cjs`, Python `fold.py`/`__init__.py`). Delete `act_name` the same way (door.rs, door.table, generated doors, JS `grant.cjs`, Python `grant.py`, Go `grant.go`, Swift `Grant.swift`, Kotlin `Folds.kt`, READMEs); the core keeps a private `type_name`.

## 4. Code
- Oracle `spec/oracle/fb.cjs`: delete `actCheck` and its helpers (about 66 lines); `scope.acts` to `scope.types` in the scope check, the grant cover test, the undo rule, `scope_reading`; `actNames` to `typeNames`; `use_shown` output `uses`, `overlap_uses`.
- Rust core: delete `src/fold/act.rs` and its `mod`/`pub use`; `check/grant.rs`, `grant.rs` (`covers`, `scope_reading`, `why_not_under`, the undo rule, the successor close): `scope.types`; `act_name` to a private `type_name`; `fold/deal.rs`, `fold/uses.rs` likewise; the reason texts "the grant's acts do not cover a ..." become "the grant's types do not cover a ...". `tests/door.rs`, `tests/fixtures/deep-grants.json`, `tools/sim/src/episodes.rs`: `types`.
- `mcp/`: the `connect` tool's argument `acts` becomes `types`; the gate's reason "does not name the act `promise`" becomes "does not cover the type `promise`". `cli/`, `host/`: nothing reads these (checked by grep).
- `tools/fuzz/`, `test/audit/c9.cjs`, `c15.cjs`, the vector makers: `scope: { types }`. `make-vectors-acts.cjs` becomes `make-vectors-gives.cjs` (the `gives` cases, no templates, no `refs.act`) plus three new cases: a promise with `refs.act` and no schema declaring it is refused `undeclared_ref`; each side's own `observe` naming a deal is sound and changes no stage; a schema whose words say "free" on a deal with a price: `gives` reads the price. The template cases leave `make-vectors-market.cjs`. A signing key whose seed no maker in the repo holds (229, from scripts no longer in the tree) is replaced by a fixed key, `sha256("foodblock 1.8 stage 0 re-keyed: " + old key)`, and its author's chain is re-signed: every answer is the same up to the id and key map.

## 5. Vectors
- Removed: the 28 door cases named `act: ...` (27 `act_check`, 1 `refusals`).
- Re-signed: every block whose bytes change, by a one-off tool (`changes-1.8/00-clear-the-ground.resign.cjs`, then `00-clear-the-ground.answers.cjs` for the renamed answers, the sealed copy, the base-schema cases and the order of ids; both kept here as the record): `scope.acts` becomes `scope.types`, `refs.act` is dropped, the old base-schema chain is replaced by the new one (the `act` schema is dropped from every list that held it), then every block that names a changed id is re-hashed and re-signed with its fixed-seed key, to a fixed point; every old id is replaced by its new id everywhere (refs, expectations, case names, headers); the one sealed copy and the headers whose block changed are sealed and signed again. Every door case is then re-run on the new core: an answer equal to the old one up to the id map is accepted; every other changed answer is listed in the report (expected: `scope_reading` says `types`, `use_shown` says `uses`/`overlap_uses`, reason texts that said "acts").
- Then `make-vectors-gives.cjs` is run. `spec/schemas/published.json` regenerated by `make-schemas.cjs`. `spec/profiles/epcis/vectors.json` re-signed by the same tool (its `make-vectors.cjs` already failed before this stage: a genesis without `audience`). `spec/canonical-vectors.json`, `test/vectors.json`: no act in them (checked); untouched.

## 6. Builds, tables, docs
WebAssembly, Go's copy, the Python library; the Swift XCFramework and Kotlin natives if their scripts run here. `node tools/necessity.cjs` regenerates `spec/NECESSITY.md`. `README.md`, `ARCHITECTURE.md`, SDK READMEs, `CHANGELOG.md` (one entry, "1.8 stage 0", 2026-11-11).

## 7. `acts/`
Stays as an open library of names. `README.md` and `PATTERNS.md` say so plainly (report 14, S11: a grant names types, parties and a limit and no act; an entry may be published as any open `thing`, which the protocol gives no kind of its own and reads none). Deleted: `takes_of`, `sides_named` and `is_stake` in `tools/moves.py` and their fields in `compiled.json` (they existed only to build templates for the protocol); `shape_hash` stays as the library's own change-detector. The 358 names are untouched.
