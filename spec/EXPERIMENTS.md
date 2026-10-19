# Experiments

Compressions that were tried or weighed for 1.6 (revised 2026-10-19), kept or not, with the reason. The test for every one: does it leave a reader with less to do, with no meaning lost? Shorter is not enough. The suites named in the results are the whole set: the vectors, the oracle, the audit parity gate, every SDK, the server, MCP and CLI, and FoodOS (122 of 122 suites, 102 of 102 FoodX tests, 265 of 266 runtime tests: `test-point-places` fails on the original core too).

## Kept

### Fold `passkeys` into `encoding`, and `peers` into the protocol index (modules 13 to 11)

- **What.** `modules/passkeys.md` became the section "Passkeys" of `modules/encoding.md`, with invariant 28. `modules/peers.md` became "Which peer needs which module" in `protocol.md`; its micro-safety paragraph went to `blocks.md`.
- **Why a reader does less.** The passkey form is one more signature form of the `p256` suite, and `encoding.md` already holds the suites: a reader of the suites no longer follows a link to find the last one. The three peers are an orientation, not a rule a node enforces, and the index already had the table of which peer needs which module. Two files and two index entries are gone; no rule changed.
- **Where it went differently from the plan.** `peers` did not merge into `nodes`. A micro needs `peers` but not `nodes`; merging would make a device builder read the 9 KB of pull, push and admission to learn what a micro is. The index is the page every builder reads first.
- **Result.** Vectors 956, oracle 962, audit 0 differences, `sync-spec --check`, JavaScript, Rust, Python, Go, server, MCP, CLI, EPCIS: all pass. FoodOS 122 of 122, 102 of 102, 265 of 266 (the baseline). The wasm was rebuilt (the modules list is inside `protocol.json`).

## Not kept

### `confirms` and `defeats` as one verb with a sign

- **What it would be.** One ref key (say `judges`) and a sign in `state` (`for` or `against`).
- **What it costs.** A sign must live somewhere, and refs hold links, not data, so it goes to `state`. Every reader of a verdict would then read two places to learn which way it points. One block could no longer confirm one claim and defeat another (today the two keys can sit in one block). The two verbs also do different work in the folds: a `defeats` by a side or a named confirmer stops a transfer counting; a `confirms` is a ground. A sign puts that difference behind an `if`.
- **Blast radius.** The words appear 124 and 129 times in the spec and core, in 118 signed vectors (every one would be re-signed), in the oracle, the audit worlds and the schemas, and in 17 FoodOS source files (`model/promise.js`, `network/write.js`, `rails/proof.js`, `network/identity/successor.js`, the data-back contract and others) plus 15 FoodOS tests. That is a large FoodOS change for one fewer word.
- **Result.** Not built. Reverted at the weighing stage: it does not reduce what a reader must do, and it fails the rule "no large FoodOS change".

### Fold `members_then` into `circle_state`

- **What it would be.** `circle_state(circle, blocks, within?)` already exists in the core (`within` is "the circle as of a block's causal past"). `members_then` is that, then keep the ids, with the `circle#role` form filtered.
- **What it costs.** The `circle#role` grammar would move out of the fold into every caller, or the merged fold would grow a role argument and an output that changes shape with it. Six SDKs expose `members_then` (Kotlin cannot be tested here: no JDK). Nothing in FoodOS reads it, so no FoodOS cost, but nothing is saved for a reader: the same two reads (the past of a block, the roles of a member) are still needed.
- **Result.** Not built. A rename of a door op that leaves every implementer's work unchanged is not a simplification.

### Fold `next_link` into `chain`

- **What it costs.** `chain` is a reader's fold over all of a key's blocks. `next_link` is a writer's lookup over one block (the last one) and the block that brought the key in. A **micro** needs `next_link` and must not need the chain fold (core.md: "enough to build a micro"). Merging would make a device implement equivocation and gap checks to write its next block. `next_link` is also in the C header, the C++ example and `fb_next_link` in the FFI, and FoodOS's `write.js`, `host.js` call it.
- **Result.** Not built. It would add work for the smallest peer.

### Merge `nodes` and `peers` into one file

- See the kept experiment above: `peers` went to the index, not to `nodes`, for the micro's sake. No meaning was lost.

## Weighed, no change

### `under` and `schema`

- **Overlap.** Both name "the rule this block follows". `circles.md` says a shared record "names its rule in `refs.under` (a schema)" and `things.md` says `under` can name a law, a custom or a house rule, which are schemas.
- **Why they stay two.** They differ in what a reader must do. `under` names a **grant or a rule the block acts under**: the block cannot be judged without it (it is in `needs`, so the block waits), the grant is checked for its signer, scope and liveness, and consent follows the grantor through it. `schema` names the **shape a block follows**: it is not awaited (an unheld schema is `undeclared_ref`, ask for it), it declares fields and roles, and its `undo: ok` mark is read only from a trusted one. One merged key would make every reader look at the target's type to know whether to wait, check authority, or read fields. Today the key says it.
- **Result.** No change.

### Not to be merged (by decision)

`to_owner`, `to_holder`, `to_place` (three different folds); `transform` and `transfer` (a thing changes, or its owner changes); `promise` and `grant` (must and may).

## Found by the necessity table

See [`NECESSITY.md`](NECESSITY.md). Listed things that no vector needed were given vectors (`sdk/javascript/test/make-vectors-necessity.cjs`) or, if nothing read them, deleted.
