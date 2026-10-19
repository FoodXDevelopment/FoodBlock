# Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: who receives it. Left out, it is open, like an open offer.
- `state.kind`: the grant's kind (below).
- `state.scope`: `{ acts, parties, limit, limit_commitment, per, until, notice, condition }`, data, never prose. `acts` lists the block types or `type.kind` names the grant covers. Names are matched, not checked: one that is neither covers nothing. A product's own words for what an autonomous system may do are mapped to these names before they are written; they never appear in `acts`.
- `refs.under`: every block signed under a grant names it. A reader checks the signer, the scope, and that the grant is live, and only when the block binds them.
- `refs.parent`: the grant this one comes from. `state.depth`: how many more times it may be passed on; with no `depth`, a grant cannot be passed on (`depth` 0).
- A grant others act under carries `scope.until`; key, member and operator grants do not.
- A grant takes effect when it is signed. The receiver may decline or leave by an `answers`. The exception is a member grant, which counts only after the member's own `answers` accepts it (circles.md).
- A grant has no status of its own. The author ends it by an `updates` that carries `status: stopped`.
- **The default is nothing.** A person who has said nothing has granted nothing. A grant that lets an autonomous system spend or bind exists only after the person's own words, echoed back to them once (identity.md, Held keys). Until then an autonomous system may ask and gather quotes.

**Scope subset rules.** A child's scope is a subset of its parent's on every field:
- `acts` and `parties`: sets; the child's is a subset. A missing field means "all", so a child may omit a field only if its parent does.
- `limit` and `per`: the child's limit is no larger, over a period no longer. `per` is a duration, the period a limit covers.
- `limit_commitment`: a child of a grant with a limit commitment carries a limit too: a commitment of its own, or a visible `limit`. Whether the child's amount is no larger can be checked only where the amount is (below); every reader checks the other fields.
- `until`: no later. `depth`: smaller by at least one. `notice`: no shorter.
- `notice` is the least time before an act that the autonomous system must have shown it to the principal on the principal's node, so the principal can stop it. Like `limit`, it is the principal's fence.
- Durations (`per`, `notice`) are compared by adding both to the same instant, the parent grant's `at`: arithmetic, never authority by clock.
- `condition`: the child keeps every condition of its parent and may add more.

**Whose clock tests `until`.** The clock of the node that relies on the act, read when it takes the block in. This is a view (folds.md, Views), not a fold. The autonomous system's `at` is never read. A micro with no clock leaves the test to its edge, which refuses to pass on an act outside `until`.

**The limit is the principal's fence, and it is sealed.** The other side sees only the visible scope: that the autonomous system may bind the principal, with them, until a time. The money limit stays on the principal's node, because a counterparty who knew a café's cap would price against it. A grant that has a limit says so in one of two ways:
- **A sealed limit (the default).** `scope.limit_commitment` is a commitment (privacy.md): the salted hash, in the grantor's suite, of the canonical JSON (RFC 8785) of `{ limit, per }`, where `limit` is money (`{ minor, currency }`) and `per` a duration, left out when there is none. The salt is 16 random bytes, hex, fresh for each grant. Any reader can check that the grant **carries** a limit commitment, and since a grant never changes once signed, the limit was fixed when it was signed and cannot be removed or raised afterwards. To change it, the grantor signs a new grant that `updates` the old one (a new commitment). The amount is an `observe` of kind `limit`, `for` the grant, with `state.limit`, `state.per` and `state.salt`, sealed to the autonomous system alone (privacy.md), so no other reader sees it. The principal's node and the autonomous system open the commitment: the observe's `limit`, `per` and `salt` must hash to the grant's `scope.limit_commitment` (door `limit_opens`; `limit_commitment` makes the value). An observe that does not open it is no limit.
- **A visible limit.** `scope.limit` (money), for a person who wants it public. A grant carries one or the other, never both.

An act over the limit but inside the visible scope still binds the principal, as with a stolen card.

**What a reader can check about a child's sealed limit.** The public check is that the child carries a limit (a commitment or a visible `limit`) when its parent does, and the subset rule for every other field. Whether the child's amount (and period) is no larger than its parent's cannot be seen without the two observes, so it is checked only on the principal's node, which holds both. A child's limit that the principal's node finds larger is a limit that does not hold there: the node refuses to count spending against it.

**Withdrawal.** A withdrawal binds a counterparty once it is in the causal past of the counterparty's block, or has arrived on its node. **Timing.** The view compares no times: it is true as soon as the counterparty's node records an arrival of the withdrawal, at any time, and false while it records none. A withdrawal that arrives after the counterparty's block was written does not undo that block; it binds from its arrival on. A counterparty binding a large amount first asks for the grantor's heads and names them in `after`, so what it had seen can be checked. `until` caps the damage while someone is offline. A withdrawal is how an offline peer learns of a stop: it learns on its next contact, and `until` is the bound until then.

**Stopping.** A grant's withdrawal and its `until` end authority, for a machine as for anyone. A peer honours a stop the moment it arrives. Before an act that cannot be undone, it also checks that every grant it acts under is still live against the grantor's latest head it holds.

**Acts that can be undone: the default is that they cannot.** An act **moves things or binds someone** when it is a `transfer`, a `transform`, or a `promise` that binds its principal (an offer or an `accepted` answer; not an ask, a `declined` or a `stopped`). An autonomous system that does one under a grant is acting irreversibly unless a schema says it may be taken back. A trusted schema that says `never` makes any block irreversible, whatever its type (a spray is recorded as an observe). The rule is closed by default:
- **Which schema.** Only the one the act names in `refs.schema`. An act that names none is unmarked. The protocol never looks for a schema by its `target`, so no one can mark an act they did not write.
- **Whose schema.** A schema counts only if it is the grantor's own (the grantor of the grant the act acts under: its author, or the circle it was signed `as`; the schema speaks for the same party, folds.md) or the grantor marked it trusted: wrote a block whose `refs.confirms` names it. A stranger's schema is ignored, for either word: it cannot block another person's act and it cannot unblock it.
- **What it says.** Every schema for such an act states `undo`, `never` (nothing can take it back: a cut, a spray, a valve opened, a robot sent) or `ok` (it can). A schema that omits it, writes any other word, or is not trusted leaves the act **unmarked**.
- **What the act needs.** Only an act marked `ok` by a trusted schema needs nothing more than the grant's scope. An act marked `never` and an unmarked act are the same: the block is `not_live` unless it has one of two things:
  - a specific ask the principal answered `accepted`, naming that act, or
  - a grant whose `scope.acts` names that act (its exact name, `type.kind`, or `type` for a block with no kind) and carries a limit: a `limit_commitment` or a visible `limit`.

A standing grant that lists only a broad kind of act is not enough. A person who acts herself, under no grant, is not held to this: the rule is for autonomous systems.

**How an ask names the act.** An ask names the act when its `state.what` is the act's name (`type.kind`), or when its `refs.schema` is the schema the act follows. The act's block names that ask in `refs.for`, and the principal's own `answers` of `accepted` is signed by the grantor of the grant it acts under, else the circle it signs `as`, else its author.

**Kinds the protocol reads:** `key`, `member`, `operator` (the list is in `protocol.json`; profiles add more). Every other kind is data whose meaning is its scope.
- `key` is read in identity.md, `member` in circles.md.
- `operator` names who answers for an autonomous system or a machine (identity.md): the grant's author answers for the actor in `refs.to`. **A sensor's operator** is the same grant with a `refs.subject`: the sensor's **owner** (the ownership fold of the sensor thing) signs an `operator` grant with the sensor thing as `refs.subject` and the one who may sign its readings as `refs.to`. No other field is used. With a `subject` the grant says who operates that thing, so its author answers for no one by it. A reading signed by the receiver counts as grounds, as do the sensor's own and the owner's (things.md, Truth; profiles/attestations.md, Devices). A grant of this kind signed by anyone but the owner counts for nothing.

## Invariants

6. Nothing that gives, takes or orders authority reads another author's `at`. Where a rule needs a clock, it says whose, and the answer is a view.
7. No tie on authority is broken by hash.
9. A grant is live only while every ancestor grant is live.
10. A child grant's scope is a subset of its parent's on every field.
23. An act that moves things or binds someone is irreversible for an autonomous system unless a trusted schema (the grantor's own, or one the grantor confirmed) says `undo: ok`; otherwise it needs a specific accepted ask, or a grant that names the act and carries a limit (sealed or visible).
