// A remote node for the door: a FoodOS host's window for one person, over HTTP (the foodx checkout's foodos/node/host.js `handler`, the same
// shape as the index client in foodos/index/http.js: a base URL and an injectable fetch). The door reads and writes through the same
// { all, get, push } it has with the in-memory node; this one keeps a mirror of what the host holds and sends what the door signs.
//
//   refresh()  pull the host's blocks into the mirror (GET {base}/window/blocks)
//   flush()    send what the door signed since (POST {base}/window/submit); the host's SDK judges every block, and a refusal throws
//   fold(name, ...args) / propose(type, state, refs)   the host's folds and the draft of the person's next block, for a caller that wants them
//
// The credential goes in the Authorization header, never in a URL. The host never holds the person's key: the door signs, the host judges.
import fb from "@foodxdev/foodblock";

export function remoteNode({ base, token, fetch: request = globalThis.fetch } = {}) {
  if (!base) throw new Error("a remote node needs the person's window URL: {host}/{personId}");
  const mirror = new Map(), queue = [];
  const call = async (method, path, body) => {
    const response = await request(`${base}/window/${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(answer.refused?.length ? `the host refused: ${answer.refused.map((r) => r.detail || r.code).join("; ")}` : answer.error || `HTTP ${response.status}`), { status: response.status, refused: answer.refused });
    return answer;
  };
  const all = () => [...mirror.values()];
  const remote = async () => (await call("GET", "blocks")).blocks;
  return {
    remote: true, all,
    get: (hash) => mirror.get(hash) || all().find((block) => block.hash.startsWith(hash)) || null,
    /** Take a signed block into the mirror if the SDK accepts it against what is held; it is sent on the next flush. */
    push(signed) {
      const { salts, ...block } = signed;
      const result = fb.sync.accept([block], all(), { takesPairs: false });
      result.taken.forEach((taken) => { mirror.set(taken.hash, taken); queue.push(taken); });
      return { taken: result.taken, refused: result.refused, waiting: result.waiting };
    },
    /** The mirror becomes the host's truth, plus what the door signed and has not sent yet. */
    async refresh() {
      const held = await remote();
      mirror.clear();
      held.forEach((block) => mirror.set(block.hash, block));
      queue.forEach((block) => { if (!mirror.has(block.hash)) mirror.set(block.hash, block); });
    },
    async flush() {
      const held = new Set((await remote()).map((block) => block.hash));
      const todo = queue.splice(0).filter((block) => !held.has(block.hash));
      for (const [index, block] of todo.entries()) {
        try { await call("POST", "submit", { block }); }
        catch (error) { todo.slice(index).forEach((one) => mirror.delete(one.hash)); throw error; } // what the host refused is not kept
      }
    },
    fold: async (name, ...args) => (await call("POST", "fold", { name, args })).result,
    propose: async (type, state = {}, refs = {}) => (await call("POST", "propose", { type, state, refs })).draft,
  };
}

// The open index for the door's find (the foodx checkout's foodos/index/http.js shape: POST {base}/find with { what, near, when, limit },
// GET {base}/.well-known/foodblock-index). The index signs every answer; this checks the signature against the index's key
// (pinned by `key`, else read once from the index's well-known and kept), checks that every block it carries is as its author
// signed it, that it answers the query asked, and that each result is an offer among those blocks. A lying answer throws.
// Only find goes here: read, ask and promise stay on the person's host. The door's find is by name or hash; the index's is by
// word and by lat/lon, so `near` may be { lat, lon, radius_m }, or a name/hash that is matched against the places the answer carries.
export function remoteIndex({ base, key, fetch: request = globalThis.fetch } = {}) {
  if (!base) throw new Error("an index needs its URL (FOODBLOCK_INDEX_URL)");
  const root = base.replace(/\/$/, "");
  let pinned = key ? { key } : null;
  const get = async (path) => { const r = await request(`${root}/${path}`); if (!r.ok) throw new Error(`the index answered HTTP ${r.status}`); return r.json(); };
  const known = async () => pinned || (pinned = await (async () => { const w = await get(".well-known/foodblock-index"); if (!w.public_key) throw new Error("the index published no key"); return { key: w.public_key, id: w.index }; })());

  /** Is this answer the index's, whole, and an answer to this query? Returns the faults (none means it holds). */
  const faults = (answer, indexKey, asked) => {
    if (!answer || typeof answer !== "object") return ["not an answer"];
    const out = [];
    try { if (!fb.verifyMessage(answer, indexKey)) out.push("the index did not sign this answer"); } catch { out.push("the signature is malformed"); }
    const blocks = Array.isArray(answer.blocks) ? answer.blocks : [], byHash = new Map(blocks.map((b) => [b.hash, b]));
    const isIdentity = (b) => b.type === "actor" || b.type === "grant" || b.state?.kind === "person" || b.state?.kind === "agent";
    for (const block of blocks) {
      const author = block.refs?.author ?? block.hash;
      let good = false;
      try { const keys = fb.identity.keysOf(author, blocks.filter((b) => b.hash === author || (b.refs?.author === author && isIdentity(b)))); good = keys.some((k) => fb.verify(block, block.signature, k)) && fb.hash(block.type, block.state, block.refs) === block.hash; } catch { good = false; }
      if (!good) out.push(`block ${String(block.hash).slice(0, 8)} is not as its author signed it`);
    }
    for (const [name, value] of Object.entries(asked)) if (JSON.stringify(answer.query?.[name]) !== JSON.stringify(value) && !(name === "limit" && answer.query?.limit <= value)) out.push(`the answer is not to the query asked (${name})`);
    for (const hit of answer.results || []) {
      const offer = byHash.get(hit.offer);
      if (!offer || offer.type !== "promise" || !offer.refs?.from || offer.refs.from !== offer.refs.author) out.push(`result ${String(hit.offer).slice(0, 8)} is not an offer in the blocks carried`);
    }
    return out;
  };

  async function ask(query) {
    const { key: indexKey } = await known();
    const response = await request(`${root}/find`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query) });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(answer.error || `the index answered HTTP ${response.status}`), { status: response.status });
    const wrong = faults(answer, indexKey, query);
    if (wrong.length) throw Object.assign(new Error(`the index's answer does not hold: ${wrong.join("; ")}`), { wrong });
    return answer;
  }

  /** The door's find shape for offers, from a verified answer. */
  async function offers({ what, near, limit = 20 } = {}) {
    const query = { limit };
    if (what) query.what = what;
    const point = near && typeof near === "object" ? near : null;
    if (point) query.near = point;
    const answer = await ask(query), byHash = new Map(answer.blocks.map((b) => [b.hash, b]));
    const wanted = typeof near === "string" ? near.toLowerCase() : null;
    return answer.results
      .filter((hit) => !wanted || hit.place === near || String(byHash.get(hit.place)?.state?.name || "").toLowerCase().includes(wanted))
      .map((hit) => {
        const offer = byHash.get(hit.offer), thing = byHash.get(offer.refs.what);
        return { offer: hit.offer, from: { id: offer.refs.from, kind: byHash.get(offer.refs.from)?.state?.kind || null, no_contact: null }, distance_m: hit.distance_m ?? null, index: answer.index,
          what: thing ? { hash: thing.hash, kind: thing.state?.kind, name: thing.state?.name } : offer.state?.what || null,
          price: offer.state?.terms?.price || null, quantity: offer.state?.terms?.quantity || null, deliver_by: offer.state?.terms?.deliver_by || null, expires: offer.state?.terms?.expires || null };
      });
  }
  return { ask, offers, faults };
}
