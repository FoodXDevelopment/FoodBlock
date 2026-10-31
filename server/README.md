# foodblock-node

A FoodBlock node: Postgres holds the blocks, HTTP carries signed pull, push and `.well-known/foodblock`.

From this repository (the node is not published as a package, so never install a package of this name from a registry):

```
cd server && npm ci --ignore-scripts
NODE_KEY=node.json DATABASE_URL=postgresql://localhost:5432/foodblock \
  STRANGERS_PER_DAY=2000 PER_STRANGER=20 ADMISSION=none PULL_CAP=500 SERVES_PAIRS=true TAKES_PAIRS=false \
  WAITING_PER_AUTHOR=100 COPY_RECIPIENTS=20 COPY_BYTES=4194304 node index.js
```

Or its container: `docker build -f server/Dockerfile .` from the repository root.

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

`NODE_KEY` is a file made by `fb key` (the holder, the key that signs this node's answers, and the blocks that prove it).
`PORT` defaults to 3111. The node never checks a block itself: the SDK does
([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)). Public domain (CC0 1.0).
