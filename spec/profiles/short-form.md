# Profile: SMS, USSD and voice short form

Optional. For people whose only link is a feature phone. A block is too large for one SMS, so the person never holds it: their custodian does (identity.md, Held keys). The person gets a short receipt code.

**Adds:** the receipt code, and the order of steps a custodian follows.

**The steps**
1. The person sends words ("PLOUGH 2 TUE"), picks from a USSD menu, or speaks. The custodian keeps the raw message and takes its hash.
2. The custodian reads it (a menu, a parser, or a model) and **echoes the exact terms back once**, in the person's language: "Wanjiru: 20 kg tomatoes, Fri 7am, KES 2,200 to Joseph. Reply 1 to agree."
3. The person's reply to the echo is the decision. The custodian signs the block only on that reply. The block's `state.channel` names the link (`sms`, `ussd`, `voice`) and `derives_from` is the hash of the raw reply (things.md, Truth).
4. The custodian sends back the receipt code and a short result.

**The receipt code.** Take the first 5 bytes (40 bits) of the block's id (the 32 digest bytes; a hash name and colon in front, as in `sm3:`, is not part of them), write them in Crockford Base32 (a base-32 alphabet with no easily confused letters), and show them as `XXXX-XXXX`. A label before it ("TOM-4821") is the custodian's own and not part of the code. The code is a lookup key inside one custodian, not an id and not an authority. If two of its blocks ever share a code, the custodian uses 10 characters. The custodian can show the whole block, signature and all, whenever the person asks.

**The ask code.** A first ask to someone off the network carries the same code, taken from the signed ask's id by the same rule. It is the whole of what links her words to the signed block.
- **Typed.** She may type it any way a person does: case does not matter, a space or no hyphen is the same, and `O` reads as 0, `I` and `L` as 1 (Crockford's own rule). Eight characters match the short code. Ten match the long one. Any other length matches nothing.
- **The long code** is the first 50 bits of the id, ten characters, `XXXXX-XXXXX`. An asker who already has a live ask to the same number with the same short code writes the long code on the new one. A custodian whose index holds two blocks that share a short code asks her for the long one.
- **Her reply** is `YES <code>`, to a custodian of her choosing, from any number.
- **Resolving it.** The custodian looks the code up among asks it can see addressed to that number: first its own index (asks it holds, or has been synced), else the asker's node, which is named in the words and answers a lookup by code with the signed ask to the number it was sent to (the ask's audience, privacy.md). It keeps the ask and checks the block's signature and that it has not expired. A code that matches several asks makes it ask for the long one, and one that matches none signs nothing. The code is a lookup key and not an authority: the signed block is.
- **Binding.** The custodian echoes the exact terms of the signed ask once and signs her answer on her `YES` to the echo (steps above), for the number's custody. Her `STOP` before or after is recorded against the asker's side and binds the custodian too.

**Voice.** The recording is kept by its hash. A transcript is a reading with a confidence (things.md, Truth). A spoken yes to the echoed terms is the decision.

**USSD.** Each finished menu path ends in the echo and a `1`. The menu is the custodian's. Only the echoed terms and the reply matter to the protocol.

**Public blocks over SMS.** A public block in its compact form (encoding.md) may be sent as base64url text split over parts numbered `k/n`. The receiver rebuilds the CBOR, then the JSON, and checks the signature as usual.

Every receipt ends with how to STOP, KEEP or MOVE (consent.md).
