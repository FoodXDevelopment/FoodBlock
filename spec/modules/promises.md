# Promises

A promise moves a noun from one side to the other. Sides and what moves are in `refs`; `terms`, `what` (a description) and `not` are in `state`. A promise is read by the stage fold (folds.md, A promise's stage).

**Sides.** `refs.from` gives; `refs.to` receives. Either may be left out, which leaves it open: an offer open to anyone, or a want (an ask with `from` open, so offers can answer it). A promise signed by `from` is an **offer**; signed by `to`, an **ask**. What comes back (money, goods or nothing) flows the other way and is read from the transfers.
- **Only a side signs.** A promise is signed by a side: its author, the circle it signs `as`, or the grantor of the grant it acts under (that grant's author, or the circle it was signed `as`); otherwise `not_a_side`. A promise names a circle's side only through a signer the fold lets speak for it (folds.md, Who a block speaks for): an accept, answer or stop signed `as` a circle by someone without the `sign` power there binds no one (`no_role`), and a removed member's block after the cut speaks for no one. An answer or a stop is signed by a side of the deal it answers or stops in the same way. The grant is one the promise needs (core.md, check 5), so this is judged once it is held. What someone without a key said they would do is the receiver's own `observe` (kind `message`, then a reading of it), never a promise.
- **Bearer.** `refs.to` may name a thing: whoever owns it at settlement receives.
- **Who it is for.** `refs.for_whom`: a person, a circle, or open, written as a commitment. It reaches the other side only when it changes their work, and only as much as they need (`terms.needs`).
- **To yourself.** A promise whose `refs.from` and `refs.to` both name its author is accepted when made. The top of a plan is one.

**What moves** is `refs.what`: a thing (a kind in an offer or ask, an instance once known), a share, a record, or a circle. Time and a job are not things: `state.what` describes them under a schema, and `terms.quantity` says how much.

**The deal** is named by its first promise. A **first promise** is a promise with no `refs.answers`. Every later block in the deal (counter-offers, answers, transfers, work) names that first promise in `refs.for`, so two nodes never split one deal into two. An answer or counter that names another block in `refs.for` than its deal's first promise is refused (`deal_not_named`): the first promise is the one answered when that has no `answers`, else the `for` of the one answered. An answer or counter with **no** `refs.for` at all is `deal_not_named` too, whether or not the block it answers is held (the answer, being checked alone, cannot show that the deal's first promise is the one it answers). A first promise may itself carry `refs.for`: that names what it serves, such as the parent task of a sub-task. It starts a new deal and does not join the one it names.

**Terms:** `{ price, quantity, lines, pay_by, deliver_by, until, repeat, condition, expires, if_wrong, settled_by, needs, text }`.
- `price` is money, money per unit (`{ money, per }`, `per` an amount), or a share of something measured (`{ share, of }`: `share` a decimal string, `of` a schema saying what is measured). Under a per-unit price, `quantity` may be a range `{ min, max }`, and the answer's `terms.quantity` names the quantity chosen. A per-unit total is `money.minor` times the quantity over `per`, rounded to the nearest minor unit, halves up. **A flat money price** (`{ minor, currency }` with no `per`) is the total for the whole promise, or, inside a line of `lines`, the total for that line, whatever its quantity. An ask with no price asks for one: a price comes from the person or from their grant, never from a guess.
- `lines`: one order with many lines, `[{ id, what, quantity, price }]`, accepted at once. Each `id` is unique in the promise, and blocks for one line name it (`state.line`). `refs.what` equals the set of the lines' `what`. With `lines`, there is no top-level `price` or `quantity`.
- `until` is a return or end date; `expires` ends an unanswered offer or ask (every ask carries one).
- `repeat` is an RFC 5545 RRULE value, a standard text rule for repeating dates (`FREQ=WEEKLY;BYDAY=TU`). It is counted from the start of `state.when`. An occurrence is named by its start time.
- `condition` and `if_wrong` are data under a schema: what must be true, and what settles if it goes wrong. The protocol evaluates neither. The schema's grounds name who confirms them, and `settled_by` names who settles a dispute.
- `needs`: what the work must meet, from a schema, never a name.
- `text` names a plain-language terms document by its hash, so a court can read what both agreed.
- **Must-not.** `state.not: true` makes the promise a promise not to do the step.

**Relative time.** `state.when` may be `{ after, wait }`: `after` a block id, `wait` a duration. The step is due `wait` after that block arrives on the performer's node, counted on the performer's own clock, the way a successor's wait is. This is scheduling, never authority. If the anchor never arrives, the step waits and does not fire. A `repeat` counts from that start.

**Answers.** The other side's own block `answers` a promise. An answer has the type of the block it answers, names the deal in `for` when it is in one, and carries `state.status`. The type's other required fields do not apply to it. The statuses (`protocol.json`, `statuses`) are machine tokens, shown to people in their own language:
- `accepted`: binds.
- `declined`: ends it.
- `stopped`, with `state.stop` saying how far: `before` (before acceptance: a withdrawal), `onward` (from this block on: leaving a job), or `{ occurrences: [start times] }` (named occurrences of a standing promise).

A promise or grant has no status of its own: offered or asked is read from who signed it. Its author stops it by an `updates` that carries `status: stopped`. The other side stops it by an `answers`. A new promise that `answers` one, with no status, is a **counter-offer**: an answer whose state carries new terms and no `status`. It is the one answer without a status (core.md, section 7). It binds nothing until the other side answers it `accepted`.

**Who may bind.**
- A one-to-one offer binds on the other side's accept, with no allocation.
- An offer with an open side, limited in quantity or not, binds only through the offerer's **allocation**: its own `accepted` answer to an accept, signed by the deal's orderer (folds.md, Orderer). An accept to such an offer is a request.
- The quantity accepted is named in the answer's `terms.quantity`; on an open offer, the allocation names what binds.
- A counter ends an offer only between those two, and is signed by the side that did not sign the offer it answers. Only the author ends an open offer. Two counters that cross both stand: both offers are live. An accept binds the live offer it answers; of all binding accepts the earliest in causal order binds, and two that do not see each other prove the accepter's lie (neither binds, folds.md).
- An accept beats a withdrawal unless the withdrawal is in the accept's causal past. An accept that reaches the offerer after `expires`, on the offerer's own clock, does not bind (a view, folds.md); the offerer answers it `declined`.
- **An agent's ask is a quote request** unless its grant names the act. A promise signed by an agent under a grant whose `scope.acts` does not list `promise` can be answered by an offer, but no accept of it binds its principal. Only the principal's own `answers`, or a grant that names the act, makes it bind. So a background search can gather quotes and never commit anyone.

**Settling.** A promise settles by folding the counted blocks made `for` it: transfers, a transform, or the worker's own work. A giver's transfer counts when it moves ownership (folds.md, Ownership): to a named receiver, once the receiver answers it `accepted`; to an open receiver, on the orderer's signature. Any other counted block is one the receiver answers `accepted`, or one a confirmer the schema's grounds name confirms. A promise is never marked delivered by itself, so a deed is said once. A sensor reading is a ground a confirmer may cite; it never settles alone. A return in goods is a second promise `for` the first.

**Claims.** A claim is an ask by the receiving side `for` a past block when nothing was promised first. An unanswered claim or ask binds no one and is never a debt in any fold.

**Disputes** end one of two ways: the sides counter until both accept, or the party named in `settled_by` signs a ruling, and readers check the signer. Someone not named in advance can only propose.

**Many parties.** A promise is between two sides. A group buy is the circle's promise to the seller, plus each member's promise to the circle.

## Invariants

11. What is bound from an offer never exceeds what is offered.
12. A block counts in a deal only if it speaks for a side (folds.md, invariant 31).
13. A promise is settled only by blocks the receiving side accepts or the grounds confirm.
14. An unanswered ask or claim binds no one.
15. `answers` is the only consent to a deal.
22. A background ask never binds before the person's yes: an agent's ask is a quote request unless its grant names the act.
