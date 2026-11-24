#!/usr/bin/env node
'use strict';
// No engine branches on a kind the protocol does not declare (blocks.md; protocol.json `kinds`): a kind is a free label, so a rule that reads one
// must have it declared, or it is a reading's own kind and conventions.json names it. Reads every comparison of a block's `state.kind` with a word
// in the oracle (spec/oracle) and the core (sdk/rust/src), and fails on any other.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../spec/protocol.json'), C = fs.readFileSync(path.join(ROOT, 'spec/conventions.json'), 'utf8');
const declared = new Set(Object.values(P.kinds).flat());
const named = (k) => C.includes('`' + k + '`') || C.includes('"' + k + '"') || C.includes('kind ' + k);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = [...walk(path.join(ROOT, 'spec/oracle')).filter((f) => f.endsWith('.cjs') && !f.includes(`${path.sep}stories${path.sep}`)), ...walk(path.join(ROOT, 'sdk/rust/src')).filter((f) => f.endsWith('.rs'))];
const PATTERNS = [/state\.kind\s*[!=]==\s*'([a-z_]+)'/g, /ss\([a-z_&]+,\s*"kind"\)\s*[!=]=\s*Some\("([a-z_]+)"\)/g];
const bad = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => { for (const rx of PATTERNS) for (const m of line.matchAll(rx)) if (!declared.has(m[1]) && !named(m[1])) bad.push(`${path.relative(ROOT, f)}:${i + 1}: kind ${m[1]}`); });
}
if (bad.length) { console.error('branches on a kind protocol.json does not declare and no reading names:\n' + bad.join('\n')); process.exit(1); }
console.log(`kinds: every kind ${files.length} engine files branch on is declared or a reading's (${declared.size} declared)`);
