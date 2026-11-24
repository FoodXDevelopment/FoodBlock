// (core.md, section 11; folds.md, Read whole) An old reader answers less, never otherwise. Where it stops at its own limit it says how far it got, and never names another owner.
const L = require('../kit.cjs'); const { fb, World, P, T, A, kindOf, instance, deal, sell, check, done, nm, sha } = L;
{
  // Maria's starter: N makes, each from the last (scaled from the text's 6,000; the limit is scaled alike: the last N/6 makes are read). FB_SLOW=1 runs the text's whole world: 6,000 makes, a limit of 1,000, lacks M5000. Amara buys a jar from the last.
  const N = process.env.FB_SLOW === '1' ? 6000 : 600, w = new World(), maria = P(w, 'maria'), amara = P(w, 'amara');
  const K = kindOf(maria, 'starter');
  let cur = instance(maria, K, { pack: A('1', 'jar') });
  const makes = [];
  for (let i = 1; i <= N; i++) { const mk = maria.write('transform', { name: 'make' + i, inputs: [{ from: cur.hash, amount: A('1', 'jar') }] }, { derives_from: [cur.hash] }); makes.push(mk); cur = maria.write('thing', { name: 'j' + i, pack: A('1', 'jar') }, { of: K.hash, derives_from: [mk.hash] }); }
  const d = deal(maria, cur, amara, A('1', 'jar')); sell(maria, cur, amara, d, A('1', 'jar'));
  const full = fb.door('ownership', cur, w.blocks);
  check('old reader answers less', 'a reader that walks the chain: Amara', full.owners.map(o => nm(o.owner)), ['amara']);
  const old = fb.setReadLimit(N / 6);
  let r; try { r = fb.door('ownership', cur, w.blocks); } finally { fb.setReadLimit(old === Infinity ? null : old); }
  // M_N is the last make; with a limit of N/6 makes the walk reads M_N down to M_(N - N/6 + 1), and the first block it did not read is M_(N - N/6)
  const first = makes[N - N / 6 - 1];
  check('old reader answers less', 'a reader whose limit is N/6 makes: not_shown, lacks names the first make it did not read, and why', [r.not_shown, r.lacks[0] === first.hash, r.lacks[1]], [true, true, { stopped: 'depth' }]);
  check('old reader answers less', 'it never names an owner', r.owners, undefined);
  check('old reader answers less', 'the limit is the reader\'s own and changes with it: set back, the same world gives Amara', fb.door('ownership', cur, w.blocks).owners.map(o => nm(o.owner)), ['amara']);
}
done();
