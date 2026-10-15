# Privacy

Commitments, audience, sealed blocks, envelopes and the public header. A core node writes public blocks only and needs none of this page.

**The commitment** is the one privacy primitive: a salted hash. It is the hash (the author's suite hash, written like an id) of the salt's hex followed by the value, as UTF-8. A value that is not a string is first written as its canonical JSON text. The salt, or the salt and the value, travels beside the block only to whoever it is for, in their own copy (`reveals`). A salt is 16 random bytes, fresh per block per recipient, never reused. Every private value uses it:
- **Audience.** One commitment per recipient, sorted, so recipients do not see each other. A recipient finds itself by hashing its salt with its own id, and may be a person, a circle, or `circle#role`. The audience is fixed when written. A circle in an audience means the members in the circle fold of that block's causal past; a role means its holders there (folds.md, Circle membership). So an author who wants new members in names the circle's head in `after`.
- **Anyone the block is about is in the audience.** The subject (`refs.subject`), and whoever did the work, can always see what is written about them. The one exception is a safety report made `under` a law. Its author may leave the subject out, and then the block says `state.withheld: true` and its public header repeats it, so every reader sees that something was kept back. A note its author wants kept from its subject, with no law behind it, is not a block: it stays on the author's node.
- **Personal fields.** A value may sit in signed content as a commitment. Erasing deletes the value and the salt; the block still verifies, and nobody can link the hash to the person again. An `observe` of kind `erase` asks nodes to do so. The fixed list of fields that are always commitments is in profiles/erasure.md.
- **For whom.** `refs.for_whom` is a commitment. Being `for_whom` shows you nothing until something reaches you.
- **Customers in business blocks.** In a block signed `as` a business, a customer named in a side of a promise or a transfer (`from`, `to`, `for_whom`) or as the `subject` of an observe is a commitment. A worker's chain shows how many, never who.

**Sealing.** A private block's body is encrypted to its audience (Envelope, below). The envelope names no recipient: each recipient tries the entries. The node that serves a sealed copy knows who it is for; nobody else does. A block cannot be unsent. A node stops serving older versions once a newer one narrows the audience.

**The public header.** Every block has one: `{ author, seq, prev, hash }`, and `withheld: true` when the block says so. For a public block it is read from the block. For a sealed block it travels beside the envelope, signed by the same key. So anyone can check a chain, its gaps and its forks, and only the audience reads the bodies.

**A known leak.** The header shows how many blocks an author wrote and when they were taken in. A café's busy hours show even when every body is sealed. This is the price of a chain anyone can check. A node that wants less to show can batch its blocks.

**Sealed messages.** A sealed block is `{ version, header, header_signature, envelope }`. `header_signature` is by the key that signed the block, and a reader outside the audience gets it without `envelope`. The plaintext of an envelope is `{ version, block, signature, reveals }`. `reveals` is `[{ salt, value }]`, the openings for this recipient only: its audience salt, with `value` its own id, and each personal field's salt and value. A copy with reveals is sealed to one recipient. One envelope holds several only when they share every reveal (the members of one circle). A sealed copy is checked once opened: a block inside over the size limit is refused.

**Envelope.** The plaintext is encrypted with AES-256-GCM (an authenticated cipher) under a random 32-byte content key and a 12-byte nonce, with no additional data. A fresh encryption key per envelope agrees a secret with each recipient's key, by the key agreement of the recipient's suite. HKDF (a standard way to turn a shared secret into a key) with the suite's hash turns the secret into a 32-byte key, salted with the ephemeral public key's bytes followed by the recipient's, with info `foodblock envelope key` (UTF-8). That key seals the content key with the suite's cipher and its own 12-byte nonce. The suite rows (core.md, Suites; `protocol.json`, `suites`) name each part.
- The envelope is `{ alg, ephemeral_key, nonce, ciphertext, recipients }`, each recipient `{ encrypted_key }`. `alg` is the suite's envelope name. `ephemeral_key` is hex; `nonce` and `ciphertext` (its 16-byte tag at the end) are base64; `encrypted_key` is base64 of the sealed key, its tag, then its nonce.
- A reader opens only the envelopes its suites name.

## Invariants

17. Nothing outside the audience can name a recipient.
