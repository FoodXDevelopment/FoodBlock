// node export.cjs : every door question the stories of stage 7 ask (changes-1.9/07-last.md), the read-back's aside (7-readback*: its own
// compare), with the oracle's answer (each story checks that answer against the text), written to sdk/rust/tests/fixtures/stage7.json so the
// Rust core is asked the same questions (tests/stage7.rs, the_oracle_stories_of_stage_7) and to tools/fuzz/corpus/ (s07-last.cjs reads it) so
// the random-world test asks both engines. A question the oracle refuses (it throws) is kept as such. Library calls that the core's door has
// as an op are asked as that op: `padSize` (padded_size), `wellKnownErrors` (well_known_errors), `announcement`. A question asked while a
// reader's limit is set (`setReadLimit`, C5) is not exported: the core has no limit, and only answers without one are compared.
const fs = require('fs'), path = require('path');
const fb = require('../fb.cjs');
const out = [];
let story = '', limited = false;
// A question whose arguments pass 4 MB (rule_set over the whole spec, vectors.json and all) is not exported either: the core's own rule_set
// story asks the same rule of small files.
// D2's probe that every protocol op is answered asks each op of no arguments at all: what an op answers to nothing is each engine's own (an argument
// error, or null), so those questions are not exported (the probe asks only that the op exists; the core's d2 test asks the same).
const record = (op, args, fn) => {
  if ((op !== 'spec' && Array.isArray(args) && args.length === 0) || limited || JSON.stringify(args === undefined ? [] : args).length > 4e6) return fn();
  let answer, error = null;
  try { answer = fn(); } catch (e) { error = true; }
  out.push({ story, op, args: JSON.parse(JSON.stringify(args === undefined ? [] : args)), ...(error ? { error } : { answer: JSON.parse(JSON.stringify(answer === undefined ? null : answer)) }) });
  return error ? fn() : answer;
};
const door = fb.door;
fb.door = (op, ...args) => record(op, args, () => door(op, ...args));
for (const [name, op] of [['padSize', 'padded_size'], ['wellKnownErrors', 'well_known_errors'], ['announcement', 'announcement']]) {
  const f = fb[name];
  fb[name] = (...args) => record(op, args.slice(0, f.length || 1), () => f(...args));
}
const setLimit = fb.setReadLimit;
fb.setReadLimit = n => { limited = n !== null && n !== undefined && n !== Infinity; return setLimit(n); };
const quiet = console.log;
console.log = () => {};
for (const f of fs.readdirSync(__dirname).filter(x => /^7-.*\.cjs$/.test(x) && !/^7-readback/.test(x)).sort()) {
  story = f.replace(/\.cjs$/, '');
  try { require('./' + f); } catch (e) { process.stderr.write(`${story} stopped: ${e.message}\n`); }
}
console.log = quiet;
process.exitCode = 0;
// a mount is a fresh random id each time it is made: a question naming one is never a duplicate of another
// and a question that names a mount reads what the mount holds then, so it is kept wherever it is asked
const mounts = new Set(out.filter(q => q.op === 'mount' && typeof q.answer === 'string').map(q => q.answer));
const namesMount = q => JSON.stringify(q.args).match(/"[0-9a-f]{32}"/g)?.some(m => mounts.has(m.slice(1, -1)));
const seen = new Set(), qs = out.filter(q => { if (q.op === 'mount' || q.op === 'unmount' || namesMount(q)) return true; const k = q.op + JSON.stringify(q.args); if (seen.has(k)) return false; seen.add(k); return true; });
const file = path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage7.json');
fs.writeFileSync(file, JSON.stringify({ about: 'the door questions of spec/oracle/stage7 but the read-back, with the oracle\'s answers (node spec/oracle/stage7/export.cjs)', questions: qs }) + '\n');
console.log(`${qs.length} questions from ${new Set(qs.map(q => q.story)).size} stories -> ${path.relative(process.cwd(), file)}`);
