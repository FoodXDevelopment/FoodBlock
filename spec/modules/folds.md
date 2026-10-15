# Folds

A **fold** reads a set of blocks into one answer. Every node computes the same answer from the same blocks. Until
every block has arrived, a fold is a view; only the sequencer's own blocks trigger acts in the world.

**Sequencer.** A record's sequencer is the key that signed its first block, or the key its `state.sequencer` names.
Its binding blocks (an offer's allocations) must each have the one before in their causal past.

**Who owns an instance.** The sequencer of an instance's ownership is its owner. A transfer of ownership counts only
if signed by the owner the previous counted transfer named (or the maker, for the first), with that transfer in its
causal past. The owner is the `to_owner` of the last counted ownership transfer, else the maker. A transfer to a named
receiver moves ownership, and holding, when the receiver answers it `accepted`; until then it stays with the giver. A
transfer to an open receiver (a `count`) moves on the sequencer's signature.

**Where a thing is now.** Its place is the `to_place` of its latest counted transfer signed by its owner, or by a
holder the owner named in a transfer `to_holder`, else its own `refs.place`. If that place is a thing, the thing is
wherever that place is, found the same way (stop at a repeat). If two moves do not see each other, both places are the
answer; that is not a lie.

**Equivocations.** The two blocks of a pair (nodes.md) count for nothing in any fold, and so does every later
block of the same key, until the recovery key rotates the key with a `counted_to` before the pair (which voids both).
The identity fold is the exception (identity.md). A fold that meets a pair names it (`forks` in a promise,
`conflict` in ownership) and counts only what came before it.

**A promise's stage.** Input: the first promise P and every block naming P in `for`, or answering a block in the deal.
Take the first step that applies:
1. Keep only blocks signed by a side, or by an agent under that side's live grant. An open side is filled by whoever's
   accept binds. The live offer is P, or the latest counter between the same two sides.
2. The author stopped it `before` and no accept binds over the stop (one binds unless the stop is in its causal past):
   **stopped**.
3. The other side answered `declined`: **declined**.
4. No binding accept exists: **offered** (signed by `from`) or **asked** (signed by `to`); **expired** once the
   reader's clock passes `expires` (a view; the offerer's clock binds).
5. A binding accept (promises.md, Who may bind): **accepted**. Counted blocks `for` it (promises.md, Settling): **underway**.
6. **Done** when counted blocks cover the terms: for each line (or the whole), counted transfers move at least the
   quantity accepted of `what` to the `to` side, and counted money transfers to the `from` side, in the price's own currency, total at least the price. A job is done when the receiving side `answers` the worker's work block `accepted`; time, when accepted work
   blocks cover `terms.quantity`. A standing promise is done occurrence by occurrence; an occurrence named in a `stop`
   is stopped.
7. An answer `stopped` with `onward`: **stopped** from that block.
8. A done promise with counted transfers back `for` it covering what was paid: **reversed**.

**Circle membership and roles.** The fold reads the circle C and every member grant with `refs.subject` C, in causal
order, by the rules in circles.md. The founder holds `admin`. A member grant counts if signed `as` C by a key of someone
holding `admin` in the fold of its causal past.

**Audience members then.** A circle in a block's audience means the members in the fold of the circle's grants within
that block's causal past. A role means its holders there. So an author who wants new members in names the circle's
head in `after`.

**What each fold returns.** Every node returns the same names, so readers share one API. `protocol.json` (`folds`)
gives each fold's input and output. Ids and hashes are hex, and a list of them is sorted as text unless it says
otherwise. A quantity a fold counts is a number in the line's unit (fold output, not signed content). A field that
does not apply is null, or an empty list. What the list cannot say:
- `signed_by_author` is true for a block that is the id's, signed by a key that speaks for it, or a key grant the
  recovery key signed.
- `accept` is the binding accept: the promise itself when made to oneself, the first allocation on an open offer.
  `forks` are allocations that do not see the one before: proof, not counted. In `lines`, `moved` is capped at
  `needed` when a whole instance covers the line.
- `members` maps each id to `{ roles, grant, counted_to }`, `grant` the member grant that put them in, or the circle
  for the founder.
- `where_now` is empty when no place is known, and two or more when moves cross. `ownership` has `owner` null after a
  transfer to an open receiver; with a `conflict`, `owner` is the owner before the crossing pair.
- `fires` is `since` plus `wait`, and `fired` is true once the reader's clock reaches it.
- `circle_key` gives two or more `keys` while an epoch is split.

