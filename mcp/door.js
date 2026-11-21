// The door (the MCP server's logic, with no transport in it). Any assistant can find, read, ask and promise on FoodBlock
// through it, under six rules:
//   1. The autonomous system drafts; the person decides. A draft is node-local data (core.md section 10), never a block. The
//      block is signed by the person's OWN DEVICE (a passkey, or any key she keeps): the door composes the block, shows it, and takes
//      back only a signature over exactly those bytes. This door holds no key of hers, makes none, and has no way to sign as her.
//   2. An unanswered ask binds no one (promises.md).
//   3. A first message to a stranger has a human author (consent.md): `ask` is always a draft; an autonomous system-signed block
//      goes out only when the SDK's admission check says it may.
//   4. STOP binds the sender: the `consent` fold is asked before every draft and every send (`stopped`). This is the sender's
//      own discipline; a node never refuses a block for a STOP (consent.md, invariant 29).
//   5. It never holds money: there is no transfer, payment or deposit here, and a grant's limit is the fence.
//   6. Open types, closed authority: the assistant writes no raw blocks. Every block is one of two shapes, an ask
//      (the person's) or a promise or accept under a live grant (the autonomous system's, naming it in refs.under).
// Every protocol rule is the SDK's (Rust core through WebAssembly): this file composes and asks, it checks nothing itself.
import fb from "@foodxdev/foodblock";
import { randomBytes } from "node:crypto";

const clock = () => new Date().toISOString();
// An identity's own first block (the genesis of a person, an assistant) is what others find a person by: the door states
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

/**
 * An assistant's own session identity: a key for one tool, made by the door for that tool alone, kind `agent`. It is a tool, never a person: it
 * has no recovery or encryption key and no authority until a grant her device signed. (Not for a person: a person's key is made on her own
 * device and never reaches a door. Test fixtures that need fictional people make them in mcp/test/ only.)
 */
export function newAgent() {
  const keys = fb.generateKeypair();
  const genesis = fb.identity.genesis(keys, { kind: "agent", at: clock(), audience: IDENTITY_AUDIENCE });
  return { keys, genesis, chain: [genesis], id: genesis.hash };
}

/** The old flow made a person here, with her keys inside the door. It no longer exists; this says where it went. */
export function newPerson() {
  throw new Error("this door makes no person and holds no key of hers: make her identity on her own device (a passkey), then give the door her genesis and chain (public blocks only)");
}

const scopeOf = (grant) => grant?.state?.scope || {};

/**
 * @param node    the node the person's blocks live on ({ all, get, push })
 * @param person  who the person is, PUBLICLY: { id, genesis, chain } (blocks only). It must carry no key: her key stays on her own device.
 * @param options { now, persist, drafts }
 */
export function createDoor({ node = memoryNode(), person, now = clock, persist = () => {}, drafts = new Map() } = {}) {
  if (!person?.id || !person.genesis) throw new Error("createDoor needs the person's id, genesis and chain (public blocks). This door makes no person and holds no key of hers: make her identity on her own device");
  for (const secret of ["keys", "key", "recovery", "encryption", "private_key"]) if (person[secret] !== undefined) throw new Error(`the door was handed a ${secret} of the person: a door holds no key of hers. Give it her id, genesis and chain only; her own device signs`);
  person = { id: person.id, genesis: person.genesis, chain: person.chain || [person.genesis], ...(person.signerKey ? { signerKey: person.signerKey } : {}) };
  // id -> draft (pending | sent | discarded | locked). A host may pass a durable Map (store.js durableDrafts) with touch(): called after every change, so a restart loses no link.
  const touch = () => drafts.touch?.();
  const door = { node, person, drafts, base: "", now };
  node.push(person.genesis);
  person.chain.forEach((block) => node.push(block));

  // ---- Composing, and the person's signature ----
  // The key her device signs with: the one key of her genesis unless the host names another that speaks for her.
  const signerKeyOf = () => person.signerKey || person.genesis.state.public_key_sign;
  // A block as its author states it, ready for a signature (nothing is signed here). Refuses a malformed one: the trial checks it as signed except for the signature.
  const composeFor = (who, spec, extra = {}) => {
    const link = fb.identity.nextLinkFor(who.id, who === person ? signerKeyOf() : who.keys.public_key_sign, who.chain);
    const block = fb.compose(spec.type, spec.state, spec.refs, { author: who.id, at: now(), audience: spec.audience, link, ...extra });
    // 1.9 3a-3: `valid` judges no value; what a writer would refuse to sign is the SDK's `writeRefusals`, asked of the draft before anyone signs
    const held = [...node.all(), ...who.chain];
    const wrong = [...fb.valid({ ...block, signature: "00" }, held).filter((r) => r.code !== "bad_signature"), ...fb.writeRefusals({ type: block.type, state: block.state, refs: block.refs }, held)];
    if (wrong.length) throw Object.assign(new Error(`the block would be refused: ${wrong.map((r) => r.detail || r.code).join("; ")}`), { wrong: wrong.map((r) => r.detail || r.code) });
    return block;
  };
  // An assistant signs only under a live grant, naming it, with its own session key.
  const writeAs = (who, spec, extra = {}) => fb.write(spec.type, spec.state, spec.refs, { author: who.id, key: who.keys, held: who.chain, at: now(), audience: spec.audience, ...extra });
  // A block is the signer's only once the node took it: one the node leaves unjudged or refuses is never reported as sent or bound (door/t8).
  const keep = (who, signed) => {
    const { salts, ...block } = signed;
    const result = node.push(block);
    if (!result.taken?.some((taken) => taken.hash === block.hash)) {
      const why = [...(result.refused || []).map((r) => r.detail || r.code), ...(result.unjudged || []).map((w) => `missing ${[].concat(w.needs || []).join(", ")}`)];
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
  /** Keep a draft for the person to decide. A trial composition proves it would be accepted; the trial is thrown away. */
  function draft(kind, spec, { to, why, verb } = {}) {
    refuseProse(spec.state);
    const trial = composeFor(person, spec);
    const stopped = to ? admission(trial, to).filter((code) => code === "stopped") : [];
    if (stopped.length) throw Object.assign(new Error(`stopped: ${to.slice(0, 8)} asked for no contact; nothing was drafted`), { wrong: ["stopped"] });
    // the person's list of what waits for a tap is bounded: an assistant cannot bury the one that matters under thousands (agents/t18)
    if ([...drafts.values()].filter((d) => d.status === "pending").length >= MAX_PENDING) throw Object.assign(new Error(`${MAX_PENDING} drafts already wait for the person's tap: ask them to send or discard some first`), { wrong: ["too_many_drafts"] });
    const id = randomBytes(32).toString("hex");
    const shown = words(trial, node);
    // the tool is told what the page will show, the same lines: it cannot describe a block as something it is not (F3)
    const summary = `${verb || kind}: ${shown.slice(1).join("; ")}`;
    const item = { id, kind, spec, audience: spec.audience, to: to || null, shown, summary, why: why || null, status: "pending", at: now(), receipt: fb.shortCode(id), failures: 0 };
    drafts.set(id, item); touch();
    return view(item);
  }
  const link = (id) => `${door.base}/approve/${id}`;
  const view = (item) => ({ draft: item.id, kind: item.kind, status: item.status, bound: false, receipt: item.receipt, summary: item.summary,
    ...(item.why ? { why_a_draft: item.why } : {}), approve_at: link(item.id), next: "Give the person this link. Nothing is sent or bound until their own device signs it." });

  /**
   * The block her device will sign, composed now: what the approval page shows and the challenge it asks her key to sign (a passkey's challenge, or
   * the bytes any other key signs). Nothing is signed here. Asking again composes again, at the chain as it stands.
   */
  door.signing = (id) => {
    const item = drafts.get(id);
    if (!item || item.status !== "pending") return null;
    const block = composeFor(person, item.spec);
    item.unsigned = { block, head: person.chain.length, key: signerKeyOf() };
    item.shown = words(block, node);
    touch();
    return { block, challenge: fb.passkeyChallenge(block), key: signerKeyOf(), shown: item.shown, suite: fb.suiteOfKey(signerKeyOf()) };
  };

  /**
   * The person's yes: her device's signature over the block `signing` composed. `proof` is { signature } (hex) or
   * { authenticatorData, clientDataJSON, signature } (a passkey's WebAuthn answer, each as hex). The door checks it is her key's signature over exactly the
   * block it showed, then keeps and sends the block. A wrong signature counts against the draft, which locks after five.
   */
  door.approve = (id, proof) => {
    const item = drafts.get(id);
    if (!item) return { ok: false, reason: "no such draft" };
    if (item.status === "locked") return { ok: false, reason: "this draft is locked after too many wrong signatures: ask for a new one" };
    if (item.status !== "pending") return { ok: false, reason: `already ${item.status}` };
    const reject = (reason) => { if (++item.failures >= TRIES) item.status = "locked"; touch(); return { ok: false, reason }; };
    if (!item.unsigned) return { ok: false, reason: "your device has not been shown this block yet: open the approval page again" };
    if (item.unsigned.head !== person.chain.length) return { ok: false, reason: "your chain moved since this block was shown: open the approval page again" };
    let signature;
    try { signature = proof?.authenticatorData ? fb.passkeySignature(String(proof.authenticatorData), String(proof.clientDataJSON), String(proof.signature)) : String(proof?.signature || "").trim(); }
    catch (error) { return reject(`that is not a signature: ${error.message}`); }
    const unsigned = item.unsigned.block;
    if (!signature || !fb.verify(unsigned, signature, item.unsigned.key)) return reject("that is not your key's signature over this block: nothing was sent");
    try {
      const signed = { ...unsigned, signature };
      // what she signs is what she was shown: the words of this block must be the words the page had
      if (words(signed, node).join("\n") !== item.shown.join("\n")) return { ok: false, reason: "the block to send differs from the one shown: nothing was sent" };
      if (item.to) {
        const refusals = admission(signed, item.to);
        if (refusals.includes("stopped")) { item.status = "stopped"; touch(); return { ok: false, reason: "stopped: the recipient asked for no contact" }; }
      }
      const block = keep(person, signed);
      item.status = "sent"; item.block = block.hash; delete item.unsigned;
      if (item.kind === "grant" && item.assistant) item.assistant.grant = block.hash;
      touch();
      return { ok: true, block: block.hash, receipt: fb.shortCode(block.hash), kind: item.kind };
    } catch (error) { return { ok: false, reason: reasons(error).join("; ") }; }
  };
  door.discard = (id) => {
    const item = drafts.get(id);
    if (!item || item.status !== "pending") return { ok: false };
    item.status = "discarded"; touch(); return { ok: true };
  };

  // ---- The assistant: one autonomous system per connection ----
  /** A new assistant session: its own tool identity, no authority until the person's device signs a grant. */
  function agent(name = "assistant", { client = null } = {}) {
    const me = newAgent();
    node.push(me.genesis);
    return { ...me, name, client, grant: null };
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

  /** connect: pair this assistant to the person's node. The grant is a draft until her device signs it. */
  function connect(assistant, { types = [], days = 30, limit, audience, parties = [], on = [] } = {}) {
    const until = plusDays(Math.min(Math.max(days, 1), 365), now());
    // `parties`: the ids the assistant may deal with. A grant that lists none names no one but the person (authority.md): nothing widens it.
    // `on`: the promises of hers it may bind her to (1.9 G1: a block under the grant binds her only where it keeps to one of them); a grant
    // that names one is counted on a line, its `refs.meter`: the assistant's own (stage 4, a meter that is the holder's own id).
    const ons = [...new Set(on.map((h) => fullId(h, "promise")))];
    const scope = { types: [...new Set(types)], parties: [...new Set(parties)], ...(ons.length ? { on: ons } : {}), until, ...(limit ? { limit } : {}) };
    const spec = { type: "grant", state: { kind: "assistant", scope }, refs: { to: assistant.id, ...(ons.length ? { meter: assistant.id } : {}) }, audience };
    // the name is the one the app gave itself: shown as its words, beside the client and key that are facts (agents/t19)
    const nolimit = scope.types.length && !limit ? ", with NO limit on what it binds" : "";
    const item = draft("grant", spec, { verb: `Connect an assistant that calls itself "${plain(assistant.name)}" (${assistant.client ? `app ${plain(assistant.client)}, ` : ""}key ${String(assistant.id).slice(0, 12)})${nolimit}` });
    drafts.get(item.draft).assistant = assistant;
    touch();
    return item;
  }
  /**
   * Disconnect: the person ends an assistant's authority, not only its token. For each live grant given to the assistants of this client (or to every
   * assistant, with no client) the door DRAFTS the stop; her device signs it, as it signs anything of hers. The door never signs a stop as her.
   * Returns the stop drafts, each with the link to open.
   */
  door.disconnect = (client = null) => {
    const stops = [];
    for (const item of [...drafts.values()]) {
      if (item.kind !== "grant" || !item.block || item.status === "disconnecting" || (client && item.assistant?.client !== client)) continue;
      const grant = node.get(item.block);
      if (!grant || !fb.grant.isLive(grant, node.all(), { now: now() })) continue;
      const spec = { type: "grant", state: { kind: grant.state.kind, status: "stopped", stop: "onward" }, refs: { updates: grant.hash }, audience: item.audience };
      stops.push(draft("stop", spec, { verb: "Stop an assistant's grant" }));
      item.status = "disconnecting";
    }
    touch();
    return { stopped: [], drafts: stops, next: stops.length ? "Open each link: nothing ends until your own device signs the stop." : "No live grant to stop." };
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
    const out = { block, refusals: fb.valid(block, others), signed_by_author: fb.identity.signedByAuthor(block, node.all()), receipt: fb.shortCode(block.hash) };
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
    if (!target) throw Object.assign(new Error("nothing to ask for: give an offer or a thing; nothing was drafted"), { wrong: ["no_thing"] });
    const seller = from || source?.refs?.from;
    const refs = { to: person.id, ...(seller ? { from: seller } : {}), ...(target ? { what: target } : {}), ...(source ? { derives_from: source.hash } : {}) };
    const spec = { type: "promise", state: { terms: termsOf(terms) }, refs, audience };
    return draft("ask", spec, { to: seller, verb: "Ask", why: "A first message to a stranger has a human author: she signs it on her own device." });
  }

  /** promise: the assistant's own binding block, only under a live grant that covers its type, never to a stranger. */
  function promise(assistant, { to, what, audience, ...terms }) {
    const spec = { type: "promise", state: { terms: termsOf(terms) }, refs: { to: person.id, from: to, what }, audience };
    return bind(assistant, "promise", spec, to, "Promise");
  }

  /** accept: answer an offer or counter-offer `accepted`, for the person, under a live grant. */
  function accept(assistant, { promise: target, quantity, audience }) {
    const offer = node.get(fullId(target, "promise"));
    if (!offer || offer.type !== "promise") throw new Error("No such promise here.");
    const first = node.get(offer.refs.for) || offer;
    const seller = offer.refs.author;
    const spec = { type: "promise", state: { status: "accepted", ...(quantity ? { terms: { quantity } } : {}) }, refs: { answers: offer.hash, for: first.hash }, audience };
    // the summary is of what is signed: the offer's terms as this accept binds them (its own quantity, where it names one)
    return bind(assistant, "accept", spec, seller, "Accept", offer);
  }

  function bind(assistant, kind, spec, counterparty, verb, offer) {
    const grant = grantOf(assistant);
    const why = [];
    if (!grant) why.push("no live grant: this assistant is not connected, or the person's grant ended");
    else if (!(scopeOf(grant).types || []).includes("promise")) why.push("the grant does not cover the type `promise`: an agent's ask is a quote request");
    // The person's limit is counted by the SDK on the grant's own line (1.9 stage 4, G1: `why_not_under` reads the meter, `keeps_to` and the
    // limit), never by a copy here.
    // 1.9 stage 4: a block that binds her under a grant with a limit states what it draws on the grant's line (`state.draws`): the total
    // the deal comes to (the SDK's terms_total of the offer's terms at the quantity the block chooses); the SDK counts it on the line
    const sc = grant ? scopeOf(grant) : {};
    if (grant && (sc.limit || sc.each) && !spec.state.draws) {
      const terms = { ...(offer?.state?.terms || {}), ...(spec.state.terms || {}) };
      const total = terms.price ? fb.grant.termsTotal(terms, spec.state.terms?.quantity || terms.quantity) : null;
      if (total && total.unit !== undefined) spec = { ...spec, state: { ...spec.state, draws: { grant: grant.hash, amount: total } } };
    }
    if (!why.length) {
      const refs = { ...spec.refs, under: grant.hash };
      try {
        const signed = writeAs(assistant, { ...spec, refs }, {});
        const reading = { not_human: "counterparty is a stranger: a human sends the first message", stopped: "stopped: the counterparty asked for no contact" };
        const refusals = [...fb.grant.whyNotUnder(signed, node.all(), { now: now() }).map((r) => r.detail || r.code || String(r)), ...admission(signed, counterparty).map((code) => reading[code] || code)];
        if (!refusals.length) {
          const block = keep(assistant, signed);
          return { bound: true, kind, block: block.hash, receipt: fb.shortCode(block.hash), summary: `${verb}: ${words(block, node).slice(1).join("; ")}`, signed_under: grant.hash };
        }
        why.push(...refusals);
      } catch (error) { why.push(...reasons(error)); }
    }
    if (why.some((w) => w.startsWith("stopped"))) throw Object.assign(new Error("stopped: the counterparty asked for no contact; nothing was drafted"), { wrong: ["stopped"] });
    return draft(kind, spec, { to: counterparty, verb, why: why.join("; ") });
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
const MAX_PENDING = 100;
const WRONG_CODE_MS = 1000;
const TRIES = 5;
// A text its author chose, as text the page shows plainly: no direction controls (they can reorder what follows), at most 120 characters.
const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;
const plain = (text) => { const t = String(text ?? "").replace(BIDI, ""); return t.length > 120 ? `${t.slice(0, 120)}…` : t; };
// An amount as people read it: its value and its unit, as the block says them. Exact: a decimal text, never a float.
const mark = (a) => (a && typeof a === "object" && a.value !== undefined && a.unit !== undefined ? `${plain(a.value)} ${plain(a.unit)}` : null);
// A unit is one token (kg, GBP, {tray}); words in a unit are a tool writing prose into a field a person reads as a fact. Refused at the draft, before anyone is shown it (F3).
const UNIT = /^\S{1,32}$/u;
function refuseProse(value, path = "state") {
  if (Array.isArray(value)) return value.forEach((x, i) => refuseProse(x, `${path}[${i}]`));
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (k === "unit" && typeof v === "string" && !UNIT.test(v)) throw Object.assign(new Error(`${path}.unit is one token such as kg or GBP, not words: put words in a text field. Nothing was drafted.`), { wrong: ["prose_in_unit"] });
    refuseProse(v, `${path}.${k}`);
  }
}
const SHORT = (id) => `${String(id).slice(0, 8)}…${String(id).slice(-4)}`;

/**
 * Terms as one reading: the total the terms come to, from the SDK, so a person sees the sum and not only its parts.
 */
function totalOf(block, byHash) {
  try { const offer = block.refs?.answers && byHash.get(block.refs.answers); const t = offer ? { ...offer.state?.terms, ...block.state?.terms } : block.state?.terms; if (!t) return null; const q = t.quantity?.max !== undefined ? t.quantity.max : t.quantity; return mark(fb.grant.termsTotal(t, q || null)); } catch { return null; }
}

/**
 * What the person signs, in plain fields, from the block itself: who may read it first, then every field of its state and refs (the signer's own
 * bookkeeping aside). The approval page shows this and nothing else, so nothing signed can be absent from it, and the summary the tool receives is these
 * same lines. Every id is shown by what signed blocks the node holds say of it: a thing by its signed name, kind and maker; a person by who they are to
 * this deal; any id also in full. Words an author wrote are marked as theirs. A reader who is no party to the deal is flagged. Two held things with the
 * same name and kind are called out, so a look-alike cannot stand in for the one meant.
 */
function words(block, node) {
  const held = node ? node.all() : [];
  const byHash = new Map(held.map((b) => [b.hash, b]));
  const parties = new Set([block.refs?.author, ...["from", "to", "to_owner", "to_holder"].map((r) => block.refs?.[r])].filter(Boolean));
  const idLine = (id) => {
    const b = byHash.get(id);
    if (b && b.type === "thing") {
      const same = held.filter((o) => o.type === "thing" && o.hash !== b.hash && o.state?.name === b.state?.name && o.state?.kind === b.state?.kind);
      const twin = same.length ? ` WARNING: ${same.length} other held thing${same.length > 1 ? "s share" : " shares"} this name and kind (${same.map((o) => SHORT(o.hash)).join(", ")}): check it is the one you mean` : "";
      return `${b.state?.name ? `"${plain(b.state.name)}"` : "a thing with no name"} (their words), kind ${plain(b.state?.kind ?? "none")}, made by ${SHORT(b.refs?.author ?? id)} (author id ${b.refs?.author ?? id}); id ${id}${twin}`;
    }
    if (b && b.type === "actor") return `${plain(b.state?.kind ?? "someone")} ${SHORT(id)}; id ${id}`;
    if (b) return `a ${plain(b.type)} block${b.state?.kind ? ` of kind ${plain(b.state.kind)}` : ""} by ${SHORT(b.refs?.author ?? "?")} (author id ${b.refs?.author ?? "?"}); id ${id}`;
    return `${SHORT(id)} (not held here); id ${id}`;
  };
  const ID = new RegExp(fb.PROTOCOL.grammar.id);
  const readers = block.state.audience === "public" ? "anyone" : Object.keys(block.salts || {}).sort().map((id) => `${idLine(id)}${parties.has(id) ? "" : " [also readable by an id that is not a party]"}`).join(" | ");
  const lines = [`Who may read this: ${readers}`];
  const bare = (t) => String(t).replace(BIDI, "");   // no direction controls: they can reorder what follows
  const walk = (path, v, mine) => {
    if (v && typeof v === "object" && !Array.isArray(v) && v.value !== undefined && v.unit !== undefined) lines.push(`${path}: ${bare(mark(v))}${v.of ? ` of ${idLine(v.of)}` : ""}`);
    else if (Array.isArray(v) && v.every((x) => typeof x !== "object")) lines.push(`${path}: ${v.map((x) => (typeof x === "string" && ID.test(x) ? idLine(x) : bare(x))).join(", ")}`);
    else if (v && typeof v === "object" && Object.keys(v).length) Object.entries(v).forEach(([k, x]) => walk(`${path}.${bare(k)}`, x, mine));
    else if (typeof v === "string" && ID.test(v)) lines.push(`${path}: ${idLine(v)}`);
    else if (typeof v === "string" && !fb.isTime(v) && !/^[0-9.]+$/.test(v) && mine) lines.push(`${path} (their words): "${bare(plain(v))}"`);
    else lines.push(`${path}: ${bare(typeof v === "string" ? v : JSON.stringify(v))}`);
  };
  for (const [field, v] of Object.entries(block.state)) if (!["audience", "at", "seq", "nonce"].includes(field)) walk(field, v, field !== "status" && field !== "stop");
  for (const [role, v] of Object.entries(block.refs || {})) if (!["author", "prev"].includes(role)) walk(`refs.${role}`, v, false);
  // an answer binds by the terms of what it answers: those are shown too, as the offer states them
  const answered = block.refs?.answers && byHash.get(block.refs.answers);
  if (answered?.state?.terms) walk("the offer's terms", answered.state.terms, false);
  const total = totalOf(block, byHash);
  if (total) lines.push(`what it comes to: ${total} in all`);
  return lines;
}

// ---- The approval page (the person's tap) ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approval</title><body style="font:18px system-ui;max-width:32rem;margin:2rem auto;padding:0 1rem">${body}<p style="font-size:13px;color:#777">Built on the open FoodBlock protocol.</p></body>`;
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Serve /approve/<draft>: GET shows exactly what would be signed and the challenge her device signs; POST takes the signature (a passkey's answer, or the
 * signature of any key she keeps, pasted) or a discard. The door signs nothing: it holds no key of hers. A wrong signature waits a second before it is answered.
 */
export function approvalHandler(door) {
  return async (req, res) => {
    const match = /^\/approve\/([0-9a-f]{64})$/.exec(new URL(req.url, "http://x").pathname);
    if (!match) return false;
    const id = match[1], item = door.drafts.get(id);
    const nonce = randomBytes(16).toString("base64");
    const send = (status, html, script = false) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "x-content-type-options": "nosniff", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'${script ? `; script-src 'nonce-${nonce}'` : ""}` }); res.end(page(html)); return true; };
    if (!item) return send(404, "<p>No such draft.</p>");
    if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) break; }
      const form = new URLSearchParams(raw);
      let result;
      try {
        await door.sync();
        result = form.get("do") === "discard" ? door.discard(id) : door.approve(id, { signature: form.get("signature"), authenticatorData: form.get("authenticatorData"), clientDataJSON: form.get("clientDataJSON") });
        if (!result.ok) await new Promise((done) => setTimeout(done, WRONG_CODE_MS));
        if (result.ok) await door.flush();
      } catch (error) { result = { ok: false, reason: `the node did not take it: ${error.message}` }; }
      return send(result.ok ? 200 : 403, result.ok ? `<h2>${form.get("do") === "discard" ? "Discarded" : "Sent"}</h2>${result.receipt ? `<p>Receipt <b>${esc(result.receipt)}</b></p>` : ""}` : `<h2>Not done</h2><p>${esc(result.reason || "not done")}</p>`);
    }
    if (item.status !== "pending") return send(200, `<p>This draft is ${esc(item.status)}.</p>`);
    let signing;
    try { await door.sync(); signing = door.signing(id); } catch (error) { return send(500, `<p>${esc(error.message)}</p>`); }
    if (!signing) return send(200, `<p>This draft is ${esc(item.status)}.</p>`);
    const passkey = signing.suite === "p256";
    const script = passkey ? `<script nonce="${nonce}">
const b = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const h = ${hex.toString()};
document.getElementById("pk").onclick = async () => {
  try {
    const got = await navigator.credentials.get({ publicKey: { challenge: b(${JSON.stringify(signing.challenge)}), userVerification: "required", timeout: 120000 } });
    const f = document.getElementById("f");
    f.authenticatorData.value = h(got.response.authenticatorData); f.clientDataJSON.value = h(got.response.clientDataJSON); f.signature.value = h(got.response.signature);
    f.requestSubmit(document.getElementById("send"));
  } catch (e) { document.getElementById("err").textContent = "Your device did not sign: " + e.message; }
};
</script>` : "";
    return send(200, `<h2>${esc(item.kind)}</h2>${item.shown.map((line) => `<p style="margin:.3rem 0;overflow-wrap:anywhere">${esc(line)}</p>`).join("")}<p>Receipt <b>${esc(item.receipt)}</b></p>
      <form id="f" method="post"><input type="hidden" name="authenticatorData"><input type="hidden" name="clientDataJSON">
      ${passkey ? `<p><button type="button" id="pk" style="font:inherit">Sign with my passkey</button> <span id="err" style="color:#a00"></span></p>` : ""}
      <p style="font-size:14px;color:#555">Or paste the signature your own device made over this block (hex). The block, for a device that signs by hand:</p>
      <details><summary>block to sign</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">${esc(JSON.stringify(signing.block))}</pre></details>
      <p style="font-size:13px;color:#555">Passkey challenge: <code style="overflow-wrap:anywhere">${esc(signing.challenge)}</code></p>
      <p><input name="signature" placeholder="signature from your device" autocomplete="off" style="font:inherit;width:100%"></p>
      <button id="send" name="do" value="send" style="font:inherit">Send as me</button> <button name="do" value="discard" style="font:inherit">Discard</button></form>
      <p style="color:#666;font-size:14px">Nothing is sent or bound until your own device signs it. This page holds no key of yours. STOP-style contact limits are checked again at the tap.</p>${script}`, passkey);
  };
}
