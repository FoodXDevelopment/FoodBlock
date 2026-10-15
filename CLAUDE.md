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

`spec/protocol.md` is normative: where anything else disagrees, it governs. `spec/whitepaper.md` is the published
v1.5 paper, kept as the paper; where it and the spec differ, the spec is current.

## Principles

- **Compress, don't expand.** Every change should make the system simpler.
- **The SDK decides; everything else asks it.** The server, MCP server and CLI never check a block themselves.
- **Strict when writing, generous when reading.** Write only 1.6 shapes. Read every earlier shape through
  `spec/aliases.json` (`readAs`). Never change signed content: refuse it, and the author re-signs.
- **Append-only.** A stored block is never updated or deleted. A change is a new block that `updates` the old one.
- **The protocol describes itself.** Kinds, fields and roles are schemas (a `thing` of kind schema), not code.
- **Every SDK reproduces the vectors.** `spec/vectors.json` exactly: hashes, signatures, commitments, envelopes.
  If two SDKs disagree, the protocol is broken.
- **Delete before abstracting.** Three similar lines are better than a premature abstraction.
- **Tests are proof.** Nothing exists until it has a test.

## Layout

```
spec/protocol.md        the protocol (1.6, normative); protocol.json (every list), canonical.md, transport.md,
                        aliases.json, vectors.json beside it
spec/run-vectors.cjs    the conformance runner
spec/whitepaper.md      the published v1.5 paper (and .pdf)
sdk/javascript/         the reference SDK (src/index.cjs is its whole API)
sdk/python, go, swift   the same protocol in other languages; each runs every vector section, and carries an exact
                        copy of protocol.json and aliases.json
server/                 a node: node.js (store + signed pull / push / .well-known), index.js (runs it)
sql/schema.sql          the node's store: append-only, each block kept exactly as it arrived
mcp/                    the MCP server: eight tools, writes as one identity through the SDK's `write`
cli/bin/fb.js           fb init | key | create | check | read-as | verify
test/vectors.json       older cross-language hash vectors (pre-1.6 type names; they still hash the same)
test/sync-spec.cjs      copies spec/protocol.json and aliases.json into each SDK; --check proves they match
```

## Testing

| What you changed | Run |
|---|---|
| Anything in the SDK or hashing | `node spec/run-vectors.cjs` and `cd sdk/javascript && npm test` |
| spec/protocol.json or aliases.json | `node test/sync-spec.cjs`, then every SDK's tests |
| Python / Go / Swift SDK | `cd sdk/python && python3 -m unittest discover -s tests` / `cd sdk/go && go test ./...` / `cd sdk/swift && swift test` (macOS: CryptoKit) |
| The node | `cd server && npm test` (in-memory Postgres, no setup; `TEST_DATABASE_URL=postgresql://... npm test` for a real one) |
| The MCP server | `cd mcp && npm test` (starts the server and calls its tools over stdio) |
| The CLI | `cd cli && npm test` (makes an identity, writes valid blocks, refuses invalid ones) |

Run only what you changed, plus the vectors if you touched hashing or the canonical form.

## Publishing

Nothing is published, committed or pushed unless Patrick asks in that message. See `DISTRIBUTION.md` for what is
published today and what publishing 1.6 needs.
