# FoodBlock MCP server: the door

Any AI assistant (Claude, ChatGPT, Gemini, any MCP client) can **find, read, ask and promise** on FoodBlock
(protocol 1.6, [`spec/protocol.md`](../spec/protocol.md)). The assistant drafts. **The person decides**, with one tap.

## Quick start (one paste)

```bash
git clone https://github.com/FoodXDevelopment/foodblock && cd foodblock/mcp && npm install && claude mcp add foodblock -- node "$PWD/server.js"
```

Any other client (Claude Desktop, Cursor, Gemini CLI, Windsurf) takes the same command:

```json
{ "mcpServers": { "foodblock": { "command": "node", "args": ["/path/to/foodblock/mcp/server.js"] } } }
```

ChatGPT and other remote clients use Streamable HTTP: `node server.js --http 7420`, then point the client at
`http://127.0.0.1:7420/mcp`.

On start the server prints two lines to stderr: the **approval page** address and your **approval code**. Keep the
code to yourself: the assistant never sees it. Then say to your assistant: *"Find flour near Hartley Mill and ask for 5 kg."*
It returns a draft and a link. You open the link, check the words, type your code and tap **Send as me**.

## Six tools

| Tool | What it does |
|---|---|
| `foodblock_find` | Offers, things or peers, by `what` (a word) and `near` (a place hash or name) |
| `foodblock_read` | A block (with refusals and signature check), a thing as a fold (state now, where, owner), a promise's stage, or a draft |
| `foodblock_ask` | Draft an ask or quote request. Always a draft: returns a receipt code and an approval link |
| `foodblock_promise` | A firm promise for the person. Binds only under a live grant that names `promise`; otherwise a draft |
| `foodblock_accept` | Accept an offer or counter-offer. Same rule |
| `foodblock_connect` | Pair the assistant with a scoped grant (acts, days, money limit). A draft until the person taps |

## The six rules

1. **The agent drafts; the person decides.** A draft is data on the person's node, not a block. The person's tap signs it with the person's own key.
2. **An unanswered ask binds no one.** An ask reads as `asked` until the other side answers.
3. **A human author for any first message to a stranger.** `ask` is always a draft. An agent-signed block goes out only when the SDK's admission check passes: the other side has said `yes` for the person (or their assistants).
4. **STOP binds.** The SDK's admission check runs when a draft is made and again at the tap. A person who said STOP is never drafted to or messaged.
5. **Never hold money.** There is no transfer, payment or deposit tool. A grant's `limit` is the person's fence on what an assistant may bind.
6. **Open types, closed authority.** The assistant writes no raw blocks. It can only make an ask (the person's) or a promise or accept under a live grant (it names the grant in `refs.under`).

Every protocol rule is the JavaScript SDK's (the Rust core, through WebAssembly). The door composes blocks and asks the SDK; it checks nothing itself.

## Connect an assistant that may bind

```
foodblock_connect { "acts": ["promise"], "days": 7, "limit": { "minor": 2000, "currency": "GBP" } }
```

The person sees the exact words (*"may bind you on: promise, until ..., up to 20.00 GBP"*) and taps. With no `acts`, the
assistant may only find, read and draft. A grant never reaches a stranger: the other side must have said `yes` first.

## Settings

| Variable | What it does |
|---|---|
| `FOODBLOCK_IDENTITY` | A file for the person's keys, genesis and chain (the CLI's format). Made on first run; the recovery key goes to `<file>.recovery.json`, the approval code to `<file>.approval` |
| `FOODBLOCK_SEED=off` | Start with an empty node instead of a small story to find |
| `FOODBLOCK_APPROVE_PORT` | The approval page port on stdio (default: any free port) |
| `FOODBLOCK_HOST` | The HTTP bind address (default `127.0.0.1`) |

The node is in memory in this version. Blocks come in through the SDK's `accept`; a remote node is the next step.

## Tests

`npm test` runs the door against a local in-memory node (an assistant finds an offer, drafts an ask, the person
approves, the seller accepts, the stage reads right; no grant never binds; a STOP'd recipient is never messaged) and
both transports.

## License
MIT
