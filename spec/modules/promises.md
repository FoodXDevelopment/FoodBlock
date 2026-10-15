# Promises

A promise moves a noun from one side to the other. Sides and what moves are in `refs`; `terms`, `what` (a description)
and `not` are in `state`.

**Sides.** `refs.from` gives; `refs.to` receives. Either may be left out, which leaves it open: an offer open to
anyone, or a want (an ask with `from` open, so offers can answer it). A promise signed by `from` is an offer; signed
by `to`, an ask. What comes back (money, goods or nothing) flows the other way and is read from the transfers.
- **Only a side signs.** What someone without a key said they would do is the receiver's own `observe` (kind message,
  then a reading of it), never a promise.
- **Bearer.** `refs.to` may name a thing: whoever owns it at settlement receives.
- **Who it is for.** `refs.for_whom`: a person, a circle, or open, written as a commitment. It reaches the other side
  only when it changes their work, and only as much as they need (`terms.needs`).
- **To yourself.** A promise whose `refs.from` and `refs.to` both name its author is accepted when made.

**What moves** is `refs.what`: a thing (a kind in an offer or ask, an instance once known), a share, a record, or a
circle. Time and a job are not things: `state.what` describes them under a schema, and `terms.quantity` says how much.

**The deal** is named by its first promise. Every later block in it (counter-offers, answers, transfers, work) names
that first promise in `refs.for`, so two nodes never split one deal into two.

**Terms:** `{ price, quantity, lines, pay_by, deliver_by, until, repeat, condition, expires, if_wrong, settled_by,
needs, text }`.
- `price` is money, money per unit (`{ money, per }`, `per` an amount), or a share of something measured (`{ share, of
  }`: `share` a decimal string, `of` a schema saying what is measured). Under a per-unit price, `quantity` may be a
  range `{ min, max }`, and the answer's `terms.quantity` names the quantity chosen. A per-unit total is `money.minor`
  times the quantity over `per`, rounded to the nearest minor unit, halves up.
- `lines`: one order with many lines, `[{ id, what, quantity, price }]`, accepted at once. Each `id` is unique in the
  promise, and blocks for one line name it (`state.line`). `refs.what` equals the set of the lines' `what`. With
  `lines`, there is no top-level `price` or `quantity`.
- `until` is a return or end date; `expires` ends an unanswered offer or ask (every ask carries one).
- `repeat` is an RFC 5545 RRULE value, counted from the start of `state.when`. An occurrence is named by its start
  time.
- `condition` and `if_wrong` are data under a schema: what must be true, and what settles if it goes wrong.
  `settled_by` names who settles a dispute.
- `needs`: what the work must meet, from a schema, never a name.
- `text` names a plain-language terms document by its hash, so a court can read what both agreed.
- **Must-not.** `state.not: true` makes the promise a promise not to do the step.

**Answers.** The other side's own block `answers` a promise. An answer has the type of the block it answers, names the
deal in `for` when it is in one, and carries `state.status`; the type's other required fields do not apply to it. The
status is one of three:
- `accepted`: binds.
- `declined`: ends it.
- `stopped`, with `state.stop` saying how far: `before` (before acceptance: a withdrawal), `onward` (from this block
  on: leaving a job), or `{ occurrences: [start times] }` (named occurrences of a standing promise).

A promise or grant carries no status: offered or asked is read from who signed it. The author stops their own promise
by an `updates` with `stopped`; the other side stops it by an `answers`. A new promise that `answers` one, with no
status, is a counter-offer.

**Who may bind.**
- A one-to-one offer binds on the other side's accept, with no allocation.
- An offer with an open side, limited in quantity or not, binds only through the offerer's allocation: its own
  `accepted` answer to an accept, signed by the deal's sequencer. An accept to such an offer is a request.
- The quantity accepted is named in the answer's `terms.quantity`; on an open offer, the allocation names what binds.
- A counter ends an offer only between those two. Only the author ends an open offer. Two counters that cross both
  stand.
- An accept beats a withdrawal unless the withdrawal is in the accept's causal past. An accept that reaches the
  offerer after `expires`, on the offerer's own clock, does not bind; the offerer answers it `declined`.

**Settling.** A promise settles by folding the counted blocks made `for` it: transfers, a transform, or the worker's
own work. A giver's transfer counts when it moves ownership (folds.md, Sequencer): to a named receiver, once the receiver
answers it `accepted`; to an open receiver, on the sequencer's signature. Any other counted block is one the receiver
answers `accepted`, or one a confirmer the schema's grounds name confirms. A promise is never marked delivered by
itself, so a deed is said once. A return in goods is a second promise `for` the first.

**Claims.** A claim is an ask by the receiving side `for` a past block when nothing was promised first. An unanswered
claim or ask binds no one and is never a debt in any fold. An `under` naming a law counts only for readers who trust
that law's author.

**Disputes** end one of two ways: the sides counter until both accept, or the party named in `settled_by` signs a
ruling, and readers check the signer. Someone not named in advance can only propose.

**Many parties.** A promise is between two sides. A group buy is the circle's promise to the seller, plus each
member's promise to the circle.

