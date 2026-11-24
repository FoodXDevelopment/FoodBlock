'use strict';
// The fixed corpus of the random-world test: every engine split that the random worlds can express, each a world built by hand
// (its block-building made deterministic by block-builders.cjs), plus the reduced worlds the fuzzer found, kept as signed blocks in corpus/found/.
// Each entry: { name, row, source, build(L) } in corpus/*.cjs; build asks its questions with L.ask(w, label, op, args).
const fs = require('fs'), path = require('path');
const L = require('./block-builders.cjs');

const DIR = path.join(__dirname, 'corpus');
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
  for (const e of found()) if (!only || e.name.includes(only) || String(e.row) === only) out.push(e);
  return out;
}
module.exports = { loadCorpus };
