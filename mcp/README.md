# FoodBlock MCP server: the door

Any AI assistant (Claude, ChatGPT, Gemini, any MCP client) can **find, read, ask and promise** on FoodBlock
(protocol 1.7, [`spec/protocol.md`](../spec/protocol.md)). The assistant drafts. **The person decides**, with one tap.

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

On start the server prints the **approval page** address to stderr, and where your **approval code** is (`<FOODBLOCK_IDENTITY>.approval`;
the code itself is never printed, because many clients show this output to the assistant). Keep the code to yourself.
**In this local mode the boundary is your computer account:** the key file, the recovery file and the code file can be read
by anything running as you, so an assistant that can run shell commands or read files could read the code or sign as you.
Use it with assistants that cannot touch your files, or use the hosted door with OAuth, where the assistant never sees a key
or a code. Then say to your assistant: *"Find flour near Hartley Mill and ask for 5 kg."*
It returns a draft and a link. You open the link, check the words, type your code and tap **Send as me**.

## Six tools

This server is neutral: it names no product and holds no one's agent. A host that runs the person's own agent passes its own name, icon and `ask_my_foodos` tool to the endpoint, and nothing else here knows them.

| Tool | What it does |
|---|---|
| `foodblock_find` | Offers, things or peers, by `what` (a word) and `near` (a place hash or name) |
| `foodblock_read` | A block (with refusals and signature check), a thing as a fold (state now, where, owner), a promise's stage, or a draft |
| `foodblock_ask` | Draft an ask or quote request. Always a draft: returns a receipt code and an approval link |
| `foodblock_promise` | A firm promise for the person. Binds only under a live grant that names `promise`; otherwise a draft |
| `foodblock_accept` | Accept an offer or counter-offer. Same rule |
| `foodblock_connect` | Pair the assistant with a scoped grant (acts, parties, days, money limit). A draft until the person taps. `parties` lists the ids it may deal with; none listed means no one but the person |

## The six rules

0. **The audience is the person's choice, asked every time.** `foodblock_ask`, `foodblock_promise`, `foodblock_accept` and `foodblock_connect` each take a required `audience` (`"public"`, or a list of ids); a call without one is refused and nothing is drafted. The door stamps `at` itself, from its own clock; it fills in nothing else.
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
| `FOODBLOCK_SEED=demo` | Start with a small made-up demo story to find (a mill and an offer; every seeded block says it is a demo). Off by default |
| `FOODBLOCK_APPROVE_PORT` | The approval page port on stdio (default: any free port) |
| `FOODBLOCK_HOST` | The HTTP bind address (default `127.0.0.1`). An address beyond this machine needs `FOODBLOCK_AUTH=oauth`: the door will not start open on a network |
| `FOODBLOCK_REACH` | The recovery window of a new identity, a duration the person states (for example `P30D`); required when no identity file exists yet |

The node is in memory unless you point the door at a node host (next section). Blocks come in through the SDK's `accept` either way.

## Hosted: a real node, and OAuth

The door can reach a person's node on a node host over HTTP, and an assistant can reach the door over HTTP with the MCP authorization flow.

| Variable | What it does |
|---|---|
| `FOODBLOCK_INDEX_URL` | An open index (the foodx checkout's `foodos/index/http.js`). `foodblock_find` for offers asks it and verifies its signed answer; `FOODBLOCK_INDEX_KEY` pins the index's public key (else read once from its well-known). Read, ask and promise stay on the host |
| `FOODBLOCK_NODE_URL` | A node host (its `handler`). The door uses the person's window at `{url}/{personId}` |
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


A host's own repository tests this end to end against its node.

## Tests

`npm test` runs the door against a local in-memory node (an assistant finds an offer, drafts an ask, the person
approves, the seller accepts, the stage reads right; no grant never binds; a STOP'd recipient is never messaged) and
both transports.

## License
Public domain (CC0 1.0).
