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

The node is in memory unless you point the door at a FoodOS host (next section). Blocks come in through the SDK's `accept` either way.

## Hosted: a real node, and OAuth

The door can reach a person's node on a FoodOS host over HTTP, and an assistant can reach the door over HTTP with the MCP authorization flow.

| Variable | What it does |
|---|---|
| `FOODBLOCK_NODE_URL` | A FoodOS host (the Backend's `kernel/node/host.js` `handler`). The door uses the person's window at `{url}/{personId}` |
| `FOODBLOCK_NODE_TOKEN` | The person's window credential (`host.credential(personId, { scopes: ['read','write'] })`), sent as `Authorization: Bearer`, never in a URL |
| `FOODBLOCK_AUTH=oauth` | With `--http`: `/mcp` answers 401 until the assistant has a bearer token from the OAuth flow |
| `FOODBLOCK_PUBLIC_URL` | The address clients reach the door by (HTTPS in production) |

The door reads the host's blocks before each call (`remote.js`), signs with the person's key only on their tap, and sends the signed
block to the host, whose SDK judges it. The host never holds the person's key. The host relays an assistant's block only as the
agent's own genesis or under a grant the person signed.

OAuth follows the MCP authorization spec: protected-resource metadata, authorization-server metadata, dynamic client registration, authorization
code with PKCE (S256), refresh with rotation. The person's yes on the consent page is their approval code, which the assistant never sees.
A token only says "this assistant may reach the door" (`foodblock:read`: find and read; `foodblock:draft`: ask, connect, promise, accept).
**Authority to bind is never an OAuth scope**: it is a grant the person signs after the assistant calls `foodblock_connect`.

Try it locally: in the Backend, `node kernel/testing/helpers/serve-host.mjs 7421` starts a host and index; join a person and issue a
credential from a script, then `FOODBLOCK_NODE_URL=http://127.0.0.1:7421 FOODBLOCK_NODE_TOKEN=... FOODBLOCK_AUTH=oauth node server.js --http`.
`test/hosted.test.js` does all of this end to end (set `FOODOS_BACKEND` if the Backend is not at `~/Backend-foodx-computer`).

## Tests

`npm test` runs the door against a local in-memory node (an assistant finds an offer, drafts an ask, the person
approves, the seller accepts, the stage reads right; no grant never binds; a STOP'd recipient is never messaged) and
both transports, then against a real host with OAuth (`test/hosted.test.js`).

## License
MIT
