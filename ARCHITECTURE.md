# Architecture

How the parts of this repository fit together. The protocol itself is [`spec/protocol.md`](spec/protocol.md)
(FoodBlock 1.6); this page only says where each rule lives in code.

## One rule, one place

```
spec/                    the rules: protocol.md, protocol.json (every list), canonical.md, transport.md,
  │                      aliases.json, vectors.json
  ├── sdk/javascript     the reference: every rule as code, checked against spec/vectors.json
  ├── sdk/python, go,    the same rules in other languages, each running every vector section
  │   swift
  │
  ├── server/            a node: stores and numbers blocks, answers signed pull and push, .well-known
  ├── mcp/               an AI agent's way in: writes and reads signed blocks over MCP
  └── cli/               a person's or a machine's way in: the same, from a terminal
```

**Every list is data.** Types, verbs, ref keys, fields, terms, grammar, limits and profiles are in
`spec/protocol.json`; older shapes are in `spec/aliases.json`. Every SDK loads both files and copies nothing into
code.

**The SDK decides; everything else asks it.** The server, the MCP server and the CLI never check a block
themselves. They write with the SDK's one write path (`write`: compose, check, sign, place in the key's chain), and
take blocks in with its checks (`sync.accept`, `identity.signedByAuthor`, `sync.pullErrors`, `readAs`). So a rule
changes in one place and every part follows.

## Packaging: one source, exact copies

A package installed somewhere else cannot reach `spec/`. So each SDK package carries an exact copy of the two files
it loads, `protocol.json` and `aliases.json`:

| SDK | Where the copy lives | How it is loaded |
|---|---|---|
| Python | `sdk/python/foodblock/spec/` | package data |
| Go | `sdk/go/spec/` | `go:embed` |
| Swift | `sdk/swift/Sources/spec/` | a SwiftPM resource |
| JavaScript | `sdk/javascript/spec/` once that folder exists | (today it reads `../../../spec/` directly) |

`node test/sync-spec.cjs` makes the copies; `--check` fails if any differs from `spec/`. Each SDK's own tests check
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
3. **Taken in.** A node recomputes the hash, never trusting a sent one (`unwrap`). It keeps a block only if a key
   that still speaks for its author signed it, it passes the write check, it fits its key's chain, and the owner's
   admission rule lets it in. A block whose previous block is missing waits, then expires. Two blocks from one key
   with one `seq` are kept and served together, as proof of a lie.
4. **Kept.** Exactly as it arrived, numbered on arrival (`sql/schema.sql`). The node never updates or deletes a block.
5. **Read.** Through `readAs`, so a block from any earlier version reads as 1.6 without changing it.

## The node (server/)

`server/node.js` is the whole node: a small store over Postgres and two messages. It belongs to its holder, a person
or a machine, and signs every answer with a device key of theirs, brought in by a key grant (`fb key` makes one).

| Route | Request | Answer |
|---|---|---|
| `POST /pull` | `{ since, limit, filter, heads }`, or a signed pull (adds `signer`, `node`, `nonce`, `at`, `signature`) | `{ node, request, blocks: [{ n, message }], next, signature }` |
| `POST /push` | `{ messages, for }` | `{ node, taken, waiting, refused: [{ hash, reason }], signature }` |
| `GET /.well-known/foodblock` | | `{ protocol, version, node, holds, speaks_for, admission, endpoints: { pull, push } }` |

A pull's filter (`type`, `kind`, `author`, `hash`, `record`, `refs`) is read on each block's 1.6 reading, so a filter
for `thing` also finds an old `place`. An unsigned pull gets public blocks and the public headers of sealed ones; a
signed pull also gets the copies sealed to its signer. A nonce is answered once.

The owner's admission rule is a block they publish and push to the node, named by `ADMISSION`: an `observe` of kind
admission whose schema declares `parties` (ids always admitted) and `per_stranger` (blocks a day from anyone else).
Blocks still waiting count against it.

The local announcement (`{ protocol, version, node, endpoints }`) is built from the discovery document; any local
transport can carry it. This node prints it on start; it does not run an mDNS responder itself.

## What stays off the chain

Drafts, goals, budgets, rankings and private rules stay on the person's own node (spec §12). Ranking happens only in
the reader's node; a pull returns every match, so nobody can be paid to rank.
