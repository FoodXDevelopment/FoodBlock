# FoodBlock protocol

Version 1.6 (2026-10-15). Year zero: there is no earlier version in the protocol.

This is the index. The spec is one short core, thirteen modules, and a folder of optional profiles, plus a few data files. Where another document in this repository disagrees, core.md governs, then the module that owns the rule. Each rule is stated once. Every protocol word is a machine token; people see their own language.

## Files

- `core.md`: a block, the types and verbs, the `std` suite and how a suite is named, numbers and time, the genesis, the chain, messages, required fields, `valid(block, context)` and invariants 1 to 3 and 25. Buildable alone with canonical.md.
- `canonical.md`: the one exact byte form of a block (RFC 8785 plus strict writing).
- `modules/blocks.md`: the other fields a block carries, causal order, no clock, records, refusals.
- `modules/identity.md`: keys, rotation, recovery, custody, contacts.
- `modules/passkeys.md`: a passkey (WebAuthn) as a p256 key; the one signature form.
- `modules/things.md`: things, transforms, transfers, schemas, truth.
- `modules/promises.md`: sides, terms, relative time, answers, settling, claims, disputes.
- `modules/authority.md`: grants, scope, the limit, withdrawal, acts that cannot be undone.
- `modules/circles.md`: membership, roles as data, shared records.
- `modules/privacy.md`: commitments, audience, sealing, the public header, envelopes.
- `modules/nodes.md`: messages, pull, push, admission, discovery, equivocation, finding.
- `modules/folds.md`: folds and views, the orderer, ownership, the promise stage.
- `modules/consent.md`: a human author for a first message to a stranger, consent as a block.
- `modules/encoding.md`: bytes, shapes, limits, large content (the Merkle root), the other suites (`p256`, `sm`), the compact CBOR form.
- `modules/peers.md`: micro, edge, node.
- `transport.md`: email and other envelopes. A convention beside the protocol.
- `profiles/`: optional profiles (below).
- `legacy/`: the one-time converter for old data. Not part of the protocol.
- `schemas/`: the base schemas, as data: `schemas.json` (source) and `published.json` (signed things with stable ids).
- `protocol.json`: every closed list and grammar, for code to load. `vectors.json` and `canonical-vectors.json`: the conformance vectors.

## Optional profiles

A profile is an extra rule set any peer may adopt. A node that has never heard of one still accepts every block in it.

| Profile | What it adds |
|---|---|
| `successor` | a person names who acts for them after an event |
| `ballots` | secret votes in a circle |
| `rekeys` | a circle's key changes when members leave |
| `deposits` | a node holds an ask until a deposit is paid (node policy) |
| `short-form` | SMS, USSD and voice, with a receipt code |
| `custody` | SIM-swap quiet period, step-up, assisted channels |
| `erasure` | personal fields as commitments; deleting the salt forgets |
| `attestations` | a key tied to a real-name person or a registered business |
| `residency` | where blocks may be stored |
| `payment-proof` | payment on an existing rail, the provider as confirmer |
| `addressing` | finding a person by phone number or payment address |
| `tax-recall` | seller tax reports and a public regulator recall grant |
| `adapters` | Beckn / ONDC and local traceability schemas |
| `tasks` | any task, software or physical: conditions, skills, progress, horizon |
| `foodblock-profile-epcis` | EPCIS 2.0 and FSMA 204 events |

## Which peer needs which module

Core is always needed. Three peers: micro, edge, node. Two are variants: a micro that acts, and an index (a node that serves others' public records).

| Module | Micro | Micro that acts | Edge | Node and index |
|---|---|---|---|---|
| blocks | yes | yes | yes | yes |
| encoding | yes | yes | yes | yes |
| peers | yes | yes | yes | yes |
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

Core has 1 to 3 and 25. The rest are in the module that owns them, with the same numbers.

| Number | Module |
|---|---|
| 1, 2, 3, 25 | core.md |
| 4, 5, 26, 31 | folds.md |
| 6, 7, 9, 10, 23 | authority.md |
| 27 | circles.md |
| 8, 19 | identity.md |
| 28 | passkeys.md |
| 11, 12, 13, 14, 15, 22 | promises.md |
| 16, 20, 29 | consent.md |
| 24 | things.md |
| 17 | privacy.md |
| 18 | nodes.md |

## Glossary

One line for each word a reader may trip on.
- **Act:** a kind of block a grant covers, named `type.kind` (authority.md).
- **Allocation:** an offerer's own `accepted` answer that makes an accept on an open offer bind. It starts a deal of its own.
- **AES-GCM:** a standard cipher that hides data and detects tampering.
- **Arrival:** when a block reached a node, on that node's own record. Never `at`.
- **Attestation:** a trusted issuer's claim that a key belongs to a real person or business.
- **Audience:** who may read a block: `public` or a list of commitments.
- **Bearer:** a promise's receiver is whoever owns a named thing at settlement.
- **Block:** `{ type, state, refs }`, signed.
- **Canonical form:** the one byte form of a block that every language writes the same way.
- **Causal past:** every block reachable from a block through its refs.
- **Chain:** one key's blocks, each naming the one before.
- **Circle:** an actor that is a group of actors: a business, a household, a community.
- **Closed type:** a type whose fields this spec fixes: actor, promise, transfer, grant.
- **Commitment:** a salted hash that hides a value until the salt is shown.
- **Contact:** an actor with no keys, written by anyone.
- **Counted:** accepted by a fold as settling or as speaking.
- **`counted_to`:** the last block of a key's chain that still counts.
- **Custodian:** whoever a person chose to hold their keys.
- **Deal:** a first promise and every block that names it.
- **Edge:** the local operator peer.
- **Envelope:** the encrypted package that seals a block to its audience.
- **Epoch:** a counter of key changes (profiles/rekeys.md).
- **Equivocation:** two blocks of one key naming one `prev`. Proof of a lie.
- **Fold:** blocks in, one answer out, the same on every node (folds.md).
- **Frozen:** a key whose blocks count for nothing until a recovery rotation settles it.
- **Genesis:** the first block of an identity: an actor with no author, signed by its own key.
- **Grounds:** the real event without which a block of some kind is a lie (things.md).
- **Head:** the latest block of a chain or record.
- **HKDF:** a standard way to turn a shared secret into a key.
- **Id:** the hash of a block's canonical bytes. A bare id is SHA-256.
- **Index:** a node that serves others' public records.
- **JCS:** the JSON Canonicalization Scheme, RFC 8785.
- **Key grant:** a grant of kind `key` that brings in, replaces or rotates a key.
- **Merkle root:** one hash that stands for a long stream of chunks (things.md).
- **Micro:** the device peer.
- **mDNS / DNS-SD:** the standard way devices announce a service on one network.
- **Mood:** what a block claims: it exists, it is so, it must be, or it may be.
- **NFC:** the standard form for Unicode text, so equal text has equal bytes.
- **Node:** the peer held by a person or machine; also the software that holds someone's blocks.
- **Open type:** any type but the four closed ones. Stored and passed on; it grants no authority.
- **Operator:** the author of an agent's or machine's operator grant. It answers for it.
- **Orderer:** the one key that orders a record's binding blocks (folds.md).
- **Passkey:** a key kept in a phone or computer and used with a fingerprint or face; its signature is the p256 passkey form (passkeys.md).
- **Profile (optional):** an extra rule set in `profiles/`. **Peer:** micro, edge or node.
- **Record:** a block and every version after it.
- **Recovery key:** an offline key that outranks the others in its identity.
- **Reveals:** the salts and values sent with a sealed copy to its recipient only.
- **RRULE:** RFC 5545's text rule for repeating dates.
- **Schema:** a thing of kind schema that says what fields and grounds a kind of block has.
- **Side:** the giving or receiving end of a promise.
- **Skip:** a block that jumps `seq` forward because the counter was lost.
- **Speaks for:** the one party a fold counts a block for: its author, the circle it names in `as` if its author may sign for it, or the grantor of the grant it acts under (folds.md).
- **SPKI DER:** a standard byte form of a public key.
- **Stranger:** someone who has answered none of a sender's blocks and has given no YES (consent.md).
- **Suite:** a hash, a signature algorithm and an envelope named together.
- **UCUM:** a standard list of units of measure.
- **Verb:** a ref key that links blocks by meaning.
- **View:** a fold plus the reader's clock or arrivals (folds.md).
- **Void:** a key or block that does not count, after a rotation's `counted_to` or on a bad key.
- **`for`, `for_whom`:** `for` names the deal or task a block serves; `for_whom` is the hidden person it is for.
- **`kind`, `of`:** `state.kind` is a label for a sort of step or thing; `refs.of` names the kind an instance belongs to.
- **`limit`, `per`:** a grant's money limit and the period it covers (a duration). In a price, `per` is an amount.

## Conformance

A node conforms when it reproduces, exactly, the vectors in `spec/vectors.json` for what it does: canonical strings, ids, signatures, commitments, envelopes, and how identities, deals and circles read. The vectors include folds (with expected results), refusals (with the codes the strict check `check` finds, core.md section 8), views, and CBOR. The **door** section of the vectors tests the core's ops one by one: every op, its positional arguments and its result are written in `protocol.json` (`door`), so a node that reads the text alone knows what to build and what a case asks of it. Signatures are compared byte for byte (core.md section 2 fixes the nonce); the order of every list in an answer is fixed by the text. Every block in a vector's stories, outside the refusal cases, passes `valid`. A node finds a block's signing key from the identity fold, never from a vector's signer name. This spec, `protocol.json` and the vectors are enough to build a node. Each invariant is tested by at least one vector.

## Open questions

- **Ranking.** How a person's node should weigh closeness (a friend's bakery against a stranger's equal one). Each node decides; the protocol only guarantees ranking happens there.
- **Arrival for a newcomer.** A node that takes in a whole history at once sees everything arrive now, which moves recovery reach. How it inherits arrival from the node it syncs from.
- **Part of an instance in a transform.** A transfer can move part of an instance; how a transform names the amount of an input it uses (200 g from a 1 kg bag) is not yet said.
