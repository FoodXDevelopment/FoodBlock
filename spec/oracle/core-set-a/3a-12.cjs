const L = require('./lib.cjs'); const { fb, World, P, T, A, kindOf, instance, deal, sell, check, done, ownersOf, nm } = L;
const cp = require('child_process');
// 3a-12 No answer depends on the machine. World (scaled: 300 makes where the text says 6,000): Maria feeds her starter, each make from the last; Amara buys a jar from the last.
// The answer is Amara on a reader that walks it, and not_shown (with why) on one that stops; never an abort, a trap or a RangeError.
const N = +(process.env.N || 300);
function run() {
  const w = new World(), maria = P(w, 'maria'), amara = P(w, 'amara');
  const K = kindOf(maria, 'starter');
  let cur = instance(maria, K, { pack: A('1', 'jar') });
  for (let i = 0; i < N; i++) { const mk = maria.write('transform', { name: 'make' + i, inputs: [{ from: cur.hash, amount: A('1', 'jar') }] }, { derives_from: [cur.hash] }); cur = maria.write('thing', { name: 'j' + i, pack: A('1', 'jar') }, { of: K.hash, derives_from: [mk.hash] }); }
  const d = deal(maria, cur, amara, A('1', 'jar'));
  sell(maria, cur, amara, d, A('1', 'jar'));
  if (process.argv[2] === 'build') { require('fs').writeFileSync(process.argv[3], JSON.stringify({ cur, blocks: w.blocks })); return null; }
  return ask(cur, w.blocks); }
function ask(cur, blocks) {
  try { const r = fb.door('ownership', cur, blocks); return r.not_shown ? { not_shown: true, why: r.lacks.map(x => JSON.stringify(x)) } : { owners: r.owners.map(o => nm(o.owner)) }; } catch (e) { return { threw: e.constructor.name }; }
}
if (process.argv[2] === 'child') { const f = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); console.log(JSON.stringify(ask(f.cur, f.blocks))); process.exit(0); }
const FILE = '/tmp/ob/3a-12.world.json';
process.argv[2] = 'build'; process.argv[3] = FILE; run(); process.argv[2] = undefined;
check('3a-12', 'a reader that walks the chain: Amara', (() => { const f = JSON.parse(require('fs').readFileSync(FILE, 'utf8')); return ask(f.cur, f.blocks); })(), { owners: ['amara'] });
for (const stack of [90, 120]) {
  const out = cp.spawnSync('node', ['--stack-size=' + stack, __filename, 'child', FILE], { encoding: 'utf8' }).stdout.trim();
  const r = out ? JSON.parse(out) : { crashed: true };
  check('3a-12', 'the same world on a machine whose stack is small (--stack-size=' + stack + '): Amara or not_shown with a reason, never a throw', !!(r.owners && r.owners.length === 1) || !!(r.not_shown && r.why.length), true);
}
done();
