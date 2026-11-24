# Profile: key epochs for a circle

Optional. Changes a circle's encryption key when owners leave.

**Adds:** the field `state.epoch` on a key grant, and the fold `circle_key`.

- The key is in the circle actor (`state.public_key_encrypt`). It changes by **epoch**, a counter of key changes. Epoch 0 is the circle actor itself.
- A rekey is a key grant about the circle (`refs.subject`) signed `as` the circle, where a row holds for it, `state.epoch` one higher, the new private key sealed in `state.keys` to each owner of its parts in the circle fold of the block's causal past. It states only `public_key_encrypt` and brings in no voice of any list; it stands as any word `as` the circle does (blocks.md, Finality).
- A rekey of epoch n counts only if a row of the circle holds for it (circles.md, Rows) and its `after` names a counted rekey of epoch n-1.
- One rekey answers every leave since the last. Two rekeys in one epoch both open; the next settles it. Sharing old history with newcomers is a separate decision.
- `circle_key` returns the current `epoch`, the `keys` of the epoch's counted rekeys and their `grants`, sorted. At epoch 0 `grants` is empty. For a circle the folds cannot read it is epoch 0, no keys, no grants. It returns two or more keys while an epoch is split.
