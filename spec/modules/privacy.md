# Privacy

Commitments, audience, sealed blocks, envelopes and the public header.

**The commitment** is the one privacy primitive: a salted hash (SHA-256 of the salt's hex followed by the value, as
UTF-8). The salt, or the salt and the value, travels beside the block only to whoever it is for, in their own copy
(`reveals`). A salt is fresh per block per recipient, never reused. Every private value uses it:
- **Audience.** One commitment per recipient, sorted, so recipients do not see each other. A recipient finds itself by
  hashing its salt with its own id, and may be a person, a circle, or `circle#role`. The audience is fixed when
  written (folds.md, Audience members then). Anyone the block is about (`refs.subject`), and whoever did the work, is
  always in it: a person can always see what is written about them. A note its author wants kept from its subject is
  not a block; it stays on the author's node.
- **Personal fields.** A value may sit in signed content as a commitment. Erasing deletes the value and the salt; the
  block still verifies. An `observe` of kind erase asks honest nodes to do so.
- **For whom.** `refs.for_whom` is a commitment. Being `for_whom` shows you nothing until something reaches you.
- **Customers in business blocks.** In a block signed `as` a business, a customer named in a side of a promise or a
  transfer (`from`, `to`, `for_whom`) or as the `subject` of an observe is a commitment. A worker's
  chain shows how many, never who.
- **Ballots.** A vote's choice (circles.md).

**Sealing.** A private block's body is encrypted to its audience (Envelope, below). The envelope names no recipient: each
recipient tries the entries. The node that serves a sealed copy knows who it is for; nobody else does. A block cannot
be unsent; a node stops serving older versions once a newer one narrows the audience.

**The public header.** Every block has one: `{ author, seq, prev, hash }`. For a public block it is read from the
block. For a sealed block it travels beside the envelope, signed by the same key. So anyone can check a chain, its
gaps and its forks, and only the audience reads the bodies.

**Envelope.** The plaintext is encrypted with AES-256-GCM under a random 32-byte content key and a 12-byte nonce, with
no additional data. A fresh X25519 key per envelope agrees a secret with each recipient's key. HKDF-SHA256 turns the
secret into a 32-byte key, salted with the ephemeral public key's bytes followed by the recipient's, with info
`foodblock envelope key` (UTF-8); that key seals the content key with AES-256-GCM and its own 12-byte nonce.
- In the envelope (`alg`, `ephemeral_key`, `nonce`, `ciphertext`, `recipients` of `encrypted_key`), `ephemeral_key` is
  hex; `nonce` and `ciphertext` (its 16-byte tag at the end) are base64; `encrypted_key` is base64 of the sealed key,
  its tag, then its nonce.
- New envelopes say `alg: "x25519-hkdf-sha256-aes-256-gcm"`. Readers also open `x25519-aes-256-gcm`, where the secret
  was the key, and ignore a `key_hash` in older envelopes.
