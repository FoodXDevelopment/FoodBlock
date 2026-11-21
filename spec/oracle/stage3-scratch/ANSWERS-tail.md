## The numbered GUESS list (each also marked `GUESS: [S3-n]` in fb.cjs, bar 36 which sits at the typed-fields check)

Each is a place where the text was silent or unclear; the later step compares this list with the other builder's.

1. **A draw lands only when it stands.** Lands (folds.md): "where the draw stands (blocks.md, Finality) and every word it names is in the causal past". A transfer is a standing word and passes the cut only when a block names or uses it, so a draw signed after her yes ("inside her order") waits on `end` until a later block names it (her accept, or the giver's own next block). 03-amounts.md (section 1, story 3, story 8) says such a draw "lands at once". Decided: Finality governs; see S3b.
2. **A block of a fork is a `pair` draw.** The reason list says "one of a pair, and each later draw of that key"; decided: every block in the fork set (a member of a pair, or a later block of that key) that draws on the measure reads `pair`, even when its twin draws on another measure.
3. **A line with an open pair has no owner.** "its signer owns none of that measure on that line": she is left out of `owners`, the amounts the pair drew are held by no one, and a receiver's decline (no yes in its past) leaves the other draw alone.
4. **A waiting draw.** "A draw that would fit only once an end she has not seen frees an earlier draw is waiting": decided takes false, no reason, listed in `waiting` (`on: end`), not counted against later draws. An 'all' draw (no amount) with nothing left waits the same way. A draw whose own word does not yet stand for another reason still holds and is listed with that reason.
5. **`state.expires` as an end.** The text makes it an end (things.md) but a time is read only against its signer (blocks.md, Time). Decided: the receiver's own block dated at or after it has seen it and frees the draw; her accept dated at or after it, or undated, is late by its own word and is no yes.
6. **A draw by the line's own key before her start** reads `not_on_line` (03-amounts.md, vector 36: "the two earlier draws stay `not_on_line`"); `not_owner` is for one who owns none of the measure on any line.
7. **An accepted answer that states more than the draw, or another kind**, is read as stating none: the whole draw lands.
8. **A make under a grant speaks for the owner** only where the grant names a promise in `scope.on` (sentence 4: what binds her keeps to a promise she signed that the grant names). Without it the make is toll work and the maker's own word. authority.md has no Toll work yet.
9. **A grant that names an instance in `refs.what` passes a part** (`scope.limit`, else all she owns) to a line of its own, `grant:<hash>`; the holder's makes naming the grant in `refs.under` are draws by the grantor on that line; no walk is made of it. A hand-back and a grant's end (folds.md, A draw) are not built: authority.md (stage 4) does not say who "binds her" yet.
10. **Cases 2 and 3 of her start are one rule**: her own `accepted` answer to the output starts her line. A stranger's make takes nothing of hers (T9: "a make by anyone else takes nothing"), so there is no output to accept; case 3's "nothing is hers until she answers accepted" cannot make a stranger's loaf hers.
11. **Several makes of hers**: her start for an output is the one that sees the others; apart, she owns it on no line.
12. **`held`, `ended`, `let_go` of a thing with no pack** are amounts of unit `whole`; an owner of a whole, or of an amount not said, has `amount` null.
13. **`kind`** of an ownership answer is `{ unit, of }`: the unit of the pack, `of` the instance's `refs.of` or null.
14. **A block that speaks for no one is not a draw** and is not listed.
15. **Who holds a claim**: the one owner of the claim; while a hand-over is held or a pair stands, the owner it was drawn from; else the claimant.
16. **A pot with no kind** (pay-ins of two kinds and no backing, or nothing) gives null sums and every payout `unit`; a pot with a kind and no backing states `backing` 0; `cap: all` takes every payout.
17. **A pay-in counts for a payout** when the holder's accept of it, by any key of hers, is in the payout's causal past.
18. **An open offer with no `quantity` and no `lines`** has no measure: none of its allocations is over-allocated.
19. **Allocations are read in `seq` order**; the hash breaks a tie in the listing only.
20. **A promise with no `what` and no `lines`** (a loan of money) moves its `terms.quantity`: read as one line, id null.
21. **`lines[].needed` and `moved` are amounts** in the line's kind, null where the line states no quantity.
22. **`uncovered.from`** has one entry for each line that moved something (the amount may be 0); payments with no line label cover lines in the order the terms list them; before a binding accept it is `{ from: [], to: null }`.
23. **A transfer back** (from the delivering side, in the price's kind) is read only where the line's kind is another; in a one-kind deal (a loan) such a transfer is a delivery.
24. **A total with no finite decimal form** (a third of a pound) is null.
25. **A payment that names an instance** counts its landed draw toward a price only where the price states an `of` that is the instance's `refs.of` and the units agree; otherwise only what the payee's answer says it covers (the largest of several answers); a payment with a `split` counts as its parts for the deal say.
26. **`received`**: the payee's word counts toward the price; the other side's toward the line its `state.line` names (the only line when it names none). A signer named by an account word (`state.by`) is stage 5's and is not built.
27. **`unanswered`** lists transfers of either side that name no instance, are `for` the deal and speak for a side, and that the other side has not accepted.
28. **A hand-over of what is owed** is a draw on the side its signer is owed on; it is listed where it does not read `not_owner`, `unit` or `no_measure`; each side's owner starts at the binding accept or the offer, whichever that side signed; `owed` is null until a counted hand-over is held. A hand-over's amount carries no `of` (shape), so it is compared by unit only.
29. **"Read as a transfer that names no instance"** (no_measure) is read for the stage: it counts toward its line or price in its own kind on the receiver's accept, and is no draw.
30. **The ownership of a kind or an actor** is the empty answer; a block the reader does not hold as read gives no answer at the door (row 106).
31. **The reach of a word about an instance** (things.md, Parts) is a reading (`reachOfWord`, no door op): whole for the author of the make or first use it came from, else the amount the author's own draws handed on and that landed.
32. **Who holds it** (`holderOf`, no door op): the latest counted `to_holder` transfer by an owner or a holder, accepted; several maxima or none fall back to the owner.
33. **The export clause**: the folds asked of every block in the document are the ownership of an instance and, of a first promise, its stage and its pot; the lines they read (each from the block back to the fold's own start) go with the document. Stages 4 to 6 add the folds they name.
34. **`made_from`**: an output is a thing written by the make's author that names it in `derives_from`; `took` is what the make's draw states (null for all).
35. **A bid's form** states `unit` (and `of`) beside the deadline and the clock; `bids_shown.kind` is `{ unit, of }` or null.
36. **`received`** is named only in `kind_fields.about`, with no `field:shape` line; its `state.amount` is judged by the field's own shape and `state.line` is not checked.

## Cases left broken until stage 4 (they still read the 1.7 money shape, or need authority.md's new text)

- `within_limit`, `limit_within_parent`, `limit_fence`, `limit_commitment` and `narrower_than` for money: `legacyMoneyProblem`, `noLarger`, `moneyOrAmountProblem` and `withinLimit`'s read of `state.money` as spent are kept as they were (an amount limit works where the old code read an amount).
- `scope.limit` and `scope.each` written as money pass the write check through `legacyMoneyProblem`.
- `scope.on`, `refs.meter`, `state.draws`, a grant's end freeing what it holds, a tool's hand-back (story 21, vectors 31 to 34), and "who binds her" under a grant: not built (authority.md is stage 4's). Story 5b declares `scope.on` in memory for the test.

## Where the text looks wrong or unclear (not changed)

- 03-amounts.md sections 1, 5 (stories 3 and 8, vector 1): "lands at once" for a draw whose receiver's yes is already in its past, against Finality and the cut (guess 1).
- Start, cases 2 and 3, against things.md T9 (guess 10).
- folds.md, What each fold returns: `held`, `ended`, `let_go` are "sums", and a whole has no unit (guess 12); `lines[].moved` is "a sum in the line's kind", `needed` is not said to be an amount (guess 21).
- protocol.json `kind_fields` lists no line for `received` (guess 36); `scope.on` is in `needs` but not in `scope`, so a grant that names one is `undeclared_field` today.
- folds.md, Lands: "her binding accept of the deal the draw is `for`" means reading the deal's stage inside the ownership fold, while the stage reads ownership for a side that names a thing: the text does not say how the loop ends (decided: a deal being read reads no draw that is for it).
- The reasons: `not_on_line` against `not_owner` for a draw of her own key signed before her start (guess 6).
- folds.md says a loan "reaches `done`", and `uncovered.from` is "null (or [])": the oracle gives an entry of amount 0 for a line that moved and was covered, not [].
