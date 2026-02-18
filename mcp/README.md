# FoodBlock MCP Server

Food data tools for any AI agent. Describe food in plain English, get structured data back. Works **standalone** (zero config, 47 demo blocks) or **connected** to a live FoodBlock server.

## Install

```bash
npx foodblock-mcp
```

No server needed. No database. No config. Just food data tools.

## Configure Your AI Tool

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "foodblock-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add foodblock -- npx -y foodblock-mcp
```

### Cursor

Settings > MCP Servers > Add:

```json
{
  "foodblock": {
    "command": "npx",
    "args": ["-y", "foodblock-mcp"]
  }
}
```

### Windsurf

Settings > MCP:

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "foodblock-mcp"]
    }
  }
}
```

### Gemini CLI

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "foodblock-mcp"]
    }
  }
}
```

### Connected Mode (your own server)

Set `FOODBLOCK_URL` to connect to a live FoodBlock server instead of the embedded store:

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "foodblock-mcp"],
      "env": {
        "FOODBLOCK_URL": "http://localhost:3111"
      }
    }
  }
}
```

## Tools (17)

| Tool | Description |
|------|-------------|
| `foodblock_fb` | **Natural language entry point** — describe food in English, get blocks back |
| `foodblock_info` | System overview — call this first |
| `foodblock_create` | Create a new block |
| `foodblock_update` | Create a new version of an existing block |
| `foodblock_get` | Fetch a block by hash |
| `foodblock_query` | Search blocks by type, ref, or heads |
| `foodblock_chain` | Trace the version history of a block |
| `foodblock_tree` | Build the full provenance tree |
| `foodblock_heads` | List latest versions of all entities |
| `foodblock_tombstone` | Mark a block for content erasure (GDPR) |
| `foodblock_validate` | Validate a block against its schema |
| `foodblock_batch` | Create multiple blocks in one request |
| `foodblock_create_agent` | Register an AI agent identity |
| `foodblock_load_agent` | Restore a previously created agent |
| `foodblock_agent_draft` | Create a draft block as an agent |
| `foodblock_approve_draft` | Approve an agent's draft |
| `foodblock_list_agents` | List all AI agents |

## How It Works

```
Standalone:   AI Agent  <--stdio-->  MCP Server [embedded store, 47 blocks]
Connected:    AI Agent  <--stdio-->  MCP Server  <--HTTP-->  FoodBlock API
```

Standalone mode runs an in-memory FoodBlock store with a complete bakery supply chain demo: farm, mill, bakery, distributor, retailer, certifications, reviews, agent, orders, and more.

## Other AI Platforms

### ChatGPT / OpenAI

For ChatGPT Custom GPTs, use the OpenAPI spec at [`openai/openapi.yaml`](../openai/openapi.yaml).

For OpenAI API function calling, use the tool definitions at [`openai/tools.json`](../openai/tools.json).

### Gemini / Google AI

For Gemini API function calling, use [`gemini/tools.json`](../gemini/tools.json).

For Google AI Studio, Vertex AI, and Python SDK usage, see [`gemini/README.md`](../gemini/README.md).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FOODBLOCK_URL` | *(none — standalone)* | Set to connect to a live FoodBlock API |

## License

MIT
