# Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: the receiver, one id. Left out, it is open. A `refs.to` naming a set of ids names no one, so no one receives that grant.
- `state.kind`: the grant's kind (Kinds, below).
- `state.scope`: `{ types, parties, on, limit, every, each, until, clocks, deadline, fallback, ends_on }`, data, never prose. `types` lists block types or `type.kind` names, matched exactly; a name that is neither names nothing. `parties` lists the ids its blocks may deal with. A block's sides are the ids in `refs.from`, `to`, `to_owner`, `to_holder` and, for an answer, the sides of the block answered. `on` lists promises she signed: her first promises (an offer, a want: her terms) and her binding accepts. `limit` and `each` are amounts; `every` a duration, stated only with `limit` and `until` (`shape`, `required`); `until` a time, an end (blocks.md, The cut); `clocks` the clock her ends of this grant are read on (blocks.md, A named clock); `deadline` and `fallback` as Her deadline says; `ends_on` her own ending term (A witness).
- **What she did not write, the grant does not allow.** A missing `types` or `on` names no binding block. A missing `limit` and `each` lets no block under it draw above zero. A missing `until` is no wider grant: it lasts until an end reaches it. A missing `clocks` names no clock (blocks.md, From where a stop counts). A missing `ends_on` names none. The protocol fills in none of them.
- **Every reader reads every field.** A limit the other side cannot read is no word shown to him. A product keeps her node's own lines in a field its own schema declares, which no fold reads.
- `refs.under`: every block signed under a grant names it. Whether it binds the grantor is Who a block speaks for; the door's `under_ok` answers it, and every fold applies it.
- `refs.parent`, `state.depth`: a grant passed on names its parent. `depth` is how many more times it may be passed on, a whole number of 0 or more (`shape`); with none, 0. Only the receiver passes a grant on: a child signed by anyone else is `not_receiver`, as is any child of a parent with no receiver (open, or `refs.to` not one id). A grant to a circle is passed on by a child signed `as` that circle, no wider than given, which holds where a row holds for it.
- `refs.meter`: one id, the start of the one line every block under the grant is counted on, read by one rule (A limit is counted along one line). Every grant that can bind (one with `scope.on` or `refs.what`) names one (`required`). An open grant binds only through a meter she names, a key not the holder's.
- `refs.what` on a grant: one instance the grantor owns. The grant is a draw on it at `scope.limit`, or on all she owns of it when it states none, and passes that part to the grant's line (Toll work).
- **`scope.until` is optional on every kind.** It is an end (blocks.md, The cut; Whose date tests `until`).
- A grant stands as every word stands (blocks.md, Finality): a grant that lets a key act or spend for her, or more than before, waits her voice's `wait` (identity.md). A grant has no status of its own: a block with `state.status` is a stop or an answer, never a grant, whatever else it restates. For a block relying on a grant, only the `confirms` in its causal past count.
- **One agent, many principals.** A grant names a task, never sole rights to it, unless it says so. One person may hold grants from several principals for the same task, each block under one grant speaks for that grant's principal alone, and an employee may compete with his own principal's contractors, who hold grants of their own for the same task.
- **Silence grants nothing.** A grant exists only by her own signed word; a key-less person's yes reaches it only as a witness (A witness). Until then a tool of hers may gather offers, and its own promises speak for it alone (promises.md, A tool's own promise).

## Who a block speaks for

A block speaks for one party, and a fold counts it for that party alone (`speaks_for`, which is also the door's `speaks_for(block, held)`: an id or null; no clock is read). Every fold asks this; where a rule says a side "signs", this is what it means.
- A block naming a circle in `refs.as` speaks for the circle's owners where a row holds for it or every owner signs it, and it stands (circles.md). Otherwise it is waiting (`on: hands`) and acts on nothing (`no_role`).
- **A tool's word.** A block that names a grant in `refs.under` speaks for the grant's giver only where (1) it is for a promise in the grant's `scope.on`, or for a deal that a block under the same grant made; (2) where it is a promise, it keeps to that promise (Keeps to); where it is a transfer or a word about what is hers to receive, it is of that deal (Blocks that bind); (3) it fits on the grant's line (A limit is counted along one line); and (4) it stands (blocks.md, Finality; until it does, `waiting`, listed with what it waits on). Its type is in `scope.types`, each side is admitted (below), and the grant is made for its signer (`refs.to` its signer, or open). A block that fails any of these speaks only for its signer. Speaking for her means the fold counts it for the principal at the top of the grant's chain (`refs.parent` up to the first grant not passed on): her, or the circle the top grant was signed `as` where a row holds for it. What binds her is her grant and her promise, never the holder's block: the holder signs a reading, "I did this under that grant", and nobody signs as anyone else. The door's `under_ok` is this test: true, false, or the fork answer (A fork on a tool's line); a fold and the door never disagree.
- **A side admitted.** A block under a grant deals only with sides the grant admits: an id `parties` lists, a side a promise of hers in `scope.on` names (her own word named him), or a side of a deal a block under the same grant made. Where the grant states no `parties`, a side an `on` promise leaves open admits anyone.
- A sensor's reading speaks for the sensor when it speaks for the sensor's owner (the ownership fold of the sensor thing): signed by a key of hers (patterns/tasks.md). A device she sets up holds a key her list brings in, so what it signs is her word. There is no operator grant, and a reading a tool signs under a grant speaks for the tool alone (Blocks that bind).
- **No one is both sides of a word.** A block that gives to her (its own signer, a key linked to the signer by a two-key link (identity.md, A two-key link), or a circle in which her hand could count) speaks for no one else by a circle's row or under a grant, unless the promise the grant or row names in `scope.on` names her as that side, or a row of the circle holds for it without her hand, or every owner signs it (`both_sides`; circles.md, No one is both sides). A part passed, and its coming back, give nothing away and are no case of this rule. Ground: a deal is two owners' consent; a hand trusted to give for another was never trusted to receive from her, and one person's two signatures are one will (Rothbard, *The Ethics of Liberty*, ch. 19).
- Any other block speaks for its author.

**A delegation carries its moment.** A block under a grant names it for its meaning (`refs.under`), so it is read only where the grant, and every promise the grant names in `on`, is held, valid and read (core.md, section 8, `read`). The grant is no piece: `valid` does not wait for it. Copies carry no power (core.md, section 10).

## Backed by a person

Every question of the form "is this hers?" is one question: **is this block backed by person P?** The door's `backed(block, person, held)` answers `{ backed, why, chain }`: `why` is one plain sentence when it is not (null when it is), `chain` the hashes from the block down to the block the person signed (the block itself, or the top grant of its chain). Nothing else asks whether a block is someone's: no comparison of a block's author with her id, no second copy of a rule. Nobody signs as someone else. Every block is signed by whoever made it (her, her AI, a helper, a device, a host), and it binds P only through P's own signature, which is the one ground there is: a signed word binds only its signer. A block is backed by P when:
- **P signed it.** Its author is P and P's key speaks for P (identity.md).
- **P signed a hand of the circle it is signed as.** It speaks for the circle's owners, and a hand of P's is among those its row counted. It binds the circle's things, never P's own.
- **A grantee signed it under a grant that roots in P.** It names a grant in `refs.under` and speaks for the grant's giver (Who a block speaks for). The chain is that grant, then each grant it was passed on from (`refs.parent`), up to the first not passed on; each stands where the block stands and none is wider than the one above it (Scope subset), so authority only narrows. The top grant is signed by P, or `as` a circle with a hand of P's among those its row counted (circles.md, Rows). A helper under her AI under her grant is such a chain of three.

A block that is none of these speaks for its author alone and is backed by no one else. The AI in the middle of a chain is not the person it roots in: `backed(block, ai)` is false for a helper's block. Where a line the answer reads is not read whole, `backed` answers `{ not_shown: true, lacks }` (folds.md, A line). Where the block or a grant in its chain is waiting, `backed` is false and `waiting` lists it (blocks.md, Finality). Where a pair on the grant's line is held, `backed` answers as A fork on a tool's line says.

**When an end reaches a block under a grant** is blocks.md's: The cut, Seen, Relier, From where a stop counts. `scope.clocks` is the clock her grant names for it. An end this reader holds and does not read is no end and no proof of none: a block whose answer turns on it answers `{ not_shown: true, lacks }`.

**A witness.** A block in which a signer says what a handle said (who spoke, on what channel: `sms:+447700900123`): an `observe` of kind `witness`, `state.handle`, `state.said` and `state.readback` (the SHA-256 digest of the read-back text the handle answered), `refs.for` the deal or move (schema `witness`). It is the signer's word that the handle said it; a phone is not something a node can see. A block that names a handle is under a grant only where the grant names the same one (`state.handle`), and a grant that names a handle is passed on only to that handle. `state.said` is text and `state.readback` is a SHA-256 digest in hex (`protocol.json`, `kind_fields`, core.md, section 3); a witness that breaks either is `shape` or `grammar`. (`state.channel`, the open label of the link a block came by, is a different word: it names no one and no grant reads it.) A witness is the witness's own word and binds only its signer: it is never backed by P. Where P's own signed word names it, a witness is a condition that word reads. **`scope.ends_on`** is her own ending term on a grant: `{ witness, said }`, `witness` the id of the host she names, `said` the exact text. The grant counts for nothing for every block that has in its causal past a counted `observe` of kind `witness` signed by that host, with `state.said` exactly that text and `refs.for` the grant (its `state.handle` the grant's own, where the grant names one). It is read in causal order, as her own stop is: a block that has not seen the witness still counts. The witness binds only the host; the ending is her word. So her grant may end when the host she named witnesses a STOP from her handle (`said: "STOP"`), and a deal she signed may count her handle's YES that the host witnesses. A host that holds no key of hers, saying her SMS YES or STOP, signs a witness in its own name and never as her.

## Ending

One rule ends anything a block gave: a grant, a promise, a transfer. Callers keep only their own consequence.
- The **author** ends it by an `updates` with `status: stopped`; the **receiver** by an `answers` with `stopped`, or by a decline (an `observe` that `answers` it and says `declined`; a decline of the grant's own type, written before the three moods, reads the same) (leaving). A word signed `as` a circle is ended by a stop of its author while she still holds what her hand counted, or by a stop `as` the circle that a row holds for; any other stop `as` the circle ends nothing. A grant signed `as` a circle for which no row holds is waiting (`on: hands`) and acts on nothing (`no_role`; circles.md, One answer for a block with no row).
- Only a **counted** stop ends: a stop of a forked key frees no one (folds.md, A fork is a burden). A key is ended as identity.md, Ending a key, says.
- What a stop ends, and for which blocks, is blocks.md, The cut.
- **A close** (identity.md, A close) is an end of every grant she gave in her own name, not `as` a circle, read as any end of hers (blocks.md, The cut).
- **A decline ends a standing word for its signer** (promises.md, Answers). It reaches nothing that already binds; a late answer is read by the cut (blocks.md, The cut), never by a later decline.

## The cut

One rule: blocks.md, The cut.

## A stop of one thing

**A stop of one thing** is her own counted `observe` with `state.status: stopped`, `state.stop: onward`, `refs.what` one instance, and, if she wants, `state.amount` of it; it names no `refs.updates` and no `refs.answers`. It means: no block under any grant of hers, or under one passed on from it, draws on that thing or moves it, until she lifts the stop. With `state.amount`, it reaches only a block after which the grant's line would hold less than that much of the thing undrawn (folds.md, What is left).
- It is an **end**, under the cut, for every such block, read on that grant's own clock (`scope.clocks`), as any end of the grant is (blocks.md, The cut). A block that has seen it counts for nothing as a draw on that thing (`stopped_thing`); one that passed it stays.
- It only narrows, so no `wait` and no `reach` holds it (identity.md), and it takes `names` less `needed`, plus one, of its clock's lines (blocks.md, Which reading needs `needed`).
- Her own key is not stopped by it. Coming back never is: it returns the thing to her (Coming back).
- **Lifting.** Her later counted `updates` of the stop with `state.status: resumed` lifts it, for blocks that have the lift in their causal past. A lift gives her tools their power back, so it waits her voice's `wait` (identity.md).

Ground: a grant is her consent to another acting for her; she may narrow it at any time, for one thing as for all, and her narrowing binds no one but her own grant (Rothbard, *The Ethics of Liberty*, ch. 19).

## The stop of a grant

Her stop of a grant is an end, read as The cut and From where a stop counts say (blocks.md); her `scope.clocks` say which. What the grant's line holds of hers and has not drawn comes back (Coming back). What a deal bound under her grant holds above what came is freed only where the rest of that deal can no longer fall due (folds.md, Freed): by the payee's `paid`; by her stop, where the offer said ahead that a stop ends what has not come (`terms.stoppable: true`); by a cutoff through the offer's `deliver_by` on the clocks it names; or by a ruling of a judge both sides named (`state.ends_rest: true`). Her stop alone frees none of it.

## Scope subset

A child's scope is no wider than its parent's on every field, else `wider_than_parent`. A child is never open (`shape`). It names its parent's `deadline` and `fallback` unchanged. It is counted on its parent's meter where the parent names one that is not the parent holder's own line; where the parent's meter is its holder's own line, the child is a draw on that line for its whole `limit`, which never comes back to the parent's holder. A child that does not fit its parent's line is no grant for the blocks under it (`not_live`).

| Field | Child must be |
|---|---|
| `types`, `parties`, `on` | a subset (a field left out names none) |
| `limit` | stated only where the parent states one; a draw on the parent's line |
| `every` | none, where the parent states `limit` |
| `each` | stated only where the parent states one; no larger, of the same kind |
| `until` | no later |
| `clocks`, `deadline`, `fallback` | the parent's, exactly |
| `ends_on` | not compared: her own ending term only ends a grant sooner, and a child ends with its parent |
| `refs.what` | the parent's, or none |
| `refs.meter` | the parent's, where it is not the parent holder's own line |
| `depth` | smaller by at least one |

## Whose date tests `until`

`until` is an end (blocks.md, The cut). With `scope.clocks`, it is read on that clock (blocks.md, A named clock). With none, a block is in time only by its own `at`, before the `until` (blocks.md, Time): a block whose `at` is at or after the `until` of its grant, or of any above it, or that states no `at`, acts under none. A micro with no clock leaves the test to its edge, which passes on no block outside `until`.

## Blocks that bind

What A tool's word means by "of that deal", by type. Every other block under a grant (a note, a decline, a stop) speaks for its signer alone.

- **A promise** (an accept, an allocation, an offer, a counter) keeps to a promise in `on` (Keeps to). An accept gives, for her, what her own accept at that quantity gives.
- **A make**, under a grant that names an instance (Toll work).
- **A word about what is hers to receive** (an `accepted` answer that it came, `received`, `covers`, the payee's signal): of a deal in `on`, or one a block under the same grant made, at no more than that deal names her side to receive. It counts once with her own words (folds.md, The other side).
- **A payment or a delivery**: a `transfer` `for` such a deal, to its other side, of what that deal names her side to hand over, no more, and only where it is due (promises.md, Due). Anything else it moves binds her to nothing (`not_due`). Where her grant does not name `transfer`, it pays and delivers nothing. A till's spot sale is an allocation and a delivery in one block.

**Keeps to.** A promise C keeps to a promise A when C's `state` and `refs` are A's key for key, bar a closed list of eight:
1. what every block has of its own (`refs.author`, `prev`, `after`, `key`, `refs.as`, `state.seq`, `at`, `nonce`, `skip`, `state.draws`): who speaks is no term of the deal;
2. `state.audience`, where C is public or sealed to the grantor and the holder;
3. C's links: `refs.answers`, `refs.for` (naming A or a promise that keeps to A) and `refs.under`;
4. a side A leaves open, which C names (C names both sides); where the grant states `parties`, one of them;
5. `refs.what`, where A names kinds: each id in C is an instance of one of them, and each kind A names has an instance in C; else the same ids;
6. one value inside a range or a list A states, at `terms.price`, `terms.quantity`, `terms.pay_by`, `terms.deliver_by`, or a line's `price` or `quantity` (lines matched by `id`);
7. a price, where A states none, she pays it, and the other side signs C;
8. C's own `expires`, and `state.occurrence` where A carries `repeat`.

C is always fully stated: one value at each term, both sides named. A term A does not carry, C does not carry. A seller never writes a date into her silence. The door's `keeps_to` answers `{ keeps, why }`, `why` the first sorted path that differs and is not one of the eight.

**A range and a list.** A range is `{ min, max }`, one end or both, of one kind (the same `unit` and `of`; for a price per unit, the same `per`, byte for byte); `min` less than `max`. A list is `{ one_of: [...] }`, two or more values, sorted. Either sits only at the places item 6 names; anywhere else it is `shape`. An item of either is a value. A value is inside when it is of the same kind and its number is from `min` to `max`, both counted, or equals a listed number, compared as decimals. At `pay_by` and `deliver_by` an end may be a duration; it is compared only with a duration, by the span each adds to one fixed instant (2000-01-01T00:00:00Z), never added to a date (blocks.md, Time).

**Who states the figure.** A figure inside a range binds the range's owner only by her own side's word: her tool's block states it, or her tool's yes answers the block that states it. A block binds both owners only where it keeps to each one's promise, so two ranges meet in their overlap. The signer of the block that states the figure chose it, inside both owners' words. An answer names only the quantity it chooses.

**One fill for each occurrence.** A promise with `repeat` is filled at most once for each occurrence. A block that fills an occurrence already filled keeps to nothing (`not_kept`).

She may always accept anything herself (promises.md, Taking a block as yours afterwards).

**Her quantity is the measure.** A promise in `on` is a measure she owns (folds.md, What is left): its `terms.quantity`, a range at its `max`, or one whole where it states none; where it carries `repeat`, one measure for each occurrence, which a block under the grant names in `state.occurrence`. A grant that names A in `on` is a draw on A's quantity from her line, all of it (it states no smaller part), and passes it to the grant's line, where it never lands. Each block that binds her by keeping to A draws its quantity on that part along the grant's line. A second grant naming A takes only what the first left, so nothing while the first stands unstopped in its causal past; two that do not see each other: neither takes. An accept under a grant whose draw on A took nothing keeps to nothing (`not_kept`). What the grant's line has not drawn comes back as Coming back says; what it drew stays drawn.

**A pass between her own tools.** A block of a tool of hers, under a grant whose `types` names `transfer`, that gives a part its line holds to another tool of hers (the holder of a live grant of hers), passes that part; it starts on that tool's line at its accept, where that tool's blocks that speak for her draw on it. It gives nothing away (No one is both sides of a word): her fold shows the draw going to that tool, and her still owning the part.

**Coming back.** What the grant's line holds of hers and has not drawn comes back to the line that passed it, by the holder's own transfer `to_owner` her at any time, or where the grant has ended (folds.md, A part passed). It needs no accept, no type in `types`, no room under `limit` and no meter's receipt: a meter counts only what is drawn. Where `refs.meter` names a line that is not the holder's, what that line has not drawn comes back once the meter has receipted the grant's end. In the thing's own fold a coming back is its signer's word: it moves nothing of hers. The meter answers it in `comes_back` (per measure).

**Her deadline, and the lowest offer at it.** `scope.deadline` is a time: when her tool must have chosen among offers that keep to her promise. `scope.fallback` is `lowest` (a closed list of one), stated only with `deadline`. Both are read on the line `refs.meter` names; `scope.clocks` may name more than one line. Before and after the deadline are places on that line: a cutoff through it (`refs.subject` the grant, `state.when` the deadline's text) and the receipts before and after it, or, on the holder's own line, the holder's own cutoff there. A date orders nothing here but the block's own, against its own signer: without `fallback`, an accept whose own `at` is at or after the deadline (or states none and the line does not show it before) is after it. With `fallback`, no accept under the grant counts before the deadline (one the line shows before it: `not_live`; one it shows neither before nor after: `waiting`, `on: meter`); after it, only her tool's accept of the lowest total at her quantity counts, among the offers that keep to her promise and whose sides the grant admits, received on the meter's line before its cutoff through the deadline and standing there (no cutoff through its own `expires` at or before that cutoff on that line, and no stop of it there). An offer whose total at her quantity cannot be worked out, in the limit's kind, is no candidate. Of two equal, the first that line received. Any other accept after the deadline is `after_deadline`. With `deadline` and no `fallback`, her tool picks before the deadline, and nothing under the grant accepts after it. Her tool cannot move the deadline. Her own accept is hers at any time. The door's `lowest_offer` answers `{ offer, received, cutoff, why }`: `received` the receipt; `why` `pending` with no cutoff, `none` with no candidate.

Ground: the time of her yes is hers. She named it, and on which line, so the choice at that moment is her own signed word, read by arithmetic on typed fields; her tool carries out a choice she made, and makes none (Mises: only persons act).

**Toll work.** A grant that names an instance in `refs.what` is a draw on it on her line (folds.md, What is left), at `scope.limit` (an amount of the instance's own kind, no `of`), or on all she owns of it when it states none. The part stays hers: in the thing's fold the grant is listed as a draw on it, `held` and never landing, and while it holds a part no one owner is shown. A make under such a grant speaks for her where each of its `state.inputs` names the instance the grant names, and it is for a deal in `on`: where the holder is a tool of hers, her own promise for what the part becomes will do (a want of hers for bread). Its tool's makes and transfers under it draw for her on the grant's line (her own), whether or not they fit. Its outputs are hers: a tool's make that speaks for her is her start for each output (folds.md, What is left). What the line has not drawn comes back as Coming back says. The holder's fee is the deal's price; working on her goods gives him no title (things.md, A make).

**The worst case.** From her grant and the promises it names alone, plain code writes, per kind and never added across kinds: **`at_most`**, the most a block under it can bind her to hand over; and **`can_lose`**, the most of hers it can give up with nothing of its like coming back: every part the grant's line holds, and where `types` names `observe.paid` or `observe.received`, what is still to come to her on each deal in `on`, less what is already counted as a part. For each instance the grant names in `refs.what`, its part and each promise in `on` she sells from that instance (one whose `refs.what` names it) count once, at the largest of them; every other promise counts on its own. Where the meter is the holder's own key, a copied key may show one line to each reader; past `at_most` they hold only the copier's word. The door's `worst_case` gives it, with no text.

Ground: a signed word binds only its signer, and only as written. Consent to an agent reaches what she named and no further (Rothbard, *The Ethics of Liberty*, ch. 19; Kinsella).

## A limit is counted along one line

**The line.** Every block under a grant is counted on one line, named by `refs.meter`. A draw fits when it is no more than `each`, and, with the draws before it on that line that take and are not freed, it comes to no more than her measure. A word whose total cannot be worked out, in the limit's kind, is above every bound. Where the meter is the holder's own key, a block of another key of the holder takes nothing (`not_on_line`). The door's `meter` answers it.

**What it counts.** The grant's `scope.limit`, a measure she states (its owner the grantor, her start the grant); and each part the grant passed to its line (Her quantity is the measure; Toll work). Each is read as folds.md, What is left, says. With `every`, only the draws on `scope.limit` of its own period are added; a part is never renewed (a promise that repeats is filled once for each occurrence). A period turns at a cutoff on the meter's line whose `refs.subject` is the grant and whose `when` is a span no shorter than `every`.

**A draw.** A block that binds her under a grant that states `limit` or `each` states `state.draws: { grant, amount }`, in its body only, in the limit's kind: the quantity it binds, where the limit is of the quantity's kind or she sells; else the deal's total at that quantity, with the `terms.backing` she gives (a price fixed later at its `max`; a `forfeit` is paid in place of what it forfeits, never added). A block that binds her to more than it states, or whose total is of another kind or cannot be worked out, takes nothing (`unit`). A payment draws what it pays; a make draws its inputs (those of the limit's kind on the limit) and states nothing. Only a block that passes the other clauses of A tool's word is counted.

**Counted once.** A word that makes due, pays or says paid what a draw on the same line already counted comes to nothing more.

**A meter she names.** `refs.meter` may name a block of a key that is not the holder's: her own node's, a clock's, a circle's till. A block under such a grant fits when a receipt of it by that key is held that states `state.drawn: [{ of, amount, total }]`, one item for the grant's `limit` and one for each part it draws on, and no end of the grant is before it on that line. Draws are read in the order the line receipts them. One receipt is enough: one who does not hold that line whole from the receipt back to the meter reads the running total from it; one who does reads the sum of the amounts, and a receipt whose total is not that sum binds its signer's name (At most her measures). A block that draws and has no receipt held waits (`waiting`, `on: meter`). A pair on the meter's own line answers, for each draw it receipts at or after the pair, as A fork on a tool's line says. A meter named and not held: `{ not_shown: true, lacks }`.

**At most her measures.** Her grant binds her, across every line and receipt it is counted on, to no more than her measures. A pair on a line, or a receipt whose total is not the total before it plus its `amount`, binds the name of its signer, never her past her measures. What stands stays keeps a block under a grant only within the measures the grant set; past them, the relier holds only its signer's word.

**A fork on a tool's line.** A reader who holds one branch reads it whole and answers from it. A reader who holds the pair answers `{ pair: true, held: [...], at_most }` for the blocks after it, `at_most` the worst case's (per kind), and says no more. What came to her under a block after the pair lands on no accept; it ends as folds.md, A fork is a burden, says.

**A limit is a figure.** `limit` and `each` are amounts. "Up to what this sack fetches" varies, so no grant carries it: the product works out a figure and the grant carries that number.

Ground: you cannot give what you never consented to give; a signer's two words bind his own name, and her consent reaches only what she wrote (Rothbard, *The Ethics of Liberty*, ch. 19).

## Kinds the protocol reads

`key`, `referee` and `stop` (`protocol.json`, `kinds`). Any other kind is data whose meaning is its scope. `key` is read in identity.md; `referee` in promises.md (a judge both sides named); `stop`, with the machine as `refs.subject`, is a stop of a machine, which the reading `machine_lock` reads.

## Invariants

15. Nothing that gives, takes or orders authority reads another author's `at`; a time is read against another only on a clock she named (blocks.md, Time).
16. No tie on authority is broken by hash.
17. A grant binds only while it and every grant above it stands where the block stands.
18. A child grant's scope is no wider than its parent's on every field (Scope subset).
19. A block under a grant speaks for its giver only where it is for a deal her grant names, keeps to her promise, fits on the grant's line, and stands.
