# Governance

How this copy of FoodBlock is changed. Nobody governs the protocol: it is whatever the computers of the people who choose to run it compute alike. This repository is FOODX WORLD LIMITED's copy, and this page is only about how FoodX changes its own copy. It says nothing about what the protocol should contain, and it binds nobody else.

## How a change is proposed

1. **Open an issue** at https://github.com/FoodXDevelopment/FoodBlock/issues. Say what you saw, what you expected, and why it matters. A failing block or vector is the best report.
2. **Open a pull request.** One change, small, with a test that proves it (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
3. **The spec governs.** `spec/core.md` and `spec/modules/` are the protocol. If code and spec disagree, one of them is a bug. A change to a rule changes the spec first, in the same pull request, and updates `spec/protocol.json` and the vectors.
4. **Two engines must agree.** The Rust core and the oracle (`spec/oracle/`, written from the spec text alone) must give the same answer on every vector and every audited world. A change that makes them differ is not finished. If the oracle cannot be written from the text, the text is unclear, and the text is what gets fixed.
5. FoodX's maintainers merge into this copy when the tests pass and the change makes the system simpler, and give a reason when they decline. A merge changes this copy only. Anyone's fork is equal to it, and each reader chooses which to run.

## How versions work

- **The current version (1.7) stays editable until the lock** (`spec/core.md`, section 11): once two nodes and one implementation, each written and run by parties other than the author of that spec hash, pass its vectors at a published hash of the spec. That is a fact anyone can check by running the vectors; nobody declares it, its author included, and each reader decides for themselves whether it holds. Until then nobody outside relies on it, so a revision breaks no one. From the lock the author of this copy stops changing its words; anyone may publish a continuation. 1.7 was such a revision of 1.6, and every 1.6 block is a 1.7 block. Revisions are listed in [`CHANGELOG.md`](CHANGELOG.md).
- **The lock covers the words, not the readings.** From the lock, what a signed block means never changes: its bytes and id, its chain, its validity, whom it speaks for, what it binds and who owns what it moves. A new version never makes an existing block invalid: a block that was valid stays valid and keeps its id. Every other fold or view is a named reading; a better one is published beside it under a new name, and the old keeps its answers.
- Every package carries one version, taken from `spec/protocol.json`.

## Anyone may fork

FoodBlock is in the public domain (CC0 1.0, decided 2026-10-29, replacing MIT): an idea is not property, so nobody holds a claim on it. Anyone may copy, change, run and publish their own version, with no permission. What keeps people able to read each other's blocks is the shared core: blocks that hash and verify the same way everywhere. That is a fact about bytes, not a membership rule: a fork that changes how blocks hash or verify writes blocks that the others cannot read, and a fork that keeps it writes blocks everyone can.

## Who wrote it

FOODX WORLD LIMITED wrote it and waived its copyright by the CC0 dedication. It holds no power over the protocol and plans no steward: a steward, however neutral, would be a new governor. On the name, it makes a promise that restrains only itself: FOODX WORLD LIMITED will never sue or threaten anyone for calling their copy or fork "FoodBlock" (decided 2026-10-29). Readers tell copies apart by what they compute, not by a trademark.

## Security and conduct

Report a weakness as [`SECURITY.md`](SECURITY.md) says, not in an issue. Everyone here follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
