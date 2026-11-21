// node run-all.cjs : every story of stage 3, in order (the answers are in ANSWERS.md, made by node make-answers.cjs)
const cp = require('child_process');
for (const f of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']) process.stdout.write(cp.spawnSync('node', [__dirname + '/' + f + '.cjs'], { encoding: 'utf8' }).stdout);
