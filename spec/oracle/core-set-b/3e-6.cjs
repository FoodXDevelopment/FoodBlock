const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
// 3e-6 Pieces a payment pays for. uncovered.from in four splits: 7 per 3, took 3, paid 5: 6/7 (3 less 15/7); 0 per 3, took 3: 0; 120 per kg, took 2,500 g, paid 300: 2500 g; 10 per 3, took 7, paid 24: 0.
function perN(a, per, moveUnit, moved, paid) {
  const w = new World(), harry = P(w, 'harry'), sam = P(w, 'sam');
  const K = kindOf(harry, 'goods'), lot = T(instance(harry, K, { pack: A('10000', moveUnit) }), 'lot');
  const o = T(harry.write('promise', { terms: { price: { amount: a, per }, quantity: A(String(moved), moveUnit) } }, { from: harry.id, to: sam.id, what: lot.hash }), 'offer');
  sam.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
  const d = harry.write('transfer', { amount: A(String(moved), moveUnit) }, { what: lot.hash, to_owner: sam.id, for: o.hash });
  sam.write('transfer', { status: 'accepted' }, { answers: d.hash, for: o.hash });
  const pay = sam.write('transfer', { amount: paid }, { to_owner: harry.id, for: o.hash });
  harry.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: o.hash });
  return fb.door('promise_stage', o, w.blocks, {});
}
const from = st => st.uncovered.from.map(x => am(x.amount));
check('3e-6', '7 per 3, took 3, paid 5: 6/7', from(perN(A('7', 'KES'), A('3', 'piece'), 'piece', 3, A('5', 'KES'))), ['6/7 piece']);
check('3e-6', '0 per 3, took 3, paid 0 : all that moved is paid for', from(perN(A('0', 'KES'), A('3', 'piece'), 'piece', 3, A('1', 'KES'))), ['0 piece']);
check('3e-6', '120 per kg, took 2,500 g, paid 300: nothing moved in kg: 2500 g', from(perN(A('120', 'GBP'), A('1', 'kg'), 'g', 2500, A('300', 'GBP'))), ['2500 g']);
check('3e-6', '10 per 3, took 7, paid 24: 24 x 3 / 10 = 7.2 covers all 7: 0', from(perN(A('10', 'KES'), A('3', 'piece'), 'piece', 7, A('24', 'KES'))), ['0 piece']);
done();
