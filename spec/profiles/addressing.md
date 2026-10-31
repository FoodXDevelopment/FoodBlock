# Profile: addressing by phone number or payment address

Optional. People are known by a phone number or a payment address, not a domain.

**Adds:** address marks on a contact, and the `marks` pull filter.

- A contact (identity.md) carries `state.marks: [{ scheme, value }]`: `scheme` is `tel` (E.164, `+` and digits), `upi`, `pix`, `vpa` or any payment-address label, lowercased and trimmed.
- Anyone may write a contact for an address. The person claims it by a `same_as` from their genesis. A reader may count the claim as proven when a confirmer it trusts `confirms` it.
- A pull with a `marks` filter returns the public contacts and claims for an address (nodes.md).
- A private address is expected committed (privacy.md, A commitment).
- A node may promise never to publish an address without the person's consent (nodes.md, A node's promise).
