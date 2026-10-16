#!/usr/bin/env node
'use strict';
// node tools/sim/oracle-check.cjs world.json  (written by `fbsim dump`)
// Folds every thing, deal and circle of a simulated world with the spec-only oracle and with the Rust core, and prints where they differ.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { OPS } = require('../fuzz/diff.cjs');
const blocks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const reqs = [];
for (const b of blocks) {
  if (b.type === 'thing') { reqs.push({ op: 'ownership', args: [b, blocks] }); reqs.push({ op: 'where_now', args: [b, blocks] }); }
  else if (b.type === 'promise' && !b.refs.answers && !b.refs.updates) reqs.push({ op: 'promise_stage', args: [b, blocks, {}] });
  else if (b.type === 'actor' && b.state.kind === 'circle') reqs.push({ op: 'circle_state', args: [b.hash, blocks] });
}
const input = reqs.map(r => JSON.stringify(r)).join('\n') + '\n';
const out = spawnSync(path.join(__dirname, '../fuzz/target/release/fbfuzz'), ['serve'], { input, encoding: 'utf8', maxBuffer: 1 << 30 }).stdout.trim().split('\n').map(JSON.parse);
const { compare } = require('../fuzz/diff.cjs');
let bad = 0;
reqs.forEach((r, i) => { const c = compare(r, out[i]); if (c) { bad++; if (bad <= 8) console.log(r.op, (r.args[0].hash || r.args[0]).slice(0, 8), c.kind, c.detail.slice(0, 300)); } });
console.log(`${reqs.length} folds compared, ${bad} disagree`);
process.exit(bad ? 1 : 0);
