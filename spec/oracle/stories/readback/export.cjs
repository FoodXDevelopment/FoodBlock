// node export.cjs : the cases of the read-back (readings/readback.md), from the oracle's read-back stories (redone-readback.cjs, twenty-lines.cjs):
//   spec/readings/readback.cases.json   each reading asked: the blocks held, the block, the person it is read to, and the answer
//   spec/renderers/en.cases.json, en-sms.cases.json   each answer and the text the renderer makes of it
//   sdk/rust/tests/fixtures/readback.json   every door question the stories ask of `readback`, `render` and `readback_redo`, with the oracle's answer
// The cases name no reading or renderer (a name is the hash of the files that hold the cases); the fixture does (a readback's state names both), so it is written after them.
// Blocks are written once, in `blocks`, and named by their place there (two blocks may share an id: a block with a broken signature).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../../..');
const L = require('./lib.cjs');
const { fb, R, en, enSms } = L;
const jcs = fb.jcs;
const pool = [], at = new Map();
const ref = b => { const k = jcs(b); if (!at.has(k)) { at.set(k, pool.length); pool.push(JSON.parse(JSON.stringify(b))); } return at.get(k); };
const readings = [], renders = { en: [], 'en-sms': [] }, door = [];
const seen = new Set(), once = (k) => (seen.has(k) ? false : (seen.add(k), true));
const reading = R.readback;
// a case holds no readback observe (its state names the reading and renderer: no self-reference), so a case is asked over the held blocks less those
const named = x => x && x.type === 'observe' && x.state && x.state.kind === 'readback';
let cases = true;
R.readback = (b, held, to) => {
  const answer = reading(b, held, to);
  if (!cases || named(b)) return answer;
  const less = (held || []).filter(x => !named(x)), a0 = less.length === (held || []).length ? answer : reading(b, less, to);
  const c = { block: ref(b), held: less.map(ref), to: to === undefined ? null : to, answer: JSON.parse(JSON.stringify(a0)) };
  if (once('r' + jcs([c.block, c.held, c.to]))) readings.push(c);
  for (const [name, fn] of [['en', en], ['en-sms', enSms]]) { const text = fn(a0); if (once(name + jcs(a0))) renders[name].push({ answer: c.answer, text }); }
  return answer;
};
const ask = fb.door;
fb.door = (op, ...args) => {
  if (!['readback', 'render', 'readback_redo'].includes(op)) return ask(op, ...args);
  let answer, error = null;
  try { answer = ask(op, ...args); } catch (e) { error = true; }
  // the held list and a block argument by their place in `blocks`
  const a = args.map((x, i) => ((op === 'readback' && i === 0) || (op === 'readback_redo' && i === 0) ? (x && typeof x === 'object' ? { block: ref(x) } : x) : i === 1 && op !== 'render' && Array.isArray(x) ? { held: x.map(ref) } : x));
  if (once('d' + op + jcs(a))) door.push({ op, args: JSON.parse(JSON.stringify(a)), ...(error ? { error } : { answer: JSON.parse(JSON.stringify(answer)) }) });
  if (op === 'readback' && !error) R.readback(typeof args[0] === 'string' ? args[1].find(x => x.hash === args[0]) : args[0], args[1], args[2]);
  return error ? ask(op, ...args) : answer;
};
const quiet = console.log; console.log = () => {};
for (const f of ['redone-readback.cjs', 'twenty-lines.cjs']) require('./' + f);
console.log = quiet; process.exitCode = 0;
const write = (file, v) => fs.writeFileSync(path.join(ROOT, file), JSON.stringify(v, null, 1) + '\n');
const about = what => `${what}, from the oracle's read-back stories (node spec/oracle/stories/readback/export.cjs). Blocks are named by their place in \`blocks\`.`;
const used = [...new Set(readings.flatMap(c => [c.block, ...c.held]))].sort((x, y) => x - y), re = new Map(used.map((i, j) => [i, j]));
write('spec/readings/readback.cases.json', { about: about('readings/readback: each case the block, the blocks held and the person it is read to (`to`), and the answer'), blocks: used.map(i => pool[i]), cases: readings.map(c => ({ ...c, block: re.get(c.block), held: c.held.map(i => re.get(i)) })) });
write('spec/renderers/en.cases.json', { about: 'renderers/en: each case an answer of readings/readback and the text (node spec/oracle/stories/readback/export.cjs)', cases: renders.en });
write('spec/renderers/en-sms.cases.json', { about: 'renderers/en-sms: each case an answer of readings/readback and the text (node spec/oracle/stories/readback/export.cjs)', cases: renders['en-sms'] });
// the names change with the cases: the door questions are asked again under the names the files now give
door.length = 0; seen.clear(); cases = false;
for (const f of ['redone-readback.cjs', 'twenty-lines.cjs']) delete require.cache[require.resolve('./' + f)];
console.log = () => {};
for (const f of ['redone-readback.cjs', 'twenty-lines.cjs']) require('./' + f);
console.log = quiet; process.exitCode = 0;
write('sdk/rust/tests/fixtures/readback.json', { about: about('the door questions of the read-back (readback, render, readback_redo), with the oracle\'s answers'), blocks: pool, questions: door });
console.log(`${readings.length} reading cases (${used.length} blocks), ${renders.en.length} en and ${renders['en-sms'].length} en-sms cases, ${door.length} door questions, ${pool.length} blocks`);
