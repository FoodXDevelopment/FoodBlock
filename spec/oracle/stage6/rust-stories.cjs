// node rust-stories.cjs <dir> : the door questions the Rust core's stage 6 tests ask (sdk/rust/tests/stage6.rs, run with FB_RECORD=<dir>),
// asked of the oracle. Prints each question where the two engines answer differently; exits 1 if any do. A refusal's `detail` is not compared.
const fs = require('fs'), path = require('path');
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
let n = 0, bad = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl')).sort()) {
  const seen = new Set();
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    const q = JSON.parse(line);
    if (['keypair', 'seal'].includes(q.op)) continue;
    const k = q.op + JSON.stringify(q.args); if (seen.has(k)) continue; seen.add(k); n++;
    let o, err = null;
    try { o = JSON.parse(JSON.stringify(fb.door(q.op, ...q.args) ?? null)); } catch (e) { err = e.message; }
    // the core's refusal is `error` (its answer then null); a null answer with no error is the answer null
    const refused = q.error !== null && q.error !== undefined;
    const same = refused ? err !== null : err === null && canon(strip(o)) === canon(strip(q.answer === undefined ? null : q.answer));
    if (!same) { bad++; console.log(`${q.story} ${q.op}` + (err || refused || q.answer == null ? `\n  core: ${refused ? 'ERROR ' + canon(q.error) : canon(q.answer)}`.slice(0, 300) + `\n  oracle: ${err ? 'ERROR ' + err : canon(o).slice(0, 300)}` : diff(strip(q.answer), strip(o), '').map(x => '\n  ' + x).join(''))); }
  }
}
console.log(`${n} questions, ${bad} differ`);
process.exitCode = bad ? 1 : 0;
