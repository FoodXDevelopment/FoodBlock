// A two-key link. Wanjiru's host key WK and Harry's till key T sign a two-key link (both keys). Harry's grant to T on his open offer HO, side open. WK orders 10 sacks; T1 allocates to WK: both_sides. Without the link: true.
// (The grant lists WK in parties, as a grant must for a side it deals with.)
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, A, kindOf, instance, promise, GBP, per, grant, whyOf } = L;
const w = new World(); const harry = P(w, 'harry'), tk = P(w, 'till'), wk = P(w, 'wanjiru-host');
const F = kindOf(harry, 'flour'), inst = instance(harry, F, { pack: A('10', 'sack') });
const HO = T(promise(harry, { from: harry.id }, { lines: [{ id: 'flour', what: inst.hash, quantity: A('10', 'sack'), price: per(20, 'GBP', 'sack') }] }), 'HO');
const GH = T(grant(harry, tk, { types: ['promise'], on: [HO.hash], parties: [wk.id] }, { meter: tk.id }), 'GH');
const order = T(wk.write('promise', { status: 'accepted', terms: { lines: [{ id: 'flour', quantity: A('10', 'sack') }] } }, { answers: HO.hash, for: HO.hash }), 'order');
const T1 = T(tk.write('promise', { status: 'accepted' }, { answers: order.hash, for: HO.hash, under: GH.hash }), 'T1');
const before = w.blocks.slice();
check('two-key link', 'without the link: T1 allocates to WK', whyOf(T1, { blocks: before }), null);
const l1 = T(wk.write('observe', { kind: 'link' }, { same_as: tk.id }), 'link-WK');
const l2 = T(tk.write('observe', { kind: 'link' }, { same_as: wk.id, confirms: l1.hash }), 'link-T');
check('two-key link', 'with the link (both keys): the code', whyOf(T1, w), { code: 'both_sides', why: null });
const one = [...before, l1];
check('two-key link', 'one signature is only its author\'s word: with the first link alone it is still true', whyOf(T1, { blocks: one }), null);
done();
