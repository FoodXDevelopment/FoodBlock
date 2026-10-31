#!/usr/bin/env node
'use strict';
// node tools/sim/oracle-check.cjs world.json  (written by `fbsim dump`)
// Asks every fold of protocol.json (`folds`) of the whole world, of the spec-only oracle and of the Rust core, and prints where they differ.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { compare, unaskable } = require('../fuzz/diff.cjs');
const { askAll } = require('../fuzz/folds.cjs');
if (unaskable().length) { console.log('no OPS entry for the fold(s) ' + unaskable().join(', ')); process.exit(1); }
const reqs = askAll(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const input = reqs.map(r => JSON.stringify({ op: r.op, args: r.args })).join('\n') + '\n';
const out = spawnSync(path.join(__dirname, '../fuzz/target/release/fbfuzz'), ['serve'], { input, encoding: 'utf8', maxBuffer: 1 << 30 }).stdout.trim().split('\n').map(JSON.parse);
let bad = 0;
reqs.forEach((r, i) => { const c = compare(r, out[i]); if (c) { bad++; if (bad <= 8) console.log(r.fold, r.what, c.kind, c.detail.slice(0, 300)); } });
console.log(`${reqs.length} folds compared, ${bad} disagree`);
process.exit(bad ? 1 : 0);
