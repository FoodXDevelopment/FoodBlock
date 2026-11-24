# Transport: email is the envelope, FoodBlock is the letter

A convention. It changes no word (core.md, section 10). The protocol reads only the blocks that arrive, never the envelope.

## Sending
- The body is plain text made from the block, for a human.
- One attachment, `application/foodblock+json` (`.foodblock`), holds `{ "messages": [ ... ] }` as canonical JSON (canonical.md, On the wire): block messages (core.md, section 6), sealed when not public, with each block's pieces (core.md, section 8), enough to say who signed it. A block whose answer reads a chain (a block under a grant, a draw) may travel with that chain from it back to its start (folds.md, A chain).
- Every message, signed or not, holds only what strict writing allows: no float, no null, and no whole number past 2^53 − 1. A push is exactly `{ messages, for }`, `for` left out where it says nothing. `limits.push_bytes` (8 MiB) and `limits.push_messages` (1024) are read on the bytes first. A carrier deeper than `limits.read_depth` is refused whole, before any block in it is read. Where one hash comes more than once in one push, each copy is judged, and the valid one is kept; where none is valid, one refusal is listed for the id, naming the copy with the lowest signature. The order of arrival never changes what is taken.
- The `Message-ID` is random per envelope and matched to the block on the node, so a reply's `In-Reply-To` finds it and providers cannot link envelopes.
- A receiving node may refuse or ignore a first message from a stranger (readings/consent.md).
- **A second route carries the same bytes.** Sent again by another route (email, then a courier's drive), the block is the same and taken once, by its hash. A block re-signed is another block, with its own hash and its own `seq`.

## Receiving
- From a FoodBlock speaker: the blocks are checked like any push; the email adds nothing.
- From anyone else (words only): the receiver writes their own `observe` of kind `message`:
  - `refs.subject`: the sender, an `actor` of kind `contact` the receiver writes (no keys; anyone may later claim it is `same_as` a genesis);
  - `refs.derives_from`: the hash of the raw email (kept, because email signing keys rotate);
  - then a separate reading ("this says yes to the order"), `for` the deal's first promise: the autonomous system's, not the person's (things.md, Truth).
- A reply in words never `answers` a promise; only a signed block does. A fold may count "accepted, observed"; the reader weighs it.
- Raw message ids are never stored, only their hashes.

## What a carrier proves
Email authentication (DKIM and the like) shows which domain sent a message, not who said it. A node may keep the result in its own log; it never becomes a field of a block. The signature proves the author.

## Every other envelope
WhatsApp, SMS, USSD, voice, a letter, a QR code, a link: the body for humans, the block for machines. A person with no key of her own (identity.md, A person with no key) acts by any of them: the host that received her words signs a witness of them in its own name, under her grant naming that handle, with the channel as an open label and the raw message's hash; nobody signs as her. Words from anyone else are read as in Receiving. Where the link is too small for a block, see profiles/short-form.md.

## Constrained links (CBOR)
Over a link too small for JSON, a public block travels as `application/foodblock+cbor` (modules/encoding.md); the receiver rebuilds the canonical JSON. A clockless micro's blocks are timed by the edge's `receipt` (blocks.md, A named clock).
