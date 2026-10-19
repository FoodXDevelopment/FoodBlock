# Governance

How FoodBlock is changed, and who may change it. This page is about process only. It says nothing about what the protocol should contain.

## How a change is proposed

1. **Open an issue** at https://github.com/FoodXDevelopment/FoodBlock/issues. Say what you saw, what you expected, and why it matters. A failing block or vector is the best report.
2. **Open a pull request.** One change, small, with a test that proves it (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
3. **The spec governs.** `spec/core.md` and `spec/modules/` are the protocol. If code and spec disagree, one of them is a bug. A change to a rule changes the spec first, in the same pull request, and updates `spec/protocol.json` and the vectors.
4. **Two engines must agree.** The Rust core and the oracle (`spec/oracle/`, written from the spec text alone) must give the same answer on every vector and every audited world. A change that makes them differ is not finished. If the oracle cannot be written from the text, the text is unclear, and the text is what gets fixed.
5. Maintainers merge when the tests pass and the change makes the system simpler. They give a reason when they decline.

## How versions work

- **1.6 stays editable until the first registry release.** Nothing has been published to a package registry yet, so nobody holds a 1.6 block or package that a revision could break. Revisions to 1.6 are listed in [`CHANGELOG.md`](CHANGELOG.md).
- **After the first registry release, 1.6 is frozen.** Any change is 1.7 (and so on). A new version never makes an existing block invalid: a block that was valid stays valid and keeps its id.
- Every package carries one version, taken from `spec/protocol.json`.

## Anyone may fork

The licence is MIT. Anyone may copy, change, run and publish their own version, with no permission. What keeps the network interoperable is the shared core: blocks that hash and verify the same way everywhere. A fork that changes the core is a different network. A fork that keeps it is part of this one.

## Who holds it

FOODX WORLD LIMITED holds the copyright today. The intent is to hand stewardship of the spec to a neutral body, separate from the company. No date is promised. When it happens, this page will say who, and the licence stays MIT.

## Security and conduct

Report a weakness as [`SECURITY.md`](SECURITY.md) says, not in an issue. Everyone here follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
