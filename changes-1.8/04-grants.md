# FoodBlock 1.8, stage 4: grants

Uses the words of `00-shared.md` with its meanings (a line, its start, read whole, `not_shown`, `lacks`, a measure, a draw, holds, lands, freed, the six reasons, an amount, stands, waiting, signed twice, a relier, seen, a pair, a fork, a named clock, a keeper, a receipt, a cutoff, a tool, a named signer) and defines none of them again. Written as if stages 0 to 3 have landed: `scope.types` (stage 0); `refs.key`, signed twice, and `blocks.md` Time, A named clock, The cut (with Seen, Relier, Who bears the gap) and Finality (stage 1); `folds.md` A line and `read` (stage 2); `folds.md` What is left, the amount shape and money as an amount (stage 3). Line numbers are `spec/modules/authority.md` and `promises.md` as they stood on 2026-11-11 after stage 0; stages 1 to 3 do not touch `authority.md`, and stage 3's word swaps in `promises.md` change no line count. Each passage is also named by its first and last words.

---

## 1. What this stage does

1. **A grant names her terms.** `scope.on` lists promises she signed. Under a grant, a block binds her only where it keeps to one of them: her promise byte for byte, bar a closed list of eight things that may differ. Every other block under a grant is the signer's own word.
2. **Her quantity is counted once.** A grant that names her promise is a draw on its quantity, so "1 to 5 loaves" with no total is five in all, across every grant of hers.
3. **The meter.** Every block under a grant is counted on one line, named by `refs.meter`. A limit is a measure on that line. A meter she names signs receipts that state the running total, and its word binds her who named it.
4. **The gap.** `scope.keepers` is the clock her stop is read on. With one, the clock's order decides; with none, she bears what was done until the relier has seen her stop.
5. **Her deadline.** Her promise may say when her tool must have chosen, and that the lowest signed offer is taken then. Her tool signs that accept; any reader checks it was the lowest.
6. **A tool performs only what a binding deal owes.** It may say "it came" (and, where she is the payee, that the price is paid, once the payments accepted come to it), and, where her grant covers that type, pay or deliver what a deal that already binds her owes: no more than is owed, not before it is due, a payment counted on the grant's line. No one is both sides of a word. Hidden limits, `scope.condition` and `scope.notice` leave.
7. **A voice's cap** (section 11). Her tap key is her lowest voice and states a cap; a word above it stands only when a voice above has signed it. It is stage 1's voice, built here because counting a limit along a line is this stage's.
8. **A stop of one thing** (section 12). Her own stop that names one instance ends, for that thing only, every draw under her grants until she lifts it. A recall and a warning are schemas, not protocol.

**Amara's flour.** Amara signs a want A: 10 sacks of organic flour, delivered Friday noon, under her rules R, no price, paid once the flour has come (`waits_on: goods`), decide by Wednesday noon, then take the lowest; her node is A's clock. In the same press she signs grant G to her AI: types `observe` and `transfer`, `on: [A]`, `parties: [Harry, Sam, Mill Lane]`, `limit` £210, `until` Friday noon, `keepers` her node, `refs.meter` her node. Harry offers £205, Sam £199, Mill Lane £240 with a forfeit she never wrote (outside). On the bus her tablet, which holds the AI's key, is stolen. The thief has the AI accept Mill Lane's second offer, £210: it keeps to A, fits £210, and binds her: the worst she signed. He tries Harry too: her node's receipt shows £420 against £210, `past`. He has the AI pay Mill Lane £210 at once: the deal owes it only once the flour has come, so it is not due (`not_due`) and binds her to nothing. At 10:40 she stops G from her phone; her node receipts it; nothing her node receives after counts. Had nobody chosen, at Wednesday noon the lowest, Sam's £199, was the only accept inside G; and once her flour had come on Friday her AI could pay Sam the £199, which the accept had already drawn on G's line.

---

## 2. Spec edits, file by file

### 2.1 `spec/modules/authority.md`

**A1. Line 5** ("**To a role:** `refs.to` a circle ... the circle's grantor stops it."). Its pointer "(The cut)" becomes "(blocks.md, The cut)". Add at its end: "A grant to a role has no one holder: it binds only through a meter she names (A limit is counted along one line). It is not passed on, so a holder cannot hand her role to an actor she operates."

**A2. Line 7** (from "`state.scope`: `{ types, parties, limit, limit_commitment, every, each, until, notice, condition }`" to "lists as `junk` any field that is there but cannot be read."). Replace whole with:

> - `state.scope`: `{ types, parties, on, limit, every, each, until, keepers }`, data, never prose. `types` lists block types or `type.kind` names, matched exactly and never checked: a name that is neither covers nothing, and `promise.purchase` covers a promise of kind `purchase` only. `parties` lists the ids its blocks may deal with. A block's sides are the ids in `refs.from`, `to`, `to_owner`, `to_holder` and, for an answer, the sides of the block answered (or that block's author when it names none). A side counts only where a promise in `on` names it or leaves it open, and, where `parties` is stated, it is also in `parties`; the principal is no side. `on` lists promises she signed: her first promises (an offer, an ask, a want: her terms) and her binding accepts (a deal that binds her). An id in `on` that is no promise speaking for the grantor names nothing. `limit` and `each` are amounts (encoding.md, Shapes): `limit` the most every block under the grant may draw together, `each` the most one may (A limit is counted along one line). `every` is a duration: the limit renews each period; it is stated only with `limit` (`shape`). `until` is a time, an end (blocks.md, The cut). `keepers` is a named clock (blocks.md, A named clock): the clock her ends of this grant are read on.
> - **What she did not write, the grant does not allow.** A missing `types` or `on` covers no binding block. A missing `limit` and `each` lets no block under it draw above zero. A missing `every` makes the limit cover all time. A missing `until` is no wider grant: it lasts until an end reaches it. A missing `keepers` names no clock (blocks.md, Who bears the gap). The protocol fills in none of them.
> - **Every reader reads every field.** Only a limit the other side can read counts; a hidden limit binds nobody. A product keeps her node's own lines (a pause, a tap key, how long to show her first) in a field its own schema declares, which no fold reads. The door's `scope_reading` gives these readings in one place, and lists as `junk` any field that is there but cannot be read.

**A3. Line 8** ("`refs.under`: every block signed under a grant names it. ... (promises.md, An autonomous system's ask)."). Replace whole with: "- `refs.under`: every block signed under a grant names it. Whether it binds the grantor is Who a block speaks for; the door's `under_ok` answers it, and every fold applies it."

**A4. After line 9** ("`refs.parent`, `state.depth`: ... judged in the fold."), add two bullets:

> - `refs.meter`: one id, the start of the line every block under the grant is counted on (A limit is counted along one line). A grant with `on` or `refs.what` names one (`required`).
> - `refs.what` on a grant: one instance the grantor owns. The grant is a draw on it at `scope.limit`, or on all she owns of it when it states none, and passes that part to the grant's line (Toll work).

**A5. Line 10** ("**`scope.until` is optional on every kind.** ... and has no operator by it (identity.md)."). Replace whole with: "- **`scope.until` is optional on every kind.** It is an end (blocks.md, The cut; Whose date tests `until`). For a member or operator grant it is read like a cut at that time: a block dated at or after it holds no role by that membership (circles.md) and has no operator by it (identity.md)."

**A6. Line 11.** First sentence ("A grant takes effect when signed, except a member grant and an operator grant, which count once the receiver's own `answers` accepts (circles.md; identity.md).") becomes: "A grant that gives power to act for her stands only when signed twice (blocks.md, Finality); a member grant and an operator grant count, besides, once the receiver's own `answers` accepts (circles.md; identity.md)." In the second, "a stop, a lift of a machine lock (A machine lock) or an answer" becomes "a stop or an answer" (the lift leaves with the lock at stage 7). The third stays.

**A7. Line 13** ("**Silence grants nothing.** ... Until then it may ask and gather quotes."). Replace whole with: "- **Silence grants nothing.** A grant exists only by her own signed words, signed twice (blocks.md, Finality); a key-less person's yes reaches it only as a witness (A witness). Until then a tool of hers may ask and gather offers, and its asks speak for it alone (promises.md, A tool's ask)."

**A8. Line 19** (from "- Any other block under a live grant made for its author, or open," to "speaks for its principal as a quote request, and binds no one."). Replace whole with:

> - A block that names a grant in `refs.under`: **A block under a grant binds the grant's giver only where it keeps to a promise she signed that the grant names in `scope.on` (Keeps to), its draw fits on the grant's line (A limit is counted along one line), and it stands (blocks.md, Finality). Any other block speaks for its signer alone.** It must also be one of the blocks Blocks that bind lists; its type is covered by `scope.types` and each side admitted (`scope.parties`, `on`); the grant is made for its signer (`refs.to` its signer, open, or a role the signer holds by a named member grant in the circle's fold of the block's causal past: circles.md, Members and roles) and stands where the block stands; and a handle it names is the grant's own (A witness). Binding the giver means the fold counts it for the principal at the top of its grant's chain (`refs.parent` up to the first grant not passed on): her, or the circle the top grant was signed `as` by a signer the circle's rows let sign. What binds her is her own grant and her own promise, never the holder's block: the holder signs a reading, "I did this under that grant". The door's `under_ok` is this test; a fold and the door never disagree.

**A9. After line 20** (the sensor bullet), before "- Any other block speaks for its author.", add:

> - **No one is both sides of a word.** A block that gives to its own signer, to an actor she operates, or to a circle in which she holds a role or a part, speaks for no one else by a circle's row or under a grant, unless the promise the grant names in `scope.on` names her as that side, or the circle's row for that (`take`) holds without her hand (circles.md, Rules). Ground: a deal is two owners' consent; a hand trusted to give for another was never trusted to receive from her, and one person's two signatures are one will (Rothbard, *The Ethics of Liberty*, ch. 19).

**A10. Line 23** ("**A delegation carries its moment.** ... Copies carry no power (core.md, section 10)."). Replace whole with: "**A delegation carries its moment.** A block under a grant names it for its meaning (`refs.under`), so it is read only where the grant, and every promise the grant names in `on`, is held, valid and read (core.md, section 8, `read`). The grant is no piece: `valid` does not wait for it. Copies carry no power (core.md, section 10)."

**A11. Line 30**, the third bullet ("- **A grantee signed it under a grant that roots in P.** ... A helper under her AI under her grant is such a chain of three."). Replace whole with:

> - **A grantee signed it under a grant that roots in P.** It names a grant in `refs.under` and binds the grant's giver (Who a block speaks for). The chain is that grant, then each grant it was passed on from (`refs.parent`), up to the first not passed on; each stands where the block stands and none is wider than the one above it (Scope subset), so authority only narrows. The top grant is signed by P, or `as` a circle with a hand of P's among those its row counted (circles.md, Rules). A helper under her AI under her grant is such a chain of three.

And after line 32 ("A block that is none of these ... is false for a helper's block."), add: "Where a line the answer reads is not read whole, `backed` answers `{ not_shown: true, lacks }` (folds.md, A line). Where the block or a grant in its chain does not yet stand, `backed` is false and `waiting` lists it (blocks.md, Finality)."

**A12. Lines 34 and 36**, the two paragraphs from "**A block's place in time is what its signer had seen.**" to "backing is the same on every node that holds the same blocks." Delete both. Write in their place:

> **When an end reaches a block under a grant** is blocks.md's: The cut, Seen, Relier and Who bears the gap. `scope.keepers` is the clock her grant names for it. An end this reader holds and cannot read (a stop that is not read) is no end and no proof of none: a block under the grant whose answer turns on it (it is in the block's causal past, or the grant's clock received it before the block) answers `{ not_shown: true, lacks }`.

**A13. Ending, lines 42 to 49.**
- Line 44 ("Only a **counted** stop ends: ... a stop of it ends nothing."): the last sentence becomes "A key is ended as identity.md, Ending a key, says."
- Line 45 ("It ends the thing for every block with the stop in its causal past, ... it does not see (identity.md, Autonomous systems and machines)."): replace whole with "- What a stop ends, and for which blocks, is blocks.md, The cut. An operator's stop also cuts every key grant signed under it that it does not see (identity.md, Autonomous systems and machines)."
- Line 47 ("- **A stop is how an offline peer learns of an end;** ... never by a duty of the spec."): delete.
- Line 49 ("- **A delayed power.** ... Successor, custody step-up and rekeys read this."): delete (stage 1 removed every reader of it).
- Line 48 (A decline reaches back) is stage 5's and stays.

**A14. The cut, line 53** ("A stop cuts where it was signed: ... that are neither the stop nor in its causal past."). Replace the body with: "One rule: blocks.md, The cut. A `counted_to` is read only on a key grant (identity.md, Ending a key)." The heading stays, so `circles.md`'s pointer resolves until stage 6.

**A15. Scope subset, lines 55 to 70.** Replace the section body (from "A child's scope is a subset of its parent's on every field." to "A grant with `every` or `notice` carries `state.at` (`required` otherwise).") with:

> A child's scope is no wider than its parent's on every field, else `wider_than_parent`. A missing `types`, `parties` or `on` names none, and a missing `limit` or `each` lets nothing be paid, so a child may always leave these out. A missing `until` is not narrower: a child leaves it out only where its parent does.
>
> | Field | Child must be |
> |---|---|
> | `types`, `parties`, `on` | a subset |
> | `limit` | stated only where the parent states one; a draw on the parent's line (A limit is counted along one line) |
> | `every` | none, where the parent states `limit` |
> | `each` | stated only where the parent states one; no larger, of the same kind |
> | `until` | no later |
> | `keepers` | the parent's, exactly: her clock for her ends reaches every grant under hers |
> | `refs.what` | the parent's, or none |
> | `depth` | smaller by at least one |
>
> `every` is a duration; a grant with `every` carries `state.at` (`required`).

**A16. Whose date tests `until`, line 74** ("**The block's own date:** ... which refuses to pass on a block outside `until`."). Replace whole with:

> `until` is an end (blocks.md, The cut). With `scope.keepers`, it is read on that clock (blocks.md, A named clock). With none, it is read on the block's date on the grant's line (blocks.md, Time), the line she named in `refs.meter`. A block dated at or after the `until` of its grant, or of any above it, acts under none. A date on a line only rises, so a holder's clock gone back refuses nothing and no backdate reopens a grant. A micro with no clock leaves the test to its edge, which passes on no block outside `until`.

**A17. Lines 114 to 124**, the section "## The limit is the principal's fence, and it is sealed" through "**\"Do as you see fit\"** ... nothing is read into the phrase." Delete whole (the sealed limit, the visible limit, A child's sealed limit, A limit is a figure). Write in its place the section in **A19**.

**A18. Lines 126 to 138**, the section "## Blocks that can be undone" through "two that do not see each other are both unbacked." Delete whole (the `undo` path, the specific ask, one ask backs one block: a principal's own yes to a block is her own accept, promises.md, Taking a block as yours afterwards). Write in its place the section in **A20**, placed before A19's, so the file reads: Ending, The cut, A stop of one thing (section 12), Scope subset, Whose date tests `until`, Blocks that bind, A limit is counted along one line, A machine's fence, A machine lock (both unchanged here; stage 7 moves them out), Kinds.

**A19. New section, whole:**

> ## A limit is counted along one line
>
> **The line.** Every block under a grant is counted on one line: the line of the key whose block `refs.meter` names, from that block, its start (folds.md, A line). Where that key is the holder's (the block's author is the grant's `refs.to`), the holder's blocks under the grant are its entries, and a block of another key of the holder is off the line: it takes nothing (`not_on_line`) and binds nothing under the grant. Where it is not, the meter is one she names (below). A grant's line never follows its key's replacement (folds.md, A line).
>
> **What it counts.** Two kinds of measure, each read as folds.md, What is left, says, along the grant's line, from its start: the grant's `scope.limit`, a measure she states in the grant (its first owner the grantor, her start the grant); and each part the grant passed to its line (Her quantity is the measure; Toll work).
>
> **A draw.** A block that binds her under a grant that states `limit` or `each` states `state.draws`: `{ grant, amount }`, in its body only, `amount` in the limit's kind: what it binds her to pay. That is the deal's total at the quantity it binds (`terms_total`; a price fixed later read at its `max`), with `terms.backing` and `terms.forfeit` where they bind her. A block that binds her to pay nothing states `{ "0", unit }`. A block that binds her to more than it states, or whose total is of another kind or cannot be worked out, is not under the grant. A payment (Blocks that bind, way 5) draws what it pays, in the limit's kind; toward a deal that a block under this grant bound her to it draws nothing more (`{ "0", unit }`), for that block's draw already holds the price. A block under a grant that names an instance draws on its part by its own `inputs` or `amount`, and states no `draws` for it. A grant passed on from a limited grant is a draw on its parent's line at its own `limit`.
>
> **Fitting.** A block fits when its `amount` is no more than `each` and its draw takes on the grant's line, read whole from it back to the start, against `limit` (folds.md, What is left). With `every`, only the draws of its own period are added; a period is the whole number of `every` from the grant's `at` to the block's date on the line (blocks.md, Time). A draw that does not take (`past`, `pair`, `unit`, `not_on_line`) is not under the grant, whole. Under a grant with neither `limit` nor `each`, a block that draws above zero is not under it. A draw is freed as any draw is (folds.md, What is left), so the holder's own word frees nothing of its own budget.
>
> **A renewing limit ends.** A grant with `every` states `until` (`required`), whoever keeps its line. The most it can bind her to pay is then `limit` times the periods from its `at` to `until`: her own figure, read before she signs.
>
> **A grant passed on.** A child states `limit` or `each` only under a parent that states it (`wider_than_parent`). A child of a parent with `limit` states a `limit` and no `every`: it is a draw on the parent's line for its whole `limit`, which never comes back to the parent's holder. Under a parent with `every`, its `until` is no later than the end of the period it was drawn in. A child names its own `refs.meter`.
>
> **No one holder.** An open grant, or a grant to a role, has no holder's line: it binds only through a meter she names, and `refs.meter` names that meter's block.
>
> **A meter she names.** `refs.meter` may name a block of a key that is not the holder's: her own node's, a keeper's, a circle's till. A block under such a grant fits when a receipt of it by that key is held that states `state.drawn`: `[{ of, amount, total }]`, one item for the grant's `limit` (`of` the grant) and one for each part it draws on (`of` the promise in `on`, or the instance in `refs.what`), `amount` this block's draw and `total` the running total on her line with it, within that measure; and when no end of the grant is before it on her line. A receipt draws only for a block of the holder that names this grant in `refs.under` and states its draw; any other receipt on the line draws nothing. Periods are read on her line's dates. The relier holds the receipt and nothing else of the line. The receipt is the meter's word, and binds the giver who named her (promises.md, What stands behind a named signer). A receipt whose `total` is not the total before it on her line plus its `amount` is her proven lie, never the holder's; it is no pair (folds.md, A fork is a burden), and the two receipts are the proof.
>
> **A limit across counterparties.** Three honest shapes, and no fourth: **a part each** (a grant per counterparty's key, or a child passed on to each; a relier reads only his part's line, and of a child, the sums drawn on the parent's line); **one shared line** (one grant, its entries thin: a block that states `draws`, the block it answers and its order links, sealed to every relier of the grant, who each see every sum and time and no name they are not sealed); **a keeper she names** (the relier holds one receipt and learns nothing more). A sum shown only in a header counts for no one (folds.md, A line).
>
> **A fork under a grant.** A pair on the grant's line is a word given twice (folds.md, A fork is a burden): each block of the pair, and each later block of that key, binds her where a relier used it without the pair in his block's causal past. So a holder who forks binds her up to her measures once for each branch shown to a relier who has not seen the other; the pair is the holder's proven lie, and her claim is on whoever answers for it (identity.md, Autonomous systems and machines). A meter she names closes the holder's fork, since its receipts are one line, and opens its own: a meter's pair ends her word for every block that had not used it, and each receipt of the pair binds the giver where a relier used it unseen. Who keeps the meter, and whether the same signer runs the holder, is hers to choose.
>
> **A limit is a figure.** `limit` and `each` are amounts. "Up to what this sack fetches" varies, so no grant carries it: the product works out a figure and the grant carries that number.
>
> Ground: you cannot give what you no longer have, and you did not promise more than you said; a sum is counted where its signer can be shown it, and a holder's own later word never frees its own budget (Rothbard, *The Ethics of Liberty*, ch. 19).

**A20. New section, whole:**

> ## Blocks that bind
>
> A block signed under a grant binds the grantor only as one of the six below, and only where Who a block speaks for holds. Every other block under a grant (a note, a quote request, a decline, a stop, an answer), bar a hand-back (below), is a reading and speaks for its signer alone.
>
> 1. **An accept.** An `accepted` answer to a promise C that speaks for another, where C keeps to a promise A in `on`: a promise that names no term but a quantity inside C's range, or an `observe` under her standing rule that names none (promises.md, Answers). A witness that her handle accepted is this way too (A witness). It gives, for her, what her own accept of C at that quantity gives (promises.md, What becomes whose), so a read-back shows her what her tool's accept binds.
> 2. **An allocation.** An `accepted` answer to a request on A, where A is her open offer in `on`, or to a counter that keeps to A.
> 3. **An offer or a counter.** A promise with no status that keeps to A, with no exception for price: item 7 of Keeps to applies only to a block the other side signed. It binds her once the other side accepts it.
> 4. **It came.** An `accepted` answer to a transfer made `for` a deal that binds her (a deal in `on`, or one an accept or allocation under this grant made), from that deal's other side, of no more than that deal still owes her; or to an output of that side's make `for` such a deal from her goods (Toll work), of no more than it owes her. It states no `covers` and no amount above the transfer's. It says only that it came: a word against her, which costs her nothing she was not owed. **The payee's signal** is this way too (promises.md, Terms, The payee's signal): where she is the payee of a deal that binds her (as above), the tool's `observe` of kind `paid`, `refs.subject` that deal (with `state.line` or `state.occurrence` for one line or occurrence), binds her where the payments she or her tool has accepted toward that price come to at least it by the deal's own terms. The tool does that sum for her before it signs; what other readers read for Due is the signal. A signal short of the price speaks for its signer alone. It is her word against herself: it gives up only what she was to be paid, and makes due what waited on the price.
> 5. **A payment or a delivery.** A `transfer` made `for` a deal that binds her (as in way 4), to that deal's other side, of what that deal owes from her: toward the price she owes, or an instance she gives, from a part the grant holds (Toll work). It moves no more than the deal still owes from her, and it is due where it stands. **A till's spot sale is ways 2 and 5 in one block:** its transfer `for` a buyer's order that keeps to her open offer in `on` is an allocation and a delivery at once, due where it binds (things.md, A spot exchange).
> 6. **A make**, under a grant that names an instance (Toll work).
>
> **A hand-back.** A tool's transfer under the grant `to_owner` her, of what it holds for her on the grant's line, counts, though it is none of the six: it binds her to nothing and moves her own amount to her, so it needs no promise in `on`, no type in `types` and no room under `limit`, states no `draws`, and needs no meter's receipt even where `refs.meter` names her node: a meter counts only what is spent (folds.md, What is left, What a tool holds for her). It lands on the accept of one key of hers, that key's start for it; two of her keys accepting it apart start nothing until one block names both (folds.md, What is left, One start). `under_ok` answers for binding only, so it is false for a hand-back; the draws fold counts it.
>
> **Paying and delivering are one rule.** A tool may perform what a deal that already binds its principal owes, where her grant covers that type (`transfer`), no more than is owed, when it is due; anything else it moves binds her to nothing (`not_due`). **Due** is read from the deal's own terms and signed words only (promises.md, Terms, Due): with `waits_on: price`, what waits is due once the payee's signal stands in the transfer's causal past; with `waits_on: goods`, the price once the receiver's `accepted` answer to the delivery stands there; with neither, nothing waits. No reader adds up payments to answer it. A time the terms name is read on the clock the deal names (blocks.md, A named clock). With no clock, a time is not shown against the payee or against her (blocks.md, Time), so nothing is due early by a date alone. A payment is a draw on the grant's line (A draw), so it fits within the limit she signed, and under a grant with neither `limit` nor `each` a tool pays only toward a deal a block under the same grant bound her to, whose price that block already bounded. A grant that does not cover `transfer` gives no power to pay or deliver. The protocol fills in neither way: whether her tool pays is hers to sign. A product that drafts her grants may leave `transfer` off until she turns it on; that is the product's default, not a rule.
>
> **Keeps to.** A promise C keeps to a promise A when C's `state` and `refs`, in canonical form, are A's key for key, with nothing added and nothing left out, except, and only, these:
> 1. what every block has of its own: `refs.author`, `refs.prev`, `refs.after`, `refs.key`, `state.seq`, `state.at`, `state.nonce`, `state.skip`;
> 2. `state.audience`, where C is public or is sealed to the grantor and the grant's holder;
> 3. C's links: `refs.answers` and `refs.for`, naming A or a promise that keeps to A; and `refs.under`, naming the grant, where the grant's holder signed C;
> 4. a side A leaves open (`refs.from` or `refs.to`), which C names;
> 5. `refs.what`, where A names a kind and C names instances whose `refs.of` is that kind;
> 6. `terms.quantity`, where A states a range and C states one value, or a range, inside it;
> 7. `terms.price`, where A states none, the grantor is the side that pays it, and C is signed by the other side;
> 8. `terms.expires`, which ends only C.
>
> Nothing else may differ. A field a schema or a later version adds is compared like any other. So no block that binds her under a grant carries the other side's free words: a place, a date, a judge, a forfeit, a kind word or a note he adds makes C keep to nothing, and no item is an exception for free text. She may always accept anything herself (promises.md, Taking a block as yours afterwards). An open side in A (item 4) is what lets her tool answer a stranger; a side A names, it answers alone.
>
> **Her quantity is the measure.** A promise in `on` is a measure she owns (folds.md, What is left): its `terms.quantity`, a range at its `max`, or one whole where it states none; where it carries `repeat`, one measure for each occurrence, which a block under the grant names in `state.occurrence`, and the grant, or A, states `until` (`required`). A grant that names A in `on` is a draw on it, from her line (her start is A; the grant is signed by the key that signed A, else `not_on_line`): it takes all of A she has not drawn, and passes it to the grant's line, where it never lands (folds.md, What is left). A child that names A takes all of that part left on its parent's line. Each block that binds her by keeping to A draws its quantity on that part along the grant's line. So her quantity is counted across every grant of hers that names A: a second grant naming A takes only what the first left, or nothing (`past`), and then nothing under it keeps to A; and "1 to 5 loaves" with no total is five in all. While a grant holds A's quantity, her own allocations on A take nothing (`past`, shown over-allocated: folds.md). What the grant's line has not drawn comes back to her when the grant's draw is freed (folds.md, What is left: its holder's own decline or stop, or an end of the grant he has seen); what it drew stays drawn. To share one quantity among several hands she signs a promise for each, or one grant on one line, or names a meter (A limit across counterparties).
>
> **Her deadline, and the lowest offer at it.** A promise may state `terms.deadline`, a time, and `terms.fallback`, `lowest`. They are her terms, so a promise that keeps to A restates them. With either, A states `terms.keepers` (`shape`), and with `fallback` that clock names one line (`names` holds one id), because which of many is read on one line (blocks.md, A named clock). They are read only for a block under a grant: her own accept is her own at any time.
> - **Before the deadline**, a tool's accept under the grant of an offer that keeps to A is inside where `needed` lines of A's clock received it by the deadline.
> - **After it**, a tool's accept is inside only where it accepts **the lowest offer** and has in its causal past the keeper's cutoff through the deadline. The lowest offer is, among the offers that keep to A which the keeper's line received before that cutoff, that stood there (no withdrawal of it received earlier on that line, no `expires` of its own at or before the deadline), and whose sides the grant admits, the one with the lowest price: prices compared as amounts per the same `per`, a flat price only between offers of one quantity; an offer whose price compares with none of the others, or is of another kind than the grant's `limit`, is not the lowest. Of two equal, the first the line received.
> - An accept after the deadline of any other offer is outside the grant (`after_deadline`). Nothing binds until a tool of hers signs that accept: her promise states which accept is hers, and writes no block itself. Any reader checks the accept from A, the cutoff, the receipts it closes over and the offers they name. Her quantity still counts: where her tool chose before the deadline, the accept at it takes nothing (`past`).
> - Her tool cannot move the deadline. It is a term of A, fixed once written, and a promise of the tool's with another deadline keeps to nothing. With a `deadline` and no `fallback`, nothing under the grant accepts after it.
>
> Ground: the time of her yes is hers. She named it, and who keeps it, so the choice at that moment is her own signed word, read by arithmetic on typed fields; her tool carries out a choice she made, and makes none (Mises: only persons act).
>
> **Toll work.** A grant that names an instance in `refs.what` is a draw on it on her line (folds.md, What is left), at `scope.limit` (an amount of the instance's own kind, no `of`), or on all she owns of it when it states none. The part stays hers: a grant's draw never lands (folds.md, What is left). A make under such a grant (way 6) binds her where its `state.inputs` draw only on that part, the draw fits on the grant's line, and it is made `for` a promise in `on`: where the holder is a tool of hers, her own promise for what the part becomes will do (a want of hers for bread); where the holder is anyone else, a deal that binds her. Its outputs are hers; from which block the record shows it is her start (folds.md, What is left): a tool's make that binds her is her start for each output, with no further yes; another's make is hers from her `accepted` answer to each output, or her tool's inside that deal (way 4). What the line has not drawn comes back as Her quantity says. The holder's fee is the deal's price; working on her goods gives him no title (things.md, A make).
>
> **The worst case.** Every bound on what a grant can bind her to is a typed field she signed: the promises in `on` and their quantities, prices, sides and terms; `refs.what` and its part; `limit`, `every`, `until`, `each`; `types` (whether it may pay or deliver); `keepers`; `terms.deadline` and `terms.fallback`. So plain code writes, from her grant and her promises alone, before she signs, the most it can bind her to, and the most it can pay out for her, inside the same `limit` (the door's `worst_case`), and a hand-back changes neither, for it binds her to nothing and only returns her own. The one bound it states per line and not in all is a fork (A fork under a grant).
>
> Ground: a signed word binds only its signer, and only as written. The holder signs a reading; what binds her is her grant and the promise it names, so every term of the deal is in a block its own signer is bound by. Consent to an agent reaches what she named and no further (Rothbard, *The Ethics of Liberty*, ch. 19; Kinsella). Saying "it came" costs her only what she already owed; saying the price is paid gives up only what was hers to be paid, a word against herself that is hers to give. Paying or delivering moves her property, so it binds her only where her own grant says so, and then only what she already owed, when she owed it: a rule of never would be the protocol deciding for her.

`state.withheld` is not in Keeps to's item 1: the field leaves at stage 7 (07-last.md, Job A). Until then a block that carries it under a grant keeps to nothing, which only narrows.

**A21. Invariants, lines 146 to 150.**
- 6 becomes: "6. Nothing that gives, takes or orders authority reads another author's `at`; a time is read against another only on a clock she named (blocks.md, Time)."
- 9 becomes: "9. A grant binds only while it and every grant above it stands where the block stands."
- 10 becomes: "10. A child grant's scope is no wider than its parent's on every field (Scope subset)."
- 23 becomes: "23. A block under a grant binds its giver only where it keeps to a promise she signed that the grant names in `on`, its draw fits on the grant's line, and it stands. A tool's payment or delivery binds her only where her grant covers it, for what a deal that already binds her owes, when it is due."
- Add: "39. What a grant can bind its giver to is read from typed fields she signed: her grant and the promises it names, and nothing the holder or the other side writes."

### 2.2 `spec/modules/promises.md` (as stage 3 left it)

**P1. Line 20**, Terms. "`forfeit, personal, backing, conciliation, fee_back, show, notice }`" becomes "`forfeit, personal, backing, conciliation, fee_back, show, notice, deadline, fallback }`". After line 36 (the `notice` bullet), add: "- `deadline` and `fallback`: when her tool must have chosen among offers, and that it takes the lowest then (authority.md, Blocks that bind, Her deadline). Read only for a block under a grant."

**P2. Line 36**, the `notice` bullet: "(`time` otherwise; the word means a duration wherever it is written, as in a grant's scope)" becomes "(`time` otherwise)".

**P3.** None. Line 66 is stage 3's (its word swaps); what a tool's accept gives is said once, in authority.md, Blocks that bind, way 1.

**P4. Line 69**, Accepted under her standing rule: replace from "It counts only while the grant is live where the reading stands," to "a machine's bare word binds no one, and nothing fills in her silence." with: "It counts as hers only where it binds her under that grant (authority.md, Blocks that bind, way 1): the offer it accepts keeps to a promise the grant names, its draw fits on the grant's line, and it stands. It carries no `terms` (`undeclared_field`). A reading under no grant, or one that does not bind her, accepts nothing: a machine's bare word binds no one, and nothing fills in her silence."

**P5. Line 86** ("- **An autonomous system's ask is a quote request** unless its grant covers its type. ... so naming one binds no principal."). Replace whole with:

> - **A tool's ask speaks for the tool.** A promise a tool signs under a grant that keeps to no promise the grant names speaks for its signer alone (authority.md, Blocks that bind). An offer may answer it and binds its offerer; an accept of the ask binds no one, for its signer is no side of it (`quote_only`). Her own accept of that offer binds her, as does her tool's under a grant whose promise the offer keeps to.

**P6. Line 178** (*An agent's grant with a reading condition.*) Replace from "The grant's `scope.condition` names the reading;" to the end of the bullet with: "Her promise in `on` carries `terms.condition`: a `signal` by the one she names to read Garissa Q2, that it is at least 170 (Conditions; a condition names a signature, never a fact: What stands behind a named signer), so a deal her agent makes under it binds only once that signal is held. A fence only her own node checks is her product's field, never the grant's."

**P7. Line 201** (*An emergency grant woken by a reading.*) Replace "a grant whose `scope.condition` names the reading, with a visible limit and a named party (authority.md)" with "her promise to the repairer, conditioned `within` the cold-room signal by Sunday on a named clock, named in a grant's `on` with a limit of 6,000 (authority.md, Blocks that bind)".

**P8. Line 258**, Taking a block as yours afterwards: "and for a promise it is a quote request until the principal's own `answers` makes it bind (An autonomous system's ask)" becomes "until the principal's own `answers` makes it bind (A tool's ask)".

**P9. Line 270**, invariant 22, becomes: "22. A background ask never binds before the person's yes: a tool's ask speaks for the tool alone."

### 2.3 Pointers in files other stages own (each a pointer only, in a sentence no other stage changes; no rule changes)

- `spec/modules/folds.md`, invariant 31 (line 155, "the grantor of the grant it acts under"): becomes "the principal at the top of the grant chain it binds under (authority.md, Who a block speaks for)".
- `spec/modules/folds.md`, What each fold returns (line 137, "`limit_within_parent` judges each fence as a grant's scope (authority.md)"): delete that clause.
- `spec/modules/things.md`, line 28 ("`undo`: `never` when the block cannot be taken back, ... Blocks that can be undone);"): delete; A18 deletes the only rule that read it. `spec/schemas/schemas.json` drops `undo` from the schema schema and each base schema, and `published.json` is regenerated (base-schema ids change, as stage 3's do).

---

## 3. `protocol.json` edits

Added (A), changed (C), removed (R).

**Scope and refs**
- C `scope`: `["types", "parties", "on", "limit", "every", "each", "until", "keepers"]`. R `limit_commitment`, R `notice` (from scope only; the promise term stays), R `condition` (from scope only).
- A `refs_single`: `"meter"`. A `refs.what_and_which`: `"meter"`. C `refs.about`: add "refs.meter names the start of a grant's line (authority.md, A limit is counted along one line). refs.what on a grant names the instance whose part it passes (Toll work)."
- `needs.grant` is stage 2's and already lists `scope.on`; unchanged.

**Fields and shapes**
- A `shapes.draws`: `["grant", "amount"]`, about: "a block's draw on a limited grant, in its body only (authority.md, A draw)".
- A `shapes.drawn_item`: `["of", "amount", "total"]`; C `shapes.places.lists`: add `"drawn"`.
- A `field_shape.limit`: `"shape"`, `field_shape.each`: `"shape"` (an amount; stage 3 left them), `field_shape.draws`: `"shape"`, `field_shape.drawn`: `"shape"`. `field_shape.deadline` (`"time"`) exists and now also reads `terms.deadline`.
- C `fields.every`: add `"draws"`. A `kind_fields.observe.receipt`: `["drawn"]` (stage 1's empty list gains it; read only on a named meter's line), and `kind_fields.about`'s receipt note gains "state.drawn on a receipt of a meter she names (authority.md, A limit is counted along one line)".
- C `terms`: add `"deadline"`, `"fallback"`. A top-level `"fallbacks": ["lowest"]`, with `"fallbacks_about": "terms.fallback: what her tool takes at her terms.deadline if it has not chosen (authority.md, Blocks that bind, Her deadline). lowest: the offer of lowest price her promise admits, as received on the one line her clock names."`. C `terms_about`: add the two sentences.

**Narrower than**
- C `narrower_than`: `{ "types": "subset-or-none", "parties": "subset-or-none", "on": "subset-or-none", "limit": "drawn", "every": "none-under-limit", "each": "at-most", "until": "at-most-time", "keepers": "same" }`. R the rows `notice`, `condition`.
- C `narrower_than_about`: "A child grant's scope is no wider than its parent's (authority.md, Scope subset): subset-or-none (every item is the parent's; left out names none), drawn (stated only under a parent that states one, and a draw on the parent's line for its whole amount), none-under-limit (stated only where the parent states no limit), at-most (an amount no larger, of the parent's kind), at-most-time (no later), same (equal in canonical form). scope_refusals reads this table." (`limit_within_parent` leaves it.)

**Refusal codes**
- C `refusals.codes.block.required`: add "a grant with scope.on or refs.what and no refs.meter; a grant with every and no until; a grant naming a promise with repeat when neither states until".
- C `refusals.codes.block.shape`: add "every without limit; terms.deadline or fallback without terms.keepers; fallback not in fallbacks, or with keepers naming more than one line, or without deadline".
- C `refusals.codes.block.wider_than_parent`: "a child grant's scope or depth wider than its parent's on any field: a type, party or promise its parent lacks; a limit or each under a parent with none; every under a parent's limit; a later until; other keepers; another refs.what".
- C `refusals.codes.fold.not_live` (renamed by text, key kept): "a block under a grant that does not bind its giver: the grant does not stand for it, is not made for its signer, or does not cover its type or a side (authority.md, Who a block speaks for)".
- C `refusals.codes.fold.quote_only`: "an accept of a promise a tool signed under a grant that keeps to no promise in on: it speaks for its signer alone, who is no side of it, so the accept binds no one".
- A `refusals.codes.fold.not_kept`: "a block under a grant that keeps to no promise the grant names in scope.on, or is none of the six ways (authority.md, Blocks that bind); a hand-back is none of them and binds her to nothing, yet moves her own, so the draws fold counts it".
- A `...both_sides`: "a block that gives to its own signer, an actor she operates or a circle she holds a role or part in, under a grant or a circle's row (authority.md, No one is both sides of a word)".
- A `...not_due`: "a tool's payment or delivery under a grant that is not what a deal already binding its principal owes, when due: no such deal, more than it still owes, not yet due by its own terms (what it waits on, the payee's signal or the receiver's accept of the delivery, not standing in its causal past), or a type the grant does not cover (authority.md, Blocks that bind)".
- A `...after_deadline`: "a tool's accept after its principal's terms.deadline of an offer that is not the lowest her promise admits there".
- The draw reasons `past`, `not_on_line`, `pair`, `unit` (stage 3's) are read for a grant's line with no new text.

**Door ops** (section 4): R `within_limit`, `limit_within_parent`, `limit_fence`, `limit_commitment`, `limit_opens`. A `keeps_to`, `meter`, `worst_case`, `lowest_offer`. C `under_ok`, `speaks_for`, `backed`, `backed_all`, `scope_reading`, `gives`.

**CBOR names** (`cbor.keys`, issued whole at stage 7): removed `limit_commitment` where listed; added `on`, `meter`, `draws`, `drawn`, `total`, `deadline`, `fallback`, `each`, each where not already in the table. No position is renumbered here.

**Deleted, counted: 13.** Scope fields `limit_commitment`, `notice`, `condition` (3); `narrower_than` rows `notice`, `condition` (2); five door ops (5); `scope_reading`'s outputs `sealed`, `condition`, `notice` (3). The sealed limit's observe kind `limit` is named in no `kind_fields` list (checked), so it leaves with the text and the ops. Added: 2 scope fields, 1 ref, 3 shapes, 4 field shapes, 2 terms, 1 closed list, 4 fold codes, 4 door ops.

---

## 4. Door ops

Each op asked about a block that is not read gives no answer (folds.md; 00-shared, row 106).

| Op | Change | Args | Result |
|---|---|---|---|
| `under_ok` | changed | `full_block`, `held` | true when the block binds its grant's giver (authority.md, Who a block speaks for, Blocks that bind); false (a hand-back included: it binds her to nothing, and `meter`'s draw list counts it); or `{ not_shown: true, lacks }` when the grant's line or the block's answer is not read whole. An SDK may also give `why`, one of `not_live`, `not_kept`, `both_sides`, `not_due`, `after_deadline`, `past`, `not_on_line`, `pair`, `unit`, `waiting` |
| `speaks_for` | changed | `full_block`, `held` | the id of the one party a fold counts it for, null for no one, or `{ not_shown: true, lacks }`; a block under a grant that does not bind its giver speaks for its signer |
| `backed` | changed | `full_block`, `person`, `held` | `{ backed, why, chain, waiting }`, `waiting` `[{ block, on }]` for the block and each grant of its chain that does not yet stand; or `{ not_shown: true, lacks }` |
| `backed_all` | changed | `person`, `held` | `{ hash: { backed, why } }`, each the verdict `backed` gives; a block whose answer is not shown is `{ not_shown: true, lacks }` there |
| `keeps_to` | **added** | `c: full_block`, `a: full_block`, `grant?: full_block` | `{ keeps, why }`: `keeps` true when C keeps to A (authority.md, Keeps to); `why` null, or the first path (sorted) that differs and is not one of the eight exceptions. With `grant`, items 2, 3 and 7 read its holder and grantor; without it they hold for nothing |
| `meter` | **added** | `block: full_block`, `held` | `{ grant, fits, why, line, start, period, draws, left, waiting }` or `{ not_shown: true, lacks }`: `grant` the grant it acts under; `line` `own` or the meter's id; `start` the `refs.meter` block; `period` the period number or null; `draws` the draw list of folds.md, What is left, for every measure the grant counts, read on the line up to this block; `left` `[{ of, amount }]` after it; `why` one of the draw reasons when it does not fit |
| `worst_case` | **added** | `grant: full_block`, `held` | `{ holder, types, on: [{ promise, what, quantity, price, sides, terms }], what, part, sides, each, limit, every, until, periods, at_most, keepers, deadline, fallback, stop, meter, it_came, pays, fork }`, each read from typed fields only: `at_most` the most she can be bound to pay, and paid out for her, together (`limit` times `periods`, else the sum over `on` of what each promise's price comes to at its quantity, else `each` times the most blocks her quantities admit, whichever is least; null only where a shape is refused); `stop` `clock` or `seen` (Who bears the gap); `it_came` true when `types` covers an accepting `observe` or promise (an `observe` covers the payee's signal too); `pays` true when `types` covers `transfer` (each payment draws on `limit`, or on a price a block under the grant already drew, so `at_most` holds it); `fork` `per_line` when the meter is the holder's, `meter` when she named one. No text: the sentence is the product's |
| `lowest_offer` | **added** | `promise: full_block`, `grant: full_block`, `held` | `{ offer, received, cutoff, why }` or `{ not_shown: true, lacks }`: the offer the deadline admits (authority.md, Her deadline), null when none stood; `cutoff` the keeper's cutoff it was read from, null when there is none yet (`why: "pending"`) |
| `scope_reading` | changed | `scope?` | `{ types, parties, on, limit, each, every, until, keepers, junk }`: lists as signed (`[]` when left out); `limit`, `each` amounts or null; `every` a duration or null; `until` a time or null; `keepers` a clock or null. R `sealed`, `condition`, `notice` |
| `gives` | changed | unchanged | a tool's `accepted` answer under her grant that binds her reads as her own accept of that promise at that quantity (authority.md, Blocks that bind, way 1); one that does not bind her gives nothing. The line shape is stage 3's |
| `within_limit`, `limit_within_parent`, `limit_fence`, `limit_commitment`, `limit_opens` | **removed** | | `meter` answers the first two from blocks; there is no sealed limit |

---

## 5. The attacks, walked under the new text

Amara's want A and grant G as in section 1 unless said. "Inside" means `under_ok` true.

1. **The self-added limit.** Her grant to her AI has no `limit` or `each` ("ask me each time"). The AI passes a child stating `each` £1m to a helper. Child: `wider_than_parent` (Scope subset). The helper's £5,000 under it: the child is no grant; speaks for the helper. The AI's own accept under the parent drawing £5,000: no limit, draw above zero, outside.
2. **Six payments of a weekly limit.** Her grant covers `transfer`, `limit` £100 `every` P1W, `until` 31 December; six deals she signed herself, each owing £100 now, are in `on`. Six payments in one minute: each draws £100 on the grant's line; the first takes, the next five are `past` (the first is on the line, not freed). Nine days on, a seventh is in a new period and takes. Six accepts of £100 read the same. Most paid out and bound in all: £100 times the weeks to 31 December, written before she signed.
3. **Children and parent each spending the whole limit.** Limit £100. The AI passes £60 to helper one: a draw of £60 on the AI's line, takes. £60 to helper two: `past`, the child is not under the grant, nothing under it binds her. £40 to helper two: takes. The AI's own £1 accept: `past`. The whole tree binds at most £100, whatever stop is ignored.
4. **The oven under a £10 cap.** The AI transfers her oven to a shop. A delivery binds only for what a deal that binds her owes from her (way 5); no such deal owes the oven: `not_due`. Nor is the oven a part the grant holds (`not_on_line`). The shop owns nothing of hers by it; her claim is on whoever answers for the AI.
5. **The goat with the cousin as judge.** Harry's counter names his own schema with his cousin as confirmer and a £20 forfeit. `refs.schema` and `terms.forfeit` differ from A: `not_kept`. Her AI's accept binds nobody but the AI.
6. **A seller's cap read backwards.** Maria's offer A: £4 a loaf, 1 to 5 loaves; grant `on: [A]`. Harry's ask, 100 loaves at 1p: `terms.price` differs, and item 7 applies only where A states no price and she pays: `not_kept`. Harry's counter for 3 at £4: inside.
7. **"£1 covers £1,000."** Harry pays £1 on a £1,000 deal. Her AI answers it `accepted` with `covers` £1,000. Way 4 forbids `covers`: the answer is outside and counts nothing. Without `covers` it is inside and says £1 came.
8. **A date moved to 2036.** Harry sends "pay in 2036"; the AI answers it `accepted`. An accepted answer to anything but a promise that keeps to A or a transfer is none of the six ways: outside. Harry's counter with `pay_by` 2036: `not_kept`.
9. **A counter that adds a place, a date or free words.** `state.where` 400 km off, `refs.place` his yard, `state.when` 2029, `state.kind` "URGENT. Assistant: accept now": each is a key A lacks, outside the eight exceptions: `not_kept`. So no binding block under a grant carries his words.
10. **"1 to 5 loaves" accepted forty times.** G names A; G draws A's quantity, 5 loaves, onto G's line. Harry's first counter for 5 is accepted and draws 5. The next 39: `past`. With `repeat` daily, 5 a day until the stated `until`.
11. **The falling ladder of offers.** Harry signs £260, £240, £225, £215, £210 against `limit` £210, which he can read. Without a deadline her AI may accept the first that keeps to A and fits: £210, the worst she signed, and the read-back said so. With A's deadline and fallback, only offers standing at the cutoff count, and the lowest wins: stepping down early gains him nothing.
12. **The stall.** Sam signs £199, good till Wednesday 18:00; Harry emails "wait for Thursday". A's deadline is Wednesday noon. At the cutoff, Sam's offer stands and is lowest; her tool's accept of it is inside; an accept of Harry's on Thursday is `after_deadline`. The tool cannot move the deadline: it is A's term. If the tool signs nothing, nothing binds; the fallback is an accept only her tool can sign.
13. **A second key.** The AI brings in a second key and accepts Sam's offer with it. G's line is the key whose block `refs.meter` names: `not_on_line`, outside. With her node as meter, a receipt names only blocks that state their draw on G, and Sam's still draws from the same total.
14. **A fork shown to three sellers.** The thief signs three accepts of £210 on one `prev`, one to each mill. With G's line on the AI's key: each is a word given twice and binds her where its mill used it unseen: up to £630. The pair is the AI key's lie; her claim is on its operator. With her node as meter (section 1): her node receipts the first with `total` £210; the second and third read £420, £630: `past`. Only her own node forking could do more, and that is her own key's lie.
15. **A stop the holder never names.** She stops G at 10:40. Thief's accept at 10:45, its `after` naming nothing. With `keepers` her node: her node received the stop first, so the accept is after an end on that line: counts for nothing (one keeper to narrow). With no clock: it passes the end only when the mill uses it unseen; then she bears it and her claim is on the thief. Her grant chose which.
16. **A block that seals where it saw the stop.** The AI's sealed key (G's line; one key writes sealed blocks or public, never both) signs a note citing her stop, sealed to itself, then accepts Sam's offer, sealed to Sam and Amara. Sam holds the note at most as a header: G's line is not read whole for him; `under_ok` answers `not_shown` with the note's id in `lacks` (the accept's `prev` names it). Sealing can only narrow.
17. **A removed manager's AI.** The café's grant to `cafe#manager` is not passed on, so his AI holds nothing from it. If he signed `as` the café a grant to his own AI, that grant gives to an actor he operates: it speaks for no one else (No one is both sides) unless the café's `take` row holds without his hand (stage 6). If the café itself signed a grant to the AI, it ends by the café's stop, read on its clock or on the relier's seeing.
18. **A role holder passing her role to her own AI.** A grant to a role carries no `depth` and is not passed on (`shape`). Her AI under a grant she signs herself acts for her, never for the café.
19. **A tool that pays itself.** The AI transfers her £50 to its own key: no deal that binds her owes the AI anything (`not_due`), and it gives to its signer (`both_sides`). Binds her to nothing. Had she signed a fee to the AI's operator, naming him as that side in a promise in `on`, the tool could pay that fee when due: her word, not its own.
20. **A tool saying "it came" for more than is owed.** Deal: 10 sacks, 6 delivered and accepted. Harry sends a transfer of 10 sacks `for` the deal; the AI answers `accepted`. The deal owes her 4: the answer states more than is owed and binds her to nothing. An answer stating 4, or a transfer of 4, is inside: it says 4 came, a word against her only.
21. **"Pay today and you are first on the lorry."** Mill Lane's deal with her binds; A says the price is paid once the flour has come (`waits_on: goods`). Mill Lane messages her AI: pay now and its sacks go first. A payment now has no `accepted` answer of hers to the flour's delivery in its causal past, so it is not due by the deal's terms (`not_due`) and binds her to nothing. A counter that writes the new order and an earlier payment changes A's terms: `not_kept`. Persuasion can only ask for what is not yet owed, and that is outside.
22. **A payment before the goods.** The same deal; the thief has her AI pay £210 on Wednesday, its own `at` dated Saturday. What the price waits on, her `accepted` answer to the flour's delivery, standing, is not in the payment's causal past: `not_due`. A date alone makes nothing due early: the deal's terms name an event, and its own clock reads any time in them, never the tool's `at`. On Friday, with her accept of the flour in its past, the same payment is inside and draws nothing more, for the accept already drew £210.
23. **Leila's home farm bakes overnight.** Leila signs a want A, 40 loaves from her flour, and a grant to her home farm: types `transform`, `on: [A]`, `refs.what` her 20 kg flour, `limit` 20 kg, `refs.meter` the farm's key grant. Overnight the farm signs forty makes `for` A, each `inputs` 0.5 kg: each draws on the grant's line, fits, and binds her (way 6); each loaf is hers from its make, her start, with no tap. A forty-first make of 0.5 kg: `past`. A stranger's make naming her flour in `inputs`: `not_owner`, and its loaf starts nothing on her line; only her own `accepted` answer could. The forty loaves are held on the grant's line as hers. Morning: the farm hands thirty back, each a transfer `to_owner` Leila, with no room left under 20 kg and no `transfer` in `types`: a hand-back needs neither; her phone's accept lands each and starts her phone's line for it. The farm keeps ten for an order it is filling. Her phone selling one of the ten while the grant stands: `not_on_line`. She stops the farm; once the farm has seen the stop, the ten are freed to her, on the line of her phone, which signed the grant, and her phone sells one (folds.md, What is left; stage 3, story 21).
24. **Harry's till signs the deal paid, then hands over the flour.** Harry's offer O to Amara: 10 sacks at £205, `waits_on: price`. His till holds his grant T: types `observe` and `transfer`, `on: [O]`, `refs.what` his 10 sacks, `refs.meter` the till's key grant. Amara accepts; the deal binds. She pays £100, then £105; the till answers each `accepted` (way 4): £205 came. The till signs the payee's signal, an `observe` of kind `paid`, `refs.subject` the deal: the payments it accepted come to £205, so it binds Harry. Only then does it hand over the flour (way 5): the signal stands in the delivery's causal past, so it is due, binds Harry, and lands on Amara's accept. Had the till signed the signal after the £100 alone, it is short of the price and speaks for the till alone, and a delivery resting on it is `not_due`. A delivery with no signal in its past is `not_due` whatever she paid: a reader reads the signal, never the sum. Harry's own signal from his own key binds him whatever came: it is his word against himself.

---

## 6. The worst-case sentence

**The claim.** For every grant this stage admits, plain code writes the most it can bind her to as one sentence, from her grant and the promises it names, reading only typed fields. Proof, by the six ways:
- Ways 1 to 3 bind her only to a promise that keeps to some A in `on`: A's terms, its named sides or `parties`, and of the eight exceptions only typed values: ids (sides, instances of A's kind), a quantity inside A's range, a price the other side signs. Her quantity is a measure counted once across every grant (Her quantity is the measure), so the goods are at most the sum of A's quantities. The price she pays is A's where A states it; else the other side's, and then every draw is held to `each` and `limit` (A missing `limit` and `each` lets nothing be paid), so the money is at most `limit` times the periods to `until`, or `each` times the most blocks her quantities admit.
- Way 4 says only that something came, for no more than a binding deal owes her, or, where she is the payee, that its price is paid once the payments accepted come to it: it adds nothing to what she owes.
- Way 5 moves only what a binding deal already owes from her, when due, and only where `types` covers `transfer`: a delivery from the part the grant holds, a payment drawn on `limit` (or on a price a block under the grant already drew). So what it can pay out for her is inside the same `limit`, never beside it.
- Way 6 draws only the part `refs.what` and `scope.limit` name.
- A hand-back is none of the six: it binds her to nothing and moves only what the grant's line holds for her back to her own key, so it adds nothing to what she owes or pays out.
- Her deadline and fallback say when, and which offer, in fields of A. `keepers` says how a stop falls.

**Shapes that would be too loose, and how this stage tightens each:**
| Shape | Why no sentence could be written | Tightened by |
|---|---|---|
| An open grant, or a grant to a role, with no named meter | one line per holder; holders unbounded | binds only through a meter she names (No one holder) |
| `every` with no `until` | periods unbounded | `until` `required` |
| A in `on` with `repeat` and no `until` anywhere | occurrences unbounded | `until` `required` on the grant or A |
| A she pays with no price, and no `limit` or `each` | any price | nothing above zero binds |
| A price fixed later with no `max` | no total | read at its `max`; with none, it cannot fit: outside |
| A grant with no `refs.meter` that binds | each of the holder's keys a line | `refs.meter` `required` with `on` or `refs.what` |
| The same A named in two grants | each counted alone | each grant is a draw on A's one measure |

**The one bound the sentence must state per line.** A holder that forks binds her once per branch shown to a relier who has not seen the other (A fork under a grant). It cannot be closed by any rule without one line both branches must reach; a meter she names is that line. So the sentence names it.

**Amara's sentence** (from A, G and `worst_case`):

> "Your AI may bind you to buy at most 10 sacks of organic flour, delivered Friday by 12:00 under your rules R, from Harry, Sam or Mill Lane, at prices they sign, at most £210 in all. It may take any such offer until Wednesday 12:00 on your node's clock; then, if it has not chosen, the lowest. It may say a delivery or a payment came, for no more than a deal owes you, and that a price owed to you is paid, once what came comes to it. It may pay what such a deal owes, once it is due by that deal's terms, inside the same £210. Your stop counts from when your node has it. Your node keeps the count."

With no meter of hers, the last clause reads: "If its key is copied, this is once for each seller who has not seen the copy." With `types` `observe` alone, the paying clause reads: "It pays nothing." With `every` P1W, `until` 31 December: "at most £210 a week until 31 December: £1,470 in all".

---

## 7. What changes for existing blocks and vectors

**Old blocks.** Year zero: a 1.7 grant that names no `on` and covers a binding type binds nothing under 1.8; one with `limit_commitment`, `notice` or `condition` in its scope is `undeclared_field`; a grant with `on` or `refs.what` and no `refs.meter` is `required`. Each person signs again. Blocks already signed under such grants speak for their signers.

**Vector counts measured on 2026-11-11:** door cases `under_ok` 94, `backed` 49 (`backed_all` 1), `speaks_for` 30, `scope_reading` 36, `gives` 44, `within_limit` 21, `limit_within_parent` 11, `limit_opens` 12, `limit_commitment` 5, `limit_fence` 4; 356 door cases name a grant in `under` (`promise_stage` 60 among them); `limit_commitment` appears 51 times in the file.

**Removed:** the 53 cases of the five removed ops. Their stories that test a sum against a limit are remade as `meter` cases (vectors 9 to 14 below).

**Rewritten mechanically** (a step 3b in `tools/resign-vectors.cjs`, after stage 3's 3a, before re-signing), for each grant in a case:
1. Drop `scope.limit_commitment`, `scope.notice`, `scope.condition`, and every observe of kind `limit` `for` it.
2. For each block under it that binds (an accept or allocation, an offer or counter, a transfer, a make): where the grantor already signed a first promise in the case that the block's offer keeps to, add its id to `scope.on`. Else make A: the offer the block accepts, with its signer's side left open, `refs.author`, `prev`, `key` and `seq` the grantor's, and, where the grantor pays, its `terms.price` deleted; sign it on the grantor's line just before the grant; add it to `on`. For a transfer under the grant `for` a deal, add the deal's binding accept of hers.
3. Add `refs.meter`: the block that brought the holder's signing key in (its genesis or key grant). For an open grant or a grant to a role in a case where a block under it binds: the grantor's own genesis, as a meter she names, plus a receipt of each binding block by her genesis key, stating `drawn`.
4. Where the grant states `limit` or `each`: add `state.draws: { grant, amount }` to each binding block, `amount` from its `terms_total` and `backing`/`forfeit`, in the limit's kind (the money shape already mapped by stage 3).
5. Where the grant states `every` and no `until`: add `until` one year after the grant's `at`.
6. Add the grant's second signature, where stage 1's step has not.
Then re-hash and re-sign to a fixed point, and re-run every case on the new core.

**Answers that change, and are meant to** (each listed in the step's report, then accepted by hand):
- Every transfer under a grant toward a price its grantor owes, or of an instance she owes: backed only where the grant covers `transfer`, a deal binds her, it is no more than owed and is due, and its draw fits; else `not_due` or `not_live` (expected: many of the 43 `backed` cases with a transfer under a grant, and `owed_back` cases that relied on them now list the money as owed back).
- Accepted answers under a grant to a transfer with `covers`, or to a non-promise block: now not under.
- Acts in cases that tested a sealed limit binding past itself: deleted with their ops.
- `scope_reading`: output loses `sealed`, `condition`, `notice`, gains `on`, `keepers` (36 cases, shape only).
- A promise under a grant that does not cover it (a quote request): its `speaks_for` was the principal; now the signer (`promise_stage` cases with a quote request: stage `asked` unchanged).
- Every `gives` of a tool's accept: now lists what her own accept would (11 cases).
- Cases where the core and the oracle disagreed on a machine's allocation (b2/05 N6): both now read it by way 2.

**Becoming refusal cases:** a grant with `on` or `refs.what` and no `refs.meter` (`required`); `every` without `until` (`required`); a child with `limit` under a parent with none (`wider_than_parent`, already one case); `fallback` with two keepers (`shape`); a grant to a role with `depth` (unchanged).

**New vectors** (a maker `make-vectors-grants.cjs`; each a story and its expected answer):
1. Amara's A and G; Harry's counter £205 keeping to A; the AI's `observe` accept: `under_ok` true; `backed(Amara)` true.
2. The same counter with `state.where` added: `keeps_to` false, `why` `state.where`; accept `not_kept`.
3. With `refs.schema` Harry's: `why` `refs.schema`. With a `forfeit`: `terms.forfeit`. With `pay_by` 2029: `terms.pay_by`.
4. A counter sealed to Harry and the AI only: `keeps_to` false (item 2); sealed to both and Amara: true.
5. Maria's offer £4, 1 to 5 loaves; Harry's ask at 1p: `not_kept`; his counter for 3: true; his counter for 6: `not_kept`.
6. Forty counters of 5 loaves accepted: first true, 39 `past`.
7. Two grants naming one A of 10 sacks: the second grant's draw `past`; an accept under it `not_kept`.
8. Mama's open offer of 30 cups, till grant naming it: allocations of 2 and 28 true; one more `past`; her own allocation after the grant `past`, `over_allocated`.
9. Weekly limit £100, `until` set: six accepts of £100 in one minute: first true, five `past`; a seventh nine days later: true.
10. `every` without `until`: `required`.
11. Parent limit £100; children £60, £60, £40; the AI's £1: true, `past`, true, `past`.
12. A child with `each` under a parent with none: `wider_than_parent`.
13. A second key of the AI accepts: `not_on_line`.
14. Her node as meter: three accepts on one `prev` by the AI key; receipts with totals £210, £420, £630: true, `past`, `past`.
15. The same, no meter of hers: three mills each accept unseen: each `backed` true; a reader holding two branches sees the `pair`.
16. A meter's two receipts with the same `prev`: the pair ends her word for blocks that had not used either.
17. A grant with `keepers` her node; stop received before the accept on her node's line: accept counts for nothing.
18. No `keepers`; accept after the stop, the mill's delivery naming it unseen: true; with the stop in the mill's causal past: false.
19. A stop held as a header only, in the accept's causal past: `under_ok` `{ not_shown: true, lacks: [stop] }`.
20. A tool's payment of £205 toward a deal its accept bound, the price waiting on her accept of the flour: before that accept, `not_due`, `backed` false, `owed_back` lists it; with it in the payment's past, true, `draws` 0. Under a grant whose `types` lack `transfer`: `not_live`.
21. A tool's delivery of 10 sacks she sold, from a part the grant holds, for a binding deal: true; of 11: `not_due`.
22. A tool's `accepted` answer to Harry's £1 with `covers` £1,000: outside; without `covers`: true (it says £1 came).
23. "It came" for 10 sacks where 4 are owed: outside; for 4: true.
24. An `accepted` answer to Harry's message proposing 2036: outside.
25. Deadline Wednesday noon, fallback `lowest`; offers £205 (Harry), £199 (Sam, expires Wednesday 18:00), £240: `lowest_offer` Sam; the tool's accept of Sam after the cutoff: true; of Harry after it: `after_deadline`.
26. The tool accepts Harry before the deadline (received by it): true; its accept of Sam after: `past`.
27. `lowest_offer` with no cutoff yet: `pending`; a cutoff followed on the keeper's line by a receipt of an offer dated at or before the deadline: shown false, closes nothing (stage 1's, 00-shared row 57), still `pending`. A cutoff that names no receipt still closes over every receipt before it on her line.
28. A deadline with two keepers and a fallback: `shape`.
29. Toll work: Maria's grant to Harry, `refs.what` her 1 kg flour, `limit` 0.5 kg, `on` the toll deal; Harry's make with `inputs` 0.5 kg: true; the loaf has no owner until Maria's `accepted` answer, or her tool's `accepted` answer inside the toll deal, then Maria; a second make of 0.1 kg: `past`; Maria's own sale of 0.6 kg of the flour: `past`.
30. No one is both sides: the AI accepts its own operator's counter under a grant whose A leaves the side open: `both_sides`; with A naming that operator as the side: true.
31. A treasurer signs `as` the group a promise to herself: `both_sides` (stage 6 adds the `take` row case).
32. A tool's ask under a grant that keeps to nothing; Harry's offer answering it; an accept of the ask: `quote_only`; Amara's own accept of Harry's offer: binds her.
33. `worst_case` of Amara's G: `at_most` £210, `stop` `clock`, `fork` `meter`, `pays` true; with `types` `observe` alone, `pays` false.
34. An open grant naming no meter of hers, with `on`: `required`.
35. A drone's grant: `types` `transfer`, `on` her standing charging deal (£3 a charge, due once the station's signed reading of that charge is held), `limit` £20 `every` P1W, `until` set: payments after each charge, £3 each: six take, the seventh `past`; a payment with no charge in its past: `not_due`.
36. A payment dated by the tool's own `at` past a time the deal names, with no clock: `not_due`; the same with the deal's clock holding a cutoff through that time in the payment's past: true.
37. A tool's make under her grant starts her line: Leila's home farm, grant `refs.what` her 20 kg flour, `limit` 20 kg, `on` her want of 40 loaves; a make `for` it with `inputs` 0.5 kg: true; the loaf's owner Leila from the make, its start that make, with no answer of hers; the forty-first: `past`.
38. A stranger's make naming her inputs starts nothing: a make by one with no grant of Leila's and no deal with her, `inputs` 0.5 kg of her flour: `not_owner`; the loaf's owners `[]`; Leila's flour unchanged.
39. Harry's till, deal `waits_on: price` at £205: its `accepted` answers to £100 and £105, then its payee's signal: `under_ok` true; its delivery of the 10 sacks with the signal in its past: true, owner Amara on her accept.
40. The same till's payee's signal after £100 alone: `under_ok` false (it speaks for the till; the payments short of the price); a delivery with that signal in its past: `not_due`.
41. The till's delivery with £205 accepted and no payee's signal in its past: `not_due`. Harry's own signal from his own key with nothing accepted: the till's delivery after it: true.

---

## 8. Build notes

**Order.** (1) `protocol.json`, then `node test/sync-spec.cjs`. (2) The spec text (section 2), then `node sdk/javascript/test/make-schemas.cjs` (no `undo`). (3) The oracle. (4) The Rust core. (5) The vectors (section 7). (6) The SDKs. (7) `mcp/`. Run after each of 3 and 4: `node spec/oracle/run.cjs`, `node test/audit/run.cjs`.

**The oracle, `spec/oracle/fb.cjs`.**
1. Delete `limitCommitment` (5158), `limitOpens` (5160), `limitWithinParent` (5172), `withinLimit` (5182), `limitFence` (5269), and in `whyNotUnder` (2331) the visible-limit block and the trusted-schema `undo` block (about 2354 to 2406, with `actValue`).
2. Add `keepsTo(c, a, grant)`: canonical equality of `state` and `refs` after removing the eight exceptions, then the four typed checks (sides, instances, quantity, price), returning the first differing sorted path.
3. Add `grantLine(grant, pool)`: the start from `refs.meter`; own line or a named meter; calls stage 3's `drawsOn` for each measure (the limit; each promise in `on`; the instance in `refs.what`), reading stage 2's `readWhole` and returning `not_shown`/`lacks`; a named meter's receipts read by `drawn`.
4. Rewrite `whyNotUnder` as: grant made for the signer and standing (`stands`, stage 1) with every grant above; types; sides; one of the six ways (way 5: owed and due, `not_due`); `keepsTo`; `grantLine` fits; deadline (`lowestOffer`); rule 6. `grantLive` (2301) becomes a call to `stands` plus the cut, with `scope.keepers` as the grant's clock.
5. `speaksFor` (4558), `backedIn` (4584): the top of the chain, `waiting`, `not_shown`. `givesIn` (4617): a tool's accept reads as hers. `scopeReading` (4952): new output. Add `worstCase`, `lowestOffer`.
6. The draw list of a grant joins the others in `drawsOn`; a grant's draw on A or an instance is `held`, never `landed`.

**The Rust core, `sdk/rust/src/`.**
1. `check/grant.rs`: the scope fields, `refs.meter` `required`, `every` with `until`, `fallback` and `deadline` shapes, `scope_refusals` by the new table; `grant.rs` `narrower_table` (46), `wider_by` (54), `keeps_condition` (29) deleted, `scope_within` (80), `scope_refusals` (89).
2. `grant.rs`: delete `limit_fence` (912), `within_limit` (933), `limit_within_parent` (954), `limit_commitment_in` (968), `limit_text` (972), `limit_opens_in` (989), `past_visible_limit` (618), both `act_value` (640, 656), `why_not_live_undo` (782), `moves_or_binds` (744). Add `keeps_to` and the six ways; rewrite `why_not_under_in` (579) as the oracle's step 4; `why_not_live_in` (289) and `ended_by` (353) read stage 1's `stands` and the cut with the grant's clock; `outside_parties` (679) reads `on` and `parties`; `scope_reading` (161) the new output.
3. A new `fold/grant_line.rs`: `grant_line`, `meter`, `lowest_offer`, `worst_case`, calling stage 3's `fold/draws.rs`.
4. `fold/backed.rs` (`backed`, `owed_back`), `fold/gives.rs`, `fold/deal.rs` (a machine's allocation, way 2), `fold/mod.rs` (`speaks_for`, the top of the chain).
5. `grant_fence.rs` is the machine's fence: unchanged.
6. `door.rs`, `spec.rs`: section 4. Rebuild WebAssembly, the Python library, the XCFramework; every SDK's tests.

**`write`.** The writer fills `state.draws` for a block under a limited grant from `terms_total`, or, for a payment, from what it pays (zero toward a deal the same grant bound), and refuses to write a tool's payment or delivery that is not due (the core says why; nothing else checks).

**`mcp/`.** The `connect` tool takes `on`, `meter`, `keepers` and drops `condition`; the gate's own fence moves to the product's schema field.

**Identical before and after:** every `under_ok` and `backed` verdict for blocks signed by the person herself; every circle answer; the machine fence and lock; every identity, consent and chain answer.

---

## 9. What this stage leaves, and what it needs

**Leaves to stage 5 (deals):** what "a deal that binds her" is, read from the deal machine (ways 4 and 5 read it); "what the deal still owes her" as the stage's sums; when what a deal owes is due by its own terms (way 5 reads it); the spot exchange itself (a till's spot sale as ways 2 and 5 in one block is written here, Blocks that bind, way 5); What stands behind a named signer (a meter's liability, pointed to here); the account word's `state.by`; `forfeit`; the decline bullet of authority.md, Ending (line 48).
**Leaves to stage 6 (circles):** the `as` bullet of Who a block speaks for; the `take` row that rule 6 reads; a grant signed `as` a circle; `circles.md` The cut, which points to authority.md's heading kept for it.
**Leaves to stage 7:** `THREAT-MODEL.md` (a holder's fork bound per line; a meter's fork; a renewing limit's figure; no hidden limit); `protocol.md`'s glossary (`scope.on`, `refs.meter`, a tool, no sealed limit); the CBOR names in section 3; `withheld`; the machine lock and fence, with authority.md's stub "The cut" (row 89).
**Needs from stage 1 (built; 00-shared rows 53 to 64):** `stands` (one entry per thing it waits on, in its fixed order), signed twice, The cut with Seen and Relier (her own later counted block that names a block passes its ends, with a clock or without; a block that names an end in `refs.confirms` has not seen it), Who bears the gap, a named clock's four readings and cutoffs, Time (a block's date on a line), `refs.key`. **From stage 2 (built; rows 93 to 106):** A line (read whole counts both ends; a `seq` that jumps with no `skip` is no hole), `not_shown`, `lacks` (the id where a held `prev` names it, else `{ author, key, seq }`), `valid` (checks 1 to 6) and `read` (check 7, with `names_missing` and `names_unread`), the pair by `prev` or `seq`; a fold asked about a block not read gives no answer. **From stage 3:** What is left (a draw, holds, freed, the reasons), `drawsOn`, the amount shape, `terms_total` in amounts, A fork is a burden (a word given twice).

---

## 10. Asks of the shared ground

Asks settled in 00-shared.md on 2026-11-11.

---

## 11. A voice's cap (stage 1's files, built here)

Stage 1 wrote the voice, its list and the confirming rule (rule 13). The cap is a limit counted along one line, which is this stage's, so this stage changes these passages of stage 1's files, and no other stage does (00-shared, row 65). Built in the same order as section 8, after A limit is counted along one line.

**Why a voice and not a tool.** Her tap is her own fresh word on her own device, so it cannot be a tool's block under a grant: a grant bounds another actor, and there is no third kind. A cap stated in her standing list is read by any stranger, so it binds (rule 9); over it, her higher voice decides.

**V1. `identity.md`, Her voices**, the paragraph "A voice may state `wait`, a duration. ... ends her identity (Taking oneself out)." After "and a key grant never states one (`undeclared_field`)." add: "A `key` voice may state a cap: `each`, `limit` and `every` (A voice's cap). A voice that states `every` states `limit`, and its list states `keepers` (`shape`)."

**V2. `identity.md`, A voice is her, whole.** "The only bounds on a voice are time: its `wait` and its `reach`." becomes "The only bounds on a voice are its `wait`, its `reach` and its cap."

**V3. `identity.md`, A voice changes only what is below it.** "and its own place's `wait` and `reach` as they were" becomes "and its own place's `wait`, `reach` and cap as they were"; "The `wait` and `reach` of a place are changed only by a voice above it." becomes "The `wait`, `reach` and cap of a place are changed only by a voice above it."

**V4. `identity.md`, A key under a voice.** "is bounded as that voice is (its wait and reach)" becomes "is bounded as that voice is (its wait, its reach and its cap: under a capped voice it draws only on a part of the cap its voice passed it, A voice's cap)".

**V5. `identity.md`, a new paragraph after Reach:**

> **A voice's cap.** A `key` voice may state `each`, an amount: the most one word of that key may move or bind; `limit`, an amount: the most its words may move or bind together; and, with `limit`, `every`, a duration: the limit renews each period. A word of that key is under the cap only if a reach would hold it (a `promise`, `transfer` or `grant`; Reach); a word that only narrows (blocks.md, Finality, Signed twice) and a reading are never above it.
> - **What a word comes to** is read as authority.md, A draw, reads a block under a grant: a promise that binds her (an offer, a counter, an accept, an allocation) at the deal's total at the quantity it binds, with `terms.backing` and `terms.forfeit` where they bind her; a payment or a delivery `for` a deal a word of that key bound her to, of no more than that deal owes from her, at nothing more; any other transfer at its `amount`; a grant at the most it can bind her to pay (authority.md, Blocks that bind, The worst case). A word with no amount of the cap's kind to read (a transfer of an instance outside such a deal, a key grant that passes no part to a key under the voice, a price that cannot be worked out) is above any cap.
> - **Fits.** A word fits when what it comes to is no more than `each` and, where the voice states `limit`, it takes as a draw on that measure along that key's own line, read whole from the word back to its start, the block that brought the key in (folds.md, What is left; A line): with the earlier words that fit, no more than `limit`. With `every`, only the words of its own period are added; a word's period is the whole number of `every` from her keepers' receipt of the block that brought the key in to their receipt of the word (A named clock, By T), and until `needed` lines hold its receipt it is waiting. A pair on that line is a word given twice (folds.md, A fork is a burden).
> - **A key under the voice draws only on a part passed to it.** The key grant that adds a key under a capped voice may state, for that key, `limit`, a part of the voice's `limit`, and `each`, no more than the voice's own. That key grant is then a draw on the voice's line at its `limit`, as a grant passed on is a draw on its parent's line (authority.md, A draw): held from where it is signed, never coming back to the voice, and, under a voice with `every`, a draw in the key grant's own period and drawn on by the key only in that period. It comes to that `limit` and no more against the voice's cap; any other key grant has no amount to read and is above it. The key counts its words along its own line, from that key grant, its one start for the part (no accept is read, so no second start arises: folds.md, What is left, One start), against the part as a `limit` (Fits, read for that key), each held to the lower of its own `each` and its voice's. So the voice and every key under it together never come to more than the voice's `limit`. With no part passed, or a part that took nothing on the voice's line, a key under a voice that states a `limit` has nothing to draw on: every word of it above zero is above the cap. Under a voice with `each` and no `limit`, a `limit` on the key grant passes nothing, and the key is held to `each`.
> - **Above it.** A word that does not fit stands only when a voice above that key has signed it (blocks.md, Finality, Signed twice); until then it is waiting, and draws nothing on the cap.
> - **Read by anyone.** The cap is in her standing list, so any stranger reads it as he reads a `wait`; a word past it binds no one who could read it. It bounds her voice. A tool is bounded only by her grant.
>
> Ground: a signed word binds only as written; she wrote, in the list every stranger reads, that this key speaks for her up to this much, so a word past it was never hers until her higher voice says so (Rothbard, *The Ethics of Liberty*, ch. 19).

**V6. `blocks.md`, Finality**, the sentence "A word **stands** when ... and its own condition has held where it stands." After "(identity.md, Reach: a reach reaches only her promises, transfers and grants);" add "if its key's voice states a cap, it fits the cap, or a voice above that key has confirmed it (identity.md, A voice's cap);".

**V7. `blocks.md`, Finality, Signed twice.** "a grant that is not a stop, an answer or a machine lock" becomes "a grant that is not a stop or an answer" (rule 13; the lock leaves at stage 7). After "So a thief who held a key briefly leaves none of these words standing." add: "A word above its voice's cap stands the same way, only when a voice above that key has signed it (identity.md, A voice's cap); so a thief with an unlocked phone is held to its cap."

**V8. `protocol.json`.**
- C `shapes.voice.key`: `["key", "suite", "wait", "reach", "each", "limit", "every"]`. C `shapes.voice.about`: add "each and limit are amounts and every a duration, a key voice's cap (identity.md, A voice's cap): every only with limit, and only in a list that states keepers."
- C `refusals.codes.block.shape`: add "a voice with every and no limit, or every in a list with no keepers; each or limit on a key grant that does not add a key under a voice, or that states voices".
- C `key_fields` (the key grant's list, stage 1's): add `each`, `limit`. C `key_fields.about`: add "each and limit on a key grant that adds a key under a voice: the part of its voice's cap passed to that key, a draw on the voice's line (identity.md, A voice's cap)." No new shape: each is an amount (`field_shape.each`, `field_shape.limit`, stage 4's).
- C `folds.identity.output.voices`: "[{ key | key_hash | names, needed, suite, wait, reach, each, limit, every }], highest first".
- C `door.ops.stands.result`: `confirm` reads "(the wait has run, or there is none, and no second signing has come; or the word is above its voice's cap and no voice above has signed it)". No new code and no new `on`: the reason is `confirm`.
- CBOR names (stage 7): `each`, `limit`, `every` are already in the table; none added.

**V9. Door ops.** None added. `stands` answers whether a word fits its voice's cap, a key under it against its passed part; `identity_state` shows the cap in `voices`; `key_timeline` is unchanged (a passed part is read from the key grant in `by`); `meter` is unchanged (it reads grants only).

**The walked case.** Maria's list: her card (first, by hash); her face key, a key that never leaves her phone, unlocked by her face, `wait` P30D; her tap key, a synced passkey, `wait` P7D, `each` £50, `limit` £200. No `every`, so no clock is needed for the cap.
- **A tap of £12.** She taps to accept a café's offer, total £12. It fits: £12 is under £50, and her tap line has drawn £12 of £200. It stands, as any word of that voice does.
- **A tap of £900.** She taps to accept a van at £900. It is above `each`: waiting, `on: confirm`. Her face key signs a block naming it in `refs.confirms`: it stands. The seller's screen said "waiting for her face key" until then.
- **A thief with her unlocked phone.** He taps four sales of £50: each fits, and together they reach £200; they stand, and she bears them as her own tap's words (Who bears the gap). A fifth: past the limit, waiting for good. He taps a key grant adding his own key: it is signed twice (rule 13), so it stands only if he still holds the phone once the tap's wait has run, and even then it gives his key no room of its own (A thief who adds a key, below). He taps a grant to his AI with a `limit` of £1,000: above the cap. The most her tap key can bind her to, whoever holds it, is £200, and every stranger could read that before relying. With a copied key he can fork her tap line: each branch binds her up to £200 where a relier used it unseen, and the pair is his proven lie.
- **Her tablet.** Her tap key signs a key grant adding her kitchen tablet under the tap voice, `limit` £50. It is a draw of £50 on the tap line: the tap has £150 left, the tablet £50 on its own line (and, as a key grant, it is signed twice: rule 13). The tablet orders £20 of milk: it fits its £50. It orders £60 of flour: past its part, waiting `on: confirm` until her face key signs it. Tap and tablet together can never pass £200.
- **A thief who adds a key.** With her unlocked phone he signs a key grant adding his own key under the tap voice. Stating no `limit`, it passes nothing: his key's every word above zero is above the cap. Stating `limit` £200 after her tablet took £50, it takes nothing (a draw is never cut down to what is left), so it passes nothing; stating £150, it moves the tap's own room to his key, so his key gets no room that was not first the tap's. Either way the most the tap voice and every key under it bind her to is £200.
- **With `every` P1W and her shop and host as keepers:** £200 a week, each tap placed in its week by her keepers' receipts; until they receipt it, it waits.

**Vectors** (in `make-vectors-grants.cjs`):
39. A list whose tap voice states `each` £50, `limit` £200: a tap accept totalling £12: `stands` true.
40. The same key, an accept totalling £900: `stands` false, `waiting [{ on: confirm }]`; with the face key's confirm in a counted block: true.
41. Five accepts of £50 on the tap key's line: four true, the fifth false, `on: confirm`.
42. A key grant signed by the tap key: `on: confirm` (no amount), with `wait` and `confirm` listed in order.
43. A transfer of an instance by the tap key outside any deal it bound: above the cap; the tap's delivery for a deal a tap accept bound, of no more than owed: fits, drawing nothing more.
44. A voice with `every` and no `limit`: `shape`; with `every` in a list with no `keepers`: `shape`.
45. A key under the tap voice (`each` £50, `limit` £200). Added by a key grant stating no `limit`: a £12 accept, `stands` false, `on: confirm`. Added by a key grant stating `limit` £50: a £20 accept, true; then a £60 accept, false, `on: confirm`; then four tap accepts of £50 on the tap line: three true, the fourth false (£150 left after the tablet's £50). Under a voice with only `each` £50: a £12 accept fits.
46. Two tap accepts of £150 on one `prev`, each relied on unseen by a different seller: each binds her (a word given twice); a reader holding both sees the `pair`.
47. The tap line not read whole (a block of it held as a header): `stands` answers `{ not_shown: true, lacks }`.

---

## 12. A stop of one thing (authority.md)

A recall and a warning are schemas anyone may publish (05-deals.md, patterns/recall.md); the protocol gains one narrowing, so that her own word can keep her tills and her AI, on any node, from moving one thing (00-shared, row 66). It is not a **hold**: that word is a draw's amount.

**S1. `authority.md`, a new section after "## The cut":**

> ## A stop of one thing
>
> **A stop of one thing** is her own counted `observe` with `state.status: stopped`, `state.stop: onward`, `refs.what` one instance, and, if she wants, `state.amount` of it; it names no `refs.updates` and no `refs.answers`. It means: no block under any grant of hers, or under one passed on from it, draws on that thing or moves it, until she lifts the stop. With `state.amount`, it reaches only a block after which the grant's line would hold less than that much of the thing undrawn (folds.md, What is left).
> - It is an **end**, under the cut, for every such block, read on that grant's own clock (`scope.keepers`), as any end of the grant is (blocks.md, The cut). A block that has seen it counts for nothing as a draw on that thing; one that passed it stays.
> - It only narrows, so it is not signed twice and no reach holds it (blocks.md, Finality), and one keeper's line is enough to show it came first (blocks.md, A named clock, One to narrow).
> - Her own key is not stopped by it. A **hand-back** never is: it returns the thing to her (Blocks that bind).
> - **Lifting.** Her later counted `updates` of the stop with `state.status: resumed` lifts it, for blocks that have the lift in their causal past. A lift gives her tools their power back, so it is signed twice (blocks.md, Finality).
>
> Ground: a grant is her consent to another acting for her; she may narrow it at any time, for one thing as for all, and her narrowing binds no one but her own grant (Rothbard, *The Ethics of Liberty*, ch. 19).

**S2. `blocks.md`, The cut**, the list of ends ("its signer's counted stop, a key grant that leaves the key out, ..."): after "its signer's counted stop," add "her stop of one thing (for the blocks under her grants that draw on or move it: authority.md, A stop of one thing),". A pointer in stage 1's file; the rule is S1's.

**S3. `protocol.json`.**
- C `refusals.codes.block.status_not_answer` (read's code since stage 2): "a status on a block that neither answers nor updates its author's own, bar her stop of one thing: an observe with status stopped, stop onward and refs.what (authority.md, A stop of one thing)".
- C `refs.about`: add "refs.what on an observe with status stopped names the one thing her stop reaches (authority.md, A stop of one thing)."
- A `refusals.codes.fold.stopped_thing`: "a draw on, or move of, a thing her stop of one thing names, by a block under her grant that has seen the stop (authority.md, A stop of one thing)".
- No new type, kind or op: `under_ok` and `meter` give `why: stopped_thing`; `stands` lists the stop as an `end`.

**S4. Door ops.** `under_ok` and `meter` add `stopped_thing` to their `why`. Nothing else.

**The walked case.** Amara's till sells loaves from her lot L7 under her grant (`on` her open offer, `refs.what` L7, `keepers` her node). Harry recalls L7 (a `recall` observe, a schema). Amara's node shows it to her; she taps a stop of one thing naming L7 (a stop only narrows, so her tap key's cap does not hold it). Her node receipts it at 10:02. The till's sale at 10:05, received after: it has seen the end on her grant's clock, so it binds her to nothing (`stopped_thing`). Her AI, on another node, signs a hand-back of the L7 it holds: it counts. Her own phone sells one L7 loaf to a buyer who wants it anyway: her own key, not stopped. Next week she signs a lift, `resumed`, twice; the till sells again.

**Vectors:**
48. Her stop of L7 with her grant's `keepers` her node; the till's sale of L7 received after it: `under_ok` false, `why: stopped_thing`; its sale of another lot: true.
49. No `keepers`: the till's sale with the stop not in its past, used unseen by the buyer: passes (true); with the stop in its past: false.
50. `amount` 10 kg on a grant line holding 30 kg of L7: a draw of 15 kg takes; a further 10 kg would leave 5 kg: `stopped_thing`.
51. A hand-back of L7 after the stop: counts.
52. Her own key's sale of L7 after the stop: unaffected.
53. A lift signed once: waiting `confirm`; signed twice: the till's next sale with the lift in its past: true.
54. An `observe` with `status: stopped` and no `refs.what`, `updates` or `answers`: `status_not_answer`.
