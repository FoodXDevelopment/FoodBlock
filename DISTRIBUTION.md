# Distribution

What is published, and what publishing FoodBlock 1.6 needs. Nothing is published without Patrick's go-ahead.

## Published today (all 0.x, before 1.6)

| Where | What | Speaks |
|---|---|---|
| npm `@foodxdev/foodblock@0.5.0` | the JS SDK | 0.5 |
| npm `foodblock-mcp@0.5.x` | the MCP server | 0.5 |
| npm `foodblock-cli@0.5.1` | the CLI | 0.5 |
| MCP Registry `io.github.FoodXDevelopment/foodblock-mcp` | points at `foodblock-mcp` on npm | 0.5 |
| Glama | indexes `glama.json` from the GitHub repository | whatever is pushed there |

So `npx foodblock-mcp` and `npm install foodblock-cli` give the 0.5 tools, not what is in this repository.

## What publishing 1.6 needs

Every package is at `1.6.0`, and the protocol version each one reports is read from `spec/protocol.json`.

1. **The JS SDK carries its spec copy.** The JS SDK and the Rust crate carry an exact copy of `protocol.json` (and
   the crate the converter's `aliases-0.x.json`), made by `node test/sync-spec.cjs` and checked by their tests; the
   other languages read the spec through the Rust core. Year zero: no `aliases.json` is shipped anywhere.
2. **The MCP server and CLI name the SDK by version.** In this repository they depend on
   `file:../sdk/javascript`. npm does not rewrite that on publish, so at release it becomes `"^1.6.0"`, once the SDK
   is on npm.
3. Then npm (SDK, MCP, CLI), the MCP Registry (`mcp/server.json`), PyPI (`sdk/python`), a Go module tag
   (`sdk/go/v1.6.0`), and the Swift package (SwiftPM needs `Package.swift` at the root of the repository it fetches,
   so the Swift SDK publishes from its own repository or a root manifest).

The node (`server/`) is not a package: run it from this repository or with its Dockerfile.
