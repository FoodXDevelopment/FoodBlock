# Profile: key epochs for a circle

Optional. Changes a circle's encryption key when members leave, so a leaver cannot read what comes next.

**Adds:** the circle power `rekey`, the field `state.epoch` on a key grant, and the fold `circle_key`.

- The key is in the circle actor (`state.public_key_encrypt`). It changes by **epoch**, a counter of key changes. Epoch 0 is the circle actor itself.
- A rekey is a key grant about the circle (`refs.subject`) signed `as` the circle by a holder of `rekey`, `state.epoch` one higher, the new private key sealed to each member in `state.keys`.
- A rekey of epoch n counts only if its signer holds `rekey` in the circle fold of its causal past (authority.md, Who a block speaks for) and its `after` names a counted rekey of epoch n-1.
- One rekey covers every leave since the last. Two rekeys in one epoch both open; the next settles it. Sharing old history with newcomers is a separate decision.
- `circle_key` returns the current `epoch`, the `keys` of the epoch's counted rekeys and their `grants`, sorted. At epoch 0 `grants` is empty. For a circle the folds cannot read it is epoch 0, no keys, no grants. It returns two or more keys while an epoch is split.
