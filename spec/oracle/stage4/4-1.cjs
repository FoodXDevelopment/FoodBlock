// G1, one rule (section 5, story 1). W. Harry H1 offers 10 sacks F at £20.50, pay_by P4D. AI I1 accepts H1: under_ok true, backed(Amara) true. Ravi R1, same terms; I2 accepts R1: not_live (side not in parties).
// I3 accepts a counter of Harry that adds state.where: not_kept, why state.where.
const L = require('./lib.cjs'); const { fb, T, check, done, baseWorld, why, whyOf, ok, backedBy, A, promise, instance, GBP, per } = L;
const W = baseWorld(); const { w, amara, harry, ravi, ai, G, F } = W;
const H1 = W.offer(harry, 20.5, {}, 'H1'), I1 = W.accept(H1, 205, 'I1'); W.receipt(I1, 205, 'N1');
check('G1', 'I1 accepts H1: under_ok', ok(I1, w), true);
check('G1', 'I1 accepts H1: backed(Amara)', backedBy(I1, amara, w).backed, true);
const R1 = W.offer(W.ravi, 20.5, {}, 'R1'), I2 = W.accept(R1, 205, 'I2');
check('G1', 'I2 accepts Ravi\'s R1 (a side outside parties): the code', whyOf(I2, w), { code: 'not_live', why: null });
const inst = instance(harry, F, { pack: A('10', 'sack') });
const where = { lat: '51.5', lon: '-0.1' };
const C1 = T(harry.write('promise', { terms: { quantity: A('10', 'sack'), price: per(20.5, 'GBP', 'sack'), pay_by: 'P4D', deliver_by: W.friday }, where }, { from: harry.id, to: amara.id, what: inst.hash, answers: H1.hash, for: H1.hash }), 'C1');
const I3 = W.accept(C1, 205, 'I3');
check('G1', 'I3 accepts a counter that adds state.where: the code and the path', whyOf(I3, w), { code: 'not_kept', why: 'state.where' });
done();
