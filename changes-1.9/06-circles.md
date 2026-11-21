# FoodBlock 1.9, stage 6: circles

Uses the words of `00-shared.md` with its meanings and defines none of them again. Built from `changes-1.8/06-circles.md` by deleting, keeping and changing. Sources, in the order they win: `CHANGES-1.8.md` "Decided 2026-11-16" and "Decided 2026-11-12 and 13" (cited **D1** to **D15**, **D-also**; 2026-11-11's numbered decisions as **2026-11-11 N**); `00-shared.md`; the plan's part 07 (`07 R1` to `R23`, `P1` to `P4`) and part 10 Tier 4 (T4-1, T4-2, taken as a set); stress seats 38, 39, 40 and 28 ("What survives"). Marks after each rule: *core*, *her word*, *convention*, *product* (FoodX's default; not protocol).

Where this text and `00-shared.md` differ (section 9), this text follows D-also and the plan, and asks the shared ground to change. It does not win by itself.

<!-- REMOVED 1.8's opening list of stage words and line numbers ("Written as if stages 0 to 5 have landed ...") | guarded: nobody's thing; a builder's map | now: 00-shared.md, which every stage reads. -->

---

## 1. What this stage does

1. **Parts are title.** A circle may state `pack`, its parts. The founder owns them first. They move like any amount, by a transfer the receiver accepts.
2. **Rows are consent.** A row has a grant's shape and a grant's bounds. A block `as` the circle holds where one row holds for it, or where every owner signs it together.
3. **A grant under a row is no wider than the row.** Anyone who owns no part acts only under such a grant.
4. **No one is both sides.** A move that gives to an owner holds only by a row met without her hand, or by every owner together.
5. **A circle's word names the circle's things only.**
6. **Silence is kept.** A circle may leave its owners unsaid. With no row for a version, only every owner together makes one.

<!-- REMOVED 1.8 item 2 "one table of rows: 'this move, of this, by so many holders of this role'" | guarded: the owners, against anyone signing for them | now: rows with a grant's scope (C10); no role carries power by its name (D-also). -->
<!-- REMOVED 1.8 item 4 "a sale, a leaving or a removal ends her unfinished hands" | guarded: the other owners, against a sold vote | now: C15, "A hand lasts while she holds what the row counts", which says the same without roles. -->
<!-- REMOVED 1.8's story "Amara's café" in section 1 (six staff in roles, Joe's AI, Leila's invoices) | guarded: nobody's thing; an example | now: the test world (section 2) and each rule's own story. -->

---

## 2. The test world

Every story below starts here. Ids are names; amounts in GBP unless said.

- **F**, the café's founding block, signed by **Amara**: `actor` kind `circle`, `pack` 100 part, `clocks: { names: [N] }` (N the café node), `refs.meter` **T** (the till's key grant), and one row:
  **r1** `{ parts: 1, scope: { types: [promise, transfer, transform, observe, thing, grant], each: £300 } }`.
  No row names `actor`.
- **P1**, Amara's transfer of 50 part (`refs.what` F) `to_owner` **Leila**; **P2**, Leila's `accepted` answer. Owners: Amara 50, Leila 50.
- **Harry** sells flour. **Ben** works shifts. **Joe** runs the floor. **Maria** and **Rex** buy parts in some stories.
- **L**, Lake Maize Co-op: founded by **Kofi**, `pack` 1000. Two hundred members; **Joseph** is one.
- **K**, Kibera Savers: twelve savers, **Mama Achieng** among them; **Wanjiru**'s phone shop is its clock.

---

## 3. The rules

Each rule is the exact sentence, its home, its mark, and a story with the answer the text gives. `circles.md` is rules C1 to C21 in this order, under the headings shown, with section 4's opening.

### Owners (`circles.md`)

**C0. What a circle is.** *core*
> A **circle** is people who own things together, and the rows by which some of them act for the owners: a business, a household, a savings group, a co-op. It is an `actor` of kind `circle`, written by its founder as an ordinary block; its id is that block's hash. **A circle never signs and holds no key.** Every block `as` it (`refs.as`) is signed by a person as her own word, and speaks for the circle's owners only where a row holds for it (Rows) or every owner signs it together (Every owner together). Ground: only persons act and only persons own (Mises, *Human Action*; Rothbard, *Man, Economy, and State*).

Story: Amara signs block B1 `as` F, a £120 order of milk. Answer: B1 is Amara's word. It speaks for the café's owners because r1 holds for it (C10). F itself never signs.

<!-- REMOVED "and the rules by which some of them speak for it" | guarded: nobody's thing; wording that made the circle the one spoken for | now: "act for the owners" (07 R2: a part is a share of the owners' things). -->

**C1. Parts.** *convention* for the shape; *core* for how they move (question 3).
> The founding block may state `state.pack`, the circle's parts, in whole parts: an amount whose `unit` is `part`, whose `value` is a whole number of at least 1, and which has no `of` (`shape`). Its founder owns all of them first, and the founding block is her start. Parts move as any amount moves, by their owner's transfer and the receiver's yes. A fraction of a part is another kind, so a draw of one takes nothing (`unit`). `pack` never changes.

Story: F; P1. Answer: Amara 50, 50 held (`held`). P2. Answer: Amara 50, Leila 50. Amara then signs a transfer of 2.5 part to Maria. Answer: takes nothing (`unit`).

<!-- REMOVED "`pack` is read only from the founding block" | guarded: every owner, against a version that shrinks the number shares are read against | now: "`pack` never changes" (C1). -->

**C2. Whose the circle's things are.** *core*
> What the record shows as the circle's belongs to the persons who own its parts, by the parts each owns. A part is a share of those things as the circle's rows shape them. The founder wrote the rows when every part was hers, and each later owner was handed no more than that.

Story: the café holds 1,000 sacks (a `thing` signed `as` F under r1). Leila's own key, not `as` F, signs a transfer of 10 sacks to her stall. Answer: takes nothing (`not_owner`): the sacks are the owners' together, and her word alone acts only on what is wholly hers (question 2).

<!-- REMOVED "Each took her parts by her own accept, under the rows she could read, so the rows are words she took on" | guarded: the owners, as the ground for rows binding a later owner | now: C2's last sentence, which grounds it in title (the founder handed no more than she had), not in a reading of the buyer's yes. -->

**C3. Owners unsaid.** *her word* (the founder's silence); *convention* for the answer.
> A circle that states no `pack` leaves its owners unsaid (`owners: { not_said: true }`). Its things are held together under its rows; no row of it counts parts (`shape`); the protocol names no shares and fills none in. It has no every-owner way (C6).

Story: the Wanjiku family founds W with no `pack` and a row `{ parts: 1, scope: ... }`. Answer: refused (`shape`). With `{ to: [Wanjiku, Otieno], needed: 1, scope: ... }` instead: valid; `circle_state` answers `owners: { not_said: true }`.

**C4. Unissued parts.** *convention*
> Parts of a circle that are among its own things are **unissued**. They are no one's share and count in no row. A transfer `as` the circle of its own parts is a move like any other: it holds by a row whose `scope.what` names the circle, or by every owner together.

Story: Kofi founds L, `pack` 1000, meter T. A row that names L cannot be on L's founding block (no block names its own id), so while he owns every part Kofi signs a version of L adding the row `{ parts: 1, scope: { types: [transfer], what: L } }`. Answer: holds (every owner together). He transfers 999 part `to_owner` L, and accepts it `as` L. Answer: holds (every owner together: the 999 his transfer holds are his until L's yes, and this yes is that very receiver's, C15); unissued 999; Kofi 1. Kofi then signs `as` L a transfer of 1 part to Joseph, under the version's row; Joseph accepts. Answer: holds; Joseph 1, unissued 998. The 998 count in no row.

<!-- REMOVED "moved only by an `issue` move" and the `issue` move itself | guarded: the owners, against the board moving the co-op's own parts by its ordinary row | now: C4's last sentence: only a row that names the circle in `scope.what` moves them (07 §3). -->
<!-- REMOVED "(landed to it by a transfer its `sign` row accepted), so that no person yet owns them" | guarded: nobody's thing; wording that said the circle holds | now: "among its own things ... no one's share" (b2-09 2.8 row 1). -->

**C5. A circle as owner.** *core* (kept from 1.8)
> Parts of a circle held by another circle are that circle's owners' and count by a block `as` it for which a row of its own holds. Circles that own each other are neither refused nor named by any reason: `circle_state`'s owners and `ways_in` show that their owners end in no person (`no_person`), and a stranger weighs that himself.

Story: Kofi, sole owner of A and of B, transfers all of A's parts to B and all of B's to A; each is accepted `as` the receiving circle. Answer: both take; `owners` shows `no_person: true` for each. Nothing is refused. (A's yes to B's parts is A's owner's word: B's, by Kofi's confirm signed `as` B, for which B's row holds on his parts of B. Those parts are held toward A by his own transfer, and A's yes is that transfer's own receiver saying yes, so they still count for it: C15.)

**C6. Every owner together.** *core* (question 2; 2026-11-11 4, with seat 39's unissued case; T4-2)
> What hands that together own every part persons own sign is theirs to do, whatever the rows say. "Every part persons own" is the `pack` where no part is unissued; otherwise the `pack` less the unissued parts that the circle's meter's receipt of the move states. A circle with unissued parts and no meter, or with no `pack`, has no such way.

Story 1: Amara signs `as` F a transfer of £2,000 to herself; Leila confirms it. Answer: holds. Their hands own 100 of 100. The rows do not matter: above r1's `each`, and giving to Amara, it still holds.
Story 2: Amara signed grant G `as` F to Joe (C14). Amara and Leila together sign a stop of G `as` F. Answer: holds; G ends. Harry's deal, signed `as` F before the stop and standing, still stands (question 5: what stands stays).
Story 3: in L (unissued 998), Kofi and Joseph sign a sale of the store. T's receipt of the sale states 998 unissued. Answer: holds (their 2 are every part persons own). With no meter named: no every-owner way; only a row holds it.

<!-- REMOVED "It ends no word of the circle that already stands" (b2-09 2.2; batch1/08 M1b) | guarded: Harry, meant to | now: question 5, "what stands stays", keeps his deal; read in the shared ground's words the sentence forbade all owners to stop the café's own grant (seat 39 B1), and title until paid (P1) keeps his sacks. -->
<!-- REMOVED "Such a move acts on the owners' own only" (b2-09) | guarded: nobody beyond C9 | now: C9, what a circle's word names. -->

**C7. Joining, leaving, a close.** *core*
> Only a transfer that someone accepts ends owning. A holder may always end her own place in a row's `to` or under a grant: it only narrows. A close ends her hands and moves no part: her parts pass only by her own transfers, such as a will (People, A will). A circle is sold by selling its parts. No block dissolves a circle: once its things are handed on, it holds nothing.

Story: Leila's will (a transfer of her 50 part to Kwame on the condition that her list closes), then her close; Kwame accepts. Answer: Kwame 50. Without a will: her 50 stay hers and move to no one; r1 (1 part) still holds for Amara's blocks; the every-owner way needs Leila's hand and is shut for good.

<!-- REMOVED "Joining ... moves no title. A member grant moves nothing ... parts from an owner or from the unissued, or the circle's promise" | guarded: the owners, against joining read as owning | now: C7's first sentence; member grants are gone (D-also). -->
<!-- REMOVED "(profiles/successor.md, Heirs)" | guarded: Leila's heirs | now: her own will (D9); the successor goes. -->

**C8. A buyer of parts, and blocks sealed before he bought.** *core* (the audience is fixed when written)
> An audience that names a circle names the owners of its parts in the circle fold of that block's causal past. A block sealed before a buyer's accept of his parts does not name him; it reaches him only as its holders hand it on (What stays public).

Story: block S, sealed to audience F, is signed; then Leila transfers her 50 to Rex, who accepts. Answer: S's audience is Amara and Leila; Rex is not in it, and he may not claim it: what was sealed before he owned was not his. It reaches him only as Amara or Leila hands it on.

<!-- REMOVED from privacy.md "A circle means its members ... a role its holders there" | guarded: members by role | now: C8, owners by parts; roles are gone (D-also). -->

### What a circle's word names (`circles.md`)

**C9. What it names.** *core* (07 R14)
> A block that speaks for a circle names what the record shows as the circle's, and nothing else of anyone's. An owner who wants more behind it signs her own promise (a vouch: patterns/vouches.md). A cap ("only what the circle holds when this falls due") is a term of the deal, read only against those who signed it.

Story: Amara signs `as` F under r1 an order of 10 sacks from Harry, £205, pay by Friday. Then Amara and Leila move every pound of the café to themselves (C6). Answer: Harry's deal stands and names only the café's things; nothing is held for him; nothing of Amara's own or Leila's own is named. If Harry's delivery said "mine until you say paid" (P1), the owners' draw on his sacks takes nothing (`not_owner`).

<!-- REMOVED "and nothing else of any owner or member: no other thing of hers, no wage, never a body" | guarded: owners and workers | now: C9 says what the word names; the premise already says no word reaches a body; a ruling is no word (07 §3). -->
<!-- REMOVED "The other side read `as` on the block before relying; one who wants a named thing behind the promise takes a share on it" | guarded: Harry | now: C9's vouch sentence; what he reads is product (P1, his read-back). -->
<!-- REMOVED "Money owed to a circle is paid as its account word says ... paid to any other hand, it is paid to her alone" | guarded: the owners' takings | now: C9a. Protocol text never says "owed". -->

**C9a. A circle's account word.** *her word* (07 R17; seat 28 B1)
> An account word signed `as` a circle counts for the circle where a row whose `scope.types` names `observe.account` holds for it, or by every owner together.

Story: Amara signs `as` F an account word, destinations `[{ destination: "PayLink 55", by: PayLink }]`. r1 names `observe`, so it holds. Answer: PayLink's `received` blocks place the café's takings at PayLink 55. Joe, under G (types `promise`, `transfer`), signs one `as` F. Answer: no row holds; it acts on nothing (C18).

**C9b. The listing.** A reading (may land after the lock). (07 R15)
> A move of the circle that gives to an owner, to a hand, or to a tool or circle of theirs, and is not in the causal past of a word of the circle that stands and is not yet done, is listed beside that word. Nothing is refused for it, and no sum is run.

Story: C9's emptying move, not having Harry's deal in its causal past. Answer: listed beside Harry's deal. A sale of the oven to Amara's cousin for £1 gives to no owner and is not listed.

### Rows (`circles.md`)

**C10. A row.** *her word* (the owners' terms); *convention* for the shape.
> A row is the owners' standing grant, stated on the founding block or a version: `{ parts, scope }` (holders of that many parts between them) or `{ to, needed, scope }` (that many of the ids `to` names, or of the holders of the grant it names). `scope` is a grant's scope, read as a grant's is, on the circle's line. Every number is whole and at least 1; never `all` and never a share. A block `as` the circle holds where one row holds for it, or by every owner together.

Story: B1, Amara's £120 order `as` F. Answer: r1 holds: one hand, 50 part, at least 1; `promise` in its types; under £300. A row `{ parts: "all", ... }`: refused (`shape`).

<!-- REMOVED the rows `{ move, of, by, needed }` and `{ move, of, parts }`, and the moves `sign`, `take`, `issue`, `admit`, `remove`, `change` | guarded: nobody's thing; a name list standing in for what a block does | now: one row shape read by its scope; `admit` is a grant (C14), `remove` its stop, `issue` C4, `take` C16, `change` C19 (07 §3). -->
<!-- REMOVED "`rekey` is among them, read only by the rekeys convention" | guarded: a circle's sealed letters | now: a rekey is a key grant `as` the circle that a row holds for (choices row 115). -->
<!-- REMOVED "A block that is two of these (a take that also issues) holds only where a row for each holds" | guarded: the owners | now: one row must hold for the block whole, and C16 still needs it met without the hand of anyone it gives to. -->

**C11. Head counts.** *her word* (D-also; T4-1)
> A row's `to` may name a grant `as` the circle; the row then counts the holders that grant names, as it stands. That grant changes only by a newer word signed `as` the circle by a row whose `scope.types` names `grant`, or by every owner together. No name carries power by itself.

Story: grant M `as` L names 200 members. A version of L adds row `{ to: M, needed: 101, scope: { types: [transfer], each: 50,000 KES } }`. Joseph buys 60 parts from leavers. He and 40 friends sign a sale of the store. Answer: does not hold: 41 holders of M, one id counted once (A count counts ids). Nia joins: a newer word for M naming 201, signed under a row that names `grant`. Answer: from there the row counts 201 holders.

**C12. Bounds.** *her word* (07 R6)
> A row may state a line's bounds (`each`, `limit`, `every`), read as a tool's are, on the circle's line. A move above a row's bounds holds by another row whose bounds it fits, or by every owner together. A row's `every` needs no `until`.

Story: Amara signs `as` F a £900 oven order. Answer: r1 does not hold (above `each`); no other row; it waits (`on: hands`). Leila confirms. Answer: holds by every owner together.
Story, kept word: Amara and Leila signed `as` F a £2,200 loan from Harry. Leila dies with no will. Amara signs, under r1, the £2,200 repayment `for` it. Answer: holds; the repayment was counted when the loan stood, and counts once (stage 4's counted-once rule, 05 R7c). Its home text is stage 4's; this stage only points to it.

**C13. A grant from a row.** *core* ("authority only narrows")
> A grant signed `as` a circle is no wider than the scope of the row that holds for it, as a child grant is no wider than its parent, on every field the row states. A field the row leaves out bounds nothing: the row is the owners' own word, and their silence names no limit. A grant wider than every row is a move no row holds for (C18): it waits for hands that make it, such as every owner together.

Story: Leila signs `as` F, under r1, a grant to her cousin's AI with `each` £5,000. Answer: no row holds for it (wider than r1's `each`); it waits (`on: hands`) and acts on nothing; Amara's confirm makes it hold, by every owner together. The same with `each` £100: holds by r1. The same naming Harry in `parties`: holds (r1 names no `parties`).

**C14. Anyone who owns no part.** *convention*
> Anyone who owns no part acts for the owners only under a grant `as` the circle, or where a row's `to` names her (a row is the owners' standing grant, C10). Seating someone is that grant. Unseating her is its stop, or a newer word in its place, signed `as` the circle by a row whose `scope.types` names `grant`. A holder may always end her own place under it.

Story: Amara signs `as` F, under r1, grant G to Joe: `types: [promise, transfer]`, `each` £100, `on` the café's want of milk, `parties` Harry, `refs.meter` T (stage 4: a tool deals only with a side its grant admits; r1 names neither, so G may). Joe accepts Harry's offer to that want under G. Answer: speaks for the café's owners. Amara then stops G `as` F under r1. Answer: holds; Joe's later blocks under G count for nothing (The cut). Joe's own stop of G: holds alone.

<!-- REMOVED "Members and roles" whole: roles as names, the member grant kind, open joiners, changing roles, removal as a stop of a member grant, rejoining | guarded: the owners, so only seated people act | now: C14 (every actor holds a grant that names him, bounded by C13); head counts by C11 (D-also). -->
<!-- REMOVED "A death. A counted close of a member ends her member grants, bar those `state.continues` names" | guarded: heirs | now: C7 and her will (D9). -->
<!-- REMOVED "Grants from a circle ... A grant to a role binds only through a meter ... A holder's own AI acts for the circle only under a grant the circle signs to it, which is a `take` where she signed one of its hands" | guarded: the owners, against a holder granting to her own AI | now: C13 bounds it, and C16 makes a grant to a tool of hers a move that gives to her. -->

**C15. Hands.** *core*
> A **hand** is a block made on its signer's parts, or on her place in a row's `to`: the move itself, and each counted block that names it in `refs.confirms`. A hand counts in a parts row by the parts she owns of the circle on her line read whole from her hand back to her start; in a `to` row, once, where `to` names her, or names a grant that names her and stands in the hand's causal past. A hand on unissued parts, and the hand of one the move gives to, count for nothing (`not_voice`). A move holds at a block, the move or a confirm of it, in whose causal past enough hands of one row count, counted in that one place. Each hand stands as her word would (her key's `wait`, `reach` and bounds). Until the move holds and its hands stand, it is waiting (`on: hands`).
>
> **A hand lasts while she holds what the row counts.** Its ends (The cut) are: for a parts row, every draw of hers on the circle's parts, from where she signs it, landed or not, and her close; for a `to` row, every end of her place (a newer word for the grant without her, its stop, her own end, her close). A hand whose end the completing block has seen adds nothing. A draw is no end of her hand for the move that accepts that very draw (the move, or a move it confirms, answers it): its parts are hers until the receiver's yes, and the one saying yes is that receiver. For the cut, a move's signer is all its hands together: no hand's own later block passes an end of her hand, and no signer of one of its hands, no tool of hers and no one under a grant she gave is its relier. So, with no clock, a gathered move counts from where an outside block is joined to it.

Story: Amara signs the £900 order. Leila transfers her 50 part to Maria; then Leila confirms the order, the transfer in her confirm's past. Answer: Leila's hand counts 0; 50 of 100; waits. Maria confirms. Answer: holds.

<!-- REMOVED "An open joiner's hand ... count for nothing" | guarded: owners, against free keys voting | now: open joiners are gone; a `to` row counts only named ids (C15). -->
<!-- REMOVED "signed twice where it lets another act or spend: blocks.md, Finality" | guarded: Mama, against a planted key | now: her key's `wait` (00-shared, rule 10's note). -->
<!-- REMOVED "and the circle bears that gap (blocks.md, Who bears the gap)" | guarded: the stopper | now: "counts from where an outside block is joined to it" (choices row 81; rule 2 From where a stop counts). -->

**C16. No one is both sides** (rule 5, read for a circle). *core* (07 R9; seat 38 sentence 7)
> A move gives to an owner when it gives anything to her, to a tool of hers, or to a circle in which her hand could count. It holds only by a row met without the hand of anyone it gives to, or by every owner together, or under a row or grant whose `scope.on` names a promise that names her as the one paid (rule 5).

Story 1: Amara signs `as` F, under r1, £200 to herself. Answer: her hand counts for nothing; no row is met; it acts on nothing (C18). Leila confirms. Answer: holds (Leila's 50, without Amara's hand).
Story 2: Leila signs `as` F a hand-over of three open deals to her own stall, a circle she owns. Answer: gives to her; waits until Amara signs.
Story 3, three owners (Amara 40, Leila 40, Maria 20): Leila signs `as` F, under r1, £300 to Amara. Answer: holds; any one other owner may pay her.

<!-- REMOVED "A move gives to an owner when it gives her more than her share by parts" and "a move that gives each owner her share by parts, in one block, gives to no one" (b2-09; b1-08 M4) | guarded: fairness of a split, meant to | now: nothing signable needed it (one transfer lands on one id, shown, seat 38 B1); C16 and C17 guard the split. -->
<!-- REMOVED the `take` row and "A member grant is not a take: who may seat whom is the `admit` row's word" | guarded: the other owners, against self-payment | now: C16 with any row; member grants are gone. -->

**C17. A payout by parts.** *her word* (07 R10). Pattern text for `spec/patterns/circles.md`; adds no rule.
> A standing promise to each owner, signed by every owner together, names how takings are paid to her by parts: when, the `step` her share rounds to, and, on one of them, that she takes what is left. Each payout is one transfer to one owner, `for` her promise, signed `as` the circle under a row whose `scope.on` names it; the row's `to` may name the till. A tool under a grant pays only what a deal names (stage 4, Due): a promise that states no amount names nothing it may pay (`not_due`).

Story: Amara and Leila sign `as` F promises SP-A (to Amara) and SP-L (to Leila): "each Sunday, the till's takings by parts, step 1p; Leila takes what is left", and a version of F adding the row `{ to: [T], needed: 1, scope: { types: [transfer], on: [SP-A, SP-L] } }` (it names blocks signed after F, so it comes by a version). Sunday, takings £306.75: the till signs `as` F £153.37 to Amara `for` SP-A and £153.38 to Leila `for` SP-L. Answer: both hold, by the till's place in that row (and, were the till's key Amara's, by C16's last clause: the row's `scope.on` names the promise that names her as the one paid). No owner signs on Sunday. The same payouts under a grant TG to the till, `scope.on` SP-A: `not_due`.

**C18. One answer for a block with no row.** *core* (07 R12)
> A block `as` a circle for which no row holds is waiting (`on: hands`). It acts on nothing of anyone's, its signer's included. It binds his name to its truth, and nothing of his. `no_role` names this answer.

Story: after G's stop, Joe signs `as` F an order of milk. Answer: waiting; acts on nothing; Joe's name is bound to its truth, his things are not.

<!-- REMOVED "else it speaks for no one (`no_role`)", "speaks for its signer alone", and "kept, and counting for nothing" as three answers | guarded: strangers, against reading one block three ways | now: C18, one answer (b2-09 2.5). -->

**C19. Versions.** *core* (no rule votes itself in)
> A **version** is an `actor` of kind `circle` that `updates` the founding block or an earlier version and states its whole `state`; the circle's id stays the founding block's. It is a block `as` the circle of type `actor`. Rows whose `scope.types` names `actor` are read only from the founding block: a version that states others changes nothing by them. With no such row, only every owner together makes a version. The rows as they stand for a block are those of the version in its causal past that every other version there is in the causal past of; where two versions are rivals, those of the latest version both have in their past; with none, the founding block's.

Story: Amara alone signs a version of F adding a row. Answer: F names no `actor` row; waits. Leila confirms. Answer: holds. A version that adds `{ parts: 1, scope: { types: [actor] } }`: that row is never read.

<!-- REMOVED "a `change` row `of` that field must hold for it" and "With no `change` row for a field, that field never changes" | guarded: every owner, against a rule voted in | now: C19, by `actor` rows read from the founding block, or every owner together. -->

**C20. A circle's clock.** *her word*
> The founding block may state `clocks`, a named clock (A clock). Every hand and every block `as` the circle is read on it: an end of a hand, or of a place a row counts, is seen by a block where it is in that block's causal past or where the clock received it first. Every grant `as` the circle that names the clock in its `scope.clocks` is cut on it (The cut). It changes only by a version.

Story: G names N in `scope.clocks`. Amara stops G under r1, received on N; then Joe's order under G, received on N after. Answer: counts for nothing. With no clock: Joe's order counts for a relier whose block was joined to it before he saw the stop (The cut).

<!-- REMOVED "its members accepted it by joining, and the owners by taking parts" | guarded: nobody's thing; a ground written for members | now: C2 (each owner was handed the rows with her parts). -->
<!-- REMOVED "With none, the circle bears what was done until the relier has seen the end" | guarded: the stopper | now: The cut and rule 2 (no ruling word). -->

**C21. A circle's line.** *core*
> The founding block may name `refs.meter`: the start of the one line on which every draw that speaks for the circle is counted, read as `refs.meter` is. With none, each measure the circle owns is drawn on along the line of the key that signed the circle's start for it (What is left). What a hand holds there is held as the circle's, never hers. It moves to another hand's line only as a part passed (A part passed), and at the end of her place (C15's ends), what is still on her line is freed to the circle, and another hand's block `as` the circle continues her line (A line goes on).

Story: T named. Two tills each sell the last loaf `as` F. Answer: T's receipts show totals; the second draw takes nothing (`past`).
Story, no meter: Leila signs 100 sacks `as` F; she then transfers all her parts away and holds no grant. Amara's transfer `as` F of 20 sacks to Bo, Leila's last block in its past and named in `state.counted_to`, Maria confirming. Answer: takes on Amara's line; Bo accepts: the café 80, Bo 20. Leila's own key then signs 10 of them away. Answer: `not_owner`. Two such take-ups apart: Open (SILENT 7).

<!-- REMOVED the long paragraph "What a hand holds for the circle ... A take-up is a start ... no `pair` (two keys acted apart; no one lied) ... until a later take-up or accept whose `after` names both" | guarded: the owners' goods on a leaver's phone | now: A part passed and A line goes on in 00-shared (choices rows 88, 90); the two-apart case is Open (SILENT 7), since D7 settled only her own keys. -->

### Beside the rules (`circles.md`)

> - **No group may make outside dealing hard.** No row binds a holder's dealing with others except as her own signed promise. A fine, a boycott or an expulsion for dealing outside is a term she signed, with a stake, or it is nothing. *core*
> - **Shared records.** A pot, a vote or an auction is a record many write to, under a schema named in `refs.under` (patterns/pools.md, profiles/ballots.md). A count of such a record moves nothing; a block `as` a circle holds only by a row's hands or every owner together. *convention*

<!-- REMOVED "Leaders answer by their own word. No liability falls on a hand by the office" | guarded: hands | now: an order to a judge, not a word; kept as ground on the pattern page; C9 and the premise (a word binds only its signer) say the rest. -->
<!-- REMOVED "costly" in "No group may make outside dealing costly" | guarded: nobody's thing; a banned word | now: "hard". -->

**Invariant 27.** *core*
> A block `as` a circle speaks for its owners only where a row holds for it, counted in one place, every hand counting in that row and past each of its ends, and no hand of one the move gives to counting; or where hands that own every part persons own sign it.

### Elsewhere

**C22. One id where one id is wanted** (`core.md`, section 1; `protocol.json` `refs_single`). *convention* (07 R18)
> A list where a ref takes one id is refused (`grammar`), except in a ref a rule names as a list: a grant's `refs.to` and a row's `to`, each with `needed`.

Story: the till signs one transfer of £306.75 `to_owner [Amara, Leila]`. Answer: refused (`grammar`). Today it is valid and lands all £306.75 on one id by sort order (07 §7, shown).

**C23. Work** (`things.md`, Work: the parenthesis "(`as` the business if for one)" replaced). *core* (07 R19)
> Work done for another is the worker's own word, signed in her own name, `for` the deal that pays it, and never `as` the one who pays: she is the other side. What she does for the owners she does by their row or under their grant, and what she makes from their goods is theirs (A make). Who counts the hours is Work done (D13).

Story: Amara signs `as` F under r1 job J to Ben, £12 an hour, "counted on Ben's word". Ben signs, in his own name, `work` 40 hours `for` J. Answer: his hours count on his word (D13). The same block signed `as` F: Ben owns no part and holds no grant naming it; acts on nothing (C18).

<!-- REMOVED "(`as` the business if for one)" in Work | guarded: the café, meant to | now: C23; it made Ben's shift the café's word (07 §3, shown by circle.cjs). -->

---

## 4. Other spec edits

- **`circles.md`** opening, after C0: "No text says a circle pays, holds, chooses or decides. A word that speaks for a circle is written as who signed it, by which row, and which of whose things it names." *convention* (b2-09 2.7, its banned words cut to those not already banned.)
- **`folds.md`, Counts.** As 1.8 F2: "A count states a whole number, never `all` and never a share: a set a signer can leave out of her causal past is one she can shrink." "Holders of a power" becomes "the signers of a row's hands".
- **`folds.md`, Circle fold** (1.8 F4, changed): the fold reads the founding block, the version that stands for the block read (C19), every transfer whose `refs.what` is the circle, every grant `as` the circle that a row's `to` names, every block that answers, updates or confirms one of them, and each owner's close. Only what is in the block's causal past. No step reads arrival, a hash order or a date. A parts row reads each hand's line read whole; else `{ not_shown: true, lacks }`.
- **`folds.md`, `circle_state`**: `{ founder, pack, owners, unissued, rules, clocks, meter }`; `owners` `[{ owner, amount, no_person }]` sorted, or `{ not_said: true }`.
- **`folds.md`, `circle_versions`**: `{ circle, versions: [{ version, updates, author, holds, hands }], now }`.
- **`folds.md`, invariant 31**: "the circle it names in `as` where a row of the circle holds for it, or every owner signs it".
- **`blocks.md`, Finality**: no edit; 00-shared's Stands already names "the rows of the circle it is `as`", and `hands` is in the `on` order (choices row 80).
- **`authority.md`, Who a block speaks for, the `as` bullet**: "A block naming a circle in `refs.as` speaks for the circle's owners where a row holds for it or every owner signs it, and it stands (circles.md). Otherwise it is waiting (`on: hands`) and acts on nothing (`no_role`)."
- **`authority.md`, the passing-on sentence**: "A grant to a circle is passed on by a child signed `as` that circle, no wider than given, which holds where a row holds for it."
- **`authority.md`, Backed by a person, the circle bullet**: "**P signed a hand of the circle it is signed as.** It speaks for the circle's owners, and a hand of P's is among those its row counted. It binds the circle's things, never P's own."
- **`authority.md`, Ending**: "A word signed `as` a circle is ended by a stop of its author while she still holds what her hand counted, or by a stop `as` the circle that a row holds for; any other stop `as` the circle ends nothing."
- **`authority.md`, To a role**: deleted with roles (07 §3). *(Stage 4 writes a grant to several ids with `needed`.)*
- **`promises.md`, Where to pay me**: "a block signed `as` a circle ... names none" becomes C9a.
- **`privacy.md`, Audience**: "it may be a person, a circle, or `circle#role`" becomes "a person or a circle"; "A circle means its members ... a role its holders there" becomes C8's first sentence.
- **`things.md`, grounds**: "which types or roles confirm" and "a list of ids or `circle#role`" lose roles: "which types confirm", "a list of ids".
- **`profiles/rekeys.md`**: "signed `as` the circle by a holder of `rekey`" becomes "signed `as` the circle, where a row holds for it"; sealed "to each owner of its parts in the circle fold of the block's causal past".
- **`profiles/ballots.md`**: add "A result moves nothing: a block `as` a circle holds only by a row's signed hands, or every owner together."
- **`spec/schemas/schemas.json`**: delete `share_vote` (a count by share is a parts row).

<!-- REMOVED 1.8's A6 note on authority.md's empty heading "The cut" | guarded: nobody's thing | now: stage 7's cut, unchanged. -->
<!-- REMOVED 1.8's pointer "(circles.md, Members and roles)" in promises.md | guarded: nobody's thing | now: points to circles.md, Rows. -->

---

## 5. `protocol.json`

- **R** `powers`; in `circle`: `removal`, `removal_rule`, `roles_shape`, `change`, `change_rule`, `needed`, `needed_rule`; grant kind `member`; `grammar.role_ref`; `state.roles` and `state.to_role`; the circle half of `bad_roles`; `fold.not_member`; `folds.may_act_as` and its door op; `optional_profiles.rekeys.powers`.
- **A** `circle.about`: "A founding block states `pack` (whole parts, the founder's first), `rules` (rows), `clocks` and `refs.meter`, each optional. A row is `{ parts, scope }` or `{ to, needed, scope }`, `scope` a grant's scope; numbers whole, at least 1. A block as the circle holds where one row holds for it, or by every owner together (circles.md)."
- **A** `shapes.row`: `{ "parts": ["parts", "scope"], "named": ["to", "needed", "scope"], "about": "a row of a circle's rules: exactly one of these key sets" }`. `field_shape.rules`: `shape`. `fields.actor`: `rules`, `pack`, `clocks`; `refs.meter` on an actor of kind `circle`.
- **C** `refs_single`: add `to_owner` (C22).
- **C** `block.shape` text: "a circle row not in its shape (a number not whole or below 1, a parts row on a circle with no pack), a circle's pack that is not whole parts".
- **C** `fold.no_role`: "a block as a circle for which no row holds and which every owner did not sign: waiting, acting on nothing (circles.md)". **A** `fold.not_voice`: "a hand that counts for nothing in its row: no parts on a line read whole, not named by the row's `to`, an end of hers that the completing block has seen, unissued parts, or one the move gives to".
- **C** `stands.on`: `hands` stays (choices row 80). `both_sides` keeps its grant meaning; in a circle the hand of one the move gives to is `not_voice` (C15), and `both_sides` names no hand (stage 6 building).
- **A** `folds.row_holds`, `folds.ways_in` (a reading). **C** `count_of` args: a stated whole number.
- **A** (stage 6 building) `door.ops.binds`; `scope.ends_on`, `shapes.ends_on`, `field_shape.ends_on` (04-grants, What building changed).
- **CBOR names**: removed `removal`; added `rules`, `parts`, `needed`, `scope` where not already in the table.

---

## 6. What changes for each built engine operation

Built today: 1.7 circles (stages 0 to 3), in the oracle (`fb.cjs`) and the Rust core (`fold/circle.rs`, `versions.rs`, `rekeys.rs`). Stage 6 of 1.8 was never built.

| Op | Today (built) | 1.9 |
|---|---|---|
| `valid` | reads `roles` and `powers`, `removal`, `needed`, `change` on a founding block; member grants | reads `pack`, `rules` (`shapes.row`), `clocks`; a list in `to_owner` is `grammar` (C22); member grant kind gone |
| `circle_state` | `{ founder, members, removed }` | `{ founder, pack, owners, unissued, rules, clocks, meter }`; `not_shown` when an owner's line is not read whole |
| `circle_versions` | `{ circle, versions, members, rules }`, per-member reading | `{ circle, versions, now }` (C19): versions only, `now` the founding block's id where none stands |
| `may_act_as` | true or false by role powers | **removed**; replaced by `row_holds` |
| `row_holds` | none | **added**: `row_holds(block, held)`, the circle read from `refs.as`: `{ circle, holds, row, every_owner, at, hands: [{ id, block, parts, counts, why }], waiting, listed }`; `why` null or `not_voice`, `waiting`, `pair`; `listed` C9b |
| `ways_in` | none | **added**, a reading: `ways_in(circle, held)`: `{ circle, rows: [{ row, least }], every_owner: { least } \| null }`: per row `least` (its `needed`, or the fewest owners whose parts reach `parts`), and the every-owner way with `least` the number of persons who own parts; no row's `least` above it (07 R16) |
| `speaks_for`, `backed`, `backed_all` | `as` by role with `sign` | `as` through `row_holds` or every owner; else null, `waiting` `on: hands` |
| `stands` | no `hands` | `on: hands` for a block `as` a circle |
| `members_then` | members by role in the block's past | owners by parts in the block's past (C8); `circle#role` gone |
| `count_of` | a number, `all`, or `{ of_members }` | a whole number from 1 to the size of the set; else null |
| `circle_key` | key grants by a holder of `rekey` | key grants `as` the circle that a row holds for |
| `gives` | "the circle it is signed as" | unchanged text; C16 decides whether it holds |

**Old founding blocks.** None is valid in 1.9 (stage 2's header), so founders re-sign. The product drafts the new block from the old one, shown before she signs: each role R holding `sign` with `needed` N becomes `{ to: [<R's holders now>], needed: N, scope: { types: [<the seven>] } }`; `all` and `{ of_members }` cannot be mapped and are re-made by hand; no `pack`. *product*

<!-- REMOVED 1.8 section 8's map steps 3 to 5 (admit, remove, rekey rows) and its counts | guarded: founders re-signing | now: one product draft line; admit and remove are grants and stops. -->
<!-- REMOVED 1.8 section 8's 37 vectors | guarded: builders, against untested rules | now: each rule's story above is its vector. -->
<!-- REMOVED 1.8 section 9 "Build notes" | guarded: nobody's thing; a build map for a shape now gone | now: 07 §8, steps 5 and 6. -->
<!-- REMOVED 1.8 section 6 "The attacks, walked under the new text" | guarded: readers checking the 1.8 rows | now: each attack is a story above (open joiners gone; vote then sell C15; take C16; leaver C16 story 2; removed manager C20; ring C5; death C7; no pack C3; co-op C4, C11). -->
<!-- REMOVED "How `least` is computed" (the admit fixpoint) | guarded: strangers reading a weak table | now: `ways_in` above, without `admit` rows (b2-09 2.9). -->

---

## 7. Default tables (`spec/patterns/circles.md`). *product*

Ordinary people never write a row. The product offers one whole, reads each row back in one sentence, and shows `ways_in`. No staff grant names `observe.account`. Every table offers `needed: 1` among living owners and names a meter. At founding each owner is offered a will for her parts, unticked (P3).

- **The café**: F above. Read-back: "Café: you 50, Leila 50. Either of you signs up to £300 a deal and may hire inside that. More, or a rule change: both." At three owners add: "Any one other owner may pay you, and you her."
- **Title until paid** (P1): a stranger selling to a circle on credit has his delivery drafted on the condition of his own paid signal, his to remove. His read-back: "Their word. Nothing is held for you. Amara and Leila may move everything out before Friday."
- **A job** (P2; D13): drafted as "counted on Ben's word, disputed before the judge both named", shown to Ben before he signs.
- **The savings group** (P4): `pack` 12, one part to each saver; `{ parts: 8, scope: { types: [promise, observe, grant] } }`; no `actor` row. In round k each saver pays saver k directly, her own transfer `for` the round promise. Nobody holds the pot.
- **The family**: `pack` 2; `{ parts: 1, scope: { types: [promise, observe, transform, thing, transfer], each: 3 head } }`.
- **The co-op**: `pack` 1000, unissued held by the co-op, meter the co-op node; a members grant M and head-count rows on M (C11), added by a version (SILENT, below).

<!-- REMOVED 1.8's four tables with `roles`, `take`, `admit`, `remove`, `issue` and `change` rows, and the treasurer | guarded: each saver, against a treasurer holding the pot; owners, against weak tables | now: P4 (nobody holds the pot) and the rows above. -->
<!-- REMOVED "Each owner's part card asks who takes it if she dies" via successor | guarded: heirs | now: the will offer (D9). -->

---

## 8. SILENT

1. **A buyer of parts and blocks sealed before he bought.** Settled in building (stage 6): he may not claim them; what was sealed before he owned was not his (C8).
2. **Two take-ups apart** (SILENT 7). D7 settles her own keys only.
3. **A head-count row on the founding block.** Settled in building (stage 6): any row that names a block signed after the founding block (a grant, a promise, the circle itself) comes by a version; no block names its own id (C4, C17).
4. **The savings group's round promise.** Who signs it, and how it binds each saver's own money (a word `as` the circle names only the circle's things). 07 P4 and seat 38 B5 say only "`for` the round promise".
5. **`ways_in` and a head-count grant.** Whether `least` follows a row that can add holders to the grant a row counts. No source says.
6. **Holders of grants `as` a circle in an audience naming it.** C8 names owners only; 1.8 named members, who are gone.
7. **Which refs take one id** beyond `to_owner` (C22). 07 says "every one-id ref" and lists none.
8. **Does a plain grant need its holder's accept** (C14)? Stage 4's (07 §10).
9. **Unissued parts with no meter** shut the every-owner way for good; a version that names a meter needs every owner or an `actor` row. Only the read-back is proposed (07 §10).
10. **A ring of circles**: grants that stood before the ring closed run on and nobody can stop them. No release is proposed (07 §10).
11. **`scope.what` in a row** (C4). Settled in building (stage 6): a row has no refs, so it names ids in `scope.what` (one id or a list); a block's `refs.what` must be within it, and a block that names the circle itself needs a row that names it.

---

## 9. Asks of the shared ground

`00-shared.md`, Circles, still stated 1.8's shape. D-also ("no separate roles") and T4-2 change it. All six were written there in building (stage 6, 2026-11-19), with rule 5 also naming every owner:

1. **Row**: becomes C10's two shapes; drop `move` and its six values. Drop "a circle row's field `move`" from People, Type, act, move, deed.
2. **Unissued**: "moved only by an `issue` move" becomes C4's last sentence.
3. **Hand**: "made on its signer's role or her parts" becomes "on her parts, or her place in a row's `to`".
4. **`not_voice`, `ways_in`, owners that end in no person: as 1.8** becomes "as 1.9 06-circles".
5. **Rule 5**: "or the circle's row for that (`take`) holds without her hand" becomes "or a row holds for it without her hand, or every owner signs it".
6. **`refs.meter`**: "A grant to a role, or an open grant" loses "to a role".

---

## What building changed (stage 6, 2026-11-19)

The two builders' guesses were laid side by side: the core's 31 items (`stage6-rust-silent.md`) and the oracle's 3 conflicts, 20 readings and 5 not built (`stage6-oracle-silent.md`), joined where they asked the same thing, and the splits found when each engine was asked the other's stories. Every story of this stage is now asked of both engines: the oracle's (`spec/oracle/stage6/export.cjs` writes `sdk/rust/tests/fixtures/stage6.json`; `tests/stage6.rs`, `the_oracle_stories_of_stage_6`, asks the core) and the core's (`FB_RECORD=<dir> cargo test --test stage6` writes each question it asks; `node spec/oracle/stage6/rust-stories.cjs <dir>` asks the oracle), and the random-world test (`tools/fuzz/corpus/s06-circles.cjs`). Where they split, the text was fixed first, by the centre (only a signed word binds, and only its signer; nothing fills anyone's silence; from when it stands, a later word takes back nothing already built on), then both engines. Each answer below is written in the entry it names.

| Question | Choice | Sentence changed (where) |
|---|---|---|
| A ring of two circles (core: C15's ends stop the ring; oracle: a draw the move answers is added back) | a draw is no end of her hand for the move that accepts that very draw: its parts are hers until the receiver's yes, and the one saying yes is that receiver. The ring closes; the core's "parts held toward the circle" subtraction goes | C15 (added sentence); C5 story; C4 story |
| `refs.as` in Keeps to (core: hers, like `author`; oracle: compared) | hers, like `author`: who speaks is no term of the deal, so the other side can keep to a circle's want and a tool can buy for a circle | 00-shared, Keeps to (item 1) |
| A grant from a row that names `on` or `parties` (oracle: wider than r1, which names neither) | a row bounds only what it states: the owners' silence names no limit, so a grant from it may name sides and promises | C13 (sentence added); C14 story |
| A grant wider than its row (oracle: `read` refuses it, `wider_than_parent`; core: no row holds) | no row holds for it: it waits (`on: hands`) like any move outside every row, and every owner together may still sign it | C13 story |
| One payout promise for two owners (oracle: a promise names one side; a tool's payout `for` a promise with no amount is `not_due`) | one standing promise to each owner; each payout is signed `as` the circle under a row whose `scope.on` names it, the till named in the row's `to`; under a grant it stays `not_due` | C17 rule and story; C14 (a row's `to` may name one who owns no part) |
| A row that names the circle (C4) or a later block | it comes by a version: no block names its own id | C4 story; SILENT 3 |
| `row_holds` arguments and shape (oracle `(block, circle?, held)`; core `(block, held)` with `at`) | `row_holds(block, held)`, the circle from `refs.as`; `at`; hands sorted by block, only those in `at`'s past where it holds; `parts` an amount; `counts` in the row read (else the first row that covers it, else the every-owner way); `why` `not_voice`, `waiting`, `pair`; `listed` (C9b) | section 6; protocol.json `folds.row_holds` |
| A hand of one the move gives to (core `both_sides`; oracle `not_voice`) | `not_voice`, as C15 says | section 5; protocol.json `refusals.codes.fold` |
| A hand's ends (oracle: the smaller of her parts at her hand and at the completing block) | as written: any draw of hers on the circle's parts after her hand, or her close, that the completing block has seen ends the whole hand | C15 (as written) |
| Who a move gives to (oracle: a promise's `to` only; core: an offer's sides, an accept's promise's sides and author) | the core's, with a two-key link counted as her: a transfer's `to_owner`, `to_holder`; a grant's `to`; an offer's or order's `from` and `to`; an accept of a promise, its sides and author; a tool of hers is a grant she signed in her own name in the move's causal past | C16 (as written) |
| Unissued parts stated by several receipts (oracle: the first by hash) | they must agree, else there is no every-owner way | C6 (as written) |
| `ways_in` (oracle `{ ways: [...] }` with `holders` and `within`) | `ways_in(circle, held)`: `{ circle, rows: [{ row, least }], every_owner: { least } \| null }` | section 6 |
| `circle_versions` (core listed the founding block) | versions only; `now` the founding block's id where none stands | section 6; protocol.json |
| A version's meter (core: the founding block's always; oracle: a version's, else the founding block's) | the standing block's own `refs.meter`: a version states its whole word, so one that names none leaves the circle with none | protocol.json `folds.circle_state` |
| A row's `limit` and `every` (core: `limit` for all time; oracle: neither) | built in both: the amounts this row held for in the block's causal past, counted once, reset at each period turn read as a grant's `every` on the circle's meter line; with no meter no period turns | C12 (as written) |
| C9b, the listing (oracle built, core not) | built in both, as `row_holds.listed` | C9b (as written) |
| C20, hands read on the circle's clock (built by neither) | built: an end of a hand or of a counted place is seen where it is in the block's past or the clock received it first; a grant `as` the circle is cut on the clock where it names it | C20 rule and story |
| C21, two tills on the meter, and a take-up with no meter (oracle built, core not) | built in both, as the text says | C21 (as written) |
| The cut for a gathered move (built by neither) | built: for a block `as` a circle that holds by hands, no signer of a counting hand, no tool of hers and no one under a grant she gave is "another person" joining it | C15 (as written) |
| C8: may a buyer of parts claim blocks sealed before he bought | no: what was sealed before he owned was not his | C8 story; SILENT 1 |
| A row's `what` (SILENT 11) | `scope.what`, ids; a move's `refs.what` within it | SILENT 11 |
| `share_vote` | deleted from `spec/schemas` (a count by share is a parts row) | section 4 (as written) |

Two decisions of the owner were built in the same step. **`binds(draft, held)`**, a door op of both engines and the JavaScript SDK's `binds`: a draft binds anyone where it is an accept, or where something of the one whose word it is moves (`gives` not empty); one rule, read from typed terms and refs. A circle's founding block that states `pack` binds its founder: it puts every part in her hand and is her start for them (C1; the owner's decision, 2026-11-20). **A grant's own ending term** `scope.ends_on: { witness, said }`: 04-grants, What building changed.

Building also found: the core's reading of a circle rebuilt a fresh index for every hand's past, so a 200-member head count took many minutes; it now reads one index limited to each past, with a busy mark for a ring (no answer changes). A hand made `as` the very circle shows the circle's unissued parts and never counts; one person's two hands count once (the one with the most parts). A row's `every` needs no `until` (C12, as written; the core refused it). `state.counted_to` is a field every block may carry (`protocol.json` `causal_state`), read by both engines from that list.

Outside this step: the vectors are not regenerated. `node spec/oracle/run.cjs` passes 826 (876 before this stage; the 51 lost are 38 `may_act_as` door cases and 2 refusals of it, 4 `count_of` cases with `all` or a share, 7 refusals about roles and member grants: each tests a deleted thing; one was won back). Deleting `share_vote` from the middle of `spec/schemas/schemas.json` changed the ids of the 41 schemas published after it (nothing in code names them; `spec/vectors.json` does, and is regenerated at landing). The random-world test now builds 1.9 circles (parts, a row, blocks `as` the circle, confirms) and asks `row_holds` and `ways_in`; its owners property no longer calls a circle's parts an actor's owner.

Open, for the owner (not settled here): a row's `each` in pounds is above any amount of another kind (C12, stage 4's rule), so r1 cannot cover a till's sale of a loaf; the stories of C21 use a row with no bound or a confirm. And `binds` of an unsigned draft signed `as` a circle answers false in both engines (`gives` reads the circle's things only where a row holds, and a draft has no hand yet).
