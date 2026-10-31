# Distribution

What is published, and what publishing FoodBlock 1.7 needs. Nothing is published without Patrick's go-ahead.

## Published today (all 0.x, before 1.6)

| Where | What | Speaks |
|---|---|---|
| npm `@foodxdev/foodblock@0.5.0` | the JS SDK | 0.5 |
| npm `foodblock-mcp@0.5.2` | the MCP server | 0.5 |
| npm `foodblock-cli@0.5.1` | the CLI | 0.5 |
| PyPI `foodblock@0.1.0` | the Python SDK (pre-1.0, not the Rust-core SDK in this repository) | 0.x |
| MCP Registry `io.github.FoodXDevelopment/foodblock-mcp` | points at `foodblock-mcp` on npm | 0.5 |
| Glama | indexes `glama.json` from the GitHub repository | whatever is pushed there |

So `npx foodblock-mcp` and `npm install foodblock-cli` give the 0.5 tools, not what is in this repository.

## Package names and installs

The names are the ones in each package manifest. "From source" means a clone of this repository; the 1.7 versions are
not published yet.

| Package (manifest) | Name | Install today |
|---|---|---|
| `sdk/javascript/package.json` | `@foodxdev/foodblock` | npm has 0.5.0 only. 1.7: from source, `npm install ./sdk/javascript` |
| `mcp/package.json` | `foodblock-mcp` | npm has 0.5.2 only. 1.7: from source, `npm install ./sdk/javascript && npm install ./mcp` |
| `cli/package.json` | `foodblock-cli` (bins `fb`, `foodblock-cli`) | npm has 0.5.1 only. 1.7: from source, `npm install ./sdk/javascript && npm install ./cli` |
| `server/package.json` | `foodblock-node` | not a package; from source (`cd server && npm install`) or its Dockerfile |
| `sdk/python/pyproject.toml` | `foodblock` | PyPI has 0.1.0 only. 1.7: from source, `pip install ./sdk/python` |
| `sdk/rust/Cargo.toml` | `foodblock` | not on crates.io; from source, `foodblock = { path = "sdk/rust" }` in `Cargo.toml` |
| `sdk/go/go.mod` | `github.com/FoodXDevelopment/foodblock/sdk/go` | not tagged yet; from source, `replace` it to `./sdk/go` in `go.mod` |
| `Package.swift` (root) | `FoodBlock` | not released (no XCFramework release yet); from source, add the clone as a local package after `sdk/swift/scripts/build-xcframework.sh` |
| `sdk/kotlin/build.gradle.kts` | Maven `world.foodx:foodblock` (and the Android AAR) | not published; from source, `cd sdk/kotlin && scripts/build-natives.sh && ./gradlew :foodblock:jar` |

## What publishing 1.7 needs

Every package is at `1.7.0`, and the protocol version each one reports is read from `spec/protocol.json`.

1. **The JS SDK carries its spec copy.** The JS SDK and the Rust crate carry an exact copy of `protocol.json` (and
   the crate the converter's `aliases-0.x.json`), made by `node test/sync-spec.cjs` and checked by their tests; the
   other languages read the spec through the Rust core. Year zero: no `aliases.json` is shipped anywhere.
2. **The MCP server and CLI name the SDK by version.** In this repository they depend on
   `file:../sdk/javascript`. npm does not rewrite that on publish, so at release it becomes `"^1.7.0"`, once the SDK
   is on npm.
3. Then npm (SDK, MCP, CLI), the MCP Registry (`mcp/server.json`), PyPI (`sdk/python`), a Go module tag
   (`sdk/go/v1.7.0`; pure Go, the core is the embedded `foodblock.wasm`, so nothing else is built), and the Swift package
   (the root `Package.swift` is the manifest SwiftPM fetches; a release uploads `CFoodBlock.xcframework.zip`, built by
   `sdk/swift/scripts/build-xcframework.sh`, and sets `checksum` in `Package.swift` to the one it prints). Kotlin:
   the jar (natives for five platforms) and the Android AAR are built by `.github/workflows/packages.yml`; a person
   downloads its artifacts and publishes. `node tools/version-sync.cjs --pack` dry-runs all of it where the tools exist.

The node (`server/`) is not a package: run it from this repository or with its Dockerfile.

## Before a revised core is deployed: replay the stored blocks

A node keeps every block exactly as it arrived (`sql/schema.sql`). Before a revised core replaces the one that wrote them, check what it would say about them. `tools/replay-check.cjs` reads exported blocks and prints counts and reason codes only, never a block, an id or a key. It never connects to anything.

1. On the machine that holds the node's database, export the messages to a private file: `psql "$DATABASE_URL" -At -c "select message::text from blocks order by n" > blocks.jsonl`.
2. In a checkout of the revised core: `node tools/replay-check.cjs blocks.jsonl` (`--json` for a machine-readable result, `--limit N` to judge the first N only).
3. Read the counts. A block that fails would be refused by the revised core; fix the cause, or convert the data once with `fb convert`, before deploying. Delete the export afterwards.
