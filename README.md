# FoodBlock

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15657/badge)](https://www.bestpractices.dev/projects/15657)
[![IETF Internet-Draft](https://img.shields.io/badge/IETF-draft--reynolds--foodblock--core-blue)](https://datatracker.ietf.org/doc/draft-reynolds-foodblock-core/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23457910.svg)](https://doi.org/10.5281/zenodo.23457910)
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
it as text: RFC 8785). The author signs the same bytes with Ed25519 (the suite `std`; `p256` and `sm` are two more). Nobody's clock decides who has authority. The
other side can check that authority. Without the author's key no one can make a block that counts as theirs, or change one without
changing its id, and a key that signs two versions of its history leaves the proof. What the protocol cannot do (keep a lost key safe,
stop a custodian who holds your key, see inside a sealed block it was not sent) is in the [threat model](spec/THREAT-MODEL.md) (a draft).

- **The spec:** [`spec/protocol.md`](spec/protocol.md), FoodBlock 1.7 (2026-10-27; it adds to 1.6, except the few deletions the CHANGELOG lists). It is normative: where anything else here
  disagrees, it governs. Beside it: [`protocol.json`](spec/protocol.json) (every list, for code to load), the
  [canonical form](spec/canonical.md), [transport](spec/transport.md) (email is the envelope, FoodBlock the
  letter) and the [conformance vectors](spec/vectors.json). There is no earlier version in the protocol: 1.6 is
  year zero. Old data enters once, through [a converter](spec/legacy/converter.md) that is not part of the protocol.
  [`NECESSITY.md`](spec/NECESSITY.md) shows, for every field, term, verb, closed type, reference key and invariant,
  which vectors fail without it; [`EXPERIMENTS.md`](spec/EXPERIMENTS.md) records the compressions tried.
- **The paper:** [the FoodBlock whitepaper v1.6 (PDF)](https://foodx.network/foodblock-whitepaper-v1.6.pdf) (DOI [10.5281/zenodo.23457910](https://doi.org/10.5281/zenodo.23457910)): why the
  protocol exists. Where it and the spec differ, the spec is current.

## The language

**Seven types**, in three moods:

| | Type | Meaning |
|---|---|---|
| What exists | `actor` | A person, an autonomous system or machine, a circle, or a contact |
| | `thing` | Anything held, found or written: food, tools, places, recipes, shares, schemas |
| Is | `observe` | A claim that something is so |
| | `transform` | A thing changes: inputs become outputs, or a thing is kept and stays itself |
| | `transfer` | A thing changes owner, holder or place |
| Must | `promise` | A commitment, offered or asked |
| May | `grant` | Authority given to someone |

**Seven verbs**, the refs that link blocks: `updates`, `answers` (the only way to consent), `confirms`, `defeats`,
`for`, `derives_from`, `same_as`. `prev` and `after` say what came before.

**Strict.** Only four types carry authority and are closed (`actor`, `promise`, `transfer`, `grant`); any other word
is an open type that a node stores and passes on. A node writes and reads only the current version's shapes: no nulls, no floats
(money is `{ minor, currency }`, an amount `{ value, unit }` with a decimal string), exact UTC times, sets written
sorted, every block in its key's chain (`state.seq`, `refs.prev`). It never repairs a block: it refuses it, and the
author signs a new one.

## Three sizes of peer

Every peer speaks the protocol itself: a phone, a robot kitchen, a van, a sensor. Machines are peers like people. There are three sizes (`protocol.json` `peers`, and `spec/protocol.md`): **micro** (a device that measures and signs), **edge** (the local operator, works offline) and **node** (the lasting level, serves pull and push to anyone). Only people and machines hold nodes. A business, a household or a community is a **circle** of them, never a node of its own.

## What is here

| Folder | What it is |
|---|---|
| [`spec/`](spec/) | The protocol, its lists, the canonical form, transport, profiles, vectors, the oracle and the paper |
| [`sdk/javascript`](sdk/javascript/) | The reference SDK |
| [`sdk/rust`](sdk/rust/) | The one core: every rule, as a Rust crate, a C library and WebAssembly |
| [`sdk/python`](sdk/python/), [`sdk/go`](sdk/go/), [`sdk/swift`](sdk/swift/), [`sdk/kotlin`](sdk/kotlin/) | The same protocol in other languages, thin layers over the core; each runs every vector section |
| [`server/`](server/) | A node: Postgres for the blocks, HTTP for signed pull, push and `.well-known/foodblock` |
| [`mcp/`](mcp/) | An MCP server, so any autonomous system can write and read signed blocks |
| [`cli/`](cli/) | `fb`: make an identity and device keys, write blocks in its key chain, check, validate, verify, and convert old data once |
| [`sql/schema.sql`](sql/schema.sql) | The node's store: append-only, each block kept exactly as it arrived |
| [`test/`](test/) | Cross-language canonical vectors, and the script that copies the spec into each SDK |

Each SDK's README says which profile it covers.

## For autonomous systems

FoodBlock is built for people, autonomous systems and machines to use together. An autonomous system can read and write it directly:

- **MCP server**: [`mcp/`](mcp/), for Claude, Cursor, Windsurf, Gemini CLI and any MCP-compatible autonomous system
- **The spec in one file**: [`spec/protocol.md`](spec/protocol.md), with every list machine-readable in
  [`spec/protocol.json`](spec/protocol.json)
- **LLM quick reference**: https://foodx.network/llms.txt
- **About FoodX**: https://foodx.network

## Quick start

```js
const fb = require('@foodxdev/foodblock') // in this repository: require('./sdk/javascript/src/index.cjs')
const keys = fb.generateKeypair()                  // one key is the whole ceremony
const me = fb.identity.genesis(keys, { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public' })  // who you are: its hash is your id; kind, at and audience are yours to state
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, held: [me], at: '2026-10-15T09:01:00.000Z', audience: 'public' })
fb.valid(eggs, [me])                               // [] : sound, signed by a key of its author, in its chain
```

From a terminal:

```bash
cd cli && npm install
node bin/fb.js init me.json --kind person --audience public --reach P30D
node bin/fb.js create thing eggs --state '{"name":"Free-range eggs"}' --identity me.json
```

## Between nodes

Anyone can leave a node with everything they signed. Peers swap blocks with two messages, **pull** and **push**, and every answer is signed by a key of the node's holder (`spec/modules/nodes.md`). `.well-known/foodblock` says who the node is, what it holds and its admission rule.

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
| Every fold, core against oracle | `node test/audit/run.cjs` |
| No listed thing is dead or untested | `node test/necessity.cjs` (the full measurement, ten minutes: `node tools/necessity.cjs`) |
| Stored blocks against the current core | `node tools/replay-check.cjs <export>` (counts and reason codes only; see `DISTRIBUTION.md`) |
| Node | `cd server && npm test` (in-memory Postgres; set `TEST_DATABASE_URL` for a real one) |
| MCP server | `cd mcp && npm test` |
| CLI | `cd cli && npm test` |

## Licence

Public domain (CC0 1.0; decided 2026-10-29, replacing MIT). FOODX WORLD LIMITED (England and Wales, company 16406719), which
wrote it and runs this repository, waived its copyright: the protocol needs no one's permission to implement, copy or change.

How a change is proposed and how versions work: [`GOVERNANCE.md`](GOVERNANCE.md). How we treat each other, and what content is not allowed: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Reporting a
weakness: [`SECURITY.md`](SECURITY.md).

To cite FoodBlock, see [`CITATION.cff`](CITATION.cff).
