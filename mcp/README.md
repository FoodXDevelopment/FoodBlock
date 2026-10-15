# FoodBlock MCP server

Lets any AI agent read and write FoodBlocks (protocol version 1.6, [`spec/protocol.md`](../spec/protocol.md)).

The server writes as one identity: a person, or an agent or machine with its own keys. It holds their genesis (the
block that says who they are and names their keys). Every block it writes goes through the SDK's one write path,
`write`: composed, checked, signed, and placed in that identity's key chain (`state.seq`, `refs.prev`). It reads
blocks from any earlier version through the alias table, so an old `place` is found as a `thing`. It checks nothing
itself; every list it shows (types, verbs, terms, shapes) is read from `spec/protocol.json` through the SDK.

Blocks live in memory. On start it holds a small story: a mill, its flour, an offer of that flour to a bakery, and a
review of the bakery.

## Run

From this repository:

```bash
cd mcp && npm install && node server.js
```

`npm install` links the SDK from `../sdk/javascript` (a `file:` dependency).

Claude Code:

```bash
claude mcp add foodblock -- node /path/to/foodblock/mcp/server.js
```

Any other MCP client (Claude Desktop, Cursor, Windsurf, Gemini CLI) takes the same command:

```json
{ "mcpServers": { "foodblock": { "command": "node", "args": ["/path/to/foodblock/mcp/server.js"] } } }
```

## Tools

| Tool | What it does |
|------|--------------|
| `foodblock_info` | The seven types, seven verbs, shared refs, shapes, terms, answers and scope, and who this server writes as |
| `foodblock_create` | Write a block: placed in the key chain, checked, signed. A private audience comes back with its salts |
| `foodblock_get` | One block by its hash (or the start of it), exactly as signed |
| `foodblock_query` | Find blocks by type and kind, or by a ref, read as 1.6 (the SDK's pull filter) |
| `foodblock_history` | Every version of a record, oldest first |
| `foodblock_check` | What is wrong with a block, in plain words, without writing it |
| `foodblock_read_as` | Read a block of any earlier version as 1.6 |
| `foodblock_verify` | Whether a held block was signed by its author |

## Settings

| Variable | What it does |
|----------|--------------|
| `FOODBLOCK_IDENTITY` | A file for this server's keys, genesis and the blocks it signs, in the CLI's format (`fb init` makes one). Made on first run, with the recovery key put apart in `<file>.recovery.json` to keep offline. Without it, the server is a new identity each run |
| `FOODBLOCK_SEED=off` | Start empty, without the story |

## Tests

`npm test` starts the server and calls its tools over stdio.

## License

MIT
