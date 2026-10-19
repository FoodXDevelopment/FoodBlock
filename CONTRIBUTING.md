# Contributing

FoodBlock is open to everyone. Here is how to get it, tell us something, and change it.

## Get it

Clone this repository. The spec is in [`spec/`](spec/) (start at [`spec/protocol.md`](spec/protocol.md)); each SDK's README says how to install and use it. What is published on npm and PyPI today is listed in [`DISTRIBUTION.md`](DISTRIBUTION.md).

## Tell us something

- **A bug or an idea:** open an issue at https://github.com/FoodXDevelopment/FoodBlock/issues. Say what you did, what you expected, and what happened. A failing block or vector is the best report.
- **A security weakness:** do not open an issue. Follow [`SECURITY.md`](SECURITY.md).
- **Conduct:** everyone here follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Change it

Changes come as pull requests on GitHub. How a change is proposed and how versions work is in [`GOVERNANCE.md`](GOVERNANCE.md).

1. Fork the repository and make a branch.
2. Make one change. Keep it small; every change should make the system simpler.
3. Add or change a test that proves it. Nothing exists until it has a test. A change to hashing, signing or the canonical form also updates `spec/vectors.json`, and every SDK must reproduce it.
4. Run the tests for what you changed (the table under "Tests" in [`README.md`](README.md)). Automated tests run on every pull request.
5. Open the pull request and say what it changes and why.

## What a change must meet

- **The spec governs.** `spec/core.md` and `spec/modules/` are normative. A code change that disagrees with them is a bug in one or the other: change the spec first, in the same pull request.
- **One rule, stated once.** A rule lives in one place. Closed lists live in `spec/protocol.json`, which code loads.
- **The SDK decides.** The server, MCP server and CLI ask the SDK to check a block; they never check it themselves.
- **Strict.** Write and read only 1.6 shapes. Never repair a block: refuse it.
- **Plain writing.** Short sentences, simple words, no jargon without a one-line explanation.

By contributing you agree that your contribution is released under the MIT License.
