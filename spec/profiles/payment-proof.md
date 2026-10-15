# Profile: payment proof

Optional. Shows that a payment on an existing rail happened, without FoodBlock ever holding money.

**Adds:** the payment schemes, and a rule that the payment provider is the named confirmer.

- A payment is a `transfer` of money (things.md) with `state.marks` holding the rail's reference: `[{ scheme, value }]`. The `scheme` names the rail: `mpesa`, `mtn_momo`, `telebirr`, `upi`, `pix`, `qris`, `promptpay`, `raast`, `open_banking`, and any other label.
- A schema for each scheme names its **provider** in `grounds.confirmers`. The provider, or an adapter node the payee names, signs an `observe` of kind `payment` that `confirms` the transfer, with the callback's hash in `derives_from`.
- **An unsigned rail callback.** Most rails sign nothing. Then the adapter's **operator** is the named confirmer, and the `payment` observe says so: it names the operator in `state.text` or its schema's field, and that it vouches for an unsigned callback. A reader weighs the operator, not the rail.
- The **payee's own statement** is preferred: the receiver's `answers` of `accepted`, or the payee's own `observe` that the money arrived, outweighs any callback. A forwarded text or screenshot never counts as proof.
- The receiver then answers the transfer `accepted`. The confirmer's `confirms` is a ground, not a settlement (promises.md, Settling).
- A pay link or QR payload is the envelope that carries the "pay" step. It is not a block.
- A failed or reversed payment is an `observe` that `defeats` the transfer.
