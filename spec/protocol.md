# FoodBlock protocol

This is the index. A block is `{ type, state, refs }`, signed by its author; its id is the hash of its bytes. The one shape is a promise: *if this happens, this of mine becomes yours*. Each rule is stated once, in its home file; where files disagree, core.md governs, then the file that owns the rule. A rule set is named by the hash of `rule-set.json` (core.md, section 11); "1.9" is a label.

## Files

The protocol (named in `rule-set.json`):
- `core.md`: a block, types and verbs, suites, numbers and text, the genesis, the line, messages, `valid` and `read`, the test (section 10), rule sets and old readers (11), what a builder implements (12).
- `canonical.md`: the one byte form.
- `modules/blocks.md`: other fields, causal order, time, a named clock, the cut, finality.
- `modules/identity.md`: voices, keys, tools, `refs.key`, a close, a will.
- `modules/things.md`: things, makes, transfers, schemas.
- `modules/promises.md`: what a promise is, terms, answers, who may bind, settling, disputes.
- `modules/authority.md`: grants, who a block speaks for, blocks that bind, a limit along a line.
- `modules/circles.md`: owners in parts, rows, members.
- `modules/folds.md`: a line, what is left, ownership, a fork, a promise's stage, counts.
- `modules/privacy.md`: what stays public, not given, commitments, audience, the header, handing on, keeping apart.
- `modules/encoding.md`: bytes, shapes, limits.
- `modules/consent.md`: a STOP is a block, and changes what binds no one.
- `protocol.json`: every closed list, read by code. `vectors.json`: the cases of the sound part and the word ops.

Beside it, not the protocol:
- `modules/nodes.md`, `transport.md`, `conventions.json`, `profiles/`: a node's conventions and words.
- `readings/`, `renderers/`: readings any node may compute, and renderers of their answers, each named by its hash, with its cases.
- `patterns/`: schemas and worked examples; they add no rule.
- `schemas/`: the base schemas as signed things.

## Peers

Conformance is per op (core.md, section 12). The sizes below are a builder's choice, not a rule.

| Peer | Does | Conforms for |
|---|---|---|
| Micro | measures, signs, buffers, sends | `hash`, `id_of`, `header`, `verify` |
| Micro that acts | adds: checks the grants it acts under, obeys a stop on arrival | adds `valid`, `under_ok` |
| Dealer | takes one deal and answers it (below) | `hash`, `id_of`, `header`, `strict_text`, `verify`, `valid`, `read`, and `promise_stage` for a one-to-one deal |
| Edge | adds local pull and push, its own deals, offline | adds the identity and line ops, `promise_stage`, `ownership` |
| Node | holds a person's or a machine's blocks; serves pull and push | the sound part and every word op: it speaks FoodBlock |

Only people and machines hold nodes. A business is a circle of them, never a node.

**A dealer** takes one deal and answers it. It conforms when it does these eight things, and nothing else.
1. **Bytes.** It writes a block as canonical JSON and refuses a message whose bytes are not the bytes its own writer gives for the same value.
2. **Id.** A block's id is the SHA-256 of its bytes as they came.
3. **Who said it.** It checks the signature over the block's header with the key its pieces bring in: the author's genesis, the key grant its `refs.key` names, and that one's pieces. A message that carries a deal to a dealer carries its pieces. A block it cannot open it does not answer.
4. **Its own line.** It signs a genesis once. Each later block names its last block in `prev` and counts `seq` up by one. It keeps its own blocks and may keep nothing else.
5. **Reading a deal.** It reads a first promise with two named sides: `from`, `to`, what moves, `price`, `quantity`, `expires`, and `pay_by` and `deliver_by` as dates for people. A promise that carries a term, a schema, a condition or a `state.rule_set` it does not read, it holds not read and does not accept.
6. **Answering.** Its accept is a `promise` with `status: accepted` that `answers` the offer and names it in `for`; its decline an `observe` with `status: declined`. It adds no term.
7. **Settling.** It signs a `transfer` `for` the deal for what it hands over, and an `accepted` answer, with `covers`, to a payment made to it for that deal. It counts nothing as received on the giver's word. It signs only what its own `read` reads (blocks.md, Micro safety).
8. **Under a grant.** It answers an order signed under a grant only when it can check that grant (authority.md, Blocks that bind); otherwise it asks for the same order in the person's own key, and says so.
It serves no pull and no push, keeps no other person's line, names no clock and reads no profile. What it cannot read it says it cannot read. Any envelope that carries the bytes whole will do; email is the first (transport.md).

**Its cases:** `dealer` in `vectors.json`, twelve stories, each one fixed world:

1. **Accept:** Amara orders 10 sacks from Harry at £300, public: accepted; `promise_stage` binding.
2. **Accept:** the same, sealed to both: accepted.
3. **Accept:** Mama sells 3 mandazi for KSh 10, `step` 1 KES; Leila takes 2: accepted, total 7.
4. **Accept:** Amara's order with `expires` Friday and `pay_by` three days on: accepted.
5. **Refuse:** a message whose bytes are not canonical: `not_canonical`.
6. **Refuse:** a block whose id is not the hash of its bytes: `bad_hash`.
7. **Refuse:** a block whose signature does not open, one of them a passkey signature with flags `0x01`: `bad_signature`.
8. **Refuse:** an order with a `state.rule_set` the dealer does not run: held not read (`unknown_rules`), not accepted.
9. **Settled:** cash in hand: Harry's transfer and Amara's `accepted` with `covers`: `done`.
10. **Settled:** a credit order paid later: Amara's payment, Harry's `accepted` with `covers` after the goods: `done`.
11. **Under a grant:** an order signed by Amara's AI under her grant, which the dealer cannot check: it declines to answer and asks for her own key.
12. **Tampered payment:** a payment whose body changed after signing: refused (`bad_hash`).

## Invariants

The ones that are protocol are numbered 1 to 28 in the order of the Files list above, each in its file: core.md 1 to 5, identity.md 6 and 7, promises.md 8 to 14, authority.md 15 to 19, circles.md 20, folds.md 21 to 26, consent.md 27, privacy.md 28 (last). The others sit beside their text, unnumbered, prefixed "Holds:".

## Glossary

One word, one meaning. Each is defined in its home file; the line here is a pointer.
- **valid**, **read**, **not read**, **unjudged**, **pieces**, **header** (core.md, section 8).
- **line**, **in its place**, **start**, **read whole**, **`not_shown`**, **`lacks`**, **pair** (folds.md, A line; A fork is a burden).
- **stands**, **waiting**, **the cut**, **an end**, **relier**, **seen** (blocks.md). **clock**, **receipt**, **cutoff** (blocks.md, A named clock).
- **voice**, **a key under a voice**, **tool**, **`refs.key`**, **a close**, **a will** (identity.md).
- **measure**, **draw**, **holds**, **lands**, **freed**, **let go**, **amount** (folds.md, What is left; encoding.md).
- **grant**, **keeps to**, **`refs.meter`** (authority.md).
- **request**, **bench**, **due**, **final**, **`crossed`**, **to come** (promises.md; folds.md).
- **circle**, **part**, **row**, **move**, **hand**, **unissued** (circles.md).
- **type**: what kind of block it is. **deed**: something done in the world.
- **commitment**, **reveals**, **audience**, **handing on**, **a wrapped copy** (privacy.md). **schema** (things.md).
- **word**, **reading**, **the sound part**, **speaks FoodBlock** (core.md, sections 10 and 12). **rule set**, **`unknown_rules`**, **an old reader** (core.md, section 11). **a named reading** (promises.md). **a mount** (core.md, section 12).
- **renderer**, **read-back** (renderers/README.md; profiles/short-form.md). **a node's conventions** (`conventions.json`). **software release** (patterns/releases.md). **pattern** (patterns/). **a node's word** (nodes.md).

## Open questions

- **Ranking.** How a person's node weighs closeness. The protocol says nothing.
- The rest is in THREAT-MODEL.md, What the protocol does not keep.
