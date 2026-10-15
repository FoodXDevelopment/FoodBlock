# Nodes

Anyone can leave a node with everything they signed. Two messages, Pull and Push, work over any link, offline or on;
their shapes are in encoding.md.

**Pull.** A node asks for the blocks it may see since a point.
- `since` is the responder's arrival number (exclusive; 0 from the start), never `at`. A node numbers each block it
  takes in 1, 2, 3 and never reuses a number.
- `filter` matches exactly on `type` (read through aliases), `kind`, `author`, `hash`, `record` (a record's first
  hash: every version) and `refs` (`{ key: hash }`); keys AND together.
- `heads: true` returns only the heads among the matches: those no other match names by `prev` or `updates`.
- `limit` is the asker's wish; the responder caps it.
- The answer is the matches in arrival order, each with its arrival number, and `next`, where to go on.
- An unsigned pull gets public blocks and the public headers of sealed ones. A signed pull also gets the copies sealed
  to the asker. It names its signer, the node it is for, a fresh `nonce` and `at`. The node refuses an `at` more than 5
  minutes from its own clock, either way (`limits.signed_window`), and a nonce it has seen, and remembers each nonce
  at least that long. A signed push is checked the same way.

**Push.** A node sends signed blocks; a sealed copy may say which of the receiving node's people it is for.
- A block whose `prev` is not held waits. Waiting blocks count against admission and expire after a time the node
  sets. A node asks for the missing block only from the signer of a signed push; an unsigned push's waiting blocks are
  never fetched, only kept until they expire.
- Other refs to blocks not held are fetched when a reader needs them; they never hold a block back.
- A block without `seq` is taken in only as history (identity.md, History is closed): its hash and signature are checked and its shape
  is read through aliases.
- The answer says which blocks were taken, which wait, which were refused, and which pairs prove an equivocation.
  `equivocations` is always present, an empty list when there are none; each pair is sorted as text. The block of a
  pair that arrives second is neither taken nor refused: it is listed in its pair. When the pair is sealed, the proof
  is the two public headers (same author, key and `seq`, both signed); each sealed copy is served only to its audience.

**Signed answers.** A node signs every answer with any live signing key of its holder (a person or a machine), the
genesis key or one brought in by a key grant; discovery's `node` is the holder's id. There is no separate node actor.
Two signed answers that give different blocks for one arrival number prove a lie.

**Admission.** Each node admits by its owner's published rule, an `observe` of kind admission whose hash discovery
names, with state `{ parties, per_stranger, deposit }`: the ids always admitted, how many blocks a day from anyone
else, and the money held for an ask that needs a person; each optional. A deposit is `{ money, holder }`: the asker pays
it to the named holder (never the node unless the node may legally hold money) by a transfer `for` the ask; the holder
returns it by a transfer back once the ask is answered, unless the owner's rule says otherwise. A node may refuse any push. No platform
decides.

**Discovery.** A node publishes `.well-known/foodblock`: `{ protocol: "foodblock", version, node, holds, speaks_for,
admission, endpoints: { pull, push } }`. Nodes are found the way email addresses are: given directly, listed in any
directory, or followed from a ref. Nearby, a node may answer the same document on a local network or announce a short
form of it (`protocol.json`, `local_discovery`: mDNS / DNS-SD service `_foodblock._tcp`, TXT `version`, `node`, `path`
`/.well-known/foodblock`; the announcement is `{ protocol: "foodblock", version, node, endpoints }`, and the full
document is fetched from it). None is required; a node with no peers is still valid.

**Equivocation.** Two blocks with one signing key and one `seq`; two binding blocks of one record that do not see each
other (an offer's allocations, an instance's ownership transfers); or two recovery rotations that cross. A node keeps
both and serves them with the chain, so anyone may publish the proof.

**Finding.** A pull with a filter returns every match, unranked. Ranking happens only in the reader's node. Any node
may be an index, and a reader can check that an index left nothing out against public headers, `seq` gaps and heads.
So nobody can be paid to rank.

## What never becomes a block

Only signed blocks cross between nodes. Drafts, goals, limits, budgets, private rules, rankings and what a person
loves stay on their node; a link to a private goal is removed before a block goes out.

The protocol depends on no one transport; email, messaging and links are envelopes (transport.md, which names `state.dkim`; encoding.md for the compact form).

