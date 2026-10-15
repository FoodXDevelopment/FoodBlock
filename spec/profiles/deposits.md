# Profile: deposits

Optional, and a matter of node policy, not protocol. A node may hold back an ask that needs a person until the asker pays a deposit.

**Adds:** the admission field `deposit`, `{ money, holder }`.

- The asker pays the deposit to the named holder by a transfer `for` the ask. The holder is never the node unless the node may legally hold money.
- The holder returns it by a transfer back once the ask is answered, unless the owner's rule says otherwise.
- FoodBlock itself never holds money. This profile only names the shape so two nodes read the same admission rule.
