# Architecture

How the parts of this repository fit together. The protocol itself is [`spec/protocol.md`](spec/protocol.md)
(FoodBlock 1.6); this page only says where each rule lives in code.

## One rule, one place

```
spec/                    the rules: core.md and modules/ (protocol.md is the index), protocol.json (every list),
  │                      canonical.md, transport.md, profiles/, vectors.json; oracle/ checks the vectors from the text alone
  ├── sdk/rust           the one core: every rule once (Rust), as a crate, a C library, WebAssembly and JNI
  ├── sdk/javascript     the reference API (the core in WebAssembly), checked against spec/vectors.json
  ├── sdk/python, go,    thin layers over the same core, each running every vector section
  │   swift, kotlin
  │
  ├── server/            a node: stores and numbers blocks, answers signed pull and push, .well-known
  ├── mcp/               an AI agent's way in: writes and reads signed blocks over MCP
  └── cli/               a person's or a machine's way in: the same, from a terminal
```

**Every list is data.** Types, verbs, ref keys, fields, terms, grammar, limits, suites and profiles are in
`spec/protocol.json`. Every SDK loads it and copies nothing into code. There is no earlier version in the protocol:
the one-time converter (`sdk/rust` feature `legacy`, `fb convert`) reads `spec/legacy/aliases-0.x.json` and is not
part of it.

**The SDK decides; everything else asks it.** The server, the MCP server and the CLI never check a block
themselves. They write with the SDK's one write path (`write`: compose, check, sign, place in the key's chain), and
take blocks in with its checks (`valid`, `sync.accept`, `identity.signedByAuthor`, `sync.pullRefusals`). So a rule
changes in one place and every part follows.

## Packaging: one source, exact copies

A package installed somewhere else cannot reach `spec/`. So the two packages that hold the core carry an exact copy
of what they load:

| Package | Where the copy lives | How it is loaded |
|---|---|---|
| Rust crate (and so C, Python, Go, Swift, Kotlin) | `sdk/rust/spec/protocol.json`, `aliases-0.x.json` | `include_bytes!` |
| JavaScript | `sdk/javascript/spec/protocol.json` | `require` |

`node test/sync-spec.cjs` makes the copies; `--check` fails if any differs from `spec/`. Each package's own tests check
their copy byte for byte too, so a copy can never drift.

The node, the MCP server and the CLI depend on the SDK as a package (`"@foodxdev/foodblock":
"file:../sdk/javascript"`), so `npm install` in each folder links it. Every version they report is the SDK's
`VERSION`, read from `protocol.json`; their package versions start with it (`1.6.0`), and their tests check that.

## A block's life

1. **Written.** The author's device composes it (`at`, `author`, `seq` and `prev` from their key's chain, what
   they had seen, who may see it), checks it, and signs it: `write` does all four. A private audience is written as
   salted commitments; each recipient's salt travels only to them.
2. **Sent.** A public block travels as `{ version, block, signature }` (`wrap`). A private one travels as a sealed
   copy: its public header `{ author, seq, prev, hash }`, signed, beside an envelope only its audience can open
   (`sealCopy`). Email, a QR code or a link can carry either (`spec/transport.md`).
3. **Taken in.** A node recomputes the hash, never trusting a sent one (`unwrap`). It keeps a block only if it is
   `valid`: a key that still speaks for its author signed it, it passes the checks of core.md, it fits its key's
   chain, and the owner's admission rule lets it in. A block whose previous block is missing waits, then expires.
   Two blocks of one key naming one `prev` are kept and served together, as proof of a lie.
4. **Kept.** Exactly as it arrived, numbered on arrival (`sql/schema.sql`). The node never updates or deletes a block.
5. **Read.** As it was signed. Old data from before 1.6 is converted once into fresh blocks that name the old hash in
   `derives_from`; nothing reads an older shape.

## The node (server/)

`server/node.js` is the whole node: a small store over Postgres and two messages. It belongs to its holder, a person
or a machine, and signs every answer with a device key of theirs, brought in by a key grant (`fb key` makes one).

| Route | Request | Answer |
|---|---|---|
| `POST /pull` | `{ since, limit, filter, heads }`, or a signed pull (adds `signer`, `node`, a `counter` or a `challenge`, `signature`; no time) | `{ node, request, blocks: [{ n, message }], next, signature }` |
| `POST /push` | `{ messages, for }` (signed or not) | `{ node, taken, waiting, refused: [{ hash, code, detail }], equivocations, signature }` |
| `GET /challenge` | | `{ challenge }`: issued once, used once |
| `GET /.well-known/foodblock` | | `{ protocol, version, node, holds, speaks_for, admission, endpoints: { pull, push, challenge } }` |

A pull's filter (`type`, `kind`, `author`, `hash`, `record`, `marks`, `refs`) matches exactly. An unsigned pull gets
public blocks and the public headers of sealed ones; a signed pull also gets the copies sealed to its signer. A
counter must be above the highest the node has seen from that signer; a challenge is answered once.

The owner's admission rule is a block they publish and push to the node, named by `ADMISSION`: an `observe` of kind
admission whose schema declares `parties` (ids always admitted) and `per_stranger` (blocks a day from anyone else).
Blocks still waiting count against it.

The local announcement (`{ protocol, version, node, endpoints }`) is built from the discovery document; any local
transport can carry it. This node prints it on start; it does not run an mDNS responder itself.

## What stays off the chain

Drafts, goals, budgets, rankings and private rules stay on the person's own node (spec §12). Ranking happens only in
the reader's node; a pull returns every match, so nobody can be paid to rank.
