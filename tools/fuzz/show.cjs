#!/usr/bin/env node
// node tools/fuzz/show.cjs repro.json : a saved reproducer, one line per block, and what each side answers.
const fs = require('fs'), { spawnSync } = require('child_process'), path = require('path');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const h = x => (typeof x === 'string' ? x.slice(0, 4) : Array.isArray(x) ? x.map(h) : x);
const line = b => `${h(b.hash)} ${b.type}${b.state && b.state.kind ? ':' + b.state.kind : ''}${b.state && b.state.status ? ' ' + b.state.status + (b.state.stop ? '/' + b.state.stop : '') : ''} seq${b.state && b.state.seq} ` + Object.entries(b.refs || {}).map(([k, v]) => k + '=' + JSON.stringify(h(v))).join(' ') + (b.state && b.state.terms ? ' terms=' + JSON.stringify(b.state.terms).slice(0, 80) : '') + (b.state && b.state.scope ? ' scope=' + JSON.stringify(b.state.scope).slice(0, 100) : '');
console.log('op', r.op);
r.args.forEach((a, i) => {
  if (Array.isArray(a) && a.length && a[0] && a[0].refs) { console.log(`arg${i}:`); a.forEach(b => console.log('   ' + line(b))); }
  else if (a && a.refs) console.log(`arg${i}: ` + line(a));
  else console.log(`arg${i}: ` + JSON.stringify(h(a)).slice(0, 300));
});
const out = spawnSync(path.join(__dirname, 'target/release/fbfuzz'), ['serve'], { input: JSON.stringify(r) + '\n', encoding: 'utf8' });
console.log('RUST  ', out.stdout.slice(0, 700));
const { OPS } = require('./diff.cjs'); try { console.log('ORACLE', JSON.stringify(OPS[r.op].oracle(...JSON.parse(JSON.stringify(r.args)))).slice(0, 700)); } catch (e) { console.log('ORACLE throws', e.message); }
