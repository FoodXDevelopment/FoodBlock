# FoodBlock 1.9, stage 4: grants

What a person's AI or machine (a **tool**) may do for her. Built from `changes-1.8/04-grants.md` by deleting, keeping and changing; its edit ids (A1 to A21, P1 to P9, V1 to V9, S1 to S4) are kept so a builder can lay the two side by side. Uses the words of `00-shared.md` with its meanings and defines none of them again. Written as if the one set (`CORE-SET.md`) has landed. Line numbers are `spec/modules/authority.md` and `promises.md` as 1.8 cites them; stages 0 to 3 and the one set do not touch `authority.md`.

Marks: *core* (follows from the premise), *her word* (a value she signs once), *convention* (bytes and shapes), *product* (FoodX's own promise or default; never protocol). Sources: **D1** to **D15**, **E1** to **E3** (`CHANGES-1.8.md`); plan part 05 rules **R1** to **R12**; plan part 10 **T2-1** to **T2-13** (taken as a set); stress **seat NN**.

<!-- REMOVED 1.8 §1 item 4, the gap with no clock (1.8 wording) | guarded: the relier, against a stop he could not see | now: rule 2, From where a stop counts (her word says which). -->
<!-- REMOVED 1.8 §1 item 6, a tool performing for a binding deal, as a separate frame | guarded: Amara, against a tool paying early | now: G1 (one rule) and G11 (Due), unchanged in meaning. -->

---

## 1. What this stage does

1. **One rule for a tool's yes (G1).** A block under her grant speaks for her only where it is for a deal her grant names, it keeps to her promise (one value inside a range or list she wrote, at a closed list of places), and it fits on one line. Nothing else a tool signs binds her.
2. **At most her figure (G7).** Whatever happens to the tool's key, her grant binds her to no more than her measures. A fork or a false receipt binds only the name of whoever signed it.
3. **Her own side's word (G3).** A figure binds a range's owner only by her own side's word. Two ranges meet in their overlap (D6).
4. **One line, one fill (G4, G6, G9).** The limit is counted along one line; a child grant on its parent's meter; each occurrence of a repeating promise is filled once.
5. **What is hers to receive (G10).** A tool says "paid" or "received" only for deals its grant names.
6. **Her tools pass to each other (G13); a runner says so by a link (G14); the deadline is read on the meter's line (G15); her stop is read on her clocks (G16).**

Hidden limits, `scope.condition`, `scope.notice`, the operator grant and "signed twice" are not in 1.9.

---

## 2. Spec edits, file by file, with the rules

### 2.1 `spec/modules/authority.md`

**A1. Line 5** (To a role). As 1.8, without its last clause.
<!-- REMOVED A1's "so a holder cannot hand her role to an actor she operates" | guarded: the café, against a manager's own AI | now: a grant to a role is not passed on (A15, G9); and rule 5 with the two-key link (G14). -->

**A2. Line 7, `state.scope`.** Replace whole with:

> - `state.scope`: `{ types, parties, on, limit, every, each, until, clocks, deadline, fallback }`, data, never prose. `types` lists block types or `type.kind` names, matched exactly; a name that is neither names nothing. `parties` lists the ids its blocks may deal with. A block's sides are the ids in `refs.from`, `to`, `to_owner`, `to_holder` and, for an answer, the sides of the block answered. `on` lists promises she signed: her first promises (an offer, a want: her terms) and her binding accepts. `limit` and `each` are amounts; `every` a duration, stated only with `limit` and `until` (`shape`, `required`); `until` a time, an end (blocks.md, The cut); `clocks` the clock her ends of this grant are read on (blocks.md, A named clock); `deadline` and `fallback` as Her deadline says. *convention*
> - **What she did not write, the grant does not allow.** A missing `types` or `on` names no binding block. A missing `limit` and `each` lets no block under it draw above zero. A missing `until` is no wider grant: it lasts until an end reaches it. A missing `clocks` names no clock (blocks.md, From where a stop counts). The protocol fills in none of them. *core*
> - **Every reader reads every field.** A limit the other side cannot read is no word shown to him. A product keeps her node's own lines in a field its own schema declares, which no fold reads. *core*

<!-- REMOVED `limit_commitment` (the sealed limit) | guarded: Amara's privacy of her figure | now: nothing hides her figure; a hidden limit touches nobody (00-shared 1.3), and her signed bound with a hidden limit is £0 (seat 19 B3). -->
<!-- REMOVED `scope.notice`, `scope.condition` | guarded: her fence on her tool | now: a condition is a term of her promise in `on` (P6); a fence only her node checks is her product's field. -->
<!-- REMOVED `terms.deadline`, `terms.fallback` in her promise (1.8 P1) | guarded: her time of choosing | now: `scope.deadline`, `scope.fallback` in her grant (00-shared, Grants). -->

**A3. Line 8, `refs.under`.** As 1.8: whether it binds the grantor is Who a block speaks for; `under_ok` answers it, and every fold applies it.

**A4. After line 9**, two bullets:

> - `refs.meter`: one id, the start of the line every block under the grant is counted on (00-shared, `refs.meter`). A grant with `on` or `refs.what` names one (`required`). *convention*
> - `refs.what` on a grant: one instance the grantor owns. The grant is a draw on it at `scope.limit`, or on all she owns of it when it states none, and passes that part to the grant's line (Toll work). *core*

**A5. Line 10, `scope.until`.** "It is an end (blocks.md, The cut; Whose date tests `until`). For a member grant it is read like a cut at that time (circles.md)."
<!-- REMOVED "and has no operator by it (identity.md)" | guarded: Harry, who saw one runner behind two tools | now: the two-key link (G14), DECIDED 1 of 2026-11-11. -->

**A6. Line 11.** "A grant stands as every word stands (blocks.md, Finality): a grant that lets a key act or spend for her, or more than before, waits her voice's `wait` (identity.md). A member grant counts, besides, once the receiver's own `answers` accepts (circles.md)." The rest as 1.8.
<!-- REMOVED "stands only when signed twice" and "and an operator grant" | guarded: Mama, against a planted key; Harry (operator) | now: `wait` above zero, her own choice in her list (00-shared, rule 3 comment); the link (G14). -->

**A7. Line 13, Silence grants nothing.** "A grant exists only by her own signed word; a key-less person's yes reaches it only as a witness (A witness). Until then a tool of hers may gather offers, and its own promises speak for it alone (promises.md, A tool's own promise)." *core*

**A8. Line 19, Who a block speaks for.** Replace whole with the one rule:

> **G1. A tool's word.** A block that names a grant in `refs.under` speaks for the grant's giver only where (1) it is for a promise in the grant's `scope.on`, or for a deal that a block under the same grant made; (2) where it is a promise, it keeps to that promise (Keeps to); where it is a transfer or a word about what is hers to receive, it is of that deal (Blocks that bind); (3) it fits on the grant's line (A limit is counted along one line); and (4) it stands (blocks.md, Finality; until it does, `waiting`, listed with what it waits on). Its type is in `scope.types`, each side is admitted (`parties`, `on`), and the grant is made for its signer (`refs.to` its signer, open, or a role the signer holds by a named member grant). A block that fails any of these speaks only for its signer. Speaking for her means the fold counts it for the principal at the top of the grant's chain (`refs.parent` up to the first grant not passed on). What binds her is her grant and her promise, never the holder's block. *core* (R1)

<!-- REMOVED 1.8 A8's "It must also be one of the blocks Blocks that bind lists" as a separate gate | guarded: Amara, against a tool's free block | now: clause (2) of G1; Blocks that bind says only what "of that deal" means per type. -->

**A9. After line 20, No one is both sides of a word.** As 00-shared rule 5, with: "A block that gives to its own signer, to a key linked to the signer by a two-key link (identity.md, A two-key link), or to a circle in which she holds a role or a part, speaks for no one else by a circle's row or under a grant, unless the promise the grant names in `scope.on` names her as that side, or the circle's `take` row holds without her hand." *core* (R11; 10 R2)
<!-- REMOVED "to an actor she operates" | guarded: Harry, against one runner on both sides | now: "a key linked to the signer by a two-key link" (G14). -->

**A10. Line 23**, A delegation carries its moment. As 1.8.

**A11. Line 30**, Backed by a person, third bullet. As 1.8. After line 32: "Where a line the answer reads is not read whole, `backed` answers `{ not_shown: true, lacks }`. Where the block or a grant in its chain is waiting, `backed` is false and `waiting` lists it. Where a pair on the grant's line is held, `backed` answers as A fork on a tool's line says."

**A12. Lines 34 and 36.** Delete both. In their place:

> **When an end reaches a block under a grant** is blocks.md's: The cut, Seen, Relier, From where a stop counts. `scope.clocks` is the clock her grant names for it. An end this reader holds and does not read is no end and no proof of none: a block whose answer turns on it answers `{ not_shown: true, lacks }`.

**A13. Ending, lines 42 to 49.** Line 44's last sentence: "A key is ended as identity.md, Ending a key, says." Line 45: "What a stop ends, and for which blocks, is blocks.md, The cut." Lines 47 and 49: delete. Line 48 stays (stage 5).
<!-- REMOVED "An operator's stop also cuts every key grant signed under it" | guarded: the operator's principal | now: no operator grant; her own voice above a key cuts it (question 5, `counted_to`, E1). -->
<!-- REMOVED line 47 "A stop is how an offline peer learns of an end" | guarded: nobody's thing; a description | now: The cut. -->
<!-- REMOVED line 49 "A delayed power" | guarded: nobody (no reader left after stage 1) | now: `wait`. -->

**A14. The cut, line 53.** "One rule: blocks.md, The cut." The heading stays for `circles.md`'s pointer.

**A15. Scope subset.** Replace the body with:

> **G9. A child grant.** A child's scope is no wider than its parent's on every field, else `wider_than_parent`. A child is never open and never to a role (`shape`). It names its parent's `deadline` and `fallback` unchanged. It is counted on its parent's meter where the parent names one that is not the parent holder's own line; where the parent's meter is its holder's own line, the child is a draw on that line for its whole `limit`, which never comes back to the parent's holder. A child that does not fit its parent's line is no grant for the blocks under it (`not_live`). *core* (R7 d; seat 22 sentence 4)
>
> | Field | Child must be |
> |---|---|
> | `types`, `parties`, `on` | a subset |
> | `limit` | stated only where the parent states one; a draw on the parent's line |
> | `every` | none, where the parent states `limit` |
> | `each` | stated only where the parent states one; no larger, of the same kind |
> | `until` | no later |
> | `clocks`, `deadline`, `fallback` | the parent's, exactly |
> | `refs.what` | the parent's, or none |
> | `refs.meter` | the parent's, where it is not the parent holder's own line |
> | `depth` | smaller by at least one |

<!-- REMOVED A19 "A child names its own `refs.meter`" | guarded: a child holder counting offline | now: it does so only where the parent's meter was its holder's own line; elsewhere a second meter let a child spend past its parent (security 04 F3). -->

**A16. Whose date tests `until`.** As 1.8, with `scope.clocks` for `scope.keepers`.

**A17, A19. "The limit is the principal's fence, and it is sealed" (lines 114 to 124).** Delete whole. In its place:

> ## A limit is counted along one line
>
> **G6. The line.** Every block under a grant is counted on one line, named by `refs.meter` (00-shared, `refs.meter`). A draw fits when, with the draws before it on that line that take and are not freed, it comes to no more than her measure. A word whose total cannot be worked out, in the limit's kind, is above every bound. Where the meter is the holder's own key, a block of another key of the holder takes nothing (`not_on_line`). *core* (R7 a)
>
> **What it counts.** The grant's `scope.limit`, a measure she states (its owner the grantor, her start the grant); and each part the grant passed to its line (Her quantity is the measure; Toll work). Each is read as folds.md, What is left, says. With `every`, only the draws on `scope.limit` of its own period are added; a part is never renewed (a promise that repeats is filled once for each occurrence, G4). A period turns at a cutoff on the meter's line whose `refs.subject` is the grant and whose `when` is a span no shorter than `every` (00-shared, A period). *core*
>
> **A draw.** A block that binds her under a grant that states `limit` or `each` states `state.draws: { grant, amount }`, in its body only, in the limit's kind: the quantity it binds, where the limit is of the quantity's kind or she sells; else the deal's total at that quantity, with the `terms.backing` she gives (a price fixed later at its `max`; a `forfeit` is paid in place of what it forfeits, never added). A block that binds her to more than it states, or whose total is of another kind or cannot be worked out, takes nothing (`unit`). A payment draws what it pays; a make draws its inputs (those of the limit's kind on the limit) and states nothing. Only a block that passes G1's other clauses is counted. *convention*
>
> **G8. Counted once.** A word that makes due, pays or says paid what a draw on the same line already counted comes to nothing more. *core* (R7 c; seat 22 sentence 5)
>
> **A meter she names.** `refs.meter` may name a block of a key that is not the holder's: her own node's, a clock's, a circle's till. A block under such a grant fits when a receipt of it by that key is held that states `state.drawn: [{ of, amount, total }]`, one item for the grant's `limit` and one for each part it draws on, and no end of the grant is before it on that line. Draws are read in the order the line receipts them. One receipt is enough (00-shared, A line's bounds): one who does not hold that line whole from the receipt back to the meter reads the running total from it; one who does reads the sum of the amounts, and a receipt whose total is not that sum binds its signer's name (G7). A block that draws and has no receipt held waits (`waiting`, `on: meter`). A pair on the meter's own line answers, for each draw it receipts at or after the pair, as A fork on a tool's line says. A meter named and not held: `{ not_shown: true, lacks }`. *convention*; *her word* (which meter)
>
> **G7. At most her measures.** Her grant binds her, across every line and receipt it is counted on, to no more than her measures. A pair on a line, or a receipt whose total is not the total before it plus its `amount`, binds the name of its signer, never her past her measures. What stands stays keeps a block under a grant only within the measures the grant set; past them, the relier holds only its signer's word. *core* (R7 b, R9; Rule B)
>
> **A fork on a tool's line.** A reader who holds one branch reads it whole and answers from it. A reader who holds the pair answers `{ pair: true, held: [...], at_most }` for the blocks after it, `at_most` the worst case's (G18, per kind), and says no more. What came to her under a block after the pair lands on no accept; it ends as 00-shared rule 4 says. *core*; the answer's shape *convention* (R8)
>
> A limit is a figure, as 1.8.
>
> Ground: you cannot give what you never consented to give; a signer's two words bind his own name, and her consent reaches only what she wrote (Rothbard, *The Ethics of Liberty*, ch. 19).

<!-- REMOVED A19 "A fork under a grant": each branch binds her where a relier used it unseen (up to £630) | guarded: the mills, delivering on a branch they could not know was one of three | now: G7 and A fork on a tool's line: Harry's flour lands on no accept and stays his; he holds the forker's word; he may ask for a meter he trusts. -->
<!-- REMOVED A19 Fitting "a draw that reads `pair` is not under the grant, whole" | guarded: Amara, against a thief | now: G7 (at most her measures, never less than one branch), which also stops her forking her own tool to escape. -->
<!-- REMOVED A19 "The receipt is the meter's word, and binds the giver who named her" and its "proven" wording for a false total | guarded: the mills, relying on one receipt | now: a false receipt binds its signer's name (G7); one receipt still shows the mill what he relies on. -->
<!-- REMOVED A19 "A limit across counterparties" (three shapes) | guarded: nobody's thing; a guide | now: G6, A meter she names; the shapes are product. -->
<!-- REMOVED A19 "A renewing limit ends" as its own paragraph | guarded: Amara's figure | now: A2 (`every` requires `until`). -->
<!-- REMOVED A19 "No one holder" paragraph | guarded: Amara, against unbounded holders | now: 00-shared `refs.meter` ("A grant to a role, or an open grant, binds only through a meter she names"). -->

**A18, A20. "Blocks that can be undone" (lines 126 to 138).** Delete whole. In its place:

> ## Blocks that bind
>
> What G1's "of that deal" means, by type. Every other block under a grant (a note, a decline, a stop) speaks for its signer alone.
>
> - **A promise** (an accept, an allocation, an offer, a counter) keeps to a promise in `on` (Keeps to). An accept gives, for her, what her own accept at that quantity gives.
> - **A make**, under a grant that names an instance (Toll work).
> - **A word about what is hers to receive** (an `accepted` answer that it came, `received`, `covers`, the payee's signal): of a deal in `on`, or one a block under the same grant made, at no more than that deal names her side to receive. It counts once with her own words (00-shared, Once). *core* (R1; seat 21)
> - **A payment or a delivery**: a `transfer` `for` such a deal, to its other side, of what that deal names her side to hand over, no more, and only where it is due (00-shared, Due). Anything else it moves binds her to nothing (`not_due`). Where her grant does not name `transfer`, it pays and delivers nothing. A till's spot sale is an allocation and a delivery in one block. *core*; *her word* (whether her grant names `transfer`)
>
> **Keeps to.** A promise C keeps to a promise A when C's `state` and `refs` are A's key for key, bar a closed list of eight:
> 1. what every block has of its own (`refs.author`, `prev`, `after`, `key`, `state.seq`, `at`, `nonce`, `skip`);
> 2. `state.audience`, where C is public or sealed to the grantor and the holder;
> 3. C's links: `refs.answers`, `refs.for` (naming A or a promise that keeps to A) and `refs.under`;
> 4. a side A leaves open, which C names; where the grant states `parties`, one of them;
> 5. `refs.what`, where A names kinds: each id in C is an instance of one of them, and each kind A names has an instance in C;
> 6. one value inside a range or a list A states, at `terms.price`, `terms.quantity`, `terms.pay_by`, `terms.deliver_by`, or a line's `price` or `quantity` (lines matched by `id`);
> 7. a price, where A states none, she pays it, and the other side signs C;
> 8. C's own `expires`, and `state.occurrence` where A carries `repeat`.
>
> C is always fully stated: one value at each term, both sides named. A term A does not carry, C does not carry. A seller never writes a date into her silence (D3). *core*; the list *convention* (R2; seat 18 §6)
>
> **A range and a list.** A range is `{ min, max }`, one end or both, of one kind (the same `unit` and `of`; for a price per unit, the same `per`, byte for byte); `min` less than `max`. A list is `{ one_of: [...] }`, two or more values, sorted. Either sits only at the places item 6 names; anywhere else it is `shape`. A member of either is a value. A value is inside when it is of the same kind and its number is from `min` to `max`, both counted, or equals a listed number, compared as decimals. At `pay_by` and `deliver_by` an end may be a duration; it is compared only with a duration, by the span each adds to one fixed instant (2000-01-01T00:00:00Z), never added to a date (00-shared, Time). *convention* (R3)
>
> **G3. Who states the figure.** A figure inside a range binds the range's owner only by her own side's word: her tool's block states it, or her tool's yes answers the block that states it. A block binds both owners only where it keeps to each one's promise, so two ranges meet in their overlap. The signer of the block that states the figure chose it, inside both owners' words. An answer names only the quantity it chooses. *core* (D6; R4)
>
> **G4. One fill for each occurrence.** A promise with `repeat` is filled at most once for each occurrence. A block that fills an occurrence already filled keeps to nothing. *core* (R5)
>
> She may always accept anything herself (promises.md, Taking a block as yours afterwards).

<!-- REMOVED Keeps-to item 6's "or a range, inside it" (C may carry a range) | guarded: nobody's thing; it let a tool stay vague past `parties` and left the limit nothing to count (seat 18 B1) | now: "C is always fully stated". -->
<!-- REMOVED Keeps-to item 5 "one of the kinds" | guarded: nobody's; it bound Amara to flour alone on "flour and sugar" (seat 18 B4) | now: item 5, each kind has an instance. -->
<!-- REMOVED the ninth item "terms.pay_by, where A states none, she pays, and C speaks for the other side" | guarded: Amara, for ease | now: her want carries a pay-by range she wrote, item 6 (D3). -->
<!-- REMOVED "and nobody chose it" (b2-04 §3.4) | guarded: nobody; it breaks "only persons act" | now: G3's "the signer of the block that states the figure chose it". -->
<!-- REMOVED 1.8 ways 1 to 6 as a numbered list with "the payee's signal ... the tool does that sum for her" | guarded: Harry's till, against signing paid short | now: the payee's signal is her word (00-shared, Her word about what is hers to receive); one word counts at the most it says (Once). -->
<!-- REMOVED "for a deal that already binds her" (1.8 way 4, 5) | guarded: Maria, for ease: one bookkeeper for every debt | now: G1: her bookkeeper's grant lists its deals in `on`; a "paid" on any other deal reached her whole book (seat 21 B1). -->
<!-- REMOVED the hand-back paragraph's "It lands on the accept of one key of hers ... two of her keys accepting it apart start nothing" | guarded: Leila, from her own devices racing | now: 00-shared, A part passed: it comes back to the line that passed it, needing no accept. -->

> **Her quantity is the measure.** As 1.8, with "freed" read as 00-shared Freed. A grant that names A in `on` is a draw on A's quantity from her line, all of it (it states no smaller part); a second grant naming A takes only what the first left, so nothing while the first stands unstopped in its causal past; two that do not see each other: neither takes. An accept under a grant whose draw on A took nothing keeps to nothing (`not_kept`). *core*
>
> **G13. A pass between her own tools.** A block of a tool of hers, under a grant whose `types` names `transfer`, that gives a part its line holds to another tool of hers (the holder of a live grant of hers), passes that part; it starts on that tool's line at its accept, where that tool's blocks that speak for her draw on it. It gives nothing away (00-shared rule 5): her fold shows the draw going to that tool, and her still owning the part. *her word* (R6)
>
> **Coming back.** What the grant's line holds of hers and has not drawn comes back to the line that passed it, by the holder's own transfer `to_owner` her at any time, or where the grant has ended (00-shared, A part passed). It needs no accept, no type in `types`, no room under `limit` and no meter's receipt: a meter counts only what is drawn. Where `refs.meter` names a line that is not the holder's, what that line has not drawn comes back once the meter has receipted the grant's end. In the thing's own fold a coming back is its signer's word: it moves nothing of hers. The meter answers it in `comes_back` (per measure). *core* (seat 22 sentence 8)
>
> **G15. Her deadline, and the lowest offer at it.** `scope.deadline` is a time; `scope.fallback` is `lowest` (a closed list of one), stated only with `deadline`. Both are read on the line `refs.meter` names; `scope.clocks` may name more than one line. Before and after the deadline are places on that line: a cutoff through it (`refs.subject` the grant, `state.when` the deadline's text) and the receipts before and after it, or, on the holder's own line, the holder's own cutoff there. A date orders nothing here but the block's own, against its own signer: without `fallback`, an accept whose own `at` is at or after the deadline (or states none and the line does not show it before) is after it. With `fallback`, no accept under the grant counts before the deadline (one the line shows before it: `not_live`; one it shows neither before nor after: `waiting`, `on: meter`); after it, only her tool's accept of the lowest total at her quantity counts, among the offers that keep to her promise and whose sides the grant admits, received on the meter's line before its cutoff through the deadline and standing there (no cutoff through its own `expires` at or before that cutoff on that line, and no stop of it there). An offer whose total at her quantity cannot be worked out, in the limit's kind, is no candidate. Of two equal, the first that line received. Any other accept after the deadline is `after_deadline`. With `deadline` and no `fallback`, her tool picks before the deadline, and nothing under the grant accepts after it. Her tool cannot move the deadline. Her own accept is hers at any time. *her word* (the values); *convention* (which line; R12, T2-12)
>
> **Toll work.** As 1.8, with "a deal that binds her" read as G1's "a deal in `on`". Its outputs are hers; a tool's make that binds her is her start for each output. A grant that names an instance in `refs.what` is listed in the thing's fold as a draw on it, `held` and never landing; its tool's makes and transfers under it draw for her on the grant's line (her own), whether or not they fit; while it holds a part, no one owner is shown.
>
> **G18. The worst case.** From her grant and the promises it names alone, plain code writes, per kind and never added across kinds: **`at_most`**, the most a block under it can bind her to hand over; and **`can_lose`**, the most of hers it can give up with nothing of its like coming back: every part the grant's line holds, and where `types` names `observe.paid` or `observe.received`, what is still to come to her on each deal in `on`, less what is already counted as a part. For each instance the grant names in `refs.what`, its part and each promise in `on` she sells from that instance (one whose `refs.what` names it) count once, at the largest of them; every other promise counts as before (stage 7's compare: what she can be bound to hand over of one measure is counted once). Where the meter is the holder's own key, a copied key may show one line to each reader; past `at_most` they hold only the copier's word. *convention* (seat 21 §6; 10 R6)
>
> Ground: a signed word binds only its signer, and only as written. Consent to an agent reaches what she named and no further (Rothbard, ch. 19; Kinsella).

<!-- REMOVED `worst_case.fork` and the per-line "£630" | guarded: Amara, warned | now: G7 makes `at_most` hold in all; the copied-key line warns the seller instead. -->
<!-- REMOVED `worst_case.it_came` (a bare "says paid" flag) | guarded: Maria, warned | now: `can_lose` names what a "paid" could give up. -->

**A21. Invariants.** 6, 9, 10 as 1.8. 23 becomes: "A block under a grant speaks for its giver only where it is for a deal her grant names, keeps to her promise, fits on the grant's line, and stands." Add 39: "What a grant can bind its giver to is read from typed fields she signed. Across every line and receipt, it is at most her measures."

### 2.2 `spec/modules/promises.md`

- **P1.** Deleted (deadline and fallback are scope fields, A2). **P2.** As 1.8.
- **P3.** None.
- **P4.** As 1.8, "authority.md, Blocks that bind" for "way 1".
- **P5.** "**A tool's own promise.** A promise a tool signs under a grant that keeps to no promise the grant names speaks for its signer alone. An offer may answer it and binds its offerer; an accept of the tool's promise binds no one (`quote_only`). Her own accept of that offer binds her."
- **P6, P7, P8, P9.** As 1.8 ("A tool's own promise" for "A tool's ask").

### 2.3 `spec/modules/folds.md`

- **What is left, A part passed**, the list of words that pass a part, adds: "or a block of a tool of hers under a grant whose `types` names `transfer` (authority.md, A pass between her own tools)."
- Invariant 31 and line 137: as 1.8.

### 2.4 `spec/modules/identity.md`: a voice's bounds (1.8 §11, shortened)

**V1 to V5** become one paragraph, after Reach (its last two sentences settled in building):

> **A voice's bounds.** A `key` voice may state `each`, `limit` and, with `limit`, `every`: one line with the same bounds as a grant's (00-shared, A line's bounds; authority.md, A limit is counted along one line). A word of that key that a reach would hold is counted on that key's line from the block that brought the key in. A word that does not fit stands only when a voice above that key has said it (blocks.md, Finality); until then it is waiting (`confirm`). A key grant that adds a key under a capped voice may pass that key a part of the voice's `limit`, by its own `state.limit`, and an `each` no higher (`state.each`); it is a draw on the voice's line at that part. The words counted are those that move an amount of hers: a transfer at its `state.amount`, and such a key grant at its part. With `every`, the period turns at a cutoff on a line of her list's clocks whose `refs.subject` is the block that brought the key in and whose `when` is a span no shorter than `every`. A word a voice above said instead holds nothing on the lower key's line. *her word*

<!-- REMOVED 1.8 V5's own "What a word comes to", "Fits", "A key under the voice", "Read by anyone" | guarded: Maria, against a thief with her unlocked phone | now: the same rules, read once in authority.md for every line (00-shared, A line's bounds). -->
<!-- REMOVED V6, V7 "signed twice" wording | guarded: Mama, against a planted key | now: `wait`, and a voice above (00-shared, Standing). -->

### 2.5 `authority.md`, A stop of one thing (1.8 §12, kept)

**S1** as 1.8, with three swaps: "read on that grant's own clock (`scope.clocks`)"; "a stop narrows, so it takes `names` less `needed`, plus one, of its clock's lines (blocks.md, Which reading needs `needed`)"; "A lift gives her tools their power back, so it waits her voice's `wait`." **S2, S3, S4** as 1.8. *her word*
<!-- REMOVED "one clock's line is enough (One to narrow)" | guarded: Amara's stop | now: Which reading needs `needed` (D17 of 2026-11-11). -->

### 2.6 The stop of a grant (G16)

No new text. It is read from: The cut and From where a stop counts (her `scope.clocks` say which); Freed (what a deal bound under her grant holds above what came comes back where the rest can no longer fall due: the payee's `paid`, the offer's stop term `terms.stoppable: true` with her stop, a cutoff through the offer's `deliver_by` on the clocks it names, or a ruling of a judge both sides named with `state.ends_rest: true`; her stop alone frees none of it, D5); Coming back (above). *core*; *her word* (her clocks; the offer's stop term)

---

## 3. `protocol.json` edits

As 1.8 §3, with these changes:
- `scope`: `["types", "parties", "on", "limit", "every", "each", "until", "clocks", "deadline", "fallback"]`. `terms` adds nothing (1.8's `deadline`, `fallback` there are dropped).
- `fallbacks: ["lowest"]`, about: "scope.fallback: read on the line refs.meter names."
- A `set_places`: `["terms.price", "terms.quantity", "terms.pay_by", "terms.deliver_by", "lines.price", "lines.quantity"]`. A `shapes.range: ["min", "max"]`, `shapes.list: ["one_of"]`.
- `narrower_than`: `keepers` row becomes `clocks: "same"`; add `deadline: "same"`, `fallback: "same"`, `meter: "parent-unless-own"`; one order `inside-range-or-list`, read by Keeps to and child grants alike.
- `refusals.codes.block.shape` adds: "a range or a list outside set_places; a range of two kinds or with min not less than max; a list of fewer than two; an open child or a child to a role; fallback without deadline".
- `refusals.codes.block.wider_than_parent` adds "another meter, deadline or fallback".
- `refusals.codes.fold.not_kept` adds: "a word about what is hers to receive, a payment or a delivery for a deal not in on and not made under the grant; a fill of an occurrence already filled".
- `both_sides`: "a key linked to the signer by a two-key link" in place of "an actor she operates".
- `owed_back` is `to_come_back` (D12). Every `keepers` is `clocks` (D15).
- `terms` adds `stoppable`; `shapes.voice.key` and `key_hash` add `each`, `limit`, `every`; `key_fields` adds `limit`, `each` (the part a key grant passes a key under a voice); `refusals.codes.fold` adds `stopped_thing`; `door.ops` adds `why_not_under` (codes) and the meter's `comes_back`.

---

## 4. Door ops: what changes for each built engine operation

| Op | Change |
|---|---|
| `under_ok` | Runs `read` first (security 04 F10). G1 in place of six ways: true, false, or the fork answer. |
| `why_not_under` | `[{ code, detail }]` with what the code carries: `why` (not_kept, the path), `pair`, `lacks`, `waiting`. Adds `not_kept` for a "paid"/"received" outside `on` (today true, seat 21 `paid.out`) and a second fill. |
| `speaks_for` | A block under a grant that fails G1 speaks for its signer. |
| `backed`, `backed_all` | A fork on a grant's line: `backed` is `{ pair: true, held, at_most }`, where today every branch reads false (seat 20 `t1`); a line not read whole: `{ not_shown: true, lacks }`; a block that waits: `waiting` beside it. |
| `gives` | A tool's accept that speaks for her reads as her own accept at that quantity. |
| `scope_reading` | Output `{ types, parties, on, limit, each, every, until, clocks, deadline, fallback, junk }`; `sealed`, `condition`, `notice` leave. |
| `scope_refusals` (core; the oracle needs it) | The new table: open child and child to a role `shape`; another meter `wider_than_parent`. |
| `promise_stage` | A tool's word about what is hers to receive counts only for deals in `on` or made under its grant, once with hers. |
| `ownership` | A grant's draw on A and on `refs.what` is `held`, never `landed`; coming back needs no accept; a pass between tools starts on the receiving tool's line. |
| `stands`, `identity_state` | A voice's `each`, `limit`, `every` (`confirm`); a stop's lift waits her `wait`. |
| `to_come_back` (was `owed_back`) | Renamed (D12); a tool's payment that is `not_due` is listed. |
| `repeat_occurrences`, `add_duration` | Read by G4 and by duration ends at `pay_by`, `deliver_by`; both engines' adders must agree (seat 18 `dur.cjs`). |
| `operators_of` | Goes with the operator grant, in the same set as rule 5 reading the link. |
| `within_limit`, `limit_within_parent`, `limit_fence`, `limit_commitment`, `limit_opens` | Removed; `meter` answers from blocks. |
| `keeps_to` (added) | `{ keeps, why }`, `why` the first sorted path that differs and is not one of the eight. |
| `meter` (added) | `meter(grant, held, block?)`: `{ grant, fits, why, line, start, period, draws: [{ block, of, amount, takes, why }], left: [{ of, amount }], waiting, ended, comes_back: [{ of, amount }] }` or `not_shown`. |
| `worst_case` (added) | `{ holder, types, on: [{ promise, side, price, quantity }], what, part, sides (ids), each, limit, every, until, periods (the period itself: no span is added to a date), at_most, can_lose, clocks, deadline, fallback, stop: { names, lines }, meter, pays }`, each amount list per kind; no text. |
| `lowest_offer` (added) | `{ offer, received (the receipt), cutoff, why }`, read on the meter's line; `pending` with no cutoff, `none` with no candidate. |

---

## 5. Test worlds

Blocks numbered in the order signed; each names its signer. One world per rule; the answer is the text's.

**Base world W.** (1) Amara A0, genesis. (2) Wanjiru N0, a clock's genesis. (3) Amara A1, want W: kinds flour F, 10 sacks, price `{ max: £21 per sack }`, `pay_by` `{ min: P3D }`, `deliver_by` Friday 12:00. (4) Amara A2, grant G to her AI's key I: `types` `[promise, observe, transfer]`, `on: [A1]`, `parties: [Harry, Sam, Mill Lane]`, `limit` £210, `refs.meter` N0, `clocks: { names: [FoodX F0, N0], needed: 2 }`.

1. **G1, one rule.** W. Harry H1 offers 10 sacks F at £20.50, `pay_by` P4D. AI I1 accepts H1: `under_ok` true, `backed(Amara)` true. Ravi R1, same terms; I2 accepts R1: `not_live` (side not in `parties`). I3 accepts a counter of Harry that adds `state.where`: `not_kept`, `why` `state.where`.
2. **G1, bookkeeper (T2-6).** Maria M1 sells Sam 10 loaves (deal D1, accepted); Maria M2 sells Ben 4 loaves (deal D2). Maria M3 grant to bookkeeper K, `types [observe.paid]`, `on: [D1]`, `refs.meter` K's key grant. K1 signs `paid` on D1: speaks for Maria. K2 signs `paid` on D2: `not_kept`; D2's price is still to come to Maria.
3. **Keeps to, item 6 and "fully stated" (T2-4).** W. Harry's AI H2 offers price `{ min: £19, max: £21 }`: `not_kept`, `why` `terms.price`. H3 at £20, `pay_by` P1D: `not_kept` (P1D not inside `{ min: P3D }`). Amara's want for flour and sugar; Harry H4 offers flour alone: `not_kept` (item 5). A want with no `pay_by`; Harry's offer stating one: `not_kept`.
4. **G3, overlap (D6, T2-3).** Sam S1, want: sukuma, `{ max: 60 KES per bunch }`, grant to his agent SA. Mama M1, offer: 20 bunches, `{ min: 45 per bunch }`, grant to Soko GS `on: [M1]`. SA1 offers Mama 20 at 50: keeps to S1, binds Sam once accepted. Soko's yes Y1 answers SA1: keeps to M1, binds Mama. SA2 at 40: `past` on Sam's agent's line (SA1 holds his 20 bunches); Soko's yes `not_kept`; Mama's own yes binds her (her own word). Maria's till, floor £3 a loaf; Leila's counter at £2.50; the till's yes: `not_kept`.
5. **G4, one fill (T2-5).** Mama M2 want: 2 crates, `repeat` Mondays, `parties [Sam, Otieno]`, `{ max: 700 per crate }`, grant to Soko. Soko accepts Sam's offer for occurrence 2026-11-16: true. Soko accepts Otieno's for 2026-11-16: `not_kept`. For 2026-11-23: true.
6. **Her quantity.** W, plus Amara A3, a second grant naming A1. Its draw on A1: `past`; an accept under it: `not_kept`.
7. **G6, limit on one line.** W, meter the AI's own key grant. Five accepts of £210 offers in a row: first true, four `past`. An accept of a price fixed later with no `max`: takes nothing (`unit`). Weekly `every`, `until` set, her want for at most 70 sacks: two accepts of £210 in a week, true then `past`; a third after the AI's cutoff on its line (`when` P7D, `refs.subject` the grant): true. (`every` renews the limit only; her quantity never.)
8. **G7, a copied key (T2-2).** W with meter the AI's own line. A thief copies I; I4, I4', I4'' on one `prev`, accepting Harry, Sam, Mill Lane at £210 each. Harry holds I4 only: binds Amara £210. A reader holding all three: `{ pair: true, held: [I4, I4', I4''], at_most: £210 }`. Harry's delivery H5 under I4: lands on no accept; Harry's flour stays his. With meter N0: N receipts I4 total £210; I4' total £420: `past`. N signs a receipt of I4' stating total £210 (false): to one who holds N's line whole I4' stays `past`; to one who holds only that receipt it fits, on Wanjiru's word; Amara's `at_most` stays £210. N signs two receipts on one `prev`, of I4 and I4': each draw they receipt answers `{ pair: true, held: [R1, R1'], at_most: [£210] }`.
9. **G8, counted once.** W. I5 accepts Sam's £199 (draws £199). Sam delivers; I6 accepted answer that it came: draws nothing more. I7 pays £199 `for` the deal, after I6: fits, draws nothing more.
10. **G9, child grant.** W with `limit` £100 and `depth` 1. I passes child C1 to helper P, `refs.meter` P's own key grant: `wider_than_parent`. An open child: `shape`. Children £60, £60, £40 on N0 (N's receipts state the totals), then I's own £1: true, `past`, true, `past`.
11. **Blocks that bind, Due.** W, deal with `waits_on: goods`. I8 pays £199 Wednesday before Amara's accept of the flour: `not_due`; `to_come_back` lists it. With her accept in its past: true, draws nothing more. Under a grant without `transfer`: `not_live`.
12. **Toll work, coming back.** Leila L1 want: 40 loaves; L2 grant to home farm FM, `types [transform]`, `refs.what` her 20 kg flour, `limit` 20 kg, `on: [L1]`. FM signs 40 makes of 0.5 kg: each true, each loaf hers from its make. A 41st: `past`. FM transfers 30 loaves `to_owner` Leila: comes back with no accept. A stranger's make naming her flour: `not_owner`.
13. **G13, pass between tools (T2-8).** Leila L3 grant to robot RB, `types [transform, transfer]`, `refs.what` her 40 lettuces. L4 grant to her stall ST, `on` her open offer LO of the lettuces. RB1 gives 30 lettuces to ST; ST1 accepts: on ST's line, no tap of Leila's; Leila still owns the 40. ST accepts a customer's order of LO and ST2 delivers one lettuce for it: speaks for Leila, takes on ST's line. Under a robot grant without `transfer`: RB1 takes nothing (`not_live`).
14. **G14, the link (T2-7).** Wanjiru's host key WK and Harry's till key T sign a two-key link (both keys). Harry's grant to T `on` his open offer HO, side open. WK orders 10 sacks; T1 allocates to WK: `both_sides`. Without the link: true.
15. **G15, take the lowest (T2-12).** W with `deadline` Wednesday 12:00, `fallback` `lowest`. N receipts Harry £205 (N1), Sam £199 expiring Wednesday 18:00 (N2); N3 cutoff through Wednesday 12:00. FoodX receipts Harry's later. Mill Lane's £190 expiring Wednesday 10:00, receipted by N, with N's cutoff of its expiry before N3: not standing at the deadline. I9 accepts Harry on Tuesday: counts for nothing (`not_live`, once N receipts it before N3; `waiting` until then). After N3: I10 accepts Sam: true. I11 accepts Harry: `after_deadline`. `lowest_offer`: Sam, `cutoff` N3; before N3, `pending`.
16. **G16, the stop (T2-1, T2-9).** W. Amara A4 stops G at 10:40; F receipts it (F1). Thief's accept I12, received by F after F1: counts for nothing (one line of two shows the narrowing). N receipts A4 (N4): what G's line had not drawn comes back to Amara. Leila's pump: grant `limit` 100 l from Sam, deal accepted, 40 l came, Leila stops: the room held for the 60 l stays held until Sam's "done" (his `paid`), the offer's stop term (`terms.stoppable: true`, which her stop then meets), its `deliver_by` passing on a clock it names (a cutoff, `refs.subject` the offer), or a ruling of a judge both named (`state.ends_rest: true`): then 60 l comes back on the limit and on her quantity.
17. **A stop of one thing.** As 1.8 vectors 48 to 54, with `clocks` for `keepers`; a lift waits her `wait`: her phone's voice waits a day on her node's clock, so its lift waits (`wait`) and the next sale is still `stopped_thing`.
18. **A voice's bounds.** Maria's tap voice `each` £50, `limit` £200: a £12 tap stands; a £900 tap waits `confirm` until her face key says it; four £50 taps stand, a fifth waits; her tablet under the tap voice, passed £50 by its key grant's `limit`: a £20 payment fits, a £60 waits. A tap voice of `limit` £100 `every` P7D: two £50 taps stand, a third waits, a fourth after her node's cutoff (`when` P7D, `refs.subject` the list) stands.
19. **G18, worst case.** W: `at_most` £210 money, `can_lose` none, `meter` N0, `pays` true. Maria's till grant, `refs.what` 40 loaves, selling range floor £3: `can_lose` 40 loaves; floor £3. Its part (40 loaves) and its 40-loaf sell promise from that instance count once: `at_most` 40 loaves; with a 60-loaf promise from it instead: 60 loaves (stage 7's compare). With the AI's own key as meter: `meter: own`.

---

## 6. What a person sees (plan part 09, lines for grants; product)

| # | Line | From | Shown to | When |
|---|---|---|---|---|
| 10 | "You pay at most £210 in all" / "You may be paid as little as £88" | per side, per kind, both ends | each side, oriented to her | every deal with a range |
| 11 | "It can give away nothing of yours" / "...up to these 40 loaves" | `can_lose` | grantor | at a grant |
| 12 | "a copied key could show this to several sellers" | meter is holder's key | grantor | at a grant |
| 13 | "Your till may sell for as little as £3 a loaf. Every buyer can read this." | range floor, selling grant | seller | at a grant |
| 14 | "FoodX and your phone must both hear each deal. Phone off: deals wait." | the grant's clock lines, by name | grantor | at a grant |
| 15 | "Only FoodX hears your STOP; if it misses it, FoodX pays you back." | one clock, FoodX's promise; for a key-less person, the grant's own ending term: it ends when FoodX witnesses a STOP from her number (a witness binds only its signer; stage 5 compare) | grantor | at a grant with one line |
| 20 | "What it can move on your bank is your bank's limit, not this." | FoodX's own line | grantor | at a grant that pays |

Mama's first yes (158 chars, 1 SMS): "Soko may say yes to Sam or Otieno for you: 2 crates a Monday, max KSh 1,400, pay 3+ days later. This ends when Soko gets STOP from you; if it misses one, Soko pays you back. 47"

(Stage 5 compare: Soko's witness of her STOP is Soko's word and binds only Soko; the STOP ends her grant because her grant says so ahead, its own ending term naming Soko's witness of a STOP from her number. The byte, chosen 2026-11-19: `scope.ends_on: { witness: Soko, said: "STOP" }`, What building changed, below.)

Until both engines compute stage 4, the grant's read-back says "The most you can be made to pay: can't tell yet."

FoodX's draft (product, 10 R3 to R5): two clocks, both needed, FoodX's and one she picks that is not FoodX's, the second also the meter; with none picked, one clock and line 15; two of three is never the default.

---

## 7. SILENT: where the sources were silent or disagreed

1. **Keeps-to item 6.** `00-shared.md` names "a quantity, a price or a pay-by inside a range". T2-4 and R3 add `deliver_by`, a line's price and quantity, lists, and "each kind has an instance". Written per T2-4 (SILENT 25 left it to this stage). Settled (owner's ruling, 2026-11-19): the shared ground's Keeps to is widened to this stage's.
2. **Which line `fallback` reads.** `00-shared.md` says one clock, read on that clock's line; T2-12 says the meter's line, with clocks free to name two. Written per T2-12. Settled (owner's ruling, 2026-11-19): the meter's line; `00-shared.md` says so.
3. **`fallback` with the holder's own line as meter.** Who signs the cutoff there is not said. Settled in building: the holder's own cutoff on that line; no date makes an accept count (G15).
4. **`deadline`, `fallback` moved from promise terms to scope.** Written per `00-shared.md`; no plan sentence gives the move.
5. **Where a tool's outputs and a passed-between-tools part come back.** "The line that passed it" names no line for a make's output or for a part passed twice. Settled in building for one pass: a tool's outputs are hers from its make (Toll work); a part passed to another tool starts on that tool's line (G13). A part passed twice: not written.
6. **The judge that ends a fork.** Rule 4 says "a judge the receivers chose"; R8 says "every receiver named ahead". Pointed to rule 4; not reconciled.
7. **Is a two-key link transitive?** Amara's AI and Harry's till each linked to Wanjiru's host: whether they are one hand is not said. Built as not transitive: a link is read between its two ids alone, each naming the other (`same_as`) and the second naming the first in `refs.confirms`.
8. **The reason code for "paid" outside `on`.** R1's proof names `not_under`; written as `not_kept`, the 1.8 code for a block that keeps to nothing named.
9. **`in_hand` under a grant.** Her tool may write `terms.in_hand` only where her want carries it (Keeps to); plan 04 says "her tool writes it at the basin" without saying so.
10. **A voice's `meter`.** `00-shared.md` lists `meter` among a voice's bounds; no source says how a voice names one. Not written.
11. **`operators_of`.** No source says whether a reading op replaces it once the operator grant goes. Removed with no replacement; the operator readings are deleted from both engines (owner's ruling, 2026-11-19).
12. **Seat 21's "a grant naming `observe.paid` names `scope.on`".** Not written: G1 already makes such a word bind only for deals in `on`.

---

## What building changed (stage 4, 2026-11-19)

The two builders' guesses were laid side by side: 48 questions (the oracle's 4-1 to 4-11 and five unmarked, the core's 21 marks, and the splits the stories found, joined where they asked the same thing). 14 were built the same, 29 differently, and on 5 the text was silent or neither built them. The eleven built the same and not listed below stay as written: `state.occurrence` on a promise; a line's price and quantity as set places; the part a grant passes (its `limit` where of the instance's kind, else the pack); a seller's accept under a grant with no limit draws on her quantity alone; a meter that is the holder's own id or key grant is her own line; `under_ok` true, false or the fork answer; an accept of an order gives to the order's author; G1 reads only the narrowing of a stop on her clocks; a two-key link is not transitive; a block that binds her under a limit states `state.draws` (else `unit`); with no `limit` and no `each`, a block that would bind her to pay takes nothing (`past`). Every story of section 5 is now asked of both engines (`spec/oracle/stage4/export.cjs` writes `sdk/rust/tests/fixtures/stage4.json`, 127 questions; `tests/stage4.rs` asks the core) and of the random-world test (`tools/fuzz/corpus/s04-grants.cjs`). Each answer below is written in the entry it names (and in `00-shared.md` where it is a shared meaning), and both engines follow it.

| Question | Choice | Sentence added (where) |
|---|---|---|
| How `why` spells a path (oracle [4-1]; core: `terms.lines`) | `terms.x`, `state.x`, `refs.x`; a line `terms.lines.<id>` or `terms.lines.<id>.<field>` | 4 (`keeps_to`) |
| `state.draws`, `state.audience` in Keeps to (oracle [4-2], core [4-6b]) | same in both: a block's own | Keeps to item 1; 00-shared, Keeps to |
| `refs.for` in Keeps to (core [4-3b]: not compared) | it names A or a promise that keeps to A (item 3, as written) | 00-shared, Keeps to |
| C names both sides (core: two open sides kept) | `refs.from` and `refs.to` both named | 00-shared, Keeps to ("C names both sides") |
| A kind and its instances (core: the kind itself kept) | where A names held kinds, each id of C an instance of one, each kind with one; else the same ids | 00-shared, Keeps to |
| Two durations (core [4-3], oracle the same) | compared by the span each adds to 2000-01-01T00:00:00Z | 00-shared, Keeps to |
| A duration end at `pay_by`, `deliver_by` (oracle: added to the occurrence) | compared only with a duration, never added to a date (rule 9) | A range and a list |
| Two grants naming one promise apart (oracle [4-3], core [4-6]) | neither takes | Her quantity is the measure |
| Her quantity counted on the line (oracle: not counted) | counted: an accept of 10 sacks takes 10 of A's quantity | What it counts (story 4: SA2 is `past`) |
| `every` and a part (core [4-7b]; text silent) | only `scope.limit` renews; a part never (a repeating promise fills once per occurrence) | What it counts; 00-shared, A period (story 7 changed) |
| Which cutoff turns a period (oracle [4-4]: any span ≥ `every` of the meter's author; core [4-7]: `when` equal to `every`) | on the meter's line, `refs.subject` the grant, a span no shorter than `every` | What it counts; 00-shared, A period |
| A draw's kind (core: money, `unit` on the pump) | the limit's kind: the quantity where the limit is of its kind or she sells; else the total | A draw |
| `backing`, `forfeit` (oracle [4-5]; core silent) | backing she gives is added; a forfeit never; a price fixed later at its `max` | A draw |
| A make's draw (core [4-12]; oracle: makes not on the meter) | its inputs, those of the limit's kind on the limit; no `state.draws` | A draw |
| Which blocks the line counts (core: all under it) | only those that pass G1's other clauses | A draw |
| A draw on another key's line with no receipt (core [4-6d] `waiting`; oracle `not_on_line`) | `waiting`, `on: meter` | A meter she names |
| A receipt's total (oracle [4-10]; core ignored totals) | one who holds the meter's line whole reads the sum (a false total binds its signer); else the one receipt's total | A meter she names |
| A pair on another key's meter (built by neither) | each draw it receipts at or after the pair answers the fork | A meter she names |
| `at_most` in the fork answer (oracle: the limit less what was drawn) | the worst case's, per kind | A fork on a tool's line |
| `backed` of a fork (core [4-8]; oracle the whole answer) | the fork answer in `backed`, `why` null, `chain` the block and its grants; `not_shown` and `waiting` as A11 says (built in both) | 4 (`backed`) |
| The fallback's code before the deadline (oracle [4-6] `not_kept`, core [4-15] `not_live`) | shown before: `not_live`; shown neither: `waiting`, `on: meter` | G15 |
| The deadline on the holder's own line (core [4-15b]: by the block's `at`; owner's ruling) | by place: the holder's own cutoff on that line; a date only shows a block late against its own signer, without fallback | G15 |
| An offer standing at the deadline (both: its `expires` against the deadline by date) | no cutoff through its `expires` on the meter's line at or before the deadline's | G15 |
| `lowest_offer`'s `received` (oracle a list; core the receipt) | the receipt | 4 |
| `worst_case` shape (core [4-19b]; oracle `sides` objects) | `on: [{ promise, side, price, quantity }]`, `sides` ids | 4 |
| `periods` (oracle: a span added to a date; core [4-19]) | the period itself: no span is added to a date | 4 |
| `can_lose`, what is still to come (oracle: a flat price only) | the total at the top of the range and quantity | G18 (as written) |
| The meter's `ended` (core [4-16b]) and what comes back (oracle `comes_back` one amount) | `ended`, and `comes_back: [{ of, amount }]` per measure | Coming back; 4 |
| The pump's room (owner decision 5; oracle built the payee's `paid` only) | four ways: `paid`; `terms.stoppable` and her stop; a cutoff through `deliver_by` on the offer's clocks; a ruling `state.ends_rest` of a judge both named | 2.6; 00-shared, Freed |
| A grant passing an instance in the thing's fold (core: not built) | a draw, `held`, never landing; her tool's makes draw for her on the grant's line, fitting or not; no one owner while a part is passed | Toll work |
| A hand-back in the thing's fold | its signer's word: it moves nothing of hers | Coming back |
| A pass between her tools (core: given to the stall; oracle: the stall's sale not built) | nothing given; shown going to the tool; its sales for her draw on its line from its accept | G13 (story 13 changed) |
| A voice's words (oracle [4-11]; core: not built) | transfers at `amount` and a key grant's passed part; a word said by a voice above holds nothing | A voice's bounds |
| A voice's passed part and `every` (built by neither) | the key grant's own `limit`, `each`; `every` turns at her clocks' cutoffs of the block that brought the key in | A voice's bounds |
| A lift and her wait (built by neither) | a lift (`resumed`, `updates` her stop) waits her voice's `wait` | 2.5 (as written) |
| A status on an observe (core: none read) | `status_not_answer`, bar her stop of one thing | 2.5 (as written) |
| A child past its parent's line (oracle only) | no grant for the blocks under it (`not_live`) | G9 |
| `refs.as` in Keeps to (stage 6 compare: the core read it as the block's own; the oracle compared it) | the block's own, like `author`: who speaks is no term of the deal (a circle's want kept to by the other side; a tool buying for a circle) | Keeps to item 1; 00-shared, Keeps to |
| Her STOP by text ending her grant (stage 5 compare left the byte open; the owner's decision, 2026-11-19) | `scope.ends_on: { witness, said }`, her own term: the grant counts for nothing for every block that has in its causal past a counted `observe` of kind `witness` signed by that host, `state.said` exactly that text, `refs.for` the grant (and `state.handle` the grant's own, where it names one). Read in causal order, as her own stop is; a block that has not seen the witness still counts. The witness binds only the host. Not compared by `narrower_than`: it only ends sooner, and a child ends with its parent. Both engines; story `spec/oracle/stage4/` (ends_on) and `tests/stage4.rs` | line 15; Mama's first yes; 00-shared, `scope.ends_on`; protocol.json `scope`, `shapes.ends_on` |

Story 10 needs a parent `limit` of £100 for the answers it gives (W's £210 would let C2 and I's £1 fit); the text now says so. The operator readings are deleted from both engines (the core's switched-off `operators_in`, `Place::Operator`, the bench's `operator` tie; the oracle's `operatorsOf`, its plain identity fold and the consent route through operators); a sensor's `operator` grant (tasks.md) stays.

Outside the files this step may touch: the vectors are not regenerated, so `spec/vectors.json` still holds 1.8's answers for `operators_of`, the limit ops and the old `meter` and `worst_case` shapes (the oracle's run counts them failed). `sdk/javascript/src/door.cjs` exposes `keepsTo`, `meter`, `worstCase`, `lowestOffer` and drops the removed ops.

Checks at the end of this step: the oracle's stories of stage 4 and of both halves of the one set agree with the text; the core answers all 127 stage 4 questions, and the 240 of the one set, as the oracle does; the random-world test finds 52, all known, none new (the stage 4 worlds are in its corpus); the audit's parity differs only in `k1 story 11` (the successor profile, stage 5). The audit's "rule 7" (a spray under a grant with a limit and no `on`) asserts a 1.8 answer that G1 changes, and `sdk/javascript/test` still calls the removed limit ops and `operatorsOf`.
