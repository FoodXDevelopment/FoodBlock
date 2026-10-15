# FoodBlock

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

This is an offer: it is signed by its `from` side. Its id is the SHA-256 hash of its canonical form (one exact way
of writing it as text). The author signs the same bytes with Ed25519. Nobody's clock decides who has authority. The
other side can check that authority. Nothing can be lost or forged without it showing.

- **The spec:** [`spec/protocol.md`](spec/protocol.md), FoodBlock 1.6. It is normative: where anything else here
  disagrees, it governs. Beside it: [`protocol.json`](spec/protocol.json) (every list, for code to load), the
  [canonical form](spec/canonical.md), [transport](spec/transport.md) (email is the envelope, FoodBlock the
  letter), the [alias table](spec/aliases.json) and the [conformance vectors](spec/vectors.json).
- **The paper:** [`spec/whitepaper.md`](spec/whitepaper.md) ([PDF](spec/whitepaper.pdf)), the published v1.5
  whitepaper: why the protocol exists. Where it and the spec differ, the spec is current.

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

**Strict when writing, generous when reading.** A node writes only 1.6 shapes: no floats (money is
`{ minor, currency }`, an amount `{ value, unit }` with a decimal string), exact UTC times, every block in its
key's chain (`state.seq`, `refs.prev`). It reads every earlier shape through one alias table: an old `place` or
`substance` reads as a `thing`, `seller` and `buyer` as `from` and `to`. Reading never changes a block or its hash.

## Three sizes of peer

Every peer speaks the protocol itself: a phone, a robot kitchen, a delivery van, a drone, a smart fridge, a
sensor. Machines are peers like people. Any food machine can take an SDK, make its own identity, and act within the
grants it holds. Each peer runs one of three profiles (spec §13, `protocol.json` `profiles`):

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
| [`spec/`](spec/) | The protocol, its lists, the canonical form, transport, aliases, vectors and the paper |
| [`sdk/javascript`](sdk/javascript/) | The reference SDK |
| [`sdk/python`](sdk/python/), [`sdk/go`](sdk/go/), [`sdk/swift`](sdk/swift/) | The same protocol in other languages; each runs every vector section |
| [`server/`](server/) | A node: Postgres for the blocks, HTTP for signed pull, push and `.well-known/foodblock` |
| [`mcp/`](mcp/) | An MCP server, so any AI agent can write and read signed blocks |
| [`cli/`](cli/) | `fb`: make an identity and device keys, write blocks in its key chain, check, read and verify |
| [`sql/schema.sql`](sql/schema.sql) | The node's store: append-only, each block kept exactly as it arrived |
| [`test/`](test/) | Older cross-language hash vectors, and the script that copies the spec into each SDK |

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

// Who you are: a genesis naming your signing, encryption and (offline) recovery keys. Its hash is your id.
const keys = fb.generateKeypair()
const me = fb.identity.genesis(keys, {
  encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt,
  recoveryKey: fb.generateKeypair().public_key_sign
})

// The one write path: compose, check, sign, and place it in your key's chain.
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, held: [me] })

fb.wrap(eggs)        // { version: '1.6', block, signature }, as it travels between peers
fb.readAs(oldBlock)  // any earlier shape, read as 1.6
```

From a terminal:

```bash
cd cli && npm install
node bin/fb.js init me.json
node bin/fb.js create thing eggs --state '{"name":"Free-range eggs"}' --identity me.json
```

## Between nodes

Anyone can leave a node with everything they signed. Peers swap blocks with two messages (spec §10):

- **Pull** `{ since, limit, filter, heads }`: every match since an arrival number, oldest first, never ranked.
  `heads: true` gives only the latest blocks. A signed pull also proves who is asking, so it gets the copies sealed
  to them.
- **Push** `{ messages, for }`: the node keeps what its authors signed and what the owner's admission rule lets in.
  A block whose previous block is missing waits. Two blocks from one key with one `seq` prove a lie.
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
| Go SDK | `cd sdk/go && go test ./...` |
| Swift SDK | `cd sdk/swift && swift test` |
| Node | `cd server && npm test` (in-memory Postgres; set `TEST_DATABASE_URL` for a real one) |
| MCP server | `cd mcp && npm test` |
| CLI | `cd cli && npm test` |

## Licence

MIT

To cite FoodBlock, see [`CITATION.cff`](CITATION.cff).
