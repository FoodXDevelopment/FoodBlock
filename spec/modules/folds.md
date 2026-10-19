# Folds and views

A **fold** reads a set of blocks into one answer. A **view** reads a fold and one more thing: the reader's clock, or when blocks arrived on the reader's node.

**The promise of a fold:** any two nodes that hold the same set of blocks compute the same answer. A fold reads no clock and no arrival. Only a fold's answer may be called convergent.

**A fold reads only what is whole.** A block whose needs (core.md, check 5; `protocol.json`, `needs`) are not all in a fold's input is not part of it, and neither is any block that needs that one. A node never stores such a block (it waits), so on a node the rule changes nothing; it makes a fold a function of its input alone, whatever subset it is handed. A fold of a promise that is itself not whole returns null.

**Arrival-free, order-free.** A fold of a set gives one answer. It never breaks a tie by the hash of a block, by the order a node met its input in, or by arrival: where the input leaves two answers equally good, the fold says so (`forks`, `live`, a null) or names one only to name it, with no authority (the lowest hash, as for a tie of consent).

**The promise of a view:** it is right for the reader that computes it, and says whose clock it used. Two readers may differ for a while, and neither is wrong. A view may show but never decide what another reader must accept. Only an orderer's own blocks trigger acts in the world.

Each fold and view is named in `protocol.json` (`folds`, `views`), with its input and output.

| Name | Kind | Reads | Where |
|---|---|---|---|
| `identity` | fold | blocks | identity.md |
| `chain`, `next_link` | fold | blocks | here |
| `ownership`, `where_now` | fold | blocks | here |
| `promise_stage` | fold | blocks | here |
| `circle_state`, `may_act_as`, `members_then` | fold | blocks | here |
| `consent` | fold | blocks | consent.md |
| `promise_view` (adds `expired`) | view | the reader's clock | here |
| `live_grant` (`scope.until`) | view | the clock of the node that relies on the act, when it takes the block in | authority.md |
| `recovery_reach` | view | the reader's record of arrivals | identity.md |
| `withdrawal_seen` | view | arrival of the withdrawal on the counterparty's node | authority.md |
| `due` (relative `when`) | view | the performer's clock, from the anchor's arrival on its node | promises.md |

Profiles add `successor_view` (profiles/successor.md, the reader's arrivals and clock), `circle_key` (profiles/rekeys.md) and `counted_in` (profiles/ballots.md).

## Orderer

A record's **orderer** is the key that signed its first block, or the key its `state.orderer` names. It is a boss for that one record, chosen by whoever opens it: for an offer, the seller. Its binding blocks (an offer's allocations) must each have the one before in their causal past.

## Who a block speaks for

A block speaks for one party, and a fold counts it for that party alone.
- A block that names a circle in `refs.as` speaks for the circle if its author holds the `sign` power in the circle's fold of the block's causal past (`may_act_as`; circles.md). If not, it speaks for no one (`no_role`): it is kept, and counts for nothing in any deal or any ownership.
- Any other block that acts under a live grant made for its author (or open) speaks for the grantor: the grant's author, or, when the grant was signed `as` a circle, that circle if the grant's signer held `sign` there.
- Any other block speaks for its author.

Every fold below asks this one question: a side of a deal, the owner of a thing, the receiver who accepts a transfer. Where a rule says a side "signs", this is what it means.

## Ownership

The orderer of an instance's ownership is its owner. A transfer of ownership counts only if signed by (speaks for, above) the owner the previous counted transfer named (or the maker, for the first), with that transfer in its causal past. The owner is the `to_owner` of the last counted ownership transfer, else the maker. **The maker is who the thing's block speaks for**: a share or stock made `as` a circle belongs to the circle, not to the member who signed it, and a thing made `as` a circle by someone without the `sign` power has no maker and no owner. A receiver's `accepted` answer counts when it speaks for the named receiver (a circle may receive, by a member who may sign for it). A transfer to a named receiver moves ownership, and holding, when the receiver answers it `accepted`; until then it stays with the giver. A transfer to an open receiver (a `count`) moves on the orderer's signature.

**Where a thing is now.** Its place is the `to_place` of its latest counted transfer signed by its owner, or by a holder the owner named in a transfer `to_holder`, else its own `refs.place`. If that place is a thing, the thing is wherever that place is, found the same way (stop at a repeat). A place that has no place of its own is itself the answer; a thing never moved and with no `refs.place` has no place, and the answer is empty. If two moves do not see each other, both places are the answer; that is not a lie.

## Equivocations

The two blocks of a pair (core.md, invariant 3) count for nothing in any fold, and so does every later block of the same key, until the key is rotated with a `counted_to` before the pair (identity.md). One fold is the exception: the identity fold counts both as the author's, so the key can still be rotated. A fold that meets a pair names it (`forks` in a promise, `conflict` in ownership) and counts only what came before it.

## A promise's stage

Input: the first promise P, and every block that names P in `for` or answers a block in the deal. A first promise that speaks for neither of its sides has no stage (null). The input may instead be an **allocation** (promises.md, Who may bind), the offerer's `accepted` answer to a request on an open offer O: it is read as a deal of its own (below). A promise with no `answers` is not in the deal even if it names P in `for`: it is a new deal that P serves.

**Step 0, who counts.** Keep only blocks that speak for a side (Who a block speaks for). An `updates` of a promise that is not a stop counts for nothing: the terms are those of the promise as written (promises.md). A side that names a thing is the thing's owner in the same blocks (promises.md, Bearer). An open side is filled by whoever's accept binds.

**The live offers.** P is live. A counter to a live offer (a promise that answers it and carries no status) between the same two sides, signed by the side that did not sign the offer it answers, makes that offer no longer live and is live in its place. Two counters to one offer both stand: there may be several live offers, and the fold says so (`live`, sorted). An accept binds the live offer it answers. Of all binding accepts, the earliest in causal order binds; two that do not see each other prove the accepter's lie: neither binds, and both are listed in `forks`.

**Then the stage is the first of these that holds, from the furthest along back to the start:**
1. **reversed:** the promise is done, and counted transfers back `for` it cover what was paid.
2. **done:** counted blocks cover the terms. For each line (or the whole), counted transfers move at least the quantity accepted of `what` to the `to` side (a promise with a `refs.what` and no quantity needs one counted transfer of it), and counted money transfers to the `from` side, in the price's own currency, total at least the price; money in another currency counts for nothing toward it. A price that is flat money is the total for the whole promise, or for the line it sits in (promises.md, Terms). A job or time promise moves no thing: it is done when the receiving side has `answers`-ed the worker's work blocks `accepted` and they cover `terms.quantity` (one accepted block is enough when it states none), and any price is paid. A standing promise is done occurrence by occurrence; an occurrence named in a `stop` is stopped.
3. **stopped** (onward): an answer `stopped` with `onward`. The promise is stopped from that block.
4. **underway:** a binding accept exists (promises.md, Who may bind), and counted blocks `for` it exist (promises.md, Settling).
5. **accepted:** a binding accept exists.
6. **stopped** (before): the author stopped it `before`, and no accept binds over the stop. An accept binds unless the stop is in its causal past.
7. **declined:** the other side answered `declined`, or, on a promise with two named sides, the other side holds a live STOP naming the author of the first promise (the `consent` fold, consent.md): a block sent despite a STOP is kept, and reads as declined in advance. Her own binding accept (stages 4 and 5) still wins.
8. **offered** (signed by `from`) or **asked** (signed by `to`).

**An allocation's deal.** If O's stage does not list the allocation among its `takers` (it is past what was offered, or it comes after a fork), it has no stage (null). Otherwise the head of the deal is the allocation, so the blocks that name it in `for` are its settling and nothing counts that names O or another allocation. The sides are O's, the open side being the taker who made the request; the binding accept is the allocation, `offer` is O, the terms are O's with the quantity the allocation names (else the request's), and `takers` lists that one taker. Stages 1 to 5 then read as for any deal. **An open offer's own stage** is `offered` or `asked` until an allocation binds, then `accepted` (or `stopped` onward by its offerer): nothing settles it, and its `quantity` and `total` are what its allocations bind together.

An accept that reached the offerer after `expires`, on the offerer's own clock, does not bind. Only the offerer's node can know it, so the offerer says so by answering the accept `declined`. The fold reads that answer and no clock.

**The view `promise_view`** returns the same answer, except that stage 8 becomes **expired** once the reader's own clock passes `expires` and nothing binds.

## Circle membership and roles

The fold reads the circle C and every member grant with `refs.subject` C, in causal order, by the rules in circles.md. The founder holds the first role in C's `roles`. A member grant counts if signed `as` C by a key of someone holding `admit` in the fold of its causal past. A circle whose actor lists no roles is refused (`bad_roles`); if a fold meets one anyway, the founder holds no role, so no one holds any power: no member grant counts and no one signs `as` the circle.

## What each fold returns

Every node returns the same names, so readers share one API. `protocol.json` (`folds`, `views`) gives each one's input and output. Ids and hashes are hex, and a list of them is sorted as text unless it says otherwise. A quantity a fold counts is a number in the line's unit (fold output, not signed content). A field that does not apply is null, or an empty list. What the list cannot say:
- `signed_by_author` is true for a block that is the id's, signed by a key that speaks for it, or a key grant the recovery key signed. Called with no arrivals it is the pure fold: every block of a rotated key after its `counted_to` is false. Called with the reader's arrivals it is the view `recovery_reach` (identity.md) applied: a block the reach protects is true as well.
- `accept` is the binding accept: the promise itself when made to oneself, the first allocation on an open offer (the allocation itself, in its own deal), the earliest accept of a live offer on a one-to-one deal. On an open offer `takers[].who` is whom the request speaks for, `quantity` is the sum of the takers' quantities in the offer's unit (exact, written with no trailing zeros), `total` the price for it, and `lines`, `paid` are empty. `offer` is the offer the binding accept answers; with no accept, the live offer when there is only one, else null. `live` lists every live offer, sorted. `forks` are allocations that do not see the one before, or accepts of live offers that do not see each other: proof, not counted. In `lines`, `moved` is capped at `needed` when a whole instance covers the line.
- `members` maps each id to `{ roles, grant, counted_to }`, `grant` the member grant that put them in, or the circle for the founder (with several current grants, the lowest hash, only to name one). `removed` maps each id that is out to the `counted_to` of the stop that took their last current grant, or null when it names none (of several that do not see each other, the lowest hash's).
- `where_now` is empty when no place is known, and two or more when moves cross. `ownership` has `owner` null after a transfer to an open receiver; with a `conflict`, `owner` is the owner before the crossing pair.
- A fold that counts a block for nothing has a code for why (`protocol.json`, `refusals.codes.fold`: `not_a_side`, `open_offer_counter`, `not_live`, `no_role`, `not_counted`, `equivocation`, `quote_only`). The code explains; it is not part of the fold's answer. `promise_stage` returns the stage alone, and `may_act_as` returns true or false. Two nodes agree when their answers agree.
- `chain(blocks, brought_in)` folds the blocks of **one signing key** (the caller passes only that key's blocks) with `brought_in`, the id of the block that brought the key in (the genesis or a key grant), which its first block names as `prev`. An identity with several keys has one chain per key. It reports `gaps`, the seq numbers missing, the lowest first and at most `limits.gaps_max` of them (a block may say `seq` 2^53 - 1); `ok` is false whether or not all are listed. A gap before a `skip` block is explained; any other gap is not. `length` counts the key's blocks that count: it leaves out both blocks of every equivocation pair and every later block of the key that follows one (Equivocations).

## Invariants

26. A fold reads only whole input, and is a function of it: the same blocks give the same answer on every node, whatever order they came in.
4. A record's binding blocks come from its one orderer and form one chain. Two that do not see each other prove a lie.
5. An instance has at most one owner in any fold.
31. A block speaks for one party: its author, the circle it names in `as` if its author may sign for it, or the grantor of the grant it acts under. A fold never counts it for another.
