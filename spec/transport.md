# Transport: email is the envelope, FoodBlock is the letter

A convention beside the protocol. The protocol reads only the blocks that arrive, never the envelope.

## Sending
- The body is plain text made from the block, for any human reader.
- One attachment, `application/foodblock+json` (`.foodblock`), holds `{ "messages": [ ... ] }`: block messages (core.md, section 6), sealed when not public, with the author's genesis and the grant chain the autonomous system acts under.
- Header `FoodBlock-Hash: <hash>`. The `Message-ID` is random per envelope and matched to the block on the node, so a reply's `In-Reply-To` finds it without letting providers link envelopes.
- A receiving node may refuse or ignore a first message from a stranger (consent.md).
- **A second route carries the same bytes.** Sent again by another route (email, then a courier's drive), the block is the same signed block and is taken once, by its hash. A block re-signed is another block, with its own hash and its own `seq`.

## Receiving
- From a FoodBlock speaker: the blocks are checked like any push; the email adds nothing.
- From anyone else (words only): the receiver writes their own `observe` of kind `message`:
  - `refs.subject`: the sender, an `actor` of kind `contact` the receiver writes (no keys; anyone may later claim it is `same_as` a genesis);
  - `refs.derives_from`: the hash of the raw email (kept, because email signing keys rotate);
  - then a separate reading ("this says yes to the order"), `for` the deal's first promise: the autonomous system's, not the person's (things.md, Truth).
- A reply in words never `answers` a promise; only a signed block does. A fold may count "accepted, observed"; the reader weighs it.
- Raw message ids are never stored, only their hashes.

## What a carrier proves
Email authentication (DKIM and the like) shows which domain sent a message, not who said it. A node may keep the result in its own log; it never becomes a field of a block. The block's signature proves the author.

## Every other envelope
WhatsApp, SMS, USSD, voice, a letter, a QR code, a link: the body for humans, the block for machines. A person with held keys (identity.md, Held keys) acts by any of them: their custodian signs on their word, naming the channel as an open label and the raw message's hash. Words from anyone else are read as in Receiving. Where the link is too small for a block, the short form applies (profiles/short-form.md).

## Constrained links (CBOR)
Over a link too small for JSON, a public block travels in the compact CBOR form, `application/foodblock+cbor` (modules/encoding.md). The receiver rebuilds the canonical JSON; the id is the same. A clockless micro's blocks are timed by the edge's `receipt` (blocks.md, No clock).
