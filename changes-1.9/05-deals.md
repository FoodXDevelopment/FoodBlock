# FoodBlock 1.9, stage 5: deals

Built from `changes-1.8/05-deals.md` by deleting, keeping and changing; nothing here is new that a source did not give. Uses `00-shared.md`'s words with its meanings (measure, draw, holds, lands, freed, line, read whole, `not_shown`, stands, waiting, the cut, relier, seen, pair, clock, receipt, cutoff, Request, `crossed`, Bench, `terms.waits_on`, Due, the payee's signal, Final, Pattern, the note, to come) and defines none of them again. Written as if the one set (`CORE-SET.md`, 3a to 3e) and stage 4 have landed. Where a rule's home is a folds.md or identity.md sentence the one set already writes, this stage writes only the promises.md pointer, and quotes the sentence so a builder has it in one place.

Each rule gives: the sentence, its home, its mark (*core*, *her word*, *convention*, *product*), and a story a builder turns into one fixed world in `tools/fuzz/corpus/` and one vector. Blocks are numbered in the order signed; each names its signer; the answer is the text's.

Sources: **D1** to **D15**, **E1** to **E3** (CHANGES-1.8, decided 2026-11-12/13 and 2026-11-16); plan parts **03 R1** to **R13**, **04 R1** to **R14**, **07 R20, R21**, **10 §9 T3-1** to **T3-10** (taken as a set); seats 05, 06, 07, 08, 11, 17, 26, 27, 28, 35, 47.

<!-- REMOVED 1.8's opening list of stage 1 to 4 words ("Who bears the gap", "keeper", "unanswered") | guarded: no one; a list of words | now: 00-shared, which this stage reads and does not copy. -->

---

## 1. What this stage does

1. **A deal still moves only forward.** An offer, a request and a transfer to a named receiver are standing words; an answer binds when it stands; only the bench lowers a stage, and it moves no thing. (Kept from 1.8.)
2. **Every hold has a way out, and it is the receiver's** (Rule A), bar a giver's end on a cash quote he took nothing on, a dead condition, a deal's rest that can no longer fall due, and a will, which holds nothing.
3. **A price is paid only by the payee's word, or by a draw on the very thing it names;** one payment counts once; prices multiply and never divide; the seller may sign a `step`.
4. **Twelve shapes go:** `refrain`, `breached`, `notice`, `personal`, `pass` (with `answerable`, `owing`, `freed_by`, `passed`), the word "owed" and its three outputs (renamed), the successor's heir clause, the refrain clause of `settled`, "broken word", the rule-set route of named readings, and about thirty sentences of judges' law.
5. **Three shapes someone wanted gone stay:** `forfeit` inside one deal (D14), the hand-over of a receiving place (the note), and `elapsed` as a reading.

**Amara's flour** (the 1.8 story, retold). (1) Sam S1 offers Amara 50 kg flour F at £60, `expires` Friday, `clocks` the market's clock K. (2) Amara A1 accepts Tuesday; K1 receipts A1 before its Friday cutoff: `accepted`. (3) Amara A2 pays £60 over PayLink; PayLink P1 `received` £60, naming Sam's account word and its place. (4) Sam S2 delivers F; Amara A3 accepts: `done`. (5) Amara sells 20 kg to Leila (a spot exchange). (6) PayLink P2 `defeats` P1. Expect: stage `done`; 20 kg Leila's, 30 kg Amara's; P2 ends P1 only for blocks that had not used it. Had Amara never truly paid, the record shows £60 to come to Sam; what PayLink answers for is only what PayLink promised Sam.

---

## 2. What a promise is (`promises.md`, opening, in place of "What a promise binds")

**T1. What a promise is.** *core*
> A promise is a transfer of title on a condition: *if this happens, this of mine becomes yours, and this person settles it.* Three signed words make title wait on a condition: a **promise** (a kind, a quantity, a price and terms; where it names an instance of its signer's, it holds it, folds.md, What is left); a **transfer with `state.condition`** (one thing or one amount, moved when the condition has held, with no further word of the giver); a **transfer to a named receiver** (its one condition is her yes). Every other block (an answer, a receipt, a signal, a stop, a ruling) says whether a condition was met; none states one.

Story: (1) Harry H1 offers lot L7 (10 sacks) to Amara at £60. Expect `gives` H1: L7 to Amara, held. (2) Harry H2 offers Bob "10 sacks of maize" at £60, no instance. Expect `gives` H2: nothing held.

**T2. When title passes.** *core*
> A thing or an amount passes where its owner's draw lands (folds.md, Lands): it stands, the receiver's yes is in its causal past or answers it, and its condition has held there. Not at the accept: an accept fixes the terms by which later blocks `for` the deal are read, and, where the offer is the draw, it lands or is freed exactly where that accept binds or does not (R-H2).

Story: (1) Harry H1 transfers sack X to Amara `for` her order, conditioned `{ paid: deal }`, the transfer stating a rule set R that runs `paid`. (2) Amara has not paid. Expect X `held`, Harry's draw; owner not Amara.

**T3. What binding does, when no body is bound.** *core*
> A deal binds when an answer to a standing word stands (Who may bind). It gives no one a right to an act of another. It does three things, all about title: it fixes the terms by which the blocks made `for` it count; it is the condition on which anything handed over `for` it is held, so what was paid for a deal that never came is still the payer's (`uncovered`); and it makes true the conditions others hang on it. A promise binds its signer's name and what she pledged, never her body: a side may always stop onward (Answers). A signed word never gives anyone a right to use force on the signer's body; only her own attack, never her word, ends that. Trade, loan, wage, deposit, warranty, stake and guarantee are all this shape.

<!-- REMOVED 1.8 "A breach is two facts ... A broken word: shown, never a debt. ... owed as the owner's own title, never as damages. A refrain's `breached` is the bench's finding" | guarded: the payer, by naming property held on a failed condition | now: `uncovered` (P9) says the same fact; "broken word" and `breached` were verdicts repeated (seat 07). -->
<!-- REMOVED 1.8 "A deposit, a bond and a forfeit" paragraph from the title theory | guarded: the café and the no-show guest | now: R-P10 (`forfeit`) in Terms and things.md, The caterer's bond, unchanged; one home each. -->

**T4. A ruling, and finality.** *core*
> A bench name's word changes which blocks of the deal count toward its stage and what is to come; it reaches a draw only where it stands in that draw's causal past, so a thing that landed and stood stays where it is. **A sale that states no taking back is final:** a taking back is a new promise of the one who takes.

Story: (1) Sam delivers F; Maria accepts, pays: `done`. (2) Maria sells F to Leila; Leila accepts. (3) Ruth, on the bench, `defeats` Maria's accept of the delivery a year later. Expect stage `underway` (the delivery no longer counts; her payment still does); F Leila's; `to_come` changes as the ruling's words say.

> Ground: title moves only by its owner's word, on the condition she stated before anyone relied on it; a body was never acquired, so no word hands it on (Rothbard, *The Ethics of Liberty*, ch. 19; Kinsella, revising Rothbard).

---

## 3. Holds, and their release

Each H-rule's home is folds.md (CORE-SET 3c) unless it says otherwise. promises.md takes one new pointer paragraph: "**A promise that names a thing.** Where a promise or a transfer names an instance of its signer's and a receiver, it holds that instance from its signer's word, and lands or is freed as folds.md, What is left, says: by the same rule that says whether her yes binds. A yes to an order holds nothing."

**R-H1. A promise naming a thing he owns holds it from his own word.** *core* (CORE-SET 3c-1)
> A block that names an instance of its signer's and a receiver is a draw on that instance, whether it is a transfer or an offer (its giver's own first promise to a named receiver other than himself). It holds the amount it states from where its signer signs it, on his line. A yes to an order holds nothing: the order is the buyer's word, and the hold starts at the seller's own word that names the instance and her (his offer, or his transfer). A block that names only a kind or an amount holds nothing.

Story: (1) Harry H0, H1 L7 10 sacks. (2) Harry H2 offers L7 to Amara. (3) Bob B1 orders L7; Harry H3 transfers L7 to Bob. Expect H2 `held`; H3 `past`.

**R-H2. It lands or frees by the rule that says whether her yes binds.** *core* (CORE-SET 3c-2)
> A draw that is an offer lands, or is freed, exactly where the accept that answers it binds, or does not. Its landing then waits on Due.

Story: (1) Harry H2 offers L7 to Amara, `expires` Thursday, no clock. (2) Amara A1 accepts, `at` Friday. Expect stage `offered`, `requests [{ A1, open: [when] }]`; L7 Harry's, H2 `held`. (3) Harry H3 declines A1. Expect H2 freed; no deal; never "no deal" beside "landed".

**R-H3. Her "no" frees what is kept for her, until it is hers.** *core* (Rule A; CORE-SET 3c-3)
> Before a draw lands, the one it would go to frees it by her own counted `declined` or `stopped` answer to it, or to the deal it is `for`, or by her counter to the offer that is the draw, even with her yes in its past. It is freed for its giver's later draws that have her answer in their past. An end by its giver frees it where she has seen the end before any yes, or, where the draw names a clock, once the lines that read no hold the end with no yes before it. An end by its giver that has her yes in its past frees nothing, save as R-H4 says.

Story: (1) Joe J0, box X. (2) Joe J1: X to Amara, `without` his arrival by 07:00 20 Nov, `clocks` Wanjiru and Leila, `needed` 2. (3) Amara A1 accepts. (4) Joe J2 stops J1. Expect X `held` (his end, her yes in its past). (5) Amara A2 declines J1. Expect X freed, Joe's. World B (the clock path): Harry H2 offers L7 to Amara, `clocks` K, `needed` 1; Amara A1 accepts; Harry H3 stops H2, not having seen A1; K receipts H3, then A1. Expect L7 freed, Harry's. With K receipting A1 first: `held`.

**R-H4. A cash quote accepted and never paid.** *core*, the meaning of his own term (CORE-SET 3c-4)
> Where a draw's landing waits on payment (`terms.waits_on: price`), its signer's end frees it where no block of his side accepting a payment toward the price is in the end's causal past.

Story: (1) Harry H2 quotes L7 to Bob, £60, `waits_on: price`. (2) Bob B1 accepts. (3) Harry H3 ends H2. Expect L7 freed, Harry's. World B: before (3), Bob B2 pays £20 and Harry H2b accepts it. Expect L7 `held` for Bob after H3.

**R-H5. A dead condition frees what it held.** *core* (CORE-SET 3c-5)
> A condition that can no longer hold, by the signed words and clock it names, frees what it held, for its giver's later draws that have that in their past. "Can no longer hold" is read only from the clock's own readings: for `within`, its no-reading; for `without`, the yes-reading of its inner condition. A condition that can never be shown (a bare `reading`, a bench of `none`) can no longer hold from its signing.

Story: (1) Harry H1: a bonus sack S to Leila on a bare `reading` "silo dry for an hour". Expect S never `held`; Harry's from H1.

**R-H6. A deal that stops short.** *core* (D5). Home: promises.md, Answers, after the onward stop; stage 4's Freed reads it for a grant's room.
> **The rest of a deal.** What a deal names a side to receive and has not come can no longer fall due where one of these stands: the payee's signal that the price is paid; her stop, where the offer said ahead that a stop ends what has not come (`terms.stoppable: true`); the end of the offer's `deliver_by` on a clock the deal names; or a ruling of a judge both sides named that says so (`state.ends_rest: true`, stage 4). Her stop alone ends none of the rest. Where the rest can no longer fall due, what her grant's line holds for it comes back (authority.md, stage 4).

<!-- REMOVED 1.8 P11 "An onward stop ends what is still to be done" | guarded: the side who stops | now: R-H6: her own stop ends the rest only where the offer said so ahead; otherwise her tool could bind her past her limit (D5, seat 47 B1, refused list 6 and 15). Her stop is still shown (`stopped`, onward). -->

Story: (1) Leila's grant G to her tool T, `limit` £210. (2) Harry H1 offers 10 sacks at £21, `deliver_by` Friday on Wanjiru's clock W. (3) T accepts. (4) Harry delivers 6; T accepts; Leila pays £126; Harry accepts. (5) Leila stops onward Wednesday. Expect stage `stopped` (onward, `to`); £84 still held on G's line. (6) W's cutoff through Friday. Expect the rest can no longer fall due; £84 back. World B: no `deliver_by`; Harry signs `paid` after (4). Expect £84 back at Harry's signal.

**R-H7. A will.** *core* for the reading; *her word* for each will (D9; CORE-SET 3d-16). Home: identity.md (3d-16); promises.md writes the condition and replaces Death.
> **`{ closed: <id> }`**: holds for a block where a key grant that leaves no voice of that id's list stands in its causal past. A transfer on this condition by that id is a will: while she can sign it holds nothing; an accept of it before the close is a request; she may end it until the close. At the close her wills take in the order of her line, after every other draw of hers, whatever her close saw, and a will whose thing is gone takes nothing. There is no "everything else" and no successor.

<!-- REMOVED Death's "A promise's right to be paid stays against what the promisor pledged ... an estate: 'owed by one who can no longer sign'" | guarded: her creditors | now: what she signed stands as signed (3d-15); the fold shows what is to come. -->
<!-- REMOVED Death's "the will in profiles/successor.md", "by the successor profile's own test", "Which comes first, a creditor's right or an heir's conditioned gift, the protocol never decides: the deal's referee reads" | guarded: heirs and creditors | now: her own wills on `closed` take in the order of her line; a will whose thing is gone takes nothing (D9). The last clause was judges' law. -->
<!-- REMOVED Owed's "An heir holds what is owed by the successor the dead person named" | guarded: an heir | now: a will may name a receiving place (R-P11), as her own transfer on `closed`. -->

Kept from Death: "A dead person signs nothing more, and nothing fills the silence. No heir's body or own property is bound. An heir who signs 'I take this debt' makes a new promise of his own." ("this debt" becomes "what is to come from her".)

Story: (1) Harry H1 (2027): mill X to Leila on `{ closed: Harry }`. (2) Leila accepts. Expect X Harry's; Leila's accept a request. (3) Harry H2 (2029): X to Sam; Sam accepts. Expect X Sam's. (4) Harry's list closes. Expect H1 takes nothing.

**R-H8. A promise not to do, and its stake.** *core* (03 R10; T3-5)
> **A promise not to do** names no `refs.what`; `state.what` says what its signer will not do and `terms.until` until when. It binds its signer's name. What stands behind it is her transfer `for` it, conditioned `{ ruled: <the promise>, by: <a judge both named>, awards: <the other side> }`. That transfer lands where the judge rules for the other side, whatever stop came before.

<!-- REMOVED Refrain (`terms.refrain`, "breached only by ... `defeats` of the deal's head", the refrain's `until` `required`, "a breach reported after the term still counts", the loyalty example's "the payer is never marked") | guarded: Leila's non-compete | now: R-H8: the stake is a real held thing, landing on the judge she named; her judge's ruling text says when it happened, and `ruled` has no deadline unless she wrote one (seat 07 S2, shown). -->
<!-- REMOVED stage `breached`, its row in the moves table, its place in the stage order | guarded: no one; a verdict repeated | now: the ruling is the fact (`ruled`), and the stake lands on it. -->
<!-- REMOVED the `breached`/`kept` signal convention and "A refrain with no bench is never settled and never breached" | guarded: the staker | now: R-H3 (her no frees) and R-H5 (a bench of `none` can never be shown). -->

Story: (1) Ben B1 promises Leila's café: no work for a rival café until 30 June. (2) Leila accepts. (3) Ben B2 transfers envelope E (£500) `for` B1, conditioned `{ ruled: B1, by: Jo, awards: Leila }`; Leila accepts. (4) Ben B3 stops B1 onward on day 2. (5) Jo J1, 10 July, rules: awards E to Leila. Expect E lands with Leila. World B: Jo never rules. Expect E `held`; Leila's decline of B2 frees it (R-H3).

**R-H9. `ruled`, and its end.** *core*: it reads signed fields only (the judge's head ruling's `awards`), and every node reads it (SILENT 3, settled in building)
> **`{ ruled: <deal>, by: <judge>, awards: <person> }`** holds for a block where the judge's head ruling on the deal, in that block's causal past, awards something to that person. Of her rulings on one deal the head is the one no other of hers in that past has in its causal past. A later ruling of hers that has seen it is a newer word in its place: an end of the earlier only for blocks that had not used it (The cut). With no time stated it has no other end; wrapped `within` a deadline on a clock, it ends there, and R-H5 frees what it held.

<!-- REMOVED "the ruling is backed by her, dated by the reader's clock when one is given" | guarded: no one; a reader's clock moved Ben's envelope | now: CORE-SET 3c-6 (no reader's clock); the head is read in the relying block's past. -->

Story: (1) As R-H8 to (3). (2) Jo J1 awards E to Leila. (3) Leila L5 hands E to Sam, J1 in L5's past. (4) Jo J2, having seen J1, awards nothing. Expect E Sam's (J1 used). World B: J2 before any block uses J1. Expect E `held`. World C: B2's condition `within` 31 August on Wanjiru's clock W; W's cutoff through 31 August with no ruling. Expect E freed, Ben's.

**R-H10. `elapsed`.** *convention*, a reading (03 R13; T3-3). Home: folds.md, Views.
> **elapsed**: once the reader's clock is past a promise's `terms.until` and the promise moves nothing (it names no `refs.what`, no `terms.lines` and no `terms.quantity`: a fact of its term, not of what came), the view says elapsed. It is a fact of its term, never that it was kept. It binds no one.

Story: (1) Mo, a visitor, accepts the café's door rule "no phones in the prep room until you leave" (`until` 18:00). Expect `promise_view` at 19:00: `elapsed`; `promise_stage`: `accepted`.

---

## 4. Answers and binding (`promises.md`, Who may bind; kept from 1.8 P10 to P12 with these changes)

1.8 P12's section stands as written there, with the deletions and changes below. Its *which*, *whose*, the offerer's yes, "An accept keeps to the offer", the counter rules, "A counter ends nothing that binds", `crossed`, "Binding only grows", "An offer that states no end has none" and "A tool's ask speaks for the tool" are kept word for word, bar "keeper" to "clock" and `terms.keepers` to `terms.clocks` (D15).

**R-B1. *When*.** *core* (3d-2; choices 79)
> **When**, if the offer carries `expires`: with a clock (`terms.clocks`), when `needed` lines received the accept before their cutoff through `expires` (a receipt with no such cutoff before it on its line came before the time). With none, an accept is in time only by its own `at`, before `expires`; one whose `at` is at or after it, or that states none, is not in time, and binds only by the offerer's own later block that has it in its past, or a relier's block that names it (blocks.md, Time; 00-shared, Relier). An accept the offerer declined, on an offer with `expires`, that binds by none of these is ended: it is no request. A receipt or a date of the offerer's side is his word, read against him alone.

<!-- REMOVED "and the offerer, who named no clock, bears that gap (blocks.md, Who bears the gap)" and "the requester bears the gap" | guarded: no one; a ruling word | now: 00-shared rule 2, "From where a stop counts", and 3d-2's sentence, which say the same with no ruling word. -->

Story: (1) Maria M1 offers flour F to Harry, `expires` the 12th, no clock. (2) Harry H1 accepts in June, no `at`. Expect `offered`, `requests [{ H1, open: [when] }]`, F `held`. (3) Maria M2 ends M1. Expect F freed.

**R-B2. One request is allocated once; an allocation is a draw.** *core*. Kept from 1.8 with one deletion.
> Every allocation the offerer signed binds her; one that does not take is shown `over_allocated` at once. A yes to a request that has an earlier yes to it in its causal past binds nothing; two that do not see each other are a pair (Rule B).

<!-- REMOVED "and is her broken word only when the taker is due and is neither served nor paid the bump she signed beforehand: a promise about a future good is kept or broken when due" (P12 bullet; invariant 11's tail) | guarded: no one; a verdict | now: `over_allocated` and `uncovered` are the facts; a bump she signed is her own promise. -->

Story: (1) Ben's open offer of 30 trays; his till allocates under his grant. (2) The 31st allocation. Expect `past`, binds Ben, `over_allocated`; if that taker paid and nothing moved, `uncovered.to` is his.

**R-B3. A decline ends a standing word for its signer.** *core*. Kept from 1.8 P10 and A1.
> A decline ends a standing word for its signer: no later yes of hers to it counts. It reaches nothing that already binds; a late answer is read by the cut, never by a later decline.

Story: (1) Maria declines Harry's offer H1. (2) Maria accepts H1 with her decline in its past. Expect `declined`.

---

## 5. Paying

**R-P1. Paid only by the payee's word, or by the very thing named.** *core* (04 R1; 3e-1). Home: folds.md; promises.md Settling points.
> A block `for` a deal counts toward one half of it in one of two ways only: a draw on the instance the half names, where it lands, at what landed; or the word of the side that half goes to, in that half's `unit`. Where she said nothing in that unit, the block counts nothing. No fold compares `of`.

<!-- REMOVED Settling's "A giver's transfer counts when it moves ownership ... of an instance of what the line moves (the thing, or one whose `refs.of` names it)" and its "to an open receiver, on the signature of whom the open offer speaks for" | guarded: Maria's voucher, against a look-alike | now: R-P1 (a look-alike counts nothing; Harry's self-made credit paid 5 on the core, seat 26). -->
<!-- REMOVED "**Paid with ink counts for nothing:** the price is paid by the owed thing or by money, never by a fresh promise" | guarded: the payee | now: R-P1: a fresh promise counts only as the payee says. -->

Story: (1) Maria M1 sells Harry 5 loaves at 5 `of` her issue I; Harry accepts. (2) Harry H2 transfers "5 credit" of his own making `for` M1. Expect `paid` 0. (3) Harry H3 draws 5 of a part of I he holds, to Maria `for` M1; Maria accepts. Expect `paid` 5.

**R-P2. One payment counted once.** *core* (04 R2; 3e-2)
> The words of one side about one block count once, at the most any of them says: her own words, and each word of a tool that speaks for her. A `received` that `answers` a transfer is a word about that transfer; one that answers none is a payment of its own. A word by a signer who does not speak for that side is that signer's reading. What came beyond is shown (`uncovered`).

<!-- REMOVED Settling's "Of several such answers by the payee, the latest in causal order counts; answers that do not see each other count as no `covers`" and 1.8 P13's "the one that says most" | guarded: the payer | now: R-P2. -->

Story: (1) Leila promises Mama KSh 20; Mama accepts. (2) Leila L2 transfers 20. (3) Mama's tablet accepts L2; Mama's phone M5 `received` 20, answering L2. Expect `paid` 20.

**R-P3. Multiply, never divide; the seller's `step`.** *convention* for the count; *her word* for `step` (04 R4, R7, R8; 3e-4, 3e-7). Home: promises.md, Terms, in place of "The total is the amount's `value` times ... never paid".
> Let P be what counts as paid toward a price, in its unit. A flat price A is paid when P is at least A. A price `{ amount: a, per: p }` at quantity q in `per`'s unit (under `band`, what was accepted inside it) is paid when P times p's value is at least a's value times q's value. A price on `lines` is paid when P is at least the exact sum of its lines' prices. No fold rounds, and no test divides. A `per` of zero, a quantity not in `per`'s unit, or a figure not yet fixed has no total, and such a price is never paid. Where a total is finer than anything payable, only the payee's word closes the gap: her `covers`, her signal, or the `step` her price names.
>
> - `step`: under a price, the least payable amount its signers take, an amount in the price's unit. The total is the least whole number of steps at or above the exact figure. With no `step`, the total is exact.

Story: (1) Mama M1, 3 mandazi for KSh 10, `step` 1 KES. (2) Leila takes 2 and pays 7; Mama accepts. Expect total 7, paid. World B: no `step`. Expect total `20/3`, not paid until Mama's `covers` or signal.

**R-P4. The heap: `terms.in_hand`.** *her word* in the term (D4; 3e-3). Home: folds.md; promises.md Terms lists `in_hand`.
> `in_hand: true` on an order is her word that the goods are in her hand: the order, where it is in a block's causal past, counts that block toward what moves to her, for no more than it states. An order that does not say so counts nothing toward what came. No order counts toward a price.

Story: (1) Leila E1 orders 2 kg tomatoes from Mama, `in_hand: true`. (2) Mama M3 transfers 2 kg `for` E1. Expect `moved` 2 kg. World B: Harry H1 orders 40 sacks, no term; Sam S2 sends 40; Harry H2 `received` 36. Expect `moved` 36.

**R-P5. A spot exchange.** *core* (kept from 1.8 T1, things.md; 3d-9)
> The buyer signs first: an order naming the instance and its price. The seller's transfer `for` it, `to_owner` her, is his yes and his delivery in one block; it lands where it is signed and the deal is done there where his `covers` (`required`) states the whole price. A missing `covers` is never read as credit, and the buyer's silence never turns his receipt into anything to come. On credit it is the same two blocks with `covers` `0`, and the price is to come.

<!-- REMOVED from T1 "Two blocks, each said by the one it costs" | guarded: no one; a forbidden word | now: "each said by its own signer". -->

Story: (1) Leila E1 orders loaf X from Mama at KSh 50. (2) Mama M2 transfers X to Leila `for` E1, `covers` 50. Expect `done` at M2; X Leila's. World B: `covers` 0. Expect `underway` (his delivery counted; the price did not), KSh 50 to come.

**R-P6. `waits_on`, the payee's signal, Due.** *core* for Due; *her word* for `waits_on` (kept from 1.8 P4; 00-shared Deals)
> - `waits_on`: `goods` (the price is due only once the receiver's `accepted` answer to the delivery stands) or `price` (what moves is due only once the payee's signal stands). Left out, nothing is filled in.
> - **The payee's signal** is a counted `observe` of kind `paid` that speaks for the payee, `refs.subject` the deal (`state.line` or `state.occurrence` where it is for one): her word that the price is paid.
> - **Due.** What a deal's terms say a side hands over is due where the block that performs it has in its causal past the binding accept, standing; the deal's condition, held; and what `waits_on` names, standing. A payment is of no more than the price's total, a delivery of no more than the quantity chosen. No node adds up payments to answer it. `pay_by` and `deliver_by` are latest times, never earliest. `missed` stays as the view's name.

Story: (1) Sam's offer, `waits_on: price`, £60; Amara accepts. (2) Sam's till T delivers with no signal in its past. Expect `not_due`. (3) Sam S5 signs `paid`; T delivers again with S5 in its past. Expect due, `underway`.

**R-P7. Work, counted by whom the job names.** *her word*, with the silent answer *core* (D13; 07 R20, R21). Home: promises.md, Settling.
> A `work` or `done` for a deal is its doer's word, in her own name. It counts toward what moves where the job's terms name whose word counts it (`terms.condition`, a `signal` of that kind `by` those named); where the job names no one, where the side the work goes to answers it `accepted`. On a deal priced per unit of work, a payment `for` it counts the work its doer stated in the payment's causal past, oldest first, at the price per unit. A job (no `refs.what`, no `lines`, its `state.what` what is done) shows one line, id null: `needed` the quantity chosen or null, `moved` the work that counted, in the unit of that quantity, else of the price per unit.

Story: (1) Amara's job J: £12 per hour, condition `{ signal: "work", by: [Ben], subject: J }`. (2) Ben accepts. (3) Ben B3 `work` 40 h `for` J. (4) Amara pays £480; Ben accepts. Expect `moved` 40 h, `paid` 480, `uncovered` null. World B: J names no one; (4) as before. Expect `moved` 40 h by her payment; Ben's stop after it leaves nothing uncovered.

**R-P8. Paid for, never delivered.** *core* (kept from 1.8 P14, renamed)
> Money that what moved does not pay for is still the payer's, at every stage, bound or not, unless the terms say it is kept (`forfeit`). The stage shows it as `uncovered` on each side: arithmetic over what each side sent `for` the deal. It says nothing of whose anything is; the ownership fold answers that.

<!-- REMOVED "When the deal is stopped onward, breached or over-allocated" | guarded: the payer, late | now: `uncovered` at every stage (1.8 P14, kept). -->
<!-- REMOVED "A promise nobody paid for that goes unkept is a broken word: shown, never a debt" | guarded: no one; a verdict | now: the stage and `to_come` show it. -->
<!-- REMOVED "So a lapsed option owes nothing back for that reason alone" and "The money is owed back when the promise paid for was broken (the seller refused when called) or never signed" | guarded: the option buyer | now: R-P8 (paid for and not moved is `uncovered`); whether it was kept is a judge's word. "A premium buys the promise itself" stays as an example. -->

Story: Amara pays £300 in full; nothing comes. Expect `underway`, `uncovered.to` £300 at once.

**R-P9. The lost deposit stays inside one deal.** *her word*, a term the payer signs (D14; 03 R9)
> `forfeit` is an amount of the price's kind: the part of what the payer paid that she signed over on her own stop. It stays with the payee where an onward stop that speaks for the paying side is among the first onward stops of the deal and none that speaks for the payee is. In every other ending it is the payer's still. A payer who never comes signs nothing, so money against a no-show is a bond (things.md, The caterer's bond).

Story: (1) The café C1: table Friday 19:30, £60, `forfeit` £20. (2) Leila accepts and pays £20; C accepts. (3) Leila stops onward. Expect `uncovered.to` 0; £20 the café's. World B: the café stops first. Expect `uncovered.to` £20, Leila's. World C: one stop each, neither in the other's past. Expect not kept.

**R-P10. A receiving place handed on; the note; "to come".** *core* (03 R11; T3-4; CORE-SET 3c-7). Home: promises.md, in place of Owed and Bearer's second half.
> (3c-7's three paragraphs, as written there: What a deal names a side to receive; Handing on a receiving place; A note.) Field names: `to_come`, `to_come_on`, `to_come_back`.

<!-- REMOVED Owed's "The debtor's own signature settled it, so it is owed, not claimed", Claims' "A right to be paid is not a claim ... it is owed" | guarded: no one; it said more than the record knows (seat 06) | now: R-P10's first paragraph. -->
<!-- REMOVED Owed's "A term `personal: true` says the claim cannot be handed on" and the term `personal` | guarded: Maria hiring Kofi by name | now: her own accept or decline of the work; a stand-in under a grant was never stopped by it (seat 07). -->
<!-- REMOVED "Passing a part": the `pass` kind, `answerable`, `owing`, `freed_by`, the old `passed` | guarded: Amara, who wanted Sam answerable until she agreed | now: Sam's grant to Harry plus her release; a sub-deal where Harry answers to Sam. -->
<!-- REMOVED Owed's "A hand-over is ... signed twice (blocks.md, Finality)" | guarded: the holder, against a thief's hand-over | now: `reach` on the key that signs it (identity.md): a hand-over moves something of hers. -->

Story: (1) Mama M1 promises Harry KSh 2,000; Harry accepts. (2) Harry H2 hands his place to Wanjiru; Wanjiru accepts. (3) Mama M2 pays Harry 2,000; Harry accepts. Expect `paid` 2,000; `to_come_on: [{ from: Harry, to: Wanjiru, amount: 2000 KES, payment: M2 }]`. World B: Harry H3 hands the same place to Sam. Expect H3 `past`.

**R-P11. Where to pay me.** Pointer only (3e-8). 1.8 P2's `state.by` paragraph is replaced by 3e-8's list `destinations: [{ destination, by }]`.

<!-- REMOVED 1.8 P2 "It may name `state.by`: a sorted list of ids ... (blocks.md, Finality ... `keepers` received it before any end)" | guarded: Sam, who names PayLink | now: 3e-8: a `received` by a `by` signer counts only naming her account word and its place. -->

---

## 6. Conditions (`promises.md`, Conditions)

**R-C1. Read in the past of the block that relies on it.** *core* (3c-6). 1.8 P8's first sentence becomes: "A condition holds or not on the blocks in the causal past of the block it is read for, and a time in it only on the clock its signers named. It holds, does not hold, or is **not read**." `By a time` loses "read at the deadline ... the reader's clock is past the deadline"; `without` holds where `needed` lines hold a cutoff through the deadline with no deciding block received before it (3d-5).

Story: (1) Joe J1 box X to Amara `without` his arrival by 07:00 20 Nov, `clocks` Wanjiru and Leila, `needed` 2. (2) Amara accepts. No cutoff. Expect X `held` at every reader, whatever its clock.

**R-C2. The shapes.** *convention*
> `settled` (that promise is done); `accepted` (that deal binds; a promise so conditioned binds on its own accept, and what it names is due only once that deal binds); `deed`; `paid`; `opened`; `signal`; `stopped` (`{ stopped: <first promise>, side: "from" | "to" }`: an onward stop that speaks for that side is among the deal's first onward stops, and none that speaks for the other side is); `closed` (R-H7); `ruled` (R-H9); `reading`; and `within`, `without`.

<!-- REMOVED from `settled` "or it is a refrain whose view is elapsed with its price, if any, paid in full" | guarded: no one; it read the reader's clock | now: refrain gone; `elapsed` binds no one. -->
<!-- REMOVED the refrain's "by its own condition when that is a signal that holds at its `until`" | guarded: no one | now: a condition is the gate of the word it is on. -->

Story: (1) Y is Wanjiru's promise conditioned `{ accepted: X }`. (2) Amara accepts Y. Expect Y `accepted`; nothing of Y due until X binds.

**R-C3. Named readings, read under the block's own rule set.** *convention* (D1; choices 107, reworded)
> `settled`, `paid` and `reading` are named readings. A block whose condition names one states, in `state.rule_set`, the rules that hold it; a reader that does not run them holds the block not read (`unknown_rules`). The core runs none: with no `state.rule_set` such a condition is not read (`condition_holds` answers null), never holds, and what it holds stays held. `ruled` reads signed fields only and every node reads it. The payee's signal, written `{ signal: "paid", by: [payee], subject: deal }`, needs no reading and is read on every node.

<!-- REMOVED "a deal is read under the rule set its first promise states" | guarded: no one; it made silent Leila an owner (seat 14) | now: a block is read under the rules it states (D1). -->
<!-- REMOVED `reading_not_run` as a second code | guarded: no one; one fact, two names | now: `unknown_rules` (00-shared, Rule sets). SILENT 4. -->

Story: (1) Sam's sack X to Amara on `{ paid: deal }`, stating rule set R. Expect, on a node that does not run R, X's transfer not read (`unknown_rules`); with no `state.rule_set` it is read by the core alone, which runs no named reading, so it is not read anywhere (SILENT 4). World B: written on Sam's signal; Sam signs `paid`. Expect X lands on every node.

**R-C4. A sum is a signal; what a condition moved stays moved.** *core*. Kept from 1.8 P9 word for word, bar "a sum owed by the one who received to the one who gave" becoming "a new fact, for a judge both named".

Story: (1) Leila the counter signs "pledged 520"; Maria's pledge, `ge 500`, is accepted with it in its past. (2) Leila signs "120". Expect Maria's pledge still bound; a `without` refund does not fire.

---

## 7. The bench, and judges

**R-J1. The bench.** *core* (kept from 1.8 P15, Disputes): the names that may lower a stage are the confirmers the schema's grounds name and a judge both sides named; `grounds.needed`; a name's own later word changes its own; the backup chain (`grounds.wait`, its turn by the earlier name's receipt or by a clock no side keeps, `grounds.clocks`); "A side alone never judges its own deal"; "A referee both sides signed for counts even when tied to a side".

Story: Bench Ade then Leila, `wait` 7 days, `grounds.clocks` the market office O. (1) Sam disputes Amara's accept; O receipts it 1 Nov. (2) O's cutoff 8 Nov, no word of Ade. (3) Leila `defeats` the delivery. Expect `accepted`. (4) Ade confirms in June. Expect nothing changes.

**R-J2. A judge named late.** *core* (seat 17 B2; T3-7)
> A judge named after a deal binds counts on its bench only where each side, and every holder of what either side has to come, named her or answered her `accepted`.

Story: (1) Sam sells Amara a sack on credit, £60; Amara accepts; Sam delivers; Amara accepts. (2) Sam hands his place to Leila for £55; Leila accepts. (3) Sam and Amara name Zed. (4) Zed `defeats` Amara's accept of the delivery. Expect Zed not on the bench; the stage as before (`underway`: the £60 was never paid); £60 to come to Leila. World B: Leila also answers Zed `accepted`. Expect stage `accepted`.

**R-J3. Who says a thing happened never rules.** *core*. Kept from 1.8 P15.

**R-J4. The law is not in the protocol.** *core* (seat 17; T3-7)
> No fold reads how a judge should rule, and the spec states none. A judge's offer may name a rulebook by hash; the sides who name her have named it. The spec names no rulebook. **Two doors, one record.** A dispute over a deal is settled between the sides only by a judge both named; an attack goes to the victim's judge. The record cannot tell them apart: a claim is her word, her judge's word is read by those who named that judge, and the judge answers for it if wrong; whoever acts on it answers for the act.

**R-J5. A claim, and its hand-over.** *core* (seat 17 §7)
> A claim is its signer's word that something is hers, or that she or what is hers was crossed: an `observe` naming in `refs.subject` what it is about, in `refs.to` whom she says did it or holds it, in `refs.derives_from` what she shows. No fold reads its truth. A hand-over of a claim is a transfer that names in `refs.what` any block that is not a `thing`; it moves something of hers, so it waits on its key's `reach`.

Story: (1) Maria M1 claims Ned sprayed her carrot bed. (2) A thief with her phone key (reach P1D, clock Wanjiru) hands M1 to Pia. Expect the hand-over waiting `on: reach`; Maria's card ends the phone inside the day: it counts for nothing.

**Judges' law, deleted** (promises.md, from "A soft term never stands alone", Paid for, Claims, Disputes, Who pays a confirmer, No term on this, More on rulings, The signer's word, A claim of invasion). Thirty sentences; none moves to a rulebook. Thirteen are derived (D) and go because a core sentence says them; seventeen are law (L) or wrong (W).

<!-- REMOVED (D) "Reliance is never a ground" | guarded: the signer, against unsigned reliance | now: no fold reads an unsigned word (question 2). -->
<!-- REMOVED (D) "A ruling never rests on silence alone. A side who never answers is read as nothing" | guarded: the silent side | now: nothing fills a silence (question 2). -->
<!-- REMOVED (D) "a missing deposit counts against a signer only as the term he signed says, and against a non-signer never" | guarded: the non-signer | now: a word binds only its signer. -->
<!-- REMOVED (D) "A default ruling over the papers' amount counts only up to the papers" | guarded: the staker | now: `ruling_releases` caps at the stake: the stake is all she put up. -->
<!-- REMOVED (D) "A ruling about a thing compares the two who named the judge ... never a registry entry" | guarded: third parties | now: R-J4, her word is read by those who named her. -->
<!-- REMOVED (D) "A witness owes nothing: a third party's silence counts against no one; a referee may ask but never require" | guarded: witnesses | now: nothing fills a silence. -->
<!-- REMOVED (D) "A refusal to sell, hire, rent or admit crosses nothing, and a claim of harm can never name one" | guarded: the one who refuses | now: a refusal acts on nothing of another's; anyone may sign any claim. -->
<!-- REMOVED (D) "His silence is never an accept, and no rule settles doubt for either side" | guarded: the accused | now: an accept is a signed answer. -->
<!-- REMOVED (D) "A circle brings no claim for members who never signed it" | guarded: members | now: Who a block speaks for. -->
<!-- REMOVED (D) "A payment settles that harm only. Leave to go on is a separate signed word" | guarded: the harmed | now: a word binds only as written. -->
<!-- REMOVED (D) "Separate invaders, separate claims. The fold never adds them up" | guarded: each accused | now: no fold sums across (3e-9). -->
<!-- REMOVED (D) "a creditor who holds title until he is paid compels no one" | guarded: the creditor | now: his own thing (question 2). -->
<!-- REMOVED (D) "Harm with no deal behind it ... the one harmed names her own judge" as its own paragraph | guarded: the victim, against the attacker's veto | now: R-J4, Two doors. -->
<!-- REMOVED (L) "A referee may rule a sum for the wait; no rate is built in" | guarded: no one's thing; judge's law | now: the judge's own offer. -->
<!-- REMOVED (L) "The referee gives only what the papers show" | guarded: no one's thing | now: the judge's offer, or a rulebook the sides named. -->
<!-- REMOVED (L, W) "No term on this" whole, and "A referee reads ordinary words and adds none" | guarded: the sides, against a judge filling a gap | now: whom the sides named, and her rulebook if any; its examples contradicted each other. -->
<!-- REMOVED (L) "A soft term never stands alone ... satisfaction is the requester's free veto" | guarded: the seller | now: a condition names a signature (rule 3); a bare soft word can never be shown (R-H5). -->
<!-- REMOVED (L, R) "A ruling's figure is 'harm found', never a price or a worth", and `up_to` on a `confirms` | guarded: no one's thing | now: the judge's own words; `up_to` leaves `invasion_shown`. -->
<!-- REMOVED (L) "Compelled means a physical attack ... 'palpable, immediate and direct' (Rothbard)", "A fear ... a boss's order ... a hard bargain ... are not force", "A payment made to get force used on someone else is never a compelled payment" | guarded: no one's thing; a judge's test, copied from an author | now: the `not_free` reasons stay as data; what counts as force is the judge's. -->
<!-- REMOVED (L, W) "Regret is not a reason ... a referee may weigh drink; the protocol does not" | guarded: no one | now: as above. -->
<!-- REMOVED (W) "Only a physical crossing ... is an invasion. Lost sales, a lower price or a true review cross nothing", and `crossed`, `standing` (with 3b-10), `commanded`, `accused` in `invasion_shown` | guarded: the victim, wrongly: a theft victim read `none` (seat 17 S1) | now: R-J5; the judge reads it. -->
<!-- REMOVED (L) "A claim against a business names the person who acted, and the owner only if a signed grant or order shows he ordered it", "Intent is not required", "The means ... never as the accused" | guarded: owners and lenders of tools | now: Who a block speaks for; the rest is the judge's. -->
<!-- REMOVED (L) "A border a stranger could see" | guarded: the accused, against hidden borders | now: the judge's reading; sealing never changes what was open in the world. -->
<!-- REMOVED (W) "Collecting past a ruling is itself claimable" | guarded: the accused | now: every act of force is its doer's own (R-J4). -->
<!-- REMOVED (W) "A ruling alone moves nothing and harms no one ... a judge answers only for what she herself signed" | guarded: judges | now: R-J4: "she answers for it if wrong" (the premise, kept: T3-7). -->
<!-- REMOVED (W) "Both sides signed the schema, so its word binds both" | guarded: no one; her word binds her | now: R-J1, each side hung counting on her. -->
<!-- REMOVED (W) "It becomes a settled fact only by the other side's signed word or a ruling" (Claims) | guarded: no one | now: R-J4: a ruling is read by those who named her. -->
<!-- REMOVED (L) Who pays a confirmer's "a false statement is a broken word" and "the loser repays the winner is ... never the judge's income" | guarded: no one's thing | now: the fields `paid_by`, `funded_by`, `pay_depends_on_result` stay, read the same everywhere. -->
<!-- REMOVED (L) 1.8 P16's "Three facts anyone can show that judge" and "A named signer's word should carry what lets a stranger redo it" | guarded: no one's thing; no fold read them | now: the judge's reading; a counter's recipe in its schema (pattern). -->
<!-- REMOVED (L) 1.8 P16's "or if she lied on purpose to help take someone's goods, which is taking part in a theft" | guarded: the victim | now: R-J4, the victim's judge. -->

Kept, as shapes: the `ruling` observe and its `awards`; `ruling_releases`; `ruling_audience` and its two public facts; `fee_back`; "A ruling and a remark"; "A ruling may name the rule it applied"; `notified`; the `not_free` observe, its three reasons as data, and "only the block's own signer writes one that counts as hers"; "What stands behind a named signer" cut to: "A condition names a signature, never a fact. Her block binds her name to its truth and nothing of hers. Her own promise, with `terms.backing`, is the only thing that adds to that."

---

## 8. Deleted shapes, in one place

| Deleted | Whose thing it guarded | What guards it now |
|---|---|---|
| `terms.refrain`, stage `breached`, the `breached`/`kept` signal names, sentence 5 | Leila's non-compete | R-H8, R-H9 |
| `terms.notice` | No fold read it | A stake on `{ stopped, side }` |
| `terms.personal` | Maria hiring Kofi by name | Her own accept or decline of the work |
| `pass`, `answerable`, `owing`, `freed_by`, `passed` | Amara, wanting Sam answerable | Sam's grant to Harry; her release; a sub-deal |
| "owed", `owed`, `owed_on`, `owed_back` (op and output), fee-back's `owed` | No one; one word, two meanings | `to_come`, `to_come_on`, `to_come_back` (D12) |
| "Firm", "broken word", `over_allocated` as a broken word | No one; verdicts | The fold's facts and `ruled` |
| The heir clause, `profiles/successor.md` pointers | Heirs | R-H7 (D9) |
| `reading_not_run`; the deal's first-promise rule-set route | No one | R-C3 (D1) |
| The reader's clock in `ruled`, `signal`, `settled` | No one | R-C1 (3c-6) |

Refused, and kept refused (00-shared §4, item 3): deleting `forfeit` or the hand-over.

---

## 9. Where it lands

- **promises.md:** opening (T1 to T4); Sides, Bearer (its second half to R-P10); Owed and Passing a part (deleted; R-P10); Where to pay me (3e-8); Terms (drop `refrain`, `notice`, `personal`, `keepers`; add `clocks`, `waits_on`, `step`, `in_hand`; R-P3, R-P6, R-P9); Refrain (R-H8); Conditions (R-C1 to R-C4, R-H7, R-H9); Answers (R-B3, R-H6); Who may bind (1.8 P12 with R-B1, R-B2); Settling (R-P1, R-P2, R-P7); Paid for (R-P8); Claims, Disputes, Who pays a confirmer, Rulings (§7); Death (R-H7); worked examples (below); invariants.
- **folds.md:** A promise's stage (1.8 §3.2, less `breached`); Views (R-H10). Holds and paying are the one set's.
- **things.md:** A spot exchange (R-P5).
- **Worked examples:** 1.8 P18's bins stand, and: every refrain example (sole right, road pact, door rules, an owner's refrain, what I see in your kitchen, an exclusive pouring right, a refrain with a priced exit) is restated as a promise not to do with a stake on `ruled` (R-H8); "Past due is not breached" keeps its first sentence; every "owed" becomes "to come" or "what the deal names her to receive"; "Wages owed only if" becomes "Wages due only if".
- **Invariants.** 11: "An allocation is a draw on its offer's quantity: one that does not take still binds the offerer and is shown `over_allocated` at once." 13: "only the bench changes the stage, and it moves no thing." 36: "a stake is released only by the ruling its condition names, in its own kind, capped at the stake." 40 to 42 as 1.8, 41 reading "by the word of the side it goes to, or a landed draw on the very thing named (R-P1)". Add 43: "A deal's stage falls only by the bench's word, and no stage moves a thing."

**Patterns** (1.8 §4, kept, with these changes): `refusals` becomes a promise not to do, its gate its own `terms.condition`, its stake on `ruled`; `vouches`' `until` and `pools`' `until` stay (a term, not a refrain); the loyalty schema moves to `vouches` as a promise not to do; `payment-proof` and `open-payment-rail` read 3e-8's `destinations` in place of `state.by`; `sealed-price`'s "nothing owed" becomes "nothing to come"; every `keepers` is `clocks`.

---

## 10. `protocol.json`

- **terms**: remove `refrain`, `notice`, `personal`, `keepers`; add `clocks`, `waits_on`, `step`, `in_hand`. `terms_about` loses its refrain, notice and personal sentences; gains `waits_on`, `step`, `in_hand` and "forfeit: kept only on the payer's own stop".
- **condition_shapes**: add `stopped`, `closed`. `condition_shapes_about`: `settled` "(that promise is done)"; `ruled` "(the judge's head ruling in the past of the block it is read for awards to that person; a later one of hers ends it for blocks that had not used it)".
- **kind_fields.observe**: remove `pass`; `paid` (`line`, `occurrence`) as 1.8.
- **folds.promise_stage.output**: remove `breached` from the stage order; rename `owed`, `owed_on` to `to_come`, `to_come_on`; remove `answerable`, `owing`, `passed`; keep 1.8's `crossed`, `per_accept`, `requests`, `waiting`, `bench`, `not_shown`, `lacks`.
- **views.promise_view.output**: `elapsed` for any promise that moves nothing past `until`; remove the refrain and `bench: none` clauses.
- **folds.invasion_shown**: remove `standing`, `crossed`, `commanded`, `accused`, `nothing`; `field_shape.up_to` removed.
- **refusals**: `reading_not_run` removed (`unknown_rules`).
- **Deleted, counted:** 4 terms, 1 kind, 1 stage, 3 outputs renamed, 5 `invasion_shown` fields, `up_to`, 1 code, 1 door op renamed.

---

## 11. What changes for each built engine operation

| Op | Change |
|---|---|
| `promise_stage` | No `breached`; outputs `to_come`, `to_come_on`; no `answerable`/`owing`/`passed`; R-P1, R-P2, R-P3 counts (one set); R-P7's work count; R-P9's `forfeit` by first stops; R-J2's late judge off the bench; 1.8's `crossed`, `per_accept`, `requests`, `waiting`, `bench`. |
| `promise_view`, `promise_views` | `elapsed` for any promise that moves nothing (R-H10); no refrain `settled`; `missed` kept. |
| `due` | Reads `waits_on` (R-P6) and the condition in the performing block's past (R-C1); R-P7's work signal. |
| `ownership`, `ownership_view`, `pot` | No clock argument; R-H1 to R-H5 (one set); R-H7 a will holds nothing and is read after every other draw of hers; R-H9 `ruled` head in the relying block's past. |
| `condition_holds` | No reader's clock; `at` the block it is read for; adds `stopped`, `closed`; `settled` without the refrain clause; `ruled` as R-H9. |
| `reading_condition_holds` | No reader's clock (R-C1). |
| `gives` | Draw on an offer's instance shown `held` (R-H1); `bench`. |
| `owed_back` | Renamed `to_come_back`; its output `to_come`. |
| `fee_back` | Output `owed` renamed `to_come`. |
| `ruling_releases` | No reader's clock; head ruling read in the stake's relying block's past (R-H9). |
| `clearing_applied` | Line output `owed` renamed `to_come`; "owner of what is owed" reads R-P10's holder of the receiving place. |
| `account_of` | 3e-8's list (one set); 1.8 P2's `by` not built. |
| `terms_total` | R-P3: `step`; `n/d` (one set). |
| `invasion_shown` | Loses `standing`, `crossed`, `commanded`, `accused`, `nothing`, `up_to` reading. |
| `not_free_shown`, `release_shown` | Unchanged. |
| `stands` | A hand-over of a claim (any non-`thing` in `refs.what`) waits on `reach` (R-J5), in place of the kind `invasion` test. |
| `repeat_occurrences`, `listing_check`, `check_reads` | Unchanged. |
| `bids_shown`, `earnest_shape_ok`, `earnest_paid` | Removed (as 1.8). |
| `add_duration` | Unchanged here (the one set's). |

---

## 12. SILENT

1. **The byte for "a stop ends what has not come"** (R-H6). Settled by stage 4 (owner decision 5): `terms.stoppable: true`, and a judge's ruling `state.ends_rest: true` (CORE-SET, byte names). R-H6 names them.
2. **Work's spelling** (R-P7). Part 07 R20 spells "who counts" as `terms.condition`, a `signal` `by` the named. That also gates Due of the whole price on the signal; no source chose a dedicated byte. Built so in both engines.
3. **Is `ruled` a named reading?** Settled in building: no. Its reading is signed fields only (the head ruling's `awards`), and R-H8, R-H9 need it read on every node. R-C3 lists `settled`, `paid`, `reading` only.
4. **`reading_not_run` against `unknown_rules`.** One code, `unknown_rules`, for a block that states a rule set the reader does not run; with none stated, the core runs no named reading and `condition_holds` answers null (not read).
5. **"`ruled` gets its end"**: the head ruling in the relying block's past, a later ruling an end only for blocks that had not used it, and `within` as its only time end. Built so in both engines.
6. **The `draw` field on `gives`** (SILENT 26 of the set; part 09 R3). Not written, and built by neither; not in this stage.
7. **A stake on a promise whose own `terms.condition` has not held** (refusals pattern): the stake's landing reads only its own condition. Built so in the core; no world asks it of both engines yet.
8. **Whether a ruling of "a judge both named" in R-H6 must say "the rest ends"**: settled by stage 4 (`state.ends_rest`).
9. **The firm offer to a receiver who never answers** holds until she speaks (00-shared Open; 03 §10). Not changed.

---

## What building changed (stage 5, 2026-11-19)

The two builders' guesses were laid side by side: the core's 21 rows (`stage5-rust-silent.md`) and the oracle's 33 (`stage5-oracle-silent.md`), joined where they asked the same thing, and the splits found when each engine was asked the other's stories. Every story of this stage is now asked of both engines: the oracle's (`spec/oracle/stage5/export.cjs` writes `sdk/rust/tests/fixtures/stage5.json`, 117 questions; `tests/stage5.rs` asks the core) and the core's (`FB_RECORD=<dir> cargo test --test stage5` writes each question it asks; `node spec/oracle/stage5/rust-stories.cjs <dir>` asks the oracle), and the random-world test (`tools/fuzz/corpus/s05-deals.cjs`). Where they split, the text was fixed first, by the centre (only a signed word binds, and only its signer; nothing fills anyone's silence; from when it stands, a later word takes back nothing already built on), then both engines. Each answer below is written in the entry it names (and in `00-shared.md` where it is a shared meaning).

| Question | Choice | Sentence changed (where) |
|---|---|---|
| T4's stage after a ruling (both builders) | `underway`: the bench's defeat of her accept of the delivery takes the delivery out of the count; her payment still counts | T4 story |
| R-J2 world A (both builders) | the stage stays what it was, `underway` (a credit sale never paid is not `done`) | R-J2 story |
| R-P5 world B (core `underway`, oracle `accepted`) | `underway`: the seller's transfer that binds the deal is his delivery too; where it lands it counts. No special case for the binding block | R-P5 story |
| R-H1 against 3c-1 (a yes to an order) | 3c-1 kept: a yes to an order holds nothing; the hold starts at the seller's own word naming the instance. His yes names the order, the buyer's word, never his thing | R-H1; the §3 pointer |
| Her close and a sale whose buyer's yes it did not see (core: freed, even after it landed) | the close is an end by its giver, read as any end: it frees a draw where the receiver saw the close before any yes, an offer no yes answers at once, never a draw that landed. Settled by question 5 (what stands stays; no fold moves it back) | 3d-15 (CORE-SET); 00-shared, A close |
| Where a will is read (core: at the close's place; oracle: after every other draw of hers) | after every other draw of hers, whatever the close saw: a close that never saw a sale takes nothing back from it | R-H7 |
| A will in life (oracle: listed as a held draw) | no draw at all; shown in `named_by`; read at her first close unless her stop of it is in that close's past | R-H7 (as written) |
| `ruled` (text: named reading; both engines read it) | no named reading: signed fields only, every node | R-H9 mark; R-C3; 00-shared, Named readings; SILENT 3 |
| `condition_holds` on `settled`, `paid`, `reading` (oracle ran them) | null, not read: the core runs no named reading | R-C3; 00-shared, Named readings |
| `condition_holds`'s third argument (oracle ignored it) | the block it is read for (a block or an id held), read on its strict causal past; null for every block held; a time is an argument error. `reading_condition_holds` the same, its window ending at that block's own `at` | §11 (as written) |
| `{ stopped, side }` (core: any onward stop of that side) | 1.8's meaning: a stop of that side is among the deal's first onward stops and none of the other's (two that cross hold for neither, as `forfeit`) | R-C2; protocol.json `condition_shapes_about` |
| A clock receipt with no cutoff yet (oracle: `when` stays open; core: in time) | in time: a receipt with no cutoff of the time before it on its line came before the time (the core set's reading; every later cutoff is after it). `within`, `without` read the same | R-B1; 00-shared, Cutoff |
| `when` closed by a relier (oracle built, core not) | the offerer's own later block with the accept in its past, or a relier's block that names it (not a decline or stop of it); in the stage and in the hold alike | R-B1; 00-shared, Request |
| `requests` (core `{ accept, open }`; oracle listed ended accepts) | `{ block, open }` (1.8 F3); an ended answer (her earlier decline, the offerer's decline on an offer with `expires`, a stop before it saw) is no request | R-B1; 00-shared, Request; protocol.json |
| Accepts that cross (core: "neither binds" unless same terms) | 1.8 P12 kept: each binds, `crossed`, `per_accept`, the stage the furthest; the core's old rule deleted; `forks` the blocks of a pair in the deal | §4 (as written); protocol.json |
| `waiting`, `bench` on the stage and `bench` on `gives` (oracle built) | built in the core as the oracle has them | §10, §11 (as written) |
| An accept that waits (`whose`; core bound it) | a request: it binds nothing | §4 (as written) |
| `held` on `gives` lines (core built) | built in the oracle; a promise of an amount with no `what` gives its quantity, held false (S3-20) | T1 story; CORE-SET byte names |
| The Rule A clock path (built by neither) | built: where the draw names a clock (`terms.clocks`, a transfer's `state.clocks`), an end with no yes in its past frees it once `names` less `needed`, plus one, lines hold the end with no yes before it | R-H3 world B (new) |
| The backup's turn (core: dated push answers) | 1.8 P15 kept: by place on the grounds' clocks or the earlier name's own line, never a date | 00-shared, Bench |
| A delivery whose accepted answers the bench defeats (core counted it, by landing) | counts for nothing, though it landed | 00-shared, Bench |
| What "moves nothing" is, for `elapsed` (oracle: nothing has moved yet; core: the terms name nothing) | a fact of its term: no `refs.what`, no `lines`, no `quantity`. An unpaid sale past its `until` is not `elapsed` | R-H10 |
| A bare sensor `reading` beside a view (oracle `not`, core `unread`) | `unread`: a named reading the core does not run | R-C3 (as written) |
| A job's hours (core: no line) | one line, id null, `moved` the work counted | R-P7 |
| Due and a delivery (core compared it with the price) | a delivery against the quantity chosen, a payment against the price | R-P6; 00-shared, Due |
| A named till's `received` that answers a payment (core: not counted; oracle: still `unanswered`) | counts toward her price, and the payment is answered | 00-shared, Her word |
| A spot transfer without `covers` (core read it) | `required` in `read`, both engines (R-P5 as written) | R-P5 (as written) |
| A promise with no `what` whose quantity is a range (core: `required`, "names what moves") | a range of amounts names what moves, as an amount does (both engines) | none (a check, not a sentence) |
| A side under a grant (G1; oracle: `parties` only) | admitted by `parties`, by a promise of hers in `on` that names it, or by a deal a block under the grant made; with no `parties`, a side an `on` promise leaves open admits anyone | 00-shared, A side admitted |
| R-H6's bytes (SILENT 1, 8) | stage 4's `terms.stoppable`, `state.ends_rest` | R-H6 |
| Asking a draft what a writer would refuse (FoodOS, the MCP door: `valid` judges no value since 3a) | a door op `write_refusals(draft, held)`: every code `write` refuses the unsigned draft with (3a-3: a writer signs only what its own read reads), both engines; the JS SDK's `writeRefusals` | protocol.json `door.ops.write_refusals` |
| A host's witness of her STOP by text (consent.md said it binds every asker) | a witness is the witness's own word and binds only its signer; her STOP reaches further only through her own grant's ending term ("ends when host X witnesses a STOP from my number"). Both engines already read it so (the host's STOP under her grant binds no other asker); the byte for that ending term is not chosen | consent.md, Her own word; authority.md, A witness; 04-grants read-back line 15 and Mama's first yes |
| A header's `key` (FoodOS's sealed-message check refused it) | the text and the core agree: a header carries `key` where the block has `refs.key` (00-shared, Header; protocol.json `header_optional`); FoodOS's own check is the one to change | none |
| `bids_shown`, `earnest_shape_ok`, `earnest_paid`; `field_shape.notice`; `ownership_view`'s clock | deleted from both engines and `protocol.json` (§8, §11) | §11 (as written) |

Outside this step: the vectors are not regenerated. `node spec/oracle/run.cjs` passes 984 of the 1022 it passed before stage 5; the 38 lost are each a deleted op (`bids_shown` 4, `earnest_*` 2), a renamed output (`fee_back`'s `owed` → `to_come`, 8), deleted `invasion_shown` fields (9), or `gives`' new `bench` (15); none is a fault. `optional_profiles.earnest` and `payment-proof` stay in `protocol.json` (§11 removes only the ops); `spec/schemas/published.json` still publishes the deleted `pass` schema; `sdk/door.table` is stale (the JS door was edited by hand, as stage 4 did).
