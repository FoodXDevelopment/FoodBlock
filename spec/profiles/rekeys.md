# Profile: key epochs for a circle

Optional. Changes a circle's encryption key when members leave, so a leaver cannot read what comes next.

**Adds:** the circle power `rekey`, the field `state.epoch` on a key grant, and the fold `circle_key`.

- The circle's key is an encryption key in its actor (`state.public_key_encrypt`). It changes by **epoch**, a counter of key changes.
- A rekey is a key grant signed `as` the circle by a holder of `rekey`, with `state.epoch` one higher, holding the new private key sealed to each member in `state.keys`.
- A rekey of epoch n counts only if its signer holds `rekey` in the circle fold of its causal past, and its `after` names a counted rekey of epoch n-1 (epoch 0 is the circle actor itself).
- One rekey covers every leave since the last. Two rekeys in one epoch both open; the next one settles it. Sharing old history with newcomers is a separate decision.
- `circle_key` returns the current `epoch`, the `keys` of the epoch's counted rekeys, and their `grants`, all sorted. It returns two or more keys while an epoch is split.
