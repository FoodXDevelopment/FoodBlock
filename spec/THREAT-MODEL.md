# FoodBlock 1.7 threat model

**Draft for Patrick, 2026-10-28. Not published.** It says who can attack FoodBlock, what the protocol keeps against each of
them, and what it does not keep. It claims only what the code keeps today: every "kept" line below has a vector in
`spec/vectors.json` (sections 19 to 21 and 25 of `sdk/javascript/test/make-vectors-1-7.cjs`) or a test in `server/`, `mcp/` or
`sdk/rust/tests/`, and the Rust core and the spec-only oracle agree on it. Where a line says "not kept", it is not kept.

The source is the twenty-lens security review of 2026-10-28 (its root causes A to O). Each root cause is now fixed in the
core, the oracle and the spec text, except where the last section says otherwise.

## The one idea

Only a signed word binds, and only its signer. Every rule below is a way of keeping that true when someone tries to make
a word bind that nobody signed, or bind someone who did not sign it.

Two facts shape everything:

- **A reading (a fold) has no clock and no arrival order.** Two honest readers who hold the same blocks read the same
  answer. So a rule can never depend on "this arrived late" or "this node saw it first". If a rule needs lateness or
  delivery, a signed block must carry it.
- **The node is the trust boundary.** A node stores what it is sent and serves it on. It must run every check (through the
  core) before it stores anything, because what it stores, others read.

## Who attacks, and what they can do

| Who | Can | Cannot (kept) |
|---|---|---|
| **A keyless stranger** | send any bytes to any node; sign as themselves; name anyone in their own blocks | make a block read as someone else's; give a signed block a second id (no suite label exists, E; one written form for keys and signatures, H); rewrite a block's bytes at a node (the node reads text strictly, K); make a node store a private block's content as an answer to a filter (K); store a junk copy in a recipient's place (K); drop a real block with a false header claiming its hash, once the block arrives (K); become a machine's operator (A) |
| **The holder of an old key** (a thief, an ex-custodian after "take your keys", an ex-employee) | keep signing with the old key; rotate it again with an early `counted_to` (see "does not keep") | count after the rotation, or off the old key's counted line: a sibling of an old block is void and forms no pair (B); un-count what another rotation counted (crossing rotations freeze new keys, and the key speaks on either line: clean round 1); plant a recovery key (C: named in the genesis or never) |
| **A thief of one device key** | sign as that key until it is rotated | add a recovery key (C); freeze the person's other keys (a fork only touches the key that forked, B) |
| **A successor** (named for after a death) | act for the person once a counted death record is in a block's past | act while the person lives (D); witness the death they act on (D); keep a death record the person stopped (D) |
| **A misbehaving or captured agent** | act inside its grant | act outside the grant's acts, parties, limits or invariant 23 (F: what fails speaks only for the agent); bind past a money limit with a standing promise (O: a repeat has no one-occurrence total, so it is drafted for the person) |
| **A counterparty** | act inside a deal; name their own schema and causal past | forge the other side's payment, refund or delivery (G: only the right side's signed word counts); redeem a note twice; add a quantity the offer never had; make money negative |
| **A relay or the network** | read, drop, reorder, duplicate or rewrite bytes | change a signed block without its id changing; make a 32-bit reader (WebAssembly) and a 64-bit one read the same bytes differently (J) |
| **A node operator or host** | store, drop, delay; see everything public and every header | forge a person's signature while the person holds their key |
| **A state** | compel a host or custodian; seize servers | break the signature or encryption suites |

## What the protocol keeps (the eight cornerstone repairs and the hardening)

| | Root cause (before) | Kept now |
|---|---|---|
| A | A stranger's operator grant took over any agent | An operator grant counts only for blocks after the machine's own signed "accepted" answer |
| B | An old key could fork the past, voiding title and debts | After a rotation only the counted line counts; a fork voids from its split, for that key only |
| C | The first key grant to name a recovery key won | The recovery key is named in the genesis or never |
| D | A successor grant was power of attorney from signing | It has no power until a counted death record is in the block's past |
| E | An unsigned suite label gave a block a second id | The suite comes from the signing key; no message names one |
| F | Folds ignored the grant's limits | Every reading applies the same authority test the door reports |
| G | The deal fold trusted unsigned side-acts | Only the right side's signed act counts; amounts are never negative |
| H | Keys and signatures had many written forms; small-order keys | One lowercase exact-length form; Ed25519 strict; low-s P-256 |
| I | One cheap push cost minutes | One memoised causal past per reading; limits on digits, pairs and waiting |
| J | WebAssembly cut 64-bit lengths to 32 bits; Go and Swift read a failed call as "fine" | Every length, count and index is read as 64 bits; Go panics and Swift throws on a failed call; the C library refuses a partial block |
| K | The reference node trusted the wire | It reads a push from its bytes (`strict_push`); a filter sees only what the asker may (a private block's header alone); a block after a sealed one follows it in the chain; a copy is kept only from its author's signed push; a body beats a false header; a push is judged with all it rests on; a counter or challenge answers once; errors carry no stack or path |
| L | Four depth limits split the network | One depth (32), one read depth (128), enforced alike |
| M | A swapped WebAssembly binary passed CI | CI rebuilds the core with the pinned compiler (1.94.1) and fails unless the bytes match; BUILD.json covers the build config and names the compiler; locked builds everywhere; no install scripts run; advisories cleared; the container runs as a plain user from the lockfile |
| O | The person's tap signed something other than what the page showed | The summary is of the exact draft (its own quantity, the total, the currency's own decimals, the full counterparty id, no direction controls); a standing promise is drafted, not bound; Disconnect signs a stop of the grant; the door answers only its own pages without OAuth; wrong codes slow down; a short id finds nothing; the approval code is never printed; one tool call at a time |
| P | A seller un-signed her sale by rotating; a crossing, a removal, a fork of allocations or a voided close erased what outsiders built on; a side ruled through a role or an agent; a payee's covers cut a payment | A key's own rotation closes only its future; a crossing, a removal, a close and a voided close never erase what an outsider built on unseen; every allocation binds; a side never rules, by any name or hand; covers only raises |
| Q | A side backdated a dispute to skip the first referee; crossing accepts bound by what a delivery merely saw; a majority default picked the number of referees; one week's payment read as all; a referee could not rule on an allocation; a dead person's phone clouded a buyer's title | A backup's wait runs from the earlier referee's own signed receipt; the accept a delivery names binds; a deal states how many referees, or nothing rules until a number is signed; payments name their occurrence; rulings reach allocations; her post-trigger gift yields to her successor's sale |

## What the protocol does not keep

Plainly, so no one relies on it:

- **A lost or stolen key you never rotate.** Whoever holds it signs as you until you rotate it.
- **A custodian or host that holds your key.** It can sign anything your key can sign, and nothing tells its signature
  from yours. The hosted door holds the person's signing key and recovery key under one secret today (see choices below).
- **The local MCP door against an agent that can read your files.** In stdio mode the person's key, recovery key and
  approval code are files the same computer user can read. An agent with a shell can sign as the person. Only the hosted
  door with OAuth, or keys on another device, keeps "the person decides".
- **Two sealed headers that claim one hash.** A node that holds neither body cannot tell which author told the truth; it
  keeps the first. A body that arrives later wins over a false header, but a header against a header is open.
- **What a header shows.** Who wrote, when, how often, and how many recipients share a copy. Sizes are not padded.
- **Prompt injection.** A block's text reaches an agent as data. The structural fences hold (a draft needs a tap; a bind
  needs a grant and a limit), but the agent may still be talked into proposing things.
- **A thief's blocks signed with a key you rotate yourself.** A key's own rotation only closes its future:
  what the old key signed that never saw the rotation still speaks, the thief's blocks too. Only the recovery key reaches
  back to cut them off. Without a recovery key, what a stolen key signed in the past is shown as owed by your key. A thief is not the signer, so you may say beside it that you did not sign it (a `not_free` word, reason `not_me`, promises.md, The signer's word); only the deal's referee rules.
- **An old key crossing the owner's rotation, later.** Whoever still holds a key the owner rotated out can sign a second
  rotation of it that names the same `prev` as hers. The two cross and freeze both new keys. What someone else built on
  stands ((a sale a buyer accepted still counts)), but the frozen key's other blocks count for nothing until a
  recovery key settles it; with none, for good.
- **The recovery reach is per reader.** The folds (ownership, deals) stay pure and are the word: a recovery rotation counted
  to before a sale voids it there. The views `ownership_view` and `promise_view` with arrivals apply the reach,
  so a buyer whose sale arrived before the reach began owns the thing on every node whose arrivals show it.
- **The recovery reach can be claimed by a Sybil.** The reach keeps a block another identity built on before the reach began. A thief
  who forges a transfer can have a second free key sign one block that cites it, so that block builds on the forgery and recovery
  cannot void it. The protocol cannot tell a real second party from a free key without a rule for who counts, and any such rule
  is a default that fills in someone's silence, so it counts every identity alike. A reader who needs more asks for more: a
  builder she has dealt with, a deposit, a witness her own grant names. No rule changes.
- **Free keys let one person look like many.** A key costs nothing, so one person can sign as twenty (the lot-box trick in a draw, a vote, a threshold). The protocol cannot tell a real second party from a free key without a registry, and a registry is a default that fills in someone's silence. The only answers are stakes (a refrain with money behind it) and a signed statement from an issuer the reader chose ("this key is one person, not yet used with you", identity.md), which the reader may weigh or ignore. Turns, votes and shares belong to member keys a circle admitted, never to bare keys.
- **Forward secrecy.** A leaked encryption key opens every envelope ever sealed to it.

## Choices for Patrick (not decided here)

Each is a small story with options. Nothing below is built until you choose.

1. **Keys on the person's own device (local door, hosted door).** Today the local door keeps the key in a file an agent
   can read, and the hosted door keeps the key and the recovery key together. (a) Keys live in the OS keychain or a passkey
   and the tap happens there; (b) the hosted door generates the recovery key on the person's phone and keeps only its hash;
   (c) both. Suggestion: (c), with (b) first, since every hosted person is affected.
2. **Two headers, one hash.** (a) A node keeps every author's header for a hash and the core reads each in its own
   author's chain (a store change); (b) accept it as a known limit (above); (c) a sealed header also signs a digest of
   its envelope, so a copy can be checked, though not a header against a header.
3. **Which keys may sign a request.** Applied (clean round 1), as nodes.md's text already said: only a live key (not
   void, not frozen, not rotated out) opens a door; the core answers `live_keys`, and the reference node reads it.
4. **A key's own rotation reaching back.** Decided (2026-10-29, C1): (b), a key's own rotation only closes the future, and
   reaching back is the recovery key's alone. Applied.
