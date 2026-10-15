# Folds and views

A **fold** reads a set of blocks into one answer. A **view** reads a fold and one more thing: the reader's clock, or when blocks arrived on the reader's node.

**The promise of a fold:** any two nodes that hold the same set of blocks compute the same answer. A fold reads no clock and no arrival. Only a fold's answer may be called convergent.

**The promise of a view:** it is right for the reader that computes it, and says whose clock it used. Two readers may differ for a while, and neither is wrong. A view may show but never decide what another reader must accept. Only an orderer's own blocks trigger acts in the world.

Each fold and view is named in `protocol.json` (`folds`, `views`), with its input and output.

| Name | Kind | Reads | Where |
|---|---|---|---|
| `identity` | fold | blocks | identity.md |
| `chain`, `next_link` | fold | blocks | here |
| `ownership`, `where_now` | fold | blocks | here |
| `promise_stage` | fold | blocks | here |
| `circle_state`, `may_act_as`, `members_then` | fold | blocks | here |
| `consent` | fold | blocks | strangers.md |
| `promise_view` (adds `expired`) | view | the reader's clock | here |
| `live_grant` (`scope.until`) | view | the clock of the node that relies on the act, when it takes the block in | authority.md |
| `recovery_reach` | view | the reader's record of arrivals | identity.md |
| `withdrawal_seen` | view | arrival of the withdrawal on the counterparty's node | authority.md |
| `due` (relative `when`) | view | the performer's clock, from the anchor's arrival on its node | promises.md |

Profiles add `successor_view` (profiles/successor.md, the reader's arrivals and clock), `circle_key` (profiles/rekeys.md) and `counted_in` (profiles/ballots.md).

## Orderer

A record's **orderer** is the key that signed its first block, or the key its `state.orderer` names. It is a boss for that one record, chosen by whoever opens it: for an offer, the seller. Its binding blocks (an offer's allocations) must each have the one before in their causal past.

## Ownership

The orderer of an instance's ownership is its owner. A transfer of ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the first), with that transfer in its causal past. The owner is the `to_owner` of the last counted ownership transfer, else the maker. A transfer to a named receiver moves ownership, and holding, when the receiver answers it `accepted`; until then it stays with the giver. A transfer to an open receiver (a `count`) moves on the orderer's signature.

**Where a thing is now.** Its place is the `to_place` of its latest counted transfer signed by its owner, or by a holder the owner named in a transfer `to_holder`, else its own `refs.place`. If that place is a thing, the thing is wherever that place is, found the same way (stop at a repeat). If two moves do not see each other, both places are the answer; that is not a lie.

## Equivocations

The two blocks of a pair (core.md, invariant 3) count for nothing in any fold, and so does every later block of the same key, until the key is rotated with a `counted_to` before the pair (identity.md). One fold is the exception: the identity fold counts both as the author's, so the key can still be rotated. A fold that meets a pair names it (`forks` in a promise, `conflict` in ownership) and counts only what came before it.

## A promise's stage

Input: the first promise P, and every block that names P in `for` or answers a block in the deal. A promise with no `answers` is not in the deal even if it names P in `for`: it is a new deal that P serves.

**Step 0, who counts.** Keep only blocks signed by a side, or by an agent under that side's live grant. An open side is filled by whoever's accept binds. The live offer is P, or the latest counter between the same two sides.

**Then the stage is the first of these that holds, from the furthest along back to the start:**
1. **reversed:** the promise is done, and counted transfers back `for` it cover what was paid.
2. **done:** counted blocks cover the terms. For each line (or the whole), counted transfers move at least the quantity accepted of `what` to the `to` side, and counted money transfers to the `from` side, in the price's own currency, total at least the price. A job is done when the receiving side `answers` the worker's work block `accepted`. Time is done when accepted work blocks cover `terms.quantity`. A standing promise is done occurrence by occurrence; an occurrence named in a `stop` is stopped.
3. **stopped** (onward): an answer `stopped` with `onward`. The promise is stopped from that block.
4. **underway:** a binding accept exists (promises.md, Who may bind), and counted blocks `for` it exist (promises.md, Settling).
5. **accepted:** a binding accept exists.
6. **stopped** (before): the author stopped it `before`, and no accept binds over the stop. An accept binds unless the stop is in its causal past.
7. **declined:** the other side answered `declined`.
8. **offered** (signed by `from`) or **asked** (signed by `to`).

An accept that reached the offerer after `expires`, on the offerer's own clock, does not bind. Only the offerer's node can know it, so the offerer says so by answering the accept `declined`. The fold reads that answer and no clock.

**The view `promise_view`** returns the same answer, except that stage 8 becomes **expired** once the reader's own clock passes `expires` and nothing binds.

## Circle membership and roles

The fold reads the circle C and every member grant with `refs.subject` C, in causal order, by the rules in circles.md. The founder holds the first role in C's `roles`. A member grant counts if signed `as` C by a key of someone holding `admit` in the fold of its causal past. A circle whose actor lists no roles is refused (`bad_roles`); if a fold meets one anyway, the founder holds no role, so no one holds any power: no member grant counts and no one signs `as` the circle.

## What each fold returns

Every node returns the same names, so readers share one API. `protocol.json` (`folds`, `views`) gives each one's input and output. Ids and hashes are hex, and a list of them is sorted as text unless it says otherwise. A quantity a fold counts is a number in the line's unit (fold output, not signed content). A field that does not apply is null, or an empty list. What the list cannot say:
- `signed_by_author` is true for a block that is the id's, signed by a key that speaks for it, or a key grant the recovery key signed.
- `accept` is the binding accept: the promise itself when made to oneself, the first allocation on an open offer. `forks` are allocations that do not see the one before: proof, not counted. In `lines`, `moved` is capped at `needed` when a whole instance covers the line.
- `members` maps each id to `{ roles, grant, counted_to }`, `grant` the member grant that put them in, or the circle for the founder.
- `where_now` is empty when no place is known, and two or more when moves cross. `ownership` has `owner` null after a transfer to an open receiver; with a `conflict`, `owner` is the owner before the crossing pair.
- `chain` reports `gaps`, the seq numbers missing. A gap before a `skip` block is explained; any other gap is not. `length` counts the key's blocks that count: it leaves out both blocks of every equivocation pair and every later block of the key that follows one (Equivocations).

## Invariants

4. A record's binding blocks come from its one orderer and form one chain. Two that do not see each other prove a lie.
5. An instance has at most one owner in any fold.
