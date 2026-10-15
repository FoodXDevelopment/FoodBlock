#!/usr/bin/env node
// The FoodBlock MCP server (spec/core.md): any AI agent can read and write FoodBlocks through it. It writes as one
// identity: their genesis (an `actor` naming their signing key, and their encryption and recovery keys if they have
// them), and every block they say, through the SDK's one write path (`write`: compose, check, sign, the next place in
// their key chain). There is no earlier version in the protocol: it writes and reads 1.6 only. Eight tools, each one
// thing the protocol is: info, create, get, query, history, check, valid, verify.
//
// FOODBLOCK_IDENTITY  a file holding this identity's keys, genesis and every block it signs here (the CLI's format:
//                     `fb init` makes one), made on first run (kept 0600), so its key chain carries on across runs;
//                     without it, a new identity each run. FOODBLOCK_SEED=off starts empty instead of with a small story.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fb from "@foodxdev/foodblock";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Someone who signs: their keys, their genesis and everything they have signed, so each block takes its place. A new
// identity's recovery key is named by its hash in the genesis and never kept beside the other keys: with
// FOODBLOCK_IDENTITY it goes to <file>.recovery.json (as `fb init` does), to be kept offline; without it, it is dropped.
function person(saved) {
  if (saved) return { ...saved, id: saved.genesis.hash };
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair(), recovery = fb.generateKeypair();
  const genesis = fb.identity.genesis(keys, { encryptionKey: encryption.public_key_encrypt, recoveryKey: recovery.public_key_sign, reach: "P30D" });
  return { keys, encryption, genesis, chain: [genesis], id: genesis.hash, recovery };
}
const identityFile = process.env.FOODBLOCK_IDENTITY;
const isNew = identityFile && !existsSync(identityFile);
const saveIdentity = (me) => { if (identityFile) { const { keys, encryption, genesis, chain } = me; writeFileSync(identityFile, JSON.stringify({ keys, encryption, genesis, chain }, null, 2), { mode: 0o600 }); } };

const blocks = new Map(); // hash -> signed block, as signed
const keep = (signed) => { blocks.set(signed.hash, signed); return signed; };
const all = () => [...blocks.values()];

// Write as an identity: the SDK's write (compose, check, sign, chain). A private audience is written as commitments;
// the salts come back beside the block.
function say(author, { type, kind, state = {}, refs = {}, audience = "public" }) {
  const signed = fb.write(type, { ...(kind ? { kind } : {}), ...state }, refs, { author: author.id, key: author.keys, held: author.chain, audience });
  const { salts, ...block } = signed;
  keep(block);
  author.chain.push(block);
  if (author === self) saveIdentity(self);
  return signed;
}

const self = identityFile && existsSync(identityFile) ? person(JSON.parse(readFileSync(identityFile, "utf8"))) : person();
if (isNew) writeFileSync(`${identityFile}.recovery.json`, JSON.stringify({ id: self.id, recovery: self.recovery }, null, 2), { mode: 0o600 });
saveIdentity(self);
self.chain.forEach(keep);

// A small story to read on each start, by people other than this server's: a mill, its flour, an offer of it to a
// bakery, and someone's review of the bakery.
if (process.env.FOODBLOCK_SEED !== "off") {
  const mill = person(), bakery = person(), eater = person();
  [mill, bakery, eater].forEach((one) => keep(one.genesis));
  const flour = say(mill, { type: "thing", kind: "flour", state: { name: "Strong white flour", marks: [{ scheme: "lot", value: "HM-2210" }] } });
  say(mill, { type: "promise", state: { terms: { price: fb.money(2400, "GBP"), quantity: fb.amount("16", "kg"),
    deliver_by: "2026-10-09T09:00:00.000Z", expires: "2026-10-08T18:00:00.000Z" } },
    refs: { from: mill.id, to: bakery.id, what: flour.hash } });
  say(eater, { type: "observe", kind: "review", state: { text: "The sourdough is excellent.", confidence: "0.9" }, refs: { subject: bakery.id } });
}

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ isError: true, content: [{ type: "text", text: error.message }] });
const held = (hash) => blocks.get(hash) || all().find((block) => block.hash.startsWith(hash)) || null;
// A type is a word (core.md): seven are known, any other is open. Four carry authority and are closed.
const typeName = z.string().regex(new RegExp(fb.PROTOCOL.grammar.type_name));

export function createServer() {
  const server = new McpServer({ name: "foodblock", version: fb.VERSION });

  // Every list here is the SDK's, read from protocol.json: nothing is retyped.
  const P = fb.PROTOCOL;
  server.tool("foodblock_info", "What FoodBlock is: its seven known types (four closed), seven verbs, shared refs, shapes, terms, statuses and scope, and who this server writes as.", {},
    async () => text({ protocol: fb.VERSION, types: fb.TYPES, verbs: fb.VERBS, refs: fb.REF_KEYS, author: self.id, blocks: blocks.size,
      closed_types: P.closed_types, statuses: P.statuses, stop: P.stop, grant_kinds: P.grant_kinds, powers: P.powers, suites: fb.SUITES, shapes: P.shapes,
      terms: P.terms, line: P.line, scope: P.scope, time_fields: P.time_fields, grammar: P.grammar, peers: P.peers, optional_profiles: Object.keys(P.optional_profiles).filter((name) => name !== "about") }));

  server.tool("foodblock_create", "Write a FoodBlock block as this server's identity: placed in their key chain, checked, signed, kept. Every place is a thing; a schema is a thing of kind schema. A private audience (a list of ids) is written as commitments; the salts come back beside the block.",
    { type: typeName, kind: z.string().optional(), state: z.record(z.any()).default({}), refs: z.record(z.any()).default({}),
      audience: z.union([z.literal("public"), z.array(z.string())]).default("public") },
    async (input) => { try { return text(say(self, input)); } catch (error) { return failure(error); } });

  server.tool("foodblock_get", "Read one FoodBlock by its hash (or the start of it), exactly as signed.", { hash: z.string().min(6) },
    async ({ hash }) => { const block = held(hash); return block ? text(block) : failure(new Error("No such block here.")); });

  server.tool("foodblock_query", "Find FoodBlocks by type and kind, or by a ref. The SDK's pull filter.",
    { type: typeName.optional(), kind: z.string().optional(), ref_role: z.string().optional(), ref_value: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) },
    async ({ type, kind, ref_role, ref_value, limit }) => {
      const filter = { ...(type ? { type } : {}), ...(kind ? { kind } : {}), ...(ref_role ? { refs: { [ref_role]: ref_value } } : {}) };
      return text(all().filter((block) => fb.sync.matches(block, filter, all())).slice(0, limit));
    });

  server.tool("foodblock_history", "Every version of a record, oldest first: a record is named by its first version, and updated only by its author.", { hash: z.string().min(6) },
    async ({ hash }) => {
      const start = held(hash);
      if (!start) return failure(new Error("No such block here."));
      let first = start;
      for (let back; first.refs?.updates && (back = blocks.get(first.refs.updates));) first = back;
      const versions = fb.causalOrder(all().filter((block) => fb.sync.matches(block, { record: first.hash }, all()) && block.refs?.author === first.refs?.author));
      return text({ identity: first.hash, versions });
    });

  server.tool("foodblock_check", "Check a block as a writer must (its chain fields, refs, fields, shapes, no floats) without writing it: what is wrong, in plain words.",
    { type: z.string(), state: z.record(z.any()).default({}), refs: z.record(z.any()).default({}) },
    async ({ type, state, refs }) => text({ errors: fb.check(type, state, refs) }));

  server.tool("foodblock_valid", "valid(block, context): every refusal of a held block against the blocks held here, in the order of core.md section 8: [] when the bytes are sound, its signing key speaks for its author and it fits its key's chain.",
    { hash: z.string().min(6) },
    async ({ hash }) => {
      const block = held(hash);
      if (!block) return failure(new Error("No such block here."));
      return text({ hash: block.hash, refusals: fb.valid(block, all().filter((other) => other.hash !== block.hash)) });
    });

  server.tool("foodblock_verify", "Check that a held block was signed by its author, with a key their identity still holds for it.",
    { hash: z.string().min(6) },
    async ({ hash }) => {
      const block = held(hash);
      if (!block) return failure(new Error("No such block here."));
      return text({ hash: block.hash, signedByItsAuthor: fb.identity.signedByAuthor(block, all()) });
    });

  return server;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isDirectRun) await createServer().connect(new StdioServerTransport());
