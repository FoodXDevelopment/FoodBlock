#!/bin/bash
# Usage: ./test-tool.sh <tool_name> [json_arguments]
#
# Examples:
#   ./test-tool.sh foodblock_info
#   ./test-tool.sh foodblock_query '{"type":"actor"}'
#   ./test-tool.sh foodblock_query '{"type":"substance.product","heads_only":true}'
#   ./test-tool.sh foodblock_get '{"hash":"PASTE_HASH_HERE"}'
#   ./test-tool.sh foodblock_tree '{"hash":"PASTE_HASH_HERE"}'
#   ./test-tool.sh foodblock_create '{"type":"actor.venue","state":{"name":"The Oak Table","sector":"hospitality"}}'

TOOL=${1:-foodblock_info}
ARGS=${2:-\{\}}

DIR="$(cd "$(dirname "$0")" && pwd)"

printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"%s","arguments":%s}}\n' "$TOOL" "$ARGS" \
  | node "$DIR/server.js" 2>/dev/null \
  | tail -1 \
  | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
text = data['result']['content'][0]['text']
try:
    print(json.dumps(json.loads(text), indent=2))
except:
    print(text)
"
