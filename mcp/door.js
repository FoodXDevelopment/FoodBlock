// The door (the MCP server's logic, with no transport in it). Any assistant can find, read, ask and promise on FoodBlock
// through it, under six rules:
//   1. The agent drafts; the person decides. A draft is node-local data (core.md section 10), never a block. The
//      person's one tap on the approval page signs it with the person's own key.
//   2. An unanswered ask binds no one (promises.md).
//   3. A first message to a stranger has a human author (consent.md): `ask` is always a draft; an agent-signed block
//      goes out only when the SDK's admission check says it may.
//   4. STOP binds the sender: the `consent` fold is asked before every draft and every send (`stopped`). This is the sender's
//      own discipline; a node never refuses a block for a STOP (consent.md, invariant 29).
//   5. It never holds money: there is no transfer, payment or deposit here, and a grant's money limit is the fence.
//   6. Open types, closed authority: the assistant writes no raw blocks. Every block is one of two shapes, an ask
//      (the person's) or a promise or accept under a live grant (the agent's, naming it in refs.under).
// Every protocol rule is the SDK's (Rust core through WebAssembly): this file composes and asks, it checks nothing itself.
import fb from "@foodxdev/foodblock";
import { randomBytes, timingSafeEqual } from "node:crypto";

const clock = () => new Date().toISOString();
const plusDays = (days, now = clock()) => new Date(Date.parse(now) + days * 864e5).toISOString();
const reasons = (error) => error?.wrong || [error?.message || String(error)];

/** The node: an in-memory store of signed blocks. It admits a block only if the SDK accepts it. */
export function memoryNode() {
  const blocks = new Map();
  const all = () => [...blocks.values()];
  return {
    all,
    get: (hash) => blocks.get(hash) || all().find((block) => block.hash.startsWith(hash)) || null,
    /** Take a signed block in: the SDK's accept (valid against what is held). Returns { taken, refused }. */
    push(signed) {
      const { salts, ...block } = signed;
      const result = fb.sync.accept([block], all());
      result.taken.forEach((taken) => blocks.set(taken.hash, taken));
      return { taken: result.taken, refused: result.refused, waiting: result.waiting };
    },
  };
}

/** Someone who signs: keys, genesis and everything they have signed, so each block takes its place in their chain. */
export function newPerson(kind = "person") {
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair(), recovery = fb.generateKeypair();
  const genesis = fb.identity.genesis(keys, { kind, encryptionKey: encryption.public_key_encrypt, recoveryKey: recovery.public_key_sign, reach: "P30D" });
  return { keys, encryption, genesis, chain: [genesis], id: genesis.hash, recovery };
}

const scopeOf = (grant) => grant?.state?.scope || {};

/**
 * @param node    the node the person's blocks live on ({ all, get, push })
 * @param person  who the person is: { id, keys, chain } (the door signs as them only on their tap)
 * @param options { now, code, base, persist }
 */
export function createDoor({ node = memoryNode(), person = newPerson(), now = clock, code, persist = () => {}, drafts = new Map() } = {}) {
  const approvalCode = code || randomBytes(5).toString("hex").toUpperCase().replace(/(.{5})(.{5})/, "$1-$2");
  // id -> draft (pending | sent | discarded). A host may pass a durable Map (store.js durableDrafts) with touch(): called after every change, so a restart loses no link.
  const touch = () => drafts.touch?.();
  const door = { node, person, drafts, approvalCode, base: "", now };
  node.push(person.genesis);
  person.chain.forEach((block) => node.push(block));

  // ---- Signing ----
  // The person signs on their tap; an agent signs only under a live grant, naming it.
  const writeAs = (who, spec, extra = {}) => {
    const signed = fb.write(spec.type, spec.state, spec.refs, { author: who.id, key: who.keys, held: who.chain, ...extra });
    return signed;
  };
  const keep = (who, signed) => {
    const { salts, ...block } = signed;
    who.chain.push(block);
    node.push(block);
    if (who === person) persist(person);
    return block;
  };

  // What the SDK says of a block for a receiver: not_admitted, not_human, and `stopped` when the person's live word is STOP.
  const admission = (block, receiver) => {
    const codes = fb.sync.admissionRefusals(block, receiver, node.all(), {}, 0).map((r) => r.code);
    const word = fb.consent(receiver, block.refs?.author, node.all(), block.refs?.under).word;
    return word === "stop" ? [...codes, "stopped"] : codes;
  };

  // ---- Drafts ----
  /** Keep a draft for the person to decide. A trial write proves it would sign; the trial is thrown away. */
  function draft(kind, spec, { to, summary, why } = {}) {
    const trial = writeAs(person, spec);                 // refuses a malformed block here, not at the tap
    const stopped = to ? admission(trial, to).filter((code) => code === "stopped") : [];
    if (stopped.length) throw Object.assign(new Error(`stopped: ${to.slice(0, 8)} asked for no contact; nothing was drafted`), { wrong: ["stopped"] });
    const id = randomBytes(32).toString("hex");
    const item = { id, kind, spec, to: to || null, summary, why: why || null, status: "pending", at: now(), receipt: fb.receiptCode(id) };
    drafts.set(id, item); touch();
    return view(item);
  }
  const link = (id) => `${door.base}/approve/${id}`;
  const view = (item) => ({ draft: item.id, kind: item.kind, status: item.status, bound: false, receipt: item.receipt, summary: item.summary,
    ...(item.why ? { why_a_draft: item.why } : {}), approve_at: link(item.id), next: "Give the person this link. Nothing is sent or bound until they tap send." });

  /** The person's tap: sign the draft with their own key, check STOP once more, keep and send it. */
  function approve(id, given) {
    const item = drafts.get(id);
    if (!item) return { ok: false, reason: "no such draft" };
    if (!codeOk(given)) return { ok: false, reason: "wrong approval code" };
    if (item.status !== "pending") return { ok: false, reason: `already ${item.status}` };
    try {
      const signed = writeAs(person, item.spec);
      if (item.to) {
        const refusals = admission(signed, item.to);
        if (refusals.includes("stopped")) { item.status = "stopped"; return { ok: false, reason: "stopped: the recipient asked for no contact" }; }
      }
      const block = keep(person, signed);
      item.status = "sent"; item.block = block.hash;
      return { ok: true, block: block.hash, receipt: fb.receiptCode(block.hash), kind: item.kind };
    } catch (error) { return { ok: false, reason: reasons(error).join("; ") }; }
  }
  const discard = (id, given) => {
    const item = drafts.get(id);
    if (!item || !codeOk(given) || item.status !== "pending") return { ok: false };
    item.status = "discarded"; return { ok: true };
  };
  function codeOk(given) {
    const a = Buffer.from(String(given || "").trim().toUpperCase()), b = Buffer.from(approvalCode);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ---- The assistant: one agent per connection ----
  /** A new assistant session: its own identity, no authority until the person approves a grant. */
  function agent(name = "assistant") {
    const me = newPerson("agent");
    node.push(me.genesis);
    const state = { ...me, name, grant: null };
    return state;
  }

  const grantOf = (assistant) => {
    // the grant is the assistant's own record, or (after a restart) the approved grant draft that names it
    const hash = assistant.grant || [...drafts.values()].find((d) => d.kind === "grant" && d.assistant?.id === assistant.id && d.block)?.block;
    const grant = hash && node.get(hash);
    if (!grant) return null;
    const live = fb.grant.isLive(grant, node.all(), { now: now() });
    return live ? grant : null;
  };

  /** connect: pair this assistant to the person's node. The grant is a draft until the person taps. */
  function connect(assistant, { acts = [], days = 30, limit } = {}) {
    const until = plusDays(Math.min(Math.max(days, 1), 365), now());
    const scope = { acts: [...new Set(acts)], until, ...(limit ? { limit } : {}) };
    const spec = { type: "grant", state: { kind: "assistant", scope }, refs: { to: assistant.id } };
    const operator = { type: "grant", state: { kind: "operator", scope: {} }, refs: { to: assistant.id } };
    const item = draft("grant", spec, { summary: describeGrant(assistant.name, scope) });
    const held = drafts.get(item.draft);
    held.also = operator; held.assistant = assistant; touch();
    return item;
  }
  // A grant's approval also signs the operator grant (the person answers for this assistant).
  const approveBase = approve;
  door.approve = (id, given) => {
    const item = drafts.get(id);
    const result = approveBase(id, given);
    if (result.ok && item?.kind === "grant") {
      keep(person, writeAs(person, item.also));
      item.assistant.grant = result.block;
    }
    touch();
    return result;
  };
  door.discard = (id, given) => { const result = discard(id, given); touch(); return result; };

  // ---- Reading the world ----
  const textOf = (block) => [block?.state?.name, block?.state?.kind, block?.state?.what].filter(Boolean).join(" ").toLowerCase();
  const thingOf = (hash) => node.get(hash);
  const latest = (thing) => { // the newest version of a record, by its own author's updates
    let current = thing;
    for (let next; (next = node.all().find((b) => b.refs?.updates === current.hash && b.refs.author === current.refs.author));) current = next;
    return current;
  };
  const placesNamed = (near) => node.all().filter((b) => b.type === "thing" && (b.hash === near || textOf(b).includes(String(near).toLowerCase())) && (b.hash === near || b.state?.kind === "place"));

  function standing(counterparty) {
    const refusals = admission({ type: "promise", state: {}, refs: { author: person.id, to: counterparty } }, counterparty);
    return { stopped: refusals.includes("stopped") };
  }

  function find({ kind = "offers", what, near, limit = 20 } = {}) {
    const t = now(), words = String(what || "").toLowerCase().trim();
    const here = near ? new Set(placesNamed(near).map((p) => p.hash)) : null;
    const placeOk = (block, thing) => !here || [block.refs?.place, thing?.refs?.place].some((p) => p && here.has(p));
    const matches = (thing) => !words || textOf(thing).includes(words);
    const stage = (block) => fb.promiseView(block, node.all(), { now: t });
    const offers = node.all().filter((b) => b.type === "promise" && !b.refs.answers && b.refs.from && b.refs.author === b.refs.from && b.refs.from !== person.id)
      .filter((b) => { const thing = b.refs.what && thingOf(b.refs.what); return matches(thing || b) && placeOk(b, thing); })
      .map((b) => ({ b, view: stage(b) })).filter(({ view: v }) => v.stage === "offered");
    const ofPeer = (id) => ({ id, kind: node.get(id)?.state?.kind || null, no_contact: standing(id).stopped });
    if (kind === "offers") return offers.slice(0, limit).map(({ b }) => {
      const thing = thingOf(b.refs.what);
      return { offer: b.hash, from: ofPeer(b.refs.from), what: thing ? { hash: thing.hash, kind: thing.state.kind, name: thing.state.name } : b.state.what || null,
        price: b.state.terms?.price || null, quantity: b.state.terms?.quantity || null, deliver_by: b.state.terms?.deliver_by || null, expires: b.state.terms?.expires || null };
    });
    if (kind === "things") return node.all().filter((b) => b.type === "thing" && b.state.kind !== "place" && b.state.kind !== "schema" && matches(b) && placeOk(b, b))
      .filter((b) => !node.all().some((n) => n.refs?.updates === b.hash && n.refs.author === b.refs.author)).slice(0, limit)
      .map((b) => ({ thing: b.hash, kind: b.state.kind, name: b.state.name || null, owner_or_author: b.refs.author, place: b.refs.place || null }));
    if (kind === "peers") {
      const authors = new Set(offers.map(({ b }) => b.refs.author));
      node.all().filter((b) => b.type === "thing" && b.refs.author !== person.id && matches(b) && placeOk(b, b)).forEach((b) => authors.add(b.refs.author));
      return [...authors].slice(0, limit).map(ofPeer);
    }
    throw new Error("kind is offers, things or peers");
  }

  function read(hash) {
    const item = drafts.get(hash);
    if (item) return { draft: view(item), status: item.status, ...(item.block ? { block: item.block } : {}) };
    const block = node.get(hash);
    if (!block) throw new Error("No such block here.");
    const others = node.all().filter((b) => b.hash !== block.hash);
    const out = { block, refusals: fb.valid(block, others), signed_by_author: fb.identity.signedByAuthor(block, node.all()), receipt: fb.receiptCode(block.hash) };
    if (block.type === "promise") {
      const first = block.refs.answers || block.refs.for ? node.get(block.refs.for || block.refs.answers) || block : block;
      out.promise = { first: first.hash, ...pick(fb.promiseView(first, node.all(), { now: now() }), ["stage", "sides", "quantity", "accept", "lines", "total", "paid", "stop", "stopped"]) };
    }
    if (block.type === "thing") {
      const current = latest(block);
      out.thing = { version: current.hash, state: current.state, where_now: fb.whereNow(current, node.all()), owner: fb.ownerOf(current, node.all()) };
    }
    return out;
  }
  const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));

  // ---- Asking and promising ----
  const termsOf = ({ price, quantity, deliver_by, expires, days = 7 }, t = now()) =>
    ({ ...(price ? { price } : {}), ...(quantity ? { quantity } : {}), ...(deliver_by ? { deliver_by } : {}), expires: expires || plusDays(days, t) });

  /** ask: a want or quote request in the person's name. Always a draft; a human tap sends it. */
  function ask({ from, what, offer, ...terms }) {
    const source = offer && node.get(offer);
    const target = what || source?.refs?.what;
    const seller = from || source?.refs?.from;
    const refs = { to: person.id, ...(seller ? { from: seller } : {}), ...(target ? { what: target } : {}), ...(source ? { derives_from: source.hash } : {}) };
    const spec = { type: "promise", state: { terms: termsOf(terms), ...(target ? {} : { what: String(what) }) }, refs };
    return draft("ask", spec, { to: seller, summary: describe("Ask", node.get(target), seller, spec.state.terms), why: "A first message to a stranger has a human author: you tap send." });
  }

  /** promise: the assistant's own binding block, only under a live grant that names the act, never to a stranger. */
  function promise(assistant, { to, what, ...terms }) {
    const spec = { type: "promise", state: { terms: termsOf(terms) }, refs: { to: person.id, from: to, what } };
    return bind(assistant, "promise", spec, to, describe("Promise", node.get(what), to, spec.state.terms));
  }

  /** accept: answer an offer or counter-offer `accepted`, for the person, under a live grant. */
  function accept(assistant, { promise: target, quantity }) {
    const offer = node.get(target);
    if (!offer || offer.type !== "promise") throw new Error("No such promise here.");
    const first = node.get(offer.refs.for) || offer;
    const seller = offer.refs.author;
    const spec = { type: "promise", state: { status: "accepted", ...(quantity ? { terms: { quantity } } : {}) }, refs: { answers: offer.hash, for: first.hash } };
    return bind(assistant, "accept", spec, seller, describe("Accept", node.get(offer.refs.what), seller, offer.state.terms), offer);
  }

  function bind(assistant, kind, spec, counterparty, summary, offer) {
    const grant = grantOf(assistant);
    const why = [];
    if (!grant) why.push("no live grant: this assistant is not connected, or the person's grant ended");
    else if (!(scopeOf(grant).acts || []).includes("promise")) why.push("the grant does not name the act `promise`: an agent's ask is a quote request");
    const money = spec.state.terms?.price || offer?.state?.terms?.price;
    if (grant && money?.money && scopeOf(grant).limit && !fb.grant.withinLimit(scopeOf(grant).limit, money.money, 0)) why.push("over the person's limit");
    if (!why.length) {
      const refs = { ...spec.refs, under: grant.hash };
      try {
        const signed = writeAs(assistant, { ...spec, refs }, {});
        const words = { not_human: "counterparty is a stranger: a human sends the first message", stopped: "stopped: the counterparty asked for no contact" };
        const refusals = [...fb.grant.whyNotUnder(signed, node.all(), { now: now() }).map((r) => r.detail || r.code || String(r)), ...admission(signed, counterparty).map((code) => words[code] || code)];
        if (!refusals.length) {
          const block = keep(assistant, signed);
          return { bound: true, kind, block: block.hash, receipt: fb.receiptCode(block.hash), summary, signed_under: grant.hash };
        }
        why.push(...refusals);
      } catch (error) { why.push(...reasons(error)); }
    }
    if (why.some((w) => w.startsWith("stopped"))) throw Object.assign(new Error("stopped: the counterparty asked for no contact; nothing was drafted"), { wrong: ["stopped"] });
    return draft(kind, spec, { to: counterparty, summary, why: why.join("; ") });
  }

  // ---- A remote node: read what the host holds before a call, send what was signed after it ----
  /** Before a call: the node's truth (a remote node pulls), and the person's chain rebuilt from it so the next block takes its place after any the person signed elsewhere. */
  door.sync = async () => {
    if (!node.refresh) return;
    await node.refresh();
    const mine = node.all().filter((b) => b.hash === person.id || b.refs?.author === person.id);
    const seq = (b) => (b.hash === person.id ? 0 : b.state?.seq ?? Infinity);
    person.chain.splice(0, person.chain.length, ...mine.sort((a, b) => seq(a) - seq(b)));
  };
  /** After a call: send what the door signed. A refusal from the host throws. */
  door.flush = async () => { if (node.flush) await node.flush(); };

  return Object.assign(door, { agent, connect, find, read, ask, promise, accept, pending: () => [...drafts.values()].filter((d) => d.status === "pending") });
}

const mark = (m) => (m ? `${(m.minor / 100).toFixed(2)} ${m.currency}` : null);
function describe(verb, thing, party, terms) {
  const price = terms?.price?.money ? `${mark(terms.price.money)} per ${terms.price.per?.value ?? 1} ${terms.price.per?.unit ?? ""}`.trim() : terms?.price?.minor ? mark(terms.price) : null;
  return [verb, terms?.quantity ? `${terms.quantity.value} ${terms.quantity.unit}` : null, thing ? thing.state.name || thing.state.kind : null,
    party ? `with ${party.slice(0, 8)}` : "to anyone", price ? `at ${price}` : "(no price: they will quote)", terms?.deliver_by ? `by ${terms.deliver_by}` : null,
    `until ${terms?.expires || "-"}`].filter(Boolean).join(" ");
}
function describeGrant(name, scope) {
  const acts = scope.acts.length ? `may bind you on: ${scope.acts.join(", ")}` : "may find, read and draft only; it cannot bind you";
  return `Connect "${name}": it ${acts}, until ${scope.until}${scope.limit ? `, up to ${mark(scope.limit)}` : ""}.`;
}

// ---- The approval page (the person's tap) ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FoodX approval</title><body style="font:18px system-ui;max-width:32rem;margin:2rem auto;padding:0 1rem">${body}<p style="font-size:13px;color:#777">Built on the open FoodBlock protocol.</p></body>`;

/** Serve /approve/<draft>: GET shows exactly what would be signed; POST with the approval code signs or discards. */
export function approvalHandler(door) {
  return async (req, res) => {
    const match = /^\/approve\/([0-9a-f]{64})$/.exec(new URL(req.url, "http://x").pathname);
    if (!match) return false;
    const id = match[1], item = door.drafts.get(id);
    const send = (status, html) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(page(html)); return true; };
    if (!item) return send(404, "<p>No such draft.</p>");
    if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break; }
      const form = new URLSearchParams(raw);
      let result;
      try {
        await door.sync();
        result = form.get("do") === "discard" ? door.discard(id, form.get("code")) : door.approve(id, form.get("code"));
        if (result.ok) await door.flush();
      } catch (error) { result = { ok: false, reason: `the node did not take it: ${error.message}` }; }
      return send(result.ok ? 200 : 403, result.ok ? `<h2>${form.get("do") === "discard" ? "Discarded" : "Sent"}</h2>${result.receipt ? `<p>Receipt <b>${esc(result.receipt)}</b></p>` : ""}` : `<h2>Not done</h2><p>${esc(result.reason || "wrong approval code")}</p>`);
    }
    if (item.status !== "pending") return send(200, `<p>This draft is ${esc(item.status)}.</p>`);
    return send(200, `<h2>${esc(item.kind)}</h2><p>${esc(item.summary)}</p><p>Receipt <b>${esc(item.receipt)}</b></p>
      <form method="post"><p><input name="code" placeholder="your approval code" autocomplete="off" style="font:inherit;width:100%"></p>
      <button name="do" value="send" style="font:inherit">Send as me</button> <button name="do" value="discard" style="font:inherit">Discard</button></form>
      <p style="color:#666;font-size:14px">Nothing is sent or bound until you tap. Reply STOP-style contact limits are checked again at the tap.</p>`);
  };
}
