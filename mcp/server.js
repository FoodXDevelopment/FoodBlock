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

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ isError: true, content: [{ type: "text", text: error.message }] });
const guard = (run) => async (input) => { try { return text(await run(input)); } catch (error) { return failure(error); } };

const amount = z.object({ value: z.string(), unit: z.string() }).describe('an amount: { value: "2", unit: "kg" } (a decimal string, never a float)');
const money = z.object({ minor: z.number().int(), currency: z.string() }).describe("money: whole minor units, e.g. { minor: 450, currency: \"GBP\" }");
const terms = {
  quantity: amount.optional(), price: z.any().optional().describe("money, or { money, per } for a unit price; leave out to ask for a quote"),
  deliver_by: z.string().optional().describe("UTC time YYYY-MM-DDTHH:MM:SS.sssZ"), expires: z.string().optional().describe("when this lapses if unanswered; default 7 days"),
};

/** One assistant's view of the door: its own agent identity, six tools. */
export function createServer({ door, name = "assistant" } = {}) {
  door ||= createDoor();
  const assistant = door.agent(name);
  const server = new McpServer({ name: "foodblock", version: fb.VERSION });

  server.tool("foodblock_find", "Find what is on offer: offers, things or peers, by what (a word) and near (a place hash or name). Read-only.",
    { kind: z.enum(["offers", "things", "peers"]).default("offers"), what: z.string().optional(), near: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
    guard(async (input) => door.find(input)));

  server.tool("foodblock_read", "Read a block (with its refusals and signature check), a thing (its state now, where it is, who owns it), a promise (its stage: asked, offered, accepted, underway, done...) or a draft (pending, sent, discarded).",
    { hash: z.string().min(6) }, guard(async ({ hash }) => door.read(hash)));

  server.tool("foodblock_ask", "Draft an ask or quote request for the PERSON to send (from an offer, or for a thing from someone). Nothing is sent: it returns a draft, a receipt code and an approval link for the person to open and tap. An unanswered ask binds no one. Give the link to the person; never try to open it yourself.",
    { offer: z.string().optional().describe("an offer's hash from foodblock_find"), from: z.string().optional().describe("the seller's id, if no offer"), what: z.string().optional().describe("a thing's hash, if no offer"), ...terms, days: z.number().int().min(1).max(60).optional() },
    guard(async (input) => door.ask(input)));

  server.tool("foodblock_promise", "Make a firm promise for the person (a binding ask to someone who has dealt with them before). Binds ONLY if the person has connected you with a grant that names `promise` and the other side is not a stranger; otherwise it returns a draft for the person to approve.",
    { to: z.string().describe("the other side's id"), what: z.string().describe("a thing's hash"), ...terms },
    guard(async (input) => door.promise(assistant, input)));

  server.tool("foodblock_accept", "Accept an offer or counter-offer for the person. Binds ONLY under a live grant that names `promise`; otherwise it returns a draft for the person to approve.",
    { promise: z.string().describe("the offer's hash"), quantity: amount.optional() }, guard(async (input) => door.accept(assistant, input)));

  server.tool("foodblock_connect", "Pair this assistant to the person's node. Returns a grant draft and an approval link for the person. With no acts you may only find, read and draft. Ask for `promise` only if the person wants you to bind for them.",
    { acts: z.array(z.string()).default([]).describe("block types or type.kind names you may sign, e.g. [\"promise\"]; default none"), days: z.number().int().min(1).max(365).default(30), limit: money.optional().describe("the most money one act may involve") },
    guard(async (input) => door.connect(assistant, input)));

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
  const door = createDoor({ node: memoryNode(), person, code, persist });
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
async function serveHttp(door, port) {
  const sessions = new Map(), approve = approvalHandler(door);
  const server = http.createServer(async (req, res) => {
    try {
      if (await approve(req, res)) return;
      if (!req.url.startsWith("/mcp")) { res.writeHead(404).end(); return; }
      const id = req.headers["mcp-session-id"];
      let transport = id && sessions.get(id);
      if (!transport) {
        if (req.method !== "POST") { res.writeHead(400).end("no session"); return; }
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (sid) => sessions.set(sid, transport) });
        transport.onclose = () => transport.sessionId && sessions.delete(transport.sessionId);
        await createServer({ door }).connect(transport);
      }
      let body; if (req.method === "POST") { let raw = ""; for await (const chunk of req) raw += chunk; try { body = JSON.parse(raw); } catch { res.writeHead(400).end("bad json"); return; } }
      await transport.handleRequest(req, res, body);
    } catch (error) { if (!res.headersSent) res.writeHead(500); res.end(String(error.message)); }
  });
  await new Promise((done) => server.listen(port, process.env.FOODBLOCK_HOST || "127.0.0.1", done));
  door.base = `http://${process.env.FOODBLOCK_HOST || "127.0.0.1"}:${server.address().port}`;
  return server;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isDirectRun) {
  const door = build();
  const flag = process.argv.indexOf("--http");
  if (flag > -1) {
    const server = await serveHttp(door, Number(process.argv[flag + 1]) || Number(process.env.PORT) || 7420);
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
export { seed, createDoor, memoryNode, newPerson, approvalHandler, serveHttp };
