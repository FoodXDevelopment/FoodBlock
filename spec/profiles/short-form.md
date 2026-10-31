# Profile: SMS, USSD and voice short form

Optional. For people whose only link is a feature phone. A block is too large for one SMS, so the person never holds it: their custodian does (identity.md, Held keys). The person gets a short receipt code.

**Adds:** the receipt code, and the steps a custodian that adopts this profile follows, by its own promise (nodes.md, A node's promise).

**The steps**
1. The person sends words, picks from a USSD menu, or speaks. The custodian keeps the raw message and takes its hash.
2. The custodian reads it (menu, parser or model) and **echoes the exact terms back once**,, in the person's language, with "Reply 1 to agree"
3. The person's reply is the decision. The custodian signs only on that reply. `state.channel` names the link (`sms`, `ussd`, `voice`); `derives_from` is the hash of the raw reply (things.md, Truth).
4. The custodian sends back the receipt code and a short result.

**The receipt code.** Take the first 5 bytes (40 bits) of the block's id (the digest bytes; a hash name and colon in front is not part of them), in Crockford Base32, as `XXXX-XXXX`. The code is a lookup key inside one custodian, never an id or an authority. If two of its blocks share a code, it uses 10 characters.

**The ask code.** A first ask to someone off the network carries the same code, from the signed ask's id by the same rule. It is all that links her words to the signed block.
- **Typed.** Case does not matter, a space or no hyphen is the same, `O` reads as 0, `I` and `L` as 1. Eight characters match the short code, ten the long one; any other length matches nothing.
- **The long code** is the first 50 bits of the id, ten characters, `XXXXX-XXXXX`. An asker with a live ask to the same number with the same short code writes the long code on the new one. A custodian whose index holds two blocks sharing a short code asks her for the long one.
- **Her reply** is `YES <code>`, to a custodian of her choosing, from the number the ask was sent to, or from a number its holder tied to that one by her own `same_as` or `grant`. A `YES` from any other number is only a message: the custodian signs nothing for it, whoever learned the code.
- **Resolving.** The custodian looks the code up among asks it can see addressed to that number: its own index, else the asker's node (named in the words), which answers a lookup by code with the signed ask (the ask's audience, privacy.md). It checks the signature and that the ask has not expired. A code matching several asks makes it ask for the long one; one matching none signs nothing.
- **Binding.** The custodian echoes the signed ask's exact terms once and signs her answer on her `YES` to the echo, for the number's custody. Her `STOP` before or after is recorded against the asker's side (consent.md); a custodian that holds the number's custody honours it by its policy (custody.md).

**Voice.** The recording is kept by its hash; a transcript is a reading (things.md, Truth). A spoken yes to the echoed terms is the decision. **USSD.** Each menu path ends in the echo and a `1`.

**Public blocks over SMS.** A public block in its compact form (encoding.md) may be sent as base64url text split over parts numbered `k/n`. The receiver rebuilds the CBOR, then the JSON, and checks the signature as usual.

A custodian's policy may promise that every receipt ends with how to STOP, KEEP or MOVE (consent.md, custody.md).
