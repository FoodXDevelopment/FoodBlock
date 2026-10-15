# Transport: email is the envelope, FoodBlock is the letter

A convention beside the protocol, not part of it, the way calendar invites ride on email.

## Sending
- The email body is plain English, made from the block, for any human reader.
- One attachment, `application/foodblock+json` (file `.foodblock`), holds the signed blocks (sealed to the recipient
  when they are not public), the author's genesis and the grant chain the agent acts under.
- Header `FoodBlock-Hash: <hash>`. The email's `Message-ID` is random per envelope and matched to the block on the
  node, so a reply's `In-Reply-To` finds the block without letting email providers link envelopes together.

## Receiving
- From a FoodBlock speaker: the attached blocks are read and checked like any push. The email adds nothing.
- From anyone else (words only): the receiver writes their own `observe` of kind message:
  - `refs.subject`: the sender, an `actor` of kind contact the receiver writes (no keys; anyone may later claim it
    is `same_as` a genesis)
  - `refs.derives_from`: the hash of the raw email (kept, because email signing keys rotate)
  - `state.dkim`: `{domain, pass}`, checked on arrival
  - then a separate reading ("this says yes to the order"), `for` the deal's first promise, with a confidence.
- A reply in words never `answers` a promise; only a signed block does. A fold may count "accepted, observed" but
  ranks it below "accepted, signed".
- Raw message ids are never stored, only their hashes.

## What email proves
DKIM proves which domain sent a message, not which person said it, and not what they meant. The block's signature
proves the author. So email carries the letter; it is never the record.

## Every other envelope
WhatsApp, SMS, USSD, a voice call, a QR code, a link: the body for humans, the block for machines. A person with held
keys (modules/identity.md, Held keys) acts by any of them: their custodian signs on their word, naming the channel and the
raw message's hash. Words from anyone else are read as in Receiving.

## Constrained links (CBOR)

Over a radio, a tag or any link too small for JSON, a public block travels in the compact CBOR form, media type `application/foodblock+cbor` (modules/encoding.md). It is a transport only. The receiver rebuilds the canonical JSON, hashes it and checks the signature; the id is the same as for JSON. A micro with no clock sends blocks with no `at`; the edge that receives them stamps the arrival in its own `receipt` observe (modules/blocks.md, No clock).
