#!/usr/bin/env node
// The FoodBlock MCP server: the door (door.js) behind two transports. Any assistant can find, read, ask and promise on
// FoodBlock. The assistant drafts; the person decides, with one tap on an approval page. Six tools:
//   foodblock_find, foodblock_read, foodblock_ask, foodblock_promise, foodblock_accept, foodblock_connect
//
//   node server.js                 stdio (Claude Desktop, Claude Code, Cursor, Gemini CLI)
//   node server.js --http [port]   Streamable HTTP at /mcp (ChatGPT, remote clients), default port 7420
//
// FOODBLOCK_IDENTITY  a file holding the person's keys, genesis and chain (the CLI's format: `fb init` makes one), made on
//                     first run (kept 0600); without it, a new person each run. The approval code lives beside it in
//                     <file>.approval.
// FOODBLOCK_INDEX_URL[, FOODBLOCK_INDEX_KEY]   find asks this open index (answer verified) instead of the host's blocks.
// FOODBLOCK_NODE_URL, FOODBLOCK_NODE_TOKEN   reach the person's node on a FoodOS host over HTTP instead of in memory (see README).
// FOODBLOCK_AUTH=oauth, FOODBLOCK_PUBLIC_URL  with --http: require the MCP authorization flow on /mcp; the address clients reach the door by.
// FOODBLOCK_SEED=off  start with an empty node instead of a small story to find.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fb from "@foodxdev/foodblock";
import http from "node:http";
import { randomUUID } from "node:crypto";
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
const terms = {
  quantity: amount.optional(), price: z.any().optional().describe("money, or { money, per } for a unit price; leave out to ask for a quote"),
  deliver_by: z.string().optional().describe("UTC time YYYY-MM-DDTHH:MM:SS.sssZ"), expires: z.string().optional().describe("when this lapses if unanswered; default 7 days"),
};

/** One assistant's view of the door: its own agent identity, six tools (each with a title and honest annotations). */
export function createServer({ door, name = "assistant" } = {}) {
  door ||= createDoor();
  const index = door.index || null; // the open index, when one is set: find asks it; read, ask and promise stay on the host
  const assistant = door.agent(name);
  const server = new McpServer({ name: "foodblock", title: "FoodBlock", version: fb.VERSION, websiteUrl: "https://foodx.network",
    icons: [{ src: "https://mcp.foodx.network/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] }] },
  { instructions: "FoodBlock lets you find food offers and people and DRAFT asks for the person you serve. You never send or bind anything yourself: give the person the approval link a draft returns. There is no tool to move money." });
  // Every call: read the node's truth first (a remote node pulls), do the work, send what was signed. Behind OAuth the token must carry the tool's scope.
  const guard = (run, scope) => async (input, extra) => {
    const scopes = extra?.authInfo?.scopes;
    if (scopes && !scopes.includes(scope)) return failure(new Error(`this connection lacks the ${scope} scope`));
    try { await door.sync(); const value = await run(input); await door.flush(); return text(value); } catch (error) { return failure(error); }
  };
  const tool = (id, title, description, inputSchema, annotations, run, scope) =>
    server.registerTool(id, { title, description, inputSchema, annotations: { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...annotations } }, guard(run, scope));

  tool("foodblock_find", "Find food offers and people", "Find what is on offer: offers, things or peers, by what (a word) and near (a place hash or name). Read-only.",
    { kind: z.enum(["offers", "things", "peers"]).default("offers"), what: z.string().optional(), near: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async (input) => (index && (input.kind ?? "offers") === "offers" ? index.offers(input) : door.find(input)), "foodblock:read");

  tool("foodblock_read", "Read a block, promise or draft", "Read a block (with its refusals and signature check), a thing (its state now, where it is, who owns it), a promise (its stage: asked, offered, accepted, underway, done...) or a draft (pending, sent, discarded). Read-only.",
    { hash: z.string().min(6) }, { readOnlyHint: true, idempotentHint: true }, async ({ hash }) => door.read(hash), "foodblock:read");

  tool("foodblock_ask", "Draft an ask for the person to send", "Draft an ask or quote request for the PERSON to send (from an offer, or for a thing from someone). Nothing is sent: it returns a draft, a receipt code and an approval link for the person to open and tap. An unanswered ask binds no one. Give the link to the person; never open it yourself.",
    { offer: z.string().optional().describe("an offer's hash from foodblock_find"), from: z.string().optional().describe("the seller's id, if no offer"), what: z.string().optional().describe("a thing's hash, if no offer"), ...terms, days: z.number().int().min(1).max(60).optional() },
    {}, async (input) => door.ask(input), "foodblock:draft");

  tool("foodblock_promise", "Make a promise under a grant, or draft one", "Make a firm promise for the person (a binding ask to someone who has dealt with them before). Binds ONLY if the person has connected you with a grant that names `promise` and the other side is not a stranger; otherwise it returns a draft for the person to approve. Moves no money.",
    { to: z.string().describe("the other side's id"), what: z.string().describe("a thing's hash"), ...terms },
    { openWorldHint: true }, async (input) => door.promise(assistant, input), "foodblock:draft");

  tool("foodblock_accept", "Accept an offer under a grant, or draft it", "Accept an offer or counter-offer for the person. Binds ONLY under a live grant that names `promise`; otherwise it returns a draft for the person to approve. Moves no money.",
    { promise: z.string().describe("the offer's hash"), quantity: amount.optional() }, { openWorldHint: true }, async (input) => door.accept(assistant, input), "foodblock:draft");

  tool("foodblock_connect", "Pair this assistant with a grant draft", "Pair this assistant to the person's node. Returns a grant draft and an approval link for the person. With no acts you may only find, read and draft. Ask for `promise` only if the person wants you to bind for them.",
    { acts: z.array(z.string()).default([]).describe("block types or type.kind names you may sign, e.g. [\"promise\"]; default none"), days: z.number().int().min(1).max(365).default(30), limit: money.optional().describe("the most money one act may involve") },
    {}, async (input) => door.connect(assistant, input), "foodblock:draft");

  return server;
}

// ---- The person and the node this process runs ----
function build() {
  const file = process.env.FOODBLOCK_IDENTITY;
  const fresh = file && !existsSync(file);
  const saved = file && !fresh ? JSON.parse(readFileSync(file, "utf8")) : null;
  const person = saved ? { ...saved, id: saved.genesis.hash } : newPerson();
  const persist = ({ keys, encryption, genesis, chain }) => { if (file) writeFileSync(file, JSON.stringify({ keys, encryption, genesis, chain }, null, 2), { mode: 0o600 }); };
  if (fresh) writeFileSync(`${file}.recovery.json`, JSON.stringify({ id: person.id, recovery: person.recovery }, null, 2), { mode: 0o600 });
  let code = file && existsSync(`${file}.approval`) ? readFileSync(`${file}.approval`, "utf8").trim() : undefined;
  // FOODBLOCK_NODE_URL: a FoodOS host (its handler, kernel/node/host.js); the door reaches the person's node there, {url}/{personId}, with the
  // credential FOODBLOCK_NODE_TOKEN in a header. Without it the node is in memory.
  const hosted = process.env.FOODBLOCK_NODE_URL;
  const node = hosted ? remoteNode({ base: `${hosted.replace(/\/$/, "")}/${person.id}`, token: process.env.FOODBLOCK_NODE_TOKEN }) : memoryNode();
  const door = createDoor({ node, person, code, persist });
  // FOODBLOCK_INDEX_URL: an open index (kernel/index/http.js); find goes there and its signed answer is verified. FOODBLOCK_INDEX_KEY pins its key.
  if (process.env.FOODBLOCK_INDEX_URL) door.index = remoteIndex({ base: process.env.FOODBLOCK_INDEX_URL, key: process.env.FOODBLOCK_INDEX_KEY });
  if (file && !code) writeFileSync(`${file}.approval`, door.approvalCode, { mode: 0o600 });
  persist(person);
  if (process.env.FOODBLOCK_SEED !== "off") seed(door);
  return door;
}

// A small story to find: a mill, its flour, an open offer of it, and the place it is in.
function seed({ node }) {
  const mill = newPerson(), say = (type, state, refs) => { const s = fb.write(type, state, refs, { author: mill.id, key: mill.keys, held: mill.chain }); mill.chain.push(s); node.push(s); return s; };
  node.push(mill.genesis);
  const place = say("thing", { kind: "place", name: "Hartley Mill" }, {});
  const flour = say("thing", { kind: "flour", name: "Strong white flour" }, { place: place.hash });
  say("promise", { terms: { price: { money: fb.money(150, "GBP"), per: fb.amount("1", "kg") }, quantity: fb.amount("100", "kg"),
    expires: new Date(Date.now() + 30 * 864e5).toISOString() } }, { from: mill.id, what: flour.hash, place: place.hash });
}

// ---- Transports ----
/** One MCP request: a session per assistant (a new one on initialize). Behind OAuth a session belongs to the client AND the person that opened it. */
export function mcpEndpoint(door) {
  const sessions = new Map();
  const sweep = setInterval(() => { for (const [id, s] of sessions) if (Date.now() - s.seen > 3600e3) { s.transport.close?.(); sessions.delete(id); } }, 300e3); sweep.unref();
  return async (req, res, body, auth, perRequestDoor, person) => {
    const id = req.headers["mcp-session-id"], theDoor = perRequestDoor || door;
    let held = id && sessions.get(id);
    if (held && ((auth && held.clientId !== auth.clientId) || held.person !== person)) { res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: "forbidden", error_description: "this session belongs to another connection" })); return; }
    if (!held) {
      if (id) { res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found: start a new session" }, id: null })); return; } // the spec: an unknown session is 404, so the client initializes again
      if (req.method !== "POST") { res.writeHead(400).end("no session"); return; }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (sid) => sessions.set(sid, { transport, clientId: auth?.clientId, person, seen: Date.now() }) });
      transport.onclose = () => transport.sessionId && sessions.delete(transport.sessionId);
      await createServer({ door: theDoor }).connect(transport);
      held = { transport };
    } else held.seen = Date.now();
    await held.transport.handleRequest(req, res, body);
  };
}
const readJson = async (req, res) => {
  if (req.method !== "POST") return { ok: true };
  let raw = ""; for await (const chunk of req) raw += chunk;
  try { return { ok: true, body: JSON.parse(raw) }; } catch { res.writeHead(400).end("bad json"); return { ok: false }; }
};

/**
 * Streamable HTTP at /mcp. With `oauth: true` the door follows the MCP authorization spec: /mcp answers 401 until the assistant has
 * a bearer token from the OAuth flow (the person says yes with their approval code); `publicUrl` is the address clients reach it by.
 */
async function serveHttp(door, port, { oauth = false, publicUrl = process.env.FOODBLOCK_PUBLIC_URL } = {}) {
  const approve = approvalHandler(door), mcp = mcpEndpoint(door), bind = process.env.FOODBLOCK_HOST || "127.0.0.1";
  if (oauth) {
    const provider = doorProvider({ approvalCode: door.approvalCode });
    const { app, mount } = authorizedApp({ door, mcp, approve, provider });
    const server = http.createServer(app);
    await new Promise((done) => server.listen(port, bind, done));
    door.base = publicUrl || `http://${bind}:${server.address().port}`;
    mount(door.base);
    return server;
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (await approve(req, res)) return;
      if (!req.url.startsWith("/mcp")) { res.writeHead(404).end(); return; }
      const parsed = await readJson(req, res);
      if (parsed.ok) await mcp(req, res, parsed.body);
    } catch (error) { if (!res.headersSent) res.writeHead(500); res.end(String(error.message)); }
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
    console.error(`FoodBlock MCP on ${door.base}/mcp\nApproval code (keep it to yourself): ${door.approvalCode}`);
  } else {
    // stdio carries the protocol, so the approval page gets its own local port.
    const handle = approvalHandler(door);
    const approval = http.createServer(async (req, res) => { if (!(await handle(req, res))) res.writeHead(404).end(); });
    await new Promise((done) => approval.listen(Number(process.env.FOODBLOCK_APPROVE_PORT) || 0, "127.0.0.1", done));
    door.base = `http://127.0.0.1:${approval.address().port}`;
    console.error(`FoodBlock approval page: ${door.base}\nApproval code (keep it to yourself): ${door.approvalCode}`);
    await createServer({ door }).connect(new StdioServerTransport());
  }
}
export { seed, createDoor, memoryNode, remoteNode, remoteIndex, newPerson, approvalHandler, serveHttp, build };
