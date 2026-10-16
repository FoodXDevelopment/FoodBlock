# Nodes

Anyone can leave a node with everything they signed. Two messages, Pull and Push, work over any link, offline or on. A node stores and passes on every block that is sound under core.md, whatever its type (core.md, Open types).

## Messages

A message is UTF-8 JSON. Every shape is in `protocol.json` (`messages`), and `version` is `"1.6"`. A block message is in core.md and a sealed one in privacy.md.
- A **signed request** (a signed pull or push) adds `signer`, `node`, a proof against replay, and `signature`. The signature covers the canonical JSON of the request without the `signature` key, by a live key of the signer. `node` names the node it is for.
- **The proof against replay** is one of two, and carries no clock:
  - `counter`: an integer the signer raises with every request to that node. The node keeps the highest it has seen from each signer and refuses an equal or lower one. An offline peer that visits rarely uses this.
  - `challenge`: a value the node handed out for this one request (`GET` its `challenge` endpoint). The node refuses one it did not issue or has seen used.
- In a pull answer, `request` is the hash of the canonical signed request, and `n` is each block's arrival number. Every key of a push answer is always present; an empty list is written `[]`.

## Pull

A node asks for the blocks it may see since a point.
- `since` is the responder's arrival number (exclusive; 0 from the start), never `at`. A node numbers each block it takes in 1, 2, 3 and never reuses a number. The number is the node's own and says nothing about when a block was written.
- `filter` matches exactly on `type`, `kind`, `author`, `hash`, `record` (a record's first hash: every version), `marks` (`{ scheme, value }`) and `refs` (`{ key: hash }`). Keys AND together.
- `heads: true` returns only the heads among the matches: those no other match names by `prev` or `updates`.
- `limit` is the asker's wish; the responder caps it.
- The answer is the matches in arrival order, each with its arrival number, and `next`, where to go on.
- An unsigned pull gets public blocks and the public headers of sealed ones. A signed pull also gets the copies sealed to the asker.

## Push

A node sends signed blocks. A sealed copy may say which of the receiving node's people it is for (`for`: `{ hash: [id] }`). A sealed block arrives as its signed public header, and the core checks that header alone (privacy.md, Checking a sealed block's link in its chain): the node never does.
- **A block waits until every block it needs is held** (core.md, check 5): its `prev`, and by type the grant it passes on (`parent`) or counts to (`counted_to`), the offer it answers or stops, the grant it acts under. It is then judged once. Waiting blocks count against admission and expire after a time the node sets. A node asks for a missing block only from the signer of a signed push; an unsigned push's waiting blocks are never fetched, only kept until they expire.
- Other refs to blocks not held are fetched when a reader needs them; they never hold a block back.
- **Rounds.** The blocks of a push are judged in rounds. A round is every waiting block whose needs are all held when the round begins, each judged against the same store, so what is taken never depends on the order inside a push. A block whose need was refused waits for good.
- The answer says which blocks were taken, which wait (each with what it needs), which were refused, and which pairs prove an equivocation. `equivocations` is always present, an empty list when there are none: every pair of blocks of one key naming one `prev` that a block of this push belongs to, each pair sorted as text and the list sorted. **Both blocks of a pair are kept** (and served with the chain, so anyone may publish the proof). A pair's block is **not taken**: of two that arrive in the same round, neither is taken; a block that forks one already held, or one taken in an earlier round, is the later and is not taken. It is neither refused nor waiting. When the pair is sealed, the proof is the two public headers (same author, key and `prev`, both signed); each sealed copy is served only to its audience.

**Signed answers.** A node signs every answer with any live signing key of its holder (a person or a machine), the genesis key or one brought in by a key grant. Discovery's `node` is the holder's id. There is no separate node actor. Two signed answers that give different blocks for one arrival number prove a lie.

## Admission

Each node admits by its owner's published rule, an `observe` of kind `admission` whose hash discovery names, with state `{ parties, per_stranger, order_channel }`: the ids always admitted, how many blocks a day from anyone else, and the acts an agent may send first (strangers.md); each optional. A rule may also say where the node stores blocks (profiles/residency.md) and take a deposit (profiles/deposits.md). A node may refuse any push. No platform decides.
- A node refuses a first ask to a stranger that an agent signed (strangers.md). It never refuses a block for a STOP: the block is kept and the fold reads it as stopped, so the sender's chain never stalls on someone else's consent. A node may decline to relay its body to the stopped party.

## Discovery

A node publishes `.well-known/foodblock`: `{ protocol: "foodblock", version, node, holds, speaks_for, admission, endpoints: { pull, push, challenge } }`. Nodes are found the way email addresses are: given directly, listed in any directory, or followed from a ref. People are also found by a phone number or payment address (profiles/addressing.md). Nearby, a node may answer the same document on a local network or announce a short form of it (`protocol.json`, `local_discovery`: mDNS / DNS-SD, the standard way for devices on one network to announce a service, name `_foodblock._tcp`). None is required; a node with no peers is still valid.

## Equivocation

Two blocks with one signing key and one `prev` (core.md, invariant 3). The same holds for a sealed block known by its public header alone: a header and a whole block, or two headers, naming one `prev` for one key are a pair (privacy.md). Also two binding blocks of one record that do not see each other (an offer's allocations, an instance's ownership transfers), and two recovery rotations that cross. A node keeps both and serves them with the chain, so anyone may publish the proof. What a fold does with a pair is in folds.md.

## Finding

A pull with a filter returns every match, unranked. Ranking happens only in the reader's node. Any node may be an **index**, serving others' public records, and a reader can check that an index left nothing out against public headers, `seq` gaps and heads. Nobody pays to rank, but a few big indexes will exist, because the easiest to search wins. That is accepted: an index holds no one's record, and every reader may leave.

## What never becomes a block

Only signed blocks cross between nodes. Drafts, goals, limits, budgets, private rules, rankings and what a person loves stay on their node; a link to a private goal is removed before a block goes out.

The protocol depends on no one transport. Email, messaging and links are envelopes (transport.md); the compact form is in encoding.md.

## Invariants

18. Every node answer a reader relies on is signed by the node.
