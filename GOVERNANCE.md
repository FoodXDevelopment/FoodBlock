# Governance

How this copy of FoodBlock is changed. Nobody governs the protocol: it is whatever the computers of the people who choose to run it compute alike. This repository is FOODX WORLD LIMITED's copy, and this page is only about how FoodX changes its own copy. It says nothing about what the protocol should contain, and it binds nobody else.

## How a change is proposed

1. **Open an issue** at https://github.com/FoodXDevelopment/FoodBlock/issues. Say what you saw, what you expected, and why it matters. A failing block or vector is the best report.
2. **Open a pull request.** One change, small, with a test that proves it (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
3. **The spec governs.** The files `spec/rule-set.json` names are the protocol. If code and spec disagree, one of them is a bug. A change to a rule changes the spec first, in the same pull request, and updates `spec/protocol.json` and the vectors.
4. **Two engines must agree.** The Rust core and the oracle (`spec/oracle/`, written from the spec text alone) must give the same answer on every vector and every audited world. A change that makes them differ is not finished. If the oracle cannot be written from the text, the text is unclear, and the text is what gets fixed.
5. FoodX's maintainers merge into this copy when the tests pass and the change makes the system simpler, and give a reason when they decline. A merge changes this copy only. Anyone's fork is equal to it, and each reader chooses which to run.

## How rule sets are named

- **A rule set is named by its hash** (`spec/core.md`, section 11). "1.9" is a label. A change of one byte is another rule set.
- **Anyone may publish one,** with no one's leave. A block is read under the set it states, or by the core alone.
- **A release** is a person's signed word naming bytes by hash: an `observe` of kind `software_release` (patterns/releases.md) that names a rule set by its id, and each package and binary built from it by its SHA-256. It binds only its signer, to the truth that those are hers. No list on this page or anywhere says which releases count, and no one's release outranks another's. A reader picks whose release words she trusts and checks the bytes against their hashes.
- A package carries its own package number; that is the package's business, not the protocol's.

## Anyone may fork

FoodBlock is in the public domain (CC0 1.0, decided 2026-10-29, replacing MIT): an idea is not property, so nobody holds a claim on it. Anyone may copy, change, run and publish their own version, with no permission. What keeps people able to read each other's blocks is the shared core: blocks that hash and verify the same way everywhere. That is a fact about bytes, not a membership rule: a fork that changes how blocks hash or verify writes blocks that the others cannot read, and a fork that keeps it writes blocks everyone can.

## Who wrote it

FOODX WORLD LIMITED wrote it and waived its copyright by the CC0 dedication. It holds no power over the protocol and plans no steward: a steward, however neutral, would be a new governor. On the name, it makes a promise that restrains only itself: FOODX WORLD LIMITED will never sue or threaten anyone for calling their copy or fork "FoodBlock" (decided 2026-10-29). Readers tell copies apart by what they compute, not by a trademark.

## Security and conduct

Report a weakness as [`SECURITY.md`](SECURITY.md) says, not in an issue. Everyone here follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
