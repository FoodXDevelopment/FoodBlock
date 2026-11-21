# The conformance oracle

An independent implementation of FoodBlock 1.8 (built stage by stage; today stages 1 to 3: keys, the store and amounts), written only from the spec text (`core.md`, `canonical.md`,
`protocol.md`, `transport.md`, `protocol.json`, `modules/*.md`, `profiles/*.md`) and never from
any SDK. It is plain Node with the built-in `crypto`: no dependency, no network, and no line shared with `sdk/`.

- `fb.cjs` is the oracle. It has the canonical form (RFC 8785 plus strict writing), the three suites (`std`, `p256`,
  `sm`; SM2 signatures and SM4-GCM are written by hand, the rest is Node), the wire (a message is its canonical bytes: `strict_text`, `strict_push`), `valid(block, held)` (core.md section 8, checks 1 to 6: who said these bytes, reading only a block's pieces; a block is signed over its header, a genesis over its own bytes) and `read(block, held, schemas)` (names held and read, then check 8; a block valid and not read is kept as its header), the line (`read_whole`, `onLine`, `{ not_shown: true, lacks }`), pairs by one `prev` or one `seq`, a push judged on pieces (`accept`: taken, unjudged, refused, unread), the arrival log (`answer_pull` with `log` and `seen`, `log_shown`), leaving (`exportOf`, `exportWhole`), the chain, the identity fold (her list of voices, keys under a voice, the second signature and the wait, reach, operators) and `stands` (blocks.md, Finality), circles, the promise stage and its view, ownership, place,
  consent, admission, signed requests, the successor (its close rests on the witnesses' key grant), rekey and ballot profiles, the short code and the short reply, and the compact CBOR form (key
  table 1).
  Stage 3 (amounts): one amount shape `{ value, unit, of? }` with exact decimal sums printed in one form (`fText`), and ONE function for what is left (`drawsOn`, folds.md, What is left): each owner's amount drawn on along one line, in `seq` order, against a running amount; a draw holds from where it is signed, lands on the receiver's yes, is freed by her no or an end she has seen, and one that does not fit takes nothing. Ownership of an instance (parts, makes with `state.inputs` and whose the outputs are, a kind by its own block), `made_from`, a pot's payouts, an open offer's allocations, a claim handed on and what a side is owed all call it and nothing else; so do the other side of a deal (`uncovered { from, to }`, `unanswered`, the basic phone's `received`) and the export clause (the line back to each fold's own start). Where a fold's line is not read whole it answers `{ not_shown: true, lacks }`. A grant's limit, its meter and the four limit ops are stage 4's and still read the 1.7 money shape (`legacyMoneyProblem`). `door(op, ...args)` is the table of ops the `door` section of the vectors names. It also holds what a push needs of the spec: what a block needs (`needs`) and waits for, the rounds of `accept` and `accept_sealed` (a sealed block's public header, checked once the block it names in `prev` is held), the circle's cut, and consent following the principal.
- `run.cjs` runs it against every section of `spec/vectors.json` and `spec/canonical-vectors.json`, vector by vector.
  It also checks that every block in every story passes `valid` against its story (a block a story marks void on
  purpose is the one exception).

```bash
node spec/oracle/run.cjs        # exits 1 on any disagreement; -v lists every case
```

A door case with `oracle: false` is outside the spec text and is skipped (the run prints how many). A signature made by
the oracle signs p256 and SM2 with RFC 6979 deterministic nonces, as core.md requires, so its signatures match the vectors byte for byte.

Rules for editing the oracle: read only the spec. A guess that the text does not settle is marked `GUESS` in the code
(and is a gap in the spec worth closing), never copied from an SDK. When the oracle and a vector disagree, the spec
text decides which is wrong; if the text supports the oracle, leave the disagreement standing and report it.

## 1.9 core set, first half (layers 3a and 3b of `changes-1.9/CORE-SET.md`)

Built in place, from `CORE-SET.md` and `00-shared.md` alone, apart from the Rust core. `core-set-a/` holds one script per entry (`node core-set-a/run-all.cjs`): each question prints the oracle's answer and the answer the text gives, and OK or DIFF.

- `valid` reads five things in order (size, bytes, header, pieces, signature) and gives eight codes; every judgement of a value is `read`'s (`validCheck` and `valueCheck` in `contentFindings`).
- One byte form: members in UTF-8 byte order (`jcs`, `byBytes`); `strict_push` is `{ refused, messages }`; `state.rule_set` is `unknown_rules`; a header-only or unread block hides what it could name (`namedIds`, `walkLine`).
- A line has its place (`lineInfoOf`: `on`, `out_of_place`, `off`, `hole`); `drawsOn` reads a line in `prev` order, decides the draws of a pair together (Rule B, twins `for` one deal once), reads allocations apart together, and continues a line past a key replacement.
- A place where the text is silent or can be built two ways is marked `1.9-GUESS [3a-N]` or `[3b-N]` in `fb.cjs`.
- Not built: 3b-13 (a clock orders a pair).
- The vectors (`spec/vectors.json`) are still the 1.8 ones: they are regenerated once, when the set lands.

## 1.9 core set, second half (layers 3c, 3d and 3e of `changes-1.9/CORE-SET.md`)

Built in place from `CORE-SET.md` and `00-shared.md`, apart from the Rust core. `core-set-b/` holds one script per entry or group (`node core-set-b/run-all.cjs`): each question prints the oracle's answer and the text's, and OK or DIFF. `core-set-a/3a-12.cjs` writes a world file under `/tmp/ob/` (make it first).

- `keepers` is `clocks` everywhere (3d-3). `protocol.json` is regenerated once when the set lands, so the oracle reads its own copy with the word renamed.
- Holds (3c): an offer or order-less promise that names the signer's instance and a receiver is a draw (`kind: 'offer'`); a transfer `for` it performs its hold. Rule A frees an unlanded draw on the receiver's own no, even after her yes. A condition that can no longer hold frees (`conditionDead`). No fold reads a reader's clock (`ownership`, `pot`, `condition_holds` ignore it). `owed*` outputs are `to_come*`.
- Keys and time (3d): a clock is a line (`clockLine`), read by place (`placedBefore`), never by dates; a cutoff closes by its place (`cutoffsOn`, `lineVerdict`); `needed` lines for the reading that widens, `names` less `needed` plus one for the other (`clockSays`, `deadlineReading`). The cut: a block joined to no other person's block stands when signed; a joined one passes where the joiner has not seen the end (`passesEnd`); `counted_to` puts a later block off her line. A stated end is read against a block's own `at`; a missing `at` is not in time. Mail key grants wait reach and the pair rule. A key's own key grant is never a suite move. Passkeys need user-verified. The people of a voice reach above it and may close (`above`). A genesis may state her list. A will is her transfer on `{ closed: id }`.
- Amounts (3e): paid only by the payee's word or by the draw on the instance a price's `of` names; her words about one block count once; `terms.in_hand`; a total prints `n/d` when it has no decimal form; `step`; `uncovered.from` pieces are P times p over a; the account word lists `destinations`.
- A place where the text is silent or can be built two ways is marked `1.9-GUESS [3c-N]`, `[3d-N]` or `[3e-N]` in `fb.cjs`.
- Not built: a reader that no longer believes a suite (3d-12, no door argument names belief); the clock rule for her stop of a will (3d-16); the clock path of Rule A for a giver's end (3c-3); grant stops by clock (stage 4).

## 1.9 stage 4 (grants; `changes-1.9/04-grants.md`)

Built in place from `04-grants.md` and `00-shared.md` alone, apart from the Rust core. `stage4/` holds one script per story of section 5 (`node stage4/run-all.cjs`): each question prints the oracle's answer and the text's, and OK or DIFF. Snapshot before: `~/foodx/archive/foodblock-before-1.9-stage4-2026-11-19/`; the old `fb.cjs` is kept as `stage4/fb.before-stage4.cjs.txt`.

- `whyNotUnder` is G1, one rule (`s4Core`: grant live, type, parties, Keeps to or "of that deal", Due, one fill, no one both sides, her deadline, her stop of one thing; then the limit; then standing). `keepsTo` is Keeps to (`{ keeps, why }`), with ranges and lists at the set places. `s4Meter` counts one line: the holder's own line from its blocks (a pair gives `{ pair, held, at_most }`), another key's from its receipts (`state.drawn`; a receipt whose total is not the total before plus its amount binds only its signer). Child grants are draws on the parent's line (G9). `s4Lowest` is G15, `grantSeenBy` is G16 (a stop seen by the clocks' lines, `names` less `needed` plus one), `worstOp` is G18.
- Door: `keeps_to`, `meter`, `worst_case`, `lowest_offer` added; `under_ok`, `backed` give the fork answer; `scope_reading` has the new fields; `within_limit`, `limit_commitment`, `limit_opens`, `limit_within_parent`, `limit_fence` and `operators_of` are gone (the operator grant is deleted: `operatorsOf` reads none, and `identity_state` has no `operators`).
- Write checks: scope fields, `refs.meter` required where a grant can bind, `state.draws`, ranges and lists only at set places, child grants (`shape`, `wider_than_parent`), her stop of one thing, a voice's `each`, `limit`, `every`.
- A place where the text is silent or can be built two ways is marked `1.9-GUESS [4-N]` in `fb.cjs`.
- Not built: G13's sale on the receiving tool's line (the pass itself is), a lift that waits a voice's `wait`, a tablet's part of a voice's limit, a judge that frees a deal's rest, the period of a voice's `every`, a pair on a tool's line under another key's meter.
- Earlier answers that changed: core-set-b 3d-1 (an `observe.note` under a grant now speaks for its signer alone: G1 says a note is no block that binds); 92 cases of the 1.8 vectors for the removed ops and for `scope_reading`'s old shape (the vectors are regenerated once when the set lands).

## 1.9 stage 5 (deals; `changes-1.9/05-deals.md`)

Built in place from `05-deals.md`, `00-shared.md`, `CORE-SET.md` and `changes-1.8/05-deals.md` (which the oracle had never built), apart from the Rust core. `stage5/` holds one script per story of the text and per case the owner named (`node stage5/run-all.cjs`): each question prints the oracle's answer and the answer the text gives, and OK or DIFF. Every place the text is silent or says two things is in `changes-1.9/stage5-oracle-silent.md`, with the story that pins it; the code marks it `1.9-GUESS [5-N]`.

- The deal's stage: an answer binds when it stands and its open points are closed; a request is listed in `requests` with `when` or `whose` (or `which` on an open offer); `waiting`; accepts that bind and do not see each other are `crossed` (`per_accept`, the stage the furthest); `forks` are the pairs in the deal. A decline ends a standing word for its signer only; a later decline reaches nothing that binds. A promise conditioned on `{ accepted }` binds on its own accept.
- Paying: the seller's spot-exchange transfer (`state.covers`) is his yes and his delivery in one block; a payee's `covers` counts as her word; `forfeit` is kept only on the payer's own first stop; work counts by the signal the job names, else by the receiving side's `accepted`, and a payment counts the work in its causal past; `forfeit` and `waits_on` as before.
- The bench: its names, `needed`, `wait` and `clocks` are the `bench` output (also on `gives`); a later name's turn begins from a span cutoff on `needed` lines of the clocks the grounds name; a judge named after the deal counts only where each side and every holder of what either has to come named or answered her.
- Conditions: `{ closed }` and `{ stopped, side }` are shapes; `ruled` is read from signed fields in the past of the relying block (no clock) and a later ruling that has seen the earlier one ends it only for blocks that had not used it; `settled` and `paid` are named readings no fold reads (the door op `condition_holds` runs them).
- Deleted: `terms.refrain`, `notice`, `personal`; the stage `breached`; `pass`, `answerable`, `owing`, `passed`; the successor profile, its `close` observe and the heir clause; `owed` names (now `to_come`, in `fee_back` and `clearing_applied` too); `invasion_shown`'s `standing`, `crossed`, `commanded`, `accused`, `nothing` and `up_to`; `bids_shown`, `earnest_shape_ok`, `earnest_paid`.
- Earlier answers that changed: the 1.8 vectors for the deleted ops and fields (`invasion_shown`, `bids_shown`, `earnest_*`, `fee_back`'s `owed`, `clearing_applied`'s `owed`) now fail; the vectors are regenerated once when the set lands.
- Not built: the clock path of Rule A for a giver's end; the `draw` field on `gives` (SILENT 6); no export to `sdk/rust` (that is outside the files this stage may touch).

## 1.9 stage 6 (circles; `changes-1.9/06-circles.md`)

Built in place from the text and `00-shared.md` alone, apart from the Rust core. `stage6/` holds one script per story (`node stage6/run-all.cjs`): each question prints the oracle's answer and the text's, and OK or DIFF. Where the text is silent the choice is listed in `changes-1.9/stage6-oracle-silent.md`.

- A circle is `pack` (whole parts), `rules` (rows: `{ parts, scope }` or `{ to, needed, scope }`), `clocks`, `refs.meter`. Parts are title: the ownership fold reads them like any amount (the founder's first; a fraction of a part takes nothing, `unit`).
- One answer, `circleHolds` / `rowHoldsRaw`: a block `as` a circle speaks for the owners where one row holds for it (hands counted in one place: the move or a confirm of it) or where every owner signs it; else it waits (`on: hands`) and acts on nothing. Versions, head counts, grants under a row, the listing, the line (meter or `counted_to`) hang on it.
- Doors: `circle_state`, `circle_versions`, `row_holds`, `ways_in`, `members_then`, `circle_key`, `count_of`. `may_act_as`, roles, powers, member grants, `removal`, `needed`, `change` and `circle#role` are gone.
- Cycles: a cycle read while a row is being read marks what asked (`_taint`), so no answer built on a placeholder is kept.

## 1.9 stage 7 (last; `changes-1.9/07-last.md`)

Built in place from `07-last.md` (with `00-shared.md`, `CORE-SET.md` and the "What building changed" sections of stages 4 to 6) alone, apart from the Rust core. `stage7/` holds the stories (`node stage7/run-all.cjs`): each question prints the oracle's answer and the answer the text gives, and OK or DIFF. Where the text is silent: `changes-1.9/stage7-oracle-silent.md`.

- Who learns what: an unsigned pull gets public blocks and nothing of a sealed block (a signed one also gets the copies held for it); no `withheld` anywhere; padding to 512, 1024, 2048, 4096 then each 4096 (`seal` with `{ pad: true }`); a wrapped copy `{ mailbox, envelope }` and a node's admission rule for copies (`accept`'s third argument); a receipt that names only its own push (`receiptFor`).
- Rule sets by hash: door ops `rule_set`, `spec` (with `rule_set`), `read` with `runs`; discovery says `reads`; a schema's typed fields (`shape`, `required`) in `read`.
- The cut: the 37 protocol ops of `protocol.json` `door.protocol` are all answered; the machine lock is a stop of the machine (`{ locked, locks, claimed }`); `mount` and `unmount`; `public_key_of`.
- `dealer.cjs` (the dealer peer of D4) and `readback/` (the reading `readback`, the renderers `en` and `en-sms`, the digest and its redo; each file is named by the SHA-256 of its bytes).
- An old reader: a walk that stops at its own limit (`setReadLimit`) names the first make it did not read in `lacks`.
- The owner's three decisions of 2026-11-19: a row's money cap reads a sale's draw as its money total; `binds` of a draft signed `as` a circle answers as if her hand counts; `circle#role` and `of_members` are gone.
