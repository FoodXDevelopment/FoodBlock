// The door (the MCP server's logic, with no transport in it). Any assistant can find, read, ask and promise on FoodBlock
// through it, under six rules:
//   1. The autonomous system drafts; the person decides. A draft is node-local data (core.md section 10), never a block. The
//      person's one tap on the approval page signs it with the person's own key.
//   2. An unanswered ask binds no one (promises.md).
//   3. A first message to a stranger has a human author (consent.md): `ask` is always a draft; an autonomous system-signed block
//      goes out only when the SDK's admission check says it may.
//   4. STOP binds the sender: the `consent` fold is asked before every draft and every send (`stopped`). This is the sender's
//      own discipline; a node never refuses a block for a STOP (consent.md, invariant 29).
//   5. It never holds money: there is no transfer, payment or deposit here, and a grant's money limit is the fence.
//   6. Open types, closed authority: the assistant writes no raw blocks. Every block is one of two shapes, an ask
//      (the person's) or a promise or accept under a live grant (the autonomous system's, naming it in refs.under).
// Every protocol rule is the SDK's (Rust core through WebAssembly): this file composes and asks, it checks nothing itself.
import fb from "@foodxdev/foodblock";
import { randomBytes, timingSafeEqual } from "node:crypto";

const clock = () => new Date().toISOString();
// An identity's own first block (the genesis of a person, an assistant, a host's operator) is what others find a person by: the door states
// it public where it makes one. Every other block names the audience its person chose (a draft carries it; none is filled in).
export const IDENTITY_AUDIENCE = "public";
// The door's own choice at the node: both blocks of a pair arriving together are kept as proof and neither is taken.
const TAKES_PAIRS = false;
const plusDays = (days, now = clock()) => new Date(Date.parse(now) + days * 864e5).toISOString();
const reasons = (error) => error?.wrong || [error?.message || String(error)];

// A short id finds a block only when exactly one block starts with it, and never under 8 characters: an ambiguous one finds nothing.
export const unique = (blocks, prefix) => { const p = String(prefix || ""); if (p.length < 8) return null; const found = blocks.filter((block) => block.hash.startsWith(p)); return found.length === 1 ? found[0] : null; };
const ID = new RegExp(fb.PROTOCOL.grammar.id);
const fullId = (value, what) => { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${what} is a full id, never a prefix`); return value; };

/** The node: an in-memory store of signed blocks. It admits a block only if the SDK accepts it. */
export function memoryNode() {
  const blocks = new Map();
  const all = () => [...blocks.values()];
  return {
    all,
    get: (hash) => blocks.get(hash) || unique(all(), hash),
    /** Take a signed block in: the SDK's accept (valid against what is held). Returns { taken, refused }. */
    push(signed) {
      const { salts, ...block } = signed;
      const result = fb.sync.accept([block], all(), { takesPairs: TAKES_PAIRS });
      result.taken.forEach((taken) => blocks.set(taken.hash, taken));
      return { taken: result.taken, refused: result.refused, waiting: result.waiting };
    },
  };
}

/** Someone who signs: keys, genesis and everything they have signed, so each block takes its place in their chain. A `custodian` (an id) is named in the genesis when someone else holds the key (identity.md, Held keys). */
export function newPerson(kind = "person", { custodian, reach } = {}) {
  // the recovery window is the person's own word (identity.md): nothing here states one for them
  if (typeof reach !== "string" || !reach) throw new Error("newPerson: reach is required: how long after a theft a recovery key may reach back, as a duration the person states (for example P30D)");
  const keys = fb.generateKeypair(), encryption = fb.generateEncryptionKeypair(), recovery = fb.generateKeypair();
  const genesis = fb.identity.genesis(keys, { kind, encryptionKey: encryption.public_key_encrypt, recoveryKey: recovery.public_key_sign, reach, at: clock(), audience: IDENTITY_AUDIENCE, ...(custodian ? { custodian } : {}) });
  return { keys, encryption, genesis, chain: [genesis], id: genesis.hash, recovery };
}

const scopeOf = (grant) => grant?.state?.scope || {};

/**
 * @param node    the node the person's blocks live on ({ all, get, push })
 * @param person  who the person is: { id, keys, chain } (the door signs as them only on their tap)
 * @param options { now, code, base, persist }
 */
export function createDoor({ node = memoryNode(), reach, person = newPerson("person", { reach }), now = clock, code, persist = () => {}, drafts = new Map() } = {}) {
  const approvalCode = code || randomBytes(5).toString("hex").toUpperCase().replace(/(.{5})(.{5})/, "$1-$2");
  // id -> draft (pending | sent | discarded). A host may pass a durable Map (store.js durableDrafts) with touch(): called after every change, so a restart loses no link.
  const touch = () => drafts.touch?.();
  const door = { node, person, drafts, approvalCode, base: "", now };
  node.push(person.genesis);
  person.chain.forEach((block) => node.push(block));

  // ---- Signing ----
  // The person signs on their tap; an autonomous system signs only under a live grant, naming it.
  const writeAs = (who, spec, extra = {}) => {
    const signed = fb.write(spec.type, spec.state, spec.refs, { author: who.id, key: who.keys, held: who.chain, at: now(), audience: spec.audience, ...extra });
    return signed;
  };
  // A block is the signer's only once the node took it: one the node leaves waiting or refuses is never reported as sent or bound (door/t8).
  const keep = (who, signed) => {
    const { salts, ...block } = signed;
    const result = node.push(block);
    if (!result.taken?.some((taken) => taken.hash === block.hash)) {
      const why = [...(result.refused || []).map((r) => r.detail || r.code), ...(result.waiting || []).map((w) => `waiting for ${[].concat(w.needs || []).join(", ")}`)];
      throw Object.assign(new Error(`the node did not take it: ${why.join("; ") || "not taken"}`), { wrong: why });
    }
    who.chain.push(block);
    if (who === person) persist(person);
    return block;
  };

  // What the SDK says of a block for a receiver: not_admitted, not_human, and `stopped` when the person's live word is STOP.
  // The protocol keeps no admission default (consent.md, No default); this door's own choice is that a person writes first.
  const admission = (block, receiver) => {
    const codes = fb.sync.admissionRefusals(block, receiver, node.all(), { order_channel: [] }, 0).map((r) => r.code);
    const word = fb.consent(receiver, block.refs?.author, node.all(), block).word;
    return word === "stop" ? [...codes, "stopped"] : codes;
  };

  // ---- Drafts ----
  /** Keep a draft for the person to decide. A trial write proves it would sign; the trial is thrown away. */
  function draft(kind, spec, { to, summary, why } = {}) {
    const trial = writeAs(person, spec);                 // refuses a malformed block here, not at the tap
    const stopped = to ? admission(trial, to).filter((code) => code === "stopped") : [];
    if (stopped.length) throw Object.assign(new Error(`stopped: ${to.slice(0, 8)} asked for no contact; nothing was drafted`), { wrong: ["stopped"] });
    // the person's list of what waits for a tap is bounded: an assistant cannot bury the one that matters under thousands (agents/t18)
    if ([...drafts.values()].filter((d) => d.status === "pending").length >= MAX_PENDING) throw Object.assign(new Error(`${MAX_PENDING} drafts already wait for the person's tap: ask them to send or discard some first`), { wrong: ["too_many_drafts"] });
    const id = randomBytes(32).toString("hex");
    const item = { id, kind, spec, audience: spec.audience, to: to || null, summary, why: why || null, status: "pending", at: now(), receipt: fb.receiptCode(id) };
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
  // A wrong code costs its sender a small constant wait before the answer (the approval page sleeps, below), and locks nothing: a stranger who
  // sends wrong codes can no longer lock the person out, and a guess is still a second long (release 50; door/t12).
  function codeOk(given) {
    const a = Buffer.from(String(given || "").trim().toUpperCase()), b = Buffer.from(approvalCode);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ---- The assistant: one autonomous system per connection ----
  /** A new assistant session: its own identity, no authority until the person approves a grant. */
  function agent(name = "assistant", { client = null } = {}) {
    const me = newPerson("agent", { reach: person.genesis.state.recovery_reach });
    node.push(me.genesis);
    const state = { ...me, name, client, grant: null };
    return state;
  }

  /** A restored assistant (a session that outlived a restart) brings its own chain back to the node, so what it signs next takes its place. */
  door.adopt = (assistant) => { for (const block of assistant?.chain || []) node.push(block); return assistant; };

  const grantOf = (assistant) => {
    // the grant is the assistant's own record, or (after a restart) the approved grant draft that names it
    const hash = assistant.grant || [...drafts.values()].find((d) => d.kind === "grant" && d.assistant?.id === assistant.id && d.block)?.block;
    const grant = hash && node.get(hash);
    if (!grant) return null;
    const live = fb.grant.isLive(grant, node.all(), { now: now() });
    return live ? grant : null;
  };

  /** connect: pair this assistant to the person's node. The grant is a draft until the person taps. */
  function connect(assistant, { acts = [], days = 30, limit, audience, parties = [] } = {}) {
    const until = plusDays(Math.min(Math.max(days, 1), 365), now());
    // `parties`: the ids the assistant may deal with. A grant that lists none names no one but the person (authority.md): nothing widens it.
    const scope = { acts: [...new Set(acts)], parties: [...new Set(parties)], until, ...(limit ? { limit } : {}) };
    const spec = { type: "grant", state: { kind: "assistant", scope }, refs: { to: assistant.id }, audience };
    const operator = { type: "grant", state: { kind: "operator", scope: {} }, refs: { to: assistant.id }, audience };
    const item = draft("grant", spec, { summary: describeGrant(assistant.name, scope, assistant) });
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
      const operator = keep(person, writeAs(person, item.also));
      item.operator = operator.hash;
      // the assistant accepts the operator grant: an operator answers for a machine only once the machine has said yes (identity.md). A
      // remote host's window relays only its person's blocks and an agent's blocks under her grants, so there the accept waits for the
      // host to relay it.
      const assistant = item.assistant;
      if (assistant.keys && !node.remote) keep(assistant, writeAs(assistant, { type: "grant", state: { status: "accepted" }, refs: { answers: operator.hash }, audience: item.audience }, { held: [...assistant.chain, operator] }));
      item.assistant.grant = result.block;
    }
    touch();
    return result;
  };
  door.discard = (id, given) => { const result = discard(id, given); touch(); return result; };
  /**
   * Disconnect: the person ends an assistant's authority, not only its token. Each live grant they gave to the assistants of this client
   * (or to every assistant, with no client) is stopped by a block the person signs, and so is its operator grant. Returns the stops signed.
   */
  door.disconnect = (client = null) => {
    const stops = [];
    for (const item of drafts.values()) {
      if (item.kind !== "grant" || !item.block || (client && item.assistant?.client !== client)) continue;
      for (const hash of [item.block, item.operator].filter(Boolean)) {
        const grant = node.get(hash);
        if (!grant || !fb.grant.isLive(grant, node.all(), { now: now() })) continue;
        stops.push(keep(person, writeAs(person, { type: "grant", state: { kind: grant.state.kind, status: "stopped", stop: "onward" }, refs: { updates: grant.hash }, audience: item.audience })).hash);
      }
      item.status = "disconnected";
    }
    touch();
    return { stopped: stops };
  };

  // ---- Reading the world ----
  const textOf = (block) => [block?.state?.name, block?.state?.kind, block?.state?.what].filter(Boolean).join(" ").toLowerCase();
  const thingOf = (hash) => node.get(hash);
  // each block's newer versions by its own author, read once per call (a scan of the store for each record made find quadratic: agents/t4)
  const versionsOf = (all) => {
    const by = new Map();
    for (const b of all) if (b.refs?.updates) { const list = by.get(b.refs.updates) || []; list.push(b); by.set(b.refs.updates, list); }
    return (block) => (by.get(block.hash) || []).filter((n) => n.refs.author === block.refs?.author);
  };
  const latest = (thing, newer = versionsOf(node.all())) => { // the newest version of a record, by its own author's updates
    const seen = new Set();
    for (let next; !seen.has(thing.hash) && (next = newer(thing)[0]);) { seen.add(thing.hash); thing = next; }
    return thing;
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
    const all = node.all();
    const offersNow = () => {
      const candidates = all.filter((b) => b.type === "promise" && !b.refs.answers && b.refs.from && b.refs.author === b.refs.from && b.refs.from !== person.id)
        .filter((b) => { const thing = b.refs.what && thingOf(b.refs.what); return matches(thing || b) && placeOk(b, thing); });
      // every candidate's view against one reading of the store (security I: a view per offer read the whole store each time)
      const views = candidates.length ? fb.fold.promiseViews(candidates, all, { now: t }) : {};
      return candidates.map((b) => ({ b, view: views[b.hash] })).filter(({ view: v }) => v && v.stage === "offered");
    };
    // each peer read once per find: their standing asks the core about the whole store (agents/t4)
    const peers = new Map();
    const ofPeer = (id) => { if (!peers.has(id)) peers.set(id, { id, kind: node.get(id)?.state?.kind || null, no_contact: standing(id).stopped }); return peers.get(id); };
    if (kind === "offers") return offersNow().slice(0, limit).map(({ b }) => {
      const thing = thingOf(b.refs.what);
      // what an author wrote is cut short here (read gives the whole block): a seller's 30 KB of text never fills a list (agents/t7)
      return { offer: b.hash, from: ofPeer(b.refs.from), what: thing ? { hash: thing.hash, kind: plain(thing.state.kind), name: plain(thing.state.name) } : (b.state.what ? plain(b.state.what) : null),
        price: b.state.terms?.price || null, quantity: b.state.terms?.quantity || null, deliver_by: b.state.terms?.deliver_by || null, expires: b.state.terms?.expires || null };
    });
    const newer = versionsOf(all);
    if (kind === "things") return all.filter((b) => b.type === "thing" && b.state.kind !== "place" && b.state.kind !== "schema" && matches(b) && placeOk(b, b))
      .filter((b) => !newer(b).length).slice(0, limit)
      .map((b) => ({ thing: b.hash, kind: plain(b.state.kind), name: b.state.name ? plain(b.state.name) : null, owner_or_author: b.refs.author, place: b.refs.place || null }));
    if (kind === "peers") {
      const authors = new Set(offersNow().map(({ b }) => b.refs.author));
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
  function ask({ from, what, offer, audience, ...terms }) {
    const source = offer && node.get(fullId(offer, "offer"));
    const target = what || source?.refs?.what;
    const seller = from || source?.refs?.from;
    const refs = { to: person.id, ...(seller ? { from: seller } : {}), ...(target ? { what: target } : {}), ...(source ? { derives_from: source.hash } : {}) };
    const spec = { type: "promise", state: { terms: termsOf(terms), ...(target ? {} : { what: String(what) }) }, refs, audience };
    return draft("ask", spec, { to: seller, summary: describe("Ask", node.get(target), seller, spec.state.terms), why: "A first message to a stranger has a human author: you tap send." });
  }

  /** promise: the assistant's own binding block, only under a live grant that names the act, never to a stranger. */
  function promise(assistant, { to, what, audience, ...terms }) {
    const spec = { type: "promise", state: { terms: termsOf(terms) }, refs: { to: person.id, from: to, what }, audience };
    return bind(assistant, "promise", spec, to, describe("Promise", node.get(what), to, spec.state.terms));
  }

  /** accept: answer an offer or counter-offer `accepted`, for the person, under a live grant. */
  function accept(assistant, { promise: target, quantity, audience }) {
    const offer = node.get(fullId(target, "promise"));
    if (!offer || offer.type !== "promise") throw new Error("No such promise here.");
    const first = node.get(offer.refs.for) || offer;
    const seller = offer.refs.author;
    const spec = { type: "promise", state: { status: "accepted", ...(quantity ? { terms: { quantity } } : {}) }, refs: { answers: offer.hash, for: first.hash }, audience };
    // the summary is of what is signed: the offer's terms as this accept binds them (its own quantity, where it names one)
    return bind(assistant, "accept", spec, seller, describe("Accept", node.get(offer.refs.what), seller, { ...offer.state.terms, ...(quantity ? { quantity } : {}) }), offer);
  }

  function bind(assistant, kind, spec, counterparty, summary, offer) {
    const grant = grantOf(assistant);
    const why = [];
    if (!grant) why.push("no live grant: this assistant is not connected, or the person's grant ended");
    else if (!(scopeOf(grant).acts || []).includes("promise")) why.push("the grant does not name the act `promise`: an agent's ask is a quote request");
    // The person's visible fence: the limit over its period and the cap on each act, held against what the act comes to (the SDK's
    // total: per-unit price times quantity, lines added up) plus what this assistant already bound under the grant in the period.
    const sc = grant ? scopeOf(grant) : {};
    const fence = { ...(sc.limit ? { limit: sc.limit } : {}), ...(sc.each ? { each: sc.each } : {}) };
    if (grant && Object.keys(fence).length) {
      const value = sizeOf(fence, spec, offer);
      const spent = spentUnder(grant, assistant, fence);
      if (value === null) why.push("the act has no total the person's limit can be held against");
      else if (value !== undefined && !fb.grant.withinLimit(fence, value, spent)) why.push("over the person's limit");
    }
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

  // What one act comes to, in the fence's measure: money (the terms' total) or an amount (the quantity bound). Undefined when the act
  // carries nothing the fence measures (no price under a money fence); null when it carries a price or lines with no computable total.
  function sizeOf(fence, spec, offer) {
    const own = spec.state.terms || {}, terms = own.price || own.lines ? own : offer?.state?.terms || own;
    // a standing promise (a repeat) binds every occurrence: one occurrence's price is not what it comes to, so no limit can hold it (agents/t3)
    if (terms.repeat || own.repeat) return null;
    const range = (q) => (q && q.max !== undefined ? q.max : q);
    const quantity = range(own.quantity || (terms === own ? null : terms.quantity)) || null;
    if ((fence.limit || fence.each).unit !== undefined) return quantity && quantity.value !== undefined ? quantity : terms.lines ? null : undefined;
    if (!terms.price && !terms.lines) return undefined;
    return fb.grant.termsTotal(terms, quantity);
  }
  // What this assistant has already bound under the grant in the fence's period (all time, when the grant names no `every`): the same measure, summed.
  function spentUnder(grant, assistant, fence) {
    const since = scopeOf(grant).every ? fb.grant.addDuration(now(), scopeOf(grant).every, -1) : null;
    const measure = fence.limit || fence.each;
    let sum = "0"; // exact: a total past 2^53 comes as decimal text
    for (const b of node.all()) {
      if (b.refs?.author !== assistant.id || b.refs?.under !== grant.hash || b.type !== "promise") continue;
      if (since && !(b.state?.at >= since)) continue;
      const v = sizeOf(fence, b, b.refs.answers ? node.get(b.refs.answers) : null);
      if (!v) continue;
      const same = measure.unit !== undefined ? v.unit === measure.unit : v.currency === measure.currency;
      if (same) sum = addDecimals(sum, measure.unit !== undefined ? v.value : v.minor);
    }
    return sum;
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

// Two decimal strings added exactly (amounts are decimals, never floats).
function addDecimals(a, b) {
  const parts = [String(a), String(b)].map((x) => { const neg = x.startsWith("-"), [i, f = ""] = x.replace(/^[-+]/, "").split("."); return { neg, i, f }; });
  const scale = Math.max(...parts.map((p) => p.f.length));
  const big = parts.map((p) => (p.neg ? -1n : 1n) * BigInt(p.i + p.f.padEnd(scale, "0")));
  const total = big[0] + big[1], neg = total < 0n, digits = (neg ? -total : total).toString().padStart(scale + 1, "0");
  return (neg ? "-" : "") + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
}
// Money as people read it: minor units over the currency's own decimals (ISO 4217, as the platform's Intl knows it: 0 for JPY, 3 for KWD),
// an issuer's unit over the decimals it names. Exact, from the integer: never a float.
const decimalsOf = (currency) => {
  if (currency && typeof currency === "object") return Number.isInteger(currency.decimals) ? currency.decimals : 0;
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits; } catch { return 0; }
};
const nameOf = (currency) => (currency && typeof currency === "object" ? `${plain(currency.unit)} (${plain(currency.issuer)})` : plain(currency));
const mark = (m) => {
  if (!m || m.minor === undefined) return null;
  const places = decimalsOf(m.currency), raw = BigInt(String(m.minor).replace(/^-/, "")), neg = String(m.minor).startsWith("-");
  const digits = raw.toString().padStart(places + 1, "0");
  return `${neg ? "-" : ""}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits} ${nameOf(m.currency)}`;
};
// A name its author chose, as text the page shows plainly: no direction controls (they can reorder what follows), at most 120 characters.
const MAX_PENDING = 100;
const WRONG_CODE_MS = 1000;
const plain = (text) => { const t = String(text ?? "").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ""); return t.length > 120 ? `${t.slice(0, 120)}…` : t; };
function describe(verb, thing, party, terms) {
  const price = terms?.price?.money ? `${mark(terms.price.money)} per ${plain(terms.price.per?.value ?? 1)} ${plain(terms.price.per?.unit ?? "")}`.trim() : terms?.price?.minor !== undefined ? mark(terms.price) : null;
  const q = terms?.quantity, ranged = q?.max !== undefined;
  const quantity = q ? (ranged ? `${plain(q.min?.value ?? 0)} to ${plain(q.max.value)} ${plain(q.max.unit)}` : `${plain(q.value)} ${plain(q.unit)}`) : null;
  let total = null;
  try { const t = terms ? fb.grant.termsTotal(terms, ranged ? q.max : q || null) : null; total = t ? mark(t) : null; } catch {}
  // a thing's name is its author's words, shown as theirs and cut short: terms are only what the block itself says (agents/t7)
  return [verb, quantity, thing ? `${plain(thing.state.kind)} its seller names "${plain(thing.state.name || thing.state.kind)}"` : null,
    party ? `with ${plain(party)}` : "to anyone", price ? `at ${price}` : "(no price: they will quote)", total ? `(${ranged ? "up to " : ""}${total} in all)` : null,
    terms?.repeat ? `repeating ${plain(typeof terms.repeat === "string" ? terms.repeat : JSON.stringify(terms.repeat))}${terms.until ? ` until ${plain(terms.until)}` : " with no end"}` : null,
    terms?.deliver_by ? `by ${plain(terms.deliver_by)}` : null, `until ${plain(terms?.expires || "-")}`].filter(Boolean).join(" ");
}
function describeGrant(name, scope, assistant = {}) {
  const acts = scope.acts.length ? `may bind you on: ${scope.acts.map(plain).join(", ")}` : "may find, read and draft only; it cannot bind you";
  const limit = scope.acts.length ? (scope.limit ? `, up to ${mark(scope.limit)}` : ", with no limit on what it binds") : "";
  // the name is the one the app gave itself: shown as its words, beside the client and key that are facts (agents/t19: a hostile app named
  // itself "assistant" and looked like a trusted one)
  const who = `${assistant.client ? `app ${plain(assistant.client)}, ` : ""}key ${String(assistant.id || "").slice(0, 12)}`;
  return `Connect an assistant that calls itself "${plain(name)}" (${who}): it ${acts}, until ${plain(scope.until)}${limit}. The same tap signs that you answer for this assistant (an operator grant).`;
}

// ---- The approval page (the person's tap) ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approval</title><body style="font:18px system-ui;max-width:32rem;margin:2rem auto;padding:0 1rem">${body}<p style="font-size:13px;color:#777">Built on the open FoodBlock protocol.</p></body>`;

/** Serve /approve/<draft>: GET shows exactly what would be signed; POST with the approval code signs or discards. */
export function approvalHandler(door) {
  return async (req, res) => {
    const match = /^\/approve\/([0-9a-f]{64})$/.exec(new URL(req.url, "http://x").pathname);
    if (!match) return false;
    const id = match[1], item = door.drafts.get(id);
    const send = (status, html) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" }); res.end(page(html)); return true; };
    if (!item) return send(404, "<p>No such draft.</p>");
    if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break; }
      const form = new URLSearchParams(raw);
      let result;
      try {
        await door.sync();
        result = form.get("do") === "discard" ? door.discard(id, form.get("code")) : door.approve(id, form.get("code"));
        if (!result.ok) await new Promise((done) => setTimeout(done, WRONG_CODE_MS));
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
