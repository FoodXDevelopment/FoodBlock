const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey, offer, accepts } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
// a deal: Mama offers `what` at `price` for `qty`; Leila takes `take` and pays `paid` (a transfer Mama accepts)
function deal(price, take, paid, extra = {}) {
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const o = T(mama.write('promise', { terms: require('../kit.cjs').linesFor(null, { price, quantity: take.max || take, ...extra }) }, { from: mama.id, to: leila.id }), 'M1');
  leila.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: take }] } }, { answers: o.hash, for: o.hash });
  let pay = null;
  if (paid) { pay = leila.write('transfer', { amount: paid }, { to_owner: mama.id, for: o.hash }); mama.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: o.hash }); }
  return { w, o, st: fb.door('promise_stage', o, w.blocks, {}) };
}
const per = (a, p) => ({ amount: a, per: p });
// How a price is counted: multiply, never divide. World: (1) Mama M1 offers mandazi at 7 per 3; Leila takes 3 and pays 5. Expect not paid (15 < 21). (2) The same, paid 7: paid.
{
  const a = deal(per(A('7', 'KES'), A('3', 'piece')), A('3', 'piece'), A('5', 'KES'));
  check('price counted', 'takes 3 at 7 per 3, pays 5: total 7, not paid (5 x 3 = 15 < 7 x 3 = 21)', [am(a.st.total), am(a.st.paid), a.st.paid_at !== null], ['7 KES', '5 KES', false]);
  const b = deal(per(A('7', 'KES'), A('3', 'piece')), A('3', 'piece'), A('7', 'KES'));
  check('price counted', 'pays 7: paid', [am(b.st.paid), b.st.paid_at !== null], ['7 KES', true]);
  const c = deal(per(A('7', 'KES'), A('0', 'piece')), A('3', 'piece'), A('7', 'KES'));
  check('price counted', 'a per of zero has no total: never paid', [c.st.total, c.st.paid_at !== null], [null, false]);
  const d = deal(per(A('7', 'KES'), A('3', 'piece')), A('3', 'kg'), A('7', 'KES'));
  check('price counted', 'a quantity not in per\'s unit has no total', d.st.total, null);
}
// What a fold prints. World: Mama's price 10 per 3; Leila takes 2: terms_total 20/3. A total of 41 places prints.
{
  const t = fb.door('terms_total', { lines: [{ id: 'goods', price: per(A('10', 'KES'), A('3', 'piece')), quantity: A('3', 'piece') }] }, [{ id: 'goods', quantity: A('2', 'piece') }]);
  check('what a fold prints', '10 per 3, takes 2: 20/3 (lowest terms, never rounded, never null)', am(t), '20/3 KES');
  // each signed figure is within 40 digits; their product has 41 places and prints whole
  const t2 = fb.door('terms_total', { lines: [{ id: 'goods', price: per(A('1.00001', 'KES'), A('1', 'piece')), quantity: A('1', 'piece') }] }, [{ id: 'goods', quantity: A('0.' + '1'.repeat(36), 'piece') }]);
  const exact = (BigInt('1'.repeat(36)) * 100001n).toString().padStart(41, '0');
  check('what a fold prints', 'a total of 41 places prints (no cap, not null)', t2 && t2.value, '0.' + exact);
  const t3 = fb.door('terms_total', { lines: [{ id: 'goods', price: per(A('1', 'KES'), A('6', 'piece')), quantity: A('6', 'piece') }] }, [{ id: 'goods', quantity: A('4', 'piece') }]);
  check('what a fold prints', '4 over 6 prints 2/3', t3 && t3.value, '2/3');
}
// step. World: (1) Mama M1, 3 mandazi for KSh 10, step 1 KES. (2) Leila takes 2: total 7. (3) Leila pays 7: paid. Harry's tonne at 285.50, 23.457 t, step 0.01: total 6,696.98.
{
  const a = deal(per(A('10', 'KES'), A('3', 'piece')), A('2', 'piece'), A('7', 'KES'), { step: A('1', 'KES') });
  check('step', 'takes 2 of 3 for 10, step 1: total 7 (6.67 up to the step), paid by 7', [am(a.st.total), am(a.st.paid), a.st.paid_at !== null], ['7 KES', '7 KES', true]);
  const b = deal(per(A('10', 'KES'), A('3', 'piece')), A('2', 'piece'), A('6', 'KES'), { step: A('1', 'KES') });
  check('step', 'paying 6 is not enough', [am(b.st.total), am(b.st.paid), b.st.paid_at !== null], ['7 KES', '6 KES', false]);
  const t = fb.door('terms_total', { lines: [{ id: 'goods', price: per(A('285.50', 'GBP'), A('1', 't')), quantity: A('30', 't') }], step: A('0.01', 'GBP') }, [{ id: 'goods', quantity: A('23.457', 't') }]);
  check('step', 'Harry\'s tonne: 285.50 x 23.457 = 6696.9735, step 0.01: 6696.98', am(t), '6696.98 GBP');
  const t2 = fb.door('terms_total', { lines: [{ id: 'goods', price: per(A('285.50', 'GBP'), A('1', 't')), quantity: A('30', 't') }] }, [{ id: 'goods', quantity: A('23.457', 't') }]);
  check('step', 'with no step the total is exact', am(t2), '6696.9735 GBP');
}
done();
