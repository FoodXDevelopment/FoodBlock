// compares the stage 1 questions' answers (stage1-scratch/ANSWERS.md, 1.7-signed) with the same stories re-signed under the header (stage1-resigned/stories.cjs, new oracle)
const fs = require('fs'), cp = require('child_process');
const md = fs.readFileSync(__dirname + '/../stage1-scratch/ANSWERS.md', 'utf8').split('\n');
const old = new Map(); let sec = '';
for (let i = 0; i < md.length; i++) {
  const h = /^## (.*)$/.exec(md[i]); if (h) { sec = h[1]; continue; }
  const q = /^- Q: (.*?)\s*$/.exec(md[i]); if (q && /^\s+A: `(.*)`\s*$/.test(md[i + 1] || '')) old.set(sec + ' | ' + q[1], /^\s+A: `(.*)`\s*$/.exec(md[i + 1])[1]);
}
const out = cp.spawnSync('node', [__dirname + '/stage1-resigned/stories.cjs'], { encoding: 'utf8' }).stdout.split('\n');
let same = 0, diff = [], missing = [];
const seen = new Set();
for (const l of out) { const m = /^(.*?) \| (.*?) => (.*)$/.exec(l); if (!m) continue; const k = m[1] + ' | ' + m[2]; seen.add(k); if (!old.has(k)) { missing.push(k); continue; } if (old.get(k) === m[3]) same++; else diff.push([k, old.get(k), m[3]]); }
console.log('same', same, 'different', diff.length, 'not in ANSWERS.md', missing.length, 'in ANSWERS.md not asked', [...old.keys()].filter(k => !seen.has(k)).length);
for (const d of diff) console.log('DIFF', d[0], '\n   was', d[1], '\n   now', d[2]);
for (const k of missing.slice(0, 5)) console.log('MISSING', k);
