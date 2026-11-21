// node export.cjs : every door question the stories of stage 5 ask (changes-1.9/05-deals.md), with the oracle's answer (each story checks that
// answer against the text), written to sdk/rust/tests/fixtures/stage5.json so the Rust core is asked the same questions (tests/stage5.rs) and
// to tools/fuzz/corpus/ (s05-deals.cjs reads it) so the random-world test asks both engines. A question the oracle refuses (it throws) is kept
// as such. `whyNotUnder` is asked as the door op `why_not_under`; `writeFindings` is not a door op and is not exported.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const out = [];
let story = '';
const record = (op, args, fn) => {
  let answer, error = null;
  try { answer = fn(); } catch (e) { error = true; }
  out.push({ story, op, args: JSON.parse(JSON.stringify(args === undefined ? [] : args)), ...(error ? { error } : { answer: JSON.parse(JSON.stringify(answer === undefined ? null : answer)) }) });
  return error ? fn() : answer;
};
const door = L.fb.door;
L.fb.door = (op, ...args) => record(op, args, () => door(op, ...args));
if (L.fb.whyNotUnder) L.fb.whyNotUnder = (b, held) => record('why_not_under', [b, held], () => door('why_not_under', b, held));
const quiet = console.log;
console.log = () => {};
for (const f of fs.readdirSync(__dirname).filter(x => /^5-.*\.cjs$/.test(x)).sort()) {
  story = f.replace(/\.cjs$/, '');
  require('./' + f);
}
console.log = quiet;
process.exitCode = 0;
const seen = new Set(), qs = out.filter(q => { const k = q.op + JSON.stringify(q.args); if (seen.has(k)) return false; seen.add(k); return true; });
const file = path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage5.json');
fs.writeFileSync(file, JSON.stringify({ about: 'the door questions of spec/oracle/stage5, with the oracle\'s answers (node spec/oracle/stage5/export.cjs)', questions: qs }) + '\n');
console.log(`${qs.length} questions from ${new Set(qs.map(q => q.story)).size} stories -> ${path.relative(process.cwd(), file)}`);
