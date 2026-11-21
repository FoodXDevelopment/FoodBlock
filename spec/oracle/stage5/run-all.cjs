// node run-all.cjs : every story of stage 5 (changes-1.9/05-deals.md), each question with the oracle's answer and the answer the text gives; exits 1 if any differ
const cp = require('child_process'), fs = require('fs');
let bad = 0;
for (const f of fs.readdirSync(__dirname).filter(x => /^5-.*\.cjs$/.test(x)).sort()) {
  const r = cp.spawnSync('node', [__dirname + '/' + f], { encoding: 'utf8', maxBuffer: 1 << 26 });
  process.stdout.write(r.stdout + (r.stderr || ''));
  if (r.status !== 0) bad++;
}
console.log(bad ? `${bad} script(s) with differences` : 'all scripts agree with the text');
process.exitCode = bad ? 1 : 0;
