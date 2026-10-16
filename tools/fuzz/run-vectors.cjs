#!/usr/bin/env node
'use strict';
// node tools/fuzz/run-vectors.cjs : spec/fuzz-vectors.json through the Rust core (fbfuzz serve) and the oracle.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const fb = require('../../spec/oracle/fb.cjs');
const V = JSON.parse(fs.readFileSync(path.join(__dirname, '../../spec/fuzz-vectors.json'), 'utf8')).vectors;
const bin = path.join(__dirname, 'target/release/fbfuzz');
const input = V.map(v => JSON.stringify({ op: v.op, args: v.args })).join('\n') + '\n';
const rust = spawnSync(bin, ['serve'], { input, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.trim().split('\n').map(JSON.parse);
const codes = l => [...new Set(l.map(x => (typeof x === 'string' ? x : x.code)))];
const subset = (got, want) => want && typeof want === 'object' && !Array.isArray(want) ? Object.entries(want).every(([k, w]) => subset(got && got[k], w)) : JSON.stringify(got) === JSON.stringify(want);
const read = (v, got) => {
  if (v.by === 'first_code') return codes(got).slice(0, 1);
  if (v.by === 'includes_code') return codes(got).filter(c => v.expect.includes(c));
  if (v.by === 'codes') return codes(got);
  return got;
};
const holds = (v, got) => (v.by === 'subset' ? subset(got, v.expect) : JSON.stringify(read(v, got)) === JSON.stringify(v.by === 'includes_code' ? v.expect : v.expect));
let bad = 0;
V.forEach((v, i) => {
  const r = rust[i], rg = r.ok;
  const rustOk = r.ok !== undefined && holds(v, rg);
  let oracleOk = true, oracleSaid = 'skipped';
  if (v.oracle !== false) {
    try {
      const o = require('./diff.cjs').OPS[v.op].oracle(...JSON.parse(JSON.stringify(v.args)));
      oracleSaid = JSON.stringify(o).slice(0, 120);
      oracleOk = holds(v, v.op === 'promise_stage' ? o : o);
    } catch (e) { oracleOk = false; oracleSaid = 'throws ' + e.message; }
  }
  if (!rustOk || !oracleOk) { bad++; console.log(`FAIL ${v.name}\n   rust ${JSON.stringify(r).slice(0, 200)} ok=${rustOk}\n   oracle ${oracleSaid} ok=${oracleOk}`); }
});
console.log(`${V.length - bad} of ${V.length} fuzz vectors hold in the Rust core and the oracle`);
process.exit(bad ? 1 : 0);
