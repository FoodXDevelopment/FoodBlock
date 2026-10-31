# Profile: earnest

Optional, and node policy, not protocol. A node may hold back an ask that needs a person until the asker pays earnest money (nodes.md, A node's promise). "Deposit" keeps one meaning in the spec: custody.

**Adds:** the admission field `earnest`, `{ money, holder }`.

- The asker pays the named holder by a transfer `for` the ask. The holder is whoever both sides name; the node only if its admission rule says so.
- Earnest money is a title transfer to the named holder. What comes back is only the holder's own accepted promise: bailment or title transfer, no third kind (Hoppe, *The Economics and Ethics of Private Property*, p. 214).
- The duty to return it is the holder's own accepted promise. With none, the earnest is a plain transfer and nothing is owed back: it paid for admission, which was delivered when the ask was read (promises.md, Paid for, never delivered: money paid for what was never delivered is owed back, and admission was).
