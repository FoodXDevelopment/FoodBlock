# FoodBlock protocol

Version 1.6 (2026-10-15).

This is the index. The spec is one short core and nine modules, plus a few data files. Where another document in this repository disagrees, core.md governs, then the module that owns the rule. Each rule is stated once.

## Files

- `core.md`: a block, the three moods, seven types and verbs, hashing and signing, the chain, and the numbered invariants. About one page.
- `canonical.md`: the one exact byte form of a block.
- `modules/blocks.md`: the fields a block carries, causal order, no clock, records, refusals.
- `modules/identity.md`: genesis, keys, rotation, recovery, algorithms, custody, contacts, history.
- `modules/things.md`: things, transforms, transfers, truth.
- `modules/promises.md`: sides, terms, answers, settling, claims, disputes.
- `modules/authority.md`: grants, scope, the limit, withdrawal, successor.
- `modules/circles.md`: membership, roles, the circle's key, shared records, ballots.
- `modules/privacy.md`: commitments, audience, sealing, the public header, envelopes.
- `modules/nodes.md`: pull, push, answers, admission, discovery, equivocation, local use.
- `modules/folds.md`: sequencer, ownership, place, the promise stage, what each fold returns.
- `modules/encoding.md`: bytes, numbers, limits, messages, the compact CBOR form, aliases, conformance.
- `modules/profiles.md`: micro, edge, node.
- `transport.md`: email and other envelopes. A convention beside the protocol.
- `protocol.json`: every closed list and grammar, for code to load. `aliases.json`: every earlier shape, read through one table. `vectors.json`: the conformance vectors.

## Which profile needs which module

Core is always needed.

| Module | Micro | Micro acting | Edge | Node | Index |
|---|---|---|---|---|---|
| blocks | yes | yes | yes | yes | yes |
| encoding | yes | yes | yes | yes | yes |
| identity | own keys | own keys | yes | yes | yes |
| things | the types it writes | yes | yes | yes | yes |
| authority | | yes | yes | yes | yes |
| nodes | | | local pull and push | yes | yes |
| promises | | | own deals | yes | yes |
| folds | | | promise fold | every fold | every fold |
| privacy | | | | yes | yes |
| circles | | | | yes | yes |

## Glossary

Terms are defined where they are used: causal past and record (blocks.md), grounds (things.md), side (promises.md), circle#role (circles.md), commitment and sealed (privacy.md), fold and sequencer (folds.md).
- **Counted:** accepted by a fold as settling.
- **Head:** the latest block of a chain or record.
- **Signed:** carrying its author's signature; every block is.

## Open questions

- **Ranking.** How a person's node should weigh closeness (a friend's bakery against a stranger's equal one). Each
  node decides; the protocol only guarantees ranking happens there.
- **Arrival for a newcomer.** A node that takes in a whole history at once sees everything arrive now, which moves
  recovery reach. How it inherits arrival from the node it syncs from.
- **Part of an instance in a transform.** A transfer can move part of an instance; how a transform names the amount of
  an input it uses (200 g from a 1 kg bag) is not yet said.
- **Recall through sealed blocks.** Public headers show the chain but not the content, so a recall travels by asking
  each holder, who answers for the blocks they hold.
