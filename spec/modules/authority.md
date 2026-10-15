# Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: who receives it. Left out, it is open, like an open offer.
- `state.scope`: `{ acts, parties, limit, per, until, notice, condition }`, data, never prose. `acts` lists the block
  types or `type.kind` names the grant covers. Names are matched, not checked: one that is neither covers nothing. A product's own words for what an agent
  may do are mapped to these names before they are written; they never appear in `acts`.
- `refs.under`: every block signed under a grant names it. A reader checks the signer, the scope, and that the grant
  is live, and only when the block binds them.
- `refs.parent`: the grant this one comes from. `state.depth`: how many more times it may be passed on; with no
  `depth`, a grant cannot be passed on (`depth` 0).
- A grant others act under carries `scope.until`; key, member, successor and operator grants do not.
- A grant is live from when it is signed, and carries no status. The author ends it by an `updates` with `stopped`;
  the receiver may decline or leave by an `answers`.

**Scope subset rules.** A child's scope is a subset of its parent's on every field:
- `acts` and `parties`: sets; the child's is a subset. A missing field means "all", so a child may omit a field only
  if its parent does.
- `limit` and `per`: the child's limit is no larger, over a period no longer.
- `until`: no later. `depth`: smaller by at least one. `notice`: no shorter.
- Durations (`per`, `notice`) are compared by adding both to the same instant, the parent grant's `at`: arithmetic,
  never authority by clock.
- `condition`: the child keeps every condition of its parent and may add more.

**The limit is the principal's fence.** The other side sees only the visible scope: that the agent may bind the
principal, with them, until a time. The money limit stays on the principal's node: it is an `observe` of kind limit,
`for` the grant, with `state.limit` (and `per`), sealed to the agent alone, so no other reader ever sees it. An act over
the limit but inside the visible scope still binds the principal, as with a stolen card.

**Withdrawal.** A withdrawal binds a counterparty once it is in the causal past of the counterparty's block, or has
arrived on its node. A counterparty binding a large amount first asks for the grantor's heads and names them in
`after`, so what it had seen can be checked. `until` caps the damage while someone is offline.

**Stopping.** A grant's withdrawal and its `until` end authority, for a machine as for anyone. Before a physical act
that cannot be undone, a peer checks that every grant it acts under is still live against the grantor's latest head it
holds, and it honours a stop the moment it arrives.

**Kinds the protocol reads:** `key`, `member`, `successor`, `operator` (the list is in `protocol.json`). Every other
kind is data whose meaning is its scope.
- `key` is read in identity.md, `member` in circles.md. `operator` names who answers for an agent or a machine (identity.md); `refs.to` is the agent.
- `successor` gives a successor the right to act for a person after an event. `refs.to` is the successor.
  `state.witnesses` names who may record the event, `state.needed` how many must, `state.wait` how long the trigger
  waits (a duration), and `state.keys` holds the person's decryption keys sealed to the successor (an envelope, privacy.md, whose
  plaintext is a list of `x25519_private` keys), never signing keys.
  The trigger events are observes that name the successor grant in `refs.under`. The trigger waits `wait` after the
  needed witnesses' observes, measured by their arrival on the reader's own node; in that time any live key of the
  person, or the recovery key, stops it by `defeats` of an event observe. The successor then signs as themselves,
  `under` the grant, and reads only what the person could read and was free to pass on. The successor closes the
  person's chain with their own block: an `observe` of kind close, `refs.subject` the person.

