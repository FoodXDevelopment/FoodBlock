# Profile: payment proof

Optional. Shows that a payment on an existing rail happened; FoodBlock never holds money.

**Adds:** the payment schemes, and a rule that the payment provider is a named signer.

- A payment is a `transfer` that names no instance (things.md, Transfers) with `state.marks` holding the rail's reference `[{ scheme, value }]`; `scheme` is any label (`mpesa`, `upi`, `pix`).
- The payee's account word names the scheme's **provider** in `by` (promises.md, Where to pay me): a named signer, never a judge. The provider, or an adapter node the payee names, signs an `observe` of kind `payment` that `confirms` the transfer, with the callback's hash in `derives_from`. Its word adds to the payee's price only as a `received` that names, in `refs.derives_from`, her account word listing it in `by`, and in `state.destination` a place that word lists (`destinations: [{ destination, by }]`; promises.md, Where to pay me). A `received` that names none says only that it came.
- **An unsigned callback.** Where a rail signs nothing, whoever runs the adapter is the named signer, and the `payment` observe says it vouches for an unsigned callback. A reader weighs who runs it, not the rail.
- **The payee's own statement** is the strongest ground: the receiver's `answers` `accepted`, or the payee's `observe` that the money arrived. A callback is weighed beside it; a forwarded text or screenshot is evidence only.
- The provider's `confirms` is a ground, not a settlement (promises.md, Settling).
- A pay link or QR payload is an envelope, not a block. A failed or reversed payment is an `observe` that `defeats` the transfer. A reversal after the payment stood moves nothing back: it is a claim for the judge the sides chose, never a reversal (blocks.md, Finality). Where it came is the payee's word: her account word lists her places, and nobody else's word names one for her.
