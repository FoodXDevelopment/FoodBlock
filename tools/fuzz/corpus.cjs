'use strict';
// The fixed corpus of the random-world test: every engine split of part 08's table (1.9 plan, section 7.3) that stages 0 to 3 can express,
// each a world built the way the seat that found it built it (its script's block-building, made deterministic by lib18.cjs), and the old
// tester's own minimal reproducers (corpus/legacy-1.7/, rows 1 to 5: the 61 splits it found on 1.7-shaped worlds, seeds 1 to 10).
// Each entry: { name, row, source, build(L) } in corpus/*.cjs; build asks its questions with L.ask(w, label, op, args).
const fs = require('fs'), path = require('path');
const L = require('./lib18.cjs');

const DIR = path.join(__dirname, 'corpus');
// The old tester's reproducers, by op: which row of the table each stands for.
// identity_state: the old projection read a 1.7 field and threw (a harness bug, fixed in diff.cjs OPS); both engines agree on it now.
const LEGACY_ROW = { scope_reading: 1, stands: 4, identity_state: 'harness' };
const LEGACY_FILE_ROW = { 'repro-valid-1-0': 2, 'repro-valid-4-32': 3 };
function legacy() {
  const dir = path.join(DIR, 'legacy-1.7');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const q = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { name: 'legacy-1.7/' + f.replace(/\.json$/, ''), row: LEGACY_FILE_ROW[f.replace(/\.json$/, '')] || LEGACY_ROW[q.op] || 5, source: 'tools/fuzz/diff.cjs (1.7 worlds), seed ' + q.world, questions: [{ world: '1.7 world ' + q.world, label: q.op, op: q.op, args: q.args }] };
  });
}
// Reduced reproducers of what the random worlds found outside the table (corpus/found/): { row, label, source, cause, op, args }.
function found() {
  const dir = path.join(DIR, 'found');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const q = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { name: 'found/' + f.replace(/\.json$/, ''), row: q.row, source: q.source, questions: [{ world: q.source, label: q.label, op: q.op, args: q.args }] };
  });
}
function loadCorpus(only) {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.cjs')).sort()) {
    for (const entry of require(path.join(DIR, f))) {
      if (only && !entry.name.includes(only) && String(entry.row) !== only) continue;
      const questions = [];
      L.collect(questions);
      try { entry.build(L); } catch (e) { out.push({ ...entry, file: f, buildError: String(e && e.stack || e).split('\n').slice(0, 3).join(' | '), questions: [] }); continue; }
      L.collect(null);
      out.push({ ...entry, file: f, questions });
    }
  }
  for (const e of [...legacy(), ...found()]) if (!only || e.name.includes(only) || String(e.row) === only) out.push(e);
  return out;
}
module.exports = { loadCorpus };
