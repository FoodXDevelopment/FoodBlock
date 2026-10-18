# FoodBlock

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/FoodXDevelopment/FoodBlock/badge)](https://scorecard.dev/viewer/?uri=github.com/FoodXDevelopment/FoodBlock)

The smallest language strangers in food need to agree on, with no boss. Everything else is data.

A block is three fields, signed by its author on their own device:

```json
{
  "type": "promise",
  "state": {
    "terms": { "price": { "minor": 450, "currency": "GBP" }, "quantity": { "value": "30", "unit": "{egg}" } },
    "at": "2026-10-15T09:00:00.000Z",
    "audience": "public",
    "seq": 4
  },
  "refs": { "author": "a1b2…", "prev": "c3d4…", "from": "a1b2…", "what": "e5f6…" }
}
```

This is an offer: it is signed by its `from` side. Its id is the hash of its canonical form (one exact way of writing
it as text: RFC 8785). The author signs the same bytes with Ed25519 (the default suite; `p256` and `sm` are two more). Nobody's clock decides who has authority. The
other side can check that authority. Nothing can be lost or forged without it showing.

- **The spec:** [`spec/protocol.md`](spec/protocol.md), FoodBlock 1.6. It is normative: where anything else here
  disagrees, it governs. Beside it: [`protocol.json`](spec/protocol.json) (every list, for code to load), the
  [canonical form](spec/canonical.md), [transport](spec/transport.md) (email is the envelope, FoodBlock the
  letter) and the [conformance vectors](spec/vectors.json). There is no earlier version in the protocol: 1.6 is
  year zero. Old data enters once, through [a converter](spec/legacy/converter.md) that is not part of the protocol.
- **The paper:** [the FoodBlock whitepaper v1.6 (PDF)](https://foodx.network/foodblock-whitepaper-v1.6.pdf) (DOI [10.5281/zenodo.23457910](https://doi.org/10.5281/zenodo.23457910)): why the
  protocol exists. Where it and the spec differ, the spec is current.

## The language

**Seven types**, in three moods:

| | Type | Meaning |
|---|---|---|
| What exists | `actor` | A person, an agent or machine, a circle, or a contact |
| | `thing` | Anything held, found or written: food, tools, places, recipes, shares, schemas |
| Is | `observe` | A claim that something is so |
| | `transform` | A thing changes: inputs become outputs, or a thing is kept and stays itself |
| | `transfer` | A thing changes owner, holder or place |
| Must | `promise` | A commitment, offered or asked |
| May | `grant` | Authority given to someone |

**Seven verbs**, the refs that link blocks: `updates`, `answers` (the only way to consent), `confirms`, `defeats`,
`for`, `derives_from`, `same_as`. `prev` and `after` say what came before.

**Strict.** Only four types carry authority and are closed (`actor`, `promise`, `transfer`, `grant`); any other word
is an open type that a node stores and passes on. A node writes and reads only 1.6 shapes: no nulls, no floats
(money is `{ minor, currency }`, an amount `{ value, unit }` with a decimal string), exact UTC times, sets written
sorted, every block in its key's chain (`state.seq`, `refs.prev`). It never repairs a block: it refuses it, and the
author signs a new one.

## Three sizes of peer

Every peer speaks the protocol itself: a phone, a robot kitchen, a delivery van, a drone, a smart fridge, a
sensor. Machines are peers like people. Any food machine can take an SDK, make its own identity, and act within the
grants it holds. Each peer is one of three sizes (`protocol.json` `peers`):

- **Micro**, a device: a soil or fridge sensor, a scale, an oven, a robot's body. It needs the canonical form,
  SHA-256, Ed25519, the write check, its own chain, and the vectors for these. One that acts in the world also
  checks its grants and stops the moment a stop arrives.
- **Edge**, the local operator: the computer at a farm, in a kitchen, in a van or a shop. It adds local discovery,
  pull and push with the peers near it, the promise fold for its own deals, and it keeps working offline.
- **Node**, the lasting level: adds sealed envelopes and commitments, serving pull and push to anyone, signed
  answers, internet discovery, and the folds for every record it holds.

Only people and machines hold nodes. A business, a household or a community is a **circle** of them: it has an id
and a record, kept by its members' nodes, never a node of its own.

## What is here

| Folder | What it is |
|---|---|
| [`spec/`](spec/) | The protocol, its lists, the canonical form, transport, profiles, vectors, the oracle and the paper |
| [`sdk/javascript`](sdk/javascript/) | The reference SDK |
| [`sdk/rust`](sdk/rust/) | The one core: every rule, as a Rust crate, a C library and WebAssembly |
| [`sdk/python`](sdk/python/), [`sdk/go`](sdk/go/), [`sdk/swift`](sdk/swift/), [`sdk/kotlin`](sdk/kotlin/) | The same protocol in other languages, thin layers over the core; each runs every vector section |
| [`server/`](server/) | A node: Postgres for the blocks, HTTP for signed pull, push and `.well-known/foodblock` |
| [`mcp/`](mcp/) | An MCP server, so any AI agent can write and read signed blocks |
| [`cli/`](cli/) | `fb`: make an identity and device keys, write blocks in its key chain, check, validate, verify, and convert old data once |
| [`sql/schema.sql`](sql/schema.sql) | The node's store: append-only, each block kept exactly as it arrived |
| [`test/`](test/) | Cross-language canonical vectors, and the script that copies the spec into each SDK |

Each SDK's README says which profile it covers.

## For AI agents

FoodBlock is built for people, agents and machines to use together. An agent can read and write it directly:

- **MCP server**: [`mcp/`](mcp/), for Claude, Cursor, Windsurf, Gemini CLI and any MCP-compatible agent
- **The spec in one file**: [`spec/protocol.md`](spec/protocol.md), with every list machine-readable in
  [`spec/protocol.json`](spec/protocol.json)
- **LLM quick reference**: https://foodx.network/llms.txt
- **About FoodX**: https://foodx.network

## Quick start

```js
const fb = require('@foodxdev/foodblock') // in this repository: require('./sdk/javascript/src/index.cjs')
const keys = fb.generateKeypair()                  // one key is the whole ceremony
const me = fb.identity.genesis(keys)               // who you are: its hash is your id
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, held: [me] })
fb.valid(eggs, [me])                               // [] : sound, signed by a key of its author, in its chain
```

From a terminal:

```bash
cd cli && npm install
node bin/fb.js init me.json
node bin/fb.js create thing eggs --state '{"name":"Free-range eggs"}' --identity me.json
```

## Between nodes

Anyone can leave a node with everything they signed. Peers swap blocks with two messages (`spec/modules/nodes.md`):

- **Pull** `{ since, limit, filter, heads }`: every match since an arrival number, oldest first, never ranked.
  `heads: true` gives only the latest blocks. A signed pull also proves who is asking, so it gets the copies sealed
  to them.
- **Push** `{ messages, for }`: the node keeps what its authors signed and what the owner's admission rule lets in.
  A block whose previous block is missing waits. Two blocks of one key naming one `prev` prove a lie.
- A signed request carries a `counter` or a `challenge` (`GET /challenge`) and no time.
- Every answer is signed by a key of the node's holder (a person or a machine).
- **Discovery:** `.well-known/foodblock` says who the node is, what it holds, who it speaks for and its admission
  rule. On a local network it can be announced in a shorter form.

Run one with `docker compose -f server/docker-compose.yml up`, or `cd server && npm install && npm start` with a
Postgres at `DATABASE_URL` and a key file from `fb key` at `NODE_KEY`.

## Tests

| What | Command |
|---|---|
| Conformance vectors | `node spec/run-vectors.cjs` |
| The SDKs carry the spec exactly | `node test/sync-spec.cjs --check` |
| JS SDK | `cd sdk/javascript && npm test` |
| Python SDK | `cd sdk/python && python3 -m unittest discover -s tests` |
| Go SDK | `cd sdk/go && CGO_ENABLED=0 go test ./...` |
| Swift SDK | `sdk/swift/scripts/build-xcframework.sh --macos && swift test` (at the root) |
| Rust core | `cd sdk/rust && cargo test` |
| Kotlin SDK | `cd sdk/kotlin && ./gradlew :foodblock:test` (needs a JDK 17); the bundled-library check: `scripts/build-natives.sh jvm && ./gradlew :foodblock:testBundled` |
| The oracle (written from the spec text alone) | `node spec/oracle/run.cjs` |
| Node | `cd server && npm test` (in-memory Postgres; set `TEST_DATABASE_URL` for a real one) |
| MCP server | `cd mcp && npm test` |
| CLI | `cd cli && npm test` |

## Licence

MIT. Copyright FOODX WORLD LIMITED (England and Wales, company 16406719), which owns this repository. The protocol
needs no one's permission to implement.

How we treat each other, and what content is not allowed: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Reporting a
weakness: [`SECURITY.md`](SECURITY.md).

To cite FoodBlock, see [`CITATION.cff`](CITATION.cff).
