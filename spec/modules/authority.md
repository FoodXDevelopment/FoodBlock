# Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: who receives it. Left out, it is open, like an open offer.
- `state.kind`: the grant's kind (below).
- `state.scope`: `{ acts, parties, limit, per, until, notice, condition }`, data, never prose. `acts` lists the block types or `type.kind` names the grant covers. Names are matched, not checked: one that is neither covers nothing. A product's own words for what an agent may do are mapped to these names before they are written; they never appear in `acts`.
- `refs.under`: every block signed under a grant names it. A reader checks the signer, the scope, and that the grant is live, and only when the block binds them.
- `refs.parent`: the grant this one comes from. `state.depth`: how many more times it may be passed on; with no `depth`, a grant cannot be passed on (`depth` 0).
- A grant others act under carries `scope.until`; key, member and operator grants do not.
- A grant takes effect when it is signed. The receiver may decline or leave by an `answers`. The exception is a member grant, which counts only after the member's own `answers` accepts it (circles.md).
- A grant has no status of its own. The author ends it by an `updates` that carries `status: stopped`.
- **The default is nothing.** A person who has said nothing has granted nothing. A grant that lets an agent spend or bind exists only after the person's own words, echoed back to them once (strangers.md). Until then an agent may ask and gather quotes.

**Scope subset rules.** A child's scope is a subset of its parent's on every field:
- `acts` and `parties`: sets; the child's is a subset. A missing field means "all", so a child may omit a field only if its parent does.
- `limit` and `per`: the child's limit is no larger, over a period no longer. `per` is a duration, the period a limit covers.
- `until`: no later. `depth`: smaller by at least one. `notice`: no shorter.
- `notice` is the least time before an act that the agent must have shown it to the principal on the principal's node, so the principal can stop it. Like `limit`, it is the principal's fence.
- Durations (`per`, `notice`) are compared by adding both to the same instant, the parent grant's `at`: arithmetic, never authority by clock.
- `condition`: the child keeps every condition of its parent and may add more.

**Whose clock tests `until`.** The clock of the node that relies on the act, read when it takes the block in. This is a view (folds.md, Views), not a fold. The agent's `at` is never read. A micro with no clock leaves the test to its edge, which refuses to pass on an act outside `until`.

**The limit is the principal's fence.** The other side sees only the visible scope: that the agent may bind the principal, with them, until a time. The money limit stays on the principal's node: it is an `observe` of kind `limit`, `for` the grant, with `state.limit` and `state.per`, sealed to the agent alone, so no other reader ever sees it. An act over the limit but inside the visible scope still binds the principal, as with a stolen card.

**Withdrawal.** A withdrawal binds a counterparty once it is in the causal past of the counterparty's block, or has arrived on its node. **Timing.** The view compares no times: it is true as soon as the counterparty's node records an arrival of the withdrawal, at any time, and false while it records none. A withdrawal that arrives after the counterparty's block was written does not undo that block; it binds from its arrival on. A counterparty binding a large amount first asks for the grantor's heads and names them in `after`, so what it had seen can be checked. `until` caps the damage while someone is offline. A withdrawal is how an offline peer learns of a stop: it learns on its next contact, and `until` is the bound until then.

**Stopping.** A grant's withdrawal and its `until` end authority, for a machine as for anyone. A peer honours a stop the moment it arrives. Before an act that cannot be undone, it also checks that every grant it acts under is still live against the grantor's latest head it holds.

**Acts that cannot be undone.** A schema marks an act `undo: never` when nothing can take it back: a cut, a spray, a valve opened, a robot sent. A block for such an act is `not_live` unless it has one of two things:
- a specific ask the principal answered `accepted`, naming that act, or
- a grant whose `scope.acts` names that act and has a `limit`.

A standing grant that lists only a broad kind of act is not enough.

**How an ask names the act.** An ask names the act when its `state.what` is the act's name (`type.kind`), or when its `refs.schema` is the schema the act follows. The act's block names that ask in `refs.for`, and the principal's own `answers` of `accepted` is signed by the grantor of the grant it acts under, else the circle it signs `as`, else its author.

**Kinds the protocol reads:** `key`, `member`, `operator` (the list is in `protocol.json`; profiles add more). Every other kind is data whose meaning is its scope.
- `key` is read in identity.md, `member` in circles.md.
- `operator` names who answers for an agent or a machine (identity.md); `refs.to` is the agent.

## Invariants

6. Nothing that gives, takes or orders authority reads another author's `at`. Where a rule needs a clock, it says whose, and the answer is a view.
7. No tie on authority is broken by hash.
9. A grant is live only while every ancestor grant is live.
10. A child grant's scope is a subset of its parent's on every field.
23. An act that cannot be undone needs a specific accepted ask, or a grant that names the act and has a limit.
