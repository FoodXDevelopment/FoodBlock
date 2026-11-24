// Keeps to, item 6 and "fully stated". W. Harry's AI H2 offers price { min: £19, max: £21 }: not_kept, why terms.price. H3 at £20, pay_by P1D: not_kept (P1D not inside { min: P3D }).
// Amara's want for flour and sugar; Harry H4 offers flour alone: not_kept (item 5). A want with no pay_by; Harry's offer stating one: not_kept.
const L = require('./lib.cjs'); const { fb, T, check, done, baseWorld, whyOf, A, promise, instance, kindOf, GBP, per, wf } = L;
const W = baseWorld(); const { w, amara, harry, ai, F, A1 } = W;
const keeps = (C, A) => fb.door('keeps_to', C, A, w.blocks);
const H1 = W.offer(harry, 20.5, {}, 'H1');
check('Keeps to', 'control: H1 (a value inside the range, P4D inside { min: P3D }) keeps to the want', keeps(H1, A1), { keeps: true, why: null });
const H2 = W.offer(harry, 20, { terms: { price: { min: per(19, 'GBP', 'sack'), max: per(21, 'GBP', 'sack') } } }, 'H2'); // a range where a value is needed: C is always fully stated
check('Keeps to', 'H2 offers price { min: £19, max: £21 }: keeps_to', keeps(H2, A1), { keeps: false, why: 'terms.lines.flour.price' });
const I2 = W.accept(H2, 210, 'I2');
check('Keeps to', 'I accepts H2: the code and the path', whyOf(I2, w), { code: 'not_kept', why: 'terms.lines.flour.price' });
const H3 = W.offer(harry, 20, { terms: { pay_by: 'P1D' } }, 'H3');
check('Keeps to', 'H3 at £20, pay_by P1D (not inside { min: P3D }): keeps_to', keeps(H3, A1), { keeps: false, why: 'terms.pay_by' });
check('Keeps to', 'both ends are counted: a price of exactly £21 and a pay_by of exactly P3D keep', keeps(W.offer(harry, 21, { terms: { pay_by: 'P3D' } }, 'H3b'), A1), { keeps: true, why: null });
// a want for flour and sugar
const S = kindOf(amara, 'sugar');
const A2 = T(promise(amara, { to: amara.id }, { lines: [{ id: 'flour', what: F.hash, quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') } }, { id: 'sugar', what: S.hash, quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') } }] }), 'A2');
const flour = instance(harry, F, { pack: A('10', 'sack') }), sugar = instance(harry, S, { pack: A('10', 'sack') });
const H4 = T(promise(harry, { from: harry.id, to: amara.id }, { lines: [{ id: 'flour', what: flour.hash, quantity: A('10', 'sack'), price: per(20, 'GBP', 'sack') }] }), 'H4');
check('Keeps to', 'a want for flour and sugar, an offer of flour alone (each kind has an instance): keeps_to', keeps(H4, A2), { keeps: false, why: 'terms.lines.sugar' });
const H4b = T(promise(harry, { from: harry.id, to: amara.id }, { lines: [{ id: 'flour', what: flour.hash, quantity: A('10', 'sack'), price: per(20, 'GBP', 'sack') }, { id: 'sugar', what: sugar.hash, quantity: A('10', 'sack'), price: per(20, 'GBP', 'sack') }] }), 'H4b');
check('Keeps to', 'control: an offer of both kinds keeps', keeps(H4b, A2), { keeps: true, why: null });
// a want with no pay_by
const A3 = T(promise(amara, { to: amara.id }, { lines: [{ id: 'flour', what: F.hash, quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') } }] }), 'A3');
const H5 = W.offer(harry, 20, { terms: { pay_by: 'P4D', deliver_by: undefined } }, 'H5');
check('Keeps to', 'a want with no pay_by, an offer stating one: keeps_to', keeps(H5, A3), { keeps: false, why: 'terms.pay_by' });
// a list: one of the listed values
const A4 = T(promise(amara, { to: amara.id }, { lines: [{ id: 'flour', what: F.hash, quantity: { one_of: [A('5', 'sack'), A('10', 'sack')] }, price: { max: per(21, 'GBP', 'sack') } }] }), 'A4');
check('Keeps to', 'a list { one_of: [5 sacks, 10 sacks] }: 10 sacks is listed, 7 sacks is not', [keeps(W.offer(harry, 20, { terms: { pay_by: undefined, deliver_by: undefined } }, 'H6a'), A4).keeps, keeps(W.offer(harry, 20, { terms: { quantity: A('7', 'sack'), pay_by: undefined, deliver_by: undefined } }, 'H6b'), A4)], [true, { keeps: false, why: 'terms.lines.flour.quantity' }]);
// a range or a list outside its places is shape
const bad = T(promise(amara, { to: amara.id }, { lines: [{ id: 'flour', what: F.hash, quantity: A('10', 'sack'), price: per(20, 'GBP', 'sack') }], expires: { min: day0() } }), 'BAD'); function day0() { return '2026-11-02T00:00:00.000Z'; }
check('Keeps to', 'a range at a place that is not a set place (terms.expires) is refused', wf(bad, w).includes('shape') || wf(bad, w), true);
done();
