# FoodBlock 1.9 threat model

**Draft for Patrick, 2026-11-16. Not published.** It says who can attack FoodBlock, what the protocol keeps against each of
them, and what it does not keep. It claims only what the code keeps today: every "kept" line below has a vector in
`spec/vectors.json` or a test in `host/`, `mcp/` or
`sdk/rust/tests/`, and the Rust core and the spec-only oracle agree on it. Where a line says "not kept", it is not kept.

The source is the twenty-lens security review of 2026-10-28 (its root causes A to O), the three-round review of 2026-11-11 (its root causes R to W) and the stress test and plan of 2026-11-12. Each root cause is now fixed in the
core, the oracle and the spec text, except where the last section says otherwise.

## The one idea

Only a signed word binds, and only its signer. Every rule below is a way of keeping that true when someone tries to make
a word bind that nobody signed, or bind someone who did not sign it.

Two facts shape everything:

- **A reading (a fold) has no clock and no arrival order.** Two honest readers who hold the same blocks read the same
  answer. So a rule can never depend on "this arrived late" or "this node saw it first". If a rule needs lateness or
  delivery, a signed block must carry it.
- **The node is the trust boundary.** A node stores what it is sent and serves it on. It judges every block (`valid`, then `read`) before it takes it; a block it cannot read it keeps as its header and counts in no fold.

## Who attacks, and what they can do

| Who | Can | Cannot (kept) |
|---|---|---|
| **A keyless stranger** | send any bytes to any node; sign as themselves; name anyone in their own blocks | make a block read as someone else's; give a signed block a second id (no suite label exists, E; one written form for keys and signatures, H); rewrite a block's bytes at a node (the node reads text strictly, K); make a node store a private block's content as an answer to a filter (K); store a junk copy in a recipient's place (K); drop a real block with a false header claiming its hash, once the block arrives (K); make a machine speak for anyone: it speaks for a person only under her grant (A) |
| **The holder of an ended key** (a thief, an ex-employee) | keep signing with it; inside a stated reach, have those blocks wait | have any block count that has seen the key grant that ended it, or that her clock received after it; reach anything above its own place; loosen its own place's wait or reach |
| **A thief of one voice, for ten minutes** | sign as that voice; with no reach, words a relier uses unseen | where her list states a `wait`, make a key grant, grant, account word or hand-over stand (each needs the same key again after that wait, or a voice above: blocks.md, Finality); change anything above that voice |
| **A misbehaving or captured agent** | act inside its grant | bind its giver by a block that does not keep to a promise she signed in `on`, past its grant's line, or before what it pays is due (authority.md, Blocks that bind) |
| **A counterparty** | act inside a deal; name their own schema and causal past | forge the other side's payment, refund or delivery (G: only the right side's signed word counts); redeem a note twice; add a quantity the offer never had; make an amount negative |
| **A relay or the network** | read, drop, reorder, duplicate or rewrite bytes | change a signed block without its id changing; make a 32-bit reader (WebAssembly) and a 64-bit one read the same bytes differently (J) |
| **A node operator or host** | store, drop, delay; see everything public; see what it is handed (privacy.md, What stays public); if it runs her AI, see what her AI reads | forge a person's signature; hold her key (no host makes one: identity.md, One signature, once); close a wait or a reach alone where she named two clocks or more; see any header of a sealed block it carries no copy of; be shown not to have left out a block it receipted (nodes.md, The arrival log) |
| **A rival pulling** | read public blocks; count a door log's gaps | read any sealed header; pair two traders by their sealed blocks |
| **A stranger at a machine** | sign a stop of someone's machine | lock it: only the owner's backed stop is his word (patterns/machines.md) |
| **A rival rule set** | publish a set that passes the old cases and reads one word differently | be read into a block that does not name it (core.md, section 11) |
| **A state** | compel a host or custodian; seize servers | break the signature or encryption suites |

## What the protocol keeps (the eight cornerstone repairs and the hardening)

| | Root cause (before) | Kept now |
|---|---|---|
| A | A stranger's operator grant took over any agent | There is no operator grant: a machine speaks for a person only under a grant she gave (identity.md) |
| B | An old key could fork the past, voiding title and debts | After a key grant that ends a key, only the counted line counts; a pair never frees or favours its signer (folds.md, A fork is a burden) |
| C | The first key grant to name a recovery key won; a planted key was permanent | A voice changes only what is below it; a word that lets another act stands once that key has said it again after her `wait`, or a voice above has said it |
| D | A will was power of attorney from signing | It has no power until a counted close is in the block's past |
| E | An unsigned suite label gave a block a second id | The suite comes from the signing key; no message names one |
| F | Folds ignored the grant's limits | Every fold that counts a block under a grant reads `under_ok` |
| G | The deal fold trusted unsigned side-blocks | Only the right side's signed block counts; amounts are never negative |
| H | Keys and signatures had many written forms; small-order keys | One lowercase exact-length form; Ed25519 strict; low-s P-256 |
| I | One cheap push cost minutes | One memoised causal past per reading; limits on digits, pairs and waiting |
| J | WebAssembly cut 64-bit lengths to 32 bits; Go and Swift read a failed call as "fine" | Every length, count and index is read as 64 bits; Go panics and Swift throws on a failed call; the C library refuses a partial block |
| K | The reference node trusted the wire | It reads a push from its bytes (`strict_push`); a filter sees only what the asker may; a copy is kept under the node's admission rule, and a stranger is sent nothing of a sealed block; a body beats a false header; a push is judged on each block's pieces; a counter or challenge answers once; errors carry no stack or path |
| L | Four depth limits made readers disagree | One depth for bytes (32), enforced alike; a fold's depth is its reader's own, and a reader that stops says so (`not_shown`), never another owner |
| M | A swapped WebAssembly binary passed CI | CI rebuilds the core with the pinned compiler (1.94.1) and fails unless the bytes match; BUILD.json covers the build config and names the compiler; locked builds everywhere; no install scripts run; advisories cleared; the container runs as a plain user from the lockfile |
| O | The person's tap signed something other than what the page showed | The summary is of the exact draft (its own quantity, the total, the amount as signed, the full counterparty id, no direction controls); an open-ended promise is drafted, not bound; Disconnect signs a stop of the grant; the door answers only its own pages without OAuth; wrong codes slow down; a short id finds nothing; the approval code is never printed; one tool call at a time |
| P | A seller un-signed her sale by rotating; a crossing, a removal, a fork of allocations or a voided close erased what outsiders built on; a side ruled through a role or an agent; a payee's covers cut a payment | A key's own key grant names no `counted_to`; a reach is a wait, never an undo; a close and a removal never erase what stood; every allocation binds; a side never rules, by any name or hand; `covers` only raises |
| Q | A side backdated a dispute to skip the first referee; crossing accepts bound by what a delivery merely saw; a majority default picked the number of referees; one week's payment read as all; a referee could not rule on an allocation; a dead person's phone clouded a buyer's title | A backup's turn begins at cutoffs on the clocks the grounds name, running from their receipt of a side's dispute, never at a date; the accept a delivery names binds; a deal states how many referees, or nothing rules until a number is signed; payments name their occurrence; rulings reach allocations; her gift after a counted close yields to the sale her will gives |
| R | Any unsigned pull got every sealed header; a rival paired traders 30 of 30 | A sealed block, header and all, goes only to its audience and whom they hand it on |
| S | A newer field was refused for good and froze its author's line | It is valid and not read, kept as its header; the line answers `not_shown` |
| T | A stranger's free key locked a machine | Only the owner's backed stop is a lock |
| U | A hidden limit bound past itself | Only a limit the other side reads binds (authority.md) |
| V | A word's answer turned on a sum, a reader's clock or a profile | No word reads a view, a profile or a reader's clock (core.md, section 12) |
| W | "1.7" named eighteen rule sets and the lock could not be checked | A rule set is named by its hash, and read only by a block that names it. |

## What the protocol does not keep

Plainly, so no one relies on it:

- **Her first voice stolen.** Whoever holds it is her, for good. She may say `not_me` beside each block (promises.md, The signer's word). Every system checked ends here; a first voice named by hash and never on a device is the only help.
- **A thief with a key copy.** He can say a word again himself once its wait has run; the wait does not stop him. Her own next block on that key makes a pair, which only a holder of both branches sees.
- **One clock named alone** can end every wait, run every reach and order every end for those who named her. Two of three, of two firms, is the cure, and it is hers to choose.
- **A word with no reach**, signed by a thief, binds her where a relier used it unseen; her claim is on the thief (blocks.md, From where a stop counts).
- **Two sealed headers that claim one hash.** A node that holds neither body cannot tell which author told the truth; it
  keeps the first. A body that arrives later wins over a false header, but a header against a header is open.
- **What a carrier sees.** A node that carries a sealed copy sees what it is handed (privacy.md, What stays public). Only its own signed promise not to tell binds it to silence; a stranger sees none of it.
- **Prompt injection.** A block's text reaches an agent as data. The structural fences hold (a draft needs a tap; a bind
  needs a grant and a limit), but the agent may still be talked into proposing things.
- **A free key as the relier.** On a word with no clock, a thief's act past her stop stands where a second free key of his answers it unseen. Naming a clock closes it.
- **Free keys let one person look like many.** A key is free to make, so one person can sign as twenty (the lot-box trick in a draw, a vote, a threshold). The protocol cannot tell a real second party from a free key without a registry, and a registry is a default that fills in someone's silence. The only answers are stakes (a promise not to do, with money behind it) and a signed statement from an issuer the reader chose ("this key is one person, not yet used with you", identity.md), which the reader may weigh or ignore. Turns, votes and shares belong to the hands a circle's rows count, never to bare keys.
- **Proof to everyone.** A block proves who said it to everyone who holds it, for as long as they hold it (privacy.md, Not given).
- **One host for both ends** sees who deals with whom, whatever is sealed.
- **A later buyer** sees the amounts and times of every earlier sale on the seller's line, unless the seller sells from lots or backs his title.
- **A holder's fork.** Each branch binds her where a relier used it unseen, one bound per line; a meter she names closes it.
- **A meter's fork.** Its proven lie, never the holder's.
- **A renewing limit** is read on her clock: with a clock of one, that clock says when a period turns.
- **A firm offer with no end and no clock** cannot be withdrawn from one who has not seen the withdrawal.
- **A clock of one** has no proof of its silence.
- **A count of names is a count of keys** (free keys).
- **A payee who signs nothing** keeps off-record money she was paid, and only her word shows it came.
- **Money as a plain unit word** ("KES") does not say whether it is a claim on someone.
- **A ring of circles** whose owners end in no person is shown, never refused.
- **A second identity under a weak table** (a father who joins his own family circle twice) counts where its rows let it.
- **A circle with no clock** is bound by a move an outside relier used without seeing its end (blocks.md, From where a stop counts).
- **A row read only on lines read whole** answers `not_shown` to a reader missing one.
- **A key that writes public and sealed blocks** is refused by no check: its public line is `not_shown` to strangers.
- **Delay and order by a sole clock**: between receiving and signing she is free, and no block shows it.
- **A rule set named and never published** is not read by anyone, for good.
- **Forward secrecy.** A leaked encryption key opens every envelope ever sealed to it.

## What the protocol refuses

Plainly, so no one waits for it. **Who connects to which node, how much and when** is not hidden: the protocol adds no mixing, cover traffic, private retrieval or scanning. A carrier knows whom it carries for. A person who wants a network to learn less uses a link that hides it; a person who wants a carrier to say less holds its signed promise not to tell.

1. **Rule sets as swappable code, routed by "the word that gives authority".** Silent Leila is made owner by Harry's set (seats 14, 15, 32).
2. **"Else the set her list states."** An old reader names a different owner on unchanged bytes (seat 32).
3. **`sound.json` as a gate, `continues`, clean forks and splits.** They made a network of a file and let a set claim to read another's blocks the same.
4. **A shelf of releases** that says which count. A release is its signer's word; a list kept by one party is a boss (seat 46).
5. **Sealed sender.** A deal goes back and forth, and statistical disclosure links a hidden sender in a handful of messages.
6. **Mixnets and cover traffic.** They take delay and constant traffic that a person paying per megabyte and often offline cannot pay.
7. **Private retrieval.** The node already knows which copy is hers; it would hide what is not secret.
8. **A relay** in front of a host. It hides where from, never who, and adds a party; a wrapped copy hides more (seat 43 B3).
9. **Counter skips by default.** They do not hide a count: Harry divides by five and is within 11% (seat 43 B2).
10. **A public list of every key a host holds.** It is a map for anyone who seizes it.
11. **A signature only the two sides and their judge can check.** The judge could then write her orders (seat 42 B2).
12. **Publishing a one-deal key afterwards, to make its words deniable.** Anyone could then sign a twin and wipe out a later buyer (seat 42 B4).
13. **`state.answer` in the read-back.** It tells the other side what her node holds about a third (seat 45 B9).
14. **Name matching in the checked text** ("two held things share a name"). A Cyrillic о beats it, and a table of look-alikes is a lookup table (seat 45 B6). In its place: "an id you have no name for", "first deal with this seller".
15. **The rules line on a screen** ("Rules: FoodX 1.8 ..."), **`held: true/false`**, **"her word only"**, **printing `needed`, `names` or `n/d`.** Each told her nothing she would act on, or something false.

## Choices for Patrick (not decided here)

Each is a small story with options. Nothing below is built until you choose.

1. **Keys on the person's own device.** Decided (decision 6): no door makes or holds a person's key; the local door signs by her passkey, the CLI by the system keychain (changes-1.8/01-keys.md, section 7).
2. **Two headers, one hash.** (a) A node keeps every author's header for a hash and the core reads each in its own
   author's chain (a store change); (b) accept it as a known limit (above); (c) a sealed header also signs a digest of
   its envelope, so a copy can be checked, though not a header against a header.
3. **Which keys may sign a request.** Applied: only a key that speaks for its signer opens a door (nodes.md, Messages); the core answers `live_keys`.
