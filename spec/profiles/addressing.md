# Profile: addressing by phone number or payment address

Optional. People are known by a phone number or a payment address, not a domain.

**Adds:** address marks on a contact, and the `marks` pull filter.

- A contact (identity.md) carries `state.marks: [{ scheme, value }]` with `scheme` `tel` (E.164, `+` and digits), `upi`, `pix`, `vpa` or any payment-address label, lowercased and trimmed.
- Anyone may write a contact for an address. The person claims it later by a `same_as` from their genesis. An index treats a claim as proven only when a custodian or the provider `confirms` that the person controls the address.
- A pull with a `marks` filter returns the contacts and claims for an address (nodes.md). It returns only public ones.
- A private contact keeps its address as a commitment (privacy.md).
- A node that holds someone's address never publishes it without their consent.
