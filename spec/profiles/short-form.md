# Profile: SMS, USSD and voice short form

Optional. For people whose only link is a feature phone. A block is too large for one SMS, so the person never holds it: their custodian does (identity.md, Held keys). The person gets a short receipt code.

**Adds:** the receipt code, and the order of steps a custodian follows.

**The steps**
1. The person sends words ("PLOUGH 2 TUE"), picks from a USSD menu, or speaks. The custodian keeps the raw message and takes its hash.
2. The custodian reads it (a menu, a parser, or a model) and **echoes the exact terms back once**, in the person's language: "Wanjiru: 20 kg tomatoes, Fri 7am, KES 2,200 to Joseph. Reply 1 to agree."
3. The person's reply to the echo is the decision. The custodian signs the block only on that reply. The block's `state.channel` names the link (`sms`, `ussd`, `voice`) and `derives_from` is the hash of the raw reply (strangers.md, section 4).
4. The custodian sends back the receipt code and a short result.

**The receipt code.** Take the first 5 bytes (40 bits) of the block's id, write them in Crockford Base32 (a base-32 alphabet with no easily confused letters), and show them as `XXXX-XXXX`. A label before it ("TOM-4821") is the custodian's own and not part of the code. The code is a lookup key inside one custodian, not an id and not an authority. If two of its blocks ever share a code, the custodian uses 10 characters. The custodian can show the whole block, signature and all, whenever the person asks.

**Voice.** The recording is kept by its hash. A transcript is a reading with a confidence (strangers.md, section 4). A spoken yes to the echoed terms is the decision.

**USSD.** Each finished menu path ends in the echo and a `1`. The menu is the custodian's. Only the echoed terms and the reply matter to the protocol.

**Public blocks over SMS.** A public block in its compact form (encoding.md) may be sent as base64url text split over parts numbered `k/n`. The receiver rebuilds the CBOR, then the JSON, and checks the signature as usual.

Every receipt ends with how to STOP, KEEP or MOVE (strangers.md, section 2).
