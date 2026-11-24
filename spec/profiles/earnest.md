# Profile: earnest

Optional, and node policy, not protocol. A node may hold back an ask that needs a person until the asker pays earnest money (nodes.md, A node's word). "Deposit" keeps one meaning in the spec: custody.

**Adds:** the admission field `earnest`, `{ amount, holder }`.

- The asker pays the named holder by a transfer `for` the ask. The holder is whoever both sides name; the node only if its admission rule says so.
- Earnest money is a title transfer to the named holder. What comes back is only the holder's own accepted promise: bailment or title transfer, no third kind (Hoppe, *The Economics and Ethics of Private Property*, p. 214).
- With no such promise, the earnest is a plain transfer and nothing is to come back: it paid for admission, which was delivered when the ask was read (promises.md, Paid for, never delivered: money that what moved does not pay for stays the payer's, and admission moved).
