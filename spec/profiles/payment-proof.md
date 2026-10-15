# Profile: payment proof

Optional. Shows that a payment on an existing rail happened, without FoodBlock ever holding money.

**Adds:** the payment schemes, and a rule that the payment provider is the named confirmer.

- A payment is a `transfer` of money (things.md) with `state.marks` holding the rail's reference: `[{ scheme, value }]`. The `scheme` names the rail: `mpesa`, `mtn_momo`, `telebirr`, `upi`, `pix`, `qris`, `promptpay`, `raast`, `open_banking`, and any other label.
- A schema for each scheme names its **provider** in `grounds.confirmers`. The provider, or an adapter node its circle names, signs an `observe` of kind `payment` that `confirms` the transfer, with the callback's hash in `derives_from`.
- The receiver then answers the transfer `accepted`. The provider's `confirms` is a ground, not a settlement (promises.md, Settling).
- A pay link or QR payload is the envelope that carries the "pay" step. It is not a block.
- A failed or reversed payment is an `observe` that `defeats` the transfer.
