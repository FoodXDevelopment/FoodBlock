#!/usr/bin/env node

/**
 * fb — FoodBlock CLI
 *
 * Usage:
 *   fb "sourdough bread $4.50 organic"        # natural language -> block JSON
 *   fb create substance.product --name Bread   # explicit type
 *   fb get abc123...                           # fetch by hash
 *   fb query --type actor.producer --heads     # query
 *   fb tree abc123...                          # provenance tree
 *   fb chain abc123...                         # version history
 *   fb info                                    # system info
 *   echo "bread $4.50" | fb                    # pipe-friendly (stdin)
 *
 * Modes:
 *   Default: standalone (in-memory store, zero config)
 *   --server URL or FOODBLOCK_URL env: remote server mode
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sdk = require('@foodxdev/foodblock');

// ── Arg parsing ─────────────────────────────────────────────

const args = process.argv.slice(2);

/**
 * Extract a flag value: --flag value or --flag=value
 * Returns the value string or null if not found.
 */
function getFlag(name) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && i + 1 < args.length) {
      return args[i + 1];
    }
    if (args[i].startsWith(`--${name}=`)) {
      return args[i].slice(`--${name}=`.length);
    }
  }
  return null;
}

/**
 * Check if a boolean flag is present: --heads, --help, etc.
 */
function hasFlag(name) {
  return args.some(a => a === `--${name}`);
}

/**
 * Collect all --key value pairs (excluding known flags) for building state objects.
 */
function collectState() {
  const state = {};
  const knownFlags = ['server', 'type', 'heads', 'help', 'limit', 'ref', 'ref_role', 'ref_value'];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const eqIdx = args[i].indexOf('=');
      let key, value;
      if (eqIdx !== -1) {
        key = args[i].slice(2, eqIdx);
        value = args[i].slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        key = args[i].slice(2);
        value = args[i + 1];
        i++; // skip next arg
      } else {
        continue;
      }
      if (knownFlags.includes(key)) continue;
      // Try to parse as number or boolean
      if (value === 'true') state[key] = true;
      else if (value === 'false') state[key] = false;
      else if (/^-?\d+(\.\d+)?$/.test(value)) state[key] = Number(value);
      else state[key] = value;
    }
  }
  return state;
}

/**
 * Get positional args (everything that is not a flag or flag value).
 */
function positionalArgs() {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const eqIdx = args[i].indexOf('=');
      // If it's --key value (no =), skip the next arg too
      if (eqIdx === -1 && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        i++;
      }
      continue;
    }
    result.push(args[i]);
  }
  return result;
}

// ── Output helpers ──────────────────────────────────────────

function out(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function outLines(items) {
  for (const item of items) {
    process.stdout.write(JSON.stringify(item) + '\n');
  }
}

function die(msg, code = 1) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

// ── Server mode (remote HTTP) ───────────────────────────────

const serverUrl = getFlag('server') || process.env.FOODBLOCK_URL || null;

async function remoteFb(text) {
  const res = await fetch(`${serverUrl}/api/v1/foodblock/fb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteCreate(type, state, refs) {
  const res = await fetch(`${serverUrl}/api/v1/foodblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, state, refs }),
  });
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteGet(hash) {
  const res = await fetch(`${serverUrl}/api/v1/foodblock/${hash}`);
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteQuery(params) {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.heads) qs.set('heads', 'true');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.ref_role) qs.set('ref_role', params.ref_role);
  if (params.ref_value) qs.set('ref_value', params.ref_value);
  const res = await fetch(`${serverUrl}/api/v1/foodblock?${qs}`);
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteTree(hash) {
  const res = await fetch(`${serverUrl}/api/v1/trace/${hash}`);
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteChain(hash) {
  const res = await fetch(`${serverUrl}/api/v1/foodblock/chain/${hash}`);
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

async function remoteInfo() {
  const res = await fetch(`${serverUrl}/health`);
  if (!res.ok) die(`server responded ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Standalone mode (in-memory store) ───────────────────────

const store = new Map();

function storeBlock(block) {
  store.set(block.hash, block);
  return block;
}

function storeBlocks(blocks) {
  for (const b of blocks) store.set(b.hash, b);
  return blocks;
}

function localGet(hash) {
  // Support prefix matching (minimum 8 chars)
  if (hash.length < 64 && hash.length >= 8) {
    for (const [key, block] of store) {
      if (key.startsWith(hash)) return block;
    }
  }
  return store.get(hash) || null;
}

function localQuery(params) {
  let results = [...store.values()];

  // Filter by type (exact or prefix)
  if (params.type) {
    results = results.filter(b => b.type === params.type || b.type.startsWith(params.type + '.'));
  }

  // Filter by ref
  if (params.ref_role && params.ref_value) {
    results = results.filter(b => {
      if (!b.refs) return false;
      const ref = b.refs[params.ref_role];
      if (Array.isArray(ref)) return ref.includes(params.ref_value);
      return ref === params.ref_value;
    });
  }

  // Heads only: exclude blocks that are referenced by an updates ref
  if (params.heads) {
    const updatedHashes = new Set();
    for (const b of store.values()) {
      if (b.refs && b.refs.updates) {
        const updates = Array.isArray(b.refs.updates) ? b.refs.updates : [b.refs.updates];
        for (const u of updates) updatedHashes.add(u);
      }
    }
    results = results.filter(b => !updatedHashes.has(b.hash));
  }

  // Limit
  const limit = params.limit || 50;
  return results.slice(0, limit);
}

async function localTree(hash) {
  const resolve = async (h) => localGet(h);
  return sdk.tree(hash, resolve);
}

async function localChain(hash) {
  const resolve = async (h) => localGet(h);
  return sdk.chain(hash, resolve);
}

function localInfo() {
  return {
    name: 'foodblock-cli',
    version: '0.5.1',
    mode: 'standalone',
    protocol_version: sdk.PROTOCOL_VERSION,
    block_count: store.size,
  };
}

// ── Read from stdin ─────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

// ── Help ────────────────────────────────────────────────────

const HELP = `fb — FoodBlock CLI

Usage:
  fb "sourdough bread $4.50 organic"        Natural language -> block JSON
  fb create <type> [--name X] [--key val]   Create a block with explicit type
  fb get <hash>                             Fetch a block by hash
  fb query [--type T] [--heads] [--limit N] Query blocks
  fb tree <hash>                            Provenance tree
  fb chain <hash>                           Version history
  fb info                                   System info
  echo "bread $4.50" | fb                   Pipe-friendly (stdin)

Options:
  --server URL      Connect to a remote FoodBlock server
  --help            Show this help

Environment:
  FOODBLOCK_URL     Default server URL (same as --server)

Standalone mode (default) uses an in-memory store. No server needed.
`;

// ── Main ────────────────────────────────────────────────────

async function main() {
  if (hasFlag('help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const pos = positionalArgs();
  const command = pos[0] || null;

  // No args and stdin is piped: read from stdin
  if (!command && !process.stdin.isTTY) {
    const text = await readStdin();
    if (!text) die('no input');
    return runFb(text);
  }

  // No args and TTY: show help
  if (!command) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  // Dispatch commands
  switch (command) {
    case 'create':
      return runCreate(pos.slice(1));
    case 'get':
      return runGet(pos[1]);
    case 'query':
      return runQuery();
    case 'tree':
      return runTree(pos[1]);
    case 'chain':
      return runChain(pos[1]);
    case 'info':
      return runInfo();
    case 'help':
      process.stdout.write(HELP);
      process.exit(0);
      break;
    default:
      // Treat everything as natural language input
      return runFb(pos.join(' '));
  }
}

// ── Command implementations ─────────────────────────────────

async function runFb(text) {
  if (serverUrl) {
    const result = await remoteFb(text);
    out(result);
  } else {
    const result = sdk.fb(text);
    storeBlocks(result.blocks);
    out(result);
  }
}

async function runCreate(posArgs) {
  const type = posArgs[0] || getFlag('type');
  if (!type) die('create requires a type, e.g.: fb create substance.product --name Bread');

  const state = collectState();
  const refs = {};

  // Extract refs from --ref_role and --ref_value
  const refRole = getFlag('ref_role') || getFlag('ref');
  const refValue = getFlag('ref_value');
  if (refRole && refValue) {
    refs[refRole] = refValue;
  }

  if (serverUrl) {
    const result = await remoteCreate(type, state, refs);
    out(result);
  } else {
    const block = sdk.create(type, state, refs);
    storeBlock(block);
    out(block);
  }
}

async function runGet(hash) {
  if (!hash) die('get requires a hash, e.g.: fb get abc123...');

  if (serverUrl) {
    const result = await remoteGet(hash);
    out(result);
  } else {
    const block = localGet(hash);
    if (!block) die(`block not found: ${hash}`);
    out(block);
  }
}

async function runQuery() {
  const type = getFlag('type');
  const heads = hasFlag('heads');
  const limit = getFlag('limit') ? Number(getFlag('limit')) : undefined;
  const refRole = getFlag('ref_role') || getFlag('ref');
  const refValue = getFlag('ref_value');

  if (serverUrl) {
    const result = await remoteQuery({ type, heads, limit, ref_role: refRole, ref_value: refValue });
    if (Array.isArray(result)) outLines(result);
    else out(result);
  } else {
    const results = localQuery({ type, heads, limit, ref_role: refRole, ref_value: refValue });
    outLines(results);
  }
}

async function runTree(hash) {
  if (!hash) die('tree requires a hash, e.g.: fb tree abc123...');

  if (serverUrl) {
    const result = await remoteTree(hash);
    out(result);
  } else {
    const result = await localTree(hash);
    if (!result) die(`block not found: ${hash}`);
    out(result);
  }
}

async function runChain(hash) {
  if (!hash) die('chain requires a hash, e.g.: fb chain abc123...');

  if (serverUrl) {
    const result = await remoteChain(hash);
    if (Array.isArray(result)) outLines(result);
    else out(result);
  } else {
    const result = await localChain(hash);
    if (!result || result.length === 0) die(`block not found: ${hash}`);
    outLines(result);
  }
}

async function runInfo() {
  if (serverUrl) {
    const result = await remoteInfo();
    out(result);
  } else {
    out(localInfo());
  }
}

// ── Run ─────────────────────────────────────────────────────

main().catch(err => {
  die(err.message);
});
