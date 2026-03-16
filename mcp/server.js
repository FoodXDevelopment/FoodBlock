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
const { create, update, chain, tree, canonical, createAgent, loadAgent, approveDraft, createAuthorization, checkAuthorization, generateKeypair, sign, verify, tombstone, validate, offlineQueue, explain, format } = require("@foodxdev/foodblock");

const API_URL = process.env.FOODBLOCK_URL || null;
const db = createStore(API_URL);

// ── TID (Transaction ID) ─────────────────────────────────────────────────
// 13-char sortable base32 identifier. Top 53 bits = ms timestamp << 10,
// bottom 10 bits = random clock ID. Matches the Backend's tid() export.

const TID_CHARSET = '234567abcdefghijklmnopqrstuvwxyz';
function tid() {
  const ms = BigInt(Date.now());
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  let n = (ms << 10n) | clockId;
  let result = '';
  for (let i = 0; i < 13; i++) {
    result = TID_CHARSET[Number(n & 31n)] + result;
    n >>= 5n;
  }
  return result;
}

// ── Short hash resolution ────────────────────────────────────────────────
// Accept 8+ char hash prefixes anywhere a full hash is expected.

async function resolveHash(input) {
  if (!input || typeof input !== 'string') return input;
  if (input.length === 64) return input;
  return db.resolveShortHash(input);
}

// ── FBN response format ──────────────────────────────────────────────────
// Convert blocks to FoodBlock Notation with auto-generated short aliases.

function blocksToFbn(blocks) {
  if (!blocks || blocks.length === 0) return { fbn: '', aliases: {} };
  const aliasMap = {};
  for (const b of blocks) {
    if (b && b.hash) aliasMap[b.hash] = b.hash.slice(0, 8);
  }
  const lines = blocks
    .filter(b => b && b.hash)
    .map(b => format(b, { aliasMap, alias: aliasMap[b.hash] }));
  return { fbn: lines.join('\n'), aliases: aliasMap };
}

// ── Resolved refs ────────────────────────────────────────────────────────
// Inline type + name for each ref so agents don't need follow-up fetches.

async function resolveRefs(block) {
  if (!block || !block.refs) return {};
  const resolved = {};
  for (const [role, ref] of Object.entries(block.refs)) {
    if (role === 'updates') continue;
    const hashes = Array.isArray(ref) ? ref : [ref];
    const resolvedArr = await Promise.all(hashes.map(async (h) => {
      const b = await db.getBlock(h);
      if (!b) return { hash: h.slice(0, 8), missing: true };
      const entry = { hash: h.slice(0, 8), type: b.type };
      const name = b.state?.name || b.state?.product_name;
      if (name) entry.name = name;
      return entry;
    }));
    resolved[role] = Array.isArray(ref) ? resolvedArr : resolvedArr[0];
  }
  return resolved;
}

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
  version: "0.5.3",
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
      agent_hash: z
        .string()
        .optional()
        .describe(
          "If provided, enforces authorization: checks that a valid transfer.authorization block " +
          "exists for this agent permitting the given block type. Rejects with UNAUTHORIZED if not."
        ),
      value: z
        .number()
        .optional()
        .describe("Transaction value for authorization limit checking (used with agent_hash)."),
    },
  },
  toolHandler(async ({ type, state, refs, agent_hash, value }) => {
    if (agent_hash) {
      agent_hash = await resolveHash(agent_hash);
      const authResult = await db.queryBlocks({ type: "transfer.authorization", ref_role: "agent", ref_value: agent_hash, heads_only: true, limit: 1 });
      const active = (authResult.blocks || []).find(b => Array.isArray(b.state?.scope) && b.state.scope.length > 0);
      if (!active) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "UNAUTHORIZED", message: "No active transfer.authorization found for this agent." }) }] };
      }
      const check = checkAuthorization(active, type, value);
      if (!check.authorized) {
        return { content: [{ type: "text", text: JSON.stringify({ error: check.reason, message: `Agent not authorized to create ${type}.` }) }] };
      }
    }
    const result = await db.createBlock(type, state, refs);
    const block = result.exists ? result.block : result;
    const resolved_refs = await resolveRefs(block);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...block, resolved_refs }) }],
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
        .describe("Block hash to update (full 64-char or short prefix)"),
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
    previous_hash = await resolveHash(previous_hash);
    const mergedRefs = { ...(refs || {}), updates: previous_hash };
    const result = await db.createBlock(type, state, mergedRefs);
    const block = result.exists ? result.block : result;
    const resolved_refs = await resolveRefs(block);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...block, resolved_refs }) }],
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
        .describe("Block hash (full 64-char or short prefix, e.g. 'a1b2c3d4')"),
    },
  },
  toolHandler(async ({ hash: h }) => {
    h = await resolveHash(h);
    const result = await db.getBlock(h);
    if (!result) throw new Error(`Block not found: ${h}`);
    const resolved_refs = await resolveRefs(result);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, resolved_refs }) }],
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
        .describe("Filter by ref value (block hash, full or short prefix). Use with ref_role."),
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
    if (ref_value) ref_value = await resolveHash(ref_value);
    const result = await db.queryBlocks({ type, ref_role, ref_value, heads_only, limit });
    const { fbn, aliases } = blocksToFbn(result.blocks || []);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, fbn, aliases }) }],
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
        .describe("Block hash to trace (full or short prefix)"),
      max_depth: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum chain depth to traverse (default 50)"),
    },
  },
  toolHandler(async ({ hash: h, max_depth }) => {
    h = await resolveHash(h);
    const result = await db.getChain(h, max_depth || 50);
    const { fbn, aliases } = blocksToFbn(result.chain || []);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, fbn, aliases }) }],
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
        .describe("Block hash (full or short prefix)"),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum tree depth (default 10)"),
    },
  },
  toolHandler(async ({ hash: h, max_depth }) => {
    h = await resolveHash(h);
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
    const { fbn, aliases } = blocksToFbn(result.blocks || []);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, fbn, aliases }) }],
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
      agent_hash: z.string().describe("Agent block hash (full or short prefix)"),
      private_key: z.string().describe("The agent's private key hex (from foodblock_create_agent credentials)"),
      public_key: z.string().optional().describe("The agent's public key hex (optional, for verification)"),
    },
  },
  toolHandler(async ({ agent_hash, private_key, public_key }) => {
    agent_hash = await resolveHash(agent_hash);
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
      agent_hash: z.string().describe("Agent hash (full or short prefix)"),
      type: z.string().describe("Block type, e.g. 'transfer.order'"),
      state: z.record(z.any()).optional().default({}).describe("Block state"),
      refs: z.record(z.any()).optional().default({}).describe("Block refs"),
    },
  },
  toolHandler(async ({ agent_hash, type, state, refs }) => {
    agent_hash = await resolveHash(agent_hash);
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
      draft_hash: z.string().describe("Draft block hash (full or short prefix)"),
    },
  },
  toolHandler(async ({ draft_hash }) => {
    draft_hash = await resolveHash(draft_hash);
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

// ── Tool: foodblock_create_authorization ────────────────────────────────

server.registerTool(
  "foodblock_create_authorization",
  {
    title: "Create Agent Authorization",
    description:
      "Grant an agent bounded write authority by creating a transfer.authorization block. " +
      "Signed by the operator (not the agent). The agent cannot self-authorize. " +
      "Scope supports wildcards: 'transfer.*' permits all transfer subtypes. " +
      "approval_mode controls whether the agent acts directly ('auto'), creates drafts ('draft'), or asks first ('ask').",
    inputSchema: {
      agent_hash: z.string().describe("Hash of the actor.agent block being authorized"),
      scope: z.array(z.string()).describe("Permitted block types, e.g. ['transfer.order', 'observe.post', 'substance.*']"),
      approval_mode: z.enum(["auto", "draft", "ask"]).default("draft").describe("How the agent acts: auto=direct, draft=needs approval, ask=proposes first"),
      max_per_transaction: z.number().optional().describe("Maximum value per single transaction"),
      max_per_period: z.number().optional().describe("Maximum total value within the period window"),
      period: z.string().optional().describe("Time window for max_per_period, e.g. '7d', '24h', '30d'"),
      expires: z.string().optional().describe("ISO 8601 expiry datetime for this authorization"),
      currency: z.string().optional().describe("ISO 4217 currency code for monetary limits, e.g. 'GBP'"),
    },
  },
  toolHandler(async ({ agent_hash, scope, approval_mode, max_per_transaction, max_per_period, period, expires, currency }) => {
    agent_hash = await resolveHash(agent_hash);

    const authBlock = createAuthorization(agent_hash, scope, {
      approvalMode: approval_mode,
      maxPerTransaction: max_per_transaction,
      maxPerPeriod: max_per_period,
      period,
      expires,
      currency,
    });

    const result = await db.createBlock(authBlock.type, authBlock.state, authBlock.refs);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              authorization: result,
              message: `Agent ${agent_hash} authorized with scope [${scope.join(", ")}] in ${approval_mode} mode.`,
            },
            null,
            2
          ),
        },
      ],
    };
  })
);

// ── Tool: foodblock_check_authorization ─────────────────────────────────

server.registerTool(
  "foodblock_check_authorization",
  {
    title: "Check Agent Authorization",
    description:
      "Check whether an agent is currently authorized to create a block of a given type and value. " +
      "Returns authorized status, approval mode, and reason if denied.",
    inputSchema: {
      agent_hash: z.string().describe("Hash of the actor.agent block to check"),
      block_type: z.string().describe("Block type the agent wants to create, e.g. 'transfer.order'"),
      value: z.number().optional().describe("Transaction value to check against max_per_transaction limit"),
    },
  },
  toolHandler(async ({ agent_hash, block_type, value }) => {
    agent_hash = await resolveHash(agent_hash);

    // Query only the current head authorization for this agent — avoids scanning all auth blocks
    const result = await db.queryBlocks({ type: "transfer.authorization", ref_role: "agent", ref_value: agent_hash, heads_only: true, limit: 1 });
    const active = (result.blocks || []).find(b => Array.isArray(b.state?.scope) && b.state.scope.length > 0);

    if (!active) {
      return {
        content: [{ type: "text", text: JSON.stringify({ authorized: false, reason: "UNAUTHORIZED", message: "No active transfer.authorization found for this agent." }, null, 2) }],
      };
    }

    const check = checkAuthorization(active, block_type, value);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...check,
              authorization_hash: active.hash,
              scope: active.state?.scope,
              approval_mode: active.state?.approval_mode,
            },
            null,
            2
          ),
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
        .describe("Block hash to tombstone (full or short prefix)"),
      requested_by: z
        .string()
        .describe("Actor hash requesting erasure (full or short prefix)"),
      reason: z
        .string()
        .optional()
        .default("erasure_request")
        .describe("Reason for erasure (e.g. 'gdpr_erasure', 'user_request')"),
    },
  },
  toolHandler(async ({ target_hash, requested_by, reason }) => {
    target_hash = await resolveHash(target_hash);
    requested_by = await resolveHash(requested_by);
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
    const { fbn, aliases } = blocksToFbn(result.blocks || []);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, fbn, aliases }) }],
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
        .describe("Filter by operator hash (full or short prefix)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum results (default 20)"),
    },
  },
  toolHandler(async ({ capability, name, operator_hash, limit }) => {
    if (operator_hash) operator_hash = await resolveHash(operator_hash);
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
        .describe("Buyer hash (full or short prefix)"),
      seller_hash: z
        .string()
        .describe("Seller hash (full or short prefix)"),
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
        .describe("Optional product block hash (full or short prefix)"),
      mandate_hash: z
        .string()
        .optional()
        .describe("Optional observe.mandate hash authorising this negotiation. When provided, the transfer.order refs.mandate points to it — making the order non-repudiable."),
    },
  },
  toolHandler(async ({ buyer_hash, seller_hash, product_name, quantity, price, currency, product_hash, mandate_hash }) => {
    buyer_hash = await resolveHash(buyer_hash);
    seller_hash = await resolveHash(seller_hash);
    if (product_hash)  product_hash  = await resolveHash(product_hash);
    if (mandate_hash)  mandate_hash  = await resolveHash(mandate_hash);
    const total = (quantity || 1) * price;
    const cur = currency || "gbp";
    const qty = quantity || 1;

    // Mint a single TID to thread all three blocks as one negotiation session.
    // refs.transaction on every block lets any party replay the full conversation
    // by querying for this TID without needing the individual block hashes.
    const transactionId = tid();
    const productRef = product_hash ? { product: product_hash } : {};

    // Step 1: observe.intent — buyer signals demand
    const intentBlock = await db.createBlock("observe.intent", {
      product_name,
      quantity: qty,
      max_price: price,
      currency: cur,
      status: "seeking",
    }, {
      buyer: buyer_hash,
      supplier: seller_hash,
      transaction: transactionId,
      ...productRef,
    });

    // Step 2: observe.offer — seller responds with price + terms
    const offerBlock = await db.createBlock("observe.offer", {
      product_name,
      quantity: qty,
      price,
      currency: cur,
      status: "offered",
    }, {
      intent: intentBlock.hash,
      buyer: buyer_hash,
      seller: seller_hash,
      transaction: transactionId,
      ...productRef,
    });

    // Step 3: transfer.order — buyer accepts the offer.
    // refs.mandate links to the human-signed authorisation (if provided),
    // making this order non-repudiable — traceable back to an explicit human decision.
    const orderBlock = await db.createBlock("transfer.order", {
      amount: total,
      currency: cur,
      items: [{ name: product_name, quantity: qty, price }],
      status: "order",
    }, {
      buyer: buyer_hash,
      seller: seller_hash,
      offer: offerBlock.hash,
      intent: intentBlock.hash,
      transaction: transactionId,
      ...(mandate_hash ? { mandate: mandate_hash } : {}),
      ...productRef,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              negotiation: "complete",
              transaction_id: transactionId,
              intent: { hash: intentBlock.hash, type: "observe.intent" },
              offer: { hash: offerBlock.hash, type: "observe.offer" },
              order: { hash: orderBlock.hash, type: "transfer.order", amount: total, currency: cur },
              message: `Negotiation complete: ${product_name} x${qty} @ ${price} ${cur} = ${total} ${cur}. Transaction: ${transactionId}`,
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
        .describe("Block hash to trace (full or short prefix)"),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum depth to trace (default 10)"),
    },
  },
  toolHandler(async ({ hash: h, max_depth }) => {
    h = await resolveHash(h);
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
  if (!node || !node.ancestors) return depth;
  const vals = Object.values(node.ancestors);
  if (vals.length === 0) return depth;
  return Math.max(...vals.map((v) => {
    const nodes = Array.isArray(v) ? v : [v];
    return Math.max(...nodes.map((n) => countTreeDepth(n, depth + 1)));
  }));
}

// ── Tool: foodblock_understand ──────────────────────────────────────────

server.registerTool(
  "foodblock_understand",
  {
    title: "Understand FoodBlock",
    description:
      "The single tool for AI agents to fully understand a FoodBlock. " +
      "Returns narrative (plain English), FBN notation (compact), resolved refs, " +
      "version count, and provenance depth — all in one call. " +
      "Replaces separate get + chain + tree + trace calls.",
    inputSchema: {
      hash: z.string().describe("Block hash (full or short prefix)"),
      depth: z
        .number()
        .optional()
        .default(3)
        .describe("Provenance depth (default 3)"),
    },
  },
  toolHandler(async ({ hash: h, depth }) => {
    const fullHash = await resolveHash(h);
    const block = await db.getBlock(fullHash);
    if (!block) throw new Error(`Block not found: ${h}`);

    const [narrative, treeData, chainData, refs] = await Promise.all([
      explain(fullHash, db.resolve, { maxDepth: depth || 3 }),
      tree(fullHash, db.resolve, { maxDepth: depth || 3 }),
      db.getChain(fullHash, 10),
      resolveRefs(block),
    ]);

    const allBlocks = [block];
    function collectBlocks(node) {
      if (!node || !node.ancestors) return;
      for (const val of Object.values(node.ancestors)) {
        const nodes = Array.isArray(val) ? val : [val];
        for (const n of nodes) {
          if (n && n.block) {
            allBlocks.push(n.block);
            collectBlocks(n);
          }
        }
      }
    }
    collectBlocks(treeData);

    const { fbn, aliases } = blocksToFbn(allBlocks);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          narrative,
          fbn,
          aliases,
          block: {
            hash: fullHash.slice(0, 8),
            type: block.type,
            state: block.state,
          },
          resolved_refs: refs,
          versions: chainData.length,
          provenance_depth: treeData ? countTreeDepth(treeData) : 0,
        }),
      }],
    };
  })
);

// ── Tool: foodblock_mandate ─────────────────────────────────────────────
// Human-signed authorisation for an agent to act.
// This is the AP2 Cart Mandate: the human explicitly approves a specific spend
// before their agent touches payment. Every downstream order/payment traces back
// to this block — making it non-repudiable and auditable.

server.registerTool(
  "foodblock_mandate",
  {
    title: "Create Mandate",
    description:
      "Create an observe.mandate block — the human-signed authorisation for an agent to act. " +
      "Inspired by AP2's Cart Mandate: the operator explicitly approves specific goods, " +
      "a maximum spend, and an expiry before their agent can commit to payment. " +
      "Every transfer.order or transfer.payment created under this mandate references it via refs.mandate. " +
      "The mandate is private (visibility: direct) — only the operator and agent see it. " +
      "IMPORTANT: This block must be created by the human operator, never by the agent itself.",
    inputSchema: {
      goods: z
        .array(z.object({
          name: z.string(),
          quantity: z.number().optional(),
          max_price: z.number().optional(),
        }))
        .describe("What the agent is authorised to buy. Example: [{ name: 'Sourdough', quantity: 2, max_price: 5.00 }]"),
      max_amount: z
        .number()
        .describe("Maximum total spend in the given currency"),
      currency: z
        .string()
        .default("gbp")
        .describe("Currency code (default 'gbp')"),
      expires_at: z
        .string()
        .describe("ISO 8601 expiry — mandate is void after this. Example: '2026-03-12T12:00:00Z'"),
      conditions: z
        .string()
        .optional()
        .describe("Optional human-readable conditions. Example: 'Only buy from verified organic sellers'"),
      agent_hash: z
        .string()
        .describe("Agent hash being authorised (full or short prefix)"),
      seller_hash: z
        .string()
        .optional()
        .describe("Optional: restrict mandate to a specific seller (full or short prefix)"),
    },
  },
  toolHandler(async ({ goods, max_amount, currency, expires_at, conditions, agent_hash, seller_hash }) => {
    agent_hash = await resolveHash(agent_hash);
    if (seller_hash) seller_hash = await resolveHash(seller_hash);

    const state = { goods, max_amount, currency, expires_at };
    if (conditions) state.conditions = conditions;

    const refs = { agent: agent_hash };
    if (seller_hash) refs.seller = seller_hash;

    const result = await db.createBlock("observe.mandate", state, refs);
    const block = result.exists ? result.block : result;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          mandate: block,
          message: `Mandate created. Agent ${agent_hash.slice(0, 8)} is authorised to spend up to ${max_amount} ${currency} until ${expires_at}. Pass refs.mandate: "${block.hash}" in any transfer.order or transfer.payment.`,
        }, null, 2),
      }],
    };
  })
);

// ── Tool: foodblock_close ───────────────────────────────────────────────
// Explicit negotiation termination — tbDEX-inspired Close.
// Marks a transaction thread as resolved so agents don't re-act on stale intents.

server.registerTool(
  "foodblock_close",
  {
    title: "Close Negotiation",
    description:
      "Create an observe.close block to explicitly terminate a negotiation thread. " +
      "Without this, intents and offers live forever in the graph with no clear resolution. " +
      "Inspired by tbDEX's Close message: any party in a transaction thread can call this " +
      "to signal the negotiation is done. " +
      "Reasons: 'fulfilled' (order completed), 'expired' (offer lapsed), " +
      "'rejected' (seller declined), 'cancelled' (buyer withdrew).",
    inputSchema: {
      transaction_id: z
        .string()
        .describe("The TID of the negotiation to close (from refs.transaction on intent/offer/order)"),
      reason: z
        .enum(["fulfilled", "expired", "rejected", "cancelled"])
        .describe("Why the negotiation is closing"),
      message: z
        .string()
        .optional()
        .describe("Optional human-readable note. Example: 'Out of stock until next Tuesday'"),
      order_hash: z
        .string()
        .optional()
        .describe("Hash of the transfer.order if reason is 'fulfilled' (full or short prefix)"),
      intent_hash: z
        .string()
        .optional()
        .describe("Hash of the observe.intent being closed (full or short prefix)"),
      offer_hash: z
        .string()
        .optional()
        .describe("Hash of the observe.offer being closed (full or short prefix)"),
    },
  },
  toolHandler(async ({ transaction_id, reason, message, order_hash, intent_hash, offer_hash }) => {
    if (order_hash)  order_hash  = await resolveHash(order_hash);
    if (intent_hash) intent_hash = await resolveHash(intent_hash);
    if (offer_hash)  offer_hash  = await resolveHash(offer_hash);

    const state = { reason };
    if (message) state.message = message;

    const refs = { transaction: transaction_id };
    if (order_hash)  refs.order  = order_hash;
    if (intent_hash) refs.intent = intent_hash;
    if (offer_hash)  refs.offer  = offer_hash;

    const result = await db.createBlock("observe.close", state, refs);
    const block = result.exists ? result.block : result;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          close: block,
          transaction_id,
          reason,
          message: `Negotiation ${transaction_id} closed as '${reason}'. Any agent polling refs.transaction="${transaction_id}" will stop acting.`,
        }, null, 2),
      }],
    };
  })
);

// ── Tool: foodblock_recent ──────────────────────────────────────────────
// Practical polling for agents: fetch blocks created since a timestamp or
// within the last N minutes. Covers the gap while agents can't hold open
// a persistent SSE connection via MCP stdio transport.

server.registerTool(
  "foodblock_recent",
  {
    title: "Recent FoodBlocks",
    description:
      "Fetch blocks created since a given timestamp (ISO 8601) or within the last N minutes. " +
      "Use this to poll for new activity without opening a persistent connection. " +
      "Combine with type/agent filters to watch for specific events. " +
      "Example: poll every 60s with since=<last_check_time> to act on new orders.",
    inputSchema: {
      since: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp — return blocks created after this. Example: '2026-03-11T12:00:00Z'"),
      minutes: z
        .number()
        .optional()
        .default(5)
        .describe("Lookback window in minutes if 'since' is not provided (default 5)"),
      type: z
        .string()
        .optional()
        .describe("Filter by block type or prefix. Example: 'transfer.order', 'observe.*'"),
      agent: z
        .string()
        .optional()
        .describe("Filter by refs.agent — returns blocks that mention this agent hash"),
      ref: z
        .string()
        .optional()
        .describe("Filter — return blocks where any ref value matches this hash"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum blocks to return (default 50)"),
    },
  },
  toolHandler(async ({ since, minutes, type, agent, ref, limit }) => {
    if (!API_URL) {
      return {
        content: [{ type: "text", text: "Error: foodblock_recent requires connected mode (set FOODBLOCK_URL)" }],
        isError: true,
      };
    }

    const params = new URLSearchParams();
    if (since) {
      params.set("since", since);
    } else {
      const ms = (minutes || 5) * 60 * 1000;
      params.set("since", new Date(Date.now() - ms).toISOString());
    }
    if (type)  params.set("type", type);
    if (agent) params.set("agent", agent);
    if (ref)   params.set("ref", ref);
    if (limit) params.set("limit", String(limit));

    const token = process.env.FOODBLOCK_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    let res;
    try {
      res = await fetch(`${API_URL}/?${params}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new Error(`FoodBlock API unreachable: ${err.message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FoodBlock API error ${res.status}: ${text}`);
    }

    const result = await res.json();
    const blocks = result.blocks || result.results || [];
    const { fbn, aliases } = blocksToFbn(blocks);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          count: blocks.length,
          since: params.get("since"),
          blocks,
          fbn,
          aliases,
          next_since: new Date().toISOString(),
        }),
      }],
    };
  })
);

// ── Smithery compatibility ────────────────────────────────────────────────

export function createSandboxServer() {
  return server;
}

// ── Start ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = API_URL ? `connected → ${API_URL}` : "standalone (embedded store)";
  console.error(`FoodBlock MCP Server v0.5.3 running on stdio`);
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
