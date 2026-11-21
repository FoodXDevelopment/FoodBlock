// G6, limit on one line. W, meter the AI's own key grant. Five accepts of £210 offers in a row: first true, four past. An accept of a price fixed later with no max: takes nothing (unit).
// Weekly every, until set: an accept nine days on, in a new period: true.
const L = require('./lib.cjs'); const { fb, T, check, done, baseWorld, whyOf, A, GBP, per, promise, instance, grant, day, ok } = L;
const W = baseWorld({ meter: 'own' }); const { w, amara, harry, ai, G, A1, F } = W;
const accs = []; for (let i = 0; i < 5; i++) { const o = W.offer(harry, 21, {}, 'H' + i); accs.push(W.accept(o, 210, 'I' + i)); }
check('G6', 'five accepts of £210 offers in a row', accs.map(a => (whyOf(a, w) ? whyOf(a, w).code : true)), [true, 'past', 'past', 'past', 'past']);
// a price fixed later with no max
const fig = { figure: 'wheat', by: [W.n0.id], signers: 1, deadline: day(3), clocks: { names: [W.n0.id], needed: 1 } };
const A7 = T(promise(amara, { to: amara.id, what: F.hash }, { quantity: A('10', 'sack'), price: fig }), 'A7');
const G7 = T(grant(amara, ai, { types: ['promise'], on: [A7.hash], parties: [harry.id], limit: GBP(210) }, { meter: ai.id }), 'G7');
const inst = instance(harry, F, { pack: A('10', 'sack') });
const H7 = T(promise(harry, { from: harry.id, to: amara.id, what: inst.hash }, { quantity: A('10', 'sack'), price: fig }), 'H7');
const x = W.accept(H7, 210, 'x7', G7);
check('G6', 'an accept of a price fixed later with no max', whyOf(x, w), { code: 'unit', why: null });
// weekly
// her want for at most 70 sacks: `every` renews only the limit, never her quantity
const A8 = T(promise(amara, { to: amara.id, what: F.hash }, { quantity: { max: A('70', 'sack') }, price: { max: per(21, 'GBP', 'sack') }, pay_by: { min: 'P3D' }, deliver_by: W.friday }), 'A8');
const G8 = T(grant(amara, ai, { types: ['promise'], on: [A8.hash], parties: [harry.id], limit: GBP(210), every: 'P7D', until: day(60) }, { meter: ai.id }), 'G8');
const o1 = W.offer(harry, 21, {}, 'w1'), o2 = W.offer(harry, 21, {}, 'w2'), o3 = W.offer(harry, 21, {}, 'w3');
const a1 = W.accept(o1, 210, 'wa1', G8), a2 = W.accept(o2, 210, 'wa2', G8);
const cut = T(ai.write('observe', { kind: 'cutoff', when: 'P7D' }, { subject: G8.hash, derives_from: a1.hash }), 'cut');
const a3 = W.accept(o3, 210, 'wa3', G8, ai, { state: { at: day(11) } });
check('G6', 'weekly every: the first, a second in the same period, a third after the cutoff (a new period)', [whyOf(a1, w), whyOf(a2, w) && whyOf(a2, w).code, whyOf(a3, w)], [null, 'past', null]);
done();
