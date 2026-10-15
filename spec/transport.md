# Transport: email is the envelope, FoodBlock is the letter

A convention beside the protocol, the way calendar invites ride on email. The protocol reads only the blocks that arrive. It does not read the envelope, and no block field holds what a carrier proved.

## Sending
- The email body is plain text, made from the block, for any human reader, in the reader's language where known.
- One attachment, `application/foodblock+json` (file `.foodblock`), holds `{ "version": "1.6", "messages": [ ... ] }`: block messages (core.md, section 6), sealed to the recipient when they are not public. It carries the author's genesis and the grant chain the agent acts under.
- Header `FoodBlock-Hash: <hash>`. The email's `Message-ID` is random per envelope and matched to the block on the node, so a reply's `In-Reply-To` finds the block without letting email providers link envelopes together.
- A message to someone who is a stranger obeys strangers.md: a human sends it, it holds only the ask, and it says how to STOP.

## Receiving
- From a FoodBlock speaker: the attached blocks are read and checked like any push. The email adds nothing.
- From anyone else (words only): the receiver writes their own `observe` of kind `message`:
  - `refs.subject`: the sender, an `actor` of kind `contact` the receiver writes (no keys; anyone may later claim it is `same_as` a genesis);
  - `refs.derives_from`: the hash of the raw email (kept, because email signing keys rotate);
  - then a separate reading ("this says yes to the order"), `for` the deal's first promise, with a confidence. A reading is the agent's, not the person's (strangers.md).
- A reply in words never `answers` a promise; only a signed block does. A fold may count "accepted, observed" but ranks it below "accepted, signed".
- Raw message ids are never stored, only their hashes.

## What a carrier proves
Email authentication (DKIM and the like) shows which domain sent a message, not which person said it, and not what they meant. A node may check it and keep the result in its own log. It never becomes a field of a block. The block's signature proves the author. So email carries the letter; it is never the record.

## Every other envelope
WhatsApp, SMS, USSD, a voice call, a letter, a QR code, a link: the body for humans, the block for machines. A person with held keys (modules/identity.md, Held keys) acts by any of them: their custodian signs on their word, naming the channel as an open label and the raw message's hash. Words from anyone else are read as in Receiving. Where the link is too small for a whole block, the short form applies (profiles/short-form.md).

## Constrained links (CBOR)
Over a radio, a tag or any link too small for JSON, a public block travels in the compact CBOR form, media type `application/foodblock+cbor` (modules/encoding.md). It is a transport only. The receiver rebuilds the canonical JSON, hashes it and checks the signature; the id is the same as for JSON. A micro with no clock sends blocks with no `at`; the edge that receives them stamps the arrival in its own `receipt` observe (modules/blocks.md, No clock).
