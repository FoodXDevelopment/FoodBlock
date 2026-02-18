# FoodBlock Distribution Checklist

Status of getting FoodBlock into every AI tool.

## Published

- [x] **npm: @foodxdev/foodblock@0.4.0** — SDK
- [x] **npm: foodblock-mcp@0.5.1** — MCP server (`npx foodblock-mcp` works)
- [x] **Official MCP Registry** — io.github.FoodXDevelopment/foodblock-mcp (published via mcp-publisher)

## Directories

- [x] **Official MCP Registry** — published, live at registry.modelcontextprotocol.io
- [x] **PulseMCP** — auto-indexes from official registry weekly, no action needed
- [x] **Glama** — glama.json in repo for auto-indexing; also submit PR to punkpeye/awesome-mcp-servers
- [ ] **Smithery** — namespace created (foodxdevelopment), hosted deploy needs paid plan

## AI Tool Configs (ready — just add to config)

- [x] **Claude Code** — configured in ~/.claude.json (restart to activate)
- [ ] **Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
  ```json
  {"mcpServers":{"foodblock":{"command":"npx","args":["-y","foodblock-mcp"]}}}
  ```
- [ ] **Cursor** — Settings > MCP Servers > Add
- [ ] **Windsurf** — Settings > MCP
- [ ] **Gemini CLI** — add to MCP config

## ChatGPT Custom GPT

See `openai/GPT_SETUP.md` for step-by-step instructions.

Prerequisites:
1. Domain verification for `api.foodx.world` (DNS TXT or hosted file)
2. Privacy policy at https://foodx.world/privacy (already exists)

Steps:
1. Go to https://chatgpt.com/gpts/editor
2. Paste config from `openai/GPT_SETUP.md`
3. Add action with `openai/openapi.yaml` schema
4. Set privacy policy URL to `https://foodx.world/privacy`
5. Publish as public

## Gemini

- **Gemini CLI**: MCP config (same as other tools)
- **Gemini API**: Use `gemini/tools.json` for function calling
- **Google AI Studio**: Paste function declarations from `gemini/tools.json`
- **Vertex AI**: Same format with snake_case field names
- Docs: `gemini/README.md`
