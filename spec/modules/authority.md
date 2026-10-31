# Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: the receiver, one id. Left out, it is open. A `refs.to` naming a set of ids names no one, so no one receives that grant.
- **To a role:** `refs.to` a circle and `state.to_role` a role's name. Whoever holds the role in the circle's fold of their block's causal past receives it, and no one else (circles.md); one who loses it acts under it no more, even from a block that has not seen the loss (The cut). A micro relies on no grant to a role. Only a grant others act under carries `to_role`, never a key, member, operator or successor grant. `to_role` with no `refs.to` is `required`; not non-empty text, or with `state.depth` 1 or more (a grant to a role is not passed on), is `shape`. Holders do not decline it: the circle's grantor stops it.
- `state.kind`: the grant's kind (Kinds, below).
- `state.scope`: `{ acts, parties, limit, limit_commitment, every, each, until, notice, condition }`, data, never prose. `acts` lists block types or `type.kind` names, matched exactly and never checked: a name that is neither covers nothing, and `promise.purchase` covers a promise of kind `purchase` only (an accept under it names the kind too). `parties` lists the ids the acts may deal with: a block counts only when every side it deals with is in `parties`, its principal aside. Its sides are the ids in `refs.from`, `to`, `to_owner`, `to_holder` and, for an answer, the sides of the block answered (or that block's author when it names none). A grant that states no `parties` names no one: its acts deal with no one but the principal, never with everyone. A grantor who wants more lists the ids. What a grantor does not write, the grant does not allow. A missing `acts` covers no act (list the acts you give). A missing `limit` and `each` (and `limit_commitment`) lets no money or amount move under the grant (invariant 23). A missing `every` makes the limit cover all time, the narrowest reading. A missing `until` is not a wider grant: it lasts until its author stops it, and an end date only narrows. A missing `notice` or `condition` names none, and the protocol fills nothing in for it. `limit`, `each`, `notice` and `condition` are the principal's fence, tested on the principal's node: a fold reads only whether a limit is there (invariant 23), never an amount, `notice` or `condition`.
- `refs.under`: every block signed under a grant names it. A reader checks the signer, the scope (acts by exact name, parties), that the grant is live, and invariant 23. This one test is the door's `why_not_under`; every fold applies it. A block that fails it speaks for its author alone; the one exception is a quote request (promises.md, An autonomous system's ask).
- `refs.parent`, `state.depth`: a grant passed on names its parent. `depth` is how many more times it may be passed on, a whole number of 0 or more (`shape`); with none, 0. Only the receiver passes a grant on: a child signed by anyone else is `not_receiver`, as is any child of a parent with no receiver (open, or `refs.to` not one id). A grant to a circle is passed on by a child signed `as` that circle, no wider than given; whether its signer may sign for the circle is judged in the fold.
- **`scope.until` is optional on every kind.** With one the grant ends then; with none, when its author stops it. For a member, key or operator grant it is read like a cut at that time: a block dated at or after it holds no role by that membership (circles.md), is spoken for by no key that grant brought in, and has no operator by it (identity.md).
- A grant takes effect when signed, except a member grant and an operator grant, which count once the receiver's own `answers` accepts (circles.md; identity.md). A grant has no status of its own: a block with `state.status` is a stop or an answer, never a grant, whatever else it restates. For a block relying on a grant, only the `confirms` in its causal past count.
- **One agent, many principals.** A grant names a task, never an exclusive role, unless it says so. One person may hold grants from several principals for the same task, each act under one grant speaks for that grant's principal alone, and an employee may compete with his own principal's contractors, who hold grants of their own for the same task.
- **Silence grants nothing.** A grant that lets an autonomous system spend or bind exists only after the person's own words, echoed back once (identity.md, Held keys). Until then it may ask and gather quotes.

## Who a block speaks for

A block speaks for one party, and a fold counts it for that party alone (`speaks_for`). Every fold asks this; where a rule says a side "signs", this is what it means.
- A block naming a circle in `refs.as` speaks for the circle if its author holds `sign` in the circle's fold of the block's causal past (`may_act_as`; circles.md). Else it speaks for no one (`no_role`): kept, and counting for nothing.
- Any other block under a live grant made for its author, or open, speaks for the grantor: its author, or the circle if the grant was signed `as` it by a signer holding `sign`. "Made for its author" includes a grant to a role the author holds in the fold of the block's causal past. Not a grant the block acts under: one not live; one whose `scope.until`, or a grant's above it, is at or before the block's own `at` (Whose clock tests `until`); a successor grant with no counted close of its grantor in the block's causal past (profiles/successor.md). The block must pass the door's `why_not_under`: live, its act named in `scope.acts`, every side in `scope.parties`, and, for an act that moves things or binds, invariant 23. A fold and the door never disagree. A block that fails speaks for its author alone, except that a promise with no status (offer, ask, counter) under a live grant made for its author speaks for its principal as a quote request, and binds no one.
- A sensor's reading speaks for the sensor when its signer is the sensor, its owner, or the receiver of the owner's `operator` grant with the sensor as `refs.subject` (Kinds).
- Any other block speaks for its author.

**A delegation carries its moment.** A grant is one of the blocks an act under it rests on (`refs.under`, core.md, check 5), so an act is judged only when the grant is in its causal past, and no act under a grant can precede the grant. Copies carry no power (core.md, section 10).

## Ending

One rule ends anything a block gave: a grant, a promise, a member or operator grant, a transfer. Callers keep only their own consequence.
- The **author** ends it by an `updates` with `status: stopped`; the **receiver** by an `answers` with `stopped` or `declined` (leaving). A thing signed `as` a circle is ended by its author or anyone who may sign for the circle; a stop `as` the circle by anyone else ends nothing. A grant signed `as` a circle by one who may not sign for it (no `sign`, or not the hands needed: circles.md, Many hands) is not live (`no_role`).
- Only a **counted** stop ends: a stop of a forked key frees no one (folds.md, A fork is a burden). A key grant is ended only by rotation (identity.md); a stop of it ends nothing.
- It ends the thing for every block with the stop in its causal past, and no other; what was done before stands. A stop cuts where signed (The cut), except that it also cuts every key grant an operator signs under the grant that it does not see (identity.md, Autonomous systems and machines).
- **Death** ends a grant a person gave in their own name (not `as` a circle, not their successor grant) at a counted `close` of them (profiles/successor.md) that does not name it in `state.continues`, for every block with the close in its causal past.
- **A stop binds a counterparty** once it is in the causal past of the counterparty's block or has arrived on its node. The view compares no times: true once the node records an arrival, false until. A later arrival does not undo the block; it binds from then on. A stop is how an offline peer learns of an end; `until` bounds it. An act signed after a stop has arrived on its node is not covered by the grant it stopped, and one that names the grantor's heads in `after` shows the stops it had seen. A counterparty who asks for those heads before binding a large amount does so for its own sake, never by a duty of the spec.
- **A decline reaches back only as far as its signer's stated window.** A receiver's `declined` voids a late accept only when the offer or transfer carried `expires`; with none it is firm. It voids nothing when a signed receipt shows the accept reached the node in time, or a counted block of the offerer's side has acted on the accept (promises.md, Answers; things.md, Transfers).
- **A delayed power.** Named signers give a power after a wait: `needed` of them said it (folds.md, Counts) and `wait` has passed with no `defeats` from the holder's own key. Successor, custody step-up and rekeys read this.

## The cut

A stop cuts where it was signed: the stop itself. A signed word is never unsigned, so `counted_to` is read only for a recovery key's rotation (identity.md, Rotation); every other stop (removal, leaving, death, rotation by the key or its operator) cuts at itself whatever `counted_to` it names. What others built on before seeing the cut stands (folds.md, Built-on stands). Where several stops end one thing, a block must be within each cut. Consequences are each module's: identity.md voids the rotated key's blocks that have the rotation in their causal past; circles.md sets aside a member's blocks that are neither the stop nor in its causal past.

## Scope subset

A child's scope is a subset of its parent's on every field. A missing `acts` or `parties` means "none", so a child may omit either always, and may list names only if its parent lists them. On the other fields a missing field is not narrower, so a child may omit one only if its parent does.

| Field | Child must be |
|---|---|
| `acts`, `parties` | a subset (a field left out names none) |
| `limit`, `every` | no larger limit over no shorter period, in the parent's currency or unit (else wider), compared exactly (core.md, section 3); no `every` means all time, so a child with `every` under it is wider |
| `each` | no larger, same currency or unit |
| `limit_commitment` | a child of a grant with one carries a limit too (its own commitment or a visible `limit`); its amount is checked only where the amount is |
| `until` | no later |
| `depth` | smaller by at least one |
| `notice` | no shorter (the least time before an act that the autonomous system must have shown it to the principal on the principal's node) |
| `condition` | every parent key with the same value (canonical form), or, for a list or single value, every item; more may be added |

A limit is money or an amount (`{ value, unit }`). `every` and `notice` are durations, compared by adding both to the parent grant's `at`: arithmetic, never authority by clock. A grant with `every` or `notice` carries `state.at` (`required` otherwise).

## Whose clock tests `until`

**The act's own date:** an act whose `at` is at or after the `until` of its grant, or any above it, acts under none, on every node: its signer's own date says the grant had run out. An act with no `at` is cut too: silence only narrows. **The relying node's clock:** that node also tests `until` on its own clock when it takes the block in. This is a view (folds.md, Views), not a fold, and only it can refuse an act dated early but sent late. A micro with no clock leaves the test to its edge, which refuses to pass on an act outside `until`.

## The limit is the principal's fence, and it is sealed

The limit and the cap on each act stay on the principal's node; a counterparty who knew them would price against them. A grant says it has a limit in one of two equal ways, never both:
- **Sealed.** `scope.limit_commitment` is a commitment (privacy.md, A commitment), in the grantor's suite, of the RFC 8785 JSON of `{ limit, every, each }`, each left out when none. The salt is 16 random bytes, hex (`grammar.salt`), fresh per grant. Any reader can check the grant carries one; a grant never changes, so the limit cannot be removed or raised afterwards. To change it the grantor signs a grant that `updates` the old one. The amount is an `observe` of kind `limit`, `for` the grant, with `state.limit`, `every`, `each` (those it has; a cap on each act alone is a limit) and `salt`, sealed to the autonomous system alone (privacy.md). The principal's node and the autonomous system open it: the values must hash to `scope.limit_commitment` (door `limit_opens`; `limit_commitment` makes the value), else it is no limit. A sealed scope never shows `each` beside its commitment (`shape`).
- **Visible.** `scope.limit` and `scope.each`, each zero or more (`shape`).

**A visible limit binds the counterparty too.** An act whose own value (a transfer's money or amount; a promise's total at the quantity chosen, an accept reading the offer it answers) is past the `limit` or `each` of a public grant (one naming no `audience`) is not under the grant: it does not bind its principal, as signed. Nothing is cut down to the limit: that would fill in what the principal never signed. An order in another currency or unit than the visible limit cannot be shown to fit, so it does not bind either. The counterparty could read the fence, so it cannot say it did not know; ground: a signed word binds only what it names. A sealed limit (`limit_commitment`), or a grant with an audience, keeps the rule that the fence is the principal's alone, tested on the principal's node: an act past it still binds the principal. The principal's node tests an act by the door `within_limit(fence, value, spent)`: `spent` is what it has counted in the period (minor units or the amount's value, a whole number or decimal string); sum and caps are compared exactly; another currency or unit, a `spent` that is no number, or a value or `spent` below zero is never within. The door `limit_fence` writes the limit observe.

**A child's sealed limit.** Publicly checkable: the child carries a limit when its parent does, and the subset rule for other fields. Whether its amount is no larger and period no shorter is checked only on the principal's node, which holds both observes, by the door `limit_within_parent(child, parent, at)`: the visible rules, periods added to the parent's `at`. A fence the write check would refuse (limit below zero, `every` no duration) is junk: never within (folds.md, What each fold returns). A child limit the node finds larger does not hold there: it counts no spending against it.

**A limit is a figure, never a formula.** A grant's `limit` and `each` are money or an amount. "Up to what this sack fetches" varies, so no grant carries it: FoodOS works out a figure for the read-back and the grant carries that number. **"Do as you see fit"** is a list of powers named by hash (a rulebook entry, profiles/rulebooks.md): the grant carries the list in `scope.acts`, each act by its exact name, and nothing is read into the phrase.

## Acts that can be undone

A grant covers only acts its grantor's own word names. An act **moves things or binds someone** when it is a `transfer`, a `transform`, or a `promise` that binds its principal (an offer or `accepted` answer; not an ask, `declined` or `stopped`). An autonomous system doing one under a grant acts irreversibly unless a schema says it may be taken back. A trusted schema that says `never` makes any block irreversible.
- **Which schema:** only the one the act names in `refs.schema`; none, unmarked. The protocol never finds a schema by `target`.
- **Whose:** the grantor's own (author of the grant the act acts under, or the circle it was signed `as`), or one the grantor marked trusted by a block whose `refs.confirms` names it. A stranger's is ignored for either word.
- **What it says:** `undo`, `never` or `ok`. Omitted, another word, or untrusted leaves the act **unmarked**.
- **What the act needs:** `ok` by a trusted schema needs nothing beyond the scope. `never` and unmarked are the same: the block is `not_live` unless it has
  - a specific ask the principal answered `accepted`, naming that act, or
  - a grant whose `scope.acts` names that act (exact name, `type.kind`, or `type` for a block with no kind) and carries a limit: `limit_commitment`, visible `limit`, or visible `each`.

A grant listing only a broad kind of act is not enough. A person acting herself, under no grant, is not held to this, nor is a successor after the person's death (profiles/successor.md).

**An ask names the act** when its `state.what` is the act's name (`type.kind`) or its `refs.schema` is the schema the act follows. The act names the ask in `refs.for`, and the principal answers it `accepted` (an `answers` signed by the grantor of the grant it acts under, else the circle it signs `as`, else its author, and counted), with no stop or decline of the ask by the principal in the act's causal past. **One ask backs one act:** of the acts under a grant naming the ask that move things or bind, only the first in causal order is backed; two that do not see each other are both unbacked.

## Kinds the protocol reads

`key`, `member`, `operator` (`protocol.json`; profiles add more). Any other kind is data whose meaning is its scope. `key` is read in identity.md, `member` in circles.md. `operator` names who answers for an actor (an autonomous system, a machine, anyone): the author answers for the actor in `refs.to`, once it has accepted (identity.md). **A sensor's operator** is the same grant with `refs.subject`: the sensor's **owner** (ownership fold of the sensor thing) signs an `operator` grant with the sensor as `refs.subject` and the one who may sign its readings as `refs.to`. No other field is used, and its author answers for no one by it. Signed by anyone but the owner, it counts for nothing.

## Invariants

6. Nothing that gives, takes or orders authority reads another author's `at`. An act's own `at` is its signer's word against their own grant's `until`. Where a rule needs a clock, it says whose, and the answer is a view.
7. No tie on authority is broken by hash.
9. A grant is live only while every ancestor grant is live.
10. A child grant's scope is a subset of its parent's on every field.
23. An act that moves things or binds someone counts as inside a grant only where the grantor's own word names it: a trusted schema that says `undo: ok`, a specific accepted ask, or a grant that names the act and carries a limit (sealed, visible, or a cap on each act).
