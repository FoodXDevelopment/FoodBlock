// G1, bookkeeper (T2-6). Maria M1 sells Sam 10 loaves (deal D1, accepted); Maria M2 sells Ben 4 loaves (deal D2). Maria M3 grant to bookkeeper K, types [observe.paid], on [D1], refs.meter K's key grant.
// K1 signs paid on D1: speaks for Maria. K2 signs paid on D2: not_kept; D2's price is still to come to Maria.
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, A, kindOf, instance, promise, accepts, GBP, per, grant, whyOf, ok, backedBy } = L;
const w = new World(); const maria = P(w, 'maria'), sam = P(w, 'sam'), ben = P(w, 'ben'), k = P(w, 'bookkeeper');
const loaf = kindOf(maria, 'loaf'), l1 = instance(maria, loaf, { pack: A('10', 'loaf') }), l2 = instance(maria, loaf, { pack: A('4', 'loaf') });
const D1 = T(promise(maria, { from: maria.id, to: sam.id, what: l1.hash }, { quantity: A('10', 'loaf'), price: per(3, 'GBP', 'loaf') }), 'D1'); accepts(sam, D1);
const D2 = T(promise(maria, { from: maria.id, to: ben.id, what: l2.hash }, { quantity: A('4', 'loaf'), price: per(3, 'GBP', 'loaf') }), 'D2'); accepts(ben, D2);
const M3 = T(grant(maria, k, { types: ['observe.paid'], on: [D1.hash] }, { meter: k.id }), 'M3');
const K1 = T(k.write('observe', { kind: 'paid' }, { subject: D1.hash, under: M3.hash }), 'K1'), K2 = T(k.write('observe', { kind: 'paid' }, { subject: D2.hash, under: M3.hash }), 'K2');
check('G1 bookkeeper', 'K1 signs paid on D1: speaks for Maria', [ok(K1, w), fb.door('speaks_for', K1, w.blocks) === maria.id], [true, true]);
check('G1 bookkeeper', 'K2 signs paid on D2: the code', whyOf(K2, w), { code: 'not_kept', why: null });
check('G1 bookkeeper', 'K2 speaks for the bookkeeper alone, so D2\'s price is still to come to Maria (paid stays null)', [fb.door('speaks_for', K2, w.blocks) === k.id, fb.door('promise_stage', D2, w.blocks).paid], [true, null]);
done();
