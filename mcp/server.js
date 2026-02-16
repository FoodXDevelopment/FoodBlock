#!/usr/bin/env node

/**
 * FoodBlock MCP Server
 *
 * Exposes the FoodBlock protocol to any MCP-compatible AI agent.
 * Connects to a live FoodBlock server (default: api.foodx.world/foodblock).
 *
 * Set FOODBLOCK_URL to point at a different server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load FoodBlock SDK (CommonJS)
const { create, update, chain, tree, canonical, createAgent, approveDraft, generateKeypair, sign, verify } = require("@foodxdev/foodblock");

const API_URL = process.env.FOODBLOCK_URL || "https://api.foodx.world/foodblock";

// Agent registry — maps agent hash to { keypair, operatorHash, sign }
const agents = new Map();

// ── HTTP helpers ─────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  return res.json();
}

async function apiGet(path) {
  return api(path);
}

async function apiPost(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

// Resolver for SDK chain/tree functions
const resolve = async (h) => {
  const res = await apiGet(`/blocks/${h}`);
  return res.error ? null : res;
};

// ── MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "foodblock",
  version: "0.1.0",
});

// ── Tool: foodblock_create ──────────────────────────────────────────────

server.registerTool(
  "foodblock_create",
  {
    title: "Create FoodBlock",
    description:
      "Create a new FoodBlock. A FoodBlock is the universal data primitive for the food system. " +
      "It has three fields: type (what it is), state (its properties), refs (what it references). " +
      "Base types: actor (person/org), place (location), substance (ingredient/product), " +
      "transform (cooking/processing), transfer (sale/delivery), observe (review/certification). " +
      "Use dot notation for subtypes: actor.producer, substance.product, observe.review, etc.",
    inputSchema: {
      type: z
        .string()
        .describe(
          "Block type. Base types: actor, place, substance, transform, transfer, observe. " +
          "Use dot notation for subtypes, e.g. actor.producer, substance.product, transfer.order"
        ),
      state: z
        .record(z.any())
        .optional()
        .default({})
        .describe(
          "The block's properties as a JSON object. Example: { name: 'Sourdough', price: 4.50 }"
        ),
      refs: z
        .record(z.any())
        .optional()
        .default({})
        .describe(
          "References to other blocks by hash. Example: { seller: 'abc123...' }"
        ),
    },
  },
  async ({ type, state, refs }) => {
    const result = await apiPost("/blocks", { type, state: state || {}, refs: refs || {} });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_update ──────────────────────────────────────────────

server.registerTool(
  "foodblock_update",
  {
    title: "Update FoodBlock",
    description:
      "Create a new version of an existing FoodBlock. FoodBlocks are append-only — " +
      "this creates a new block that references the previous one via refs.updates.",
    inputSchema: {
      previous_hash: z
        .string()
        .describe("The hash of the block to update (64-character hex string)"),
      type: z.string().describe("The block type (must match the original)"),
      state: z
        .record(z.any())
        .optional()
        .default({})
        .describe("The new state (full replacement, not a merge)"),
      refs: z
        .record(z.any())
        .optional()
        .default({})
        .describe("Additional refs (updates ref is added automatically)"),
    },
  },
  async ({ previous_hash, type, state, refs }) => {
    const mergedRefs = { ...(refs || {}), updates: previous_hash };
    const result = await apiPost("/blocks", { type, state: state || {}, refs: mergedRefs });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_get ─────────────────────────────────────────────────

server.registerTool(
  "foodblock_get",
  {
    title: "Get FoodBlock",
    description: "Fetch a specific FoodBlock by its SHA-256 hash.",
    inputSchema: {
      hash: z
        .string()
        .describe("The 64-character hex hash of the block to retrieve"),
    },
  },
  async ({ hash: h }) => {
    const result = await apiGet(`/blocks/${h}`);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_query ───────────────────────────────────────────────

server.registerTool(
  "foodblock_query",
  {
    title: "Query FoodBlocks",
    description:
      "Search for FoodBlocks by type, ref, or heads. Returns matching blocks.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe("Filter by type (exact or prefix). Examples: 'actor', 'substance.product'"),
      ref_role: z
        .string()
        .optional()
        .describe("Filter by ref role name. Use with ref_value. Example: 'seller'"),
      ref_value: z
        .string()
        .optional()
        .describe("Filter by ref value (a block hash). Use with ref_role."),
      heads_only: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, only return head blocks (latest version in each chain)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum results to return (default 20)"),
    },
  },
  async ({ type, ref_role, ref_value, heads_only, limit }) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (ref_role && ref_value) {
      params.set("ref", ref_role);
      params.set("ref_value", ref_value);
    }
    if (heads_only) params.set("heads", "true");
    if (limit) params.set("limit", String(limit));

    const result = await apiGet(`/blocks?${params}`);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_chain ───────────────────────────────────────────────

server.registerTool(
  "foodblock_chain",
  {
    title: "Trace Provenance Chain",
    description:
      "Follow the update chain of a FoodBlock backwards through its versions. " +
      "Shows the full version history: current → previous → original.",
    inputSchema: {
      hash: z
        .string()
        .describe("The hash of the block to trace backwards from"),
      max_depth: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum chain depth to traverse (default 50)"),
    },
  },
  async ({ hash: h, max_depth }) => {
    const result = await apiGet(`/chain/${h}?depth=${max_depth || 50}`);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_tree ────────────────────────────────────────────────

server.registerTool(
  "foodblock_tree",
  {
    title: "Trace Provenance Tree",
    description:
      "Build the full provenance tree for a FoodBlock by following ALL refs recursively. " +
      "Shows the complete story: bread ← baking ← flour ← wheat ← farm.",
    inputSchema: {
      hash: z
        .string()
        .describe("The hash of the block to build the provenance tree from"),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum tree depth (default 10)"),
    },
  },
  async ({ hash: h, max_depth }) => {
    // Tree uses SDK with API-backed resolver
    const result = await tree(h, resolve, { maxDepth: max_depth || 10 });

    if (!result) {
      return {
        content: [{ type: "text", text: `Block not found: ${h}` }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_heads ───────────────────────────────────────────────

server.registerTool(
  "foodblock_heads",
  {
    title: "List Head Blocks",
    description:
      "List all head blocks (latest version of each entity/item). " +
      "Optionally filter by type.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe("Optional type filter (e.g. 'substance.product')"),
    },
  },
  async ({ type }) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);

    const result = await apiGet(`/heads?${params}`);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: foodblock_info ────────────────────────────────────────────────

server.registerTool(
  "foodblock_info",
  {
    title: "FoodBlock System Info",
    description:
      "Get an overview of the FoodBlock system: server info, block count, and protocol summary. " +
      "Call this first to understand what data is available.",
    inputSchema: {},
  },
  async () => {
    let info = null;
    try {
      info = await apiGet("/");
    } catch {
      // API root may return non-JSON (e.g. HTML sandbox page)
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              server: info || { note: "API info unavailable (root may serve HTML)" },
              api_url: API_URL,
              protocol: {
                description:
                  "A content-addressable primitive for universal food data. " +
                  "Three fields (type, state, refs), six base types.",
                base_types: {
                  entities: ["actor — person or organisation", "place — physical location", "substance — ingredient, product, or material"],
                  actions: ["transform — changing one thing into another", "transfer — moving between actors", "observe — making a statement"],
                },
              },
              tips: [
                "Use foodblock_query with type='actor' to see all actors",
                "Use foodblock_tree on a product hash for full provenance",
                "Use foodblock_chain on any block for version history",
                "Use foodblock_create to add new blocks",
                "Use foodblock_create_agent to register as an AI agent",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_create_agent ─────────────────────────────────────

server.registerTool(
  "foodblock_create_agent",
  {
    title: "Create AI Agent",
    description:
      "Register a new AI agent in the FoodBlock system. " +
      "The agent gets its own identity, Ed25519 keypair, and can sign blocks. " +
      "Every agent must have an operator — the human or business it acts for.",
    inputSchema: {
      name: z.string().describe("Name for the agent, e.g. 'Bakery Assistant'"),
      operator_hash: z.string().describe("Hash of the actor this agent works for"),
      model: z.string().optional().describe("AI model, e.g. 'claude-sonnet'"),
      capabilities: z.array(z.string()).optional().describe("Agent capabilities"),
    },
  },
  async ({ name, operator_hash, model, capabilities }) => {
    const opts = {};
    if (model) opts.model = model;
    if (capabilities) opts.capabilities = capabilities;

    const agent = createAgent(name, operator_hash, opts);

    // Post the agent block to the server
    const result = await apiPost("/blocks", {
      type: agent.block.type,
      state: agent.block.state,
      refs: agent.block.refs,
    });

    // Register agent credentials locally for signing
    agents.set(agent.authorHash, {
      keypair: agent.keypair,
      operatorHash: operator_hash,
      sign: agent.sign,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agent_hash: agent.authorHash,
              block: result,
              public_key: agent.keypair.publicKey,
              message: `Agent "${name}" created. Use agent_hash ${agent.authorHash} to create drafts.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_agent_draft ─────────────────────────────────────

server.registerTool(
  "foodblock_agent_draft",
  {
    title: "Create Agent Draft",
    description:
      "Create a draft FoodBlock on behalf of an agent. Draft blocks have state.draft=true. " +
      "The human operator can approve or reject with foodblock_approve_draft.",
    inputSchema: {
      agent_hash: z.string().describe("Hash of the agent creating this draft"),
      type: z.string().describe("Block type, e.g. 'transfer.order'"),
      state: z.record(z.any()).optional().default({}).describe("Block state"),
      refs: z.record(z.any()).optional().default({}).describe("Block refs"),
    },
  },
  async ({ agent_hash, type, state, refs }) => {
    const agentData = agents.get(agent_hash);
    if (!agentData) {
      return {
        content: [
          { type: "text", text: `Error: Agent ${agent_hash} not registered. Create one first with foodblock_create_agent.` },
        ],
      };
    }

    const draftState = { ...(state || {}), draft: true };
    const draftRefs = { ...(refs || {}), agent: agent_hash };
    const block = create(type, draftState, draftRefs);
    const signed = agentData.sign(block);

    // Post to server
    await apiPost("/blocks", { type: block.type, state: block.state, refs: block.refs });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              draft: block,
              signed_by: agent_hash,
              message: `Draft created. Approve with foodblock_approve_draft using hash ${block.hash}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_approve_draft ───────────────────────────────────

server.registerTool(
  "foodblock_approve_draft",
  {
    title: "Approve Agent Draft",
    description:
      "Approve a draft block created by an agent. Creates a confirmed version with draft removed.",
    inputSchema: {
      draft_hash: z.string().describe("Hash of the draft block to approve"),
    },
  },
  async ({ draft_hash }) => {
    const draft = await apiGet(`/blocks/${draft_hash}`);
    if (draft.error) {
      return {
        content: [{ type: "text", text: `Error: Draft ${draft_hash} not found.` }],
      };
    }

    if (!draft.state || !draft.state.draft) {
      return {
        content: [{ type: "text", text: `Error: Block ${draft_hash} is not a draft.` }],
      };
    }

    const approved = approveDraft(draft);

    // Post approved block to server
    const result = await apiPost("/blocks", {
      type: approved.type,
      state: approved.state,
      refs: approved.refs,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              approved: result,
              original_draft: draft_hash,
              message: `Draft approved. Confirmed block: ${approved.hash}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_list_agents ─────────────────────────────────────

server.registerTool(
  "foodblock_list_agents",
  {
    title: "List Agents",
    description: "List all AI agents in the FoodBlock system.",
    inputSchema: {},
  },
  async () => {
    const result = await apiGet("/blocks?type=actor.agent&limit=100");
    const agentBlocks = result.blocks || [];

    const agentList = agentBlocks.map((b) => ({
      hash: b.hash,
      name: b.state.name,
      model: b.state.model || "unknown",
      capabilities: b.state.capabilities || [],
      operator: b.refs.operator,
      can_sign: agents.has(b.hash),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: agentList.length, agents: agentList }, null, 2),
        },
      ],
    };
  }
);

// ── Start ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`FoodBlock MCP Server running on stdio`);
  console.error(`API: ${API_URL}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
