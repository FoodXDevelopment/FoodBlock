# Privacy

What stays public, who learns what, commitments, audience, sealed blocks, handing on, envelopes and the header. A core node writes public blocks only and needs only What stays public.

## What stays public

One key writes public blocks or sealed blocks, never both: a device, or her AI, that writes both holds two keys. A sealed block, header and all, goes only to its audience, and by handing on to whom they choose. Nothing need be public for two people who know each other to deal. What must be shown is a list of who must be shown: a word with an open set of reliers (an open offer, an open grant, a let-go, a kind, a schema, a rule set named by hash, an address) is public or reaches only those it is handed to; a counted line is shown whole, as bodies, to everyone who relies on it; the pieces of a signer go to whoever must know who signed. Amounts on a line are shown to every relier on it. A buyer is named only where the seller names her plainly. A node shows a block's body only to an audience it can read. A body whose audience it cannot read, it shows to no one; it serves only a copy it holds for the asker, as it came (nodes.md, Pull).

A carrier sees what it is handed: of a sealed block, its header (who wrote, `seq`, `prev`, its id), the reader a push names, its size and when. A copy wrapped to a key of the reader's shows only that key, its size and when. A host that runs a person's AI sees what her AI reads. A clock sees what it is sent.

No check refuses a key that writes both (`valid` reads no `prev`). Its own line then shows less to a stranger: a block on it held only as its header hides, from anyone outside its audience, each measure that line held at its place and each word of that key it could end (folds.md, Read whole), so a question about any of them is `not_shown` to a stranger. A thing's id in a public block ties together every public block that names it: public provenance and a hidden supplier are opposites, and she chooses for each product.

Ground: what I do not send, no one learns from me, and what you signed you will not tell, you may not (Rothbard: a promise of silence binds only as a signed word; nothing fills the silence of one who signed none).

## Not given

**Deniability.** A block proves who said it to everyone who holds it and its key, chosen by its signer or not, for as long as they are held. Sealing limits who is sent it, never what it proves once shown. Wiping a key ends what it can sign next, never what it signed. One who wants less leaves it unsigned, or signs with a key no block ties to her.

## A commitment

A commitment is a salted hash, the one privacy primitive: the author's suite hash (written like an id) of the salt's hex followed by the value as UTF-8. A value that is not a string is first written as its canonical JSON text. A salt is 16 random bytes as 32 lowercase hex characters (`protocol.json`, `grammar.salt`), fresh per block per recipient, never reused; a salt outside the grammar opens no commitment. The salt, or salt and value, travels only to whoever it is for, in their own copy (`reveals`).

**The author may commit any value in signed content.** No field is fixed as one; a profile only names the fields it expects committed. A reader sees the hash; the opening shows value and salt. Erasing, at the node that erases, deletes value and salt there: the block still verifies, and that node can no longer link the hash to the value. Each recipient that was sent the opening holds it still. An `observe` of kind `erase` asks nodes to do so (profiles/erasure.md).

- **Audience.** One commitment per recipient, sorted, so recipients do not see each other. A recipient finds itself by hashing its salt with its own id; it may be a person or a circle. The audience is fixed when written. An audience that names a circle names the owners of its parts in the circle fold of that block's causal past (circles.md, A buyer of parts); an author who wants new owners in names the circle's head in `after`.
- **For whom.** `refs.for_whom` is a commitment.
- **Customers in business blocks.** A business may name a customer plainly or as a commitment, in a side of a promise or a transfer (`from`, `to`, `for_whom`) or as the `subject` of an observe. Which is a term of their deal or the business's choice; the protocol forces neither.

## Sealing

A convention. It changes no word (core.md, section 10); two nodes that share it can talk. A private block's body is encrypted to its audience (Envelope). The envelope names no recipient: each recipient tries the entries. Who knows whom a copy is for is said in invariant 28. A block cannot be unsent; stopping service of older versions once a newer one narrows the audience is a node's word (nodes.md).

## Showing a deal

A deal is its two sides'. Each holds its own copy and may show what it holds; silence is no promise not to show. What a side shows is the other's signature, not the side's own account: it is proof to whoever is shown. A side who wants the other's silence asks for a promise not to show (promises.md, A promise not to do), which may name what is kept: the terms, or that the two deal at all. Such a promise does not change what a shown block proves; it only names what its signer gives up for showing.

## The header

Every block but a genesis has one: `{ author, seq, prev, hash }`, plus `key` when the block has `refs.key`, and `skip: true` when the block says so (a skip's header must say so). It is what the block is signed over (core.md, section 2), so a header and a body can never carry two words that disagree, and a passkey asks its holder once. A public block's header is read from the block; a sealed block's travels beside the envelope (Sealed messages). A header shows its key's `seq`, so a key that minds showing how many blocks it wrote skips (`skip`). It shows nothing the block had seen: no `after`, no `at`, no amount (folds.md, A line).

**A sealed block is a block held by its header.** It is valid as any block is (core.md, section 8), and not read by a reader outside its audience.

**Who is sent a sealed block.** A sealed block goes, header and all, to those it is sealed to and to whom they hand it on. It goes to no one else by any rule of this protocol. The header lets one who cannot open the body check who signed it: a carrier before it keeps a copy, a reader handed a copy. A key's sealed line is seen, as headers, by those it seals to: they learn how many blocks it wrote (its `seq`; a skip blurs it), never to whom.

A recipient takes a body only when its header describes it exactly (`hash`, `author`, `key`, `seq`, `prev`, `skip`; `open_copy` refuses otherwise). A header and a body of one hash are two halves of one block, never a duplicate. A header that describes the body held under its hash is nothing new: the block is held already. One that does not is refused (`bad_hash`); a body arriving under the hash of a header it does not fit shows that header false and replaces it (`false_headers`, nodes.md).

## Sealed messages

A convention. It changes no word (core.md, section 10); two nodes that share it can talk. A sealed block is `{ header, header_signature, envelope }`; one that carries a `version` is refused (`shape`). `header_signature` is the block's one signature, by the block's key in its algorithm, over the canonical JSON (canonical.md) of `header` (the object itself, with `skip` when present, and no other key). A reader outside the audience holds at most the message without `envelope`. The plaintext is `{ block, reveals }`, and may carry `pad`, a string of spaces, which a reader ignores. A `pad` that is not a string of spaces opens nothing (`shape`). It is written as canonical JSON and carries no signature: a recipient who opens it holds the block with `header_signature` as its signature. `reveals` is `[{ salt, value }]`, the openings for this recipient only: its audience salt with `value` its own id, and each committed field's salt and value. One envelope holds several recipients only when they share every reveal (the owners of one circle). A block inside over the size limit is refused once opened.

A sealer that pads pads the plaintext's bytes, `pad` included, to the next of 512, 1024, 2048, 4096 bytes, then each 4096.

## Handing on

Whoever holds an opened sealed block may hand it on: the same header and signature, an envelope of its own making to the reader it chooses, and the reveals it holds. It is the same block (one id). The reader checks it as any sealed copy. A reveal that opens an audience commitment to the hander's id shows the block was sealed to the hander. The audience the block states does not change: it is the author's word on whom she meant, and the envelopes are what was done. So a side puts a sealed deal before the judge both named without the other's help, and without telling any node in the clear who the recipient was.

## Envelope

A convention. It changes no word (core.md, section 10); two nodes that share it can talk. The plaintext is encrypted with AES-256-GCM under a random 32-byte content key and a 12-byte nonce, no additional data. A fresh encryption key per envelope agrees a secret with each recipient's key, by the recipient's suite. HKDF with the suite's hash turns the secret into a 32-byte key, salted with the ephemeral public key's bytes then the recipient's, info `foodblock envelope key` (UTF-8). That key seals the content key with the suite's cipher and its own 12-byte nonce (core.md, Suites; `protocol.json`, `suites`).
- **A key that contributes nothing seals nothing:** an X25519 key of small order (32 zero bytes is one) gives every sealer the same secret; a sealer refuses it and makes no envelope.
- **Key sizes.** AES-256 takes 32 bytes, SM4 16: in `sm` the content key is the first 16 bytes of the 32 random bytes and the derived key its first 16 (HKDF with L = 16). The sealed content key is still 32 bytes on the wire.
- The envelope is `{ alg, ephemeral_key, nonce, ciphertext, recipients }`, each recipient `{ encrypted_key }`. `alg` is the suite's envelope name. `ephemeral_key` is hex; `nonce` and `ciphertext` (16-byte tag at the end) are base64; `encrypted_key` is base64 of the sealed key, its tag, then its nonce. A reader opens only the envelopes its suites name.

## Keeping apart

Four grains, each made of blocks that exist. None is chosen for her.

| Grain | What she signs | A stranger learns | Each counterparty learns | A carrier learns |
|---|---|---|---|---|
| One sealing key for all | one key grant | nothing | how many sealed blocks the key wrote, and when, across all her dealing | that she wrote to that counterparty |
| A key for one counterparty | a key grant adding a key under her sealing voice, sealed to that counterparty and herself (identity.md, A key under a voice) | nothing | only how many such key grants came before | that she wrote to that counterparty |
| An identity for one counterparty | a genesis of its own, and a two-key link sealed to that counterparty | nothing | nothing of her other dealing | that an unnamed id wrote to an id |
| A key for one deal | a genesis of its own, and no block that ties it to her | nothing | this deal only, and what she told him | that an unnamed id wrote to an id |

The first two keep one identity, so her grants, her line and what she owns are untouched. The third breaks her record into pieces on purpose; a counterparty sees none of her history unless she shows the link. The fourth stands behind nothing beyond the deal itself, so a side who must wait on its word has nothing to wait on. What it receives is on its own line: to use it under another key of hers it signs a draw to that key, and that draw ties them for every later reader of what it moved.

**A wrapped copy.** A copy may be wrapped, in an envelope of its own, to a key the reader gave the sender: a mailbox, which is an address she sealed to that one sender (nodes.md, Her address). A host that keeps it learns which mailbox, how big after padding, and when; not who wrote it.

**What each one learns.** Three deals: Amara orders flour from Harry in **public** blocks; the same, **sealed** to the two of them; and **through a host**, where Mama Achieng has no key and her host signs a witness of her words.

| Who | Public deal | Sealed deal | Through a host |
|---|---|---|---|
| The other side | everything, signed, for good | everything, signed, for good; how many commitments the audience holds; her `seq` on that key | everything; that she has no key; her handle and her host |
| Her host (it carries her copies) | everything | of each copy: its header (who wrote, `seq`, `prev`, id), the reader the push names, its size, when, who pulled it; of a wrapped copy: which mailbox, how big after padding, when; not the words | everything in the clear, and so does her phone carrier |
| A host that runs her AI | everything her AI reads | everything her AI reads | everything her AI reads |
| His host | everything | the same, for the copies it carries | what the witness shows; if sealed, author (the host), the id, size, time |
| A later buyer of the same thing | as bodies, every block of the seller's key from his sale back to its start, and of the key that brought that key in: the amounts and times of every earlier sale on that key, and each buyer he named plainly | the same bodies, handed on to him by the seller or their audience; without them, `not_shown`, and the seller's backing if he gave one | the same, from whoever holds the witness |
| An index | everything | nothing, unless a side hands it on | the witness if public, with her handle; if sealed, nothing |
| A stranger pulling | public blocks only | nothing; a gap in a door log's numbers shows only that something was taken | as an index |
| A judge | everything | what a side hands on | what the host or Amara hands on |
| A rival | price, lines, cadence | nothing from the protocol; whatever a carrier tells, unless it signed a promise not to tell | if public, her handle; if sealed, nothing |

**A seller backing his own title.** A seller who would not show his line to a later buyer may back his title in his offer: `terms.backing`, "if the judge we named finds this was not mine to give, £300 of mine becomes yours". The buyer still reads `not_shown`; he reads the backing beside it. The line goes only to the judge, and only in a dispute.

**Selling from lots** is a pattern (patterns/lots.md): it hides who else bought, never how much and when.

**What is not hidden** (THREAT-MODEL.md): who connects to which node; how many blocks a node takes in (counts); when (timing). The machine that stores the bytes sees what it is handed (What stays public). One host that carries both sides sees who deals with whom, whatever is sealed. A sender who minds sizes pads; one who minds the network uses a link that hides it.

## Invariants

28. A sealed block names no recipient: not in its signed bytes, not in its header, not in its envelope. Whom a copy is for is known to its author, to that recipient, to each carrier told so it could deliver, and to anyone who reads the link that carried it; a recipient also sees how many commitments the audience holds. No fold reads any of it.
