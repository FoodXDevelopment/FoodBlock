# Circles

A **circle** is an `actor` of kind `circle`, written by its founder as an ordinary block. Its id is that block's hash. A business, a household, a regulator and a community are each a circle. The circle's own state is read by the circle fold (folds.md).

- **Roles are data.** The circle actor lists its roles: `state.roles: [{ name, powers }]`. A `name` is any text in any language. `powers` are chosen from a closed list of machine tokens (`protocol.json`, `powers`):
  - `sign`: may sign blocks `as` the circle;
  - `admit`: may give member grants and change roles;
  - `remove`: may remove members.

  The protocol reads powers and never reads a role's name. The founder holds the first role in the list. A circle must list at least one role (`bad_roles`); a circle with none gives its founder no power, and so no one. `circle#role` (the circle's id, `#`, the role's name) names the holders of a role.
- **Membership** is a `grant` of kind `member`: `refs.subject` the circle, `refs.to` the member (left out, for an open group anyone may join), `refs.as` the circle, `state.roles` the role names it gives. It is signed by someone holding `admit`, and counts once the member's own `answers` accepts it.
- **Changing roles.** A holder of `admit` changes roles by an `updates` of the member grant. A role added counts once the member answers. A role taken away counts at once.
- **Signing for a circle.** A member names the circle with `refs.as`, and must hold, in the circle's fold at that block, a role with the power `sign`.
- **Leaving and removal.** A member leaves by an `answers` with `stopped`. A holder of `remove` removes a member by an `updates` of their grant with `stopped`, naming `counted_to` (identity.md), the member's last counted block. The member's blocks after it carry no authority for the circle.
- **Removed.** A member is removed when a grant they had accepted has ended (their own `stopped` or `declined` answer, or a remover's `stopped` update) and no newer grant has brought them back in. The fold keeps the `counted_to` the stop named (null if none). An invitation stopped before it is answered removes no one, and a later answer accepts nothing. A stopped grant stays stopped; rejoining needs a new grant, and a stop of an old grant never ends a newer one.
- **Removing someone who holds `admit` or `remove`** follows the circle's own rule, `state.removal: { needed: N }` on the circle actor: N other holders of `remove` must agree (default 1). When two removals cross, the remover whose grant is earlier in the circle's causal order (in the other's causal past) wins; the founder above all. If neither is earlier, both removals stand. No step reads `at` or a hash order.
- **The circle's key** is an encryption key in its actor (`state.public_key_encrypt`). A circle that must change it when members leave uses the key-epoch profile (profiles/rekeys.md).
- **Shared records.** A pot, a vote or an auction is a record many write to. It names its rule in `refs.under` (a schema). Blocks fold in causal order under the rule; the record's orderer orders what the rule leaves tied. The protocol has no rule language: the schema's `fields` and `grounds` say what counts, and a reader folds them. A secret ballot is a profile (profiles/ballots.md).
