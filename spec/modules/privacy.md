# Privacy

Commitments, audience, sealed blocks, envelopes and the public header. A core node writes public blocks only and needs none of this page.

## A commitment

A commitment is a salted hash, the one privacy primitive: the author's suite hash (written like an id) of the salt's hex followed by the value as UTF-8. A value that is not a string is first written as its canonical JSON text. A salt is 16 random bytes as 32 lowercase hex characters (`protocol.json`, `grammar.salt`), fresh per block per recipient, never reused; a salt outside the grammar opens no commitment. The salt, or salt and value, travels only to whoever it is for, in their own copy (`reveals`).

**The author may commit any value in signed content.** No field is fixed as one; a profile only names the fields it expects committed. A reader sees the hash; the opening shows value and salt. Erasing deletes value and salt: the block still verifies and the hash can no longer be linked to the person. An `observe` of kind `erase` asks nodes to do so (profiles/erasure.md).

- **Audience.** One commitment per recipient, sorted, so recipients do not see each other. A recipient finds itself by hashing its salt with its own id; it may be a person, a circle, or `circle#role`. The audience is fixed when written. A circle means its members in the circle fold of the block's causal past, a role its holders there (folds.md, Circle membership); an author who wants new members in names the circle's head in `after`.
- **Leaving the subject out is marked, never hidden.** An author may leave out of the audience anyone the block is about (`refs.subject`, or whoever did the work). The block then says `state.withheld: true` and its public header repeats it. No reason is needed. A block without `withheld` claims nothing about who else saw it.
- **For whom.** `refs.for_whom` is a commitment.
- **Customers in business blocks.** A business may name a customer plainly or as a commitment, in a side of a promise or a transfer (`from`, `to`, `for_whom`) or as the `subject` of an observe. Which is a term of their deal or the business's choice; the protocol forces neither.

## Sealing

A private block's body is encrypted to its audience (Envelope). The envelope names no recipient: each recipient tries the entries. The node serving a sealed copy knows who it is for; nobody else does. A block cannot be unsent; stopping service of older versions once a newer one narrows the audience is a node's promise (nodes.md).

## The public header

Every block has one: `{ author, seq, prev, hash }`, plus `withheld: true` or `skip: true` when the block says so (a skip's header must say so, or the jump in `seq` cannot be checked from it). A public block's is read from the block; a sealed block's travels beside the envelope, signed by the same key. So anyone can check a chain, its gaps and its forks; only the audience reads bodies. The header shows how many blocks an author wrote and when they were taken in; a node that wants less to show can batch its blocks.

**Checking a sealed block's link.** A node that cannot open the body checks the header alone once the block named in `prev` is held (it waits like any block). This is one core rule (`accept_sealed`):
- the header's signature opens with the key read from what it rests on, as for a whole block (core.md, check 6; `bad_signature`);
- the link fits the key's chain: same key as `prev` and the next `seq` (or a skip), or `seq` 1 on the block that brought the key in (`chain`);
- no other block of that key names the same `prev` (a pair, nodes.md, Equivocation).

A block of any kind whose `prev` is a sealed block held by its header alone follows it when that header's signature opens with the block's key (core.md, check 7), so a sealed block never freezes its author's public chain.

A recipient takes a body only when its header describes it exactly (`hash`, `author`, `seq`, `prev`, `skip`, `withheld`; `open_copy` refuses otherwise). A header and a body of one hash are two halves of one block, never a duplicate. A header that does not describe the body held under its hash (`author`, `seq`, `prev`) is refused (`bad_hash`); a body arriving under the hash of a header it does not fit shows that header false and replaces it (`false_headers`, nodes.md).

## Sealed messages

A sealed block is `{ header, header_signature, envelope }`; one that carries a `version` is refused (`shape`). `header_signature` is the signature, by the block's key in its algorithm, over the canonical JSON (canonical.md) of `header` (the object itself, with `withheld` or `skip` when present, and no other key). A reader outside the audience gets the message without `envelope`. The envelope's plaintext is the canonical JSON of `{ block, signature, reveals }`. `reveals` is `[{ salt, value }]`, the openings for this recipient only: its audience salt with `value` its own id, and each personal field's salt and value. One envelope holds several recipients only when they share every reveal (the members of one circle). A block inside over the size limit is refused once opened.

## Envelope

The plaintext is encrypted with AES-256-GCM under a random 32-byte content key and a 12-byte nonce, no additional data. A fresh encryption key per envelope agrees a secret with each recipient's key, by the recipient's suite. HKDF with the suite's hash turns the secret into a 32-byte key, salted with the ephemeral public key's bytes then the recipient's, info `foodblock envelope key` (UTF-8). That key seals the content key with the suite's cipher and its own 12-byte nonce (core.md, Suites; `protocol.json`, `suites`).
- **A key that contributes nothing seals nothing:** an X25519 key of small order (32 zero bytes is one) gives every sealer the same secret; a sealer refuses it and makes no envelope.
- **Key sizes.** AES-256 takes 32 bytes, SM4 16: in `sm` the content key is the first 16 bytes of the 32 random bytes and the derived key its first 16 (HKDF with L = 16). The sealed content key is still 32 bytes on the wire.
- The envelope is `{ alg, ephemeral_key, nonce, ciphertext, recipients }`, each recipient `{ encrypted_key }`. `alg` is the suite's envelope name. `ephemeral_key` is hex; `nonce` and `ciphertext` (16-byte tag at the end) are base64; `encrypted_key` is base64 of the sealed key, its tag, then its nonce. A reader opens only the envelopes its suites name.

## Invariants

17. Nothing outside the audience can name a recipient.
