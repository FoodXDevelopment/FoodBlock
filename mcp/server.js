#!/usr/bin/env node

/**
 * FoodBlock MCP Server
 *
 * Exposes the FoodBlock protocol to any MCP-compatible AI agent.
 *
 * Modes:
 *   Standalone — no env vars needed, runs with embedded in-memory store + 47 seed blocks
 *   Connected  — set FOODBLOCK_URL to connect to a live FoodBlock server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { createStore } from "./store.js";

// Fallback for bundled environments (e.g. Smithery) where import.meta.url is undefined
const require = createRequire(import.meta.url || `file://${process.cwd()}/`);

// Load FoodBlock SDK (CommonJS)
const { create, update, chain, tree, canonical, createAgent, loadAgent, approveDraft, generateKeypair, sign, verify, tombstone, validate, offlineQueue, explain } = require("@foodxdev/foodblock");

const API_URL = process.env.FOODBLOCK_URL || null;
const db = createStore(API_URL);

// ── Agent key encryption (AES-256-GCM envelope) ────────────────────────
// Set AGENT_MASTER_KEY env var to encrypt private keys at rest.
// Without it, keys are returned in plaintext (dev/standalone mode).

const ENCRYPTED_PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;
const DEK_LEN = 32;

let _masterKey;
function getMasterKey() {
  if (_masterKey === undefined) {
    const raw = process.env.AGENT_MASTER_KEY;
    _masterKey = raw ? scryptSync(raw, 'foodblock-agent-key-v1', 32) : null;
  }
  return _masterKey;
}

function encryptKey(plaintext) {
  const mk = getMasterKey();
  if (!mk) return plaintext;
  const buf = Buffer.from(plaintext, 'utf8');
  const dek = randomBytes(DEK_LEN);
  const dataIv = randomBytes(IV_LEN);
  const dc = createCipheriv('aes-256-gcm', dek, dataIv);
  const encData = Buffer.concat([dc.update(buf), dc.final()]);
  const dataTag = dc.getAuthTag();
  const dekIv = randomBytes(IV_LEN);
  const kc = createCipheriv('aes-256-gcm', mk, dekIv);
  const encDek = Buffer.concat([kc.update(dek), kc.final()]);
  const dekTag = kc.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([dekIv, encDek, dekTag, dataIv, encData, dataTag]).toString('base64');
}

function decryptKey(stored) {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  const mk = getMasterKey();
  if (!mk) throw new Error('AGENT_MASTER_KEY required to decrypt agent keys');
  const packed = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');
  let o = 0;
  const dekIv = packed.subarray(o, o += IV_LEN);
  const encDek = packed.subarray(o, o += DEK_LEN);
  const dekTag = packed.subarray(o, o += TAG_LEN);
  const dataIv = packed.subarray(o, o += IV_LEN);
  const dataTag = packed.subarray(packed.length - TAG_LEN);
  const encData = packed.subarray(o, packed.length - TAG_LEN);
  const kd = createDecipheriv('aes-256-gcm', mk, dekIv);
  kd.setAuthTag(dekTag);
  const dek = Buffer.concat([kd.update(encDek), kd.final()]);
  const dd = createDecipheriv('aes-256-gcm', dek, dataIv);
  dd.setAuthTag(dataTag);
  return Buffer.concat([dd.update(encData), dd.final()]).toString('utf8');
}

// Agent registry — maps agent hash to { keypair, operatorHash, sign }
const agents = new Map();

// Tool handler wrapper — catches errors and returns them as MCP error content
function toolHandler(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  };
}

// ── MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "foodblock",
  version: "0.5.0",
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
  toolHandler(async ({ type, state, refs }) => {
    const result = await db.createBlock(type, state, refs);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
);

// ── Tool: foodblock_update ──────────────────────────────────────────────

server.registerTool(
  "foodblock_update",
  {
    title: "Update FoodBlock",
    description:
      "Create a new version of an existing FoodBlock. FoodBlocks are append-only — " +
      "this creates a new block that references the previous one via refs.updates. " +
      "Note: state is a FULL REPLACEMENT, not a merge.",
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
  toolHandler(async ({ previous_hash, type, state, refs }) => {
    const mergedRefs = { ...(refs || {}), updates: previous_hash };
    const result = await db.createBlock(type, state, mergedRefs);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async ({ hash: h }) => {
    const result = await db.getBlock(h);
    if (!result) throw new Error(`Block not found: ${h}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async ({ type, ref_role, ref_value, heads_only, limit }) => {
    const result = await db.queryBlocks({ type, ref_role, ref_value, heads_only, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async ({ hash: h, max_depth }) => {
    const result = await db.getChain(h, max_depth || 50);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async ({ hash: h, max_depth }) => {
    const result = await tree(h, db.resolve, { maxDepth: max_depth || 10 });
    if (!result) {
      return {
        content: [{ type: "text", text: `Block not found: ${h}` }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async ({ type }) => {
    const result = await db.getHeads(type);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
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
  toolHandler(async () => {
    const info = await db.getInfo();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              server: info || {},
              mode: API_URL ? `connected → ${API_URL}` : "standalone",
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
                "Use foodblock_load_agent to restore a previously created agent",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_create_agent (Fix #8: returns credentials) ──────────

server.registerTool(
  "foodblock_create_agent",
  {
    title: "Create AI Agent",
    description:
      "Register a new AI agent in the FoodBlock system. " +
      "The agent gets its own identity, Ed25519 keypair, and can sign blocks. " +
      "Every agent must have an operator — the human or business it acts for. " +
      "IMPORTANT: Save the returned credentials — they cannot be recovered after server restart.",
    inputSchema: {
      name: z.string().describe("Name for the agent, e.g. 'Bakery Assistant'"),
      operator_hash: z.string().describe("Hash of the actor this agent works for"),
      model: z.string().optional().describe("AI model, e.g. 'claude-sonnet'"),
      capabilities: z.array(z.string()).optional().describe("Agent capabilities"),
    },
  },
  toolHandler(async ({ name, operator_hash, model, capabilities }) => {
    const opts = {};
    if (model) opts.model = model;
    if (capabilities) opts.capabilities = capabilities;

    const agent = createAgent(name, operator_hash, opts);

    // Store the agent block
    const result = await db.createBlock(agent.block.type, agent.block.state, agent.block.refs);

    // Register agent credentials locally for signing
    agents.set(agent.authorHash, {
      keypair: agent.keypair,
      operatorHash: operator_hash,
      sign: agent.sign,
      block: agent.block,
    });

    const encrypted = getMasterKey() !== null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agent_hash: agent.authorHash,
              block: result,
              credentials: {
                public_key: agent.keypair.publicKey,
                private_key: encryptKey(agent.keypair.privateKey),
                encrypted,
              },
              message: encrypted
                ? `Agent "${name}" created. Private key is encrypted with AGENT_MASTER_KEY. SAVE THE CREDENTIALS.`
                : `Agent "${name}" created. Set AGENT_MASTER_KEY to encrypt credentials. SAVE THE CREDENTIALS.`,
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_load_agent (Fix #8: agent persistence) ──────────────

server.registerTool(
  "foodblock_load_agent",
  {
    title: "Load Agent",
    description:
      "Load a previously created agent using saved credentials. " +
      "Required after MCP server restart to restore signing ability.",
    inputSchema: {
      agent_hash: z.string().describe("The agent's block hash (from foodblock_create_agent)"),
      private_key: z.string().describe("The agent's private key hex (from foodblock_create_agent credentials)"),
      public_key: z.string().optional().describe("The agent's public key hex (optional, for verification)"),
    },
  },
  toolHandler(async ({ agent_hash, private_key, public_key }) => {
    const decryptedKey = decryptKey(private_key);
    const keypair = { privateKey: decryptedKey, publicKey: public_key || "" };
    const loaded = loadAgent(agent_hash, keypair);

    agents.set(agent_hash, {
      keypair,
      sign: loaded.sign,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agent_hash,
              loaded: true,
              message: `Agent ${agent_hash.slice(0, 16)}... loaded and ready to sign blocks.`,
            },
            null,
            2
          ),
        },
      ],
    };
  })
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
  toolHandler(async ({ agent_hash, type, state, refs }) => {
    const agentData = agents.get(agent_hash);
    if (!agentData) {
      return {
        content: [
          { type: "text", text: `Error: Agent ${agent_hash} not registered. Use foodblock_create_agent or foodblock_load_agent first.` },
        ],
      };
    }

    const draftState = { ...(state || {}), draft: true };
    const draftRefs = { ...(refs || {}), agent: agent_hash };
    const block = create(type, draftState, draftRefs);
    const signed = agentData.sign(block);

    // Store the draft block
    await db.createBlock(block.type, block.state, block.refs);

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
  })
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
  toolHandler(async ({ draft_hash }) => {
    const draft = await db.getBlock(draft_hash);
    if (!draft) {
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

    // Store the approved block
    const result = await db.createBlock(approved.type, approved.state, approved.refs);

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
  })
);

// ── Tool: foodblock_list_agents ─────────────────────────────────────

server.registerTool(
  "foodblock_list_agents",
  {
    title: "List Agents",
    description: "List all AI agents in the FoodBlock system.",
    inputSchema: {},
  },
  toolHandler(async () => {
    const result = await db.queryBlocks({ type: "actor.agent", limit: 100 });
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
  })
);

// ── Tool: foodblock_tombstone ────────────────────────────────────────────

server.registerTool(
  "foodblock_tombstone",
  {
    title: "Tombstone FoodBlock",
    description:
      "Mark a FoodBlock for content erasure (GDPR compliance). Creates an observe.tombstone " +
      "block that references the target. The target block's state is replaced with {tombstoned: true}. " +
      "The hash, type, and refs are preserved for chain integrity.",
    inputSchema: {
      target_hash: z
        .string()
        .describe("Hash of the block to tombstone (64-character hex string)"),
      requested_by: z
        .string()
        .describe("Hash of the actor requesting erasure"),
      reason: z
        .string()
        .optional()
        .default("erasure_request")
        .describe("Reason for erasure (e.g. 'gdpr_erasure', 'user_request')"),
    },
  },
  toolHandler(async ({ target_hash, requested_by, reason }) => {
    const result = await db.deleteBlock(target_hash, requested_by, reason);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { tombstone: result, target: target_hash, message: "Tombstone created. Target state erased." },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_validate ────────────────────────────────────────────

server.registerTool(
  "foodblock_validate",
  {
    title: "Validate FoodBlock",
    description:
      "Validate a FoodBlock against its declared schema or a provided schema. " +
      "Returns an array of error messages (empty means valid). " +
      "Checks required fields, types, expected refs, and instance_id requirements.",
    inputSchema: {
      type: z.string().describe("Block type to validate"),
      state: z
        .record(z.any())
        .optional()
        .default({})
        .describe("Block state to validate"),
      refs: z
        .record(z.any())
        .optional()
        .default({})
        .describe("Block refs to validate"),
    },
  },
  toolHandler(async ({ type, state, refs }) => {
    const block = { type, state: state || {}, refs: refs || {} };
    const errors = validate(block);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              valid: errors.length === 0,
              errors,
              block_type: type,
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_batch ───────────────────────────────────────────────

server.registerTool(
  "foodblock_batch",
  {
    title: "Batch Create FoodBlocks",
    description:
      "Create multiple FoodBlocks in a single request. Blocks are sorted in dependency order " +
      "automatically. Useful for syncing offline-created blocks or bulk imports. " +
      "Returns counts of inserted, skipped (duplicates), and failed blocks.",
    inputSchema: {
      blocks: z
        .array(
          z.object({
            type: z.string(),
            state: z.record(z.any()).optional().default({}),
            refs: z.record(z.any()).optional().default({}),
          })
        )
        .describe("Array of blocks to create, each with type, state, refs"),
    },
  },
  toolHandler(async ({ blocks }) => {
    const result = await db.batchCreate(blocks);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
);

// ── Tool: foodblock_fb ──────────────────────────────────────────────────

server.registerTool(
  "foodblock_fb",
  {
    title: "Natural Language FoodBlock",
    description:
      "The single natural language entry point to FoodBlock. Describe food in plain English " +
      "and get structured FoodBlocks back. No need to know types, fields, or hashes. " +
      "Examples: 'Sourdough bread, $4.50, organic, contains gluten', " +
      "'Amazing pizza at Luigi\\'s, 5 stars', 'Green Acres Farm, 200 acres, organic wheat in Oregon', " +
      "'Walk-in cooler temperature 4 celsius', 'Ordered 50kg flour from Stone Mill'.",
    inputSchema: {
      text: z
        .string()
        .describe("Any food-related natural language text"),
    },
  },
  toolHandler(async ({ text }) => {
    const result = await db.fbParse(text);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  })
);

// ── Tool: foodblock_discover ──────────────────────────────────────────────

server.registerTool(
  "foodblock_discover",
  {
    title: "Discover Agents",
    description:
      "Find AI agents by capability, type, or name. Returns matching agents " +
      "with their capabilities, operator, and signing status. " +
      "Examples: capability='transfer.order' finds agents that can handle orders, " +
      "capability='substance.*' finds agents dealing with ingredients/products.",
    inputSchema: {
      capability: z
        .string()
        .optional()
        .describe("Filter by capability (exact or wildcard). Example: 'transfer.order', 'substance.*'"),
      name: z
        .string()
        .optional()
        .describe("Filter by agent name (case-insensitive substring match)"),
      operator_hash: z
        .string()
        .optional()
        .describe("Filter by operator hash (find all agents for a specific business)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum results (default 20)"),
    },
  },
  toolHandler(async ({ capability, name, operator_hash, limit }) => {
    const result = await db.queryBlocks({ type: "actor.agent", limit: limit || 100 });
    let agentBlocks = result.blocks || [];

    // Filter by capability
    if (capability) {
      agentBlocks = agentBlocks.filter((b) => {
        const caps = b.state.capabilities || [];
        return caps.some((c) => {
          if (c === '*') return true;
          if (c === capability) return true;
          if (c.endsWith('.*') && capability.startsWith(c.slice(0, -1))) return true;
          if (capability.endsWith('.*') && c.startsWith(capability.slice(0, -1))) return true;
          return false;
        });
      });
    }

    // Filter by name
    if (name) {
      const lower = name.toLowerCase();
      agentBlocks = agentBlocks.filter((b) =>
        b.state.name && b.state.name.toLowerCase().includes(lower)
      );
    }

    // Filter by operator
    if (operator_hash) {
      agentBlocks = agentBlocks.filter((b) =>
        b.refs && b.refs.operator === operator_hash
      );
    }

    const agentList = agentBlocks.slice(0, limit || 20).map((b) => ({
      hash: b.hash,
      name: b.state.name,
      model: b.state.model || "unknown",
      capabilities: b.state.capabilities || [],
      operator: b.refs?.operator,
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
  })
);

// ── Tool: foodblock_negotiate ────────────────────────────────────────────

server.registerTool(
  "foodblock_negotiate",
  {
    title: "Negotiate Order",
    description:
      "Complete agent-to-agent negotiation in one call: intent → offer → accept → order. " +
      "Creates the full chain of blocks: observe.intent, observe.offer, and transfer.order. " +
      "Both buyer and seller agents must exist in the system.",
    inputSchema: {
      buyer_hash: z
        .string()
        .describe("Hash of the buying agent or actor"),
      seller_hash: z
        .string()
        .describe("Hash of the selling agent or actor"),
      product_name: z
        .string()
        .describe("Name of the product being ordered"),
      quantity: z
        .number()
        .optional()
        .default(1)
        .describe("Quantity to order (default 1)"),
      price: z
        .number()
        .describe("Price per unit"),
      currency: z
        .string()
        .optional()
        .default("gbp")
        .describe("Currency code (default 'gbp')"),
      product_hash: z
        .string()
        .optional()
        .describe("Optional hash of the substance.product block"),
    },
  },
  toolHandler(async ({ buyer_hash, seller_hash, product_name, quantity, price, currency, product_hash }) => {
    const total = (quantity || 1) * price;

    // Step 1: Create observe.intent
    const intentBlock = await db.createBlock("observe.intent", {
      product_name,
      quantity: quantity || 1,
      max_price: price,
      currency: currency || "gbp",
      status: "seeking"
    }, {
      buyer: buyer_hash,
      supplier: seller_hash,
      ...(product_hash ? { product: product_hash } : {})
    });

    // Step 2: Create observe.offer
    const offerBlock = await db.createBlock("observe.offer", {
      product_name,
      quantity: quantity || 1,
      price,
      currency: currency || "gbp",
      status: "offered"
    }, {
      intent: intentBlock.hash,
      buyer: buyer_hash,
      seller: seller_hash,
      ...(product_hash ? { product: product_hash } : {})
    });

    // Step 3: Create transfer.order (accept the offer)
    const orderBlock = await db.createBlock("transfer.order", {
      amount: total,
      currency: currency || "gbp",
      items: [{
        name: product_name,
        quantity: quantity || 1,
        price
      }],
      status: "order"
    }, {
      buyer: buyer_hash,
      seller: seller_hash,
      offer: offerBlock.hash,
      intent: intentBlock.hash,
      ...(product_hash ? { product: product_hash } : {})
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              negotiation: "complete",
              intent: { hash: intentBlock.hash, type: "observe.intent" },
              offer: { hash: offerBlock.hash, type: "observe.offer" },
              order: { hash: orderBlock.hash, type: "transfer.order", amount: total, currency: currency || "gbp" },
              message: `Negotiation complete: ${product_name} x${quantity || 1} @ ${price} ${currency || "gbp"} = ${total} ${currency || "gbp"}`,
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_trace ────────────────────────────────────────────────

server.registerTool(
  "foodblock_trace",
  {
    title: "Trace Provenance (Narrative)",
    description:
      "Generate a human-readable provenance narrative for a FoodBlock. " +
      "Walks the full graph and tells the story: who made it, where it came from, " +
      "what certifications it has, and how it got here. " +
      "Returns plain English, not JSON — ideal for explaining provenance to end users.",
    inputSchema: {
      hash: z
        .string()
        .describe("Hash of the block to trace"),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum depth to trace (default 10)"),
    },
  },
  toolHandler(async ({ hash: h, max_depth }) => {
    const narrative = await explain(h, db.resolve, { maxDepth: max_depth || 10 });

    // Also get the tree for structured data
    const treeData = await tree(h, db.resolve, { maxDepth: max_depth || 10 });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              narrative,
              block_hash: h,
              tree_depth: treeData ? countTreeDepth(treeData) : 0,
              tree: treeData || null,
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

function countTreeDepth(node, depth = 0) {
  if (!node || !node.children || !node.children.length) return depth;
  return Math.max(...node.children.map((c) => countTreeDepth(c, depth + 1)));
}

// ── Smithery compatibility ────────────────────────────────────────────────

export function createSandboxServer() {
  return server;
}

// ── Start ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = API_URL ? `connected → ${API_URL}` : "standalone (embedded store)";
  console.error(`FoodBlock MCP Server v0.5.0 running on stdio`);
  console.error(`Mode: ${mode}`);
}

// Only start stdio transport when run directly (not imported by Smithery scanner)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].includes('foodblock-mcp')
);

if (isDirectRun) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
