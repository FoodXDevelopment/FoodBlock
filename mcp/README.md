# FoodBlock MCP Server

An [MCP](https://modelcontextprotocol.io) server that connects any AI agent to the FoodBlock protocol — the universal data primitive for the food system.

## Quick Start

```bash
npx @foodxdev/foodblock-mcp
```

Or install globally:

```bash
npm install -g @foodxdev/foodblock-mcp
foodblock-mcp
```

## Configure with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "@foodxdev/foodblock-mcp"]
    }
  }
}
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Custom server URL

To point at a different FoodBlock server:

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "@foodxdev/foodblock-mcp"],
      "env": {
        "FOODBLOCK_URL": "http://localhost:3111"
      }
    }
  }
}
```

## Configure with Claude Code

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "foodblock": {
      "command": "npx",
      "args": ["-y", "@foodxdev/foodblock-mcp"]
    }
  }
}
```

## Tools

The server exposes 15 tools:

| Tool | Description |
|------|-------------|
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
| `foodblock_agent_draft` | Create a draft block as an agent |
| `foodblock_approve_draft` | Approve an agent's draft |
| `foodblock_list_agents` | List all AI agents |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FOODBLOCK_URL` | `https://api.foodx.world/foodblock` | FoodBlock API endpoint |

## How It Works

The server communicates over stdio using the Model Context Protocol. It connects to a live FoodBlock API server and exposes all protocol operations as MCP tools that any compatible AI agent can call.

```
AI Agent  <--stdio-->  MCP Server  <--HTTP-->  FoodBlock API
```

## License

MIT
