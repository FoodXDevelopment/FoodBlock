# FoodBlock protocol

Version 1.7, 2026-10-27. Year zero is 1.6; 1.7 adds to it, except the deletions CHANGELOG.md lists.

This is the index: one core, eleven modules, optional profiles and a few data files. Where another document disagrees, core.md governs, then the module that owns the rule. Each rule is stated once. Every protocol word is a machine token; people see their own language.

## Files

- `core.md`: a block, types and verbs, the `std` suite, numbers and time, the genesis, the chain, messages, required fields, `valid`, the compatibility law. Buildable alone with canonical.md.
- `canonical.md`: the one exact byte form of a block.
- `modules/blocks.md`: other fields, causal order, no clock, records, refusals.
- `modules/identity.md`: keys, rotation, recovery, custody, contacts.
- `modules/things.md`: things, transforms, transfers, schemas, truth.
- `modules/promises.md`: sides, terms, answers, settling, claims, disputes.
- `modules/authority.md`: grants, who a block speaks for, scope, the limit, ending, the cut.
- `modules/circles.md`: membership, roles as data, shared records.
- `modules/privacy.md`: commitments, audience, sealing, envelopes.
- `modules/nodes.md`: messages, pull, push, admission, discovery, finding, a node's promise.
- `modules/folds.md`: folds and views, the orderer, ownership, the promise stage, counts.
- `modules/consent.md`: first messages to a stranger, consent as a block.
- `modules/encoding.md`: bytes, shapes, limits, large content, other suites, passkeys, CBOR.
- `transport.md`: email and other envelopes (a convention).
- `profiles/`: optional profiles. `legacy/`: the one-time converter, not protocol. `schemas/`: the base schemas as data.
- `protocol.json`: every closed list and grammar. `vectors.json`, `canonical-vectors.json`: the conformance vectors.

## Optional profiles

A profile is an extra rule set any peer may adopt. A block in a profile is sound under core.md whether or not a reader knows the profile; whether a node takes it in is that node's own promise (nodes.md).

| Profile | What it adds |
|---|---|
| `successor` | a person names who acts for them after an event |
| `ballots` | secret votes in a circle |
| `rekeys` | a circle's key changes when members leave |
| `earnest` | a node may hold an ask until earnest money is paid (its own policy) |
| `short-form` | SMS, USSD and voice, with a receipt code |
| `custody` | SIM-swap quiet period, step-up, assisted channels |
| `erasure` | a node's promise to forget; deleting the salt forgets |
| `attestations` | a key tied to a real-name person or a registered business; who pays a confirmer; the issuers she relies on; a market-price reading (three base schemas) |
| `residency` | where a node promises to store blocks |
| `payment-proof` | payment on an existing rail, the provider as confirmer |
| `addressing` | finding a person by phone number or payment address |
| `tax-recall` | a sealed report and a recall grant, as an ordinary grant-and-schema example |
| `pledges` | a threshold pledge: my money moves only if the pledges for a plan reach my own threshold by my date (two base schemas) |
| `vouches` | I stand behind her for up to N until D; the pay-back; a refrain of no side payments (three base schemas, and the pot; the cap may be money or a count of one named kind) |
| `pools` | a mutual pool: members pay in, a named confirmer's signal pays out, never past the pot (one base schema) |
| `refusals` | refusing together: none of us deals with him until he settles, once enough members have signed (one base schema) |
| `bids` | sealed bids for a quarrel over a price, opened together on a named clock |
| `keeping` | a keeper of goods says in advance what a loss costs him: a `loss`, a loss band (two base schemas) |
| `rulebooks` | a circle's rulebook and glossary, a cover price, a cheap judge, a grader and a fix window (three base schemas) |
| `adapters` | Beckn / ONDC and local traceability schemas |
| `tasks` | any task, software or physical: conditions, skills, progress, horizon |
| `foodblock-profile-epcis` | EPCIS 2.0 and FSMA 204 events |

## Which peer needs which module

One protocol, three sizes of peer (`protocol.json` `peers`). Core is always needed.

- **Micro**, the device: measures, signs, buffers and sends. It needs core.md, canonical.md, blocks.md and encoding.md, and it may use the compact form. A **micro that acts** adds authority.md, checks the grants it acts under and obeys a stop on arrival; with no clock (blocks.md) it leaves the `until` test to its edge.
- **Edge**, the local operator: adds local discovery, Pull and Push with nearby peers, the promise fold for its own deals, and works offline. It signs what devices that cannot sign measured as its own `observe`, the device named in `refs.from`, so a stranger weighs the edge's word. It times a clock-less micro's block with a `receipt` observe.
- **Node**, held by a person or a machine: adds envelopes and commitments, serving Pull and Push to anyone, signed answers, internet discovery, and the folds for every record it holds. A node may also be an **index**, serving others' public records and every fold.

Only people and machines hold nodes. A business, household, regulator or community is a circle of them (circles.md), never a node of its own.

| Module | Micro | Micro that acts | Edge | Node and index |
|---|---|---|---|---|
| blocks | yes | yes | yes | yes |
| encoding | yes | yes | yes | yes |
| identity | own keys | own keys | yes | yes |
| things | the types it writes | the types it writes | yes | yes |
| authority | | yes | yes | yes |
| consent | | | admission and own asks | yes |
| nodes | | | local pull and push | yes |
| promises | | | own deals | yes |
| folds | | | promise fold | every fold (an index serves all) |
| privacy | | | | yes |
| circles | | | | yes |

## Invariants

Each invariant is stated in its module, under its number. Numbers 16 and 21 are not used: both would bind a stranger's computer, so they are a node's own word (nodes.md, A node's promise).

| Number | Module |
|---|---|
| 1, 2, 3, 25 | core.md |
| 4, 5, 26, 31 | folds.md |
| 6, 7, 9, 10, 23 | authority.md |
| 27 | circles.md |
| 8, 19 | identity.md |
| 28 | encoding.md |
| 11, 12, 13, 14, 15, 22 | promises.md |
| 20, 29, 30 | consent.md |
| 24 | things.md |
| 17 | privacy.md |
| 18 | nodes.md |

## Glossary

Each other word is defined where its rule lives: allocation, bearer, side, deal and stage in promises.md; frozen, custodian, recovery key and operator in identity.md; stranger in consent.md; grounds and schema in things.md; commitment and reveals in privacy.md; orderer, fold and view in folds.md; circle in circles.md.
- **Act:** a kind of block a grant covers, named `type.kind` (authority.md).
- **Genesis:** the first block of an identity: an actor with no author, signed by its own key.
- **Speaks for:** the one party a fold counts a block for (authority.md, Who a block speaks for).
- **`for`, `for_whom`:** `for` names the deal or task a block serves; `for_whom` is the hidden person it is for.
- **`kind`, `of`:** `state.kind` is a label for a sort of step or thing; `refs.of` names the kind an instance belongs to.
- **`limit`, `every`, `each`:** a limit (money or an amount) renewing over a period (`every`, a duration), and a cap on one act; either of `limit` and `each` may be left out. In a price, `per` is an amount.

## Conformance

A node conforms, by its own promise (nodes.md), when it reproduces, exactly, the vectors in `spec/vectors.json` for what it does: canonical strings, ids, signatures, commitments, envelopes, folds, refusals, views, CBOR and how identities, deals and circles read. The **door** section tests the core's ops one by one; every op, its arguments and its result are in `protocol.json` (`door`). Signatures are compared byte for byte (core.md section 2); the order of every list in an answer is fixed by the text. Every block in a vector's stories, outside the refusal cases, passes `valid`. A node finds a block's signing key from the identity fold, never from a vector's signer name. This spec, `protocol.json` and the vectors are enough to build a node.

## Open questions

- **Ranking.** How a person's node should weigh closeness (a friend's bakery against a stranger's equal one). The protocol says nothing about ranking; a node may rank or not, by its own rule.
- **Arrival for a newcomer.** A node that takes in a whole history at once sees everything arrive now, which moves recovery reach. How it inherits arrival from the node it syncs from.
- **Part of an instance in a transform.** A transfer can move part of an instance; how a transform names the amount of an input it uses (200 g from a 1 kg bag) is not yet said.
