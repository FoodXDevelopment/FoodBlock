# Profile: payment proof

Optional. Shows that a payment on an existing rail happened, without FoodBlock ever holding money.

**Adds:** the payment schemes, and a rule that the payment provider is the named confirmer.

- A payment is a `transfer` of money (things.md) with `state.marks` holding the rail's reference `[{ scheme, value }]`; `scheme` is any label (`mpesa`, `upi`, `pix`).
- A schema for each scheme names its **provider** in `grounds.confirmers`. The provider, or an adapter node the payee names, signs an `observe` of kind `payment` that `confirms` the transfer, with the callback's hash in `derives_from`.
- **An unsigned callback.** Where a rail signs nothing, the adapter's operator is the confirmer, and the `payment` observe says it vouches for an unsigned callback. A reader weighs the operator, not the rail.
- **The payee's own statement** is the strongest ground: the receiver's `answers` `accepted`, or the payee's `observe` that the money arrived. A callback is weighed beside it; a forwarded text or screenshot is evidence only.
- The confirmer's `confirms` is a ground, not a settlement (promises.md, Settling).
- A pay link or QR payload is an envelope, not a block. A failed or reversed payment is an `observe` that `defeats` the transfer.
