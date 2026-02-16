#!/usr/bin/env node

/**
 * FoodBlock MCP Server
 *
 * Exposes the FoodBlock protocol to any MCP-compatible AI agent.
 * Tools: create, get, query, chain, tree, heads
 *
 * Runs against an in-memory store seeded with a 32-block bakery supply chain.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load FoodBlock SDK (CommonJS)
const { create, update, hash, chain, tree, canonical, createAgent, createDraft, approveDraft, loadAgent, generateKeypair, sign, verify } = require("../sdk/javascript/src/index");
const { generateSeed } = require("../sandbox/seed");

// Agent registry — maps agent hash to { keypair, operatorHash }
const agents = new Map();

// ── In-memory store (mirrors sandbox/server.js) ────────────────────────

const store = new Map();
const byType = new Map();
const byAuthor = new Map();
const byRef = new Map();
const heads = new Map(); // headHash -> chainId

function insertBlock(block) {
  store.set(block.hash, block);

  // Type index
  if (!byType.has(block.type)) byType.set(block.type, []);
  byType.get(block.type).push(block.hash);

  // Author index
  const author = block.refs && block.refs.author;
  if (author) {
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author).push(block.hash);
  }

  // Ref index (all ref values)
  if (block.refs) {
    for (const [role, ref] of Object.entries(block.refs)) {
      const hashes = Array.isArray(ref) ? ref : [ref];
      for (const h of hashes) {
        if (!byRef.has(h)) byRef.set(h, []);
        byRef.get(h).push(block.hash);
      }
    }
  }

  // Head resolution
  const prevHash = block.refs && block.refs.updates;
  if (prevHash) {
    const prev = store.get(prevHash);
    const chainId = prev
      ? heads.has(prev.hash)
        ? prev.hash
        : findChainId(prevHash)
      : prevHash;
    heads.delete(prevHash);
    heads.set(block.hash, chainId);
  } else {
    heads.set(block.hash, block.hash);
  }
}

function findChainId(h) {
  for (const [headHash, chainId] of heads.entries()) {
    if (headHash === h) return chainId;
  }
  const block = store.get(h);
  if (!block) return h;
  const prev = block.refs && block.refs.updates;
  if (!prev) return h;
  return findChainId(prev);
}

// Seed the store with bakery supply chain
const seedBlocks = generateSeed();
for (const block of seedBlocks) {
  insertBlock(block);
}

// Resolver for SDK chain/tree functions
const resolve = async (h) => store.get(h) || null;

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
          "Use dot notation for subtypes, e.g. actor.producer, substance.product, transfer.order, observe.review"
        ),
      state: z
        .record(z.any())
        .optional()
        .default({})
        .describe(
          "The block's properties as a JSON object. Example for a product: { name: 'Sourdough', price: 4.50, allergens: { gluten: true } }"
        ),
      refs: z
        .record(z.any())
        .optional()
        .default({})
        .describe(
          "References to other blocks by hash. Example: { seller: 'abc123...', inputs: ['def456...', 'ghi789...'] }"
        ),
    },
  },
  async ({ type, state, refs }) => {
    const block = create(type, state || {}, refs || {});

    if (store.has(block.hash)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { exists: true, block: store.get(block.hash) },
              null,
              2
            ),
          },
        ],
      };
    }

    insertBlock(block);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(block, null, 2),
        },
      ],
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
      "this creates a new block that references the previous one via refs.updates. " +
      "Use this for price changes, status updates, etc.",
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
        .describe(
          "Additional refs (updates ref is added automatically)"
        ),
    },
  },
  async ({ previous_hash, type, state, refs }) => {
    const prev = store.get(previous_hash);
    if (!prev) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Block ${previous_hash} not found. Cannot update a block that doesn't exist.`,
          },
        ],
      };
    }

    const block = update(previous_hash, type, state || {}, refs || {});
    insertBlock(block);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(block, null, 2),
        },
      ],
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
    const block = store.get(h);
    if (!block) {
      return {
        content: [
          { type: "text", text: `Block not found: ${h}` },
        ],
      };
    }

    // Enrich with context
    const isHead = heads.has(h);
    const referencedBy = byRef.get(h) || [];
    const refBlocks = referencedBy.map((rh) => {
      const rb = store.get(rh);
      return rb ? { hash: rb.hash, type: rb.type, summary: rb.state.name || rb.state.text || rb.type } : null;
    }).filter(Boolean);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              block,
              context: {
                is_head: isHead,
                referenced_by_count: referencedBy.length,
                referenced_by: refBlocks.slice(0, 10),
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_query ───────────────────────────────────────────────

server.registerTool(
  "foodblock_query",
  {
    title: "Query FoodBlocks",
    description:
      "Search for FoodBlocks by type, ref, or state. Returns matching blocks. " +
      "Examples: query all actors, find products by a specific seller, find reviews for a product.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe(
          "Filter by type (exact match or prefix). Examples: 'actor', 'substance.product', 'observe', 'transfer.order'"
        ),
      ref_role: z
        .string()
        .optional()
        .describe(
          "Filter by ref role name. Use with ref_value. Example: 'seller'"
        ),
      ref_value: z
        .string()
        .optional()
        .describe(
          "Filter by ref value (a block hash). Use with ref_role. Example: the hash of a bakery actor"
        ),
      heads_only: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, only return head blocks (latest version in each update chain)"
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results to return (default 20)"),
    },
  },
  async ({ type, ref_role, ref_value, heads_only, limit }) => {
    let results = [...store.values()];

    // Filter by type
    if (type) {
      results = results.filter(
        (b) => b.type === type || b.type.startsWith(type + ".")
      );
    }

    // Filter by ref
    if (ref_role && ref_value) {
      results = results.filter((b) => {
        const r = b.refs && b.refs[ref_role];
        if (Array.isArray(r)) return r.includes(ref_value);
        return r === ref_value;
      });
    }

    // Heads only
    if (heads_only) {
      const headSet = new Set(heads.keys());
      results = results.filter((b) => headSet.has(b.hash));
    }

    const total = results.length;
    results = results.slice(0, limit || 20);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total,
              returned: results.length,
              blocks: results,
            },
            null,
            2
          ),
        },
      ],
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
      "Shows the full version history: current → previous → original. " +
      "Use this to see how a product's price changed, or how an entity evolved over time.",
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
    const result = await chain(h, resolve, { maxDepth: max_depth || 50 });

    if (result.length === 0) {
      return {
        content: [
          { type: "text", text: `Block not found: ${h}` },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              chain_length: result.length,
              chain: result,
            },
            null,
            2
          ),
        },
      ],
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
      "This is the powerful one — it shows the complete story: " +
      "bread ← baking ← dough ← flour ← wheat ← farm ← certification. " +
      "Use this to trace where a product came from, who was involved, and what certifications exist.",
    inputSchema: {
      hash: z
        .string()
        .describe("The hash of the block to build the provenance tree from"),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum tree depth (default 10). Keep low for readability."),
    },
  },
  async ({ hash: h, max_depth }) => {
    const result = await tree(h, resolve, { maxDepth: max_depth || 10 });

    if (!result) {
      return {
        content: [
          { type: "text", text: `Block not found: ${h}` },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
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
      "Heads represent the current state of everything in the system. " +
      "Optionally filter by type.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe("Optional type filter (e.g. 'substance.product' to see all current products)"),
    },
  },
  async ({ type }) => {
    let headBlocks = [...heads.keys()]
      .map((h) => store.get(h))
      .filter(Boolean);

    if (type) {
      headBlocks = headBlocks.filter(
        (b) => b.type === type || b.type.startsWith(type + ".")
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: headBlocks.length,
              blocks: headBlocks,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: foodblock_info ────────────────────────────────────────────────

server.registerTool(
  "foodblock_info",
  {
    title: "FoodBlock System Info",
    description:
      "Get an overview of the FoodBlock system: total blocks, types breakdown, and protocol summary. " +
      "Call this first to understand what data is available.",
    inputSchema: {},
  },
  async () => {
    const typeCounts = {};
    for (const [t, hashes] of byType.entries()) {
      typeCounts[t] = hashes.length;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              name: "FoodBlock Protocol",
              version: "0.1.0",
              description:
                "A content-addressable primitive for universal food data. " +
                "Three fields (type, state, refs), six base types (actor, place, substance, transform, transfer, observe). " +
                "Currently loaded with a bakery supply chain dataset.",
              total_blocks: store.size,
              head_blocks: heads.size,
              types: typeCounts,
              base_types: {
                entities: ["actor — person or organisation", "place — physical location", "substance — ingredient, product, or material"],
                actions: ["transform — changing one thing into another (cooking, processing)", "transfer — moving between actors (sale, delivery)", "observe — making a statement (review, certification)"],
              },
              tips: [
                "Use foodblock_query with type='actor' to see all actors in the system",
                "Use foodblock_tree on a product hash to trace its full provenance",
                "Use foodblock_chain on any block to see its version history",
                "Use foodblock_create to add new blocks to the system",
                "Use foodblock_list_agents to see AI agents in the system",
                "Use foodblock_create_agent to register yourself as an agent and start acting autonomously",
                "Use foodblock_agent_draft to create actions that need human approval",
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
      "Register a new AI agent as an actor in the FoodBlock system. " +
      "The agent gets its own identity (hash), Ed25519 keypair, and can sign blocks. " +
      "Every agent must have an operator — the human or business it acts on behalf of. " +
      "Find the operator's hash first using foodblock_query with type='actor'.",
    inputSchema: {
      name: z.string().describe("Human-readable name for the agent, e.g. 'Bakery Assistant'"),
      operator_hash: z
        .string()
        .describe("Hash of the actor (person/business) this agent works for. Required."),
      model: z
        .string()
        .optional()
        .describe("AI model powering the agent, e.g. 'claude-sonnet'"),
      capabilities: z
        .array(z.string())
        .optional()
        .describe("List of agent capabilities, e.g. ['inventory', 'ordering', 'surplus']"),
    },
  },
  async ({ name, operator_hash, model, capabilities }) => {
    // Verify operator exists
    const operator = store.get(operator_hash);
    if (!operator) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Operator ${operator_hash} not found. The agent needs a valid operator (an existing actor block).`,
          },
        ],
      };
    }

    const opts = {};
    if (model) opts.model = model;
    if (capabilities) opts.capabilities = capabilities;

    const agent = createAgent(name, operator_hash, opts);

    // Store the agent block
    insertBlock(agent.block);

    // Register agent credentials for signing
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
              block: agent.block,
              operator: { hash: operator_hash, name: operator.state.name, type: operator.type },
              public_key: agent.keypair.publicKey,
              message: `Agent "${name}" created and registered. Use agent_hash ${agent.authorHash} to create drafts and sign blocks.`,
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
      "Create a draft FoodBlock on behalf of an agent. Draft blocks have state.draft=true " +
      "and refs.agent pointing to the agent. The human operator can approve or reject. " +
      "Use this when an agent wants to take an action (place an order, list surplus, update price) " +
      "that should be reviewed by a human first.",
    inputSchema: {
      agent_hash: z
        .string()
        .describe("Hash of the agent creating this draft. Must be a registered agent."),
      type: z.string().describe("Block type, e.g. 'transfer.order', 'substance.surplus'"),
      state: z
        .record(z.any())
        .optional()
        .default({})
        .describe("Block state. draft:true is added automatically."),
      refs: z
        .record(z.any())
        .optional()
        .default({})
        .describe("Block refs. agent ref is added automatically."),
    },
  },
  async ({ agent_hash, type, state, refs }) => {
    const agentData = agents.get(agent_hash);
    if (!agentData) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Agent ${agent_hash} not registered. Create an agent first with foodblock_create_agent.`,
          },
        ],
      };
    }

    const draftState = { ...(state || {}), draft: true };
    const draftRefs = { ...(refs || {}), agent: agent_hash };
    const block = create(type, draftState, draftRefs);

    // Sign the block
    const signed = agentData.sign(block);

    insertBlock(block);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              draft: block,
              signed_by: agent_hash,
              signature: signed.signature.slice(0, 32) + "...",
              message: `Draft created. Operator can approve with foodblock_approve_draft using hash ${block.hash}`,
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
      "Approve a draft block created by an agent. This creates a confirmed version " +
      "with draft removed and refs.updates pointing back to the draft. " +
      "The approved block records which agent originally created it.",
    inputSchema: {
      draft_hash: z
        .string()
        .describe("Hash of the draft block to approve"),
    },
  },
  async ({ draft_hash }) => {
    const draft = store.get(draft_hash);
    if (!draft) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Draft block ${draft_hash} not found.`,
          },
        ],
      };
    }

    if (!draft.state.draft) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Block ${draft_hash} is not a draft (no state.draft field).`,
          },
        ],
      };
    }

    const approved = approveDraft(draft);
    insertBlock(approved);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              approved: approved,
              original_draft: draft_hash,
              agent: draft.refs.agent,
              message: `Draft approved. New confirmed block: ${approved.hash}`,
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
    description:
      "List all AI agents in the FoodBlock system. Shows their identity, operator, and capabilities.",
    inputSchema: {},
  },
  async () => {
    // Find all actor.agent blocks
    const agentBlocks = [...store.values()].filter((b) => b.type === "actor.agent");

    const agentList = agentBlocks.map((b) => {
      const operator = b.refs.operator ? store.get(b.refs.operator) : null;
      const isRegistered = agents.has(b.hash);
      return {
        hash: b.hash,
        name: b.state.name,
        model: b.state.model || "unknown",
        capabilities: b.state.capabilities || [],
        operator: operator
          ? { hash: operator.hash, name: operator.state.name, type: operator.type }
          : { hash: b.refs.operator, name: "unknown" },
        can_sign: isRegistered,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: agentList.length,
              agents: agentList,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Start ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FoodBlock MCP Server running on stdio");
  console.error(`Loaded ${store.size} blocks (bakery supply chain)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
