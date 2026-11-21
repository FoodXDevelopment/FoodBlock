// node export.cjs : every door question the stories of CORE-SET 3c, 3d and 3e ask, with the oracle's answer (each story checks that answer against
// the text), written to sdk/rust/tests/fixtures/core-set-b.json so the Rust core is asked the same questions (tests/core_set_a.rs).
// story's 6,000 makes are left out (the Rust test builds its own long chain). A question the oracle refuses (it throws) is kept as such.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const out = [];
let story = '';
const door = L.fb.door;
L.fb.door = (op, ...args) => {
  let answer, error = null;
  try { answer = door(op, ...args); } catch (e) { error = true; }
  out.push({ story, op, args: JSON.parse(JSON.stringify(args === undefined ? [] : args)), ...(error ? { error } : { answer: JSON.parse(JSON.stringify(answer === undefined ? null : answer)) }) });
  if (error) return door(op, ...args);
  return answer;
};
const quiet = console.log;
console.log = () => {};
// (stage5-3d-16.cjs, the will's story, lands with stage 5 and is exported here with its set: end pass 2026-11-20)
for (const f of fs.readdirSync(__dirname).filter(x => /^(3[cde]-|stage5-3d-16).*\.cjs$/.test(x)).sort()) {
  story = f.replace(/\.cjs$/, '');
  require('./' + f);
}
console.log = quiet;
const file = path.join(__dirname, '../../../sdk/rust/tests/fixtures/core-set-b.json');
fs.writeFileSync(file, JSON.stringify({ about: 'the door questions of spec/oracle/core-set-b, with the oracle\'s answers (node spec/oracle/core-set-b/export.cjs)', questions: out, names: Object.fromEntries([...L.NAME, ...L.TAG]) }) + '\n');
console.log(`${out.length} questions from ${new Set(out.map(q => q.story)).size} stories -> ${path.relative(process.cwd(), file)}`);
