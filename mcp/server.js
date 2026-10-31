#!/usr/bin/env node
// The FoodBlock MCP server: the door (door.js) behind two transports. Any assistant can find, read, ask and promise on
// FoodBlock. The assistant drafts; the person decides, with one tap on an approval page. Six tools. This server is neutral: it names no product and
// holds no one's agent. A host that has the person's own agent (FoodX: hosted.js) passes a `brand` that names itself, adds its tools, and makes the door read-only.
//   foodblock_find, foodblock_read, foodblock_ask, foodblock_promise, foodblock_accept, foodblock_connect
//
//   node server.js                 stdio (Claude Desktop, Claude Code, Cursor, Gemini CLI)
//   node server.js --http [port]   Streamable HTTP at /mcp (ChatGPT, remote clients), default port 7420
//
// FOODBLOCK_REACH     the recovery window of a new identity, as a duration the person states (for example P30D); required when no identity file exists yet.
// FOODBLOCK_IDENTITY  a file holding the person's keys, genesis and chain (the CLI's format: `fb init` makes one), made on
//                     first run (kept 0600); without it, a new person each run. The approval code lives beside it in
//                     <file>.approval.
// FOODBLOCK_INDEX_URL[, FOODBLOCK_INDEX_KEY]   find asks this open index (answer verified) instead of the host's blocks.
// FOODBLOCK_NODE_URL, FOODBLOCK_NODE_TOKEN   reach the person's node on a FoodOS host over HTTP instead of in memory (see README).
// FOODBLOCK_AUTH=oauth, FOODBLOCK_PUBLIC_URL  with --http: require the MCP authorization flow on /mcp; the address clients reach the door by.
// FOODBLOCK_SEED=demo  start with a small demo story to find (a made-up mill and offer, each block says it is a demo); the default is an empty node.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fb from "@foodxdev/foodblock";
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createDoor, approvalHandler, memoryNode, newPerson } from "./door.js";
import { remoteNode, remoteIndex } from "./remote.js";
import { doorProvider, authorizedApp } from "./auth.js";

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
// Error shape: isError plus one JSON object { error: { code, message, retryable } }; codes: insufficient_scope, not_found, stopped, refused, failed.
export const failure = (error) => {
  const message = error?.message || String(error), wrong = error?.wrong;
  const code = wrong?.includes?.("stopped") ? "stopped" : /lacks the .* scope/.test(message) ? "insufficient_scope" : /^No such|no such/.test(message) ? "not_found" : wrong ? "refused" : "failed";
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message, retryable: code === "failed" && /did not take|HTTP 5|unavailable/.test(message) } }) }] };
};

const amount = z.object({ value: z.string(), unit: z.string() }).describe('an amount: { value: "2", unit: "kg" } (a decimal string, never a float)');
const money = z.object({ minor: z.number().int(), currency: z.string() }).describe("money: whole minor units, e.g. { minor: 450, currency: \"GBP\" }");
// Who may read the block: the person's choice, asked for every time (nothing is filled in, so there is no default).
const audience = z.union([z.literal("public"), z.array(z.string()).min(1)]).describe('REQUIRED, the person\'s choice of who may read this block: "public", or a list of ids (the person\'s and anyone they want to read it). Ask the person; never choose for them.');
const terms = {
  quantity: amount.optional(), price: z.any().optional().describe("money, or { money, per } for a unit price; leave out to ask for a quote"),
  deliver_by: z.string().optional().describe("UTC time YYYY-MM-DDTHH:MM:SS.sssZ"), expires: z.string().optional().describe("when this lapses if unanswered; default 7 days"),
};

/** One assistant's view of the door: its own autonomous system identity, six tools (each with a title and honest annotations). */
export function createServer({ door, name = "assistant", assistant: given, brand = {} } = {}) {
  // `brand` is the host's own: { title, websiteUrl, icons, instructions, readOnly, tools(server, tool, door) }. Without it this is a neutral protocol server.
  door ||= createDoor({ reach: process.env.FOODBLOCK_REACH });
  const index = door.index || null; // the open index, when one is set: find asks it; read, ask and promise stay on the host
  const assistant = given || door.agent(name); // a restored session passes the assistant it had
  const server = new McpServer({ name: "foodblock", title: brand.title || "FoodBlock", version: fb.VERSION, ...(brand.websiteUrl ? { websiteUrl: brand.websiteUrl } : {}), ...(brand.icons ? { icons: brand.icons } : {}) },
  { instructions: brand.instructions || "This server lets you find food offers and people on FoodBlock, read blocks, and DRAFT asks, promises and accepts for the person you serve. You never send or bind anything yourself: give the person the approval link a draft returns. There is no tool to move money." });
  // Every call: read the node's truth first (a remote node pulls), do the work, send what was signed. Behind OAuth the token must carry the tool's scope.
  const guard = (run, scope) => async (input, extra) => {
    const scopes = extra?.authInfo?.scopes;
    if (scopes && !scopes.includes(scope)) return failure(new Error(`this connection lacks the ${scope} scope`));
    // one call at a time per door: two calls racing would each read the node before the other's block was sent (door/t8)
    const turn = (door.turn || Promise.resolve()).then(async () => { try { await door.sync(); const value = await run(input); await door.flush(); return text(value); } catch (error) { return failure(error); } });
    door.turn = turn.catch(() => {});
    return turn;
  };
  // Each tool says how it is authorized (per-tool security scheme, the OAuth scope it needs), so a client can ask for only that.
  const tool = (id, title, description, inputSchema, annotations, run, scope, meta = {}) =>
    server.registerTool(id, { title, description, inputSchema, annotations: { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...annotations }, _meta: { securitySchemes: [{ type: "oauth2", scopes: [scope] }], ...meta } }, guard(run, scope));

  // A host with the person's own agent adds its tools here and, with readOnly, keeps this door to find and read (anything that binds happens on the approval page).
  const hosted = typeof brand.readOnly === "function" ? Boolean(brand.readOnly(door)) : Boolean(brand.readOnly);
  brand.tools?.(server, tool, door);

  tool("foodblock_find", "Find food offers and people", "Find what is on offer: offers, things or peers, by what (a word) and near (a place hash or name). Read-only.",
    { kind: z.enum(["offers", "things", "peers"]).default("offers"), what: z.string().optional(), near: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async (input) => (index && (input.kind ?? "offers") === "offers" ? index.offers(input) : door.find(input)), "foodblock:read");

  tool("foodblock_read", "Read a block, promise or draft", "Read a block (with its refusals and signature check), a thing (its state now, where it is, who owns it), a promise (its stage: asked, offered, accepted, underway, done...) or a draft (pending, sent, discarded). Read-only.",
    { hash: z.string().min(6) }, { readOnlyHint: true, idempotentHint: true }, async ({ hash }) => door.read(hash), "foodblock:read");

  if (!hosted) tool("foodblock_ask", "Draft an ask for the person to send", "Draft an ask or quote request for the PERSON to send (from an offer, or for a thing from someone). Nothing is sent: it returns a draft, a receipt code and an approval link for the person to open and tap. An unanswered ask binds no one. Give the link to the person; never open it yourself. Ask the person who may read it (`audience`: \"public\" or a list of ids) before you call.",
    { audience, offer: z.string().optional().describe("an offer's hash from foodblock_find"), from: z.string().optional().describe("the seller's id, if no offer"), what: z.string().optional().describe("a thing's hash, if no offer"), ...terms, days: z.number().int().min(1).max(60).optional() },
    {}, async (input) => door.ask(input), "foodblock:draft");

  if (!hosted) tool("foodblock_promise", "Make a promise under a grant, or draft one", "Make a firm promise for the person (a binding ask to someone who has dealt with them before). Binds ONLY if the person has connected you with a grant that names `promise` and the other side is not a stranger; otherwise it returns a draft for the person to approve. Moves no money. Ask the person who may read it (`audience`) first; there is no default.",
    { audience, to: z.string().describe("the other side's id"), what: z.string().describe("a thing's hash"), ...terms },
    { openWorldHint: true }, async (input) => door.promise(assistant, input), "foodblock:draft");

  if (!hosted) tool("foodblock_accept", "Accept an offer under a grant, or draft it", "Accept an offer or counter-offer for the person. Binds ONLY under a live grant that names `promise`; otherwise it returns a draft for the person to approve. Moves no money. Ask the person who may read it (`audience`) first; there is no default.",
    { audience, promise: z.string().describe("the offer's hash"), quantity: amount.optional() }, { openWorldHint: true }, async (input) => door.accept(assistant, input), "foodblock:draft");

  if (!hosted) tool("foodblock_connect", "Pair this assistant with a grant draft", "Pair this assistant to the person's node. Returns a grant draft and an approval link for the person. With no acts you may only find, read and draft. Ask for `promise` only if the person wants you to bind for them. `audience` (who may read the grant) is the person's choice: ask first.",
    { audience, acts: z.array(z.string()).default([]).describe("block types or type.kind names you may sign, e.g. [\"promise\"]; default none"), days: z.number().int().min(1).max(365).default(30), limit: money.optional().describe("the most money one act may involve"), parties: z.array(z.string()).default([]).describe("ids the assistant may deal with under this grant; none listed means no one but the person") },
    {}, async (input) => door.connect(assistant, input), "foodblock:draft");

  return server;
}

// ---- The person and the node this process runs ----
function build() {
  const file = process.env.FOODBLOCK_IDENTITY;
  const fresh = file && !existsSync(file);
  const saved = file && !fresh ? JSON.parse(readFileSync(file, "utf8")) : null;
  const person = saved ? { ...saved, id: saved.genesis.hash } : newPerson("person", { reach: process.env.FOODBLOCK_REACH });
  const persist = ({ keys, encryption, genesis, chain }) => { if (file) writeFileSync(file, JSON.stringify({ keys, encryption, genesis, chain }, null, 2), { mode: 0o600 }); };
  if (fresh) writeFileSync(`${file}.recovery.json`, JSON.stringify({ id: person.id, recovery: person.recovery }, null, 2), { mode: 0o600 });
  let code = file && existsSync(`${file}.approval`) ? readFileSync(`${file}.approval`, "utf8").trim() : undefined;
  // FOODBLOCK_NODE_URL: a FoodOS host (its handler, foodos/node/host.js); the door reaches the person's node there, {url}/{personId}, with the
  // credential FOODBLOCK_NODE_TOKEN in a header. Without it the node is in memory.
  const hosted = process.env.FOODBLOCK_NODE_URL;
  const node = hosted ? remoteNode({ base: `${hosted.replace(/\/$/, "")}/${person.id}`, token: process.env.FOODBLOCK_NODE_TOKEN }) : memoryNode();
  const door = createDoor({ node, person, code, persist });
  // FOODBLOCK_INDEX_URL: an open index (foodos/index/http.js); find goes there and its signed answer is verified. FOODBLOCK_INDEX_KEY pins its key.
  if (process.env.FOODBLOCK_INDEX_URL) door.index = remoteIndex({ base: process.env.FOODBLOCK_INDEX_URL, key: process.env.FOODBLOCK_INDEX_KEY });
  if (file && !code) writeFileSync(`${file}.approval`, door.approvalCode, { mode: 0o600 });
  persist(person);
  if (process.env.FOODBLOCK_SEED === "demo") seed(door);
  return door;
}

// A small story to find: a mill, its flour, an open offer of it, and the place it is in.
// (the demo's blocks are public by design)
function seed({ node }) {
  const mill = newPerson("person", { reach: "P30D" }), say = (type, state, refs) => { const s = fb.write(type, state, refs, { author: mill.id, key: mill.keys, held: mill.chain, at: new Date().toISOString(), audience: "public" }); mill.chain.push(s); node.push(s); return s; };
  node.push(mill.genesis);
  const place = say("thing", { kind: "place", name: "Hartley Mill (demo, not a real place)", text: "A made-up demo block, not a real mill or offer." }, {});
  const flour = say("thing", { kind: "flour", name: "Strong white flour (demo)", text: "A made-up demo block, not a real product." }, { place: place.hash });
  say("promise", { what: "Demo offer: made up, not a real one.", terms: { price: { money: fb.money(150, "GBP"), per: fb.amount("1", "kg") }, quantity: fb.amount("100", "kg"),
    expires: new Date(Date.now() + 30 * 864e5).toISOString() } }, { from: mill.id, what: flour.hash, place: place.hash });
}

// ---- Transports ----
/** One MCP request: a session per assistant (a new one on initialize). Behind OAuth a session belongs to the client AND the person that opened it. */
export function mcpEndpoint(door, { store = null, idleMs = 3600e3 } = {}) {
  // `store` (store.js durableSessions) keeps each session's record so a restart loses none: the next request with that session id is answered
  // by a transport rebuilt in its initialized state, for the same assistant (its identity and grant), and only for the same client and person.
  const sessions = new Map();
  const sweep = setInterval(() => {
    for (const [id, s] of sessions) if (Date.now() - s.seen > idleMs) { s.transport.close?.(); sessions.delete(id); }
    store?.prune(idleMs * 24 * 7);
  }, 300e3); sweep.unref();
  const forbidden = (res) => res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: "forbidden", error_description: "this session belongs to another connection" }));
  async function restore(id, record, theDoor, brand) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => id });
    const inner = transport._webStandardTransport || transport; inner.sessionId = id; inner._initialized = true;
    transport.onclose = () => transport.sessionId && sessions.delete(transport.sessionId);
    await createServer({ door: theDoor, brand, assistant: theDoor.adopt ? theDoor.adopt(record.assistant) : record.assistant }).connect(transport);
    const held = { transport, clientId: record.clientId, person: record.person, seen: Date.now() };
    sessions.set(id, held);
    return held;
  }
  const endpoint = async (req, res, body, auth, perRequestDoor, person, brand) => {
    const id = req.headers["mcp-session-id"], theDoor = perRequestDoor || door;
    let held = id && sessions.get(id);
    if (!held && id && store?.get(id)) {
      const record = store.get(id);
      if ((auth && record.clientId !== auth.clientId) || record.person !== person) return forbidden(res);
      held = await restore(id, record, theDoor, brand);
    }
    if (held && ((auth && held.clientId !== auth.clientId) || held.person !== person)) return forbidden(res);
    if (!held) {
      if (id) { res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found: start a new session" }, id: null })); return; } // the spec: an unknown session is 404, so the client initializes again
      if (req.method !== "POST") { res.writeHead(400).end("no session"); return; }
      const assistant = theDoor.agent("assistant", { client: auth?.clientId || null });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (sid) => { sessions.set(sid, { transport, clientId: auth?.clientId, person, seen: Date.now() }); store?.set(sid, { clientId: auth?.clientId, person, assistant, seen: Date.now() }); } });
      transport.onclose = () => { if (transport.sessionId) { sessions.delete(transport.sessionId); store?.delete(transport.sessionId); } };
      await createServer({ door: theDoor, assistant, brand }).connect(transport);
      held = { transport };
    } else { held.seen = Date.now(); store?.touch(id); }
    await held.transport.handleRequest(req, res, body);
  };
  /** Forget every session of one client for one person (the person disconnected it): its assistant is not restored again. */
  endpoint.forget = (clientId, person) => {
    for (const [id, s] of sessions) if (s.clientId === clientId && s.person === person) { s.transport.onclose = null; s.transport.close?.(); sessions.delete(id); store?.delete(id); }
    for (const id of store?.ids?.() || []) { const r = store.get(id); if (r && r.clientId === clientId && r.person === person) store.delete(id); }
  };
  /** Stop taking sessions and let each close; the records stay on disk (a restart continues them). */
  endpoint.drain = async () => { clearInterval(sweep); for (const s of sessions.values()) { try { s.transport.onclose = null; await s.transport.close?.(); } catch {} } sessions.clear(); };
  return endpoint;
}
const MAX_BODY = 1 << 20;
const readJson = async (req, res) => {
  if (req.method !== "POST") return { ok: true };
  // a body past the limit is refused as it arrives: the door buffers no more than a person's tool call can need (release 52)
  let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) { res.writeHead(413).end("too large"); req.destroy(); return { ok: false }; } }
  try { return { ok: true, body: JSON.parse(raw) }; } catch { res.writeHead(400).end("bad json"); return { ok: false }; }
};

/**
 * Streamable HTTP at /mcp. With `oauth: true` the door follows the MCP authorization spec: /mcp answers 401 until the assistant has
 * a bearer token from the OAuth flow (the person says yes with their approval code); `publicUrl` is the address clients reach it by.
 */
async function serveHttp(door, port, { oauth = false, publicUrl = process.env.FOODBLOCK_PUBLIC_URL } = {}) {
  const approve = approvalHandler(door), mcp = mcpEndpoint(door), bind = process.env.FOODBLOCK_HOST || "127.0.0.1";
  // beyond this machine the door answers only behind the authorization flow: a door open on a network is a door anyone on it can use (release 52)
  if (!oauth && !["127.0.0.1", "localhost", "::1"].includes(bind)) throw new Error("FOODBLOCK_HOST names an address beyond this machine: set FOODBLOCK_AUTH=oauth, or leave the door on loopback");
  if (oauth) {
    const provider = doorProvider({ approvalCode: door.approvalCode });
    const { app, mount } = authorizedApp({ door, mcp, approve, provider });
    const server = http.createServer(app);
    await new Promise((done) => server.listen(port, bind, done));
    door.base = publicUrl || `http://${bind}:${server.address().port}`;
    mount(door.base);
    return server;
  }
  // With no OAuth, only this machine's own pages may call: a request whose Host or Origin names another site is refused, so a web page
  // cannot reach the door by DNS rebinding (door/t12, agents/t13).
  const local = () => new Set([`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`, `[::1]:${server.address().port}`, ...(publicUrl ? [new URL(publicUrl).host] : [])]);
  const server = http.createServer(async (req, res) => {
    try {
      const hosts = local();
      const origin = req.headers.origin ? (() => { try { return new URL(req.headers.origin).host; } catch { return "?"; } })() : null;
      if (!hosts.has(String(req.headers.host || "")) || (origin && !hosts.has(origin))) { res.writeHead(403).end("this door answers only its own pages"); return; }
      if (await approve(req, res)) return;
      if (!req.url.startsWith("/mcp")) { res.writeHead(404).end(); return; }
      const parsed = await readJson(req, res);
      if (parsed.ok) await mcp(req, res, parsed.body);
    } catch (error) { if (!res.headersSent) res.writeHead(500); res.end("the door could not answer"); }
  });
  await new Promise((done) => server.listen(port, bind, done));
  door.base = publicUrl || `http://${bind}:${server.address().port}`;
  return server;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isDirectRun) {
  const door = build();
  const flag = process.argv.indexOf("--http");
  if (flag > -1) {
    const server = await serveHttp(door, Number(process.argv[flag + 1]) || Number(process.env.PORT) || 7420, { oauth: process.env.FOODBLOCK_AUTH === "oauth" });
    // the code is never printed: an assistant's client often shows this process's output to the assistant itself (agents/t6)
    console.error(`FoodBlock MCP on ${door.base}/mcp\nYour approval code is in ${process.env.FOODBLOCK_IDENTITY ? `${process.env.FOODBLOCK_IDENTITY}.approval` : "no file (set FOODBLOCK_IDENTITY to keep one)"}.`);
  } else {
    // stdio carries the protocol, so the approval page gets its own local port.
    const handle = approvalHandler(door);
    const approval = http.createServer(async (req, res) => { if (!(await handle(req, res))) res.writeHead(404).end(); });
    await new Promise((done) => approval.listen(Number(process.env.FOODBLOCK_APPROVE_PORT) || 0, "127.0.0.1", done));
    door.base = `http://127.0.0.1:${approval.address().port}`;
    console.error(`FoodBlock approval page: ${door.base}\nYour approval code is in ${process.env.FOODBLOCK_IDENTITY ? `${process.env.FOODBLOCK_IDENTITY}.approval` : "no file (set FOODBLOCK_IDENTITY to keep one)"}.`);
    await createServer({ door }).connect(new StdioServerTransport());
  }
}
export { seed, createDoor, memoryNode, remoteNode, remoteIndex, newPerson, approvalHandler, serveHttp, build };
