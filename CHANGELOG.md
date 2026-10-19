# Changelog

What changed in each version. The spec says what each version means; this page says what moved.

## 1.6.0 (October 2026, in this repository, not yet published to package managers)

Year zero: 1.6 is the first version of the protocol itself. Old data enters once, through the converter in `spec/legacy/`.

- The spec split into one short core (`spec/core.md`) and thirteen modules, with every closed list in `spec/protocol.json`.
- Seven types in three moods, seven verbs; four closed types carry authority.
- Signing suites `std` (Ed25519), `p256` (including passkeys) and `sm`.
- Privacy: commitments, sealed blocks, erasure by deleting the salt.
- Consent as a block: STOP binds by fold, and only the person can lift it.
- One Rust core for every rule, with SDKs in JavaScript, Python, Go, Swift and Kotlin over it.
- Assurance: conformance vectors every SDK reproduces, an implementation written from the spec text alone, a differential fuzzer, a deterministic world simulator, and a TLA+ model checked in CI.
- Profiles: short-form (SMS, USSD, voice), EPCIS 2.0 and FSMA 204, Beckn/ONDC adapters, and others.
- The core published as IETF Internet-Draft draft-reynolds-foodblock-core.

Security fixes: none reported.

### 1.6 revisions after the audit (2026-10-19)

A read-only audit compared the Rust core with the oracle and tried the spec against strangers. These nine rules close what it found. 1.6 is still year zero and still unpublished to any registry, so they are revisions of 1.6, not a new version: nobody holds a 1.6 block or package that they could break. Each rule has vectors that the core and the oracle both pass (`spec/vectors.json`, made by `sdk/javascript/test/make-vectors-refine.cjs`); the audit worlds are permanent tests in `test/audit/`.

1. A block speaks for one party: a block signed `as` a circle counts for the circle only if its author holds `sign` there (`may_act_as`); otherwise for no one, in every deal and ownership fold.
2. The maker of a thing made `as` a circle is the circle, so shares and stock made for a business are the business's.
3. A bearer promise's side is the named thing's current owner, so the holder's accept binds; `valid` leaves that judgement to the fold.
4. An allocation starts a deal of its own, so several takers on one open offer no longer share a stage or count each other's payments.
5. A promise's terms are fixed once written: an `updates` of a promise is its author's stop and nothing else (refused as `required`, counted for nothing by a fold).
6. A transfer or work block that a side or a named confirmer `defeats` stops counting toward the stage.
7. Reversibility is closed by default: an act that moves things or binds someone is irreversible for an agent unless a trusted schema (the grantor's, or one the grantor confirmed), named in `refs.schema`, says `undo: ok`; a stranger's schema can neither block nor unblock another person's act.
8. A reading counts as grounds only if the sensor itself or an operator of the sensor (an `operator` grant naming it in `refs.subject`) signed it.
9. Member acceptances and stops are derived from the member grant they answer or update; no hidden `kind` or `subject` is needed.

Also: the core and the oracle now give identical answers for every fold over every audited world and every vector story (`node test/audit/run.cjs`), which settled seven small differences the spec text decides (what a stage reports before a binding accept, confirmers named as `circle#role`, the chain's head, the earliest owner transfer, and others). Door ops `ownership`, `where_now` and `under_ok` are named in `protocol.json`.

### Phase 2 of the 1.6 refinement (2026-10-19): compress, publish the base schemas, add the Merkle rule

Still year zero and unpublished. Every change was checked against FoodOS and the app (nothing a FoodOS file reads or writes was deleted).

Compression:
- Deleted the closed fields nothing reads and FoodOS does not use: `terms.pay_by`, `terms.if_wrong`, `terms.settled_by`, `terms.text`, `promise.not`, `state.lang`. A dispute is settled by a confirmer the deal's schema names.
- Deleted `{share, of}` prices (nothing can evaluate a measure no block gives) and the `field_types` list (nothing read it; a schema's `fields` are names with a free hint).
- The field lists for the open types (thing 13, observe 12, transform 1) and the five profile lists for observe left `protocol.json`: they refused nothing. The base schemas describe them.
- The key fields an actor and a grant share (public_key_sign, public_key_encrypt, suite, recovery_*, roles, custodian) are defined once in `key_fields`; a block looks the same. The door op `base_fields` gives every SDK its `FIELDS` from the core.
- Deleted the `schema` and `grounds` lists (no code read them; the `schema` base schema names them).
- `core.md` keeps `std` and how a suite is named; `p256`, `sm` and the passkey form moved to `modules/encoding.md` and `modules/passkeys.md`.

Left as they were, because FoodOS or the core reads them: `terms.deliver_by` and `terms.until` (FoodOS promise, scope and edge code), the `recovery_*` fields (the identity folds and the recovery rule read them), `keep` (FoodOS writes transforms with a subject: cooking sessions, deeds), `refs.for_whom`, `refs.same_as`, `refs.of`, `state.channel`, `state.where`, `state.confidence`, and the separate `until` and `condition` of a grant's scope.

Added:
- `spec/schemas/`: 17 base schemas as signed things with stable ids, vectors for each, and audit case 11 (a vote under shares, kept and broken promises, person-confirmed delivery, teach, loan and payout over the shared folds).
- The Merkle rule (modules/encoding.md): leaf = SHA-256 of 00 then the chunk, node = SHA-256 of 01 then both hashes, an odd one carried up; a proof is the sibling hashes from the leaf up. Door ops `merkle_root`, `merkle_proof`, `merkle_verify`, in the core and the oracle, with vectors and a parity check for 1 to 40 chunks.
- Profile attestations, Devices: "this device, set up by X, reported Y at T". A reading counts when its signer is the sensor, the sensor's owner, or the receiver of a live operator grant the owner signed (Phase 1 counted a grant anyone wrote). Audit case 12 and door vectors.
- The oracle reads a schema store and settles one line rule it got wrong (a promise with a thing and no quantity needs one counted transfer).

Scoreboard (before, after): listed fields 74, 38; closed-type fields 48, 38; terms 13, 9; scope fields 7, 7; reference keys 24, 24; modules 13, 13; profiles 15, 15; lists in `protocol.json` 56, 54; core.md 158 lines (17,418 bytes), 151 lines (15,856 bytes).

## 0.5.0 (20 February 2026, npm)

The JavaScript SDK, MCP server and CLI of the 0.x protocol. Superseded by 1.6.

## 0.4.0 (17 February 2026, npm)

## 0.1.0 (16 February 2026, npm and PyPI)

First public release: SDK, whitepaper and sandbox.
