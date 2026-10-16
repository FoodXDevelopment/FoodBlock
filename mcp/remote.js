// A remote node for the door: a FoodOS host's window for one person, over HTTP (the Backend's kernel/node/host.js `handler`, the same
// shape as the index client in kernel/index/http.js: a base URL and an injectable fetch). The door reads and writes through the same
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
      const result = fb.sync.accept([block], all());
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
