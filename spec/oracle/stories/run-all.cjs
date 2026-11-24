// node run-all.cjs [subject...] : every story of every subject, each question with the oracle's answer and the answer the text gives; exits 1 if any differ
const cp = require('child_process'), fs = require('fs'), path = require('path');
const subjects = fs.readdirSync(__dirname, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
let bad = 0;
for (const s of process.argv.length > 2 ? process.argv.slice(2) : subjects) {
  const dir = path.join(__dirname, s);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.cjs') && !['lib.cjs', 'export.cjs'].includes(x)).sort()) {
    const r = cp.spawnSync('node', [path.join(dir, f)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    process.stdout.write(r.stdout + (r.stderr || ''));
    if (r.status !== 0) bad++;
  }
}
console.log(bad ? `${bad} script(s) with differences` : 'all scripts agree with the text');
process.exitCode = bad ? 1 : 0;
