/**
 * Store adapter for the FoodBlock MCP server.
 *
 * createStore(null)        → embedded in-memory store (standalone mode, 47 seed blocks)
 * createStore("http://…")  → HTTP client (connected mode, existing behavior)
 */

import { createRequire } from "node:module";
// Fallback for bundled environments (e.g. Smithery) where import.meta.url is undefined
const require = createRequire(import.meta.url || `file://${process.cwd()}/`);

const {
  create, update, chain, tree, hash, canonical, tombstone, fb,
  PROTOCOL_VERSION
} = require("@foodxdev/foodblock");

// ── Embedded Store ─────────────────────────────────────────────

function createEmbeddedStore() {
  const store = new Map();
  const byType = new Map();
  const byAuthor = new Map();
  const byRef = new Map();
  const heads = new Map();
  const authors = new Map();

  function insertBlock(block) {
    store.set(block.hash, block);

    // Type index
    if (!byType.has(block.type)) byType.set(block.type, []);
    byType.get(block.type).push(block.hash);

    // Author tracking
    const authorHash = block.author_hash
      || (block.refs && block.refs.author)
      || null;
    if (authorHash) {
      authors.set(block.hash, authorHash);
    }

    // Author index
    const author = block.refs && block.refs.author;
    if (author) {
      if (!byAuthor.has(author)) byAuthor.set(author, []);
      byAuthor.get(author).push(block.hash);
    }

    // Ref index
    if (block.refs) {
      for (const [role, ref] of Object.entries(block.refs)) {
        const hashes = Array.isArray(ref) ? ref : [ref];
        for (const h of hashes) {
          if (!byRef.has(h)) byRef.set(h, []);
          byRef.get(h).push(block.hash);
        }
      }
    }

    // Head resolution with author-scoped logic
    const prevHash = block.refs && block.refs.updates;
    if (prevHash) {
      const prev = store.get(prevHash);
      const chainId = prev ? (heads.has(prev.hash) ? prev.hash : findChainId(prevHash)) : prevHash;

      const blockAuthor = authors.get(block.hash);
      const prevAuthor = authors.get(prevHash);
      const isSameAuthor = blockAuthor && prevAuthor && blockAuthor === prevAuthor;
      const isTombstone = block.type === 'observe.tombstone';
      const hasApproval = block.refs && (block.refs.approved_agent || block.refs.approval);

      if (!isSameAuthor && blockAuthor && prevAuthor) {
        if (isTombstone) {
          heads.delete(prevHash);
          heads.set(block.hash, chainId);
        } else if (hasApproval) {
          heads.delete(prevHash);
          heads.set(block.hash, chainId);
        } else {
          heads.set(block.hash, block.hash);
        }
      } else {
        heads.delete(prevHash);
        heads.set(block.hash, chainId);
      }
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

  // Seed with demo data
  try {
    const { generateSeed } = require("./seed.cjs");
    for (const block of generateSeed()) {
      insertBlock(block);
    }
  } catch (err) {
    console.error("Warning: Could not load seed data:", err.message);
  }

  const resolve = async (h) => store.get(h) || null;

  return {
    resolve,

    async getBlock(h) {
      return store.get(h) || null;
    },

    async createBlock(type, state, refs) {
      const block = create(type, state || {}, refs || {});
      if (store.has(block.hash)) {
        return { exists: true, block: store.get(block.hash) };
      }
      insertBlock(block);
      return block;
    },

    async queryBlocks({ type, ref_role, ref_value, heads_only, limit = 50 }) {
      let results = [...store.values()];
      if (type) results = results.filter(b => b.type === type || b.type.startsWith(type + '.'));
      if (ref_role && ref_value) {
        results = results.filter(b => {
          const r = b.refs && b.refs[ref_role];
          if (Array.isArray(r)) return r.includes(ref_value);
          return r === ref_value;
        });
      }
      if (heads_only) {
        const headSet = new Set(heads.keys());
        results = results.filter(b => headSet.has(b.hash));
      }
      results = results.slice(0, Math.min(limit, 1000));
      return { count: results.length, blocks: results };
    },

    async getChain(h, depth = 50) {
      const result = await chain(h, resolve, { maxDepth: depth });
      return { length: result.length, chain: result };
    },

    async getHeads(type) {
      let headBlocks = [...heads.keys()].map(h => store.get(h)).filter(Boolean);
      if (type) headBlocks = headBlocks.filter(b => b.type === type || b.type.startsWith(type + '.'));
      return { count: headBlocks.length, blocks: headBlocks };
    },

    async batchCreate(inputBlocks) {
      const inserted = [];
      const skipped = [];
      const failed = [];

      const pending = inputBlocks.map(b => ({ raw: b, done: false }));
      const maxPasses = pending.length + 1;

      for (let pass = 0; pass < maxPasses; pass++) {
        let progress = false;
        for (const item of pending) {
          if (item.done) continue;
          try {
            const { type, state, refs } = item.raw;
            if (!type) {
              item.done = true;
              failed.push({ block: item.raw, error: 'type is required' });
              progress = true;
              continue;
            }
            if (refs && refs.updates && !store.has(refs.updates)) {
              continue;
            }
            const block = create(type, state || {}, refs || {});
            if (store.has(block.hash)) {
              item.done = true;
              skipped.push(block.hash);
              progress = true;
              continue;
            }
            insertBlock(block);
            item.done = true;
            inserted.push(block.hash);
            progress = true;
          } catch (err) {
            if (pass === maxPasses - 1) {
              item.done = true;
              failed.push({ block: item.raw, error: err.message });
            }
          }
        }
        if (!progress) break;
      }

      for (const item of pending) {
        if (!item.done) {
          failed.push({ block: item.raw, error: 'unresolved dependency' });
        }
      }

      return { inserted, skipped, failed };
    },

    async deleteBlock(targetHash, requestedBy, reason) {
      const target = store.get(targetHash);
      if (!target) throw new Error(`Block not found: ${targetHash}`);
      const tombstoneBlock = tombstone(targetHash, requestedBy || 'mcp', { reason: reason || 'erasure_request' });
      const tombstoned = store.get(targetHash);
      if (tombstoned) tombstoned.state = { tombstoned: true };
      insertBlock(tombstoneBlock);
      return tombstoneBlock;
    },

    async fbParse(text) {
      const result = fb(text);
      for (const block of result.blocks) {
        if (!store.has(block.hash)) insertBlock(block);
      }
      return result;
    },

    async getInfo() {
      return {
        name: 'FoodBlock MCP (standalone)',
        version: '0.5.0',
        protocol_version: PROTOCOL_VERSION,
        blocks: store.size,
        mode: 'standalone',
        types: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.length])),
      };
    },
  };
}

// ── HTTP Store ─────────────────────────────────────────────────

function createHttpStore(apiUrl) {
  async function api(path, opts = {}) {
    const url = `${apiUrl}${path}`;
    let res;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json", ...opts.headers },
        signal: AbortSignal.timeout(15000),
        ...opts,
      });
    } catch (err) {
      throw new Error(`FoodBlock API unreachable (${url}): ${err.message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FoodBlock API error ${res.status} from ${path}: ${text}`);
    }

    try {
      return await res.json();
    } catch {
      throw new Error(`FoodBlock API returned non-JSON response from ${path}`);
    }
  }

  async function apiGet(path) { return api(path); }
  async function apiPost(path, body) { return api(path, { method: "POST", body: JSON.stringify(body) }); }

  const resolve = async (h) => {
    try {
      const res = await apiGet(`/blocks/${h}`);
      return res.error ? null : res;
    } catch { return null; }
  };

  return {
    resolve,

    async getBlock(h) {
      try {
        const res = await apiGet(`/blocks/${h}`);
        return res.error ? null : res;
      } catch { return null; }
    },

    async createBlock(type, state, refs) {
      return apiPost("/blocks", { type, state: state || {}, refs: refs || {} });
    },

    async queryBlocks({ type, ref_role, ref_value, heads_only, limit }) {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (ref_role && ref_value) { params.set("ref", ref_role); params.set("ref_value", ref_value); }
      if (heads_only) params.set("heads", "true");
      if (limit) params.set("limit", String(limit));
      return apiGet(`/blocks?${params}`);
    },

    async getChain(h, depth) {
      return apiGet(`/chain/${h}${depth ? `?depth=${depth}` : ''}`);
    },

    async getHeads(type) {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      return apiGet(`/heads?${params}`);
    },

    async batchCreate(blocks) {
      return apiPost("/blocks/batch", { blocks });
    },

    async deleteBlock(targetHash, requestedBy, reason) {
      return api(`/blocks/${targetHash}`, {
        method: "DELETE",
        body: JSON.stringify({ requested_by: requestedBy, reason }),
      });
    },

    async fbParse(text) {
      return apiPost("/fb", { text });
    },

    async getInfo() {
      try { return await apiGet("/"); } catch { return null; }
    },
  };
}

// ── Factory ────────────────────────────────────────────────────

export function createStore(apiUrl) {
  if (apiUrl) {
    return createHttpStore(apiUrl);
  }
  return createEmbeddedStore();
}
