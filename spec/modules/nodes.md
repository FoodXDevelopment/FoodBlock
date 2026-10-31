# Nodes

Anyone can leave a node with everything they signed. Two messages, Pull and Push, work over any link. A block that is sound under core.md is valid whatever its type (core.md, Open types); whether a node stores it or passes it on is that node's own promise (A node's promise, below).

## Messages

A message is UTF-8 JSON. Every shape is in `protocol.json` (`messages`); a message carries no version. Block messages are in core.md, sealed ones in privacy.md.
- A **signed request** adds `signer`, `node` (the node it is for), a proof against replay, and `signature`. The signature covers the canonical JSON of the request without `signature`, by a live key of the signer: not void, not frozen, not rotated out (a rotated-out key still speaks for its blocks up to `counted_to`, but opens no door).
- **The proof against replay** carries no clock. Either `counter`, an integer 0 to 2^53 - 1 (core.md, section 3) that the signer raises with every request to that node, which refuses an equal or lower one; or `challenge`, a value the node issued for this one request (`GET` its `challenge` endpoint), which it refuses if unissued or used.
- In a pull answer, `request` is the bare SHA-256 hex (whatever the suite) of the canonical JSON of the whole signed request, `signature` included. `n` is each block's arrival number. Every key of a push answer is always present but `held` and `at`; an empty list is `[]`. `held` lists the blocks already held, ascending by hash: a block whose body is held is neither taken nor refused (Rounds). `at` is the node's own time when it took the push (core.md, section 3), signed with the answer: a receipt the pusher may keep (promises.md, Who may bind). Giving `held` or `at` is the node's promise (below).

## Pull

- `since` is the responder's arrival number (exclusive; 0 from the start), never `at`. A node numbers each block it takes in 1, 2, 3 and never reuses a number; it says nothing about when a block was written.
- `filter` matches exactly on `type`, `kind`, `author`, `hash`, `record` (a record's first hash: every version), `marks` (`{ scheme, value }`) and `refs` (`{ key: hash }`). Keys AND together. An unknown key, a `refs` or `marks` of the wrong shape, or a filter that is not an object matches nothing; no filter matches every block. A filter reads only what the asker may see: a public block whole; a block with an audience list whole only for a signed asker the node holds a copy for, otherwise its public header alone (`author`, `prev`, `seq`, `hash`).
- `heads: true` returns only the matches that no other match names by `prev` or `updates`.
- `limit` is the asker's wish; the responder cuts it to its own cap (A node's promise).
- The answer is the matches in arrival order with their numbers, and `next`: the number of the last match when the answer is full, else the last number the node read. A node reads a bounded window per pull, so an answer with no match still moves on.
- **A fork's proof.** A node that serves a pair's proof (A node's promise) includes both blocks of a pair it holds in any answer that includes either, whatever the filter, `limit` or `since`. The pair is in addition to `limit`. A sealed block of a pair goes as the asker may see it. A recovery rotation and the first key's block are not a pair.
- An unsigned pull gets public blocks and the public headers of sealed ones. A signed pull also gets the copies sealed to the asker.

## Push

A sealed copy may say which of the receiving node's people it is for (`for`: `{ hash: [id] }`). A sealed block arrives as its signed public header, which the core checks alone (privacy.md); the node never does.
- **A push is read from its bytes** with the core (`strict_push`). A repeated key anywhere, or text that is not JSON or not a push, refuses the whole push. Each block is held to strict writing as its own text wrote it (a number too large or written `1.0` or `1e3`, a lone surrogate, a depth past `limits.depth_read`: canonical.md): that refuses the block alone. A node never uses a reader that lets a later key win or turns `1.0` into `1`.
- **A node judges a push with all it rests on:** for every block the push names, its author's chain and what it rests on in turn, to the end. An accept pushed alone is judged against the offer and the offer author's keys.
- **A sealed copy is kept only from its author:** from a signed push whose signer is the block's author. Any other push may bring the public header but no copy.
- **A body beats a false header.** When a block arrives whose hash the node holds as a header naming another author, `seq` or `prev`, the core takes the block, lists the hash in `false_headers`, and the node keeps the block in the header's place.
- **A block waits until every block it needs is held** (core.md, check 5): its `prev`, and by type the grant it passes on (`parent`) or counts to (`counted_to`), the offer it answers or stops, the grant it acts under. It is then judged once. Waiting blocks count against admission and expire after a time the node sets. How many may wait for one author is the node owner's own stated number (the protocol keeps none). The reference node keeps one only from a signed push whose signer is its author, when it holds the author's genesis, the author has fewer waiting than that number, and its admission rule admits one more from them; otherwise it answers waiting and does not keep it. A waiting block is tried again when a block it waits for arrives. A node fetches a missing block only from the signer of a signed push. Other refs not held are fetched when a reader needs them and never hold a block back.
- **A key's first blocks rival each other:** two first blocks of one key are a pair (core.md, invariant 3).
- **Rounds.** A round is every waiting block whose needs are held when it begins, each id computed in its signer's suite, copies of one block taken once (the lowest signature only to name one), each judged against the same store, so what is taken never depends on order within a push. **The answer follows the rounds.** `taken` lists blocks in round order, ascending by hash inside a round; the other half of a sealed block already held counts in the first round. `refused` is ordered the same way, one entry per code in `protocol.json` order. `waiting` is ascending by hash, each `needs` ascending. A block whose need was refused waits for good.
- The answer says what was taken, what waits (with its needs), what was refused, and which pairs prove an equivocation. `equivocations` is always present: the pairs for each group of blocks taking one place in one key's chain (invariant 3) that a block of this push belongs to, counting only blocks that speak for their author once the round is taken (a block the round voids, such as an old key's sibling off a recovery rotation's counted line, forms no pair; a key's own rotation voids nothing it saw: identity.md, Rotation). The pairs are a **star**: each block of the push paired with the lowest hash of its group, and a block that is that lowest paired with each other block of its group. Each pair is sorted as text, and so is the list. **Both blocks of a pair are kept.** Whether a node takes a pair's blocks is its own promise (below): a node that does not take them takes neither when both arrive in one round, and not a block that forks one already held, or taken earlier (the later). Such a block is neither refused nor waiting. A sealed pair's proof is its two public headers (same author, key and `prev`, both signed); each copy goes only to its audience.

**Signed answers.** A node signs every answer with any live signing key of its holder (a person or a machine): the genesis key or one brought in by a key grant. The signature is in that key's algorithm over the canonical JSON of the answer without `signature`. Discovery's `node` is the holder's id; there is no separate node actor. Two signed answers giving different blocks for one arrival number are a fork of the node's own answers.

## Admission

A node admits by its owner's published rule, an `observe` of kind `admission` whose hash discovery names, with state `{ parties, per_stranger, order_channel }`, each optional: ids always admitted, blocks a day from anyone else, and the acts an autonomous system may send first (consent.md).
- `per_stranger` is the most blocks one day may bring from each sender not in `parties`, counted for that sender alone, a stranger (consent.md) or not. When the node has taken that many today from that sender, the next is `not_admitted` (`taken_today >= per_stranger`). One sender filling its count never closes the door to anyone else.
- With no `per_stranger`, or no rule, the node's own software chooses; the protocol has no admission default. The reference server's choice comes from its owner's configuration (`PER_STRANGER`), applies only where the rule names none, and is published under `software_chose`: that node's word, never the protocol's.
- **A total for all strangers.** A node may also publish its own most blocks a day from every sender outside `parties` together (`strangers_per_day`), so that a million free keys share one allowance and do not each get one. It is the node's own word (A node's promise), published in its admission document under `software_chose`, never in the rule and never a default; the core reads none. The reference server requires its owner to state it (`STRANGERS_PER_DAY`) and refuses to start without.
- `order_channel` is a list of acts. A node whose rule states one may refuse (`not_human`; consent.md) a first block to a stranger that an autonomous system signed outside it. It reads only what is signed (the declared genesis `kind`, an accepted operator grant, a named grant) and never infers what an author is. It never refuses a block for a STOP: the block is kept and the fold reads it as stopped. A node may decline to relay its body to the stopped party.
- A listed party is exempt from the count only for a block signed by a key that still speaks for them (folds.md); any other is admitted as anyone's, so a thief with an old key cannot fill the store under her name.
- A rule may also say where the node stores blocks (profiles/residency.md) and take earnest money (profiles/earnest.md). A node may refuse any push.

## A node's promise

What a node does with a block beyond holding it and passing it on is its own signed word, binds it alone, and is never a protocol duty. Examples: its admission rule, the most blocks one answer to a pull carries (its cap), whether it sends the other half of a forked pair with an answer that includes one (a pair's proof), whether it takes the blocks of a pair (Push), forgetting (profiles/erasure.md), an address it keeps (profiles/addressing.md), where it stores (profiles/residency.md), earnest money (profiles/earnest.md), giving `held` or `at`, how many challenges it keeps unanswered and to whom it issues them (a challenge is asked for by anyone, so a node that must not be flooded rate-limits that endpoint at its own front door), how many blocks may wait for one author, the most blocks a day all strangers together may bring, how many recipients and bytes of sealed copies one push adds, and no longer serving older versions of a block once a newer one narrows its audience (privacy.md). A custodian's policy is the same kind of word (profiles/custody.md). An author relies on such a thing only from a node that promised it. The core fills none of these in: a call that asks the core for a node's answer states each choice. Other pages list only the fields they add.

## Discovery

A node publishes `.well-known/foodblock`: `{ protocol: "foodblock", version, node, holds, speaks_for, admission, endpoints: { pull, push, challenge } }`. Nodes are found as email addresses are: given directly, listed in any directory, or followed from a ref. People are found by phone number or payment address (profiles/addressing.md). Nearby, a node may answer the same document or announce a short form of it (`protocol.json`, `local_discovery`: mDNS / DNS-SD, name `_foodblock._tcp`). None is required; a node with no peers is valid.

## Equivocation

A pair is two blocks with one signing key and one `prev`, or two first blocks of one key (core.md, invariant 3). Blocks of two keys are never a pair, and the recovery key is a signer of its own: its first block naming the genesis is not a pair with the first key's first block (identity.md). A sealed block known by its header alone pairs the same way (privacy.md). Two binding blocks of one record that do not see each other (an offer's allocations, an instance's ownership transfers) and two recovery rotations that cross are pairs too. A node keeps both. What a fold does with a pair is in folds.md.

## Finding

A pull with a filter returns every match, unranked. Ranking is the reader's own node's; the protocol says nothing about it. Any node may be an **index**, serving others' public records; a reader can check that it left nothing out against public headers, `seq` gaps and heads.

## What never becomes a block

Only signed blocks cross between nodes. Drafts, goals, limits, budgets, private rules, rankings and what a person loves stay on their node. The protocol depends on no one transport: email, messaging and links are envelopes (transport.md); the compact form is in encoding.md.

## Invariants

18. Every node answer a reader relies on is signed by the node.
