// node rust-stories.cjs <dir> : the door questions the Rust core's stage 7 tests ask (sdk/rust/tests/stage7.rs, run with FB_RECORD=<dir>),
// but the read-back's (c3_*, its own compare), asked of the oracle. Prints each question where the two engines answer differently; exits 1 if
// any do. A refusal's `detail` is not compared. Ops the core's door has that are library calls here are asked of the library (`canonical_json`,
// `hash_hex`, `padded_size`, `well_known`, `well_known_errors`, `announcement`, `create`, `sign_message`); a question whose answer is random (a key pair, an envelope, a
// wrap) is not compared; a mount is a fresh random id on each side, so the core's id is read as the oracle's own in every later question.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const fb = require('../fb.cjs');
const dir = process.argv[2];
const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'detail').map(([k, x]) => [k, strip(x)])) : v;
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const diff = (a, b, p) => {
  if (canon(a) === canon(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    if (Array.isArray(a) && a.length !== b.length) return [`${p}: core ${canon(a).slice(0, 400)} | oracle ${canon(b).slice(0, 400)}`];
    return ks.flatMap(k => diff(a[k], b[k], p + '.' + k));
  }
  return [`${p}: core ${canon(a)?.slice(0, 400)} | oracle ${canon(b)?.slice(0, 400)}`];
};
const library = {
  canonical_json: a => fb.jcs(a[0]),
  hash_hex: a => crypto.createHash('sha256').update(a[0], 'utf8').digest('hex'),
  padded_size: a => fb.padSize(a[0]),
  well_known_errors: a => fb.wellKnownErrors(a[0]),
  announcement: a => fb.announcement(a[0]),
  well_known: a => fb.wellKnown(a[0], a[1], a[2], a[3], a[4]),
  sign_message: a => fb.signMessage(a[0], a[1], a[2] || 'std'),
  create: a => { const b = { type: a[0], state: a[1], refs: a[2] }; return { hash: fb.hashOfBlock(b, a[3] || 'std'), ...b }; },
};
const ask = (op, args) => (library[op] ? library[op](args) : fb.door(op, ...args));
const random = ['keypair', 'seal', 'encryption_keypair', 'seal_copy', 'wrap_copy'];
let n = 0, bad = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl') && !/^(c3_|c4_|oracle_)|read_back|readback/.test(x)).sort()) {
  const seen = new Set(), mounts = [];
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    const q = JSON.parse(line);
    if (random.includes(q.op)) continue;
    let text = JSON.stringify(q.args);
    for (const [theirs, ours] of mounts) text = text.split(theirs).join(ours);
    const args = JSON.parse(text);
    const stateful = q.op === 'mount' || q.op === 'unmount' || mounts.some(([, ours]) => text.includes(ours));
    const k = q.op + text; if (!stateful && seen.has(k)) continue; seen.add(k); n++;
    let o, err = null;
    try { o = JSON.parse(JSON.stringify(ask(q.op, args) ?? null)); } catch (e) { err = e.message; }
    if (q.op === 'mount' && typeof q.answer === 'string' && typeof o === 'string') { if (o !== q.answer) mounts.push([q.answer, o]); continue; }
    // the core's refusal is `error` (its answer then null); a null answer with no error is the answer null
    const refused = q.error !== null && q.error !== undefined;
    // `open_copy` answers the opened block in each engine's own shape (as core-set-a's compare): the same block, by its id
    const same = refused ? err !== null : err === null && (q.op === 'open_copy' ? o && q.answer && o.hash === q.answer.hash : canon(strip(o)) === canon(strip(q.answer === undefined ? null : q.answer)));
    if (!same) { bad++; console.log(`${q.story} ${q.op}` + (err || refused || q.answer == null ? `\n  core: ${refused ? 'ERROR ' + canon(q.error) : canon(q.answer)}`.slice(0, 300) + `\n  oracle: ${err ? 'ERROR ' + err : canon(o).slice(0, 300)}` : diff(strip(q.answer), strip(o), '').map(x => '\n  ' + x).join(''))); }
  }
}
console.log(`${n} questions, ${bad} differ`);
process.exitCode = bad ? 1 : 0;
