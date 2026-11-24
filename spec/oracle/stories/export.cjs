// node export.cjs [subject...] : every door question the stories of each subject folder ask, with the oracle's answer (each story checks that answer
// against the text), written to sdk/rust/tests/fixtures/<subject>.json so the Rust core is asked the same questions. Each question is tagged `story`,
// the story file's name. A question the oracle refuses (it throws) is kept as such. `readback/` has its own export (readback/export.cjs).
// Each subject runs in its own process (the stories share one kit, whose names and tags are per run).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FIXTURES = path.join(__dirname, '../../../sdk/rust/tests/fixtures');
const subjects = fs.readdirSync(__dirname, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'readback').map(d => d.name).sort();

// how each subject's questions are taken. `names`: the fixture also carries the kit's names and tags. `dedup`: one question once (the stories ask the same door question many times).
// `skip`: stories left out (the Rust test builds its own long chain). `wrap`: other calls asked as door ops (`whyNotUnder` is the op `why_not_under`; `writeFindings` is not a door op and is not exported).
// `last`: the privacy and rules way: library calls the core's door has as an op are asked as that op, a question asked under a reader's limit is not exported, a mount is never a duplicate, and a story that stops is named and passed over.
const plain = { names: true };
const PROFILES = {
  records: { ...plain, skip: ['no-answer-depends-on-the-machine.cjs'] },
  things: plain,
  keys: plain,
  payments: plain,
  grants: { dedup: true, wrap: ['whyNotUnder'] },
  deals: { dedup: true, wrap: ['whyNotUnder'] },
  circles: { dedup: true, wrap: ['whyNotUnder', 'readFindings'] },
  privacy: { last: true },
  rules: { last: true },
};
const profileOf = s => PROFILES[s] || { dedup: true, wrap: ['whyNotUnder'] };

function exportOne(subject) {
  const P = profileOf(subject);
  const fb = require('../fb.cjs');
  const out = [];
  let story = '', limited = false;
  // A question whose arguments pass 4 MB (rule_set over the whole spec, vectors.json and all) is not exported either: the core's own rule_set story asks the same rule of small files.
  // The probe that every protocol op is answered asks each op of no arguments at all: what an op answers to nothing is each engine's own (an argument error, or null), so those questions are not exported.
  const record = (op, args, fn) => {
    if (P.last && ((op !== 'spec' && Array.isArray(args) && args.length === 0) || limited || JSON.stringify(args === undefined ? [] : args).length > 4e6)) return fn();
    let answer, error = null;
    try { answer = fn(); } catch (e) { error = true; }
    out.push({ story, op, args: JSON.parse(JSON.stringify(args === undefined ? [] : args)), ...(error ? { error } : { answer: JSON.parse(JSON.stringify(answer === undefined ? null : answer)) }) });
    return error ? fn() : answer;
  };
  const door = fb.door;
  fb.door = (op, ...args) => record(op, args, () => door(op, ...args));
  if ((P.wrap || []).includes('whyNotUnder') && fb.whyNotUnder) fb.whyNotUnder = (b, blocks) => record("why_not_under", [b, blocks], () => door("why_not_under", b, blocks));
  if ((P.wrap || []).includes('readFindings')) { const rf = fb.readFindings; fb.readFindings = (b, blocks, sc) => record("read", sc === undefined ? [b, blocks] : [b, blocks, sc], () => rf(b, blocks, sc)); }
  if (P.last) {
    for (const [name, op] of [['padSize', 'padded_size'], ['wellKnownErrors', 'well_known_errors'], ['announcement', 'announcement']]) {
      const f = fb[name];
      fb[name] = (...args) => record(op, args.slice(0, f.length || 1), () => f(...args));
    }
    const setLimit = fb.setReadLimit;
    fb.setReadLimit = n => { limited = n !== null && n !== undefined && n !== Infinity; return setLimit(n); };
  }
  const quiet = console.log;
  console.log = () => {};
  const dir = path.join(__dirname, subject);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.cjs') && x !== 'lib.cjs' && !(P.skip || []).includes(x)).sort()) {
    story = f.replace(/\.cjs$/, '');
    if (P.last) { try { require(path.join(dir, f)); } catch (e) { process.stderr.write(`${story} stopped: ${e.message}\n`); } } else require(path.join(dir, f));
  }
  console.log = quiet;
  process.exitCode = 0;
  let qs = out;
  if (P.dedup || P.last) {
    // a mount is a fresh random id each time it is made: a question naming one is never a duplicate of another,
    // and a question that names a mount reads what the mount holds then, so it is kept wherever it is asked
    const mounts = P.last ? new Set(out.filter(q => q.op === 'mount' && typeof q.answer === 'string').map(q => q.answer)) : new Set();
    const namesMount = q => JSON.stringify(q.args).match(/"[0-9a-f]{32}"/g)?.some(m => mounts.has(m.slice(1, -1)));
    const seen = new Set();
    qs = out.filter(q => { if (P.last && (q.op === 'mount' || q.op === 'unmount' || namesMount(q))) return true; const k = q.op + JSON.stringify(q.args); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const file = path.join(FIXTURES, subject + '.json');
  const body = { about: `the door questions of spec/oracle/stories/${subject}, with the oracle's answers (node spec/oracle/stories/export.cjs ${subject})`, questions: qs };
  if (P.names) { const K = require('./kit.cjs'); body.names = Object.fromEntries([...K.NAME, ...K.TAG]); }
  fs.writeFileSync(file, JSON.stringify(body) + '\n');
  console.log(`${subject}: ${qs.length} questions from ${new Set(qs.map(q => q.story)).size} stories -> ${path.relative(process.cwd(), file)}`);
}

if (require.main === module) {
  const want = process.argv.slice(2);
  if (want.length === 1) exportOne(want[0]);
  else {
    let bad = 0;
    for (const s of want.length ? want : subjects) {
      const r = cp.spawnSync('node', [__filename, s], { encoding: 'utf8', maxBuffer: 1 << 28 });
      process.stdout.write(r.stdout); process.stderr.write(r.stderr || '');
      if (r.status !== 0) bad++;
    }
    process.exitCode = bad ? 1 : 0;
  }
}
