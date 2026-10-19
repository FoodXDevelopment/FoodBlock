# FoodBlock

## How to talk to me
Always speak to me like I'm 15. My work is complex and I don't always fully get it, so break things down. Plain language, short sentences, no jargon without a one-line explanation, concrete examples over abstractions. Assume I'm smart but haven't heard the terminology before.

## Mission
Organising and decentralising the world's food to increase economic freedom and social connection.

## History of Food
For most of history, we wandered in small bands, foraging and hunting. Then we learned to cultivate grain. Land was divided. Surplus was traded. It became our first industry. And from there, the wheel, roads, and ships followed. Our food is a thread that runs through our shared history. And the story is still being written by the people of today.

## The Ideas
The physicist David Deutsch observed that the best explanations are the ones hardest to vary. The most powerful systems tend to be the most compressed. Everything we know emerged from a single point — the Big Bang — the entire universe from one set of initial conditions.

The pattern repeats everywhere. DNA uses four bases to encode every living organism. Newton gave us separate laws for motion, gravity, and optics. Einstein unified them into a single framework that explained more with fewer assumptions — time dilation, mass–energy equivalence, gravity bending light, orbital behaviour that previously seemed unrelated — all from one theory. Two points lead to the same apex in a triangle: one underlying explanation which accounts for both.

In products, the best are built from simple primitives. LEGO scales because one brick fits every other — then whole structures and creativity are built on top. The iPhone does the same with a simple system and apps layered on top. Bitcoin is a small set of rules that produces an entire economy. The SpaceX engine gets simpler over the years — fewer wires, fewer pipes. AI compresses information through an extremely simple mechanism: artificial neurons, weighted connections, and backpropagation. Language itself is 26 characters.

As we attempt to solve problems, we find underlying primitives. Compress the primitive, and the creativity of individuals and the forces of natural selection do the rest.

## The Loop
The economy inside FoodX must be circular. Every action a user takes should naturally lead to the next — not as a funnel, but as a closed loop where output becomes input. A producer grows ingredients, a maker turns them into food, a storefront sells it, a foodie eats it, a review feeds back to the producer. Surplus flows to the sustainer, who redistributes it, creating new transactions. A recipe shared by a creator inspires a maker, whose product gets rated, whose rating surfaces the venue, which draws more foodies.

This works between users — but also within a single person. One user discovers a dish, saves the recipe, buys the ingredients, cooks it, shares what they made, gets feedback, discovers something new from that feedback. Their own activity loops back on itself, each action naturally prompting the next. The individual loop and the collective loop are the same structure at different scales.

Nothing is a dead end. Every FoodBlock created generates signal that feeds other FoodBlocks. The system should feel like a living economy — energy circulating, not dissipating. When designing any feature, ask: what does the user do *after* this? If the answer is "leave the app," the loop is broken.

## What this repository is

The FoodBlock protocol, version 1.6, and the code that speaks it. A block is `{ type, state, refs }`, signed by its
author; its identity is the SHA-256 of its canonical form. Seven types (`actor`, `thing`, `observe`, `transform`,
`transfer`, `promise`, `grant`) and seven verbs (`updates`, `answers`, `confirms`, `defeats`, `for`, `derives_from`,
`same_as`); `prev` and `after` are causal metadata. Every place is a `thing`, and so is a schema (kind schema).
Every closed list is in `spec/protocol.json`, which code loads. Three profiles of peer (micro, edge, node); only
people and machines hold nodes, and a business is a circle of them.

`spec/core.md` and `spec/modules/` are normative (`spec/protocol.md` is their index): where anything else disagrees, they govern. The published whitepaper (https://foodx.network/foodblock-whitepaper-v1.6.pdf; its source is kept with FoodX's papers) is the published
v1.6 paper, kept as the paper; where it and the spec differ, the spec is current.

## Principles

- **Compress, don't expand.** Every change should make the system simpler.
- **The SDK decides; everything else asks it.** The server, MCP server and CLI never check a block themselves.
- **Strict.** Year zero: there is no earlier version in the protocol. Write and read only 1.6 shapes. Never change
  signed content: refuse it, and the author re-signs. Old data enters once, through the converter outside the protocol
  (`fb convert`, `sdk/rust` feature `legacy`, `spec/legacy/`); it writes fresh blocks that name the old hash.
- **Append-only.** A stored block is never updated or deleted. A change is a new block that `updates` the old one.
- **The protocol describes itself.** Kinds, fields and roles are schemas (a `thing` of kind schema), not code.
- **Every SDK reproduces the vectors.** `spec/vectors.json` exactly: hashes, signatures, commitments, envelopes.
  If two SDKs disagree, the protocol is broken.
- **Delete before abstracting.** Three similar lines are better than a premature abstraction.
- **Tests are proof.** Nothing exists until it has a test.

## Layout

```
spec/core.md, modules/  the protocol (1.6, normative; protocol.md is the index); profiles/ (optional); protocol.json
                        (every list), canonical.md, transport.md, vectors.json beside it; legacy/ is the one-time converter's data
spec/oracle/            an implementation written from the spec text alone; `node spec/oracle/run.cjs` checks the vectors
spec/schemas/           the base schemas as signed things with stable ids (`schemas.json` is the source, `published.json` the result; `node sdk/javascript/test/make-schemas.cjs`)
sdk/rust/               the one core (every rule, once): crate, C library, WebAssembly, JNI
spec/run-vectors.cjs    the conformance runner
sdk/javascript/         the reference SDK (src/index.cjs is its whole API)
sdk/python, go, swift,  the same protocol in other languages, thin layers over the Rust core (Go runs its WebAssembly in
kotlin                  wazero; Swift links an XCFramework; Kotlin bundles JNI natives); each runs every vector section
server/                 a node: node.js (store + signed pull / push / .well-known), index.js (runs it)
sql/schema.sql          the node's store: append-only, each block kept exactly as it arrived
mcp/                    the MCP door: six tools (find, read, ask, promise, accept, connect); the agent drafts, the person signs
cli/bin/fb.js           fb init | key | create | check | valid | convert | verify
test/vectors.json       cross-language canonical vectors (they hash the same under 1.6)
test/audit/             the audit's worlds as permanent tests: every fold computed by the core and the oracle must be identical (`run.cjs`)
test/sync-spec.cjs      copies spec/protocol.json into the Rust and JavaScript packages (and legacy/aliases-0.x.json into the Rust crate); --check proves they match
```

## Testing

| What you changed | Run |
|---|---|
| Anything in the SDK or hashing | `node spec/run-vectors.cjs` and `cd sdk/javascript && npm test` |
| spec/protocol.json | `node test/sync-spec.cjs`, then every SDK's tests |
| The Rust core | `cd sdk/rust && cargo test`, rebuild WebAssembly (`cd sdk/javascript && node scripts/build-wasm.cjs`; Go embeds the same file: `node tools/version-sync.cjs --write`), rebuild the Python library (`cargo rustc --release --features ffi --crate-type cdylib`), the Swift XCFramework, then every SDK's tests |
| Python / Go / Swift / Kotlin SDK | `cd sdk/python && python3 -m unittest discover -s tests` / `cd sdk/go && CGO_ENABLED=0 go test ./...` / `sdk/swift/scripts/build-xcframework.sh --macos && swift test` (at the root, with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`) / `cd sdk/kotlin && ./gradlew :foodblock:test` |
| The oracle, or any fold | `node spec/oracle/run.cjs` and `node test/audit/run.cjs` (the core and the oracle must give identical folds over every audited world and every vector story) |
| The EPCIS / FSMA 204 profile | `node spec/profiles/epcis/run.cjs` (regenerate: `make-vectors.cjs`) |
| The node | `cd server && npm test` (in-memory Postgres, no setup; `TEST_DATABASE_URL=postgresql://... npm test` for a real one) |
| The MCP server | `cd mcp && npm test` (starts the server and calls its tools over stdio) |
| The CLI | `cd cli && npm test` (makes an identity, writes valid blocks, refuses invalid ones) |

Run only what you changed, plus the vectors if you touched hashing or the canonical form.

## Publishing

Nothing is published, committed or pushed unless Patrick asks in that message. See `DISTRIBUTION.md` for what is
published today and what publishing 1.6 needs.
