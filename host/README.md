# FoodBlock host

One host with two stores. Both keep signed blocks append-only, answer signed pull and push, check every signature with the SDK and hold no key of anyone they keep blocks for.

| Store | Folder | Keeps blocks in | Tests |
|---|---|---|---|
| plain files | `src/files/` | two append-only files (`blocks.jsonl`, `copies.jsonl`) | `npm run test:files` |
| Postgres | `src/postgres/` (`schema.sql` is its one schema) | the `blocks` table | `npm run test:postgres` (in-memory Postgres, or a real one with `TEST_DATABASE_URL`) |

`npm test` runs both. The act library is not here: it lives in [`../acts`](../acts).

### Files store: the reference node

A small host for someone's FoodBlocks. It stores the blocks she signed, serves them back, checks every signature, lets her take her whole record out as plain FoodBlocks and load it into any other host, and syncs with another host. **It holds no key of hers.** Its only key is its own.

Anyone may run it. That is the point: leaving a host always has somewhere to go, so exit is real from day one. FoodX's own product is built on top of this kind of host; none of FoodX's code is here.

It has no dependencies beyond Node (24 or newer) and the FoodBlock SDK in this repo (`../sdk/javascript`). All signing, hashing and checking is the SDK's. Set `FOODBLOCK_SDK=/path/to/src/index.cjs` to use another copy.

## Run it

```
cd host
node src/files/cli.mjs init --dir ./data --cap 500 --serves-pairs true --takes-pairs false \
  --per-stranger 100 --strangers-per-day 1000 --admission none --copy-recipients 20 --copy-bytes 1000000
node src/files/cli.mjs serve --dir ./data --port 8787
```

`init` makes the host's own key and writes its promise (below). You state the promise; nothing is filled in for you. It prints an owner token once; keep it (it is also in `data/host.json`, readable only by you).

To keep blocks only for some people, add `--allow <id>,<id>` (their genesis ids); they are the owner's own, not counted as strangers. Without it the host keeps any valid block from anyone, up to your numbers. The numbers above are examples: the host refuses to start until you state each (the same ones the Postgres node asks, but `waitingPerAuthor`: this host keeps nothing waiting), and both stores read them through one file, `src/rules.js`.

The server listens on `127.0.0.1` unless you pass `--bind`. Put it behind your own TLS (a reverse proxy) to serve the open internet.

## What it does

| | |
|---|---|
| `POST /push` `{ messages }` | takes blocks. Each is judged by the SDK: its hash is its content, its signature opens with a live key of its author, it sits in its author's chain, a second block in the same place is a fork and is not taken. Anything else is refused with a reason. |
| `POST /pull` `{ since, limit, filter, heads }` | answers from the arrival log, signed by the host's key. |
| `GET /export[?author=<id>]` | her record as `{ format, messages }`: plain FoodBlocks in arrival order, exactly as signed. Repeat `author` for her AI's and devices' ids. |
| `POST /import` `{ messages }` | the same check as push, but all or nothing: one bad block and nothing is written. |
| `POST /sync` `{ peer }` | owner only (`Authorization: Bearer <token>`): takes what the other host has, then gives what it lacks. |
| `POST /wake` `{ for }` | a notice that something waits for her node (`nodes.md`, A host). Accepted only for an id the host keeps blocks for; it is no block and no word. The host writes it to `wakes.jsonl` and calls `onWake` if the owner gave one; `takeWakes()` returns the ids woken since the last call. |
| `GET /.well-known/foodblock` | who the host is, the rule sets it reads, its promise (`promise.block` is the signed `host_promise`). |

From the command line: `export [--author id] [--out file]`, `import --file file`, `sync --peer http://other:8787`.

Moving house is: `export` from the old host, `import` into the new one. The blocks are the same bytes, so the chain is the same chain.

## The host's promise

Written at `init`, signed by the host's own key as an `observe` of kind `host_promise` (spec: `../spec/modules/nodes.md`, A host), published at `/.well-known/foodblock` under `promise.block`. It binds this host alone; a host made before this signs it once on first open.

Her address is blocks she signs (an `observe` of kind `address` with `routes`, replaced by `updates`); the host keeps and serves them like any block, and `host.addressOf(id)` reads the head of her chain with a pull that filters on `author` and `kind` with `heads`.

- It keeps public blocks whole and sealed blocks as header plus unopened envelopes, **append-only**. A block is added once, by its hash. There is no update, no delete, no rewrite; a block already held is left exactly as it is, and the file only ever grows.
- It refuses a block with a bad signature, a changed body, or a key that is not its author's, and says why. It never repairs a block.
- It takes nothing from a signer it cannot check; a block that needs one it does not hold is listed as waiting and not stored.
- `per-stranger`, `strangers-per-day`, `admission`: blocks a day from each stranger, from all strangers together, and the hash of your admission block (or `none`). `copy-recipients`, `copy-bytes`: the most recipients one sealed block may be copied to, and the most bytes of copies one push adds. A push over any of them is refused whole. Your own act (`import`, `sync`, an import with the owner token) is not a stranger's.
- `cap`: the most blocks one pull answer carries. `serves-pairs`: whether the other half of a forked pair goes with an answer that includes one. `takes-pairs`: whether both blocks of a pair arriving together are taken.
- It signs nothing for anyone. Its key signs only its own pull answers and its own promise.
- Everything it keeps is plain: `data/blocks.jsonl`, one signed block per line (with the time it arrived). Read it with anything. If a crash leaves half a last line, the host sets it aside in `blocks.jsonl.torn`, says so on start, and goes on.

## Private (sealed) blocks

A sealed block is encrypted to the people it is for. The host checks its public header (author's signature, place in her chain, no rival) and keeps the header; it never opens the body and holds no key that could.

- The envelope is kept only when the block's own author pushes it in a **signed push** (`signPush` in the SDK, `for` naming each recipient). An unsigned push keeps the header and drops the envelope.
- A **signed pull** (`signPull`) gets the envelopes sealed to the signer, and nobody else's. An unsigned pull, or a signer it is not sealed to, gets the header only. The host checks the signer against the keys it holds for them, so it must hold their (public) genesis.
- `POST /export` with a signed pull as the body returns her record plus the unopened envelopes: the ones sealed to the signer and every one of blocks the signer authored. `GET /export` is public blocks and sealed headers only.
- `POST /import` takes that document, all or nothing. Loading envelopes needs the new host's owner token. On the command line, `export` includes every envelope and `import` loads them.
- `/sync` between hosts moves public blocks and sealed headers. Envelopes move by her export/import, or by her own signed push.

## What it does not do (yet)


- No challenges (signed requests use counters only), no admission quotas for strangers (the larger server in `../foodblock/server` has them, on Postgres).
- Waiting blocks are not kept between pushes: send a block after the ones it needs (export order always is).
- It does not run her node. A wake only tells whoever runs it that something waits; what the node does when woken is not the host's business.

## Test

```
npm test
```

### Postgres store: foodblock-node

A FoodBlock node: Postgres holds the blocks, HTTP carries signed pull, push and `.well-known/foodblock`.

From this repository (the node is not published as a package, so never install a package of this name from a registry):

```
cd host && npm ci --ignore-scripts
NODE_IDENTITY=node-identity.json SPEAKS_FOR=<id>,<id> DATABASE_URL=postgresql://localhost:5432/foodblock \
  STRANGERS_PER_DAY=2000 PER_STRANGER=20 ADMISSION=none PULL_CAP=500 SERVES_PAIRS=true TAKES_PAIRS=false \
  WAITING_PER_AUTHOR=100 COPY_RECIPIENTS=20 COPY_BYTES=4194304 node src/postgres/index.js
```

Or its container: `docker build -f host/Dockerfile .` from the repository root.

The node refuses to start until its owner states nine choices. It fills in none, and the error names the missing one:

| Variable | What it is |
|---|---|
| `STRANGERS_PER_DAY` | the most blocks one day may bring from all strangers together, whoever they are (a whole number; `0` refuses strangers). A million free keys share it, not a million allowances. Published at `/.well-known/foodblock-admission` as this node's own word (`software_chose`); no default |
| `PER_STRANGER` | blocks a day from each stranger where the owner's admission rule names no number (a whole number; `0` refuses strangers). Published at `/.well-known/foodblock-admission` as this node's own word, never the owner's rule |
| `ADMISSION` | the hash of the owner's admission block, or `none` for no rule |
| `PULL_CAP` | the most blocks one pull answer carries (a whole number, 1 or more) |
| `SERVES_PAIRS` | `true` or `false`: whether the other half of a forked pair goes with a pull that includes one |
| `TAKES_PAIRS` | `true` or `false`: whether both blocks of a pair arriving together are taken (`false`: both are kept as proof, neither is taken) |
| `WAITING_PER_AUTHOR` | how many blocks may wait for one author (a whole number; `0` keeps none) |
| `COPY_RECIPIENTS` | the most recipients one sealed block may be copied to (a whole number; `0` keeps no copies) |
| `COPY_BYTES` | the most bytes of sealed copies one push may add (a whole number; `0` keeps none) |

Used as a library, `createNode({ ..., perStranger, strangersPerDay, admission, cap, servesPairs, takesPairs, waitingPerAuthor, copyRecipients, copyBytes })` requires all nine (`admission` is a hash or `null`).
A message is `{ block, signature }` (no `version`).

`NODE_IDENTITY` is the node's own machine identity (its genesis and its own key), made on first start and kept private (0600). It signs this node's answers and nothing else: the node holds no key of anyone it keeps blocks for, and never takes one. `SPEAKS_FOR` is required: the ids the node keeps blocks for, comma separated.
`PORT` defaults to 3111. The node never checks a block itself: the SDK does
([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)). Public domain (CC0 1.0).
