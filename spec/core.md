# FoodBlock core

Version 1.6 (2026-10-15). This page and the modules your profile names (protocol.md) are enough to build a node. Where files disagree, this page governs.

**A block** is `{ type, state, refs }`, signed by its author. `state` holds data; `refs` holds links to other blocks. Its id is the SHA-256 of its canonical JSON (canonical.md); the author signs the same bytes. A reader recomputes the hash and never trusts a sent one.

**Three moods, seven types.**
- Exists: `actor` (a person, agent, circle or contact), `thing` (anything held, found or written).
- Is: `observe` (a claim), `transform` (things change), `transfer` (owner, holder or place changes).
- Must: `promise`. May: `grant`.

**Seven verbs** link blocks: `updates` (new version), `answers` (consent, the only kind), `confirms` and `defeats` (truth only), `for` (what it serves), `derives_from` (what it came from), `same_as` (two records are one). `prev` and `after` are causal, not verbs. Detail: things.md, promises.md.

**The chain.** Each signing key has its own chain. Its first block has `seq` 1 and `prev` the block that brought the key in (the genesis, or a key grant). Each later block adds one to `seq` and names the key's block before in `prev`. Every block but a genesis names its `refs.author`. Fields: blocks.md.

**The line.** The protocol carries only what strangers must agree on with no boss: who said it, under what authority, to whom, with what consent, and how it settled. Drafts, beliefs, goals, limits, budgets and rankings stay on each person's own node, the software that holds their blocks and speaks for them.

**Strict writing, generous reading.** A node writes only the current shapes and reads every earlier shape through `aliases.json`. It never changes signed content: it refuses a block, and the author re-signs. Every closed list is in `protocol.json`; the spec names a list and does not repeat it.

**Any phone.** Holding keys is better, never required (identity.md, Held keys).

## Invariants

A core node keeps 1 to 3 always, and the rest for each module it uses. Module in brackets.

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. Within one signing key, each `seq` holds at most one block; two prove a lie: both are kept, and neither binds anyone else. (nodes.md)
4. A record's binding blocks come from its one sequencer and form one chain; two that do not see each other prove a lie. (folds.md)
5. An instance has at most one owner in any fold. (folds.md)
6. Nothing that gives, takes or orders authority reads another author's clock. (authority.md)
7. No tie on authority is broken by hash. (authority.md)
8. A key speaks only if every block that brought it in is valid and none crosses a rival the recovery key has not settled; a key is rotated only by itself or the recovery key, and speaks no further after `counted_to`. (identity.md)
9. A grant is live only while every ancestor grant is live. (authority.md)
10. A child grant's scope is a subset of its parent's on every field. (authority.md)
11. What is bound from an offer never exceeds what is offered. (promises.md)
12. A block counts in a deal only if a side, or its agent under a grant, signed it. (promises.md)
13. A promise is settled only by blocks the receiving side accepts or the grounds confirm. (promises.md)
14. An unanswered ask or claim binds no one. (promises.md)
15. `answers` is the only consent. (promises.md)
16. A 1.6 identity has no history; an older identity's history is closed by its first 1.6 block, and what is in it stands. (identity.md)
17. Nothing outside the audience can name a recipient. (privacy.md)
18. Every node answer a reader relies on is signed by the node. (nodes.md)
19. A key held by someone else always says so, and its holder signs only on the person's own word. (identity.md)
