# Circles

A **circle** is an `actor` of kind circle, written by its founder as an ordinary block. Its id is that block's hash.
- **Membership** is a `grant` of kind member: `refs.subject` the circle, `refs.to` the member (left out, for an open
  group anyone may join), `refs.as` the circle, `state.roles` the roles it gives. It is signed by an admin, and counts
  once the member's own `answers` accepts it.
- **Roles.** A role is a word. The protocol reads one: `admin`. The founder is the first admin. An admin gives roles
  by a member grant, and changes them by an `updates` of it: a role added counts once the member answers, a role taken
  away counts at once. `circle#role` (the circle's id, `#`, the role) names the role's holders.
- **Signing for a circle.** A member names the circle with `refs.as`, and must hold, in the circle's fold at that
  block, a role listed in the circle actor's `state.signers` (default `[admin]`).
- **Leaving and removal.** A member leaves by an `answers` with `stopped`. An admin removes a member by an `updates`
  of their grant with `stopped`, naming `counted_to` (identity.md), the member's last counted block; the member's blocks after it
  carry no authority for the circle.
- **Removed.** A member is removed when a grant they had accepted has ended (their own `stopped` or `declined` answer,
  or an admin's `stopped` update) and no newer grant has brought them back in. The fold keeps the `counted_to` the
  stop named (null if none). An invitation stopped before it is answered removes no one, and a later answer accepts
  nothing. A stopped grant stays stopped; rejoining needs a new grant, and a stop of an old grant never ends a newer
  one.
- **Removing an admin** follows the circle's own rule, `state.removal: { needed: N }` on the circle actor: N other
  admins must agree (default 1). When two removals cross, the admin whose admin grant is earlier in the circle's
  causal order (in the other's causal past) wins; the founder above all. If neither is earlier, both removals stand.
  No step reads `at` or a hash order.
- **The circle's key** is an encryption key in its actor (`state.public_key_encrypt`). It changes by epoch: an admin's
  key grant signed `as` the circle, with `state.epoch` one higher, holding the new private key sealed to each member
  in `state.keys`. A rekey of epoch n counts only if its signer holds `admin` in the fold of its causal past and its
  `after` names a counted rekey of epoch n−1 (epoch 0 is the circle actor itself). One rekey covers every leave since
  the last. Two rekeys in one epoch both open; the next settles. Sharing old history with newcomers is a separate
  decision.
- **Shared records.** A pot, a vote or an auction is a record many write to. It names its rule in `refs.under` (a
  schema). Blocks fold in causal order under the rule; the record's sequencer orders what the rule leaves tied.
- **A secret ballot.** A vote's rule may name a counter. Each vote is sealed to the counter alone and carries the
  choice as a commitment. The counter signs the result, listing the commitments counted in `state.counted`, so each
  voter can check theirs was counted.

