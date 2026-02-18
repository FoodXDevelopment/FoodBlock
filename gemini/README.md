# FoodBlock for Gemini

Food data tools for Google Gemini. Three integration paths depending on your setup.

## 1. Gemini CLI (MCP — recommended)

Gemini CLI supports MCP servers natively. Add to your config:

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

This gives you all 17 tools with zero config. The MCP server runs standalone with 47 demo blocks — no external server needed.

## 2. Gemini API (Function Calling)

Use [`tools.json`](tools.json) with the Gemini API directly.

### REST API

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Create a sourdough bread product, $4.50, organic"}]}],
    "tools": '"$(cat tools.json)"',
    "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}}
  }'
```

### Python SDK

```python
from google import genai
from google.genai import types
import json

# Load FoodBlock tool definitions
with open("tools.json") as f:
    declarations = json.load(f)[0]["functionDeclarations"]

tools = types.Tool(function_declarations=declarations)
config = types.GenerateContentConfig(tools=[tools])

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Create a sourdough bread product, organic, $4.50",
    config=config
)

# The model returns a function call
for part in response.candidates[0].content.parts:
    if part.function_call:
        print(part.function_call.name)  # "foodblock_create"
        print(part.function_call.args)  # {"type": "substance.product", ...}
```

### Vertex AI

Same format but with snake_case field names (`function_declarations` instead of `functionDeclarations`) and Vertex AI endpoint:

```bash
curl "https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Describe your food data"}]}],
    "tools": [{"function_declarations": [...]}],
    "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}}
  }'
```

## 3. Google AI Studio

Paste the function declarations from `tools.json` into the Google AI Studio function calling interface. The model will use FoodBlock tools when you describe food.

## Connected Mode

To connect to a live FoodBlock server instead of the embedded store:

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
| `foodblock_fb` | Natural language entry point — describe food in English, get blocks back |
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

## License

MIT
